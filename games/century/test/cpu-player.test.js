import { describe, it, expect } from 'vitest';
import Game, { POINT_CARDS, total } from '../public/js/game.js';
import { chooseCpuCommand, runCpuStep, legalCommands, PROFILES, paceOf, workFor, isCpuTurn } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { playMatch } from '../scripts/cpu-match.mjs';

const cpus = (n) => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true }));

describe('CPU', () => {
    it.each([2, 3, 4, 5])('%i人の CPU 同士で、最後まで終わる', (n) => {
        for (let seed = 1; seed <= 4; seed++) {
            const game = playMatch({ profiles: Array(n).fill('normal'), seed });
            expect(game.isOver()).toBe(true);
            expect(game.players.some(p => p.points.length >= (n <= 3 ? 6 : 5))).toBe(true);
            const replayed = Game.replay(...Object.values(game.persist()));
            expect(replayed.results).toEqual(game.results);
        }
    });

    it('でたらめに選ぶ CPU でも、止まらずに進む', () => {
        const game = new Game(cpus(3), { seed: 5 });
        for (let i = 0; i < 300 && !game.isOver(); i++) expect(runCpuStep(game, game.current, PROFILES.random)).toBe(true);
    });

    it('候補の手は、すべてルールで受け付けられる', () => {
        const game = new Game(cpus(2), { seed: 8 });
        for (let i = 0; i < 40 && !game.isOver(); i++) {
            if (game.phase === 'play') {
                const view = createGameView(game, game.current);
                for (const command of legalCommands(view, game.current)) {
                    const copy = Game.replay(...Object.values(game.persist()));
                    expect(copy.applyCommand(copy.current, command), JSON.stringify(command)).toBe(true);
                }
            }
            runCpuStep(game, game.current, PROFILES.normal);
        }
    });

    it('得点カードを買えるときは買う', () => {
        const game = new Game(cpus(2), { seed: 3 });
        const s = game.current;
        game.players[s].caravan = [...POINT_CARDS[game.pointRow[0]].cost];
        expect(chooseCpuCommand(game, s, PROFILES.strong)).toEqual({ type: 'claim', index: 0 });
    });

    it('10個を超えたら、ちょうど10個になるように戻す', () => {
        const game = new Game(cpus(2), { seed: 3 });
        const s = game.current;
        game.players[s].caravan = [6, 2, 1, 1];
        game.applyCommand(s, { type: 'play', card: 0 });
        expect(game.phase).toBe('discard');
        const command = chooseCpuCommand(game, s, PROFILES.normal);
        expect(command.type).toBe('discard');
        expect(total(command.spices)).toBe(2);
        expect(runCpuStep(game, s, PROFILES.normal)).toBe(true);
        expect(total(game.players[s].caravan)).toBe(10);
    });

    it('山の並びと、ほかの人の手札は判断に使わない', () => {
        const a = new Game(cpus(3), { seed: 21 });
        const b = new Game(cpus(3), { seed: 21 });
        b.deck.reverse();
        b.pointDeck.reverse();
        const other = (b.current + 1) % 3;
        b.players[other].hand = [5, 6, 7];
        expect(chooseCpuCommand(b, b.current, PROFILES.normal)).toEqual(chooseCpuCommand(a, a.current, PROFILES.normal));
    });

    it('同じ局面なら同じ手を選び、ゲームの乱数を動かさない', () => {
        const game = new Game(cpus(2), { seed: 4 });
        const before = JSON.stringify(game);
        expect(chooseCpuCommand(game)).toEqual(chooseCpuCommand(game));
        expect(JSON.stringify(game)).toBe(before);
    });

    it('手番でない席・終わったあとは進めない', () => {
        const game = new Game(cpus(2), { seed: 4 });
        expect(runCpuStep(game, (game.current + 1) % 2)).toBe(false);
        expect(isCpuTurn(game)).toBe(true);
        game.endGame();
        expect(runCpuStep(game, game.current)).toBe(false);
        expect(isCpuTurn(game)).toBe(false);
    });

    it('強いカードがあるほど速く、得点カードに近く見積もる', () => {
        expect(paceOf([0, 1])).toBeLessThan(paceOf([0, 1, 4]));
        expect(paceOf([0, 1, 33])).toBeGreaterThanOrEqual(paceOf([0, 1]));
        expect(workFor([0, 0, 0, 2], [0, 0, 0, 2], 2)).toBe(0);
        expect(workFor([2, 0, 0, 0], [0, 2, 0, 0], 2)).toBeLessThan(workFor([0, 0, 0, 0], [0, 2, 0, 0], 2));
    });

    it('strong は normal に勝ち越し、normal はでたらめに大きく勝ち越す', () => {
        let strong = 0;
        let normal = 0;
        for (let seed = 1; seed <= 16; seed++) {
            if (playMatch({ profiles: ['strong', 'normal'], seed }).winner === 0) strong++;
            if (playMatch({ profiles: ['normal', 'random'], seed }).winner === 0) normal++;
        }
        expect(strong).toBeGreaterThan(8);
        expect(normal).toBeGreaterThanOrEqual(15);
    });
});
