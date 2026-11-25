/**
 * 役割と行動のデータ（基本ゲーム）
 */

export const ROLES = {
    duke: { name: '公爵', color: '#8a4fb8', text: '税：3コインを得る。援助をブロックする' },
    assassin: { name: '暗殺者', color: '#3b3f4a', text: '暗殺：3コインを払い、1人の影響力を1つ失わせる' },
    ambassador: { name: '大使', color: '#3a9a63', text: '交換：山から2枚引き、手札と入れ替えて2枚戻す。強奪をブロックする' },
    captain: { name: '船長', color: '#2f74c0', text: '強奪：1人から2コインを奪う。強奪をブロックする' },
    contessa: { name: '伯爵夫人', color: '#c8433a', text: '暗殺をブロックする' }
};

export const ROLE_ORDER = Object.keys(ROLES);
export const COPIES = 3;

// claim：名乗る役割 / cost：払うコイン / target：相手を選ぶか / blockers：ブロックできる役割 / anyone：だれでもブロックできるか
export const ACTIONS = {
    income: { name: '収入', claim: null, cost: 0, target: false, blockers: [], text: '1コインを得る' },
    foreignAid: { name: '援助', claim: null, cost: 0, target: false, blockers: ['duke'], anyone: true, text: '2コインを得る' },
    coup: { name: 'クー', claim: null, cost: 7, target: true, blockers: [], text: '7コインを払い、1人の影響力を1つ失わせる。防げない' },
    tax: { name: '税', claim: 'duke', cost: 0, target: false, blockers: [], text: '3コインを得る' },
    assassinate: { name: '暗殺', claim: 'assassin', cost: 3, target: true, blockers: ['contessa'], text: '3コインを払い、1人の影響力を1つ失わせる' },
    steal: { name: '強奪', claim: 'captain', cost: 0, target: true, blockers: ['captain', 'ambassador'], text: '1人から2コインを奪う' },
    exchange: { name: '交換', claim: 'ambassador', cost: 0, target: false, blockers: [], text: '山から2枚引き、2枚戻す' }
};

export const ACTION_ORDER = Object.keys(ACTIONS);

export const STARTING_COINS = 2;
export const MUST_COUP = 10;
