// ゲームをまたいだ決まりを確かめる（同じサイトに並べるため）
// - service worker のキャッシュの名前が、ゲームどうしで重ならない
// - service worker が、ほかのゲームのキャッシュを消さない（自分の名前の頭のものだけ消す）
// - 保存の名前（localStorage）の頭が、ゲームどうしで重ならない
// - 入口のページの検索・絞り込みに使う情報（人数・原題・ジャンル）がそろっている（scripts/portal/metadata.mjs）。
//   遊ぶ時間・難しさは、書き方の誤りだけを落とし、書いていないものは警告として出す
// - BGM の再生エンジンの写し（sound/engine.js・engine.mjs）が、packages/sound の今の本体と同じ（packages/sound/scripts/sync.mjs）
// - ゲームの標準（docs/standards.md）の必須の項目を満たし、宣言に誤りがない（scripts/standards.mjs の checkRequired）
//   公開（pages.yml）では --skip-standards を付けて、この確認だけを省く（標準の欠けで公開を止めない）
// 使い方: node scripts/check-games.mjs [--skip-standards]
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameMetadata } from './portal/metadata.mjs';
import { LOCK_FILE as SOUND_LOCK, copyProblems } from '../packages/sound/scripts/sync.mjs';
import { checkRequired } from './standards.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// netplay/ は netplay-kit のクライアントの写し。使い方の例に、ほかのゲームの保存の名前が書いてあるので読まない
const SKIP_DIRS = ['node_modules', 'netplay'];

const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.includes(entry.name) ? [] : listFiles(path);
    return /\.(m?js|html)$/.test(entry.name) ? [path] : [];
});

export const listGames = (gamesDir) => readdirSync(gamesDir).filter((name) => existsSync(join(gamesDir, name, 'package.json'))).sort();

// 決まりに反する点を、1行ずつの文の配列で返す（空なら問題なし）
export function checkGames(gamesDir, games = listGames(gamesDir), { standards = true } = {}) {
    const errors = [];
    const owners = { cache: new Map(), storage: new Map() };
    const claim = (kind, key, game) => {
        const owner = owners[kind].get(key);
        if (owner && owner !== game) errors.push(`${kind} の名前「${key}」が ${owner} と ${game} で重なる`);
        owners[kind].set(key, game);
    };
    for (const game of games) {
        for (const error of gameMetadata(gamesDir, game).errors) errors.push(`${game}: ${error}`);
        // BGM のエンジンの写しは、同期したときのまま、packages/sound と同じであること
        const hasEngine = existsSync(join(gamesDir, game, 'public/js/sound/engine.js'));
        if (existsSync(join(gamesDir, game, SOUND_LOCK))) {
            for (const problem of copyProblems(join(gamesDir, game))) errors.push(`${game}: BGM のエンジンの写しが packages/sound と違う（${problem}）。node packages/sound/scripts/sync.mjs ${game} で同期する`);
        } else if (hasEngine) {
            errors.push(`${game}: BGM のエンジンの写しに ${SOUND_LOCK} がない`);
        }
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
            for (const match of text.matchAll(/['"`]([A-Za-z][\w-]*)[.:](?:save|settings|level|online|sound|bgm|setup|name|progress|decks)\b/g)) {
                claim('storage', match[1], game);
            }
        }
    }

    // ゲームの標準の必須の項目（docs/standards.md）
    if (standards) errors.push(...checkRequired(gamesDir, games));
    return errors;
}

// 落とすまではしないが、知らせること（入口のページの情報の、まだ書いていない項目）
export const metadataWarnings = (gamesDir, games = listGames(gamesDir)) => games
    .flatMap((game) => gameMetadata(gamesDir, game).warnings.map((warning) => `${game}: ${warning}`));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const gamesDir = join(root, 'games');
    const games = listGames(gamesDir);
    const standards = !process.argv.includes('--skip-standards');
    const warnings = metadataWarnings(gamesDir, games);
    if (warnings.length > 0) console.warn(`警告（落とさない）:\n${warnings.join('\n')}`);
    const errors = checkGames(gamesDir, games, { standards });
    if (errors.length > 0) {
        console.error(errors.join('\n'));
        process.exit(1);
    }
    console.log(`${games.length} 本のキャッシュと保存の名前に重なりはなく、入口のページの情報${standards ? 'と、標準の必須の項目' : ''}もそろっています`);
}
