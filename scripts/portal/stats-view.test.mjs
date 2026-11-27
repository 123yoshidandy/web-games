// 入口のページの「自分の記録」の表示のテスト
// 使い方: node --test scripts/portal/stats-view.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winLossText, cardBadgeText, sortedGames, statsHtml } from './stats-view.js';

const game = (overrides) => ({ plays: 0, wins: 0, losses: 0, draws: 0, online: 0, vs: [], ...overrides });

test('勝ち負けの文字は、引き分けがあるときだけ「分」を付け、勝ち負けのないゲームは空', () => {
    assert.equal(winLossText({ wins: 2, losses: 1 }), '2勝1敗');
    assert.equal(winLossText({ wins: 0, losses: 0, draws: 1 }), '0勝0敗1分');
    assert.equal(winLossText({}), '');
});

test('カードの回数は、遊んだゲームだけに出す', () => {
    assert.equal(cardBadgeText(game({ plays: 3, wins: 2, losses: 1 })), '3回・2勝1敗');
    assert.equal(cardBadgeText(game({ plays: 2 })), '2回');
    assert.equal(cardBadgeText(game()), '');
    assert.equal(cardBadgeText(undefined), '');
});

test('ゲームは回数の多い順（同じなら名前の順）で、遊んでいないものは出さない', () => {
    const record = { games: { b: game({ plays: 1 }), a: game({ plays: 1 }), c: game({ plays: 5 }), d: game() } };
    assert.deepEqual(sortedGames(record, { a: 'あ', b: 'い', c: 'う' }).map((g) => g.name), ['う', 'あ', 'い']);
});

test('自分の記録：合計・ゲームごとの数・オンラインの相手（CPU の印）を出し、名前は逃がす', () => {
    const html = statsHtml({
        name: 'あお',
        games: {
            azul: game({ plays: 3, wins: 2, losses: 1, online: 2, vs: [{ name: '<b>みどり</b>', cpu: false, plays: 2, wins: 1, losses: 1, draws: 0 }, { name: 'ルシア', cpu: true, plays: 1, wins: 1, losses: 0, draws: 0 }] }),
            'seven-wonders': game({ plays: 1, draws: 1 })
        }
    }, { azul: 'アズール', 'seven-wonders': '世界の七不思議' });
    assert.match(html, /2 本・4回（2勝1敗1分）/);
    assert.match(html, /<a href="azul\/">アズール<\/a><small>オンライン 2回<\/small>/);
    assert.match(html, /&lt;b&gt;みどり&lt;\/b&gt;.*2戦 1勝1敗/);
    assert.match(html, /ルシア<\/span><span class="cpu">CPU<\/span>/);
    assert.match(html, /<td>3<\/td><td>2<\/td><td>1<\/td><td>0<\/td>/);
    assert.doesNotMatch(html, /<b>/);
});

test('記録がなければ、そう知らせる', () => {
    assert.match(statsHtml({ name: 'あお', games: {} }), /まだ記録はありません/);
    assert.match(statsHtml(null), /まだ記録はありません/);
});
