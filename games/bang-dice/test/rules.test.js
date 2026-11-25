import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { ROLES_BY_PLAYERS } from '../public/js/characters.js';
import { makeGame, players, setup, setDice, rig, snapshot } from './helpers.js';

const ROLES5 = ['sheriff', 'outlaw', 'deputy', 'outlaw', 'renegade'];
// 全員ブラック・ジャック（ダイナマイトの振り直し以外は能力が効かない）にし、場面に応じて差し替える
const quiet = (overrides = {}) => {
    const list = ['blackjack', 'blackjack', 'blackjack', 'blackjack', 'blackjack'];
    Object.entries(overrides).forEach(([i, c]) => { list[i] = c; });
    return list;
};

describe('準備', () => {
    it('人数ごとに役割を配り、保安官から始める。保安官の体力は +2', () => {
        for (let n = 3; n <= 8; n++) {
            const game = makeGame(n, n * 11);
            expect(game.players.map(p => p.role).sort()).toEqual([...ROLES_BY_PLAYERS[n]].sort());
            expect(new Set(game.players.map(p => p.character)).size).toBe(n);
            const first = game.players.find(p => p.role === (n === 3 ? 'deputy' : 'sheriff'));
            expect(game.turn.seat).toBe(first.id);
            game.players.forEach(p => expect(p.life).toBe(p.maxLife));
        }
        const game = makeGame(5, 3);
        const sheriff = game.players.find(p => p.role === 'sheriff');
        const base = { bart: 8, blackjack: 8, calamity: 8, gringo: 7, jesse: 9, jourdonnais: 7, kit: 7, lucky: 8, paul: 9, pedro: 8, rose: 9, sid: 8, slab: 8, suzy: 8, vulture: 9, willy: 8 };
        expect(sheriff.maxLife).toBe(base[sheriff.character] + 2);
        expect(game.arrowPile).toBe(9);
    });

    it('同じシードなら同じ配り方になる', () => {
        expect(snapshot(makeGame(6, 42))).toBe(snapshot(makeGame(6, 42)));
    });

    it('人数が範囲の外ならエラー', () => {
        expect(() => new Game(players(2))).toThrow();
        expect(() => new Game(players(9))).toThrow();
    });
});

describe('ダイスを振る', () => {
    it('最初は5つを振り、振り直しは2回まで。3回振ったら使う段階に移る', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet() });
        rig(game, ['1', '1', '2', 'beer', 'gatling']);
        expect(game.applyCommand(0, { type: 'roll' })).toBe(true);
        expect(game.turn.dice).toEqual(['1', '1', '2', 'beer', 'gatling']);
        rig(game, ['2']);
        expect(game.applyCommand(0, { type: 'roll', dice: [0] })).toBe(true);
        expect(game.turn.dice[0]).toBe('2');
        rig(game, ['beer']);
        expect(game.applyCommand(0, { type: 'roll', dice: [0] })).toBe(true);
        expect(game.turn.stage).toBe('resolve');
        expect(game.applyCommand(0, { type: 'roll', dice: [1] })).toBe(false);
    });

    it('ラッキー・デュークは振り直しが3回', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'lucky' }), dice: ['1', '1', '1', '1', '1'] });
        game.turn.maxRolls = 4;
        game.startTurn(0);
        expect(game.turn.maxRolls).toBe(4);
        rig(game, ['1', '1', '1', '1', '1', '2', '2', '2']);
        game.applyCommand(0, { type: 'roll' });
        game.applyCommand(0, { type: 'roll', dice: [0] });
        game.applyCommand(0, { type: 'roll', dice: [0] });
        expect(game.turn.stage).toBe('roll');
        game.applyCommand(0, { type: 'roll', dice: [0] });
        expect(game.turn.stage).toBe('resolve');
    });

    it('矢は出た時点で取る。振り直しで出た矢も取る', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet() });
        rig(game, ['arrow', 'arrow', '1', '2', 'beer']);
        game.applyCommand(0, { type: 'roll' });
        expect(game.players[0].arrows).toBe(2);
        expect(game.arrowPile).toBe(7);
        rig(game, ['arrow']);
        game.applyCommand(0, { type: 'roll', dice: [0] });
        expect(game.players[0].arrows).toBe(3);
    });

    it('ダイナマイトは振り直せない（ブラック・ジャックは振り直せる）', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'suzy' }), dice: ['dynamite', '1', '1', '2', '2'] });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'roll', dice: [0, 1] })).toBe(false);
        expect(game.lastError).toContain('ダイナマイト');
        expect(snapshot(game)).toBe(before);
        const jack = setup(makeGame(5), { roles: ROLES5, characters: quiet(), dice: ['dynamite', '1', '1', '2', '2'] });
        rig(jack, ['beer']);
        expect(jack.applyCommand(0, { type: 'roll', dice: [0] })).toBe(true);
        expect(jack.turn.dice[0]).toBe('beer');
    });

    it('ダイナマイト3つで体力を1失い、振るのを終える。残りのダイスは使う', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'suzy' }), dice: ['dynamite', 'dynamite', '1', 'beer', 'gatling'] });
        rig(game, ['dynamite']);
        game.applyCommand(0, { type: 'roll', dice: [4] });
        expect(game.players[0].life).toBe(game.players[0].maxLife - 1);
        expect(game.turn.stage).toBe('resolve');
        expect(game.applyCommand(0, { type: 'shoot', die: 2, target: 1 })).toBe(true);
        expect(game.players[1].life).toBe(game.players[1].maxLife - 1);
    });

    it('振るのをやめると、使う段階に移る。まだ振っていなければやめられない', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet() });
        expect(game.applyCommand(0, { type: 'stop' })).toBe(false);
        setDice(game, ['1', '2', 'beer', 'beer', 'gatling']);
        expect(game.applyCommand(0, { type: 'stop' })).toBe(true);
        expect(game.turn.stage).toBe('resolve');
    });
});

describe('インディアンの襲撃', () => {
    it('最後の矢を取ると、全員が持っている矢の数だけ体力を失い、矢を山に戻す', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 3: 'jourdonnais' }), arrows: [1, 3, 0, 4, 0], pile: 1 });
        rig(game, ['arrow', '1', '1', '2', '2']);
        game.applyCommand(0, { type: 'roll' });
        expect(game.players.map(p => p.maxLife - p.life)).toEqual([2, 3, 0, 1, 0]);
        expect(game.players.every(p => p.arrows === 0)).toBe(true);
        expect(game.arrowPile).toBe(9);
    });

    it('複数の矢の途中で尽きたら、襲撃のあと新しい山から続けて取る', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), pile: 1 });
        rig(game, ['arrow', 'arrow', 'arrow', '2', '2']);
        game.applyCommand(0, { type: 'roll' });
        expect(game.players[0].life).toBe(game.players[0].maxLife - 1);
        expect(game.players[0].arrows).toBe(2);
        expect(game.arrowPile).toBe(7);
    });
});

describe('撃つ・ビール・ガトリング', () => {
    it('1は距離1、2は距離2の人だけ。前の手番までに脱落した人は数えない', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), dice: ['1', '2', 'beer', 'beer', 'arrow'] });
        expect(game.shotTargets(0, '1')).toEqual([1, 4]);
        expect(game.shotTargets(0, '2')).toEqual([2, 3]);
        game.players[1].alive = false;
        game.startTurn(0);
        expect(game.shotTargets(0, '1')).toEqual([2, 4]);
        expect(game.shotTargets(0, '2')).toEqual([3]);
    });

    it('同じ手番の中で倒れた人がいても、距離は変わらない（倒れた人を撃つと無駄になる）', () => {
        // 席1が、手番の人の矢で起きた襲撃で倒れる
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), life: [10, 1, 8, 8, 8], arrows: [0, 1, 0, 0, 0], pile: 1 });
        rig(game, ['arrow', '1', '2', 'arrow', 'arrow']);
        game.applyCommand(0, { type: 'roll' });
        expect(game.players[1].alive).toBe(false);
        expect(game.shotTargets(0, '1')).toEqual([1, 4]);
        expect(game.shotTargets(0, '2')).toEqual([2, 3]);
        game.applyCommand(0, { type: 'stop' });
        expect(game.applyCommand(0, { type: 'shoot', die: 1, target: 1 })).toBe(true);
        expect(game.applyCommand(0, { type: 'shoot', die: 2, target: 2 })).toBe(true);
        expect(game.players[2].life).toBe(game.players[2].maxLife - 1);
        // 次の手番からは、脱落した人を飛ばす
        expect(game.turn.seat).toBe(2);
        expect(game.shotTargets(2, '1')).toEqual([0, 3]);
    });

    it('残りが3人以下で距離2にだれもいなければ、2で距離1の人を撃てる', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet() });
        game.players[1].alive = false;
        game.players[2].alive = false;
        game.startTurn(0);
        expect(game.shotTargets(0, '2')).toEqual([3, 4]);
    });

    it('カラミティ・ジャネットは1と2を入れ替えられ、ローズ・ドゥーランは1つ遠くまで撃てる', () => {
        const game = setup(makeGame(7, 2), { roles: ['sheriff', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy', 'renegade'], characters: ['calamity', 'rose', 'paul', 'paul', 'paul', 'paul', 'paul'].map((c, i) => (i >= 2 ? ['bart', 'kit', 'sid', 'slab', 'willy'][i - 2] : c)) });
        expect(game.shotTargets(0, '1').sort()).toEqual([1, 2, 5, 6]);
        expect(game.shotTargets(1, '1').sort()).toEqual([0, 2, 3, 6]);
        expect(game.shotTargets(1, '2').sort()).toEqual([3, 4, 5, 6]);
    });

    it('撃つ相手が合わない・1と2を使う前のビールは断り、状態を変えない', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), dice: ['1', '2', 'beer', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'shoot', die: 0, target: 2 })).toBe(false);
        expect(game.applyCommand(0, { type: 'shoot', die: 0, target: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'beer', die: 2, target: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'shoot', die: 2, target: 1 })).toBe(false);
        expect(game.applyCommand(1, { type: 'shoot', die: 0, target: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'shoot', die: 0, target: 1, double: 2 })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('1と2は、相手を全部決めてから同時に撃つ（順番は自由。残りの体力より多く割り当ててもよい）', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 2: 'vulture' }), life: [10, 1, 5, 8, 8], dice: ['2', '1', '1', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        expect(game.applyCommand(0, { type: 'shoot', die: 0, target: 2 })).toBe(true);
        expect(game.applyCommand(0, { type: 'shoot', die: 1, target: 1 })).toBe(true);
        // まだ撃っていない（狙いだけ決まっている）
        expect(game.players[1].life).toBe(1);
        expect(game.players[2].life).toBe(5);
        expect(createGameView(game, 0).turn.shots.map(s => s.target)).toEqual([2, 1]);
        expect(game.applyCommand(0, { type: 'shoot', die: 2, target: 1 })).toBe(true);
        // 同時に撃つ。ヴァルチャー・サム（席2）は撃たれて減ってから、席1の脱落で2回復
        expect(game.players[1].alive).toBe(false);
        expect(game.players[2].life).toBe(6);
        expect(game.turn.seat).toBe(2);
    });

    it('ビールは上限を超えない。ジェシー・ジョーンズは体力4以下で自分に使うと2回復', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'jesse' }), life: [4, 8, 8, 8, 8], dice: ['beer', 'beer', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'beer', die: 0, target: 0 });
        expect(game.players[0].life).toBe(6);
        game.applyCommand(0, { type: 'beer', die: 1, target: 1 });
        expect(game.players[1].life).toBe(8);
        expect(game.turn.seat).toBe(1);
    });

    it('ガトリング3つで、ほかの全員が1点失い、自分の矢を戻す。ポール・レグレットは失わない', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 2: 'paul' }), arrows: [3, 1, 0, 0, 0], pile: 5, dice: ['gatling', 'gatling', 'gatling', 'gatling', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        expect(game.players.map(p => p.maxLife - p.life)).toEqual([0, 1, 0, 1, 1]);
        expect(game.players[0].arrows).toBe(0);
        expect(game.players[1].arrows).toBe(1);
        expect(game.arrowPile).toBe(8);
    });

    it('ウィリー・ザ・キッドはガトリング2つで撃てる', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'willy' }), dice: ['gatling', 'gatling', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        expect(game.players[1].life).toBe(game.players[1].maxLife - 1);
    });
});

describe('脱落と勝ち負け', () => {
    it('脱落したら役割を公開し、矢を山に戻す。ヴァルチャー・サムは2回復', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 2: 'vulture' }), life: [10, 1, 5, 8, 8], arrows: [0, 2, 0, 0, 0], pile: 7, dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.arrowPile = 3;
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1 });
        expect(game.players[1].alive).toBe(false);
        expect(game.arrowPile).toBe(5);
        expect(game.players[2].life).toBe(7);
        expect(createGameView(game, 3).players[1].role).toBe('outlaw');
    });

    it('ヴァルチャー・サムは、同時に倒れたら回復しない（襲撃で一緒に倒れる）', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 2: 'vulture' }), life: [10, 1, 1, 8, 8], arrows: [0, 1, 1, 0, 0], pile: 1 });
        rig(game, ['arrow', '1', '1', '2', '2']);
        game.applyCommand(0, { type: 'roll' });
        expect(game.players[1].alive).toBe(false);
        expect(game.players[2].alive).toBe(false);
    });

    it('保安官が倒れたら無法者の勝ち', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), life: [8, 1, 8, 8, 8], current: 1, dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.players[0].life = 1;
        game.applyCommand(1, { type: 'stop' });
        game.applyCommand(1, { type: 'shoot', die: 0, target: 0 });
        expect(game.isOver()).toBe(true);
        expect(game.winnerSide).toBe('outlaw');
        expect(game.winners).toEqual([1, 3]);
    });

    it('保安官を最後に倒して1人残った裏切り者の勝ち', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), life: [1, 0, 0, 0, 8], current: 4, dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(4, { type: 'stop' });
        game.applyCommand(4, { type: 'shoot', die: 0, target: 0 });
        expect(game.winnerSide).toBe('renegade');
        expect(game.winners).toEqual([4]);
    });

    it('無法者と裏切り者が全員倒れたら、保安官と副保安官の勝ち（脱落した副保安官も勝ち）', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), life: [8, 1, 0, 0, 0], dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1 });
        expect(game.winnerSide).toBe('law');
        expect(game.winners).toEqual([0, 2]);
    });

    it('無法者が全滅したあとに保安官が倒れ、副保安官と裏切り者が残っていれば、無法者の勝ち', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), life: [1, 0, 8, 0, 8], current: 4, dice: ['2', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(4, { type: 'stop' });
        game.applyCommand(4, { type: 'shoot', die: 0, target: 0 });
        expect(game.winnerSide).toBe('outlaw');
        expect(game.winners).toEqual([1, 3]);
    });

    it('無法者が全滅しても、裏切り者が残っていれば続く', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), life: [8, 1, 8, 0, 8], dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1 });
        expect(game.players[1].alive).toBe(false);
        expect(game.isOver()).toBe(false);
    });

    it('8人：保安官と裏切り者2人が残って保安官が倒れたら、無法者の勝ち', () => {
        const roles = ['sheriff', 'renegade', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy'];
        const game = setup(makeGame(8), { roles, characters: Array(8).fill('blackjack'), life: [1, 8, 8, 0, 0, 0, 0, 0], current: 1, dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(1, { type: 'stop' });
        game.applyCommand(1, { type: 'shoot', die: 0, target: 0 });
        expect(game.winnerSide).toBe('outlaw');
    });

    it('全員が同時に倒れたら、無法者の勝ち', () => {
        // 席2は前に脱落。残る3人が矢を1本ずつ持ち、手番の人が最後の矢を取って襲撃が起きる
        const game = setup(makeGame(4), { roles: ['sheriff', 'outlaw', 'outlaw', 'renegade'], characters: Array(4).fill('blackjack'), life: [1, 1, 0, 1], arrows: [1, 1, 0, 1], pile: 1 });
        rig(game, ['arrow', '1', '1', '2', '2']);
        game.applyCommand(0, { type: 'roll' });
        expect(game.players.every(p => !p.alive)).toBe(true);
        expect(game.winnerSide).toBe('outlaw');
    });

    it('3人：副保安官が自分で裏切り者を倒せば副保安官の勝ち。役割は全員に見える', () => {
        const game = setup(makeGame(3), { roles: ['deputy', 'outlaw', 'renegade'], characters: ['blackjack', 'blackjack', 'blackjack'], life: [8, 8, 1], dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        expect(createGameView(game, 0).players.map(p => p.role)).toEqual(['deputy', 'outlaw', 'renegade']);
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 2 });
        expect(game.winners).toEqual([0]);
        expect(game.winnerSide).toBe('deputy');
    });

    it('3人：的でない人を倒しても勝たず、残った2人のうち最後の1人の勝ち', () => {
        const game = setup(makeGame(3), { roles: ['deputy', 'outlaw', 'renegade'], characters: ['blackjack', 'blackjack', 'blackjack'], life: [8, 1, 1], dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1 });
        expect(game.isOver()).toBe(false);
        setup(game, { roles: ['deputy', 'outlaw', 'renegade'], characters: ['blackjack', 'blackjack', 'blackjack'], life: [8, 0, 1], current: 0, dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 2 });
        expect(game.winners).toEqual([0]);
    });

    it('3人：全員が同時に倒れたら、無法者の勝ち', () => {
        const game = setup(makeGame(3), { roles: ['deputy', 'outlaw', 'renegade'], characters: ['blackjack', 'blackjack', 'blackjack'], life: [1, 1, 1], arrows: [1, 1, 1], pile: 1 });
        rig(game, ['arrow', '1', '1', '2', '2']);
        game.applyCommand(0, { type: 'roll' });
        expect(game.winnerSide).toBe('outlaw');
        expect(game.winners).toEqual([1]);
    });

    it('3人：的がダイナマイトで倒れても、だれも勝たずに続く', () => {
        const game = setup(makeGame(3), { roles: ['deputy', 'outlaw', 'renegade'], characters: ['suzy', 'suzy', 'suzy'], life: [8, 8, 1], current: 2, dice: ['dynamite', 'dynamite', '1', '1', '1'] });
        rig(game, ['dynamite']);
        game.applyCommand(2, { type: 'roll', dice: [2] });
        expect(game.players[2].alive).toBe(false);
        expect(game.isOver()).toBe(false);
    });

    it('ダイナマイト3つで脱落したら、ほかのダイスは使わずに次の人へ', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet(), life: [10, 8, 8, 8, 1], current: 4, dice: ['dynamite', 'dynamite', '1', '1', 'beer'] });
        rig(game, ['dynamite']);
        game.applyCommand(4, { type: 'roll', dice: [2] });
        expect(game.players[4].alive).toBe(false);
        expect(game.turn.seat).toBe(0);
        expect(game.players[0].life).toBe(10);
    });
});

describe('キャラクターの能力', () => {
    it('バート・キャシディは、撃たれたときに体力の代わりに矢を取れる', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 1: 'bart' }), dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.arrowPile = 5;
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1 });
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(0, { type: 'bart', arrows: 1 })).toBe(false);
        expect(game.applyCommand(1, { type: 'bart', arrows: 2 })).toBe(false);
        expect(game.applyCommand(1, { type: 'bart', arrows: 1 })).toBe(true);
        expect(game.players[1].life).toBe(game.players[1].maxLife);
        expect(game.players[1].arrows).toBe(1);
        expect(game.turn.seat).toBe(1);
    });

    it('バート・キャシディは、山の最後の1本を取るためには能力を使えない', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 1: 'bart' }), dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.arrowPile = 1;
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1 });
        expect(game.pending).toBe(null);
        expect(game.players[1].life).toBe(game.players[1].maxLife - 1);
        expect(game.arrowPile).toBe(1);
    });

    it('エル・グリンゴの体力を減らした人は矢を1本取る', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 1: 'gringo' }), dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.arrowPile = 5;
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1 });
        expect(game.players[0].arrows).toBe(1);
        expect(game.arrowPile).toBe(4);
    });

    it('ペドロ・ラミレスは、失った1点ごとに1本まで、自分の矢を捨ててもよい', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'slab', 1: 'pedro' }), arrows: [0, 3, 0, 0, 0], pile: 6, dice: ['1', 'beer', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1, double: 1 });
        expect(game.players[1].life).toBe(game.players[1].maxLife - 2);
        expect(game.actors()).toEqual([1]);
        expect(game.pending).toMatchObject({ type: 'pedro', max: 2 });
        expect(game.applyCommand(1, { type: 'pedro', arrows: 3 })).toBe(false);
        expect(game.applyCommand(1, { type: 'bart', arrows: 1 })).toBe(false);
        expect(game.applyCommand(1, { type: 'pedro', arrows: 2 })).toBe(true);
        expect(game.players[1].arrows).toBe(1);
        expect(game.arrowPile).toBe(8);
        expect(game.turn.seat).toBe(1);
    });

    it('ペドロ・ラミレスは、矢を捨てないこともできる', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 1: 'pedro' }), arrows: [0, 2, 0, 0, 0], pile: 7, dice: ['1', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'shoot', die: 0, target: 1 });
        expect(game.applyCommand(1, { type: 'pedro', arrows: 0 })).toBe(true);
        expect(game.players[1].arrows).toBe(2);
    });

    it('キット・カールソンはガトリング1つごとに、だれかの矢を捨てられる', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'kit' }), arrows: [0, 2, 0, 0, 0], pile: 7, dice: ['gatling', 'arrow', 'arrow', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        expect(game.turn.seat).toBe(0);
        expect(game.applyCommand(0, { type: 'kit', die: 0, target: 2 })).toBe(false);
        expect(game.applyCommand(0, { type: 'kit', die: 0, target: 1 })).toBe(true);
        expect(game.players[1].arrows).toBe(1);
        expect(game.turn.seat).toBe(1);
    });

    it('スラブ・ザ・キラーはビールを足して2点のダメージにできる（手番に1回）', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'slab' }), dice: ['1', '1', 'beer', 'beer', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        expect(game.applyCommand(0, { type: 'shoot', die: 0, target: 1, double: 2 })).toBe(true);
        expect(game.applyCommand(0, { type: 'shoot', die: 1, target: 1, double: 3 })).toBe(false);
        expect(game.applyCommand(0, { type: 'shoot', die: 1, target: 1 })).toBe(true);
        expect(game.players[1].life).toBe(game.players[1].maxLife - 3);
    });

    it('スージー・ラファイエットは1も2もなければ2回復', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'suzy' }), life: [5, 8, 8, 8, 8], dice: ['arrow', 'beer', 'gatling', 'arrow', 'arrow'] });
        game.applyCommand(0, { type: 'stop' });
        game.applyCommand(0, { type: 'beer', die: 1, target: 1 });
        expect(game.players[0].life).toBe(7);
    });

    it('シド・ケッチャムは手番のはじめにだれかを1回復させる', () => {
        const game = setup(makeGame(5), { roles: ROLES5, characters: quiet({ 0: 'sid' }), life: [10, 5, 8, 8, 8] });
        expect(game.turn.stage).toBe('sid');
        expect(game.applyCommand(0, { type: 'roll' })).toBe(false);
        expect(game.applyCommand(0, { type: 'sid', target: 1 })).toBe(true);
        expect(game.players[1].life).toBe(6);
        expect(game.turn.stage).toBe('roll');
    });
});

describe('記録とビュー', () => {
    it('操作の記録から同じ状態を再現できる', () => {
        const game = makeGame(6, 9);
        const seat = game.turn.seat;
        game.applyCommand(seat, game.turn.stage === 'sid' ? { type: 'sid', target: seat } : { type: 'roll' });
        const copy = Game.replay(game.persist().players, game.persist().options, game.persist().commands);
        expect(snapshot(copy)).toBe(snapshot(game));
    });

    it('ビューには、ほかの人の隠れた役割が入らない', () => {
        const game = makeGame(6, 4);
        const seat = game.players.find(p => p.role === 'outlaw').id;
        const view = createGameView(game, seat);
        view.players.forEach(p => {
            const real = game.players[p.id].role;
            if (p.id === seat || real === 'sheriff') expect(p.role).toBe(real);
            else expect(p.role).toBe(null);
        });
        const deal = view.events.find(e => e.type === 'deal');
        expect(deal.roles.filter(r => r !== null).length).toBe(2);
        expect(JSON.stringify(view)).not.toContain('"renegade"');
    });
});
