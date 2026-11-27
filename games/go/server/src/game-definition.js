/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・オプション・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 囲碁に隠す情報も乱数もない（死に石の見込みは、盤から作るシードで決まる）。席0が黒。待った（1手戻す）は、ローカルの対戦だけにする
 * 死に石を決める段階は、2人とも確定したら終わる（どちらかが指定を変えたら、確定はやり直し）
 *
 * 持ち時間（ロビーの設定 clock）：時刻はサーバーが決める
 * - 手番が始まった時刻（turnStartedAt。サーバーの時刻）を記録と一緒に保存し、操作が届いた時刻との差を、その手にかかった時間にする
 * - 時間切れは、次の操作が届いたときと、期限（deadline）で確かめる。Lambda はタイマーを持てないので、期限は届いたメッセージのたびに見る
 *   （端末は、相手の時計が0になったら ping を送る）
 * - CPU は考えた時間も自分の時計で使い、人の手番はそのあとから数える
 * - 死に石を決める段階では、どちらの時計も止まる
 */

import Game, { PLAYERS, COMMAND_FIELDS, CLOCK_PRESETS, normalizeOptions, clockOption } from '../../public/js/game.js';
import { SIZES } from '../../public/js/rules.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

// 部屋の CPU は「ふつう」で打つ
const ROOM_CPU_LEVEL = 'normal';

export default {
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    allowCpu: true,

    // ロビーで決める盤の大きさ（文字で持つ。'9'・'13'・'19'）と持ち時間（CLOCK_PRESETS の名前。既定はなし）。コミ・置き石は既定の値
    settings: {
        defaults: () => ({ size: '9', clock: 'none' }),
        validate: (patch, current) => ({
            size: SIZES.map(String).includes(String(patch?.size)) ? String(patch.size) : current?.size ?? '9',
            clock: Object.hasOwn(CLOCK_PRESETS, patch?.clock) ? patch.clock : current?.clock ?? 'none'
        })
    },

    // options：{ size, komi, handicap }。オンラインの部屋では、ロビーの設定の盤の大きさと持ち時間を使う（正しくなければ既定の値）
    create: ({ players, options, settings, now }) => {
        const clock = clockOption(settings?.clock);
        const merged = { ...(options ?? {}), ...(settings?.size ? { size: Number(settings.size) } : {}), ...(clock ? { clock } : {}) };
        let checked;
        try {
            checked = normalizeOptions(merged);
        } catch {
            checked = normalizeOptions(clock ? { clock } : {});
        }
        const game = new Game(players.map(p => ({ ...p, cpuLevel: p.isCPU ? ROOM_CPU_LEVEL : null })), checked);
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
    joinMark: (game) => Math.max(0, game.logs.length - 50),

    actions: {
        command({ game, seat, message, reject, now }) {
            // 操作の中身の検証は Game.applyCommand が行う（断るときは状態を変えない）。記録する項目は決まったものだけ
            const command = message?.command;
            if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
                return reject('今はその操作はできません');
            }
            const clean = { type: command.type };
            COMMAND_FIELDS[command.type].forEach(key => { clean[key] = command[key]; });
            const time = now();
            const elapsed = time - game.turnStartedAt;
            // 期限を確かめたあと、操作を受けるまでの間に時間を使い切った
            if (game.isFlagged(elapsed)) {
                game.timeout(game.clockSeat(), elapsed);
                game.turnStartedAt = time;
                return;
            }
            if (!game.applyCommand(seat, clean, elapsed)) return reject(game.lastError ?? '今はその操作はできません');
            game.turnStartedAt = time;
        }
    },

    // 時計が進んでいる席の時間切れの時刻（時計なし・死に石を決める段階・終わったあとは null）
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

    // 対戦中に部屋を出た人の席は、CPU（ふつう）が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
        ctx.game.players[seat].cpuLevel = ROOM_CPU_LEVEL;
    }
};
