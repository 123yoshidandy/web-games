/**
 * オンライン対戦用の「ゲームの定義」（netplay-kit の README の形）
 * まだオンライン対戦は入れていない。netplay-kit を同期したら、createHandler / startDevServer にこれを渡す
 * ①サーバーがゲームを進める型：操作をサーバーで applyCommand し、操作の記録だけを保存して replay で再現する（農園の山もシードで再現できる）
 * 判断は 1 度に 1 人だけ。役割は総督から順に選び、役割の中の判断は選んだ人から順に回る
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuToAct } from '../../public/js/cpu-player.js';

const CPU_LEVELS = ['easy', 'normal'];

const int = v => (Number.isInteger(v) ? v : null);
const str = v => (typeof v === 'string' ? v : null);

// 端末から届いた操作は、種類ごとに決まった項目だけを取り出す
function sanitize(command) {
    if (!command || typeof command !== 'object') return null;
    const { type } = command;
    switch (type) {
        case 'role': return { type, role: int(command.role) };
        case 'hacienda': return { type };
        case 'settle': return { type, take: command.take === null ? null : command.take === 'quarry' ? 'quarry' : int(command.take) };
        case 'mayor': return {
            type,
            island: Array.isArray(command.island) ? command.island.map(v => v === true) : null,
            city: Array.isArray(command.city) ? command.city.map(int) : null
        };
        case 'build': return { type, building: command.building === null ? null : str(command.building) };
        case 'privilege': case 'sell': return { type, good: command.good === null ? null : str(command.good) };
        case 'ship': return command.pass === true ? { type, pass: true } : { type, good: str(command.good), ship: command.ship === 'wharf' ? 'wharf' : int(command.ship) };
        case 'store': return { type, warehouse: Array.isArray(command.warehouse) ? command.warehouse.map(str) : null, single: command.single === null ? null : str(command.single) };
        default: return null;
    }
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

    cpu: {
        needsStep: game => isCpuToAct(game),
        step: game => runCpuStep(game, () => game.options.cpuLevel ?? 'normal'),
        progress: game => game.commands.length
    },

    // 抜けた人の番を CPU が代わりに打つ仕組み（代行）は、オンライン対戦を入れるときに足す
    onPlayerGone(ctx) {
        ctx.ignore();
    }
};
