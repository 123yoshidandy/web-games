// カックロの問題の組（public/js/puzzles/kakuro/pool.js）を作り直す
// 使い方: node scripts/build-pool.mjs [難しさごとの数（既定 120）]（games/kakuro で）
//
// 難しさごとに、logic.js の buildPuzzle（理屈だけで解けるようになるまで数字を変える）で作り、
// 1問ずつ、すべての解を数えて（打ち切りなし）解が1つであることを確かめてから並べる。同じ問題（たてとよこを入れかえたものも）は入れない。
// 乱数のシードは決めてあるので、何度流しても同じ組になる
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPECS, buildPuzzle, countSolutions, solvableByLogic, encode, decode, transpose, layout } from '../public/js/puzzles/kakuro/logic.js';
import { createRandom } from '../public/js/random.js';

const COUNT = Number(process.argv[2] ?? 120);
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/js/puzzles/kakuro/pool.js');

const pool = {};
for (const [difficulty, spec] of Object.entries(SPECS)) {
    const random = createRandom(`kakuro-pool-${difficulty}`);
    const seen = new Set();
    const list = [];
    let tries = 0;
    const started = Date.now();
    while (list.length < COUNT) {
        tries++;
        const puzzle = buildPuzzle(spec, random);
        if (!puzzle) continue;
        const key = encode(puzzle);
        if (seen.has(key) || seen.has(encode(transpose(puzzle)))) continue;
        if (!solvableByLogic(puzzle) || countSolutions(puzzle, 2).count !== 1) throw new Error(`解が1つでない問題ができた: ${key}`);
        seen.add(key);
        list.push(key);
    }
    const whites = list.map(text => layout(decode(text)).whites.length);
    console.log(`${difficulty}: ${list.length} 問（${tries} 回試した・${((Date.now() - started) / 1000).toFixed(1)} 秒）白いマス ${Math.min(...whites)}〜${Math.max(...whites)}`);
    pool[difficulty] = list;
}

const body = Object.entries(pool).map(([difficulty, list]) => `    ${difficulty}: [\n${list.map(text => `        '${text}'`).join(',\n')}\n    ]`).join(',\n');
fs.writeFileSync(OUT, `/**
 * カックロの問題の組（scripts/build-pool.mjs が作る。手で直さない）
 * 難しさごとに ${COUNT} 問。どれも理屈だけで解け、解が1つであることを確かめてある
 * 1問は1行ずつ / で区切り、マスは , で区切る。白いマスは .、黒いマスは「たて-よこ」の和で、和のない黒は #（logic.js の decode）
 */

export const POOL = {
${body}
};
`);
console.log(`書きました: ${OUT}`);
