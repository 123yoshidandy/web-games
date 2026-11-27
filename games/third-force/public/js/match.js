/**
 * 対戦の記録：操作は「戦術の提出（submit）」と「開始（start：シードを決める）」だけ
 * 記録 { engine, seed, tactics: [A, B] } があれば、リプレイ・URL の共有・オンラインのどれでも同じ対戦を流せる
 */

import { ENGINE_VERSION, createBattle } from './battle.js';
import { normalizeTactic } from './rules.js';

export function createMatch() {
    return { engine: ENGINE_VERSION, tactics: [null, null], seed: null, commands: [] };
}

// 操作を1つ当てる。当てられなければ false（状態は変えない）
export function applyCommand(match, command) {
    if (!command || typeof command !== 'object' || match.seed !== null) return false;
    if (command.type === 'submit') {
        if (command.side !== 0 && command.side !== 1) return false;
        let tactic;
        try { tactic = normalizeTactic(command.tactic); } catch { return false; }
        match.tactics[command.side] = tactic;
        match.commands.push({ type: 'submit', side: command.side, tactic });
        return true;
    }
    if (command.type === 'start') {
        if (!match.tactics[0] || !match.tactics[1] || !Number.isInteger(command.seed) || command.seed < 0 || command.seed >= 2 ** 32) return false;
        match.seed = command.seed;
        match.commands.push({ type: 'start', seed: command.seed });
        return true;
    }
    return false;
}

// 記録の操作から、同じ対戦の準備を作り直す
export function replay(commands) {
    const match = createMatch();
    for (const command of commands) {
        if (!applyCommand(match, command)) throw new Error('記録の操作を当てられません');
    }
    return match;
}

export const recordOf = (match) => ({ engine: match.engine, seed: match.seed, tactics: match.tactics });

// 記録から対戦を作る。エンジンの版が違えば作らない
export function battleFromRecord(record) {
    if (record.engine !== ENGINE_VERSION) throw new Error('この版では再現できない記録です');
    return createBattle({ seed: record.seed, tactics: record.tactics.map(normalizeTactic) });
}
