// オンライン対戦の試験で、部屋の状態から「その席が今打てる一手」を選ぶ（test-kit/online.js と scripts/online-e2e.mjs で使う）
// vitest に頼らないので、node:test やふつうのスクリプトからも使える
//   const { restore, moveFor } = createMovePicker({ definition, suggest, pick });
//   moveFor(room, seat) … その席の操作（打てなければ null）。room は保存された部屋（store.getRoom の結果）
// 手の選び方:
//   pick(game, seat)    … 渡せばそれを使う
//   suggest(game, seat) … ヒントと同じ関数。渡せばそれを使う
//   どちらもなければ、定義の CPU（cpu.step）にその席の手を選ばせ、記録された操作を取り出す（本物の部屋は変えない）
import { createSeededRandom } from 'netplay-kit/server/testing.js';

export function createMovePicker({ definition, suggest = null, pick = null }) {
    const restore = (room) => (definition.restore ? definition.restore(structuredClone(room.game), room) : structuredClone(room.game));
    const commandsOf = (game) => game.commands ?? definition.persist?.(game)?.commands ?? null;

    // 定義の CPU に、その席の手を1つ選ばせる（部屋の状態から作り直した写しで動かす）
    // 写しでは、その席だけを CPU にし、ほかの席（本物の CPU の席も）は人にする。CPU がほかの席の手を先に打つ場面
    // （ほかの人の返事を待つ交渉など）でも、頼んだ席の手だけが記録される
    const cpuPick = (room, seat) => {
        const game = restore(room);
        const before = commandsOf(game)?.length;
        if (!game.players?.[seat] || before === undefined || before === null || !definition.cpu?.step) return null;
        game.players.forEach((player, i) => { player.isCPU = i === seat; });
        if (definition.cpu.needsStep && !definition.cpu.needsStep(game, room)) return null;
        if (!definition.cpu.step(game, { random: createSeededRandom(before + 1), now: 0, room })) return null;
        // 記録は { seat|playerId, command } か、操作を広げた { seat|playerId, ...command } の形
        // 新しい記録の最初がほかの席なら、その席の手は今は選べない（null）
        const entry = commandsOf(game)[before];
        if (!entry || (entry.seat ?? entry.playerId) !== seat) return null;
        if (entry.command) return entry.command;
        const { seat: _seat, playerId: _playerId, ...command } = entry;
        return command;
    };

    const moveFor = (room, seat) => {
        if (pick) return pick(restore(room), seat);
        if (suggest) return suggest(restore(room), seat);
        return cpuPick(room, seat);
    };

    return { restore, moveFor, cpuPick };
}
