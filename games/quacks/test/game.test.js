import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { FORTUNES, START_BAG, space } from '../public/js/data.js';
import { runCpuStep, cpuActors, PROFILES } from '../public/js/cpu-player.js';
import { players, makeGame, restartWith, brewing, stack, act, stopAll, snapshot } from './helpers.js';

const playOut = (game, profile = PROFILES.normal, limit = 20000) => {
    let steps = 0;
    while (!game.isOver() && steps++ < limit) {
        const seat = cpuActors(game)[0];
        if (seat === undefined || !runCpuStep(game, seat, profile)) break;
    }
    return game;
};

describe('始まり', () => {
    it('袋は白1×4・白2×2・白3・カボチャ・クモ。ルビー1つ、点0、しずくは0', () => {
        const game = restartWith(makeGame(3), 'rabbit');
        game.players.forEach(p => {
            expect([...p.bag].sort()).toEqual([...START_BAG].sort());
            expect(p.rubies).toBe(1);
            expect(p.score).toBe(0);
            expect(p.droplet).toBe(0);
            expect(p.flask).toBe(true);
        });
        expect(game.round).toBe(1);
        expect(game.phase).toBe('brew');
        expect(game.actors()).toEqual([0, 1, 2]);
    });

    it('人数は2〜4人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(5))).toThrow();
        expect(() => new Game(players(2))).not.toThrow();
    });

    it('同じシードなら同じ展開になり、記録から再現できる', () => {
        const a = playOut(new Game(players(4, true), { seed: 42 }));
        const b = playOut(new Game(players(4, true), { seed: 42 }));
        expect(a.isOver()).toBe(true);
        expect(snapshot(a)).toBe(snapshot(b));
        const saved = JSON.parse(JSON.stringify(a.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(a));
    });
});

describe('調合', () => {
    it('材料は値の数だけ先のマスに置く。しずくとネズミの先から始める', () => {
        const game = brewing();
        const p = game.players[0];
        p.brew.start = p.brew.pos = 3;
        stack(game, 0, ['O1', 'G1', 'W2']);
        act(game, 0, 'draw', 'draw', 'draw');
        expect(p.pot.map(e => e.pos)).toEqual([4, 5, 7]);
        expect(p.brew.whites).toBe(2);
    });

    it('白の合計が7を超えると爆発し、もう引けない', () => {
        const game = brewing();
        const p = game.players[0];
        stack(game, 0, ['W3', 'W2', 'W2', 'W1', 'O1']);
        act(game, 0, 'draw', 'draw', 'draw');
        expect(p.brew.exploded).toBe(false);
        expect(p.brew.whites).toBe(7);
        act(game, 0, 'draw');
        expect(p.brew.exploded).toBe(true);
        expect(p.brew.done).toBe(true);
        expect(game.applyCommand(0, { type: 'draw' })).toBe(false);
    });

    it('ベニテングダケは、鍋のカボチャが1〜2つで1マス、3つ以上で2マス余分に進む', () => {
        const game = brewing();
        const p = game.players[0];
        stack(game, 0, ['R1', 'O1', 'R1', 'O1', 'O1', 'R1']);
        act(game, 0, 'draw', 'draw', 'draw', 'draw', 'draw', 'draw');
        expect(p.pot.map(e => e.pos)).toEqual([1, 2, 4, 5, 6, 9]);
    });

    it('フラスコで引いた白を袋に戻せる。フラスコは空になる。爆発させた白は戻せない', () => {
        const game = brewing();
        const p = game.players[0];
        stack(game, 0, ['W3', 'O1', 'W3', 'W2', 'W3']);
        act(game, 0, 'draw', 'flask');
        expect(p.pot).toEqual([]);
        expect(p.brew.whites).toBe(0);
        expect(p.flask).toBe(false);
        expect(p.bag.at(-1)).toBe('W3');
        act(game, 0, 'draw'); // O1
        expect(game.applyCommand(0, { type: 'flask' })).toBe(false);
    });

    it('マンドラゴラのすぐ前の白は袋に戻せる（マンドラゴラはそのまま）', () => {
        const game = brewing();
        const p = game.players[0];
        stack(game, 0, ['W2', 'Y1']);
        act(game, 0, 'draw', 'draw', 'mandrake');
        expect(p.pot).toEqual([{ chip: 'Y1', pos: 3 }]);
        expect(p.brew.whites).toBe(0);
        expect(p.bag).toContain('W2');
    });

    it('カラスは値の数だけ引き、1つを鍋に置ける。残りは袋へ', () => {
        const game = brewing();
        const p = game.players[0];
        stack(game, 0, ['B2', 'W1', 'R1', 'O1']);
        act(game, 0, 'draw');
        expect(p.brew.pending.chips).toEqual(['W1', 'R1']);
        expect(game.applyCommand(0, { type: 'draw' })).toBe(false);
        act(game, 0, { type: 'pick', index: 1 });
        expect(p.pot.map(e => e.chip)).toEqual(['B2', 'R1']);
        expect(p.bag.sort()).toEqual(['O1', 'W1']);
    });

    it('全員が止めると評価に進み、最後の材料の次のマスで点とお金が決まる', () => {
        const game = brewing(2);
        stack(game, 0, ['O1', 'G1']);
        act(game, 0, 'draw', 'draw', 'stop');
        expect(game.phase).toBe('brew');
        act(game, 1, 'stop');
        expect(game.phase).toBe('shop');
        const p = game.players[0];
        expect(p.result.space).toBe(3);
        expect(p.result.coins).toBe(space(3).coins);
    });
});

describe('評価', () => {
    it('いちばん進んだ（爆発していない）人がサイコロを振る', () => {
        const game = brewing(3);
        stack(game, 0, ['O1', 'O1', 'O1']);
        stack(game, 1, ['O1']);
        stack(game, 2, ['W3', 'W3', 'W3']);
        act(game, 0, 'draw', 'draw', 'draw', 'stop');
        act(game, 1, 'draw', 'stop');
        act(game, 2, 'draw', 'draw', 'draw');
        const dice = game.events.filter(e => e.type === 'die');
        expect(dice.map(e => e.seat)).toEqual([0]);
    });

    it('爆発したら点か買い物のどちらかを選ぶ', () => {
        const game = brewing(2);
        game.players[0].bag = ['W3', 'W3', 'W3'];
        game.players[0].random = () => 0;
        act(game, 0, 'draw', 'draw', 'draw');
        act(game, 1, 'stop');
        expect(game.phase).toBe('evaluate');
        expect(game.players[0].prompts[0].kind).toBe('explode');
        act(game, 0, { type: 'choose', option: 'explode:points' });
        expect(game.phase).toBe('shop');
        expect(game.players[0].result.coins).toBe(0);
        expect(game.players[0].score).toBe(space(10).points);
    });

    it('クモ（最後と最後から2番目）・ゴースト・ルビーのマス', () => {
        const game = brewing(2);
        const p = game.players[0];
        stack(game, 0, ['P1', 'P1', 'G1', 'O1', 'G1']); // 1,2,3,4,5 → 次のマスは6（ルビーなし）
        act(game, 0, 'draw', 'draw', 'draw', 'draw', 'draw', 'stop');
        stack(game, 1, ['O1', 'O1', 'O1', 'O1']); // 次のマスは5（ルビー）
        act(game, 1, 'draw', 'draw', 'draw', 'draw', 'stop');
        // 0：クモは最後の1つだけ → ルビー1、ゴースト2つ → 1点とルビー1
        expect(p.rubies).toBe(1 + 1 + 1);
        expect(p.score).toBeGreaterThanOrEqual(1 + space(6).points);
        expect(game.players[1].rubies).toBe(2);
    });

    it('ドクロガは両どなりと比べる（3人）', () => {
        const game = brewing(3);
        stack(game, 0, ['K1', 'K1']);
        stack(game, 1, ['K1']);
        stack(game, 2, ['O1']);
        act(game, 0, 'draw', 'draw', 'stop');
        act(game, 1, 'draw', 'stop');
        act(game, 2, 'draw', 'stop');
        const drops = game.events.filter(e => e.type === 'droplet' && e.why === 'ドクロガ').map(e => e.seat);
        expect(drops).toEqual([0, 1]);
        const rubies = game.events.filter(e => e.type === 'ruby' && e.why === 'ドクロガ').map(e => e.seat);
        expect(rubies).toEqual([0]);
    });
});

describe('買い物', () => {
    const toShop = () => {
        const game = brewing(2);
        stack(game, 0, ['O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1', 'O1']);
        act(game, 0, ...Array(15).fill('draw'), 'stop'); // 次のマスは16 → お金15
        act(game, 1, 'stop');
        return game;
    };

    it('違う色を2つまで、お金の範囲で買える', () => {
        const game = toShop();
        const coins = game.players[0].result.coins;
        expect(coins).toBe(15);
        const before = snapshot(game);
        [{ buy: ['G1', 'G2'] }, { buy: ['O1', 'G1', 'R1'] }, { buy: ['B4'] }, { buy: ['Y1'] }, { buy: ['P1'] }, { buy: ['W1'] }, { buy: 'R1' }]
            .forEach(c => expect(game.applyCommand(0, { type: 'shop', ...c })).toBe(false));
        expect(snapshot(game)).toBe(before);
        act(game, 0, { type: 'shop', buy: ['R2', 'O1'] });
        expect(game.players[0].bag.filter(c => c === 'R2' || c === 'O1').length).toBeGreaterThanOrEqual(2);
    });

    it('ルビー2つで、しずくを進めるかフラスコを満たす', () => {
        const game = toShop();
        const p = game.players[0];
        p.rubies = 4;
        p.flask = false;
        expect(game.applyCommand(0, { type: 'shop', droplet: 2, refill: true })).toBe(false);
        act(game, 0, { type: 'shop', droplet: 1, refill: true });
        expect(p.rubies).toBe(0);
        expect(p.droplet).toBe(1);
        expect(p.flask).toBe(true);
    });

    it('全員が買うと次の回に進み、鍋の材料は袋に戻る', () => {
        const game = toShop();
        act(game, 0, { type: 'shop', buy: [] });
        act(game, 1, { type: 'shop', buy: [] });
        expect(game.round).toBe(2);
        expect(game.players[0].pot).toEqual([]);
        expect(game.players[0].bag.length + game.players[0].pot.length).toBeGreaterThanOrEqual(START_BAG.length);
    });
});

describe('回の移り変わり', () => {
    it('ネズミ：いちばん点の多い人との間にあるしっぽの数だけ前から始める', () => {
        const game = makeGame(2);
        game.players[0].score = 12;
        game.players[1].score = 2;
        restartWith(game, 'rabbit', { round: 2 });
        expect(game.players[1].rats).toBe(4); // 3・6・8・10
        expect(game.players[1].brew.start).toBe(game.players[1].droplet + 4);
        expect(game.players[0].rats).toBe(0);
    });

    it('6回目に白1が1つ入る', () => {
        const game = makeGame(2);
        const before = game.players[0].bag.filter(c => c === 'W1').length;
        restartWith(game, 'rabbit', { round: 6 });
        expect(game.players[0].bag.filter(c => c === 'W1').length).toBe(before + 1);
    });

    it('9回目は買い物の代わりに、お金5で1点・ルビー2つで1点', () => {
        const game = makeGame(2);
        restartWith(game, 'rabbit', { round: 9 });
        const p = game.players[0];
        p.rubies = 4; // マス16のルビーで5つ → 2点
        stack(game, 0, Array(15).fill('O1'));
        act(game, 0, ...Array(15).fill('draw'), 'stop'); // 次のマスは16：お金15・3点
        stopAll(game);
        expect(game.isOver()).toBe(true);
        expect(p.final).toEqual({ fromCoins: 3, fromRubies: 2 });
        expect(p.score).toBe(space(16).points + 1 + 3 + 2); // サイコロは1点の面（並びを固定した乱数）
    });

    it('同点なら、最後の回に先まで進んだ人の勝ち', () => {
        const game = makeGame(2);
        restartWith(game, 'rabbit', { round: 9 });
        game.players[0].rubies = 0;
        game.players[1].rubies = 2;
        stack(game, 0, ['O1']);
        stack(game, 1, []);
        act(game, 0, 'draw', 'stop'); // 次のマスは2（0点）。サイコロで1点
        act(game, 1, 'stop');         // ルビー2つで1点
        expect(game.players.map(p => p.score)).toEqual([1, 1]);
        expect(game.winners).toEqual([0]);
    });
});

describe('占いカード', () => {
    it('24枚ある', () => {
        expect(FORTUNES.length).toBe(24);
        expect(new Set(FORTUNES.map(c => c.id)).size).toBe(24);
    });

    it.each(FORTUNES.map(c => c.id))('「%s」が毎回でも、CPU だけで最後まで進む', (id) => {
        [2, 3, 4].forEach(n => {
            const game = new Game(players(n, true), { seed: 7 + n });
            game.fortunes = Array(24).fill(id);
            game.round = 0;
            game.players.forEach(p => Object.assign(p, { score: 0, rubies: 1, droplet: 0, prompts: [], bag: [...START_BAG], pot: [] }));
            game.phase = 'fortune';
            game.startRound();
            playOut(game);
            expect(game.isOver()).toBe(true);
        });
    });

    it('丈夫な鍋：白が9を超えるまで爆発しない', () => {
        const game = restartWith(makeGame(2), 'portentous');
        stack(game, 0, ['W3', 'W3', 'W3', 'W1']);
        act(game, 0, 'draw', 'draw', 'draw');
        expect(game.players[0].brew.exploded).toBe(false);
        act(game, 0, 'draw');
        expect(game.players[0].brew.exploded).toBe(true);
    });

    it('カボチャ祭り：カボチャが1マス余分に進む', () => {
        const game = restartWith(makeGame(2), 'pumpkin');
        stack(game, 0, ['O1', 'O1']);
        act(game, 0, 'draw', 'draw');
        expect(game.players[0].pot.map(e => e.pos)).toEqual([2, 4]);
    });

    it('ひと泡：最初の白だけ、ただで戻せる（フラスコは減らない）', () => {
        const game = restartWith(makeGame(2), 'bubble');
        stack(game, 0, ['W3', 'W2']);
        act(game, 0, 'draw', 'bubble', 'draw');
        expect(game.players[0].flask).toBe(true);
        expect(game.applyCommand(0, { type: 'bubble' })).toBe(false);
        act(game, 0, 'flask');
        expect(game.players[0].flask).toBe(false);
    });

    it('やり直し：5つ置いたところで一度だけ引き直せる', () => {
        const game = restartWith(makeGame(2), 'second');
        stack(game, 0, ['W1', 'W1', 'W1', 'W2', 'O1', 'G1', 'W2', 'W3', 'O1']);
        act(game, 0, 'draw', 'draw', 'draw', 'draw');
        expect(game.applyCommand(0, { type: 'restart' })).toBe(false);
        act(game, 0, 'draw', 'restart');
        const p = game.players[0];
        expect(p.pot).toEqual([]);
        expect(p.bag.length).toBe(9);
        act(game, 0, 'draw', 'draw', 'draw', 'draw', 'draw');
        expect(game.applyCommand(0, { type: 'restart' })).toBe(false);
    });

    it('念のため：止めたら5つまで引き、1つを置ける', () => {
        const game = restartWith(makeGame(2), 'safety');
        stack(game, 0, ['O1', 'B4', 'W1', 'R2']);
        act(game, 0, 'draw', 'stop');
        const p = game.players[0];
        expect(p.brew.pending.chips).toEqual(['B4', 'W1', 'R2']);
        act(game, 0, { type: 'pick', index: 0 });
        expect(p.brew.done).toBe(true);
        expect(p.pot.map(e => e.chip)).toEqual(['O1', 'B4']);
        expect(p.bag.length).toBe(2);
    });

    it('よりどりみどり：選ぶまで調合は始まらない', () => {
        const game = restartWith(makeGame(2), 'choices');
        expect(game.phase).toBe('fortune');
        act(game, 0, { type: 'choose', option: 'rubies:3' });
        expect(game.phase).toBe('fortune');
        expect(game.applyCommand(1, { type: 'choose', option: 'chip:W1' })).toBe(false);
        act(game, 1, { type: 'choose', option: 'chip:K1' });
        expect(game.phase).toBe('brew');
        expect(game.players[0].rubies).toBe(4);
        expect(game.players[1].bag).toContain('K1');
    });

    it('とばっちり：爆発した人の左どなりが値2の材料を選ぶ', () => {
        const game = restartWith(makeGame(3), 'toil');
        stack(game, 1, ['W3', 'W3', 'W3']);
        act(game, 1, 'draw', 'draw', 'draw');
        act(game, 0, 'stop');
        act(game, 2, 'stop');
        expect(game.players[2].prompts[0].kind).toBe('toil');
        act(game, 2, { type: 'choose', option: 'chip:B2' });
        act(game, 1, { type: 'choose', option: 'explode:points' });
        expect(game.players[2].bag).toContain('B2');
        expect(game.phase).toBe('shop');
    });
});

describe('記録と再現', () => {
    it('断った操作は状態を変えない。でたらめな操作を混ぜても、記録から同じ状態を作れる', () => {
        for (let seed = 1; seed <= 6; seed++) {
            const game = new Game(players(3), { seed });
            let x = seed * 7919;
            const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
            const junk = [{ type: 'draw' }, { type: 'stop' }, { type: 'flask' }, { type: 'mandrake' }, { type: 'bubble' }, { type: 'restart' },
                { type: 'pick', index: 5 }, { type: 'pick', index: -1 }, { type: 'choose', option: 'x' }, { type: 'shop', buy: ['Z9'] },
                { type: 'shop', buy: ['G1', 'G2'] }, { type: 'shop', droplet: 99 }, { type: 'nope' }, null];
            for (let i = 0; i < 3000 && !game.isOver(); i++) {
                const seat = Math.floor(rnd() * 3);
                const before = snapshot(game);
                const command = junk[Math.floor(rnd() * junk.length)];
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                // ときどき CPU の手で前に進める
                const actor = game.actors()[0];
                if (actor !== undefined && rnd() < 0.5) runCpuStep(game, actor, PROFILES.random);
            }
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
