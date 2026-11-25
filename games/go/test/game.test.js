import { describe, it, expect } from 'vitest';
import Game, { normalizeOptions, estimateDead, resultText, marginText } from '../public/js/game.js';
import { BLACK, WHITE, EMPTY, handicapPoints } from '../public/js/rules.js';
import { createRandom } from '../public/js/random.js';
import { newGame, players, setPosition, snapshot, at } from './helpers.js';

const move = (game, seat, r, c) => game.applyCommand(seat, { type: 'move', sq: at(game.size, r, c) });

// 黒の地（左の3列）に白の死に石、白の地（右の4列）に黒の死に石がある、終局の形
const FINAL = [
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '.O.XO.X..',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....'
];

describe('始まり', () => {
    it('黒が先に打ち、手数・アゲハマは0から', () => {
        const game = newGame();
        expect(game.current).toBe(0);
        expect(game.moveNumber).toBe(0);
        expect(game.prisoners).toEqual({ 1: 0, 2: 0 });
        expect(game.board.every(s => s === EMPTY)).toBe(true);
        expect(game.options).toEqual({ size: 9, komi: 6.5, handicap: 0 });
    });

    it('置き碁は、黒の石を星に置いてから白が先に打つ', () => {
        const game = new Game(players([false, false]), { size: 19, handicap: 4, komi: 0.5 });
        expect(game.current).toBe(1);
        handicapPoints(19, 4).forEach(sq => expect(game.board[sq]).toBe(BLACK));
        expect(game.board.filter(s => s === BLACK).length).toBe(4);
        expect(game.placed).toEqual([0, 4, 0]);
        expect(move(game, 0, 9, 9)).toBe(false);
        expect(move(game, 1, 9, 9)).toBe(true);
    });

    it('盤の大きさ・置き石・コミの正しくない値は断る', () => {
        expect(() => normalizeOptions({ size: 15 })).toThrow();
        expect(() => normalizeOptions({ size: 9, handicap: 1 })).toThrow();
        expect(() => normalizeOptions({ size: 9, handicap: 6 })).toThrow();
        expect(() => normalizeOptions({ size: 13, handicap: 9 })).not.toThrow();
        expect(() => normalizeOptions({ komi: 6.3 })).toThrow();
        expect(() => normalizeOptions({ komi: '6.5' })).toThrow();
        expect(normalizeOptions({})).toEqual({ size: 19, komi: 6.5, handicap: 0 });
    });
});

describe('打つ・取る', () => {
    it('交互に打ち、取った石をアゲハマに数える', () => {
        const game = newGame();
        setPosition(game, ['.........', '..X......', '.XO......', '.........', '.........', '.........', '.........', '.........', '.........']);
        expect(move(game, 0, 2, 3)).toBe(true);
        expect(game.current).toBe(1);
        expect(move(game, 1, 8, 8)).toBe(true);
        expect(move(game, 0, 3, 2)).toBe(true);
        expect(game.board[at(9, 2, 2)]).toBe(EMPTY);
        expect(game.prisoners).toEqual({ 1: 1, 2: 0 });
        expect(game.lastMove).toEqual({ seat: 0, sq: at(9, 3, 2), captured: [at(9, 2, 2)] });
        expect(game.moveNumber).toBe(3);
        expect(game.events.at(-1)).toMatchObject({ type: 'move', seat: 0, captured: [at(9, 2, 2)] });
    });

    it('手番でない人・石のある点・自殺手は断り、わけを返す', () => {
        const game = newGame();
        setPosition(game, ['.X.......', 'X........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'], 1);
        expect(move(game, 0, 5, 5)).toBe(false);
        expect(game.lastError).toBe('今はあなたの番ではありません');
        expect(move(game, 1, 0, 1)).toBe(false);
        expect(game.lastError).toBe('そこには石があります');
        expect(move(game, 1, 0, 0)).toBe(false);
        expect(game.lastError).toBe('自殺手は打てません');
    });

    it('コウはすぐには取り返せない。ほかに打つかパスをすれば、コウの点は消える', () => {
        const game = newGame();
        const rows = ['.........', '.XO......', 'XO.O.....', '.XO......', '.........', '.........', '.........', '.........', '.........'];
        setPosition(game, rows);
        expect(move(game, 0, 2, 2)).toBe(true);
        expect(game.ko).toBe(at(9, 2, 1));
        const before = snapshot(game);
        expect(move(game, 1, 2, 1)).toBe(false);
        expect(game.lastError).toBe('コウなので、すぐには取り返せません');
        expect(snapshot(game)).toBe(before);
        // コウ立て（ほかに打つ）→ 相手が受ける → 取り返せる
        expect(move(game, 1, 8, 8)).toBe(true);
        expect(game.ko).toBe(-1);
        expect(move(game, 0, 8, 0)).toBe(true);
        expect(move(game, 1, 2, 1)).toBe(true);
        expect(game.ko).toBe(at(9, 2, 2));
        // パスでもコウの点は消える
        expect(game.applyCommand(0, { type: 'pass' })).toBe(true);
        expect(game.ko).toBe(-1);
    });
});

describe('終局と死に石', () => {
    it('2人が続けてパスすると、死に石を決める段階に入る。間に手があれば続けて数えない', () => {
        const game = newGame();
        game.applyCommand(0, { type: 'pass' });
        move(game, 1, 4, 4);
        game.applyCommand(0, { type: 'pass' });
        expect(game.phase).toBe('play');
        game.applyCommand(1, { type: 'pass' });
        expect(game.phase).toBe('scoring');
        expect(game.moveNumber).toBe(4);
        expect(game.actors()).toEqual([0, 1]);
        // 打つ段階の操作は断る
        expect(move(game, 0, 0, 0)).toBe(false);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
    });

    it('死に石の見込み：相手の地の中に孤立した石を死に石にする。同じ局面なら同じ結果', () => {
        const game = newGame();
        setPosition(game, FINAL);
        const dead = estimateDead(game.board, 9, 6.5);
        expect(dead).toEqual([at(9, 4, 1), at(9, 4, 6)]);
        expect(estimateDead(game.board, 9, 6.5)).toEqual(dead);
    });

    it('死に石を直し、2人が確定したら、地＋アゲハマ＋コミで数えて終わる', () => {
        const game = newGame();
        setPosition(game, FINAL);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(1, { type: 'pass' });
        expect(game.dead).toEqual([at(9, 4, 1), at(9, 4, 6)]);
        // 片方が確定してから直すと、確定はやり直し
        expect(game.applyCommand(0, { type: 'confirm' })).toBe(true);
        expect(game.applyCommand(0, { type: 'confirm' })).toBe(false);
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(1, { type: 'mark', sq: at(9, 4, 6), dead: false })).toBe(true);
        expect(game.agreed).toEqual([false, false]);
        expect(game.dead).toEqual([at(9, 4, 1)]);
        expect(game.applyCommand(0, { type: 'mark', sq: at(9, 4, 6), dead: true })).toBe(true);
        // 空きは指定できない
        expect(game.applyCommand(0, { type: 'mark', sq: 0, dead: true })).toBe(false);
        expect(game.applyCommand(0, { type: 'mark', sq: at(9, 4, 6), dead: 'yes' })).toBe(false);
        game.applyCommand(0, { type: 'confirm' });
        game.applyCommand(1, { type: 'confirm' });
        expect(game.isOver()).toBe(true);
        expect(game.result.reason).toBe('score');
        expect(game.result.score.black).toEqual({ territory: 27, prisoners: 1, total: 28 });
        expect(game.result.score.white).toEqual({ territory: 36, prisoners: 1, komi: 6.5, total: 43.5 });
        expect(game.winner).toBe(1);
        expect(resultText(game)).toBe('白の15目半勝ち');
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
    });

    it('対局再開で打つ段階に戻り、死に石の指定は消える', () => {
        const game = newGame();
        setPosition(game, FINAL);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(1, { type: 'pass' });
        expect(game.applyCommand(1, { type: 'resume' })).toBe(true);
        expect(game.phase).toBe('play');
        expect(game.dead).toEqual([]);
        expect(game.passes).toBe(0);
        expect(game.current).toBe(0);
        expect(move(game, 0, 4, 7)).toBe(true);
    });

    it('投了はいつでもでき、相手の中押し勝ちになる', () => {
        const game = newGame();
        move(game, 0, 4, 4);
        expect(game.applyCommand(0, { type: 'resign' })).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.result).toEqual({ winner: 1, reason: 'resign', score: null });
        expect(resultText(game)).toBe('白の中押し勝ち');
    });

    it('差のない点は持碁', () => {
        const game = new Game(players([false, false]), { size: 9, komi: 0 });
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(1, { type: 'pass' });
        game.applyCommand(0, { type: 'confirm' });
        game.applyCommand(1, { type: 'confirm' });
        expect(game.winner).toBe(null);
        expect(resultText(game)).toBe('持碁');
    });

    it('目数の書き方', () => {
        expect(marginText(0.5)).toBe('半目');
        expect(marginText(3)).toBe('3目');
        expect(marginText(6.5)).toBe('6目半');
    });
});

describe('記録と再現', () => {
    // 乱数で打ち進め、パス2回で終える
    function randomGame(seed, size = 9, limit = 120) {
        const game = new Game(players([false, false]), { size, handicap: size === 9 ? 0 : 2, komi: 6.5 });
        const random = createRandom(seed);
        while (!game.isOver() && game.moveNumber < limit) {
            const moves = game.moves();
            if (!moves.length || random() < 0.02) game.applyCommand(game.current, { type: 'pass' });
            else game.applyCommand(game.current, { type: 'move', sq: moves[Math.floor(random() * moves.length)] });
            if (game.phase === 'scoring') break;
        }
        while (game.phase === 'play') game.applyCommand(game.current, { type: 'pass' });
        game.applyCommand(0, { type: 'confirm' });
        game.applyCommand(1, { type: 'confirm' });
        return game;
    }

    it('乱数の対局が終わり、記録から同じ状態を再現できる', () => {
        for (let seed = 1; seed <= 6; seed++) {
            const game = randomGame(seed, seed % 2 ? 9 : 13);
            expect(game.isOver()).toBe(true);
            // 盤の石と、取った石の数の合計が合う
            const stones = game.board.filter(Boolean).length;
            const total = game.placed[1] + game.placed[2];
            expect(stones + game.prisoners[1] + game.prisoners[2]).toBe(total);
            const { players: p, options, commands } = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(p, options, commands))).toBe(snapshot(game));
        }
    });

    it('断る操作では、状態が変わらない（でたらめな操作を大量に送る）', () => {
        const random = createRandom(42);
        const game = newGame();
        const types = ['move', 'pass', 'mark', 'confirm', 'resume', 'resign', 'undo', null];
        let rejected = 0;
        for (let i = 0; i < 2000 && !game.isOver(); i++) {
            const type = types[Math.floor(random() * types.length)];
            if (type === 'resign' && random() < 0.97) continue;
            const command = type === null ? null : { type, sq: Math.floor(random() * 90) - 3, dead: random() < 0.5 };
            if (random() < 0.05) command && (command.sq = 'a1');
            const seat = Math.floor(random() * 3) - (random() < 0.05 ? 1 : 0);
            const before = snapshot(game);
            const ok = game.applyCommand(seat, command);
            if (!ok) {
                rejected++;
                expect(snapshot(game)).toBe(before);
            }
        }
        expect(rejected).toBeGreaterThan(100);
        const { players: p, options, commands } = game.persist();
        expect(snapshot(Game.replay(p, options, commands))).toBe(snapshot(game));
    });
});
