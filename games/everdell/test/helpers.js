import Game, { emptyRes } from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, seed = 1) => new Game(players(n), { seed });

// 街にカードを直接置く（出したときの効果は起こさない）。夫と妻は組にする
export function addCity(game, seat, ...ids) {
    const p = game.players[seat];
    return ids.map(id => {
        const c = { uid: ++game.uidSeq, id, occupied: false, paired: null, tokens: id === 'clockTower' ? 3 : 0, res: id === 'storehouse' ? emptyRes() : null, under: [] };
        if (id === 'wife' || id === 'husband') {
            const partner = p.city.find(x => x.id === (id === 'wife' ? 'husband' : 'wife') && !x.paired);
            if (partner) {
                partner.paired = c.uid;
                c.paired = partner.uid;
            }
        }
        p.city.push(c);
        return c;
    });
}

// 手番・資源・手札・草原を決める
export function setup(game, { turn, res, hand, meadow }) {
    if (turn !== undefined) game.turn = turn;
    if (res) Object.entries(res).forEach(([seat, r]) => { game.players[seat].res = { ...emptyRes(), ...r }; });
    if (hand) Object.entries(hand).forEach(([seat, ids]) => { game.players[seat].hand = [...ids]; });
    if (meadow) game.meadow = [...meadow];
}

// 選択待ちに答える（values は value の配列）
export function answer(game, values) {
    const prompt = game.prompt;
    if (!prompt) throw new Error('選択待ちがありません');
    if (!game.applyCommand(prompt.player, { type: 'answer', id: prompt.id, values })) throw new Error(game.lastError);
}

export function act(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${seat}: ${game.lastError}`);
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, deck: game.deck, discard: game.discard, meadow: game.meadow, turn: game.turn, phase: game.phase,
    claimed: game.claimed, prompt: game.prompt, rng: game.rng, winners: game.winners, logs: game.logs, events: game.events, commands: game.commands
});
