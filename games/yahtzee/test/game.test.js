import { describe, it, expect } from 'vitest';
import Game, {
    CATEGORIES, ROUNDS, scoreFor, legalCategories, pointsFor, totalsOf, emptyScores, isYahtzee
} from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { makeGame, players, setDice, setScores, snapshot, playTurn } from './helpers.js';

const NO_KEEP = [false, false, false, false, false];

describe('点数の計算', () => {
    it('上段はその目の合計', () => {
        expect(scoreFor([1, 1, 3, 1, 6], 'ones')).toBe(3);
        expect(scoreFor([6, 6, 6, 2, 6], 'sixes')).toBe(24);
        expect(scoreFor([1, 2, 3, 4, 5], 'sixes')).toBe(0);
    });

    it('スリーカード・フォーカードは条件を満たせば5個の合計', () => {
        expect(scoreFor([3, 3, 3, 5, 6], 'threeKind')).toBe(20);
        expect(scoreFor([3, 3, 2, 5, 6], 'threeKind')).toBe(0);
        expect(scoreFor([4, 4, 4, 4, 2], 'fourKind')).toBe(18);
        expect(scoreFor([4, 4, 4, 2, 2], 'fourKind')).toBe(0);
        expect(scoreFor([5, 5, 5, 5, 5], 'fourKind')).toBe(25);
    });

    it('フルハウスは3個と2個の組で25点。5個とも同じはフルハウスではない', () => {
        expect(scoreFor([2, 2, 5, 5, 5], 'fullHouse')).toBe(25);
        expect(scoreFor([2, 2, 5, 5, 6], 'fullHouse')).toBe(0);
        expect(scoreFor([5, 5, 5, 5, 5], 'fullHouse')).toBe(0);
    });

    it('ストレートは続いた目の長さで決まる', () => {
        expect(scoreFor([1, 2, 3, 4, 6], 'smallStraight')).toBe(30);
        expect(scoreFor([3, 4, 5, 6, 6], 'smallStraight')).toBe(30);
        expect(scoreFor([1, 2, 3, 5, 6], 'smallStraight')).toBe(0);
        expect(scoreFor([2, 3, 4, 5, 6], 'largeStraight')).toBe(40);
        expect(scoreFor([1, 2, 3, 4, 6], 'largeStraight')).toBe(0);
        expect(scoreFor([2, 3, 4, 5, 6], 'smallStraight')).toBe(30);
    });

    it('ヤッツィーは50点、チャンスは合計', () => {
        expect(scoreFor([6, 6, 6, 6, 6], 'yahtzee')).toBe(50);
        expect(scoreFor([6, 6, 6, 6, 5], 'yahtzee')).toBe(0);
        expect(scoreFor([1, 2, 3, 4, 6], 'chance')).toBe(16);
        expect(isYahtzee([2, 2, 2, 2, 2])).toBe(true);
    });

    it('ジョーカーのときは、フルハウスとストレートが満点', () => {
        expect(scoreFor([4, 4, 4, 4, 4], 'fullHouse', true)).toBe(25);
        expect(scoreFor([4, 4, 4, 4, 4], 'smallStraight', true)).toBe(30);
        expect(scoreFor([4, 4, 4, 4, 4], 'largeStraight', true)).toBe(40);
        expect(scoreFor([4, 4, 4, 4, 4], 'threeKind', true)).toBe(20);
    });

    it('上段が63点以上なら35点のボーナス。ヤッツィーボーナスは1回100点', () => {
        const player = { scores: { ...emptyScores(), ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, chance: 20 }, yahtzeeBonus: 2 };
        expect(totalsOf(player)).toEqual({ upper: 63, upperBonus: 35, lower: 20, yahtzeeBonus: 200, total: 318 });
        player.scores.sixes = 12;
        expect(totalsOf(player).upperBonus).toBe(0);
    });
});

describe('ジョーカーと記入できる欄', () => {
    const scores = (filled) => ({ ...emptyScores(), ...filled });

    it('ヤッツィーの欄が空いていれば、どこにでも書ける', () => {
        expect(legalCategories(scores({}), [3, 3, 3, 3, 3])).toEqual(CATEGORIES);
    });

    it('ヤッツィーの欄が埋まっていて、その目の上段が空いていれば、そこにしか書けない', () => {
        expect(legalCategories(scores({ yahtzee: 50 }), [3, 3, 3, 3, 3])).toEqual(['threes']);
        expect(legalCategories(scores({ yahtzee: 0 }), [3, 3, 3, 3, 3])).toEqual(['threes']);
    });

    it('上段が埋まっていれば、空いている下段のどこか。下段も埋まっていれば、空いている上段に0点', () => {
        expect(legalCategories(scores({ yahtzee: 50, threes: 9, chance: 20 }), [3, 3, 3, 3, 3]))
            .toEqual(['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight']);
        const lowerFull = { yahtzee: 50, threes: 9, threeKind: 10, fourKind: 10, fullHouse: 25, smallStraight: 30, largeStraight: 40, chance: 20 };
        expect(legalCategories(scores(lowerFull), [3, 3, 3, 3, 3])).toEqual(['ones', 'twos', 'fours', 'fives', 'sixes']);
        expect(pointsFor(scores(lowerFull), [3, 3, 3, 3, 3], 'sixes')).toEqual({ points: 0, bonus: 100 });
    });

    it('ヤッツィーボーナスは、ヤッツィーの欄が50点のときだけ', () => {
        expect(pointsFor(scores({ yahtzee: 50, threes: 9 }), [3, 3, 3, 3, 3], 'largeStraight')).toEqual({ points: 40, bonus: 100 });
        expect(pointsFor(scores({ yahtzee: 0, threes: 9 }), [3, 3, 3, 3, 3], 'largeStraight')).toEqual({ points: 40, bonus: 0 });
    });
});

describe('ゲームの進行', () => {
    it('3回まで振れて、残したサイコロは変わらない', () => {
        const game = makeGame(1, 7);
        expect(game.applyCommand(0, { type: 'roll', keep: NO_KEEP })).toBe(true);
        const first = [...game.dice];
        expect(first.every(d => d >= 1 && d <= 6)).toBe(true);
        expect(game.applyCommand(0, { type: 'roll', keep: [true, false, true, false, false] })).toBe(true);
        expect(game.dice[0]).toBe(first[0]);
        expect(game.dice[2]).toBe(first[2]);
        expect(game.kept).toEqual([true, false, true, false, false]);
        expect(game.applyCommand(0, { type: 'roll', keep: NO_KEEP })).toBe(true);
        expect(game.rollsLeft).toBe(0);
        expect(game.applyCommand(0, { type: 'roll', keep: NO_KEEP })).toBe(false);
        expect(game.lastError).toMatch(/もう振れません/);
    });

    it('振る前は記入できない。記入したら次の人の番', () => {
        const game = makeGame(2, 3);
        expect(game.applyCommand(0, { type: 'score', category: 'chance' })).toBe(false);
        game.applyCommand(0, { type: 'roll', keep: NO_KEEP });
        const sum = game.dice.reduce((s, d) => s + d, 0);
        expect(game.applyCommand(0, { type: 'score', category: 'chance' })).toBe(true);
        expect(game.players[0].scores.chance).toBe(sum);
        expect(game.turn).toBe(1);
        expect(game.rollsLeft).toBe(3);
        expect(game.round).toBe(1);
        playTurn(game);
        expect(game.turn).toBe(0);
        expect(game.round).toBe(2);
    });

    it('全員が13回書いたら終わり、合計の一番高い人が勝つ', () => {
        const game = makeGame(3, 11);
        for (let i = 0; i < ROUNDS * 3; i++) playTurn(game);
        expect(game.isOver()).toBe(true);
        expect(game.players.every(p => CATEGORIES.every(c => p.scores[c] !== null))).toBe(true);
        const totals = game.results().map(r => r.total);
        expect(game.winners.map(id => totals[id]).every(t => t === Math.max(...totals))).toBe(true);
        expect(game.applyCommand(0, { type: 'roll', keep: NO_KEEP })).toBe(false);
    });

    it('ジョーカーのヤッツィーを記入すると、ヤッツィーボーナスを足す', () => {
        const game = makeGame(1, 1);
        setScores(game, 0, { yahtzee: 50, fives: 15 });
        setDice(game, [5, 5, 5, 5, 5]);
        expect(game.legal()).not.toContain('fives');
        expect(game.applyCommand(0, { type: 'score', category: 'fives' })).toBe(false);
        expect(game.applyCommand(0, { type: 'score', category: 'largeStraight' })).toBe(true);
        expect(game.players[0].scores.largeStraight).toBe(40);
        expect(game.players[0].yahtzeeBonus).toBe(1);
        expect(game.events.find(e => e.type === 'score')).toMatchObject({ points: 40, bonus: 100, joker: true });
    });

    it('同じシードと操作の記録から、同じゲームを再現できる', () => {
        const game = makeGame(2, 99);
        game.applyCommand(0, { type: 'roll', keep: NO_KEEP });
        game.applyCommand(0, { type: 'roll', keep: [true, true, false, false, true], extra: 1 });
        game.applyCommand(0, { type: 'score', category: 'chance' });
        playTurn(game);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(saved.commands[1].command).toEqual({ type: 'roll', keep: [true, true, false, false, true] });
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('1回目の振りでは、残す指定を見ない（全部振る）', () => {
        const game = makeGame(1, 5);
        expect(game.applyCommand(0, { type: 'roll', keep: [true, true, true, true, true] })).toBe(true);
        expect(game.commands[0].command.keep).toEqual(NO_KEEP);
    });

    it('断る操作は状態を変えない', () => {
        const game = makeGame(2, 21);
        game.applyCommand(0, { type: 'roll', keep: NO_KEEP });
        game.players[0].scores.ones = 2;
        const before = snapshot(game);
        const bad = [
            [1, { type: 'roll', keep: NO_KEEP }],
            [0, { type: 'roll', keep: [true, true, true, true, true] }],
            [0, { type: 'roll', keep: [true, 'x', true, true, true] }],
            [0, { type: 'roll', keep: [true] }],
            [0, { type: 'roll' }],
            [0, { type: 'score', category: 'ones' }],
            [0, { type: 'score', category: 'nope' }],
            [0, { type: 'score', category: 'constructor' }],
            [0, { type: 'score' }],
            [0, { type: 'hold' }],
            [0, null],
            [5, { type: 'roll', keep: NO_KEEP }]
        ];
        bad.forEach(([seat, command]) => {
            expect(game.applyCommand(seat, command), JSON.stringify(command)).toBe(false);
            expect(game.lastError).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('人数は1〜4人', () => {
        expect(() => new Game([], {})).toThrow();
        expect(() => new Game(players(5), {})).toThrow();
        expect(new Game(players(4), {}).players).toHaveLength(4);
    });
});

describe('ビュー', () => {
    it('振る前は先読みがなく、振ったら記入できる欄の点数が入る', () => {
        const game = makeGame(1, 2);
        expect(createGameView(game, 0).options).toEqual({});
        setDice(game, [2, 2, 3, 3, 3]);
        const view = createGameView(game, 0);
        expect(view.rolled).toBe(true);
        expect(view.options.fullHouse).toEqual({ points: 25, bonus: 0 });
        expect(view.options.threes).toEqual({ points: 9, bonus: 0 });
        expect(Object.keys(view.options)).toHaveLength(13);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });

    it('ジョーカーのときは、記入できる欄だけを入れる', () => {
        const game = makeGame(1, 2);
        setScores(game, 0, { yahtzee: 50 });
        setDice(game, [4, 4, 4, 4, 4]);
        const view = createGameView(game, 0);
        expect(view.joker).toBe(true);
        expect(view.options).toEqual({ fours: { points: 20, bonus: 100 } });
    });
});
