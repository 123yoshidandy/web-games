/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）を送る。サントリーニには隠す情報がないが、選べる操作は手番の人にだけ付ける
 * 人数は2人か3人。神の力は2人のときだけ（部屋の設定で「なし」か「おまかせ」）
 */

import Game, { PLAYER_COUNTS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn, PROFILES } from '../../public/js/cpu-player.js';

const LEVELS = ['easy', 'normal'];

export default {
    minPlayers: 2,
    maxPlayers: 3,
    // 隠れた情報も先の乱数もない（乱数は先手と神を決めるだけで、どちらも全員に見える）
    perfectInformation: true,
    allowCpu: true,

    // CPU の強さと、神の力（なし・おまかせ）
    settings: {
        defaults: () => ({ level: 'normal', gods: false }),
        validate: (patch, current) => ({
            level: LEVELS.includes(patch?.level) ? patch.level : current.level,
            gods: typeof patch?.gods === 'boolean' ? patch.gods : current.gods
        })
    },

    canStart: (lobby) => PLAYER_COUNTS.includes(lobby.players.length) ? null : '2人か3人で始めます',

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）。CPU の強さは記録とは別に持つ
    create: ({ players, random, settings }) => {
        const gods = settings?.gods && players.length === 2 ? players.map(() => 'random') : null;
        const game = new Game(players, { seed: Math.floor(random() * 2 ** 32), gods });
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

    // CPU の手番なら、番の終わりまで進める
    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game, game.current, PROFILES[game.level ?? 'normal']),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
