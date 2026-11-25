import { describe, it, expect } from 'vitest';
import Game, { matchOrder, slotCount } from '../public/js/game.js';
import { CARDS, MAMAS, PAPAS, SUMMER_VISITORS, WINTER_VISITORS } from '../public/js/cards.js';
import { quickChoice } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { players, newGame, toSummer, vine, vines, visitor, order, setHand, choose, place, snapshot } from './helpers.js';

// 夏（または冬）を全員パスで終える。途中の選択（秋の訪問者カード・手札の上限）は最初の選択肢で答える
function passSeason(game) {
    const season = game.season;
    for (let guard = 0; guard < 50 && game.season === season; guard++) {
        if (game.pending) game.applyCommand(game.pending.seat, { type: 'choose', index: 0 });
        else if (game.turnOpen) game.applyCommand(game.current, { type: 'pass' });
    }
    while (game.pending && game.season !== 'spring') game.applyCommand(game.pending.seat, { type: 'choose', index: 0 });
}
const toWinter = (game) => { passSeason(game); return game; };

describe('準備', () => {
    it('ママの持ち物とパパのリラを受け取り、パパの選択を席順に答える', () => {
        const game = new Game(players(3), { seed: 3 });
        expect(game.season).toBe('setup');
        expect(game.pending.seat).toBe(0);
        game.players.forEach(p => {
            const mama = MAMAS[p.mama];
            expect(p.hand.length).toBe(Object.values(mama.cards).reduce((s, k) => s + k, 0));
            expect(p.lira).toBe(mama.lira + PAPAS[p.papa].lira);
            expect(p.workers).toBe(2);
            expect(p.grandeFree).toBe(true);
        });
        const papa = PAPAS[game.players[0].papa];
        const lira = game.players[0].lira;
        choose(game, `${papa.alt}リラ`);
        expect(game.players[0].lira).toBe(lira + papa.alt);
        expect(game.pending.seat).toBe(1);
        game.applyCommand(1, { type: 'choose', index: 0 });
        game.applyCommand(2, { type: 'choose', index: 0 });
        expect(game.season).toBe('spring');
        expect(game.year).toBe(1);
        expect(game.actors()).toEqual([game.first]);
    });
});

describe('春：起床時間の表', () => {
    it('最初の番から順に段を選び、おまけを受け取る。夏は早い段の順に動く', () => {
        const game = newGame(3);
        expect(game.applyCommand(0, { type: 'wake', row: 5 })).toBe(true);
        expect(game.players[0].vp).toBe(1);
        expect(game.applyCommand(1, { type: 'wake', row: 5 })).toBe(false);
        expect(game.applyCommand(1, { type: 'wake', row: 6 })).toBe(true);
        expect(game.players[1].temp).toBe(1);
        expect(game.applyCommand(2, { type: 'wake', row: 0 })).toBe(true);
        expect(game.season).toBe('summer');
        expect(game.order).toEqual([2, 0, 1]);
        expect(game.actors()).toEqual([2]);
        expect(game.availableWorkers(game.players[1])).toBe(3);
    });
});

describe('行動の場所', () => {
    it('枠の数は、2人で1つ・3〜4人で2つ・5〜6人で3つ', () => {
        expect([2, 3, 4, 5, 6].map(slotCount)).toEqual([1, 2, 2, 3, 3]);
    });

    it('最初の枠だけおまけが付く。埋まった場所には大きいワーカーだけが置ける', () => {
        const game = toSummer(newGame(2));
        const lira = game.players.map(p => p.lira);
        expect(place(game, 0, 'tour')).toBe(true);
        expect(game.players[0].lira).toBe(lira[0] + 3);
        expect(place(game, 1, 'tour')).toBe(false);
        expect(game.lastError).toContain('大きいワーカー');
        expect(place(game, 1, 'tour', true)).toBe(true);
        expect(game.players[1].lira).toBe(lira[1] + 2);
        expect(game.players[1].grandeFree).toBe(false);
        expect(game.spaces.tour).toEqual({ slots: [0], extra: [1] });
    });

    it('3人なら2人目も置けるが、3人目は置けない。冬の場所には夏に置けない', () => {
        const game = toSummer(newGame(3));
        expect(place(game, 0, 'harvest')).toBe(false);
        expect(place(game, 0, 'tour')).toBe(true);
        expect(place(game, 1, 'tour')).toBe(true);
        expect(game.players[1].lira).toBeGreaterThan(0);
        expect(place(game, 2, 'tour')).toBe(false);
    });

    it('同じ季節に同じ場所へ自分の人を2人は置けない', () => {
        const game = toSummer(newGame(5));
        expect(place(game, 0, 'tour')).toBe(true);
        [1, 2, 3, 4].forEach(seat => game.applyCommand(seat, { type: 'pass' }));
        expect(game.actors()).toEqual([0]);
        expect(place(game, 0, 'tour')).toBe(false);
        expect(game.lastError).toContain('もう自分の人');
    });

    it('できない行動には置けない（植えるブドウがない・出せる訪問者がない）', () => {
        const game = toSummer(newGame(2));
        setHand(game, 0, []);
        expect(place(game, 0, 'plant')).toBe(false);
        expect(place(game, 0, 'summerVisitor')).toBe(false);
        expect(place(game, 0, 'drawVine')).toBe(true);
    });

    it('人がいなくなった人は自動でパスし、全員がパスしたら秋に訪問者カードを引いて冬になる', () => {
        const game = toSummer(newGame(2));
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(1, { type: 'pass' });
        expect(game.season).toBe('fall');
        expect(game.pending.handler).toBe('drawDeck');
        const hand = game.players[0].hand.length;
        choose(game, '冬の訪問者');
        expect(game.players[0].hand.length).toBe(hand + 1);
        choose(game, '夏の訪問者');
        expect(game.season).toBe('winter');
    });

    it('夏に置いた人は冬に使えない', () => {
        const game = toSummer(newGame(2));
        place(game, 0, 'tour');
        place(game, 1, 'drawVine');
        place(game, 0, 'drawVine', true);
        place(game, 1, 'sell') || game.applyCommand(1, { type: 'pass' });
        if (game.actors()[0] === 0) place(game, 0, 'build') || game.applyCommand(0, { type: 'pass' });
        toWinter(game);
        expect(game.availableWorkers(game.players[0])).toBe(2 - game.players[0].used);
        expect(game.players[0].grandeFree).toBe(false);
    });
});

describe('ブドウを植える', () => {
    it('建物の要るブドウは、その建物がないと植えられない。畑の価値の上限を超えられない', () => {
        const game = toSummer(newGame(2));
        const [s1, s2] = vines('sangiovese');
        setHand(game, 0, [vine('pinot'), s1, s2, vine('cabernet')]);
        game.players[0].fields[0].vines = [vines('malvasia')[0], vines('malvasia')[1], vines('malvasia')[2], vines('malvasia')[3], vines('malvasia')[4]];
        expect(place(game, 0, 'plant')).toBe(true);
        const labels = game.pending.options.map(o => o.label);
        expect(labels.some(l => l.includes('ピノ'))).toBe(false);
        expect(labels.some(l => l.includes('カベルネ'))).toBe(false);
        expect(labels.filter(l => l.includes('サンジョヴェーゼ'))).toEqual(['サンジョヴェーゼ（赤1）を6の畑に', 'サンジョヴェーゼ（赤1）を7の畑に']);
        choose(game, '7の畑');
        // おまけでもう1本（終えてもよい）
        expect(game.pending.options.at(-1)).toMatchObject({ skip: true });
        choose(game, 'これで終わる');
        expect(game.players[0].fields[2].vines).toEqual([s1]);
        expect(game.players[0].hand).not.toContain(s1);
    });

    it('風車があれば、植えたときに1点（1年に1回）', () => {
        const game = toSummer(newGame(2));
        game.players[0].structures.push('windmill', 'trellis');
        setHand(game, 0, [vine('pinot'), vine('syrah')]);
        place(game, 0, 'plant');
        choose(game, 'ピノ');
        choose(game, 'シラー');
        expect(game.players[0].vp).toBe(1);
    });
});

describe('収穫と醸造', () => {
    it('畑の赤と白の合計の価値でブドウを置く。埋まっていれば下へ。同じ畑は1年に1回', () => {
        const game = toWinter(toSummer(newGame(2)));
        const p = game.players[0];
        p.fields[0].vines = [vine('pinot'), vines('sangiovese')[0], vines('malvasia')[0]];
        p.fields[1].vines = [vine('merlot')];
        p.crush.red = [3];
        expect(place(game, 0, 'harvest')).toBe(true);
        choose(game, '6の畑');
        expect(p.crush.red.sort()).toEqual([2, 3]);
        choose(game, '5の畑');
        expect(p.crush.red.sort()).toEqual([1, 2, 3]);
        expect(p.crush.white).toEqual([2]);
        expect(game.harvestOptions(0)).toEqual([]);
    });

    it('地下室の大きさで造れるワインと価値の上限が変わる', () => {
        const game = toWinter(toSummer(newGame(2)));
        const p = game.players[0];
        p.crush.red = [5, 2];
        p.crush.white = [4];
        const kinds = () => game.makeOptions(0).map(o => `${o.kind}${o.value}`);
        expect(kinds()).toEqual(['red2', 'red3', 'white3']);
        p.structures.push('medium');
        expect(kinds()).toEqual(['red2', 'red5', 'white4', 'blush6', 'blush6']);
        p.structures.push('large');
        expect(kinds()).toContain('sparkling9');
        expect(kinds()).toContain('blush9');
        expect(place(game, 0, 'make')).toBe(true);
        choose(game, 'スパークリングワイン9');
        expect(p.crush).toEqual({ red: [], white: [] });
        expect(p.cellar.sparkling).toEqual([9]);
    });
});

describe('注文', () => {
    it('条件を満たすうちで価値の低いワインを使う', () => {
        expect(matchOrder({ red: [3, 5, 7], white: [2], blush: [], sparkling: [] }, [{ kind: 'red', min: 4 }, { kind: 'white', min: 2 }]))
            .toEqual([{ kind: 'red', value: 5 }, { kind: 'white', value: 2 }]);
        expect(matchOrder({ red: [6, 4], white: [], blush: [], sparkling: [] }, [{ kind: 'red', min: 4 }, { kind: 'red', min: 6 }]))
            .toEqual([{ kind: 'red', value: 6 }, { kind: 'red', value: 4 }]);
        expect(matchOrder({ red: [5], white: [], blush: [], sparkling: [] }, [{ kind: 'red', min: 4 }, { kind: 'red', min: 4 }])).toBe(null);
    });

    it('注文を果たすと点と残りの収入。最初の枠ならさらに1点', () => {
        const game = toWinter(toSummer(newGame(2)));
        const p = game.players[0];
        const id = order('r4 w2');
        setHand(game, 0, [id]);
        p.cellar.red = [2, 5];
        p.cellar.white = [3];
        const vp = p.vp;
        expect(place(game, 0, 'fill')).toBe(true);
        choose(game, '赤4');
        expect(p.vp).toBe(vp + CARDS[id].vp + 1);
        expect(p.residual).toBe(CARDS[id].residual);
        expect(p.cellar).toEqual({ red: [2], white: [], blush: [], sparkling: [] });
        expect(game.discards.order).toContain(id);
    });
});

describe('年の終わり', () => {
    it('熟成（地下室の上限まで）・残りの収入・手札の上限・最初の番の移動', () => {
        const game = toWinter(toSummer(newGame(3)));
        const p = game.players[0];
        p.crush.red = [9, 8, 2];
        p.cellar.red = [3, 1];
        p.cellar.white = [3];
        p.structures.push('medium');
        p.cellar.blush = [6];
        p.residual = 2;
        const extra = game.decks.summer.splice(0, 9);
        setHand(game, 0, extra);
        const lira = p.lira;
        passSeason(game);
        expect(p.crush.red.sort((a, b) => a - b)).toEqual([3, 8, 9]);
        expect(p.cellar.red.sort((a, b) => a - b)).toEqual([2, 4]);
        expect(p.cellar.white).toEqual([4]);
        expect(p.cellar.blush).toEqual([6]);
        expect(p.hand.length).toBe(7);
        expect(p.lira).toBe(lira + 2);
        expect(game.season).toBe('spring');
        expect(game.year).toBe(2);
        expect(game.first).toBe(2);
        expect(p.used).toBe(0);
        expect(p.grandeFree).toBe(true);
    });

    it('年の終わりにだれかが20点以上なら終わる。同点ならリラの多い人の勝ち', () => {
        const game = toWinter(toSummer(newGame(3)));
        game.players[0].vp = 20;
        game.players[1].vp = 20;
        game.players[0].lira = 3;
        game.players[1].lira = 4;
        game.players[2].vp = 19;
        passSeason(game);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1]);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
    });

    it('19点なら終わらない', () => {
        const game = toWinter(toSummer(newGame(2)));
        game.players[0].vp = 19;
        passSeason(game);
        expect(game.isOver()).toBe(false);
        expect(game.year).toBe(2);
    });
});

describe('断る操作', () => {
    it('通らない操作は状態を変えない', () => {
        const game = toSummer(newGame(3));
        const before = snapshot(game);
        [
            [0, { type: 'place', action: 'harvest' }], [0, { type: 'place', action: 'moon' }], [1, { type: 'place', action: 'tour' }],
            [0, { type: 'wake', row: 1 }], [0, { type: 'choose', index: 0 }], [0, null], [0, { type: 'proxy' }], [0, 'pass']
        ].forEach(([seat, command]) => {
            expect(game.applyCommand(seat, command), JSON.stringify(command)).toBe(false);
        });
        expect(snapshot(game)).toBe(before);
        place(game, 0, 'drawVine');
        const mid = snapshot(game);
        expect(game.applyCommand(1, { type: 'choose', index: 99 })).toBe(false);
        expect(snapshot(game)).toBe(mid);
    });

    it('記録には種類ごとの項目だけが残る', () => {
        const game = toSummer(newGame(2));
        game.applyCommand(0, { type: 'place', action: 'tour', grande: 'yes', extra: 'x'.repeat(50) });
        expect(game.commands.at(-1)).toEqual({ playerId: 0, command: { type: 'place', action: 'tour', grande: false } });
    });
});

describe('訪問者カード', () => {
    // 何でもできる状態（建物・ブドウ・ワイン・注文・リラ）
    function richGame(season) {
        const game = toSummer(newGame(2));
        if (season === 'winter') toWinter(game);
        const p = game.players[0];
        p.lira = 30;
        p.structures = ['trellis', 'irrigation', 'medium'];
        p.fields[0].vines = [vines('sangiovese')[0], vines('malvasia')[0]];
        p.fields[1].vines = [vine('merlot')];
        p.crush = { red: [3, 5], white: [2, 4] };
        p.cellar = { red: [2, 5], white: [3], blush: [], sparkling: [] };
        setHand(game, 0, [vines('sangiovese')[1], vine('chardonnay'), order('r4 w2'), order('r5'), ...game.decks.summer.slice(0, 2), ...game.decks.winter.slice(0, 2)]);
        return game;
    }

    [...SUMMER_VISITORS.map(v => ['summer', v]), ...WINTER_VISITORS.map(v => ['winter', v])].forEach(([season, card]) => {
        it(`${card.name}：どの効果も最後まで行える`, () => {
            card.options.forEach((option, k) => {
                const game = richGame(season);
                game.pending = null;
                game.turnOpen = false;
                game.pushTasks(0, [{ op: 'ctxReset' }, ...option.tasks]);
                game.advance();
                for (let guard = 0; guard < 40 && game.pending?.seat === 0; guard++) {
                    expect(game.applyCommand(0, { type: 'choose', index: quickChoice(game, 0) }), `${card.name} ${k}`).toBe(true);
                }
                const p = game.players[0];
                expect(p.lira).toBeGreaterThanOrEqual(0);
                expect(new Set(p.hand).size).toBe(p.hand.length);
                Object.values(p.cellar).forEach(list => expect(new Set(list).size).toBe(list.length));
            });
        });
    });

    it('すべての訪問者カードに、何でもできる状態で出せる効果がある（条件付きの効果だけのカードを除く）', () => {
        ['summer', 'winter'].forEach(season => {
            const game = richGame(season);
            CARDS.filter(c => c.deck === season).forEach(card => {
                expect(game.visitorPlayable(0, card.id), card.name).toBe(true);
            });
        });
    });

    it('夏の訪問者の場所で、カードを出して効果を選ぶ', () => {
        const game = toSummer(newGame(2));
        setHand(game, 0, [visitor('仲買人')]);
        game.players[0].lira = 10;
        expect(place(game, 0, 'summerVisitor')).toBe(true);
        choose(game, '仲買人');
        choose(game, '9リラ払って3点');
        expect(game.players[0].lira).toBe(1);
        expect(game.players[0].vp).toBe(3);
        expect(game.discards.summer).toContain(visitor('仲買人'));
    });
});

describe('ビュー', () => {
    it('ほかの人の手札と選択肢は見せない', () => {
        const game = new Game(players(3), { seed: 9 });
        const view = createGameView(game, 1);
        expect(view.players[0].hand).toEqual([]);
        expect(view.players[0].handCount).toBe(game.players[0].hand.length);
        expect(view.players[1].hand).toEqual(game.players[1].hand);
        expect(view.pending).toEqual({ id: game.pending.id, seat: 0, title: game.pending.title });
        expect(JSON.stringify(view)).not.toContain('rng');
        expect(createGameView(game, 0).pending.options.length).toBe(2);
    });
});
