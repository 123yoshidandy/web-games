import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot } from './helpers.js';

const players = [{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C' }, { name: 'D', isCPU: true }];

function newMatch() {
    const settings = definition.settings.validate({ cpuLevel: 'easy' }, definition.settings.defaults());
    return definition.create({ players, settings, random: createRandom(9) });
}

function act(game, seat, command) {
    let rejected = null;
    definition.actions.command.handle({ game, seat, message: { command }, reject: reason => { rejected = reason; } });
    return rejected;
}

describe('オンライン対戦用のゲームの定義', () => {
    it('人間の操作と CPU の手で最後まで進み、保存した記録から同じ状態に戻せる', () => {
        const game = newMatch();
        let steps = 0;
        while (!definition.isOver(game)) {
            while (definition.cpu.needsStep(game)) expect(definition.cpu.step(game)).toBe(true);
            if (definition.isOver(game)) break;
            for (const seat of [...game.waiting]) {
                if (game.players[seat].isCPU || game.pending[seat]) continue;
                const view = definition.view(game, seat, { since: null });
                const option = view.handOptions[0];
                expect(act(game, seat, { type: 'place', dino: option.dino, zone: option.zones[0].zone, extra: 1 })).toBeNull();
                if (definition.isOver(game)) break;
            }
            if (++steps > 100) throw new Error('終わらない');
        }
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.scores).toEqual(game.scores);
        expect(game.commands.every(c => Object.keys(c.command).sort().join() === 'dino,type,zone')).toBe(true);
    });

    it('断る操作は理由を返し、状態を変えない', () => {
        const game = newMatch();
        const before = snapshot(game);
        expect(act(game, 0, { type: 'place', dino: 'nothing', zone: 'river' })).toBeTruthy();
        expect(act(game, 0, { type: 'place', dino: game.hands[0][0], zone: 'pool' })).toBeTruthy();
        expect(act(game, 0, null)).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('観戦者のビューには、誰の手も入らない', () => {
        const game = newMatch();
        const view = definition.spectatorView(game, { since: null });
        expect(view.hand).toBeNull();
        expect(view.handOptions).toBeNull();
        expect(JSON.stringify(view)).not.toContain('"hands"');
    });

    it('設定は決まった値だけを受け付ける', () => {
        expect(() => definition.settings.validate({ cpuLevel: 'strong' }, definition.settings.defaults())).toThrow();
    });
});
