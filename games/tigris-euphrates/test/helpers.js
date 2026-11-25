import Game from '../public/js/game.js';
import { COLORS } from '../public/js/data.js';
import { cellOf, ROWS, COLS, RIVER, NEIGHBORS } from '../public/js/board.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 席0から始まるゲーム
export const newGame = (n = 2, seed = 1) => new Game(players(n), { seed, startPlayer: 0 });

// 行・列でマスの番号を引く（盤の外ならエラー）
export const at = (row, col) => {
    const c = cellOf(row, col);
    if (c < 0) throw new Error(`盤の外です: ${row},${col}`);
    return c;
};

// 盤を空にする（最初の神殿と宝物も除く）。袋の枚数は変えない
export function clearBoard(game) {
    game.board.fill(null);
    game.treasures = [];
}

// タイルを直接置く（得点は動かさない）
export function putTile(game, cell, color, treasure = false) {
    game.board[cell] = { kind: 'tile', color };
    if (treasure) game.treasures.push(cell);
}

// 指導者を直接置く
export function putLeader(game, cell, seat, color) {
    game.board[cell] = { kind: 'leader', seat, color };
    game.players[seat].leaders[color] = cell;
}

// 手札を決める（袋と入れ替えて、全体の枚数を保つ）
export function setHand(game, seat, colors) {
    const p = game.players[seat];
    game.bag.push(...p.hand);
    p.hand = [];
    colors.forEach(c => {
        const i = game.bag.indexOf(c);
        if (i < 0) throw new Error(`${c} が袋にありません`);
        p.hand.push(...game.bag.splice(i, 1));
    });
}

export const total = (scores) => COLORS.reduce((s, c) => s + scores[c], 0);

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 全部が陸の h 行 × w 列の長方形を探し、その中の (r, c) を返す関数を作る（盤の地図が変わってもテストが壊れないように）
export function landArea(h, w) {
    for (let r = 0; r + h <= ROWS; r++) {
        for (let c = 0; c + w <= COLS; c++) {
            let ok = true;
            for (let i = 0; i < h && ok; i++) for (let j = 0; j < w && ok; j++) if (RIVER.has(cellOf(r + i, c + j))) ok = false;
            if (ok) return (i, j) => cellOf(r + i, c + j);
        }
    }
    throw new Error(`${h}×${w} の陸がありません`);
}

// 陸のとなりにある川のマス [川, となりの陸]
export function riverByLand() {
    for (const river of RIVER) {
        const land = NEIGHBORS[river].find(nb => !RIVER.has(nb));
        if (land !== undefined) return [river, land];
    }
    throw new Error('陸のとなりの川がありません');
}
