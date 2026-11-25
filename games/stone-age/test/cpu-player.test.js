import { describe, it, expect } from 'vitest';
import { BUILDINGS, CIV_CARDS } from '../public/js/cards.js';
import { chooseCommand, bestBuildingPay, isCpuTurn, runCpuStep } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { newGame, fixDice, setRes, run, place, resolve } from './helpers.js';

// CPU にはビューだけを渡す（JSON に通して、データだけで決められることも確かめる）
const viewOf = (game, seat) => JSON.parse(JSON.stringify(createGameView(game, seat)));

describe('CPU どうしの試合', () => {
    it('人数・強さ・シードを変えても、止まらずに最後まで進む', () => {
        for (let count = 2; count <= 4; count++) {
            for (const mix of [['normal'], ['easy'], ['easy', 'normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= 20; seed++) {
                    const game = playMatch({ levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        }
    });

    it('ふつう同士の2人でも、カードと建物を取り続けて30ラウンド以内に終わる（資源をためこんで終わらない形がない）', () => {
        for (let seed = 1; seed <= 300; seed++) {
            const game = playMatch({ levels: ['normal', 'normal'], seed });
            expect(game.isOver(), `seed ${seed}`).toBe(true);
            expect(game.round, `seed ${seed}`).toBeLessThanOrEqual(30);
        }
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 200, levels: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[1]).toBeGreaterThan(160);
    });
});

describe('CPU の判断', () => {
    it('食料が足りなくなりそうなら、狩り場に置く', () => {
        const game = newGame(2);
        game.players[0].food = 0;
        const command = chooseCommand(viewOf(game, 0), 'normal');
        expect(command).toMatchObject({ type: 'place', place: 'hunt' });
        expect(command.count).toBeGreaterThanOrEqual(3);
    });

    it('資源がそろっている建物には、先に置く', () => {
        const game = newGame(2);
        game.stacks[1][0] = BUILDINGS.find(b => b.kind === 'fixed' && b.points === 16).id;
        game.civSlots = Array(4).fill(CIV_CARDS.find(c => c.top.kind === 'food' && c.top.n === 1).id);
        setRes(game, 0, { stone: 2, gold: 1 });
        expect(chooseCommand(viewOf(game, 0), 'normal')).toEqual({ type: 'place', place: 'bld1', count: 1 });
    });

    it('道具は、得る数が増える分だけ使う', () => {
        const game = newGame(2);
        game.players[0].tools = [1, 2, 3];
        game.players[0].toolsUsed = [false, false, false];
        run(game, [[0, place('river', 2)], [1, place('hunt', 5)], [0, place('hunt', 3)]]);
        fixDice(game, [5, 5]);
        run(game, [[0, resolve('river')]]);
        // 10 → 12 に2を足せば金2つ（狩り場が残っているので、余計な道具は取っておく）
        expect(chooseCommand(viewOf(game, 0), 'normal')).toEqual({ type: 'tools', tools: [1], oneUse: [] });
    });

    it('ダイスのカードでは、価値の高い目を選ぶ（序盤の道具や畑）', () => {
        const game = newGame(2);
        game.pending = { kind: 'dice', seat: 0, buyer: 0, dice: [1, 6], order: [0, 1], index: 0 };
        expect(chooseCommand(viewOf(game, 0), 'normal')).toEqual({ type: 'pickDie', die: 1 });
    });

    it('食料が足りないとき、安い資源で払える分なら払い、高くつくなら −10点を選ぶ', () => {
        const game = newGame(2);
        setRes(game, 0, { wood: 2, gold: 5 });
        game.phase = 'feed';
        game.pending = { kind: 'feed', seat: 0, short: 2 };
        expect(chooseCommand(viewOf(game, 0), 'normal')).toEqual({ type: 'feed', pay: { wood: 2, clay: 0, stone: 0, gold: 0 } });
        game.pending.short = 5;
        expect(chooseCommand(viewOf(game, 0), 'normal')).toEqual({ type: 'feed', pay: null });
    });

    it('建物の払い方：選べる建物では点が一番大きい組み合わせ', () => {
        const count42 = BUILDINGS.find(b => b.kind === 'count' && b.n === 4 && b.kinds === 2);
        expect(bestBuildingPay(count42, { wood: 3, clay: 0, stone: 1, gold: 3 })).toEqual({ wood: 0, clay: 0, stone: 1, gold: 3 });
        const any = BUILDINGS.find(b => b.kind === 'any');
        expect(bestBuildingPay(any, { wood: 5, clay: 0, stone: 1, gold: 2 })).toEqual({ wood: 4, clay: 0, stone: 1, gold: 2 });
        expect(bestBuildingPay(BUILDINGS[0], { wood: 1, clay: 5, stone: 0, gold: 0 })).toBe(null);
    });

    it('人の番では CPU は動かない。CPU の番なら1手打つ', () => {
        const game = newGame(2);
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(null);
        run(game, [[0, place('hunt', 5)]]);
        expect(isCpuTurn(game)).toBe(true);
        expect(runCpuStep(game)).toBeTruthy();
    });

    it('払えるカードでも、価値が費用に見合わなければ取らない', () => {
        const game = newGame(2);
        game.civSlots[3] = CIV_CARDS.find(c => c.top.kind === 'food' && c.top.n === 1).id;
        setRes(game, 0, { gold: 4 });
        game.phase = 'action';
        game.pending = { kind: 'civ', seat: 0, slot: 3, cost: 4 };
        expect(chooseCommand(viewOf(game, 0), 'normal')).toEqual({ type: 'decline' });
    });
});
