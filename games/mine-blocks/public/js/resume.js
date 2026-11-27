/**
 * 続きからモジュール
 * エンドレスの解きかけの問題（問題番号と置いたピース）を端末に保存し、トップ画面の「続きから」で同じ盤面に戻す
 * チャレンジ（持ち時間があり、閉じたあとに続ける遊び方をしない）とオンライン対戦は保存しない
 */

const RESUME_SAVE_KEY = 'mineBlocks.save';
const RESUME_SAVE_VERSION = 1;

// 保存した盤面を置き直している間は、置く音を鳴らさず、保存もし直さない
let restoringSave = false;

function isEndlessPlaying() {
    return !challengeState.active && !isOnlineActive();
}

// ピースを置いた・外したあとに呼ぶ。1つも置いていなければ、保存を消す（新しい問題と変わらないため）
function saveProgress() {
    if (restoringSave || !isEndlessPlaying() || gameState.seed === null) return;
    const placements = [...pieceOverlays].map(([blockIndex, { row, col }]) => ({ blockIndex, row, col }));
    if (placements.length === 0) {
        clearSavedProgress();
        return;
    }
    const save = {
        version: RESUME_SAVE_VERSION,
        seed: gameState.seed,
        placements,
        clearedCount: gameState.clearedCount,
        elapsed: Date.now() - gameState.startTime
    };
    try {
        localStorage.setItem(RESUME_SAVE_KEY, JSON.stringify(save));
    } catch {
        // 保存できない環境（プライベートモードなど）では、続きからを出さないだけにする
    }
}

function clearSavedProgress() {
    try {
        localStorage.removeItem(RESUME_SAVE_KEY);
    } catch {
        // 消せなくても遊ぶのには困らない
    }
}

// 保存を読む。形が合わないもの（古い版・壊れたもの）は無いものとして扱う
function loadSavedProgress() {
    try {
        const save = JSON.parse(localStorage.getItem(RESUME_SAVE_KEY) || 'null');
        if (!save || save.version !== RESUME_SAVE_VERSION || !Number.isInteger(save.seed) || !Array.isArray(save.placements)) {
            return null;
        }
        return save;
    } catch {
        return null;
    }
}

function hasSavedProgress() {
    return loadSavedProgress() !== null;
}

// 保存した問題を作り直し、置いたピースを同じ場所に置き直す。置けないものは飛ばす（ルールの変更などで壊れた保存）
function resumeSavedGame() {
    const save = loadSavedProgress();
    if (!save) return false;

    generateGame(save.seed);
    gameState.clearedCount = Number.isInteger(save.clearedCount) ? save.clearedCount : 0;
    gameState.startTime = Date.now() - (Number.isFinite(save.elapsed) ? Math.max(0, save.elapsed) : 0);

    restoringSave = true;
    try {
        save.placements.forEach(({ blockIndex, row, col }) => {
            const block = gameState.blocks[blockIndex];
            if (!block || pieceOverlays.has(blockIndex) || !canPlaceBlock(row, col, block)) return;
            gameState.selectedBlockIndex = blockIndex;
            placeBlock(row, col, block);
        });
    } finally {
        restoringSave = false;
        gameState.selectedBlockIndex = -1;
    }
    saveProgress();
    return true;
}
