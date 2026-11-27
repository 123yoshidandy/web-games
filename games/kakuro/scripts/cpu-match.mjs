// CPU の確かめ：難しさごとに、ヒントで最後まで解けるか・強さごとの時間・強さどうしの勝率（中身は puzzle-kit）
// 使い方: npm run cpu-match -w games/kakuro
import { runCpuMatch } from 'puzzle-kit/tools/cpu-match.mjs';

process.exitCode = await runCpuMatch(new URL('../public/js/', import.meta.url));
