/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（山札の並びはのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：カードを足したときの得点の増え方（ジョーカーとプラスの3色は最善に選ぶ）で、列の値打ちを測る
 *   - 引くか取るか：十分に得な列があれば取る。置ける列がなければ、いちばん得な列を取る
 *   - 置く：自分の得から、まだ列を取っていないほかの人の得を引いた値がいちばん大きい列に置く
 * - normal（画面の CPU）は、評価に揺れがあり、ときどき2番目の手を選ぶ（強すぎないように）
 */

import { JOKER, PLUS2, ROW_LIMIT, bestScore } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    normal: { noise: 0.4, secondBest: 0.2, takeLine: 4 },
    strong: { noise: 0.03, secondBest: 0, takeLine: 3.5 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

const RIVAL_WEIGHT = 0.6; // 置くときに、ほかの人の得をどれだけ嫌うか

export const isCpuTurn = (game) => game.phase !== 'end' && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// カードを足したときの得点の増え方
export function gainOf(player, cards, table) {
    const before = bestScore(player.counts, player.jokers, player.plus2, table).score;
    const counts = { ...player.counts };
    let { jokers, plus2 } = player;
    cards.forEach(card => {
        if (card === JOKER) jokers++;
        else if (card === PLUS2) plus2++;
        else counts[card] = (counts[card] ?? 0) + 1;
    });
    return bestScore(counts, jokers, plus2, table).score - before;
}

// ヒント：人の番に、CPU（ふつう）が選ぶ操作。CPU と同じく、その人のビューだけで決める。手は打たない
export function suggest(game, seat) {
    if (game.phase === 'end' || game.current !== seat) return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

export function chooseCpuCommand(game, seat = game.current, profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    const random = cpuRandom(game, seat);
    const candidates = view.phase === 'place' ? placeCandidates(view, seat) : playCandidates(view, seat, profile);
    if (profile.random) return candidates[Math.floor(random() * candidates.length)].command;
    candidates.forEach(c => { c.score += (Math.abs(c.score) + 1) * (random() * 2 - 1) * profile.noise; });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 1 && random() < profile.secondBest) return candidates[1].command;
    return candidates[0].command;
}

// CPU に1手打たせる。決めた手が断られたら、いちばん単純な手を試す（必ず前に進める）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase === 'end' || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    if (game.phase === 'place') return game.openRows().some(row => game.applyCommand(seat, { type: 'place', row }));
    return game.applyCommand(seat, { type: 'draw' }) || game.takableRows().some(row => game.applyCommand(seat, { type: 'take', row }));
}

// ---- 評価 ----

const openRows = (view) => view.rows.map((r, i) => (!r.taken && r.cards.length < ROW_LIMIT ? i : -1)).filter(i => i >= 0);
const takableRows = (view) => view.rows.map((r, i) => (!r.taken && r.cards.length > 0 ? i : -1)).filter(i => i >= 0);

function playCandidates(view, seat, profile) {
    const me = view.players[seat];
    const list = takableRows(view).map(row => {
        const cards = view.rows[row].cards;
        const gain = gainOf(me, cards, view.table);
        // 3枚そろった列は、待っても増えないので取りやすく
        const full = cards.length >= ROW_LIMIT ? 1.5 : 0;
        return { command: { type: 'take', row }, score: gain + full - (profile.takeLine ?? 4) };
    });
    if (openRows(view).length > 0) {
        // 引く：ほかに残っている人が少ないほど、列が自分に回ってきやすいので引く値打ちが上がる
        const active = view.players.filter(p => !p.took).length;
        list.push({ command: { type: 'draw' }, score: active === 1 ? 0.5 : 0 });
    }
    return list;
}

function placeCandidates(view, seat) {
    const me = view.players[seat];
    const card = view.pending;
    const rivals = view.players.filter(p => p.id !== seat && !p.took);
    return openRows(view).map(row => {
        const cards = view.rows[row].cards;
        const mine = gainOf(me, [...cards, card], view.table) - gainOf(me, cards, view.table);
        const theirs = rivals.length ? Math.max(...rivals.map(p => gainOf(p, [...cards, card], view.table) - gainOf(p, cards, view.table))) : 0;
        return { command: { type: 'place', row }, score: mine - theirs * RIVAL_WEIGHT };
    });
}
