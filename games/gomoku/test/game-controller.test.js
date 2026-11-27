import { describe, it, expect, beforeEach } from 'vitest';
import LocalGameController, { loadSavedGame } from '../public/js/game-controller.js';
import { at, mv } from './helpers.js';

const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};
beforeEach(() => store.clear());

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const cpuSetup = (black = 0) => ({ players: [{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: 'normal' }], options: { size: 15, seed: 5, black } });

describe('ローカルの対局（コントローラー）', () => {
    it('人が打つと CPU が答え、また人の番で止まる。保存の名前は gomoku.save', async () => {
        const controller = new LocalGameController(cpuSetup());
        expect(controller.send(mv(at(15, 7, 7)))).toBe(true);
        await wait(700);
        expect(controller.game.moveNumber).toBe(2);
        expect(controller.getView().myTurn).toBe(true);
        expect(loadSavedGame().commands).toHaveLength(2);
        expect(store.has('gomoku.save')).toBe(true);
        controller.stop();
    });

    it('白を選ぶと CPU（黒）から打つ', async () => {
        const controller = new LocalGameController(cpuSetup(1));
        controller.scheduleCpu();
        await wait(700);
        expect(controller.game.moveNumber).toBe(1);
        expect(controller.game.board[at(15, 7, 7)]).toBe(1);
        controller.stop();
    });

    it('待ったで、人の手と CPU の答えをまとめて戻す', async () => {
        const controller = new LocalGameController(cpuSetup());
        controller.send(mv(at(15, 7, 7)));
        await wait(700);
        controller.send(mv(at(15, 8, 8)));
        await wait(700);
        expect(controller.game.moveNumber).toBe(4);
        expect(controller.undo()).toBe(true);
        expect(controller.game.moveNumber).toBe(2);
        expect(controller.getView().canUndo).toBe(true);
        controller.undo();
        expect(controller.game.moveNumber).toBe(0);
        expect(controller.getView().canUndo).toBe(false);
        expect(controller.undo()).toBe(false);
        controller.stop();
    });

    it('2人で1台：手番の人が打ち、投了は手番の人', () => {
        const controller = new LocalGameController({ players: [{ name: '黒' }, { name: '白' }], options: { size: 10, black: 0 } });
        controller.send(mv(at(10, 4, 4)));
        expect(controller.getView().you).toBe(1);
        controller.send({ type: 'resign' });
        expect(controller.game.result).toMatchObject({ winner: 0, reason: 'resign' });
        expect(loadSavedGame()).toBe(null);
        controller.stop();
    });

    it('続きから：保存した記録から同じ局面になる', () => {
        const first = new LocalGameController({ players: [{ name: '黒' }, { name: '白' }], options: { size: 15, black: 0 } });
        [at(15, 7, 7), at(15, 7, 8), at(15, 8, 8)].forEach(sq => first.send(mv(sq)));
        first.stop();
        const second = new LocalGameController(loadSavedGame());
        expect(second.game.board).toEqual(first.game.board);
        expect(second.game.current).toBe(1);
        second.stop();
    });

    it('打てない点はエラーを知らせる', () => {
        const errors = [];
        const controller = new LocalGameController({ players: [{ name: '黒' }, { name: '白' }], options: { black: 0 } }, { onError: (m) => errors.push(m) });
        controller.send(mv(0));
        expect(controller.send(mv(0))).toBe(false);
        expect(errors).toEqual(['そこには石があります']);
        controller.stop();
    });
});
