import { describe, it, expect } from 'vitest';
import Game, {
    ORIENTATIONS, END, INCOME_SPACES, LEATHER_SPACES, START_PATCH, legalPlacements, hasFullSquare,
    countEmpty, patchArea, rotateOrient, flipOrient, emptyQuilt
} from '../public/js/game.js';
import { PATCHES } from '../public/js/patches.js';
import { createGameView } from '../public/js/game-view.js';
import { newGame, PLAYERS, quiltFrom, playRandom, snapshot } from './helpers.js';

describe('パッチ', () => {
    it('33枚で、2×1 の最初のパッチがある', () => {
        expect(PATCHES).toHaveLength(33);
        expect(PATCHES[START_PATCH]).toMatchObject({ cost: 2, time: 1, income: 0, shape: ['##'] });
        expect(PATCHES.reduce((s, p) => s + patchArea(p.id), 0)).toBe(166);
    });
    it('向きは回転・裏返しで重なるものをまとめる', () => {
        expect(ORIENTATIONS[START_PATCH]).toHaveLength(2); // 横と縦
        expect(ORIENTATIONS[4]).toHaveLength(1);           // 2×2
        expect(ORIENTATIONS[5].length).toBe(8);            // 左右非対称の形
        for (let id = 0; id < 33; id++) {
            for (let o = 0; o < ORIENTATIONS[id].length; o++) {
                expect(ORIENTATIONS[id][o]).toHaveLength(patchArea(id));
                expect(rotateOrient(id, o)).toBeGreaterThanOrEqual(0);
                expect(flipOrient(id, o)).toBeGreaterThanOrEqual(0);
            }
        }
    });
});

describe('準備', () => {
    it('ボタン5つ、時間の駒はスタート、2×1 は中立の駒の真後ろ', () => {
        const game = newGame(3);
        expect(game.players.map(p => p.buttons)).toEqual([5, 5]);
        expect(game.players.map(p => p.position)).toEqual([0, 0]);
        expect(game.ring).toHaveLength(33);
        expect(game.ring[32]).toBe(START_PATCH);
        expect(new Set(game.ring).size).toBe(33);
        expect(game.offer).toHaveLength(3);
    });
    it('2人でなければ作れない', () => {
        expect(() => new Game([{ name: 'a' }], { seed: 1 })).toThrow();
    });
    it('同じシードなら同じ並び', () => {
        expect(snapshot(newGame(9))).toBe(snapshot(newGame(9)));
        expect(snapshot(newGame(9))).not.toBe(snapshot(newGame(10)));
    });
});

describe('手番', () => {
    it('後ろにいる人が動く。同じマスなら、あとから来た人', () => {
        const game = newGame(1);
        const first = game.current;
        game.applyCommand(first, { type: 'advance' });
        expect(game.players[first].position).toBe(1);
        expect(game.current).toBe(1 - first);
        // 後ろの人がパッチで同じマスまで進むと、上に乗って続けて動く
        game.players[1 - first].buttons = 50;
        const choice = game.offer.findIndex(id => PATCHES[id].time === 1);
        if (choice >= 0) {
            const p = legalPlacements(game.players[1 - first].quilt, game.offer[choice])[0];
            game.applyCommand(1 - first, { type: 'buy', choice, ...p });
            expect(game.current).toBe(1 - first);
        }
    });

    it('進む：相手の1マス先まで行き、進んだマスの数だけボタン', () => {
        const game = newGame(2);
        const seat = game.current;
        game.players[1 - seat].position = 7;
        game.players[seat].position = 2;
        game.applyCommand(seat, { type: 'advance' });
        expect(game.players[seat].position).toBe(8);
        // 5 マス進んで +6、5 の収入のマスを通る（収入0）
        expect(game.players[seat].buttons).toBe(5 + 6);
    });

    it('買う：ボタンを払い、置き、時間を進め、中立の駒は買った場所へ', () => {
        const game = newGame(4);
        const seat = game.current;
        game.players[seat].buttons = 20;
        const ring = [...game.ring];
        const id = ring[1];
        const p = legalPlacements(game.players[seat].quilt, id)[0];
        expect(game.applyCommand(seat, { type: 'buy', choice: 1, ...p })).toBe(true);
        // 置いてから時間を進めるので、収入のマスを通れば買ったパッチのボタンも数える
        const incomes = INCOME_SPACES.filter(s => s > 0 && s <= PATCHES[id].time).length;
        expect(game.players[seat].buttons).toBe(20 - PATCHES[id].cost + incomes * PATCHES[id].income);
        expect(game.players[seat].position).toBe(PATCHES[id].time);
        expect(game.players[seat].income).toBe(PATCHES[id].income);
        expect(countEmpty(game.players[seat].quilt)).toBe(81 - patchArea(id));
        expect(game.ring).toEqual([...ring.slice(2), ring[0]]);
    });

    it('収入のマスを通ると、キルトのボタンの数だけもらう', () => {
        const game = newGame(5);
        const seat = game.current;
        game.players[seat].income = 3;
        game.players[seat].position = 4;
        game.players[1 - seat].position = 12;
        game.applyCommand(seat, { type: 'advance' });
        // 4→13：9 マス、5 と 11 の収入のマスで 3×2
        expect(game.players[seat].buttons).toBe(5 + 9 + 6);
    });

    it('革のパッチのマスを最初に通った人がもらい、すぐに置く', () => {
        const game = newGame(6);
        const seat = game.current;
        game.players[seat].position = 18;
        game.players[1 - seat].position = 27;
        game.applyCommand(seat, { type: 'advance' }); // 18→28：20 と 26 を通る
        expect(game.pendingLeather).toEqual({ seat, count: 2 });
        expect(game.current).toBe(seat);
        expect(game.applyCommand(seat, { type: 'advance' })).toBe(false);
        game.applyCommand(seat, { type: 'leather', x: 0, y: 0 });
        game.applyCommand(seat, { type: 'leather', x: 1, y: 0 });
        expect(game.pendingLeather).toBe(null);
        expect(game.leatherLeft).toEqual([32, 44, 50]);
        expect(game.players[seat].quilt[0][0]).toBe('L');
        // 相手があとで通っても、もうない
        expect(LEATHER_SPACES).toContain(20);
    });

    it('時間はゴールで止まる', () => {
        const game = newGame(7);
        const seat = game.current;
        game.players[seat].position = 50;
        game.players[1 - seat].position = END;
        game.leatherLeft = [];
        game.applyCommand(seat, { type: 'advance' });
        expect(game.players[seat].position).toBe(END);
        expect(game.isOver).toBe(true);
    });
});

describe('断る操作', () => {
    const cases = [
        ['手番でない', g => g.applyCommand(1 - g.current, { type: 'advance' })],
        ['ボタンが足りない', g => { g.players[g.current].buttons = 0; return g.applyCommand(g.current, { type: 'buy', choice: 0, ...legalPlacements(g.players[g.current].quilt, g.offer[0])[0] }); }],
        ['3枚の外', g => g.applyCommand(g.current, { type: 'buy', choice: 3, orient: 0, x: 0, y: 0 })],
        ['キルトの外', g => { g.players[g.current].buttons = 50; return g.applyCommand(g.current, { type: 'buy', choice: 0, orient: 0, x: 8, y: 8 }); }],
        ['重なる', g => {
            const s = g.current;
            g.players[s].buttons = 50;
            g.players[s].quilt = quiltFrom(['#########', '#########', '#########', '#########', '#########', '#########', '#########', '#########', '#########']);
            return g.applyCommand(s, { type: 'buy', choice: 0, orient: 0, x: 0, y: 0 });
        }],
        ['向きが不正', g => { g.players[g.current].buttons = 50; return g.applyCommand(g.current, { type: 'buy', choice: 0, orient: 9, x: 0, y: 0 }); }],
        ['革のパッチがないのに置く', g => g.applyCommand(g.current, { type: 'leather', x: 0, y: 0 })],
        ['種類が不正', g => g.applyCommand(g.current, { type: 'pass' })],
        ['形が不正', g => g.applyCommand(g.current, null)]
    ];
    it.each(cases)('%s：断り、状態を変えない', (_, act) => {
        const game = newGame(5);
        let before = null;
        const original = game.applyCommand.bind(game);
        game.applyCommand = (seat, command) => {
            before = snapshot(game);
            return original(seat, command);
        };
        expect(act(game)).toBe(false);
        expect(game.lastError).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });
});

describe('ボーナスと得点', () => {
    it('7×7 を最初にそろえた人だけが +7', () => {
        const q = quiltFrom(['#######', '#######', '#######', '#######', '#######', '#######', '######']);
        expect(hasFullSquare(q)).toBe(false);
        q[6][6] = 'X';
        expect(hasFullSquare(q)).toBe(true);
        const game = newGame(8);
        const seat = game.current;
        game.players[seat].quilt = quiltFrom(['#######', '#######', '#######', '#######', '#######', '#######', '######']);
        game.players[seat].position = 18;
        game.players[1 - seat].position = 25;
        game.applyCommand(seat, { type: 'advance' }); // 革のパッチ（20）をもらう
        game.applyCommand(seat, { type: 'leather', x: 6, y: 6 });
        expect(game.bonusOwner).toBe(seat);
        expect(game.score(seat).bonus).toBe(7);
        // 相手があとでそろえても、もらえない
        game.players[1 - seat].quilt = quiltFrom(Array(7).fill('#######'));
        game.checkBonus(1 - seat);
        expect(game.bonusOwner).toBe(seat);
    });

    it('得点：ボタン − 空きマス×2 ＋ ボーナス。同点なら先にゴールした人', () => {
        const game = newGame(9);
        const [a, b] = game.players;
        a.buttons = 30; a.quilt = quiltFrom(Array(9).fill('#########')); a.quilt[0][0] = null; // 空き1
        b.buttons = 28; b.quilt = quiltFrom(Array(9).fill('#########'));
        a.finishedTurn = 40; b.finishedTurn = 35;
        game.finish();
        expect(game.result.standings.map(s => s.total)).toEqual([28, 28]);
        expect(game.result.tie).toBe(true);
        expect(game.result.winner).toBe(1); // 先にゴールした人
    });
});

describe('試合を通して', () => {
    it('ランダムな手で最後まで進み、記録から再現できる', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const game = newGame(seed * 17);
            playRandom(game, seed, g => {
                for (const p of g.players) {
                    expect(p.position).toBeLessThanOrEqual(END);
                    const filled = p.placed.reduce((s, item) => s + item.cells.length, 0);
                    expect(81 - countEmpty(p.quilt)).toBe(filled);
                }
            });
            expect(game.isOver).toBe(true);
            expect(game.players.every(p => p.position === END)).toBe(true);
            const replayed = Game.replay(PLAYERS(), { seed: game.seed }, game.commands);
            expect(snapshot(replayed)).toBe(snapshot(game));
        }
    });

    it('収入のマスは9つ、革のパッチは5つ', () => {
        expect(INCOME_SPACES).toHaveLength(9);
        expect(LEATHER_SPACES).toHaveLength(5);
        expect(emptyQuilt().flat()).toHaveLength(81);
    });
});

describe('ビュー', () => {
    it('置ける場所の一覧は、動く本人にだけ', () => {
        const game = newGame(3);
        game.players.forEach(p => { p.buttons = 50; });
        const seat = game.current;
        expect(createGameView(game, seat).buyable).toHaveLength(3);
        expect(createGameView(game, 1 - seat).buyable).toEqual([]);
    });
});
