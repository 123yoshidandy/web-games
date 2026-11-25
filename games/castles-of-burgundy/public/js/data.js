/**
 * ブルゴーニュの城（基本ゲーム）のデータ
 * 盤の配置と枚数は、公式ルールブック（英語版・ドイツ語版）と有志の実装のデータで照らし合わせた（README を参照）
 * 説明の文は自分で書いたもの（公式の文は写していない）
 */

// タイルの色（種類）
export const KINDS = {
    castle: { name: '城', hex: '#2f6b3a' },
    mine: { name: '鉱山', hex: '#8a8f96' },
    knowledge: { name: '知識', hex: '#e2c04a' },
    building: { name: '建物', hex: '#e8d6ad' },
    animal: { name: '牧草地', hex: '#8fc45a' },
    ship: { name: '船', hex: '#3f86c8' }
};
export const KIND_ORDER = ['castle', 'mine', 'knowledge', 'building', 'animal', 'ship'];

// ---- 公国の盤（1番）----
// 7行（4・5・6・7・6・5・4マス）。文字は色、数は目。中央（4行目の4つ目）が最初の城
const LAYOUT = ['ACCK', 'AACKB', 'AABKBB', 'SSSCSSS', 'BBMBBA', 'BMKBB', 'MKKB'];
const DICE = [[6, 5, 4, 3], [2, 1, 6, 5, 4], [5, 4, 3, 1, 2, 3], [6, 1, 2, 6, 5, 4, 1], [2, 5, 4, 3, 1, 2], [6, 1, 2, 5, 6], [3, 4, 1, 3]];
const LETTER = { C: 'castle', M: 'mine', K: 'knowledge', B: 'building', A: 'animal', S: 'ship' };

// マス：{ id, row, col, q, r（六角形の座標）, kind, die, region, neighbors }
export const CELLS = LAYOUT.flatMap((line, row) => [...line].map((ch, col) => ({
    row, col, q: Math.max(-3, -row) + col, r: row - 3, kind: LETTER[ch], die: DICE[row][col]
}))).map((cell, id) => ({ id, ...cell }));
export const START_CELL = CELLS.findIndex(c => c.row === 3 && c.col === 3);

const isNeighbor = (a, b) => {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1;
};
CELLS.forEach(c => { c.neighbors = CELLS.filter(o => o !== c && isNeighbor(c, o)).map(o => o.id); });

// 地域（同じ色でつながったマス）
export const REGIONS = [];
CELLS.forEach(start => {
    if (start.region !== undefined) return;
    const id = REGIONS.length;
    const cells = [];
    const stack = [start];
    start.region = id;
    while (stack.length) {
        const cell = stack.pop();
        cells.push(cell.id);
        cell.neighbors.map(n => CELLS[n]).forEach(n => {
            if (n.region === undefined && n.kind === cell.kind) {
                n.region = id;
                stack.push(n);
            }
        });
    }
    REGIONS.push({ id, kind: start.kind, cells: cells.sort((a, b) => a - b) });
});

// ---- 中央の盤 ----
// 区域（1〜6）のマスの色。2人は最初の2つ、3人は3つ、4人は4つ
// 3人のとき、6番の区域の3つ目は、フェーズ B・D では城ではなく鉱山
export const DEPOT_SLOTS = [
    ['ship', 'building', 'knowledge', 'animal'],
    ['castle', 'knowledge', 'building', 'building'],
    ['animal', 'building', 'ship', 'knowledge'],
    ['ship', 'building', 'animal', 'mine'],
    ['mine', 'knowledge', 'building', 'building'],
    ['animal', 'building', 'castle', 'ship']
];
export function depotSlots(players, phase) {
    return DEPOT_SLOTS.map((slots, i) => slots.slice(0, players).map((kind, k) => (
        players === 3 && i === 5 && k === 2 && (phase === 1 || phase === 3) ? 'mine' : kind
    )));
}
export const BLACK_SLOTS = { 2: 4, 3: 6, 4: 8 };

// ---- タイル ----
export const BUILDINGS = {
    warehouse: { name: '倉庫', text: '置いたらすぐ、商品を1種類売る（ダイスは要らない）' },
    carpenter: { name: '大工作業場', text: '置いたらすぐ、どれかの区域から建物を1枚取る' },
    church: { name: '教会', text: '置いたらすぐ、どれかの区域から鉱山・知識・城を1枚取る' },
    market: { name: '市場', text: '置いたらすぐ、どれかの区域から船か家畜を1枚取る' },
    boardingHouse: { name: '下宿', text: '置いたらすぐ、労働者を4つ得る' },
    bank: { name: '銀行', text: '置いたらすぐ、銀貨を2枚得る' },
    cityHall: { name: '市庁舎', text: '置いたらすぐ、保管場所のタイルをもう1枚、目に関係なく置く' },
    watchtower: { name: '見張り塔', text: '置いたらすぐ、4点' }
};
export const BUILDING_ORDER = Object.keys(BUILDINGS);
export const ANIMALS = { cow: '牛', pig: '豚', sheep: '羊', chicken: '鶏' };
export const ANIMAL_ORDER = Object.keys(ANIMALS);

// 知識タイル26種
export const KNOWLEDGE = {
    1: { short: '建物の制限なし', text: '同じ都市に、同じ種類の建物をいくつでも置ける' },
    2: { short: '鉱山で労働者', text: 'フェーズの終わりに、鉱山1つにつき銀貨に加えて労働者を1つ得る' },
    3: { short: '売ると銀貨2', text: '商品を売るとき、銀貨を1枚ではなく2枚得る' },
    4: { short: '売ると労働者', text: '商品を売るとき、銀貨に加えて労働者を1つ得る' },
    5: { short: '船で2区域', text: '船を置いたとき、となり合う2つの区域から商品を取れる' },
    6: { short: 'どこでも買える', text: '銀貨2枚の買い物を、黒の区域だけでなく1〜6の区域からもできる' },
    7: { short: '家畜+1', text: '家畜で点を得るとき、数えるタイル1枚につき1点多い' },
    8: { short: '労働者で±2', text: '労働者1つで、ダイスの目を2まで変えられる' },
    9: { short: '建物の目±1', text: '建物を置くとき、ダイスの目を1だけ自由に変えられる' },
    10: { short: '船・家畜の目±1', text: '船か家畜を置くとき、ダイスの目を1だけ自由に変えられる' },
    11: { short: '城・鉱山・知識の目±1', text: '城・鉱山・知識を置くとき、ダイスの目を1だけ自由に変えられる' },
    12: { short: '取る目±1', text: '区域からタイルを取るとき、ダイスの目を1だけ自由に変えられる' },
    13: { short: '労働者で銀貨も', text: '「労働者を得る」行動で、銀貨も1枚得る' },
    14: { short: '労働者4つ', text: '「労働者を得る」行動で、労働者を4つ得る' },
    15: { short: '売った種類×3点', text: '終わりに、売ったことのある商品の種類1つにつき3点' },
    16: { short: '倉庫×4点', building: 'warehouse' },
    17: { short: '見張り塔×4点', building: 'watchtower' },
    18: { short: '大工作業場×4点', building: 'carpenter' },
    19: { short: '教会×4点', building: 'church' },
    20: { short: '市場×4点', building: 'market' },
    21: { short: '下宿×4点', building: 'boardingHouse' },
    22: { short: '銀行×4点', building: 'bank' },
    23: { short: '市庁舎×4点', building: 'cityHall' },
    24: { short: '家畜の種類×4点', text: '終わりに、置いた家畜の種類1つにつき4点' },
    25: { short: '売った商品×1点', text: '終わりに、売った商品1枚につき1点' },
    26: { short: 'ボーナス×2点', text: '終わりに、得たボーナスタイル1枚につき2点' }
};
Object.values(KNOWLEDGE).forEach(k => { if (k.building) k.text = `終わりに、置いた${BUILDINGS[k.building].name}1つにつき4点`; });
const BLACK_KNOWLEDGE = [7, 12, 14, 15, 24, 25];

// 全部のタイル。{ id, kind, black, building?, animal?, count?, knowledge? }
export const TILES = (() => {
    const list = [];
    const add = (kind, black, extra = {}) => list.push({ id: list.length, kind, black, ...extra });
    BUILDING_ORDER.forEach(b => {
        for (let i = 0; i < 5; i++) add('building', false, { building: b });
        for (let i = 0; i < 2; i++) add('building', true, { building: b });
    });
    ANIMAL_ORDER.forEach(a => {
        [2, 2, 3, 3, 4].forEach(count => add('animal', false, { animal: a, count }));
        [3, 4].forEach(count => add('animal', true, { animal: a, count }));
    });
    for (let k = 1; k <= 26; k++) add('knowledge', BLACK_KNOWLEDGE.includes(k), { knowledge: k });
    for (let i = 0; i < 14; i++) add('castle', false);
    for (let i = 0; i < 2; i++) add('castle', true);
    for (let i = 0; i < 10; i++) add('mine', false);
    for (let i = 0; i < 2; i++) add('mine', true);
    for (let i = 0; i < 20; i++) add('ship', false);
    for (let i = 0; i < 6; i++) add('ship', true);
    return list;
})();

// 商品：6色×7枚。色は目（1〜6）と対応する
export const GOODS = {
    1: { name: '黄の商品', hex: '#e4c534' },
    2: { name: '赤の商品', hex: '#c8433a' },
    3: { name: '紫の商品', hex: '#7b4fa8' },
    4: { name: '桃の商品', hex: '#e07aa6' },
    5: { name: '茶の商品', hex: '#8a5a32' },
    6: { name: '水色の商品', hex: '#3fb3b8' }
};
export const GOODS_COPIES = 7;

// ---- 点 ----
export const REGION_POINTS = [0, 1, 3, 6, 10, 15, 21, 28, 36];   // 地域の大きさ（1〜8）
export const PHASE_BONUS = [10, 8, 6, 4, 2];                     // フェーズ A〜E
export const SELL_POINTS = { 2: 2, 3: 3, 4: 4 };                 // 売った商品1枚
export const COLOR_BONUS = { 2: [5, 2], 3: [6, 3], 4: [7, 4] };  // 色を埋めた1番目・2番目
export const PHASES = ['A', 'B', 'C', 'D', 'E'];
export const ROUNDS = 5;
export const STORAGE = 3;
export const GOODS_TYPES_MAX = 3;
