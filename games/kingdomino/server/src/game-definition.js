/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・追加ルール・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）を送る。山の並びは送らない（枚数だけ）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

const isInt = (v) => Number.isInteger(v);

// 操作の形を確かめ、記録してよい項目だけにする（形が違えば null）
function normalize(command) {
    if (!command || typeof command !== 'object') return null;
    if (command.type === 'pick') return isInt(command.index) ? { type: 'pick', index: command.index } : null;
    if (command.type === 'place') {
        const { x, y, dir } = command;
        return isInt(x) && isInt(y) && isInt(dir) && dir >= 0 && dir < 4 ? { type: 'place', x, y, dir } : null;
    }
    if (command.type === 'discard') return { type: 'discard' };
    return null;
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // 追加ルール（部屋で1つ）
    settings: {
        defaults: () => ({ middleKingdom: false, harmony: false }),
        validate: (patch, current) => ({
            middleKingdom: typeof patch?.middleKingdom === 'boolean' ? patch.middleKingdom : current.middleKingdom,
            harmony: typeof patch?.harmony === 'boolean' ? patch.harmony : current.harmony
        })
    },

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）
    create: ({ players, random, settings }) => new Game(players, {
        seed: Math.floor(random() * 2 ** 32),
        middleKingdom: !!settings?.middleKingdom,
        harmony: !!settings?.harmony
    }),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => ({
        players: game.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
        options: { seed: game.seed, ...game.options },
        commands: game.commands
    }),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat) => createGameView(game, seat),
    spectatorView: (game) => createGameView(game, null),
    mark: (game) => game.commands.length,
    joinMark: (game) => game.commands.length,

    actions: {
        command({ game, seat, message, reject }) {
            // ルールの検証は Game.applyCommand が行う（断るときは状態を変えない）
            const command = normalize(message?.command);
            if (!command) return reject('今はその操作はできません');
            if (!game.applyCommand(seat, command)) return reject(game.lastError ?? '今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver,

    // CPU の手番なら進める
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
