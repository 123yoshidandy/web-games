import { describe, it, expect, vi } from 'vitest';
import {
    normalizeName, nameKey, resultOf, outcomeOf, matchRecord, createMatchRecorder, countersOf, statsFromItem, MemoryStatsStore
} from '../server/stats.js';
import { createStatsHandler, localRecord } from '../server/stats-handler.js';
import { createTestServer } from '../server/testing.js';
import { MemoryStore } from '../server/memory-store.js';
import { ConflictError } from '../server/room-service.js';

vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: class {} }));
vi.mock('@aws-sdk/lib-dynamodb', () => {
    const command = (name) => class { constructor(input) { this.name = name; this.input = input; } };
    return { DynamoDBDocumentClient: { from: () => null }, GetCommand: command('Get'), TransactWriteCommand: command('TransactWrite') };
});
const { DynamoStatsStore } = await import('../server/dynamo-stats-store.js');

const room = (players, extra = {}) => ({ code: '1234', createdAt: 5, matchId: 1, players, ...extra });
const human = (name) => ({ name, isCPU: false });
const cpu = (name) => ({ name, isCPU: true });

describe('名前', () => {
    it('全角・半角と前後の空白を揃え、| を除き、12文字までにする', () => {
        expect(normalizeName('  ＡＢＣ|１２３  ')).toBe('ABC123');
        expect(normalizeName('あいうえおかきくけこさしすせ')).toBe('あいうえおかきくけこさし');
    });

    it('キーは英字の大文字・小文字を区別せず、ロビーの仮の名前は誰でもない', () => {
        expect(nameKey('Aoi')).toBe(nameKey('aoi'));
        expect(nameKey('プレイヤー')).toBe('');
        expect(nameKey('   ')).toBe('');
    });
});

describe('結果の取り出し（resultOf）', () => {
    const three = room([human('A'), human('B'), cpu('C')]);

    it('定義の result があれば、それだけを使う（勝った席・順位・引き分け・協力）', () => {
        expect(resultOf({ result: () => ({ winners: [1] }) }, { winners: [0] }, three)).toEqual({ ranks: [2, 1, 2] });
        expect(resultOf({ result: () => ({ ranks: [3, 1, 2] }) }, {}, three)).toEqual({ ranks: [3, 1, 2] });
        expect(resultOf({ result: () => ({ draw: true }) }, {}, three)).toEqual({ ranks: [1, 1, 1] });
        expect(resultOf({ result: () => ({ coop: true, won: true }) }, {}, three)).toEqual({ coop: true, won: true });
        expect(resultOf({ result: () => null }, { winners: [0] }, three)).toBeNull();
    });

    it('game.result.standings（アズールの形）から順位を取る', () => {
        const game = { result: { standings: [{ seat: 2, rank: 1 }, { seat: 0, rank: 2 }, { seat: 1, rank: 2 }], winners: [2] } };
        expect(resultOf({}, game, three)).toEqual({ ranks: [2, 2, 1] });
    });

    it('ranking()・winners() のメソッド（世界の七不思議の形）から取る', () => {
        const game = { ranking() { return [{ seat: 1, rank: 1 }, { seat: 0, rank: 2 }, { seat: 2, rank: 3 }]; } };
        expect(resultOf({}, game, three)).toEqual({ ranks: [2, 1, 3] });
        expect(resultOf({}, { winners() { return [0, 2]; } }, three)).toEqual({ ranks: [1, 2, 1] });
    });

    it('winner の席の番号から取る。形が違う・空なら null（回数だけを数える）', () => {
        expect(resultOf({}, { winner: 0 }, three)).toEqual({ ranks: [1, 2, 2] });
        expect(resultOf({}, { winner: { name: 'A' } }, three)).toBeNull();
        expect(resultOf({}, { winners: [] }, three)).toBeNull();
        expect(resultOf({}, { winners: [7] }, three)).toBeNull();
        expect(resultOf({}, { get winners() { throw new Error('x'); }, winner: 1 }, three)).toEqual({ ranks: [2, 1, 2] });
    });

    it('順位から勝ち・負け・引き分けを決める（同点の勝ちは勝ち、全員同じなら引き分け）', () => {
        expect(outcomeOf([1, 1, 2], 0)).toBe('win');
        expect(outcomeOf([1, 1, 2], 2)).toBe('loss');
        expect(outcomeOf([1, 1], 1)).toBe('draw');
    });
});

describe('オンライン対戦の記録（matchRecord）', () => {
    it('人の席ごとに、結果と相手ごとの勝ち負け（CPU かどうか）を作る。CPU と名前のない席は数えない', () => {
        const record = matchRecord({
            gameName: 'azul', now: 9,
            room: room([human('あお'), human('みどり'), cpu('ルシア'), human('プレイヤー')]),
            result: { ranks: [1, 2, 3, 2] }
        });
        expect(record.id).toBe('online:azul:1234:5:1');
        expect(record.entries.map(e => [e.name, e.outcome])).toEqual([['あお', 'win'], ['みどり', 'loss']]);
        expect(record.entries[1].vs).toEqual([
            { name: 'あお', cpu: false, outcome: 'loss' },
            { name: 'ルシア', cpu: true, outcome: 'win' },
            { name: 'プレイヤー', cpu: false, outcome: 'draw' }
        ]);
    });

    it('協力のゲームは全員が同じ結果で、相手ごとの記録はない。結果が分からなければ回数だけ', () => {
        const players = [human('A'), human('B')];
        const coop = matchRecord({ gameName: 'g', room: room(players), result: { coop: true, won: false } });
        expect(coop.entries.map(e => [e.outcome, e.vs.length])).toEqual([['loss', 0], ['loss', 0]]);
        const unknown = matchRecord({ gameName: 'g', room: room(players), result: null });
        expect(unknown.entries[0]).toMatchObject({ outcome: null, vs: [{ name: 'B', cpu: false, outcome: null }] });
    });

    it('記録に失敗しても投げず、ログに1行残す', async () => {
        const log = vi.fn();
        const recorder = createMatchRecorder({ gameName: 'g', definition: {}, store: { record: () => Promise.reject(new Error('down')) }, log });
        await recorder({ room: room([human('A'), human('B')]), game: { winner: 0 } });
        expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'stats_failed', message: 'down' }));
    });
});

describe('保存の形とメモリの保存先', () => {
    it('数える名前は平らにし、同じ人の分は足し合わせる', () => {
        expect(countersOf('azul', [
            { outcome: 'win', online: true, vs: [{ name: 'B', cpu: false, outcome: 'win' }] },
            { outcome: null, online: false, vs: [] }
        ])).toEqual({ 'p|azul': 2, 'w|azul': 1, 'o|azul': 1, 'v|azul|h|B|p': 1, 'v|azul|h|B|w': 1 });
    });

    it('同じ id は2回数えず、ゲームごと・相手ごとの数を返す。名前の大文字・小文字は同じ人', async () => {
        const store = new MemoryStatsStore();
        const record = matchRecord({ gameName: 'azul', room: room([human('Aoi'), cpu('ルシア')]), result: { ranks: [1, 2] } });
        expect(await store.record(record)).toBe(true);
        expect(await store.record(record)).toBe(false);
        await store.record(localRecord({ id: 'azul-000001', name: 'aoi', game: 'azul', outcome: 'loss' }, 10));
        await store.record(localRecord({ id: 'sw-000001', name: 'AOI', game: 'seven-wonders', outcome: 'draw' }, 11));
        const stats = await store.get('AOI');
        expect(stats.name).toBe('AOI');
        expect(stats.games.azul).toEqual({
            plays: 2, wins: 1, losses: 1, draws: 0, online: 1,
            vs: [{ name: 'ルシア', cpu: true, plays: 1, wins: 1, losses: 0, draws: 0 }]
        });
        expect(stats.games['seven-wonders']).toMatchObject({ plays: 1, draws: 1, online: 0 });
        expect(await store.get('だれか')).toEqual({ name: 'だれか', games: {} });
    });

    it('項目の中の、形の違う名前は読み飛ばす', () => {
        expect(statsFromItem({ pk: 'USER#a', name: 'a', 'p|azul': 1, 'x|azul': 2, 'p|../x': 3 }).games).toEqual({
            azul: { plays: 1, wins: 0, losses: 0, draws: 0, online: 0, vs: [] }
        });
    });
});

describe('DynamoStatsStore', () => {
    const fakeClient = (reply = () => ({})) => {
        const sent = [];
        return { sent, async send(command) { sent.push(command); return reply(command); } };
    };

    it('印の Put（なければだけ）と、利用者ごとの ADD を1つのトランザクションにする', async () => {
        const client = fakeClient();
        const record = matchRecord({ gameName: 'azul', now: 2_000_000, room: room([human('A'), human('B')]), result: { ranks: [1, 2] } });
        expect(await new DynamoStatsStore('stats', client).record(record)).toBe(true);
        const [{ name, input }] = client.sent;
        expect(name).toBe('TransactWrite');
        const [marker, a, b] = input.TransactItems;
        expect(marker.Put).toMatchObject({ TableName: 'stats', Item: { pk: 'RESULT#online:azul:1234:5:1', expiresAt: 2000 + 90 * 24 * 3600 }, ConditionExpression: 'attribute_not_exists(pk)' });
        expect(a.Update.Key).toEqual({ pk: 'USER#a' });
        expect(a.Update.UpdateExpression).toMatch(/^SET #name = :name, #updatedAt = :at ADD #c0 :c0, /);
        expect(Object.values(a.Update.ExpressionAttributeNames)).toContain('v|azul|h|B|w');
        expect(b.Update.Key).toEqual({ pk: 'USER#b' });
    });

    it('印がもうあれば（数え済み）false を返し、ほかの失敗は投げる', async () => {
        const canceled = Object.assign(new Error('x'), { name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }] });
        const record = localRecord({ id: 'abcdef', name: 'A', game: 'azul', outcome: 'win' });
        expect(await new DynamoStatsStore('stats', fakeClient(() => { throw canceled; })).record(record)).toBe(false);
        await expect(new DynamoStatsStore('stats', fakeClient(() => { throw new Error('boom'); })).record(record)).rejects.toThrow('boom');
    });

    it('記録は USER#<キー> を読んで返す', async () => {
        const client = fakeClient(() => ({ Item: { pk: 'USER#a', name: 'A', 'p|azul': 3, 'w|azul': 2 } }));
        const stats = await new DynamoStatsStore('stats', client).get(' a ');
        expect(client.sent[0].input).toEqual({ TableName: 'stats', Key: { pk: 'USER#a' } });
        expect(stats).toEqual({ name: 'A', games: { azul: { plays: 3, wins: 2, losses: 0, draws: 0, online: 0, vs: [] } } });
    });
});

describe('記録の HTTP の入口（createStatsHandler）', () => {
    const call = (handler, method, path, { query, body } = {}) => handler({
        rawPath: path, queryStringParameters: query, requestContext: { http: { method } },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
    const parse = (response) => ({ ...response, json: response.body ? JSON.parse(response.body) : null });

    it('POST /results で数え、同じ id の2回目は duplicate。GET /stats で読める', async () => {
        const handler = createStatsHandler({ store: new MemoryStatsStore(), now: () => 1 });
        const body = { id: 'azul-123456', name: 'あお', game: 'azul', outcome: 'win' };
        expect(parse(await call(handler, 'POST', '/results', { body })).json).toEqual({ ok: true, duplicate: false });
        expect(parse(await call(handler, 'POST', '/results', { body })).json).toEqual({ ok: true, duplicate: true });
        const response = parse(await call(handler, 'GET', '/stats', { query: { name: 'あお' } }));
        expect(response.statusCode).toBe(200);
        expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
        expect(response.json.games.azul).toMatchObject({ plays: 1, wins: 1, online: 0 });
    });

    it('形の違う本文・名前・ゲーム・結果は 400、知らない道は 404、保存先の失敗は 500', async () => {
        const handler = createStatsHandler({ store: new MemoryStatsStore() });
        const ok = { id: 'azul-123456', name: 'あお', game: 'azul', outcome: 'win' };
        for (const body of ['{', [], { ...ok, name: '' }, { ...ok, game: '../x' }, { ...ok, id: 'a b' }, { ...ok, outcome: 'great' }, 'x'.repeat(3000)]) {
            expect((await call(handler, 'POST', '/results', { body })).statusCode).toBe(400);
        }
        expect((await call(handler, 'GET', '/stats', { query: {} })).statusCode).toBe(400);
        expect((await call(handler, 'GET', '/nothing')).statusCode).toBe(404);
        const broken = createStatsHandler({ store: { get: () => Promise.reject(new Error('down')) }, log: () => {} });
        expect((await call(broken, 'GET', '/stats', { query: { name: 'A' } })).statusCode).toBe(500);
    });

    it('ローカルの記録の id は、ゲームと人ごとに分ける', () => {
        expect(localRecord({ id: 'seed-1', name: 'Aoi', game: 'azul', outcome: null }, 3)).toEqual({
            id: 'local:azul:aoi:seed-1', game: 'azul', at: 3, entries: [{ name: 'Aoi', outcome: null, online: false, vs: [] }]
        });
    });
});

// 1手で終わる2人のゲーム（先に押した人の勝ち）
const quickGame = {
    create: ({ players }) => ({ players: players.map(p => p.name), winner: null }),
    view: (game) => game,
    actions: { win: ({ game, seat }) => { game.winner = seat; } },
    isOver: (game) => game.winner !== null
};

describe('部屋の処理の onMatchEnd', () => {
    it('対戦が終わったことを保存できたら1回だけ呼び、終わったあとの保存や再戦の前には呼ばない', async () => {
        const ended = [];
        const server = createTestServer(quickGame, { onMatchEnd: async ({ room, game }) => { ended.push([room.matchId, room.status, game.winner]); } });
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        await b.send('win');
        expect(ended).toEqual([[1, 'ended', 1]]);
        await a.send('stamp', { stamp: 'x' });
        await b.send('leave');
        expect(ended).toHaveLength(1);
    });

    it('保存がぶつかってやり直しても、呼ぶのは保存できた1回だけ', async () => {
        const ended = [];
        const store = new MemoryStore();
        let fail = 0;
        const putRoom = store.putRoom.bind(store);
        store.putRoom = async (room, ...rest) => {
            if (room.status === 'ended' && fail++ === 0) throw new ConflictError();
            return putRoom(room, ...rest);
        };
        const server = createTestServer(quickGame, { store, onMatchEnd: async ({ room }) => { ended.push(room.reportedMatchId); } });
        const [a] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        await a.send('win');
        expect(fail).toBe(2);
        expect(ended).toEqual([1]);
    });

    it('onMatchEnd が失敗しても、対戦の処理は続く', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const server = createTestServer(quickGame, { onMatchEnd: async () => { throw new Error('down'); } });
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        await a.send('win');
        expect(b.last('lobby').status).toBe('ended');
        expect(log).toHaveBeenCalledWith(expect.stringContaining('match_end_failed'));
        log.mockRestore();
    });

    it('記録の関数とつなぐと、両方の人の記録になる', async () => {
        const stats = new MemoryStatsStore();
        const server = createTestServer(quickGame, { onMatchEnd: createMatchRecorder({ gameName: 'quick', definition: quickGame, store: stats }) });
        const [a] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        await a.send('win');
        expect((await stats.get('あお')).games.quick).toMatchObject({ plays: 1, wins: 1, online: 1, vs: [{ name: 'みどり', wins: 1 }] });
        expect((await stats.get('みどり')).games.quick).toMatchObject({ plays: 1, losses: 1, vs: [{ name: 'あお', losses: 1 }] });
    });
});
