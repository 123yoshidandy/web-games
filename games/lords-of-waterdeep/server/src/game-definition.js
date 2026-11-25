/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * 今はオンライン対戦を入れていない。入れるときは、netplay-kit の sync.mjs で部屋の処理（server/netplay/ など）を写し、
 * この定義を createHandler と startDevServer に渡す
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 隠すのはビュー（createGameView）の役目。各プレイヤーには、そのプレイヤーから見える状態だけを送る
 * - 山札は枚数だけ。陰謀カードの手札・ロード・達成したクエスト（プロット以外）は本人にだけ
 * - 操作を待っている人は、いつも0人か1人（game.actors()）。陰謀カードの効果で、相手の番に答えることもある
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

const int = (value) => (Number.isInteger(value) ? value : -1);
const str = (value, max = 24) => String(value ?? '').slice(0, max);
const cubes = (value) => (value && typeof value === 'object'
    ? Object.fromEntries(['f', 'r', 'w', 'c'].map(k => [k, int(value[k] ?? 0)]))
    : null);

// 端末から届いた操作は、種類ごとに決まった項目だけを取り出す（中身の検証は Game.applyCommand が行う）
export function sanitize(command) {
    if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return null;
    const { type } = command;
    switch (type) {
        case 'place': return { type, space: str(command.space) };
        case 'pick': return { type, cubes: cubes(command.cubes) };
        case 'quest': return { type, index: int(command.index) };
        case 'buy': return { type, building: str(command.building) };
        case 'intrigue': return { type, index: int(command.index) };
        case 'opponent': return { type, seat: int(command.seat) };
        case 'option': return { type, index: int(command.index) };
        case 'target': return { type, space: str(command.space) };
        case 'complete': return { type, quest: command.quest === null ? null : str(command.quest, 8) };
        default: return null;
    }
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // シードは、共通部品の乱数から作る（テストでは乱数を固定できる）
    // 部屋の CPU は「ふつう」で打つ
    create: ({ players, random }) => new Game(
        players.map(p => ({ ...p, cpuLevel: p.isCPU ? 'normal' : null })),
        { seed: Math.floor(random() * 2 ** 32) }
    ),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
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

    // 対戦中に部屋を出た人の席は、CPU（ふつう）が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
        ctx.game.players[seat].cpuLevel = 'normal';
    }
};
