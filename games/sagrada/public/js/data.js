/**
 * サグラダ（基本ゲーム）のデータ：色、窓枠24枚、道具12枚、公共の目標10枚
 * 窓枠の並びと表裏の組、道具の色は README の「資料」に出典を書いた
 */

export const COLORS = ['red', 'yellow', 'green', 'blue', 'purple'];
export const COLOR_INFO = {
    red: { name: '赤', code: 'R', hex: '#c8463d' },
    yellow: { name: '黄', code: 'Y', hex: '#e5b43a' },
    green: { name: '緑', code: 'G', hex: '#4e9a5c' },
    blue: { name: '青', code: 'B', hex: '#3e6fb3' },
    purple: { name: '紫', code: 'P', hex: '#8b56a6' }
};
const CODE_TO_COLOR = Object.fromEntries(COLORS.map(c => [COLOR_INFO[c].code, c]));

export const ROWS = 4;
export const COLS = 5;
export const CELLS = ROWS * COLS;
export const ROUNDS = 10;
export const DICE_PER_COLOR = 18;

// ---- 窓枠（4行×5列。_ は制約なし、色の文字は色、数字は目） ----
// card：表裏の組の番号（同じ番号の2枚が1枚のカードの表と裏）
const PATTERN_ROWS = [
    ["Sun's Glory", 6, 1, '1PY_4PY__6Y__53_5421'],
    ['Firelight', 5, 1, '3415__62_Y___YR5_YR6'],
    ['Shadow Thief', 5, 2, '6P__55_P__R6_P_YR543'],
    ['Sun Catcher', 3, 2, '_B2_Y_4_R___5Y_G3__P'],
    ['Fulgor del Cielo', 5, 3, '_BR___45_BB2_R56R31_'],
    ['Luz Celestial', 3, 3, '__R5_P4_G36__B__Y2__'],
    ['Aurora Sagradis', 4, 4, 'R_B_Y4P3G2_1_5___6__'],
    ['Aurorae Magnificus', 5, 4, '5GBP2P___YY_6_P1__G4'],
    ['Lux Mundi', 6, 5, '__1__1G3B2B546G_B5G_'],
    ['Lux Astram', 5, 5, '_1GP46P25G1G53P_____'],
    ['Kaleidoscopic Dream', 4, 6, 'YB__1G_5_43_R_G2__BY'],
    ['Firmitas', 5, 6, 'P6__35P3___2P1__15P4'],
    ['Gravitas', 5, 7, '1_3B__2B__6B_4_B52_1'],
    ['Water of Life', 6, 7, '6B__1_5B__4R2B_G6Y3P'],
    ['Batllo', 5, 8, '__6___5B4_3GYP214R53'],
    ['Bellesguard', 3, 8, 'B6__Y_3B___562__4_1G'],
    ['Virtus', 5, 9, '4_25G__6G2_3G4_5G1__'],
    ['Symphony of Light', 6, 9, '2_5_1Y6P2R_B4G__3_5_'],
    ['Ripples of Light', 5, 10, '___R5__P4B_B3Y6Y2G1R'],
    ['Fractal Drops', 3, 10, '_4_Y6R_2____RP1BY___'],
    ['Via Lux', 4, 11, 'Y_6___15_23YRP___43R'],
    ['Industria', 5, 11, '1R3_654R2___5R1___3R'],
    ['Chromatic Splendor', 4, 12, '__G__2Y5B1_R3P_1_6_4'],
    ['Comitas', 5, 12, 'Y_2_6_4_5Y___Y512Y3_']
];

// cells[i] = null（制約なし）か { color } か { value }。i = 行 × 5 + 列
export const PATTERNS = PATTERN_ROWS.map(([name, difficulty, card, text], id) => ({
    id, name, difficulty, card,
    cells: [...text].map(ch => (ch === '_' ? null : (/[1-6]/.test(ch) ? { value: Number(ch) } : { color: CODE_TO_COLOR[ch] })))
}));
export const PATTERN_CARDS = [...new Set(PATTERNS.map(p => p.card))];

// ---- 道具（12枚） ----
// color：1人用で使うときに払うダイスの色
export const TOOLS = {
    grozing: { name: 'やっとこ', color: 'purple', text: '選んだダイスの目を1つ増やすか減らす（1を6に、6を1にはできない）' },
    eglomise: { name: 'ガラス絵の筆', color: 'blue', text: '窓のダイス1個を、色の制約を無視して動かす（ほかの決まりは守る）' },
    copper: { name: '銅箔のへら', color: 'red', text: '窓のダイス1個を、目の制約を無視して動かす（ほかの決まりは守る）' },
    lathekin: { name: '鉛線のへら', color: 'yellow', text: '窓のダイスをちょうど2個、決まりを守って動かす' },
    lens: { name: 'レンズカッター', color: 'green', text: '選んだダイスを、ラウンドトラックのダイスと入れ替える' },
    fluxBrush: { name: 'フラックスの刷毛', color: 'purple', text: '選んだダイスを振り直す。置けなければプールに戻す' },
    glazing: { name: '艶出しの槌', color: 'blue', text: 'プールのダイスを全部振り直す（その手番で選ぶ前、2回目の手番だけ）' },
    running: { name: '続けざまのやっとこ', color: 'red', text: '1回目の手番で選んだあと、すぐにもう1個選ぶ。このラウンドの2回目の手番はない' },
    cork: { name: 'コルクの定規', color: 'yellow', text: '選んだダイスを、ほかのダイスと接しないマスに置く（ほかの決まりは守る）' },
    grinding: { name: '砥石', color: 'green', text: '選んだダイスを裏返す（6と1、5と2、4と3）' },
    fluxRemover: { name: 'フラックス落とし', color: 'purple', text: '選んだダイスを袋に戻し、1個を引いて目を選んで置く（置かなければプールへ）' },
    tapWheel: { name: 'タップホイール', color: 'blue', text: 'ラウンドトラックにある色のダイスを、同じ色どうしで2個まで、決まりを守って動かす' }
};
export const TOOL_IDS = Object.keys(TOOLS);

// ---- 公共の目標（10枚） ----
export const OBJECTIVES = {
    rowColor: { name: '行の色違い', points: 6, text: '同じ色のない行（埋まった行だけ）' },
    colColor: { name: '列の色違い', points: 5, text: '同じ色のない列（埋まった列だけ）' },
    rowShade: { name: '行の目違い', points: 5, text: '同じ目のない行（埋まった行だけ）' },
    colShade: { name: '列の目違い', points: 4, text: '同じ目のない列（埋まった列だけ）' },
    light: { name: '淡い色合い', points: 2, text: '1と2の組（どこでも）' },
    medium: { name: '中くらいの色合い', points: 2, text: '3と4の組（どこでも）' },
    deep: { name: '深い色合い', points: 2, text: '5と6の組（どこでも）' },
    shadeVariety: { name: '目の揃い', points: 5, text: '1〜6が1つずつの組（どこでも）' },
    colorVariety: { name: '色の揃い', points: 4, text: '5色が1つずつの組（どこでも）' },
    diagonals: { name: '色の斜め', points: 1, text: '斜めに同じ色と接するダイス1個につき1点' }
};
export const OBJECTIVE_IDS = Object.keys(OBJECTIVES);

// 1人用：道具の枚数（1〜5。多いほどやさしい）
export const SOLO_TOOL_COUNTS = [1, 2, 3, 4, 5];
export const SOLO_DICE = 4;
export const SOLO_OPEN_PENALTY = 3;
