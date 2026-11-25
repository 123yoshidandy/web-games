import { describe, it, expect } from 'vitest';
import Game, { GOLD, countTokens } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, PROFILES, CPU_LEVELS } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { makeGame, setBoard, giveTokens, giveBonuses, findCard, placeInPyramid, snapshot } from './helpers.js';

describe('CPU', () => {
    it('どの強さでも、多くのシードで最後まで終わり、手が断られない', () => {
        for (const profiles of [['easy', 'normal'], ['normal', 'normal'], ['strong', 'easy']]) {
            const r = runMatches({ games: 60, profiles, seedBase: 100 });
            expect(r.stuck).toBe(0);
            expect(r.finished).toBe(60);
            expect(r.fallbacks).toBe(0);
        }
    });

    it('CPU の試合は記録から再現できる（CPU はゲームの乱数を使わない）', () => {
        const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'easy' }, { name: 'B', isCPU: true }], { seed: 77 });
        let steps = 0;
        while (!game.isOver() && steps++ < 3000) runCpuStep(game);
        const saved = game.persist();
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('手を決めるだけでは状態を変えず、同じ場面では同じ手を選ぶ', () => {
        const game = makeGame(12);
        const before = snapshot(game);
        const a = chooseCpuCommand(game, 0);
        expect(snapshot(game)).toBe(before);
        expect(chooseCpuCommand(game, 0)).toEqual(a);
    });

    it('勝てるカードが買えるなら買う', () => {
        const game = makeGame(3);
        game.players[0].royals = [1, 2, 3]; // 6点
        game.players[0].cards.push({ id: 64, color: null }, { id: 50, color: null }); // 11点
        const id = findCard(c => c.level === 1 && c.color === null); // 3点。赤4 パール1
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { red: 4, pearl: 1 });
        for (const level of CPU_LEVELS) expect(chooseCpuCommand(game, 0, PROFILES[level])).toEqual({ type: 'buy', card: id });
    });

    it('相手があと少しで勝てる場のカードを、見落としのない CPU は予約して止める', () => {
        const game = makeGame(3);
        game.current = 1;
        game.players[0].royals = [1, 2, 3]; // 6点
        game.players[0].cards.push({ id: 64, color: null }, { id: 50, color: null }); // 11点
        const id = findCard(c => c.level === 3 && c.color === 'red' && c.points === 4); // 緑2 赤6 黒2
        [1, 2, 3].forEach(l => { game.pyramid[l] = game.pyramid[l].map(() => null); });
        game.pyramid[3][0] = id;
        giveBonuses(game.players[0], { red: 4 });
        giveTokens(game.players[0], { green: 2, red: 2, black: 1 });
        const command = chooseCpuCommand(game, 1, PROFILES.strong);
        expect(command).toMatchObject({ type: 'reserve', card: id });
        expect(game.board[command.gold]).toBe(GOLD);
    });

    it('能力の選択と、トークンを返す選択で、通る手を選ぶ', () => {
        const game = makeGame(3);
        const id = findCard(c => c.level === 2 && c.color === 'white' && c.ability === 'steal');
        placeInPyramid(game, 2, 0, id);
        giveTokens(game.players[0], { blue: 4, red: 3 });
        giveTokens(game.players[1], { green: 2, pearl: 1 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.phase).toBe('choose');
        expect(game.applyCommand(0, chooseCpuCommand(game, 0))).toBe(true);

        const g2 = makeGame(4);
        setBoard(g2, ['WUG..', '.....', '.....', '.....', '.....']);
        giveTokens(g2.players[0], { red: 4, black: 4 });
        g2.bag.red -= 4;
        g2.bag.black -= 4;
        g2.applyCommand(0, { type: 'take', cells: [0, 1, 2] });
        expect(g2.phase).toBe('discard');
        expect(g2.applyCommand(0, chooseCpuCommand(g2, 0))).toBe(true);
        expect(countTokens(g2.players[0].tokens)).toBe(10);
    });

    it('強さの順（やさしい＜ふつう＜つよい）になっている', () => {
        const easy = runMatches({ games: 100, profiles: ['easy', 'normal'], seedBase: 500 });
        expect(easy.wins[1]).toBeGreaterThan(easy.wins[0]);
        const normal = runMatches({ games: 100, profiles: ['normal', 'strong'], seedBase: 500 });
        expect(normal.wins[1]).toBeGreaterThan(normal.wins[0]);
    });
});
