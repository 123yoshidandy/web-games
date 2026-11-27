// 接続先を全ゲームに書くスクリプト（scripts/set-online-url.mjs）のテスト
// 書き換えるテストは、一時フォルダに写したファイルで行う（リポジトリのファイルは書き換えない）
// 使い方: node --test scripts/set-online-url.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setOnlineUrl, normalizeUrl, LEGACY_GAMES } from './set-online-url.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'wss://abc123.execute-api.ap-northeast-1.amazonaws.com/prod';

let root;
const read = (path) => readFileSync(join(root, path), 'utf8');
const copy = (path) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(repoRoot, path), join(root, path));
};
const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
};

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'set-online-url-'));
    // 新しい形
    copy('games/azul/public/js/online-config.js');
    // 前からのもの。mine-blocks だけ keyPrefix を渡している（切り替え済み）とする
    copy('games/dominion/public/js/online-config.js');
    write('games/dominion/server/src/handler.js', "export const handler = createHandler(game);\n");
    copy('games/mine-blocks/js/online-config.js');
    write('games/mine-blocks/server/src/handler.js', "export const handler = createHandler(game, { keyPrefix: 'mine-blocks' });\n");
    copy('games/pokemon-card-game/public/js/online-controller.js');
    write('games/pokemon-card-game/server/src/handler.js', "export const handler = createHandler(game, { keyPrefix: 'pokemon-card-game' });\n");
    // オンライン対戦のないゲーム
    write('games/solo/public/js/game.js', '');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test('新しい形はそのままの URL、切り替え済みの前からのものは ?game= を付けて書く', () => {
    const report = setOnlineUrl({ root, url: URL });
    assert.deepEqual(report.problems, []);
    assert.deepEqual(report.updated.map(({ game }) => game), ['azul', 'mine-blocks', 'pokemon-card-game']);
    assert.match(read('games/azul/public/js/online-config.js'), new RegExp(`^export const DEPLOYED_SERVER_URL = '${URL}';$`, 'm'));
    assert.match(read('games/mine-blocks/js/online-config.js'), new RegExp(`^const ONLINE_DEPLOYED_SERVER_URL = '${URL}\\?game=mine-blocks';$`, 'm'));
    // 行末のコメントは残す
    assert.match(read('games/pokemon-card-game/public/js/online-controller.js'),
        new RegExp(`^export const DEPLOYED_SERVER_URL = '${URL}\\?game=pokemon-card-game'; //`, 'm'));
    assert.deepEqual(report.withoutOnline, ['solo']);
});

test('keyPrefix を渡していない前からのものは書かず、書く値を返す', () => {
    const before = read('games/dominion/public/js/online-config.js');
    const report = setOnlineUrl({ root, url: URL });
    assert.equal(read('games/dominion/public/js/online-config.js'), before);
    assert.deepEqual(report.legacyPending.map(({ game, constant, value }) => ({ game, constant, value })), [
        { game: 'dominion', constant: 'DEPLOYED_SERVER_URL', value: `${URL}?game=dominion` }
    ]);
});

test('keyPrefix にほかのゲームの名前を渡していても、書かない', () => {
    write('games/dominion/server/src/handler.js', "export const handler = createHandler(game, { keyPrefix: 'katan' });\n");
    const report = setOnlineUrl({ root, url: URL });
    assert.deepEqual(report.legacyPending.map(({ game }) => game), ['dominion']);
});

test('2回目は同じ値なので変えない', () => {
    setOnlineUrl({ root, url: URL });
    const report = setOnlineUrl({ root, url: URL });
    assert.deepEqual(report.updated, []);
    assert.equal(report.unchanged.length, 3);
});

test('--dry-run は書き換えない', () => {
    const before = read('games/azul/public/js/online-config.js');
    const report = setOnlineUrl({ root, url: URL, dryRun: true });
    assert.equal(report.updated.length, 3);
    assert.equal(read('games/azul/public/js/online-config.js'), before);
});

test('定数の見つからないファイルは問題として返す', () => {
    write('games/broken/public/js/online-config.js', "import { resolveOnlineServerUrl } from './netplay/netplay-lobby.js';\nexport const DEPLOYED = '';\n");
    const report = setOnlineUrl({ root, url: URL });
    assert.deepEqual(report.problems.map(({ game }) => game), ['broken']);
});

test('URL の形を確かめる（末尾の / は取る。? や http は断る）', () => {
    assert.equal(normalizeUrl(`${URL}/`), URL);
    assert.throws(() => normalizeUrl(`${URL}?game=azul`));
    assert.throws(() => normalizeUrl('https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod'));
    assert.throws(() => normalizeUrl("wss://x/prod';alert(1)//"));
    assert.throws(() => normalizeUrl(''));
});

test('リポジトリの全ゲームの接続先を見つけられる（--dry-run で読むだけ）', () => {
    const report = setOnlineUrl({ root: repoRoot, url: URL, dryRun: true });
    assert.deepEqual(report.problems, []);
    // 前からの7本も keyPrefix を渡しているので、全部書ける
    assert.deepEqual(report.legacyPending, []);
    const legacy = [...report.updated, ...report.unchanged].filter(({ game }) => LEGACY_GAMES[game]);
    assert.deepEqual(legacy.map(({ game }) => game).sort(), Object.keys(LEGACY_GAMES).sort());
});
