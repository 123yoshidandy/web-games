import Game from '../public/js/game.js';
import { createRandom } from '../public/js/random.js';

export const PLAYERS = n => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: false }));
export const newGame = (n = 2, seed = 1) => new Game(PLAYERS(n), { seed });

// 手札の札を、指定した色と数字に置き換える（山札の同じ札と入れ替えて、全体の枚数は変えない）
export function setCard(game, order, color, rank) {
    const card = game.cards[order];
    const i = game.deck.findIndex(c => c.color === color && c.rank === rank);
    if (i >= 0) game.deck[i] = { color: card.color, rank: card.rank };
    card.color = color;
    card.rank = rank;
}

// 打てる手の一覧（ランダムな試合用）
export function legalCommands(game) {
    const seat = game.current;
    const list = [];
    for (const order of game.hands[seat]) {
        list.push({ type: 'play', order });
        if (game.clues < 8) list.push({ type: 'discard', order });
    }
    if (game.clues > 0) {
        for (const target of game.players.map(p => p.seat).filter(s => s !== seat)) {
            for (let c = 0; c < 5; c++) if (game.clueTouches(target, 'color', c).length) list.push({ type: 'clue', target, kind: 'color', value: c });
            for (let r = 1; r <= 5; r++) if (game.clueTouches(target, 'rank', r).length) list.push({ type: 'clue', target, kind: 'rank', value: r });
        }
    }
    return list;
}

export function playRandom(game, seed, onStep = () => {}) {
    const random = createRandom(seed);
    let steps = 0;
    while (!game.isOver) {
        if (++steps > 500) throw new Error('終わらない');
        const list = legalCommands(game);
        const command = list[Math.floor(random() * list.length)];
        if (!game.applyCommand(game.current, command)) throw new Error(game.lastError);
        onStep(game);
    }
}

export const snapshot = game => JSON.stringify({
    deck: game.deck, cards: game.cards, knowledge: game.knowledge, hands: game.hands, fireworks: game.fireworks,
    discards: game.discards, clues: game.clues, mistakes: game.mistakes, current: game.current, turn: game.turn,
    turnsLeft: game.turnsLeft, phase: game.phase, clueLog: game.clueLog, commands: game.commands
});
