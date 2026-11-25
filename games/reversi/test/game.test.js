import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { sqOf, sqName, legalMoves, colorOf, BLACK } from '../public/js/rules.js';
import { createRandom } from '../public/js/random.js';
import { players, newGame, setPosition, snapshot } from './helpers.js';

const move = (name) => ({ type: 'move', sq: sqOf(name) });

// シード付きの乱数で、置けるマスから選んで最後まで打つ
function playRandom(seed) {
    const random = createRandom(seed);
    const game = newGame([false, false]);
    while (!game.isOver()) {
        const moves = game.moves();
        expect(game.applyCommand(game.current, { type: 'move', sq: moves[Math.floor(random() * moves.length)] })).toBe(true);
    }
    return game;
}

describe('始まり', () => {
    it('2人で遊び、黒（席0）が先手', () => {
        expect(() => new Game([{ name: 'A' }])).toThrow();
        const game = newGame();
        expect(game.current).toBe(0);
        expect(game.actors()).toEqual([0]);
        expect(game.moves().length).toBe(4);
    });
});

describe('断る操作', () => {
    it('手番でない人・置けないマス・おかしな操作は断り、状態を変えない', () => {
        const game = newGame();
        const before = snapshot(game);
        const bad = [
            [1, move('f4')],             // 白は手番でない
            [0, move('a1')],             // はさめない
            [0, move('d4')],             // 石がある
            [0, { type: 'move', sq: 64 }],
            [0, { type: 'move', sq: -1 }],
            [0, { type: 'move', sq: 2.5 }],
            [0, { type: 'move', sq: '19' }],
            [0, { type: 'pass' }],       // 置けるマスがあるのでパスはない（パスは操作にしない）
            [0, null],
            [0, 'move'],
            [2, move('d3')]
        ];
        bad.forEach(([seat, command]) => {
            expect(game.applyCommand(seat, command)).toBe(false);
            expect(game.lastError).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ランダムな操作を大量に送っても、断った操作は状態を変えず、受け付けた操作だけで同じ試合を再現できる', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const random = createRandom(seed);
            const game = newGame([false, false]);
            let sent = 0;
            while (!game.isOver() && sent < 2000) {
                sent++;
                const kind = random();
                let seat = game.current;
                let command;
                if (kind < 0.3) {
                    const moves = game.moves();
                    command = { type: 'move', sq: moves[Math.floor(random() * moves.length)] };
                } else if (kind < 0.85) {
                    command = { type: 'move', sq: Math.floor(random() * 70) - 3 };
                    if (random() < 0.3) seat = 1 - seat;
                } else {
                    command = [{ type: 'pass' }, { type: 'move' }, {}, null, { type: 'move', sq: '5' }][Math.floor(random() * 5)];
                }
                const before = snapshot(game);
                const legal = command?.type === 'move' && seat === game.current && game.moves().includes(command.sq);
                const ok = game.applyCommand(seat, command);
                expect(ok).toBe(legal);
                if (!ok) expect(snapshot(game)).toBe(before);
            }
            expect(game.isOver()).toBe(true);
            const replayed = Game.replay(game.players, game.options, JSON.parse(JSON.stringify(game.commands)));
            expect(snapshot(replayed)).toBe(snapshot(game));
        }
    });
});

describe('パスと終わり', () => {
    it('相手が置けないときはパスになり、同じ人がもう一度置く。両者とも置けなければ終わる', () => {
        const game = setPosition(newGame([false, false]), [
            'XO......',
            '........',
            '........',
            '........',
            '........',
            '........',
            '........',
            'XO......'
        ]);
        expect(game.applyCommand(0, move('c1'))).toBe(true);
        // 白は b8 の1つだけ。はさめる黒がないので置けない → パスで、黒の番のまま
        expect(game.current).toBe(0);
        expect(game.events.at(-1)).toMatchObject({ type: 'pass', seat: 1 });
        expect(game.logs.at(-1)).toContain('パス');
        expect(game.applyCommand(1, move('d1'))).toBe(false);
        expect(game.applyCommand(0, move('c8'))).toBe(true);
        // 白の石がなくなり、両者とも置けない
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(0);
        expect(game.counts()).toEqual({ black: 6, white: 0, empty: 58 });
        expect(game.events.at(-1)).toMatchObject({ type: 'end', winner: 0, black: 6, white: 0, empty: 58 });
        expect(game.actors()).toEqual([]);
        expect(game.applyCommand(0, move('d1'))).toBe(false);
    });

    it('盤が埋まったら終わり、石の数が同じなら引き分け', () => {
        // 最後の空きは h8。黒が置くと h7 だけが返り、32対32
        // h8 から見て、左（g8）と左上（g7）は黒なので返らない。上は h7 が白、h6 が黒
        const board = Array(64).fill('O');
        const black = ['h6', 'g7', 'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8'];
        for (let sq = 0; black.length < 30; sq++) if (!black.includes(sqName(sq))) black.push(sqName(sq));
        black.forEach(name => { board[sqOf(name)] = 'X'; });
        board[sqOf('h8')] = '.';
        const game = setPosition(newGame([false, false]), Array.from({ length: 8 }, (_, r) => board.slice(r * 8, r * 8 + 8).join('')));
        expect(game.counts()).toEqual({ black: 30, white: 33, empty: 1 });
        expect(legalMoves(game.board, BLACK)).toEqual([sqOf('h8')]);
        expect(game.applyCommand(0, move('h8'))).toBe(true);
        expect(game.lastMove.flips).toEqual([sqOf('h7')]);
        expect(game.isOver()).toBe(true);
        expect(game.counts()).toEqual({ black: 32, white: 32, empty: 0 });
        expect(game.winner).toBe(null);
        expect(game.logs.at(-1)).toContain('引き分け');
    });

    it('ランダムな試合はどれも、盤が埋まるか両者とも置けなくなって終わり、石の多い方が勝つ', () => {
        for (let seed = 1; seed <= 50; seed++) {
            const game = playRandom(seed);
            const { black, white, empty } = game.counts();
            expect(black + white + empty).toBe(64);
            expect(legalMoves(game.board, colorOf(0))).toEqual([]);
            expect(legalMoves(game.board, colorOf(1))).toEqual([]);
            expect(game.winner).toBe(black > white ? 0 : white > black ? 1 : null);
            expect(game.ply).toBe(game.commands.length);
            expect(game.ply).toBe(60 - empty);
        }
    });
});

describe('記録からの再現', () => {
    it('保存した記録（JSON）から、同じ状態を作り直せる', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = playRandom(seed);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            const replayed = Game.replay(saved.players, saved.options, saved.commands);
            expect(snapshot(replayed)).toBe(snapshot(game));
        }
    });

    it('途中までの記録からも再現でき、その先を続けられる', () => {
        const game = playRandom(7);
        const half = game.commands.slice(0, 20);
        const replayed = Game.replay(game.players, game.options, half);
        expect(replayed.ply).toBe(20);
        const next = game.commands[20];
        expect(replayed.applyCommand(next.playerId, next.command)).toBe(true);
    });

    it('記録にない操作が混じると、再現できないことを知らせる', () => {
        expect(() => Game.replay(players([false, false]), {}, [{ playerId: 0, command: move('a1') }])).toThrow();
    });
});
