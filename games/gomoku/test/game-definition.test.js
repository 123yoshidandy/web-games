import { describe, it, expect } from 'vitest';
import definition from '../server/src/game-definition.js';
import { blackSeatOf } from '../public/js/game.js';
import { at, mv } from './helpers.js';

const players = [{ id: 'a', name: 'A', isCPU: false }, { id: 'b', name: 'B', isCPU: false }];

describe('オンラインの定義（game-definition）', () => {
    it('ロビーの設定：盤は15路か10路、持ち時間は決まった名前だけ', () => {
        expect(definition.settings.defaults()).toEqual({ size: '15', clock: 'none' });
        expect(definition.settings.validate({ size: '10', clock: '3m+2s' }, {})).toEqual({ size: '10', clock: '3m+2s' });
        expect(definition.settings.validate({ size: '19', clock: 'x' }, { size: '10', clock: '5m' })).toEqual({ size: '10', clock: '5m' });
        expect(definition.perfectInformation).toBe(true);
    });

    it('黒の席はサーバーの乱数で決まり、記録から同じ席に戻る', () => {
        const seats = new Set();
        for (const r of [0.1, 0.4, 0.6, 0.9]) {
            const game = definition.create({ players, settings: { size: '10', clock: 'none' }, random: () => r, now: 0 });
            expect(game.size).toBe(10);
            expect(game.blackSeat).toBe(blackSeatOf(game.options.seed));
            seats.add(game.blackSeat);
            const again = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
            expect(again.blackSeat).toBe(game.blackSeat);
        }
        expect(seats.size).toBe(2);
    });

    it('ビューにシードを入れない', () => {
        const game = definition.create({ players, settings: {}, random: () => 0.3, now: 0 });
        const view = definition.view(game, 0, { since: null });
        expect(JSON.stringify(view)).not.toMatch(/seed/i);
        expect(definition.spectatorView(game, {}).you).toBe(null);
    });

    it('結果：勝った席か、引き分け', () => {
        const game = definition.create({ players, settings: {}, random: () => 0.3, now: 0 });
        expect(definition.result(game)).toBe(null);
        game.applyCommand(game.current, { type: 'resign' });
        expect(definition.result(game)).toEqual({ winners: [game.winner] });
        const draw = definition.create({ players, settings: {}, random: () => 0.3, now: 0 });
        draw.phase = 'end';
        draw.result = { winner: null, reason: 'draw' };
        expect(definition.result(draw)).toEqual({ draw: true });
    });

    it('抜けた人の席は CPU が引き継ぎ、保存して読み直しても CPU のまま', () => {
        const game = definition.create({ players, settings: {}, random: () => 0.3, now: 0 });
        let ignored = false;
        const seat = 1 - game.current;
        definition.onPlayerGone({ game, ignore: () => { ignored = true; } }, { seat, reason: 'left' });
        expect(ignored).toBe(false);
        expect(game.players[seat]).toMatchObject({ isCPU: true, cpuLevel: 'normal' });
        game.applyCommand(game.current, mv(at(15, 7, 7)));
        const again = definition.restore(JSON.parse(JSON.stringify(definition.persist(game))));
        expect(again.players[seat].isCPU).toBe(true);
        expect(definition.cpu.needsStep(again)).toBe(true);
        expect(definition.cpu.step(again, { now: 1000 })).toBe(true);
        expect(again.moveNumber).toBe(2);
        // 切断は待つ
        let waited = false;
        definition.onPlayerGone({ game, ignore: () => { waited = true; } }, { seat: 1 - seat, reason: 'disconnected' });
        expect(waited).toBe(true);
    });

    it('操作は決まった項目だけを記録し、正しくない操作は断る', () => {
        const game = definition.create({ players, settings: {}, random: () => 0.3, now: 0 });
        let rejected = null;
        const ctx = (seat, command) => ({ game, seat, message: { command }, reject: (m) => { rejected = m; }, now: () => 100 });
        definition.actions.command(ctx(1 - game.current, mv(0)));
        expect(rejected).toBe('今はあなたの番ではありません');
        rejected = null;
        definition.actions.command(ctx(game.current, { type: 'move', sq: 5, extra: 'x' }));
        expect(rejected).toBe(null);
        expect(game.commands[0].command).toEqual({ type: 'move', sq: 5 });
        definition.actions.command(ctx(game.current, { type: 'hack' }));
        expect(rejected).toBe('今はその操作はできません');
    });
});
