import { describe, it, expect } from 'vitest';
import Game, { TURNS } from '../public/js/game.js';
import { TILES, STARTERS, ANIMALS, tilesFor } from '../public/js/tiles.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { edgeHabitat, dirTo } from '../public/js/hex.js';
import { newGame, players, snapshot, totalTiles, totalTokens } from './helpers.js';

const keystone = (habitat, animal) => TILES.find(t => !t.starter && t.keystone && t.habitats[0] === habitat && t.wildlife[0] === animal).id;
const dual = (a, b) => TILES.find(t => !t.starter && t.habitats.join() === [a, b].join()).id;

// 場の枠 i を、決めたタイルとトークンにする（山と袋と入れ替えて、数を保つ）
function setSlot(game, i, tileId, animal) {
    if (tileId != null && game.display.tiles[i] !== tileId) {
        const at = game.stack.indexOf(tileId);
        const other = game.display.tiles.indexOf(tileId);
        if (other >= 0) {
            [game.display.tiles[i], game.display.tiles[other]] = [game.display.tiles[other], game.display.tiles[i]];
        } else if (at < 0) {
            // 山に入っていない（使わない）タイル：入れ替えて、元のタイルを山の数から外したことにする
            game.display.tiles[i] = tileId;
        } else {
            game.stack[at] = game.display.tiles[i];
            game.display.tiles[i] = tileId;
        }
    }
    if (animal && game.display.tokens[i] !== animal) {
        const at = game.bag.indexOf(animal);
        game.bag[at] = game.display.tokens[i];
        game.display.tokens[i] = animal;
    }
}

const playOut = (game) => {
    let steps = 0;
    while (!game.isOver() && steps++ < 300) runCpuStep(game, game.current, 'easy');
    return game;
};

describe('準備', () => {
    it('山は人数×20＋3枚（1人は43枚）、場に4組、袋に残り、最初のタイルは3枚', () => {
        for (const n of [1, 2, 3, 4]) {
            const game = new Game(players(n), { seed: n });
            expect(game.stack.length + 4).toBe(tilesFor(n));
            expect(tilesFor(n)).toBe([43, 43, 63, 83][n - 1]);
            expect(game.display.tiles.every(t => t != null && !TILES[t].starter)).toBe(true);
            expect(totalTokens(game)).toBe(100);
            game.players.forEach(p => expect(Object.keys(p.env).length).toBe(3));
            // 最初のタイルは人ごとに違う組
            expect(new Set(game.players.map(p => p.starter)).size).toBe(n);
        }
    });

    it('部品の数：タイル85枚（キーストーン25）、各地形29枚、各動物の印32、最初のタイル5組', () => {
        const main = TILES.filter(t => !t.starter);
        expect(main.length).toBe(85);
        expect(main.filter(t => t.keystone).length).toBe(25);
        ['mountain', 'forest', 'prairie', 'wetland', 'river'].forEach(h => expect(main.filter(t => t.habitats.includes(h)).length, h).toBe(29));
        ANIMALS.forEach(a => {
            expect(main.filter(t => t.wildlife.includes(a)).length, a).toBe(32);
            expect(main.filter(t => t.keystone && t.wildlife.includes(a)).length, a).toBe(5);
        });
        expect(STARTERS.length).toBe(5);
        STARTERS.forEach(group => expect(group.map(g => TILES[g.tile].keystone)).toEqual([true, false, false]));
        // 2地形のタイルは、キーストーンに接する辺が1つ目の地形、下の2枚が接し合う辺が2つ目の地形（左下は動物3種、右下は2種）
        STARTERS.forEach(([top, left, right]) => {
            const edge = (g, other) => edgeHabitat(TILES[g.tile].habitats, g.rot, dirTo(g.q, g.r, other.q, other.r));
            expect(edge(left, top)).toBe(TILES[left.tile].habitats[0]);
            expect(edge(right, top)).toBe(TILES[right.tile].habitats[0]);
            expect(edge(left, right)).toBe(TILES[left.tile].habitats[1]);
            expect(edge(right, left)).toBe(TILES[right.tile].habitats[1]);
            expect([TILES[left.tile].wildlife.length, TILES[right.tile].wildlife.length]).toEqual([3, 2]);
        });
    });

    it('同じシードなら同じ山・場・袋になる', () => {
        expect(snapshot(newGame(3, 9))).toBe(snapshot(newGame(3, 9)));
        expect(snapshot(newGame(3, 9))).not.toBe(snapshot(newGame(3, 10)));
    });
});

describe('流し直し', () => {
    it('4つとも同じ動物なら、そろわなくなるまで自動で流し直す（袋の数は変わらない）', () => {
        const game = newGame(2, 3);
        for (let i = 0; i < 4; i++) setSlot(game, i, null, 'bear');
        const total = totalTokens(game);
        game.autoWipe();
        const tokens = game.display.tokens;
        expect(tokens.every(t => t === tokens[0])).toBe(false);
        expect(totalTokens(game)).toBe(total);
    });

    it('3つ同じなら、手番に1回だけ流し直せる。断った操作は状態を変えない', () => {
        const game = newGame(2, 4);
        ['bear', 'bear', 'bear', 'elk'].forEach((a, i) => setSlot(game, i, null, a));
        expect(game.canReplace3()).toBe(true);
        expect(game.applyCommand(0, { type: 'replace3' })).toBe(true);
        expect(game.replaced3).toBe(true);
        ['fox', 'fox', 'fox', 'elk'].forEach((a, i) => setSlot(game, i, null, a));
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'replace3' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        // 3つそろっていなければできない
        const other = newGame(2, 4);
        ['bear', 'elk', 'fox', 'hawk'].forEach((a, i) => setSlot(other, i, null, a));
        expect(other.applyCommand(0, { type: 'replace3' })).toBe(false);
    });

    it('自然トークン1つで、好きなトークンを好きな数だけ流し直せる', () => {
        const game = newGame(2, 5);
        expect(game.applyCommand(0, { type: 'wipe', slots: [0, 2] })).toBe(false); // 自然トークンがない
        game.players[0].nature = 2;
        const total = totalTokens(game);
        ['bad', [], [0, 0], [4], null].forEach(slots => expect(game.applyCommand(0, { type: 'wipe', slots })).toBe(false));
        expect(game.players[0].nature).toBe(2);
        expect(game.applyCommand(0, { type: 'wipe', slots: [0, 2] })).toBe(true);
        expect(game.applyCommand(0, { type: 'wipe', slots: [0, 1, 2, 3] })).toBe(true);
        expect(game.players[0].nature).toBe(0);
        expect(totalTokens(game)).toBe(total);
    });
});

describe('取って置く', () => {
    it('タイルは自分の地のとなりの空きにだけ置ける', () => {
        const game = newGame(2, 6);
        const base = { type: 'place', tile: 0, token: 0, rot: 0, at: null };
        const before = snapshot(game);
        expect(game.applyCommand(0, { ...base, q: 5, r: 5 })).toBe(false); // となりでない
        expect(game.applyCommand(0, { ...base, q: 0, r: 0 })).toBe(false); // 埋まっている
        expect(game.applyCommand(0, { ...base, q: 1, r: 0, rot: 6 })).toBe(false);
        expect(game.applyCommand(1, { ...base, q: 1, r: 0 })).toBe(false); // 番ではない
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { ...base, q: 1, r: 0 })).toBe(true);
        expect(game.players[0].env['1,0'].tile).toBeDefined();
        expect(game.current).toBe(1);
    });

    it('トークンは、その動物の印があり空いているタイルに置ける。キーストーンなら自然トークンを得る', () => {
        const game = newGame(2, 7);
        const forestBear = keystone('forest', 'bear');
        setSlot(game, 1, forestBear, 'elk');
        const place = (at) => ({ type: 'place', tile: 1, token: 1, q: 1, r: 0, rot: 0, at });
        expect(game.applyCommand(0, place([1, 0]))).toBe(false); // クマのタイルにヘラジカは置けない
        setSlot(game, 1, forestBear, 'bear');
        expect(game.applyCommand(0, place([9, 9]))).toBe(false); // 地の外
        expect(game.applyCommand(0, place([1, 0]))).toBe(true);
        expect(game.players[0].env['1,0'].token).toBe('bear');
        expect(game.players[0].nature).toBe(1);
    });

    it('トークンを置かずに袋へ戻せる。すでにトークンのあるタイルには置けない', () => {
        const game = newGame(2, 8);
        const bagBefore = game.bag.length;
        expect(game.applyCommand(0, { type: 'place', tile: 0, token: 0, q: 1, r: 0, rot: 2, at: null })).toBe(true);
        // 取った分を補ったので、袋は「戻した1つ − 補った1つ」で同じ
        expect(game.bag.length).toBe(bagBefore);
        const p = game.players[1];
        const k = Object.keys(p.env)[0];
        const animal = TILES[p.env[k].tile].wildlife[0];
        p.env[k].token = animal;
        setSlot(game, 0, null, animal);
        const [q, r] = k.split(',').map(Number);
        expect(game.applyCommand(1, { type: 'place', tile: 0, token: 0, q: 1, r: 0, rot: 0, at: [q, r] })).toBe(false);
    });

    it('別々の組から取るには自然トークンを1つ使う', () => {
        const game = newGame(2, 9);
        const cmd = { type: 'place', tile: 0, token: 3, q: 1, r: 0, rot: 0, at: null };
        expect(game.applyCommand(0, cmd)).toBe(false);
        game.players[0].nature = 1;
        const keptTile = game.display.tiles[3];
        const keptToken = game.display.tokens[0];
        expect(game.applyCommand(0, cmd)).toBe(true);
        expect(game.players[0].nature).toBe(0);
        // 取らなかったタイルとトークンは場に残る
        expect(game.display.tiles[3]).toBe(keptTile);
        expect(game.display.tokens[0]).toBe(keptToken);
    });

    it('2地形のタイルは回せ、キーストーンの向きは0にそろえる', () => {
        const game = newGame(2, 10);
        setSlot(game, 0, dual('forest', 'prairie'), null);
        expect(game.applyCommand(0, { type: 'place', tile: 0, token: 0, q: 1, r: 0, rot: 4, at: null })).toBe(true);
        expect(game.players[0].env['1,0'].rot).toBe(4);
        setSlot(game, 0, keystone('river', 'salmon'), null);
        expect(game.applyCommand(1, { type: 'place', tile: 0, token: 0, q: 1, r: 0, rot: 5, at: null })).toBe(true);
        expect(game.players[1].env['1,0'].rot).toBe(0);
    });

    it('記録には決まった項目だけ残る', () => {
        const game = newGame(2, 11);
        expect(game.applyCommand(0, { type: 'place', tile: 0, token: 0, q: 1, r: 0, rot: 0, at: null, extra: 'x' })).toBe(true);
        expect(game.commands[0].command).toEqual({ type: 'place', tile: 0, token: 0, q: 1, r: 0, rot: 0, at: null });
    });
});

describe('終わり', () => {
    it('各自20手番で終わり、山が空になる。タイルとトークンの数は保たれる', () => {
        for (const n of [2, 3, 4]) {
            const game = playOut(new Game(players(n, true), { seed: 20 + n }));
            expect(game.isOver()).toBe(true);
            game.players.forEach(p => {
                expect(p.turns).toBe(TURNS);
                expect(Object.keys(p.env).length).toBe(3 + TURNS);
            });
            expect(game.stack.length).toBe(0);
            expect(totalTiles(game)).toBe(tilesFor(n) + 3 * n);
            expect(totalTokens(game)).toBe(100);
            expect(game.result.players.length).toBe(n);
        }
    });

    it('1人用：手番のたびに、右端のタイルとトークンを捨て、残りを右へ寄せて左から補う。20手番で終わる', () => {
        const game = new Game(players(1, true), { seed: 5 });
        const tiles = [...game.display.tiles];
        const tokens = [...game.display.tokens];
        expect(game.applyCommand(0, { type: 'place', tile: 1, token: 1, q: 1, r: 0, rot: 0, at: null })).toBe(true);
        // 1枠目を取り、右端（3枠目）を捨てた。残り（0・2枠目）が右へ寄る
        expect(game.display.tiles.slice(2)).toEqual([tiles[0], tiles[2]]);
        expect(game.display.tokens.slice(2)).toEqual([tokens[0], tokens[2]]);
        expect(game.display.tiles.every(t => t != null)).toBe(true);
        playOut(game);
        expect(game.isOver()).toBe(true);
        expect(game.players[0].turns).toBe(TURNS);
        expect(totalTokens(game)).toBe(100 - TURNS); // 捨てたトークンはゲームから除く
    });

    it('同点なら自然トークンが多い人の勝ち。それも同じなら勝ちを分ける', () => {
        const game = newGame(2, 12);
        const [a, b] = game.players;
        // 同じ地にして、a にはキツネとクマ（キツネ A で1点）、b には自然トークン1つ
        b.starter = a.starter;
        b.env = structuredClone(a.env);
        const keys = Object.keys(a.env);
        a.env[keys[0]].token = 'fox';
        a.env[keys[1]].token = 'bear';
        b.nature = 1;
        game.finish();
        expect(game.result.players[0].total).toBe(game.result.players[1].total);
        expect(game.winners).toEqual([1]);
        const tie = newGame(2, 12);
        tie.players[1].env = structuredClone(tie.players[0].env);
        tie.finish();
        expect(tie.winners).toEqual([0, 1]);
    });

    it('終わったら操作を受け付けない', () => {
        const game = playOut(new Game(players(2, true), { seed: 30 }));
        expect(game.applyCommand(game.current, { type: 'place', tile: 0, token: 0, q: 1, r: 0, rot: 0, at: null })).toBe(false);
    });
});
