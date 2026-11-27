// packages/puzzle-kit 0.1.0 からコピーしたファイル。ここでは直さず、packages/puzzle-kit で直してから同期する
/**
 * 遊びが終わったときの知らせの入口（1か所だけ）。サイト全体の利用者ごとの記録は、ここでつなぐ
 * 1問（フリー）・組（今日のパズル・タイムアタック）・オンラインのレースが終わるたびに、main.js が1回呼ぶ
 *
 * info：{
 *   mode:    'free' | 'daily' | 'attack' | 'online',
 *   id:      同じ問題の組なら同じになる文字列（二重に数えないため）,
 *   outcome: 'win' | 'loss' | null（ライバル・相手がいなければ null：解いた回数だけ）,
 *   totalMs: 合計の時間（ミリ秒。オンラインで解き終えていなければ null）,
 *   rank:    オンラインの順位（1人用は null）
 * }
 * 共通の記録（netplay-kit の user-stats.js）の形が変わったら、ここだけを直す
 */

import { recordResult } from './netplay/user-stats.js';
import { GAME } from './online-config.js';

export function onGameResult(info) {
    // オンラインの結果は、サーバー（netplay-kit。定義の result が順位を返す）が記録するので、ここからは送らない
    if (info.mode === 'online') return;
    recordResult({ game: GAME, id: info.id, outcome: info.outcome });
}
