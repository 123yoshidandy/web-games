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
                const p = definition.view(game, game.current, { since: null }).placements[0];
                expect(act(game, game.current, { type: 'play', x: p.x, y: p.y, rot: p.rot, meeple: p.meeples[0] ?? null, extra: 'x' })).toBeNull();
            }
            if (++steps > 100) throw new Error('終わらない');
        }
        const saved = JSON.parse(JSON.stringify(definition.persist(game)));
        const restored = definition.restore(saved);
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.options.cpuLevel).toBe('normal');
    });

    it('断る操作は理由を返し、状態を変えない', () => {
        const game = newMatch();
        const before = snapshot(game);
        const other = (game.current + 1) % 3;
        expect(act(game, other, { type: 'play', x: 1, y: 0, rot: 0 })).toMatch(/手番/);
        expect(act(game, game.current, { type: 'play', x: 9, y: 9, rot: 0 })).toBeTruthy();
        expect(act(game, game.current, null)).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('観戦者のビューに置ける場所は入らず、袋の並びも入らない', () => {
        const game = newMatch();
        const view = definition.spectatorView(game, { since: null });
        expect(view.placements).toBeNull();
        expect(JSON.stringify(view)).not.toContain('"bag"');
    });

    it('設定は決まった強さだけを受け付ける', () => {
        expect(() => definition.settings.validate({ cpuLevel: 'strong' }, { cpuLevel: 'normal' })).toThrow();
        expect(definition.settings.validate({ cpuLevel: 'easy' }, { cpuLevel: 'normal' })).toEqual({ cpuLevel: 'easy' });
    });
});
