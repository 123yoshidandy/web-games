import { describe, it, expect } from 'vitest';
import { chooseCommand, keepAnimals, isCpuTurn, runCpuStep } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { addPastures, createFarm, fits } from '../public/js/farm.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { newGame, withSpace, run, act, finishRound } from './helpers.js';

const viewOf = (game, seat) => JSON.parse(JSON.stringify(createGameView(game, seat)));

describe('CPU どうしの試合', () => {
    it('人数（1〜4）・強さ・シードを変えても、止まらずに最後まで進む', () => {
        for (let count = 1; count <= 4; count++) {
            for (const mix of [['normal'], ['easy'], ['easy', 'normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= 8; seed++) {
                    const game = playMatch({ levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す', () => {
        const r = runMatches({ games: 100, levels: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.wins[1]).toBeGreaterThan(70);
    });
});

describe('CPU の判断（ビューだけを見る）', () => {
    it('空いた畑があり種があれば、種をまく', () => {
        const game = newGame(2);
        withSpace(game, 'sowBake');
        game.players[0].farm.fields.push({ cell: 2, crop: null, n: 0 });
        game.players[0].res.grain = 1;
        game.spaces = game.spaces.filter(s => ['sowBake', 'grain', 'clayPit'].includes(s));
        const command = chooseCommand(viewOf(game, 0), 'normal');
        expect(command).toMatchObject({ type: 'act', space: 'sowBake', sow: [{ cell: 2, crop: 'grain' }] });
        expect(game.applyCommand(0, command)).toBe(true);
    });

    it('部屋が家族より多ければ、家族を増やす', () => {
        const game = newGame(2);
        withSpace(game, 'family');
        game.players[0].farm.rooms.push(0);
        game.players[0].food = 10;
        expect(chooseCommand(viewOf(game, 0), 'normal')).toMatchObject({ space: 'family' });
    });

    it('動物があふれたら、各種類を残しつつ入るだけ残す', () => {
        const me = { farm: addPastures(createFarm(), [[4]]).farm };
        const keep = keepAnimals(me, { sheep: 4, boar: 1, cattle: 0 });
        expect(fits(me.farm, keep)).toBe(true);
        expect(keep.boar).toBe(1);
        expect(keep.sheep).toBe(2);
    });

    it('食事では、足りない分を換算し、繁殖のために2頭は残す', () => {
        const game = newGame(2);
        game.round = 4;
        const [a, b] = game.players;
        a.food = 0;
        a.majors = ['hearth4'];
        a.farm = addPastures(createFarm(), [[3, 4]]).farm;
        a.animals = { sheep: 3, boar: 0, cattle: 0 };
        a.res.grain = 3;
        b.food = 100;
        finishRound(game);
        expect(game.feeding).toContain(0);
        const command = chooseCommand(viewOf(game, 0), 'normal');
        run(game, [[0, command]]);
        expect(a.begging).toBe(0);
        expect(a.animals.sheep).toBeGreaterThanOrEqual(2);
    });

    it('人の番では動かない。CPU の番なら1手打つ', () => {
        const game = newGame(2);
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(null);
        run(game, [[0, act('grain')]]);
        expect(isCpuTurn(game)).toBe(true);
        expect(runCpuStep(game)).toBeTruthy();
    });
});
