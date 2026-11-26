// ゲームをまたいだ決まりの確認（scripts/check-games.mjs）のテスト
// 使い方: node --test scripts/check-games.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkGames } from './check-games.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('標準の必須の項目が欠けたゲームを、エラーにする', () => {
    const gamesDir = mkdtempSync(join(tmpdir(), 'check-games-'));
    try {
        mkdirSync(join(gamesDir, 'empty', 'public'), { recursive: true });
        writeFileSync(join(gamesDir, 'empty', 'package.json'), JSON.stringify({ name: 'empty' }));
        writeFileSync(join(gamesDir, 'empty', 'public', 'index.html'), '<!doctype html><title>empty</title>');
        const errors = checkGames(gamesDir);
        assert.ok(errors.some((error) => error.startsWith('empty: 必須の「')), errors.join('\n'));
        // 公開（--skip-standards）では、標準の欠けをエラーにしない
        const skipped = checkGames(gamesDir, undefined, { standards: false });
        assert.ok(!skipped.some((error) => error.includes('必須の「')), skipped.join('\n'));
    } finally {
        rmSync(gamesDir, { recursive: true, force: true });
    }
});

test('このリポジトリの全ゲームは、決まりと標準の必須の項目を満たす', () => {
    assert.deepEqual(checkGames(join(root, 'games')), []);
});
