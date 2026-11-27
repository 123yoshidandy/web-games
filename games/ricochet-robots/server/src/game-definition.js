/**
 * リコシェロボットのオンライン対戦（ゲームの定義。部屋の処理は netplay-kit の共通部品）
 *
 * サーバーがゲームを進める：宣言・パス・実演はサーバーの時計で時刻を付けて applyCommand し、手数の検証と実演の判定もサーバーが行う
 * 砂時計・実演の持ち時間・CPU の宣言は、期限（deadline）として返し、届いたメッセージ（ping・端末が数秒ごとに送る tick）のたびに確かめる
 * 保存するのは参加者・設定・シード・操作の記録だけで、読み込むたびに Game.replay で作り直す
 * ビューにはシードも目標をめくる順も入れない（先の目標が分かってしまうため。perfectInformation にはしない）
 * 対戦中に抜けた人の席は CPU が引き継ぐ（isCPU は保存するので、読み込み直しても CPU のまま）
 */

import { GameError } from 'netplay-kit/server/room-service.js';
import Game, { TARGET_OPTIONS, DEFAULT_TARGETS, MAX_BID } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { nextEventTime, runDue, stepDue, LEVEL_KEYS } from '../../public/js/cpu-player.js';
import { isMoveList } from '../../public/js/board.js';

const SILVER = ['off', 'on'];

// 端末から届いた操作を、決まった種類と項目に絞る（時間切れ・ヒント・1人の練習の操作は送れない）
function cleanCommand(command) {
    if (!command || typeof command !== 'object') return null;
    switch (command.type) {
        case 'declare':
            return Number.isInteger(command.count) && command.count >= 1 && command.count <= MAX_BID ? { type: 'declare', count: command.count } : null;
        case 'pass':
            return { type: 'pass' };
        case 'demo':
            return isMoveList(command.moves, 5, MAX_BID) ? { type: 'demo', moves: command.moves.map(([robot, dir]) => [robot, dir]) } : null;
        default:
            return null;
    }
}

export default {
    minPlayers: 2,
    maxPlayers: 4,
    allowCpu: true,
    rematch: 'host',
    roomTtlSeconds: 24 * 60 * 60,
    maxCpuSteps: 400,

    settings: {
        defaults: () => ({ level: 'normal', targets: String(DEFAULT_TARGETS), silver: 'off' }),
        validate(patch, current) {
            const next = { ...current, ...patch };
            if (!LEVEL_KEYS.includes(next.level)) throw new GameError('CPU の強さが正しくありません');
            if (!TARGET_OPTIONS.map(String).includes(String(next.targets))) throw new GameError('目標の数が正しくありません');
            if (!SILVER.includes(next.silver)) throw new GameError('銀のロボットの設定が正しくありません');
            return { level: next.level, targets: String(next.targets), silver: next.silver };
        }
    },

    create({ players, settings, random, now }) {
        const options = {
            seed: Math.floor(random() * 2 ** 32),
            mode: 'race',
            level: settings.level,
            targets: Number(settings.targets),
            silver: settings.silver === 'on',
            startAt: now
        };
        return new Game(players.map(player => ({ name: player.name, isCPU: player.isCPU })), options);
    },

    persist: (game) => ({
        players: game.players.map(player => ({ name: player.name, isCPU: player.isCPU })),
        options: { ...game.options },
        commands: game.commands
    }),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat) => createGameView(game, seat),

    actions: {
        command(ctx) {
            const { game, seat, message } = ctx;
            const command = cleanCommand(message.command);
            if (!command) return ctx.reject('できない操作です');
            // 先に、今の時刻までに起きた出来事（時間切れ・CPU の宣言）を進める
            const now = ctx.now();
            runDue(game, now);
            if (!game.applyCommand(seat, { ...command, at: now })) return ctx.reject(game.lastError);
        },
        // 時間で進む出来事を確かめてもらうためだけの知らせ（期限の確認は、届いたメッセージのたびに共通部品が行う）
        tick: { readOnly: true, handle: (ctx) => ctx.ignore() }
    },

    // 砂時計・実演の持ち時間・CPU の宣言の時刻
    deadline: (game) => nextEventTime(game),
    onDeadline(ctx) {
        if (!runDue(ctx.game, ctx.now())) ctx.ignore();
    },

    cpu: {
        step: (game, { now }) => stepDue(game, now),
        progress: (game) => game.commands.length
    },

    isOver: (game) => game.isOver(),

    // 利用者ごとの記録：game.result は関数なので、共通部品が自動では読めない。席ごとの順位（同点は同じ順位）にして渡す
    result(game) {
        if (!game.isOver()) return null;
        const ranks = [];
        for (const entry of game.result().standings) ranks[entry.seat] = entry.rank;
        return { ranks };
    },

    // 対戦中に部屋を出た人の席は、CPU が引き継ぐ（切断は戻ってくるかもしれないので待つ。砂時計は止まらない）
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
