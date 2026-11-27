import Game from '../public/js/game.js';
import { loc, ITEMS } from '../public/js/data.js';

export const players = (n = 2, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, { seed = 1, level = 2, monsters, heroes } = {}) => new Game(players(n), { seed, level, monsters, heroes });
export const L = (name) => loc(name);

// 盤面を静かにする（置かれたアイテムと村人を消し、持ち物を空にする）
export function clearBoard(game) {
    game.board = game.board.map(() => []);
    game.villagers = game.villagers.map(() => null);
    game.players.forEach(p => { p.items = []; p.perks = []; });
}

// 色と強さからアイテムを探して持たせる：give(game, 0, ['red', 6], ['yellow', 3])
export function give(game, seat, ...specs) {
    const taken = new Set(game.players.flatMap(p => p.items));
    const ids = specs.map(([color, strength]) => {
        const item = ITEMS.find(i => i.color === color && i.strength === strength && !taken.has(i.id));
        taken.add(item.id);
        game.bag = game.bag.filter(id => id !== item.id);
        game.board = game.board.map(list => list.filter(id => id !== item.id));
        return item.id;
    });
    game.players[seat].items.push(...ids);
    return ids;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, monsters: game.monsters, board: game.board, villagers: game.villagers, bag: game.bag, used: game.used,
    terror: game.terror, frenzy: game.frenzy, deck: game.deck, perkDeck: game.perkDeck, current: game.current, phase: game.phase,
    actionsLeft: game.actionsLeft, prompt: game.prompt, mq: game.mq, result: game.result, commands: game.commands, logs: game.logs,
    skipMonster: game.skipMonster, bonusUsed: game.bonusUsed, guideUsed: game.guideUsed
});
