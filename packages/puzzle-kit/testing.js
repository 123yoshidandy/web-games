/**
 * パズルのゲームのテストの道具（ゲームの test/ から呼ぶ）
 *
 *   testPuzzleType(type)                    種類の共通の決まり（client/js/puzzles/registry.js の先頭のコメント）を確かめる
 *   testReplay({ session, puzzleSet })      記録（操作の列）から同じ局面になる。describe('記録からの再現', …) の中で呼ぶ
 *   testRace({ definition, type, race, session }) オンラインの早解き（netplay-kit の定義）。test-kit の testOnline と一緒に使う
 *   testPrecache(gameDir)                   sw.js の PRECACHE が public/ のファイルと合っている
 * session・puzzleSet・race は、ゲームの public/js の写し（session.js・puzzle-set.js・race.js）を import して渡す
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomKeysIn } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import { createRandom } from './client/js/random.js';
import { precacheList, renderPrecache } from './tools/precache.mjs';

const DIFFICULTY_IDS = ['easy', 'normal', 'hard'];
// 難しさごとの、試すシードの数と、1問を作る時間の上限（ミリ秒。この PC での値。スマホでは 3〜4 倍かかる）
const PLAN = {
    easy: { seeds: 8, budgetMs: 200 },
    normal: { seeds: 8, budgetMs: 400 },
    hard: { seeds: 4, budgetMs: 800 }
};
const MAX_HINT_STEPS = 3000;

// 状態を書き換えたら投げるように、凍らせる
const deepFreeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(deepFreeze);
    }
    return value;
};
const clone = (value) => JSON.parse(JSON.stringify(value));

// ヒントを当て続けて、解けるまでの手数（解けなければ投げる）
function solveByHints(type, puzzle, start) {
    let state = start;
    for (let step = 0; step < MAX_HINT_STEPS; step++) {
        if (type.check(puzzle, state).solved) return step;
        const hint = type.hint(puzzle, deepFreeze(clone(state)));
        if (!hint) throw new Error(`${step}手目でヒントが出ない`);
        expect(Array.isArray(hint.cells), 'hint.cells は配列').toBe(true);
        expect(typeof hint.message === 'string' && hint.message.length > 0, 'hint.message は文').toBe(true);
        const next = type.applyInput(puzzle, deepFreeze(clone(state)), hint.input);
        if (JSON.stringify(next) === JSON.stringify(state)) throw new Error(`${step}手目のヒントで状態が変わらない`);
        state = next;
    }
    throw new Error(`${MAX_HINT_STEPS}手で解けない`);
}

// ---------- 種類の共通の決まり ----------

export function testPuzzleType(type, { plan = PLAN } = {}) {
    describe(`パズルの種類：${type.id}`, () => {
        it('決まった項目と関数がある', () => {
            expect(type.id).toMatch(/^[a-z][a-z0-9-]*$/);
            expect(typeof type.name).toBe('string');
            expect(Array.isArray(type.rules) && type.rules.length > 0 && type.rules.every(t => typeof t === 'string' && t)).toBe(true);
            expect(typeof type.controls).toBe('string');
            DIFFICULTY_IDS.forEach(d => expect(typeof type.difficulties?.[d], `difficulties.${d}`).toBe('string'));
            expect(type.cpuSecondsPerStep).toBeGreaterThan(0);
            ['generate', 'solve', 'initialState', 'applyInput', 'check', 'hint', 'randomInput', 'render']
                .forEach(name => expect(typeof type[name], name).toBe('function'));
        });

        describe.each(DIFFICULTY_IDS)('難しさ %s', (difficulty) => {
            const { seeds, budgetMs } = plan[difficulty];
            const seedList = Array.from({ length: seeds }, (_, i) => 1000 + i * 7919);

            it(`同じシードなら同じ問題で、1問 ${budgetMs}ms 以内に作れる`, () => {
                const times = [];
                const keys = new Set();
                seedList.forEach(seed => {
                    const started = performance.now();
                    const puzzle = type.generate(seed, difficulty);
                    times.push(performance.now() - started);
                    expect(type.generate(seed, difficulty)).toEqual(puzzle);
                    keys.add(JSON.stringify(puzzle));
                });
                expect(keys.size, 'シードが違えば、ちがう問題になる').toBeGreaterThan(1);
                expect(Math.max(...times), `作る時間（ms）: ${times.map(t => t.toFixed(0)).join(', ')}`).toBeLessThan(budgetMs);
            });

            it('問題は JSON にでき、シードと答えを含まず、解は1つで、答えは check で解けている', () => {
                seedList.forEach(seed => {
                    const puzzle = type.generate(seed, difficulty);
                    expect(clone(puzzle)).toEqual(puzzle);
                    expect(randomKeysIn(puzzle, 'puzzle')).toEqual([]);
                    expect(JSON.stringify(puzzle)).not.toMatch(/"(solution|answer)"/);
                    const { count, solution } = type.solve(puzzle);
                    expect(count, `シード ${seed} の解の数`).toBe(1);
                    expect(type.check(puzzle, solution).solved).toBe(true);
                    expect(type.check(clone(puzzle), clone(solution)).solved, 'JSON にしても解けている').toBe(true);
                    const initial = type.initialState(puzzle);
                    expect(clone(initial)).toEqual(initial);
                    expect(type.check(puzzle, initial).solved).toBe(false);
                });
            });

            it('何も書いていない状態から、ヒントを当て続けると解ける。解けたらヒントは null', () => {
                seedList.forEach(seed => {
                    const puzzle = type.generate(seed, difficulty);
                    let state = type.initialState(puzzle);
                    const steps = solveByHints(type, puzzle, state);
                    expect(steps).toBeGreaterThan(0);
                    for (let i = 0; i < steps; i++) state = type.applyInput(puzzle, state, type.hint(puzzle, state).input);
                    expect(type.check(puzzle, state).solved).toBe(true);
                    expect(type.hint(puzzle, state)).toBeNull();
                });
            });

            it('でたらめに書いたあと（まちがいを含む）からでも、ヒントで解ける。入力は状態を書き換えない', () => {
                seedList.slice(0, 3).forEach(seed => {
                    const puzzle = type.generate(seed, difficulty);
                    const random = createRandom(seed);
                    let state = deepFreeze(type.initialState(puzzle));
                    for (let i = 0; i < 25; i++) state = deepFreeze(type.applyInput(puzzle, state, type.randomInput(puzzle, state, random)));
                    solveByHints(type, puzzle, state);
                });
            });
        });

        it('おかしな状態・入力でも投げない（オンラインで端末から届くため）', () => {
            const puzzle = type.generate(1, 'easy');
            const initial = type.initialState(puzzle);
            [null, undefined, {}, [], 'x', 1, { cells: 'x' }, { paths: [1] }].forEach(state => {
                expect(type.check(puzzle, state)).toEqual({ solved: false, errors: [] });
            });
            [null, undefined, {}, { cells: [-1], value: 9 }, { type: 'path', pair: 99, cells: [] }, { pair: 0, cells: 'x' }].forEach(input => {
                expect(type.applyInput(puzzle, initial, input)).toBe(initial);
            });
        });
    });
}

// ---------- 記録からの再現 ----------

// ヒントを見て、その手を入れることを繰り返す操作の列を作る（steps 手まで。途中で待った・最初からも混ぜる）
function playByHints(S, setup, { steps = Infinity, extras = true } = {}) {
    const session = S.createSession(setup);
    let t = 0;
    let count = 0;
    while (session.phase === 'playing' && count < steps) {
        t += 1000;
        const hint = S.applyCommand(session, { type: 'hint', t }).hint;
        t += 500;
        S.applyCommand(session, { type: 'input', t, input: hint.input });
        count++;
        if (extras && count === 2) {
            // 1手戻して、同じ手を入れ直す。最初からやり直して、また解き直す
            S.applyCommand(session, { type: 'undo', t: (t += 300) });
            S.applyCommand(session, { type: 'input', t: (t += 300), input: hint.input });
        }
        if (extras && count === 4 && session.phase === 'playing') S.applyCommand(session, { type: 'reset', t: (t += 300) });
    }
    return session;
}

const snapshot = (session) => clone({
    index: session.index, states: session.states, solvedAt: session.solvedAt, hints: session.hints,
    penaltyMs: session.penaltyMs, t: session.t, phase: session.phase
});

export function testReplay({ session: S, puzzleSet }) {
    it('途中までの記録から、同じ局面（状態・待った・ヒントの加算）になる', () => {
        const setup = { mode: 'attack', plan: puzzleSet.planSet({ seed: 11, difficulty: 'easy', count: 3 }), bestKey: 'easy:3' };
        const played = playByHints(S, setup, { steps: 6 });
        expect(played.commands.length).toBeGreaterThan(6);
        const replayed = S.replay(setup, clone(played.commands));
        expect(snapshot(replayed)).toEqual(snapshot(played));
        expect(replayed.history.map(h => h.length)).toEqual(played.history.map(h => h.length));
    });

    it('最後まで解いた記録から、同じ合計の時間と、問題ごとの時間になる', () => {
        const setup = { mode: 'daily', plan: puzzleSet.dailyPlan('2026-01-02'), dailyKey: '2026-01-02' };
        const played = playByHints(S, setup);
        expect(played.phase).toBe('done');
        const replayed = S.replay(setup, clone(played.commands));
        expect(replayed.phase).toBe('done');
        expect(S.totalTime(replayed)).toBe(S.totalTime(played));
        expect(S.puzzleTimes(replayed)).toEqual(S.puzzleTimes(played));
        expect(S.totalTime(played)).toBe(played.solvedAt[played.solvedAt.length - 1] + played.hints.reduce((a, b) => a + b, 0) * S.HINT_PENALTY_MS);
    });

    it('フリープレイはヒントの加算がなく、断った操作は記録に入らない', () => {
        const setup = { mode: 'free', plan: puzzleSet.planSet({ seed: 5, difficulty: 'normal', count: 1 }) };
        const session = S.createSession(setup);
        expect(S.applyCommand(session, { type: 'hint', t: 1000 }).ok).toBe(true);
        expect(session.penaltyMs).toBe(0);
        expect(S.applyCommand(session, { type: 'undo', t: 1100 }).ok).toBe(false);
        expect(S.applyCommand(session, { type: 'hint', t: 500 }).ok).toBe(false);
        expect(S.applyCommand(session, { type: 'input', t: 1200, input: null }).ok).toBe(false);
        expect(session.commands).toHaveLength(1);
        expect(() => S.replay(setup, [{ type: 'undo', t: 10 }])).toThrow();
    });

    it('今日のパズルは日付で決まり、やさしい・ふつう・むずかしいの3問', () => {
        const plan = puzzleSet.dailyPlan('2026-03-04');
        expect(plan.map(p => p.difficulty)).toEqual(DIFFICULTY_IDS);
        expect(puzzleSet.dailyPlan('2026-03-04')).toEqual(plan);
        expect(puzzleSet.dailyPlan('2026-03-05')).not.toEqual(plan);
    });
}

// ---------- オンラインの早解き ----------

export function testRace({ definition, type, race, session }) {
    const answerFor = (view, index) => {
        const entry = view.puzzles[index];
        return type.solve(entry.puzzle, 1).solution;
    };
    const initialFor = (view, index) => {
        const entry = view.puzzles[index];
        return type.initialState(entry.puzzle);
    };

    async function startRace(names = ['あお', 'みどり'], settings = {}) {
        const server = createTestServer(definition);
        const clients = await server.createRoom(names);
        if (Object.keys(settings).length) await clients[0].send('setSettings', { settings });
        await clients[0].send('start');
        return { server, clients };
    }

    describe('オンライン対戦（早解きレース）', () => {
        it('全員に同じ問題が届き、ビューにシードも答えも入らない', async () => {
            const { clients } = await startRace();
            const [a, b] = clients.map(c => c.last('state').view);
            expect(a.puzzles).toEqual(b.puzzles);
            expect(a.puzzles).toHaveLength(3);
            expect(JSON.stringify(a)).not.toMatch(/"(seed|solution|answer)"/);
            expect(randomKeysIn(a, 'view')).toEqual([]);
        });

        it('解けた盤面をサーバーが確かめ、サーバーの時刻で解いた時間を記録する', async () => {
            const { server, clients } = await startRace();
            const view = clients[0].last('state').view;
            server.clock.now = view.startAt + 42000;
            await clients[0].send('command', { command: { type: 'submit', index: 0, state: answerFor(view, 0) } });
            const after = clients[1].last('state').view;
            expect(after.players[0].solvedAt[0]).toBe(42000);
            expect(after.players[1].solvedAt[0]).toBeNull();
        });

        it('まちがった盤面は加算になり、ヒントも加算になる。今の問題でない番号は断る', async () => {
            const { clients } = await startRace();
            const view = clients[0].last('state').view;
            await clients[0].send('command', { command: { type: 'submit', index: 0, state: initialFor(view, 0) } });
            await clients[0].send('command', { command: { type: 'hint', index: 0 } });
            const player = clients[0].last('state').view.players[0];
            expect(player.solvedAt[0]).toBeNull();
            expect(player.penaltyMs).toBe(race.WRONG_PENALTY_MS + session.HINT_PENALTY_MS);
            const errors = clients[0].all('error').length;
            await clients[0].send('command', { command: { type: 'submit', index: 1, state: answerFor(view, 1) } });
            expect(clients[0].all('error').length).toBe(errors + 1);
        });

        it('おかしな形の盤面を送っても、サーバーは止まらずまちがいとして数える', async () => {
            const { clients } = await startRace();
            for (const state of [null, 'x', { cells: 'x' }, []]) {
                await clients[0].send('command', { command: { type: 'submit', index: 0, state } });
            }
            expect(clients[0].last('state').view.players[0].wrong).toBe(4);
        });

        it('CPU は始めに解き終わる時刻が決まっていて、人が全員解き終えたら順位が出る', async () => {
            const server = createTestServer(definition);
            const [a] = await server.createRoom(['あお']);
            await a.send('setSettings', { settings: { count: 3, difficulty: 'easy', cpuLevel: 'hard' } });
            await a.send('addCpu');
            await a.send('start');
            const view = a.last('state').view;
            expect(view.players[1].isCPU).toBe(true);
            expect(view.players[1].solvedAt.every(at => at > 0)).toBe(true);
            for (let i = 0; i < 3; i++) {
                server.clock.now = view.startAt + (i + 1) * 1000;
                await a.send('command', { command: { type: 'submit', index: i, state: answerFor(view, i) } });
            }
            const end = a.last('state').view;
            expect(end.phase).toBe('end');
            expect(end.ranking[0]).toMatchObject({ seat: 0, rank: 1, total: 3000 });
            expect(a.last('lobby').status).toBe('ended');
        });

        it('対戦中に抜けた人の席は、その時点から CPU が解く', async () => {
            const { server, clients } = await startRace(['あお', 'みどり', 'き']);
            const view = clients[0].last('state').view;
            server.clock.now = view.startAt + 10000;
            await clients[2].send('leave');
            const player = clients[0].last('state').view.players[2];
            expect(player.isCPU).toBe(true);
            expect(player.solvedAt.every(at => at >= 10000)).toBe(true);
        });

        it('開始の前（カウントダウン中）に解いても、時間は 0 から数える', async () => {
            const { server, clients } = await startRace();
            const view = clients[0].last('state').view;
            expect(view.startAt - server.clock.now).toBe(race.COUNTDOWN_MS);
            await clients[0].send('command', { command: { type: 'submit', index: 0, state: answerFor(view, 0) } });
            expect(clients[0].last('state').view.players[0].solvedAt[0]).toBe(0);
        });

        it('ロビーの設定（難しさ・問題の数）で問題の組ができる', async () => {
            const { clients } = await startRace(['あお', 'みどり'], { difficulty: 'hard', count: 5 });
            const view = clients[0].last('state').view;
            expect(view.puzzles).toHaveLength(5);
            expect(view.puzzles.every(p => p.difficulty === 'hard')).toBe(true);
        });

        it('知らない設定は断る', async () => {
            const server = createTestServer(definition);
            const [a] = await server.createRoom(['あお', 'みどり']);
            await a.send('setSettings', { settings: { count: 4 } });
            expect(a.last('error')).toBeTruthy();
            await a.send('setSettings', { settings: { difficulty: 'expert' } });
            expect(a.last('lobby').settings).toMatchObject({ count: 3, difficulty: 'normal' });
        });
    });
}

// ---------- service worker ----------

export function testPrecache(gameDir) {
    describe('service worker の先読み', () => {
        it('PRECACHE が public/ の CSS と js の下の JS をすべて含む（ずれたら npm run sw で作り直す）', () => {
            const publicDir = join(gameDir, 'public');
            const sw = readFileSync(join(publicDir, 'sw.js'), 'utf8');
            expect(renderPrecache(sw, precacheList(publicDir)), 'sw.js の PRECACHE が古い。npm run sw で作り直す').toBe(sw);
        });
    });
}
