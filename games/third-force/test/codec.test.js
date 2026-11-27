import { describe, it, expect } from 'vitest';
import { encodeTactic, decodeTactic, encodeRecord, decodeRecord } from '../public/js/codec.js';
import { normalizeTactic, emptyTactic, MAX_RULES } from '../public/js/rules.js';
import { BUILTIN } from '../public/js/cpu-tactics.js';
import { ENGINE_VERSION } from '../public/js/battle.js';

describe('共有コード', () => {
    it('組み込みの戦術を、そのまま書いて読める', () => {
        for (const tactic of Object.values(BUILTIN)) {
            const code = encodeTactic(tactic);
            expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
            expect(decodeTactic(code)).toEqual(tactic);
        }
    });

    it('12 行の戦術でも 300 字ほどに収まる', () => {
        const tactic = structuredClone(BUILTIN.kazuki);
        while (tactic.rules.length < MAX_RULES) tactic.rules.push(structuredClone(tactic.rules[2]));
        tactic.name = '十二行の戦術';
        const code = encodeTactic(tactic);
        expect(code.length).toBeLessThan(360);
        expect(decodeTactic(code)).toEqual(normalizeTactic(tactic));
    });

    it('対戦（シードと両方の戦術）を書いて読める', () => {
        const record = { engine: ENGINE_VERSION, seed: 4000000000, tactics: [BUILTIN.sample, BUILTIN.defense] };
        expect(decodeRecord(encodeRecord(record))).toEqual(record);
    });

    it('壊れた・余分な・範囲の外のコードは読まない', () => {
        const code = encodeTactic(BUILTIN.sample);
        expect(() => decodeTactic(code.slice(0, -3))).toThrow();
        expect(() => decodeTactic(code + 'AA')).toThrow();
        expect(() => decodeTactic('')).toThrow();
        expect(() => decodeTactic('あいう')).toThrow();
        expect(() => decodeTactic('A'.repeat(5000))).toThrow();
        // 版の番号を変える
        expect(() => decodeTactic('Ag' + code.slice(2))).toThrow();
        // どこか1バイトを 255 にしても、例外か正しい戦術のどちらかになる（変な値のまま通らない）
        const bytes = Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4)), (c) => c.charCodeAt(0));
        for (let i = 0; i < bytes.length; i++) {
            const broken = Uint8Array.from(bytes);
            broken[i] = 255;
            const text = btoa(String.fromCharCode(...broken)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            try {
                const tactic = decodeTactic(text);
                expect(normalizeTactic(tactic)).toEqual(tactic);
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
            }
        }
    });
});

describe('戦術の検証', () => {
    it('既定の戦術は正しい', () => {
        expect(() => normalizeTactic(emptyTactic())).not.toThrow();
    });

    it('行が多すぎる・知らない条件・範囲の外の数は断る', () => {
        const tactic = emptyTactic();
        expect(() => normalizeTactic({ ...tactic, rules: Array(MAX_RULES + 1).fill(tactic.rules[0]) })).toThrow();
        expect(() => normalizeTactic({ ...tactic, rules: [{ when: [{ k: 'cheat' }], act: { k: 'save' } }] })).toThrow();
        expect(() => normalizeTactic({ ...tactic, rules: [{ when: [{ k: 'money', op: 'lt', n: 123 }], act: { k: 'save' } }] })).toThrow();
        expect(() => normalizeTactic({ ...tactic, rules: [{ when: [], act: { k: 'formation', i: 0 } }] })).toThrow();
        expect(() => normalizeTactic({ ...tactic, rules: [{ when: [], act: { k: 'save' }, wait: 2 }] })).toThrow();
        expect(() => normalizeTactic({ ...tactic, arms: { tank: { advance: 'moon' } } })).toThrow();
    });

    it('名前は 16 字までに切り、余分な項目は落とす', () => {
        const t = normalizeTactic({ ...emptyTactic(), name: 'あ'.repeat(30), hack: 1 });
        expect(t.name).toHaveLength(16);
        expect(t.hack).toBeUndefined();
    });
});
