/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（自分の手札と役割、全員の都市・金・手札の枚数、明かされた役割、自分が選んだときに見た候補）だけを見て決める
 * ほかの人の手札・伏せた役割・山の並びはのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：
 * - 役割：自分の都市・手札・金から、役割ごとの値打ちを見積もって選ぶ（王冠、色の収入、建築家で建てられる数、将軍で狙える相手、盗賊で取れそうな金）
 *   2人のときに伏せて捨てる役割は、相手にとって値打ちの高いもの
 * - 推測：自分が選んだときに見た候補から、どの役割がだれの手にありそうかを出す
 *   候補になかった役割は自分より前に選んだ人、候補に残っていた役割は自分より後に選んだ人（どちらも伏せた札の見込みも残す）
 *   その中で、その人にとっての値打ちが高い役割ほど、持っていそうと見る
 * - 暗殺者：先頭の人（得点の見込みと完成までの近さ）が持っていそうな役割を殺す。盗賊：金を多く持つ人が持っていそうな役割を狙う
 * - 建てる順：手札から、今の金で建てられる組み合わせ（建築家は3つまで）を全部比べ、得点・新しい色・役割の収入・紫の効果の合計が一番高いものを選ぶ
 *   収入の色の地区を建てるなら、建ててから収入を受け取る
 * - 将軍：完成が近い人か先頭の人の地区を、安く壊せるときに壊す
 * やさしい：役割はおおまかな値打ちに大きな迷いを足して選び、暗殺と盗賊の的は当てずっぽう。建てるのは建てられる札のうち最初の1つ
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { CHARACTERS, CHARACTER_ORDER, DISTRICTS, COLOR_ORDER, cardType, cardInfo, districtPoints } from './cards.js';

export const CPU_LEVELS = ['easy', 'normal'];

// CPU 用の乱数（ゲームの乱数とは別）
const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// 紫の地区の効果の値打ち（得点とは別に足す）
const PURPLE_BONUS = { hauntedCity: 1.5, keep: 0.5, laboratory: 1.5, smithy: 1.5, graveyard: 0.5, observatory: 1, schoolOfMagic: 1.5, library: 2, greatWall: 0.5, university: 0, dragonGate: 0 };

const typesOf = (cards) => cards.map(cardType);
const colorCount = (city, color) => city.filter(id => cardInfo(id).color === color || cardType(id) === 'schoolOfMagic').length;

// ---- 盤面の見積もり ----

// 今の得点の見込み（地区の得点と色）
function cityPoints(p) {
    const points = p.city.reduce((s, id) => s + districtPoints(cardType(id)), 0);
    const colors = new Set(p.city.map(id => cardInfo(id).color));
    return points + colors.size * 0.6;
}

// 先頭らしさ：得点の見込みと、完成までの近さ
function threat(view, p) {
    const left = view.completeCity - p.city.length;
    return cityPoints(p) + p.gold * 0.4 + p.handCount * 0.4 + (left <= 1 ? 8 : left <= 2 ? 4 : 0);
}

// 手札のうち、建てる意味のある札（都市と同じ名前でない）
const useful = (p, hand) => hand.filter(id => !p.city.some(c => cardType(c) === cardType(id)));

// 地区を建てたときの値打ち
function districtValue(p, id, character, extraTypes = []) {
    const info = cardInfo(id);
    const type = cardType(id);
    const have = [...typesOf(p.city), ...extraTypes];
    const haveColors = new Set(have.map(t => DISTRICTS[t].color));
    let value = districtPoints(type);
    if (!haveColors.has(info.color)) value += 1.2 + (haveColors.size === 4 ? 2 : 0);
    if (info.color === 'purple') value += PURPLE_BONUS[type] ?? 0;
    const income = character && CHARACTERS[character].income;
    if (income && income === info.color) value += 0.8;
    else if (info.color !== 'purple') value += 0.3 * colorCount(p.city, info.color);
    return value;
}

// 役割の値打ち（その人から見て）。view は見る人のビュー、p は値打ちを見積もる人
function characterValue(view, p, character, { ownHand = null } = {}) {
    const others = view.players.filter(o => o.id !== p.id);
    const hand = ownHand ?? [];
    const income = CHARACTERS[character].income;
    let value = income ? colorCount(p.city, income) : 0;
    const handCount = p.handCount;
    const leaderNear = others.some(o => view.completeCity - o.city.length <= 2);
    switch (character) {
        case 'assassin': value += 1.6 + (leaderNear ? 0.8 : 0); break;
        case 'thief': value += Math.max(0, ...others.map(o => o.gold)) * 0.45; break;
        case 'magician': {
            const most = Math.max(0, ...others.map(o => o.handCount));
            value += handCount <= 1 ? Math.max(0.8, (most - handCount) * 0.7) : 0.6;
            break;
        }
        case 'king': value += 1.5; break;
        case 'bishop': value += 0.4 + p.city.length * 0.15; break;
        case 'merchant': value += 1.3; break;
        case 'architect': {
            const affordable = ownHand ? useful(p, hand).filter(id => cardInfo(id).cost <= p.gold + 2).length : Math.min(handCount, Math.floor(p.gold / 3));
            value += 0.8 + Math.min(2, Math.max(0, affordable - 1)) * 1.6 + (handCount === 0 ? 0.8 : 0);
            break;
        }
        case 'warlord': value += leaderNear ? 1.6 : 0.6; break;
    }
    return value;
}

// ---- 役割の推測 ----

// 役割ごとに、持っていそうな人の見込み { character: { seat: 確率, faceDown: 確率 } }
export function guessHolders(view) {
    const me = view.players[view.you];
    const d = view.draft;
    const unknown = CHARACTER_ORDER.filter(c => !me.characters.includes(c) && !d.faceUp.includes(c) && !d.discarded.includes(c));
    const steps = d.steps;
    const myPicks = steps.map((s, i) => ({ ...s, i })).filter(s => s.seat === view.you && s.kind === 'pick').map(s => s.i);
    const offers = d.offers;
    const result = {};
    unknown.forEach(c => {
        // c があった最後の候補と、なかった最初の候補から、c を選んだかもしれない手順の範囲を出す
        let from = 0;
        let to = steps.length - 1;
        offers.forEach(o => {
            if (o.options.includes(c)) from = Math.max(from, o.step + 1);
            else to = Math.min(to, o.step - 1);
        });
        if (!offers.length && myPicks.length) to = myPicks[0] - 1;
        const weights = {};
        for (let i = from; i <= to; i++) {
            const s = steps[i];
            if (s.kind !== 'pick' || s.seat === view.you) continue;
            const p = view.players[s.seat];
            weights[s.seat] = (weights[s.seat] ?? 0) + Math.max(0.3, characterValue(view, p, c));
        }
        // 明かされた役割の持ち主は分かっている
        if (view.revealed[c] !== undefined) {
            result[c] = { [view.revealed[c]]: 1 };
            return;
        }
        weights.faceDown = 0.9;
        const total = Object.values(weights).reduce((s, v) => s + v, 0);
        result[c] = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / total]));
    });
    return result;
}

// ---- 手を選ぶ ----

// ヒント：人が操作する番に、CPU（ふつう）が選ぶ操作。CPU と同じく、その人のビューだけで決める。手は打たない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return chooseCommand(game, seat, 'normal');
}

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    const rand = cpuRandom(game, seat);
    const easy = level === 'easy';
    switch (view.phase) {
        case 'draft': return chooseDraft(view, rand, easy);
        case 'keep': return { type: 'keep', cards: bestCards(view, view.drawn, view.keepCount, rand, easy) };
        case 'graveyard': return { type: 'graveyard', take: takeFromGrave(view) };
        case 'turn': return chooseTurn(view, rand, easy);
        default: return null;
    }
}

function chooseDraft(view, rand, easy) {
    const me = view.players[view.you];
    const d = view.draft;
    if (d.kind === 'discard') {
        // 2人：相手にとって値打ちの高い役割を伏せる。候補は自分が今見ている残り（最後に見た候補から、選んだ役割を除く）
        const left = d.offers.at(-1).options.filter(c => !me.characters.includes(c) && !d.discarded.includes(c));
        if (easy) return { type: 'discard', character: left[Math.floor(rand() * left.length)] };
        const opponent = view.players.find(p => p.id !== view.you);
        const best = [...left].sort((a, b) => characterValue(view, opponent, b) - characterValue(view, opponent, a))[0];
        return { type: 'discard', character: best };
    }
    const options = d.options;
    const noise = easy ? 3 : 0.4;
    const scored = options.map(c => {
        let v = characterValue(view, me, c, { ownHand: me.hand });
        // 2〜3人：もう1つの役割と組み合わせる（建築家と、収入のある役割の組み合わせなど）
        if (me.characters.includes('architect') && CHARACTERS[c].income) v += 0.5;
        return { c, v: v + rand() * noise };
    });
    scored.sort((a, b) => b.v - a.v);
    return { type: 'pick', character: scored[0].c };
}

// 残す札を n 枚（よい順に1枚ずつ選ぶ）
function bestCards(view, cards, n, rand, easy) {
    const picked = [];
    const rest = [...cards];
    while (picked.length < n && rest.length) {
        const id = bestCard(view, rest, rand, easy);
        picked.push(id);
        rest.splice(rest.indexOf(id), 1);
    }
    return picked;
}

function bestCard(view, cards, rand, easy) {
    const me = view.players[view.you];
    if (easy) {
        const fresh = cards.filter(id => !me.city.some(c => cardType(c) === cardType(id)) && !me.hand.some(h => cardType(h) === cardType(id)));
        return (fresh.length ? fresh : cards)[0];
    }
    const score = (id) => {
        const inHand = me.hand.some(h => cardType(h) === cardType(id));
        const inCity = me.city.some(c => cardType(c) === cardType(id));
        if (inCity) return -10;
        const cost = cardInfo(id).cost;
        // 遠すぎる札は値打ちを下げる（すぐ建てられる札を好む）
        const reach = Math.max(0, cost - me.gold - 2) * 0.8;
        return districtValue(me, id, null) - reach - (inHand ? 3 : 0);
    };
    return [...cards].sort((a, b) => score(b) - score(a) || a - b)[0];
}

function takeFromGrave(view) {
    const me = view.players[view.you];
    const id = view.grave.card;
    return me.gold >= 1 && !me.city.some(c => cardType(c) === cardType(id));
}

// 今の金で建てる組み合わせのうち、値打ちの合計が一番高いもの（値打ちの高い順に並べる）
export function planBuilds(view, gold = view.players[view.you].gold) {
    const me = view.players[view.you];
    const t = view.turn;
    const limit = t.buildLimit - t.built;
    const cards = useful(me, me.hand);
    let best = { value: 0, cards: [] };
    const search = (start, chosen, spent, types) => {
        if (chosen.length) {
            const value = chosen.reduce((s, id, i) => s + districtValue(me, id, t.character, types.slice(0, i)), 0);
            if (value > best.value) best = { value, cards: [...chosen] };
        }
        if (chosen.length >= limit) return;
        for (let i = start; i < cards.length; i++) {
            const id = cards[i];
            const cost = cardInfo(id).cost;
            if (spent + cost > gold || types.includes(cardType(id))) continue;
            chosen.push(id);
            search(i + 1, chosen, spent + cost, [...types, cardType(id)]);
            chosen.pop();
        }
    };
    search(0, [], 0, []);
    best.cards.sort((a, b) => districtValue(me, b, t.character) - districtValue(me, a, t.character) || a - b);
    return best.cards;
}

function chooseTurn(view, rand, easy) {
    const me = view.players[view.you];
    const t = view.turn;
    const c = view.choices;
    const others = view.players.filter(p => p.id !== me.id);
    const ability = c.ability;

    // 暗殺者・盗賊・奇術師は、行動の前に能力を使う
    if (ability?.type === 'assassinate') return { type: 'assassinate', character: pickVictim(view, ability.characters, rand, easy, 'kill') };
    if (ability?.type === 'steal') return { type: 'steal', character: pickVictim(view, ability.characters, rand, easy, 'rob') };
    if (ability?.type === 'magic') {
        const magic = chooseMagic(view, ability, rand, easy);
        if (magic) return magic;
    }

    if (c.act) {
        const wanted = useful(me, me.hand);
        if (!c.draw) return { type: 'gold' };
        if (easy) return { type: me.hand.length === 0 || rand() < 0.25 ? 'draw' : 'gold' };
        if (t.character === 'architect') return { type: wanted.length ? 'gold' : 'draw' };
        if (!wanted.length) return { type: 'draw' };
        const cheapest = Math.min(...wanted.map(id => cardInfo(id).cost));
        // 建てたい札が1枚だけで、もう払えるなら、次の札を探す
        if (wanted.length === 1 && me.gold >= cheapest + c.income) return { type: 'draw' };
        return { type: 'gold' };
    }

    // 研究所：建てられない札（都市と同じ名前）を金に換える
    if (c.lab) {
        const dead = me.hand.find(id => me.city.some(x => cardType(x) === cardType(id)));
        if (dead !== undefined) return { type: 'lab', card: dead };
    }

    // 収入と建てる順
    const incomeColor = CHARACTERS[t.character].income;
    if (c.build.length) {
        if (easy) {
            if (c.canIncome && c.income) return { type: 'income' };
            return { type: 'build', card: c.build[0] };
        }
        const now = planBuilds(view);
        // 収入の色の地区を今の金で建てられるなら、先に建てて収入を増やす
        const sameColor = now.find(id => cardInfo(id).color === incomeColor);
        if (c.canIncome && c.income && sameColor === undefined) return { type: 'income' };
        const plan = c.canIncome && sameColor !== undefined ? [sameColor] : now;
        if (plan.length) return { type: 'build', card: plan[0] };
    }
    if (c.canIncome && c.income) return { type: 'income' };

    // 鍛冶屋：手札が乏しく、金に余裕があれば引く
    if (c.smithy && useful(me, me.hand).length <= 1 && me.gold >= (easy ? 2 : 4)) return { type: 'smithy' };

    if (ability?.type === 'destroy') {
        const target = chooseDestroy(view, ability.targets, others, rand, easy);
        if (target) return { type: 'destroy', target: target.target, card: target.card };
    }
    return { type: 'end' };
}

// 暗殺者と盗賊の的
function pickVictim(view, characters, rand, easy, mode) {
    const me = view.players[view.you];
    const d = view.draft;
    const candidates = characters.filter(c => !me.characters.includes(c) && !d.faceUp.includes(c) && !d.discarded.includes(c));
    const list = candidates.length ? candidates : characters;
    if (easy) return list[Math.floor(rand() * list.length)];
    const guess = guessHolders(view);
    const scoreOf = (c) => {
        const holders = guess[c] ?? {};
        return Object.entries(holders).reduce((s, [seat, prob]) => {
            if (seat === 'faceDown') return s;
            const p = view.players[Number(seat)];
            const gain = mode === 'rob' ? p.gold + 0.5 : threat(view, p) + characterValue(view, p, c) * 1.5;
            return s + prob * gain;
        }, 0);
    };
    return [...list].sort((a, b) => scoreOf(b) - scoreOf(a) + (rand() - 0.5) * 0.01)[0];
}

function chooseMagic(view, ability, rand, easy) {
    const me = view.players[view.you];
    const wanted = useful(me, me.hand);
    const others = view.players.filter(p => p.id !== me.id);
    const richest = [...others].sort((a, b) => b.handCount - a.handCount || threat(view, b) - threat(view, a))[0];
    if (richest && richest.handCount >= me.hand.length + (easy ? 3 : 2) && wanted.length <= 1) return { type: 'swap', target: richest.id };
    if (!ability.redraw || easy) return null;
    // 建てられない札と、遠すぎる札を引き直す
    const bad = me.hand.filter(id => !wanted.includes(id) || cardInfo(id).cost > me.gold + 5);
    return bad.length ? { type: 'redraw', cards: bad } : null;
}

function chooseDestroy(view, targets, others, rand, easy) {
    const me = view.players[view.you];
    const affordable = targets.filter(x => x.target !== me.id && x.cost <= me.gold);
    if (!affordable.length) return null;
    if (easy) {
        const free = affordable.filter(x => x.cost === 0);
        return free.length && rand() < 0.5 ? free[Math.floor(rand() * free.length)] : null;
    }
    const top = Math.max(...others.map(o => threat(view, o)));
    const scored = affordable.map(x => {
        const o = view.players[x.target];
        const near = view.completeCity - o.city.length <= 2;
        const lead = threat(view, o) >= top - 1;
        const loss = districtPoints(cardType(x.card));
        // 壊したあとに金が残るか（建てる金を使い切らない）
        const value = (near ? 3 : 0) + (lead ? 2 : 0) + loss * 0.5 - x.cost * 1.2;
        return { ...x, value };
    }).sort((a, b) => b.value - a.value || a.cost - b.cost);
    return scored[0].value > 1.5 ? scored[0] : null;
}

// ---- 進める ----

// 答えを待っている CPU
export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 答えを待っている CPU に1手打たせる。思わぬ選択を求められたら、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    let command = null;
    try {
        command = chooseCommand(game, seat, level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    const view = createGameView(game, seat);
    const fallbacks = [
        { type: 'end' }, { type: 'gold' },
        view.drawn ? { type: 'keep', cards: view.drawn.slice(0, view.keepCount) } : null,
        { type: 'graveyard', take: false },
        view.draft?.options ? { type: 'pick', character: view.draft.options[0] } : null,
        view.draft?.kind === 'discard' ? { type: 'discard', character: view.draft.offers.at(-1).options.find(c => !view.players[seat].characters.includes(c) && !view.draft.discarded.includes(c)) } : null
    ].filter(Boolean);
    for (const fallback of fallbacks) {
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}
