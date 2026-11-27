// packages/puzzle-kit 0.1.0 からコピーしたファイル。ここでは直さず、packages/puzzle-kit で直してから同期する
/**
 * localStorage の読み書き（使えない環境でも遊べるよう、必ず try/catch で包む）
 * GitHub Pages ではほかのゲームとオリジンを共有するので、キーにゲームの頭（game.js の STORAGE_PREFIX）を付ける
 */

import { STORAGE_PREFIX } from './game.js';

export function load(key, fallback = null) {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export function save(key, value) {
    try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
        // 保存できなくても遊べる
    }
}

export function remove(key) {
    try {
        localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
        // 何もしない
    }
}
