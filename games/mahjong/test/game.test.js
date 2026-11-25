import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep, cpuActors } from '../public/js/cpu-player.js';
import { makeGame, players, arrange, tile, pick, act, passAll, snapshot } from './helpers.js';

// 和了の形と関係のない手（どれもテンパイしていない）
const JUNK = {
    a: '159m159p159s1234z',   // 13枚
    b: '22m66m88p44s77s567z', // 13枚
    c: '33m77m99p3p6s8s1234z' // 13枚
};
const PINFU = '234m567p45s678s22p'; // 3索・6索待ち

// 親を席0にして、点数と本場・供託を決める
function fresh({ honba = 0, kyotaku = 0, kyoku = 0, scores = null, length = 'east' } = {}) {
    const game = makeGame(1, length);
    game.round.kyoku = kyoku;
    game.firstDealer = (4 - kyoku) % 4; // 親を席0にする
    game.round.honba = honba;
    game.round.kyotaku = kyotaku;
    if (scores) scores.forEach((s, i) => { game.players[i].score = s; });
    return game;
}

const ackAll = (game) => { while (game.phase === 'result') act(game, game.actors()[0], { type: 'next' }); };

describe('配牌と記録', () => {
    it('同じシードなら同じ配牌になり、親は14枚から始める', () => {
        const a = makeGame(7);
        const b = makeGame(7);
        expect(snapshot(a)).toBe(snapshot(b));
        expect(a.h.hands[a.dealer].length).toBe(14);
        expect(a.h.hands.reduce((s, h) => s + h.length, 0) + a.h.wall.length + a.h.dead.length).toBe(136);
        expect(a.h.wall.length).toBe(69);
    });

    it('操作の記録から、同じ状態を再現できる', () => {
        const game = new Game(players(true), { seed: 11, length: 'south' });
        for (let i = 0; i < 400 && !game.isOver(); i++) runCpuStep(game, cpuActors(game)[0]);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('断った操作は状態を変えない', () => {
        const game = makeGame(3);
        const before = snapshot(game);
        const turn = game.dealer;
        const other = (turn + 1) % 4;
        const notInHand = Array.from({ length: 136 }, (_, i) => i).find(id => !game.h.hands[turn].includes(id));
        [
            [other, { type: 'discard', tile: game.h.hands[other][0] }],
            [turn, { type: 'discard', tile: notInHand }],
            [turn, { type: 'tsumo' }],
            [turn, { type: 'ron' }],
            [turn, { type: 'next' }],
            [turn, { type: 'kan', kind: 0 }],
            [turn, { type: 'proxy' }],
            [turn, null],
            [9, { type: 'discard', tile: game.h.hands[turn][0] }]
        ].forEach(([seat, command]) => {
            expect(game.applyCommand(seat, command)).toBe(false);
            expect(game.lastError).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });
});

describe('ロン', () => {
    it('子のロン：放銃者が払い、本場300と供託は和了者へ', () => {
        const game = fresh({ honba: 1, kyotaku: 1 });
        arrange(game, { hands: [`${JUNK.a}3s`, PINFU, JUNK.b, JUNK.c], turn: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3s') });
        expect(game.phase).toBe('call');
        expect(game.actors()).toEqual([1]);
        expect(game.optionsFor(1)).toMatchObject({ type: 'call', ron: true });
        act(game, 1, { type: 'ron' });
        expect(game.phase).toBe('result');
        const win = game.result.wins[0];
        expect(win.yaku.map(y => y.name)).toEqual(['平和', '断幺九']);
        expect(win.points).toBe(2300);
        expect(game.result.deltas).toEqual([-2300, 3300, 0, 0]);
        expect(game.players.map(p => p.score)).toEqual([22700, 28300, 25000, 25000]);
        expect(game.round.kyotaku).toBe(0);
    });

    it('ダブロン：本場は両方に、供託は放銃者に近いほうへ', () => {
        const game = fresh({ honba: 1, kyotaku: 2 });
        arrange(game, { hands: [`${JUNK.a}3s`, JUNK.b, PINFU, '234p567m45s678s33m'], turn: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3s') });
        expect(game.actors().sort()).toEqual([2, 3]);
        act(game, 3, { type: 'ron' });
        act(game, 2, { type: 'ron' });
        expect(game.result.wins.map(w => w.seat)).toEqual([2, 3]);
        expect(game.result.deltas).toEqual([-4600, 0, 4300, 2300]);
    });

    it('3人がロンすると三家和で流局（親は連荘）', () => {
        const game = fresh();
        arrange(game, { hands: [`${JUNK.a}3s`, '234p567m45s678s22m', PINFU, '234s567m345p678p3s'], turn: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3s') });
        [1, 2, 3].forEach(s => act(game, s, { type: 'ron' }));
        expect(game.result).toMatchObject({ type: 'draw', reason: 'sanchahou' });
        ackAll(game);
        expect(game.round).toMatchObject({ kyoku: 0, honba: 1 });
    });

    it('ツモ：子の和了は親が倍を払う', () => {
        const game = fresh();
        arrange(game, { hands: [JUNK.a, `${PINFU}6s`, JUNK.b, JUNK.c], turn: 1 });
        expect(game.optionsFor(1).tsumo).toBe(true);
        act(game, 1, { type: 'tsumo' });
        // 門前清自摸和・平和・断幺九 3翻20符 700/1300
        expect(game.result.deltas).toEqual([-1300, 2700, -700, -700]);
    });
});

describe('鳴き', () => {
    it('ポンは誰の打牌からでもでき、そのあと同じ牌は捨てられない（食い替え）', () => {
        const game = fresh();
        arrange(game, { hands: [`${JUNK.a}7p`, JUNK.b, '777p123m56s9s1234z', JUNK.c], turn: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '7p') });
        const opts = game.optionsFor(2);
        expect(opts.pon.length).toBe(1);
        act(game, 2, { type: 'pon', tiles: opts.pon[0] });
        expect(game.h.turn).toBe(2);
        expect(game.h.melds[2][0]).toMatchObject({ type: 'pon', from: 0 });
        expect(game.h.discards[0].at(-1).called).toBe(true);
        expect(game.applyCommand(2, { type: 'discard', tile: pick(game, 2, '7p') })).toBe(false);
        act(game, 2, { type: 'discard', tile: pick(game, 2, '9s') });
    });

    it('チーは上家の打牌だけ。筋の食い替えもできない', () => {
        const game = fresh();
        arrange(game, { hands: [`${JUNK.a}3m`, '456m78p34s1234z99s', '145m78p34s1234z99m', JUNK.b], turn: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3m') });
        expect(game.optionsFor(1).chi.length).toBe(1);
        expect(game.optionsFor(2)).toBe(null);
        act(game, 1, { type: 'chi', tiles: game.optionsFor(1).chi[0] });
        expect(game.applyCommand(1, { type: 'discard', tile: pick(game, 1, '6m') })).toBe(false);
        act(game, 1, { type: 'discard', tile: pick(game, 1, '9s') });
    });

    it('ポンとチーが重なったらポンを優先する', () => {
        const game = fresh();
        arrange(game, { hands: [`${JUNK.a}3m`, '145m78p34s1234z99s', '133m78p34s1234z99m', JUNK.b], turn: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3m') });
        act(game, 1, { type: 'chi', tiles: game.optionsFor(1).chi[0] });
        act(game, 2, { type: 'pon', tiles: game.optionsFor(2).pon[0] });
        expect(game.h.turn).toBe(2);
        expect(game.h.melds[1]).toEqual([]);
    });

    it('暗槓で嶺上牌をツモり、新しいドラが増える', () => {
        const game = fresh();
        arrange(game, { hands: [`${JUNK.b.replace('567z', '')}5555z`, JUNK.a, JUNK.c, '258m258p258s1234z'], turn: 0 });
        expect(game.optionsFor(0).kans).toEqual([31]);
        const wall = game.h.wall.length;
        act(game, 0, { type: 'kan', kind: 31 });
        expect(game.h.melds[0][0].type).toBe('ankan');
        expect(game.doraIndicators().length).toBe(2);
        expect(game.h.hands[0].length).toBe(11);
        expect(game.h.wall.length).toBe(wall - 1);
        expect(game.h.afterKan).toBe(true);
    });
});

describe('フリテン', () => {
    it('自分の捨て牌に待ちがあるとロンできない（チーはできる）', () => {
        const game = fresh();
        arrange(game, { hands: [`${JUNK.a}3s`, PINFU, JUNK.b, JUNK.c], turn: 0 });
        game.h.discards[1].push({ tile: tile('6s'), riichi: false, called: false, tsumogiri: false });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3s') });
        expect(game.optionsFor(1)).toMatchObject({ ron: false });
        expect(game.optionsFor(1).chi.length).toBeGreaterThan(0);
    });

    it('見逃すと、自分が次に捨てるまでロンできない', () => {
        const game = fresh();
        arrange(game, {
            hands: [`${JUNK.a}3s`, JUNK.b, JUNK.c, PINFU], turn: 0, draws: '6s9m9m'
        });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3s') });
        act(game, 3, { type: 'pass' });
        expect(game.h.tempFuriten[3]).toBe(true);
        act(game, 1, { type: 'discard', tile: game.h.drawn }); // 6索
        expect(game.phase).toBe('turn');
        expect(game.h.turn).toBe(2);
        act(game, 2, { type: 'discard', tile: game.h.drawn });
        act(game, 3, { type: 'discard', tile: game.h.drawn });
        expect(game.h.tempFuriten[3]).toBe(false);
    });

    it('立直のあとに見逃すと、その局はずっとロンできない', () => {
        const game = fresh();
        arrange(game, { hands: [`${JUNK.a}3s`, JUNK.b, JUNK.c, PINFU], turn: 0 });
        game.h.riichi[3] = 1;
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3s') });
        act(game, 3, { type: 'pass' });
        expect(game.h.riichiFuriten[3]).toBe(true);
        expect(game.isFuriten(3)).toBe(true);
    });
});

describe('立直', () => {
    it('テンパイになる牌でだけ立直でき、千点を供託する。立直のあとはツモった牌しか捨てられない', () => {
        const game = fresh();
        arrange(game, { hands: [`${PINFU}9m`, JUNK.a, JUNK.b, JUNK.c], turn: 0, draws: '1z2z3z1m' });
        const opts = game.optionsFor(0);
        expect(opts.riichi).toEqual([pick(game, 0, '9m')]);
        expect(game.applyCommand(0, { type: 'discard', tile: pick(game, 0, '2m'), riichi: true })).toBe(false);
        act(game, 0, { type: 'discard', tile: pick(game, 0, '9m'), riichi: true });
        expect(game.h.riichi[0]).toBe(1);
        expect(game.players[0].score).toBe(24000);
        expect(game.round.kyotaku).toBe(1);
        expect(game.h.ippatsu[0]).toBe(true);
        [1, 2, 3].forEach(s => act(game, s, { type: 'discard', tile: game.h.drawn }));
        expect(game.optionsFor(0).discards).toEqual([game.h.drawn]);
        expect(game.applyCommand(0, { type: 'discard', tile: pick(game, 0, '2m') })).toBe(false);
        act(game, 0, { type: 'discard', tile: game.h.drawn });
        expect(game.h.ippatsu[0]).toBe(false);
    });

    it('宣言牌でロンされたら立直は成立せず、供託も出さない', () => {
        const game = fresh();
        arrange(game, { hands: [`234m567p678s22p99s3s`, '234m567p45s678s22s', JUNK.b, JUNK.c], turn: 0 });
        expect(game.optionsFor(0).riichi).toContain(pick(game, 0, '3s'));
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3s'), riichi: true });
        act(game, 1, { type: 'ron' });
        expect(game.h.riichi[0]).toBe(0);
        expect(game.result.sticks).toBe(0);
        expect(game.players[0].score).toBe(25000 - 2000);
    });

    it('一発ツモで裏ドラも数える', () => {
        const game = fresh();
        arrange(game, { hands: [`${PINFU}9m`, JUNK.a, JUNK.b, JUNK.c], turn: 0, draws: '1z2z3z6s', ura: '1p' });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '9m'), riichi: true });
        [1, 2, 3].forEach(s => act(game, s, { type: 'discard', tile: game.h.drawn }));
        act(game, 0, { type: 'tsumo' });
        const names = game.result.wins[0].yaku.map(y => y.name);
        expect(names).toEqual(expect.arrayContaining(['立直', '一発', '門前清自摸和', '平和', '断幺九', '裏ドラ']));
        expect(game.result.uraIndicators.length).toBe(1);
    });
});

describe('流局と連荘', () => {
    it('荒牌流局：1人テンパイなら +3000 / -1000。親がテンパイなら連荘して本場が増える', () => {
        const game = fresh();
        arrange(game, { hands: [`${PINFU}7z`, JUNK.a, JUNK.b, JUNK.c], turn: 0, wallSize: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '7z') });
        expect(game.result).toMatchObject({ type: 'draw', reason: 'exhaust', tenpai: [true, false, false, false] });
        expect(game.result.deltas).toEqual([3000, -1000, -1000, -1000]);
        ackAll(game);
        expect(game.round).toMatchObject({ wind: 0, kyoku: 0, honba: 1 });
        expect(game.dealer).toBe(0);
    });

    it('手の中で4枚使っている牌だけを待つ形はノーテン。その形での立直もできない', () => {
        const game = fresh();
        arrange(game, { hands: ['2222m345p678s123s7z', JUNK.a, '147m147p258s2346z', JUNK.c], turn: 0, wallSize: 4 });
        expect(game.optionsFor(0).riichi).not.toContain(pick(game, 0, '7z'));
        game.h.wall = [];
        act(game, 0, { type: 'discard', tile: pick(game, 0, '7z') });
        expect(game.result.tenpai[0]).toBe(false);
    });

    it('親がノーテンなら親が流れる。供託は次の局に残る', () => {
        const game = fresh({ kyotaku: 1 });
        arrange(game, { hands: [`${JUNK.a}7z`, PINFU, JUNK.b, JUNK.c], turn: 0, wallSize: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '7z') });
        expect(game.result.deltas).toEqual([-1000, 3000, -1000, -1000]);
        ackAll(game);
        expect(game.round).toMatchObject({ kyoku: 1, honba: 1, kyotaku: 1 });
        expect(game.dealer).toBe(1);
    });

    it('子が和了すると親が流れ、本場は0に戻る', () => {
        const game = fresh({ honba: 2 });
        arrange(game, { hands: [JUNK.a, `${PINFU}6s`, JUNK.b, JUNK.c], turn: 1 });
        act(game, 1, { type: 'tsumo' });
        ackAll(game);
        expect(game.round).toMatchObject({ kyoku: 1, honba: 0 });
    });

    it('四風連打は途中流局', () => {
        const game = fresh();
        arrange(game, { hands: ['22m66m88p44s77s56z9m1z', '33m77m99p3p6s8s2345z', '258m258p258s2346z', '147m147p147s2347z'], turn: 0, draws: '1z1z1z' });
        game.h.noCalls = true;
        game.h.discardCount = [0, 0, 0, 0];
        act(game, 0, { type: 'discard', tile: pick(game, 0, '1z') });
        [1, 2, 3].forEach(s => act(game, s, { type: 'discard', tile: game.h.drawn }));
        expect(game.result).toMatchObject({ type: 'draw', reason: 'suufon' });
    });
});

describe('終局', () => {
    const exhaustWithNoTenpai = (game, dealer) => {
        arrange(game, { hands: [JUNK.a, JUNK.b, JUNK.c, '258m258p258s1234z'].map((h, i) => (i === dealer ? `${h}9m` : h)), turn: dealer, wallSize: 0 });
        act(game, dealer, { type: 'discard', tile: pick(game, dealer, '9m') });
        passAll(game);
        ackAll(game);
    };

    it('東風戦は、東4局で親が流れて3万点以上の人がいれば終わる', () => {
        const game = fresh({ kyoku: 3, scores: [40000, 20000, 20000, 20000] });
        exhaustWithNoTenpai(game, 0);
        expect(game.isOver()).toBe(true);
        expect(game.final[0]).toMatchObject({ seat: 0, rank: 1, score: 40000 });
    });

    it('だれも3万点に届かなければ、次の風に入る（延長）', () => {
        const game = fresh({ kyoku: 3 });
        exhaustWithNoTenpai(game, 0);
        expect(game.isOver()).toBe(false);
        expect(game.round).toMatchObject({ wind: 1, kyoku: 0 });
    });

    it('0点未満になった人がいれば終わる。残った供託はトップへ', () => {
        const game = fresh({ scores: [500, 39500, 30000, 30000], kyotaku: 0 });
        arrange(game, { hands: [`${JUNK.a}3s`, PINFU, JUNK.b, JUNK.c], turn: 0 });
        act(game, 0, { type: 'discard', tile: pick(game, 0, '3s') });
        act(game, 1, { type: 'ron' });
        ackAll(game);
        expect(game.isOver()).toBe(true);
        expect(game.final.map(f => f.seat)).toEqual([1, 2, 3, 0]);
    });

    it('オーラスの親が和了してトップなら終わる（和了止め）', () => {
        const game = fresh({ kyoku: 3, scores: [32000, 23000, 23000, 22000] });
        arrange(game, { hands: [`${PINFU}6s`, JUNK.a, JUNK.b, JUNK.c], turn: 0 });
        act(game, 0, { type: 'tsumo' });
        ackAll(game);
        expect(game.isOver()).toBe(true);
    });

    it('同点は起家に近い順', () => {
        const game = fresh({ scores: [25000, 25000, 25000, 25000] });
        expect(game.standings()).toEqual([0, 1, 2, 3]);
    });
});

describe('CPU', () => {
    it('CPU だけの対局が、シードを変えても最後まで終わり、点数の合計は10万点', () => {
        for (let seed = 1; seed <= 6; seed++) {
            const game = new Game(players(true), { seed, length: seed % 2 ? 'east' : 'south' });
            let steps = 0;
            while (!game.isOver() && steps++ < 40000) expect(runCpuStep(game, cpuActors(game)[0])).toBe(true);
            expect(game.isOver()).toBe(true);
            expect(game.players.reduce((s, p) => s + p.score, 0)).toBe(100000);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('人の番では止まる', () => {
        const game = new Game([{ name: 'あなた' }, ...players(true).slice(1)], { seed: 5 });
        let steps = 0;
        while (cpuActors(game).length && steps++ < 5000) runCpuStep(game, cpuActors(game)[0]);
        expect(game.actors()).toContain(0);
    });
});

describe('ビュー', () => {
    it('ほかの人の手牌と牌山は見せない', () => {
        const game = makeGame(4);
        const view = createGameView(game, 0);
        expect(view.players[0].hand.length).toBeGreaterThan(0);
        [1, 2, 3].forEach(s => {
            expect(view.players[s].hand).toBe(null);
            expect(view.players[s].drawn).toBe(null);
        });
        const text = JSON.stringify(view);
        expect(text).not.toContain('"wall"');
        expect(text).not.toContain('"dead"');
        expect(view.doraIndicators.length).toBe(1);
    });
});
