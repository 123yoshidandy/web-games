import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（フラッシュポイント）', () => {
    it('ロビーで決めた遊び方と難しさで始まり、印の正体と残りの並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { mode: 'experienced', level: 'veteran' } });
        expect(b.last('lobby').settings).toEqual({ mode: 'experienced', level: 'veteran' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view).toMatchObject({ mode: 'experienced', level: 'veteran', phase: 'role' });
        expect(view.pois.every(x => x.revealed || x.victim === null)).toBe(true);
        expect(view).not.toHaveProperty('poiPool');
        expect(typeof view.poiLeft).toBe('number');
    });
});
