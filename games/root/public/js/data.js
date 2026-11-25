/**
 * ルートの部品のデータ（秋の地図・共有の山札・陣営・クエスト）
 * 地図の空き地の番号は、四隅が 1〜4（1 と 3、2 と 4 が対角）。座標は 950×810 の地図の上の位置
 */

export const SUITS = ['fox', 'rabbit', 'mouse'];
export const SUIT_NAMES = { fox: 'キツネ', rabbit: 'ウサギ', mouse: 'ネズミ', bird: '鳥' };

// 秋の地図。id は 0 始まり（表示の番号は id + 1）。slots は建物の枠の数（遺跡があれば、その枠も含む）
export const CLEARINGS = [
    { suit: 'fox', slots: 1, ruin: false, x: 105, y: 118 },     // 1 左上の角
    { suit: 'mouse', slots: 2, ruin: false, x: 832, y: 205 },   // 2 右上の角
    { suit: 'rabbit', slots: 1, ruin: false, x: 782, y: 740 },  // 3 右下の角
    { suit: 'rabbit', slots: 1, ruin: false, x: 118, y: 705 },  // 4 左下の角
    { suit: 'rabbit', slots: 2, ruin: false, x: 512, y: 92 },   // 5
    { suit: 'fox', slots: 2, ruin: true, x: 842, y: 448 },      // 6
    { suit: 'mouse', slots: 2, ruin: false, x: 540, y: 660 },   // 7
    { suit: 'fox', slots: 2, ruin: false, x: 362, y: 762 },     // 8
    { suit: 'mouse', slots: 2, ruin: true, x: 92, y: 372 },     // 9
    { suit: 'rabbit', slots: 2, ruin: true, x: 392, y: 262 },   // 10
    { suit: 'mouse', slots: 3, ruin: false, x: 598, y: 418 },   // 11
    { suit: 'fox', slots: 2, ruin: true, x: 300, y: 480 }       // 12
].map((c, id) => ({ id, ...c }));

// 道（表示の番号で書き、id に直す）
export const PATHS = [
    [1, 5], [1, 9], [1, 10], [5, 2], [2, 10], [2, 6], [6, 11], [6, 3], [3, 11], [3, 7],
    [7, 8], [7, 12], [8, 4], [4, 9], [4, 12], [9, 12], [10, 12], [11, 12]
].map(([a, b]) => [a - 1, b - 1]);

// 森（道に囲まれた区域）。接する空き地の番号を、囲む順に書く。x・y は森の印を置く場所（空き地と重ならない所）
export const FORESTS = [
    { list: [1, 5, 2, 10], x: 600, y: 168 },
    { list: [1, 10, 12, 9], x: 215, y: 290 },
    { list: [10, 2, 6, 11, 12], x: 650, y: 305 },
    { list: [9, 12, 4], x: 170, y: 525 },
    { list: [12, 7, 8, 4], x: 330, y: 630 },
    { list: [12, 11, 3, 7], x: 565, y: 540 },
    { list: [11, 6, 3], x: 748, y: 565 }
].map(({ list, x, y }, id) => ({ id, clearings: list.map(n => n - 1), x, y }));

// 川（絵だけ。基本のルールでは働かない）。川沿いの空き地は 5・10・11・7・4
export const RIVER = [[540, 0], [522, 50], [478, 140], [430, 190], [420, 250], [470, 292], [560, 318], [612, 360], [606, 418],
    [566, 486], [540, 540], [552, 610], [540, 660], [470, 642], [372, 628], [252, 646], [160, 690], [70, 720], [0, 700]];

export const CORNERS = [0, 1, 2, 3];
export const OPPOSITE_CORNER = { 0: 2, 2: 0, 1: 3, 3: 1 };

export const adjacency = CLEARINGS.map(c => PATHS.filter(p => p.includes(c.id)).map(p => (p[0] === c.id ? p[1] : p[0])).sort((a, b) => a - b));

// 森どうしは、道を1本はさんで接していれば隣（囲む辺を共有する）
const edgesOf = (forest) => forest.clearings.map((c, i) => [c, forest.clearings[(i + 1) % forest.clearings.length]].sort((a, b) => a - b).join('-'));
export const forestAdjacency = FORESTS.map(f => {
    const mine = new Set(edgesOf(f));
    return FORESTS.filter(g => g.id !== f.id && edgesOf(g).some(e => mine.has(e))).map(g => g.id);
});

// ---- アイテム ----

export const ITEMS = ['boot', 'sword', 'crossbow', 'hammer', 'torch', 'tea', 'coins', 'bag'];
export const ITEM_NAMES = { boot: 'ブーツ', sword: '剣', crossbow: 'クロスボウ', hammer: 'ハンマー', torch: 'たいまつ', tea: 'お茶', coins: '金貨', bag: '袋' };
// 工作で作れるアイテムの数（地図の脇の置き場）
export const ITEM_SUPPLY = { boot: 2, bag: 2, crossbow: 1, hammer: 1, sword: 2, tea: 2, coins: 2 };
// 遺跡の下のアイテム
export const RUIN_ITEMS = ['bag', 'boot', 'hammer', 'sword'];

// ---- 共有の山札（54枚） ----
// cost：工作に要る空き地の印（any は何でもよい）。item：作るアイテムと得点。effect：持続する効果・使い切りの効果

const CARD_DEFS = [
    // 鳥（14）
    { key: 'ambush-bird', name: '待ち伏せ', suit: 'bird', copies: 2, kind: 'ambush' },
    { key: 'armorers', name: '武具師', suit: 'bird', copies: 2, cost: ['fox'], effect: 'armorers' },
    { key: 'arms-trader', name: '武器商人', suit: 'bird', copies: 1, cost: ['fox', 'fox'], item: 'sword', vp: 2 },
    { key: 'birdy-bindle', name: '鳥の包み', suit: 'bird', copies: 1, cost: ['mouse'], item: 'bag', vp: 1 },
    { key: 'brutal-tactics', name: '非情な戦術', suit: 'bird', copies: 2, cost: ['fox', 'fox'], effect: 'brutal' },
    { key: 'crossbow-bird', name: 'クロスボウ', suit: 'bird', copies: 1, cost: ['fox'], item: 'crossbow', vp: 1 },
    { key: 'royal-claim', name: '王の権利', suit: 'bird', copies: 1, cost: ['any', 'any', 'any', 'any'], effect: 'royal' },
    { key: 'sappers', name: '工兵', suit: 'bird', copies: 2, cost: ['mouse'], effect: 'sappers' },
    { key: 'woodland-runners', name: '森の飛脚', suit: 'bird', copies: 1, cost: ['rabbit'], item: 'boot', vp: 1 },
    { key: 'dominance-bird', name: '鳥の支配', suit: 'bird', copies: 1, kind: 'dominance' },
    // キツネ（14）
    { key: 'ambush-fox', name: '待ち伏せ', suit: 'fox', copies: 1, kind: 'ambush' },
    { key: 'anvil', name: '金床', suit: 'fox', copies: 1, cost: ['fox'], item: 'hammer', vp: 2 },
    { key: 'foxfolk-steel', name: 'キツネの鋼', suit: 'fox', copies: 1, cost: ['fox', 'fox'], item: 'sword', vp: 2 },
    { key: 'knapsack', name: 'お古の背負い袋', suit: 'fox', copies: 1, cost: ['mouse'], item: 'bag', vp: 1 },
    { key: 'protection-racket', name: 'みかじめ料', suit: 'fox', copies: 1, cost: ['rabbit', 'rabbit'], item: 'coins', vp: 3 },
    { key: 'tea-fox', name: '根のお茶', suit: 'fox', copies: 1, cost: ['mouse'], item: 'tea', vp: 2 },
    { key: 'travel-gear-fox', name: '旅支度', suit: 'fox', copies: 1, cost: ['rabbit'], item: 'boot', vp: 1 },
    { key: 'stand-and-deliver', name: '金を出せ', suit: 'fox', copies: 2, cost: ['mouse', 'mouse', 'mouse'], effect: 'stand' },
    { key: 'tax-collector', name: '徴税人', suit: 'fox', copies: 3, cost: ['fox', 'rabbit', 'mouse'], effect: 'tax' },
    { key: 'favor-fox', name: 'キツネの恩寵', suit: 'fox', copies: 1, cost: ['fox', 'fox', 'fox'], effect: 'favor' },
    { key: 'dominance-fox', name: 'キツネの支配', suit: 'fox', copies: 1, kind: 'dominance' },
    // ウサギ（13）
    { key: 'ambush-rabbit', name: '待ち伏せ', suit: 'rabbit', copies: 1, kind: 'ambush' },
    { key: 'visit-friends', name: '友人の訪問', suit: 'rabbit', copies: 1, cost: ['rabbit'], item: 'boot', vp: 1 },
    { key: 'bake-sale', name: '焼き菓子の市', suit: 'rabbit', copies: 1, cost: ['rabbit', 'rabbit'], item: 'coins', vp: 3 },
    { key: 'burrow-bank', name: '巣穴銀行', suit: 'rabbit', copies: 2, cost: ['rabbit', 'rabbit'], effect: 'bank' },
    { key: 'cobbler', name: '靴職人', suit: 'rabbit', copies: 2, cost: ['rabbit', 'rabbit'], effect: 'cobbler' },
    { key: 'command-warren', name: '司令の巣穴', suit: 'rabbit', copies: 2, cost: ['rabbit', 'rabbit'], effect: 'warren' },
    { key: 'favor-rabbit', name: 'ウサギの恩寵', suit: 'rabbit', copies: 1, cost: ['rabbit', 'rabbit', 'rabbit'], effect: 'favor' },
    { key: 'tea-rabbit', name: '根のお茶', suit: 'rabbit', copies: 1, cost: ['mouse'], item: 'tea', vp: 2 },
    { key: 'smugglers-trail', name: '密輸の道', suit: 'rabbit', copies: 1, cost: ['mouse'], item: 'bag', vp: 1 },
    { key: 'dominance-rabbit', name: 'ウサギの支配', suit: 'rabbit', copies: 1, kind: 'dominance' },
    // ネズミ（13）
    { key: 'ambush-mouse', name: '待ち伏せ', suit: 'mouse', copies: 1, kind: 'ambush' },
    { key: 'mouse-in-sack', name: '袋のネズミ', suit: 'mouse', copies: 1, cost: ['mouse'], item: 'bag', vp: 1 },
    { key: 'codebreakers', name: '暗号破り', suit: 'mouse', copies: 2, cost: ['mouse'], effect: 'codebreakers' },
    { key: 'crossbow-mouse', name: 'クロスボウ', suit: 'mouse', copies: 1, cost: ['fox'], item: 'crossbow', vp: 1 },
    { key: 'favor-mouse', name: 'ネズミの恩寵', suit: 'mouse', copies: 1, cost: ['mouse', 'mouse', 'mouse'], effect: 'favor' },
    { key: 'investments', name: '投資', suit: 'mouse', copies: 1, cost: ['rabbit', 'rabbit'], item: 'coins', vp: 3 },
    { key: 'tea-mouse', name: '根のお茶', suit: 'mouse', copies: 1, cost: ['mouse'], item: 'tea', vp: 2 },
    { key: 'scouting-party', name: '偵察隊', suit: 'mouse', copies: 2, cost: ['mouse', 'mouse'], effect: 'scouting' },
    { key: 'sword-mouse', name: '剣', suit: 'mouse', copies: 1, cost: ['fox', 'fox'], item: 'sword', vp: 2 },
    { key: 'travel-gear-mouse', name: '旅支度', suit: 'mouse', copies: 1, cost: ['rabbit'], item: 'boot', vp: 1 },
    { key: 'dominance-mouse', name: 'ネズミの支配', suit: 'mouse', copies: 1, kind: 'dominance' }
];

export const CARDS = CARD_DEFS.flatMap(def => Array.from({ length: def.copies }, () => ({
    key: def.key, name: def.name, suit: def.suit, kind: def.kind ?? (def.item ? 'item' : def.effect === 'favor' ? 'favor' : 'effect'),
    cost: def.cost ?? null, item: def.item ?? null, vp: def.vp ?? 0, effect: def.effect ?? null
}))).map((card, id) => ({ id, ...card }));

// 持続する効果の説明（遊び方とカードの説明に使う）
export const EFFECT_TEXT = {
    armorers: '戦闘で、捨てると、出目で受ける打撃をすべて無視できる',
    brutal: '攻撃側の戦闘で、追加で1打撃を与える。代わりに守り手が1点を得る',
    royal: '鳥の歌で捨てると、支配している空き地1つにつき1点',
    sappers: '守り手の戦闘で、捨てると追加で1打撃を与える',
    stand: '鳥の歌に、ほかの人の手札から1枚を無作為に取る。その人は1点を得る',
    tax: '昼に1回、自分の兵を地図から1体除いて、カードを1枚引く',
    favor: '工作したとき、その印の空き地にいる、ほかの人の駒をすべて除く',
    bank: '鳥の歌に、自分とほかの1人が1枚ずつ引く',
    cobbler: '夕方の初めに、1回移動できる',
    warren: '昼の初めに、1回戦闘できる',
    codebreakers: '昼に1回、ほかの人の手札を見る',
    scouting: '攻撃側の戦闘で、待ち伏せを受けない',
    ambush: '守り手の戦闘で、空き地の印に合えば出せる。攻撃側に2打撃（攻撃側が合う待ち伏せを出すと打ち消す）',
    dominance: '10点以上で出すと、得点の代わりに支配で勝ちを目指す（鳥の歌の初めに、その印の空き地を3つ支配していれば勝ち。鳥は対角の隅2つ）'
};

// ---- 陣営 ----

export const FACTIONS = ['marquise', 'eyrie', 'alliance', 'vagabond'];
export const FACTION_INFO = {
    marquise: { name: '侯爵家', short: 'ネコ', color: '#d9752b', text: '#fff' },
    eyrie: { name: '鷲の王朝', short: '鷲', color: '#2f62b0', text: '#fff' },
    alliance: { name: '森林連合', short: '連合', color: '#3f8f4e', text: '#fff' },
    vagabond: { name: '放浪者', short: '放浪者', color: '#555b63', text: '#fff' }
};

// 侯爵家：建物ごとの費用（木材）と、置いたときの得点
export const MARQUISE_COST = [0, 1, 2, 3, 3, 4];
export const MARQUISE_VP = { sawmill: [0, 1, 2, 3, 4, 5], workshop: [0, 2, 2, 3, 4, 5], recruiter: [0, 1, 2, 3, 3, 4] };
// 徴兵所を3つ目・5つ目に置くと、夕方に引く枚数が1枚ずつ増える
export const MARQUISE_DRAW_AT = [3, 5];
export const MARQUISE_WARRIORS = 25;
export const MARQUISE_WOOD = 8;
export const BUILDING_NAMES = { sawmill: '製材所', workshop: '工房', recruiter: '徴兵所', roost: '止まり木', base: '拠点' };
export const TOKEN_NAMES = { wood: '木材', keep: '本拠', sympathy: '同調者' };

// 鷲の王朝
export const EYRIE_WARRIORS = 20;
export const ROOST_VP = [0, 1, 2, 3, 4, 4, 5];
export const ROOST_DRAW_AT = [3, 6];
export const DECREE = ['recruit', 'move', 'battle', 'build'];
export const DECREE_NAMES = { recruit: '徴兵', move: '移動', battle: '戦闘', build: '建設' };
export const LEADERS = {
    builder: { name: '建築家', viziers: ['recruit', 'move'], text: '工作のアイテムで、ふつうどおりの得点を得る' },
    charismatic: { name: '人望家', viziers: ['recruit', 'battle'], text: '徴兵で兵を2体置く' },
    commander: { name: '司令官', viziers: ['move', 'battle'], text: '攻撃側の戦闘で、追加で1打撃' },
    despot: { name: '暴君', viziers: ['move', 'build'], text: '戦闘で建物かトークンを1つ以上除くと、1点' }
};

// 森林連合
export const ALLIANCE_WARRIORS = 10;
export const SYMPATHY_COST = [1, 1, 1, 2, 2, 2, 3, 3, 3, 3];
export const SYMPATHY_VP = [0, 1, 1, 1, 2, 2, 3, 4, 4, 4];

// 放浪者
export const CHARACTERS = {
    thief: { name: '盗賊', items: ['boot', 'torch', 'tea', 'sword'], special: '盗む：たいまつを使い、同じ空き地の人の手札から1枚を無作為に取る' },
    tinker: { name: '修理屋', items: ['boot', 'torch', 'bag', 'hammer'], special: '日雇い：たいまつを使い、捨て札から空き地の印に合うカードを1枚取る' },
    ranger: { name: '狩人', items: ['boot', 'torch', 'crossbow', 'sword'], special: '隠れ家：たいまつを使い、傷んだアイテムを3つまで直して、昼を終える' }
};
export const RELATIONS = ['hostile', 'indifferent', 'amiable', 'friendly', 'allied'];
export const RELATION_NAMES = { hostile: '敵対', indifferent: '無関心', amiable: '好意', friendly: '友好', allied: '同盟' };
// 次の段に上がるのに、1回の手番で必要な援助の数と、上がったときの得点（無関心→好意→友好→同盟）
export const RELATION_STEPS = { indifferent: { aids: 1, vp: 1 }, amiable: { aids: 2, vp: 2 }, friendly: { aids: 2, vp: 2 } };

export const QUESTS = [
    { name: '資金集め', suit: 'fox', items: ['tea', 'coins'] },
    { name: 'お使い', suit: 'fox', items: ['tea', 'boot'] },
    { name: '荷運び', suit: 'fox', items: ['boot', 'bag'] },
    { name: '小屋の修理', suit: 'fox', items: ['torch', 'hammer'] },
    { name: '演説', suit: 'fox', items: ['torch', 'tea'] },
    { name: '見張り', suit: 'rabbit', items: ['torch', 'sword'] },
    { name: 'お使い', suit: 'rabbit', items: ['tea', 'boot'] },
    { name: '演説', suit: 'rabbit', items: ['torch', 'tea'] },
    { name: '熊の追い払い', suit: 'rabbit', items: ['torch', 'crossbow'] },
    { name: '山賊退治', suit: 'rabbit', items: ['sword', 'sword'] },
    { name: '山賊退治', suit: 'mouse', items: ['sword', 'sword'] },
    { name: '見張り', suit: 'mouse', items: ['torch', 'sword'] },
    { name: '熊の追い払い', suit: 'mouse', items: ['torch', 'crossbow'] },
    { name: '護衛', suit: 'mouse', items: ['boot', 'boot'] },
    { name: '荷運び', suit: 'mouse', items: ['boot', 'bag'] }
].map((q, id) => ({ id, ...q }));

export const WIN_SCORE = 30;
export const HAND_LIMIT = 5;
// CPU だけの試合が終わらないときの安全弁（この巡で、得点の一番多い人の勝ちにする）
export const MAX_ROUNDS = 40;
