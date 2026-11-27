import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { resolveOnlineServerUrl, OnlineGameController, NetplayLobby } from '../client/netplay-lobby.js';
import NetplayClient from '../client/netplay-client.mjs';
import { startDevServer } from '../server/dev-server.js';
import raceGame from '../examples/race-game.js';
import { installFakeDom, visibleText } from './fixtures/fake-dom.mjs';

const at = (href) => { globalThis.location = new URL(href); };

describe('resolveOnlineServerUrl（オンラインの接続先）', () => {
    afterEach(() => { delete globalThis.location; });

    it('手元（localhost・127.0.0.1）では、手元のテスト用サーバーに ?game= を付けてつなぐ', () => {
        at('http://localhost:5173/');
        expect(resolveOnlineServerUrl({ game: 'azul', deployed: '' })).toBe('ws://localhost:8787/?game=azul');
        at('http://127.0.0.1:5173/');
        expect(resolveOnlineServerUrl({ game: 'azul', deployed: 'wss://x.example/prod' })).toBe('ws://localhost:8787/?game=azul');
    });

    it('公開したページでは、配備先に ?game= を付ける。配備先が空なら null（オンラインのボタンを隠す）', () => {
        at('https://123yoshidandy.github.io/web-games/azul/');
        expect(resolveOnlineServerUrl({ game: 'azul', deployed: 'wss://x.example/prod' })).toBe('wss://x.example/prod?game=azul');
        expect(resolveOnlineServerUrl({ game: 'azul', deployed: '' })).toBeNull();
    });

    it('?server= があればそれを使い、?game= が付いていればそのまま', () => {
        at(`https://123yoshidandy.github.io/web-games/azul/?server=${encodeURIComponent('ws://localhost:9999')}`);
        expect(resolveOnlineServerUrl({ game: 'azul', deployed: '' })).toBe('ws://localhost:9999/?game=azul');
        at(`https://example.com/?server=${encodeURIComponent('wss://y.example/prod?game=go')}`);
        expect(resolveOnlineServerUrl({ game: 'azul' })).toBe('wss://y.example/prod?game=go');
    });
});

describe('OnlineGameController（ローカル対戦と同じ形）', () => {
    it('isOnline で見分けられ、ローカル対戦だけの操作は何もしない', () => {
        const controller = new OnlineGameController({ serverUrl: 'ws://localhost:1/?game=x', storageKey: 'test.lobby' });
        expect(controller.isOnline).toBe(true);
        expect(controller.getView()).toBeNull();
        expect(controller.hint()).toBeNull();
        expect(controller.undo()).toBe(false);
        expect(() => { controller.pause(); controller.resume(); controller.stop(); }).not.toThrow();
    });
});

// 条件を満たすまで待つ
async function waitFor(check, timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (check()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('待ちきれませんでした');
}

describe('NetplayLobby の画面（部屋はすべて公開で、部屋番号は出さない）', () => {
    let dev;
    let url;
    let dom;
    const opened = [];

    beforeAll(() => {
        const port = 21787 + Math.floor(Math.random() * 1000);
        dev = startDevServer(raceGame, { port, log: () => {} });
        url = `ws://localhost:${port}`;
    });
    afterAll(() => dev.close());
    afterEach(() => {
        opened.splice(0).forEach(item => item.close());
        dom?.restore();
        dom = null;
    });

    const settings = [{ key: 'winsNeeded', label: '勝ち数', options: [{ value: 2, label: '2勝' }, { value: 3, label: '3勝' }] }];
    const newLobby = (options = {}) => {
        const lobby = new NetplayLobby({ title: 'はやとき', game: 'race', serverUrl: url, storageKey: 'test.lobby', settings, ...options });
        opened.push({ close: () => lobby.controller?.net.close() });
        return lobby;
    };
    const newClient = (storageKey) => {
        const client = new NetplayClient({ serverUrl: url, storageKey });
        opened.push(client);
        return client;
    };
    const card = (lobby) => lobby.root.querySelector('.np-card');

    it('入口に部屋番号の欄と公開の選択はなく、開くと参加できる部屋の一覧を取る（名前・人数・設定を出し、部屋番号は出さない）', async () => {
        dom = installFakeDom({ storage: { 'netplay.name': 'みどり' } });
        const host = newClient('test.lobby.host');
        await host.createRoom('あお');
        await waitFor(() => host.lobby);
        const code = host.lobby.roomCode;

        const lobby = newLobby();
        lobby.open();
        const html = card(lobby);
        expect(html.querySelector('[data-ref="code"]')).toBeNull();
        expect(html.querySelector('[data-ref="public"]')).toBeNull();
        expect(html.textContent).not.toContain('部屋番号');
        expect(html.textContent).not.toContain('公開');
        await waitFor(() => lobby.ref('rooms').querySelector('button'));
        const text = visibleText(html);
        expect(text).toContain('あお の部屋');
        expect(text).toContain('1/4人・勝ち数：3勝');
        expect(text).not.toContain(code);

        // 一覧の部屋を押すと入れる。待合室にも部屋番号は出ない
        lobby.ref('rooms').querySelector('button').click();
        await waitFor(() => lobby.mode === 'lobby' && host.lobby.players.length === 2);
        expect(lobby.controller.lobby.roomCode).toBe(code);
        const lobbyText = visibleText(html);
        expect(lobbyText).toContain('みどり');
        expect(lobbyText).not.toContain(code);
    });

    it('入口の「戻る」は、部屋に入っていなければ、一覧を取るための接続を閉じて入口を閉じるだけ（onExit は呼ばない）', async () => {
        dom = installFakeDom({ storage: { 'netplay.name': 'あお' } });
        let exited = 0;
        const lobby = newLobby({ onExit: () => { exited++; } });
        lobby.open();
        await waitFor(() => lobby.controller?.net.isOpen());
        const net = lobby.controller.net;
        lobby.root.querySelector('[data-act="close"]').click();
        expect(lobby.root.hidden).toBe(true);
        expect(lobby.mode).toBe('closed');
        expect(lobby.controller).toBeNull();
        expect(exited).toBe(0);
        await waitFor(() => !net.isOpen());
    });

    it('部屋を作ると公開の部屋になり、待合室と招待の文に部屋番号を出さない（招待URLには入る）', async () => {
        dom = installFakeDom({ storage: { 'netplay.name': 'あお' } });
        const lobby = newLobby();
        lobby.open();
        lobby.root.querySelector('[data-act="create"]').click();
        await waitFor(() => lobby.mode === 'lobby');
        const code = lobby.controller.lobby.roomCode;
        expect(lobby.controller.lobby.public).toBe(true);
        expect(visibleText(card(lobby))).not.toContain(code);

        const finder = newClient('test.lobby.finder');
        expect((await finder.listRooms()).find(room => room.roomCode === code)?.hostName).toBe('あお');

        lobby.root.querySelector('[data-act="invite"]').click();
        await waitFor(() => dom.shared.length === 1);
        expect(dom.shared[0].text).toBe('はやときの部屋に招待します');
        expect(dom.shared[0].text).not.toContain(code);
        expect(new URL(dom.shared[0].url).searchParams.get('room')).toBe(code);
        expect(visibleText(card(lobby))).not.toContain(code);
    });

    it('招待URLで開くと、名前がわかればそのまま入る。名前がなければ、部屋番号を出さずに名前と「参加する」だけを出す', async () => {
        dom = installFakeDom();
        const host = newClient('test.lobby.host2');
        await host.createRoom('あお');
        await waitFor(() => host.lobby);
        const code = host.lobby.roomCode;
        dom.restore();

        // 名前がわからない
        dom = installFakeDom({ href: `http://localhost:5173/?room=${code}` });
        const first = newLobby();
        expect(await first.boot()).toBe(true);
        const html = card(first);
        expect(first.root.querySelector('#np-title').textContent).toBe('はやとき：招待された部屋に参加');
        expect(first.ref('join-row').hidden).toBe(false);
        expect(first.ref('find-row').hidden).toBe(true);
        expect(first.ref('create-row').hidden).toBe(true);
        expect(visibleText(html)).not.toContain(code);
        first.ref('name').value = 'きいろ';
        first.root.querySelector('[data-act="join"]').click();
        await waitFor(() => first.mode === 'lobby' && host.lobby.players.length === 2);
        expect(visibleText(html)).not.toContain(code);
        dom.restore();

        // 名前がわかる
        dom = installFakeDom({ href: `http://localhost:5173/?room=${code}`, storage: { 'netplay.name': 'みどり' } });
        const second = newLobby({ storageKey: 'test.lobby.second' });
        expect(await second.boot()).toBe(true);
        await waitFor(() => second.mode === 'lobby' && host.lobby.players.length === 3);
        expect(visibleText(card(second))).not.toContain(code);
    });
});
