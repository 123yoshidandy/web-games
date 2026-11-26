/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 隠すのはビュー（createGameView）の役目：山の並び（段階3のカードの位置）と、準備で伏せて抜いた発電所は見せない
 * 操作を待っている人は game.actors()（競りの選ぶ人・値を付ける人・手放す人、資源と建設の番の人）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

const int = (v) => (Number.isInteger(v) ? v : -1);
const count = (v) => (v === undefined ? 0 : int(v));

// 端末から届いた操作は、種類ごとに決まった項目だけを取り出す（中身の検証は Game.applyCommand が行う）
export function sanitize(command) {
    if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return null;
    const { type } = command;
    switch (type) {
        case 'choose': return { type, plant: int(command.plant), bid: int(command.bid) };
        case 'bid': return { type, amount: int(command.amount) };
        case 'discard': return { type, plant: int(command.plant) };
        case 'buy': return { type, coal: count(command.coal), oil: count(command.oil), garbage: count(command.garbage), uranium: count(command.uranium) };
        case 'build': return { type, city: typeof command.city === 'string' ? command.city.slice(0, 40) : '' };
        default: return { type };
    }
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // ロビーの設定：地図（ドイツ・アメリカ）
    settings: {
        defaults: () => ({ map: 'germany' }),
        validate: (patch, current) => ({ map: ['germany', 'usa'].includes(patch?.map) ? patch.map : current.map })
    },

    // シードは、共通部品の乱数から作る（テストでは乱数を固定できる）。部屋の CPU は「ふつう」で打つ
    create: ({ players, random, settings }) => new Game(
        players.map(p => ({ ...p, cpuLevel: p.isCPU ? 'normal' : null })),
        { seed: Math.floor(random() * 2 ** 32), map: settings?.map === 'usa' ? 'usa' : 'germany' }
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
