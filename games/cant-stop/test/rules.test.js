import { describe, it, expect } from 'vitest';
import Game, { COLUMN_LENGTH, COLUMNS, bustChance, moveOptions } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { setupGame, forceDice, snapshot, sortOptions, players } from './helpers.js';

const optionsOf = game => sortOptions(game.legalMoves());

describe('盤面', () => {
    it('列の長さは 2・12 が 3 マス、7 が 13 マスの山形', () => {
        expect(COLUMNS.map(c => COLUMN_LENGTH[c])).toEqual([3, 5, 7, 9, 11, 13, 11, 9, 7, 5, 3]);
    });
});

describe('ダイスの組の選び方', () => {
    it('組ごとに 2 つの和で進む（4 つのダイスを 3 通りに分ける）', () => {
        // 1+2 / 3+4、1+3 / 2+4、1+4 / 2+3
        const game = setupGame({ dice: [1, 2, 3, 4] });
        expect(optionsOf(game)).toEqual(['0:3+7', '1:4+6', '2:5+5']);
    });

    it('両方で進めるなら両方とも進む（同じ列なら 2 マス）', () => {
        const game = setupGame({ dice: [1, 2, 3, 4] });
        expect(game.applyCommand(0, { type: 'move', pair: 2, sums: [5, 5] })).toBe(true);
        expect(game.runners).toEqual({ 5: 2 });
        expect(game.phase).toBe('decide');
    });

    it('ランナーが 3 つとも出ていれば、その列の和しか使えない', () => {
        // 組 0：5 と 8 → 5 だけ / 組 1：3 と 10 → 使えない / 組 2：7 と 6 → 6 だけ
        const game = setupGame({ runners: { 4: 1, 5: 1, 6: 1 }, dice: [1, 4, 2, 6] });
        expect(optionsOf(game)).toEqual(['0:5', '2:6']);
    });

    it('ランナーが 1 つしか残っていなくて、2 つの和がどちらも新しい列なら、どちらか 1 つを選ぶ', () => {
        // 組 0：2+6=8 と 3+6=9（どちらも新しい列）
        const game = setupGame({ runners: { 4: 1, 5: 1 }, dice: [2, 6, 3, 6] });
        const options = optionsOf(game);
        expect(options).toContain('0:8');
        expect(options).toContain('0:9');
        expect(options).not.toContain('0:8+9');
    });

    it('ランナーが 1 つ残っていて、同じ和が 2 つなら、その列を 2 マス進む', () => {
        const game = setupGame({ runners: { 4: 1, 5: 1 }, dice: [2, 6, 2, 6] });
        expect(optionsOf(game)).toContain('0:8+8');
    });

    it('ランナーがある列と新しい列の組なら、両方とも進む', () => {
        const game = setupGame({ runners: { 4: 1, 5: 1 }, dice: [1, 3, 2, 6] });
        // 組 0：1+3=4（ランナーあり）と 2+6=8（新しい列）
        expect(optionsOf(game)).toContain('0:4+8');
    });

    it('取られた列には進めない', () => {
        const game = setupGame({ claimed: { 7: 1 }, dice: [3, 4, 1, 5] });
        // 組 0：7 と 6 → 6 だけ
        expect(optionsOf(game)).toContain('0:6');
        expect(optionsOf(game)).not.toContain('0:6+7');
    });

    it('頂上の 1 つ手前なら、同じ和が 2 つでも 1 マスだけ進む', () => {
        const game = setupGame({ progress: [{ 2: 2 }], dice: [1, 1, 1, 1] });
        expect(optionsOf(game)).toEqual(['0:2', '1:2', '2:2']);
    });

    it('頂上に着いた列には、それ以上進めない', () => {
        const game = setupGame({ runners: { 12: 3 }, dice: [6, 6, 1, 2] });
        // 組 0：12（頂上）と 3 → 3 だけ
        expect(optionsOf(game)).toContain('0:3');
    });

    it('自分のマーカーの位置から進む（ほかの人の位置は関係ない）', () => {
        const game = setupGame({ progress: [{ 7: 4 }, { 7: 10 }], dice: [3, 4, 3, 4] });
        game.applyCommand(0, { type: 'move', pair: 0, sums: [7, 7] });
        expect(game.runners).toEqual({ 7: 6 });
    });
});

describe('バースト', () => {
    it('どの組でも進めなければ、その手番の進みを失い、次の人の番になる', () => {
        const game = setupGame({ runners: { 2: 1, 3: 1, 12: 1 }, phase: 'decide' });
        forceDice(game, [3, 3, 4, 4]);
        expect(game.applyCommand(0, { type: 'roll' })).toBe(true);
        expect(game.runners).toEqual({});
        expect(game.players[0].progress[2]).toBe(0);
        expect(game.current).toBe(1);
        expect(game.phase).toBe('roll');
        expect(game.events.find(e => e.type === 'bust')).toMatchObject({ seat: 0, lost: { 2: 1, 3: 1, 12: 1 } });
    });

    it('バーストしても、前の手番までに置いたマーカーは残る', () => {
        const game = setupGame({ progress: [{ 2: 2 }], runners: { 2: 3, 3: 1, 12: 1 }, phase: 'decide' });
        forceDice(game, [3, 3, 4, 4]);
        game.applyCommand(0, { type: 'roll' });
        expect(game.players[0].progress[2]).toBe(2);
    });

    it('バーストの確率：ランナーがなければ 0、6・7・8 なら約 8%（92% は進める）', () => {
        const base = { position: () => 0, claimed: Object.fromEntries(COLUMNS.map(c => [c, null])) };
        expect(bustChance({ ...base, runners: {} })).toBe(0);
        expect(bustChance({ ...base, runners: { 6: 1, 7: 1, 8: 1 } })).toBeCloseTo(1 - 1192 / 1296, 5);
        expect(bustChance({ ...base, runners: { 2: 1, 3: 1, 12: 1 } })).toBeGreaterThan(0.5);
    });
});

describe('止める', () => {
    it('ランナーの位置まで自分のマーカーを進め、次の人の番になる', () => {
        const game = setupGame({ runners: { 5: 3, 9: 2 }, phase: 'decide' });
        game.applyCommand(0, { type: 'stop' });
        expect(game.players[0].progress).toMatchObject({ 5: 3, 9: 2 });
        expect(game.runners).toEqual({});
        expect(game.current).toBe(1);
    });

    it('頂上に着いた列を取り、ほかの人のマーカーをその列から取り除く', () => {
        const game = setupGame({ n: 3, progress: [{}, { 4: 5 }, { 4: 2, 5: 1 }], runners: { 4: 7 }, phase: 'decide' });
        game.applyCommand(0, { type: 'stop' });
        expect(game.claimed[4]).toBe(0);
        expect(game.players[1].progress[4]).toBe(0);
        expect(game.players[2].progress[4]).toBe(0);
        expect(game.players[2].progress[5]).toBe(1);
        expect(game.events.find(e => e.type === 'stop').claimed).toEqual([4]);
    });

    it('頂上に着いても、止める前にバーストすれば取れない', () => {
        const game = setupGame({ runners: { 12: 3, 2: 1, 3: 1 }, phase: 'decide' });
        forceDice(game, [3, 3, 4, 4]);
        game.applyCommand(0, { type: 'roll' });
        expect(game.claimed[12]).toBeNull();
    });

    it('3 列を取ったら勝ち', () => {
        const game = setupGame({ claimed: { 2: 0, 12: 0 }, runners: { 3: 5 }, phase: 'decide' });
        game.applyCommand(0, { type: 'stop' });
        expect(game.phase).toBe('end');
        expect(game.winner).toBe(0);
        expect(game.applyCommand(1, { type: 'roll' })).toBe(false);
    });
});

describe('断る操作', () => {
    it('手番でない人・順番の違う操作・できない進め方は断り、状態を変えない', () => {
        const game = setupGame({ dice: [1, 2, 3, 4] });
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'move', pair: 0, sums: [3, 7] })).toBe(false);
        expect(game.applyCommand(0, { type: 'roll' })).toBe(false);
        expect(game.applyCommand(0, { type: 'stop' })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', pair: 0, sums: [3] })).toBe(false); // 両方使えるのに片方
        expect(game.applyCommand(0, { type: 'move', pair: 1, sums: [3, 7] })).toBe(false); // 組と和が合わない
        expect(game.applyCommand(0, { type: 'move', pair: 0, sums: 'x' })).toBe(false);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('振る前には止められない', () => {
        const game = new Game(players(2), { seed: 3 });
        expect(game.applyCommand(game.current, { type: 'stop' })).toBe(false);
    });
});

describe('通しの試合', () => {
    function playRandom(n, seed) {
        const game = new Game(players(n), { seed });
        const random = createRandom(seed * 13 + 5);
        let steps = 0;
        while (!game.isOver()) {
            const seat = game.current;
            let command;
            if (game.phase === 'choose') {
                const options = game.legalMoves();
                command = { type: 'move', ...options[Math.floor(random() * options.length)] };
            } else if (game.phase === 'decide') {
                command = { type: random() < 0.6 ? 'roll' : 'stop' };
            } else {
                command = { type: 'roll' };
            }
            expect(game.applyCommand(seat, command)).toBe(true);
            if (++steps > 20000) throw new Error('終わらない');
        }
        return game;
    }

    it('でたらめな手でも 2〜4 人で最後まで進み、記録から同じ結果を再現できる', () => {
        for (let n = 2; n <= 4; n++) {
            for (let seed = 1; seed <= 8; seed++) {
                const game = playRandom(n, seed * 17 + n);
                expect(game.claimedCount(game.winner)).toBeGreaterThanOrEqual(3);
                // 取られた列には、持ち主以外のマーカーがない
                COLUMNS.forEach(c => {
                    if (game.claimed[c] === null) return;
                    game.players.forEach(p => {
                        if (p.id === game.claimed[c]) expect(p.progress[c]).toBe(COLUMN_LENGTH[c]);
                        else expect(p.progress[c]).toBe(0);
                    });
                });
                const again = Game.replay(players(n), game.options, game.commands);
                expect(snapshot(again)).toBe(snapshot(game));
            }
        }
    });

    it('同じシードなら同じダイスと最初の手番になる', () => {
        const a = new Game(players(3), { seed: 42 });
        const b = new Game(players(3), { seed: 42 });
        a.applyCommand(a.current, { type: 'roll' });
        b.applyCommand(b.current, { type: 'roll' });
        expect(b.dice).toEqual(a.dice);
        expect(b.current).toBe(a.current);
    });

    it('人数の範囲の外は作れない', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(5))).toThrow();
    });
});

describe('ビュー', () => {
    it('進め方は手番の人にだけ渡し、乱数の状態は入れない', () => {
        const game = setupGame({ dice: [1, 2, 3, 4] });
        expect(createGameView(game, 0).options).toHaveLength(3);
        expect(createGameView(game, 1).options).toBeNull();
        expect(JSON.stringify(createGameView(game, 0))).not.toContain('random');
    });

    it('続けるか迷う場面では、バーストの確率を入れる', () => {
        const game = setupGame({ runners: { 6: 1, 7: 1, 8: 1 }, phase: 'decide' });
        expect(createGameView(game, 1).bustChance).toBeCloseTo(0.0802, 3);
    });

    it('moveOptions は DOM なしで使える（CPU と画面が同じものを使う）', () => {
        const claimed = Object.fromEntries(COLUMNS.map(c => [c, null]));
        expect(moveOptions([6, 6, 6, 6], { position: () => 0, runners: {}, claimed })).toHaveLength(3);
    });
});
