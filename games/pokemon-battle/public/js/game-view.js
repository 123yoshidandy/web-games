/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 隠すのは、シードと乱数、編成の段階での相手の手持ち、相手の戦術ルール
 * sides と map は game と同じ形なので、rules.js の判定にそのまま渡せる
 */

import { MAX_ROUNDS } from './data.js';

const unitView = (u, own) => ({
    ...u,
    types: [...u.types],
    stats: { ...u.stats },
    moves: [...u.moves],
    rules: own ? u.rules.map(r => ({ ...r })) : null
});

export function createGameView(game, seat, { since = 0 } = {}) {
    return {
        you: seat,
        phase: game.phase,
        current: game.current,
        first: game.first,
        round: game.round,
        maxRounds: MAX_ROUNDS,
        actors: game.actors(),
        map: { id: game.map.id, name: game.map.name, blocks: game.map.blocks.map(b => [...b]) },
        players: game.players.map((p, i) => ({ name: p.name, isCPU: p.isCPU, ready: !!game.teams[i] })),
        sides: game.sides ? game.sides.map((side, s) => ({ units: side.units.map(u => unitView(u, s === seat)) })) : null,
        result: game.result ? { ...game.result, scores: [...game.result.scores], left: [...game.result.left] } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: game.events.map(e => ({ ...e, ...(e.from ? { from: { ...e.from }, to: { ...e.to } } : {}) }))
    };
}
