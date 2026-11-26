// オンライン対戦の共通のテスト（ゲームの定義を netplay-kit の部屋の処理に載せ、人が遊ぶ流れをまねる）
// 使い方（ゲームの test/online.test.js）:
//   import { testOnline } from 'test-kit/online.js';
//   import definition from '../server/src/game-definition.js';
//   import { suggest } from '../public/js/cpu-player.js';
//   testOnline({ definition, suggest });
// 手の選び方:
//   suggest(game, seat) … その席が今打てる操作（ヒントと同じ関数）。打てなければ null
//   pick(game, seat)    … suggest の形が違うゲームは、同じ形の関数を渡す
//   どちらもなければ、定義の CPU（cpu.step）にその席の手を選ばせ、記録された操作を端末から送り直す
// ほかの欄:
//   humans        … 部屋に入る人の数（既定 2。足りない分は CPU で埋める）
//   leaveContinues … 対戦中に抜けた人の席を CPU が引き継ぐか（既定 true。onPlayerGone で引き継がないゲームは false）
//   maxMoves      … 終局まで打つ手の上限（既定 3000）
// ビューの乱数：各席と観戦者のビューに、シードや乱数の状態（seed・rng・rngState など）が入っていれば落とす
//   シードがあれば、端末で山札・手札の並びや、これから振るダイスの目を計算し直せてしまう
//   隠れた情報も先の乱数もないゲーム（アバロン・コリドールなど）は、定義に perfectInformation: true を書けば調べない
import { describe, it, expect } from 'vitest';
import { createTestServer } from 'netplay-kit/server/testing.js';
import { createMovePicker } from './picker.js';

const TIMEOUT_MS = 120_000;

// シードや乱数の状態らしいキー（seed・rng・rngState・randomState・prng・〜Seed・〜Rng など）
const RANDOM_KEY = /^(seeds?|rngs?|rngState|randomState|prng|.+Seed|.+Rng|.+RngState)$/i;
const SEED_KEY = /seeds?$/i;
const SEED_MIN = 65536; // シードは 2^32 までの大きな数。これより小さい数は、ゲームの中の数（Wingspan の食べ物の seed の数など）とみなす

// その値が、シードや乱数の状態に見えるか（seed という名前でも、小さな数なら数えない）
const looksRandom = (key, value) => {
    if (value === null || value === undefined || typeof value === 'boolean') return false;
    if (SEED_KEY.test(key) && typeof value === 'number') return Math.abs(value) >= SEED_MIN;
    return true;
};

// ビューの中の、シードや乱数の状態らしいキーの場所（view.options.seed など）
export function randomKeysIn(value, at = 'view', found = []) {
    if (Array.isArray(value)) value.forEach((item, i) => randomKeysIn(item, `${at}[${i}]`, found));
    else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            if (RANDOM_KEY.test(key) && looksRandom(key, item)) found.push(`${at}.${key}`);
            randomKeysIn(item, `${at}.${key}`, found);
        }
    }
    return found;
}

export function testOnline({ definition, suggest = null, pick = null, humans = 2, leaveContinues = true, maxMoves = 3000, seed = 1 }) {
    const minPlayers = definition.minPlayers ?? 2;
    const maxPlayers = definition.maxPlayers ?? 4;
    const humanCount = Math.min(humans, maxPlayers);

    // 席の今の手（打てなければ null）。選び方は picker.js
    const { moveFor } = createMovePicker({ definition, suggest, pick });

    // 部屋を作って人を集め、足りなければ CPU を足して始める
    const startRoom = async (server) => {
        const names = Array.from({ length: humanCount }, (_, i) => `P${i + 1}`);
        const clients = await server.createRoom(names);
        for (let count = humanCount; count < minPlayers; count++) await clients[0].send('addCpu');
        await clients[0].send('start');
        return clients;
    };

    const roomOf = (server, clients) => server.store.getRoom(clients.code);

    // seats の人だけで、終局まで（か maxMoves まで）打つ。断られた操作の数を返す
    const playOut = async (server, clients, seats, limit = maxMoves) => {
        let moves = 0;
        let rejected = 0;
        let idle = 0;
        while (moves < limit) {
            const room = await roomOf(server, clients);
            if (room.status !== 'playing') break;
            const seat = seats.find(s => moveFor(room, s));
            if (seat === undefined) {
                if (++idle > 2) break;
                continue;
            }
            idle = 0;
            const client = clients[seat];
            const errors = client.all('error').length;
            await client.send('command', { command: moveFor(room, seat) });
            if (client.all('error').length > errors) {
                rejected++;
                if (rejected > 5) break;
            }
            moves++;
        }
        return { moves, rejected, status: (await roomOf(server, clients)).status };
    };

    describe('オンライン対戦（共通の検査）', () => {
        it('部屋を作り、人数が足りなければ CPU を足して始められ、全員に自分のビューが届く', async () => {
            const server = createTestServer(definition, { seed });
            const clients = await startRoom(server);
            const lobby = clients[0].last('lobby');
            expect(lobby.status).toBe('playing');
            expect(lobby.players.length).toBeGreaterThanOrEqual(minPlayers);
            for (const client of clients) {
                const view = client.last('state')?.view;
                expect(view).toBeTruthy();
                // 送るビューは JSON にしても変わらない（Set・Map・クラスを含まない）
                expect(JSON.parse(JSON.stringify(view))).toEqual(view);
            }
        });

        it('ほかの人の参加のトークンは、誰にも届かない', async () => {
            const server = createTestServer(definition, { seed });
            const clients = await startRoom(server);
            clients.forEach((client, seat) => {
                const others = clients.filter((_, i) => i !== seat).map(other => other.last('joined').token);
                const received = JSON.stringify(client.messages);
                others.forEach(token => expect(received).not.toContain(token));
            });
        });

        it('今打てない人の操作と、サーバーだけが記録する代行（proxy）の操作は断られ、部屋は変わらない', async () => {
            const server = createTestServer(definition, { seed });
            const clients = await startRoom(server);
            const room = await roomOf(server, clients);
            const seats = clients.map((_, seat) => seat);
            const mover = seats.find(seat => moveFor(room, seat));
            expect(mover, '人の席の誰も打てる手がない（suggest・pick を確かめる）').not.toBeUndefined();
            const waiting = seats.find(seat => !moveFor(room, seat));
            if (waiting !== undefined) {
                await clients[waiting].send('command', { command: moveFor(room, mover) });
                expect(clients[waiting].last('error')).toBeTruthy();
            }
            await clients[mover].send('command', { command: { type: 'proxy' } });
            expect(clients[mover].last('error')).toBeTruthy();
            expect((await roomOf(server, clients)).version).toBe(room.version);
        });

        it('人どうしで終局まで遊べ、断られる操作がない', async () => {
            const server = createTestServer(definition, { seed });
            const clients = await startRoom(server);
            const result = await playOut(server, clients, clients.map((_, seat) => seat));
            expect(result.rejected).toBe(0);
            expect(result.status).toBe('ended');
            expect(clients[0].last('lobby').status).toBe('ended');
        }, TIMEOUT_MS);

        it('接続が切れても、トークンで同じ席に戻り、対戦の続きが届く', async () => {
            const server = createTestServer(definition, { seed });
            const clients = await startRoom(server);
            const last = clients.length - 1;
            const back = await server.reconnect(clients[last]);
            expect(back.last('joined').seat).toBe(last);
            expect(back.last('lobby').status).toBe('playing');
            expect(back.last('state')?.view).toBeTruthy();
        });

        it.runIf(leaveContinues && humanCount >= 2)('対戦中に抜けた人の席は CPU が引き継ぎ、残った人で終局まで進む', async () => {
            const server = createTestServer(definition, { seed });
            const clients = await startRoom(server);
            await clients[humanCount - 1].send('leave');
            const stayers = clients.slice(0, humanCount - 1).map((_, seat) => seat);
            const result = await playOut(server, clients, stayers);
            expect(result.rejected).toBe(0);
            expect(result.status).toBe('ended');
        }, TIMEOUT_MS);

        it.runIf(definition.perfectInformation !== true)('ビュー（各席・観戦者）に、シードや乱数の状態が入らない', async () => {
            const server = createTestServer(definition, { seed });
            const clients = await startRoom(server);
            await playOut(server, clients, clients.map((_, seat) => seat), 10);
            const found = new Set();
            clients.forEach((client, seat) => client.all('state')
                .forEach(message => randomKeysIn(message.view, `席${seat}のビュー`).forEach(key => found.add(key))));
            const room = await roomOf(server, clients);
            if (definition.spectatorView && room.game) {
                const game = definition.restore ? definition.restore(structuredClone(room.game), room) : room.game;
                randomKeysIn(definition.spectatorView(game, { since: null, room }), '観戦者のビュー').forEach(key => found.add(key));
            }
            expect([...found], 'ビューからシードを外す（隠れた情報も先の乱数もないなら、定義に perfectInformation: true）').toEqual([]);
        }, TIMEOUT_MS);

        it.runIf(Boolean(definition.spectatorView) && (definition.maxSpectators ?? 0) > 0)('観戦者には、観戦用のビューだけが届く', async () => {
            const server = createTestServer(definition, { seed });
            const clients = await startRoom(server);
            const watcher = server.connect();
            await watcher.send('join', { roomCode: clients.code, name: 'みる', spectate: true });
            const view = watcher.last('state')?.view;
            expect(view).toBeTruthy();
            expect(watcher.last('joined').seat).toBeNull();
        });
    });
}
