import { expect } from 'vitest';
import Game from '../public/js/game.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

export function ok(game, seat, command) {
    const result = game.applyCommand(seat, command);
    expect(result, game.lastError ?? '').toBe(true);
}

export function ng(game, seat, command) {
    const before = snapshot(game);
    expect(game.applyCommand(seat, command)).toBe(false);
    expect(snapshot(game)).toBe(before);
    return game.lastError;
}

// 全員が配られた最初の企業を選び、カードは買わずに始める。corps で企業を指定できる
export function started(n = 2, { corps = [], seed = 1 } = {}) {
    const game = new Game(players(n), { seed });
    for (let i = 0; i < n; i++) {
        const d = game.decision;
        if (corps[i]) d.corps = [corps[i]];
        ok(game, i, { type: 'setup', corp: d.corps[0], keep: [] });
    }
    return game;
}

// 手札にカードを加える（山札から抜く）
export function give(game, seat, ...keys) {
    for (const k of keys) {
        const i = game.deck.indexOf(k);
        if (i >= 0) game.deck.splice(i, 1);
        game.players[seat].hand.push(k);
    }
}

export function snapshot(game) {
    return JSON.stringify({
        players: game.players, tiles: game.tiles, t: game.temperature, o: game.oxygen, oc: game.oceans, decision: game.decision, phase: game.phase,
        gen: game.generation, ms: game.milestones, aw: game.awards, deck: game.deck.length, commands: game.commands.length
    });
}
