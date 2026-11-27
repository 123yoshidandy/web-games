// 組み込みの戦術（CPU）どうしの総当たり。勝率の表を出し、どの対戦も 5000 tick までに終わることを確かめる
// 対戦はシードで決まるので、何度流しても同じ表になる
// 使い方: npm run cpu-match -w games/third-force [-- 対戦数]
import { runBattle, hashBattle } from '../public/js/battle.js';
import { BUILTIN, CPU_LEVELS } from '../public/js/cpu-tactics.js';
import { MAX_TICKS } from '../public/js/arms.js';

const games = Number(process.argv[2]) || 20;
const ids = CPU_LEVELS.map((level) => level.id);
const label = Object.fromEntries(CPU_LEVELS.map((level) => [level.id, level.label]));

let stalls = 0;
let digest = '';
const points = Object.fromEntries(ids.map((id) => [id, 0]));
const rows = [];
const started = performance.now();
for (const a of ids) {
    const cells = [];
    for (const b of ids) {
        let win = 0;
        let lose = 0;
        let draw = 0;
        for (let i = 0; i < games; i++) {
            const seed = 1000 + i;
            const side = i % 2; // 席を交互にする
            const battle = runBattle({ seed, tactics: side === 0 ? [BUILTIN[a], BUILTIN[b]] : [BUILTIN[b], BUILTIN[a]] });
            if (!battle.over || battle.time > MAX_TICKS) stalls++;
            digest += hashBattle(battle);
            if (battle.winner === side) win++;
            else if (battle.winner === null) draw++;
            else lose++;
        }
        if (a !== b) points[a] += win + draw / 2;
        cells.push(`${win}-${lose}-${draw}`.padStart(9));
    }
    rows.push(`${label[a].padEnd(5, '　')} ${cells.join(' ')}`);
}
console.log(`組み込みの戦術の総当たり（各 ${games} 戦、勝-負-分。行が自分、列が相手）`);
console.log(`${''.padEnd(6, '　')}${ids.map((id) => label[id].padStart(8, '　')).join(' ')}`);
rows.forEach((row) => console.log(row));
console.log('\n勝ち点（勝ち 1・引き分け 0.5、自分どうしを除く）');
[...ids].sort((p, q) => points[q] - points[p]).forEach((id) => console.log(`  ${label[id]}: ${points[id]}`));
let h = 0x811c9dc5;
for (let i = 0; i < digest.length; i++) h = Math.imul(h ^ digest.charCodeAt(i), 0x01000193) >>> 0;
console.log(`\n全対戦のハッシュ ${h.toString(16)}（同じなら結果は同じ）・${((performance.now() - started) / 1000).toFixed(1)} 秒`);
if (stalls > 0) {
    console.error(`終わらなかった対戦 ${stalls}`);
    process.exit(1);
}
