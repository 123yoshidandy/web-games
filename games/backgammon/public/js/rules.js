/**
 * バックギャモンのルールの中身（盤・動かし方・ベアオフ・勝ちの種類）。DOM に依存しない
 *
 * 盤は2人それぞれの向きで持つ。board[p][i] は、プレイヤー p から見たポイント i にある p の駒の数
 * - i = 1〜24：ポイント（p は 24 から 1 へ向かって進む。1〜6 がインナーボード）
 * - i = 25：バー
 * - i = 0：ベアオフした駒
 * p のポイント i は、相手から見るとポイント 25 - i になる
 *
 * 1歩は [from, die]（どの駒を、どの目で動かすか）。ベアオフで目より大きく動かすときも、使った目で書く
 */

export const CHECKERS = 15;
export const BAR = 25;
export const OFF = 0;

// 最初の並べ方（自分から見て）：24 に2個、13 に5個、8 に3個、6 に5個
export const START = { 24: 2, 13: 5, 8: 3, 6: 5 };

export function createBoard(layout = START) {
    const side = () => {
        const a = new Array(26).fill(0);
        for (const [point, n] of Object.entries(layout)) a[Number(point)] = n;
        return a;
    };
    return [side(), side()];
}

export const cloneBoard = (board) => [board[0].slice(), board[1].slice()];
export const boardKey = (board) => board[0].join(',') + '|' + board[1].join(',');

// 全部の駒がインナーボード（1〜6）かベアオフ済み
export function allHome(side) {
    for (let i = 7; i <= BAR; i++) if (side[i] > 0) return false;
    return true;
}

// p の駒を from から die の目で動かした先（ベアオフは 0）。動かせなければ -1
export function target(board, p, from, die) {
    const me = board[p];
    const opp = board[1 - p];
    if (!(from >= 1 && from <= BAR) || !(die >= 1 && die <= 6) || me[from] === 0) return -1;
    // バーに駒があれば、先に入れる
    if (me[BAR] > 0 && from !== BAR) return -1;
    const to = from - die;
    if (to >= 1) return opp[25 - to] >= 2 ? -1 : to;
    if (!allHome(me)) return -1;
    if (to === 0) return OFF;
    // 目より大きく動かしてベアオフできるのは、それより高いポイントに駒がないとき
    for (let i = from + 1; i <= 6; i++) if (me[i] > 0) return -1;
    return OFF;
}

// 1歩を動かした新しい盤。hit は相手のブロットを打ったか
export function applyStep(board, p, from, die) {
    const to = target(board, p, from, die);
    if (to < 0) throw new Error('動かせない駒です');
    const next = cloneBoard(board);
    const me = next[p];
    const opp = next[1 - p];
    me[from]--;
    let hit = false;
    if (to === OFF) {
        me[OFF]++;
    } else {
        if (opp[25 - to] === 1) {
            opp[25 - to] = 0;
            opp[BAR]++;
            hit = true;
        }
        me[to]++;
    }
    return { board: next, to, hit };
}

// 振った目から、使う目の並び（ゾロ目は4回）
export const diceList = (dice) => dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];

// 残りの目のうち、同じ目は1回だけ試す
const distinct = (list) => [...new Set(list)];

const without = (list, die) => {
    const i = list.indexOf(die);
    return list.slice(0, i).concat(list.slice(i + 1));
};

// その目の並びで行ける手を、最後まで調べる（ゾロ目は動かす元を高い順に限って、同じ並びの重複を減らす）
function explore(board, p, remaining, steps, maxFrom, out) {
    let moved = false;
    const doubles = remaining.length > 1 && remaining.every(d => d === remaining[0]);
    for (const die of distinct(remaining)) {
        const rest = without(remaining, die);
        for (let from = Math.min(BAR, maxFrom); from >= 1; from--) {
            if (target(board, p, from, die) < 0) continue;
            moved = true;
            const { board: next } = applyStep(board, p, from, die);
            explore(next, p, rest, [...steps, [from, die]], doubles ? from : BAR, out);
        }
    }
    if (!moved) out.push({ steps, board });
}

/**
 * 通る手（その番に動かす全部の歩）の一覧。行き着く盤が同じ手は1つにまとめる
 * - 使える目はできるだけ多く使う（両方使えるなら両方、ゾロ目は4回まで）
 * - 片方しか使えず、どちらでも使えるときは、大きい目を使う
 * 返り値：{ max（使う目の数）, plays: [{ steps, board, key }], keys: 行き着く盤の Set }
 */
export function legalPlays(board, p, dice) {
    const list = diceList(dice);
    const out = [];
    // ゾロ目でなければ、目を使う順で結果が変わるので、explore が両方の順を調べる
    explore(board, p, list, [], BAR, out);
    const max = Math.max(0, ...out.map(x => x.steps.length));
    let plays = out.filter(x => x.steps.length === max);
    if (max === 1 && dice[0] !== dice[1]) {
        const high = Math.max(dice[0], dice[1]);
        if (plays.some(x => x.steps[0][1] === high)) plays = plays.filter(x => x.steps[0][1] === high);
    }
    const seen = new Map();
    for (const x of plays) {
        const key = boardKey(x.board);
        if (!seen.has(key)) seen.set(key, { steps: x.steps, board: x.board, key });
    }
    const unique = max === 0 ? [] : [...seen.values()];
    return { max, plays: unique, keys: new Set(unique.map(x => x.key)) };
}

// 途中まで動かした盤から、まだ通る手に行き着けるか（needed 歩を残りの目で動かして、keys のどれかになる）
function canFinish(board, p, remaining, needed, keys) {
    if (needed === 0) return keys.has(boardKey(board));
    for (const die of distinct(remaining)) {
        const rest = without(remaining, die);
        for (let from = BAR; from >= 1; from--) {
            if (target(board, p, from, die) < 0) continue;
            if (canFinish(applyStep(board, p, from, die).board, p, rest, needed - 1, keys)) return true;
        }
    }
    return false;
}

/**
 * 番の途中で、次に動かせる1歩の一覧（画面で、駒を押したときに光らせる先）
 * start: 番の初めの盤、dice: 振った目、steps: ここまでに動かした歩
 * 返り値：[{ from, die, to }]。通る手に行き着けない歩は入れない
 */
export function nextSteps(start, p, dice, steps, legal = legalPlays(start, p, dice)) {
    const played = playSteps(start, p, dice, steps);
    if (!played) return [];
    const needed = legal.max - steps.length;
    if (needed <= 0) return [];
    const result = [];
    for (const die of distinct(played.remaining)) {
        const rest = without(played.remaining, die);
        for (let from = BAR; from >= 1; from--) {
            const to = target(played.board, p, from, die);
            if (to < 0) continue;
            if (canFinish(applyStep(played.board, p, from, die).board, p, rest, needed - 1, legal.keys)) result.push({ from, die, to });
        }
    }
    return result;
}

// 歩を順に動かす。通らない歩があれば null。返り値：{ board, remaining（残りの目）, moves: [{ from, to, die, hit }] }
export function playSteps(start, p, dice, steps) {
    let board = start;
    let remaining = diceList(dice);
    const moves = [];
    for (const step of steps) {
        if (!Array.isArray(step) || step.length !== 2) return null;
        const [from, die] = step;
        if (!Number.isInteger(from) || !Number.isInteger(die) || !remaining.includes(die)) return null;
        if (target(board, p, from, die) < 0) return null;
        const r = applyStep(board, p, from, die);
        moves.push({ from, to: r.to, die, hit: r.hit });
        board = r.board;
        remaining = without(remaining, die);
    }
    return { board, remaining, moves };
}

// その歩の並びが、ルールどおりの1番分の手か（目を使い切る数と、行き着く盤で確かめる）
export function checkPlay(start, p, dice, steps, legal = legalPlays(start, p, dice)) {
    if (!Array.isArray(steps) || steps.length !== legal.max || legal.max === 0) return null;
    const played = playSteps(start, p, dice, steps);
    if (!played || !legal.keys.has(boardKey(played.board))) return null;
    return played;
}

// ピップ数（全部をベアオフするのに要る目の合計。バーは 25）
export function pipCount(side) {
    let sum = 0;
    for (let i = 1; i <= BAR; i++) sum += i * side[i];
    return sum;
}

// 勝ちの種類：1 シングル、2 ギャモン（負けた側が1個もベアオフしていない）、3 バックギャモン（さらに、バーか勝った側のインナーボードに駒がある）
export function winKind(board, winner) {
    const loser = board[1 - winner];
    if (loser[OFF] > 0) return 1;
    if (loser[BAR] > 0) return 3;
    for (let i = 19; i <= 24; i++) if (loser[i] > 0) return 3;
    return 2;
}

// 互いの駒がまだすれ違うか（すれ違わなければ、ただの競走）
export function hasContact(board) {
    const back = (side) => {
        for (let i = BAR; i >= 1; i--) if (side[i] > 0) return i;
        return 0;
    };
    return back(board[0]) + back(board[1]) > 25;
}

export const KIND_NAMES = { 1: 'シングル', 2: 'ギャモン', 3: 'バックギャモン' };
