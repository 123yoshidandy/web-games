import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand, LEVELS } from '../public/js/cpu-player.js';
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
    it('人間の操作（端末から届いた形）と CPU の手で最後まで進み、保存した記録から同じ状態に戻せる', () => {
        const game = newMatch();
        let steps = 0;
        while (!definition.isOver(game)) {
            while (definition.cpu.needsStep(game)) expect(definition.cpu.step(game)).toBe(true);
            if (definition.isOver(game)) break;
            const seat = game.decision.seat;
            const command = chooseCommand(createGameView(game, seat), LEVELS.normal);
            expect(act(game, seat, JSON.parse(JSON.stringify(command)))).toBeNull();
            if (++steps > 5000) throw new Error('終わらない');
        }
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.scores).toEqual(game.scores);
    });

    it('断る操作は理由を返し、状態を変えない。余分な項目は記録に残さない', () => {
        const game = newMatch();
        const seat = game.decision.seat;
        const before = snapshot(game);
        expect(act(game, (seat + 1) % 4, { type: 'role', role: 0 })).toBeTruthy();
        expect(act(game, seat, { type: 'role', role: 99 })).toBeTruthy();
        expect(act(game, seat, { type: 'build', building: 'castle' })).toBeTruthy();
        expect(act(game, seat, null)).toBeTruthy();
        expect(snapshot(game)).toBe(before);
        const prospector = game.roles.find(r => r.key === 'prospector');
        expect(act(game, seat, { type: 'role', role: prospector.id, extra: 'x' })).toBeNull();
        expect(JSON.stringify(game.commands.at(-1))).not.toContain('extra');
    });

    it('観戦者のビューには、判断の中身と山の並びが入らない', () => {
        const game = newMatch();
        const view = definition.spectatorView(game, { since: null });
        expect(Object.keys(view.decision).sort()).toEqual(['kind', 'seat']);
        expect(view.options).toBeNull();
        expect(view.deck).toBeUndefined();
        expect(typeof view.deckCount).toBe('number');
    });

    it('設定は決まった値だけを受け付ける', () => {
        expect(() => definition.settings.validate({ cpuLevel: 'strong' }, definition.settings.defaults())).toThrow();
    });
});
