// 入口のページ（ゲームの一覧）の検索・絞り込みに使う、ゲームごとの情報を集める
// - 人数：公開するコードの export const MIN_PLAYERS・MAX_PLAYERS・PLAYERS・PLAYER_COUNT・PLAYER_COUNTS から取る。
//   ないときは package.json の portal.players（[2] や [1, 2, 3, 4] のような、遊べる人数の一覧）を使う
// - オンライン対戦：画面側の netplay-kit の写し（公開するフォルダの js/netplay/）と、サーバーの入口（server/src/handler.js）の両方があるか。
//   server/src/game-definition.js（ゲームの定義）だけのゲームは、まだ画面から対戦できないので含めない
// - 原題とジャンル：package.json の portal.original と portal.genres に書く（コードからは分からないため）。
//   portal.aliases（読みや別名）は任意
// 例: "portal": { "original": "Azul", "genres": ["タイル配置"] }
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ジャンルの一覧（この順で絞り込みのボタンを並べる）。portal.genres はこの中から1つ以上選ぶ
export const GENRES = [
    'ボードゲーム', 'カードゲーム', 'ダイス', 'タイル配置', 'アブストラクト',
    '伝統ゲーム', '協力', '正体隠し・ブラフ', 'パズル', '言葉'
];

// public/ がないゲームで、公開しないもの
export const PRIVATE = new Set([
    'node_modules', 'server', 'test', 'scripts', 'tools',
    'package.json', 'README.md', 'vitest.config.js', 'netplay-kit.lock.json', 'sound.lock.json', 'validate-words.js'
]);

// netplay/ は netplay-kit の写しなので、人数の定数を探さない
const SKIP_DIRS = new Set([...PRIVATE, 'netplay']);

const listScripts = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listScripts(path);
    return /\.m?js$/.test(entry.name) && entry.name !== 'sw.js' ? [path] : [];
});

const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

// 公開するコードの export から、遊べる人数の一覧を読む。定数がなければ null
export const playersFromCode = (dir) => {
    const found = {};
    const conflicts = [];
    for (const file of listScripts(dir)) {
        const text = readFileSync(file, 'utf8');
        for (const [, name, value] of text.matchAll(/export const (MIN_PLAYERS|MAX_PLAYERS|PLAYERS|PLAYER_COUNT|PLAYER_COUNTS) = (\d+|\[[\d,\s]+\])/g)) {
            const parsed = JSON.parse(value);
            if (name in found && JSON.stringify(found[name]) !== JSON.stringify(parsed)) conflicts.push(name);
            found[name] = parsed;
        }
    }
    if (conflicts.length > 0) return { error: `${conflicts.join('・')} がファイルによって違う` };
    if (Array.isArray(found.PLAYER_COUNTS)) return { players: found.PLAYER_COUNTS };
    if (found.MIN_PLAYERS && found.MAX_PLAYERS) return { players: range(found.MIN_PLAYERS, found.MAX_PLAYERS) };
    const fixed = found.PLAYERS ?? found.PLAYER_COUNT;
    if (Number.isInteger(fixed)) return { players: [fixed] };
    return null;
};

// オンライン対戦が画面から遊べるか（画面側の写しとサーバーの入口がそろっている）
export const hasOnlinePlay = (gameDir, publicDir) => existsSync(join(publicDir, 'js', 'netplay'))
    && existsSync(join(gameDir, 'server', 'src', 'handler.js'));

const isPlayerList = (value) => Array.isArray(value) && value.length > 0
    && value.every((n, i) => Number.isInteger(n) && n >= 1 && (i === 0 || n > value[i - 1]));

// ゲーム1本分の情報を集める。足りないものや食い違いは errors に入れる（入口のページは errors があっても作る）
export const gameMetadata = (gamesDir, game) => {
    const gameDir = join(gamesDir, game);
    const publicDir = existsSync(join(gameDir, 'public')) ? join(gameDir, 'public') : gameDir;
    const portal = JSON.parse(readFileSync(join(gameDir, 'package.json'), 'utf8')).portal;
    const errors = [];

    if (!portal) errors.push('package.json に portal がない（原題とジャンルを書く）');
    const original = typeof portal?.original === 'string' ? portal.original.trim() : '';
    if (portal && !original) errors.push('portal.original（原題・英語名）がない');
    const genres = Array.isArray(portal?.genres) ? portal.genres : [];
    if (portal && genres.length === 0) errors.push('portal.genres（ジャンル）がない');
    for (const genre of genres) {
        if (!GENRES.includes(genre)) errors.push(`portal.genres の「${genre}」は決めたジャンルにない（${GENRES.join('・')}）`);
    }
    // 読みや別名は任意（名前が漢字や英字だけのときに、ひらがなで探せるようにする）
    const aliases = portal?.aliases ?? [];
    if (!Array.isArray(aliases) || !aliases.every((a) => typeof a === 'string' && a.trim())) {
        errors.push('portal.aliases は、読みや別名の文字列の一覧で書く');
    }

    const fromCode = playersFromCode(publicDir);
    if (fromCode?.error) errors.push(fromCode.error);
    if (portal?.players !== undefined && !isPlayerList(portal.players)) {
        errors.push('portal.players は、小さい順の人数の一覧（例：[2, 3, 4]）で書く');
    }
    const declared = isPlayerList(portal?.players) ? portal.players : null;
    const players = fromCode?.players ?? declared ?? [];
    if (!fromCode?.players && !declared) {
        errors.push('人数が分からない（コードに MIN_PLAYERS・MAX_PLAYERS などがないので、portal.players に書く）');
    }
    if (fromCode?.players && declared && JSON.stringify(fromCode.players) !== JSON.stringify(declared)) {
        errors.push(`portal.players（${declared.join(',')}）が、コードの人数（${fromCode.players.join(',')}）と違う`);
    }

    return {
        players,
        online: hasOnlinePlay(gameDir, publicDir),
        original,
        aliases: Array.isArray(aliases) ? aliases.filter((a) => typeof a === 'string') : [],
        genres: genres.filter((genre) => GENRES.includes(genre)),
        errors
    };
};
