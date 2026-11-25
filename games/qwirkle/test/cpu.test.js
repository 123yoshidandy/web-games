import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { decide, runCpuStep } from '../public/js/cpu-player.js';
import { playMatch } from '../scripts/cpu-match.mjs';
import { T, setBoard, snapshot } from './helpers.js';

const cpus = (n, level = 'normal') => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isCPU: true, level }));

describe('CPU', () => {
    it('CPU だけの試合が、人数・強さ・シードを変えても最後まで進む', () => {
        [2, 3, 4].forEach(count => ['easy', 'normal'].forEach(level => {
            for (let seed = 1; seed <= 4; seed++) {
                const game = playMatch({ count, levels: Array(count).fill(level), seed: seed * 13 + count });
                expect(game.isOver(), `${count}人 ${level} ${seed}`).toBe(true);
                // 108枚がどこかにある（盤・手札・袋）
                expect(game.board.size + game.bag.length + game.players.reduce((s, p) => s + p.hand.length, 0)).toBe(108);
            }
        }));
    });

    it('同じ状態なら同じ手を打ち、CPU の試合も記録から再現できる', () => {
        const a = playMatch({ count: 3, levels: ['normal', 'easy', 'normal'], seed: 77 });
        const b = playMatch({ count: 3, levels: ['normal', 'easy', 'normal'], seed: 77 });
        expect(snapshot(a)).toBe(snapshot(b));
        const saved = JSON.parse(JSON.stringify(a.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(a));
    });

    it('クワークルを作れるなら作る', () => {
        const game = new Game(cpus(2), { seed: 3 });
        setBoard(game, [0, 1, 2, 3, 4].map(s => [s, 0, T(1, s)]));
        game.players[game.current].hand = [T(1, 5), T(2, 0), T(3, 1), T(4, 2), T(5, 3), T(0, 4)];
        const command = decide(game, game.current);
        expect(command.type).toBe('play');
        expect(command.placements.some(p => p.tile === T(1, 5) && (p.x === 5 || p.x === -1) && p.y === 0)).toBe(true);
    });

    it('ふつうは、相手にクワークルを作らせやすい5枚の列を、得点が同じなら避ける', () => {
        const game = new Game(cpus(2), { seed: 3 });
        // 4枚の赤の列。赤のクローバーを伸ばす（5枚の列ができる）か、別の場所で同じ4点を取るか
        setBoard(game, [[0, 0, T(0, 0)], [1, 0, T(0, 1)], [2, 0, T(0, 2)], [3, 0, T(0, 3)],
            [0, 3, T(2, 0)], [1, 3, T(2, 1)], [2, 3, T(2, 2)]]);
        game.players[game.current].hand = [T(0, 5), T(2, 4)];
        const command = decide(game, game.current);
        expect(command.placements[0].tile).toBe(T(2, 4));
    });

    it('置けなければ交換し、袋も空ならパスする', () => {
        const game = new Game(cpus(2), { seed: 3 });
        setBoard(game, [[0, 0, T(0, 0)]]);
        game.players[game.current].hand = [T(1, 1), T(2, 2)];
        expect(decide(game, game.current).type).toBe('trade');
        game.bag = [];
        expect(decide(game, game.current).type).toBe('pass');
        expect(runCpuStep(game)).toBe(true);
    });
});
