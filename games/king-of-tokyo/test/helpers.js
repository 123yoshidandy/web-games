import Game from '../public/js/game.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

// seat の番を始めたゲーム（state で各人の状態を書き換えられる）
export function gameAt(n, seat, { seed = 1, setup } = {}) {
    const game = new Game(players(n), { seed });
    setup?.(game);
    game.current = seat;
    game.startTurn({ fresh: true });
    game.decision = null;
    game.run();
    return game;
}

// 出目をそろえて決める（振り直しなし）
export function resolveWith(game, dice) {
    game.dice = [...dice];
    expect(game.decision?.kind).toBe('roll');
    const ok = game.applyCommand(game.current, { type: 'resolve' });
    if (!ok) throw new Error(game.lastError);
}

// 判断を順に答える（answers：kind ごとの答えを返す関数。なければ、いちばん控えめな答え）
export function answerAll(game, answers = {}, limit = 50) {
    for (let i = 0; i < limit && game.decision && !game.isOver(); i++) {
        const d = game.decision;
        const fn = answers[d.kind];
        const command = fn ? fn(d, game) : defaultAnswer(d);
        if (!command) return;
        if (!game.applyCommand(d.seat, command)) throw new Error(`${d.kind}: ${game.lastError}`);
    }
}

export function defaultAnswer(d) {
    switch (d.kind) {
        case 'buy': return { type: 'endBuy' };
        case 'yield': return { type: 'yield', yes: false };
        case 'wings': return { type: 'wings', yes: false };
        case 'psychicProbe': return { type: 'probe', index: null };
        case 'healingRay': return { type: 'healingRay', give: {} };
        case 'opportunist': return { type: 'opportunist', card: null };
        case 'mimic': return { type: 'mimic', target: null };
        case 'metamorph': return { type: 'metamorph', cards: [] };
        default: return null;
    }
}

export function snapshot(game) {
    return JSON.stringify({
        players: game.players, tokyo: game.tokyo, deck: game.deck, market: game.market, dice: game.dice,
        current: game.current, decision: game.decision, turnNo: game.turnNo, winner: game.winner, commands: game.commands.length
    });
}

import { expect } from 'vitest';
