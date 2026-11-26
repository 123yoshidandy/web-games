/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 手札を隠すのはビュー（createGameView）の役目。ほかの人の目標は種類と枚数だけ、引いた区画は引いた本人にだけ見せる
 */

import Game from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

// 操作の種類ごとに、記録する項目（端末から余計な項目が届いても残さない）
export const COMMAND_FIELDS = {
    complete: ['card'],
    weather: ['weather'],
    rain: ['q', 'r'],
    storm: ['q', 'r'],
    improve: ['improvement', 'from', 'q', 'r'],
    skip: [],
    drawPlots: [],
    placePlot: ['choice', 'q', 'r'],
    irrigate: ['a', 'b'],
    gardener: ['q', 'r'],
    panda: ['q', 'r'],
    drawObjective: ['kind'],
    endTurn: []
};

const players = game => game.players.map(p => ({ name: p.name, isCPU: p.isCPU }));

export default {
    minPlayers: 2,
    maxPlayers: 4,
    allowCpu: true,

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）
    create: ({ players, random }) => new Game(
        players.map(p => ({ name: p.name, isCPU: !!p.isCPU })),
        { seed: Math.floor(random() * 2 ** 32) }
    ),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => ({ players: players(game), options: { seed: game.seed }, commands: structuredClone(game.commands) }),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat) => ({ ...createGameView(game, seat), you: seat }),
    spectatorView: (game) => ({ ...createGameView(game, null), you: null }),
    mark: (game) => game.logs.length,
    joinMark: (game) => Math.max(0, game.logs.length - 50),

    actions: {
        command({ game, seat, message, reject }) {
            // 操作の中身の検証は Game.applyCommand が行う（断るときは状態を変えない）
            const command = message?.command;
            if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
                return reject('今はその操作はできません');
            }
            const clean = { type: command.type };
            COMMAND_FIELDS[command.type].forEach(name => {
                if (command[name] !== undefined) clean[name] = structuredClone(command[name]);
            });
            if (!game.applyCommand(seat, clean)) return reject(game.lastError ?? '今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver,

    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
