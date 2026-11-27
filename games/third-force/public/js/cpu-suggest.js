/**
 * ヒント（おすすめの1行）と「試す」
 * suggest(tactic, opponent)：雛形の行を、出撃ルールの上・中・下に1行足した版を、相手と数シードずつ戦わせ、一番よい版を返す
 * trial(tactic, opponent, n)：相手と n 回戦わせた勝ち負け（席は交互にする）
 * どちらも重いので、画面からは Web Worker（hint-worker.js）で回す
 */

import { runBattle } from './battle.js';
import { MAX_RULES, normalizeTactic } from './rules.js';

const line = (when, act) => ({ on: true, when, act, wait: 0 });
const threat = (cls, dist, unless) => ({ k: 'threat', cls, dist, unless });
const spawn = (unit, at) => ({ k: 'spawn', unit, at });

// 雛形（よく効く行の型）
export const TEMPLATES = [
    line([threat('air', 50, ['missile'])], spawn('missile', 'target')),
    line([threat('air', 100, ['missile'])], spawn('missile', 'target')),
    line([threat('air', 75, ['fighter'])], spawn('fighter', 'target')),
    line([threat('ground', 50, ['tank'])], spawn('tank', 'target')),
    line([threat('ground', 100, ['tank'])], spawn('tank', 'target')),
    line([threat('ground', 100, ['rocket'])], spawn('rocket', 'target')),
    line([threat('ground', 50, ['attacker'])], spawn('attacker', 'target')),
    line([threat('all', 25, ['cannon'])], spawn('cannon', 'target')),
    line([{ k: 'money', op: 'lt', n: 2000 }], { k: 'save' }),
    line([{ k: 'money', op: 'lt', n: 4000 }], { k: 'save' }),
    line([{ k: 'chance', n: 20 }], spawn('infantry', 'random')),
    line([{ k: 'money', op: 'ge', n: 6000 }], spawn('infantry', 'weakest')),
    line([{ k: 'money', op: 'ge', n: 8000 }], spawn('bomber', 'weakest')),
    line([{ k: 'money', op: 'ge', n: 5000 }], spawn('rocket', 'weakest')),
    line([{ k: 'count', who: 'own', cls: 'tank', op: 'le', n: 2 }], spawn('tank', 'middle')),
    line([{ k: 'count', who: 'enemy', cls: 'air', op: 'ge', n: 3 }], spawn('missile', 'weakest')),
    line([{ k: 'time', op: 'ge', n: 60 }], spawn('infantry', 'random')),
    line([{ k: 'life', who: 'diff', op: 'le', n: -200 }], spawn('infantry', 'weakest')),
    line([{ k: 'chance', n: 10 }], spawn('cannon', 'random')),
    line([{ k: 'life', who: 'diff', op: 'ge', n: 200 }], { k: 'save' })
];

// 1つの戦術を、席を交互にして seeds の数だけ戦わせる
export function trial(tactic, opponent, seeds = 10) {
    const list = Array.isArray(seeds) ? seeds : Array.from({ length: seeds }, (_, i) => i + 1);
    const result = { wins: 0, losses: 0, draws: 0, diff: 0, games: list.length };
    list.forEach((seed, i) => {
        const side = i % 2;
        const tactics = side === 0 ? [tactic, opponent] : [opponent, tactic];
        const battle = runBattle({ seed, tactics });
        if (battle.winner === side) result.wins++;
        else if (battle.winner === null) result.draws++;
        else result.losses++;
        result.diff += battle.sides[side].life - battle.sides[1 - side].life;
    });
    return result;
}

const scoreOf = (r) => (r.wins + r.draws / 2) * 10000 + r.diff;

/**
 * おすすめの1行。返り値 { line, index（入れる位置）, tactic（足した版）, result, base }。出せなければ null
 * - 行が 12 行なら出さない
 * - 足しても今より良くならなければ improved: false
 */
export function suggest(tactic, opponent, { seeds = [11, 12, 13], keep = 6 } = {}) {
    if (!tactic || !Array.isArray(tactic.rules) || !opponent || !Array.isArray(opponent.rules)) return null;
    if (tactic.rules.length >= MAX_RULES) return null;
    const base = trial(tactic, opponent, seeds);
    const positions = [...new Set([0, Math.floor(tactic.rules.length / 2), tactic.rules.length])];
    // 1段目：全部の版を1シードでふるう。2段目：上位の版だけを全部のシードで比べる
    const screened = [];
    for (const template of TEMPLATES) {
        for (const index of positions) {
            const rules = [...tactic.rules];
            rules.splice(index, 0, structuredClone(template));
            const variant = normalizeTactic({ ...tactic, rules });
            screened.push({ line: structuredClone(template), index, tactic: variant, score: scoreOf(trial(variant, opponent, seeds.slice(0, 1))) });
        }
    }
    screened.sort((a, b) => b.score - a.score);
    let best = null;
    for (const candidate of screened.slice(0, keep)) {
        const result = trial(candidate.tactic, opponent, seeds);
        if (!best || scoreOf(result) > scoreOf(best.result)) best = { line: candidate.line, index: candidate.index, tactic: candidate.tactic, result };
    }
    return { ...best, base, improved: scoreOf(best.result) > scoreOf(base) };
}
