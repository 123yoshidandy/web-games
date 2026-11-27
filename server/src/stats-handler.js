/**
 * 利用者ごとの記録の HTTP API（API Gateway の HTTP API から呼ばれる Lambda の入口。docs/user-stats.md）
 *   GET /stats?name=<名前> / POST /results（ローカル対戦の結果）
 * オンライン対戦の結果は、対戦の Lambda（handler.js）が同じテーブルに書く
 * ビルド: npm run build:server（server/dist/stats-handler.mjs。template.yaml の Handler: stats-handler.handler）
 */

import { createStatsHandler } from 'netplay-kit/server/stats-handler.js';
import { DynamoStatsStore } from 'netplay-kit/server/dynamo-stats-store.js';

export const handler = createStatsHandler({ store: new DynamoStatsStore(process.env.STATS_TABLE_NAME) });
