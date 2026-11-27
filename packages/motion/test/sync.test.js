import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyProblems, main } from '../scripts/sync.mjs';

let repo;

beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-sync-'));
    fs.mkdirSync(path.join(repo, 'public/js'), { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    vi.restoreAllMocks();
});

describe('同期', () => {
    it('本体を public/js/motion にコピーし、lock を置く', () => {
        expect(main([repo])).toBe(0);
        expect(fs.readdirSync(path.join(repo, 'public/js/motion'))).toEqual(['motion.js']);
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'motion.lock.json'), 'utf8'));
        expect(lock.dir).toBe('public/js/motion');
        expect(fs.readFileSync(path.join(repo, 'public/js/motion/motion.js'), 'utf8')).toMatch(/^\/\/ packages\/motion .*からコピーしたファイル/);
        expect(main(['check', repo])).toBe(0);
        expect(copyProblems(repo)).toEqual([]);
    });

    it('写しが手で直されていれば、check は 1 を返し、同期も止まる', () => {
        main([repo]);
        fs.appendFileSync(path.join(repo, 'public/js/motion/motion.js'), '\n// 手で直した\n');
        expect(main(['check', repo])).toBe(1);
        expect(copyProblems(repo)).toEqual(['直されています: public/js/motion/motion.js']);
        expect(main([repo])).toBe(1);
        expect(main([repo, '--force'])).toBe(0);
    });
});
