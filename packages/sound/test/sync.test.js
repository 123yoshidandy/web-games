import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyProblems, main } from '../scripts/sync.mjs';

let repo;

beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-sync-'));
    fs.mkdirSync(path.join(repo, 'js'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    vi.restoreAllMocks();
});

describe('同期', () => {
    it('本体と共通の効果音を js/sound にコピーし、lock を置く', () => {
        expect(main([repo])).toBe(0);
        const files = fs.readdirSync(path.join(repo, 'js/sound')).sort();
        expect(files).toEqual(['effects.js', 'engine.js', 'engine.mjs']);
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'sound.lock.json'), 'utf8'));
        expect(lock.dir).toBe('js/sound');
        expect(Object.keys(lock.files)).toEqual(['js/sound/engine.js', 'js/sound/engine.mjs', 'js/sound/effects.js']);
        expect(fs.readFileSync(path.join(repo, 'js/sound/engine.js'), 'utf8')).toMatch(/^\/\/ packages\/sound .*からコピーしたファイル/);
        expect(fs.readFileSync(path.join(repo, 'js/sound/effects.js'), 'utf8')).toMatch(/^\/\/ packages\/sound .*からコピーしたファイル.*\n[\s\S]*Sound\.register\(Sound\.commonLibrary/);
    });

    it('共通の効果音の写しが手で直されていれば、check は 1 を返す', () => {
        main([repo]);
        fs.appendFileSync(path.join(repo, 'js/sound/effects.js'), '\n// 手で直した\n');
        expect(main(['check', repo])).toBe(1);
        expect(copyProblems(repo)).toEqual(['直されています: js/sound/effects.js']);
    });

    it('public/js があれば、public/js/sound にコピーする', () => {
        fs.mkdirSync(path.join(repo, 'public/js'), { recursive: true });
        expect(main([repo])).toBe(0);
        expect(fs.existsSync(path.join(repo, 'public/js/sound/engine.mjs'))).toBe(true);
    });

    it('手で直されていれば、check は 1 を返し、同期も止まる（--force で上書きする）', () => {
        main([repo]);
        expect(main(['check', repo])).toBe(0);
        fs.appendFileSync(path.join(repo, 'js/sound/engine.js'), '\n// 手で直した\n');
        expect(main(['check', repo])).toBe(1);
        expect(main([repo])).toBe(1);
        expect(main([repo, '--force'])).toBe(0);
        expect(main(['check', repo])).toBe(0);
    });

    it('ゲームの曲（bgm.js）が同じフォルダにあっても、check は通る', () => {
        main([repo]);
        fs.writeFileSync(path.join(repo, 'js/sound/bgm.js'), "Sound.register('game', { songs: {} });\n");
        expect(main(['check', repo])).toBe(0);
        expect(main([repo])).toBe(0);
        expect(fs.existsSync(path.join(repo, 'js/sound/bgm.js'))).toBe(true);
    });

    it('初めて同期する前に、本体の名前のファイルがあれば止める', () => {
        fs.mkdirSync(path.join(repo, 'js/sound'));
        fs.writeFileSync(path.join(repo, 'js/sound/engine.js'), '');
        expect(main([repo])).toBe(1);
    });
});

describe('packages/sound の本体が変わったとき', () => {
    let kitRoot;

    beforeEach(() => {
        kitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-root-'));
        fs.mkdirSync(path.join(kitRoot, 'src'));
        fs.writeFileSync(path.join(kitRoot, 'package.json'), JSON.stringify({ version: '1.0.0' }));
        fs.writeFileSync(path.join(kitRoot, 'src/engine.js'), '// 1\n');
        fs.writeFileSync(path.join(kitRoot, 'src/engine.mjs'), '// 1\n');
        fs.writeFileSync(path.join(kitRoot, 'src/effects.js'), '// 1\n');
    });

    afterEach(() => {
        fs.rmSync(kitRoot, { recursive: true, force: true });
    });

    it('check は、古い写しを 1 で知らせ、同期すれば通る', () => {
        expect(main([repo], { kitRoot })).toBe(0);
        expect(main(['check', repo], { kitRoot })).toBe(0);
        fs.writeFileSync(path.join(kitRoot, 'src/engine.js'), '// 2\n');
        expect(main(['check', repo], { kitRoot })).toBe(1);
        expect(main([repo], { kitRoot })).toBe(0);
        expect(main(['check', repo], { kitRoot })).toBe(0);
        expect(fs.readFileSync(path.join(repo, 'js/sound/engine.js'), 'utf8')).toMatch(/\/\/ 2\n$/);
    });

    it('copyProblems は、lock がない・手で直された・古い写しを、それぞれ知らせる', () => {
        expect(copyProblems(repo, kitRoot)).toEqual(['sound.lock.json がありません']);
        main([repo], { kitRoot });
        expect(copyProblems(repo, kitRoot)).toEqual([]);
        fs.writeFileSync(path.join(kitRoot, 'src/engine.mjs'), '// 2\n');
        expect(copyProblems(repo, kitRoot)).toEqual(['古い: js/sound/engine.mjs']);
        fs.appendFileSync(path.join(repo, 'js/sound/engine.js'), '// 手で直した\n');
        expect(copyProblems(repo, kitRoot)).toEqual(['直されています: js/sound/engine.js']);
    });

    it('エンジンだけを同期した前の版のゲームは、check で知らせ、同期すれば共通の効果音が加わる', () => {
        main([repo], { kitRoot });
        // 前の版の lock（effects.js がない）に戻す
        const lockFile = path.join(repo, 'sound.lock.json');
        const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        delete lock.files['js/sound/effects.js'];
        fs.writeFileSync(lockFile, JSON.stringify(lock));
        fs.rmSync(path.join(repo, 'js/sound/effects.js'));
        expect(main(['check', repo], { kitRoot })).toBe(1);
        expect(copyProblems(repo, kitRoot)).toEqual(['コピーするファイルが変わりました（engine.js・engine.mjs）']);
        expect(main([repo], { kitRoot })).toBe(0);
        expect(fs.existsSync(path.join(repo, 'js/sound/effects.js'))).toBe(true);
        expect(main(['check', repo], { kitRoot })).toBe(0);
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
        gamesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-games-'));
        fs.mkdirSync(path.join(gamesRoot, 'some-game/public/js'), { recursive: true });
        fs.mkdirSync(path.join(gamesRoot, 'other-game/public/js'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(gamesRoot, { recursive: true, force: true });
    });

    it('フォルダ名だけで指定できる', () => {
        expect(main(['some-game'], { gamesRoot })).toBe(0);
        const lock = JSON.parse(fs.readFileSync(path.join(gamesRoot, 'some-game/sound.lock.json'), 'utf8'));
        expect(lock.dir).toBe('public/js/sound');
        expect(main(['check', 'some-game'], { gamesRoot })).toBe(0);
    });

    it('ないフォルダ名なら止める', () => {
        expect(main(['no-such-game'], { gamesRoot })).toBe(2);
    });

    it('check --all は、lock を持つゲームだけを確かめる', () => {
        expect(main(['check', '--all'], { gamesRoot })).toBe(0);
        main(['some-game'], { gamesRoot });
        expect(main(['check', '--all'], { gamesRoot })).toBe(0);
        fs.appendFileSync(path.join(gamesRoot, 'some-game/public/js/sound/engine.mjs'), '\n// 手で直した\n');
        expect(main(['check', '--all'], { gamesRoot })).toBe(1);
    });
});
