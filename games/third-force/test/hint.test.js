import { describe, it, expect } from 'vitest';
import { suggest, trial, TEMPLATES } from '../public/js/cpu-suggest.js';
import { normalizeTactic, emptyTactic, MAX_RULES } from '../public/js/rules.js';
import { BUILTIN } from '../public/js/cpu-tactics.js';

describe('ヒント', () => {
    it('雛形はどれも正しい行で、20 前後ある', () => {
        expect(TEMPLATES.length).toBeGreaterThanOrEqual(18);
        for (const line of TEMPLATES) expect(() => normalizeTactic({ ...emptyTactic(), rules: [line] })).not.toThrow();
    });

    it('弱い戦術に、勝率が上がる1行を薦める', () => {
        const weak = normalizeTactic({ ...emptyTactic('弱い'), rules: [{ on: true, when: [{ k: 'always' }], act: { k: 'save' }, wait: 0 }] });
        const hint = suggest(weak, BUILTIN.random);
        expect(hint).not.toBeNull();
        expect(hint.improved).toBe(true);
        expect(hint.tactic.rules).toHaveLength(2);
        expect(hint.tactic.rules[hint.index]).toEqual(normalizeTactic({ ...emptyTactic(), rules: [hint.line] }).rules[0]);
        const before = trial(weak, BUILTIN.random, 4);
        const after = trial(hint.tactic, BUILTIN.random, 4);
        expect(after.wins + after.draws / 2).toBeGreaterThanOrEqual(before.wins + before.draws / 2);
    });

    it('行が 12 行あれば出さない。形の違う引数には null を返す', () => {
        const full = normalizeTactic({ ...emptyTactic(), rules: Array.from({ length: MAX_RULES }, () => emptyTactic().rules[0]) });
        expect(suggest(full, BUILTIN.random)).toBeNull();
        expect(suggest({ phase: 'submit' }, 0)).toBeNull();
    });

    it('ヒントの計算は数秒に収まる', () => {
        const started = performance.now();
        suggest(BUILTIN.sample, BUILTIN.kazuki);
        expect(performance.now() - started).toBeLessThan(10000);
    });
});
