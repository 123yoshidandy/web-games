/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 手札と袋を隠すのはビュー（createGameView）の役目。各プレイヤーには、そのプレイヤーから見える状態だけを送る
 * - ほかの人の手札は枚数だけ。袋は枚数だけ（並びは入れない）。観戦者には、だれの手札も入れない
 * - 盤・置いたタイル・得点は全員に見せる
 * - 遊び方は、2〜4人の standard と、4人の組み合わせ戦 team。1人用（solo）はオンラインでは使わない
 */

import Game, { COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

// 席 seat から見てよい状態だけにする（seat が null の観戦者には、だれの手札も入れない）
const sanitize = (game, seat, since) => createGameView(game, seat, { since: since ?? 0 });

export default {
    minPlayers: 2,
    maxPlayers: 4,
    allowCpu: true,

    // シードと最初の人は、共通部品の乱数から作る（テストでは乱数を固定できる）
    // 部屋の CPU は「ふつう」で打つ。options.mode が 'team' なら4人の組み合わせ戦
    create: ({ players, random, options }) => new Game(
        players.map(p => ({ ...p, cpuLevel: p.isCPU ? 'normal' : null })),
        { seed: Math.floor(random() * 2 ** 32), mode: options?.mode === 'team' && players.length === 4 ? 'team' : 'standard' }
    ),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => sanitize(game, seat, since),
    spectatorView: (game, { since } = {}) => sanitize(game, null, since),
    mark: (game) => game.logs.length,
    joinMark: (game) => Math.max(0, game.logs.length - 50),

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

    // 利用者ごとの記録：game.winners は勝った単位（sides の番号）なので、組み合わせ戦（team）では、その単位の2人の席に直す
    result: (game) => (game.isOver() ? { winners: game.winners.flatMap(i => game.sides[i].members) } : null),

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
