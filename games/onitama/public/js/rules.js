/**
 * 盤と動きのカード（DOM に依存しない。ゲーム・CPU・画面で共通に使う）
 *
 * 盤は 5×5。マスの番号は r*5+c（r は上から、c は左から）
 * 席0（藍）は下の段、席1（朱）は上の段から始める。どちらも、自分から見て前へ進む
 * 駒の符号：0 空き／1 席0の弟子／2 席0の師匠／3 席1の弟子／4 席1の師匠
 *
 * カードの動きは、持ち主から見た [右へ, 前へ] のずれ（Arcane Wonders 版のルールブックの図と、複数の実装のデータで照らし合わせた）
 * 色は、カードの右下の印の色。脇に置いた1枚の印の色の人が先手
 */

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const SEAT_COLORS = ['blue', 'red'];     // 席0：藍（ルールブックの青）、席1：朱（赤）
export const TEMPLE = [22, 2];                  // 師匠の初期のマス（神殿の門）

export const CARDS = {
    tiger:    { name: '虎',   reading: 'とら',       stamp: 'blue', moves: [[0, 2], [0, -1]] },
    dragon:   { name: '龍',   reading: 'りゅう',     stamp: 'red',  moves: [[-2, 1], [2, 1], [-1, -1], [1, -1]] },
    frog:     { name: '蛙',   reading: 'かえる',     stamp: 'red',  moves: [[-2, 0], [-1, 1], [1, -1]] },
    rabbit:   { name: '兎',   reading: 'うさぎ',     stamp: 'blue', moves: [[2, 0], [1, 1], [-1, -1]] },
    crab:     { name: '蟹',   reading: 'かに',       stamp: 'blue', moves: [[-2, 0], [2, 0], [0, 1]] },
    elephant: { name: '象',   reading: 'ぞう',       stamp: 'red',  moves: [[-1, 1], [1, 1], [-1, 0], [1, 0]] },
    goose:    { name: '鵞鳥', reading: 'がちょう',   stamp: 'blue', moves: [[-1, 1], [-1, 0], [1, 0], [1, -1]] },
    rooster:  { name: '雄鶏', reading: 'おんどり',   stamp: 'red',  moves: [[1, 1], [-1, 0], [1, 0], [-1, -1]] },
    monkey:   { name: '猿',   reading: 'さる',       stamp: 'blue', moves: [[-1, 1], [1, 1], [-1, -1], [1, -1]] },
    mantis:   { name: '蟷螂', reading: 'かまきり',   stamp: 'red',  moves: [[-1, 1], [1, 1], [0, -1]] },
    horse:    { name: '馬',   reading: 'うま',       stamp: 'red',  moves: [[-1, 0], [0, 1], [0, -1]] },
    ox:       { name: '牛',   reading: 'うし',       stamp: 'blue', moves: [[1, 0], [0, 1], [0, -1]] },
    crane:    { name: '鶴',   reading: 'つる',       stamp: 'blue', moves: [[0, 1], [-1, -1], [1, -1]] },
    boar:     { name: '猪',   reading: 'いのしし',   stamp: 'red',  moves: [[-1, 0], [1, 0], [0, 1]] },
    eel:      { name: '鰻',   reading: 'うなぎ',     stamp: 'blue', moves: [[-1, 1], [-1, -1], [1, 0]] },
    cobra:    { name: '蛇',   reading: 'へび',       stamp: 'red',  moves: [[-1, 0], [1, 1], [1, -1]] }
};
export const CARD_IDS = Object.keys(CARDS);

export const EMPTY = 0;
export const pieceOf = (seat, master) => seat * 2 + (master ? 2 : 1);
export const seatOf = (piece) => (piece ? (piece - 1) >> 1 : -1);
export const isMaster = (piece) => piece === 2 || piece === 4;
export const rowOf = (sq) => Math.floor(sq / SIZE);
export const colOf = (sq) => sq % SIZE;

export function initialBoard() {
    const board = Array(CELLS).fill(EMPTY);
    for (let c = 0; c < SIZE; c++) {
        board[4 * SIZE + c] = pieceOf(0, c === 2);
        board[c] = pieceOf(1, c === 2);
    }
    return board;
}

// 席 seat が、マス from からカードの動き [dx, dy] で行く先（盤の外なら -1）
// 席0は上が前、席1は下が前（盤を180度回した向き）
export function target(seat, from, [dx, dy]) {
    const sign = seat === 0 ? 1 : -1;
    const r = rowOf(from) - dy * sign;
    const c = colOf(from) + dx * sign;
    return r < 0 || r >= SIZE || c < 0 || c >= SIZE ? -1 : r * SIZE + c;
}

/**
 * 席 seat の動ける手を全部挙げる。state: { board, hands }
 * 戻り値：[{ card, from, to }]（同じ行き先でもカードが違えば別の手）
 */
export function legalMoves(state, seat) {
    const list = [];
    const { board } = state;
    state.hands[seat].forEach(card => {
        const moves = CARDS[card].moves;
        for (let from = 0; from < CELLS; from++) {
            if (seatOf(board[from]) !== seat) continue;
            moves.forEach(delta => {
                const to = target(seat, from, delta);
                if (to >= 0 && seatOf(board[to]) !== seat) list.push({ card, from, to });
            });
        }
    });
    return list;
}

/**
 * 手を指したあとの状態（もとの state は変えない）と、勝ちの有無
 * move: { card, from, to } か、動けないときの { card, pass: true }
 * 戻り値：{ state: { board, hands, side }, captured, win: null | 'stone' | 'stream' }
 */
export function applyMove(state, seat, move) {
    const board = [...state.board];
    let captured = EMPTY;
    let win = null;
    if (!move.pass) {
        captured = board[move.to];
        board[move.to] = board[move.from];
        board[move.from] = EMPTY;
        if (isMaster(captured)) win = 'stone';
        else if (isMaster(board[move.to]) && move.to === TEMPLE[1 - seat]) win = 'stream';
    }
    // 使ったカードを脇へ（相手の向きに回す）。脇のカードを手札に入れる
    const hands = state.hands.map(h => [...h]);
    hands[seat][hands[seat].indexOf(move.card)] = state.side;
    return { state: { board, hands, side: move.card }, captured, win };
}

// 同じ局面かどうかを比べるための文字列（盤・手札・脇・手番）。手札の2枚の並びは問わない
export function positionKey(state, turn) {
    return `${state.board.join('')}|${[...state.hands[0]].sort().join(',')}|${[...state.hands[1]].sort().join(',')}|${state.side}|${turn}`;
}
