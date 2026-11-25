import { describe, it, expect } from 'vitest';
import Game, { leftOf } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { countSpecies, dinoCount } from '../public/js/park.js';
import { SPECIES_KEYS, ZONES, ENCLOSURES } from '../public/js/dinos.js';
import { runCpuRound } from '../public/js/cpu-player.js';
import { players, park, setupGame, snapshot } from './helpers.js';

// 全員が、置ける場所の先頭に、手の先頭の恐竜を置く
function playTurn(game) {
    game.players.forEach(p => {
        const dino = game.hands[p.id][0];
        expect(game.applyCommand(p.id, { type: 'place', dino, zone: game.zonesFor(p.id, dino)[0] }), game.lastError).toBe(true);
    });
}

describe('ゲームの準備', () => {
    it('2〜5 人。袋は人数で変わり（5 人 60・4 人 48・3 人 36・2 人 48 匹）、全員が 6 匹を取る', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(6))).toThrow();
        const perSpecies = { 2: 8, 3: 6, 4: 8, 5: 10 };
        for (let n = 2; n <= 5; n++) {
            const game = new Game(players(n), { seed: n });
            expect(game.hands.every(h => h.length === 6)).toBe(true);
            const all = [...game.bag, ...game.hands.flat()];
            expect(all.length).toBe(perSpecies[n] * 6);
            SPECIES_KEYS.forEach(s => expect(all.filter(d => d === s).length).toBe(perSpecies[n]));
        }
    });

    it('同じシードなら、同じ手とダイス', () => {
        expect(snapshot(new Game(players(4), { seed: 42 }))).toBe(snapshot(new Game(players(4), { seed: 42 })));
        expect(snapshot(new Game(players(4), { seed: 42 }))).not.toBe(snapshot(new Game(players(4), { seed: 43 })));
    });
});

describe('手番', () => {
    it('全員が選ぶまで公開しない。そろったら置いて、残りを左へ渡す', () => {
        const game = new Game(players(3), { seed: 5 });
        const hands = game.hands.map(h => [...h]);
        const d0 = hands[0][0];
        expect(game.applyCommand(0, { type: 'place', dino: d0, zone: 'river' })).toBe(true);
        expect(game.parks[0].river).toEqual([]);
        expect(game.applyCommand(0, { type: 'place', dino: hands[0][1], zone: 'river' })).toBe(false);
        expect(game.lastError).toBe('もう選んでいます');
        game.applyCommand(1, { type: 'place', dino: hands[1][0], zone: 'river' });
        game.applyCommand(2, { type: 'place', dino: hands[2][0], zone: 'river' });
        expect(game.parks[0].river).toEqual([d0]);
        expect(game.turn).toBe(2);
        // 1 ラウンド目は左（席の番号が 1 つ増える向き）へ渡す
        expect(game.hands[leftOf(0, 3)]).toEqual(hands[0].slice(1));
        expect(game.hands[1]).toEqual(hands[0].slice(1));
    });

    it('2 ラウンド目も左へ渡す。ダイスは手番ごとに左の人へ移る', () => {
        const game = new Game(players(4), { seed: 8 });
        const rollers = [game.roller];
        for (let t = 0; t < 6; t++) {
            playTurn(game);
            rollers.push(game.roller);
        }
        expect(game.round).toBe(2);
        rollers.slice(1).forEach((r, i) => expect(r).toBe(leftOf(rollers[i], 4)));
        const hands = game.hands.map(h => [...h]);
        playTurn(game);
        expect(game.hands[leftOf(0, 4)]).toEqual(hands[0].slice(1));
    });

    it('3〜5 人は 2 ラウンド × 6 手番で終わり、全員が 12 匹を置いて、袋は空になる', () => {
        for (let n = 3; n <= 5; n++) {
            const game = new Game(players(n), { seed: 3 });
            for (let i = 0; i < 12; i++) playTurn(game);
            expect(game.isOver()).toBe(true);
            game.parks.forEach(p => expect(dinoCount(p)).toBe(12));
            expect(game.bag.length).toBe(0);
            expect(game.scores.length).toBe(n);
        }
    });

    it('ダイスの決まりで置けない場所は断る。振った人は決まりを受けない', () => {
        const game = setupGame({ parks: [park(), park()], hands: ['tri stego', 'para spino'], die: 'woods', roller: 0 });
        const grassZone = ENCLOSURES.find(k => ZONES[k].area === 'grass');
        expect(game.applyCommand(1, { type: 'place', dino: 'para', zone: grassZone })).toBe(false);
        expect(game.lastError).toBe('そこには置けません');
        expect(game.applyCommand(0, { type: 'place', dino: 'tri', zone: grassZone })).toBe(true);
    });

    it('断る操作は状態を変えない', () => {
        const game = new Game(players(3), { seed: 11 });
        const before = snapshot(game);
        const bad = [
            null, {}, { type: 'pass' }, { type: 'place', dino: 'nothing', zone: 'river' },
            { type: 'place', dino: game.hands[0][0], zone: 'pool' }, { type: 'place', dino: game.hands[0][0] }
        ];
        bad.forEach(command => expect(game.applyCommand(0, command)).toBe(false));
        expect(game.applyCommand(9, { type: 'place', dino: game.hands[0][0], zone: 'river' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('操作の記録から、同じ状態を作り直せる', () => {
        const game = new Game(players(4), { seed: 21 });
        for (let i = 0; i < 12; i++) playTurn(game);
        const again = Game.replay(players(4), game.options, game.commands);
        expect(snapshot(again)).toBe(snapshot(game));
        expect(again.scores).toEqual(game.scores);
    });
});

describe('2 人のとき', () => {
    // 2 人とも、手の先頭を置ける場所の先頭に置き、手の先頭を箱に戻す
    function playTwo(game) {
        playTurn(game);
        if (game.phase !== 'discard') return;
        [0, 1].forEach(seat => expect(game.applyCommand(seat, { type: 'discard', dino: game.hands[seat][0] }), game.lastError).toBe(true));
    }

    it('置いて公開したあと、もう 1 匹を箱に戻し、残りの手を交換する', () => {
        const game = new Game(players(2), { seed: 6 });
        const hands = game.hands.map(h => [...h]);
        game.applyCommand(0, { type: 'place', dino: hands[0][0], zone: 'river' });
        game.applyCommand(1, { type: 'place', dino: hands[1][0], zone: 'river' });
        expect(game.phase).toBe('discard');
        expect(game.turn).toBe(1);
        // 箱に戻す番に、置くことはできない。置く番に、箱に戻すこともできない
        expect(game.applyCommand(0, { type: 'place', dino: hands[0][1], zone: 'river' })).toBe(false);
        expect(game.applyCommand(0, { type: 'discard', dino: 'nothing' })).toBe(false);
        expect(game.applyCommand(0, { type: 'discard', dino: hands[0][1] })).toBe(true);
        expect(game.phase).toBe('discard');
        // 相手のビューには、何を戻したかは入らない
        expect(createGameView(game, 1).myChoice).toBeNull();
        expect(createGameView(game, 1).discarding).toBe(true);
        expect(game.applyCommand(1, { type: 'discard', dino: hands[1][1] })).toBe(true);
        expect(game.phase).toBe('choose');
        expect(game.turn).toBe(2);
        expect(game.box).toHaveLength(2);
        expect(game.hands[1]).toEqual(hands[0].slice(2));
        expect(game.hands[0]).toEqual(hands[1].slice(2));
        expect(game.applyCommand(0, { type: 'discard', dino: game.hands[0][0] })).toBe(false);
    });

    it('4 ラウンド × 3 手番で、全員が 12 匹を置き、袋は空になる。ダイスは交互に振る', () => {
        const game = new Game(players(2), { seed: 12 });
        const rollers = [];
        let turns = 0;
        while (!game.isOver()) {
            rollers.push(game.roller);
            const round = game.round;
            playTwo(game);
            if (++turns > 20) throw new Error('終わらない');
            if (game.round !== round && !game.isOver()) expect(game.hands.every(h => h.length === 6)).toBe(true);
        }
        expect(turns).toBe(12);
        rollers.slice(1).forEach((r, i) => expect(r).not.toBe(rollers[i]));
        game.parks.forEach(p => expect(dinoCount(p)).toBe(12));
        expect(game.bag.length).toBe(0);
        expect(game.box).toHaveLength(24);
        expect(snapshot(Game.replay(players(2), game.options, game.commands))).toBe(snapshot(game));
    });

    it('CPU 同士でも最後まで進む', () => {
        const game = new Game(players(2).map(p => ({ ...p, isCPU: true })), { seed: 33 });
        let steps = 0;
        while (!game.isOver()) {
            expect(runCpuRound(game)).toBe(true);
            if (++steps > 40) throw new Error('終わらない');
        }
        game.parks.forEach(p => expect(dinoCount(p)).toBe(12));
    });
});

describe('順位', () => {
    it('同点なら、ティラノサウルスの少ない人が上。それも同じなら同じ順位', () => {
        const game = setupGame({ parks: [park({ river: 'trex tri' }), park({ river: 'tri stego' }), park({ river: 'tri trex' })], hands: ['', '', ''] });
        game.finish();
        const ranking = game.ranking();
        expect(ranking[0]).toMatchObject({ seat: 1, rank: 1 });
        expect(ranking.filter(r => r.rank === 2).map(r => r.seat).sort()).toEqual([0, 2]);
        expect(game.winners()).toEqual([1]);
        expect(countSpecies(game.parks[0], 'trex')).toBe(1);
    });
});

describe('ビュー', () => {
    it('ほかの人の手と、選んだ中身は入らない（数だけ）', () => {
        const game = new Game(players(3), { seed: 4 });
        game.applyCommand(1, { type: 'place', dino: game.hands[1][0], zone: 'river' });
        const view = createGameView(game, 0);
        const text = JSON.stringify(view);
        expect(view.hand).toEqual(game.hands[0]);
        expect(view.players[1]).toMatchObject({ handCount: 6, ready: true });
        expect(view.myChoice).toBeNull();
        expect(text).not.toContain('"hands"');
        expect(text).not.toContain('"bag"');
        expect(text).not.toContain('pending');
        // 選んだ本人には、中身が入る
        expect(createGameView(game, 1).myChoice).toMatchObject({ zone: 'river' });
    });

    it('置ける場所と、置いたときの点の増え方が入る', () => {
        const game = setupGame({ parks: [park({ forest: 'tri tri' }), park()], hands: ['tri stego', 'para'], die: 'woods', roller: 1 });
        const view = createGameView(game, 0);
        const tri = view.handOptions.find(o => o.dino === 'tri');
        expect(tri.zones.find(z => z.zone === 'forest').gain).toBe(4);
        expect(tri.zones.some(z => z.zone === 'river')).toBe(true);
        expect(view.exempt).toBe(false);
        expect(createGameView(game, 1).exempt).toBe(true);
    });
});
