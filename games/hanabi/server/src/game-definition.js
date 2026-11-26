/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）だけを送る。自分の手札の中身と山札の並びは送らない（ほかの人の手札は見えるのがルール）
 * 協力ゲームなので、CPU は味方。足りない席と、部屋を出た人の席を CPU が受け持つ
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

// 記録する操作の形（ほかの項目は落とす）
function clean(command) {
    if (!command || typeof command !== 'object') return null;
    if (command.type === 'clue') return { type: 'clue', target: command.target, kind: command.kind, value: command.value };
    if (command.type === 'play' || command.type === 'discard') return { type: command.type, order: command.order };
    return null;
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）
    create: ({ players, random }) => new Game(players.map(p => ({ name: p.name, isCPU: !!p.isCPU })), { seed: Math.floor(random() * 2 ** 32) }),

    // 保存するのは参加者・シード・記録だけ。読み込むたびに記録から再現する
    persist: (game) => ({
        players: game.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
        seed: game.seed,
        commands: game.commands.map(entry => structuredClone(entry))
    }),
    restore: (saved) => Game.replay(saved.players, { seed: saved.seed }, saved.commands),

    view: (game, seat) => createGameView(game, seat),
    spectatorView: (game) => createGameView(game, null),
    mark: (game) => game.commands.length,
    joinMark: (game) => game.commands.length,

    actions: {
        command({ game, seat, message, reject }) {
            // 断るときは状態を変えない（Game.applyCommand が確かめる）
            const command = clean(message?.command);
            if (!command) return reject('今はその操作はできません');
            if (!game.applyCommand(seat, command)) return reject(game.lastError ?? '今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver,

    // 手番の人が CPU なら進める
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
