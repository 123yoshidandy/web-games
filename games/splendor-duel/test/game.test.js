import { describe, it, expect } from 'vitest';
import Game, {
    CARDS, ROYALS, SPIRAL, CELLS, LEVELS, GOLD, TOKEN_LIMIT, takeLines, asLine, bonusesOf, pointsOf, crownsOf, colorPointsOf, countTokens
} from '../public/js/game.js';
import { makeGame, setBoard, giveTokens, giveBonuses, findCard, placeInPyramid, totalTokens, snapshot, tokens } from './helpers.js';

const FULL = ['WUGRK', 'PWUGR', 'KOWUG', 'RKPOW', 'UGRKO'];
const card = (predicate) => findCard(predicate);
const L1 = (color, extra = {}) => card(c => c.level === 1 && c.color === color && Object.entries(extra).every(([k, v]) => c[k] === v));

describe('準備', () => {
    it('25個のトークンで盤が埋まり、カードは5・4・3枚が表になる', () => {
        const game = makeGame(3);
        expect(game.board.every(t => t !== null)).toBe(true);
        expect(countTokens(game.bag)).toBe(0);
        const count = (c) => game.board.filter(t => t === c).length;
        expect([count('white'), count('pearl'), count(GOLD)]).toEqual([4, 2, 3]);
        expect(LEVELS.map(l => game.pyramid[l].length)).toEqual([5, 4, 3]);
        expect(LEVELS.map(l => game.decks[l].length)).toEqual([25, 20, 10]);
        expect(CARDS.length).toBe(67);
        expect(game.royals).toEqual([0, 1, 2, 3]);
    });

    it('後手の人が特権を1枚持って始まる', () => {
        const game = makeGame(3);
        expect(game.players[0].privileges).toBe(0);
        expect(game.players[1].privileges).toBe(1);
        expect(game.privileges).toBe(2);
        const other = new Game([{ name: 'A' }, { name: 'B' }], { seed: 3, startPlayer: 1 });
        expect(other.players[0].privileges).toBe(1);
    });

    it('同じシードなら同じ盤と山札になる', () => {
        expect(snapshot(makeGame(9))).toBe(snapshot(makeGame(9)));
        expect(JSON.stringify(makeGame(9).board)).not.toBe(JSON.stringify(makeGame(10).board));
    });

    it('らせんは中央から始まり、25マスを1回ずつ通る', () => {
        expect(SPIRAL[0]).toBe(12);
        expect(new Set(SPIRAL).size).toBe(CELLS);
        // 隣り合うマスへ1つずつ進む
        for (let i = 1; i < CELLS; i++) {
            const a = SPIRAL[i - 1], b = SPIRAL[i];
            expect(Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) + Math.abs(a % 5 - b % 5)).toBe(1);
        }
    });
});

describe('トークンを取る', () => {
    it('縦・横・斜めにすき間なく連なる3個まで取れる', () => {
        expect(asLine([2, 0, 1])).toEqual([0, 1, 2]);
        expect(asLine([0, 6, 12])).toEqual([0, 6, 12]);
        expect(asLine([4, 8, 12])).toEqual([4, 8, 12]);
        expect(asLine([0, 2])).toBe(null);
        expect(asLine([4, 5])).toBe(null);   // 行の端から次の行の頭へは続かない
        expect(asLine([0, 1, 6])).toBe(null);
    });

    it('取ると盤から消えて持ち物に入り、手番が移る', () => {
        const game = makeGame();
        setBoard(game, FULL);
        expect(game.applyCommand(0, { type: 'take', cells: [0, 1, 2] })).toBe(true);
        expect(game.players[0].tokens).toMatchObject({ white: 1, blue: 1, green: 1 });
        expect(game.board.slice(0, 3)).toEqual([null, null, null]);
        expect(game.current).toBe(1);
        expect(totalTokens(game)).toBe(25);
    });

    it('黄金・空きマス・すき間のある並び・4個は取れず、状態も変わらない', () => {
        const game = makeGame();
        setBoard(game, ['WU.RK', 'PWUGR', 'KOWUG', 'RKPOW', 'UGRKO']);
        const before = snapshot(game);
        [[0, 1, 2], [10, 11], [0, 2], [0, 6, 12, 18], [], [0, 0], [25], 'x'].forEach(cells => {
            expect(game.applyCommand(0, { type: 'take', cells })).toBe(false);
        });
        expect(snapshot(game)).toBe(before);
    });

    it('同じ色を3個か、パールを2個取ると、相手が特権を得る', () => {
        const game = makeGame();
        setBoard(game, ['RRRWW', 'PP...', '.....', '.....', '.....']);
        game.applyCommand(0, { type: 'take', cells: [0, 1, 2] });
        expect(game.players[1].privileges).toBe(2);
        game.applyCommand(1, { type: 'take', cells: [5, 6] });
        expect(game.players[0].privileges).toBe(1);
        expect(game.privileges).toBe(0);
    });

    it('巻物が残っていなければ、相手から特権を取る', () => {
        const game = makeGame();
        setBoard(game, ['RRR..', '.....', '.....', '.....', '.....']);
        game.privileges = 0;
        game.players[0].privileges = 2;
        game.players[1].privileges = 1;
        game.applyCommand(0, { type: 'take', cells: [0, 1, 2] });
        expect(game.players.map(p => p.privileges)).toEqual([1, 2]);
    });

    it('取れる連なりを列挙できる', () => {
        const game = makeGame();
        setBoard(game, ['WO...', 'U....', '.....', '.....', '.....']);
        const lines = takeLines(game.board).map(l => l.join(','));
        expect(lines.sort()).toEqual(['0', '0,5', '5']);
    });
});

describe('任意の行動', () => {
    it('特権を使って、盤の宝石かパールを1個取る。黄金は取れない', () => {
        const game = makeGame();
        setBoard(game, FULL);
        game.players[0].privileges = 1;
        game.privileges = 1;
        expect(game.applyCommand(0, { type: 'privilege', cell: 11 })).toBe(false); // 黄金
        expect(game.applyCommand(0, { type: 'privilege', cell: 5 })).toBe(true);
        expect(game.players[0].tokens.pearl).toBe(1);
        expect(game.privileges).toBe(2);
        expect(game.current).toBe(0); // 必須の行動はまだ
        expect(game.applyCommand(0, { type: 'privilege', cell: 0 })).toBe(false); // もう持っていない
    });

    it('補充すると、袋の中身がらせんの順に空きへ置かれ、相手が特権を得る。補充のあとは特権を使えない', () => {
        const game = makeGame();
        setBoard(game, ['WUGRK', 'PWUGR', 'KO..G', 'RKPOW', 'UGRKO']);
        game.players[0].privileges = 1;
        game.privileges = 1;
        game.players[1].privileges = 1;
        expect(countTokens(game.bag)).toBe(2);
        expect(game.applyCommand(0, { type: 'replenish' })).toBe(true);
        expect(game.board[12]).not.toBe(null);
        expect(game.board[13]).not.toBe(null);
        expect(countTokens(game.bag)).toBe(0);
        expect(game.players[1].privileges).toBe(2);
        expect(game.applyCommand(0, { type: 'privilege', cell: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'replenish' })).toBe(false); // 袋が空
    });
});

describe('予約', () => {
    it('黄金を取り、場のカードを予約する。場は山札から補われる', () => {
        const game = makeGame();
        const id = game.pyramid[2][1];
        const gold = game.board.indexOf(GOLD);
        expect(game.applyCommand(0, { type: 'reserve', card: id, gold })).toBe(true);
        expect(game.players[0].reserved).toEqual([{ id, hidden: false }]);
        expect(game.players[0].tokens.gold).toBe(1);
        expect(game.board[gold]).toBe(null);
        expect(game.pyramid[2][1]).not.toBe(null);
        expect(game.decks[2].length).toBe(19);
    });

    it('盤に黄金がない・3枚予約済み・黄金でないマスなら、予約できない', () => {
        const game = makeGame();
        const id = game.pyramid[1][0];
        expect(game.applyCommand(0, { type: 'reserve', card: id, gold: game.board.findIndex(t => t !== GOLD) })).toBe(false);
        game.players[0].reserved = [{ id: game.decks[1][5], hidden: true }, { id: game.decks[1][6], hidden: true }, { id: game.decks[1][7], hidden: true }];
        expect(game.applyCommand(0, { type: 'reserve', card: id })).toBe(false);
        game.players[0].reserved = [];
        setBoard(game, ['WUGRK', 'PWUGR', 'K.WUG', 'RKP.W', 'UGRK.']);
        expect(game.applyCommand(0, { type: 'reserve', card: id })).toBe(false);
    });

    it('山札の一番上を伏せて予約できる', () => {
        const game = makeGame();
        const top = game.decks[3][0];
        expect(game.applyCommand(0, { type: 'reserve', level: 3 })).toBe(true);
        expect(game.players[0].reserved).toEqual([{ id: top, hidden: true }]);
    });
});

describe('買う', () => {
    it('ボーナスの分だけ安くなり、パールは安くならず、足りない分は黄金で払う', () => {
        const game = makeGame();
        const id = card(c => c.level === 1 && c.color === 'white' && c.ability === 'turn'); // 青2 緑2 パール1
        placeInPyramid(game, 1, 0, id);
        giveBonuses(game.players[0], { blue: 1 });
        giveTokens(game.players[0], { blue: 1, green: 1, gold: 2 });
        expect(game.applyCommand(0, { type: 'buy', card: id })).toBe(true);
        expect(game.players[0].tokens).toEqual(tokens());
        expect(game.bag).toMatchObject({ blue: 1, green: 1, gold: 2 });
    });

    it('払えないなら買えず、状態も変わらない', () => {
        const game = makeGame();
        const id = card(c => c.level === 1 && c.color === 'red' && c.crowns === 1); // 黒3
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { black: 2 });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'buy', card: id })).toBe(false);
        expect(game.applyCommand(0, { type: 'buy', card: id, payment: { black: 2, gold: 1 } })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('支払いを指定でき、合わない支払いは断る', () => {
        const game = makeGame();
        const id = card(c => c.level === 1 && c.color === 'red' && c.crowns === 1); // 黒3
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { black: 3, gold: 1 });
        expect(game.applyCommand(0, { type: 'buy', card: id, payment: { black: 3, gold: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'buy', card: id, payment: { black: 2, gold: 1 } })).toBe(true);
        expect(game.players[0].tokens).toMatchObject({ black: 1, gold: 0 });
    });

    it('ボーナス2つのカードは、2つ分安くする', () => {
        const game = makeGame();
        const id = card(c => c.level === 2 && c.color === 'blue' && c.bonus === 2);
        game.players[0].cards.push({ id, color: 'blue' });
        expect(bonusesOf(game.players[0]).blue).toBe(2);
    });

    it('色なしのカードは、ボーナスのカードがないと買えず、持っている色を写す', () => {
        const game = makeGame();
        const id = card(c => c.level === 1 && c.color === 'wild' && c.cost.black === 4); // 黒4 パール1、1点
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { black: 4, pearl: 1 });
        expect(game.applyCommand(0, { type: 'buy', card: id })).toBe(false);
        giveBonuses(game.players[0], { red: 1, green: 1 });
        expect(game.applyCommand(0, { type: 'buy', card: id })).toBe(true);
        expect(game.phase).toBe('choose');
        expect(game.applyCommand(0, { type: 'wild', color: 'blue' })).toBe(false);
        expect(game.applyCommand(0, { type: 'wild', color: 'red' })).toBe(true);
        expect(bonusesOf(game.players[0]).red).toBe(2);
        expect(colorPointsOf(game.players[0]).red).toBe(1);
        expect(game.current).toBe(1);
    });

    it('写せる色が1つなら自動で写す', () => {
        const game = makeGame();
        const id = card(c => c.level === 1 && c.color === 'wild' && c.cost.black === 4);
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { black: 4, pearl: 1 });
        giveBonuses(game.players[0], { green: 2 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.players[0].cards.at(-1)).toEqual({ id, color: 'green' });
        expect(game.current).toBe(1);
    });
});

describe('能力', () => {
    it('もう一度：同じ人がもう1手番行う', () => {
        const game = makeGame();
        const id = L1('white', { ability: 'turn' });
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { blue: 2, green: 2, pearl: 1 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.current).toBe(0);
        expect(game.phase).toBe('main');
        expect(game.turn).toBe(2);
    });

    it('同じ色を取る：盤のその色のトークンを1個選んで取る。1個なら自動、なければ何もない', () => {
        const game = makeGame();
        const id = L1('white', { ability: 'token' }); // 赤2 黒2
        placeInPyramid(game, 1, 0, id);
        setBoard(game, ['W...W', '.....', '..R..', '.....', '.....']);
        giveTokens(game.players[0], { red: 2, black: 2 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.phase).toBe('choose');
        expect(game.pending[0]).toEqual({ type: 'token', color: 'white' });
        expect(game.applyCommand(0, { type: 'token', cell: 12 })).toBe(false);
        expect(game.applyCommand(0, { type: 'token', cell: 4 })).toBe(true);
        expect(game.players[0].tokens.white).toBe(1);
        expect(game.current).toBe(1);

        const g2 = makeGame();
        placeInPyramid(g2, 1, 0, id);
        setBoard(g2, ['.....', '.....', '..R..', '.....', '.....']);
        giveTokens(g2.players[0], { red: 2, black: 2 });
        g2.applyCommand(0, { type: 'buy', card: id });
        expect(g2.current).toBe(1);
        expect(g2.players[0].tokens.white).toBe(0);
    });

    it('特権：巻物を1枚得る', () => {
        const game = makeGame();
        const id = card(c => c.level === 2 && c.color === 'red' && c.ability === 'privilege'); // 緑2 赤4 パール1
        placeInPyramid(game, 2, 0, id);
        giveTokens(game.players[0], { green: 2, red: 4, pearl: 1 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.players[0].privileges).toBe(1);
    });

    it('盗む：相手の宝石かパールを1個取る。黄金は盗めない', () => {
        const game = makeGame();
        const id = card(c => c.level === 2 && c.color === 'white' && c.ability === 'steal'); // 青4 赤3
        placeInPyramid(game, 2, 0, id);
        giveTokens(game.players[0], { blue: 4, red: 3 });
        giveTokens(game.players[1], { green: 1, pearl: 1, gold: 2 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.phase).toBe('choose');
        expect(game.applyCommand(0, { type: 'steal', color: 'gold' })).toBe(false);
        expect(game.applyCommand(0, { type: 'steal', color: 'pearl' })).toBe(true);
        expect(game.players[0].tokens.pearl).toBe(1);
        expect(game.players[1].tokens).toMatchObject({ pearl: 0, gold: 2 });
    });
});

const crownCard = (color) => L1(color, { crowns: 1 });

describe('王冠と王族のカード', () => {

    it('王冠が3つ目になったら、王族のカードを選んで取る', () => {
        const game = makeGame();
        game.players[0].cards.push({ id: crownCard('white'), color: 'white' }, { id: crownCard('blue'), color: 'blue' });
        const id = crownCard('green'); // 赤3
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { red: 3 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(crownsOf(game.players[0])).toBe(3);
        expect(game.phase).toBe('choose');
        expect(game.applyCommand(0, { type: 'royal', royal: 0 })).toBe(true);
        expect(pointsOf(game.players[0])).toBe(3);
        expect(game.royals).toEqual([1, 2, 3]);
    });

    it('王族のカードの能力（もう一度）が働く', () => {
        const game = makeGame();
        game.players[0].cards.push({ id: crownCard('white'), color: 'white' }, { id: crownCard('blue'), color: 'blue' });
        const id = crownCard('green');
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { red: 3 });
        game.applyCommand(0, { type: 'buy', card: id });
        game.applyCommand(0, { type: 'royal', royal: 1 });
        expect(game.current).toBe(0);
    });

    it('6つ目で2枚目を取り、王族のカードの特権が働く', () => {
        const game = makeGame();
        giveBonuses(game.players[0], { black: 2 });
        game.players[0].cards.push({ id: crownCard('white'), color: 'white' }, { id: crownCard('blue'), color: 'blue' }, { id: crownCard('red'), color: 'red' });
        game.players[0].royals = [2];
        game.royals = [0, 1, 3];
        const id = card(c => c.level === 3 && c.color === 'wild' && c.crowns === 3); // 黒8
        placeInPyramid(game, 3, 0, id);
        giveTokens(game.players[0], { black: 6 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.pending.map(p => p.type)).toEqual(['wild', 'royal']);
        game.applyCommand(0, { type: 'wild', color: 'black' });
        game.applyCommand(0, { type: 'royal', royal: 3 }); // 特権
        expect(game.players[0].privileges).toBe(1);
        expect(game.players[0].royals).toEqual([2, 3]);
        expect(game.current).toBe(1);
    });
});

describe('手番の終わり', () => {
    it('10個を超えたら、超えた分を袋に返す', () => {
        const game = makeGame();
        setBoard(game, ['WUG..', '.....', '.....', '.....', '.....']);
        giveTokens(game.players[0], { red: 4, black: 4 });
        game.bag.red -= 4;
        game.bag.black -= 4;
        game.applyCommand(0, { type: 'take', cells: [0, 1, 2] });
        expect(game.phase).toBe('discard');
        expect(game.applyCommand(0, { type: 'discard', tokens: { red: 2 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'discard', tokens: { red: 1 } })).toBe(true);
        expect(countTokens(game.players[0].tokens)).toBe(TOKEN_LIMIT);
        expect(game.current).toBe(1);
        expect(totalTokens(game)).toBe(25);
    });

    it('20点で勝つ', () => {
        const game = makeGame();
        game.players[0].royals = [0, 1, 2];  // 7点
        game.players[0].cards.push({ id: card(c => c.level === 3 && c.color === null), color: null }); // 6点
        game.players[0].cards.push({ id: card(c => c.level === 2 && c.color === null), color: null }); // 5点
        const id = card(c => c.level === 2 && c.color === 'white' && c.ability === 'privilege'); // 2点
        placeInPyramid(game, 2, 0, id);
        giveTokens(game.players[0], { white: 4, black: 2, pearl: 1 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toBe('points');
        expect(game.winners).toEqual([0]);
    });

    it('王冠10個で勝つ', () => {
        const game = makeGame();
        game.royals = [];
        [55, 57, 59, 61].forEach(i => game.players[0].cards.push({ id: i, color: CARDS[i].color })); // 王冠2×4
        expect(crownsOf(game.players[0])).toBe(8);
        const id = card(c => c.level === 2 && c.color === 'white' && c.crowns === 1);
        placeInPyramid(game, 2, 0, id);
        game.players[0].cards.push({ id: crownCard('red'), color: 'red' });
        giveTokens(game.players[0], { green: 2, red: 2, black: 2, pearl: 1 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.endReason).toBe('crowns');
    });

    it('同じ色のカードで10点に達すると勝つ（写した色も数える）', () => {
        const game = makeGame();
        game.royals = [];
        const blue4 = card(c => c.level === 3 && c.color === 'blue' && c.points === 4);
        const blue3 = card(c => c.level === 3 && c.color === 'blue' && c.points === 3);
        game.players[0].cards.push({ id: blue4, color: 'blue' }, { id: blue3, color: 'blue' });
        game.players[0].cards.push({ id: card(c => c.level === 1 && c.color === 'wild' && c.cost.white === 2), color: 'blue' }); // 1点
        const wild = card(c => c.level === 2 && c.color === 'wild' && c.points === 2); // 緑6 パール1
        placeInPyramid(game, 2, 0, wild);
        giveTokens(game.players[0], { green: 6, pearl: 1 });
        game.applyCommand(0, { type: 'buy', card: wild });
        game.applyCommand(0, { type: 'wild', color: 'blue' });
        expect(colorPointsOf(game.players[0]).blue).toBe(10);
        expect(game.endReason).toBe('color');
    });

    it('勝ちの判定は、もう一度の手番より先に行う', () => {
        const game = makeGame();
        game.players[0].royals = [0, 1, 2, 3]; // 9点
        game.players[0].cards.push({ id: 64, color: null }, { id: 50, color: null }); // 11点
        const id = L1('white', { ability: 'turn' });
        placeInPyramid(game, 1, 0, id);
        giveTokens(game.players[0], { blue: 2, green: 2, pearl: 1 });
        game.applyCommand(0, { type: 'buy', card: id });
        expect(game.isOver()).toBe(true);
    });

    it('必須の行動ができず補充もできないときだけパスでき、2人が続けてパスすると終わる', () => {
        const game = makeGame();
        setBoard(game, ['.....', '.....', '.....', '.....', '.....']);
        // 袋の中身は全部持ち物にあることにする
        game.players[0].tokens = tokens({ white: 4, blue: 4, pearl: 2 });
        game.players[1].tokens = tokens({ green: 4, red: 4, black: 4 });
        game.bag = tokens({ gold: 3 });
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false); // 補充できる
        game.bag = tokens();
        game.players[1].tokens.gold = 3;
        LEVELS.forEach(l => { game.pyramid[l] = game.pyramid[l].map(() => null); });
        expect(game.applyCommand(0, { type: 'pass' })).toBe(true);
        game.players[1].tokens = tokens({ green: 4, red: 4, black: 4 });
        game.bag = tokens({ gold: 3 });
        game.applyCommand(1, { type: 'replenish' });
        expect(game.applyCommand(1, { type: 'pass' })).toBe(false);
    });
});

describe('記録と再現', () => {
    it('断った操作は記録にも状態にも残らない', () => {
        const game = makeGame(4);
        const before = snapshot(game);
        [{ type: 'take', cells: [99] }, { type: 'buy', card: 66 }, { type: 'royal', royal: 0 }, { type: 'discard', tokens: {} }, { type: 'nope' }, null]
            .forEach(command => expect(game.applyCommand(0, command)).toBe(false));
        expect(game.applyCommand(1, { type: 'replenish' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じ状態を再現できる（余計な項目は記録しない）', () => {
        const game = makeGame(5);
        const line = takeLines(game.board).find(l => l.length === 3);
        game.applyCommand(0, { type: 'take', cells: line, extra: 'x' });
        game.applyCommand(1, { type: 'reserve', level: 1 });
        expect(game.commands[0].command).toEqual({ type: 'take', cells: line });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('王族のカードのデータは4枚', () => {
        expect(ROYALS.map(r => r.points)).toEqual([3, 2, 2, 2]);
    });
});
