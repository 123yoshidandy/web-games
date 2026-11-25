import Game from '../public/js/game.js';
import { Board } from '../public/js/board.js';
import { MEEPLES_PER_PLAYER } from '../public/js/tiles.js';

export const twoPlayers = () => [{ name: 'A' }, { name: 'B' }];
export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

/**
 * 盤面を短い記法で作ったゲーム
 * tiles: [[x, y, 'D', rot, meeple?]]   meeple: [seat, feature] か省略
 * tile：次に置くタイル、current：手番、bag：袋の残り（末尾から引く）
 */
export function setupGame({ n = 2, tiles, tile, current = 0, bag = ['U', 'U', 'U'] }) {
    const game = new Game(players(n), { seed: 1 });
    game.board = new Board();
    game.players.forEach(p => { p.meeples = MEEPLES_PER_PLAYER; });
    tiles.forEach(([x, y, type, rot, meeple]) => {
        game.board.place(x, y, type, rot, meeple ? { seat: meeple[0], feature: meeple[1] } : null);
        if (meeple) game.players[meeple[0]].meeples--;
    });
    game.tile = tile;
    game.current = current;
    game.bag = [...bag];
    game.events = [];
    return game;
}

// 状態の写し（断った操作で状態が変わらないことを比べる）
export function snapshot(game) {
    return JSON.stringify({
        players: game.players,
        board: [...game.board.cells.values()].map(c => [c.key, c.type, c.rot, c.meeple]),
        tile: game.tile, current: game.current, bag: game.bag, phase: game.phase, commands: game.commands.length
    });
}

export const scores = game => game.players.map(p => p.score);
