/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（公開された情報と、自分にだけ見える札）だけを見て決める。山の並びや、ほかの人の伏せた札はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：止まれるマスごとに「止まったら点がどれだけ増えそうか」を見積もり、飛ばすマスの数だけ割り引いて、一番よいマスへ進む
 *   お金は、残りの宿場の食事に要る分を残すように重みを変える。景色は完成と称号の見込み、店は土産の組の伸び、
 *   寺は残りのお金に余裕があるだけ寄付する。2人のときの中立の旅人は、相手にとって一番よいマスをふさぐ
 * やさしい：近いマスを好み、見積もりに大きな迷いを足す。土産と食事は気まぐれに選ぶ
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { BOARD, INN_POSITIONS, PANORAMAS, PANORAMA_KINDS, SOUVENIR_KIND_IDS, SOUVENIRS, encounterKind } from './data.js';
import { souvenirGain, souvenirCost, mealCost } from './scoring.js';

export const CPU_LEVELS = ['easy', 'normal'];

// 旅人の好み（ふつう）。旅人をランダムに配った「ふつう」どうしの3人戦 900 試合の、旅人ごとの勝率（%）
const TRAVELER_RANK = { chuubei: 45, satsuki: 42, kinko: 41, umegae: 38, zenemon: 34, mitsukuni: 31, sasayakko: 27, hiroshige: 26, hirotada: 26, yoshiyasu: 24 };
const SKIP_COST = { normal: 1.1, easy: 0.6 };

const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// まだ食事をする宿場の数（pos より先の宿場）
const innsAhead = (pos) => INN_POSITIONS.filter(i => i > pos).length;

// 1文の重み：残りの食事に要る分（1回2文）より少なければ重く見る
export function coinValue(p, pos) {
    const reserve = innsAhead(pos) * 2;
    if (p.coins < reserve) return 1.4;
    if (p.coins < reserve + 3) return 0.9;
    return 0.6;
}

// 土産1枚の見込み（どの種類が来るかは分からないので、種類ごとの増え方の平均と、値段の平均）
function souvenirOutlook(p) {
    const gains = SOUVENIR_KIND_IDS.map(kind => {
        const card = Object.keys(SOUVENIRS).find(c => SOUVENIRS[c].kind === kind);
        return souvenirGain(p.souvenirs, [card]);
    });
    return { best: Math.max(...gains), avg: gains.reduce((s, g) => s + g, 0) / gains.length };
}

// 景色の次の1枚の点（完成で称号が残っていれば3点を足す）。完成していれば null
function panoramaValue(view, p, kind) {
    const next = p.panoramas[kind] + 1;
    if (next > PANORAMAS[kind].size) return null;
    let v = next;
    if (next === PANORAMAS[kind].size && view.panoramaFirst[kind] === null) v += 3;
    // ほかの人がもうすぐ完成させそうなら、称号は割り引く
    return v + 0.3;
}

// p がそのマスに止まったら増えそうな点
export function spaceValue(view, p, pos, from) {
    const type = BOARD[pos].type;
    const cv = coinValue(p, from);
    switch (type) {
        case 'village': {
            if (p.coins < 1) return -Infinity;
            const o = souvenirOutlook(p);
            const affordable = Math.min(1, p.coins / 2);
            return Math.max(0.3, (0.6 * o.best + 0.4 * o.avg - 1.8 * cv) * affordable + 0.4);
        }
        case 'farm':
            return 3 * cv;
        case 'temple': {
            if (p.coins < 1) return -Infinity;
            const amount = plannedDonation(p, from);
            return amount * (1.3 - cv) + (p.traveler === 'hirotada' ? 1.5 : 0) + 0.6;
        }
        case 'encounter':
            return 3.2 + (p.traveler === 'umegae' ? 1 + cv : 0) + (p.traveler === 'yoshiyasu' ? 0.8 : 0);
        case 'spring':
            return 2.5 + (p.traveler === 'mitsukuni' ? 1 : 0) + 0.3;
        case 'paddy': case 'mountain': case 'sea':
            return panoramaValue(view, p, type) ?? -Infinity;
        case 'inn':
            return 0.5;
        default:
            return 0;
    }
}

// 寺に寄付する額（残りの食事に要る分を残す）
function plannedDonation(p, pos) {
    const spare = p.coins - innsAhead(pos) * 2;
    return Math.max(1, Math.min(3, p.coins, spare));
}

// ---- 手を選ぶ ----

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    if (!view.actors.includes(seat)) return null;
    const rand = cpuRandom(game, seat);
    const me = view.players[seat];
    if (view.phase === 'choose') {
        const offers = me.offers;
        if (level === 'easy') return { type: 'choose', traveler: offers[Math.floor(rand() * offers.length)] };
        return { type: 'choose', traveler: [...offers].sort((a, b) => TRAVELER_RANK[b] - TRAVELER_RANK[a])[0] };
    }
    const pending = view.pending;
    const pos = view.tokens[seat].pos;
    if (pending) {
        switch (pending.kind) {
            case 'buy': return { type: 'buy', cards: chooseSouvenirs(me, pending.cards, pos, level, rand) };
            case 'donate': return { type: 'donate', amount: level === 'easy' ? 1 : Math.min(pending.max, plannedDonation(me, pos)) };
            case 'encounter': return { type: 'encounter', card: chooseEncounter(view, me, pending.cards, pos, level, rand) };
            case 'panorama': return { type: 'panorama', kind: choosePanorama(view, me, pending.options, level, rand) };
            case 'meal': return { type: 'meal', card: chooseMeal(me, pending, level, rand) };
            default: return null;
        }
    }
    if (!view.moves.length) return null;
    const token = view.tokens[view.mover];
    if (token.player === null) return { type: 'move', to: chooseNeutralMove(view, seat, level) };
    return { type: 'move', to: chooseMove(view, me, token.pos, level, rand) };
}

function chooseMove(view, me, from, level, rand) {
    const noise = level === 'easy' ? 3 : 0.4;
    let best = null;
    view.moves.forEach(pos => {
        const skipped = pos - from - 1;
        let v = spaceValue(view, me, pos, from) - SKIP_COST[level] * skipped + rand() * noise;
        // 宿場の手前で止まれるマスが少ないときは、宿場へ
        if (BOARD[pos].type === 'inn') v -= level === 'easy' ? 0 : 1;
        if (best === null || v > best.v) best = { pos, v };
    });
    return best.pos;
}

// 中立の旅人：相手が次に止まりたいマスをふさぐ（やさしいは、いちばん近いマス）
function chooseNeutralMove(view, seat, level) {
    if (level === 'easy') return view.moves[0];
    const other = view.players.find(p => p.id !== seat);
    const otherPos = view.tokens[other.id].pos;
    let best = null;
    view.moves.forEach(pos => {
        if (BOARD[pos].type === 'inn') return;
        const v = (pos > otherPos ? spaceValue(view, other, pos, otherPos) - 0.4 * (pos - otherPos - 1) : -2) - 0.15 * (pos - view.tokens[view.mover].pos);
        if (best === null || v > best.v) best = { pos, v };
    });
    return best?.pos ?? view.moves[0];
}

// 買う土産：組み合わせを全部試し、増える点 − お金の重みが一番大きいもの
function chooseSouvenirs(me, cards, pos, level, rand) {
    const cv = coinValue(me, pos);
    let best = { cards: [], v: 0 };
    for (let mask = 1; mask < 1 << cards.length; mask++) {
        const pick = cards.filter((_, i) => mask & (1 << i));
        const { pay, need } = souvenirCost(me.traveler, pick);
        if (need > me.coins) continue;
        const gain = souvenirGain(me.souvenirs, pick);
        const v = level === 'easy'
            ? gain - pay * 0.8 + rand() * 3 - 1
            : gain - pay * cv + pick.length * 0.25;
        if (v > best.v) best = { cards: pick, v };
    }
    return best.cards;
}

function chooseEncounter(view, me, cards, pos, level, rand) {
    const cv = coinValue(me, pos);
    const value = (card) => {
        const kind = encounterKind(card);
        if (kind === 'samurai') return 3;
        if (kind === 'kuge') return 3 * cv;
        if (kind === 'miko') return 1.4;
        if (kind === 'shokunin') return souvenirOutlook(me).avg + 0.3;
        const target = kind.split('-')[1];
        return panoramaValue(view, me, target) ?? Math.max(0, ...PANORAMA_KINDS.map(k => panoramaValue(view, me, k) ?? 0));
    };
    if (level === 'easy') return cards[Math.floor(rand() * cards.length)];
    return [...cards].sort((a, b) => value(b) - value(a))[0];
}

function choosePanorama(view, me, options, level, rand) {
    if (level === 'easy') return options[Math.floor(rand() * options.length)];
    return [...options].sort((a, b) => (panoramaValue(view, me, b) ?? 0) - (panoramaValue(view, me, a) ?? 0))[0];
}

// 食事：ただで出たものがあれば食べる。ほかは一番安いもの（6点はどの値段でもお金より重い）
function chooseMeal(me, pending, level, rand) {
    const options = pending.options;
    if (!options.length) return null;
    if (pending.offer && options.includes(pending.offer)) return pending.offer;
    if (level === 'easy') return options[Math.floor(rand() * options.length)];
    const cost = (c) => mealCost(me.traveler, c);
    return [...options].sort((a, b) => cost(a) - cost(b))[0];
}

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 待っている CPU に1手打たせる。思わぬ形なら、いちばん単純な答えで進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    let command = null;
    try {
        command = chooseCommand(game, seat, level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    const fallback = simplestCommand(game, seat);
    return fallback && game.applyCommand(seat, fallback) ? fallback : null;
}

// いちばん単純な答え（旅人は1枚目、店は買わない、寄付は1文、選ぶものは最初のもの、食事はしない、進むのは一番近いマス）
export function simplestCommand(game, seat) {
    if (game.phase === 'choose') return { type: 'choose', traveler: game.players[seat].offers[0] };
    const pending = game.pending;
    if (pending) {
        return {
            buy: { type: 'buy', cards: [] },
            donate: { type: 'donate', amount: 1 },
            encounter: { type: 'encounter', card: pending.cards?.[0] },
            panorama: { type: 'panorama', kind: pending.options?.[0] },
            meal: { type: 'meal', card: null }
        }[pending.kind] ?? null;
    }
    const moves = game.legalMoves();
    return moves.length ? { type: 'move', to: moves[0] } : null;
}

