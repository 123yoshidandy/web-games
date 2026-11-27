import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyProblems, main, LOCK_FILE } from '../scripts/sync.mjs';

let root;
let repo;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-kit-sync-'));
    repo = path.join(root, 'sample');
    fs.mkdirSync(path.join(repo, 'public/js'), { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
});

const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');

describe('同期', () => {
    it('client/ の下を同じ並びで public/ にコピーし、lock を置く', () => {
        expect(main([repo])).toBe(0);
        const lock = JSON.parse(read(LOCK_FILE));
        expect(lock.dir).toBe('public');
        expect(Object.keys(lock.files)).toEqual(expect.arrayContaining([
            'public/js/main.js', 'public/js/session.js', 'public/js/race.js', 'public/js/race-definition.js',
            'public/js/puzzles/registry.js', 'public/js/puzzles/common/dom.js', 'public/css/style.css'
        ]));
        expect(read('public/js/session.js')).toMatch(/^\/\/ packages\/puzzle-kit .*からコピーしたファイル/);
        expect(read('public/css/style.css')).toMatch(/^\/\* packages\/puzzle-kit .*からコピーしたファイル.*\*\/\n/);
    });

    it('ゲームの持つファイル（game.js・種類のフォルダ）には触れず、あっても check は通る', () => {
        fs.writeFileSync(path.join(repo, 'public/js/game.js'), 'export default {};\n');
        fs.mkdirSync(path.join(repo, 'public/js/puzzles/sample'), { recursive: true });
        fs.writeFileSync(path.join(repo, 'public/js/puzzles/sample/index.js'), 'export default {};\n');
        expect(main([repo])).toBe(0);
        expect(read('public/js/game.js')).toBe('export default {};\n');
        expect(main(['check', repo])).toBe(0);
        expect(copyProblems(repo)).toEqual([]);
    });

    it('手で直されていれば、check は 1 を返し、同期も止まる（--force で上書きする）', () => {
        main([repo]);
        fs.appendFileSync(path.join(repo, 'public/js/race.js'), '\n// 手で直した\n');
        expect(main(['check', repo])).toBe(1);
        expect(copyProblems(repo)).toEqual(['直されています: public/js/race.js']);
        expect(main([repo])).toBe(1);
        expect(main([repo, '--force'])).toBe(0);
        expect(main(['check', repo])).toBe(0);
    });

    it('lock なしで同じ名前のファイルがあれば、初めての同期は止まる', () => {
        fs.writeFileSync(path.join(repo, 'public/js/session.js'), '// 前からあるファイル\n');
        expect(main([repo])).toBe(1);
        expect(main([repo, '--force'])).toBe(0);
    });

    it('lock がなければ check は 1。フォルダ名だけでも games/ の下から探す。check --all はすべて確かめる', () => {
        expect(main(['check', repo])).toBe(1);
        expect(copyProblems(repo)).toEqual([`${LOCK_FILE} がありません`]);
        expect(main(['sample'], { gamesRoot: root })).toBe(0);
        expect(main(['check', '--all'], { gamesRoot: root })).toBe(0);
        fs.appendFileSync(path.join(repo, 'public/js/main.js'), '\n// 手で直した\n');
        expect(main(['check', '--all'], { gamesRoot: root })).toBe(1);
    });
});
