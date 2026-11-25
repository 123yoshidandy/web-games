/**
 * CPU の読みを、画面とは別のスレッドで動かす（Web Worker）
 * 読んでいる間も、画面の動き（考え中の表示、駒の動き）が止まらないようにする
 * 受け取る: { id, view, level }。返す: { id, command }（例外は { id, error }）
 */

import { decide } from './cpu-player.js';

self.addEventListener('message', (event) => {
    const { id, view, level } = event.data ?? {};
    try {
        self.postMessage({ id, command: decide(view, level) });
    } catch (error) {
        self.postMessage({ id, error: String(error?.message ?? error) });
    }
});
