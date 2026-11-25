import { describe, it, expect } from 'vitest';
import Game, { trickWinner, commPosition } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { MISSIONS, ALL_CARDS, handoverAllowed } from '../public/js/missions.js';

const people = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: false }));

// 手札と課題を決め打ちして、すぐトリックを始められる形にする
function rig(game, hands, tasks = [], leader = 0) {
    game.hands = hands.map(h => [...h]);
    game.commander = leader;
    game.tasks = tasks.map(([card, owner, token = null]) => ({ card, owner, token, done: false, order: null }));
    game.totalTricks = Math.min(...hands.map(h => h.length));
    game.steps = [];
    game.phase = 'play';
    game.step = null;
    game.trick = { leader, plays: [] };
    return game;
}

function playAll(game, cards) {
    for (const card of cards) {
        const seat = game.current;
        expect(game.applyCommand(seat, { type: 'play', card }), `${card}: ${game.lastError}`).toBe(true);
    }
}

describe('配る', () => {
    it.each([[3, [14, 13, 13]], [4, [10, 10, 10, 10]], [5, [8, 8, 8, 8, 8]]])('%i人の手札の枚数', (n, counts) => {
        const game = new Game(people(n), { seed: 1, mission: 1 });
        expect(game.hands.map(h => h.length).sort((a, b) => b - a)).toEqual(counts);
        expect(new Set(game.hands.flat()).size).toBe(40);
        expect(game.hands[game.commander]).toContain('rocket4');
        expect(game.totalTricks).toBe(n === 3 ? 13 : 40 / n);
    });

    it('2人のときは JARVIS に裏7枚・表7枚、2人に13枚ずつ。ロケットの4は2人のどちらか', () => {
        for (let seed = 1; seed < 20; seed++) {
            const game = new Game(people(2), { seed, mission: 1 });
            expect(game.players).toHaveLength(3);
            expect(game.players[2].jarvis).toBe(true);
            expect(game.jarvisPiles).toHaveLength(7);
            expect(game.hands[0]).toHaveLength(13);
            expect(game.hands[1]).toHaveLength(13);
            const all = [...game.hands[0], ...game.hands[1], ...game.jarvisPiles.flatMap(p => [p.up, p.down])];
            expect(new Set(all).size).toBe(40);
            expect(game.commander).toBeLessThan(2);
            expect(game.totalTricks).toBe(13);
        }
    });
});

describe('トリック', () => {
    it('出された色で一番大きいカードが勝ち、ロケットは切り札', () => {
        expect(trickWinner([{ seat: 0, card: 'blue3' }, { seat: 1, card: 'blue9' }, { seat: 2, card: 'pink9' }]).seat).toBe(1);
        expect(trickWinner([{ seat: 0, card: 'blue3' }, { seat: 1, card: 'blue9' }, { seat: 2, card: 'rocket1' }]).seat).toBe(2);
        expect(trickWinner([{ seat: 0, card: 'rocket2' }, { seat: 1, card: 'rocket4' }, { seat: 2, card: 'rocket1' }]).seat).toBe(1);
    });

    it('出された色を持っていれば、その色を出さなければならない。断った操作は状態を変えない', () => {
        const game = rig(new Game(people(3), { seed: 2, mission: 1 }), [['blue3', 'pink1'], ['blue5', 'pink9'], ['green2', 'pink2']], [['blue5', 1]]);
        playAll(game, ['blue3']);
        expect(game.playable(1)).toEqual(['blue5']);
        const before = JSON.stringify(game.hands);
        expect(game.applyCommand(1, { type: 'play', card: 'pink9' })).toBe(false);
        expect(JSON.stringify(game.hands)).toBe(before);
        expect(game.applyCommand(2, { type: 'play', card: 'green2' })).toBe(false);
        playAll(game, ['blue5']);
        expect(game.playable(2)).toEqual(['green2', 'pink2']);
        playAll(game, ['green2']);
        expect(game.result).toEqual({ success: true, reason: null });
    });

    it('勝った人が次のトリックを始める', () => {
        const game = rig(new Game(people(3), { seed: 2, mission: 2 }), [['blue3', 'pink1', 'green1'], ['blue5', 'pink9', 'green9'], ['blue1', 'pink2', 'green2']], [['green9', 1], ['pink9', 1]]);
        playAll(game, ['blue3', 'blue5', 'blue1']);
        expect(game.trick.leader).toBe(1);
        expect(game.current).toBe(1);
    });
});

describe('課題', () => {
    it('ほかの人が課題のカードを取ると、すぐ失敗', () => {
        const game = rig(new Game(people(3), { seed: 3, mission: 2 }), [['blue3', 'pink1'], ['blue5', 'pink9'], ['blue9', 'pink2']], [['blue5', 1], ['pink1', 0]]);
        playAll(game, ['blue3', 'blue5', 'blue9']);
        expect(game.result.success).toBe(false);
        expect(game.isOver).toBe(true);
    });

    it('すべての課題を果たしたら、トリックが残っていても成功', () => {
        const game = rig(new Game(people(3), { seed: 3, mission: 1 }), [['blue3', 'pink1'], ['blue5', 'pink9'], ['blue1', 'pink2']], [['blue3', 1]]);
        playAll(game, ['blue3', 'blue5', 'blue1']);
        expect(game.result.success).toBe(true);
        expect(game.tasks[0].order).toBe(1);
    });

    it('数字のトークンは、その番目に果たす', () => {
        const hands = [['blue3', 'pink1'], ['blue5', 'pink9'], ['blue1', 'pink2']];
        const ok = rig(new Game(people(3), { seed: 3, mission: 3 }), hands, [['blue3', 1, '1'], ['pink2', 1, '2']]);
        playAll(ok, ['blue3', 'blue5', 'blue1', 'pink9', 'pink2', 'pink1']);
        expect(ok.result.success).toBe(true);
        const ng = rig(new Game(people(3), { seed: 3, mission: 3 }), hands, [['blue3', 1, '2'], ['pink2', 1, '1']]);
        playAll(ng, ['blue3', 'blue5', 'blue1']);
        expect(ng.result.success).toBe(false);
    });

    it('同じトリックで、続きの番号の課題を果たすのはよい', () => {
        const game = rig(new Game(people(3), { seed: 3, mission: 3 }), [['blue3', 'pink1'], ['blue5', 'pink9'], ['blue1', 'pink2']], [['blue1', 1, '2'], ['blue3', 1, '1']]);
        playAll(game, ['blue3', 'blue5', 'blue1']);
        expect(game.result.success).toBe(true);
    });

    it('矢印は相対の順番。Ω は最後', () => {
        const hands = [['blue3', 'pink1', 'green1'], ['blue5', 'pink9', 'green9'], ['blue1', 'pink2', 'green2']];
        const arrows = rig(new Game(people(3), { seed: 3, mission: 6 }), hands, [['pink2', 1, '>>'], ['blue1', 1, '>'], ['green2', 1]]);
        playAll(arrows, ['blue3', 'blue5', 'blue1', 'pink9', 'pink2', 'pink1', 'green9', 'green2', 'green1']);
        expect(arrows.result.success).toBe(true);
        const wrong = rig(new Game(people(3), { seed: 3, mission: 6 }), hands, [['pink2', 1, '>'], ['blue1', 1, '>>']]);
        playAll(wrong, ['blue3', 'blue5', 'blue1']);
        expect(wrong.result.success).toBe(false);
        const omega = rig(new Game(people(3), { seed: 3, mission: 7 }), hands, [['blue1', 1, 'omega'], ['pink2', 1]]);
        playAll(omega, ['blue3', 'blue5', 'blue1']);
        expect(omega.result.success).toBe(false);
    });

    it('課題を選ぶのは指揮官から順に1枚ずつ', () => {
        const game = new Game(people(4), { seed: 5, mission: 4 });
        expect(game.step.kind).toBe('pick');
        const order = [];
        for (let i = 0; i < 3; i++) {
            order.push(game.current);
            const index = game.tasks.findIndex(t => t.owner === null);
            expect(game.applyCommand(game.current, { type: 'pickTask', index })).toBe(true);
        }
        expect(order).toEqual([0, 1, 2].map(i => (game.commander + i) % 4));
        expect(game.phase).toBe('play');
        expect(game.current).toBe(game.commander);
    });
});

describe('通信', () => {
    it('その色の一番上・唯一・一番下だけ。ロケットはできない', () => {
        const hand = ['blue2', 'blue5', 'blue8', 'pink4', 'rocket1'];
        expect(commPosition(hand, 'blue8')).toBe('top');
        expect(commPosition(hand, 'blue2')).toBe('bottom');
        expect(commPosition(hand, 'blue5')).toBe(null);
        expect(commPosition(hand, 'pink4')).toBe('single');
        expect(commPosition(hand, 'rocket1')).toBe(null);
    });

    it('トリックの前だけ、1回だけ', () => {
        const game = rig(new Game(people(3), { seed: 3, mission: 2 }), [['blue3', 'pink1', 'green1'], ['blue5', 'pink9', 'green9'], ['blue1', 'pink2', 'green2']], [['green9', 1], ['pink2', 2]]);
        expect(game.applyCommand(2, { type: 'communicate', card: 'pink2' })).toBe(true);
        expect(game.comms[2]).toMatchObject({ card: 'pink2', position: 'single' });
        expect(game.applyCommand(2, { type: 'communicate', card: 'blue1' })).toBe(false);
        playAll(game, ['blue3']);
        expect(game.applyCommand(1, { type: 'communicate', card: 'pink9' })).toBe(false);
    });

    it('通信の妨害：決まったトリックまで通信できない', () => {
        const game = new Game(people(4), { seed: 7, mission: 18 });
        while (game.phase === 'prep') game.applyCommand(game.current, { type: 'pickTask', index: game.tasks.findIndex(t => t.owner === null) });
        const seat = game.commander;
        const card = game.hands[seat].find(c => commPosition(game.hands[seat], c));
        expect(game.commAllowed(seat)).toBe(false);
        expect(game.applyCommand(seat, { type: 'communicate', card })).toBe(false);
    });

    it('不感地帯：カードは見せるが、位置は伝わらない', () => {
        const game = new Game(people(4), { seed: 7, mission: 6 });
        while (game.phase === 'prep') game.applyCommand(game.current, { type: 'pickTask', index: game.tasks.findIndex(t => t.owner === null) });
        const seat = (game.commander + 1) % 4;
        const card = game.hands[seat].find(c => commPosition(game.hands[seat], c));
        expect(game.applyCommand(seat, { type: 'communicate', card })).toBe(true);
        const view = createGameView(game, game.commander);
        expect(view.comms[seat]).toEqual({ card, position: null, played: false });
    });

    it('ミッション11：指揮官が選んだ1人は通信できない', () => {
        const game = new Game(people(4), { seed: 9, mission: 11 });
        expect(game.step.kind).toBe('silence');
        expect(game.applyCommand(game.commander, { type: 'silence', seat: game.commander })).toBe(false);
        const target = (game.commander + 2) % 4;
        expect(game.applyCommand(game.commander, { type: 'silence', seat: target })).toBe(true);
        while (game.phase === 'prep') game.applyCommand(game.current, { type: 'pickTask', index: game.tasks.findIndex(t => t.owner === null) });
        expect(game.commAllowed(target)).toBe(false);
        expect(game.commAllowed((target + 1) % 4)).toBe(true);
    });
});

describe('遭難信号', () => {
    it('最初のトリックの前に、全員がロケット以外の1枚を同じ向きの隣へ渡す', () => {
        const game = rig(new Game(people(3), { seed: 3, mission: 1 }), [['blue3', 'pink1', 'rocket1'], ['blue5', 'pink9', 'green9'], ['blue1', 'pink2', 'green2']], [['green9', 1]]);
        expect(game.applyCommand(1, { type: 'distress', direction: 1 })).toBe(true);
        expect(game.current).toBe(0);
        expect(game.applyCommand(0, { type: 'passCard', card: 'rocket1' })).toBe(false);
        expect(game.applyCommand(0, { type: 'passCard', card: 'pink1' })).toBe(true);
        expect(game.applyCommand(1, { type: 'passCard', card: 'blue5' })).toBe(true);
        expect(game.applyCommand(2, { type: 'passCard', card: 'green2' })).toBe(true);
        expect(game.hands[1]).toContain('pink1');
        expect(game.hands[2]).toContain('blue5');
        expect(game.hands[0]).toContain('green2');
        expect(game.applyCommand(0, { type: 'distress', direction: 1 })).toBe(false);
    });

    it('通信のあとや、トリックが始まったあとは使えない', () => {
        const game = rig(new Game(people(3), { seed: 3, mission: 1 }), [['blue3', 'pink1'], ['blue5', 'pink9'], ['blue1', 'pink2']], [['pink9', 1]]);
        game.applyCommand(1, { type: 'communicate', card: 'pink9' });
        expect(game.applyCommand(0, { type: 'distress', direction: -1 })).toBe(false);
    });
});

describe('特別な条件', () => {
    it('具合が悪い人（ミッション5）がトリックを取ると失敗', () => {
        const game = new Game(people(4), { seed: 11, mission: 5 });
        for (const seat of game.step.order) game.applyCommand(seat, { type: 'answer', value: 'good' });
        expect(game.step.kind).toBe('choose');
        expect(game.applyCommand(game.commander, { type: 'choose', seat: 2 })).toBe(true);
        rig(game, [['blue1', 'pink1'], ['blue2', 'pink2'], ['blue9', 'pink3'], ['blue3', 'pink4']], [], 0);
        playAll(game, ['blue1', 'blue2', 'blue9', 'blue3']);
        expect(game.result.success).toBe(false);
    });

    it('9で取らない（ミッション16）は最後まで守れば成功', () => {
        const game = rig(new Game(people(3), { seed: 11, mission: 16 }), [['pink9', 'blue1'], ['pink1', 'blue8'], ['pink3', 'blue2']]);
        playAll(game, ['pink9', 'pink1', 'pink3']);
        expect(game.result.success).toBe(false);
        const ok = rig(new Game(people(3), { seed: 11, mission: 16 }), [['pink9', 'blue1'], ['rocket1', 'blue8'], ['pink3', 'blue2']]);
        playAll(ok, ['pink9', 'rocket1', 'pink3', 'blue8', 'blue2', 'blue1']);
        expect(ok.result.success).toBe(true);
    });

    it('ロケットを順に（ミッション44）', () => {
        const game = rig(new Game(people(3), { seed: 11, mission: 44 }), [['rocket2', 'blue1'], ['blue2', 'rocket1'], ['blue3', 'pink3']]);
        playAll(game, ['rocket2', 'rocket1', 'blue3']);
        expect(game.result.success).toBe(false);
    });

    it('差がつかない（ミッション29）', () => {
        const game = rig(new Game(people(3), { seed: 11, mission: 29 }), [['blue9', 'blue8', 'blue7'], ['blue1', 'blue2', 'blue3'], ['blue4', 'blue5', 'blue6']]);
        playAll(game, ['blue9', 'blue1', 'blue4']);
        expect(game.isOver).toBe(false);
        playAll(game, ['blue8', 'blue2', 'blue5']);
        expect(game.result.success).toBe(false);
    });

    it('指揮官の決定：指揮官は自分を選べず、選ばれた人がすべての課題を受け持つ', () => {
        const game = new Game(people(4), { seed: 13, mission: 20 });
        expect(createGameView(game, 0).tasks.every(t => t.card === null)).toBe(true);
        for (const seat of game.step.order) game.applyCommand(seat, { type: 'answer', value: 'yes' });
        expect(game.applyCommand(game.commander, { type: 'choose', seat: game.commander })).toBe(false);
        const target = (game.commander + 1) % 4;
        expect(game.applyCommand(game.commander, { type: 'choose', seat: target })).toBe(true);
        expect(game.tasks.every(t => t.owner === target)).toBe(true);
        expect(createGameView(game, 0).tasks.every(t => t.card)).toBe(true);
    });

    it('指揮官の配分：2枚以上の差がつく配り方はできない', () => {
        const game = new Game(people(4), { seed: 13, mission: 24 });
        const give = seat => {
            if (game.step.kind === 'ask') for (const s of game.step.order) game.applyCommand(s, { type: 'answer', value: 'no' });
            return game.applyCommand(game.commander, { type: 'assignTask', seat });
        };
        expect(give(1)).toBe(true);
        expect(give(1)).toBe(true);
        // 6枚を4人：2・2・1・1 まで。1番が3枚目は断る
        expect(give(1)).toBe(false);
        expect(give(2)).toBe(true);
        expect(give(2)).toBe(true);
        // 2枚の人が3人になると、残りの1人が0枚になる
        expect(give(3)).toBe(true);
        expect(give(3)).toBe(false);
        expect(give(0)).toBe(true);
        expect(game.phase).toBe('play');
    });

    it('5人でミッション25以降は、課題を1枚渡せる', () => {
        expect(handoverAllowed(24, 5)).toBe(false);
        expect(handoverAllowed(25, 5)).toBe(true);
        expect(handoverAllowed(25, 4)).toBe(false);
        const game = new Game(people(5), { seed: 15, mission: 25 });
        while (game.step.kind === 'pick') game.applyCommand(game.current, { type: 'pickTask', index: game.tasks.findIndex(t => t.owner === null) });
        expect(game.step.kind).toBe('handover');
        const task = game.tasks[0];
        const from = task.owner;
        const to = (from + 1) % 5;
        expect(game.applyCommand(game.current, { type: 'handover', from, to, task: 0 })).toBe(true);
        expect(game.tasks[0].owner).toBe(to);
        expect(game.phase).toBe('play');
    });
});

describe('JARVIS（2人）', () => {
    it('指揮官が JARVIS の表のカードを出し、出したら下のカードが表になる', () => {
        const game = new Game(people(2), { seed: 21, mission: 1 });
        while (game.phase === 'prep') game.applyCommand(game.current, { type: 'pickTask', index: game.tasks.findIndex(t => t.owner === null) });
        let guard = 0;
        while (game.turnSeat() !== 2 && !game.isOver && guard++ < 50) {
            game.applyCommand(game.current, { type: 'play', card: game.playable(game.turnSeat())[0] });
        }
        if (game.isOver) return;
        expect(game.current).toBe(game.commander);
        const card = game.playable(2)[0];
        const pile = game.jarvisPiles.find(p => p.up === card);
        const under = pile.down;
        expect(game.applyCommand(game.commander, { type: 'play', card })).toBe(true);
        if (game.trick.plays.length === 0) expect(pile.up).toBe(under);
    });
});

describe('記録と見え方', () => {
    it('記録から同じ状態を作り直せる', () => {
        const players = people(4).map((p, i) => ({ ...p, isCPU: i > 0 }));
        const game = new Game(players, { seed: 31, mission: 10 });
        while (game.phase === 'prep') game.applyCommand(game.current, { type: 'pickTask', index: game.tasks.findIndex(t => t.owner === null) });
        let guard = 0;
        while (!game.isOver && guard++ < 100) game.applyCommand(game.current, { type: 'play', card: game.playable(game.turnSeat())[0] });
        const copy = Game.replay(players, { seed: 31, mission: 10 }, game.commands);
        expect(copy.result).toEqual(game.result);
        expect(copy.history).toEqual(game.history);
    });

    it('ほかの人の手札は見えない', () => {
        const game = new Game(people(4), { seed: 33, mission: 1 });
        const view = createGameView(game, 1);
        expect(view.hand).toEqual(game.hands[1]);
        expect(JSON.stringify(view)).not.toContain(JSON.stringify(game.hands[0]));
        expect(view.players[0].handCount).toBe(10);
    });

    it('手番の人には選べるものが渡される', () => {
        const game = new Game(people(4), { seed: 33, mission: 1 });
        const view = createGameView(game, game.commander);
        expect(view.options.prep).toBe('pick');
    });
});

describe('ミッションのデータ', () => {
    it('50のミッション。課題の数とトークンの数が合う', () => {
        expect(Object.keys(MISSIONS)).toHaveLength(50);
        for (const m of Object.values(MISSIONS)) expect(m.tokens.length).toBeLessThanOrEqual(m.tasks);
        expect(ALL_CARDS).toHaveLength(40);
    });
});
