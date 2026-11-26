import { describe, it, expect, afterEach } from 'vitest';
import { resolveOnlineServerUrl, OnlineGameController } from '../client/netplay-lobby.js';

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
