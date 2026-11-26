/**
 * CPU（DOM に依存しない）。協力ゲームなので、人が読みやすい決まった約束事で動く
 *
 * 約束事（遊び方の画面にも書く）
 *   1. 出せる合図：色か数字のヒントで「新しく指された札」のうち一番左の札は、今出せる
 *      （新しく指された札がなければ、指された一番左の札）
 *   2. 取っておく合図：5 のヒントと、今は出せないと分かる札へのヒントは「捨てないで」
 *   3. 捨てるときは、一番左のまだヒントのない札（捨て札候補）を捨てる
 *
 * 手番でやること（上から順に、できるものを1つ）
 *   1. 出せると分かる札・出せる合図をもらった札を出す
 *   2. 次の人の捨て札候補が残り1枚の大事な札（5 など）なら、取っておく合図を出す
 *   3. 誰かの出せる札を、約束事どおりに読めるヒントで教える
 *   4. 捨てる（もう要らないと分かる札、なければ捨て札候補）
 *   5. ヒントが8つで捨てられなければ、読み違えの起きないヒントを出す
 *
 * CPU は自分の手札の中身を見ない（ヒントで分かったことと、見えている札の数だけで考える）。
 * ヒントを出すときは、受け取る人が知っていることだけで約束事どおりに読めるかを確かめてから出す。
 * CPU の判断に乱数は使わない
 */

import { COPIES, MAX_CLUES, bitsToColors, bitsToRanks, colorBit, rankBit, touches } from './game.js';

const key = (color, rank) => color * 10 + rank;

// 見えている札の数（color*10+rank → 枚数）。hidden の席の手札は数えない
function visibleCounts(game, hiddenSeats) {
    const counts = new Map();
    const add = card => counts.set(key(card.color, card.rank), (counts.get(key(card.color, card.rank)) ?? 0) + 1);
    for (const order of game.discards) add(game.cards[order]);
    game.fireworks.forEach((top, color) => {
        for (let rank = 1; rank <= top; rank++) add({ color, rank });
    });
    for (const player of game.players) {
        if (hiddenSeats.includes(player.seat)) continue;
        for (const order of game.hands[player.seat]) add(game.cards[order]);
    }
    return counts;
}

// 札の候補（ヒントで分かったことと、残りの枚数から）
function possibilities(colors, ranks, counts) {
    const list = [];
    for (const color of bitsToColors(colors)) {
        for (const rank of bitsToRanks(ranks)) {
            if ((counts.get(key(color, rank)) ?? 0) < COPIES[rank]) list.push({ color, rank });
        }
    }
    return list;
}

const isPlayable = (fireworks, { color, rank }) => fireworks[color] === rank - 1;
const isDead = (fireworks, { color, rank }) => rank <= fireworks[color];

// 一番左のまだヒントのない札（捨て札候補）
export const chopOf = (game, seat) => game.hands[seat].find(order => !game.knowledge[order].clued) ?? null;

// ヒントの焦点：新しく指された一番左の札（なければ、指された一番左の札）
const focusOf = entry => entry.newly[0] ?? entry.touched[0];

// その札が受け取った合図。{ type: 'play', set } / { type: 'save' } / null
function signalOf(game, seat, order, poss) {
    for (let i = game.clueLog.length - 1; i >= 0; i--) {
        const entry = game.clueLog[i];
        if (entry.target !== seat || focusOf(entry) !== order) continue;
        if (entry.kind === 'rank' && entry.value === 5) return { type: 'save' };
        const set = poss.filter(id => isPlayable(entry.fireworks, id));
        return set.length ? { type: 'play', set } : { type: 'save' };
    }
    return null;
}

// 自分の手札について、自分から見て分かること
export function ownCardInfo(game, seat) {
    const counts = visibleCounts(game, [seat]);
    return game.hands[seat].map(order => {
        const k = game.knowledge[order];
        const poss = possibilities(k.colors, k.ranks, counts);
        const signal = signalOf(game, seat, order, poss);
        const playable = poss.length > 0 && poss.every(id => isPlayable(game.fireworks, id));
        const dead = poss.length > 0 && poss.every(id => isDead(game.fireworks, id));
        let play = playable;
        if (!play && signal?.type === 'play') {
            const live = signal.set.filter(id => !isDead(game.fireworks, id));
            play = live.length > 0 && live.every(id => isPlayable(game.fireworks, id));
        }
        const signalDead = signal?.type === 'play' && signal.set.every(id => isDead(game.fireworks, id));
        return { order, clued: k.clued, poss, signal, play, dead: dead || signalDead };
    });
}

// 残り1枚の大事な札か（まだ出していない、捨てると出せなくなる）
function isCritical(game, card) {
    if (isDead(game.fireworks, card)) return false;
    const discarded = game.discards.filter(o => game.cards[o].color === card.color && game.cards[o].rank === card.rank).length;
    return COPIES[card.rank] - discarded === 1;
}

// giver がヒントを出したとき、target がどう読むか（giver と target の両方に見える情報だけで考える）
export function simulateClue(game, giver, target, kind, value) {
    const touched = game.hands[target].filter(order => touches(game.cards[order], kind, value));
    if (touched.length === 0) return null;
    const newly = touched.filter(order => !game.knowledge[order].clued);
    const focus = newly[0] ?? touched[0];
    const k = game.knowledge[focus];
    const colors = kind === 'color' ? colorBit(value) : k.colors;
    const ranks = kind === 'rank' ? rankBit(value) : k.ranks;
    const poss = possibilities(colors, ranks, visibleCounts(game, [giver, target]));
    let reading = 'save';
    if (!(kind === 'rank' && value === 5) && poss.some(id => isPlayable(game.fireworks, id))) reading = 'play';
    return { touched, newly, focus, reading };
}

// 誰かがすでに出す予定の札か（ヒントで指された札と同じもの）。giver から見える手札だけで調べる
function alreadyClued(game, giver, card, except) {
    for (const player of game.players) {
        if (player.seat === giver) continue;
        for (const order of game.hands[player.seat]) {
            if (order === except || !game.knowledge[order].clued) continue;
            const other = game.cards[order];
            if (other.color === card.color && other.rank === card.rank) return true;
        }
    }
    return false;
}

function clueCandidates(game, seat) {
    const list = [];
    for (const player of game.players) {
        if (player.seat === seat) continue;
        for (let c = 0; c < 5; c++) list.push({ target: player.seat, kind: 'color', value: c });
        for (let r = 1; r <= 5; r++) list.push({ target: player.seat, kind: 'rank', value: r });
    }
    return list;
}

const distance = (game, from, to) => (to - from + game.players.length) % game.players.length;

// 出せる札を教えるヒントの中で、いちばん良いもの
function bestPlayClue(game, seat) {
    let best = null;
    let bestScore = -Infinity;
    for (const clue of clueCandidates(game, seat)) {
        const sim = simulateClue(game, seat, clue.target, clue.kind, clue.value);
        if (!sim || sim.reading !== 'play') continue;
        const focusCard = game.cards[sim.focus];
        if (!isPlayable(game.fireworks, focusCard) || alreadyClued(game, seat, focusCard, sim.focus)) continue;
        // 2回目のヒントで同じ札を指しても新しいことは伝わらない
        if (sim.newly.length === 0) continue;
        let score = 10 - focusCard.rank * 0.3;
        for (const order of sim.newly) {
            if (order === sim.focus) continue;
            const card = game.cards[order];
            if (isDead(game.fireworks, card) || alreadyClued(game, seat, card, order)) score -= 3;
            else if (isPlayable(game.fireworks, card)) score += 1.5;
            else score += 0.5;
        }
        score -= distance(game, seat, clue.target) * 0.2;
        if (score > bestScore) {
            bestScore = score;
            best = clue;
        }
    }
    return best;
}

// 次の人の捨て札候補が大事な札なら、取っておく合図のヒント
function saveClue(game, seat) {
    const next = (seat + 1) % game.players.length;
    const chop = chopOf(game, next);
    if (chop === null) return null;
    const card = game.cards[chop];
    if (!(card.rank === 5 || isCritical(game, card))) return null;
    if (isPlayable(game.fireworks, card)) return null; // 出せるなら、出せる合図で教える
    for (const [kind, value] of [['rank', card.rank], ['color', card.color]]) {
        const sim = simulateClue(game, seat, next, kind, value);
        if (sim && sim.focus === chop && sim.reading === 'save') return { target: next, kind, value };
    }
    return null;
}

// ヒントが8つで捨てられないとき：読み違えの起きないヒント
function safeClue(game, seat) {
    let fallback = null;
    for (const clue of clueCandidates(game, seat)) {
        const sim = simulateClue(game, seat, clue.target, clue.kind, clue.value);
        if (!sim) continue;
        const focusCard = game.cards[sim.focus];
        const correct = sim.reading === 'play' ? isPlayable(game.fireworks, focusCard) : true;
        if (correct && !isDead(game.fireworks, focusCard)) return clue;
        if (correct && !fallback) fallback = clue;
    }
    return fallback;
}

// CPU の手（操作）を決める
export function chooseCommand(game, seat = game.current) {
    const info = ownCardInfo(game, seat);

    // 1. 出せる札を出す（分かっている札を先に）
    const sure = info.find(c => c.poss.length && c.poss.every(id => isPlayable(game.fireworks, id)));
    const signaled = info.find(c => c.play);
    if (sure || signaled) return { type: 'play', order: (sure ?? signaled).order };

    if (game.clues > 0) {
        // 2. 取っておく合図
        const save = saveClue(game, seat);
        if (save) return { type: 'clue', ...save };
        // 3. 出せる札を教える
        const play = bestPlayClue(game, seat);
        if (play) return { type: 'clue', ...play };
    }

    if (game.clues < MAX_CLUES) {
        // 4. 捨てる
        const trash = info.find(c => c.dead);
        if (trash) return { type: 'discard', order: trash.order };
        const chop = chopOf(game, seat);
        if (chop !== null) return { type: 'discard', order: chop };
        // 全部にヒントがあるとき：取っておく合図のない札のうち一番左
        const loose = info.find(c => c.signal?.type !== 'save') ?? info[0];
        return { type: 'discard', order: loose.order };
    }

    // 5. ヒントが8つ：読み違えの起きないヒント
    const clue = safeClue(game, seat);
    if (clue) return { type: 'clue', ...clue };
    return { type: 'play', order: info[info.length - 1].order };
}

export const isCpuTurn = game => game.phase !== 'end' && game.players[game.current].isCPU;

// CPU の番なら1手進める。進めたら true
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    if (game.applyCommand(seat, chooseCommand(game, seat))) return true;
    // 想定していない形で断られたら、いちばん単純な答えで必ず進める
    const first = game.hands[seat][0];
    return game.applyCommand(seat, game.clues < MAX_CLUES ? { type: 'discard', order: first } : { type: 'play', order: first });
}

// ヒント：人の番に、CPU が選ぶ手を返す。CPU と同じく、自分の札はヒントで分かったことだけで考える（のぞかない）
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.phase === 'end' || game.current !== seat) return null;
    return chooseCommand(game, seat);
}
