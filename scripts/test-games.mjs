// ゲームごとにテストを流す
// 使い方: node scripts/test-games.mjs <名前>...   … 挙げたゲームだけ
//         node scripts/test-games.mjs --all        … 全ゲーム
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'games');
const args = process.argv.slice(2);
const all = readdirSync(gamesDir).filter((name) => existsSync(join(gamesDir, name, 'package.json'))).sort();
const names = args.includes('--all') ? all : args;

if (names.length === 0) {
    console.error('ゲームの名前か --all を指定してください');
    process.exit(2);
}

const failed = [];
for (const name of names) {
    if (!all.includes(name)) {
        console.error(`games/${name} はありません`);
        failed.push(name);
        continue;
    }
    const result = spawnSync('npm', ['test', '--silent', '-w', `games/${name}`], { cwd: root, stdio: 'inherit' });
    console.log(`== ${name}: ${result.status === 0 ? 'OK' : `失敗（終了コード ${result.status}）`}`);
    if (result.status !== 0) failed.push(name);
}

console.log(`\n${names.length - failed.length}/${names.length} 本が通りました`);
if (failed.length > 0) {
    console.log(`失敗: ${failed.join(' ')}`);
    process.exit(1);
}
