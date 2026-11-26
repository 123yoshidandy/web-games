import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { GOLD } from '../public/js/cards.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（宝石の煌き デュエル）', () => {
    it('山から伏せて予約したカードは本人にだけ見える', () => {
        const game = definition.create({ players: [{ name: 'あお' }, { name: 'みどり' }], random: createRandom(2) });
        const seat = game.current;
        const gold = game.board.indexOf(GOLD);
        expect(game.applyCommand(seat, { type: 'reserve', level: 1, gold })).toBe(true);
        const own = definition.view(game, seat, {}).players[seat].reserved[0];
        const other = definition.view(game, 1 - seat, {}).players[seat].reserved[0];
        expect(own.id).not.toBe(null);
        expect(other.id ?? null).toBe(null);
    });
});
