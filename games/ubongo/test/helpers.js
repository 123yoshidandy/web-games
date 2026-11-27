import { applyCommand, puzzleOf, createGame } from '../public/js/game.js';
import { solve } from '../public/js/solver.js';
import { cpuCommand, chooseRow } from '../public/js/cpu-player.js';

export const solutionFor = (state, seat) => {
    const puzzle = puzzleOf(state, seat);
    return solve(puzzle.shape, puzzle.pieces)[0];
};

export const newRace = (overrides = {}) => createGame({
    players: [{ name: 'あなた', isCPU: false }, { name: 'CPU1', isCPU: true }, { name: 'CPU2', isCPU: true }],
    seed: 42,
    ...overrides
});

// 決まった進め方で最後まで遊び、記録を返す
// 人は、ラウンドごとに times[席] ミリ秒で解く（null ならあきらめる）
export function playThrough(options, timeOf = (round, seat) => 20000 + seat * 3000) {
    const state = createGame(options);
    const commands = [];
    const run = (seat, command) => {
        const result = applyCommand(state, seat, command);
        if (!result.ok) throw new Error(result.error);
        commands.push({ seat, command });
    };
    let guard = 0;
    while (state.phase !== 'end') {
        if (++guard > 1000) throw new Error('終わらない');
        if (state.phase === 'play') {
            const seat = state.players.findIndex((p, i) => !p.isCPU && state.results[i] === null);
            const t = timeOf(state.round, seat);
            if (t === null) run(seat, { type: 'giveUp', t: 30000 });
            else run(seat, { type: 'submit', placements: solutionFor(state, seat), t });
        } else if (state.phase === 'collect') {
            const cpu = cpuCommand(state);
            if (cpu) run(cpu.seat, cpu.command);
            else {
                const seat = state.collect.order[state.collect.index];
                run(seat, { type: 'pick', row: chooseRow(state, seat) });
            }
        }
    }
    return { state, commands };
}
