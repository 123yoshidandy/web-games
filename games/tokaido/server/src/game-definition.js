/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 伏せた情報を隠すのはビュー（createGameView）の役目。各プレイヤーには、そのプレイヤーから見える状態だけを送る
 * - 山（土産・食事・出会い・温泉）の並びは送らない（枚数だけ）。シードと CPU の値も送らない
 * - 配られた旅人の札と、選び終える前の旅人は本人にだけ。役人が引いた2枚も本人にだけ
 * - 宿場の食事の札は、その宿場に着いた人にだけ
 * - 観戦者には、だれの伏せた札も入れない
 * 旅人を選ぶ間は全員が同時に操作する。旅の間に操作を待っている人は game.actors()（2人のときは、中立の旅人を動かす先頭の人も含む）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // シードは、共通部品の乱数から作る（テストでは乱数を固定できる）
    // 部屋の CPU は「ふつう」で打つ
    create: ({ players, random }) => new Game(
        players.map(p => ({ ...p, cpuLevel: p.isCPU ? 'normal' : null })),
        { seed: Math.floor(random() * 2 ** 32) }
    ),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.logs.length,
    joinMark: (game) => Math.max(0, game.logs.length - 60),

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

    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU（ふつう）が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
        ctx.game.players[seat].cpuLevel = 'normal';
    }
};
