import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers.js';
import { suggest } from '../public/js/cpu-player.js';

const state = (game) => JSON.stringify(game.persist()) + JSON.stringify(game.s);

describe('ヒント（おすすめの手）', () => {
    it.each([1, 2, 3])('全員がおすすめの手だけを打っても、手が通って最後まで進む（シード %i）', (seed) => {
        const game = makeGame(2, { seed });
        let steps = 0;
        while (!game.isOver() && steps++ < 4000) {
            const seat = game.actors()[0];
            const before = state(game);
            const command = suggest(game, seat);
            expect(state(game)).toBe(before); // 求めるだけでは状態を変えない
            expect(command).toBeTruthy();
            expect(game.applyCommand(seat, command), game.lastError).toBe(true);
        }
        expect(game.isOver()).toBe(true);
    });

    it('操作を待っていない席には出さない', () => {
        const game = makeGame(2);
        game.applyCommand(0, { type: 'growth', option: 0 });
        game.applyCommand(0, { type: 'deck', deck: 'minor' });
        game.applyCommand(0, { type: 'pick', card: game.s.spirits[0].prompt.cards[0] });
        game.applyCommand(0, { type: 'play', cards: [] });
        expect(game.actors()).toEqual([1]);
        expect(suggest(game, 0)).toBe(null);
        expect(suggest(game, 1)).toBeTruthy();
    });

    it('荒らされる土地の侵略者を減らす力を勧める', () => {
        const game = makeGame(1);
        const s = game.s;
        s.lands.forEach(L => { L.inv = []; L.dahan = []; });
        const a2 = s.lands.find(L => L.board === 0 && L.num === 2);
        a2.inv = [{ k: 'T', hp: 2 }];
        s.invader.ravage = '1W';
        s.phase = 'fast';
        Object.assign(s.spirits[0], { step: 'ready', played: ['flash'], used: [], done: false });
        expect(suggest(game, 0)).toEqual({ type: 'power', power: 'c:flash', land: a2.id });
    });
});
