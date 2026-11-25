/**
 * クアックサルバーのデータ（基本セット・材料の本1）
 * 鍋のマス・材料の値段・占いカードなど、ルールの数値をここに集める
 */

export const ROUNDS = 9;
export const WHITE_LIMIT = 7;        // 白の合計がこれを超えると爆発
export const LAST_SPACE = 53;        // 鍋のいちばん外のマス
export const RUBY_COST = 2;          // しずく1マス・フラスコの補充にかかるルビー
export const START_RUBIES = 1;

// 鍋のマス：[お金, 点, ルビー]（0 がまん中。しずくは 0 から始まる）
export const TRACK = [
    [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0], [5, 0, 1], [6, 1, 0], [7, 1, 0], [8, 1, 0], [9, 1, 1],
    [10, 2, 0], [11, 2, 0], [12, 2, 0], [13, 2, 1], [14, 3, 0], [15, 3, 0], [15, 3, 1], [16, 3, 0], [16, 4, 0], [17, 4, 0],
    [17, 4, 1], [18, 4, 0], [18, 5, 0], [19, 5, 0], [19, 5, 1], [20, 5, 0], [20, 6, 0], [21, 6, 0], [21, 6, 1], [22, 7, 0],
    [22, 7, 1], [23, 7, 0], [23, 8, 0], [24, 8, 0], [24, 8, 1], [25, 9, 0], [25, 9, 1], [26, 9, 0], [26, 10, 0], [27, 10, 0],
    [27, 10, 1], [28, 11, 0], [28, 11, 1], [29, 11, 0], [29, 12, 0], [30, 12, 0], [30, 12, 1], [31, 12, 0], [31, 13, 0], [32, 13, 0],
    [32, 13, 1], [33, 14, 0], [33, 14, 1], [35, 15, 0]
];
export const space = (index) => {
    const [coins, points, ruby] = TRACK[Math.max(0, Math.min(LAST_SPACE, index))];
    return { coins, points, ruby: ruby === 1 };
};

// 得点の列のネズミのしっぽ。いちばん点の多い人との間にある数だけ、ネズミを前に置く
export const RAT_TAILS = [1, 3, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50];
export const ratTailsBetween = (mine, leader) => RAT_TAILS.filter(t => mine < t && t < leader).length;

// 材料。cost は値ごとの値段（白は売っていない）。from はその回から買える
export const INGREDIENTS = {
    W: { name: 'かんしゃく玉', short: '白', costs: {}, effect: '白の合計が7を超えると鍋が爆発します' },
    O: { name: 'カボチャ', short: '橙', costs: { 1: 3 }, effect: '効果はありません。ベニテングダケと相性がよい' },
    G: { name: 'クモ', short: '緑', costs: { 1: 4, 2: 8, 4: 14 }, effect: '最後か最後から2番目に置いたクモ1つにつき、ルビー1つ' },
    B: { name: 'カラス', short: '青', costs: { 1: 5, 2: 10, 4: 19 }, effect: '値の数だけ袋から引き、1つを鍋に置けます（残りは袋へ）' },
    R: { name: 'ベニテングダケ', short: '赤', costs: { 1: 6, 2: 10, 4: 16 }, effect: '鍋のカボチャが1〜2つなら1マス、3つ以上なら2マス余分に進みます' },
    Y: { name: 'マンドラゴラ', short: '黄', costs: { 1: 8, 2: 12, 4: 18 }, from: 2, effect: 'すぐ前が白なら、その白を袋に戻せます' },
    P: { name: 'ゴースト', short: '紫', costs: { 1: 9 }, from: 3, effect: '鍋の数で：1つは1点、2つは1点とルビー、3つ以上は2点としずく1マス' },
    K: { name: 'ドクロガ', short: '黒', costs: { 1: 10 }, effect: '両どなりと数を比べ、片方より多ければしずく1マス、両方より多ければルビーも' }
};
export const COLORS = Object.keys(INGREDIENTS);
export const BUYABLE = ['O', 'K', 'G', 'R', 'B', 'Y', 'P'];

// 'G2' のような材料の札
export const chipColor = (chip) => chip[0];
export const chipValue = (chip) => Number(chip.slice(1));
export const chipCost = (chip) => INGREDIENTS[chipColor(chip)]?.costs[chipValue(chip)] ?? null;
export const isChip = (chip) => typeof chip === 'string' && /^[WOGBRYPK][1-4]$/.test(chip)
    && (chipColor(chip) === 'W' ? [1, 2, 3].includes(chipValue(chip)) : chipCost(chip) !== null);
export const available = (chip, round) => chipCost(chip) !== null && (INGREDIENTS[chipColor(chip)].from ?? 1) <= round;
// 売り場の札（値段の安い順）
export const MARKET = BUYABLE.flatMap(c => Object.keys(INGREDIENTS[c].costs).map(v => `${c}${v}`));
// 次に大きい値（のみの市）
export const NEXT_VALUE = { 1: 2, 2: 4 };

export const START_BAG = ['W1', 'W1', 'W1', 'W1', 'W2', 'W2', 'W3', 'O1', 'G1'];

// ボーナスのサイコロ
export const DIE_FACES = ['vp1', 'vp1', 'vp2', 'ruby', 'droplet', 'pumpkin'];
export const DIE_LABELS = { vp1: '1点', vp2: '2点', ruby: 'ルビー', droplet: 'しずく1マス', pumpkin: 'カボチャ' };

// 占いカード24枚。round はその回のあいだ効くもの、now はすぐ起きるもの
export const FORTUNES = [
    { id: 'bubbling', kind: 'round', name: 'ぴったり7', text: '止めたとき白の合計がちょうど7なら、しずくを1マス進めます。' },
    { id: 'toil', kind: 'round', name: 'とばっちり', text: '鍋が爆発したら、左どなりの人が値2の材料を1つもらえます。' },
    { id: 'second', kind: 'round', name: 'やり直し', text: '最初の5つを置いたあと、一度だけ全部を袋に戻して最初から引き直せます。' },
    { id: 'double', kind: 'round', name: 'サイコロ2回', text: 'ボーナスのサイコロを振る人は2回振り、好きなほうを選べます。' },
    { id: 'portentous', kind: 'round', name: '丈夫な鍋', text: 'この回は、白の合計が9を超えるまで爆発しません。' },
    { id: 'pumpkin', kind: 'round', name: 'カボチャ祭り', text: 'この回は、カボチャがどれも1マス余分に進みます。' },
    { id: 'safety', kind: 'round', name: '念のため', text: '爆発せずに止めたら、袋から5つまで引き、1つを鍋に置けます。' },
    { id: 'lucky', kind: 'round', name: '幸運のルビー', text: '最後のマスにルビーがあれば、2点（爆発していても）。' },
    { id: 'rabbit', kind: 'round', name: 'フラスコうさぎ', text: '回の終わりに、全員のフラスコをただで満たします。' },
    { id: 'bubble', kind: 'round', name: 'ひと泡', text: '最初に引いた白を、袋に戻せます。' },
    { id: 'fire', kind: 'round', name: '燃えるルビー', text: '最後のマスにルビーがあれば、ルビーをもう1つ。' },
    { id: 'choices', kind: 'now', name: 'よりどりみどり', text: 'ドクロガ1つ・値2の材料1つ・ルビー3つから1つを選びます。' },
    { id: 'drop', kind: 'now', name: 'ひとしずく', text: 'しずくを1マス進めます。' },
    { id: 'wheeling', kind: 'now', name: '取り引き', text: 'ルビー1つを、値1の材料（ゴーストとドクロガを除く）と替えられます。' },
    { id: 'charity', kind: 'now', name: 'ほどこし', text: 'ルビーのいちばん少ない人が、ルビーを1つもらいます。' },
    { id: 'beginner', kind: 'now', name: 'ビギナーズラック', text: 'いちばん点の少ない人が、クモ1をもらいます。' },
    { id: 'boomberry', kind: 'now', name: 'お清め', text: '4点か、袋から白1を1つ取り除くかを選びます。' },
    { id: 'infestation', kind: 'now', name: 'ネズミの大群', text: 'ネズミのしっぽをもう一度数え、その分ネズミをさらに進めます。' },
    { id: 'less', kind: 'now', name: '少ないほうが', text: '全員が袋から5つ引きます。合計がいちばん小さい人はカラス2を、ほかの人はルビーを1つ。引いた材料は袋へ。' },
    { id: 'goodstart', kind: 'now', name: '出だし上々', text: 'ネズミを1〜3マス戻して、その数だけルビーをもらえます。' },
    { id: 'ratatat', kind: 'now', name: 'しっぽの数だけ', text: '値4の材料を1つか、いちばんの人との差のネズミのしっぽ1本につき1点かを選びます。' },
    { id: 'decisions', kind: 'now', name: '迷いどころ', text: 'しずくを2マス進めるか、ゴースト1つをもらうかを選びます。' },
    { id: 'chance', kind: 'now', name: '運だめし', text: '全員がボーナスのサイコロを1回振り、出た分をもらいます。' },
    { id: 'flea', kind: 'now', name: 'のみの市', text: '袋から4つ引き、1つを同じ色の1つ上の値と替えられます。替えられなければクモ1をもらいます。引いた材料は袋へ。' }
];
export const fortuneById = (id) => FORTUNES.find(card => card.id === id) ?? null;
