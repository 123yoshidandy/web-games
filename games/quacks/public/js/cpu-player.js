/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（袋の並びはのぞかない。中身の数は実物でも分かる）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 止める判断
 *   - normal（ふつう）：もう1つ引いたときの見込み（爆発の確率と、進んだマスの点・お金・ルビー）と、今止めた値を比べる
 *   - easy（やさしい）：爆発の確率がしきい値（毎回揺れる）を超えたら止める。損得は見ない
 * - 買い物
 *   - normal：材料ごとの値打ち（進む量・効果・残りの回数）で、買える組み合わせのいちばんよいものを選ぶ。ルビーでしずくを進める
 *   - easy：買えるものから気まぐれに選ぶ。ルビーはフラスコにしか使わない
 * - strong（強さを測る比較用）は、normal から揺れを除いたもの。random は、でたらめに選ぶ
 */

import { createGameView } from './game-view.js';
import { createRandom } from './random.js';
import {
    ROUNDS, RUBY_COST, MARKET, space, chipColor, chipValue, chipCost, available
} from './data.js';

export const PROFILES = {
    easy: { name: 'easy', ev: false, risk: 0.28, riskSpread: 0.22, smartShop: false, useRubies: false, noise: 0 },
    normal: { name: 'normal', ev: true, optimism: 0.1, noise: 0.35, smartShop: true, useRubies: true, shopNoise: 0.15 },
    strong: { name: 'strong', ev: true, optimism: 0.1, noise: 0, smartShop: true, useRubies: true, shopNoise: 0 },
    random: { name: 'random', random: true }
};

// 画面で選ぶ強さ
export const LEVELS = { easy: 'やさしい', normal: 'ふつう' };

// 今操作が必要な CPU の席
export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// 回ごとの値打ち（後の回ほど、お金・ルビー・しずくは役に立たなくなる）
const COIN_WEIGHT = [0, 0.55, 0.52, 0.48, 0.44, 0.40, 0.35, 0.30, 0.25, 0.20];
const RUBY_WEIGHT = [0, 1.2, 1.15, 1.1, 1.05, 1, 0.9, 0.8, 0.65, 0.5];
const DROPLET_WEIGHT = [0, 3, 2.7, 2.4, 2.1, 1.8, 1.5, 1.1, 0.7, 0];
const at = (list, round) => list[Math.max(0, Math.min(ROUNDS, round))];

export function chooseCpuCommand(game, seat, profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    return decide(view, cpuRandom(game, seat), profile);
}

// seat の CPU に1手打たせる。決めた手が断られたら、いちばん単純な手で必ず前に進める
export function runCpuStep(game, seat, profile = PROFILES.normal) {
    if (!game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    const p = game.players[seat];
    const fallbacks = [
        p.prompts[0] && { type: 'choose', option: p.prompts[0].options[0].key },
        p.brew?.pending && { type: 'pick', index: -1 },
        { type: 'stop' },
        { type: 'shop', buy: [], droplet: 0, refill: false }
    ].filter(Boolean);
    return fallbacks.some(c => game.applyCommand(seat, c));
}

// ---- 判断 ----

export function decide(view, random, profile = PROFILES.normal) {
    const me = view.me;
    if (me.prompt) return { type: 'choose', option: choosePrompt(view, me.prompt, random, profile) };
    if (me.pending) return { type: 'pick', index: pickChip(view, me.pending.chips, random, profile) };
    if (view.phase === 'brew') return brewStep(view, random, profile);
    if (view.phase === 'shop') return shopping(view, random, profile);
    return null;
}

// 鍋の1手
function brewStep(view, random, profile) {
    const me = view.me;
    const p = view.players[view.you];
    if (profile.random) {
        if (me.canDraw && random() < 0.8) return { type: 'draw' };
        return { type: 'stop' };
    }
    if (me.canBubble || me.canMandrake) return { type: me.canBubble ? 'bubble' : 'mandrake' };
    if (me.canFlask) {
        const last = p.pot.at(-1);
        const v = chipValue(last.chip);
        const tight = p.brew.whites >= view.whiteLimit - 3;
        const use = profile.ev ? v >= 2 || tight : random() < 0.5;
        if (use) return { type: 'flask' };
    }
    if (me.canRestart && profile.ev && p.brew.whites >= 5) return { type: 'restart' };
    if (!me.canDraw) return { type: 'stop' };
    return shouldDraw(view, random, profile) ? { type: 'draw' } : { type: 'stop' };
}

// 止めずにもう1つ引くか
export function shouldDraw(view, random, profile) {
    const p = view.players[view.you];
    const risk = view.me.risk;
    if (risk === 0) return true;
    if (!profile.ev) return risk < profile.risk + (random() - 0.5) * profile.riskSpread;
    const now = spaceValue(p.brew.pos + 1, false, view.round, view);
    const next = drawOutlook(view);
    return next + profile.optimism + (random() * 2 - 1) * profile.noise > now;
}

// 最後のマスの値打ち。爆発したら点かお金の一方だけ
export function spaceValue(index, exploded, round, view = null) {
    const s = space(index);
    const coinWeight = at(COIN_WEIGHT, round);
    const coins = s.coins * coinWeight;
    const ruby = s.ruby ? at(RUBY_WEIGHT, round) : 0;
    let value = exploded ? Math.max(s.points, coins) + ruby : s.points + coins + ruby;
    // 先頭にいればサイコロも振れる（大まかに）
    if (!exploded && view) {
        const others = view.players.filter(o => o.id !== view.you && o.brew?.done && !o.brew.exploded);
        if (others.every(o => o.brew.pos + 1 <= index)) value += 0.4;
    }
    return value;
}

// もう1つ引いたときの見込み（袋の中身の数から）
function drawOutlook(view) {
    const p = view.players[view.you];
    const entries = Object.entries(p.bag);
    const total = p.bagCount;
    const oranges = p.pot.filter(e => chipColor(e.chip) === 'O').length;
    let sum = 0;
    entries.forEach(([chip, count]) => {
        const color = chipColor(chip);
        let move = chipValue(chip);
        if (color === 'R') move += oranges >= 3 ? 2 : oranges >= 1 ? 1 : 0;
        if (color === 'O' && view.fortune?.id === 'pumpkin') move += 1;
        if (color === 'B') move += 1; // カラスでもう1つ置ける見込み
        const pos = p.brew.pos + move;
        const exploded = color === 'W' && p.brew.whites + chipValue(chip) > view.whiteLimit;
        // フラスコが満ちていれば、白は戻せる（その分、少しだけ前に進まない）
        const flaskBack = color === 'W' && !exploded && p.flask && chipValue(chip) >= 2;
        const index = flaskBack ? p.brew.pos + 1 : pos + 1;
        sum += count * (spaceValue(index, exploded, view.round, view) - (flaskBack ? 0.6 : 0));
    });
    return sum / total;
}

// カラス・「念のため」で引いた中から、鍋に置くもの（白は置かない）
function pickChip(view, chips, random, profile) {
    if (profile.random) return Math.floor(random() * (chips.length + 1)) - 1;
    let best = -1;
    let bestValue = 0;
    chips.forEach((chip, i) => {
        if (chipColor(chip) === 'W') return;
        const value = chipValue(chip) + (chipColor(chip) === 'R' ? 1 : 0) + (chipColor(chip) === 'G' ? 0.5 : 0);
        if (value > bestValue) {
            best = i;
            bestValue = value;
        }
    });
    return best;
}

// ---- 選択 ----

function optionValue(view, option) {
    const round = view.round;
    const p = view.players[view.you];
    const [what, arg] = option.key.split(':');
    if (what === 'chip' || what === 'upgrade') return chipWorth(option.chip ?? arg, round, p.bag) * (what === 'upgrade' ? 0.5 : 1);
    if (what === 'rubies') return Number(arg) * at(RUBY_WEIGHT, round);
    if (what === 'vp') return Number(arg);
    if (what === 'droplet') return Number(arg) * at(DROPLET_WEIGHT, round);
    if (what === 'removeWhite') return (ROUNDS - round) * 0.5;
    if (what === 'rats') return Number(arg) * (at(RUBY_WEIGHT, round) - 0.6);
    if (what === 'die') return { vp1: 1, vp2: 2, ruby: at(RUBY_WEIGHT, round), droplet: at(DROPLET_WEIGHT, round), pumpkin: 0.8 }[arg];
    if (what === 'explode') {
        const s = space(p.result.space);
        return arg === 'points' ? s.points : s.coins * at(COIN_WEIGHT, round) * (round === ROUNDS ? 1 : 1.1);
    }
    return 0;
}

function choosePrompt(view, prompt, random, profile) {
    const options = prompt.options;
    if (profile.random || !profile.ev && random() < 0.5) return options[Math.floor(random() * options.length)].key;
    let best = options[0];
    let bestValue = -Infinity;
    options.forEach(option => {
        const value = optionValue(view, option) + (random() * 2 - 1) * (profile.noise ?? 0) * 0.5;
        if (value > bestValue) {
            best = option;
            bestValue = value;
        }
    });
    return best.key;
}

// ---- 買い物 ----

// 材料1つの値打ち（残りの回で何度引けるか、を大まかに掛ける）
export function chipWorth(chip, round, bag = {}) {
    const color = chipColor(chip);
    const value = chipValue(chip);
    const count = (c) => Object.entries(bag).filter(([k]) => chipColor(k) === c).reduce((s, [, n]) => s + n, 0);
    let worth = value * 0.9 + 0.6; // 進む量と、白が引かれにくくなる分
    if (color === 'O') worth += 0.2 * count('R');
    if (color === 'R') worth += count('O') >= 2 ? 1.2 : 0.6;
    if (color === 'G') worth += 0.7;
    if (color === 'B') worth += value * 0.5;
    if (color === 'Y') worth += 1.1;
    if (color === 'P') worth += 1.5 + Math.min(2, count('P')) * 0.8;
    if (color === 'K') worth += 1.6;
    const left = Math.max(0, ROUNDS - round);
    return worth * (0.4 + left * 0.3);
}

function shopping(view, random, profile) {
    const p = view.players[view.you];
    const coins = view.me.coins;
    const round = view.round;
    const choices = MARKET.filter(chip => available(chip, round) && chipCost(chip) <= coins);
    let buy = [];
    if (profile.random || !profile.smartShop) {
        const pool = [...choices];
        const picks = profile.random ? Math.floor(random() * 3) : 1 + (random() < 0.5 ? 1 : 0);
        let left = coins;
        for (let i = 0; i < picks && pool.length > 0; i++) {
            const options = pool.filter(chip => chipCost(chip) <= left && !buy.some(b => chipColor(b) === chipColor(chip)));
            if (options.length === 0) break;
            const chip = options[Math.floor(random() * options.length)];
            buy.push(chip);
            left -= chipCost(chip);
        }
    } else {
        let bestValue = 0;
        const worth = (chip) => chipWorth(chip, round, p.bag) * (1 + (random() * 2 - 1) * (profile.shopNoise ?? 0));
        const values = Object.fromEntries(choices.map(chip => [chip, worth(chip)]));
        choices.forEach((a, i) => {
            if (values[a] > bestValue) {
                bestValue = values[a];
                buy = [a];
            }
            choices.slice(i + 1).forEach(b => {
                if (chipColor(a) === chipColor(b) || chipCost(a) + chipCost(b) > coins) return;
                if (values[a] + values[b] > bestValue) {
                    bestValue = values[a] + values[b];
                    buy = [a, b];
                }
            });
        });
    }
    // ルビー
    let rubies = p.rubies;
    let refill = false;
    let droplet = 0;
    if (!profile.random && !p.flask && rubies >= RUBY_COST && round < ROUNDS - 1) {
        refill = true;
        rubies -= RUBY_COST;
    }
    if (profile.useRubies && round <= ROUNDS - 2) {
        droplet = Math.floor(rubies / RUBY_COST);
    }
    return { type: 'shop', buy, droplet, refill };
}
