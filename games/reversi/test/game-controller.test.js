import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';

afterEach(() => vi.useRealTimers());

const vsCpu = (humanSeat = 0, level = 'normal') => {
    const players = [{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: level }];
    if (humanSeat === 1) players.reverse();
    return { players, options: {} };
};
const twoPlayers = () => ({ players: [{ name: '黒' }, { name: '白' }], options: {} });
const firstMove = (controller) => ({ type: 'move', sq: controller.getView().moves[0] });

describe('CPU 戦のコントローラー', () => {
    it('CPU は間を置いて打ち、人の番で止まる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        expect(controller.send(firstMove(controller))).toBe(true);
        expect(controller.game.current).toBe(1);
        vi.advanceTimersByTime(10000);
        expect(controller.game.current).toBe(0);
        expect(controller.game.commands).toHaveLength(2);
        expect(controller.getView().myTurn).toBe(true);
        controller.stop();
    });

    it('白を選ぶと、CPU（黒）が先に打つ', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(1));
        expect(controller.getView().you).toBe(1);
        expect(controller.getView().myTurn).toBe(false);
        controller.scheduleCpu();
        vi.advanceTimersByTime(5000);
        expect(controller.game.commands.map(c => c.playerId)).toEqual([0]);
        expect(controller.getView().myTurn).toBe(true);
        // まだ自分の手がないので、待ったはできない
        expect(controller.getView().canUndo).toBe(false);
        expect(controller.undo()).toBe(false);
        controller.stop();
    });

    it('人の番でない操作と置けないマスは断り、onError で知らせる', () => {
        const errors = [];
        const controller = new LocalGameController(vsCpu(0), { onError: (m) => errors.push(m) });
        expect(controller.send({ type: 'move', sq: 0 })).toBe(false);
        expect(errors).toHaveLength(1);
        expect(controller.game.commands).toHaveLength(0);
        controller.send(firstMove(controller));
        // CPU の番に人が打とうとしても受け付けない
        expect(controller.send({ type: 'move', sq: controller.game.moves()[0] })).toBe(false);
        controller.stop();
    });

    it('待ったで、自分の直前の手とそのあとの CPU の手をまとめて戻す', () => {
        vi.useFakeTimers();
        const updates = [];
        const controller = new LocalGameController(vsCpu(0), { onUpdate: () => updates.push(1) });
        expect(controller.getView().canUndo).toBe(false);
        controller.send(firstMove(controller));
        vi.advanceTimersByTime(5000);
        const board2 = JSON.stringify(controller.game.board);
        controller.send(firstMove(controller));
        vi.advanceTimersByTime(5000);
        expect(controller.game.commands).toHaveLength(4);
        expect(controller.getView().canUndo).toBe(true);
        expect(controller.undo()).toBe(true);
        expect(controller.game.commands).toHaveLength(2);
        expect(JSON.stringify(controller.game.board)).toBe(board2);
        expect(controller.getView().myTurn).toBe(true);
        // CPU の番の途中（考える前）に戻しても、CPU は打たない
        controller.send(firstMove(controller));
        controller.undo();
        vi.advanceTimersByTime(5000);
        expect(controller.game.commands).toHaveLength(2);
        expect(controller.undo()).toBe(true);
        expect(controller.game.commands).toHaveLength(0);
        expect(controller.getView().canUndo).toBe(false);
        expect(updates.length).toBeGreaterThan(0);
        controller.stop();
    });

    it('終わったあとでも待ったで戻せる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0, 'easy'));
        for (let i = 0; i < 80 && !controller.game.isOver(); i++) {
            if (controller.getView().myTurn) controller.send(firstMove(controller));
            vi.advanceTimersByTime(1000);
        }
        expect(controller.game.isOver()).toBe(true);
        expect(controller.undo()).toBe(true);
        expect(controller.game.isOver()).toBe(false);
        expect(controller.getView().myTurn).toBe(true);
        controller.stop();
    });

    it('保存した記録から、同じ状態で再開できる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        for (let i = 0; i < 5; i++) {
            controller.send(firstMove(controller));
            vi.advanceTimersByTime(5000);
        }
        controller.stop();
        const saved = JSON.parse(JSON.stringify(controller.game.persist()));
        const resumed = new LocalGameController(saved);
        expect(JSON.stringify(resumed.getView())).toBe(JSON.stringify(controller.getView()));
        resumed.stop();
    });
});

describe('2人で1台を使う対戦', () => {
    it('手番の人の席から見て、交互に打てる。CPU は動かない', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(twoPlayers());
        for (let i = 0; i < 6; i++) {
            const view = controller.getView();
            expect(view.you).toBe(controller.game.current);
            expect(view.myTurn).toBe(true);
            expect(controller.send(firstMove(controller))).toBe(true);
            vi.advanceTimersByTime(5000);
        }
        expect(controller.game.commands.map(c => c.playerId)).toEqual([0, 1, 0, 1, 0, 1]);
        controller.stop();
    });

    it('待ったは1手ずつ戻す', () => {
        const controller = new LocalGameController(twoPlayers());
        controller.send(firstMove(controller));
        controller.send(firstMove(controller));
        const board1 = JSON.stringify(controller.game.board);
        controller.send(firstMove(controller));
        expect(controller.undo()).toBe(true);
        expect(controller.game.commands).toHaveLength(2);
        expect(JSON.stringify(controller.game.board)).toBe(board1);
        expect(controller.game.current).toBe(0);
        controller.stop();
    });
});
