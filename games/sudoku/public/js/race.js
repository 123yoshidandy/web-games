// packages/puzzle-kit 0.1.0 からコピーしたファイル。ここでは直さず、packages/puzzle-kit で直してから同期する
/**
 * オンラインの早解きのロジック（サーバーのゲームの定義と、画面の表示で使う。DOM に触れない）
 *
 * サーバーがシードを決めて同じ問題の組を作り、問題そのもの（手がかり）だけを配る。シードは保存もしない
 * 各人は端末で解き、解けた盤面を送る（submit）。サーバーは種類の check で確かめ、サーバーの時刻で解いた時間を記録する
 *   まちがった盤面を送ると WRONG_PENALTY_MS、ヒントを見ると HINT_PENALTY_MS を足す
 * CPU は始めるときに、問題ごとに解き終わる時刻を決める（cpu-player.js）。画面はその時刻とサーバーの時刻から進み具合を出す
 * 人（退出していない人）が全員解き終わるか、制限時間を過ぎたら終わる。順位は合計の時間（解いた時刻 + 加算）
 *
 * game：{ settings, puzzles: [{ type, difficulty, puzzle }], startAt, endsAt, phase, players, commands }
 *   players[i]：{ name, isCPU, left, solvedAt: [始めてからのミリ秒 | null], penaltyMs, hints, wrong }
 *   commands：受け付けた操作の記録 [{ seat, command, at }]
 */

import { getType } from './puzzles/registry.js';
import { planSet, buildPuzzle } from './puzzle-set.js';
import { cpuDurations, cumulative, CPU_LEVEL_IDS } from './cpu-player.js';
import { HINT_PENALTY_MS } from './session.js';

export const COUNTDOWN_MS = 3500;
export const TIME_LIMIT_MS = 30 * 60 * 1000;
export const WRONG_PENALTY_MS = 30000;
export const RACE_COUNTS = [3, 5];

export const defaultRaceSettings = () => ({ difficulty: 'normal', count: 3, cpuLevel: 'normal' });

export function createRace({ players, settings, random, now }) {
    const plan = planSet({ seed: Math.floor(random() * 2 ** 31), difficulty: settings.difficulty, count: settings.count });
    const puzzles = plan.map(buildPuzzle);
    const startAt = now + COUNTDOWN_MS;
    const game = {
        settings: { ...settings },
        puzzles,
        startAt,
        endsAt: startAt + TIME_LIMIT_MS,
        phase: 'playing',
        players: players.map(player => ({
            name: player.name,
            isCPU: Boolean(player.isCPU),
            left: false,
            solvedAt: puzzles.map(() => null),
            penaltyMs: 0,
            hints: 0,
            wrong: 0
        })),
        commands: []
    };
    game.players.forEach((player, seat) => { if (player.isCPU) scheduleCpu(game, seat, random, 0); });
    return game;
}

// CPU の解き終わる時刻を、まだ解いていない問題の分だけ決める（from：始めてからのミリ秒。ここから解き始める）
export function scheduleCpu(game, seat, random, from) {
    const player = game.players[seat];
    const first = player.solvedAt.findIndex(at => at === null);
    if (first < 0) return;
    const rest = game.puzzles.slice(first);
    const times = cumulative(cpuDurations(rest, CPU_LEVEL_IDS.includes(game.settings.cpuLevel) ? game.settings.cpuLevel : 'normal', random), from);
    times.forEach((at, i) => { player.solvedAt[first + i] = at; });
}

export const nextIndex = (player) => player.solvedAt.findIndex(at => at === null);
export const isFinished = (player) => nextIndex(player) < 0;
export const totalOf = (player) => (isFinished(player) ? player.solvedAt[player.solvedAt.length - 1] + player.penaltyMs : null);
const elapsed = (game, now) => Math.max(0, now - game.startAt);

// 端末からの操作。受け付けたら { ok: true }、断るなら { ok: false, error }（断るときは game を変えない）
export function applyRaceCommand(game, seat, command, now) {
    const player = game.players[seat];
    if (game.phase !== 'playing') return { ok: false, error: 'もう終わっています' };
    if (!player || player.isCPU || player.left) return { ok: false, error: 'この席では操作できません' };
    const index = nextIndex(player);
    if (index < 0) return { ok: false, error: 'もう全部解いています' };
    if (!command || command.index !== index) return { ok: false, error: '今の問題ではありません' };
    const entry = game.puzzles[index];

    if (command.type === 'submit') {
        let solved = false;
        try {
            solved = getType(entry.type).check(entry.puzzle, command.state).solved === true;
        } catch {
            solved = false;
        }
        const at = elapsed(game, now);
        if (solved) player.solvedAt[index] = Math.max(at, index ? player.solvedAt[index - 1] : 0);
        else {
            player.wrong++;
            player.penaltyMs += WRONG_PENALTY_MS;
        }
        game.commands.push({ seat, command: { type: 'submit', index, state: command.state }, at });
    } else if (command.type === 'hint') {
        player.hints++;
        player.penaltyMs += HINT_PENALTY_MS;
        game.commands.push({ seat, command: { type: 'hint', index }, at: elapsed(game, now) });
    } else {
        return { ok: false, error: '知らない操作です' };
    }
    finishIfDone(game);
    return { ok: true };
}

// 人（退出していない人）が全員解き終わったら終える
export function finishIfDone(game) {
    if (game.phase !== 'playing') return false;
    const humans = game.players.filter(p => !p.isCPU && !p.left);
    if (humans.some(p => !isFinished(p))) return false;
    game.phase = 'end';
    return true;
}

// 順位：解き終えた人は合計の時間の短い順、解き終えていない人は、解いた数の多い順・最後に解いた時刻の早い順
export function standings(game) {
    return game.players
        .map((player, seat) => ({ seat, player, solved: player.solvedAt.filter(at => at !== null).length, total: totalOf(player) }))
        .sort((a, b) => {
            if (a.total !== null && b.total !== null) return a.total - b.total || a.seat - b.seat;
            if (a.total !== null) return -1;
            if (b.total !== null) return 1;
            const lastA = Math.max(0, ...a.player.solvedAt.filter(at => at !== null));
            const lastB = Math.max(0, ...b.player.solvedAt.filter(at => at !== null));
            return b.solved - a.solved || lastA - lastB || a.seat - b.seat;
        })
        .map((row, i) => ({ ...row, rank: i + 1 }));
}

// 各席に送るビュー（問題と、全員の進み具合。シードと答えは入れない）
export function raceView(game, seat) {
    return {
        seat,
        phase: game.phase,
        settings: game.settings,
        startAt: game.startAt,
        endsAt: game.endsAt,
        puzzles: game.puzzles,
        players: game.players.map(player => ({
            name: player.name,
            isCPU: player.isCPU,
            left: player.left,
            solvedAt: player.solvedAt,
            penaltyMs: player.penaltyMs,
            hints: player.hints,
            wrong: player.wrong
        })),
        ranking: game.phase === 'end' ? standings(game).map(({ seat: s, rank, total, solved }) => ({ seat: s, rank, total, solved })) : null
    };
}

// その時刻（始めてからのミリ秒）までに解いた数（CPU は決めた時刻から、人は届いた結果から）
export const solvedBy = (player, at) => player.solvedAt.filter(t => t !== null && t <= at).length;
