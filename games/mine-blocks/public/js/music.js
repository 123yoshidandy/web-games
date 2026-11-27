/**
 * 音（BGM は sound/bgm.js、効果音は共通の sound/effects.js、再生エンジンは packages/sound の写しの sound/engine.js）
 *
 * - 最初のタップ・クリック・キー入力のあとに鳴り始める。別のタブを見ている間は止める
 * - .sound-toggle のボタン（ヘッダーとトップ画面）で BGM と効果音をまとめて ON/OFF し、localStorage に保存する
 * - 画面からは music.play('<共通の効果音の名前>') で鳴らす（packages/sound/README.md の「共通の効果音」の表）
 */

const music = Sound.createPlayer({ library: 'mine-blocks', storageKey: 'mineBlocks.sound' });

// 音を使えるようにし、BGM を流して、サウンドのボタンをつなぐ（ui.js の準備から呼ぶ）
function setupMusic() {
    music.setup();
    music.playBgm('workshop');

    // ON/OFF は aria-pressed で伝え、文言は変えない（どちらかが鳴っていれば ON）
    const syncButtons = (settings = music.getSettings()) => {
        const on = String(settings.bgm || settings.effects);
        document.querySelectorAll('.sound-toggle').forEach(button => button.setAttribute('aria-pressed', on));
    };
    document.querySelectorAll('.sound-toggle').forEach(button => button.addEventListener('click', () => music.toggleAll()));
    music.onChange(syncButtons);
    syncButtons();
}
