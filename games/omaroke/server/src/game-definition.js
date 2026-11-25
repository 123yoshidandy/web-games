/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * 今はオンライン対戦を入れていない。入れるときは、netplay-kit の sync.mjs で部屋の処理（server/netplay/ など）を写し、
 * この定義を createHandler と startDevServer に渡す
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）だけを送る。ほかの人の手札・隠れた役割・選ぶ前のポケモンは送らない
 * よける・助ける・イベントへの答えのように、手番の人以外が答える操作もある（game.actors() が答える人を示す）
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, isCpuTurn } from '../../public/js/cpu-player.js';

const MODES = ['basic', 'expert'];
const LEVELS = ['normal', 'easy'];

// 端末から届いた操作は、操作の種類ごとに決まった項目だけを取り出す（記録に余計なものを残さない）
export function sanitize(command) {
    if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return null;
    const clean = { type: command.type };
    COMMAND_FIELDS[command.type].forEach(k => {
        if (command[k] !== undefined) clean[k] = command[k];
    });
    return clean;
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,
    rematch: 'host',

    settings: {
        defaults: () => ({ mode: 'basic', level: 'normal' }),
        validate: (patch, current) => {
            const next = { ...current, ...patch };
            if (!MODES.includes(next.mode)) throw new Error('ルールが正しくありません');
            if (!LEVELS.includes(next.level)) throw new Error('CPU の強さが正しくありません');
            return { mode: next.mode, level: next.level };
        }
    },

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）
    create: ({ players, settings, random }) => new Game(
        players.map(p => ({ name: p.name, isCPU: !!p.isCPU })),
        { seed: Math.floor(random() * 2 ** 32), mode: settings?.mode ?? 'basic', level: settings?.level ?? 'normal' }
    ),

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: game => game.persist(),
    restore: saved => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: game => game.logTotal,
    joinMark: game => Math.max(0, game.logTotal - 60),

    actions: {
        command: {
            handle({ game, seat, message, reject }) {
                // 断るときは、状態を変える前に reject する（applyCommand は断るとき状態を変えない）
                const command = sanitize(message?.command);
                if (!command) return reject('今はその操作はできません');
                if (!game.applyCommand(seat, command)) reject(game.lastError ?? '今はその操作はできません');
            }
        }
    },

    isOver: game => game.isOver(),

    // CPU の番（または CPU の答え待ち）なら進める
    cpu: {
        needsStep: game => isCpuTurn(game),
        step: game => runCpuStep(game),
        progress: game => game.commands.length
    },

    // 抜けた人の番を CPU が代わりに打つ仕組み（代行）は、オンライン対戦を入れるときに足す
    onPlayerGone(ctx) {
        ctx.ignore();
    }
};
