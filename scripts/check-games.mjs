// ゲームをまたいだ決まりを確かめる（同じサイトに並べるため）
// - service worker のキャッシュの名前が、ゲームどうしで重ならない
// - service worker が、ほかのゲームのキャッシュを消さない（自分の名前の頭のものだけ消す）
// - 保存の名前（localStorage）の頭が、ゲームどうしで重ならない
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'games');
const games = readdirSync(gamesDir).filter((name) => existsSync(join(gamesDir, name, 'package.json'))).sort();
const errors = [];
const owners = { cache: new Map(), storage: new Map() };

const claim = (kind, key, game) => {
    const owner = owners[kind].get(key);
    if (owner && owner !== game) errors.push(`${kind} の名前「${key}」が ${owner} と ${game} で重なる`);
    owners[kind].set(key, game);
};

// netplay/ は netplay-kit のクライアントの写し。使い方の例に、ほかのゲームの保存の名前が書いてあるので読まない
const SKIP_DIRS = ['node_modules', 'netplay'];

const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.includes(entry.name) ? [] : listFiles(path);
    return /\.(m?js|html)$/.test(entry.name) ? [path] : [];
});

for (const game of games) {
    const publicDir = existsSync(join(gamesDir, game, 'public')) ? join(gamesDir, game, 'public') : join(gamesDir, game);
    const swPath = join(publicDir, 'sw.js');
    if (existsSync(swPath)) {
        const sw = readFileSync(swPath, 'utf8');
        const cache = sw.match(/const CACHE = '([^']+)'/)?.[1];
        if (!cache) errors.push(`${game}: sw.js にキャッシュの名前（const CACHE）がない`);
        else claim('cache', cache.replace(/\d+$/, ''), game);
        if (/caches\.delete/.test(sw) && !/key\.startsWith\(CACHE_PREFIX\)/.test(sw)) {
            errors.push(`${game}: sw.js が、ほかのゲームのキャッシュまで消すおそれがある`);
        }
    }
    // 保存の名前は「頭.残り」の形で書く決まり。頭を集めて、ほかのゲームと重ならないかを見る
    for (const file of listFiles(publicDir)) {
        const text = readFileSync(file, 'utf8');
        for (const match of text.matchAll(/['"`]([A-Za-z][\w-]*)[.:](?:save|settings|level|online|sound|setup|name|progress|decks)\b/g)) {
            claim('storage', match[1], game);
        }
    }
}

if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
}
console.log(`${games.length} 本のキャッシュと保存の名前に、重なりはありません`);
