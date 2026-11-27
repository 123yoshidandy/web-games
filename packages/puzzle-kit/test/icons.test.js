import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeIcons, findChrome, ICON_FILES } from '../tools/icons.mjs';

const ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="12" y="12" width="40" height="40" fill="#34508c"/></svg>';
// PNG の幅と高さ（IHDR）
const pngSize = (file) => {
    const data = fs.readFileSync(file);
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
};

let root;
let savedTmp;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-kit-icons-test-'));
    fs.mkdirSync(path.join(root, 'public'));
    fs.mkdirSync(path.join(root, 'tmp'));
    savedTmp = process.env.TMPDIR;
    process.env.TMPDIR = path.join(root, 'tmp');
});

afterEach(() => {
    if (savedTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmp;
    fs.rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!findChrome())('アイコン', () => {
    it('TMPDIR の下の空のプロフィールで描き、6つのファイルを書いて、一時フォルダを消す', () => {
        const publicDir = path.join(root, 'public');
        expect(makeIcons({ publicDir, art: ART })).toEqual(ICON_FILES);
        expect(fs.readdirSync(publicDir).sort()).toEqual([...ICON_FILES].sort());
        expect(pngSize(path.join(publicDir, 'favicon.png'))).toEqual([64, 64]);
        expect(pngSize(path.join(publicDir, 'apple-touch-icon.png'))).toEqual([180, 180]);
        expect(pngSize(path.join(publicDir, 'icon-maskable-512.png'))).toEqual([512, 512]);
        expect(fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8')).toContain('rx="14"');
        expect(fs.readdirSync(path.join(root, 'tmp'))).toEqual([]);
    }, 120000);

    it('Chrome が描けなければ投げる', () => {
        expect(() => makeIcons({ publicDir: path.join(root, 'public'), art: ART, chrome: '/usr/bin/false' })).toThrow(/描けませんでした/);
    });
});
