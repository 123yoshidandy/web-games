import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyProblems, main } from '../scripts/sync.mjs';

let repo;

beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-sync-'));
    fs.mkdirSync(path.join(repo, 'public/js'), { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    vi.restoreAllMocks();
});

describe('同期', () => {
    it('本体を public/js にコピーし、lock を置く。写しもそのまま読み込める', async () => {
        expect(main([repo])).toBe(0);
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'pwa.lock.json'), 'utf8'));
        expect(lock.dir).toBe('public/js');
        expect(Object.keys(lock.files)).toEqual(['public/js/sw-core.js', 'public/js/pwa.js', 'public/js/pwa.mjs']);
        const copy = path.join(repo, 'public/js/pwa.mjs');
        expect(fs.readFileSync(copy, 'utf8')).toMatch(/^\/\/ packages\/pwa .*からコピーしたファイル/);
        const { preventZoom, registerServiceWorker } = await import(copy);
        expect(typeof preventZoom).toBe('function');
        expect(typeof registerServiceWorker).toBe('function');
    });

    it('public/ がなければ js にコピーする', () => {
        fs.rmSync(path.join(repo, 'public'), { recursive: true });
        fs.mkdirSync(path.join(repo, 'js'));
        expect(main([repo])).toBe(0);
        expect(fs.existsSync(path.join(repo, 'js/sw-core.js'))).toBe(true);
    });

    it('手で直されていれば、check は 1 を返し、同期も止まる（--force で上書きする）', () => {
        main([repo]);
        expect(main(['check', repo])).toBe(0);
        fs.appendFileSync(path.join(repo, 'public/js/sw-core.js'), '\n// 手で直した\n');
        expect(main(['check', repo])).toBe(1);
        expect(copyProblems(repo)).toEqual(['直されています: public/js/sw-core.js']);
        expect(main([repo])).toBe(1);
        expect(main([repo, '--force'])).toBe(0);
        expect(main(['check', repo])).toBe(0);
    });

    it('初めて同期する前に、同じ名前のファイルがあれば止める（--force で置き換える）', () => {
        fs.writeFileSync(path.join(repo, 'public/js/sw-core.js'), '');
        expect(main([repo])).toBe(1);
        expect(main([repo, '--force'])).toBe(0);
    });
});

describe('packages/pwa の本体が変わったとき', () => {
    let kitRoot;

    beforeEach(() => {
        kitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-root-'));
        fs.mkdirSync(path.join(kitRoot, 'src'));
        fs.writeFileSync(path.join(kitRoot, 'package.json'), JSON.stringify({ version: '1.0.0' }));
        for (const name of ['sw-core.js', 'pwa.js', 'pwa.mjs']) fs.writeFileSync(path.join(kitRoot, 'src', name), '// 1\n');
    });

    afterEach(() => {
        fs.rmSync(kitRoot, { recursive: true, force: true });
    });

    it('check は、古い写しを 1 で知らせ、同期すれば通る', () => {
        expect(main([repo], { kitRoot })).toBe(0);
        expect(main(['check', repo], { kitRoot })).toBe(0);
        fs.writeFileSync(path.join(kitRoot, 'src/sw-core.js'), '// 2\n');
        expect(main(['check', repo], { kitRoot })).toBe(1);
        expect(copyProblems(repo, kitRoot)).toEqual(['古い: public/js/sw-core.js']);
        expect(main([repo], { kitRoot })).toBe(0);
        expect(main(['check', repo], { kitRoot })).toBe(0);
        expect(fs.readFileSync(path.join(repo, 'public/js/sw-core.js'), 'utf8')).toMatch(/\/\/ 2\n$/);
    });

    it('lock がなければ知らせる', () => {
        expect(copyProblems(repo, kitRoot)).toEqual(['pwa.lock.json がありません']);
        expect(main(['check', repo], { kitRoot })).toBe(1);
    });

    it('版が変わっただけでも、写しの先頭の行が変わるので同期を求める', () => {
        main([repo], { kitRoot });
        fs.writeFileSync(path.join(kitRoot, 'package.json'), JSON.stringify({ version: '1.1.0' }));
        expect(main(['check', repo], { kitRoot })).toBe(1);
    });
});

describe('web-games の games/ の下のゲーム', () => {
    let gamesRoot;

    beforeEach(() => {
        gamesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-games-'));
        fs.mkdirSync(path.join(gamesRoot, 'some-game/public/js'), { recursive: true });
        fs.mkdirSync(path.join(gamesRoot, 'other-game/public/js'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(gamesRoot, { recursive: true, force: true });
    });

    it('フォルダ名だけで指定でき、ないフォルダ名なら止める', () => {
        expect(main(['some-game'], { gamesRoot })).toBe(0);
        expect(main(['check', 'some-game'], { gamesRoot })).toBe(0);
        expect(main(['no-such-game'], { gamesRoot })).toBe(2);
    });

    it('check --all は、lock を持つゲームだけを確かめる', () => {
        expect(main(['check', '--all'], { gamesRoot })).toBe(0);
        main(['some-game'], { gamesRoot });
        expect(main(['check', '--all'], { gamesRoot })).toBe(0);
        fs.appendFileSync(path.join(gamesRoot, 'some-game/public/js/sw-core.js'), '\n// 手で直した\n');
        expect(main(['check', '--all'], { gamesRoot })).toBe(1);
    });
});
