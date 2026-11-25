import { describe, it, expect } from 'vitest';
import Game, { COMMAND_FIELDS } from '../public/js/game.js';
import { RACE_IDS, POWER_IDS } from '../public/js/data.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';
import { players, snapshot } from './helpers.js';

describe('CPU だけの試合', () => {
    it.each([2, 3, 4, 5])('%i人：最後まで進み、記録から同じ結果を再現できる', (n) => {
        for (let seed = 1; seed <= 8; seed++) {
            const levels = Array.from({ length: n }, (_, i) => (i % 2 ? 'easy' : 'normal'));
            const game = playMatch({ profiles: levels, seed });
            expect(game.isOver()).toBe(true);
            expect(game.winners.length).toBeGreaterThan(0);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('種族14と特殊能力20が、どれも選ばれて使われる', () => {
        const races = new Set();
        const powers = new Set();
        for (let seed = 1; seed <= 60 && (races.size < RACE_IDS.length || powers.size < POWER_IDS.length); seed++) {
            const game = new Game(players(4, true), { seed });
            while (!game.isOver()) {
                if (game.stage === 'pick') {
                    // 並びの下の組も選ばれるように、ときどき一番下を選ぶ
                    const index = seed % 3 === 0 ? Math.min(game.row.length - 1, game.players[game.current].coins) : null;
                    if (index !== null && game.applyCommand(game.current, { type: 'pick', index })) continue;
                }
                runCpuStep(game);
                if (game.stage === 'conquer' && game.step.conquered.length > 0) {
                    races.add(game.acting);
                    if (!game.bands[game.acting].declined) powers.add(game.bands[game.acting].power);
                }
            }
        }
        expect([...races].sort()).toEqual([...RACE_IDS].sort());
        expect([...powers].sort()).toEqual([...POWER_IDS].sort());
    });

    it('ふつうは、やさしいより勝つ', () => {
        const two = runMatches({ games: 120, profiles: ['normal', 'easy'] });
        expect(two.finished).toBe(120);
        expect(two.wins[0] / two.finished).toBeGreaterThan(0.6);
        const three = runMatches({ games: 120, profiles: ['easy', 'easy', 'normal'] });
        expect(three.wins[2] / three.finished).toBeGreaterThan(0.4);
    });
});

describe('断る操作', () => {
    it('でたらめな操作を断るときは、状態を変えない', () => {
        const random = createRandom(77);
        const types = Object.keys(COMMAND_FIELDS);
        for (let seed = 1; seed <= 4; seed++) {
            const game = new Game(players(3, true), { seed });
            let guard = 0;
            while (!game.isOver() && guard++ < 3000) {
                for (let k = 0; k < 3; k++) {
                    const type = types[Math.floor(random() * types.length)];
                    const command = { type, region: Math.floor(random() * 34) - 2, index: Math.floor(random() * 8) - 1, peace: Math.floor(random() * 4) - 1, decline: random() < 0.5 };
                    const seat = random() < 0.8 ? game.current : (game.current + 1) % 3;
                    const before = snapshot(game);
                    const commands = game.commands.length;
                    if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                    else expect(game.commands.length).toBe(commands + 1);
                }
                runCpuStep(game);
            }
            expect(game.isOver()).toBe(true);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
