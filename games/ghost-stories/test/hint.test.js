import { describe, it, expect } from 'vitest';
import { makeGame, yangOf, put, snapshot } from './helpers.js';
import { suggest } from '../public/js/cpu-player.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = makeGame({ seed });
        let steps = 0;
        while (!game.isOver() && steps++ < 4000) {
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
        const game = makeGame({ seed: 7 });
        const other = [0, 1, 2, 3].find(s => !game.actors().includes(s));
        expect(suggest(game, other)).toBe(null);
    });

    it('呪われる寸前の憑き手がいれば、その幽霊を祓いに行く', () => {
        const game = yangOf(makeGame({ seed: 2 }), 1);
        game.tiles[0].haunted = true;
        game.tiles[2].haunted = true;
        put(game, 1, '火吹き童子', 7); // 憑き手がタイル7の上
        game.players[1].tile = 4;
        const first = suggest(game, 1);
        expect(first).toEqual({ type: 'move', to: 7 });
    });
});
