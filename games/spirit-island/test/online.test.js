import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（スピリット・アイランド）', () => {
    it('ロビーで決めた難易度で始まり、山の並びは届かない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'hard' } });
        expect(b.last('lobby').settings).toEqual({ level: 'hard' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.level).toBe('hard');
        expect(view.invader.deckCount).toBe(11);
        const text = JSON.stringify(view);
        expect(text).not.toContain('"deck"');
        expect(view.spirits.map(s => s.key)).toEqual(['river', 'earth']);
    });

    it('2人が同時に成長を選べる（手番を待たない）', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        await b.send('command', { command: { type: 'growth', option: 2 } });
        expect(b.last('error')).toBeFalsy();
        await a.send('command', { command: { type: 'growth', option: 1 } });
        expect(a.last('error')).toBeFalsy();
        expect(a.last('state').view.spirits[1].step).not.toBe('growth');
    });
});
