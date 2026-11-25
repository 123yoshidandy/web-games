import { emptyEnergy } from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

export const energy = (value = {}) => ({ ...emptyEnergy(), ...value });

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 場のある位置に、決まったカードを置く（山札から抜いて、置いてあったカードを山札に戻す）
export function putOnDisplay(game, level, slot, cardId) {
    const previous = game.display[level][slot];
    const index = game.decks[level].indexOf(cardId);
    if (index >= 0) game.decks[level].splice(index, 1);
    else {
        // 場のほかの位置にあれば入れ替える
        const other = game.display[level].indexOf(cardId);
        if (other >= 0) game.display[level][other] = previous;
    }
    if (index >= 0 && previous !== null) game.decks[level].push(previous);
    game.display[level][slot] = cardId;
}

// 指定のカードを、場や山札から取り除いて、そのプレイヤーが建てたことにする
export function giveBuilt(game, seat, ...ids) {
    ids.forEach(id => {
        removeEverywhere(game, id);
        game.players[seat].built.push(id);
    });
}

export function giveArchive(game, seat, ...ids) {
    ids.forEach(id => {
        removeEverywhere(game, id);
        game.players[seat].archive.push(id);
    });
}

function removeEverywhere(game, id) {
    [1, 2, 3].forEach(level => {
        const i = game.decks[level].indexOf(id);
        if (i >= 0) game.decks[level].splice(i, 1);
        const s = game.display[level].indexOf(id);
        if (s >= 0) game.display[level][s] = game.decks[level].shift() ?? null;
    });
}
