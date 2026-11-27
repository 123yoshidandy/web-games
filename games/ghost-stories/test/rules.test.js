import { describe, it, expect } from 'vitest';
import Game, { planExorcism } from '../public/js/game.js';
import { LEVELS, GHOSTS, FACING, LINES, MAX_QI, BLACK } from '../public/js/data.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { makeGame, players, ghost, yangOf, put, tileOf, snapshot, stepSimple } from './helpers.js';

const totalCards = (g) => g.deck.length + g.discard.length + g.queue.length + g.slots.filter(Boolean).length;

describe('準備', () => {
    it.each(Object.keys(LEVELS))('難易度 %s：僧は4人で真ん中から。気と札、山の枚数と魔王の位置が決まりどおり', (level) => {
        const game = makeGame({ level, seed: 3 });
        const spec = LEVELS[level];
        expect(game.players).toHaveLength(4);
        game.players.forEach((p, i) => {
            expect(p.tile).toBe(4);
            expect(p.qi).toBeLessThanOrEqual(spec.qi);
            expect(p.tao[i]).toBeLessThanOrEqual(spec.tao.own);
        });
        expect(totalCards(game)).toBe(spec.deck + 1);
        expect(game.deck.indexOf(game.incarnation)).toBe(spec.below);
        expect(GHOSTS[game.incarnation].incarnation).toBe(true);
    });

    it('人の数が4人より少なければ、残りの僧は CPU になる', () => {
        const game = new Game(players(1), { seed: 1 });
        expect(game.players.map(p => p.isCPU)).toEqual([false, true, true, true]);
    });

    it('最初の手番は陰の段階から始まり、幽霊が1体来る', () => {
        const game = makeGame({ seed: 5 });
        expect(game.slots.filter(Boolean).length + game.queue.length + game.discard.length).toBeGreaterThanOrEqual(1);
        expect(['place', 'yang']).toContain(game.phase);
    });

    it('同じシードなら同じ並び、違うシードなら違う並び', () => {
        expect(snapshot(makeGame({ seed: 9 }))).toBe(snapshot(makeGame({ seed: 9 })));
        expect(makeGame({ seed: 9 }).deck).not.toEqual(makeGame({ seed: 10 }).deck);
    });
});

describe('盤の形', () => {
    it('角のタイルは2つ、辺は1つの置き場に向き、真ん中はどこにも向かない', () => {
        expect(FACING.map(f => f.length)).toEqual([2, 1, 2, 1, 0, 1, 2, 1, 2]);
        expect(FACING[6].sort()).toEqual([0, 5]);
        expect(LINES[0]).toEqual([6, 3, 0]);
    });
});

describe('幽霊が来る', () => {
    it('色の幽霊はその色のボードに、置き場を選んで置く', () => {
        const game = yangOf(makeGame(), 3);
        const id = ghost('木霊'); // 緑 → 僧2のボード
        game.queue = [id];
        game.queueThen = 'yang';
        game.processQueue();
        expect(game.phase).toBe('place');
        expect(game.placeOptions(id)).toEqual([6, 7, 8]);
        expect(game.applyCommand(3, { type: 'place', slot: 7 })).toBe(true);
        expect(game.slots[7].card).toBe(id);
        expect(game.phase).toBe('yang');
    });

    it('黒い幽霊は手番の僧のボードに。埋まっていれば、どこかの空きへ', () => {
        const game = yangOf(makeGame(), 1);
        expect(game.placeOptions(ghost('影法師'))).toEqual([3, 4, 5]);
        put(game, 3, '鬼火');
        put(game, 4, '鬼火');
        put(game, 5, '鬼火');
        expect(game.placeOptions(ghost('影法師'))).toHaveLength(9);
    });

    it('置ける場所が1つだけなら、自動で置く', () => {
        const game = yangOf(makeGame(), 0);
        put(game, 0, '砂かけ');
        put(game, 1, '砂かけ');
        game.queue = [ghost('鬼火')];
        game.queueThen = 'yang';
        game.processQueue();
        expect(game.slots[2].card).toBe(ghost('鬼火'));
        expect(game.phase).toBe('yang');
    });

    it('どこにも置けなければ、手番の僧が気を1つ失い、幽霊は山の底へ', () => {
        const game = yangOf(makeGame(), 0);
        for (let s = 0; s < 12; s++) put(game, s, '砂かけ');
        const qi = game.players[0].qi;
        const id = ghost('鬼火');
        game.queue = [id];
        game.queueThen = 'yang';
        game.processQueue();
        expect(game.players[0].qi).toBe(qi - 1);
        expect(game.deck[0]).toBe(id);
    });

    it('来たときに仲間を呼ぶ幽霊は、山からもう1体引く', () => {
        const game = yangOf(makeGame(), 0);
        const before = game.deck.length;
        game.placeGhost(ghost('火吹き童子') + 5, 0); // 赤の6番目（仲間を呼ぶ）
        expect(GHOSTS[game.slots[0].card].arrive).toContain('summon');
        expect(game.deck.length).toBe(before - 1);
        expect(game.queue).toHaveLength(1);
    });

    it('仏像の置き場に来たふつうの幽霊は、すぐに祓われ、仏像は仏堂へ戻る', () => {
        const game = yangOf(makeGame(), 0);
        game.buddhaAt[1] = true;
        game.temple = 1;
        game.placeGhost(ghost('鬼火'), 1);
        expect(game.slots[1]).toBe(null);
        expect(game.buddhaAt[1]).toBe(false);
        expect(game.temple).toBe(2);
    });
});

describe('陰の段階', () => {
    it('憑き手は前のタイルへ出て、次の陰でそのタイルを呪い、札へ戻る', () => {
        const game = yangOf(makeGame(), 0);
        put(game, 0, '火吹き童子');
        game.advanceHaunter(0);
        expect(game.slots[0].haunter).toBe(6);
        expect(game.tiles[6].haunted).toBe(false);
        game.advanceHaunter(0);
        expect(game.tiles[6].haunted).toBe(true);
        expect(game.slots[0].haunter).toBe(-1);
        game.advanceHaunter(0);
        expect(game.slots[0].haunter).toBe(3);
    });

    it('呪われたタイルが3枚になると負け', () => {
        const game = yangOf(makeGame(), 0);
        game.haunt(0, 'テスト');
        game.haunt(1, 'テスト');
        expect(game.isOver()).toBe(false);
        game.haunt(2, 'テスト');
        expect(game.result).toEqual({ won: false, reason: 'haunted' });
        expect(game.actors()).toEqual([]);
    });

    it('手番の僧のボードが埋まっていれば、陰の段階で気を1つ失う', () => {
        const game = yangOf(makeGame(), 3);
        put(game, 0, '鬼火');
        put(game, 1, '火車');
        put(game, 2, '砂かけ');
        expect(game.applyCommand(3, { type: 'pass' })).toBe(true);
        expect(game.logs.some(l => l.text.includes('ボードが幽霊で埋まっていた'))).toBe(true);
        expect(game.players[0].qi).toBeLessThan(4);
    });

    it('呪いのダイスの「前のタイル」で、置き場の前の呪われていないタイルが呪われる', () => {
        const game = yangOf(makeGame(), 0);
        put(game, 1, '赤面');
        game.random = () => 4.5 / 6;
        game.curse(1);
        expect(game.tiles[7].haunted).toBe(true);
    });

    it('呪いのダイスの「札を失う」で、手番の僧の札がなくなる', () => {
        const game = yangOf(makeGame(), 0);
        put(game, 1, '赤面');
        game.players[0].tao = [2, 1, 0, 0, 1];
        game.random = () => 3.5 / 6;
        game.curse(1);
        expect(game.players[0].tao).toEqual([0, 0, 0, 0, 0]);
    });

    it('気がなくなった僧は倒れ、全員が倒れると負け', () => {
        const game = yangOf(makeGame(), 0);
        game.players.forEach(p => { p.qi = 1; });
        game.players[0].buddhas = 1;
        game.temple = 1;
        game.loseQi(game.players[0], 1, 'テスト');
        expect(game.players[0].alive).toBe(false);
        expect(game.temple).toBe(2);
        [1, 2, 3].forEach(i => game.loseQi(game.players[i], 1, 'テスト'));
        expect(game.result).toEqual({ won: false, reason: 'dead' });
    });

    it('引く幽霊が尽きると負け（魔王の化身が残っている）', () => {
        const game = yangOf(makeGame(), 0);
        game.deck = [];
        expect(game.applyCommand(0, { type: 'pass' })).toBe(true);
        expect(game.result).toEqual({ won: false, reason: 'deck' });
    });

    it('倒れた僧の番は、陰の段階だけで次へ進む', () => {
        const game = yangOf(makeGame(), 0);
        game.players[1].alive = false;
        game.players[1].qi = 0;
        game.deck.push(ghost('砂かけ')); // 黄 → 僧1のボード
        game.applyCommand(0, { type: 'pass' });
        if (game.phase === 'place') stepSimple(game);
        expect(game.current).toBe(2);
    });
});

describe('陽の段階', () => {
    it('となり（斜めも）へ動ける。離れたタイルへは動けない（赤の僧の峰渡りを除く）', () => {
        const game = yangOf(makeGame(), 1);
        game.players[1].tile = 0;
        expect(game.applyCommand(1, { type: 'move', to: 8 })).toBe(false);
        expect(game.applyCommand(1, { type: 'move', to: 4 })).toBe(true);
        expect(game.applyCommand(1, { type: 'move', to: 3 })).toBe(false); // 1手番に1回
        const red = yangOf(makeGame(), 0);
        red.players[0].tile = 0;
        expect(red.applyCommand(0, { type: 'move', to: 8 })).toBe(true);
    });

    it('出目と札で、向かいの幽霊を祓い、ごほうびを得る', () => {
        const game = yangOf(makeGame(), 1);
        game.players[1].tile = 6;
        put(game, 0, '鬼火');   // 赤・抵抗1・ごほうび赤の札
        put(game, 5, '砂かけ'); // 黄・抵抗1
        expect(game.applyCommand(1, { type: 'exorcise' })).toBe(true);
        expect(game.phase).toBe('exorcise');
        game.dice = [0, 1, 3];
        const before = [...game.players[1].tao];
        expect(game.applyCommand(1, { type: 'assign', targets: [0, 5] })).toBe(true);
        expect(game.slots[0]).toBe(null);
        expect(game.slots[5]).toBe(null);
        expect(game.players[1].tao[0]).toBe(before[0] + 1);
        expect(game.players[1].tao[1]).toBe(before[1] + 1);
        expect(game.current).toBe(2);
    });

    it('出目が足りなければ札で補う。足りなければ断られ、何も変わらない', () => {
        const game = yangOf(makeGame(), 1);
        game.players[1].tile = 7;
        put(game, 1, '火車'); // 赤・抵抗2
        game.applyCommand(1, { type: 'exorcise' });
        game.dice = [0, 3, 3];
        game.players[1].tao = [0, 0, 0, 0, 0];
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'assign', targets: [1] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        game.players[1].tao = [1, 0, 0, 0, 0];
        expect(game.applyCommand(1, { type: 'assign', targets: [1] })).toBe(true);
        expect(game.players[1].tao[0]).toBe(1); // 祓ったごほうびの赤の札
        expect(game.slots[1]).toBe(null);
    });

    it('除霊をあきらめることもできる（空の組）', () => {
        const game = yangOf(makeGame(), 1);
        game.players[1].tile = 7;
        put(game, 1, '火車');
        game.applyCommand(1, { type: 'exorcise' });
        expect(game.applyCommand(1, { type: 'assign', targets: [] })).toBe(true);
        expect(game.slots[1]).not.toBe(null);
    });

    it('除霊の札の使い方：白は札の足りない色に回し、余った白で札を節約する', () => {
        expect(planExorcism([2, 0, 0, 0, 0], [0, 5, 3], [0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0]);
        expect(planExorcism([2, 0, 0, 0, 0], [0, 3, 3], [0, 0, 0, 0, 0])).toBe(null);
        expect(planExorcism([0, 0, 0, 0, 3], [4, 5, 1], [0, 0, 0, 0, 1])).toEqual([0, 0, 0, 0, 1]);
        expect(planExorcism([1, 0, 0, 0, 2], [5, 2, 2], [1, 0, 0, 0, 1])).toEqual([1, 0, 0, 0, 1]);
        expect(planExorcism([1, 0, 0, 0, 1], [5, 2, 2], [1, 0, 0, 0, 1])).toEqual([1, 0, 0, 0, 0]); // 黒の札を残す
    });

    it('祈りの輪の色と真言は、抵抗を1ずつ下げる（1より下にはならない）', () => {
        const game = yangOf(makeGame(), 3);
        const slot = 1;
        put(game, slot, '焔の大鬼'); // 赤・抵抗3
        expect(game.resistance(slot)).toBe(3);
        game.prayer = 0;
        expect(game.resistance(slot)).toBe(2);
        expect(game.applyCommand(3, { type: 'mantra', slot })).toBe(true);
        expect(game.resistance(slot)).toBe(1);
        game.tiles[tileOf(game, 'prayer')].haunted = true;
        expect(game.resistance(slot)).toBe(2);
    });

    it('真言は青の僧だけが使え、置いた幽霊が祓われると戻る', () => {
        const game = yangOf(makeGame(), 0);
        put(game, 1, '火車');
        expect(game.applyCommand(0, { type: 'mantra', slot: 1 })).toBe(false);
        game.mantraAt = 1;
        game.removeGhost(1);
        expect(game.mantraAt).toBe(null);
    });

    it('ダイスを奪う幽霊がいると、振るダイスが減る。緑の僧は1つ多く振る', () => {
        const game = yangOf(makeGame(), 1);
        expect(game.diceCount(1)).toBe(3);
        expect(game.diceCount(2)).toBe(4);
        put(game, 9, '青坊主'); // 青の5番目（ダイスを奪う）
        expect(GHOSTS[game.slots[9].card].arrive).toContain('capture');
        expect(game.diceCount(1)).toBe(2);
    });

    it('力を封じる幽霊がボードにいると、その僧の力は使えない', () => {
        const game = yangOf(makeGame(), 0);
        game.players[0].tile = 0;
        put(game, 1, GHOSTS.find(g => g.arrive.includes('block')).id);
        expect(game.powerActive(0)).toBe(false);
        expect(game.applyCommand(0, { type: 'move', to: 8 })).toBe(false);
    });

    it('魔王の化身を祓えば勝ち', () => {
        const game = yangOf(makeGame(), 1);
        game.players[1].tile = 6;
        put(game, 0, game.incarnation);
        game.applyCommand(1, { type: 'exorcise' });
        game.dice = [4, 4, 5];
        game.players[1].tao[BLACK] = 1;
        expect(game.applyCommand(1, { type: 'assign', targets: [0] })).toBe(true);
        expect(game.result).toEqual({ won: true, reason: 'wufeng' });
    });

    it('仏像を受け取り、自分のタイルに向いた空きの場所に置ける', () => {
        const game = yangOf(makeGame(), 1);
        game.players[1].tile = tileOf(game, 'temple');
        game.applyCommand(1, { type: 'help' });
        expect(game.players[1].buddhas).toBe(1);
        expect(game.temple).toBe(1);
        const g2 = yangOf(game, 1);
        g2.players[1].tile = 6;
        expect(g2.applyCommand(1, { type: 'buddha', slot: 2 })).toBe(false);
        expect(g2.applyCommand(1, { type: 'buddha', slot: 5 })).toBe(true);
        expect(g2.buddhaAt[5]).toBe(true);
    });
});

describe('村人の力', () => {
    const at = (key, seat = 1, setup = () => {}) => {
        const game = yangOf(makeGame(), seat);
        game.players[seat].tile = tileOf(game, key);
        setup(game);
        return game;
    };

    it('茶屋：気を1つ回復し、好きな色の札を得る。黄の僧は札をもう1枚', () => {
        const game = at('tea', 2, g => { g.players[2].qi = 2; });
        expect(game.applyCommand(2, { type: 'help' })).toBe(false); // 色が要る
        expect(game.applyCommand(2, { type: 'help', color: BLACK })).toBe(true);
        expect(game.players[2].qi).toBe(3);
        expect(game.players[2].tao[BLACK]).toBe(1);
        const yellow = at('tea', 1);
        const before = yellow.players[1].tao.reduce((a, b) => a + b, 0);
        yellow.applyCommand(1, { type: 'help', color: 0, bonus: 3 });
        expect(yellow.players[1].tao.reduce((a, b) => a + b, 0)).toBe(before + 2);
        expect(yellow.players[1].qi).toBe(MAX_QI);
    });

    it('薬草屋：ダイスを2つ振り、札を2枚得る', () => {
        const game = at('herb', 2);
        const before = game.players[2].tao.reduce((a, b) => a + b, 0);
        game.applyCommand(2, { type: 'help' });
        expect(game.players[2].tao.reduce((a, b) => a + b, 0)).toBe(before + 2);
    });

    it('呪術師の庵：気を1つ払って、どこかの幽霊を祓う（魔王の化身は祓えない）', () => {
        const game = at('sorcerer', 2);
        put(game, 10, '牛鬼');
        put(game, 11, game.incarnation);
        expect(game.applyCommand(2, { type: 'help', slot: 11 })).toBe(false);
        expect(game.applyCommand(2, { type: 'help', slot: 10 })).toBe(true);
        expect(game.slots[10]).toBe(null);
        expect(game.players[2].qi).toBe(3);
    });

    it('番所：呪われたタイルを戻す。呪われたタイルでは力を借りられない', () => {
        const game = at('watch', 2);
        const other = (tileOf(game, 'watch') + 1) % 9;
        game.tiles[other].haunted = true;
        expect(game.applyCommand(2, { type: 'help', tile: other })).toBe(true);
        expect(game.tiles[other].haunted).toBe(false);
        const blocked = at('tea', 2, g => { g.tiles[tileOf(g, 'tea')].haunted = true; });
        expect(blocked.applyCommand(2, { type: 'help', color: 0 })).toBe(false);
    });

    it('墓所：倒れた僧を気2つで呼び戻す', () => {
        const game = at('cemetery', 2, g => { g.players[0].alive = false; g.players[0].qi = 0; });
        expect(game.applyCommand(2, { type: 'help', monk: 1 })).toBe(false);
        expect(game.applyCommand(2, { type: 'help', monk: 0 })).toBe(true);
        expect(game.players[0]).toMatchObject({ alive: true, qi: 2, tile: tileOf(game, 'cemetery') });
    });

    it('祭壇：山の上の幽霊を祓う', () => {
        const game = at('altar', 2);
        const top = game.deck.at(-1);
        game.applyCommand(2, { type: 'help' });
        expect(game.discard).toContain(top);
    });

    it('祈りの輪：色を選ぶ。風の楼閣：僧をどこへでも動かす', () => {
        const game = at('prayer', 2);
        game.applyCommand(2, { type: 'help', color: BLACK });
        expect(game.prayer).toBe(BLACK);
        const pav = at('pavilion', 2);
        expect(pav.applyCommand(2, { type: 'help', monk: 0, to: 8 })).toBe(true);
        expect(pav.players[0].tile).toBe(8);
    });
});

describe('断る操作', () => {
    it('手番でない人の操作や、決まりに合わない操作は断られ、状態は変わらない', () => {
        const game = yangOf(makeGame(), 1);
        put(game, 1, '火車');
        const before = snapshot(game);
        const bad = [
            [0, { type: 'pass' }], [1, { type: 'move', to: 99 }], [1, { type: 'assign', targets: [1] }], [1, { type: 'place', slot: 0 }],
            [1, { type: 'exorcise' }], [1, { type: 'buddha', slot: 1 }], [1, { type: 'nope' }], [1, null], [1, 'pass'], ['1', { type: 'pass' }]
        ];
        bad.forEach(([seat, command]) => expect(game.applyCommand(seat, command), JSON.stringify(command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録には決まった項目だけが残る', () => {
        const game = yangOf(makeGame(), 1);
        game.applyCommand(1, { type: 'move', to: 3, extra: 'x'.repeat(50) });
        expect(game.commands.at(-1).command).toEqual({ type: 'move', to: 3 });
    });
});

describe('記録からの再現', () => {
    const play = (seed, level) => {
        const game = new Game(players(4, true), { seed, level });
        let steps = 0;
        while (!game.isOver() && steps++ < 4000) runCpuStep(game);
        return game;
    };

    it.each([[1, 'initiation'], [2, 'normal'], [3, 'nightmare']])('記録から同じ局面になる（シード %i・%s）', (seed, level) => {
        const game = play(seed, level);
        expect(game.isOver()).toBe(true);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('途中の記録からも同じ局面になる', () => {
        const game = new Game(players(2), { seed: 11 });
        for (let i = 0; i < 25 && !game.isOver(); i++) stepSimple(game);
        const saved = game.persist();
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('記録と合わない操作があれば、再現はエラーになる', () => {
        const game = makeGame({ seed: 4 });
        const saved = game.persist();
        expect(() => Game.replay(saved.players, saved.options, [{ seat: 3, command: { type: 'pass' } }])).toThrow();
    });
});
