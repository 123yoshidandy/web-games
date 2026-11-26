import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import LocalGameController from '../public/js/game-controller.js';
import { runCpuStep, suggest } from '../public/js/cpu-player.js';
import { deckOptions, PLAYERS } from './helpers.js';

describe('ヒント', () => {
    it('手番の人には通る操作を返し、選択待ちや相手の番には返さない。ヒントを見ても記録は変わらない', () => {
        const game = new Game(PLAYERS.map(player => ({ ...player, isCPU: true })), deckOptions(3));
        game.setup();
        let checked = 0;
        for (let step = 0; step < 200 && game.phase !== 'end' && checked < 6; step++) {
            if (game.phase === 'main' && !game.pendingPrompt) {
                const me = game.current;
                expect(suggest(game, 1 - me)).toBeNull();
                const before = game.commands.length;
                const command = suggest(game, me);
                expect(command).toBeTruthy();
                expect(game.commands.length).toBe(before);
                expect(game.applyCommand(me, command)).toBe(true);
                checked++;
            } else {
                if (game.pendingPrompt) expect(suggest(game, game.pendingPrompt.player.id)).toBeNull();
                runCpuStep(game);
            }
        }
        expect(checked).toBe(6);
    });

    it('CPU 対戦のコントローラーは、自分の番でなければ null を返す', () => {
        const { seed, decks } = deckOptions(5);
        const controller = new LocalGameController({ name: 'あなた', decks, seed });
        const game = controller.game;
        const hint = controller.hint();
        if (game.phase === 'main' && !game.pendingPrompt && game.current === 0) expect(hint).toBeTruthy();
        else expect(hint).toBeNull();
        controller.stop();
    });
});
