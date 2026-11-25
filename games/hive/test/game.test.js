import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';

const players = () => [{ name: 'あなた' }, { name: 'CPU', isCPU: true }];
const snapshot = (g) => JSON.stringify({ state: g.state, commands: g.commands });

describe('ゲームの進行', () => {
    it('先手（白）はシードで決まり、どちらにもなりうる', () => {
        const firsts = new Set();
        for (let seed = 1; seed <= 20; seed++) {
            const g = new Game(players(), { seed });
            firsts.add(g.first);
            expect(g.current).toBe(g.first);
            expect(g.players[g.first].color).toBe(0);
        }
        expect(firsts.size).toBe(2);
    });

    it('設定：拡張の駒とトーナメントルール（既定はオン）', () => {
        const g = new Game(players(), { seed: 1, expansions: ['P', 'X', 'L'] });
        expect(g.options).toEqual({ seed: 1, expansions: ['L', 'P'], tournament: true });
        expect(g.state.hands[0].P).toBe(1);
        expect(g.state.hands[0].M).toBeUndefined();
    });

    it('通らない操作は理由を返し、状態を変えない', () => {
        const g = new Game(players(), { seed: 2 });
        const s = g.current;
        const before = snapshot(g);
        expect(g.applyCommand(s, { type: 'place', kind: 'Q', to: '0,0' })).toBe(false);
        expect(g.lastError).toBe('最初の手には、女王蜂を置けません');
        expect(g.applyCommand(s, { type: 'place', kind: 'A', to: '3,3' })).toBe(false);
        expect(g.lastError).toBe('そこには置けません');
        expect(g.applyCommand(1 - s, { type: 'place', kind: 'A', to: '0,0' })).toBe(false);
        expect(g.applyCommand(s, { type: 'pass' })).toBe(false);
        expect(g.applyCommand(s, { type: 'fly' })).toBe(false);
        expect(g.applyCommand(s, null)).toBe(false);
        expect(snapshot(g)).toBe(before);
    });

    it('女王蜂を置く前に動かそうとすると、その理由を返す', () => {
        const g = new Game(players(), { seed: 3 });
        g.applyCommand(g.current, { type: 'place', kind: 'A', to: '0,0' });
        g.applyCommand(g.current, { type: 'place', kind: 'A', to: '1,0' });
        expect(g.applyCommand(g.current, { type: 'move', from: '0,0', to: '1,-1' })).toBe(false);
        expect(g.lastError).toBe('女王蜂を置くまでは、駒を動かせません');
    });

    it('記録する項目だけを残し、同じゲームを作り直せる', () => {
        const g = new Game(players(), { seed: 4, expansions: ['M'] });
        let n = 0;
        while (!g.isOver() && n < 40) {
            const actions = g.legalActions();
            const a = actions[(n * 7) % actions.length];
            expect(g.applyCommand(g.current, { ...a, extra: 'x' })).toBe(true);
            n++;
        }
        expect(Object.keys(g.commands[0].command)).not.toContain('extra');
        const saved = JSON.parse(JSON.stringify(g.persist()));
        const r = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(r)).toBe(snapshot(g));
    });
});

describe('見え方', () => {
    it('手番の人には通る手の一覧が付く。ほかの人・観戦者には付かない', () => {
        const g = new Game(players(), { seed: 5 });
        const me = g.current;
        expect(createGameView(g, me).actions.length).toBeGreaterThan(0);
        expect(createGameView(g, 1 - me).actions).toEqual([]);
        expect(createGameView(g, null).actions).toEqual([]);
    });

    it('盤と手持ちが見え、ビューを書き換えてもゲームは変わらない', () => {
        const g = new Game(players(), { seed: 6 });
        g.applyCommand(g.current, { type: 'place', kind: 'G', to: '0,0' });
        const view = createGameView(g, 0);
        expect(view.board['0,0'][0].kind).toBe('G');
        view.board['0,0'][0].kind = 'Q';
        expect(g.state.board['0,0'][0].kind).toBe('G');
        const placer = view.players.find(p => p.color === 0);
        expect(placer.hand.G).toBe(2);
    });

    it('since より後の出来事だけを返す', () => {
        const g = new Game(players(), { seed: 7 });
        g.applyCommand(g.current, { type: 'place', kind: 'G', to: '0,0' });
        g.applyCommand(g.current, { type: 'place', kind: 'G', to: '1,0' });
        expect(createGameView(g, 0, { since: 1 }).events.map(e => e.seq)).toEqual([2]);
    });
});
