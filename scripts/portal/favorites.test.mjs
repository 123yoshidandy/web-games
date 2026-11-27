// 入口のページのお気に入り（端末・サーバー・ログインしたときの足し合わせ）のテスト
// 使い方: node --test scripts/portal/favorites.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFavorites, mergeFavorites, LOCAL_KEY, ACCOUNT_KEY } from './favorites.js';

const memoryStorage = (initial = {}) => {
    const data = new Map(Object.entries(initial));
    return {
        data,
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key)
    };
};

// 記録の API の GET・PUT /favorites を、名前ごとの一覧で受ける。down なら投げる（つながらない）
const fakeServer = (initial = {}) => {
    const users = new Map(Object.entries(initial));
    const server = { users, down: false, calls: [] };
    server.fetchImpl = async (url, options = {}) => {
        if (server.down) throw new TypeError('offline');
        const { pathname, searchParams } = new URL(url);
        server.calls.push(`${options.method ?? 'GET'} ${pathname}`);
        if (options.method === 'PUT') {
            const { name, games } = JSON.parse(options.body);
            users.set(name.toLowerCase(), mergeFavorites(games));
            return { ok: true, json: async () => ({ name, games: users.get(name.toLowerCase()) }) };
        }
        const name = searchParams.get('name');
        return { ok: true, json: async () => ({ name, games: users.get(name.toLowerCase()) ?? [] }) };
    };
    return server;
};

const setup = ({ user = '', storage = memoryStorage(), server = fakeServer(), url = 'https://api.example' } = {}) => {
    const session = { user };
    const favorites = createFavorites({ storage, fetchImpl: server.fetchImpl, user: () => session.user, url: () => url });
    return { favorites, storage, server, session };
};

test('ログインしていなければ、端末だけに置き、サーバーには送らない', async () => {
    const { favorites, storage, server } = setup();
    assert.equal(favorites.toggle('go'), true);
    assert.equal(favorites.toggle('azul'), true);
    assert.deepEqual(favorites.list(), ['azul', 'go']);
    assert.equal(favorites.toggle('go'), false);
    assert.deepEqual(JSON.parse(storage.getItem(LOCAL_KEY)), ['azul']);
    await favorites.sync();
    assert.deepEqual(server.calls, []);
});

test('ログインすると、端末のお気に入りをサーバーの分に足して送り、端末の分は空にする', async () => {
    const server = fakeServer({ aoi: ['chess'] });
    const { favorites, storage, session } = setup({ server });
    favorites.toggle('go');
    session.user = 'Aoi';
    assert.equal(await favorites.sync(), true);
    assert.deepEqual(server.users.get('aoi'), ['chess', 'go']);
    assert.deepEqual(favorites.list(), ['chess', 'go']);
    assert.equal(storage.getItem(LOCAL_KEY), null);
    // ログアウトすると、端末の分（空）だけになる
    session.user = '';
    assert.deepEqual(favorites.list(), []);
});

test('端末の分がサーバーにもうあれば、読むだけで送らない', async () => {
    const server = fakeServer({ aoi: ['go'] });
    const { favorites, session } = setup({ server });
    favorites.toggle('go');
    session.user = 'aoi';
    await favorites.sync();
    assert.deepEqual(server.calls, ['GET /favorites']);
});

test('ほかのスマホで変えた分は、合わせると出る（外したものも外れる）', async () => {
    const server = fakeServer({ aoi: ['azul', 'go'] });
    const { favorites } = setup({ user: 'aoi', server });
    await favorites.sync();
    assert.deepEqual(favorites.list(), ['azul', 'go']);
    server.users.set('aoi', ['azul']);
    await favorites.sync();
    assert.deepEqual(favorites.list(), ['azul']);
});

test('ログイン中の付け外しはすぐ出して送る。送れなければ印を残し、次に合わせるときに送る', async () => {
    const server = fakeServer();
    const { favorites, storage } = setup({ user: 'aoi', server });
    await favorites.sync();
    server.down = true;
    favorites.toggle('go');
    assert.deepEqual(favorites.list(), ['go']);
    await favorites.sync();
    assert.equal(JSON.parse(storage.getItem(ACCOUNT_KEY)).dirty, true);
    server.down = false;
    assert.equal(await favorites.sync(), true);
    assert.deepEqual(server.users.get('aoi'), ['go']);
    assert.equal(JSON.parse(storage.getItem(ACCOUNT_KEY)).dirty, false);
});

test('続けて押しても、最後の状態がサーバーに残る', async () => {
    const server = fakeServer();
    const { favorites } = setup({ user: 'aoi', server });
    favorites.toggle('go');
    favorites.toggle('azul');
    favorites.toggle('go');
    await favorites.sync();
    assert.deepEqual(server.users.get('aoi'), ['azul']);
    assert.deepEqual(favorites.list(), ['azul']);
});

test('別の人の写しは使わない。記録の API がなければ、ログインしていても端末だけ', async () => {
    const storage = memoryStorage({ [ACCOUNT_KEY]: JSON.stringify({ name: 'midori', games: ['go'], dirty: false }) });
    const { favorites } = setup({ user: 'aoi', storage });
    assert.deepEqual(favorites.list(), []);
    const offline = setup({ user: 'aoi', url: null });
    offline.favorites.toggle('azul');
    await offline.favorites.sync();
    assert.deepEqual(offline.server.calls, []);
    assert.deepEqual(JSON.parse(offline.storage.getItem(LOCAL_KEY)), ['azul']);
});

test('壊れた保存の中身は空として読み、変わったら知らせる', async () => {
    const { favorites } = setup({ storage: memoryStorage({ [LOCAL_KEY]: '{' }) });
    assert.deepEqual(favorites.list(), []);
    let notified = 0;
    favorites.subscribe(() => notified++);
    favorites.toggle('go');
    assert.equal(notified, 1);
});
