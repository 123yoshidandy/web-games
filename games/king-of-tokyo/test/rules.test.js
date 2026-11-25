import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { CARDS } from '../public/js/cards.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { gameAt, resolveWith, answerAll, snapshot, players } from './helpers.js';

const C = (...xs) => xs;

describe('カード', () => {
    it('基本の 66 枚：持ち続けるカード 48 枚、使い捨て 18 枚', () => {
        expect(CARDS).toHaveLength(66);
        expect(CARDS.filter(c => c.kind === 'keep')).toHaveLength(48);
        expect(CARDS.filter(c => c.kind === 'discard')).toHaveLength(18);
    });

    it('はじめは場に 3 枚、山札 63 枚。全員が体力 10・勝利点 0・エネルギー 0', () => {
        const game = new Game(players(4), { seed: 2 });
        expect(game.market).toHaveLength(3);
        expect(game.deck).toHaveLength(63);
        game.players.forEach(p => expect([p.health, p.vp, p.energy]).toEqual([10, 0, 0]));
        expect(game.dice).toHaveLength(6);
    });
});

describe('ダイス', () => {
    it('同じ数字 3 つでその数の勝利点、4 つめからは 1 つにつき 1 点', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; } });
        resolveWith(game, C('2', '2', '2', '2', '1', '1'));
        expect(game.players[0].vp).toBe(3);
    });

    it('エネルギーの目 1 つにつき 1 エネルギー', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; } });
        resolveWith(game, C('energy', 'energy', 'energy', '1', '2', '3'));
        expect(game.players[0].energy).toBe(3);
    });

    it('ハートで回復（上限 10）。東京にいる間は回復できない', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; g.players[0].health = 8; } });
        resolveWith(game, C('heart', 'heart', 'heart', '1', '2', '3'));
        expect(game.players[0].health).toBe(10);
        const inTokyo = gameAt(3, 0, { setup: g => { g.tokyo.city = 0; g.players[0].health = 5; } });
        resolveWith(inTokyo, C('heart', 'heart', '1', '2', '3', '3'));
        expect(inTokyo.players[0].health).toBe(5);
    });

    it('振り直しは 2 回まで。振り直したダイスだけが変わる', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; } });
        const before = [...game.dice];
        expect(game.applyCommand(0, { type: 'reroll', dice: [0] })).toBe(true);
        expect(game.dice.slice(1)).toEqual(before.slice(1));
        expect(game.applyCommand(0, { type: 'reroll', dice: [0, 1] })).toBe(true);
        const snap = snapshot(game);
        expect(game.applyCommand(0, { type: 'reroll', dice: [0] })).toBe(false);
        expect(snapshot(game)).toBe(snap);
    });
});

describe('攻撃と東京', () => {
    it('東京の外からの攻撃は、東京のモンスターに当たる。明け渡せば攻撃した人が東京に入る（+1 勝利点）', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; } });
        resolveWith(game, C('claw', 'claw', '1', '2', '3', 'energy'));
        expect(game.decision).toMatchObject({ seat: 1, kind: 'yield' });
        game.applyCommand(1, { type: 'yield', yes: true });
        answerAll(game);
        expect(game.players[1].health).toBe(8);
        expect(game.players[2].health).toBe(10);
        expect(game.tokyo.city).toBe(0);
        expect(game.players[0].vp).toBe(1);
    });

    it('明け渡さなければ、攻撃した人は東京に入らない', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; } });
        resolveWith(game, C('claw', '1', '2', '3', 'energy', 'energy'));
        game.applyCommand(1, { type: 'yield', yes: false });
        answerAll(game);
        expect(game.tokyo.city).toBe(1);
        expect(game.players[1].health).toBe(9);
    });

    it('東京からの攻撃は、東京の外の全員に当たる', () => {
        const game = gameAt(4, 0, { setup: g => { g.tokyo.city = 0; } });
        resolveWith(game, C('claw', 'claw', 'claw', '1', '2', '3'));
        answerAll(game);
        expect(game.players.slice(1).map(p => p.health)).toEqual([7, 7, 7]);
    });

    it('東京が空いていれば、攻撃しなくても入る。番の初めに東京にいれば 2 勝利点', () => {
        const game = gameAt(3, 0);
        resolveWith(game, C('1', '2', '3', '1', '2', 'energy'));
        answerAll(game);
        expect(game.tokyo.city).toBe(0);
        expect(game.players[0].vp).toBe(1);
        // 次の 0 の番の初め
        const later = gameAt(3, 0, { setup: g => { g.tokyo.city = 0; } });
        expect(later.players[0].vp).toBe(2);
    });

    it('5 人以上では東京湾も使う。生き残りが 4 体になったら、東京湾は使わない', () => {
        const game = gameAt(5, 0, { setup: g => { g.tokyo.city = 1; } });
        resolveWith(game, C('1', '2', '3', '1', '2', 'energy'));
        answerAll(game);
        expect(game.tokyo.bay).toBe(0);
        const g2 = gameAt(5, 2, { setup: g => { g.tokyo.city = 1; g.tokyo.bay = 0; g.players[3].health = 1; } });
        // 2 は東京の外：東京の 2 体に当たる。3 は当たらない。代わりに火炎放射器で 3 を倒す
        g2.players[2].energy = 3;
        g2.market[0] = 'flameThrower';
        resolveWith(g2, C('1', '2', '3', '1', '2', 'energy'));
        answerAll(g2, { buy: (d, g) => (g.market.includes('flameThrower') ? { type: 'buy', card: 'flameThrower' } : { type: 'endBuy' }) });
        expect(g2.players[3].alive).toBe(false);
        expect(g2.bayInUse()).toBe(false);
        expect(g2.tokyo.bay).toBeNull();
    });
});

describe('勝ち負け', () => {
    it('20 勝利点で勝ち', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; g.players[0].vp = 17; } });
        resolveWith(game, C('3', '3', '3', '1', '2', 'energy'));
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(0);
    });

    it('最後の 1 体になったら勝ち', () => {
        const game = gameAt(2, 0, { setup: g => { g.tokyo.city = 1; g.players[1].health = 2; } });
        resolveWith(game, C('claw', 'claw', '1', '2', '3', 'energy'));
        answerAll(game);
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(0);
    });
});

describe('カードを買う', () => {
    it('エネルギーで場のカードを買い、新しいカードが出る。2 エネルギーで場を流せる', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; g.players[0].energy = 10; g.market[0] = 'cornerStore'; } });
        resolveWith(game, C('1', '2', '3', '1', '2', 'heart'));
        expect(game.decision.kind).toBe('buy');
        game.applyCommand(0, { type: 'buy', card: 'cornerStore' });
        expect(game.players[0].vp).toBe(1);
        expect(game.players[0].energy).toBe(7);
        expect(game.market).toHaveLength(3);
        const before = [...game.market];
        game.applyCommand(0, { type: 'sweep' });
        expect(game.players[0].energy).toBe(5);
        expect(game.market.some(id => before.includes(id))).toBe(false);
    });

    it('エネルギーが足りないカードは買えず、状態を変えない', () => {
        const game = gameAt(3, 0, { setup: g => { g.tokyo.city = 1; g.market[0] = 'energize'; } });
        resolveWith(game, C('1', '2', '3', '1', '2', 'heart'));
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'buy', card: 'energize' })).toBe(false);
        expect(game.applyCommand(0, { type: 'sweep' })).toBe(false);
        expect(game.applyCommand(1, { type: 'endBuy' })).toBe(false);
        expect(game.applyCommand(0, { type: 'reroll', dice: [0] })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('通しの試合', () => {
    function playRandom(n, seed) {
        const game = new Game(players(n), { seed });
        const random = createRandom(seed * 11 + 7);
        const pick = list => list[Math.floor(random() * list.length)];
        let steps = 0;
        while (!game.isOver()) {
            const d = game.decision;
            const view = createGameView(game, d.seat);
            let command;
            if (d.kind === 'roll') {
                command = view.options.canReroll && random() < 0.6 ? { type: 'reroll', dice: game.dice.map((_, i) => i).filter(() => random() < 0.5) } : { type: 'resolve' };
                if (command.type === 'reroll' && command.dice.length === 0) command = { type: 'resolve' };
            } else if (d.kind === 'buy') {
                const buyable = game.market.filter(id => view.options.costs[id] <= game.players[d.seat].energy);
                command = buyable.length && random() < 0.7 ? { type: 'buy', card: pick(buyable) } : { type: 'endBuy' };
            } else if (d.kind === 'yield') command = { type: 'yield', yes: random() < 0.5 };
            else if (d.kind === 'wings') command = { type: 'wings', yes: random() < 0.5 };
            else if (d.kind === 'mimic') command = { type: 'mimic', target: d.targets.length && random() < 0.7 ? pick(d.targets) : null };
            else if (d.kind === 'opportunist') command = { type: 'opportunist', card: random() < 0.5 ? pick(d.cards) : null };
            else if (d.kind === 'psychicProbe') command = { type: 'probe', index: game.dice.length && random() < 0.5 ? Math.floor(random() * game.dice.length) : null };
            else if (d.kind === 'healingRay') command = { type: 'healingRay', give: {} };
            else if (d.kind === 'metamorph') command = { type: 'metamorph', cards: [] };
            expect(game.applyCommand(d.seat, command), `${d.kind} ${JSON.stringify(command)} ${game.lastError}`).toBe(true);
            if (++steps > 5000) throw new Error('終わらない');
        }
        return game;
    }

    it('でたらめな手でも 2〜6 人で最後まで進み、記録から同じ結果を再現できる', () => {
        for (let n = 2; n <= 6; n++) {
            for (let seed = 1; seed <= 8; seed++) {
                const game = playRandom(n, seed * 17 + n);
                expect(game.winner === null || game.players[game.winner].alive).toBe(true);
                const again = Game.replay(players(n), game.options, game.commands);
                expect(snapshot(again)).toBe(snapshot(game));
            }
        }
    });
});
