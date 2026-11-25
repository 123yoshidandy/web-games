/**
 * ヴィティカルチャーのカードと盤面のデータ
 * 訪問者カードの効果は「手順」（{ op, ... } の並び）で書き、game.js の exec が1つずつ行う
 * 手順の種類は game.js の先頭の説明を参照
 */

// ---- ブドウ（植えるカード） ----

// red・white：収穫したときのブドウの価値。needs：植えるのに要る建物
export const VINE_TYPES = [
    { type: 'sangiovese', name: 'サンジョヴェーゼ', red: 1, white: 0, needs: [], count: 6 },
    { type: 'malvasia', name: 'マルヴァジア', red: 0, white: 1, needs: [], count: 6 },
    { type: 'pinot', name: 'ピノ', red: 1, white: 1, needs: ['trellis'], count: 6 },
    { type: 'syrah', name: 'シラー', red: 2, white: 0, needs: ['trellis'], count: 5 },
    { type: 'trebbiano', name: 'トレッビアーノ', red: 0, white: 2, needs: ['trellis'], count: 5 },
    { type: 'merlot', name: 'メルロー', red: 3, white: 0, needs: ['irrigation'], count: 5 },
    { type: 'sauvignon', name: 'ソーヴィニヨン・ブラン', red: 0, white: 3, needs: ['irrigation'], count: 5 },
    { type: 'cabernet', name: 'カベルネ', red: 4, white: 0, needs: ['trellis', 'irrigation'], count: 4 },
    { type: 'chardonnay', name: 'シャルドネ', red: 0, white: 4, needs: ['trellis', 'irrigation'], count: 4 }
];

// ---- 注文 ----

// 要るワインの書き方：r＝赤・w＝白・b＝ブラッシュ・s＝スパークリング、数字はその価値以上
const ORDER_LIST = [
    'r2 w2', 'r3 w1', 'r1 w3', 'r3 w3', 'r4 w2', 'r2 w4', 'r5', 'w5', 'r6', 'w6', 'r4 r2', 'w4 w2',
    'b4', 'b5', 'b6', 'b7', 'r3 b4', 'w3 b4', 'r5 w5', 'r6 w4', 'r4 w6', 'r7', 'w7', 'b8',
    's7', 's8', 's9', 'r7 w5', 'r5 w7', 'b6 r4', 'b6 w4', 's7 r3', 's7 w3', 'r8 w8', 'b9', 'r6 r6'
];
export const WINE_KINDS = ['red', 'white', 'blush', 'sparkling'];
export const WINE_NAME = { red: '赤', white: '白', blush: 'ブラッシュ', sparkling: 'スパークリング' };
const KIND_OF = { r: 'red', w: 'white', b: 'blush', s: 'sparkling' };

// 点と残りの収入は、要るワインの価値の合計から決める（ブラッシュ・スパークリングは造るのに地下室が要るので少し上乗せ）
function orderReward(wines) {
    const sum = wines.reduce((s, w) => s + w.min, 0);
    const extra = wines.reduce((s, w) => s + (w.kind === 'blush' ? 0.6 : w.kind === 'sparkling' ? 1.2 : 0), 0);
    const vp = Math.max(1, Math.round(sum / 2 + extra));
    const residual = sum <= 5 ? 2 : sum <= 9 ? 1 : 0;
    return { vp, residual };
}

// ---- 建物 ----

export const STRUCTURES = [
    { id: 'trellis', name: 'ブドウ棚', cost: 2, text: '棚の要るブドウ（ピノ・シラー・トレッビアーノ・カベルネ・シャルドネ）を植えられる' },
    { id: 'irrigation', name: '水路', cost: 3, text: '水の要るブドウ（メルロー・ソーヴィニヨン・ブラン・カベルネ・シャルドネ）を植えられる' },
    { id: 'yoke', name: 'くびき', cost: 2, text: '自分だけの行動の場所。夏か冬に人を置いて、ブドウを1本抜くか、畑を1つ収穫する' },
    { id: 'windmill', name: '風車', cost: 5, text: 'ブドウを植えたとき1点（1年に1回まで）' },
    { id: 'cottage', name: '離れ', cost: 4, text: '秋に訪問者カードをもう1枚引く' },
    { id: 'tasting', name: '試飲室', cost: 6, text: '見学を受け入れたとき、ワインが1つ以上あれば1点（1年に1回まで）' },
    { id: 'medium', name: '中の地下室', cost: 4, text: '価値4〜6のワインを置ける。ブラッシュを造れる' },
    { id: 'large', name: '大きな地下室', cost: 6, text: '価値7〜9のワインを置ける。スパークリングを造れる（中の地下室が先に要る）' }
];
export const STRUCTURE = Object.fromEntries(STRUCTURES.map(s => [s.id, s]));

// ---- 訪問者カード ----

// options：選べる効果（1つなら選ばずに行う）。tasks：行う手順
const T = {
    lira: (n) => ({ op: 'lira', n }),
    vp: (n) => ({ op: 'vp', n }),
    residual: (n) => ({ op: 'residual', n }),
    draw: (deck, n = 1) => ({ op: 'draw', deck, n }),
    drawVisitor: (n = 1) => ({ op: 'drawVisitor', n }),
    drawAny: (n = 1) => ({ op: 'drawAny', n }),
    plant: (n = 1, more = {}) => ({ op: 'plant', n, ...more }),
    build: (more = {}) => ({ op: 'build', discount: 0, ...more }),
    harvest: (n = 1) => ({ op: 'harvest', n }),
    make: (n = 2) => ({ op: 'make', n }),
    fill: (bonus = 0) => ({ op: 'fill', bonus }),
    train: (cost) => ({ op: 'train', cost })
};

const opt = (label, ...tasks) => ({ label, tasks });

export const SUMMER_VISITORS = [
    { name: '測量士', options: [opt('空いている畑1つにつき2リラ', { op: 'perEmptyField', lira: 2 }), opt('ブドウのある畑1つにつき1点', { op: 'perPlantedField', vp: 1 })] },
    { name: '仲買人', options: [opt('9リラ払って3点', T.lira(-9), T.vp(3)), opt('2点失って6リラ', T.vp(-2), T.lira(6))] },
    { name: 'ワイン評論家', options: [opt('訪問者カードを2枚引く', T.drawVisitor(2)), opt('価値7以上のワインを1つ捨てて4点', { op: 'discardWine', min: 7 }, T.vp(4))] },
    { name: '鍛冶屋', options: [opt('建物を2リラ引きで建てる（もとの値段が5以上なら、さらに1点）', T.build({ discount: 2, vpIfCost5: true }))] },
    {
        name: '請負人', options: [
            opt('1点と、建物を建てる', T.vp(1), T.build()),
            opt('1点と、ブドウを1本植える', T.vp(1), T.plant(1)),
            opt('建物を建てて、ブドウを1本植える', T.build(), T.plant(1))
        ]
    },
    { name: '観光ガイド', options: [opt('4リラ', T.lira(4)), opt('畑を1つ収穫', T.harvest(1))] },
    { name: '新人ガイド', options: [opt('3リラ', T.lira(3)), opt('ワインを2つまで造る', T.make(2))] },
    { name: '無免許の仲買人', options: [opt('3点失って9リラ', T.vp(-3), T.lira(9)), opt('6リラ払って2点', T.lira(-6), T.vp(2))] },
    { name: '植木屋', options: [opt('ブドウを2本まで植えて、1リラ', T.plant(2), T.lira(1)), opt('ブドウを1本抜いて捨て、2点', { op: 'uprootDiscard', n: 1 }, T.vp(2))] },
    {
        name: '買い付け人', options: [
            opt('2リラ払って、価値1の赤ブドウ', T.lira(-2), { op: 'gainGrape', colors: ['red'], value: 1 }),
            opt('2リラ払って、価値1の白ブドウ', T.lira(-2), { op: 'gainGrape', colors: ['white'], value: 1 }),
            opt('ブドウを1つ捨てて、2リラと1点', { op: 'discardGrape' }, T.lira(2), T.vp(1))
        ]
    },
    { name: '庭師', options: [opt('ブドウのカードを1枚引いて、ブドウを1本植える', T.draw('vine'), T.plant(1, { opt: true })), opt('2リラ', T.lira(2))] },
    { name: '建築家', options: [opt('建物を3リラ引きで建てる', T.build({ discount: 3 })), opt('値段4の建物1つにつき1点', { op: 'perStruct4', vp: 1 })] },
    { name: '無免許の建築家', options: [opt('1点失って、値段2か3の建物をただで建てる', T.vp(-1), T.build({ free: true, costs: [2, 3] })), opt('2点失って、好きな建物をただで建てる', T.vp(-2), T.build({ free: true }))] },
    { name: '後援者', options: [opt('4リラ', T.lira(4)), opt('注文カードと冬の訪問者カードを1枚ずつ引く', T.draw('order'), T.draw('winter'))] },
    { name: '競売人', options: [opt('カードを2枚捨てて4リラ', { op: 'discardCards', n: 2 }, T.lira(4)), opt('カードを4枚捨てて3点', { op: 'discardCards', n: 4 }, T.vp(3))] },
    { name: '芸人', options: [opt('4リラ払って、冬の訪問者カードを3枚引く', T.lira(-4), T.draw('winter', 3)), opt('ワイン1つと訪問者カード3枚を捨てて3点', { op: 'discardWine', min: 1 }, { op: 'discardCards', n: 3, filter: 'visitor' }, T.vp(3))] },
    { name: '行商人', options: [opt('ブドウ・注文・冬の訪問者のカードを1枚ずつ引く', T.draw('vine'), T.draw('order'), T.draw('winter'))] },
    { name: '園芸家', options: [opt('建物の条件なしでブドウを1本植える', T.plant(1, { free: true })), opt('ブドウを2本抜いて捨て、3点', { op: 'uprootDiscard', n: 2 }, T.vp(3))] },
    { name: '小作人', options: [opt('建物の条件なしでブドウを1本植える', T.plant(1, { free: true })), opt('ブドウを1本抜いて捨て、2点', { op: 'uprootDiscard', n: 1 }, T.vp(2))] },
    { name: '栽培家', options: [opt('ブドウを1本植える。植えたブドウの価値が合わせて6以上になったら2点', T.plant(1), { op: 'ifCond', cond: 'vineTotal6', tasks: [T.vp(2)] })] },
    { name: '交渉人', options: [opt('ブドウを1つ捨てて、残りの収入+1', { op: 'discardGrape' }, T.residual(1)), opt('ワインを1つ捨てて、残りの収入+2', { op: 'discardWine', min: 1 }, T.residual(2))] },
    { name: '耕作者', options: [opt('ブドウを1本植える（畑の上限を超えてもよい）', T.plant(1, { overMax: true }))] },
    {
        name: '開拓者', options: [
            opt('建物を3リラ引きで建てる', T.build({ discount: 3 })),
            opt('ブドウを2本まで植える', T.plant(2)),
            opt('1点失って、両方', T.vp(-1), T.build({ discount: 3 }), T.plant(2, { opt: true }))
        ]
    },
    { name: '職人', options: [opt('3リラ', T.lira(3)), opt('建物を1リラ引きで建てる', T.build({ discount: 1 })), opt('ブドウを2本まで植える', T.plant(2))] },
    { name: '石工', options: [opt('8リラ払って、建物を2つ建てる', T.lira(-8), T.build({ free: true }), T.build({ free: true, opt: true }))] },
    { name: '出資者', options: [opt('ブドウのカードを2枚引く', T.draw('vine', 2)), opt('3リラ', T.lira(3)), opt('1点失って、両方', T.vp(-1), T.draw('vine', 2), T.lira(3))] },
    { name: '監督', options: [opt('建物を建てて、ブドウを1本植える（価値4のブドウなら1点）', T.build(), T.plant(1, { opt: true }), { op: 'ifCond', cond: 'planted4', tasks: [T.vp(1)] })] },
    { name: '輸入業者', options: [opt('訪問者カードを3枚引く', T.drawVisitor(3))] },
    { name: '農学者', options: [opt('ブドウを1本植える。その畑のブドウが3種類以上になったら2点', T.plant(1), { op: 'ifCond', cond: 'field3types', tasks: [T.vp(2)] })] },
    { name: '物々交換屋', options: [opt('カードを2枚捨てて、4種類のカードを1枚ずつ引く', { op: 'discardCards', n: 2 }, T.draw('vine'), T.draw('order'), T.draw('summer'), T.draw('winter'))] }
];

export const WINTER_VISITORS = [
    {
        name: '商人', options: [
            opt('3リラ払って、価値1の赤ブドウと白ブドウ', T.lira(-3), { op: 'gainGrape', colors: ['red', 'white'], value: 1 }),
            opt('注文を1つ果たし、さらに1点', T.fill(1))
        ]
    },
    { name: '圧搾職人', options: [opt('3リラと、夏の訪問者カードを1枚', T.lira(3), T.draw('summer')), opt('注文カードを1枚引いて、ワインを1つ造る', T.draw('order'), T.make(1))] },
    { name: '審査員', options: [opt('夏の訪問者カードを2枚引く', T.draw('summer', 2)), opt('価値4以上のワインを1つ捨てて3点', { op: 'discardWine', min: 4 }, T.vp(3))] },
    { name: '醸造学者', options: [opt('地下室のワインをすべて2回熟成させる', { op: 'age', times: 2 }), opt('3リラ払って、地下室を1段広げる', { op: 'upgradeCellar', price: 3 })] },
    { name: '宣伝係', options: [opt('カードを2枚引いて1リラ', T.drawAny(2), T.lira(1)), opt('注文を1つ果たし、さらに1点', T.fill(1))] },
    { name: '醸造の名人', options: [opt('3リラと、注文カードを1枚', T.lira(3), T.draw('order')), opt('ワインを3つまで造る', T.make(3))] },
    { name: '無免許の先生', options: [opt('1点失って、人を1人増やす', T.vp(-1), T.train(0)), opt('人が4人以上なら2点', { op: 'ifCond', cond: 'workers4', req: true, tasks: [T.vp(2)] })] },
    { name: '先生', options: [opt('ワインを2つまで造る', T.make(2)), opt('2リラ払って、人を1人増やす', T.train(2))] },
    { name: '恩人', options: [opt('夏と冬の訪問者カードを1枚ずつ引く', T.draw('summer'), T.draw('winter')), opt('訪問者カードを2枚捨てて2点', { op: 'discardCards', n: 2, filter: 'visitor' }, T.vp(2))] },
    { name: '査定人', options: [opt('手札1枚につき1リラ', { op: 'perHandCard', lira: 1 }), opt('手札を全部（1枚以上）捨てて2点', { op: 'discardHand' }, T.vp(2))] },
    {
        name: '収穫人', options: [
            opt('畑を2つまで収穫して、2リラ', T.harvest(2), T.lira(2)),
            opt('畑を2つまで収穫して、1点', T.harvest(2), T.vp(1))
        ]
    },
    { name: '教授', options: [opt('2リラ払って、人を1人増やす', T.train(2)), opt('人が6人なら2点', { op: 'ifCond', cond: 'workers6', req: true, tasks: [T.vp(2)] })] },
    { name: '名ワイン職人', options: [opt('地下室を2リラ引きで1段広げて、1点', { op: 'upgradeCellar', discount: 2 }, T.vp(1)), opt('ワインを1つ熟成させて、注文を1つ果たす', { op: 'ageOne', opt: true }, T.fill(0))] },
    { name: '無免許の醸造学者', options: [opt('地下室のワインをすべて2回熟成させる', { op: 'age', times: 2 }), opt('1点失って、地下室をただで1段広げる', T.vp(-1), { op: 'upgradeCellar', price: 0 })] },
    { name: '販売促進係', options: [opt('ブドウを1つ捨てて、1点と残りの収入+1', { op: 'discardGrape' }, T.vp(1), T.residual(1)), opt('ワインを1つ捨てて、1点と残りの収入+1', { op: 'discardWine', min: 1 }, T.vp(1), T.residual(1))] },
    {
        name: '収穫の名人', options: [
            opt('畑を1つ収穫して、ブドウのカードを1枚引く', T.harvest(1), T.draw('vine')),
            opt('畑を1つ収穫して、1リラでくびきを建てる', T.harvest(1), T.build({ only: 'yoke', price: 1, opt: true }))
        ]
    },
    {
        name: '何でも屋', options: [
            opt('畑を1つ収穫して、ワインを2つまで造る', T.harvest(1), T.make(2)),
            opt('畑を1つ収穫して、注文を1つ果たす', T.harvest(1), T.fill(0)),
            opt('ワインを2つまで造って、注文を1つ果たす', T.make(2), { ...T.fill(0), opt: true })
        ]
    },
    {
        name: '政治家', options: [
            opt('点が0未満なら6リラ', { op: 'ifCond', cond: 'vpNegative', req: true, tasks: [T.lira(6)] }),
            opt('ブドウ・夏の訪問者・注文のカードを1枚ずつ引く', T.draw('vine'), T.draw('summer'), T.draw('order'))
        ]
    },
    { name: '監督官', options: [opt('ワインを2つまで造る。スパークリング1つにつき1点', T.make(2), { op: 'perMade', kind: 'sparkling', vp: 1 })] },
    { name: '学者', options: [opt('注文カードを2枚引く', T.draw('order', 2)), opt('3リラ払って、人を1人増やす', T.train(3)), opt('1点失って、両方', T.vp(-1), T.draw('order', 2), T.train(3))] },
    { name: '刈り手', options: [opt('畑を3つまで収穫する。3つとも収穫したら2点', T.harvest(3), { op: 'ifCond', cond: 'harvested3', tasks: [T.vp(2)] })] },
    { name: '瓶詰め職人', options: [opt('ワインを3つまで造る。造ったワインの種類1つにつき1点', T.make(3), { op: 'perMade', kind: 'types', vp: 1 })] },
    {
        name: '工芸家', options: [
            opt('注文カードを1枚引いて、1点', T.draw('order'), T.vp(1)),
            opt('注文カードを1枚引いて、地下室を1段広げる', T.draw('order'), { op: 'upgradeCellar', discount: 0 }),
            opt('地下室を1段広げて、1点', { op: 'upgradeCellar', discount: 0 }, T.vp(1))
        ]
    },
    { name: '輸出業者', options: [opt('ワインを2つまで造る', T.make(2)), opt('注文を1つ果たす', T.fill(0)), opt('ブドウを1つ捨てて2点', { op: 'discardGrape' }, T.vp(2))] },
    { name: '労働者', options: [opt('畑を2つまで収穫する', T.harvest(2)), opt('ワインを3つまで造る', T.make(3)), opt('1点失って、両方', T.vp(-1), T.harvest(2), T.make(3))] },
    { name: '設計士', options: [opt('建物を建てる。建物が6つ以上になったら2点', T.build(), { op: 'ifCond', cond: 'structures6', tasks: [T.vp(2)] })] },
    { name: '貴族', options: [opt('1リラ払って、残りの収入+1', T.lira(-1), T.residual(1)), opt('残りの収入を2減らして2点', T.residual(-2), T.vp(2))] },
    { name: '試飲係', options: [opt('ワインを1つ捨てて4リラ。全員の地下室で一番価値が高いワインなら、さらに2点', { op: 'taster' })] },
    { name: '宿の主人', options: [opt('ワインを1つ捨てて3リラと1点', { op: 'discardWine', min: 1 }, T.lira(3), T.vp(1)), opt('2リラ', T.lira(2))] },
    { name: '酒屋', options: [opt('価値の合計が7以上になるように、ワインを2つ捨てて3点', { op: 'discardWines', n: 2, sum: 7 }, T.vp(3)), opt('注文を1つ果たす', T.fill(0))] }
];

// ---- ママとパパ（はじめの持ち物） ----

// ママ：引くカード（ブドウ・注文・夏・冬）と、リラ
export const MAMAS = [
    { name: 'アンナ', cards: { vine: 1, summer: 1, winter: 1 }, lira: 0 },
    { name: 'ビアンカ', cards: { vine: 2, order: 1 }, lira: 0 },
    { name: 'カルラ', cards: { vine: 1, order: 1, summer: 1 }, lira: 0 },
    { name: 'ダリア', cards: { vine: 1, order: 1, winter: 1 }, lira: 0 },
    { name: 'エレナ', cards: { vine: 2, summer: 1 }, lira: 0 },
    { name: 'フローラ', cards: { vine: 2, winter: 1 }, lira: 0 },
    { name: 'ジーナ', cards: { order: 1, summer: 1, winter: 1 }, lira: 1 },
    { name: 'イレーネ', cards: { vine: 1, summer: 2 }, lira: 0 },
    { name: 'ルチア', cards: { vine: 1, winter: 2 }, lira: 0 },
    { name: 'マリーナ', cards: { vine: 1, order: 2 }, lira: 0 },
    { name: 'ノーラ', cards: { vine: 2 }, lira: 2 },
    { name: 'オルガ', cards: { summer: 1, winter: 1 }, lira: 2 }
];

// パパ：リラと、2つから1つ選ぶもの（建物か人か点か、リラ）
export const PAPAS = [
    { name: 'アルベルト', lira: 5, pick: { label: 'ブドウ棚', tasks: [{ op: 'gainStructure', id: 'trellis' }] }, alt: 2 },
    { name: 'ブルーノ', lira: 5, pick: { label: '水路', tasks: [{ op: 'gainStructure', id: 'irrigation' }] }, alt: 3 },
    { name: 'カルロ', lira: 4, pick: { label: '風車', tasks: [{ op: 'gainStructure', id: 'windmill' }] }, alt: 4 },
    { name: 'ダンテ', lira: 3, pick: { label: '試飲室', tasks: [{ op: 'gainStructure', id: 'tasting' }] }, alt: 5 },
    { name: 'エンツォ', lira: 4, pick: { label: '離れ', tasks: [{ op: 'gainStructure', id: 'cottage' }] }, alt: 4 },
    { name: 'ファビオ', lira: 5, pick: { label: 'くびき', tasks: [{ op: 'gainStructure', id: 'yoke' }] }, alt: 3 },
    { name: 'ジョルジョ', lira: 4, pick: { label: '中の地下室', tasks: [{ op: 'gainStructure', id: 'medium' }] }, alt: 4 },
    { name: 'ルカ', lira: 4, pick: { label: '人を1人', tasks: [{ op: 'gainWorker' }] }, alt: 4 },
    { name: 'マリオ', lira: 5, pick: { label: '1点', tasks: [{ op: 'vp', n: 1 }] }, alt: 3 },
    { name: 'パオロ', lira: 6, pick: { label: 'ブドウ棚', tasks: [{ op: 'gainStructure', id: 'trellis' }] }, alt: 2 }
];

// ---- 起床時間の表（春） ----

// 上の段ほど早く動ける。段ごとのおまけ
export const WAKE_ROWS = [
    { label: 'なし', tasks: [] },
    { label: 'ブドウのカード1枚', tasks: [T.draw('vine')] },
    { label: '注文カード1枚', tasks: [T.draw('order')] },
    { label: '1リラ', tasks: [T.lira(1)] },
    { label: '訪問者カード1枚', tasks: [T.drawVisitor(1)] },
    { label: '1点', tasks: [T.vp(1)] },
    { label: '臨時の人（この年だけ）', tasks: [{ op: 'tempWorker' }] }
];

// ---- 行動の場所 ----

// bonus：人数で増える枠のうち、最初の枠に置くと付くおまけ
export const ACTIONS = [
    { id: 'drawVine', season: 'summer', name: 'ブドウのカード', text: 'ブドウのカードを1枚', bonusText: 'もう1枚' },
    { id: 'tour', season: 'summer', name: '見学', text: '2リラ', bonusText: '+1リラ' },
    { id: 'build', season: 'summer', name: '建てる', text: '建物を1つ建てる', bonusText: '1リラ引き' },
    { id: 'summerVisitor', season: 'summer', name: '夏の訪問者', text: '夏の訪問者を1枚出す', bonusText: 'もう1枚' },
    { id: 'sell', season: 'summer', name: '売り買い', text: 'ブドウを売る・畑の売り買い', bonusText: '+1点' },
    { id: 'plant', season: 'summer', name: '植える', text: 'ブドウを1本植える', bonusText: 'もう1本' },
    { id: 'drawOrder', season: 'winter', name: '注文カード', text: '注文カードを1枚', bonusText: 'もう1枚' },
    { id: 'harvest', season: 'winter', name: '収穫', text: '畑を1つ収穫', bonusText: 'もう1つ' },
    { id: 'train', season: 'winter', name: '人を雇う', text: '4リラで人を1人', bonusText: '1リラ引き' },
    { id: 'winterVisitor', season: 'winter', name: '冬の訪問者', text: '冬の訪問者を1枚出す', bonusText: 'もう1枚' },
    { id: 'make', season: 'winter', name: '醸造', text: 'ワインを2つまで造る', bonusText: 'もう1つ' },
    { id: 'fill', season: 'winter', name: '注文', text: '注文を1つ果たす', bonusText: '+1点' },
    { id: 'lira', season: 'winter', name: '1リラ', text: '1リラ（何人でも）', bonusText: null, open: true }
];
export const ACTION = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

export function actionTasks(id, bonus) {
    switch (id) {
        case 'drawVine': return [T.draw('vine', bonus ? 2 : 1)];
        case 'tour': return [T.lira(bonus ? 3 : 2), { op: 'tasting' }];
        case 'build': return [T.build({ discount: bonus ? 1 : 0 })];
        case 'summerVisitor': return [{ op: 'playVisitor', deck: 'summer', n: bonus ? 2 : 1 }];
        case 'sell': return [{ op: 'sell' }, ...(bonus ? [T.vp(1)] : [])];
        case 'plant': return [T.plant(bonus ? 2 : 1)];
        case 'drawOrder': return [T.draw('order', bonus ? 2 : 1)];
        case 'harvest': return [T.harvest(bonus ? 2 : 1)];
        case 'train': return [T.train(bonus ? 3 : 4)];
        case 'winterVisitor': return [{ op: 'playVisitor', deck: 'winter', n: bonus ? 2 : 1 }];
        case 'make': return [T.make(bonus ? 3 : 2)];
        case 'fill': return [T.fill(bonus ? 1 : 0)];
        case 'lira': return [T.lira(1)];
        case 'yoke': return [{ op: 'yoke' }];
        default: throw new Error(`知らない行動: ${id}`);
    }
}

// ---- カードの一覧（id はカード1枚ごと） ----

export const CARDS = [];
VINE_TYPES.forEach(v => {
    for (let i = 0; i < v.count; i++) CARDS.push({ id: CARDS.length, deck: 'vine', ...v, name: v.name });
});
ORDER_LIST.forEach(text => {
    const wines = text.split(' ').map(w => ({ kind: KIND_OF[w[0]], min: Number(w.slice(1)) }));
    CARDS.push({ id: CARDS.length, deck: 'order', wines, ...orderReward(wines) });
});
SUMMER_VISITORS.forEach(v => CARDS.push({ id: CARDS.length, deck: 'summer', ...v }));
WINTER_VISITORS.forEach(v => CARDS.push({ id: CARDS.length, deck: 'winter', ...v }));

export const DECKS = ['vine', 'order', 'summer', 'winter'];
export const DECK_NAME = { vine: 'ブドウ', order: '注文', summer: '夏の訪問者', winter: '冬の訪問者' };

export const vineValue = (card) => card.red + card.white;
export const orderText = (card) => card.wines.map(w => `${WINE_NAME[w.kind]}${w.min}`).join('＋');
export const cardTitle = (card) => {
    if (card.deck === 'vine') return `${card.name}（${[card.red ? `赤${card.red}` : '', card.white ? `白${card.white}` : ''].filter(Boolean).join('・')}）`;
    if (card.deck === 'order') return `注文：${orderText(card)}`;
    return card.name;
};

// ---- 数の決まり ----

export const FIELD_MAX = [5, 6, 7];
export const START_WORKERS = 2;
export const MAX_WORKERS = 6;      // 大きいワーカーを含めて6人まで
export const HAND_LIMIT = 7;
export const MAX_RESIDUAL = 5;
export const WIN_VP = 20;
export const CELLAR_CAP = { small: 3, medium: 6, large: 9 };
export const WINE_MIN = { red: 1, white: 1, blush: 4, sparkling: 7 };
export const grapePrice = (value) => (value <= 3 ? 1 : value <= 6 ? 2 : 3);
