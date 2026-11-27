// packages/pwa 1.0.0 からコピーしたファイル。ここでは直さず、packages/pwa で直してから同期する
/**
 * ES モジュールから Pwa を使うための入口（中身は pwa.js）
 *   import { preventZoom, registerServiceWorker } from './pwa.mjs';
 */

import './pwa.js';

export const { preventZoom, registerServiceWorker } = globalThis.Pwa;
