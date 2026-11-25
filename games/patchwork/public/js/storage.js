/**
 * localStorage の読み書き（使えない環境でも遊べるよう、必ず try/catch で包む）
 * GitHub Pages ではほかのゲームとオリジンを共有するので、キーに接頭辞を付ける
 */

const PREFIX = 'patchwork.';

export function load(key, fallback = null) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export function save(key, value) {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
        // 保存できなくても遊べる
    }
}

export function remove(key) {
    try {
        localStorage.removeItem(PREFIX + key);
    } catch {
        // 何もしない
    }
}
