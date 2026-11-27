/**
 * ES モジュールから Pwa を使うための入口（中身は pwa.js）
 *   import { preventZoom, registerServiceWorker } from './pwa.mjs';
 */

import './pwa.js';

export const { preventZoom, registerServiceWorker } = globalThis.Pwa;
