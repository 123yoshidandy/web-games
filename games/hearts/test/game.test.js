import { describe, it, expect } from 'vitest';
import Game, { DECK, legalCards, trickWinner, pointsOf, sortCards } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players, makeGame, setup, playCards, snapshot } from './helpers.js';

// 同じ手札で4人とも渡しを終える（各自、手札の先頭3枚）
const passAll = (game) => [0, 1, 2, 3].forEach(seat => {
    if (!game.applyCommand(seat, { type: 'pass', cards: game.players[seat].hand.slice(0, 3) })) throw new Error(game.lastError);
});

describe('配りと渡し', () => {
    it('52枚を13枚ずつ配り、まず渡す札を選ぶ', () => {
        const game = makeGame(3);
        expect(game.players.every(p => p.hand.length === 13)).toBe(true);
        expect(game.players.flatMap(p => p.hand).sort()).toEqual([...DECK].sort());
        expect(game.phase).toBe('pass');
        expect(game.actors()).toEqual([0, 1, 2, 3]);
        expect(() => new Game(players().slice(0, 3))).toThrow();
    });

    it('渡す先は、左 → 右 → 向かい → 渡さない、をくり返す', () => {
        const game = makeGame(2);
        const offsets = [];
        for (let r = 1; r <= 5; r++) {
            game.round = r;
            offsets.push(game.passOffset());
        }
        expect(offsets).toEqual([1, 3, 2, 0, 1]);
    });

    it('3枚ずつ選び、全員がそろったら左へ渡す。渡したらクラブの2を持つ人から始める', () => {
        const game = makeGame(5);
        const sent = game.players.map(p => p.hand.slice(0, 3));
        expect(game.applyCommand(0, { type: 'pass', cards: sent[0].slice(0, 2) })).toBe(false);
        expect(game.applyCommand(0, { type: 'pass', cards: [sent[0][0], sent[0][0], sent[0][1]] })).toBe(false);
        expect(game.applyCommand(0, { type: 'pass', cards: [...sent[0].slice(0, 2), game.players[1].hand[0]] })).toBe(false);
        passAll(game);
        sent.forEach((cards, seat) => {
            const to = (seat + 1) % 4;
            cards.forEach(c => expect(game.players[to].hand).toContain(c));
            cards.forEach(c => expect(game.players[seat].hand).not.toContain(c));
        });
        expect(game.phase).toBe('play');
        expect(game.players[game.turn].hand).toContain('2C');
        expect(game.trickNo).toBe(1);
    });

    it('4ラウンド目は渡さずに、すぐ始める', () => {
        const game = makeGame(1);
        game.players.forEach(p => { p.score = 0; });
        game.round = 3;
        game.deal();
        expect(game.round).toBe(4);
        expect(game.phase).toBe('play');
        expect(game.actors()).toEqual([game.players.findIndex(p => p.hand.includes('2C'))]);
    });
});

describe('出せる札', () => {
    it('最初のトリックは、クラブの2から始める', () => {
        expect(legalCards(['2C', '5C', 'AS'], [], { firstTrick: true, broken: false })).toEqual(['2C']);
    });

    it('出されたスートがあれば、それを出す（マスト・フォロー）', () => {
        expect(legalCards(['3D', '9D', 'KS', '4H'], [{ seat: 0, card: '5D' }], { firstTrick: false, broken: false })).toEqual(['3D', '9D']);
        expect(legalCards(['KS', '4H'], [{ seat: 0, card: '5D' }], { firstTrick: false, broken: false })).toEqual(['KS', '4H']);
    });

    it('最初のトリックでは、クラブがなくても、ハートとスペードのクイーンは出せない。失点の札しかなければ出せる', () => {
        const trick = [{ seat: 0, card: '2C' }];
        expect(legalCards(['QS', '4H', '9D', 'AS'], trick, { firstTrick: true, broken: false })).toEqual(['9D', 'AS']);
        expect(legalCards(['QS', '4H', 'AH'], trick, { firstTrick: true, broken: false })).toEqual(['QS', '4H', 'AH']);
    });

    it('ハートが割れるまで、ハートで始められない。手札がハートだけなら始めてよい', () => {
        expect(legalCards(['3D', '4H', 'KH'], [], { firstTrick: false, broken: false })).toEqual(['3D']);
        expect(legalCards(['3D', '4H', 'KH'], [], { firstTrick: false, broken: true })).toEqual(['3D', '4H', 'KH']);
        expect(legalCards(['4H', 'KH'], [], { firstTrick: false, broken: false })).toEqual(['4H', 'KH']);
    });

    it('通らない札は断り、状態を変えない。理由を伝える', () => {
        const game = makeGame();
        setup(game, { hands: [['5D', 'KD', '4H'], ['2D', '3S', 'QS'], ['6D', '7D', '8D'], ['9D', 'TD', 'JD']], turn: 0 });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'play', card: '4H' })).toBe(false);
        expect(game.lastError).toMatch('ハートが割れる');
        expect(game.applyCommand(1, { type: 'play', card: '2D' })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 'AS' })).toBe(false);
        expect(game.applyCommand(0, { type: 'pass', cards: ['5D', 'KD', '4H'] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        playCards(game, ['5D']);
        expect(game.applyCommand(1, { type: 'play', card: '3S' })).toBe(false);
        expect(game.lastError).toMatch('出されたスート');
    });
});

describe('トリック', () => {
    it('最初のスートの一番高いランクが取り、取った人が次を始める。ハートを出したら割れる', () => {
        expect(trickWinner([{ seat: 2, card: '5D' }, { seat: 3, card: 'AS' }, { seat: 0, card: 'KD' }, { seat: 1, card: 'TD' }])).toBe(0);
        const game = makeGame();
        setup(game, { hands: [['5D', '8C'], ['KD', '9C'], ['4H', 'TC'], ['TD', 'JC']], turn: 0 });
        playCards(game, ['5D', 'KD', '4H', 'TD']);
        expect(game.broken).toBe(true);
        expect(game.players[1].taken).toEqual(['5D', 'KD', '4H', 'TD']);
        expect(game.turn).toBe(1);
        expect(game.trickNo).toBe(3);
    });

    it('スペードのクイーンでは、ハートは割れない', () => {
        const game = makeGame();
        setup(game, { hands: [['5D', '8C'], ['QS', '9C'], ['6D', 'TC'], ['TD', 'JC']], turn: 0 });
        playCards(game, ['5D', 'QS']);
        expect(game.broken).toBe(false);
    });
});

describe('得点と終わり', () => {
    // 最後のトリックだけを残した状態から、取った札を決めてラウンドを終える
    const finish = (game, taken, lastCards, turn = 0) => {
        setup(game, { hands: lastCards.map(c => [c]), turn, trickNo: 13, broken: true });
        taken.forEach((cards, seat) => { game.players[seat].taken = [...cards]; });
        playCards(game, lastCards.slice(turn).concat(lastCards.slice(0, turn)));
    };

    it('ハート1枚1点、スペードのクイーン13点。終わったら次のラウンドを配る', () => {
        const game = makeGame();
        finish(game, [['QS', '2H'], ['3H'], [], []], ['2C', '3C', '4C', '5C']);
        expect(game.players.map(p => p.score)).toEqual([14, 1, 0, 0]);
        expect(game.round).toBe(2);
        expect(game.phase).toBe('pass');
        expect(game.passOffset()).toBe(3);
    });

    it('失点の札を全部取ったら（シュート・ザ・ムーン）、本人は0点、ほかの全員が26点', () => {
        const game = makeGame();
        const hearts = DECK.filter(c => pointsOf(c) === 1);
        finish(game, [[...hearts, 'QS'], [], [], []], ['AC', '3C', '4C', '5C']);
        expect(game.players.map(p => p.score)).toEqual([0, 26, 26, 26]);
        expect(game.events.find(e => e.type === 'roundEnd').moon).toBe(0);
    });

    it('だれかが100点に達したら終わり。失点の一番少ない人が勝ち。同点なら全員が勝ち', () => {
        const game = makeGame();
        game.players.forEach((p, i) => { p.score = [90, 40, 40, 60][i]; });
        finish(game, [['QS'], [], [], []], ['2C', '3C', '4C', '5C']);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1, 2]);
        expect(game.applyCommand(0, { type: 'play', card: '2C' })).toBe(false);
    });
});

describe('記録と再現', () => {
    // 出せる札からでたらめに選んで最後まで進める（判断の乱数はゲームと別）
    const randomPlay = (seed) => {
        const game = new Game(players(), { seed });
        let x = seed * 7919 + 1;
        const next = () => (x = (x * 1103515245 + 12345) % 2147483648);
        let steps = 0;
        while (!game.isOver() && steps++ < 20000) {
            const seat = game.actors()[0];
            if (game.phase === 'pass') {
                const hand = [...game.players[seat].hand];
                const cards = [0, 1, 2].map(() => hand.splice(next() % hand.length, 1)[0]);
                expect(game.applyCommand(seat, { type: 'pass', cards })).toBe(true);
            } else {
                const legal = game.legalFor(seat);
                expect(legal.length).toBeGreaterThan(0);
                expect(game.applyCommand(seat, { type: 'play', card: legal[next() % legal.length] })).toBe(true);
            }
        }
        return game;
    };

    it('でたらめな試合が10シードとも100点まで進み、記録から同じ状態を再現できる', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = randomPlay(seed);
            expect(game.isOver()).toBe(true);
            expect(game.players.some(p => p.score >= 100)).toBe(true);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('記録には決まった項目だけを残す', () => {
        const game = makeGame();
        game.applyCommand(0, { type: 'pass', cards: game.players[0].hand.slice(0, 3), extra: 'x'.repeat(100) });
        expect(Object.keys(game.commands.at(-1).command)).toEqual(['type', 'cards']);
    });
});

describe('ビュー', () => {
    it('ほかの人の手札と渡す札は見せない。自分には手札・選んだ札・出せる札を見せる', () => {
        const game = makeGame(4);
        const mine = game.players[0].hand.slice(0, 3);
        game.applyCommand(0, { type: 'pass', cards: mine });
        game.applyCommand(1, { type: 'pass', cards: game.players[1].hand.slice(0, 3) });
        const view = createGameView(game, 2);
        expect(view.hand).toEqual(game.players[2].hand);
        expect(view.myPass).toBe(null);
        const text = JSON.stringify(view);
        game.players[1].hand.forEach(c => expect(text.includes(`"${c}"`)).toBe(false));
        expect(createGameView(game, 0).myPass).toEqual(sortCards(mine));
        expect(view.players[1].passed).toBe(true);
    });

    it('渡したあとは、自分が渡した札ともらった札だけを見せる', () => {
        const game = makeGame(6);
        passAll(game);
        const event = createGameView(game, 1).events.find(e => e.type === 'exchange');
        expect(event.received).toEqual(sortCards(game.events.find(e => e.type === 'exchange').received[1]));
        expect(event.sent).toHaveLength(3);
        expect(event.hands).toBe(undefined);
        const view = createGameView(game, game.turn);
        expect(view.legal).toEqual(['2C']);
    });
});
