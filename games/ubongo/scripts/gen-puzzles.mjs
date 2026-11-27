// 問題のカードを作り、public/js/puzzles.js に書く
//   node scripts/gen-puzzles.mjs [--seed 7]
// カードは「盤面の形」と、ダイスの目（1〜6）ごとのピースの組。どの組もソルバーで解けることを確かめて選ぶ
// 3ピース（やさしい）と4ピース（むずかしい）を、それぞれ 36 枚（9ラウンド × 4人で足りる枚数）作る

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PIECE_IDS, uniqueOrientations, pieceSize } from '../public/js/pieces.js';
import { solve } from '../public/js/solver.js';
import { createRandom, shuffle } from '../public/js/random.js';

const CARDS_PER_LEVEL = 36;
const SETS_PER_CARD = 6;
// 盤面の大きさの上限（スマホの縦の画面に収める）
const LIMITS = { 3: { w: 5, h: 5 }, 4: { w: 6, h: 5 } };
const MIN_FILL = 0.55; // 盤面を囲む四角のうち、マスの割合の下限（ばらけた形にしない）

const seedArg = process.argv.indexOf('--seed');
const random = createRandom(seedArg > 0 ? Number(process.argv[seedArg + 1]) : 7);
const pick = (list) => list[Math.floor(random() * list.length)];

const key = (x, y) => `${x},${y}`;

// k 個のピースをつなげて形を作る（毎回、囲む四角が小さくなる置き方を選ぶ）
function buildShape(ids, limit) {
    const cells = new Set();
    const first = pick(uniqueOrientations(ids[0]));
    first.cells.forEach(([x, y]) => cells.add(key(x, y)));
    for (const id of ids.slice(1)) {
        const options = [];
        const list = [...cells].map(k => k.split(',').map(Number));
        const minX = Math.min(...list.map(c => c[0])) - 5;
        const maxX = Math.max(...list.map(c => c[0])) + 1;
        const minY = Math.min(...list.map(c => c[1])) - 5;
        const maxY = Math.max(...list.map(c => c[1])) + 1;
        for (const { cells: shape } of uniqueOrientations(id)) {
            for (let ox = minX; ox <= maxX; ox++) {
                for (let oy = minY; oy <= maxY; oy++) {
                    const placed = shape.map(([x, y]) => [x + ox, y + oy]);
                    if (placed.some(([x, y]) => cells.has(key(x, y)))) continue;
                    const touches = placed.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cells.has(key(x + dx, y + dy))));
                    if (!touches) continue;
                    const all = [...list, ...placed];
                    const w = Math.max(...all.map(c => c[0])) - Math.min(...all.map(c => c[0])) + 1;
                    const h = Math.max(...all.map(c => c[1])) - Math.min(...all.map(c => c[1])) + 1;
                    if (w > limit.w || h > limit.h) continue;
                    options.push({ placed, score: w * h + random() * 3 });
                }
            }
        }
        if (options.length === 0) return null;
        options.sort((a, b) => a.score - b.score);
        options[Math.floor(random() * Math.min(4, options.length))].placed.forEach(([x, y]) => cells.add(key(x, y)));
    }
    return toRows([...cells].map(k => k.split(',').map(Number)));
}

function toRows(list) {
    const minX = Math.min(...list.map(c => c[0]));
    const minY = Math.min(...list.map(c => c[1]));
    const w = Math.max(...list.map(c => c[0])) - minX + 1;
    const h = Math.max(...list.map(c => c[1])) - minY + 1;
    const grid = Array.from({ length: h }, () => Array(w).fill('.'));
    list.forEach(([x, y]) => { grid[y - minY][x - minX] = '#'; });
    return grid.map(row => row.join(''));
}

// 穴（外とつながらない空き）がないか
function hasHole(rows) {
    const h = rows.length + 2;
    const w = rows[0].length + 2;
    const filled = (x, y) => rows[y - 1]?.[x - 1] === '#';
    const seen = new Set([key(0, 0)]);
    const queue = [[0, 0]];
    while (queue.length) {
        const [x, y] = queue.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(key(nx, ny)) || filled(nx, ny)) continue;
            seen.add(key(nx, ny));
            queue.push([nx, ny]);
        }
    }
    const empty = w * h - rows.join('').split('').filter(ch => ch === '#').length;
    return seen.size !== empty;
}

// 形を、回転・裏返しで同じものをまとめるための名前にする
function canonical(rows) {
    const list = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') list.push([x, y]); }));
    const names = [];
    for (let flip = 0; flip < 2; flip++) {
        let cells = list.map(([x, y]) => [flip ? -x : x, y]);
        for (let rot = 0; rot < 4; rot++) {
            cells = cells.map(([x, y]) => [-y, x]);
            names.push(toRows(cells).join('/'));
        }
    }
    return names.sort()[0];
}

function combinations(list, k, start = 0, acc = [], out = []) {
    if (acc.length === k) out.push([...acc]);
    else for (let i = start; i < list.length; i++) combinations(list, k, i + 1, [...acc, list[i]], out);
    return out;
}

function makeCards(k) {
    const cards = [];
    const seen = new Set();
    const combos = combinations(PIECE_IDS, k);
    let tries = 0;
    while (cards.length < CARDS_PER_LEVEL) {
        if (++tries > 20000) throw new Error(`${k}ピースのカードが足りない（${cards.length}枚）`);
        const ids = shuffle([...PIECE_IDS], random).slice(0, k);
        const rows = buildShape(ids, LIMITS[k]);
        if (!rows || hasHole(rows)) continue;
        const area = rows.join('').split('').filter(ch => ch === '#').length;
        if (area / (rows.length * rows[0].length) < MIN_FILL) continue;
        const name = canonical(rows);
        if (seen.has(name)) continue;
        const solvable = combos.filter(combo => combo.reduce((sum, id) => sum + pieceSize(id), 0) === area)
            .filter(combo => solve(rows, combo).length > 0);
        if (solvable.length < SETS_PER_CARD) continue;
        seen.add(name);
        const sets = shuffle(solvable, random).slice(0, SETS_PER_CARD).map(set => [...set].sort((a, b) => PIECE_IDS.indexOf(a) - PIECE_IDS.indexOf(b)));
        cards.push({ shape: rows, sets });
    }
    return cards.map((card, i) => ({ id: `${k}-${String(i + 1).padStart(2, '0')}`, ...card }));
}

const cards = { 3: makeCards(3), 4: makeCards(4) };
const body = (list) => list.map(card => `        { id: '${card.id}', shape: [${card.shape.map(r => `'${r}'`).join(', ')}], sets: [${card.sets.map(set => `[${set.map(id => `'${id}'`).join(', ')}]`).join(', ')}] }`).join(',\n');
const text = `/**
 * 問題のカード（scripts/gen-puzzles.mjs が作る。手で直さない）
 * shape：盤面の形（'#' がマス）。sets：ダイスの目（1〜6）ごとに使うピース。どの組もソルバーで解けることを確かめてある
 */

export const CARDS = {
    3: [
${body(cards[3])}
    ],
    4: [
${body(cards[4])}
    ]
};
`;
writeFileSync(join(import.meta.dirname, '..', 'public', 'js', 'puzzles.js'), text);
console.log(`3ピース ${cards[3].length}枚、4ピース ${cards[4].length}枚`);
