/**
 * プエルトリコ（基本ゲーム）のデータ：建物・品・役割・人数ごとの準備
 * 公開されている実装（mgrau/rico、jneem/puertorico、ghirschhorn987/puertorico、ArturKorop/PuertoRico、koshamo/puri、kyle-burke/rico）で照らし合わせた
 *   工場 7・大学 8 は ArturKorop・ghirschhorn・kyle-burke に合わせた（mgrau・jneem は逆）
 *   大市場 5/2・大倉庫 6/2 は mgrau・ghirschhorn・ArturKorop に合わせた（jneem は違う）
 *   5 人の役割 8 枚（金鉱掘り 2 枚）は ghirschhorn に、5 人の勝利点チップ 122 は mgrau に合わせた
 * 名前の日本語は自分で付けた訳。en は元の名前
 */

export const GOODS = ['corn', 'indigo', 'sugar', 'tobacco', 'coffee'];
export const GOOD_NAMES = { corn: 'とうもろこし', indigo: '藍', sugar: '砂糖', tobacco: 'タバコ', coffee: 'コーヒー' };
export const GOOD_PRICE = { corn: 0, indigo: 1, sugar: 2, tobacco: 3, coffee: 4 };
export const GOOD_SUPPLY = { corn: 10, indigo: 11, sugar: 11, tobacco: 9, coffee: 9 };
export const PLANTATIONS = { corn: 10, indigo: 12, sugar: 11, tobacco: 9, coffee: 8 };
export const QUARRIES = 8;
export const ISLAND_SPACES = 12;
export const CITY_SPACES = 12;

export const ROLES = ['settler', 'mayor', 'builder', 'craftsman', 'trader', 'captain', 'prospector'];
export const ROLE_NAMES = { settler: '開拓者', mayor: '市長', builder: '建築家', craftsman: '監督', trader: '商人', captain: '船長', prospector: '金鉱掘り' };
export const ROLE_TEXT = {
    settler: '全員が農園を1枚取る（選んだ人は石切り場も選べる）',
    mayor: '入植者を船から配り、全員が並べ直す（選んだ人は1人多く）',
    builder: '全員が建物を1つ建てられる（選んだ人は1安い）',
    craftsman: '全員が品を生産する（選んだ人は1つ多く）',
    trader: '全員が商館に品を1つ売れる（選んだ人は1多く）',
    captain: '全員が船に品を積み、勝利点を得る（選んだ人は1点多く）',
    prospector: '選んだ人がお金を1つ得る'
};

// 人数ごとの準備：役割、入植者（補充の山＋最初の船）、勝利点チップ、お金、船の大きさ、最初の農園（総督から順に）
export const SETUP = {
    3: { roles: ['settler', 'mayor', 'builder', 'craftsman', 'trader', 'captain'], colonists: 55, ship: 3, chips: 75, money: 2, ships: [4, 5, 6], start: ['indigo', 'indigo', 'corn'] },
    4: { roles: ['settler', 'mayor', 'builder', 'craftsman', 'trader', 'captain', 'prospector'], colonists: 75, ship: 4, chips: 100, money: 3, ships: [5, 6, 7], start: ['indigo', 'indigo', 'corn', 'corn'] },
    5: { roles: ['settler', 'mayor', 'builder', 'craftsman', 'trader', 'captain', 'prospector', 'prospector'], colonists: 95, ship: 5, chips: 122, money: 4, ships: [6, 7, 8], start: ['indigo', 'indigo', 'indigo', 'corn', 'corn'] }
};

// 建物：費用・勝利点・列（石切り場で安くなる上限）・入植者の枠・数・大きさ（大きい建物は 2 マス）
// kind：production（生産の建物。good を作る）／violet（紫の建物）／large（大きい建物）
const b = (key, name, en, cost, vp, capacity, count, kind, extra = {}) => ({ key, name, en, cost, vp, column: vp, capacity, count, kind, size: kind === 'large' ? 2 : 1, ...extra });
export const BUILDINGS = [
    b('smallIndigoPlant', '小さい藍染め場', 'Small Indigo Plant', 1, 1, 1, 4, 'production', { good: 'indigo', small: true }),
    b('smallSugarMill', '小さい製糖所', 'Small Sugar Mill', 2, 1, 1, 4, 'production', { good: 'sugar', small: true }),
    b('smallMarket', '小さい市場', 'Small Market', 1, 1, 1, 2, 'violet', { text: '売るとき +1 ドゥブロン' }),
    b('hacienda', 'アシエンダ', 'Hacienda', 2, 1, 1, 2, 'violet', { text: '開拓者のとき、山から農園を1枚多く取れる' }),
    b('constructionHut', '建設小屋', 'Construction Hut', 2, 1, 1, 2, 'violet', { text: '開拓者のとき、農園の代わりに石切り場を取れる' }),
    b('smallWarehouse', '小さい倉庫', 'Small Warehouse', 3, 1, 1, 2, 'violet', { text: '船長のあと、1種類の品を全部とっておける' }),
    b('indigoPlant', '藍染め場', 'Indigo Plant', 3, 2, 3, 3, 'production', { good: 'indigo' }),
    b('sugarMill', '製糖所', 'Sugar Mill', 4, 2, 3, 3, 'production', { good: 'sugar' }),
    b('hospice', '救護院', 'Hospice', 4, 2, 1, 2, 'violet', { text: '開拓者のとき、取った農園に入植者が1人付く' }),
    b('office', '事務所', 'Office', 5, 2, 1, 2, 'violet', { text: '商館に同じ品があっても売れる' }),
    b('largeMarket', '大きい市場', 'Large Market', 5, 2, 1, 2, 'violet', { text: '売るとき +2 ドゥブロン' }),
    b('largeWarehouse', '大きい倉庫', 'Large Warehouse', 6, 2, 1, 2, 'violet', { text: '船長のあと、2種類の品を全部とっておける' }),
    b('tobaccoStorage', 'タバコ倉', 'Tobacco Storage', 5, 3, 3, 3, 'production', { good: 'tobacco' }),
    b('coffeeRoaster', 'コーヒー焙煎所', 'Coffee Roaster', 6, 3, 2, 3, 'production', { good: 'coffee' }),
    b('factory', '工場', 'Factory', 7, 3, 1, 2, 'violet', { text: '監督のとき、作った品の種類で 2種1・3種2・4種3・5種5 ドゥブロン' }),
    b('university', '大学', 'University', 8, 3, 1, 2, 'violet', { text: '建てた建物に入植者が1人付く' }),
    b('harbor', '港', 'Harbor', 8, 3, 1, 2, 'violet', { text: '船に積むたびに +1 点' }),
    b('wharf', '波止場', 'Wharf', 9, 3, 1, 2, 'violet', { text: '船長のとき1回、自分の船に1種類の品を全部積める' }),
    b('guildHall', 'ギルドホール', 'Guild Hall', 10, 4, 1, 1, 'large', { text: '小さい生産の建物1つにつき1点、大きい生産の建物1つにつき2点' }),
    b('residence', '邸宅', 'Residence', 10, 4, 1, 1, 'large', { text: '島の埋まったマス 9以下4点・10で5点・11で6点・12で7点' }),
    b('fortress', '砦', 'Fortress', 10, 4, 1, 1, 'large', { text: '入植者3人につき1点' }),
    b('customsHouse', '税関', 'Customs House', 10, 4, 1, 1, 'large', { text: '勝利点チップ4点につき1点' }),
    b('cityHall', '市庁舎', 'City Hall', 10, 4, 1, 1, 'large', { text: '紫の建物（大きい建物を含む）1つにつき1点' })
];
export const BUILDING_BY_KEY = Object.fromEntries(BUILDINGS.map(x => [x.key, x]));
export const buildingOf = key => BUILDING_BY_KEY[key];

// 工場：作った品の種類の数 → ドゥブロン
export const FACTORY_BONUS = [0, 0, 1, 2, 3, 5];
// 邸宅：島の埋まったマス
export const residencePoints = filled => (filled <= 9 ? 4 : filled - 5);
