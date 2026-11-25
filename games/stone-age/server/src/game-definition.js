/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * 今はオンライン対戦を入れていない。入れるときは、netplay-kit の sync.mjs で部屋の処理（server/netplay/ など）を写し、
 * この定義を createHandler と startDevServer に渡す
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 山の並びを隠すのはビュー（createGameView）の役目。各プレイヤーには、そのプレイヤーから見える状態だけを送る
 * - 文明カードの山は枚数だけ。建物の山は表の1枚と枚数だけ
 * - 追加のカードで伏せて取ったカードは、本人にだけ入れる（観戦者には入れない）
 * - サイコロの目はシードから決まるので、シードはビューに入れない（入れると先の目が分かる）
 * - 操作を待っている人は、いつも0人か1人（game.actors()）。ダイスのカードでは、買った人以外の番も来る
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

const RESOURCE_KEYS = ['wood', 'clay', 'stone', 'gold'];
const int = (value) => (Number.isInteger(value) ? value : -1);
const amount = (value) => (value && typeof value === 'object'
    ? Object.fromEntries(RESOURCE_KEYS.map(r => [r, int(value[r] ?? 0)]))
    : null);
const ints = (value) => (Array.isArray(value) ? value.slice(0, 8).map(int) : []);

// 端末から届いた操作は、種類ごとに決まった項目だけを取り出す（中身の検証は Game.applyCommand が行う）
export function sanitize(command) {
    if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return null;
    const { type } = command;
    switch (type) {
        case 'place': return { type, place: String(command.place ?? '').slice(0, 12), count: int(command.count) };
        case 'resolve': return { type, place: String(command.place ?? '').slice(0, 12) };
        case 'tools': return { type, tools: ints(command.tools), oneUse: ints(command.oneUse) };
        case 'pay': return { type, pay: amount(command.pay) };
        case 'decline': return { type };
        case 'pickDie': return { type, die: int(command.die) };
        case 'feed': return { type, pay: command.pay === null ? null : amount(command.pay) };
        case 'choice2': return { type, take: amount(command.take) };
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
