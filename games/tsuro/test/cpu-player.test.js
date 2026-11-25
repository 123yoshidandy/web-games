import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { decide, scoreMoves, runCpuStep } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { newGame, startPlay, findTile, setHand, players } from './helpers.js';
import { shuffle, createRandom } from '../public/js/random.js';

describe('CPU', () => {
    it('CPU だけの試合が、2〜8人・多数のシードで止まらずに終わる', () => {
        for (let n = 2; n <= 8; n++) {
            const levels = Array.from({ length: n }, (_, i) => (i % 2 ? 'easy' : 'normal'));
            const r = runMatches({ games: 12, levels, seedBase: n * 100 });
            expect(r.stuck, `${n}人`).toBe(0);
            expect(r.finished).toBe(12);
        }
    });

    it('ビューだけを見て決める（ほかの人の手札と山の並びは入っていない）', () => {
        const game = newGame(4, 3);
        game.players.forEach(p => { p.isCPU = true; });
        const view = createGameView(game, game.current);
        expect(view.players.filter(p => p.hand).length).toBe(1);
        expect(JSON.stringify(view)).not.toContain('"pile"');
        const command = decide(view, 'normal');
        expect(command.type).toBe('place');
        expect(game.applyCommand(game.current, command)).toBe(true);
    });

    it('山の並びとほかの人の手札を入れ替えても、同じ手を選ぶ（のぞかない）', () => {
        for (let seed = 1; seed <= 15; seed++) {
            const game = new Game(players(4, true), { seed });
            let steps = 0;
            while (!game.isOver() && steps++ < 12) runCpuStep(game);
            if (game.isOver()) continue;
            const seat = game.current;
            const before = decide(createGameView(game, seat), 'normal');
            // ほかの人の手札と山を混ぜ直して配り直す（枚数は同じ）
            const others = game.players.filter(p => p.id !== seat);
            const pool = shuffle([...game.pile, ...others.flatMap(p => p.hand)], createRandom(seed + 99));
            others.forEach(p => { p.hand = pool.splice(0, p.hand.length); });
            game.pile = pool;
            expect(decide(createGameView(game, seat), 'normal')).toEqual(before);
        }
    });

    it('ふつうは、やさしいに勝ち越す（2人で60試合）', () => {
        const r = runMatches({ games: 60, levels: ['normal', 'easy'], seedBase: 700 });
        expect(r.wins[0] / r.finished).toBeGreaterThan(0.6);
    });

    it('ふつう：生き残る手のうち、相手を盤の外へ出す手を選ぶ', () => {
        // 席0（マス0の上の左寄り）。席1は同じマスの左の下寄りにいる
        const game = startPlay(newGame(3), [{ cell: 0, p: 0 }, { cell: 0, p: 6 }, { cell: 35, p: 4 }]);
        const kill = findTile({ 0: 4, 6: 7 });       // 席0は下へ、席1は左の縁へ
        const calm = findTile({ 0: 5, 6: 3 }, { except: [kill.tile] });  // 席0は下へ、席1は右へ
        setHand(game, 0, [calm.tile, kill.tile]);
        const view = createGameView(game, 0);
        const command = decide(view, 'normal');
        expect(command).toEqual({ type: 'play', tile: kill.tile, rotation: kill.rot });
        expect(scoreMoves(view).every(s => s.score > -1000)).toBe(true);
    });

    it('やさしいも、自分から脱落する手は（ほかに置けるなら）選ばない', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'easy' }, { name: 'B', isCPU: true, cpuLevel: 'easy' }, { name: 'C', isCPU: true, cpuLevel: 'easy' }], { seed });
            while (!game.isOver()) {
                const seat = game.current;
                const view = createGameView(game, seat);
                const safe = view.moves.some(m => !m.out);
                expect(runCpuStep(game)).toBe(true);
                const last = game.events.at(-1);
                if (view.phase === 'play' && safe && last.type !== 'end') expect(game.players[seat].alive).toBe(true);
            }
        }
    });
});
