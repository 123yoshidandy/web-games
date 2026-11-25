import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuRound, chooseCommand, scoreCandidates, LEVELS } from '../public/js/cpu-player.js';
import { cpus, park, setupGame, snapshot } from './helpers.js';

describe('CPU', () => {
    it('CPU だけの試合が、2〜5 人・強さを変えても最後まで進み、記録から再現できる', () => {
        const levels = ['easy', 'normal', 'strong', 'random'];
        for (let n = 2; n <= 5; n++) {
            for (let seed = 1; seed <= 5; seed++) {
                const game = new Game(cpus(n), { seed: seed * 17 + n });
                let steps = 0;
                while (!game.isOver()) {
                    expect(runCpuRound(game, seat => levels[(seat + seed) % levels.length])).toBe(true);
                    if (++steps > 20) throw new Error('終わらない');
                }
                // 2 人のときは、置く 12 回に、箱に戻す 8 回（各ラウンドの最後の手番は自動）が加わる
                expect(steps).toBe(n === 2 ? 20 : 12);
                expect(snapshot(Game.replay(cpus(n), game.options, game.commands))).toBe(snapshot(game));
            }
        }
    });

    it('ほかの人の手をのぞかない（ビューが同じなら、隠れた手が違っても同じ手）', () => {
        const parks = () => [park({ forest: 'tri' }), park({ love: 'stego' }), park()];
        const a = setupGame({ parks: parks(), hands: ['tri para trex', 'stego stego brachio', 'spino tri para'] });
        const b = setupGame({ parks: parks(), hands: ['tri para trex', 'trex trex trex', 'brachio brachio tri'] });
        // 袋の中身も違ってよい
        b.bag.reverse();
        expect(JSON.stringify(createGameView(a, 0))).toBe(JSON.stringify(createGameView(b, 0)));
        Object.values(LEVELS).forEach(cfg => {
            expect(chooseCommand(createGameView(a, 0), cfg)).toEqual(chooseCommand(createGameView(b, 0), cfg));
        });
    });

    it('候補の手は、どれもルールで通る', () => {
        const game = new Game(cpus(5), { seed: 4 });
        for (let seat = 0; seat < 5; seat++) {
            scoreCandidates(createGameView(game, seat), LEVELS.strong).forEach(({ command }) => {
                expect(game.validate(seat, command), JSON.stringify(command)).toBeNull();
            });
        }
    });

    it('ゆらぎのない CPU は、森の 3 匹目（+4 点）を川（+1 点）より高く見る', () => {
        // 王の座と島は埋まっている
        const game = setupGame({ parks: [park({ forest: 'tri tri', king: 'spino', island: 'brachio' }), park()], hands: ['tri', 'para'], die: 'woods', roller: 0, round: 2, turn: 6 });
        expect(chooseCommand(createGameView(game, 0), LEVELS.strong)).toEqual({ type: 'place', dino: 'tri', zone: 'forest' });
    });

    it('島と同じ種類を置いて島の点を失うより、ほかの恐竜を置く', () => {
        const game = setupGame({ parks: [park({ island: 'para', meadow: 'tri stego brachio spino trex' }), park()], hands: ['para tri', 'tri'], die: 'cafe', roller: 1, round: 2, turn: 5 });
        expect(chooseCommand(createGameView(game, 0), LEVELS.strong)).toMatchObject({ dino: 'tri' });
    });
});
