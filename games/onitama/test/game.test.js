import { describe, it, expect } from 'vitest';
import Game, { MAX_PLIES } from '../public/js/game.js';
import { CARDS, CARD_IDS, applyMove, positionKey } from '../public/js/rules.js';
import { newGame, players, setPosition, snapshot } from './helpers.js';

const move = (game, seat, card, from, to) => game.applyCommand(seat, { type: 'move', card, from, to });

describe('準備', () => {
    it('違う5枚を使い、各自2枚と脇1枚。脇のカードの印の色の人が先手。同じシードなら同じ', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const game = newGame(seed);
            const used = [...game.hands[0], ...game.hands[1], game.side];
            expect(new Set(used).size).toBe(5);
            used.forEach(c => expect(CARD_IDS).toContain(c));
            expect(game.first).toBe(CARDS[game.side].stamp === 'blue' ? 0 : 1);
            expect(game.actors()).toEqual([game.first]);
            expect(snapshot(newGame(seed))).toBe(snapshot(game));
        }
        expect(() => new Game(players([false, true, true]))).toThrow();
    });
});

describe('手番', () => {
    it('カードの図のマスへ駒を動かし、使ったカードを脇へ、脇のカードを手札に入れる', () => {
        const game = setPosition(newGame(1), { 22: '藍師', 2: '朱師', 21: '藍弟' }, { hands: [['tiger', 'crab'], ['ox', 'eel']], side: 'dragon' });
        expect(move(game, 0, 'tiger', 21, 11)).toBe(true);
        expect(game.board[11]).toBe(1);
        expect(game.board[21]).toBe(0);
        expect(game.hands[0]).toEqual(['dragon', 'crab']);
        expect(game.side).toBe('tiger');
        expect(game.current).toBe(1);
        // 次の人は、脇に来た虎を自分の向きで使える（席1の「前に2」は下へ）
        expect(move(game, 1, 'ox', 2, 7)).toBe(true);
        expect(game.hands[1]).toEqual(['tiger', 'eel']);
        expect(game.moves(0).length).toBeGreaterThan(0);
    });

    it('ほかの駒は飛び越えてよい', () => {
        const game = setPosition(newGame(1), { 22: '藍師', 17: '朱弟', 2: '朱師' }, { hands: [['tiger', 'crab'], ['ox', 'eel']], side: 'dragon' });
        expect(move(game, 0, 'tiger', 22, 12)).toBe(true);
        expect(game.board[17]).toBe(3);
    });

    it('盤の外・自分の駒のマス・カードにない動き・相手の駒・ほかの人の番は断り、状態を変えない', () => {
        const game = setPosition(newGame(1), { 22: '藍師', 20: '藍弟', 21: '藍弟', 2: '朱師' }, { hands: [['crab', 'tiger'], ['ox', 'eel']], side: 'dragon' });
        const before = snapshot(game);
        [
            [0, { type: 'move', card: 'crab', from: 20, to: 18 }],   // 蟹で左に2：盤の外は行けない（18 は段が違う）
            [0, { type: 'move', card: 'crab', from: 20, to: 22 }],   // 右に2：自分の師匠
            [0, { type: 'move', card: 'tiger', from: 22, to: 17 }],  // 虎に前1はない
            [0, { type: 'move', card: 'tiger', from: 2, to: 12 }],   // 相手の駒
            [0, { type: 'move', card: 'ox', from: 22, to: 17 }],     // 手札にないカード
            [0, { type: 'move', card: 'tiger', from: 22, to: 99 }],
            [0, { type: 'pass', card: 'tiger' }],                    // 動ける手があるのに見送る
            [1, { type: 'move', card: 'ox', from: 2, to: 7 }],       // 相手の番ではない
            [0, { type: 'proxy' }],
            [0, null]
        ].forEach(([seat, command]) => expect(game.applyCommand(seat, command), JSON.stringify(command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('相手の弟子のマスに動いたら取る', () => {
        const game = setPosition(newGame(1), { 22: '藍師', 21: '藍弟', 11: '朱弟', 2: '朱師' }, { hands: [['tiger', 'crab'], ['ox', 'eel']], side: 'dragon' });
        expect(move(game, 0, 'tiger', 21, 11)).toBe(true);
        expect(game.board[11]).toBe(1);
        expect(game.board.filter(p => p === 3)).toHaveLength(0);
        expect(game.isOver()).toBe(false);
    });

    it('どのカードでも動けないときだけ、駒を動かさずにカード1枚を脇と入れ替える', () => {
        // 藍の駒は左の列に詰まっていて、虎（前2・後1）と馬（左1・前1・後1）では動けない
        const game = setPosition(newGame(1), { 0: '藍師', 5: '藍弟', 10: '藍弟', 15: '藍弟', 20: '藍弟', 4: '朱師' }, { hands: [['tiger', 'horse'], ['ox', 'eel']], side: 'dragon' });
        expect(game.moves(0)).toEqual([]);
        expect(game.applyCommand(0, { type: 'pass', card: 'ox' })).toBe(false);
        expect(game.applyCommand(0, { type: 'pass', card: 'horse' })).toBe(true);
        expect(game.hands[0]).toEqual(['tiger', 'dragon']);
        expect(game.side).toBe('horse');
        expect(game.board[0]).toBe(2);
        expect(game.current).toBe(1);
    });
});

describe('勝ち方', () => {
    it('石の道：相手の師匠を取ったら勝ち', () => {
        const game = setPosition(newGame(1), { 22: '藍師', 17: '藍弟', 7: '朱師' }, { hands: [['tiger', 'crab'], ['ox', 'eel']], side: 'dragon' });
        expect(move(game, 0, 'tiger', 17, 7)).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(0);
        expect(game.result).toBe('stone');
        expect(game.actors()).toEqual([]);
    });

    it('川の道：自分の師匠が相手の神殿の門に入ったら勝ち。弟子が入っても勝ちではない', () => {
        const game = setPosition(newGame(1), { 21: '藍師', 7: '藍弟', 12: '朱師' }, { hands: [['tiger', 'crab'], ['ox', 'eel']], side: 'dragon' });
        expect(move(game, 0, 'tiger', 7, 2)).toBe(false);   // 虎は前2：7 から行けるのは上の外
        const g2 = setPosition(newGame(1), { 21: '藍師', 12: '藍弟', 14: '朱師' }, { hands: [['tiger', 'crab'], ['ox', 'eel']], side: 'dragon' });
        expect(move(g2, 0, 'tiger', 12, 2)).toBe(true);
        expect(g2.isOver()).toBe(false);
        const g3 = setPosition(newGame(1), { 12: '藍師', 14: '朱師' }, { hands: [['tiger', 'crab'], ['ox', 'eel']], side: 'dragon' });
        expect(move(g3, 0, 'tiger', 12, 2)).toBe(true);
        expect(g3.winner).toBe(0);
        expect(g3.result).toBe('stream');
    });

    it('朱の川の道は、藍の神殿の門（下の段の真ん中）', () => {
        const game = setPosition(newGame(1), { 12: '朱師', 0: '藍師' }, { hands: [['ox', 'eel'], ['tiger', 'crab']], side: 'dragon', current: 1 });
        expect(move(game, 1, 'tiger', 12, 22)).toBe(true);
        expect(game.winner).toBe(1);
        expect(game.result).toBe('stream');
    });

    it('同じ局面が3回目に現れたら、千日手で引き分け', () => {
        const game = setPosition(newGame(1), { 22: '藍師', 2: '朱師' }, { hands: [['ox', 'crab'], ['eel', 'tiger']], side: 'dragon' });
        const after = applyMove(game.state(), 0, { card: 'ox', from: 22, to: 17 });
        game.seen.set(positionKey(after.state, 1), 2);
        expect(move(game, 0, 'ox', 22, 17)).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(null);
        expect(game.result).toBe('repetition');
    });

    it('実際に行き来して、3回目で千日手になる', () => {
        // 師匠どうしが手前の段を左右に行き来する（猪・鵞鳥・雄鶏・象は左右に1、馬は左に1）。5枚が一巡すると同じ局面に戻る
        const game = setPosition(newGame(1), { 22: '藍師', 2: '朱師' }, { hands: [['boar', 'goose'], ['rooster', 'elephant']], side: 'horse' });
        let guard = 0;
        while (!game.isOver() && guard++ < 200) {
            const seat = game.current;
            const home = seat === 0 ? 22 : 2;
            const at = game.board.indexOf(seat === 0 ? 2 : 4);
            const goal = at === home ? home + 1 : home;
            const pick = game.moves(seat).find(m => m.from === at && m.to === goal) ?? game.moves(seat).find(m => m.from === at && m.to === home - 1);
            expect(game.applyCommand(seat, { type: 'move', card: pick.card, from: pick.from, to: pick.to })).toBe(true);
        }
        expect(game.result).toBe('repetition');
        expect(game.winner).toBe(null);
    });

    it(`${MAX_PLIES}手で決着がつかなければ引き分け`, () => {
        const game = setPosition(newGame(1), { 22: '藍師', 2: '朱師' }, { hands: [['ox', 'crab'], ['eel', 'tiger']], side: 'dragon' });
        game.ply = MAX_PLIES - 1;
        expect(move(game, 0, 'ox', 22, 17)).toBe(true);
        expect(game.result).toBe('limit');
        expect(game.winner).toBe(null);
    });
});
