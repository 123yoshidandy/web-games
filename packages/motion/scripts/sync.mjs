#!/usr/bin/env node
/**
 * 駒やカードの動きの部品（src/motion.js）を、各ゲームにコピーする（コピーして同期）
 *
 *   node scripts/sync.mjs <ゲーム> [--dir public/js/motion] [--force]
 *     <ゲーム> は web-games の games/ の下のフォルダ名（abalone なら games/abalone）か、ゲームのフォルダのパス
 *     本体を決まったフォルダにコピーし、motion.lock.json（版・場所・各ファイルの sha256）をゲームの直下に置く
 *     コピー先が手で直されていたら、上書きせずに止める（--force で上書きする）
 *
 *   node scripts/sync.mjs check <ゲーム>
 *     コピー先が手で直されていないか、packages/motion の今の本体と同じかを確かめる（違えば終了コード1）
 *
 *   node scripts/sync.mjs check --all
 *     games/ の下で motion.lock.json を持つゲームを、すべて確かめる
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// web-games の games/（packages/motion から2つ上）
const GAMES_ROOT = path.resolve(KIT_ROOT, '../../games');
export const LOCK_FILE = 'motion.lock.json';
export const CORE_FILES = ['motion.js'];

// ===== 入口 =====

// gamesRoot: フォルダ名だけで指定したゲームを探す場所（テストで決めるため）
export function main(argv, { kitRoot = KIT_ROOT, gamesRoot = GAMES_ROOT } = {}) {
    const args = parseArgs(argv);
    if (args.command === 'check' && args.all) return checkAll(gamesRoot, kitRoot);
    if (!args.repo) {
        console.error('使い方: node scripts/sync.mjs [check] <ゲーム> [--dir 場所] [--force]　／　node scripts/sync.mjs check --all');
        return 2;
    }
    const repo = resolveGame(args.repo, gamesRoot);
    if (!fs.existsSync(repo)) {
        console.error(`ゲームのフォルダが見つかりません: ${repo}`);
        return 2;
    }
    return args.command === 'check' ? check(repo, kitRoot) : sync(repo, args, kitRoot);
}

// フォルダ名だけ（abalone）なら games/ の下、パス（./games/abalone・~/x/abalone）ならそのまま
function resolveGame(arg, gamesRoot) {
    const isName = !arg.includes('/') && !arg.includes(path.sep) && arg !== '.' && arg !== '..';
    return isName ? path.join(gamesRoot, arg) : path.resolve(arg);
}

function parseArgs(argv) {
    const args = { command: 'sync', repo: null, dir: null, force: false, all: false };
    const rest = [...argv];
    if (rest[0] === 'check' || rest[0] === 'sync') args.command = rest.shift();
    while (rest.length > 0) {
        const arg = rest.shift();
        if (arg === '--force') args.force = true;
        else if (arg === '--all') args.all = true;
        else if (arg === '--dir') args.dir = rest.shift();
        else args.repo = arg;
    }
    return args;
}

// ===== 同期 =====

function sync(repo, args, kitRoot) {
    const lock = readLock(repo);
    const dir = args.dir ?? lock?.dir ?? detectDir(repo);
    if (!dir) {
        console.error('コピー先のフォルダが見つかりません。--dir で指定してください（例: js/motion）');
        return 2;
    }

    // 手で直されたファイルがあれば止める（同期で消えてしまうため）
    if (!args.force) {
        const problems = lock ? findModified(repo, lock) : findUnmanaged(repo, dir);
        if (problems.length > 0) {
            console.error('コピー先が手で直されています。packages/motion に直しを移してから同期してください（上書きしてよければ --force）:');
            problems.forEach(problem => console.error(`  ${problem}`));
            return 1;
        }
    }

    const version = kitVersion(kitRoot);
    const files = {};
    fs.mkdirSync(path.join(repo, dir), { recursive: true });
    for (const [name, content] of Object.entries(expectedFiles(kitRoot))) {
        const target = path.posix.join(dir, name);
        fs.writeFileSync(path.join(repo, target), content);
        files[target] = hash(content);
    }

    // 前の版にあって、今の版にないファイルは消す
    Object.keys(lock?.files ?? {}).filter(file => !(file in files)).forEach(file => {
        fs.rmSync(path.join(repo, file), { force: true });
        console.log(`消しました: ${file}`);
    });

    const nextLock = { version, dir, files };
    fs.writeFileSync(path.join(repo, LOCK_FILE), JSON.stringify(nextLock, null, 2) + '\n');
    console.log(`packages/motion ${version} を ${repo} の ${dir}/ に同期しました`);
    return 0;
}

// web-games のゲームの多くは public/js、public/ を持たないゲームは js
function detectDir(repo) {
    if (fs.existsSync(path.join(repo, 'public/js'))) return 'public/js/motion';
    if (fs.existsSync(path.join(repo, 'js'))) return 'js/motion';
    return null;
}

// コピー先に置くべき中身（ファイル名 → 中身。先頭に、写しであることを書いた1行を付ける）
function expectedFiles(kitRoot) {
    const version = kitVersion(kitRoot);
    const header = `// packages/motion ${version} からコピーしたファイル。ここでは直さず、packages/motion で直してから同期する\n`;
    return Object.fromEntries(CORE_FILES.map(name => [name, header + fs.readFileSync(path.join(kitRoot, 'src', name), 'utf8')]));
}

// ===== 確認 =====

// 写しの問題（手で直された・本体より古い）の一覧。なければ空（scripts/check-games.mjs から使う）
export function copyProblems(repo, kitRoot = KIT_ROOT) {
    const lock = readLock(repo);
    if (!lock) return [`${LOCK_FILE} がありません`];
    const modified = findModified(repo, lock);
    return modified.length > 0 ? modified : findOutdated(repo, lock, kitRoot);
}

function check(repo, kitRoot) {
    const lock = readLock(repo);
    if (!lock) {
        console.error(`${LOCK_FILE} がありません。先に node packages/motion/scripts/sync.mjs ${path.basename(repo)} で同期してください`);
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
        console.error(`packages/motion の今の本体と違います。node packages/motion/scripts/sync.mjs ${path.basename(repo)} で同期してください:`);
        outdated.forEach(problem => console.error(`  ${problem}`));
        return 1;
    }
    console.log(`packages/motion ${lock.version} と同じです`);
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
    console.log(`packages/motion を同期したゲームは ${repos.length} 本${failed > 0 ? `（うち ${failed} 本は本体と違います）` : 'で、すべて本体と同じです'}`);
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
function findUnmanaged(repo, dir) {
    return CORE_FILES
        .map(name => path.posix.join(dir, name))
        .filter(file => fs.existsSync(path.join(repo, file)))
        .map(file => `同期していないファイル: ${file}`);
}

// コピー先が、packages/motion の今の本体から作ったものと同じか
function findOutdated(repo, lock, kitRoot) {
    const expected = expectedFiles(kitRoot);
    const listed = Object.keys(lock.files).map(file => path.posix.basename(file)).sort();
    if (listed.join() !== [...CORE_FILES].sort().join()) return [`コピーするファイルが変わりました（${listed.join('・')}）`];
    return Object.keys(lock.files).flatMap(file => {
        const content = fs.readFileSync(path.join(repo, file), 'utf8');
        return content === expected[path.posix.basename(file)] ? [] : [`古い: ${file}`];
    });
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
