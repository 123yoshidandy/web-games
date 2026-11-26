/**
 * アシスト（おすすめの手）モジュール
 * 想定解のうち、まだその場所に置けていないピースを1つ選び、置き場で選んだ状態にして、盤の置き先を光らせる
 * 解く速さを競うチャレンジとオンライン対戦では使えない
 */

// ピースを (row, col) に置いたときに覆うマス [[行, 列], …]
function pieceCells(block, row, col) {
    const cells = [];
    block.grid.forEach((line, r) => line.forEach((filled, c) => {
        if (filled === 1) cells.push([row + r, col + c]);
    }));
    return cells;
}

// おすすめのピース。solution：想定解 [{ blockIndex, row, col }]、board：盤（マスごとに { blockIndex } か null）、blocks：ピースの形
// 置き先をふさいでいるピースが少ないものを選ぶ。返すのは { blockIndex, row, col, cells, blocking }。全部置けていれば null
function suggestPiece(solution, board, blocks) {
    let best = null;
    solution.forEach(placed => {
        const cells = pieceCells(blocks[placed.blockIndex], placed.row, placed.col);
        const at = ([r, c]) => board[r]?.[c]?.blockIndex;
        if (cells.every(cell => at(cell) === placed.blockIndex)) return;
        const blocking = [...new Set(cells.map(at).filter(index => index !== undefined && index !== placed.blockIndex))];
        if (!best || blocking.length < best.blocking.length) best = { ...placed, cells, blocking };
    });
    return best;
}

// ---- 画面 ----

function setupAssist() {
    elements.assistButton.addEventListener('click', showAssist);
}

function assistAvailable() {
    return !challengeState.active && !isOnlineActive();
}

// 問題を出したとき：光らせた印を消し、使えない場面ではボタンを押せなくする
function updateAssist() {
    clearAssist();
    elements.assistButton.disabled = !assistAvailable();
}

function clearAssist() {
    document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
}

function showAssist() {
    clearAssist();
    if (!assistAvailable() || !gameState.solution) return;
    const hint = suggestPiece(gameState.solution, gameState.board, gameState.blocks);
    if (!hint) return;
    const tray = elements.blocksContainer.children[hint.blockIndex];
    // 置き場にあるピースなら選んでおく（光ったマスを押せば置ける）。盤の別の場所にあるなら、置き先だけを光らせる
    if (tray && !tray.classList.contains('used')) {
        if (gameState.selectedBlockIndex === hint.blockIndex) playSound('select');
        selectBlock(hint.blockIndex);
        tray.classList.add('recommended');
    } else {
        playSound('select');
    }
    hint.cells.forEach(([r, c]) => {
        document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`)?.classList.add('recommended');
    });
}
