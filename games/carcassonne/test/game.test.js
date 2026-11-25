import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep, chooseCommand, scoreCandidates, LEVELS } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';
import { MEEPLES_PER_PLAYER } from '../public/js/tiles.js';
import { players, snapshot } from './helpers.js';

// 置ける手からでたらめに選んで、最後まで進める（断られた手がないことも確かめる）
function playRandomGame(n, seed) {
    const game = new Game(players(n), { seed });
    const random = createRandom(seed * 7 + 1);
    let steps = 0;
    while (!game.isOver()) {
        const options = game.placementOptions();
        const p = options[Math.floor(random() * options.length)];
        const meeple = p.meeples.length > 0 && random() < 0.5 ? p.meeples[Math.floor(random() * p.meeples.length)] : null;
        expect(game.applyCommand(game.current, { type: 'play', x: p.x, y: p.y, rot: p.rot, meeple })).toBe(true);
        if (++steps > 100) throw new Error('終わらない');
    }
    return game;
}

function checkInvariants(game) {
    // 置いたタイル + 取り除いたタイル = 72 枚
    expect(game.board.cells.size + game.discarded.length).toBe(72);
    expect(game.bag).toHaveLength(0);
    // コマは盤面と手元で 7 つずつ
    game.players.forEach(p => {
        const onBoard = [...game.board.cells.values()].filter(c => c.meeple?.seat === p.id).length;
        expect(onBoard + p.meeples).toBe(MEEPLES_PER_PLAYER);
        expect(p.score).toBe(Object.values(p.breakdown).reduce((a, b) => a + b, 0));
    });
    // 隣り合うタイルの辺がすべてそろっている
    for (const cell of game.board.cells.values()) {
        for (let side = 0; side < 4; side++) {
            const n = game.board.neighbor(cell.x, cell.y, side);
            if (n) expect(n.shape.edges[(side + 2) % 4]).toBe(cell.shape.edges[side]);
        }
    }
}

describe('通しの試合', () => {
    it('でたらめな手でも、2〜5 人で最後まで進み、記録から同じ結果を再現できる', () => {
        for (let n = 2; n <= 5; n++) {
            for (let seed = 1; seed <= 6; seed++) {
                const game = playRandomGame(n, seed * 31 + n);
                checkInvariants(game);
                const again = Game.replay(players(n), game.options, game.commands);
                expect(snapshot(again)).toBe(snapshot(game));
                expect(again.players.map(p => p.score)).toEqual(game.players.map(p => p.score));
            }
        }
    });

    it('CPU だけの試合が、2〜5 人・強さを変えても最後まで進む', () => {
        const levels = ['easy', 'normal', 'strong'];
        for (let n = 2; n <= 5; n++) {
            for (let seed = 1; seed <= 5; seed++) {
                const game = new Game(players(n).map(p => ({ ...p, isCPU: true })), { seed: seed * 101 + n });
                let steps = 0;
                while (!game.isOver()) {
                    expect(runCpuStep(game, seat => levels[(seat + seed) % levels.length])).toBe(true);
                    if (++steps > 100) throw new Error('終わらない');
                }
                checkInvariants(game);
                const again = Game.replay(game.players.map(p => ({ name: p.name, isCPU: true })), game.options, game.commands);
                expect(snapshot(again)).toBe(snapshot(game));
            }
        }
    });

    it('同じシードなら、同じタイルの順と同じ最初の手番になる', () => {
        const a = new Game(players(3), { seed: 42 });
        const b = new Game(players(3), { seed: 42 });
        expect(b.bag).toEqual(a.bag);
        expect(b.current).toBe(a.current);
        expect(b.tile).toBe(a.tile);
        const c = new Game(players(3), { seed: 43 });
        expect(c.bag).not.toEqual(a.bag);
    });

    it('人数の範囲の外は作れない', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(6))).toThrow();
    });
});

describe('ビュー', () => {
    it('袋の並びは入れず、残りの枚数と種類ごとの数だけを入れる', () => {
        const game = new Game(players(2), { seed: 5 });
        const view = createGameView(game, 0);
        expect(view).not.toHaveProperty('bag');
        expect(JSON.stringify(view)).not.toContain('"bag"');
        expect(view.bagCount).toBe(70);
        expect(Object.values(view.remaining).reduce((a, b) => a + b, 0)).toBe(70);
        expect(view.tile).toBe(game.tile);
    });

    it('置ける場所は、手番の人にだけ渡す', () => {
        const game = new Game(players(2), { seed: 5 });
        expect(createGameView(game, game.current).placements.length).toBeGreaterThan(0);
        expect(createGameView(game, 1 - game.current).placements).toBeNull();
    });

    it('since より後のイベントだけを入れる', () => {
        const game = playRandomGame(2, 9);
        const view = createGameView(game, 0, { since: game.eventSeq - 2 });
        expect(view.events.map(e => e.seq)).toEqual([game.eventSeq - 1, game.eventSeq]);
        expect(view.ranking).toHaveLength(2);
    });
});

describe('CPU', () => {
    it('ゲームの乱数を使わない（CPU が考えても、袋の並びは変わらない）', () => {
        const game = new Game(players(2).map(p => ({ ...p, isCPU: true })), { seed: 77 });
        const before = snapshot(game);
        chooseCommand(game, game.current, 'normal');
        expect(snapshot(game)).toBe(before);
    });

    it('同じ状態なら同じ手を選ぶ', () => {
        const a = new Game(players(2), { seed: 12 });
        const b = new Game(players(2), { seed: 12 });
        expect(chooseCommand(a, a.current)).toEqual(chooseCommand(b, b.current));
    });

    it('都市を閉じて点が取れる手があれば、見落としのない CPU はそれを選ぶ', () => {
        // 開始タイルの都市を、自分のコマを置いて閉じる手（4 点）
        const game = new Game(players(2), { seed: 3 });
        game.tile = 'E';
        const best = chooseCommand(game, game.current, 'strong');
        expect(best).toMatchObject({ x: 0, y: -1, rot: 2, meeple: 0 });
    });

    it('候補の手は、どれもルールで通る', () => {
        const game = new Game(players(3), { seed: 8 });
        const candidates = scoreCandidates(game, game.current, LEVELS.strong);
        expect(candidates.length).toBeGreaterThan(0);
        candidates.forEach(({ command }) => expect(game.validate(game.current, command)).toBeNull());
    });
});
