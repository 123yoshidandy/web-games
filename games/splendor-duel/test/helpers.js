import Game, { CARDS, COLORS, emptyTokens, CELLS, TOKEN_COLORS, countTokens } from '../public/js/game.js';

export const players = (cpu = false) => [{ name: 'P1', isCPU: cpu }, { name: 'P2', isCPU: cpu }];

// 席0から始まるゲーム
export const makeGame = (seed = 1) => new Game(players(), { seed, startPlayer: 0 });

// { white: 1 } → 7色そろった形
export const tokens = (partial = {}) => ({ ...emptyTokens(), ...partial });

// 盤を文字で作る。W 白・U 青・G 緑・R 赤・K 黒・P パール・O 黄金・. 空き。5文字×5行
// 盤に置かなかったトークンは袋に入れる（総数を保つ）
const LETTERS = { W: 'white', U: 'blue', G: 'green', R: 'red', K: 'black', P: 'pearl', O: 'gold', '.': null };
export function setBoard(game, rows) {
    const cells = rows.join('').replace(/\s/g, '');
    if (cells.length !== CELLS) throw new Error('盤は25マスです');
    game.board = [...cells].map(ch => LETTERS[ch]);
    const held = emptyTokens();
    game.players.forEach(p => TOKEN_COLORS.forEach(c => { held[c] += p.tokens[c]; }));
    const supply = { white: 4, blue: 4, green: 4, red: 4, black: 4, pearl: 2, gold: 3 };
    TOKEN_COLORS.forEach(c => {
        const onBoard = game.board.filter(t => t === c).length;
        game.bag[c] = supply[c] - onBoard - held[c];
        if (game.bag[c] < 0) throw new Error(`${c} が多すぎます`);
    });
}

// 持ちトークンを決める（盤と袋の数はそのまま。総数を確かめるテストでは使わない）
export function giveTokens(player, partial) {
    player.tokens = tokens(partial);
}

// 指定の条件に合うカードの id
export const findCard = (predicate) => CARDS.find(predicate).id;

// ボーナスの色ごとに、その数だけ0点のカードを持たせる（王冠も能力もないもの）
export function giveBonuses(player, counts) {
    COLORS.forEach(color => {
        const ids = CARDS.filter(card => card.color === color && card.bonus === 1 && card.points === 0 && card.crowns === 0 && !card.ability).map(card => card.id);
        for (let i = 0; i < (counts[color] ?? 0); i++) player.cards.push({ id: ids[i % ids.length], color });
    });
}

// 場の (level, slot) にカードを置く（山札と場から取り除いてから）
export function placeInPyramid(game, level, slot, cardId) {
    [1, 2, 3].forEach(l => {
        game.decks[l] = game.decks[l].filter(id => id !== cardId);
        game.pyramid[l] = game.pyramid[l].map(id => (id === cardId ? null : id));
    });
    game.pyramid[level][slot] = cardId;
}

export const totalTokens = (game) => countTokens(game.bag) + game.board.filter(Boolean).length
    + game.players.reduce((sum, p) => sum + countTokens(p.tokens), 0);

export const snapshot = (game) => JSON.stringify({
    players: game.players, bag: game.bag, board: game.board, decks: game.decks, pyramid: game.pyramid, royals: game.royals,
    privileges: game.privileges, current: game.current, phase: game.phase, turn: game.turn, pending: game.pending,
    extraTurns: game.extraTurns, replenished: game.replenished, logs: game.logs, events: game.events, commands: game.commands
});
