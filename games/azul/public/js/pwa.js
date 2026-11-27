// packages/pwa 1.0.0 からコピーしたファイル。ここでは直さず、packages/pwa で直してから同期する
/**
 * 画面の側の PWA の手伝い（packages/pwa）
 * 普通の <script> で読み込むと window.Pwa になる。ES モジュールからは pwa.mjs を import する
 *
 *   Pwa.preventZoom();            // ピンチ・ダブルタップで画面を拡大させない（iOS は viewport の user-scalable を無視する）
 *   Pwa.registerServiceWorker();  // sw.js を登録し、読み込み済みのファイルの一覧を渡してキャッシュに入れてもらう
 */

(() => {
    // 画面を拡大させない（ふつうは CSS の touch-action で止まる。古い iOS は2本指の操作を止める）
    // touchmove は止めない（passive でない touchmove があると、スクロールの始まりが遅れるため）
    function preventZoom() {
        document.addEventListener('gesturestart', event => event.preventDefault());
    }

    // ホーム画面に置いて、オフラインでも開けるようにする。登録できなければ null（file:// や対応していないブラウザ）
    // updateViaCache: 'none' … sw.js と、sw.js が読む js/sw-core.js の更新の確認に、HTTP のキャッシュを使わない
    //   （sw-core.js だけを直したときも、次に開いたときに新しい版へ切り替わる）
    // 初めて開いたときは、service worker が動く前に読み込みが終わっているので、読んだファイルの一覧を渡す
    function registerServiceWorker(url = 'sw.js') {
        if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return Promise.resolve(null);
        return navigator.serviceWorker.register(url, { updateViaCache: 'none' })
            .then(() => navigator.serviceWorker.ready)
            .then(registration => {
                const urls = [location.href, ...performance.getEntriesByType('resource').map(entry => entry.name)];
                registration.active?.postMessage({ type: 'cache-urls', urls });
                return registration;
            })
            .catch(() => null);
    }

    globalThis.Pwa = { preventZoom, registerServiceWorker };
})();
