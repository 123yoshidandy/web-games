import { describe, it, expect } from 'vitest';
import { suggest, chooseCpuCommand, PROFILES } from '../public/js/cpu-player.js';
import { makeGame } from './helpers.js';

const snapshot = (game) => JSON.stringify(game.persist());

describe('ヒント（suggest）', () => {
    it('自分の番に、CPU（ふつう）と同じ手をすすめ、その手が通る（13回書き終えるまで）', () => {
        const game = makeGame(1, 5);
        let scored = 0;
        for (let i = 0; i < 200 && game.phase !== 'end'; i++) {
            const before = snapshot(game);
            const command = suggest(game, 0);
            expect(snapshot(game)).toBe(before); // すすめるだけでは状態を変えない
            expect(command).toEqual(chooseCpuCommand(game, 0, PROFILES.normal));
            expect(game.applyCommand(0, command)).toBe(true);
            if (command.type === 'score') scored++;
        }
        expect(game.phase).toBe('end');
        expect(scored).toBe(13);
    });

    it('自分の番でなければ null', () => {
        const game = makeGame(2, 5);
        const other = 1 - game.actors()[0];
        expect(suggest(game, other)).toBe(null);
    });
});
