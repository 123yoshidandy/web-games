/**
 * KATAN の起動
 */

import UI from './ui.js';
import NetplayClient from './netplay/netplay-client.mjs';
import { loadOnlineSession } from './online-controller.js';

// 画面を拡大させない（ふつうは style.css の touch-action で止まる。古い iOS は2本指の操作を止める）
// touchmove は止めない（passive でない touchmove があると、スクロールの始まりが遅れるため）
document.addEventListener('gesturestart', event => event.preventDefault());

document.addEventListener('DOMContentLoaded', async () => {
    const ui = new UI();
    window.__app = ui; // ヘッドレス Chrome での確認に使う

    // 招待のURL（?room=部屋番号）で開いたら、その部屋に参加する画面を出す（部屋番号は画面に出さない）
    // 招待で入ったあとの読み込み直しなど、その部屋の参加情報があれば、下の resumeOnline で前の席に戻る
    const invited = NetplayClient.inviteRoomCode();
    if (invited && loadOnlineSession()?.roomCode !== invited) {
        ui.showOnlineMenu({ invited: true });
        return;
    }
    // 前回入っていた部屋があれば戻る。なければ開始画面
    ui.showSetup();
    await ui.resumeOnline();
});

// ホーム画面に置いて、オフラインでも開けるようにする（PWA）
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(registration => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map(entry => entry.name)];
        registration.active?.postMessage({ type: 'cache-urls', urls });
    }).catch(() => {});
}
