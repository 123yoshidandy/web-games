import { describe, it, expect } from 'vitest';
import Game, { COMMAND_FIELDS } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { FACTIONS, MATS, BANNED, TERRAINS } from '../public/js/data.js';
import { stepTargets, reachable, scoreOf, controllerOf, resourceTotals } from '../public/js/rules.js';
import { runCpuStep, cpuActors } from '../public/js/cpu-player.js';
import { snapshot, hexAt, makeGame, clearUnits, put, MAP } from './helpers.js';

// P0：ノルディック・工業（上段 支持・生産・移動・交易）、P1：ルスヴィエト・技術
const twoPlayers = (seed = 1) => makeGame([['nordic', 'industrial'], ['rusviet', 'engineering']], seed);
const MOVE = 2;     // 工業の移動の区画
const PRODUCE = 1;  // 工業の生産の区画

describe('地図', () => {
    it('地形6種と工場、遭遇の印11、トンネル6がある', () => {
        const board = MAP.hexes.filter(h => h.terrain !== 'home');
        const kinds = new Set(board.map(h => h.terrain));
        ['mountain', 'forest', 'farm', 'tundra', 'village', 'lake', 'factory'].forEach(t => expect(kinds.has(t), t).toBe(true));
        expect(board.filter(h => h.encounter)).toHaveLength(11);
        expect(board.filter(h => h.tunnel)).toHaveLength(6);
        expect(board.filter(h => h.terrain === 'factory')).toHaveLength(1);
        expect(board.filter(h => h.encounter && (h.tunnel || h.terrain === 'lake'))).toHaveLength(0);
    });

    it('本拠地の隣の2マスは、湖ではなく資源を生む土地で、川を渡らずに外へ出られる', () => {
        Object.values(MAP.homes).forEach(home => {
            const starts = MAP.hexes[home].adj;
            expect(starts).toHaveLength(2);
            starts.forEach(h => expect(TERRAINS[MAP.hexes[h].terrain].produces).toBeTruthy());
            const game = twoPlayers();
            const exits = starts.flatMap(h => stepTargets(game, 1, 'worker', h)).filter(h => !starts.includes(h));
            expect(exits.length).toBeGreaterThan(0);
        });
    });
});

describe('準備', () => {
    it('勢力とマットが重ならず、マットの番号の順に並び、本家で使わない組み合わせを避ける', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const game = new Game([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }], { seed });
            const factions = game.players.map(p => p.faction);
            const mats = game.players.map(p => p.mat);
            expect(new Set(factions).size).toBe(5);
            expect(new Set(mats).size).toBe(5);
            const nos = mats.map(m => MATS[m].no);
            expect(nos).toEqual([...nos].sort((a, b) => a - b));
        }
        for (let seed = 1; seed <= 40; seed++) {
            const game = new Game([{ name: 'A' }, { name: 'B' }], { seed });
            game.players.forEach(p => expect(BANNED.some(([f, m]) => f === p.faction && m === p.mat)).toBe(false));
        }
    });

    it('勢力の力・カードと、マットの人気・金で始め、指導者は本拠地、労働者は隣の2マス、目標は2枚', () => {
        const game = twoPlayers();
        const [p0, p1] = game.players;
        expect([p0.power, p0.cards.length, p0.popularity, p0.coins]).toEqual([4, 1, 2, 4]);
        expect([p1.power, p1.cards.length, p1.popularity, p1.coins]).toEqual([3, 2, 2, 5]);
        const units = game.units.filter(u => u.seat === 0);
        expect(units.find(u => u.kind === 'char').hex).toBe(MAP.homes.nordic);
        expect(units.filter(u => u.kind === 'worker').map(u => u.hex).sort()).toEqual([...MAP.hexes[MAP.homes.nordic].adj].sort());
        expect(p0.objectives).toHaveLength(2);
    });

    it('同じシードなら同じゲームになり、操作の記録から再現できる', () => {
        const a = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }], { seed: 77 });
        const b = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }], { seed: 77 });
        expect(snapshot(a)).toBe(snapshot(b));
        for (let i = 0; i < 120 && !a.isOver(); i++) runCpuStep(a, cpuActors(a)[0]);
        const saved = JSON.parse(JSON.stringify(a.persist()));
        const replayed = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(replayed)).toBe(snapshot(a));
    });
});

describe('区画', () => {
    it('前の手番と同じ区画は選べない（ルスヴィエトは選べる）', () => {
        const game = twoPlayers();
        expect(game.applyCommand(0, { type: 'section', index: 0 })).toBe(true);
        game.applyCommand(0, { type: 'skip' });
        game.applyCommand(0, { type: 'skip' });
        expect(game.turn).toBe(1);
        expect(game.applyCommand(1, { type: 'section', index: 3 })).toBe(true);
        game.applyCommand(1, { type: 'skip' });
        game.applyCommand(1, { type: 'skip' });
        expect(game.applyCommand(0, { type: 'section', index: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'section', index: 1 })).toBe(true);
        game.applyCommand(0, { type: 'skip' });
        game.applyCommand(0, { type: 'skip' });
        expect(game.applyCommand(1, { type: 'section', index: 3 })).toBe(true);
    });

    it('工場カードがなければ5つ目の区画は選べない', () => {
        const game = twoPlayers();
        expect(game.applyCommand(0, { type: 'section', index: 4 })).toBe(false);
    });
});

describe('断る操作', () => {
    it('断った操作では、状態が変わらない', () => {
        const game = twoPlayers();
        const before = snapshot(game);
        const tries = [
            [1, { type: 'section', index: 0 }],
            [0, { type: 'section', index: 9 }],
            [0, { type: 'move', moves: [] }],
            [0, { type: 'nope' }],
            [0, null],
            [0, 'section']
        ];
        tries.forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
        game.applyCommand(0, { type: 'section', index: MOVE });
        const mid = snapshot(game);
        const char = game.units.find(u => u.seat === 0 && u.kind === 'char');
        const worker = game.units.find(u => u.seat === 0 && u.kind === 'worker');
        [
            { type: 'move', moves: [{ unit: char.id, to: hexAt(8, 4) }] },                                   // 届かない
            { type: 'move', moves: [{ unit: worker.id, to: worker.hex === hexAt(0, 5) ? hexAt(0, 4) : hexAt(0, 5) }, { unit: 9999, to: 0 }] }, // 2つ目が正しくない
            { type: 'move', moves: [{ unit: char.id, to: MAP.hexes[MAP.homes.nordic].adj[0] }, { unit: char.id, to: MAP.hexes[MAP.homes.nordic].adj[1] }] },
            { type: 'produce', hexes: [hexAt(4, 4)] },
            { type: 'upgrade', top: 'power', bottom: 0 }
        ].forEach(c => expect(game.applyCommand(0, c), JSON.stringify(c)).toBe(false));
        expect(snapshot(game)).toBe(mid);
    });

    it('記録には決まった項目だけが残る', () => {
        const game = twoPlayers();
        game.applyCommand(0, { type: 'section', index: 0, extra: 'x'.repeat(50) });
        expect(game.commands.at(-1).command).toEqual({ type: 'section', index: 0 });
        expect(Object.keys(COMMAND_FIELDS)).toContain('combat');
    });
});

describe('移動', () => {
    it('川は渡れない。渡河のメックがあれば、決まった地形へは渡れる', () => {
        const game = twoPlayers();
        const from = hexAt(1, 4);
        expect(stepTargets(game, 0, 'char', from)).not.toContain(hexAt(2, 4));
        game.players[0].mechs[0] = true; // ノルディックの渡河：森と山
        expect(stepTargets(game, 0, 'char', from)).toContain(hexAt(2, 4));
        expect(stepTargets(game, 0, 'char', from)).not.toContain(hexAt(2, 5)); // 湖
    });

    it('ノルディックの労働者は川を渡れる。ほかの勢力の労働者は渡れない', () => {
        const game = twoPlayers();
        expect(stepTargets(game, 0, 'worker', hexAt(1, 4))).toContain(hexAt(2, 4));
        expect(stepTargets(game, 1, 'worker', hexAt(1, 4))).not.toContain(hexAt(2, 4));
    });

    it('トンネルどうしは隣り合う', () => {
        const game = twoPlayers();
        expect(stepTargets(game, 1, 'worker', hexAt(2, 4))).toContain(hexAt(6, 5));
    });

    it('速さのメックがあれば2マス動けるが、敵のいる領地と遭遇の印で止まる。労働者は敵のいる領地に入れない', () => {
        const game = twoPlayers();
        clearUnits(game, 0);
        clearUnits(game, 1);
        const char = put(game, 0, 'char', hexAt(6, 2));
        expect(reachable(game, char, 1).has(hexAt(6, 3))).toBe(true);
        game.players[0].mechs[3] = true;
        const two = reachable(game, char, 2);
        expect(two.get(hexAt(5, 3))).toBe(undefined); // 湖
        expect(two.has(hexAt(6, 4))).toBe(true);
        put(game, 1, 'worker', hexAt(6, 3));
        const blocked = reachable(game, char, 2);
        expect(blocked.has(hexAt(6, 3))).toBe(true);
        expect(blocked.has(hexAt(6, 4))).toBe(false);
        const worker = put(game, 0, 'worker', hexAt(6, 2));
        expect(reachable(game, worker, 1).has(hexAt(6, 3))).toBe(false);
    });

    it('メックは労働者を運べ、最後に離れるユニットは資源を運ぶ', () => {
        const game = twoPlayers();
        clearUnits(game, 0);
        const mech = put(game, 0, 'mech', hexAt(6, 2));
        const w = put(game, 0, 'worker', hexAt(6, 2));
        game.res[hexAt(6, 2)].food = 3;
        game.applyCommand(0, { type: 'section', index: MOVE });
        expect(game.applyCommand(0, { type: 'move', moves: [{ unit: mech.id, to: hexAt(6, 3), workers: [w.id], carry: true }] })).toBe(true);
        expect(game.units.find(u => u.id === w.id).hex).toBe(hexAt(6, 3));
        expect(game.res[hexAt(6, 3)].food).toBe(3);
        expect(game.res[hexAt(6, 2)].food).toBe(0);
    });

    it('労働者だけの領地に入ると、労働者は本拠地へ退き、入った人の人気が下がる', () => {
        const game = twoPlayers();
        clearUnits(game, 0);
        clearUnits(game, 1);
        const char = put(game, 0, 'char', hexAt(6, 2));
        put(game, 1, 'worker', hexAt(6, 3));
        put(game, 1, 'worker', hexAt(6, 3));
        game.players[0].popularity = 5;
        game.applyCommand(0, { type: 'section', index: MOVE });
        game.applyCommand(0, { type: 'move', moves: [{ unit: char.id, to: hexAt(6, 3) }] });
        expect(game.units.filter(u => u.seat === 1).every(u => u.hex === MAP.homes.rusviet)).toBe(true);
        expect(game.players[0].popularity).toBe(3);
        expect(controllerOf(game, hexAt(6, 3))).toBe(0);
    });
});

describe('戦闘', () => {
    const setup = () => {
        const game = twoPlayers();
        clearUnits(game, 0);
        clearUnits(game, 1);
        const char = put(game, 0, 'char', hexAt(6, 2));
        put(game, 1, 'char', hexAt(6, 3));
        put(game, 1, 'worker', hexAt(6, 3));
        game.res[hexAt(6, 3)].oil = 2;
        game.applyCommand(0, { type: 'section', index: MOVE });
        game.applyCommand(0, { type: 'move', moves: [{ unit: char.id, to: hexAt(6, 3) }] });
        return game;
    };

    it('力とカードの合計で決まり、同点なら仕掛けた方の勝ち。負けた方は本拠地へ退く', () => {
        const game = setup();
        expect(game.step).toBe('combat');
        expect(game.actors().sort()).toEqual([0, 1]);
        const card1 = game.players[1].cards.length;
        expect(game.applyCommand(0, { type: 'combat', power: 3, cards: [] })).toBe(true);
        expect(game.applyCommand(1, { type: 'combat', power: 3, cards: [] })).toBe(true);
        expect(game.step).toBe('bottom');
        expect(game.players[0].combatStars).toBe(1);
        expect(game.players[0].power).toBe(1);
        expect(game.players[1].power).toBe(0);
        expect(game.units.filter(u => u.seat === 1).every(u => u.hex === MAP.homes.rusviet)).toBe(true);
        expect(game.players[0].popularity).toBe(1);          // 労働者1人を退かせた
        expect(game.players[1].cards.length).toBe(card1 + 1); // 力を使って負けたので1枚
        expect(resourceTotals(game, 0).oil).toBe(2);           // 資源は勝った人のもの
    });

    it('力は持っている分と7まで、カードは指導者とメックの数まで', () => {
        const game = setup();
        expect(game.applyCommand(0, { type: 'combat', power: 5, cards: [] })).toBe(false);
        const two = game.players[1].cards.slice(0, 2);
        expect(game.applyCommand(1, { type: 'combat', power: 0, cards: two })).toBe(false);
        expect(game.applyCommand(1, { type: 'combat', power: 0, cards: [9] })).toBe(false);
    });

    it('ビューには、相手の選んだ力とカードが出ない', () => {
        const game = setup();
        game.applyCommand(0, { type: 'combat', power: 2, cards: [] });
        const view = createGameView(game, 1);
        expect(JSON.stringify(view.combat)).not.toContain('power');
        expect(view.combat.chosen).toEqual([0]);
        expect(view.players[0].cards).toBe(null);
        expect(view.players[0].objectives).toBe(null);
        expect(view.players[1].cards).toEqual(game.players[1].cards);
    });
});

describe('遭遇と工場', () => {
    it('指導者が遭遇の印に止まると選び、印はなくなる', () => {
        const game = twoPlayers();
        clearUnits(game, 0);
        const char = put(game, 0, 'char', hexAt(6, 3));
        put(game, 0, 'worker', hexAt(6, 3));
        game.applyCommand(0, { type: 'section', index: MOVE });
        game.applyCommand(0, { type: 'move', moves: [{ unit: char.id, to: hexAt(6, 4) }] });
        expect(game.step).toBe('encounter');
        expect(game.encounters).not.toContain(hexAt(6, 4));
        expect(game.applyCommand(0, { type: 'encounter', options: [0, 1] })).toBe(false); // ポラニアでなければ1つ
        expect(game.applyCommand(0, { type: 'encounter', options: [0] })).toBe(true);
        expect(game.step).toBe('bottom');
    });

    it('指導者が初めて工場に着くと、工場カードを1枚もらい、5つ目の区画で使える', () => {
        const game = twoPlayers();
        clearUnits(game, 0);
        const char = put(game, 0, 'char', hexAt(3, 4));
        game.encounters = game.encounters.filter(h => h !== hexAt(3, 4));
        game.applyCommand(0, { type: 'section', index: MOVE });
        expect(game.applyCommand(0, { type: 'move', moves: [{ unit: char.id, to: MAP.factory }] })).toBe(true);
        expect(game.step).toBe('factory');
        const card = game.factoryOffer[0];
        expect(game.applyCommand(0, { type: 'factory', card })).toBe(true);
        expect(game.players[0].factoryCard).toBe(card);
        game.applyCommand(0, { type: 'skip' });
        game.applyCommand(1, { type: 'section', index: 0 });
        game.applyCommand(1, { type: 'skip' });
        game.applyCommand(1, { type: 'skip' });
        expect(game.applyCommand(0, { type: 'section', index: 4 })).toBe(true);
    });
});

describe('生産と下段', () => {
    it('労働者1人につき1つ生み、村では労働者が増える。労働者が4人以上なら力1がかかる', () => {
        const game = twoPlayers();
        clearUnits(game, 0);
        put(game, 0, 'worker', hexAt(0, 5));
        put(game, 0, 'worker', hexAt(0, 5));
        put(game, 0, 'worker', hexAt(0, 4));
        put(game, 0, 'worker', hexAt(0, 6));
        game.applyCommand(0, { type: 'section', index: PRODUCE });
        expect(game.applyCommand(0, { type: 'produce', hexes: [hexAt(0, 5), hexAt(0, 4)] })).toBe(true);
        expect(game.res[hexAt(0, 5)].wood).toBe(2);
        expect(game.units.filter(u => u.seat === 0 && u.kind === 'worker' && u.hex === hexAt(0, 4))).toHaveLength(2);
        expect(game.players[0].power).toBe(3);
    });

    it('アップグレードで上段がよくなり、下段の費用が下がり、マットの金をもらう', () => {
        const game = twoPlayers();
        const hex = game.units.find(u => u.seat === 0 && u.kind === 'worker').hex;
        game.res[hex].oil = 3;
        game.applyCommand(0, { type: 'section', index: 0 });
        game.applyCommand(0, { type: 'skip' });
        expect(game.applyCommand(0, { type: 'upgrade', top: 'produce', bottom: 1 })).toBe(true);
        expect(game.bottomCost(0, 1)).toBe(2);
        expect(game.produceLimit(0)).toBe(3);
        expect(game.players[0].coins).toBe(4 + 3);
    });

    it('募集した下段を、自分か隣の人が行うと、常時の恩恵がもらえる', () => {
        const game = twoPlayers();
        game.players[0].recruits[1] = true; // 展開：金
        const hex = game.units.find(u => u.seat === 1 && u.kind === 'worker').hex;
        game.res[hex].metal = 4;
        game.applyCommand(0, { type: 'section', index: 0 });
        game.applyCommand(0, { type: 'skip' });
        game.applyCommand(0, { type: 'skip' });
        const coins = game.players[0].coins;
        game.applyCommand(1, { type: 'section', index: 1 });
        game.applyCommand(1, { type: 'skip' });
        expect(game.applyCommand(1, { type: 'deploy', mech: 3, hex })).toBe(true);
        expect(game.players[0].coins).toBe(coins + 1);
        expect(game.units.some(u => u.seat === 1 && u.kind === 'mech' && u.hex === hex)).toBe(true);
    });

    it('建物は労働者のいる領地に1つずつ。工場には建てない', () => {
        const game = twoPlayers();
        const hex = game.units.find(u => u.seat === 0 && u.kind === 'worker').hex;
        game.res[hex].wood = 6;
        game.applyCommand(0, { type: 'section', index: 2 });
        game.applyCommand(0, { type: 'skip' });
        expect(game.applyCommand(0, { type: 'build', structure: 'mill', hex: MAP.factory })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', structure: 'mill', hex })).toBe(true);
        expect(game.structures).toEqual([{ seat: 0, type: 'mill', hex }]);
    });

    it('クリミアは、足りない資源1つを戦闘カードで払える（1手番に1回）', () => {
        const game = makeGame([['crimea', 'industrial'], ['nordic', 'engineering']]);
        const hex = game.units.find(u => u.seat === 0 && u.kind === 'worker').hex;
        game.res[hex].oil = 2;
        game.players[0].cards = [2];
        game.applyCommand(0, { type: 'section', index: 0 });
        game.applyCommand(0, { type: 'skip' });
        expect(game.applyCommand(0, { type: 'upgrade', top: 'power', bottom: 1 })).toBe(true);
        expect(game.players[0].cards).toEqual([]);
        expect(game.res[hex].oil).toBe(0);
    });
});

describe('星と得点', () => {
    it('6つ目の星を置いたらその場で終わり、金の多い人が勝つ', () => {
        const game = twoPlayers();
        const p = game.players[0];
        p.stars = { upgrade: true, mech: true, build: true, enlist: true, workers: true };
        p.power = 15;
        game.applyCommand(0, { type: 'section', index: 0 });
        game.applyCommand(0, { type: 'bolster', choice: 'power' });
        expect(game.isOver()).toBe(true);
        expect(p.starCount).toBe(6);
        expect(game.winners).toEqual([0]);
        expect(game.applyCommand(1, { type: 'section', index: 0 })).toBe(false);
    });

    it('人気の段で、星・領地・資源の点が変わる。工場は領地3つ分', () => {
        const game = twoPlayers();
        clearUnits(game, 0);
        put(game, 0, 'worker', hexAt(0, 5));
        put(game, 0, 'char', MAP.factory);
        game.res[hexAt(0, 5)].food = 5;
        const p = game.players[0];
        p.starCount = 2;
        p.coins = 10;
        p.popularity = 13;
        const s = scoreOf(game, 0, game.structureBonus);
        expect(s.stars).toBe(10);
        expect(s.territories).toBe(4 * 4);
        expect(s.resources).toBe(2 * 3);
        p.popularity = 6;
        expect(scoreOf(game, 0, game.structureBonus).total).toBe(10 + 2 * 3 + 4 * 2 + 2 * 1);
    });

    it('サクソニーは戦闘の星に上限がない。ほかの勢力は2つまで', () => {
        expect(FACTIONS.saxony.ability).toContain('上限がない');
        const game = makeGame([['saxony', 'industrial'], ['nordic', 'engineering']]);
        game.players[0].combatStars = 2;
        game.players[1].combatStars = 2;
        clearUnits(game, 0);
        clearUnits(game, 1);
        const char = put(game, 0, 'char', hexAt(6, 2));
        put(game, 1, 'char', hexAt(6, 3));
        game.applyCommand(0, { type: 'section', index: MOVE });
        game.applyCommand(0, { type: 'move', moves: [{ unit: char.id, to: hexAt(6, 3) }] });
        game.applyCommand(0, { type: 'combat', power: 1, cards: [] });
        game.applyCommand(1, { type: 'combat', power: 0, cards: [] });
        expect(game.players[0].combatStars).toBe(3);
    });
});
