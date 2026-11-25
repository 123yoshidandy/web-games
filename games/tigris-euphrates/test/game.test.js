import { describe, it, expect, beforeEach } from 'vitest';
import Game, { finalValues, compareFinal } from '../public/js/game.js';
import { BAG_COUNTS, HAND_SIZE } from '../public/js/data.js';
import { START_TEMPLES, RIVER, CELL_COUNT } from '../public/js/board.js';
import { newGame, clearBoard, putTile, putLeader, setHand, landArea, riverByLand, snapshot, total } from './helpers.js';

const BAG_TOTAL = Object.values(BAG_COUNTS).reduce((s, v) => s + v, 0);

describe('準備', () => {
    it('盤に宝物の神殿10か所、手札6枚、指導者は手元、大災害2枚', () => {
        const g = newGame(3);
        expect(START_TEMPLES.length).toBe(10);
        expect(g.treasures).toEqual(START_TEMPLES);
        START_TEMPLES.forEach(c => expect(g.board[c]).toEqual({ kind: 'tile', color: 'red' }));
        expect(BAG_TOTAL + 10).toBe(153);
        expect(g.bag.length).toBe(BAG_TOTAL - 3 * HAND_SIZE);
        g.players.forEach(p => {
            expect(p.hand.length).toBe(6);
            expect(Object.values(p.leaders).every(c => c === null)).toBe(true);
            expect(p.catastrophes).toBe(2);
        });
        expect(g.actors()).toEqual([0]);
        expect(g.actionsLeft).toBe(2);
    });

    it('同じシードなら同じ袋の順になる', () => {
        expect(snapshot(newGame(2, 9))).toBe(snapshot(newGame(2, 9)));
        expect(newGame(2, 9).bag).not.toEqual(newGame(2, 10).bag);
    });

    it('盤の川は、神殿のマスと重ならない', () => {
        START_TEMPLES.forEach(c => expect(RIVER.has(c)).toBe(false));
        expect(RIVER.size).toBeGreaterThan(20);
        expect(CELL_COUNT).toBe(176);
    });
});

describe('タイルを置く', () => {
    let g;
    let A;
    beforeEach(() => {
        g = newGame(2);
        clearBoard(g);
        g.treasures = [-1, -2, -3]; // 終わらないように、盤の外に宝物があることにする
        A = landArea(4, 7);
    });

    it('青は川だけ、ほかの色は陸だけ', () => {
        const [river, land] = riverByLand();
        setHand(g, 0, ['blue', 'blue', 'red', 'red', 'black', 'green']);
        expect(g.applyCommand(1, { type: 'tile', color: 'red', cell: A(0, 0) })).toBe(false); // 番ではない
        expect(g.applyCommand(0, { type: 'tile', color: 'blue', cell: land })).toBe(false);
        expect(g.applyCommand(0, { type: 'tile', color: 'red', cell: river })).toBe(false);
        expect(g.applyCommand(0, { type: 'tile', color: 'blue', cell: river })).toBe(true);
        expect(g.applyCommand(0, { type: 'tile', color: 'red', cell: land })).toBe(true);
        expect(g.current).toBe(1);
    });

    it('王国に置くと、同じ色の指導者、いなければ王の持ち主が1点。王国でなければ点なし', () => {
        putTile(g, A(1, 1), 'red');
        putLeader(g, A(1, 2), 0, 'green');
        putLeader(g, A(0, 1), 1, 'black');
        setHand(g, 0, ['green', 'black', 'red', 'red', 'green', 'green']);
        g.applyCommand(0, { type: 'tile', color: 'green', cell: A(1, 3) });
        expect(g.players[0].scores.green).toBe(1);
        g.applyCommand(0, { type: 'tile', color: 'black', cell: A(2, 1) });
        expect(g.players[1].scores.black).toBe(1);
        // 相手の番：赤は神官がいないので王の持ち主へ
        setHand(g, 1, ['red', 'red', 'red', 'green', 'green', 'green']);
        g.applyCommand(1, { type: 'tile', color: 'red', cell: A(2, 2) });
        expect(g.players[1].scores.red).toBe(1);
        // 離れたマス（王国につながらない）
        g.applyCommand(1, { type: 'tile', color: 'green', cell: A(3, 6) });
        expect(total(g.players[0].scores) + total(g.players[1].scores)).toBe(3);
    });

    it('3つの王国はつなげない（指導者のいない地域は数えない）', () => {
        putTile(g, A(0, 2), 'red'); putLeader(g, A(0, 1), 0, 'red');
        putTile(g, A(2, 2), 'red'); putLeader(g, A(2, 1), 0, 'blue');
        putTile(g, A(1, 3), 'red'); putLeader(g, A(1, 4), 1, 'green');
        setHand(g, 0, ['black', 'black', 'black', 'red', 'red', 'red']);
        expect(g.applyCommand(0, { type: 'tile', color: 'black', cell: A(1, 2) })).toBe(false);
        expect(g.lastError).toContain('3つ');
        // 片方の王国の指導者を退けると、つなげる
        g.board[A(1, 4)] = null;
        g.players[1].leaders.green = null;
        expect(g.applyCommand(0, { type: 'tile', color: 'black', cell: A(1, 2) })).toBe(true);
    });
});

describe('指導者', () => {
    let g;
    let A;
    beforeEach(() => {
        g = newGame(2);
        clearBoard(g);
        A = landArea(4, 7);
        // 終わらないように、離れた所に宝物を置いておく
        g.treasures = [0, 1, 2].map(i => -100 - i);
    });

    it('神殿のとなりの空いた陸に置く。2つの王国をつなぐ場所には置けない', () => {
        putTile(g, A(1, 1), 'red');
        putTile(g, A(1, 5), 'red');
        expect(g.applyCommand(0, { type: 'leader', color: 'black', cell: A(3, 3) })).toBe(false);
        expect(g.lastError).toContain('神殿');
        putLeader(g, A(0, 1), 1, 'red');
        putLeader(g, A(0, 5), 1, 'green');
        putTile(g, A(1, 2), 'black');
        putTile(g, A(1, 4), 'black');
        putTile(g, A(0, 3), 'red');
        // A(1,3) は両方の王国につながる
        expect(g.applyCommand(0, { type: 'leader', color: 'black', cell: A(1, 3) })).toBe(false);
        expect(g.lastError).toContain('2つの王国');
        expect(g.applyCommand(0, { type: 'leader', color: 'black', cell: A(2, 1) })).toBe(true);
        expect(g.players[0].leaders.black).toBe(A(2, 1));
    });

    it('動かす・手元に戻す（どちらも1アクション）', () => {
        putTile(g, A(1, 1), 'red');
        putTile(g, A(1, 5), 'red');
        expect(g.applyCommand(0, { type: 'leader', color: 'blue', cell: A(2, 1) })).toBe(true);
        expect(g.applyCommand(0, { type: 'leader', color: 'blue', cell: A(2, 5) })).toBe(true);
        expect(g.board[A(2, 1)]).toBe(null);
        expect(g.board[A(2, 5)]).toEqual({ kind: 'leader', seat: 0, color: 'blue' });
        expect(g.current).toBe(1);
        g.current = 0;
        g.actionsLeft = 2;
        expect(g.applyCommand(0, { type: 'withdraw', color: 'blue' })).toBe(true);
        expect(g.players[0].leaders.blue).toBe(null);
        expect(g.applyCommand(0, { type: 'withdraw', color: 'blue' })).toBe(false);
    });
});

describe('内乱', () => {
    let g;
    let A;
    beforeEach(() => {
        g = newGame(2);
        clearBoard(g);
        A = landArea(4, 7);
        g.treasures = [-1, -2, -3];
        putTile(g, A(1, 1), 'red');
        putTile(g, A(0, 2), 'red');
        putLeader(g, A(1, 0), 1, 'red'); // 守る側：となりの神殿1
        setHand(g, 0, ['red', 'red', 'black', 'black', 'green', 'green']);
        setHand(g, 1, ['red', 'black', 'black', 'black', 'green', 'green']);
    });

    it('同じ色の指導者がいる王国に置くと内乱。強さはとなりの神殿の数', () => {
        expect(g.applyCommand(0, { type: 'leader', color: 'red', cell: A(0, 1) })).toBe(true);
        expect(g.phase).toBe('support');
        expect(g.conflict.attacker).toMatchObject({ seat: 0, base: 2 });
        expect(g.conflict.defender).toMatchObject({ seat: 1, base: 1 });
        expect(g.actors()).toEqual([0]); // 攻める側が先に出す
        expect(g.applyCommand(1, { type: 'support', count: 0 })).toBe(false);
        expect(g.applyCommand(0, { type: 'support', count: 3 })).toBe(false); // 持っている赤は2枚
        expect(g.applyCommand(0, { type: 'support', count: 0 })).toBe(true);
        expect(g.actors()).toEqual([1]);
    });

    it('同点は守る側の勝ち。勝った側は赤1点、負けた指導者は手元へ。出したタイルは捨てる', () => {
        g.applyCommand(0, { type: 'leader', color: 'red', cell: A(0, 1) });
        g.applyCommand(0, { type: 'support', count: 0 });
        g.applyCommand(1, { type: 'support', count: 1 });
        expect(g.players[1].scores.red).toBe(1);
        expect(g.players[0].leaders.red).toBe(null);
        expect(g.board[A(0, 1)]).toBe(null);
        expect(g.players[1].hand.length).toBe(5);
        expect(g.phase).toBe('action');
        expect(g.actionsLeft).toBe(1);
    });

    it('攻める側が上回れば、守る側の指導者が退く', () => {
        g.applyCommand(0, { type: 'leader', color: 'red', cell: A(0, 1) });
        g.applyCommand(0, { type: 'support', count: 1 });
        g.applyCommand(1, { type: 'support', count: 0 });
        expect(g.players[0].scores.red).toBe(1);
        expect(g.players[1].leaders.red).toBe(null);
        expect(g.players[0].leaders.red).toBe(A(0, 1));
        expect(g.players[0].hand.filter(c => c === 'red').length).toBe(1);
    });

    it('内乱の色が赤でなくても、出すのは赤で、勝った側の点も赤', () => {
        putLeader(g, A(2, 2), 1, 'green');
        putTile(g, A(2, 1), 'red');
        g.applyCommand(0, { type: 'leader', color: 'green', cell: A(0, 1) });
        expect(g.conflict.color).toBe('red');
        expect(g.conflict.leaderColor).toBe('green');
        g.applyCommand(0, { type: 'support', count: 2 });
        g.applyCommand(1, { type: 'support', count: 1 });
        expect(g.players[0].scores.red).toBe(1);
        expect(g.players[1].leaders.green).toBe(null);
    });
});

describe('外乱', () => {
    let g;
    let A;
    beforeEach(() => {
        g = newGame(3);
        clearBoard(g);
        A = landArea(4, 7);
        g.treasures = [-1, -2, -3];
        // 左の王国：神殿 A(1,1)、席0の王 A(1,2)、黒2枚
        putTile(g, A(1, 1), 'red');
        putLeader(g, A(1, 2), 0, 'black');
        putTile(g, A(0, 1), 'black');
        putTile(g, A(0, 2), 'black');
        // 右の王国：神殿 A(1,5)、席1の王 A(1,4)、黒1枚
        putTile(g, A(1, 5), 'red');
        putLeader(g, A(1, 4), 1, 'black');
        putTile(g, A(0, 4), 'black');
        setHand(g, 0, ['green', 'green', 'red', 'red', 'black', 'blue']);
        setHand(g, 1, ['black', 'red', 'red', 'green', 'green', 'blue']);
    });

    it('2つの王国をつなぎ、同じ色の指導者が両方にいれば外乱。つないだタイルは数えない', () => {
        expect(g.applyCommand(0, { type: 'tile', color: 'black', cell: A(1, 3) })).toBe(true);
        expect(g.phase).toBe('support');
        expect(g.conflict.kind).toBe('war');
        expect(g.conflict.attacker).toMatchObject({ seat: 0, base: 2 });
        expect(g.conflict.defender).toMatchObject({ seat: 1, base: 1 });
    });

    it('負けた指導者と、負けた側のその色のタイルを取り除き、勝った側はその数＋1点', () => {
        g.applyCommand(0, { type: 'tile', color: 'green', cell: A(1, 3) });
        g.applyCommand(0, { type: 'support', count: 0 });
        g.applyCommand(1, { type: 'support', count: 0 });
        expect(g.players[1].leaders.black).toBe(null);
        expect(g.board[A(0, 4)]).toBe(null);
        expect(g.board[A(1, 5)]).toEqual({ kind: 'tile', color: 'red' }); // 神殿は残る
        expect(g.players[0].scores.black).toBe(2);
        // つないだタイルは、争いのあとで王国に入る。点は入らない
        expect(g.board[A(1, 3)]).toEqual({ kind: 'tile', color: 'green' });
        expect(g.players[0].scores.green).toBe(0);
        expect(g.phase).toBe('action');
        expect(g.war).toBe(null);
    });

    it('赤の外乱では、宝物の神殿と、ほかの指導者を支える神殿は残す', () => {
        clearBoard(g);
        g.treasures = [-1, -2, -3];
        putTile(g, A(1, 1), 'red');
        putLeader(g, A(1, 2), 0, 'red');
        putTile(g, A(0, 1), 'red');
        putTile(g, A(0, 2), 'red');
        putTile(g, A(1, 5), 'red', true);   // 宝物
        putLeader(g, A(1, 4), 1, 'red');
        putTile(g, A(2, 5), 'red');         // 支える指導者がいる
        putLeader(g, A(2, 6), 1, 'green');
        putTile(g, A(0, 5), 'red');         // これだけ取り除かれる
        g.treasures.push(-1, -2, -3);
        g.applyCommand(0, { type: 'tile', color: 'green', cell: A(1, 3) });
        expect(g.conflict.attacker.base).toBe(3);
        expect(g.conflict.defender.base).toBe(3);
        g.applyCommand(0, { type: 'support', count: 1 });
        g.applyCommand(1, { type: 'support', count: 0 });
        expect(g.players[1].leaders.red).toBe(null);
        expect(g.players[1].leaders.green).toBe(A(2, 6));
        expect(g.board[A(0, 5)]).toBe(null);
        expect(g.board[A(1, 5)]).toEqual({ kind: 'tile', color: 'red' });
        expect(g.board[A(2, 5)]).toEqual({ kind: 'tile', color: 'red' });
        expect(g.players[0].scores.red).toBe(2);
        // 同点なら守る側の勝ち（負けた側の神殿が取り除かれる）は、内乱と同じ決まり
    });

    it('争いが2つなら、手番の人が順番を決める', () => {
        putLeader(g, A(2, 1), 0, 'red');
        putLeader(g, A(2, 5), 1, 'red');
        g.applyCommand(0, { type: 'tile', color: 'green', cell: A(1, 3) });
        expect(g.phase).toBe('warOrder');
        expect(g.applyCommand(1, { type: 'war', color: 'red' })).toBe(false);
        expect(g.applyCommand(0, { type: 'war', color: 'blue' })).toBe(false);
        expect(g.applyCommand(0, { type: 'war', color: 'red' })).toBe(true);
        expect(g.conflict.leaderColor).toBe('red');
        g.applyCommand(0, { type: 'support', count: 0 });
        g.applyCommand(1, { type: 'support', count: 0 });
        // 赤は1 対 1 で守る側の勝ち。次は黒の争い
        expect(g.players[0].leaders.red).toBe(null);
        expect(g.phase).toBe('support');
        expect(g.conflict.leaderColor).toBe('black');
    });

    it('手番の人が関わらない争いは、手番の人の次から数えて先の人が攻める', () => {
        g.board[A(1, 2)] = null;
        g.players[0].leaders.black = null;
        putLeader(g, A(1, 2), 2, 'black');
        g.applyCommand(0, { type: 'tile', color: 'green', cell: A(1, 3) });
        expect(g.conflict.attacker.seat).toBe(1);
        expect(g.conflict.defender.seat).toBe(2);
        expect(g.actors()).toEqual([1]);
    });

    it('前の争いで負けた側の王国が崩れたら、残りの争いはなくなる', () => {
        // 右の王国は、神殿 A(1,5) と黒 A(0,4)。黒が取り除かれても神官は残るが、王が退いて王国が分かれる場合
        putLeader(g, A(2, 1), 0, 'red');
        putLeader(g, A(0, 5), 1, 'red');
        g.applyCommand(0, { type: 'tile', color: 'green', cell: A(1, 3) });
        g.applyCommand(0, { type: 'war', color: 'black' });
        g.applyCommand(0, { type: 'support', count: 0 });
        g.applyCommand(1, { type: 'support', count: 0 });
        // 席1の王が退き、A(1,4) が空いて、右の神官はつないだタイルから離れた
        expect(g.players[1].leaders.black).toBe(null);
        expect(g.phase).toBe('action');
        expect(g.players[0].leaders.red).toBe(A(2, 1));
        expect(g.players[1].leaders.red).toBe(A(0, 5));
    });
});

describe('記念碑', () => {
    it('同じ色の4枚の正方形で建てられ、手番の終わりに色の指導者がいれば1点', () => {
        const g = newGame(2);
        clearBoard(g);
        g.treasures = [-1, -2, -3];
        const A = landArea(4, 7);
        putTile(g, A(0, 0), 'black');
        putTile(g, A(0, 1), 'black');
        putTile(g, A(1, 0), 'black');
        putTile(g, A(1, 3), 'red');
        putLeader(g, A(1, 2), 0, 'black');
        setHand(g, 0, ['black', 'black', 'red', 'red', 'green', 'green']);
        expect(g.applyCommand(0, { type: 'tile', color: 'black', cell: A(1, 1) })).toBe(true);
        expect(g.players[0].scores.black).toBe(1);
        expect(g.phase).toBe('monument');
        expect(g.monumentChoice.squares).toEqual([A(0, 0)]);
        expect(g.applyCommand(0, { type: 'monument', cell: A(0, 0), monument: 0 })).toBe(false); // 赤と青
        expect(g.applyCommand(0, { type: 'monument', cell: A(0, 0), monument: 5 })).toBe(true); // 緑と黒
        [A(0, 0), A(0, 1), A(1, 0), A(1, 1)].forEach(c => expect(g.board[c]).toEqual({ kind: 'mon', id: 5 }));
        expect(g.monuments[5].cell).toBe(A(0, 0));
        g.applyCommand(0, { type: 'pass' });
        // 手番の終わり：黒の王がいるので黒1点（緑の指導者はいない）
        expect(g.players[0].scores.black).toBe(2);
        expect(g.players[0].scores.green).toBe(0);
        expect(g.current).toBe(1);
    });

    it('建てないこともできる。建てる記念碑が残っていなければ聞かない', () => {
        const g = newGame(2);
        clearBoard(g);
        g.treasures = [-1, -2, -3];
        const A = landArea(4, 7);
        [A(0, 0), A(0, 1), A(1, 0)].forEach(c => putTile(g, c, 'green'));
        setHand(g, 0, ['green', 'green', 'red', 'red', 'black', 'black']);
        g.applyCommand(0, { type: 'tile', color: 'green', cell: A(1, 1) });
        expect(g.applyCommand(0, { type: 'skip' })).toBe(true);
        expect(g.board[A(0, 0)]).toEqual({ kind: 'tile', color: 'green' });
        g.monuments.forEach(m => { if (m.colors.includes('green')) m.cell = 999; });
        g.current = 0;
        [A(2, 0), A(2, 1)].forEach(c => putTile(g, c, 'green'));
        g.board[A(3, 0)] = { kind: 'tile', color: 'green' };
        g.applyCommand(0, { type: 'tile', color: 'green', cell: A(3, 1) });
        expect(g.phase).not.toBe('monument');
    });

    it('記念碑で裏返った神殿は、指導者を支えない', () => {
        const g = newGame(2);
        clearBoard(g);
        g.treasures = [-1, -2, -3];
        const A = landArea(4, 7);
        [A(0, 0), A(0, 1), A(1, 0)].forEach(c => putTile(g, c, 'red'));
        putLeader(g, A(1, 2), 1, 'blue');
        putTile(g, A(0, 2), 'black');
        setHand(g, 0, ['red', 'green', 'green', 'black', 'black', 'black']);
        g.applyCommand(0, { type: 'tile', color: 'red', cell: A(1, 1) });
        g.applyCommand(0, { type: 'monument', cell: A(0, 0), monument: 0 });
        expect(g.players[1].leaders.blue).toBe(null);
    });
});

describe('宝物', () => {
    it('宝物が2つ以上ある王国に商人がいれば、その持ち主が1つを残して取る', () => {
        const g = newGame(2);
        clearBoard(g);
        const A = landArea(4, 7);
        putTile(g, A(1, 1), 'red', true);
        putTile(g, A(1, 3), 'red', true);
        putTile(g, A(3, 0), 'red', true);
        putTile(g, A(3, 6), 'red', true);
        putTile(g, A(3, 3), 'red', true);
        // 商人以外が入っても取らない
        expect(g.applyCommand(0, { type: 'leader', color: 'black', cell: A(0, 1) })).toBe(true);
        expect(g.treasures.length).toBe(5);
        expect(g.applyCommand(0, { type: 'leader', color: 'green', cell: A(1, 2) })).toBe(true);
        expect(g.players[0].treasures).toBe(1);
        expect(g.treasures.length).toBe(4);
        expect(g.isOver()).toBe(false);
    });

    it('手番の終わりに盤の宝物が2つ以下なら終わる', () => {
        const g = newGame(2);
        clearBoard(g);
        const A = landArea(4, 7);
        putTile(g, A(1, 1), 'red', true);
        putTile(g, A(1, 3), 'red', true);
        putTile(g, A(3, 6), 'red', true);
        g.applyCommand(0, { type: 'leader', color: 'green', cell: A(1, 2) });
        expect(g.treasures.length).toBe(2);
        expect(g.isOver()).toBe(false); // アクションの途中では終わらない
        g.applyCommand(0, { type: 'pass' });
        expect(g.isOver()).toBe(true);
        expect(g.endReason).toBe('treasure');
        expect(g.winners).toEqual([0]);
    });
});

describe('大災害', () => {
    let g;
    let A;
    beforeEach(() => {
        g = newGame(2);
        clearBoard(g);
        A = landArea(4, 7);
        putTile(g, A(1, 1), 'red');
        putTile(g, A(3, 3), 'red', true);
        putLeader(g, A(1, 2), 1, 'black');
        g.treasures.push(-1, -2, -3);
    });

    it('タイルを壊し、神殿を失った指導者は手元に戻る。2回まで', () => {
        expect(g.applyCommand(0, { type: 'catastrophe', cell: A(1, 1) })).toBe(true);
        expect(g.board[A(1, 1)]).toEqual({ kind: 'cat' });
        expect(g.players[1].leaders.black).toBe(null);
        expect(g.board[A(1, 2)]).toBe(null);
        expect(g.applyCommand(0, { type: 'catastrophe', cell: A(0, 5) })).toBe(true); // 空きマスにも置ける
        g.current = 0;
        expect(g.applyCommand(0, { type: 'catastrophe', cell: A(0, 6) })).toBe(false);
        expect(g.lastError).toContain('もう');
    });

    it('指導者・宝物・大災害・記念碑のマスには置けない', () => {
        expect(g.applyCommand(0, { type: 'catastrophe', cell: A(1, 2) })).toBe(false);
        expect(g.applyCommand(0, { type: 'catastrophe', cell: A(3, 3) })).toBe(false);
        g.board[A(0, 0)] = { kind: 'cat' };
        expect(g.applyCommand(0, { type: 'catastrophe', cell: A(0, 0) })).toBe(false);
        g.board[A(0, 3)] = { kind: 'mon', id: 0 };
        expect(g.applyCommand(0, { type: 'catastrophe', cell: A(0, 3) })).toBe(false);
    });

    it('大災害で王国が分かれる', () => {
        putTile(g, A(1, 3), 'green');
        putTile(g, A(1, 4), 'red');
        putLeader(g, A(1, 5), 0, 'green');
        expect(g.region(A(1, 1))).toContain(A(1, 5));
        g.applyCommand(0, { type: 'catastrophe', cell: A(1, 3) });
        expect(g.region(A(1, 1))).not.toContain(A(1, 5));
    });
});

describe('交換と手番', () => {
    it('交換は1〜6枚を捨てて引き直す。捨てたタイルは袋に戻らない', () => {
        const g = newGame(2);
        setHand(g, 0, ['red', 'red', 'blue', 'green', 'black', 'black']);
        const bag = g.bag.length;
        expect(g.applyCommand(0, { type: 'swap', tiles: [] })).toBe(false);
        expect(g.applyCommand(0, { type: 'swap', tiles: ['green', 'green'] })).toBe(false);
        expect(g.applyCommand(0, { type: 'swap', tiles: ['red', 'blue', 'black'] })).toBe(true);
        expect(g.players[0].hand.length).toBe(6);
        expect(g.bag.length).toBe(bag - 3);
    });

    it('2アクションで手番が終わり、手札を6枚に補充して次の人へ', () => {
        const g = newGame(3);
        const [river] = riverByLand();
        setHand(g, 0, ['blue', 'blue', 'red', 'red', 'black', 'green']);
        g.applyCommand(0, { type: 'tile', color: 'blue', cell: river });
        expect(g.current).toBe(0);
        expect(g.applyCommand(0, { type: 'pass' })).toBe(true);
        expect(g.current).toBe(1);
        expect(g.actionsLeft).toBe(2);
        expect(g.players[0].hand.length).toBe(6);
        expect(g.turnNumber).toBe(2);
    });

    it('手番の終わりに、争いで手札を出したほかの人も補充する', () => {
        const g = newGame(3);
        const [river] = riverByLand();
        setHand(g, 0, ['blue', 'red', 'red', 'red', 'black', 'green']);
        g.players[2].hand.splice(0, 2);
        g.applyCommand(0, { type: 'tile', color: 'blue', cell: river });
        g.applyCommand(0, { type: 'pass' });
        expect(g.players.map(p => p.hand.length)).toEqual([6, 6, 6]);
    });

    it('袋のタイルで補充できなければ終わる', () => {
        const g = newGame(2);
        const [river] = riverByLand();
        setHand(g, 0, ['blue', 'red', 'red', 'red', 'black', 'green']);
        g.bag = g.bag.slice(0, 0);
        g.applyCommand(0, { type: 'tile', color: 'blue', cell: river });
        g.applyCommand(0, { type: 'pass' });
        expect(g.isOver()).toBe(true);
        expect(g.endReason).toBe('bag');
    });
});

describe('得点の比べ方', () => {
    it('宝物はいちばん低い色に足していく', () => {
        expect(finalValues({ black: 3, red: 5, blue: 4, green: 7 }, 0)).toEqual([3, 4, 5, 7]);
        expect(finalValues({ black: 3, red: 5, blue: 4, green: 7 }, 2)).toEqual([4, 5, 5, 7]);
        expect(finalValues({ black: 0, red: 0, blue: 0, green: 0 }, 5)).toEqual([1, 1, 1, 2]);
    });

    it('いちばん低い色で比べ、同じなら次に低い色で比べる', () => {
        expect(compareFinal([4, 5, 9, 9], [4, 6, 6, 6])).toBeLessThan(0);
        expect(compareFinal([5, 5, 5, 5], [4, 9, 9, 9])).toBeGreaterThan(0);
        expect(compareFinal([4, 6, 6, 6], [4, 6, 6, 6])).toBe(0);
    });

    it('終わったときの勝者は、宝物を足した点で決める', () => {
        const g = newGame(2);
        g.players[0].scores = { black: 5, red: 5, blue: 5, green: 4 };
        g.players[1].scores = { black: 9, red: 9, blue: 9, green: 4 };
        g.players[0].treasures = 1; // 5・5・5・5 対 4・9・9・9
        g.finish('bag');
        expect(g.winners).toEqual([0]);
        g.players[1].treasures = 1; // 5・5・5・5 対 5・9・9・9
        g.finish('bag');
        expect(g.winners).toEqual([1]);
        g.players[0].scores = { black: 9, red: 9, blue: 9, green: 4 };
        g.finish('bag');
        expect(g.winners).toEqual([0, 1]);
    });
});

describe('断る操作', () => {
    it('断った操作では状態が変わらない', () => {
        const g = new Game([{ name: 'a' }, { name: 'b' }], { seed: 4, startPlayer: 0 });
        const before = snapshot(g);
        [
            { type: 'tile', color: 'red', cell: START_TEMPLES[0] },
            { type: 'leader', color: 'red', cell: 999 },
            { type: 'withdraw', color: 'red' },
            { type: 'catastrophe', cell: START_TEMPLES[0] },
            { type: 'swap', tiles: ['x'] },
            { type: 'support', count: 1 },
            { type: 'monument', cell: 0, monument: 0 }
        ].forEach(c => expect(g.applyCommand(0, c)).toBe(false));
        expect(snapshot(g)).toBe(before);
    });
});
