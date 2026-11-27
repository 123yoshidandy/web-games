import { describe, it, expect, vi, afterAll } from 'vitest';
import { once } from 'node:events';
import NetplayClient from '../client/netplay-client.mjs';
import { createTestServer } from '../server/testing.js';
import { MemoryStore } from '../server/memory-store.js';
import { RoomService, OPEN_LIST, openRoomOf } from '../server/room-service.js';
import { createStatsHandler } from '../server/stats-handler.js';
import { MemoryStatsStore } from '../server/stats.js';
import { startMultiDevServer } from '../server/dev-server.js';
import turnGame from '../examples/turn-game.js';

vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: class {}, ConditionalCheckFailedException: class extends Error {} }));
vi.mock('@aws-sdk/lib-dynamodb', () => {
    const command = (name) => class { constructor(input) { this.name = name; this.input = input; } };
    return {
        DynamoDBDocumentClient: { from: () => null },
        GetCommand: command('Get'), PutCommand: command('Put'), DeleteCommand: command('Delete'), ScanCommand: command('Scan'), QueryCommand: command('Query')
    };
});
const { DynamoStore, OPEN_ROOMS_INDEX } = await import('../server/dynamo-store.js');

// 2〜3人の、1手で終わるゲーム
const smallGame = {
    minPlayers: 2,
    maxPlayers: 3,
    allowCpu: true,
    create: () => ({ winner: null }),
    view: (game) => game,
    actions: { win: ({ game, seat }) => { game.winner = seat; } },
    isOver: (game) => game.winner !== null
};

const stored = (server, code) => server.store.rooms.get(code);

describe('一覧に載せる印（markOpenListing）', () => {
    it('ロビーで待っている部屋にだけ付き、ホスト名・人数・定員を持つ（token は持たない）', async () => {
        const server = createTestServer(smallGame);
        const [a] = await server.createRoom(['あお']);
        const room = stored(server, a.last('joined').roomCode);
        expect(room.openList).toBe(OPEN_LIST);
        expect(room.openAt).toBe(room.createdAt);
        expect(room.lobbyEntry).toEqual({ hostName: 'あお', players: 1, maxPlayers: 3 });
    });

    it('始まる・満員になる・人がいなくなると外れ、ロビーに戻ると付き直す', async () => {
        const server = createTestServer(smallGame);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        const code = a.last('joined').roomCode;
        expect(stored(server, code).lobbyEntry.players).toBe(2);

        await a.send('addCpu');
        expect(stored(server, code).openList).toBeUndefined(); // 満員

        await a.send('removeCpu', { seat: 2 });
        await a.send('start');
        expect(stored(server, code).openList).toBeUndefined(); // 対戦中

        await a.send('win');
        await a.send('backToLobby');
        expect(stored(server, code).openList).toBe(OPEN_LIST);

        await a.disconnect();
        await b.disconnect();
        expect(stored(server, code).openList).toBeUndefined(); // つながっている人がいない
    });
});

describe('保存先の listOpenRooms', () => {
    it('メモリ：全ゲームの載せる部屋を新しい順に返し、期限切れと頭のない部屋は除く', async () => {
        const shared = new MemoryStore();
        const now = { t: 1_000_000 };
        const serviceOf = (name) => new RoomService({ game: smallGame, store: new MemoryStore({ keyPrefix: name, from: shared }), send: async () => {}, now: () => now.t });
        await serviceOf('azul').handle('c1', { action: 'create', name: 'あお' });
        now.t += 1000;
        await serviceOf('go').handle('c2', { action: 'create', name: 'しろ' });
        await new RoomService({ game: smallGame, store: shared, send: async () => {} }).handle('c3', { action: 'create', name: '頭なし' });

        const rooms = await shared.listOpenRooms(Math.floor(now.t / 1000));
        expect(rooms.map(r => [r.game, r.hostName, r.players, r.maxPlayers])).toEqual([['go', 'しろ', 1, 3], ['azul', 'あお', 1, 3]]);
        expect(rooms[0].roomCode).toMatch(/^\d{4}$/);
        expect(await shared.listOpenRooms(Math.floor(now.t / 1000) + 3 * 24 * 3600)).toEqual([]);
    });

    it('DynamoDB：索引 OpenRooms を1回 Query し（Scan しない）、キーからゲームを取る', async () => {
        const sent = [];
        const client = {
            async send(command) {
                sent.push(command);
                return { Items: [
                    { pk: 'ROOM#azul#1234', openAt: 5, lobbyEntry: { hostName: 'あお', players: 1, maxPlayers: 4 } },
                    { pk: 'ROOM#5678', openAt: 4, lobbyEntry: { hostName: '古い', players: 1, maxPlayers: 2 } }
                ] };
            }
        };
        const rooms = await new DynamoStore('rooms', client).listOpenRooms(100, { limit: 30 });
        expect(rooms).toEqual([{ game: 'azul', roomCode: '1234', hostName: 'あお', players: 1, maxPlayers: 4, createdAt: 5 }]);
        expect(sent).toHaveLength(1);
        expect(sent[0].name).toBe('Query');
        expect(sent[0].input).toMatchObject({
            TableName: 'rooms', IndexName: OPEN_ROOMS_INDEX, KeyConditionExpression: '#openList = :open',
            ExpressionAttributeValues: { ':open': 'OPEN', ':now': 100 }, ScanIndexForward: false, Limit: 30
        });
    });

    it('一覧の1行は、形の違うキーと項目を載せない', () => {
        expect(openRoomOf({ pk: 'ROOM#Azul#1234', lobbyEntry: {} })).toBeNull();
        expect(openRoomOf({ pk: 'ROOM#azul#1234' })).toBeNull();
        expect(openRoomOf({ pk: 'CONN#x', lobbyEntry: {} })).toBeNull();
    });
});

describe('GET /rooms', () => {
    const get = (handler, path) => handler({ rawPath: path, requestContext: { http: { method: 'GET' } } });

    it('rooms を渡したときだけ一覧を返し、渡さなければ 404（前からの使い方のまま）', async () => {
        const rooms = { listOpenRooms: vi.fn(async () => [{ game: 'azul', roomCode: '1234', hostName: 'あお', players: 1, maxPlayers: 4, createdAt: 1 }]) };
        const response = await get(createStatsHandler({ store: new MemoryStatsStore(), rooms, now: () => 5000 }), '/rooms');
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).rooms[0]).toMatchObject({ game: 'azul', hostName: 'あお' });
        expect(rooms.listOpenRooms).toHaveBeenCalledWith(5, { limit: 30 });
        expect((await get(createStatsHandler({ store: new MemoryStatsStore() }), '/rooms')).statusCode).toBe(404);
    });
});

describe('手元のテスト用サーバーの GET /rooms（通し）', () => {
    let dev;
    afterAll(() => dev?.close());

    it('ゲームの接続で作った部屋が一覧に出て、始めると消える', async () => {
        dev = startMultiDevServer({ port: 0, log: () => {}, load: (name) => (name === 'turn' ? turnGame : null) });
        await once(dev.server, 'listening');
        const port = dev.server.address().port;
        const roomsNow = async () => (await (await fetch(`http://localhost:${port}/rooms`)).json()).rooms;

        expect(await roomsNow()).toEqual([]);
        const a = new NetplayClient({ serverUrl: `ws://localhost:${port}?game=turn`, storageKey: 'open.a' });
        const b = new NetplayClient({ serverUrl: `ws://localhost:${port}?game=turn`, storageKey: 'open.b' });
        await a.createRoom('あお');
        await vi.waitFor(() => expect(a.lobby?.status).toBe('lobby'));
        const [listed] = await roomsNow();
        expect(listed).toMatchObject({ game: 'turn', roomCode: a.lobby.roomCode, hostName: 'あお', players: 1 });

        await b.enterRoom(listed.roomCode, 'みどり');
        await vi.waitFor(() => expect(a.lobby.players.length).toBe(2));
        await a.start();
        await vi.waitFor(async () => expect(await roomsNow()).toEqual([]));
        [a, b].forEach(client => client.close());
    });
});
