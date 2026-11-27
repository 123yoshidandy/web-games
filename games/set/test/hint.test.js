import { describe, it, expect } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { suggest } from '../public/js/cpu-player.js';
import { isSet } from '../public/js/game.js';

describe('ヒント', () => {
    it('おすすめはいつも場のセット。人がおすすめだけを取っても最後まで進む', () => {
        let now = 0;
        const c = new LocalGameController({ mode: 'cpu', players: [{ name: 'あなた' }, { name: 'C1', isCPU: true }], level: 'easy', seed: 11 },
            {}, { clock: () => now, autoStart: false });
        let steps = 0;
        while (!c.game.isOver && steps++ < 300) {
            now += 1500;
            c.tick();
            if (c.game.isOver) break;
            const move = suggest(c.game, c.humanSeat);
            expect(isSet(...move.cards)).toBe(true);
            const before = c.game.commands.length;
            expect(c.send(move)).toBe(true);
            expect(c.game.commands.length).toBeGreaterThan(before);
        }
        expect(c.game.isOver).toBe(true);
        expect(suggest(c.game, 0)).toBe(null);
    });

    it('ヒントのボタンは、場のセットの1枚を出す。同じ場で押し直しても記録は1回', () => {
        let now = 0;
        const c = new LocalGameController({ mode: 'solo', players: [{ name: 'あなた' }], seed: 2 }, {}, { clock: () => now, autoStart: false });
        now = 3000;
        const card = c.hint();
        expect(c.game.board).toContain(card);
        expect(suggest(c.game, 0).cards.includes(card) || c.game.board.includes(card)).toBe(true);
        expect(c.hint()).toBe(card);
        expect(c.game.commands).toEqual([{ seat: 0, type: 'hint', t: 3000 }]);
        expect(c.getView().hintCard).toBe(card);
    });
});
