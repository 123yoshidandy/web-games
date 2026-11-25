import { describe, it, expect } from 'vitest';
import { createGameView } from '../public/js/game-view.js';
import { describeEvent } from '../public/js/log.js';
import { setupRound, play } from './helpers.js';

const lines = (game, seat) => {
    const view = createGameView(game, seat);
    return view.events.map(e => describeEvent(e, view)).filter(Boolean);
};

describe('記録の文', () => {
    it('道化で見た手札は、見た人にだけ「（あなただけ）」付きで書く', () => {
        const game = setupRound({ hands: [[2, 4], [7], [5]] });
        play(game, 0, 2, 1);
        expect(lines(game, 0)).toContain('P1の手札は「将軍」（あなただけ）');
        expect(lines(game, 2)).toContain('P0がP1の手札を見た');
        expect(lines(game, 2).join()).not.toContain('将軍');
    });

    it('兵士は、誰に何と言ったかと、当たり・はずれを書く', () => {
        const game = setupRound({ hands: [[1, 4], [7], [5]] });
        play(game, 0, 1, 1, 7);
        const text = lines(game, 2);
        expect(text).toContain('P0が「兵士」を出した（→ P1）、「将軍」と言った');
        expect(text).toContain('当たり');
        expect(text).toContain('P1が脱落（将軍）');
    });

    it('将軍の交換は、交換した人から見た向きで書く', () => {
        const game = setupRound({ hands: [[7, 2], [9], [3]] });
        play(game, 0, 7, 1);
        expect(lines(game, 0).join()).toContain('あなたは「道化」を渡し、「姫」を受け取った');
        expect(lines(game, 1).join()).toContain('あなたは「姫」を渡し、「道化」を受け取った');
        expect(lines(game, 2).join()).toContain('P0とP1が手札を交換した');
    });

    it('引いたカードは、自分の分だけ書く', () => {
        const game = setupRound({ hands: [[4, 2], [3], [5]], deck: [1, 6] });
        play(game, 0, 4);
        expect(lines(game, 1)).toContain('あなたは「宰相」を引いた');
        expect(lines(game, 2).join()).not.toContain('宰相');
    });
});
