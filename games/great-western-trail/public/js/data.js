/**
 * グレート・ウエスタン・トレイル（初版）の部品のデータ
 * 数値は初版のルールブック（2016）に合わせた。道の形・建物・駅・都市・目標カードなど
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const PLAYER_COLORS = ['#d9534f', '#3f7fd0', '#e0a526', '#4aa36b'];
export const START_MONEY = [6, 7, 8, 9];

// ---- 牛 ----
export const BREEDS = {
    jersey: { name: 'ジャージー', short: 'ジャ', value: 1, color: '#9aa1a8' },
    dutch: { name: 'ダッチベルト', short: 'ダ', value: 2, color: '#e0e0d8' },
    angus: { name: 'ブラックアンガス', short: 'ア', value: 2, color: '#2f2f33' },
    guernsey: { name: 'ガーンジー', short: 'ガ', value: 2, color: '#c98a3a' },
    holstein: { name: 'ホルスタイン', short: 'ホ', value: 3, color: '#e8c840' },
    swiss: { name: 'ブラウンスイス', short: 'ブ', value: 3, color: '#cf4a3c' },
    ayrshire: { name: 'エアシャー', short: 'エ', value: 3, color: '#3b78c4' },
    highland: { name: 'ウエストハイランド', short: 'ハ', value: 4, color: '#8a5a32' },
    longhorn: { name: 'テキサスロングホーン', short: 'ロ', value: 5, color: '#7d4aa8' }
};
export const BREED_ORDER = ['jersey', 'dutch', 'angus', 'guernsey', 'holstein', 'swiss', 'ayrshire', 'highland', 'longhorn'];
const START_DECK = [['jersey', 5], ['dutch', 3], ['angus', 3], ['guernsey', 3]];
const MARKET_DECK = [
    ['holstein', 1, 7], ['swiss', 2, 7], ['ayrshire', 3, 7],
    ['highland', 3, 3], ['highland', 4, 3], ['highland', 5, 3],
    ['longhorn', 5, 2], ['longhorn', 6, 2], ['longhorn', 7, 2]
];
export const MARKET_SIZE = { 2: 7, 3: 10, 4: 13 };

// 牛の買い方（カウボーイの人数・費用・買える枚数と繁殖値）
export const BUY_OPTIONS = [
    { id: 'v3', value: 3, count: 1, cowboys: 1, cost: 6 },
    { id: 'v3c', value: 3, count: 1, cowboys: 2, cost: 3 },
    { id: 'v33', value: 3, count: 2, cowboys: 3, cost: 5 },
    { id: 'v4', value: 4, count: 1, cowboys: 1, cost: 12 },
    { id: 'v4c', value: 4, count: 1, cowboys: 3, cost: 6 },
    { id: 'v44', value: 4, count: 2, cowboys: 5, cost: 8 },
    { id: 'v5', value: 5, count: 1, cowboys: 2, cost: 12 },
    { id: 'v5c', value: 5, count: 1, cowboys: 4, cost: 6 }
];

// ---- 目標カード ----
// 条件：B 建物・G 緑のティーピー・BL 青のティーピー・H 災害・S 駅・3/4/5 その繁殖値の牛・SF サンフランシスコへの配達
export const OBJECTIVES = {
    st1: { tasks: ['3', '4', 'B'], vp: 3, minus: 0, action: null },
    st2: { tasks: ['S', 'S', 'G'], vp: 3, minus: 0, action: null },
    st3: { tasks: ['B', 'B', 'H'], vp: 3, minus: 0, action: null },
    st4: { tasks: ['BL', 'H', 'H'], vp: 3, minus: 0, action: null },
    o1: { tasks: ['B', 'BL', 'BL'], vp: 3, minus: 2, action: 'gain2' },
    o2: { tasks: ['B', 'G', 'BL'], vp: 3, minus: 2, action: 'gain2' },
    o3: { tasks: ['4', 'H', 'H'], vp: 3, minus: 2, action: 'gain2' },
    o4: { tasks: ['S', 'S', 'H'], vp: 3, minus: 2, action: 'gain2' },
    o5: { tasks: ['3', '3', '3', 'B'], vp: 4, minus: 2, action: 'gain2' },
    o6: { tasks: ['SF'], vp: 5, minus: 3, action: 'aux' },
    o7: { tasks: ['SF'], vp: 5, minus: 3, action: 'aux' },
    o8: { tasks: ['SF'], vp: 5, minus: 3, action: 'aux' },
    o9: { tasks: ['SF'], vp: 5, minus: 3, action: 'aux' },
    o10: { tasks: ['B', 'B', 'H'], vp: 3, minus: 2, action: 'draw3' },
    o11: { tasks: ['S', 'G', 'BL'], vp: 3, minus: 2, action: 'draw3' },
    o12: { tasks: ['5', 'H'], vp: 3, minus: 2, action: 'draw3' },
    o13: { tasks: ['S', 'G', 'G'], vp: 3, minus: 2, action: 'draw3' },
    o14: { tasks: ['3', '3', '3', 'S'], vp: 4, minus: 2, action: 'draw3' },
    o15: { tasks: ['4', '4', 'S', 'G'], vp: 5, minus: 3, action: 'engine2' },
    o16: { tasks: ['3', '4', '5'], vp: 5, minus: 3, action: 'engine2' },
    o17: { tasks: ['B', 'B', 'G', 'G'], vp: 5, minus: 3, action: 'engine2' },
    o18: { tasks: ['B', 'BL', 'H', 'H'], vp: 5, minus: 3, action: 'engine3' },
    o19: { tasks: ['S', 'S', 'H', 'H'], vp: 5, minus: 3, action: 'engine3' },
    o20: { tasks: ['B', 'B', 'H', 'H'], vp: 5, minus: 2, action: 'move3' },
    o21: { tasks: ['S', 'S', 'BL', 'BL'], vp: 5, minus: 2, action: 'move3' },
    o22: { tasks: ['3', '4', '5'], vp: 5, minus: 2, action: 'move3' },
    o23: { tasks: ['3', '4', 'H', 'H'], vp: 5, minus: 2, action: 'move3' },
    o24: { tasks: ['S', 'S', 'B', 'B'], vp: 5, minus: 2, action: 'move3' }
};
export const START_OBJECTIVES = ['st1', 'st2', 'st3', 'st4'];
export const TASK_NAMES = { B: '建物', G: '緑のティーピー', BL: '青のティーピー', H: '災害', S: '駅', 3: '繁殖値3の牛', 4: '繁殖値4の牛', 5: '繁殖値5の牛', SF: 'サンフランシスコ' };
export const TASK_SHORT = { B: '建', G: '緑', BL: '青', H: '災', S: '駅', 3: '3', 4: '4', 5: '5', SF: 'SF' };
export const OBJECTIVE_ACTION_NAMES = {
    gain2: '$2 を得る', aux: '補助アクション（倍も可）', draw3: '3枚まで引いて同じ数を捨てる',
    engine2: '機関車を2マスまで進める', engine3: '機関車を3マスまで進める', move3: '通行料なしで3歩まで進む（行った先は使えない）'
};

// ---- カード（id から中身を引く。デッキは id の並びで持つ） ----
export const CARDS = {};
export function startDeckIds(seat) {
    const ids = [];
    START_DECK.forEach(([breed, count]) => {
        for (let i = 0; i < count; i++) {
            const id = `p${seat}${breed}${i}`;
            CARDS[id] = { kind: 'cattle', breed, value: BREEDS[breed].value, vp: 0 };
            ids.push(id);
        }
    });
    return ids;
}
export const MARKET_IDS = [];
MARKET_DECK.forEach(([breed, vp, count]) => {
    for (let i = 0; i < count; i++) {
        const id = `m${breed}${vp}-${i}`;
        CARDS[id] = { kind: 'cattle', breed, value: BREEDS[breed].value, vp };
        MARKET_IDS.push(id);
    }
});
Object.keys(OBJECTIVES).forEach(id => { CARDS[id] = { kind: 'objective', obj: id, ...OBJECTIVES[id] }; });
for (let seat = 0; seat < MAX_PLAYERS; seat++) startDeckIds(seat);
export const OBJECTIVE_IDS = Object.keys(OBJECTIVES).filter(id => !id.startsWith('st'));
export const card = (id) => CARDS[id];

// ---- 建物 ----
// 効果の書き方は rules.js の runEffect を参照
export const NEUTRAL = {
    A: [{ e: 'discard', need: 'guernsey', money: 2 }, { e: 'hire', mod: 0 }, { e: 'hire', mod: 2 }],
    B: [{ e: 'discard', need: 'dutch', money: 2 }, { e: 'build', per: 2 }],
    C: [{ e: 'certOrObjective' }, { e: 'engine', max: 'engineers' }],
    D: [{ e: 'tradeOrEngine' }, { e: 'aux' }],
    E: [{ e: 'discard', need: 'angus', money: 2 }, { e: 'buy' }],
    F: [{ e: 'discard', need: 'pair', money: 4 }, { e: 'hazard', cost: 7 }],
    G: [{ e: 'engine', max: 'engineers' }, { e: 'aux' }]
};
// 個人の建物（Aの面）：職人の数・得点・手（g 緑・b 黒）・アクション
export const BUILDINGS = {
    1: { craft: 1, vp: 1, hands: 'g', actions: [{ e: 'woods' }] },
    2: { craft: 1, vp: 1, hands: '', actions: [{ e: 'discard', need: 'guernsey', money: 4 }, { e: 'buy' }] },
    3: { craft: 1, vp: 1, hands: '', actions: [{ e: 'discard', need: 'pair', money: 3 }, { e: 'moveAgain', max: 1 }] },
    4: { craft: 2, vp: 3, hands: 'b', actions: [{ e: 'hazard', cost: 5 }, { e: 'moveAgain', max: 2 }] },
    5: { craft: 3, vp: 4, hands: '', actions: [{ e: 'hire', mod: -1 }, { e: 'engine', max: 'engineers' }] },
    6: { craft: 4, vp: 5, hands: '', actions: [{ e: 'discard', need: 'holstein', money: 10 }, { e: 'aux' }] },
    7: { craft: 5, vp: 6, hands: 'gb', actions: [{ e: 'teepeePairs' }] },
    8: { craft: 5, vp: 6, hands: 'g', actions: [{ e: 'tradeOrAux' }, { e: 'engine', max: 2 }] },
    9: { craft: 7, vp: 9, hands: '', actions: [{ e: 'engine', max: 3 }, { e: 'specialDelivery' }] },
    10: { craft: 9, vp: 13, hands: 'b', actions: [{ e: 'certMax' }, { e: 'moveAgain', max: 5 }] }
};
export const BUILDING_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// 道のリスクのマスに建てると、持ち主はそのアクションも使える
export const RISK_ACTIONS = {
    r1: { e: 'discard', need: 'any', cert: 1 },
    r2: { e: 'discard', need: 'jersey', cert: 1, money: 2 }
};

// ---- 道 ----
// kind: start・neutral（中立の建物の場所）・plot（個人の建物を建てる場所）・hazard・teepee・kc
// next：進める先。woods：森に接する。risk：リスクのアクション。x, y：盤の絵の座標
export const TRAIL = {
    start: { kind: 'start', next: ['A'], x: 300, y: 1180 },
    A: { kind: 'neutral', next: ['A1', 'flood1'], x: 300, y: 1110 },
    A1: { kind: 'plot', next: ['A2'], x: 200, y: 1065 },
    A2: { kind: 'plot', next: ['A3'], x: 150, y: 1005 },
    A3: { kind: 'plot', next: ['B'], x: 170, y: 945 },
    flood1: { kind: 'hazard', type: 'flood', index: 0, next: ['flood2'], x: 395, y: 1080 },
    flood2: { kind: 'hazard', type: 'flood', index: 1, next: ['flood3'], x: 450, y: 1040 },
    flood3: { kind: 'hazard', type: 'flood', index: 2, next: ['flood4'], x: 480, y: 990 },
    flood4: { kind: 'hazard', type: 'flood', index: 3, next: ['floodR1'], x: 470, y: 940 },
    floodR1: { kind: 'plot', risk: 'r2', next: ['floodR2'], x: 420, y: 905 },
    floodR2: { kind: 'plot', risk: 'r2', woods: true, next: ['B'], x: 360, y: 890 },
    B: { kind: 'neutral', next: ['drought1', 'B1'], x: 270, y: 870 },
    B1: { kind: 'plot', woods: true, next: ['B2'], x: 160, y: 830 },
    B2: { kind: 'plot', next: ['B3'], x: 110, y: 770 },
    B3: { kind: 'plot', next: ['C'], x: 140, y: 705 },
    drought1: { kind: 'hazard', type: 'drought', index: 0, next: ['drought2'], x: 350, y: 835 },
    drought2: { kind: 'hazard', type: 'drought', index: 1, next: ['drought3'], x: 400, y: 795 },
    drought3: { kind: 'hazard', type: 'drought', index: 2, next: ['drought4'], x: 410, y: 745 },
    drought4: { kind: 'hazard', type: 'drought', index: 3, next: ['droughtR1'], x: 370, y: 705 },
    droughtR1: { kind: 'plot', risk: 'r1', next: ['C'], x: 310, y: 680 },
    C: { kind: 'neutral', next: ['C11', 'C2'], x: 230, y: 650 },
    C11: { kind: 'plot', woods: true, next: ['C12'], x: 120, y: 600 },
    C12: { kind: 'plot', woods: true, next: ['E'], x: 105, y: 520 },
    C2: { kind: 'plot', next: ['D', 'T1'], x: 255, y: 585 },
    D: { kind: 'neutral', next: ['E'], x: 215, y: 525 },
    T1: { kind: 'teepee', slot: 3, next: ['T2'], x: 330, y: 600 },
    T2: { kind: 'teepee', slot: 4, next: ['T4'], x: 395, y: 585 },
    T4: { kind: 'teepee', slot: 5, next: ['T6'], x: 450, y: 550 },
    T6: { kind: 'teepee', slot: 6, next: ['T8'], x: 465, y: 495 },
    T8: { kind: 'teepee', slot: 7, next: ['T10'], x: 440, y: 445 },
    T10: { kind: 'teepee', slot: 8, next: ['tradeR1'], x: 390, y: 420 },
    tradeR1: { kind: 'plot', risk: 'r1', next: ['tradeR2'], x: 330, y: 430 },
    tradeR2: { kind: 'plot', risk: 'r2', next: ['E'], x: 275, y: 455 },
    E: { kind: 'neutral', next: ['E1', 'rock1'], x: 180, y: 430 },
    E1: { kind: 'plot', woods: true, next: ['E2'], x: 90, y: 380 },
    E2: { kind: 'plot', woods: true, next: ['F'], x: 85, y: 305 },
    rock1: { kind: 'hazard', type: 'rockfall', index: 0, next: ['rock2'], x: 245, y: 385 },
    rock2: { kind: 'hazard', type: 'rockfall', index: 1, next: ['rock3'], x: 300, y: 355 },
    rock3: { kind: 'hazard', type: 'rockfall', index: 2, next: ['rock4'], x: 330, y: 305 },
    rock4: { kind: 'hazard', type: 'rockfall', index: 3, next: ['rockR1'], x: 315, y: 255 },
    rockR1: { kind: 'plot', risk: 'r1', next: ['rockR2'], x: 265, y: 225 },
    rockR2: { kind: 'plot', risk: 'r2', woods: true, next: ['F'], x: 205, y: 225 },
    F: { kind: 'neutral', next: ['F1', 'F2'], x: 130, y: 240 },
    F1: { kind: 'plot', next: ['G'], x: 205, y: 160 },
    F2: { kind: 'plot', woods: true, next: ['G'], x: 85, y: 170 },
    G: { kind: 'neutral', next: ['G1', 'G2'], x: 150, y: 105 },
    G1: { kind: 'plot', next: ['KC'], x: 235, y: 75 },
    G2: { kind: 'plot', next: ['KC'], x: 90, y: 50 },
    KC: { kind: 'kc', next: [], x: 300, y: 40 }
};
export const NEUTRAL_SPOTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
export const PLOT_SPOTS = Object.keys(TRAIL).filter(id => TRAIL[id].kind === 'plot');
export const HAZARD_TYPES = { flood: '洪水', drought: '干ばつ', rockfall: '落石' };
export const HAZARD_SPOTS = { flood: ['flood1', 'flood2', 'flood3', 'flood4'], drought: ['drought1', 'drought2', 'drought3', 'drought4'], rockfall: ['rock1', 'rock2', 'rock3', 'rock4'] };
// 交易の場所（左から金額の小さい順）。-3〜-1 は道の外、1〜10 は道の上
export const TRADE_VALUES = [-3, -2, -1, 1, 2, 4, 6, 8, 10];
export const TRADE_SPOTS = ['Tm3', 'Tm2', 'Tm1', 'T1', 'T2', 'T4', 'T6', 'T8', 'T10'];
export const TRADE_OFF_TRAIL = { Tm3: { x: 520, y: 690 }, Tm2: { x: 545, y: 640 }, Tm1: { x: 555, y: 590 } };
// 手の通行料（人数ごと）
export const TOLL = { 2: { g: 2, b: 2 }, 3: { g: 2, b: 1 }, 4: { g: 1, b: 2 } };

// ---- カンザスシティの山 ----
export const WORKERS = { cowboy: 'カウボーイ', craftsman: '職人', engineer: '技師' };
export const WORKER_TYPES = ['cowboy', 'craftsman', 'engineer'];
export function supplyPiles() {
    const hazards = [];
    Object.keys(HAZARD_TYPES).forEach(type => {
        [['b', 3], ['b', 2], ['g', 4], ['g', 4], ['g', 3], ['g', 2]].forEach(([hand, vp]) => hazards.push({ t: 'hazard', type, hand, vp }));
    });
    const teepees = (color, n) => Array.from({ length: n }, () => ({ t: 'teepee', color }));
    const workers = (n) => WORKER_TYPES.flatMap(w => Array.from({ length: n }, () => ({ t: 'worker', w })));
    return [
        [...teepees('green', 9), ...teepees('blue', 8), ...hazards],
        workers(11),
        [...workers(7), ...teepees('green', 2), ...teepees('blue', 3)]
    ];
}

// ---- 求人市場 ----
export const JOB_COSTS = [6, 6, 7, 5, 7, 9, 6, 8, 10, 6, 5, 4];
export const JOB_REFILL_ROWS = [6, 9]; // この段に移るとき、牛の市場を補充する
// 労働者の列（1〜6人目）で、置いたときに使える即時アクション
export const WORKER_BONUS = {
    cowboy: { 4: 'freeHazard', 6: 'trade' },
    craftsman: { 4: 'cheapBuild', 6: 'cheapBuild' },
    engineer: { 2: 'jerseyCert1', 3: 'jerseyMoney2', 4: 'hireMinus2', 5: 'jerseyCert2', 6: 'jerseyMoney4' }
};
export const MAX_WORKERS = 6;

// ---- 鉄道 ----
// マスは 0〜39。待避線（駅）は n.5 で表す。39 は最後の駅のマス
export const STATIONS = [
    { space: 4.5, cost: 2, vp: 1, dark: false },
    { space: 7.5, cost: 2, vp: 1, dark: false },
    { space: 10.5, cost: 4, vp: 2, dark: false },
    { space: 13.5, cost: 4, vp: 2, dark: false },
    { space: 16.5, cost: 6, vp: 3, dark: true },
    { space: 21.5, cost: 8, vp: 5, dark: true },
    { space: 25.5, cost: 7, vp: 6, dark: true },
    { space: 29.5, cost: 6, vp: 7, dark: true },
    { space: 33.5, cost: 5, vp: 8, dark: true },
    { space: 39, cost: 3, vp: 9, dark: true }
];
export const LAST_SPACE = 39;
export const SIGNALS = [3, 4, 5, 7, 9, 10, 11, 13, 15, 16, 17];
// 駅長のタイル（上：即時か恒久の証明書・下：終了時の得点）
export const MASTERS = {
    m1: { now: 'money2', score: 'workers', text: '$2 ／ 労働者1人につき1点' },
    m2: { now: 'hazardOrTrade', score: 'objectives', text: '災害を無料で除くか交易 ／ 目標カード2枚につき3点' },
    m3: { now: 'cert', score: 'hazards', text: '恒久の証明書 ／ 災害2枚につき3点' },
    m4: { now: 'cert', score: 'pairs', text: '恒久の証明書 ／ 緑と青のティーピーの組ごとに3点' },
    m5: { now: 'cert', score: 'certs', text: '恒久の証明書 ／ 証明書2つにつき3点' }
};

// ---- 都市 ----
// dark：暗い角（どの円盤でも置ける）。白い角の都市には、白い角の円盤だけ
export const CITIES = [
    { id: 'kc', name: 'カンザスシティ', short: 'KC', value: 0, dark: false },
    { id: 'topeka', name: 'トピカ', short: 'トピカ', value: 1, dark: false },
    { id: 'wichita', name: 'ウィチタ', short: 'ウィチタ', value: 4, dark: false },
    { id: 'colorado', name: 'コロラドスプリングス', short: 'コロラド', value: 6, dark: false },
    { id: 'santafe', name: 'サンタフェ', short: 'サンタフェ', value: 8, dark: false },
    { id: 'albuquerque', name: 'アルバカーキ', short: 'アルバカーキ', value: 10, dark: true },
    { id: 'elpaso', name: 'エルパソ', short: 'エルパソ', value: 12, dark: true },
    { id: 'sandiego', name: 'サンディエゴ', short: 'サンディエゴ', value: 14, dark: false },
    { id: 'sacramento', name: 'サクラメント', short: 'サクラメント', value: 16, dark: true },
    { id: 'sf', name: 'サンフランシスコ', short: 'SF', value: 18, dark: true }
];
export const CITY_BY_ID = Object.fromEntries(CITIES.map(c => [c.id, c]));
// 隣り合う都市の両方に配達すると、得点か目標カード（緑の矢印）
export const CITY_LINKS = [
    { a: 'topeka', b: 'wichita', vp: -3, objective: true },
    { a: 'wichita', b: 'colorado', vp: -1 },
    { a: 'colorado', b: 'santafe', objective: true },
    { a: 'santafe', b: 'albuquerque', objective: true },
    { a: 'albuquerque', b: 'elpaso', vp: 6 },
    { a: 'elpaso', b: 'sandiego', vp: 8 },
    { a: 'sandiego', b: 'sacramento', vp: 4 }
];

// ---- プレイヤーボードの円盤 ----
// count：最初に置く数。dark：暗い角（暗い角の場所にだけ置ける）
export const DISCS = {
    auxMoney: { count: 1, dark: false, name: '補助：お金' },
    auxDraw: { count: 1, dark: false, name: '補助：引いて捨てる' },
    auxCert: { count: 2, dark: false, name: '補助：機関車を戻して証明書' },
    auxEngine: { count: 2, dark: false, name: '補助：払って機関車を進める' },
    auxRemove: { count: 2, dark: false, name: '補助：機関車を戻してカードを除く' },
    cert4: { count: 1, dark: false, name: '証明書の上限4' },
    cert6: { count: 1, dark: true, name: '証明書の上限6' },
    step1: { count: 1, dark: true, name: '歩数+（すぐに$3）' },
    step2: { count: 1, dark: true, name: '歩数+（終了時に3点）' },
    hand: { count: 2, dark: true, name: '手札の上限+1（$5）' }
};
export const DISC_ORDER = ['auxMoney', 'auxDraw', 'auxCert', 'auxEngine', 'auxRemove', 'cert4', 'cert6', 'step1', 'step2', 'hand'];
export const CERT_STEPS = [0, 1, 2, 3, 4, 6];
export const AUX_KINDS = {
    money: { disc: 'auxMoney', name: 'お金を得る' },
    draw: { disc: 'auxDraw', name: '引いて捨てる' },
    cert: { disc: 'auxCert', name: '機関車を戻して証明書' },
    engine: { disc: 'auxEngine', name: '払って機関車を進める' },
    remove: { disc: 'auxRemove', name: '機関車を戻してカードを除く' }
};
