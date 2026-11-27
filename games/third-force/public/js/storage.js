/**
 * 端末への保存（localStorage）。保存の名前の頭は thirdforce
 * - thirdforce.rulesets：名前を付けた戦術（最大 20）
 * - thirdforce.settings：タイトル画面の選択（自分の戦術・相手）
 * - thirdforce.save：続きから（編集中の戦術か、対戦中の記録と tick）
 */

import { normalizeTactic } from './rules.js';

export const KEYS = { rulesets: 'thirdforce.rulesets', settings: 'thirdforce.settings', save: 'thirdforce.save' };
export const MAX_SAVED = 20;

export const store = {
    load(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch { /* 同上 */ }
    }
};

// 保存した戦術の一覧 [{ id, tactic }]。壊れたものは読み飛ばす
export function loadRulesets() {
    const list = store.load(KEYS.rulesets);
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const item of list) {
        try {
            if (typeof item?.id === 'string') out.push({ id: item.id, tactic: normalizeTactic(item.tactic) });
        } catch { /* 読めない戦術は捨てる */ }
    }
    return out.slice(0, MAX_SAVED);
}

export const saveRulesets = (list) => store.save(KEYS.rulesets, list.slice(0, MAX_SAVED));

export const newId = () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
