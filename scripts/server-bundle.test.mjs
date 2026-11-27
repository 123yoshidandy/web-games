// まとめたサーバーを束ねたもの（scripts/build-server.mjs）のテスト
// 一時フォルダに束ね、その横に偽の @aws-sdk（DynamoDB はメモリの Map、API Gateway への送信は記録するだけ）を置いて、
// Lambda と同じように handler.mjs を読み込んで呼ぶ。AWS にもネットワークにもつながない
// 使い方: node --test scripts/server-bundle.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { buildServer } from './build-server.mjs';
import { LEGACY_GAMES } from './set-online-url.mjs';

const FAKE_AWS_SDK = {
    'client-dynamodb': `
export class DynamoDBClient {}
export class ConditionalCheckFailedException extends Error {
    constructor(message = 'The conditional request failed') { super(message); this.name = 'ConditionalCheckFailedException'; }
}
`,
    'lib-dynamodb': `
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
const fake = (globalThis.__fakeAws ??= { items: new Map(), sent: [] });
class Command { constructor(input) { this.input = input; } }
export class GetCommand extends Command {}
export class PutCommand extends Command {}
export class DeleteCommand extends Command {}
export class ScanCommand extends Command {}
export class TransactWriteCommand extends Command {}
export class QueryCommand extends Command {}
const copy = (item) => item && structuredClone(item);
// 利用者ごとの記録（dynamo-stats-store.js）：印の Put（なければだけ）と、SET・ADD の Update を、まとめて行う
const transact = ({ TransactItems }) => {
    const [first] = TransactItems;
    if (first.Put && fake.items.has(first.Put.Item.pk)) {
        throw Object.assign(new Error('canceled'), { name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }] });
    }
    for (const { Put, Update } of TransactItems) {
        if (Put) fake.items.set(Put.Item.pk, copy(Put.Item));
        if (!Update) continue;
        const item = fake.items.get(Update.Key.pk) ?? { ...Update.Key };
        const names = Update.ExpressionAttributeNames;
        const values = Update.ExpressionAttributeValues;
        const [, sets, adds] = Update.UpdateExpression.match(/^SET (.*) ADD (.*)$/);
        for (const part of sets.split(', ')) { const [n, v] = part.split(' = '); item[names[n]] = values[v]; }
        for (const part of adds.split(', ')) { const [n, v] = part.split(' '); item[names[n]] = (item[names[n]] ?? 0) + values[v]; }
        fake.items.set(Update.Key.pk, item);
    }
    return {};
};
const send = async (command) => {
    if (command instanceof TransactWriteCommand) return transact(command.input);
    // 索引 OpenRooms（openList が鍵、openAt の新しい順）だけをまねる
    if (command instanceof QueryCommand) {
        const { IndexName, ExpressionAttributeValues: v, Limit } = command.input;
        if (IndexName !== 'OpenRooms') throw new Error('偽の DynamoDB が知らない索引: ' + IndexName);
        const Items = [...fake.items.values()].filter((item) => item.openList === v[':open'] && item.expiresAt > v[':now'])
            .sort((a, b) => b.openAt - a.openAt).slice(0, Limit)
            .map(({ pk, openList, openAt, code, expiresAt, lobbyEntry }) => copy({ pk, openList, openAt, code, expiresAt, lobbyEntry }));
        return { Items };
    }
    const { Key, Item, ConditionExpression, ExpressionAttributeValues: values = {} } = command.input;
    if (command instanceof GetCommand) return { Item: copy(fake.items.get(Key.pk)) };
    if (command instanceof DeleteCommand) { fake.items.delete(Key.pk); return {}; }
    if (command instanceof PutCommand) {
        const existing = fake.items.get(Item.pk);
        const ok = !ConditionExpression
            || (ConditionExpression.startsWith('attribute_not_exists') && (!existing || existing.expiresAt <= values[':now']))
            || (ConditionExpression === 'version = :previous' && existing?.version === values[':previous']);
        if (!ok) throw new ConditionalCheckFailedException();
        fake.items.set(Item.pk, copy(Item));
        return {};
    }
    if (command instanceof ScanCommand) {
        const Items = [...fake.items.values()].filter((item) => item.pk.startsWith(values[':room'])
            && item.isPublic === values[':true'] && item.status === values[':status'] && item.expiresAt > values[':now']);
        return { Items: Items.map(copy) };
    }
    throw new Error('偽の DynamoDB が知らない操作: ' + command.constructor.name);
};
export const DynamoDBDocumentClient = { from: () => ({ send }) };
`,
    'client-apigatewaymanagementapi': `
const fake = (globalThis.__fakeAws ??= { items: new Map(), sent: [] });
export class PostToConnectionCommand { constructor(input) { this.input = input; } }
export class ApiGatewayManagementApiClient {
    async send(command) {
        fake.sent.push({ connectionId: command.input.ConnectionId, message: JSON.parse(command.input.Data) });
        return {};
    }
}
`
};

let dir;
let built;
let handler;
let statsHandler;
let fake;

const event = (routeKey, connectionId, { game, body } = {}) => ({
    requestContext: { routeKey, connectionId, domainName: 'example.invalid', stage: 'prod' },
    queryStringParameters: game === undefined ? undefined : { game },
    body
});

before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'web-games-server-'));
    built = await buildServer({ outdir: join(dir, 'dist') });
    for (const [name, source] of Object.entries(FAKE_AWS_SDK)) {
        const pkgDir = join(dir, 'dist', 'node_modules', '@aws-sdk', name);
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: `@aws-sdk/${name}`, type: 'module', main: 'index.js' }));
        writeFileSync(join(pkgDir, 'index.js'), source);
    }
    process.env.TABLE_NAME = 'web-games-online-test';
    process.env.STATS_TABLE_NAME = 'web-games-online-stats-test';
    ({ handler } = await import(pathToFileURL(join(dir, 'dist', 'handler.mjs')).href));
    ({ handler: statsHandler } = await import(pathToFileURL(join(dir, 'dist', 'stats-handler.mjs')).href));
    fake = globalThis.__fakeAws;
});

after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
});

test('server/src/handler.js のあるゲームが全部、別の chunk になる', () => {
    assert.ok(built.games.length > 0);
    assert.deepEqual(built.missing, []);
    assert.equal(new Set(built.chunkOf.values()).size, built.games.length);
});

test('?game=azul でつなぐと受け付け、接続のゲームを GAME#接続ID に記録する', async () => {
    assert.deepEqual(await handler(event('$connect', 'c-azul', { game: 'azul' })), { statusCode: 200 });
    assert.equal(fake.items.get('GAME#c-azul')?.game, 'azul');
});

test('azul の接続で部屋を作ると、部屋のキーに azul が付き、返事が送られる', async () => {
    const result = await handler(event('$default', 'c-azul', { body: JSON.stringify({ action: 'create', name: 'テスト' }) }));
    assert.equal(result.statusCode, 200);
    const rooms = [...fake.items.keys()].filter((key) => key.startsWith('ROOM#'));
    assert.equal(rooms.length, 1);
    assert.match(rooms[0], /^ROOM#azul#/);
    assert.ok(fake.sent.some(({ connectionId, message }) => connectionId === 'c-azul' && message.type === 'joined'));
});

test('知らないゲーム・形のおかしい名前・game なしは 400 で断り、何も記録しない', async () => {
    for (const game of ['no-such-game', '../azul', 'Azul', '', undefined]) {
        assert.deepEqual(await handler(event('$connect', 'c-bad', { game })), { statusCode: 400 }, String(game));
    }
    assert.equal(fake.items.has('GAME#c-bad'), false);
});

test('ゲームの分からない接続のメッセージは 400', async () => {
    assert.deepEqual(await handler(event('$default', 'c-unknown', { body: '{"action":"ping"}' })), { statusCode: 400 });
});

test('$disconnect で GAME#接続ID を消す', async () => {
    assert.deepEqual(await handler(event('$disconnect', 'c-azul')), { statusCode: 200 });
    assert.equal(fake.items.has('GAME#c-azul'), false);
});

test('前からの7本も、部屋のキーにゲームの名前が付く（keyPrefix）', async () => {
    for (const game of Object.keys(LEGACY_GAMES)) {
        const connectionId = `c-legacy-${game}`;
        assert.equal((await handler(event('$connect', connectionId, { game }))).statusCode, 200, game);
        await handler(event('$default', connectionId, { body: JSON.stringify({ action: 'create', name: 'テスト' }) }));
        const roomCode = fake.items.get(`CONN#${connectionId}`)?.roomCode;
        assert.ok(roomCode, game);
        assert.ok(fake.items.has(`ROOM#${game}#${roomCode}`), game);
        assert.equal(fake.items.has(`ROOM#${roomCode}`), false, game);
    }
});

test('記録の API（stats-handler.mjs）：ローカルの結果を受け取り、同じ id は1回だけ数え、名前で読める', async () => {
    const http = (method, rawPath, { query, body } = {}) => statsHandler({
        rawPath, queryStringParameters: query, requestContext: { http: { method } }, body: body && JSON.stringify(body)
    });
    const body = { id: 'azul-bundle-1', name: 'バンドル', game: 'azul', outcome: 'win' };
    assert.deepEqual(JSON.parse((await http('POST', '/results', { body })).body), { ok: true, duplicate: false });
    assert.deepEqual(JSON.parse((await http('POST', '/results', { body })).body), { ok: true, duplicate: true });
    const response = await http('GET', '/stats', { query: { name: 'バンドル' } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body).games.azul, { plays: 1, wins: 1, losses: 0, draws: 0, online: 0, vs: [] });
    assert.ok(fake.items.has('RESULT#local:azul:バンドル:azul-bundle-1'));
});

test('全ゲームの待っている部屋（GET /rooms）：作った部屋が出て、つながっている人がいなくなると消える', async () => {
    const rooms = async () => JSON.parse((await statsHandler({ rawPath: '/rooms', requestContext: { http: { method: 'GET' } } })).body).rooms;
    await handler(event('$connect', 'c-rooms', { game: 'seven-wonders' }));
    await handler(event('$default', 'c-rooms', { body: JSON.stringify({ action: 'create', name: 'まつ' }) }));
    const code = fake.items.get('CONN#c-rooms').roomCode;
    const listed = (await rooms()).find((room) => room.game === 'seven-wonders');
    assert.deepEqual(listed && { ...listed, createdAt: typeof listed.createdAt },
        { game: 'seven-wonders', roomCode: code, hostName: 'まつ', players: 1, maxPlayers: 7, createdAt: 'number' });
    await handler(event('$disconnect', 'c-rooms'));
    assert.equal((await rooms()).some((room) => room.roomCode === code && room.game === 'seven-wonders'), false);
});

test('全ゲームの chunk が読み込めて、つなげる', async () => {
    const failed = [];
    for (const game of built.games) {
        const result = await handler(event('$connect', `c-all-${game}`, { game }));
        if (result?.statusCode !== 200) failed.push(game);
    }
    assert.deepEqual(failed, []);
});
