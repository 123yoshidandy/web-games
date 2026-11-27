import { describe, it, expect } from 'vitest';
import Game, { COUNTDOWN_MS, START_DELAY_MS, RESULT_MS, DEMO_LIMIT_MS } from '../public/js/game.js';
import { generateBoard, placeRobots, slide, applyMoves, reached, CENTER, CELLS, SIZE, WALL, VORTEX, cellOf } from '../public/js/board.js';
import { solve } from '../public/js/solver.js';
import { createRandom } from '../public/js/random.js';
import { createGameView } from '../public/js/game-view.js';
import { race, playOut } from './helpers.js';

const twoHumans = (options = {}) => new Game([{ name: 'A' }, { name: 'B' }], { seed: 3, targets: 5, startAt: 0, ...options });

describe('盤面', () => {
    it('17の目標（4色×4記号と渦）が真ん中以外に置かれ、壁は両側にそろい、外周は閉じている', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const board = generateBoard(createRandom(seed));
            expect(board.targets.map(t => t.id)).toEqual([...Array(17).keys()]);
            expect(new Set(board.targets.map(t => t.cell)).size).toBe(17);
            board.targets.forEach(t => expect(CENTER).not.toContain(t.cell));
            for (let cell = 0; cell < CELLS; cell++) {
                const x = cell % SIZE;
                if (x < SIZE - 1) expect(Boolean(board.walls[cell] & WALL.E)).toBe(Boolean(board.walls[cell + 1] & WALL.W));
                if (cell < CELLS - SIZE) expect(Boolean(board.walls[cell] & WALL.S)).toBe(Boolean(board.walls[cell + SIZE] & WALL.N));
            }
            for (let i = 0; i < SIZE; i++) expect(board.walls[cellOf(i, 0)] & WALL.N).toBeTruthy();
        }
    });

    it('ロボットは壁か、ほかのロボットに当たるまで滑る', () => {
        const walls = new Array(CELLS).fill(0);
        for (let i = 0; i < SIZE; i++) {
            walls[cellOf(i, 0)] |= WALL.N; walls[cellOf(i, 15)] |= WALL.S; walls[cellOf(0, i)] |= WALL.W; walls[cellOf(15, i)] |= WALL.E;
        }
        walls[cellOf(5, 3)] |= WALL.E; walls[cellOf(6, 3)] |= WALL.W;
        const robots = [cellOf(0, 3), cellOf(9, 0), cellOf(9, 9), cellOf(1, 1)];
        expect(slide(walls, robots, 0, 1)).toBe(cellOf(5, 3));   // 壁で止まる
        expect(slide(walls, robots, 1, 2)).toBe(cellOf(9, 8));   // ほかのロボットの手前で止まる
        expect(slide(walls, robots, 0, 3)).toBe(cellOf(0, 3));   // 動けない
    });

    it('探索の手順は目標に着き、手数は幅優先の数え上げと同じ（最短）', () => {
        const bfs = (walls, robots, id, cell, max) => {
            let frontier = [robots];
            const seen = new Set([robots.join()]);
            for (let depth = 0; depth <= max; depth++) {
                const next = [];
                for (const r of frontier) {
                    if (reached(id, cell, r)) return depth;
                    r.forEach((_, i) => [0, 1, 2, 3].forEach(dir => {
                        const to = slide(walls, r, i, dir);
                        const n = [...r]; n[i] = to;
                        if (to !== r[i] && !seen.has(n.join())) { seen.add(n.join()); next.push(n); }
                    }));
                }
                frontier = next;
            }
            return null;
        };
        let checked = 0;
        for (let seed = 1; seed <= 60 && checked < 25; seed++) {
            const random = createRandom(seed);
            const board = generateBoard(random);
            const robots = placeRobots(random, 4, board.targets);
            const target = board.targets[seed % 17];
            if (reached(target.id, target.cell, robots)) continue;
            const result = solve(board.walls, robots, target.id, target.cell);
            expect(result).toBeTruthy();
            expect(reached(target.id, target.cell, applyMoves(board.walls, robots, result.moves).robots)).toBe(true);
            if (result.count <= 4) {
                expect(bfs(board.walls, robots, target.id, target.cell, 4)).toBe(result.count);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(5);
    });
});

describe('早解き', () => {
    it('最初の宣言で砂時計が動き、ほかの人はもっと少ない手数を宣言でき、自分は前より少なくだけ', () => {
        const game = twoHumans();
        const at = START_DELAY_MS + 5000;
        expect(game.applyCommand(0, { type: 'declare', count: 9, at })).toBe(true);
        expect(game.round.phase).toBe('countdown');
        expect(game.round.deadline).toBe(at + COUNTDOWN_MS);
        expect(game.applyCommand(0, { type: 'declare', count: 9, at: at + 1 })).toBe(false);
        expect(game.applyCommand(1, { type: 'declare', count: 12, at: at + 2 })).toBe(true);
        expect(game.applyCommand(0, { type: 'declare', count: 7, at: at + 3 })).toBe(true);
        expect(game.applyCommand(0, { type: 'declare', count: 0, at: at + 4 })).toBe(false);
    });

    it('時間切れで、少ない手数の人から実演し、失敗したら次の人。成功した人がチップを得て、ロボットはそのまま残る', () => {
        const game = twoHumans();
        const solution = solve(game.board.walls, game.robots, game.round.target, game.round.cell);
        game.applyCommand(1, { type: 'declare', count: solution.count + 2, at: 4000 });
        game.applyCommand(0, { type: 'declare', count: 1, at: 5000 });
        expect(game.applyCommand(null, { type: 'timeout', at: 60000 })).toBe(false); // まだ時間がある
        expect(game.applyCommand(null, { type: 'timeout', at: 64000 })).toBe(true);
        expect(game.round.phase).toBe('demo');
        expect(game.round.demo.seat).toBe(0);
        expect(game.applyCommand(1, { type: 'demo', moves: solution.moves, at: 64100 })).toBe(false); // 番でない
        const before = [...game.robots];
        expect(game.applyCommand(0, { type: 'demo', moves: [[0, 0]], at: 64200 })).toBe(true);
        expect(game.robots).toEqual(before);
        expect(game.round.demo.seat).toBe(1);
        expect(game.applyCommand(1, { type: 'demo', moves: solution.moves, at: 65000 })).toBe(true);
        expect(game.chips[1]).toEqual([game.rounds[0].target]);
        expect(game.robots).toEqual(applyMoves(game.board.walls, before, solution.moves).robots);
        expect(game.round.number).toBe(2);
        expect(game.round.revealAt).toBe(65000 + RESULT_MS);
    });

    it('同じ手数なら、先に宣言した人が先に実演する', () => {
        const game = twoHumans();
        game.applyCommand(1, { type: 'declare', count: 8, at: 4000 });
        game.applyCommand(0, { type: 'declare', count: 8, at: 4500 });
        game.applyCommand(0, { type: 'pass', at: 5000 });
        game.applyCommand(1, { type: 'pass', at: 5100 });
        expect(game.round.phase).toBe('demo');
        expect(game.round.demo.seat).toBe(1);
        expect(game.round.queue).toEqual([{ seat: 0, count: 8 }]);
    });

    it('実演の時間切れは失敗、全員パスで宣言がなければ目標を流す', () => {
        const game = twoHumans();
        game.applyCommand(0, { type: 'declare', count: 5, at: 4000 });
        game.applyCommand(0, { type: 'pass', at: 4100 });
        game.applyCommand(1, { type: 'pass', at: 4200 });
        expect(game.applyCommand(null, { type: 'timeout', at: 4200 + DEMO_LIMIT_MS })).toBe(true);
        expect(game.rounds[0].attempts[0]).toMatchObject({ seat: 0, success: false, timeout: true });
        expect(game.rounds[0].winner).toBeNull();
        game.applyCommand(0, { type: 'pass', at: 100000 });
        game.applyCommand(1, { type: 'pass', at: 100001 });
        expect(game.rounds[1].winner).toBeNull();
        expect(game.rounds[1].bids).toEqual([]);
    });

    it('断る操作は状態を変えない', () => {
        const game = race();
        const before = JSON.stringify(createGameView(game, 0));
        const bad = [
            [0, { type: 'declare', count: 99, at: 5000 }],
            [0, { type: 'demo', moves: [[0, 0]], at: 5000 }],
            [0, { type: 'move', robot: 0, dir: 0, at: 5000 }],
            [null, { type: 'timeout', at: 5000 }],
            [1, { type: 'declare', count: 3 }],
            [5, { type: 'pass', at: 5000 }]
        ];
        for (const [seat, command] of bad) expect(game.applyCommand(seat, command)).toBe(false);
        expect(JSON.stringify(createGameView(game, 0))).toBe(before);
        expect(game.commands).toEqual([]);
    });

    it('人と CPU で終局まで進み、チップの多い人が勝つ', () => {
        const game = playOut(race({ targets: 9, level: 'hard' }));
        expect(game.isOver()).toBe(true);
        expect(game.rounds).toHaveLength(9);
        const { standings, winners } = game.result();
        expect(standings[0].score).toBeGreaterThanOrEqual(standings[1].score);
        expect(winners).toContain(standings[0].seat);
    });

    it('ビューにシードと目標をめくる順は入らない', () => {
        const text = JSON.stringify(createGameView(race(), 0));
        expect(text).not.toMatch(/seed|deck/i);
    });
});

describe('ひとりで練習', () => {
    const solo = () => new Game([{ name: 'あなた' }], { seed: 11, mode: 'solo', targets: 5, startAt: 0 });

    it('最短の手数で着くと3点、戻す・最初からが使え、次の目標へ進む', () => {
        const game = solo();
        const round = game.round;
        const solution = solve(game.board.walls, game.robots, round.target, round.cell);
        expect(round.optimum).toBe(solution.count);
        const [r, d] = solution.moves[0];
        expect(game.applyCommand(0, { type: 'move', robot: r, dir: d, at: 3500 })).toBe(true);
        expect(game.applyCommand(0, { type: 'undo', at: 3600 })).toBe(true);
        expect(game.robots).toEqual(round.startRobots);
        let at = 4000;
        for (const [robot, dir] of solution.moves) game.applyCommand(0, { type: 'move', robot, dir, at: at += 1000 });
        expect(round.phase).toBe('result');
        expect(round.points).toBe(3);
        expect(round.time).toBe(at - round.revealAt);
        expect(game.applyCommand(0, { type: 'next', at: at + 10 })).toBe(true);
        expect(game.round.number).toBe(2);
    });

    it('ヒントは1つの目標で種類ごとに1回、1点引く。あきらめると0点', () => {
        const game = solo();
        expect(game.applyCommand(0, { type: 'hint', kind: 'first', at: 3100 })).toBe(true);
        expect(game.applyCommand(0, { type: 'hint', kind: 'first', at: 3200 })).toBe(false);
        const solution = solve(game.board.walls, game.robots, game.round.target, game.round.cell);
        for (const [robot, dir] of solution.moves) game.applyCommand(0, { type: 'move', robot, dir, at: 5000 });
        expect(game.rounds[0].points).toBe(2);
        game.applyCommand(0, { type: 'next', at: 6000 });
        game.applyCommand(0, { type: 'giveup', at: 7000 });
        expect(game.rounds[1]).toMatchObject({ solved: false, points: 0 });
    });

    it('目標をすべて解くと終わり、点とタイムの合計を出す', () => {
        const game = playOut(solo(), { at: (() => { let t = 3000; return () => (t += 700); })() });
        expect(game.isOver()).toBe(true);
        expect(game.result()).toMatchObject({ points: 15, rounds: 5, optimal: 5 });
    });
});

describe('記録からの再現', () => {
    it('早解き（CPU の宣言と時間切れを含む）を、記録から同じ局面に再現できる', () => {
        let t = 0;
        const game = playOut(race({ targets: 9, players: [{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }] }), { at: () => (t += 900) });
        const again = Game.replay(game.players, game.options, game.commands);
        expect(createGameView(again, 0)).toEqual(createGameView(game, 0));
        expect(again.commands.every(entry => Number.isFinite(entry.command.at))).toBe(true);
    });

    it('途中の記録からも、同じ局面になる', () => {
        let t = 0;
        const game = race({ targets: 9 });
        playOut(game, { at: () => (t += 1500), limit: 7 });
        const again = Game.replay(game.players, game.options, game.commands);
        expect(createGameView(again, 0)).toEqual(createGameView(game, 0));
    });
});
