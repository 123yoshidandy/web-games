/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 僧はいつも4人。部屋の人数（1〜4人）より多い分の僧は CPU が動かす
 * 協力ゲームなので、僧の気と札は全員に見せる。ビューから隠すのは、幽霊の山の並びとシードだけ（game-view.js）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';
import { LEVELS } from '../../public/js/data.js';

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // ロビーの設定：難易度（入門・標準・悪夢 = initiation・normal・nightmare）
    settings: {
        defaults: () => ({ level: 'normal' }),
        validate: (patch, current) => ({ level: Object.hasOwn(LEVELS, patch?.level) ? patch.level : current.level })
    },

    create: ({ players, settings = {}, random }) => new Game(players, {
        seed: Math.floor(random() * 2 ** 32),
        level: Object.hasOwn(LEVELS, settings.level) ? settings.level : 'normal'
    }),

    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.logTotal,
    joinMark: (game) => Math.max(0, game.logTotal - 80),

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

    // CPU の僧の番なら進める
    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の僧は、CPU が代わりに続ける（persist が isCPU を保存する）。切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
