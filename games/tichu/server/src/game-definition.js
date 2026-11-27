/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）だけを送る。ほかの人の手札と、渡した札は送らない
 */

import Game, { PLAYERS, COMMAND_FIELDS, teamOf } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

export default {
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    allowCpu: true,

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）
    create: ({ players, random, options }) => new Game(players, { ...(options ?? {}), seed: Math.floor(random() * 2 ** 32) }),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    // ビューは出来事（events）を番号（seq）で絞るので、印も出来事の番号にする（記録の文は毎回すべて送る）
    mark: (game) => game.eventSeq,
    joinMark: (game) => Math.max(0, game.eventSeq - 20),

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

    // 利用者ごとの記録に使う結果：勝ったチーム（席 % 2）の全員。game.winner はチームの番号なので、席として読ませない
    result: (game) => (game.winner === null || game.winner === undefined
        ? null
        : { winners: [0, 1, 2, 3].filter((seat) => teamOf(seat) === game.winner) }),

    // CPU の手番なら進める
    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
