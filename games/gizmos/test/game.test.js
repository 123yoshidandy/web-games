import { describe, it, expect } from 'vitest';
import Game, {
    CARDS, COLORS, countEnergy, limitsOf, pointsOf, costFor, rankPlayers, END_GIZMOS
} from '../public/js/game.js';
import { STARTING_CARDS } from '../public/js/cards.js';
import { players, energy, snapshot, putOnDisplay, giveBuilt, giveArchive } from './helpers.js';

// 番号で指すカード（cards.js の並び）
const C = {
    convYellowAnyBlack: 4,      // 黒・レベル1：黄1個を好きな色に
    convYellowAnyBlue: 9,       // 青・レベル1：黄1個を好きな色に
    pickBlueDraw: 12,           // 黒・レベル1：青を取ったら1個引く
    pickRedDraw: 13,            // 青・レベル1：赤を取ったら1個引く
    filePickBlack: 20,          // 黒・レベル1：保管したら1個取る
    upStorageResearch: 24,      // 黒・レベル1：エネルギー+1・研究+1
    upStorageArchive: 28,       // 黒・レベル1：エネルギー+1・保管庫+1
    buildBluePick: 32,          // 黒・レベル1：青のギズモを建てたら1個取る
    buildRedVp: 36,             // 黒・レベル1：赤のギズモを建てたら得点1
    buildBlackVp: 37,           // 青・レベル1：黒のギズモを建てたら得点1
    archivePick2: 44,           // 黒・レベル2：保管庫から建てたら2回取る
    convRedAny2: 55,            // 黄・レベル2：赤1〜2個を好きな色に
    doubleRedBlue: 57,          // 青・レベル2：赤1個を赤2個に
    upL2: 40,                   // 黒・レベル2：エネルギー+2・保管庫+1・研究+2
    storage4: 76,               // 黒・レベル3：エネルギー+4
    anyAny: 78,                 // 赤・レベル3：何色でも1個を好きな色に
    fileVp: 84,                 // 黒・レベル3：保管したら得点1
    fileDraw3: 86,              // 青・レベル3：保管したら3個引く
    discountL2: 90,             // 青・レベル3：レベル2が1個安い
    freeBuild: 94,              // 青・レベル3：赤か黄を建てたら、レベル1を無料で建てる
    blockResearch: 96,          // 黒・レベル3：もう研究できない（8点）
    blockFile: 98,              // 青・レベル3：もう保管できない（7点）
    discountArchive: 102,       // 青・レベル3：保管庫から建てると1個安い
    discountResearch: 104,      // 黒・レベル3：研究から建てると1個安い
    scoreEnergy: 108,           // 全色・レベル3：残りのエネルギーが点
    scoreTokens: 110            // 全色・レベル3：得点チップの点が点
};

const newGame = (n = 2, seed = 1) => new Game(players(n), { seed, startPlayer: 0 });

describe('カード', () => {
    it('最初のギズモ4枚と、レベル1〜3が36枚ずつ', () => {
        expect(CARDS).toHaveLength(112);
        expect(CARDS.filter(c => c.level === 0)).toHaveLength(4);
        [1, 2, 3].forEach(level => expect(CARDS.filter(c => c.level === level)).toHaveLength(36));
        CARDS.forEach((card, i) => expect(card.id).toBe(i));
    });

    it('レベルごとの費用と点の範囲が合っている', () => {
        CARDS.filter(c => c.level === 1).forEach(c => expect([c.cost, c.points]).toEqual([1, 1]));
        CARDS.filter(c => c.level === 2).forEach(c => expect([2, 3]).toContain(c.cost));
        CARDS.filter(c => c.level === 3).forEach(c => expect(c.cost).toBeGreaterThanOrEqual(4));
        CARDS.filter(c => c.level === 3).forEach(c => expect(c.cost).toBeLessThanOrEqual(7));
    });

    it('レベル1の種類の内訳（強化8・変換8・保管4・取る8・建てる8）', () => {
        const count = (type) => CARDS.filter(c => c.level === 1 && c.type === type).length;
        expect([count('upgrade'), count('converter'), count('file'), count('pick'), count('build')]).toEqual([8, 8, 4, 8, 8]);
    });
});

describe('準備', () => {
    it('列に6個、場に4・3・2枚、レベル3の山札は16枚から', () => {
        const game = newGame(3);
        expect(game.row.filter(Boolean)).toHaveLength(6);
        expect(countEnergy(game.dispenser)).toBe(52 - 6);
        expect([1, 2, 3].map(l => game.display[l].length)).toEqual([4, 3, 2]);
        expect(game.decks[1].length).toBe(32);
        expect(game.decks[2].length).toBe(33);
        expect(game.decks[3].length).toBe(14);
        game.players.forEach((p, i) => {
            expect(p.built).toEqual([STARTING_CARDS[i]]);
            expect(limitsOf(p)).toEqual({ storage: 5, archive: 1, research: 3 });
        });
    });

    it('同じシードなら同じ並び・違うシードなら違う並び', () => {
        expect(snapshot(newGame(2, 5))).toBe(snapshot(newGame(2, 5)));
        expect(snapshot(newGame(2, 5))).not.toBe(snapshot(newGame(2, 6)));
    });

    it('人数は2〜4人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(5))).toThrow();
    });
});

describe('保管', () => {
    it('場のギズモを保管庫に置き、補充する。最初のギズモで1個引く', () => {
        const game = newGame();
        const card = game.display[1][0];
        const deckTop = game.decks[1][0];
        expect(game.applyCommand(0, { type: 'file', card })).toBe(true);
        expect(game.players[0].archive).toEqual([card]);
        expect(game.display[1][0]).toBe(deckTop);
        expect(countEnergy(game.players[0].energy)).toBe(1);
        expect(game.current).toBe(1);
    });

    it('保管庫がいっぱいなら保管できない', () => {
        const game = newGame();
        giveArchive(game, 0, C.upL2);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'file', card: game.display[1][0] })).toBe(false);
        expect(game.lastError).toContain('保管庫');
        expect(snapshot(game)).toBe(before);
    });

    it('保管で働くギズモが、順に働く（1個取る は選ぶ）', () => {
        const game = newGame();
        giveBuilt(game, 0, C.filePickBlack, C.fileVp);
        game.applyCommand(0, { type: 'file', card: game.display[1][1] });
        // 引く・得点は自動。取るは選ぶので待つ
        expect(game.phase).toBe('chain');
        expect(game.players[0].vp).toBe(1);
        expect(countEnergy(game.players[0].energy)).toBe(1);
        const slot = game.row.findIndex(Boolean);
        expect(game.applyCommand(0, { type: 'use', gizmo: C.filePickBlack, slot })).toBe(true);
        expect(countEnergy(game.players[0].energy)).toBe(2);
        expect(game.current).toBe(1);
    });
});

describe('取る', () => {
    it('列から1個取り、ディスペンサーから補充する', () => {
        const game = newGame();
        const color = game.row[2];
        expect(game.applyCommand(0, { type: 'pick', slot: 2 })).toBe(true);
        expect(game.players[0].energy[color]).toBe(1);
        expect(game.row.filter(Boolean)).toHaveLength(6);
        expect(countEnergy(game.dispenser)).toBe(52 - 7);
    });

    it('エネルギーが上限なら取れない', () => {
        const game = newGame();
        game.players[0].energy = energy({ red: 5 });
        expect(game.applyCommand(0, { type: 'pick', slot: 0 })).toBe(false);
        expect(game.lastError).toContain('上限');
    });

    it('取った色で働くギズモが引く', () => {
        const game = newGame();
        giveBuilt(game, 0, C.pickRedDraw);
        game.row[0] = 'red';
        game.applyCommand(0, { type: 'pick', slot: 0 });
        expect(countEnergy(game.players[0].energy)).toBe(2);
        expect(game.current).toBe(1);
    });

    it('ランダムに引いたものでは、取ったときのギズモは働かない', () => {
        const game = newGame();
        giveBuilt(game, 0, C.pickRedDraw);
        game.dispenser = energy({ red: 10 });
        game.row = ['blue', 'blue', 'blue', 'blue', 'blue', 'blue'];
        game.applyCommand(0, { type: 'file', card: game.display[1][0] });
        expect(game.players[0].energy.red).toBe(1);
        expect(countEnergy(game.players[0].energy)).toBe(1);
    });
});

describe('建てる', () => {
    it('その色のエネルギーを払い、ディスペンサーに戻す', () => {
        const game = newGame();
        putOnDisplay(game, 2, 0, C.upL2);
        game.players[0].energy = energy({ black: 3, red: 1 });
        const dispenser = countEnergy(game.dispenser);
        expect(game.applyCommand(0, { type: 'build', card: C.upL2, spend: { black: 3 } })).toBe(true);
        expect(game.players[0].built).toContain(C.upL2);
        expect(game.players[0].energy).toEqual(energy({ red: 1 }));
        expect(countEnergy(game.dispenser)).toBe(dispenser + 3);
        expect(limitsOf(game.players[0])).toEqual({ storage: 7, archive: 2, research: 5 });
    });

    it('足りない・余計に払う・持っていない払い方は断り、状態を変えない', () => {
        const game = newGame();
        putOnDisplay(game, 2, 0, C.upL2);
        game.players[0].energy = energy({ black: 2, red: 2 });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'build', card: C.upL2, spend: { black: 2 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', card: C.upL2, spend: { black: 2, red: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', card: C.upL2, spend: { black: 4 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', card: C.upL2 })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('保管庫から建てられ、保管庫から建てたら働くギズモが2回取る', () => {
        const game = newGame();
        giveBuilt(game, 0, C.archivePick2);
        giveArchive(game, 0, C.convYellowAnyBlue);
        game.players[0].energy = energy({ blue: 1 });
        expect(game.applyCommand(0, { type: 'build', card: C.convYellowAnyBlue })).toBe(true);
        expect(game.players[0].archive).toEqual([]);
        expect(game.phase).toBe('chain');
        game.applyCommand(0, { type: 'use', gizmo: C.archivePick2, slot: 0 });
        expect(game.phase).toBe('chain');
        game.applyCommand(0, { type: 'use', gizmo: C.archivePick2, slot: 1 });
        expect(countEnergy(game.players[0].energy)).toBe(2);
        expect(game.current).toBe(1);
    });

    it('建てたギズモ自身は、その建てた行動では働かない', () => {
        const game = newGame();
        // 「保管庫から建てたら2回取る」を保管庫から建てても、自分では働かない
        giveArchive(game, 0, C.archivePick2);
        game.players[0].energy = energy({ black: 3 });
        game.applyCommand(0, { type: 'build', card: C.archivePick2 });
        expect(game.players[0].built).toContain(C.archivePick2);
        expect(countEnergy(game.players[0].energy)).toBe(0);
        expect(game.current).toBe(1);
    });

    it('空きが足りないときは、引くと取るのどちらを先に使うかを選ばせる', () => {
        const game = newGame();
        giveBuilt(game, 0, C.filePickBlack);
        game.players[0].energy = energy({ red: 4 });
        game.applyCommand(0, { type: 'file', card: game.display[1][0] });
        expect(game.phase).toBe('chain');
        expect(game.usablePending().map(e => e.gizmo).sort((a, b) => a - b)).toEqual([0, C.filePickBlack]);
    });

    it('同じ手番に、建てたギズモが別の行動で働く', () => {
        const game = newGame();
        // 青のギズモを建てたら1個取る、を持つ。青のギズモを建てる → 1個取る
        giveBuilt(game, 0, C.buildBluePick);
        putOnDisplay(game, 1, 0, C.pickRedDraw);   // 青のギズモ：赤を取ったら1個引く
        game.players[0].energy = energy({ blue: 1 });
        game.row[0] = 'red';
        game.applyCommand(0, { type: 'build', card: C.pickRedDraw });
        expect(game.phase).toBe('chain');
        game.applyCommand(0, { type: 'use', gizmo: C.buildBluePick, slot: 0 });
        // 建てたばかりのギズモが、取った赤で働いて1個引く
        expect(countEnergy(game.players[0].energy)).toBe(2);
        expect(game.used).toEqual([]);
        expect(game.current).toBe(1);
    });

    it('連鎖を途中でやめられる', () => {
        const game = newGame();
        giveBuilt(game, 0, C.buildBluePick);
        putOnDisplay(game, 1, 0, C.pickRedDraw);
        game.players[0].energy = energy({ blue: 1 });
        game.applyCommand(0, { type: 'build', card: C.pickRedDraw });
        expect(game.applyCommand(0, { type: 'stop' })).toBe(true);
        expect(game.current).toBe(1);
    });

    it('全色のギズモは何色でも払え、建てたときの条件では全色として数える', () => {
        const game = newGame();
        giveBuilt(game, 0, C.buildRedVp, C.buildBlackVp);
        putOnDisplay(game, 3, 0, C.scoreEnergy);
        game.players[0].energy = energy({ red: 2, yellow: 2, blue: 2, black: 1 });
        expect(game.applyCommand(0, { type: 'build', card: C.scoreEnergy, spend: { red: 2, yellow: 2, blue: 2, black: 1 } })).toBe(true);
        expect(game.players[0].vp).toBe(2);
    });
});

describe('変換', () => {
    it('黄1個を好きな色として払える', () => {
        const game = newGame();
        giveBuilt(game, 0, C.convYellowAnyBlack);
        putOnDisplay(game, 1, 0, C.pickRedDraw); // 青・費用1
        game.players[0].energy = energy({ yellow: 1 });
        expect(game.applyCommand(0, { type: 'build', card: C.pickRedDraw, spend: { yellow: 1 } })).toBe(true);
        expect(game.players[0].energy.yellow).toBe(0);
    });

    it('公式の例：黄→赤、赤を2個に、赤2個を青2個にして、黄1個で青2の費用を払う', () => {
        const game = newGame();
        giveBuilt(game, 0, C.convYellowAnyBlue, C.doubleRedBlue, C.convRedAny2);
        // 青で費用2のギズモ（レベル2：取ったら引く）
        const target = CARDS.find(c => c.level === 2 && c.color === 'blue' && c.cost === 2).id;
        putOnDisplay(game, 2, 0, target);
        game.players[0].energy = energy({ yellow: 1 });
        expect(game.applyCommand(0, { type: 'build', card: target, spend: { yellow: 1 } })).toBe(true);
        expect(game.players[0].energy).toEqual(energy());
    });

    it('変換は1巡に1回だけ', () => {
        const game = newGame();
        giveBuilt(game, 0, C.convYellowAnyBlack, C.freeBuild);
        game.used = [C.convYellowAnyBlack];
        putOnDisplay(game, 1, 0, C.pickRedDraw);
        game.players[0].energy = energy({ yellow: 1 });
        expect(game.applyCommand(0, { type: 'build', card: C.pickRedDraw, spend: { yellow: 1 } })).toBe(false);
    });

    it('同じ色を2個にする変換で、少ない個数で払える', () => {
        const game = newGame();
        giveBuilt(game, 0, C.doubleRedBlue);
        const target = CARDS.find(c => c.level === 2 && c.color === 'red' && c.cost === 3).id;
        putOnDisplay(game, 2, 0, target);
        game.players[0].energy = energy({ red: 2 });
        expect(game.applyCommand(0, { type: 'build', card: target, spend: { red: 2 } })).toBe(true);
    });
});

describe('研究', () => {
    it('研究の数だけ引き、1枚を建て、残りを山札の下に戻す（研究からの割引）', () => {
        const game = newGame();
        giveBuilt(game, 0, C.discountResearch);
        const top = game.decks[1].slice(0, 3);
        game.players[0].energy = energy();
        expect(game.applyCommand(0, { type: 'research', level: 1 })).toBe(true);
        expect(game.phase).toBe('research');
        expect(game.research.cards).toEqual(top);
        // 割引で費用0になる
        expect(costFor(game.players[0], CARDS[top[0]], 'research')).toBe(0);
        expect(game.applyCommand(0, { type: 'researchBuild', card: top[0] })).toBe(true);
        expect(game.players[0].built).toContain(top[0]);
        expect(game.decks[1].slice(-2)).toEqual(top.slice(1));
    });

    it('研究で保管すると、保管したときのギズモが働く', () => {
        const game = newGame();
        const top = game.decks[2][0];
        game.applyCommand(0, { type: 'research', level: 2 });
        expect(game.applyCommand(0, { type: 'researchFile', card: top })).toBe(true);
        expect(game.players[0].archive).toEqual([top]);
        expect(countEnergy(game.players[0].energy)).toBe(1);
    });

    it('何も取らずに終えられる。山札の枚数が研究の数より少なければ、あるだけ引く', () => {
        const game = newGame();
        game.decks[3] = game.decks[3].slice(0, 2);
        game.applyCommand(0, { type: 'research', level: 3 });
        expect(game.research.cards).toHaveLength(2);
        expect(game.applyCommand(0, { type: 'researchSkip' })).toBe(true);
        expect(game.decks[3]).toHaveLength(2);
        expect(game.current).toBe(1);
    });
});

describe('強化', () => {
    it('もう研究できない・もう保管できない', () => {
        const game = newGame();
        giveBuilt(game, 0, C.blockResearch, C.blockFile);
        expect(game.applyCommand(0, { type: 'research', level: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'file', card: game.display[1][0] })).toBe(false);
    });

    it('レベル2・保管庫からの割引は重なる', () => {
        const game = newGame();
        giveBuilt(game, 0, C.discountL2, C.discountArchive);
        expect(costFor(game.players[0], CARDS[C.upL2], 'archive')).toBe(1);
        expect(costFor(game.players[0], CARDS[C.upL2], 'display')).toBe(2);
    });

    it('残りのエネルギー・得点チップの点になるギズモ', () => {
        const game = newGame();
        const p = game.players[0];
        giveBuilt(game, 0, C.scoreEnergy, C.scoreTokens);
        p.energy = energy({ red: 3, blue: 1 });
        p.vp = 5;
        // 最初のギズモ0点 + 4 + 5 + チップ5
        expect(pointsOf(p)).toBe(14);
    });

    it('レベル1を無料で建てる（保管庫からでも）', () => {
        const game = newGame();
        giveBuilt(game, 0, C.freeBuild);
        giveArchive(game, 0, C.upStorageArchive);
        const red = CARDS.find(c => c.level === 1 && c.color === 'red').id;
        putOnDisplay(game, 1, 0, red);
        game.players[0].energy = energy({ red: 1 });
        game.applyCommand(0, { type: 'build', card: red });
        expect(game.phase).toBe('chain');
        expect(game.applyCommand(0, { type: 'use', gizmo: C.freeBuild, card: C.upStorageArchive })).toBe(true);
        expect(game.players[0].built).toContain(C.upStorageArchive);
        expect(game.players[0].energy).toEqual(energy());
    });
});

describe('終わり', () => {
    it('16枚建てたら、その巡の終わりで終わる', () => {
        const game = newGame(3);
        const p = game.players[1];
        const ids = CARDS.filter(c => c.level === 1).slice(0, END_GIZMOS - 2).map(c => c.id);
        giveBuilt(game, 1, ...ids);
        putOnDisplay(game, 1, 0, CARDS.find(c => c.level === 1 && c.color === 'red' && !p.built.includes(c.id)).id);
        game.applyCommand(0, { type: 'pick', slot: 0 });
        p.energy = energy({ red: 1 });
        game.applyCommand(1, { type: 'build', card: game.display[1][0] });
        if (game.phase === 'chain') game.applyCommand(1, { type: 'stop' });
        expect(p.built.length).toBe(END_GIZMOS);
        expect(game.finalRound).toBe(true);
        expect(game.isOver()).toBe(false);
        game.applyCommand(2, { type: 'pick', slot: 0 });
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toBe('gizmos');
    });

    it('レベル3を4枚建てたら、最後の巡になる', () => {
        const game = newGame(2);
        giveBuilt(game, 1, C.storage4, C.fileVp, C.fileDraw3);
        game.applyCommand(0, { type: 'pick', slot: 0 });
        game.players[1].energy = energy({ red: 4 });
        giveArchive(game, 1, C.anyAny);
        game.applyCommand(1, { type: 'build', card: C.anyAny });
        expect(game.isOver()).toBe(true);
    });

    it('同点なら、建てた枚数・残りのエネルギー・最初の手番から遠い人の順', () => {
        const game = newGame(3);
        const [a, b, c] = game.players;
        expect(rankPlayers(game.players, 0)[0].id).toBe(2);
        b.energy = energy({ red: 1 });
        expect(rankPlayers(game.players, 0)[0].id).toBe(1);
        giveBuilt(game, 0, C.pickRedDraw);
        a.vp = 0;
        c.vp = 1;
        expect(rankPlayers(game.players, 0)[0].id).toBe(0);
    });
});

describe('操作の入口', () => {
    it('手番でない人・違う場面の操作は断り、状態を変えない', () => {
        const game = newGame();
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'pick', slot: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'researchSkip' })).toBe(false);
        expect(game.applyCommand(0, { type: 'use', gizmo: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'pick', slot: 9 })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', card: 'x' })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', card: game.display[1][0], spend: { gold: 1 } })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録するのは決まった項目だけ', () => {
        const game = newGame();
        game.applyCommand(0, { type: 'pick', slot: 1, extra: 'x' });
        expect(game.commands).toEqual([{ playerId: 0, command: { type: 'pick', slot: 1 } }]);
    });

    it('すべての色が4色そろっている', () => {
        expect(COLORS).toEqual(['red', 'yellow', 'blue', 'black']);
    });
});
