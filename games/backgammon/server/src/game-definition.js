/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する（ダイスもシードから決まる）
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）を送る。バックギャモンには隠す情報がない
 * 2人で遊ぶ。CPU の強さ・何点先取か・キューブを使うかを部屋の設定に持つ
 */

import Game, { PLAYERS, COMMAND_FIELDS, MATCH_LENGTHS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn, PROFILES } from '../../public/js/cpu-player.js';

const LEVELS = ['easy', 'normal'];

export default {
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    allowCpu: true,

    settings: {
        defaults: () => ({ level: 'normal', matchLength: 3, cube: true }),
        validate: (patch, current) => ({
            level: LEVELS.includes(patch?.level) ? patch.level : current.level,
            matchLength: MATCH_LENGTHS.includes(patch?.matchLength) ? patch.matchLength : current.matchLength,
            cube: typeof patch?.cube === 'boolean' ? patch.cube : current.cube
        })
    },

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）。CPU の強さは記録とは別に持つ
    create: ({ players, random, settings }) => {
        const game = new Game(players, { seed: Math.floor(random() * 2 ** 32), matchLength: settings?.matchLength, cube: settings?.cube });
        game.level = LEVELS.includes(settings?.level) ? settings.level : 'normal';
        return game;
    },

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => ({ ...game.persist(), level: game.level }),
    restore: (saved) => Object.assign(Game.replay(saved.players, saved.options, saved.commands), { level: saved.level ?? 'normal' }),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.eventSeq,
    joinMark: (game) => Math.max(0, game.eventSeq - 20),

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

    // CPU の番なら進める（ゲームの間は、全員が CPU のときだけ CPU が次のゲームへ進める）
    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game, game.actors()[0], PROFILES[game.level ?? 'normal']),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
