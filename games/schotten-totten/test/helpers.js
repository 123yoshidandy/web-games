import Game, { isClan, isTactic, isJoker, wildChoices, MODES, WILDS, STONES, sortHand } from '../public/js/game.js';
import { clanId, colorOf, valueOf } from '../public/js/formation.js';

export const players = (cpu = false) => [{ name: 'A', isCPU: cpu }, { name: 'B', isCPU: cpu }];
export const makeGame = (seed = 1, tactics = false) => new Game(players(), { seed, tactics });

// 'r5' のような短い書き方から氏族カードを作る（r 赤・o 橙・y 黄・g 緑・b 青・p 紫）
const COLOR_KEYS = 'roygbp';
export const card = (text) => clanId(COLOR_KEYS.indexOf(text[0]), Number(text[1]));
export const entry = (text) => {
    const id = card(text);
    return { card: id, c: colorOf(id), v: valueOf(id) };
};

// 場面を作る。sides：{ 石の番号: [[席0のカード], [席1のカード]] }
export function setup(game, { hands, sides, current = 0, phase = 'play', deck } = {}) {
    if (hands) hands.forEach((hand, seat) => { game.players[seat].hand = sortHand(hand.map(x => (typeof x === 'string' && !isTactic(x) ? card(x) : x))); });
    if (sides) {
        Object.entries(sides).forEach(([index, both]) => {
            const stone = game.stones[Number(index)];
            stone.sides = both.map(list => list.map(x => (typeof x === 'string' ? entry(x) : x)));
            stone.completed = stone.sides.map((side, s) => (side.length >= 3 ? ++game.completeSeq + s * 0 : null));
        });
    }
    if (deck) game.deck = deck.map(card);
    game.current = current;
    game.phase = phase;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, stones: game.stones, deck: game.deck, tacticDeck: game.tacticDeck, discards: game.discards,
    current: game.current, phase: game.phase, turn: game.turn, winner: game.winner, logs: game.logs, events: game.events, commands: game.commands
});

// 通る操作を全部並べる（テストとファズ用。ジョーカーの色と数は数を絞る）
export function legalCommands(game) {
    const seat = game.actor();
    if (seat === null) return [];
    const me = game.players[seat];
    const list = [];
    if (game.phase === 'recruit') {
        for (let i = 0; i < me.hand.length; i++) for (let j = i + 1; j < me.hand.length; j++) list.push({ type: 'return', cards: [me.hand[i], me.hand[j]] });
        return list;
    }
    if (game.phase === 'claim') {
        game.stones.forEach((_, i) => { if (game.claimCheck(seat, i) === true) list.push({ type: 'claim', stone: i }); });
        list.push({ type: 'end', draw: 'clan' });
        if (game.options.tactics) list.push({ type: 'end', draw: 'tactic' });
        return list;
    }
    const open = Array.from({ length: STONES }, (_, i) => i).filter(i => game.canPlaceOn(seat, i));
    const openStones = Array.from({ length: STONES }, (_, i) => i).filter(i => game.openStone(i));
    const clanRefs = (owner) => openStones.flatMap(stone => game.stones[stone].sides[owner].map((x, index) => (isClan(x.card) ? { stone, index } : null)).filter(Boolean));
    new Set(me.hand).forEach(c => {
        if (isClan(c)) { open.forEach(stone => list.push({ type: 'play', card: c, stone })); return; }
        if (!game.canPlayTactic(seat, c)) return;
        if (WILDS.includes(c)) {
            const choices = wildChoices(c).filter((_, k) => k % (isJoker(c) ? 11 : 4) === 0);
            open.forEach(stone => choices.forEach(as => list.push({ type: 'play', card: c, stone, as })));
        } else if (MODES.includes(c)) {
            openStones.filter(s => !game.stones[s].modes.includes(c)).forEach(stone => list.push({ type: 'play', card: c, stone }));
        } else if (c === 'recruiter') {
            const total = Math.min(3, game.deck.length + game.tacticDeck.length);
            const clanDraws = Math.min(total, game.deck.length);
            const draws = [...Array(clanDraws).fill('clan'), ...Array(total - clanDraws).fill('tactic')];
            list.push({ type: 'play', card: c, draws });
        } else if (c === 'strategist') {
            clanRefs(seat).forEach(from => {
                list.push({ type: 'play', card: c, from, to: null });
                open.filter(s => s !== from.stone).forEach(to => list.push({ type: 'play', card: c, from, to }));
            });
        } else if (c === 'banshee') {
            clanRefs(1 - seat).forEach(target => list.push({ type: 'play', card: c, target }));
        } else if (c === 'traitor') {
            clanRefs(1 - seat).forEach(target => open.forEach(to => list.push({ type: 'play', card: c, target, to })));
        }
    });
    if (!game.canPlaceClan(seat)) list.push({ type: 'pass' });
    return list;
}
