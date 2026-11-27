import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';
import { TILES } from '../public/js/data.js';

testOnline({ definition, suggest });

describe('オンライン対戦（禁断の砂漠）', () => {
    it('ロビーで決めた難易度で始まり、裏のタイルの中身と山の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'elite' } });
        expect(b.last('lobby').settings).toEqual({ level: 'elite' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.level).toBe('elite');
        expect(view.stormDeckCount).toBeGreaterThan(0);
        expect(view).not.toHaveProperty('stormDeck');
        expect(view).not.toHaveProperty('gearDeck');
        expect(view).not.toHaveProperty('tiles');
        // 裏のタイルは、裏の絵（水の印・墜落地点）だけ。中身の種類とタイルの番号は入らない
        view.cells.filter(c => c && !c.revealed).forEach(c => {
            expect(c.kind).toBeNull();
            expect(c).not.toHaveProperty('id');
            expect(c).not.toHaveProperty('part');
        });
        const text = JSON.stringify(view);
        expect(text).not.toContain('"seed"');
        expect(TILES.length).toBe(24);
    });
});
