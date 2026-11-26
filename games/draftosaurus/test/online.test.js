import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { createGameView } from '../public/js/game-view.js';
import { suggest } from '../public/js/cpu-player.js';

// ヒントの suggest はビューを受け取る形なので、その席のビューを作って渡す
testOnline({ definition, pick: (game, seat) => suggest(createGameView(game, seat)) });

describe('オンライン対戦（ドラフトザウルス）', () => {
    it('ほかの席の手と、公開前に選んだ中身はビューに入らず、ロビーで決めた CPU の強さで始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('setSettings', { settings: { cpuLevel: 'easy' } });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options.cpuLevel).toBe('easy');
        const first = a.last('state').view;
        const pick = suggest(first);
        expect(pick).toBeTruthy();
        await a.send('command', { command: pick });
        const view = b.last('state').view;
        expect(view.seat).toBe(1);
        expect(view.hand.length).toBeGreaterThan(0);
        expect(view.myChoice).toBeNull();
        const text = JSON.stringify(view);
        expect(text).not.toContain('"hands":');
        expect(text).not.toContain(`"dino":"${pick.dino}","zone"`);
    });
});
