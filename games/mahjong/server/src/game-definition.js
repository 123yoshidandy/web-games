/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）だけを送る。ほかの人の手牌と牌山は送らない
 */

import Game, { PLAYER_COUNT, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, cpuActors } from '../../public/js/cpu-player.js';

export default {
    minPlayers: PLAYER_COUNT,
    maxPlayers: PLAYER_COUNT,
    allowCpu: true,

    // ロビーの設定：東風戦か半荘戦か
    settings: {
        defaults: () => ({ length: 'east' }),
        validate: (patch, current) => ({ length: ['east', 'south'].includes(patch?.length) ? patch.length : current.length })
    },

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）。東風戦か半荘戦かは部屋の設定から
    create: ({ players, random, settings }) => new Game(players, {
        seed: Math.floor(random() * 2 ** 32),
        length: settings?.length === 'south' ? 'south' : 'east'
    }),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
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
    // 利用者ごとの記録：局ごとの game.result ではなく、終局の順位（game.final）から取る
    result: (game) => (game.final ? { ranks: game.final.reduce((ranks, entry) => { ranks[entry.seat] = entry.rank; return ranks; }, Array(game.players.length).fill(null)) } : null),

    // 鳴きの確認では複数の人が同時に答えるので、CPU の席を1つずつ進める
    cpu: {
        needsStep: (game) => cpuActors(game).length > 0,
        step: (game) => runCpuStep(game, cpuActors(game)[0]),
        progress: (game) => game.commands.length
    },

    // 対局中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
