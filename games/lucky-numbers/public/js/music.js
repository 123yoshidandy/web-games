// 音（BGM は sound/bgm.js、効果音は共通の sound/effects.js、再生エンジンは packages/sound の写しの sound/engine.mjs）
// 最初のタップ・クリック・キー入力のあとに鳴り始め、別のタブを見ている間は止める。ON/OFF は localStorage に保存する
// サウンドのボタン（.sound-toggle）の切り替えと表示は ui.js が持つ
import Sound from './sound/engine.mjs';
import './sound/effects.js';
import './sound/bgm.js';

export const music = Sound.createPlayer({ library: 'lucky-numbers', storageKey: 'lucky-numbers.sound' });
music.setup();
music.playBgm('meadow');
