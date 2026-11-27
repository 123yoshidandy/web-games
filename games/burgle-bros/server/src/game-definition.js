/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 協力ゲームなので、泥棒の道具とお宝は全員に見せる。ビューから隠すのは、めくっていない部屋・巡回の山の並び・道具とお宝の山・シード（game-view.js）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

const FLOORS = [1, 2, 3];

export default {
    minPlayers: Math.max(2, MIN_PLAYERS),
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // ロビーの設定：建物の階数（1〜3階建て。多いほど難しい）
    settings: {
        defaults: () => ({ floors: 1 }),
        validate: (patch, current) => ({ floors: FLOORS.includes(Number(patch?.floors)) ? Number(patch.floors) : current.floors })
    },

    create: ({ players, settings = {}, random }) => new Game(players, {
        seed: Math.floor(random() * 2 ** 32),
        floors: FLOORS.includes(Number(settings.floors)) ? Number(settings.floors) : 1
    }),

    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.logTotal,
    joinMark: (game) => Math.max(0, game.logTotal - 60),

    actions: {
        command({ game, seat, message, reject }) {
            // 操作の中身の検証と、記録する項目の絞り込みは Game.applyCommand が行う（断るときは状態を変えない）
            const command = message?.command;
            if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
                return reject('今はその操作はできません');
            }
            if (!game.applyCommand(seat, command)) return reject(game.lastError ?? '今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver(),

    // 協力ゲームの結果：全員が勝つか、全員が負けるか
    result: (game) => (game.result ? { coop: true, won: game.result.won } : null),

    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける。切断は戻ってくるかもしれないので待つ
    // persist は players の isCPU を保存するので、引き継いだ席は再現のあとも CPU のまま（ルールは isCPU を見ない）
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
