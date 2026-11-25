import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand, LEVELS } from '../public/js/cpu-player.js';
import { snapshot } from './helpers.js';

const players = [{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C' }];

function newMatch(patch = {}) {
    const settings = definition.settings.validate({ cpuLevel: 'easy', ...patch }, definition.settings.defaults());
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
            for (const seat of [0, 2]) {
                if (!game.pending[seat]) continue;
                const command = chooseCommand(createGameView(game, seat), LEVELS.normal);
                expect(act(game, seat, JSON.parse(JSON.stringify(command)))).toBeNull();
            }
            if (++steps > 3000) throw new Error('終わらない');
        }
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.scores).toEqual(game.scores);
    });

    it('断る操作は理由を返し、状態を変えない。余分な項目は記録に残さない', () => {
        const game = newMatch();
        const before = snapshot(game);
        expect(act(game, 0, { type: 'startDiscard', cards: ['oldEarth'] })).toBeTruthy();
        expect(act(game, 0, { type: 'action', actions: ['produce'] })).toBeTruthy();
        expect(act(game, 0, { type: 'hack' })).toBeTruthy();
        expect(act(game, 0, null)).toBeTruthy();
        expect(snapshot(game)).toBe(before);
        expect(act(game, 0, { type: 'startDiscard', cards: game.players[0].hand.slice(0, 2), extra: 'x' })).toBeNull();
        expect(JSON.stringify(game.commands.at(-1))).not.toContain('extra');
    });

    it('観戦者のビューには、手札と選ぶ前の行動が入らない', () => {
        const game = newMatch();
        for (const seat of [0, 1, 2]) act(game, seat, { type: 'startDiscard', cards: game.players[seat].hand.slice(0, 2) });
        act(game, 0, { type: 'action', actions: ['develop'] });
        const view = definition.spectatorView(game, { since: null });
        expect(view.hand).toBeNull();
        expect(view.decision).toBeNull();
        expect(view.players[0].actions).toBeNull();
        expect(view.players[0].chosen).toBe(true);
    });

    it('設定は決まった値だけを受け付ける。上級ルールは 2 人のときだけ', () => {
        expect(() => definition.settings.validate({ cpuLevel: 'strong' }, definition.settings.defaults())).toThrow();
        expect(() => definition.settings.validate({ advanced: 'yes' }, definition.settings.defaults())).toThrow();
        expect(newMatch({ advanced: true }).options.advanced).toBe(false);
    });
});
