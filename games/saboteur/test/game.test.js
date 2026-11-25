import { describe, it, expect } from 'vitest';
import Game, { CARDS } from '../public/js/game.js';
import { GOLD_CARDS } from '../public/js/cards.js';
import { key, placements, liveCells } from '../public/js/board.js';
import { createGameView } from '../public/js/game-view.js';
import { players, makeGame, pathCard, actionCard, setup, snapshot } from './helpers.js';

const count = (pred) => CARDS.filter(pred).length;
// 金のゴールを真ん中（1番）に置く
const GOLD_MIDDLE = [1, 0, 2];

describe('カードの構成', () => {
    it('道のカード40枚（つながる31枚・行き止まり9枚）、アクション27枚', () => {
        expect(count(c => c.kind === 'path')).toBe(40);
        expect(count(c => c.kind === 'path' && c.connected)).toBe(31);
        expect(count(c => c.kind === 'path' && !c.connected)).toBe(9);
        expect(count(c => c.kind !== 'path')).toBe(27);
        expect(count(c => c.kind === 'break')).toBe(9);
        expect(count(c => c.kind === 'repair')).toBe(9);
        expect(count(c => c.kind === 'repair' && c.tools.length === 2)).toBe(3);
        expect(count(c => c.kind === 'map')).toBe(6);
        expect(count(c => c.kind === 'rockfall')).toBe(3);
    });

    it('形ごとの枚数：直線（縦4・横3）、曲がり角（4・5）、T字（5・5）、十字5', () => {
        const n = (shape) => count(c => c.kind === 'path' && c.connected && c.shape === shape);
        expect([n('13'), n('24'), n('12'), n('14'), n('123'), n('234'), n('1234')]).toEqual([4, 3, 4, 5, 5, 5, 5]);
    });

    it('金塊カードは28枚（1つ16・2つ8・3つ4）', () => {
        expect(GOLD_CARDS).toHaveLength(28);
        expect(GOLD_CARDS.reduce((s, v) => s + v, 0)).toBe(44);
    });
});

describe('準備', () => {
    it.each([[3, 1, 6], [4, 1, 6], [5, 2, 6], [6, 2, 5], [7, 3, 5], [8, 3, 4], [9, 3, 4], [10, 4, 4]])('%i人：お邪魔者は最大%i人、手札%i枚', (n, saboteurs, hand) => {
        // 役割は人数+1枚から配るので、お邪魔者は saboteurs 人か1人少ない
        for (let seed = 1; seed <= 10; seed++) {
            const game = makeGame(n, seed);
            const s = game.players.filter(p => p.role === 'saboteur').length;
            expect(s === saboteurs || s === saboteurs - 1).toBe(true);
            game.players.forEach(p => expect(p.hand).toHaveLength(hand));
            expect(game.deck).toHaveLength(67 - n * hand);
        }
    });

    it('スタートと、8マス右に伏せたゴール3枚（1枚が金）', () => {
        const game = makeGame(4, 2);
        expect(game.board[key(0, 0)].type).toBe('start');
        expect(game.goals.map(g => g.pos)).toEqual([[8, -2], [8, 0], [8, 2]]);
        expect(game.goals.filter(g => g.card === 0)).toHaveLength(1);
    });

    it('人数は3〜10人。同じシードなら同じ配り方', () => {
        expect(() => new Game(players(2))).toThrow();
        expect(() => new Game(players(11))).toThrow();
        expect(snapshot(makeGame(6, 9))).toBe(snapshot(makeGame(6, 9)));
    });
});

describe('道を置く', () => {
    it('スタートの隣に、辺が合ってつながる道を置ける', () => {
        const game = makeGame(4);
        const straight = pathCard('24');
        setup(game, { hand: [straight] });
        expect(game.applyCommand(0, { type: 'path', card: straight, x: 1, y: 0, rotated: false })).toBe(true);
        expect(game.board[key(1, 0)].id).toBe(straight);
        expect(game.current).toBe(1);
        expect(game.players[0].hand).toHaveLength(1); // 引いた
    });

    it('辺が合わない、つながらない、離れた場所には置けない', () => {
        const game = makeGame(4);
        const vertical = pathCard('13');
        setup(game, { hand: [vertical] });
        expect(game.applyCommand(0, { type: 'path', card: vertical, x: 1, y: 0, rotated: false })).toBe(false); // 右の辺が合わない
        expect(game.lastError).toMatch(/合いません/);
        expect(game.applyCommand(0, { type: 'path', card: vertical, x: 3, y: 3, rotated: false })).toBe(false);
        expect(game.applyCommand(0, { type: 'path', card: vertical, x: 0, y: 0, rotated: false })).toBe(false);
        expect(game.applyCommand(0, { type: 'path', card: vertical, x: 0, y: 1, rotated: false })).toBe(true);
    });

    it('180度回して置ける', () => {
        const game = makeGame(4);
        const curve = pathCard('12'); // 上と右
        setup(game, { hand: [curve] });
        // (-1, 0) に置くには右（スタート側）が開いていればよい。上と右なら回さずに置けるが、下は開いていない
        expect(game.applyCommand(0, { type: 'path', card: curve, x: 0, y: -1, rotated: false })).toBe(false); // 下が閉じている
        expect(game.applyCommand(0, { type: 'path', card: curve, x: 0, y: -1, rotated: true })).toBe(true);  // 回すと下と左
    });

    it('行き止まりの先には、つながる道を置けない', () => {
        const game = makeGame(4);
        const dead = pathCard('24', false);
        const straight = pathCard('24');
        setup(game, { hand: [straight], paths: [[dead, 1, 0]] });
        expect(liveCells(game.board, game.goals).has(key(1, 0))).toBe(false);
        expect(game.applyCommand(0, { type: 'path', card: straight, x: 2, y: 0, rotated: false })).toBe(false);
        expect(game.lastError).toMatch(/スタートからつながる/);
    });

    it('置ける場所と向きの候補を出せる', () => {
        const game = makeGame(4);
        const list = placements(game.board, game.goals, pathCard('1234'));
        expect(list.map(p => `${p.x},${p.y}`).sort()).toEqual(['-1,0', '0,-1', '0,1', '1,0']);
    });

    it('道具が壊れていると、道を置けない', () => {
        const game = makeGame(4);
        const straight = pathCard('24');
        setup(game, { hand: [straight], broken: [['pick']] });
        expect(game.applyCommand(0, { type: 'path', card: straight, x: 1, y: 0, rotated: false })).toBe(false);
        expect(game.lastError).toMatch(/壊れて/);
    });
});

describe('アクション', () => {
    it('ほかの人の道具を壊す。同じ道具を2つは壊せず、自分には出せない', () => {
        const game = makeGame(4);
        const a = actionCard('break', ['lamp'], 0);
        setup(game, { hand: [a, actionCard('break', ['lamp'], 1)], broken: [[], ['lamp']] });
        expect(game.applyCommand(0, { type: 'break', card: a, target: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'break', card: a, target: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'break', card: a, target: 2 })).toBe(true);
        expect(game.players[2].broken).toEqual(['lamp']);
    });

    it('直す：壊れた道具を1つ直す。2種類のカードはどちらか1つだけ', () => {
        const game = makeGame(4);
        const dual = actionCard('repair', ['pick', 'lamp']);
        setup(game, { hand: [dual], broken: [['pick', 'lamp']] });
        expect(game.applyCommand(0, { type: 'repair', card: dual, target: 0, tool: 'cart' })).toBe(false);
        expect(game.applyCommand(0, { type: 'repair', card: dual, target: 1, tool: 'pick' })).toBe(false); // 壊れていない
        expect(game.applyCommand(0, { type: 'repair', card: dual, target: 0, tool: 'lamp' })).toBe(true);
        expect(game.players[0].broken).toEqual(['pick']);
    });

    it('地図：伏せたゴールを自分だけ見る', () => {
        const game = makeGame(4, 3);
        const map = actionCard('map');
        setup(game, { hand: [map], goalCards: GOLD_MIDDLE });
        expect(game.applyCommand(0, { type: 'map', card: map, goal: 1 })).toBe(true);
        expect(game.players[0].knownGoals).toEqual({ 1: 'gold' });
        expect(createGameView(game, 0).knownGoals).toEqual({ 1: 'gold' });
        expect(createGameView(game, 1).knownGoals).toEqual({});
        expect(createGameView(game, 1).events.find(e => e.type === 'map').gold).toBe(null);
    });

    it('落盤：道のカードを1枚取り除く。スタートとゴールは取り除けない', () => {
        const game = makeGame(4);
        const rock = actionCard('rockfall');
        setup(game, { hand: [rock], paths: [[pathCard('24'), 1, 0]] });
        expect(game.applyCommand(0, { type: 'rockfall', card: rock, x: 0, y: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'rockfall', card: rock, x: 8, y: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'rockfall', card: rock, x: 1, y: 0 })).toBe(true);
        expect(game.board[key(1, 0)]).toBeUndefined();
    });

    it('パス：1枚を伏せて捨てる。中身はほかの人には見せない', () => {
        const game = makeGame(4);
        const id = game.players[0].hand[0];
        setup(game, { current: 0 });
        expect(game.applyCommand(0, { type: 'discard', card: id })).toBe(true);
        expect(createGameView(game, 1).events.find(e => e.type === 'discard').card).toBe(null);
        expect(createGameView(game, 0).events.find(e => e.type === 'discard').card).toBe(id);
    });
});

describe('ラウンドの終わり', () => {
    // スタートから (7, 0) まで横の直線を並べ、席0が (7, 0) に置けば金（真ん中）に届く
    const nearGold = (game) => {
        const straights = CARDS.filter(c => c.kind === 'path' && c.connected && c.shape === '24').map(c => c.id);
        const crosses = CARDS.filter(c => c.kind === 'path' && c.connected && c.shape === '1234').map(c => c.id);
        const line = [...straights, ...crosses].slice(0, 6);
        setup(game, { goalCards: GOLD_MIDDLE, paths: line.map((id, i) => [id, i + 1, 0]), hand: [crosses[4]] });
        game.deck = game.deck.filter(id => !line.includes(id));
        return crosses[4];
    };

    it('道が金のゴールに届いたら、金鉱掘りの勝ち。金塊は人数ぶん、着いた人から反時計回りに金鉱掘りへ', () => {
        const game = makeGame(4, 5);
        game.players.forEach((p, i) => { p.role = i === 2 ? 'saboteur' : 'digger'; });
        const card = nearGold(game);
        expect(game.applyCommand(0, { type: 'path', card, x: 7, y: 0, rotated: false })).toBe(true);
        expect(game.round).toBe(2);
        const result = game.history[0];
        expect(result.winner).toBe('diggers');
        expect(result.finder).toBe(0);
        expect(result.payouts[2]).toBe(0);
        // 4枚引いて、0 → 3 → 1 → 0 の順に高いものから取る
        expect(result.payouts.reduce((s, v) => s + v, 0)).toBeGreaterThanOrEqual(4);
        expect(game.players[0].goldCards).toHaveLength(2);
        expect(game.players[3].goldCards).toHaveLength(1);
        expect(game.players[1].goldCards).toHaveLength(1);
        expect(game.players[0].goldCards[0]).toBeGreaterThanOrEqual(game.players[3].goldCards[0]);
        expect(game.goldDeck).toHaveLength(24);
        // 次のラウンドは、最後に手番をした人の次の席から
        expect(game.current).toBe(1);
    });

    it('石のゴールに届いたらめくって続ける', () => {
        const game = makeGame(4, 5);
        const card = nearGold(game);
        game.goals.forEach((g, i) => { g.card = [1, 2, 0][i]; }); // 真ん中は石
        game.applyCommand(0, { type: 'path', card, x: 7, y: 0, rotated: false });
        expect(game.round).toBe(1);
        expect(game.goals[1].revealed).toBe(true);
        expect(game.board[key(8, 0)].type).toBe('goal');
    });

    it('山札と全員の手札がなくなったら、お邪魔者の勝ち。1人なら4、2〜3人なら3、4人なら2', () => {
        const game = makeGame(4, 6);
        game.players.forEach((p, i) => { p.role = i === 1 ? 'saboteur' : 'digger'; });
        game.deck = [];
        game.players.forEach((p, i) => { p.hand = i === 0 ? [p.hand[0]] : []; });
        setup(game, { current: 0 });
        game.applyCommand(0, { type: 'discard', card: game.players[0].hand[0] });
        expect(game.history[0].winner).toBe('saboteurs');
        expect(game.history[0].payouts).toEqual([0, 4, 0, 0]);

        const ten = makeGame(10, 6);
        ten.players.forEach((p, i) => { p.role = i < 4 ? 'saboteur' : 'digger'; });
        ten.deck = [];
        ten.players.forEach((p, i) => { p.hand = i === 0 ? [p.hand[0]] : []; });
        setup(ten, { current: 0 });
        ten.applyCommand(0, { type: 'discard', card: ten.players[0].hand[0] });
        expect(ten.history[0].payouts.slice(0, 4)).toEqual([2, 2, 2, 2]);
    });

    it('手札のない人は飛ばす', () => {
        const game = makeGame(4, 6);
        game.deck = [];
        game.players[1].hand = [];
        setup(game, { current: 0 });
        game.applyCommand(0, { type: 'discard', card: game.players[0].hand[0] });
        expect(game.current).toBe(2);
    });

    it('3ラウンドで終わり、金塊の合計がいちばん多い人が勝ち', () => {
        const game = makeGame(3, 7);
        for (let r = 0; r < 3; r++) {
            game.deck = [];
            game.players.forEach((p, i) => { p.hand = i === game.current ? [p.hand[0]] : []; });
            game.applyCommand(game.current, { type: 'discard', card: game.players[game.current].hand[0] });
        }
        expect(game.phase).toBe('end');
        expect(game.history).toHaveLength(3);
        const best = Math.max(...game.players.map(p => p.gold));
        expect(game.winners).toEqual(game.players.filter(p => p.gold === best).map(p => p.id));
    });
});

describe('記録と再現', () => {
    it('断った操作では、状態が少しも変わらない', () => {
        const game = makeGame(5, 4);
        const straight = pathCard('24');
        const rock = actionCard('rockfall');
        setup(game, { hand: [straight, rock] });
        const before = snapshot(game);
        [
            { type: 'path', card: straight, x: 5, y: 5, rotated: false }, { type: 'path', card: straight, x: 1, y: 0, rotated: 'no' },
            { type: 'path', card: rock, x: 1, y: 0, rotated: false }, { type: 'rockfall', card: rock, x: 0, y: 0 },
            { type: 'map', card: rock, goal: 0 }, { type: 'discard', card: 999 }, { type: 'nope', card: straight }, null
        ].forEach(command => {
            expect(game.applyCommand(0, command)).toBe(false);
            expect(snapshot(game)).toBe(before);
        });
        expect(game.applyCommand(1, { type: 'discard', card: game.players[1].hand[0] })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じ状態を作り直せる。余計な項目は記録しない', () => {
        const game = makeGame(5, 8);
        const seat = game.current;
        game.applyCommand(seat, { type: 'discard', card: game.players[seat].hand[0], junk: 1 });
        expect(Object.keys(game.commands[0].command)).toEqual(['type', 'card']);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });
});

describe('ビュー', () => {
    it('役割と手札は自分の分だけ。伏せたゴールの中身は見せない', () => {
        const game = makeGame(6, 3);
        const view = createGameView(game, 2);
        expect(view.role).toBe(game.players[2].role);
        expect(view.hand).toEqual(game.players[2].hand);
        expect(JSON.stringify(view.players)).not.toContain('role');
        expect(view.goals.every(g => g.gold === null && g.card === null)).toBe(true);
        expect('deck' in view).toBe(false);
        const deal = view.events.find(e => e.type === 'deal');
        expect(deal.roles).toBeUndefined();
        expect(deal.role).toBe(game.players[2].role);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
});
