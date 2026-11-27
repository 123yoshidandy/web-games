// 入口のページの検索・絞り込みのテスト
// 使い方: node --test scripts/portal/portal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    normalize, parseState, stateToSearch, matches, playersLabel, toggleGenre, activeFilterCount, clearFilters, isEmptyState, EMPTY_STATE,
    sortGames, minutesLabel
} from './filter.js';
import { gameMetadata, playersFromCode, parseMinutes } from './metadata.mjs';

const GENRES = ['ボードゲーム', '協力', 'パズル'];
const game = (overrides) => ({
    search: normalize('カタン/catan'), players: [2, 3, 4], online: true, genres: ['ボードゲーム'], minutes: [45, 60], weight: 3, ...overrides
});
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
    assert.ok(matches(game(), state({ online: 'yes' })));
    assert.ok(!matches(game(), state({ online: 'no' })));
    assert.ok(matches(game(), state({ genres: ['ボードゲーム'] })));
    assert.ok(!matches(game(), state({ genres: ['協力'] })));
    assert.ok(matches(game(), state({ q: 'かたん', players: 4, online: 'yes', genres: ['ボードゲーム'] })));
    assert.ok(!matches(game(), state({ q: 'かたん', players: 4, online: 'no' })));
});

test('5人は5人ちょうどで遊べるもの、6人以上は6人以上で遊べるもの', () => {
    const upTo5 = game({ players: [3, 4, 5] });
    const upTo6 = game({ players: [3, 4, 5, 6] });
    const only7 = game({ players: [7] });
    assert.ok(matches(upTo5, state({ players: 5 })));
    assert.ok(!matches(upTo5, state({ players: 6 })), '5人までのものは、6人以上に入らない');
    assert.ok(matches(upTo6, state({ players: 5 })));
    assert.ok(matches(upTo6, state({ players: 6 })));
    assert.ok(!matches(only7, state({ players: 5 })));
    assert.ok(matches(only7, state({ players: 6 })), '7人だけのものも、6人以上に入る');
    assert.ok(!matches(game({ players: [2, 4] }), state({ players: 3 })), '人数が飛んでいれば、間の人数には入らない');
});

test('ジャンルはいくつでも選べ、どれか1つに当たれば残し、ほかの条件とはすべてを満たすものだけ残す', () => {
    const coop = game({ genres: ['協力'] });
    const both = game({ genres: ['ボードゲーム', '協力'] });
    const puzzle = game({ genres: ['パズル'], online: false });
    const picked = state({ genres: ['ボードゲーム', '協力'] });
    assert.ok(matches(game(), picked));
    assert.ok(matches(coop, picked));
    assert.ok(matches(both, picked));
    assert.ok(!matches(puzzle, picked));
    assert.ok(matches(puzzle, state({ genres: [] })), '選んでいなければすべて');
    // 種類の違う条件とは、すべてを満たすもの
    assert.ok(!matches(coop, state({ genres: ['ボードゲーム', '協力'], players: 5 })));
    assert.ok(!matches(both, state({ genres: ['協力', 'パズル'], online: 'no' })));
    assert.ok(matches(puzzle, state({ genres: ['協力', 'パズル'], online: 'no' })));
    assert.ok(!matches(both, state({ genres: ['協力', 'パズル'], q: 'azul' })));
});

test('ジャンルのボタンで、選んでいなければ足し、選んでいれば外し、並びは一覧の順にそろえる', () => {
    assert.deepEqual(toggleGenre([], 'パズル', GENRES), ['パズル']);
    assert.deepEqual(toggleGenre(['パズル'], 'ボードゲーム', GENRES), ['ボードゲーム', 'パズル']);
    assert.deepEqual(toggleGenre(['ボードゲーム', 'パズル'], 'パズル', GENRES), ['ボードゲーム']);
    assert.deepEqual(toggleGenre(['ボードゲーム'], 'ボードゲーム', GENRES), []);
});

test('URL の状態を読み書きでき、おかしな値は無視する', () => {
    const s = state({ q: 'かたん', players: 6, online: 'yes', genres: ['ボードゲーム', 'パズル'] });
    assert.deepEqual(parseState(stateToSearch(s), GENRES), s);
    assert.equal(stateToSearch(s), `?q=${encodeURIComponent('かたん')}&players=6&online=yes&genre=${encodeURIComponent('ボードゲーム')}&genre=${encodeURIComponent('パズル')}`);
    assert.equal(stateToSearch(EMPTY_STATE), '');
    assert.deepEqual(parseState('?players=9&online=maybe&genre=xyz', GENRES), EMPTY_STATE);
    // ジャンル1つだけの前の形の URL も読め、重なりと知らない値は捨て、並びは一覧の順にする
    assert.deepEqual(parseState('?genre=協力', GENRES).genres, ['協力']);
    assert.deepEqual(parseState('?genre=パズル&genre=xyz&genre=協力&genre=パズル', GENRES).genres, ['協力', 'パズル']);
});

test('絞り込みの欄の開け閉めは URL に残し、条件には数えない', () => {
    assert.equal(stateToSearch(state({ open: true })), '?panel=open');
    assert.equal(parseState('?panel=open', GENRES).open, true);
    assert.equal(parseState('?panel=xyz', GENRES).open, false);
    assert.deepEqual(parseState(stateToSearch(state({ players: 5, open: true })), GENRES), state({ players: 5, open: true }));
    assert.ok(isEmptyState(state({ open: true })), '開いているだけなら、絞っていない');
});

test('欄の中で選んでいる条件の数を数え、「解除」は欄の中の条件だけを外す', () => {
    assert.equal(activeFilterCount(EMPTY_STATE), 0);
    assert.equal(activeFilterCount(state({ q: 'かたん' })), 0, '検索の文字は数えない');
    assert.equal(activeFilterCount(state({ players: 6, online: 'no', genres: ['協力', 'パズル'] })), 4);
    const cleared = clearFilters(state({ q: 'かたん', players: 6, online: 'no', genres: ['協力'], open: true }));
    assert.deepEqual(cleared, state({ q: 'かたん', open: true }));
});

test('お気に入りだけを出す（fav=1）。欄の外の条件なので、数と「解除」には入らない', () => {
    assert.ok(matches(game({ fav: true }), state({ fav: true })));
    assert.ok(!matches(game({ fav: false }), state({ fav: true })));
    assert.ok(matches(game({ fav: false }), state()));
    assert.equal(stateToSearch(state({ fav: true })), '?fav=1');
    assert.deepEqual(parseState('?fav=1', GENRES), state({ fav: true }));
    assert.equal(parseState('?fav=yes', GENRES).fav, false);
    assert.ok(!isEmptyState(state({ fav: true })));
    assert.equal(activeFilterCount(state({ fav: true })), 0);
    assert.equal(clearFilters(state({ fav: true, players: 2 })).fav, true);
});

test('遊ぶ時間は短いほうの時間で「〜N分」に入れ、「60分〜」は長いほうが60分を超えるもの', () => {
    const quick = game({ minutes: [10, 10] });
    const range = game({ minutes: [20, 60] });
    const long = game({ minutes: [60, 90] });
    assert.ok(matches(quick, state({ time: '15' })));
    assert.ok(matches(quick, state({ time: '60' })), '短いものは、長い時間の条件にも入る');
    assert.ok(!matches(range, state({ time: '15' })));
    assert.ok(matches(range, state({ time: '30' })), '幅があれば、短いほうで比べる');
    assert.ok(!matches(range, state({ time: 'long' })), 'ちょうど60分までなら、60分〜には入らない');
    assert.ok(!matches(long, state({ time: '30' })));
    assert.ok(matches(long, state({ time: '60' })));
    assert.ok(matches(long, state({ time: 'long' })));
    assert.ok(!matches(game({ minutes: null }), state({ time: '60' })), '時間を書いていないものは、時間で絞ると出さない');
    assert.ok(matches(game({ minutes: null }), state()));
});

test('難しさは 1・2 をかんたん、3 をふつう、4・5 をむずかしいとし、ほかの条件とはすべてを満たすものだけ残す', () => {
    assert.ok(matches(game({ weight: 1 }), state({ weight: 'easy' })));
    assert.ok(matches(game({ weight: 2 }), state({ weight: 'easy' })));
    assert.ok(!matches(game({ weight: 3 }), state({ weight: 'easy' })));
    assert.ok(matches(game({ weight: 3 }), state({ weight: 'normal' })));
    assert.ok(matches(game({ weight: 5 }), state({ weight: 'hard' })));
    assert.ok(!matches(game({ weight: null }), state({ weight: 'hard' })));
    assert.ok(matches(game(), state({ weight: 'normal', time: '60', players: 4, genres: ['ボードゲーム'] })));
    assert.ok(!matches(game(), state({ weight: 'normal', time: '30' })));
    assert.ok(!matches(game(), state({ weight: 'easy', time: '60' })));
});

test('時間・難しさ・並べる順を URL に残し、時間と難しさは条件に数え、並べる順は数えない', () => {
    const s = state({ time: 'long', weight: 'hard', sort: 'weight' });
    assert.equal(stateToSearch(s), '?time=long&weight=hard&sort=weight');
    assert.deepEqual(parseState(stateToSearch(s), GENRES), s);
    assert.deepEqual(parseState('?time=45&weight=7&sort=name', GENRES), EMPTY_STATE);
    assert.equal(activeFilterCount(s), 2);
    assert.ok(isEmptyState(state({ sort: 'time' })), '並べ替えただけなら、絞っていない');
    assert.deepEqual(clearFilters(s), state({ sort: 'weight' }), '「解除」は並べる順を残す');
});

test('短い順・かんたん順に並べ、同じなら一覧の順のまま、時間や難しさのないものは後ろにする', () => {
    const list = [
        { id: 'a', minutes: [30, 45], weight: 2 },
        { id: 'b', minutes: null, weight: null },
        { id: 'c', minutes: [10, 10], weight: 3 },
        { id: 'd', minutes: [30, 30], weight: 2 },
        { id: 'e', minutes: [30, 45], weight: 1 }
    ];
    const ids = (games) => games.map((g) => g.id).join('');
    assert.equal(ids(sortGames(list, null)), 'abcde');
    assert.equal(ids(sortGames(list, 'time')), 'cdeab');
    assert.equal(ids(sortGames(list, 'weight')), 'edacb');
    assert.equal(ids(list), 'abcde', 'もとの一覧は変えない');
});

test('時間の表記', () => {
    assert.equal(minutesLabel([15, 15]), '15分');
    assert.equal(minutesLabel([20, 30]), '20〜30分');
    assert.equal(minutesLabel(null), '');
});

test('portal.minutes は分数か小さい順の2つ、portal.weight は 1〜5。誤りは errors、書いていなければ warnings に入れる', () => {
    assert.deepEqual(parseMinutes(20), [20, 20]);
    assert.deepEqual(parseMinutes([20, 30]), [20, 30]);
    for (const bad of [0, 1.5, 601, '20', [30, 20], [20, 20], [20], [20, 30, 40]]) assert.equal(parseMinutes(bad), null, JSON.stringify(bad));
    const dir = mkdtempSync(join(tmpdir(), 'portal-'));
    try {
        const make = (name, portal) => {
            mkdirSync(join(dir, name, 'public'), { recursive: true });
            writeFileSync(join(dir, name, 'package.json'), JSON.stringify({ portal: { original: 'X', genres: ['協力'], players: [2], ...portal } }));
        };
        make('ok', { minutes: [20, 30], weight: 2 });
        make('none', {});
        make('bad', { minutes: '20分', weight: 2.5 });
        const ok = gameMetadata(dir, 'ok');
        assert.deepEqual([ok.minutes, ok.weight, ok.errors, ok.warnings], [[20, 30], 2, [], []]);
        const none = gameMetadata(dir, 'none');
        assert.deepEqual([none.minutes, none.weight, none.errors.length, none.warnings.length], [null, null, 0, 2]);
        const bad = gameMetadata(dir, 'bad');
        assert.deepEqual([bad.minutes, bad.weight, bad.errors.length, bad.warnings.length], [null, null, 2, 0]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
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
        const make = (name, pkg, code, { online = false, definition = false, deployed = online } = {}) => {
            mkdirSync(join(dir, name, 'public', 'js'), { recursive: true });
            writeFileSync(join(dir, name, 'package.json'), JSON.stringify(pkg));
            writeFileSync(join(dir, name, 'public', 'js', 'game.js'), code);
            if (online || definition) mkdirSync(join(dir, name, 'server', 'src'), { recursive: true });
            if (definition) writeFileSync(join(dir, name, 'server', 'src', 'game-definition.js'), '');
            if (online) {
                mkdirSync(join(dir, name, 'public', 'js', 'netplay'));
                writeFileSync(join(dir, name, 'server', 'src', 'handler.js'), '');
                writeFileSync(join(dir, name, 'public', 'js', 'online-config.js'), deployed
                    ? "export const DEPLOYED_SERVER_URL = 'wss://example.execute-api.ap-northeast-1.amazonaws.com/prod';"
                    : "export const DEPLOYED_SERVER_URL = ''; // デプロイしたら書く");
            }
        };
        make('a', { portal: { original: 'A', genres: ['協力'] } }, 'export const MIN_PLAYERS = 2;\nexport const MAX_PLAYERS = 4;', { online: true });
        make('b', { portal: { original: 'B', genres: ['協力'], players: [2] } }, 'const PLAYERS = {};', { definition: true });
        make('c', {}, 'export const PLAYER_COUNTS = [2, 4];');
        make('d', { portal: { original: 'D', genres: ['協力'], players: [3] } }, 'export const PLAYERS = 2;');
        make('e', { portal: { original: 'E', genres: ['なにか'] } }, '');
        make('f', { portal: { original: 'F', genres: ['協力'] } }, 'export const MIN_PLAYERS = 2;\nexport const MAX_PLAYERS = 4;', { online: true, deployed: false });

        assert.deepEqual(playersFromCode(join(dir, 'c', 'public')), { players: [2, 4] });
        const a = gameMetadata(dir, 'a');
        assert.deepEqual([a.players, a.online, a.errors], [[2, 3, 4], true, []]);
        // 手元では遊べても、配備先の URL がなければ「オンライン」と出さない
        assert.equal(gameMetadata(dir, 'f').online, false);
        const b = gameMetadata(dir, 'b');
        assert.deepEqual([b.players, b.online, b.errors], [[2], false, []], 'ゲームの定義だけでは、オンライン対戦できるとしない');
        assert.equal(gameMetadata(dir, 'c').errors.length, 1, 'portal がない');
        assert.match(gameMetadata(dir, 'd').errors.join(), /コードの人数/);
        assert.equal(gameMetadata(dir, 'e').errors.length, 2, '決めていないジャンルと、人数が分からないこと');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
