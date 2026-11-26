import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadEngine } from '../tools/lint-songs.mjs';
import { COMMON_LIBRARY, EFFECTS_FILE, LONG_EFFECTS, MAX_SECONDS, LONG_MAX_SECONDS, definitionProblems } from '../tools/effects.mjs';
import { fakeContext } from './fake-audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = {};
const Sound = loadEngine([EFFECTS_FILE], sandbox);
const { effects, targets } = Sound.library(COMMON_LIBRARY);
const NAMES = Object.keys(effects);

// README の「共通の効果音」の表に書いた名前（ゲームに組み込むときは、この表に従う）
function readmeNames() {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const section = readme.split('\n## ').find(text => text.startsWith('共通の効果音'));
    return [...(section ?? '').matchAll(/^\| `([a-z-]+)` \|/gm)].map(match => match[1]);
}

// プレイヤーが使うブラウザの部品を、偽物で置く（音は出さない）
function withBrowser(saved, run) {
    const store = new Map(saved ? [['game.sound', JSON.stringify(saved)]] : []);
    const contexts = [];
    Object.assign(sandbox, {
        window: {
            AudioContext: function () {
                const context = Object.assign(fakeContext(), { state: 'running', destination: {}, resume() {}, suspend() {} });
                contexts.push(context);
                return context;
            }
        },
        document: { hidden: false, addEventListener() {}, removeEventListener() {} },
        navigator: {},
        localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
    });
    try {
        return run({ contexts, store });
    } finally {
        ['window', 'document', 'navigator', 'localStorage'].forEach(key => delete sandbox[key]);
    }
}

describe('共通の効果音', () => {
    it('README の表と、登録した名前が同じ', () => {
        expect(readmeNames()).toEqual(NAMES);
        expect(NAMES.length).toBeGreaterThanOrEqual(10);
    });

    it.each(NAMES)('%s：楽器・記法・長さ・音量の目安が決まりに合う', (id) => {
        expect(definitionProblems(Sound, id)).toEqual([]);
        const length = Sound.effectLength(effects[id]);
        expect(length).toBeGreaterThan(0);
        expect(length).toBeLessThanOrEqual(LONG_EFFECTS.includes(id) ? LONG_MAX_SECONDS : MAX_SECONDS);
        expect(targets[id]).toBeLessThan(-20);
    });

    it.each(NAMES)('%s を鳴らせる（偽の AudioContext で書き出しを通す）', (id) => {
        const context = fakeContext();
        sandbox.OfflineAudioContext = function () { return Object.assign(context, { startRendering: () => Promise.resolve(null), destination: {} }); };
        try {
            expect(() => Sound.renderEffect(effects[id])).not.toThrow();
        } finally {
            delete sandbox.OfflineAudioContext;
        }
        expect(context.counts.oscillators + context.counts.sources).toBeGreaterThan(0);
    });
});

describe('プレイヤーから鳴らす', () => {
    it('ゲームの library のプレイヤーから、共通の効果音を鳴らせる', () => {
        Sound.register('sfx-test-game', { songs: {} });
        withBrowser(null, ({ contexts }) => {
            const player = Sound.createPlayer({ library: 'sfx-test-game', storageKey: 'game.sound' });
            expect(Object.keys(player.effects)).toEqual(expect.arrayContaining(NAMES));
            player.unlock();
            const before = contexts[0].counts.oscillators + contexts[0].counts.sources;
            player.play('place');
            expect(contexts[0].counts.oscillators + contexts[0].counts.sources).toBeGreaterThan(before);
            expect(() => player.play('no-such-effect')).toThrow(/効果音がありません/);
        });
    });

    it('ゲームの効果音に同じ名前があれば、そちらを鳴らす', () => {
        const own = [{ instrument: 'bell', notes: 'C6:1' }];
        Sound.register('sfx-override-game', { effects: { select: own } });
        const player = Sound.createPlayer({ library: 'sfx-override-game' });
        expect(player.effects.select).toBe(own);
        expect(player.effects.place).toBe(effects.place);
    });

    it('効果音の OFF は storageKey に保存され、OFF なら鳴らさない', () => {
        withBrowser({ effects: false, bgm: true, version: 2 }, ({ contexts, store }) => {
            const player = Sound.createPlayer({ storageKey: 'game.sound' });
            expect(player.getSettings()).toEqual({ effects: false, bgm: true });
            player.unlock();
            const before = contexts[0].counts.oscillators + contexts[0].counts.sources;
            player.play('win');
            expect(contexts[0].counts.oscillators + contexts[0].counts.sources).toBe(before);
            player.toggle('effects');
            expect(JSON.parse(store.get('game.sound'))).toEqual({ effects: true, bgm: true, version: 2 });
            player.play('win');
            expect(contexts[0].counts.oscillators + contexts[0].counts.sources).toBeGreaterThan(before);
        });
    });
});

describe('ON/OFF の保存（1つのボタンで、BGM と効果音をまとめて切り替える）', () => {
    it('前の版の保存（version がない）で BGM を消していた人は、効果音も消えたまま始まる', () => {
        withBrowser({ effects: true, bgm: false }, ({ store }) => {
            const player = Sound.createPlayer({ storageKey: 'game.sound' });
            expect(player.getSettings()).toEqual({ effects: false, bgm: false });
            // 読んだときに1回だけ移し、印（version）を付けて書き戻す
            expect(JSON.parse(store.get('game.sound'))).toEqual({ effects: false, bgm: false, version: 2 });
            // 移したあとで効果音だけを ON にしても、次に読むときは移し直さない
            store.set('game.sound', JSON.stringify({ effects: true, bgm: false, version: 2 }));
            expect(Sound.createPlayer({ storageKey: 'game.sound' }).getSettings()).toEqual({ effects: true, bgm: false });
            player.toggleAll();
            expect(JSON.parse(store.get('game.sound'))).toEqual({ effects: true, bgm: true, version: 2 });
        });
    });

    it('前の版の保存で BGM が ON なら、効果音も ON', () => {
        withBrowser({ effects: true, bgm: true }, () => {
            expect(Sound.createPlayer({ storageKey: 'game.sound' }).getSettings()).toEqual({ effects: true, bgm: true });
        });
    });

    it('保存がなければ、両方 ON。toggleAll で両方 OFF・両方 ON を行き来する', () => {
        withBrowser(null, ({ store }) => {
            const player = Sound.createPlayer({ storageKey: 'game.sound' });
            expect(player.getSettings()).toEqual({ effects: true, bgm: true });
            player.toggleAll();
            expect(JSON.parse(store.get('game.sound'))).toEqual({ effects: false, bgm: false, version: 2 });
            player.toggleAll();
            expect(player.getSettings()).toEqual({ effects: true, bgm: true });
        });
    });
});

// 書き出して測る（音量の目安・ピーク・音割れ・響きの長さ）。Chrome がなければ飛ばす
const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).some(file => fs.existsSync(file));

describe.skipIf(!chrome)('書き出して測る', () => {
    it('measure --common が、すべての効果音で決まりに合う（終了コード 0）', () => {
        const result = spawnSync(process.execPath, ['tools/measure.mjs', '--common'], { cwd: ROOT, encoding: 'utf8' });
        expect(result.stdout + result.stderr).not.toMatch(/決まりに合いません/);
        expect(result.status).toBe(0);
        NAMES.forEach(id => expect(result.stdout).toContain(`common/${id} `));
    }, 120000);
});
