/**
 * CPU の読みを、画面とは別の流れ（Web Worker）で行う
 * 受け取る：{ id, view, level }。返す：{ id, command }
 */

import { decide } from './cpu-player.js';

self.addEventListener('message', (event) => {
    const { id, view, level } = event.data ?? {};
    let command = null;
    try {
        command = decide(view, level);
    } catch (error) {
        console.error(error);
    }
    self.postMessage({ id, command });
});
