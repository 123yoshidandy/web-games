import { describe, it, expect } from 'vitest';
import Game, { normalizeOptions, blackSeatOf, resultText } from '../public/js/game.js';
import { BLACK, WHITE } from '../public/js/rules.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { players, newGame, at, mv, playMoves, snapshot } from './helpers.js';

// 10路を引き分けで埋める並び：(列＋2×行) を4で割った余りが 0・1 なら黒（縦横斜めに3つ以上並ばない）
function drawSequence(size = 10) {
    const black = [];
    const white = [];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) ((c + 2 * r) % 4 < 2 ? black : white).push(r * size + c);
    }
    return black.flatMap((sq, i) => [sq, white[i]]);
}

describe('始まり', () => {
    it('黒の席はオプションで決められ、なければシードで決まる（同じシードなら同じ席）', () => {
        expect(newGame().blackSeat).toBe(0);
        expect(new Game(players([false, false]), { black: 1 }).current).toBe(1);
        const seats = new Set();
        for (let seed = 1; seed <= 20; seed++) {
            const game = new Game(players([false, false]), { seed });
            expect(game.blackSeat).toBe(blackSeatOf(seed));
            expect(game.current).toBe(game.blackSeat);
            seats.add(game.blackSeat);
        }
        expect([...seats].sort()).toEqual([0, 1]);
    });

    it('オプションを確かめる', () => {
        expect(normalizeOptions({})).toEqual({ size: 15, seed: 0, black: blackSeatOf(0) });
        expect(() => normalizeOptions({ size: 19 })).toThrow();
        expect(() => normalizeOptions({ black: 2 })).toThrow();
        expect(() => normalizeOptions({ seed: -1 })).toThrow();
        expect(normalizeOptions({ size: 10, black: 1, clock: { main: 60000 } }).clock).toEqual({ main: 60000, byoyomi: 0, periods: 0, increment: 0 });
    });

    it('ビューに色と手番が入り、シードは入らない', () => {
        const game = new Game(players([false, false]), { seed: 7, black: 1 });
        const view = createGameView(game, 1);
        expect(view.colors).toEqual([WHITE, BLACK]);
        expect(view.toPlay).toBe(BLACK);
        expect(view.myTurn).toBe(true);
        expect(view.options).toEqual({ size: 15, black: 1 });
        expect(JSON.stringify(view)).not.toContain('seed');
    });
});

describe('打つ', () => {
    it('交互に置き、手番でない人・石のある点・盤の外は断る（状態は変えない）', () => {
        const game = newGame();
        expect(game.applyCommand(0, mv(at(15, 7, 7)))).toBe(true);
        expect(game.board[at(15, 7, 7)]).toBe(BLACK);
        const before = snapshot(game);
        expect(game.applyCommand(0, mv(at(15, 7, 8)))).toBe(false);
        expect(game.lastError).toBe('今はあなたの番ではありません');
        expect(game.applyCommand(1, mv(at(15, 7, 7)))).toBe(false);
        expect(game.lastError).toBe('そこには石があります');
        expect(game.applyCommand(1, mv(225))).toBe(false);
        expect(game.applyCommand(1, mv(1.5))).toBe(false);
        expect(game.applyCommand(1, { type: 'pass' })).toBe(false);
        expect(game.applyCommand(2, mv(0))).toBe(false);
        expect(game.applyCommand(1, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(1, mv(at(15, 6, 6)))).toBe(true);
        expect(game.board[at(15, 6, 6)]).toBe(WHITE);
        expect(game.logs).toEqual(['1. 黒：H8', '2. 白：G9']);
    });

    it('5つ並べたら勝ちで終わり、五連の石が結果に入る', () => {
        const game = newGame();
        playMoves(game, [at(15, 7, 3), at(15, 8, 3), at(15, 7, 4), at(15, 8, 4), at(15, 7, 5), at(15, 8, 5), at(15, 7, 6), at(15, 8, 6), at(15, 7, 7)]);
        expect(game.isOver()).toBe(true);
        expect(game.result).toMatchObject({ winner: 0, color: BLACK, reason: 'five' });
        expect(game.result.line).toEqual([at(15, 7, 3), at(15, 7, 4), at(15, 7, 5), at(15, 7, 6), at(15, 7, 7)]);
        expect(resultText(game)).toBe('黒の勝ち（五連）');
        expect(game.applyCommand(1, mv(0))).toBe(false);
        expect(game.events.at(-1)).toMatchObject({ type: 'end', winner: 0, reason: 'five' });
    });

    it('白が勝つこともある（白の席が1でも0でも）', () => {
        const game = new Game(players([false, false]), { black: 1 });
        playMoves(game, [at(15, 0, 0), at(15, 5, 5), at(15, 0, 2), at(15, 6, 6), at(15, 0, 4), at(15, 7, 7), at(15, 0, 6), at(15, 8, 8), at(15, 2, 0), at(15, 9, 9)]);
        expect(game.result).toMatchObject({ winner: 0, color: WHITE, reason: 'five' });
        expect(resultText(game)).toBe('白の勝ち（五連）');
    });

    it('盤が埋まったら引き分け', () => {
        const game = newGame([false, false], { size: 10 });
        playMoves(game, drawSequence());
        expect(game.isOver()).toBe(true);
        expect(game.result).toMatchObject({ winner: null, reason: 'draw' });
        expect(game.winner).toBe(null);
        expect(resultText(game)).toBe('引き分け');
    });

    it('投了は手番でなくてもでき、相手の勝ち', () => {
        const game = newGame();
        game.applyCommand(0, mv(at(15, 7, 7)));
        expect(game.applyCommand(0, { type: 'resign' })).toBe(true);
        expect(game.result).toMatchObject({ winner: 1, reason: 'resign', color: WHITE });
        expect(resultText(game)).toBe('白の勝ち（投了）');
    });
});

describe('記録からの再現', () => {
    it('乱数で打った対局を、記録から同じ局面に再現する', () => {
        for (let seed = 1; seed <= 5; seed++) {
            const random = createRandom(seed);
            const game = new Game(players([false, false]), { seed, size: seed % 2 ? 15 : 10 });
            while (!game.isOver()) {
                const moves = game.moves();
                game.applyCommand(game.current, mv(moves[Math.floor(random() * moves.length)]));
            }
            const saved = JSON.parse(JSON.stringify(game.persist()));
            const again = Game.replay(saved.players, saved.options, saved.commands);
            expect(snapshot(again)).toBe(snapshot(game));
            expect(again.result).toEqual(game.result);
        }
    });

    it('途中の記録からも再現でき、そのまま続けられる', () => {
        const game = newGame();
        playMoves(game, [at(15, 7, 7), at(15, 7, 8), at(15, 8, 8)]);
        const { players: p, options, commands } = game.persist();
        const again = Game.replay(p, options, commands);
        expect(again.current).toBe(1);
        expect(again.applyCommand(1, mv(at(15, 6, 6)))).toBe(true);
    });

    it('再現できない記録は投げる', () => {
        const game = newGame();
        expect(() => Game.replay(game.persist().players, game.options, [{ playerId: 1, command: mv(0) }])).toThrow();
    });
});
