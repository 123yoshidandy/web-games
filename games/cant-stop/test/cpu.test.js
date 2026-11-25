import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseMove, shouldContinue, LEVELS } from '../public/js/cpu-player.js';
import { setupGame, snapshot, players } from './helpers.js';

const cpus = n => players(n).map(p => ({ ...p, isCPU: true }));

describe('CPU', () => {
    it('CPU だけの試合が、2〜4 人・強さを変えても最後まで進み、記録から再現できる', () => {
        const levels = ['easy', 'normal', 'strong'];
        for (let n = 2; n <= 4; n++) {
            for (let seed = 1; seed <= 10; seed++) {
                const game = new Game(cpus(n), { seed: seed * 7 + n });
                let steps = 0;
                while (!game.isOver()) {
                    expect(runCpuStep(game, seat => levels[(seat + seed) % 3])).toBe(true);
                    if (++steps > 20000) throw new Error('終わらない');
                }
                expect(game.claimedCount(game.winner)).toBe(3);
                expect(snapshot(Game.replay(cpus(n), game.options, game.commands))).toBe(snapshot(game));
            }
        }
    });

    it('ゲームの乱数を使わない（考えても、次のダイスは変わらない）', () => {
        const game = new Game(cpus(2), { seed: 9 });
        game.applyCommand(game.current, { type: 'roll' });
        const copy = Game.replay(cpus(2), game.options, game.commands);
        chooseMove(game, game.current);
        expect(game.random()).toBe(copy.random());
    });

    it('止めれば 3 列目が取れるなら、必ず止める', () => {
        const game = setupGame({ claimed: { 2: 0, 12: 0 }, runners: { 3: 5 }, phase: 'decide' });
        Object.values(LEVELS).forEach(cfg => expect(shouldContinue(game, 0, cfg)).toBe(false));
    });

    it('バーストしようがない（ランナーが残っている）なら続ける', () => {
        const game = setupGame({ runners: { 7: 2 }, phase: 'decide' });
        expect(shouldContinue(game, 0, LEVELS.normal)).toBe(true);
    });

    it('進みが大きく、バーストしやすいなら、見落としのない CPU は止める', () => {
        const game = setupGame({ progress: [{}], runners: { 2: 3, 3: 4, 12: 2 }, phase: 'decide' });
        expect(shouldContinue(game, 0, LEVELS.strong)).toBe(false);
    });

    it('頂上に着ける進め方を選ぶ', () => {
        // 組 0：1+1=2 と 1+1=2 で、2 の列の頂上（3 マス目）に着く
        const game = setupGame({ progress: [{ 2: 1 }], runners: { 5: 1 }, dice: [1, 1, 1, 1] });
        const move = chooseMove(game, 0, LEVELS.strong);
        expect(move.sums).toEqual([2, 2]);
    });
});
