// ぬりかべの問題の組（public/js/puzzles/nurikabe/pool.js）を作り直す
// 使い方: node scripts/build-pool.mjs [難しさごとの数（既定 100）]（games/nurikabe で）
//
// SPECS で pool の付いた難しさ（ふつう・むずかしい）ごとに、logic.js の buildPuzzle（理屈だけで解ける問題を作る）で作り、
// 1問ずつ、理屈で解けることをもう一度確かめてから並べる（理屈は正しい推論だけなので、解ければ解は1つ）。同じ問題（回したもの・裏返したものも）は入れない。
// 乱数のシードは決めてあるので、何度流しても同じ組になる
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPECS, buildPuzzle, logicSolve, encode, transform } from '../public/js/puzzles/nurikabe/logic.js';
import { createRandom } from '../public/js/random.js';

const COUNT = Number(process.argv[2] ?? 100);
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/js/puzzles/nurikabe/pool.js');

const pool = {};
for (const [difficulty, spec] of Object.entries(SPECS)) {
    if (!spec.pool) continue;
    const random = createRandom(`nurikabe-pool-${difficulty}`);
    const seen = new Set();
    const list = [];
    const started = Date.now();
    const trials = [];
    while (list.length < COUNT) {
        const puzzle = buildPuzzle(spec, random);
        const variants = Array.from({ length: 8 }, (_, k) => encode(transform(puzzle, k)));
        if (variants.some(text => seen.has(text))) continue;
        // 理屈で解けたことを、もう一度確かめる（仮置きの回数も数える）
        const result = logicSolve(puzzle, { trial: spec.trial });
        if (!result.solved) throw new Error(`理屈で解けない問題ができた: ${encode(puzzle)}`);
        seen.add(variants[0]);
        list.push(variants[0]);
        trials.push(result.trials);
        if (list.length % 10 === 0) console.log(`  ${difficulty}: ${list.length} 問（${((Date.now() - started) / 1000).toFixed(0)} 秒）`);
    }
    console.log(`${difficulty}: ${list.length} 問（${((Date.now() - started) / 1000).toFixed(1)} 秒）仮置き ${Math.min(...trials)}〜${Math.max(...trials)} 回`);
    pool[difficulty] = list;
}

const body = Object.entries(pool).map(([difficulty, list]) => `    ${difficulty}: [\n${list.map(text => `        '${text}'`).join(',\n')}\n    ]`).join(',\n');
fs.writeFileSync(OUT, `/**
 * ぬりかべの問題の組（scripts/build-pool.mjs が作る。手で直さない）
 * ふつう・むずかしいを ${COUNT} 問ずつ。どれも理屈だけで解け、解が1つであることを確かめてある
 * 1問は1行ずつ / で区切る。数字のないマスは .、島の大きさは 1〜9 の1文字（logic.js の decode）
 */

export const POOL = {
${body}
};
`);
console.log(`書きました: ${OUT}`);
