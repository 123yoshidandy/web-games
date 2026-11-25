import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// service worker（public/sw.js）を、キャッシュとネットワークを差し替えた入れ物で動かす
const ORIGIN = 'https://example.github.io';
const BASE = `${ORIGIN}/shogi/public/`;
const PUBLIC = path.join(import.meta.dirname, '..', 'public');

function loadWorker() {
    const store = new Map(); // URL → 中身
    let online = true;
    const listeners = {};
    const key = (req) => new URL(typeof req === 'string' ? req : req.url, BASE).href;
    const respond = (body) => ({ ok: true, body, clone() { return respond(body); } });
    const cache = {
        addAll: async (urls) => urls.forEach(u => store.set(key(u), `cached:${new URL(key(u)).pathname}`)),
        add: async (u) => store.set(key(u), 'cached'),
        put: async (req, res) => store.set(key(req), res.body),
        match: async (req, opts = {}) => {
            const k = opts.ignoreSearch ? key(req).split('?')[0] : key(req);
            return store.has(k) ? respond(store.get(k)) : undefined;
        }
    };
    const self = {
        location: new URL(`${BASE}sw.js`),
        addEventListener: (type, fn) => { listeners[type] = fn; },
        skipWaiting: () => {},
        clients: { claim: () => {} }
    };
    const context = {
        self, URL, Promise,
        caches: { open: async () => cache, keys: async () => ['shogi-v1'], delete: async () => true, match: (req, opts) => cache.match(req, opts) },
        fetch: async (req) => {
            if (!online) throw new TypeError('offline');
            return respond(`network:${new URL(key(req)).pathname}`);
        },
        Response: { error: () => ({ ok: false, error: true }) }
    };
    vm.runInNewContext(fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8'), context);
    const run = async (type, event) => {
        const waits = [];
        let response;
        listeners[type]({ ...event, waitUntil: (p) => waits.push(p), respondWith: (p) => { response = p; } });
        await Promise.all(waits);
        return response;
    };
    const request = (url, mode = 'no-cors') => ({ url: new URL(url, BASE).href, method: 'GET', mode });
    return { run, request, store, goOffline: () => { online = false; } };
}

describe('オフラインでの起動', () => {
    it('入れたときに、画面のファイルを先にキャッシュに入れる', async () => {
        const w = loadWorker();
        await w.run('install', {});
        ['index.html', 'js/main.js', 'js/game.js', 'js/ui.js', 'css/style.css', 'manifest.webmanifest']
            .forEach(f => expect(w.store.has(new URL(f, BASE).href), f).toBe(true));
    });

    it('ネットワークが切れても、ページと JS をキャッシュから返す', async () => {
        const w = loadWorker();
        await w.run('install', {});
        w.goOffline();
        const page = await (await w.run('fetch', { request: w.request('./', 'navigate') }));
        expect(page.body).toContain('/shogi/public/');
        // 知らないページを開いても、index.html を返す
        const other = await w.run('fetch', { request: w.request('./?seed=1', 'navigate') });
        expect(other.ok).toBe(true);
        const js = await w.run('fetch', { request: w.request('js/game.js') });
        expect(js.body).toBe('cached:/shogi/public/js/game.js');
        const missing = await w.run('fetch', { request: w.request('js/none.js') });
        expect(missing.error).toBe(true);
    });

    it('つながっているときは、ネットワークを先に使い、キャッシュを新しくする', async () => {
        const w = loadWorker();
        await w.run('install', {});
        const js = await w.run('fetch', { request: w.request('js/ui.js') });
        expect(js.body).toBe('network:/shogi/public/js/ui.js');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(w.store.get(new URL('js/ui.js', BASE).href)).toBe('network:/shogi/public/js/ui.js');
    });
});
