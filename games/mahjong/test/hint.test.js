import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { suggest, runCpuStep, cpuActors } from '../public/js/cpu-player.js';
import { makeGame, players, snapshot } from './helpers.js';

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = makeGame(seed);
        let steps = 0;
        while (!game.isOver() && steps++ < 40000) {
            const seat = game.actors()[0];
            const before = snapshot(game);
            const command = suggest(game, seat);
            expect(snapshot(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('操作する番でない人には出さない', () => {
        const game = makeGame(7);
        const other = [0, 1, 2, 3].find(s => !game.actors().includes(s));
        expect(suggest(game, other)).toBe(null);
    });
});

describe('CPU の強さ', () => {
    it('やさしいだけの対局も最後まで進み、強さは記録に残って再現される', () => {
        const game = new Game(players(true), { seed: 3, level: 'easy' });
        let steps = 0;
        while (!game.isOver() && steps++ < 40000) expect(runCpuStep(game, cpuActors(game)[0])).toBe(true);
        expect(game.isOver()).toBe(true);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(saved.options.level).toBe('easy');
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('知らない強さは、ふつうにする', () => {
        expect(new Game(players(true), { seed: 1, level: 'x' }).options.level).toBe('normal');
    });
});
