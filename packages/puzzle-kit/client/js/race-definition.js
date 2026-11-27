/**
 * オンライン対戦（早解きレース）の定義（netplay-kit）を作る。ゲームの server/src/game-definition.js から呼ぶ
 *   import { GameError } from 'netplay-kit/server/room-service.js';
 *   import { createRaceDefinition } from '../../public/js/race-definition.js';
 *   export default createRaceDefinition({ GameError });
 * GameError を渡してもらうのは、画面の写しから netplay-kit のサーバーのファイルを import しないため
 *
 * 同じ問題の組（このゲームの種類を N 問）を全員で解き、合計の時間が短い人が勝ち。ロジックは race.js
 * - 問題はサーバーが作って配る。シードはビューにも保存にも入れない（問題は見えてよい）
 * - 解けた盤面を端末から送り（submit）、サーバーが種類の check で確かめる。時間はサーバーの時刻で数える
 * - CPU は始めるときに、シード付きの乱数で解き終わる時刻を決める。対戦中に抜けた人の席は、その時点から CPU が解く
 */

import { createRace, applyRaceCommand, raceView, scheduleCpu, finishIfDone, nextIndex, standings, defaultRaceSettings, RACE_COUNTS } from './race.js';
import { getType, DIFFICULTY_IDS } from './puzzles/registry.js';
import { CPU_LEVEL_IDS } from './cpu-player.js';

export function createRaceDefinition({ GameError }) {
    return {
        minPlayers: 2,
        maxPlayers: 4,
        allowCpu: true,
        rematch: 'host',
        maxMessageLength: 16384, // 解けた盤面（15×15 など）を送るため

        settings: {
            defaults: defaultRaceSettings,
            validate(patch, current) {
                const next = { ...current, ...patch };
                if (!DIFFICULTY_IDS.includes(next.difficulty)) throw new GameError('難しさを選んでください');
                next.count = Number(next.count);
                if (!RACE_COUNTS.includes(next.count)) throw new GameError(`問題の数は ${RACE_COUNTS.join('・')} から選んでください`);
                if (!CPU_LEVEL_IDS.includes(next.cpuLevel)) throw new GameError('CPU の強さを選んでください');
                return { difficulty: next.difficulty, count: next.count, cpuLevel: next.cpuLevel };
            }
        },

        create: ({ players, settings, random, now }) => createRace({ players, settings, random, now }),

        view: (game, seat) => raceView(game, seat),

        actions: {
            // 端末から届く操作は submit（解けた盤面）と hint（ヒントを見た）だけ。代行などほかの形は断る
            command(ctx) {
                const { game, seat, message } = ctx;
                const command = message.command;
                if (!command || !['submit', 'hint'].includes(command.type)) return ctx.reject('受け付けない操作です');
                // 断る理由を先に確かめてから変える（断るときは game を変えない）
                const copy = structuredClone(game);
                const result = applyRaceCommand(copy, seat, command, ctx.now());
                if (!result.ok) return ctx.reject(result.error);
                applyRaceCommand(game, seat, command, ctx.now());
            }
        },

        isOver: (game) => game.phase === 'end',

        // 利用者ごとの記録（netplay-kit の stats.js）に渡す、席ごとの順位
        result: (game) => ({ ranks: standings(game).sort((a, b) => a.seat - b.seat).map(row => row.rank) }),

        // 制限時間を過ぎたら、その時点の順位で終える（Lambda はタイマーを持たないので、届いたメッセージのたびに確かめる）
        deadline: (game) => (game.phase === 'playing' ? game.endsAt : null),
        onDeadline(ctx) {
            ctx.game.phase = 'end';
        },

        // CPU は解き終わる時刻を始めに決めるので、ふだんは打たない
        // 決めていない CPU（時刻を決める前の席）だけ、次の問題の答えをすぐに送る（試験の道具が CPU に手を選ばせるときにも使う）
        cpu: {
            needsStep: (game) => game.phase === 'playing' && game.players.some(p => p.isCPU && !p.left && nextIndex(p) >= 0 && p.solvedAt[nextIndex(p)] === null),
            step(game, { now }) {
                const seat = game.players.findIndex(p => p.isCPU && !p.left && nextIndex(p) >= 0);
                if (seat < 0) return false;
                const player = game.players[seat];
                const index = nextIndex(player);
                const entry = game.puzzles[index];
                const { solution } = getType(entry.type).solve(entry.puzzle, 1);
                player.solvedAt[index] = Math.max(0, now - game.startAt, index ? player.solvedAt[index - 1] : 0);
                game.commands.push({ seat, command: { type: 'submit', index, state: solution }, at: player.solvedAt[index] });
                finishIfDone(game);
                return true;
            },
            progress: (game) => game.commands.length
        },

        // 対戦中に部屋を出た人の席は、その時点から CPU が解く（切断は戻ってくるかもしれないので待つ）
        onPlayerGone(ctx, { seat, reason }) {
            const { game } = ctx;
            if (reason !== 'left' || game.phase !== 'playing') return ctx.ignore();
            const player = game.players[seat];
            player.isCPU = true;
            const at = Math.max(0, ctx.now() - game.startAt);
            const solved = player.solvedAt.filter(t => t !== null);
            scheduleCpu(game, seat, ctx.random, Math.max(at, ...solved));
            finishIfDone(game);
        }
    };
}
