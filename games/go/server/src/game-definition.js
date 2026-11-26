/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・オプション・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 囲碁に隠す情報も乱数もない（死に石の見込みは、盤から作るシードで決まる）。席0が黒。待った（1手戻す）は、ローカルの対戦だけにする
 * 死に石を決める段階は、2人とも確定したら終わる（どちらかが指定を変えたら、確定はやり直し）
 */

import Game, { PLAYERS, COMMAND_FIELDS, normalizeOptions } from '../../public/js/game.js';
import { SIZES } from '../../public/js/rules.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

// 部屋の CPU は「ふつう」で打つ
const ROOM_CPU_LEVEL = 'normal';

export default {
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    allowCpu: true,

    // ロビーで決める盤の大きさ（文字で持つ。'9'・'13'・'19'）。コミ・置き石は既定の値
    settings: {
        defaults: () => ({ size: '9' }),
        validate: (patch, current) => ({ size: SIZES.map(String).includes(String(patch?.size)) ? String(patch.size) : current.size })
    },

    // options：{ size, komi, handicap }。オンラインの部屋では、ロビーの設定の盤の大きさを使う（正しくなければ既定の値）
    create: ({ players, options, settings }) => {
        let checked;
        try {
            checked = normalizeOptions({ ...(options ?? {}), ...(settings?.size ? { size: Number(settings.size) } : {}) });
        } catch {
            checked = normalizeOptions({});
        }
        return new Game(players.map(p => ({ ...p, cpuLevel: p.isCPU ? ROOM_CPU_LEVEL : null })), checked);
    },

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.logs.length,
    joinMark: (game) => Math.max(0, game.logs.length - 50),

    actions: {
        command({ game, seat, message, reject }) {
            // 操作の中身の検証は Game.applyCommand が行う（断るときは状態を変えない）。記録する項目は決まったものだけ
            const command = message?.command;
            if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
                return reject('今はその操作はできません');
            }
            const clean = { type: command.type };
            COMMAND_FIELDS[command.type].forEach(key => { clean[key] = command[key]; });
            if (!game.applyCommand(seat, clean)) return reject(game.lastError ?? '今はその操作はできません');
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
        ctx.game.players[seat].cpuLevel = ROOM_CPU_LEVEL;
    }
};
