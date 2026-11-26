import { describe, it, expect } from 'vitest';
import { createMovePicker } from '../picker.js';

// 作り物のゲーム：pending の席がそれぞれ1回ずつ答える（交渉の返事のように、どの席から答えてもよい）
// CPU は、pending のうち番号の小さい CPU の席から答える。記録の形は spread で切り替える
function fakeDefinition({ spread = false } = {}) {
    const create = (players, pending, commands = []) => ({ players: players.map(p => ({ ...p })), pending: [...pending], commands: [...commands] });
    const apply = (game, seat, command) => {
        if (!game.pending.includes(seat) || command.type !== 'answer') return false;
        game.pending = game.pending.filter(s => s !== seat);
        game.commands.push(spread ? { playerId: seat, ...command } : { seat, command });
        return true;
    };
    return {
        persist: (game) => structuredClone(game),
        restore: (saved) => create(saved.players, saved.pending, saved.commands),
        cpu: {
            needsStep: (game) => game.pending.some(s => game.players[s].isCPU),
            step: (game) => {
                const seat = game.pending.find(s => game.players[s].isCPU);
                return seat !== undefined && apply(game, seat, { type: 'answer', value: seat * 10 });
            }
        },
        room: (pending, players) => ({ game: create(players, pending) })
    };
}

const PLAYERS = [{ name: 'A', isCPU: false }, { name: 'B', isCPU: false }, { name: 'C', isCPU: true }];

describe('createMovePicker（定義の CPU で手を選ぶ）', () => {
    it('ほかの席（本物の CPU の席も）が先に答える場面でも、頼んだ席の手を選ぶ', () => {
        const definition = fakeDefinition();
        const { moveFor } = createMovePicker({ definition });
        const room = definition.room([2, 0, 1], PLAYERS);
        expect(moveFor(room, 1)).toEqual({ type: 'answer', value: 10 });
        expect(moveFor(room, 0)).toEqual({ type: 'answer', value: 0 });
        // 本物の部屋は変えない
        expect(room.game.pending).toEqual([2, 0, 1]);
    });

    it('記録が操作を広げた形（{ playerId, ...command }）でも、操作だけを取り出す', () => {
        const definition = fakeDefinition({ spread: true });
        const { moveFor } = createMovePicker({ definition });
        expect(moveFor(definition.room([1], PLAYERS), 1)).toEqual({ type: 'answer', value: 10 });
    });

    it('その席が今打てなければ null', () => {
        const definition = fakeDefinition();
        const { moveFor } = createMovePicker({ definition });
        expect(moveFor(definition.room([2], PLAYERS), 0)).toBeNull();
        expect(moveFor(definition.room([], PLAYERS), 1)).toBeNull();
    });

    it('suggest や pick を渡せば、それを使う', () => {
        const definition = fakeDefinition();
        const room = definition.room([0], PLAYERS);
        expect(createMovePicker({ definition, suggest: (_game, seat) => ({ type: 'x', seat }) }).moveFor(room, 0)).toEqual({ type: 'x', seat: 0 });
        expect(createMovePicker({ definition, pick: () => 'p', suggest: () => 's' }).moveFor(room, 0)).toBe('p');
    });
});
