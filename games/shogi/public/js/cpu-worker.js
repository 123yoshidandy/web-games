/**
 * CPU の読みを画面と別のスレッドで動かす（Web Worker）
 * 受け取る：{ id, saved: { players, options, commands }, level }。記録から局面を作り直して手を決める
 * 返す：{ id, command }（指せる手がなければ command は null）か、{ id, error }
 */

import Game from './game.js';
import { decide } from './cpu-player.js';

self.addEventListener('message', ({ data }) => {
    const { id, saved, level } = data;
    try {
        const game = Game.replay(saved.players, saved.options, saved.commands);
        self.postMessage({ id, command: decide(game, level) });
    } catch (error) {
        self.postMessage({ id, error: String(error?.message ?? error) });
    }
});
