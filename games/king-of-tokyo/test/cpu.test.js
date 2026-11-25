import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep, chooseCommand, LEVELS } from '../public/js/cpu-player.js';
import { gameAt, resolveWith, snapshot, players } from './helpers.js';

const cpus = n => players(n).map(p => ({ ...p, isCPU: true }));

describe('CPU', () => {
    it('CPU だけの試合が、2〜6 人・強さを変えても最後まで進み、記録から再現できる', () => {
        const levels = ['easy', 'normal', 'strong'];
        for (let n = 2; n <= 6; n++) {
            for (let seed = 1; seed <= 6; seed++) {
                const game = new Game(cpus(n), { seed: seed * 23 + n });
                let steps = 0;
                while (!game.isOver()) {
                    expect(runCpuStep(game, seat => levels[(seat + seed) % 3])).toBe(true);
                    if (++steps > 20000) throw new Error('終わらない');
                }
                expect(snapshot(Game.replay(cpus(n), game.options, game.commands))).toBe(snapshot(game));
            }
        }
    });

    it('山札の並び（見えない情報）が違っても、ビューが同じなら同じ手', () => {
        const a = gameAt(3, 0, { seed: 4 });
        const b = gameAt(3, 0, { seed: 4 });
        b.deck.reverse();
        expect(JSON.stringify(createGameView(a, 0))).toBe(JSON.stringify(createGameView(b, 0)));
        Object.values(LEVELS).forEach(cfg => expect(chooseCommand(createGameView(a, 0), cfg)).toEqual(chooseCommand(createGameView(b, 0), cfg)));
    });

    it('20 勝利点に届くカードは買う', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; g2.players[0].vp = 17; g2.players[0].energy = 6; g2.market[0] = 'apartmentBuilding'; } });
        resolveWith(g, ['1', '2', '3', '1', '2', '3']);
        expect(chooseCommand(createGameView(g, 0), LEVELS.normal)).toEqual({ type: 'buy', card: 'apartmentBuilding' });
    });

    it('攻撃のあとの体力が少なければ、東京を明け渡す', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; g2.players[1].health = 6; } });
        resolveWith(g, ['claw', 'claw', 'claw', '1', '2', '3']);
        expect(g.decision).toMatchObject({ seat: 1, kind: 'yield' });
        expect(chooseCommand(createGameView(g, 1), LEVELS.strong)).toEqual({ type: 'yield', yes: true });
    });

    it('体力が多ければ、東京に残る', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; } });
        resolveWith(g, ['claw', '1', '2', '3', '1', '2']);
        expect(chooseCommand(createGameView(g, 1), LEVELS.strong)).toEqual({ type: 'yield', yes: false });
    });
});
