/**
 * CPU とヒント
 * 強さ（game.options.level）
 * - easy（やさしい）：全員が「常時：最も近い敵を攻撃」の戦術ルールで動く
 * - normal（ふつう）：おすすめの戦術ルール（HPが減ったら離れて攻撃・射程内なら最も弱い敵・ほかは最も近い敵）で動く
 * - hard（つよい）：ルールを使わず、行動の候補をすべて比べる（与えるダメージ・たおせる見込み・動いた先で受ける反撃の見込み）
 * ヒント（suggest）は hard と同じ考え方で、その席の次の1手を返す。状態は変えない
 * 乱数は使わない（同じ局面なら同じ手）。CPU の手持ちはシードから決める
 */

import { createRandom, shuffle } from './random.js';
import { SPECIES_IDS, SPECIES, TEAM_SIZE, MOVE_SLOTS, MOVES, DEFAULT_RULES } from './data.js';
import { calcDamage, expectedDamage, ROLL_MIN } from './damage.js';
import { reachable, attackOptions, distanceField, enemiesOf, unitsOf, dist, key } from './rules.js';

export const LEVELS = ['easy', 'normal', 'hard'];
export const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };

const RULES_BY_LEVEL = {
    easy: [{ cond: 'always', act: 'nearest' }],
    normal: DEFAULT_RULES,
    hard: DEFAULT_RULES
};

// CPU の手持ち：シードと席から6体を選ぶ（技は最初の組）
export function cpuTeam(seed, seat, level = 'normal') {
    const random = createRandom((seed ^ (0x9e3779b9 * (seat + 1))) >>> 0);
    const ids = shuffle([...SPECIES_IDS], random).slice(0, TEAM_SIZE);
    return ids.map(id => ({ id, moves: SPECIES[id].pool.slice(0, MOVE_SLOTS), rules: (RULES_BY_LEVEL[level] ?? DEFAULT_RULES).map(r => ({ ...r })) }));
}

const levelOf = (game) => (LEVELS.includes(game.options?.level) ? game.options.level : 'normal');

export function isCpuTurn(game) {
    return game.actors().some(s => game.players[s].isCPU);
}

// 相手のポケモンが、次のフェイズで技を届かせられるマス（技ごと）
function threatMap(s, seat) {
    return enemiesOf(s, seat).map(e => {
        const cells = reachable(s, 1 - seat, e.i);
        const perMove = e.u.moves.map(moveId => {
            const range = MOVES[moveId].range;
            const set = new Set();
            for (const c of cells.values()) {
                for (let dx = -range; dx <= range; dx++) {
                    for (let dy = -(range - Math.abs(dx)); dy <= range - Math.abs(dx); dy++) set.add((c.y + dy) * 100 + (c.x + dx));
                }
            }
            return set;
        });
        return { e, perMove };
    });
}

// マス c に立った u が、次の相手のフェイズで受けそうなダメージの割合（skip の相手は数えない）
function danger(threats, u, c, skip = null) {
    let total = 0;
    for (const { e, perMove } of threats) {
        if (e.i === skip) continue;
        let top = 0;
        e.u.moves.forEach((moveId, m) => {
            if (perMove[m].has(c.y * 100 + c.x)) top = Math.max(top, expectedDamage(e.u, u, moveId));
        });
        total += top;
    }
    return Math.min(1.5, total / Math.max(1, u.hp));
}

// たおせる見込み（乱数の下限でもたおせるなら命中率、上限ならその半分）
function koChance(u, t, moveId) {
    const low = calcDamage(u, t, moveId, ROLL_MIN).damage;
    const high = calcDamage(u, t, moveId, 1).damage;
    const acc = MOVES[moveId].acc / 100;
    return low >= t.hp ? acc : high >= t.hp ? acc * 0.5 : 0;
}

// 強い手：まだ動いていないポケモンと、その行動の候補をすべて比べて、いちばんよいものを返す
export function bestAction(s, seat) {
    const own = unitsOf(s, seat);
    const foes = unitsOf(s, 1 - seat);
    const threats = threatMap(s, seat);
    const fields = new Map();
    let top = null;
    own.forEach((u, i) => {
        if (u.fainted || u.acted) return;
        const cells = reachable(s, seat, i);
        const consider = (score, to, move, target) => {
            const tie = [-score, i, key(to), move ?? -1, target ?? -1];
            if (!top || less(tie, top.tie)) top = { tie, command: { type: 'act', unit: i, to: { x: to.x, y: to.y }, move, target } };
        };
        for (const o of attackOptions(s, seat, i, cells)) {
            const t = foes[o.target];
            const moveId = u.moves[o.move];
            const ko = koChance(u, t, moveId);
            const frac = Math.min(o.exp, t.hp) / t.maxHp;
            const score = 10 + frac * 100 + ko * 80 - danger(threats, u, o.to, ko >= 0.5 ? o.target : null) * 30 - o.steps * 0.1;
            consider(score, o.to, o.move, o.target);
        }
        // 攻撃できないとき：相手へ近づきつつ、反撃の少ないマスへ
        const target = enemiesOf(s, seat).reduce((a, b) => (dist(u, b.u) < dist(u, a.u) ? b : a), enemiesOf(s, seat)[0]);
        if (!target) return;
        if (!fields.has(target.i)) fields.set(target.i, distanceField(s, target.u));
        const field = fields.get(target.i);
        for (const c of cells.values()) {
            const score = -field[key(c)] * 3 - danger(threats, u, c) * 10 - c.steps * 0.1;
            consider(score, c, null, null);
        }
    });
    return top?.command ?? null;
}

function less(a, b) {
    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return a[j] < b[j];
    return false;
}

// 次の手（seat の席が今打てる操作）。打てなければ null
export function chooseCommand(game, seat, level = levelOf(game)) {
    if (!game.actors().includes(seat)) return null;
    if (game.phase === 'setup') return { type: 'team', team: cpuTeam(game.options.seed, seat, level) };
    if (level === 'hard') return bestAction(game, seat) ?? { type: 'end' };
    const i = unitsOf(game, seat).findIndex(u => !u.fainted && !u.acted);
    return i < 0 ? { type: 'end' } : { type: 'auto', unit: i };
}

// ヒント：その席のおすすめの手（つよい CPU と同じ考え方）。状態は変えない
export function suggest(game, seat) {
    return chooseCommand(game, seat, 'hard');
}

// CPU の席を1手進める。進めたら true
export function runCpuStep(game) {
    const seat = game.actors().find(s => game.players[s].isCPU);
    if (seat === undefined) return false;
    const command = chooseCommand(game, seat);
    if (!command) return false;
    return game.applyCommand(seat, command);
}
