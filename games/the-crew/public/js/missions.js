/**
 * カードと、航海日誌の50のミッション
 *
 * ミッションのデータの出典：公式の航海日誌（英語版 The Crew: The Quest for Planet Nine Log Book）。
 * 課題の数は PDF の文字の層とページの画像の2通りで、順番のトークンはページの画像と画像の個数の2通りで読み取り、一致を確かめた。
 * 決まりは公式のルールブック（英語版）に合わせる。
 *
 * ミッションの項目
 *   tasks：課題の数（0 は課題を使わない）
 *   tokens：順番のトークン（'1'〜'5'、'>'〜'>>>>'、'omega'）。左から課題に割り当てる
 *   assign：'pick'（指揮官から順に1枚ずつ取る）/ 'decision'（指揮官の決定：1人に全部）/ 'distribution'（指揮官の配分）
 *   comm：通信の制限。{ deadSpot: true }（不感地帯）/ { from: n }（n 番目のトリックから）/ { silenced: true }（指揮官が選んだ1人は通信できない）
 *   special：特別な条件（下の SPECIALS）
 */

export const SUITS = ['pink', 'yellow', 'blue', 'green'];
export const ROCKET = 'rocket';
export const SUIT_NAMES = { pink: '桃', yellow: '黄', blue: '青', green: '緑', rocket: 'ロケット' };

// カードの id：'pink5'、'rocket4' など
export const cardId = (suit, rank) => `${suit}${rank}`;
export const parseCard = id => {
    const m = /^([a-z]+)(\d)$/.exec(id);
    return { suit: m[1], rank: Number(m[2]) };
};
export const ALL_CARDS = [
    ...SUITS.flatMap(suit => [1, 2, 3, 4, 5, 6, 7, 8, 9].map(rank => cardId(suit, rank))),
    ...[1, 2, 3, 4].map(rank => cardId(ROCKET, rank))
];
// 課題カードは色のカード36枚と同じもの
export const TASK_CARDS = ALL_CARDS.filter(id => parseCard(id).suit !== ROCKET);

export const TOKEN_NAMES = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', '>': '›', '>>': '››', '>>>': '›››', '>>>>': '››››', omega: 'Ω' };

const m = (tasks, extra = {}) => ({ tasks, tokens: [], assign: 'pick', comm: null, special: null, ...extra });

export const MISSIONS = {
    1: m(1),
    2: m(2),
    3: m(2, { tokens: ['1', '2'] }),
    4: m(3),
    5: m(0, { special: { kind: 'sick' } }),
    6: m(3, { tokens: ['>', '>>'], comm: { deadSpot: true } }),
    7: m(3, { tokens: ['omega'] }),
    8: m(3, { tokens: ['1', '2', '3'] }),
    9: m(0, { special: { kind: 'winWithOnes', count: 1 } }),
    10: m(4),
    11: m(4, { tokens: ['1'], comm: { silenced: true } }),
    12: m(4, { tokens: ['omega'], special: { kind: 'stealAfterFirst' } }),
    13: m(0, { special: { kind: 'rocketsWin', ordered: false } }),
    14: m(4, { tokens: ['>', '>>', '>>>'], comm: { deadSpot: true } }),
    15: m(4, { tokens: ['1', '2', '3', '4'] }),
    16: m(0, { special: { kind: 'noNines' } }),
    17: m(2, { special: { kind: 'noNines' } }),
    18: m(5, { comm: { from: 2 } }),
    19: m(5, { tokens: ['1'], comm: { from: 3 } }),
    20: m(2, { assign: 'decision' }),
    21: m(5, { tokens: ['1', '2'], comm: { deadSpot: true } }),
    22: m(5, { tokens: ['>', '>>', '>>>', '>>>>'] }),
    23: m(5, { tokens: ['1', '2', '3', '4', '5'], special: { kind: 'swapTokens' } }),
    24: m(6, { assign: 'distribution' }),
    25: m(6, { tokens: ['>', '>>'], comm: { deadSpot: true } }),
    26: m(0, { special: { kind: 'winWithOnes', count: 2 } }),
    27: m(3, { assign: 'decision' }),
    28: m(6, { tokens: ['1', 'omega'], comm: { from: 3 } }),
    29: m(0, { special: { kind: 'balance' }, comm: { deadSpot: true } }),
    30: m(6, { tokens: ['>', '>>', '>>>'], comm: { from: 2 } }),
    31: m(6, { tokens: ['1', '2', '3'] }),
    32: m(7, { assign: 'distribution' }),
    33: m(0, { special: { kind: 'exactlyOne' } }),
    34: m(0, { special: { kind: 'balance', commanderFirstLast: true } }),
    35: m(7, { tokens: ['>', '>>', '>>>'] }),
    36: m(7, { tokens: ['1', '2'], assign: 'distribution' }),
    37: m(4, { assign: 'decision' }),
    38: m(8, { comm: { from: 3 } }),
    39: m(8, { tokens: ['>', '>>', '>>>'], comm: { deadSpot: true } }),
    40: m(8, { tokens: ['1', '2', '3'], special: { kind: 'moveToken' } }),
    41: m(0, { special: { kind: 'firstAndLast' } }),
    42: m(9),
    43: m(9, { assign: 'distribution' }),
    44: m(0, { special: { kind: 'rocketsWin', ordered: true } }),
    45: m(9, { tokens: ['>', '>>', '>>>'] }),
    46: m(0, { special: { kind: 'pinkLeftOfNine' } }),
    47: m(10),
    48: m(3, { tokens: ['omega'], special: { kind: 'omegaLastTrick' } }),
    49: m(10, { tokens: ['>', '>>', '>>>'] }),
    50: m(0, { special: { kind: 'roles' } })
};

// 特別な条件の短い説明（画面用）
export const SPECIAL_TEXT = {
    sick: '指揮官が「具合が悪い」1人を決める。その人は1トリックも取らない',
    winWithOnes: count => count === 1 ? '色の1のカードで、トリックを1つ取る' : '色の1のカード2枚で、それぞれトリックを1つずつ取る',
    stealAfterFirst: '1トリック目のあと、全員が右の人の手札から1枚を引く',
    rocketsWin: ordered => ordered ? 'ロケットの1・2・3・4の順に、それぞれでトリックを取る' : 'ロケットの4枚それぞれで、トリックを1つずつ取る',
    noNines: '9のカードでトリックを取らない',
    swapTokens: '課題を選ぶ前に、順番のトークン2つの位置を入れ替えてよい',
    balance: '取ったトリックの数で、2つ以上の差がつかないこと',
    commanderFirstLast: '指揮官が最初と最後のトリックを取る',
    exactlyOne: '指揮官が選んだ1人が、ロケット以外でちょうど1トリックだけ取る',
    moveToken: '課題を選ぶ前に、順番のトークン1つを、トークンのない課題へ動かしてよい',
    firstAndLast: '指揮官が選んだ1人が、最初と最後のトリックだけを取る（どちらもロケット以外で）',
    pinkLeftOfNine: '桃の9を持つ人の左の人が、桃のカードをすべて取る',
    omegaLastTrick: 'Ω の課題は、最後のトリックで果たす',
    roles: '1人が最初の4トリック、別の1人が最後のトリック、残りの人がその間のトリックをすべて取る'
};

export const COMM_TEXT = {
    deadSpot: '不感地帯：通信のトークンを置かない（一番上・唯一・一番下のどれかは伝わらない）',
    silenced: '指揮官が選んだ1人は、このミッションで通信できない',
    from: n => `${n}番目のトリックの前から通信できる`
};

export const ASSIGN_TEXT = {
    decision: '指揮官の決定：はい・いいえを聞いて、指揮官以外の1人がすべての課題を受け持つ',
    distribution: '指揮官の配分：課題を1枚ずつ、はい・いいえを聞いて配る（2枚以上の差がつかないように）'
};

// 5人のとき、ミッション25以降（と27・37）は、最初のトリックの前に課題を1枚ほかの人へ渡せる
export const handoverAllowed = (mission, players) => players === 5 && MISSIONS[mission].tasks > 0 && (mission >= 25 || mission === 27 || mission === 37);
