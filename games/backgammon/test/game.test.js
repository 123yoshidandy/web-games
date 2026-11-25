import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { board, setMove } from './helpers.js';

const players = () => [{ name: 'A' }, { name: 'B' }];
const snapshot = (game) => JSON.stringify({ state: { ...game.state, legalCache: undefined }, score: game.score, commands: game.commands });

// でたらめな手で進める（キューブも使う）
function randomCommand(game, r) {
    const s = game.state;
    if (s.phase === 'between') return { type: 'next' };
    if (s.phase === 'double') return { type: r() < 0.7 ? 'take' : 'drop' };
    if (s.phase === 'roll') return { type: r() < 0.15 ? 'double' : 'roll' };
    const plays = game.legal().plays;
    return { type: 'play', steps: plays[Math.floor(r() * plays.length)].steps };
}

describe('最初の振りと手番', () => {
    it('大きい目を出した人が先に、その2つの目で動かす。同じシードなら同じ', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const g = new Game(players(), { seed });
            const [a, b] = g.state.dice;
            expect(a).not.toBe(b);
            expect(g.state.turn).toBe(a > b ? 0 : 1);
            expect(g.state.phase).toBe('move');
            expect(snapshot(new Game(players(), { seed }))).toBe(snapshot(g));
        }
    });

    it('キューブを使わない設定では、ロールを自動で行う', () => {
        const g = new Game(players(), { seed: 3, cube: false });
        const seat = g.current;
        g.applyCommand(seat, { type: 'play', steps: g.legal().plays[0].steps });
        expect(g.state.phase).toBe('move');
        expect(g.current).toBe(1 - seat);
        expect(g.state.dice).toHaveLength(2);
    });

    it('動かせなければ、自動で相手の番になる', () => {
        const g = new Game(players(), { seed: 4, cube: false });
        // 0 がバーにいて、1 のインナーボードが閉じている。0 の番に回ったら動けない
        setMove(g, board({ 25: 1, 6: 14 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 8: 3 }), [1, 2], 1);
        const steps = g.legal().plays[0].steps;
        expect(g.applyCommand(1, { type: 'play', steps })).toBe(true);
        const kinds = g.events.slice(-3).map(e => e.type);
        expect(kinds).toEqual(['roll', 'noMove', 'roll']);
        expect(g.current).toBe(1);
    });
});

describe('ダブリングキューブ', () => {
    // 1 の番が終わり、0 がロールの前にいる状態を作る
    const atRoll = (options = {}) => {
        const g = new Game(players(), { seed: 11, matchLength: 5, ...options });
        if (g.current === 0) g.applyCommand(0, { type: 'play', steps: g.legal().plays[0].steps });
        if (g.state.phase === 'move') g.applyCommand(1, { type: 'play', steps: g.legal().plays[0].steps });
        expect(g.state.phase).toBe('roll');
        return g;
    };

    it('受けるとキューブが2倍になり、受けた人のものになる。ダブルした人はそのまま振る', () => {
        const g = atRoll();
        const seat = g.current;
        expect(g.canDouble(seat)).toBe(true);
        expect(g.applyCommand(seat, { type: 'double' })).toBe(true);
        expect(g.state.phase).toBe('double');
        expect(g.current).toBe(1 - seat);
        expect(g.applyCommand(seat, { type: 'take' })).toBe(false);
        expect(g.applyCommand(1 - seat, { type: 'take' })).toBe(true);
        expect(g.state.cube).toEqual({ value: 2, owner: 1 - seat });
        expect(g.state.phase).toBe('move');
        expect(g.current).toBe(seat);
    });

    it('降りると、ダブルの前のキューブの点で負ける', () => {
        const g = atRoll();
        const seat = g.current;
        g.applyCommand(seat, { type: 'double' });
        g.applyCommand(1 - seat, { type: 'drop' });
        expect(g.score[seat]).toBe(1);
        expect(g.state.phase).toBe('between');
        expect(g.state.result).toMatchObject({ winner: seat, points: 1, kind: 0 });
        expect(g.applyCommand(seat, { type: 'next' })).toBe(true);
        expect(g.gameNo).toBe(2);
        expect(g.state.cube).toEqual({ value: 1, owner: null });
    });

    it('1点先取とキューブなしの設定では、ダブルできない', () => {
        for (const options of [{ matchLength: 1 }, { cube: false }]) {
            const g = new Game(players(), { seed: 11, ...options });
            expect(g.canDouble(0) || g.canDouble(1)).toBe(false);
        }
    });

    it('マッチの1点前に初めて来た次のゲームは、キューブを使わない（クロフォード）', () => {
        const g = atRoll({ matchLength: 3 });
        const seat = g.current;
        g.score[seat] = 1;
        g.applyCommand(seat, { type: 'double' });
        g.applyCommand(1 - seat, { type: 'drop' });
        expect(g.score.includes(2)).toBe(true);
        g.applyCommand(0, { type: 'next' });
        expect(g.state.crawford).toBe(true);
        expect(g.canDouble(0) || g.canDouble(1)).toBe(false);
    });

    it('相手がマッチに届かない今のキューブでも勝てばマッチに届くなら、ダブルは出さない', () => {
        const g = atRoll({ matchLength: 5 });
        g.score[g.current] = 4;
        expect(g.canDouble(g.current)).toBe(false);
    });
});

describe('勝ちと点数', () => {
    it('ギャモンはキューブの2倍、マッチに届いたら終わり', () => {
        const g = new Game(players(), { seed: 5, matchLength: 3 });
        g.state.cube = { value: 2, owner: 1 };
        setMove(g, board({ 1: 1, 0: 14 }, { 6: 15 }), [3, 2], 0);
        expect(g.applyCommand(0, { type: 'play', steps: [[1, 3]] })).toBe(true);
        expect(g.state.result).toMatchObject({ winner: 0, points: 4, kind: 2 });
        expect(g.isOver()).toBe(true);
        expect(g.winner).toBe(0);
        expect(g.applyCommand(0, { type: 'next' })).toBe(false);
    });
});

describe('記録と再現', () => {
    it('でたらめな手で最後まで進み、記録から同じ状態を再現できる', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const g = new Game(players(), { seed, matchLength: 5 });
            const r = createRandom(seed * 31);
            let n = 0;
            while (!g.isOver() && n++ < 4000) {
                expect(g.applyCommand(g.actors()[0], randomCommand(g, r))).toBe(true);
            }
            expect(g.isOver()).toBe(true);
            const saved = JSON.parse(JSON.stringify(g.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(g));
        }
    });

    it('断った操作は状態を変えず、記録にも残らない', () => {
        const r = createRandom(9);
        const g = new Game(players(), { seed: 9, matchLength: 5 });
        for (let i = 0; i < 300 && !g.isOver(); i++) {
            const before = snapshot(g);
            const phase = g.state.phase;
            const bad = [
                { type: 'play', steps: [[24, 7]] }, { type: 'play', steps: 'x' }, { type: 'play', steps: [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1]] },
                { type: 'proxy' }, null, 'roll',
                ...(phase === 'double' ? [] : [{ type: 'take' }, { type: 'drop' }]),
                ...(phase === 'between' ? [] : [{ type: 'next' }])
            ];
            for (const command of bad) {
                for (const seat of [0, 1]) {
                    if (g.applyCommand(seat, command)) throw new Error(`通ってしまった ${JSON.stringify(command)} ${g.state.phase}`);
                }
            }
            expect(snapshot(g)).toBe(before);
            g.applyCommand(g.actors()[0], randomCommand(g, r));
        }
    });

    it('ビューに盤・ダイス・キューブ・点数が入る', () => {
        const g = new Game(players(), { seed: 2 });
        const v = createGameView(g, 0);
        expect(v.board[0][24]).toBe(2);
        expect(v.players[0].pips).toBe(167);
        expect(v.dice).toEqual(g.state.dice);
        expect(v.cube).toEqual({ value: 1, owner: null });
        expect(v.options.matchLength).toBe(3);
    });
});
