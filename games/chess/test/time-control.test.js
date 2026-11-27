import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestServer } from 'netplay-kit/server/testing.js';
import Game, { CLOCK_PRESETS } from '../public/js/game.js';
import LocalGameController from '../public/js/game-controller.js';
import definition from '../server/src/game-definition.js';
import { decide, clockBudget } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { players, mv, snapshot } from './helpers.js';

afterEach(() => vi.useRealTimers());

const blitz = (clock = { main: 10000, increment: 2000 }) => new Game(players([false, false]), { clock });

describe('持ち時間（ゲーム）', () => {
    it('指した席の時計から、かかった時間を引いて加算する。記録に時間が残る', () => {
        const game = blitz();
        expect(game.applyCommand(0, mv('e2e4'), 3000)).toBe(true);
        expect(game.clock[0]).toEqual({ main: 9000, periods: 0 });
        expect(game.clockSeat()).toBe(1);
        expect(game.applyCommand(1, mv('e7e5'), 1500)).toBe(true);
        expect(game.clock[1]).toEqual({ main: 10500, periods: 0 });
        expect(game.commands.map(c => c.ms)).toEqual([3000, 1500]);
    });

    it('引き分けの提案中は答える側の時計が進み、提案と答えには加算しない', () => {
        const game = blitz();
        game.applyCommand(0, { type: 'offerDraw' }, 1000);
        expect(game.clock[0].main).toBe(9000);
        expect(game.clockSeat()).toBe(1);
        game.applyCommand(1, { type: 'declineDraw' }, 2000);
        expect(game.clock[1].main).toBe(8000);
        expect(game.clockSeat()).toBe(0);
    });

    it('時間を使い切った操作は断り、時間切れで終える。相手にメイトできる駒があれば相手の勝ち', () => {
        const game = blitz();
        expect(game.applyCommand(0, mv('e2e4'), 10000)).toBe(false);
        expect(game.commands).toHaveLength(0);
        expect(game.isFlagged(9999)).toBe(false);
        expect(game.timeout(0, 9999)).toBe(false);
        expect(game.isFlagged(10000)).toBe(true);
        expect(game.timeout(0, 10000)).toBe(true);
        expect(game.result).toEqual({ winner: 1, reason: 'timeout' });
        expect(game.commands.at(-1)).toEqual({ playerId: 0, command: { type: 'timeout' }, ms: 10000 });
        expect(game.events.at(-1)).toMatchObject({ type: 'end', winner: 1, reason: 'timeout' });
    });

    it('時間切れでも、相手がキングと小駒1つだけなら引き分け', () => {
        const game = new Game(players([false, false]), { clock: { main: 5000 }, fen: '4k3/8/8/8/8/8/3PPP2/4K2n b - - 0 1' });
        expect(game.timeout(1, 6000)).toBe(true);
        expect(game.result).toEqual({ winner: 0, reason: 'timeout' }); // 白にはポーンがある
        const lone = new Game(players([false, false]), { clock: { main: 5000 }, fen: '4k3/3pp3/8/8/8/8/8/4K1N1 b - - 0 1' });
        lone.timeout(1, 5000);
        expect(lone.result).toEqual({ winner: null, reason: 'timeoutDraw' });
    });

    it('端末から timeout は送れない', () => {
        const game = blitz();
        expect(game.applyCommand(0, { type: 'timeout' }, 20000)).toBe(false);
        expect(game.applyCommand(0, { type: 'timeout' })).toBe(false);
        expect(game.isOver()).toBe(false);
    });

    it('時計なしなら時間を見ず、記録に時間を残さない', () => {
        const game = new Game(players([false, false]));
        expect(game.applyCommand(0, mv('e2e4'), 999999)).toBe(true);
        expect(game.commands[0]).toEqual({ playerId: 0, command: mv('e2e4') });
        expect(game.clockSeat()).toBe(null);
        expect(createGameView(game, 0).clock).toBe(null);
    });
});

describe('記録からの再現（持ち時間）', () => {
    it('かかった時間の記録から、時計と時間切れの終わりを同じに再現する', () => {
        const game = blitz();
        [['e2e4', 1200], ['e7e5', 800], ['g1f3', 4000], ['b8c6', 300]].forEach(([uci, ms]) => game.applyCommand(game.current, mv(uci), ms));
        game.timeout(0, game.clockLimit());
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
        expect(again.clock).toEqual(game.clock);
        expect(again.result).toEqual({ winner: 1, reason: 'timeout' });
    });

    it('時間のない古い記録も再現できる（時計なし）', () => {
        const old = { players: players([false, false]), options: {}, commands: [{ playerId: 0, command: mv('e2e4') }, { playerId: 1, command: mv('e7e5') }] };
        const game = Game.replay(old.players, old.options, old.commands);
        expect(game.ply).toBe(2);
        expect(game.clock).toBe(null);
    });

    it('時計ありで時間の欠けた記録は、0秒として読む', () => {
        const game = Game.replay(players([false, false]), { clock: CLOCK_PRESETS['3m+2s'].clock }, [{ playerId: 0, command: mv('e2e4') }]);
        expect(game.clock[0].main).toBe(182000);
    });
});

describe('持ち時間（ローカルのコントローラー）', () => {
    const setup = (cpu, clock = { main: 10000 }) => ({
        players: cpu ? [{ name: 'あなた' }, { name: 'CPU', isCPU: true, cpuLevel: 'easy' }] : [{ name: '白' }, { name: '黒' }],
        options: { clock }
    });

    it('かかった時間を記録し、使い切ったらタイマーで時間切れになる', async () => {
        vi.useFakeTimers();
        const updates = [];
        const controller = new LocalGameController(setup(false), { onUpdate: () => updates.push(1) });
        await vi.advanceTimersByTimeAsync(2500);
        controller.send(mv('e2e4'));
        expect(controller.game.commands[0].ms).toBe(2500);
        expect(controller.game.clock[0].main).toBe(7500);
        await vi.advanceTimersByTimeAsync(9990);
        expect(controller.game.isOver()).toBe(false);
        await vi.advanceTimersByTimeAsync(100);
        expect(controller.game.result).toEqual({ winner: 0, reason: 'timeout' });
        expect(controller.getView().clock.running).toBe(null);
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
        expect(controller.elapsed()).toBe(1000);
        controller.send(mv('e2e4'));
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

    it('CPU は残りの時間に合わせて考え、時間切れにならない（3秒の切れ負けで60手）', async () => {
        // 本当の時計で動かす（考える時間も時計に入る）
        const controller = new LocalGameController({
            players: [{ name: 'A', isCPU: true, cpuLevel: 'normal' }, { name: 'B', isCPU: true, cpuLevel: 'expert' }],
            options: { clock: { main: 3000 } }
        });
        controller.scheduleCpu();
        const until = Date.now() + 20000;
        while (!controller.game.isOver() && controller.game.ply < 60 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
        controller.stop();
        expect(controller.game.result?.reason).not.toBe('timeout');
        // 60手までにメイトなどで終わってもよい
        expect(controller.game.isOver() || controller.game.ply >= 60).toBe(true);
        expect(controller.game.clock.every(side => side.main > 0)).toBe(true);
    }, 30000);
});

describe('持ち時間（CPU の考える時間）', () => {
    it('残りが少ないほど短く考える', () => {
        const game = new Game(players([false, true]), { clock: { main: 180000 } });
        const long = clockBudget(createGameView(game, 0));
        game.clock[0].main = 3000;
        const short = clockBudget(createGameView(game, 0));
        expect(long).toBeGreaterThan(short);
        expect(short).toBeLessThan(3000 * 0.25 + 1);
        const started = Date.now();
        expect(decide(createGameView(game, 0), 'expert')?.type).toBe('move');
        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe('持ち時間（オンライン）', () => {
    const startRoom = async (clock = '3m') => {
        const server = createTestServer(definition);
        const clients = await server.createRoom(['しろ', 'くろ']);
        const [a, b] = clients;
        await a.send('setSettings', { settings: { clock } });
        await a.send('start');
        return { server, a, b, code: clients.code };
    };

    it('ロビーで持ち時間を選べ、ビューに残りの時間と手番の始まった時刻（サーバーの時刻）が入る', async () => {
        const { server, a, b } = await startRoom('3m+2s');
        expect(b.last('lobby').settings).toEqual({ clock: '3m+2s' });
        const view = a.last('state').view;
        expect(view.clock).toEqual({ config: { main: 180000, byoyomi: 0, periods: 0, increment: 2000 }, sides: [{ main: 180000, periods: 0 }, { main: 180000, periods: 0 }], running: 0, startedAt: server.clock.now });
        server.clock.now += 4000;
        await a.send('command', { command: mv('e2e4') });
        const after = b.last('state').view.clock;
        expect(after.sides[0].main).toBe(178000);
        expect(after.running).toBe(1);
        expect(after.startedAt).toBe(server.clock.now);
    });

    it('相手が指さなくても、時計が0になったあとの ping で時間切れになる', async () => {
        const { server, a, b, code } = await startRoom('3m');
        await a.send('command', { command: mv('e2e4') });
        server.clock.now += 179999;
        await a.send('ping', { clientTime: 0 });
        expect(a.last('lobby').status).toBe('playing');
        server.clock.now += 1;
        await a.send('ping', { clientTime: 0 });
        expect(a.last('lobby').status).toBe('ended');
        const view = b.last('state').view;
        expect(view.result).toEqual({ winner: 0, reason: 'timeout' });
        // 部屋に残る記録から、同じ終わりを再現できる
        const room = await server.store.getRoom(code);
        expect(definition.restore(structuredClone(room.game)).result).toEqual({ winner: 0, reason: 'timeout' });
    });

    it('時間を過ぎてから届いた手は受けず、時間切れで終える', async () => {
        const { server, a } = await startRoom('3m');
        server.clock.now += 181000;
        await a.send('command', { command: mv('e2e4') });
        const view = a.last('state').view;
        expect(view.result).toEqual({ winner: 1, reason: 'timeout' });
        expect(view.sans).toEqual([]);
    });

    it('対局中に抜けた人の席は、時計ごと CPU が引き継ぐ', async () => {
        const { server, a, b } = await startRoom('5m');
        await a.send('command', { command: mv('e2e4') });
        server.clock.now += 7000;
        await b.send('leave');
        const view = a.last('state').view;
        expect(view.ply).toBe(2);   // CPU が黒で指した
        expect(view.clock.sides[1].main).toBeLessThanOrEqual(293000);
        expect(view.clock.running).toBe(0);
        expect(view.clock.startedAt).toBeGreaterThanOrEqual(server.clock.now);
        // 人の手に CPU がすぐ答える
        server.clock.now += 1000;
        await a.send('command', { command: mv('g1f3') });
        expect(a.last('state').view.ply).toBeGreaterThanOrEqual(3);
    });
});
