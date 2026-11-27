import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createTestServer } from 'netplay-kit/server/testing.js';
import Game, { CLOCK_PRESETS, clockOption } from '../public/js/game.js';
import LocalGameController from '../public/js/game-controller.js';
import definition from '../server/src/game-definition.js';
import { decide, clockBudget } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { sqOf } from '../public/js/rules.js';
import { players, move, snapshot } from './helpers.js';

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

// よく使う手（先手：7六歩・2六歩・6八銀、後手：3四歩・8四歩）
const P76 = move(sqOf(7, 7), sqOf(7, 6));
const P26 = move(sqOf(2, 7), sqOf(2, 6));
const S68 = move(sqOf(7, 9), sqOf(6, 8));
const P34 = move(sqOf(3, 3), sqOf(3, 4));
const P84 = move(sqOf(8, 3), sqOf(8, 4));

const twoHumans = () => players([false, false]);
const timed = (clock = { main: 10000, byoyomi: 5000, periods: 1 }) => new Game(twoHumans(), { clock });

describe('持ち時間（ゲーム）', () => {
    it('指した側の時計から、かかった時間を引く。記録に時間が残る', () => {
        const game = timed({ main: 10000 });
        expect(game.options.clock).toEqual({ main: 10000, byoyomi: 0, periods: 0, increment: 0 });
        expect(game.applyCommand(0, P76, 3000)).toBe(true);
        expect(game.clock[0]).toEqual({ main: 7000, periods: 0 });
        expect(game.clockSeat()).toBe(1);
        expect(game.applyCommand(1, P34, 1500)).toBe(true);
        expect(game.clock[1]).toEqual({ main: 8500, periods: 0 });
        expect(game.commands.map(c => c.ms)).toEqual([3000, 1500]);
    });

    it('持ち時間を使い切ると秒読みになり、秒読みの中で指せば次の手も同じ秒読み', () => {
        const game = timed();
        game.applyCommand(0, P76, 9000);
        expect(game.clock[0]).toEqual({ main: 1000, periods: 1 });
        game.applyCommand(1, P34, 0);
        // 持ち時間の残り1秒と秒読み5秒のうち、4秒使った（秒読みに入ったが超えていない）
        game.applyCommand(0, P26, 5000);
        expect(game.clock[0]).toEqual({ main: 0, periods: 1 });
        game.applyCommand(1, P84, 0);
        expect(game.clockLimit()).toBe(5000);
        expect(game.applyCommand(0, S68, 4999)).toBe(true);
        expect(game.clock[0]).toEqual({ main: 0, periods: 1 });
    });

    it('秒読みが何回かあるときは、超えた分だけ減る', () => {
        const game = timed({ main: 1000, byoyomi: 2000, periods: 3 });
        game.applyCommand(0, P76, 5500);
        expect(game.clock[0]).toEqual({ main: 0, periods: 1 });
    });

    it('時間を使い切った手は断り、時間切れで相手の勝ちにする', () => {
        const game = timed();
        expect(game.applyCommand(0, P76, 15000)).toBe(false);
        expect(game.lastError).toBe('時間切れです');
        expect(game.commands).toHaveLength(0);
        expect(game.isFlagged(14999)).toBe(false);
        expect(game.timeout(0, 14999)).toBe(false);
        expect(game.timeout(1, 15000)).toBe(false);
        expect(game.isFlagged(15000)).toBe(true);
        expect(game.timeout(0, 15000)).toBe(true);
        expect([game.winner, game.reason]).toEqual([1, 'timeout']);
        expect(game.commands.at(-1)).toEqual({ playerId: 0, command: { type: 'timeout' }, ms: 15000 });
        expect(game.events.at(-1)).toMatchObject({ type: 'end', winner: 1, reason: 'timeout', text: 'まで0手で先手の時間切れ。後手の勝ち' });
        expect(game.clockSeat()).toBe(null);
    });

    it('端末から timeout は送れない', () => {
        const game = timed();
        expect(game.applyCommand(0, { type: 'timeout' }, 20000)).toBe(false);
        expect(game.applyCommand(0, { type: 'timeout' })).toBe(false);
        expect(game.isOver()).toBe(false);
    });

    it('投了にも、かかった時間を記録する', () => {
        const game = timed();
        game.applyCommand(0, P76, 1000);
        expect(game.applyCommand(0, { type: 'resign' }, 2000)).toBe(true);
        expect(game.commands.at(-1)).toEqual({ playerId: 0, command: { type: 'resign' }, ms: 2000 });
        expect(game.reason).toBe('resign');
    });

    it('画面に並べる順は、なし・切れ負け・秒読みの順（名前を数字だけにしない）', () => {
        expect(Object.keys(CLOCK_PRESETS)).toEqual(['none', '3m', '5m', '10m', '3m+10s', '10m+30s']);
        expect(clockOption('3m+10s')).toEqual({ main: 180000, byoyomi: 10000, periods: 1 });
        expect(clockOption('none')).toBe(null);
        expect(clockOption('toString')).toBe(null);
    });

    it('時計なしなら時間を見ず、記録に時間を残さない', () => {
        const game = new Game(twoHumans());
        expect(game.applyCommand(0, P76, 999999)).toBe(true);
        expect(game.commands[0]).toEqual({ playerId: 0, command: P76 });
        expect(game.options).toEqual({});
        expect(game.clockSeat()).toBe(null);
        expect(createGameView(game, 0).clock).toBe(null);
    });

    it('ビューに設定・残り・時計の進んでいる側・手番の始まった時刻が入る', () => {
        const game = timed();
        game.turnStartedAt = 1234;
        game.applyCommand(0, P76, 2000);
        expect(createGameView(game, 1).clock).toEqual({
            config: { main: 10000, byoyomi: 5000, periods: 1, increment: 0 },
            sides: [{ main: 8000, periods: 1 }, { main: 10000, periods: 1 }],
            running: 1,
            startedAt: 1234
        });
    });
});

describe('記録からの再現（持ち時間）', () => {
    it('かかった時間の記録から、時計と時間切れの終わりを同じに再現する', () => {
        const game = timed();
        [[P76, 1200], [P34, 800], [P26, 9000], [P84, 300]].forEach(([command, ms]) => game.applyCommand(game.current, command, ms));
        game.timeout(0, game.clockLimit());
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
        expect(again.clock).toEqual(game.clock);
        expect([again.winner, again.reason]).toEqual([1, 'timeout']);
    });

    it('時間のない古い記録も再現できる（時計なし）', () => {
        const old = { players: twoHumans(), options: {}, commands: [{ playerId: 0, command: P76 }, { playerId: 1, command: P34 }] };
        const game = Game.replay(old.players, old.options, old.commands);
        expect(game.ply).toBe(2);
        expect(game.clock).toBe(null);
    });

    it('時計ありで時間の欠けた記録は、0秒として読む', () => {
        const game = Game.replay(twoHumans(), { clock: CLOCK_PRESETS['3m+10s'].clock }, [{ playerId: 0, command: P76 }]);
        expect(game.clock[0]).toEqual({ main: 180000, periods: 1 });
    });
});

describe('持ち時間（ローカルのコントローラー）', () => {
    const setup = (cpu, clock = { main: 10000 }) => ({
        players: cpu ? [{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: 'easy' }] : [{ name: '先手' }, { name: '後手' }],
        options: { clock }
    });

    it('かかった時間を記録し、使い切ったらタイマーで時間切れになる', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(false));
        await vi.advanceTimersByTimeAsync(2500);
        expect(controller.send(P76)).toBe(true);
        expect(controller.game.commands[0].ms).toBe(2500);
        expect(controller.game.clock[0].main).toBe(7500);
        await vi.advanceTimersByTimeAsync(9990);
        expect(controller.game.isOver()).toBe(false);
        await vi.advanceTimersByTimeAsync(100);
        expect([controller.game.winner, controller.game.reason]).toEqual([0, 'timeout']);
        expect(controller.getView().clock.running).toBe(null);
        controller.stop();
    });

    it('時間を過ぎてから送った手は受けず、時間切れになる', async () => {
        let time = 0;
        const controller = new LocalGameController(setup(false), {}, { now: () => time });
        time = 10000;
        expect(controller.send(P76)).toBe(false);
        expect([controller.game.winner, controller.game.reason]).toEqual([1, 'timeout']);
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
        controller.send(P76);
        expect(controller.game.commands[0].ms).toBe(1000);
        controller.stop();
    });

    it('2人で遊ぶときは、隠れても時計を止めない', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController(setup(false));
        controller.pause();
        expect(controller.getView().clockPaused).toBe(false);
        await vi.advanceTimersByTimeAsync(10100);
        expect(controller.game.reason).toBe('timeout');
        controller.stop();
    });

    it('時計なしなら、止めることも時間切れもない', async () => {
        vi.useFakeTimers();
        const controller = new LocalGameController({ players: setup(true).players, options: {} });
        controller.pause();
        expect(controller.getView().clockPaused).toBe(false);
        await vi.advanceTimersByTimeAsync(600000);
        expect(controller.game.isOver()).toBe(false);
        controller.send(P76);
        expect(controller.game.commands[0]).not.toHaveProperty('ms');
        controller.stop();
    });

    // 本当の時計で動かす（偽のタイマーでは、読んでいる間 Date.now が止まる）
    const cpuMatch = async (clock, plies) => {
        const controller = new LocalGameController({
            players: [{ name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'expert' }],
            options: { clock }
        });
        controller.scheduleCpu();
        const until = Date.now() + 40000;
        while (!controller.game.isOver() && controller.game.ply < plies && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
        controller.stop();
        return controller.game;
    };

    it('CPU は残りの時間に合わせて考え、時間切れにならない（3秒の切れ負けで40手）', async () => {
        const game = await cpuMatch({ main: 3000 }, 40);
        expect(game.reason).not.toBe('timeout');
        // 40手までに詰みなどで終わってもよい
        expect(game.isOver() || game.ply >= 40).toBe(true);
        expect(game.clock.every(side => side.main > 0)).toBe(true);
    }, 60000);

    it('秒読みに入っても、CPU は秒読みの中で指す（2秒＋秒読み1秒で24手）', async () => {
        const game = await cpuMatch({ main: 2000, byoyomi: 1000, periods: 1 }, 24);
        expect(game.reason).not.toBe('timeout');
        expect(game.isOver() || game.ply >= 24).toBe(true);
        expect(game.clock.every(side => side.periods === 1)).toBe(true);
    }, 60000);
});

describe('持ち時間（CPU の考える時間）', () => {
    it('残りが少ないほど短く考え、短い時間でも指せる手を返す', () => {
        const game = new Game(players([false, true]), { clock: { main: 180000 } });
        const long = clockBudget(game);
        game.clock[0].main = 3000;
        const short = clockBudget(game);
        expect(long).toBeGreaterThan(short);
        expect(short).toBeLessThan(3000 * 0.25 + 1);
        const started = Date.now();
        const command = decide(game, 'expert');
        expect(Date.now() - started).toBeLessThan(1000);
        expect(game.applyCommand(0, command)).toBe(true);
    });

    it('時計なしなら、考える時間を決めない', () => {
        expect(clockBudget(new Game(players([false, true])))).toBe(null);
    });
});

describe('持ち時間（オンライン）', () => {
    const startRoom = async (clock = '3m') => {
        const server = createTestServer(definition);
        const clients = await server.createRoom(['あお', 'みどり']);
        const [a, b] = clients;
        await a.send('setSettings', { settings: { clock } });
        await a.send('start');
        return { server, a, b, code: clients.code };
    };

    it('ロビーで持ち時間を選べ、ビューに残りの時間と手番の始まった時刻（サーバーの時刻）が入る', async () => {
        const { server, a, b } = await startRoom('3m+10s');
        expect(b.last('lobby').settings).toEqual({ clock: '3m+10s' });
        const view = a.last('state').view;
        expect(view.clock).toEqual({
            config: { main: 180000, byoyomi: 10000, periods: 1, increment: 0 },
            sides: [{ main: 180000, periods: 1 }, { main: 180000, periods: 1 }],
            running: 0,
            startedAt: server.clock.now
        });
        server.clock.now += 4000;
        await a.send('command', { command: P76 });
        const after = b.last('state').view.clock;
        expect(after.sides[0].main).toBe(176000);
        expect(after.running).toBe(1);
        expect(after.startedAt).toBe(server.clock.now);
    });

    it('知らない持ち時間は受けない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { clock: '99' } });
        expect(b.last('lobby').settings).toEqual({ clock: 'none' });
    });

    it('相手が指さなくても、時計が0になったあとの ping で時間切れになる', async () => {
        const { server, a, b, code } = await startRoom('3m');
        await a.send('command', { command: P76 });
        server.clock.now += 179999;
        await a.send('ping', { clientTime: 0 });
        expect(a.last('lobby').status).toBe('playing');
        server.clock.now += 1;
        await a.send('ping', { clientTime: 0 });
        expect(a.last('lobby').status).toBe('ended');
        const view = b.last('state').view;
        expect([view.winner, view.reason]).toEqual([0, 'timeout']);
        // 部屋に残る記録から、同じ終わりを再現できる
        const room = await server.store.getRoom(code);
        const restored = definition.restore(structuredClone(room.game));
        expect([restored.winner, restored.reason]).toEqual([0, 'timeout']);
    });

    it('時間を過ぎてから届いた手は受けず、時間切れで終える', async () => {
        const { server, a } = await startRoom('3m');
        server.clock.now += 181000;
        await a.send('command', { command: P76 });
        const view = a.last('state').view;
        expect([view.winner, view.reason]).toEqual([1, 'timeout']);
        expect(view.ply).toBe(0);
    });

    it('対局中に抜けた人の席は、時計ごと CPU が引き継ぐ', async () => {
        const { server, a, b } = await startRoom('5m');
        await a.send('command', { command: P76 });
        server.clock.now += 7000;
        await b.send('leave');
        const view = a.last('state').view;
        expect(view.ply).toBe(2);   // CPU が後手で指した
        expect(view.clock.sides[1].main).toBeLessThanOrEqual(293000);
        expect(view.clock.running).toBe(0);
        expect(view.clock.startedAt).toBeGreaterThanOrEqual(server.clock.now);
        // 人の手に CPU がすぐ答える
        server.clock.now += 1000;
        await a.send('command', { command: P26 });
        expect(a.last('state').view.ply).toBeGreaterThanOrEqual(3);
    });
});
