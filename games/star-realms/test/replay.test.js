import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat, cpuRandom } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { snapshot } from './helpers.js';

const MAX_STEPS = 5000;
const cpuPlayers = (a = 'normal', b = 'normal') => [
    { name: 'A', isCPU: true, cpuLevel: a },
    { name: 'B', isCPU: true, cpuLevel: b }
];

function playOut(seed, a, b, onCommand) {
    const game = new Game(cpuPlayers(a, b), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < MAX_STEPS) {
        const c = runCpuStep(game);
        onCommand?.(game, c);
    }
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const seed of [1, 2, 3]) {
            const game = playOut(seed, 'normal', 'easy');
            expect(game.isOver()).toBe(true);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(7, 'normal', 'normal');
        const saved = game.persist();
        const half = Math.floor(saved.commands.length / 2);
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('再現できない記録はエラーにする', () => {
        const saved = playOut(3, 'easy', 'easy').persist();
        saved.commands[0] = { ...saved.commands[0], playerId: 1 - saved.commands[0].playerId };
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(cpuPlayers(), { seed: 11 });
        const b = new Game(cpuPlayers(), { seed: 11 });
        for (let i = 0; i < 400 && !a.isOver(); i++) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 2; k++) chooseCommand(createGameView(a, seat), 'normal', cpuRandom(a, seat));
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、記録から再現できる', () => {
        const types = ['play', 'playAll', 'buy', 'scrap', 'attack', 'end', 'choose', 'bogus'];
        let r = 4242;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const seed of [1, 2]) {
            const game = new Game(cpuPlayers('easy', 'easy'), { seed });
            for (let i = 0; i < 3000 && !game.isOver(); i++) {
                const id = rand(130) - 5;
                const command = {
                    type: types[rand(types.length)], card: rand(8) ? id : 'explorer', target: rand(3) ? 'player' : id,
                    option: rand(4) - 1, cards: rand(2) ? [id] : [id, rand(120)]
                };
                const before = snapshot(game);
                if (!game.applyCommand(rand(2), command)) expect(snapshot(game)).toBe(before);
                if (rand(3) === 0) runCpuStep(game, nextCpuSeat(game), 'easy');
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});

describe('CPU どうしの試合', () => {
    it('強さとシードを変えても、止まらずに最後まで進む', () => {
        for (const [a, b] of [['easy', 'easy'], ['normal', 'easy'], ['easy', 'normal'], ['normal', 'normal']]) {
            for (let seed = 1; seed <= 12; seed++) {
                const game = playOut(seed, a, b);
                expect(game.isOver(), `${a}/${b} シード${seed}`).toBe(true);
                expect(game.players[1 - game.winner].authority).toBeLessThanOrEqual(0);
            }
        }
    });

    it('ふつうは、やさしいに大きく勝ち越す（席を入れ替えても）', () => {
        let wins = 0;
        for (let seed = 1; seed <= 20; seed++) {
            const normalSeat = seed % 2;
            const game = playOut(seed, normalSeat === 0 ? 'normal' : 'easy', normalSeat === 0 ? 'easy' : 'normal');
            if (game.winner === normalSeat) wins++;
        }
        expect(wins).toBeGreaterThanOrEqual(18);
    });

    it('交易カードのほとんどの種類が、CPU どうしの試合で獲得され、効果が使われる', () => {
        const bought = new Set();
        for (let seed = 1; seed <= 40; seed++) {
            playOut(seed, 'normal', 'easy', (game, c) => {
                if (c?.type === 'buy' && c.card !== 'explorer') bought.add(game.keyOf(c.card));
            });
        }
        expect(bought.size).toBeGreaterThanOrEqual(40);
    });
});
