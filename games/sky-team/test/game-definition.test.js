import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { suggest } from '../public/js/cpu-player.js';

const players = [{ name: 'A' }, { name: 'B', isCPU: true }];

function newMatch(patch = {}) {
    const settings = definition.settings.validate(patch, definition.settings.defaults());
    return definition.create({ players, settings, random: createRandom(9) });
}

function act(game, seat, command) {
    let rejected = null;
    definition.actions.command.handle({ game, seat, message: { command }, reject: reason => { rejected = reason; } });
    return rejected;
}

const snapshot = game => JSON.stringify({ board: game.board, dice: game.dice, turn: game.turn, commands: game.commands.length });

describe('オンライン対戦用のゲームの定義', () => {
    it('人の操作と CPU の手で最後まで進み、保存した記録から同じ状態に戻せる', () => {
        const game = newMatch({ airport: 'HND' });
        for (let i = 0; i < 200 && !definition.isOver(game); i++) {
            if (definition.cpu.needsStep(game)) expect(definition.cpu.step(game)).toBe(true);
            else expect(act(game, 0, suggest(game, 0))).toBeNull();
        }
        expect(definition.isOver(game)).toBe(true);
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(snapshot(restored)).toBe(snapshot(game));
        expect(restored.options.airport).toBe('HND');
    });

    it('断る操作は理由を返し、状態を変えない。知らない種類（代行など）は送れない', () => {
        const game = newMatch();
        const before = snapshot(game);
        expect(act(game, 1, { type: 'place', die: 0, slot: 'axisC' })).toBeTruthy();
        expect(act(game, 0, { type: 'proxy', die: 0 })).toBeTruthy();
        expect(act(game, 0, null)).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('抜けた席は CPU になり、保存と再現のあとも CPU のまま', () => {
        const game = newMatch();
        game.players[1].isCPU = false;
        let ignored = false;
        definition.onPlayerGone({ game, ignore: () => { ignored = true; } }, { seat: 1, reason: 'left' });
        expect(ignored).toBe(false);
        expect(game.players[1].isCPU).toBe(true);
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(restored.players[1].isCPU).toBe(true);
        definition.onPlayerGone({ game, ignore: () => { ignored = true; } }, { seat: 0, reason: 'disconnected' });
        expect(ignored).toBe(true);
    });

    it('観戦者のビューには、誰のダイスも入らない', () => {
        const view = definition.spectatorView(newMatch(), { since: null });
        expect(view.dice).toBeNull();
    });

    it('設定は決まった値だけを受け付ける', () => {
        expect(() => definition.settings.validate({ airport: 'XXX' }, definition.settings.defaults())).toThrow();
        expect(() => definition.settings.validate({ cpuLevel: 'max' }, definition.settings.defaults())).toThrow();
    });
});
