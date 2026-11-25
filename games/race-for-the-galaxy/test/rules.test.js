import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { cardOf, START_WORLDS, CARD_IDS } from '../public/js/cards.js';
import { newGame, players, setHand, setTableau, stackDeck, ok, ng, skipStart, choose, snapshot } from './helpers.js';

describe('準備', () => {
    it('開始の世界を 1 枚ずつ置き、手札 6 枚から 2 枚を捨てる。勝利点チップは人数×12', () => {
        const game = newGame(3);
        expect(CARD_IDS.length).toBe(114);
        game.players.forEach(p => {
            expect(p.tableau.length).toBe(1);
            expect(START_WORLDS).toContain(p.tableau[0]);
            expect(p.hand.length).toBe(6);
        });
        expect(new Set(game.players.map(p => p.tableau[0])).size).toBe(3);
        expect(game.pool).toBe(36);
        // 使わない開始の世界は山札に入る
        expect(game.deck.length).toBe(114 - 3 - 18);
        ng(game, 0, { type: 'startDiscard', cards: [game.players[0].hand[0]] });
        skipStart(game);
        game.players.forEach(p => expect(p.hand.length).toBe(4));
        expect(game.phase).toBe('action');
    });

    it('ウィンドフォールの開始の世界（アルファ・ケンタウリ）は、商品が載った状態で始まる', () => {
        for (let seed = 1; seed < 50; seed++) {
            const game = new Game(players(4), { seed });
            const seat = game.players.findIndex(p => p.tableau[0] === 'alphaCentauri');
            if (seat < 0) continue;
            expect(game.players[seat].goods).toEqual(['alphaCentauri']);
            return;
        }
        throw new Error('アルファ・ケンタウリが配られなかった');
    });
});

describe('行動の選択と公開', () => {
    it('全員がそろうまでは、ほかの人の行動は見えない。選ばれた段階だけを行う', () => {
        const game = newGame(2);
        skipStart(game);
        ok(game, 0, { type: 'action', actions: ['develop'] });
        expect(createGameView(game, 1).players[0].actions).toBeNull();
        expect(createGameView(game, 1).players[0].chosen).toBe(true);
        expect(createGameView(game, 0).players[0].actions).toEqual(['develop']);
        ok(game, 1, { type: 'action', actions: ['develop'] });
        expect(createGameView(game, 1).players[0].actions).toEqual(['develop']);
        expect(game.phase).toBe('develop');
        expect(game.phases).toEqual([]);
    });

    it('通常の遊びでは、行動は 1 つ。2 枚目の開発・入植は選べない', () => {
        const game = newGame(2);
        skipStart(game);
        ng(game, 0, { type: 'action', actions: ['develop', 'settle'] });
        ng(game, 0, { type: 'action', actions: ['develop2'] });
        ng(game, 0, { type: 'action', actions: ['fly'] });
    });
});

describe('探索', () => {
    it('ふつうは 2 枚引いて 1 枚残す。+5 は 7 枚引いて 1 枚、+1+1 は 3 枚引いて 2 枚', () => {
        const game = newGame(3);
        skipStart(game);
        choose(game, ['explore5', 'explore1', 'produce']);
        expect(game.phase).toBe('explore');
        expect(game.pending.map(d => [d.drawn.length, d.keep])).toEqual([[7, 1], [3, 2], [2, 1]]);
        ng(game, 1, { type: 'explore', keep: [game.pending[1].drawn[0]] });
        const keep = game.pending[1].drawn.slice(0, 2);
        ok(game, 0, { type: 'explore', keep: [game.pending[0].drawn[3]] });
        ok(game, 1, { type: 'explore', keep });
        expect(game.players[1].hand.length).toBe(6);
        expect(game.players[0].hand.length).toBe(5);
    });
});

describe('開発', () => {
    it('費用の枚数だけ手札を捨てて置く。選んだ人は 1 安い。同じ開発は 2 枚置けない', () => {
        const game = newGame(2);
        skipStart(game);
        setHand(game, 0, ['spaceMarines', 'gemWorld', 'spiceWorld', 'plagueWorld']);
        setTableau(game, 1, ['oldEarth', 'spaceMarines#2']);
        setHand(game, 1, ['publicWorks', 'pilgrimageWorld', 'rebelFuelCache', 'consumerMarkets']);
        choose(game, ['develop', 'produce']);
        // 選んだ人：2-1=1 枚
        ng(game, 0, { type: 'develop', card: 'spaceMarines', pay: ['gemWorld', 'spiceWorld'] });
        ok(game, 0, { type: 'develop', card: 'spaceMarines', pay: ['gemWorld'] });
        // 選んでいない人は 1 枚のまま
        ok(game, 1, { type: 'develop', card: 'publicWorks', pay: ['pilgrimageWorld'] });
        expect(game.players[0].tableau).toContain('spaceMarines');
        expect(game.players[0].hand).toEqual(['spiceWorld', 'plagueWorld']);
        // 公共事業：開発のあとに 1 枚引く
        expect(game.players[1].hand.length).toBe(3);
    });

    it('同じ名前の開発は 2 枚置けない', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'spaceMarines']);
        setHand(game, 0, ['spaceMarines#2', 'gemWorld', 'spiceWorld']);
        choose(game, ['develop', 'develop']);
        expect(ng(game, 0, { type: 'develop', card: 'spaceMarines#2', pay: ['gemWorld'] })).toContain('同じ開発');
    });

    it('投資信用は開発の費用を 1 下げる（0 未満にはならない）', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'investmentCredits']);
        setHand(game, 0, ['publicWorks', 'gemWorld']);
        choose(game, ['develop', 'produce']);
        expect(game.developCost(0, 'publicWorks')).toBe(0);
        ok(game, 0, { type: 'develop', card: 'publicWorks', pay: [] });
    });
});

describe('入植', () => {
    it('軍事でない世界は手札で払う。選んだ人は置いたあとに 1 枚引く', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth']);
        setHand(game, 0, ['gemWorld', 'spiceWorld', 'plagueWorld']);
        choose(game, ['settle', 'produce']);
        ng(game, 0, { type: 'settle', card: 'gemWorld', pay: ['spiceWorld'] });
        ok(game, 0, { type: 'settle', card: 'gemWorld', pay: ['spiceWorld', 'plagueWorld'] });
        ok(game, 1, { type: 'settle', card: null, pay: [] });
        expect(game.players[0].tableau).toEqual(['oldEarth', 'gemWorld']);
        // 選んだ人の 1 枚と、続く生産の段階で宝石の世界が生産して 1 枚
        expect(game.players[0].hand.length).toBe(2);
    });

    it('軍事の世界は、軍事力が防御以上なら払わずに置ける。ウィンドフォールの世界には商品が載る', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth']);
        setTableau(game, 1, ['newSparta']);
        setHand(game, 0, ['formerPenalColony', 'gemWorld']);
        setHand(game, 1, ['avianUpliftRace', 'spiceWorld']);
        choose(game, ['settle', 'settle']);
        expect(ng(game, 0, { type: 'settle', card: 'formerPenalColony', pay: [] })).toContain('軍事力が足りません');
        ok(game, 0, { type: 'settle', card: null, pay: [] });
        ok(game, 1, { type: 'settle', card: 'avianUpliftRace', pay: [] });
        expect(game.players[1].goods).toEqual(['avianUpliftRace']);
    });

    it('新戦術は場から捨てて軍事力 +3。接触の専門家は軍事の世界を費用 -1 で払える（軍事力は -1）', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'newMilitaryTactics']);
        setTableau(game, 1, ['earthsLostColony', 'contactSpecialist']);
        setHand(game, 0, ['avianUpliftRace']);
        setHand(game, 1, ['formerPenalColony', 'gemWorld', 'spiceWorld']);
        choose(game, ['settle', 'produce']);
        expect(game.military(1)).toBe(-1);
        ng(game, 1, { type: 'settle', card: 'formerPenalColony', pay: [] });
        ng(game, 1, { type: 'settle', card: 'formerPenalColony', payMilitary: true, pay: ['gemWorld', 'spiceWorld'] });
        ok(game, 1, { type: 'settle', card: 'formerPenalColony', payMilitary: true, pay: ['gemWorld'] });
        ok(game, 0, { type: 'settle', card: 'avianUpliftRace', tactics: ['newMilitaryTactics'], pay: [] });
        expect(game.players[0].tableau).toEqual(['oldEarth', 'avianUpliftRace']);
        expect(game.discardPile).toContain('newMilitaryTactics');
        expect(game.players[1].tableau).toContain('formerPenalColony');
    });

    it('植民船は場から捨てて、軍事でない世界を 0 で置ける', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'colonyShip']);
        setHand(game, 0, ['plagueWorld']);
        choose(game, ['produce', 'settle']);
        ok(game, 0, { type: 'settle', card: 'plagueWorld', colonyShip: 'colonyShip', pay: [] });
        ok(game, 1, { type: 'settle', card: null, pay: [] });
        expect(game.players[0].tableau).toEqual(['oldEarth', 'plagueWorld']);
    });
});

describe('消費', () => {
    it('交易を選んだ人は、まず商品を 1 つ売る（値段＋交易の力）。そのあと商品を使う力は必ず使う', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'gemWorld', 'plagueWorld', 'exportDuties'], ['gemWorld', 'plagueWorld']);
        setHand(game, 0, []);
        choose(game, ['trade', 'trade']);
        expect(game.pending[0].kind).toBe('trade');
        // 遺伝子 4 + 旧地球 1 + 輸出関税 1
        expect(game.tradePrice(0, 'plagueWorld')).toBe(6);
        ok(game, 0, { type: 'trade', good: 'plagueWorld' });
        expect(game.players[0].hand.length).toBe(6);
        const d = game.pending[0];
        expect(d.kind).toBe('consume');
        expect(d.mustUse).toBe(true);
        ng(game, 0, { type: 'consume', done: true });
        const old = d.options.find(o => o.card === 'oldEarth');
        ok(game, 0, { type: 'consume', use: old.use, goods: ['gemWorld'] });
        expect(game.players[0].chips).toBe(1);
        expect(game.players[0].goods).toEqual([]);
    });

    it('勝利点2倍を選んだ人は、消費で得る勝利点が 2 倍', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'gemWorld', 'spiceWorld'], ['gemWorld', 'spiceWorld']);
        choose(game, ['vp2', 'produce']);
        const old = game.pending[0].options.find(o => o.card === 'oldEarth');
        expect(old.need).toBe(2);
        ok(game, 0, { type: 'consume', use: old.use, goods: ['gemWorld', 'spiceWorld'] });
        expect(game.players[0].chips).toBe(4);
        expect(game.pool).toBe(24 - 4);
    });

    it('赤字財政は手札を捨てて勝利点（使わなくてもよい）', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'deficitSpending']);
        setHand(game, 0, ['gemWorld', 'spiceWorld', 'plagueWorld']);
        choose(game, ['vp2', 'produce']);
        const o = game.pending[0].options.find(x => x.card === 'deficitSpending');
        expect(o.optional).toBe(true);
        ng(game, 0, { type: 'consume', use: o.use, cards: ['gemWorld', 'spiceWorld', 'plagueWorld'] });
        ok(game, 0, { type: 'consume', use: o.use, cards: ['gemWorld', 'spiceWorld'] });
        expect(game.players[0].chips).toBe(4);
    });
});

describe('生産', () => {
    it('生産の世界に商品が載り、生産したら引く力（宝石の世界）。選んだ人はウィンドフォールの世界にも 1 つ', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'gemWorld', 'formerPenalColony', 'avianUpliftRace']);
        setHand(game, 0, []);
        choose(game, ['produce', 'develop']);
        ok(game, 0, { type: 'develop', card: null, pay: [] });
        ok(game, 1, { type: 'develop', card: null, pay: [] });
        // ウィンドフォールの世界が 2 つあるので選ぶ
        expect(game.pending[0]).toMatchObject({ kind: 'windfall', candidates: ['formerPenalColony', 'avianUpliftRace'] });
        ok(game, 0, { type: 'windfall', world: 'avianUpliftRace' });
        expect(game.players[0].goods).toEqual(['gemWorld', 'avianUpliftRace']);
        expect(game.players[0].hand.length).toBe(1);
    });
});

describe('ラウンドの終わりとゲームの終わり', () => {
    it('手札が 10 枚を超えたら、ラウンドの終わりに 10 枚まで捨てる', () => {
        const game = newGame(2);
        skipStart(game);
        setHand(game, 0, CARD_IDS.filter(id => cardOf(id).type === 'world' && !START_WORLDS.includes(id)).slice(0, 12));
        choose(game, ['produce', 'produce']);
        expect(game.phase).toBe('roundEnd');
        expect(game.pending[0]).toEqual({ kind: 'discard', count: 2 });
        ok(game, 0, { type: 'discard', cards: game.players[0].hand.slice(0, 2) });
        expect(game.phase).toBe('action');
        expect(game.round).toBe(2);
    });

    it('場札が 12 枚になったラウンドの終わりに終わり、6 コストの開発の得点を足す', () => {
        const game = newGame(2);
        skipStart(game);
        const devs = ['investmentCredits', 'publicWorks', 'exportDuties', 'spaceMarines', 'colonyShip', 'geneticsLab', 'deficitSpending', 'miningConglomerate', 'terraformingRobots', 'galacticFederation'];
        setTableau(game, 0, ['oldEarth', ...devs]);
        setHand(game, 0, ['gemWorld', 'spiceWorld', 'plagueWorld']);
        choose(game, ['settle', 'produce']);
        ok(game, 0, { type: 'settle', card: 'gemWorld', pay: ['spiceWorld', 'plagueWorld'] });
        ok(game, 1, { type: 'settle', card: null, pay: [] });
        expect(game.isOver()).toBe(true);
        // 銀河連邦：6 コストの開発 2 点（自分）、ほかの開発 1 点 ×9
        expect(game.bonusScore(0, 'galacticFederation')).toBe(2 + 9);
        const cards = game.players[0].tableau.reduce((s, id) => s + cardOf(id).vp, 0);
        expect(game.scores[0].total).toBe(game.players[0].chips + cards + 11);
        expect(game.winner).toBe(0);
        ng(game, 0, { type: 'action', actions: ['produce'] });
    });

    it('勝利点チップが尽きたラウンドの終わりに終わる', () => {
        const game = newGame(2);
        skipStart(game);
        game.pool = 1;
        setTableau(game, 0, ['oldEarth', 'gemWorld'], ['gemWorld']);
        choose(game, ['vp2', 'produce']);
        const old = game.pending[0].options.find(o => o.card === 'oldEarth');
        ok(game, 0, { type: 'consume', use: old.use, goods: ['gemWorld'] });
        expect(game.isOver()).toBe(true);
        expect(game.players[0].chips).toBe(2);
    });

    it('銀河新秩序は、種類を限らない軍事力の分の点', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['newSparta', 'spaceMarines', 'contactSpecialist', 'newGalacticOrder', 'alphaCentauri']);
        // ニュー・スパルタ 2 + 宇宙海兵隊 2 - 接触の専門家 1 + 銀河新秩序 2（アルファ・ケンタウリの希少品だけの +1 は数えない）
        expect(game.bonusScore(0, 'newGalacticOrder')).toBe(5);
    });
});

describe('2 人の上級ルール', () => {
    it('行動を 2 つ選び、開発を 2 つ選べば開発の段階が 2 回', () => {
        const game = newGame(2, { advanced: true });
        skipStart(game);
        ng(game, 0, { type: 'action', actions: ['develop'] });
        ng(game, 0, { type: 'action', actions: ['develop', 'develop'] });
        ok(game, 0, { type: 'action', actions: ['develop', 'develop2'] });
        ok(game, 1, { type: 'action', actions: ['explore5', 'produce'] });
        expect(game.phase).toBe('explore');
        expect(game.phases).toEqual(['develop', 'develop2', 'produce']);
    });

    it('3 人以上では上級ルールにならない', () => {
        expect(newGame(3, { advanced: true }).options.advanced).toBe(false);
    });
});

describe('記録', () => {
    it('断る操作は状態を変えず、記録から同じ状態に戻せる', () => {
        const game = newGame(3, { seed: 7 });
        skipStart(game);
        choose(game, ['explore5', 'explore1', 'develop']);
        ng(game, 0, { type: 'develop', card: null, pay: [] });
        ng(game, 2, null);
        game.pending.forEach((d, i) => { if (d) ok(game, i, { type: 'explore', keep: d.drawn.slice(0, Math.min(d.keep, d.drawn.length)) }); });
        const copy = Game.replay(players(3), game.options, JSON.parse(JSON.stringify(game.commands)));
        expect(snapshot(copy)).toBe(snapshot(game));
    });
});
