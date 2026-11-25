/**
 * 地図（タルシス）・グローバル・パラメータ・標準プロジェクト・マイルストーン・褒賞のデータ
 * 地図は本家の実装（terraforming-mars/terraforming-mars）の配置のデータに合わせた（61 マス、海洋のマス 12）
 */

// 行ごとのマス：[種類, ...配置ボーナス]。O は海洋のマス、V は火山のマス（陸）。s=鋼鉄 t=チタン p=植物 c=カード
const ROWS = [
    ['L ss', 'O ss', 'L', 'O c', 'O'],
    ['L', 'V s', 'L', 'L', 'L', 'O cc'],
    ['V c', 'L', 'L', 'L', 'L', 'L', 'L s'],
    ['V pt', 'L p', 'L p', 'L p', 'L pp', 'L p', 'L p', 'O pp'],
    ['V pp', 'L pp', 'N pp', 'O pp', 'O pp', 'O pp', 'L pp', 'L pp', 'L pp'],
    ['L p', 'L pp', 'L p', 'L p', 'L p', 'O p', 'O p', 'O p'],
    ['L', 'L', 'L', 'L', 'L', 'L p', 'L'],
    ['L ss', 'L', 'L c', 'L c', 'L', 'L t'],
    ['L s', 'L ss', 'L', 'L', 'O tt']
];
const BONUS = { s: 'steel', t: 'titanium', p: 'plants', c: 'card' };

// N はノクティス都市のための予約のマス（ノクティス都市のカードでだけ都市を置ける）
// 火山のマス（溶岩流を置ける）：タルシス・トロス、アスクレウス山、パヴォニス山、アルシア山
export const SPACES = ROWS.flatMap((row, y) => row.map((cell, x) => {
    const [kind, bonus = ''] = cell.split(' ');
    return { id: `${y}-${x}`, x, y, ocean: kind === 'O', reserved: kind === 'N', volcanic: kind === 'V', bonus: [...bonus].map(b => BONUS[b]) };
}));
export const ROW_LENGTHS = ROWS.map(r => r.length);

// 火星の外の都市のマス（隣のマスはない。配置ボーナスもない）
export const OFF_MARS = { phobos: { name: 'フォボス' }, ganymede: { name: 'ガニメデ' } };
export const isOnMars = id => !(id in OFF_MARS);

// 六角の隣（行の長さが中央へ向けて伸び、中央から縮む）
export function neighbors(id) {
    if (!isOnMars(id)) return [];
    const [y, x] = id.split('-').map(Number);
    const list = [[y, x - 1], [y, x + 1]];
    const up = y - 1;
    const down = y + 1;
    if (up >= 0) list.push(...(ROW_LENGTHS[up] < ROW_LENGTHS[y] ? [[up, x - 1], [up, x]] : [[up, x], [up, x + 1]]));
    if (down < ROWS.length) list.push(...(ROW_LENGTHS[down] < ROW_LENGTHS[y] ? [[down, x - 1], [down, x]] : [[down, x], [down, x + 1]]));
    return list.filter(([yy, xx]) => xx >= 0 && xx < (ROW_LENGTHS[yy] ?? 0)).map(([yy, xx]) => `${yy}-${xx}`);
}

export const RESOURCES = ['mc', 'steel', 'titanium', 'plants', 'energy', 'heat'];
export const RESOURCE_NAMES = { mc: 'メガクレジット', steel: '鋼鉄', titanium: 'チタン', plants: '植物', energy: '電力', heat: '熱' };
export const TAG_NAMES = {
    building: '建物', space: '宇宙', science: '科学', power: '電力', earth: '地球', jovian: '木星', plant: '植物', microbe: '微生物', animal: '動物', city: '都市', event: 'イベント'
};

// グローバル・パラメータ
export const TEMPERATURE = { min: -30, max: 8, step: 2 };
export const OXYGEN = { max: 14 };
export const OCEANS = { max: 9 };
// ボーナス：温度 -24 と -20 で熱の生産 +1、0 で海洋を置く。酸素 8% で温度 +1
export const TEMPERATURE_BONUS = { '-24': 'heatProduction', '-20': 'heatProduction', 0: 'ocean' };
export const OXYGEN_BONUS = { 8: 'temperature' };
export const STARTING_TR = 20;

// 標準プロジェクト
export const STANDARD_PROJECTS = {
    sellPatents: { name: '特許の売却', cost: 0, text: '手札を捨て、1 枚につき 1 M€' },
    powerPlant: { name: '発電所', cost: 11, text: '電力の生産 +1' },
    asteroid: { name: '小惑星', cost: 14, text: '温度 +1 段階' },
    aquifer: { name: '帯水層', cost: 18, text: '海洋を 1 枚置く' },
    greenery: { name: '緑地', cost: 23, text: '緑地を 1 枚置く' },
    city: { name: '都市', cost: 25, text: '都市を 1 枚置き、M€ の生産 +1' }
};
export const PLANTS_FOR_GREENERY = 8;
export const HEAT_FOR_TEMPERATURE = 8;

// マイルストーン（8 M€、3 つまで、5 点）
export const MILESTONES = {
    terraformer: { name: 'テラフォーマー', text: 'TR 35 以上' },
    mayor: { name: '市長', text: '都市タイル 3 枚' },
    gardener: { name: '庭師', text: '緑地タイル 3 枚' },
    builder: { name: '建築家', text: '建物タグ 8 つ' },
    planner: { name: '計画者', text: '手札 16 枚' }
};
export const MILESTONE_COST = 8;
// 褒賞（8・14・20 M€ で 3 つまで。1 位 5 点、2 位 2 点）
export const AWARDS = {
    landlord: { name: '地主', text: 'タイルの数' },
    banker: { name: '銀行家', text: 'M€ の生産' },
    scientist: { name: '科学者', text: '科学タグの数' },
    thermalist: { name: '熱の専門家', text: '熱の資源' },
    miner: { name: '鉱夫', text: '鋼鉄とチタンの資源' }
};
export const AWARD_COSTS = [8, 14, 20];
