/**
 * ES モジュールから Sound を使うための入口（中身は engine.js）
 *   import Sound from './sound/engine.mjs';
 *   import './sound/bgm.js';   // ゲームの曲と効果音のデータ（Sound.register を呼ぶ）
 */

import './engine.js';

export const Sound = globalThis.Sound;
export default Sound;
