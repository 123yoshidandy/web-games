/**
 * オンライン対戦用の「ゲームの定義」（netplay-kit の README の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 * ①サーバーがゲームを進める型：操作をサーバーで applyCommand し、操作の記録だけを保存して replay で再現する（配るカードもシードで再現できる）
 * 全員が同時に選ぶゲームなので、選んだ中身は公開まで本人のビューにだけ入る（観戦者には誰の手札も入れない）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, cpuSeatsToAct } from '../../public/js/cpu-player.js';

const CPU_LEVELS = ['easy', 'normal'];
const SIDES = ['A', 'B', 'random'];

// 端末から届いた操作は、決まった項目だけを取り出す
function sanitize(command) {
    if (!command || typeof command !== 'object') return null;
    if (command.type === 'discardBuild') return { type: 'discardBuild', card: command.card ?? null };
    const pay = command.pay && typeof command.pay === 'object' ? { left: command.pay.left, right: command.pay.right } : undefined;
    return { type: command.type, card: command.card, action: command.action, pay, free: command.free ?? null };
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,
    rematch: 'host',

    settings: {
        defaults: () => ({ cpuLevel: 'normal', sides: 'A' }),
        validate: (patch, current) => {
            const next = { ...current, ...patch };
            if (!CPU_LEVELS.includes(next.cpuLevel)) throw new Error('CPU の強さが正しくありません');
            if (!SIDES.includes(next.sides)) throw new Error('不思議の面が正しくありません');
            return { cpuLevel: next.cpuLevel, sides: next.sides };
        }
    },

    create: ({ players, settings, random }) => new Game(
        players.map(p => ({ name: p.name, isCPU: !!p.isCPU })),
        { seed: Math.floor(random() * 2 ** 32), sides: settings.sides, cpuLevel: settings.cpuLevel }
    ),
    persist: game => ({
        players: game.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
        options: game.options,
        commands: game.commands
    }),
    restore: saved => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since }) => createGameView(game, seat, { since }),
    spectatorView: (game, { since }) => createGameView(game, null, { since }),
    mark: game => game.eventSeq,
    joinMark: game => Math.max(0, game.eventSeq - 60),

    actions: {
        command: {
            handle({ game, seat, message, reject }) {
                // 断るときは、状態を変える前に reject する（applyCommand は断るとき状態を変えない）
                if (!game.applyCommand(seat, sanitize(message.command))) reject(game.lastError);
            }
        }
    },

    isOver: game => game.isOver(),

    // 同時に選ぶので、選ぶ番の CPU を 1 人ずつ進める
    cpu: {
        needsStep: game => cpuSeatsToAct(game).length > 0,
        step: game => {
            const seat = cpuSeatsToAct(game)[0];
            return seat !== undefined && runCpuStep(game, seat, () => game.options.cpuLevel ?? 'normal');
        },
        progress: game => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに選ぶ（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
