import { describe, it, expect } from 'vitest';
import { makeGame, snapshot, setRooms, noWalls, placeGuard, place } from './helpers.js';
import { suggest } from '../public/js/cpu-player.js';
import { CELLS } from '../public/js/data.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = makeGame(2, { seed, floors: 1 });
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
        const game = makeGame(2, { seed: 7 });
        expect(suggest(game, 1)).toBe(null);
        expect(suggest(game, 0)).toBeTruthy();
    });

    it('金庫がすべて開いて階段にいれば、屋上へ逃げるのをすすめる', () => {
        const game = makeGame(1, { seed: 2 });
        setRooms(game, 0, Array(CELLS).fill('camera').map((t, i) => (i === 0 ? 'stairs' : t)), { revealed: true });
        place(game, 0, 0, 0);
        game.floors[0].safe.cracked = true;
        expect(suggest(game, 0)).toEqual({ type: 'roof' });
    });

    it('めくっていない部屋の中身を見ない：中身だけが違う2つの局面で、同じ手をすすめる', () => {
        const make = (hiddenType) => {
            const game = makeGame(1, { seed: 5 });
            setRooms(game, 0, Array(CELLS).fill(hiddenType).map((t, i) => (i === 0 ? 'secret' : t)));
            noWalls(game);
            game.floors[0].tiles[0].revealed = true;
            place(game, 0, 0, 0);
            placeGuard(game, 0, 15, 12);
            return game;
        };
        expect(suggest(make('fingerprint'), 0)).toEqual(suggest(make('safe'), 0));
    });
});
