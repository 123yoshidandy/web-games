/**
 * 食料への換算（ゲーム・CPU・画面で共通）
 * - 穀物と野菜は、いつでも1つ食料1。調理の進歩（かまど・調理場）があれば、野菜と動物を高い率で食料にできる
 * - パンを焼く（穀物→食料）には、焼く進歩が要る。かまど・調理場は何個でも、レンガ暖炉は1個、石の暖炉は2個まで（1回の「パンを焼く」で）
 * - 作業場は、収穫のときに1回だけ、資源1を食料にできる
 */

import { MAJOR } from './cards.js';

// 調理の率（野菜・羊・猪・牛）。調理の進歩がなければ野菜1・動物は不可（0）
export function cookRates(majors) {
    const rates = { grain: 1, veg: 1, sheep: 0, boar: 0, cattle: 0 };
    majors.forEach(id => {
        const cook = MAJOR[id].cook;
        if (!cook) return;
        Object.entries(cook).forEach(([k, v]) => { rates[k] = Math.max(rates[k], v); });
    });
    return rates;
}

export const canCook = (majors) => majors.some(id => MAJOR[id].cook);
export const canBake = (majors) => majors.some(id => MAJOR[id].bake);

// n 個の穀物を焼いたときの食料（率の高い進歩から使う）。焼けない分は null
export function bakeFood(majors, n) {
    const slots = majors.filter(id => MAJOR[id].bake).map(id => ({ ...MAJOR[id].bake })).sort((a, b) => b.food - a.food);
    let left = n;
    let food = 0;
    for (const s of slots) {
        const k = Math.min(left, s.max);
        food += k * s.food;
        left -= k;
        if (!left) break;
    }
    return left ? null : food;
}

export function maxBake(majors) {
    return majors.filter(id => MAJOR[id].bake).reduce((s, id) => s + MAJOR[id].bake.max, 0);
}

// 収穫の作業場（資源と率）
export const crafts = (majors) => majors.filter(id => MAJOR[id].craft).map(id => ({ id, ...MAJOR[id].craft }));
