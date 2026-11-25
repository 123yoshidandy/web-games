import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { TOOL_IDS, TOOLS, PATTERNS } from '../public/js/data.js';
import { legalCells } from '../public/js/rules.js';
import { players, snapshot, totalDice } from './helpers.js';

function playOut(n, seed, levels = ['normal', 'easy'], tools = null) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed, soloTools: 4 });
    if (tools) game.tools = tools.map(id => ({ id, tokens: 0, used: false }));
    let steps = 0;
    while (!game.isOver() && steps++ < 2000) {
        runCpuStep(game);
        if (n > 1) expect(totalDice(game)).toBe(90);
    }
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [1, 2, 3, 4]) {
            for (const seed of [1, 7, 99]) {
                const game = playOut(n, seed);
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(4, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(players(3, true), { seed: 11 });
        const b = new Game(players(3, true), { seed: 11 });
        while (!a.isOver()) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 3; k++) chooseCommand(a, seat);
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態とダイスの数が変わらず、再現できる（道具12枚とも）', () => {
        let r = 12345;
        // 線形合同法の下位ビットは周期が短いので、上位ビットを使う
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 16) % k; };
        const pick = (list) => list[rand(list.length)];
        const values = [0, 1, 2, 4, 5, 6, 7, 12, 19, 20, -1, null, 'x', [0, 0], [1, 0]];
        // 道具は3枚ずつ決めて、12枚とも試す（1人用は5枚）
        const cases = [[2, 3, TOOL_IDS.slice(0, 3)], [3, 4, TOOL_IDS.slice(3, 6)], [4, 5, TOOL_IDS.slice(6, 9)], [2, 6, TOOL_IDS.slice(9, 12)], [1, 7, TOOL_IDS.slice(2, 7)]];
        for (const [n, seed, tools] of cases) {
            const game = new Game(players(n, true), { seed, soloTools: tools.length, tools });
            expect(game.tools.map(t => t.id)).toEqual(tools);
            const used = new Set();
            for (let i = 0; i < 8000 && !game.isOver(); i++) {
                const seat = game.phase === 'choose' ? game.actors()[0] ?? rand(n) : rand(n);
                const dieObj = game.pool.length ? pick(game.pool) : null;
                const dieId = dieObj ? dieObj.id : 1;
                // 半分は、通りそうな値（置ける場所・置いてあるダイス・道具の色のダイス）から作る
                const me = game.players[seat];
                const smart = rand(2) === 0 && game.phase === 'play' && dieObj;
                const legal = smart ? legalCells(me.window, PATTERNS[me.pattern], dieObj) : [];
                const occupied = me.window.map((d, i) => (d ? i : -1)).filter(i => i >= 0);
                const toolId = pick(game.tools).id;
                const payDie = game.pool.find(d => d.color === TOOLS[toolId].color && d.id !== dieId);
                const command = {
                    type: pick(['choose', 'draft', 'tool', 'tool', 'tool', 'place', 'fluxValue', 'end', 'bogus']),
                    pattern: pick([...game.players[seat].offers, 99]), die: rand(4) ? dieId : pick(values), cell: rand(5) ? rand(20) : pick(values),
                    tool: pick([...TOOL_IDS, 'none']), delta: pick([1, -1, 2]), track: [rand(Math.max(1, game.roundTrack.length)), rand(3)],
                    from: rand(20), to: rand(20), moves: [[rand(20), rand(20)], [rand(20), rand(20)]].slice(0, 1 + rand(2)),
                    pay: game.pool.length ? pick(game.pool).id : 0, value: rand(8)
                };
                if (smart) {
                    Object.assign(command, { type: pick(['draft', 'tool', 'tool', 'end']), tool: toolId, die: dieId, delta: pick([1, -1]) });
                    if (legal.length) command.cell = pick(legal);
                    if (occupied.length) {
                        command.from = pick(occupied);
                        command.moves = [[pick(occupied), rand(20)], [pick(occupied), rand(20)]].slice(0, 1 + rand(2));
                    }
                    if (payDie) command.pay = payDie.id;
                }
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                else if (command.type === 'tool') used.add(command.tool);
                if (n > 1) expect(totalDice(game)).toBe(90);
                if (rand(4) === 0) runCpuStep(game);
            }
            expect(game.commands.length).toBeGreaterThan(20);
            expect(used.size, JSON.stringify([...used])).toBeGreaterThan(0);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('道具を使う CPU の試合も再現できる', () => {
        for (const tools of [['grozing', 'grinding', 'cork'], ['cork', 'fluxBrush', 'glazing']]) {
            const game = new Game(players(3, true), { seed: 21, tools });
            let steps = 0;
            while (!game.isOver() && steps++ < 2000) runCpuStep(game);
            expect(game.commands.some(c => c.command.type === 'tool')).toBe(true);
            const s = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(s.players, s.options, s.commands))).toBe(snapshot(game));
        }
    });
});
