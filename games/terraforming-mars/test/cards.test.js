import { describe, it, expect } from 'vitest';
import { CARDS, CORPORATIONS, cardOf } from '../public/js/cards.js';
import { SPACES, neighbors } from '../public/js/data.js';
import { ok, started, give } from './helpers.js';

const CARD_COUNT = 137;

// 判断が出たら、いちばん控えめに答えて行動に戻す
function settle(game, seat) {
    for (let i = 0; i < 20 && game.decision && game.decision.kind !== 'action'; i++) {
        const d = game.decision;
        if (d.kind === 'place') ok(game, d.seat, { type: 'place', space: d.options[0] });
        else if (d.kind === 'target') ok(game, d.seat, { type: 'target', seat: d.options.includes(1) ? 1 : d.options[0] });
        else if (d.kind === 'choose') ok(game, d.seat, { type: 'choose', index: 0 });
        else if (d.kind === 'targetCard') ok(game, d.seat, { type: 'targetCard', seat: d.options[0].seat, card: d.options[0].card });
        else break;
    }
    if (game.decision?.kind === 'action' && game.decision.seat === seat && game.decision.done === 1) ok(game, seat, { type: 'endTurn' });
}

// カードの条件をちょうど満たす状態にする
function satisfy(game, seat, card) {
    for (const r of card.req ?? []) {
        if (r.tag) {
            const donor = CARDS.find(c => c.type !== 'event' && c.tags.includes(r.tag) && c.key !== card.key);
            for (let i = 0; i < r.count; i++) game.players[seat].played.push(donor.key);
        } else if (r.greeneries) game.tiles['8-0'] = { type: 'greenery', owner: seat };
        else if (r.temperature !== undefined) game.temperature = r.temperature;
        else if (r.oxygen !== undefined) game.oxygen = r.oxygen;
        else if (r.oceans !== undefined) game.oceans = r.oceans;
    }
    // 置き場所の条件：都市化地域は、隣に都市が 2 つあるマス
    // 払う資源（コケの植物）
    for (const [r, v] of Object.entries(card.effect.stock ?? {})) if (typeof v === 'number' && v < 0) game.players[seat].res[r] = Math.max(game.players[seat].res[r], -v);
    if (card.effect.tile?.on === 'nextTo2Cities') ['6-0', '6-2'].forEach(id => { game.tiles[id] = { type: 'city', owner: 1 }; });
}

describe('カードのデータ', () => {
    it(`基本ゲーム（企業時代を除く）の入れたカード ${CARD_COUNT} 枚と企業 10 社。番号は重ならない`, () => {
        expect(CARDS.length).toBe(CARD_COUNT);
        expect(CORPORATIONS.length).toBe(10);
        expect(new Set(CARDS.map(c => c.number)).size).toBe(CARD_COUNT);
        expect(new Set(CARDS.map(c => c.name)).size).toBe(CARD_COUNT);
    });

    it('資料で食い違ったカード：開かれた都市は電力の生産 -1（本家の実装の値）', () => {
        expect(cardOf('openCity').effect.production).toEqual({ energy: -1, mc: 4 });
    });

    it.each(CARDS.map(c => [c.key]))('%s は、条件を満たすと出せて、効果を最後まで解決できる', key => {
        const game = started(2, { corps: ['crediCor', 'crediCor'] });
        const card = cardOf(key);
        const p = game.players[0];
        p.res.mc = 200;
        Object.keys(p.prod).forEach(r => { p.prod[r] = 5; });
        game.players[1].prod.heat = 5;
        game.players[1].prod.plants = 5;
        game.players[1].res.plants = 5;
        satisfy(game, 0, card);
        give(game, 0, key);
        expect(game.canPlay(0, key)).toBe(true);
        ok(game, 0, { type: 'play', card: key, pay: {} });
        settle(game, 0);
        expect(p.played).toContain(key);
        expect(p.hand).not.toContain(key);
        // 行動を持つカードは、選び方ごとに行動を使って解決できる
        const variants = game.actionVariants(key);
        variants.forEach((v, i) => {
            p.used = [];
            p.res.energy = 10;
            p.res.mc = 50;
            p.cardRes[key] = 5;
            // 取り除く・ほかのカードに載せる相手を用意する
            game.players[1].played.push('fish', 'ants');
            game.players[1].cardRes = { fish: 2, ants: 2 };
            if (!p.played.includes('decomposers') && key !== 'decomposers') p.played.push('decomposers');
            if (game.decision?.seat !== 0 || game.decision.kind !== 'action') game.decision = { seat: 0, kind: 'action', done: 0 };
            expect(game.canCardAction(0, key, i), `${key} の行動 ${i}`).toBe(true);
            ok(game, 0, { type: 'cardAction', card: key, variant: i });
            settle(game, 0);
            expect(p.used.includes(key) || game.generation > 1).toBe(true);
        });
    });
});

describe('効果の種類ごと', () => {
    function play(key, setup = () => {}) {
        const game = started(2, { corps: ['crediCor', 'crediCor'] });
        const p = game.players[0];
        p.res.mc = 200;
        setup(game);
        satisfy(game, 0, cardOf(key));
        give(game, 0, key);
        ok(game, 0, { type: 'play', card: key, pay: {} });
        return game;
    }

    it('生産（藻類：植物の生産 +2 と植物 1）', () => {
        const game = play('algae');
        expect(game.players[0].prod.plants).toBe(3);
        expect(game.players[0].res.plants).toBe(1);
    });

    it('グローバル（温度・酸素）と TR（彗星：温度 +1・海洋）', () => {
        const game = play('comet');
        expect(game.temperature).toBe(-28);
        expect(game.decision).toMatchObject({ kind: 'place', tile: 'ocean' });
        ok(game, 0, { type: 'place', space: game.decision.options[0] });
        expect(game.oceans).toBe(1);
        expect(game.players[0].tr).toBe(22);
    });

    it('TR だけ上げる（磁場発生装置：TR +3、電力の生産 -4、植物の生産 +2）', () => {
        const game = play('magneticFieldGenerators', g => { g.players[0].prod.energy = 4; });
        expect(game.players[0].tr).toBe(23);
        expect(game.players[0].prod).toMatchObject({ energy: 0, plants: 3 });
    });

    it('海洋のマスに置く緑地（マングローブ）', () => {
        const game = play('mangrove');
        expect(game.decision.options.every(id => ['0-1', '0-3', '0-4', '1-5', '3-7', '4-3', '4-4', '4-5', '5-5', '5-6', '5-7', '8-4'].includes(id))).toBe(true);
    });

    it('都市を置く（地下都市）', () => {
        const game = play('undergroundCity', g => { g.players[0].prod.energy = 2; });
        expect(game.decision).toMatchObject({ kind: 'place', tile: 'city' });
    });

    it('カードを引く（エウロパからの輸送船団）', () => {
        const game = play('convoyFromEuropa');
        ok(game, 0, { type: 'place', space: game.decision.options[0] });
        expect(game.players[0].hand.length).toBe(1);
    });

    it('点：移民シャトルは都市 3 つにつき 1 点', () => {
        const game = play('immigrationShuttles');
        ['6-0', '6-2', '6-4', '8-0', '8-2', '8-4'].forEach((id, i) => { game.tiles[id] = { type: 'city', owner: i % 2 }; });
        expect(game.cardVp(0)).toBe(2);
    });

    it('数で決まる効果：送電網は自分の電力タグの数（これを含む）、省エネルギーは都市の数、ミミズは微生物タグ 2 つにつき 1', () => {
        const grid = play('powerGrid', g => { g.players[0].played.push('solarPower', 'geothermalPower'); });
        expect(grid.players[0].prod.energy).toBe(1 + 3);
        const saving = play('energySaving', g => { g.tiles['6-0'] = { type: 'city', owner: 1 }; g.tiles['6-4'] = { type: 'city', owner: 0 }; });
        expect(saving.players[0].prod.energy).toBe(1 + 2);
        const worms = play('worms', g => { g.oxygen = 4; g.players[0].played.push('industrialMicrobes', 'designedMicroOrganisms'); });
        expect(worms.players[0].prod.plants).toBe(1 + 1);
    });

    it('行動は 1 世代に 1 回。使ったかの印は生産のあとに戻る', () => {
        const game = play('equatorialMagnetizer');
        const p = game.players[0];
        ok(game, 0, { type: 'cardAction', card: 'equatorialMagnetizer', variant: 0 });
        expect(p.tr).toBe(21);
        expect(game.canCardAction(0, 'equatorialMagnetizer', 0)).toBe(false);
        game.production();
        expect(p.used).toEqual([]);
    });

    it('資源：微生物を貯めて使う（温室効果ガスを出す細菌）、資源の点（鳥は動物 1 つ 1 点、小動物は 2 つ 1 点）', () => {
        const game = play('gHGProducingBacteria');
        const p = game.players[0];
        p.cardRes.gHGProducingBacteria = 2;
        ok(game, 0, { type: 'cardAction', card: 'gHGProducingBacteria', variant: 0 });
        expect(p.cardRes.gHGProducingBacteria).toBe(0);
        expect(game.temperature).toBe(-28);
        p.played.push('birds', 'smallAnimals');
        p.cardRes.birds = 3;
        p.cardRes.smallAnimals = 3;
        expect(game.cardVp(0)).toBe(3 + 1);
    });

    it('捕食動物はほかのカードの動物を取り除く（ペットの動物は取り除けない）', () => {
        const game = play('predators');
        game.players[1].played.push('pets', 'fish');
        game.players[1].cardRes = { pets: 3, fish: 1 };
        ok(game, 0, { type: 'cardAction', card: 'predators', variant: 0 });
        expect(game.decision.options).toEqual([{ seat: 1, card: 'fish' }]);
        ok(game, 0, { type: 'targetCard', seat: 1, card: 'fish' });
        expect(game.players[1].cardRes.fish).toBe(0);
        expect(game.players[0].cardRes.predators).toBe(1);
    });

    it('誘発：分解者（植物・微生物・動物のタグ）、草食動物（自分の緑地）、ペット（だれかの都市）', () => {
        const game = play('decomposers');
        const p = game.players[0];
        expect(p.cardRes.decomposers).toBe(1);
        give(game, 0, 'lichen');
        game.temperature = -24;
        ok(game, 0, { type: 'play', card: 'lichen', pay: {} });
        expect(p.cardRes.decomposers).toBe(2);
        p.played.push('herbivores', 'pets');
        p.res.plants = 8;
        game.decision = { seat: 0, kind: 'action', done: 0 };
        ok(game, 0, { type: 'convertPlants' });
        ok(game, 0, { type: 'place', space: game.decision.options[0] });
        expect(p.cardRes.herbivores).toBe(1);
        game.decision = { seat: 0, kind: 'action', done: 0 };
        p.res.mc = 25;
        ok(game, 0, { type: 'standard', project: 'city' });
        ok(game, 0, { type: 'place', space: game.decision.options[0] });
        expect(p.cardRes.pets).toBe(1);
    });

    it('生命探査：めくったカードに微生物タグがあれば科学の資源。1 つでもあれば 3 点', () => {
        const game = play('searchForLife');
        const p = game.players[0];
        const i = game.deck.indexOf('ants');
        if (i >= 0) game.deck.splice(i, 1);
        game.deck.push('ants');
        ok(game, 0, { type: 'cardAction', card: 'searchForLife', variant: 0 });
        expect(p.cardRes.searchForLife).toBe(1);
        expect(game.cardVp(0)).toBe(3);
    });

    it('上限の条件（古細菌は -18℃ 以下）', () => {
        const game = started(2, { corps: ['crediCor', 'crediCor'] });
        give(game, 0, 'archaeBacteria');
        game.players[0].res.mc = 50;
        game.temperature = -16;
        expect(game.canPlay(0, 'archaeBacteria')).toBe(false);
        game.temperature = -18;
        expect(game.canPlay(0, 'archaeBacteria')).toBe(true);
    });
});

describe('特別なタイル', () => {
    function play(key, setup = () => {}) {
        const game = started(2, { corps: ['crediCor', 'crediCor'] });
        game.players[0].res.mc = 200;
        Object.keys(game.players[0].prod).forEach(r => { game.players[0].prod[r] = 3; });
        satisfy(game, 0, cardOf(key));
        setup(game);
        give(game, 0, key);
        ok(game, 0, { type: 'play', card: key, pay: {} });
        return game;
    }
    const tile = (type, owner = 1) => ({ type, owner });

    it('溶岩流：火山のマス 4 つにだけ置け、温度 +2 段階', () => {
        const game = play('lavaFlows');
        expect(game.temperature).toBe(-26);
        expect([...game.decision.options].sort()).toEqual(['1-1', '2-0', '3-0', '4-0']);
        ok(game, 0, { type: 'place', space: '3-0' });
        expect(game.tiles['3-0']).toEqual({ type: 'special', owner: 0, card: 'lavaFlows' });
        // 配置ボーナス（植物・チタン）も得る
        expect(game.players[0].res).toMatchObject({ plants: 1, titanium: 1 });
    });

    it('モホール地帯：海洋のマスに置き、熱の生産 +4。海洋には数えない', () => {
        const game = play('moholeArea');
        expect(game.decision.options.every(id => SPACES.find(s => s.id === id).ocean)).toBe(true);
        ok(game, 0, { type: 'place', space: '4-4' });
        expect(game.oceans).toBe(0);
        expect(game.players[0].prod.heat).toBe(7);
        expect(game.legalSpaces(0, 'ocean')).not.toContain('4-4');
    });

    it('自然保護区：どのタイルとも隣り合わないマスだけ。酸素 4% 以下', () => {
        const game = play('naturalPreserve', g => { g.tiles['6-3'] = tile('city'); });
        const near = ['6-2', '6-4', ...neighbors('6-3')];
        expect(game.decision.options.some(id => near.includes(id))).toBe(false);
        ok(game, 0, { type: 'place', space: '8-0' });
        expect(game.players[0].prod.mc).toBe(4);
        const late = started(2);
        give(late, 0, 'naturalPreserve');
        late.players[0].res.mc = 50;
        late.oxygen = 5;
        expect(late.canPlay(0, 'naturalPreserve')).toBe(false);
    });

    it('核地帯：陸に置き、温度 +2 段階、-2 点', () => {
        const game = play('nuclearZone');
        expect(game.decision.options.every(id => !SPACES.find(s => s.id === id).ocean)).toBe(true);
        ok(game, 0, { type: 'place', space: '6-0' });
        expect(game.temperature).toBe(-26);
        expect(game.cardVp(0)).toBe(-2);
    });

    it('採掘権：鋼鉄かチタンの配置ボーナスのマスに置き、その生産 +1', () => {
        const game = play('miningRights');
        expect(game.decision.options.every(id => SPACES.find(s => s.id === id).bonus.some(b => b === 'steel' || b === 'titanium'))).toBe(true);
        ok(game, 0, { type: 'place', space: '7-5' });
        expect(game.players[0].prod).toMatchObject({ titanium: 4, steel: 3 });
        expect(game.players[0].res.titanium).toBe(1);
    });

    it('都市化地域：都市 2 つの隣にだけ置ける（都市どうしの隣でもよい）。置けるマスがなければ出せない', () => {
        const game = play('urbanizedArea');
        expect(game.decision.options).toEqual(['6-1']);
        const none = started(2);
        give(none, 0, 'urbanizedArea');
        none.players[0].res.mc = 50;
        expect(none.canPlay(0, 'urbanizedArea')).toBe(false);
    });

    it('人工湖：海洋のマスでない陸に海洋を置く。海洋が 9 枚なら効果なしで出せる', () => {
        const game = play('artificialLake');
        expect(game.decision.options.every(id => !SPACES.find(s => s.id === id).ocean)).toBe(true);
        ok(game, 0, { type: 'place', space: '6-0' });
        expect(game.tiles['6-0'].type).toBe('ocean');
        expect(game.oceans).toBe(1);
        expect(game.players[0].tr).toBe(21);
        const full = play('artificialLake', g => { g.oceans = 9; });
        expect(full.players[0].played).toContain('artificialLake');
        expect(full.decision.kind).toBe('action');
    });

    it('ノクティス都市：予約のマスに選ばずに置く（隣に都市があってもよい）', () => {
        const game = play('noctisCity', g => { g.tiles['4-1'] = tile('city'); });
        expect(game.tiles['4-2']).toMatchObject({ type: 'city', owner: 0 });
        expect(game.players[0].prod).toMatchObject({ energy: 2, mc: 6 });
        expect(game.legalSpaces(0, 'city')).not.toContain('4-2');
    });

    it('フォボス宇宙基地・ガニメデ植民地：火星の外の都市。都市の数には入るが、火星の上の都市には入らない', () => {
        const game = play('phobosSpaceHaven', g => { g.players[0].corp = 'tharsisRepublic'; });
        const p = game.players[0];
        expect(game.tiles.phobos).toMatchObject({ type: 'city', owner: 0 });
        expect(p.prod.titanium).toBe(4);
        // タルシス共和国：自分の都市で +3 M€。火星の外なので生産は増えない
        expect(p.prod.mc).toBe(3);
        expect(game.cities()).toBe(1);
        expect(game.citiesOnMars()).toBe(0);
        expect(game.amount(0, { count: 'citiesOnMars' })).toBe(0);
        expect(game.tilesOf(0, 'city')).toEqual(['phobos']);
        expect(game.cardVp(0)).toBe(3);
        give(game, 0, 'ganymedeColony');
        p.played.push('asteroidMining');
        ok(game, 0, { type: 'play', card: 'ganymedeColony', pay: {} });
        expect(game.tiles.ganymede).toMatchObject({ type: 'city', owner: 0 });
        // 木星タグ 1 つにつき 1 点（ガニメデ植民地自身を含む）
        expect(game.cardVp(0)).toBe(3 + 2 + 2);
        expect(game.canPlay(0, 'phobosSpaceHaven')).toBe(false);
    });

    it('首都：都市として数え、隣の海洋 1 つにつき 1 点', () => {
        const game = play('capital');
        ok(game, 0, { type: 'place', space: '3-6' });
        expect(game.tiles['3-6']).toEqual({ type: 'city', owner: 0, card: 'capital' });
        expect(game.players[0].prod).toMatchObject({ energy: 1, mc: 8 });
        game.tiles['3-7'] = { type: 'ocean', owner: null };
        game.tiles['4-6'] = { type: 'ocean', owner: null };
        game.tiles['3-5'] = { type: 'greenery', owner: 1 };
        expect(game.cardVp(0)).toBe(2);
        expect(game.score(0, [0, 0]).city).toBe(1);
        expect(game.milestoneProgress(0, 'mayor')).toBe(1);
    });
});

describe('常時の効果', () => {
    function withCards(keys, setup = () => {}) {
        const game = started(2, { corps: ['crediCor', 'crediCor'] });
        const p = game.players[0];
        p.res.mc = 200;
        Object.keys(p.prod).forEach(r => { p.prod[r] = 3; });
        p.played.push(...keys);
        setup(game);
        return game;
    }

    it('適応技術：温度・酸素・海洋の条件が 2 段階ゆるい（上限の条件も）', () => {
        const game = withCards(['adaptationTechnology']);
        give(game, 0, 'algae', 'archaeBacteria', 'lichen');
        game.oceans = 3;
        game.temperature = -28;
        expect(game.canPlay(0, 'algae')).toBe(true);
        expect(game.canPlay(0, 'lichen')).toBe(true);
        game.temperature = -14;
        expect(game.canPlay(0, 'archaeBacteria')).toBe(true);
        game.oceans = 2;
        expect(game.canPlay(0, 'algae')).toBe(false);
    });

    it('特別設計：この世代に次に出す 1 枚だけ、条件が 2 段階ゆるい', () => {
        const game = withCards([]);
        give(game, 0, 'specialDesign', 'algae', 'kelpFarming');
        game.oceans = 4;
        game.players[0].res.plants = 0;
        expect(game.canPlay(0, 'kelpFarming')).toBe(false);
        ok(game, 0, { type: 'play', card: 'specialDesign', pay: {} });
        expect(game.reqSlack(0)).toBe(2);
        expect(game.canPlay(0, 'kelpFarming')).toBe(true);
        expect(game.canPlay(0, 'algae')).toBe(true);
        ok(game, 0, { type: 'play', card: 'algae', pay: {} });
        expect(game.reqSlack(0)).toBe(0);
        expect(game.canPlay(0, 'kelpFarming')).toBe(false);
        // 使わなかった分は、生産で消える
        game.players[0].specialDesign = true;
        game.production();
        expect(game.reqSlack(0)).toBe(0);
    });

    it('研究前哨基地：カードの費用 -1、どのタイルとも隣り合わないマスに都市。シャトル：宇宙タグのカードの費用 -2（合わせて -3）', () => {
        const game = withCards(['researchOutpost', 'shuttles']);
        expect(game.cardCost(0, 'lichen')).toBe(6);
        expect(game.cardCost(0, 'asteroid')).toBe(11);
        expect(game.cardCost(0, 'localHeatTrapping')).toBe(0);
        const g2 = withCards([], g => { g.tiles['6-3'] = { type: 'greenery', owner: 1 }; });
        give(g2, 0, 'researchOutpost');
        ok(g2, 0, { type: 'play', card: 'researchOutpost', pay: {} });
        expect(g2.decision.options.some(id => ['6-2', '6-4', ...neighbors('6-3')].includes(id))).toBe(false);
        expect(g2.decision.tile).toBe('city');
    });

    it('移民都市：都市を置いてから電力 -1・M€ -2。だれかが都市を置くたびに M€ の生産 +1（自分の都市を含む）', () => {
        const game = withCards([]);
        const p = game.players[0];
        give(game, 0, 'immigrantCity');
        ok(game, 0, { type: 'play', card: 'immigrantCity', pay: {} });
        ok(game, 0, { type: 'place', space: game.decision.options[0] });
        expect(p.prod).toMatchObject({ energy: 2, mc: 3 + 1 - 2 });
        game.decision = { seat: 1, kind: 'action', done: 0 };
        game.players[1].res.mc = 30;
        ok(game, 1, { type: 'standard', project: 'city' });
        ok(game, 1, { type: 'place', space: game.decision.options[0] });
        expect(p.prod.mc).toBe(3);
        // M€ の生産が -4 なら出せる（自分の都市の +1 が先に入る）。-5 なら出せない
        const low = withCards([]);
        give(low, 0, 'immigrantCity');
        low.players[0].prod.mc = -4;
        expect(low.canPlay(0, 'immigrantCity')).toBe(true);
        low.players[0].prod.mc = -5;
        expect(low.canPlay(0, 'immigrantCity')).toBe(false);
    });

    it('極地の藻類：だれかが海洋を置くたびに植物 +2。探査車の製造：だれかが都市を置くたびに +2 M€（火星の外を含む）', () => {
        const game = withCards(['arcticAlgae', 'roverConstruction']);
        const p = game.players[0];
        game.decision = { seat: 1, kind: 'action', done: 0 };
        game.players[1].res.mc = 100;
        ok(game, 1, { type: 'standard', project: 'aquifer' });
        ok(game, 1, { type: 'place', space: game.decision.options[0] });
        expect(p.res.plants).toBe(2);
        const before = p.res.mc;
        game.decision = { seat: 1, kind: 'action', done: 0 };
        give(game, 1, 'phobosSpaceHaven');
        ok(game, 1, { type: 'play', card: 'phobosSpaceHaven', pay: {} });
        expect(p.res.mc).toBe(before + 2);
    });

    it('最適な空力ブレーキ：宇宙タグのイベントを出すと +3 M€・熱 +3（宇宙タグでないイベントや、イベントでない宇宙タグでは何もない）', () => {
        const game = withCards(['optimalAerobraking']);
        const p = game.players[0];
        give(game, 0, 'importedGHG', 'localHeatTrapping', 'solarWindPower');
        ok(game, 0, { type: 'play', card: 'importedGHG', pay: {} });
        expect(p.res).toMatchObject({ mc: 200 - 7 + 3, heat: 3 + 3 });
        ok(game, 0, { type: 'endTurn' });
        game.decision = { seat: 0, kind: 'action', done: 0 };
        ok(game, 0, { type: 'play', card: 'localHeatTrapping', pay: {} });
        expect(p.res.heat).toBe(6);
        ok(game, 0, { type: 'play', card: 'solarWindPower', pay: {} });
        expect(p.res.heat).toBe(6);
    });
});

describe('条件や選択で変わる効果', () => {
    function play(key, setup = () => {}) {
        const game = started(2, { corps: ['crediCor', 'crediCor'] });
        const p = game.players[0];
        p.res.mc = 200;
        Object.keys(p.prod).forEach(r => { p.prod[r] = 3; });
        satisfy(game, 0, cardOf(key));
        setup(game);
        give(game, 0, key);
        ok(game, 0, { type: 'play', card: key, pay: {} });
        return game;
    }

    it('洪水：置いた海洋の隣のタイルの持ち主（自分を除く）から 4 M€ を取り除いてよい。隣に相手のタイルがなければ選ばない', () => {
        const game = play('flooding', g => {
            g.tiles['4-2'] = { type: 'city', owner: 1 };
            g.tiles['5-4'] = { type: 'greenery', owner: 0 };
            g.players[1].res.mc = 3;
        });
        ok(game, 0, { type: 'place', space: '4-3' });
        expect(game.decision).toMatchObject({ kind: 'target', what: 'removeMc', options: [1], optional: true });
        ok(game, 0, { type: 'target', seat: 1 });
        expect(game.players[1].res.mc).toBe(0);
        expect(game.cardVp(0)).toBe(-1);
        const quiet = play('flooding');
        ok(quiet, 0, { type: 'place', space: '0-1' });
        expect(quiet.decision.kind).toBe('action');
    });

    it('断熱：熱の生産を好きなだけ M€ の生産に変える。熱の生産がなければ出せない', () => {
        const game = play('insulation');
        expect(game.decision.kind).toBe('choose');
        expect(game.decision.options.length).toBe(3);
        ok(game, 0, { type: 'choose', index: 1 });
        expect(game.players[0].prod).toMatchObject({ heat: 1, mc: 5 });
        const none = started(2);
        give(none, 0, 'insulation');
        none.players[0].res.mc = 10;
        none.players[0].prod.heat = 0;
        expect(none.canPlay(0, 'insulation')).toBe(false);
    });

    it('大輸送船団：海洋・2 枚引く。動物のカードがなければ植物 +5、あれば植物か動物 4 を選ぶ', () => {
        const plain = play('largeConvoy');
        ok(plain, 0, { type: 'place', space: '0-1' });
        expect(plain.players[0].res.plants).toBe(5);
        expect(plain.players[0].hand.length).toBe(2);
        const animals = play('largeConvoy', g => { g.players[0].played.push('fish', 'birds'); });
        ok(animals, 0, { type: 'place', space: '0-1' });
        expect(animals.decision.kind).toBe('choose');
        ok(animals, 0, { type: 'choose', index: 1 });
        ok(animals, 0, { type: 'targetCard', seat: 0, card: 'birds' });
        expect(animals.players[0].cardRes.birds).toBe(4);
        expect(animals.players[0].res.plants).toBe(0);
    });

    it('水素の輸入：植物 3、微生物 3、動物 2 から、載せられるものだけを選べる', () => {
        const game = play('importedHydrogen', g => { g.players[0].played.push('ants'); });
        expect(game.decision).toMatchObject({ kind: 'place', tile: 'ocean' });
        ok(game, 0, { type: 'place', space: '0-1' });
        expect(game.decision.options).toEqual([{ stock: { plants: 3 } }, { addAny: { type: 'microbe', count: 3 } }]);
        ok(game, 0, { type: 'choose', index: 1 });
        expect(game.players[0].cardRes.ants).toBe(3);
        expect(game.decision.kind).toBe('action');
    });

    it('コケ・好窒素性のコケ：植物を 1・2 払う（足りなければ出せない）', () => {
        const game = play('nitrophilicMoss', g => { g.players[0].res.plants = 2; });
        expect(game.players[0].res.plants).toBe(0);
        expect(game.players[0].prod.plants).toBe(5);
        give(game, 0, 'moss');
        expect(game.canPlay(0, 'moss')).toBe(false);
        game.players[0].res.plants = 1;
        expect(game.canPlay(0, 'moss')).toBe(true);
    });

    it('極寒の菌類：植物 1 か、ほかのカードに微生物 2（-10℃ 以下）', () => {
        const game = play('extremeColdFungus');
        expect(game.canCardAction(0, 'extremeColdFungus', 1)).toBe(false);
        game.players[0].played.push('ants');
        ok(game, 0, { type: 'cardAction', card: 'extremeColdFungus', variant: 1 });
        expect(game.players[0].cardRes.ants).toBe(2);
    });

    it('窒素の豊富な小惑星：TR +2・温度 +1。植物の生産 +1、植物タグが 3 つ以上なら +4', () => {
        const few = play('nitrogenRichAsteroid', g => { g.players[0].played.push('lichen', 'grass'); });
        expect(few.players[0].prod.plants).toBe(4);
        expect(few.players[0].tr).toBe(23);
        expect(few.temperature).toBe(-28);
        const many = play('nitrogenRichAsteroid', g => { g.players[0].played.push('lichen', 'grass', 'trees'); });
        expect(many.players[0].prod.plants).toBe(7);
    });
});
