// GitHub Pages に載せるファイルを _site/ に集める
// - 各ゲームの公開するファイルを _site/<名前>/ に写す（public/ があればその中身、なければゲームのフォルダから、
//   サーバー・テスト・設定などのファイルを除いたもの）
// - ゲームの一覧の入口のページ _site/index.html を、各ゲームの manifest から作る
// - service worker が先に読むファイルが、写した先にすべてあるかを確かめる
// 使い方: node scripts/build-site.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'games');
const site = join(root, '_site');

// public/ がないゲームで、公開しないもの
const PRIVATE = new Set([
    'node_modules', 'server', 'test', 'scripts', 'tools',
    'package.json', 'README.md', 'vitest.config.js', 'netplay-kit.lock.json', 'validate-words.js'
]);

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

const games = readdirSync(gamesDir).filter((name) => existsSync(join(gamesDir, name, 'package.json'))).sort();
const entries = [];
const errors = [];

for (const game of games) {
    const hasPublic = existsSync(join(gamesDir, game, 'public'));
    const source = hasPublic ? join(gamesDir, game, 'public') : join(gamesDir, game);
    const target = join(site, game);
    cpSync(source, target, {
        recursive: true,
        filter: (path) => hasPublic || !PRIVATE.has(path.slice(source.length + 1).split('/')[0])
    });

    const sw = existsSync(join(target, 'sw.js')) ? readFileSync(join(target, 'sw.js'), 'utf8') : '';
    const precache = sw.match(/const PRECACHE = \[([\s\S]*?)\]/)?.[1] ?? '';
    for (const [, file] of precache.matchAll(/'([^']+)'/g)) {
        if (file !== './' && !existsSync(join(target, file))) errors.push(`${game}: sw.js が先に読む ${file} がない`);
    }

    const manifest = JSON.parse(readFileSync(join(target, 'manifest.webmanifest'), 'utf8'));
    const icon = manifest.icons.find((i) => i.sizes === '192x192') ?? manifest.icons[0];
    entries.push({
        game,
        name: manifest.name,
        icon: icon ? `${game}/${icon.src}` : '',
        color: manifest.theme_color ?? '#333'
    });
}

if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
}

const cards = entries.map(({ game, name, icon, color }) => `            <li><a href="${game}/" style="--color: ${escapeHtml(color)}">
                ${icon ? `<img src="${escapeHtml(icon)}" alt="" width="72" height="72" loading="lazy">` : ''}
                <span>${escapeHtml(name)}</span>
            </a></li>`).join('\n');

writeFileSync(join(site, 'index.html'), `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>web-games</title>
    <style>
        :root { color-scheme: light dark; --bg: #f4f1ea; --fg: #1f1d1a; --card: #fff; --muted: #6b665d; }
        @media (prefers-color-scheme: dark) { :root { --bg: #16151a; --fg: #ece8e1; --card: #23222a; --muted: #a09a90; } }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
        header { padding: 32px 16px 8px; max-width: 1080px; margin: 0 auto; }
        h1 { margin: 0; font-size: 1.6rem; letter-spacing: 0.02em; }
        header p { margin: 6px 0 0; color: var(--muted); font-size: 0.9rem; }
        ul { list-style: none; margin: 0 auto; padding: 16px; max-width: 1080px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
        a { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px 14px; border-radius: 14px; background: var(--card); color: inherit; text-decoration: none; border-top: 4px solid var(--color); box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); transition: transform 0.12s; }
        a:hover, a:focus-visible { transform: translateY(-2px); }
        img { border-radius: 16px; }
        span { font-size: 0.85rem; text-align: center; line-height: 1.35; overflow-wrap: anywhere; }
    </style>
</head>
<body>
    <header>
        <h1>web-games</h1>
        <p>ブラウザで遊べるボードゲーム・パズルゲーム ${entries.length} 本</p>
    </header>
    <main>
        <ul>
${cards}
        </ul>
    </main>
</body>
</html>
`);

console.log(`${entries.length} 本を _site/ に集めました`);
