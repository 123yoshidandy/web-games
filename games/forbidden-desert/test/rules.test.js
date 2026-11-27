import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { STORM_CARDS, GEAR_CARDS, START_SAND, SAND_TOTAL, METER, LEVELS, ROLE_BY_KEY } from '../public/js/data.js';
import { makeGame, players, clearSand, placeKind, moveTo, stackStorm, snapshot, STORM_START } from './helpers.js';

const card = (pred) => STORM_CARDS.find(pred).id;
const WIND = (dir, n) => card(c => c.kind === 'wind' && c.dir === dir && c.n === n);
const SUN = card(c => c.kind === 'sun');
const UP = card(c => c.kind === 'up');
const gearCard = (kind) => GEAR_CARDS.indexOf(kind);

// 役割を決めた2人で、P1 の手番。砂をなくし、2人とも真ん中の左（マス11）に置く
function setup(roles = ['explorer', 'navigator'], seed = 1) {
    const game = makeGame(roles.length, { seed, roles, level: 'novice' });
    clearSand(game);
    game.players.forEach((p, i) => moveTo(game, i, 11));
    return game;
}

describe('準備', () => {
    it('24枚を5×5に並べ、真ん中が嵐の目。8マスに砂、全員が墜落地点', () => {
        const game = makeGame(4, { seed: 3 });
        expect(game.grid.filter(id => id === null)).toHaveLength(1);
        expect(game.grid[STORM_START]).toBeNull();
        expect(new Set(game.grid.filter(id => id !== null)).size).toBe(24);
        START_SAND.forEach(pos => expect(game.tileAt(pos).sand).toBe(1));
        expect(game.sandOnBoard()).toBe(8);
        const crash = game.tiles.find(t => t.kind === 'crash');
        game.players.forEach(p => expect(p.tile).toBe(crash.id));
        game.players.forEach(p => expect(p.water).toBe(ROLE_BY_KEY[p.role].water));
        expect(game.stormDeck).toHaveLength(31);
        expect(game.gearDeck).toHaveLength(12);
    });

    it('難易度で嵐の目盛りの始まりが変わる', () => {
        Object.entries(LEVELS).forEach(([level, { start }]) => {
            const game = makeGame(3, { level });
            expect(game.meter).toBe(start);
            expect(game.stormDraws()).toBe(METER[3][start]);
        });
    });

    it('役割は6種から重ならずに選ばれ、同じシードなら同じ準備になる', () => {
        const game = makeGame(5, { seed: 9 });
        expect(new Set(game.players.map(p => p.role)).size).toBe(5);
        expect(snapshot(makeGame(3, { seed: 42 }))).toBe(snapshot(makeGame(3, { seed: 42 })));
        expect(snapshot(makeGame(3, { seed: 42 }))).not.toBe(snapshot(makeGame(3, { seed: 43 })));
    });
});

describe('行動', () => {
    it('移動はとなりへ。ふさがったタイルには入れず、埋もれたら出られない', () => {
        const game = setup(['navigator', 'explorer']);
        expect(game.applyCommand(0, { type: 'move', to: 10 })).toBe(true);
        expect(game.playerPos(0)).toBe(10);
        expect(game.actionsLeft).toBe(3);
        expect(game.applyCommand(0, { type: 'move', to: 12 })).toBe(false); // 嵐の目
        expect(game.applyCommand(0, { type: 'move', to: 6 })).toBe(false);  // 斜め
        game.tileAt(5).sand = 2;
        expect(game.applyCommand(0, { type: 'move', to: 5 })).toBe(false);
        game.tileAt(10).sand = 2;
        expect(game.applyCommand(0, { type: 'move', to: 15 })).toBe(false);
        expect(game.applyCommand(0, { type: 'dig', at: 10 })).toBe(true);
        expect(game.applyCommand(0, { type: 'move', to: 15 })).toBe(true);
    });

    it('砂の除去は自分かとなりのタイル。考古学者は2つ', () => {
        const game = setup(['archeologist', 'navigator']);
        game.tileAt(10).sand = 3;
        game.tileAt(1).sand = 1;
        expect(game.applyCommand(0, { type: 'dig', at: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'dig', at: 10 })).toBe(true);
        expect(game.tileAt(10).sand).toBe(1);
    });

    it('掘り出しは砂がないときだけ。井戸は同じタイルの全員に水2、遺跡は装備1枚', () => {
        const game = setup(['navigator', 'meteorologist']);
        placeKind(game, 'water', 11);
        game.players.forEach(p => { p.water = 1; });
        game.tileAt(11).sand = 1;
        expect(game.applyCommand(0, { type: 'excavate' })).toBe(false);
        game.tileAt(11).sand = 0;
        expect(game.applyCommand(0, { type: 'excavate' })).toBe(true);
        expect(game.players.map(p => p.water)).toEqual([3, 3]);
        placeKind(game, 'gear', 10);
        game.applyCommand(0, { type: 'move', to: 10 });
        game.applyCommand(0, { type: 'excavate' });
        expect(game.players[0].gear).toHaveLength(1);
        expect(game.gearDeck).toHaveLength(11);
    });

    it('手がかりが2枚とも出たら、行と列の交わりに部品が出る。砂がなければ拾える', () => {
        const game = setup(['navigator', 'meteorologist']);
        placeKind(game, 'clue', 11, t => t.part === 'engine' && t.axis === 'row');   // 2行目
        placeKind(game, 'clue', 13, t => t.part === 'engine' && t.axis === 'col');   // 3列目
        game.applyCommand(0, { type: 'excavate' });
        expect(game.parts.find(p => p.key === 'engine').state).toBe('hidden');
        game.players[0].tile = game.grid[13];
        game.applyCommand(0, { type: 'excavate' });
        const engine = game.parts.find(p => p.key === 'engine');
        expect(engine.state).toBe('placed');
        expect(game.posOf(engine.tile)).toBe(13);
        game.tileAt(13).sand = 1;
        game.beginTurn(0);
        expect(game.applyCommand(0, { type: 'pickup' })).toBe(false);
        game.tileAt(13).sand = 0;
        expect(game.applyCommand(0, { type: 'pickup' })).toBe(true);
        expect(game.partsFound()).toBe(1);
    });

    it('交わりが嵐の目なら、次にすべり込んだタイルに部品が乗る', () => {
        const game = setup(['navigator', 'meteorologist']);
        placeKind(game, 'clue', 11, t => t.part === 'compass' && t.axis === 'row');  // 2行目
        placeKind(game, 'clue', 7, t => t.part === 'compass' && t.axis === 'col');   // 2列目 → (2,2) は嵐の目
        game.applyCommand(0, { type: 'excavate' });
        game.players[0].tile = game.grid[7];
        game.applyCommand(0, { type: 'excavate' });
        const part = game.parts.find(p => p.key === 'compass');
        expect(part.state).toBe('placed');
        expect(part.tile).toBeNull();
        const slid = game.grid[17];
        stackStorm(game, [WIND('down', 1)]);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'storm' });
        expect(part.tile).toBe(slid);
    });

    it('掘り出したトンネルどうしは1行動で移れる', () => {
        const game = setup(['navigator', 'meteorologist']);
        const a = placeKind(game, 'tunnel', 11);
        placeKind(game, 'tunnel', 0, t => t.id !== a.id);
        game.tileAt(11).revealed = true;
        expect(game.applyCommand(0, { type: 'tunnel', to: 0 })).toBe(false);
        game.tileAt(0).revealed = true;
        expect(game.applyCommand(0, { type: 'tunnel', to: 0 })).toBe(true);
        expect(game.playerPos(0)).toBe(0);
    });

    it('4つ行動したら嵐の段階へ。嵐の目盛りの枚数を引いたら次の人', () => {
        const game = setup(['navigator', 'meteorologist']);
        for (let i = 0; i < 4; i++) game.applyCommand(0, { type: 'dig', at: 11 }) || game.applyCommand(0, { type: 'move', to: i % 2 ? 11 : 10 });
        expect(game.phase).toBe('storm');
        expect(game.applyCommand(1, { type: 'storm' })).toBe(false);
        const draws = game.stormLeft;
        expect(draws).toBe(game.stormDraws());
        stackStorm(game, [WIND('left', 1), WIND('left', 1), WIND('left', 1)]);
        for (let i = 0; i < draws; i++) expect(game.applyCommand(0, { type: 'storm' })).toBe(true);
        expect(game.current).toBe(1);
        expect(game.phase).toBe('actions');
    });
});

describe('嵐のカード', () => {
    it('風：嵐の目が動き、すべり込んだタイルに砂。駒も一緒に動き、端で止まる', () => {
        const game = setup(['navigator', 'meteorologist']);
        moveTo(game, 0, 13);
        const tile = game.grid[13];
        stackStorm(game, [WIND('right', 3)]);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'storm' });
        expect(game.storm).toBe(14);         // 2マスで端
        expect(game.posOf(tile)).toBe(12);
        expect(game.tiles[tile].sand).toBe(1);
        expect(game.tileAt(13).sand).toBe(1);
        expect(game.playerPos(0)).toBe(12);
        expect(game.sandOnBoard()).toBe(2);
    });

    it('嵐が強まる：目盛りが上がり、最後を越えたら負け', () => {
        const game = setup(['navigator', 'meteorologist']);
        game.meter = game.ladder.length - 1;
        stackStorm(game, [UP]);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'storm' });
        expect(game.result).toEqual({ won: false, reason: 'storm' });
    });

    it('日差し：トンネル・日よけの下にいない人が水を失い、水が0の人が受けたら負け', () => {
        const game = setup(['navigator', 'meteorologist', 'climber']);
        placeKind(game, 'tunnel', 10).revealed = true;
        moveTo(game, 1, 10);
        game.shields.push({ tile: game.grid[11], owner: 2 });
        moveTo(game, 2, 6);
        const before = game.players.map(p => p.water);
        stackStorm(game, [SUN, SUN]);
        game.calmed = game.stormDraws() - 2;
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'storm' });
        expect(game.players.map(p => p.water)).toEqual([before[0], before[1], before[2] - 1]);
        game.players[2].water = 0;
        game.applyCommand(0, { type: 'storm' });
        expect(game.result).toEqual({ won: false, reason: 'thirst' });
    });

    it('置く砂がなくなったら負け', () => {
        const game = setup(['navigator', 'meteorologist']);
        game.tileAt(0).sand = SAND_TOTAL;
        stackStorm(game, [WIND('up', 1)]);
        game.applyCommand(0, { type: 'pass' });
        game.applyCommand(0, { type: 'storm' });
        expect(game.result).toEqual({ won: false, reason: 'sand' });
    });

    it('山が尽きたら捨て札を切り直す', () => {
        const game = setup(['navigator', 'meteorologist']);
        game.stormDiscard = game.stormDeck.splice(1);
        game.applyCommand(0, { type: 'pass' });
        while (game.phase === 'storm' && !game.isOver()) game.applyCommand(0, { type: 'storm' });
        expect(game.stormDeck.length + game.stormDiscard.length).toBe(31);
    });
});

describe('役割', () => {
    it('探検家は斜めに動ける', () => {
        const game = setup(['explorer', 'navigator']);
        expect(game.applyCommand(0, { type: 'move', to: 6 })).toBe(true);
    });

    it('登山家はふさがったタイルに入れ、仲間を1人連れて行ける。同じタイルの仲間も埋もれない', () => {
        const game = setup(['climber', 'navigator']);
        game.tileAt(10).sand = 3;
        expect(game.applyCommand(0, { type: 'move', to: 10, carry: 1 })).toBe(true);
        expect(game.playerPos(1)).toBe(10);
        expect(game.canLeave(1)).toBe(true);
    });

    it('気象学者は引く枚数を減らせる', () => {
        const game = setup(['meteorologist', 'navigator']);
        game.meter = 1;
        const draws = game.stormDraws();
        for (let i = 0; i < draws; i++) expect(game.applyCommand(0, { type: 'calm' })).toBe(true);
        expect(game.applyCommand(0, { type: 'calm' })).toBe(false);
        game.applyCommand(0, { type: 'pass' });
        expect(game.current).toBe(1);
    });

    it('航海士は仲間を3マスまで動かす', () => {
        const game = setup(['navigator', 'explorer']);
        expect(game.applyCommand(0, { type: 'navigate', who: 1, path: [6, 2, 3] })).toBe(true);
        expect(game.playerPos(1)).toBe(3);
        expect(game.applyCommand(0, { type: 'navigate', who: 1, path: [4, 9, 14, 19] })).toBe(false);
    });

    it('水運びは掘り出した井戸で水をくみ、となりの仲間にも渡せる', () => {
        const game = setup(['waterCarrier', 'navigator']);
        placeKind(game, 'water', 11).revealed = true;
        game.players[0].water = 1;
        expect(game.applyCommand(0, { type: 'collect' })).toBe(true);
        expect(game.players[0].water).toBe(3);
        moveTo(game, 1, 10);
        game.players[1].water = 1;
        expect(game.applyCommand(0, { type: 'water', to: 1 })).toBe(true);
        expect(game.players[1].water).toBe(2);
    });
});

describe('水と装備', () => {
    it('水は同じタイルの仲間に、手番でなくても渡せる', () => {
        const game = setup(['navigator', 'explorer']);
        game.players[0].water = 1;
        expect(game.applyCommand(1, { type: 'water', to: 0 })).toBe(true);
        expect(game.players[0].water).toBe(2);
        moveTo(game, 1, 10);
        expect(game.applyCommand(1, { type: 'water', to: 0 })).toBe(false);
        expect(game.applyCommand(1, { type: 'move', to: 11 })).toBe(false); // 手番でない人の行動は断る
    });

    it('装備：吹き飛ばし・ジェットパック・日よけ・地中鏡・秘密の水・時間の加速', () => {
        const game = setup(['navigator', 'explorer']);
        game.players[0].gear = ['blaster', 'jetpack', 'shield', 'terrascope', 'reserve', 'throttle'].map(gearCard);
        game.tileAt(10).sand = 4;
        expect(game.applyCommand(0, { type: 'gear', card: gearCard('blaster'), at: 10 })).toBe(true);
        expect(game.tileAt(10).sand).toBe(0);
        game.players.forEach(p => { p.water = 1; });
        expect(game.applyCommand(0, { type: 'gear', card: gearCard('reserve') })).toBe(true);
        expect(game.players.map(p => p.water)).toEqual([3, 3]);
        expect(game.applyCommand(0, { type: 'gear', card: gearCard('throttle') })).toBe(true);
        expect(game.actionsLeft).toBe(6);
        const hidden = game.tileAt(24);
        expect(game.applyCommand(0, { type: 'gear', card: gearCard('terrascope'), at: 24 })).toBe(true);
        expect(createGameView(game, 1).cells[24].kind).toBe(hidden.kind);
        expect(game.applyCommand(0, { type: 'gear', card: gearCard('shield') })).toBe(true);
        expect(game.shielded(game.grid[11])).toBe(true);
        expect(game.applyCommand(0, { type: 'gear', card: gearCard('jetpack'), at: 24, carry: 1 })).toBe(true);
        expect([game.playerPos(0), game.playerPos(1)]).toEqual([24, 24]);
        expect(game.players[0].gear).toEqual([]);
    });

    it('装備は同じタイルの仲間に渡せる', () => {
        const game = setup(['navigator', 'explorer']);
        game.players[0].gear = [gearCard('jetpack')];
        expect(game.applyCommand(0, { type: 'give', to: 1, card: gearCard('jetpack') })).toBe(true);
        expect(game.players[1].gear).toEqual([gearCard('jetpack')]);
    });
});

describe('勝ち', () => {
    it('部品4つを拾い、全員が掘り出した発射台に集まれば離陸できる', () => {
        const game = setup(['navigator', 'explorer']);
        const pad = placeKind(game, 'launch', 11);
        expect(game.applyCommand(0, { type: 'launch' })).toBe(false);
        pad.revealed = true;
        game.parts.forEach(p => { p.state = 'found'; });
        expect(createGameView(game, 0).launchReady).toBe(true);
        expect(game.applyCommand(0, { type: 'launch' })).toBe(true);
        expect(game.result).toEqual({ won: true, reason: 'won' });
    });
});

describe('断る操作・ビュー・待った', () => {
    it('断る操作は状態を変えない', () => {
        const game = makeGame(3, { seed: 5 });
        const before = snapshot(game);
        [
            [1, { type: 'move', to: 0 }], [0, { type: 'storm' }], [0, { type: 'nope' }], [0, null], [0, { type: 'dig', at: 99 }],
            [0, { type: 'gear', card: 0 }], [0, { type: 'navigate', who: 1, path: [0] }], [0, { type: 'launch' }], [9, { type: 'pass' }]
        ].forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('ビューに裏のタイルの中身・タイルの番号・山の並び・シードを入れない', () => {
        const game = makeGame(4, { seed: 11 });
        const view = createGameView(game, 2);
        const text = JSON.stringify(view);
        expect(text).not.toContain('seed');
        expect(view).not.toHaveProperty('stormDeck');
        view.cells.forEach((c, pos) => {
            if (!c) return;
            const tile = game.tileAt(pos);
            expect(c.kind).toBe(tile.revealed ? tile.kind : null);
            expect(c.back).toBe(tile.back);
            expect(c).not.toHaveProperty('id');
        });
    });

    it('待ったは、隠れた情報を見せない手番中の行動だけを戻す', () => {
        const game = setup(['navigator', 'explorer']);
        game.applyCommand(0, { type: 'move', to: 10 });
        expect(game.canUndo()).toBe(true);
        const back = game.undo();
        expect(back.playerPos(0)).not.toBe(10);
        expect(back.commands).toHaveLength(0);
        const fresh = makeGame(2, { seed: 1 });
        fresh.applyCommand(0, { type: 'excavate' });
        expect(fresh.canUndo()).toBe(false);
        expect(fresh.undo()).toBeNull();
    });
});

describe('記録からの再現', () => {
    it('操作の記録から、同じ局面を再現できる', () => {
        const game = makeGame(3, { seed: 21 });
        game.applyCommand(0, { type: 'excavate' });
        game.applyCommand(0, { type: 'pass' });
        while (game.phase === 'storm') game.applyCommand(0, { type: 'storm' });
        game.applyCommand(1, { type: 'pass' });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('人数の上限・下限を守る', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(6))).toThrow();
    });
});
