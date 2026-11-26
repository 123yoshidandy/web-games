import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';

// ヒントの suggest はビューを受け取る形なので渡さない（定義の CPU にその席の手を選ばせる）
testOnline({ definition });

describe('オンライン対戦（バン！ダイスゲーム）', () => {
    it('保安官と自分のほかは、生きている人の役割がビューに入らない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('addCpu');
        await a.send('addCpu');
        await a.send('start');
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.players[1].role).toBeTruthy();
        for (const p of view.players) {
            if (p.id === 1 || !p.alive) continue;
            if (p.role !== null) expect(p.role).toBe('sheriff');
        }
        expect(view.players.filter(p => p.id !== 1 && p.role === null).length).toBeGreaterThan(0);
    });
});
