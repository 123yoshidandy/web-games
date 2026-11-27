import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, cpuTeam } from '../public/js/cpu-player.js';
import { normalizeTeam } from '../public/js/game.js';
import { makeBattle, put, faintAllBut, snapshot } from './helpers.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('両方がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = new Game([{ name: 'A' }, { name: 'B' }], { seed });
        let steps = 0;
        while (!game.isOver() && steps++ < 2000) {
            const seat = game.actors()[0];
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(command).toBeTruthy();
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('手番でない席には出さない', () => {
        const game = makeBattle();
        expect(suggest(game, 1)).toBe(null);
        expect(suggest(game, 0)).toBeTruthy();
    });

    it('たおせる相手がいれば、たおす手をすすめる', () => {
        const game = makeBattle();
        faintAllBut(game, 1, [0, 1]);
        put(game, 1, 0, 2, 7); // ガブリアス
        put(game, 1, 1, 5, 7); // サーナイト
        game.sides[1].units[1].hp = 3;
        const c = suggest(game, 0);
        expect(c).toMatchObject({ type: 'act', target: 1 });
        expect(c.move).not.toBe(null);
    });

    it('CPU の手持ちはシードで決まり、正しい編成になっている', () => {
        expect(cpuTeam(7, 1)).toEqual(cpuTeam(7, 1));
        expect(normalizeTeam(cpuTeam(7, 1))).toBeTruthy();
        expect(normalizeTeam(cpuTeam(8, 0, 'easy'))).toBeTruthy();
    });
});
