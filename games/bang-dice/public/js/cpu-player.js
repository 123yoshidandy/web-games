/**
 * CPU の判断（DOM に依存しない）
 * 見るのは自分のビューだけ（自分の役割と、公開された情報）。ほかの人の隠れた役割はのぞかない
 *
 * 役割の推測：公開された行動（acts：だれがだれを撃った・回復した・ガトリングを撃った）から、
 * 各人が「保安官の味方らしい（＋）か、敵らしい（−）か」を点数にする（suspicions）
 * - 保安官を撃つ・ガトリングで巻き込む → 敵らしい。保安官を回復する → 味方らしい
 * - 味方らしい人を撃つ → 敵らしい。敵らしい人を撃つ → 味方らしい（回復はその逆）
 * 自分の役割から、各人をどれだけ倒したいか（hostility）を決め、ダイスを残す・撃つ相手・回復する相手を選ぶ
 *
 * 強さ：ふつう（normal）とやさしい（easy）。やさしいは、推測を保安官への行動だけにし、ときどき手を誤る
 * CPU の判断にはゲームの乱数を使わない（記録の再現がずれるため）。状態から作った別の乱数を使う
 */

import { createRandom } from './random.js';
import { DICE_COUNT, ROLES_BY_PLAYERS } from './characters.js';
import { createGameView } from './game-view.js';
import { TARGET_OF } from './game.js';

export const LEVELS = {
    normal: { inference: true, mistake: 0, wildTarget: 0 },
    easy: { inference: false, mistake: 0.3, wildTarget: 0.35 }
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- 推測 ----

// 各人が保安官の味方らしいか（＋）、敵らしいか（−）
export function suspicions(view, level = 'normal') {
    const full = LEVELS[level]?.inference ?? true;
    const s = view.players.map(() => 0);
    const known = view.players.map(p => p.role);
    const fixed = (i) => known[i] !== null && known[i] !== undefined;
    const roleScore = { sheriff: 10, deputy: 6, outlaw: -6, renegade: 0 };
    const sheriff = known.indexOf('sheriff');
    view.acts.forEach(act => {
        const a = act.from;
        if (fixed(a) && a !== view.you) return;
        if (act.type === 'shot') {
            const b = act.to;
            if (b === sheriff) s[a] -= 3 * act.amount;
            else if (full) s[a] -= 0.5 * clamp(fixed(b) ? roleScore[known[b]] : s[b], -3, 3) * act.amount;
        } else if (act.type === 'beer') {
            const b = act.to;
            if (b === a) return;
            if (b === sheriff) s[a] += 2;
            else if (full) s[a] += 0.4 * clamp(fixed(b) ? roleScore[known[b]] : s[b], -3, 3);
        } else if (act.type === 'gatling') {
            if (sheriff >= 0 && a !== sheriff) s[a] -= full ? 1 : 0.5;
        }
    });
    view.players.forEach((p, i) => { if (fixed(i)) s[i] = roleScore[known[i]]; });
    return s;
}

// 自分から見て、各人をどれだけ倒したいか（＋：倒したい、−：守りたい）
export function hostilities(view, level = 'normal') {
    const me = view.you;
    const myRole = view.players[me].role;
    const s = suspicions(view, level);
    const alive = view.players.filter(p => p.alive);
    // まだ分からない役割の残り（配った役割から、見えている役割を引く）。ふつうの CPU は、これで推測を補う
    const pool = { deputy: 0, outlaw: 0, renegade: 0, sheriff: 0 };
    (ROLES_BY_PLAYERS[view.players.length] ?? []).forEach(r => { pool[r]++; });
    view.players.forEach(p => { if (p.role) pool[p.role]--; });
    const unknown = (i) => view.players[i].role === null;
    if (LEVELS[level]?.inference ?? true) {
        view.players.forEach((p, i) => {
            if (!unknown(i)) return;
            if (pool.deputy === 0) s[i] = Math.min(s[i], -6);                        // 残りは全員、保安官の敵
            else if (pool.outlaw === 0 && pool.renegade === 0) s[i] = Math.max(s[i], 6); // 残りは全員、副保安官
        });
    }
    return view.players.map((p, i) => {
        if (i === me) return -8;
        if (!p.alive) return 0;
        if (view.threePlayer) {
            // 自分の的をいちばん狙う。残りが2人なら倒し合い（最後の1人が勝つ）
            if (alive.length === 2 || p.role === TARGET_OF[myRole]) return 10;
            return 1;
        }
        switch (myRole) {
            case 'sheriff': return -s[i];
            case 'deputy': return p.role === 'sheriff' ? -10 : -s[i];
            case 'outlaw':
                if (p.role === 'sheriff') return 10;
                // ほかの無法者が残っていなければ、分からない人は全員敵
                if (unknown(i) && pool.outlaw === 0 && (LEVELS[level]?.inference ?? true)) return 1 + Math.max(0, s[i]);
                return s[i] * 0.8 + 0.3;
            case 'renegade':
                // 保安官は最後に倒す。それまでは、ほかの全員が敵（特に無法者らしい人）
                if (p.role === 'sheriff') return alive.length > 2 ? -3 : 10;
                return 1 + Math.max(0, -s[i]) * 0.5;
            default: return 0;
        }
    });
}

// ---- 距離（ビューから） ----

// 前の手番までに脱落した人は飛ばす（この手番の中で倒れた人は数える。ゲームの distance と同じ）
export function distance(view, from, to) {
    const order = view.turn?.seated ?? view.players.filter(p => p.alive).map(p => p.id);
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a < 0 || b < 0) return Infinity;
    const d = Math.abs(a - b);
    return Math.min(d, order.length - d);
}

// 1か2で撃てる人（ゲームの shotTargets と同じ決まり）
export function shotTargets(view, seat, face) {
    const ch = view.players[seat].character;
    let ranges = ch === 'calamity' ? [1, 2] : [face === '1' ? 1 : 2];
    if (ch === 'rose') ranges = [...new Set(ranges.flatMap(r => [r, r + 1]))];
    const seated = view.turn?.seated ?? view.players.filter(p => p.alive).map(p => p.id);
    const others = seated.filter(id => id !== seat).map(id => view.players[id]);
    const hit = others.filter(p => ranges.includes(distance(view, seat, p.id)));
    if (hit.length > 0) return hit.map(p => p.id);
    const far = Math.max(...others.map(p => distance(view, seat, p.id)));
    return others.filter(p => distance(view, seat, p.id) === far).map(p => p.id);
}

// ---- 判断 ----

// ビューから、次の操作を1つ決める（操作する番でなければ null）
export function chooseCommand(view, level = 'normal', random = Math.random) {
    const me = view.you;
    if (view.phase === 'end' || !view.actors.includes(me)) return null;
    const conf = LEVELS[level] ?? LEVELS.normal;
    const host = hostilities(view, level);
    const players = view.players;
    const myself = players[me];

    if (view.pending?.type === 'pedro') return { type: 'pedro', arrows: view.pending.max };   // 矢は持っていても損なので、捨てられるだけ捨てる
    if (view.pending) return decideBart(view, myself);
    const t = view.turn;
    if (t.stage === 'sid') return { type: 'sid', target: bestHealTarget(view, host, 1) };
    if (t.stage === 'roll') return decideRoll(view, host, conf, random);

    const opts = view.options;
    if (opts.shots.length > 0) {
        // 倒したい人を撃つ。撃てる相手が味方だけなら、いちばん害の少ない人
        let best = null;
        opts.shots.forEach(die => {
            opts.targets[die].forEach(target => {
                // すでに倒しきれるだけ狙った相手（この手番で倒れた人も）に撃つのは無駄
                const aimed = t.shots.filter(s => s.target === target).reduce((sum, s) => sum + s.amount, 0);
                const left = players[target].alive ? players[target].life - aimed : 0;
                let score = left <= 0 ? 0.05 : host[target] + (left <= 1 && host[target] > 0 ? 3 : 0);
                if (random() < conf.wildTarget) score = random() * 2;
                if (!best || score > best.score) best = { die, target, score };
            });
        });
        let double = null;
        if (myself.character === 'slab' && !t.slabUsed && opts.beers.length > 0 && best.score > 1) {
            const needHeal = players.some((p, i) => p.alive && host[i] < 0 && p.maxLife - p.life >= 2 && (i === me || host[i] <= -3));
            if (!needHeal) double = opts.beers[0];
        }
        return { type: 'shoot', die: best.die, target: best.target, double };
    }
    if (opts.beers.length > 0) {
        return { type: 'beer', die: opts.beers[0], target: bestHealTarget(view, host, 1) };
    }
    if (opts.kits.length > 0) {
        // 自分か味方の矢を捨てる
        const holders = players.filter(p => p.alive && p.arrows > 0 && host[p.id] <= 0)
            .sort((a, b) => host[a.id] - host[b.id] || b.arrows - a.arrows);
        return { type: 'kit', die: opts.kits[0], target: holders[0]?.id ?? null };
    }
    return null;
}

// 回復させる人：味方で、回復できる人。いなければ満タンの人（だれも得をしない）
function bestHealTarget(view, host, amount) {
    let best = null;
    view.players.forEach(p => {
        if (!p.alive) return;
        const room = Math.min(amount, p.maxLife - p.life);
        const urgency = room > 0 ? 1 + (p.life <= 2 ? 2 : 0) + (p.maxLife - p.life) * 0.1 : 0;
        const score = room > 0 ? -host[p.id] * urgency : 0.01 * (p.id === view.you ? 1 : 0);
        if (!best || score > best.score) best = { id: p.id, score };
    });
    return best.id;
}

// ダイスを残すか振り直すか
function decideRoll(view, host, conf, random) {
    const t = view.turn;
    const me = view.you;
    const myself = view.players[me];
    if (t.rolls === 0) return { type: 'roll', dice: [0, 1, 2, 3, 4] };
    const dice = t.dice;
    const dynamite = dice.filter(f => f === 'dynamite').length;
    const gatlingNeed = myself.character === 'willy' ? 2 : 3;
    const gatlings = dice.filter(f => f === 'gatling').length;
    const gatlingValue = view.players.reduce((sum, p) => sum + (p.alive && p.id !== me ? (p.character === 'paul' ? 0 : host[p.id]) : 0), 0) + myself.arrows * 1.5;
    const needHeal = view.players.some(p => p.alive && host[p.id] < 0 && p.life < p.maxLife);
    const reroll = [];
    for (let i = 0; i < DICE_COUNT; i++) {
        const f = dice[i];
        let keep;
        if (f === 'dynamite') keep = myself.character !== 'blackjack';
        else if (f === 'arrow') keep = false;
        else if (f === '1' || f === '2') keep = shotTargets(view, me, f).some(target => host[target] > 0.4);
        else if (f === 'beer') keep = needHeal || (myself.character === 'slab' && dice.some(x => x === '1' || x === '2'));
        else if (f === 'gatling') {
            keep = gatlings >= gatlingNeed ? gatlingValue > -2 : (gatlings + 1 >= gatlingNeed && gatlingValue > 0) || myself.character === 'kit' && myself.arrows > 0;
        }
        if (random() < conf.mistake) keep = !keep && f !== 'dynamite' ? random() < 0.5 : keep;
        if (!keep && (f !== 'dynamite' || myself.character === 'blackjack')) reroll.push(i);
    }
    // ダイナマイトが2つなら、体力が少ないときは振るのをやめる（3つ目で1点失うため）
    const risky = dynamite === 2 && myself.character !== 'blackjack' && myself.life <= 2;
    if (reroll.length === 0 || risky) return { type: 'stop' };
    return { type: 'roll', dice: reroll };
}

// バート・キャシディ：矢を取っても襲撃にならないなら矢を取る。襲撃で倒れそうなら体力で受ける
function decideBart(view, myself) {
    const amount = view.pending.amount;
    let arrows = 0;
    for (let k = 1; k <= view.pending.max; k++) {
        const pileAfter = view.arrowPile - k;
        const lifeAfter = myself.life - (amount - k);
        if (pileAfter > 0) arrows = k;
        else if (lifeAfter - (myself.arrows + k) > 0) arrows = k;
        else break;
    }
    return { type: 'bart', arrows };
}

// ---- ゲームを進める ----

// 操作を待っている人が CPU か
export function isCpuTurn(game) {
    const seat = game.actors()[0];
    return seat !== undefined && game.players[seat].isCPU;
}

// CPU に1手打たせる。決めた手が通らなければ、通る手を順に試す。進めたら true
export function runCpuStep(game, level = game.options.level) {
    const seat = game.actors()[0];
    if (seat === undefined) return false;
    const view = createGameView(game, seat, { events: false, since: Infinity });
    // CPU の乱数は、シードと操作の数から作る（ゲームの乱数は使わない）
    const random = createRandom((game.options.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1)) >>> 0);
    const command = chooseCommand(view, level, random);
    if (command && game.applyCommand(seat, command)) return true;
    for (const fallback of fallbackCommands(game, seat)) {
        if (game.applyCommand(seat, fallback)) return true;
    }
    return false;
}

// いちばん単純な手の候補（必ずどれかは通る）
export function fallbackCommands(game, seat) {
    const list = [];
    const t = game.turn;
    const ids = game.players.map(p => p.id);
    if (game.pending) return [{ type: game.pending.type, arrows: 0 }];
    if (t.stage === 'sid') return ids.map(target => ({ type: 'sid', target }));
    if (t.stage === 'roll') return [{ type: 'stop' }, { type: 'roll', dice: [0, 1, 2, 3, 4] }];
    for (let die = 0; die < DICE_COUNT; die++) {
        ids.forEach(target => {
            list.push({ type: 'shoot', die, target, double: null });
            list.push({ type: 'beer', die, target });
        });
        list.push({ type: 'kit', die, target: null });
    }
    return list;
}
