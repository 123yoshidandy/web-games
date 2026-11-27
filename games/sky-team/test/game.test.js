import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { createBoard, place, endRound, blueOf, orangeOf, brakeValueOf, landingFailures, AIRPORTS } from '../public/js/rules.js';

const players = (cpu = false) => [{ name: '機長', isCPU: cpu }, { name: '副操縦士', isCPU: cpu }];

// ダイスの目を決めたゲーム（seat ごとの4個の目）
function setup(dice, { airport = 'YUL', seed = 1 } = {}) {
    const game = new Game(players(), { seed, airport });
    dice.forEach((values, seat) => { game.dice[seat] = values.map(value => ({ value, used: false })); });
    return game;
}

const snapshot = game => JSON.stringify({ board: game.board, dice: game.dice, turn: game.turn, phase: game.phase, commands: game.commands.length, events: game.events.length });
const put = (game, seat, die, slot, delta = 0) => game.applyCommand(seat, { type: 'place', die, slot, delta });

describe('始まり', () => {
    it('2人で、機長から始まり、4個ずつダイスを振る', () => {
        const game = new Game(players(), { seed: 3 });
        expect(game.turn).toBe(0);
        expect(game.dice.map(d => d.length)).toEqual([4, 4]);
        game.dice.flat().forEach(d => expect(d.value).toBeGreaterThanOrEqual(1));
        expect(game.board.round).toBe(1);
        expect(() => new Game([{ name: 'a' }], { seed: 1 })).toThrow();
    });

    it('同じシードなら同じ目、違うシードなら違う目になりうる', () => {
        const a = new Game(players(), { seed: 7 });
        const b = new Game(players(), { seed: 7 });
        expect(a.dice).toEqual(b.dice);
    });
});

describe('置き場', () => {
    it('交互に置き、自分の置き場にしか置けない', () => {
        const game = setup([[1, 2, 3, 4], [1, 2, 3, 4]]);
        expect(put(game, 1, 0, 'radioC1')).toBe(false);
        expect(put(game, 0, 0, 'radioC1')).toBe(false);
        expect(put(game, 0, 0, 'radioP')).toBe(true);
        expect(game.turn).toBe(1);
        expect(put(game, 0, 1, 'axisP')).toBe(false);
    });

    it('軸：2つそろうと、高い目の側へ差の分だけ傾き、3 で墜落する', () => {
        const game = setup([[6, 1, 1, 1], [3, 1, 1, 1]]);
        expect(put(game, 0, 0, 'axisP')).toBe(true);
        expect(game.board.axis).toBe(0);
        expect(put(game, 1, 0, 'axisC')).toBe(true);
        expect(game.board.axis).toBe(3);
        expect(game.isOver()).toBe(true);
        expect(game.board.result).toEqual({ win: false, reasons: ['axis'] });
    });

    it('エンジン：速度が青以下なら進まず、青と橙の間なら1、橙より大きければ2マス進む', () => {
        const b = createBoard('YUL');
        expect([blueOf(b), orangeOf(b)]).toEqual([4, 8]);
        const run = (p, c) => {
            const board = createBoard('YUL');
            place(board, 0, 'engineP', p);
            place(board, 1, 'engineC', c);
            return board;
        };
        expect(run(2, 2).pos).toBe(0);
        expect(run(2, 3).pos).toBe(1);
        expect(run(4, 4).pos).toBe(1);
        // 2マス目（1番のマス）には飛行機がいないので、2マス進める
        expect(run(5, 4).pos).toBe(2);
    });

    it('飛行機がいるマスから進むとぶつかる。無線で目の数だけ先の飛行機を減らせる', () => {
        const board = createBoard('YUL');
        board.pos = 2; // 2番のマスに飛行機が1機
        place(board, 0, 'radioP', 1);
        expect(board.planes[2]).toBe(0);
        place(board, 1, 'radioC1', 2);
        expect(board.planes[3]).toBe(1);
        place(board, 0, 'engineP', 3);
        place(board, 1, 'engineC', 3);
        expect(board.pos).toBe(3);
        expect(board.result).toBeNull();
        board.slots = {};
        place(board, 0, 'engineP', 3);
        place(board, 1, 'engineC', 3);
        expect(board.result.reasons).toEqual(['collision']);
    });

    it('空港を通り過ぎると負け', () => {
        const board = createBoard('YUL');
        board.pos = board.planes.length - 1;
        place(board, 0, 'engineP', 6);
        place(board, 1, 'engineC', 6);
        expect(board.result.reasons).toEqual(['overshoot']);
    });

    it('着陸装置は決まった目で青を上げ、フラップとブレーキは順に、決まった目で出す', () => {
        const game = setup([[1, 2, 4, 5], [1, 2, 4, 5]]);
        expect(put(game, 0, 1, 'brake2')).toBe(false); // 先に 2 のブレーキ
        expect(put(game, 0, 1, 'brake1')).toBe(true);
        expect(brakeValueOf(game.board)).toBe(2);
        expect(put(game, 1, 1, 'flap2')).toBe(false);
        expect(put(game, 1, 0, 'flap1')).toBe(true);
        expect(orangeOf(game.board)).toBe(9);
        expect(put(game, 0, 3, 'gear2')).toBe(false);
        expect(put(game, 0, 3, 'gear3')).toBe(true);
        expect(blueOf(game.board)).toBe(5);
    });

    it('必須の置き場（軸・エンジン）の分のダイスは残しておく', () => {
        const game = setup([[1, 2, 3, 4], [1, 2, 3, 4]]);
        expect(put(game, 0, 0, 'radioP')).toBe(true);
        expect(put(game, 1, 0, 'coffee1')).toBe(true);
        expect(put(game, 0, 1, 'gear1')).toBe(true);
        expect(put(game, 1, 1, 'coffee2')).toBe(true);
        // 残り2個で、必須が2つ空いている
        expect(put(game, 0, 2, 'coffee3')).toBe(false);
        expect(put(game, 0, 2, 'axisP')).toBe(true);
    });

    it('コーヒー：置くと1個（3個まで）。使った数だけ目を変えられる', () => {
        const game = setup([[1, 3, 3, 3], [3, 3, 3, 3]]);
        expect(put(game, 0, 0, 'coffee1')).toBe(true);
        expect(game.board.coffee).toBe(1);
        expect(put(game, 1, 0, 'flap1', -2)).toBe(false); // コーヒー1個では2つ変えられない
        expect(put(game, 1, 0, 'flap1', -1)).toBe(true); // 3 → 2
        expect(game.board.coffee).toBe(0);
        expect(game.board.slots.flap1.value).toBe(2);
        expect(put(game, 0, 1, 'radioP', 1)).toBe(false);
    });

    it('振り直しのトークンで、選んだダイスを振り直せる', () => {
        const game = new Game(players(), { seed: 5 });
        expect(game.applyCommand(0, { type: 'reroll', dice: [0] })).toBe(false);
        game.board.rerolls = 1;
        expect(game.applyCommand(0, { type: 'reroll', dice: [0, 0] })).toBe(false);
        expect(game.applyCommand(0, { type: 'reroll', dice: [0, 2] })).toBe(true);
        expect(game.board.rerolls).toBe(0);
        expect(game.turn).toBe(0); // 振り直しは手番を進めない
    });

    it('外す操作は、置ける場所がないダイスだけ', () => {
        const game = setup([[1, 2, 3, 4], [1, 2, 3, 4]]);
        expect(game.applyCommand(0, { type: 'discard', die: 0 })).toBe(false);
    });

    it('8個置くと回が終わり、高度が下がって、2回目は副操縦士から', () => {
        const game = setup([[3, 3, 3, 3], [3, 3, 3, 3]]);
        const order = [[0, 0, 'axisP'], [1, 0, 'axisC'], [0, 1, 'engineP'], [1, 1, 'engineC'], [0, 2, 'radioP'], [1, 2, 'radioC1'], [0, 3, 'coffee1'], [1, 3, 'coffee2']];
        order.forEach(([seat, die, slot]) => expect(put(game, seat, die, slot), slot).toBe(true));
        expect(game.board.round).toBe(2);
        expect(game.turn).toBe(1);
        expect(game.board.slots).toEqual({});
        expect(game.board.rerolls).toBe(AIRPORTS.YUL.rerolls.includes(2) ? 1 : 0);
    });
});

describe('着陸', () => {
    const ready = () => {
        const b = createBoard('YUL');
        b.round = b.rounds;
        b.pos = b.planes.length - 1;
        b.planes = b.planes.map(() => 0);
        b.gear = [true, true, true];
        b.flaps = 4;
        b.brakes = 3;
        b.speed = 5;
        return b;
    };

    it('空港・飛行機なし・着陸装置・フラップ・水平・速度がブレーキ未満なら勝ち', () => {
        const b = ready();
        expect(landingFailures(b)).toEqual([]);
        endRound(b);
        expect(b.result).toEqual({ win: true, reasons: [] });
    });

    it('足りないものがあれば負けで、理由を全部出す', () => {
        const b = ready();
        b.speed = 6;
        b.axis = 1;
        b.flaps = 3;
        expect(landingFailures(b)).toEqual(['flaps', 'tilt', 'brakes']);
    });

    it('最後の回は、エンジンで進まない', () => {
        const b = createBoard('YUL');
        b.round = b.rounds;
        place(b, 0, 'engineP', 6);
        place(b, 1, 'engineC', 6);
        expect(b.pos).toBe(0);
        expect(b.speed).toBe(12);
    });
});

describe('断る操作', () => {
    it('状態を変えない', () => {
        const game = setup([[1, 2, 3, 4], [5, 6, 1, 2]]);
        const before = snapshot(game);
        const bad = [
            [1, { type: 'place', die: 0, slot: 'radioC1' }],
            [0, { type: 'place', die: 9, slot: 'radioP' }],
            [0, { type: 'place', die: 0, slot: 'nowhere' }],
            [0, { type: 'place', die: 0, slot: 'radioP', delta: 1 }],
            [0, { type: 'place', die: 0, slot: 'gear2' }],
            [0, { type: 'reroll', dice: [0] }],
            [0, { type: 'discard', die: 0 }],
            [0, { type: 'proxy' }],
            [0, null]
        ];
        for (const [seat, command] of bad) {
            expect(game.applyCommand(seat, command), JSON.stringify(command)).toBe(false);
            expect(game.lastError).toBeTruthy();
        }
        expect(snapshot(game)).toBe(before);
    });
});

describe('ビュー', () => {
    it('自分のダイスは見えるが、相手のまだ置いていないダイスは数だけ。シードは入らない', () => {
        const game = new Game(players(), { seed: 11 });
        const view = createGameView(game, 0);
        expect(view.dice.map(d => d.value)).toEqual(game.dice[0].map(d => d.value));
        expect(view.players[1].diceLeft).toBe(4);
        const text = JSON.stringify(view);
        expect(text).not.toContain('seed');
        expect(JSON.stringify(createGameView(game, null))).not.toContain('"dice":[');
    });

    it('置いたダイスは、相手のビューの盤に出る', () => {
        const game = setup([[4, 2, 3, 4], [5, 6, 1, 2]]);
        put(game, 0, 0, 'axisP');
        expect(createGameView(game, 1).board.slots.axisP).toEqual({ seat: 0, value: 4 });
        expect(createGameView(game, 1).players[0].diceLeft).toBe(3);
    });
});

describe('記録からの再現', () => {
    it('CPU どうしの試合を、記録から同じ状態に再現できる', () => {
        for (const airport of ['YUL', 'HND', 'KUL']) {
            for (let seed = 1; seed <= 4; seed++) {
                const game = new Game(players(true), { seed, airport });
                for (let i = 0; i < 200 && !game.isOver(); i++) expect(runCpuStep(game, game.turn)).toBe(true);
                expect(game.isOver()).toBe(true);
                const again = Game.replay(players(true), game.options, game.commands);
                expect(snapshot(again)).toBe(snapshot(game));
                expect(again.events).toEqual(game.events);
            }
        }
    });

    it('記録が合わなければ、再現は失敗を知らせる', () => {
        expect(() => Game.replay(players(), { seed: 1 }, [{ seat: 1, command: { type: 'place', die: 0, slot: 'axisC' } }])).toThrow();
    });
});
