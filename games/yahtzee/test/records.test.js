import { describe, it, expect, beforeEach } from 'vitest';
import { addRecord, loadRecords, bestOf } from '../public/js/records.js';
import LocalGameController from '../public/js/game-controller.js';
import { ROUNDS } from '../public/js/game.js';

// Node には localStorage がないので、小さな代わりを置く
const store = new Map();
globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); }
};

describe('ハイスコアの記録', () => {
    beforeEach(() => store.clear());

    it('点数の高い順に10回分を残し、自己ベストの更新を知らせる', () => {
        expect(addRecord({ score: 200 }).best).toBe(true);
        expect(addRecord({ score: 150 })).toMatchObject({ best: false, rank: 2 });
        expect(addRecord({ score: 250 })).toMatchObject({ best: true, rank: 1 });
        for (let i = 0; i < 10; i++) addRecord({ score: 100 + i });
        const records = loadRecords();
        expect(records.plays).toBe(13);
        expect(records.top).toHaveLength(10);
        expect(bestOf(records)).toBe(250);
        expect(records.top.at(-1).score).toBe(103);
    });

    it('壊れた記録は空として読む', () => {
        store.set('yahtzee.records', '{oops');
        expect(loadRecords()).toEqual({ plays: 0, sum: 0, top: [] });
    });

    it('ゲームが終わったら1回だけ記録し、途中経過を消す', () => {
        const recorded = [];
        const controller = new LocalGameController({ players: [{ name: 'あなた' }], options: { seed: 3 }, level: 'normal' }, { onRecord: (r) => recorded.push(r) });
        for (let i = 0; i < ROUNDS; i++) {
            controller.send({ type: 'roll', keep: [false, false, false, false, false] });
            controller.send({ type: 'score', category: Object.keys(controller.getView().options)[0] });
        }
        expect(controller.game.isOver()).toBe(true);
        controller.save();
        expect(recorded).toHaveLength(1);
        expect(loadRecords().plays).toBe(1);
        expect(store.has('yahtzee.save')).toBe(false);
        controller.stop();
    });
});
