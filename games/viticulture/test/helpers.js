import Game from '../public/js/game.js';
import { CARDS } from '../public/js/cards.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 準備（パパの選択はリラ）を済ませた、1年目の春のゲーム。最初に選ぶ人を席0にそろえる
export function newGame(n = 2, seed = 1) {
    const game = new Game(players(n), { seed });
    while (game.pending?.handler === 'tasks' && game.season === 'setup') game.applyCommand(game.pending.seat, { type: 'choose', index: 1 });
    game.first = 0;
    game.pickers = Array.from({ length: n }, (_, i) => i);
    game.current = 0;
    return game;
}

// 起床の段を席順に 0,1,2… と選んで、夏にする
export function toSummer(game) {
    game.pickers.forEach((seat, i) => {
        if (!game.applyCommand(seat, { type: 'wake', row: i })) throw new Error(game.lastError);
        // おまけの選択（訪問者カード）が出たら夏の訪問者を選ぶ
        while (game.pending) game.applyCommand(game.pending.seat, { type: 'choose', index: 0 });
    });
    return game;
}

export const findCard = (test) => CARDS.find(test).id;
export const vine = (type) => findCard(c => c.deck === 'vine' && c.type === type);
export const vines = (type) => CARDS.filter(c => c.deck === 'vine' && c.type === type).map(c => c.id);
export const visitor = (name) => findCard(c => (c.deck === 'summer' || c.deck === 'winter') && c.name === name);
export const order = (text) => findCard(c => c.deck === 'order' && c.wines.map(w => `${w.kind[0]}${w.min}`).join(' ') === text);

// 手札を差し替える（山から抜いて、ほかの人の手札とも重ならないようにする）
export function setHand(game, seat, ids) {
    game.players.forEach(p => { p.hand = p.hand.filter(id => !ids.includes(id)); });
    Object.values(game.decks).forEach(deck => ids.forEach(id => { const i = deck.indexOf(id); if (i >= 0) deck.splice(i, 1); }));
    game.players[seat].hand = [...ids];
}

// 選択肢のうち、label に text を含むものを選ぶ
export function choose(game, text) {
    const i = game.pending.options.findIndex(o => o.label.includes(text));
    if (i < 0) throw new Error(`「${text}」がない: ${game.pending.options.map(o => o.label).join(' / ')}`);
    if (!game.applyCommand(game.pending.seat, { type: 'choose', index: i })) throw new Error(game.lastError);
}

export const place = (game, seat, action, grande = false) => game.applyCommand(seat, { type: 'place', action, grande });

// 比べるための状態の写し（断った理由は除く）
export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}
