// テストを流すゲームの選び方（scripts/changed-games.mjs）のテスト
// 使い方: node --test scripts/changed-games.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectWorkspaces } from './changed-games.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withTest = { test: 'vitest run' };
const packages = [
    { path: 'packages/test-kit', pkg: { name: 'test-kit' }, imports: [] },
    { path: 'packages/netplay-kit', pkg: { name: 'netplay-kit', scripts: withTest }, imports: [] },
    { path: 'packages/sound', pkg: { name: 'sound', scripts: withTest }, imports: [] }
];
const games = [
    { path: 'games/a', pkg: { scripts: withTest, devDependencies: { 'test-kit': '*' } }, imports: ['test-kit'] },
    { path: 'games/b', pkg: { scripts: withTest }, imports: ['test-kit'] },
    { path: 'games/c', pkg: { scripts: withTest, dependencies: { 'netplay-kit': '*' } }, imports: [] }
];
const select = (files) => selectWorkspaces(files, { games, packages });

test('ゲームが変わったら、そのゲームだけ', () => {
    assert.deepEqual(select(['games/b/public/js/game.js']), ['games/b']);
});

test('部品が変わったら、依存に書いたゲームと、テストで import しているゲームも流す', () => {
    assert.deepEqual(select(['packages/test-kit/pwa.js']), ['games/a', 'games/b']);
    assert.deepEqual(select(['packages/netplay-kit/server/room.js']), ['packages/netplay-kit', 'games/c']);
});

test('曲が変わったら、packages/sound も流す', () => {
    assert.deepEqual(select(['games/c/public/js/sound/bgm.js']), ['packages/sound', 'games/c']);
});

test('直下の設定や scripts/ が変わったら全部、docs だけならなし', () => {
    assert.deepEqual(select(['scripts/check-games.mjs']), ['packages/netplay-kit', 'packages/sound', 'games/a', 'games/b', 'games/c']);
    assert.deepEqual(select(['README.md', 'docs/standards.md']), []);
});

test('このリポジトリで test-kit を変えたら、全ゲームを流す', () => {
    const all = readdirSync(join(root, 'games')).filter((name) => existsSync(join(root, 'games', name, 'package.json')));
    const selected = selectWorkspaces(['packages/test-kit/pwa.js']);
    assert.equal(selected.length, all.length);
});
