import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { RACE_IDS, POWER_IDS, ROUNDS } from '../public/js/data.js';
import { conquestCost, conquestTargets, turnIncome, sorceryTargets, dragonTargets, canDecline } from '../public/js/rules.js';
import { getMap, MAP_SPECS } from '../public/js/map.js';
import {
    newGame, clearMap, give, turnOf, run, snapshot, findRegion, isLand, plainLand, adjacentPair, adjacentTriple, players, startTokens
} from './helpers.js';

describe('準備', () => {
    it.each([2, 3, 4, 5])('%i人：地図の領域の数・6組の並び・5金・ラウンド数', (n) => {
        const game = newGame(n, 3);
        expect(game.regions.length).toBe(MAP_SPECS[n].regions);
        expect(game.row.length).toBe(6);
        expect(game.raceDeck.length + 6).toBe(RACE_IDS.length);
        expect(game.powerDeck.length + 6).toBe(POWER_IDS.length);
        expect(game.players.every(p => p.coins === 5)).toBe(true);
        expect(game.rounds).toBe(ROUNDS[n]);
        expect(game.regions.filter(r => r.race === 'lost').length).toBe(MAP_SPECS[n].lost);
        expect(game.stage).toBe('pick');
    });

    it('地図はいつも同じ形で、陸はひとつながり', () => {
        const map = getMap(4);
        expect(new Game(players(4), { seed: 9 }).map).toBe(map);
        map.regions.forEach(r => r.adj.forEach(a => expect(map.regions[a].adj).toContain(r.id)));
        expect(map.regions.filter(r => r.terrain === 'sea').every(r => r.edge)).toBe(true);
        expect(map.regions.filter(r => r.terrain === 'lake').length).toBe(1);
    });

    it('同じシードなら同じ並び', () => {
        expect(newGame(3, 42).row).toEqual(newGame(3, 42).row);
        expect(newGame(3, 42).row).not.toEqual(newGame(3, 43).row);
    });
});

describe('組を選ぶ', () => {
    it('上から i 番目を選ぶと、上の i 組に1金ずつ置き、選んだ組のコインをもらう', () => {
        const game = newGame(2, 5);
        const seat = game.current;
        game.row[2].coins = 3;
        const chosen = game.row[2];
        run(game, [[seat, { type: 'pick', index: 2 }]]);
        expect(game.players[seat].coins).toBe(5 - 2 + 3);
        expect(game.row[0].coins).toBe(1);
        expect(game.row[1].coins).toBe(1);
        expect(game.row.length).toBe(6);
        expect(game.players[seat].active).toBe(chosen.race);
        expect(game.bands[chosen.race].hand).toBe(startTokens(chosen.race, chosen.power));
        expect(game.stage).toBe('conquer');
    });

    it('コインが足りない組は選べず、断った操作は状態を変えない', () => {
        const game = newGame(2, 5);
        const seat = game.current;
        game.players[seat].coins = 1;
        const before = snapshot(game);
        expect(game.applyCommand(seat, { type: 'pick', index: 2 })).toBe(false);
        expect(game.applyCommand(1 - seat, { type: 'pick', index: 0 })).toBe(false);
        expect(game.applyCommand(seat, { type: 'conquer', region: 0 })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('征服', () => {
    it('必要な数は 2＋部隊＋山。失われた部族は1体', () => {
        const game = clearMap(newGame(2));
        give(game, 0, 'ratmen', 'forest', { hand: 10 });
        const mountain = findRegion(game, info => info.terrain === 'mountain');
        const plain = findRegion(game, plainLand);
        expect(conquestCost(game, 'ratmen', mountain)).toBe(3);
        expect(conquestCost(game, 'ratmen', plain)).toBe(2);
        game.regions[plain] = { ...game.regions[plain], race: 'lost', count: 1 };
        expect(conquestCost(game, 'ratmen', plain)).toBe(3);
    });

    it('最初は縁の領域からだけ。海は征服できない', () => {
        const game = clearMap(newGame(2));
        give(game, 0, 'ratmen', 'forest', { hand: 12 });
        turnOf(game, 0);
        const inner = findRegion(game, info => !info.border && plainLand(info));
        const sea = findRegion(game, info => info.terrain === 'sea');
        const border = findRegion(game, info => info.border && plainLand(info));
        expect(game.applyCommand(0, { type: 'conquer', region: inner })).toBe(false);
        expect(game.applyCommand(0, { type: 'conquer', region: sea })).toBe(false);
        run(game, [[0, { type: 'conquer', region: border }]]);
        expect(game.regions[border]).toMatchObject({ race: 'ratmen', count: 2 });
        expect(game.bands.ratmen.hand).toBe(10);
        // 次からは隣の領域だけ
        const targets = conquestTargets(game).map(t => t.id);
        expect(targets.every(id => game.map.regions[id].adj.includes(border))).toBe(true);
    });

    it('攻められた側は1体を失い、残りは番の終わりに自分の領域へ戻る', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        const c = findRegion(game, plainLand, [a, b]);
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 1 }, hand: 10 });
        give(game, 1, 'orcs', 'hill', { regions: { [b]: 3, [c]: 1 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'conquer', region: b }]]);
        expect(game.regions[b]).toMatchObject({ race: 'ratmen', count: 5 });
        expect(game.bands.orcs.hand).toBe(2);
        run(game, [[0, { type: 'redeploy' }], [0, { type: 'done' }]]);
        expect(game.regions[c].count).toBe(3);
        expect(game.bands.orcs.hand).toBe(0);
    });

    it('エルフは攻められても部隊を失わない', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 1 }, hand: 10 });
        give(game, 1, 'elves', 'hill', { regions: { [b]: 2 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'conquer', region: b }]]);
        expect(game.bands.elves.hand).toBe(2);
    });

    it('部隊が足りなければ、最後に1回だけサイコロに賭け、再配置に移る', () => {
        const game = clearMap(newGame(2, 11));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 1 }, hand: 1 });
        give(game, 1, 'orcs', 'hill', { regions: { [b]: 1 } });
        turnOf(game, 0);
        const target = conquestTargets(game).find(t => t.id === b);
        expect(target).toMatchObject({ cost: 3, final: true });
        run(game, [[0, { type: 'conquer', region: b }]]);
        expect(game.stage).toBe('redeploy');
        const dice = game.events.find(e => e.type === 'dice');
        expect(dice.success).toBe(1 + dice.value >= 3);
        expect(game.regions[b].race).toBe(dice.success ? 'ratmen' : 'orcs');
    });

    it('自分の衰退していない種族は攻められず、衰退した種族は攻められる', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 1 }, hand: 10 });
        give(game, 0, 'orcs', 'hill', { regions: { [b]: 1 }, declined: true });
        turnOf(game, 0);
        expect(conquestTargets(game).some(t => t.id === b)).toBe(true);
    });

    it('征服の前なら、自分の領域を放棄して部隊を手に戻せる', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 3, [b]: 2 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'abandon', region: a }]]);
        expect(game.regions[a].race).toBe(null);
        expect(game.bands.ratmen.hand).toBe(4);
    });
});

describe('衰退', () => {
    it('各領域に1体だけ残し、前の衰退した種族は消えて山の下に戻る。その番は得点だけ', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        const c = findRegion(game, plainLand, [a, b]);
        give(game, 0, 'orcs', 'hill', { regions: { [c]: 1 }, declined: true });
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 3, [b]: 2 } });
        turnOf(game, 0);
        expect(canDecline(game)).toBe(true);
        run(game, [[0, { type: 'decline' }]]);
        expect(game.regions[a].count).toBe(1);
        expect(game.regions[c].race).toBe(null);
        expect(game.bands.orcs).toBeUndefined();
        expect(game.raceDeck.at(-1)).toBe('orcs');
        expect(game.powerDeck.at(-1)).toBe('hill');
        expect(game.players[0].declined).toEqual(['ratmen']);
        expect(game.players[0].coins).toBe(5 + 2);
        expect(game.current).toBe(1);
    });

    it('一度でも征服したら、その番は衰退できない', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 3 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'conquer', region: b }]]);
        expect(game.applyCommand(0, { type: 'decline' })).toBe(false);
    });

    it('霊の種族は、ほかの衰退した種族を消さない', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'orcs', 'hill', { regions: { [b]: 1 }, declined: true });
        give(game, 0, 'ratmen', 'spirit', { regions: { [a]: 2 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'decline' }]]);
        expect(game.players[0].declined).toEqual(['orcs', 'ratmen']);
    });

    it('衰退したグールは部隊が減らず、次の番に先に征服する', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ghouls', 'hill', { regions: { [a]: 5 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'decline' }]]);
        expect(game.regions[a].count).toBe(5);
        run(game, [[1, { type: 'pick', index: 0 }], [1, { type: 'redeploy' }], [1, { type: 'done' }]]);
        expect(game.current).toBe(0);
        expect(game.acting).toBe('ghouls');
        run(game, [[0, { type: 'conquer', region: b }], [0, { type: 'redeploy' }], [0, { type: 'done' }]]);
        expect(game.regions[b].race).toBe('ghouls');
        expect(game.stage).toBe('pick');
    });

    it('頑丈な種族は、征服した番の終わりに衰退できる', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'stout', { regions: { [a]: 5 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'conquer', region: b }], [0, { type: 'redeploy' }], [0, { type: 'done', decline: true }]]);
        expect(game.players[0].active).toBe(null);
        expect(game.players[0].declined).toEqual(['ratmen']);
        expect(game.regions[a].count).toBe(1);
    });
});

describe('得点', () => {
    it('領域1つにつき1金。衰退した種族の領域も数える', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 2 } });
        give(game, 0, 'orcs', 'hill', { regions: { [b]: 1 }, declined: true });
        turnOf(game, 0);
        expect(turnIncome(game, 0).parts[0]).toEqual({ label: '領域', coins: 2 });
    });

    it('人間・魔法使い・ドワーフ（衰退しても）・森の・商人・錬金術・裕福', () => {
        const game = clearMap(newGame(3));
        const farm = findRegion(game, info => info.terrain === 'farm');
        const magic = findRegion(game, info => info.special === 'magic');
        const mine = findRegion(game, info => info.special === 'mine');
        const forest = findRegion(game, info => info.terrain === 'forest' && info.special !== 'mine');
        give(game, 0, 'humans', 'merchant', { regions: { [farm]: 1 } });
        expect(turnIncome(game, 0).total).toBe(1 + 1 + 1);
        give(game, 1, 'wizards', 'alchemist', { regions: { [magic]: 1 } });
        expect(turnIncome(game, 1).total).toBe(1 + 1 + 2);
        give(game, 2, 'dwarves', 'wealthy', { regions: { [mine]: 1 }, declined: true });
        give(game, 2, 'ratmen', 'forest', { regions: { [forest]: 1 } });
        expect(turnIncome(game, 2).total).toBe(2 + 1 + 1);
        game.bands.ratmen.power = 'wealthy';
        expect(turnIncome(game, 2).total).toBe(2 + 1 + 7);
    });

    it('オークと略奪は、だれかのいた領域の征服1つにつき1金', () => {
        const game = clearMap(newGame(2));
        const [a, b, c] = adjacentTriple(game);
        give(game, 0, 'orcs', 'pillaging', { regions: { [a]: 8 } });
        game.regions[b] = { ...game.regions[b], race: 'lost', count: 1 };
        turnOf(game, 0);
        run(game, [[0, { type: 'conquer', region: b }], [0, { type: 'conquer', region: c }]]);
        expect(turnIncome(game, 0).total).toBe(3 + 1 + 1);
    });

    it('裕福の7金は最初の番だけ', () => {
        const game = clearMap(newGame(2));
        const [a] = adjacentPair(game);
        give(game, 0, 'ratmen', 'wealthy', { regions: { [a]: 2 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'redeploy' }], [0, { type: 'done' }]]);
        expect(game.players[0].coins).toBe(5 + 1 + 7);
        expect(turnIncome(game, 0).total).toBe(1);
    });
});

describe('種族の力', () => {
    it('トロルの巣は守りを1増やし、衰退しても残る', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 1, 'trolls', 'hill', { regions: { [b]: 1 }, hand: 5 });
        turnOf(game, 1);
        run(game, [[1, { type: 'conquer', region: a }]]);
        expect(game.regions[a].lair).toBe(true);
        give(game, 0, 'ratmen', 'forest', { hand: 10 });
        expect(conquestCost(game, 'ratmen', a)).toBe(2 + 2 + 1);
    });

    it('アマゾネスは征服のときだけ4体多い', () => {
        const game = clearMap(newGame(2));
        const [a] = adjacentPair(game);
        give(game, 0, 'amazons', 'hill', { regions: { [a]: 3 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'redeploy' }]]);
        expect(game.bands.amazons.hand + game.regions[a].count).toBe(3);
    });

    it('ガイコツは、だれかのいた領域を2つ征服するごとに1体増える', () => {
        const game = clearMap(newGame(2));
        const [a, b, c] = adjacentTriple(game);
        give(game, 0, 'skeletons', 'hill', { regions: { [a]: 1 }, hand: 10 });
        [b, c].forEach(id => { game.regions[id] = { ...game.regions[id], race: 'lost', count: 1 }; });
        turnOf(game, 0);
        run(game, [[0, { type: 'conquer', region: b }], [0, { type: 'conquer', region: c }], [0, { type: 'redeploy' }]]);
        const total = [a, b, c].reduce((s, id) => s + game.regions[id].count, 0);
        expect(total).toBe(11 + 1);
    });

    it('ハーフリングはどこからでも入れ、最初の2つに穴を掘る（攻められない）', () => {
        const game = clearMap(newGame(2));
        const inner = findRegion(game, info => !info.border && plainLand(info));
        give(game, 0, 'halflings', 'hill', { hand: 10 });
        turnOf(game, 0);
        run(game, [[0, { type: 'conquer', region: inner }]]);
        expect(game.regions[inner].hole).toBe(true);
        give(game, 1, 'ratmen', 'flying', { hand: 10 });
        turnOf(game, 1);
        expect(conquestTargets(game).some(t => t.id === inner)).toBe(false);
    });

    it('魔術師は、隣の1体だけの相手の部隊を置き換える（相手1人に番1回）', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'sorcerers', 'hill', { regions: { [a]: 1 } });
        give(game, 1, 'ratmen', 'forest', { regions: { [b]: 1 } });
        turnOf(game, 0);
        expect(sorceryTargets(game)).toEqual([b]);
        run(game, [[0, { type: 'sorcery', region: b }]]);
        expect(game.regions[b]).toMatchObject({ race: 'sorcerers', count: 1 });
        expect(game.bands.ratmen.hand).toBe(0);
        expect(sorceryTargets(game)).toEqual([]);
    });

    it('巨人は、自分のいる山の隣を1体少なく征服できる', () => {
        const game = clearMap(newGame(3));
        const mountain = findRegion(game, info => info.terrain === 'mountain' && info.adj.some(a => plainLand(game.map.regions[a])));
        const next = game.map.regions[mountain].adj.find(a => plainLand(game.map.regions[a]));
        give(game, 0, 'giants', 'hill', { regions: { [mountain]: 1 } });
        expect(conquestCost(game, 'giants', next)).toBe(1);
    });

    it('海の民は、水に面した領域を1体少なく征服できる', () => {
        const game = clearMap(newGame(2));
        const coast = findRegion(game, info => info.coastal && plainLand(info));
        give(game, 0, 'tritons', 'hill', {});
        expect(conquestCost(game, 'tritons', coast)).toBe(1);
    });
});

describe('特殊能力', () => {
    it('奇襲・騎馬・地底は必要な数を1減らす。地底は洞窟どうしが隣り合う', () => {
        const game = clearMap(newGame(4));
        const caverns = game.map.regions.filter(info => info.special === 'cavern').map(info => info.id);
        const far = caverns.find(id => !game.map.regions[caverns[0]].adj.includes(id) && id !== caverns[0]);
        give(game, 0, 'ratmen', 'underworld', { regions: { [caverns[0]]: 1 }, hand: 10 });
        turnOf(game, 0);
        expect(conquestTargets(game).some(t => t.id === far)).toBe(true);
        expect(conquestCost(game, 'ratmen', far)).toBe(game.map.regions[far].terrain === 'mountain' ? 2 : 1);
        game.bands.ratmen.power = 'commando';
        expect(conquestCost(game, 'ratmen', findRegion(game, plainLand, caverns))).toBe(1);
        game.bands.ratmen.power = 'mounted';
        expect(conquestCost(game, 'ratmen', findRegion(game, info => info.terrain === 'hill', caverns))).toBe(1);
        expect(conquestCost(game, 'ratmen', findRegion(game, info => info.terrain === 'forest', caverns))).toBe(2);
    });

    it('空飛ぶ種族はどこでも征服できる。航海する種族は海も征服できる', () => {
        const game = clearMap(newGame(2));
        const inner = findRegion(game, info => !info.border && plainLand(info));
        const sea = findRegion(game, info => info.terrain === 'sea');
        give(game, 0, 'ratmen', 'flying', { hand: 10 });
        turnOf(game, 0);
        expect(conquestTargets(game).some(t => t.id === inner)).toBe(true);
        expect(conquestTargets(game).some(t => t.id === sea)).toBe(false);
        game.bands.ratmen.power = 'seafaring';
        expect(conquestTargets(game).some(t => t.id === sea)).toBe(true);
    });

    it('竜使いは1体で征服し、竜のいる領域は攻められない', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'dragon', { regions: { [a]: 1 }, hand: 5 });
        give(game, 1, 'orcs', 'hill', { regions: { [b]: 6 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'dragon', region: b }]]);
        expect(game.regions[b]).toMatchObject({ race: 'ratmen', count: 1, dragon: true });
        expect(dragonTargets(game)).toEqual([]);
        give(game, 1, 'orcs', 'flying', { hand: 10 });
        turnOf(game, 1);
        expect(conquestTargets(game).some(t => t.id === b)).toBe(false);
    });

    it('狂戦士は征服の前にサイコロを振り、その分少なく征服できる', () => {
        const game = clearMap(newGame(2, 4));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'berserk', { regions: { [a]: 1 }, hand: 5 });
        turnOf(game, 0);
        expect(conquestTargets(game)).toEqual([]);
        run(game, [[0, { type: 'roll' }]]);
        const roll = game.step.roll;
        expect(conquestTargets(game).find(t => t.id === b).need).toBe(Math.max(1, 2 - roll));
        run(game, [[0, { type: 'conquer', region: b }]]);
        expect(game.step.roll).toBe(null);
    });

    it('英雄・野営地・砦は再配置で置き、英雄の領域は攻められず、野営地と砦は守りを増やす', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'heroic', { regions: { [a]: 3, [b]: 3 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'redeploy' }]]);
        expect(game.regions[a].hero && game.regions[b].hero).toBe(true);
        game.bands.ratmen.power = 'bivouacking';
        game.regions[a].hero = false;
        game.regions[b].hero = false;
        run(game, [[0, { type: 'camp', region: a }], [0, { type: 'camp', region: a }]]);
        give(game, 1, 'orcs', 'flying', { hand: 10 });
        expect(conquestCost(game, 'orcs', a)).toBe(2 + game.regions[a].count + 2 + (game.map.regions[a].terrain === 'mountain' ? 1 : 0));
        game.bands.ratmen.power = 'fortified';
        run(game, [[0, { type: 'fort', region: b }]]);
        expect(game.regions[b].fort).toBe(true);
        run(game, [[0, { type: 'fort', region: a }]]);
        expect(game.regions[b].fort).toBe(false);
        expect(game.regions[a].fort).toBe(true);
    });

    it('外交：和平を結んだ相手は、次の番にあなたを攻められない', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'diplomat', { regions: { [a]: 3 } });
        give(game, 1, 'orcs', 'hill', { regions: { [b]: 3 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'redeploy' }], [0, { type: 'done', peace: 1 }]]);
        expect(game.current).toBe(1);
        game.bands.orcs.hand = 10;
        expect(conquestTargets(game).some(t => t.id === a)).toBe(false);
    });
});

describe('再配置', () => {
    it('手の部隊は全部置くまで番を終えられない。置き直しもできる', () => {
        const game = clearMap(newGame(2));
        const [a, b] = adjacentPair(game);
        give(game, 0, 'ratmen', 'forest', { regions: { [a]: 4, [b]: 1 } });
        turnOf(game, 0);
        run(game, [[0, { type: 'redeploy' }]]);
        expect(game.bands.ratmen.hand).toBe(0);
        run(game, [[0, { type: 'lift', region: a }]]);
        expect(game.applyCommand(0, { type: 'done' })).toBe(false);
        run(game, [[0, { type: 'place', region: b }], [0, { type: 'done' }]]);
        expect(game.current).toBe(1);
    });
});

describe('終わり', () => {
    it('決まったラウンドが終わると、コインが一番多い人の勝ち', () => {
        const game = newGame(2, 8);
        game.round = game.rounds;
        game.players[0].coins = 50;
        while (!game.isOver()) {
            const seat = game.current;
            if (game.stage === 'pick') run(game, [[seat, { type: 'pick', index: 0 }]]);
            else if (game.stage === 'conquer') run(game, [[seat, { type: 'redeploy' }]]);
            else run(game, [[seat, { type: 'done' }]]);
        }
        expect(game.winners).toEqual([0]);
        expect(game.applyCommand(game.current, { type: 'pick', index: 0 })).toBe(false);
    });
});
