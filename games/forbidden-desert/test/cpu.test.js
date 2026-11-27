import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, isCpuTurn, suggest } from '../public/js/cpu-player.js';
import { playMatch } from '../scripts/cpu-match.mjs';
import { LEVELS, ROLES } from '../public/js/data.js';
import { players, snapshot, clearSand, moveTo, placeKind } from './helpers.js';

describe('CPU', () => {
    it('CPU だけの試合が、人数・難易度・シードを変えても最後まで進む', () => {
        [2, 3, 4, 5].forEach(count => Object.keys(LEVELS).forEach(level => {
            for (let seed = 1; seed <= 3; seed++) {
                const game = playMatch({ count, level, seed: seed * 31 + count });
                expect(game.isOver(), `${count}人 ${level} ${seed}`).toBe(true);
            }
        }));
    });

    it('どの役割でも最後まで進む', () => {
        const keys = ROLES.map(r => r.key);
        for (let i = 0; i < keys.length; i++) {
            const roles = [keys[i], keys[(i + 1) % keys.length], keys[(i + 3) % keys.length]];
            const game = playMatch({ count: 3, level: 'normal', seed: 100 + i, roles });
            expect(game.isOver(), roles.join(',')).toBe(true);
        }
    });

    it('見習いなら、CPU だけでもだいたい勝てる', () => {
        let wins = 0;
        for (let seed = 1; seed <= 40; seed++) if (playMatch({ count: 3, level: 'novice', seed }).result.won) wins++;
        expect(wins).toBeGreaterThanOrEqual(24);
    });

    it('同じ状態なら同じ手を打ち、CPU の試合も記録から再現できる', () => {
        const a = playMatch({ count: 3, level: 'novice', seed: 77 });
        const b = playMatch({ count: 3, level: 'novice', seed: 77 });
        expect(snapshot(a)).toBe(snapshot(b));
        const saved = JSON.parse(JSON.stringify(a.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(a));
    });

    it('人の席の手番は CPU が動かさない。席を指定すれば代わりに1手打つ', () => {
        const game = new Game(players(2), { seed: 3 });
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(false);
        expect(runCpuStep(game, game.current)).toBe(true);
        expect(game.commands).toHaveLength(1);
    });

    it('手番でない CPU の仲間が、渇いた人に水を分ける', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], { seed: 3, roles: ['navigator', 'waterCarrier'] });
        game.players[0].water = 0;
        expect(isCpuTurn(game)).toBe(true);
        expect(runCpuStep(game)).toBe(true);
        expect(game.commands.at(-1)).toMatchObject({ playerId: 1, command: { type: 'water', to: 0 } });
    });

    it('部品の場所がわかっていて、砂がなければ拾う', () => {
        const game = new Game(players(2, true), { seed: 4, roles: ['navigator', 'explorer'] });
        clearSand(game);
        moveTo(game, 0, 11);
        const engine = game.parts.find(p => p.key === 'engine');
        engine.state = 'placed';
        engine.tile = game.grid[11];
        expect(suggest(game, 0)).toEqual({ type: 'pickup' });
    });

    it('のぞいた井戸の上で渇いていれば、掘り出す', () => {
        const game = new Game(players(2, true), { seed: 4, roles: ['navigator', 'explorer'] });
        clearSand(game);
        const well = placeKind(game, 'water', 11);
        game.peeked.push(well.id);
        moveTo(game, 0, 11);
        game.players[0].water = 0;
        expect(suggest(game, 0)).toEqual({ type: 'excavate' });
    });
});
