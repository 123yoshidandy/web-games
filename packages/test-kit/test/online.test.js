import { describe, it, expect } from 'vitest';
import { randomKeysIn } from '../online.js';

describe('randomKeysIn（ビューのシード・乱数の状態）', () => {
    it('入れ子の中のシードと乱数の状態を、場所付きで見つける', () => {
        const view = { options: { seed: 5, sides: 'A' }, state: { rng: [1, 2] }, players: [{ deckSeed: 3 }, { name: 'x' }], round: { shuffleRng: {} } };
        expect(randomKeysIn(view)).toEqual(['view.options.seed', 'view.state.rng', 'view.players[0].deckSeed', 'view.round.shuffleRng']);
    });

    it('似ているだけの名前は拾わない', () => {
        expect(randomKeysIn({ seats: [1], seen: true, seedling: 1, ring: 2, range: 3, strong: 4 })).toEqual([]);
    });
});
