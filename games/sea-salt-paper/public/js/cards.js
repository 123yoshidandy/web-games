/**
 * シーソルト＆ペーパーのカード（基本ゲーム 58枚）と色
 *
 * 種類ごとの枚数はルールブックのとおり。カードごとの色は、次の2つで照らし合わせた
 * - 実装のカードのデータ（github.com/th0bo/sea-salt-paper の src/game/deck.ts）
 * - 箱の色の一覧のカードの、色ごとの枚数（github.com/JFrusher/SSAP の COLOR_COMPOSITION）
 *   紺9・水色9・黄8・黒8・黄緑6・白4・紫4・灰4・薄橙3・桃2・橙1。上のデータの色を数えると、すべて一致する
 *
 * カードの形：{ id, type, color }
 */

// 種類。group：duo（2枚組）・collect（収集）・multi（倍率）・mermaid（人魚）
export const TYPES = {
    crab: { name: 'カニ', group: 'duo', count: 9 },
    boat: { name: 'ボート', group: 'duo', count: 8 },
    fish: { name: '魚', group: 'duo', count: 7 },
    swimmer: { name: '泳ぐ人', group: 'duo', count: 5 },
    shark: { name: 'サメ', group: 'duo', count: 5 },
    shell: { name: '貝', group: 'collect', count: 6 },
    octopus: { name: 'タコ', group: 'collect', count: 5 },
    penguin: { name: 'ペンギン', group: 'collect', count: 3 },
    sailor: { name: '船乗り', group: 'collect', count: 2 },
    lighthouse: { name: '灯台', group: 'multi', count: 1 },
    shoal: { name: '魚の群れ', group: 'multi', count: 1 },
    colony: { name: 'ペンギンの群れ', group: 'multi', count: 1 },
    captain: { name: '船長', group: 'multi', count: 1 },
    mermaid: { name: '人魚', group: 'mermaid', count: 4 }
};

export const TYPE_ORDER = Object.keys(TYPES);

// 色。white は人魚だけの色で、色の得点（色のボーナス・人魚）には数えない
export const COLORS = ['darkBlue', 'lightBlue', 'black', 'yellow', 'green', 'purple', 'grey', 'lightOrange', 'pink', 'orange', 'white'];
export const SCORING_COLORS = COLORS.filter(c => c !== 'white');
export const COLOR_NAMES = {
    darkBlue: '紺', lightBlue: '水色', black: '黒', yellow: '黄', green: '黄緑', purple: '紫',
    grey: '灰', lightOrange: '薄橙', pink: '桃', orange: '橙', white: '白'
};

// 2枚組の効果を出せる組み合わせ（どちらの順でもよい）
export const DUO_PAIRS = [['crab', 'crab'], ['boat', 'boat'], ['fish', 'fish'], ['swimmer', 'shark']];
export const DUO_EFFECTS = { crab: 'crab', boat: 'boat', fish: 'fish', swimmer: 'steal', shark: 'steal' };

// 収集の点（枚数ごと）
export const COLLECT_POINTS = {
    shell: [0, 0, 2, 4, 6, 8, 10],
    octopus: [0, 0, 3, 6, 9, 12],
    penguin: [0, 1, 3, 5],
    sailor: [0, 0, 5]
};

// 倍率のカード：数える種類と、1枚あたりの点
export const MULTIPLIERS = {
    lighthouse: { of: 'boat', each: 1 },
    shoal: { of: 'fish', each: 1 },
    colony: { of: 'penguin', each: 2 },
    captain: { of: 'sailor', each: 3 }
};

const C = {
    crab: ['darkBlue', 'darkBlue', 'lightBlue', 'lightBlue', 'black', 'yellow', 'yellow', 'green', 'grey'],
    boat: ['darkBlue', 'darkBlue', 'lightBlue', 'lightBlue', 'black', 'black', 'yellow', 'yellow'],
    fish: ['darkBlue', 'darkBlue', 'lightBlue', 'black', 'black', 'yellow', 'green'],
    swimmer: ['darkBlue', 'lightBlue', 'black', 'yellow', 'lightOrange'],
    shark: ['darkBlue', 'lightBlue', 'black', 'green', 'purple'],
    shell: ['darkBlue', 'lightBlue', 'black', 'yellow', 'green', 'grey'],
    octopus: ['lightBlue', 'yellow', 'green', 'purple', 'grey'],
    penguin: ['purple', 'lightOrange', 'pink'],
    sailor: ['pink', 'orange'],
    lighthouse: ['purple'],
    shoal: ['grey'],
    colony: ['green'],
    captain: ['lightOrange'],
    mermaid: ['white', 'white', 'white', 'white']
};

export const CARDS = TYPE_ORDER.flatMap(type => C[type].map(color => ({ type, color })))
    .map((card, id) => ({ id, ...card }));

export const DECK_SIZE = CARDS.length; // 58
