import { describe, it, expect } from 'vitest';
import Game, { DRY, FLOODED, SUNK } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { TILES, FOOLS, TREASURE_DECK, LEVELS, FLOOD_RATES } from '../public/js/data.js';
import { makeGame, fixLayout, dryAll, place, setHand, snapshot, T } from './helpers.js';

// 島を固定し、全部乾かした2人のゲーム（役割を決める）
function board(roles = ['engineer', 'messenger'], options = {}) {
    const game = makeGame(roles.length, { roles, ...options });
    fixLayout(game);
    dryAll(game);
    return game;
}

describe('準備', () => {
    it('24枚の島、6か所の浸水、2枚ずつの手札（水位上昇は配らない）', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const game = makeGame(4, { seed });
            expect(game.tiles.filter(t => t === FLOODED)).toHaveLength(6);
            expect(game.floodDiscard).toHaveLength(6);
            expect(game.floodDeck).toHaveLength(18);
            expect(new Set(game.cellOf).size).toBe(24);
            game.players.forEach(p => {
                expect(p.hand).toHaveLength(2);
                expect(p.hand).not.toContain('rise');
            });
            expect(game.treasureDeck.length + 8).toBe(TREASURE_DECK.length);
        }
    });

    it('駒は役割の始まりの場所に置く', () => {
        const game = makeGame(4, { roles: ['pilot', 'engineer', 'diver', 'navigator'] });
        expect(game.players.map(p => TILES[p.tile].key)).toEqual(['fools', 'bronze', 'iron', 'gold']);
    });

    it('難易度で始まりの水位が決まる', () => {
        expect(Object.keys(LEVELS).map(level => makeGame(2, { level }).water)).toEqual([1, 2, 3, 4]);
        expect(makeGame(2, { level: 'elite' }).floodRate()).toBe(3);
        expect(FLOOD_RATES.slice(1, 10)).toEqual([2, 2, 3, 3, 3, 4, 4, 5, 5]);
    });

    it('同じシードなら同じ島と山になる', () => {
        expect(snapshot(makeGame(3, { seed: 9 }))).toBe(snapshot(makeGame(3, { seed: 9 })));
        expect(snapshot(makeGame(3, { seed: 9 }))).not.toBe(snapshot(makeGame(3, { seed: 10 })));
    });
});

describe('アクション', () => {
    it('移動は上下左右の沈んでいない場所。アクションを3回使うと引く段階へ', () => {
        const game = board();
        place(game, 0, 8);
        game.tiles[9] = SUNK;
        expect(game.moveTargets(0).sort((a, b) => a - b)).toEqual([3, 7, 14]);
        expect(game.applyCommand(0, { type: 'move', to: 9 })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', to: 15 })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', to: 3 })).toBe(true);
        expect(game.applyCommand(0, { type: 'move', to: 8 })).toBe(true);
        expect(game.applyCommand(0, { type: 'move', to: 7 })).toBe(true);
        expect(game.phase).toBe('draw');
    });

    it('探検家は斜めにも移動・補強できる', () => {
        const game = board(['explorer', 'engineer']);
        place(game, 0, 8);
        expect(game.moveTargets(0).sort((a, b) => a - b)).toEqual([2, 3, 4, 7, 9, 13, 14, 15]);
        game.tiles[15] = FLOODED;
        expect(game.applyCommand(0, { type: 'shore', tile: 15 })).toBe(true);
        expect(game.tiles[15]).toBe(DRY);
    });

    it('ダイバーは浸水・沈んだ場所を続けて抜けられる', () => {
        const game = board(['diver', 'engineer']);
        place(game, 0, 6);
        game.tiles[7] = FLOODED;
        game.tiles[8] = SUNK;
        // 6 → 7（浸水）→ 8（沈んだ）→ 9・3・14 へ
        const targets = game.moveTargets(0);
        expect(targets).toEqual(expect.arrayContaining([7, 9, 3, 14, 12, 13]));
        expect(targets).not.toContain(8);
        expect(game.applyCommand(0, { type: 'move', to: 9 })).toBe(true);
        expect(game.actionsLeft).toBe(2);
    });

    it('パイロットは手番に1回だけ、どこへでも飛べる', () => {
        const game = board(['pilot', 'engineer']);
        place(game, 0, FOOLS);
        expect(game.applyCommand(0, { type: 'fly', to: 23 })).toBe(true);
        expect(game.players[0].tile).toBe(23);
        expect(game.applyCommand(0, { type: 'fly', to: 0 })).toBe(false);
        game.tiles[5] = SUNK;
        expect(makeGame(2, { roles: ['engineer', 'pilot'] }).applyCommand(0, { type: 'fly', to: 5 })).toBe(false);
    });

    it('補強：自分の場所ととなり。技師は1アクションで2か所', () => {
        const game = board(['engineer', 'messenger']);
        place(game, 0, 8);
        [8, 9, 15].forEach(t => { game.tiles[t] = FLOODED; });
        expect(game.shoreTargets(0).sort((a, b) => a - b)).toEqual([8, 9]);
        expect(game.applyCommand(0, { type: 'shore', tile: 8, tile2: 15 })).toBe(false);
        expect(game.applyCommand(0, { type: 'shore', tile: 8, tile2: 9 })).toBe(true);
        expect([game.tiles[8], game.tiles[9], game.actionsLeft]).toEqual([DRY, DRY, 2]);
        const other = board(['messenger', 'engineer']);
        place(other, 0, 8);
        [8, 9].forEach(t => { other.tiles[t] = FLOODED; });
        expect(other.applyCommand(0, { type: 'shore', tile: 8, tile2: 9 })).toBe(false);
    });

    it('カードを渡す：同じ場所の仲間に宝のカードだけ。伝令はどこにいても渡せる', () => {
        const game = board(['engineer', 'navigator', 'messenger']);
        place(game, 0, 8);
        place(game, 1, 9);
        place(game, 2, 20);
        setHand(game, 0, ['fire', 'sand']);
        expect(game.applyCommand(0, { type: 'give', to: 1, card: 'fire' })).toBe(false);
        place(game, 1, 8);
        expect(game.applyCommand(0, { type: 'give', to: 1, card: 'sand' })).toBe(false);
        expect(game.applyCommand(0, { type: 'give', to: 1, card: 'fire' })).toBe(true);
        expect(game.players[1].hand).toContain('fire');
        game.applyCommand(0, { type: 'pass' });
        game.phase = 'actions';
        game.current = 2;
        game.actionsLeft = 3;
        setHand(game, 2, ['wind']);
        expect(game.applyCommand(2, { type: 'give', to: 0, card: 'wind' })).toBe(true);
    });

    it('受け取って6枚になった人は、すぐに捨てる。そのあと手番に戻る', () => {
        const game = board(['engineer', 'navigator']);
        place(game, 1, game.players[0].tile);
        setHand(game, 0, ['fire']);
        setHand(game, 1, ['wind', 'wind', 'earth', 'ocean', 'ocean']);
        expect(game.applyCommand(0, { type: 'give', to: 1, card: 'fire' })).toBe(true);
        expect(game.phase).toBe('discard');
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(0, { type: 'move', to: 3 })).toBe(false);
        expect(game.applyCommand(1, { type: 'discard', card: 'earth' })).toBe(true);
        expect([game.phase, game.actionsLeft]).toEqual(['actions', 2]);
    });

    it('宝を手に入れる：神殿で同じ宝のカード4枚', () => {
        const game = board(['engineer', 'navigator']);
        place(game, 0, T('embers'));
        setHand(game, 0, ['fire', 'fire', 'fire', 'wind']);
        expect(game.applyCommand(0, { type: 'capture' })).toBe(false);
        setHand(game, 0, ['fire', 'fire', 'fire', 'fire', 'wind']);
        game.tiles[T('embers')] = FLOODED;
        expect(game.applyCommand(0, { type: 'capture' })).toBe(true);
        expect(game.captured).toEqual([false, false, true, false]);
        expect(game.players[0].hand).toEqual(['wind']);
        expect(game.treasureDiscard.filter(c => c === 'fire')).toHaveLength(4);
        place(game, 0, T('shadows'));
        setHand(game, 0, ['fire', 'fire', 'fire', 'fire']);
        expect(game.applyCommand(0, { type: 'capture' })).toBe(false);
    });

    it('航海士は、ほかの人を上下左右に2マスまで動かせる', () => {
        const game = board(['navigator', 'engineer']);
        place(game, 1, 8);
        const targets = game.navigateTargets(1);
        expect(targets).toEqual(expect.arrayContaining([3, 14, 7, 9, 0, 19, 6, 10, 2, 4, 13, 15]));
        expect(targets).not.toContain(8);
        expect(game.applyCommand(0, { type: 'navigate', pawn: 1, to: 19 })).toBe(true);
        expect(game.applyCommand(0, { type: 'navigate', pawn: 0, to: 0 })).toBe(false);
        expect(game.players[1].tile).toBe(19);
    });
});

describe('カードを引く・浸水', () => {
    it('2枚引いて、浸水のカードを水位の枚数だけ1枚ずつめくる。終わると次の人', () => {
        const game = board(['engineer', 'navigator'], { level: 'novice' });
        game.treasureDeck = ['fire', 'wind', ...game.treasureDeck.filter(c => c !== 'rise')];
        game.floodDeck = [5, 6, ...game.floodDeck.filter(t => t !== 5 && t !== 6)];
        game.applyCommand(0, { type: 'pass' });
        expect(game.applyCommand(0, { type: 'draw' })).toBe(true);
        expect(game.players[0].hand.slice(-2)).toEqual(['fire', 'wind']);
        expect([game.phase, game.floodLeft]).toEqual(['flood', 2]);
        game.applyCommand(0, { type: 'flood' });
        expect(game.tiles[5]).toBe(FLOODED);
        game.applyCommand(0, { type: 'flood' });
        expect(game.tiles[6]).toBe(FLOODED);
        expect([game.current, game.phase, game.actionsLeft]).toEqual([1, 'actions', 3]);
    });

    it('水位上昇：水位が上がり、浸水の捨て札を切って山の上に戻す', () => {
        const game = board(['engineer', 'navigator']);
        game.floodDiscard = [3, 4];
        game.floodDeck = game.floodDeck.filter(t => t !== 3 && t !== 4);
        game.treasureDeck = ['rise', 'fire', ...game.treasureDeck.filter(c => c !== 'rise')];
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'draw' });
        expect(game.water).toBe(3);
        expect(game.floodDiscard).toEqual([]);
        expect(game.floodDeck.slice(0, 2).sort()).toEqual([3, 4]);
        expect(game.treasureDiscard).toContain('rise');
        expect(game.players[0].hand).not.toContain('rise');
        expect(game.floodLeft).toBe(3);
        // 山の上に戻した束の残り（公開の情報）。めくるたびに減る
        expect(game.floodTop).toBe(2);
        game.applyCommand(0, { type: 'flood' });
        expect(game.floodTop).toBe(1);
    });

    it('浸水した場所がもう一度めくられると沈み、カードは取り除く', () => {
        const game = board(['engineer', 'navigator']);
        game.tiles[20] = FLOODED;
        game.floodDeck = [20, ...game.floodDeck.filter(t => t !== 20)];
        game.phase = 'flood';
        game.floodLeft = 2;
        game.applyCommand(0, { type: 'flood' });
        expect(game.tiles[20]).toBe(SUNK);
        expect(game.floodRemoved).toEqual([20]);
        expect(game.floodDeck).not.toContain(20);
    });

    it('手札が6枚になったら、捨ててから浸水へ。特別なカードを使ってもよい', () => {
        const game = board(['engineer', 'navigator']);
        setHand(game, 0, ['fire', 'wind', 'earth', 'sand']);
        game.treasureDeck = ['ocean', 'ocean', ...game.treasureDeck.filter(c => c !== 'rise')];
        game.tiles[12] = FLOODED;
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'draw' });
        expect(game.phase).toBe('discard');
        expect(game.applyCommand(0, { type: 'flood' })).toBe(false);
        expect(game.applyCommand(0, { type: 'sand', tile: 12 })).toBe(true);
        expect(game.tiles[12]).toBe(DRY);
        expect(game.phase).toBe('flood');
    });

    it('浸水の山が切れたら、捨て札を切り直す', () => {
        const game = board(['engineer', 'navigator']);
        game.floodDiscard = [...game.floodDeck];
        game.floodDeck = [];
        game.phase = 'flood';
        game.floodLeft = 1;
        expect(game.applyCommand(0, { type: 'flood' })).toBe(true);
        expect(game.floodDeck.length + game.floodDiscard.length).toBe(24);
    });
});

describe('泳いで逃げる', () => {
    function sinkUnder(game, tile) {
        game.tiles[tile] = FLOODED;
        game.floodDeck = [tile, ...game.floodDeck.filter(t => t !== tile)];
        game.phase = 'flood';
        game.floodLeft = 2;
        return game.applyCommand(game.current, { type: 'flood' });
    }

    it('逃げ先が2つ以上なら、その人が選ぶ。選ぶまでは浸水を進めない', () => {
        const game = board(['engineer', 'navigator']);
        place(game, 1, 8);
        sinkUnder(game, 8);
        expect(game.phase).toBe('swim');
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(0, { type: 'flood' })).toBe(false);
        expect(game.applyCommand(1, { type: 'swim', to: 15 })).toBe(false);
        expect(game.applyCommand(1, { type: 'swim', to: 9 })).toBe(true);
        expect([game.players[1].tile, game.phase]).toEqual([9, 'flood']);
    });

    it('逃げ先が1つならその場で動き、なければ負け', () => {
        const game = board(['engineer', 'navigator']);
        place(game, 1, 22);
        game.tiles[19] = SUNK;
        sinkUnder(game, 22);
        expect(game.players[1].tile).toBe(23);
        const lost = board(['engineer', 'navigator']);
        place(lost, 1, 22);
        lost.tiles[19] = SUNK;
        lost.tiles[23] = SUNK;
        sinkUnder(lost, 22);
        expect(lost.result).toEqual({ won: false, reason: 'drown' });
    });

    it('ダイバーはいちばん近い場所、パイロットはどこへでも逃げられる', () => {
        const game = board(['diver', 'pilot']);
        place(game, 0, 22);
        place(game, 1, 22);
        game.tiles[19] = SUNK;
        game.tiles[23] = SUNK;
        game.tiles[20] = SUNK;
        expect(game.swimTargets(1)).toHaveLength(20);
        // 22 の上下左右と斜め前は沈んだので、2歩先の 14・18 がいちばん近い
        expect(game.swimTargets(0).sort((a, b) => a - b)).toEqual([14, 18]);
    });
});

describe('勝ちと負け', () => {
    it('宝4つ・全員が発着場で「ヘリで脱出」を使うと勝ち。条件が足りなければ使えない', () => {
        const game = board(['engineer', 'navigator']);
        setHand(game, 1, ['heli']);
        place(game, 0, FOOLS);
        place(game, 1, FOOLS);
        game.captured = [true, true, true, false];
        expect(game.applyCommand(1, { type: 'liftoff' })).toBe(false);
        game.captured = [true, true, true, true];
        expect(game.applyCommand(1, { type: 'liftoff' })).toBe(true);
        expect(game.result).toEqual({ won: true, reason: 'won' });
    });

    it('発着場が沈むと負け', () => {
        const game = board(['engineer', 'navigator']);
        place(game, 0, 8);
        place(game, 1, 8);
        game.tiles[FOOLS] = FLOODED;
        game.floodDeck = [FOOLS, ...game.floodDeck.filter(t => t !== FOOLS)];
        game.phase = 'flood';
        game.floodLeft = 2;
        game.applyCommand(0, { type: 'flood' });
        expect(game.result).toEqual({ won: false, reason: 'fools' });
    });

    it('まだ手に入れていない宝の神殿が2つとも沈むと負け。手に入れたあとなら負けない', () => {
        for (const captured of [false, true]) {
            const game = board(['engineer', 'navigator']);
            game.captured[0] = captured;
            game.tiles[T('moon')] = SUNK;
            game.tiles[T('sun')] = FLOODED;
            game.floodDeck = [T('sun'), ...game.floodDeck.filter(t => t !== T('sun'))];
            game.phase = 'flood';
            game.floodLeft = 2;
            game.applyCommand(0, { type: 'flood' });
            expect(game.result).toEqual(captured ? null : { won: false, reason: 'temple' });
        }
    });

    it('水位が頂点に達すると負け', () => {
        const game = board(['engineer', 'navigator']);
        game.water = 9;
        game.treasureDeck = ['rise', ...game.treasureDeck];
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'draw' });
        expect(game.result).toEqual({ won: false, reason: 'water' });
        expect(game.applyCommand(0, { type: 'flood' })).toBe(false);
    });
});

describe('特別なカード', () => {
    it('ヘリ：同じ場所の駒をまとめて運ぶ。手番でない人も使える', () => {
        const game = board(['engineer', 'navigator', 'diver']);
        place(game, 0, 8);
        place(game, 1, 8);
        place(game, 2, 20);
        setHand(game, 1, ['heli']);
        expect(game.applyCommand(1, { type: 'heli', pawns: [0, 2], to: 3 })).toBe(false);
        expect(game.applyCommand(1, { type: 'heli', pawns: [0, 1], to: 23 })).toBe(true);
        expect(game.players.map(p => p.tile)).toEqual([23, 23, 20]);
        expect(game.players[1].hand).toEqual([]);
        expect([game.current, game.actionsLeft]).toEqual([0, 3]);
    });

    it('土のう：島のどこでも浸水を戻す。泳いで逃げる途中は使えない', () => {
        const game = board(['engineer', 'navigator']);
        setHand(game, 1, ['sand', 'sand']);
        game.tiles[22] = FLOODED;
        expect(game.applyCommand(1, { type: 'sand', tile: 21 })).toBe(false);
        expect(game.applyCommand(1, { type: 'sand', tile: 22 })).toBe(true);
        game.phase = 'swim';
        game.swimQueue = [0];
        game.tiles[21] = FLOODED;
        expect(game.applyCommand(1, { type: 'sand', tile: 21 })).toBe(false);
    });
});

describe('断る操作', () => {
    it('断った操作は状態を変えない', () => {
        const game = makeGame(3, { seed: 4 });
        const bad = [
            [1, { type: 'move', to: 0 }], [0, { type: 'draw' }], [0, { type: 'flood' }], [0, { type: 'capture' }],
            [0, { type: 'give', to: 1, card: 'heli' }], [0, { type: 'fly', to: 3 }], [0, { type: 'shore', tile: 99 }],
            [0, { type: 'heli', pawns: [0], to: 0 }], [0, { type: 'nope' }], [7, { type: 'pass' }], [0, null]
        ];
        const before = snapshot(game);
        bad.forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('CPU だけの試合で、毎回の断った操作が状態を変えない', () => {
        const game = makeGame(4, { seed: 11 });
        let steps = 0;
        while (!game.isOver() && steps++ < 400) {
            const before = snapshot(game);
            game.applyCommand((game.current + 1) % 4, { type: 'pass' });
            game.applyCommand(game.current, { type: 'move', to: -1 });
            expect(snapshot(game)).toBe(before);
            runCpuStep(game);
        }
    });
});

describe('記録からの再現', () => {
    it.each([[2, 1], [3, 2], [4, 3]])('%i人の CPU の試合を、記録から同じ局面に再現できる（シード %i）', (n, seed) => {
        const game = new Game(Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true })), { seed, level: 'novice' });
        let steps = 0;
        while (!game.isOver() && steps++ < 3000) runCpuStep(game);
        expect(game.isOver()).toBe(true);
        const saved = game.persist();
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
        expect(again.result).toEqual(game.result);
    });

    it('途中の記録からも、同じ局面に戻る', () => {
        const game = makeGame(2, { seed: 5 });
        for (let i = 0; i < 40 && !game.isOver(); i++) runCpuStep(game);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });
});

describe('ビュー', () => {
    it('山の並びは入れず、枚数だけ。JSON にできる', () => {
        const game = makeGame(3, { seed: 3 });
        const view = createGameView(game, 1);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
        expect(view).not.toHaveProperty('treasureDeck');
        expect(view).not.toHaveProperty('floodDeck');
        expect(view).not.toHaveProperty('seed');
        expect(view.treasureDeckCount).toBe(game.treasureDeck.length);
        expect(view.floodDeckCount).toBe(18);
        expect(view.players[0].hand).toEqual(game.players[0].hand);
    });
});
