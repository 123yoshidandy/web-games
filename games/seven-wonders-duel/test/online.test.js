import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（七不思議デュエル）', () => {
    it('裏向きのカードの中身は、どちらの席にも観戦者にも届かない', () => {
        const game = definition.create({ players: [{ name: 'あお' }, { name: 'みどり' }], random: createRandom(3) });
        game.players.forEach(p => { p.isCPU = true; });
        // 七不思議の選択を済ませ、カードを取る場面まで進める
        for (let i = 0; i < 50 && game.phase !== 'play'; i++) definition.cpu.step(game);
        expect(game.phase).toBe('play');
        [definition.view(game, 0, {}), definition.view(game, 1, {}), definition.spectatorView(game, {})].forEach(view => {
            const hidden = view.structure.filter(s => !s.faceUp);
            expect(hidden.length).toBeGreaterThan(0);
            hidden.forEach(s => expect(s.key).toBe(null));
        });
    });
});
