/**
 * メインモジュール
 * ゲームの初期化と全体のフロー管理を行います
 */

// 指定したシードのゲームを生成
function generateGame(seed) {
    // ボードとブロックをクリア
    clearBoard();

    // シードを設定（同じシードなら同じパズルになる）
    gameState.seed = seed;
    setSeed(seed);

    // ブロックと想定解（配置不可能なセルを含む）を生成
    // 想定解を作れなかった場合は、乱数列の続きを使って作り直す（同じシードなら結果も同じ）
    const maxAttempts = 100;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        gameState.blocks = [];
        generateBlocks();
        if (generateSolutionAndNotPlaceableCells()) {
            break;
        }
    }
    
    // ボードを生成して描画
    generateBoard();
    renderBoard();
    
    // ブロックを描画
    renderBlocks();
    
    // 問題を出した時刻を覚える（クリア時間に使う）
    gameState.startTime = Date.now();

    // アシストの印を消し、使える場面かに合わせてボタンを切り替える
    updateAssist();
}

// ゲーム初期化
function initGame() {
    gameState.clearedCount = 0;

    // 以前の版で共有された問題番号つきのURL（?seed=）は使わないので、URLから外す
    const url = new URL(location.href);
    if (url.searchParams.has('seed')) {
        url.searchParams.delete('seed');
        history.replaceState(null, '', url);
    }

    // 毎回ランダムな問題で始める
    generateGame(createRandomSeed());
    setupEventListeners();
}

// DOMContentLoaded イベントでゲームを初期化
document.addEventListener('DOMContentLoaded', initGame);

// ヘッドレス Chrome での確認用に、状態と主な操作を外から触れるようにする
window.__app = {
    gameState,
    challengeState,
    loadSavedProgress,
    resumeSavedGame,
    generateGame
};

// 画面を拡大させない（ふつうは css/style.css の touch-action で止まる。iOS は viewport の user-scalable を無視するので、2本指の操作を止める）
Pwa.preventZoom();

// ホーム画面に置いて、オフラインでも開けるようにする（PWA）
Pwa.registerServiceWorker();
