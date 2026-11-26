// 入口のページの検索・絞り込みのテスト
// 使い方: node --test scripts/portal/portal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalize, parseState, stateToSearch, matches, playersLabel, EMPTY_STATE } from './filter.js';
import { gameMetadata, playersFromCode } from './metadata.mjs';

const GENRES = ['ボードゲーム', '協力'];
const game = (overrides) => ({ search: normalize('カタン/catan'), players: [2, 3, 4], online: true, genres: ['ボードゲーム'], ...overrides });
const state = (overrides) => ({ ...EMPTY_STATE, ...overrides });

test('正規化で、カタカナとひらがな・大文字と小文字・全角と半角・区切りとアクセントをそろえる', () => {
    assert.equal(normalize('カタン'), normalize('かたん'));
    assert.equal(normalize('ＡＺＵＬ'), 'azul');
    assert.equal(normalize('キャント・ストップ'), normalize('キャントストップ'));
    assert.equal(normalize('Pokémon'), 'pokemon');
    assert.equal(normalize("Can't Stop"), 'cantstop');
});

test('検索は語ごとに部分一致で、すべての語が当たったものだけ残す', () => {
    assert.ok(matches(game(), state({ q: 'かた' })));
    assert.ok(matches(game(), state({ q: 'CAT' })));
    assert.ok(matches(game(), state({ q: 'かた cat' })));
    assert.ok(!matches(game(), state({ q: 'かた azul' })));
});

test('人数・オンライン・ジャンルで絞り込み、組み合わせると全部を満たすものだけ残す', () => {
    assert.ok(matches(game(), state({ players: 2 })));
    assert.ok(!matches(game(), state({ players: 1 })));
    assert.ok(!matches(game(), state({ players: 5 })));
    assert.ok(matches(game({ players: [3, 4, 5, 6] }), state({ players: 5 })), '5人以上は、5人以上で遊べるもの');
    assert.ok(matches(game(), state({ online: 'yes' })));
    assert.ok(!matches(game(), state({ online: 'no' })));
    assert.ok(matches(game(), state({ genre: 'ボードゲーム' })));
    assert.ok(!matches(game(), state({ genre: '協力' })));
    assert.ok(matches(game(), state({ q: 'かたん', players: 4, online: 'yes', genre: 'ボードゲーム' })));
    assert.ok(!matches(game(), state({ q: 'かたん', players: 4, online: 'no' })));
});

test('URL の状態を読み書きでき、おかしな値は無視する', () => {
    const s = { q: 'かたん', players: 2, online: 'yes', genre: '協力' };
    assert.deepEqual(parseState(stateToSearch(s), GENRES), s);
    assert.equal(stateToSearch(EMPTY_STATE), '');
    assert.deepEqual(parseState('?players=9&online=maybe&genre=xyz', GENRES), EMPTY_STATE);
});

test('人数の表記', () => {
    assert.equal(playersLabel([2]), '2人');
    assert.equal(playersLabel([2, 3, 4]), '2〜4人');
    assert.equal(playersLabel([2, 4]), '2人・4人');
});

test('人数はコードの export から読み、オンライン対戦は画面とサーバーの両方があるときだけとし、portal の情報が足りなければ errors に入れる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'portal-'));
    try {
        // online：画面側の js/netplay/ とサーバーの server/src/handler.js を置く。definition：ゲームの定義だけを置く
        const make = (name, pkg, code, { online = false, definition = false } = {}) => {
            mkdirSync(join(dir, name, 'public', 'js'), { recursive: true });
            writeFileSync(join(dir, name, 'package.json'), JSON.stringify(pkg));
            writeFileSync(join(dir, name, 'public', 'js', 'game.js'), code);
            if (online || definition) mkdirSync(join(dir, name, 'server', 'src'), { recursive: true });
            if (definition) writeFileSync(join(dir, name, 'server', 'src', 'game-definition.js'), '');
            if (online) {
                mkdirSync(join(dir, name, 'public', 'js', 'netplay'));
                writeFileSync(join(dir, name, 'server', 'src', 'handler.js'), '');
            }
        };
        make('a', { portal: { original: 'A', genres: ['協力'] } }, 'export const MIN_PLAYERS = 2;\nexport const MAX_PLAYERS = 4;', { online: true });
        make('b', { portal: { original: 'B', genres: ['協力'], players: [2] } }, 'const PLAYERS = {};', { definition: true });
        make('c', {}, 'export const PLAYER_COUNTS = [2, 4];');
        make('d', { portal: { original: 'D', genres: ['協力'], players: [3] } }, 'export const PLAYERS = 2;');
        make('e', { portal: { original: 'E', genres: ['なにか'] } }, '');

        assert.deepEqual(playersFromCode(join(dir, 'c', 'public')), { players: [2, 4] });
        const a = gameMetadata(dir, 'a');
        assert.deepEqual([a.players, a.online, a.errors], [[2, 3, 4], true, []]);
        const b = gameMetadata(dir, 'b');
        assert.deepEqual([b.players, b.online, b.errors], [[2], false, []], 'ゲームの定義だけでは、オンライン対戦できるとしない');
        assert.equal(gameMetadata(dir, 'c').errors.length, 1, 'portal がない');
        assert.match(gameMetadata(dir, 'd').errors.join(), /コードの人数/);
        assert.equal(gameMetadata(dir, 'e').errors.length, 2, '決めていないジャンルと、人数が分からないこと');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
