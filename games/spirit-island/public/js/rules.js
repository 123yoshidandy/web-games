/**
 * スピリット・アイランドのルール（盤面の状態 s を変える関数）
 * DOM も乱数の持ち方も知らない。乱数が要る所（山を切る・カードを引く）は ctx.random を使う
 * ctx = { s, random, log(text, kind), event(e) }。CPU の先読みでは log と event を空にして、状態の写しで試す
 */

import {
    BOARDS, BOARD_LETTERS, LAYOUTS, LOCAL_ADJ, COASTAL, SPIRITS, CARD, INNATE, CONDITIONS,
    INVADER_CARD, INVADER_CARDS, STAGE_COUNTS, INVADER_HEALTH, INVADER_DAMAGE, INVADER_NAMES, DAHAN_HEALTH, DAHAN_DAMAGE,
    LEVELS, FEAR_CARDS, FEAR_CARD, MINOR_CARDS, MAJOR_CARDS, ELEMENTS, invaderCardName
} from './data.js';
import { shuffle } from './random.js';

// ---- 島の形 ----

const topologyCache = new Map();

// ボードの枚数ごとの、土地のとなりと距離（状態には入れず、枚数から作る）
export function topology(n) {
    if (topologyCache.has(n)) return topologyCache.get(n);
    const count = n * 8;
    const adj = Array.from({ length: count }, () => new Set());
    const id = (board, num) => board * 8 + num - 1;
    for (let b = 0; b < n; b++) {
        Object.entries(LOCAL_ADJ).forEach(([num, list]) => list.forEach(other => adj[id(b, Number(num))].add(id(b, other))));
    }
    LAYOUTS[n].links.forEach(([b1, l1, b2, l2]) => {
        adj[id(b1, l1)].add(id(b2, l2));
        adj[id(b2, l2)].add(id(b1, l1));
    });
    const lists = adj.map(set => [...set].sort((a, b) => a - b));
    const dist = lists.map((_, from) => {
        const d = Array(count).fill(Infinity);
        d[from] = 0;
        const queue = [from];
        while (queue.length) {
            const x = queue.shift();
            lists[x].forEach(y => {
                if (d[y] === Infinity) {
                    d[y] = d[x] + 1;
                    queue.push(y);
                }
            });
        }
        return d;
    });
    const result = { adj: lists, dist, places: LAYOUTS[n].places };
    topologyCache.set(n, result);
    return result;
}

export const landName = (s, id) => `${BOARD_LETTERS[s.lands[id].board]}${s.lands[id].num}`;
// 恐怖の段階：得た恐怖カードが山の3分の1・3分の2に届くと上がる
export const terrorLevel = (s) => {
    const per = s.fear.total / 3;
    return s.fear.earnedCount >= per * 2 ? 3 : s.fear.earnedCount >= per ? 2 : 1;
};
export const countInv = (L, k) => L.inv.filter(i => i.k === k).length;
export const presenceTotal = (L) => L.presence.reduce((a, b) => a + b, 0);
const silent = (s) => ({ s, random: () => 0, log() {}, event() {} });

// ---- 準備 ----

export function createState(players, options, random) {
    const n = players.length;
    const level = LEVELS[options.level] ? options.level : 'normal';
    const keys = options.spirits;
    const s = {
        n, level,
        lands: [],
        spirits: [],
        phase: 'spirit',
        turn: 1,
        invader: { deck: [], ravage: null, build: null, explored: null, discard: [] },
        fear: { pool: LEVELS[level].fearPerPlayer * n, gen: 0, earned: [], deck: [], earnedCount: 0, resolved: [], total: LEVELS[level].fearCards },
        blight: { pool: LEVELS[level].blightPerPlayer * n + 1, flipped: false },
        minor: { deck: shuffle([...MINOR_CARDS], random), discard: [] },
        major: { deck: shuffle([...MAJOR_CARDS], random), discard: [] },
        turnFlags: {},
        result: null
    };
    const topo = topology(n);
    for (let b = 0; b < n; b++) {
        const board = BOARDS[b];
        for (let num = 1; num <= 8; num++) {
            const id = b * 8 + num - 1;
            const setup = { ...(board.setup[num] ?? {}) };
            s.lands.push({
                id, board: b, num,
                terrain: board.terrain[num - 1],
                coastal: COASTAL.includes(num),
                adj: topo.adj[id],
                inv: [
                    ...Array(setup.C ?? 0).fill(0).map(() => ({ k: 'C', hp: INVADER_HEALTH.C })),
                    ...Array(setup.T ?? 0).fill(0).map(() => ({ k: 'T', hp: INVADER_HEALTH.T })),
                    ...Array(setup.E ?? 0).fill(0).map(() => ({ k: 'E', hp: INVADER_HEALTH.E }))
                ],
                dahan: Array(setup.D ?? 0).fill(DAHAN_HEALTH),
                blight: setup.B ?? 0,
                presence: Array(n).fill(0),
                defend: 0,
                flags: {}
            });
        }
    }
    keys.forEach((key, seat) => {
        const def = SPIRITS[key];
        def.setup.forEach(([where, count]) => {
            const land = typeof where === 'number'
                ? s.lands[seat * 8 + where - 1]
                : s.lands.filter(L => L.board === seat && L.terrain === where).at(-1);
            land.presence[seat] += count;
        });
        s.spirits.push({
            key, seat,
            energy: 0,
            hand: [...def.hand], discard: [], played: [], forgotten: [],
            used: [],
            energyIdx: 1, cardIdx: 1, destroyed: 0,
            swift: 0, swiftUsed: 0, repeat: null,
            step: 'growth', queue: [], prompt: null, done: false, growthChoice: null
        });
    });
    // 侵略者の山：段階ごとに切って、I・II・III の順に重ねる
    [1, 2, 3].forEach((stage, i) => {
        const cards = shuffle(INVADER_CARDS.filter(c => c.stage === stage).map(c => c.id), random);
        s.invader.deck.push(...cards.slice(0, STAGE_COUNTS[i]));
    });
    s.fear.deck = shuffle(FEAR_CARDS.map(f => f.id), random).slice(0, s.fear.total);
    return s;
}

// 準備の最後：最初の侵略者カードで探検し、建設の欄へ進める
export function firstExplore(ctx) {
    const { s } = ctx;
    const cardId = s.invader.deck.shift();
    ctx.log(`侵略者が上陸した（${invaderCardName(cardId)}）`, 'invader');
    explore(ctx, cardId);
    s.invader.build = cardId;
    s.invader.explored = cardId;
}

// ---- 精霊の値 ----

export function elementsOf(s, seat) {
    const counts = Object.fromEntries(ELEMENTS.map(e => [e, 0]));
    s.spirits[seat].played.forEach(id => CARD[id].elements.forEach(e => { counts[e]++; }));
    return counts;
}

export const meets = (elements, need) => Object.entries(need).every(([e, n]) => elements[e] >= n);

export function energyValue(s, seat) {
    const sp = s.spirits[seat];
    return SPIRITS[sp.key].energy[sp.energyIdx - 1];
}

export function cardPlays(s, seat) {
    const sp = s.spirits[seat];
    return SPIRITS[sp.key].cards.slice(0, sp.cardIdx).filter(v => typeof v === 'number').at(-1);
}

export const hasReclaimOne = (s, seat) => SPIRITS[s.spirits[seat].key].cards.slice(0, s.spirits[seat].cardIdx).includes('R');

export function innateLevel(s, seat) {
    const innate = SPIRITS[s.spirits[seat].key].innate;
    const el = elementsOf(s, seat);
    let level = 0;
    innate.levels.forEach((lv, i) => { if (meets(el, lv.need)) level = i + 1; });
    return level;
}

export function isSacred(s, seat, L) {
    const p = L.presence[seat];
    if (p >= 2) return true;
    return p >= 1 && s.spirits[seat].key === 'river' && L.terrain === 'W';
}

export const presenceLands = (s, seat) => s.lands.filter(L => L.presence[seat] > 0).map(L => L.id);
export const onIsland = (s, seat) => s.lands.reduce((a, L) => a + L.presence[seat], 0);

// 置ける存在が残っているか（列か、壊された分）
export function presenceSources(s, seat) {
    const sp = s.spirits[seat];
    const def = SPIRITS[sp.key];
    const list = [];
    if (sp.energyIdx < def.energy.length) list.push('energy');
    if (sp.cardIdx < def.cards.length) list.push('cards');
    if (sp.destroyed > 0) list.push('destroyed');
    return list;
}

export function landsInRange(s, seat, n, from = 'presence') {
    const { dist } = topology(s.n);
    const sources = s.lands.filter(L => (from === 'sacred' ? isSacred(s, seat, L) : L.presence[seat] > 0)).map(L => L.id);
    return s.lands.filter(L => sources.some(src => dist[src][L.id] <= n)).map(L => L.id);
}

// ---- 恐怖と荒廃 ----

export function fear(ctx, n) {
    const { s } = ctx;
    if (n <= 0 || s.result) return;
    s.fear.gen += n;
    ctx.event({ type: 'fear', n });
    while (s.fear.gen >= s.fear.pool && !s.result) {
        s.fear.gen -= s.fear.pool;
        const before = terrorLevel(s);
        const cardId = s.fear.deck.shift();
        s.fear.earned.push(cardId);
        s.fear.earnedCount++;
        ctx.log('恐怖カードを1枚得た', 'fear');
        if (s.fear.deck.length === 0) {
            endGame(ctx, true, 'fear');
            return;
        }
        if (terrorLevel(s) > before) ctx.log(`恐怖の段階が ${terrorLevel(s)} に上がった`, 'fear');
    }
    checkVictory(ctx);
}

function takeBlight(ctx) {
    const { s } = ctx;
    s.blight.pool--;
    if (s.blight.pool <= 0) {
        if (s.blight.flipped) {
            endGame(ctx, false, 'blight');
            return;
        }
        s.blight.flipped = true;
        s.blight.pool += LEVELS[s.level].blightedPerPlayer * s.n;
        ctx.log(`島が荒れ果てた。荒廃カードが裏返り、荒廃が ${LEVELS[s.level].blightedPerPlayer * s.n} 足された`, 'blight');
    }
}

// 荒廃を1つ置く。すでに荒廃があれば、となりの土地へ連鎖する（連鎖先は自動で選ぶ）
export function addBlight(ctx, id, depth = 0) {
    const { s } = ctx;
    if (s.result) return;
    const L = s.lands[id];
    const had = L.blight > 0;
    takeBlight(ctx);
    if (s.result) return;
    L.blight++;
    ctx.event({ type: 'blight', land: id });
    ctx.log(`${landName(s, id)} に荒廃${depth ? '（連鎖）' : ''}`, 'blight');
    s.spirits.forEach((sp, seat) => {
        if (L.presence[seat] > 0) {
            L.presence[seat]--;
            sp.destroyed++;
            ctx.log(`${SPIRITS[sp.key].short}の存在が1つ壊された`, 'blight');
            if (onIsland(s, seat) === 0) endGame(ctx, false, 'presence');
        }
    });
    if (s.result || !had || depth > 30) return;
    const next = [...L.adj].sort((a, b) => cascadeScore(s, a) - cascadeScore(s, b) || a - b)[0];
    if (next !== undefined) addBlight(ctx, next, depth + 1);
}

// 連鎖先の選び方：荒廃のない土地を選ぶ。となりがすべて荒廃していれば、荒廃のない土地へいちばん近い方へ流す
// 同じ近さなら、存在とダハンが少ない土地
const cascadeScore = (s, id) => {
    const L = s.lands[id];
    const { dist } = topology(s.n);
    const clean = s.lands.filter(M => M.blight === 0).map(M => dist[id][M.id]);
    const away = L.blight > 0 ? 1 + (clean.length ? Math.min(...clean) : 99) : 0;
    return away * 100 + presenceTotal(L) * 10 + L.dahan.length;
};

export function removeBlight(ctx, id, n = 1) {
    const { s } = ctx;
    const L = s.lands[id];
    const k = Math.min(n, L.blight);
    L.blight -= k;
    s.blight.pool += k;
    if (k) ctx.log(`${landName(s, id)} の荒廃を${k}つ取り除いた`, 'spirit');
    return k;
}

// ---- 勝ち負け ----

export function endGame(ctx, won, reason) {
    const { s } = ctx;
    if (s.result) return;
    s.result = { won, reason };
    ctx.log(won ? '侵略者を退けた。精霊たちの勝ち' : '島は失われた。精霊たちの負け', won ? 'win' : 'lose');
}

export function checkVictory(ctx) {
    const { s } = ctx;
    if (s.result) return;
    const tl = terrorLevel(s);
    const all = s.lands.flatMap(L => L.inv);
    const ok = tl === 1 ? all.length === 0 : tl === 2 ? !all.some(i => i.k !== 'E') : !all.some(i => i.k === 'C');
    if (ok) endGame(ctx, true, 'terror');
}

// ---- 駒の操作 ----

function destroyPiece(ctx, L, piece) {
    const i = L.inv.indexOf(piece);
    if (i < 0) return;
    L.inv.splice(i, 1);
    ctx.event({ type: 'destroy', land: L.id, k: piece.k });
    if (piece.k === 'T') fear(ctx, 1);
    if (piece.k === 'C') fear(ctx, 2);
}

// 侵略者に n ダメージ。割り振りは自動（都市・町・探検者の順に、倒せるものから倒す）。倒した駒の種類の一覧を返す
export function damageInvaders(ctx, id, n, kinds = ['C', 'T', 'E']) {
    const L = ctx.s.lands[id];
    let left = n;
    const killed = [];
    for (const k of ['C', 'T', 'E']) {
        if (!kinds.includes(k)) continue;
        const pieces = L.inv.filter(p => p.k === k).sort((a, b) => a.hp - b.hp);
        for (const p of pieces) {
            if (p.hp <= left) {
                left -= p.hp;
                killed.push(k);
                destroyPiece(ctx, L, p);
            }
        }
    }
    if (left > 0) {
        const rest = L.inv.filter(p => kinds.includes(p.k)).sort((a, b) => b.hp - a.hp)[0];
        if (rest) rest.hp -= Math.min(left, rest.hp - 1);
    }
    return killed;
}

export function destroyKind(ctx, id, k, count) {
    const L = ctx.s.lands[id];
    let done = 0;
    while (done < count) {
        const piece = L.inv.filter(p => p.k === k).sort((a, b) => a.hp - b.hp)[0];
        if (!piece) break;
        destroyPiece(ctx, L, piece);
        done++;
    }
    return done;
}

function removeKind(L, k, count) {
    let done = 0;
    while (done < count) {
        const i = L.inv.findIndex(p => p.k === k);
        if (i < 0) break;
        L.inv.splice(i, 1);
        done++;
    }
    return done;
}

function killDahan(ctx, L, damage) {
    let left = damage;
    const sorted = [...L.dahan].sort((a, b) => a - b);
    const survivors = [];
    let killed = 0;
    sorted.forEach(hp => {
        if (hp <= left) {
            left -= hp;
            killed++;
        } else survivors.push(hp);
    });
    if (left > 0 && survivors.length) survivors[survivors.length - 1] -= left;
    L.dahan = survivors;
    if (killed) ctx.event({ type: 'dahanDie', land: L.id, n: killed });
    return killed;
}

// 押し出す先の自動の選び方：存在・ダハンが少なく、荒らしの近い土地でないところ
export function autoDest(s, from) {
    const L = s.lands[from];
    const score = (id) => {
        const D = s.lands[id];
        return presenceTotal(D) * 3 + D.dahan.length * 2 + (matchesCard(s, D, s.invader.build) ? 2 : 0) + (D.blight ? 1 : 0);
    };
    return [...L.adj].sort((a, b) => score(a) - score(b) || a - b)[0];
}

// 駒を押し出す（kinds の順に選ぶ。'D' はダハン）。動かした数を返す
export function pushPieces(ctx, from, kinds, max, dest) {
    const { s } = ctx;
    const L = s.lands[from];
    const to = s.lands[dest];
    if (!to || !L.adj.includes(dest)) return 0;
    let moved = 0;
    for (const k of kinds) {
        while (moved < max) {
            if (k === 'D') {
                if (!L.dahan.length) break;
                to.dahan.push(L.dahan.pop());
            } else {
                const i = L.inv.findIndex(p => p.k === k);
                if (i < 0) break;
                to.inv.push(L.inv.splice(i, 1)[0]);
            }
            moved++;
        }
    }
    if (moved) {
        ctx.event({ type: 'move', from, to: dest, n: moved });
        ctx.log(`${landName(s, from)} から ${landName(s, dest)} へ${moved}つ押し出した`, 'spirit');
    }
    return moved;
}

export function gatherPieces(ctx, to, kinds, max) {
    const { s } = ctx;
    const L = s.lands[to];
    const has = (id) => kinds.reduce((a, k) => a + (k === 'D' ? s.lands[id].dahan.length : countInv(s.lands[id], k)), 0);
    let moved = 0;
    const sources = [...L.adj].sort((a, b) => has(b) - has(a) || a - b);
    for (const src of sources) {
        const S = s.lands[src];
        for (const k of kinds) {
            while (moved < max) {
                if (k === 'D') {
                    if (!S.dahan.length) break;
                    L.dahan.push(S.dahan.pop());
                } else {
                    const i = S.inv.findIndex(p => p.k === k);
                    if (i < 0) break;
                    L.inv.push(S.inv.splice(i, 1)[0]);
                }
                moved++;
            }
        }
    }
    if (moved) {
        ctx.event({ type: 'move', to, n: moved });
        ctx.log(`${landName(s, to)} へ${moved}つ集めた`, 'spirit');
    }
    return moved;
}

const pushable = (L, kinds) => kinds.some(k => (k === 'D' ? L.dahan.length > 0 : L.inv.some(p => p.k === k)));

// ---- 力を使う ----

// 力の効果に渡す道具
function helpers(ctx, { seat, land, target, dest }) {
    const { s } = ctx;
    const el = elementsOf(s, seat);
    const h = {
        seat, target, land,
        get L() { return s.lands[land]; },
        get dest() { return dest ?? autoDest(s, land); },
        at: (id) => s.lands[id],
        has: (need) => meets(el, need),
        fear: (n) => fear(ctx, n),
        damage: (n) => damageInvaders(ctx, land, n),
        damageAt: (id, n) => damageInvaders(ctx, id, n),
        damageEach: (n) => {
            const L = s.lands[land];
            [...L.inv].forEach(p => {
                if (!L.inv.includes(p)) return;
                if (p.hp <= n) destroyPiece(ctx, L, p);
                else p.hp -= n;
            });
        },
        destroy: (k, count) => destroyKind(ctx, land, k, count),
        destroyBuildings: (count) => {
            let left = count;
            left -= destroyKind(ctx, land, 'C', left);
            destroyKind(ctx, land, 'T', left);
        },
        push: (kinds, max) => pushPieces(ctx, land, kinds, max, h.dest),
        gather: (kinds, max) => gatherPieces(ctx, land, kinds, max),
        defend: (n) => { s.lands[land].defend += n; },
        addDahan: (n) => { for (let i = 0; i < n; i++) s.lands[land].dahan.push(DAHAN_HEALTH); },
        removeBlight: (n) => removeBlight(ctx, land, n),
        flag: (name) => { s.lands[land].flags[name] = true; },
        replace: (from, to) => {
            const L = s.lands[land];
            const i = L.inv.findIndex(p => p.k === from);
            if (i < 0) return false;
            L.inv[i] = { k: to, hp: INVADER_HEALTH[to] };
            return true;
        },
        adjacent: () => [...s.lands[land].adj],
        sameBoardCoastal: () => s.lands.filter(L => L.board === s.lands[land].board && L.coastal && L.id !== land).map(L => L.id),
        gainEnergy: (who, n) => { s.spirits[who].energy += n; },
        playedCount: (who) => s.spirits[who].played.length,
        grantSwift: (who, n) => { s.spirits[who].swift += n; },
        grantRepeat: (who, cost) => {
            const sp = s.spirits[who];
            sp.repeat = { cost: Math.max(cost, sp.repeat?.cost ?? 0), used: false };
        },
        spiritPush: (who) => {
            const lands = s.lands.filter(L => L.presence[who] > 0 && pushable(L, ['T', 'E']))
                .sort((a, b) => b.inv.length - a.inv.length || a.id - b.id);
            if (!lands.length) return;
            const from = lands[0].id;
            const to = autoDest(s, from);
            pushPieces(ctx, from, ['T'], 1, to);
            pushPieces(ctx, from, ['E'], 1, to);
        }
    };
    return h;
}

// 力の情報（'c:<カード>'・'i:<生まれ持つ力>'・'r:<くり返すカード>'）
export function powerInfo(s, seat, power) {
    const [kind, id] = String(power).split(':');
    if (kind === 'c' || kind === 'r') {
        const c = CARD[id];
        return c ? { kind, id, def: c, speed: c.speed, range: c.range, when: c.when, target: c.target, push: !!c.push, name: c.name } : null;
    }
    if (kind === 'i') {
        const inn = INNATE[id];
        if (!inn || inn.spirit !== s.spirits[seat].key) return null;
        return { kind, id, def: inn, speed: inn.speed, range: inn.range, when: inn.when ?? 'any', target: inn.range ? 'land' : 'spirit', push: !!inn.push, name: inn.name };
    }
    return null;
}

const swiftLeft = (s, seat) => {
    const sp = s.spirits[seat];
    const own = sp.key === 'lightning' ? elementsOf(s, seat).air : 0;
    return own + sp.swift - sp.swiftUsed;
};

// 今のフェイズで使える力の一覧（対象があるものだけ）。[{ power, swift }]
export function availablePowers(s, seat) {
    if (s.result || (s.phase !== 'fast' && s.phase !== 'slow')) return [];
    const sp = s.spirits[seat];
    if (sp.done) return [];
    const list = [];
    const speedOk = (speed) => {
        if (speed === s.phase) return { ok: true, swift: false };
        if (s.phase === 'fast' && speed === 'slow' && swiftLeft(s, seat) > 0) return { ok: true, swift: true };
        return { ok: false };
    };
    sp.played.forEach(id => {
        if (sp.used.includes(`c:${id}`)) return;
        const ok = speedOk(CARD[id].speed);
        if (ok.ok) list.push({ power: `c:${id}`, swift: ok.swift });
    });
    const innate = SPIRITS[sp.key].innate;
    if (!sp.used.includes(`i:${innate.id}`) && innateLevel(s, seat) > 0) {
        const ok = speedOk(innate.speed);
        if (ok.ok) list.push({ power: `i:${innate.id}`, swift: ok.swift });
    }
    if (sp.repeat && !sp.repeat.used) {
        sp.played.forEach(id => {
            if (sp.used.includes(`c:${id}`) && CARD[id].cost <= sp.repeat.cost && speedOk(CARD[id].speed).ok) {
                list.push({ power: `r:${id}`, swift: false });
            }
        });
    }
    return list.filter(p => powerTargets(s, seat, p.power).length > 0);
}

// 力の対象の一覧。土地なら { land, extra }（extra はダハンの影で払うエネルギー）、精霊なら { spirit }
export function powerTargets(s, seat, power) {
    const info = powerInfo(s, seat, power);
    if (!info) return [];
    if (info.target === 'spirit') return s.spirits.map((_, i) => ({ spirit: i }));
    const cond = CONDITIONS[info.when] ?? CONDITIONS.any;
    const inRange = new Set(landsInRange(s, seat, info.range.n, info.range.from));
    const list = [];
    s.lands.forEach(L => {
        if (!cond.test(L, s)) return;
        if (inRange.has(L.id)) list.push({ land: L.id, extra: 0 });
        else if (s.spirits[seat].key === 'shadows' && L.dahan.length > 0 && s.spirits[seat].energy >= 1) list.push({ land: L.id, extra: 1 });
    });
    return list;
}

export function usePower(ctx, seat, { power, land, spirit, dest }) {
    const { s } = ctx;
    const sp = s.spirits[seat];
    const info = powerInfo(s, seat, power);
    const avail = availablePowers(s, seat).find(p => p.power === power);
    const target = powerTargets(s, seat, power).find(t => (info.target === 'spirit' ? t.spirit === spirit : t.land === land));
    if (avail.swift) sp.swiftUsed++;
    if (target.extra) sp.energy -= target.extra;
    if (info.kind === 'r') sp.repeat.used = true;
    else sp.used.push(power);
    const who = info.target === 'spirit' ? `${SPIRITS[s.spirits[spirit].key].short}に` : `${landName(s, land)} に`;
    ctx.log(`${SPIRITS[sp.key].short}：${info.name}${info.kind === 'r' ? '（くり返し）' : ''}を${who}使った`, 'power');
    ctx.event({ type: 'power', seat, power, land, spirit });
    const h = helpers(ctx, { seat, land, target: spirit, dest });
    if (info.kind === 'i') info.def.run(h, innateLevel(s, seat));
    else info.def.run(h);
    checkVictory(ctx);
}

// ---- 侵略者フェイズ ----

export const matchesCard = (s, L, cardId) => {
    if (!cardId) return false;
    const card = INVADER_CARD[cardId];
    return card.coastal ? L.coastal : card.terrains.includes(L.terrain);
};

export function ravage(ctx, cardId) {
    const { s } = ctx;
    s.lands.forEach(L => {
        if (s.result || !matchesCard(s, L, cardId) || !L.inv.length || L.flags.skipAll || L.flags.skipRavage) return;
        const damage = L.inv.reduce((a, p) => a + INVADER_DAMAGE[p.k], 0);
        const vitality = s.spirits.some((sp, seat) => sp.key === 'earth' && isSacred(s, seat, L)) ? 3 : 0;
        const dealt = Math.max(0, damage - L.defend - vitality);
        const parts = [`${dealt}ダメージ`];
        ctx.event({ type: 'ravage', land: L.id, damage: dealt });
        if (dealt >= 2) {
            parts.push('荒廃');
            ctx.log(`${landName(s, L.id)} が荒らされた（${parts.join('・')}）`, 'invader');
            addBlight(ctx, L.id);
        } else ctx.log(`${landName(s, L.id)} が荒らされた（${parts.join('・')}）`, 'invader');
        if (s.result) return;
        if (dealt > 0 && !L.flags.dahanSafe) {
            const killed = killDahan(ctx, L, dealt);
            if (killed) ctx.log(`${landName(s, L.id)} のダハンが${killed}体倒れた`, 'invader');
        }
        if (L.dahan.length && L.inv.length) {
            const killed = damageInvaders(ctx, L.id, L.dahan.length * DAHAN_DAMAGE);
            ctx.log(`${landName(s, L.id)} でダハンが反撃した${killed.length ? `（${killed.map(k => INVADER_NAMES[k]).join('・')}を倒した）` : ''}`, 'dahan');
        }
    });
}

export function build(ctx, cardId) {
    const { s } = ctx;
    if (s.turnFlags.noBuild) return;
    s.lands.forEach(L => {
        if (!matchesCard(s, L, cardId) || !L.inv.length || L.flags.skipAll || L.flags.skipBuild) return;
        const k = countInv(L, 'T') > countInv(L, 'C') ? 'C' : 'T';
        L.inv.push({ k, hp: INVADER_HEALTH[k] });
        ctx.event({ type: 'build', land: L.id, k });
        ctx.log(`${landName(s, L.id)} に${INVADER_NAMES[k]}が建った`, 'invader');
    });
}

export function explore(ctx, cardId) {
    const { s } = ctx;
    if (s.turnFlags.noExplore) return;
    const hasBuilding = (L) => L.inv.some(p => p.k !== 'E');
    const targets = s.lands.filter(L => matchesCard(s, L, cardId) && !L.flags.skipAll && !L.flags.skipExplore
        && (L.coastal || hasBuilding(L) || L.adj.some(id => hasBuilding(s.lands[id]))));
    targets.forEach(L => {
        L.inv.push({ k: 'E', hp: 1 });
        ctx.event({ type: 'explore', land: L.id });
    });
    if (targets.length) ctx.log(`探検者が ${targets.map(L => landName(s, L.id)).join('・')} に来た`, 'invader');
}

// 恐怖カードの効果。対象の土地は、各ボードで自動で選ぶ（荒らし・建設が近く、侵略者が多い土地から）
function landScore(s, L) {
    return L.inv.reduce((a, p) => a + INVADER_DAMAGE[p.k], 0) + (matchesCard(s, L, s.invader.ravage) ? 10 : 0) + (matchesCard(s, L, s.invader.build) ? 5 : 0);
}

function eachBoard(s, filter, run) {
    for (let b = 0; b < s.n; b++) {
        const lands = s.lands.filter(L => L.board === b && filter(L)).sort((x, y) => landScore(s, y) - landScore(s, x) || x.id - y.id);
        if (lands.length) run(lands[0]);
    }
}

export function resolveFear(ctx, cardId, tl) {
    const { s } = ctx;
    const withPresence = (L) => presenceTotal(L) > 0;
    const has = (...ks) => (L) => L.inv.some(p => ks.includes(p.k));
    const removeOne = (L, ks) => ks.some(k => removeKind(L, k, 1) > 0);
    const dahanLands = s.lands.filter(L => L.dahan.length);
    const dahanStrike = (L, per) => { if (L.inv.length) damageInvaders(ctx, L.id, L.dahan.length * per); };
    const fx = {
        retreat: [
            () => eachBoard(s, has('E'), L => removeOne(L, ['E'])),
            () => eachBoard(s, has('E', 'T'), L => removeOne(L, ['T', 'E'])),
            () => eachBoard(s, has('T', 'C'), L => removeOne(L, ['C', 'T']))
        ],
        courage: [
            () => dahanLands.forEach(L => { L.defend += 2; }),
            () => dahanLands.forEach(L => { L.defend += 3; }),
            () => dahanLands.forEach(L => dahanStrike(L, 1))
        ],
        isolation: [
            () => dahanLands.forEach(L => { L.flags.skipBuild = true; }),
            () => s.lands.filter(L => L.dahan.length || withPresence(L)).forEach(L => { L.flags.skipBuild = true; }),
            () => { s.turnFlags.noBuild = true; }
        ],
        hesitation: [
            () => eachBoard(s, L => L.coastal && has('E')(L), L => removeOne(L, ['E'])),
            () => s.lands.filter(withPresence).forEach(L => { L.flags.skipExplore = true; }),
            () => { s.turnFlags.noExplore = true; }
        ],
        wary: [
            () => s.lands.filter(L => L.inv.length <= L.dahan.length).forEach(L => { L.flags.skipRavage = true; }),
            () => s.lands.forEach(L => { L.defend += 2; }),
            () => s.lands.filter(L => !L.inv.some(p => p.k === 'C')).forEach(L => { L.flags.skipRavage = true; })
        ],
        flight: [
            () => eachBoard(s, L => withPresence(L) && has('E')(L), L => removeOne(L, ['E'])),
            () => eachBoard(s, L => withPresence(L) && has('T', 'E')(L), L => {
                if (!removeOne(L, ['T'])) removeKind(L, 'E', 2);
            }),
            () => eachBoard(s, has('T', 'C'), L => removeOne(L, ['C', 'T']))
        ],
        revenge: [
            () => eachBoard(s, L => L.dahan.length > 0 && L.inv.length > 0, L => dahanStrike(L, 1)),
            () => eachBoard(s, L => L.dahan.length > 0 && L.inv.length > 0, L => dahanStrike(L, 2)),
            () => dahanLands.forEach(L => dahanStrike(L, 2))
        ],
        terror: [
            () => eachBoard(s, L => withPresence(L) && has('E')(L), L => destroyKind(ctx, L.id, 'E', 1)),
            () => eachBoard(s, L => withPresence(L) && has('T', 'E')(L), L => {
                if (!destroyKind(ctx, L.id, 'T', 1)) destroyKind(ctx, L.id, 'E', 2);
            }),
            () => eachBoard(s, has('T', 'C'), L => {
                if (!destroyKind(ctx, L.id, 'C', 1)) destroyKind(ctx, L.id, 'T', 1);
            })
        ],
        trade: [
            () => s.lands.filter(L => L.coastal).forEach(L => { L.flags.skipBuild = true; }),
            () => s.lands.filter(L => L.coastal || L.dahan.length).forEach(L => { L.flags.skipBuild = true; }),
            () => {
                s.turnFlags.noBuild = true;
                eachBoard(s, has('E'), L => removeOne(L, ['E']));
            }
        ]
    };
    ctx.log(`恐怖カード「${FEAR_CARD[cardId].name}」（段階${tl}）：${FEAR_CARD[cardId].text[tl - 1]}`, 'fear');
    ctx.event({ type: 'fearCard', card: cardId, tl });
    fx[cardId][tl - 1]();
    checkVictory(ctx);
}

export function invaderPhase(ctx) {
    const { s } = ctx;
    s.phase = 'invader';
    ctx.log(`― 侵略者フェイズ（${s.turn}ターン目）―`, 'phase');
    while (s.fear.earned.length && !s.result) {
        const cardId = s.fear.earned.shift();
        resolveFear(ctx, cardId, terrorLevel(s));
        s.fear.resolved.push(cardId);
    }
    if (s.result) return;
    if (s.invader.ravage) ravage(ctx, s.invader.ravage);
    if (s.result) return;
    if (s.invader.build) build(ctx, s.invader.build);
    checkVictory(ctx);
    if (s.result) return;
    if (!s.invader.deck.length) {
        ctx.log('侵略者の山が尽き、探検を止められなくなった', 'invader');
        endGame(ctx, false, 'time');
        return;
    }
    const cardId = s.invader.deck.shift();
    ctx.log(`探検のカード：${invaderCardName(cardId)}`, 'invader');
    explore(ctx, cardId);
    checkVictory(ctx);
    if (s.invader.ravage) s.invader.discard.push(s.invader.ravage);
    s.invader.ravage = s.invader.build;
    s.invader.build = cardId;
    s.invader.explored = cardId;
}

// ---- ターンの終わり ----

export function timePasses(ctx) {
    const { s } = ctx;
    s.spirits.forEach(sp => {
        sp.discard.push(...sp.played);
        sp.played = [];
        sp.used = [];
        sp.swift = 0;
        sp.swiftUsed = 0;
        sp.repeat = null;
        sp.done = false;
        sp.step = 'growth';
        sp.growthChoice = null;
    });
    s.lands.forEach(L => {
        L.inv.forEach(p => { p.hp = INVADER_HEALTH[p.k]; });
        L.dahan = L.dahan.map(() => DAHAN_HEALTH);
        L.defend = 0;
        L.flags = {};
    });
    s.turnFlags = {};
    s.turn++;
    s.phase = 'spirit';
    ctx.log(`― ${s.turn}ターン目 ―`, 'phase');
}

// ---- 成長 ----

function drawPowers(ctx, which, count) {
    const { s } = ctx;
    const pile = s[which];
    const drawn = [];
    while (drawn.length < count) {
        if (!pile.deck.length) {
            if (!pile.discard.length) break;
            pile.deck = shuffle(pile.discard.splice(0), ctx.random);
        }
        drawn.push(pile.deck.shift());
    }
    return drawn;
}

// 成長の続き：自動でできる部品を進め、選ぶ部品で止まる。終わったらエネルギーを得て、カードを使う段へ
export function continueGrowth(ctx, seat) {
    const { s } = ctx;
    const sp = s.spirits[seat];
    while (sp.queue.length && !sp.prompt) {
        const part = sp.queue.shift();
        if (part === 'reclaim') {
            sp.hand.push(...sp.discard.splice(0));
        } else if (part.startsWith('energy')) {
            sp.energy += Number(part.slice(6));
        } else if (part.startsWith('presence')) {
            if (presenceSources(s, seat).length) sp.prompt = { kind: 'presence', range: Number(part.slice(8)) };
        } else if (part === 'power') {
            const minorOk = s.minor.deck.length + s.minor.discard.length > 0;
            const majorOk = s.major.deck.length + s.major.discard.length > 0 && sp.hand.length + sp.discard.length > 0;
            if (minorOk || majorOk) sp.prompt = { kind: 'deck' };
        }
    }
    if (sp.prompt || sp.queue.length) return;
    const gain = energyValue(s, seat);
    sp.energy += gain;
    if (hasReclaimOne(s, seat) && sp.discard.length) {
        const best = [...sp.discard].sort((a, b) => CARD[b].cost - CARD[a].cost || a.localeCompare(b))[0];
        sp.discard.splice(sp.discard.indexOf(best), 1);
        sp.hand.push(best);
    }
    sp.step = 'play';
}

// ---- 操作 ----

// 記録する項目（端末から届いた操作は、この項目だけを取り出す）
export const COMMAND_FIELDS = {
    growth: ['option'],
    presence: ['track', 'land'],
    deck: ['deck'],
    pick: ['card'],
    forget: ['card'],
    play: ['cards'],
    power: ['power', 'land', 'spirit', 'dest'],
    done: []
};

const isInt = (v) => Number.isInteger(v);

// 操作が通るかを調べる（状態は変えない）。通らなければ理由の文を返す
export function validate(s, seat, cmd) {
    if (s.result) return '対局は終わっています';
    const sp = s.spirits[seat];
    if (!sp) return 'その席はありません';
    const t = cmd.type;
    if (['growth', 'presence', 'deck', 'pick', 'forget', 'play'].includes(t) && s.phase !== 'spirit') return '今は精霊フェイズではありません';
    switch (t) {
    case 'growth': {
        if (sp.step !== 'growth') return '成長はもう選びました';
        if (!isInt(cmd.option) || cmd.option < 0 || cmd.option >= SPIRITS[sp.key].growth.length) return '成長の選び方が正しくありません';
        return null;
    }
    case 'presence': {
        if (sp.prompt?.kind !== 'presence') return '今は存在を置く場面ではありません';
        if (!presenceSources(s, seat).includes(cmd.track)) return 'その列からは取れません';
        if (!isInt(cmd.land) || !landsInRange(s, seat, sp.prompt.range).includes(cmd.land)) return 'その土地には置けません';
        return null;
    }
    case 'deck': {
        if (sp.prompt?.kind !== 'deck') return '今はカードを得る場面ではありません';
        if (cmd.deck !== 'minor' && cmd.deck !== 'major') return '山の選び方が正しくありません';
        if (s[cmd.deck].deck.length + s[cmd.deck].discard.length === 0) return 'その山はもうありません';
        if (cmd.deck === 'major' && sp.hand.length + sp.discard.length === 0) return '忘れるカードがありません';
        return null;
    }
    case 'pick': {
        if (sp.prompt?.kind !== 'pick') return '今はカードを選ぶ場面ではありません';
        if (!sp.prompt.cards.includes(cmd.card)) return 'そのカードは選べません';
        return null;
    }
    case 'forget': {
        if (sp.prompt?.kind !== 'forget') return '今はカードを忘れる場面ではありません';
        if (cmd.card === sp.prompt.gained || !(sp.hand.includes(cmd.card) || sp.discard.includes(cmd.card))) return 'そのカードは忘れられません';
        return null;
    }
    case 'play': {
        if (sp.step !== 'play') return '今はカードを使う場面ではありません';
        if (!Array.isArray(cmd.cards) || cmd.cards.some(c => typeof c !== 'string')) return 'カードの選び方が正しくありません';
        if (new Set(cmd.cards).size !== cmd.cards.length || cmd.cards.some(c => !sp.hand.includes(c))) return '手札にないカードがあります';
        if (cmd.cards.length > cardPlays(s, seat)) return `使えるカードは${cardPlays(s, seat)}枚までです`;
        const cost = cmd.cards.reduce((a, c) => a + CARD[c].cost, 0);
        if (cost > sp.energy) return 'エネルギーが足りません';
        return null;
    }
    case 'power': {
        if (s.phase !== 'fast' && s.phase !== 'slow') return '今は力を使う場面ではありません';
        if (sp.done) return 'このフェイズはもう終えました';
        if (!availablePowers(s, seat).some(p => p.power === cmd.power)) return 'その力は今は使えません';
        const info = powerInfo(s, seat, cmd.power);
        const targets = powerTargets(s, seat, cmd.power);
        if (info.target === 'spirit') {
            if (!targets.some(x => x.spirit === cmd.spirit)) return 'その精霊は対象にできません';
        } else if (!targets.some(x => x.land === cmd.land)) return 'その土地は対象にできません';
        if (cmd.dest !== undefined && cmd.dest !== null) {
            if (!info.push || info.target !== 'land' || !s.lands[cmd.land].adj.includes(cmd.dest)) return 'その土地へは押し出せません';
        }
        return null;
    }
    case 'done': {
        if (s.phase !== 'fast' && s.phase !== 'slow') return '今は終えられる場面ではありません';
        if (sp.done) return 'このフェイズはもう終えました';
        return null;
    }
    default:
        return '知らない操作です';
    }
}

// 通ると分かった操作を行う
export function execute(ctx, seat, cmd) {
    const { s } = ctx;
    const sp = s.spirits[seat];
    const name = SPIRITS[sp.key].short;
    switch (cmd.type) {
    case 'growth': {
        const parts = SPIRITS[sp.key].growth[cmd.option];
        sp.growthChoice = cmd.option;
        sp.step = 'grow';
        // 自動の部品（捨て札を戻す・エネルギー）を先に、選ぶ部品をあとに
        sp.queue = [...parts.filter(p => p === 'reclaim' || p.startsWith('energy')), ...parts.filter(p => p === 'power' || p.startsWith('presence'))];
        ctx.log(`${name}：成長（${cmd.option + 1}）`, 'spirit');
        continueGrowth(ctx, seat);
        break;
    }
    case 'presence': {
        const def = SPIRITS[sp.key];
        if (cmd.track === 'energy') sp.energyIdx++;
        else if (cmd.track === 'cards') sp.cardIdx++;
        else sp.destroyed--;
        s.lands[cmd.land].presence[seat]++;
        sp.prompt = null;
        ctx.event({ type: 'presence', seat, land: cmd.land });
        const label = cmd.track === 'energy' ? `エネルギー ${def.energy[sp.energyIdx - 1]}` : cmd.track === 'cards' ? `カード ${cardPlays(s, seat)}枚` : '壊された存在';
        ctx.log(`${name}：${landName(s, cmd.land)} に存在を置いた（${label}）`, 'spirit');
        continueGrowth(ctx, seat);
        break;
    }
    case 'deck': {
        const cards = drawPowers(ctx, cmd.deck, 4);
        sp.prompt = { kind: 'pick', deck: cmd.deck, cards };
        break;
    }
    case 'pick': {
        const { deck, cards } = sp.prompt;
        s[deck].discard.push(...cards.filter(c => c !== cmd.card));
        sp.hand.push(cmd.card);
        ctx.log(`${name}：力のカード「${CARD[cmd.card].name}」を得た`, 'spirit');
        sp.prompt = deck === 'major' ? { kind: 'forget', gained: cmd.card } : null;
        continueGrowth(ctx, seat);
        break;
    }
    case 'forget': {
        const from = sp.hand.includes(cmd.card) ? sp.hand : sp.discard;
        from.splice(from.indexOf(cmd.card), 1);
        sp.forgotten.push(cmd.card);
        ctx.log(`${name}：「${CARD[cmd.card].name}」を忘れた`, 'spirit');
        sp.prompt = null;
        continueGrowth(ctx, seat);
        break;
    }
    case 'play': {
        cmd.cards.forEach(c => {
            sp.hand.splice(sp.hand.indexOf(c), 1);
            sp.played.push(c);
            sp.energy -= CARD[c].cost;
        });
        sp.step = 'ready';
        ctx.log(`${name}：${cmd.cards.length ? cmd.cards.map(c => CARD[c].name).join('・') : 'カードを使わない'}`, 'spirit');
        break;
    }
    case 'power':
        usePower(ctx, seat, cmd);
        break;
    case 'done':
        sp.done = true;
        break;
    default:
        break;
    }
    advance(ctx);
}

// 全員がそろったら、次のフェイズへ進める。侵略者フェイズとターンの終わりは自動
export function advance(ctx) {
    const { s } = ctx;
    for (let guard = 0; guard < 20 && !s.result; guard++) {
        if (s.phase === 'spirit') {
            if (!s.spirits.every(sp => sp.step === 'ready')) return;
            s.phase = 'fast';
            s.spirits.forEach(sp => { sp.done = false; });
            ctx.log('― 速い力 ―', 'phase');
        } else if (s.phase === 'fast' || s.phase === 'slow') {
            s.spirits.forEach((sp, seat) => {
                if (!sp.done && availablePowers(s, seat).length === 0) sp.done = true;
            });
            if (!s.spirits.every(sp => sp.done)) return;
            if (s.phase === 'fast') {
                invaderPhase(ctx);
                if (s.result) return;
                s.phase = 'slow';
                s.spirits.forEach(sp => { sp.done = false; });
                ctx.log('― 遅い力 ―', 'phase');
            } else {
                timePasses(ctx);
                return;
            }
        } else return;
    }
}

export { silent };
