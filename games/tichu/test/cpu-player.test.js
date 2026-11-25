import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { MAHJONG, DOG, PHOENIX, DRAGON, cardOf, sortCards } from '../public/js/cards.js';
import { decompose, handStrength, grandStrength, chooseCpuCommand, runCpuStep, cpuActor, isCpuTurn, PROFILES } from '../public/js/cpu-player.js';
import { playMatch, runMatches } from '../scripts/cpu-match.mjs';

const c = cardOf;
const cpus = () => [0, 1, 2, 3].map(i => ({ name: `C${i}`, isCPU: i !== 0 }));

function playing(hands, current, extra = {}) {
    const g = new Game(cpus(), { seed: 1 });
    g.hands = hands.map(h => sortCards(h));
    g.grandDecided = [true, true, true, true];
    g.exchange = [[], [], [], []];
    g.played = [true, true, true, true];
    g.phase = 'play';
    g.current = current;
    Object.assign(g, extra);
    return g;
}

describe('手札を組に分ける', () => {
    it('爆弾・階段・ペア・1枚に分ける', () => {
        const hand = [c(0, 3), c(1, 4), c(2, 5), c(3, 6), c(0, 7), c(0, 9), c(1, 9), c(0, 11), c(1, 11), c(2, 11), c(3, 11), DRAGON, DOG, c(2, 2)];
        const types = decompose(hand).combos.map(x => x.type).sort();
        // 2 は階段に入れて 2〜7（組が1つ少ない）。残りは竜だけが1枚
        expect(types).toEqual(['bomb', 'dog', 'pair', 'single', 'straight'].sort());
        expect(decompose(hand).combos.find(x => x.type === 'straight').length).toBe(6);
    });

    it('強い札が多く、組の少ない手札ほど強い', () => {
        const strong = [DRAGON, PHOENIX, c(0, 14), c(1, 14), c(0, 13), c(1, 13), c(0, 3), c(1, 4), c(2, 5), c(3, 6), c(0, 7), c(0, 10), c(1, 10), c(2, 12)];
        const weak = [DOG, c(0, 2), c(1, 3), c(2, 5), c(3, 6), c(0, 8), c(1, 9), c(2, 10), c(0, 11), c(1, 12), c(2, 4), c(3, 7), c(0, 6), c(1, 2)];
        expect(handStrength(strong)).toBeGreaterThan(handStrength(weak) + 3);
        expect(grandStrength([DRAGON, PHOENIX, c(0, 14), c(1, 14), c(0, 3), c(1, 5), c(2, 7), c(3, 9)])).toBeGreaterThanOrEqual(PROFILES.normal.grandLine);
        expect(grandStrength([c(0, 2), c(1, 5), c(2, 7), c(3, 9), c(0, 11), c(1, 3), c(2, 4), c(3, 6)])).toBeLessThan(PROFILES.normal.grandLine);
    });
});

describe('CPU の判断', () => {
    it('渡す札：3枚とも手札の別々の札。味方には強い札', () => {
        const g = new Game(cpus(), { seed: 2 });
        [0, 1, 2, 3].forEach(s => g.applyCommand(s, { type: 'grand', call: false }));
        g.hands[1] = sortCards([DRAGON, c(0, 2), c(1, 3), c(2, 5), c(3, 6), c(0, 8), c(1, 9), c(2, 10), c(0, 11), c(1, 12), c(2, 4), c(3, 7), c(0, 6), c(1, 2)]);
        const command = chooseCpuCommand(g, 1, PROFILES.normal);
        if (command.type === 'tichu') return; // 強ければ先に宣言する
        expect(command.type).toBe('exchange');
        expect(new Set(command.cards).size).toBe(3);
        expect(command.cards.every(x => g.hands[1].includes(x))).toBe(true);
        expect(command.cards[1]).toBe(DRAGON);
    });

    it('味方の場には重ねない', () => {
        const g = playing([[c(0, 9), c(0, 3)], [c(1, 2), c(1, 4)], [c(2, 12), c(2, 5), c(2, 6)], [c(3, 6), c(3, 2)]], 1);
        g.table = [{ seat: 3, combo: { type: 'single', rank: 6, length: 1, cards: [c(3, 6)] } }];
        g.hands[3] = [c(3, 2)];
        g.current = 1;
        // 席1の味方は席3。場は席3のもの
        expect(chooseCpuCommand(g, 1, PROFILES.normal)).toEqual({ type: 'pass' });
    });

    it('味方が宣言していたら、犬で味方に番を渡す', () => {
        const g = playing([[c(0, 9)], [DOG, c(1, 4), c(1, 7), c(1, 9), c(2, 11)], [c(2, 12)], [c(3, 6), c(3, 2), c(0, 13)]], 1, { calls: [null, null, null, 'tichu'] });
        expect(chooseCpuCommand(g, 1, PROFILES.normal)).toEqual({ type: 'play', cards: [DOG] });
    });

    it('相手が上がりそうなら、爆弾で止める', () => {
        const bomb = [c(0, 4), c(1, 4), c(2, 4), c(3, 4)];
        const g = playing([[c(0, 14)], [...bomb, c(1, 9), c(1, 11)], [c(2, 12), c(2, 13)], [c(3, 6)]], 1);
        g.table = [{ seat: 0, combo: { type: 'single', rank: 14, length: 1, cards: [c(0, 14)] } }];
        g.hands[0] = [c(0, 2)];
        const command = chooseCpuCommand(g, 1, PROFILES.normal);
        expect(command.cards?.sort()).toEqual(bomb.sort());
    });

    it('竜の場は、札の多い相手へ渡す', () => {
        const g = playing([[c(0, 9), c(0, 3)], [c(1, 2)], [c(2, 12), c(2, 5), c(2, 6)], [c(3, 6), c(3, 2), c(3, 9), c(3, 10)]], null, { phase: 'dragon', dragonFrom: 2, pendingTrick: [DRAGON] });
        expect(chooseCpuCommand(g, 2, PROFILES.normal)).toEqual({ type: 'dragon', to: 3 });
    });

    it('麻雀を出すときは、持っていない数を願う', () => {
        const g = playing([[MAHJONG, c(0, 14), c(1, 3)], [c(1, 2)], [c(2, 12)], [c(3, 6)]], 0);
        g.players[0].isCPU = true;
        const command = chooseCpuCommand(g, 0, PROFILES.normal);
        expect(command.cards).toContain(MAHJONG);
        expect(command.wish).toBe(13);
    });

    it('ほかの人の手札の中身は使わない（枚数だけ）', () => {
        const base = new Game(cpus(), { seed: 7 });
        while (base.phase !== 'play') runCpuStep(base, cpuActor(base) ?? 0) || base.applyCommand(0, base.phase === 'grand' ? { type: 'grand', call: false } : { type: 'exchange', cards: base.hands[0].slice(0, 3) });
        const seat = base.current === 0 ? 1 : base.current;
        const other = [0, 1, 2, 3].filter(s => s !== seat);
        const shuffled = Game.replay(...Object.values(base.persist()));
        // ほかの3人の札を入れ替える（枚数は同じ）
        const pool = other.flatMap(s => shuffled.hands[s]).reverse();
        other.forEach(s => { shuffled.hands[s] = sortCards(pool.splice(0, shuffled.hands[s].length)); });
        if (base.current === seat) expect(chooseCpuCommand(shuffled, seat)).toEqual(chooseCpuCommand(base, seat));
    });

    it('同じ局面なら同じ手を選び、ゲームを変えない', () => {
        const g = new Game(cpus(), { seed: 11 });
        const before = JSON.stringify(g.hands);
        expect(chooseCpuCommand(g, 1)).toEqual(chooseCpuCommand(g, 1));
        expect(JSON.stringify(g.hands)).toBe(before);
    });

    it('人の番だけのときは CPU は進めない', () => {
        const g = playing([[c(0, 9)], [c(1, 2)], [c(2, 12)], [c(3, 6)]], 0);
        expect(isCpuTurn(g)).toBe(false);
        expect(cpuActor(g)).toBe(null);
        expect(runCpuStep(g)).toBe(false);
    });
});

describe('CPU 同士', () => {
    it('やさしい・ふつうとも、最後まで止まらずに進む（点の合計も合う）', () => {
        for (const profiles of [['normal', 'easy'], ['easy', 'normal'], ['normal', 'normal']]) {
            const game = playMatch({ profiles, seed: 4, target: 500 });
            expect(game.isOver()).toBe(true);
            for (const r of game.rounds) if (r.detail !== 'double') expect(r.cardPoints[0] + r.cardPoints[1]).toBe(100);
            const saved = game.persist();
            expect(Game.replay(saved.players, saved.options, saved.commands).scores).toEqual(game.scores);
        }
    });

    it('ふつうはやさしいに勝ち越し、やさしいはでたらめに勝ち越す', () => {
        const a = runMatches({ games: 8, profiles: ['normal', 'easy'], target: 500 });
        expect(a.wins[0]).toBeGreaterThan(a.wins[1]);
        const b = runMatches({ games: 8, profiles: ['easy', 'random'], target: 500 });
        expect(b.wins[0]).toBeGreaterThanOrEqual(7);
    });
});
