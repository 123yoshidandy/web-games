// 入口のページの「いま立っている部屋」の表示のテスト
// 使い方: node --test scripts/portal/rooms-view.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomHref, roomsHtml } from './rooms-view.js';

const room = (overrides) => ({ game: 'azul', roomCode: '1234', hostName: 'あお', players: 1, maxPlayers: 4, createdAt: 1, ...overrides });
const names = { azul: 'アズール', go: '囲碁' };

test('部屋に入るリンクは招待URLと同じ形で、手元の接続先（?server=）は引き継ぐ', () => {
    assert.equal(roomHref(room()), 'azul/?room=1234');
    assert.equal(roomHref(room(), '?server=ws%3A%2F%2Flocalhost%3A9000&q=x'), 'azul/?room=1234&server=ws%3A%2F%2Flocalhost%3A9000');
});

test('ゲームの名前・ホストの名前・人数を出し、名前は逃がす', () => {
    const html = roomsHtml([room(), room({ game: 'go', roomCode: '5678', hostName: '<i>しろ</i>', players: 1, maxPlayers: 2 })], names);
    assert.match(html, /<a href="azul\/\?room=1234"><span class="room-game">アズール<\/span><span class="room-host">あお の部屋<\/span><span class="room-count">1\/4人<\/span>/);
    assert.match(html, /&lt;i&gt;しろ&lt;\/i&gt; の部屋.*1\/2人/);
    assert.doesNotMatch(html, /<i>/);
});

test('入口のページにないゲーム・形の違う部屋・読めなかった一覧は出さない（空）', () => {
    assert.equal(roomsHtml([room({ game: 'nope' }), room({ roomCode: '12"><script>' })], names), '');
    assert.equal(roomsHtml(null, names), '');
    assert.equal(roomsHtml([], names), '');
});
