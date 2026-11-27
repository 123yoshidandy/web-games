import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBattle, step, runBattle, hashBattle, advanceTo, summaryOf, ENGINE_VERSION } from '../public/js/battle.js';
import { createMatch, applyCommand, replay, recordOf, battleFromRecord } from '../public/js/match.js';
import { BUILTIN } from '../public/js/cpu-tactics.js';
import { emptyTactic, normalizeTactic, defaultArms } from '../public/js/rules.js';
import { HEIGHT, MAX_TICKS, START_MONEY, ARMS } from '../public/js/arms.js';
import { REFERENCE } from './reference-tactics.js';

const GOLDEN = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const save = { on: true, when: [{ k: 'always' }], act: { k: 'save' }, wait: 0 };
const only = (rules, extra = {}) => normalizeTactic({ name: 't', rules, arms: defaultArms(), ...extra });

describe('決定性', () => {
    it('同じシードと戦術からは、同じ勝者・同じ出来事の並び・同じ最後の状態になる', () => {
        for (const seed of [1, 42, 2 ** 31 + 5]) {
            const a = runBattle({ seed, tactics: [BUILTIN.offense, BUILTIN.sample] });
            const b = runBattle({ seed, tactics: [structuredClone(BUILTIN.offense), structuredClone(BUILTIN.sample)] });
            expect(a.winner).toBe(b.winner);
            expect(a.events).toEqual(b.events);
            expect(hashBattle(a)).toBe(hashBattle(b));
        }
    });

    it('シードが違えば、対戦も変わる', () => {
        const hashes = new Set([1, 2, 3, 4].map((seed) => hashBattle(runBattle({ seed, tactics: [BUILTIN.random, BUILTIN.random] }))));
        expect(hashes.size).toBeGreaterThan(1);
    });

    it('決めた組の最後の状態のハッシュが、記録した値と同じ（ブラウザの確かめでも同じ値を使う）', () => {
        expect(GOLDEN.engine).toBe(ENGINE_VERSION);
        for (const { seed, a, b, hash, winner } of GOLDEN.cases) {
            const battle = runBattle({ seed, tactics: [BUILTIN[a], BUILTIN[b]] });
            expect(hashBattle(battle), `${a} vs ${b} seed ${seed}`).toBe(hash);
            expect(battle.winner).toBe(winner);
        }
    });

    it('相手の戦術を変えても、自分の確率の条件が引く値の並びは変わらない', () => {
        const coin = only([{ on: true, when: [{ k: 'chance', n: 50 }], act: { k: 'spawn', unit: 'infantry', at: 'random' }, wait: 0 }, save]);
        const spawnsOf = (opponent) => runBattle({ seed: 9, tactics: [coin, opponent] }).events.filter((e) => e.side === 0 && e.kind === 'spawn' && e.t < 200).map((e) => e.t);
        expect(spawnsOf(only([save]))).toEqual(spawnsOf(BUILTIN.random));
    });

    it('途中から（tick まで流し直す）と、通しで流したときの状態が同じ', () => {
        const full = createBattle({ seed: 5, tactics: [BUILTIN.sample, BUILTIN.defense] });
        for (let i = 0; i < 1234; i++) step(full);
        const again = advanceTo(createBattle({ seed: 5, tactics: [BUILTIN.sample, BUILTIN.defense] }), 1234);
        expect(hashBattle(again)).toBe(hashBattle(full));
    });
});

describe('記録からの再現', () => {
    it('提出と開始の記録を replay すると、同じ対戦になる', () => {
        const match = createMatch();
        expect(applyCommand(match, { type: 'submit', side: 0, tactic: BUILTIN.offense })).toBe(true);
        expect(applyCommand(match, { type: 'start', seed: 77 })).toBe(false); // 両方そろうまで始められない
        expect(applyCommand(match, { type: 'submit', side: 1, tactic: BUILTIN.random })).toBe(true);
        expect(applyCommand(match, { type: 'start', seed: 77 })).toBe(true);
        expect(applyCommand(match, { type: 'submit', side: 1, tactic: BUILTIN.sample })).toBe(false); // 始まったら変えられない
        const copy = replay(JSON.parse(JSON.stringify(match.commands)));
        const a = battleFromRecord(recordOf(match));
        const b = battleFromRecord(recordOf(copy));
        while (!a.over) step(a);
        while (!b.over) step(b);
        expect(hashBattle(b)).toBe(hashBattle(a));
    });

    it('エンジンの版が違う記録は、再現しない', () => {
        expect(() => battleFromRecord({ engine: ENGINE_VERSION + 1, seed: 1, tactics: [BUILTIN.random, BUILTIN.random] })).toThrow('再現できない');
    });

    it('変な操作は当てない', () => {
        const match = createMatch();
        expect(applyCommand(match, { type: 'submit', side: 2, tactic: BUILTIN.random })).toBe(false);
        expect(applyCommand(match, { type: 'submit', side: 0, tactic: { rules: 'x' } })).toBe(false);
        expect(applyCommand(match, { type: 'proxy' })).toBe(false);
        expect(match.commands).toEqual([]);
    });
});

describe('対戦のルール', () => {
    it('5000 tick で終わり、体力の多い方が勝つ（同じなら引き分け）', () => {
        const battle = runBattle({ seed: 1, tactics: [only([save]), only([save])] });
        expect(battle.time).toBe(MAX_TICKS);
        expect(battle.winner).toBeNull();
        expect(battle.sides[0].money).toBe(START_MONEY + 50 * (MAX_TICKS / 2));
    });

    it('歩兵が敵陣に着くと、敵の体力を 100 減らして消える', () => {
        const rush = only([{ on: true, when: [{ k: 'always' }], act: { k: 'spawn', unit: 'infantry', at: 'middle' }, wait: 0 }]);
        const battle = createBattle({ seed: 1, tactics: [rush, only([save])] });
        while (!battle.events.some((e) => e.kind === 'raid')) step(battle);
        expect(battle.sides[1].life).toBe(900);
        expect(battle.events.find((e) => e.kind === 'raid').side).toBe(0);
    });

    it('お金が足りない行で止まって貯め、下の行は見ない', () => {
        const tactic = only([
            { on: true, when: [{ k: 'always' }], act: { k: 'spawn', unit: 'bomber', at: 'middle' }, wait: 0 },
            { on: true, when: [{ k: 'always' }], act: { k: 'spawn', unit: 'infantry', at: 'top' }, wait: 0 }
        ]);
        const battle = createBattle({ seed: 1, tactics: [tactic, only([save])] });
        for (let i = 0; i < 30; i++) step(battle);
        const spawns = battle.events.filter((e) => e.kind === 'spawn' && e.side === 0);
        expect(spawns.every((e) => e.type === 'bomber')).toBe(true);
    });

    it('生成の地点が埋まっていれば、次の行へ進む', () => {
        const tactic = only([
            { on: true, when: [{ k: 'always' }], act: { k: 'spawn', unit: 'infantry', at: 'middle' }, wait: 0 },
            { on: true, when: [{ k: 'always' }], act: { k: 'spawn', unit: 'infantry', at: 'top' }, wait: 0 }
        ]);
        const battle = createBattle({ seed: 1, tactics: [tactic, only([save])] });
        step(battle); // tick 0：中に出る
        step(battle);
        step(battle); // tick 2：中はまだ埋まっている（歩兵は 0.8 しか進まない）ので上に出る
        const spawns = battle.events.filter((e) => e.kind === 'spawn' && e.side === 0);
        expect(spawns.map((e) => e.line)).toEqual([0, 1]);
    });

    it('退却すると、傷ついていても費用を全額返す', () => {
        const tactic = only([{ on: true, when: [{ k: 'always' }], act: { k: 'spawn', unit: 'missile', at: 'middle' }, wait: 0 }], {
            arms: { ...defaultArms(), missile: { ...defaultArms().missile, retreat: { empty: true, noTarget: true, lowLife: 0 } } }
        });
        const battle = createBattle({ seed: 1, tactics: [tactic, only([save])] });
        step(battle); // tick 0：出す（1000 払う）
        expect(battle.sides[0].money).toBe(START_MONEY - ARMS.missile.cost);
        step(battle);
        step(battle); // tick 2：前に撃てる敵がいないので退く印 → 次の判断で出し直す
        step(battle);
        step(battle); // tick 4：退いて全額返る
        expect(battle.events.some((e) => e.kind === 'retreat')).toBe(true);
    });

    it('重なりをよけても、盤面の外へは出ない', () => {
        const stack = only([{ on: true, when: [{ k: 'always' }], act: { k: 'spawn', unit: 'tank', at: 'random' }, wait: 0 }]);
        const battle = createBattle({ seed: 3, tactics: [stack, stack] });
        for (let i = 0; i < 3000 && !battle.over; i++) {
            step(battle);
            for (const s of battle.sides) for (const a of s.arms) expect(a.y >= 0 && a.y <= HEIGHT).toBe(true);
        }
    });

    it('終わったあとは進まない（終局後に出撃しない）', () => {
        const battle = runBattle({ seed: 2, tactics: [BUILTIN.offense, BUILTIN.random] });
        const events = battle.events.length;
        step(battle);
        expect(battle.events.length).toBe(events);
    });

    it('A と B を入れ替えても、盤面を回した同じ形で戦える（どちらの席にも有利がない）', () => {
        let a = 0;
        let b = 0;
        for (let seed = 1; seed <= 6; seed++) {
            if (runBattle({ seed, tactics: [BUILTIN.sample, BUILTIN.random] }).winner === 0) a++;
            if (runBattle({ seed, tactics: [BUILTIN.random, BUILTIN.sample] }).winner === 1) b++;
        }
        expect(a).toBe(6);
        expect(b).toBe(6);
    });

    it('ルールごとの発動回数を数える', () => {
        const s = summaryOf(runBattle({ seed: 1, tactics: [BUILTIN.sample, emptyTactic()] }));
        expect(s.counts[0][0]).toBeGreaterThan(0);
        expect(s.counts[0].length).toBeLessThanOrEqual(BUILTIN.sample.rules.length);
    });
});

describe('原作の JS の戦術との比べ', () => {
    const SEEDS = 12;
    const rate = (a, b) => {
        let w = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
            const side = seed % 2;
            const battle = runBattle({ seed, tactics: side === 0 ? [a, b] : [b, a] });
            if (battle.winner === side) w++;
            else if (battle.winner === null) w += 0.5;
        }
        return w / SEEDS;
    };

    it.each([['sample', 'random'], ['offense', 'random'], ['offense', 'sample']])('%s 対 %s の勝率が、元の版とルールの版で近い', (a, b) => {
        const reference = rate(REFERENCE[a], REFERENCE[b]);
        const rules = rate(BUILTIN[a], BUILTIN[b]);
        expect(reference).toBeGreaterThanOrEqual(0.75);
        expect(Math.abs(reference - rules)).toBeLessThanOrEqual(0.25);
    });
});
