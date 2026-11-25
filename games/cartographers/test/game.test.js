import { describe, it, expect } from 'vitest';
import Game, {
    SEASONS, CELLS, RUIN_SET, newBoard, legalPlacements, mustFallback, soloAmbushCells, openRuins, exploreCard, ambushCard
} from '../public/js/game.js';
import { EDICT_CARDS, EXPLORE_CARDS } from '../public/js/cards.js';
import { orientations } from '../public/js/shapes.js';
import { board, fullBoard, cell, players, makeGame, setCard, snapshot } from './helpers.js';

describe('準備', () => {
    it('地図には山5つと廃墟6つがあり、得点カードは組ごとに1枚', () => {
        const game = makeGame(2, 3);
        expect(game.players[0].board.filter(t => t === 'mountain').length).toBe(5);
        expect(RUIN_SET.size).toBe(6);
        const groups = game.edicts.map(id => EDICT_CARDS.find(e => e.id === id).group);
        expect(new Set(groups).size).toBe(4);
    });

    it('季節の山札は、探索カード13枚と襲撃カード1枚', () => {
        const game = makeGame(2, 3);
        const all = [...game.deck, game.card];
        // めくった分（廃墟など）もあるので、合計が14枚以下で、襲撃は1枚まで
        expect(all.length + game.drawCount - 1).toBe(14);
        expect(EXPLORE_CARDS.length).toBe(11);
    });

    it('同じシードなら同じ並びになる', () => {
        expect(snapshot(makeGame(3, 9))).toBe(snapshot(makeGame(3, 9)));
    });

    it('形の向きの数', () => {
        expect(orientations(exploreCard('fishing').variants[0].cells).length).toBe(2);
        expect(orientations(exploreCard('farmland').variants[1].cells).length).toBe(1);
        expect(orientations(exploreCard('treetop').variants[0].cells).length).toBe(8);
    });
});

describe('探索カードを描く', () => {
    it('選んだ組の形を、回転・裏返しして空いたマスに描ける。コインのつく形ならコインを得る', () => {
        const game = makeGame(2);
        setCard(game, 'river');
        expect(game.applyCommand(0, { type: 'place', variant: 0, cells: [cell(10, 0), cell(10, 1), cell(10, 2)] })).toBe(true);
        expect(game.players[0].board[cell(10, 1)]).toBe('water');
        expect(game.players[0].shapeCoins).toBe(1);
        expect(game.pending).toEqual([1]);
    });

    it('形が合わない・山・描いたマス・地図の外には描けず、状態も変わらない', () => {
        const game = makeGame(2);
        setCard(game, 'river');
        game.players[0].board[cell(0, 0)] = 'forest';
        const before = snapshot(game);
        [
            { type: 'place', variant: 0, cells: [cell(10, 0), cell(10, 1)] },
            { type: 'place', variant: 0, cells: [cell(10, 0), cell(10, 1), cell(9, 3)] },
            { type: 'place', variant: 0, cells: [cell(1, 2), cell(1, 3), cell(1, 4)] },
            { type: 'place', variant: 0, cells: [cell(0, 0), cell(1, 0), cell(2, 0)] },
            { type: 'place', variant: 0, cells: [CELLS, CELLS + 1, CELLS + 2] },
            { type: 'place', variant: 5, cells: [cell(10, 0), cell(10, 1), cell(10, 2)] },
            { type: 'place', fallback: true, terrain: 'forest', cells: [cell(10, 0)] },
            { type: 'monster', cells: [cell(10, 0)] }
        ].forEach(command => expect(game.applyCommand(0, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('全員が描いたら、時間が進んで次のカードになる', () => {
        const game = makeGame(2, 5);
        setCard(game, 'hamlet');
        const time = game.time;
        game.applyCommand(0, { type: 'place', variant: 0, cells: [cell(0, 0), cell(1, 0), cell(1, 1)] });
        expect(game.time).toBe(time);
        game.applyCommand(1, { type: 'place', variant: 0, cells: [cell(0, 0), cell(1, 0), cell(1, 1)] });
        expect(game.time === time + 1 || game.season === 1).toBe(true);
        expect(game.pending.length > 0 || game.isOver()).toBe(true);
    });

    it('どの形も描けないときだけ、山以外の地形を 1×1 で描ける', () => {
        const game = makeGame(1);
        setCard(game, 'fishing');
        game.players[0].board = fullBoard('farm', [cell(0, 0), cell(5, 0), cell(10, 10)]);
        expect(mustFallback(game.players[0].board, exploreCard('fishing'), false)).toBe(true);
        expect(game.applyCommand(0, { type: 'place', fallback: true, terrain: 'mountain', cells: [cell(0, 0)] })).toBe(false);
        expect(game.applyCommand(0, { type: 'place', fallback: true, terrain: 'monster', cells: [cell(0, 0)] })).toBe(true);
        expect(game.players[0].board[cell(0, 0)]).toBe('monster');
    });
});

describe('廃墟', () => {
    it('廃墟の条件があると、空いた廃墟のマスにかけて描く', () => {
        const game = makeGame(1);
        setCard(game, 'river', { ruins: true });
        expect(game.applyCommand(0, { type: 'place', variant: 0, cells: [cell(10, 0), cell(10, 1), cell(10, 2)] })).toBe(false);
        expect(game.lastError).toContain('廃墟');
        // 廃墟 (1,5) を含む縦の3マス
        expect(game.applyCommand(0, { type: 'place', variant: 0, cells: [cell(0, 5), cell(1, 5), cell(2, 5)] })).toBe(true);
    });

    it('空いた廃墟が残っていなければ、1×1 になる', () => {
        const b = newBoard();
        RUIN_SET.forEach(c => { b[c] = 'farm'; });
        expect(openRuins(b).length).toBe(0);
        expect(mustFallback(b, exploreCard('river'), true)).toBe(true);
        expect(mustFallback(b, exploreCard('river'), false)).toBe(false);
    });

    it('置ける場所は、廃墟にかかるものだけに絞られる', () => {
        const all = legalPlacements(newBoard(), exploreCard('fishing').variants[0].cells);
        const ruins = legalPlacements(newBoard(), exploreCard('fishing').variants[0].cells, { ruins: true });
        expect(ruins.length).toBeLessThan(all.length);
        expect(ruins.every(cells => cells.some(c => RUIN_SET.has(c)))).toBe(true);
    });
});

describe('山のコイン', () => {
    it('山の上下左右が埋まったら、コインを1枚得る', () => {
        const game = makeGame(1);
        setCard(game, 'farmland');
        game.players[0].board = board(['', '', '', '', '.....A', '....A.A']);
        // 山 (5,5) の下を埋める
        expect(game.applyCommand(0, { type: 'place', variant: 0, cells: [cell(6, 5), cell(7, 5)] })).toBe(true);
        expect(game.players[0].mountainCoins).toBe(1);
        expect(game.coinsOf(game.players[0])).toBe(2);
    });
});

describe('襲撃', () => {
    it('ソロでは、示された角から回さずに描ける場所に描く', () => {
        // ゴブリン：右下の角から反時計回り（右の端を上へ）
        expect(soloAmbushCells(newBoard(), ambushCard('goblin')).sort((a, b) => a - b)).toEqual([cell(8, 8), cell(9, 9), cell(10, 10)]);
        // バグベア：右上の角から時計回り（右の端を下へ）
        expect(soloAmbushCells(newBoard(), ambushCard('bugbear')).sort((a, b) => a - b)).toEqual([cell(0, 8), cell(0, 10), cell(1, 8), cell(1, 10)]);
        // 端が埋まっていれば、内側へずらす
        const b = newBoard();
        for (let r = 0; r < 11; r++) b[cell(r, 10)] = 'farm';
        expect(soloAmbushCells(b, ambushCard('goblin')).sort((a, b2) => a - b2)).toEqual([cell(8, 7), cell(9, 8), cell(10, 9)]);
    });

    it('多人数では、隣の人の地図に異形を描く（回転してよい）', () => {
        const game = makeGame(3, 2);
        game.card = { kind: 'ambush', id: 'gnoll' };
        game.phase = 'ambush';
        game.targets = [2, 0, 1];   // 時計回り
        game.pending = [0, 1, 2];
        // コの字を回した形
        const cells = [cell(0, 0), cell(0, 1), cell(0, 2), cell(1, 0), cell(1, 2)];
        expect(game.applyCommand(0, { type: 'monster', cells })).toBe(true);
        expect(game.players[2].board[cell(0, 0)]).toBe('monster');
        expect(game.players[0].board[cell(0, 0)]).toBe(null);
        expect(game.applyCommand(1, { type: 'monster', cells: [cell(0, 0)] })).toBe(false);
    });

    it('多人数の襲撃が出ると、描く相手が決まり、描ける人が待ちになる', () => {
        for (let seed = 1; seed < 60; seed++) {
            const game = makeGame(3, seed);
            let guard = 0;
            while (game.phase === 'explore' && guard++ < 40) {
                game.pending.slice().forEach(seat => game.applyCommand(seat, game.sampleCommands(seat)[0]));
            }
            if (game.phase !== 'ambush') continue;
            const card = ambushCard(game.card.id);
            expect(game.targets).toEqual(card.clockwise ? [2, 0, 1] : [1, 2, 0]);
            return;
        }
        throw new Error('襲撃が出ませんでした');
    });
});

describe('季節と終わり', () => {
    it('季節の得点は、勅令2つ＋コイン−異形の減点', () => {
        const game = makeGame(1, 4);
        const p = game.players[0];
        p.shapeCoins = 2;
        p.board = board(['', '', '', '', '', '.......X']);
        game.endSeason();
        const s = p.seasons[0];
        expect(s.coins).toBe(2);
        expect(s.monsters).toBe(4);
        expect(s.total).toBe(s.edicts[0] + s.edicts[1] + 2 - 4);
        expect(game.season).toBe(1);
    });

    it('4つの季節が終わると決着する。同点なら異形の減点が少ない人', () => {
        const game = makeGame(2, 4);
        game.season = 3;
        game.players[0].seasons = [{ total: 10, monsters: 3 }, { total: 0, monsters: 0 }, { total: 0, monsters: 0 }];
        game.players[1].seasons = [{ total: 10, monsters: 1 }, { total: 0, monsters: 0 }, { total: 0, monsters: 0 }];
        game.players.forEach(p => { p.board = newBoard(); p.shapeCoins = 0; });
        game.endSeason();
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1]);
    });

    it('季節の長さは 8・8・7・6', () => {
        expect(SEASONS.map(s => s.time)).toEqual([8, 8, 7, 6]);
    });

    it('人数を変えても、最後まで進み、記録から同じ状態を再現できる', () => {
        for (let n = 1; n <= 4; n++) {
            for (let seed = 1; seed <= 5; seed++) {
                const game = new Game(players(n), { seed });
                let guard = 0;
                while (!game.isOver() && guard++ < 1000) {
                    const seat = game.pending[0];
                    expect(game.applyCommand(seat, game.sampleCommands(seat).at(-1))).toBe(true);
                }
                expect(game.isOver()).toBe(true);
                expect(game.players[0].seasons.length).toBe(4);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('描く番でない人の操作と、知らない操作は断る', () => {
        const game = makeGame(2, 6);
        setCard(game, 'hamlet');
        game.applyCommand(0, { type: 'place', variant: 0, cells: [cell(0, 0), cell(1, 0), cell(1, 1)] });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'place', variant: 0, cells: [cell(0, 4), cell(1, 4), cell(1, 5)] })).toBe(false);
        expect(game.applyCommand(1, { type: 'nope' })).toBe(false);
        expect(game.applyCommand(1, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});
