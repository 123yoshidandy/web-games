/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 早押し：全員が同じ場を見て、5つだと思ったらベルを送る。サーバーは届いた順に確かめ、最初に届いた正しいベルがカードをもらう
 * - 操作の時刻は、端末の時計ではなくサーバーの時計で付ける（始まりからのミリ秒）。端末が時刻をごまかしても効かない
 * - ベルには、端末が見ていた場の版を添える。見ていた場から変わっていて（先に鳴らされた・めくられた）今は5つでなければ、
 *   まちがいにせず断る（「間に合いませんでした」。払わない）
 * - めくるのは全員が自動（手番が来てから、めくる間隔のあと）。自分の番なら、待たずにめくってもよい
 * 部屋には参加者・設定・シード・操作の記録・始まりの時刻だけを保存し、操作を受けるたびに記録から再現する
 * ビューに、シードと山札の並びは入れない（入れると、これから出るカードを計算できてしまう）
 *
 * 自動でめくる時刻・CPU のベル・時間切れは、Lambda がタイマーを持てないので期限（deadline）にし、
 * 届いたメッセージ（端末が送る ping を含む）のたびに確かめる。記録の時刻は、届いた時刻ではなく起きる時刻そのものにする
 * 期限は操作より先に確かめるので、CPU のベルより後に届いた人のベルは、CPU のあとに扱われる
 */

import Game, { MAX_PLAYERS, LEVELS, SPEEDS, TIME_LIMITS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { nextEvent, runUntil } from '../../public/js/cpu-player.js';

const playersOf = (game) => game.players.map(player => ({ name: player.name, isCPU: player.isCPU, auto: true }));
const optionsOf = (game) => ({ seed: game.seed, mode: 'online', level: game.level, speed: game.speed, timeLimit: game.timeLimit });
const elapsed = (game, now) => Math.max(0, now - game.startedAt);
const pickKey = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export default {
    minPlayers: 2,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,
    rematch: 'host',
    stamps: ['👍', '😮', '😭', '🎉'],

    settings: {
        defaults: () => ({ level: 'normal', speed: 'normal', timeLimit: 'normal' }),
        validate: (patch, current) => ({
            level: pickKey(patch?.level, LEVELS, current.level),
            speed: pickKey(patch?.speed, Object.keys(SPEEDS), current.speed),
            timeLimit: pickKey(patch?.timeLimit, Object.keys(TIME_LIMITS), current.timeLimit)
        })
    },

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）。全員が自動でめくる
    create: ({ players, random, settings, now }) => {
        const game = new Game(players.map(player => ({ ...player, auto: true })), {
            seed: Math.floor(random() * 2 ** 32),
            mode: 'online',
            level: pickKey(settings?.level, LEVELS, 'normal'),
            speed: pickKey(settings?.speed, Object.keys(SPEEDS), 'normal'),
            timeLimit: pickKey(settings?.timeLimit, Object.keys(TIME_LIMITS), 'normal')
        });
        game.startedAt = now;
        return game;
    },

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => ({
        players: playersOf(game),
        options: optionsOf(game),
        commands: game.commands,
        startedAt: game.startedAt
    }),
    restore: (saved) => Object.assign(Game.replay(saved.players, saved.options, saved.commands), { startedAt: saved.startedAt }),

    view: (game, seat) => createGameView(game, seat),
    spectatorView: (game) => createGameView(game, null),

    actions: {
        // 端末から送れるのは、めくる・ベルだけ。時刻はサーバーで付ける
        // CPU の番は、人の「めくる」でも進む（CPU が自動でめくるのを待たずに進めたいとき）
        command({ game, seat, message, reject, now }) {
            const command = message?.command;
            if (!command || typeof command !== 'object') return reject('今はその操作はできません');
            const t = elapsed(game, now());
            if (command.type === 'flip') {
                const mover = game.players[game.turn]?.isCPU && !game.players[seat]?.isCPU && !game.players[seat]?.out ? game.turn : seat;
                if (!game.applyCommand(mover, { type: 'flip', t })) return reject(game.lastError ?? '今はその操作はできません');
                return;
            }
            if (command.type === 'ring') {
                const ring = Number.isInteger(command.version) ? { type: 'ring', version: command.version, t } : { type: 'ring', t };
                if (!game.applyCommand(seat, ring)) return reject(game.lastError ?? '今はその操作はできません');
                return;
            }
            return reject('今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver,

    // 次に起きること（自動でめくる・CPU のベル・時間切れ）の時刻（サーバーの時刻）
    deadline: (game) => {
        if (game.isOver) return null;
        const next = nextEvent(game);
        return next ? game.startedAt + next.due : null;
    },

    // 時刻が来たことを起こす（記録の時刻は、起きる時刻そのもの）
    onDeadline(ctx) {
        const { game } = ctx;
        if (!runUntil(game, elapsed(game, ctx.now()))) ctx.ignore();
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかでベルの鳴らし方だけが変わり、
    // 記録に残るのは操作なので、再現はずれない）。切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
