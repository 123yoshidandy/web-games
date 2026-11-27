/**
 * 自分の編成（手持ち6体・技・戦術ルール）の保存と読み込み
 * 壊れた保存や古い形は、最初の編成に戻す
 */

import { DEFAULT_TEAM } from './data.js';
import { normalizeTeam } from './game.js';

const TEAM_KEY = 'pokemon-battle.team';

export const defaultTeam = () => DEFAULT_TEAM.map(t => ({ id: t.id, moves: [...t.moves], rules: t.rules.map(r => ({ ...r })) }));

export function loadTeam() {
    try {
        return normalizeTeam(JSON.parse(localStorage.getItem(TEAM_KEY) ?? 'null')) ?? defaultTeam();
    } catch {
        return defaultTeam();
    }
}

export function saveTeam(team) {
    try {
        localStorage.setItem(TEAM_KEY, JSON.stringify(team));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}
