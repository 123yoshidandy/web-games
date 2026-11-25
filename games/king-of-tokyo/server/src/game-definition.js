/**
 * オンライン対戦用の「ゲームの定義」（netplay-kit の README の形）
 * まだオンライン対戦は入れていない。netplay-kit を同期したら、createHandler / startDevServer にこれを渡す
 * ①サーバーがゲームを進める型：操作をサーバーで applyCommand し、操作の記録だけを保存して replay で再現する（ダイスも山札もシードで再現できる）
 * 判断（ダイス・購入・東京を明け渡すか・翼など）は 1 度に 1 人だけ。ほかの人の番でも、東京にいる人や翼を持つ人に判断が回る
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
        case 'reroll': return { type, dice: Array.isArray(command.dice) ? command.dice.map(int) : null };
        case 'change': return { type, index: int(command.index), face: str(command.face), card: str(command.card) };
        case 'resolve': case 'endBuy': case 'sweep': case 'buyTop': case 'rapidHeal': return { type };
        case 'buy': return { type, card: str(command.card) };
        case 'buyFrom': return { type, seat: int(command.seat), card: str(command.card) };
        case 'yield': case 'wings': return { type, yes: command.yes === true };
        case 'probe': return { type, index: command.index === null ? null : int(command.index) };
        case 'healingRay': {
            const give = {};
            if (command.give && typeof command.give === 'object') {
                for (const [seat, n] of Object.entries(command.give)) if (/^\d$/.test(seat) && Number.isInteger(n)) give[seat] = n;
            }
            return { type, give };
        }
        case 'opportunist': return { type, card: command.card === null ? null : str(command.card) };
        case 'mimic': return { type, target: command.target && typeof command.target === 'object' ? { seat: int(command.target.seat), card: str(command.target.card) } : null };
        case 'metamorph': return { type, cards: Array.isArray(command.cards) ? command.cards.map(str) : [] };
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
