/**
 * 地形のつながり
 * となり合う2枚のタイルの、向かい合う辺の地形が同じなら、その地形でつながる
 * つながりの大きさは、タイルの枚数で数える（2地形のタイルは、それぞれの地形で1枚として数える）
 */

import { TILES } from './tiles.js';
import { key, parseKey, neighbor, opposite, edgeHabitat } from './hex.js';

// その地形の、つながりの一覧（各つながりはマスの key の配列）
export function corridors(env, habitat) {
    const seen = new Set();
    const groups = [];
    Object.keys(env).forEach(start => {
        if (seen.has(start) || !TILES[env[start].tile].habitats.includes(habitat)) return;
        const group = [];
        const queue = [start];
        seen.add(start);
        while (queue.length) {
            const k = queue.pop();
            group.push(k);
            const [q, r] = parseKey(k);
            const here = env[k];
            for (let d = 0; d < 6; d++) {
                if (edgeHabitat(TILES[here.tile].habitats, here.rot, d) !== habitat) continue;
                const [x, y] = neighbor(q, r, d);
                const nk = key(x, y);
                const there = env[nk];
                if (!there || seen.has(nk)) continue;
                if (edgeHabitat(TILES[there.tile].habitats, there.rot, opposite(d)) !== habitat) continue;
                seen.add(nk);
                queue.push(nk);
            }
        }
        groups.push(group);
    });
    return groups;
}

// その地形の、いちばん大きいつながりのタイル数
export const largestCorridor = (env, habitat) => corridors(env, habitat).reduce((m, g) => Math.max(m, g.length), 0);
