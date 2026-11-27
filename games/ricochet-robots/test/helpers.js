import Game from '../public/js/game.js';
import { runDue, suggest } from '../public/js/cpu-player.js';

export const race = (overrides = {}) => new Game(
    overrides.players ?? [{ name: 'あなた' }, { name: 'CPU', isCPU: true }],
    { seed: 7, mode: 'race', targets: 5, startAt: 0, ...overrides }
);

// 人の席は suggest の手、CPU は時間で進む出来事で、時計を止めたまま終局まで進める
export function playOut(game, { at = () => 0, limit = 2000 } = {}) {
    for (let i = 0; i < limit && !game.isOver(); i++) {
        runDue(game, at());
        if (game.isOver()) break;
        const seat = game.players.findIndex(player => !player.isCPU && suggest(game, player.seat));
        if (seat < 0) throw new Error(`進められない：${game.round?.phase}`);
        const ok = game.applyCommand(seat, { ...suggest(game, seat), at: at() });
        if (!ok) throw new Error(game.lastError);
    }
    return game;
}
