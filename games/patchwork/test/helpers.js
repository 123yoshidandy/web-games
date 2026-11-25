import Game, { legalPlacements } from '../public/js/game.js';
import { createRandom } from '../public/js/random.js';

export const PLAYERS = () => [{ name: 'P1', isCPU: false }, { name: 'P2', isCPU: false }];
export const newGame = (seed = 1) => new Game(PLAYERS(), { seed });

// キルトを文字から作る（'#' が埋まったマス）
export function quiltFrom(rows) {
    const all = Array.from({ length: 9 }, (_, y) => rows[y] ?? '');
    return all.map(row => [...row.padEnd(9, '.')].map(ch => (ch === '#' ? 'X' : null)));
}

// 打てる手からランダムに選ぶ
export function randomCommand(game, random) {
    const seat = game.current;
    const quilt = game.players[seat].quilt;
    if (game.pendingLeather) {
        const empty = [];
        quilt.forEach((row, y) => row.forEach((c, x) => { if (c === null) empty.push({ x, y }); }));
        return { type: 'leather', ...empty[Math.floor(random() * empty.length)] };
    }
    const options = [{ type: 'advance' }];
    game.offer.forEach((id, choice) => {
        if (!game.canBuy(seat, choice)) return;
        const list = legalPlacements(quilt, id);
        options.push({ type: 'buy', choice, ...list[Math.floor(random() * list.length)] });
    });
    return options[Math.floor(random() * options.length)];
}

export function playRandom(game, seed, onStep = () => {}) {
    const random = createRandom(seed);
    let steps = 0;
    while (!game.isOver) {
        if (++steps > 500) throw new Error('終わらない');
        if (!game.applyCommand(game.current, randomCommand(game, random))) throw new Error(game.lastError);
        onStep(game);
    }
}

export const snapshot = game => JSON.stringify({
    players: game.players, ring: game.ring, leatherLeft: game.leatherLeft, top: game.top,
    pendingLeather: game.pendingLeather, bonusOwner: game.bonusOwner, phase: game.phase, turn: game.turn,
    commands: game.commands, result: game.result
});
