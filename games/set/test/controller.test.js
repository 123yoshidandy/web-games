import { describe, it, expect, beforeEach } from 'vitest';
import LocalGameController, { ReplayController } from '../public/js/game-controller.js';
import Game, { findSets } from '../public/js/game.js';
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

const setup = { mode: 'cpu', players: [{ name: 'あなた' }, { name: 'C1', isCPU: true }, { name: 'C2', isCPU: true }], level: 'hard', seed: 21 };

describe('ローカルのコントローラー', () => {
    it('時計が進むと CPU が取る。止めている間は時計も CPU も止まる', () => {
        let now = 1000;
        const c = new LocalGameController(setup, {}, { clock: () => now, autoStart: false });
        expect(c.now()).toBe(0);
        c.pause();
        now += 60000;
        c.tick();
        expect(c.game.commands).toHaveLength(0);
        expect(c.send({ type: 'claim', cards: findSets(c.game.board)[0] })).toBe(false);
        c.resume();
        expect(c.now()).toBe(0);
        now += 60000;
        c.tick();
        expect(c.game.commands.length).toBeGreaterThan(0);
        expect(c.game.commands.every(cmd => cmd.seat > 0)).toBe(true);
    });

    it('人の操作の前に、その時刻までに来た CPU の手を先に打つ', () => {
        let now = 0;
        const c = new LocalGameController(setup, {}, { clock: () => now, autoStart: false });
        const due = Math.min(...[1, 2].map(seat => c.game.players[seat] && require_due(c.game, seat)));
        now = due + 10;
        const cards = findSets(c.game.board)[0];
        c.send({ type: 'claim', cards });
        expect(c.game.commands[0].seat).not.toBe(0);
        expect(c.game.commands[0].t).toBe(due);
    });

    it('途中経過（記録と経過時間）を保存し、「続きから」で同じ局面と時刻に戻る', () => {
        let now = 0;
        const c = new LocalGameController({ mode: 'solo', players: [{ name: 'あなた' }], seed: 5 }, {}, { clock: () => now, autoStart: false });
        for (let i = 0; i < 4; i++) {
            now += 2500;
            c.send({ type: 'claim', cards: findSets(c.game.board)[0] });
        }
        now += 1234;
        c.stop();
        const saved = LocalGameController.loadSaved();
        expect(saved.elapsed).toBe(11234);
        const back = new LocalGameController(saved, {}, { clock: () => 99999, autoStart: false });
        expect(snapshot(back.game)).toBe(snapshot(c.game));
        expect(back.now()).toBe(11234);
    });

    it('終わったら保存を消す', () => {
        let now = 0;
        const c = new LocalGameController({ mode: 'solo', players: [{ name: 'あなた' }], seed: 6 }, {}, { clock: () => now, autoStart: false });
        while (!c.game.isOver) {
            now += 1000;
            c.send({ type: 'claim', cards: findSets(c.game.board)[0] });
        }
        expect(LocalGameController.loadSaved()).toBe(null);
    });
});

describe('記録からの再現', () => {
    it('リプレイは、記録の時刻どおりに同じ展開をたどり、最後に同じ局面になる', () => {
        let now = 0;
        const c = new LocalGameController(setup, {}, { clock: () => now, autoStart: false });
        while (!c.game.isOver) {
            now += 400;
            c.tick();
            if (now % 4000 === 0 && !c.game.isOver) c.send({ type: 'claim', cards: findSets(c.game.board)[0] });
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
        expect(r.game.commands).toHaveLength(1);
        clock = 1e9;
        r.tick();
        expect(r.finished).toBe(true);
        expect(snapshot(r.game)).toBe(snapshot(c.game));
        expect(r.game.result).toEqual(c.game.result);
        expect(updates.length).toBeGreaterThan(0);
        expect(Game.replay(record.players, { seed: record.seed, mode: record.mode, level: record.level }, record.commands).result).toEqual(c.game.result);
    });
});

import { cpuDueTime } from '../public/js/cpu-player.js';
function require_due(game, seat) { return cpuDueTime(game, seat); }
