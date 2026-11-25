import Game from '../public/js/game.js';
import { MODES } from '../public/js/data.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
export const cpus = n => players(n).map(p => ({ ...p, isCPU: true }));

// 全員が、配られたポケモンの先頭から選ぶ
export function chooseAll(game) {
    game.players.forEach(p => {
        if (!game.applyCommand(p.id, { type: 'choose', picks: p.offers.slice(0, MODES[game.mode].pick) })) throw new Error(game.lastError);
    });
}

/**
 * 状態を直接作ったゲーム
 *   roles：席ごとの役割、mons：席ごとのポケモン（玄人は [バトル, ベンチ]）、hands：席ごとの手札（カードの種類を空白区切り）
 *   seat：手番の人。山札の残りは、使っていないカードを決まった順に並べる
 */
export function setupGame({ n = 4, mode = 'basic', roles = ['leader', 'trainer', 'challenger', 'rocket', 'challenger', 'challenger'], mons = [], hands = [], seat = 0, seed = 1 } = {}) {
    const game = new Game(players(n), { seed, mode });
    game.players.forEach((p, i) => {
        p.role = roles[i];
        if (mons[i]) p.offers = [].concat(mons[i]);
    });
    game.leader = roles.indexOf('leader');
    chooseAll(game);
    // 手札を差し替える（指定のない席は空にする）
    const used = new Set();
    const take = key => {
        const card = game.cards.find(c => c.key === key && !used.has(c.id));
        if (!card) throw new Error(`カードが足りません：${key}`);
        used.add(card.id);
        return card.id;
    };
    game.players.forEach((p, i) => { p.hand = (hands[i] ?? '').split(' ').filter(Boolean).map(take); });
    game.deck = game.cards.map(c => c.id).filter(id => !used.has(id));
    game.discard = [];
    game.tasks = [];
    game.prompt = null;
    game.turn = { seat, number: 1, attacks: 0, attacked: false, switched: false, paralyzed: false };
    game.acts = [];
    return game;
}

// 山札の上に、そのおてんきマークのカードを置く（おてんきチェックの結果を決める）
export function stackWeather(game, ...weathers) {
    const ids = weathers.map(w => {
        const id = game.deck.find(x => game.cards[x].weather === w);
        game.deck.splice(game.deck.indexOf(id), 1);
        return id;
    });
    game.deck.unshift(...ids);
}

export const handKeys = (game, seat) => game.players[seat].hand.map(id => game.cards[id].key);
export const cardOf = (game, seat, key) => game.players[seat].hand.find(id => game.cards[id].key === key);

export function snapshot(game) {
    return JSON.stringify({
        players: game.players, deck: game.deck, discard: game.discard, turn: game.turn, prompt: game.prompt,
        tasks: game.tasks, phase: game.phase, commands: game.commands.length, winners: game.winners
    });
}
