/**
 * CPU の判断（DOM に依存しない）
 * chooseCommand はビュー（全員の地・場・自分の自然トークン）だけを見て決める。山と袋の順はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：組ごとに、タイルの置き方とトークンの置き方を見積もって、いちばん値の高い手を選ぶ
 * - 動物：得点カードの点の増え＋「その動物をあと1つ置けたら増える点」の LOOKAHEAD 倍（残りの手番が少ないほど薄める）
 *   トークンでふさいだ空きの印の分（ほかの動物の見込み）も差し引く
 * - 地形：各地形のいちばん大きいつながり＋2番目のつながりの SECOND 倍＋いちばん大きいつながりの空いた辺の EDGE 倍
 *   人数がいれば、最大のつながりのボーナスの見込みも足す（ほかの人のつながりと比べる）
 * - キーストーンに置いて得る自然トークンは NATURE_VALUE 点。自然トークンで別々に取るのは、その分を引いても得なときだけ
 * - 3つ同じの流し直しと、自然トークンでの流し直しは使わない
 * やさしい：半分は今の点の増えだけで選び、半分はでたらめ（置ける場所と向きもでたらめ）
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { TILES, ANIMALS, HABITATS } from './tiles.js';
import { key, parseKey, neighbors, neighbor, opposite, edgeHabitat } from './hex.js';
import { scoreAnimal, habitatBonus } from './scoring.js';
import { corridors } from './habitat.js';
import { tokenMap } from './score-tools.js';

export const CPU_LEVELS = ['easy', 'normal'];
const LOOKAHEAD = 0.5;
const SECOND = 0.25;
const EDGE = 0.12;
const NATURE_VALUE = 1.6;
const SPLIT_COST = 1.4;   // 自然トークンを1つ使う重さ（1点＋使い道の分）

// ---- 地の計算（ビューから） ----

export function openSpots(env) {
    const spots = new Map();
    Object.keys(env).forEach(k => {
        const [q, r] = parseKey(k);
        neighbors(q, r).forEach(([x, y]) => {
            const nk = key(x, y);
            if (!env[nk]) spots.set(nk, [x, y]);
        });
    });
    return [...spots.values()];
}

// その向きで、となりのタイルと地形がそろう辺の数
function matchedEdges(env, tile, q, r, rot) {
    let n = 0;
    for (let d = 0; d < 6; d++) {
        const [x, y] = neighbor(q, r, d);
        const there = env[key(x, y)];
        if (!there) continue;
        if (edgeHabitat(TILES[there.tile].habitats, there.rot, opposite(d)) === edgeHabitat(tile.habitats, rot, d)) n++;
    }
    return n;
}

// 地形がいちばん多くそろう向き（同じなら小さい番号）。画面の下書きの最初の向きにも使う
export function bestRotation(env, tile, q, r) {
    if (tile.habitats.length === 1) return 0;
    let best = 0;
    let bestN = -1;
    for (let rot = 0; rot < 6; rot++) {
        const n = matchedEdges(env, tile, q, r, rot);
        if (n > bestN) {
            best = rot;
            bestN = n;
        }
    }
    return best;
}

// 地形の値（いちばん大きいつながり＋2番目＋伸びしろ）
function habitatValue(env, habitat) {
    const groups = corridors(env, habitat).map(g => g.length).sort((a, b) => b - a);
    return (groups[0] ?? 0) + SECOND * (groups[1] ?? 0);
}

// 地形ごとの、いちばん大きいつながりの大きさ
const largest = (env, habitat) => corridors(env, habitat).reduce((m, g) => Math.max(m, g.length), 0);

// 動物の値（今の点＋あと1つ置けたときの増えの見込み）
function animalValue(env, tokens, animal, card, look) {
    const now = scoreAnimal(tokens, animal, card);
    if (look <= 0) return now;
    let best = 0;
    for (const k of Object.keys(env)) {
        const spot = env[k];
        if (spot.token || !TILES[spot.tile].wildlife.includes(animal)) continue;
        tokens[k] = animal;
        const gain = scoreAnimal(tokens, animal, card) - now;
        delete tokens[k];
        if (gain > best) best = gain;
    }
    return now + look * best;
}

// ---- 手の候補 ----

// 取れる組（[タイルの枠, トークンの枠, 別々か]）
function pairChoices(view, allowSplit) {
    const out = [];
    for (let t = 0; t < 4; t++) {
        for (let w = 0; w < 4; w++) {
            if (view.display.tiles[t] == null || !view.display.tokens[w]) continue;
            if (t !== w && !allowSplit) continue;
            out.push([t, w]);
        }
    }
    return out;
}

// 手の一覧（ふつう用ではなく、テストと最後の手段に使う）。置ける場所・向き・トークンの置き場をすべて並べる
export function legalPlacements(view, seat = view.you) {
    const env = view.players[seat].env;
    const me = view.players[seat];
    const out = [];
    pairChoices(view, me.nature > 0).forEach(([t, w]) => {
        const tile = TILES[view.display.tiles[t]];
        const animal = view.display.tokens[w];
        openSpots(env).forEach(([q, r]) => {
            const rots = tile.habitats.length === 1 ? [0] : [0, 1, 2, 3, 4, 5];
            rots.forEach(rot => {
                out.push({ type: 'place', tile: t, token: w, q, r, rot, at: null });
                Object.entries(env).forEach(([k, spot]) => {
                    if (!spot.token && TILES[spot.tile].wildlife.includes(animal)) out.push({ type: 'place', tile: t, token: w, q, r, rot, at: parseKey(k) });
                });
                if (tile.wildlife.includes(animal)) out.push({ type: 'place', tile: t, token: w, q, r, rot, at: [q, r] });
            });
        });
    });
    return out;
}

// ---- ふつう ----

function evaluateNormal(view, seat) {
    const me = view.players[seat];
    const env = me.env;
    const cards = view.cards;
    const left = view.turns - me.turns; // この手番を含む残り
    const look = LOOKAHEAD * Math.min(1, (left - 1) / 6);
    const tokens = tokenMap(env);
    const base = {};
    ANIMALS.forEach(a => { base[a] = animalValue(env, tokens, a, cards[a], look); });
    const others = view.players.filter((_, i) => i !== seat).map(p => p.env);
    const n = view.players.length;
    // 地形のボーナスの見込み（いちばん大きいつながりが1枚増えたときに、ボーナスがどれだけ変わるか）
    const rivals = Object.fromEntries(HABITATS.map(h => [h, others.map(e => largest(e, h))]));
    const bonusOf = (h, size) => (n === 1 ? 0 : habitatBonus([size, ...rivals[h]], n)[0]);
    const habBase = {};
    HABITATS.forEach(h => { habBase[h] = habitatValue(env, h) + bonusOf(h, largest(env, h)); });

    // 動物の集まり set の値の和（envX・tokensX で）と、今の値の和との差
    const valueOf = (envX, tokensX, set) => [...set].reduce((sum, a) => sum + animalValue(envX, { ...tokensX }, a, cards[a], look), 0);
    const baseOf = (set) => [...set].reduce((sum, a) => sum + base[a], 0);
    // トークンを k に置いたときの増え（置いた動物と、ふさいだ印の動物の見込みが変わる。キーストーンなら自然トークン）
    const tokenGain = (animal, k, envX, extra = []) => {
        const spot = envX[k];
        const set = new Set([animal, ...TILES[spot.tile].wildlife, ...extra]);
        const env3 = { ...envX, [k]: { ...spot, token: animal } };
        const gain = valueOf(env3, { ...tokens, [k]: animal }, set) - baseOf(set);
        return gain + (TILES[spot.tile].keystone ? NATURE_VALUE : 0);
    };

    const bestExisting = {};
    ANIMALS.forEach(a => {
        let best = { gain: 0, at: null };
        Object.keys(env).forEach(k => {
            const spot = env[k];
            if (spot.token || !TILES[spot.tile].wildlife.includes(a)) return;
            const g = tokenGain(a, k, env);
            if (g > best.gain) best = { gain: g, at: parseKey(k) };
        });
        bestExisting[a] = best;
    });

    const spots = openSpots(env);
    const choices = [];
    pairChoices(view, me.nature > 0).forEach(([t, w]) => {
        const tileId = view.display.tiles[t];
        const tile = TILES[tileId];
        const animal = view.display.tokens[w];
        const split = t !== w;
        let best = null;
        spots.forEach(([q, r]) => {
            const k = key(q, r);
            const rots = tile.habitats.length === 1 ? [0] : [0, 1, 2, 3, 4, 5];
            let bestRot = null;
            rots.forEach(rot => {
                const env2 = { ...env, [k]: { tile: tileId, rot, token: null } };
                let hab = 0;
                tile.habitats.forEach(h => {
                    const size = largest(env2, h);
                    hab += habitatValue(env2, h) + bonusOf(h, size) - habBase[h];
                    hab += EDGE * openEdges(env2, h);
                    hab -= EDGE * openEdges(env, h);
                });
                if (!bestRot || hab > bestRot.hab) bestRot = { rot, hab, env2 };
            });
            // 新しいタイルに印のある動物の見込み（空きの印が増える）
            const env2 = bestRot.env2;
            const wild = new Set(tile.wildlife);
            const slotGain = look > 0 ? valueOf(env2, tokens, wild) - baseOf(wild) : 0;
            let tok = { gain: slotGain + bestExisting[animal].gain, at: bestExisting[animal].at };
            if (wild.has(animal)) {
                const g = tokenGain(animal, k, env2, tile.wildlife);
                if (g > tok.gain) tok = { gain: g, at: [q, r] };
            }
            const value = bestRot.hab + tok.gain - (split ? SPLIT_COST : 0);
            if (!best || value > best.value) best = { value, command: { type: 'place', tile: t, token: w, q, r, rot: bestRot.rot, at: tok.at } };
        });
        if (best) choices.push(best);
    });
    return choices;
}

// その地形のいちばん大きいつながりの、地の外に向いた辺の数（伸びしろ）
function openEdges(env, habitat) {
    const groups = corridors(env, habitat);
    if (!groups.length) return 0;
    const big = groups.reduce((a, b) => (b.length > a.length ? b : a));
    let n = 0;
    big.forEach(k => {
        const [q, r] = parseKey(k);
        const spot = env[k];
        for (let d = 0; d < 6; d++) {
            if (edgeHabitat(TILES[spot.tile].habitats, spot.rot, d) !== habitat) continue;
            const [x, y] = neighbor(q, r, d);
            if (!env[key(x, y)]) n++;
        }
    });
    return Math.min(n, 8);
}

// ---- やさしい ----

function chooseEasy(view, seat, rand) {
    const me = view.players[seat];
    const env = me.env;
    const spots = openSpots(env);
    const t = Math.floor(rand() * 4);
    const tileId = view.display.tiles[t];
    const animal = view.display.tokens[t];
    const tile = TILES[tileId];
    if (rand() < 0.5) {
        // 今の点の増えだけで選ぶ
        const tokens = tokenMap(env);
        let best = null;
        spots.forEach(([q, r]) => {
            const rot = bestRotation(env, tile, q, r);
            const env2 = { ...env, [key(q, r)]: { tile: tileId, rot, token: null } };
            const hab = tile.habitats.reduce((s, h) => s + largest(env2, h) - largest(env, h), 0);
            const targets = Object.keys(env2).filter(k => !env2[k].token && TILES[env2[k].tile].wildlife.includes(animal));
            let tok = { gain: 0, at: null };
            const now = scoreAnimal(tokens, animal, view.cards[animal]);
            targets.forEach(k => {
                const g = scoreAnimal({ ...tokens, [k]: animal }, animal, view.cards[animal]) - now + (TILES[env2[k].tile].keystone ? 1 : 0);
                if (g > tok.gain || (tok.at === null && g >= 0)) tok = { gain: g, at: parseKey(k) };
            });
            const value = hab + tok.gain + rand() * 0.5;
            if (!best || value > best.value) best = { value, command: { type: 'place', tile: t, token: t, q, r, rot, at: tok.at } };
        });
        return best.command;
    }
    const [q, r] = spots[Math.floor(rand() * spots.length)];
    const rot = tile.habitats.length === 1 ? 0 : Math.floor(rand() * 6);
    const env2 = { ...env, [key(q, r)]: { tile: tileId, rot, token: null } };
    const targets = Object.keys(env2).filter(k => !env2[k].token && TILES[env2[k].tile].wildlife.includes(animal));
    const at = targets.length ? parseKey(targets[Math.floor(rand() * targets.length)]) : null;
    return { type: 'place', tile: t, token: t, q, r, rot, at };
}

export function chooseCommand(view, level = 'normal', rand = Math.random) {
    const seat = view.you;
    if (view.phase === 'end' || view.current !== seat) return null;
    if (level === 'easy') return chooseEasy(view, seat, rand);
    const choices = evaluateNormal(view, seat);
    if (!choices.length) return null;
    // ほぼ同じ値の手は、迷いで選ぶ
    const top = Math.max(...choices.map(c => c.value));
    const near = choices.filter(c => c.value >= top - 0.05);
    return near[Math.floor(rand() * near.length)].command;
}

// CPU 用の乱数（ゲームの乱数とは別）
export const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 操作を待っている CPU に1手打たせる。思わぬことで断られたら、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const view = createGameView(game, seat);
    let command = null;
    try {
        command = chooseCommand(view, level ?? game.players[seat].cpuLevel ?? 'normal', cpuRandom(game, seat));
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    const [q, r] = openSpots(view.players[seat].env)[0];
    const fallback = { type: 'place', tile: 0, token: 0, q, r, rot: 0, at: null };
    return game.applyCommand(seat, fallback) ? fallback : null;
}
