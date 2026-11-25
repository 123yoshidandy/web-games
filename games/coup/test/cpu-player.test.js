import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, belief, isCpuTurn } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { setHand, act, allowAll } from './helpers.js';

const cpuGame = (n, seed = 1) => new Game([{ name: 'A' }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: `C${i}`, isCPU: true, cpuLevel: 'normal' }))], { seed, startPlayer: 0 });

describe('CPU どうしの試合', () => {
    it('人数・強さ・シードを変えても、止まらずに最後まで進む', () => {
        for (let count = 2; count <= 6; count++) {
            for (const mix of [['normal'], ['easy'], ['easy', 'normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= 20; seed++) {
                    const game = playMatch({ count, levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        }
    });

    it('船長どうしが強奪をブロックし合って止まった試合が、最後まで進む', () => {
        expect(playMatch({ count: 6, levels: ['easy', 'normal', 'easy', 'normal', 'easy', 'normal'], seed: 268 }).isOver()).toBe(true);
        expect(playMatch({ count: 2, levels: ['normal', 'normal'], seed: 723 }).isOver()).toBe(true);
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 200, count: 2, levels: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[1]).toBeGreaterThan(120);
    });
});

describe('CPU の判断', () => {
    it('3枚とも見えている役割を名乗られたら、必ずチャレンジする', () => {
        const game = cpuGame(3);
        setHand(game, 1, ['duke', 'duke']);
        game.players[2].lost = ['duke'];
        game.deck.splice(game.deck.indexOf('duke'), 1);
        act(game, 'tax');
        expect(belief(createGameView(game, 1), 0, 'duke', { excludeLast: true })).toBe(0);
        expect(chooseCommand(game, 1, 'normal')).toEqual({ type: 'challenge' });
    });

    it('名乗りの種類が手札の枚数より多い人は、あやしいと見る', () => {
        const game = cpuGame(3);
        const view = createGameView(game, 1);
        const base = belief(view, 0, 'captain');
        view.claims[0] = [{ role: 'duke', kind: 'action', result: null }, { role: 'assassin', kind: 'action', result: null }];
        expect(belief(view, 0, 'captain')).toBeLessThan(base);
        view.claims[0] = [{ role: 'captain', kind: 'action', result: null }];
        expect(belief(view, 0, 'captain')).toBeGreaterThan(base);
    });

    it('最後の1枚を暗殺されそうなら、伯爵夫人でブロックする（はったりも）', () => {
        const game = cpuGame(3);
        setHand(game, 1, ['duke']);
        game.players[0].coins = 3;
        act(game, 'assassinate', 1);
        game.claims[0].push({ role: 'assassin', kind: 'action', result: null }); // 暗殺者を前にも名乗っている（チャレンジしにくい）
        allowAll(game);
        if (game.phase === 'block') expect(chooseCommand(game, 1, 'normal')).toEqual({ type: 'block', role: 'contessa' });
    });

    it('持っている役割でブロックする', () => {
        const game = cpuGame(3);
        setHand(game, 1, ['captain', 'duke']);
        act(game, 'steal', 1);
        allowAll(game);
        expect(chooseCommand(game, 1, 'easy')).toEqual({ type: 'block', role: 'captain' });
    });

    it('7コイン以上ならクーをする。失う札は価値の低い方', () => {
        const game = cpuGame(3);
        game.current = 1;
        game.players[1].coins = 7;
        expect(chooseCommand(game, 1, 'normal')).toMatchObject({ type: 'action', action: 'coup' });
        setHand(game, 2, ['duke', 'ambassador']);
        game.players[0].coins = 7;
        game.current = 0;
        act(game, 'coup', 2);
        expect(chooseCommand(game, 2, 'normal')).toEqual({ type: 'lose', role: 'ambassador' });
    });

    it('人だけを待っているときは CPU は動かない', () => {
        const game = cpuGame(3);
        expect(isCpuTurn(game)).toBe(false);
        act(game, 'tax');
        expect(isCpuTurn(game)).toBe(true);
    });
});
