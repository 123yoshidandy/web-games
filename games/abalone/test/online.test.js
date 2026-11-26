import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { chooseCpuCommand, PROFILES } from '../public/js/cpu-player.js';

// 終局まで打つので、人の席の手は浅く読む CPU（やさしい）で選ぶ（ヒントの suggest は1手に最大 0.8 秒考える）
testOnline({ definition, pick: (game, seat) => (game.isOver() || game.current !== seat ? null : chooseCpuCommand(game, seat, PROFILES.easy)) });

describe('オンライン対戦（アバロン）', () => {
    it('ロビーで決めた CPU の強さと最初の並べ方で始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['くろ', 'しろ']);
        await a.send('setSettings', { settings: { level: 'easy', layout: 'belgian' } });
        expect(b.last('lobby').settings).toEqual({ level: 'easy', layout: 'belgian' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.level).toBe('easy');
        expect(room.game.options.layout).toBe('belgian');
        expect(b.last('state').view.seat).toBe(1);
    });
});
