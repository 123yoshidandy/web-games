import Game from '../public/js/game.js';
import { MAP } from '../public/js/data.js';

// 状態を文字列にする（断った操作で状態が変わらないか、再現で同じになるかを比べる）
export const snapshot = (game) => JSON.stringify(game, (key, value) => (key === 'lastError' ? undefined : value));

// 行と列から領地の番号
export function hexAt(r, c) {
    const hex = MAP.hexes.find(h => h.r === r && h.c === c);
    if (!hex) throw new Error(`${r},${c} はない`);
    return hex.id;
}

// 勢力とマットを決めたゲーム（手番はマットの番号の順）
export function makeGame(pairs, seed = 1) {
    return new Game(pairs.map(([faction, mat], i) => ({ name: `P${i}`, isCPU: false, faction, mat })), { seed });
}

// 席の盤上のユニットを全部消す
export function clearUnits(game, seat) {
    game.units = game.units.filter(u => u.seat !== seat);
}

export function put(game, seat, kind, hex) {
    return game.addUnit(seat, kind, hex);
}

export { MAP };
