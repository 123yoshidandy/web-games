import { describe, it, expect } from 'vitest';
import Game, { cardFruit, cardCount, fruitTotals, fiveFruits, DECK_SIZE, BELL_PAUSE_MS, WRONG_LOCK_MS, SPEEDS, TIME_LIMITS } from '../public/js/game.js';
import { versus, allCpu, setPiles, card, totalCards, snapshot } from './helpers.js';
import { runUntil } from '../public/js/cpu-player.js';

describe('カード', () => {
    it('56枚で、果物ごとに 14 枚（1 が5枚・2 が3枚・3 が3枚・4 が2枚・5 が1枚）', () => {
        expect(DECK_SIZE).toBe(56);
        for (let fruit = 0; fruit < 4; fruit++) {
            const counts = Array.from({ length: DECK_SIZE }, (_, i) => i).filter(c => cardFruit(c) === fruit).map(cardCount);
            expect(counts.sort()).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
        }
    });

    it('見えているカードの果物を数え、ちょうど5つの果物を見つける', () => {
        expect(fruitTotals([card(0, 2), card(0, 3), null, card(1, 4)])).toEqual([5, 4, 0, 0]);
        expect(fiveFruits([card(0, 2), card(0, 3), card(1, 4)])).toEqual([0]);
        expect(fiveFruits([card(0, 2), card(0, 4)])).toEqual([]);   // 6つは鳴らせない
        expect(fiveFruits([card(2, 5), card(3, 5)])).toEqual([2, 3]);
        expect(fiveFruits([null, null])).toEqual([]);
    });
});

describe('ゲームの進み方', () => {
    it('全部を裏のまま、席の順に配る（2〜6人）', () => {
        for (let n = 2; n <= 6; n++) {
            const game = allCpu(n, n);
            const sizes = game.players.map(p => p.deck.length);
            expect(sizes.reduce((a, b) => a + b)).toBe(DECK_SIZE);
            expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
            expect(game.players.every(p => p.pile.length === 0)).toBe(true);
        }
        expect(() => allCpu(1, 1)).toThrow();
        expect(() => allCpu(1, 7)).toThrow();
    });

    it('同じシードなら同じ配り方、違うシードなら違う配り方', () => {
        expect(versus(7).players[0].deck).toEqual(versus(7).players[0].deck);
        expect(versus(7).players[0].deck).not.toEqual(versus(8).players[0].deck);
    });

    it('手番の人だけがめくれ、めくると次の人の番になる', () => {
        const game = versus(3);
        expect(game.applyCommand(1, { type: 'flip', t: 100 })).toBe(false);
        expect(game.lastError).toBe('あなたの番ではありません');
        const top = game.players[0].deck.at(-1);
        expect(game.applyCommand(0, { type: 'flip', t: 100 })).toBe(true);
        expect(game.players[0].pile).toEqual([top]);
        expect(game.turn).toBe(1);
        expect(game.turnStartedAt).toBe(100);
        expect(game.tableVersion).toBe(1);
        expect(game.events.at(-1)).toMatchObject({ type: 'flip', seat: 0, card: top, t: 100 });
    });

    it('5つのときのベルは、表のカードを全部もらって山札の下に入れ、次はその人からめくる', () => {
        const game = versus(4);
        setPiles(game, [[card(1, 1), card(0, 2)], [card(0, 3)], [card(2, 1)]]);
        game.turn = 2;
        const before = totalCards(game);
        const bottom = game.players[1].deck.length;
        expect(game.applyCommand(1, { type: 'ring', t: 500 })).toBe(true);
        expect(game.players[1].bells).toBe(1);
        expect(game.players[1].deck.length).toBe(bottom + 4);
        expect(game.players[1].deck.slice(0, 4).sort((a, b) => a - b)).toEqual([card(1, 1), card(0, 2), card(0, 3), card(2, 1)].sort((a, b) => a - b));
        expect(game.players.every(p => p.pile.length === 0)).toBe(true);
        expect(totalCards(game)).toBe(before);
        expect(game.turn).toBe(1);
        expect(game.pauseUntil).toBe(500 + BELL_PAUSE_MS);
        expect(game.events.at(-1)).toMatchObject({ type: 'ring', seat: 1, ok: true, fruits: [0], gained: 4 });
    });

    it('5つでないのに鳴らすと、ほかの全員に1枚ずつ払い、少しの間は鳴らせない', () => {
        const game = versus(5, { cpus: 3 });
        setPiles(game, [[card(0, 4)], [card(1, 2)]]);
        const decks = game.players.map(p => p.deck.length);
        expect(game.applyCommand(0, { type: 'ring', t: 300 })).toBe(true);
        expect(game.players.map(p => p.deck.length)).toEqual([decks[0] - 3, decks[1] + 1, decks[2] + 1, decks[3] + 1]);
        expect(game.players[0]).toMatchObject({ misses: 1, lockUntil: 300 + WRONG_LOCK_MS });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'ring', t: 300 + WRONG_LOCK_MS - 1 })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.events.at(-1)).toMatchObject({ type: 'ring', seat: 0, ok: false, paid: 3 });
    });

    it('見ていた場から変わっていて今は5つでないベルは、払わずに断る。今も5つなら当たり', () => {
        const game = versus(6);
        setPiles(game, [[card(0, 4)]]);
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'ring', version: game.tableVersion + 3, t: 50 })).toBe(false);
        expect(game.lastError).toBe('間に合いませんでした');
        expect(snapshot(game)).toBe(before);
        setPiles(game, [[card(0, 4)], [card(0, 1)]]);
        expect(game.applyCommand(1, { type: 'ring', version: game.tableVersion + 3, t: 60 })).toBe(true);
        expect(game.players[1].bells).toBe(1);
    });

    it('払う山札がなくなったら脱落し、表の山は場の山に移り、次にベルを当てた人がもらう', () => {
        const game = versus(7, { cpus: 2 });
        setPiles(game, [[card(3, 1)], [card(1, 3)], []]);
        const deck = game.players[0].deck.splice(0);
        game.players[1].deck.push(...deck.slice(0, -1));
        game.players[0].deck = [deck.at(-1)];
        expect(game.applyCommand(0, { type: 'ring', t: 100 })).toBe(true);
        expect(game.players[0]).toMatchObject({ out: true, deck: [], pile: [] });
        expect(game.pot).toEqual([card(3, 1)]);
        expect(game.turn).toBe(1);
        expect(game.applyCommand(0, { type: 'ring', t: 200 })).toBe(false);
        setPiles(game, [[], [card(1, 3)], [card(1, 2)]]);
        game.applyCommand(2, { type: 'ring', t: 300 });
        expect(game.pot).toEqual([]);
        expect(game.players[2].deck.slice(0, 3)).toContain(card(3, 1));
        expect(totalCards(game)).toBe(DECK_SIZE);
    });

    it('めくる番が来たとき山札がなければ脱落し、残りが1人なら終わる', () => {
        const game = versus(8, { cpus: 1 });
        game.players[1].deck.splice(0);
        game.applyCommand(0, { type: 'flip', t: 1000 });
        expect(game.players[1].out).toBe(true);
        expect(game.isOver).toBe(true);
        expect(game.result).toMatchObject({ reason: 'last', winners: [0] });
        expect(game.result.standings.map(s => s.seat)).toEqual([0, 1]);
    });

    it('時間切れは制限を過ぎてから。枚数の多い人の勝ちで、同じ枚数は同じ順位', () => {
        const game = versus(9, { cpus: 2, timeLimit: 'short' });
        expect(game.applyCommand(0, { type: 'timeup', t: TIME_LIMITS.short - 1 })).toBe(false);
        expect(game.applyCommand(1, { type: 'timeup', t: TIME_LIMITS.short })).toBe(true);
        expect(game.result.reason).toBe('time');
        const [first, second, third] = game.result.standings;
        expect(first.cards).toBeGreaterThanOrEqual(second.cards);
        expect(second.cards).toBeGreaterThanOrEqual(third.cards);
        // 56 枚を3人に配ると 19・19・18
        expect(game.result.winners).toEqual([0, 1]);
        expect(first.rank).toBe(1);
        expect(second.rank).toBe(1);
        expect(third.rank).toBe(3);
    });

    it('自動でめくる時刻：手番が来てから間隔のあと。ベルのあとは少し待つ。人は自動にしなければ待つ', () => {
        const game = versus(10, { speed: 'fast' });
        expect(game.flipDue()).toBe(Infinity);
        game.applyCommand(0, { type: 'auto', on: true, t: 400 });
        expect(game.flipDue()).toBe(400 + SPEEDS.fast);
        game.applyCommand(0, { type: 'flip', t: 700 });
        expect(game.flipDue()).toBe(700 + SPEEDS.fast);
        setPiles(game, [[card(2, 5)]]);
        game.applyCommand(2, { type: 'ring', t: 900 });
        expect(game.flipDue()).toBe(900 + Math.max(SPEEDS.fast, BELL_PAUSE_MS));
        expect(game.applyCommand(0, { type: 'auto', on: true, t: 950 })).toBe(false);
    });

    it('通らない操作は断り、状態を変えない', () => {
        const game = versus(11);
        const before = snapshot(game);
        const bad = [
            [0, null], [0, 'flip'], [0, { type: 'proxy', t: 0 }], [9, { type: 'flip', t: 0 }], [-1, { type: 'flip', t: 0 }],
            [0, { type: 'flip', t: -1 }], [0, { type: 'flip', t: NaN }], [0, { type: 'flip' }], [1, { type: 'flip', t: 0 }],
            [1, { type: 'auto', on: true, t: 0 }], [0, { type: 'auto', on: 'yes', t: 0 }], [0, { type: 'timeup', t: 10 }]
        ];
        bad.forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録の時刻は減らない（前の操作より早い時刻は、前の時刻にそろえる）', () => {
        const game = versus(12);
        game.applyCommand(0, { type: 'flip', t: 5000 });
        game.applyCommand(1, { type: 'flip', t: 3000 });
        expect(game.commands.map(c => c.t)).toEqual([5000, 5000]);
    });

    it('CPU だけの試合は、どの人数でも終わり、カードは 56 枚のまま', () => {
        for (let n = 2; n <= 6; n++) {
            const game = allCpu(100 + n, n, { timeLimit: 'short' });
            runUntil(game, Infinity, 100000);
            expect(game.isOver).toBe(true);
            expect(totalCards(game)).toBe(DECK_SIZE);
        }
    });
});

describe('記録からの再現', () => {
    it('めくる・ベル（当たり・まちがい・遅れ）・自動・時間切れの記録（時刻つき）から、同じ局面と結果になる', () => {
        for (let seed = 1; seed <= 12; seed++) {
            const game = versus(seed, { cpus: 1 + seed % 4, timeLimit: 'short' });
            let t = 0;
            let n = 0;
            while (!game.isOver && n < 2000) {
                t += 150 + (n * 37) % 400;
                runUntil(game, t);
                if (game.isOver) break;
                if (n % 9 === 4) game.applyCommand(0, { type: 'ring', version: game.tableVersion, t });
                else if (n % 23 === 7) game.applyCommand(0, { type: 'ring', version: game.tableVersion - 1, t });
                else if (n % 31 === 3) game.applyCommand(0, { type: 'auto', on: !game.players[0].auto, t });
                else if (game.fives().length && n % 2 === 0) game.applyCommand(0, { type: 'ring', version: game.tableVersion, t });
                else if (game.turn === 0) game.applyCommand(0, { type: 'flip', t });
                n++;
            }
            runUntil(game, Infinity, 100000);
            expect(game.isOver).toBe(true);
            const copy = Game.replay(
                game.players.map((p, i) => ({ name: p.name, isCPU: p.isCPU, auto: i === 0 ? false : undefined })),
                { seed, mode: 'cpu', level: 'normal', timeLimit: 'short' },
                JSON.parse(JSON.stringify(game.commands))
            );
            expect(snapshot(copy)).toBe(snapshot(game));
            expect(copy.result).toEqual(game.result);
        }
    });

    it('途中までの記録から、途中の局面を作り直せる', () => {
        const game = allCpu(12, 3);
        runUntil(game, 30000);
        const half = game.commands.slice(0, 10);
        const copy = Game.replay(game.players.map(p => ({ name: p.name, isCPU: true })), { seed: 12, mode: 'cpu' }, half);
        expect(copy.commands).toEqual(half);
        expect(copy.lastT).toBe(half.at(-1).t);
        expect(copy.isOver).toBe(false);
    });

    it('通らない記録は、再現でエラーになる', () => {
        expect(() => Game.replay([{ name: 'A' }, { name: 'B' }], { seed: 1 }, [{ seat: 1, type: 'flip', t: 0 }])).toThrow();
    });
});
