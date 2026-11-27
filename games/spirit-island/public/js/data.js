/**
 * スピリット・アイランドのデータ（島のボード・精霊・力のカード・恐怖カード・侵略者カード・難易度）
 * 名前と文は、原作の文を写さず、意味を短い日本語で言い換えている
 * 力の効果（run）は effects.js の道具 h を受け取って盤面を変える。h.land は対象の土地、h.target は対象の精霊
 */

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;

export const ELEMENTS = ['sun', 'moon', 'fire', 'air', 'water', 'earth', 'plant', 'animal'];
export const ELEMENT_NAMES = { sun: '太陽', moon: '月', fire: '火', air: '風', water: '水', earth: '大地', plant: '植物', animal: '動物' };
export const ELEMENT_SHORT = { sun: '陽', moon: '月', fire: '火', air: '風', water: '水', earth: '地', plant: '植', animal: '獣' };

export const TERRAINS = { M: '山岳', W: '湿地', J: '密林', S: '砂漠' };
export const BOARD_LETTERS = ['A', 'B', 'C', 'D'];

// ---- 島のボード ----
// どのボードも同じ形（8つの土地と、左の海）。土地の種類と最初の駒がボードごとに違う
// 座標はボード1枚の中の位置（幅300・高さ240）。右側のボードは左右を反転して置き、海が島の外側に来るようにする
const V = {
    A: [44, 0], B: [132, 0], C: [226, 0], D: [300, 0],
    E: [36, 86], F: [126, 76], G: [210, 88], H: [300, 110],
    I: [46, 166], J: [150, 148], K: [224, 156],
    L: [38, 240], M: [138, 240], N: [236, 240], O: [300, 240],
    ef: [84, 92], fj: [144, 112], ij: [96, 154], jm: [136, 196], bf: [122, 38],
    fg: [168, 72], cg: [222, 44], gk: [208, 124], jk: [186, 162], kn: [240, 200], gh: [256, 102]
};
const poly = (...names) => names.map(n => V[n]);
export const LAND_SHAPES = [
    poly('A', 'B', 'bf', 'F', 'ef', 'E'),
    poly('E', 'ef', 'F', 'fj', 'J', 'ij', 'I'),
    poly('I', 'ij', 'J', 'jm', 'M', 'L'),
    poly('B', 'C', 'cg', 'G', 'fg', 'F', 'bf'),
    poly('F', 'fg', 'G', 'gk', 'K', 'jk', 'J', 'fj'),
    poly('J', 'jk', 'K', 'kn', 'N', 'M', 'jm'),
    poly('C', 'D', 'H', 'gh', 'G', 'cg'),
    poly('G', 'gh', 'H', 'O', 'N', 'kn', 'K', 'gk')
];
export const OCEAN_SHAPE = [[0, 0], V.A, V.E, V.I, V.L, [0, 240]];
export const BOARD_W = 300;
export const BOARD_H = 240;

// ボードの中のとなり（土地の番号は 1〜8）。1〜3 は海に面している
export const LOCAL_ADJ = { 1: [2, 4], 2: [1, 3, 5], 3: [2, 6], 4: [1, 5, 7], 5: [2, 4, 6, 8], 6: [3, 5, 8], 7: [4, 8], 8: [5, 6, 7] };
export const COASTAL = [1, 2, 3];

// ボードの置き方（人数ごと）：places は [列, 行, 反転]、links はボードどうしのつながり [ボード, 土地, ボード, 土地]
// 縦持ちのスマホに収まるよう、2枚は縦に、3〜4枚は2列に並べる。右の列のボードは左右を反転し、海が島の外側に来るようにする
const DOWN = (a, b) => [[a, 3, b, 1], [a, 6, b, 4], [a, 8, b, 7]];
const SIDE = (a, b) => [[a, 7, b, 7], [a, 8, b, 8]];
export const LAYOUTS = {
    1: { places: [[0, 0, false]], links: [] },
    2: { places: [[0, 0, false], [0, 1, false]], links: DOWN(0, 1) },
    3: { places: [[0, 0, false], [1, 0, true], [0, 1, false]], links: [...SIDE(0, 1), ...DOWN(0, 2)] },
    4: { places: [[0, 0, false], [1, 0, true], [0, 1, false], [1, 1, true]], links: [...SIDE(0, 1), ...DOWN(0, 2), ...DOWN(1, 3), ...SIDE(2, 3)] }
};

// 土地の種類と最初の駒（E 探検者・T 町・C 都市・D ダハン・B 荒廃）。最初の荒廃は荒廃カードからではなく箱から置く
export const BOARDS = [
    { terrain: 'MWJSWMSJ', setup: { 2: { C: 1, D: 1 }, 3: { D: 2 }, 4: { B: 1 }, 6: { T: 1, D: 1 }, 7: { D: 2 } } },
    { terrain: 'WMSJSWMJ', setup: { 1: { D: 1 }, 2: { C: 1 }, 3: { D: 2 }, 5: { B: 1 }, 6: { T: 1 }, 7: { D: 1 }, 8: { D: 1 } } },
    { terrain: 'JSMWMJWS', setup: { 2: { C: 1, D: 1 }, 3: { D: 1 }, 4: { T: 1 }, 5: { D: 2 }, 6: { B: 1 } } },
    { terrain: 'SJWMJSWM', setup: { 1: { D: 1 }, 2: { C: 1 }, 4: { D: 2 }, 5: { B: 1 }, 6: { D: 1 }, 7: { D: 1 }, 8: { T: 1 } } }
];

// ---- 侵略者 ----
export const INVADER_NAMES = { E: '探検者', T: '町', C: '都市' };
export const INVADER_HEALTH = { E: 1, T: 2, C: 3 };
export const INVADER_DAMAGE = { E: 1, T: 2, C: 3 };
export const DAHAN_HEALTH = 2;
export const DAHAN_DAMAGE = 2;

// 侵略者カード：段階 I（土地1種類）・II（土地1種類と「海沿い」）・III（土地2種類）
export const INVADER_CARDS = [
    ...['M', 'W', 'J', 'S'].map(t => ({ id: `1${t}`, stage: 1, terrains: [t] })),
    ...['M', 'W', 'J', 'S'].map(t => ({ id: `2${t}`, stage: 2, terrains: [t] })),
    { id: '2C', stage: 2, terrains: [], coastal: true },
    ...['MW', 'MJ', 'MS', 'WJ', 'WS', 'JS'].map(t => ({ id: `3${t}`, stage: 3, terrains: t.split('') }))
];
export const INVADER_CARD = Object.fromEntries(INVADER_CARDS.map(c => [c.id, c]));
// 山の作り方：段階 I を3枚・II を4枚・III を5枚
export const STAGE_COUNTS = [3, 4, 5];
export const invaderCardName = (id) => {
    const card = INVADER_CARD[id];
    return card.coastal ? '海沿い' : card.terrains.map(t => TERRAINS[t]).join('・');
};

// ---- 難易度 ----
// むずかしい は原作の基本の設定（敵対国なし）：恐怖は1人4、恐怖カード9枚（3枚ごとに段階が上がる）、荒廃は1人2＋1、裏返ると1人4
// やさしい・ふつう は、恐怖カードを6枚（2枚ごと）にし、恐怖を溜まりやすく、荒廃に余裕を持たせた
export const LEVELS = {
    easy: { name: 'やさしい', fearPerPlayer: 2, fearCards: 6, blightPerPlayer: 3, blightedPerPlayer: 5 },
    normal: { name: 'ふつう', fearPerPlayer: 3, fearCards: 6, blightPerPlayer: 3, blightedPerPlayer: 5 },
    hard: { name: 'むずかしい', fearPerPlayer: 4, fearCards: 9, blightPerPlayer: 2, blightedPerPlayer: 4 }
};

// ---- 土地の条件 ----
export const CONDITIONS = {
    any: { text: 'どの土地でも', test: () => true },
    dahan: { text: 'ダハンのいる土地', test: (L) => L.dahan.length > 0 },
    invaders: { text: '侵略者のいる土地', test: (L) => L.inv.length > 0 },
    coastal: { text: '海沿いの土地', test: (L) => L.coastal },
    M: { text: '山岳', test: (L) => L.terrain === 'M' },
    WS: { text: '湿地か砂漠', test: (L) => L.terrain === 'W' || L.terrain === 'S' }
};

// ---- 力のカード ----
// range: { from: 'presence' | 'sacred', n }（土地を対象にする力）。target: 'spirit' は精霊を対象にする力
// push: true の力は、押し出す先の土地を選ぶ
const card = (id, name, cost, speed, range, when, elements, text, run, extra = {}) => ({
    id, name, cost, speed, range, target: range ? 'land' : 'spirit', when, elements, text, run, ...extra
});
const P = (n) => ({ from: 'presence', n });
const S = (n) => ({ from: 'sacred', n });

export const CARDS = [
    // 稲妻の迅撃
    card('harbingers', '雷鳴の先触れ', 0, 'slow', P(1), 'any', ['fire', 'air'], 'ダハンを2体まで押し出す。押し出した先に町か都市があれば恐怖1', h => {
        if (h.push(['D'], 2) > 0 && h.at(h.dest).inv.some(i => i.k !== 'E')) h.fear(1);
    }, { push: true, unique: 'lightning' }),
    card('lboon', '稲妻の恩恵', 1, 'fast', null, 'any', ['fire', 'air'], '対象の精霊は、このターン、遅い力を2つまで速い力として使える', h => h.grantSwift(h.target, 2), { unique: 'lightning' }),
    card('storm', '荒れ狂う嵐', 3, 'slow', P(1), 'any', ['fire', 'air', 'water'], '侵略者それぞれに1ダメージ', h => h.damageEach(1), { unique: 'lightning' }),
    card('shatter', '開拓地の粉砕', 2, 'slow', S(2), 'any', ['fire', 'air'], '恐怖1。町を1つ破壊する', h => {
        h.fear(1);
        h.destroy('T', 1);
    }, { unique: 'lightning' }),
    // 陽光に輝く奔流
    card('vigor', '活力の恩恵', 0, 'fast', null, 'any', ['sun', 'water', 'plant'], '自分が対象ならエネルギー1。ほかの精霊なら、その精霊がこのターン使ったカード1枚につきエネルギー1', h => {
        h.gainEnergy(h.target, h.target === h.seat ? 1 : h.playedCount(h.target));
    }, { unique: 'river' }),
    card('flash', '鉄砲水', 2, 'fast', P(1), 'any', ['sun', 'water'], '1ダメージ。海沿いの土地なら、さらに1ダメージ', h => h.damage(h.L.coastal ? 2 : 1), { unique: 'river' }),
    card('bounty', '川の恵み', 0, 'slow', P(0), 'any', ['sun', 'water', 'animal'], 'ダハンを2体まで集める。ダハンが2体以上いれば、ダハンを1体加え、エネルギー1を得る', h => {
        h.gather(['D'], 2);
        if (h.L.dahan.length >= 2) {
            h.addDahan(1);
            h.gainEnergy(h.seat, 1);
        }
    }, { unique: 'river' }),
    card('wash', '押し流す', 1, 'slow', P(1), 'any', ['water', 'earth'], '探検者か町を3つまで押し出す', h => h.push(['T', 'E'], 3), { push: true, unique: 'river' }),
    // 大地の活力
    card('guard', '癒しの地の守り', 3, 'slow', S(1), 'any', ['water', 'earth', 'plant'], '荒廃を1つ取り除く。防御4', h => {
        h.removeBlight(1);
        h.defend(4);
    }, { unique: 'earth' }),
    card('stillness', '完全なる静寂の一年', 3, 'fast', P(1), 'any', ['sun', 'earth'], 'このターン、この土地の侵略者は荒らし・建設・探検をしない', h => h.flag('skipAll'), { unique: 'earth' }),
    card('rituals', '破壊の儀式', 3, 'slow', S(1), 'dahan', ['sun', 'moon', 'fire', 'earth', 'plant'], '2ダメージ。ダハンが3体以上いれば、さらに3ダメージと恐怖2', h => {
        const many = h.L.dahan.length >= 3;
        h.damage(many ? 5 : 2);
        if (many) h.fear(2);
    }, { unique: 'earth' }),
    card('fruitful', '実りの大地の引力', 1, 'slow', P(1), 'any', ['earth', 'plant', 'animal'], '探検者を2つまで集める。ダハンを2体まで集める', h => {
        h.gather(['E'], 2);
        h.gather(['D'], 2);
    }, { unique: 'earth' }),
    // 炎のように揺らめく影
    card('mantle', '恐怖の外套', 1, 'slow', null, 'any', ['moon', 'fire', 'air'], '恐怖2。対象の精霊は、存在のある土地1つから探検者と町を1つずつ押し出す', h => {
        h.fear(2);
        h.spiritPush(h.target);
    }, { unique: 'shadows' }),
    card('favors', '呼び戻される恩義', 1, 'slow', P(1), 'any', ['moon', 'air', 'animal'], 'ダハンを4体まで集める。侵略者がいて、ダハンの方が多ければ恐怖3', h => {
        h.gather(['D'], 4);
        if (h.L.inv.length > 0 && h.L.dahan.length > h.L.inv.length) h.fear(3);
    }, { unique: 'shadows' }),
    card('crops', '枯れゆく作物', 1, 'slow', P(1), 'any', ['moon', 'fire', 'plant'], '恐怖2。町1つを探検者に（なければ都市1つを町に）置き換える', h => {
        h.fear(2);
        if (!h.replace('T', 'E')) h.replace('C', 'T');
    }, { unique: 'shadows' }),
    card('concealing', '隠れ潜む影', 0, 'fast', P(0), 'any', ['moon', 'air'], '恐怖1。このターン、ダハンは侵略者からダメージを受けない', h => {
        h.fear(1);
        h.flag('dahanSafe');
    }, { unique: 'shadows' }),

    // 小さな力
    card('howl', '狼の遠吠え', 0, 'fast', P(1), 'any', ['moon', 'animal'], '恐怖1。探検者を1つ押し出す', h => {
        h.fear(1);
        h.push(['E'], 1);
    }, { push: true, minor: true }),
    card('vines', '絡みつく蔓', 1, 'slow', P(1), 'any', ['plant', 'animal'], '1ダメージ。密林か湿地なら、さらに1ダメージ', h => h.damage(['J', 'W'].includes(h.L.terrain) ? 2 : 1), { minor: true }),
    card('drums', '呼び集める太鼓', 1, 'slow', P(1), 'any', ['air', 'animal'], 'ダハンを2体まで集める。侵略者がいれば恐怖1', h => {
        h.gather(['D'], 2);
        if (h.L.inv.length > 0) h.fear(1);
    }, { minor: true }),
    card('tremor', '地鳴り', 1, 'fast', P(1), 'any', ['earth', 'moon'], '恐怖1。探検者を1つ破壊する', h => {
        h.fear(1);
        h.destroy('E', 1);
    }, { minor: true }),
    card('mist', '守りの霧', 1, 'fast', P(1), 'any', ['air', 'water'], '防御2。探検者を1つ押し出す', h => {
        h.defend(2);
        h.push(['E'], 1);
    }, { push: true, minor: true }),
    card('scorch', '焼けつく陽射し', 1, 'slow', P(1), 'any', ['sun', 'fire'], '1ダメージ。砂漠なら、さらに1ダメージ', h => h.damage(h.L.terrain === 'S' ? 2 : 1), { minor: true }),
    card('poison', '毒の泉', 2, 'slow', P(1), 'any', ['water', 'plant'], '恐怖1。探検者を2つまで破壊する', h => {
        h.fear(1);
        h.destroy('E', 2);
    }, { minor: true }),
    card('omen', '嵐の兆し', 1, 'fast', P(2), 'invaders', ['air', 'moon'], '恐怖2', h => h.fear(2), { minor: true }),
    card('roots', '根を張る森', 1, 'slow', P(1), 'any', ['plant', 'earth'], '防御3。荒廃がなければ、ダハンを1体加える', h => {
        h.defend(3);
        if (h.L.blight === 0) h.addDahan(1);
    }, { minor: true }),
    card('rain', '癒しの雨', 1, 'slow', P(1), 'any', ['water', 'plant', 'sun'], '荒廃を1つ取り除く', h => h.removeBlight(1), { minor: true }),
    card('whisper', '恐れの囁き', 0, 'slow', P(2), 'any', ['moon', 'air'], '恐怖1。探検者か町を1つ押し出す', h => {
        h.fear(1);
        h.push(['T', 'E'], 1);
    }, { push: true, minor: true }),
    card('stampede', '獣の暴走', 2, 'slow', P(1), 'any', ['animal', 'fire'], '2ダメージ', h => h.damage(2), { minor: true }),
    card('oldways', '古き道の加護', 1, 'fast', P(1), 'dahan', ['sun', 'animal'], '防御2。ダハンを1体加える', h => {
        h.defend(2);
        h.addDahan(1);
    }, { minor: true }),
    card('tongue', '炎の舌', 2, 'fast', P(1), 'any', ['fire', 'air'], '2ダメージ', h => h.damage(2), { minor: true }),
    card('sink', '沈む大地', 2, 'slow', P(1), 'WS', ['water', 'earth'], '町を1つ破壊する', h => h.destroy('T', 1), { minor: true }),
    card('veil', '夜の帳', 1, 'fast', P(1), 'any', ['moon'], 'このターン、この土地では侵略者が建設しない', h => h.flag('skipBuild'), { minor: true }),

    // 大いなる力（得るときに、持っている力のカードを1枚忘れる）。threshold の元素がそろうと、追加の効果がある
    card('quake', '大地の怒り', 4, 'slow', P(1), 'any', ['earth', 'fire'], '恐怖1。4ダメージ。〔大地3〕さらに2ダメージ', h => {
        h.fear(1);
        h.damage(h.has({ earth: 3 }) ? 6 : 4);
    }, { major: true, threshold: { earth: 3 } }),
    card('wildwood', '森の目覚め', 4, 'slow', P(1), 'any', ['plant', 'animal'], '3ダメージ。防御2。〔植物3〕さらに探検者をすべて破壊', h => {
        h.damage(3);
        h.defend(2);
        if (h.has({ plant: 3 })) h.destroy('E', 99);
    }, { major: true, threshold: { plant: 3 } }),
    card('eruption', '火山の噴火', 5, 'slow', S(1), 'M', ['fire', 'earth'], '6ダメージ。〔火3・大地2〕となりの土地すべてに2ダメージ', h => {
        h.damage(6);
        if (h.has({ fire: 3, earth: 2 })) h.adjacent().forEach(id => h.damageAt(id, 2));
    }, { major: true, threshold: { fire: 3, earth: 2 } }),
    card('tsunami', '大津波', 5, 'slow', P(1), 'coastal', ['water', 'earth'], '恐怖2。4ダメージ。〔水3〕同じボードのほかの海沿いの土地に2ダメージ', h => {
        h.fear(2);
        h.damage(4);
        if (h.has({ water: 3 })) h.sameBoardCoastal().forEach(id => h.damageAt(id, 2));
    }, { major: true, threshold: { water: 3 } }),
    card('nightmare', '恐慌の悪夢', 3, 'fast', P(2), 'invaders', ['moon', 'air'], '恐怖4。〔月2・風2〕恐怖2と、探検者を2つ破壊', h => {
        h.fear(4);
        if (h.has({ moon: 2, air: 2 })) {
            h.fear(2);
            h.destroy('E', 2);
        }
    }, { major: true, threshold: { moon: 2, air: 2 } }),
    card('renewal', '生命の奔流', 3, 'slow', P(1), 'any', ['water', 'plant', 'sun'], '荒廃を1つ取り除き、ダハンを2体加える。防御3。〔水2・植物2〕さらに荒廃を1つ取り除く', h => {
        h.removeBlight(h.has({ water: 2, plant: 2 }) ? 2 : 1);
        h.addDahan(2);
        h.defend(3);
    }, { major: true, threshold: { water: 2, plant: 2 } }),
    card('thunder', '天の雷槌', 5, 'fast', P(1), 'any', ['fire', 'air', 'sun'], '都市を1つ破壊し、2ダメージ。〔風3〕さらに2ダメージ', h => {
        h.destroy('C', 1);
        h.damage(h.has({ air: 3 }) ? 4 : 2);
    }, { major: true, threshold: { air: 3 } }),
    card('uprising', '民の蜂起', 4, 'slow', P(1), 'dahan', ['sun', 'animal', 'fire'], 'ダハン1体につき2ダメージ。ダハンを1体加える。〔動物2・太陽2〕恐怖2', h => {
        h.damage(2 * h.L.dahan.length);
        h.addDahan(1);
        if (h.has({ animal: 2, sun: 2 })) h.fear(2);
    }, { major: true, threshold: { animal: 2, sun: 2 } })
];
export const CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const MINOR_CARDS = CARDS.filter(c => c.minor).map(c => c.id);
export const MAJOR_CARDS = CARDS.filter(c => c.major).map(c => c.id);

// ---- 精霊 ----
// growth：成長の選び方（1ターンに1つ）。reclaim 捨て札を手札へ・power 力のカードを得る・presenceN 範囲Nに存在を置く・energyN エネルギーN
// energy・cards：存在の列（左から取ると、下の値が見える）。'R' は「毎ターン、捨て札を1枚手札へ」
// innate：生まれ持つ力。levels の元素がそろった段まで効く
export const SPIRITS = {
    river: {
        name: '陽光に輝く奔流', short: '奔流', color: '#3a9bdc',
        growth: [['reclaim', 'power', 'energy1'], ['presence1', 'presence1'], ['power', 'presence2']],
        energy: [1, 2, 2, 3, 4, 4, 5], cards: [1, 2, 2, 3, 'R', 4, 5],
        hand: ['vigor', 'flash', 'bounty', 'wash'],
        setup: [['W', 1]],
        special: '川の領域：湿地にある自分の存在は、1つでも聖地として数える',
        innate: {
            id: 'flooding', name: '大洪水', speed: 'slow', range: S(1), when: 'invaders', push: true,
            levels: [
                { need: { sun: 1, water: 2 }, text: '探検者か町を1つ押し出す' },
                { need: { sun: 2, water: 3 }, text: 'かわりに、2ダメージを与えてから、探検者か町を3つまで押し出す' },
                { need: { sun: 3, water: 4, earth: 1 }, text: 'かわりに、侵略者それぞれに2ダメージ' }
            ],
            run: (h, level) => {
                if (level >= 3) h.damageEach(2);
                else if (level === 2) {
                    h.damage(2);
                    h.push(['T', 'E'], 3);
                } else h.push(['T', 'E'], 1);
            }
        }
    },
    earth: {
        name: '大地の活力', short: '大地', color: '#9a7b4f',
        growth: [['reclaim', 'presence2'], ['power', 'presence0'], ['presence1', 'energy2']],
        energy: [2, 3, 4, 6, 7, 8], cards: [1, 2, 2, 3, 4],
        hand: ['guard', 'stillness', 'rituals', 'fruitful'],
        setup: [['M', 2], ['J', 1]],
        special: '大地の生命力：自分の聖地のある土地は、いつも防御3',
        innate: {
            id: 'gift', name: '力の授与', speed: 'fast', range: null,
            levels: [
                { need: { sun: 1, earth: 2, plant: 2 }, text: '対象の精霊は、このターン、使った費用1以下の力のカードを1回くり返せる' },
                { need: { sun: 2, earth: 3, plant: 2 }, text: 'かわりに、費用3以下' },
                { need: { sun: 2, earth: 4, plant: 3 }, text: 'かわりに、費用6以下' }
            ],
            run: (h, level) => h.grantRepeat(h.target, [1, 3, 6][level - 1])
        }
    },
    lightning: {
        name: '稲妻の迅撃', short: '稲妻', color: '#e0b425',
        growth: [['reclaim', 'power', 'energy1'], ['presence1', 'presence1'], ['presence1', 'energy3']],
        energy: [1, 1, 2, 2, 3, 4, 4, 5], cards: [2, 3, 4, 5, 6],
        hand: ['harbingers', 'lboon', 'storm', 'shatter'],
        setup: [['S', 2]],
        special: '稲妻の速さ：このターンの風の元素1つにつき、遅い力を1つ速い力として使える',
        innate: {
            id: 'thundering', name: '破壊の雷鳴', speed: 'slow', range: P(1), when: 'any',
            levels: [
                { need: { fire: 3, air: 2 }, text: '町か都市を1つ破壊する' },
                { need: { fire: 4, air: 3 }, text: 'さらに町か都市を1つ破壊する' },
                { need: { fire: 5, air: 4, water: 1 }, text: 'さらに町か都市を1つ破壊する' },
                { need: { fire: 5, air: 5, water: 2 }, text: 'さらに町か都市を1つ破壊する' }
            ],
            run: (h, level) => h.destroyBuildings(level)
        }
    },
    shadows: {
        name: '炎のように揺らめく影', short: '影', color: '#7a4fb0',
        growth: [['reclaim', 'power'], ['power', 'presence1'], ['presence3', 'energy3']],
        energy: [0, 1, 3, 4, 5, 6], cards: [1, 2, 3, 3, 4, 5],
        hand: ['mantle', 'favors', 'crops', 'concealing'],
        setup: [['J', 1], [5, 1]],
        special: 'ダハンの影：力を使うとき、エネルギー1を払えば、範囲にかかわらずダハンのいる土地を対象にできる',
        innate: {
            id: 'darkness', name: '闇は油断を呑む', speed: 'fast', range: P(1), when: 'any',
            levels: [
                { need: { moon: 2, fire: 1 }, text: '探検者を1つ集める' },
                { need: { moon: 3, fire: 2 }, text: '探検者を2つまで破壊し、破壊した1つにつき恐怖1' },
                { need: { moon: 4, fire: 3, air: 2 }, text: '3ダメージ。この力で破壊した侵略者1つにつき恐怖1' }
            ],
            run: (h, level) => {
                h.gather(['E'], 1);
                if (level >= 2) h.fear(h.destroy('E', 2));
                if (level >= 3) h.fear(h.damage(3).length);
            }
        }
    }
};
export const SPIRIT_KEYS = Object.keys(SPIRITS);
export const INNATE = Object.fromEntries(Object.entries(SPIRITS).map(([key, s]) => [s.innate.id, { ...s.innate, spirit: key }]));

// 成長の部品の文
export function growthPartText(part) {
    if (part === 'reclaim') return '捨て札をすべて手札へ';
    if (part === 'power') return '力のカードを得る';
    if (part.startsWith('presence')) return `存在を置く（範囲${part.slice(8)}）`;
    if (part.startsWith('energy')) return `エネルギー+${part.slice(6)}`;
    return part;
}

// ---- 恐怖カード ----
// 3つの段階ごとの効果。対象の土地は、各ボードで侵略者の多い土地から自動で選ぶ（原作は精霊が選ぶ）
export const FEAR_CARDS = [
    { id: 'retreat', name: '退く開拓者', text: ['各ボードで、探検者を1つ取り除く', '各ボードで、探検者か町を1つ取り除く', '各ボードで、町か都市を1つ取り除く'] },
    { id: 'courage', name: '奮い立つダハン', text: ['ダハンのいる土地すべてに防御2', 'ダハンのいる土地すべてに防御3', 'ダハンのいる土地で、ダハン1体につき1ダメージ'] },
    { id: 'isolation', name: '孤立する集落', text: ['ダハンのいる土地では建設しない', 'ダハンか存在のある土地では建設しない', 'このターン、侵略者は建設しない'] },
    { id: 'hesitation', name: 'ためらう探検隊', text: ['各ボードで、海沿いの土地から探検者を1つ取り除く', '存在のある土地では探検しない', 'このターン、侵略者は探検しない'] },
    { id: 'wary', name: '用心深い略奪', text: ['侵略者がダハンより多くない土地では荒らさない', 'すべての土地に防御2', '都市のない土地では荒らさない'] },
    { id: 'flight', name: '逃げ出す入植者', text: ['各ボードで、存在のある土地から探検者を1つ取り除く', '各ボードで、存在のある土地から町1つ（なければ探検者2つ）を取り除く', '各ボードで、町か都市を1つ取り除く'] },
    { id: 'revenge', name: 'ダハンの逆襲', text: ['各ボードで、ダハンのいる土地1つで、ダハン1体につき1ダメージ', '各ボードで、ダハンのいる土地1つで、ダハン1体につき2ダメージ', 'ダハンのいる土地すべてで、ダハン1体につき2ダメージ'] },
    { id: 'terror', name: '夜の怪異', text: ['各ボードで、存在のある土地の探検者を1つ破壊する', '各ボードで、存在のある土地の町を1つ破壊する（なければ探検者2つ）', '各ボードで、町か都市を1つ破壊する'] },
    { id: 'trade', name: '途絶えた交易', text: ['海沿いの土地では建設しない', '海沿いの土地とダハンのいる土地では建設しない', 'このターン、侵略者は建設しない。各ボードで探検者を1つ取り除く'] }
];
export const FEAR_CARD = Object.fromEntries(FEAR_CARDS.map(f => [f.id, f]));
