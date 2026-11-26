import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { decide } from '../public/js/cpu-player.js';

// 終局まで打つので、その席のビューを作り、浅く読む CPU（やさしい）で手を選ぶ（ヒントのふつうで読むと 10 秒かかる）
testOnline({ definition, pick: (game, seat) => (game.isOver() ? null : decide(createGameView(game, seat), 'easy')) });

describe('オンライン対戦（チェス）', () => {
    it('席0が白・席1が黒で、各席のビューの you はその席になり、待ったはできない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['しろ', 'くろ']);
        await a.send('start');
        expect(a.last('state').view.you).toBe(0);
        const view = b.last('state').view;
        expect(view.you).toBe(1);
        expect(view.canUndo).toBeFalsy();
    });
});
