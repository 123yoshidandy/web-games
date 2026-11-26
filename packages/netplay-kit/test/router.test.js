import { describe, it, expect, vi } from 'vitest';
import { MemoryStore } from '../server/memory-store.js';
import { createTestServer } from '../server/testing.js';
import turnGame from '../examples/turn-game.js';

// AWS SDK は Lambda の側にあり、手元には入れていないので差し替える（router は保存先に MemoryStore を渡して試す）
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: class {}, ConditionalCheckFailedException: class extends Error {} }));
vi.mock('@aws-sdk/lib-dynamodb', () => {
    const command = (name) => class { constructor(input) { this.name = name; this.input = input; } };
    return {
        DynamoDBDocumentClient: { from: () => null },
        GetCommand: command('Get'), PutCommand: command('Put'), DeleteCommand: command('Delete'), ScanCommand: command('Scan')
    };
});

const { createRouter } = await import('../server/router.js');

const event = (routeKey, connectionId, extra = {}) => ({ requestContext: { routeKey, connectionId }, ...extra });

// 呼ばれた event を残す、ゲームごとの handler
function fakeGames(names) {
    const calls = [];
    const games = Object.fromEntries(names.map(name => [name, async (e) => {
        calls.push({ game: name, routeKey: e.requestContext.routeKey, connectionId: e.requestContext.connectionId });
        return { statusCode: 200 };
    }]));
    return { calls, load: vi.fn(async (name) => (name in games ? { handler: games[name] } : null)) };
}

describe('router（1つの API で複数のゲーム）', () => {
    it('?game= のゲームの handler に、接続からあとのメッセージ・切断を渡す', async () => {
        const store = new MemoryStore();
        const { calls, load } = fakeGames(['azul', 'go']);
        const route = createRouter({ load, store, now: () => 1_000_000 });

        expect(await route(event('$connect', 'c1', { queryStringParameters: { game: 'azul' } }))).toEqual({ statusCode: 200 });
        expect(await store.getConnectionGame('c1')).toEqual({ game: 'azul', expiresAt: 1000 + 2 * 24 * 3600 });
        await route(event('$connect', 'c2', { queryStringParameters: { game: 'go' } }));
        await route(event('$default', 'c1', { body: '{}' }));
        await route(event('$default', 'c2', { body: '{}' }));
        await route(event('$disconnect', 'c1'));

        expect(calls.map(c => `${c.game}:${c.routeKey}:${c.connectionId}`)).toEqual([
            'azul:$connect:c1', 'go:$connect:c2', 'azul:$default:c1', 'go:$default:c2', 'azul:$disconnect:c1'
        ]);
        expect(await store.getConnectionGame('c1')).toBeNull();
        expect(load).toHaveBeenCalledTimes(2); // ゲームごとに1回だけ読み込む
    });

    it('知らないゲーム・形の違う名前・名前なしは、接続を 400 で断り、読み込みもしない', async () => {
        const { calls, load } = fakeGames(['azul']);
        const route = createRouter({ load, store: new MemoryStore(), log: () => {} });
        for (const game of ['chess', '../azul', 'Azul', undefined]) {
            const query = game === undefined ? {} : { queryStringParameters: { game } };
            expect(await route(event('$connect', 'c1', query))).toEqual({ statusCode: 400 });
        }
        expect(calls).toEqual([]);
        expect(load.mock.calls.map(([name]) => name)).toEqual(['chess']);
    });

    it('Lambda が入れ替わっても、記録した接続のゲームを保存先から読んで渡す', async () => {
        const store = new MemoryStore();
        const first = fakeGames(['azul']);
        await createRouter({ load: first.load, store })(event('$connect', 'c1', { queryStringParameters: { game: 'azul' } }));

        const second = fakeGames(['azul']);
        const route = createRouter({ load: second.load, store });
        await route(event('$default', 'c1', { body: '{}' }));
        expect(second.calls).toEqual([{ game: 'azul', routeKey: '$default', connectionId: 'c1' }]);
    });

    it('ゲームの分からない接続のメッセージは 400、切断は 200 で済ませる', async () => {
        const { calls, load } = fakeGames(['azul']);
        const route = createRouter({ load, store: new MemoryStore(), log: () => {} });
        expect(await route(event('$default', 'zz', { body: '{}' }))).toEqual({ statusCode: 400 });
        expect(await route(event('$disconnect', 'zz'))).toEqual({ statusCode: 200 });
        expect(calls).toEqual([]);
    });
});

describe('keyPrefix（1つの保存場所に複数のゲーム）', () => {
    it('同じ部屋番号でもゲームが違えば別の部屋で、ほかのゲームの部屋には入れない', async () => {
        const shared = new MemoryStore();
        const a = createTestServer(turnGame, { store: new MemoryStore({ keyPrefix: 'a', from: shared }) });
        const b = createTestServer(turnGame, { store: new MemoryStore({ keyPrefix: 'b', from: shared }) });
        const [hostA] = await a.createRoom(['あお']);
        const [hostB] = await b.createRoom(['みどり']);
        // 乱数が同じなので部屋番号も同じになる
        expect(hostA.last('joined').roomCode).toBe(hostB.last('joined').roomCode);
        expect([...shared.rooms.keys()].sort()).toEqual([`a#${hostA.last('joined').roomCode}`, `b#${hostB.last('joined').roomCode}`]);

        const guest = b.connect();
        await guest.send('join', { roomCode: hostA.last('joined').roomCode, name: 'き' });
        expect((await b.store.getRoom(hostB.last('joined').roomCode)).players.map(p => p.name)).toEqual(['みどり', 'き']);
        expect((await a.store.getRoom(hostA.last('joined').roomCode)).players.map(p => p.name)).toEqual(['あお']);
    });

    it('公開の部屋の一覧は、自分のゲームの部屋だけを返す', async () => {
        const shared = new MemoryStore();
        const a = createTestServer(turnGame, { store: new MemoryStore({ keyPrefix: 'a', from: shared }) });
        const b = createTestServer(turnGame, { store: new MemoryStore({ keyPrefix: 'b', from: shared }), seed: 7 });
        const host = a.connect();
        await host.send('create', { name: 'あお', public: true });
        expect(await a.store.listPublicRooms(0)).toHaveLength(1);
        expect(await b.store.listPublicRooms(0)).toHaveLength(0);
    });
});
