/**
 * ホラーファイドのデータ（村の地図・アイテム・怪物・英雄・村人・特典・怪物カード）
 * 地図・名前・文はすべて自作。原作の名前・絵・文は使っていない
 */

// ---- 村の地図（20か所）。x・y は地図の SVG の座標（幅 360・高さ 300） ----
export const LOCATIONS = [
    { name: '洞窟', x: 36, y: 34 },
    { name: '野営地', x: 108, y: 30 },
    { name: '塔', x: 180, y: 36 },
    { name: '地下牢', x: 252, y: 30 },
    { name: '修道院', x: 324, y: 36 },
    { name: '納屋', x: 40, y: 108 },
    { name: '宿屋', x: 112, y: 102 },
    { name: '劇場', x: 180, y: 110 },
    { name: '屋敷', x: 250, y: 102 },
    { name: '地下墓所', x: 322, y: 110 },
    { name: '波止場', x: 34, y: 186 },
    { name: '商店', x: 106, y: 180 },
    { name: '広場', x: 180, y: 186 },
    { name: '博物館', x: 254, y: 180 },
    { name: '教会', x: 326, y: 188 },
    { name: '研究所', x: 40, y: 264 },
    { name: '学院', x: 112, y: 258 },
    { name: '病院', x: 180, y: 266 },
    { name: '警察署', x: 250, y: 258 },
    { name: '墓地', x: 322, y: 264 }
];
export const LOCATION_COUNT = LOCATIONS.length;
export const loc = (name) => LOCATIONS.findIndex(l => l.name === name);

export const EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [5, 6], [6, 7], [7, 8], [8, 9],
    [10, 11], [11, 12], [12, 13], [13, 14],
    [15, 16], [16, 17], [17, 18], [18, 19],
    [0, 5], [2, 7], [3, 8], [4, 9],
    [5, 10], [6, 11], [7, 12], [9, 14],
    [10, 15], [11, 16], [12, 17], [13, 18], [14, 19]
];
export const NEIGHBORS = LOCATIONS.map((_, i) => EDGES.filter(e => e.includes(i)).map(e => (e[0] === i ? e[1] : e[0])).sort((a, b) => a - b));

// 全地点の間の距離（変わらない地図なので最初に1回だけ数える）
export const DIST = LOCATIONS.map((_, from) => {
    const d = LOCATIONS.map(() => Infinity);
    d[from] = 0;
    const queue = [from];
    while (queue.length) {
        const at = queue.shift();
        NEIGHBORS[at].forEach(n => {
            if (d[n] === Infinity) {
                d[n] = d[at] + 1;
                queue.push(n);
            }
        });
    }
    return d;
});

// from から to へ1歩進むときの次の地点（同じ距離なら番号の小さい方）
export function stepToward(from, to) {
    if (from === to) return from;
    return NEIGHBORS[from].find(n => DIST[n][to] === DIST[from][to] - 1);
}

export const HOSPITAL = loc('病院');

// ---- アイテム（赤・青・黄 各20個） ----
export const COLORS = ['red', 'blue', 'yellow'];
export const COLOR_NAMES = { red: '赤', blue: '青', yellow: '黄' };
const ITEM_NAMES = {
    red: ['杭', '斧', '鉈', '鎌', '剣', '槍', '猟銃', '弓', '金槌', '鉄棒', '松明', '鎖', '熊手', '銛', '棍棒', '短刀', '散弾銃', '大鎌', '鍬', '投石器'],
    blue: ['古文書', '地図', '日記', '薬品', '望遠鏡', '顕微鏡', '化学書', '写真', '天球儀', '暦', '手紙', '標本', '薬草図鑑', '方位磁石', '設計図', '新聞', '辞典', '星図', '天秤', '試験管'],
    yellow: ['十字架', '聖水', 'ろうそく', '銀の鈴', '花束', '祈祷書', 'ランタン', '銀の鏡', '護符', '数珠', '香炉', '聖歌集', '鐘', 'お守り', '白い羽', '月桂冠', '清めの塩', '聖典', '手鏡', '灯油']
};
// 色ごとの強さの並び（1が2個・2が4個・3が5個・4が4個・5が3個・6が2個）
const STRENGTHS = [1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6];
export const ITEMS = COLORS.flatMap((color, c) => ITEM_NAMES[color].map((name, i) => ({
    color,
    name,
    strength: STRENGTHS[(i * 7 + c * 3) % STRENGTHS.length],
    at: (i * 7 + c * 5 + 3) % LOCATION_COUNT       // 袋から出たときに置かれる地点
}))).map((item, id) => ({ id, ...item }));
export const ITEM_COUNT = ITEMS.length;

// ---- 英雄 ----
export const HEROES = [
    { key: 'mayor', name: '町長', actions: 5, start: loc('広場'), color: '#e2b04a', ability: '能力はないが、アクションが5回ある' },
    { key: 'archaeologist', name: '考古学者', actions: 4, start: loc('劇場'), color: '#c77d4a', ability: '隣の地点のアイテムも拾える' },
    { key: 'courier', name: '運び屋', actions: 4, start: loc('商店'), color: '#5fb3a1', ability: '1アクションで、ほかの英雄のいる地点へ移れる' },
    { key: 'scientist', name: '科学者', actions: 4, start: loc('教会'), color: '#7c9be0', ability: '手番に1回、使うアイテムの合計に+1できる' },
    { key: 'inspector', name: '警部', actions: 4, start: loc('警察署'), color: '#c46f9c', ability: '手番に1回、案内をアクションなしでできる' }
];
export const HERO = Object.fromEntries(HEROES.map(h => [h.key, h]));

// ---- 怪物 ----
// task：怪物ごとの目的（これを果たすまで退治できない）。defeat：退治に要るアイテムの色と強さの合計（怪物のいる地点で）
export const MONSTERS = [
    {
        key: 'vampire', name: '吸血鬼', start: loc('屋敷'), color: '#b0303a',
        coffins: [loc('洞窟'), loc('地下牢'), loc('地下墓所'), loc('墓地')],
        task: '洞窟・地下牢・地下墓所・墓地の4つの棺を、それぞれ赤の合計6以上で壊す',
        need: { color: 'red', total: 6 },
        defeat: { color: 'yellow', total: 6 },
        power: '魅了：手番の英雄を、吸血鬼のいる地点へ引き寄せる'
    },
    {
        key: 'golem', name: '人造人間', start: loc('研究所'), color: '#5f8c3c',
        steps: 3, at: loc('学院'),
        task: '学院で、黄の合計4以上を使って心を教える（3回）',
        need: { color: 'yellow', total: 4 },
        defeat: { color: 'red', total: 6 },
        power: '怪力：命中が1つ増える'
    },
    {
        key: 'werewolf', name: '狼男', start: loc('野営地'), color: '#8a6a45',
        steps: 1, at: loc('研究所'),
        task: '研究所で、青の合計6以上を使って治療薬を作る',
        need: { color: 'blue', total: 6 },
        defeat: { color: 'red', total: 9 },
        power: '遠吠え：恐怖が1つ上がる'
    },
    {
        key: 'mummy', name: 'ミイラ', start: loc('博物館'), color: '#c9b27a',
        at: loc('博物館'),
        task: '博物館で、石板の3つの封印を解く（赤・青・黄それぞれ、1色で合計4以上）',
        need: { color: null, total: 4 },
        defeat: { color: 'red', total: 9 },
        power: '呪い：ミイラのいる地点の英雄は、いちばん弱いアイテムを1つ捨てる'
    },
    {
        key: 'fishman', name: '半魚人', start: loc('波止場'), color: '#3f8f9a',
        steps: 2, at: loc('波止場'),
        task: '波止場で、青の合計5以上を使って隠れ家を探す（2回）',
        need: { color: 'blue', total: 5 },
        defeat: { color: 'red', total: 9 },
        power: '水しぶき：半魚人のいる地点のアイテムが、すべて流される'
    },
    {
        key: 'invisible', name: '透明人間', start: loc('宿屋'), color: '#8f8fb0',
        steps: 5, at: loc('警察署'),
        task: '警察署に、出どころ（置かれる地点）の違うアイテムを5つ、証拠として届ける',
        need: { color: null, total: 0 },
        defeat: { color: 'blue', total: 6 },
        power: '盗み：手番の英雄の、いちばん強いアイテムが消える'
    }
];
export const MONSTER = Object.fromEntries(MONSTERS.map(m => [m.key, m]));
export const MONSTER_KEYS = MONSTERS.map(m => m.key);

// 難易度＝怪物の数
export const LEVELS = {
    2: { name: 'やさしい', monsters: 2 },
    3: { name: 'ふつう', monsters: 3 },
    4: { name: 'むずかしい', monsters: 4 }
};

// ---- 村人（家に送り届けると、送った英雄が特典を1枚もらう） ----
export const VILLAGERS = [
    { name: '花売り', home: loc('教会') },
    { name: '鍛冶屋', home: loc('商店') },
    { name: '船頭', home: loc('波止場') },
    { name: '学生', home: loc('学院') },
    { name: '看護師', home: loc('病院') },
    { name: '宿の娘', home: loc('宿屋') },
    { name: '羊飼い', home: loc('野営地') },
    { name: '墓守', home: loc('墓地') },
    { name: '執事', home: loc('屋敷') },
    { name: '修道女', home: loc('修道院') }
];

// ---- 特典（自分の手番に、アクションを使わずに使える） ----
export const PERKS = [
    { key: 'late', name: '夜更かし', text: 'この手番のアクションが2回増える', count: 4 },
    { key: 'dawn', name: '夜明け', text: 'この手番のあとの怪物の番をとばす', count: 3 },
    { key: 'hurry', name: '急ぎ足', text: '2つ先までの好きな地点へ移る', count: 3 },
    { key: 'supply', name: '差し入れ', text: '袋からアイテムを2つ引いて持つ', count: 3 },
    { key: 'search', name: '探し物', text: '村のどこかのアイテムを1つ持つ', count: 3 }
];
export const PERK_CARDS = PERKS.flatMap(p => Array.from({ length: p.count }, () => p.key)).map((key, id) => ({ id, key }));
export const PERK = Object.fromEntries(PERKS.map(p => [p.key, p]));

// ---- 怪物カード（30枚） ----
// items：袋から出すアイテムの数。event：できごと。strike：動く怪物（F は狂乱の怪物）・歩数・ダイスの数
// できごと：villager（村人が現れる）・frenzy（狂乱が次の怪物へ）・calm（何も起きない）・hunt（怪物が近くの人へ寄る）・call（怪物のいる地点に村人）・special（怪物ごと）
const EVENTS = [
    { type: 'villager', villager: 0, at: loc('塔') },
    { type: 'villager', villager: 1, at: loc('修道院') },
    { type: 'villager', villager: 2, at: loc('劇場') },
    { type: 'villager', villager: 3, at: loc('野営地') },
    { type: 'villager', villager: 4, at: loc('納屋') },
    { type: 'villager', villager: 5, at: loc('墓地') },
    { type: 'villager', villager: 6, at: loc('警察署') },
    { type: 'villager', villager: 7, at: loc('宿屋') },
    { type: 'frenzy' },
    { type: 'frenzy' },
    { type: 'calm' },
    { type: 'calm' },
    ...MONSTER_KEYS.flatMap((monster, i) => [
        { type: 'hunt', monster, steps: 2 },
        { type: 'call', monster, villager: [8, 9, 0, 1, 2, 3][i] },
        { type: 'special', monster }
    ])
];
const STRIKES = [
    ['VF', 2, 2], ['GW', 1, 2], ['MF', 2, 3], ['SI', 2, 2], ['F', 3, 3], ['VG', 1, 3],
    ['WM', 2, 2], ['IF', 1, 2], ['SV', 2, 3], ['GF', 2, 2], ['WI', 1, 3], ['MS', 2, 2],
    ['F', 2, 3], ['VW', 2, 2], ['GM', 2, 2], ['IS', 1, 3], ['FV', 1, 2], ['WF', 2, 2],
    ['MI', 2, 3], ['SG', 2, 2], ['F', 3, 2], ['VI', 2, 2], ['GS', 1, 2], ['WV', 2, 3],
    ['MF', 1, 2], ['IG', 2, 2], ['SW', 2, 2], ['FM', 2, 2], ['VS', 1, 3], ['F', 2, 2]
];
const ICON = { V: 'vampire', G: 'golem', W: 'werewolf', M: 'mummy', S: 'fishman', I: 'invisible', F: 'frenzy' };
const ITEM_COUNTS = [2, 2, 1, 2, 3, 2, 2, 2, 1, 2, 2, 3, 2, 2, 2, 1, 2, 2, 3, 2, 2, 2, 1, 2, 2, 2, 3, 2, 2, 2];
export const MONSTER_CARDS = EVENTS.map((event, id) => ({
    id,
    items: ITEM_COUNTS[id],
    event,
    strike: { icons: [...STRIKES[id][0]].map(c => ICON[c]), steps: STRIKES[id][1], dice: STRIKES[id][2] }
}));

// 怪物ごとの特別なできごと
export const SPECIAL_EVENTS = {
    vampire: { name: '棺への帰還', text: '吸血鬼が、まだ壊れていない棺のうち、いちばん近い地点へ移る' },
    golem: { name: '雷鳴の夜', text: '人造人間の心が1つ戻る（教えた回数が1減る）' },
    werewolf: { name: '満月', text: '狼男が狂乱する' },
    mummy: { name: '砂嵐', text: 'ミイラのいる地点と隣の地点のアイテムが、すべて飛ばされる' },
    fishman: { name: '水路', text: '半魚人が、いちばん近い村人のいる地点へ移る' },
    invisible: { name: '消えた証拠', text: '届けた証拠が1つなくなる' }
};

// ダイスの面：命中2・力1・空き3
export const DIE_FACES = ['hit', 'hit', 'power', 'blank', 'blank', 'blank'];

export const TERROR_MAX = 7;          // 恐怖がここに達したら負け
export const START_ITEMS = 12;
