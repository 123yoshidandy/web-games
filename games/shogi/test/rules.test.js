import { describe, it, expect } from 'vitest';
import {
    Position, perft, sqOf, makeMove, makeDrop, moveFrom, moveTo, isDrop, dropType, isPromote,
    SENTE, GOTE, FU, KY, KE, GI, KI, KA, HI, OU, TO, NY, NK, NG, UM, RY, PROMOTE
} from '../public/js/rules.js';
import { createRandom } from '../public/js/random.js';

// ---- 素朴な合法手の生成（rules.js とは別の書き方。突き合わせに使う） ----
// 筋 f・段 r で考える。先手から見て「前」は段が小さくなる向き。後手は前後左右を逆にする

const fr = (sq) => [9 - (sq % 9), Math.floor(sq / 9) + 1];
const KING8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const GOLD6 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]];
const NAIVE_STEP = {
    [FU]: [[0, -1]], [KE]: [[1, -2], [-1, -2]], [GI]: [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]],
    [KI]: GOLD6, [TO]: GOLD6, [NY]: GOLD6, [NK]: GOLD6, [NG]: GOLD6, [OU]: KING8,
    [UM]: [[0, -1], [0, 1], [-1, 0], [1, 0]], [RY]: [[-1, -1], [1, -1], [-1, 1], [1, 1]]
};
const DIAGS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const ORTHS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const NAIVE_SLIDE = { [KY]: [[0, -1]], [KA]: DIAGS, [UM]: DIAGS, [HI]: ORTHS, [RY]: ORTHS };

function reaches(board, from, to) {
    const p = board[from];
    const side = p >> 4;
    const type = p & 15;
    const [f0, r0] = fr(from);
    const [f1, r1] = fr(to);
    let df = f1 - f0;
    let dr = r1 - r0;
    if (side === GOTE) {
        df = -df;
        dr = -dr;
    }
    if ((NAIVE_STEP[type] ?? []).some(([a, b]) => a === df && b === dr)) return true;
    for (const [a, b] of NAIVE_SLIDE[type] ?? []) {
        for (let k = 1; k <= 8; k++) {
            if (a * k !== df || b * k !== dr) continue;
            // 途中の升が空いているか（後手は向きを戻して数える）
            const s = side === GOTE ? -1 : 1;
            for (let j = 1; j < k; j++) {
                const f = f0 + a * j * s;
                const r = r0 + b * j * s;
                if (board[(r - 1) * 9 + (9 - f)]) return false;
            }
            return true;
        }
    }
    return false;
}

const naiveAttacked = (board, sq, by) => board.some((p, x) => p && (p >> 4) === by && x !== sq && reaches(board, x, sq));
const naiveKing = (board, side) => board.findIndex(p => p === side * 16 + OU);
const lastRanks = (side, sq, n) => (side === SENTE ? fr(sq)[1] <= n : fr(sq)[1] >= 10 - n);

function naiveApply(pos, m) {
    const board = [...pos.board];
    const hands = [[...pos.hands[0]], [...pos.hands[1]]];
    const us = pos.side;
    if (isDrop(m)) {
        hands[us][dropType(m)]--;
        board[moveTo(m)] = us * 16 + dropType(m);
    } else {
        const cap = board[moveTo(m)];
        if (cap) hands[us][(cap & 15) > PROMOTE ? (cap & 15) - PROMOTE : cap & 15]++;
        board[moveTo(m)] = board[moveFrom(m)] + (isPromote(m) ? PROMOTE : 0);
        board[moveFrom(m)] = 0;
    }
    return { board, hands, side: 1 - us };
}

function naiveLegal(pos) {
    const us = pos.side;
    const out = [];
    for (let from = 0; from < 81; from++) {
        const p = pos.board[from];
        if (!p || (p >> 4) !== us) continue;
        const type = p & 15;
        for (let to = 0; to < 81; to++) {
            const t = pos.board[to];
            if (to === from || (t && (t >> 4) === us) || !reaches(pos.board, from, to)) continue;
            const promotable = [FU, KY, KE, GI, KA, HI].includes(type);
            const canPromote = promotable && (lastRanks(us, from, 3) || lastRanks(us, to, 3));
            const must = ((type === FU || type === KY) && lastRanks(us, to, 1)) || (type === KE && lastRanks(us, to, 2));
            if (canPromote) out.push(makeMove(from, to, true));
            if (!must) out.push(makeMove(from, to, false));
        }
    }
    for (let type = 1; type <= 7; type++) {
        if (!pos.hands[us][type]) continue;
        for (let to = 0; to < 81; to++) {
            if (pos.board[to]) continue;
            if ((type === FU || type === KY) && lastRanks(us, to, 1)) continue;
            if (type === KE && lastRanks(us, to, 2)) continue;
            if (type === FU && pos.board.some((q, x) => q === us * 16 + FU && x % 9 === to % 9)) continue;
            out.push(makeDrop(type, to));
        }
    }
    return out.filter(m => {
        const after = naiveApply(pos, m);
        if (naiveAttacked(after.board, naiveKing(after.board, us), 1 - us)) return false;
        if (isDrop(m) && dropType(m) === FU) {
            const enemyKing = naiveKing(after.board, 1 - us);
            if (naiveAttacked(after.board, enemyKing, us) && naiveLegal(after).length === 0) return false;
        }
        return true;
    });
}

const sorted = (list) => [...list].sort((a, b) => a - b);
const has = (pos, m) => pos.legalMoves().includes(m);

describe('盤と局面', () => {
    it('升の番号：筋は右から、段は上から数える', () => {
        expect(sqOf(9, 1)).toBe(0);
        expect(sqOf(1, 1)).toBe(8);
        expect(sqOf(1, 9)).toBe(80);
        expect(sqOf(7, 7)).toBe(56);
    });

    it('最初の配置（先手が下）と SFEN の読み書き', () => {
        const pos = Position.initial();
        expect(pos.board[sqOf(5, 9)]).toBe(OU);
        expect(pos.board[sqOf(5, 1)]).toBe(16 + OU);
        expect(pos.board[sqOf(2, 8)]).toBe(HI);
        expect(pos.board[sqOf(8, 8)]).toBe(KA);
        expect(pos.board[sqOf(8, 2)]).toBe(16 + HI);
        expect(pos.side).toBe(SENTE);
        const sfen = 'l6nl/5+P1gk/2np1S3/p1p4Pp/3P2Sp1/1PPb2P1P/P5GS1/R8/LN4bKL w RGgsn5p';
        expect(Position.fromSfen(sfen).toSfen()).toBe(sfen);
    });

    it('指して戻すと、盤・持ち駒・手番・ハッシュが元に戻る', () => {
        const pos = Position.fromSfen('l6nl/5+P1gk/2np1S3/p1p4Pp/3P2Sp1/1PPb2P1P/P5GS1/R8/LN4bKL w RGgsn5p');
        const before = [pos.toSfen(), pos.key];
        for (const m of pos.legalMoves()) {
            pos.make(m);
            pos.unmake(m);
        }
        expect([pos.toSfen(), pos.key]).toEqual(before);
    });

    it('同じ局面は、手順が違っても同じハッシュになる', () => {
        const a = Position.initial();
        const b = Position.initial();
        const seq = (pos, moves) => moves.forEach(([f, t]) => pos.make(makeMove(f, t)));
        seq(a, [[sqOf(7, 7), sqOf(7, 6)], [sqOf(3, 3), sqOf(3, 4)], [sqOf(2, 7), sqOf(2, 6)]]);
        seq(b, [[sqOf(2, 7), sqOf(2, 6)], [sqOf(3, 3), sqOf(3, 4)], [sqOf(7, 7), sqOf(7, 6)]]);
        expect(a.key).toBe(b.key);
        expect(a.toSfen()).toBe(b.toSfen());
    });
});

describe('合法手の数（perft）', () => {
    it('最初の局面から 1〜4手：30・900・25470・719731', () => {
        const pos = Position.initial();
        expect([1, 2, 3, 4].map(d => perft(pos, d))).toEqual([30, 900, 25470, 719731]);
    });

    it('持ち駒の多い中盤の局面でも、素朴な生成と2手先まで一致する', () => {
        const pos = Position.fromSfen('l6nl/5+P1gk/2np1S3/p1p4Pp/3P2Sp1/1PPb2P1P/P5GS1/R8/LN4bKL w RGgsn5p');
        const naivePerft = (p, d) => {
            const moves = naiveLegal(p);
            if (d === 1) return moves.length;
            let n = 0;
            for (const m of moves) {
                const next = Position.fromSfen(p.toSfen());
                next.make(m);
                n += naivePerft(next, d - 1);
            }
            return n;
        };
        expect(perft(pos, 2)).toBe(naivePerft(pos, 2));
    });

    it('ランダムな対局の局面すべてで、素朴な生成と合法手が一致する（取る手を多めに指して持ち駒を増やす）', () => {
        const random = createRandom(20261125);
        let positions = 0;
        for (let g = 0; g < 40; g++) {
            const pos = Position.initial();
            for (let ply = 0; ply < 140; ply++) {
                const moves = pos.legalMoves();
                expect(sorted(moves)).toEqual(sorted(naiveLegal(pos)));
                positions++;
                if (!moves.length) break;
                const captures = moves.filter(m => !isDrop(m) && pos.board[moveTo(m)]);
                const list = captures.length && random() < 0.6 ? captures : moves;
                pos.make(list[Math.floor(random() * list.length)]);
            }
        }
        expect(positions).toBeGreaterThan(3000);
    });
});

describe('禁じ手', () => {
    it('二歩：成っていない歩のある筋には打てない（と金の筋には打てる）', () => {
        const pos = Position.fromSfen('4k4/9/9/9/9/9/4P4/9/4K4 b P');
        expect(has(pos, makeDrop(FU, sqOf(5, 5)))).toBe(false);
        expect(has(pos, makeDrop(FU, sqOf(4, 5)))).toBe(true);
        const tokin = Position.fromSfen('4k4/9/9/9/9/9/4+P4/9/4K4 b P');
        expect(has(tokin, makeDrop(FU, sqOf(5, 5)))).toBe(true);
    });

    it('打ち歩詰めは指せない。歩を突いて詰ますのは指せる', () => {
        // 後手の玉 1一。2三の金が 1二・2二に、3三の桂が 2一に利いている
        const pos = Position.fromSfen('8k/9/6NG1/9/9/9/9/9/4K4 b P');
        expect(has(pos, makeDrop(FU, sqOf(1, 2)))).toBe(false);
        expect(naiveLegal(pos).includes(makeDrop(FU, sqOf(1, 2)))).toBe(false);
        // 桂がなければ玉は 2一に逃げられるので、打てる
        const escape = Position.fromSfen('8k/9/7G1/9/9/9/9/9/4K4 b P');
        expect(has(escape, makeDrop(FU, sqOf(1, 2)))).toBe(true);
        // 歩で取れる（打った歩を玉以外の駒が取れる）なら、打てる
        const capture = Position.fromSfen('7rk/9/6NG1/9/9/9/9/9/4K4 b P');
        expect(has(capture, makeDrop(FU, sqOf(1, 2)))).toBe(false);   // 飛は 1二に利いていない（2一から横）
        const guard = Position.fromSfen('8k/7g1/6NG1/9/9/9/9/9/4K4 b P');
        expect(has(guard, makeDrop(FU, sqOf(1, 2)))).toBe(true);      // 2二の金が 1二の歩を取れる
        // 突き歩詰めは指せる
        const push = Position.fromSfen('8k/9/6NGP/9/9/9/9/9/4K4 b -');
        const m = makeMove(sqOf(1, 3), sqOf(1, 2));
        expect(has(push, m)).toBe(true);
        push.make(m);
        expect(push.inCheck()).toBe(true);
        expect(push.hasLegalMove()).toBe(false);
    });

    it('行き所のない駒：一段目の歩・香、二段目までの桂は打てず、成らずに進めない', () => {
        const pos = Position.fromSfen('k8/4P4/9/6N2/9/9/9/7L1/4K4 b PLN');
        const dropRanks = (type) => [...new Set(pos.legalMoves().filter(m => isDrop(m) && dropType(m) === type).map(m => fr(moveTo(m))[1]))].sort();
        expect(dropRanks(FU)).not.toContain(1);
        expect(dropRanks(KY)).not.toContain(1);
        expect(dropRanks(KE)).not.toContain(1);
        expect(dropRanks(KE)).not.toContain(2);
        expect(dropRanks(KE)).toContain(3);
        // 5二の歩は 5一へ成るしかない
        expect(has(pos, makeMove(sqOf(5, 2), sqOf(5, 1), true))).toBe(true);
        expect(has(pos, makeMove(sqOf(5, 2), sqOf(5, 1), false))).toBe(false);
        // 3四の桂は 2二・4二へ成るしかない
        expect(has(pos, makeMove(sqOf(3, 4), sqOf(2, 2), false))).toBe(false);
        expect(has(pos, makeMove(sqOf(3, 4), sqOf(2, 2), true))).toBe(true);
        // 2八の香は 2一へは成るしかないが、2三・2二へは成らなくてもよい
        expect(has(pos, makeMove(sqOf(2, 8), sqOf(2, 1), false))).toBe(false);
        expect(has(pos, makeMove(sqOf(2, 8), sqOf(2, 2), false))).toBe(true);
        expect(has(pos, makeMove(sqOf(2, 8), sqOf(2, 3), true))).toBe(true);
        expect(has(pos, makeMove(sqOf(2, 8), sqOf(2, 4), true))).toBe(false);
    });

    it('後手の行き所のない駒は、九段目・八段目', () => {
        const pos = Position.fromSfen('4k4/9/9/9/9/9/9/4p4/K8 w pn');
        expect(has(pos, makeMove(sqOf(5, 8), sqOf(5, 9), false))).toBe(false);
        expect(has(pos, makeMove(sqOf(5, 8), sqOf(5, 9), true))).toBe(true);
        expect(has(pos, makeDrop(FU, sqOf(3, 9)))).toBe(false);
        expect(has(pos, makeDrop(KE, sqOf(3, 8)))).toBe(false);
        expect(has(pos, makeDrop(KE, sqOf(3, 7)))).toBe(true);
    });

    it('王手を放置する手と、ピンされた駒を動かして玉を取られる手は指せない', () => {
        // 先手の玉 5九に、後手の飛 5一から王手。5五の歩の後ろなどへの合い駒か、玉が逃げるしかない
        const pos = Position.fromSfen('4r4/9/9/9/9/9/9/9/4K4 b G');
        const moves = pos.legalMoves();
        expect(moves.every(m => {
            pos.make(m);
            const ok = !pos.attacked(pos.kings[SENTE], GOTE);
            pos.unmake(m);
            return ok;
        })).toBe(true);
        expect(moves.filter(m => isDrop(m)).map(m => fr(moveTo(m))[0])).toEqual(Array(7).fill(5));
        // 5八の金は、5一の飛に対してピンされている（横には動けない）
        const pin = Position.fromSfen('4r4/9/9/9/9/9/9/4G4/4K4 b -');
        expect(has(pin, makeMove(sqOf(5, 8), sqOf(4, 8)))).toBe(false);
        expect(has(pin, makeMove(sqOf(5, 8), sqOf(5, 7)))).toBe(true);
    });

    it('金と玉は成れない。敵陣から出る手でも成れる。取った成り駒は元に戻って持ち駒になる', () => {
        const pos = Position.fromSfen('4k4/9/3G1S3/9/9/9/9/9/4K4 b -');
        expect(pos.legalMoves().filter(m => isPromote(m) && moveFrom(m) === sqOf(6, 3))).toEqual([]);
        expect(has(pos, makeMove(sqOf(4, 3), sqOf(3, 4), true))).toBe(true);    // 三段目から四段目へ（出る）
        const cap = Position.fromSfen('4k4/9/9/9/4+r4/4P4/9/9/4K4 b -');
        cap.make(makeMove(sqOf(5, 6), sqOf(5, 5)));
        expect(cap.hands[SENTE][HI]).toBe(1);
    });
});

