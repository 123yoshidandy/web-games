import { describe, it, expect } from 'vitest';
import Game, { cardAttributes, isSet, thirdCard, findSets, hasSet, DECK_SIZE, BOARD_SIZE, LOCK_MS } from '../public/js/game.js';
import { solo, versus, nonSet, playOut, snapshot } from './helpers.js';

const card = (number, shape, shading, color) => number + shape * 3 + shading * 9 + color * 27;

describe('カード', () => {
    it('81枚で、4つの特徴の組み合わせがすべて1枚ずつ', () => {
        const keys = new Set(Array.from({ length: DECK_SIZE }, (_, i) => JSON.stringify(cardAttributes(i))));
        expect(keys.size).toBe(81);
    });

    it('どの特徴も「全部同じ」か「全部違う」ならセット', () => {
        // 数だけ違い、ほかは同じ
        expect(isSet(card(0, 1, 2, 0), card(1, 1, 2, 0), card(2, 1, 2, 0))).toBe(true);
        // すべて違う
        expect(isSet(card(0, 0, 0, 0), card(1, 1, 1, 1), card(2, 2, 2, 2))).toBe(true);
        // 色だけ2つ同じ
        expect(isSet(card(0, 0, 0, 0), card(1, 1, 1, 0), card(2, 2, 2, 2))).toBe(false);
        // 同じカードは組めない
        expect(isSet(5, 5, 5)).toBe(false);
    });

    it('どの2枚にも、セットになる3枚目がちょうど1枚ある', () => {
        for (let a = 0; a < DECK_SIZE; a++) {
            for (let b = a + 1; b < DECK_SIZE; b += 7) {
                const c = thirdCard(a, b);
                expect(c).not.toBe(a);
                expect(c).not.toBe(b);
                expect(isSet(a, b, c)).toBe(true);
            }
        }
    });

    it('場のセットを、すべて重ならずに数える', () => {
        const board = [card(0, 0, 0, 0), card(1, 0, 0, 0), card(2, 0, 0, 0), card(0, 1, 0, 0), card(0, 2, 0, 0)];
        expect(findSets(board)).toEqual([[board[0], board[1], board[2]], [board[0], board[3], board[4]]]);
        expect(hasSet([card(0, 0, 0, 0), card(1, 0, 0, 0), card(1, 1, 0, 0)])).toBe(false);
    });
});

describe('ゲームの進み方', () => {
    it('12枚を並べて始まり、場には必ずセットがある', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const game = solo(seed);
            expect(game.board.length).toBeGreaterThanOrEqual(BOARD_SIZE);
            expect(game.board.length + game.deck.length).toBe(DECK_SIZE);
            expect(hasSet(game.board)).toBe(true);
        }
    });

    it('同じシードなら同じ並び、違うシードなら違う並び', () => {
        expect(solo(7).board).toEqual(solo(7).board);
        expect(solo(7).board).not.toEqual(solo(8).board);
    });

    it('セットを取ると1点。12枚の場では、取った位置に山札から足す', () => {
        const game = solo(3);
        const [cards] = findSets(game.board);
        const positions = cards.map(c => game.board.indexOf(c));
        expect(game.applyCommand(0, { type: 'claim', cards, t: 1500 })).toBe(true);
        expect(game.players[0]).toMatchObject({ score: 1, sets: 1 });
        if (game.board.length === BOARD_SIZE) positions.forEach(i => expect(cards).not.toContain(game.board[i]));
        expect(game.events.at(-1)).toMatchObject({ type: 'take', seat: 0, cards, t: 1500 });
        expect(game.changedAt).toBe(1500);
    });

    it('場にセットがなければ3枚足す。15枚の場で取ったら足さずに詰める', () => {
        let found = false;
        for (let seed = 1; seed <= 400 && !found; seed++) {
            const game = solo(seed);
            if (game.board.length > BOARD_SIZE) {
                found = true;
                expect(game.board.length).toBe(15);
                expect(game.events.some(e => e.type === 'deal')).toBe(true);
                const before = game.deck.length;
                const deals = game.events.filter(e => e.type === 'deal').length;
                const [cards] = findSets(game.board);
                game.applyCommand(0, { type: 'claim', cards, t: 10 });
                const dealtAgain = game.events.filter(e => e.type === 'deal').length - deals;
                // 取った分は足さない（足すのは、残りの12枚にセットがないときだけ）
                expect(game.board.length).toBe(12 + dealtAgain * 3);
                expect(game.deck.length).toBe(before - dealtAgain * 3);
            }
        }
        expect(found).toBe(true);
    });

    it('山札がなくなり、場にセットが残っていなければ終わり。結果に時刻が入る', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = playOut(solo(seed), 0, 1000);
            expect(game.isOver).toBe(true);
            expect(game.deck.length).toBe(0);
            expect(hasSet(game.board)).toBe(false);
            expect(game.result.time).toBe(game.lastT);
            expect(game.players[0].sets * 3 + game.board.length).toBe(DECK_SIZE);
            expect(game.events.at(-1).type).toBe('end');
        }
    });

    it('セットでない3枚は1点減り（0 より下にならない）、3秒は取れない', () => {
        const game = solo(4);
        const [good] = findSets(game.board);
        game.applyCommand(0, { type: 'claim', cards: good, t: 1000 });
        const bad = nonSet(game.board);
        expect(game.applyCommand(0, { type: 'claim', cards: bad, t: 2000 })).toBe(true);
        expect(game.players[0]).toMatchObject({ score: 0, wrong: 1, lockUntil: 2000 + LOCK_MS });
        const [next] = findSets(game.board);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'claim', cards: next, t: 4999 })).toBe(false);
        expect(game.lastError).toBe('少し待ってから取れます');
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { type: 'claim', cards: next, t: 5000 })).toBe(true);
    });

    it('通らない操作は断り、状態を変えない', () => {
        const game = versus(5);
        const before = snapshot(game);
        const [cards] = findSets(game.board);
        const outside = Array.from({ length: 81 }, (_, i) => i).find(c => !game.board.includes(c));
        const bad = [
            [0, null], [0, 'claim'], [0, { type: 'proxy', t: 0 }], [9, { type: 'claim', cards, t: 0 }],
            [0, { type: 'claim', cards, t: -1 }], [0, { type: 'claim', cards, t: NaN }], [0, { type: 'claim', cards }],
            [0, { type: 'claim', cards: [cards[0], cards[0], cards[1]], t: 0 }], [0, { type: 'claim', cards: [cards[0], cards[1]], t: 0 }],
            [0, { type: 'claim', cards: [cards[0], cards[1], outside], t: 0 }], [0, { type: 'claim', cards: ['a', 'b', 'c'], t: 0 }]
        ];
        bad.forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録の時刻は減らない（前の操作より早い時刻は、前の時刻にそろえる）', () => {
        const game = solo(6);
        const [a] = findSets(game.board);
        game.applyCommand(0, { type: 'claim', cards: a, t: 5000 });
        const [b] = findSets(game.board);
        game.applyCommand(0, { type: 'claim', cards: b, t: 3000 });
        expect(game.commands.map(c => c.t)).toEqual([5000, 5000]);
    });

    it('ヒントは場のセットの1枚。同じ場では1回だけ記録し、CPU 対戦では1点減る', () => {
        const game = versus(8);
        const [first] = findSets(game.board);
        game.applyCommand(0, { type: 'claim', cards: first, t: 1000 });
        expect(game.applyCommand(0, { type: 'hint', t: 1200 })).toBe(true);
        const hinted = game.hintFor(0);
        expect(findSets(game.board).some(set => set.includes(hinted))).toBe(true);
        expect(game.players[0]).toMatchObject({ score: 0, hints: 1 });
        expect(game.applyCommand(0, { type: 'hint', t: 1300 })).toBe(false);
        expect(game.commands).toHaveLength(2);
        const [next] = findSets(game.board);
        game.applyCommand(0, { type: 'claim', cards: next, t: 2000 });
        expect(game.hintFor(0)).toBe(null);

        const alone = solo(8);
        alone.applyCommand(0, { type: 'hint', t: 10 });
        expect(alone.players[0]).toMatchObject({ score: 0, hints: 1 });
    });

    it('順位は点の多い順。同点は全員が勝ち', () => {
        const game = versus(9, 'normal', 1);
        let t = 0;
        let turn = 0;
        while (!game.isOver) {
            t += 500;
            const [cards] = findSets(game.board);
            game.applyCommand(turn++ % 2, { type: 'claim', cards, t });
        }
        const { standings, winners } = game.result;
        expect(standings[0].score).toBeGreaterThanOrEqual(standings[1].score);
        if (standings[0].score === standings[1].score) expect(winners).toHaveLength(2);
        else expect(winners).toEqual([standings[0].seat]);
    });
});

describe('記録からの再現', () => {
    it('取る・まちがい・ヒントの記録（時刻つき）から、同じ局面と結果になる', () => {
        for (let seed = 1; seed <= 15; seed++) {
            const game = versus(seed);
            let t = 0;
            let n = 0;
            while (!game.isOver) {
                t += 700 + (n * 37) % 900;
                const seat = n % 3;
                if (n % 5 === 2 && game.canClaim(seat, t)) game.applyCommand(seat, { type: 'claim', cards: nonSet(game.board), t });
                else if (n % 7 === 3) game.applyCommand(seat, { type: 'hint', t });
                else if (game.canClaim(seat, t)) game.applyCommand(seat, { type: 'claim', cards: findSets(game.board)[0], t });
                n++;
            }
            const copy = Game.replay(
                game.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
                { seed, mode: 'cpu', level: 'normal' },
                JSON.parse(JSON.stringify(game.commands))
            );
            expect(snapshot(copy)).toBe(snapshot(game));
            expect(copy.result).toEqual(game.result);
        }
    });

    it('途中までの記録から、途中の局面を作り直せる', () => {
        const game = playOut(solo(12), 0, 900);
        const half = game.commands.slice(0, 10);
        const copy = Game.replay([{ name: 'あなた' }], { seed: 12, mode: 'solo' }, half);
        expect(copy.commands).toEqual(half);
        expect(copy.lastT).toBe(half.at(-1).t);
        expect(copy.isOver).toBe(false);
    });

    it('通らない記録は、再現でエラーになる', () => {
        expect(() => Game.replay([{ name: 'A' }], { seed: 1 }, [{ seat: 0, type: 'claim', cards: [0, 1, 3], t: 0 }])).toThrow();
    });
});
