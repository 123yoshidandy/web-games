/**
 * ウボンゴのオンライン対戦（ゲームの定義）
 * 部屋の作成・参加・再接続・保存・送信などは netplay-kit の共通部品が行い、ここでは対戦の中身だけを決める
 *
 * 早解きの型：全員が同時に自分の問題を解き、解いた順をサーバーの時計で決める
 * - 問題（盤面の形とピース）はサーバーがシードから作ってビューで配る。シード・乱数・山札・CPU の予定の時刻はビューに入れない
 * - 端末は解答（ピースの置き方）を送り、サーバーが盤面をちょうど埋めているかを確かめる。時刻は端末の値を使わず、サーバーの時計で測る
 * - ラウンドの始まりは startAt（サーバーの時刻）。最初の COUNTDOWN_MS は数えるだけで、解く時間はそのあとから
 * - CPU が解く時刻・時間切れ・宝石を選ぶ期限は deadline で扱う（Lambda はタイマーを持てないので、届いたメッセージのたびに確かめる。
 *   端末は、ビューの nextEventIn・pickAt から期限の時刻を知って ping を送る）
 * - 人が全員終えたら、残りの CPU は予定の時刻で結果を決めて、ラウンドを締める
 * - 対戦中に抜けた人の席は CPU が引き継ぐ（状態の players[].isCPU。状態はそのまま保存するので、復元しても CPU のまま）
 */

import { GameError } from 'netplay-kit/server/room-service.js';
import {
    createGame, applyCommand, viewFor, takeOver, nextEventTime, pickerOf, isOver,
    LEVELS, TIME_LIMITS, DEFAULT_TIME_LIMIT, DIFFICULTIES, MAX_PLAYERS
} from '../../public/js/game.js';
import { cpuCommand, chooseRow } from '../../public/js/cpu-player.js';

export const COUNTDOWN_MS = 3000; // ラウンドの問題を配ってから解き始めるまで
export const PICK_MS = 20000;     // 宝石の列を選ぶ時間。過ぎたら、おすすめの列を選んだことにする
const CLIENT_COMMANDS = new Set(['submit', 'giveUp', 'pick']);

// 時刻（ラウンドの始まり・宝石の番の始まり）を、状態が変わったあとに合わせる
const snapshot = (state) => ({ round: state.round, picker: pickerOf(state), index: state.collect?.index ?? null });
function syncClock(state, before, now) {
    if (state.round !== before.round) state.startAt = now + COUNTDOWN_MS;
    const picker = pickerOf(state);
    if (picker === null) state.pickAt = null;
    else if (state.round !== before.round || picker !== before.picker || state.collect.index !== before.index) state.pickAt = now;
}

const elapsed = (state, now) => Math.max(0, now - (state.startAt ?? now));

// 端末から届いた置き方を、決まった項目だけにする
const cleanPlacements = (list) => (Array.isArray(list) ? list.slice(0, 5).map(p => ({
    id: String(p?.id ?? ''),
    rot: Number(p?.rot),
    flip: Number(p?.flip),
    x: Number(p?.x),
    y: Number(p?.y)
})) : []);

function run(ctx, seat, command) {
    const state = ctx.game;
    const before = snapshot(state);
    const result = applyCommand(state, seat, command);
    if (result.ok) syncClock(state, before, ctx.now());
    return result;
}

export default {
    minPlayers: 2,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,
    rematch: 'host',
    maxMessageLength: 4096,

    settings: {
        defaults: () => ({ level: 'normal', difficulty: 3, time: DEFAULT_TIME_LIMIT }),
        validate(patch, current) {
            const next = { ...current, ...patch };
            next.difficulty = Number(next.difficulty);
            next.time = Number(next.time);
            if (!LEVELS.includes(next.level)) throw new GameError('CPU の強さが違います');
            if (!DIFFICULTIES.includes(next.difficulty)) throw new GameError('ピースの数は3か4です');
            if (!TIME_LIMITS.includes(next.time)) throw new GameError('制限時間が違います');
            return { level: next.level, difficulty: next.difficulty, time: next.time };
        }
    },

    create({ players, settings, random, now }) {
        const state = createGame({
            players: players.map(p => ({ name: p.name, isCPU: Boolean(p.isCPU) })),
            seed: Math.floor(random() * 2 ** 32),
            difficulty: settings.difficulty,
            timeLimit: settings.time,
            level: settings.level
        });
        state.startAt = now + COUNTDOWN_MS;
        state.pickAt = null;
        return state;
    },

    view: (game, seat) => ({ ...viewFor(game, seat), pickMs: PICK_MS, online: true }),

    actions: {
        command(ctx) {
            const sent = ctx.message.command;
            if (!sent || typeof sent !== 'object' || !CLIENT_COMMANDS.has(sent.type)) return ctx.reject('この操作はできません');
            const t = elapsed(ctx.game, ctx.now());
            const command = sent.type === 'submit' ? { type: 'submit', placements: cleanPlacements(sent.placements), t }
                : sent.type === 'giveUp' ? { type: 'giveUp', t }
                    : { type: 'pick', row: Number(sent.row) };
            const result = run(ctx, ctx.seat, command);
            if (!result.ok) return ctx.reject(result.error);
        }
    },

    isOver: (game) => isOver(game),

    // CPU が宝石を取る番なら、続けて取る
    cpu: {
        needsStep: (game) => cpuCommand(game) !== null,
        step(game, { now }) {
            const next = cpuCommand(game);
            if (!next) return false;
            const before = snapshot(game);
            const result = applyCommand(game, next.seat, next.command);
            if (result.ok) syncClock(game, before, now);
            return result.ok;
        }
    },

    // 次の期限：解く時間なら CPU が解く時刻か時間切れ、宝石なら人の番の期限
    deadline(game) {
        if (game.phase === 'play') {
            const next = nextEventTime(game);
            return next === null ? null : game.startAt + next;
        }
        if (game.phase === 'collect') {
            const seat = pickerOf(game);
            return game.players[seat].isCPU ? null : game.pickAt + PICK_MS;
        }
        return null;
    },
    onDeadline(ctx) {
        const game = ctx.game;
        if (game.phase === 'play') {
            const t = elapsed(game, ctx.now());
            run(ctx, null, t >= game.timeLimit ? { type: 'timeUp' } : { type: 'tick', t });
        } else if (game.phase === 'collect') {
            const seat = pickerOf(game);
            run(ctx, seat, { type: 'pick', row: chooseRow(game, seat) });
        }
    },

    // 対戦中に部屋を出た人の席は CPU が引き継ぐ（切断は戻ってくるかもしれないので待つ）
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || isOver(ctx.game)) return ctx.ignore();
        const before = snapshot(ctx.game);
        takeOver(ctx.game, seat, elapsed(ctx.game, ctx.now()));
        syncClock(ctx.game, before, ctx.now());
    }
};
