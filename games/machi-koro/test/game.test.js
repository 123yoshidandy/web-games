import { describe, it, expect } from 'vitest';
import Game, { ESTABLISHMENTS, ESTABLISHMENT_ORDER } from '../public/js/game.js';
import { newGame, players, fixDice, setCity, coins, snapshot } from './helpers.js';

const roll = (game, dice = 1) => expect(game.applyCommand(game.current, { type: 'roll', dice })).toBe(true);

describe('準備', () => {
    it('各自が麦畑とパン屋を1つずつと3コインを持ち、市場に15種が並ぶ', () => {
        const game = newGame(4);
        game.players.forEach(p => {
            expect(p.coins).toBe(3);
            expect(p.cards).toEqual({ wheat: 1, bakery: 1 });
            expect(Object.values(p.landmarks).every(v => v === false)).toBe(true);
        });
        expect(ESTABLISHMENT_ORDER).toHaveLength(15);
        const purple = ESTABLISHMENT_ORDER.filter(k => ESTABLISHMENTS[k].color === 'purple');
        expect(purple).toEqual(['stadium', 'tv', 'business']);
        purple.forEach(k => expect(game.supply[k]).toBe(4));
        ESTABLISHMENT_ORDER.filter(k => !purple.includes(k)).forEach(k => expect(game.supply[k]).toBe(6));
        // 公式の構成：施設72枚・大施設12枚
        expect(Object.values(game.supply).reduce((s, v) => s + v, 0)).toBe(84);
    });

    it('同じシードなら、最初の人と目が同じ', () => {
        const a = new Game(players(3), { seed: 42 });
        const b = new Game(players(3), { seed: 42 });
        expect(a.current).toBe(b.current);
        a.applyCommand(a.current, { type: 'roll', dice: 1 });
        b.applyCommand(b.current, { type: 'roll', dice: 1 });
        expect(a.dice).toEqual(b.dice);
    });

    it('人数は2〜4人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(5))).toThrow();
    });
});

describe('振る', () => {
    it('駅がなければ2個は振れず、状態も変わらない', () => {
        const game = newGame();
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'roll', dice: 2 })).toBe(false);
        expect(game.applyCommand(0, { type: 'roll', dice: 3 })).toBe(false);
        expect(game.applyCommand(1, { type: 'roll', dice: 1 })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('駅があれば2個振れ、目は合計で見る', () => {
        const game = newGame();
        setCity(game, 0, { cards: { cheese: 1, ranch: 2 }, landmarks: ['station'], coins: 0 });
        fixDice(game, 3, 4);
        roll(game, 2);
        expect(game.dice).toEqual([3, 4]);
        expect(game.players[0].coins).toBe(6); // チーズ工場：牧場2つ × 3
    });

    it('電波塔があれば、同じ個数で1回だけ振り直せる', () => {
        const game = newGame();
        setCity(game, 0, { landmarks: ['station', 'tower'] });
        fixDice(game, 1, 2, 6, 6);
        roll(game, 2);
        expect(game.phase).toBe('reroll');
        expect(game.applyCommand(0, { type: 'reroll' })).toBe(true);
        expect(game.dice).toEqual([6, 6]);
        expect(game.rerolled).toBe(true);
        expect(game.phase).toBe('build');
    });

    it('電波塔があっても、そのままの目で進められる', () => {
        const game = newGame();
        setCity(game, 0, { landmarks: ['tower'] });
        fixDice(game, 1);
        roll(game);
        expect(game.applyCommand(0, { type: 'keep' })).toBe(true);
        expect(game.players[0].coins).toBe(4);
    });
});

describe('施設が働く', () => {
    it('青は誰の番でも、緑は自分の番だけ', () => {
        const game = newGame();
        setCity(game, 1, { cards: { wheat: 2, bakery: 1, ranch: 1 }, coins: 0 });
        fixDice(game, 1);
        roll(game);
        expect(game.players[1].coins).toBe(2); // 麦畑2つ
        game.applyCommand(0, { type: 'pass' });
        // 1 の番：パン屋（緑）は自分の番なので働く。0 の麦畑は働かない（目が2）
        fixDice(game, 2);
        roll(game);
        expect(game.players[1].coins).toBe(2 + 1 + 1); // 牧場とパン屋
        // 0 のパン屋は、1 の番なので働かない
        expect(game.players[0].coins).toBe(4);
    });

    it('赤は振った人から受け取り、払えない分は免除', () => {
        const game = newGame();
        setCity(game, 1, { cards: { cafe: 3 }, coins: 0 });
        setCity(game, 0, { coins: 2 });
        fixDice(game, 3);
        roll(game);
        expect(coins(game)).toEqual([0 + 1, 2]); // 2 だけ払い、そのあとパン屋で1
    });

    it('赤は緑より先（コイン0の人は払わずに済み、そのあとパン屋で受け取る）', () => {
        const game = newGame();
        setCity(game, 0, { cards: { bakery: 2 }, coins: 0 });
        setCity(game, 1, { cards: { cafe: 1 }, coins: 0 });
        fixDice(game, 3);
        roll(game);
        expect(coins(game)).toEqual([2, 0]);
    });

    it('複数の人に払うときは、振った人から反時計回り（ルールブックの例）', () => {
        const game = newGame(3);
        setCity(game, 0, { cards: {}, coins: 3 });
        setCity(game, 1, { cards: { cafe: 3 }, coins: 0 });
        setCity(game, 2, { cards: { cafe: 2 }, coins: 0 });
        fixDice(game, 3);
        roll(game);
        // 反時計回り：0 の次は 2、その次が 1
        expect(coins(game)).toEqual([0, 1, 2]);
        const pays = game.events.filter(e => e.type === 'pay').map(e => [e.to, e.amount, e.owed]);
        expect(pays).toEqual([[2, 2, 2], [1, 1, 3]]);
    });

    it('ショッピングモールは、パンとカップの印の施設を1つにつき+1', () => {
        const game = newGame();
        setCity(game, 0, { cards: { bakery: 2, wheat: 1 }, landmarks: ['mall'], coins: 0 });
        fixDice(game, 2);
        roll(game);
        expect(game.players[0].coins).toBe(4);
        game.applyCommand(0, { type: 'pass' });
        setCity(game, 0, { cards: { cafe: 1 } });
        setCity(game, 1, { coins: 5 });
        fixDice(game, 3);
        roll(game);
        expect(game.players[0].coins).toBe(4 + 2);
        game.applyCommand(1, { type: 'pass' });
        // 麦畑はそのまま
        setCity(game, 0, { cards: { wheat: 1 }, coins: 0 });
        fixDice(game, 1);
        roll(game);
        expect(game.players[0].coins).toBe(1);
    });

    it('工場と市場は、自分の印の施設の数だけ', () => {
        const game = newGame();
        setCity(game, 0, { cards: { furniture: 2, forest: 1, mine: 1, market: 1, wheat: 2, apple: 1 }, landmarks: ['station'], coins: 0 });
        fixDice(game, 4, 4);
        roll(game, 2);
        expect(game.players[0].coins).toBe(2 * 3 * 2);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(1, { type: 'roll', dice: 1 });
        game.applyCommand(1, { type: 'pass' });
        game.players[0].coins = 0;
        fixDice(game, 5, 6);
        roll(game, 2);
        expect(game.players[0].coins).toBe(2 * 3);
    });

    it('スタジアムは、ほかの全員から2コインずつ（足りなければあるだけ）', () => {
        const game = newGame(3);
        setCity(game, 0, { cards: { stadium: 1 }, coins: 0 });
        setCity(game, 1, { coins: 5 });
        setCity(game, 2, { coins: 1 });
        fixDice(game, 6);
        roll(game);
        expect(coins(game)).toEqual([3, 3, 0]);
    });

    it('テレビ局は、選んだ1人から5コイン。2人なら自動で相手から', () => {
        const game = newGame(3);
        setCity(game, 0, { cards: { tv: 1 }, coins: 0 });
        setCity(game, 1, { coins: 9 });
        setCity(game, 2, { coins: 3 });
        fixDice(game, 6);
        roll(game);
        expect(game.phase).toBe('tv');
        expect(game.applyCommand(0, { type: 'tv', target: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'tv', target: 2 })).toBe(true);
        expect(coins(game)).toEqual([3, 9, 0]);
        expect(game.phase).toBe('build');

        const two = newGame(2);
        setCity(two, 0, { cards: { tv: 1 }, coins: 0 });
        setCity(two, 1, { coins: 7 });
        fixDice(two, 6);
        roll(two);
        expect(two.phase).toBe('build');
        expect(coins(two)).toEqual([5, 2]);
    });

    it('ビジネスセンターは、紫以外の施設1つを交換できる（しなくてもよい）', () => {
        const game = newGame(2);
        setCity(game, 0, { cards: { business: 1, wheat: 1 } });
        setCity(game, 1, { cards: { mine: 1, stadium: 1 } });
        fixDice(game, 6);
        roll(game);
        expect(game.phase).toBe('trade');
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'trade', give: 'business', target: 1, take: 'mine' })).toBe(false);
        expect(game.applyCommand(0, { type: 'trade', give: 'wheat', target: 1, take: 'stadium' })).toBe(false);
        expect(game.applyCommand(0, { type: 'trade', give: 'wheat', target: 0, take: 'wheat' })).toBe(false);
        expect(game.applyCommand(0, { type: 'trade', give: 'apple', target: 1, take: 'mine' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { type: 'trade', give: 'wheat', target: 1, take: 'mine' })).toBe(true);
        expect(game.players[0].cards).toEqual({ business: 1, mine: 1 });
        expect(game.players[1].cards).toEqual({ stadium: 1, wheat: 1 });
        expect(game.phase).toBe('build');

        const skip = newGame(2);
        setCity(skip, 0, { cards: { business: 1, wheat: 1 } });
        fixDice(skip, 6);
        roll(skip);
        expect(skip.applyCommand(0, { type: 'skipTrade' })).toBe(true);
        expect(skip.phase).toBe('build');
    });

    it('紫を全部持っていたら、スタジアム → テレビ局 → ビジネスセンターの順', () => {
        const game = newGame(3);
        setCity(game, 0, { cards: { stadium: 1, tv: 1, business: 1, bakery: 1 }, coins: 0 });
        setCity(game, 1, { coins: 10 });
        setCity(game, 2, { coins: 10 });
        fixDice(game, 6);
        roll(game);
        expect(coins(game)).toEqual([4, 8, 8]);
        expect(game.phase).toBe('tv');
        game.applyCommand(0, { type: 'tv', target: 1 });
        expect(game.phase).toBe('trade');
        game.applyCommand(0, { type: 'skipTrade' });
        expect(game.phase).toBe('build');
        expect(coins(game)).toEqual([9, 3, 8]);
    });

    it('紫は振った人のものだけが働く', () => {
        const game = newGame(2);
        setCity(game, 1, { cards: { stadium: 1, tv: 1 }, coins: 0 });
        fixDice(game, 6);
        roll(game);
        expect(game.phase).toBe('build');
        expect(game.players[1].coins).toBe(0);
    });
});

describe('建てる', () => {
    it('施設を1つ建てると市場から減り、番が移る', () => {
        const game = newGame();
        fixDice(game, 5);
        roll(game);
        expect(game.applyCommand(0, { type: 'build', card: 'cafe' })).toBe(true);
        expect(game.players[0].cards.cafe).toBe(1);
        expect(game.players[0].coins).toBe(1);
        expect(game.supply.cafe).toBe(5);
        expect(game.current).toBe(1);
        expect(game.phase).toBe('roll');
    });

    it('コインが足りない・売り切れ・同じ紫の2つ目は断り、状態を変えない', () => {
        const game = newGame();
        setCity(game, 0, { cards: { tv: 1 }, coins: 20 });
        game.supply.mine = 0;
        fixDice(game, 5);
        roll(game);
        const before = snapshot(game);
        ['mine', 'tv', 'nothing', 'tower'].forEach(card => expect(game.applyCommand(0, { type: 'build', card })).toBe(false));
        expect(game.applyCommand(0, { type: 'build', card: 'toString' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { type: 'build', card: 'stadium' })).toBe(true);
    });

    it('ランドマークは好きな順に完成させられ、4つ目で勝つ', () => {
        const game = newGame();
        setCity(game, 0, { landmarks: ['mall', 'park', 'tower'], coins: 4 });
        fixDice(game, 5);
        roll(game);
        expect(game.applyCommand(0, { type: 'keep' })).toBe(true); // 電波塔があるので、振り直すかを先に決める
        game.players[0].coins = 4;
        expect(game.applyCommand(0, { type: 'build', card: 'station' })).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(0);
        expect(game.actors()).toEqual([]);
        expect(game.applyCommand(1, { type: 'roll', dice: 1 })).toBe(false);
    });

    it('遊園地があって2個でゾロ目なら、もう1回自分の番', () => {
        const game = newGame();
        setCity(game, 0, { landmarks: ['station', 'park'] });
        fixDice(game, 4, 4);
        roll(game, 2);
        game.applyCommand(0, { type: 'pass' });
        expect(game.current).toBe(0);
        fixDice(game, 4, 5);
        roll(game, 2);
        game.applyCommand(0, { type: 'pass' });
        expect(game.current).toBe(1);
    });

    it('ゾロ目を出した番に遊園地を完成させても、もう1回はない', () => {
        const game = newGame();
        setCity(game, 0, { landmarks: ['station'], coins: 16 });
        fixDice(game, 3, 3);
        roll(game, 2);
        game.applyCommand(0, { type: 'build', card: 'park' });
        expect(game.current).toBe(1);
    });

    it('建てずに終えられる', () => {
        const game = newGame();
        roll(game);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(true);
        expect(game.current).toBe(1);
    });
});

describe('断る操作', () => {
    it('知らない種類・番でない人・形の違う操作は、状態を変えない', () => {
        const game = newGame(3);
        const before = snapshot(game);
        [null, 'roll', {}, { type: 'proxy' }, { type: 'build', card: 'wheat' }, { type: 'reroll' }, { type: 'tv', target: 1 }].forEach(command => {
            expect(game.applyCommand(0, command)).toBe(false);
        });
        expect(game.applyCommand(1, { type: 'roll', dice: 1 })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録には決まった項目だけを残す', () => {
        const game = newGame();
        game.applyCommand(0, { type: 'roll', dice: 1, extra: 'x' });
        expect(game.commands[0]).toEqual({ playerId: 0, command: { type: 'roll', dice: 1 } });
    });
});
