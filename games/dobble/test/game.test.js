import { describe, it, expect } from 'vitest';
import Game, { LOCK_MS, HINT_TIME_MS, LATE } from '../public/js/game.js';
import { CARDS, DECK_SIZE, SYMBOL_COUNT, SYMBOLS_PER_CARD, SYMBOL_NAMES, projectiveLines, commonSymbol } from '../public/js/deck.js';
import { solo, versus, claimOf, wrongOf, playOut, snapshot } from './helpers.js';

describe('山札（位数7の射影平面）', () => {
    it('57本の直線は、どれも8個の違う点を持ち、57個の点はどれもちょうど8本の直線にのる', () => {
        const lines = projectiveLines();
        expect(lines).toHaveLength(SYMBOL_COUNT);
        const count = new Array(SYMBOL_COUNT).fill(0);
        for (const line of lines) {
            expect(new Set(line).size).toBe(SYMBOLS_PER_CARD);
            line.forEach(p => {
                expect(p).toBeGreaterThanOrEqual(0);
                expect(p).toBeLessThan(SYMBOL_COUNT);
                count[p] += 1;
            });
        }
        expect(count.every(c => c === SYMBOLS_PER_CARD)).toBe(true);
    });

    it('どの2本の直線も、ちょうど1点で交わる（57本すべての組）', () => {
        const lines = projectiveLines();
        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                const shared = lines[i].filter(p => lines[j].includes(p));
                expect(shared).toHaveLength(1);
            }
        }
    });

    it('使うのは55枚で、どの2枚のカードにも同じマークがちょうど1つ。カードはすべて違う', () => {
        expect(CARDS).toHaveLength(DECK_SIZE);
        expect(new Set(CARDS.map(card => card.join(','))).size).toBe(DECK_SIZE);
        for (let a = 0; a < DECK_SIZE; a++) {
            for (let b = a + 1; b < DECK_SIZE; b++) {
                const symbol = commonSymbol(a, b);
                expect(CARDS[a].filter(s => CARDS[b].includes(s))).toEqual([symbol]);
            }
        }
        expect(commonSymbol(3, 3)).toBe(null);
        expect(SYMBOL_NAMES).toHaveLength(SYMBOL_COUNT);
        expect(new Set(SYMBOL_NAMES).size).toBe(SYMBOL_COUNT);
    });
});

describe('ゲームの進み方', () => {
    it('全員に1枚ずつ配り、残りが真ん中の山になる。同じシードなら同じ並び', () => {
        const game = versus(3, 'normal', 3);
        expect(game.pile.length).toBe(DECK_SIZE - 4);
        const all = [...game.pile, ...game.players.map(p => p.top)];
        expect(new Set(all).size).toBe(DECK_SIZE);
        expect(versus(3, 'normal', 3).pile).toEqual(game.pile);
        expect(versus(4, 'normal', 3).pile).not.toEqual(game.pile);
    });

    it('共通のマークをタップすると真ん中のカードを取り、それが自分の一番上になる', () => {
        const game = versus(5);
        const center = game.center;
        const command = claimOf(game, 0);
        expect(game.applyCommand(0, { ...command, t: 1500 })).toBe(true);
        expect(game.players[0]).toMatchObject({ top: center, taken: 1, score: 1 });
        expect(game.center).not.toBe(center);
        expect(game.version).toBe(1);
        expect(game.changedAt).toBe(1500);
        expect(game.events.at(-1)).toMatchObject({ type: 'take', seat: 0, card: center, symbol: command.symbol, t: 1500 });
    });

    it('違うマークは取れず、2秒は取れない（点は減らない）', () => {
        const game = versus(6);
        game.applyCommand(0, { ...claimOf(game, 0), t: 1000 });
        expect(game.applyCommand(0, { ...wrongOf(game, 0), t: 2000 })).toBe(true);
        expect(game.players[0]).toMatchObject({ score: 1, wrong: 1, lockUntil: 2000 + LOCK_MS });
        const before = snapshot(game);
        expect(game.applyCommand(0, { ...claimOf(game, 0), t: 3999 })).toBe(false);
        expect(game.lastError).toBe('少し待ってから取れます');
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { ...claimOf(game, 0), t: 4000 })).toBe(true);
    });

    it('先に取られた真ん中のカードへのタップは、まちがいにせず断る', () => {
        const game = versus(7);
        const late = claimOf(game, 1);
        game.applyCommand(0, { ...claimOf(game, 0), t: 1000 });
        const before = snapshot(game);
        expect(game.applyCommand(1, { ...late, t: 1010 })).toBe(false);
        expect(game.lastError).toBe(LATE);
        expect(snapshot(game)).toBe(before);
    });

    it('通らない操作は断り、状態を変えない', () => {
        const game = versus(8);
        const before = snapshot(game);
        const good = claimOf(game, 0);
        const nowhere = Array.from({ length: SYMBOL_COUNT }, (_, i) => i)
            .find(s => !CARDS[game.center].includes(s) && !CARDS[game.players[0].top].includes(s));
        const bad = [
            [0, null], [0, 'claim'], [0, { type: 'proxy', t: 0 }], [9, { ...good, t: 0 }],
            [0, { ...good, t: -1 }], [0, { ...good, t: NaN }], [0, { ...good }],
            [0, { ...good, symbol: 57, t: 0 }], [0, { ...good, symbol: '3', t: 0 }], [0, { ...good, center: undefined, t: 0 }],
            [0, { ...good, symbol: nowhere, t: 0 }]
        ];
        bad.forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('真ん中の山がなくなったら終わり。タイムアタックの結果にタイムが入る', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = playOut(solo(seed), 0, 1000);
            expect(game.isOver).toBe(true);
            expect(game.pile).toHaveLength(0);
            expect(game.players[0].taken).toBe(DECK_SIZE - 1);
            expect(game.result.time).toBe(game.lastT);
            expect(game.events.at(-1).type).toBe('end');
            expect(game.applyCommand(0, { type: 'hint', t: 1e6 })).toBe(false);
        }
    });

    it('記録の時刻は減らない（前の操作より早い時刻は、前の時刻にそろえる）', () => {
        const game = solo(9);
        game.applyCommand(0, { ...claimOf(game, 0), t: 5000 });
        game.applyCommand(0, { ...claimOf(game, 0), t: 3000 });
        expect(game.commands.map(c => c.t)).toEqual([5000, 5000]);
    });

    it('ヒントは共通のマーク。同じカードでは1回だけ記録し、対戦では1点減り、タイムアタックでは5秒足す', () => {
        const game = versus(10);
        game.applyCommand(0, { ...claimOf(game, 0), t: 1000 });
        expect(game.applyCommand(0, { type: 'hint', t: 1200 })).toBe(true);
        expect(game.hintFor(0)).toBe(game.answerFor(0));
        expect(game.hintFor(1)).toBe(null);
        expect(game.players[0]).toMatchObject({ score: 0, hints: 1 });
        expect(game.applyCommand(0, { type: 'hint', t: 1300 })).toBe(false);
        expect(game.commands).toHaveLength(2);
        game.applyCommand(0, { ...claimOf(game, 0), t: 2000 });
        expect(game.hintFor(0)).toBe(null);

        const alone = solo(10);
        alone.applyCommand(0, { type: 'hint', t: 10 });
        playOut(alone, 0, 1000);
        expect(alone.result.time).toBe(alone.result.elapsed + HINT_TIME_MS);
        expect(alone.players[0].score).toBe(DECK_SIZE - 1);
    });

    it('順位は点の多い順。同点は全員が勝ち', () => {
        const game = versus(11, 'normal', 1);
        let t = 0;
        let turn = 0;
        while (!game.isOver) {
            t += 500;
            const seat = turn++ % 2;
            game.applyCommand(seat, { ...claimOf(game, seat), t });
        }
        const { standings, winners } = game.result;
        expect(standings[0].taken + standings[1].taken).toBe(DECK_SIZE - 2);
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
                t += 600 + (n * 37) % 900;
                const seat = n % 3;
                if (n % 5 === 2 && game.canClaim(seat, t)) game.applyCommand(seat, { ...wrongOf(game, seat), t });
                else if (n % 7 === 3) game.applyCommand(seat, { type: 'hint', t });
                else if (game.canClaim(seat, t)) game.applyCommand(seat, { ...claimOf(game, seat), t });
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
        expect(() => Game.replay([{ name: 'A' }], { seed: 1 }, [{ seat: 0, type: 'claim', symbol: 0, center: -1, t: 0 }])).toThrow();
    });
});
