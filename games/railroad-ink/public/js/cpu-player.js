/**
 * CPU の判断（DOM に依存しない）。見るのは自分のビューだけ（隠れた情報はないゲーム）
 *
 * 盤の良さを点数にし（evaluate）、描ける目と場所・向きのうち、点数が一番上がるものを1つずつ描く
 * - 出口のつながりの点＋出口に1つだけつながったネットワーク（あとで伸ばせる）に少し加点
 * - 一番長い道・線路、中央の9マス
 * - つながっていない端は、ラウンドが進むほど重く減点する（最後には本当に減点になるため）
 * 特別なタイルは、ダイスの目を描き終えたあと、点が十分に上がるときだけ使う。残りのラウンドで使い切れなくなるなら、必ず使う
 *
 * 強さ：ふつう（normal）とやさしい（easy）。やさしいは、長い道・線路を考えず、ダイスを決まった順に描き、上位の候補からランダムに選ぶ
 * CPU の判断にはゲームの乱数を使わない（記録の再現がずれるため）。状態から作った別の乱数を使う
 */

import { createRandom } from './random.js';
import { SIZE, DIR, EXITS, ROUNDS, MAX_SPECIALS, SPECIALS, legalPlacements, index } from './tiles.js';
import { buildGraph, networks, longestRoute, NETWORK_POINTS } from './scoring.js';
import { createGameView } from './game-view.js';

export const LEVELS = {
    // dead：描いたマスに向いた端の減点の重み。live・liveLate：空いたマスに向いた端の重み（ラウンドが進むほど live + liveLate に近づく）
    // noise：候補の点数に足すゆらぎ（同じ目でも、CPU ごとに違う盤になるように）
    normal: { longest: true, choices: 1, noise: 0.8, specialCost: 3, dead: 1.2, live: 0.15, liveLate: 0.85, reach: 3 },
    easy: { longest: false, choices: 4, noise: 0.8, specialCost: 1, dead: 1.2, live: 0.15, liveLate: 0.85, reach: 3 }
};

// 盤の良さ（round：いまのラウンド）
export function evaluate(cells, round, level = 'normal') {
    const conf = LEVELS[level] ?? LEVELS.normal;
    const graph = buildGraph(cells);
    const nets = networks(graph);
    const netExits = new Array(graph.nodes.length).fill(0);
    let value = 0;
    nets.forEach(n => {
        const k = n.exits.length;
        value += NETWORK_POINTS[Math.min(k, 12)] + (k === 1 ? 1.5 : 0);
        n.members.forEach(m => { netExits[m] = k; });
    });
    if (conf.longest) value += longestRoute(graph, 'road', 300) + longestRoute(graph, 'rail', 300);
    let center = 0;
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) if (cells[index(x, y)]) center++;
    value += center;
    // 端：描いてあるマスに向いた端は必ず減点になる。空いたマスに向いた端は、ラウンドが進むほど重く
    const late = round / ROUNDS;
    const live = graph.ends.filter(e => !e.dead);
    value -= (graph.ends.length - live.length) * conf.dead;
    value -= live.length * (conf.live + conf.liveLate * late * late);
    // まだつながっていない出口へ、出口のあるネットワークの端が近い（2マス以内）ほど加点する（出口へ伸ばす）
    if (late < 1) {
        const connected = new Set(nets.flatMap(n => n.exits));
        EXITS.forEach(exit => {
            if (connected.has(exit.id)) return;
            const ix = exit.x - DIR[exit.dir][0];
            const iy = exit.y - DIR[exit.dir][1];
            if (cells[index(ix, iy)]) return;   // 出口の前がふさがっている
            let best = 0;
            live.forEach(e => {
                const tx = e.target % SIZE;
                const ty = Math.floor(e.target / SIZE);
                const d = Math.abs(tx - ix) + Math.abs(ty - iy);
                if (d > 2) return;   // 遠い出口は数えない（足し合わせると、つなぎ切るより端を開けておく方が得に見えるため）
                const w = netExits[e.node] > 0 ? 1 : 0.4;
                best = Math.max(best, w * conf.reach / ((1 + d) * (1 + d)));
            });
            value += best * (1 - late);
        });
    }
    return value;
}

// ビューから、次の操作を1つ決める（描き終えていれば null）
export function chooseCommand(view, level = 'normal', random = Math.random) {
    const me = view.players[view.you];
    if (view.phase === 'end' || !view.actors.includes(view.you)) return null;
    const conf = LEVELS[level] ?? LEVELS.normal;
    const cells = me.cells;
    const unplaced = [0, 1, 2, 3].filter(i => !me.placed.some(p => p.source === `d${i}`));
    // やさしいは、ダイスを決まった順に1つずつ描く
    const sources = level === 'easy' ? unplaced.slice(0, 1).concat(unplaced.slice(1)) : unplaced;
    const candidates = [];
    for (const i of sources) {
        const kind = view.dice[i];
        for (const p of legalPlacements(cells, kind)) {
            const next = cells.slice();
            next[index(p.x, p.y)] = { kind, o: p.o };
            candidates.push({ source: `d${i}`, ...p, value: evaluate(next, view.round, level) });
        }
        if (level === 'easy' && candidates.length > 0) break;
    }
    if (candidates.length > 0) return pick(candidates, conf, random);

    // ダイスを描き終えた（描けない目は飛ばす）。特別なタイルを使うか
    const usedThisRound = me.placed.some(p => SPECIALS.includes(p.source));
    const left = MAX_SPECIALS - me.specialsUsed.length;
    if (!usedThisRound && left > 0) {
        const base = evaluate(cells, view.round, level);
        const roundsLeft = ROUNDS - view.round + 1;
        const cost = left >= roundsLeft ? -1 : conf.specialCost;   // 使い切れなくなるなら、必ず使う
        const specials = [];
        SPECIALS.filter(s => !me.specialsUsed.includes(s)).forEach(s => {
            for (const p of legalPlacements(cells, s)) {
                const next = cells.slice();
                next[index(p.x, p.y)] = { kind: s, o: p.o };
                specials.push({ source: s, ...p, value: evaluate(next, view.round, level) });
            }
        });
        if (specials.length > 0) {
            const best = pick(specials, conf, random);
            if (best.value - base > cost) return best;
        }
    }
    return { type: 'end' };
}

// ゆらぎを足して点数の高い順に並べ、上位 choices 個からランダムに選ぶ
function pick(candidates, conf, random) {
    const choices = conf.choices;
    candidates.forEach(c => { c.value += random() * conf.noise; });
    candidates.sort((a, b) => b.value - a.value);
    const top = candidates.slice(0, Math.max(1, choices));
    const c = top[Math.floor(random() * top.length)];
    return { type: 'place', source: c.source, x: c.x, y: c.y, o: c.o, value: c.value };
}

// ---- ゲームを進める ----

// 操作を待っている CPU（いなければ undefined）
export function cpuActor(game) {
    return game.actors().find(seat => game.players[seat].isCPU);
}

export function isCpuTurn(game) {
    return cpuActor(game) !== undefined;
}

// CPU に1手打たせる。決めた手が通らなければ、ラウンドを終える。進めたら true
export function runCpuStep(game, level = game.options.level, seat = cpuActor(game)) {
    if (seat === undefined) return false;
    const view = createGameView(game, seat, { events: false, since: Infinity, scores: false });
    const random = createRandom((game.options.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ seat) >>> 0);
    const command = chooseCommand(view, level, random);
    if (command) {
        const { value, ...clean } = command;
        if (game.applyCommand(seat, clean)) return true;
    }
    return game.applyCommand(seat, { type: 'end' });
}
