/**
 * 地図とカードのデータ
 * 都市は48（4色×12）。座標は自作の地図（1000×500）の上の位置で、実際の緯度・経度ではない（ヨーロッパなどの混んだ所を広げている）
 * つながりは、原作の盤の線を複数の資料で照らし合わせたもの（README の「資料で分からない点の決め方」）
 */

export const COLORS = ['blue', 'yellow', 'black', 'red'];
export const COLOR_NAMES = ['青', '黄', '黒', '赤'];

// [英名, 日本語名, 色, x, y, 人口（万人。最初の手番を決めるのに使う）]
const CITY_ROWS = [
    // 青
    ['San Francisco', 'サンフランシスコ', 0, 62, 168, 586],
    ['Chicago', 'シカゴ', 0, 168, 140, 912],
    ['Montreal', 'モントリオール', 0, 252, 128, 343],
    ['New York', 'ニューヨーク', 0, 322, 150, 2046],
    ['Washington', 'ワシントン', 0, 290, 206, 468],
    ['Atlanta', 'アトランタ', 0, 196, 200, 472],
    ['London', 'ロンドン', 0, 432, 104, 859],
    ['Madrid', 'マドリード', 0, 418, 178, 543],
    ['Paris', 'パリ', 0, 490, 150, 1076],
    ['Essen', 'エッセン', 0, 512, 86, 58],
    ['Milan', 'ミラノ', 0, 568, 120, 523],
    ['St. Petersburg', 'ペテルブルク', 0, 622, 64, 488],
    // 黄
    ['Los Angeles', 'ロサンゼルス', 1, 80, 250, 1490],
    ['Mexico City', 'メキシコシティ', 1, 168, 276, 1946],
    ['Miami', 'マイアミ', 1, 262, 262, 558],
    ['Bogota', 'ボゴタ', 1, 262, 334, 870],
    ['Lima', 'リマ', 1, 234, 402, 912],
    ['Santiago', 'サンティアゴ', 1, 236, 470, 574],
    ['Buenos Aires', 'ブエノスアイレス', 1, 330, 452, 1364],
    ['Sao Paulo', 'サンパウロ', 1, 366, 392, 2019],
    ['Lagos', 'ラゴス', 1, 470, 304, 1155],
    ['Kinshasa', 'キンシャサ', 1, 528, 372, 905],
    ['Johannesburg', 'ヨハネスブルグ', 1, 586, 448, 389],
    ['Khartoum', 'ハルツーム', 1, 598, 306, 489],
    // 黒
    ['Algiers', 'アルジェ', 2, 498, 218, 295],
    ['Cairo', 'カイロ', 2, 572, 240, 1472],
    ['Istanbul', 'イスタンブール', 2, 594, 172, 1358],
    ['Moscow', 'モスクワ', 2, 664, 116, 1551],
    ['Baghdad', 'バグダッド', 2, 650, 202, 620],
    ['Riyadh', 'リヤド', 2, 660, 274, 504],
    ['Tehran', 'テヘラン', 2, 722, 150, 742],
    ['Karachi', 'カラチ', 2, 730, 232, 2071],
    ['Delhi', 'デリー', 2, 790, 186, 2224],
    ['Mumbai', 'ムンバイ', 2, 738, 300, 1691],
    ['Chennai', 'チェンナイ', 2, 796, 340, 887],
    ['Kolkata', 'コルカタ', 2, 850, 214, 1437],
    // 赤
    ['Beijing', '北京', 3, 870, 116, 1731],
    ['Seoul', 'ソウル', 3, 932, 108, 2255],
    ['Tokyo', '東京', 3, 958, 164, 1319],
    ['Shanghai', '上海', 3, 880, 178, 1348],
    ['Hong Kong', '香港', 3, 888, 252, 711],
    ['Taipei', '台北', 3, 940, 238, 834],
    ['Osaka', '大阪', 3, 972, 210, 287],
    ['Bangkok', 'バンコク', 3, 842, 292, 715],
    ['Ho Chi Minh City', 'ホーチミン', 3, 890, 330, 831],
    ['Manila', 'マニラ', 3, 950, 320, 2077],
    ['Jakarta', 'ジャカルタ', 3, 846, 394, 2606],
    ['Sydney', 'シドニー', 3, 958, 452, 379]
];

export const CITIES = CITY_ROWS.map(([en, name, color, x, y, pop], id) => ({ id, en, name, color, x, y, pop }));
export const CITY_COUNT = CITIES.length;
const byName = new Map(CITIES.map(c => [c.en, c.id]));
export const cityId = (en) => {
    const id = byName.get(en);
    if (id === undefined) throw new Error(`都市がありません: ${en}`);
    return id;
};

// つながり（向きなし）。地図の端をまたぐ線（太平洋）は WRAP にも入れる
const LINKS = [
    ['San Francisco', 'Chicago'], ['San Francisco', 'Los Angeles'], ['San Francisco', 'Tokyo'], ['San Francisco', 'Manila'],
    ['Chicago', 'Montreal'], ['Chicago', 'Atlanta'], ['Chicago', 'Los Angeles'], ['Chicago', 'Mexico City'],
    ['Montreal', 'New York'], ['Montreal', 'Washington'],
    ['New York', 'Washington'], ['New York', 'London'], ['New York', 'Madrid'],
    ['Washington', 'Atlanta'], ['Washington', 'Miami'],
    ['Atlanta', 'Miami'],
    ['London', 'Madrid'], ['London', 'Paris'], ['London', 'Essen'],
    ['Madrid', 'Paris'], ['Madrid', 'Algiers'], ['Madrid', 'Sao Paulo'],
    ['Paris', 'Essen'], ['Paris', 'Milan'], ['Paris', 'Algiers'],
    ['Essen', 'Milan'], ['Essen', 'St. Petersburg'],
    ['Milan', 'Istanbul'],
    ['St. Petersburg', 'Istanbul'], ['St. Petersburg', 'Moscow'],
    ['Los Angeles', 'Mexico City'], ['Los Angeles', 'Sydney'],
    ['Mexico City', 'Miami'], ['Mexico City', 'Bogota'], ['Mexico City', 'Lima'],
    ['Miami', 'Bogota'],
    ['Bogota', 'Lima'], ['Bogota', 'Buenos Aires'], ['Bogota', 'Sao Paulo'],
    ['Lima', 'Santiago'],
    ['Buenos Aires', 'Sao Paulo'],
    ['Sao Paulo', 'Lagos'],
    ['Lagos', 'Kinshasa'], ['Lagos', 'Khartoum'],
    ['Kinshasa', 'Khartoum'], ['Kinshasa', 'Johannesburg'],
    ['Johannesburg', 'Khartoum'],
    ['Khartoum', 'Cairo'],
    ['Algiers', 'Istanbul'], ['Algiers', 'Cairo'],
    ['Cairo', 'Istanbul'], ['Cairo', 'Baghdad'], ['Cairo', 'Riyadh'],
    ['Istanbul', 'Moscow'], ['Istanbul', 'Baghdad'],
    ['Moscow', 'Tehran'],
    ['Baghdad', 'Tehran'], ['Baghdad', 'Riyadh'], ['Baghdad', 'Karachi'],
    ['Riyadh', 'Karachi'],
    ['Tehran', 'Karachi'], ['Tehran', 'Delhi'],
    ['Karachi', 'Delhi'], ['Karachi', 'Mumbai'],
    ['Delhi', 'Mumbai'], ['Delhi', 'Chennai'], ['Delhi', 'Kolkata'],
    ['Mumbai', 'Chennai'],
    ['Chennai', 'Kolkata'], ['Chennai', 'Bangkok'], ['Chennai', 'Jakarta'],
    ['Kolkata', 'Bangkok'], ['Kolkata', 'Hong Kong'],
    ['Beijing', 'Shanghai'], ['Beijing', 'Seoul'],
    ['Seoul', 'Shanghai'], ['Seoul', 'Tokyo'],
    ['Tokyo', 'Shanghai'], ['Tokyo', 'Osaka'],
    ['Shanghai', 'Hong Kong'], ['Shanghai', 'Taipei'],
    ['Hong Kong', 'Taipei'], ['Hong Kong', 'Manila'], ['Hong Kong', 'Ho Chi Minh City'], ['Hong Kong', 'Bangkok'],
    ['Taipei', 'Osaka'], ['Taipei', 'Manila'],
    ['Bangkok', 'Ho Chi Minh City'], ['Bangkok', 'Jakarta'],
    ['Ho Chi Minh City', 'Manila'], ['Ho Chi Minh City', 'Jakarta'],
    ['Manila', 'Sydney'],
    ['Jakarta', 'Sydney']
];

export const EDGES = LINKS.map(([a, b]) => [cityId(a), cityId(b)]);
// 太平洋をまたぐ線（地図では、左右の端へ抜ける線で描く）
export const WRAP_EDGES = new Set(['San Francisco|Tokyo', 'San Francisco|Manila', 'Los Angeles|Sydney']
    .map(k => k.split('|').map(cityId).sort((a, b) => a - b).join('-')));
export const NEIGHBORS = CITIES.map(() => []);
EDGES.forEach(([a, b]) => {
    NEIGHBORS[a].push(b);
    NEIGHBORS[b].push(a);
});
export const isWrap = (a, b) => WRAP_EDGES.has([a, b].sort((x, y) => x - y).join('-'));

// 車・船での最短の手数（全都市の組）
export const DRIVE_DIST = CITIES.map(start => {
    const dist = new Array(CITY_COUNT).fill(Infinity);
    dist[start.id] = 0;
    const queue = [start.id];
    while (queue.length) {
        const c = queue.shift();
        NEIGHBORS[c].forEach(n => {
            if (dist[n] === Infinity) {
                dist[n] = dist[c] + 1;
                queue.push(n);
            }
        });
    }
    return dist;
});

export const START_CITY = cityId('Atlanta');

// ---- プレイヤーカード ----
// 0〜47 は都市カード（都市の番号と同じ）、48〜52 はイベント、60〜 は伝染
export const EVENTS = [
    { id: 48, key: 'airlift', name: '空輸', text: '好きな駒1つを、好きな都市へ動かす' },
    { id: 49, key: 'forecast', name: '予測', text: '感染カードの山の上6枚を見て、好きな順に並べ替える' },
    { id: 50, key: 'grant', name: '政府の助成金', text: '好きな都市に研究所を1つ建てる（カードは要らない）' },
    { id: 51, key: 'quiet', name: '静かな夜', text: '次の感染を1回とばす' },
    { id: 52, key: 'resilient', name: '強い住民', text: '感染カードの捨て札から1枚を選び、ゲームから取り除く' }
];
export const EVENT_BY_KEY = Object.fromEntries(EVENTS.map(e => [e.key, e]));
export const EPIDEMIC_BASE = 60;
export const isCityCard = (card) => card >= 0 && card < CITY_COUNT;
export const isEventCard = (card) => card >= 48 && card < 48 + EVENTS.length;
export const isEpidemicCard = (card) => card >= EPIDEMIC_BASE;
export const eventOf = (card) => EVENTS[card - 48];
export const cardColor = (card) => (isCityCard(card) ? CITIES[card].color : -1);
export const cardName = (card) => (isCityCard(card) ? CITIES[card].name : isEventCard(card) ? eventOf(card).name : '伝染');

// ---- 役割（2013年版の7種）----
export const ROLES = [
    { key: 'medic', name: '衛生兵', color: '#f08a2c', text: '治療で、その色の病原体をすべて取り除く。治療薬のある色は、いる都市から自動で取り除き、置かれるのも防ぐ' },
    { key: 'scientist', name: '科学者', color: '#f2f2ee', text: '治療薬の発見に、同じ色のカードが4枚でよい' },
    { key: 'researcher', name: '研究員', color: '#a87a4e', text: '知識の共有で、今いる都市でなくても、好きな都市カードを渡せる' },
    { key: 'ops', name: '作戦エキスパート', color: '#8fd16a', text: 'カードなしで研究所を建てる。手番に1回、研究所から都市カード1枚を捨てて好きな都市へ移動する' },
    { key: 'quarantine', name: '検疫官', color: '#2f8f5b', text: 'いる都市と、つながった都市に、病原体を置かせない' },
    { key: 'planner', name: '危機管理官', color: '#4fc3c8', text: '捨て札のイベントカードを1枚拾って取っておける（手札に数えない）。使うとゲームから取り除く' },
    { key: 'dispatcher', name: '通信指令員', color: '#d65fb0', text: 'ほかの駒を自分の駒のように動かす。駒を、ほかの駒のいる都市へ動かせる' }
];
export const ROLE_BY_KEY = Object.fromEntries(ROLES.map((r, i) => [r.key, i]));

// 感染率の列と、上限
export const INFECTION_RATES = [2, 2, 2, 3, 3, 4, 4];
export const MAX_OUTBREAKS = 8;
export const CUBES_PER_COLOR = 24;
export const MAX_STATIONS = 6;
export const HAND_LIMIT = 7;
export const ACTIONS_PER_TURN = 4;
export const HAND_SIZES = { 2: 4, 3: 3, 4: 2 };
export const LEVELS = { intro: { epidemics: 4, name: '入門' }, standard: { epidemics: 5, name: '標準' }, heroic: { epidemics: 6, name: '英雄' } };
