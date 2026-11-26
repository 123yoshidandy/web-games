/**
 * CPU の判断（DOM に依存しない）
 * 見るのは自分のビューだけ（自分の役割と手札、公開された情報）。ほかの人の隠れた役割と手札はのぞかない
 *
 * 役割の推測：公開された行動（acts）から、各人が「ジムリーダーの味方らしい（＋）か、敵らしい（−）か」を点数にする（suspicions）
 * - リーダーを攻撃する・カードを奪う → 敵らしい。リーダーを回復する・ひんしから助ける → 味方らしい
 * - 味方らしい人を攻撃する → 敵らしい。敵らしい人を攻撃する → 味方らしい（回復・救助はその逆）
 * 自分の役割から、各人をどれだけ倒したいか（hostility）を決め、攻撃・イベント・回復・救助の相手を選ぶ
 *   ジムリーダー・トレーナー：敵らしい人を倒す。ロケット団員：リーダーは最後まで守り、ほかを倒す。挑戦者：リーダーを狙い、味方らしい人も倒す
 *
 * 強さ：ふつう（normal）とやさしい（easy）。やさしいは、推測をリーダーへの行動だけにし、ときどき相手を誤る
 * CPU の判断にはゲームの乱数を使わない（記録の再現がずれるため）。ビューから作った別の乱数を使う
 */

import { createRandom } from './random.js';
import { CARDS, POKEMON, MODES } from './data.js';
import { createGameView } from './game-view.js';

export const LEVELS = {
    normal: { inference: true, wild: 0, attackBar: 0.2 },
    easy: { inference: false, wild: 0.35, attackBar: 0 }
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ROLE_SCORE = { leader: 10, trainer: 6, challenger: -6, rocket: -3 };

function viewRandom(view) {
    return createRandom((Math.imul(view.logTotal + 1, 2654435761) ^ Math.imul((view.you ?? 0) + 7, 40503) ^ (view.acts.length * 977)) >>> 0);
}

// ---------- 推測 ----------

// 各人がジムリーダーの味方らしいか（＋）、敵らしいか（−）
// やさしい CPU も、残りが 3 人以下になったら、すべての行動から推理する（終盤に味方を取り違えて、決着がつかなくなるのを防ぐ）
function fullInference(view, level) {
    return (LEVELS[level]?.inference ?? true) || view.players.filter(p => p.alive).length <= 3;
}

export function suspicions(view, level = 'normal') {
    const full = fullInference(view, level);
    const s = view.players.map(() => 0);
    const known = view.players.map(p => p.role);
    const fixed = i => known[i] !== null;
    const leader = view.leader;
    const scoreOf = i => clamp(fixed(i) ? ROLE_SCORE[known[i]] : s[i], -3, 3);
    view.acts.forEach(act => {
        const a = act.from;
        if (fixed(a) && a !== view.you) return;
        const b = act.to;
        switch (act.type) {
            case 'attack':
                if (b === leader) s[a] -= 2 + (act.amount ?? 1);
                else if (full) s[a] -= 0.5 * scoreOf(b) * Math.min(3, act.amount ?? 1);
                break;
            case 'steal':
            case 'scrap':
                if (b === leader) s[a] -= 1.5;
                else if (full) s[a] -= 0.3 * scoreOf(b);
                break;
            case 'heal':
            case 'gift':
                if (b === leader) s[a] += 2;
                else if (full) s[a] += 0.4 * scoreOf(b);
                break;
            case 'rescue':
                if (b === leader) s[a] += 3;
                else if (full) s[a] += 0.7 * scoreOf(b);
                break;
            case 'area':
                if (a !== leader) s[a] -= full ? 0.8 : 0.4;
                break;
        }
    });
    view.players.forEach((p, i) => { s[i] = fixed(i) ? ROLE_SCORE[known[i]] : clamp(s[i], -10, 10); });
    return s;
}

// 自分から見て、各人をどれだけ倒したいか（＋：倒したい、−：守りたい）
export function hostilities(view, level = 'normal') {
    const me = view.you;
    const myRole = view.players[me].role;
    const s = suspicions(view, level);
    const alive = view.players.filter(p => p.alive);
    const unknown = i => view.players[i].role === null;
    // まだ分からない役割の残り（配った役割から、見えている役割を引く）
    const pool = { leader: 0, trainer: 0, challenger: 0, rocket: 0 };
    view.roleList.forEach(r => { pool[r]++; });
    view.players.forEach(p => { if (p.role) pool[p.role]--; });
    if (fullInference(view, level)) {
        view.players.forEach((p, i) => {
            if (!unknown(i)) return;
            if (pool.trainer === 0) s[i] = Math.min(s[i], -6);                          // 残りは全員、リーダーの敵
            else if (pool.challenger === 0 && pool.rocket === 0) s[i] = Math.max(s[i], 6); // 残りはトレーナーだけ
        });
    }
    return view.players.map((p, i) => {
        if (i === me) return -10;
        if (!p.alive) return 0;
        switch (myRole) {
            case 'leader': return -s[i];
            case 'trainer': return p.role === 'leader' ? -10 : -s[i];
            case 'challenger':
                // ふつうの挑戦者は、序盤は潜む（リーダーをまだ攻撃しておらず、リーダーの HP に余裕があるうちは、攻撃で正体を明かさない）
                if (p.role === 'leader') return lurking(view, level) ? 0.1 : 8;
                if (unknown(i) && pool.challenger === 0 && (LEVELS[level]?.inference ?? true)) return 1 + Math.max(0, s[i]);
                return s[i] * 0.8 + 0.2;
            case 'rocket': {
                // リーダーは最後に倒す。それまでは、劣勢な側を助ける：リーダーに余裕があればトレーナーらしい人、危なければ挑戦者らしい人を狙う
                if (p.role === 'leader') return alive.length > 2 ? -4 : 10;
                const leader = view.players[view.leader];
                const hp = leader.pokemon.filter(m => !m.fainted).reduce((sum, m) => sum + m.hp, 0);
                if (alive.length <= 3) return 2 + Math.max(0, -s[i]) * 0.5;
                return hp >= 5 ? 0.5 + Math.max(0, s[i]) * 0.5 - Math.max(0, -s[i]) * 0.2 : 1 + Math.max(0, -s[i]) * 0.5;
            }
            default: return 0;
        }
    });
}

// 挑戦者が潜んでいるか：まだリーダーを攻撃しておらず、リーダーの HP が 4 以上で、2 巡目まで
export function lurking(view, level = 'normal') {
    if (!(LEVELS[level]?.inference ?? true) || !view.turn) return false;
    const me = view.you;
    const leader = view.players[view.leader];
    const exposed = view.acts.some(a => a.from === me && a.to === view.leader && a.type === 'attack');
    const hp = leader.pokemon.filter(m => !m.fainted).reduce((sum, m) => sum + m.hp, 0);
    return !exposed && hp >= 4 && view.turn.number <= view.players.length * 2;
}

// ---------- 評価 ----------

function monValue(id, mode) {
    const d = POKEMON[id];
    const hp = mode === 'basic' ? d.hp : d.hpX;
    return hp + 2.5 * d.move.damage * d.move.hits + (d.ability ? 1 : 0) + (d.move.effect ? 0.5 : 0);
}

// 手札のカードの値打ち（捨てる・取るときに使う）
function cardValue(view, key) {
    const hand = view.hand ?? [];
    const count = hand.filter(c => c.key === key).length;
    const me = view.players[view.you];
    const battle = me.pokemon[me.battle];
    switch (key) {
        case 'yokete': return 6 - count;
        case 'kurae': return 6 - count;
        case 'potion': return 6.5;
        case 'revive': return 7;
        case 'articuno': return 4;
        case 'nugget': return 4.5;
        case 'fullHeal': return battle?.status ? 5 : 2;
        default:
            if (CARDS[key].kind === 'item') return battle?.item ? 2 : 4.5;
            return 3.5;
    }
}

function battleOf(view, seat) {
    const p = view.players[seat];
    return p.pokemon[p.battle];
}

// ---------- 判断 ----------

export function chooseCommand(view, level = 'normal', random = viewRandom(view)) {
    if (!view.myAction) return null;
    const conf = LEVELS[level] ?? LEVELS.normal;
    if (view.phase === 'choose') {
        const picks = [...view.offers].sort((a, b) => monValue(b, view.mode) - monValue(a, view.mode)).slice(0, view.pick);
        return { type: 'choose', picks };
    }
    const host = hostilities(view, level);
    if (view.prompt) return respond(view, host, conf, random);
    return decideTurn(view, host, conf, random);
}

function respond(view, host, conf, random) {
    const pr = view.prompt;
    const hand = view.hand;
    const has = key => hand.some(c => c.key === key);
    switch (pr.kind) {
        case 'dodge':
            if (has('yokete') && !(conf.wild && random() < 0.15)) return { type: 'respond', choice: 'yokete' };
            if (pr.event && has('articuno')) return { type: 'respond', choice: 'articuno' };
            return { type: 'respond', choice: 'take' };
        case 'discardAttack':
            if (has('kurae')) return { type: 'respond', choice: 'kurae' };
            if (pr.canShield && has('articuno')) return { type: 'respond', choice: 'articuno' };
            return { type: 'respond', choice: 'take' };
        case 'shield':
            if (pr.card === 'farfetchd' && hand.length <= 1) return { type: 'respond', choice: 'pass' };
            return { type: 'respond', choice: 'articuno' };
        case 'rescue': {
            const card = hand.filter(c => c.key === 'potion' || c.key === 'revive').sort((a, b) => (a.key === 'potion' ? -1 : 1) - (b.key === 'potion' ? -1 : 1))[0];
            const victim = pr.victim;
            const save = victim === view.you || host[victim] < -1;
            return { type: 'respond', choice: card && save ? card.id : 'pass' };
        }
        case 'pick': {
            const refs = view.cardRefs ?? [];
            const best = refs.slice().sort((a, b) => cardValue(view, b.key) - cardValue(view, a.key))[0];
            return { type: 'respond', choice: best ? best.id : pr.cards[0] };
        }
        case 'trim': {
            const sorted = hand.slice().sort((a, b) => cardValue(view, a.key) - cardValue(view, b.key));
            return { type: 'respond', discards: sorted.slice(0, pr.count).map(c => c.id) };
        }
        default:
            return null;
    }
}

// 自分の番：使える手を順に試し、なければ番を終える
function decideTurn(view, host, conf, random) {
    const opt = view.options;
    const me = view.players[view.you];
    const hand = view.hand;
    const mine = battleOf(view, view.you);
    const others = view.players.filter(p => p.alive && p.id !== view.you).map(p => p.id);
    const usable = key => hand.filter(c => c.key === key && opt.cards[c.id] && (opt.cards[c.id].usable || opt.cards[c.id].targets?.length > 0));
    const pickTarget = list => {
        if (list.length === 0) return null;
        if (conf.wild && random() < conf.wild) return list[Math.floor(random() * list.length)];
        return list.slice().sort((a, b) => host[b] - host[a])[0];
    };
    const enemies = list => list.filter(t => host[t] > conf.attackBar);

    // 回復：自分が危ないとき、守りたい人が危ないとき
    for (const c of [...usable('potion'), ...usable('revive')]) {
        const targets = opt.cards[c.id].targets;
        if (targets.includes(view.you) && mine.hp * 2 <= mine.maxHp) return { type: 'play', card: c.id, target: view.you };
        const friend = targets.filter(t => t !== view.you && host[t] < -2 && battleOf(view, t).maxHp - battleOf(view, t).hp >= 2)
            .sort((a, b) => host[a] - host[b])[0];
        if (friend !== undefined) return { type: 'play', card: c.id, target: friend };
    }
    // 特殊状態を治す
    const cure = usable('fullHeal').find(c => opt.cards[c.id].targets.includes(view.you));
    if (cure) return { type: 'play', card: cure.id, target: view.you };
    // もちものを持たせる（持っていなければ）
    if (!mine.item) {
        const item = hand.find(c => CARDS[c.key].kind === 'item' && opt.cards[c.id]?.usable);
        if (item) return { type: 'play', card: item.id };
    }
    // 自分を強くする・手札を増やす
    const nugget = usable('nugget')[0];
    if (nugget) return { type: 'play', card: nugget.id, target: view.you };
    const candy = usable('rareCandy')[0];
    if (candy) {
        const slots = opt.cards[candy.id].slots;
        return { type: 'play', card: candy.id, slot: slots ? (slots.includes(me.battle) ? me.battle : slots[0]) : undefined };
    }
    const boost = usable('mew')[0] ?? usable('berries')[0];
    if (boost) return { type: 'play', card: boost.id };
    // 交代（玄人）：バトルポケモンが危なく、ベンチが元気なら
    if (opt.canSwitch) {
        const bench = me.pokemon[1 - me.battle];
        if (mine.hp <= 1 && bench.hp > mine.hp + 1) return { type: 'switch' };
    }
    // 全員にかかるイベント：敵が味方より多いとき
    const pressure = others.reduce((sum, t) => sum + clamp(host[t], -3, 3), 0);
    const area = ['mewtwo', 'moltres', 'jigglypuff'].map(key => usable(key)[0]).find(Boolean);
    if (area && pressure > 1) return { type: 'play', card: area.id };
    for (const c of usable('zapdos')) {
        const ts = enemies(opt.cards[c.id].targets).sort((a, b) => host[b] - host[a]).slice(0, 2);
        if (ts.length > 0) return { type: 'play', card: c.id, targets: ts };
    }
    for (const key of ['mrMime', 'farfetchd']) {
        for (const c of usable(key)) {
            const t = pickTarget(enemies(opt.cards[c.id].targets));
            if (t !== null) return { type: 'play', card: c.id, target: t };
        }
    }
    // ライバルからの挑戦：「くらえ！」が 2 枚以上あるとき
    if (hand.filter(c => c.key === 'kurae').length >= 2) {
        for (const c of usable('rival')) {
            const t = pickTarget(enemies(opt.cards[c.id].targets));
            if (t !== null) return { type: 'play', card: c.id, target: t };
        }
    }
    // 攻撃
    if (!opt.attackBlocked) {
        const kurae = usable('kurae')[0];
        if (kurae) {
            const t = pickTarget(enemies(opt.cards[kurae.id].targets));
            if (t !== null) return { type: 'play', card: kurae.id, target: t };
        }
        if (opt.bandTargets.length > 0 && hand.length >= 4) {
            const t = pickTarget(enemies(opt.bandTargets));
            if (t !== null) {
                const discards = hand.slice().sort((a, b) => cardValue(view, a.key) - cardValue(view, b.key)).slice(0, 2).map(c => c.id);
                return { type: 'band', discards, target: t };
            }
        }
    }
    // 番を終える（玄人：攻撃しなかった番は進化）
    const evolve = opt.evolveSlots.length > 0 ? (opt.evolveSlots.includes(me.battle) ? me.battle : opt.evolveSlots[0]) : undefined;
    return evolve !== undefined ? { type: 'end', evolve } : { type: 'end' };
}

// ---------- 実行 ----------

export function isCpuTurn(game) {
    return game.actors().some(s => game.players[s].isCPU);
}

// CPU の席を 1 つ選び、1 手打つ。決めた手が通らなければ、単純な手で進める
export function runCpuStep(game, level = game.options.level ?? 'normal') {
    const seat = game.actors().find(s => game.players[s].isCPU);
    if (seat === undefined) return false;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, level);
    if (command && game.applyCommand(seat, command)) return true;
    for (const fallback of fallbackCommands(game, seat)) {
        if (game.applyCommand(seat, fallback)) return true;
    }
    return false;
}

// いちばん単純な答え（選べる最初のもの・受ける・見送る・番を終える）
export function fallbackCommands(game, seat) {
    const p = game.players[seat];
    if (game.phase === 'choose') return [{ type: 'choose', picks: p.offers.slice(0, MODES[game.mode].pick) }];
    const pr = game.prompt;
    if (pr) {
        if (pr.kind === 'pick') return [{ type: 'respond', choice: pr.cards[0] }];
        if (pr.kind === 'trim') return [{ type: 'respond', discards: p.hand.slice(0, pr.count) }];
        return [{ type: 'respond', choice: 'take' }, { type: 'respond', choice: 'pass' }];
    }
    return [{ type: 'end' }];
}

// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(game.actors().includes(seat))) return null;
    return chooseCommand(createGameView(game, seat), 'normal');
}
