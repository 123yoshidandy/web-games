import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestServer } from 'netplay-kit/server/testing.js';
import Game, { CLOCK_PRESETS, resultText } from '../public/js/game.js';
import LocalGameController from '../public/js/game-controller.js';
import definition from '../server/src/game-definition.js';
import { decide, clockBudget, suggest } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { players, snapshot, at } from './helpers.js';

// localStorage の代わり（コントローラーが保存する）
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};

beforeEach(() => store.clear());
afterEach(() => vi.useRealTimers());

const mv = (sq) => ({ type: 'move', sq });
const timed = (clock = { main: 10000 }, size = 9) => new Game(players([false, false]), { size, clock });

describe('持ち時間（ゲーム）', () => {
    it('打った席の時計から、かかった時間を引く。記録に時間が残る', () => {
        const game = timed();
        expect(game.applyCommand(0, mv(at(9, 2, 2)), 3000)).toBe(true);
        expect(game.clock[0]).toEqual({ main: 7000, periods: 0 });
        expect(game.clockSeat()).toBe(1);
        expect(game.applyCommand(1, { type: 'pass' }, 1500)).toBe(true);
        expect(game.clock[1]).toEqual({ main: 8500, periods: 0 });
        expect(game.commands.map(c => c.ms)).toEqual([3000, 1500]);
    });

    it('秒読み：持ち時間を使い切ったら1手ごとに数え直し、超えた分だけ回数が減る', () => {
        const game = timed({ main: 1000, byoyomi: 5000, periods: 3 });
        game.applyCommand(0, mv(at(9, 2, 2)), 3000);
        expect(game.clock[0]).toEqual({ main: 0, periods: 3 });
        game.applyCommand(1, mv(at(9, 6, 6)), 500);
        // 秒読みの中で打てば、次の手も同じ秒読み
        expect(game.clockLimit()).toBe(15000);
        game.applyCommand(0, mv(at(9, 2, 6)), 4900);
        expect(game.clock[0]).toEqual({ main: 0, periods: 3 });
        game.applyCommand(1, { type: 'pass' }, 0);
        // 2回超えた
        game.applyCommand(0, mv(at(9, 6, 2)), 12000);
        expect(game.clock[0]).toEqual({ main: 0, periods: 1 });
        game.applyCommand(1, mv(at(9, 4, 4)), 0);
        expect(game.clockLimit()).toBe(5000);
        expect(game.isFlagged(4999)).toBe(false);
        expect(game.isFlagged(5000)).toBe(true);
    });

    it('死に石を決める段階では、どちらの時計も止まる', () => {
        const game = timed();
        game.applyCommand(0, { type: 'pass' }, 1000);
        game.applyCommand(1, { type: 'pass' }, 1000);
        expect(game.phase).toBe('scoring');
        expect(game.clockSeat()).toBe(null);
        expect(game.clockLimit()).toBe(null);
        expect(game.isFlagged(999999)).toBe(false);
        expect(game.applyCommand(1, { type: 'confirm' }, 999999)).toBe(true);
        expect(game.commands.at(-1).ms).toBe(0);
        expect(game.clock).toEqual([{ main: 9000, periods: 0 }, { main: 9000, periods: 0 }]);
        expect(createGameView(game, 0).clock.running).toBe(null);
        // 対局再開で、手番の人の時計がまた進む
        game.applyCommand(0, { type: 'resume' }, 0);
        expect(game.clockSeat()).toBe(game.current);
    });

    it('時間を使い切った操作は断り、時間切れで終える（相手の勝ち）', () => {
        const game = timed();
        expect(game.applyCommand(0, mv(at(9, 2, 2)), 10000)).toBe(false);
        expect(game.commands).toHaveLength(0);
        expect(game.timeout(0, 9999)).toBe(false);
        expect(game.timeout(1, 10000)).toBe(false);
        expect(game.timeout(0, 10000)).toBe(true);
        expect(game.result).toEqual({ winner: 1, reason: 'timeout', score: null });
        expect(resultText(game)).toBe('白の時間切れ勝ち');
        expect(game.commands.at(-1)).toEqual({ playerId: 0, command: { type: 'timeout' }, ms: 10000 });
        expect(game.events.at(-1)).toMatchObject({ type: 'end', winner: 1, reason: 'timeout' });
        expect(game.isOver()).toBe(true);
        expect(game.clockSeat()).toBe(null);
    });

    it('端末から timeout は送れない', () => {
        const game = timed();
        expect(game.applyCommand(0, { type: 'timeout' }, 20000)).toBe(false);
        expect(game.applyCommand(0, { type: 'timeout' })).toBe(false);
        expect(game.isOver()).toBe(false);
    });

    it('時計なしなら時間を見ず、記録に時間を残さない。オプションにも clock を入れない', () => {
        const game = new Game(players([false, false]), { size: 9 });
        expect(game.applyCommand(0, mv(at(9, 2, 2)), 999999)).toBe(true);
        expect(game.commands[0]).toEqual({ playerId: 0, command: mv(at(9, 2, 2)) });
        expect(game.clockSeat()).toBe(null);
        expect(game.options).toEqual({ size: 9, komi: 6.5, handicap: 0 });
        expect(createGameView(game, 0).clock).toBe(null);
    });

    it('選べる持ち時間：なし・切れ負け3つ・秒読み30秒×3が2つ', () => {
        // 「なし」が先頭（数字だけの名前は、オブジェクトの中で前に並んでしまうので使わない）
        expect(Object.keys(CLOCK_PRESETS)).toEqual(['none', '3m', '5m', '10m', '5m+30x3', '10m+30x3']);
        expect(CLOCK_PRESETS['5m+30x3'].clock).toEqual({ main: 300000, byoyomi: 30000, periods: 3 });
        const game = new Game(players([false, false]), { size: 9, clock: CLOCK_PRESETS['10m+30x3'].clock });
        expect(game.options.clock).toEqual({ main: 600000, byoyomi: 30000, periods: 3, increment: 0 });
        expect(game.clockLimit()).toBe(690000);
    });
});

describe('記録からの再現（持ち時間）', () => {
    it('かかった時間の記録から、時計と時間切れの終わりを同じに再現する', () => {
        const game = timed({ main: 2000, byoyomi: 3000, periods: 2 });
        [[at(9, 2, 2), 1200], [at(9, 6, 6), 800], [at(9, 2, 6), 4000], [at(9, 6, 2), 300]].forEach(([sq, ms]) => game.applyCommand(game.current, mv(sq), ms));
        game.timeout(0, game.clockLimit());
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
        expect(again.clock).toEqual(game.clock);
        expect(again.result).toEqual({ winner: 1, reason: 'timeout', score: null });
    });

    it('時間のない古い記録も再現できる（時計なし）', () => {
        const old = { players: players([false, false]), options: { size: 9 }, commands: [{ playerId: 0, command: mv(at(9, 2, 2)) }, { playerId: 1, command: { type: 'pass' } }] };
        const game = Game.replay(old.players, old.options, old.commands);
        expect(game.moveNumber).toBe(2);
        expect(game.clock).toBe(null);
    });

    it('時計ありで時間の欠けた記録は、0秒として読む', () => {
        const game = Game.replay(players([false, false]), { size: 9, clock: CLOCK_PRESETS['3m'].clock }, [{ playerId: 0, command: mv(at(9, 2, 2)) }]);
        expect(game.clock[0].main).toBe(180000);
    });
});

describe('持ち時間（ローカルのコントローラー）', () => {
    const setup = (cpu, clock = { main: 10000 }) => ({
        players: cpu ? [{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: 'easy' }] : [{ name: '黒' }, { name: '白' }],
        options: { size: 9, clock }
    });

    it('かかった時間を記録し、使い切ったらタイマーで時間切れになる', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(false));
        await vi.advanceTimersByTimeAsync(2500);
        expect(controller.send(mv(at(9, 2, 2)))).toBe(true);
        expect(controller.game.commands[0].ms).toBe(2500);
        expect(controller.game.clock[0].main).toBe(7500);
        await vi.advanceTimersByTimeAsync(9990);
        expect(controller.game.isOver()).toBe(false);
        await vi.advanceTimersByTimeAsync(100);
        expect(controller.game.result).toEqual({ winner: 0, reason: 'timeout', score: null });
        expect(controller.getView().clock.running).toBe(null);
        controller.stop();
    });

    it('使い切ったあとの操作は断り、時間切れで終える', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(false));
        // タイマーより先に操作が届いた形にする
        clearTimeout(controller.flagTimer);
        vi.setSystemTime(Date.now() + 10000);
        expect(controller.send(mv(at(9, 2, 2)))).toBe(false);
        expect(controller.game.result?.reason).toBe('timeout');
        expect(controller.game.commands.map(c => c.command.type)).toEqual(['timeout']);
        controller.stop();
    });

    it('CPU 戦では、隠れている間は時計が止まる', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(true));
        await vi.advanceTimersByTimeAsync(1000);
        controller.pause();
        expect(controller.getView().clockPaused).toBe(true);
        await vi.advanceTimersByTimeAsync(60000);
        expect(controller.game.isOver()).toBe(false);
        controller.resume();
        expect(controller.getView().clockPaused).toBe(false);
        expect(controller.elapsed()).toBe(1000);
        controller.send(mv(at(9, 2, 2)));
        expect(controller.game.commands[0].ms).toBe(1000);
        controller.stop();
    });

    it('2人で遊ぶときは、隠れても時計を止めない', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(false));
        controller.pause();
        expect(controller.getView().clockPaused).toBe(false);
        await vi.advanceTimersByTimeAsync(10100);
        expect(controller.game.result?.reason).toBe('timeout');
        controller.stop();
    });

    it('死に石を決める段階では、時計が止まり、時間切れにならない', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(false));
        controller.send({ type: 'pass' });
        controller.send({ type: 'pass' });
        expect(controller.game.phase).toBe('scoring');
        await vi.advanceTimersByTimeAsync(60000);
        expect(controller.game.isOver()).toBe(false);
        expect(controller.flagTimer).toBe(null);
        controller.stop();
    });

    it('CPU は残りの時間に合わせて考え、時間切れにならない（9路・4秒の切れ負けで30手）', async () => {
        // 本当の時計で動かす（考える時間も時計に入る）
        const controller = new LocalGameController({
            players: [{ name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'expert' }],
            options: { size: 9, clock: { main: 4000 } }
        });
        controller.scheduleCpu();
        const until = Date.now() + 25000;
        while (!controller.game.isOver() && controller.game.moveNumber < 30 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
        controller.stop();
        expect(controller.game.result?.reason).not.toBe('timeout');
        // 30手までに終わってもよい
        expect(controller.game.isOver() || controller.game.moveNumber >= 30).toBe(true);
        expect(controller.game.clock.every(side => side.main > 0)).toBe(true);
    }, 40000);
});

describe('持ち時間（CPU の考える時間）', () => {
    it('残りが少ないほど短く考え、19路でも止まらない', () => {
        const game = new Game(players([false, true]), { size: 19, clock: { main: 600000 } });
        const long = clockBudget(createGameView(game, 0));
        game.clock[0].main = 3000;
        const short = clockBudget(createGameView(game, 0));
        expect(long).toBeGreaterThan(short);
        expect(short).toBeLessThan(3000 * 0.25 + 1);
        const started = Date.now();
        expect(decide(createGameView(game, 0), 'expert')?.type).toBe('move');
        expect(Date.now() - started).toBeLessThan(1500);
    });

    it('時計なし・死に石を決める段階では、使える時間の決まりはない', () => {
        expect(clockBudget(createGameView(new Game(players([false, true]), { size: 9 }), 0))).toBe(null);
        const game = timed();
        game.applyCommand(0, { type: 'pass' }, 0);
        game.applyCommand(1, { type: 'pass' }, 0);
        expect(clockBudget(createGameView(game, 0))).toBe(null);
    });

    it('ヒントは、持ち時間に関係なく同じ手を返す', () => {
        const a = new Game(players([false, false]), { size: 9 });
        const b = timed({ main: 1000 });
        expect(suggest(b, 0)).toEqual(suggest(a, 0));
    });
});

describe('持ち時間（オンライン）', () => {
    const startRoom = async (clock = '3m') => {
        const server = createTestServer(definition);
        const clients = await server.createRoom(['くろ', 'しろ']);
        const [a, b] = clients;
        await a.send('setSettings', { settings: { clock } });
        await a.send('start');
        return { server, a, b, code: clients.code };
    };

    it('ロビーで持ち時間を選べ、ビューに残りの時間と手番の始まった時刻（サーバーの時刻）が入る', async () => {
        const { server, a, b } = await startRoom('5m+30x3');
        expect(b.last('lobby').settings).toEqual({ size: '9', clock: '5m+30x3' });
        const view = a.last('state').view;
        expect(view.clock).toEqual({
            config: { main: 300000, byoyomi: 30000, periods: 3, increment: 0 },
            sides: [{ main: 300000, periods: 3 }, { main: 300000, periods: 3 }],
            running: 0,
            startedAt: server.clock.now
        });
        server.clock.now += 4000;
        await a.send('command', { command: mv(at(9, 2, 2)) });
        const after = b.last('state').view.clock;
        expect(after.sides[0].main).toBe(296000);
        expect(after.running).toBe(1);
        expect(after.startedAt).toBe(server.clock.now);
    });

    it('相手が打たなくても、時計が0になったあとの ping で時間切れになる', async () => {
        const { server, a, b, code } = await startRoom('3m');
        await a.send('command', { command: mv(at(9, 2, 2)) });
        server.clock.now += 179999;
        await a.send('ping', { clientTime: 0 });
        expect(a.last('lobby').status).toBe('playing');
        server.clock.now += 1;
        await a.send('ping', { clientTime: 0 });
        expect(a.last('lobby').status).toBe('ended');
        const view = b.last('state').view;
        expect(view.result).toEqual({ winner: 0, reason: 'timeout', score: null });
        // 部屋に残る記録から、同じ終わりを再現できる
        const room = await server.store.getRoom(code);
        expect(definition.restore(structuredClone(room.game)).result).toEqual({ winner: 0, reason: 'timeout', score: null });
    });

    it('時間を過ぎてから届いた手は受けず、時間切れで終える', async () => {
        const { server, a } = await startRoom('3m');
        server.clock.now += 181000;
        await a.send('command', { command: mv(at(9, 2, 2)) });
        const view = a.last('state').view;
        expect(view.result).toEqual({ winner: 1, reason: 'timeout', score: null });
        expect(view.moveNumber).toBe(0);
    });

    it('対局中に抜けた人の席は、時計ごと CPU が引き継ぐ', async () => {
        const { server, a, b } = await startRoom('5m');
        await a.send('command', { command: mv(at(9, 2, 2)) });
        server.clock.now += 7000;
        await b.send('leave');
        const view = a.last('state').view;
        expect(view.moveNumber).toBe(2);   // CPU が白で打った
        expect(view.clock.sides[1].main).toBeLessThanOrEqual(293000);
        expect(view.clock.running).toBe(0);
        expect(view.clock.startedAt).toBeGreaterThanOrEqual(server.clock.now);
        // 人の手に CPU がすぐ答える
        server.clock.now += 1000;
        const free = view.board.findIndex((c, sq) => c === 0 && sq !== at(9, 4, 4));
        await a.send('command', { command: mv(free) });
        expect(a.last('state').view.moveNumber).toBeGreaterThanOrEqual(3);
    });
});
