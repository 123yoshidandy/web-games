/**
 * 宝石の煌き デュエル（基本セット）のカード67枚と王族のカード4枚のデータ
 *
 * 公開されている3つの実装（GitHub の dylanguo1129/splendor-duel-ai の data/cards.json、
 * CGYGameDevelopment/Splendor-Duel の jewel-cards.csv・royal-cards.csv、ErronZrz/splendor-duel の cards.go）を
 * 照らし合わせて作った。食い違ったのは次の2点で、多数に従った
 * - 2段目の「1点・ボーナス2つ」の5枚：ボーナス2つ（cards.json・csv。cards.go はボーナスの数を持たない）
 * - 1段目の「王冠1・色を写す」カードのコスト：白4・パール1（cards.json・cards.go。csv は黒1が多い）
 */

export const COLORS = ['white', 'blue', 'green', 'red', 'black'];   // 宝石の5色（ボーナスの色）
export const PEARL = 'pearl';
export const GOLD = 'gold';
export const GEM_AND_PEARL = [...COLORS, PEARL];                     // 盤から取れるトークン（黄金以外）
export const TOKEN_COLORS = [...COLORS, PEARL, GOLD];
export const COLOR_NAMES = { white: '白', blue: '青', green: '緑', red: '赤', black: '黒', pearl: 'パール', gold: '黄金', wild: '色なし' };

// 能力：turn もう一度・token 同じ色のトークンを盤から取る・privilege 特権を得る・steal 相手から盗む
export const ABILITY_NAMES = { turn: 'もう一度', token: '同じ色を取る', privilege: '特権', steal: '盗む' };

// 段・色（wild は持っているボーナスの色を写す）・ボーナスの数・点・王冠・能力・コスト（白 青 緑 赤 黒 パール）
const ROWS = `
1 white 1 1 0 - 0 0 2 3 0 0
1 white 1 0 1 - 0 3 0 0 0 0
1 white 1 0 0 turn 0 2 2 0 0 1
1 white 1 0 0 token 0 0 0 2 2 0
1 white 1 0 0 - 0 1 1 1 1 0
1 blue 1 1 0 - 0 0 0 2 3 0
1 blue 1 0 1 - 0 0 3 0 0 0
1 blue 1 0 0 turn 0 0 2 2 0 1
1 blue 1 0 0 token 2 0 0 0 2 0
1 blue 1 0 0 - 1 0 1 1 1 0
1 green 1 1 0 - 3 0 0 0 2 0
1 green 1 0 1 - 0 0 0 3 0 0
1 green 1 0 0 turn 0 0 0 2 2 1
1 green 1 0 0 token 2 2 0 0 0 0
1 green 1 0 0 - 1 1 0 1 1 0
1 red 1 1 0 - 2 3 0 0 0 0
1 red 1 0 1 - 0 0 0 0 3 0
1 red 1 0 0 turn 2 0 0 0 2 1
1 red 1 0 0 token 0 2 2 0 0 0
1 red 1 0 0 - 1 1 1 0 1 0
1 black 1 1 0 - 0 2 3 0 0 0
1 black 1 0 1 - 3 0 0 0 0 0
1 black 1 0 0 turn 2 2 0 0 0 1
1 black 1 0 0 token 0 0 2 2 0 0
1 black 1 0 0 - 1 1 1 1 0 0
1 none 0 3 0 - 0 0 0 4 0 1
1 wild 1 1 0 - 2 0 2 0 1 1
1 wild 1 1 0 - 0 2 0 2 1 1
1 wild 1 1 0 - 0 0 0 0 4 1
1 wild 1 0 1 - 4 0 0 0 0 1
2 white 1 2 1 - 0 0 2 2 2 1
2 white 1 2 0 privilege 4 0 0 0 2 1
2 white 2 1 0 - 0 5 2 0 0 0
2 white 1 1 0 steal 0 4 0 3 0 0
2 blue 1 2 1 - 2 0 0 2 2 1
2 blue 1 2 0 privilege 2 4 0 0 0 1
2 blue 2 1 0 - 0 0 5 2 0 0
2 blue 1 1 0 steal 0 0 4 0 3 0
2 green 1 2 1 - 2 2 0 0 2 1
2 green 1 2 0 privilege 0 2 4 0 0 1
2 green 2 1 0 - 0 0 0 5 2 0
2 green 1 1 0 steal 3 0 0 4 0 0
2 red 1 2 1 - 2 2 2 0 0 1
2 red 1 2 0 privilege 0 0 2 4 0 1
2 red 2 1 0 - 2 0 0 0 5 0
2 red 1 1 0 steal 0 3 0 0 4 0
2 black 1 2 1 - 0 2 2 2 0 1
2 black 1 2 0 privilege 0 0 0 2 4 1
2 black 2 1 0 - 5 2 0 0 0 0
2 black 1 1 0 steal 4 0 3 0 0 0
2 none 0 5 0 - 0 6 0 0 0 1
2 wild 1 2 0 - 0 0 6 0 0 1
2 wild 1 0 2 - 0 0 6 0 0 1
2 wild 1 0 2 - 0 6 0 0 0 1
3 white 1 4 0 - 6 2 0 0 2 0
3 white 1 3 2 - 0 3 0 5 3 1
3 blue 1 4 0 - 2 6 2 0 0 0
3 blue 1 3 2 - 3 0 3 0 5 1
3 green 1 4 0 - 0 2 6 2 0 0
3 green 1 3 2 - 5 3 0 3 0 1
3 red 1 4 0 - 0 0 2 6 2 0
3 red 1 3 2 - 0 5 3 0 3 1
3 black 1 4 0 - 2 0 0 2 6 0
3 black 1 3 2 - 3 0 5 3 0 1
3 none 0 6 0 - 8 0 0 0 0 0
3 wild 1 0 3 - 0 0 0 0 8 0
3 wild 1 3 0 turn 0 0 0 8 0 0
`;

export const CARDS = ROWS.trim().split('\n').map((line, id) => {
    const [level, color, bonus, points, crowns, ability, ...cost] = line.trim().split(/\s+/);
    return {
        id,
        level: Number(level),
        color: color === 'none' ? null : color,     // null：ボーナスのないカード（点だけ）
        bonus: Number(bonus),
        points: Number(points),
        crowns: Number(crowns),
        ability: ability === '-' ? null : ability,
        cost: Object.fromEntries(GEM_AND_PEARL.map((c, i) => [c, Number(cost[i])]))
    };
});

// 王族のカード（王冠を3つ目・6つ目に得たときに1枚ずつ取る）
export const ROYALS = [
    { id: 0, points: 3, ability: null },
    { id: 1, points: 2, ability: 'turn' },
    { id: 2, points: 2, ability: 'steal' },
    { id: 3, points: 2, ability: 'privilege' }
];
