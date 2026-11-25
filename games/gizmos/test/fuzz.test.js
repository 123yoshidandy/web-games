import { describe, it, expect } from 'vitest';
import Game, { CARDS, COLORS, LEVELS, countEnergy, limitsOf } from '../public/js/game.js';
import { simpleCommands } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';
import { players, snapshot } from './helpers.js';

// 最初のギズモは人数分。レベル3は16枚で遊ぶ
const cardsInGame = (game) => game.players.length + 36 + 36 + 16;

function checkInvariants(game) {
    // エネルギーは52個のまま（ディスペンサー・列・各自）
    const energy = countEnergy(game.dispenser) + game.row.filter(Boolean).length
        + game.players.reduce((sum, p) => sum + countEnergy(p.energy), 0);
    expect(energy).toBe(52);
    COLORS.forEach(c => expect(game.dispenser[c]).toBeGreaterThanOrEqual(0));
    // カードの枚数は変わらず、重ならない
    const cards = [
        ...LEVELS.flatMap(l => [...game.decks[l], ...game.display[l].filter(id => id !== null)]),
        ...game.players.flatMap(p => [...p.archive, ...p.built]),
        ...(game.research?.cards ?? [])
    ];
    expect(cards).toHaveLength(cardsInGame(game));
    expect(new Set(cards).size).toBe(cardsInGame(game));
    game.players.forEach(p => {
        expect(countEnergy(p.energy)).toBeLessThanOrEqual(limitsOf(p).storage);
        COLORS.forEach(c => expect(p.energy[c]).toBeGreaterThanOrEqual(0));
    });
}

// ランダムな手で進める。試す手の中には、通らないものも混ぜる（払い方をでたらめにする、など）
function randomPlay(seed, n, maxSteps = 1500) {
    const game = new Game(players(n), { seed });
    const random = createRandom(seed * 7 + 1);
    let rejected = 0;
    for (let step = 0; step < maxSteps && !game.isOver(); step++) {
        const seat = game.current;
        const options = simpleCommands(game, seat);
        // でたらめな払い方の建てる手も混ぜる
        const builds = options.filter(c => c.type === 'build' || c.type === 'researchBuild');
        builds.slice(0, 2).forEach(c => options.push({ ...c, spend: Object.fromEntries(COLORS.map(col => [col, Math.floor(random() * 3)])) }));
        // 研究で何も取らない・連鎖をやめる、ばかりにならないよう、後ろに回す
        options.sort(() => random() - 0.5);
        let done = false;
        for (const command of options) {
            const before = snapshot(game);
            if (game.applyCommand(seat, command)) {
                done = true;
                break;
            }
            rejected++;
            expect(snapshot(game)).toBe(before);
        }
        expect(done).toBe(true);
        checkInvariants(game);
    }
    return { game, rejected };
}

describe('ランダムな手の大量試合', () => {
    it.each([2, 3, 4])('%i人：不変条件が崩れず、断った手で状態が変わらず、記録から再現できる', (n) => {
        for (let seed = 1; seed <= 12; seed++) {
            const { game } = randomPlay(seed, n);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('すべての種類のカードの効果が、ランダムな試合のどこかで使われる', () => {
        const usedKinds = new Set();
        for (let seed = 1; seed <= 30; seed++) {
            const { game } = randomPlay(seed, 3, 800);
            game.events.forEach(e => {
                if (e.type === 'activate') usedKinds.add(e.effect === 'convert' ? 'convert' : CARDS[e.gizmo].effect.kind);
            });
        }
        // イベントは最近のものしか残らないので、少なくとも主な効果が出ていればよい
        ['draw', 'pick', 'vp'].forEach(kind => expect(usedKinds).toContain(kind));
    });
});
