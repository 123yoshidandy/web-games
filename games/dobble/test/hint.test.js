import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { suggest } from '../public/js/cpu-player.js';
import { CARDS } from '../public/js/deck.js';

describe('ヒント', () => {
    it('おすすめはいつも共通のマーク。人がおすすめだけを取っても最後まで進む', () => {
        let now = 0;
        const c = new LocalGameController({ mode: 'cpu', players: [{ name: 'あなた' }, { name: 'C1', isCPU: true }], level: 'easy', seed: 11 },
            {}, { clock: () => now, autoStart: false });
        let steps = 0;
        while (!c.game.isOver && steps++ < 300) {
            now += 900;
            c.tick();
            if (c.game.isOver) break;
            const move = suggest(c.game, c.humanSeat);
            expect(CARDS[move.center]).toContain(move.symbol);
            expect(CARDS[c.game.players[0].top]).toContain(move.symbol);
            const before = c.game.commands.length;
            expect(c.send(move)).toBe(true);
            expect(c.game.commands.length).toBeGreaterThan(before);
        }
        expect(c.game.isOver).toBe(true);
        expect(suggest(c.game, 0)).toBe(null);
    });

    it('ヒントのボタンは共通のマークを出す。同じカードで押し直しても記録は1回', () => {
        let now = 0;
        const c = new LocalGameController({ mode: 'solo', players: [{ name: 'あなた' }], seed: 2 }, {}, { clock: () => now, autoStart: false });
        now = 3000;
        const symbol = c.hint();
        expect(symbol).toBe(suggest(c.game, 0).symbol);
        expect(c.hint()).toBe(symbol);
        expect(c.game.commands).toEqual([{ seat: 0, type: 'hint', t: 3000 }]);
        expect(c.getView().hintSymbol).toBe(symbol);
    });
});
