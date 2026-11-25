/**
 * API Gateway（WebSocket）から呼ばれる Lambda の入口（部屋の仕組みは netplay-kit（packages/netplay-kit）の共通部品）
 */

import { createHandler } from 'netplay-kit/server/handler.js';
import game from './game-definition.js';

export const handler = createHandler(game);
