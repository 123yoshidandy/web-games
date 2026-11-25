/**
 * エバーデールのカード・場所・行事のデータ
 * 効果の処理は game.js にあり、ここには名前・費用・点数・説明だけを置く
 *
 * カード（基本セットの 24 種の建造物と 24 種の住民）
 * - kind：construction（建造物。小枝・樹脂・小石で建てる）/ critter（住民。ベリーで迎える）
 * - type：prod（緑の生産）/ dest（赤の目的地）/ gov（青の統治）/ trav（茶の旅人）/ pros（紫の繁栄）
 * - unique：true なら、同じ名前のカードは街に1枚まで
 * - pairs（建造物）：このカードを使って無料で出せる住民。occupies（住民）はその逆
 */

export const RESOURCES = ['twig', 'resin', 'pebble', 'berry'];
export const RESOURCE_NAMES = { twig: '小枝', resin: '樹脂', pebble: '小石', berry: 'ベリー' };

export const TYPES = {
    prod: { name: '生産', long: '緑の生産' },
    dest: { name: '目的地', long: '赤の目的地' },
    gov: { name: '統治', long: '青の統治' },
    trav: { name: '旅人', long: '茶の旅人' },
    pros: { name: '繁栄', long: '紫の繁栄' }
};

const C = (name, type, cost, points, count, unique, text, extra = {}) =>
    ({ name, kind: 'construction', type, cost, points, count, unique, text, ...extra });
const R = (name, type, berries, points, count, unique, occupies, text, extra = {}) =>
    ({ name, kind: 'critter', type, cost: { berry: berries }, points, count, unique, occupies, text, ...extra });

export const CARDS = {
    // ---- 建造物 ----
    farm: C('農場', 'prod', { twig: 2, resin: 1 }, 1, 8, false, 'ベリーを1つ得る。', { pairs: ['husband', 'wife'] }),
    twigBarge: C('小枝の舟', 'prod', { twig: 1, pebble: 1 }, 1, 3, false, '小枝を2つ得る。', { pairs: ['bargeToad'] }),
    resinRefinery: C('樹脂工房', 'prod', { resin: 1, pebble: 1 }, 1, 3, false, '樹脂を1つ得る。', { pairs: ['chipSweep'] }),
    mine: C('鉱山', 'prod', { twig: 1, resin: 1, pebble: 1 }, 2, 3, false, '小石を1つ得る。', { pairs: ['minerMole'] }),
    storehouse: C('倉庫', 'prod', { twig: 1, resin: 1, pebble: 1 }, 2, 3, false,
        '小枝3・樹脂2・小石1・ベリー2のどれかをこのカードの上に置く。ワーカーを置くと、上の資源を全部もらえる（自分だけ）。', { pairs: ['woodcarver'], spot: true }),
    generalStore: C('雑貨屋', 'prod', { resin: 1, pebble: 1 }, 1, 3, false, 'ベリーを1つ得る。街に農場があれば、さらに1つ。', { pairs: ['shopkeeper'] }),
    fairgrounds: C('祭り広場', 'prod', { twig: 1, resin: 2, pebble: 1 }, 3, 3, true, 'カードを2枚引く。', { pairs: ['fool'] }),
    everTree: C('永遠の木', 'pros', { twig: 3, resin: 3, pebble: 3 }, 5, 2, true,
        '終わりに、街の紫の繁栄のカード1枚につき1点（自分も数える）。どの住民でも、この木を使って無料で出せる（1回だけ）。', { pairs: ['*'] }),
    castle: C('城', 'pros', { twig: 2, resin: 3, pebble: 3 }, 4, 2, true, '終わりに、街のふつうの建造物1枚につき1点。', { pairs: ['king'] }),
    palace: C('宮殿', 'pros', { twig: 2, resin: 3, pebble: 3 }, 4, 2, true, '終わりに、街のユニークな建造物1枚につき1点。', { pairs: ['queen'] }),
    school: C('学校', 'pros', { twig: 2, resin: 2 }, 2, 2, true, '終わりに、街のふつうの住民1枚につき1点。', { pairs: ['teacher'] }),
    theater: C('劇場', 'pros', { twig: 3, resin: 1, pebble: 1 }, 3, 2, true, '終わりに、街のユニークな住民1枚につき1点。', { pairs: ['bard'] }),
    clockTower: C('時計塔', 'gov', { twig: 3, pebble: 1 }, 0, 3, true,
        '出したとき、上に点数トークンを3つ置く。季節の準備の前に、トークンを1つ外して、自分のワーカーがいる基本か森の場所をもう一度使える。残ったトークンは点になる。', { pairs: ['historian'] }),
    courthouse: C('裁判所', 'gov', { twig: 1, resin: 1, pebble: 2 }, 2, 2, true, '建造物を出したあと、小枝・樹脂・小石のどれか1つを得る。', { pairs: ['judge'] }),
    crane: C('クレーン', 'gov', { pebble: 1 }, 1, 3, false, '建造物を出すとき、このカードを捨てて、費用を好きな資源3つ分安くできる。', { pairs: ['architect'] }),
    inn: C('宿屋', 'dest', { twig: 2, resin: 1 }, 2, 3, false,
        'ワーカーを置くと、草原のカードを1枚、費用を好きな資源3つ分安くして出せる。ほかの人も使える（持ち主に1点）。', { pairs: ['innkeeper'], spot: true, open: true }),
    postOffice: C('郵便局', 'dest', { twig: 1, resin: 2 }, 2, 3, false,
        'ワーカーを置くと、相手に手札を2枚渡し、好きなだけ捨ててから、手札が8枚になるまで引く。ほかの人も使える（持ち主に1点）。', { pairs: ['postalPigeon'], spot: true, open: true }),
    ruins: C('遺跡', 'trav', {}, 0, 3, false,
        '街の建造物を1枚捨てて出す（費用はなし）。捨てた建造物の費用の資源を受け取り、カードを2枚引く。', { pairs: ['peddler'] }),
    cemetery: C('墓地', 'dest', { pebble: 2 }, 0, 2, true,
        'ワーカーを置くと、山札か捨て札から4枚めくり、1枚を無料で出せる。残りは捨てる。ワーカーは戻らない。墓守がいると2つ目の場所が開く。', { pairs: ['undertaker'], spot: true, permanent: true }),
    chapel: C('礼拝堂', 'dest', { twig: 2, resin: 1, pebble: 1 }, 2, 2, true,
        'ワーカーを置くと、上に点数トークンを1つ置き、上のトークン1つにつきカードを2枚引く。トークンは点になる。', { pairs: ['shepherd'], spot: true }),
    lookout: C('見張り台', 'dest', { twig: 1, resin: 1, pebble: 1 }, 2, 2, true, 'ワーカーを置くと、基本か森の場所を1つ選び、その効果を使える（ワーカーがいても使える）。', { pairs: ['wanderer'], spot: true }),
    monastery: C('修道院', 'dest', { twig: 1, resin: 1, pebble: 1 }, 1, 2, true,
        'ワーカーを置くと、相手に資源を2つ渡して4点を得る。ワーカーは戻らない。修道士がいると2つ目の場所が開く。', { pairs: ['monk'], spot: true, permanent: true }),
    university: C('大学', 'dest', { resin: 1, pebble: 2 }, 3, 2, true,
        'ワーカーを置くと、街のカードを1枚捨て、その費用の資源を受け取り、さらに好きな資源1つと1点を得る。', { pairs: ['doctor'], spot: true }),
    dungeon: C('地下牢', 'gov', { resin: 1, pebble: 2 }, 0, 2, true,
        'カードを出すとき、街の住民を1枚この下に入れて、費用を好きな資源3つ分安くできる。森番がいると2つ目の牢が開く。', { pairs: ['ranger'] }),

    // ---- 住民 ----
    husband: R('夫', 'prod', 2, 2, 4, false, 'farm', '妻と組んでいて、街に農場があれば、好きな資源を1つ得る。夫と妻の組は街の1枠に並べる。'),
    wife: R('妻', 'pros', 2, 2, 4, false, 'farm', '夫と組むと、終わりに3点。夫と妻の組は街の1枠に並べる。'),
    bargeToad: R('舟ガエル', 'prod', 2, 1, 3, false, 'twigBarge', '街の農場1枚につき、小枝を2つ得る。'),
    chipSweep: R('煙突掃除', 'prod', 3, 2, 3, false, 'resinRefinery', '自分の街の緑の生産のカードを1枚選び、その効果を使う。'),
    minerMole: R('鉱夫モグラ', 'prod', 3, 1, 3, false, 'mine', '相手の街の緑の生産のカードを1枚選び、その効果を自分が使う。'),
    woodcarver: R('木彫り師', 'prod', 2, 2, 3, false, 'storehouse', '小枝を3つまで払い、1つにつき1点を得る。'),
    shopkeeper: R('店主', 'gov', 2, 1, 3, true, 'generalStore', 'ほかの住民を出したあと、ベリーを1つ得る。'),
    fool: R('道化', 'trav', 3, -2, 2, true, 'fairgrounds', '相手の街に出す（その街で −2 点）。'),
    king: R('王', 'pros', 6, 4, 2, true, 'castle', '終わりに、基本の行事1つにつき1点、特別な行事1つにつき2点。'),
    queen: R('女王', 'dest', 5, 4, 2, true, 'palace', 'ワーカーを置くと、点数が3点以下のカードを手札か草原から1枚、無料で出せる。', { spot: true }),
    teacher: R('先生', 'prod', 2, 2, 3, false, 'school', 'カードを2枚引き、1枚を手元に残して、もう1枚を相手に渡す。'),
    bard: R('吟遊詩人', 'trav', 3, 0, 2, true, 'theater', '手札を5枚まで捨て、1枚につき1点を得る。'),
    historian: R('歴史家', 'gov', 2, 1, 3, true, 'clockTower', 'ほかのカードを出したあと、カードを1枚引く。'),
    judge: R('裁判官', 'gov', 3, 2, 2, true, 'courthouse', 'カードを出すとき、費用の資源1つを、持っているほかの資源1つで払える。'),
    architect: R('建築家', 'pros', 4, 2, 2, true, 'crane', '終わりに、残った樹脂と小石1つにつき1点（6点まで）。'),
    innkeeper: R('宿の主人', 'gov', 1, 1, 3, false, 'inn', '住民を出すとき、このカードを捨てて、ベリーを3つ安くできる。'),
    postalPigeon: R('伝書バト', 'trav', 2, 0, 3, false, 'postOffice', '山札から2枚めくり、点数が3点以下のカードを1枚、無料で出せる。残りは捨てる。'),
    peddler: R('行商人', 'prod', 2, 1, 3, false, 'ruins', '資源を2つまで払い、同じ数だけ好きな資源を得る。'),
    undertaker: R('墓守', 'trav', 2, 1, 2, true, 'cemetery', '草原から3枚捨てて補充し、草原から1枚を手札に加える。墓地の2つ目の場所が開く。'),
    shepherd: R('羊飼い', 'trav', 3, 1, 2, true, 'chapel', 'ベリーを3つ得て、自分の礼拝堂の上の点数トークン1つにつき1点を得る。'),
    wanderer: R('放浪者', 'trav', 2, 1, 3, false, 'lookout', 'カードを3枚引く。街の枠を使わない。'),
    monk: R('修道士', 'prod', 1, 0, 2, true, 'monastery', 'ベリーを2つまで相手に渡し、1つにつき2点を得る。修道院の2つ目の場所が開く。'),
    doctor: R('医者', 'prod', 4, 4, 3, true, 'university', 'ベリーを3つまで払い、1つにつき1点を得る。'),
    ranger: R('森番', 'trav', 2, 1, 2, true, 'dungeon', '置いてあるワーカーを1人、別の場所に動かして、その場所を使う。地下牢の2つ目の牢が開く。')
};

export const CARD_IDS = Object.keys(CARDS);

// 山札（基本セットの枚数どおり）
export const buildDeck = () => CARD_IDS.flatMap(id => Array(CARDS[id].count).fill(id));

// 基本の場所（exclusive：1人だけ置ける）
export const BASIC_LOCATIONS = [
    { id: 'b-twig3', gain: { twig: 3 }, exclusive: true },
    { id: 'b-twig2', gain: { twig: 2 }, cards: 1, exclusive: false },
    { id: 'b-resin2', gain: { resin: 2 }, exclusive: true },
    { id: 'b-resin1', gain: { resin: 1 }, cards: 1, exclusive: false },
    { id: 'b-cards', cards: 2, points: 1, exclusive: false },
    { id: 'b-pebble', gain: { pebble: 1 }, exclusive: true },
    { id: 'b-berry1', gain: { berry: 1 }, cards: 1, exclusive: true },
    { id: 'b-berry', gain: { berry: 1 }, exclusive: false }
];

// 森の場所（2人なら3か所、3〜4人なら4か所をめくる。4人のときは、ちがう2人まで置ける）
export const FOREST_LOCATIONS = [
    { id: 'f-berry3', gain: { berry: 3 } },
    { id: 'f-resin2', gain: { resin: 2, twig: 1 } },
    { id: 'f-cards2', gain: { pebble: 1 }, cards: 2 },
    { id: 'f-mixed', gain: { twig: 1, resin: 1, berry: 1 } },
    { id: 'f-any2', any: 2 },
    { id: 'f-copy', text: '基本の場所を1つ選んでその効果を使い、カードを1枚引く' },
    { id: 'f-trade', text: '手札を3枚まで捨て、1枚につき好きな資源を1つ得る' },
    { id: 'f-redraw', text: '手札を好きなだけ捨て、1枚につき2枚引く' },
    { id: 'f-meadow', text: '草原から2枚を手札に加え、そのうち1枚を資源1つ分安く出せる' },
    { id: 'f-cardsany', cards: 2, any: 1 },
    { id: 'f-berry2', gain: { berry: 2 }, cards: 1 }
];

// 基本の行事（3点）
export const BASIC_EVENTS = [
    { id: 'e-gov', type: 'gov', need: 4, name: '統治の祝い' },
    { id: 'e-dest', type: 'dest', need: 3, name: '目的地の祝い' },
    { id: 'e-trav', type: 'trav', need: 3, name: '旅人の祝い' },
    { id: 'e-prod', type: 'prod', need: 4, name: '生産の祝い' }
];

// 特別な行事（4つをめくる）。needs のカードが街にそろうと、ワーカーを置いて達成できる
export const SPECIAL_EVENTS = [
    { id: 's-graduation', name: '学者の卒業式', needs: ['teacher', 'university'], text: '手札の住民を3枚までこの下に置き、1枚につき2点' },
    { id: 's-marketing', name: '見事な売り込み', needs: ['shopkeeper', 'postalPigeon'], text: '資源を3つまで相手に渡し、1つにつき2点' },
    { id: 's-performer', name: '専属の吟遊詩人', needs: ['inn', 'bard'], text: 'ベリーを3つまでここに置き、1つにつき2点' },
    { id: 's-thieves', name: 'どんぐり泥棒の捕り物', needs: ['courthouse', 'ranger'], text: '街の住民を2枚までこの下に置き、1枚につき3点' },
    { id: 's-fireworks', name: '花火の夕べ', needs: ['lookout', 'minerMole'], text: '小枝を3つまでここに置き、1つにつき2点' },
    { id: 's-management', name: '新しい店のきりもり', needs: ['peddler', 'generalStore'], text: '資源を3つまでここに置く。小枝とベリーは1点、樹脂と小石は2点' },
    { id: 's-pilgrims', name: '巡礼の道', needs: ['monastery', 'wanderer'], text: '終わりに、自分の修道院のワーカー1人につき3点' },
    { id: 's-fallen', name: '戦没者の追悼', needs: ['cemetery', 'shepherd'], text: '終わりに、自分の墓地のワーカー1人につき3点' },
    { id: 's-doctor', name: '空飛ぶ医者', needs: ['doctor', 'postalPigeon'], text: '終わりに、すべての街の夫と妻の組1つにつき3点' },
    { id: 's-tax', name: '減税', needs: ['judge', 'queen'], text: '3点。達成したとき、街の緑の生産のカードをすべて使う' },
    { id: 's-wellrun', name: 'よく治まった街', needs: ['chipSweep', 'clockTower'], text: '4点。置いてあるほかのワーカーを1人、手元に戻す' },
    { id: 's-miscreants', name: '悪党への説教', needs: ['monk', 'dungeon'], text: '終わりに、自分の地下牢の中の住民1枚につき3点' },
    { id: 's-games', name: 'エバーデールの競技会', needsTypes: true, text: '5色のカードが2枚ずつ街にあれば達成。9点' }
];

export const SPECIAL_EVENTS_IN_GAME = 4;

// 旅（秋だけ。手札をその数だけ捨てて、その数の点を得る）。2の場所はだれでも何人でも置ける
export const JOURNEY_SPOTS = [5, 4, 3, 2];

// 場所の名前（画面とログで使う）
export function locationName(loc) {
    if (loc.startsWith('b-') || loc.startsWith('f-')) return gainText([...BASIC_LOCATIONS, ...FOREST_LOCATIONS].find(l => l.id === loc));
    if (loc === 'haven') return '港';
    if (loc.startsWith('journey-')) return `旅（${loc.slice(8)}）`;
    if (loc.startsWith('e-')) return BASIC_EVENTS.find(e => e.id === loc)?.name ?? loc;
    if (loc.startsWith('s-')) return SPECIAL_EVENTS.find(e => e.id === loc)?.name ?? loc;
    return loc;
}

// 場所の得られるものを短い文にする（例：小枝2・カード1）
export function gainText(def) {
    if (!def) return '';
    if (def.text) return def.text;
    const parts = Object.entries(def.gain ?? {}).map(([r, n]) => `${RESOURCE_NAMES[r]}${n}`);
    if (def.any) parts.push(`好きな資源${def.any}`);
    if (def.cards) parts.push(`カード${def.cards}`);
    if (def.points) parts.push(`${def.points}点`);
    return parts.join('・');
}

export const costText = (cost) => {
    const parts = RESOURCES.filter(r => cost[r] > 0).map(r => `${RESOURCE_NAMES[r]}${cost[r]}`);
    return parts.length ? parts.join('・') : 'なし';
};
