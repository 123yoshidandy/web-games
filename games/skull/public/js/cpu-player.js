/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、自分の札と公開された情報だけ（だれが何枚伏せたか・めくられた札・成功の数・取り除かれた札の数・このラウンドの宣言）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 推し量り：ほかの人の山にドクロがある見込みを、まだドクロを持っている見込み（取り除かれた枚数から）と、
 *   手札のうち伏せた割合から出す。このラウンドで挑戦・宣言した人は、自分の山から先にめくるので、ドクロを伏せていなさそうと見る
 * - 成功の見込み：宣言の数ごとに、ほかの人の山を見込みどおりに作って何度も試し、ドクロの見込みの低い山からめくったときに成功する割合
 *   自分の山の、めくる分にドクロがあれば 0
 * - 手番：伏せた札が十分あり、成功の見込みの高い数があれば挑戦する。なければ伏せる（ときどきドクロ。相手が1回成功していると多め）
 * - 上げ下げ：次の数の成功の見込みが十分なら上げる。自分の山にドクロがあるときは、ときどきはったりで上げてほかの人を誘う
 * - やさしい：宣言から推し量らず、見込みの線が甘く、はったりをしない
 */

import { FLOWER, SKULL } from './game.js';
import { createRandom } from './random.js';

export const PROFILES = {
    normal: { readBids: true, skullBias: 1.4, challengeLine: 0.55, raiseLine: 0.4, bluff: 0.05, skullRate: 0.25, samples: 300 },
    easy: { readBids: false, skullBias: 1, challengeLine: 0.55, raiseLine: 0.45, bluff: 0, skullRate: 0.25, samples: 120, noise: 0.15 },
    random: { random: true } // でたらめに選ぶ（強さを測る比較用）
};

export const isCpuTurn = (game) => !game.isOver() && game.actors().some(s => game.players[s].isCPU);
export const cpuActor = (game) => game.actors().find(s => game.players[s].isCPU) ?? null;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// このラウンドで宣言した人（挑戦を始めた人・上げた人）
function biddersThisRound(game) {
    const seats = new Set();
    for (let i = game.events.length - 1; i >= 0; i--) {
        const e = game.events[i];
        if (e.type === 'round') break;
        if (e.type === 'bid') seats.add(e.seat);
    }
    return seats;
}

// ほかの人の山（めくられていない部分）にドクロがある見込み
export function skullChance(game, seat, other, profile) {
    const p = game.players[other];
    const hidden = p.stack.length - p.revealed;
    if (hidden <= 0) return 0;
    const total = p.discs.F + p.discs.S; // 持っている札の枚数は公開
    const lost = p.lost;
    // 取り除かれるたびに、ドクロが残っている見込みが下がる（見ずに取るので、1枚ずつ同じ確からしさ）
    const stillHas = Math.max(0, (4 - lost) / 4);
    const share = Math.min(0.95, (p.stack.length / Math.max(1, total)) * profile.skullBias);
    let chance = stillHas * share;
    if (profile.readBids && biddersThisRound(game).has(other)) chance *= 0.25;
    // めくった分が花だったら、残りにある見込みに直す
    const shown = p.revealed / p.stack.length;
    return Math.min(0.95, chance * (1 - shown) / Math.max(0.05, 1 - chance * shown));
}

// 次にめくる札がドクロの見込み（1枚あたり）
const nextRisk = (q, hidden) => (hidden > 0 ? q / hidden : 1);

// 自分の山の、上から count 枚にドクロがあるか
function ownSkullWithin(game, seat, count) {
    const p = game.players[seat];
    const top = p.stack.slice(-count);
    return top.includes(SKULL);
}

// 宣言 bid で挑戦したときの成功の見込み（何度も試して数える）
export function successChance(game, seat, bid, profile, random) {
    const me = game.players[seat];
    const own = me.stack.length;
    if (ownSkullWithin(game, seat, Math.min(bid, own))) return 0;
    const need = bid - Math.min(bid, own);
    if (need === 0) return 1;
    const others = game.players.filter(p => p.id !== seat && !p.out && p.stack.length > 0).map(p => ({ id: p.id, n: p.stack.length - p.revealed, q: skullChance(game, seat, p.id, profile) }));
    if (others.reduce((s, o) => s + o.n, 0) < need) return 0;
    let ok = 0;
    for (let t = 0; t < profile.samples; t++) {
        // 見込みどおりに、各山のドクロの位置（上から何枚目か。なければ Infinity）を決める
        const skullAt = others.map(o => (random() < o.q ? Math.floor(random() * o.n) : Infinity));
        const flipped = others.map(() => 0);
        let left = need;
        let failed = false;
        while (left > 0) {
            // まだめくれる山のうち、次の札がドクロの見込みのいちばん低い山
            let best = -1;
            let bestRisk = Infinity;
            others.forEach((o, i) => {
                const hidden = o.n - flipped[i];
                if (hidden <= 0) return;
                const r = nextRisk(o.q, hidden);
                if (r < bestRisk) {
                    bestRisk = r;
                    best = i;
                }
            });
            if (best < 0) {
                failed = true;
                break;
            }
            if (flipped[best] === skullAt[best]) {
                failed = true;
                break;
            }
            flipped[best]++;
            left--;
        }
        if (!failed) ok++;
    }
    return ok / profile.samples;
}

function chooseDisc(game, seat, profile, random) {
    const hand = game.hand(seat);
    if (hand.S === 0) return { type: 'place', disc: FLOWER };
    if (hand.F === 0) return { type: 'place', disc: SKULL };
    // 相手が1回成功していると、ドクロで止めにいく
    const danger = game.players.some(p => p.id !== seat && !p.out && p.wins >= 1);
    const rate = profile.skullRate + (danger ? 0.2 : 0);
    return { type: 'place', disc: random() < rate ? SKULL : FLOWER };
}

// 成功の見込みが line 以上の、いちばん大きい数（なければ 0）
function bestBid(game, seat, from, profile, random, line) {
    const total = game.totalOnMats();
    let best = 0;
    for (let b = from; b <= total; b++) {
        const chance = successChance(game, seat, b, profile, random) + (profile.noise ? (random() - 0.5) * 2 * profile.noise : 0);
        if (chance >= line) best = b;
        else break;
    }
    return best;
}

export function chooseCpuCommand(game, seat, profile = PROFILES.normal) {
    const random = cpuRandom(game, seat);
    const me = game.players[seat];
    if (game.phase === 'lose') {
        // 花が2枚以上あれば花を、なければドクロを手放す
        return { type: 'lose', disc: me.discs.F >= 2 || me.discs.S === 0 ? FLOWER : SKULL };
    }
    if (game.phase === 'ante') {
        if (profile.random) return { type: 'place', disc: game.hand(seat).S && random() < 0.3 ? SKULL : FLOWER };
        return chooseDisc(game, seat, profile, random);
    }
    if (game.phase === 'reveal') {
        if (me.revealed < me.stack.length) return { type: 'flip', target: seat };
        const options = game.players.filter(p => p.id !== seat && p.revealed < p.stack.length);
        if (profile.random) return { type: 'flip', target: options[Math.floor(random() * options.length)].id };
        // 次の札がドクロの見込みのいちばん低い山
        const scored = options.map(p => ({ id: p.id, risk: nextRisk(skullChance(game, seat, p.id, profile), p.stack.length - p.revealed) }));
        scored.sort((a, b) => a.risk - b.risk || b.id - a.id);
        return { type: 'flip', target: scored[0].id };
    }
    const total = game.totalOnMats();
    if (game.phase === 'turn') {
        const hand = game.handCount(seat);
        if (profile.random) {
            if (hand > 0 && random() < 0.6) return chooseDisc(game, seat, PROFILES.easy, random);
            return { type: 'challenge', bid: 1 + Math.floor(random() * total) };
        }
        const active = game.players.filter(p => !p.out).length;
        const best = bestBid(game, seat, 1, profile, random, profile.challengeLine);
        if (hand === 0) return { type: 'challenge', bid: Math.max(1, best) };
        // 伏せた札が人数より多く、十分な数で成功しそうなら挑戦
        const enough = total >= active + 1 && best >= Math.min(total, Math.max(2, me.stack.length + 1));
        if (enough) return { type: 'challenge', bid: best };
        // はったり：自分の山の上にドクロがあり、ほかの人が上げてきそうなら、小さく挑戦して誘う
        if (profile.bluff && me.stack.at(-1) === SKULL && total >= active + 1 && random() < profile.bluff) return { type: 'challenge', bid: 1 };
        return chooseDisc(game, seat, profile, random);
    }
    if (game.phase === 'bid') {
        const next = game.bid + 1;
        if (profile.random) return next <= total && random() < 0.4 ? { type: 'raise', bid: next } : { type: 'pass' };
        if (next > total) return { type: 'pass' };
        const chance = successChance(game, seat, next, profile, random) + (profile.noise ? (random() - 0.5) * 2 * profile.noise : 0);
        if (chance >= profile.raiseLine) return { type: 'raise', bid: next };
        // はったり：自分の山にドクロがあり、ほかに降りていない人が2人以上いて、まだ上げる余地があるとき
        const still = game.players.filter(p => !p.out && !game.passed.includes(p.id) && p.id !== seat).length;
        if (profile.bluff && me.stack.includes(SKULL) && still >= 2 && next + 1 < total && random() < profile.bluff) return { type: 'raise', bid: next };
        return { type: 'pass' };
    }
    return null;
}

// 人の席のおすすめの手（ヒント）。CPU（ふつう）と同じ判断（自分の札と公開された情報だけ）。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

// CPU の1手を進める。選んだ手が通らなければ、単純な手で進める（止まらないように）
export function runCpuStep(game, seat = cpuActor(game), profile = PROFILES.normal) {
    if (seat === null || game.isOver() || !game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return [{ type: 'pass' }, { type: 'place', disc: FLOWER }, { type: 'place', disc: SKULL }, { type: 'challenge', bid: 1 }, { type: 'flip', target: seat },
        ...game.players.map(p => ({ type: 'flip', target: p.id })), { type: 'lose', disc: FLOWER }, { type: 'lose', disc: SKULL }]
        .some(c => game.applyCommand(seat, c));
}
