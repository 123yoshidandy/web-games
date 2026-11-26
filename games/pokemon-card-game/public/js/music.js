// 音（BGM は sound/bgm.js、効果音はこのゲームの sound.js と共通の sound/effects.js、再生エンジンは packages/sound の写しの sound/engine.mjs）
// 最初のタップ・クリック・キー入力のあとに鳴り始める。.sound-toggle のボタン1つで BGM と効果音をまとめて ON/OFF し、localStorage に保存する
// このゲームの効果音（sound.js）も、プレイヤーの効果音の設定に従う
import Sound from './sound/engine.mjs';
import './sound/effects.js';
import './sound/bgm.js';
import { setSoundEnabled, unlockSound } from './sound.js';

export const music = Sound.createPlayer({ library: 'pokemon-card-game', storageKey: 'pokemon-card-game.bgm' });
music.setup();
music.playBgm('battle');

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
// 切り替えはボタンを押したとき（操作の中）なので、ON にしたらそのまま効果音も使えるようにする
music.onChange(settings => {
    setSoundEnabled(settings.effects);
    if (settings.effects) unlockSound();
    syncButtons(settings);
});
setSoundEnabled(music.getSettings().effects);
syncButtons();
new MutationObserver(() => syncButtons()).observe(document.body, { childList: true, subtree: true });
