import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { chooseCommand, runCpuStep, isCpuTurn, simulateClue, chopOf } from '../public/js/cpu-player.js';
import { snapshot, setCard, PLAYERS } from './helpers.js';

const CPUS = n => Array.from({ length: n }, (_, i) => ({ name: `C${i + 1}`, isCPU: true }));

describe('CPU', () => {
    for (const n of [2, 3, 4, 5]) {
        it(`${n}人：CPU だけの試合が最後まで進み、記録から再現できる。ヒントは約束事どおりに読める`, () => {
            let misread = 0;
            for (let seed = 1; seed <= 20; seed++) {
                const game = new Game(CPUS(n), { seed: seed * 31 });
                let steps = 0;
                while (isCpuTurn(game)) {
                    const command = chooseCommand(game);
                    if (command.type === 'clue') {
                        const sim = simulateClue(game, game.current, command.target, command.kind, command.value);
                        const focus = game.cards[sim.focus];
                        if (sim.reading === 'play' && game.fireworks[focus.color] !== focus.rank - 1) misread++;
                    }
                    expect(game.applyCommand(game.current, command)).toBe(true);
                    expect(++steps).toBeLessThan(300);
                }
                expect(game.isOver).toBe(true);
                const replayed = Game.replay(CPUS(n), { seed: game.seed }, game.commands);
                expect(snapshot(replayed)).toBe(snapshot(game));
            }
            expect(misread).toBe(0);
        });
    }

    it('自分の手札の中身を見ない（ヒントのない札の中身を入れ替えても、判断が変わらない）', () => {
        for (let seed = 1; seed <= 15; seed++) {
            const game = new Game(CPUS(3), { seed });
            for (let step = 0; step < 40 && !game.isOver; step++) {
                const seat = game.current;
                const command = chooseCommand(game);
                // 自分の札の中身を、山札の札と入れ替えた別の状態を作って比べる
                const other = Game.replay(CPUS(3), { seed }, game.commands);
                for (const order of other.hands[seat]) {
                    if (other.knowledge[order].clued || other.deck.length === 0) continue;
                    const swap = other.deck.pop();
                    other.deck.unshift({ color: other.cards[order].color, rank: other.cards[order].rank });
                    other.cards[order].color = swap.color;
                    other.cards[order].rank = swap.rank;
                }
                expect(chooseCommand(other)).toEqual(command);
                game.applyCommand(seat, command);
            }
        }
    });

    it('人からの出せる合図（新しく指された一番左の札）を出す', () => {
        const game = new Game([{ name: '人', isCPU: false }, { name: 'C', isCPU: true }], { seed: 4 });
        game.current = 0;
        const hand = game.hands[1];
        setCard(game, hand[0], 3, 3);
        setCard(game, hand[1], 1, 1);
        setCard(game, hand[2], 1, 2);
        setCard(game, hand[3], 0, 4);
        setCard(game, hand[4], 2, 4);
        game.applyCommand(0, { type: 'clue', target: 1, kind: 'color', value: 1 }); // 黄：hand[1] が焦点
        expect(chooseCommand(game)).toEqual({ type: 'play', order: hand[1] });
    });

    it('5のヒントの札は捨てず、捨てるのは一番左のヒントのない札', () => {
        const game = new Game([{ name: '人', isCPU: false }, { name: 'C', isCPU: true }], { seed: 5 });
        game.current = 0;
        const hand = game.hands[1];
        setCard(game, hand[0], 2, 5);
        setCard(game, hand[1], 3, 4);
        setCard(game, hand[2], 4, 4);
        setCard(game, hand[3], 0, 3);
        setCard(game, hand[4], 1, 3);
        // 人の手札を、CPU が教えられる札のない形にして、CPU に捨てさせる
        for (const order of game.hands[0]) setCard(game, order, 4, 3);
        game.clues = 1;
        game.applyCommand(0, { type: 'clue', target: 1, kind: 'rank', value: 5 });
        expect(chopOf(game, 1)).toBe(hand[1]);
        expect(chooseCommand(game)).toEqual({ type: 'discard', order: hand[1] });
    });

    it('次の人の捨て札候補が5なら、5のヒントで取っておかせる', () => {
        const game = new Game([{ name: 'C', isCPU: true }, { name: '人', isCPU: false }], { seed: 6 });
        game.current = 0;
        const hand = game.hands[1];
        setCard(game, hand[0], 3, 5);
        for (let i = 1; i < 5; i++) setCard(game, hand[i], 4, 4);
        expect(chooseCommand(game)).toEqual({ type: 'clue', target: 1, kind: 'rank', value: 5 });
    });

    it('CPU 同士の平均点が 15点以上（2人、40試合）', () => {
        let total = 0;
        for (let seed = 1; seed <= 40; seed++) {
            const game = new Game(CPUS(2), { seed: seed * 7 });
            while (isCpuTurn(game)) runCpuStep(game);
            total += game.score;
        }
        expect(total / 40).toBeGreaterThan(15);
    });

    it('人がいる試合でも、人の番では動かない', () => {
        const game = new Game(PLAYERS(2), { seed: 1 });
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(false);
    });
});
