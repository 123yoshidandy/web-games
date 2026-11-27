import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { MONSTER_CARDS, HOSPITAL, NEIGHBORS, ITEMS, PERK_CARDS, VILLAGERS, MONSTER, TERROR_MAX } from '../public/js/data.js';
import { makeGame, clearBoard, give, L, snapshot } from './helpers.js';

const V_G = { monsters: ['vampire', 'golem'], heroes: ['mayor', 'archaeologist'] };
const fresh = (opts = {}) => {
    const game = makeGame(2, { seed: 3, ...V_G, ...opts });
    clearBoard(game);
    return game;
};
// 次にめくる怪物カードを決める（できごとと、動く怪物で探す）
const cardWhere = (pred) => MONSTER_CARDS.find(pred).id;
const calmCard = (icons) => cardWhere(c => c.event.type === 'calm' && (!icons || icons(c.strike.icons)));
const perkOf = (key) => PERK_CARDS.find(p => p.key === key).id;

describe('準備', () => {
    it('怪物の数は難易度どおりで、英雄は決まった地点から、特典を1枚ずつ持って始まる', () => {
        const game = makeGame(3, { seed: 1, level: 3 });
        expect(game.monsters).toHaveLength(3);
        expect(game.players.every(p => p.perks.length === 1)).toBe(true);
        expect(game.board.flat()).toHaveLength(12);
        expect(game.deck).toHaveLength(30);
        expect(game.terror).toBe(0);
        expect(game.actionsLeft).toBe(game.heroOf(0).actions);
        game.board.forEach((list, at) => list.forEach(id => expect(ITEMS[id].at).toBe(at)));
    });

    it('同じシードなら同じ準備になる', () => {
        expect(snapshot(makeGame(4, { seed: 9, level: 4 }))).toBe(snapshot(makeGame(4, { seed: 9, level: 4 })));
        expect(snapshot(makeGame(4, { seed: 9, level: 4 }))).not.toBe(snapshot(makeGame(4, { seed: 10, level: 4 })));
    });

    it('人数の範囲の外は作れない', () => {
        expect(() => makeGame(0)).toThrow();
        expect(() => makeGame(6)).toThrow();
    });
});

describe('英雄のアクション', () => {
    it('隣の地点へ移動し、同じ地点の村人を連れて行ける', () => {
        const game = fresh();
        const p = game.players[0];
        p.loc = L('広場');
        game.villagers[0] = L('広場'); // 花売り（家は教会）
        expect(game.applyCommand(0, { type: 'move', to: L('博物館'), villagers: [0] })).toBe(true);
        expect(p.loc).toBe(L('博物館'));
        expect(game.villagers[0]).toBe(L('博物館'));
        expect(game.actionsLeft).toBe(4);
        expect(game.applyCommand(0, { type: 'move', to: L('洞窟') })).toBe(false);
    });

    it('村人を家に送り届けると、送った英雄が特典をもらう', () => {
        const game = fresh();
        const p = game.players[0];
        p.loc = L('博物館');
        game.villagers[0] = L('博物館');
        expect(game.applyCommand(0, { type: 'guide', villager: 0, to: L('教会') })).toBe(true);
        expect(game.villagers[0]).toBe(null);
        expect(p.perks).toHaveLength(1);
    });

    it('案内は、隣の村人を自分の地点へ呼ぶこともできる', () => {
        const game = fresh();
        game.players[0].loc = L('広場');
        game.villagers[3] = L('劇場');
        expect(game.applyCommand(0, { type: 'guide', villager: 3, to: L('広場') })).toBe(true);
        expect(game.villagers[3]).toBe(L('広場'));
        expect(game.applyCommand(0, { type: 'guide', villager: 3, to: L('塔') })).toBe(false);
    });

    it('拾うで、その地点のアイテムを全部持つ。考古学者は隣の地点からも拾える', () => {
        const game = fresh();
        game.board[L('広場')] = [1, 2];
        game.players[0].loc = L('広場');
        expect(game.applyCommand(0, { type: 'pickup' })).toBe(true);
        expect(game.players[0].items).toEqual([1, 2]);
        expect(game.applyCommand(0, { type: 'pickup' })).toBe(false);
        expect(game.applyCommand(0, { type: 'pickup', from: L('劇場') })).toBe(false);
    });

    it('考古学者は隣の地点のアイテムを拾える', () => {
        const game = fresh({ heroes: ['archaeologist', 'mayor'] });
        game.players[0].loc = L('劇場');
        game.board[L('広場')] = [5];
        expect(game.applyCommand(0, { type: 'pickup', from: L('広場') })).toBe(true);
        expect(game.players[0].items).toEqual([5]);
    });

    it('共有は、同じ地点の英雄とアイテムを渡し合う（1アクション）', () => {
        const game = fresh();
        const [a, b] = game.players;
        a.loc = b.loc = L('広場');
        const [x] = give(game, 0, ['red', 3]);
        const [y] = give(game, 1, ['blue', 2]);
        expect(game.applyCommand(0, { type: 'share', with: 1, give: [x], take: [y] })).toBe(true);
        expect(a.items).toEqual([y]);
        expect(b.items).toEqual([x]);
        b.loc = L('塔');
        expect(game.applyCommand(0, { type: 'share', with: 1, give: [y] })).toBe(false);
    });

    it('アクションを使い切ると、怪物の番が来て次の英雄の手番になる', () => {
        const game = fresh();
        game.deck = [calmCard(), ...game.deck];
        game.players[0].perks = [];
        const p = game.players[0];
        p.loc = L('広場');
        for (let i = 0; i < 5; i++) expect(game.applyCommand(0, { type: 'move', to: i % 2 ? L('広場') : L('劇場') })).toBe(true);
        expect(game.current).toBe(1);
        expect(game.deck).toHaveLength(30);
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
    });

    it('手番でない人は操作できない', () => {
        const game = fresh();
        expect(game.applyCommand(1, { type: 'end' })).toBe(false);
        expect(game.lastError).toBe('あなたの手番ではありません');
    });
});

describe('目的と退治', () => {
    it('吸血鬼：4つの棺を赤6以上で壊してから、吸血鬼のいる地点で黄6以上で退治する', () => {
        const game = fresh();
        const p = game.players[0];
        const v = game.monsters[0];
        expect(v.key).toBe('vampire');
        p.loc = L('地下牢');
        const weak = give(game, 0, ['red', 2], ['red', 3]);
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: weak })).toBe(false);
        const strong = give(game, 0, ['red', 6]);
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: strong })).toBe(true);
        expect(v.task).toEqual([false, true, false, false]);
        expect(game.used).toContain(strong[0]);
        v.task = [true, true, true, true];
        v.loc = L('地下牢');
        const y = give(game, 0, ['yellow', 6]);
        expect(game.applyCommand(0, { type: 'defeat', monster: 0, items: weak })).toBe(false);
        expect(game.applyCommand(0, { type: 'defeat', monster: 0, items: y })).toBe(true);
        expect(v.defeated).toBe(true);
        expect(game.frenzy).toBe(1); // 狂乱が次の怪物へ
    });

    it('目的を果たすまでは退治できない', () => {
        const game = fresh();
        const g = game.monsters[1];
        game.players[0].loc = g.loc;
        const r = give(game, 0, ['red', 6]);
        expect(game.applyCommand(0, { type: 'defeat', monster: 1, items: r })).toBe(false);
        expect(game.lastError).toBe('先に目的を果たします');
    });

    it('人造人間：学院で黄4以上を3回。全部の怪物を退治すると勝ち', () => {
        const game = fresh();
        const p = game.players[0];
        game.monsters[0].defeated = true;
        game.monsters[0].loc = null;
        p.loc = L('学院');
        for (let i = 0; i < 3; i++) {
            const y = give(game, 0, ['yellow', 4]);
            expect(game.applyCommand(0, { type: 'advance', monster: 1, items: y }), game.lastError).toBe(true);
        }
        expect(game.monsters[1].task).toBe(3);
        game.monsters[1].loc = L('学院');
        const r = give(game, 0, ['red', 6]);
        expect(game.applyCommand(0, { type: 'defeat', monster: 1, items: r })).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.result).toEqual({ won: true, reason: 'won' });
    });

    it('科学者は手番に1回、合計に+1できる', () => {
        const game = fresh({ heroes: ['scientist', 'mayor'] });
        game.players[0].loc = L('地下牢');
        const r = give(game, 0, ['red', 5]);
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: r })).toBe(true);
        expect(game.bonusUsed).toBe(true);
        game.players[0].loc = L('洞窟');
        const r2 = give(game, 0, ['red', 5]);
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: r2 })).toBe(false);
    });

    it('ミイラ：博物館で1色ずつ封印を解く', () => {
        const game = fresh({ monsters: ['mummy', 'invisible'] });
        game.players[0].loc = L('博物館');
        const mixed = [...give(game, 0, ['red', 2]), ...give(game, 0, ['blue', 2])];
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: mixed })).toBe(false);
        const b = give(game, 0, ['blue', 4]);
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: b })).toBe(true);
        expect(game.monsters[0].task).toEqual([false, true, false]);
        const b2 = give(game, 0, ['blue', 5]);
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: b2 })).toBe(false);
    });

    it('透明人間：警察署に、出どころの違うアイテムを証拠として届ける', () => {
        const game = fresh({ monsters: ['invisible', 'mummy'] });
        game.players[0].loc = L('警察署');
        const sameAt = ITEMS.filter(i => i.at === ITEMS[0].at).slice(0, 2).map(i => i.id);
        game.players[0].items = [...sameAt];
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: sameAt })).toBe(false);
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: [sameAt[0]] })).toBe(true);
        expect(game.monsters[0].task).toEqual([ITEMS[0].at]);
        expect(game.applyCommand(0, { type: 'advance', monster: 0, items: [sameAt[1]] })).toBe(false);
    });
});

describe('英雄の能力と特典', () => {
    it('運び屋は、ほかの英雄のいる地点へ1アクションで移れる', () => {
        const game = fresh({ heroes: ['courier', 'mayor'] });
        game.players[1].loc = L('墓地');
        expect(game.applyCommand(0, { type: 'special', to: L('墓地') })).toBe(true);
        expect(game.players[0].loc).toBe(L('墓地'));
        expect(game.applyCommand(0, { type: 'special', to: L('洞窟') })).toBe(false);
    });

    it('警部は手番に1回、案内でアクションを使わない', () => {
        const game = fresh({ heroes: ['inspector', 'mayor'] });
        game.players[0].loc = L('広場');
        game.villagers[3] = L('広場');
        expect(game.applyCommand(0, { type: 'guide', villager: 3, to: L('病院') })).toBe(true);
        expect(game.actionsLeft).toBe(4);
        game.villagers[2] = L('広場');
        expect(game.applyCommand(0, { type: 'guide', villager: 2, to: L('商店') })).toBe(true);
        expect(game.actionsLeft).toBe(3);
    });

    it('夜更かしはアクションが2回増え、夜明けは次の怪物の番をとばす', () => {
        const game = fresh();
        const p = game.players[0];
        p.perks = [perkOf('late'), PERK_CARDS.find(c => c.key === 'dawn').id];
        expect(game.applyCommand(0, { type: 'perk', card: p.perks[0] })).toBe(true);
        expect(game.actionsLeft).toBe(7);
        expect(game.applyCommand(0, { type: 'perk', card: p.perks[0] })).toBe(true);
        const deck = game.deck.length;
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.deck).toHaveLength(deck);
        expect(game.current).toBe(1);
    });

    it('急ぎ足は2つ先まで、探し物は村のどこかのアイテムを持つ', () => {
        const game = fresh();
        const p = game.players[0];
        p.loc = L('広場');
        p.perks = [perkOf('hurry'), perkOf('search')];
        expect(game.applyCommand(0, { type: 'perk', card: p.perks[0], to: L('墓地') })).toBe(false);
        expect(game.applyCommand(0, { type: 'perk', card: p.perks[0], to: L('警察署') })).toBe(true);
        expect(p.loc).toBe(L('警察署'));
        game.board[L('洞窟')] = [7];
        expect(game.applyCommand(0, { type: 'perk', card: p.perks[0], item: 7 })).toBe(true);
        expect(p.items).toEqual([7]);
        expect(game.actionsLeft).toBe(5);
    });
});

describe('怪物の番', () => {
    it('カードのアイテムが出て、怪物がいちばん近い人へ寄り、襲う。防がなければ病院へ運ばれ恐怖が上がる', () => {
        const game = fresh();
        const card = MONSTER_CARDS.find(c => c.strike.icons.join() === 'frenzy');
        game.deck = [card.id];
        game.frenzy = 0;
        game.monsters[0].loc = L('塔');
        game.monsters[1].loc = L('研究所');
        game.players[0].loc = L('塔');
        game.players[1].loc = L('墓地');
        game.roll = (n) => Array.from({ length: n }, () => 'hit');
        const bagBefore = game.bag.length;
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.bag.length).toBe(bagBefore - card.items);
        expect(game.players[0].loc).toBe(HOSPITAL);
        expect(game.terror).toBeGreaterThanOrEqual(1);
    });

    it('同じ地点に2人いれば手番の人が標的を選び、命中の数だけアイテムを捨てて防げる', () => {
        const game = fresh();
        const card = MONSTER_CARDS.find(c => c.event.type === 'calm' && c.strike.icons.includes('vampire') === false && c.strike.icons.includes('frenzy'))
            ?? MONSTER_CARDS.find(c => c.strike.icons.join() === 'frenzy');
        game.deck = [card.id];
        game.frenzy = 0;
        game.monsters[0].loc = L('塔');
        game.monsters[1].loc = L('墓地');
        game.players[0].loc = L('塔');
        game.players[1].loc = L('洞窟');
        game.villagers[0] = L('塔');
        const items = give(game, 0, ['blue', 1], ['blue', 2], ['blue', 3]);
        game.roll = (n) => ['hit', 'hit', ...Array(Math.max(0, n - 2)).fill('blank')];
        game.monsterPower = () => {};
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.prompt.type).toBe('target');
        expect(game.actors()).toEqual([0]);
        expect(game.applyCommand(1, { type: 'target', choice: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'target', choice: game.prompt.options.findIndex(o => o.kind === 'hero') })).toBe(true);
        expect(game.prompt).toMatchObject({ type: 'defend', seat: 0, hits: 2 });
        expect(game.applyCommand(0, { type: 'defend', items: [items[0]] })).toBe(false);
        expect(game.applyCommand(0, { type: 'defend', items: [items[0], items[1]] })).toBe(true);
        expect(game.players[0].items).toEqual([items[2]]);
        expect(game.players[0].loc).toBe(L('塔'));
        expect(game.terror).toBe(0);
    });

    it('村人に命中すると村人が倒れ、恐怖が上がる。恐怖が7で負け', () => {
        const game = fresh();
        game.deck = [MONSTER_CARDS.find(c => c.strike.icons.join() === 'frenzy').id];
        game.frenzy = 0;
        game.monsters[0].loc = L('塔');
        game.monsters[1].loc = L('墓地');
        game.players.forEach(p => { p.loc = L('研究所'); });
        game.villagers[0] = L('塔');
        game.terror = TERROR_MAX - 1;
        game.roll = (n) => Array(n).fill('hit');
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.villagers[0]).toBe(null);
        expect(game.isOver()).toBe(true);
        expect(game.result).toEqual({ won: false, reason: 'terror' });
    });

    it('怪物カードが尽きたら負け', () => {
        const game = fresh();
        game.deck = [];
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.result).toEqual({ won: false, reason: 'deck' });
    });

    it('村人のできごとで、村人が現れる。いない怪物のできごとは何も起きない', () => {
        const game = fresh();
        const ev = MONSTER_CARDS.find(c => c.event.type === 'villager');
        game.deck = [ev.id];
        game.players.forEach(p => { p.loc = L('研究所'); });
        game.monsters.forEach(m => { m.loc = L('研究所'); });
        game.roll = (n) => Array(n).fill('blank');
        game.applyCommand(0, { type: 'end' });
        expect(game.villagers[ev.event.villager]).toBe(ev.event.at);
        const other = fresh();
        other.deck = [MONSTER_CARDS.find(c => c.event.type === 'special' && c.event.monster === 'werewolf').id];
        other.applyCommand(0, { type: 'end' });
        expect(other.logs.some(l => l.text.includes('狼男がいないので'))).toBe(true);
    });

    it('人がどこにもいなければ動かない。動きは決まった道すじ', () => {
        const game = fresh();
        game.villagers = game.villagers.map(() => null);
        game.players[0].loc = L('墓地');
        game.players[1].loc = L('墓地');
        game.monsters[0].loc = L('洞窟');
        game.moveMonster(0, 2);
        expect(game.monsters[0].loc).not.toBe(L('洞窟'));
        expect(NEIGHBORS[L('洞窟')].some(n => NEIGHBORS[n].includes(game.monsters[0].loc))).toBe(true);
    });

    it('人造人間の力は命中を増やす', () => {
        const game = fresh();
        game.deck = [MONSTER_CARDS.find(c => c.strike.icons.join() === 'frenzy').id];
        game.frenzy = 1;
        game.monsters[0].loc = L('墓地');
        game.monsters[1].loc = L('塔');
        game.players[0].loc = L('塔');
        game.players[1].loc = L('墓地');
        give(game, 0, ['blue', 1], ['blue', 2], ['blue', 3]);
        game.roll = (n) => ['power', ...Array(n - 1).fill('blank')];
        game.applyCommand(0, { type: 'end' });
        expect(game.prompt).toMatchObject({ type: 'defend', hits: 1 });
    });
});

describe('断る操作は状態を変えない', () => {
    it('通らない操作をいろいろ送っても、状態は同じ', () => {
        const game = makeGame(3, { seed: 5, level: 3 });
        const before = snapshot(game);
        [
            [1, { type: 'end' }], [0, { type: 'move', to: 99 }], [0, { type: 'guide', villager: 0, to: 1 }],
            [0, { type: 'pickup', from: 19 }], [0, { type: 'share', with: 0 }], [0, { type: 'advance', monster: 0, items: [0, 0] }],
            [0, { type: 'defeat', monster: 9, items: [] }], [0, { type: 'special', to: 1 }], [0, { type: 'perk', card: 99 }],
            [0, { type: 'target', choice: 0 }], [0, { type: 'defend', items: [] }], [0, { type: 'nope' }], [0, null], [9, { type: 'end' }]
        ].forEach(([seat, c]) => expect(game.applyCommand(seat, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});

describe('記録からの再現', () => {
    it.each([1, 2, 3])('CPU だけの試合を、記録から同じ局面に再現できる（シード %i）', async (seed) => {
        const { playMatch } = await import('../scripts/cpu-match.mjs');
        const game = playMatch({ count: 3, level: 3, seed });
        expect(game.isOver()).toBe(true);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
    });

    it('途中の記録からも同じ局面になる', async () => {
        const { playMatch } = await import('../scripts/cpu-match.mjs');
        const game = playMatch({ count: 2, level: 2, seed: 11 });
        const half = game.commands.slice(0, Math.floor(game.commands.length / 2));
        const a = Game.replay(game.persist().players, game.options, half);
        const b = Game.replay(game.persist().players, game.options, half);
        expect(snapshot(a)).toBe(snapshot(b));
        expect(a.commands).toHaveLength(half.length);
    });
});

describe('データ', () => {
    it('地図はつながっていて、村人の家と怪物の目的の地点は地図の中', () => {
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) NEIGHBORS[queue.shift()].forEach(n => { if (!seen.has(n)) { seen.add(n); queue.push(n); } });
        expect(seen.size).toBe(20);
        VILLAGERS.forEach(v => expect(v.home).toBeGreaterThanOrEqual(0));
        Object.values(MONSTER).forEach(m => expect(m.start).toBeGreaterThanOrEqual(0));
        expect(MONSTER_CARDS).toHaveLength(30);
        expect(ITEMS).toHaveLength(60);
    });
});
