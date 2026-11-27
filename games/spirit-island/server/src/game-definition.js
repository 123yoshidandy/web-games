/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 協力ゲーム：全員が同じ側で、勝ち負けは全員に共通
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 精霊フェイズと力のフェイズは全員が同時に進めるので、操作を待っている席（actors）ならいつでも受け付ける
 * 精霊は席の順に、ロビーで決めた並び（既定は 奔流・大地・稲妻・影）で割り当てる
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS, sanitizeCommand } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, cpuSeatsToAct } from '../../public/js/cpu-player.js';
import { LEVELS } from '../../public/js/data.js';

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // ロビーの設定：難易度（やさしい・ふつう・むずかしい = easy・normal・hard）
    settings: {
        defaults: () => ({ level: 'normal' }),
        validate: (patch, current) => ({ level: Object.hasOwn(LEVELS, patch?.level) ? patch.level : current.level })
    },

    create: ({ players, settings = {}, random }) => new Game(
        players.map(p => ({ name: p.name, isCPU: !!p.isCPU })),
        { seed: Math.floor(random() * 2 ** 32), level: Object.hasOwn(LEVELS, settings.level) ? settings.level : 'normal' }
    ),

    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.logTotal,
    joinMark: (game) => Math.max(0, game.logTotal - 80),

    actions: {
        command({ game, seat, message, reject }) {
            // 項目の絞り込みと検証は Game.applyCommand が行う（断るときは状態を変えない）
            const command = sanitizeCommand(message?.command);
            if (!command || !Object.hasOwn(COMMAND_FIELDS, command.type)) return reject('今はその操作はできません');
            if (!game.applyCommand(seat, command)) return reject(game.lastError ?? '今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver(),

    // 同時に進めるので、操作を待っている CPU の席を1つずつ進める
    cpu: {
        needsStep: (game) => cpuSeatsToAct(game).length > 0,
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の精霊は、CPU が代わりに続ける（ルールは CPU かどうかを見ないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
