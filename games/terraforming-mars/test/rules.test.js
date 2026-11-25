import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { SPACES, neighbors } from '../public/js/data.js';
import { players, ok, ng, started, give, snapshot } from './helpers.js';

const land = game => SPACES.filter(s => !s.ocean && !s.reserved && !game.tiles[s.id]);

describe('地図', () => {
    it('タルシスは 61 マス、海洋のマスは 12、隣はいつも 6 つまで（たがいに隣）', () => {
        expect(SPACES.length).toBe(61);
        expect(SPACES.filter(s => s.ocean).length).toBe(12);
        for (const s of SPACES) {
            const nb = neighbors(s.id);
            expect(nb.length).toBeLessThanOrEqual(6);
            nb.forEach(o => expect(neighbors(o)).toContain(s.id));
        }
        expect(neighbors('4-4').length).toBe(6);
    });
});

describe('準備', () => {
    it('企業の M€ からカードを 1 枚 3 M€ で買う。生産は全員 1 から。TR 20', () => {
        const game = new Game(players(2), { seed: 3 });
        const d = game.decision;
        expect(d.cards.length).toBe(10);
        expect(d.corps.length).toBe(2);
        d.corps = ['ecoLine'];
        ok(game, 0, { type: 'setup', corp: 'ecoLine', keep: d.cards.slice(0, 3) });
        const p = game.players[0];
        expect(p.res.mc).toBe(36 - 9);
        expect(p.res.plants).toBe(3);
        expect(p.prod).toEqual({ mc: 1, steel: 1, titanium: 1, plants: 3, energy: 1, heat: 1 });
        expect(p.tr).toBe(20);
        expect(p.hand.length).toBe(3);
    });
});

describe('行動と世代', () => {
    it('手番に 2 回まで。パスした人は飛ばす。全員パスで生産（電力は熱へ、M€ は生産 + TR）して次の世代', () => {
        const game = started(2);
        const [a, b] = [game.players[0], game.players[1]];
        a.res.heat = 16;
        ok(game, 0, { type: 'convertHeat' });
        expect(game.decision).toMatchObject({ seat: 0, done: 1 });
        ok(game, 0, { type: 'convertHeat' });
        expect(game.decision.seat).toBe(1);
        ok(game, 1, { type: 'pass' });
        ok(game, 0, { type: 'pass' });
        expect(game.generation).toBe(2);
        expect(game.phase).toBe('research');
        a.res.energy = 0;
        expect(b.res.mc).toBeGreaterThan(0);
    });

    it('生産：電力は熱に変わり、M€ は生産と TR の分', () => {
        const game = started(2);
        const p = game.players[0];
        p.res = { mc: 0, steel: 0, titanium: 0, plants: 0, energy: 3, heat: 0 };
        ok(game, 0, { type: 'pass' });
        ok(game, 1, { type: 'pass' });
        expect(p.res).toMatchObject({ mc: 1 + 20, energy: 1, heat: 3 + 1, steel: 1 });
    });
});

describe('グローバル・パラメータ', () => {
    it('熱 8 で温度 +2℃ と TR +1。-24℃ と -20℃ で熱の生産 +1。0℃ で海洋を置く', () => {
        const game = started(2);
        const p = game.players[0];
        p.res.heat = 8;
        game.temperature = -26;
        ok(game, 0, { type: 'convertHeat' });
        expect(game.temperature).toBe(-24);
        expect(p.tr).toBe(21);
        expect(p.prod.heat).toBe(2);
        game.temperature = -2;
        p.res.heat = 8;
        ok(game, 0, { type: 'convertHeat' });
        expect(game.temperature).toBe(0);
        expect(game.decision).toMatchObject({ kind: 'place', tile: 'ocean' });
    });

    it('酸素 8% で温度 +1 段階。緑地で酸素 +1', () => {
        const game = started(2);
        const p = game.players[0];
        game.oxygen = 7;
        p.res.plants = 8;
        ok(game, 0, { type: 'convertPlants' });
        ok(game, 0, { type: 'place', space: game.decision.options[0] });
        expect(game.oxygen).toBe(8);
        expect(game.temperature).toBe(-28);
        expect(p.tr).toBe(22);
    });
});

describe('タイル', () => {
    it('海洋は海洋のマスだけ。都市は都市の隣に置けない。緑地は自分のタイルの隣があればそこ', () => {
        const game = started(2);
        expect(game.legalSpaces(0, 'ocean').every(id => SPACES.find(s => s.id === id).ocean)).toBe(true);
        game.tiles['6-2'] = { type: 'city', owner: 1 };
        expect(game.legalSpaces(0, 'city')).not.toContain('6-3');
        expect(game.legalSpaces(0, 'city')).not.toContain('6-2');
        game.tiles['8-2'] = { type: 'city', owner: 0 };
        const g = game.legalSpaces(0, 'greenery');
        expect(g.every(id => neighbors(id).includes('8-2'))).toBe(true);
        // ノクティス都市のマスには置けない
        expect(game.legalSpaces(0, 'city')).not.toContain('4-2');
    });

    it('配置ボーナスと、隣の海洋 1 つにつき 2 M€', () => {
        const game = started(2);
        const p = game.players[0];
        game.tiles['0-1'] = { type: 'ocean', owner: null };
        p.res.plants = 8;
        p.res.steel = 0;
        const mc = p.res.mc;
        ok(game, 0, { type: 'convertPlants' });
        ok(game, 0, { type: 'place', space: '0-0' });
        // 0-0 は鋼鉄 2。隣の 0-1 が海洋
        expect(p.res.steel).toBe(2);
        expect(p.res.mc).toBe(mc + 2);
    });
});

describe('カード', () => {
    it('条件（藻類は海洋 5）。インヴェントリックスは 2 ゆるい', () => {
        const game = started(2, { corps: ['inventrix', 'crediCor'] });
        give(game, 0, 'algae');
        give(game, 1, 'algae');
        game.oceans = 3;
        game.players.forEach(p => { p.res.mc = 50; });
        expect(game.canPlay(0, 'algae')).toBe(true);
        expect(game.canPlay(1, 'algae')).toBe(false);
    });

    it('建物タグは鋼鉄 2、宇宙タグはチタン 3（フォボログは 4）で払える。生産の減る分が足りなければ出せない', () => {
        const game = started(2, { corps: ['phoboLog', 'crediCor'] });
        const p = game.players[0];
        give(game, 0, 'asteroid', 'deepWellHeating', 'cloudSeeding');
        p.res.mc = 0;
        p.res.titanium = 4;
        // 小惑星 14 = チタン 4×4 で足りる
        expect(game.canPlay(0, 'asteroid')).toBe(true);
        expect(game.autoPay(0, 'asteroid')).toEqual({ steel: 0, titanium: 4, heat: 0 });
        p.res.mc = 50;
        p.prod.mc = -5;
        // 人工降雨は M€ の生産 -1（-5 より下げられない）
        game.oceans = 3;
        expect(game.canPlay(0, 'cloudSeeding')).toBe(false);
    });

    it('相手の生産を減らす（自分も選べる）・植物を取り除く（選ばなくてもよい）・どちらかを選ぶ', () => {
        const game = started(2);
        const [a, b] = game.players;
        give(game, 0, 'heatTrappers', 'asteroid', 'artificialPhotosynthesis');
        a.res.mc = 100;
        b.prod.heat = 3;
        ok(game, 0, { type: 'play', card: 'heatTrappers', pay: {} });
        // 熱の生産が 2 以上の人だけ（自分は 1 なので選べない）
        expect(game.decision).toMatchObject({ kind: 'target', what: 'decreaseProduction', options: [1] });
        ok(game, 0, { type: 'target', seat: 1 });
        expect(b.prod.heat).toBe(1);
        expect(a.prod.energy).toBe(2);
        b.res.plants = 5;
        ok(game, 0, { type: 'endTurn' });
        ok(game, 1, { type: 'pass' });
        ok(game, 0, { type: 'play', card: 'asteroid', pay: {} });
        expect(game.decision).toMatchObject({ kind: 'target', what: 'removePlants', optional: true });
        ok(game, 0, { type: 'target', seat: 1 });
        expect(b.res.plants).toBe(2);
        ok(game, 0, { type: 'play', card: 'artificialPhotosynthesis', pay: {} });
        expect(game.decision.kind).toBe('choose');
        ok(game, 0, { type: 'choose', index: 0 });
        expect(a.prod.energy).toBe(4);
    });

    it('イベントのタグは、出したあと数えない', () => {
        const game = started(2, { corps: ['crediCor', 'crediCor'] });
        give(game, 0, 'asteroid', 'geothermalPower');
        game.players[0].res.mc = 100;
        ok(game, 0, { type: 'play', card: 'asteroid', pay: {} });
        if (game.decision?.kind === 'target') ok(game, 0, { type: 'target', seat: null });
        ok(game, 0, { type: 'play', card: 'geothermalPower', pay: {} });
        const tags = game.tags(0);
        expect(tags.space ?? 0).toBe(0);
        expect(tags).toMatchObject({ power: 1, building: 1 });
    });
});

describe('企業', () => {
    it('クレディコー：20 M€ 以上で +4。惑星間映画社：イベントで +2。ソーゲート：電力タグと発電所が 3 安い', () => {
        const game = started(2, { corps: ['crediCor', 'thorgate'] });
        const [a, b] = game.players;
        give(game, 0, 'bigAsteroid');
        a.res.mc = 27;
        ok(game, 0, { type: 'play', card: 'bigAsteroid', pay: {} });
        if (game.decision?.kind === 'target') ok(game, 0, { type: 'target', seat: null });
        expect(a.res.mc).toBe(4);
        expect(game.standardCost(1, 'powerPlant')).toBe(8);
        give(game, 1, 'geothermalPower');
        expect(game.cardCost(1, 'geothermalPower')).toBe(11 - 3);
    });

    it('タルシス共和国：最初の行動で都市を置く。都市が置かれるたびに M€ の生産 +1、自分の都市で +3 M€', () => {
        const game = started(2, { corps: ['tharsisRepublic', 'crediCor'] });
        const p = game.players[0];
        expect(game.decision).toMatchObject({ seat: 0, kind: 'place', tile: 'city' });
        const mc = p.res.mc;
        ok(game, 0, { type: 'place', space: '6-3' });
        expect(p.prod.mc).toBe(2);
        expect(p.res.mc).toBe(mc + 3);
        expect(game.decision).toMatchObject({ seat: 0, kind: 'action', done: 1 });
    });

    it('採掘ギルド：配置ボーナスで鋼鉄・チタンを得ると鋼鉄の生産 +1。エコライン：緑地は植物 7', () => {
        const game = started(2, { corps: ['miningGuild', 'ecoLine'] });
        const p = game.players[0];
        p.res.plants = 8;
        ok(game, 0, { type: 'convertPlants' });
        ok(game, 0, { type: 'place', space: '7-0' });
        // 鋼鉄 2 のマスでも、1 回の配置につき +1
        expect(p.prod.steel).toBe(2 + 1);
        expect(game.greeneryCost(1)).toBe(7);
    });

    it('国連火星計画：この世代に TR が上がっていれば、3 M€ で TR +1', () => {
        const game = started(2, { corps: ['unitedNationsMarsInitiative', 'crediCor'] });
        const p = game.players[0];
        ng(game, 0, { type: 'unmi' });
        p.res.heat = 8;
        ok(game, 0, { type: 'convertHeat' });
        ok(game, 0, { type: 'unmi' });
        expect(p.tr).toBe(22);
    });
});

describe('標準プロジェクト・マイルストーン・褒賞', () => {
    it('特許の売却は 1 枚 1 M€。都市は 25 M€ で都市と M€ の生産 +1', () => {
        const game = started(2);
        const p = game.players[0];
        give(game, 0, 'algae', 'lichen');
        p.res.mc = 25;
        ok(game, 0, { type: 'standard', project: 'sellPatents', cards: ['algae', 'lichen'] });
        expect(p.res.mc).toBe(27);
        ok(game, 0, { type: 'standard', project: 'city' });
        ok(game, 0, { type: 'place', space: game.decision.options[0] });
        expect(p.prod.mc).toBe(2);
        expect(p.res.mc).toBeLessThanOrEqual(2 + 3);
    });

    it('マイルストーンは 8 M€ で 3 つまで。褒賞は 8・14・20 M€', () => {
        const game = started(3);
        const p = game.players[0];
        p.res.mc = 100;
        p.tr = 35;
        ok(game, 0, { type: 'milestone', key: 'terraformer' });
        expect(p.res.mc).toBe(92);
        ok(game, 0, { type: 'award', key: 'banker' });
        expect(p.res.mc).toBe(84);
        ng(game, 1, { type: 'milestone', key: 'terraformer' });
        game.decision = { seat: 1, kind: 'action', done: 0 };
        game.players[1].res.mc = 20;
        ok(game, 1, { type: 'award', key: 'miner' });
        expect(game.players[1].res.mc).toBe(6);
    });

    it('褒賞の得点：1 位 5 点、2 位 2 点。1 位が同点なら 2 位なし。2 人のときは 2 位なし', () => {
        const game = started(3);
        game.awards = [{ key: 'thermalist', seat: 0 }];
        game.players.forEach((p, i) => { p.res.heat = [9, 5, 1][i]; });
        expect(game.awardPoints()).toEqual([5, 2, 0]);
        game.players[1].res.heat = 9;
        expect(game.awardPoints()).toEqual([5, 5, 0]);
        const two = started(2);
        two.awards = [{ key: 'thermalist', seat: 0 }];
        two.players.forEach((p, i) => { p.res.heat = [9, 5][i]; });
        expect(two.awardPoints()).toEqual([5, 0]);
    });
});

describe('ゲームの終わり', () => {
    it('3 つのパラメータが最大になった世代の生産のあと、植物を緑地にして、得点（TR・緑地・都市の隣の緑地・カード）', () => {
        const game = started(2);
        const [a] = game.players;
        game.temperature = 8;
        game.oxygen = 14;
        game.oceans = 9;
        game.tiles['6-2'] = { type: 'city', owner: 0 };
        game.tiles['6-3'] = { type: 'greenery', owner: 0 };
        a.played.push('domedCrater');
        a.res.plants = 0;
        a.prod.plants = 8;
        ok(game, 0, { type: 'pass' });
        ok(game, 1, { type: 'pass' });
        expect(game.decision).toMatchObject({ seat: 0, kind: 'finalGreenery' });
        const space = game.decision.options.find(id => neighbors(id).includes('6-2'));
        ok(game, 0, { type: 'finalGreenery', space });
        if (game.decision?.seat === 0) ok(game, 0, { type: 'finalGreenery', space: null });
        expect(game.isOver()).toBe(true);
        expect(game.scores[0]).toMatchObject({ tr: 20, greenery: 2, city: 2, cards: 1, total: 25 });
    });
});

describe('記録', () => {
    it('断る操作は状態を変えず、記録から同じ状態に戻せる', () => {
        const game = new Game(players(3), { seed: 9 });
        ng(game, 1, { type: 'setup', corp: 'x', keep: [] });
        ng(game, 0, { type: 'setup', corp: game.decision.corps[0], keep: ['notACard'] });
        for (let i = 0; i < 3; i++) ok(game, i, { type: 'setup', corp: game.decision.corps[0], keep: game.decision.cards.slice(0, 2) });
        const s = game.decision.seat;
        game.players[s].res.mc = Math.max(game.players[s].res.mc, 25);
        if (game.decision.kind === 'action') ok(game, s, { type: 'standard', project: 'asteroid' });
        const copy = Game.replay(players(3), game.options, JSON.parse(JSON.stringify(game.commands)));
        // 直接書き換えた M€ は記録にないので、比べるのはタイルと温度
        expect(copy.temperature).toBe(game.temperature);
        expect(snapshot(copy).length).toBeGreaterThan(0);
    });
});
