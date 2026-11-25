import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createRandom } from '../public/js/random.js';
import { newGame, play, mv, snapshot, players } from './helpers.js';

describe('始まり', () => {
    it('白（席0）が先手で、合法手は20', () => {
        const game = newGame();
        expect(game.current).toBe(0);
        expect(game.actors()).toEqual([0]);
        expect(game.moves()).toHaveLength(20);
    });
});

describe('断る操作', () => {
    it('手番でない人・動かせない手・知らない操作は断り、状態を変えない', () => {
        const game = newGame();
        play(game, 'e2e4');
        const before = snapshot(game);
        const bad = [
            [0, mv('d2d4')], [1, mv('e7e6').from && { type: 'move', from: 'e7', to: 'e4' }], [1, { type: 'move', from: 'z9', to: 'e5' }],
            [1, { type: 'move', from: 'e7', to: 'e5', promo: 'k' }], [1, { type: 'pass' }], [1, null], [1, 'move'],
            [2, mv('e7e5')], [1, { type: 'acceptDraw' }], [0, { type: 'offerDraw' }], [1, { type: 'declineDraw' }]
        ];
        bad.forEach(([seat, command]) => {
            expect(game.applyCommand(seat, command)).toBe(false);
            expect(game.lastError).toBeTruthy();
        });
        expect(snapshot(game)).toBe(before);
    });

    it('ランダムな操作を大量に送っても、断った操作では状態が変わらない', () => {
        const random = createRandom(3);
        const game = newGame();
        const squares = 'abcdefgh'.split('').flatMap(f => '12345678'.split('').map(r => f + r));
        const pickSq = () => squares[Math.floor(random() * 64)];
        for (let i = 0; i < 3000 && !game.isOver(); i++) {
            const before = snapshot(game);
            const types = ['move', 'move', 'move', 'offerDraw', 'acceptDraw', 'declineDraw'];
            const command = { type: types[Math.floor(random() * types.length)], from: pickSq(), to: pickSq() };
            if (random() < 0.1) command.promo = 'qrbnk'[Math.floor(random() * 5)];
            const seat = Math.floor(random() * 2);
            if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
            // ときどき合法手を指して進める
            if (random() < 0.3 && game.drawOffer === null && !game.isOver()) {
                const moves = game.moves();
                const m = moves[Math.floor(random() * moves.length)];
                game.applyCommand(game.current, m.promo ? { type: 'move', ...m } : { type: 'move', from: m.from, to: m.to });
            }
        }
    });
});

describe('終わり', () => {
    it('チェックメイト（フールズメイト）で黒の勝ち', () => {
        const game = play(newGame(), 'f2f3 e7e5 g2g4 d8h4');
        expect(game.isOver()).toBe(true);
        expect(game.result).toEqual({ winner: 1, reason: 'checkmate' });
        expect(game.history.at(-1).san).toBe('Qh4#');
        expect(game.applyCommand(0, mv('a2a3'))).toBe(false);
    });

    it('ステイルメイトは引き分け', () => {
        const game = play(newGame([false, false], { fen: 'k7/8/2Q5/8/8/8/8/7K w - - 0 1' }), 'c6b6');
        expect(game.result).toEqual({ winner: null, reason: 'stalemate' });
    });

    it('同じ局面が3回現れたら引き分け', () => {
        const game = play(newGame(), 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1');
        expect(game.isOver()).toBe(false);
        play(game, 'f6g8');
        expect(game.result).toEqual({ winner: null, reason: 'repetition' });
    });

    it('アンパッサンで取れる局面と取れない局面は、同じ局面に数えない', () => {
        const game = play(newGame([false, false], { fen: 'rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2' }), 'd7d5');
        // d5 の直後（e5 のポーンで取れる）と同じ配置が、取れない形で2回現れても、まだ2回目までしか数えない
        play(game, 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');
        expect(game.isOver()).toBe(false);
        // ナイトが f3 にいる局面は3回目
        play(game, 'g1f3');
        expect(game.result?.reason).toBe('repetition');
    });

    it('50手（100手目）で引き分け。ただし、その手でメイトならメイトが優先', () => {
        const draw = play(newGame([false, false], { fen: 'k7/8/1K6/8/8/8/8/7R w - - 99 80' }), 'h1h2');
        expect(draw.result).toEqual({ winner: null, reason: 'fifty' });
        const mate = play(newGame([false, false], { fen: 'k7/8/1K6/8/8/8/8/7R w - - 99 80' }), 'h1h8');
        expect(mate.result).toEqual({ winner: 0, reason: 'checkmate' });
        // ポーンを動かすか駒を取ると、数え直す
        const reset = play(newGame([false, false], { fen: 'k7/8/1K6/8/8/8/P7/7R w - - 99 80' }), 'a2a3');
        expect(reset.isOver()).toBe(false);
        expect(reset.pos.halfmove).toBe(0);
    });

    it('取ってキングだけになったら、駒不足で引き分け', () => {
        const game = play(newGame([false, false], { fen: 'k7/8/8/8/8/8/1q6/K7 w - - 0 1' }), 'a1b2');
        expect(game.result).toEqual({ winner: null, reason: 'material' });
    });

    it('投了は、手番でない人もいつでもできる', () => {
        const game = play(newGame(), 'e2e4');
        expect(game.applyCommand(0, { type: 'resign' })).toBe(true);
        expect(game.result).toEqual({ winner: 1, reason: 'resign' });
        expect(game.applyCommand(1, { type: 'resign' })).toBe(false);
    });
});

describe('引き分けの提案', () => {
    it('自分の番に提案し、相手が答える。断られたら提案した人が指す。同じ手番で2回は提案できない', () => {
        const game = play(newGame(), 'e2e4');
        expect(game.canOfferDraw(0)).toBe(false);
        expect(game.applyCommand(1, { type: 'offerDraw' })).toBe(true);
        expect(game.actors()).toEqual([0]);
        // 答えるまでは、提案した人も指せない
        expect(game.applyCommand(1, mv('e7e5'))).toBe(false);
        expect(game.applyCommand(1, { type: 'acceptDraw' })).toBe(false);
        expect(game.applyCommand(0, { type: 'declineDraw' })).toBe(true);
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(1, { type: 'offerDraw' })).toBe(false);
        play(game, 'e7e5');
        expect(game.applyCommand(0, { type: 'offerDraw' })).toBe(true);
        expect(game.applyCommand(1, { type: 'acceptDraw' })).toBe(true);
        expect(game.result).toEqual({ winner: null, reason: 'agreement' });
    });

    it('提案中でも投了できる', () => {
        const game = newGame();
        game.applyCommand(0, { type: 'offerDraw' });
        expect(game.applyCommand(1, { type: 'resign' })).toBe(true);
        expect(game.result).toEqual({ winner: 0, reason: 'resign' });
    });
});

describe('特別な手', () => {
    it('昇格は成る駒を選ばないと断り、選んだ駒になる', () => {
        const game = newGame([false, false], { fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1' });
        expect(game.applyCommand(0, mv('a7a8'))).toBe(false);
        expect(game.lastError).toBe('成る駒を選んでください');
        expect(game.applyCommand(0, mv('a7a8n'))).toBe(true);
        expect(game.pos.fen().startsWith('N6k/')).toBe(true);
        expect(game.history.at(-1)).toMatchObject({ san: 'a8=N', promo: 'n' });
        // 成らない手に promo を付けても断る
        const g2 = newGame();
        expect(g2.applyCommand(0, mv('e2e4q'))).toBe(false);
    });

    it('キャスリングはキングを2マス動かして指し、ルークも動く', () => {
        const game = play(newGame(), 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1');
        expect(game.history.at(-1)).toMatchObject({ san: 'O-O', rookFrom: 'h1', rookTo: 'f1' });
        expect(game.pos.fen().split(' ')[0]).toBe('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1');
    });

    it('アンパッサンで取った駒を数え、取った升を記録する', () => {
        const game = play(newGame(), 'e2e4 a7a6 e4e5 d7d5 e5d6');
        expect(game.history.at(-1)).toMatchObject({ san: 'exd6', captured: 'p', capturedAt: 'd5' });
        expect(game.capturedPieces()).toEqual([['p'], []]);
    });
});

describe('記録と再現', () => {
    it('ランダムな対局が最後まで進み、記録から同じ状態を再現できる', () => {
        const reasons = new Set();
        for (let seed = 1; seed <= 30; seed++) {
            const random = createRandom(seed);
            const game = new Game(players([false, false]));
            for (let i = 0; i < 1200 && !game.isOver(); i++) {
                if (random() < 0.01) game.applyCommand(game.current, { type: 'offerDraw' });
                if (game.drawOffer !== null) {
                    game.applyCommand(1 - game.drawOffer, { type: random() < 0.2 ? 'acceptDraw' : 'declineDraw' });
                    continue;
                }
                const moves = game.moves();
                const m = moves[Math.floor(random() * moves.length)];
                expect(game.applyCommand(game.current, m.promo ? { type: 'move', ...m } : { type: 'move', from: m.from, to: m.to })).toBe(true);
            }
            expect(game.isOver()).toBe(true);
            reasons.add(game.result.reason);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
        // ランダムに指すと、いろいろな終わり方になる
        expect(reasons.size).toBeGreaterThanOrEqual(3);
    });

    it('途中の局面から始めた対局も再現できる', () => {
        const options = { fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' };
        const game = play(newGame([false, false], options), 'e1c1 e8g8 d5e6');
        const restored = Game.replay(game.persist().players, game.persist().options, game.persist().commands);
        expect(restored.pos.fen()).toBe(game.pos.fen());
        expect(restored.history.map(h => h.san)).toEqual(['O-O-O', 'O-O', 'dxe6']);
    });
});
