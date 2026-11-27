/**
 * ゴーストストーリーズのデータ（色・村のタイル・幽霊・難易度・盤の形）
 * 名前と文章は、このゲームのために言い換えたもの
 */

// 色：0 赤・1 黄・2 緑・3 青（4人の僧の色）・4 黒（黒い幽霊と魔王）
export const COLORS = ['red', 'yellow', 'green', 'blue', 'black'];
export const COLOR_NAMES = ['赤', '黄', '緑', '青', '黒'];
export const BLACK = 4;
// 道のダイス（タオのダイス）の面：赤・黄・緑・青・黒・白（白はどの色にもなる）
export const WHITE = 5;
export const DIE_FACES = [0, 1, 2, 3, 4, 5];

export const MONKS = 4;          // 僧はいつも4人（人が受け持たない僧は CPU）
export const MAX_QI = 4;
export const HAUNT_LIMIT = 3;    // 呪われたタイルがこの数になると負け
export const BASE_DICE = 3;
export const BUDDHAS = 2;

// 僧の力（色ごとに1つ）
export const POWERS = [
    { key: 'peaks', name: '峰渡り', text: '移動のとき、どのタイルへも飛べる' },
    { key: 'pockets', name: '底なしの袋', text: '茶屋・薬草屋で道の札を得るとき、好きな色の札をもう1枚得る' },
    { key: 'heaven', name: '天の息吹', text: '除霊のダイスを1つ多く振る' },
    { key: 'mantra', name: '真言', text: '自分の番に1回、真言の札を幽霊に置ける（抵抗が1下がる。除霊されたら戻る）' }
];

// 村のタイル（9枚。並びは毎回シャッフルする）
export const TILES = [
    { key: 'tea', name: '茶屋', short: '茶屋', text: '気を1つ回復し、好きな色の道の札を1枚得る' },
    { key: 'herb', name: '薬草屋', short: '薬草', text: '道のダイスを2つ振り、出た色の札を得る（白は自分の色）' },
    { key: 'sorcerer', name: '呪術師の庵', short: '呪術', text: '気を1つ払い、どこかの幽霊を1体祓う（魔王は祓えない。ごほうびなし）' },
    { key: 'prayer', name: '祈りの輪', short: '祈り', text: '色を1つ選ぶ。その色の幽霊の抵抗が1下がる（このタイルが呪われていない間）' },
    { key: 'temple', name: '仏堂', short: '仏堂', text: '仏像を1体受け取る。あとで、自分のいるタイルに向いた空きの場所に置ける' },
    { key: 'pavilion', name: '風の楼閣', short: '楼閣', text: '僧を1人（自分でもよい）、どのタイルへでも動かす' },
    { key: 'cemetery', name: '墓所', short: '墓所', text: '倒れた僧を1人、気2つでこのタイルに呼び戻す' },
    { key: 'altar', name: '道士の祭壇', short: '祭壇', text: '幽霊の山の一番上をめくる。ふつうの幽霊なら祓い、魔王なら盤に出す' },
    { key: 'watch', name: '夜回りの番所', short: '番所', text: '呪われたタイルを1枚、元に戻す' }
];
export const TILE_INDEX = Object.fromEntries(TILES.map((t, i) => [t.key, i]));

// 幽霊の効果
//   arrive（来たとき）：haunter 憑き手を置く・summon もう1体呼ぶ・curse 呪いのダイス・drain 手番の僧の気を1つ奪う
//                     capture 道のダイスを1つ奪う（いる間ずっと）・block このボードの僧の力を封じる（いる間ずっと）
//   yin（このボードの僧の陰の段階ごと）：haunt 憑き手が進む・curse・summon・drain
//   reward（祓ったとき）：qi 気を1つ・tao その色の道の札を1枚・unhaunt 呪われたタイルを1枚戻す
export const EFFECT_TEXT = {
    haunter: '憑き手が村へ向かう',
    summon: 'もう1体の幽霊を呼ぶ',
    curse: '呪いのダイスを振る',
    drain: '手番の僧の気を1つ奪う',
    capture: '道のダイスを1つ奪う（いる間）',
    block: 'このボードの僧の力を封じる（いる間）',
    haunt: '憑き手が1歩進む',
    qi: '気を1つ得る',
    tao: 'この色の道の札を1枚得る',
    unhaunt: '呪われたタイルを1枚戻す'
};

const NAMES = [
    ['鬼火', '火吹き童子', '赤面', '火車', '炎の舌', '灼け首', '紅の影', '焔の大鬼'],
    ['砂かけ', '黄泉の犬', '金の亡者', '雷獣', '蝗の群れ', '黄衣の僧', '稲妻の影', '金色の大蛇'],
    ['木霊', '苔の亡者', '竹の精', '毒の霧', '蔦の手', '翠の狐', '森の老婆', '樹の大鬼'],
    ['水死人', '雨女', '氷の影', '霧の舟', '青坊主', '海坊主', '淵の主', '蒼の大龍'],
    ['影法師', '疫病神', '骸骨武者', '夜叉', '牛鬼', '黒い僧', '闇の手', '屍の王']
];

// 色の幽霊（赤・黄・緑・青で同じ並び）
const COLORED = [
    { res: 1, arrive: [], yin: [], reward: ['tao'] },
    { res: 1, arrive: ['haunter'], yin: ['haunt'], reward: ['qi'] },
    { res: 1, arrive: [], yin: ['curse'], reward: ['tao'] },
    { res: 2, arrive: [], yin: [], reward: ['tao'] },
    { res: 2, arrive: ['capture'], yin: [], reward: ['qi'] },
    { res: 2, arrive: ['haunter'], yin: ['haunt'], reward: ['unhaunt'] },
    { res: 2, arrive: ['summon'], yin: [], reward: ['tao', 'qi'] },
    { res: 3, arrive: ['haunter'], yin: ['haunt'], reward: ['unhaunt', 'tao'] }
];
// 黒い幽霊
const DARK = [
    { res: 1, arrive: ['curse'], yin: [], reward: [] },
    { res: 1, arrive: [], yin: ['drain'], reward: [] },
    { res: 2, arrive: [], yin: ['curse'], reward: ['tao'] },
    { res: 2, arrive: ['block', 'haunter'], yin: ['haunt'], reward: ['qi'] },
    { res: 2, arrive: ['drain'], yin: ['drain'], reward: ['qi'] },
    { res: 2, arrive: ['summon'], yin: [], reward: ['tao'] },
    { res: 3, arrive: ['capture'], yin: ['curse'], reward: ['tao'] },
    { res: 3, arrive: ['haunter'], yin: ['haunt', 'curse'], reward: ['unhaunt'] }
];

export const GHOSTS = [];
for (let color = 0; color < 5; color++) {
    (color === BLACK ? DARK : COLORED).forEach((spec, i) => {
        GHOSTS.push({ id: GHOSTS.length, name: NAMES[color][i], color, ...spec, incarnation: false });
    });
}
// 魔王ウー・フェンの化身（山の底の近くに1枚だけ入れる）
export const INCARNATIONS = [
    { key: 'shade', name: '魔王の化身・影', color: BLACK, res: 3, arrive: ['summon'], yin: ['curse'], reward: [] },
    { key: 'thousand', name: '魔王の化身・千の顔', color: BLACK, res: 4, arrive: [], yin: ['summon'], reward: [] },
    { key: 'devourer', name: '魔王の化身・夜喰らい', color: BLACK, res: 4, arrive: ['capture'], yin: ['curse', 'drain'], reward: [] }
];
INCARNATIONS.forEach(spec => GHOSTS.push({ id: GHOSTS.length, ...spec, incarnation: true }));
export const ghostOf = (id) => GHOSTS[id];
export const REGULAR_GHOSTS = GHOSTS.filter(g => !g.incarnation).map(g => g.id);

// 難易度
//   deck：ふつうの幽霊の枚数、below：魔王の下に入れる枚数、qi：はじめの気、tao：はじめの道の札（own 自分の色・black 黒）
export const LEVELS = {
    initiation: { name: '入門', deck: 30, below: 7, qi: 4, tao: { own: 1, black: 1 }, incarnations: ['shade'] },
    normal: { name: '標準', deck: 36, below: 9, qi: 4, tao: { own: 1, black: 0 }, incarnations: ['shade', 'thousand'] },
    nightmare: { name: '悪夢', deck: 40, below: 10, qi: 3, tao: { own: 0, black: 0 }, incarnations: ['devourer'] }
};

// ---- 盤の形 ----
// 村は 3×3（0〜8、左上から行ごと）。ボード b（= 僧 b）は 0 下・1 左・2 上・3 右に置く
// 置き場 s = b*3 + k。LINES[s] は、その置き場の前に並ぶタイル（近い順）
export const SIDES = ['bottom', 'left', 'top', 'right'];
export const LINES = [];
for (let b = 0; b < 4; b++) {
    for (let k = 0; k < 3; k++) {
        if (b === 0) LINES.push([6 + k, 3 + k, k]);
        else if (b === 1) LINES.push([3 * k, 3 * k + 1, 3 * k + 2]);
        else if (b === 2) LINES.push([k, 3 + k, 6 + k]);
        else LINES.push([3 * k + 2, 3 * k + 1, 3 * k]);
    }
}
export const SLOTS = 12;
export const boardOf = (slot) => Math.floor(slot / 3);
// タイルに向いている置き場（角は2つ、辺は1つ、真ん中はなし）
export const FACING = Array.from({ length: 9 }, (_, t) => LINES.map((line, s) => (line[0] === t ? s : -1)).filter(s => s >= 0));
export const CENTER = 4;
export const tileDistance = (a, b) => Math.max(Math.abs((a % 3) - (b % 3)), Math.abs(Math.floor(a / 3) - Math.floor(b / 3)));
