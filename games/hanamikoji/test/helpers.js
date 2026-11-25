import Game from '../public/js/game.js';

export const players = (cpu = false) => [{ name: 'A', isCPU: cpu }, { name: 'B', isCPU: cpu }];
export const makeGame = (seed = 1) => new Game(players(), { seed });

// 場面を作る。既定では席0の手番にする
export function setup(game, { hands, deck, current = 0, used, placed, favor } = {}) {
    if (hands) hands.forEach((hand, seat) => { game.players[seat].hand = [...hand].sort((a, b) => a - b); });
    if (deck) game.deck = [...deck];
    if (used) used.forEach((list, seat) => { game.players[seat].used = [...list]; });
    if (placed) placed.forEach((list, seat) => { game.players[seat].placed = [...list]; });
    if (favor) game.favor = [...favor];
    game.current = current;
    game.phase = 'play';
    game.pending = null;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, favor: game.favor, deck: game.deck, removed: game.removed, round: game.round, starter: game.starter,
    current: game.current, phase: game.phase, pending: game.pending, history: game.history, logs: game.logs, events: game.events,
    commands: game.commands, winner: game.winner
});

// 通る操作を全部並べる（テストとファズ用）
export function legalCommands(game) {
    const seat = game.actor();
    if (seat === null) return [];
    if (game.phase === 'choose') return (game.pending.type === 'gift' ? [0, 1, 2] : [0, 1]).map(index => ({ type: 'pick', index }));
    const player = game.players[seat];
    const hand = player.hand;
    const list = [];
    const combos = (k) => {
        const out = new Map();
        const rec = (start, chosen) => {
            if (chosen.length === k) { out.set(chosen.map(i => hand[i]).join(','), chosen.map(i => hand[i])); return; }
            for (let i = start; i < hand.length; i++) rec(i + 1, [...chosen, i]);
        };
        rec(0, []);
        return [...out.values()];
    };
    if (!player.used.includes('secret')) combos(1).forEach(([card]) => list.push({ type: 'secret', card }));
    if (!player.used.includes('discard')) combos(2).forEach(cards => list.push({ type: 'discard', cards }));
    if (!player.used.includes('gift')) combos(3).forEach(cards => list.push({ type: 'gift', cards }));
    if (!player.used.includes('compete')) {
        combos(4).forEach(([a, b, c, d]) => {
            [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]].forEach(groups => list.push({ type: 'compete', groups }));
        });
    }
    return list;
}
