/**
 * お邪魔者（Saboteur）の基本ゲームのカードのデータ
 * 道のカードの形ごとの枚数は、Wikipedia の表（基本ゲーム）による。辺の番号は 1：上・2：右・3：下・4：左
 * c はつながった道、x は行き止まり（辺は開いているが、真ん中でふさがっている）
 */

// 方向：0 上・1 右・2 下・3 左
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const opposite = (d) => (d + 2) % 4;

// 辺の番号の文字列（'13' など）から、4方向の開閉にする
const edgesOf = (digits) => [1, 2, 3, 4].map(n => digits.includes(String(n)));

// [形, 枚数, つながっているか]
const PATH_SHAPES = [
    ['1', 1, false], ['4', 1, false],
    ['13', 4, true], ['24', 3, true], ['12', 4, true], ['14', 5, true],
    ['13', 1, false], ['24', 1, false], ['12', 1, false], ['14', 1, false],
    ['123', 5, true], ['234', 5, true],
    ['123', 1, false], ['234', 1, false],
    ['1234', 5, true], ['1234', 1, false]
];

export const TOOLS = ['pick', 'lamp', 'cart'];
export const TOOL_NAMES = { pick: 'つるはし', lamp: 'ランプ', cart: 'トロッコ' };

// 全部のカード（1ラウンドの山札）。id は配列の位置
export const CARDS = [];
PATH_SHAPES.forEach(([shape, count, connected]) => {
    for (let i = 0; i < count; i++) CARDS.push({ kind: 'path', shape, edges: edgesOf(shape), connected });
});
TOOLS.forEach(tool => { for (let i = 0; i < 3; i++) CARDS.push({ kind: 'break', tools: [tool] }); });
TOOLS.forEach(tool => { for (let i = 0; i < 2; i++) CARDS.push({ kind: 'repair', tools: [tool] }); });
[['pick', 'lamp'], ['pick', 'cart'], ['lamp', 'cart']].forEach(tools => CARDS.push({ kind: 'repair', tools }));
for (let i = 0; i < 6; i++) CARDS.push({ kind: 'map' });
for (let i = 0; i < 3; i++) CARDS.push({ kind: 'rockfall' });
CARDS.forEach((card, id) => { card.id = id; Object.freeze(card); });

// スタート（十字）と、ゴール3枚（金1枚は十字、石2枚は曲がり角）
export const START = Object.freeze({ kind: 'start', edges: edgesOf('1234'), connected: true });
export const GOAL_CARDS = Object.freeze([
    Object.freeze({ kind: 'goal', gold: true, edges: edgesOf('1234'), connected: true }),
    Object.freeze({ kind: 'goal', gold: false, edges: edgesOf('12'), connected: true }),
    Object.freeze({ kind: 'goal', gold: false, edges: edgesOf('14'), connected: true })
]);

// 盤面の配置：スタートは (0, 0)、ゴールはその8つ右の列に、上下に1マスあけて3枚
export const START_POS = [0, 0];
export const GOAL_POSITIONS = [[8, -2], [8, 0], [8, 2]];

// 人数ごとの役割（お邪魔者・金鉱掘り）と、手札の枚数
export const ROLES_BY_PLAYERS = { 3: [1, 3], 4: [1, 4], 5: [2, 4], 6: [2, 5], 7: [3, 5], 8: [3, 6], 9: [3, 7], 10: [4, 7] };
export const HAND_BY_PLAYERS = { 3: 6, 4: 6, 5: 6, 6: 5, 7: 5, 8: 4, 9: 4, 10: 4 };

// 金塊カード（1つ×16・2つ×8・3つ×4）
export const GOLD_CARDS = [...Array(16).fill(1), ...Array(8).fill(2), ...Array(4).fill(3)];
// お邪魔者が勝ったときの、1人あたりの金塊（お邪魔者の数ごと）
export const SABOTEUR_REWARD = { 1: 4, 2: 3, 3: 3, 4: 2 };
export const MAX_GOLD_DRAW = 9; // 金鉱掘りが勝ったときに引く金塊は人数ぶん。ただし9枚まで（3ラウンドで28枚に収めるため）

// 180度回すと、辺は向かい側に入れ替わる
export const rotateEdges = (edges, rotated) => (rotated ? edges.map((_, d) => edges[opposite(d)]) : [...edges]);
