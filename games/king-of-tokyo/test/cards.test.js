import { describe, it, expect } from 'vitest';
import { gameAt, resolveWith, answerAll } from './helpers.js';

const give = (g, seat, ...keys) => g.players[seat].cards.push(...keys);
const NOTHING = ['1', '2', '3', '1', '2', 'energy'];

describe('持ち続けるカード：ダイスと攻撃', () => {
    it('もう1つの頭：ダイスが 1 つ増える。縮小 1 つで 1 つ減る', () => {
        expect(gameAt(3, 0, { setup: g => give(g, 0, 'extraHead') }).dice).toHaveLength(7);
        expect(gameAt(3, 0, { setup: g => { g.players[0].shrink = 2; } }).dice).toHaveLength(4);
    });

    it('巨大な脳：振り直しが 3 回', () => {
        const g = gameAt(3, 0, { setup: g2 => give(g2, 0, 'giantBrain') });
        for (let i = 0; i < 3; i++) expect(g.applyCommand(0, { type: 'reroll', dice: [0] })).toBe(true);
        expect(g.applyCommand(0, { type: 'reroll', dice: [0] })).toBe(false);
    });

    it('エナジードリンク：1 エネルギーで振り直し。煙幕：煙 1 つで振り直し、なくなったら捨てる', () => {
        const g = gameAt(3, 0, { setup: g2 => { give(g2, 0, 'energyDrink'); g2.players[0].energy = 1; g2.turn = null; } });
        g.turn.rerollsLeft = 0;
        expect(g.applyCommand(0, { type: 'reroll', dice: [0] })).toBe(true);
        expect(g.players[0].energy).toBe(0);
        const s = gameAt(3, 0, { setup: g2 => { give(g2, 0, 'smokeCloud'); g2.players[0].smoke = 1; } });
        s.turn.rerollsLeft = 0;
        expect(s.applyCommand(0, { type: 'reroll', dice: [0] })).toBe(true);
        expect(s.players[0].cards).not.toContain('smokeCloud');
    });

    it('背景の住人：3 の目は、振り直しが残っていなくても振り直せる', () => {
        const g = gameAt(3, 0, { setup: g2 => give(g2, 0, 'backgroundDweller') });
        g.turn.rerollsLeft = 0;
        g.dice = ['3', '3', '1', '2', 'claw', 'heart'];
        expect(g.applyCommand(0, { type: 'reroll', dice: [0, 1] })).toBe(true);
        expect(g.applyCommand(0, { type: 'reroll', dice: [2] })).toBe(false);
    });

    it('群れの間引き（毎番 1 回 1 にする）・どんでん返し（好きな目、使ったら捨てる）・伸縮自在（2 エネルギーで好きな目）', () => {
        const g = gameAt(3, 0, { setup: g2 => { give(g2, 0, 'herdCuller', 'plotTwist', 'stretchy'); g2.players[0].energy = 2; } });
        expect(g.applyCommand(0, { type: 'change', index: 0, face: '1', card: 'herdCuller' })).toBe(true);
        expect(g.applyCommand(0, { type: 'change', index: 1, face: '1', card: 'herdCuller' })).toBe(false);
        expect(g.applyCommand(0, { type: 'change', index: 1, face: 'claw', card: 'plotTwist' })).toBe(true);
        expect(g.players[0].cards).not.toContain('plotTwist');
        expect(g.applyCommand(0, { type: 'change', index: 2, face: 'heart', card: 'stretchy' })).toBe(true);
        expect(g.players[0].energy).toBe(0);
        expect(g.dice.slice(0, 3)).toEqual(['1', 'claw', 'heart']);
    });

    it('酸攻撃（毎回 +1 攻撃）・とげの尾（攻撃を出したら +1）・アルファモンスター（攻撃を出したら 1 勝利点）', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'acidAttack', 'spikedTail', 'alphaMonster'); } });
        resolveWith(g, ['claw', '1', '2', '3', 'energy', 'energy']);
        answerAll(g);
        expect(g.players[1].health).toBe(7);
        expect(g.players[0].vp).toBe(1);
    });

    it('酸攻撃だけなら、攻撃の目がなくても 1 攻撃', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'acidAttack'); } });
        resolveWith(g, NOTHING);
        answerAll(g);
        expect(g.players[1].health).toBe(9);
    });

    it('新星の息：攻撃がほかの全員に当たる。火炎の息：攻撃を出したら両隣も 1 失う', () => {
        const g = gameAt(4, 0, { setup: g2 => { g2.tokyo.city = 2; give(g2, 0, 'novaBreath'); } });
        resolveWith(g, ['claw', '1', '2', '3', 'energy', 'energy']);
        answerAll(g);
        expect(g.players.slice(1).map(p => p.health)).toEqual([9, 9, 9]);
        const f = gameAt(4, 0, { setup: g2 => { g2.tokyo.city = 2; give(g2, 0, 'fireBreathing'); } });
        resolveWith(f, ['claw', '1', '2', '3', 'energy', 'energy']);
        answerAll(f);
        // 席の両隣は 1 と 3、東京の 2 は攻撃で 1
        expect(f.players.slice(1).map(p => p.health)).toEqual([9, 9, 9]);
    });

    it('毒針（2・2・2 で +2 攻撃）・美食家（1・1・1 で +2）・雑食（1・2・3 で +2）・完全破壊（6 種類で +9）', () => {
        const q = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'poisonQuills'); } });
        resolveWith(q, ['2', '2', '2', '1', '3', 'energy']);
        answerAll(q);
        expect(q.players[1].health).toBe(8);
        const go = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'gourmet', 'detritivore'); } });
        resolveWith(go, ['1', '1', '1', '2', '3', 'energy']);
        expect(go.players[0].vp).toBe(1 + 2 + 2);
        const cd = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'completeDestruction'); } });
        resolveWith(cd, ['1', '2', '3', 'heart', 'claw', 'energy']);
        answerAll(cd);
        expect(cd.players[0].vp).toBe(9);
    });

    it('都市喰らい：東京で番を始めたら +1、東京で攻撃を出したら +1 攻撃。地中もぐり：東京で +1 攻撃', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 0; give(g2, 0, 'urbavore', 'burrowing'); } });
        expect(g.players[0].vp).toBe(3);
        resolveWith(g, ['claw', '1', '2', '3', 'energy', 'energy']);
        answerAll(g);
        expect(g.players[1].health).toBe(7);
    });
});

describe('持ち続けるカード：守り', () => {
    it('装甲：ちょうど 1 失うときは失わない', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 1, 'armorPlating'); } });
        resolveWith(g, ['claw', '1', '2', '3', 'energy', 'energy']);
        answerAll(g);
        expect(g.players[1].health).toBe(10);
    });

    it('翼：2 エネルギーで、この番は体力を失わない', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 1, 'wings'); g2.players[1].energy = 2; } });
        resolveWith(g, ['claw', 'claw', 'claw', '1', '2', '3']);
        answerAll(g, { wings: () => ({ type: 'wings', yes: true }) });
        expect(g.players[1].health).toBe(10);
        expect(g.players[1].energy).toBe(0);
    });

    it('ジェット：明け渡すことにしたら、その攻撃で体力を失わない', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 1, 'jets'); } });
        resolveWith(g, ['claw', 'claw', 'claw', '1', '2', '3']);
        answerAll(g, { yield: () => ({ type: 'yield', yes: true }) });
        expect(g.players[1].health).toBe(10);
        expect(g.tokyo.city).toBe(0);
    });

    it('急速回復：体力が 0 になるのを、エネルギーで防ぐ', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 1, 'rapidHealing'); g2.players[1].health = 2; g2.players[1].energy = 4; } });
        resolveWith(g, ['claw', 'claw', 'claw', '1', '2', '3']);
        answerAll(g);
        expect(g.players[1].alive).toBe(true);
        expect(g.players[1].health).toBe(1);
        expect(g.players[1].energy).toBe(0);
    });

    it('子どもがいる：体力が 0 になったら、カードと勝利点を失い、体力 10 で東京の外から続ける', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 1, 'itHasAChild', 'extraHead'); g2.players[1].health = 1; g2.players[1].vp = 9; } });
        resolveWith(g, ['claw', 'claw', '1', '2', '3', 'energy']);
        answerAll(g);
        expect(g.players[1]).toMatchObject({ alive: true, health: 10, vp: 0, cards: [] });
        expect(g.tokyo.city).toBe(0);
    });

    it('死肉喰らい：モンスターの体力が 0 になるたびに 3 勝利点', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 2, 'eaterOfTheDead'); g2.players[1].health = 1; } });
        resolveWith(g, ['claw', '1', '2', '3', 'energy', 'energy']);
        answerAll(g);
        expect(g.players[1].alive).toBe(false);
        expect(g.players[2].vp).toBe(3);
    });

    it('再生（回復 +1）・もっと大きく（上限 12）', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'regeneration', 'evenBigger'); g2.players[0].health = 9; } });
        resolveWith(g, ['heart', 'heart', '1', '2', '3', 'energy']);
        expect(g.players[0].health).toBe(12);
    });

    it('逆境に強い：一度に 2 以上失ったら 1 エネルギー', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 1, 'weReOnlyMakingItStronger'); } });
        resolveWith(g, ['claw', 'claw', '1', '2', '3', 'heart']);
        answerAll(g);
        expect(g.players[1].energy).toBe(1);
    });
});

describe('持ち続けるカード：印と番の終わり', () => {
    it('毒の唾：攻撃したモンスターに毒。毒のあるモンスターは、自分の番の終わりに毒 1 つにつき 1 失う', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'poisonSpit'); } });
        resolveWith(g, ['claw', '1', '2', '3', 'energy', 'energy']);
        answerAll(g);
        expect(g.players[1].poison).toBe(1);
        const p = gameAt(3, 1, { setup: g2 => { g2.tokyo.city = 0; g2.players[1].poison = 2; } });
        resolveWith(p, NOTHING);
        answerAll(p);
        expect(p.players[1].health).toBe(8);
    });

    it('ハートの目で、毒と縮小を先に消す', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; g2.players[0].poison = 1; g2.players[0].health = 5; } });
        resolveWith(g, ['heart', 'heart', '1', '2', '3', 'energy']);
        expect(g.players[0].poison).toBe(0);
        expect(g.players[0].health).toBe(6);
    });

    it('草食：誰の体力も減らさなければ 1 勝利点。太陽光発電：エネルギー 0 なら 1。エネルギーの蓄え：6 につき 1 勝利点', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'herbivore', 'solarPowered'); } });
        resolveWith(g, ['1', '2', '3', '1', '2', 'heart']);
        answerAll(g);
        expect(g.players[0].vp).toBe(1);
        expect(g.players[0].energy).toBe(1);
        const h = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'energyHoarder'); g2.players[0].energy = 11; } });
        resolveWith(h, NOTHING);
        answerAll(h);
        expect(h.players[0].vp).toBe(2);
    });

    it('判官びいき：番の終わりに勝利点が一番少なければ 1 勝利点', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'rootingForTheUnderdog'); g2.players[1].vp = 3; g2.players[2].vp = 2; } });
        resolveWith(g, ['1', '2', '3', '1', '2', 'heart']);
        answerAll(g);
        expect(g.players[0].vp).toBe(1);
    });

    it('子どもの味方：エネルギーを得るたびに +1', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'friendOfChildren'); } });
        resolveWith(g, ['energy', 'energy', '1', '2', '3', 'heart']);
        expect(g.players[0].energy).toBe(3);
    });

    it('時間停止：1・1・1 を出した番のあと、ダイスを 1 つ減らしてもう 1 回', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'freezeTime'); } });
        resolveWith(g, ['1', '1', '1', '2', '3', 'heart']);
        answerAll(g);
        expect(g.current).toBe(0);
        expect(g.dice).toHaveLength(5);
    });

    it('バッテリーモンスター：番の初めに 2 エネルギーずつ取り、なくなったら捨てる', () => {
        const g = gameAt(3, 0, { setup: g2 => { give(g2, 0, 'batteryMonster'); g2.players[0].battery = 2; } });
        expect(g.players[0].energy).toBe(2);
        expect(g.players[0].cards).not.toContain('batteryMonster');
    });
});

describe('持ち続けるカード：買い物', () => {
    it('異星の生まれ：1 エネルギー安い。メディアの人気者：買うたびに 1 勝利点', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'alienOrigin', 'mediaFriendly'); g2.players[0].energy = 2; g2.market[0] = 'cornerStore'; } });
        resolveWith(g, ['1', '2', '3', '1', '2', 'heart']);
        expect(g.applyCommand(0, { type: 'buy', card: 'cornerStore' })).toBe(true);
        expect(g.players[0]).toMatchObject({ energy: 0, vp: 2 });
    });

    it('研究所生まれ：山札の一番上を買える。寄生触手：ほかのモンスターのカードを、持ち主に払って買える', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'madeInALab', 'parasiticTentacles'); give(g2, 1, 'giantBrain'); g2.players[0].energy = 20; g2.deck.push('skyscraper'); } });
        resolveWith(g, ['1', '2', '3', '1', '2', 'heart']);
        expect(g.applyCommand(0, { type: 'buyTop' })).toBe(true);
        expect(g.players[0].vp).toBe(4);
        expect(g.applyCommand(0, { type: 'buyFrom', seat: 1, card: 'giantBrain' })).toBe(true);
        expect(g.players[0].cards).toContain('giantBrain');
        expect(g.players[1].energy).toBe(5);
    });

    it('機会主義：新しいカードが場に出たら、ほかの人もすぐ買える', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 2, 'opportunist'); g2.players[0].energy = 3; g2.players[2].energy = 10; g2.market[0] = 'cornerStore'; g2.deck.push('commuterTrain'); } });
        resolveWith(g, ['1', '2', '3', '1', '2', 'heart']);
        g.applyCommand(0, { type: 'buy', card: 'cornerStore' });
        expect(g.decision).toMatchObject({ seat: 2, kind: 'opportunist', cards: ['commuterTrain'] });
        g.applyCommand(2, { type: 'opportunist', card: 'commuterTrain' });
        expect(g.players[2].vp).toBe(2);
        expect(g.decision).toMatchObject({ seat: 0, kind: 'buy' });
    });

    it('ものまね：誰かのカードを写す（もう1つの頭を写せばダイスが増える）', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 1, 'extraHead'); g2.players[0].energy = 8; g2.market[0] = 'mimic'; } });
        resolveWith(g, ['1', '2', '3', '1', '2', 'heart']);
        g.applyCommand(0, { type: 'buy', card: 'mimic' });
        expect(g.decision.kind).toBe('mimic');
        g.applyCommand(0, { type: 'mimic', target: { seat: 1, card: 'extraHead' } });
        expect(g.count(0, 'extraHead')).toBe(1);
    });

    it('変態：番の終わりに、持っているカードを捨てて費用のエネルギーを得る', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 0, 'metamorph', 'giantBrain'); } });
        resolveWith(g, NOTHING);
        answerAll(g, { metamorph: () => ({ type: 'metamorph', cards: ['giantBrain'] }) });
        expect(g.players[0].energy).toBe(1 + 5);
        expect(g.players[0].cards).toEqual(['metamorph']);
    });

    it('癒しの光線：自分のハートでほかのモンスターを回復し、2 エネルギーずつもらう', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 0; give(g2, 0, 'healingRay'); g2.players[1].health = 6; g2.players[1].energy = 5; } });
        resolveWith(g, ['heart', 'heart', '1', '2', '3', 'energy']);
        expect(g.decision.kind).toBe('healingRay');
        g.applyCommand(0, { type: 'healingRay', give: { 1: 2 } });
        expect(g.players[1].health).toBe(8);
        expect(g.players[1].energy).toBe(1);
        expect(g.players[0].energy).toBe(1 + 4);
    });

    it('念力探査：ほかのモンスターの最後の振り直しのあと、ダイスを 1 つ振り直させる', () => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; give(g2, 2, 'psychicProbe'); } });
        g.dice = ['3', '3', '3', '1', '2', 'heart'];
        g.applyCommand(0, { type: 'resolve' });
        expect(g.decision).toMatchObject({ seat: 2, kind: 'psychicProbe' });
        expect(g.applyCommand(2, { type: 'probe', index: 0 })).toBe(true);
        expect(g.events.some(e => e.type === 'probe')).toBe(true);
    });
});

describe('使い捨てのカード', () => {
    const buyAndPlay = (key, setup) => {
        const g = gameAt(3, 0, { setup: g2 => { g2.tokyo.city = 1; g2.players[0].energy = 20; g2.market[0] = key; setup?.(g2); } });
        // ハートの目のない出目で決め、買った直後の状態を見る（番を終えると、次の人の番の得点が入るため）
        resolveWith(g, ['1', '2', '3', '1', '2', '3']);
        expect(g.applyCommand(0, { type: 'buy', card: key })).toBe(true);
        return g;
    };

    it('勝利点・エネルギー・体力のカード', () => {
        expect(buyAndPlay('apartmentBuilding').players[0].vp).toBe(3);
        expect(buyAndPlay('skyscraper').players[0].vp).toBe(4);
        expect(buyAndPlay('energize').players[0].energy).toBe(20 - 8 + 9);
        expect(buyAndPlay('jetFighters').players[0]).toMatchObject({ vp: 5, health: 6 });
        expect(buyAndPlay('nuclearPowerPlant', g => { g.players[0].health = 5; }).players[0]).toMatchObject({ vp: 2, health: 8 });
    });

    it('避難命令：ほかは 5 勝利点を失う。火炎放射器：ほかは 2 失う。高高度爆撃：全員 3 失う', () => {
        const e = buyAndPlay('evacuationOrders', g => { g.players[1].vp = 7; g.players[2].vp = 3; });
        expect(e.players.map(p => p.vp)).toEqual([0, 2, 0]);
        const f = buyAndPlay('flameThrower');
        expect(f.players.map(p => p.health)).toEqual([10, 8, 8]);
        const h = buyAndPlay('highAltitudeBombing');
        expect(h.players.map(p => p.health)).toEqual([7, 7, 7]);
    });

    it('空からの襲撃：+2 勝利点で東京に入り、東京のモンスターは明け渡す', () => {
        const g = buyAndPlay('deathFromAbove');
        expect(g.tokyo.city).toBe(0);
        expect(g.players[0].vp).toBe(2 + 1);
    });

    it('大嵐：ほかは 2 エネルギーにつき 1 を失う。狂乱：もう 1 回手番', () => {
        const v = buyAndPlay('vastStorm', g => { g.players[1].energy = 5; });
        expect(v.players[1].energy).toBe(3);
        const f = buyAndPlay('frenzy');
        f.applyCommand(0, { type: 'endBuy' });
        expect(f.current).toBe(0);
        expect(f.decision.kind).toBe('roll');
    });
});
