import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { setupGame, city, snapshot, players, id } from './helpers.js';

const discard = card => ({ type: 'play', card, action: 'discard' });
const build = (card, pay = { left: 0, right: 0 }, free) => ({ type: 'play', card, action: 'build', pay, free });

describe('準備', () => {
    it('3〜7 人に不思議を 1 つずつ、コイン 3、手札 7 枚', () => {
        for (let n = 3; n <= 7; n++) {
            const game = new Game(players(n), { seed: n });
            expect(new Set(game.cities.map(c => c.wonder)).size).toBe(n);
            game.cities.forEach(c => expect(c.coins).toBe(3));
            game.hands.forEach(h => expect(h).toHaveLength(7));
        }
    });

    it('面は A・B・ランダムを選べる', () => {
        expect(new Game(players(3), { seed: 1, sides: 'B' }).cities.every(c => c.side === 'B')).toBe(true);
        const sides = new Set(new Game(players(7), { seed: 2, sides: 'random' }).cities.map(c => c.side));
        expect(sides.size).toBe(2);
    });
});

describe('同時に選んで公開する', () => {
    it('全員が選ぶまで公開しない。選んだ中身は本人にしか見えない', () => {
        const game = setupGame({ cities: [city('giza'), city('rhodes'), city('alexandria')], hands: [['altar', 'theater'], ['altar#5', 'baths'], ['pawnshop#4', 'theater#6']] });
        expect(game.applyCommand(0, build(id('altar')))).toBe(true);
        expect(game.cities[0].built).toEqual([]);
        expect(createGameView(game, 0).myChoice.card).toBe(id('altar'));
        expect(createGameView(game, 1).myChoice).toBeNull();
        expect(JSON.stringify(createGameView(game, 1))).not.toContain('altar#3');
        expect(createGameView(game, 1).players[0].ready).toBe(true);
        expect(game.applyCommand(0, discard(id('theater')))).toBe(false);
        game.applyCommand(1, discard('baths#3'));
        game.applyCommand(2, build('pawnshop#4'));
        expect(game.cities[0].built).toEqual([id('altar')]);
        expect(game.cities[1].coins).toBe(6);
        expect(game.turn).toBe(2);
    });

    it('第1時代は左へ、第2時代は右へ手札を渡す', () => {
        const hands = [['altar', 'theater'], ['baths', 'stockade'], ['barracks', 'guardTower']];
        const game = setupGame({ cities: [city('giza'), city('rhodes'), city('alexandria')], hands });
        [0, 1, 2].forEach(s => game.applyCommand(s, discard(game.hands[s][0])));
        // 席 0 の手札（劇場）は左隣（席 2）へ
        expect(game.hands[2]).toEqual([id('theater')]);
        const game2 = setupGame({ cities: [city('giza'), city('rhodes'), city('alexandria')], hands, age: 2 });
        [0, 1, 2].forEach(s => game2.applyCommand(s, discard(game2.hands[s][0])));
        expect(game2.hands[1]).toEqual([id('theater')]);
    });

    it('隣に払ったコインは、手番の終わりに隣が受け取る', () => {
        const game = setupGame({ cities: [city('giza'), city('rhodes'), city('alexandria')], hands: [['barracks', 'altar'], ['altar', 'theater'], ['theater', 'baths']] });
        // 兵舎（鉱石）。鉱石は右隣（ロードス）から 2 コイン
        expect(game.applyCommand(0, build(id('barracks'), { left: 0, right: 2 }))).toBe(true);
        game.applyCommand(1, discard(id('altar')));
        game.applyCommand(2, discard(id('theater')));
        expect(game.cities[0].coins).toBe(1);
        expect(game.cities[1].coins).toBe(3 + 3 + 2);
    });

    it('払い方の候補にない払い方・同じ建物・お金の足りない建設は断り、状態を変えない', () => {
        const game = setupGame({ cities: [city('giza', 'A', ['altar']), city('rhodes'), city('alexandria')], hands: [['barracks', 'altar#5', 'treeFarm#6'], ['altar', 'theater'], ['theater', 'baths']] });
        game.cities[0].coins = 0;
        const before = snapshot(game);
        expect(game.applyCommand(0, build(id('barracks'), { left: 0, right: 1 }))).toBe(false);
        expect(game.applyCommand(0, build('altar#5'))).toBe(false);
        expect(game.applyCommand(0, build('treeFarm#6'))).toBe(false);
        expect(game.applyCommand(0, build('palace#3'))).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: id('barracks'), action: 'fly' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('ぶどう園は、同じ手番に隣が建てた茶色のカードも数える（ルールの説明どおり）', () => {
        const game = setupGame({ cities: [city('giza'), city('rhodes'), city('alexandria')], hands: [['vineyard', 'altar'], ['lumberYard', 'altar'], ['stonePit', 'altar']], age: 2 });
        game.applyCommand(0, build(id('vineyard')));
        game.applyCommand(1, build(id('lumberYard')));
        game.applyCommand(2, build(id('stonePit')));
        // 両隣が今建てた茶色 2 枚 → 2 コイン
        expect(game.cities[0].coins).toBe(3 + 2);
    });

    it('連鎖：前の時代の建物があれば無料で建てる', () => {
        const game = setupGame({ cities: [city('giza', 'A', ['baths']), city('rhodes'), city('alexandria')], hands: [['aqueduct', 'temple'], ['sawmill', 'quarry'], ['brickyard', 'foundry']], age: 2 });
        game.cities[0].coins = 0;
        expect(game.buildOptions(0, id('aqueduct')).free).toBe('chain');
        game.applyCommand(0, build(id('aqueduct'), { left: 0, right: 0 }, 'chain'));
        game.applyCommand(1, discard(id('sawmill')));
        game.applyCommand(2, discard(id('brickyard')));
        expect(game.cities[0].built).toContain(id('aqueduct'));
    });

    it('不思議の段階を建てると、使ったカードは伏せて、段階の効果を得る（エフェソス A の 2 段目：9 コイン）', () => {
        const game = setupGame({ cities: [city('ephesos', 'A', ['lumberYard', 'timberYard'], { stages: 1 }), city('rhodes'), city('alexandria')], hands: [['altar', 'theater'], ['altar', 'theater'], ['altar', 'theater']] });
        expect(game.applyCommand(0, { type: 'play', card: id('altar'), action: 'wonder', pay: { left: 0, right: 0 } })).toBe(true);
        game.applyCommand(1, discard(id('altar')));
        game.applyCommand(2, discard(id('altar')));
        expect(game.cities[0].stages).toBe(2);
        expect(game.cities[0].coins).toBe(12);
        // 捨て札には、ほかの 2 人が捨てた分だけが入る（段階に使ったカードは入らない）
        expect(game.discardPile).toHaveLength(2);
    });
});

describe('不思議の特別な力', () => {
    it('ハリカルナッソス：段階を建てたら、捨て札から 1 枚を無料で建てる', () => {
        const game = setupGame({ cities: [city('halicarnassus', 'A', ['oreVein', 'oreVein#4', 'mine#6'], { stages: 1 }), city('rhodes'), city('alexandria')], hands: [['altar', 'theater'], ['palace', 'baths'], ['pawnshop#4', 'theater']] });
        game.discardPile = ['palace#3'];
        game.applyCommand(0, { type: 'play', card: id('altar'), action: 'wonder', pay: { left: 0, right: 0 } });
        game.applyCommand(1, discard('baths#3'));
        game.applyCommand(2, discard('pawnshop#4'));
        expect(game.phase).toBe('discardBuild');
        expect(createGameView(game, 0).discardPile).toContain('palace#3');
        expect(createGameView(game, 1).discardPile).toBeNull();
        expect(game.applyCommand(1, { type: 'discardBuild', card: 'palace#3' })).toBe(false);
        expect(game.applyCommand(0, { type: 'discardBuild', card: 'palace#3' })).toBe(true);
        expect(game.cities[0].built).toContain('palace#3');
        expect(game.phase).toBe('choose');
    });

    it('ハリカルナッソス：6 手番目に段階を建てたら、その時代の 7 枚目（最後に捨てるカード）からも選べる', () => {
        const game = setupGame({ cities: [city('halicarnassus', 'A', ['oreVein', 'oreVein#4', 'mine#6'], { stages: 1 }), city('rhodes'), city('alexandria')], hands: [['altar', 'theater'], ['palace', 'baths'], ['pawnshop#4', 'senate']], turn: 6 });
        game.applyCommand(0, { type: 'play', card: id('altar'), action: 'wonder', pay: { left: 0, right: 0 } });
        game.applyCommand(1, discard('baths#3'));
        game.applyCommand(2, discard('pawnshop#4'));
        expect(game.phase).toBe('discardBuild');
        // 残りの宮殿（席 1 の手札）と元老院・劇場も、捨て札にある
        expect(game.discardPile).toEqual(expect.arrayContaining(['palace#3', 'senate#3', 'theater#3', 'baths#3', 'pawnshop#4']));
        expect(game.applyCommand(0, { type: 'discardBuild', card: 'palace#3' })).toBe(true);
        expect(game.cities[0].built).toContain('palace#3');
        expect(game.age).toBe(2);
    });

    it('オリンピア A：各時代に 1 回、建物を無料で建てる', () => {
        const game = setupGame({ cities: [city('olympia', 'A', [], { stages: 2, coins: 0 }), city('rhodes'), city('alexandria')], hands: [['palace', 'theater'], ['altar', 'baths'], ['altar', 'theater']] });
        expect(game.applyCommand(0, build('palace#3', { left: 0, right: 0 }, 'olympia'))).toBe(true);
        game.applyCommand(1, discard(id('altar')));
        game.applyCommand(2, discard(id('altar')));
        expect(game.cities[0].built).toContain('palace#3');
        expect(game.cities[0].freeBuildAge).toBe(1);
        expect(game.buildOptions(0, id('baths'))).toBeNull();
    });

    it('バビロン B：各時代の 7 枚目も使える', () => {
        const game = setupGame({ cities: [city('babylon', 'B', [], { stages: 2 }), city('rhodes'), city('alexandria')], hands: [['altar', 'theater'], ['baths', 'pawnshop#4'], ['stockade', 'tavern#4']], turn: 6 });
        [0, 1, 2].forEach(s => game.applyCommand(s, discard(game.hands[s][0])));
        expect(game.turn).toBe(7);
        expect(game.waiting).toEqual([0]);
        // 席 0 は右隣（席 1）から質屋を受け取っている
        expect(game.hands[0]).toEqual(['pawnshop#4']);
        expect(game.applyCommand(0, build('pawnshop#4'))).toBe(true);
        expect(game.cities[0].built).toContain('pawnshop#4');
        expect(game.age).toBe(2);
    });
});

describe('時代の終わりと最後', () => {
    it('6 手番のあと、残りの 1 枚を捨て、軍事を比べて次の時代へ', () => {
        const game = setupGame({ cities: [city('giza', 'A', ['stockade']), city('rhodes'), city('alexandria')], hands: [['altar', 'theater'], ['baths', 'pawnshop#4'], ['barracks', 'tavern#4']], turn: 6 });
        [0, 1, 2].forEach(s => game.applyCommand(s, discard(game.hands[s][0])));
        expect(game.age).toBe(2);
        expect(game.cities[0].tokens).toEqual([1, 1]);
        expect(game.cities[1].defeats).toBe(1);
        expect(game.discardPile).toHaveLength(6);
        expect(game.hands.every(h => h.length === 7)).toBe(true);
    });

    function playRandom(n, seed, sides = 'random') {
        const game = new Game(players(n), { seed, sides });
        const random = createRandom(seed * 3 + 1);
        let steps = 0;
        while (!game.isOver()) {
            for (const seat of [...game.waiting]) {
                const view = createGameView(game, seat);
                let command;
                if (game.phase === 'discardBuild') {
                    const choices = view.discardPile.filter(c => view.discardBuildable.includes(c));
                    command = { type: 'discardBuild', card: choices.length ? choices[Math.floor(random() * choices.length)] : null };
                } else {
                    const opts = view.handOptions.flatMap(h => [
                        ...(h.build ? h.build.options.map(pay => ({ type: 'play', card: h.card, action: 'build', pay, free: h.build.free })) : []),
                        ...(h.wonder ?? []).map(pay => ({ type: 'play', card: h.card, action: 'wonder', pay })),
                        { type: 'play', card: h.card, action: 'discard' }
                    ]);
                    command = opts[Math.floor(random() * opts.length)];
                }
                expect(game.applyCommand(seat, command)).toBe(true);
                if (game.isOver()) break;
            }
            if (++steps > 500) throw new Error('終わらない');
        }
        return game;
    }

    it('でたらめな手でも 3〜7 人で最後まで進み、記録から同じ結果を再現できる', () => {
        for (let n = 3; n <= 7; n++) {
            for (let seed = 1; seed <= 4; seed++) {
                const game = playRandom(n, seed * 7 + n);
                expect(game.scores).toHaveLength(n);
                game.cities.forEach(c => expect(c.coins).toBeGreaterThanOrEqual(0));
                // 同じ名前の建物は 1 つの都市に 1 つまで
                game.cities.forEach(c => {
                    const names = c.built.map(b => b.split('#')[0].replace(/[12]$/, ''));
                    expect(new Set(names).size).toBe(names.length);
                });
                const again = Game.replay(players(n), game.options, game.commands);
                expect(snapshot(again)).toBe(snapshot(game));
                expect(again.scores).toEqual(game.scores);
            }
        }
    });
});
