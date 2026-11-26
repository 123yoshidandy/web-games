import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, truthChance, honesty, saysTrueRate, danger, isCpuTurn, unseenCounts } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { playMatch, runMatches, MAX_STEPS } from '../scripts/cpu-match.mjs';
import { setHand } from './helpers.js';
import { createRandom } from '../public/js/random.js';

const cpuGame = (n, seed = 1) => new Game([{ name: 'A' }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: `C${i}`, isCPU: true, cpuLevel: 'normal' }))], { seed, startPlayer: 0 });
const fixed = (x) => () => x;

describe('CPU どうしの試合', () => {
    it('人数・強さ・シードを変えても、止まらずに最後まで進む', () => {
        for (let count = 2; count <= 6; count++) {
            for (const mix of [['normal'], ['easy'], ['easy', 'normal']]) {
                const levels = Array.from({ length: count }, (_, i) => mix[i % mix.length]);
                for (let seed = 1; seed <= 20; seed++) {
                    const game = playMatch({ count, levels, seed });
                    expect(game.isOver(), `${count}人 ${levels} seed ${seed}`).toBe(true);
                    expect(game.commands.length).toBeLessThan(MAX_STEPS);
                }
            }
        }
    });

    it('ふつうは、やさしいより負けにくい', () => {
        const r = runMatches({ games: 200, count: 2, levels: ['easy', 'normal'] });
        expect(r.stuck).toBe(0);
        expect(r.losses[0]).toBeGreaterThan(120);
        const three = runMatches({ games: 150, count: 3, levels: ['easy', 'normal', 'easy'] });
        expect(three.losses[1]).toBeLessThan(three.losses[0]);
        expect(three.losses[1]).toBeLessThan(three.losses[2]);
    });
});

describe('CPU の見込み', () => {
    it('8枚とも見えている虫を言われたら、必ず「うそ」と答える', () => {
        const game = cpuGame(3);
        setHand(game, 0, ['spider']);
        game.applyCommand(0, { type: 'give', card: 'spider', target: 1, claim: 'frog' });
        // 席1の手札と、全員の前で、カエルが8枚とも見えている
        const view = createGameView(game, 1);
        const frogs = view.players.flatMap(p => p.table).filter(k => k === 'frog').length + view.players[1].hand.filter(k => k === 'frog').length;
        game.players[2].table.push(...Array(8 - frogs).fill('frog'));
        expect(unseenCounts(createGameView(game, 1)).frog).toBe(0);
        expect(truthChance(createGameView(game, 1))).toBe(0);
        expect(chooseCommand(createGameView(game, 1), 'normal', fixed(0.5))).toMatchObject({ type: 'answer', truth: false });
    });

    it('嘘の多い人の言うことは、本当の見込みを下げる', () => {
        const game = cpuGame(3);
        game.applyCommand(0, { type: 'give', card: game.players[0].hand[0], target: 1, claim: 'bat' });
        const view = createGameView(game, 1);
        const base = truthChance(view);
        view.history = Array.from({ length: 6 }, () => ({ card: 'rat', chain: [{ from: 0, to: 2, claim: 'fly' }], answerer: 2, said: true, correct: false, taker: 2 }));
        expect(honesty(view, 0)).toBeLessThan(0.3);
        expect(truthChance(view)).toBeLessThan(base);
        view.history.forEach(h => { h.chain[0].claim = 'rat'; });
        expect(truthChance(view)).toBeGreaterThan(base);
    });

    it('「本当」と答えやすい人には、嘘で渡しやすい', () => {
        const game = cpuGame(2);
        game.current = 1;
        const view = createGameView(game, 1);
        view.history = Array.from({ length: 10 }, () => ({ card: 'rat', chain: [{ from: 1, to: 0, claim: 'rat' }], answerer: 0, said: true, correct: true, taker: 1 }));
        expect(saysTrueRate(view, 0)).toBeGreaterThan(0.8);
        let lies = 0;
        const random = createRandom(1);
        for (let i = 0; i < 200; i++) {
            const c = chooseCommand(view, 'normal', random);
            if (c.claim !== c.card) lies++;
        }
        expect(lies).toBeGreaterThan(120);
    });

    it('負けに近い虫を、その人に渡す', () => {
        const game = cpuGame(3);
        game.current = 1;
        setHand(game, 1, ['spider', 'frog', 'rat']);
        game.players[2].table = ['spider', 'spider', 'spider'];
        const view = createGameView(game, 1);
        expect(danger(view, 2, 'spider')).toBe(100);
        expect(chooseCommand(view, 'normal', fixed(0.5))).toMatchObject({ type: 'give', card: 'spider', target: 2 });
    });

    it('外れると負ける場面では、回せるなら見てから回す', () => {
        const game = cpuGame(4);
        game.players[1].table = KIND_ORDER_THREE();
        game.applyCommand(0, { type: 'give', card: game.players[0].hand[0], target: 1, claim: 'bat' });
        expect(chooseCommand(createGameView(game, 1), 'normal', fixed(0.5))).toEqual({ type: 'peek' });
    });

    it('見たカードは、負けに近い人に回す', () => {
        const game = cpuGame(4);
        setHand(game, 0, ['spider']);
        game.players[3].table = ['spider', 'spider', 'spider'];
        game.applyCommand(0, { type: 'give', card: 'spider', target: 1, claim: 'spider' });
        game.applyCommand(1, { type: 'peek' });
        expect(chooseCommand(createGameView(game, 1), 'normal', fixed(0.5))).toMatchObject({ type: 'pass', target: 3 });
    });

    it('人だけを待っているときは CPU は動かない', () => {
        const game = cpuGame(3);
        expect(isCpuTurn(game)).toBe(false);
        game.applyCommand(0, { type: 'give', card: game.players[0].hand[0], target: 1, claim: 'bat' });
        expect(isCpuTurn(game)).toBe(true);
    });
});

// どの虫も3枚ずつ（何を引き取っても負ける）
function KIND_ORDER_THREE() {
    return ['cockroach', 'rat', 'bat', 'fly', 'frog', 'scorpion', 'stinkbug', 'spider'].flatMap(k => [k, k, k]);
}
