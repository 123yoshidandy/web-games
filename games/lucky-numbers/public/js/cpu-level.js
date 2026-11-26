/**
 * CPU の強さ（ローカル対戦で選ぶ）
 * - ふつう：cpu-player.js の戦略そのまま
 * - やさしい：4回に1回くらいの判断で、良い手を考えずに打つ（場を見ずに山札を引く・置ける所へ適当に置く）
 * 乱数はゲームのシードと手数から作るので、同じ局面では同じ手になる（「続きから」で再開しても変わらない）
 */

import { validPlacements } from './game.js';
import { chooseCpuCommand, isCpuTurn } from './cpu-player.js';
import { createRandom } from './random.js';

export const LEVELS = { easy: 'やさしい', normal: 'ふつう' };
export const DEFAULT_LEVEL = 'normal';
const EASY_CARELESS_RATE = 0.25; // やさしいの CPU が、考えずに打つ割合

export const isLevel = (level) => Object.hasOwn(LEVELS, level);

// この局面での乱数（シードと手数で決まる）
const positionRandom = (game) => createRandom((game.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1)) >>> 0);

// 良い手を考えない手
function carelessCommand(game, random) {
    const { garden } = game.getCurrentPlayer();
    if (!game.holding) return game.pool.length > 0 ? { type: 'draw' } : null;
    const cells = validPlacements(garden, game.holding.number);
    const mustPlace = game.holding.from === 'table';
    if (cells.length === 0 || (!mustPlace && random() < 0.3)) return mustPlace ? null : { type: 'discard' };
    const { row, col } = cells[Math.floor(random() * cells.length)];
    return { type: 'place', row, col };
}

// 今の手番の CPU が、強さ level で次に送る操作
export function chooseLeveledCommand(game, level = DEFAULT_LEVEL) {
    if (level === 'easy') {
        const random = positionRandom(game);
        if (random() < EASY_CARELESS_RATE) {
            const command = carelessCommand(game, random);
            if (command) return command;
        }
    }
    return chooseCpuCommand(game);
}

// 強さ level の CPU の手を1つ進める
export function runLeveledCpuStep(game, level = DEFAULT_LEVEL) {
    if (!isCpuTurn(game)) return false;
    return game.applyCommand(game.currentPlayerIndex, chooseLeveledCommand(game, level));
}
