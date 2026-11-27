import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { once } from 'node:events';
import { startMultiDevServer } from '../server/dev-server.js';

// ブラウザの localStorage と location をまねる（モジュールを読む前に置く）
const memory = new Map();
globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key)
};
globalThis.location = new URL('https://example.github.io/web-games/azul/');

const stats = await import('../client/user-stats.js');
const { login, logout, currentUser, recordResult, flushResults, pendingResults, fetchStats, outcomeFromWinners, resolveStatsUrl, NAME_KEY } = stats;

// 返事を順に決められる fetch（送られた本文を残す）
function fakeFetch(statuses) {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
        calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
        const status = statuses.length > 1 ? statuses.shift() : statuses[0];
        if (status === 'offline') throw new TypeError('Failed to fetch');
        return { status, ok: status >= 200 && status < 300, json: async () => ({ name: 'あお', games: {} }) };
    };
    return { calls, fetchImpl };
}

beforeEach(() => memory.clear());

describe('ログイン', () => {
    it('名前は揃えてロビーと同じ場所に入れ、ログアウトで消す', () => {
        expect(login('  ＡＯＩ ')).toBe('AOI');
        expect(memory.get(NAME_KEY)).toBe('AOI');
        expect(currentUser()).toBe('AOI');
        expect(login('   ')).toBe('');
        logout();
        expect(currentUser()).toBe('');
    });
});

describe('結果の待ち行列', () => {
    it('ログインしていなければ記録しない。同じ id は1つだけ入れる', () => {
        expect(recordResult({ game: 'azul', id: 'azul-000001', outcome: 'win' })).toBe(false);
        login('あお');
        expect(recordResult({ game: 'azul', id: 'azul-000001', outcome: 'win' })).toBe(true);
        expect(recordResult({ game: 'azul', id: 'azul-000001', outcome: 'win' })).toBe(false);
        expect(pendingResults()).toMatchObject([{ id: 'azul-000001', name: 'あお', game: 'azul', outcome: 'win' }]);
    });

    it('送れたもの・断られたもの（4xx）は消し、つながらない・サーバーの失敗は残して次に送り直す', async () => {
        login('あお');
        recordResult({ game: 'azul', id: 'azul-000001', outcome: 'win', name: 'あお' });
        recordResult({ game: 'azul', id: 'azul-000002', outcome: 'bogus', name: 'あお' });
        recordResult({ game: 'azul', id: 'azul-000003', outcome: 'loss', name: 'あお' });
        await flushResults({ fetchImpl: fakeFetch(['offline']).fetchImpl, url: 'https://api.example' }); // 記録したときの送信を待つ
        expect(pendingResults()).toHaveLength(3);

        const offline = fakeFetch(['offline']);
        expect(await flushResults({ fetchImpl: offline.fetchImpl, url: 'https://api.example' })).toBe(0);
        expect(pendingResults()).toHaveLength(3);

        const flaky = fakeFetch([200, 500]);
        expect(await flushResults({ fetchImpl: flaky.fetchImpl, url: 'https://api.example' })).toBe(1);
        expect(flaky.calls[0]).toEqual({ url: 'https://api.example/results', body: { id: 'azul-000001', name: 'あお', game: 'azul', outcome: 'win' } });
        expect(flaky.calls[1].body.outcome).toBeNull(); // 知らない結果は回数だけ
        expect(pendingResults().map(r => r.id)).toEqual(['azul-000002', 'azul-000003']);

        const back = fakeFetch([400, 200]);
        expect(await flushResults({ fetchImpl: back.fetchImpl, url: 'https://api.example' })).toBe(1);
        expect(pendingResults()).toEqual([]);
    });

    it('送り先がなければ（公開したページで未設定）送らずに残す', async () => {
        login('あお');
        recordResult({ game: 'azul', id: 'azul-000009', outcome: 'draw' });
        expect(await flushResults({ fetchImpl: fakeFetch([200]).fetchImpl, url: null })).toBe(0);
        expect(pendingResults()).toHaveLength(1);
    });
});

describe('そのほか', () => {
    it('勝った席の一覧から結果を決める（全員なら引き分け）', () => {
        expect(outcomeFromWinners([0], 0, 2)).toBe('win');
        expect(outcomeFromWinners([1], 0, 2)).toBe('loss');
        expect(outcomeFromWinners([0, 1], 0, 2)).toBe('draw');
        expect(outcomeFromWinners([0, 1], 0, 3)).toBe('win');
        expect(outcomeFromWinners([], 0, 2)).toBeNull();
    });

    it('記録の API の場所：公開したページは配備先、?stats= と手元の ?server= を優先する', () => {
        expect(resolveStatsUrl({ deployed: 'https://api.example' })).toBe('https://api.example');
        expect(resolveStatsUrl({ deployed: '' })).toBeNull();
        globalThis.location = new URL('http://localhost:5000/azul/?server=ws%3A%2F%2Flocalhost%3A9123');
        expect(resolveStatsUrl()).toBe('http://localhost:9123');
        globalThis.location = new URL('http://localhost:5000/azul/');
        expect(resolveStatsUrl()).toBe('http://localhost:8787');
        globalThis.location = new URL('https://example.github.io/azul/?stats=https://x.example/');
        expect(resolveStatsUrl()).toBe('https://x.example');
        globalThis.location = new URL('https://example.github.io/web-games/azul/');
    });

    it('待っている部屋の一覧を GET /rooms で読み、読めなければ null', async () => {
        const rooms = [{ game: 'azul', roomCode: '1234', hostName: 'あお', players: 1, maxPlayers: 4 }];
        const ok = { calls: [], fetchImpl: async (url) => { ok.calls.push(url); return { ok: true, status: 200, json: async () => ({ rooms }) }; } };
        expect(await stats.fetchOpenRooms({ fetchImpl: ok.fetchImpl, url: 'https://api.example' })).toEqual(rooms);
        expect(ok.calls).toEqual(['https://api.example/rooms']);
        expect(await stats.fetchOpenRooms({ fetchImpl: fakeFetch([404]).fetchImpl, url: 'https://api.example' })).toBeNull();
        expect(await stats.fetchOpenRooms({ fetchImpl: fakeFetch(['offline']).fetchImpl, url: 'https://api.example' })).toBeNull();
        expect(await stats.fetchOpenRooms({ fetchImpl: ok.fetchImpl, url: null })).toBeNull();
    });

    it('記録の読み込みに失敗したら null', async () => {
        expect(await fetchStats('あお', { fetchImpl: fakeFetch([500]).fetchImpl, url: 'https://api.example' })).toBeNull();
        expect(await fetchStats('あお', { fetchImpl: fakeFetch(['offline']).fetchImpl, url: 'https://api.example' })).toBeNull();
        expect(await fetchStats('', { fetchImpl: fakeFetch([200]).fetchImpl, url: 'https://api.example' })).toBeNull();
    });
});

describe('手元のテスト用サーバーの記録の API（通し）', () => {
    let dev;
    afterAll(() => dev?.close());

    it('同じポートの HTTP で、送った結果が記録として読める', async () => {
        dev = startMultiDevServer({ port: 0, log: () => {}, load: () => null });
        await once(dev.server, 'listening');
        const url = `http://localhost:${dev.server.address().port}`;
        login('みどり');
        recordResult({ game: 'seven-wonders', id: 'sw-000001', outcome: 'win' });
        await vi.waitFor(async () => {
            await flushResults({ url });
            expect(pendingResults()).toEqual([]);
        });
        const record = await fetchStats('みどり', { url });
        expect(record.games['seven-wonders']).toMatchObject({ plays: 1, wins: 1, online: 0 });
        const preflight = await fetch(`${url}/results`, { method: 'OPTIONS' });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    });
});
