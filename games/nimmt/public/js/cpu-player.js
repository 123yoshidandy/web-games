/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（ほかの人の手札や、公開前に選んだカードはのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：手札の各カードについて、そのカードで列を引き取ってしまう危なさ（失点の見込み）を見積もり、いちばん安全なカードを出す
 * - normal（画面の CPU）は、見積もりが大ざっぱで、揺れがあり、ときどき2番目の手を選ぶ（強すぎないように）
 * - strong（強さを測る比較用）は、まだ見えていないカードを数えて、ほかの人が間に割り込む確率から見積もる
 */

import { CARD_COUNT, ROW_LIMIT, bullsOf, sumBulls, targetRow } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    normal: { counting: false, noise: 0.4, secondBest: 0.25 },
    strong: { counting: true, noise: 0.05, secondBest: 0 },
    random: { random: true } // でたらめに出す（強さを測る比較用）
};

// 今操作が必要な CPU の席
export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

export function chooseCpuCommand(game, seat, profile = PROFILES.normal) {
    // 見えていないカードを数えないなら、イベントは要らない（写すと遅い）
    const view = createGameView(game, seat, { since: game.logs.length, events: !!profile.counting });
    const random = cpuRandom(game, seat);
    if (profile.random) {
        if (view.phase === 'chooseRow') return { type: 'takeRow', row: Math.floor(random() * view.rows.length) };
        return { type: 'play', card: view.hand[Math.floor(random() * view.hand.length)] };
    }
    if (view.phase === 'chooseRow') return { type: 'takeRow', row: chooseRow(view.rows) };
    return { type: 'play', card: chooseCard(view, random, profile) };
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
    if (game.phase === 'chooseRow') return [0, 1, 2, 3].some(row => game.applyCommand(seat, { type: 'takeRow', row }));
    return game.players[seat].hand.some(card => game.applyCommand(seat, { type: 'play', card }));
}

// ---- 判断 ----

// 引き取る列：牛のいちばん少ない列。同じなら短い列
export function chooseRow(rows) {
    let best = 0;
    let bestCost = Infinity;
    rows.forEach((row, index) => {
        const cost = sumBulls(row) + row.length * 0.01;
        if (cost < bestCost) {
            best = index;
            bestCost = cost;
        }
    });
    return best;
}

// まだ見えていないカード（自分の手札・列・このラウンドで公開されたカード以外）
function unseenCards(view) {
    const seen = new Set([...view.hand, ...view.rows.flat()]);
    // このラウンドで公開されたカード（最後の配りより後の reveal）
    const lastDeal = view.events.findLastIndex(e => e.type === 'deal');
    view.events.slice(lastDeal + 1).filter(e => e.type === 'reveal').forEach(e => e.plays.forEach(p => seen.add(p.card)));
    const unseen = [];
    for (let c = 1; c <= CARD_COUNT; c++) if (!seen.has(c)) unseen.push(c);
    return unseen;
}

const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
const poisson = (lambda, k) => Math.exp(-lambda) * lambda ** k / factorial(k);

// カードを出したときの失点の見込み
function estimateCost(view, card, profile, unseen) {
    const rows = view.rows;
    const row = targetRow(rows, card);
    const others = view.players.length - 1;
    if (row < 0) {
        // どの列にも置けない：いちばん牛の少ない列を引き取る
        return Math.min(...rows.map(sumBulls)) + 0.5;
    }
    const last = rows[row].at(-1);
    const length = rows[row].length;
    const bulls = sumBulls(rows[row]);
    const gap = card - last;
    // 割り込みで列が伸びたときの牛（平均1.5頭）も見込む
    const grown = (k) => bulls + k * 1.5;
    if (profile.counting) {
        // ほかの人が末尾とこのカードの間のカードを出す数は、ポアソン分布で近似する
        const between = unseen.filter(c => c > last && c < card).length;
        const lambda = unseen.length > 0 ? others * between / unseen.length : 0;
        const needed = ROW_LIMIT - length; // ちょうどこの数だけ割り込まれると、このカードが6枚目になる
        return poisson(lambda, needed) * grown(needed);
    }
    // 大ざっぱな見積もり：列が長いほど、差が大きいほど危ない
    const danger = length >= 5 ? 0.85
        : length === 4 ? Math.min(0.6, gap / 20 * others / 3)
            : length === 3 ? Math.min(0.3, gap / 50 * others / 3)
                : 0.02;
    return danger * grown(ROW_LIMIT - length);
}

function chooseCard(view, random, profile) {
    const unseen = profile.counting ? unseenCards(view) : [];
    const scored = view.hand.map(card => {
        let cost = estimateCost(view, card, profile, unseen);
        // 安全なら、牛の多いカードや大きいカードを先に手放しておく（終盤に詰まらないように）
        cost -= bullsOf(card) * 0.02 + card * 0.0005;
        cost *= 1 + (random() * 2 - 1) * profile.noise;
        cost += random() * 0.05;
        return { card, cost };
    }).sort((a, b) => a.cost - b.cost);
    if (scored.length > 1 && random() < profile.secondBest) return scored[1].card;
    return scored[0].card;
}

// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(game.actors().includes(seat))) return null;
    return chooseCpuCommand(game, seat, PROFILES.strong);
}
