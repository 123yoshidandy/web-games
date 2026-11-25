import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, isCpuTurn } from '../public/js/cpu-player.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { newGame, setCity, fixDice } from './helpers.js';

describe('CPU どうしの試合', () => {
    it('人数・強さ・シードを変えても、止まらずに最後まで進む', () => {
        const mixes = { 2: [['normal', 'normal'], ['easy', 'easy'], ['easy', 'normal']], 3: [['normal', 'easy', 'normal']], 4: [['easy', 'normal', 'easy', 'normal'], ['normal', 'normal', 'normal', 'normal']] };
        for (const [count, list] of Object.entries(mixes)) {
            for (const levels of list) {
                for (let seed = 1; seed <= 20; seed++) {
                    const game = playMatch({ count: Number(count), levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 100, count: 2, levels: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[1]).toBeGreaterThan(70);
    });
});

describe('CPU の判断', () => {
    it('人の番では CPU は動かない', () => {
        const game = newGame();
        expect(isCpuTurn(game)).toBe(false);
        game.applyCommand(0, { type: 'roll', dice: 1 });
        game.applyCommand(0, { type: 'pass' });
        expect(isCpuTurn(game)).toBe(true);
    });

    it('ふつうは、最後のランドマークが建てられれば建てて勝つ', () => {
        const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B' }], { seed: 1, startPlayer: 0 });
        setCity(game, 0, { landmarks: ['station', 'mall', 'park'], coins: 30 });
        fixDice(game, 5);
        game.applyCommand(0, { type: 'roll', dice: 1 });
        expect(chooseCommand(game)).toEqual({ type: 'build', card: 'tower' });
    });

    it('ふつうは、最初の4コインで駅よりコンビニを買う（麦畑とパン屋だけでは、2個で振る得がない）', () => {
        const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B' }], { seed: 1, startPlayer: 0 });
        setCity(game, 0, { coins: 4 });
        fixDice(game, 5);
        game.applyCommand(0, { type: 'roll', dice: 1 });
        expect(chooseCommand(game)).toEqual({ type: 'build', card: 'store' });
    });

    it('ふつうは、テレビ局でコインの一番多い人から取る', () => {
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B' }, { name: 'C' }], { seed: 1, startPlayer: 0 });
        setCity(game, 0, { cards: { tv: 1 } });
        setCity(game, 1, { coins: 2 });
        setCity(game, 2, { coins: 8 });
        fixDice(game, 6);
        game.applyCommand(0, { type: 'roll', dice: 1 });
        expect(chooseCommand(game, 0, 'normal')).toEqual({ type: 'tv', target: 2 });
    });

    it('ふつうは、ビジネスセンターで得になる交換をし、得がなければしない', () => {
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B' }], { seed: 1, startPlayer: 0 });
        setCity(game, 0, { cards: { business: 1, wheat: 1, bakery: 1, cafe: 1 } });
        setCity(game, 1, { cards: { store: 1, wheat: 1 } });
        fixDice(game, 6);
        game.applyCommand(0, { type: 'roll', dice: 1 });
        const command = chooseCommand(game, 0, 'normal');
        expect(command).toEqual({ type: 'trade', give: 'cafe', target: 1, take: 'store' });
        expect(game.applyCommand(0, command)).toBe(true);

        // 2個で振れない人には、鉱山は得にならない
        const other = new Game([{ name: 'A', isCPU: true }, { name: 'B' }], { seed: 1, startPlayer: 0 });
        setCity(other, 0, { cards: { business: 1, wheat: 1, bakery: 1 } });
        setCity(other, 1, { cards: { mine: 1 } });
        fixDice(other, 6);
        other.applyCommand(0, { type: 'roll', dice: 1 });
        expect(chooseCommand(other, 0, 'normal')).toEqual({ type: 'skipTrade' });
    });

    it('ふつうは、2個で得になる施設がそろえば駅で2個振る', () => {
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B' }], { seed: 1, startPlayer: 0 });
        setCity(game, 0, { cards: { mine: 2, apple: 2, family: 1 }, landmarks: ['station'] });
        expect(chooseCommand(game, 0, 'normal')).toEqual({ type: 'roll', dice: 2 });
        setCity(game, 0, { cards: { wheat: 3, bakery: 3, store: 2 } });
        expect(chooseCommand(game, 0, 'normal')).toEqual({ type: 'roll', dice: 1 });
    });
});
