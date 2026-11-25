import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep, chooseCommand, suspicions, hostilities } from '../public/js/cpu-player.js';
import { cpus, setupGame, cardOf, snapshot } from './helpers.js';

function playOut(game, levelOf = () => 'normal', limit = 3000) {
    let steps = 0;
    while (!game.isOver()) {
        const seat = game.actors().find(s => game.players[s].isCPU);
        expect(runCpuStep(game, levelOf(seat))).toBe(true);
        if (++steps > limit) throw new Error('終わらない');
    }
    return steps;
}

describe('CPU', () => {
    it('CPU だけの試合が、4〜6 人・両方のルール・強さを変えても最後まで進み、記録から再現できる', () => {
        for (const mode of ['basic', 'expert']) {
            for (let n = 4; n <= 6; n++) {
                for (let seed = 1; seed <= 6; seed++) {
                    const game = new Game(cpus(n), { seed: seed * 31 + n, mode });
                    playOut(game, seat => (seat + seed) % 2 ? 'easy' : 'normal');
                    expect(['gym', 'challenger', 'rocket']).toContain(game.winnerSide);
                    expect(snapshot(Game.replay(cpus(n), game.options, game.commands))).toBe(snapshot(game));
                }
            }
        }
    });

    it('ほかの人の手札をのぞかない（ビューが同じなら、隠れた手札が違っても同じ手）', () => {
        const mons = ['rhydon', 'golduck', 'slowbro', 'starmie'];
        const a = setupGame({ mons, hands: ['kurae potion', 'yokete yokete', 'kurae', 'nugget'] });
        const b = setupGame({ mons, hands: ['kurae potion', 'kurae mewtwo', 'potion', 'yokete'] });
        expect(JSON.stringify(createGameView(a, 0))).toBe(JSON.stringify(createGameView(b, 0)));
        for (const level of ['normal', 'easy']) expect(chooseCommand(createGameView(a, 0), level)).toEqual(chooseCommand(createGameView(b, 0), level));
    });

    it('ジムリーダーを攻撃した人を、敵らしいと推測する。リーダーを助けた人は味方らしい', () => {
        const mons = ['rhydon', 'golduck', 'slowbro', 'starmie'];
        const game = setupGame({ mons, seat: 2, hands: ['', '', 'kurae', 'potion'] });
        game.applyCommand(2, { type: 'play', card: cardOf(game, 2, 'kurae'), target: 0 });
        game.turn.seat = 3;
        game.applyCommand(3, { type: 'play', card: cardOf(game, 3, 'potion'), target: 0 });
        const view = createGameView(game, 1);
        const s = suspicions(view);
        expect(s[2]).toBeLessThan(0);
        expect(s[3]).toBeGreaterThan(0);
        // トレーナー（席 1）は、敵らしい席 2 をいちばん倒したい
        const host = hostilities(view);
        expect(host.indexOf(Math.max(...host))).toBe(2);
    });

    it('CPU の挑戦者は、序盤はリーダーを攻撃せずに潜む', () => {
        const mons = ['rhydon', 'golduck', 'slowbro', 'starmie'];
        const game = setupGame({ mons, seat: 2, hands: ['', '', 'kurae', ''] });
        expect(chooseCommand(createGameView(game, 2)).target).not.toBe(0);
        // リーダーの HP が少なければ、狙う
        game.players[0].pokemon[0].hp = 2;
        expect(chooseCommand(createGameView(game, 2))).toMatchObject({ type: 'play', target: 0 });
    });

    it('自分が攻撃を受けたら「よけて！」を出し、味方らしい人がひんしになったら助ける', () => {
        const mons = ['aerodactyl', 'golduck', 'slowbro', 'starmie'];
        const game = setupGame({ mons, seat: 2, hands: ['yokete potion', 'potion', 'kurae', ''] });
        game.players[2].pokemon[0].hp = 9;
        game.applyCommand(2, { type: 'play', card: cardOf(game, 2, 'kurae'), target: 0 });
        expect(chooseCommand(createGameView(game, 0))).toEqual({ type: 'respond', choice: 'yokete' });
        game.applyCommand(0, { type: 'respond', choice: 'take' });
        // リーダー（HP 0 にする）をトレーナーが助ける
        game.players[0].pokemon[0].hp = 1;
        game.turn.attacks = 0;
        game.players[2].hand.push(game.deck.find(id => game.cards[id].key === 'kurae'));
        game.applyCommand(2, { type: 'play', card: cardOf(game, 2, 'kurae'), target: 0 });
        game.applyCommand(0, { type: 'respond', choice: 'take' });
        expect(game.prompt).toMatchObject({ kind: 'rescue', seat: 0 });
        expect(chooseCommand(createGameView(game, 0))).toMatchObject({ type: 'respond', choice: cardOf(game, 0, 'potion') });
    });
});
