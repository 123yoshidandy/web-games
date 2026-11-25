import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { CARDS, PLANS, SOLO_CARD, EFFECTS, HOUSE_COUNT } from '../public/js/cards.js';
import {
    canWrite, bisSpots, canFence, completedEstates, segments, sheetScore, planEstates, writeHouse
} from '../public/js/sheet.js';
import { players, makeGame, sheetOf, firstBuild, snapshot } from './helpers.js';

// 標準の3つの組み合わせを決める：[[番号, 効果], ...]
function setCombos(game, list) {
    game.shown = list.map(([n, e]) => ({ number: CARDS.find(c => c.n === n).id, effect: CARDS.find(c => c.e === e).id }));
}

describe('カードと都市計画', () => {
    it('家番号のカードは81枚。番号と効果の枚数が、公式の内訳どおり', () => {
        expect(CARDS.length).toBe(81);
        const byNumber = Array.from({ length: 15 }, (_, i) => CARDS.filter(c => c.n === i + 1).length);
        expect(byNumber).toEqual([3, 3, 4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3, 3]);
        const byEffect = Object.fromEntries(EFFECTS.map(e => [e, CARDS.filter(c => c.e === e).length]));
        expect(byEffect).toEqual({ surveyor: 18, estate: 18, park: 18, pool: 9, temp: 9, bis: 9 });
    });

    it('都市計画は18枚（n°1〜3 が6枚ずつ）。ゲームでは n°1〜3 から1枚ずつ', () => {
        expect(PLANS.length).toBe(18);
        [1, 2, 3].forEach(s => expect(PLANS.filter(p => p.stack === s).length).toBe(6));
        const game = makeGame(2, 5);
        expect(game.plans.map(id => PLANS[id].stack)).toEqual([1, 2, 3]);
    });
});

describe('番号の書き方', () => {
    it('左から右へ大きくなるように書く。同じ番号は書けない。間は空けてよい。0〜17', () => {
        const sheet = sheetOf([[3, null, 7]]);
        expect(canWrite(sheet, 0, 1, 5)).toBe(true);
        expect(canWrite(sheet, 0, 1, 3)).toBe(false);
        expect(canWrite(sheet, 0, 1, 7)).toBe(false);
        expect(canWrite(sheet, 0, 1, 8)).toBe(false);
        expect(canWrite(sheet, 0, 5, 8)).toBe(true);
        expect(canWrite(sheet, 0, 5, 2)).toBe(false);
        expect(canWrite(sheet, 0, 0, 3)).toBe(false);
        expect(canWrite(sheet, 1, 0, 0)).toBe(true);
        expect(canWrite(sheet, 1, 10, 17)).toBe(true);
        expect(canWrite(sheet, 1, 10, 18)).toBe(false);
        expect(canWrite(sheet, 0, 0, 2)).toBe(false);   // もう建っている
    });

    it('ビスは、すぐ隣の家と同じ番号。フェンスはまたげない', () => {
        const sheet = sheetOf([[3, null, 7]]);
        expect(bisSpots(sheet).filter(b => b.street === 0)).toEqual([
            { street: 0, house: 1, n: 3 }, { street: 0, house: 1, n: 7 }, { street: 0, house: 3, n: 7 }
        ]);
        sheet.fences[0][0] = true;
        expect(bisSpots(sheet).filter(b => b.street === 0 && b.house === 1).map(b => b.n)).toEqual([7]);
    });

    it('フェンスは、同じ番号（ビス）の間と、計画に使った家並みの中には立てられない', () => {
        const sheet = sheetOf([[3, null, 7, 9, 10]]);
        writeHouse(sheet, 0, 1, 3, { bis: true });
        expect(canFence(sheet, 0, 0)).toBe(false);
        expect(canFence(sheet, 0, 1)).toBe(true);
        sheet.used[0][2] = sheet.used[0][3] = true;
        expect(canFence(sheet, 0, 2)).toBe(false);
        expect(canFence(sheet, 0, 3)).toBe(true);
    });
});

describe('家並みと得点', () => {
    it('家並みは、フェンスではさまれた1〜6軒が全部建ったもの。7軒以上は数えない', () => {
        const sheet = sheetOf([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, null, 4]], [[0, 2], [1, 1]]);
        expect(segments(sheet).filter(s => s.street === 0).map(s => s.size)).toEqual([3, 7]);
        expect(completedEstates(sheet).map(e => [e.street, e.size])).toEqual([[0, 3], [1, 2]]);
    });

    it('得点表：公園・プール・家並みの値・ビスと断りの減点', () => {
        const sheet = sheetOf([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]], [[0, 2], [0, 5]]);
        sheet.estates[2] = 2;          // 3軒の家並みの値：3 → 4 → 5
        sheet.parks = [3, 4, 5];
        sheet.pools = sheet.pools.map(row => row.map(() => true));
        sheet.bis = 9;
        sheet.refusals = 3;
        const s = sheetScore(sheet);
        expect(s.estates).toBe(2 * 5 + 4);    // 3軒の家並み2つ × 5点と、4軒の家並み1つ × 4点
        expect(s.parks).toBe(10 + 14 + 18);
        expect(s.pools).toBe(36);
        expect(s.bis).toBe(28);
        expect(s.refusals).toBe(5);
        sheet.parks = [1, 0, 2];
        sheet.refusals = 1;
        expect(sheetScore(sheet).parks).toBe(2 + 0 + 4);
        expect(sheetScore(sheet).refusals).toBe(0);
    });

    it('派遣：1人以上を雇った人のうち、人数の多い順に 7・4・1点。同数は同じ点', () => {
        const game = makeGame(4, 1);
        [5, 5, 3, 0].forEach((n, i) => { game.players[i].sheet.temps = n; });
        expect(game.scores().map(r => r.temps)).toEqual([7, 7, 4, 0]);
        [4, 2, 2, 1].forEach((n, i) => { game.players[i].sheet.temps = n; });
        expect(game.scores().map(r => r.temps)).toEqual([7, 4, 4, 1]);
    });

    it('1人のときの派遣は、6人以上で7点', () => {
        const game = makeGame(1, 1);
        game.players[0].sheet.temps = 5;
        expect(game.scores()[0].temps).toBe(0);
        game.players[0].sheet.temps = 6;
        expect(game.scores()[0].temps).toBe(7);
    });
});

describe('ゲームの進行', () => {
    it('同じシードなら同じカード。組み合わせの効果は、前の手に番号だったカードの裏', () => {
        const a = makeGame(2, 9);
        const b = makeGame(2, 9);
        expect(a.combos()).toEqual(b.combos());
        const numbers = a.shown.map(s => s.number);
        a.players.forEach(p => {
            a.applyCommand(p.id, firstBuild(a, p.id));
            a.applyCommand(p.id, { type: 'end' });
        });
        expect(a.turnNo).toBe(2);
        expect(a.shown.map(s => s.effect)).toEqual(numbers);
    });

    it('番号はカードどおり。派遣だけ ±2 まで変えられ、派遣を1人数える', () => {
        const game = makeGame(2, 1);
        setCombos(game, [[8, 'temp'], [5, 'park'], [3, 'pool']]);
        const p = game.players[0];
        expect(game.applyCommand(0, { type: 'build', num: 1, eff: 1, value: 6, street: 0, house: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', num: 0, eff: 1, value: 8, street: 0, house: 0 })).toBe(false);   // 別の山の効果は使えない
        expect(game.applyCommand(0, { type: 'build', num: 0, eff: 0, value: 11, street: 0, house: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', num: 0, eff: 0, value: 10, street: 0, house: 0 })).toBe(true);
        expect(p.sheet.houses[0][0].n).toBe(10);
        expect(p.sheet.temps).toBe(1);
    });

    it('プールは印のある家に、プール業者で建てたときだけ。公園は建てた通りに、上限まで', () => {
        const game = makeGame(2, 1);
        setCombos(game, [[8, 'pool'], [5, 'park'], [3, 'pool']]);
        game.applyCommand(0, { type: 'build', num: 0, eff: 0, value: 8, street: 0, house: 2 });
        expect(game.players[0].sheet.pools[0][2]).toBe(true);
        game.applyCommand(1, { type: 'build', num: 0, eff: 0, value: 8, street: 0, house: 3 });
        expect(game.players[1].sheet.pools.flat().some(Boolean)).toBe(false);
        const g2 = makeGame(2, 1);
        setCombos(g2, [[8, 'pool'], [5, 'park'], [3, 'pool']]);
        g2.applyCommand(0, { type: 'build', num: 1, eff: 1, value: 5, street: 2, house: 0 });
        expect(g2.players[0].sheet.parks).toEqual([0, 0, 1]);
        g2.players[1].sheet.parks[1] = 4;   // 中の通りの公園は4つまで
        g2.applyCommand(1, { type: 'build', num: 1, eff: 1, value: 5, street: 1, house: 0 });
        expect(g2.players[1].sheet.parks).toEqual([0, 4, 0]);
    });

    it('選ぶ効果（測量士・不動産屋・ビス）は、建てたあとに1回だけ', () => {
        const game = makeGame(3, 1);
        setCombos(game, [[8, 'surveyor'], [5, 'estate'], [3, 'bis']]);
        expect(game.applyCommand(0, { type: 'effect', street: 0, pos: 0 })).toBe(false);
        game.applyCommand(0, { type: 'build', num: 0, eff: 0, value: 8, street: 0, house: 4 });
        expect(game.applyCommand(0, { type: 'effect', size: 2 })).toBe(false);
        expect(game.applyCommand(0, { type: 'effect', street: 0, pos: 4 })).toBe(true);
        expect(game.players[0].sheet.fences[0][4]).toBe(true);
        expect(game.applyCommand(0, { type: 'effect', street: 0, pos: 5 })).toBe(false);

        game.applyCommand(1, { type: 'build', num: 1, eff: 1, value: 5, street: 0, house: 4 });
        expect(game.applyCommand(1, { type: 'effect', size: 7 })).toBe(false);
        expect(game.applyCommand(1, { type: 'effect', size: 3 })).toBe(true);
        expect(game.players[1].sheet.estates).toEqual([0, 0, 1, 0, 0, 0]);

        game.applyCommand(2, { type: 'build', num: 2, eff: 2, value: 3, street: 1, house: 4 });
        expect(game.applyCommand(2, { type: 'effect', street: 1, pos: 6, value: 3 })).toBe(false);
        expect(game.applyCommand(2, { type: 'effect', street: 1, pos: 5, value: 3 })).toBe(true);
        expect(game.players[2].sheet.houses[1][5]).toEqual({ n: 3, bis: true });
        expect(game.players[2].sheet.bis).toBe(1);
    });

    it('どこにも書けないときだけ断りになり、効果は使えない。書けるうちは断れない', () => {
        const game = makeGame(2, 1);
        setCombos(game, [[8, 'surveyor'], [5, 'estate'], [3, 'temp']]);
        expect(game.applyCommand(0, { type: 'refuse' })).toBe(false);
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        const p = game.players[0];
        [0, 1, 2].forEach(s => writeHouse(p.sheet, s, p.sheet.houses[s].length - 1, 0));
        expect(game.mustRefuse(p)).toBe(true);
        expect(game.applyCommand(0, { type: 'refuse' })).toBe(true);
        expect(p.sheet.refusals).toBe(1);
        expect(game.applyCommand(0, { type: 'effect', size: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
    });

    it('取り消しで、この手のはじめに戻せる', () => {
        const game = makeGame(2, 1);
        setCombos(game, [[8, 'surveyor'], [5, 'estate'], [3, 'temp']]);
        const before = JSON.stringify(game.players[0].sheet);
        game.applyCommand(0, { type: 'build', num: 0, eff: 0, value: 8, street: 0, house: 4 });
        game.applyCommand(0, { type: 'effect', street: 0, pos: 2 });
        game.applyCommand(0, { type: 'undo' });
        expect(game.players[0].sheet.fences[0][2]).toBe(false);
        expect(game.players[0].sheet.houses[0][4].n).toBe(8);
        game.applyCommand(0, { type: 'undo' });
        expect(JSON.stringify(game.players[0].sheet)).toBe(before);
        expect(game.applyCommand(0, { type: 'undo' })).toBe(false);
    });

    it('全員が手を終えたら次の手。終えた人はもう操作できない', () => {
        const game = makeGame(2, 3);
        game.applyCommand(0, firstBuild(game, 0));
        game.applyCommand(0, { type: 'end' });
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(0, { type: 'undo' })).toBe(false);
        game.applyCommand(1, firstBuild(game, 1));
        game.applyCommand(1, { type: 'end' });
        expect(game.turnNo).toBe(2);
        expect(game.actors()).toEqual([0, 1]);
    });

    it('断る操作は状態を変えない', () => {
        const game = makeGame(2, 4);
        const before = snapshot(game);
        [{ type: 'build', num: 0, eff: 1, value: 1, street: 0, house: 0 }, { type: 'effect', size: 1 }, { type: 'plan', plan: 0 },
            { type: 'refuse' }, { type: 'undo' }, { type: 'end' }, { type: 'build', num: 'x' }, { type: 'nope' }, null]
            .forEach(c => expect(game.applyCommand(0, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('人数は1〜6人', () => {
        expect(() => new Game(players(0))).toThrow();
        expect(() => new Game(players(7))).toThrow();
        expect(() => new Game(players(6))).not.toThrow();
    });
});

describe('都市計画', () => {
    // 上の通りに、1軒の家並みを6つ作る
    function sixSingles(game, seat) {
        const sheet = game.players[seat].sheet;
        for (let h = 0; h < 6; h++) {
            writeHouse(sheet, 0, h, h + 1);
            sheet.fences[0][h] = true;
        }
        game.players[seat].start = structuredClone(sheet);
    }

    function setup() {
        const game = makeGame(3, 2);
        game.plans = [0, 6, 12];   // n°1 は 1軒×6
        setCombos(game, [[12, 'surveyor'], [13, 'estate'], [14, 'temp']]);
        return game;
    }

    const finishTurn = (game) => game.players.forEach(p => {
        if (p.done) return;
        if (!p.turn.built && !p.turn.refused) game.applyCommand(p.id, firstBuild(game, p.id));
        game.applyCommand(p.id, { type: 'end' });
    });

    it('建てる前と、家並みがそろっていないときは達成できない', () => {
        const game = setup();
        sixSingles(game, 0);
        expect(game.applyCommand(0, { type: 'plan', plan: 0 })).toBe(false);
        game.applyCommand(0, { type: 'build', num: 0, eff: 0, value: 12, street: 2, house: 11 });
        game.applyCommand(1, { type: 'build', num: 0, eff: 0, value: 12, street: 2, house: 11 });
        expect(game.applyCommand(1, { type: 'plan', plan: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'plan', plan: 0 })).toBe(true);
        expect(game.applyCommand(0, { type: 'plan', plan: 0 })).toBe(false);
        expect(game.players[0].sheet.used[0].slice(0, 7)).toEqual([true, true, true, true, true, true, false]);
    });

    it('同じ手に達成した人は全員高い点。後の手に達成した人は低い点', () => {
        const game = setup();
        [0, 1, 2].forEach(seat => sixSingles(game, seat));
        [0, 1].forEach(seat => {
            game.applyCommand(seat, { type: 'build', num: 0, eff: 0, value: 12, street: 2, house: 11 });
            game.applyCommand(seat, { type: 'plan', plan: 0 });
        });
        finishTurn(game);
        expect(game.players.map(p => p.plans[0]?.points ?? null)).toEqual([8, 8, null]);
        game.applyCommand(2, firstBuild(game, 2));
        game.applyCommand(2, { type: 'plan', plan: 0 });
        finishTurn(game);
        expect(game.players[2].plans[0].points).toBe(4);
    });

    it('最初の達成で切り直しを選ぶと、カード81枚を切り直す（1度だけ）', () => {
        const game = setup();
        sixSingles(game, 0);
        game.applyCommand(0, { type: 'build', num: 0, eff: 0, value: 12, street: 2, house: 11 });
        game.applyCommand(0, { type: 'plan', plan: 0, reshuffle: true });
        finishTurn(game);
        expect(game.reshuffled).toBe(true);
        expect(game.stacks.flat().length).toBe(81 - 6);
        const ids = [...game.stacks.flat(), ...game.shown.flatMap(s => [s.effect, s.number])];
        expect(new Set(ids).size).toBe(81);
        expect(game.canAskReshuffle()).toBe(false);
    });

    it('達成しても切り直しを選ばなければ、そのまま', () => {
        const game = setup();
        sixSingles(game, 0);
        const left = game.stacks.flat().length;
        game.applyCommand(0, { type: 'build', num: 0, eff: 0, value: 12, street: 2, house: 11 });
        game.applyCommand(0, { type: 'plan', plan: 0, reshuffle: false });
        finishTurn(game);
        expect(game.reshuffled).toBe(false);
        expect(game.stacks.flat().length).toBe(left - 3);
        expect(game.canAskReshuffle()).toBe(false);
    });

    it('計画に使う家並みは、まだ使っていないものから選ぶ', () => {
        const sheet = sheetOf([[1, 2, 3, 4, 5, 6, 7]], [[0, 0], [0, 1], [0, 2]]);
        const plan = { sizes: [1, 1] };
        expect(planEstates(sheet, plan).map(e => e.start)).toEqual([0, 1]);
        sheet.used[0][0] = true;
        expect(planEstates(sheet, plan).map(e => e.start)).toEqual([1, 2]);
        sheet.used[0][1] = true;
        expect(planEstates(sheet, plan)).toBe(null);
    });
});

describe('終わり', () => {
    const endTurn = (game) => game.players.forEach(p => {
        if (!p.turn.built && !p.turn.refused) {
            const build = firstBuild(game, p.id);
            game.applyCommand(p.id, build ?? { type: 'refuse' });
        }
        game.applyCommand(p.id, { type: 'end' });
    });

    it('断りが3つになった手で終わる', () => {
        const game = makeGame(2, 1);
        game.players[0].sheet.refusals = 2;
        game.players[0].start.refusals = 2;
        const p = game.players[0];
        [0, 1, 2].forEach(s => writeHouse(p.sheet, s, p.sheet.houses[s].length - 1, 0));
        endTurn(game);
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toContain('断り');
        expect(game.results[0].refusals).toBe(5);
    });

    it('家を全部建てた手で終わる。都市計画を3つ達成しても終わる', () => {
        const game = makeGame(2, 1);
        game.players[1].sheet.houses = game.players[1].sheet.houses.map(row => row.map((_, h) => ({ n: h, bis: false })));
        expect(game.players[1].sheet.houses.flat().length).toBe(HOUSE_COUNT);
        expect(game.endCheck()).toContain('全部');
        const g2 = makeGame(2, 1);
        g2.players[0].plans = [{ points: 1 }, { points: 1 }, { points: 1 }];
        expect(g2.endCheck()).toContain('3つ');
    });

    it('同点なら、完成した家並みの多い人の勝ち', () => {
        const game = makeGame(2, 1);
        const a = game.players[0].sheet;
        const b = game.players[1].sheet;
        writeHouse(a, 0, 0, 1);
        a.fences[0][0] = true;
        b.parks[0] = 1;   // 2点
        writeHouse(a, 1, 0, 1);
        a.fences[1][0] = true;
        game.finish('テスト');
        expect(game.results[0].total).toBe(game.results[1].total);
        expect(game.winners).toEqual([0]);
    });

    it('山札がなくなったら、表のカードを残して切り直す', () => {
        const game = makeGame(2, 7);
        for (let i = 0; i < 40; i++) {
            game.startTurn();
            const ids = game.shown.flatMap(s => [s.effect, s.number]);
            expect(ids.every(id => id >= 0 && id < 81)).toBe(true);
            expect(new Set(ids).size).toBe(6);
            const all = [...game.stacks.flat(), ...game.discard, ...ids];
            expect(new Set(all).size).toBe(81);
            expect(all.length).toBe(81);
        }
    });
});

describe('1人用の変種', () => {
    it('毎手3枚。番号と効果は別のカードから選ぶ（6通り）', () => {
        const game = makeGame(1, 3);
        expect(game.drawn.length).toBe(3);
        expect(game.combos().length).toBe(6);
        expect(game.combos().every(c => c.num !== c.eff)).toBe(true);
        expect(game.combo(0, 0)).toBe(null);
    });

    it('1人用のカードは山札の後半にあり、出たら都市計画はどれも低い点', () => {
        for (let seed = 1; seed < 20; seed++) {
            const game = makeGame(1, seed);
            expect(game.deck.indexOf(SOLO_CARD)).toBeGreaterThanOrEqual(40 - 3);
        }
        const game = makeGame(1, 1);
        game.deck = [SOLO_CARD, ...game.deck.filter(id => id !== SOLO_CARD)];
        const p = game.players[0];
        game.applyCommand(0, firstBuild(game, 0));
        game.applyCommand(0, { type: 'end' });
        expect(game.approved).toBe(true);
        expect(game.drawn.length).toBe(3);
        game.plans = [0, 6, 12];
        for (let h = 0; h < 6; h++) {
            writeHouse(p.sheet, 0, h, h + 1);
            p.sheet.fences[0][h] = true;
        }
        p.start = structuredClone(p.sheet);
        game.applyCommand(0, firstBuild(game, 0));
        expect(game.applyCommand(0, { type: 'plan', plan: 0 })).toBe(true);
        game.applyCommand(0, { type: 'end' });
        expect(p.plans[0].points).toBe(4);
    });

    it('山札がなくなったら終わる（81枚で27手）', () => {
        const game = makeGame(1, 11);
        let guard = 0;
        while (!game.isOver() && guard++ < 100) {
            const build = firstBuild(game, 0);
            game.applyCommand(0, build ?? { type: 'refuse' });
            game.applyCommand(0, { type: 'end' });
        }
        expect(game.isOver()).toBe(true);
        expect(game.turnNo).toBeLessThanOrEqual(27);
    });
});

describe('記録', () => {
    it('記録から同じゲームを再現できる', () => {
        const game = makeGame(3, 21);
        for (let t = 0; t < 5; t++) {
            game.players.forEach(p => {
                game.applyCommand(p.id, firstBuild(game, p.id) ?? { type: 'refuse' });
                game.applyCommand(p.id, { type: 'end' });
            });
        }
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('記録には決めた項目だけが残る', () => {
        const game = makeGame(2, 21);
        game.applyCommand(0, { ...firstBuild(game, 0), extra: 'x'.repeat(30) });
        expect(Object.keys(game.commands[0].command)).toEqual(['type', 'num', 'eff', 'value', 'street', 'house']);
    });
});

