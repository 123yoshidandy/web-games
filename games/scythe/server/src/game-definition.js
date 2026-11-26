/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 部屋には参加者・シード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
 * 各プレイヤーには、そのプレイヤーから見える状態（ビュー）だけを送る。ほかの人の戦闘カードの数字と目標は、終わるまで送らない
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { runCpuStep, cpuActors, PROFILES } from '../../public/js/cpu-player.js';
import { FACTION_KEYS, MATS, MAT_KEYS, BANNED } from '../../public/js/data.js';

const shuffled = (list, random) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// 勢力とマットを部屋の側で先に決める。Game は手番をマットの番号の小さい順に並べ替えるので、
// 番号の小さい順に席0から配って、部屋の席とゲームの席（と手番の順）をそろえる。禁じられた組み合わせは避ける
function withSeats(players, random) {
    const mats = shuffled(MAT_KEYS, random).slice(0, players.length).sort((a, b) => MATS[a].no - MATS[b].no);
    const factions = [];
    mats.forEach(mat => {
        const free = shuffled(FACTION_KEYS.filter(f => !factions.includes(f)), random);
        factions.push(free.find(f => !BANNED.some(([bf, bm]) => bf === f && bm === mat)) ?? free[0]);
    });
    return players.map((p, i) => ({ ...p, faction: factions[i], mat: mats[i] }));
}

export default {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）
    create: ({ players, random }) => {
        const seed = Math.floor(random() * 2 ** 32);
        return new Game(withSeats(players, random), { seed });
    },

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    // game.persist() は始めたときの参加者を写すので、抜けた席を CPU にした分（onPlayerGone）は今の isCPU で上書きする
    // （ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    persist: (game) => {
        const saved = game.persist();
        saved.players = saved.players.map((p, i) => ({ ...p, isCPU: Boolean(game.players[i].isCPU) }));
        return saved;
    },
    restore: (saved) => Game.replay(saved.players, saved.options, saved.commands),

    view: (game, seat, { since } = {}) => createGameView(game, seat, { since: since ?? 0 }),
    spectatorView: (game, { since } = {}) => createGameView(game, null, { since: since ?? 0 }),
    mark: (game) => game.logs.length,
    joinMark: (game) => Math.max(0, game.logs.length - 50),

    actions: {
        command({ game, seat, message, reject }) {
            // 操作の中身の検証と、記録する項目の絞り込みは Game.applyCommand が行う（断るときは状態を変えない）
            const command = message?.command;
            if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
                return reject('今はその操作はできません');
            }
            if (!game.applyCommand(seat, command)) return reject(game.lastError ?? '今はその操作はできません');
        }
    },

    isOver: (game) => game.isOver(),

    // 戦闘では2人が同時に選ぶので、操作が必要な CPU を1人ずつ進める
    cpu: {
        needsStep: (game) => cpuActors(game).length > 0,
        step: (game) => runCpuStep(game, cpuActors(game)[0], PROFILES.normal),
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかに関係しないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver()) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
