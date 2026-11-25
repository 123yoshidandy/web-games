import { describe, it, expect } from 'vitest';
import Game, { COMPLETE_CITY } from '../public/js/game.js';
import { CARD_COUNT, CARD_TYPES, DISTRICTS, CHARACTER_ORDER } from '../public/js/cards.js';
import { players, newGame, setHand, setCity, arrange, draftAs, finishTurn, playUntil, totalCards, snapshot } from './helpers.js';

const types = (ids) => ids.map(id => CARD_TYPES[id]);

describe('準備', () => {
    it('地区カードは66枚。黄12・青11・緑20・赤11・紫12', () => {
        expect(CARD_COUNT).toBe(66);
        const byColor = {};
        CARD_TYPES.forEach(t => { byColor[DISTRICTS[t].color] = (byColor[DISTRICTS[t].color] ?? 0) + 1; });
        expect(byColor).toEqual({ yellow: 12, blue: 11, green: 20, red: 11, purple: 12 });
    });

    it('各自2金と4枚で始め、王冠の人から役割を選ぶ', () => {
        for (const n of [2, 3, 4, 5, 6, 7]) {
            const game = new Game(players(n), { seed: n, crown: n - 1 });
            game.players.forEach(p => {
                expect(p.gold).toBe(2);
                expect(p.hand).toHaveLength(4);
            });
            expect(totalCards(game)).toBe(66);
            expect(game.phase).toBe('draft');
            expect(game.actors()).toEqual([n - 1]);
        }
    });

    it('人数は2〜7人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(8))).toThrow();
    });
});

describe('役割を選ぶ', () => {
    it('表で捨てる枚数は、4人2枚・5人1枚・ほかは0枚。伏せて捨てるのは1枚', () => {
        const expected = { 2: 0, 3: 0, 4: 2, 5: 1, 6: 0, 7: 0 };
        for (const [n, faceUp] of Object.entries(expected)) {
            const game = new Game(players(Number(n)), { seed: 3 });
            expect(game.draft.faceUp).toHaveLength(faceUp);
            expect(game.draft.faceDown).toHaveLength(1);
            expect(game.draft.available).toHaveLength(7 - faceUp);
        }
    });

    it('王様は表で捨てない', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const game = new Game(players(4), { seed });
            expect(game.draft.faceUp).not.toContain('king');
        }
    });

    it('4人以上は1人1役、2〜3人は1人2役。王冠の人から時計回りに選ぶ', () => {
        for (const n of [2, 3, 4, 5, 6, 7]) {
            const game = new Game(players(n), { seed: 9, crown: 1 });
            const order = game.draft.steps.filter(s => s.kind === 'pick').map(s => s.seat);
            expect(order[0]).toBe(1);
            draftAs(game);
            game.players.forEach(p => expect(p.characters).toHaveLength(n <= 3 ? 2 : 1));
            const all = game.players.flatMap(p => p.characters);
            expect(new Set(all).size).toBe(all.length);
            if (n >= 4) expect(order).toEqual(Array.from({ length: n }, (_, k) => (1 + k) % n));
        }
    });

    it('2人：王冠の人が選び、相手が選んで1枚伏せ、王冠の人が選んで1枚伏せ、相手が選ぶ', () => {
        const game = new Game(players(2), { seed: 4, crown: 1 });
        expect(game.draft.steps.map(s => `${s.seat}${s.kind[0]}`)).toEqual(['1p', '0p', '0d', '1p', '1d', '0p']);
        draftAs(game);
        expect(game.draft.faceDown).toHaveLength(4); // 最初の1枚・2人が伏せた2枚・最後に残った1枚
    });

    it('2人：選ぶ番に伏せることはできず、伏せる番に選ぶことはできない', () => {
        const game = new Game(players(2), { seed: 4, crown: 0 });
        expect(game.applyCommand(0, { type: 'discard', character: game.draft.available[0] })).toBe(false);
        game.applyCommand(0, { type: 'pick', character: game.draft.available[0] });
        game.applyCommand(1, { type: 'pick', character: game.draft.available[0] });
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'pick', character: game.draft.available[0] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(1, { type: 'discard', character: game.draft.available[0] })).toBe(true);
    });

    it('7人：最後の人は、残りの1枚と伏せた1枚から選べる', () => {
        const game = new Game(players(7), { seed: 5, crown: 0 });
        const hidden = game.draft.faceDown[0];
        for (let i = 0; i < 6; i++) game.applyCommand(i, { type: 'pick', character: game.draftOptions()[0] });
        const options = game.draftOptions();
        expect(options).toHaveLength(2);
        expect(options).toContain(hidden);
        expect(game.applyCommand(6, { type: 'pick', character: hidden })).toBe(true);
        expect(game.players[6].characters).toEqual([hidden]);
        expect(game.draft.faceDown).toHaveLength(1);
        expect(game.draft.faceDown).not.toContain(hidden);
    });

    it('候補にない役割は選べない', () => {
        const game = newGame(4);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'pick', character: game.draft.faceUp[0] })).toBe(false);
        expect(game.applyCommand(0, { type: 'pick', character: 'nobody' })).toBe(false);
        expect(game.applyCommand(1, { type: 'pick', character: game.draft.available[0] })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('手番', () => {
    it('役割の番号の順に呼び、だれも持っていない役割は飛ばす', () => {
        const game = newGame(4, 2);
        arrange(game, { 0: ['warlord'], 1: ['thief'], 2: ['merchant'], 3: ['king'] });
        const order = [];
        while (game.phase === 'turn') {
            order.push(game.turn.character);
            finishTurn(game);
        }
        expect(order).toEqual(['thief', 'king', 'merchant', 'warlord']);
        expect(game.round).toBe(2);
    });

    it('2金を取るか、2枚引いて1枚残す（残りは山の下）', () => {
        const game = newGame(4);
        arrange(game, { 0: ['bishop'], 1: ['thief'], 2: ['merchant'], 3: ['king'] });
        playUntil(game, 'bishop');
        const seat = game.turn.seat;
        expect(game.applyCommand(seat, { type: 'draw' })).toBe(true);
        expect(game.phase).toBe('keep');
        const [a, b] = game.drawn;
        expect(game.applyCommand(seat, { type: 'keep', cards: [a, b] })).toBe(false);
        expect(game.applyCommand(seat, { type: 'keep', cards: [a] })).toBe(true);
        expect(game.players[seat].hand).toContain(a);
        expect(game.deck.at(-1)).toBe(b);
        expect(game.applyCommand(seat, { type: 'gold' })).toBe(false); // 行動は1回
    });

    it('天文台と図書館を両方持てば、3枚引いて2枚を残す', () => {
        const game = newGame(4);
        arrange(game, { 0: ['bishop'] });
        setCity(game, 0, ['observatory', 'library']);
        playUntil(game, 'bishop');
        game.applyCommand(0, { type: 'draw' });
        expect(game.drawn).toHaveLength(3);
        const [a, b, c] = game.drawn;
        expect(game.applyCommand(0, { type: 'keep', cards: [a] })).toBe(false);
        expect(game.applyCommand(0, { type: 'keep', cards: [a, a] })).toBe(false);
        expect(game.applyCommand(0, { type: 'keep', cards: [a, c] })).toBe(true);
        expect(game.players[0].hand.slice(-2)).toEqual([a, c]);
        expect(game.deck.at(-1)).toBe(b);
    });

    it('天文台は3枚引いて1枚、図書館は引いた札をすべて残す', () => {
        const game = newGame(4);
        arrange(game, { 0: ['bishop'], 1: ['merchant'] });
        setCity(game, 0, ['observatory']);
        setCity(game, 1, ['library']);
        playUntil(game, 'bishop');
        game.applyCommand(0, { type: 'draw' });
        expect(game.drawn).toHaveLength(3);
        game.applyCommand(0, { type: 'keep', cards: [game.drawn[2]] });
        finishTurn(game);
        playUntil(game, 'merchant');
        const hand = game.players[1].hand.length;
        game.applyCommand(1, { type: 'draw' });
        expect(game.phase).toBe('turn');
        expect(game.players[1].hand.length).toBe(hand + 2);
    });

    it('建てるのは行動のあと。費用を払い、1つまで。同じ名前は建てられない', () => {
        const game = newGame(4);
        arrange(game, { 0: ['bishop'] });
        setHand(game, 0, ['temple', 'temple', 'church', 'palace']);
        setCity(game, 0, ['manor']);
        game.players[0].gold = 4;
        playUntil(game, 'bishop');
        const [t1, t2, church, palace] = game.players[0].hand;
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'build', card: t1 })).toBe(false); // 行動の前
        expect(snapshot(game)).toBe(before);
        game.applyCommand(0, { type: 'gold' });
        expect(game.applyCommand(0, { type: 'build', card: palace })).toBe(true); // 6金で5の宮殿
        expect(game.players[0].gold).toBe(1);
        expect(game.applyCommand(0, { type: 'build', card: t1 })).toBe(false); // 2つ目
        expect(types(game.players[0].city)).toEqual(['manor', 'palace']);
        void t2; void church;
    });

    it('同じ名前の地区は、都市にあれば建てられない', () => {
        const game = newGame(4);
        arrange(game, { 0: ['bishop'] });
        setHand(game, 0, ['temple']);
        setCity(game, 0, ['temple']);
        playUntil(game, 'bishop');
        game.applyCommand(0, { type: 'gold' });
        expect(game.applyCommand(0, { type: 'build', card: game.players[0].hand[0] })).toBe(false);
        expect(game.lastError).toContain('同じ地区');
    });

    it('建築家は行動のあとに2枚引き、3つまで建てられる', () => {
        const game = newGame(4);
        arrange(game, { 0: ['architect'] });
        setHand(game, 0, ['temple', 'tavern', 'watchtower', 'manor']);
        game.players[0].gold = 1;
        playUntil(game, 'architect');
        game.applyCommand(0, { type: 'gold' });
        expect(game.players[0].hand).toHaveLength(6);
        const [a, b, c, d] = game.players[0].hand;
        expect([a, b, c].every(id => game.applyCommand(0, { type: 'build', card: id }))).toBe(true);
        game.players[0].gold = 10;
        expect(game.applyCommand(0, { type: 'build', card: d })).toBe(false);
    });

    it('収入は役割の色の地区1つにつき1金（魔法学校も数える）。取らずに終えると自動で受け取る', () => {
        const game = newGame(4);
        arrange(game, { 0: ['king'], 1: ['merchant'] });
        setCity(game, 0, ['manor', 'castle', 'schoolOfMagic', 'temple']);
        setCity(game, 1, ['tavern', 'market']);
        playUntil(game, 'king');
        game.applyCommand(0, { type: 'gold' });
        expect(game.choices().income).toBe(3);
        expect(game.applyCommand(0, { type: 'income' })).toBe(true);
        expect(game.players[0].gold).toBe(2 + 2 + 3);
        expect(game.applyCommand(0, { type: 'income' })).toBe(false);
        game.applyCommand(0, { type: 'end' });
        // 商人：行動のあとに1金。収入は終えるときに自動
        playUntil(game, 'merchant');
        expect(game.players[1].gold).toBe(2);
        game.applyCommand(1, { type: 'gold' });
        expect(game.players[1].gold).toBe(2 + 2 + 1);
        game.applyCommand(1, { type: 'end' });
        expect(game.players[1].gold).toBe(2 + 2 + 1 + 2);
    });

    it('王様は呼ばれたときに王冠を受け取る', () => {
        const game = newGame(4);
        arrange(game, { 2: ['king'] });
        playUntil(game, 'king');
        expect(game.crown).toBe(2);
    });
});

describe('役割の能力', () => {
    it('暗殺者に殺された役割は手番を飛ばし、持ち主は巡の終わりに明かされる', () => {
        const game = newGame(4);
        arrange(game, { 0: ['assassin'], 1: ['merchant'], 2: ['king'] });
        expect(game.applyCommand(0, { type: 'assassinate', character: 'assassin' })).toBe(false);
        expect(game.applyCommand(0, { type: 'assassinate', character: 'merchant' })).toBe(true);
        expect(game.applyCommand(0, { type: 'assassinate', character: 'king' })).toBe(false); // 1回だけ
        finishTurn(game);
        expect(game.turn.character).toBe('king');
        expect(game.revealed.merchant).toBeUndefined();
        while (game.round === 1) finishTurn(game);
        expect(game.logs.some(t => t.includes('殺された商人はP1'))).toBe(true);
    });

    it('殺された王様の持ち主も、巡の終わりに王冠を受け取る', () => {
        const game = newGame(4);
        arrange(game, { 0: ['assassin'], 2: ['king'] });
        game.applyCommand(0, { type: 'assassinate', character: 'king' });
        while (game.round === 1) finishTurn(game);
        expect(game.crown).toBe(2);
        expect(game.actors()).toEqual([2]);
    });

    it('盗賊は暗殺者と殺された役割を狙えない。狙った役割の手番の始めに、金をすべて奪う', () => {
        const game = newGame(4);
        arrange(game, { 0: ['assassin'], 1: ['thief'], 2: ['merchant'], 3: ['king'] });
        game.applyCommand(0, { type: 'assassinate', character: 'king' });
        finishTurn(game);
        expect(game.applyCommand(1, { type: 'steal', character: 'assassin' })).toBe(false);
        expect(game.applyCommand(1, { type: 'steal', character: 'king' })).toBe(false);
        expect(game.applyCommand(1, { type: 'steal', character: 'merchant' })).toBe(true);
        game.players[2].gold = 5;
        const before = game.players[1].gold;
        finishTurn(game); // 盗賊は2金を取って終える。次の商人の手番が始まるときに奪う
        expect(game.turn.character).toBe('merchant');
        expect(game.players[2].gold).toBe(0);
        expect(game.players[1].gold).toBe(before + 2 + 5);
    });

    it('奇術師：手札をすべて交換するか、選んだ札を山の下に戻して同じ枚数を引く（どちらか1回）', () => {
        const game = newGame(4);
        arrange(game, { 0: ['magician'] });
        const mine = [...game.players[0].hand];
        const theirs = [...game.players[2].hand];
        game.applyCommand(0, { type: 'swap', target: 2 });
        expect(game.players[0].hand).toEqual(theirs);
        expect(game.players[2].hand).toEqual(mine);
        expect(game.applyCommand(0, { type: 'redraw', cards: [theirs[0]] })).toBe(false);

        const other = newGame(4, 8);
        arrange(other, { 1: ['magician'] });
        playUntil(other, 'magician');
        const hand = [...other.players[1].hand];
        const top = other.deck.slice(0, 2);
        expect(other.applyCommand(1, { type: 'redraw', cards: [hand[0], hand[0]] })).toBe(false);
        expect(other.applyCommand(1, { type: 'redraw', cards: [hand[0], hand[2]] })).toBe(true);
        expect(other.players[1].hand).toEqual([hand[1], hand[3], ...top]);
        expect(other.deck.slice(-2)).toEqual([hand[0], hand[2]]);
    });

    it('将軍：費用より1少ない金で壊す。完成した都市・司教の都市・天守は壊せない。城壁は1増える', () => {
        const game = newGame(4);
        arrange(game, { 0: ['warlord'], 1: ['bishop'], 2: ['king'], 3: ['merchant'] });
        setCity(game, 1, ['temple']);
        setCity(game, 2, ['castle', 'keep', 'watchtower']);
        setCity(game, 3, ['greatWall', 'manor', 'tavern', 'market', 'docks', 'harbor', 'prison', 'church']);
        playUntil(game, 'warlord');
        game.players[0].gold = 3;
        const c = game.choices();
        const of = (seat) => c.ability.targets.filter(x => x.target === seat).map(x => [CARD_TYPES[x.card], x.cost]);
        expect(of(1)).toEqual([]);                                  // 司教
        expect(of(2)).toEqual([['castle', 3], ['watchtower', 0]]);  // 天守は壊せない
        expect(of(3)).toEqual([]);                                  // 完成した都市
        const castle = game.players[2].city[0];
        expect(game.applyCommand(0, { type: 'destroy', target: 2, card: castle })).toBe(true);
        expect(game.players[0].gold).toBe(0);
        expect(types(game.players[2].city)).toEqual(['keep', 'watchtower']);
        expect(game.deck.at(-1)).toBe(castle);
    });

    it('城壁があると、ほかの地区を壊す費用が1増える（城壁そのものは増えない）', () => {
        const game = newGame(4);
        arrange(game, { 0: ['warlord'] });
        setCity(game, 2, ['greatWall', 'tavern']);
        playUntil(game, 'warlord');
        const list = game.choices().ability.targets.filter(x => x.target === 2).map(x => [CARD_TYPES[x.card], x.cost]);
        expect(list).toEqual([['greatWall', 5], ['tavern', 1]]);
    });

    it('司教が殺されていれば、司教の都市も壊せる', () => {
        const game = newGame(4);
        arrange(game, { 0: ['assassin'], 1: ['bishop'], 2: ['warlord'] });
        setCity(game, 1, ['temple']);
        game.applyCommand(0, { type: 'assassinate', character: 'bishop' });
        playUntil(game, 'warlord');
        expect(game.choices().ability.targets.some(x => x.target === 1)).toBe(true);
    });

    it('墓地：将軍がほかの人の地区を壊したら、墓地の持ち主は1金で拾える', () => {
        const game = newGame(4);
        arrange(game, { 0: ['warlord'] });
        setCity(game, 1, ['graveyard']);
        setCity(game, 2, ['market']);
        playUntil(game, 'warlord');
        game.players[1].gold = 3;
        const market = game.players[2].city[0];
        game.applyCommand(0, { type: 'destroy', target: 2, card: market });
        expect(game.phase).toBe('graveyard');
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        expect(game.applyCommand(1, { type: 'graveyard', take: true })).toBe(true);
        expect(game.players[1].hand).toContain(market);
        expect(game.players[1].gold).toBe(2);
        expect(game.phase).toBe('turn');
        expect(totalCards(game)).toBe(66);
    });

    it('研究所は手札1枚を1金に、鍛冶屋は2金で3枚。どちらも手番に1回', () => {
        const game = newGame(4);
        arrange(game, { 0: ['bishop'] });
        setCity(game, 0, ['laboratory', 'smithy']);
        playUntil(game, 'bishop');
        game.players[0].gold = 4;
        const card = game.players[0].hand[0];
        expect(game.applyCommand(0, { type: 'lab', card })).toBe(true);
        expect(game.players[0].gold).toBe(5);
        expect(game.applyCommand(0, { type: 'lab', card: game.players[0].hand[0] })).toBe(false);
        expect(game.applyCommand(0, { type: 'smithy' })).toBe(true);
        expect(game.players[0].gold).toBe(3);
        expect(game.players[0].hand).toHaveLength(3 + 3);
        expect(game.applyCommand(0, { type: 'smithy' })).toBe(false);
    });
});

describe('終わりと得点', () => {
    // 席0の都市をあと1つで完成にし、建てさせる
    function completeGame(extra = {}) {
        const game = newGame(4);
        arrange(game, { 0: ['bishop'], 1: ['merchant'], 2: ['warlord'], 3: ['king'], ...extra.want });
        setCity(game, 0, ['manor', 'temple', 'tavern', 'watchtower', 'castle', 'church', 'market']);
        setHand(game, 0, ['university']);
        game.players[0].gold = 4;
        extra.before?.(game);
        playUntil(game, 'bishop');
        game.applyCommand(0, { type: 'gold' });
        game.applyCommand(0, { type: 'build', card: game.players[0].hand[0] });
        return game;
    }

    it(`${COMPLETE_CITY}地区で完成し、その巡の終わりで終わる`, () => {
        const game = completeGame();
        expect(game.firstComplete).toBe(0);
        expect(game.finalRound).toBe(true);
        expect(game.isOver()).toBe(false);
        while (!game.isOver()) finishTurn(game);
        expect(game.round).toBe(1);
        expect(game.isOver()).toBe(true);
    });

    it('得点：地区の費用（大学は8点）＋5色で3＋最初に完成4', () => {
        const game = completeGame();
        while (!game.isOver()) finishTurn(game);
        // 屋敷3・寺院1・酒場1・見張り塔1・城4・教会2・市場2・大学8 = 22。黄青緑赤紫の5色で+3。最初に完成+4
        expect(game.scores[0]).toEqual({ seat: 0, districts: 22, colors: 3, complete: 4, total: 29 });
    });

    it('ほかに完成した人は+2', () => {
        const game = completeGame({
            before: (g) => {
                setCity(g, 2, ['manor', 'temple', 'tavern', 'watchtower', 'castle', 'church', 'market']);
                setHand(g, 2, ['harbor']);
                g.players[2].gold = 4;
            }
        });
        playUntil(game, 'warlord');
        game.applyCommand(2, { type: 'gold' });
        game.applyCommand(2, { type: 'build', card: game.players[2].hand[0] });
        while (!game.isOver()) finishTurn(game);
        expect(game.scores[2].complete).toBe(2);
        expect(game.scores[0].complete).toBe(4);
    });

    it('幽霊街は、最後の巡より前に建てていれば足りない色になる', () => {
        const score = (builtRound) => {
            const game = newGame(4);
            setCity(game, 1, ['manor', 'temple', 'tavern', 'watchtower', 'hauntedCity']);
            game.players[1].hauntedRound = builtRound;
            game.round = 3;
            return game.scoreOf(1).colors;
        };
        expect(score(2)).toBe(3);
        expect(score(3)).toBe(3); // 紫として数えても5色
        const missingRed = (builtRound) => {
            const game = newGame(4);
            setCity(game, 1, ['manor', 'temple', 'tavern', 'hauntedCity', 'keep']);
            game.players[1].hauntedRound = builtRound;
            game.round = 3;
            return game.scoreOf(1).colors;
        };
        expect(missingRed(2)).toBe(3);
        expect(missingRed(3)).toBe(0);
    });

    it('同点なら、地区の費用の合計が多い人、それも同じなら金の多い人が上', () => {
        const a = new Game(players(4), { seed: 1, crown: 0 });
        setCity(a, 0, ['university']);              // 8点・費用6
        setCity(a, 1, ['manor', 'castle', 'temple']); // 8点・費用8
        setCity(a, 2, ['palace', 'tavern', 'prison']); // 8点・費用8
        setCity(a, 3, []);
        a.players[1].gold = 1;
        a.players[2].gold = 3;
        a.finish();
        expect(a.scores.slice(0, 3).map(s => s.total)).toEqual([8, 8, 8]);
        expect(a.ranking).toEqual([2, 1, 0, 3]);
    });
});

describe('断る操作', () => {
    it('番でない人・知らない操作・おかしな値は断り、状態を変えない', () => {
        const game = newGame(4);
        arrange(game, { 0: ['warlord'], 1: ['assassin'] });
        const seat = game.turn.seat;
        const before = snapshot(game);
        const bad = [
            [3, { type: 'gold' }], [seat, null], [seat, { type: 'fly' }], [seat, { type: 'build', card: 'x' }],
            [seat, { type: 'assassinate', character: 'nobody' }], [seat, { type: 'end' }], [seat, { type: 'keep', cards: [1] }],
            [seat, { type: 'swap', target: 2 }], [seat, { type: 'destroy', target: 2, card: 0 }], [seat, { type: 'lab', card: 0 }]
        ];
        bad.forEach(([s, command]) => expect(game.applyCommand(s, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('役割はすべて1回ずつ配られ、地区カードは66枚のまま', () => {
        for (const n of [2, 3, 4, 5, 6, 7]) {
            const game = new Game(players(n), { seed: 21 + n });
            draftAs(game);
            const d = game.draft;
            const all = [...d.faceUp, ...d.faceDown, ...game.players.flatMap(p => p.characters)];
            expect(all.sort()).toEqual([...CHARACTER_ORDER].sort());
            expect(totalCards(game)).toBe(66);
        }
    });
});
