import { describe, it, expect } from 'vitest';
import { CARDS, CARD_IDS, cardOf, START_WORLDS } from '../public/js/cards.js';
import { newGame, setHand, setTableau, stackDeck, ok, ng, skipStart, choose } from './helpers.js';

const count = f => CARDS.filter(f).reduce((s, c) => s + c.count, 0);

describe('カードのデータ', () => {
    it('基本ゲームの 95 種 114 枚：世界 64・開発 50、開始の世界 5、6 コストの開発 12 種', () => {
        expect(CARDS.length).toBe(95);
        expect(CARD_IDS.length).toBe(114);
        expect(new Set(CARD_IDS).size).toBe(114);
        expect(count(c => c.type === 'world')).toBe(64);
        expect(count(c => c.type === 'dev')).toBe(50);
        expect(START_WORLDS).toEqual(['oldEarth', 'epsilonEridani', 'alphaCentauri', 'newSparta', 'earthsLostColony']);
        expect(CARDS.filter(c => c.type === 'dev' && c.cost === 6).length).toBe(12);
        expect(CARDS.filter(c => c.bonus).length).toBe(12);
    });

    it('資料で食い違ったカードは、Keldon と別の一覧が一致する値にした', () => {
        expect(cardOf('bioHazardMiningWorld')).toMatchObject({ cost: 3, vp: 2 });
        expect(cardOf('imperiumArmamentsWorld')).toMatchObject({ cost: 4, vp: 2 });
        expect(cardOf('outlawWorld').powers.some(p => p.phase === 3)).toBe(false);
        expect(cardOf('blackMarketTradingWorld')).toMatchObject({ cost: 3, vp: 2 });
    });

    it('日本語の名前は重ならない', () => {
        expect(new Set(CARDS.map(c => c.name)).size).toBe(95);
    });
});

// 2 人で準備を済ませ、席 0 の場札・手札を決めて、行動を選ぶ
function scene({ tableau = [], goods = [], hand = [], actions = ['produce', 'produce'], other = null } = {}) {
    const game = newGame(2);
    skipStart(game);
    setTableau(game, 0, tableau, goods);
    setHand(game, 0, hand);
    if (other) setTableau(game, 1, other.tableau ?? [], other.goods ?? []);
    if (other?.hand) setHand(game, 1, other.hand);
    choose(game, actions);
    return game;
}

const option = (game, card) => game.pending[0].options.find(o => o.card === card);

describe('探索の力', () => {
    it('研究所は 1 枚多く残す。銀河調査：SETI は 2 枚多く引く', () => {
        const game = scene({ tableau: ['oldEarth', 'researchLabs', 'galacticSurveySETI'], actions: ['explore5', 'produce'] });
        expect(game.pending[0]).toMatchObject({ keep: 2 });
        expect(game.pending[0].drawn.length).toBe(2 + 2 + 5);
    });
});

describe('入植の力', () => {
    it('銀河帝国は反乱軍の軍事の世界にだけ +4', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['earthsLostColony', 'galacticImperium']);
        expect(game.military(0, 'rebelFuelCache')).toBe(4);
        expect(game.military(0, 'formerPenalColony')).toBe(0);
    });

    it('レプリカント・ロボットは軍事でない世界を 2 安く。採掘ロボットは希少品の世界をさらに 1 安く', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['earthsLostColony', 'replicantRobots', 'miningRobots']);
        expect(game.settleCost(0, 'plagueWorld')).toBe(1);
        expect(game.settleCost(0, 'cometZone')).toBe(cardOf('cometZone').cost - 3);
    });

    it('異星技術研究所は異星の世界に軍事 +2', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['earthsLostColony', 'alienTechInstitute']);
        expect(game.military(0, 'lostAlienWarship')).toBe(2);
        expect(game.military(0, 'formerPenalColony')).toBe(0);
    });

    it('テラフォーミング・ロボットは、世界を置いたあとに 1 枚引く', () => {
        const game = scene({ tableau: ['earthsLostColony', 'terraformingRobots'], hand: ['pilgrimageWorld'], actions: ['produce', 'settle'] });
        ok(game, 0, { type: 'settle', card: 'pilgrimageWorld', pay: [] });
        ok(game, 1, { type: 'settle', card: null, pay: [] });
        expect(game.players[0].tableau).toContain('pilgrimageWorld');
        // テラフォーミング 1 枚（生産で引く力はない）
        expect(game.players[0].hand.length).toBe(1);
    });
});

describe('開発の力', () => {
    it('星間銀行は開発の段階の初めに 1 枚引く', () => {
        const game = scene({ tableau: ['oldEarth', 'interstellarBank'], hand: [], actions: ['develop', 'develop'] });
        expect(game.players[0].hand.length).toBe(1);
    });
});

describe('消費の力', () => {
    it('交易連盟は消費の力として売れる（交易の力つき）。闇市場の世界はボーナスなしで売る', () => {
        const game = scene({ tableau: ['earthsLostColony', 'tradeLeague', 'blackMarketTradingWorld', 'plagueWorld', 'gemWorld'], goods: ['plagueWorld', 'gemWorld'], hand: [], actions: ['vp2', 'vp2'] });
        const trade = option(game, 'tradeLeague');
        expect(trade).toMatchObject({ trade: true, optional: true, noBonus: false });
        const black = option(game, 'blackMarketTradingWorld');
        expect(black).toMatchObject({ trade: true, noBonus: true });
        // 地球の失われた植民地の「1 つで 1 点」は必ず使う
        const elc = option(game, 'earthsLostColony');
        ok(game, 0, { type: 'consume', use: elc.use, goods: ['gemWorld'] });
        const t = option(game, 'tradeLeague');
        // 遺伝子 4 + 交易連盟 1
        ok(game, 0, { type: 'consume', use: t.use, goods: ['plagueWorld'] });
        expect(game.players[0].hand.length).toBe(5);
    });

    it('星の遊牧民の隠れ家は、自分の商品を売るとき +1', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['earthsLostColony', 'starNomadLair', 'gemWorld'], ['starNomadLair', 'gemWorld']);
        // 新奇品 2 + 1
        expect(game.tradePrice(0, 'starNomadLair')).toBe(2 + 1);
        expect(game.tradePrice(0, 'gemWorld')).toBe(2);
    });

    it('巡礼の世界は商品を全部使い、個数 -1 の勝利点', () => {
        const game = scene({ tableau: ['newSparta', 'pilgrimageWorld', 'gemWorld', 'plagueWorld', 'spiceWorld'], goods: ['gemWorld', 'plagueWorld', 'spiceWorld'], actions: ['vp2', 'vp2'] });
        const o = option(game, 'pilgrimageWorld');
        expect(o).toMatchObject({ need: 3, all: true });
        ok(game, 0, { type: 'consume', use: o.use, goods: ['gemWorld', 'plagueWorld', 'spiceWorld'] });
        expect(game.players[0].chips).toBe(2 * 2);
    });

    it('賭博の世界は数を宣言して 1 枚めくり、費用が同じなら手札に入る', () => {
        const game = scene({ tableau: ['newSparta', 'gamblingWorld'], hand: [], actions: ['vp2', 'vp2'] });
        stackDeck(game, ['plagueWorld']);
        const o = option(game, 'gamblingWorld');
        ng(game, 0, { type: 'consume', use: o.use, number: 9 });
        ok(game, 0, { type: 'consume', use: o.use, number: cardOf('plagueWorld').cost });
        expect(game.players[0].hand).toEqual(['plagueWorld']);
        // 外れたら捨てる
        const game2 = scene({ tableau: ['newSparta', 'gamblingWorld'], hand: [], actions: ['vp2', 'vp2'] });
        stackDeck(game2, ['plagueWorld']);
        ok(game2, 0, { type: 'consume', use: option(game2, 'gamblingWorld').use, number: 1 });
        expect(game2.players[0].hand).toEqual([]);
        expect(game2.discardPile).toContain('plagueWorld');
    });

    it('自由貿易協会は新奇品を 3 つまで、1 つにつき 1 枚と 1 点', () => {
        const game = scene({ tableau: ['newSparta', 'freeTradeAssociation', 'gemWorld', 'spiceWorld'], goods: ['gemWorld', 'spiceWorld'], hand: [], actions: ['trade', 'vp2'] });
        ok(game, 0, { type: 'trade', good: 'spiceWorld' });
        const o = option(game, 'freeTradeAssociation');
        expect(o.need).toBe(1);
        ok(game, 0, { type: 'consume', use: o.use, goods: ['gemWorld'] });
        expect(game.players[0].chips).toBe(1);
        // 香料の世界の交易（新奇品 2 + 香料の世界の +2）と、自由貿易協会の 1 枚
        expect(game.players[0].hand.length).toBe(4 + 1);
    });

    it('多角経済は違う種類 3 つで 3 点。観光の世界は 2 つで 3 点', () => {
        const game = scene({ tableau: ['newSparta', 'diversifiedEconomy', 'touristWorld', 'gemWorld', 'plagueWorld', 'cometZone', 'spiceWorld'], goods: ['gemWorld', 'plagueWorld', 'cometZone', 'spiceWorld'], actions: ['vp2', 'vp2'] });
        const div = option(game, 'diversifiedEconomy');
        ng(game, 0, { type: 'consume', use: div.use, goods: ['gemWorld', 'spiceWorld', 'plagueWorld'] });
        ok(game, 0, { type: 'consume', use: div.use, goods: ['gemWorld', 'plagueWorld', 'cometZone'] });
        expect(game.players[0].chips).toBe(6);
        // 残りは 1 つなので、観光の世界（2 つ要る）は使えず、消費の段階が終わる
        expect(game.players[0].goods).toEqual(['spiceWorld']);
        expect(game.phase).toBe('action');
    });

    it('新経済は消費の段階の初めに 1 枚引く', () => {
        const game = scene({ tableau: ['newSparta', 'newEconomy'], hand: [], actions: ['vp2', 'vp2'] });
        expect(game.players[0].hand.length).toBe(1);
    });
});

describe('生産の力', () => {
    it('鉱業複合企業は、希少品をほかの全員より多く生産したら 2 枚引く（同数なら引かない）', () => {
        const base = { tableau: ['newSparta', 'miningConglomerate', 'cometZone'], hand: [] };
        const win = scene({ ...base, other: { tableau: ['oldEarth'] } });
        expect(win.players[0].hand.length).toBe(1 + 2);   // 彗星帯の 1 枚 + 2 枚
        const tie = scene({ ...base, other: { tableau: ['oldEarth', 'rebelMiners'] } });
        expect(tie.players[0].hand.length).toBe(1);
    });

    it('汎銀河連盟は遺伝子の世界 1 つにつき 1 枚。軍事力は -1', () => {
        const game = scene({ tableau: ['newSparta', 'panGalacticLeague', 'plagueWorld', 'avianUpliftRace'], hand: [] });
        expect(game.players[0].hand.length).toBe(2);
        expect(game.baseMilitary(0)).toBe(2 - 1);
    });

    it('遺伝子研究所は遺伝子のウィンドフォールの世界に商品を置く（置ける世界が 1 つなら自動）', () => {
        const game = scene({ tableau: ['newSparta', 'geneticsLab', 'avianUpliftRace'], hand: [] });
        expect(game.players[0].goods).toEqual(['avianUpliftRace']);
    });
});

describe('6 コストの開発の得点', () => {
    it('銀河ルネサンスは勝利点チップ 3 つにつき 1 点と、名前の決まったカード', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['oldEarth', 'galacticRenaissance', 'researchLabs', 'artistColony']);
        game.players[0].chips = 7;
        expect(game.bonusScore(0, 'galacticRenaissance')).toBe(2 + 3 + 3);
    });

    it('汎銀河連盟：遺伝子の生産の世界 2、遺伝子のウィンドフォール 2、軍事の世界 1、接触の専門家 3', () => {
        const game = newGame(2);
        skipStart(game);
        setTableau(game, 0, ['newSparta', 'panGalacticLeague', 'plagueWorld', 'avianUpliftRace', 'formerPenalColony', 'contactSpecialist']);
        // 疫病の世界 2 + 鳥類（遺伝子のウィンドフォールで先に当たる）2 + 元流刑地 1 + ニュー・スパルタ 1 + 接触の専門家 3
        expect(game.bonusScore(0, 'panGalacticLeague')).toBe(2 + 2 + 1 + 1 + 3);
    });
});
