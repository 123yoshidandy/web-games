import Game from '../public/js/game.js';

export const players = (cpu = [false, true], level = 'normal') => cpu.map((c, i) => ({ name: `P${i}`, isCPU: c, cpuLevel: level }));

export function newGame(cpu = [false, false], options = {}) {
    return new Game(players(cpu), options);
}

// UCI の文字（e2e4・e7e8q）を操作にする
export const mv = (uci) => (uci.length > 4
    ? { type: 'move', from: uci.slice(0, 2), to: uci.slice(2, 4), promo: uci[4] }
    : { type: 'move', from: uci.slice(0, 2), to: uci.slice(2, 4) });

// 手番の人が順に指す。断られたら例外にする
export function play(game, ucis) {
    for (const uci of ucis.split(/\s+/).filter(Boolean)) {
        if (!game.applyCommand(game.current, mv(uci))) throw new Error(`${uci}: ${game.lastError}`);
    }
    return game;
}

// 状態を比べるための文字列（局面・記録・進行）
export function snapshot(game) {
    return JSON.stringify({
        fen: game.pos.fen(),
        history: game.history,
        commands: game.commands,
        phase: game.phase,
        result: game.result,
        drawOffer: game.drawOffer,
        drawOfferPly: game.drawOfferPly,
        repetitions: [...game.repetitions],
        logs: game.logs,
        events: game.events,
        players: game.players
    });
}
