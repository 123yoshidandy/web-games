import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { CELLS, START_STEALTH, BASE_SPEED, ROOMS, neighbors, wallKey, idOf } from '../public/js/data.js';
import { guardRisk, predictGuard } from '../public/js/rules.js';
import { makeGame, setRooms, noWalls, placeGuard, place, snapshot, players } from './helpers.js';

// 1階の部屋の並び（上の行から）。0 は始まりの部屋
const PLAIN = Array(CELLS).fill('foyer');
const rooms = (changes) => PLAIN.map((type, i) => changes[i] ?? (i === 0 ? 'secret' : 'camera'));
// 見張りに見つからないよう、離れた所に置く（3 → 12 の行き来）
const farGuard = (game, f = 0) => placeGuard(game, f, 15, 12);

function setup({ n = 1, floors = 1, chars = ['peterman', 'hacker', 'hawk', 'acrobat'].slice(0, n), types = rooms({}), revealed = false } = {}) {
    const game = makeGame(n, { seed: 3, floors, chars });
    for (let f = 0; f < floors; f++) {
        setRooms(game, f, f === 0 ? types : rooms({}), { revealed });
        noWalls(game, f);
    }
    game.floors[0].tiles[0].revealed = true;
    game.players.forEach((_, i) => place(game, i, 0, 0));
    farGuard(game);
    return game;
}

describe('準備', () => {
    it.each([1, 2, 3])('%i階建て：各階に金庫と階段が1つずつ、壁があってもどの部屋にも行ける', (floors) => {
        const game = makeGame(3, { seed: 11, floors });
        expect(game.floors).toHaveLength(floors);
        game.floors.forEach(fl => {
            expect(fl.tiles.filter(t => t.type === 'safe')).toHaveLength(1);
            expect(fl.tiles.filter(t => t.type === 'stairs')).toHaveLength(1);
            expect(fl.walls.length).toBeGreaterThan(0);
            // 行き止まりがない
            for (let c = 0; c < CELLS; c++) {
                const open = neighbors(c).filter(n => !fl.walls.includes(wallKey(c, n)));
                expect(open.length).toBeGreaterThanOrEqual(2);
            }
        });
    });

    it('全員が1階の角の部屋から始まり、その部屋だけがめくれている。1階の見張りだけがいる', () => {
        const game = makeGame(4, { seed: 5, floors: 3 });
        const start = game.players[0].cell;
        expect([0, 3, 12, 15]).toContain(start);
        expect(game.players.every(p => p.floor === 0 && p.cell === start && p.stealth === START_STEALTH)).toBe(true);
        expect(game.floors[0].tiles.filter(t => t.revealed)).toHaveLength(1);
        expect(['safe', 'stairs', 'fingerprint', 'laser', 'motion', 'thermo', 'keypad', 'deadbolt', 'lab']).not.toContain(game.floors[0].tiles[start].type);
        expect(game.floors.map(fl => fl.guard.active)).toEqual([true, false, false]);
        expect(game.floors[0].guard.speed).toBe(BASE_SPEED[0]);
        expect(new Set(game.players.map(p => p.char)).size).toBe(4);
    });

    it('同じシードなら同じ建物になる', () => {
        expect(JSON.stringify(makeGame(2, { seed: 9, floors: 3 }).floors)).toBe(JSON.stringify(makeGame(2, { seed: 9, floors: 3 }).floors));
    });
});

describe('移動とのぞく', () => {
    it('となりへ動くと1アクション。めくっていない部屋はめくれる', () => {
        const game = setup();
        expect(game.applyCommand(0, { type: 'move', to: 1 })).toBe(true);
        expect(game.players[0].cell).toBe(1);
        expect(game.floors[0].tiles[1].revealed).toBe(true);
        expect(game.actionsLeft).toBe(3);
    });

    it('壁の向こうと、となりでない部屋へは動けない', () => {
        const game = setup({ types: rooms({ 0: 'camera' }) });
        game.floors[0].walls = [wallKey(0, 1)];
        expect(game.applyCommand(0, { type: 'move', to: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', to: 5 })).toBe(false);
        expect(game.actionsLeft).toBe(4);
    });

    it('隠し扉の部屋の壁は通り抜けられる', () => {
        const game = setup({ types: rooms({ 0: 'secret' }) });
        game.floors[0].walls = [wallKey(0, 1)];
        expect(game.applyCommand(0, { type: 'move', to: 1 })).toBe(true);
    });

    it('のぞくと、動かずにめくれる。ホークは手番の最初ののぞきがただで、壁ごしにものぞける', () => {
        const game = setup({ n: 2, chars: ['peterman', 'hawk'] });
        expect(game.applyCommand(0, { type: 'peek', to: 4 })).toBe(true);
        expect(game.players[0].cell).toBe(0);
        expect(game.floors[0].tiles[4].revealed).toBe(true);
        expect(game.actionsLeft).toBe(3);
        expect(game.applyCommand(0, { type: 'peek', to: 4 })).toBe(false); // めくった部屋はのぞけない
        game.applyCommand(0, { type: 'pass' });
        game.floors[0].walls = [wallKey(0, 1)];
        expect(game.current).toBe(1);
        expect(game.applyCommand(1, { type: 'peek', to: 1 })).toBe(true);
        expect(game.actionsLeft).toBe(4);
        expect(game.applyCommand(1, { type: 'peek', to: 5 })).toBe(false);
    });

    it('通気ダクトから、同じ階のもう1つのダクトへ1アクションで移れる', () => {
        const game = setup({ types: rooms({ 0: 'duct', 10: 'duct' }) });
        game.floors[0].tiles[10].revealed = true;
        expect(game.applyCommand(0, { type: 'move', to: 10 })).toBe(true);
        expect(game.players[0].cell).toBe(10);
    });

    it('アクションを使い切ると手番が終わる', () => {
        const game = setup({ n: 2 });
        ['move', 'move', 'move', 'move'].forEach((type, i) => game.applyCommand(0, { type, to: [1, 2, 3, 7][i] }));
        expect(game.current).toBe(1);
        expect(game.actionsLeft).toBe(4);
    });
});

describe('部屋', () => {
    it('かんぬき扉は、誰もいなければ入るのに3アクション。足りなければ入れない', () => {
        const game = setup({ types: rooms({ 1: 'deadbolt' }) });
        game.floors[0].tiles[1].revealed = true;
        expect(game.applyCommand(0, { type: 'move', to: 1 })).toBe(true);
        expect(game.actionsLeft).toBe(1);
        const g2 = setup({ types: rooms({ 1: 'deadbolt' }) });
        g2.actionsLeft = 2;
        g2.applyCommand(0, { type: 'move', to: 1 });
        expect(g2.players[0].cell).toBe(0);
    });

    it('暗証番号の扉は、6が出れば開いて入れる。外れると入れずに1アクション失う', () => {
        let opened = 0;
        let failed = 0;
        for (let seed = 1; seed <= 30; seed++) {
            const game = setup({ types: rooms({ 1: 'keypad' }) });
            game.random = (() => { let s = seed; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
            game.floors[0].tiles[1].revealed = true;
            game.applyCommand(0, { type: 'move', to: 1 });
            expect(game.actionsLeft).toBe(3);
            if (game.players[0].cell === 1) {
                opened++;
                expect(game.floors[0].tiles[1].open).toBe(true);
                expect(game.lastRoll.values).toContain(6);
            } else {
                failed++;
                expect(game.lastRoll.values).not.toContain(6);
            }
        }
        expect(opened).toBeGreaterThan(0);
        expect(failed).toBeGreaterThan(0);
    });

    it('指紋認証は入ると警報。ハックがあれば1つ使って止める。ハッカーは鳴らさない', () => {
        const game = setup({ types: rooms({ 1: 'fingerprint' }) });
        game.applyCommand(0, { type: 'move', to: 1 });
        expect(game.floors[0].tiles[1].alarm).toBe(true);
        const g2 = setup({ types: rooms({ 1: 'fingerprint' }) });
        g2.hacks.fingerprint = 1;
        g2.applyCommand(0, { type: 'move', to: 1 });
        expect(g2.floors[0].tiles[1].alarm).toBe(false);
        expect(g2.hacks.fingerprint).toBe(0);
        const g3 = setup({ chars: ['hacker'], types: rooms({ 1: 'fingerprint' }) });
        g3.applyCommand(0, { type: 'move', to: 1 });
        expect(g3.floors[0].tiles[1].alarm).toBe(false);
    });

    it('レーザーは、アクションが残っていれば1つ余分に使って避ける。残っていなければ警報', () => {
        const game = setup({ types: rooms({ 1: 'laser' }) });
        game.applyCommand(0, { type: 'move', to: 1 });
        expect(game.actionsLeft).toBe(2);
        expect(game.floors[0].tiles[1].alarm).toBe(false);
        const g2 = setup({ n: 2, types: rooms({ 1: 'laser' }) });
        g2.actionsLeft = 1;
        g2.applyCommand(0, { type: 'move', to: 1 });
        expect(g2.floors[0].tiles[1].alarm).toBe(true);
    });

    it('動体センサーは、入った手番のうちに出ると警報。とどまれば鳴らない', () => {
        const game = setup({ types: rooms({ 1: 'motion' }) });
        game.applyCommand(0, { type: 'move', to: 1 });
        expect(game.floors[0].tiles[1].alarm).toBe(false);
        game.applyCommand(0, { type: 'move', to: 2 });
        expect(game.floors[0].tiles[1].alarm).toBe(true);
        const g2 = setup({ n: 2, types: rooms({ 1: 'motion' }) });
        g2.applyCommand(0, { type: 'move', to: 1 });
        g2.applyCommand(0, { type: 'pass' });
        g2.applyCommand(1, { type: 'pass' });
        g2.applyCommand(0, { type: 'move', to: 2 });
        expect(g2.floors[0].tiles[1].alarm).toBe(false);
    });

    it('熱センサーは、手番の終わりにいると警報', () => {
        const game = setup({ n: 2, types: rooms({ 1: 'thermo' }) });
        game.applyCommand(0, { type: 'move', to: 1 });
        game.applyCommand(0, { type: 'pass' });
        expect(game.floors[0].tiles[1].alarm || game.floors[0].guard.cell === 1).toBe(true);
    });

    it('研究室に最初に入った人が道具を引く', () => {
        const game = setup({ types: rooms({ 1: 'lab' }) });
        game.applyCommand(0, { type: 'move', to: 1 });
        expect(game.players[0].tools).toHaveLength(1);
        game.applyCommand(0, { type: 'move', to: 0 });
        game.applyCommand(0, { type: 'move', to: 1 });
        expect(game.players[0].tools).toHaveLength(1);
    });

    it('端末の部屋で、1アクションでハックを置く', () => {
        const game = setup({ types: rooms({ 0: 'laserComputer' }) });
        expect(game.applyCommand(0, { type: 'hack' })).toBe(true);
        expect(game.hacks.laser).toBe(1);
        expect(game.actionsLeft).toBe(3);
        const g2 = setup();
        expect(g2.applyCommand(0, { type: 'hack' })).toBe(false);
    });

    it('2階より上の吊り通路に入ってめくると、下の階へ落ちる', () => {
        const game = setup({ floors: 2 });
        setRooms(game, 1, rooms({ 1: 'walkway' }));
        noWalls(game, 1);
        place(game, 0, 1, 0);
        placeGuard(game, 1, 15, 12);
        game.applyCommand(0, { type: 'move', to: idOf(1, 1) });
        expect(game.players[0].floor).toBe(0);
        expect(game.players[0].cell).toBe(1);
        expect(game.floors[0].tiles[1].revealed).toBe(true);
    });
});

describe('見張り', () => {
    it('手番の終わりに、行き先へ速さの数だけ動く。行き先に着くと次の行き先を引く', () => {
        const game = setup({ n: 2 });
        placeGuard(game, 0, 15, 3, [0, 1, 2, 5, 6]);
        game.applyCommand(0, { type: 'pass' });
        expect(game.floors[0].guard.cell).toBe(7); // 15 → 11 → 7（上を先に）
        game.applyCommand(1, { type: 'pass' });
        // 7 → 3 で行き先に着き、次の行き先 6 を引いて、残りの1歩で 7 へ（下を左より先に）
        expect(game.floors[0].guard.cell).toBe(7);
        expect(game.floors[0].guard.dest).toBe(6);
    });

    it('警報があれば、いちばん近い警報へ向かい、着くと止める', () => {
        const game = setup({ n: 2 });
        placeGuard(game, 0, 15, 12);
        game.floors[0].tiles[7].alarm = true;
        game.applyCommand(0, { type: 'pass' });
        expect(game.floors[0].guard.cell).toBe(7);
        expect(game.floors[0].tiles[7].alarm).toBe(false);
    });

    it('見張りが入ってきた部屋の泥棒は、隠密を1つ失う。0で見つかると負け', () => {
        const game = setup({ n: 2 });
        place(game, 1, 0, 11);
        placeGuard(game, 0, 15, 3);
        game.applyCommand(0, { type: 'pass' });
        expect(game.players[1].stealth).toBe(START_STEALTH - 1);
        const g2 = setup({ n: 2 });
        place(g2, 1, 0, 11);
        g2.players[1].stealth = 0;
        placeGuard(g2, 0, 15, 3);
        g2.applyCommand(0, { type: 'pass' });
        expect(g2.result).toEqual({ won: false, reason: 'caught', seat: 1 });
        expect(g2.isOver()).toBe(true);
        expect(g2.applyCommand(1, { type: 'pass' })).toBe(false);
    });

    it('見張りのいる部屋に入ると見つかる。軽業師は見つからない', () => {
        const game = setup();
        placeGuard(game, 0, 1, 15);
        game.applyCommand(0, { type: 'move', to: 1 });
        expect(game.players[0].stealth).toBe(START_STEALTH - 1);
        const g2 = setup({ chars: ['acrobat'] });
        placeGuard(g2, 0, 1, 15);
        g2.applyCommand(0, { type: 'move', to: 1 });
        expect(g2.players[0].stealth).toBe(START_STEALTH);
    });

    it('洗面所では、隠れ札を代わりに使う', () => {
        const game = setup({ n: 2, types: rooms({ 11: 'lavatory' }) });
        game.floors[0].tiles[11].revealed = true;
        place(game, 1, 0, 11);
        placeGuard(game, 0, 15, 3);
        game.applyCommand(0, { type: 'pass' });
        expect(game.players[1].stealth).toBe(START_STEALTH);
        expect(game.floors[0].tiles[11].lav).toBe(2);
    });

    it('ロビーでは、となりに見張りが来ると見つかる', () => {
        const game = setup({ n: 2, types: rooms({ 10: 'foyer' }) });
        game.floors[0].tiles[10].revealed = true;
        place(game, 1, 0, 10);
        placeGuard(game, 0, 15, 3);
        game.applyCommand(0, { type: 'pass' }); // 15 → 11 → 7：11 は 10 のとなり
        expect(game.players[1].stealth).toBe(START_STEALTH - 1);
    });

    it('巡回の山が尽きると切り直して、速くなる', () => {
        const game = setup({ n: 2 });
        placeGuard(game, 0, 15, 14, []);
        game.applyCommand(0, { type: 'pass' });
        expect(game.floors[0].guard.speed).toBe(BASE_SPEED[0] + 1);
        expect(game.floors[0].guard.deck.length).toBeGreaterThan(10);
    });

    it('先読み：見張りが必ず通る部屋と、行き先に着いたあとの見込み', () => {
        const game = setup();
        placeGuard(game, 0, 15, 3);
        expect([...predictGuard(game, 0, 1).sure]).toEqual([11, 7]);
        const risk = guardRisk(createGameView(game, 0), 0, 1);
        expect(risk[11]).toBe(1);
        expect(risk[7]).toBe(1);
        expect(risk[0]).toBe(0);
    });
});

describe('金庫', () => {
    // 金庫を 5（2行2列目）に置き、行と列の6部屋をめくって数字を 1〜6 にする
    function safeGame() {
        const game = setup({ n: 2, chars: ['hacker', 'hawk'], types: rooms({ 5: 'safe' }) });
        const line = [4, 6, 7, 1, 9, 13];
        line.forEach((c, i) => { game.floors[0].tiles[c].revealed = true; game.floors[0].tiles[c].num = i + 1; });
        game.floors[0].tiles[5].revealed = true;
        place(game, 0, 0, 5);
        return { game, line };
    }

    it('ダイスを足すのは2アクション。振ると、出た目の数字の部屋に印が付く', () => {
        const { game, line } = safeGame();
        expect(game.applyCommand(0, { type: 'crack' })).toBe(false); // ダイスがない
        expect(game.applyCommand(0, { type: 'addDie' })).toBe(true);
        expect(game.actionsLeft).toBe(2);
        expect(game.floors[0].safe.dice).toBe(1);
        game.applyCommand(0, { type: 'crack' });
        const n = game.lastRoll.values[0];
        expect(game.floors[0].tiles[line[n - 1]].cracked).toBe(true);
        expect(line.filter(c => game.floors[0].tiles[c].cracked)).toHaveLength(1);
    });

    it('めくっていない部屋には印が付かない', () => {
        const { game, line } = safeGame();
        line.forEach(c => { game.floors[0].tiles[c].revealed = false; });
        game.floors[0].safe.dice = 6;
        game.applyCommand(0, { type: 'crack' });
        expect(line.some(c => game.floors[0].tiles[c].cracked)).toBe(false);
    });

    it('6部屋すべてに印が付くと開き、お宝と道具を手に入れ、その階の見張りが速くなる', () => {
        const { game, line } = safeGame();
        line.slice(1).forEach(c => { game.floors[0].tiles[c].cracked = true; });
        game.floors[0].safe.dice = 6;
        for (let i = 0; i < 20 && !game.floors[0].safe.cracked; i++) {
            game.current = 0;
            game.actionsLeft = 4;
            game.applyCommand(0, { type: 'crack' });
        }
        expect(game.floors[0].safe.cracked).toBe(true);
        expect(game.players[0].loot).toHaveLength(1);
        expect(game.players[0].tools.length).toBeGreaterThanOrEqual(1);
        expect(game.floors[0].guard.speed).toBe(BASE_SPEED[0] + 1);
    });

    it('金庫破りは1個多く振る', () => {
        const { game } = safeGame();
        game.players[0].char = 'peterman';
        game.floors[0].safe.dice = 2;
        game.applyCommand(0, { type: 'crack' });
        expect(game.lastRoll.values).toHaveLength(3);
    });
});

describe('階段と脱出', () => {
    it('階段で上の階へ。上の階に見張りが現れる。上がった先から下りられる', () => {
        const game = setup({ floors: 2, types: rooms({ 0: 'stairs' }) });
        expect(game.applyCommand(0, { type: 'up' })).toBe(true);
        expect(game.players[0].floor).toBe(1);
        expect(game.floors[1].tiles[0].revealed).toBe(true);
        expect(game.floors[1].guard.active).toBe(true);
        expect(game.floors[1].guard.cell).not.toBe(0);
        expect(game.floors[1].guard.speed).toBe(BASE_SPEED[1]);
        expect(game.applyCommand(0, { type: 'down' })).toBe(true);
        expect(game.players[0].floor).toBe(0);
    });

    it('屋上へは、金庫がすべて開いてから。全員が逃げれば勝ち', () => {
        const game = setup({ n: 2, types: rooms({ 0: 'stairs' }) });
        expect(game.applyCommand(0, { type: 'roof' })).toBe(false);
        game.floors[0].safe.cracked = true;
        expect(game.applyCommand(0, { type: 'roof' })).toBe(true);
        expect(game.players[0].escaped).toBe(true);
        expect(game.current).toBe(1);
        expect(game.result).toBe(null);
        expect(game.applyCommand(1, { type: 'roof' })).toBe(true);
        expect(game.result).toEqual({ won: true, reason: 'escaped' });
    });

    it('最上階でない階段からは、屋上へ出られない', () => {
        const game = setup({ floors: 2, types: rooms({ 0: 'stairs' }) });
        game.floors.forEach(fl => { fl.safe.cracked = true; });
        expect(game.applyCommand(0, { type: 'roof' })).toBe(false);
    });
});

describe('得意と道具', () => {
    it('仕掛け屋は、となりの部屋の警報を鳴らせる', () => {
        const game = setup({ chars: ['juicer'] });
        expect(game.applyCommand(0, { type: 'juice', to: 1 })).toBe(true);
        expect(game.floors[0].tiles[1].alarm).toBe(true);
        expect(game.applyCommand(0, { type: 'juice', to: 10 })).toBe(false);
    });

    it('見張り役は、巡回の山の上を見て、山の下へ回せる', () => {
        const game = setup({ chars: ['spotter'] });
        placeGuard(game, 0, 15, 12, [1, 2, 3]);
        expect(game.applyCommand(0, { type: 'spot' })).toBe(true);
        expect(game.phase).toBe('spot');
        expect(game.spotted).toEqual({ floor: 0, cell: 3 });
        expect(game.applyCommand(0, { type: 'move', to: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'spotBottom' })).toBe(true);
        expect(game.floors[0].guard.deck).toEqual([3, 1, 2]);
        expect(game.phase).toBe('actions');
    });

    it('道具：ローラースケート・設計図・ウイルス・透明スーツ・煙幕', () => {
        const game = setup({ n: 2 });
        game.players[0].tools = ['rollerskates', 'blueprints', 'virus', 'invisible', 'smoke'];
        game.applyCommand(0, { type: 'tool', tool: 'rollerskates' });
        expect(game.actionsLeft).toBe(6);
        game.applyCommand(0, { type: 'tool', tool: 'blueprints', to: 15 });
        expect(game.floors[0].tiles[15].revealed).toBe(true);
        game.applyCommand(0, { type: 'tool', tool: 'virus' });
        expect(game.hacks).toEqual({ fingerprint: 2, laser: 2, motion: 2 });
        game.applyCommand(0, { type: 'tool', tool: 'invisible' });
        game.applyCommand(0, { type: 'tool', tool: 'smoke' });
        expect(game.players[0].tools).toEqual([]);
        expect(game.applyCommand(0, { type: 'tool', tool: 'smoke' })).toBe(false);
        // 煙幕：見張りは動かない。透明スーツ：見張りが来ても見つからない
        placeGuard(game, 0, 1, 15);
        game.applyCommand(0, { type: 'pass' });
        expect(game.floors[0].guard.cell).toBe(1);
        game.applyCommand(1, { type: 'pass' });
        expect(game.players[0].stealth).toBe(START_STEALTH);
    });

    it('ダイナマイトは壁を壊し、自分の部屋で警報が鳴る', () => {
        const game = setup({ types: rooms({ 0: 'camera' }) });
        game.floors[0].walls = [wallKey(0, 1)];
        game.players[0].tools = ['dynamite'];
        expect(game.applyCommand(0, { type: 'tool', tool: 'dynamite', to: 1 })).toBe(true);
        expect(game.floors[0].walls).toEqual([]);
        expect(game.floors[0].tiles[0].alarm).toBe(true);
    });
});

describe('操作の受け付け', () => {
    it('手番でない人・知らない操作・決まっていない項目は断る（状態は変えない）', () => {
        const game = makeGame(2, { seed: 4 });
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'pass' })).toBe(false);
        expect(game.applyCommand(0, { type: 'fly' })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', to: 'x' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
        game.applyCommand(0, { type: 'pass', extra: 1 });
        expect(game.commands.at(-1).command).toEqual({ type: 'pass' });
    });
});

describe('ビュー', () => {
    it('めくっていない部屋の種類と数字、巡回の山の並び、山、シードは入れない', () => {
        const game = makeGame(2, { seed: 8, floors: 3 });
        const view = createGameView(game, 0);
        view.floors.forEach(fl => fl.tiles.filter(t => !t.revealed).forEach(t => {
            expect(t.type).toBe(null);
            expect(t.num).toBe(null);
        }));
        const text = JSON.stringify(view);
        expect(text).not.toMatch(/"(deck|toolDeck|lootDeck|seed|random|options)"/);
        expect(view.floors[0].guard.deckCount).toBeGreaterThan(0);
        expect(JSON.parse(text)).toEqual(view);
    });
});

describe('記録からの再現', () => {
    it.each([[2, 1, 3], [3, 2, 7], [4, 3, 12]])('%i人・%i階建て：CPU の試合を記録から作り直すと同じ局面になる（シード %i）', (n, floors, seed) => {
        const game = new Game(players(n, true), { seed, floors });
        for (let i = 0; i < 400 && !game.isOver(); i++) runCpuStep(game);
        const saved = game.persist();
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
        expect(JSON.stringify(createGameView(again, 0))).toBe(JSON.stringify(createGameView(game, 0)));
    });

    it('途中まで作り直して、同じ操作を続けても同じになる', () => {
        const game = new Game(players(2, true), { seed: 21, floors: 2 });
        for (let i = 0; i < 120 && !game.isOver(); i++) runCpuStep(game);
        const saved = game.persist();
        const half = Game.replay(saved.players, saved.options, saved.commands.slice(0, 60));
        saved.commands.slice(60).forEach(c => expect(half.applyCommand(c.playerId, c.command)).toBe(true));
        expect(snapshot(half)).toBe(snapshot(game));
    });

    it('記録に合わない操作は、作り直すときに投げる', () => {
        expect(() => Game.replay(players(2), { seed: 1, floors: 1 }, [{ playerId: 1, command: { type: 'pass' } }])).toThrow();
    });

    it('部屋の種類の数は、定義どおり', () => {
        const total = Object.values(ROOMS).reduce((s, r) => s + (r.count ?? 0), 0);
        expect(total).toBeGreaterThanOrEqual(3 * (CELLS - 2));
    });
});
