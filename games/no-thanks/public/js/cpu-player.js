/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（ほかの人のチップの数、山札、除いた9枚はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：取ったときの実質の失点（増える失点 − 上のチップ）が、がまんできる値以下なら取る
 *   - がまんできる値は、手元のチップが少ないほど上がる（チップが尽きると、何でも取るしかなくなるため）
 *   - 自分の数につながるカードで、ほかの人にはつながらないなら、あえて回してチップを集める（milk）
 *   - ほかの人の数につながるカードは、取られる前に早めに取る（deny）
 * - easy（やさしい）は、チップの残りをあまり気にせず、集めも邪魔もせず、揺れと誤りが大きい
 * - normal（ふつう）は、上の全部を使うが、揺れとときどきの誤りを混ぜる（強すぎないように）
 * - strong（強さを測る比較用）は、揺れも誤りもない
 */

import { addedPoints } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { base: 9, scarcity: 0.4, milk: 0, deny: 0, noise: 5, blunder: 0.15 },
    normal: { base: 7, scarcity: 1.4, milk: 0.6, deny: 3, noise: 2.5, blunder: 0.05 },
    strong: { base: 7, scarcity: 1.4, milk: 1, deny: 3, noise: 0, blunder: 0 },
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
    return decide(view, cpuRandom(game, seat), profile);
}

// seat の CPU に1手打たせる。決めた手が断られたら、取る（取るのはいつでもできるので、必ず前に進む）
export function runCpuStep(game, seat, profile) {
    if (!game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return game.applyCommand(seat, { type: 'take' });
}

// ---- 判断 ----

// 取ったら、実質いくつ失点が増えるか（マイナスなら得）
export function netCost(cards, card, pot) {
    return addedPoints(cards, card) - pot;
}

// ほかの人のうち、そのカードがつながる（増える失点が小さい）人がいるか
const wantedByOthers = (view, card) => view.players.some(p => p.id !== view.you && addedPoints(p.cards, card) <= 1);

// がまんできる値（実質の失点がこれ以下なら取る）。判断の揺れを除いた値
export function tolerance(view, profile) {
    const me = view.players[view.you];
    const chips = me.chips;
    // チップが少ないほど、早めに取ってチップを補う
    let limit = profile.base + profile.scarcity * Math.max(0, 6 - chips) * 1.5;
    // ほかの人につながるカードは、回ってくる前に取られやすい
    if (wantedByOthers(view, view.current) && addedPoints(me.cards, view.current) < view.current) limit += profile.deny;
    return limit;
}

export function decide(view, random, profile = PROFILES.normal) {
    const me = view.players[view.you];
    if (me.chips === 0) return { type: 'take' };
    if (profile.random) return { type: random() < 0.5 ? 'pass' : 'take' };
    const card = view.current;
    const added = addedPoints(me.cards, card);
    const cost = added - view.pot;
    const others = view.players.length - 1;

    // 自分にだけつながるカードは、ほかの人が欲しがらない間、回してチップを集める
    // ほかの人の実質の失点（カードの数 − 次に回ってくるまでに増えるチップ）がまだ大きい間だけ
    if (added <= 1 && !wantedByOthers(view, card) && me.chips >= 3 && view.deckCount > 0
        && card - (view.pot + others) > 10 && random() < profile.milk) {
        return { type: 'pass' };
    }

    const limit = tolerance(view, profile) + (random() * 2 - 1) * profile.noise;
    let take = cost <= limit;
    // 迷う場面で、ときどき逆を選ぶ
    if (Math.abs(cost - limit) < 6 && random() < profile.blunder) take = !take;
    return { type: take ? 'take' : 'pass' };
}
