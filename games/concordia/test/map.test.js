import { describe, it, expect } from 'vitest';
import { CITIES, PROVINCES, ROADS, TOKENS, ROME, CITY, roadsAt } from '../public/js/map.js';
import { SEAS, ISLANDS } from '../public/js/geo.js';

describe('地図のデータ', () => {
    it('都市は30、州は12で、どの州も2つか3つの都市でできている', () => {
        expect(CITIES).toHaveLength(30);
        expect(PROVINCES).toHaveLength(12);
        PROVINCES.forEach(pr => {
            const n = CITIES.filter(c => c.province === pr.id).length;
            expect(n === 2 || n === 3, pr.id).toBe(true);
        });
    });

    it('文字ごとの都市の数と、品のトークンの数が合う', () => {
        Object.entries(TOKENS).forEach(([letter, tokens]) => {
            expect(CITIES.filter(c => c.letter === letter).length, letter).toBe(tokens.length);
        });
        expect(CITIES.every(c => TOKENS[c.letter])).toBe(true);
    });

    it('トークンは品ごとに れんが8・食料7・道具6・ワイン5・布4、道は陸路44・海路35', () => {
        const all = Object.values(TOKENS).flat();
        const count = (g) => all.filter(x => x === g).length;
        expect([count('brick'), count('food'), count('tool'), count('wine'), count('cloth')]).toEqual([8, 7, 6, 5, 4]);
        expect(ROADS.filter(r => r.kind === 'land')).toHaveLength(44);
        expect(ROADS.filter(r => r.kind === 'sea')).toHaveLength(35);
    });

    it('道は実在の都市を結び、同じ種類の道は重ならない', () => {
        const seen = new Set();
        ROADS.forEach(r => {
            expect(CITY[r.a], r.a).toBeTruthy();
            expect(CITY[r.b], r.b).toBeTruthy();
            expect(r.a).not.toBe(r.b);
            const key = [r.a, r.b].sort().join('-') + r.kind;
            expect(seen.has(key), key).toBe(false);
            seen.add(key);
        });
    });

    it('ルールブックの例にある道がある', () => {
        const has = (a, b, kind) => ROADS.some(r => r.kind === kind && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
        expect(has('colonia', 'novaria', 'land')).toBe(true);
        expect(has('roma', 'aquileia', 'land')).toBe(true);
        expect(has('aquileia', 'vindobona', 'land')).toBe(true);
        expect(has('roma', 'massilia', 'sea')).toBe(true);
    });

    it('ローマから、陸路と海路を合わせて全部の都市に行ける', () => {
        const seen = new Set([ROME]);
        const queue = [ROME];
        while (queue.length) {
            const city = queue.shift();
            [...roadsAt(city, 'land'), ...roadsAt(city, 'sea')].forEach(id => {
                const r = ROADS[id];
                const next = r.a === city ? r.b : r.a;
                if (!seen.has(next)) {
                    seen.add(next);
                    queue.push(next);
                }
            });
        }
        expect(seen.size).toBe(31);
    });

    it('ローマから陸と海の両方の道が出ている', () => {
        expect(roadsAt(ROME, 'land').length).toBeGreaterThan(0);
        expect(roadsAt(ROME, 'sea').length).toBeGreaterThan(0);
    });

    it('海岸線の多角形は閉じられる形（3点以上）になっている', () => {
        [...Object.values(SEAS), ...Object.values(ISLANDS)].forEach(list => expect(list.length).toBeGreaterThanOrEqual(3));
    });
});
