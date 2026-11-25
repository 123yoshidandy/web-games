import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { CARD_TYPES } from '../public/js/cards.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand, guessHolders, planBuilds } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { players, newGame, setHand, setCity, arrange, playUntil } from './helpers.js';

describe('CPU どうしの試合', () => {
    it('人数（2〜7）・強さ・シードを変えても、最後まで進む', () => {
        for (const count of [2, 3, 4, 5, 6, 7]) {
            for (const levels of [Array(count).fill('easy'), Array(count).fill('normal'), Array.from({ length: count }, (_, i) => (i % 2 ? 'normal' : 'easy'))]) {
                const r = runMatches({ games: 8, count, levels, seedBase: count * 100 });
                expect(r.stuck, `${count}人 ${levels.join(',')}`).toBe(0);
                expect(r.finished).toBe(8);
            }
        }
    });

    it('ふつうは、やさしいに勝ち越す（2人・4人）', () => {
        const two = runMatches({ games: 200, count: 2, levels: ['easy', 'normal'] });
        expect(two.wins[1] / two.finished).toBeGreaterThan(0.65);
        const four = runMatches({ games: 200, count: 4, levels: ['easy', 'normal', 'easy', 'normal'] });
        expect((four.wins[1] + four.wins[3]) / four.finished).toBeGreaterThan(0.6);
    });
});

describe('CPU の判断', () => {
    it('ほかの人の手札・山の並び・伏せた役割が変わっても、同じ手を選ぶ（のぞかない）', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const a = new Game(players(4, true).map(p => ({ ...p, cpuLevel: 'normal' })), { seed });
            let guard = 0;
            while (!a.isOver() && guard++ < 40 + seed * 7) {
                const seat = a.actors()[0];
                a.applyCommand(seat, chooseCommand(a, seat));
            }
            if (a.isOver()) continue;
            const seat = a.actors()[0];
            const b = Game.replay(a.persist().players, a.options, a.persist().commands);
            // 見えないものを入れ替える：ほかの人の手札どうし、山の並び、伏せた役割
            const others = b.players.filter(p => p.id !== seat);
            if (others.length >= 2) [others[0].hand, others[1].hand] = [others[1].hand, others[0].hand];
            b.deck.reverse();
            if (b.draft.faceDown.length > 1) b.draft.faceDown.reverse();
            expect(chooseCommand(b, seat)).toEqual(chooseCommand(a, seat));
        }
    });

    it('推測：自分が選んだときの候補になかった役割は、前に選んだ人が持っていると見る', () => {
        const game = new Game(players(4, true), { seed: 6, crown: 0 });
        const d = game.draft;
        // 席0と席1が選んだあとで、席2が選ぶ
        game.applyCommand(0, { type: 'pick', character: d.available[0] });
        const firstTaken = game.players[0].characters[0];
        game.applyCommand(1, { type: 'pick', character: game.draftOptions()[0] });
        const secondTaken = game.players[1].characters[0];
        game.applyCommand(2, { type: 'pick', character: game.draftOptions()[0] });
        game.applyCommand(3, { type: 'pick', character: game.draftOptions()[0] });
        const view = createGameView(game, 2);
        const guess = guessHolders(view);
        // 席0と席1の役割は、席3には渡っていない
        expect(guess[firstTaken]['3']).toBeUndefined();
        expect(guess[secondTaken]['3']).toBeUndefined();
        expect((guess[firstTaken]['0'] ?? 0) + (guess[firstTaken]['1'] ?? 0)).toBeGreaterThan(0.5);
        // 席3の役割は、自分より後に選んだ席3だけが持ちうる
        const last = game.players[3].characters[0];
        expect(Object.keys(guess[last]).sort()).toEqual(['3', 'faceDown']);
    });

    // 席1が選んだあとに席2（CPU）が role を選ぶ。席2の候補になかった役割（表で捨てた札を除く）は、席1か最初に伏せた札
    function afterFirstPick(role, prepare) {
        for (let seed = 1; ; seed++) {
            const game = new Game(players(4, true).map(p => ({ ...p, cpuLevel: 'normal' })), { seed, crown: 1 });
            if (!game.draft.available.includes(role) || !game.draft.available.includes('assassin') === (role === 'assassin')) continue;
            prepare(game);
            const taken = game.draft.available.find(c => c !== role && c !== 'assassin');
            game.applyCommand(1, { type: 'pick', character: taken });
            const offer = game.draftOptions();
            game.applyCommand(2, { type: 'pick', character: role });
            game.applyCommand(3, { type: 'pick', character: game.draftOptions().find(c => c !== 'assassin') });
            game.applyCommand(0, { type: 'pick', character: game.draftOptions().find(c => c !== 'assassin') });
            const seat1 = ['magician', 'king', 'bishop', 'merchant', 'architect', 'warlord', 'thief']
                .filter(c => !offer.includes(c) && !game.draft.faceUp.includes(c));
            return { game, seat1 };
        }
    }

    it('暗殺者（ふつう）は、完成が近い人が持っていそうな役割を狙う', () => {
        const { game, seat1 } = afterFirstPick('assassin', g => setCity(g, 1, ['manor', 'temple', 'tavern', 'watchtower', 'castle', 'church', 'market']));
        expect(game.turn.character).toBe('assassin');
        const command = chooseCommand(game, 2);
        expect(command.type).toBe('assassinate');
        expect(seat1).toContain(command.character);
    });

    it('盗賊（ふつう）は、金を多く持つ人が持っていそうな役割を狙う', () => {
        const { game, seat1 } = afterFirstPick('thief', g => { g.players[1].gold = 12; });
        playUntil(game, 'thief');
        const command = chooseCommand(game, 2);
        expect(command.type).toBe('steal');
        expect(seat1).toContain(command.character);
    });

    it('建てる順：建築家は、今の金で建てられる組み合わせのうち、値打ちの合計が一番高いものを選ぶ', () => {
        const game = newGame(4);
        arrange(game, { 0: ['architect'] });
        setHand(game, 0, ['palace', 'temple', 'tavern', 'watchtower', 'manor']);
        setCity(game, 0, []);
        playUntil(game, 'architect');
        game.applyCommand(0, { type: 'gold' });
        game.players[0].gold = 5;
        const plan = planBuilds(createGameView(game, 0)).map(id => CARD_TYPES[id]);
        // 5金：宮殿だけ（5点・1色）より、寺院・酒場・見張り塔（3点・3色）か、屋敷と1金の札の組み合わせ
        expect(plan).toHaveLength(3);
        expect(plan.reduce((s, t) => s + ({ palace: 5, temple: 1, tavern: 1, watchtower: 1, manor: 3 })[t], 0)).toBeLessThanOrEqual(5);
    });

    it('収入の色の地区を建てられるなら、建ててから収入を受け取る', () => {
        const game = newGame(4);
        arrange(game, { 0: ['king'] });
        game.players[0].isCPU = true;
        game.players[0].cpuLevel = 'normal';
        setHand(game, 0, ['manor']);
        setCity(game, 0, ['castle']);
        playUntil(game, 'king');
        game.applyCommand(0, { type: 'gold' });
        game.players[0].gold = 3;
        const manor = game.players[0].hand[0];
        expect(chooseCommand(game, 0)).toEqual({ type: 'build', card: manor });
        game.applyCommand(0, { type: 'build', card: manor });
        expect(chooseCommand(game, 0)).toEqual({ type: 'income' });
    });
});
