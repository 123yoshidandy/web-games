import { describe, it, expect } from 'vitest';
import { Board } from '../public/js/board.js';
import { TILE_TYPES } from '../public/js/tiles.js';
import { TITLE_LAYOUT, tileInner, spriteMarkup } from '../public/js/tile-art.js';
import { helpMarkup } from '../public/js/help.js';

describe('絵', () => {
    it('タイトルの絵は、ルールどおりにつながった盤面で、コマは別々の要素にいる', () => {
        const board = new Board();
        checkTitleLayout(board);
    });

    it('どのタイルも 4 つの向きの絵がある', () => {
        TILE_TYPES.forEach(type => [0, 1, 2, 3].forEach(rot => {
            expect(tileInner(type, rot)).toContain('tile-edge');
        }));
        const sprite = spriteMarkup();
        expect(sprite.match(/<symbol id="tile-/g)).toHaveLength(TILE_TYPES.length * 4);
        expect(sprite).toContain('id="meeple"');
    });

    it('遊び方の図は、sprite にある絵だけを使う', () => {
        const ids = [...helpMarkup().matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
        const sprite = spriteMarkup();
        expect(ids.length).toBeGreaterThan(0);
        ids.forEach(id => expect(sprite).toContain(`id="${id}"`));
    });
});

function checkTitleLayout(board) {
    TITLE_LAYOUT.forEach(([x, y, type, rot, meeple]) => {
        board.place(x, y, type, rot, meeple ? { seat: meeple[0], feature: meeple[1] } : null);
    });
    for (const cell of board.cells.values()) {
        for (let side = 0; side < 4; side++) {
            const n = board.neighbor(cell.x, cell.y, side);
            if (n) expect(n.shape.edges[(side + 2) % 4], `${cell.key} 辺${side}`).toBe(cell.shape.edges[side]);
        }
    }
    const regions = new Set();
    for (const cell of board.cells.values()) {
        if (!cell.meeple) continue;
        const region = board.region(cell.x, cell.y, cell.meeple.feature);
        expect(region.meeples).toHaveLength(1);
        regions.add(region.id);
    }
    expect(regions.size).toBe(TITLE_LAYOUT.filter(t => t[4]).length);
}
