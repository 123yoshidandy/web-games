// BGM（曲は sound/bgm.js、再生エンジンは packages/sound の写しの sound/engine.mjs）
// 最初のタップ・クリック・キー入力のあとに流れ始める。.bgm-toggle のボタンで ON/OFF を切り替え、localStorage に保存する
import Sound from './sound/engine.mjs';
import './sound/bgm.js';

export const music = Sound.createPlayer({ library: 'port-royal', storageKey: 'port-royal.sound' });
music.setup();
music.playBgm('shanty');

// ボタンの表示（aria-pressed。チェックボックスなら checked）を ON/OFF に合わせる。あとから描かれたボタンにも合わせる
function syncButtons(settings = music.getSettings()) {
    const pressed = String(settings.bgm);
    document.querySelectorAll('.bgm-toggle').forEach(button => {
        if (button.type === 'checkbox') button.checked = settings.bgm;
        else if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    });
}

document.addEventListener('click', event => {
    if (event.target.closest('.bgm-toggle')) music.toggle('bgm');
});
music.onChange(syncButtons);
syncButtons();
new MutationObserver(() => syncButtons()).observe(document.body, { childList: true, subtree: true });
