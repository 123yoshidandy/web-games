// 入口のページから開く外のページのテスト
// 使い方: node --test scripts/portal/links.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newIssueUrl } from './links.js';

test('要望・不具合は、web-games の新しい Issue のページを、タイトルの頭を入れて開く', () => {
    const url = new URL(newIssueUrl());
    assert.equal(`${url.origin}${url.pathname}`, 'https://github.com/123yoshidandy/web-games/issues/new');
    assert.equal(url.searchParams.get('title'), '【要望・不具合】 ');
    assert.equal(new URL(newIssueUrl({ repository: 'a/b', titlePrefix: 'x' })).searchParams.get('title'), 'x ');
});
