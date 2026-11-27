// 戦術の言葉（エディタ・結果・ログの表示）
import { ARMS } from './arms.js';

export const CLASS_NAMES = { all: 'すべて', ground: '地上', air: '空', antiAir: '対空', antiGround: '対地', none: 'なし' };
export const armName = (type) => ARMS[type]?.name ?? CLASS_NAMES[type] ?? type;
export const COND_NAMES = {
    always: 'いつでも', money: 'お金', threat: '脅威', near: '対象の高さの敵', count: '数', life: '体力', time: '時間', chance: '確率'
};
export const COND_HELP = {
    always: '毎回',
    money: '自分のお金で決める',
    threat: '自陣に近づいた敵。いちばん近い1体を「対象」にする',
    near: '「脅威」の対象と同じ高さ（±10）の敵',
    count: '盤面の兵器の数',
    life: '陣地の体力',
    time: '始まってからの秒数',
    chance: '判断のたびにくじを引く'
};
export const ACT_NAMES = { spawn: '出撃', formation: '編成', save: 'ためる' };
export const POSITION_NAMES = {
    target: '対象の高さ', top: '上端', upper: '上', middle: '中', lower: '下', bottom: '下端', random: 'ランダム', weakest: '一番手薄'
};
export const ADVANCE_NAMES = { enemyBase: '敵陣まで', range: '射程の手前', center: '中央', home: '自陣の前' };
export const OP_NAMES = { ge: '≥', lt: '<', le: '≤' };
export const WHO_NAMES = { own: '自軍', enemy: '敵軍', diff: '差' };
export const LIFE_WHO_NAMES = { own: '自陣', enemy: '敵陣', diff: '差（自−敵）' };
export const FORMATION_NAMES = ['編成A', '編成B', '編成C', '編成D'];

export const unitName = (unit) => (unit === 'random' ? 'ランダム' : ARMS[unit].name);

export function condText(c) {
    switch (c.k) {
        case 'always': return 'いつでも';
        case 'money': return `お金 ${OP_NAMES[c.op]} ${c.n}`;
        case 'threat': {
            const base = `脅威：${armName(c.cls)}・${c.dist}以内`;
            return c.unless.length > 0 ? `${base}・${c.unless.map((t) => ARMS[t].name).join('・')}で未迎撃` : base;
        }
        case 'near': return `対象の高さに${armName(c.cls)}${c.has ? 'あり' : 'なし'}`;
        case 'count': return `${WHO_NAMES[c.who]}の${armName(c.cls)} ${OP_NAMES[c.op]} ${c.n}`;
        case 'life': return `${LIFE_WHO_NAMES[c.who]} ${OP_NAMES[c.op]} ${c.n}`;
        case 'time': return c.op === 'ge' ? `${c.n}秒から` : `${c.n}秒まで`;
        case 'chance': return `確率 ${c.n}%`;
        default: return '';
    }
}

export function actText(a) {
    if (a.k === 'save') return 'ためる';
    if (a.k === 'formation') return FORMATION_NAMES[a.i];
    return `${unitName(a.unit)}を${POSITION_NAMES[a.at]}に`;
}

export const lineText = (line) => `${line.when.length > 0 ? line.when.map(condText).join('・') : 'いつでも'} → ${actText(line.act)}`;
