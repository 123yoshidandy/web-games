// まとめたサーバー（web-games-online）の接続先を、全ゲームの画面に書く（docs/server-merge.md の「切り替えの順番」の7）
// - 新しい形のゲーム：public/js/online-config.js の DEPLOYED_SERVER_URL に、そのままの URL（wss://<API>/prod）を書く
//   ?game=<名前> は、画面の resolveOnlineServerUrl が付ける
// - 前からの7本：それぞれの定数（LEGACY_GAMES）に、URL と ?game=<名前> を書く
//   ただし、サーバーの handler.js が keyPrefix: '<名前>' を渡していないうちは書かない（部屋のキーにゲームの名前が付かず、7本どうしでぶつかりうるため）
//   書かなかったものは、ファイル・定数・書く値を一覧で出す
// 使い方: node scripts/set-online-url.mjs <wss://...> [--dry-run]
//   --dry-run … 書き換えずに、何が変わるかだけを出す
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// 前からの7本の接続先（docs/server-merge.md の表）。panel-de-pon・wordle は新しい形に移したので外した
export const LEGACY_GAMES = {
    'dominion': { file: 'public/js/online-config.js', constant: 'DEPLOYED_SERVER_URL' },
    'katan': { file: 'public/js/online-config.js', constant: 'DEPLOYED_SERVER_URL' },
    'lucky-numbers': { file: 'public/js/online-config.js', constant: 'DEPLOYED_SERVER_URL' },
    'mine-blocks': { file: 'js/online-config.js', constant: 'ONLINE_DEPLOYED_SERVER_URL' },
    'pokemon-card-game': { file: 'public/js/online-controller.js', constant: 'DEPLOYED_SERVER_URL' }
};

const NEW_STYLE_FILE = 'public/js/online-config.js';

// API Gateway の WebSocketUrl の形（wss://<API>.execute-api.<region>.amazonaws.com/prod）。? や # は付けない
const URL_PATTERN = /^wss:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~-]+)*$/;

export const normalizeUrl = (url) => {
    const trimmed = String(url ?? '').trim().replace(/\/+$/, '');
    if (!URL_PATTERN.test(trimmed)) {
        throw new Error(`接続先の形が違います（wss://<API>.execute-api.ap-northeast-1.amazonaws.com/prod の形。?game= は付けない）: ${url}`);
    }
    return trimmed;
};

// const 定数 = '...'; の値の部分（export の有無と、行末のコメントは問わない）
const constantPattern = (constant) => new RegExp(`^((?:export )?const ${constant} = )'([^'\\n]*)'`, 'gm');

const replaceConstant = (text, constant, value) => {
    const matches = [...text.matchAll(constantPattern(constant))];
    if (matches.length !== 1) return null;
    return { from: matches[0][2], text: text.replace(constantPattern(constant), (_, head) => `${head}'${value}'`) };
};

export function setOnlineUrl({ root = repoRoot, url, dryRun = false }) {
    const base = normalizeUrl(url);
    const report = { url: base, updated: [], unchanged: [], legacyPending: [], problems: [], withoutOnline: [] };
    const gamesDir = join(root, 'games');
    const games = readdirSync(gamesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

    for (const game of games) {
        const legacy = LEGACY_GAMES[game];
        const file = join(gamesDir, game, legacy ? legacy.file : NEW_STYLE_FILE);
        const constant = legacy ? legacy.constant : 'DEPLOYED_SERVER_URL';
        const value = legacy ? `${base}?game=${game}` : base;
        const entry = { game, file: relative(root, file), constant, value };

        if (!existsSync(file)) {
            if (legacy) report.problems.push({ ...entry, reason: 'ファイルがありません' });
            else report.withoutOnline.push(game);
            continue;
        }
        const text = readFileSync(file, 'utf8');
        if (!legacy && !text.includes('resolveOnlineServerUrl')) {
            report.problems.push({ ...entry, reason: 'resolveOnlineServerUrl を使っていません（新しい形の online-config.js ではない）' });
            continue;
        }
        const replaced = replaceConstant(text, constant, value);
        if (!replaced) {
            report.problems.push({ ...entry, reason: `const ${constant} = '...' がちょうど1つではありません` });
            continue;
        }
        if (legacy) {
            const handler = join(gamesDir, game, 'server', 'src', 'handler.js');
            if (!existsSync(handler) || !readFileSync(handler, 'utf8').includes(`keyPrefix: '${game}'`)) {
                report.legacyPending.push({ ...entry, from: replaced.from, reason: `server/src/handler.js が keyPrefix: '${game}' を渡していない` });
                continue;
            }
        }
        if (replaced.from === value) {
            report.unchanged.push({ ...entry, from: replaced.from });
            continue;
        }
        if (!dryRun) writeFileSync(file, replaced.text);
        report.updated.push({ ...entry, from: replaced.from });
    }
    return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const [url] = args.filter((arg) => !arg.startsWith('--'));
    if (!url) {
        console.error('使い方: node scripts/set-online-url.mjs <wss://...> [--dry-run]');
        process.exit(2);
    }
    let report;
    try {
        report = setOnlineUrl({ url, dryRun });
    } catch (error) {
        console.error(error.message);
        process.exit(2);
    }
    const verb = dryRun ? '書き換える予定（--dry-run なので書いていない）' : '書き換えた';
    console.log(`接続先: ${report.url}`);
    console.log(`${verb}: ${report.updated.length} 本`);
    for (const { file, from, value } of report.updated) console.log(`  ${file}: '${from}' → '${value}'`);
    console.log(`同じ値なので変えなかった: ${report.unchanged.length} 本`);
    console.log(`オンライン対戦のないゲーム: ${report.withoutOnline.length} 本${report.withoutOnline.length ? `（${report.withoutOnline.join(', ')}）` : ''}`);
    if (report.legacyPending.length > 0) {
        console.log(`前からのゲームで、まだ書いていないもの: ${report.legacyPending.length} 本`);
        console.log('  handler.js に keyPrefix を渡してから、もう一度このスクリプトを流す（か、次の値を手で書く）');
        for (const { file, constant, value, reason } of report.legacyPending) {
            console.log(`  ${file} の ${constant} = '${value}'（${reason}）`);
        }
    }
    if (report.problems.length > 0) {
        console.error(`書けなかったもの: ${report.problems.length} 本`);
        for (const { file, reason } of report.problems) console.error(`  ${file}: ${reason}`);
        process.exit(1);
    }
}
