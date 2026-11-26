/**
 * 画面：1人プレイと、オンライン対戦の盤面の表示
 * 判定は logic.js、部屋と通信は online.js が行う
 */

import { BLANK, MAX_ROWS, baseKana, boardWidth, checkGuess, createRandom, cycleVariant, evaluateGuess, normalizeLetter, pickAnswer, trimBlanks, usesBlank } from './logic.js';
import { resultMessage, setupOnline } from './online.js';

const MODE_STORAGE_KEY = 'wordle-mode';
const GAME_STORAGE_KEY = 'wordle-game'; // 1人プレイの途中経過（モード・シード・入れた単語）
const RESULT_DELAY_MS = 1500; // 最後の行をめくり終えてから結果を出すまで
const STATUS_RANK = { absent: 1, present: 2, correct: 3 };

// キーの並び（右から あ か さ … の五十音。空文字は空き、BLANK は空白のキー）。濁音・半濁音・小さい字は「゛゜小」で切り替える
const KEY_ROWS = [
    ['わ', 'ら', 'や', 'ま', 'は', 'な', 'た', 'さ', 'か', 'あ'],
    ['を', 'り', '', 'み', 'ひ', 'に', 'ち', 'し', 'き', 'い'],
    ['ん', 'る', 'ゆ', 'む', 'ふ', 'ぬ', 'つ', 'す', 'く', 'う'],
    ['ー', 'れ', '', 'め', 'へ', 'ね', 'て', 'せ', 'け', 'え'],
    [BLANK, 'ろ', 'よ', 'も', 'ほ', 'の', 'と', 'そ', 'こ', 'お']
];
const BLANK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v5h16v-5"/></svg>';
const BACKSPACE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-6-7z"/><path d="M11 9l6 6M17 9l-6 6"/></svg>';

// ゲームの状態
const state = {
    mode: loadMode(),
    screen: 'title', // title・game
    secret: '',
    seed: 0,
    words: [], // 1人プレイで決定した単語（続きからで並べ直す）
    length: 5,
    grid: [],
    currentRow: 0,
    currentCol: 0,
    gameOver: false,
    online: null // オンライン対戦中は { matchId, seat, waiting, view }
};

// 保存したモードを読み込む
function loadMode() {
    try {
        return localStorage.getItem(MODE_STORAGE_KEY) === 'pokemon' ? 'pokemon' : 'word';
    } catch (e) {
        return 'word';
    }
}

function saveMode(mode) {
    try {
        localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch (e) {
        // 保存できなくても遊べるので無視する
    }
}

// 1人プレイの途中経過。答えはシードから作り直す
function saveGame() {
    try {
        if (state.gameOver) localStorage.removeItem(GAME_STORAGE_KEY);
        else localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify({ mode: state.mode, seed: state.seed, words: state.words }));
    } catch (e) {
        // 保存できなくても遊べるので無視する
    }
}

// 続きから遊べる途中のゲーム（1つも決定していなければ、続きとみなさない）
function loadGame() {
    try {
        const game = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY));
        if (!game || !['word', 'pokemon'].includes(game.mode) || !Number.isInteger(game.seed) || !Array.isArray(game.words)) return null;
        return game.words.length > 0 && game.words.length < MAX_ROWS ? game : null;
    } catch (e) {
        return null;
    }
}

// ===== 画面の切り替え =====

function showScreen(name) {
    state.screen = name;
    document.getElementById('screen-title').classList.toggle('hidden', name !== 'title');
    document.getElementById('screen-game').classList.toggle('hidden', name !== 'game');
    if (name === 'title') document.getElementById('resume').classList.toggle('hidden', !loadGame());
}

// タイトルへ戻る（途中のゲームは保存してあるので、「続きから」で再開できる）
function showTitle() {
    showScreen('title');
}

// ===== 盤面 =====

// ゲームボードを初期化
function initializeBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    board.style.setProperty('--len', state.length); // マスの大きさは CSS が、あいた場所と文字数から決める

    for (let i = 0; i < MAX_ROWS; i++) {
        const row = document.createElement('div');
        row.classList.add('row');
        row.dataset.row = i;

        for (let j = 0; j < state.length; j++) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            tile.dataset.row = i;
            tile.dataset.col = j;
            row.appendChild(tile);
        }

        board.appendChild(row);
    }
}

// 盤面と入力の状態を空にする
function resetBoard() {
    state.grid = Array(MAX_ROWS).fill().map(() => Array(state.length).fill(''));
    state.currentRow = 0;
    state.currentCol = 0;
    state.gameOver = false;

    initializeBoard();
    updateCurrentRowFocus();

    document.querySelectorAll('#keyboard .key').forEach(key => {
        key.classList.remove('correct', 'present', 'absent');
        delete key.dataset.variant;
    });
}

function rowTiles(row) {
    return document.querySelectorAll(`.tile[data-row="${row}"]`);
}

// マスに字を置く（空白は字を出さず、印を CSS で描く）
function setTileLetter(tile, letter) {
    tile.textContent = letter === BLANK ? '' : letter;
    tile.classList.toggle('blank', letter === BLANK);
}

// 行に文字を入れる（入力中の文字も含めて置き換える）
function fillRow(row, word) {
    const tiles = rowTiles(row);
    [...word].forEach((letter, i) => {
        state.grid[row][i] = letter;
        setTileLetter(tiles[i], letter);
    });
}

// 判定した行をめくる
function flipRow(row, word, statuses) {
    const tiles = rowTiles(row);

    document.querySelector(`.row[data-row="${row}"]`)?.classList.remove('pending');

    // アニメーションとともにタイルをフリップ
    for (let i = 0; i < statuses.length; i++) {
        const tile = tiles[i];
        setTimeout(() => {
            tile.classList.add('flip');
            setTimeout(() => {
                tile.classList.add(statuses[i]);
                updateKeyboard(word[i], statuses[i]);
            }, 150);
        }, i * 200);
    }
}

// キーボードの色を更新（強い判定で上書きし、弱い判定では戻さない）
// 濁音・半濁音・小さい字の判定は、清音のキーの角の点で見せる
function updateKeyboard(letter, status) {
    const base = baseKana(letter);
    const key = document.querySelector(`#keyboard .key[data-key="${base}"]`);
    if (!key) return;

    if (base !== letter) {
        if ((STATUS_RANK[key.dataset.variant] ?? 0) < STATUS_RANK[status]) key.dataset.variant = status;
        return;
    }
    const current = ['correct', 'present', 'absent'].find(name => key.classList.contains(name));
    if ((STATUS_RANK[current] ?? 0) >= STATUS_RANK[status]) return;
    key.classList.remove('correct', 'present', 'absent');
    key.classList.add(status);
}

// 現在の行にフォーカススタイルを適用する
function updateCurrentRowFocus() {
    document.querySelectorAll('.row').forEach(row => {
        row.classList.remove('current-row');
    });

    const currentRow = document.querySelector(`.row[data-row="${state.currentRow}"]`);
    if (currentRow && !state.gameOver && !state.online?.waiting) {
        currentRow.classList.add('current-row');
    }
}

// ===== 入力 =====

function canType() {
    return state.screen === 'game' && !state.gameOver && !state.online?.waiting;
}

// キーボードを組み立てる
function setupKeyboard() {
    const keyboard = document.getElementById('keyboard');
    const addKey = (className, key, label, ariaLabel) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `key ${className}`.trim();
        if (key) button.dataset.key = key;
        if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
        button.innerHTML = label;
        keyboard.appendChild(button);
        return button;
    };

    KEY_ROWS.flat().forEach(kana => {
        if (!kana) {
            addKey('spacer', null, '').tabIndex = -1;
            return;
        }
        if (kana === BLANK) {
            addKey('blank-key', BLANK, BLANK_ICON, '空白').title = '空白';
            return;
        }
        // 元のひらがなを覚えておき、モードに合わせて表示を切り替える
        addKey('', kana, kana).dataset.kana = kana;
    });
    addKey('action mod', 'MODIFIER', '゛゜小', '濁点・半濁点・小さい字');
    addKey('action backspace', 'BACKSPACE', BACKSPACE_ICON, '1文字消す');
    addKey('action enter', 'ENTER', '決定');

    keyboard.addEventListener('click', (e) => {
        const button = e.target.closest('.key');
        if (!button || button.classList.contains('spacer')) return;
        const key = button.dataset.key;
        if (key === 'ENTER') {
            handleEnterKey();
        } else if (key === 'BACKSPACE') {
            handleBackspace();
        } else if (key === 'MODIFIER') {
            handleModifier();
        } else {
            handleLetter(key);
        }
    });

    document.addEventListener('keydown', handleKeyDown);
}

// キーボードの文字をモードに合わせる
function updateKeyboardLabels() {
    document.querySelectorAll('#keyboard .key[data-kana]').forEach(key => {
        const letter = normalizeLetter(state.mode, key.dataset.kana);
        key.dataset.key = letter;
        key.textContent = letter;
    });
    // 空白のキーは、答えの文字数がそろっていないモードだけで使う（ほかでは空きにする）
    const blankKey = document.querySelector('#keyboard .blank-key');
    blankKey.classList.toggle('spacer', !usesBlank(state.mode));
    blankKey.tabIndex = usesBlank(state.mode) ? 0 : -1;
}

// 直前の字を、濁音・半濁音・小さい字に切り替える（か→が→か、は→ば→ぱ→は）
function handleModifier() {
    if (!canType() || state.currentCol === 0) return;
    const col = state.currentCol - 1;
    const next = cycleVariant(state.grid[state.currentRow][col]);
    if (!next) return;

    state.grid[state.currentRow][col] = next;
    const tile = document.querySelector(`.tile[data-row="${state.currentRow}"][data-col="${col}"]`);
    tile.textContent = next;
    tile.classList.add('pop');
    setTimeout(() => tile.classList.remove('pop'), 100);
}

// キーボード入力の処理（入力欄に書いているときと、ダイアログを開いているときは受け付けない）
function handleKeyDown(e) {
    if (state.screen !== 'game' || e.target.closest?.('input') || document.querySelector('.modal:not(.hidden)')) return;

    if (e.key === 'Enter') {
        handleEnterKey();
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowLeft') {
        handleBackspace();
    } else if (/^[ぁ-んゔァ-ヴー]$/.test(e.key)) {
        handleLetter(normalizeLetter(state.mode, e.key));
    } else if (e.key === ' ' && usesBlank(state.mode)) {
        e.preventDefault();
        handleLetter(BLANK);
    }
}

// 文字入力の処理
function handleLetter(key) {
    if (!canType()) return;
    if (state.currentCol >= state.length) return;

    const tile = document.querySelector(`.tile[data-row="${state.currentRow}"][data-col="${state.currentCol}"]`);
    state.grid[state.currentRow][state.currentCol] = key;

    setTileLetter(tile, key);
    tile.classList.add('pop');
    setTimeout(() => {
        tile.classList.remove('pop');
    }, 100);

    state.currentCol++;
    updateCurrentRowFocus();
}

// バックスペースの処理
function handleBackspace() {
    if (!canType()) return;
    if (state.currentCol === 0) return;

    state.currentCol--;
    state.grid[state.currentRow][state.currentCol] = '';

    const tile = document.querySelector(`.tile[data-row="${state.currentRow}"][data-col="${state.currentCol}"]`);
    setTileLetter(tile, '');
    updateCurrentRowFocus();
}

// Enterキーの処理
function handleEnterKey() {
    if (!canType()) return;

    if (state.currentCol !== state.length) {
        showMessage(checkGuess(state.mode, '', state.length));
        return;
    }

    const word = state.grid[state.currentRow].join('');
    // ことばモードの1人プレイは、今までどおり何でも決定できる
    if (state.mode === 'pokemon' || state.online) {
        const error = checkGuess(state.mode, word, state.length);
        if (error) {
            showMessage(error);
            return;
        }
    }

    if (state.online) {
        submitOnline(word);
        return;
    }

    flipRow(state.currentRow, word, evaluateGuess(word, state.secret));
    state.currentRow++;
    state.currentCol = 0;
    state.words.push(word);
    setTimeout(updateCurrentRowFocus, 800);
    checkGameEnd(word);
    saveGame();
}

// ===== 1人プレイ =====

// ゲーム終了の確認
function checkGameEnd(word) {
    if (word === state.secret || state.currentRow >= MAX_ROWS) {
        state.gameOver = true;
    }

    const secret = state.secret;
    setTimeout(() => {
        if (secret !== state.secret || state.online) return; // 待つ間に新しいゲームが始まった

        if (word === secret) {
            showMessage('素晴らしい！正解です！');
        } else if (state.currentRow >= MAX_ROWS) {
            showMessage(`ゲームオーバー! 正解は ${trimBlanks(secret)} でした`);
        }
    }, RESULT_DELAY_MS);
}

// 新しいゲームを開始（ページを開いたときは、開始の案内を出さない）
// 答えの文字数は伏せる。マスの数はモードで一番長い答えに合わせ、短い答えは後ろが空白になる
function startNewGame(announce = true) {
    state.seed = Math.floor(Math.random() * 2 ** 32); // 答えはこの seed から決まる
    state.secret = pickAnswer(state.mode, createRandom(state.seed));
    state.length = boardWidth(state.mode);
    state.words = [];
    resetBoard();
    saveGame();

    if (announce) showMessage('新しいゲームを開始しました');
}

// 保存した途中のゲームを並べ直す
function resumeGame() {
    const game = loadGame();
    if (!game) return false;
    state.mode = game.mode;
    saveMode(state.mode);
    applyMode();
    state.seed = game.seed;
    state.secret = pickAnswer(state.mode, createRandom(state.seed));
    state.length = boardWidth(state.mode);
    state.words = [];
    resetBoard();
    game.words.forEach(word => {
        fillRow(state.currentRow, word);
        flipRow(state.currentRow, word, evaluateGuess(word, state.secret));
        state.currentRow++;
        state.words.push(word);
    });
    setTimeout(updateCurrentRowFocus, 800);
    return true;
}

// モードに合わせて表示を切り替える
function applyMode() {
    document.querySelectorAll('.mode-button[data-mode]').forEach(button => {
        button.classList.toggle('active', button.dataset.mode === state.mode);
    });

    const width = boardWidth(state.mode);
    document.getElementById('mode-label').textContent = state.mode === 'pokemon' ? 'ポケモン' : 'ことば';
    document.getElementById('rule-text').textContent = state.mode === 'pokemon'
        ? `ポケモンの名前をカタカナで当ててください。文字数は伏せてあり、${width}文字より短い名前は、後ろを空白で埋めた形が答えです。図鑑にある名前だけ入力できます。10回まで挑戦できます。`
        : `${width}文字のひらがなの単語を当ててください。10回まで挑戦できます。`;
    document.getElementById('blank-example').classList.toggle('hidden', !usesBlank(state.mode));

    updateKeyboardLabels();
}

// モード切り替え（タイトル画面で選ぶ。選んだモードは次に開いたときも残る）
function setupModeToggle() {
    document.querySelectorAll('.mode-button[data-mode]').forEach(button => {
        button.addEventListener('click', () => {
            state.mode = button.dataset.mode;
            saveMode(state.mode);
            applyMode();
        });
    });
}

// タイトル画面のボタン
function setupTitle() {
    document.getElementById('start').addEventListener('click', () => {
        startNewGame(false);
        showScreen('game');
    });
    document.getElementById('resume').addEventListener('click', () => {
        if (!resumeGame()) startNewGame(false);
        showScreen('game');
    });
    document.getElementById('home').addEventListener('click', showTitle);
}

// ===== オンライン対戦 =====

const online = setupOnline({
    onView: applyOnlineView,
    onExit: exitOnline,
    showMessage
});

// 自分の答えを送る。公開されるまで、その行は入力できない
function submitOnline(word) {
    if (!online.submit(state.online.view.round, word)) {
        showMessage('サーバーにつながっていません');
        return;
    }
    state.online.waiting = true;
    markPending();
}

function markPending() {
    const row = document.querySelector(`.row[data-row="${state.currentRow}"]`);
    row?.classList.add('pending');
    updateCurrentRowFocus();
}

// サーバーから届いたビューを盤面に映す（届くたびに呼ぶ。同じビューが続いても崩れない）
function applyOnlineView({ view, seat, matchId }) {
    document.body.classList.add('is-online');
    if (state.screen !== 'game') showScreen('game');

    // 新しい対戦なら盤面を作り直す
    if (state.online?.matchId !== matchId) {
        state.online = { matchId, seat, waiting: false, view, resultShown: false };
        state.mode = view.mode;
        state.length = view.length;
        state.secret = '';
        applyMode();
        resetBoard();
        showMessage('対戦開始');
    }
    state.online.view = view;
    state.online.seat = seat;

    // 公開された行をめくる（再接続したときは、まとめてめくる）
    const me = view.players[seat];
    while (state.currentRow < me.rows.length) {
        const { word, result } = me.rows[state.currentRow];
        fillRow(state.currentRow, word);
        flipRow(state.currentRow, word, result);
        state.currentRow++;
        state.currentCol = 0;
    }

    // このラウンドの答えを出し終えていれば、公開を待つ
    if (view.myPending) {
        fillRow(state.currentRow, view.myPending);
        state.currentCol = state.length;
        state.online.waiting = true;
        markPending();
    } else {
        state.online.waiting = false;
        document.querySelector('.row.pending')?.classList.remove('pending');
    }

    state.gameOver = view.phase === 'end';
    setTimeout(updateCurrentRowFocus, 800);
    renderOpponents(view, seat);

    if (state.gameOver && !state.online.resultShown) {
        state.online.resultShown = true;
        const message = resultMessage(view, seat);
        setTimeout(() => {
            if (state.online?.matchId === matchId) showMessage(message);
        }, RESULT_DELAY_MS);
    }
}

// 相手の進み具合（最後に公開した行と、このラウンドに答えを出したか）
function renderOpponents(view, seat) {
    const container = document.getElementById('opponents');
    container.innerHTML = '';
    container.classList.remove('hidden');

    view.players.forEach((player, s) => {
        if (s === seat) return;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'opponent';
        card.addEventListener('click', () => openPlayerBoard(s));

        const head = document.createElement('div');
        head.className = 'opponent-head';
        const name = document.createElement('span');
        name.className = 'opponent-name';
        name.textContent = player.name;
        // 答えを出した（✓）・退出・正解だけを短く出す。考えている間は何も出さない
        const status = document.createElement('span');
        status.className = 'opponent-status';
        let playerState;
        if (player.left) {
            playerState = 'left';
        } else if (view.phase === 'end') {
            playerState = view.winners.includes(s) ? 'won' : 'lost';
        } else {
            playerState = player.submitted ? 'submitted' : 'thinking';
        }
        card.dataset.state = playerState;
        status.textContent = { left: '退出', won: '正解', submitted: '✓' }[playerState] ?? '';
        head.append(name, status);

        // マスは最大18px。入りきらないときは縮める
        const last = player.rows[player.rows.length - 1];
        card.append(head, miniRow(view.length, last, 'minmax(0, 18px)'));
        container.appendChild(card);
    });
}

// 小さな1行（文字と色）
function miniRow(length, row, column = '1fr') {
    const element = document.createElement('div');
    element.className = 'mini-row';
    element.style.gridTemplateColumns = `repeat(${length}, ${column})`;
    for (let i = 0; i < length; i++) {
        const tile = document.createElement('div');
        tile.className = 'mini-tile';
        if (row) {
            setTileLetter(tile, row.word[i]);
            tile.classList.add(row.result[i]);
        }
        element.appendChild(tile);
    }
    return element;
}

// 相手の盤面を全部見る
function openPlayerBoard(s) {
    const view = state.online?.view;
    if (!view) return;
    const player = view.players[s];
    document.getElementById('player-name').textContent = player.name;
    const board = document.getElementById('player-board');
    board.innerHTML = '';
    for (let i = 0; i < view.maxRows; i++) {
        board.appendChild(miniRow(view.length, player.rows[i]));
    }
    document.getElementById('player-modal').classList.remove('hidden');
}

// 部屋を出たら、タイトル画面に戻る
function exitOnline() {
    if (!state.online && !document.body.classList.contains('is-online')) return;
    state.online = null;
    document.body.classList.remove('is-online');
    document.getElementById('opponents').classList.add('hidden');
    state.mode = loadMode();
    applyMode();
    showTitle();
}

// ===== メッセージとダイアログ =====

let messageTimer = null;
function showMessage(msg) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = msg;
    messageEl.style.opacity = '1';

    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
        messageEl.style.opacity = '0';
    }, 2500);
}

// ダイアログ（外側のタップ・×・Esc で閉じる）
function setupModal(modalId, closeId, ...openButtonIds) {
    const modal = document.getElementById(modalId);
    const close = () => modal.classList.add('hidden');
    openButtonIds.forEach(id => {
        document.getElementById(id).addEventListener('click', () => modal.classList.remove('hidden'));
    });
    document.getElementById(closeId).addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

// ===== 初期化 =====

// 画面を拡大させない（ふつうは styles.css の touch-action で止まる。iOS は viewport の user-scalable を無視するので、2本指の操作を止める）
// document 全体の touchmove は止めない（passive でない touchmove があると、スクロールの始まりが遅れるため）
document.addEventListener('gesturestart', (e) => e.preventDefault());

document.getElementById('new-game').addEventListener('click', startNewGame);
setupKeyboard();
setupModeToggle();
setupTitle();
setupModal('info-modal', 'close-info', 'open-help-title', 'open-help-game');
setupModal('player-modal', 'player-close');
applyMode();
showTitle();
online.init();

// ホーム画面に置いて、オフラインでも開けるようにする（PWA）
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(registration => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map(entry => entry.name)];
        registration.active?.postMessage({ type: 'cache-urls', urls });
    }).catch(() => {});
}
