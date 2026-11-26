/**
 * オンライン対戦用の「ゲームの定義」（netplay-kit の README の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 * ①サーバーがゲームを進める型：操作をサーバーで applyCommand し、操作の記録だけを保存して replay で再現する（山札もシードで再現できる）
 * 判断は 1 度に 1 人だけ（準備と研究も 1 人ずつ順に選ぶ）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuToAct } from '../../public/js/cpu-player.js';

const CPU_LEVELS = ['easy', 'normal'];

const int = v => (Number.isInteger(v) ? v : null);
const str = v => (typeof v === 'string' ? v : null);

// 端末から届いた操作は、種類ごとに決まった項目だけを取り出す
const strs = v => (Array.isArray(v) ? v.map(str) : null);
const nonNeg = v => (Number.isInteger(v) && v >= 0 ? v : 0);
function sanitize(command) {
    if (!command || typeof command !== 'object') return null;
    const { type } = command;
    switch (type) {
        case 'setup': return { type, corp: str(command.corp), keep: strs(command.keep) };
        case 'research': return { type, keep: strs(command.keep) };
        case 'play': return { type, card: str(command.card), pay: { steel: nonNeg(command.pay?.steel), titanium: nonNeg(command.pay?.titanium), heat: nonNeg(command.pay?.heat) } };
        case 'standard': return command.project === 'sellPatents' ? { type, project: 'sellPatents', cards: strs(command.cards) } : { type, project: str(command.project) };
        case 'convertPlants': case 'convertHeat': case 'unmi': case 'endTurn': case 'pass': return { type };
        case 'milestone': case 'award': return { type, key: str(command.key) };
        case 'place': return { type, space: str(command.space) };
        case 'target': return { type, seat: command.seat === null ? null : int(command.seat) };
        case 'choose': return { type, index: int(command.index) };
        case 'cardAction': return { type, card: str(command.card), variant: int(command.variant) ?? 0 };
        case 'targetCard': return { type, seat: int(command.seat), card: str(command.card) };
        case 'finalGreenery': return { type, space: command.space === null ? null : str(command.space) };
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
    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
