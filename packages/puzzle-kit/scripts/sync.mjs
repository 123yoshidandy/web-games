#!/usr/bin/env node
/**
 * パズルのゲームの共通の画面とロジック（client/ の下）を、各ゲームの public/ にコピーする（コピーして同期）
 *
 *   node scripts/sync.mjs <ゲーム> [--force]
 *     <ゲーム> は web-games の games/ の下のフォルダ名（nonogram なら games/nonogram）か、ゲームのフォルダのパス
 *     client/ の下のファイルを、同じ並びでゲームの public/ にコピーし、puzzle-kit.lock.json（版・場所・各ファイルの sha256）をゲームの直下に置く
 *     コピー先が手で直されていたら、上書きせずに止める（--force で上書きする）
 *     ゲームが持つファイル（js/game.js・js/puzzles/<id>/・js/online-config.js・js/sound/bgm.js・css/theme.css など）は、コピーも確認もしない
 *
 *   node scripts/sync.mjs check <ゲーム>
 *     コピー先が手で直されていないか、packages/puzzle-kit の今の本体と同じかを確かめる（違えば終了コード1）
 *
 *   node scripts/sync.mjs check --all
 *     games/ の下で puzzle-kit.lock.json を持つゲームを、すべて確かめる
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// web-games の games/（packages/puzzle-kit から2つ上）
const GAMES_ROOT = path.resolve(KIT_ROOT, '../../games');
export const LOCK_FILE = 'puzzle-kit.lock.json';
const TARGET_DIR = 'public';
// ゲームが持つはずのファイル（なければ同期のあとで知らせる）
export const GAME_FILES = ['js/game.js', 'js/online-config.js', 'js/sound/bgm.js', 'css/theme.css'];

// ===== 入口 =====

// gamesRoot: フォルダ名だけで指定したゲームを探す場所（テストで決めるため）
export function main(argv, { kitRoot = KIT_ROOT, gamesRoot = GAMES_ROOT } = {}) {
    const args = parseArgs(argv);
    if (args.command === 'check' && args.all) return checkAll(gamesRoot, kitRoot);
    if (!args.repo) {
        console.error('使い方: node scripts/sync.mjs [check] <ゲーム> [--force]　／　node scripts/sync.mjs check --all');
        return 2;
    }
    const repo = resolveGame(args.repo, gamesRoot);
    if (!fs.existsSync(repo)) {
        console.error(`ゲームのフォルダが見つかりません: ${repo}`);
        return 2;
    }
    return args.command === 'check' ? check(repo, kitRoot) : sync(repo, args, kitRoot);
}

// フォルダ名だけ（nonogram）なら games/ の下、パス（./games/nonogram）ならそのまま
function resolveGame(arg, gamesRoot) {
    const isName = !arg.includes('/') && !arg.includes(path.sep) && arg !== '.' && arg !== '..';
    return isName ? path.join(gamesRoot, arg) : path.resolve(arg);
}

function parseArgs(argv) {
    const args = { command: 'sync', repo: null, force: false, all: false };
    const rest = [...argv];
    if (rest[0] === 'check' || rest[0] === 'sync') args.command = rest.shift();
    while (rest.length > 0) {
        const arg = rest.shift();
        if (arg === '--force') args.force = true;
        else if (arg === '--all') args.all = true;
        else args.repo = arg;
    }
    return args;
}

// ===== 同期 =====

function sync(repo, args, kitRoot) {
    const lock = readLock(repo);
    const expected = expectedFiles(kitRoot);

    // 手で直されたファイルがあれば止める（同期で消えてしまうため）
    if (!args.force) {
        const problems = lock ? findModified(repo, lock) : findUnmanaged(repo, expected);
        if (problems.length > 0) {
            console.error('コピー先が手で直されています。packages/puzzle-kit に直しを移してから同期してください（上書きしてよければ --force）:');
            problems.forEach(problem => console.error(`  ${problem}`));
            return 1;
        }
    }

    const files = {};
    for (const [target, content] of Object.entries(expected)) {
        fs.mkdirSync(path.dirname(path.join(repo, target)), { recursive: true });
        fs.writeFileSync(path.join(repo, target), content);
        files[target] = hash(content);
    }

    // 前の版にあって、今の版にないファイルは消す
    Object.keys(lock?.files ?? {}).filter(file => !(file in files)).forEach(file => {
        fs.rmSync(path.join(repo, file), { force: true });
        console.log(`消しました: ${file}`);
    });

    const version = kitVersion(kitRoot);
    fs.writeFileSync(path.join(repo, LOCK_FILE), JSON.stringify({ version, dir: TARGET_DIR, files }, null, 2) + '\n');
    console.log(`packages/puzzle-kit ${version} を ${repo} の ${TARGET_DIR}/ に同期しました（${Object.keys(files).length} 件）`);
    const missing = GAME_FILES.filter(file => !fs.existsSync(path.join(repo, TARGET_DIR, file)));
    if (missing.length > 0) console.log(`ゲームが持つファイルがまだありません（README の「ゲームを作る」）: ${missing.join('・')}`);
    return 0;
}

// client/ の下のファイル（相対パス。/ 区切り）
function clientFiles(dir, base = dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return clientFiles(full, base);
        return [path.relative(base, full).split(path.sep).join('/')];
    }).sort();
}

// コピー先に置くべき中身（ゲームの直下からのパス → 中身。先頭に、写しであることを書いた1行を付ける）
function expectedFiles(kitRoot) {
    const version = kitVersion(kitRoot);
    const note = `packages/puzzle-kit ${version} からコピーしたファイル。ここでは直さず、packages/puzzle-kit で直してから同期する`;
    const clientDir = path.join(kitRoot, 'client');
    return Object.fromEntries(clientFiles(clientDir).map(file => {
        const header = file.endsWith('.css') ? `/* ${note} */\n` : `// ${note}\n`;
        return [path.posix.join(TARGET_DIR, file), header + fs.readFileSync(path.join(clientDir, file), 'utf8')];
    }));
}

// ===== 確認 =====

// 写しの問題（手で直された・本体より古い）の一覧。なければ空
export function copyProblems(repo, kitRoot = KIT_ROOT) {
    const lock = readLock(repo);
    if (!lock) return [`${LOCK_FILE} がありません`];
    const modified = findModified(repo, lock);
    return modified.length > 0 ? modified : findOutdated(repo, lock, kitRoot);
}

function check(repo, kitRoot) {
    const lock = readLock(repo);
    if (!lock) {
        console.error(`${LOCK_FILE} がありません。先に node packages/puzzle-kit/scripts/sync.mjs ${path.basename(repo)} で同期してください`);
        return 1;
    }
    const modified = findModified(repo, lock);
    if (modified.length > 0) {
        console.error('コピー先が手で直されています:');
        modified.forEach(problem => console.error(`  ${problem}`));
        return 1;
    }
    const outdated = findOutdated(repo, lock, kitRoot);
    if (outdated.length > 0) {
        console.error(`packages/puzzle-kit の今の本体と違います。node packages/puzzle-kit/scripts/sync.mjs ${path.basename(repo)} で同期してください:`);
        outdated.forEach(problem => console.error(`  ${problem}`));
        return 1;
    }
    console.log(`packages/puzzle-kit ${lock.version} と同じです`);
    return 0;
}

// games/ の下で lock を持つゲームを、すべて確かめる（1つでも違えば終了コード1）
function checkAll(gamesRoot, kitRoot) {
    const repos = fs.existsSync(gamesRoot)
        ? fs.readdirSync(gamesRoot).sort().map(name => path.join(gamesRoot, name)).filter(repo => fs.existsSync(path.join(repo, LOCK_FILE)))
        : [];
    let failed = 0;
    for (const repo of repos) {
        console.log(`${path.basename(repo)}:`);
        if (check(repo, kitRoot) !== 0) failed++;
    }
    console.log(`packages/puzzle-kit を同期したゲームは ${repos.length} 本${failed > 0 ? `（うち ${failed} 本は本体と違います）` : 'で、すべて本体と同じです'}`);
    return failed > 0 ? 1 : 0;
}

function findModified(repo, lock) {
    return Object.entries(lock.files).flatMap(([file, expected]) => {
        const full = path.join(repo, file);
        if (!fs.existsSync(full)) return [`見つかりません: ${file}`];
        return hash(fs.readFileSync(full, 'utf8')) === expected ? [] : [`直されています: ${file}`];
    });
}

// 本体の名前のファイルが、lock なしで置かれているか（初めて同期する前に確かめる）
function findUnmanaged(repo, expected) {
    return Object.keys(expected)
        .filter(file => fs.existsSync(path.join(repo, file)))
        .map(file => `同期していないファイル: ${file}`);
}

// コピー先が、packages/puzzle-kit の今の本体から作ったものと同じか
function findOutdated(repo, lock, kitRoot) {
    const expected = expectedFiles(kitRoot);
    const listed = Object.keys(lock.files).sort();
    const wanted = Object.keys(expected).sort();
    if (listed.join() !== wanted.join()) return [`コピーするファイルが変わりました（足りない: ${wanted.filter(f => !listed.includes(f)).join('・') || 'なし'}、余分: ${listed.filter(f => !wanted.includes(f)).join('・') || 'なし'}）`];
    return listed.flatMap(file => (fs.readFileSync(path.join(repo, file), 'utf8') === expected[file] ? [] : [`古い: ${file}`]));
}

// ===== 補助 =====

function readLock(repo) {
    const file = path.join(repo, LOCK_FILE);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function hash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function kitVersion(kitRoot) {
    return JSON.parse(fs.readFileSync(path.join(kitRoot, 'package.json'), 'utf8')).version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
