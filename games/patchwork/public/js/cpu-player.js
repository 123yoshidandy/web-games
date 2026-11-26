/**
 * CPU（DOM に依存しない）
 *
 * 買う：パッチの価値 = 面積×2 − ボタンの値段 + 収入×残りの収入マスの数 − 時間×1 で見積もる
 *       （1マス埋めると −2 を避けられる。進むと1マスにつきボタン1つなので、時間1をボタン1と見なす）
 *       置き場所の良さも少し足し、いちばん高いものが「進む」より良ければ買う
 * 置く：キルトの縁やほかのパッチに接するほど良く、1マスだけ孤立した空きを作るほど悪い
 * 強すぎないように、人間らしい見落とし（パッチや置き場所を見ない）と見積もりのぶれを入れる。
 * CPU の判断には、ゲームの乱数を使わない（状態から作った別の乱数を使う）
 */

import {
    ORIENTATIONS, QUILT_SIZE, INCOME_SPACES, legalPlacements, placementCells, patchArea
} from './game.js';
import { PATCHES } from './patches.js';
import { createRandom } from './random.js';

export const CPU_STYLES = {
    easy: { overlook: 0.35, noise: 3 },
    normal: { overlook: 0.15, noise: 1.2 },
    strong: { overlook: 0, noise: 0 } // 強さを測るときの比べる相手。画面では使わない
};

function cpuRandom(game, seat) {
    const seed = (game.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0;
    return createRandom(seed);
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inside = (x, y) => x >= 0 && y >= 0 && x < QUILT_SIZE && y < QUILT_SIZE;

export const incomesLeft = position => INCOME_SPACES.filter(s => s > position).length;

// 置き場所の良さ：縁や埋まったマスに接する辺の数 − 孤立した空きマス
export function placementScore(quilt, cells) {
    const mine = new Set(cells.map(([x, y]) => `${x},${y}`));
    let contact = 0;
    for (const [x, y] of cells) {
        for (const [dx, dy] of DIRS) {
            const nx = x + dx;
            const ny = y + dy;
            if (mine.has(`${nx},${ny}`)) continue;
            if (!inside(nx, ny) || quilt[ny][nx] !== null) contact++;
        }
    }
    // 置いたあと、まわりに空きのない空きマス（埋めにくい穴）を数える
    let holes = 0;
    const filled = (x, y) => !inside(x, y) || quilt[y][x] !== null || mine.has(`${x},${y}`);
    const checked = new Set();
    for (const [x, y] of cells) {
        for (const [dx, dy] of DIRS) {
            const nx = x + dx;
            const ny = y + dy;
            const key = `${nx},${ny}`;
            if (checked.has(key) || filled(nx, ny)) continue;
            checked.add(key);
            if (DIRS.every(([ex, ey]) => filled(nx + ex, ny + ey))) holes++;
        }
    }
    return contact * 0.5 - holes * 3;
}

// 置き場所を選ぶ（見落としあり）
function choosePlacement(quilt, id, style, random) {
    const all = legalPlacements(quilt, id);
    if (all.length === 0) return null;
    let candidates = all.filter(() => random() >= style.overlook);
    if (candidates.length === 0) candidates = [all[Math.floor(random() * all.length)]];
    let best = null;
    let bestScore = -Infinity;
    for (const p of candidates) {
        const cells = placementCells(quilt, ORIENTATIONS[id][p.orient], p.x, p.y);
        const score = placementScore(quilt, cells) + (random() * 2 - 1) * style.noise * 0.3;
        if (score > bestScore) {
            bestScore = score;
            best = { ...p, score };
        }
    }
    return best;
}

// パッチの価値
export function patchValue(game, seat, id) {
    const patch = PATCHES[id];
    const player = game.players[seat];
    return patchArea(id) * 2 - patch.cost + patch.income * incomesLeft(player.position) - patch.time;
}

// 革のパッチの置き場所：まわりの空きが少ないマス（穴）を先に埋める
function chooseLeather(quilt) {
    let best = null;
    let bestScore = Infinity;
    for (let y = 0; y < QUILT_SIZE; y++) {
        for (let x = 0; x < QUILT_SIZE; x++) {
            if (quilt[y][x] !== null) continue;
            const free = DIRS.filter(([dx, dy]) => inside(x + dx, y + dy) && quilt[y + dy][x + dx] === null).length;
            if (free < bestScore) {
                bestScore = free;
                best = { x, y };
            }
        }
    }
    return best;
}

// CPU の手（操作）を決める
export function chooseCommand(game, seat = game.current, style = CPU_STYLES.normal) {
    const random = cpuRandom(game, seat);
    const quilt = game.players[seat].quilt;
    if (game.pendingLeather) return { type: 'leather', ...chooseLeather(quilt) };

    let best = { type: 'advance' };
    let bestValue = (random() * 2 - 1) * style.noise; // 進む手の価値は 0（ボタンと時間がつり合う）
    game.offer.forEach((id, choice) => {
        if (!game.canBuy(seat, choice)) return;
        if (random() < style.overlook) return; // 見落とし
        const placement = choosePlacement(quilt, id, style, random);
        if (!placement) return;
        const value = patchValue(game, seat, id) + placement.score * 0.3 + (random() * 2 - 1) * style.noise;
        if (value > bestValue) {
            bestValue = value;
            best = { type: 'buy', choice, orient: placement.orient, x: placement.x, y: placement.y };
        }
    });
    return best;
}

export const isCpuTurn = game => game.phase !== 'end' && game.players[game.current].isCPU;

// CPU の番なら1手進める。進めたら true
export function runCpuStep(game, style = CPU_STYLES.normal) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    if (game.applyCommand(seat, chooseCommand(game, seat, style))) return true;
    // 想定していない形で断られたら、いちばん単純な答えで必ず進める
    if (game.pendingLeather) return game.applyCommand(seat, { type: 'leather', ...chooseLeather(game.players[seat].quilt) });
    return game.applyCommand(seat, { type: 'advance' });
}

// ヒント：人の番に、CPU（見落としもぶれもない強さ）が選ぶ手を返す。パッチワークに隠れた情報はない
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.phase === 'end' || game.current !== seat) return null;
    return chooseCommand(game, seat, CPU_STYLES.strong);
}
