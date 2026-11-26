import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

// ヒントの suggest は、マッチのゲームの合間（次のゲームへ）では手を出さないので、そこだけ「次へ」を打つ
const pick = (game, seat) => (!game.isOver() && game.state.phase === 'between' ? { type: 'next' } : suggest(game, seat));
testOnline({ definition, pick });

describe('オンライン対戦（バックギャモン）', () => {
    it('ロビーで決めた CPU の強さ・マッチの長さ・キューブで始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['しろ', 'くろ']);
        await a.send('setSettings', { settings: { level: 'easy', matchLength: 1, cube: false } });
        expect(b.last('lobby').settings).toEqual({ level: 'easy', matchLength: 1, cube: false });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.level).toBe('easy');
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.options).toMatchObject({ matchLength: 1, cube: false });
    });
});
