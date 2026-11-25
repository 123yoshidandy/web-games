import { describe, it, expect } from 'vitest';
import { runMatches } from '../scripts/cpu-match.mjs';
import { chooseCommand, bustChance } from '../public/js/cpu-player.js';
import { CARDS } from '../public/js/cards.js';
import { newGame, find, stackDeck, give } from './helpers.js';

describe('CPU', () => {
    it('CPU どうしの試合が、人数・強さ・シードを変えても止まらない', () => {
        for (const levels of [['easy', 'easy'], ['normal', 'normal'], ['easy', 'normal', 'easy'], ['normal', 'easy', 'easy', 'easy', 'easy']]) {
            const r = runMatches({ games: 30, levels, seedBase: 50 });
            expect(r.stuck, levels.join()).toBe(0);
        }
    });

    it('ふつうは、やさしいに大きく勝ち越す', () => {
        const a = runMatches({ games: 100, levels: ['normal', 'easy'], seedBase: 900 });
        expect(a.wins[0]).toBeGreaterThan(70);
    });

    it('失敗の確率は、見えていないカードのうち、港と同じ色で撃退できない船の割合', () => {
        const game = newGame();
        expect(bustChance(game, 0)).toBe(0);
        const a = find({ kind: 'ship', color: 'black', swords: 2 })[0];
        stackDeck(game, [a]);
        game.applyCommand(0, { type: 'draw' });
        const p = bustChance(game, 0);
        // 黒は残り9枚。見えていないカードは 120 −（5人用の遠征・港の1枚）
        expect(p).toBeCloseTo(9 / 118, 5);
        // 剣が2つあれば、剣2の黒は撃退できるので数えない
        give(game, 0, find({ role: 'pirate' }, 1));
        expect(bustChance(game, 0)).toBeCloseTo(7 / 117, 5);
    });

    it('ふつうは、港に価値があって失敗しやすいときは止める', () => {
        const game = newGame();
        const used = new Set();
        const ships = ['yellow', 'blue', 'green', 'red', 'black'].map(c => find({ kind: 'ship', color: c, swords: CARDS.find(x => x.kind === 'ship' && x.color === c && x.swords !== null).swords }, 1, used)[0]);
        stackDeck(game, ships);
        ships.forEach(() => game.applyCommand(0, { type: 'draw' }));
        expect(chooseCommand(game, 0, 'normal')).toEqual({ type: 'stop' });
    });

    it('ふつうは、条件を満たした遠征をすぐ取る', () => {
        const game = newGame();
        const exp = CARDS.find(c => c.kind === 'expedition' && c.needs.join() === 'house,house').id;
        game.deck = game.deck.filter(id => id !== exp);
        game.expeditions = [exp];
        give(game, 0, find({ role: 'settler' }, 2));
        expect(chooseCommand(game, 0, 'normal')).toEqual({ type: 'claim', card: exp });
    });
});
