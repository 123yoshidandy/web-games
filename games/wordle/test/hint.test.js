import { describe, it, expect } from 'vitest';
import { suggest, evaluateGuess, pickAnswer, createRandom, MAX_ROWS, MODES } from '../public/js/logic.js';

describe('ヒント（suggest）', () => {
    it('これまでの判定にすべて合う候補をすすめ、続けると答えにたどり着く', () => {
        MODES.forEach(mode => {
            for (let seed = 1; seed <= 20; seed++) {
                const secret = pickAnswer(mode, createRandom(seed));
                const guesses = [];
                let solved = false;
                for (let row = 0; row < MAX_ROWS && !solved; row++) {
                    const word = suggest(mode, guesses);
                    expect(word).not.toBe(null);
                    guesses.forEach(g => expect(evaluateGuess(g.word, word)).toEqual(g.result));
                    const result = evaluateGuess(word, secret);
                    guesses.push({ word, result });
                    solved = word === secret;
                }
                expect(solved).toBe(true);
            }
        });
    });

    it('合う候補がなければ null', () => {
        const word = suggest('pokemon', []);
        expect(suggest('pokemon', [{ word, result: Array(word.length).fill('present') }])).toBe(null);
    });
});
