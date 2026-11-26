import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEngine, lintSong } from '../tools/lint-songs.mjs';
import { GAMES_ROOT, findSongFiles, registeredName } from '../tools/songs.mjs';
import { LOCK_FILE } from '../scripts/sync.mjs';

// web-games の games/ の下で、曲を持つすべてのゲーム
const SONGS = findSongFiles();
const Sound = loadEngine(SONGS.map(s => s.file));

describe('ゲームの曲を探す', () => {
    let gamesRoot;

    beforeEach(() => {
        gamesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-songs-'));
        const write = (file) => {
            fs.mkdirSync(path.dirname(path.join(gamesRoot, file)), { recursive: true });
            fs.writeFileSync(path.join(gamesRoot, file), '');
        };
        write('b-game/public/js/sound/bgm.js');
        write('a-game/js/sound/bgm.js');
        write('no-song/public/js/main.js');
    });

    afterEach(() => {
        fs.rmSync(gamesRoot, { recursive: true, force: true });
    });

    it('public/js/sound と js/sound の bgm.js を、フォルダ名の順に見つける', () => {
        const found = findSongFiles({ gamesRoot });
        expect(found.map(s => s.game)).toEqual(['a-game', 'b-game']);
        expect(found[0].file).toBe(path.join(gamesRoot, 'a-game/js/sound/bgm.js'));
    });

    it('ゲームを指定でき、曲がなければ投げる', () => {
        expect(findSongFiles({ gamesRoot, games: ['b-game'] }).map(s => s.game)).toEqual(['b-game']);
        expect(() => findSongFiles({ gamesRoot, games: ['no-song'] })).toThrow(/曲のファイルが見つかりません/);
    });
});

it('本体を同期したゲームは、どれも自分の曲を持つ', () => {
    const synced = fs.readdirSync(GAMES_ROOT).filter(game => fs.existsSync(path.join(GAMES_ROOT, game, LOCK_FILE)));
    const withSongs = new Set(SONGS.map(s => s.game));
    expect(synced.filter(game => !withSongs.has(game))).toEqual([]);
});

describe.each(SONGS.map(s => [s.game, s.file]))('%s', (game, file) => {
    it('ゲームのフォルダ名で登録する', () => {
        expect(registeredName(file)).toBe(game);
    });

    // 名前が違うときは、上のテストで落とす（ここで投げると、ほかのゲームのテストも読めなくなる）
    const { songs, effects } = registeredName(file) === game ? Sound.library(game) : { songs: {}, effects: {} };

    it.each(Object.keys(songs))('曲 %s を組み立てられ、和声の検査を通る', (id) => {
        const song = songs[id];
        const compiled = Sound.compileSong(song);
        expect(compiled.events.length).toBeGreaterThan(0);
        // ループは小節の区切りで終わる
        expect(compiled.loopLength % compiled.stepsPerBar).toBe(0);
        for (const part of Object.values(song.parts)) expect(Sound.instruments).toContain(part.instrument);
        expect(lintSong(Sound, song).warnings).toEqual([]);
    });

    it.each(Object.keys(effects))('効果音 %s を読める', (id) => {
        const length = Sound.effectLength(effects[id]);
        expect(length).toBeGreaterThan(0);
        expect(length).toBeLessThan(3);
        for (const layer of effects[id]) {
            const instrument = typeof layer.instrument === 'string' ? layer.instrument : layer.instrument.instrument;
            expect(Sound.instruments).toContain(instrument);
        }
    });
});
