/**
 * 原作の JS の戦術3本（js/tactics/random.js・sample.js・kazuki.main.js）を、関数の戦術に移した参考の版
 * ルールで書いた組み込みの戦術（cpu-tactics.js）と勝率を比べるために使う（テストだけで使う）
 * 原作との違い：Math.random のかわりに、側ごとのシード付きの乱数（random）を使う。兵器への指示は戻り値の orders で返す
 */

import { WIDTH } from '../public/js/arms.js';

const TYPES = ['infantry', 'tank', 'rocket', 'missile', 'cannon', 'attacker', 'fighter', 'bomber'];
const HEIGHT = 100;

function baseOrders(own) {
    return own.arms.map((self) => ({
        arm: self.ref,
        dest: ['infantry', 'bomber'].includes(self.type) ? WIDTH : WIDTH - self.range,
        ret: self.bullets <= 0
    }));
}

export function randomTactic({ own, random }) {
    const orders = baseOrders(own);
    if (own.money < 2000) return { orders, spawns: [] };
    return { orders, spawns: [[Math.floor(random() * HEIGHT), TYPES[Math.floor(random() * TYPES.length)]]] };
}

export function sampleTactic({ own, enemy, random }) {
    const orders = baseOrders(own);
    const spawns = [];
    if (own.money < 4000) return { orders, spawns };
    for (const e of enemy.arms) {
        if (e.x > 100) continue;
        let safe = false;
        for (const f of own.arms) {
            if (e.onAir && f.type === 'missile' && f.x < e.x && Math.abs(e.y - f.y) <= 10) safe = true;
            if (!e.onAir && f.type === 'tank' && f.x < e.x && Math.abs(e.y - f.y) <= 10) safe = true;
        }
        if (!safe) spawns.push([e.y, e.onAir ? 'missile' : 'tank']);
    }
    if (random() < 0.1) spawns.push([Math.floor(random() * HEIGHT), TYPES[Math.floor(random() * TYPES.length)]]);
    if (random() < 0.2) spawns.push([Math.floor(random() * HEIGHT), 'infantry']);
    return { orders, spawns };
}

export function kazukiTactic({ own, enemy, random }) {
    const orders = own.arms.map((self) => {
        let dest = ['infantry', 'bomber'].includes(self.type) ? WIDTH : WIDTH - self.range;
        for (const e of enemy.arms) {
            if (self.x < e.x && Math.abs(e.y - self.y) <= 10) {
                if (self.type === 'tank' && e.type === 'attacker') dest = e.x - 60;
                else if (self.type === 'rocket' && !e.onAir) dest = e.x - 60;
                else if (self.type === 'attacker' && ['missile', 'fighter'].includes(e.type)) dest = e.x - 60;
            }
        }
        let ret = false;
        if (self.bullets <= 0) ret = true;
        else if (['missile', 'fighter'].includes(self.type)) {
            ret = !enemy.arms.some((e) => self.x < e.x && Math.abs(e.y - self.y) <= 10 && ['attacker', 'fighter', 'bomber'].includes(e.type));
        } else if (self.type === 'attacker') {
            ret = !enemy.arms.some((e) => self.x < e.x && Math.abs(e.y - self.y) <= 10 && ['tank', 'rocket', 'infantry'].includes(e.type));
        }
        return { arm: self.ref, dest, ret };
    });
    const spawns = [];
    if (own.money < 2000) return { orders, spawns };
    for (const e of enemy.arms) {
        if (e.x >= 50) continue;
        let safe = false;
        for (const f of own.arms) {
            if (e.onAir && f.type === 'missile' && f.x < e.x && Math.abs(e.y - f.y) <= 10) safe = true;
            if (!e.onAir && (f.type === 'tank' || f.type === 'attacker') && f.x < e.x && Math.abs(e.y - f.y) <= 10) safe = true;
        }
        if (safe) continue;
        if (e.onAir) spawns.push([e.y, 'missile']);
        else {
            const vsAir = enemy.arms.some((e2) => Math.abs(e.y - e2.y) <= 10 && ['fighter', 'missile'].includes(e2.type));
            spawns.push([e.y, vsAir ? 'tank' : 'attacker']);
        }
    }
    if (own.money > 10000) {
        const edges = [0, 7, 14, 21, 79, 86, 93, 100];
        if (random() < 0.6) ['tank', 'rocket', 'tank', 'rocket', 'rocket', 'tank', 'rocket', 'tank'].forEach((t, i) => spawns.push([edges[i], t]));
        else if (random() < 0.5) [0, 7, 93, 100].forEach((y) => spawns.push([y, 'missile']));
        else [0, 7, 93, 100].forEach((y) => spawns.push([y, 'infantry']));
    }
    return { orders, spawns };
}

export const REFERENCE = { random: randomTactic, sample: sampleTactic, kazuki: kazukiTactic };
