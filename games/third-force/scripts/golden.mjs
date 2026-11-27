// 決定性のテストに使う「決めた組の最後の状態のハッシュ」を作り直す（エンジンの版を上げたとき）
// 使い方: node scripts/golden.mjs > test/golden.json
import { runBattle, hashBattle, ENGINE_VERSION } from '../public/js/battle.js';
import { BUILTIN } from '../public/js/cpu-tactics.js';

const PAIRS = [['offense', 'sample', 1], ['sample', 'random', 2], ['defense', 'offense', 3], ['random', 'random', 123456789]];
const cases = PAIRS.map(([a, b, seed]) => {
    const battle = runBattle({ seed, tactics: [BUILTIN[a], BUILTIN[b]] });
    return { seed, a, b, hash: hashBattle(battle), winner: battle.winner };
});
console.log(JSON.stringify({ engine: ENGINE_VERSION, cases }, null, 2));
