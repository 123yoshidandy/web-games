import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot } from './helpers.js';

const players = [{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C' }];

function newMatch() {
    const settings = definition.settings.validate({}, definition.settings.defaults());
    return definition.create({ players, settings, random: createRandom(9) });
}

// 部屋の処理の代わりに、操作を handle に渡す
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
            if (definition.cpu.needsStep(game)) {
                expect(definition.cpu.step(game)).toBe(true);
            } else {
                const view = definition.view(game, game.current, { since: null });
                let command = { type: 'roll' };
                if (view.phase === 'choose') command = { type: 'move', ...view.options[0], extra: 1 };
                else if (view.phase === 'decide') command = { type: Object.keys(view.runners).length >= 3 ? 'stop' : 'roll' };
                expect(act(game, game.current, command)).toBeNull();
            }
            if (++steps > 20000) throw new Error('終わらない');
        }
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.options.cpuLevel).toBe('normal');
    });

    it('断る操作は理由を返し、状態を変えない', () => {
        const game = newMatch();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const before = snapshot(game);
        const other = (game.current + 1) % 3;
        expect(act(game, other, { type: 'roll' })).toMatch(/手番/);
        expect(act(game, game.current, { type: 'stop' })).toBeTruthy();
        expect(act(game, game.current, null)).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('観戦者には進め方を渡さない', () => {
        const game = newMatch();
        expect(definition.spectatorView(game, { since: null }).options).toBeNull();
    });

    it('設定は決まった強さだけを受け付ける', () => {
        expect(() => definition.settings.validate({ cpuLevel: 'strong' }, { cpuLevel: 'normal' })).toThrow();
    });
});
