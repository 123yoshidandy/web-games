/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 将棋に隠す情報も乱数もない。席0が先手。待った（1手戻す）は、ローカルの対局だけにする
 *
 * 持ち時間（ロビーの設定 clock）：時刻はサーバーが決める
 * - 手番が始まった時刻（turnStartedAt。サーバーの時刻）を記録と一緒に保存し、操作が届いた時刻との差を、その手にかかった時間にする
 * - 時間切れは、次の操作が届いたときと、期限（deadline）で確かめる。Lambda はタイマーを持てないので、期限は届いたメッセージのたびに見る
 *   （端末は、相手の時計が0になったら ping を送る）
 * - CPU は考えた時間も自分の時計で使い、人の手番はそのあとから数える
 */

import Game, { PLAYERS, COMMAND_FIELDS, CLOCK_PRESETS, clockOption } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

export default {
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    allowCpu: true,

    // ロビーで決める持ち時間（CLOCK_PRESETS の名前。既定はなし）
    settings: {
        defaults: () => ({ clock: 'none' }),
        validate: (patch, current) => ({ clock: Object.hasOwn(CLOCK_PRESETS, patch?.clock) ? patch.clock : current?.clock ?? 'none' })
    },

    // 部屋の CPU は「ふつう」で指す。乱数は使わない
    create: ({ players, settings, now }) => {
        const clock = clockOption(settings?.clock);
        const game = new Game(players.map(p => ({ ...p, cpuLevel: p.isCPU ? 'normal' : null })), clock ? { clock } : {});
        game.turnStartedAt = now ?? 0;
        return game;
    },

    // 保存するのは記録と、手番が始まった時刻だけ。読み込むたびに記録から再現する
    persist: (game) => ({ ...game.persist(), turnStartedAt: game.turnStartedAt }),
    restore: (saved) => {
        const game = Game.replay(saved.players, saved.options, saved.commands);
        game.turnStartedAt = saved.turnStartedAt ?? null;
        return game;
    },

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.logs.length,
    joinMark: () => 0,

    actions: {
        command({ game, seat, message, reject, now }) {
            // 操作の中身の検証と、記録する項目の絞り込みは Game.applyCommand が行う（断るときは状態を変えない）
            const command = message?.command;
            if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
                return reject('今はその操作はできません');
            }
            const time = now();
            const elapsed = time - game.turnStartedAt;
            // 期限を確かめたあと、操作を受けるまでの間に時間を使い切った
            if (game.isFlagged(elapsed)) {
                game.timeout(game.clockSeat(), elapsed);
                game.turnStartedAt = time;
                return;
            }
            if (!game.applyCommand(seat, command, elapsed)) return reject(game.lastError ?? '今はその操作はできません');
            game.turnStartedAt = time;
        }
    },

    // 時計が進んでいる席の時間切れの時刻（時計なし・終わったあとは null）
    deadline: (game) => {
        const limit = game.clockLimit();
        return limit === null || game.turnStartedAt === null ? null : game.turnStartedAt + limit;
    },
    onDeadline(ctx) {
        const { game } = ctx;
        const seat = game.clockSeat();
        const time = ctx.now();
        if (seat === null || !game.isFlagged(time - game.turnStartedAt)) return ctx.ignore();
        game.timeout(seat, time - game.turnStartedAt);
        game.turnStartedAt = time;
    },

    isOver: (game) => game.isOver(),

    cpu: {
        needsStep: (game) => isCpuTurn(game),
        // 考えた時間も CPU の時計で使い、人の手番はそのあとから数える
        step: (game, { now = 0 } = {}) => {
            const started = Date.now();
            const moved = runCpuStep(game, { elapsed: now - (game.turnStartedAt ?? now) });
            game.turnStartedAt = now + (Date.now() - started);
            return moved;
        },
        progress: (game) => game.commands.length
    },

    // 対局中に部屋を出た人の席は、CPU（ふつう）が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
        ctx.game.players[seat].cpuLevel = 'normal';
    }
};
