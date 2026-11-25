import Game from '../public/js/game.js';
import { TOKENS } from '../public/js/data.js';

export const players = (cpu = false) => [
    { name: 'J', isCPU: cpu, cpuLevel: 'normal' },
    { name: 'D', isCPU: true, cpuLevel: 'normal' }
];

export const newGame = (seed = 1) => new Game(players(), { seed });

// タイルを並べ直す（keys の順に、向き rot で）
export function setTiles(game, keys, rot) {
    game.tiles = keys.map(suspect => ({ suspect, rot, cleared: false }));
}

// 行動タイルの上の面を、actions（行動タイルの順）にする
export function setFaces(game, actions) {
    game.tokens = actions.map((action, i) => {
        const face = TOKENS[i].indexOf(action);
        if (face < 0) throw new Error(`行動タイル${i}に ${action} の面はありません`);
        return { face, used: false };
    });
}

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
