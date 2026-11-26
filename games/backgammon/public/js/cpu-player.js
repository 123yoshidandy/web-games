/**
 * CPU の手を決める（DOM に依存しない）
 * - バックギャモンには隠す情報がないので、盤の状態をそのまま読む。先読みはせず、動かしたあとの局面の値打ちで手を選ぶ（強すぎないように）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 局面の値打ち（コンタクトあり）＝ピップ数の差＋作ったポイント（インナーボード・バーポイント・相手陣のアンカー）＋プライム
 *   − ブロットが次の相手の目で打たれる見込み×打たれたときの損 − 積みすぎ − バーの駒
 * - 競走（すれ違ったあと）は、ピップ数の差とベアオフの数だけで見る
 * - ダブル：評価から勝つ見込みを見積もり、ふつうは 68% 以上（勝ちすぎの見込みなら、ギャモンを狙って続ける）で提案し、25% 以上なら受ける
 * - やさしい：打たれる見込みを軽く見て、評価の揺れが大きく、ときどき4番目までの手を選ぶ。ダブルの判断も粗い
 */

import { legalPlays, diceList, pipCount, hasContact, BAR, OFF } from './rules.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { risk: 0.6, noise: 6, sloppy: 0.25, doubleAt: 0.62, takeAt: 0.18, cubeNoise: 0.08 },
    normal: { risk: 1.4, noise: 1, sloppy: 0, doubleAt: 0.68, takeAt: 0.25, cubeNoise: 0.02 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

// 作ったポイント（2個以上）の値打ち。自分から見たポイントごと（1〜6 インナーボード、7 バーポイント、19〜24 は相手陣のアンカー）
const POINT_VALUE = [0, 1, 2, 3, 4.5, 6, 5.5, 4.5, 3, 2, 1.5, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 2.5, 4, 4, 2, 1.5, 1];
const ON_ROLL = 8; // 振る番にあることの値打ち（ピップ数で）
const SCALE = 24;  // 評価の差を勝つ見込みに直すときの幅

export const isCpuTurn = (game) => {
    const actors = game.actors();
    return actors.length > 0 && actors.every(seat => game.players[seat].isCPU);
};

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// その人のインナーボードで作ったポイントの数
const homePoints = (side) => {
    let n = 0;
    for (let i = 1; i <= 6; i++) if (side[i] >= 2) n++;
    return n;
};

// 相手のいちばん後ろの駒の位置（自分の向きで。相手のバーは 0）。これより先のポイントだけが、相手の邪魔になる
function oppRear(oppSide) {
    if (oppSide[BAR] > 0) return 0;
    for (let j = 24; j >= 1; j--) if (oppSide[j] > 0) return 25 - j;
    return 25;
}

// 盤の形の値打ち（ピップ数とブロットの危うさを除く）
function shape(side, oppSide) {
    let score = 0;
    let run = 0;
    let best = 0;
    const rear = oppRear(oppSide);
    // 相手がインナーボードに集まったら、相手陣に残った駒はギャモン・バックギャモンの危うさになる
    if (rear >= 19) {
        for (let i = 19; i <= BAR; i++) score -= side[i] * (4 + oppSide[OFF] * 1.5);
    }
    // 相手の駒がインナーボードに集まるほど、自分の外の駒（後ろほど）を早く戻したい
    let oppHome = 0;
    for (let j = 0; j <= 6; j++) oppHome += oppSide[j];
    const progress = (oppHome / 15) ** 2;
    for (let i = 7; i <= BAR; i++) score -= side[i] * (i - 6) / 19 * progress * 10;
    for (let i = 1; i <= 24; i++) {
        const n = side[i];
        if (n >= 2 && i > rear) {
            score += POINT_VALUE[i];
            run++;
            best = Math.max(best, run);
        } else {
            run = 0;
        }
        if (n > 4) score -= (n - 4) * 0.8;
    }
    if (best >= 3) score += (best - 2) ** 2 * 2.5;
    // バーの駒：相手のインナーボードが固いほど痛い
    score -= side[BAR] * (5 + homePoints(oppSide) * 2);
    return score;
}

// 相手の次の目で、me のブロットが打たれるときの損の見込み（36通りの目ごとに、打たれる中で一番痛いブロットを数える）
export function blotRisk(me, opp) {
    const blots = [];
    for (let i = 1; i <= 24; i++) if (me[i] === 1) blots.push(i);
    if (!blots.length) return 0;
    // 相手の駒の位置を、自分の向きに直す（相手のバーは 0。相手は数の大きい方へ進む）
    const shooters = [];
    if (opp[BAR] > 0) shooters.push(0);
    else for (let j = 1; j <= 24; j++) if (opp[j] > 0) shooters.push(25 - j);
    const blocked = (k) => k >= 1 && k <= 24 && me[k] >= 2;
    const oppHome = homePoints(opp);
    // 打たれると、そこまで進めたピップ数を失い、相手のインナーボードが固いほど入りにくい
    const cost = (i) => (25 - i) + 8 + oppHome * 3;
    let total = 0;
    for (let a = 1; a <= 6; a++) {
        for (let b = 1; b <= 6; b++) {
            let worst = 0;
            for (const i of blots) {
                if (cost(i) <= worst) continue;
                let hit = false;
                for (const k of shooters) {
                    const d = i - k;
                    if (d <= 0) continue;
                    if (a === b) {
                        for (let n = 1; n <= 4 && !hit; n++) {
                            if (blocked(k + a * n) && a * n < d) break;
                            if (a * n === d) hit = true;
                        }
                    } else if (d === a || d === b) {
                        hit = true;
                    } else if (d === a + b && (!blocked(k + a) || !blocked(k + b))) {
                        hit = true;
                    }
                    if (hit) break;
                }
                if (hit) worst = cost(i);
            }
            total += worst;
        }
    }
    return total / 36;
}

// 局面の値打ち（seat から見て）。onRoll：seat がこれから振る（ダブルの判断）か、相手が振る（動かしたあと）か
export function evaluate(board, seat, { onRoll = false, risk = 1 } = {}) {
    const me = board[seat];
    const opp = board[1 - seat];
    if (me[OFF] === 15) return 1000;
    if (opp[OFF] === 15) return -1000;
    const pipDiff = pipCount(opp) - pipCount(me);
    if (!hasContact(board)) return pipDiff + (onRoll ? ON_ROLL : -ON_ROLL) + (me[OFF] - opp[OFF]) * 0.5;
    let score = pipDiff + shape(me, opp) - shape(opp, me);
    if (onRoll) score += ON_ROLL + blotRisk(opp, me) * 0.5;
    else score -= ON_ROLL + blotRisk(me, opp) * risk;
    return score;
}

const logistic = (x) => 1 / (1 + Math.exp(-x));

// seat が振る前の、勝つ見込み（0〜1）
export function winChance(board, seat) {
    if (!hasContact(board)) {
        const mine = pipCount(board[seat]);
        const theirs = pipCount(board[1 - seat]);
        return logistic((theirs - mine + 4) / (0.08 * mine + 3));
    }
    return logistic(evaluate(board, seat, { onRoll: true }) / SCALE);
}

// 手ごとの値打ち（行き着く盤が同じ手は1つ）
export function scorePlays(board, seat, dice, profile = PROFILES.normal) {
    return legalPlays(board, seat, dice).plays.map(p => ({ steps: p.steps, score: evaluate(p.board, seat, { risk: profile.risk ?? 1 }) }));
}

// クロフォードのあと、相手がマッチの1点前で自分が届いていないなら、すぐダブルする（相手はもう失うものがない）
function postCrawfordTrailer(game, seat) {
    const target = game.options.matchLength;
    return game.crawfordDone && !game.state.crawford && game.score[1 - seat] === target - 1 && game.score[seat] < target - 1;
}

export function shouldDouble(game, seat, profile, random) {
    if (!game.canDouble(seat)) return false;
    if (postCrawfordTrailer(game, seat)) return true;
    const p = winChance(game.state.board, seat) + (random() - 0.5) * 2 * (profile.cubeNoise ?? 0);
    if (p < profile.doubleAt) return false;
    // 勝ちすぎの見込みなら、相手は降りるので、ギャモンを狙って続ける（競走ではギャモンがないので提案する）
    return !hasContact(game.state.board) || p < 0.88;
}

export function shouldTake(game, seat, profile, random) {
    const doubler = 1 - seat;
    if (postCrawfordTrailer(game, doubler)) return true;
    // 降りるとマッチが終わるなら、受けるしかない
    if (game.score[doubler] + game.state.cube.value >= game.options.matchLength) return true;
    const p = winChance(game.state.board, seat);
    // 相手が振る番なので、自分の見込みは振る番の分を引いて見る
    const mine = 1 - winChance(game.state.board, doubler);
    return Math.min(p, mine) + (random() - 0.5) * 2 * (profile.cubeNoise ?? 0) >= profile.takeAt;
}

export function chooseCpuCommand(game, seat = game.actors()[0], profile = PROFILES.normal) {
    const s = game.state;
    const random = cpuRandom(game, seat);
    if (s.phase === 'between') return { type: 'next' };
    if (s.phase === 'double') {
        if (profile.random) return { type: random() < 0.6 ? 'take' : 'drop' };
        return { type: shouldTake(game, seat, profile, random) ? 'take' : 'drop' };
    }
    if (s.phase === 'roll') {
        if (profile.random) return { type: 'roll' };
        return { type: shouldDouble(game, seat, profile, random) ? 'double' : 'roll' };
    }
    if (s.phase !== 'move') return null;
    const plays = game.legal().plays;
    if (!plays.length) return null;
    if (profile.random) return { type: 'play', steps: plays[Math.floor(random() * plays.length)].steps };
    const noisy = scorePlays(s.board, s.turn, s.dice, profile)
        .map(x => ({ ...x, score: x.score + (random() - 0.5) * 2 * (profile.noise ?? 0) }))
        .sort((a, b) => b.score - a.score);
    if (random() < (profile.sloppy ?? 0)) {
        const top = noisy.slice(0, 3);
        return { type: 'play', steps: top[Math.floor(random() * top.length)].steps };
    }
    return { type: 'play', steps: noisy[0].steps };
}

// ヒント：人の番に、CPU（ふつう）が選ぶ操作（盤はすべて見えている）。手は打たない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat) || game.state.phase === 'between') return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

// CPU の1手を進める。選んだ手が通らなければ、いちばん単純な手で進める（止まらないように）
export function runCpuStep(game, seat = game.actors()[0], profile = PROFILES.normal) {
    if (game.isOver() || !game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    const s = game.state;
    const fallback = s.phase === 'between' ? { type: 'next' } : s.phase === 'double' ? { type: 'take' } : s.phase === 'roll' ? { type: 'roll' }
        : { type: 'play', steps: game.legal().plays[0]?.steps ?? [] };
    return game.applyCommand(seat, fallback);
}

export { diceList };
