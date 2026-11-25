/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席から見えるものだけ（自分の手札・場・宣言・枚数。ほかの人の手札はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 手札を組に分け（爆弾 → 階段 → 連続ペア → 3枚組・フルハウス → ペア → 1枚）、組の数と強い札（竜・不死鳥・A・爆弾）で手札の強さを測る
 * - 宣言：最初の8枚が強ければ大ティチュー、14枚が強ければ最初の札を出す前にティチュー。味方が宣言していればしない
 * - 渡す：味方には強い札（自分が宣言したら弱い札）、相手にはばらの弱い札（犬は相手へ）
 * - 出す：最初に出すときは、弱い組から（枚数の多い組を先に）。味方が宣言していたり上がりそうなら、犬で味方に番を渡す
 *   続けて出すときは、味方の場には重ねない。相手の場には、組を崩さずに出せるいちばん弱い組で勝つ
 *   相手が宣言している・上がりそう・場の点が多いときは、強い札や爆弾も使う
 * - やさしい：犬と爆弾を作戦に使わず、宣言は少なく、ときどき気まぐれにパスする
 */

import { MAHJONG, DOG, PHOENIX, DRAGON, rankOf, cardPoints, pointsOf, enumerateCombos, classify, sortCards } from './cards.js';
import { partnerOf, teamOf, PLAYERS } from './game.js';
import { createRandom } from './random.js';

export const PROFILES = {
    normal: { grandLine: 5, tichuLine: 1.5, whim: 0, tactics: true },
    easy: { grandLine: 99, tichuLine: 2.5, whim: 0.15, tactics: false },
    random: { random: true } // でたらめに選ぶ（強さを測る比較用）
};

export const isCpuTurn = (game) => !game.isOver() && game.actors().some(s => game.players[s].isCPU);

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// ---- 手札を組に分ける ----

// 手札を組に分ける（少ない組で出し切れる分け方を、欲張りに探す）。{ combos, singles }
export function decompose(hand) {
    let rest = sortCards(hand);
    const combos = [];
    const take = (cards) => {
        combos.push(classify(cards));
        rest = rest.filter(c => !cards.includes(c));
    };
    // 爆弾（同じ色の階段、同じ数の4枚）
    for (const bomb of enumerateCombos(rest).filter(c => c.type === 'bomb').sort((a, b) => b.length - a.length)) {
        if (bomb.cards.every(c => rest.includes(c))) take(bomb.cards);
    }
    const count = (r) => rest.filter(c => c !== PHOENIX && rankOf(c) === r && c !== DOG && c !== DRAGON).length;
    // 階段：ペアや3枚組をあまり崩さないものを、長い順に
    for (;;) {
        const straights = enumerateCombos(rest.filter(c => c !== PHOENIX)).filter(c => c.type === 'straight');
        const scored = straights.map(s => {
            const broken = s.cards.filter(c => count(rankOf(c)) >= 2).length;
            return { s, value: s.length - broken * 1.5 };
        }).filter(x => x.value >= 3.5).sort((a, b) => b.value - a.value || b.s.length - a.s.length);
        if (!scored.length) break;
        take(scored[0].s.cards);
    }
    // 連続ペア
    for (;;) {
        const runs = enumerateCombos(rest.filter(c => c !== PHOENIX)).filter(c => c.type === 'pairs').sort((a, b) => b.length - a.length || a.rank - b.rank);
        if (!runs.length) break;
        take(runs[0].cards);
    }
    // 3枚組（ペアがあればフルハウスに）・ペア
    const groups = new Map();
    rest.filter(c => c < 52).forEach(c => {
        const r = rankOf(c);
        groups.set(r, [...(groups.get(r) ?? []), c]);
    });
    const triples = [...groups.values()].filter(g => g.length === 3);
    const pairs = [...groups.values()].filter(g => g.length === 2);
    for (const t of triples) {
        const p = pairs.shift();
        take(p ? [...t, ...p] : t);
    }
    for (const p of pairs) take(p);
    // 残りは1枚ずつ（犬も含む）
    const singles = [...rest];
    singles.forEach(c => take([c]));
    return { combos, singles };
}

// 手札の強さ（大きいほど強い）。宣言の判断に使う
export function handStrength(hand) {
    const { combos } = decompose(hand);
    let control = 0;
    for (const c of hand) {
        if (c === DRAGON) control += 1.3;
        else if (c === PHOENIX) control += 1;
        else if (c < 52 && rankOf(c) === 14) control += 0.75;
        else if (c < 52 && rankOf(c) === 13) control += 0.25;
    }
    const bombs = combos.filter(c => c.type === 'bomb').length;
    const weak = combos.filter(c => c.type === 'single' && c.rank <= 10 && c.cards[0] !== DOG).length;
    const playable = combos.filter(c => c.type !== 'dog').length;
    return control + bombs * 1.8 - Math.max(0, playable - 5) * 0.45 - weak * 0.35;
}

// 大ティチュー：最初の8枚だけで判断
export function grandStrength(hand8) {
    let s = 0;
    for (const c of hand8) {
        if (c === DRAGON) s += 2;
        else if (c === PHOENIX) s += 1.6;
        else if (c < 52 && rankOf(c) === 14) s += 1.1;
        else if (c < 52 && rankOf(c) === 13) s += 0.3;
    }
    const counts = new Map();
    hand8.filter(c => c < 52).forEach(c => counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1));
    if ([...counts.values()].some(n => n === 4)) s += 2;
    return s;
}

// ---- 渡す ----

function chooseExchange(game, seat, profile) {
    const hand = game.hands[seat];
    const { combos } = decompose(hand);
    const inBomb = new Set(combos.filter(c => c.type === 'bomb').flatMap(c => c.cards));
    const singles = combos.filter(c => c.type === 'single' || c.type === 'dog').map(c => c.cards[0]);
    const iCalled = !!game.calls[seat];
    const free = (list, used) => list.filter(c => !used.includes(c) && !inBomb.has(c));
    const used = [];
    // 相手へ：ばらの弱い札（点の札・麻雀・強い札は避ける）。犬は相手へ
    const weakFirst = (list) => [...list].sort((a, b) => weakness(b) - weakness(a));
    const weakness = (c) => {
        if (c === DOG) return profile.tactics ? 100 : -5;
        if (c === DRAGON || c === PHOENIX || c === MAHJONG) return -100;
        return 20 - rankOf(c) - cardPoints(c) * 0.8;
    };
    const pool = free(singles.length >= 2 ? singles : hand, used);
    const toLeft = weakFirst(pool)[0] ?? free(hand, used)[0];
    used.push(toLeft);
    const toRight = weakFirst(free(singles.length >= 3 ? singles : hand, used))[0] ?? free(hand, used)[0];
    used.push(toRight);
    // 味方へ：自分が宣言していなければ強い札、宣言していれば弱い札
    const rest = free(hand, used).filter(c => c !== DOG || !profile.tactics);
    const byStrength = [...(rest.length ? rest : free(hand, used))].sort((a, b) => rankOf(b) - rankOf(a));
    const toPartner = iCalled ? byStrength.at(-1) : byStrength.find(c => c !== PHOENIX || !profile.tactics) ?? byStrength[0];
    return { type: 'exchange', cards: [toLeft, toPartner, toRight] };
}

// ---- 出す ----

const isControl = (combo) => combo.cards.some(c => c === DRAGON || c === PHOENIX || (c < 52 && rankOf(c) >= 14));

// 組を出したあとの手札の組の数の増え方（崩すほど高い）と、組の強さから、出す「もったいなさ」を測る
function playCost(hand, combo, plan) {
    const rest = hand.filter(c => !combo.cards.includes(c));
    const after = decompose(rest).combos.length;
    const broke = after - (plan.combos.length - 1);
    let cost = combo.rank * 0.5 + broke * 4;
    if (isControl(combo)) cost += 8;
    if (combo.type === 'bomb') cost += 25;
    return cost;
}

function urgency(game, seat, top) {
    const opponents = [0, 1, 2, 3].filter(s => teamOf(s) !== teamOf(seat));
    const called = opponents.some(s => game.calls[s] && game.active(s) && !game.finished.length);
    const close = opponents.some(s => game.active(s) && game.hands[s].length <= 3);
    const points = pointsOf(game.table.flatMap(t => t.combo.cards));
    const partnerCalled = !!game.calls[partnerOf(seat)] && game.active(partnerOf(seat)) && !game.finished.length;
    return { urgent: called || close || points >= 20 || partnerCalled, points, top };
}

function chooseWish(hand) {
    // 自分の持っていない数から、高い数を願う（相手の強い札や爆弾を崩させる）
    for (let r = 14; r >= 2; r--) if (!hand.some(c => c < 52 && rankOf(c) === r)) return r;
    return undefined;
}

function playCommand(combo, hand) {
    const command = { type: 'play', cards: combo.cards };
    if (combo.cards.includes(MAHJONG)) {
        const wish = chooseWish(hand.filter(c => !combo.cards.includes(c)));
        if (wish !== undefined) command.wish = wish;
    }
    return command;
}

function chooseLead(game, seat, profile, options) {
    const hand = game.hands[seat];
    const combos = options.combos;
    // 1つの組で出し切れるなら出す
    const all = combos.find(c => c.cards.length === hand.length);
    if (all) return playCommand(all, hand);
    const partner = partnerOf(seat);
    // 犬：味方が宣言している、または味方のほうが上がりに近いとき
    if (profile.tactics && hand.includes(DOG) && game.active(partner) && !options.wishBound) {
        const partnerCalled = !!game.calls[partner];
        if (partnerCalled || (game.hands[partner].length + 2 < hand.length && !game.calls[seat])) return { type: 'play', cards: [DOG] };
    }
    const plan = decompose(hand);
    // 分けた組のうち、出せるものから選ぶ：強い札を含まない、枚数の多い、弱い組を先に
    const legalKeys = new Set(combos.map(c => c.cards.slice().sort().join()));
    let candidates = plan.combos.filter(c => c.type !== 'bomb' && c.type !== 'dog' && legalKeys.has(c.cards.slice().sort().join()));
    if (!candidates.length) candidates = combos.filter(c => c.type !== 'dog');
    const weak = candidates.filter(c => !isControl(c));
    const pool = weak.length ? weak : candidates;
    pool.sort((a, b) => (b.cards.length >= 5 ? 1 : 0) - (a.cards.length >= 5 ? 1 : 0) || a.rank - b.rank || b.cards.length - a.cards.length);
    // 麻雀は早めに出す（願いを使える）
    const mahjong = combos.find(c => c.cards.includes(MAHJONG) && c.type === 'single');
    if (mahjong && pool[0]?.type === 'single' && !options.wishBound) return playCommand(mahjong, hand);
    return playCommand(pool[0] ?? combos[0], hand);
}

function chooseFollow(game, seat, profile, options, random) {
    const hand = game.hands[seat];
    const top = game.top();
    const combos = options.combos;
    // 出し切れるなら出す
    const all = combos.find(c => c.cards.length === hand.length);
    if (all) return playCommand(all, hand);
    if (combos.length === 0) return { type: 'pass' };
    const ownerIsPartner = teamOf(top.seat) === teamOf(seat);
    if (!options.mustPlay) {
        if (ownerIsPartner) return { type: 'pass' };
        if (random() < profile.whim) return { type: 'pass' };
    }
    const plan = decompose(hand);
    const { urgent, points } = urgency(game, seat, top);
    const scored = combos.filter(c => c.type !== 'dog').map(c => ({ c, cost: playCost(hand, c, plan) })).sort((a, b) => a.cost - b.cost);
    if (options.mustPlay) return playCommand(scored[0].c, hand);
    const nonBomb = scored.filter(x => x.c.type !== 'bomb');
    // 惜しくない手なら出す。急ぐときや点が多いときは、強い札も使う
    const limit = (urgent ? 30 : 12) + points * 0.3 + (hand.length <= 4 ? 10 : 0);
    if (nonBomb.length && nonBomb[0].cost <= limit) return playCommand(nonBomb[0].c, hand);
    if (profile.tactics && urgent) {
        const bomb = scored.find(x => x.c.type === 'bomb');
        if (bomb && (points >= 10 || game.calls.some((call, s) => call && teamOf(s) !== teamOf(seat) && game.active(s)) || [0, 1, 2, 3].some(s => teamOf(s) !== teamOf(seat) && game.active(s) && game.hands[s].length <= 2))) {
            return playCommand(bomb.c, hand);
        }
    }
    return { type: 'pass' };
}

export function chooseCpuCommand(game, seat, profile = PROFILES.normal) {
    const random = cpuRandom(game, seat);
    if (game.phase === 'grand') {
        if (profile.random) return { type: 'grand', call: false };
        const partnerCalled = !!game.calls[partnerOf(seat)];
        return { type: 'grand', call: !partnerCalled && grandStrength(game.hands[seat]) >= profile.grandLine };
    }
    if (game.phase === 'exchange') {
        if (!profile.random && game.canCallTichu(seat) && !game.calls[partnerOf(seat)] && handStrength(game.hands[seat]) >= profile.tichuLine + 0.6) return { type: 'tichu' };
        if (profile.random) return { type: 'exchange', cards: game.hands[seat].slice(0, 3) };
        return chooseExchange(game, seat, profile);
    }
    if (game.phase === 'dragon') {
        const opponents = [0, 1, 2, 3].filter(s => teamOf(s) !== teamOf(seat));
        if (profile.random || !profile.tactics) return { type: 'dragon', to: opponents[Math.floor(random() * 2)] };
        // 最後まで残りそうな（札の多い）相手へ。その人が最後なら、取った札は1番目の人へ移る
        const [a, b] = opponents;
        return { type: 'dragon', to: game.hands[a].length >= game.hands[b].length ? a : b };
    }
    if (game.phase !== 'play' || game.current !== seat) return null;
    // 最初の札を出す前に、ティチューを宣言するか
    if (!profile.random && game.canCallTichu(seat) && !game.calls[partnerOf(seat)] && handStrength(game.hands[seat]) >= profile.tichuLine) return { type: 'tichu' };
    const options = game.playOptions(seat);
    if (profile.random) {
        if (!options.mustPlay && (options.combos.length === 0 || random() < 0.4)) return { type: 'pass' };
        const combo = options.combos[Math.floor(random() * options.combos.length)];
        return playCommand(combo, game.hands[seat]);
    }
    return game.top() ? chooseFollow(game, seat, profile, options, random) : chooseLead(game, seat, profile, options);
}

// CPU の席のうち、今操作を待っている最初の席
export function cpuActor(game) {
    return game.actors().find(s => game.players[s].isCPU) ?? null;
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
    return fallback(game, seat);
}

function fallback(game, seat) {
    if (game.phase === 'grand') return game.applyCommand(seat, { type: 'grand', call: false });
    if (game.phase === 'exchange') return game.applyCommand(seat, { type: 'exchange', cards: game.hands[seat].slice(0, 3) });
    if (game.phase === 'dragon') return game.applyCommand(seat, { type: 'dragon', to: (seat + 1) % PLAYERS });
    if (game.applyCommand(seat, { type: 'pass' })) return true;
    return game.playOptions(seat).combos.some(c => game.applyCommand(seat, { type: 'play', cards: c.cards }));
}

