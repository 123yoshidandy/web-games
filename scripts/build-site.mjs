// GitHub Pages に載せるファイルを _site/ に集める
// - 各ゲームの公開するファイルを _site/<名前>/ に写す（public/ があればその中身、なければゲームのフォルダから、
//   サーバー・テスト・設定などのファイルを除いたもの）
// - ゲームの一覧の入口のページ _site/index.html を、各ゲームの manifest と portal の情報（scripts/portal/metadata.mjs）から作る。
//   検索・絞り込みの JS は scripts/portal/ から _site/portal/ に写す
//   ログイン（名前だけ）と「自分の記録」の JS（scripts/portal/stats.js）も写し、netplay-kit の user-stats.js を横に置く（docs/user-stats.md）
// - service worker が先に読むファイルが、写した先にすべてあるかを確かめる
// 使い方: node scripts/build-site.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENRES, PRIVATE, gameMetadata } from './portal/metadata.mjs';
import { PLAYER_CHOICES, MANY_PLAYERS, normalize, playersLabel } from './portal/filter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'games');
const site = join(root, '_site');
const PORTAL_DIR = 'portal';

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

const games = readdirSync(gamesDir).filter((name) => existsSync(join(gamesDir, name, 'package.json'))).sort();
const entries = [];
const errors = [];
const missing = [];

if (games.includes(PORTAL_DIR)) errors.push(`ゲームの名前「${PORTAL_DIR}」は、入口のページの JS の置き場と重なる`);

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
    // 情報が足りないゲームも一覧には出す（足りないことは check-games.mjs が知らせる）
    const meta = gameMetadata(gamesDir, game);
    if (meta.errors.length > 0) missing.push(game);
    entries.push({
        game,
        name: manifest.name,
        shortName: manifest.short_name ?? '',
        icon: icon ? `${game}/${icon.src}` : '',
        color: manifest.theme_color ?? '#333',
        ...meta
    });
}

if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
}

mkdirSync(join(site, PORTAL_DIR));
for (const file of ['filter.js', 'page.js', 'stats.js', 'stats-view.js']) cpSync(join(root, 'scripts', 'portal', file), join(site, PORTAL_DIR, file));
// ログインと「自分の記録」は、ゲームと同じ netplay-kit の画面側の部品を使う（docs/user-stats.md）
cpSync(join(root, 'packages', 'netplay-kit', 'client', 'user-stats.js'), join(site, PORTAL_DIR, 'user-stats.js'));

const cards = entries.map(({ game, name, shortName, icon, color, players, online, original, aliases, genres }) => {
    // 名前・短い名前・原題・読み・フォルダ名を、区切り文字でつないで1つにする（語をまたいで当たらないように）
    const search = [name, shortName, original, ...aliases, game].map(normalize).join('/');
    const tags = [playersLabel(players), online ? 'オンライン' : ''].filter(Boolean);
    return `            <li data-game="${escapeHtml(game)}" data-search="${escapeHtml(search)}" data-players="${players.join(' ')}" data-online="${online ? 1 : 0}" data-genres="${escapeHtml(genres.join('|'))}"><a href="${game}/" style="--color: ${escapeHtml(color)}">
                ${icon ? `<img src="${escapeHtml(icon)}" alt="" width="72" height="72" loading="lazy">` : ''}
                <span class="name">${escapeHtml(name)}</span>
                ${tags.length > 0 ? `<span class="tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</span>` : ''}
                <span class="mine" hidden></span>
            </a></li>`;
}).join('\n');

const chip = (key, value, label) => `<button type="button" data-key="${key}" data-value="${escapeHtml(value)}" aria-pressed="false">${escapeHtml(label)}</button>`;
const group = (id, label, buttons) => `                <div class="group" role="group" aria-labelledby="${id}">
                    <span class="label" id="${id}">${label}</span>
                    <div class="chips">
                        ${buttons.join('\n                        ')}
                    </div>
                </div>`;
const usedGenres = GENRES.filter((genre) => entries.some((e) => e.genres.includes(genre)));

const filters = [
    group('label-players', '人数<small>（CPU も含む）</small>', [
        chip('players', '', 'すべて'),
        ...PLAYER_CHOICES.map((n) => chip('players', String(n), n === MANY_PLAYERS ? `${n}人以上` : `${n}人`))
    ]),
    group('label-online', 'オンライン<small>（対戦）</small>', [chip('online', '', 'すべて'), chip('online', 'yes', 'できる'), chip('online', 'no', 'できない')]),
    // ジャンルはいくつでも選べる（どれかに当たるものを残す）
    group('label-genre', 'ジャンル<small>（複数可）</small>', [chip('genre', '', 'すべて'), ...usedGenres.map((g) => chip('genre', g, g))])
].join('\n');

writeFileSync(join(site, 'index.html'), `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>web-games</title>
    <style>
        :root { color-scheme: light dark; --bg: #f4f1ea; --fg: #1f1d1a; --card: #fff; --muted: #6b665d; --line: #d9d3c7; --accent: #2f6fd0; --on-accent: #fff; }
        @media (prefers-color-scheme: dark) { :root { --bg: #16151a; --fg: #ece8e1; --card: #23222a; --muted: #a09a90; --line: #3a3842; --accent: #7aa7ff; --on-accent: #10131a; } }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
        header { padding: 32px 16px 8px; max-width: 1080px; margin: 0 auto; }
        h1 { margin: 0; font-size: 1.6rem; letter-spacing: 0.02em; }
        header p { margin: 6px 0 0; color: var(--muted); font-size: 0.9rem; }
        #filters { max-width: 1080px; margin: 0 auto; padding: 8px 16px 0; display: grid; gap: 10px; }
        #filters[hidden] { display: none; }
        form { margin: 0; }
        input[type="search"] { width: 100%; font: inherit; font-size: 1rem; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); color: inherit; }
        input[type="search"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        #filter-groups { display: grid; gap: 10px; }
        #filter-groups[hidden] { display: none; }
        .group { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
        .label { flex: 0 0 auto; min-width: 7.5em; font-size: 0.8rem; font-weight: 600; color: var(--muted); }
        .label small { font-weight: 400; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 260px; min-width: 0; }
        #filters button { font: inherit; font-size: 0.85rem; padding: 6px 12px; min-height: 34px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: inherit; cursor: pointer; }
        #filters button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
        #filters button:focus-visible, #empty button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .status { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .actions { display: flex; align-items: center; gap: 6px; }
        #filters .toggle { font-weight: 600; }
        #filters .toggle::after { content: "▾"; margin-left: 4px; }
        #filters .toggle[aria-expanded="true"]::after { content: "▴"; }
        #filters .toggle.active { border-color: var(--accent); color: var(--accent); }
        #count { margin: 0; font-size: 0.9rem; color: var(--muted); }
        #filters .reset, #empty button { border-radius: 8px; font: inherit; font-size: 0.85rem; padding: 6px 12px; min-height: 34px; border: 1px solid var(--line); background: transparent; color: var(--accent); cursor: pointer; }
        #empty { max-width: 1080px; margin: 0 auto; padding: 24px 16px; text-align: center; color: var(--muted); }
        #empty p { margin: 0 0 12px; }
        #games { list-style: none; margin: 0 auto; padding: 16px; max-width: 1080px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
        #games li[hidden] { display: none; }
        #games a { height: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px 14px; border-radius: 14px; background: var(--card); color: inherit; text-decoration: none; border-top: 4px solid var(--color); box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); transition: transform 0.12s; }
        #games a:hover, #games a:focus-visible { transform: translateY(-2px); }
        #games img { border-radius: 16px; }
        .name { font-size: 0.85rem; text-align: center; line-height: 1.35; overflow-wrap: anywhere; }
        .tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: auto; }
        .tags span { font-size: 0.7rem; line-height: 1.4; padding: 1px 7px; border-radius: 999px; background: var(--bg); color: var(--muted); white-space: nowrap; }
        .mine { font-size: 0.7rem; font-weight: 600; color: var(--accent); white-space: nowrap; }
        .mine[hidden] { display: none; }
        .account { margin-top: 12px; display: grid; gap: 6px; }
        .account[hidden], .account [hidden] { display: none; }
        .account form, #account-user { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .account input { flex: 1 1 140px; min-width: 0; max-width: 220px; font: inherit; font-size: 1rem; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: inherit; }
        .account button, #stats-dialog button { font: inherit; font-size: 0.85rem; padding: 6px 12px; min-height: 34px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: inherit; cursor: pointer; }
        .account button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
        #account-name { font-weight: 600; margin-right: 4px; }
        #account-note { margin: 0; font-size: 0.8rem; color: var(--muted); }
        #stats-dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--card); color: var(--fg); }
        #stats-dialog::backdrop { background: rgb(0 0 0 / 0.4); }
        .stats-head { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; background: var(--card); border-bottom: 1px solid var(--line); }
        .stats-head h2 { margin: 0; font-size: 1.1rem; }
        #stats-body { padding: 8px 16px 16px; }
        .stats-total, .stats-empty { margin: 4px 0 10px; font-size: 0.9rem; color: var(--muted); }
        .stats-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .stats-table th, .stats-table td { padding: 6px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
        .stats-table thead th { font-size: 0.75rem; color: var(--muted); font-weight: 600; text-align: right; }
        .stats-table thead th:first-child, .stats-table tbody th { text-align: left; }
        .stats-table td { text-align: right; font-variant-numeric: tabular-nums; width: 3em; }
        .stats-table tbody th a { color: inherit; font-weight: 600; }
        .stats-table small { display: block; font-weight: 400; font-size: 0.7rem; color: var(--muted); }
        .vs { list-style: none; margin: 4px 0 0; padding: 0; font-weight: 400; font-size: 0.75rem; color: var(--muted); display: grid; gap: 2px; }
        .vs li { display: flex; gap: 6px; align-items: baseline; }
        .vs .cpu { font-size: 0.65rem; padding: 0 5px; border-radius: 999px; border: 1px solid var(--line); }
        .vs-record { margin-left: auto; white-space: nowrap; }
        @media (max-width: 480px) {
            #filters, #filter-groups { gap: 8px; }
            .group { flex-wrap: nowrap; align-items: flex-start; gap: 8px; }
            .label { min-width: 0; flex: 0 0 5.4em; padding-top: 7px; line-height: 1.3; white-space: nowrap; }
            .label small { display: block; font-size: 0.65rem; }
            .chips { flex: 1 1 auto; gap: 5px; }
            #filters button { font-size: 0.8rem; padding: 5px 10px; min-height: 32px; }
            #games { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; } #games img { width: 60px; height: 60px; }
        }
    </style>
</head>
<body>
    <header>
        <h1>web-games</h1>
        <p>ブラウザで遊べるゲーム ${entries.length} 本</p>
        <div id="account" class="account" hidden>
            <form id="login-form">
                <input type="text" id="login-name" maxlength="12" placeholder="名前" aria-label="ログインの名前" autocomplete="nickname" enterkeyhint="done">
                <button type="submit" class="primary">ログイン</button>
            </form>
            <div id="account-user" hidden>
                <span id="account-name"></span>
                <button type="button" id="stats-open" class="primary">自分の記録</button>
                <button type="button" id="logout">ログアウト</button>
            </div>
            <p id="account-note" hidden></p>
        </div>
    </header>
    <dialog id="stats-dialog" aria-labelledby="stats-title">
        <div class="stats-head"><h2 id="stats-title">自分の記録</h2><button type="button" id="stats-close">閉じる</button></div>
        <div id="stats-body"></div>
    </dialog>
    <section id="filters" aria-label="検索と絞り込み" hidden>
        <form role="search">
            <input type="search" id="q" placeholder="名前で探す（例：かたん、Azul）" aria-label="ゲームの名前で探す" autocomplete="off" enterkeyhint="search">
        </form>
        <div class="status">
            <div class="actions">
                <button type="button" id="filter-toggle" class="toggle" aria-expanded="false" aria-controls="filter-groups">絞り込み<span id="filter-count"></span></button>
                <button type="button" id="filter-clear" class="reset" hidden>解除</button>
            </div>
            <p id="count" aria-live="polite">全 ${entries.length} 本</p>
        </div>
        <div id="filter-groups" hidden>
${filters}
        </div>
    </section>
    <main>
        <ul id="games">
${cards}
        </ul>
        <div id="empty" hidden>
            <p>条件に合うゲームはありません</p>
            <button type="button" data-reset>条件をクリア</button>
        </div>
    </main>
    <script type="module" src="${PORTAL_DIR}/page.js"></script>
    <script type="module" src="${PORTAL_DIR}/stats.js"></script>
</body>
</html>
`);

console.log(`${entries.length} 本を _site/ に集めました`);
if (missing.length > 0) console.warn(`検索・絞り込みの情報が足りないゲーム（check-games.mjs で確かめる）: ${missing.join(', ')}`);
