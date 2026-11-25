/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（山札の並び、除いたカード、後半にほかの人が先に出した物件はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 物件の値打ちは、売りでもらえそうな小切手の額（物件の数のおよそ半分）と見る
 * - 競り：一番高い物件と一番安い物件の値打ちの差に、控えめさの係数を掛けた額まで上げ、超えたら降りる
 * - 売り：ほかの人の残りの物件から、自分の物件が何番目になりそうかを見積もり、
 *   その順位でもらえそうな小切手から、その物件を後に残したときの値打ちを引いた分が、一番大きい物件を出す
 * - easy（やさしい）は、値打ちの差を大きく見て払いすぎ、売りは大まかな決め方で、揺れが大きい
 * - normal（ふつう）は、上の見積もりに揺れと、ときどきの誤りを混ぜる（強すぎないように）
 * - strong（強さを測る比較用）は、揺れも誤りもない
 */

import { CHECKS } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { greed: 1.05, noise: 3.5, jump: 0.3, sellNoise: 4, careless: 0.35 },
    normal: { greed: 0.8, noise: 1.5, jump: 0.1, sellNoise: 1.5, careless: 0.08 },
    strong: { greed: 0.8, noise: 0, jump: 0, sellNoise: 0, careless: 0 },
    random: { random: true } // でたらめに選ぶ（強さを測る比較用）
};

// 画面で選ぶ強さ
export const LEVELS = { easy: 'やさしい', normal: 'ふつう' };

// 今操作が必要な CPU の席
export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

export function chooseCpuCommand(game, seat, profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    const random = cpuRandom(game, seat);
    return view.phase === 'bid' ? decideBid(view, random, profile) : decideSale(view, random, profile);
}

// seat の CPU に1手打たせる。決めた手が断られたら、いちばん単純な手を試す（必ず前に進める）
export function runCpuStep(game, seat, profile) {
    if (!game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    if (game.phase === 'bid') return game.applyCommand(seat, { type: 'pass' });
    return game.players[seat].hand.some(card => game.applyCommand(seat, { type: 'sell', card }));
}

// ---- 判断 ----

// 物件の値打ち（売りでもらえそうな小切手の額）
export const worth = (card) => (card - 1) / 29 * 15;

export function decideBid(view, random, profile = PROFILES.normal) {
    const range = view.options?.range;
    if (!range) return { type: 'pass' };
    const open = view.market.filter(m => m.takenBy === null).map(m => m.card);
    if (profile.random) return random() < 0.5 ? { type: 'pass' } : { type: 'bid', amount: range.min };
    // 上げてまで欲しい額：一番高い物件と、降りれば取れる一番安い物件の値打ちの差
    const limit = (worth(open.at(-1)) - worth(open[0])) * profile.greed + (random() * 2 - 1) * profile.noise;
    if (range.min > limit) return { type: 'pass' };
    // ときどき、少し多めに上げて相手を降ろしにかかる
    const extra = random() < profile.jump ? 1 + Math.floor(random() * 2) : 0;
    const amount = Math.min(range.max, Math.max(range.min, Math.min(range.min + extra, Math.floor(limit))));
    return { type: 'bid', amount };
}

// 残りの小切手の平均（まだ見ていない小切手。除いたカードも含む）
function meanUnseenCheck(view) {
    const pool = [...CHECKS];
    [...view.checkMarket, ...view.players.flatMap(p => p.checks)].forEach(c => pool.splice(pool.indexOf(c), 1));
    return pool.length > 0 ? pool.reduce((s, c) => s + c, 0) / pool.length : 0;
}

export function decideSale(view, random, profile = PROFILES.normal) {
    const me = view.players[view.you];
    const hand = me.hand;
    if (profile.random || hand.length === 1) return { type: 'sell', card: hand[Math.floor(random() * hand.length)] };
    const checks = view.checkMarket; // 大きい順
    const others = view.players.filter(p => p.id !== view.you);
    const allLeft = view.players.flatMap(p => p.hand);
    const mean = meanUnseenCheck(view);
    const scored = hand.map(card => {
        // ほかの人がこの物件より高いものを出す見込みの数 → もらえそうな小切手
        const above = others.reduce((sum, p) => sum + p.hand.filter(c => c > card).length / p.hand.length, 0);
        const index = Math.min(checks.length - 1, above);
        const low = Math.floor(index);
        const now = checks[low] + (checks[Math.min(checks.length - 1, low + 1)] - checks[low]) * (index - low);
        // 後に残したときの値打ち：残りの物件の中での順位 × 小切手の平均の2倍
        const share = allLeft.filter(c => c < card).length / Math.max(1, allLeft.length - 1);
        const later = share * mean * 2;
        return { card, value: now - later + (random() * 2 - 1) * profile.sellNoise };
    }).sort((a, b) => b.value - a.value);
    if (random() < profile.careless) return { type: 'sell', card: scored[1].card };
    return { type: 'sell', card: scored[0].card };
}
