import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createRandom } from '../public/js/random.js';
import { skullChance, successChance, chooseCpuCommand, runCpuStep, cpuActor, isCpuTurn, PROFILES } from '../public/js/cpu-player.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';

const cpus = (n) => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true }));

function newGame(n = 3) {
    for (let seed = 1; ; seed++) {
        const g = new Game(cpus(n), { seed });
        if (g.start === 0) return g;
    }
}
const ante = (g, discs) => g.players.forEach((p, s) => g.applyCommand(s, { type: 'place', disc: discs?.[s] ?? 'F' }));

describe('推し量り', () => {
    it('取り除かれた札が多いほど、ドクロのある見込みは下がる（持ち札を全部伏せたとき）', () => {
        const g = newGame();
        ante(g);
        // 席1が持ち札を全部伏せた形（4枚）と、2枚取り除かれて残りの2枚を全部伏せた形を比べる
        g.players[1].stack = ['F', 'F', 'F', 'S'];
        const before = skullChance(g, 0, 1, PROFILES.normal);
        g.players[1].lost = 2;
        g.players[1].discs = { F: 2, S: 0 }; // 中身は CPU からは見えない（枚数だけ使う）
        g.players[1].stack = ['F', 'F'];
        expect(skullChance(g, 0, 1, PROFILES.normal)).toBeLessThan(before);
    });

    it('このラウンドで宣言した人は、ドクロを伏せていなさそうと見る（やさしいは見ない）', () => {
        const g = newGame();
        ante(g);
        g.applyCommand(0, { type: 'place', disc: 'F' });
        const before = skullChance(g, 2, 1, PROFILES.normal);
        g.applyCommand(1, { type: 'challenge', bid: 1 });
        expect(skullChance(g, 2, 1, PROFILES.normal)).toBeLessThan(before * 0.5);
        expect(skullChance(g, 2, 1, PROFILES.easy)).toBeCloseTo(skullChance(g, 2, 1, { ...PROFILES.easy }), 5);
    });

    it('自分の山の、めくる分にドクロがあれば、成功の見込みは 0', () => {
        const g = newGame();
        ante(g, ['S', 'F', 'F']);
        const random = createRandom(1);
        expect(successChance(g, 0, 1, PROFILES.normal, random)).toBe(0);
        expect(successChance(g, 1, 1, PROFILES.normal, random)).toBe(1);
        expect(successChance(g, 1, 3, PROFILES.normal, random)).toBeGreaterThan(0);
        expect(successChance(g, 1, 3, PROFILES.normal, random)).toBeLessThan(1);
    });

    it('ほかの人の札の中身を入れ替えても、判断は変わらない（枚数だけ使う）', () => {
        const a = newGame(4);
        ante(a, ['F', 'S', 'F', 'F']);
        const b = Game.replay(...Object.values(a.persist()));
        // 席1と席2の伏せた札・持ち札の中身を入れ替える（枚数は同じ）
        b.players[1].stack = ['F'];
        b.players[2].stack = ['S'];
        expect(chooseCpuCommand(b, a.current, PROFILES.normal)).toEqual(chooseCpuCommand(a, a.current, PROFILES.normal));
    });
});

describe('CPU の判断', () => {
    it('めくるときは、まず自分の山。それから見込みの低い山（宣言した人の山）', () => {
        const g = newGame(4);
        ante(g);
        g.applyCommand(0, { type: 'place', disc: 'F' });
        g.applyCommand(1, { type: 'challenge', bid: 2 });
        g.applyCommand(2, { type: 'raise', bid: 4 });
        g.applyCommand(3, { type: 'pass' });
        g.applyCommand(0, { type: 'pass' });
        g.applyCommand(1, { type: 'pass' });
        expect(g.phase).toBe('reveal');
        expect(chooseCpuCommand(g, 2, PROFILES.normal)).toEqual({ type: 'flip', target: 2 });
        g.applyCommand(2, { type: 'flip', target: 2 });
        // 席1は宣言したので、ドクロを伏せていなさそう
        expect(chooseCpuCommand(g, 2, PROFILES.normal)).toEqual({ type: 'flip', target: 1 });
    });

    it('自分のドクロで失敗したら、花が2枚以上なら花を手放す', () => {
        const g = newGame();
        ante(g, ['S', 'F', 'F']);
        g.applyCommand(0, { type: 'challenge', bid: 1 });
        g.applyCommand(1, { type: 'pass' });
        g.applyCommand(2, { type: 'pass' });
        g.applyCommand(0, { type: 'flip', target: 0 });
        expect(chooseCpuCommand(g, 0, PROFILES.normal)).toEqual({ type: 'lose', disc: 'F' });
        g.players[0].discs = { F: 1, S: 1 };
        expect(chooseCpuCommand(g, 0, PROFILES.normal)).toEqual({ type: 'lose', disc: 'S' });
    });

    it('手札がなければ挑戦する。宣言の数は伏せた札の合計まで', () => {
        const g = newGame();
        ante(g);
        for (let i = 0; i < 3; i++) for (let s = 0; s < 3; s++) g.applyCommand(s, { type: 'place', disc: i < 2 ? 'F' : 'S' });
        const command = chooseCpuCommand(g, 0, PROFILES.normal);
        expect(command.type).toBe('challenge');
        expect(command.bid).toBeGreaterThanOrEqual(1);
        expect(command.bid).toBeLessThanOrEqual(g.totalOnMats());
    });

    it('同じ局面なら同じ手を選び、ゲームを変えない', () => {
        const g = newGame();
        ante(g);
        const before = JSON.stringify(g.players);
        expect(chooseCpuCommand(g, 0)).toEqual(chooseCpuCommand(g, 0));
        expect(JSON.stringify(g.players)).toBe(before);
    });

    it('人だけが操作を待っているときは進めない', () => {
        const g = new Game([{ name: 'あなた' }, ...cpus(2)], { seed: 1 });
        g.players.slice(1).forEach(p => g.applyCommand(p.id, { type: 'place', disc: 'F' }));
        expect(g.actors()).toEqual([0]);
        expect(isCpuTurn(g)).toBe(false);
        expect(cpuActor(g)).toBe(null);
        expect(runCpuStep(g)).toBe(false);
    });
});

describe('CPU 同士', () => {
    it.each([3, 4, 5, 6])('%i人で、最後まで止まらずに進む', (n) => {
        for (let seed = 1; seed <= 5; seed++) {
            const profiles = Array.from({ length: n }, (_, i) => (i % 2 ? 'easy' : 'normal'));
            const game = playMatch({ profiles, seed });
            expect(game.isOver()).toBe(true);
            const saved = game.persist();
            expect(Game.replay(saved.players, saved.options, saved.commands).winner).toBe(game.winner);
        }
    });

    it('ふつうはやさしいより勝ち、やさしいはでたらめより勝つ', () => {
        const a = runMatches({ games: 120, profiles: ['normal', 'easy', 'easy', 'easy'] });
        expect(a.wins.normal / a.seats.normal).toBeGreaterThan(a.wins.easy / a.seats.easy);
        const b = runMatches({ games: 120, profiles: ['easy', 'random', 'random'] });
        expect(b.wins.easy / b.seats.easy).toBeGreaterThan(b.wins.random / b.seats.random);
    });
});
