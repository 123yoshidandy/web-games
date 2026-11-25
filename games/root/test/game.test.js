import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep, cpuActors } from '../public/js/cpu-player.js';
import { CLEARINGS, PATHS, FORESTS, CARDS, adjacency, QUESTS } from '../public/js/data.js';
import { makeGame, players, finishSetup, clearMap, setTurn, fixDice, snapshot } from './helpers.js';

const cardId = (key) => CARDS.find(c => c.key === key).id;

describe('部品', () => {
    it('秋の地図：空き地12・道18・建物の枠22・遺跡4・森7。四隅は対角でつながらない', () => {
        expect(CLEARINGS).toHaveLength(12);
        expect(PATHS).toHaveLength(18);
        expect(CLEARINGS.reduce((s, c) => s + c.slots, 0)).toBe(22);
        expect(CLEARINGS.filter(c => c.ruin)).toHaveLength(4);
        expect(FORESTS).toHaveLength(7);
        ['fox', 'rabbit', 'mouse'].forEach(s => expect(CLEARINGS.filter(c => c.suit === s)).toHaveLength(4));
        expect(adjacency[0]).toEqual([4, 8, 9]);
        expect(adjacency[11]).toEqual([3, 6, 8, 9, 10]);
    });

    it('共有の山札は54枚（支配4・待ち伏せ5）。クエストは15枚', () => {
        expect(CARDS).toHaveLength(54);
        expect(CARDS.filter(c => c.kind === 'dominance')).toHaveLength(4);
        expect(CARDS.filter(c => c.kind === 'ambush')).toHaveLength(5);
        expect(QUESTS).toHaveLength(15);
    });
});

describe('準備と進行', () => {
    it('全員が5枚ずつ持って始め、侯爵家は本拠と兵11体、鷲は対角の隅に止まり木と兵6体', () => {
        const game = finishSetup(makeGame());
        expect(game.phase).not.toBe('setup');
        const keep = game.keepClearing();
        expect([0, 1, 2, 3]).toContain(keep);
        expect(game.warriorsOnMap('marquise')).toBe(11);
        const opposite = { 0: 2, 1: 3, 2: 0, 3: 1 }[keep];
        expect(game.hasBuilding(opposite, 'eyrie', 'roost')).toBe(true);
        expect(game.warriors(opposite, 'eyrie')).toBe(6);
        expect(game.fs.alliance.supporters).toHaveLength(3);
        expect(game.fs.vagabond.items.length).toBe(4);
    });

    it('同じシードなら同じ展開になり、記録から同じ状態を再現できる', () => {
        const play = (seed) => {
            const game = new Game(players(['marquise', 'eyrie', 'alliance', 'vagabond'], true), { seed });
            let n = 0;
            while (!game.isOver() && n++ < 3000) runCpuStep(game, cpuActors(game)[0]);
            return game;
        };
        const a = play(11);
        const b = play(11);
        expect(snapshot(a)).toBe(snapshot(b));
        const saved = JSON.parse(JSON.stringify(a.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(a));
    });

    it('断った操作は状態を変えない（番でない人・知らない種類・合わない値・余計な数）', () => {
        const game = finishSetup(makeGame());
        const before = snapshot(game);
        const other = (game.turn + 1) % 4;
        expect(game.applyCommand(other, { type: 'next' })).toBe(false);
        expect(game.applyCommand(game.turn, { type: 'fly' })).toBe(false);
        expect(game.applyCommand(game.turn, { type: 'move', from: 0, to: 11, count: 1 })).toBe(false);
        expect(game.applyCommand(game.turn, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('ビューには、ほかの人の手札と連合の支持者の中身を入れない', () => {
        const game = finishSetup(makeGame());
        const view = createGameView(game, 0);
        expect(view.players[0].hand).toHaveLength(game.players[0].hand.length);
        view.players.slice(1).forEach(p => expect(p.hand).toBe(null));
        expect(view.alliance.supporters).toBe(null);
        expect(createGameView(game, game.seatOf.alliance).alliance.supporters).toHaveLength(3);
        expect(JSON.stringify(view)).not.toContain('"ruin":"');
    });
});

describe('支配と移動', () => {
    it('兵と建物の多い陣営が支配する。同数なら支配なし、鷲は同数でも支配する', () => {
        const game = finishSetup(makeGame());
        clearMap(game);
        game.map[4].warriors = { marquise: 2, alliance: 2 };
        expect(game.ruler(4)).toBe(null);
        game.map[4].warriors = { marquise: 2, eyrie: 1 };
        game.map[4].buildings = [{ faction: 'eyrie', kind: 'roost' }];
        expect(game.ruler(4)).toBe('eyrie');
        game.map[4].tokens = [{ faction: 'marquise', kind: 'wood' }];
        expect(game.ruler(4)).toBe('eyrie');
    });

    it('移動元か移動先を支配していないと動けない', () => {
        const game = finishSetup(makeGame());
        clearMap(game);
        setTurn(game, 'marquise', 'daylight');
        game.map[4].warriors = { marquise: 1, eyrie: 2 };
        game.map[0].warriors = { eyrie: 3 };
        game.map[1].buildings = [{ faction: 'marquise', kind: 'sawmill' }];
        const moves = game.legalActions(game.turn).filter(a => a.type === 'move');
        expect(moves.map(m => m.to).sort()).toEqual([1]);
    });
});

describe('戦闘', () => {
    const battleGame = () => {
        const game = finishSetup(makeGame(['marquise', 'eyrie', 'alliance']));
        clearMap(game);
        game.players.forEach(p => { p.hand = []; });
        return game;
    };

    it('攻撃側は大きい目、守り手は小さい目。打撃は兵の数まで。守り手に兵がいなければ追加の1打撃', () => {
        const game = battleGame();
        setTurn(game, 'marquise', 'daylight');
        game.map[4].warriors = { marquise: 2, eyrie: 3 };
        fixDice(game, [3, 1]);
        expect(game.applyCommand(game.turn, { type: 'battle', clearing: 4, defender: 'eyrie' })).toBe(true);
        expect(game.warriors(4, 'eyrie')).toBe(1);
        expect(game.warriors(4, 'marquise')).toBe(1);

        game.map[5].warriors = { marquise: 3 };
        game.map[5].buildings = [{ faction: 'eyrie', kind: 'roost' }];
        const score = game.players[game.turn].score;
        fixDice(game, [0, 0]);
        game.applyCommand(game.turn, { type: 'battle', clearing: 5, defender: 'eyrie' });
        expect(game.hasBuilding(5, 'eyrie', 'roost')).toBe(false);
        expect(game.players[game.turn].score).toBe(score + 1);
    });

    it('森林連合は守るとき大きい目を取る（ゲリラ戦）', () => {
        const game = battleGame();
        setTurn(game, 'marquise', 'daylight');
        game.map[4].warriors = { marquise: 3, alliance: 3 };
        fixDice(game, [3, 0]);
        game.applyCommand(game.turn, { type: 'battle', clearing: 4, defender: 'alliance' });
        expect(game.warriors(4, 'marquise')).toBe(0);
        expect(game.warriors(4, 'alliance')).toBe(3);
    });

    it('守り手は待ち伏せで2打撃。攻撃側は合う待ち伏せで打ち消せる', () => {
        const game = battleGame();
        setTurn(game, 'marquise', 'daylight');
        game.map[4].warriors = { marquise: 3, eyrie: 1 };
        game.players[game.seatOf.eyrie].hand = [cardId('ambush-bird')];
        game.applyCommand(game.turn, { type: 'battle', clearing: 4, defender: 'eyrie' });
        expect(game.actors()).toEqual([game.seatOf.eyrie]);
        fixDice(game, [0, 0]);
        game.applyCommand(game.seatOf.eyrie, { type: 'ambush', card: cardId('ambush-bird') });
        expect(game.warriors(4, 'marquise')).toBe(1);

        game.map[1].warriors = { marquise: 3, eyrie: 1 };
        game.players[game.seatOf.eyrie].hand = [cardId('ambush-mouse')];
        game.players[game.seatOf.marquise].hand = [CARDS.filter(c => c.key === 'ambush-bird')[1].id];
        game.applyCommand(game.turn, { type: 'battle', clearing: 1, defender: 'eyrie' });
        game.applyCommand(game.seatOf.eyrie, { type: 'ambush', card: cardId('ambush-mouse') });
        expect(game.actors()).toEqual([game.seatOf.marquise]);
        fixDice(game, [2, 0]);
        game.applyCommand(game.seatOf.marquise, { type: 'counter', card: CARDS.filter(c => c.key === 'ambush-bird')[1].id });
        expect(game.warriors(1, 'marquise')).toBe(3);
        expect(game.warriors(1, 'eyrie')).toBe(0);
    });

    it('野戦病院：除かれた兵を、合う印のカードで本拠に戻せる', () => {
        const game = battleGame();
        game.map[0].tokens = [{ faction: 'marquise', kind: 'keep' }];
        setTurn(game, 'eyrie', 'daylight', 'resolve');
        game.fs.eyrie.decree.battle = [{ card: null, suit: 'bird', vizier: true }];
        game.tt.decreeCol = 2;
        game.map[4].warriors = { marquise: 2, eyrie: 3 };
        const rabbit = cardId('visit-friends');
        game.players[game.seatOf.marquise].hand = [rabbit];
        fixDice(game, [3, 3]);
        game.applyCommand(game.turn, { type: 'battle', clearing: 4, defender: 'marquise' });
        expect(game.actors()).toEqual([game.seatOf.marquise]);
        game.applyCommand(game.seatOf.marquise, { type: 'hospital', card: rabbit });
        expect(game.warriors(0, 'marquise')).toBe(2);
    });
});

describe('侯爵家', () => {
    it('建設は、支配する空き地でつながった木材を払う。2つ目の製材所は木材1で1点', () => {
        const game = finishSetup(makeGame(['marquise', 'eyrie']));
        clearMap(game);
        game.map[0].tokens = [{ faction: 'marquise', kind: 'keep' }];
        game.map[0].buildings = [{ faction: 'marquise', kind: 'sawmill' }];
        game.map[4].buildings = [{ faction: 'marquise', kind: 'workshop' }];
        game.map[0].warriors = { marquise: 1 };
        game.map[9].warriors = { marquise: 1 };
        game.map[9].tokens = [{ faction: 'marquise', kind: 'wood' }];
        setTurn(game, 'marquise', 'daylight');
        const builds = game.legalActions(game.turn).filter(a => a.type === 'build' && a.kind === 'sawmill');
        expect(builds.map(b => b.clearing).sort((a, b) => a - b)).toEqual([4, 9]);
        game.applyCommand(game.turn, { type: 'build', kind: 'sawmill', clearing: 4 });
        expect(game.tokenCount('marquise', 'wood')).toBe(0);
        expect(game.players[game.turn].score).toBe(1);
        expect(game.tt.actions).toBe(2);
    });

    it('行軍は1回の行動で2回移動できる', () => {
        const game = finishSetup(makeGame(['marquise', 'eyrie']));
        setTurn(game, 'marquise', 'daylight');
        const move = game.legalActions(game.turn).find(a => a.type === 'move');
        game.applyCommand(game.turn, { type: 'move', from: move.from, to: move.to, count: 1 });
        expect(game.tt.actions).toBe(2);
        const second = game.legalActions(game.turn).find(a => a.type === 'move');
        game.applyCommand(game.turn, { type: 'move', from: second.from, to: second.to, count: 1 });
        expect(game.tt.actions).toBe(2);
        expect(game.tt.marchLeft).toBe(0);
    });
});

describe('鷲の王朝', () => {
    it('布告を果たせないと混乱：鳥の数だけ失点し、布告を捨てて指導者を替える', () => {
        const game = finishSetup(makeGame(['eyrie', 'alliance']));
        const e = game.fs.eyrie;
        const seat = game.seatOf.eyrie;
        game.players[seat].score = 5;
        clearMap(game);
        game.map[0].buildings = [{ faction: 'eyrie', kind: 'roost' }];
        game.map[0].warriors = { eyrie: 1 };
        const fox = cardId('anvil');
        e.decree.build.push({ card: fox, suit: 'fox', vizier: false });
        const leader = e.leader;
        setTurn(game, 'eyrie', 'daylight', 'craft');
        game.applyCommand(seat, { type: 'next' });
        // 徴兵と移動は果たせるので、順に果たす
        while (game.step === 'resolve') {
            const a = game.legalActions(seat).find(x => ['recruit', 'move', 'battle', 'build'].includes(x.type));
            game.applyCommand(seat, { ...a, count: 1 });
        }
        expect(game.step).toBe('leader');
        expect(game.players[seat].score).toBe(5 - 2);
        expect(e.decree.build).toHaveLength(LEADER_VIZIER_BUILD(leader));
        expect(game.discardPile).toContain(fox);
        const next = game.legalActions(seat).map(a => a.leader);
        expect(next).not.toContain(leader);
    });

    it('同数でも支配する（森の領主）', () => {
        const game = finishSetup(makeGame(['eyrie', 'alliance']));
        clearMap(game);
        game.map[6].warriors = { eyrie: 1, alliance: 1 };
        expect(game.rules('eyrie', 6)).toBe(true);
    });
});

// 指導者が建設の列に置く宰相の数
function LEADER_VIZIER_BUILD(leader) {
    return leader === 'despot' ? 1 : 0;
}

describe('森林連合', () => {
    it('同調者のある空き地に兵が入ると、合うカードを支持者に渡す（憤激）', () => {
        const game = finishSetup(makeGame(['marquise', 'alliance']));
        clearMap(game);
        game.map[0].warriors = { marquise: 2 };
        game.map[4].tokens = [{ faction: 'alliance', kind: 'sympathy' }];
        const rabbit = cardId('bake-sale');
        game.players[game.seatOf.marquise].hand = [rabbit];
        const before = game.fs.alliance.supporters.length;
        setTurn(game, 'marquise', 'daylight');
        game.applyCommand(game.turn, { type: 'move', from: 0, to: 4, count: 1 });
        expect(game.fs.alliance.supporters).toHaveLength(before + 1);
        expect(game.fs.alliance.supporters).toContain(rabbit);
    });

    it('暴動：同じ印の支持者2枚で、敵の駒を除いて拠点と兵を置き、官吏が1増える', () => {
        const game = finishSetup(makeGame(['marquise', 'alliance']));
        clearMap(game);
        const seat = game.seatOf.alliance;
        game.map[4].tokens = [{ faction: 'alliance', kind: 'sympathy' }];
        game.map[3].tokens = [{ faction: 'alliance', kind: 'sympathy' }];
        game.map[4].warriors = { marquise: 2 };
        game.map[4].buildings = [{ faction: 'marquise', kind: 'sawmill' }];
        game.fs.alliance.supporters = [cardId('bake-sale'), cardId('visit-friends')];
        setTurn(game, 'alliance', 'birdsong');
        expect(game.applyCommand(seat, { type: 'revolt', clearing: 4 })).toBe(true);
        expect(game.warriors(4, 'marquise')).toBe(0);
        expect(game.hasBuilding(4, 'alliance', 'base')).toBe(true);
        expect(game.warriors(4, 'alliance')).toBe(2);
        expect(game.fs.alliance.officers).toBe(1);
        expect(game.players[seat].score).toBe(1);
    });

    it('同調を広げる費用は、ほかの陣営の兵が3体以上いると1増える', () => {
        const game = finishSetup(makeGame(['marquise', 'alliance']));
        clearMap(game);
        game.map[4].warriors = { marquise: 3 };
        expect(game.spreadCost(4)).toBe(2);
        expect(game.spreadCost(5)).toBe(1);
    });
});

describe('放浪者', () => {
    it('探索：たいまつで遺跡のアイテムを取り1点。援助で関係が上がり点', () => {
        const game = finishSetup(makeGame(['marquise', 'vagabond']));
        clearMap(game);
        const seat = game.seatOf.vagabond;
        const vb = game.fs.vagabond;
        vb.forest = null;
        vb.clearing = 5;
        game.map[5].warriors = { marquise: 1 };
        vb.items = ['torch', 'boot', 'sword', 'tea'].map(type => ({ type, exhausted: false, damaged: false }));
        setTurn(game, 'vagabond', 'daylight');
        expect(game.applyCommand(seat, { type: 'explore' })).toBe(true);
        expect(game.map[5].ruin).toBe(null);
        expect(vb.items).toHaveLength(5);
        expect(game.players[seat].score).toBe(1);
        const fox = cardId('anvil');
        game.players[seat].hand = [fox];
        expect(game.applyCommand(seat, { type: 'aid', target: 'marquise', card: fox })).toBe(true);
        expect(vb.relations.marquise).toBe('amiable');
        expect(game.players[seat].score).toBe(2);
        expect(game.players[game.seatOf.marquise].hand).toContain(fox);
    });

    it('兵を除くと敵対し、敵対した陣営の駒を戦闘で除くと悪名の点', () => {
        const game = finishSetup(makeGame(['marquise', 'vagabond']));
        clearMap(game);
        const seat = game.seatOf.vagabond;
        const vb = game.fs.vagabond;
        vb.forest = null;
        vb.clearing = 4;
        game.map[4].warriors = { marquise: 3 };
        vb.items = ['sword', 'sword', 'crossbow', 'boot'].map(type => ({ type, exhausted: false, damaged: false }));
        game.players.forEach(p => { p.hand = []; });
        setTurn(game, 'vagabond', 'daylight');
        game.applyCommand(seat, { type: 'strike', target: 'marquise' });
        expect(vb.relations.marquise).toBe('hostile');
        expect(game.players[seat].score).toBe(0);
        fixDice(game, [2, 0]);
        game.applyCommand(seat, { type: 'battle', clearing: 4, defender: 'marquise' });
        expect(game.warriors(4, 'marquise')).toBe(0);
        expect(game.players[seat].score).toBe(2);
    });
});

describe('工作と支配のカード', () => {
    it('工房の印に合うカードを工作して、アイテムの点を得る。鷲はアイテムで1点だけ', () => {
        const game = finishSetup(makeGame(['marquise', 'eyrie']));
        clearMap(game);
        game.map[0].buildings = [{ faction: 'marquise', kind: 'workshop' }];
        const anvil = cardId('anvil');
        game.players[game.seatOf.marquise].hand = [anvil];
        setTurn(game, 'marquise', 'daylight');
        game.applyCommand(game.turn, { type: 'craft', card: anvil });
        expect(game.players[game.seatOf.marquise].score).toBe(2);
        expect(game.items.hammer).toBe(0);

        game.map[8].buildings = [{ faction: 'eyrie', kind: 'roost' }];
        const sack = cardId('mouse-in-sack');
        game.players[game.seatOf.eyrie].hand = [sack];
        game.fs.eyrie.leader = 'despot';
        // 布告を空にしておく（工作のあと自動で布告の実行に進み、混乱で失点しないように）
        game.fs.eyrie.decree = { recruit: [], move: [], battle: [], build: [] };
        setTurn(game, 'eyrie', 'daylight', 'craft');
        game.applyCommand(game.turn, { type: 'craft', card: sack });
        expect(game.players[game.seatOf.eyrie].score).toBe(1);
    });

    it('支配のカードを出すと点が増えなくなり、鳥の歌の初めに3つ支配していれば勝ち', () => {
        const game = finishSetup(makeGame(['marquise', 'eyrie']));
        const seat = game.seatOf.marquise;
        const dom = cardId('dominance-fox');
        game.players[seat].hand = [dom];
        game.players[seat].score = 12;
        setTurn(game, 'marquise', 'daylight');
        game.applyCommand(seat, { type: 'dominance', card: dom });
        game.scoreVP(seat, 5);
        expect(game.players[seat].score).toBe(12);
        clearMap(game);
        [0, 5, 7].forEach(c => { game.map[c].warriors = { marquise: 2 }; });
        game.startTurn(seat);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([seat]);
        expect(game.endReason).toBe('dominance');
    });

    it('30点に届いたら、その場で勝ち', () => {
        const game = finishSetup(makeGame(['marquise', 'eyrie']));
        game.scoreVP(game.seatOf.eyrie, 30);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([game.seatOf.eyrie]);
    });
});
