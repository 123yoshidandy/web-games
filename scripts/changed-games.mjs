// 変わったファイルから、テストを流すゲームと共通の部品を選ぶ
// - games/<名前>/ が変わった → そのゲーム
// - packages/<部品>/ が変わった → その部品と、それを package.json の依存に書いているゲーム
// - 直下の package.json・package-lock.json・scripts/ が変わった → 全部
// - それ以外（README・docs など）だけなら → なし
// 使い方: node scripts/changed-games.mjs <比べる元のコミット>
//   出力（1行ずつ）: games/<名前> か packages/<部品>（npm test -w にそのまま渡せる形）
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const workspaces = (dir) => readdirSync(join(root, dir))
    .filter((name) => existsSync(join(root, dir, name, 'package.json')))
    .map((name) => ({ path: `${dir}/${name}`, pkg: JSON.parse(readFileSync(join(root, dir, name, 'package.json'), 'utf8')) }));

export function selectWorkspaces(changedFiles, { games = workspaces('games'), packages = workspaces('packages') } = {}) {
    const all = [...packages, ...games];
    const everything = changedFiles.some((file) => ['package.json', 'package-lock.json'].includes(file) || file.startsWith('scripts/'));
    if (everything) return all.filter(({ pkg }) => pkg.scripts?.test).map(({ path }) => path);

    const selected = new Set();
    for (const file of changedFiles) {
        const [top, name] = file.split('/');
        if ((top === 'games' || top === 'packages') && name) selected.add(`${top}/${name}`);
    }
    // 変わった共通の部品を使うゲームも流す
    for (const { path, pkg } of packages) {
        if (!selected.has(path)) continue;
        for (const game of games) {
            const deps = { ...game.pkg.dependencies, ...game.pkg.devDependencies };
            if (pkg.name in deps) selected.add(game.path);
        }
    }
    return all.filter(({ path, pkg }) => selected.has(path) && pkg.scripts?.test).map(({ path }) => path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const base = process.argv[2];
    if (!base) {
        console.error('比べる元のコミットを指定してください');
        process.exit(2);
    }
    const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    console.log(selectWorkspaces(changed).join('\n'));
}
