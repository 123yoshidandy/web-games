/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * 今はオンライン対戦を入れていない。入れるときは、netplay-kit の sync.mjs で部屋の処理（server/netplay/ など）を写し、
 * この定義を createHandler と startDevServer に渡す
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）を送る。アズールで隠すのは袋の中の並びだけ
 * 2〜4人で遊ぶ。CPU の強さを部屋の設定に持つ
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn, CPU_STYLES } from '../../public/js/cpu-player.js';

const LEVELS = ['easy', 'normal'];
const playersOf = (game) => game.players.map(p => ({ name: p.name, isCPU: p.isCPU }));

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    settings: {
        defaults: () => ({ level: 'normal' }),
        validate: (patch, current) => ({ level: LEVELS.includes(patch?.level) ? patch.level : current.level })
    },

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）。CPU の強さは記録とは別に持つ
    create: ({ players, random, settings }) => {
        const game = new Game(players, { seed: Math.floor(random() * 2 ** 32) });
        game.level = LEVELS.includes(settings?.level) ? settings.level : 'normal';
        return game;
    },

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => ({ players: playersOf(game), seed: game.seed, commands: game.commands, level: game.level }),
    restore: (saved) => Object.assign(Game.replay(saved.players, { seed: saved.seed }, saved.commands), { level: saved.level ?? 'normal' }),

    view: (game, seat) => createGameView(game, seat),
    spectatorView: (game) => createGameView(game, null),
    mark: (game) => game.commands.length,
    joinMark: (game) => game.commands.length,

    actions: {
        command({ game, seat, message, reject }) {
            // 操作の中身の検証は Game.applyCommand が行う（断るときは状態を変えない）。記録するのは決まった項目だけ
            const command = message?.command;
            if (!command || typeof command !== 'object') return reject('今はその操作はできません');
            const { type, source, color, line } = command;
            if (!game.applyCommand(seat, { type, source, color, line })) return reject(game.lastError ?? '今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver,

    // CPU の手番なら進める
    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game, CPU_STYLES[game.level ?? 'normal'] ?? CPU_STYLES.normal),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
