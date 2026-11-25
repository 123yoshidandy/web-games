import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCpuCommand, runCpuStep, cpuActors, decidePass, decidePlay, PROFILES } from '../public/js/cpu-player.js';
import { players, setup, playCards, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const playOut = (game, profile) => {
    let steps = 0;
    while (!game.isOver() && steps++ < 20000) expect(runCpuStep(game, cpuActors(game)[0], profile)).toBe(true);
    return game;
};
const fixed = () => 0.5; // 揺れのない乱数（blunder の判定は 0.5）
const viewOf = (game, seat) => createGameView(game, seat, { events: false });

describe('CPU', () => {
    it('全員 CPU の試合が、どの強さでも15シードとも100点まで進み、記録から再現できる', () => {
        for (const profile of [PROFILES.easy, PROFILES.normal, PROFILES.random]) {
            for (let seed = 1; seed <= 15; seed++) {
                const game = playOut(new Game(players(true), { seed }), profile);
                expect(game.isOver()).toBe(true);
                const saved = game.persist();
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('ほかの人の手札や、ほかの人が選んだ渡す札で、手を変えない（のぞかない）', () => {
        const a = new Game(players(true), { seed: 7 });
        const b = new Game(players(true), { seed: 7 });
        // 席1・2・3の手札の中身を入れ替える（席0の手札はそのまま）
        [b.players[1].hand, b.players[2].hand] = [b.players[2].hand, b.players[1].hand];
        for (const profile of Object.values(PROFILES)) expect(chooseCpuCommand(a, 0, profile)).toEqual(chooseCpuCommand(b, 0, profile));
    });

    it('渡す：守りの薄いスペードのクイーンと、高いハートを渡す。低いスペードが3枚あればクイーンは残す', () => {
        const thin = ['QS', '3S', 'AH', 'KH', '2C', '3C', '4C', '5C', '2D', '3D', '4D', '5D', '6D'];
        expect(decidePass(thin, fixed, PROFILES.strong).sort()).toEqual(['AH', 'KH', 'QS'].sort());
        const guarded = ['QS', '2S', '3S', '4S', 'AH', 'KH', 'QH', '2C', '3C', '4C', '2D', '3D', '4D'];
        expect(decidePass(guarded, fixed, PROFILES.strong)).not.toContain('QS');
    });

    it('ついていけるときは、勝ち札より下の一番高い札で逃げる', () => {
        const game = new Game(players(true), { seed: 1 });
        setup(game, { hands: [['9D', '2C'], ['3D', '8D', 'KD', '2S'], ['4C'], ['5C']], turn: 0 });
        playCards(game, ['9D']);
        expect(decidePlay(viewOf(game, 1), fixed, PROFILES.strong)).toBe('8D');
    });

    it('ついていけないときは、スペードのクイーンを捨てる。なければ高いハート', () => {
        const game = new Game(players(true), { seed: 1 });
        setup(game, { hands: [['9D', '2C'], ['QS', 'AH', '2H', '3C'], ['4C'], ['5C']], turn: 0, broken: true });
        playCards(game, ['9D']);
        expect(decidePlay(viewOf(game, 1), fixed, PROFILES.strong)).toBe('QS');
        game.players[1].hand = ['AH', '2H', '3C'];
        expect(decidePlay(viewOf(game, 1), fixed, PROFILES.strong)).toBe('AH');
    });

    it('クイーンを持っていなければ、低いスペードで始めてクイーンをあぶり出す', () => {
        const game = new Game(players(true), { seed: 1 });
        setup(game, { hands: [['3S', '2D', 'AS'], ['4C'], ['5C'], ['6C']], turn: 0 });
        expect(decidePlay(viewOf(game, 0), fixed, PROFILES.strong)).toBe('3S');
    });

    it('強さの順：ふつうは、やさしいに勝ち越し、やさしいは、でたらめに大きく勝ち越す', () => {
        const a = runMatches({ games: 120, profiles: ['normal', 'easy', 'easy', 'easy'] });
        expect(a.finished).toBe(120);
        expect(a.wins[0] / a.finished).toBeGreaterThan(0.4);
        const b = runMatches({ games: 80, profiles: ['easy', 'random', 'random', 'random'] });
        expect(b.wins[0] / b.finished).toBeGreaterThan(0.6);
    });
});
