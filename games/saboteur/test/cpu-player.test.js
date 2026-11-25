import { describe, it, expect } from 'vitest';
import Game, { CARDS } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCpuCommand, runCpuStep, suspicions, frontierDistance, targetGoals, PROFILES } from '../public/js/cpu-player.js';
import { key, liveCells, cellEdges } from '../public/js/board.js';
import { DIRS } from '../public/js/cards.js';
import { players, pathCard, actionCard, setup, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

describe('CPU', () => {
    it.each([3, 5, 7, 10])('全員 CPU の%i人戦が、8シードとも最後まで進み、記録から再現できる', (n) => {
        for (let seed = 1; seed <= 8; seed++) {
            const game = new Game(players(n, true), { seed });
            let steps = 0;
            while (!game.isOver() && steps++ < 3000) expect(runCpuStep(game)).toBe(true);
            expect(game.isOver()).toBe(true);
            expect(game.history).toHaveLength(3);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('どの強さでも、通る手を選ぶ', () => {
        Object.values(PROFILES).forEach(profile => {
            const game = new Game(players(5, true), { seed: 5 });
            for (let i = 0; i < 300 && !game.isOver(); i++) {
                const command = chooseCpuCommand(game, game.current, profile);
                expect(game.applyCommand(game.current, command), `${JSON.stringify(command)} ${game.lastError}`).toBe(true);
            }
        });
    });

    it('ほかの人の役割・手札と伏せたゴールの中身をのぞかない', () => {
        const a = new Game(players(5, true), { seed: 8 });
        const b = new Game(players(5, true), { seed: 8 });
        const seat = a.current;
        // 自分以外の役割と手札、山札、ゴールの中身だけを入れ替える
        b.players.forEach(p => { if (p.id !== seat) p.role = p.role === 'digger' ? 'saboteur' : 'digger'; });
        const others = b.players.filter(p => p.id !== seat);
        const first = others[0].hand;
        others[0].hand = others[1].hand;
        others[1].hand = first;
        b.deck.reverse();
        b.goals.forEach(g => { g.card = (g.card + 1) % 3; });
        expect(chooseCpuCommand(a, seat, PROFILES.strong)).toEqual(chooseCpuCommand(b, seat, PROFILES.strong));
    });

    it('金鉱掘りの CPU は、金の場所を知っていれば、届く道を置く', () => {
        const game = new Game(players(4, true), { seed: 3 });
        game.players[0].role = 'digger';
        const straights = CARDS.filter(c => c.kind === 'path' && c.connected && c.shape === '24').map(c => c.id);
        const crosses = CARDS.filter(c => c.kind === 'path' && c.connected && c.shape === '1234').map(c => c.id);
        const line = [...straights, ...crosses].slice(0, 6);
        setup(game, { goalCards: [1, 0, 2], paths: line.map((id, i) => [id, i + 1, 0]), hand: [crosses[4], actionCard('map')] });
        game.players[0].knownGoals = { 1: 'gold' };
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual({ type: 'path', card: crosses[4], x: 7, y: 0, rotated: false });
    });

    it('道具が壊れた CPU は、直すカードがあれば自分を直す', () => {
        const game = new Game(players(4, true), { seed: 3 });
        const repair = actionCard('repair', ['lamp']);
        setup(game, { hand: [repair, pathCard('24')], broken: [['lamp']] });
        expect(chooseCpuCommand(game, 0, PROFILES.strong)).toEqual({ type: 'repair', card: repair, target: 0, tool: 'lamp' });
    });

    it('行き止まりで道をふさいだ人を疑い、道を進めた人を信用する', () => {
        const game = new Game(players(4, true), { seed: 3 });
        game.players[0].role = 'digger';
        setup(game, { hand: [pathCard('24'), pathCard('24', false)], current: 1 });
        game.players[1].hand.push(pathCard('24'));
        game.applyCommand(1, { type: 'path', card: pathCard('24'), x: 1, y: 0, rotated: false });
        game.players[2].hand.push(pathCard('24', false));
        setup(game, { current: 2 });
        game.applyCommand(2, { type: 'path', card: pathCard('24', false), x: 2, y: 0, rotated: false });
        const s = suspicions(createGameView(game, 0));
        expect(s[2]).toBeGreaterThan(s[1]);
        expect(s[1]).toBeLessThan(0);
    });

    it('先端からゴールまでの距離を測れる', () => {
        const game = new Game(players(4, true), { seed: 3 });
        const view = createGameView(game, 0);
        // 先端は (±1, 0) と (0, ±1)。真ん中のゴール (8, 0) まで 7
        expect(frontierDistance(view.board, view.goals, [1])).toBe(7);
        expect(targetGoals(view.goals, { 0: 'stone', 1: 'stone' })).toEqual([2]);
    });

    it('人数で、金鉱掘りとお邪魔者のどちらかが勝ちすぎない', () => {
        const r = runMatches({ games: 10, count: 5 });
        expect(r.finished).toBe(10);
        const rate = r.diggers / r.rounds;
        expect(rate).toBeGreaterThan(0.25);
        expect(rate).toBeLessThan(0.85);
    });
});

describe('ファズ（ランダムな操作）', () => {
    it('ランダムな操作でも、カードの数・道のつながりが保たれ、断った操作で状態が変わらない', () => {
        for (let seed = 1; seed <= 8; seed++) {
            const n = 3 + (seed % 8);
            const game = new Game(players(n), { seed });
            let x = seed * 7919;
            const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
            const pick = (list) => list[Math.floor(rand() * list.length)];
            let lastRound = game.round;
            let playedThisRound = 0;
            for (let step = 0; step < 1500 && !game.isOver(); step++) {
                const seat = rand() < 0.9 ? game.current : Math.floor(rand() * n);
                const hand = game.players[seat].hand;
                const card = rand() < 0.9 ? pick(hand) : Math.floor(rand() * 80);
                const type = pick(['path', 'path', 'break', 'repair', 'map', 'rockfall', 'discard']);
                const command = { type, card, x: Math.floor(rand() * 6) - 1, y: Math.floor(rand() * 5) - 2, rotated: rand() < 0.5, target: Math.floor(rand() * n), tool: pick(['pick', 'lamp', 'cart']), goal: Math.floor(rand() * 4) };
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) {
                    expect(snapshot(game)).toBe(before);
                    if (rand() < 0.5) runCpuStep(game);
                } else {
                    playedThisRound++;
                }
                if (game.round !== lastRound) {
                    lastRound = game.round;
                    playedThisRound = 0;
                }
                // 置かれた道は、どれもまわりの辺と合っている
                Object.entries(game.board).forEach(([k, cell]) => {
                    if (cell.type !== 'path') return;
                    const [cx, cy] = k.split(',').map(Number);
                    const edges = cellEdges(cell, game.goals);
                    DIRS.forEach(([dx, dy], d) => {
                        const other = game.board[key(cx + dx, cy + dy)];
                        if (!other) return;
                        const oe = cellEdges(other, game.goals);
                        if (oe && other.type !== 'goal') expect(oe[(d + 2) % 4]).toBe(edges[d]);
                    });
                });
                expect(liveCells(game.board, game.goals).has('0,0')).toBe(true);
                const held = game.players.reduce((s, p) => s + p.hand.length, 0);
                expect(held + game.deck.length).toBeLessThanOrEqual(67);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
