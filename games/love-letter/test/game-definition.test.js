import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { snapshot } from './helpers.js';

const players = [{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C' }];

function newMatch() {
    const settings = definition.settings.validate({}, definition.settings.defaults());
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
            if (definition.cpu.needsStep(game)) {
                expect(definition.cpu.step(game)).toBe(true);
            } else {
                const view = definition.view(game, game.current, { since: null });
                let command;
                if (view.phase === 'chancellor') {
                    const [card, ...bottom] = view.hand;
                    command = { type: 'keep', card, bottom };
                } else {
                    const l = view.legal.find(x => x.card !== 9) ?? view.legal[0];
                    command = { type: 'play', card: l.card, target: l.targets[0] ?? null, guess: l.needsGuess ? 5 : null, extra: 1 };
                }
                expect(act(game, game.current, command)).toBeNull();
            }
            if (++steps > 5000) throw new Error('終わらない');
        }
        const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(snapshot(restored)).toBe(snapshot(game));
    });

    it('断る操作は理由を返し、状態を変えない', () => {
        const game = newMatch();
        while (definition.cpu.needsStep(game)) definition.cpu.step(game);
        const before = snapshot(game);
        const other = (game.current + 1) % 3;
        expect(act(game, other, { type: 'play', card: 1 })).toMatch(/手番/);
        expect(act(game, game.current, { type: 'play', card: 99 })).toBeTruthy();
        expect(act(game, game.current, null)).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('観戦者のビューには、誰の手札も、引いたカードも入らない', () => {
        const game = newMatch();
        const view = definition.spectatorView(game, { since: null });
        expect(view.hand).toBeNull();
        expect(view.legal).toBeNull();
        expect(view.events.some(e => e.secret)).toBe(false);
        expect(view.players.every(p => p.known === null)).toBe(true);
    });
});
