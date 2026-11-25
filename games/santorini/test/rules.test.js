import { describe, it, expect } from 'vitest';
import { createState, legalSteps, applyStep, cellOf, stepKey, SUPPLY } from '../public/js/rules.js';
import Game from '../public/js/game.js';

const C = (x, y) => cellOf(x, y);
// 盤を組み立てる：rows は 5 行の文字列（0〜3 は段、D はドーム）、workers は席ごとの [[x, y], [x, y]]
function board({ rows, workers, gods = null, current = 0, players = 2 } = {}) {
    const s = createState({ players, first: current, gods });
    s.phase = 'turn';
    if (rows) rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === 'D') { s.height[C(x, y)] = 3; s.dome[C(x, y)] = true; } else s.height[C(x, y)] = Number(ch);
    }));
    s.workers = workers.map(list => list.map(([x, y]) => C(x, y)));
    return s;
}
const keys = (steps) => steps.map(stepKey).sort();
const moveTargets = (s, from) => legalSteps(s).filter(a => a.type === 'move' && a.from === from).map(a => a.to).sort((a, b) => a - b);
const buildTargets = (s) => [...new Set(legalSteps(s).filter(a => a.type === 'build').map(a => a.at))].sort((a, b) => a - b);
const flat = ['00000', '00000', '00000', '00000', '00000'];
const play = (s, ...steps) => steps.reduce((acc, step) => {
    const ok = legalSteps(acc).some(a => stepKey(a) === stepKey(step));
    if (!ok) throw new Error(`通らない操作: ${stepKey(step)}`);
    return applyStep(acc, step);
}, s);

describe('始まり', () => {
    it('各自2人ずつ、最初の手番の人から順に置く。置き終えたら最初の手番の人から番を始める', () => {
        let s = createState({ players: 2, first: 1 });
        expect(legalSteps(s)).toHaveLength(25);
        s = play(s, { type: 'place', to: 0 }, { type: 'place', to: 1 });
        expect(s.current).toBe(0);
        expect(s.phase).toBe('place');
        expect(legalSteps(s)).toHaveLength(23);
        s = play(s, { type: 'place', to: 2 }, { type: 'place', to: 3 });
        expect(s.phase).toBe('turn');
        expect(s.current).toBe(1);
        expect(s.workers).toEqual([[2, 3], [0, 1]]);
    });

    it('ブロックの数は 1段22・2段18・3段14・ドーム18', () => {
        expect(SUPPLY.slice(1)).toEqual([22, 18, 14, 18]);
    });

    it('4人では作れない', () => {
        expect(() => createState({ players: 4 })).toThrow();
        expect(() => new Game([{}, {}, {}, {}])).toThrow();
    });
});

describe('動く', () => {
    it('8方向に1マス。上るのは1段まで、下りは何段でも。ドームと職人のマスへは動けない', () => {
        const s = board({
            rows: ['00000', '0123D', '00300', '00000', '00000'],
            workers: [[[2, 2], [4, 4]], [[3, 3], [0, 4]]]
        });
        // (2,2) は 3段。まわり：(1,1)=1 (2,1)=2 (3,1)=3 (1,2)=0 (3,2)=0 (1,3)=0 (2,3)=0 (3,3)=相手
        expect(moveTargets(s, C(2, 2))).toEqual([C(1, 1), C(2, 1), C(3, 1), C(1, 2), C(3, 2), C(1, 3), C(2, 3)].sort((a, b) => a - b));
        const low = board({ rows: ['02000', '13000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[3, 3], [4, 0]]] });
        // 0段から 2段・3段へは上れず、1段へは上れる
        expect(moveTargets(low, C(0, 0))).toEqual([C(0, 1)]);
    });

    it('動いた職人の隣に建てる。4段目はドーム', () => {
        let s = board({ rows: ['33000', '00000', '00000', '00000', '00000'], workers: [[[0, 1], [4, 4]], [[3, 3], [4, 3]]] });
        s = play(s, { type: 'move', from: C(0, 1), to: C(1, 1) });
        expect(buildTargets(s)).toContain(C(0, 1)); // 元のマスにも建てられる
        expect(buildTargets(s)).not.toContain(C(4, 4)); // 動いていない職人の隣は不可
        s = play(s, { type: 'build', by: C(1, 1), at: C(0, 0) });
        expect(s.dome[C(0, 0)]).toBe(true);
        expect(s.height[C(0, 0)]).toBe(3);
        expect(s.supply[4]).toBe(17);
        expect(s.current).toBe(1);
    });

    it('3段目に上ったら勝ち。3段目から3段目へは勝ちではない', () => {
        let s = board({ rows: ['23000', '00000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[3, 3], [4, 3]]] });
        s = play(s, { type: 'move', from: C(0, 0), to: C(1, 0) });
        expect(s.result).toEqual({ winner: 0, reason: 'climb' });
        let t = board({ rows: ['33000', '00000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[3, 3], [4, 3]]] });
        t = play(t, { type: 'move', from: C(0, 0), to: C(1, 0) });
        expect(t.result).toBe(null);
    });

    it('番の始めに動けなければ負け', () => {
        // 席1の職人は2人ともドームと高い段に囲まれている
        let s = board({
            rows: ['02D00', 'DD200', '22000', '00000', '00000'],
            workers: [[[4, 4], [3, 4]], [[0, 0], [4, 0]]]
        });
        s.workers[1] = [C(0, 0), C(1, 2)];
        s.height[C(1, 2)] = 0;
        // (1,2) は動ける。動けないようにまわりを高くする
        [C(0, 1), C(1, 1), C(2, 1), C(0, 2), C(2, 2), C(0, 3), C(1, 3), C(2, 3)].forEach(c => { s.height[c] = 2; });
        s.dome[C(0, 1)] = s.dome[C(1, 1)] = true;
        s = play(s, { type: 'move', from: C(4, 4), to: C(4, 3) }, { type: 'build', by: C(4, 3), at: C(4, 4) });
        expect(s.result).toEqual({ winner: 0, reason: 'stuck' });
    });

    it('動いたあとに建てられなければ負け', () => {
        // 3段の (1,0) から (0,0) へ下りると、隣はドームと、元のマス（3段。ドームが尽きている）だけ
        const s = board({
            rows: ['23D00', 'DD000', '00000', '00000', '00000'],
            workers: [[[1, 0], [4, 4]], [[3, 3], [4, 3]]]
        });
        s.supply[4] = 0;
        const after = play(s, { type: 'move', from: C(1, 0), to: C(0, 0) });
        expect(after.result).toEqual({ winner: 1, reason: 'stuck' });
    });

    it('ブロックが尽きた段は建てられない', () => {
        let s = board({ rows: flat, workers: [[[2, 2], [4, 4]], [[0, 0], [4, 0]]] });
        s.supply[1] = 0;
        s = play(s, { type: 'move', from: C(2, 2), to: C(2, 3) });
        expect(buildTargets(s)).toEqual([]); // 0段のマスばかりで、1段のブロックがない
    });
});

describe('3人', () => {
    it('動けない人は職人を取り除き、残りで続ける。最後の1人が勝ち', () => {
        let s = board({ players: 3, rows: ['0D000', 'DD000', '00000', '00000', '00000'], workers: [[[4, 4], [3, 4]], [[0, 0], [2, 2]], [[4, 0], [3, 0]]] });
        // 席1の (2,2) を動けなくする：まわりを2段にする
        [C(1, 1), C(2, 1), C(3, 1), C(1, 2), C(3, 2), C(1, 3), C(2, 3), C(3, 3)].forEach(c => { if (!s.dome[c]) s.height[c] = 2; });
        s = play(s, { type: 'move', from: C(4, 4), to: C(4, 3) }, { type: 'build', by: C(4, 3), at: C(4, 4) });
        expect(s.alive).toEqual([true, false, true]);
        expect(s.workers[1]).toEqual([]);
        expect(s.current).toBe(2);
        expect(s.result).toBe(null);
    });
});

describe('神の力', () => {
    it('アポロン：相手のマスへ動き、相手を元のマスへ。押された駒は3段目でも勝たない', () => {
        let s = board({ rows: ['30000', '20000', '00000', '00000', '00000'], workers: [[[0, 1], [4, 4]], [[0, 0], [4, 0]]], gods: ['apollo', null] });
        expect(moveTargets(s, C(0, 1))).toContain(C(0, 0)); // 2段から3段の相手のマスへ
        s = play(s, { type: 'move', from: C(0, 1), to: C(0, 0) });
        expect(s.result).toEqual({ winner: 0, reason: 'climb' });
        // 入れ替わるときも、上れるのは1段まで（0段から3段の相手のマスへは動けない）
        const t = board({ rows: ['00000', '30000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[0, 1], [4, 0]]], gods: ['apollo', null] });
        expect(() => play(t, { type: 'move', from: C(0, 0), to: C(0, 1) })).toThrow();
    });

    it('アポロン：入れ替わった相手の職人は、自分の元のマスへ。勝ちにはならない', () => {
        let s = board({ rows: ['30000', '30000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[0, 1], [4, 0]]], gods: ['apollo', null] });
        s = play(s, { type: 'move', from: C(0, 0), to: C(0, 1) });
        expect(s.workers[1]).toContain(C(0, 0));
        expect(s.result).toBe(null);
    });

    it('アルテミス：もう1回動ける。元のマスへは戻れない', () => {
        let s = board({ rows: flat, workers: [[[2, 2], [4, 4]], [[0, 0], [4, 0]]], gods: ['artemis', null] });
        s = play(s, { type: 'move', from: C(2, 2), to: C(2, 3) });
        expect(moveTargets(s, C(2, 3))).not.toContain(C(2, 2));
        expect(moveTargets(s, C(2, 3))).toContain(C(2, 4));
        expect(buildTargets(s).length).toBeGreaterThan(0); // 動かずに建ててもよい
        s = play(s, { type: 'move', from: C(2, 3), to: C(1, 4) });
        expect(legalSteps(s).every(a => a.type === 'build')).toBe(true);
    });

    it('アテナ：上った次の相手の番は、相手は上れない', () => {
        let s = board({ rows: ['01000', '00000', '00000', '00011', '00000'], workers: [[[0, 0], [4, 0]], [[3, 4], [2, 4]]], gods: ['athena', null] });
        s = play(s, { type: 'move', from: C(0, 0), to: C(1, 0) }, { type: 'build', by: C(1, 0), at: C(2, 0) });
        expect(s.current).toBe(1);
        expect(moveTargets(s, C(3, 4))).not.toContain(C(3, 3));
        expect(moveTargets(s, C(3, 4))).toContain(C(4, 4));
        // アテナが上らなかった番のあとは、上れる
        s = play(s, { type: 'move', from: C(3, 4), to: C(4, 4) }, { type: 'build', by: C(4, 4), at: C(3, 4) });
        s = play(s, { type: 'move', from: C(4, 0), to: C(4, 1) }, { type: 'build', by: C(4, 1), at: C(4, 0) });
        expect(moveTargets(s, C(4, 4))).toContain(C(3, 3));
    });

    it('アトラス：どの段にもドームを建てられる', () => {
        let s = board({ rows: flat, workers: [[[2, 2], [4, 4]], [[0, 0], [4, 0]]], gods: ['atlas', null] });
        s = play(s, { type: 'move', from: C(2, 2), to: C(2, 3) }, { type: 'build', by: C(2, 3), at: C(2, 2), dome: true });
        expect(s.dome[C(2, 2)]).toBe(true);
        expect(s.height[C(2, 2)]).toBe(0);
    });

    it('デメテル：もう1回建てられる（同じマスは不可）。建てずに終えてもよい', () => {
        let s = board({ rows: flat, workers: [[[2, 2], [4, 4]], [[0, 0], [4, 0]]], gods: ['demeter', null] });
        s = play(s, { type: 'move', from: C(2, 2), to: C(2, 3) }, { type: 'build', by: C(2, 3), at: C(2, 2) });
        expect(s.current).toBe(0);
        expect(buildTargets(s)).not.toContain(C(2, 2));
        expect(keys(legalSteps(s))).toContain('end');
        const ended = play(s, { type: 'end' });
        expect(ended.current).toBe(1);
        s = play(s, { type: 'build', by: C(2, 3), at: C(1, 3) });
        expect(s.current).toBe(1);
    });

    it('ヘファイストス：同じマスにもう1段（ドームは不可）', () => {
        let s = board({ rows: ['00000', '00000', '00000', '00000', '00200'], workers: [[[2, 2], [4, 4]], [[0, 0], [4, 0]]], gods: ['hephaestus', null] });
        s = play(s, { type: 'move', from: C(2, 2), to: C(2, 3) }, { type: 'build', by: C(2, 3), at: C(1, 3) });
        expect(buildTargets(s)).toEqual([C(1, 3)]);
        s = play(s, { type: 'build', by: C(2, 3), at: C(1, 3) });
        expect(s.height[C(1, 3)]).toBe(2);
        expect(s.current).toBe(1);
        // 2段のマスに建てて3段になったら、もう1段（ドーム）は建てられないので番が終わる
        let t = board({ rows: ['00000', '00000', '00000', '00000', '00200'], workers: [[[2, 2], [4, 4]], [[0, 0], [4, 0]]], gods: ['hephaestus', null] });
        t = play(t, { type: 'move', from: C(2, 2), to: C(2, 3) }, { type: 'build', by: C(2, 3), at: C(2, 4) });
        expect(t.height[C(2, 4)]).toBe(3);
        expect(t.current).toBe(1);
    });

    it('ヘルメス：上り下りしなければ、2人とも何マスでも動け、そのあとどちらかが建てる。動かずに建ててもよい', () => {
        let s = board({ rows: ['00000', '00000', '00100', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[2, 0], [4, 0]]], gods: ['hermes', null] });
        // 動かずに、どちらの職人でも建てられる
        expect(legalSteps(s).some(a => a.type === 'build' && a.by === C(4, 4))).toBe(true);
        s = play(s, { type: 'move', from: C(0, 0), to: C(0, 1) }, { type: 'move', from: C(0, 1), to: C(1, 2) }, { type: 'move', from: C(4, 4), to: C(3, 4) });
        expect(s.current).toBe(0);
        // 同じ段のマスへだけ動ける（1段の (2,2) へは不可）
        expect(moveTargets(s, C(1, 2))).not.toContain(C(2, 2));
        s = play(s, { type: 'build', by: C(3, 4), at: C(4, 4) });
        expect(s.current).toBe(1);
        // 上る手は、ふつうの1回の移動
        let t = board({ rows: ['01000', '00000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[2, 0], [4, 0]]], gods: ['hermes', null] });
        t = play(t, { type: 'move', from: C(0, 0), to: C(1, 0) });
        expect(legalSteps(t).every(a => a.type === 'build' && a.by === C(1, 0))).toBe(true);
    });

    it('ミノタウロス：相手をまっすぐ後ろの空いたマスへ押し出す', () => {
        let s = board({ rows: ['00000', '00000', '0000D', '00000', '00000'], workers: [[[1, 1], [0, 4]], [[2, 2], [3, 1]]], gods: ['minotaur', null] });
        expect(moveTargets(s, C(1, 1))).toContain(C(2, 2)); // 後ろの (3,3) は空き
        expect(moveTargets(s, C(1, 1))).not.toContain(C(4, 4));
        // (3,1) の後ろは (5,1) で盤の外
        const edge = board({ rows: flat, workers: [[[2, 1], [0, 4]], [[3, 1], [0, 0]]], gods: ['minotaur', null] });
        edge.workers[1] = [C(4, 1), C(0, 0)];
        expect(moveTargets(edge, C(2, 1))).not.toContain(C(4, 1));
        s = play(s, { type: 'move', from: C(1, 1), to: C(2, 2) });
        expect(s.workers[1]).toContain(C(3, 3));
        // 後ろがドームなら押せない
        const blocked = board({ rows: flat, workers: [[[2, 2], [0, 4]], [[3, 2], [0, 0]]], gods: ['minotaur', null] });
        blocked.dome[C(4, 2)] = true;
        expect(moveTargets(blocked, C(2, 2))).not.toContain(C(3, 2));
    });

    it('パン：2段以上下りても勝ち', () => {
        let s = board({ rows: ['20000', '00000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[2, 2], [4, 0]]], gods: ['pan', null] });
        s = play(s, { type: 'move', from: C(0, 0), to: C(1, 0) });
        expect(s.result).toEqual({ winner: 0, reason: 'pan' });
        let t = board({ rows: ['21000', '00000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[2, 2], [4, 0]]], gods: ['pan', null] });
        t = play(t, { type: 'move', from: C(0, 0), to: C(1, 0) });
        expect(t.result).toBe(null);
    });

    it('プロメテウス：動く前に建てたら、上れない。そのあと動いて建てる', () => {
        let s = board({ rows: ['00000', '01000', '00000', '00000', '00000'], workers: [[[0, 0], [4, 4]], [[2, 2], [4, 0]]], gods: ['prometheus', null] });
        s = play(s, { type: 'build', by: C(0, 0), at: C(1, 0) });
        expect(s.current).toBe(0);
        // 動けるのは建てた職人だけで、上れない
        expect(legalSteps(s).every(a => a.type === 'move' && a.from === C(0, 0))).toBe(true);
        expect(moveTargets(s, C(0, 0))).toEqual([C(0, 1)]);
        s = play(s, { type: 'move', from: C(0, 0), to: C(0, 1) }, { type: 'build', by: C(0, 1), at: C(0, 0) });
        expect(s.current).toBe(1);
    });

    it('神のない相手には、神の力が働かない', () => {
        const s = board({ rows: flat, workers: [[[0, 0], [4, 4]], [[1, 1], [4, 0]]], gods: [null, 'apollo'] });
        expect(moveTargets(s, C(0, 0))).not.toContain(C(1, 1));
    });
});

describe('進行と記録', () => {
    it('操作を記録し、同じ結果を再現できる。断った操作は状態を変えない', () => {
        for (const gods of [null, ['hermes', 'random'], ['prometheus', 'demeter']]) {
            const players = [{ name: 'A' }, { name: 'B', isCPU: true }];
            const game = new Game(players, { seed: 3, gods });
            let n = 0;
            while (!game.isOver() && n++ < 120) {
                const before = JSON.stringify(game.state);
                const seat = game.current;
                expect(game.applyCommand(seat, { type: 'move', from: 99, to: 0 })).toBe(false);
                expect(game.applyCommand((seat + 1) % 2, game.legalSteps()[0])).toBe(false);
                expect(game.applyCommand(seat, { type: 'build', by: 0, at: 24 })).toBe(false);
                expect(JSON.stringify(game.state)).toBe(before);
                const steps = game.legalSteps();
                // ヘルメスがいつまでも歩かないように、建てる手を優先する
                const builds = steps.filter(a => a.type !== 'move');
                const pool = builds.length && n % 3 ? builds : steps;
                expect(game.applyCommand(seat, pool[(n * 37) % pool.length])).toBe(true);
            }
            const again = Game.replay(players, game.options, game.commands);
            expect(JSON.stringify(again.state)).toBe(JSON.stringify(game.state));
        }
    });

    it('「おまかせ」の神は、ほかの席と重ならず、同じシードなら同じ', () => {
        for (let seed = 0; seed < 20; seed++) {
            const g = new Game([{}, {}], { seed, gods: ['athena', 'random'] });
            expect(g.gods[0]).toBe('athena');
            expect(g.gods[1]).not.toBe('athena');
            expect(new Game([{}, {}], { seed, gods: ['athena', 'random'] }).gods).toEqual(g.gods);
        }
    });

    it('3人では神を使わない', () => {
        const g = new Game([{}, {}, {}], { seed: 1, gods: ['apollo', 'random', 'random'] });
        expect(g.gods).toEqual([null, null, null]);
    });

    it('断った理由', () => {
        const game = new Game([{}, {}], { seed: 1 });
        [0, 1, 2, 3].forEach(c => game.applyCommand(game.current, { type: 'place', to: c }));
        expect(game.applyCommand(game.current, { type: 'place', to: 4 })).toBe(false);
        expect(game.applyCommand(game.current, { type: 'build', by: 0, at: 5 })).toBe(false);
        expect(game.lastError).toBe('先に職人を動かします');
    });
});
