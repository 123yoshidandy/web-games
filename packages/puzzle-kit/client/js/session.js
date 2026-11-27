/**
 * 1人用の遊び（フリープレイ・今日のパズル・タイムアタック）のロジック。DOM に触れない
 *
 * 操作はすべて applyCommand に通し、受け付けた操作だけを commands に記録する。replay(setup, commands) で同じ局面に戻せる
 * 時間は操作に付けた t（遊び始めてからのミリ秒。止めていた間は数えない）で持ち、ロジックは時計を見ない
 *
 * 操作：
 *   { type: 'input', t, input }  今の問題に入力する（種類の applyInput に渡す）。解けたら次の問題へ進む
 *   { type: 'hint', t }          ヒントを見る（時間を計る遊びでは HINT_PENALTY_MS を足す）
 *   { type: 'undo', t }          今の問題の、1つ前の入力に戻す
 *   { type: 'reset', t }         今の問題を、何も書いていない状態に戻す
 */

import { getType } from './puzzles/registry.js';
import { buildPuzzle } from './puzzle-set.js';

export const HINT_PENALTY_MS = 15000;

export const MODES = {
    free: { label: 'フリープレイ', timed: false },
    daily: { label: '今日のパズル', timed: true },
    attack: { label: 'タイムアタック', timed: true }
};

// setup: { mode, plan: [{ type, difficulty, seed }], cpuLevel?, dailyKey? }
export function createSession(setup) {
    const puzzles = setup.plan.map(buildPuzzle);
    return {
        setup,
        puzzles,
        index: 0,
        states: puzzles.map(entry => getType(entry.type).initialState(entry.puzzle)),
        history: puzzles.map(() => []), // 待ったで戻る前の状態（問題ごと）
        solvedAt: puzzles.map(() => null),
        hints: puzzles.map(() => 0),
        penaltyMs: 0,
        t: 0,
        phase: 'playing',
        commands: []
    };
}

export const currentType = (session) => getType(session.puzzles[session.index].type);
export const currentPuzzle = (session) => session.puzzles[session.index];
export const isTimed = (session) => Boolean(MODES[session.setup.mode]?.timed);

// 受け付けたら { ok: true, events, hint? }。断ったら { ok: false, error }（状態は変えない）
export function applyCommand(session, command) {
    if (session.phase !== 'playing') return { ok: false, error: 'もう終わっています' };
    const t = command?.t;
    if (!Number.isFinite(t) || t < session.t) return { ok: false, error: '時間がおかしい操作です' };
    const index = session.index;
    const entry = session.puzzles[index];
    const type = getType(entry.type);
    const state = session.states[index];
    const events = [];
    let hint = null;

    switch (command.type) {
        case 'input': {
            const next = type.applyInput(entry.puzzle, state, command.input);
            if (next === state) return { ok: false, error: '変わらない入力です' };
            session.history[index].push(state);
            session.states[index] = next;
            events.push('input');
            break;
        }
        case 'hint': {
            hint = type.hint(entry.puzzle, state);
            if (!hint) return { ok: false, error: 'ヒントはありません' };
            session.hints[index]++;
            if (isTimed(session)) session.penaltyMs += HINT_PENALTY_MS;
            events.push('hint');
            break;
        }
        case 'undo': {
            if (!session.history[index].length) return { ok: false, error: '戻せる手がありません' };
            session.states[index] = session.history[index].pop();
            events.push('undo');
            break;
        }
        case 'reset': {
            const initial = type.initialState(entry.puzzle);
            if (JSON.stringify(initial) === JSON.stringify(state)) return { ok: false, error: 'まだ何も書いていません' };
            session.history[index].push(state);
            session.states[index] = initial;
            events.push('reset');
            break;
        }
        default:
            return { ok: false, error: '知らない操作です' };
    }

    session.t = t;
    session.commands.push(command);
    if (command.type !== 'hint' && type.check(entry.puzzle, session.states[index]).solved) {
        session.solvedAt[index] = t;
        events.push('solved');
        if (index + 1 < session.puzzles.length) session.index = index + 1;
        else {
            session.phase = 'done';
            events.push('finished');
        }
    }
    return { ok: true, events, hint };
}

// 記録から同じ局面を作り直す
export function replay(setup, commands) {
    const session = createSession(setup);
    for (const command of commands) {
        const result = applyCommand(session, command);
        if (!result.ok) throw new Error(`記録を再現できません: ${result.error}`);
    }
    return session;
}

// 合計の時間（ヒントの加算を含む）。終わっていなければ now（今の t）までで数える
export function totalTime(session, now = session.t) {
    const end = session.phase === 'done' ? session.solvedAt[session.solvedAt.length - 1] : now;
    return end + session.penaltyMs;
}

// 問題ごとにかかった時間（解いていなければ null）
export function puzzleTimes(session) {
    return session.solvedAt.map((at, i) => (at === null ? null : at - (i ? session.solvedAt[i - 1] : 0)));
}

export const solvedCount = (session) => session.solvedAt.filter(at => at !== null).length;
