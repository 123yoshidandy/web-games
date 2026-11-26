/**
 * オンライン対戦の接続先
 * DEPLOYED_SERVER_URL は、web-games のサーバー（web-games-online）をデプロイしたら、出力された WebSocketUrl を書く
 * 空のあいだは、公開したページでは「オンラインで遊ぶ」を出さない（手元では npm run dev:online のサーバーにつなぐ）
 */

import { resolveOnlineServerUrl } from './netplay/netplay-lobby.js';

export const GAME = 'hearts';
export const DEPLOYED_SERVER_URL = '';

// ?server= で接続先を変えられる。どの接続先にも ?game=hearts を付ける。つなぐ先がなければ null
export const getServerUrl = () => resolveOnlineServerUrl({ game: GAME, deployed: DEPLOYED_SERVER_URL });
