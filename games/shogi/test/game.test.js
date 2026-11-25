import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { sqOf, FU, KI, KA } from '../public/js/rules.js';
import { moveInfo } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { newGame, setPosition, snapshot, move, drop } from './helpers.js';

const toCommand = (m) => {
    const info = moveInfo(m);
    return info.drop ? drop(info.drop, info.to) : move(info.from, info.to, info.promote);
};

describe('進行', () => {
    it('先手から交互に指し、棋譜を残す', () => {
        const game = newGame([false, false]);
        expect(game.current).toBe(0);
        expect(game.applyCommand(1, move(sqOf(3, 3), sqOf(3, 4)))).toBe(false);
        expect(game.applyCommand(0, move(sqOf(7, 7), sqOf(7, 6)))).toBe(true);
        expect(game.current).toBe(1);
        expect(game.applyCommand(1, move(sqOf(3, 3), sqOf(3, 4)))).toBe(true);
        expect(game.logs).toEqual(['▲７六歩', '△３四歩']);
        expect(game.lastMove).toMatchObject({ seat: 1, from: sqOf(3, 3), to: sqOf(3, 4), drop: null, promote: false });
    });

    it('断る操作では状態が変わらない（ランダムな操作を大量に送る）', () => {
        const game = newGame([false, false]);
        const random = createRandom(7);
        const int = (n) => Math.floor(random() * n);
        const junk = [null, 'move', {}, { type: 'pass' }, { type: 'move', from: -1, to: 3 }, { type: 'move', from: 0.5, to: 1 },
            { type: 'drop', piece: 8, to: 40 }, { type: 'drop', piece: KI, to: 40 }, { type: 'move', from: '60', to: 51 }];
        for (let i = 0; i < 3000 && !game.isOver(); i++) {
            const before = snapshot(game);
            const command = random() < 0.2 ? junk[int(junk.length)]
                : random() < 0.5 ? move(int(81), int(81), random() < 0.5) : drop(1 + int(7), int(81));
            const seat = int(2);
            if (!game.applyCommand(seat, command)) {
                expect(snapshot(game)).toBe(before);
                expect(game.lastError).toBeTruthy();
            }
        }
        // ときどき通った手で局面が進んでいる
        expect(game.ply).toBeGreaterThan(0);
    });

    it('成るかどうかは操作の promote で決まる。余計な項目は記録しない', () => {
        const game = setPosition(newGame([false, false]), '4k4/9/9/6S2/9/9/9/9/4K4 b -');
        expect(game.applyCommand(0, { ...move(sqOf(3, 4), sqOf(3, 3), true), extra: 1 })).toBe(true);
        expect(game.commands[0].command).toEqual({ type: 'move', from: sqOf(3, 4), to: sqOf(3, 3), promote: true });
        expect(game.logs[0]).toBe('▲３三銀成');
    });

    it('詰ませたら勝ち（頭金）。終わったあとは指せない', () => {
        const game = setPosition(newGame([false, false]), '4k4/9/4P4/9/9/9/9/9/4K4 b G');
        expect(game.applyCommand(0, drop(KI, sqOf(5, 2)))).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(0);
        expect(game.reason).toBe('checkmate');
        expect(game.events.at(-1)).toMatchObject({ type: 'end', winner: 0, reason: 'checkmate' });
        expect(game.applyCommand(1, move(sqOf(5, 1), sqOf(4, 1)))).toBe(false);
    });

    it('打ち歩詰めの手は断る', () => {
        const game = setPosition(newGame([false, false]), '8k/9/6NG1/9/9/9/9/9/4K4 b P');
        const before = snapshot(game);
        expect(game.applyCommand(0, drop(FU, sqOf(1, 2)))).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('投了はどちらの席からでもでき、相手の勝ちになる', () => {
        const game = newGame([false, false]);
        expect(game.applyCommand(1, { type: 'resign' })).toBe(true);
        expect(game.isOver()).toBe(true);
        expect([game.winner, game.reason]).toEqual([0, 'resign']);
        const replayed = Game.replay(game.players, game.options, game.commands);
        expect(replayed.winner).toBe(0);
    });

    it('千日手：同じ局面が4回現れたら引き分け', () => {
        const game = newGame([false, false]);
        const cycle = [move(sqOf(5, 9), sqOf(5, 8)), move(sqOf(5, 1), sqOf(5, 2)), move(sqOf(5, 8), sqOf(5, 9)), move(sqOf(5, 2), sqOf(5, 1))];
        for (let i = 0; i < 12; i++) {
            expect(game.isOver()).toBe(false);
            expect(game.applyCommand(i % 2, cycle[i % 4])).toBe(true);
        }
        expect(game.ply).toBe(12);
        expect([game.isOver(), game.winner, game.reason]).toEqual([true, null, 'repetition']);
    });

    it('連続王手の千日手は、王手をかけ続けた側の負け', () => {
        // 先手の飛が 2九と1九を行き来して王手をかけ続け、後手の玉が 1一と2一を行き来する
        const game = setPosition(newGame([false, false]), '8k/9/9/9/9/9/9/9/K6R1 b -');
        const cycle = [move(sqOf(2, 9), sqOf(1, 9)), move(sqOf(1, 1), sqOf(2, 1)), move(sqOf(1, 9), sqOf(2, 9)), move(sqOf(2, 1), sqOf(1, 1))];
        let n = 0;
        while (!game.isOver() && n < 40) {
            expect(game.applyCommand(n % 2, cycle[n % 4])).toBe(true);
            n++;
        }
        expect(n).toBe(12);
        expect([game.winner, game.reason]).toEqual([1, 'perpetual-check']);
    });

    it('ランダムな試合は止まらずに進み（多くは詰みで終わる）、記録から同じ状態を再現できる', () => {
        let ended = 0;
        for (let seed = 1; seed <= 12; seed++) {
            const random = createRandom(seed);
            const game = newGame([false, false]);
            while (!game.isOver() && game.ply < 600) {
                const moves = game.legalMoves();
                // 取る手と成る手を多めに指して、早く終わらせる
                const strong = moves.filter(m => (m & (1 << 14)) || game.pos.board[(m >> 7) & 127]);
                const list = strong.length && random() < 0.7 ? strong : moves;
                expect(game.applyCommand(game.current, toCommand(list[Math.floor(random() * list.length)]))).toBe(true);
            }
            if (game.isOver()) {
                ended++;
                expect(['checkmate', 'repetition', 'perpetual-check']).toContain(game.reason);
            }
            const replayed = Game.replay(game.players, game.options, JSON.parse(JSON.stringify(game.commands)));
            expect(snapshot(replayed)).toBe(snapshot(game));
        }
        expect(ended).toBeGreaterThanOrEqual(8);
    });

    it('持ち駒を打てる。成った駒を取ると元の駒になって持ち駒に入る', () => {
        const game = newGame([false, false]);
        [move(sqOf(7, 7), sqOf(7, 6)), move(sqOf(3, 3), sqOf(3, 4)), move(sqOf(8, 8), sqOf(2, 2), true), move(sqOf(3, 1), sqOf(2, 2))]
            .forEach((c, i) => expect(game.applyCommand(i % 2, c)).toBe(true));
        expect(game.pos.hands[0][KA]).toBe(1);
        expect(game.pos.hands[1][KA]).toBe(1);
        expect(game.applyCommand(0, drop(KA, sqOf(4, 5)))).toBe(true);
        expect(game.logs.at(-1)).toBe('▲４五角');
        expect(game.pos.hands[0][KA]).toBe(0);
    });
});
