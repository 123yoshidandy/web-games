import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCpuCommand, isCpuTurn, simpleCommands } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';
import { players, snapshot, pick } from './helpers.js';

function playAll(game, limit = 20000) {
    let steps = 0;
    while (!game.isOver() && steps++ < limit) {
        const before = game.commands.length;
        runCpuStep(game, game.current);
        if (game.commands.length === before) break;
    }
    return game;
}

describe('CPU', () => {
    it('CPU だけの試合が、人数とシードを変えても最後まで進む', () => {
        for (let n = 2; n <= 4; n++) {
            for (let seed = 1; seed <= 12; seed++) {
                const level = seed % 2 ? 'easy' : 'normal';
                const game = playAll(new Game(players(n, true).map(p => ({ ...p, cpuLevel: level })), { seed }));
                expect(game.isOver(), `${n}人・シード${seed}`).toBe(true);
                expect(game.winners.length).toBe(1);
                if (game.endReason === 'target') expect(Math.max(...game.players.map(p => p.score))).toBeGreaterThanOrEqual(game.target);
            }
        }
    });

    it('同じ場面では同じ手を選び、記録から同じ試合を再現できる', () => {
        const a = playAll(new Game(players(3, true), { seed: 21 }));
        const b = playAll(new Game(players(3, true), { seed: 21 }));
        expect(snapshot(a)).toBe(snapshot(b));
        const saved = a.persist();
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(a));
    });

    it('人がいるときは、ラウンドの結果を CPU が進めない', () => {
        const game = new Game(players(2), { seed: 2 });
        game.phase = 'roundEnd';
        expect(isCpuTurn(game)).toBe(false);
        game.players[0].isCPU = true;
        expect(isCpuTurn(game)).toBe(true);
    });

    it('出せる2枚組は出し、7点以上で決めた点に届けばラウンドを終える', () => {
        const game = new Game(players(2, true), { seed: 4, startPlayer: 0 });
        game.phase = 'play';
        // 貝4枚とカニ2枚：カニの組を出してから、ストップかラストチャンス
        const hand = pick('shell', 'shell', 'shell', 'shell', 'crab', 'crab');
        game.players[0].hand = hand;
        game.deck = game.deck.filter(id => !hand.includes(id));
        game.discards = game.discards.map(p => p.filter(id => !hand.includes(id)));
        expect(chooseCpuCommand(game, 0)).toMatchObject({ type: 'duo', cards: hand.slice(4) });
        game.applyCommand(0, chooseCpuCommand(game, 0));
        if (game.phase === 'crab') {
            while (game.phase === 'crab') game.applyCommand(0, chooseCpuCommand(game, 0));
        }
        game.players[0].cpuLevel = 'strong';
        const call = chooseCpuCommand(game, 0);
        expect(['stop', 'lastChance', 'endTurn']).toContain(call.type);
    });

    it('ランダムな操作で長く回しても、カードの枚数が変わらない（ファズ）', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const random = createRandom(seed);
            const game = new Game(players(2 + (seed % 3)), { seed });
            for (let i = 0; i < 600 && !game.isOver(); i++) {
                const seat = game.phase === 'roundEnd' ? 0 : game.current;
                const options = [...simpleCommands(game, seat), { type: 'duo', cards: game.players[seat].hand.slice(0, 2) }];
                const command = options[Math.floor(random() * options.length)];
                if (!game.applyCommand(seat, command)) runCpuStep(game, seat);
                const total = game.deck.length + game.drawn.length + game.discards.flat().length
                    + game.players.reduce((s, p) => s + p.hand.length + p.duos.flat().length, 0);
                expect(total).toBe(58);
            }
        }
    });
});
