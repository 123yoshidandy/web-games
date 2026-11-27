/**
 * オンライン対戦用の「ゲームの定義」（netplay-kit の README の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 * ①サーバーがゲームを進める型：操作をサーバーで applyCommand し、操作の記録だけを保存して replay で再現する（ダイスもシードで再現できる）
 * 2人の協力ゲーム：席0（ホスト）が機長、席1が副操縦士。相手のまだ置いていないダイスの目は、ビューに入れない
 */

import Game, { PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, cpuSeatsToAct, CPU_LEVELS } from '../../public/js/cpu-player.js';
import { AIRPORT_KEYS } from '../../public/js/rules.js';

// 端末から届いた操作は、決まった種類と項目だけを取り出す
function sanitize(command) {
    if (!command || typeof command !== 'object') return null;
    if (command.type === 'place') return { type: 'place', die: command.die, slot: command.slot, delta: command.delta ?? 0 };
    if (command.type === 'reroll') return { type: 'reroll', dice: Array.isArray(command.dice) ? command.dice.slice(0, 4) : null };
    if (command.type === 'discard') return { type: 'discard', die: command.die };
    return null;
}

export default {
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    allowCpu: true,
    rematch: 'host',

    settings: {
        defaults: () => ({ airport: 'YUL', cpuLevel: 'normal' }),
        validate: (patch, current) => {
            const next = { ...current, ...patch };
            if (!AIRPORT_KEYS.includes(next.airport)) throw new Error('空港が正しくありません');
            if (!CPU_LEVELS.includes(next.cpuLevel)) throw new Error('CPU の強さが正しくありません');
            return { airport: next.airport, cpuLevel: next.cpuLevel };
        }
    },

    create: ({ players, settings, random }) => new Game(
        players.map(p => ({ name: p.name, isCPU: !!p.isCPU })),
        { seed: Math.floor(random() * 2 ** 32), airport: settings.airport, cpuLevel: settings.cpuLevel }
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
    joinMark: game => Math.max(0, game.eventSeq - 120),

    actions: {
        command: {
            handle({ game, seat, message, reject }) {
                // 断るときは、状態を変える前に reject する（applyCommand は断るとき状態を変えない）
                if (!game.applyCommand(seat, sanitize(message.command))) reject(game.lastError);
            }
        }
    },

    isOver: game => game.isOver(),

    // 利用者ごとの記録：協力のゲームなので、着陸できたかどうか（全員が同じ結果）
    result: game => ({ coop: true, won: game.won }),

    cpu: {
        needsStep: game => cpuSeatsToAct(game).length > 0,
        step: game => {
            const seat = cpuSeatsToAct(game)[0];
            return seat !== undefined && runCpuStep(game, seat, () => game.options.cpuLevel);
        },
        progress: game => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに置く（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
