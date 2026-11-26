/**
 * ゲームの曲のファイルを探す（lint-songs・measure・テストで使う）
 *
 * 曲は、各ゲームが自分で持つ（games/<ゲーム>/public/js/sound/bgm.js。public/ がないゲームは js/sound/bgm.js）。
 * ファイルの中で Sound.register('<ゲーム>', { songs, effects }) を呼び、登録の名前はゲームのフォルダ名にする
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// web-games の games/（packages/sound/tools から3つ上）
export const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../games');
export const SONG_DIRS = ['public/js/sound', 'js/sound'];
export const SONG_FILE = 'bgm.js';

// ゲームのフォルダの中の曲のファイル（なければ null）
export function songFileOf(gameDir) {
    for (const dir of SONG_DIRS) {
        const file = path.join(gameDir, dir, SONG_FILE);
        if (fs.existsSync(file)) return file;
    }
    return null;
}

// 曲を持つゲームと、その曲のファイル（[{ game, file }]、フォルダ名の順）
// games を渡すと、そのゲームだけ（曲のファイルがなければ投げる）
export function findSongFiles({ gamesRoot = GAMES_ROOT, games = null } = {}) {
    const names = games ?? (fs.existsSync(gamesRoot) ? fs.readdirSync(gamesRoot).sort() : []);
    return names.flatMap(game => {
        const file = songFileOf(path.join(gamesRoot, game));
        if (!file && games) throw new Error(`曲のファイルが見つかりません: games/${game}/{${SONG_DIRS.join(',')}}/${SONG_FILE}`);
        return file ? [{ game, file }] : [];
    });
}

// ファイルが登録する名前（Sound.register('<名前>', …)）
export function registeredName(file) {
    return /Sound\.register\('([^']+)'/.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? null;
}
