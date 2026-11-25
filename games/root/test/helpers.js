import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const players = (factions, cpu = false) => factions.map((faction, i) => ({ name: `P${i + 1}`, faction, isCPU: cpu }));

export const makeGame = (factions = ['marquise', 'eyrie', 'alliance', 'vagabond'], seed = 1) => new Game(players(factions), { seed });

// 準備（本拠・指導者・キャラクターなど）を CPU の判断で済ませる
export function finishSetup(game) {
    let guard = 0;
    while (game.phase === 'setup' && guard++ < 50) runCpuStep(game, game.actors()[0]);
    return game;
}

// 地図を空にして、手番を seat の phase・step に合わせる
export function clearMap(game) {
    game.map.forEach(m => {
        m.warriors = {};
        m.buildings = [];
        m.tokens = [];
    });
    if (game.fs.vagabond) {
        game.fs.vagabond.clearing = null;
        game.fs.vagabond.forest = 0;
    }
}

export function setTurn(game, faction, phase, step) {
    game.turn = game.seatOf[faction];
    game.tt = game.newTurnState();
    game.phase = phase;
    game.step = step ?? (phase === 'daylight' && faction === 'eyrie' ? 'craft' : phase);
    if (phase === 'daylight') game.tt.actions = 3;
    if (faction === 'alliance' && phase === 'evening') game.tt.ops = game.fs.alliance.officers;
    game.prompts = [];
}

// サイコロ（ゲームの乱数）を決めた値にする。values は 0〜3
export function fixDice(game, values) {
    const queue = [...values];
    game.random = () => (queue.length ? (queue.shift() + 0.5) / 4 : 0.5);
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, map: game.map, fs: game.fs, deck: game.deck, discard: game.discardPile, pool: game.dominancePool,
    items: game.items, turn: game.turn, phase: game.phase, step: game.step, tt: game.tt, prompts: game.prompts, round: game.round,
    winners: game.winners, logs: game.logs, events: game.events, commands: game.commands
});
