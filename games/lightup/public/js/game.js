/**
 * このゲームの設定（puzzle-kit の画面とロジックが読む）。DOM に触れない（サーバーとテストも読む）
 *   id       ゲームの名前（games/ の下のフォルダ名。音のライブラリの名前にも使う）
 *   title    画面に出す名前
 *   type     パズルの種類（js/puzzles/<id>/index.js）
 *   bgm      BGM の曲の名前（js/sound/bgm.js で登録したもの）
 * STORAGE_PREFIX は保存（localStorage）の名前の頭。ほかのゲームと重ならない名前にする
 */

import lightup from './puzzles/lightup/index.js';

export const STORAGE_PREFIX = 'lightup.';

export default {
    id: 'lightup',
    title: 'ライトアップ',
    type: lightup,
    bgm: 'lantern'
};
