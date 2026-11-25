import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep, chooseCommand, unseenCounts, handDistribution, LEVELS } from '../public/js/cpu-player.js';
import { setupRound, snapshot, players } from './helpers.js';

const cpus = n => players(n).map(p => ({ ...p, isCPU: true }));

describe('CPU', () => {
    it('CPU だけの試合が、2〜6 人・強さを変えても最後まで進み、記録から再現できる', () => {
        const levels = ['easy', 'normal', 'strong'];
        for (let n = 2; n <= 6; n++) {
            for (let seed = 1; seed <= 6; seed++) {
                const game = new Game(cpus(n), { seed: seed * 11 + n });
                let steps = 0;
                while (!game.isOver()) {
                    expect(runCpuStep(game, seat => levels[(seat + seed) % 3])).toBe(true);
                    if (++steps > 5000) throw new Error('終わらない');
                }
                expect(snapshot(Game.replay(cpus(n), game.options, game.commands))).toBe(snapshot(game));
            }
        }
    });

    it('ほかの人の手札をのぞかない（ビューが同じなら、隠れた手札が違っても同じ手）', () => {
        const a = setupRound({ hands: [[1, 3], [2], [5]], deck: [4, 6, 7] });
        const b = setupRound({ hands: [[1, 3], [5], [2]], deck: [7, 4, 6] });
        expect(JSON.stringify(createGameView(a, 0))).toBe(JSON.stringify(createGameView(b, 0)));
        Object.values(LEVELS).forEach(cfg => {
            expect(chooseCommand(createGameView(a, 0), cfg)).toEqual(chooseCommand(createGameView(b, 0), cfg));
        });
    });

    it('知っている相手の手札は、兵士で言い当てる', () => {
        const game = setupRound({ hands: [[1, 4], [7], [5]] });
        game.knowledge[0][1] = 7;
        expect(chooseCommand(createGameView(game, 0), LEVELS.strong)).toMatchObject({ card: 1, target: 1, guess: 7 });
    });

    it('姫は出さず、姫を残したまま魔術師で自分を選ばない', () => {
        const game = setupRound({ hands: [[9, 5], [3], [2]], protected: [false, true, true] });
        // 魔術師は自分しか選べないが、それなら姫を捨てることになる。姫を出しても脱落。どちらも避けたいが、どちらかしかない
        const command = chooseCommand(createGameView(game, 0), LEVELS.strong);
        expect(command).toBeTruthy();
        const other = setupRound({ hands: [[9, 1], [3], [2]] });
        expect(chooseCommand(createGameView(other, 0), LEVELS.strong).card).toBe(1);
    });

    it('見えていないカードの数え方：自分の手札・捨て札・表の除外・知っている手札を引く', () => {
        const game = setupRound({ n: 2, hands: [[1, 2], [7]], discards: [[0], [1]], faceUp: [3, 4, 4] });
        game.knowledge[0][1] = 7;
        const view = createGameView(game, 0);
        expect(unseenCounts(view)).toEqual([1, 4, 1, 1, 0, 2, 2, 0, 1, 1]);
        expect(handDistribution(view, view.players[1])[7]).toBe(1);
    });

    it('大臣を出した直後の人は、将軍か魔術師を持っている見込みを上げる', () => {
        const plain = setupRound({ hands: [[1, 2], [3], [4]] });
        const countess = setupRound({ hands: [[1, 2], [3], [4]], discards: [[], [8], []] });
        const p = g => handDistribution(createGameView(g, 0), createGameView(g, 0).players[1]);
        expect(p(countess)[7]).toBeGreaterThan(p(plain)[7] * 2);
    });

    it('宰相では、一番強いカードを残す', () => {
        const game = setupRound({ hands: [[6, 2], [3], [1]], deck: [0, 1, 8, 1] });
        game.applyCommand(0, { type: 'play', card: 6, target: null });
        const command = chooseCommand(createGameView(game, 0), LEVELS.strong);
        expect(command).toMatchObject({ type: 'keep', card: 8 });
        expect(game.applyCommand(0, command)).toBe(true);
    });
});
