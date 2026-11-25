import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { PLANTS, STEP3, TOKENS, RESOURCES } from '../public/js/data.js';
import { canStore, citiesOf } from '../public/js/rules.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

// 発電所は山・市場・持ち主・除いたもののどこかに1枚ずつ。資源の総数は変わらない。お金は負にならない
function checkInvariants(game) {
    const owned = game.players.flatMap(p => p.plants);
    const all = [...game.deck, ...game.market, ...owned].filter(n => n !== STEP3);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeLessThanOrEqual(PLANTS.length);
    RESOURCES.forEach(t => {
        const held = game.players.reduce((s, p) => s + p.res[t], 0);
        expect(game.resources[t] + held).toBeLessThanOrEqual(TOKENS[t]);
    });
    game.players.forEach(p => {
        expect(p.money).toBeGreaterThanOrEqual(0);
        // 買ったあと手放すまでの間だけ、持てる数を1つ超える
        expect(p.plants.length).toBeLessThanOrEqual(game.setup.maxPlants + (game.auction?.discard === p.id ? 1 : 0));
        expect(canStore(p.plants, p.res)).toBe(true);
    });
    Object.values(game.houses).forEach(list => {
        expect(new Set(list).size).toBe(list.length);
        expect(list.length).toBeLessThanOrEqual(game.step);
    });
}

export function playOut(n, seed, levels = ['normal', 'easy'], map = 'germany') {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed, map });
    let steps = 0;
    while (!game.isOver() && steps++ < 20000) {
        expect(runCpuStep(game)).toBe(true);
        checkInvariants(game);
    }
    return game;
}

describe('CPU どうしの試合と記録からの再現', () => {
    it('2〜6人・ドイツとアメリカ・いろいろなシードで、CPU どうしの試合が最後まで進み、記録から同じ状態を作り直せる', () => {
        for (const map of ['germany', 'usa']) {
            for (const n of [2, 3, 4, 5, 6]) {
                for (const seed of [1, 2]) {
                    const game = playOut(n, seed + n, seed % 2 ? ['normal', 'easy'] : ['easy', 'normal'], map);
                    expect(game.isOver()).toBe(true);
                    expect(Math.max(...game.players.map(p => citiesOf(game, p.id).length))).toBeGreaterThanOrEqual(game.setup.end);
                    const saved = JSON.parse(JSON.stringify(game.persist()));
                    expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
                }
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(4, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('段階2と段階3まで進み、操作の種類がひととおり使われる', () => {
        const kinds = new Set();
        let step3 = 0;
        for (let seed = 1; seed <= 8; seed++) {
            const game = playOut(4, seed);
            game.commands.forEach(({ command }) => kinds.add(command.type));
            if (game.step === 3) step3++;
        }
        expect(step3).toBeGreaterThan(4);
        ['choose', 'skip', 'bid', 'pass', 'discard', 'buy', 'build', 'done'].forEach(k => expect(kinds.has(k), k).toBe(true));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、数が保たれ、記録から再現できる', () => {
        let r = 99;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % k; };
        const cities = ['essen', 'duisburg', 'muenchen', 'kiel', 'berlin', 'nowhere', 'koeln', 'flensburg'];
        const randomCommand = (game) => {
            const market = game.market;
            switch (rand(9)) {
                case 0: { const p = market[rand(market.length)] ?? 3; return { type: 'choose', plant: p, bid: p + rand(4) - 1 }; }
                case 1: return { type: 'skip' };
                case 2: return { type: 'bid', amount: (game.auction?.current?.high ?? 0) + rand(4) - 1 };
                case 3: return { type: 'pass' };
                case 4: return { type: 'discard', plant: rand(50) };
                case 5: return { type: 'buy', coal: rand(3), oil: rand(2), garbage: rand(2), uranium: rand(2) - (rand(5) ? 0 : 1) };
                case 6: return { type: 'build', city: cities[rand(cities.length)] };
                case 7: return { type: 'done' };
                default: return rand(2) ? null : { type: 'build', city: 5 };
            }
        };
        for (const n of [2, 4, 6]) {
            const game = new Game(players(n, true), { seed: n * 17 });
            let accepted = 0;
            for (let i = 0; i < 6000 && !game.isOver(); i++) {
                const seat = rand(3) ? (game.actors()[0] ?? 0) : rand(n + 1);
                const before = snapshot(game);
                if (game.applyCommand(seat, randomCommand(game))) accepted++;
                else expect(snapshot(game)).toBe(before);
                checkInvariants(game);
                if (rand(3) === 0) runCpuStep(game);
            }
            expect(accepted).toBeGreaterThan(30);
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
