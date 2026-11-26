import { describe, it, expect } from 'vitest';
import Game, { GODS } from '../public/js/game.js';
import { suggest, runCpuStep } from '../public/js/cpu-player.js';

const newGame = (n, seed, gods = null) => new Game(Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: i > 0 })), { seed, gods });
// 速く回すための浅い読み（神の力で手の組み合わせが多いヘルメス・ヘパイストスは、2手先まで読むと1局に数十秒かかる）
const FAST = { depth: 1, noise: 0 };

describe('ヒント', () => {
    it('人がおすすめの1歩だけを打っても、手が通って最後まで進む', () => {
        // 神なしの2人は、画面と同じ読み（ふつう）で。ほかは浅い読みで、神の力ごとの手が通るかを見る
        const cases = [[2, null, undefined], [3, null, FAST], ...GODS.map(god => [2, [god, 'random'], FAST])];
        cases.forEach(([n, gods, profile], k) => {
            const game = newGame(n, k + 1, gods);
            for (let step = 0; step < 2000 && !game.isOver(); step++) {
                if (game.current === 0) {
                    const command = suggest(game, 0, profile);
                    expect(command).toBeTruthy();
                    expect(game.applyCommand(0, command), `${JSON.stringify(gods)} ${JSON.stringify(command)}`).toBe(true);
                } else runCpuStep(game, game.current, profile);
            }
            expect(game.isOver()).toBe(true);
        });
    });

    it('人の番でなければ出さない', () => {
        const game = newGame(2, 1);
        expect(suggest(game, 1 - game.current)).toBeNull();
    });
});
