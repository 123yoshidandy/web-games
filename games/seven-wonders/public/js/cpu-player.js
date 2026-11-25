/**
 * CPU：自分のビュー（自分の手札と、公開されている都市）だけで判断する
 *
 * 手札ごとに「建てる・不思議の段階・捨てる」を評価して、一番よいものを選ぶ
 *   点の増え方：最後の得点の計算で、そのカード（段階）を足したときの差（市民・科学・ギルド・商業・不思議）
 *   軍事：両隣との勝ち負けが変わるか（時代の点）
 *   資源・交易：まだ持っていない資源ほど、早い時代ほど高い
 *   払うコイン：1 コインを約 0.4 点として引く（隣に払うと、隣が得をする分も少し引く）
 * 強すぎないように、人間らしいゆらぎを入れる（LEVELS）
 */

import { createRandom } from './random.js';
import { cardOf, MILITARY_WIN, RAW } from './cards.js';
import { scoreOf, shieldsOf, stagesOf, producersOf, leftOf, rightOf } from './city.js';
import { createGameView } from './game-view.js';

export const LEVELS = {
    easy: { noise: 1.5, militaryCare: 0.5, resourceCare: 0.8, wonderCare: 0.9 },
    normal: { noise: 1.1, militaryCare: 0.8, resourceCare: 1, wonderCare: 1 },
    // 強さを測るための、ゆらぎのない CPU（画面では使わない）
    strong: { noise: 0, militaryCare: 1, resourceCare: 1, wonderCare: 1 },
    // 比べるための、でたらめに打つ CPU（画面では使わない）
    random: { noise: 100, militaryCare: 0, resourceCare: 0, wonderCare: 0 }
};

const COIN_VALUE = 0.4;

function viewRandom(view) {
    return createRandom((Math.imul(view.eventSeq + 1, 2654435761) ^ Math.imul(view.seat + 1, 40503) ^ (view.age * 977)) >>> 0);
}

const citiesOf = view => view.players.map(p => p.city);

// 都市にカード（または段階）を足したときの、自分の点の差（軍事のトークンは時代の終わりに決まるので、別に見る）
function scoreDelta(cities, seat, change) {
    const before = scoreOf(cities, seat);
    const next = cities.map((c, i) => (i === seat ? change({ ...c, built: [...c.built] }) : c));
    const after = scoreOf(next, seat);
    return (after.total - after.military - after.treasury) - (before.total - before.military - before.treasury);
}

// 盾を足したときの、両隣との勝ち負けの変化の値打ち
function militaryValue(cities, seat, shields, age, cfg) {
    if (!shields) return 0;
    const n = cities.length;
    const mine = shieldsOf(cities[seat]);
    let value = 0;
    [leftOf(seat, n), rightOf(seat, n)].forEach(other => {
        const theirs = shieldsOf(cities[other]);
        const before = mine > theirs ? MILITARY_WIN[age] : mine < theirs ? -1 : 0;
        const after = mine + shields > theirs ? MILITARY_WIN[age] : mine + shields < theirs ? -1 : 0;
        value += after - before;
        // まだ時代の途中なので、少し先まで見て、追いつかれにくさにも値打ちを付ける
        if (after > 0 && mine + shields - theirs <= 1) value -= 0.3;
    });
    // 次の時代の分の見込み（盾は持ち越される）
    value += shields * (age < 3 ? 0.6 : 0);
    return value * cfg.militaryCare;
}

// まだ建てていない段階の費用のうち、自分の生産（選べないもの）で足りない資源の数
export function wonderShortage(city) {
    const need = {};
    stagesOf(city).slice(city.stages).forEach(stage => {
        const counts = {};
        [...stage.cost].forEach(r => { counts[r] = (counts[r] ?? 0) + 1; });
        Object.entries(counts).forEach(([r, k]) => { need[r] = Math.max(need[r] ?? 0, k); });
    });
    producersOf(city).forEach(p => { if (p.length === 1 && need[p[0]]) need[p[0]]--; });
    return need;
}

// 生産を増やす値打ち（まだ持っていない資源ほど、早い時代ほど高い。不思議の段階に足りない資源なら、さらに高い）
function resourceValue(city, produce, age, cfg) {
    if (!produce) return 0;
    const have = new Set(producersOf(city).flat());
    const ageWeight = { 1: 1.8, 2: 1.1, 3: 0.25 }[age];
    const shortage = wonderShortage(city);
    let value = 0;
    produce.forEach(options => {
        const fresh = options.filter(r => !have.has(r)).length;
        value += (fresh > 0 ? 1 : 0.45) * ageWeight * (options.length > 1 ? 1.1 : 1);
        // 加工品は持っている人が少なく、売り買いで困りやすい
        if (options.every(r => !RAW.includes(r)) && fresh > 0) value += 0.4 * ageWeight;
        // 不思議の段階に要るのに足りない資源
        if (options.some(r => shortage[r] > 0)) {
            value += cfg.wonderCare * ({ 1: 2.2, 2: 1.6, 3: 0.8 }[age]);
            options.forEach(r => { if (shortage[r] > 0) shortage[r]--; });
        }
    });
    return value * cfg.resourceCare;
}

function cardValue(view, seat, id, cfg) {
    const cities = citiesOf(view);
    const city = cities[seat];
    const c = cardOf(id);
    const age = view.age;
    let value = scoreDelta(cities, seat, next => { next.built.push(id); return next; });
    value += militaryValue(cities, seat, c.shields, age, cfg);
    value += resourceValue(city, c.produce, age, cfg);
    if (c.trade) value += { 1: 1.3, 2: 0.7, 3: 0.1 }[age];
    if (c.gain) {
        const coins = c.gain.per ? c.gain.coins * 2 : c.gain.coins; // 数で決まるコインは、だいたいの見込み
        value += coins * COIN_VALUE;
    }
    // 次の時代に無料で建てられる建物につながる
    if (age < 3 && c.color !== 'brown' && c.color !== 'grey') value += 0.3;
    // 科学は、集めるほど伸びる（早い時代ほど先の伸びがある）
    if (c.science && c.science !== 'any') value += 0.6 * (3 - age);
    return value;
}

function stageValue(view, seat, cfg) {
    const cities = citiesOf(view);
    const city = cities[seat];
    const stage = stagesOf(city)[city.stages];
    if (!stage) return -Infinity;
    const age = view.age;
    let value = scoreDelta(cities, seat, next => { next.stages++; return next; });
    value += militaryValue(cities, seat, stage.shields, age, cfg);
    value += (stage.coins ?? 0) * COIN_VALUE;
    const effect = {
        rawChoice: 2.4 * ({ 1: 1, 2: 0.8, 3: 0.2 }[age]), manufacturedChoice: 2 * ({ 1: 1, 2: 0.8, 3: 0.2 }[age]),
        freeBuild: 2 * (4 - age), playLast: 1.2 * (4 - age), buildDiscard: 3, tradeRaw: 1.5 * (3 - age), copyGuild: 3.5
    }[stage.effect] ?? 0;
    // 段階に使ったカードは隣に渡らない分の得もある。時代の終わりの手番は、残す価値の低いカードを段階に使いやすい
    const late = view.turn >= 5 ? 1 : 0;
    return value + effect + (1.6 + late) * cfg.wonderCare;
}

// 払うコインの値打ち（隣に払うと隣が得をするので、少し重く見る）
const payCost = (coins, pay) => (coins + pay.left + pay.right) * COIN_VALUE + (pay.left + pay.right) * 0.1;

/**
 * 手の候補と評価を全部返す（テストと強さの測定に使う）
 */
export function scoreCandidates(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    const seat = view.seat;
    const candidates = [];
    const push = (command, value) => candidates.push({ command, value: value + (random() * 2 - 1) * cfg.noise });
    const stage = stageValue(view, seat, cfg);
    view.handOptions.forEach(({ card, build, wonder }) => {
        const c = cardOf(card);
        if (build) {
            const base = cardValue(view, seat, card, cfg);
            if (build.free === 'chain') push({ type: 'play', card, action: 'build', pay: { left: 0, right: 0 }, free: 'chain' }, base + 0.3);
            else {
                const pay = build.options[0];
                if (pay) push({ type: 'play', card, action: 'build', pay, free: null }, base - payCost(c.coins, pay));
                // オリンピアの無料の建設は、高いカードに使う
                if (build.olympia) push({ type: 'play', card, action: 'build', pay: { left: 0, right: 0 }, free: 'olympia' }, base - 1.2 + Math.min(3, c.cost.length * 0.4));
            }
        }
        if (wonder) push({ type: 'play', card, action: 'wonder', pay: wonder[0] }, stage - payCost(0, wonder[0]));
        // 捨てて 3 コイン（建てる価値が低いカードを捨てる）
        push({ type: 'play', card, action: 'discard' }, 3 * COIN_VALUE + 0.1 - cardValue(view, seat, card, cfg) * 0.08);
    });
    return candidates;
}

export function chooseCommand(view, cfg = LEVELS.normal) {
    if (view.phase === 'discardBuild') {
        let best = null;
        view.discardBuildable.forEach(card => {
            const value = cardValue(view, view.seat, card, cfg);
            if (!best || value > best.value) best = { card, value };
        });
        return { type: 'discardBuild', card: best?.card ?? null };
    }
    let best = null;
    scoreCandidates(view, cfg).forEach(c => { if (!best || c.value > best.value) best = c; });
    return best?.command ?? null;
}

// 選ぶ番の CPU の席
export function cpuSeatsToAct(game) {
    if (game.isOver()) return [];
    return game.waiting.filter(s => game.players[s].isCPU && !game.pending?.[s]);
}

// CPU の席 seat が 1 手選ぶ。選べたら true（CPU には自分のビューだけを渡す）
export function runCpuStep(game, seat, levelOf = () => 'normal') {
    if (!cpuSeatsToAct(game).includes(seat)) return false;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, LEVELS[levelOf(seat)] ?? LEVELS.normal);
    if (command && game.applyCommand(seat, command)) return true;
    // 想定外の断りでも止めない：捨てる（捨て札から建てるときは、建てない）
    if (game.phase === 'discardBuild') return game.applyCommand(seat, { type: 'discardBuild', card: null });
    return game.applyCommand(seat, { type: 'play', card: game.hands[seat][0], action: 'discard' });
}

// 全員が CPU のとき、全員が選び終わるまで進める（テストと測定に使う）
export function runCpuRound(game, levelOf) {
    let moved = false;
    for (const seat of cpuSeatsToAct(game)) moved = runCpuStep(game, seat, levelOf) || moved;
    return moved;
}
