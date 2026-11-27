import { describe, it, expect } from 'vitest';
import {
    createGame, applyCommand, replay, viewFor, rankingOf, puzzleOf, nextEventTime, takeOver, cpuFinishTime,
    GEM_ROWS, GEMS_PER_ROW, ROUNDS, HINT_PENALTY_MS, SKIP_PENALTY_MS, DEFAULT_TIME_LIMIT
} from '../public/js/game.js';
import { solve } from '../public/js/solver.js';
import { solutionFor, newRace, playThrough } from './helpers.js';

describe('始まり', () => {
    it('同じシードなら同じ問題・同じダイス・同じ宝石の並びになる', () => {
        const a = newRace();
        const b = newRace();
        expect(a).toEqual(b);
        expect(newRace({ seed: 43 })).not.toEqual(a);
    });

    it('宝石は6列×12個で、6色が12個ずつ', () => {
        const state = newRace();
        expect(state.gemRows).toHaveLength(GEM_ROWS);
        state.gemRows.forEach(row => expect(row).toHaveLength(GEMS_PER_ROW));
        const counts = {};
        state.gemRows.flat().forEach(c => { counts[c] = (counts[c] ?? 0) + 1; });
        expect(Object.values(counts)).toEqual([12, 12, 12, 12, 12, 12]);
    });

    it('全員が同じダイスの目で、別々のカードを受け取る', () => {
        const state = newRace({ players: [1, 2, 3, 4].map(i => ({ name: `P${i}`, isCPU: i > 1 })) });
        const cards = state.puzzles.map(p => p.card);
        expect(new Set(cards).size).toBe(4);
        state.puzzles.forEach(p => expect(p.set).toBe(state.die - 1));
        expect(puzzleOf(state, 0).pieces).toHaveLength(3);
    });

    it('むずかしいでは4ピースの問題になる', () => {
        const state = newRace({ difficulty: 4 });
        expect(puzzleOf(state, 0).pieces).toHaveLength(4);
    });
});

describe('解く', () => {
    it('盤面をちょうど埋めれば解けたことになり、違えば断って状態を変えない', () => {
        const state = newRace();
        const before = structuredClone(state);
        const solution = solutionFor(state, 0);
        const wrong = solution.map((p, i) => (i === 0 ? { ...p, x: p.x + 1 } : p));
        const rejected = applyCommand(state, 0, { type: 'submit', placements: wrong, t: 1000 });
        expect(rejected.ok).toBe(false);
        expect(state).toEqual(before);
        expect(applyCommand(state, 0, { type: 'submit', placements: solution.slice(1), t: 1000 }).ok).toBe(false);
        expect(state).toEqual(before);
        expect(applyCommand(state, 0, { type: 'submit', placements: solution, t: DEFAULT_TIME_LIMIT + 1 }).ok).toBe(false);
        expect(state).toEqual(before);
    });

    it('CPU は決まった時刻に解き、その前に人が解けば人が先になる', () => {
        const state = newRace();
        const cpuTimes = state.cpuTimes.slice();
        const t = Math.min(...cpuTimes.filter(Boolean)) - 1000;
        expect(applyCommand(state, 0, { type: 'submit', placements: solutionFor(state, 0), t }).ok).toBe(true);
        // 人が全員終えたので、CPU は予定の時刻で結果が決まり、宝石を取る段階に進む
        expect(state.phase).toBe('collect');
        expect(state.collect.order[0]).toBe(0);
        cpuTimes.forEach((time, seat) => {
            if (seat > 0) expect(state.results[seat].solved).toBe(time !== null);
        });
    });

    it('時刻を進めると、その時刻までの CPU が解いたことになる', () => {
        const state = newRace();
        const next = nextEventTime(state);
        const seat = state.cpuTimes.indexOf(next);
        expect(seat).toBeGreaterThan(0);
        expect(applyCommand(state, null, { type: 'tick', t: next }).ok).toBe(true);
        expect(state.results[seat]).toEqual({ solved: true, t: next, time: next });
        expect(state.phase).toBe('play');
    });

    it('時間切れで、解けなかった人は宝石を取れない', () => {
        const state = newRace();
        applyCommand(state, null, { type: 'timeUp' });
        expect(state.results[0]).toEqual({ solved: false, reason: 'timeUp' });
        expect(state.history[0].order).not.toContain(0);
    });

    it('ヒントを使うと、1回ごとにタイムが増える', () => {
        const state = newRace();
        applyCommand(state, 0, { type: 'hint' });
        applyCommand(state, 0, { type: 'submit', placements: solutionFor(state, 0), t: 7000 });
        expect(state.history[0].results[0].time).toBe(7000 + HINT_PENALTY_MS);
    });

    it('CPU の時刻は強さで変わり、やさしいほど遅い', () => {
        const avg = (level) => {
            let sum = 0;
            for (let round = 1; round <= 200; round++) sum += cpuFinishTime({ seed: 5, round, seat: 1, level, timeLimit: 10 ** 9 });
            return sum / 200;
        };
        expect(avg('easy')).toBeGreaterThan(avg('normal'));
        expect(avg('normal')).toBeGreaterThan(avg('hard'));
    });
});

describe('宝石', () => {
    const toCollect = () => {
        const state = newRace({ players: [{ name: 'A', isCPU: false }, { name: 'B', isCPU: false }] });
        applyCommand(state, 1, { type: 'submit', placements: solutionFor(state, 1), t: 5000 });
        applyCommand(state, 0, { type: 'submit', placements: solutionFor(state, 0), t: 9000 });
        return state;
    };

    it('早く解いた順に取り、1位は3列、2位は2列までしか動けない', () => {
        const state = toCollect();
        expect(state.collect.order).toEqual([1, 0]);
        const pawn = state.pawns[1];
        const far = [0, 1, 2, 3, 4, 5].find(row => Math.abs(row - pawn) > 3);
        if (far !== undefined) expect(applyCommand(state, 1, { type: 'pick', row: far }).ok).toBe(false);
        expect(applyCommand(state, 0, { type: 'pick', row: state.pawns[0] }).ok).toBe(false); // 番ではない
        const row = Math.min(5, pawn + 1);
        const front = state.gemRows[row].slice(0, 2);
        expect(applyCommand(state, 1, { type: 'pick', row }).ok).toBe(true);
        expect(state.pawns[1]).toBe(row);
        expect(Object.values(state.gems[1]).reduce((a, b) => a + b, 0)).toBe(2);
        front.forEach(color => expect(state.gems[1][color]).toBeGreaterThan(0));
        const pawn0 = state.pawns[0];
        const tooFar = [0, 1, 2, 3, 4, 5].find(r => Math.abs(r - pawn0) === 3);
        if (tooFar !== undefined) expect(applyCommand(state, 0, { type: 'pick', row: tooFar }).ok).toBe(false);
        expect(applyCommand(state, 0, { type: 'pick', row: pawn0 }).ok).toBe(true);
        // 全員が取ったら次のラウンド
        expect(state.round).toBe(2);
        expect(state.phase).toBe('play');
    });

    it('1色の多さで順位を決め、同じなら2番目の色で比べる', () => {
        const state = newRace({ players: [{ name: 'A', isCPU: false }, { name: 'B', isCPU: false }, { name: 'C', isCPU: false }] });
        const gems = (list) => ({ ruby: 0, sapphire: 0, emerald: 0, amber: 0, amethyst: 0, pearl: 0, ...list });
        state.gems = [gems({ ruby: 5, sapphire: 3 }), gems({ emerald: 5, amber: 4 }), gems({ pearl: 5, ruby: 3 })];
        state.phase = 'end';
        const ranking = rankingOf(state);
        expect(ranking[0]).toMatchObject({ seat: 1, rank: 1 });
        expect(ranking.slice(1).map(r => r.rank)).toEqual([2, 2]);
    });
});

describe('最後まで', () => {
    it(`${ROUNDS}ラウンドで終わり、順位が出る`, () => {
        const { state } = playThrough({ players: [{ name: 'A', isCPU: false }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }, { name: 'D', isCPU: true }], seed: 3, level: 'hard' });
        expect(state.phase).toBe('end');
        expect(state.round).toBe(ROUNDS);
        expect(state.history).toHaveLength(ROUNDS);
        expect(rankingOf(state)).toHaveLength(4);
        expect(applyCommand(state, 0, { type: 'hint' }).ok).toBe(false);
    });

    it('タイムアタックは、9問の時間（ヒントと飛ばしを足す）の合計を出す', () => {
        const { state } = playThrough({ players: [{ name: 'A', isCPU: false }], seed: 9 }, (round) => (round === 2 ? null : 10000));
        expect(state.mode).toBe('solo');
        expect(state.phase).toBe('end');
        expect(state.soloTotal).toBe(8 * 10000 + 30000 + SKIP_PENALTY_MS);
        expect(state.gemRows).toEqual([]);
    });

    it('CPU だけでも最後まで進む', () => {
        const { state } = playThrough({ players: [1, 2, 3].map(i => ({ name: `C${i}`, isCPU: true })), seed: 11 });
        expect(state.phase).toBe('end');
    });
});

describe('記録からの再現', () => {
    it('操作の記録から、同じ最後の状態になる', () => {
        const options = { players: [{ name: 'A', isCPU: false }, { name: 'B', isCPU: false }, { name: 'C', isCPU: true }], seed: 77, difficulty: 4, level: 'easy' };
        const { state, commands } = playThrough(options, (round, seat) => (round % 3 === 0 && seat === 1 ? null : 15000 + round * 1000 + seat));
        expect(replay(options, commands)).toEqual(state);
    });

    it('途中までの記録からも、同じ途中の状態になる', () => {
        const options = { players: [{ name: 'A', isCPU: false }, { name: 'B', isCPU: true }], seed: 5 };
        const { commands } = playThrough(options);
        const half = commands.slice(0, 7);
        const a = replay(options, half);
        const b = replay(options, half);
        expect(a).toEqual(b);
        expect(a.phase).not.toBe('end');
    });

    it('記録に断られる操作があれば、再現は止まって知らせる', () => {
        const options = { players: [{ name: 'A', isCPU: false }, { name: 'B', isCPU: true }], seed: 5 };
        expect(() => replay(options, [{ seat: 0, command: { type: 'pick', row: 0 } }])).toThrow();
    });
});

describe('ビュー', () => {
    it('シード・乱数・山札・CPU の予定の時刻を入れない', () => {
        const view = viewFor(newRace(), 0);
        const text = JSON.stringify(view);
        ['seed', 'rng', 'deck', 'cpuTimes'].forEach(key => expect(text).not.toContain(`"${key}"`));
        expect(view.puzzle.pieces).toHaveLength(3);
        expect(JSON.parse(text)).toEqual(view);
    });
});

describe('抜けた席', () => {
    it('CPU が引き継ぎ、人が全員終えればラウンドが締まる', () => {
        const state = newRace({ players: [{ name: 'A', isCPU: false }, { name: 'B', isCPU: false }] });
        applyCommand(state, 0, { type: 'submit', placements: solutionFor(state, 0), t: 4000 });
        expect(state.phase).toBe('play');
        takeOver(state, 1, 5000);
        expect(state.players[1].isCPU).toBe(true);
        expect(state.phase === 'collect' || state.round === 2).toBe(true);
        if (state.history[0].results[1].solved) expect(state.history[0].results[1].time).toBeGreaterThanOrEqual(8000);
    });
});

describe('ソルバー', () => {
    it('解答はピースを1つずつ使い、盤面をちょうど埋める', () => {
        const state = newRace();
        const puzzle = puzzleOf(state, 0);
        const [solution] = solve(puzzle.shape, puzzle.pieces);
        expect(solution.map(p => p.id).sort()).toEqual([...puzzle.pieces].sort());
    });
});
