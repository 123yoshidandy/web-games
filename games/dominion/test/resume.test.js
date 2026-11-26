import { describe, it, expect, beforeEach } from 'vitest';
import GameController, { loadSavedGame, clearSavedGame } from '../public/js/game-controller.js';
import { createGameView } from '../public/js/game-view.js';

// ブラウザの localStorage の代わり
beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key)
    };
});

const players = [{ name: 'CPU1', isCPU: true }, { name: 'CPU2', isCPU: true }];

describe('続きから', () => {
    it.each([false, true])('途中で保存した記録から、同じ局面に戻る（リアルタイム: %s）', (realtime) => {
        const controller = new GameController();
        controller.initGame(players, { cardSets: ['base'], realtime });
        for (let i = 0; i < 80 && controller.hasCpuWork(); i++) controller.runCpuStep();

        const saved = loadSavedGame();
        expect(saved.commands.length).toBe(controller.game.commands.length);

        const resumed = new GameController();
        expect(resumed.resumeGame(saved)).toBe(true);
        expect(createGameView(resumed.game, 0)).toEqual(createGameView(controller.game, 0));

        // 続けても、元のゲームと同じに進む
        for (let i = 0; i < 20; i++) {
            controller.runCpuStep();
            resumed.runCpuStep();
        }
        expect(createGameView(resumed.game, 1)).toEqual(createGameView(controller.game, 1));
    });

    it('終わったゲームは保存を消す', () => {
        const controller = new GameController();
        controller.initGame(players, { cardSets: ['base'] });
        for (let i = 0; i < 20000 && controller.game.phase !== 'end'; i++) controller.runCpuStep();
        expect(controller.game.phase).toBe('end');
        expect(loadSavedGame()).toBeNull();
    });

    it('再現できない記録は消して false を返す', () => {
        const controller = new GameController();
        controller.initGame(players, { cardSets: ['base'] });
        const saved = { ...loadSavedGame(), commands: [{ playerId: 1, type: 'endTurn' }, { playerId: 1, type: 'endTurn' }] };
        expect(controller.resumeGame(saved)).toBe(false);
        expect(loadSavedGame()).toBeNull();
        clearSavedGame();
    });
});
