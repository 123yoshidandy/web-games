// 変わったファイルから、テストを流すゲームと共通の部品を選ぶ
// - games/<名前>/ が変わった → そのゲーム
// - packages/<部品>/ が変わった → その部品と、それを package.json の依存に書いているか、テスト（test/・tests/）で import しているゲーム
//   （test-kit は、依存に書かずに import しているゲームが多いので、import も見る）
//   （clock・motion・pwa・random は、写しを持つゲーム（<部品>.lock.json がある）も流す。写しを通してゲームのテストが本体を使うため）
// - ゲームの BGM の曲（sound/bgm.js）が変わった → そのゲームと、曲を検査する packages/sound
// - 直下の package.json・package-lock.json・scripts/ が変わった → 全部
// - それ以外（README・docs など）だけなら → なし
// 使い方: node scripts/changed-games.mjs <比べる元のコミット>
//   出力（1行ずつ）: games/<名前> か packages/<部品>（npm test -w にそのまま渡せる形）
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 写しを持つゲームも流す部品（<部品>.lock.json で見分ける）
// sound は、ほぼすべてのゲームが写しを持ち、写しの確認（sync.mjs check --all）で足りるので入れない
const COPIED_PACKAGES = ['clock', 'motion', 'pwa', 'random'];

const workspaces = (dir) => readdirSync(join(root, dir))
    .filter((name) => existsSync(join(root, dir, name, 'package.json')))
    .map((name) => ({
        path: `${dir}/${name}`,
        pkg: JSON.parse(readFileSync(join(root, dir, name, 'package.json'), 'utf8')),
        imports: testImports(join(root, dir, name)),
        copies: COPIED_PACKAGES.filter((pkg) => existsSync(join(root, dir, name, `${pkg}.lock.json`)))
    }));

// test/・tests/ の JS が import している、パッケージの名前（'test-kit/pwa.js' なら test-kit）
function testImports(workspaceDir) {
    const names = new Set();
    for (const testDir of ['test', 'tests'].map((sub) => join(workspaceDir, sub)).filter(existsSync)) {
        for (const file of readdirSync(testDir, { recursive: true })) {
            if (!/\.m?js$/.test(file)) continue;
            const text = readFileSync(join(testDir, file), 'utf8');
            for (const match of text.matchAll(/\bfrom\s+['"]([a-z][\w-]*)(?:\/[^'"]*)?['"]/g)) names.add(match[1]);
        }
    }
    return [...names];
}

export function selectWorkspaces(changedFiles, { games = workspaces('games'), packages = workspaces('packages') } = {}) {
    const all = [...packages, ...games];
    const everything = changedFiles.some((file) => ['package.json', 'package-lock.json'].includes(file) || file.startsWith('scripts/'));
    if (everything) return all.filter(({ pkg }) => pkg.scripts?.test).map(({ path }) => path);

    const selected = new Set();
    for (const file of changedFiles) {
        const [top, name] = file.split('/');
        if ((top === 'games' || top === 'packages') && name) selected.add(`${top}/${name}`);
        if (top === 'games' && /\/js\/sound\/bgm\.js$/.test(file)) selected.add('packages/sound');
    }
    // 変わった共通の部品を使うゲームも流す
    for (const { path, pkg } of packages) {
        if (!selected.has(path)) continue;
        for (const game of games) {
            const deps = { ...game.pkg.dependencies, ...game.pkg.devDependencies };
            if (pkg.name in deps || game.imports?.includes(pkg.name) || game.copies?.includes(pkg.name)) selected.add(game.path);
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
