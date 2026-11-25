import { describe, it, expect } from 'vitest';
import Game, { TACTICS, HAND_BASE, HAND_TACTICS, isClan } from '../public/js/game.js';
import { bestFormation, KINDS, kindOf } from '../public/js/formation.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { players, makeGame, setup, snapshot, legalCommands, card, entry } from './helpers.js';

const E = (...list) => list.map(entry);
const allCards = (game) => [
    ...game.deck, ...game.tacticDeck, ...game.discards,
    ...game.players.flatMap(p => p.hand),
    ...game.stones.flatMap(s => [...s.sides.flatMap(side => side.map(x => x.card)), ...s.modes])
].map(String).sort();
const fullSet = (tactics) => [...Array.from({ length: 54 }, (_, i) => i), ...(tactics ? TACTICS : [])].map(String).sort();

// ランダムに通る手を打って、ゲームを最後まで進める
function playRandom(game, seed) {
    const random = createRandom(seed);
    let steps = 0;
    while (!game.isOver() && steps++ < 3000) {
        const list = legalCommands(game);
        // 主張できるなら主張しやすくする（終わりやすくするため）
        const claims = list.filter(c => c.type === 'claim');
        const command = claims.length && random() < 0.7 ? claims[0] : list[Math.floor(random() * list.length)];
        expect(game.applyCommand(game.actor(), command), game.lastError).toBe(true);
        expect(allCards(game)).toEqual(fullSet(game.options.tactics));
    }
    return game;
}

describe('組の強さ', () => {
    it('同色の連番 ＞ 同じ数 ＞ 同色 ＞ 連番 ＞ 合計。同じ種類なら合計', () => {
        const s = (...list) => bestFormation(E(...list), 3);
        expect(kindOf(s('r1', 'r2', 'r3'))).toBe(KINDS.colorRun);
        expect(kindOf(s('r9', 'o9', 'y9'))).toBe(KINDS.same);
        expect(kindOf(s('r1', 'r5', 'r9'))).toBe(KINDS.color);
        expect(kindOf(s('r4', 'o5', 'g6'))).toBe(KINDS.run);
        expect(kindOf(s('r9', 'o9', 'g8'))).toBe(KINDS.sum);
        expect(s('r1', 'r2', 'r3')).toBeGreaterThan(s('r9', 'o9', 'y9'));
        expect(s('r9', 'o9', 'y9')).toBeGreaterThan(s('r7', 'r8', 'r6') - 1000);
        expect(s('o7', 'o8', 'o9')).toBeGreaterThan(s('r1', 'r2', 'r3'));
        expect(s('r1', 'r5', 'r9')).toBeGreaterThan(s('r8', 'o9', 'g7'));
        expect(s('r9', 'o9', 'g8')).toBeGreaterThan(s('r9', 'o9', 'g7'));
        // 連番は並びの順に関係ない
        expect(s('g6', 'r4', 'o5')).toBe(s('r4', 'o5', 'g6'));
    });

    it('残りの枠を、まだ出ていないカードで埋めたときのいちばん強い組', () => {
        const pool = (...list) => ({ clan: new Set(list.map(card)), wilds: [] });
        // 赤7・赤8 に赤9 か赤6 が残っていれば同色の連番（9 の方が大きい）
        expect(bestFormation(E('r7', 'r8'), 3, pool('r9', 'r6', 'o9'))).toBe(5000 + 24);
        expect(bestFormation(E('r7', 'r8'), 3, pool('r6'))).toBe(5000 + 21);
        // 残っていなければ同色
        expect(bestFormation(E('r7', 'r8'), 3, pool('r2', 'o9'))).toBe(3000 + 17);
        // 埋められなければ -1
        expect(bestFormation(E('r7', 'r8'), 3, pool())).toBe(-1);
        // ジョーカーはどの色・数にもなる。スパイは7、盾持ちは1〜3
        expect(bestFormation(E('r7', 'r8'), 3, { clan: new Set(), wilds: ['joker'] })).toBe(5000 + 24);
        expect(bestFormation(E('r8', 'r9'), 3, { clan: new Set(), wilds: ['spy'] })).toBe(5000 + 24);
        expect(bestFormation(E('r1', 'r2'), 3, { clan: new Set(), wilds: ['shield'] })).toBe(5000 + 6);
        // 目隠し鬼なら合計だけ
        expect(bestFormation(E('r1', 'r2', 'r3'), 3, undefined, true)).toBe(1000 + 6);
        // 泥んこ合戦なら4枚
        expect(kindOf(bestFormation(E('r1', 'r2', 'r3', 'r4'), 4))).toBe(KINDS.colorRun);
    });
});

describe('準備と手番', () => {
    it('各自に6枚（戦術カードありなら7枚）。同じシードなら同じ配り方', () => {
        const game = makeGame(3);
        game.players.forEach(p => expect(p.hand).toHaveLength(HAND_BASE));
        expect(game.deck).toHaveLength(54 - 12);
        expect(allCards(game)).toEqual(fullSet(false));
        const tactics = makeGame(3, true);
        tactics.players.forEach(p => expect(p.hand).toHaveLength(HAND_TACTICS));
        expect(tactics.tacticDeck).toHaveLength(10);
        expect(snapshot(makeGame(9))).toBe(snapshot(makeGame(9)));
        expect(() => new Game([{ name: 'A' }])).toThrow();
    });

    it('1枚出して、主張して、1枚引いて相手の番', () => {
        const game = makeGame();
        setup(game, { hands: [['r1', 'r2', 'r3', 'o1', 'o2', 'o3'], []], deck: ['g5', 'g6'] });
        expect(game.applyCommand(0, { type: 'claim', stone: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: card('r1'), stone: 4 })).toBe(true);
        expect(game.phase).toBe('claim');
        expect(game.applyCommand(0, { type: 'play', card: card('r2'), stone: 4 })).toBe(false);
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.players[0].hand).toContain(card('g5'));
        expect(game.players[0].hand).toHaveLength(6);
        expect(game.current).toBe(1);
    });

    it('各石は自分の側に3枚まで。取られた石には出せない', () => {
        const game = makeGame();
        setup(game, { hands: [['r4', 'r5'], []], sides: { 0: [['o1', 'o2', 'o3'], []] } });
        expect(game.applyCommand(0, { type: 'play', card: card('r4'), stone: 0 })).toBe(false);
        game.stones[1].owner = 1;
        expect(game.applyCommand(0, { type: 'play', card: card('r4'), stone: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: card('r4'), stone: 9 })).toBe(false);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
    });
});

describe('主張', () => {
    it('両方そろっていれば、強い方が取れる', () => {
        const game = makeGame();
        setup(game, { sides: { 2: [['r7', 'r8', 'r9'], ['o9', 'y9', 'g9']] }, phase: 'claim' });
        expect(game.applyCommand(0, { type: 'claim', stone: 2 })).toBe(true);
        expect(game.stones[2].owner).toBe(0);
        expect(game.applyCommand(0, { type: 'claim', stone: 2 })).toBe(false);
    });

    it('同じ強さなら、先にそろえた方が取れる', () => {
        const game = makeGame();
        setup(game, { sides: { 3: [['r1', 'o5', 'g9'], ['y1', 'b5', 'p9']] }, phase: 'claim' });
        game.stones[3].completed = [5, 4];
        expect(game.applyCommand(0, { type: 'claim', stone: 3 })).toBe(false);
        expect(game.lastError).toMatch(/強い/);
        game.stones[3].completed = [3, 4];
        expect(game.applyCommand(0, { type: 'claim', stone: 3 })).toBe(true);
    });

    it('相手がそろっていなくても、場のカードから相手が上回れないと示せれば取れる', () => {
        const game = makeGame();
        // 相手の黄8・黄9 に、黄7 が場に出ていれば同色の連番にはならない。同じ数9 は 27 なので、こちらの同じ数9 の 27 に並ぶだけ
        setup(game, {
            sides: { 0: [['r9', 'o9', 'g9'], ['y8', 'y9']], 1: [['y7'], []] },
            phase: 'claim'
        });
        expect(game.claimCheck(0, 0)).toBe(true);
        // 黄7 が場に出ていなければ、相手は黄7 で上回れる
        game.stones[1].sides[0] = [entry('r1')];
        expect(game.claimCheck(0, 0)).toMatch(/上回れ/);
    });

    it('自分の手札は証明に使わない（手札にあっても、場に出ていないカードは相手が使えるものとして数える）', () => {
        const game = makeGame();
        setup(game, { hands: [['y7'], []], sides: { 0: [['r9', 'o9', 'g9'], ['y8', 'y9']] }, phase: 'claim' });
        expect(game.claimCheck(0, 0)).toMatch(/上回れ/);
    });

    it('自分の側がそろっていなければ主張できない', () => {
        const game = makeGame();
        setup(game, { sides: { 0: [['r9', 'o9'], ['y1']] }, phase: 'claim' });
        expect(game.claimCheck(0, 0)).toMatch(/そろっていません/);
    });

    it('5つか、隣り合う3つを取ると勝ち', () => {
        const game = makeGame();
        setup(game, { sides: { 4: [['r7', 'r8', 'r9'], ['o1', 'y2', 'g4']] }, phase: 'claim' });
        [0, 2, 6, 8].forEach(i => { game.stones[i].owner = 0; });
        expect(game.applyCommand(0, { type: 'claim', stone: 4 })).toBe(true);
        expect(game.winner).toBe(0);
        expect(game.winReason).toBe('count');

        const other = makeGame();
        setup(other, { sides: { 5: [['r7', 'r8', 'r9'], ['o1', 'y2', 'g4']] }, phase: 'claim' });
        [3, 4].forEach(i => { other.stones[i].owner = 0; });
        expect(other.applyCommand(0, { type: 'claim', stone: 5 })).toBe(true);
        expect(other.winReason).toBe('adjacent');
        expect(other.isOver()).toBe(true);
    });
});

describe('戦術カード', () => {
    it('ジョーカーは色と数を選んで出す。1人1枚まで。相手が出した枚数＋1 まで', () => {
        const game = makeGame(1, true);
        setup(game, { hands: [['joker1', 'joker2', 'spy', 'r1'], ['o1']] });
        expect(game.applyCommand(0, { type: 'play', card: 'joker1', stone: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 'spy', stone: 0, as: { c: 0, v: 8 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 'joker1', stone: 0, as: { c: 2, v: 9 } })).toBe(true);
        expect(game.stones[0].sides[0][0]).toEqual({ card: 'joker1', c: 2, v: 9 });
        game.applyCommand(0, { type: 'end', draw: 'clan' });
        game.applyCommand(1, { type: 'play', card: card('o1'), stone: 0 });
        game.applyCommand(1, { type: 'end', draw: 'clan' });
        // 相手はまだ戦術カードを出していないので、2枚目は出せない
        expect(game.applyCommand(0, { type: 'play', card: 'spy', stone: 1, as: { c: 0, v: 7 } })).toBe(false);
        game.players[1].tacticsPlayed = 1;
        expect(game.applyCommand(0, { type: 'play', card: 'joker2', stone: 1, as: { c: 0, v: 7 } })).toBe(false);
        expect(game.lastError).toMatch(/1人1枚/);
        expect(game.applyCommand(0, { type: 'play', card: 'spy', stone: 1, as: { c: 0, v: 7 } })).toBe(true);
    });

    it('泥んこ合戦で4枚、目隠し鬼で合計だけ', () => {
        const game = makeGame(1, true);
        setup(game, { hands: [['mud', 'blind'], []], sides: { 0: [['r7', 'r8', 'r9'], ['o9', 'y9', 'g9']] } });
        expect(game.applyCommand(0, { type: 'play', card: 'mud', stone: 0 })).toBe(true);
        expect(game.stones[0].completed).toEqual([null, null]);
        expect(game.claimCheck(0, 0)).toMatch(/4枚/);
        const other = makeGame(1, true);
        setup(other, { hands: [['blind'], []], sides: { 0: [['r1', 'r2', 'r3'], ['o9', 'y9', 'g8']] } });
        expect(other.applyCommand(0, { type: 'play', card: 'blind', stone: 0 })).toBe(true);
        expect(other.claimCheck(1, 0)).toBe(true);
        expect(other.claimCheck(0, 0)).not.toBe(true);
    });

    it('新兵募集：3枚引いて、2枚を山札の下に戻す', () => {
        const game = makeGame(1, true);
        setup(game, { hands: [['recruiter', 'r1'], []] });
        const clanTop = game.deck[0];
        expect(game.applyCommand(0, { type: 'play', card: 'recruiter', draws: ['clan', 'tactic'] })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 'recruiter', draws: ['clan', 'clan', 'tactic'] })).toBe(true);
        expect(game.phase).toBe('recruit');
        expect(game.players[0].hand).toHaveLength(4);
        expect(game.players[0].hand).toContain(clanTop);
        expect(game.applyCommand(0, { type: 'return', cards: [card('r1'), card('r1')] })).toBe(false);
        expect(game.applyCommand(0, { type: 'return', cards: [card('r1'), clanTop] })).toBe(true);
        expect(game.deck.slice(-2)).toEqual([card('r1'), clanTop]);
        expect(game.phase).toBe('claim');
    });

    it('策士・バンシー・裏切り者は、まだ取られていない石の氏族カードだけ', () => {
        const game = makeGame(1, true);
        setup(game, { hands: [['strategist', 'banshee', 'traitor'], []], sides: { 0: [['r1', 'r2', 'r3'], ['o5', 'o6']], 1: [[], ['y4']] } });
        game.players[1].tacticsPlayed = 5;
        expect(game.applyCommand(0, { type: 'play', card: 'strategist', from: { stone: 0, index: 2 }, to: 3 })).toBe(true);
        expect(game.stones[0].sides[0]).toHaveLength(2);
        expect(game.stones[0].completed[0]).toBe(null);
        expect(game.stones[3].sides[0][0].card).toBe(card('r3'));
        setup(game, { phase: 'play' });
        expect(game.applyCommand(0, { type: 'play', card: 'banshee', target: { stone: 0, index: 5 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 'banshee', target: { stone: 0, index: 1 } })).toBe(true);
        expect(game.discards).toContain(card('o6'));
        setup(game, { phase: 'play' });
        game.stones[1].owner = 1;
        expect(game.applyCommand(0, { type: 'play', card: 'traitor', target: { stone: 1, index: 0 }, to: 2 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 'traitor', target: { stone: 0, index: 0 }, to: 2 })).toBe(true);
        expect(game.stones[2].sides[0][0].card).toBe(card('o5'));
    });

    it('氏族カードを置けないときだけパスできる', () => {
        const game = makeGame(1, true);
        setup(game, { hands: [['spy'], []] });
        expect(game.applyCommand(0, { type: 'pass' })).toBe(true);
        expect(game.phase).toBe('claim');
    });
});

describe('断る操作と、記録の再現', () => {
    [false, true].forEach(tactics => {
        it(`ランダムな試合が必ず終わり、記録から同じ状態を作り直せる（戦術カード${tactics ? 'あり' : 'なし'}）`, () => {
            for (let seed = 1; seed <= 30; seed++) {
                const game = playRandom(makeGame(seed, tactics), seed * 3);
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        });
    });

    it('断った操作は状態を変えない', () => {
        const random = createRandom(5);
        for (let seed = 1; seed <= 10; seed++) {
            const game = makeGame(seed, true);
            let steps = 0;
            while (!game.isOver() && steps++ < 3000) {
                const junk = [
                    { type: 'play', card: Math.floor(random() * 60), stone: Math.floor(random() * 11) - 1 },
                    { type: 'play', card: TACTICS[Math.floor(random() * 10)], stone: 0, as: { c: 9, v: 9 } },
                    { type: 'play', card: 'traitor', target: { stone: 0, index: 7 }, to: 0 },
                    { type: 'claim', stone: Math.floor(random() * 9) },
                    { type: 'return', cards: [0, 0] },
                    { type: 'pass' }, { type: 'end', draw: 'x' }
                ];
                for (const command of junk) {
                    if (game.isOver()) break;
                    const before = snapshot(game);
                    if (!game.applyCommand(Math.floor(random() * 2), command)) expect(snapshot(game)).toBe(before);
                }
                if (game.isOver()) break;
                const list = legalCommands(game);
                const claims = list.filter(c => c.type === 'claim');
                expect(game.applyCommand(game.actor(), claims[0] ?? list[Math.floor(random() * list.length)])).toBe(true);
            }
            expect(game.isOver()).toBe(true);
        }
    });

    it('余計な項目は記録しない', () => {
        const game = makeGame();
        const c = game.players[game.current].hand.find(isClan);
        expect(game.applyCommand(game.current, { type: 'play', card: c, stone: 0, extra: 'x' })).toBe(true);
        expect(game.commands.at(-1).command).toEqual({ type: 'play', card: c, stone: 0 });
    });
});

describe('ビュー', () => {
    it('相手の手札と、相手が引いたカードは見せない。戦術カードの枚数は見せる', () => {
        const game = new Game(players(), { seed: 2, tactics: true });
        playRandom(game, 9);
        const view = createGameView(game, 0);
        expect(view.players[1].hand).toBe(null);
        expect(view.players[0].hand).toEqual(game.players[0].hand);
        expect(view.players[1].tacticsInHand).toBe(game.players[1].hand.filter(c => !isClan(c)).length);
        view.events.forEach(e => {
            if (e.type === 'draw' && e.seat === 1) expect([null, 'tactic']).toContain(e.card);
        });
        expect(JSON.stringify(view)).not.toContain('"deck":');
    });

    it('主張できる石を示す', () => {
        const game = makeGame();
        setup(game, { sides: { 6: [['r7', 'r8', 'r9'], ['o9', 'y9', 'g9']] }, phase: 'claim' });
        expect(createGameView(game, 0).claimable).toEqual([6]);
        expect(createGameView(game, 1).claimable).toEqual([]);
    });
});
