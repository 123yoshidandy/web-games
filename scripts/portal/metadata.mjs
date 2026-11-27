// 入口のページ（ゲームの一覧）の検索・絞り込みに使う、ゲームごとの情報を集める
// - 人数：公開するコードの export const MIN_PLAYERS・MAX_PLAYERS・PLAYERS・PLAYER_COUNT・PLAYER_COUNTS から取る。
//   ないときは package.json の portal.players（[2] や [1, 2, 3, 4] のような、遊べる人数の一覧）を使う
// - オンライン対戦：画面側の netplay-kit の写し（公開するフォルダの js/netplay/）と、サーバーの入口（server/src/handler.js）の両方があるか。
//   server/src/game-definition.js（ゲームの定義）だけのゲームは、まだ画面から対戦できないので含めない
// - 原題とジャンル：package.json の portal.original と portal.genres に書く（コードからは分からないため）。
//   portal.aliases（読みや別名）は任意
// - 遊ぶ時間と難しさ：package.json の portal.minutes と portal.weight に書く（docs/standards.md の portal-meta）
//   minutes：このブラウザ版で1ゲーム（パズルは1問）を遊ぶ分数。20 か、幅があれば [20, 30]。
//     原作の箱の時間をもとに、CPU の手番がすぐ終わる分を短くする
//   weight：難しさ 1〜5（1・2 かんたん、3 ふつう、4・5 むずかしい）。BoardGameGeek の重さ（Weight）を
//     1.5・2.2・2.9・3.6 で区切って丸める。伝統ゲームのように、ルールがよく知られているものは下げてよい
//   書き方の誤りは errors、書いていないだけのときは warnings に入れる（作りかけのゲームを止めないため。いずれ errors にする）
// 例: "portal": { "original": "Azul", "genres": ["タイル配置"], "minutes": [15, 30], "weight": 2 }
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ジャンルの一覧（この順で絞り込みのボタンを並べる）。portal.genres はこの中から1つ以上選ぶ
export const GENRES = [
    'ボードゲーム', 'カードゲーム', 'ダイス', 'タイル配置', 'アブストラクト', '協力', 'パズル'
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

// オンライン対戦が画面から遊べるか（画面側の写しとサーバーの入口がそろっている。手元のテスト用サーバーでは遊べる）
export const hasOnlinePlay = (gameDir, publicDir) => existsSync(join(publicDir, 'js', 'netplay'))
    && existsSync(join(gameDir, 'server', 'src', 'handler.js'));

// 配備したサーバーの接続先（js/ の直下のファイルの DEPLOYED_SERVER_URL・ONLINE_DEPLOYED_SERVER_URL に書いた wss:// の URL）
const DEPLOYED_URL = /\b(?:ONLINE_)?DEPLOYED_SERVER_URL\s*=\s*(['"`])wss:\/\/[^'"`\s]+\1/;
export const hasDeployedServer = (publicDir) => {
    const dir = join(publicDir, 'js');
    if (!existsSync(dir)) return false;
    return readdirSync(dir).filter((name) => /\.m?js$/.test(name))
        .some((name) => DEPLOYED_URL.test(readFileSync(join(dir, name), 'utf8')));
};

// ポータルで「オンライン」と出すのは、配備したサーバーにつながるゲームだけ（デプロイ前は、画面でもオンラインのボタンを隠す）
export const hasDeployedOnline = (gameDir, publicDir) => hasOnlinePlay(gameDir, publicDir) && hasDeployedServer(publicDir);

const isMinutes = (n) => Number.isInteger(n) && n >= 1 && n <= 600;
// portal.minutes を [短い, 長い] にそろえる。書き方が違えば null
export const parseMinutes = (value) => {
    if (isMinutes(value)) return [value, value];
    if (Array.isArray(value) && value.length === 2 && value.every(isMinutes) && value[0] < value[1]) return [...value];
    return null;
};
export const isWeight = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

const isPlayerList = (value) => Array.isArray(value) && value.length > 0
    && value.every((n, i) => Number.isInteger(n) && n >= 1 && (i === 0 || n > value[i - 1]));

// ゲーム1本分の情報を集める。足りないものや食い違いは errors に入れる（入口のページは errors があっても作る）
export const gameMetadata = (gamesDir, game) => {
    const gameDir = join(gamesDir, game);
    const publicDir = existsSync(join(gameDir, 'public')) ? join(gameDir, 'public') : gameDir;
    const portal = JSON.parse(readFileSync(join(gameDir, 'package.json'), 'utf8')).portal;
    const errors = [];
    const warnings = [];

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

    const minutes = parseMinutes(portal?.minutes);
    if (portal?.minutes === undefined) warnings.push('portal.minutes（遊ぶ時間の分数）がない');
    else if (!minutes) errors.push('portal.minutes は、1〜600 の分数（例：20）か、小さい順の2つ（例：[20, 30]）で書く');
    const weight = isWeight(portal?.weight) ? portal.weight : null;
    if (portal?.weight === undefined) warnings.push('portal.weight（難しさ 1〜5）がない');
    else if (!weight) errors.push('portal.weight は、1〜5 の整数で書く');

    return {
        players,
        online: hasDeployedOnline(gameDir, publicDir),
        original,
        aliases: Array.isArray(aliases) ? aliases.filter((a) => typeof a === 'string') : [],
        genres: genres.filter((genre) => GENRES.includes(genre)),
        minutes,
        weight,
        errors,
        warnings
    };
};
