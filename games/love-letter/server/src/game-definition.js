/**
 * オンライン対戦用の「ゲームの定義」（netplay-kit の README の形）
 * まだオンライン対戦は入れていない。netplay-kit を同期したら、createHandler / startDevServer にこれを渡す
 * ①サーバーがゲームを進める型：操作をサーバーで applyCommand し、操作の記録だけを保存して replay で再現する（山札もシードで再現できる）
 * 隠された情報があるので、各人のビューには、その人の手札と知っていることだけを入れる（観戦者には誰の手札も入れない）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

const CPU_LEVELS = ['easy', 'normal'];

// 端末から届いた操作は、決まった項目だけを取り出す
function sanitize(command) {
    if (!command || typeof command !== 'object') return null;
    if (command.type === 'keep') return { type: 'keep', card: command.card, bottom: command.bottom };
    return { type: command.type, card: command.card, target: command.target ?? null, guess: command.guess ?? null };
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,
    rematch: 'host',

    settings: {
        defaults: () => ({ cpuLevel: 'normal' }),
        validate: (patch, current) => {
            const next = { ...current, ...patch };
            if (!CPU_LEVELS.includes(next.cpuLevel)) throw new Error('CPU の強さが正しくありません');
            return { cpuLevel: next.cpuLevel };
        }
    },

    create: ({ players, settings, random }) => new Game(
        players.map(p => ({ name: p.name, isCPU: !!p.isCPU })),
        { seed: Math.floor(random() * 2 ** 32), cpuLevel: settings.cpuLevel }
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

    cpu: {
        needsStep: game => isCpuTurn(game),
        step: game => runCpuStep(game, () => game.options.cpuLevel ?? 'normal'),
        progress: game => game.commands.length
    },

    // 抜けた人の番を CPU が代わりに打つ仕組み（代行）は、オンライン対戦を入れるときに足す
    onPlayerGone(ctx) {
        ctx.ignore();
    }
};
