/**
 * オンライン対戦の接続先
 * DEPLOYED_SERVER_URL は、web-games のサーバー（web-games-online）をデプロイしたら、出力された WebSocketUrl を書く
 * 空のあいだは、公開したページでは「オンライン対戦」を出さない（手元では npm run dev:server のサーバーにつなぐ）
 */

const GAME = 'mine-blocks';
const DEPLOYED_SERVER_URL = 'wss://kuhds82pzk.execute-api.ap-northeast-1.amazonaws.com/prod';

// ?server= で接続先を変えられる。どの接続先にも ?game=mine-blocks を付ける。つなぐ先がなければ null
// ほかのゲームの resolveOnlineServerUrl（netplay-lobby.js）と同じ決め方。このゲームは普通の <script> で読むので import できず、
// window.NetplayClient の resolveServerUrl に ?game= を足す
function getServerUrl() {
    const url = NetplayClient.resolveServerUrl({ deployed: DEPLOYED_SERVER_URL });
    if (!url) return null;
    const parsed = new URL(url);
    if (!parsed.searchParams.has('game')) parsed.searchParams.set('game', GAME);
    return parsed.toString();
}
