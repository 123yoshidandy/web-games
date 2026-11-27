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
const copy = (item) => item && structuredClone(item);
const send = async (command) => {
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
    ({ handler } = await import(pathToFileURL(join(dir, 'dist', 'handler.mjs')).href));
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

test('全ゲームの chunk が読み込めて、つなげる', async () => {
    const failed = [];
    for (const game of built.games) {
        const result = await handler(event('$connect', `c-all-${game}`, { game }));
        if (result?.statusCode !== 200) failed.push(game);
    }
    assert.deepEqual(failed, []);
});
