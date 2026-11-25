import Game from '../public/js/game.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

/**
 * ラウンドの途中の状態を直接作る
 * hands：席ごとの手札（手番の人は 2 枚）、deck：山札（末尾が一番上）、discards・out・protected：席ごと
 */
export function setupRound({ n = 3, hands, deck = [1, 1, 1], current = 0, discards, out, protected: prot, setAside = 1, faceUp = [] }) {
    const game = new Game(players(n), { seed: 1 });
    game.hands = hands.map(h => [...h]);
    game.deck = [...deck];
    game.current = current;
    game.discards = discards ? discards.map(d => [...d]) : game.players.map(() => []);
    game.out = out ? [...out] : game.players.map(() => false);
    game.protected = prot ? [...prot] : game.players.map(() => false);
    game.knowledge = game.players.map(() => game.players.map(() => null));
    game.setAside = setAside;
    game.faceUp = [...faceUp];
    game.phase = 'play';
    game.events = [];
    return game;
}

export function snapshot(game) {
    return JSON.stringify({
        players: game.players, hands: game.hands, deck: game.deck, discards: game.discards, out: game.out,
        protected: game.protected, knowledge: game.knowledge, current: game.current, phase: game.phase,
        round: game.round, setAside: game.setAside, winner: game.winner, commands: game.commands.length
    });
}

export const play = (game, seat, card, target = null, guess = null) => {
    const ok = game.applyCommand(seat, { type: 'play', card, target, guess });
    if (!ok) throw new Error(game.lastError);
};
