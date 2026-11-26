import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, PROFILES, paymentPlan } from '../public/js/cpu-player.js';
import { FACTION_ORDER } from '../public/js/data.js';
import { playMatch } from '../scripts/cpu-match.mjs';
import { players, snapshot, quickSetup, makeGame } from './helpers.js';

// 14勢力を、地形が重ならない4人ずつの組に分ける
const GROUPS = [
    ['witches', 'alchemists', 'halflings', 'mermaids'],
    ['auren', 'darklings', 'cultists', 'swarmlings'],
    ['fakirs', 'giants', 'dwarves', 'witches'],
    ['nomads', 'chaosmagicians', 'engineers', 'mermaids']
];

describe('CPU 同士の試合', () => {
    it('2〜5人で、最後まで進む', () => {
        [2, 3, 4, 5].forEach(n => {
            const game = playMatch({ profiles: Array(n).fill('normal'), seed: 40 + n });
            expect(game.isOver(), `${n}人`).toBe(true);
            expect(game.state.round).toBe(6);
            expect(game.state.winners.length).toBeGreaterThan(0);
        });
    });

    it('14勢力すべてで最後まで進み、記録から同じ結果を再現できる', () => {
        expect(new Set(GROUPS.flat())).toEqual(new Set(FACTION_ORDER));
        GROUPS.forEach((factions, i) => {
            const game = playMatch({ profiles: ['normal', 'easy', 'normal', 'easy'], seed: 70 + i, factions });
            expect(game.isOver(), factions.join(',')).toBe(true);
            expect(game.options.factions).toEqual(factions);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            const again = Game.replay(saved.players, saved.options, saved.commands);
            expect(JSON.stringify(again.state)).toBe(JSON.stringify(game.state));
            // どの勢力も建物を建てている
            game.players.forEach(p => expect(Object.values(p.buildings).reduce((a, b) => a + b, 0), p.faction).toBeGreaterThan(2));
        });
    });

    it('試合の途中で、できない操作を送っても状態は変わらない', () => {
        const game = new Game(players(3, true), { seed: 123 });
        const bad = [{ type: 'pass' }, { type: 'build', hex: 0 }, { type: 'upgrade', hex: 0, to: 'SH' }, { type: 'favor', id: 'FAV99' },
            { type: 'town', id: 'TW1' }, { type: 'leech', accept: 'yes' }, { type: 'done' }, { type: 'special', id: 'ACTC' }, { type: 'convert', kind: 'PW>P', n: 30 }];
        let steps = 0;
        while (!game.isOver() && steps++ < 3000) {
            const seat = cpuActors(game)[0];
            if (steps % 7 === 0) {
                const before = snapshot(game);
                bad.forEach(c => {
                    const clone = game.clone();
                    if (!clone.applyCommand(seat, c)) {
                        game.applyCommand(seat, c);
                        expect(snapshot(game)).toBe(before);
                    }
                });
            }
            runCpuStep(game, seat, PROFILES.normal);
        }
        expect(game.isOver()).toBe(true);
    });
});

describe('CPU の判断', () => {
    it('足りない資源を、魔力の交換で補う手順を作る', () => {
        const game = quickSetup(makeGame(['witches', 'giants']));
        const p = game.players[0];
        p.res = { C: 0, W: 0, P: 0, VP: 20 };
        p.power = [0, 4, 3];
        const plan = paymentPlan(game, 0, { W: 1, C: 2 });
        expect(plan.map(c => c.kind)).toEqual(['PW>W', 'burn', 'PW>C']);
        const clone = game.clone();
        clone.state.current = 0;
        clone.state.queue = [];
        plan.forEach(c => expect(clone.applyCommand(0, c), JSON.stringify(c)).toBe(true));
        expect(clone.players[0].res).toMatchObject({ W: 1, C: 2 });
        expect(paymentPlan(game, 0, { P: 2 })).toBe(null);
    });

    it('CPU の判断でゲームの乱数を使わない（同じシードなら同じ試合）', () => {
        const a = playMatch({ profiles: ['normal', 'easy', 'normal'], seed: 5 });
        const b = playMatch({ profiles: ['normal', 'easy', 'normal'], seed: 5 });
        expect(JSON.stringify(a.commands)).toBe(JSON.stringify(b.commands));
    });
});
