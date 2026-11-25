import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalGameController, { loadSavedGame, clearSavedGame } from '../public/js/game-controller.js';
import { at } from './helpers.js';

// localStorage の代わり
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};

const cpuGame = (humanColor = 1, options = { size: 9 }) => {
    const players = [{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true, cpuLevel: 'easy' }];
    if (humanColor === 2) players.reverse();
    return { players, options };
};

describe('ローカル対戦のコントローラー', () => {
    beforeEach(() => {
        store.clear();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('人の番では CPU は動かず、人が打つと CPU が間を置いて打つ', () => {
        const c = new LocalGameController(cpuGame(), { onUpdate: () => {} });
        c.scheduleCpu();
        vi.advanceTimersByTime(2000);
        expect(c.game.moveNumber).toBe(0);
        expect(c.send({ type: 'move', sq: at(9, 4, 4) })).toBe(true);
        expect(c.game.moveNumber).toBe(1);
        vi.advanceTimersByTime(2000);
        expect(c.game.moveNumber).toBe(2);
        expect(c.getView().myTurn).toBe(true);
        c.stop();
    });

    it('白を選ぶと CPU が先に打つ。CPU の番には人の操作を断る', () => {
        const c = new LocalGameController(cpuGame(2));
        expect(c.send({ type: 'move', sq: 0 })).toBe(false);
        c.scheduleCpu();
        vi.advanceTimersByTime(2000);
        expect(c.game.moveNumber).toBe(1);
        expect(c.game.current).toBe(1);
        c.stop();
    });

    it('置き碁で人が白なら、人から打つ', () => {
        const c = new LocalGameController(cpuGame(2, { size: 9, handicap: 3, komi: 0.5 }));
        expect(c.getView().myTurn).toBe(true);
        expect(c.send({ type: 'move', sq: at(9, 4, 4) })).toBe(true);
        c.stop();
    });

    it('断られた操作はわけを知らせる', () => {
        const errors = [];
        const c = new LocalGameController(cpuGame(), { onError: (m) => errors.push(m) });
        c.send({ type: 'move', sq: at(9, 4, 4) });
        vi.advanceTimersByTime(2000);
        expect(c.send({ type: 'move', sq: at(9, 4, 4) })).toBe(false);
        expect(errors).toEqual(['そこには石があります']);
        c.stop();
    });

    it('待った：CPU 戦では、自分の手と CPU の手をまとめて戻す', () => {
        const c = new LocalGameController(cpuGame());
        expect(c.getView().canUndo).toBe(false);
        c.send({ type: 'move', sq: at(9, 4, 4) });
        vi.advanceTimersByTime(2000);
        c.send({ type: 'move', sq: at(9, 2, 2) });
        vi.advanceTimersByTime(2000);
        expect(c.game.moveNumber).toBe(4);
        expect(c.undo()).toBe(true);
        expect(c.game.moveNumber).toBe(2);
        expect(c.game.current).toBe(0);
        expect(c.undo()).toBe(true);
        expect(c.game.moveNumber).toBe(0);
        expect(c.undo()).toBe(false);
        c.stop();
    });

    it('2人で1台：手番の席から見て、確定は2人分まとめて行う。待ったは1手ずつ', () => {
        const c = new LocalGameController({ players: [{ name: '黒' }, { name: '白' }], options: { size: 9 } });
        expect(c.getView().you).toBe(0);
        c.send({ type: 'move', sq: at(9, 4, 4) });
        expect(c.getView().you).toBe(1);
        c.send({ type: 'pass' });
        c.send({ type: 'pass' });
        expect(c.game.phase).toBe('scoring');
        expect(c.send({ type: 'confirm' })).toBe(true);
        expect(c.game.isOver()).toBe(true);
        // 終わったあとの待ったは、最後のパスとその後の確定を戻す
        expect(c.undo()).toBe(true);
        expect(c.game.phase).toBe('play');
        expect(c.game.moveNumber).toBe(2);
        c.stop();
    });

    it('CPU 戦の終局：人がパスし CPU もパスしたら、死に石を決め、人の確定で終わる', () => {
        const c = new LocalGameController(cpuGame());
        c.send({ type: 'move', sq: at(9, 4, 4) });
        vi.advanceTimersByTime(2000);
        // 黒（人）だけが打った盤で、白（CPU）がパスに応じるかどうかは局面しだい。ここでは記録を直接作る
        c.game.applyCommand(0, { type: 'pass' });
        c.game.applyCommand(1, { type: 'pass' });
        c.afterChange();
        vi.advanceTimersByTime(2000);
        expect(c.game.phase).toBe('scoring');
        expect(c.game.agreed[1]).toBe(true);
        expect(c.send({ type: 'confirm' })).toBe(true);
        expect(c.game.isOver()).toBe(true);
        expect(loadSavedGame()).toBe(null);
        c.stop();
    });

    it('投了は人の側で行う（CPU 戦では CPU の番でもできる）', () => {
        const c = new LocalGameController(cpuGame(2));
        expect(c.send({ type: 'resign' })).toBe(true);
        expect(c.game.isOver()).toBe(true);
        expect(c.game.winner).toBe(0);
        c.stop();
    });

    it('操作のたびに保存し、続きから再現できる。決着したら消える', () => {
        const c = new LocalGameController(cpuGame());
        c.send({ type: 'move', sq: at(9, 4, 4) });
        vi.advanceTimersByTime(2000);
        const saved = loadSavedGame();
        expect(saved.commands.length).toBe(2);
        c.stop();
        const resumed = new LocalGameController(saved);
        expect(resumed.game.board).toEqual(c.game.board);
        expect(resumed.game.moveNumber).toBe(2);
        resumed.send({ type: 'resign' });
        expect(loadSavedGame()).toBe(null);
        clearSavedGame();
        resumed.stop();
    });
});
