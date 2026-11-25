import { describe, it, expect } from 'vitest';
import { Position, perft, toSan, findMove, moveToUci, moveFlag, FLAG_EP, FLAG_CASTLE, START_FEN } from '../public/js/rules.js';
import { createRandom } from '../public/js/random.js';

// よく知られた局面の perft の値（https://www.chessprogramming.org/Perft_Results）
const PERFT = [
    ['初期局面', START_FEN, [20, 400, 8902, 197281, 4865609]],
    ['Kiwipete（キャスリング・アンパッサン・昇格が混ざる）', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
    ['Position 3（ピンとアンパッサン）', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
    ['Position 4（昇格とチェック）', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
    ['Position 4 の左右・色を入れ替えた形', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467, 422333]],
    ['Position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
    ['Position 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]]
];

const uciList = (pos) => pos.legalMoves().map(moveToUci).sort();
const sanOf = (fen, uci) => {
    const pos = new Position(fen);
    const legal = pos.legalMoves();
    return toSan(pos, findMove(legal, uci.slice(0, 2), uci.slice(2, 4), uci.slice(4)), legal);
};

describe('perft（指し手の生成の数を、知られた値と比べる）', () => {
    PERFT.forEach(([name, fen, counts]) => {
        it(name, () => {
            const pos = new Position(fen);
            counts.forEach((count, i) => expect(perft(pos, i + 1), `深さ ${i + 1}`).toBe(count));
            // 数え終わったら元の局面に戻っている
            expect(pos.fen()).toBe(fen);
        });
    });
});

describe('局面', () => {
    it('FEN を読み書きできる', () => {
        PERFT.forEach(([, fen]) => expect(new Position(fen).fen()).toBe(fen));
    });

    it('指して戻すと、局面と指紋が元どおりになる。差分で更新した指紋は、一から計算したものと同じ', () => {
        const random = createRandom(7);
        for (let game = 0; game < 20; game++) {
            const pos = new Position(PERFT[game % PERFT.length][1]);
            const fens = [];
            const hashes = [];
            for (let ply = 0; ply < 60; ply++) {
                const legal = pos.legalMoves();
                if (!legal.length) break;
                fens.push(pos.fen());
                hashes.push([pos.hashLo, pos.hashHi]);
                pos.makeUnchecked(legal[Math.floor(random() * legal.length)]);
                const [lo, hi] = [pos.hashLo, pos.hashHi];
                pos.computeHash();
                expect([pos.hashLo, pos.hashHi]).toEqual([lo, hi]);
            }
            while (fens.length) {
                pos.unmake();
                expect(pos.fen()).toBe(fens.pop());
                expect([pos.hashLo, pos.hashHi]).toEqual(hashes.pop());
            }
        }
    });
});

describe('キャスリング', () => {
    const base = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

    it('条件がそろえば両側にできる', () => {
        expect(uciList(new Position(base))).toEqual(expect.arrayContaining(['e1g1', 'e1c1']));
        expect(uciList(new Position(base.replace(' w ', ' b ')))).toEqual(expect.arrayContaining(['e8g8', 'e8c8']));
    });

    it('チェックされているとできない', () => {
        const moves = uciList(new Position('r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1'));
        expect(moves).not.toContain('e1g1');
        expect(moves).not.toContain('e1c1');
    });

    it('キングが通る升・着く升が攻撃されているとできない。b1 だけが攻撃されている長い側はできる', () => {
        expect(uciList(new Position('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1'))).not.toContain('e1g1'); // f1 が攻撃されている
        expect(uciList(new Position('r3k2r/8/8/8/8/8/6r1/R3K2R w KQkq - 0 1'))).not.toContain('e1g1'); // g1
        expect(uciList(new Position('r3k2r/8/8/8/8/8/3r4/R3K2R w KQkq - 0 1'))).not.toContain('e1c1'); // d1
        expect(uciList(new Position('r3k2r/8/8/8/8/8/2r5/R3K2R w KQkq - 0 1'))).not.toContain('e1c1'); // c1
        expect(uciList(new Position('r3k2r/8/8/8/8/8/1r6/R3K2R w KQkq - 0 1'))).toContain('e1c1');    // b1 は通らない
    });

    it('間に駒があるとできない（長い側は b1 の駒でもできない）', () => {
        expect(uciList(new Position('r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1'))).not.toEqual(expect.arrayContaining(['e1c1']));
        expect(uciList(new Position('r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1'))).not.toContain('e1g1');
    });

    it('キングかルークが動いたら、その権利はなくなる（戻ってきても）。取られたルークの側もなくなる', () => {
        const pos = new Position(base);
        const play = (uci) => pos.makeUnchecked(findMove(pos.legalMoves(), uci.slice(0, 2), uci.slice(2, 4)));
        play('h1h2'); play('a8a7'); play('h2h1'); play('a7a8');
        const moves = uciList(pos);
        expect(moves).not.toContain('e1g1');
        expect(moves).toContain('e1c1');
        expect(pos.fen().split(' ')[2]).toBe('Qk');
        // 白のルークが h8 を取ると、黒の短い側の権利が消える
        const p2 = new Position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
        p2.makeUnchecked(findMove(p2.legalMoves(), 'h1', 'h8'));
        expect(p2.fen().split(' ')[2]).toBe('Qq');
    });

    it('キャスリングでルークも動き、戻すと元に戻る', () => {
        const pos = new Position(base);
        const m = findMove(pos.legalMoves(), 'e1', 'c1');
        expect(moveFlag(m)).toBe(FLAG_CASTLE);
        pos.makeUnchecked(m);
        expect(pos.fen()).toBe('r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1');
        pos.unmake();
        expect(pos.fen()).toBe(base);
    });
});

describe('アンパッサン', () => {
    it('2マス進んだ直後の1手だけ取れる', () => {
        const pos = new Position('rnbqkbnr/ppp1pppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2'.replace('ppp1pppp', 'pppppppp'));
        const play = (uci) => pos.makeUnchecked(findMove(pos.legalMoves(), uci.slice(0, 2), uci.slice(2, 4)));
        play('d7d5');
        const ep = pos.legalMoves().find(m => moveFlag(m) === FLAG_EP);
        expect(moveToUci(ep)).toBe('e5d6');
        pos.makeUnchecked(ep);
        expect(pos.fen()).toBe('rnbqkbnr/ppp1pppp/3P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3');
        pos.unmake();
        play('g1f3');
        play('g8f6');
        expect(pos.legalMoves().some(m => moveFlag(m) === FLAG_EP)).toBe(false);
    });

    it('取ると横から自分のキングが攻撃される形では取れない', () => {
        expect(uciList(new Position('8/8/8/KPp4r/8/8/8/7k w - c6 0 2'))).not.toContain('b5c6');
        expect(uciList(new Position('8/8/8/KPp5/8/8/8/7k w - c6 0 2'))).toContain('b5c6');
    });

    it('取れるポーンが隣にいないときは、アンパッサンの升を立てない', () => {
        const pos = new Position();
        pos.makeUnchecked(findMove(pos.legalMoves(), 'e2', 'e4'));
        expect(pos.fen().split(' ')[3]).toBe('-');
    });
});

describe('プロモーション', () => {
    it('4種類のどれにも成れる。取りながらでも成れる', () => {
        const moves = uciList(new Position('1n5k/P7/8/8/8/8/8/K7 w - - 0 1'));
        ['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n', 'a7b8q', 'a7b8r', 'a7b8b', 'a7b8n'].forEach(m => expect(moves).toContain(m));
        expect(moves).not.toContain('a7a8');
    });

    it('成った駒が盤に残り、戻すとポーンに戻る', () => {
        const fen = '1n5k/P7/8/8/8/8/8/K7 w - - 0 1';
        const pos = new Position(fen);
        pos.makeUnchecked(findMove(pos.legalMoves(), 'a7', 'b8', 'n'));
        expect(pos.fen()).toBe('1N5k/8/8/8/8/8/8/K7 b - - 0 1');
        pos.unmake();
        expect(pos.fen()).toBe(fen);
    });
});

describe('代数式表記（SAN）', () => {
    it('ふつうの手・取る手・ポーンの取り', () => {
        expect(sanOf(START_FEN, 'e2e4')).toBe('e4');
        expect(sanOf(START_FEN, 'g1f3')).toBe('Nf3');
        expect(sanOf('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5')).toBe('exd5');
    });

    it('同じ種類の駒が同じ升へ行けるときは、列・段・両方で区別する', () => {
        expect(sanOf('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1', 'b1d2')).toBe('Nbd2');
        expect(sanOf('4k3/8/8/8/R7/8/8/R3K3 w - - 0 1', 'a1a2')).toBe('R1a2');
        expect(sanOf('4k3/8/8/8/7Q/8/8/4K2Q w - - 0 1', 'h4h2')).toBe('Q4h2');
        expect(sanOf('2k5/8/8/8/4Q2Q/8/8/K6Q w - - 0 1', 'h4e1')).toBe('Qh4e1');
    });

    it('キャスリング・アンパッサン・昇格・チェック・メイト', () => {
        expect(sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')).toBe('O-O');
        expect(sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1')).toBe('O-O-O');
        expect(sanOf('8/8/8/KPp5/8/8/8/7k w - c6 0 2', 'b5c6')).toBe('bxc6');
        expect(sanOf('4k3/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8q')).toBe('a8=Q+');
        expect(sanOf('4k3/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8n')).toBe('a8=N');
        expect(sanOf('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'd8h4')).toBe('Qh4#');
    });
});

describe('駒不足', () => {
    it('キングだけ・小駒1つ・同じ色の升のビショップだけなら、どちらもメイトできない', () => {
        ['k7/8/8/8/8/8/8/K7 w - - 0 1', 'k7/8/8/8/8/8/8/KB6 w - - 0 1', 'k7/8/8/8/8/8/8/KN6 w - - 0 1',
            'k1b5/8/8/8/8/8/8/KB6 w - - 0 1', 'k7/8/8/8/8/8/8/K1B1B3 w - - 0 1']
            .forEach(fen => expect(new Position(fen).insufficientMaterial(), fen).toBe(true));
    });

    it('ポーン・ルーク・クイーン、違う色の升のビショップ、ナイト2つ、ナイトとビショップは足りる', () => {
        ['k7/8/8/8/8/8/P7/K7 w - - 0 1', 'k7/8/8/8/8/8/8/KR6 w - - 0 1', 'kb6/8/8/8/8/8/8/KB6 w - - 0 1',
            'k7/8/8/8/8/8/8/KNN5 w - - 0 1', 'k7/8/8/8/8/8/8/KNB5 w - - 0 1', 'kn6/8/8/8/8/8/8/KB6 w - - 0 1']
            .forEach(fen => expect(new Position(fen).insufficientMaterial(), fen).toBe(false));
    });
});
