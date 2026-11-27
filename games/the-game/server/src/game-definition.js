/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 手札と山札を隠すのはビュー（createGameView）の役目。各プレイヤーには、そのプレイヤーの手札だけを入れ、シードは入れない
 * 合図は、番でなくてもいつでも置ける（CPU の仲間も、人が出したのを見て置き直す）
 */

import Game from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, hasCpuWork, LEVELS } from '../../public/js/cpu.js';

// 操作の種類ごとに、記録する項目（端末から余計な項目が届いても残さない）
export const COMMAND_FIELDS = { play: ['card', 'pile'], end: [], signal: ['pile', 'mark'] };

const players = game => game.players.map(p => ({ name: p.name, isCPU: p.isCPU, level: p.level }));

export default {
    minPlayers: 2,
    maxPlayers: 5,
    allowCpu: true,

    settings: {
        defaults: () => ({ level: 'normal' }),
        validate: (patch, current) => {
            const next = { ...current, ...patch };
            if (!LEVELS.includes(next.level)) throw new Error('CPU の強さが正しくありません');
            return { level: next.level };
        }
    },

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）
    create: ({ players, settings, random }) => new Game(
        players.map(p => ({ name: p.name, isCPU: !!p.isCPU, level: settings?.level ?? 'normal' })),
        { seed: Math.floor(random() * 2 ** 32) }
    ),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => ({ players: players(game), options: { seed: game.seed }, commands: structuredClone(game.commands) }),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat) => createGameView(game, seat),
    spectatorView: (game) => createGameView(game, null),
    mark: (game) => game.logs.length,
    joinMark: (game) => Math.max(0, game.logs.length - 80),

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
        needsStep: (game) => hasCpuWork(game),
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // persist が isCPU を保存するので、部屋を読み直しても CPU のまま。切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
