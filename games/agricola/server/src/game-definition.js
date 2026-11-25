/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * 今はオンライン対戦を入れていない。入れるときは、netplay-kit の sync.mjs で部屋の処理（server/netplay/ など）を写し、
 * この定義を createHandler と startDevServer に渡す
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * アグリコラは公開情報のゲーム。ビューで隠すのは、これから出るラウンドカードの順とシードだけ
 * 操作を待っている人は game.actors()。収穫の食事では、何人も同時に待つ
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

const int = (v) => (Number.isInteger(v) ? v : -1);
const ints = (v, max = 15) => (Array.isArray(v) ? v.slice(0, max).map(int) : []);
const str = (v) => (typeof v === 'string' ? v.slice(0, 20) : null);
const counts = (v, keys) => (v && typeof v === 'object' ? Object.fromEntries(keys.map(k => [k, int(v[k] ?? 0)])) : {});

// 端末から届いた操作は、種類ごとに決まった項目だけを取り出す（中身の検証は Game.applyCommand が行う）
export function sanitize(command) {
    if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return null;
    if (command.type === 'keep') return { type: 'keep', animals: counts(command.animals, ['sheep', 'boar', 'cattle']) };
    if (command.type === 'feed') {
        return {
            type: 'feed',
            convert: counts(command.convert, ['grain', 'veg', 'sheep', 'boar', 'cattle']),
            crafts: Array.isArray(command.crafts) ? command.crafts.slice(0, 3).map(str) : []
        };
    }
    const out = { type: 'act', space: str(command.space) };
    if ('rooms' in command) out.rooms = ints(command.rooms);
    if ('stables' in command) out.stables = ints(command.stables, 4);
    if ('cell' in command) out.cell = command.cell === null ? null : int(command.cell);
    if ('sow' in command) out.sow = Array.isArray(command.sow) ? command.sow.slice(0, 15).map(s => ({ cell: int(s?.cell), crop: str(s?.crop) })) : [];
    if ('bake' in command) out.bake = int(command.bake);
    if ('pastures' in command) out.pastures = Array.isArray(command.pastures) ? command.pastures.slice(0, 15).map(p => ints(p)) : [];
    if ('major' in command) out.major = command.major === null ? null : str(command.major);
    if ('payWith' in command) out.payWith = command.payWith === null ? null : str(command.payWith);
    if ('res' in command) out.res = str(command.res);
    return out;
}

export default {
    minPlayers: Math.max(2, MIN_PLAYERS),
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // シードは、共通部品の乱数から作る（テストでは乱数を固定できる）。部屋の CPU は「ふつう」で打つ
    create: ({ players, random }) => new Game(
        players.map(p => ({ ...p, cpuLevel: p.isCPU ? 'normal' : null })),
        { seed: Math.floor(random() * 2 ** 32) }
    ),

    persist: (game) => game.persist(),
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.logs.length,
    joinMark: (game) => Math.max(0, game.logs.length - 50),

    actions: {
        command({ game, seat, message, reject }) {
            // 断るときは、状態を変える前に reject する（applyCommand は断るとき状態を変えない）
            const command = sanitize(message?.command);
            if (!command) return reject('今はその操作はできません');
            if (!game.applyCommand(seat, command)) return reject(game.lastError ?? '今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver(),

    cpu: {
        needsStep: (game) => isCpuTurn(game),
        step: (game) => runCpuStep(game),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU（ふつう）が代わりに続ける。切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
        ctx.game.players[seat].cpuLevel = 'normal';
    }
};
