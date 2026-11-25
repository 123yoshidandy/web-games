import { describe, it, expect } from 'vitest';
import Game, { ROLE_ORDER } from '../public/js/game.js';
import { newGame, players, setHand, totalCards, act, allowAll, snapshot } from './helpers.js';

describe('準備', () => {
    it('5種×3枚。各自2枚と2コイン、残りは山', () => {
        for (const n of [3, 4, 5, 6]) {
            const game = newGame(n);
            game.players.forEach(p => {
                expect(p.hand).toHaveLength(2);
                expect(p.coins).toBe(2);
            });
            expect(game.deck).toHaveLength(15 - 2 * n);
            const all = [...game.deck, ...game.players.flatMap(p => p.hand)];
            ROLE_ORDER.forEach(r => expect(all.filter(x => x === r)).toHaveLength(3));
        }
    });

    it('2人のときは、最初の人だけ1コイン', () => {
        const game = new Game(players(2), { seed: 3, startPlayer: 1 });
        expect(game.players.map(p => p.coins)).toEqual([2, 1]);
    });

    it('人数は2〜6人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(7))).toThrow();
    });
});

describe('名乗らない行動', () => {
    it('収入は1コイン。だれも止められない', () => {
        const game = newGame();
        expect(act(game, 'income')).toBe(true);
        expect(game.players[0].coins).toBe(3);
        expect(game.current).toBe(1);
    });

    it('援助は、本人以外の全員に公爵でブロックするかを聞く', () => {
        const game = newGame(4);
        act(game, 'foreignAid');
        expect(game.phase).toBe('block');
        expect(game.waiting).toEqual([1, 2, 3]);
        allowAll(game);
        expect(game.players[0].coins).toBe(4);
    });

    it('クーは7コインで、防げない', () => {
        const game = newGame();
        game.players[0].coins = 8;
        act(game, 'coup', 2);
        expect(game.phase).toBe('lose');
        expect(game.loser).toBe(2);
        game.applyCommand(2, { type: 'lose', role: game.players[2].hand[1] });
        expect(game.players[2].hand).toHaveLength(1);
        expect(game.players[0].coins).toBe(1);
        expect(game.current).toBe(1);
    });

    it('10コイン以上で始めたら、クーしかできない', () => {
        const game = newGame();
        game.players[0].coins = 10;
        const before = snapshot(game);
        expect(act(game, 'income')).toBe(false);
        expect(act(game, 'tax')).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(act(game, 'coup', 1)).toBe(true);
    });

    it('コインが足りない行動・自分や脱落した人を選ぶ行動は断る', () => {
        const game = newGame();
        const before = snapshot(game);
        expect(act(game, 'coup', 1)).toBe(false);
        expect(act(game, 'assassinate', 1)).toBe(false);
        expect(act(game, 'steal', 0)).toBe(false);
        expect(act(game, 'steal', 9)).toBe(false);
        expect(act(game, 'tax', 1)).toBe(false);
        expect(act(game, 'nothing')).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('役割の行動', () => {
    it('税：だれもチャレンジしなければ3コイン', () => {
        const game = newGame();
        act(game, 'tax');
        expect(game.phase).toBe('challengeAction');
        expect(game.waiting).toEqual([1, 2]);
        allowAll(game);
        expect(game.players[0].coins).toBe(5);
    });

    it('強奪：対象だけにブロックを聞き、通れば2コイン（1コインなら1）', () => {
        const game = newGame(4);
        game.players[2].coins = 1;
        act(game, 'steal', 2);
        allowAll(game);
        expect(game.phase).toBe('block');
        expect(game.waiting).toEqual([2]);
        allowAll(game);
        expect(game.players.map(p => p.coins)).toEqual([3, 2, 0, 2]);
    });

    it('暗殺：3コインを払い、通れば対象が失う', () => {
        const game = newGame();
        game.players[0].coins = 3;
        act(game, 'assassinate', 1);
        expect(game.players[0].coins).toBe(0);
        allowAll(game);
        expect(game.waiting).toEqual([1]);
        allowAll(game);
        expect(game.phase).toBe('lose');
        expect(game.loser).toBe(1);
    });

    it('交換：2枚引いて、手札と同じ枚数を残す', () => {
        const game = newGame();
        setHand(game, 0, ['duke', 'captain']);
        act(game, 'exchange');
        allowAll(game);
        expect(game.phase).toBe('exchange');
        expect(game.drawn).toHaveLength(2);
        const deckBefore = game.deck.length;
        const pool = [...game.players[0].hand, ...game.drawn];
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'exchange', keep: [pool[0]] })).toBe(false);
        expect(game.applyCommand(0, { type: 'exchange', keep: ['x', 'y'] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { type: 'exchange', keep: [pool[2], pool[3]] })).toBe(true);
        expect(game.players[0].hand).toEqual([pool[2], pool[3]]);
        expect(game.deck.length).toBe(deckBefore + 2);
        expect(totalCards(game)).toBe(15);
    });

    it('交換：1枚なら、3枚から1枚を残す', () => {
        const game = newGame();
        setHand(game, 0, ['duke']);
        act(game, 'exchange');
        allowAll(game);
        expect(game.applyCommand(0, { type: 'exchange', keep: [game.drawn[0], game.drawn[1]] })).toBe(false);
        expect(game.applyCommand(0, { type: 'exchange', keep: [game.drawn[1]] })).toBe(true);
        expect(game.players[0].hand).toHaveLength(1);
    });
});

describe('チャレンジ', () => {
    it('嘘なら名乗った人が失い、行動は失敗し、払ったコインは戻る', () => {
        const game = newGame();
        setHand(game, 0, ['duke', 'captain']);
        game.players[0].coins = 3;
        act(game, 'assassinate', 1);
        expect(game.applyCommand(2, { type: 'challenge' })).toBe(true);
        expect(game.phase).toBe('lose');
        expect(game.loser).toBe(0);
        game.applyCommand(0, { type: 'lose', role: 'captain' });
        expect(game.players[0].coins).toBe(3);
        expect(game.players[1].hand).toHaveLength(2);
        expect(game.current).toBe(1);
        expect(game.claims[0].at(-1).result).toBe('caught');
    });

    it('本当ならチャレンジした人が失い、見せた札は山に戻して引き直し、行動は続く', () => {
        const game = newGame();
        setHand(game, 0, ['duke', 'captain']);
        setHand(game, 2, ['contessa', 'ambassador']);
        act(game, 'tax');
        game.applyCommand(1, { type: 'challenge' });
        expect(game.waiting).toEqual([]);
        expect(game.loser).toBe(1);
        game.applyCommand(1, { type: 'lose', role: game.players[1].hand[0] });
        expect(game.players[0].coins).toBe(5);
        expect(game.players[0].hand).toHaveLength(2);
        expect(game.players[0].hand).toContain('captain');
        expect(totalCards(game)).toBe(15);
        expect(game.claims[0].at(-1).result).toBe('proven');
    });

    it('ブロックへのチャレンジ：嘘のブロックなら、ブロックした人が失い、行動が通る', () => {
        const game = newGame();
        setHand(game, 1, ['duke', 'captain']);
        act(game, 'foreignAid');
        game.applyCommand(2, { type: 'block', role: 'duke' });
        expect(game.phase).toBe('challengeBlock');
        expect(game.waiting).toEqual([0, 1]);
        setHand(game, 2, ['assassin', 'captain']);
        game.applyCommand(0, { type: 'challenge' });
        game.applyCommand(2, { type: 'lose', role: 'assassin' });
        expect(game.players[0].coins).toBe(4);
    });

    it('ブロックへのチャレンジ：本当のブロックなら、チャレンジした人が失い、行動は止まる', () => {
        const game = newGame();
        setHand(game, 1, ['captain', 'duke']);
        act(game, 'steal', 1);
        allowAll(game);
        game.applyCommand(1, { type: 'block', role: 'captain' });
        game.applyCommand(0, { type: 'challenge' });
        game.applyCommand(0, { type: 'lose', role: game.players[0].hand[0] });
        expect(game.players.map(p => p.coins)).toEqual([2, 2, 2]);
        expect(game.current).toBe(1);
    });

    it('ブロックしたら、ブロックした人以外の全員にチャレンジを聞き、全員が通せば止まる', () => {
        const game = newGame(4);
        game.players[0].coins = 3;
        act(game, 'assassinate', 2);
        allowAll(game);
        game.applyCommand(2, { type: 'block', role: 'contessa' });
        expect(game.waiting).toEqual([0, 1, 3]);
        allowAll(game);
        expect(game.players[0].coins).toBe(0); // ブロックされても払ったコインは戻らない
        expect(game.players[2].hand).toHaveLength(2);
        expect(game.current).toBe(1);
    });

    it('ブロックできない役割では断る', () => {
        const game = newGame();
        act(game, 'steal', 1);
        allowAll(game);
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'block', role: 'contessa' })).toBe(false);
        expect(game.applyCommand(1, { type: 'block', role: 'duke' })).toBe(false);
        expect(game.applyCommand(2, { type: 'block', role: 'captain' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(1, { type: 'block', role: 'ambassador' })).toBe(true);
    });
});

describe('暗殺で2枚失う', () => {
    it('暗殺者へのチャレンジに負けると、チャレンジの分と暗殺の分で2枚失う', () => {
        const game = newGame();
        setHand(game, 0, ['assassin', 'duke']);
        game.players[0].coins = 3;
        act(game, 'assassinate', 1);
        game.applyCommand(1, { type: 'challenge' });
        game.applyCommand(1, { type: 'lose', role: game.players[1].hand[0] });
        // 1枚になったが、ブロックの機会はある
        expect(game.phase).toBe('block');
        allowAll(game);
        expect(game.players[1].hand).toHaveLength(0);
        expect(game.players[1].lost).toHaveLength(2);
    });

    it('伯爵夫人のはったりがばれると、ブロックの分と暗殺の分で2枚失う', () => {
        const game = newGame();
        setHand(game, 1, ['duke', 'captain']);
        game.players[0].coins = 3;
        act(game, 'assassinate', 1);
        allowAll(game);
        game.applyCommand(1, { type: 'block', role: 'contessa' });
        game.applyCommand(0, { type: 'challenge' });
        game.applyCommand(1, { type: 'lose', role: 'duke' });
        expect(game.players[1].hand).toHaveLength(0);
        expect(game.players[1].lost).toEqual(['duke', 'captain']);
    });

    it('チャレンジで最後の札を失った対象には、暗殺は何も起きない', () => {
        const game = newGame();
        setHand(game, 0, ['assassin', 'duke']);
        setHand(game, 1, ['captain']);
        game.players[0].coins = 3;
        act(game, 'assassinate', 1);
        game.applyCommand(1, { type: 'challenge' });
        expect(game.players[1].hand).toHaveLength(0);
        expect(game.phase).toBe('action');
        expect(game.current).toBe(2); // 脱落した人は飛ばす
    });
});

describe('答えを聞く相手は手札で変わらない', () => {
    it('どんな手札でも、同じ場面では同じ人に聞く', () => {
        const waitingFor = (hands) => {
            const game = newGame(4, 9);
            hands.forEach((h, seat) => setHand(game, seat, h));
            game.players[0].coins = 3;
            const seen = [];
            act(game, 'assassinate', 2);
            seen.push([game.phase, ...game.waiting]);
            allowAll(game);
            seen.push([game.phase, ...game.waiting]);
            game.applyCommand(2, { type: 'allow' });
            seen.push([game.phase, ...game.actors()]);
            game.applyCommand(2, { type: 'lose', role: game.players[2].hand[0] });
            act(game, 'foreignAid');
            seen.push([game.phase, ...game.waiting]);
            return JSON.stringify(seen);
        };
        const a = waitingFor([['assassin', 'duke'], ['contessa', 'contessa'], ['captain', 'captain'], ['duke', 'duke']]);
        const b = waitingFor([['ambassador', 'ambassador'], ['captain', 'assassin'], ['contessa', 'duke'], ['assassin', 'ambassador']]);
        expect(a).toBe(b);
    });
});

describe('影響力を失う・終わり', () => {
    it('2枚なら本人が選び、持っていない札は断る', () => {
        const game = newGame();
        setHand(game, 2, ['duke', 'captain']);
        game.players[0].coins = 7;
        act(game, 'coup', 2);
        const before = snapshot(game);
        expect(game.applyCommand(2, { type: 'lose', role: 'contessa' })).toBe(false);
        expect(game.applyCommand(1, { type: 'lose', role: 'duke' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(2, { type: 'lose', role: 'captain' })).toBe(true);
        expect(game.players[2].lost).toEqual(['captain']);
    });

    it('最後の1人が勝ち', () => {
        const game = newGame(2);
        setHand(game, 1, ['duke']);
        game.players[0].coins = 7;
        act(game, 'coup', 1);
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(0);
        expect(game.actors()).toEqual([]);
    });

    it('記録には決まった項目だけを残す', () => {
        const game = newGame();
        act(game, 'income', undefined);
        game.applyCommand(1, { type: 'action', action: 'income', extra: 1 });
        expect(game.commands[1]).toEqual({ playerId: 1, command: { type: 'action', action: 'income' } });
    });

    it('番でない人と、知らない種類の操作は断る', () => {
        const game = newGame();
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'action', action: 'income' })).toBe(false);
        [null, 'x', { type: 'challenge' }, { type: 'allow' }, { type: 'proxy' }].forEach(c => expect(game.applyCommand(0, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});
