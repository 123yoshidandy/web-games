import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalGameController from '../public/js/game-controller.js';

afterEach(() => vi.useRealTimers());

const vsCpu = (humanSeat = 0, level = 'easy') => {
    const players = [{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: level }];
    if (humanSeat === 1) players.reverse();
    return { players, options: {} };
};
const twoPlayers = () => ({ players: [{ name: '白' }, { name: '黒' }], options: {} });
const mv = (uci) => ({ type: 'move', from: uci.slice(0, 2), to: uci.slice(2, 4) });
const firstMove = (controller) => {
    const m = controller.getView().moves[0];
    return m.promo ? { type: 'move', ...m } : { type: 'move', from: m.from, to: m.to };
};

describe('CPU 戦のコントローラー', () => {
    it('CPU は間を置いて指し、人の番で止まる。考えている間は thinking', async () => {
        vi.useFakeTimers();
        let resolveThink;
        const controller = new LocalGameController(vsCpu(0), {}, {
            decider: () => new Promise(resolve => { resolveThink = resolve; })
        });
        expect(controller.send(mv('e2e4'))).toBe(true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(controller.getView().thinking).toBe(true);
        expect(controller.getView().moving).toBe(false);
        resolveThink({ type: 'move', from: 'e7', to: 'e5' });
        await vi.advanceTimersByTimeAsync(0);
        expect(controller.game.commands).toHaveLength(2);
        expect(controller.getView().thinking).toBe(false);
        expect(controller.getView().myTurn).toBe(true);
        controller.stop();
    });

    it('黒を選ぶと、CPU（白）が先に指す', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(1));
        expect(controller.getView().you).toBe(1);
        expect(controller.getView().myTurn).toBe(false);
        controller.scheduleCpu();
        await vi.advanceTimersByTimeAsync(2000);
        expect(controller.game.commands.map(c => c.playerId)).toEqual([0]);
        expect(controller.getView().myTurn).toBe(true);
        // まだ自分の手がないので、待ったはできない
        expect(controller.getView().canUndo).toBe(false);
        expect(controller.undo()).toBe(false);
        controller.stop();
    });

    it('人の番でない操作と動かせない手は断り、onError で知らせる', async () => {
        vi.useFakeTimers();
        const errors = [];
        const controller = new LocalGameController(vsCpu(0), { onError: (m) => errors.push(m) });
        expect(controller.send(mv('e2e5'))).toBe(false);
        expect(errors).toHaveLength(1);
        controller.send(mv('e2e4'));
        // CPU の番に人が指そうとしても受け付けない
        expect(controller.send(mv('e7e5'))).toBe(false);
        controller.stop();
    });

    it('CPU の答えが間に合わない間に待ったをすると、その答えは捨てる', async () => {
        vi.useFakeTimers();
        const resolvers = [];
        const controller = new LocalGameController(vsCpu(0), {}, { decider: () => new Promise(r => resolvers.push(r)) });
        controller.send(mv('e2e4'));
        await vi.advanceTimersByTimeAsync(1000);
        expect(resolvers).toHaveLength(1);
        expect(controller.undo()).toBe(true);
        resolvers[0]({ type: 'move', from: 'e7', to: 'e5' });
        await vi.advanceTimersByTimeAsync(1000);
        expect(controller.game.commands).toHaveLength(0);
        expect(controller.getView().myTurn).toBe(true);
        controller.stop();
    });

    it('待ったで、自分の直前の手とそのあとの CPU の手をまとめて戻す', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        controller.send(mv('e2e4'));
        await vi.advanceTimersByTimeAsync(2000);
        const fen2 = controller.game.pos.fen();
        controller.send(firstMove(controller));
        await vi.advanceTimersByTimeAsync(2000);
        expect(controller.game.commands).toHaveLength(4);
        expect(controller.undo()).toBe(true);
        expect(controller.game.commands).toHaveLength(2);
        expect(controller.game.pos.fen()).toBe(fen2);
        expect(controller.undo()).toBe(true);
        expect(controller.game.commands).toHaveLength(0);
        expect(controller.getView().canUndo).toBe(false);
        controller.stop();
    });

    it('引き分けの提案に CPU が答える。断られたら自分の番に戻る', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0, 'normal'));
        expect(controller.send({ type: 'offerDraw' })).toBe(true);
        expect(controller.getView().myTurn).toBe(false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(controller.game.commands.at(-1).command.type).toBe('declineDraw');
        const view = controller.getView();
        expect(view.myTurn).toBe(true);
        expect(view.canOfferDraw).toBe(false);
        controller.stop();
    });

    it('投了したあとも、待ったで戻せる', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        controller.send(mv('e2e4'));
        await vi.advanceTimersByTimeAsync(2000);
        expect(controller.send({ type: 'resign' })).toBe(true);
        expect(controller.game.result).toEqual({ winner: 1, reason: 'resign' });
        expect(controller.undo()).toBe(true);
        expect(controller.game.isOver()).toBe(false);
        expect(controller.game.commands).toHaveLength(2);
        controller.stop();
    });

    it('保存した記録から、同じ状態で再開できる', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        for (let i = 0; i < 4; i++) {
            controller.send(firstMove(controller));
            await vi.advanceTimersByTimeAsync(2000);
        }
        controller.stop();
        const saved = JSON.parse(JSON.stringify(controller.game.persist()));
        const resumed = new LocalGameController(saved);
        expect(JSON.stringify(resumed.getView())).toBe(JSON.stringify(controller.getView()));
        resumed.stop();
    });

    it('CPU が例外を出しても止まらず、最初の合法手で進める', async () => {
        vi.useFakeTimers();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const controller = new LocalGameController(vsCpu(0), {}, { decider: () => Promise.reject(new Error('壊れた')) });
        controller.send(mv('e2e4'));
        await vi.advanceTimersByTimeAsync(2000);
        expect(controller.game.commands).toHaveLength(2);
        expect(controller.getView().myTurn).toBe(true);
        spy.mockRestore();
        controller.stop();
    });
});

describe('2人で1台を使う対戦', () => {
    it('操作を待っている人の席から見て、交互に指せる。CPU は動かない', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(twoPlayers());
        for (let i = 0; i < 6; i++) {
            const view = controller.getView();
            expect(view.you).toBe(controller.game.current);
            expect(view.myTurn).toBe(true);
            expect(controller.send(firstMove(controller))).toBe(true);
            await vi.advanceTimersByTimeAsync(2000);
        }
        expect(controller.game.commands.map(c => c.playerId)).toEqual([0, 1, 0, 1, 0, 1]);
        controller.stop();
    });

    it('引き分けの提案は、相手の席から答える', () => {
        const controller = new LocalGameController(twoPlayers());
        controller.send({ type: 'offerDraw' });
        const view = controller.getView();
        expect(view.you).toBe(1);
        expect(view.drawOffer).toBe(0);
        expect(view.myTurn).toBe(true);
        expect(view.moving).toBe(false);
        expect(controller.send({ type: 'acceptDraw' })).toBe(true);
        expect(controller.game.result.reason).toBe('agreement');
        controller.stop();
    });

    it('待ったは1手ずつ戻す', () => {
        const controller = new LocalGameController(twoPlayers());
        controller.send(mv('e2e4'));
        controller.send(mv('e7e5'));
        const fen = controller.game.pos.fen();
        controller.send(mv('g1f3'));
        expect(controller.undo()).toBe(true);
        expect(controller.game.commands).toHaveLength(2);
        expect(controller.game.pos.fen()).toBe(fen);
        controller.stop();
    });
});
