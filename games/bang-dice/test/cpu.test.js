import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep, chooseCommand, suspicions, hostilities } from '../public/js/cpu-player.js';
import { players, setup, snapshot } from './helpers.js';
import { runMatches } from '../scripts/cpu-match.mjs';

const ROLES5 = ['sheriff', 'outlaw', 'deputy', 'outlaw', 'renegade'];

function playAll(n, seed, level) {
    const game = new Game(players(n, true), { seed, level });
    let steps = 0;
    while (!game.isOver() && steps++ < 5000) {
        if (!runCpuStep(game)) break;
    }
    return game;
}

describe('CPU 同士の対戦', () => {
    it('3〜8人・ふつうとやさしい・多数のシードで、必ず最後まで進み、記録から再現できる', () => {
        for (let n = 3; n <= 8; n++) {
            for (const level of ['normal', 'easy']) {
                for (let seed = 1; seed <= 25; seed++) {
                    const game = playAll(n, seed * 31 + n, level);
                    expect(game.isOver()).toBe(true);
                    const saved = game.persist();
                    expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
                }
            }
        }
    });

    it('同じシードなら同じ展開になる（CPU はゲームの乱数を使わない）', () => {
        expect(snapshot(playAll(6, 77, 'normal'))).toBe(snapshot(playAll(6, 77, 'normal')));
    });

    it('どの役割も勝つことがあり、ふつうはやさしいより勝つ', () => {
        const r = runMatches({ games: 300, count: 5, level: 'mixed' });
        expect(r.stuck).toBe(0);
        ['sheriff', 'deputy', 'outlaw', 'renegade'].forEach(role => {
            const won = (r.roles[`${role}:normal`]?.won ?? 0) + (r.roles[`${role}:easy`]?.won ?? 0);
            expect(won).toBeGreaterThan(0);
        });
        const rate = (lv) => {
            const list = Object.entries(r.roles).filter(([k]) => k.endsWith(lv)).map(([, v]) => v);
            return list.reduce((s, v) => s + v.won, 0) / list.reduce((s, v) => s + v.total, 0);
        };
        expect(rate('normal')).toBeGreaterThan(rate('easy'));
    });
});

describe('CPU の判断', () => {
    it('ほかの人の隠れた役割をのぞかない（入れ替えても判断が変わらない）', () => {
        const a = setup(new Game(players(5, true), { seed: 3 }), { roles: ROLES5, characters: ['blackjack', 'lucky', 'suzy', 'vulture', 'rose'], dice: ['1', '2', 'beer', 'gatling', 'arrow'] });
        const b = setup(new Game(players(5, true), { seed: 3 }), { roles: ['sheriff', 'renegade', 'deputy', 'outlaw', 'outlaw'], characters: ['blackjack', 'lucky', 'suzy', 'vulture', 'rose'], dice: ['1', '2', 'beer', 'gatling', 'arrow'] });
        const viewA = createGameView(a, 0, { events: false });
        const viewB = createGameView(b, 0, { events: false });
        expect(JSON.stringify(viewA)).toBe(JSON.stringify(viewB));
        expect(chooseCommand(viewA, 'normal', () => 0.5)).toEqual(chooseCommand(viewB, 'normal', () => 0.5));
    });

    it('保安官を撃った人を敵らしいと見る。保安官を回復した人は味方らしい', () => {
        const game = setup(new Game(players(5, true), { seed: 3 }), { roles: ROLES5, characters: ['blackjack', 'lucky', 'suzy', 'vulture', 'rose'] });
        game.acts.push({ type: 'shot', from: 1, to: 0, amount: 1 }, { type: 'beer', from: 4, to: 0 });
        const view = createGameView(game, 2);
        const s = suspicions(view);
        expect(s[1]).toBeLessThan(0);
        expect(s[4]).toBeGreaterThan(0);
        // 副保安官から見て、保安官を撃った人は倒したい相手、保安官は守る相手
        const h = hostilities(view);
        expect(h[1]).toBeGreaterThan(0);
        expect(h[0]).toBeLessThan(0);
    });

    it('無法者は、撃てるなら保安官を撃つ', () => {
        const game = setup(new Game(players(5, true), { seed: 3 }), { roles: ROLES5, characters: ['blackjack', 'lucky', 'suzy', 'vulture', 'rose'], current: 1, dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(1, { type: 'stop' });
        const command = chooseCommand(createGameView(game, 1), 'normal', () => 0.5);
        expect(command).toMatchObject({ type: 'shoot', die: 0, target: 0 });
    });

    it('副保安官は、撃てる相手が保安官と味方らしい人だけのダイスは振り直す', () => {
        const roles = ['deputy', 'sheriff', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'renegade'];
        const characters = ['blackjack', 'lucky', 'suzy', 'vulture', 'rose', 'paul', 'jesse'];
        const game = setup(new Game(players(7, true), { seed: 3 }), { roles, characters, current: 0, dice: ['1', 'beer', 'beer', 'beer', 'beer'] });
        // 距離1は席1（保安官）と席6。席6が保安官を撃っていれば、1を残す
        game.acts.push({ type: 'shot', from: 6, to: 1, amount: 1 });
        const keepShot = chooseCommand(createGameView(game, 0), 'normal', () => 0.5);
        expect(keepShot.type === 'stop' || !keepShot.dice?.includes(0)).toBe(true);
        // 席6が保安官を回復していれば（味方らしい）、1を振り直す
        game.acts.length = 0;
        game.acts.push({ type: 'beer', from: 6, to: 1 });
        const reroll = chooseCommand(createGameView(game, 0), 'normal', () => 0.5);
        expect(reroll).toMatchObject({ type: 'roll' });
        expect(reroll.dice).toContain(0);
    });

    it('分からない人に副保安官が残っていなければ、保安官は全員を敵と見る', () => {
        const game = setup(new Game(players(4, true), { seed: 3 }), { roles: ['sheriff', 'renegade', 'outlaw', 'outlaw'], characters: ['blackjack', 'lucky', 'suzy', 'vulture'] });
        game.acts.push({ type: 'beer', from: 1, to: 0 });
        const h = hostilities(createGameView(game, 0));
        expect(h.slice(1).every(v => v > 0)).toBe(true);
    });
});
