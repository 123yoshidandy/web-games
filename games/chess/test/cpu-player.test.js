import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { decide, runCpuStep, think, wantsDraw, CPU_LEVELS, LEVELS } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { search, evaluate, MATE } from '../public/js/engine.js';
import { Position } from '../public/js/rules.js';
import { runMatches } from '../scripts/cpu-match.mjs';
import { newGame, play } from './helpers.js';

const viewOf = (fen, seat = null) => {
    const game = newGame([false, false], { fen });
    return createGameView(game, seat ?? game.current);
};
const uci = (command) => command.from + command.to + (command.promo ?? '');

describe('CPU の手', () => {
    it('どの強さも、1手でメイトできるならメイトする', () => {
        const view = viewOf('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
        CPU_LEVELS.forEach(level => expect(uci(decide(view, level)), level).toBe('a1a8'));
    });

    it('どの強さも、ただで取れるクイーンは取る', () => {
        const view = viewOf('rnb1kbnr/pppp1ppp/8/4p3/3qP3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 1');
        CPU_LEVELS.filter(l => l !== 'easy').forEach(level => expect(uci(decide(view, level)), level).toBe('f3d4'));
    });

    it('つよい・とてもつよいは、2手でメイトする手順を見つける', () => {
        const view = viewOf('r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1');
        ['strong', 'expert'].forEach(level => expect(uci(decide(view, level)), level).toBe('d5f6'));
    });

    it('ふつう以上は、取られるクイーンを逃がす', () => {
        // 白のクイーンが d4 でポーンに当たっている
        const view = viewOf('rnbqkbnr/pp3ppp/4p3/2pp4/3Q4/4P3/PPPP1PPP/RNB1KBNR w KQkq - 0 4');
        ['normal', 'strong', 'expert'].forEach(level => {
            const command = decide(view, level);
            expect(command.from, level).toBe('d4');
        });
    });

    it('昇格の手は、成る駒を付けて返す（今成らないと、黒のキングにポーンを取られる）', () => {
        const command = decide(viewOf('8/P7/2k5/8/8/8/8/K7 w - - 0 1'), 'normal');
        expect(command).toEqual({ type: 'move', from: 'a7', to: 'a8', promo: 'q' });
    });

    it('同じ局面なら同じ手を返す（ゲームの乱数を使わない）', () => {
        const game = play(newGame(), 'e2e4 e7e5 g1f3');
        const view = createGameView(game, 1);
        CPU_LEVELS.forEach(level => expect(decide(view, level), level).toEqual(decide(structuredClone(view), level)));
    });

    it('手番でないとき・終わったあとは何もしない', () => {
        const game = newGame();
        expect(decide(createGameView(game, 1), 'normal')).toBe(null);
        play(game, 'f2f3 e7e5 g2g4 d8h4');
        expect(decide(createGameView(game, 0), 'normal')).toBe(null);
    });

    it('勝っている側は、同じ局面を繰り返して引き分けにしない', () => {
        // 白はクイーン得。黒のキングを追い回すうちに、同じ局面を3回にしない
        const game = new Game([{ name: 'A', isCPU: true, cpuLevel: 'strong' }, { name: 'B', isCPU: true, cpuLevel: 'strong' }], { fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1' });
        for (let i = 0; i < 120 && !game.isOver(); i++) runCpuStep(game);
        expect(game.result).toEqual({ winner: 0, reason: 'checkmate' });
    });
});

describe('読み', () => {
    it('局面の数で打ち切る（時間ではない）。打ち切っても局面は元に戻る', () => {
        const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
        const pos = new Position(fen);
        const a = search(pos, { maxDepth: 30, nodeLimit: 30000 });
        const b = search(pos, { maxDepth: 30, nodeLimit: 30000 });
        expect(a.nodes).toBeLessThanOrEqual(30010);
        expect([a.move, a.score, a.depth]).toEqual([b.move, b.score, b.depth]);
        expect(pos.fen()).toBe(fen);
    });

    it('メイトされた側・ステイルメイトの局面は、手がない', () => {
        expect(search(new Position('k7/8/1Q6/8/8/8/8/7K b - - 0 1')).move).toBe(0);
    });

    it('点は手番の側から見る。駒が多い側が高い', () => {
        const pos = new Position('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
        expect(evaluate(pos)).toBeGreaterThan(500);
        expect(evaluate(new Position('4k3/8/8/8/8/8/8/3QK3 b - - 0 1'))).toBeLessThan(-500);
    });

    it('メイトの点は、近いメイトほど高い', () => {
        const r = search(new Position('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), { maxDepth: 4 });
        expect(r.score).toBe(MATE - 1);
    });

    it('どの強さも、局面の数に上限がある（スマホで1手が数秒以内に収まるように）', () => {
        CPU_LEVELS.forEach(level => expect(LEVELS[level].nodeLimit, level).toBeLessThanOrEqual(600000));
        const view = createGameView(play(newGame(), 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6'), 0);
        expect(think(view, 'expert').nodes).toBeLessThanOrEqual(600010);
    });
});

describe('引き分けの提案への答え', () => {
    it('負けている CPU は受け、勝っている CPU は断る', () => {
        // 白（人）が提案し、黒（CPU）が答える
        const losing = newGame([false, true], { fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1' });
        losing.applyCommand(0, { type: 'offerDraw' });
        expect(wantsDraw(createGameView(losing, 1), 'normal')).toBe(true);
        const winning = newGame([false, true], { fen: '3qk3/8/8/8/8/8/8/4K3 w - - 0 1' });
        winning.applyCommand(0, { type: 'offerDraw' });
        expect(wantsDraw(createGameView(winning, 1), 'normal')).toBe(false);
        expect(decide(createGameView(winning, 1), 'normal')).toEqual({ type: 'declineDraw' });
    });

    it('序盤の互角の局面では、やさしい以外は断る', () => {
        const game = play(newGame([false, true]), 'e2e4 e7e5');
        game.applyCommand(0, { type: 'offerDraw' });
        const view = createGameView(game, 1);
        ['normal', 'strong', 'expert'].forEach(level => expect(wantsDraw(view, level), level).toBe(false));
    });

    it('runCpuStep は提案に答える', () => {
        const game = newGame([false, true], { fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1' });
        game.applyCommand(0, { type: 'offerDraw' });
        expect(runCpuStep(game)).toBe(true);
        expect(game.result).toEqual({ winner: null, reason: 'agreement' });
    });
});

describe('CPU どうしの対戦', () => {
    it('最後まで進み、強いほど勝ち越す（ふつう 対 やさしい）', () => {
        const r = runMatches({ games: 6, a: 'normal', b: 'easy' });
        expect(r.stuck).toBe(0);
        expect(r.winsA).toBeGreaterThan(r.winsB);
    });

    // つよい 対 ふつう・とてもつよい 対 つよい は時間がかかるので、scripts/cpu-match.mjs で測る（README に結果を書く）
    it('つよい 対 やさしい も最後まで進み、つよいが全部勝つ', () => {
        const r = runMatches({ games: 2, a: 'strong', b: 'easy' });
        expect(r.stuck).toBe(0);
        expect(r.winsA).toBe(2);
    });
});
