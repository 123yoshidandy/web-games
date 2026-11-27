/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 1人が1人の英雄を受け持つ。協力ゲームなので持ち物は全員に見せ、ビューから隠すのは袋・山札の並びとシードだけ（game-view.js）
 * 怪物の番の選択（標的・防御）は、選ぶ人（actors）からだけ受け付ける（Game が判定する）
 */

import Game, { MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';
import { LEVELS } from '../../public/js/data.js';

const levelOf = (value) => (Object.hasOwn(LEVELS, value) ? Number(value) : 2);

export default {
    minPlayers: 2,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // ロビーの設定：難易度（怪物の数 2・3・4）
    settings: {
        defaults: () => ({ level: '2' }),
        validate: (patch, current) => ({ level: Object.hasOwn(LEVELS, patch?.level) ? String(patch.level) : current.level })
    },

    create: ({ players, settings = {}, random }) => new Game(players, {
        seed: Math.floor(random() * 2 ** 32),
        level: levelOf(settings.level)
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

    // CPU の席が操作する番なら進める
    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける。切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
