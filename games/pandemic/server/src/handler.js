/**
 * API Gateway（WebSocket）から呼ばれる Lambda の入口（部屋の処理は共通部品、ゲームの中身は game-definition.js）
 * web-games の1つのスタック（router.js）から、接続の ?game=pandemic で呼ばれる。部屋のキーにゲームの名前を付ける
 */

import { createHandler } from 'netplay-kit/server/handler.js';
import game from './game-definition.js';

export const handler = createHandler(game, { keyPrefix: 'pandemic' });
