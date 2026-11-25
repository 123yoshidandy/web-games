import { describe, it, expect } from 'vitest';
import { chooseCommand } from '../public/js/cpu-player.js';
import { runMatches, playMatch } from '../scripts/cpu-match.mjs';
import { playGame, setCity, placeCard } from './helpers.js';

describe('CPU', () => {
    it('CPU どうしの試合が、強さとシードを変えても止まらない', () => {
        for (const levels of [['easy', 'easy'], ['normal', 'normal'], ['easy', 'normal'], ['normal', 'easy']]) {
            const r = runMatches({ games: 25, levels, seedBase: 100 });
            expect(r.stuck, levels.join()).toBe(0);
            expect(r.finished).toBe(25);
        }
    });

    it('3つの勝ち方（軍事・科学・点）が、どれも起きる', () => {
        const r = runMatches({ games: 300, levels: ['easy', 'normal'], seedBase: 1 });
        expect(r.victories.military).toBeGreaterThan(0);
        expect(r.victories.science).toBeGreaterThan(0);
        expect(r.victories.civil).toBeGreaterThan(0);
    });

    it('ふつうは、やさしいに大きく勝ち越す', () => {
        const a = runMatches({ games: 100, levels: ['normal', 'easy'], seedBase: 500 });
        const b = runMatches({ games: 100, levels: ['easy', 'normal'], seedBase: 500 });
        expect(a.wins[0] + b.wins[1]).toBeGreaterThan(140);
    });

    it('その場で勝てる手は打つ（科学の6種類目）', () => {
        const game = playGame(1);
        game.players[0].isCPU = true;
        game.players[0].cpuLevel = 'normal';
        setCity(game, 0, { cards: ['apothecary', 'workshop', 'scriptorium', 'pharmacist'], tokens: ['law'], coins: 20 });
        const slot = game.accessibleSlots()[3];
        placeCard(game, slot, 'study');
        game.age = 3;
        expect(chooseCommand(game, 0)).toEqual({ type: 'build', slot });
    });

    it('相手が次に勝てるカードは取る（軍事）', () => {
        const game = playGame(1);
        game.military = -8;
        setCity(game, 0, { coins: 0 });
        setCity(game, 1, { coins: 20 });
        const slot = game.accessibleSlots()[4];
        placeCard(game, slot, 'guardTower');
        const command = chooseCommand(game, 0, 'normal');
        expect(command.slot).toBe(slot);
    });

    it('どの試合も、記録の手数に上限がある（止まらない）', () => {
        const game = playMatch({ levels: ['normal', 'normal'], seed: 77 });
        expect(game.isOver()).toBe(true);
        expect(game.commands.length).toBeLessThan(120);
    });
});
