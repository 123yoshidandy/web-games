import { describe, it, expect } from 'vitest';
import { randomKeysIn } from '../online.js';

describe('randomKeysIn（ビューのシード・乱数の状態）', () => {
    it('入れ子の中のシードと乱数の状態を、場所付きで見つける', () => {
        const view = { options: { seed: 2734198812, sides: 'A' }, state: { rng: [1, 2] }, players: [{ deckSeed: 123456789 }, { name: 'x' }], round: { shuffleRng: {} } };
        expect(randomKeysIn(view)).toEqual(['view.options.seed', 'view.state.rng', 'view.players[0].deckSeed', 'view.round.shuffleRng']);
    });

    it('seed・rng という名前なら、小さな数でも拾う（null・false は値なしとみなす）', () => {
        expect(randomKeysIn({ options: { seed: 2 }, state: { rng: 0 } })).toEqual(['view.options.seed', 'view.state.rng']);
        expect(randomKeysIn({ options: { seed: null }, rng: undefined, rngState: false })).toEqual([]);
    });

    it('notRandomKeys の終わりの部分と、区切りごとに一致する場所だけを外す（配列の番号は見ない）', () => {
        // Wingspan の食べ物の「種子」food.seed（持っている数）
        const view = { players: [{ food: { seed: 2, fish: 1 } }, { food: { seed: 0 } }], options: { seed: 7 }, mood: { seed: 1 } };
        expect(randomKeysIn(view, 'view', [], { ignore: ['food.seed'] })).toEqual(['view.options.seed', 'view.mood.seed']);
        expect(randomKeysIn(view, 'view', [], { ignore: ['ood.seed'] })).toHaveLength(4);
        expect(randomKeysIn(view, 'view', [], { ignore: ['players.food.seed'] })).toEqual(['view.options.seed', 'view.mood.seed']);
    });

    it('似ているだけの名前は拾わない', () => {
        expect(randomKeysIn({ seats: [1], seen: true, seedling: 1, ring: 2, range: 3, strong: 4 })).toEqual([]);
    });
});
