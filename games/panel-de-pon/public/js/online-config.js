/**
 * オンライン対戦の接続先
 * DEPLOYED_SERVER_URL は、web-games のサーバー（web-games-online）をデプロイしたら、出力された WebSocketUrl を書く
 * 空のあいだは、公開したページでは「オンライン対戦」を出さない（手元では npm run dev:server のサーバーにつなぐ）
 */

import { resolveOnlineServerUrl } from './netplay/netplay-lobby.js';

export const GAME = 'panel-de-pon';
export const DEPLOYED_SERVER_URL = 'wss://kuhds82pzk.execute-api.ap-northeast-1.amazonaws.com/prod';

// ?server= で接続先を変えられる。どの接続先にも ?game=panel-de-pon を付ける。つなぐ先がなければ null
export const getServerUrl = () => resolveOnlineServerUrl({ game: GAME, deployed: DEPLOYED_SERVER_URL });
