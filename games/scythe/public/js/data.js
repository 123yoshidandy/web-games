/**
 * サイズ -大鎌戦役- のデータ（勢力・プレイヤーマット・地図・カード）
 * 地図の配置・マットの数値・カードの中身は、本家の構成（地形6種・川・湖・トンネル・工場・遭遇11か所、
 * マットの上段と下段、遭遇カードの3択）に合わせて自作したもの。細かい数値は本家と同じではない
 */

export const RESOURCES = ['oil', 'metal', 'food', 'wood'];
export const RESOURCE_NAMES = { oil: '石油', metal: '金属', food: '食料', wood: '木材' };

export const TERRAINS = {
    mountain: { name: '山', produces: 'metal', color: '#9a8f86' },
    forest: { name: '森', produces: 'wood', color: '#5e8a4f' },
    farm: { name: '農場', produces: 'food', color: '#d8bf63' },
    tundra: { name: 'ツンドラ', produces: 'oil', color: '#a9b8a8' },
    village: { name: '村', produces: 'worker', color: '#c98f63' },
    lake: { name: '湖', produces: null, color: '#6fa3c8' },
    factory: { name: '工場', produces: null, color: '#8c6d8f' },
    home: { name: '本拠地', produces: null, color: '#555' }
};

// 上段の行動
export const TOPS = {
    move: { name: '移動', alt: '金' },
    produce: { name: '生産' },
    trade: { name: '交易' },
    bolster: { name: '支持' }
};
// 下段の行動（どのマットも、左から アップグレード・展開・建設・募集 の順）
export const BOTTOMS = ['upgrade', 'deploy', 'build', 'enlist'];
export const BOTTOM_INFO = {
    upgrade: { name: 'アップグレード', resource: 'oil', ongoing: 'power' },
    deploy: { name: '展開', resource: 'metal', ongoing: 'coins' },
    build: { name: '建設', resource: 'wood', ongoing: 'popularity' },
    enlist: { name: '募集', resource: 'food', ongoing: 'cards' }
};

// 上段のアップグレードの場所（6つ）。アップグレードすると、上段がよくなり、下段の費用が1下がる
export const TOP_UPGRADES = {
    moveUnits: { top: 'move', name: '移動 2→3体' },
    gainCoins: { top: 'move', name: '金 1→2' },
    power: { top: 'bolster', name: '力 2→3' },
    cards: { top: 'bolster', name: 'カード 1→2枚' },
    popularity: { top: 'trade', name: '人気 1→2' },
    produce: { top: 'produce', name: '生産 2→3か所' }
};

// 募集の1回だけの恩恵
export const ONE_TIME = {
    power: { name: '力+2' },
    coins: { name: '金+2' },
    popularity: { name: '人気+2' },
    cards: { name: 'カード+2' }
};

export const STRUCTURES = {
    mine: { name: '鉱山', text: '自分にとってトンネルになる' },
    mill: { name: '風車', text: '生産で、この領地が1つ多く生む（労働者がいなくても選べる）' },
    armory: { name: '武器庫', text: 'この建物があった区画の上段を選ぶたびに、力+1' },
    monument: { name: '記念碑', text: 'この建物があった区画の上段を選ぶたびに、人気+1' }
};

export const MECH_ABILITIES = {
    riverwalk: { name: '渡河' },
    seaworthy: { name: '航海', text: '指導者とメックが、湖に出入りできる' },
    artillery: { name: '砲撃', text: '戦闘の前に力1を払い、相手の力を2減らす（力があれば自動）' },
    speed: { name: '速さ', text: '指導者とメックが、2マスまで動ける' },
    township: { name: '町', text: '指導者とメックにとって、自分が支配する村と工場が隣り合う' },
    peoplesArmy: { name: '人民軍', text: '戦闘の領地に自分の労働者がいれば、カードを1枚多く使える' },
    submerge: { name: '潜水', text: '指導者とメックが湖に出入りでき、湖から別の湖へ移れる' },
    camaraderie: { name: '友愛', text: '戦闘に勝って労働者を退かせても、人気が下がらない' },
    wayfare: { name: '旅路', text: '指導者とメックが、どこからでも空いた本拠地と自分の本拠地へ移れる' },
    scout: { name: '偵察', text: '戦闘の前に、相手の戦闘カードを1枚奪う' },
    underpass: { name: '地下道', text: '指導者とメックにとって、自分が支配する山とトンネルが隣り合う' },
    disarm: { name: '武装解除', text: 'トンネルのある領地での戦闘で、相手の力を2減らす' }
};

export const FACTIONS = {
    nordic: {
        name: 'ノルディック', color: '#3f7fd0', ink: '#ffffff', power: 4, cards: 1, leader: 'ビョルン',
        ability: '泳ぐ：労働者が川を渡れる',
        mechs: ['riverwalk', 'seaworthy', 'artillery', 'speed'], riverwalk: ['forest', 'mountain']
    },
    rusviet: {
        name: 'ルスヴィエト', color: '#c8423a', ink: '#ffffff', power: 3, cards: 2, leader: 'オルガ',
        ability: '不屈：前の手番と同じ区画を選べる',
        mechs: ['riverwalk', 'township', 'peoplesArmy', 'speed'], riverwalk: ['farm', 'village']
    },
    polania: {
        name: 'ポラニア', color: '#e8e4da', ink: '#222222', power: 2, cards: 3, leader: 'アンナ',
        ability: '放浪：遭遇で2つまで選べる',
        mechs: ['riverwalk', 'submerge', 'camaraderie', 'speed'], riverwalk: ['village', 'mountain']
    },
    crimea: {
        name: 'クリミア', color: '#e2b43c', ink: '#222222', power: 5, cards: 0, leader: 'ジェナ',
        ability: '徴発：1手番に1回、戦闘カード1枚を好きな資源1つの代わりにできる（足りないときに自動）',
        mechs: ['riverwalk', 'wayfare', 'scout', 'speed'], riverwalk: ['farm', 'tundra']
    },
    saxony: {
        name: 'サクソニー', color: '#3b3a3f', ink: '#ffffff', power: 1, cards: 4, leader: 'グンター',
        ability: '支配：目標と戦闘の星に上限がない',
        mechs: ['riverwalk', 'underpass', 'disarm', 'speed'], riverwalk: ['forest', 'mountain']
    }
};
export const FACTION_KEYS = Object.keys(FACTIONS);

// プレイヤーマット。tops は区画ごとの上段、bottom は区画ごとの下段の費用（cost から min まで下がる）と得る金、
// structures は区画ごとに置かれた建物（武器庫・記念碑は、その区画の上段の恩恵になる）
export const MATS = {
    industrial: {
        no: 1, name: '工業', popularity: 2, coins: 4,
        tops: ['bolster', 'produce', 'move', 'trade'],
        bottom: [{ cost: 3, min: 2, coins: 3 }, { cost: 3, min: 1, coins: 2 }, { cost: 3, min: 2, coins: 1 }, { cost: 4, min: 2, coins: 0 }],
        structures: ['monument', 'mill', 'mine', 'armory']
    },
    engineering: {
        no: 2, name: '技術', popularity: 2, coins: 5,
        tops: ['produce', 'trade', 'bolster', 'move'],
        bottom: [{ cost: 3, min: 2, coins: 2 }, { cost: 4, min: 2, coins: 0 }, { cost: 3, min: 1, coins: 3 }, { cost: 3, min: 2, coins: 1 }],
        structures: ['mill', 'armory', 'monument', 'mine']
    },
    patriotic: {
        no: 3, name: '愛国', popularity: 2, coins: 6,
        tops: ['move', 'bolster', 'trade', 'produce'],
        bottom: [{ cost: 2, min: 2, coins: 1 }, { cost: 4, min: 2, coins: 3 }, { cost: 4, min: 2, coins: 0 }, { cost: 3, min: 1, coins: 2 }],
        structures: ['mine', 'monument', 'armory', 'mill']
    },
    mechanical: {
        no: 4, name: '機械', popularity: 3, coins: 6,
        tops: ['trade', 'bolster', 'move', 'produce'],
        bottom: [{ cost: 3, min: 2, coins: 0 }, { cost: 3, min: 1, coins: 2 }, { cost: 3, min: 2, coins: 2 }, { cost: 4, min: 2, coins: 1 }],
        structures: ['armory', 'monument', 'mine', 'mill']
    },
    agricultural: {
        no: 5, name: '農業', popularity: 4, coins: 7,
        tops: ['move', 'trade', 'produce', 'bolster'],
        bottom: [{ cost: 2, min: 2, coins: 1 }, { cost: 4, min: 2, coins: 0 }, { cost: 4, min: 2, coins: 2 }, { cost: 3, min: 1, coins: 3 }],
        structures: ['mine', 'armory', 'mill', 'monument']
    }
};
export const MAT_KEYS = Object.keys(MATS);
// 組み合わせると強すぎるので、本家でも使わない組み合わせ
export const BANNED = [['rusviet', 'industrial'], ['crimea', 'patriotic']];

// ---- 地図 ----
// 行ごとの地形（奇数の行は半マス右にずれる）。M:山 F:森 A:農場 T:ツンドラ V:村 L:湖 X:工場 .:なし
const ROWS = [
    '..MTVFA.',
    '.AFLMTVF',
    'TVMAFLTM',
    'MALVTAFT',
    'FTAMXLMV',
    'AVFLTMAF',
    'TMVAFTLA',
    '.FTMVAFT',
    '..AVFMT.'
];
const LETTERS = { M: 'mountain', F: 'forest', A: 'farm', T: 'tundra', V: 'village', L: 'lake', X: 'factory' };
const ENCOUNTERS = [[1, 2], [1, 6], [2, 3], [2, 7], [3, 4], [4, 2], [5, 6], [5, 1], [6, 1], [6, 4], [7, 3]];
const TUNNELS = [[2, 4], [3, 5], [5, 4], [5, 2], [3, 1], [6, 5]];
// 川（隣り合う2マスの間）
const RIVERS = [
    [1, 4, 2, 4], [1, 4, 2, 5], [1, 5, 2, 5], [1, 5, 2, 6],
    [2, 0, 3, 0], [3, 0, 3, 1], [4, 0, 4, 1],
    [2, 7, 3, 7], [3, 6, 3, 7], [4, 6, 4, 7],
    [6, 2, 7, 2], [7, 2, 7, 3], [6, 5, 7, 5], [7, 4, 7, 5],
    [3, 3, 4, 3], [4, 3, 4, 4], [5, 4, 5, 5]
];
// 本拠地と、最初に労働者を置く2マス
const HOMES = {
    nordic: [[0, 5], [0, 6]],
    rusviet: [[3, 7], [4, 7]],
    crimea: [[7, 6], [8, 6]],
    saxony: [[7, 1], [8, 2]],
    polania: [[3, 0], [4, 0]]
};

function neighborCells(r, c) {
    const d = r % 2 ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]] : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
    return d.map(([dr, dc]) => [r + dr, c + dc]);
}

function buildMap() {
    const hexes = [];
    const at = new Map();
    ROWS.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch === '.') return;
        const id = hexes.length;
        hexes.push({ id, r, c, terrain: LETTERS[ch], tunnel: false, encounter: false, home: null, adj: [] });
        at.set(`${r},${c}`, id);
    }));
    const idOf = (r, c) => {
        const id = at.get(`${r},${c}`);
        if (id === undefined) throw new Error(`地図に ${r},${c} がない`);
        return id;
    };
    hexes.forEach(h => {
        h.adj = neighborCells(h.r, h.c).map(([r, c]) => at.get(`${r},${c}`)).filter(id => id !== undefined);
    });
    ENCOUNTERS.forEach(([r, c]) => { hexes[idOf(r, c)].encounter = true; });
    TUNNELS.forEach(([r, c]) => { hexes[idOf(r, c)].tunnel = true; });
    const rivers = new Set();
    RIVERS.forEach(([r1, c1, r2, c2]) => {
        const a = idOf(r1, c1);
        const b = idOf(r2, c2);
        if (!hexes[a].adj.includes(b)) throw new Error(`川 ${r1},${c1}-${r2},${c2} が隣り合っていない`);
        rivers.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    });
    const homes = {};
    FACTION_KEYS.forEach(key => {
        const id = hexes.length;
        const starts = HOMES[key].map(([r, c]) => idOf(r, c));
        hexes.push({ id, r: null, c: null, terrain: 'home', tunnel: false, encounter: false, home: key, adj: starts });
        homes[key] = id;
    });
    const factory = hexes.find(h => h.terrain === 'factory').id;
    return { hexes, rivers, homes, factory, boardCount: hexes.length - FACTION_KEYS.length };
}

export const MAP = buildMap();
export const isRiver = (a, b) => MAP.rivers.has(a < b ? `${a}-${b}` : `${b}-${a}`);

// ---- 戦闘カード（2〜5。本家と同じ42枚の内訳） ----
export const COMBAT_DECK = [...Array(16).fill(2), ...Array(12).fill(3), ...Array(8).fill(4), ...Array(6).fill(5)];

// ---- 遭遇カード（3択：もらう／金を払う／人気を払う） ----
// gain の資源と労働者は、指導者のいる領地に置く
const enc = (a, b, c) => [a, b, c];
export const ENCOUNTER_CARDS = [
    enc({ gain: { popularity: 2 } }, { cost: { coins: 2 }, gain: { food: 2, wood: 2 } }, { cost: { popularity: 2 }, gain: { metal: 2, oil: 2, power: 2 } }),
    enc({ gain: { coins: 4 } }, { cost: { coins: 2 }, gain: { power: 3, cards: 1 } }, { cost: { popularity: 2 }, gain: { workers: 2, food: 2 } }),
    enc({ gain: { power: 2, cards: 1 } }, { cost: { coins: 3 }, gain: { popularity: 3 } }, { cost: { popularity: 3 }, gain: { coins: 8 } }),
    enc({ gain: { workers: 1, popularity: 1 } }, { cost: { coins: 2 }, gain: { metal: 3 } }, { cost: { popularity: 2 }, gain: { oil: 3, wood: 2 } }),
    enc({ gain: { wood: 2, popularity: 1 } }, { cost: { coins: 1 }, gain: { cards: 2 } }, { cost: { popularity: 2 }, gain: { power: 4, cards: 1 } }),
    enc({ gain: { coins: 2, popularity: 1 } }, { cost: { coins: 3 }, gain: { oil: 2, metal: 2 } }, { cost: { popularity: 3 }, gain: { food: 3, wood: 3, workers: 1 } }),
    enc({ gain: { popularity: 2 } }, { cost: { coins: 2 }, gain: { workers: 2 } }, { cost: { popularity: 2 }, gain: { coins: 4, power: 2 } }),
    enc({ gain: { food: 2, popularity: 1 } }, { cost: { coins: 2 }, gain: { power: 2, popularity: 2 } }, { cost: { popularity: 3 }, gain: { metal: 3, oil: 3 } }),
    enc({ gain: { coins: 3 } }, { cost: { coins: 3 }, gain: { wood: 3, food: 2 } }, { cost: { popularity: 2 }, gain: { cards: 3 } }),
    enc({ gain: { power: 3 } }, { cost: { coins: 2 }, gain: { popularity: 2, cards: 1 } }, { cost: { popularity: 3 }, gain: { coins: 5, metal: 2 } }),
    enc({ gain: { oil: 2, popularity: 1 } }, { cost: { coins: 1 }, gain: { food: 3 } }, { cost: { popularity: 2 }, gain: { workers: 2, wood: 2 } }),
    enc({ gain: { popularity: 1, cards: 1 } }, { cost: { coins: 4 }, gain: { popularity: 4 } }, { cost: { popularity: 2 }, gain: { power: 3, coins: 3 } }),
    enc({ gain: { metal: 2 } }, { cost: { coins: 2 }, gain: { oil: 3 } }, { cost: { popularity: 3 }, gain: { coins: 3, food: 3, wood: 2 } }),
    enc({ gain: { coins: 2, power: 1 } }, { cost: { coins: 3 }, gain: { cards: 2, power: 2 } }, { cost: { popularity: 2 }, gain: { metal: 2, wood: 2, oil: 1 } }),
    enc({ gain: { popularity: 2 } }, { cost: { coins: 2 }, gain: { metal: 2, food: 1 } }, { cost: { popularity: 3 }, gain: { power: 5, cards: 1 } }),
    enc({ gain: { wood: 1, food: 1, popularity: 1 } }, { cost: { coins: 2 }, gain: { workers: 1, popularity: 2 } }, { cost: { popularity: 2 }, gain: { coins: 6 } })
];

// ---- 工場カード（5つ目の区画。上段：払ってもらう、下段：1体を2マスまで動かす） ----
export const FACTORY_CARDS = [
    { cost: { oil: 2 }, gain: { coins: 3, power: 2 } },
    { cost: { metal: 2 }, gain: { power: 3, popularity: 1 } },
    { cost: { wood: 2 }, gain: { popularity: 3 } },
    { cost: { food: 2 }, gain: { coins: 4 } },
    { cost: { popularity: 1 }, gain: { coins: 3, cards: 1 } },
    { cost: { power: 2 }, gain: { coins: 2, popularity: 2 } },
    { cost: { cards: 1 }, gain: { power: 3 } },
    { cost: { metal: 1, oil: 1 }, gain: { coins: 5 } },
    { cost: { food: 1, wood: 1 }, gain: { popularity: 2, power: 1 } },
    { cost: { coins: 3 }, gain: { power: 2, cards: 2 } },
    { cost: { popularity: 2 }, gain: { power: 4, coins: 1 } },
    { cost: { coins: 1 }, gain: { popularity: 1, power: 1 } }
];

export const GAIN_NAMES = {
    coins: '金', popularity: '人気', power: '力', cards: 'カード', workers: '労働者',
    oil: '石油', metal: '金属', food: '食料', wood: '木材'
};

// 出来事の文（{ coins: 2, power: 1 } → 「金2・力1」）
export const amountText = (obj) => Object.entries(obj ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${GAIN_NAMES[k]}${n}`).join('・') || 'なし';
