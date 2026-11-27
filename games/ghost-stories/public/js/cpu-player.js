/**
 * CPU の僧（ヒントも同じ関数 suggest で出す）
 * DOM にもゲームの乱数にも頼らない。同じ局面なら同じ手を打つ
 *
 * 陽の段階では、動ける各タイルについて「除霊の見込み（出目の組み合わせをすべて数える）」と「村人の力の値打ち」を比べ、
 * 一番値打ちの高いタイルへ動いてから、その手を打つ
 * 幽霊の値打ち（脅威）は、憑き手の位置・呪い・呼び寄せ・気を奪う・ダイスを奪う・ボードのあふれ・ごほうびから数える
 */

import { planExorcism } from './game.js';
import { BLACK, MAX_QI, HAUNT_LIMIT, MONKS, FACING, LINES, SLOTS, boardOf, ghostOf, tileDistance } from './data.js';

// n 個のダイスの出目の組み合わせ（同じ組は1つにまとめ、重みを付ける）
const OUTCOMES = [];
function outcomes(n) {
    if (OUTCOMES[n]) return OUTCOMES[n];
    const map = new Map();
    const total = 6 ** n;
    for (let i = 0; i < total; i++) {
        const faces = [];
        let x = i;
        for (let d = 0; d < n; d++) {
            faces.push(x % 6);
            x = Math.floor(x / 6);
        }
        faces.sort((a, b) => a - b);
        const key = faces.join('');
        const hit = map.get(key);
        if (hit) hit.weight += 1 / total;
        else map.set(key, { faces, weight: 1 / total });
    }
    OUTCOMES[n] = [...map.values()];
    return OUTCOMES[n];
}

export function isCpuTurn(game) {
    return !game.isOver() && game.actors().length > 0 && game.players[game.current].isCPU;
}

// CPU の番なら1手打つ。seat を渡すと、その席の代わりに1手打つ（オンラインの代行・「任せる」）
export function runCpuStep(game, seat = null) {
    if (seat === null && !isCpuTurn(game)) return false;
    const s = seat ?? game.current;
    if (!game.actors().includes(s)) return false;
    const command = chooseCommand(game, s);
    if (!command) return false;
    if (game.applyCommand(s, command)) return true;
    // 思わぬ理由で断られたら、いちばん単純な手で進める
    return game.applyCommand(s, fallback(game, s));
}

// ヒント：その席が今打てる手（状態は変えない）。打てなければ null
export function suggest(game, seat) {
    if (!game.actors().includes(seat)) return null;
    return chooseCommand(game, seat);
}

function fallback(game) {
    if (game.phase === 'place') return { type: 'place', slot: game.placeOptions(game.queue[0])[0] };
    if (game.phase === 'exorcise') return { type: 'assign', targets: [] };
    return { type: 'pass' };
}

export function chooseCommand(game, seat) {
    if (game.phase === 'place') return { type: 'place', slot: choosePlacement(game) };
    if (game.phase === 'exorcise') return { type: 'assign', targets: bestTargets(game, seat, game.dice).targets };
    if (game.phase !== 'yang') return null;
    const me = game.players[seat];
    // 真言：まだ置いていなければ、一番手ごわい幽霊に置く（手番を使わない）
    if (game.hasPower(seat, 'mantra') && game.mantraAt === null) {
        const slot = mantraTarget(game, seat);
        if (slot !== null) return { type: 'mantra', slot };
    }
    const plan = game.moved ? bestAction(game, seat, me.tile) : bestPlan(game, seat);
    if (!game.moved && plan.tile !== me.tile) return { type: 'move', to: plan.tile };
    // 仏像：自分のタイルに向いた空きの場所に置く（手番を使わない）
    if (me.buddhas > 0) {
        const free = FACING[me.tile].filter(s => !game.slots[s] && !game.buddhaAt[s]);
        if (free.length > 0) return { type: 'buddha', slot: bestBuddhaSlot(game, free) };
    }
    return plan.command;
}

// ---- 値打ち ----

const tokenValue = (game, color) => (color === BLACK ? (game.deck.includes(game.incarnation) || incarnationSlot(game) !== null ? 2.2 : 0.9) : 0.8);

function incarnationSlot(game) {
    const s = game.slots.findIndex(x => x && ghostOf(x.card).incarnation);
    return s >= 0 ? s : null;
}

// どの僧の陰の段階が先に来るか（手番の僧から数えて）
function urgency(game, seat, board) {
    const d = (board - seat + MONKS) % MONKS;
    return d === 0 ? 1 : 1.4 - 0.1 * d;
}

// 幽霊の脅威（祓ったときに得る値打ち）
export function threat(game, slot, seat = game.current) {
    const s = game.slots[slot];
    if (!s) return 0;
    const g = ghostOf(s.card);
    if (g.incarnation) return 200;
    const haunted = game.hauntedCount();
    const danger = haunted >= HAUNT_LIMIT - 1;
    const owner = game.players[boardOf(slot)];
    let v = 3;
    if (s.haunter !== null) v += s.haunter >= 0 ? (danger ? 45 : 13) : (danger ? 12 : 5);
    g.yin.forEach(e => {
        if (e === 'curse') v += danger ? 6 : 3;
        else if (e === 'summon') v += 6;
        else if (e === 'drain') v += owner.alive ? (owner.qi <= 1 ? 12 : 4) : 0;
    });
    if (g.arrive.includes('capture')) v += 4;
    if (g.arrive.includes('block')) v += owner.alive ? 3 : 0;
    const board = boardOf(slot);
    const count = [0, 1, 2].filter(k => game.slots[board * 3 + k]).length;
    if (count === 3) v += owner.alive ? (owner.qi <= 1 ? 10 : 4) : 1;
    else v += count - 1;
    const me = game.players[seat];
    g.reward.forEach(r => {
        if (r === 'qi') v += me.qi < MAX_QI ? (me.qi <= 1 ? 4 : 1.5) : 0;
        else if (r === 'tao') v += 1;
        else if (r === 'unhaunt') v += haunted > 0 ? (danger ? 20 : 8) : 1;
    });
    return v * urgency(game, seat, board);
}

// 出目 dice で祓う幽霊の組と、その値打ち
function bestTargets(game, seat, dice, tile = game.players[seat].tile) {
    const me = game.players[seat];
    const facing = game.targetsFrom(tile);
    let best = { targets: [], value: 0 };
    const sets = facing.length === 2 ? [[facing[0]], [facing[1]], facing] : facing.map(s => [s]);
    for (const targets of sets) {
        const use = planExorcism(game.needOf(targets), dice, me.tao);
        if (!use) continue;
        const value = targets.reduce((a, s) => a + threat(game, s, seat), 0) - use.reduce((a, n, c) => a + n * tokenValue(game, c), 0);
        if (value > best.value) best = { targets, value };
    }
    return best;
}

// そのタイルで除霊したときの値打ちの見込み
function exorciseValue(game, seat, tile) {
    if (game.targetsFrom(tile).length === 0) return -Infinity;
    let sum = 0;
    for (const { faces, weight } of outcomes(game.diceCount(seat))) sum += weight * bestTargets(game, seat, faces, tile).value;
    return sum;
}

// 札の色の足りなさ：盤の幽霊の抵抗の合計（魔王の化身が近ければ黒を足す）から、手持ちを引く
function neededColor(game, seat) {
    const demand = [0, 0, 0, 0, 0];
    game.slots.forEach((s, i) => { if (s) demand[ghostOf(s.card).color] += game.resistance(i); });
    if (game.deck.includes(game.incarnation)) demand[BLACK] += 3;
    const tao = game.players[seat].tao;
    let best = BLACK;
    demand.forEach((d, c) => { if (d - tao[c] > demand[best] - tao[best]) best = c; });
    return best;
}

function prayerChoice(game) {
    const weight = [0, 0, 0, 0, 0];
    game.slots.forEach((s, i) => {
        if (!s) return;
        const g = ghostOf(s.card);
        if (g.res > 1) weight[g.color] += g.incarnation ? 20 : 2;
    });
    const until = game.deck.length - game.deck.indexOf(game.incarnation);
    if (game.deck.includes(game.incarnation) && until <= 10) weight[BLACK] += 8;
    let best = 0;
    weight.forEach((w, c) => { if (w > weight[best]) best = c; });
    const gain = weight[best] - (game.prayer !== null && game.tileActive('prayer') ? weight[game.prayer] : 0);
    return { color: best, value: gain };
}

const QI_VALUE = [0, 10, 4.5, 1.5, 0];
// 呪術師の庵で気を払う重さ（残りの気ごと）
const SORCERER_COST = [0, 99, 11, 6, 4];

// そのタイルで村人の力を借りる手と値打ち（借りられなければ null）
function helpOption(game, seat, tile) {
    const t = game.tiles[tile];
    if (t.haunted) return null;
    const me = game.players[seat];
    const pockets = game.hasPower(seat, 'pockets');
    const color = neededColor(game, seat);
    const bonus = pockets ? { bonus: color } : {};
    switch (t.key) {
        case 'tea':
            return { command: { type: 'help', color, ...bonus }, value: (me.qi < MAX_QI ? QI_VALUE[me.qi] : 0) + 1.4 + (pockets ? 1.4 : 0) };
        case 'herb':
            return { command: { type: 'help', ...bonus }, value: 2.4 + (pockets ? 1.4 : 0) };
        case 'sorcerer': {
            if (me.qi < 2) return null;
            let best = null;
            game.slots.forEach((s, i) => {
                if (!s || ghostOf(s.card).incarnation) return;
                const v = threat(game, i, seat);
                if (!best || v > best.v) best = { slot: i, v };
            });
            if (!best) return null;
            return { command: { type: 'help', slot: best.slot }, value: best.v - SORCERER_COST[me.qi] };
        }
        case 'prayer': {
            const { color: c, value } = prayerChoice(game);
            if (c === game.prayer) return null;
            return { command: { type: 'help', color: c }, value };
        }
        case 'temple':
            return game.temple > 0 && me.buddhas === 0 ? { command: { type: 'help' }, value: 3 } : null;
        case 'cemetery': {
            const dead = game.players.find(p => !p.alive);
            return dead ? { command: { type: 'help', monk: dead.id }, value: 16 } : null;
        }
        case 'altar': {
            if (game.deck.length === 0) return null;
            const next = game.deck.length - 1 === game.deck.indexOf(game.incarnation);
            return { command: { type: 'help' }, value: next ? 0.5 : 3.5 };
        }
        case 'watch': {
            const order = ['watch', 'tea', 'cemetery', 'herb', 'temple', 'prayer', 'sorcerer', 'altar', 'pavilion'];
            const targets = game.tiles.map((x, i) => i).filter(i => game.tiles[i].haunted);
            if (targets.length === 0) return null;
            targets.sort((a, b) => order.indexOf(game.tiles[a].key) - order.indexOf(game.tiles[b].key));
            return { command: { type: 'help', tile: targets[0] }, value: 9 + (game.hauntedCount() >= HAUNT_LIMIT - 1 ? 30 : 0) };
        }
        default:
            return null;
    }
}

// そのタイルで一番よい手
function bestAction(game, seat, tile) {
    let best = { tile, command: { type: 'pass' }, value: 0 };
    const ex = exorciseValue(game, seat, tile);
    if (ex > best.value) best = { tile, command: { type: 'exorcise' }, value: ex };
    const help = helpOption(game, seat, tile);
    if (help && help.value > best.value) best = { tile, command: help.command, value: help.value };
    return best;
}

// 動き先と手の組で、一番よいもの（同じ値打ちなら動かない方・番号の小さいタイル）
function bestPlan(game, seat) {
    const me = game.players[seat];
    let best = null;
    for (let tile = 0; tile < 9; tile++) {
        if (tile !== me.tile && !game.canMoveTo(seat, tile)) continue;
        const plan = bestAction(game, seat, tile);
        // 次の番に備えて、幽霊に向いたタイルを少しだけ好む
        plan.value += FACING[tile].reduce((a, s) => a + (game.slots[s] ? 0.3 : 0), 0) + (tile === me.tile ? 0.05 : 0);
        if (!best || plan.value > best.value) best = plan;
    }
    return best;
}

function mantraTarget(game, seat) {
    let best = null;
    game.slots.forEach((s, i) => {
        if (!s) return;
        if (game.resistance(i) <= 1) return;
        const v = threat(game, i, seat) + ghostOf(s.card).res;
        if (!best || v > best.v) best = { slot: i, v };
    });
    return best ? best.slot : null;
}

// 仏像：次に幽霊が来そうなボード（埋まりかけ）を選ぶ
function bestBuddhaSlot(game, free) {
    let best = free[0];
    let bestScore = -Infinity;
    free.forEach(s => {
        const b = boardOf(s);
        const score = [0, 1, 2].filter(k => game.slots[b * 3 + k]).length;
        if (score > bestScore) {
            bestScore = score;
            best = s;
        }
    });
    return best;
}

// 幽霊を置く場所：仏像があればそこ。なければ、僧の近くで除霊しやすく、大事なタイルを狙われにくい場所
export function choosePlacement(game) {
    const id = game.queue[0];
    const g = ghostOf(id);
    const options = game.placeOptions(id);
    const alive = game.players.filter(p => p.alive);
    let best = options[0];
    let bestScore = -Infinity;
    for (const s of options) {
        let score = 0;
        if (game.buddhaAt[s]) score += g.incarnation ? -5 : 100;
        const front = LINES[s][0];
        const dist = alive.length ? Math.min(...alive.map(p => tileDistance(p.tile, front))) : 0;
        score -= dist * 2;
        if (FACING[front].length === 2) score += 1;
        if (g.arrive.includes('haunter')) {
            const next = LINES[s].find(t => !game.tiles[t].haunted);
            if (next === undefined) score += 8;
            else if (['watch', 'tea', 'cemetery'].includes(game.tiles[next].key)) score -= 3;
        }
        // 角のタイルにすでに幽霊が向いていれば、2体まとめて祓える
        if (FACING[front].some(x => x !== s && game.slots[x] && ghostOf(game.slots[x].card).color === g.color)) score += 1.5;
        if (score > bestScore) {
            bestScore = score;
            best = s;
        }
    }
    return best;
}

export { SLOTS };
