/**
 * 組み込みの戦術（CPU）。どれもエディタで作れる形のルールで書いてある（写して直せる）
 * やさしい＝random、ふつう＝sample、つよい＝kazuki.main は、原作の JS の戦術3本をルールに書き直したもの
 * 守りは、ルールで足した型（ロケット砲とミサイルで中央を守り、お金がたまったら戦車で守った歩兵を送る）
 */

import { defaultArms, normalizeTactic } from './rules.js';

const arms = (changes = {}) => {
    const base = defaultArms();
    for (const [type, change] of Object.entries(changes)) {
        base[type] = { ...base[type], ...change, retreat: { ...base[type].retreat, ...(change.retreat ?? {}) } };
    }
    return base;
};
const line = (when, act, wait = 0) => ({ on: true, when, act, wait });
const save = { k: 'save' };
const spawn = (unit, at) => ({ k: 'spawn', unit, at });
const money = (op, n) => ({ k: 'money', op, n });
const threat = (cls, dist, unless = []) => ({ k: 'threat', cls, dist, unless });
const chance = (n) => ({ k: 'chance', n });
const row = (types, ys) => types.map((type, i) => ({ type, y: ys[i] }));
const EDGES = [0, 7, 14, 21, 79, 86, 93, 100];
const CORNERS = [0, 7, 93, 100];

const RAW = {
    random: {
        name: 'ランダム',
        rules: [
            line([money('lt', 2000)], save),
            line([{ k: 'always' }], spawn('random', 'random'))
        ],
        arms: arms()
    },
    sample: {
        name: 'サンプル',
        rules: [
            line([money('lt', 4000)], save),
            line([threat('air', 100, ['missile'])], spawn('missile', 'target')),
            line([threat('ground', 100, ['tank'])], spawn('tank', 'target')),
            line([chance(10)], spawn('random', 'random')),
            line([chance(20)], spawn('infantry', 'random'))
        ],
        arms: arms()
    },
    kazuki: {
        name: 'カズキ',
        rules: [
            line([money('lt', 2000)], save),
            line([threat('air', 50, ['missile'])], spawn('missile', 'target')),
            line([threat('ground', 50, ['tank', 'attacker']), { k: 'near', cls: 'antiAir', has: true }], spawn('tank', 'target')),
            line([threat('ground', 50, ['tank', 'attacker'])], spawn('attacker', 'target')),
            line([money('ge', 10500), chance(60)], { k: 'formation', i: 0 }),
            line([money('ge', 10500), chance(50)], { k: 'formation', i: 1 }),
            line([money('ge', 10500)], { k: 'formation', i: 2 })
        ],
        arms: arms({
            tank: { keepFrom: 'attacker', keepDist: 60 },
            rocket: { keepFrom: 'ground', keepDist: 60 },
            attacker: { keepFrom: 'antiAir', keepDist: 60, retreat: { noTarget: true } },
            missile: { retreat: { noTarget: true } },
            fighter: { retreat: { noTarget: true } }
        }),
        formations: [
            row(['tank', 'rocket', 'tank', 'rocket', 'rocket', 'tank', 'rocket', 'tank'], EDGES),
            row(['missile', 'missile', 'missile', 'missile'], CORNERS),
            row(['infantry', 'infantry', 'infantry', 'infantry'], CORNERS)
        ]
    },
    defense: {
        name: '守り',
        rules: [
            line([threat('air', 75, ['missile', 'cannon'])], spawn('missile', 'target')),
            line([threat('ground', 100, ['rocket'])], spawn('rocket', 'target')),
            line([money('ge', 7000)], { k: 'formation', i: 0 }),
            line([money('lt', 7000)], save)
        ],
        arms: arms({
            rocket: { advance: 'center', keepFrom: 'ground', keepDist: 40 },
            missile: { advance: 'center' },
            tank: { keepFrom: 'rocket', keepDist: 60 }
        }),
        formations: [
            row(['infantry', 'tank', 'infantry', 'tank', 'infantry'], [30, 40, 50, 60, 70])
        ]
    }
};

// 強さの並び（cpu-match の勝率で確かめた順）。タイトル画面の「相手」もこの順
export const CPU_LEVELS = [
    { id: 'random', label: 'やさしい' },
    { id: 'sample', label: 'ふつう' },
    { id: 'kazuki', label: 'つよい' },
    { id: 'defense', label: '守り' }
];

export const BUILTIN = Object.fromEntries(Object.entries(RAW).map(([id, raw]) => [id, normalizeTactic(raw)]));

export const builtinTactic = (id) => structuredClone(BUILTIN[id] ?? BUILTIN.sample);
