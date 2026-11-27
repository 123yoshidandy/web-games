import { describe, it, expect, beforeEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';
import { suggest } from '../public/js/cpu-player.js';
import { versus, setPiles, card } from './helpers.js';

beforeEach(() => {
    const data = new Map();
    globalThis.localStorage = {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key)
    };
});

describe('ヒント', () => {
    it('5つならベル、自分の番ならめくる、どちらでもなければ出さない', () => {
        const game = versus(1);
        expect(suggest(game, 0)).toEqual({ type: 'flip' });
        expect(suggest(game, 1)).toBe(null);
        setPiles(game, [[card(3, 2)], [card(3, 3)], []]);
        expect(suggest(game, 1)).toEqual({ type: 'ring', version: game.tableVersion });
        game.players[1].out = true;
        expect(suggest(game, 1)).toBe(null);
    });

    it('おすすめのベルはいつも当たり。人がおすすめだけを打っても最後まで進む', () => {
        let now = 0;
        const c = new LocalGameController({ mode: 'practice', players: [{ name: 'あなた' }, { name: 'C1', isCPU: true }], level: 'easy', speed: 'fast', timeLimit: 'short', seed: 11 },
            {}, { clock: () => now, autoStart: false });
        let steps = 0;
        while (!c.game.isOver && steps++ < 5000) {
            now += 120;
            c.tick();
            if (c.game.isOver) break;
            const move = c.hint();
            if (!move) continue;
            const before = c.game.players[0].bells;
            expect(c.send(move)).toBe(true);
            if (move.type === 'ring') expect(c.game.players[0].bells).toBe(before + 1);
        }
        expect(c.game.isOver).toBe(true);
        expect(c.game.players[0].misses).toBe(0);
        expect(c.hint()).toBe(null);
    });
});
