import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const CORE = fs.readFileSync(path.join(import.meta.dirname, '../src/sw-core.js'), 'utf8');
const ORIGIN = 'https://example.github.io';

// service worker の中を、偽の caches・fetch で動かす。ゲームの sw.js と同じく、設定を書いてから本体を読む
function load({ cache = 'azul-v1', precache = ['./', 'index.html'], existing = {}, network = () => new Response('net') } = {}) {
    const stores = new Map(Object.entries(existing).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
    const keyOf = (request) => new URL(typeof request === 'string' ? request : request.url, `${ORIGIN}/azul/sw.js`).href.replace(/\?.*$/, '');
    const open = (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name);
        return {
            match: async (request) => store.get(keyOf(request))?.clone(),
            put: async (request, response) => { store.set(keyOf(request), response); },
            add: async (request) => { store.set(keyOf(request), await fetchFn(request)); },
            addAll: async (requests) => { for (const request of requests) store.set(keyOf(request), await fetchFn(request)); }
        };
    };
    const caches = {
        open: async (name) => open(name),
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        match: async (request) => {
            for (const name of stores.keys()) {
                const hit = await open(name).match(request);
                if (hit) return hit;
            }
            return undefined;
        }
    };
    const fetchFn = async (request) => network(typeof request === 'string' ? request : request.url);
    const listeners = {};
    const self = {
        location: new URL(`${ORIGIN}/azul/sw.js`),
        addEventListener: (type, fn) => { listeners[type] = fn; },
        skipWaiting: async () => {},
        clients: { claim: async () => {} }
    };
    const context = vm.createContext({ self, caches, fetch: fetchFn, URL, Response, Promise });
    vm.runInContext(`const CACHE = ${JSON.stringify(cache)}; const PRECACHE = ${JSON.stringify(precache)};\n${CORE}`, context);
    const dispatch = async (type, event = {}) => {
        let waited, responded;
        listeners[type]({ ...event, waitUntil: (p) => { waited = p; }, respondWith: (p) => { responded = p; } });
        await waited;
        return responded;
    };
    return { stores, dispatch };
}

const get = (url, mode = 'no-cors') => ({ request: { method: 'GET', url: new URL(url, `${ORIGIN}/azul/`).href, mode } });

describe('install と activate', () => {
    it('install で PRECACHE を同じ名前のキャッシュに入れ、前からある分は残す（名前を変えないので、前の版の service worker が入れた分も使える）', async () => {
        const { stores, dispatch } = load({ existing: { 'azul-v1': { [`${ORIGIN}/azul/js/old.js`]: new Response('old') } } });
        await dispatch('install');
        expect([...stores.get('azul-v1').keys()].sort()).toEqual([`${ORIGIN}/azul/`, `${ORIGIN}/azul/index.html`, `${ORIGIN}/azul/js/old.js`]);
    });

    it('activate で消すのは、このゲームの別の版だけ（ほかのゲームのキャッシュは消さない）', async () => {
        const { stores, dispatch } = load({ existing: { 'azul-v0': {}, 'azul-v1': {}, 'azul-solo-v1': {}, 'chess-v1': {} } });
        await dispatch('activate');
        expect([...stores.keys()].sort()).toEqual(['azul-solo-v1', 'azul-v1', 'chess-v1']);
    });
});

describe('fetch', () => {
    it('自分のファイルはネットワークを先に使い、取れたものをキャッシュに入れる', async () => {
        const { stores, dispatch } = load();
        const response = await dispatch('fetch', get('js/main.js'));
        expect(await response.text()).toBe('net');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(stores.get('azul-v1').has(`${ORIGIN}/azul/js/main.js`)).toBe(true);
    });

    it('つながらないときはキャッシュから返し、画面の移動でなければ index.html にも頼らない', async () => {
        const offline = () => { throw new TypeError('offline'); };
        const { dispatch } = load({ network: offline, existing: { 'azul-v1': { [`${ORIGIN}/azul/js/main.js`]: new Response('cached'), [`${ORIGIN}/azul/index.html`]: new Response('page') } } });
        expect(await (await dispatch('fetch', get('js/main.js?v=2'))).text()).toBe('cached');
        expect(await (await dispatch('fetch', get('?room=ABCD', 'navigate'))).text()).toBe('page');
        expect((await dispatch('fetch', get('js/none.js'))).type).toBe('error');
    });

    it('字体はキャッシュを先に使い、ほかのサイトと GET 以外は扱わない', async () => {
        const font = 'https://fonts.gstatic.com/s/x.woff2';
        const { dispatch } = load({ existing: { 'azul-v1': { [font]: new Response('font') } }, network: () => { throw new Error('not used'); } });
        expect(await (await dispatch('fetch', { request: { method: 'GET', url: font, mode: 'cors' } })).text()).toBe('font');
        expect(await dispatch('fetch', { request: { method: 'GET', url: 'https://other.example/x.js', mode: 'cors' } })).toBeUndefined();
        expect(await dispatch('fetch', { request: { method: 'POST', url: `${ORIGIN}/azul/api`, mode: 'cors' } })).toBeUndefined();
    });
});

describe('cache-urls', () => {
    it('ページが読んだファイルのうち、自分のものと字体だけをキャッシュに入れる', async () => {
        const { stores, dispatch } = load();
        await dispatch('message', { data: { type: 'cache-urls', urls: [`${ORIGIN}/azul/js/a.js`, 'https://fonts.googleapis.com/css2', 'https://other.example/x.js'] } });
        expect([...stores.get('azul-v1').keys()].sort()).toEqual([`${ORIGIN}/azul/js/a.js`, 'https://fonts.googleapis.com/css2']);
    });
});
