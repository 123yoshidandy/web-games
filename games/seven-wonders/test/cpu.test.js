import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuRound, chooseCommand, scoreCandidates, LEVELS } from '../public/js/cpu-player.js';
import { setupGame, city, snapshot, players, id } from './helpers.js';

const cpus = n => players(n).map(p => ({ ...p, isCPU: true }));

describe('CPU', () => {
    it('CPU だけの試合が、3〜7 人・強さ・面を変えても最後まで進み、記録から再現できる', () => {
        const levels = ['easy', 'normal', 'strong'];
        for (let n = 3; n <= 7; n++) {
            for (let seed = 1; seed <= 3; seed++) {
                const game = new Game(cpus(n), { seed: seed * 13 + n, sides: ['A', 'B', 'random'][seed % 3] });
                let steps = 0;
                while (!game.isOver()) {
                    expect(runCpuRound(game, seat => levels[(seat + seed) % 3])).toBe(true);
                    if (++steps > 100) throw new Error('終わらない');
                }
                expect(snapshot(Game.replay(cpus(n), game.options, game.commands))).toBe(snapshot(game));
            }
        }
    });

    it('ほかの人の手札をのぞかない（ビューが同じなら、隠れた手札が違っても同じ手）', () => {
        const cities = () => [city('giza'), city('rhodes'), city('alexandria')];
        const a = setupGame({ cities: cities(), hands: [['altar', 'barracks'], ['baths', 'theater'], ['stockade', 'tavern#4']] });
        const b = setupGame({ cities: cities(), hands: [['altar', 'barracks'], ['pawnshop#4', 'loom1'], ['press1', 'workshop']] });
        expect(JSON.stringify(createGameView(a, 0))).toBe(JSON.stringify(createGameView(b, 0)));
        Object.values(LEVELS).forEach(cfg => {
            expect(chooseCommand(createGameView(a, 0), cfg)).toEqual(chooseCommand(createGameView(b, 0), cfg));
        });
    });

    it('候補の手は、どれもルールで通る', () => {
        const game = new Game(cpus(5), { seed: 4 });
        for (let seat = 0; seat < 5; seat++) {
            scoreCandidates(createGameView(game, seat), LEVELS.strong).forEach(({ command }) => {
                expect(game.validate(seat, command), JSON.stringify(command)).toBeNull();
            });
        }
    });

    it('同じ記号の科学を 3 つ目にできるなら、見落としのない CPU はそれを高く見る', () => {
        const game = setupGame({
            cities: [city('giza', 'A', ['apothecary', 'dispensary#3', 'loom1', 'press1']), city('rhodes'), city('alexandria')],
            hands: [['lodge', 'pantheon'], ['altar', 'baths'], ['stockade', 'theater']], age: 3
        });
        game.cities[0].coins = 10;
        const best = chooseCommand(createGameView(game, 0), LEVELS.strong);
        expect(best).toMatchObject({ card: id('lodge'), action: 'build' });
    });
});
