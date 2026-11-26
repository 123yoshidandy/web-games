import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import LocalGameController, { loadSavedGame, clearSavedGame } from '../public/js/game-controller.js';
import { chooseLeveledCommand, runLeveledCpuStep } from '../public/js/cpu-level.js';
import Game from '../public/js/game.js';

// Node には localStorage がないので、中身を Map に持つ代わりを置く
function stubLocalStorage() {
    const store = new Map();
    vi.stubGlobal('localStorage', {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key)
    });
    return store;
}

const PLAYERS = [{ name: 'あなた', isCPU: false }, { name: 'CPU1', isCPU: true }];

// 人間の番で、受け付けられる手を1つ打つ（引いて、置けなければ場に出す）
function playHumanTurn(controller) {
    const view = controller.getView();
    if (!view.holding) return controller.send({ type: 'draw' });
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            if (controller.send({ type: 'place', row, col })) return true;
        }
    }
    return controller.send({ type: 'discard' });
}

describe('続きから', () => {
    let store;
    beforeEach(() => {
        store = stubLocalStorage();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('操作のたびに保存し、記録から同じ局面に戻る', () => {
        const controller = new LocalGameController({ players: PLAYERS, level: 'easy' });
        for (let i = 0; i < 12 && controller.game.phase === 'play'; i++) {
            if (controller.game.getCurrentPlayer().isCPU) vi.runOnlyPendingTimers();
            else playHumanTurn(controller);
        }
        controller.stop();
        const saved = loadSavedGame();
        expect(saved.commands.length).toBe(controller.game.commands.length);
        expect(saved.level).toBe('easy');

        const resumed = new LocalGameController(saved);
        resumed.stop();
        expect(resumed.level).toBe('easy');
        expect(resumed.game.players.map(p => p.garden)).toEqual(controller.game.players.map(p => p.garden));
        expect(resumed.game.pool).toEqual(controller.game.pool);
        expect(resumed.game.table).toEqual(controller.game.table);
        expect(resumed.game.holding).toEqual(controller.game.holding);
        expect(resumed.game.currentPlayerIndex).toBe(controller.game.currentPlayerIndex);
    });

    it('再開したあと、CPU の番なら CPU が続きを打つ', () => {
        const first = new LocalGameController({ players: PLAYERS });
        first.stop();
        // CPU の番になるまで人間が打つ
        while (!first.game.getCurrentPlayer().isCPU) playHumanTurn(first);
        const resumed = new LocalGameController(loadSavedGame());
        const before = resumed.game.commands.length;
        vi.runOnlyPendingTimers();
        expect(resumed.game.commands.length).toBe(before + 1);
        resumed.stop();
    });

    it('終わったゲームは保存から消える', () => {
        const controller = new LocalGameController({ players: PLAYERS.map(p => ({ ...p, isCPU: true })) });
        for (let i = 0; i < 2000 && controller.game.phase === 'play'; i++) vi.runOnlyPendingTimers();
        expect(controller.game.phase).toBe('end');
        expect(loadSavedGame()).toBeNull();
    });

    it('壊れた保存は読まない', () => {
        store.set('lucky-numbers.save', '{"players":');
        expect(loadSavedGame()).toBeNull();
        store.set('lucky-numbers.save', JSON.stringify({ players: PLAYERS }));
        expect(loadSavedGame()).toBeNull();
        clearSavedGame();
        expect(store.has('lucky-numbers.save')).toBe(false);
    });
});

describe('CPU の強さ', () => {
    it('同じ局面では同じ手を選ぶ（やさしいも決定的）', () => {
        const a = new Game(PLAYERS.map(p => ({ ...p, isCPU: true })), { seed: 7 });
        const b = new Game(PLAYERS.map(p => ({ ...p, isCPU: true })), { seed: 7 });
        for (let i = 0; i < 40 && a.phase === 'play'; i++) {
            expect(chooseLeveledCommand(a, 'easy')).toEqual(chooseLeveledCommand(b, 'easy'));
            runLeveledCpuStep(a, 'easy');
            runLeveledCpuStep(b, 'easy');
        }
    });

    it.each(['easy', 'normal'])('%s の CPU だけで最後まで進む', (level) => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = new Game([1, 2, 3].map(i => ({ name: `CPU${i}`, isCPU: true })), { seed });
            let steps = 0;
            while (game.phase === 'play' && steps < 2000) {
                expect(runLeveledCpuStep(game, level)).toBe(true);
                steps++;
            }
            expect(game.phase).toBe('end');
        }
    });
});
