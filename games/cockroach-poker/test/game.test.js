import { describe, it, expect } from 'vitest';
import Game, { KIND_ORDER } from '../public/js/game.js';
import { players, newGame, setHand, totalCards, snapshot } from './helpers.js';

const give = (game, card, target, claim) => game.applyCommand(game.current, { type: 'give', card, target, claim });
const answer = (game, truth) => game.applyCommand(game.round.to, { type: 'answer', truth });
const peek = (game) => game.applyCommand(game.round.to, { type: 'peek' });
const pass = (game, target, claim) => game.applyCommand(game.round.to, { type: 'pass', target, claim });

describe('準備', () => {
    it('64枚（8種×8枚）を全部配る。割り切れない分は親から順に1枚多い', () => {
        for (const n of [3, 4, 5, 6]) {
            const game = new Game(players(n), { seed: 3, startPlayer: 1 });
            expect(totalCards(game)).toBe(64);
            const all = game.players.flatMap(p => p.hand);
            KIND_ORDER.forEach(k => expect(all.filter(c => c === k).length).toBe(8));
            const sizes = game.players.map(p => p.hand.length);
            const base = Math.floor(64 / n);
            const extra = 64 % n;
            sizes.forEach((size, seat) => {
                const order = (seat - 1 + n) % n; // 親（席1）から数えた順
                expect(size).toBe(base + (order < extra ? 1 : 0));
            });
            expect(game.removed).toEqual([]);
            expect(game.limit).toBe(4);
        }
    });

    it('2人のときは10枚を除き、27枚ずつ。5枚で負け', () => {
        const game = newGame(2);
        expect(game.removed.length).toBe(10);
        expect(game.players.map(p => p.hand.length)).toEqual([27, 27]);
        expect(totalCards(game)).toBe(64);
        expect(game.limit).toBe(5);
    });

    it('同じシードなら同じ配り方、最初の親もシードから決まる', () => {
        const a = new Game(players(4), { seed: 42 });
        const b = new Game(players(4), { seed: 42 });
        expect(snapshot(a)).toBe(snapshot(b));
        const firsts = new Set(Array.from({ length: 30 }, (_, s) => new Game(players(4), { seed: s }).current));
        expect(firsts.size).toBeGreaterThan(1);
    });
});

describe('渡して答える', () => {
    it('当たれば渡した人が、外れれば受けた人が表で置き、その人が次の親', () => {
        const game = newGame(3);
        setHand(game, 0, ['spider', 'frog']);
        // 本当のことを言い、「本当」と答えて当たった → 渡した人（席0）が置く
        expect(give(game, 'spider', 1, 'spider')).toBe(true);
        expect(game.phase).toBe('respond');
        expect(answer(game, true)).toBe(true);
        expect(game.players[0].table).toEqual(['spider']);
        expect(game.current).toBe(0);
        // 嘘を言い、「本当」と答えて外れた → 受けた人（席2）が置く
        give(game, 'frog', 2, 'bat');
        answer(game, true);
        expect(game.players[2].table).toEqual(['frog']);
        expect(game.current).toBe(2);
        expect(game.phase).toBe('give');
        expect(game.history.at(-1)).toMatchObject({ card: 'frog', answerer: 2, said: true, correct: false, taker: 2 });
    });

    it('嘘を「うそ」と見抜けば渡した人、本当を「うそ」と言えば受けた人', () => {
        const game = newGame(3);
        setHand(game, 0, ['rat', 'rat']);
        give(game, 'rat', 1, 'fly');
        answer(game, false);
        expect(game.players[0].table).toEqual(['rat']);
        give(game, 'rat', 2, 'rat');
        answer(game, false);
        expect(game.players[2].table).toEqual(['rat']);
    });

    it('見てから、まだ見ていない人に回せる。言う虫は変えてよい', () => {
        const game = newGame(4);
        setHand(game, 0, ['bat']);
        give(game, 'bat', 1, 'bat');
        expect(game.passTargets()).toEqual([2, 3]);
        expect(peek(game)).toBe(true);
        expect(game.phase).toBe('pass');
        expect(pass(game, 0, 'fly')).toBe(false); // 親は見ている
        expect(pass(game, 1, 'fly')).toBe(false); // 自分
        expect(pass(game, 3, 'fly')).toBe(true);
        expect(game.round).toMatchObject({ from: 1, to: 3, claim: 'fly', seen: [0, 1] });
        expect(game.passTargets()).toEqual([2]);
        // 「うそ」と当てた → 回した人（席1）が置く
        answer(game, false);
        expect(game.players[1].table).toEqual(['bat']);
        expect(game.current).toBe(1);
        expect(game.history.at(-1).chain).toEqual([{ from: 0, to: 1, claim: 'bat' }, { from: 1, to: 3, claim: 'fly' }]);
    });

    it('全員が見たカードは、受けるしかない', () => {
        const game = newGame(3);
        give(game, game.players[0].hand[0], 1, 'bat');
        peek(game);
        pass(game, 2, 'bat');
        expect(game.passTargets()).toEqual([]);
        expect(peek(game)).toBe(false);
        expect(game.lastError).toContain('答えて');
        expect(answer(game, true)).toBe(true);
    });

    it('2人のときは回せない', () => {
        const game = newGame(2);
        give(game, game.players[0].hand[0], 1, 'bat');
        expect(peek(game)).toBe(false);
        expect(answer(game, false)).toBe(true);
    });

    it('親は自分以外のだれにでも渡せる。自分には渡せない', () => {
        const game = newGame(4);
        const card = game.players[0].hand[0];
        expect(give(game, card, 0, 'bat')).toBe(false);
        expect(give(game, card, 4, 'bat')).toBe(false);
        expect(give(game, card, 3, 'bat')).toBe(true);
    });
});

describe('負けの判定', () => {
    it('同じ虫が4枚たまった人の負け', () => {
        const game = newGame(3);
        setHand(game, 0, ['spider']);
        game.players[1].table = ['spider', 'spider', 'spider', 'frog', 'frog', 'frog'];
        give(game, 'spider', 1, 'spider');
        answer(game, false); // 外れ → 席1が4枚目
        expect(game.isOver()).toBe(true);
        expect(game.loser).toBe(1);
        expect(game.reason).toBe('set');
        expect(game.applyCommand(1, { type: 'give', card: game.players[1].hand[0], target: 0, claim: 'bat' })).toBe(false);
    });

    it('3枚ずつ何種類あっても、4枚になるまでは負けない', () => {
        const game = newGame(3);
        setHand(game, 0, ['bat']);
        game.players[1].table = ['spider', 'spider', 'spider', 'frog', 'frog', 'frog', 'rat', 'rat', 'rat'];
        give(game, 'bat', 1, 'bat');
        answer(game, false);
        expect(game.isOver()).toBe(false);
        expect(game.current).toBe(1);
    });

    it('2人のときは5枚目で負け', () => {
        const game = newGame(2);
        setHand(game, 0, ['fly', 'fly']);
        game.players[1].table = ['fly', 'fly', 'fly'];
        give(game, 'fly', 1, 'fly');
        answer(game, false);
        expect(game.isOver()).toBe(false);
        game.current = 0;
        game.phase = 'give';
        give(game, 'fly', 1, 'fly');
        answer(game, false);
        expect(game.loser).toBe(1);
        expect(game.reason).toBe('set');
    });

    it('親になったのに手札がない人の負け', () => {
        const game = newGame(3);
        setHand(game, 0, ['bat']);
        game.players[2].hand = []; // 手札がない（枚数は合わなくなるが、判定だけを見る）
        give(game, 'bat', 2, 'bat');
        answer(game, false); // 外れ → 席2が置いて親になるが、渡せない
        expect(game.loser).toBe(2);
        expect(game.reason).toBe('empty');
    });

    it('手札がなくても、受けて当てれば負けない', () => {
        const game = newGame(3);
        setHand(game, 0, ['bat']);
        game.players[2].hand = [];
        give(game, 'bat', 2, 'bat');
        answer(game, true);
        expect(game.isOver()).toBe(false);
        expect(game.current).toBe(0);
    });

    it('4枚目と手札なしが同時なら、そろった方を理由にする', () => {
        const game = newGame(3);
        setHand(game, 0, ['bat']);
        game.players[2].hand = [];
        game.players[2].table = ['bat', 'bat', 'bat'];
        give(game, 'bat', 2, 'bat');
        answer(game, false);
        expect(game.reason).toBe('set');
    });
});

describe('断る操作', () => {
    it('番でない人・持っていないカード・知らない虫・形の違う答えは断り、状態を変えない', () => {
        const game = newGame(3);
        setHand(game, 0, ['bat', 'bat']);
        const missing = KIND_ORDER.find(k => !game.players[0].hand.includes(k));
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'give', card: game.players[1].hand[0], target: 0, claim: 'bat' })).toBe(false);
        expect(give(game, missing, 1, 'bat')).toBe(false);
        expect(give(game, 'bat', 1, 'dragon')).toBe(false);
        expect(give(game, 'bat', '1', 'bat')).toBe(false);
        expect(game.applyCommand(0, { type: 'answer', truth: true })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
        give(game, 'bat', 1, 'bat');
        const mid = snapshot(game);
        expect(game.applyCommand(1, { type: 'answer', truth: 'yes' })).toBe(false);
        expect(game.applyCommand(1, { type: 'pass', target: 2, claim: 'bat' })).toBe(false); // 見ていない
        expect(game.applyCommand(2, { type: 'answer', truth: true })).toBe(false);
        expect(snapshot(game)).toBe(mid);
    });

    it('記録には決まった項目だけを残す', () => {
        const game = newGame(3);
        setHand(game, 0, ['bat']);
        game.applyCommand(0, { type: 'give', card: 'bat', target: 1, claim: 'bat', extra: 'x' });
        expect(game.commands).toEqual([{ playerId: 0, command: { type: 'give', card: 'bat', target: 1, claim: 'bat' } }]);
    });
});
