import { describe, it, expect } from 'vitest';
import Game, { normalizeTeam } from '../public/js/game.js';
import { statsOf, moveRangeOf, effectiveness, MAX_ROUNDS, W, H } from '../public/js/data.js';
import { calcDamage } from '../public/js/damage.js';
import { reachable, key, planTactics } from '../public/js/rules.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand } from '../public/js/cpu-player.js';
import { team, TEAM_B, makeBattle, put, faintAllBut, snapshot } from './helpers.js';

describe('データと計算', () => {
    it('レベル50の実数値を種族値から計算する', () => {
        expect(statsOf('snorlax').hp).toBe(235);
        expect(statsOf('charizard')).toEqual({ hp: 153, atk: 104, def: 98, spa: 129, spd: 105, spe: 120 });
    });

    it('移動力は素早さの種族値で決まる（100以上=5、60〜99=4、59以下=3）', () => {
        expect(moveRangeOf('charizard')).toBe(5);
        expect(moveRangeOf('pikachu')).toBe(4);
        expect(moveRangeOf('snorlax')).toBe(3);
        expect(moveRangeOf('golem')).toBe(3);
    });

    it('タイプ相性は2つのタイプをかけ合わせる', () => {
        expect(effectiveness('electric', ['ground'])).toBe(0);
        expect(effectiveness('fire', ['bug', 'steel'])).toBe(4);
        expect(effectiveness('ice', ['dragon', 'ground'])).toBe(4);
        expect(effectiveness('water', ['water', 'ice'])).toBe(0.5);
        expect(effectiveness('normal', ['fire'])).toBe(1);
    });

    it('ダメージ = 威力 × (攻撃÷防御) × 0.4 × 相性 × 乱数（物理はこうげき、特殊はとくこう）', () => {
        const a = { stats: statsOf('charizard'), types: ['fire', 'flying'] };
        const d = { stats: statsOf('venusaur'), types: ['grass', 'poison'] };
        // 90 × 129/120 × 0.4 × 2 × 1.0 = 77.4
        expect(calcDamage(a, d, 'flamethrower', 1)).toEqual({ damage: 77, eff: 2 });
        expect(calcDamage(a, d, 'flamethrower', 0.85).damage).toBe(Math.floor(90 * 129 / 120 * 0.4 * 2 * 0.85));
        const g = { stats: statsOf('golem'), types: ['rock', 'ground'] };
        expect(calcDamage({ stats: statsOf('pikachu'), types: ['electric'] }, g, 'thunderbolt', 1)).toEqual({ damage: 0, eff: 0 });
        // 物理技はこうげき÷ぼうぎょ
        const m = { stats: statsOf('machamp'), types: ['fighting'] };
        expect(calcDamage(m, g, 'brickbreak', 1).damage).toBe(Math.floor(75 * statsOf('machamp').atk / statsOf('golem').def * 0.4 * 2));
    });
});

describe('編成', () => {
    it('ちがうポケモン6体と、覚えられる技2つでなければ断る', () => {
        expect(normalizeTeam(team())).toBeTruthy();
        expect(normalizeTeam(team().slice(0, 5))).toBe(null);
        const dup = team();
        dup[1] = { ...dup[0] };
        expect(normalizeTeam(dup)).toBe(null);
        const badMove = team();
        badMove[0].moves = ['flamethrower', 'surf'];
        expect(normalizeTeam(badMove)).toBe(null);
        const sameMove = team();
        sameMove[0].moves = [sameMove[0].moves[0], sameMove[0].moves[0]];
        expect(normalizeTeam(sameMove)).toBe(null);
        const tooMany = team();
        tooMany[0].rules = Array(4).fill({ cond: 'always', act: 'nearest' });
        expect(normalizeTeam(tooMany)).toBe(null);
        const badRule = team();
        badRule[0].rules = [{ cond: 'sometimes', act: 'nearest' }];
        expect(normalizeTeam(badRule)).toBe(null);
    });

    it('両方の編成がそろうまで、相手の手持ちは見えず、対戦も始まらない', () => {
        const game = new Game([{ name: 'A' }, { name: 'B' }], { seed: 3, map: 0, first: 0 });
        expect(game.actors()).toEqual([0, 1]);
        expect(game.applyCommand(0, { type: 'team', team: team() })).toBe(true);
        expect(game.applyCommand(0, { type: 'team', team: team() })).toBe(false);
        const view = createGameView(game, 1);
        expect(view.sides).toBe(null);
        expect(JSON.stringify(view)).not.toContain('charizard');
        expect(view.players.map(p => p.ready)).toEqual([true, false]);
        expect(game.applyCommand(1, { type: 'act', unit: 0, to: { x: 0, y: 0 }, move: null, target: null })).toBe(false);
        expect(game.applyCommand(1, { type: 'team', team: team(TEAM_B) })).toBe(true);
        expect(game.phase).toBe('battle');
        expect(game.actors()).toEqual([0]);
        // 自分の戦術ルールだけが見える
        const v0 = createGameView(game, 0);
        expect(v0.sides[0].units[0].rules).toHaveLength(3);
        expect(v0.sides[1].units[0].rules).toBe(null);
        expect(JSON.stringify(v0)).not.toMatch(/"seed"/);
    });

    it('両軍は盤の上下の端に並ぶ', () => {
        const game = makeBattle();
        expect(game.sides[0].units.map(u => [u.x, u.y])).toEqual([[1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9]]);
        expect(game.sides[1].units.every(u => u.y === 0)).toBe(true);
    });
});

describe('移動と攻撃', () => {
    it('移動力の歩数まで動け、敵と岩は通れず、味方は通れるが止まれない', () => {
        const game = makeBattle(); // マップ0：岩は (2,4)(5,5)(6,4)(1,5)
        const cells = reachable(game, 0, 4); // カビゴン（移動力3）は (5,9)
        expect(cells.has(key({ x: 5, y: 6 }))).toBe(true);
        expect(cells.has(key({ x: 5, y: 5 }))).toBe(false); // 岩
        expect(cells.has(key({ x: 4, y: 9 }))).toBe(false); // 味方の上には止まれない
        expect(cells.has(key({ x: 3, y: 8 }))).toBe(true); // 味方の後ろを通って届く
        expect(cells.has(key({ x: 4, y: 5 }))).toBe(false); // 5歩
        put(game, 1, 0, 5, 7);
        const blocked = reachable(game, 0, 4);
        expect(blocked.has(key({ x: 5, y: 7 }))).toBe(false);
        expect(blocked.has(key({ x: 5, y: 6 }))).toBe(false); // 敵を回り込むと4歩かかる
        expect(blocked.has(key({ x: 6, y: 7 }))).toBe(true);
    });

    it('届かない技・動けないマス・行動済みのポケモンは断り、状態を変えない', () => {
        const game = makeBattle();
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'act', unit: 0, to: { x: 1, y: 2 }, move: null, target: null })).toBe(false);
        expect(game.applyCommand(0, { type: 'act', unit: 0, to: { x: 1, y: 8 }, move: 0, target: 0 })).toBe(false);
        expect(game.applyCommand(1, { type: 'act', unit: 0, to: { x: 6, y: 0 }, move: null, target: null })).toBe(false);
        expect(game.applyCommand(0, { type: 'teleport' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { type: 'act', unit: 0, to: { x: 1, y: 8 }, move: null, target: null })).toBe(true);
        expect(game.applyCommand(0, { type: 'act', unit: 0, to: { x: 1, y: 7 }, move: null, target: null })).toBe(false);
    });

    it('技が当たると HP が減り、0 になるとたおれる。全員たおすと勝ち', () => {
        const game = makeBattle({ seed: 5 });
        faintAllBut(game, 1, [0]);
        const foe = game.sides[1].units[0]; // ガブリアス
        put(game, 1, 0, 2, 6);
        foe.hp = 1;
        // カメックス (2,9) が れいとうビーム（射程2）を (2,8) から
        expect(game.applyCommand(0, { type: 'act', unit: 1, to: { x: 2, y: 8 }, move: 1, target: 0 }), game.lastError).toBe(true);
        const ev = game.events.find(e => e.type === 'attack');
        expect(ev.move).toBe('icebeam');
        expect(ev.hit).toBe(true);
        expect(ev.eff).toBe(4);
        expect(foe.fainted).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.result).toMatchObject({ winner: 0, reason: 'ko' });
        expect(game.actors()).toEqual([]);
    });

    it('全員が行動すると相手のフェイズになり、先手に戻るとターンが進む。「フェイズ終了」で残りは待機', () => {
        const game = makeBattle();
        for (let i = 0; i < 6; i++) {
            const u = game.sides[0].units[i];
            expect(game.applyCommand(0, { type: 'act', unit: i, to: { x: u.x, y: u.y }, move: null, target: null })).toBe(true);
        }
        expect(game.current).toBe(1);
        expect(game.round).toBe(1);
        expect(game.applyCommand(1, { type: 'end' })).toBe(true);
        expect(game.current).toBe(0);
        expect(game.round).toBe(2);
        expect(game.sides[0].units.every(u => !u.acted)).toBe(true);
    });

    it(`${MAX_ROUNDS}ターンで決着しなければ、残りHPの割合の合計が多いほうの勝ち`, () => {
        const game = makeBattle();
        game.round = MAX_ROUNDS;
        game.sides[1].units[0].hp = 10;
        game.applyCommand(0, { type: 'end' });
        expect(game.isOver()).toBe(false);
        game.applyCommand(1, { type: 'end' });
        expect(game.result).toMatchObject({ winner: 0, reason: 'time' });
    });

    it('同じ割合なら引き分け', () => {
        const game = makeBattle();
        game.round = MAX_ROUNDS;
        game.applyCommand(0, { type: 'end' });
        game.applyCommand(1, { type: 'end' });
        expect(game.result).toMatchObject({ winner: null, reason: 'time' });
    });
});

describe('戦術ルール', () => {
    const lone = () => {
        const game = makeBattle();
        faintAllBut(game, 1, [0, 1]);
        put(game, 1, 0, 2, 6);
        put(game, 1, 1, 5, 6);
        return game;
    };

    it('上から順に評価し、最初に合ったルールで行動する', () => {
        const game = lone();
        const u = game.sides[0].units[0]; // リザードン (1,9)・移動力5
        u.rules = [{ cond: 'lowHp', act: 'wait' }, { cond: 'always', act: 'nearest' }];
        let plan = planTactics(game, 0, 0);
        expect(plan.rule).toBe(1);
        expect(plan.move).not.toBe(null);
        u.hp = Math.floor(u.maxHp * 0.3);
        plan = planTactics(game, 0, 0);
        expect(plan.rule).toBe(0);
        expect(plan).toMatchObject({ to: { x: 1, y: 9 }, move: null, target: null });
    });

    it('最も弱い敵：届く敵のうち HP の少ない敵をねらう', () => {
        const game = lone();
        game.sides[1].units[1].hp = 5;
        const u = game.sides[0].units[0];
        u.rules = [{ cond: 'inRange', act: 'weakest' }];
        expect(planTactics(game, 0, 0).target).toBe(1);
        u.rules = [{ cond: 'always', act: 'nearest' }];
        expect(planTactics(game, 0, 0).target).toBe(0);
    });

    it('敵から離れて攻撃：届く場所のうち、敵からいちばん遠いマスから撃つ', () => {
        const game = lone();
        const u = game.sides[0].units[1]; // カメックス (2,9)・なみのり（射程2）
        u.rules = [{ cond: 'always', act: 'kite' }];
        const plan = planTactics(game, 0, 1);
        expect(plan.move).not.toBe(null);
        const d = Math.min(...game.sides[1].units.filter(f => !f.fainted).map(f => Math.abs(f.x - plan.to.x) + Math.abs(f.y - plan.to.y)));
        expect(d).toBe(2);
    });

    it('敵が隣接している：隣に敵がいるときだけ合う。届かないときは近づいて待機', () => {
        const game = lone();
        put(game, 1, 0, 0, 0);
        put(game, 1, 1, 7, 2);
        const u = game.sides[0].units[4]; // カビゴン (5,9)・移動力3
        u.rules = [{ cond: 'adjacent', act: 'wait' }, { cond: 'always', act: 'nearest' }];
        const plan = planTactics(game, 0, 4);
        expect(plan.rule).toBe(1);
        expect(plan.move).toBe(null);
        expect(plan.to.y).toBeLessThan(9);
        put(game, 1, 1, 5, 8);
        expect(planTactics(game, 0, 4).rule).toBe(0);
    });

    it('おまかせ（auto）は戦術ルールのとおりに動き、記録から同じ結果になる', () => {
        const game = lone();
        const plan = planTactics(game, 0, 0);
        expect(game.applyCommand(0, { type: 'auto', unit: 0 })).toBe(true);
        const u = game.sides[0].units[0];
        expect([u.x, u.y]).toEqual([plan.to.x, plan.to.y]);
        expect(u.acted).toBe(true);
    });
});

describe('記録からの再現', () => {
    it.each([1, 2, 3])('CPU 同士の対戦を、操作の記録から同じ局面に戻せる（シード %i）', (seed) => {
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed, level: 'normal' });
        let steps = 0;
        while (!game.isOver() && steps++ < 2000) {
            const seat = game.actors()[0];
            const level = seat === 0 ? 'hard' : 'normal';
            expect(game.applyCommand(seat, chooseCommand(game, seat, level)), game.lastError).toBe(true);
            if (steps === 20) {
                const saved = game.persist();
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
        expect(game.isOver()).toBe(true);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('盤の大きさは 8×10', () => {
        expect([W, H]).toEqual([8, 10]);
    });
});
