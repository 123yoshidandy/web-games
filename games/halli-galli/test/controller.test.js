import { describe, it, expect, beforeEach } from 'vitest';
import LocalGameController, { ReplayController } from '../public/js/game-controller.js';
import Game from '../public/js/game.js';
import { snapshot } from './helpers.js';

// localStorage の代わり
beforeEach(() => {
    const data = new Map();
    globalThis.localStorage = {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key)
    };
});

const setup = {
    mode: 'cpu',
    players: [{ name: 'あなた', auto: true }, { name: 'C1', isCPU: true }, { name: 'C2', isCPU: true }],
    level: 'hard', speed: 'fast', timeLimit: 'short', seed: 21
};

describe('ローカルのコントローラー', () => {
    it('時計が進むと自動でめくり、CPU が鳴らす。止めている間は時計も止まる', () => {
        let now = 1000;
        const c = new LocalGameController(setup, {}, { clock: () => now, autoStart: false });
        expect(c.now()).toBe(0);
        c.pause();
        now += 60000;
        c.tick();
        expect(c.game.commands).toHaveLength(0);
        expect(c.send({ type: 'flip' })).toBe(false);
        c.resume();
        expect(c.now()).toBe(0);
        now += 30000;
        c.tick();
        expect(c.game.commands.length).toBeGreaterThan(10);
        expect(c.game.commands.some(cmd => cmd.type === 'ring')).toBe(true);
    });

    it('人の操作の前に、その時刻までに来たことを先に起こす', () => {
        let now = 0;
        const c = new LocalGameController({ ...setup, players: [{ name: 'あなた' }, ...setup.players.slice(1)] }, {}, { clock: () => now, autoStart: false });
        expect(c.send({ type: 'flip' })).toBe(true);
        now = 5000;
        // 席1と席2は自動でめくり、席0（人・自動なし）の番で止まっている
        c.tick();
        expect(c.game.turn).toBe(0);
        const count = c.game.commands.length;
        expect(c.send({ type: 'flip' })).toBe(true);
        expect(c.game.commands.at(-1)).toMatchObject({ seat: 0, type: 'flip', t: 5000 });
        expect(c.game.commands.length).toBe(count + 1);
    });

    it('自動めくりの切り替えは記録に入り、人の番が自動で進むようになる', () => {
        let now = 0;
        const c = new LocalGameController({ ...setup, players: [{ name: 'あなた' }, ...setup.players.slice(1)] }, {}, { clock: () => now, autoStart: false });
        now = 3000;
        c.tick();
        expect(c.game.commands).toHaveLength(0);
        expect(c.setAuto(true)).toBe(true);
        expect(c.game.commands[0]).toEqual({ seat: 0, type: 'auto', on: true, t: 3000 });
        now = 8000;
        c.tick();
        expect(c.game.commands.some(cmd => cmd.seat === 0 && cmd.type === 'flip')).toBe(true);
    });

    it('途中経過（記録と経過時間）を保存し、「続きから」で同じ局面と時刻に戻る', () => {
        let now = 0;
        const c = new LocalGameController(setup, {}, { clock: () => now, autoStart: false });
        now = 12345;
        c.tick();
        c.stop();
        const saved = LocalGameController.loadSaved();
        expect(saved.elapsed).toBe(12345);
        const back = new LocalGameController(saved, {}, { clock: () => 99999, autoStart: false });
        expect(snapshot(back.game)).toBe(snapshot(c.game));
        expect(back.now()).toBe(12345);
    });

    it('終わったら保存を消す', () => {
        let now = 0;
        const c = new LocalGameController(setup, {}, { clock: () => now, autoStart: false });
        while (!c.game.isOver) {
            now += 1000;
            c.tick();
        }
        expect(LocalGameController.loadSaved()).toBe(null);
    });
});

describe('記録からの再現', () => {
    it('リプレイは、記録の時刻どおりに同じ展開をたどり、最後に同じ局面になる', () => {
        let now = 0;
        const c = new LocalGameController(setup, {}, { clock: () => now, autoStart: false });
        while (!c.game.isOver) {
            now += 200;
            c.tick();
            if (now % 2000 === 0 && !c.game.isOver) c.send({ type: 'ring', version: c.game.tableVersion });
        }
        const record = c.record();
        let clock = 0;
        const updates = [];
        const r = new ReplayController(record, { onUpdate: () => updates.push(r.game.commands.length) }, { clock: () => clock, speed: 4, autoStart: false });
        const firstT = record.commands[0].t;
        clock = (firstT - 1) / 4;
        r.tick();
        expect(r.game.commands).toHaveLength(0);
        clock = firstT / 4;
        r.tick();
        expect(r.game.commands.length).toBeGreaterThanOrEqual(1);
        clock = 1e9;
        r.tick();
        expect(r.finished).toBe(true);
        expect(snapshot(r.game)).toBe(snapshot(c.game));
        expect(r.game.result).toEqual(c.game.result);
        expect(updates.length).toBeGreaterThan(0);
        const options = { seed: record.seed, mode: record.mode, level: record.level, speed: record.speed, timeLimit: record.timeLimit, stopWhenHumansOut: true };
        expect(Game.replay(record.players, options, record.commands).result).toEqual(c.game.result);
    });
});
