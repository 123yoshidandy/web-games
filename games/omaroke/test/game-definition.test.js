import { describe, it, expect } from 'vitest';
import definition, { sanitize } from '../server/src/game-definition.js';
import { createRandom } from '../public/js/random.js';
import { chooseCommand } from '../public/js/cpu-player.js';
import { snapshot } from './helpers.js';

const players = [{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C' }, { name: 'D', isCPU: true }, { name: 'E', isCPU: true }];

function newMatch(patch = {}) {
    const settings = definition.settings.validate(patch, definition.settings.defaults());
    return definition.create({ players, settings, random: createRandom(9) });
}

function act(game, seat, command) {
    let rejected = null;
    definition.actions.command.handle({ game, seat, message: { command }, reject: reason => { rejected = reason; } });
    return rejected;
}

describe('オンライン対戦用のゲームの定義', () => {
    it('人間の操作（ビューから決めた手）と CPU の手で最後まで進み、保存した記録から同じ状態に戻せる', () => {
        for (const mode of ['basic', 'expert']) {
            const game = newMatch({ mode });
            let steps = 0;
            while (!definition.isOver(game)) {
                while (definition.cpu.needsStep(game)) expect(definition.cpu.step(game)).toBe(true);
                if (definition.isOver(game)) break;
                const seat = game.actors()[0];
                const view = definition.view(game, seat, { since: 0 });
                // 端末からは余計な項目が付いて届くこともある
                expect(act(game, seat, { ...chooseCommand(view, 'easy'), extra: 'x' })).toBeNull();
                if (++steps > 3000) throw new Error('終わらない');
            }
            const restored = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
            expect(snapshot(restored)).toBe(snapshot(game));
            expect(game.commands.every(c => !('extra' in c.command))).toBe(true);
        }
    });

    it('断る操作は理由を返し、状態を変えない', () => {
        const game = newMatch();
        const before = snapshot(game);
        expect(act(game, 0, { type: 'play', card: 0 })).toBeTruthy();
        expect(act(game, 0, { type: 'choose', picks: ['mew'] })).toBeTruthy();
        expect(act(game, 0, null)).toBeTruthy();
        expect(act(game, 0, { type: 'hack' })).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });

    it('操作は、種類ごとに決まった項目だけを取り出す', () => {
        expect(sanitize({ type: 'respond', choice: 'take', card: 3, seat: 1 })).toEqual({ type: 'respond', choice: 'take' });
        expect(sanitize({ type: 'end', evolve: 1, extra: true })).toEqual({ type: 'end', evolve: 1 });
        expect(sanitize({ type: '__proto__' })).toBeNull();
    });

    it('観戦者のビューには、誰の手札も、隠れた役割も、選ぶ前のポケモンも入らない', () => {
        const game = newMatch();
        const view = definition.spectatorView(game, { since: 0 });
        expect(view.hand).toBeNull();
        expect(view.offers).toBeNull();
        expect(view.players.filter(p => p.role !== null).map(p => p.role)).toEqual(['leader']);
        game.players.forEach(p => p.offers.forEach(id => expect(JSON.stringify(view)).not.toContain(`"${id}"`)));
    });

    it('設定は決まった値だけを受け付ける', () => {
        expect(() => definition.settings.validate({ mode: 'hard' }, definition.settings.defaults())).toThrow();
        expect(() => definition.settings.validate({ level: 'strong' }, definition.settings.defaults())).toThrow();
    });
});
