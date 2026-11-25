import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand, tilesValue } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, newGame, setTiles, setTurn, setSuns } from './helpers.js';

describe('CPU どうしの試合', () => {
    it('人数（2〜5）・強さ・シードを変えても、最後まで進む', () => {
        for (const count of [2, 3, 4, 5]) {
            for (const levels of [Array(count).fill('easy'), Array(count).fill('normal'), Array.from({ length: count }, (_, i) => (i % 2 ? 'normal' : 'easy'))]) {
                const r = runMatches({ games: 6, count, levels, seedBase: count * 100 });
                expect(r.stuck, `${count}人 ${levels.join(',')}`).toBe(0);
                expect(r.finished).toBe(6);
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す（2人）', () => {
        const r = runMatches({ games: 200, count: 2, levels: ['easy', 'normal'] });
        expect(r.wins[1] / r.finished).toBeGreaterThan(0.62);
    });
});

describe('CPU の判断', () => {
    it('袋の並びとほかの人の裏の太陽駒が変わっても、同じ手を選ぶ（のぞかない）', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const a = new Game(players(3, true).map(p => ({ ...p, cpuLevel: 'normal' })), { seed });
            let guard = 0;
            while (!a.isOver() && guard++ < 20 + seed * 5) {
                const seat = a.actors()[0];
                a.applyCommand(seat, chooseCommand(a, seat));
            }
            if (a.isOver()) continue;
            const seat = a.actors()[0];
            const b = Game.replay(a.persist().players, a.options, a.persist().commands);
            b.bag.reverse();
            b.players.filter(p => p.id !== seat).forEach(p => p.suns.filter(s => !s.up).forEach(s => { s.value = 1; }));
            expect(chooseCommand(b, seat)).toEqual(chooseCommand(a, seat));
        }
    });

    it('見積もり：3種類目の文明は高く、災害は低い', () => {
        const game = newGame(3);
        setTiles(game, 0, { art: 1, writing: 1 });
        const view = createGameView(game, 0);
        expect(tilesValue(view, 0, ['religion'])).toBeGreaterThan(4);
        setTiles(game, 0, { pyramid: 3, temple: 2 });
        expect(tilesValue(createGameView(game, 0), 0, ['earthquake'])).toBeLessThan(0);
    });

    it('価値の高いトラックで、競りに勝てるならラー宣言する', () => {
        const game = newGame(3);
        game.players[0].isCPU = true;
        game.players[0].cpuLevel = 'normal';
        setSuns(game, 0, [13, 8, 5, 2]);
        setSuns(game, 1, [12, 9, 6, 3]);
        setSuns(game, 2, [11, 10, 7, 4]);
        setTurn(game, 0);
        game.auctionTrack = ['gold', 'gold', 'god', 'astronomy', 'writing', 'art'];
        expect(chooseCommand(game, 0)).toEqual({ type: 'ra' });
    });
});
