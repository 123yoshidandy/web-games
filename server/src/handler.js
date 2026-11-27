/**
 * web-games の全ゲームのオンライン対戦を、1つの WebSocket の API・Lambda・テーブルで受け持つ入口（docs/server-merge.md）
 * ゲームは、つなぐときの URL で選ぶ：wss://<API>/prod?game=azul
 * ビルド: npm run build:server（scripts/build-server.mjs。ゲームごとに別の chunk になり、つながったゲームだけを読み込む）
 */

import { createRouter } from 'netplay-kit/server/router.js';

// ゲームの一覧は書かない。esbuild は、この形の import() を games/*/server/src/handler.js の全部としてまとめる
// （パスはこのファイルからの相対。ビルドした後の置き場所には関係しない）
export const handler = createRouter({
    load: (name) => import(`../../games/${name}/server/src/handler.js`)
});
