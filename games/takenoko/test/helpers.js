import Game, { key } from '../public/js/game.js';
import { CARD_TYPES, IMPROVEMENTS, WEATHERS } from '../public/js/data.js';
import { createRandom } from '../public/js/random.js';

export const PLAYERS = n => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: false }));
export const newGame = (n = 2, seed = 1) => new Game(PLAYERS(n), { seed });

// 区画を直接置く（テスト用）
export function put(game, q, r, color, { improvement = null, bamboo = 0 } = {}) {
    game.tiles[key(q, r)] = { q, r, color, improvement, fixed: !!improvement, bamboo, wet: true };
    return game.tiles[key(q, r)];
}

// 手番を作り直す（天気なし、行動2つ）
export function freshTurn(game, seat = game.current, extra = {}) {
    game.current = seat;
    game.turnState = { weather: null, pending: null, actions: [], max: 2, repeat: false, drawn: null, ...extra };
}

// 打てる手からランダムに選ぶ
export function randomCommand(game, random) {
    const pick = list => list[Math.floor(random() * list.length)];
    const seat = game.current;
    const turn = game.turnState;
    const completable = game.players[seat].hand.filter(id => game.canComplete(seat, id));
    if (completable.length) return { type: 'complete', card: completable[0] };
    if (turn.pending === 'choice') return { type: 'weather', weather: pick(WEATHERS.filter(w => w !== 'choice')) };
    if (turn.pending === 'rain') return random() < 0.2 ? { type: 'skip' } : { type: 'rain', ...xy(pick(game.rainSpots())) };
    if (turn.pending === 'storm') return random() < 0.2 ? { type: 'skip' } : { type: 'storm', ...xy(pick(game.plots().map(t => [t.q, t.r]))) };
    if (turn.pending === 'clouds') {
        const spot = pick(game.improvableSpots());
        const kinds = IMPROVEMENTS.filter(i => game.tokens[i] > 0);
        if (kinds.length) return { type: 'improve', improvement: pick(kinds), ...xy(spot) };
        const movable = game.plots().filter(t => t.improvement && !t.fixed);
        return movable.length ? { type: 'improve', from: [movable[0].q, movable[0].r], ...xy(spot) } : { type: 'skip' };
    }
    if (turn.drawn) return { type: 'placePlot', choice: Math.floor(random() * turn.drawn.length), ...xy(pick(game.plotSpots())) };
    const actions = game.availableActions();
    if (actions.length === 0 || game.canEndTurn() && random() < 0.1) return { type: 'endTurn' };
    const action = pick(actions);
    if (action === 'plot') return { type: 'drawPlots' };
    if (action === 'irrigation') {
        const [a, b] = pick(game.irrigationSpots());
        return { type: 'irrigate', a, b };
    }
    if (action === 'gardener') return { type: 'gardener', ...xy(pick(game.reachable(game.gardener))) };
    if (action === 'panda') return { type: 'panda', ...xy(pick(game.reachable(game.panda))) };
    return { type: 'drawObjective', kind: pick(CARD_TYPES.filter(t => game.decks[t].length)) };
}

const xy = ([q, r]) => ({ q, r });

export function playRandom(game, seed, maxSteps = 600, onStep = () => {}) {
    const random = createRandom(seed);
    for (let i = 0; i < maxSteps && !game.isOver; i++) {
        const command = randomCommand(game, random);
        if (!game.applyCommand(game.current, command)) throw new Error(`${JSON.stringify(command)} ${game.lastError}`);
        onStep(game);
    }
}

export const snapshot = game => JSON.stringify({
    tiles: game.tiles, channels: game.channels, plotDeck: game.plotDeck, tokens: game.tokens, irrigationLeft: game.irrigationLeft,
    gardener: game.gardener, panda: game.panda, decks: game.decks, players: game.players, current: game.current,
    round: game.round, finalRound: game.finalRound, phase: game.phase, turnState: game.turnState, commands: game.commands, result: game.result
});
