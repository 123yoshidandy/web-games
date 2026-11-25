/**
 * 北米の地図のデータ（DOM に依存しない）
 * 都市の座標は、地図の絵（1000×700）の上の位置。実際の地形をもとに自分で決めたもの
 * 路線は { id, a, b, len, color, pair }。複線は2本を別々に持ち、pair にもう1本の id を入れる
 */

export const MAP_W = 1000;
export const MAP_H = 700;

export const CITIES = {
    vancouver: { name: 'バンクーバー', x: 85, y: 70 },
    seattle: { name: 'シアトル', x: 75, y: 145 },
    portland: { name: 'ポートランド', x: 45, y: 220 },
    sanfrancisco: { name: 'サンフランシスコ', x: 50, y: 455 },
    losangeles: { name: 'ロサンゼルス', x: 130, y: 575 },
    calgary: { name: 'カルガリー', x: 235, y: 55 },
    helena: { name: 'ヘレナ', x: 360, y: 200 },
    saltlakecity: { name: 'ソルトレイクシティ', x: 245, y: 345 },
    lasvegas: { name: 'ラスベガス', x: 200, y: 480 },
    phoenix: { name: 'フェニックス', x: 270, y: 575 },
    elpaso: { name: 'エルパソ', x: 385, y: 625 },
    santafe: { name: 'サンタフェ', x: 385, y: 495 },
    denver: { name: 'デンバー', x: 390, y: 380 },
    winnipeg: { name: 'ウィニペグ', x: 500, y: 70 },
    duluth: { name: 'ダルース', x: 610, y: 210 },
    omaha: { name: 'オマハ', x: 575, y: 330 },
    kansascity: { name: 'カンザスシティ', x: 595, y: 400 },
    oklahomacity: { name: 'オクラホマシティ', x: 560, y: 495 },
    dallas: { name: 'ダラス', x: 585, y: 590 },
    houston: { name: 'ヒューストン', x: 635, y: 655 },
    saultstmarie: { name: 'スーセントマリー', x: 730, y: 135 },
    chicago: { name: 'シカゴ', x: 735, y: 305 },
    saintlouis: { name: 'セントルイス', x: 690, y: 410 },
    littlerock: { name: 'リトルロック', x: 655, y: 505 },
    neworleans: { name: 'ニューオーリンズ', x: 740, y: 640 },
    toronto: { name: 'トロント', x: 830, y: 175 },
    pittsburgh: { name: 'ピッツバーグ', x: 850, y: 300 },
    nashville: { name: 'ナッシュビル', x: 770, y: 460 },
    atlanta: { name: 'アトランタ', x: 830, y: 515 },
    miami: { name: 'マイアミ', x: 935, y: 670 },
    montreal: { name: 'モントリオール', x: 905, y: 60 },
    boston: { name: 'ボストン', x: 975, y: 125 },
    newyork: { name: 'ニューヨーク', x: 930, y: 225 },
    washington: { name: 'ワシントン', x: 950, y: 325 },
    raleigh: { name: 'ローリー', x: 890, y: 420 },
    charleston: { name: 'チャールストン', x: 925, y: 520 }
};

// [都市A, 都市B, 長さ, 色]。複線は、同じ2都市の行を2つ並べる
const ROUTE_LIST = [
    ['vancouver', 'calgary', 3, 'gray'],
    ['vancouver', 'seattle', 1, 'gray'], ['vancouver', 'seattle', 1, 'gray'],
    ['seattle', 'calgary', 4, 'gray'],
    ['seattle', 'helena', 6, 'yellow'],
    ['seattle', 'portland', 1, 'gray'], ['seattle', 'portland', 1, 'gray'],
    ['portland', 'sanfrancisco', 5, 'green'], ['portland', 'sanfrancisco', 5, 'pink'],
    ['portland', 'saltlakecity', 6, 'blue'],
    ['sanfrancisco', 'saltlakecity', 5, 'orange'], ['sanfrancisco', 'saltlakecity', 5, 'white'],
    ['sanfrancisco', 'losangeles', 3, 'yellow'], ['sanfrancisco', 'losangeles', 3, 'pink'],
    ['losangeles', 'lasvegas', 2, 'gray'],
    ['losangeles', 'phoenix', 3, 'gray'],
    ['losangeles', 'elpaso', 6, 'black'],
    ['lasvegas', 'saltlakecity', 3, 'orange'],
    ['phoenix', 'denver', 5, 'white'],
    ['phoenix', 'santafe', 3, 'gray'],
    ['phoenix', 'elpaso', 3, 'gray'],
    ['elpaso', 'santafe', 2, 'gray'],
    ['elpaso', 'oklahomacity', 5, 'yellow'],
    ['elpaso', 'dallas', 4, 'red'],
    ['elpaso', 'houston', 6, 'green'],
    ['calgary', 'helena', 4, 'gray'],
    ['calgary', 'winnipeg', 6, 'white'],
    ['helena', 'winnipeg', 4, 'blue'],
    ['helena', 'duluth', 6, 'orange'],
    ['helena', 'omaha', 5, 'red'],
    ['helena', 'denver', 4, 'green'],
    ['helena', 'saltlakecity', 3, 'pink'],
    ['saltlakecity', 'denver', 3, 'red'], ['saltlakecity', 'denver', 3, 'yellow'],
    ['denver', 'santafe', 2, 'gray'],
    ['denver', 'omaha', 4, 'pink'],
    ['denver', 'kansascity', 4, 'black'], ['denver', 'kansascity', 4, 'orange'],
    ['denver', 'oklahomacity', 4, 'red'],
    ['santafe', 'oklahomacity', 3, 'blue'],
    ['winnipeg', 'duluth', 4, 'black'],
    ['winnipeg', 'saultstmarie', 6, 'gray'],
    ['duluth', 'saultstmarie', 3, 'gray'],
    ['duluth', 'toronto', 6, 'pink'],
    ['duluth', 'chicago', 3, 'red'],
    ['duluth', 'omaha', 2, 'gray'], ['duluth', 'omaha', 2, 'gray'],
    ['omaha', 'chicago', 4, 'blue'],
    ['omaha', 'kansascity', 1, 'gray'], ['omaha', 'kansascity', 1, 'gray'],
    ['kansascity', 'saintlouis', 2, 'blue'], ['kansascity', 'saintlouis', 2, 'pink'],
    ['kansascity', 'oklahomacity', 2, 'gray'], ['kansascity', 'oklahomacity', 2, 'gray'],
    ['oklahomacity', 'dallas', 2, 'gray'], ['oklahomacity', 'dallas', 2, 'gray'],
    ['oklahomacity', 'littlerock', 2, 'gray'],
    ['dallas', 'houston', 1, 'gray'], ['dallas', 'houston', 1, 'gray'],
    ['dallas', 'littlerock', 2, 'gray'],
    ['houston', 'neworleans', 2, 'gray'],
    ['littlerock', 'saintlouis', 2, 'gray'],
    ['littlerock', 'nashville', 3, 'white'],
    ['littlerock', 'neworleans', 3, 'green'],
    ['neworleans', 'atlanta', 4, 'yellow'], ['neworleans', 'atlanta', 4, 'orange'],
    ['neworleans', 'miami', 6, 'red'],
    ['saintlouis', 'chicago', 2, 'green'], ['saintlouis', 'chicago', 2, 'white'],
    ['saintlouis', 'pittsburgh', 5, 'green'],
    ['saintlouis', 'nashville', 2, 'gray'],
    ['chicago', 'pittsburgh', 3, 'orange'], ['chicago', 'pittsburgh', 3, 'black'],
    ['chicago', 'toronto', 4, 'white'],
    ['saultstmarie', 'toronto', 2, 'gray'],
    ['saultstmarie', 'montreal', 5, 'black'],
    ['toronto', 'montreal', 3, 'gray'],
    ['toronto', 'pittsburgh', 2, 'gray'],
    ['montreal', 'boston', 2, 'gray'], ['montreal', 'boston', 2, 'gray'],
    ['montreal', 'newyork', 3, 'blue'],
    ['boston', 'newyork', 2, 'yellow'], ['boston', 'newyork', 2, 'red'],
    ['newyork', 'pittsburgh', 2, 'white'], ['newyork', 'pittsburgh', 2, 'green'],
    ['newyork', 'washington', 2, 'orange'], ['newyork', 'washington', 2, 'black'],
    ['pittsburgh', 'washington', 2, 'gray'],
    ['pittsburgh', 'raleigh', 2, 'gray'],
    ['pittsburgh', 'nashville', 4, 'yellow'],
    ['washington', 'raleigh', 2, 'gray'], ['washington', 'raleigh', 2, 'gray'],
    ['raleigh', 'nashville', 3, 'black'],
    ['raleigh', 'atlanta', 2, 'gray'], ['raleigh', 'atlanta', 2, 'gray'],
    ['raleigh', 'charleston', 2, 'gray'],
    ['nashville', 'atlanta', 1, 'gray'],
    ['atlanta', 'charleston', 2, 'gray'],
    ['atlanta', 'miami', 5, 'blue'],
    ['charleston', 'miami', 4, 'pink']
];

export const ROUTES = (() => {
    const list = ROUTE_LIST.map(([a, b, len, color], id) => ({ id, a, b, len, color, pair: null }));
    list.forEach(r => {
        const twin = list.find(o => o !== r && ((o.a === r.a && o.b === r.b) || (o.a === r.b && o.b === r.a)));
        if (twin) r.pair = twin.id;
    });
    return list;
})();

// 目的地カード30枚：[都市A, 都市B, 点]
export const TICKETS = [
    ['losangeles', 'newyork', 21], ['duluth', 'houston', 8], ['saultstmarie', 'nashville', 8], ['newyork', 'atlanta', 6],
    ['portland', 'nashville', 17], ['vancouver', 'montreal', 20], ['duluth', 'elpaso', 10], ['toronto', 'miami', 10],
    ['portland', 'phoenix', 11], ['dallas', 'newyork', 11], ['calgary', 'saltlakecity', 7], ['calgary', 'phoenix', 13],
    ['losangeles', 'miami', 20], ['winnipeg', 'littlerock', 11], ['sanfrancisco', 'atlanta', 17], ['kansascity', 'houston', 5],
    ['losangeles', 'chicago', 16], ['denver', 'pittsburgh', 11], ['chicago', 'santafe', 9], ['vancouver', 'santafe', 13],
    ['boston', 'miami', 12], ['chicago', 'neworleans', 7], ['montreal', 'atlanta', 9], ['seattle', 'newyork', 22],
    ['denver', 'elpaso', 4], ['helena', 'losangeles', 8], ['winnipeg', 'houston', 12], ['montreal', 'neworleans', 13],
    ['saultstmarie', 'oklahomacity', 9], ['seattle', 'losangeles', 9]
].map(([a, b, points], id) => ({ id, a, b, points }));

// 列車カードの色（機関車を除く8色）
export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'pink', 'white', 'black'];
export const LOCO = 'loco';
export const COLOR_NAMES = {
    red: '赤', orange: '橙', yellow: '黄', green: '緑', blue: '青', pink: '桃', white: '白', black: '黒', gray: '灰', loco: '機関車'
};
// 路線の長さごとの点
export const ROUTE_POINTS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };
export const CARDS_PER_COLOR = 12;
export const LOCO_COUNT = 14;
export const TRAINS = 45;
export const LONGEST_BONUS = 10;
