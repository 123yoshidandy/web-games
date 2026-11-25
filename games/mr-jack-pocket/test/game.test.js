import { describe, it, expect } from 'vitest';
import Game, { JACK, DETECTIVE, visibleSuspects, wallOf, pickOrder } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { SUSPECTS, CROSS_SUSPECT, TOKENS } from '../public/js/data.js';
import { UP, RIGHT, DOWN, LEFT, sightLine } from '../public/js/board.js';
import { newGame, setTiles, setFaces, snapshot } from './helpers.js';

describe('準備', () => {
    it('タイル9枚・刑事3人・ジャックとアリバイの山8枚', () => {
        const g = newGame(1);
        expect(new Set(g.tiles.map(t => t.suspect)).size).toBe(9);
        expect(g.detectives).toEqual({ holmes: 11, watson: 3, toby: 7 });
        expect(g.deck.length).toBe(8);
        expect(g.deck).not.toContain(g.jack);
        // 最初に刑事と向き合う3枚は、壁を刑事に向ける（最初はだれも見えない）
        expect([g.tiles[0].rot, g.tiles[2].rot, g.tiles[7].rot]).toEqual([LEFT, RIGHT, DOWN]);
        expect(visibleSuspects(g.tiles, g.detectives).size).toBe(0);
        expect(g.round).toBe(1);
        expect(g.actors()).toEqual([DETECTIVE]);
    });

    it('同じシードなら同じ並び', () => {
        expect(snapshot(newGame(5))).toBe(snapshot(newGame(5)));
        expect(newGame(5).jack === newGame(6).jack && snapshot(newGame(5)) === snapshot(newGame(6))).toBe(false);
    });

    it('アリバイカードの砂時計は合わせて8つ（ジャックの札を除いた山の分は、ジャックで変わる）', () => {
        expect(SUSPECTS.reduce((s, x) => s + x.hourglasses, 0)).toBe(8);
    });
});

describe('見える容疑者', () => {
    const open = (suspects, rot = UP) => suspects.map(suspect => ({ suspect, rot, cleared: false }));

    it('道のマスから、列や行をまっすぐ見る', () => {
        expect(sightLine(0)).toEqual({ from: UP, tiles: [0, 3, 6] });
        expect(sightLine(4)).toEqual({ from: RIGHT, tiles: [5, 4, 3] });
        expect(sightLine(7)).toEqual({ from: DOWN, tiles: [7, 4, 1] });
        expect(sightLine(11)).toEqual({ from: LEFT, tiles: [0, 1, 2] });
    });

    it('入る辺に壁があれば、そのタイルから見えない。出る辺に壁があれば、そのタイルまで見える', () => {
        const keys = SUSPECTS.map(s => s.key);
        const tiles = open(keys, RIGHT); // 壁はどれも右。上から見る列は、どこにもさえぎられない
        expect([...visibleSuspects(tiles, { holmes: 0 })].sort()).toEqual([keys[0], keys[3], keys[6]].sort());
        // 左から見る行：右に壁があるので、最初のタイルまで
        expect([...visibleSuspects(tiles, { holmes: 11 })]).toEqual([keys[0]]);
        // 右から見る行：入る辺に壁があるので、何も見えない
        expect(visibleSuspects(tiles, { holmes: 3 }).size).toBe(0);
    });

    it('無実のタイルは見えても数えないが、壁はさえぎる。十字路のタイルは無実になると壁がない', () => {
        const keys = SUSPECTS.map(s => s.key).filter(k => k !== CROSS_SUSPECT);
        const tiles = open([CROSS_SUSPECT, keys[0], keys[1], ...keys.slice(2)], UP);
        tiles[0].rot = RIGHT;
        expect([...visibleSuspects(tiles, { holmes: 11 })]).toEqual([CROSS_SUSPECT]);
        tiles[0].cleared = true;
        expect(wallOf(tiles[0])).toBe(null);
        expect([...visibleSuspects(tiles, { holmes: 11 })].sort()).toEqual([keys[0], keys[1]].sort());
        tiles[1].cleared = true;
        tiles[1].rot = RIGHT;
        expect([...visibleSuspects(tiles, { holmes: 11 })]).toEqual([]);
    });
});

describe('ラウンドと行動', () => {
    it('奇数ラウンドは刑事1・ジャック2・刑事1、偶数ラウンドは逆。偶数ラウンドは前の面を裏返す', () => {
        expect(pickOrder(1)).toEqual([DETECTIVE, JACK, JACK, DETECTIVE]);
        expect(pickOrder(2)).toEqual([JACK, DETECTIVE, DETECTIVE, JACK]);
        const g = newGame(3);
        const faces = g.tokens.map(t => t.face);
        setFaces(g, ['holmes', 'watson', 'rotate', 'joker']);
        g.applyCommand(DETECTIVE, { type: 'move', who: 'holmes', steps: 1 });
        g.applyCommand(JACK, { type: 'move', who: 'watson', steps: 1 });
        g.applyCommand(JACK, { type: 'joker', who: 'toby', steps: 0 });
        g.applyCommand(DETECTIVE, { type: 'rotate', tile: 4, rot: (g.tiles[4].rot + 1) % 4 });
        expect(g.round).toBe(2);
        expect(g.tokens.map(t => TOKENS[g.tokens.indexOf(t)][t.face])).toEqual(['alibi', 'toby', 'exchange', 'rotate']);
        expect(g.actors()).toEqual([JACK]);
        expect(faces.length).toBe(4);
    });

    it('刑事は時計回りに1〜2マス。使った行動タイルは、そのラウンドにはもう使えない', () => {
        const g = newGame(2);
        setFaces(g, ['holmes', 'watson', 'exchange', 'joker']);
        expect(g.applyCommand(DETECTIVE, { type: 'move', who: 'holmes', steps: 3 })).toBe(false);
        expect(g.applyCommand(DETECTIVE, { type: 'move', who: 'toby', steps: 1 })).toBe(false); // トビーの面は出ていない
        expect(g.applyCommand(JACK, { type: 'move', who: 'holmes', steps: 1 })).toBe(false); // 番ではない
        expect(g.applyCommand(DETECTIVE, { type: 'move', who: 'holmes', steps: 2 })).toBe(true);
        expect(g.detectives.holmes).toBe(1); // 11 → 0 → 1
        expect(g.applyCommand(JACK, { type: 'move', who: 'holmes', steps: 1 })).toBe(false);
    });

    it('ジョーカー：刑事側はどれか1人を1マス。ジャック側は動かさなくてもよい', () => {
        const g = newGame(2);
        setFaces(g, ['holmes', 'watson', 'exchange', 'joker']);
        expect(g.applyCommand(DETECTIVE, { type: 'joker', who: 'toby', steps: 0 })).toBe(false);
        expect(g.applyCommand(DETECTIVE, { type: 'joker', who: 'toby', steps: 2 })).toBe(false);
        expect(g.applyCommand(DETECTIVE, { type: 'joker', who: 'toby', steps: 1 })).toBe(true);
        expect(g.detectives.toby).toBe(8);
        const h = newGame(2);
        setFaces(h, ['holmes', 'watson', 'exchange', 'joker']);
        h.applyCommand(DETECTIVE, { type: 'move', who: 'holmes', steps: 1 });
        expect(h.applyCommand(JACK, { type: 'joker', who: 'watson', steps: 0 })).toBe(true);
        expect(h.detectives.watson).toBe(3);
    });

    it('回転：向きを変える。そのラウンドに回したタイルは、もう回せない（入れ替えても）', () => {
        const g = newGame(4);
        setFaces(g, ['alibi', 'toby', 'rotate', 'rotate']);
        const rot = g.tiles[4].rot;
        expect(g.applyCommand(DETECTIVE, { type: 'rotate', tile: 4, rot })).toBe(false);
        expect(g.applyCommand(DETECTIVE, { type: 'rotate', tile: 4, rot: (rot + 2) % 4 })).toBe(true);
        expect(g.tiles[4].rot).toBe((rot + 2) % 4);
        expect(g.applyCommand(JACK, { type: 'rotate', tile: 4, rot })).toBe(false);
        expect(g.lastError).toContain('回した');
        expect(g.applyCommand(JACK, { type: 'rotate', tile: 5, rot: (g.tiles[5].rot + 1) % 4 })).toBe(true);
    });

    it('入れ替え：向きはそのまま、場所だけ入れ替える', () => {
        const g = newGame(4);
        setFaces(g, ['alibi', 'toby', 'exchange', 'joker']);
        const [a, b] = [{ ...g.tiles[0] }, { ...g.tiles[8] }];
        expect(g.applyCommand(DETECTIVE, { type: 'exchange', a: 0, b: 0 })).toBe(false);
        expect(g.applyCommand(DETECTIVE, { type: 'exchange', a: 0, b: 8 })).toBe(true);
        expect(g.tiles[0]).toEqual(b);
        expect(g.tiles[8]).toEqual(a);
    });

    it('アリバイ：刑事側は引いた容疑者を無実にする。ジャック側は伏せて持ち、砂時計を得る', () => {
        const g = newGame(7);
        setFaces(g, ['alibi', 'toby', 'exchange', 'joker']);
        const card = g.deck[0];
        g.applyCommand(DETECTIVE, { type: 'alibi' });
        expect(g.detectiveCards).toEqual([card]);
        expect(g.tiles.find(t => t.suspect === card).cleared).toBe(true);
        // 偶数ラウンドで、ジャック側が引く
        const h = newGame(7);
        setFaces(h, ['holmes', 'watson', 'rotate', 'joker']); // 裏返すとアリバイが出る
        h.applyCommand(DETECTIVE, { type: 'move', who: 'holmes', steps: 1 });
        h.applyCommand(JACK, { type: 'move', who: 'watson', steps: 1 });
        h.applyCommand(JACK, { type: 'joker', who: 'toby', steps: 0 });
        h.applyCommand(DETECTIVE, { type: 'rotate', tile: 4, rot: (h.tiles[4].rot + 1) % 4 });
        const top = h.deck[0];
        const before = h.totalHourglasses();
        const wasCleared = h.tiles.find(t => t.suspect === top).cleared;
        expect(h.applyCommand(JACK, { type: 'alibi' })).toBe(true);
        expect(h.jackCards).toEqual([top]);
        expect(h.tiles.find(t => t.suspect === top).cleared).toBe(wasCleared); // ジャック側のアリバイでは無実にしない
        expect(h.totalHourglasses()).toBe(before + SUSPECTS.find(s => s.key === top).hourglasses);
        // 刑事側のビューには札の中身も砂時計の合計も入らない
        const v = createGameView(h, DETECTIVE);
        expect(v.jackCards).toBe(null);
        expect(v.jackCardCount).toBe(1);
        expect(v.totalHourglasses).toBe(null);
        expect(v.jack).toBe(null);
    });
});

describe('目撃', () => {
    // 1ラウンドを、刑事を動かすだけで終える
    function playRound(g) {
        const order = pickOrder(g.round);
        for (let i = 0; i < 4; i++) {
            const seat = order[i];
            const idx = g.tokens.findIndex(t => !t.used);
            const action = TOKENS[idx][g.tokens[idx].face];
            const c = ['holmes', 'watson', 'toby'].includes(action) ? { type: 'move', who: action, steps: 1 }
                : action === 'joker' ? { type: 'joker', who: 'holmes', steps: 1 }
                    : action === 'rotate' ? { type: 'rotate', tile: [0, 1, 2, 3, 5, 6, 7, 8, 4].find(p => !g.rotated.includes(p)), rot: 0 }
                        : action === 'exchange' ? { type: 'exchange', a: 1, b: 3 } : { type: 'alibi' };
            if (c.type === 'rotate' && g.tiles[c.tile].rot === 0) c.rot = 1;
            expect(g.applyCommand(seat, c), `${action} ${g.lastError}`).toBe(true);
        }
    }

    it('壁が下を向いていれば、上から見えるのは最初のタイルだけ', () => {
        const g = newGame(11);
        // 全部のタイルを壁が下にし、上の道から列0だけを見る
        setTiles(g, SUSPECTS.map(s => s.key), DOWN);
        g.jack = g.tiles[3].suspect;
        g.detectives = { holmes: 0, watson: 0, toby: 0 };
        setFaces(g, ['alibi', 'toby', 'exchange', 'joker']);
        // 刑事を動かさずに、ラウンドを終える
        g.applyCommand(DETECTIVE, { type: 'exchange', a: 4, b: 5 });
        g.applyCommand(JACK, { type: 'joker', who: 'holmes', steps: 0 });
        g.applyCommand(JACK, { type: 'move', who: 'toby', steps: 2 }); // トビーは 2（列2を下まで見る）
        expect(g.applyCommand(DETECTIVE, { type: 'alibi' })).toBe(true);
        // 見える：列0（0・3・6）は、どれも下に壁なので最初のタイルまで → 0 だけ。列2 → 2 だけ
        expect(g.lastWitness.jackSeen).toBe(false);
        expect(g.hourglasses).toBe(1);
    });

    it('ジャックが見えていなければ、見えている容疑者が無実になり、ジャック側が砂時計を得る', () => {
        const g = newGame(12);
        setTiles(g, SUSPECTS.map(s => s.key), RIGHT);
        g.jack = g.tiles[8].suspect;
        g.detectives = { holmes: 0, watson: 0, toby: 0 }; // 列0（0・3・6）が見える
        g.deck = g.deck.filter(k => k !== g.jack);
        setFaces(g, ['holmes', 'watson', 'exchange', 'joker']);
        g.applyCommand(DETECTIVE, { type: 'exchange', a: 1, b: 2 });
        g.applyCommand(JACK, { type: 'joker', who: 'holmes', steps: 0 });
        g.applyCommand(JACK, { type: 'move', who: 'watson', steps: 0 + 1 });
        g.applyCommand(DETECTIVE, { type: 'move', who: 'holmes', steps: 1 }); // ホームズは 1：列1（1・4・7）を見る
        const w = g.lastWitness;
        expect(w.jackSeen).toBe(false);
        expect(w.visible.sort()).toEqual([0, 3, 6, 1, 4, 7].map(p => g.tiles[p].suspect).sort());
        expect(w.cleared.length).toBe(6);
        expect(g.hourglasses).toBe(1);
    });

    it('目撃あり：見えない人が全員無実', () => {
        const g = newGame(13);
        setTiles(g, SUSPECTS.map(s => s.key), RIGHT);
        g.jack = g.tiles[3].suspect;
        g.detectives = { holmes: 0, watson: 0, toby: 0 };
        setFaces(g, ['holmes', 'watson', 'exchange', 'joker']);
        g.applyCommand(DETECTIVE, { type: 'exchange', a: 1, b: 2 });
        g.applyCommand(JACK, { type: 'joker', who: 'holmes', steps: 0 });
        g.applyCommand(JACK, { type: 'move', who: 'watson', steps: 1 });
        g.applyCommand(DETECTIVE, { type: 'move', who: 'holmes', steps: 1 });
        expect(g.lastWitness.jackSeen).toBe(true);
        expect(g.suspectsLeft().sort()).toEqual([0, 3, 6, 1, 4, 7].map(p => g.tiles[p].suspect).sort());
        expect(g.hourglasses).toBe(0);
        expect(playRound).toBeTypeOf('function');
    });
});

describe('勝ち負け', () => {
    // ラウンドの終わりを直接起こす
    const witness = (g) => g.endRound();

    it('残りがジャックだけなら刑事側の勝ち', () => {
        const g = newGame(20);
        g.tiles.forEach(t => { t.cleared = t.suspect !== g.jack; });
        g.detectives = { holmes: 0, watson: 0, toby: 0 };
        witness(g);
        expect(g.winner).toBe(DETECTIVE);
        expect(g.endReason).toBe('caught');
    });

    it('砂時計が6つでジャック側の勝ち（伏せたアリバイの分も数える）', () => {
        const g = newGame(21);
        g.hourglasses = 3;
        g.jackCards = SUSPECTS.filter(s => s.hourglasses === 1 && s.key !== g.jack).slice(0, 2).map(s => s.key);
        // 見えなければ砂時計+1 → 6
        g.detectives = { holmes: 0, watson: 0, toby: 0 };
        g.tiles.forEach(t => { t.rot = UP; });
        witness(g);
        expect(g.totalHourglasses()).toBe(6);
        expect(g.winner).toBe(JACK);
        expect(g.endReason).toBe('hourglasses');
    });

    // 正体が絞られ（ジャックだけ）、砂時計もそろう局面を作る
    const both = (round, seen) => {
        const g = newGame(22);
        setTiles(g, SUSPECTS.map(s => s.key), RIGHT);
        g.jack = g.tiles[seen ? 0 : 1].suspect; // 上の道の列0（0・3・6）が見える
        g.tiles.forEach(t => { t.cleared = t.suspect !== g.jack; });
        g.detectives = { holmes: 0, watson: 0, toby: 0 };
        g.jackCards = [];
        g.hourglasses = seen ? 6 : 5; // 見えなければ目撃で1つ増えて6
        g.round = round;
        witness(g);
        return g;
    };

    it('8ラウンドより前に両方を満たしたら続け、その後でジャックが見えたら刑事側の勝ち', () => {
        const g = both(3, false);
        expect(g.isOver()).toBe(false);
        expect(g.standoff).toBe(true);
        expect(g.round).toBe(4);
        // 次のラウンドも見えない → まだ続く。そのあと見える → 刑事側
        g.tiles.forEach(t => { t.rot = UP; });
        witness(g);
        expect(g.isOver()).toBe(false);
        g.tiles.forEach(t => { t.rot = RIGHT; });
        g.tiles = [g.tiles.find(t => t.suspect === g.jack), ...g.tiles.filter(t => t.suspect !== g.jack)];
        witness(g);
        expect([g.winner, g.endReason]).toEqual([DETECTIVE, 'both']);
    });

    it('両方を満たしたまま8ラウンドの終わりまで見えなければジャック側の勝ち', () => {
        const g = both(7, false);
        expect(g.standoff).toBe(true);
        g.tiles.forEach(t => { t.rot = UP; });
        witness(g);
        expect([g.winner, g.endReason]).toEqual([JACK, 'both']);
    });

    it('8ラウンドの終わりに初めて両方を満たしたら、ジャックが見えていれば刑事側、見えていなければジャック側', () => {
        const a = both(8, true);
        expect([a.winner, a.endReason]).toEqual([DETECTIVE, 'both']);
        const b = both(8, false);
        expect(b.totalHourglasses()).toBe(6);
        expect([b.winner, b.endReason]).toEqual([JACK, 'both']);
    });

    it('8ラウンドで決まらなければジャック側の勝ち', () => {
        const g = newGame(23);
        g.round = 8;
        g.detectives = { holmes: 0, watson: 0, toby: 0 };
        g.tiles.forEach(t => { t.rot = UP; });
        g.hourglasses = 0;
        witness(g);
        expect(g.winner).toBe(JACK);
        expect(g.endReason).toBe('time');
    });
});

describe('断る操作', () => {
    it('断った操作では状態が変わらない', () => {
        const g = newGame(30);
        const before = snapshot(g);
        [null, 'move', { type: 'fly' }, { type: 'move', who: 'lestrade', steps: 1 }, { type: 'rotate', tile: 9, rot: 0 },
            { type: 'exchange', a: 2, b: 2 }, { type: 'joker', who: 'holmes', steps: 3 }].forEach(c => expect(g.applyCommand(DETECTIVE, c)).toBe(false));
        expect(g.applyCommand(JACK, { type: 'alibi' })).toBe(false);
        expect(snapshot(g)).toBe(before);
    });
});
