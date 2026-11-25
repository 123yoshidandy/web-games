import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { decide, scoreMoves, runCpuStep, CPU_LEVELS } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { newGame, setPosition } from './helpers.js';

const viewAt = (game) => createGameView(game, game.current);

describe('CPU', () => {
    it('CPU どうしの試合が、強さとシードを変えても止まらずに終わる（千日手と手数の上限で必ず終わる）', () => {
        [['easy', 'easy'], ['normal', 'easy'], ['normal', 'normal']].forEach(([a, b]) => {
            const r = runMatches({ games: 30, a, b, seedBase: 50 });
            expect(r.stuck, `${a}-${b}`).toBe(0);
            expect(r.finished).toBe(30);
        });
        const strong = runMatches({ games: 2, a: 'strong', b: 'easy', seedBase: 9 });
        expect(strong.finished).toBe(2);
    });

    it('どの強さも、勝てる手（石の道・川の道）があれば必ず指す', () => {
        CPU_LEVELS.forEach(level => {
            const stone = setPosition(newGame(1), { 22: '藍師', 17: '藍弟', 7: '朱師', 3: '朱弟' }, { hands: [['tiger', 'crab'], ['ox', 'eel']], side: 'dragon' });
            expect(decide(viewAt(stone), level), level).toEqual({ type: 'move', card: 'tiger', from: 17, to: 7 });
            const stream = setPosition(newGame(1), { 12: '藍師', 20: '藍弟', 4: '朱師', 0: '朱弟' }, { hands: [['crab', 'tiger'], ['ox', 'eel']], side: 'dragon' });
            expect(decide(viewAt(stream), level), level).toEqual({ type: 'move', card: 'tiger', from: 12, to: 2 });
        });
    });

    it('どの強さも、すぐ負ける手（相手に師匠を取られる）は、ほかに手があれば指さない', () => {
        // 藍の師匠は 17。朱の弟子は 7 にいて、朱は虎（席1では下へ2）を持つ。藍が師匠を 12 に出すと取られない…などを全部の手で確かめる
        CPU_LEVELS.forEach(level => {
            for (let seed = 1; seed <= 15; seed++) {
                const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'easy' }, { name: 'B', isCPU: true, cpuLevel: 'easy' }], { seed });
                for (let i = 0; i < 6 && !game.isOver(); i++) runCpuStep(game);
                if (game.isOver()) continue;
                const view = viewAt(game);
                const { scored } = scoreMoves(view, level);
                const safe = scored.some(s => s.score > -50000);
                const command = decide(view, level);
                const chosen = scored.find(s => s.move.card === command.card && s.move.from === command.from && s.move.to === command.to);
                if (safe) expect(chosen.score, `${level} ${seed}`).toBeGreaterThan(-50000);
            }
        });
    });

    it('同じビューなら同じ手を選び、ビューにはシードが入らない（ビューだけを見る）', () => {
        const game = newGame(5, [true, true]);
        const view = viewAt(game);
        expect(JSON.stringify(view)).not.toContain('seed');
        expect(decide(view, 'normal')).toEqual(decide(JSON.parse(JSON.stringify(view)), 'normal'));
        expect(game.applyCommand(game.current, decide(view, 'strong'))).toBe(true);
    });

    it('ふつうはやさしいに、つよいはふつうに勝ち越す', () => {
        const a = runMatches({ games: 30, a: 'normal', b: 'easy', seedBase: 600 });
        expect(a.winsA).toBeGreaterThan(a.winsB * 2);
        const b = runMatches({ games: 6, a: 'strong', b: 'normal', seedBase: 700 });
        expect(b.winsA).toBeGreaterThan(b.winsB);
    });

    it('動けないときは、カードを脇と入れ替える', () => {
        const game = setPosition(newGame(1, [true, true]), { 0: '藍師', 5: '藍弟', 10: '藍弟', 15: '藍弟', 20: '藍弟', 4: '朱師' }, { hands: [['tiger', 'horse'], ['ox', 'eel']], side: 'dragon' });
        expect(viewAt(game).mustPass).toBe(true);
        expect(runCpuStep(game)).toBe(true);
        expect(game.commands[0].command.type).toBe('pass');
    });
});
