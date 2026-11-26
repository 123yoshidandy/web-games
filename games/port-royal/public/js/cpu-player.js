/**
 * CPU の判断（DOM に依存しない）
 * 山の並びはのぞかない。見えているカード（港・遠征の場・捨て札の中身・全員の人物と遠征）を全体から引いて、
 * 山（とコインとして持たれているカード）の中身の割合を見積もる。ゲームの乱数は使わない（記録の再現がずれないように）
 *
 * ふつう：
 * - めくるか止めるか：次の1枚で失敗する確率（港にある色の船のうち、撃退できないもの）を出し、
 *   「今止めたときの港の価値」と「もう1枚めくったときの見込み」を比べる
 * - 取るカード：取れる枚数ぶん、取る順を全部試し、点（雇う人物の点と力の見込み）とコインの合計が最も大きい組を選ぶ
 * - 手番でないときは、1コイン払っても得になるときだけ取る。遠征は条件を満たしたらすぐ取る
 * やさしい：港が3〜4枚になるまでめくる。取るのは、雇えれば点の高い人物、そうでなければコインの多い船
 */

import { createRandom } from './random.js';
import { CARDS, CARD_COUNT, FIVE_PLAYER_EXPEDITION, WIN_POINTS } from './cards.js';
import { countRole, swordsOf, pointsOf, traderBonus, hireCost, baseTakes, expeditionPayment } from './game.js';

export const CPU_LEVELS = ['easy', 'normal'];

// 見えていないカード（山とコインとして持たれているもの）の一覧。見えているものだけから数える
export function unseenCards(game) {
    const seen = new Set([...game.harbor, ...game.expeditions, ...game.discardPile, ...game.players.flatMap(p => [...p.display, ...p.expeditions])]);
    if (game.players.length < 5) seen.add(FIVE_PLAYER_EXPEDITION);
    if (game.pendingShip !== null) seen.add(game.pendingShip);
    return Array.from({ length: CARD_COUNT }, (_, i) => i).filter(i => !seen.has(i));
}

// 次の1枚で失敗する確率（撃退できない、港と同じ色の船）
export function bustChance(game, seat) {
    const colors = new Set(game.harbor.map(id => CARDS[id]).filter(c => c.kind === 'ship').map(c => c.color));
    const unseen = unseenCards(game);
    if (!unseen.length) return 0;
    const swords = swordsOf(game.players[seat]);
    const bad = unseen.filter(id => {
        const c = CARDS[id];
        return c.kind === 'ship' && colors.has(c.color) && (c.swords === null || c.swords > swords);
    }).length;
    return bad / unseen.length;
}

// コイン1枚の価値（点に直す）。たくさん持つほど下げる（使い道は人物を雇うことなので、貯め込まない）
const coinWorthOf = (p) => (p.coins.length < 6 ? 0.25 : p.coins.length < 10 ? 0.18 : 0.1);

// 人物を雇ったときの見込みの価値（点に直す）
function personValue(game, seat, id) {
    const p = game.players[seat];
    const c = CARDS[id];
    const points = pointsOf(p);
    const late = points >= WIN_POINTS - 4;
    let value = c.vp * (late ? 1.6 : 1.0);
    if (!late) {
        if (c.role === 'trader') value += 0.9;
        if (c.role === 'sailor' || c.role === 'pirate') value += c.swords * (swordsOf(p) < 4 ? 0.6 : 0.2);
        if (c.role === 'governor') value += 2.4;
        if (c.role === 'mademoiselle') value += 1.6;
        if (c.role === 'admiral') value += 1.0;
        if (c.role === 'jester') value += 0.8;
    }
    // 遠征に近づくなら足す
    if (c.symbol) {
        for (const e of game.expeditions) {
            if (!expeditionPayment(p, e) && expeditionPayment({ ...p, display: [...p.display, id] }, e)) value += CARDS[e].vp * 0.8 + CARDS[e].coins * 0.3;
        }
        value += 0.5;
    }
    return value;
}

// 取る順を全部試して、一番よい組の最初の1枚を返す（null なら取らない）
function bestTake(game, seat, takes, fee) {
    const p = game.players[seat];
    const coinWorth = coinWorthOf(p);
    let best = { score: 0, first: null };
    const search = (coins, display, harbor, left, score, first) => {
        if (score > best.score) best = { score, first };
        if (left === 0) return;
        for (const id of harbor) {
            const c = CARDS[id];
            const rest = harbor.filter(h => h !== id);
            const me = { ...p, display };
            if (c.kind === 'ship') {
                const income = c.coins + traderBonus(me, c.color);
                if (coins + income < fee) continue;
                search(coins + income - fee, display, rest, left - 1, score + (income - fee) * coinWorth, first ?? id);
            } else {
                const cost = hireCost(me, id) + fee;
                if (coins < cost) continue;
                search(coins - cost, [...display, id], rest, left - 1, score + personValue(game, seat, id) - cost * coinWorth, first ?? id);
            }
        }
    };
    search(p.coins.length, p.display, [...game.harbor], Math.min(takes, 3), 0, null);
    return best.first;
}

// 今止めたときに取れるものの価値（コインの単位。人物は、点の見込みをコインに直して費用を引く）
function harborValue(game, seat) {
    const takes = baseTakes(game.harbor) + countRole(game.players[seat], 'governor');
    const p = game.players[seat];
    const values = game.harbor.map(id => {
        const c = CARDS[id];
        if (c.kind === 'ship') return c.coins + traderBonus(p, c.color);
        return hireCost(p, id) <= p.coins.length ? personValue(game, seat, id) * 3 - hireCost(p, id) : 0;
    }).sort((a, b) => b - a);
    return values.slice(0, takes).reduce((s, v) => s + Math.max(0, v), 0);
}

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    const random = createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1)) >>> 0);
    const easy = level === 'easy';
    const p = game.players[seat];
    // 遠征は、取れたらすぐ取る
    if (seat === game.current && (game.phase === 'discover' || (game.phase === 'trade' && game.taker === seat))) {
        const e = game.expeditions.find(id => expeditionPayment(p, id));
        if (e !== undefined && !easy) return { type: 'claim', card: e };
    }
    if (game.phase === 'repel') {
        // 同じ色の船なら撃退。そうでなければ、港の取れる枚数が増えるので置く（やさしいは撃退しない）
        const c = CARDS[game.pendingShip];
        const clash = game.harbor.some(h => CARDS[h].kind === 'ship' && CARDS[h].color === c.color);
        return { type: clash || (!easy && c.coins <= 1) ? 'repel' : 'keep' };
    }
    if (game.phase === 'discover') {
        if (game.drawnThisTurn === 0) return { type: 'draw' };
        if (easy) return { type: game.harbor.length < 3 + Math.floor(random() * 2) ? 'draw' : 'stop' };
        const risk = bustChance(game, seat);
        const now = harborValue(game, seat);
        // もう1枚で増える見込み（コイン）。港が少ないうちは良いカードが来やすく、色が増えると取れる枚数も増える
        const gain = game.harbor.length < 3 ? 1.2 : 0.35;
        // 失うもの（失敗の確率 × 今の価値）が、得るもの（成功の確率 × 増える見込み）より小さければ、もう1枚
        return { type: risk * now < (1 - risk) * gain ? 'draw' : 'stop' };
    }
    if (game.phase === 'trade') {
        const active = seat === game.current;
        const fee = active ? 0 : 1;
        if (easy) {
            const options = game.harbor.filter(id => game.canTake(seat, id));
            if (!options.length || (!active && random() < 0.4)) return { type: 'pass' };
            const persons = options.filter(id => CARDS[id].kind === 'person').sort((a, b) => CARDS[b].vp - CARDS[a].vp);
            const ships = options.filter(id => CARDS[id].kind === 'ship').sort((a, b) => CARDS[b].coins - CARDS[a].coins);
            return { type: 'take', card: persons[0] ?? ships[0] };
        }
        const first = bestTake(game, seat, game.takesLeft, fee);
        return first === null ? { type: 'pass' } : { type: 'take', card: first };
    }
    return null;
}

export function nextCpuSeat(game) {
    const seat = game.actors()[0];
    return seat !== undefined && game.players[seat].isCPU ? seat : null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// CPU の1手を打つ。断られたら、いちばん単純な答え（止める・置く・取らない）で必ず進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null || seat === undefined) return null;
    const command = chooseCommand(game, seat, level);
    if (command && game.applyCommand(seat, command)) return command;
    for (const fallback of [{ type: 'stop' }, { type: 'draw' }, { type: 'keep' }, { type: 'pass' }]) {
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}

// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(!game.isOver() && game.actors().includes(seat))) return null;
    return chooseCommand(game, seat, 'normal');
}
