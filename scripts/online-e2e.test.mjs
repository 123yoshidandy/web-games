// オンライン対戦の通し試験（scripts/online-e2e.mjs）の部品のテスト（Chrome は起動しない）
// 使い方: node --test scripts/online-e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer } from 'netplay-kit/server/testing.js';
import { parseArgs, freePorts, createE2EPicker, publicDirOf, viewportOf } from './online-e2e.mjs';
import { loadDefinition } from './dev-online.mjs';

test('引数：ゲーム・手数・画面の置き場所・終わりまで打つか', () => {
    assert.deepEqual(parseArgs(['azul']), { game: 'azul', moves: 6, shots: null, finish: false });
    assert.deepEqual(parseArgs(['--moves', '3', 'go', '--shots', '/x']), { game: 'go', moves: 3, shots: '/x', finish: false });
    assert.deepEqual(parseArgs(['azul', '--finish']), { game: 'azul', moves: 6, shots: null, finish: true });
});

test('空いているポートを重ならずに選び、8080 は使わない', async () => {
    const ports = await freePorts(3);
    assert.equal(new Set(ports).size, 3);
    assert.ok(!ports.includes(8080));
});

test('知らないゲームの定義は読み込まない', async () => {
    assert.equal(await loadDefinition('no-such-game'), null);
});

test('選んだ手は、サーバーの部屋の処理に受け付けられる（azul）', async () => {
    const definition = await loadDefinition('azul');
    const moveFor = await createE2EPicker(definition, publicDirOf('azul'));
    const server = createTestServer(definition);
    const clients = await server.createRoom(['あお', 'みどり']);
    await clients[0].send('start');
    for (let i = 0; i < 4; i++) {
        const room = await server.store.getRoom(clients.code);
        const seat = [0, 1].find((s) => moveFor(room, s));
        assert.notEqual(seat, undefined);
        await clients[seat].send('command', { command: moveFor(room, seat) });
        assert.equal(clients[seat].last('error'), undefined);
        assert.equal((await server.store.getRoom(clients.code)).version, room.version + 1);
    }
});

test('ページの大きさは、ゲームの向きに合わせる（横のゲームは 844×390、縦は 390×664）', () => {
    assert.deepEqual(viewportOf('dominion'), { width: 844, height: 390 });
    assert.deepEqual(viewportOf('azul'), { width: 390, height: 664 });
});
