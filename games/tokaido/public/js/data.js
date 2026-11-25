/**
 * 東海道（基本ゲーム）のデータ：道のマス、旅人、札
 * 道の並びと2マスの位置、札の内訳は README の「資料」に出典を書いた
 */

// ---- 道 ----

// マスの種類
export const SPACE_TYPES = {
    inn: { name: '宿場', short: '宿' },
    village: { name: '店', short: '店', text: '土産を3枚見て、好きなだけ買う（1文以上ないと止まれない）' },
    farm: { name: '農家', short: '農', text: '3文をもらう' },
    temple: { name: '寺', short: '寺', text: '1〜3文を寄付し、1文につき1点（1文以上ないと止まれない）' },
    encounter: { name: '出会い', short: '会', text: '出会いの札を1枚引く' },
    spring: { name: '温泉', short: '湯', text: '温泉の札（2点か3点）を1枚引く' },
    paddy: { name: '田', short: '田', text: '田の景色の次の1枚（全3枚）' },
    mountain: { name: '山', short: '山', text: '山の景色の次の1枚（全4枚）' },
    sea: { name: '海', short: '海', text: '海の景色の次の1枚（全5枚）' }
};

// 宿場の間のマス（京都 → 江戸）。数字の 2 は2マス（4・5人のときだけ2人目が止まれる）
const SEGMENTS = [
    'village2 temple encounter paddy spring2 mountain2 farm2 village temple2 encounter sea2 mountain spring',
    'sea temple farm2 paddy2 mountain2 encounter2 temple spring2 mountain sea2 village farm',
    'paddy village encounter2 farm mountain2 spring sea2 paddy temple2 farm2 encounter sea village2',
    'spring temple2 encounter village2 sea farm2 spring2 encounter mountain paddy2 sea2 village'
];
export const INN_NAMES = ['京都', '一の宿', '二の宿', '三の宿', '江戸'];

// BOARD[i] = { type, double, inn（宿場の番号） }
export const BOARD = (() => {
    const board = [{ type: 'inn', double: false, inn: 0 }];
    SEGMENTS.forEach((segment, k) => {
        segment.split(' ').forEach(word => board.push({ type: word.replace('2', ''), double: word.endsWith('2') }));
        board.push({ type: 'inn', double: false, inn: k + 1 });
    });
    return board;
})();
export const INN_POSITIONS = BOARD.map((s, i) => (s.type === 'inn' ? i : -1)).filter(i => i >= 0);
export const EDO = BOARD.length - 1;

// pos より先で、いちばん近い宿場
export const nextInn = (pos) => INN_POSITIONS.find(i => i > pos) ?? EDO;
// pos を含む区間の始まりの宿場
export const segmentStart = (pos) => [...INN_POSITIONS].reverse().find(i => i <= pos) ?? 0;

// ---- 景色 ----

export const PANORAMAS = {
    paddy: { name: '田', size: 3 },
    mountain: { name: '山', size: 4 },
    sea: { name: '海', size: 5 }
};
export const PANORAMA_KINDS = ['paddy', 'mountain', 'sea'];

// ---- 旅人 ----

export const TRAVELERS = {
    chuubei: { name: 'チュウベエ', role: '飛脚', coins: 4, text: '途中の宿場で、食事の前に出会いの札を1枚引く' },
    hiroshige: { name: 'ヒロシゲ', role: '絵師', coins: 3, text: '途中の宿場で、食事の前に好きな景色の札を1枚取る' },
    hirotada: { name: 'ヒロタダ', role: '僧', coins: 8, text: '寺で、自分の寄付に加えて、場のお金1文を寄付する（1点）' },
    kinko: { name: 'キンコ', role: '浪人', coins: 7, text: '食事が1文安い（1文の食事はただ）' },
    mitsukuni: { name: 'ミツクニ', role: '隠居', coins: 6, text: '温泉の札と称号の札1枚ごとに、1点多い' },
    sasayakko: { name: 'ササヤッコ', role: '芸者', coins: 5, text: '店で2枚以上買うと、いちばん安い1枚がただ' },
    satsuki: { name: 'サツキ', role: '孤児', coins: 2, text: '宿場で、食事1枚がランダムにただで出る（断って買ってもよい）' },
    umegae: { name: 'ウメガエ', role: '大道芸人', coins: 5, text: '出会いのたびに、1点と1文を得る' },
    yoshiyasu: { name: 'ヨシヤス', role: '役人', coins: 9, text: '出会いで2枚引き、1枚を選ぶ（もう1枚は山の下へ）' },
    zenemon: { name: 'ゼンエモン', role: '商人', coins: 6, text: '店ごとに1回、土産1枚を1文で買える' }
};
export const TRAVELER_IDS = Object.keys(TRAVELERS);

// ---- 土産（24枚。4種類） ----

export const SOUVENIR_KINDS = {
    small: { name: '小物' },
    food: { name: '食べ物' },
    clothing: { name: '着物' },
    art: { name: '美術' }
};
export const SOUVENIR_KIND_IDS = Object.keys(SOUVENIR_KINDS);

export const SOUVENIRS = {
    koma: { name: '独楽', kind: 'small', price: 1 },
    gofu: { name: '護符', kind: 'small', price: 1 },
    yunomi: { name: '湯呑', kind: 'small', price: 1 },
    uchiwa: { name: '団扇', kind: 'small', price: 1 },
    hashi: { name: '箸', kind: 'small', price: 1 },
    washi: { name: '和紙', kind: 'small', price: 1 },
    manju: { name: '饅頭', kind: 'food', price: 1 },
    daifuku: { name: '大福', kind: 'food', price: 2 },
    sake: { name: '酒', kind: 'food', price: 2 },
    kamaboko: { name: '蒲鉾', kind: 'food', price: 1 },
    ocha: { name: '茶', kind: 'food', price: 1 },
    konpeito: { name: '金平糖', kind: 'food', price: 1 },
    haori: { name: '羽織', kind: 'clothing', price: 2 },
    furoshiki: { name: '風呂敷', kind: 'clothing', price: 2 },
    sandogasa: { name: '三度笠', kind: 'clothing', price: 2 },
    kanzashi: { name: '簪', kind: 'clothing', price: 2 },
    geta: { name: '下駄', kind: 'clothing', price: 2 },
    yukata: { name: '浴衣', kind: 'clothing', price: 2 },
    shamisen: { name: '三味線', kind: 'art', price: 3 },
    netsuke: { name: '根付', kind: 'art', price: 2 },
    jubako: { name: '重箱', kind: 'art', price: 2 },
    shikki: { name: '漆器', kind: 'art', price: 2 },
    sumie: { name: '墨絵', kind: 'art', price: 3 },
    ukiyoe: { name: '浮世絵', kind: 'art', price: 3 }
};
export const SOUVENIR_IDS = Object.keys(SOUVENIRS);

// ---- 食事（25枚。1枚6点。同じ料理は2度食べられない） ----

export const DISHES = {
    dango: { name: '団子', price: 1, count: 3 },
    nigirimeshi: { name: '握り飯', price: 1, count: 3 },
    misoshiru: { name: '味噌汁', price: 1, count: 3 },
    tofu: { name: '豆腐', price: 2, count: 2 },
    tempura: { name: '天ぷら', price: 2, count: 2 },
    sushi: { name: '寿司', price: 2, count: 2 },
    soba: { name: '蕎麦', price: 2, count: 2 },
    yakitori: { name: '焼き鳥', price: 2, count: 2 },
    unagi: { name: '鰻', price: 3, count: 1 },
    udon: { name: 'うどん', price: 3, count: 1 },
    fugu: { name: '河豚', price: 3, count: 1 },
    taimeshi: { name: '鯛めし', price: 3, count: 1 },
    sashimi: { name: '刺身', price: 3, count: 1 },
    donburi: { name: '丼', price: 3, count: 1 }
};
export const MEAL_POINTS = 6;
// 札の id は「料理:番号」（同じ料理が複数枚あるため）
export const MEAL_CARDS = Object.entries(DISHES).flatMap(([dish, d]) => Array.from({ length: d.count }, (_, i) => `${dish}:${i + 1}`));
export const dishOf = (card) => card.split(':')[0];

// ---- 出会い（14枚） ----

export const ENCOUNTERS = {
    shokunin: { name: '職人', count: 2, text: '土産の山から1枚をもらう' },
    'annaibito-paddy': { name: '案内人（田）', count: 1, text: '田の景色の次の1枚（完成していれば、ほかの景色）' },
    'annaibito-mountain': { name: '案内人（山）', count: 2, text: '山の景色の次の1枚（完成していれば、ほかの景色）' },
    'annaibito-sea': { name: '案内人（海）', count: 3, text: '海の景色の次の1枚（完成していれば、ほかの景色）' },
    samurai: { name: '侍', count: 2, text: '3点' },
    kuge: { name: '公家', count: 2, text: '3文' },
    miko: { name: '巫女', count: 2, text: '場のお金1文を寺に寄付する（1点）' }
};
export const ENCOUNTER_CARDS = Object.entries(ENCOUNTERS).flatMap(([kind, e]) => Array.from({ length: e.count }, (_, i) => `${kind}:${i + 1}`));
export const encounterKind = (card) => card.split(':')[0];

// ---- 温泉（12枚。2点6枚・3点6枚） ----

export const SPRING_CARDS = [...Array.from({ length: 6 }, (_, i) => `2:${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `3:${i + 1}`)];
export const springValue = (card) => Number(card.split(':')[0]);

// ---- 称号 ----

export const ACHIEVEMENTS = {
    paddy: { name: '田の景色', text: '田の景色を最初に完成させた' },
    mountain: { name: '山の景色', text: '山の景色を最初に完成させた' },
    sea: { name: '海の景色', text: '海の景色を最初に完成させた' },
    gourmet: { name: '食通', text: '食事の札の値段の合計が最も多い' },
    collector: { name: '収集家', text: '土産の札が最も多い' },
    bather: { name: '湯治客', text: '温泉の札が最も多い' },
    chatterbox: { name: '話し好き', text: '出会いの札が最も多い' }
};
export const ACHIEVEMENT_POINTS = 3;
// 寺の寄付の順位の点（1番多い額・2番目・3番目・それ以外で1文以上）
export const TEMPLE_RANK_POINTS = [10, 7, 4, 2];

// 旅人のこまの色（席の順）。2人のときの中立の旅人は灰色
export const COLORS = ['#3d5f8f', '#b8574a', '#5e8a4f', '#c49a2c', '#7a5c92'];
export const NEUTRAL_COLOR = '#8a8478';
