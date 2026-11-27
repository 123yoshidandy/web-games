/**
 * オンライン対戦用の「ゲームの定義」（netplay-kit の README の形）
 * server/src/handler.js（AWS）と、web-games の npm run dev:online（手元のテスト用サーバー）が、この定義を使う
 * 2段の提出型：両方の席が戦術（共有コード）を出す → そろったらサーバーがシードを作り、対戦を流して勝者を決める
 * - シードは、両方がそろってから作る。それまでのビューには、相手の戦術もシードも入れない
 * - 対戦のあとのビューには、記録（エンジンの版・シード・両方の戦術）を入れる。端末は同じ対戦を手元で流して見せる
 *   （対戦はもう決まっているので、シードを見せても先の乱数は読まれない。testOnline のシードの検査は notRandomKeys で外す）
 * - 抜けた人の席は CPU にし、組み込みの戦術を出す
 */

import { runBattle, ENGINE_VERSION } from '../../public/js/battle.js';
import { encodeTactic, decodeTactic } from '../../public/js/codec.js';
import { BUILTIN, CPU_LEVELS } from '../../public/js/cpu-tactics.js';

const CPU_IDS = CPU_LEVELS.map((level) => level.id);

const submittedCount = (game) => game.tactics.filter(Boolean).length;
const cpuSeatToSubmit = (game) => game.players.findIndex((p, seat) => p.isCPU && !game.tactics[seat]);

// 両方そろったら、シードを作って対戦を流す
function finish(game, random) {
    if (game.phase !== 'submit' || submittedCount(game) < 2) return;
    game.seed = Math.floor(random() * 2 ** 32);
    const battle = runBattle({ seed: game.seed, tactics: game.tactics.map(decodeTactic) });
    game.result = { winner: battle.winner, life: battle.sides.map((s) => s.life), time: battle.time };
    if (battle.winner !== null) game.wins[battle.winner]++;
    game.phase = 'over';
}

// 提出を当てる。だめなら理由の文字列
function submit(game, seat, command, random) {
    if (game.phase !== 'submit') return '対戦はもう始まっています';
    if (seat !== 0 && seat !== 1) return '席が正しくありません';
    if (game.tactics[seat]) return 'もう戦術を出しました';
    if (!command || command.type !== 'submit' || typeof command.tactic !== 'string') return '操作が正しくありません';
    let code;
    try {
        code = encodeTactic(decodeTactic(command.tactic)); // 正規化した形で持つ
    } catch (error) {
        return error.message;
    }
    game.tactics[seat] = code;
    game.commands.push({ seat, command: { type: 'submit', tactic: code } });
    finish(game, random);
    return null;
}

function publicView(game) {
    const over = game.phase === 'over';
    return {
        phase: game.phase,
        players: game.players.map((p, seat) => ({ name: p.name, isCPU: p.isCPU, submitted: Boolean(game.tactics[seat]) })),
        wins: [...game.wins],
        battle: over ? { engine: ENGINE_VERSION, seed: game.seed, tactics: [...game.tactics] } : null,
        result: over ? game.result : null
    };
}

export default {
    minPlayers: 2,
    maxPlayers: 2,
    allowCpu: true,
    rematch: 'ready',
    maxSpectators: 4,
    notRandomKeys: ['battle.seed'],

    settings: {
        defaults: () => ({ cpu: 'sample' }),
        validate: (patch, current) => {
            const next = { ...current, ...patch };
            if (!CPU_IDS.includes(next.cpu)) throw new Error('CPU の戦術が正しくありません');
            return { cpu: next.cpu };
        }
    },

    create: ({ players, settings, carry }) => ({
        players: players.map((p) => ({ name: p.name, isCPU: Boolean(p.isCPU) })),
        cpu: settings.cpu,
        phase: 'submit',
        tactics: [null, null],
        seed: null,
        result: null,
        commands: [],
        wins: Array.isArray(carry?.wins) ? [...carry.wins] : [0, 0]
    }),

    view: (game, seat) => ({ ...publicView(game), seat, mine: game.tactics[seat] ?? null }),
    spectatorView: (game) => ({ ...publicView(game), seat: null, mine: null }),

    actions: {
        command: {
            handle({ game, seat, message, reject, random }) {
                // 断るときは、状態を変える前に reject する（submit は断るとき状態を変えない）
                const error = submit(game, seat, message.command, random);
                if (error) reject(error);
            }
        }
    },

    isOver: (game) => game.phase === 'over',
    carryOver: (game) => ({ wins: [...game.wins] }),

    // CPU の席（抜けた人の席も）は、ロビーで選んだ組み込みの戦術を出す
    cpu: {
        needsStep: (game) => game.phase === 'submit' && cpuSeatToSubmit(game) >= 0,
        step: (game, { random }) => {
            const seat = cpuSeatToSubmit(game);
            if (game.phase !== 'submit' || seat < 0) return false;
            return submit(game, seat, { type: 'submit', tactic: encodeTactic(BUILTIN[game.cpu] ?? BUILTIN.sample) }, random) === null;
        },
        progress: (game) => game.commands.length
    },

    // 対戦中に部屋を出た人の席は、CPU が代わりに戦術を出す（切断は戻ってくるかもしれないので待つ）
    onPlayerGone(ctx, { seat, reason }) {
        if (reason !== 'left' || ctx.game.phase !== 'submit') return ctx.ignore();
        ctx.game.players[seat].isCPU = true;
    }
};
