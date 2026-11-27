// 音（BGM は sound/bgm.js、効果音は共通の sound/effects.js、再生エンジンは packages/sound の写しの sound/engine.mjs）
// 最初のタップ・クリック・キー入力のあとに鳴り始める。.sound-toggle のボタン1つで BGM と効果音をまとめて ON/OFF し、localStorage に保存する
import Sound from './sound/engine.mjs';
import './sound/effects.js';
import './sound/bgm.js';

export const music = Sound.createPlayer({ library: 'ricochet-robots', storageKey: 'ricochet-robots.sound' });
music.setup();
music.playBgm('ricochet');

// ボタンの表示（aria-pressed。チェックボックスなら checked）を ON/OFF に合わせる。あとから描かれたボタンにも合わせる
function syncButtons(settings = music.getSettings()) {
    const on = settings.bgm || settings.effects;
    document.querySelectorAll('.sound-toggle').forEach(button => {
        if (button.type === 'checkbox') button.checked = on;
        else if (button.getAttribute('aria-pressed') !== String(on)) button.setAttribute('aria-pressed', String(on));
    });
}

document.addEventListener('click', event => {
    if (event.target.closest('.sound-toggle')) music.toggleAll();
});
music.onChange(syncButtons);
syncButtons();
new MutationObserver(() => syncButtons()).observe(document.body, { childList: true, subtree: true });
