import { describe, it, expect } from 'vitest';
import { randomKeysIn } from '../online.js';

describe('randomKeysIn（ビューのシード・乱数の状態）', () => {
    it('入れ子の中のシードと乱数の状態を、場所付きで見つける', () => {
        const view = { options: { seed: 2734198812, sides: 'A' }, state: { rng: [1, 2] }, players: [{ deckSeed: 123456789 }, { name: 'x' }], round: { shuffleRng: {} } };
        expect(randomKeysIn(view)).toEqual(['view.options.seed', 'view.state.rng', 'view.players[0].deckSeed', 'view.round.shuffleRng']);
    });

    it('seed という名前でも、小さな数（ゲームの中の数）は拾わない', () => {
        // Wingspan の食べ物の種類 seed（持っている数）
        expect(randomKeysIn({ players: [{ food: { seed: 2, fish: 1 } }], rng: null })).toEqual([]);
        expect(randomKeysIn({ options: { seed: 65536 } })).toEqual(['view.options.seed']);
    });

    it('似ているだけの名前は拾わない', () => {
        expect(randomKeysIn({ seats: [1], seen: true, seedling: 1, ring: 2, range: 3, strong: 4 })).toEqual([]);
    });
});
