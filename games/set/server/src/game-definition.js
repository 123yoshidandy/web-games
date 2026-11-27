/**
 * オンライン対戦に差し込むゲームの定義（netplay-kit の「ゲームの定義」の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 *
 * 早い者勝ち：全員が同じ場を見て、見つけたセットをサーバーに送る。サーバーは届いた順に確かめ、最初に届いた正しい組が取る
 * - 操作の時刻は、端末の時計ではなくサーバーの時計で付ける（始まりからのミリ秒）。端末が時刻をごまかしても効かない
 * - 先に取られたカードを含む組は、まちがいにせず断る（「先に取られました」。点も減らず、待ちも付かない）
 * - 場にあるがセットでない3枚は、まちがい（1点減って、3秒は取れない。待ちもサーバーの時刻で確かめる）
 * 部屋には参加者・シード・操作の記録・始まりの時刻だけを保存し、操作を受けるたびに記録から再現する
 * ビューに、シードと山札の並びは入れない（入れると、これから出るカードを計算できてしまう）
 *
 * CPU は、場が変わってから強さに応じた時間で取る。Lambda はタイマーを持てないので、取る時刻を期限（deadline）にし、
 * 届いたメッセージ（端末が CPU のいる間に送る ping を含む）のたびに確かめる。取った時刻は、届いた時刻ではなく取る時刻そのものにする
 * 期限は操作より先に確かめるので、CPU の取る時刻より後に届いた人の組は、CPU のあとに扱われる
 */

import Game, { MAX_PLAYERS, LEVELS } from '../../public/js/game.js';
import { createGameView } from '../../public/js/game-view.js';
import { nextCpu, runCpuUntil } from '../../public/js/cpu-player.js';

const playersOf = (game) => game.players.map(player => ({ name: player.name, isCPU: player.isCPU }));
const elapsed = (game, now) => Math.max(0, now - game.startedAt);

export default {
    minPlayers: 2,
    maxPlayers: MAX_PLAYERS,
    allowCpu: true,
    rematch: 'host',
    stamps: ['👍', '😮', '😭', '🎉'],

    settings: {
        defaults: () => ({ level: 'normal' }),
        validate: (patch, current) => ({ level: LEVELS.includes(patch?.level) ? patch.level : current.level })
    },

    // シードは共通部品の乱数から作る（テストでは乱数を固定できる）
    create: ({ players, random, settings, now }) => {
        const level = LEVELS.includes(settings?.level) ? settings.level : 'normal';
        const game = new Game(players, { seed: Math.floor(random() * 2 ** 32), mode: 'online', level });
        game.startedAt = now;
        return game;
    },

    // 保存するのは記録だけ。読み込むたびに記録から再現する
    persist: (game) => ({
        players: playersOf(game),
        options: { seed: game.seed, mode: 'online', level: game.level },
        commands: game.commands,
        startedAt: game.startedAt
    }),
    restore: (saved) => Object.assign(Game.replay(saved.players, saved.options, saved.commands), { startedAt: saved.startedAt }),

    view: (game, seat) => createGameView(game, seat),
    spectatorView: (game) => createGameView(game, null),

    actions: {
        // 端末から送れるのは、セットを取る操作だけ（ヒントはローカルだけ）。時刻はサーバーで付ける
        command({ game, seat, message, reject, now }) {
            const command = message?.command;
            if (!command || typeof command !== 'object' || command.type !== 'claim') return reject('今はその操作はできません');
            if (!Array.isArray(command.cards)) return reject('3枚を選んでください');
            const claim = { type: 'claim', cards: command.cards.slice(0, 3), t: elapsed(game, now()) };
            if (!game.applyCommand(seat, claim)) {
                return reject(game.lastError === 'そのカードはもう場にありません' ? '先に取られました' : game.lastError ?? '今はその操作はできません');
            }
        }
    },

    isOver: (game) => game.isOver,

    // 次に CPU が取る時刻（サーバーの時刻）。CPU がいなければ null
    deadline: (game) => {
        if (game.isOver) return null;
        const next = nextCpu(game);
        return next ? game.startedAt + next.due : null;
    },

    // 時刻が来た CPU に取らせる（記録の時刻は、取る時刻そのもの）
    onDeadline(ctx) {
        const { game } = ctx;
        if (!runCpuUntil(game, elapsed(game, ctx.now()))) ctx.ignore();
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに続ける（ルールは CPU かどうかを見ないので、記録の再現はずれない）
    // 切断は戻ってくるかもしれないので待つ
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.isOver) return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
