import { describe, it, expect } from 'vitest';
import { makeGame, snapshot } from './helpers.js';
import { suggest } from '../public/js/cpu-player.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = makeGame(3, { seed, level: 'novice' });
        let steps = 0;
        while (!game.isOver() && steps++ < 3000) {
            const seat = game.actors()[0];
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(command).toBeTruthy();
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('手番でない人には出さない', () => {
        const game = makeGame(3, { seed: 7 });
        expect(suggest(game, 1)).toBe(null);
        expect(suggest(game, 0)).toBeTruthy();
    });

    it('4枚そろって神殿にいれば、宝を手に入れるのをすすめる', () => {
        const game = makeGame(2, { seed: 2 });
        const embers = 10; // 残り火の洞窟（炎の水晶の神殿）
        game.players[0].tile = embers;
        game.players[0].hand = ['fire', 'fire', 'fire', 'fire'];
        game.tiles[embers] = 0;
        expect(suggest(game, 0)).toEqual({ type: 'capture' });
    });
});
