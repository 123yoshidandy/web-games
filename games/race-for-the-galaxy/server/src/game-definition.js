/**
 * オンライン対戦用の「ゲームの定義」（netplay-kit の README の形）
 * まだオンライン対戦は入れていない。netplay-kit を同期したら、createHandler / startDevServer にこれを渡す
 * ①サーバーがゲームを進める型：操作をサーバーで applyCommand し、操作の記録だけを保存して replay で再現する（山札もシードで再現できる）
 * 全員が同時に選ぶゲームなので、選んだ行動と開発・入植の中身は、全員がそろうまで本人のビューにだけ入る
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, cpuSeatsToAct } from '../../public/js/cpu-player.js';

const CPU_LEVELS = ['easy', 'normal'];

const str = v => (typeof v === 'string' ? v : null);
const strs = v => (Array.isArray(v) ? v.map(str) : null);

// 端末から届いた操作は、種類ごとに決まった項目だけを取り出す
function sanitize(command) {
    if (!command || typeof command !== 'object') return null;
    const { type } = command;
    switch (type) {
        case 'startDiscard': case 'discard': return { type, cards: strs(command.cards) };
        case 'action': return { type, actions: strs(command.actions) };
        case 'explore': return { type, keep: strs(command.keep) };
        case 'develop': return { type, card: command.card === null ? null : str(command.card), pay: strs(command.pay) ?? [] };
        case 'settle': {
            const out = { type, card: command.card === null ? null : str(command.card), pay: strs(command.pay) ?? [] };
            if (command.tactics !== undefined) out.tactics = strs(command.tactics);
            if (command.colonyShip !== undefined) out.colonyShip = str(command.colonyShip);
            if (command.payMilitary === true) out.payMilitary = true;
            return out;
        }
        case 'trade': return { type, good: str(command.good) };
        case 'consume': {
            if (command.done === true) return { type, done: true };
            const out = { type, use: Number.isInteger(command.use) ? command.use : null };
            if (command.goods !== undefined) out.goods = strs(command.goods);
            if (command.cards !== undefined) out.cards = strs(command.cards);
            if (command.number !== undefined) out.number = Number.isInteger(command.number) ? command.number : null;
            return out;
        }
        case 'windfall': return { type, world: str(command.world) };
        default: return null;
    }
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,
    rematch: 'host',

    settings: {
        defaults: () => ({ cpuLevel: 'normal', advanced: false }),
        validate: (patch, current) => {
            const next = { ...current, ...patch };
            if (!CPU_LEVELS.includes(next.cpuLevel)) throw new Error('CPU の強さが正しくありません');
            if (typeof next.advanced !== 'boolean') throw new Error('上級ルールの設定が正しくありません');
            return { cpuLevel: next.cpuLevel, advanced: next.advanced };
        }
    },

    // 上級ルールは 2 人のときだけ（Game の側でも 3 人以上なら使わない）
    create: ({ players, settings, random }) => new Game(
        players.map(p => ({ name: p.name, isCPU: !!p.isCPU })),
        { seed: Math.floor(random() * 2 ** 32), advanced: settings.advanced, cpuLevel: settings.cpuLevel }
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

    // 抜けた人の番を CPU が代わりに打つ仕組み（代行）は、オンライン対戦を入れるときに足す
    onPlayerGone(ctx) {
        ctx.ignore();
    }
};
