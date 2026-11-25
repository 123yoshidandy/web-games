import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import LocalGameController, { loadSavedGame } from '../public/js/game-controller.js';
import { sqOf } from '../public/js/rules.js';

// localStorage の代わり（node には localStorage がない）
beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };
});
afterEach(() => {
    vi.useRealTimers();
    delete globalThis.localStorage;
});

const vsCpu = (humanSeat = 0, level = 'easy') => {
    const players = [{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: level }];
    if (humanSeat === 1) players.reverse();
    return { players, options: {} };
};
const twoPlayers = () => ({ players: [{ name: '先手' }, { name: '後手' }], options: {} });
const pawn76 = { type: 'move', from: sqOf(7, 7), to: sqOf(7, 6), promote: false };

describe('CPU 戦のコントローラー', () => {
    it('CPU は間を置いて指し、人の番で止まる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        expect(controller.send(pawn76)).toBe(true);
        expect(controller.game.current).toBe(1);
        vi.advanceTimersByTime(10000);
        expect(controller.game.commands.map(c => c.playerId)).toEqual([0, 1]);
        expect(controller.getView().myTurn).toBe(true);
        controller.stop();
    });

    it('後手を選ぶと、CPU（先手）が先に指し、盤は後手の席から見る', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(1));
        expect(controller.getView().you).toBe(1);
        expect(controller.getView().myTurn).toBe(false);
        controller.scheduleCpu();
        vi.advanceTimersByTime(5000);
        expect(controller.game.commands.map(c => c.playerId)).toEqual([0]);
        expect(controller.getView().myTurn).toBe(true);
        expect(controller.getView().canUndo).toBe(false);
        expect(controller.undo()).toBe(false);
        controller.stop();
    });

    it('CPU の番には人の手を受け付けない', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(1));
        expect(controller.send(pawn76)).toBe(false);
        controller.stop();
    });

    it('待った：自分の手とそのあとの CPU の手をまとめて戻す', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        controller.send(pawn76);
        vi.advanceTimersByTime(5000);
        expect(controller.game.ply).toBe(2);
        expect(controller.undo()).toBe(true);
        expect(controller.game.ply).toBe(0);
        expect(controller.getView().canUndo).toBe(false);
        controller.stop();
    });

    it('投了すると CPU の勝ちで終わり、保存は消える。待ったで投了を取り消せる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        controller.send(pawn76);
        vi.advanceTimersByTime(5000);
        expect(loadSavedGame()).not.toBe(null);
        expect(controller.send({ type: 'resign' })).toBe(true);
        expect([controller.game.winner, controller.game.reason]).toEqual([1, 'resign']);
        expect(loadSavedGame()).toBe(null);
        expect(controller.undo()).toBe(true);
        expect(controller.game.isOver()).toBe(false);
        expect(controller.game.ply).toBe(2);
        controller.stop();
    });

    it('続きから：保存した記録から同じ局面を作り直す', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        controller.send(pawn76);
        vi.advanceTimersByTime(5000);
        controller.stop();
        const saved = loadSavedGame();
        expect(saved.commands).toHaveLength(2);
        const resumed = new LocalGameController(saved);
        expect(resumed.game.pos.toSfen()).toBe(controller.game.pos.toSfen());
        expect(resumed.getView().myTurn).toBe(true);
        resumed.stop();
    });
});

describe('2人で1台を使う対局', () => {
    it('手番の人の席から見て、1手ずつ戻せる', () => {
        const controller = new LocalGameController(twoPlayers());
        expect(controller.getView().twoPlayers).toBe(true);
        controller.send(pawn76);
        expect(controller.getView().you).toBe(1);
        expect(controller.getView().myTurn).toBe(true);
        controller.send({ type: 'move', from: sqOf(3, 3), to: sqOf(3, 4), promote: false });
        expect(controller.undo()).toBe(true);
        expect(controller.game.ply).toBe(1);
        // 投了は手番の人
        expect(controller.send({ type: 'resign' })).toBe(true);
        expect(controller.game.winner).toBe(0);
    });
});

// 画面と別のスレッドで考える流れ（Worker の代わりに、送られた依頼をためて、テストから返事を返す）
describe('Web Worker で考える', () => {
    let workers;
    beforeEach(() => {
        workers = [];
        globalThis.Worker = class {
            constructor(url, options) {
                this.url = String(url);
                this.options = options;
                this.listeners = {};
                this.posted = [];
                this.terminated = false;
                workers.push(this);
            }
            addEventListener(type, fn) { this.listeners[type] = fn; }
            postMessage(data) { this.posted.push(structuredClone(data)); }
            terminate() { this.terminated = true; }
            reply(data) { this.listeners.message({ data }); }
        };
    });
    afterEach(() => { delete globalThis.Worker; });

    it('依頼を送り、返事の手を指す。考えている間も人の操作（投了）を受け付ける', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        controller.send(pawn76);
        vi.advanceTimersByTime(1000);
        const worker = workers[0];
        expect(worker.url).toMatch(/cpu-worker\.js$/);
        expect(worker.options).toEqual({ type: 'module' });
        const { id, saved, level } = worker.posted[0];
        expect([saved.commands.length, level]).toEqual([1, 'easy']);
        expect(controller.game.ply).toBe(1);
        worker.reply({ id, command: { type: 'move', from: sqOf(3, 3), to: sqOf(3, 4), promote: false } });
        expect(controller.game.logs).toEqual(['▲７六歩', '△３四歩']);
        // 次の CPU の番で考えている間に投了できる。考え中の Worker は止める
        controller.send({ type: 'move', from: sqOf(2, 7), to: sqOf(2, 6), promote: false });
        vi.advanceTimersByTime(1000);
        expect(workers[0].posted).toHaveLength(2);
        expect(controller.send({ type: 'resign' })).toBe(true);
        expect(workers[0].terminated).toBe(true);
        expect(controller.game.reason).toBe('resign');
        controller.stop();
    });

    it('待ったで取り消した依頼の返事は捨てる', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        controller.send(pawn76);
        vi.advanceTimersByTime(1000);
        const { id } = workers[0].posted[0];
        expect(controller.undo()).toBe(true);
        expect(workers[0].terminated).toBe(true);
        workers[0].reply({ id, command: { type: 'move', from: sqOf(3, 3), to: sqOf(3, 4), promote: false } });
        expect(controller.game.ply).toBe(0);
        expect(controller.getView().myTurn).toBe(true);
        controller.stop();
    });

    it('Worker がエラーになったら、その場で考えて続ける', () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(vsCpu(0));
        controller.send(pawn76);
        vi.advanceTimersByTime(1000);
        workers[0].listeners.error({ message: 'failed', preventDefault() {} });
        expect(controller.game.ply).toBe(2);
        // 次からは Worker を作らない
        controller.send({ type: 'move', from: sqOf(2, 7), to: sqOf(2, 6), promote: false });
        vi.advanceTimersByTime(1000);
        expect(controller.game.ply).toBe(4);
        expect(workers).toHaveLength(1);
        controller.stop();
    });
});
