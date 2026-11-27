/**
 * CPU の確かめ（ゲームの scripts/cpu-match.mjs から呼ぶ）
 *   import { runCpuMatch } from 'puzzle-kit/tools/cpu-match.mjs';
 *   process.exitCode = await runCpuMatch(new URL('../public/js/', import.meta.url));
 *
 * 難しさごとに、シードを変えて問題を作り、次を出す
 *   - 何も書いていない状態から、ヒントを当て続けて最後まで解けるか（止まった問題があれば終了コード1）
 *   - ヒントの手数と、CPU の強さごとの解く時間（1問あたりの平均）
 *   - 3問の早解きを CPU どうしで何度も競わせたときの勝率（強い方が勝つか）
 */

const MAX_STEPS = 3000;
const SEEDS = 12;
const RACES = 200;

const formatSeconds = (ms) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export async function runCpuMatch(jsDir, { seeds = SEEDS, races = RACES, log = console.log } = {}) {
    const { PUZZLE_TYPE, DIFFICULTIES } = await import(new URL('puzzles/registry.js', jsDir));
    const { CPU_LEVELS, cpuDurations } = await import(new URL('cpu-player.js', jsDir));
    const { planSet, buildPuzzle } = await import(new URL('puzzle-set.js', jsDir));
    const { createRandom } = await import(new URL('random.js', jsDir));
    const type = PUZZLE_TYPE;
    let failed = 0;

    log(`${type.name}（${type.id}）：1手 ${type.cpuSecondsPerStep} 秒`);
    for (const difficulty of DIFFICULTIES) {
        // ヒントだけで解けるか
        const steps = [];
        for (let i = 0; i < seeds; i++) {
            const seed = 5000 + i * 104729;
            const puzzle = type.generate(seed, difficulty.id);
            let state = type.initialState(puzzle);
            let step = 0;
            while (step < MAX_STEPS && !type.check(puzzle, state).solved) {
                const hint = type.hint(puzzle, state);
                if (!hint) break;
                state = type.applyInput(puzzle, state, hint.input);
                step++;
            }
            if (!type.check(puzzle, state).solved) {
                failed++;
                log(`  NG ${difficulty.label} シード ${seed}：${step} 手でヒントが止まり、解けない`);
            }
            steps.push(step);
        }

        // 強さごとの1問あたりの時間
        const entries = Array.from({ length: seeds }, (_, i) => buildPuzzle({ type: type.id, difficulty: difficulty.id, seed: 5000 + i * 104729 }));
        const times = CPU_LEVELS.map(level => {
            const ms = cpuDurations(entries, level.id, createRandom(level.id.length * 7919 + seeds));
            return `${level.label} ${formatSeconds(ms.reduce((a, b) => a + b, 0) / ms.length)}`;
        });
        const average = steps.reduce((a, b) => a + b, 0) / steps.length;
        log(`  ${difficulty.label}（${type.difficulties[difficulty.id]}）：ヒント ${average.toFixed(1)} 手（${Math.min(...steps)}〜${Math.max(...steps)}）・1問 ${times.join('・')}`);

        // 3問の早解き：強さどうしの勝率
        const random = createRandom(42);
        const wins = new Map();
        for (let r = 0; r < races; r++) {
            const set = planSet({ seed: Math.floor(random() * 2 ** 31), difficulty: difficulty.id, count: 3 }).map(buildPuzzle);
            const totals = CPU_LEVELS.map(level => cpuDurations(set, level.id, random).reduce((a, b) => a + b, 0));
            for (let a = 0; a < CPU_LEVELS.length; a++) {
                for (let b = a + 1; b < CPU_LEVELS.length; b++) {
                    const key = `${CPU_LEVELS[b].label} 対 ${CPU_LEVELS[a].label}`;
                    wins.set(key, (wins.get(key) ?? 0) + (totals[b] < totals[a] ? 1 : 0));
                }
            }
            if (difficulty.id === 'hard' && r >= races / 4) break; // むずかしいは作るのに時間がかかるので少なめ
        }
        const played = difficulty.id === 'hard' ? races / 4 + 1 : races;
        log(`    勝率：${[...wins].map(([key, n]) => `${key} ${Math.round((n / played) * 100)}%`).join('・')}`);
    }
    log(failed ? `ヒントで解けない問題が ${failed} 問あります` : 'どの問題も、ヒントで最後まで解けました');
    return failed ? 1 : 0;
}
