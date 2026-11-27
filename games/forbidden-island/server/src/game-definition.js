/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 協力ゲームなので、手札は全員に見せる。ビューから隠すのは、宝のカードと浸水のカードの山の並びだけ（game-view.js）
 * 特別なカード（ヘリ・土のう）は誰の手番でも使えるので、操作を待っている人（actors）以外からも受け付ける（使えるかは Game が判定する）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';
import { LEVELS } from '../../public/js/data.js';

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // ロビーの設定：難易度（見習い・標準・熟練・伝説 = novice・normal・elite・legendary。始まりの水位が違う）
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

    // 協力ゲームなので、全員が同じ結果（脱出できれば勝ち）。成績の記録に使う
    result: (game) => (game.result ? { coop: true, won: game.result.won } : null),

    // CPU の席の番（または CPU が使いたい特別なカード）があれば進める
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
