import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { BOARD, INN_POSITIONS, EDO, TRAVELERS, TRAVELER_IDS, SOUVENIRS, MEAL_CARDS, ENCOUNTER_CARDS } from '../public/js/data.js';
import { newGame, startTravel, place, moveTo, act, firstOf, snapshot, totalCards, TOTAL_CARDS } from './helpers.js';

describe('道', () => {
    it('京都から江戸まで、宿場5つ（京都・途中の3つ・江戸）の間に 13・12・13・12 マス', () => {
        expect(BOARD).toHaveLength(55);
        expect(INN_POSITIONS).toEqual([0, 14, 27, 41, 54]);
        const counts = {};
        BOARD.forEach(s => { counts[s.type] = (counts[s.type] ?? 0) + 1; });
        expect(counts).toEqual({ inn: 5, village: 7, temple: 6, encounter: 7, paddy: 5, mountain: 6, sea: 7, spring: 6, farm: 6 });
        expect(BOARD.filter(s => s.double)).toHaveLength(24);
    });

    it('札の枚数：土産24・食事25・出会い14・温泉12、旅人10', () => {
        expect(Object.keys(SOUVENIRS)).toHaveLength(24);
        expect(MEAL_CARDS).toHaveLength(25);
        expect(ENCOUNTER_CARDS).toHaveLength(14);
        expect(TRAVELER_IDS).toHaveLength(10);
        const g = newGame(5);
        expect(totalCards(g)).toBe(TOTAL_CARDS);
    });
});

describe('旅人を選ぶ', () => {
    it('各人に違う旅人を2枚ずつ配り、全員が選んだら旅人のお金を持って出発する', () => {
        const game = newGame(5, 3);
        const all = game.players.flatMap(p => p.offers);
        expect(new Set(all).size).toBe(10);
        expect(game.actors()).toEqual([0, 1, 2, 3, 4]);
        act(game, 2, { type: 'choose', traveler: game.players[2].offers[1] });
        // 選んだ旅人は、全員が選ぶまで本人にだけ見える
        expect(createGameView(game, 2).players[2].traveler).toBe(game.players[2].offers[1]);
        expect(createGameView(game, 0).players[2].traveler).toBe(null);
        expect(createGameView(game, 0).players[2].chosen).toBe(true);
        expect(game.applyCommand(2, { type: 'choose', traveler: game.players[2].offers[0] })).toBe(false);
        [0, 1, 3, 4].forEach(i => act(game, i, { type: 'choose', traveler: game.players[i].offers[0] }));
        expect(game.phase).toBe('travel');
        game.players.forEach(p => expect(p.coins).toBe(TRAVELERS[p.traveler].coins));
        expect(createGameView(game, 0).players[2].traveler).toBe(game.players[2].traveler);
    });

    it('配られていない旅人は選べない', () => {
        const game = newGame(3);
        const other = TRAVELER_IDS.find(t => !game.players[0].offers.includes(t));
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'choose', traveler: other })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('手番と進み方', () => {
    it('いちばん後ろの旅人が動く。同じ2マスでは、あとから着いた方が後ろ', () => {
        const game = startTravel(4);
        place(game, [3, 6, 6, 9]);
        expect(game.moverSeat()).toBe(0);
        moveTo(game, 7);
        // 6 の2人は、あとから着いた2番（席2）が後ろ
        expect(game.moverSeat()).toBe(2);
    });

    it('動いたあともいちばん後ろなら、続けて動く', () => {
        const game = startTravel(3, ['kinko', 'kinko', 'kinko'].map((_, i) => null));
        place(game, [1, 8, 10]);
        game.players[0].coins = 5;
        moveTo(game, 2); // 寺
        act(game, 0, { type: 'donate', amount: 1 });
        expect(game.moverSeat()).toBe(0);
    });

    it('宿場は追い越せず、宿場には全員が止まる。最後に着いた人から出発する', () => {
        const game = startTravel(3);
        place(game, [12, 13, 14]);
        expect(game.legalMoves()).toEqual([14]);
        moveTo(game, 14);
        if (game.pending) act(game, game.pending.seat, { type: 'meal', card: null });
        moveTo(game, 14);
        while (game.pending) act(game, game.pending.seat, { type: 'meal', card: null });
        // 京都では前から順に着いた扱い。最後に着いたのは席1
        expect(game.moverSeat()).toBe(1);
        expect(game.legalMoves(game.moverToken())).toContain(27);
        expect(game.legalMoves(game.moverToken())).not.toContain(28);
    });

    it('2マスは4・5人のときだけ2人止まれる', () => {
        const three = startTravel(3);
        place(three, [0, 1, 20]);
        expect(three.legalMoves(0)).not.toContain(1);
        const four = startTravel(4);
        place(four, [0, 1, 20, 21]);
        expect(four.legalMoves(0)).toContain(1);
        place(four, [0, 1, 1, 21]);
        expect(four.legalMoves(0)).not.toContain(1);
    });

    it('お金がないと店と寺には止まれず、完成させた景色には止まれない', () => {
        const game = startTravel(3);
        place(game, [0, 20, 21]);
        game.players[0].coins = 0;
        const moves = game.legalMoves(0);
        expect(moves).not.toContain(1);
        expect(moves).not.toContain(2);
        expect(moves).toContain(3);
        game.players[0].panoramas.paddy = 3;
        expect(game.legalMoves(0)).not.toContain(4);
    });

    it('止まれないマスへの移動は断り、状態を変えない', () => {
        const game = startTravel(3);
        place(game, [0, 5, 6]);
        const before = snapshot(game);
        [5, 0, 15, 2.5, '3', null].forEach(to => expect(game.applyCommand(game.moverSeat(), { type: 'move', to })).toBe(false));
        expect(game.applyCommand(1, { type: 'move', to: 3 })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('マスの効果', () => {
    it('店：3枚を見て好きなだけ買い、買わなかった札は山の下へ。土産は組で 1・3・5・7 点', () => {
        const game = startTravel(3, ['kinko']);
        place(game, [0, 20, 21]);
        game.decks.souvenir = ['koma', 'manju', 'haori', 'shamisen', ...game.decks.souvenir.filter(c => !['koma', 'manju', 'haori', 'shamisen'].includes(c))];
        game.players[0].coins = 7;
        moveTo(game, 1);
        expect(game.pending).toMatchObject({ seat: 0, kind: 'buy', cards: ['koma', 'manju', 'haori'] });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'buy', cards: ['shamisen'] })).toBe(false);
        expect(game.applyCommand(0, { type: 'buy', cards: ['koma', 'koma'] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        act(game, 0, { type: 'buy', cards: ['koma', 'haori'] });
        expect(game.players[0].coins).toBe(4);
        expect(game.players[0].points.souvenir).toBe(4);
        expect(game.decks.souvenir[0]).toBe('shamisen');
        expect(game.decks.souvenir.at(-1)).toBe('manju');
    });

    it('店：お金が足りなければ断る', () => {
        const game = startTravel(3, ['kinko']);
        place(game, [0, 20, 21]);
        game.decks.souvenir = ['shamisen', 'sumie', 'koma', ...game.decks.souvenir.slice(3)];
        game.players[0].coins = 4;
        moveTo(game, 1);
        expect(game.applyCommand(0, { type: 'buy', cards: ['shamisen', 'sumie'] })).toBe(false);
        act(game, 0, { type: 'buy', cards: ['shamisen', 'koma'] });
        expect(game.players[0].coins).toBe(0);
    });

    it('芸者：2枚以上買うと一番安い1枚がただ（ただし全部の額を持っている必要がある）', () => {
        const game = startTravel(3, ['sasayakko']);
        place(game, [0, 20, 21]);
        game.decks.souvenir = ['shamisen', 'haori', 'koma', ...game.decks.souvenir.filter(c => !['shamisen', 'haori', 'koma'].includes(c))];
        game.players[0].coins = 5;
        moveTo(game, 1);
        expect(game.applyCommand(0, { type: 'buy', cards: ['shamisen', 'haori', 'koma'] })).toBe(false);
        act(game, 0, { type: 'buy', cards: ['shamisen', 'haori'] });
        expect(game.players[0].coins).toBe(2);
    });

    it('商人：店ごとに1回、土産1枚を1文で買える', () => {
        const game = startTravel(3, ['zenemon']);
        place(game, [0, 20, 21]);
        game.decks.souvenir = ['shamisen', 'haori', 'koma', ...game.decks.souvenir.filter(c => !['shamisen', 'haori', 'koma'].includes(c))];
        game.players[0].coins = 4;
        moveTo(game, 1);
        act(game, 0, { type: 'buy', cards: ['shamisen', 'haori', 'koma'] });
        expect(game.players[0].coins).toBe(0);
        expect(game.players[0].points.souvenir).toBe(9);
    });

    it('農家：3文。温泉：2点か3点（隠居は＋1）', () => {
        const game = startTravel(3, ['mitsukuni']);
        place(game, [6, 20, 21]);
        const coins = game.players[0].coins;
        moveTo(game, 7);
        expect(game.players[0].coins).toBe(coins + 3);
        game.decks.spring = ['3:1', ...game.decks.spring.filter(c => c !== '3:1')];
        place(game, [12, 20, 21]);
        moveTo(game, 13);
        expect(game.players[0].springs).toEqual(['3:1']);
        expect(game.players[0].points.spring).toBe(4);
    });

    it('寺：1〜3文を寄付して1文1点。僧は場の1文を足す', () => {
        const game = startTravel(3, ['hirotada']);
        place(game, [0, 20, 21]);
        game.players[0].coins = 2;
        moveTo(game, 2);
        expect(game.pending).toMatchObject({ kind: 'donate', max: 2 });
        expect(game.applyCommand(0, { type: 'donate', amount: 3 })).toBe(false);
        expect(game.applyCommand(0, { type: 'donate', amount: 0 })).toBe(false);
        act(game, 0, { type: 'donate', amount: 2 });
        expect(game.players[0]).toMatchObject({ coins: 0, donations: 3 });
        expect(game.players[0].points.temple).toBe(3);
    });

    it('景色：1枚目から順に取り、点はその番号。最初に完成させた人だけ3点の称号', () => {
        const game = startTravel(3);
        game.players[1].panoramas.paddy = 2;
        game.players[2].panoramas.paddy = 2;
        place(game, [3, 17, 20]);
        moveTo(game, 4);
        expect(game.players[0].panoramas.paddy).toBe(1);
        expect(game.players[0].points.panorama).toBe(1);
        place(game, [25, 17, 26]);
        moveTo(game, 18); // 席1が田の3枚目
        expect(game.players[1].achievements).toEqual(['paddy']);
        expect(game.players[1].points.achievement).toBe(3);
        place(game, [25, 26, 27]);
        game.tokens[2].pos = 26;
        game.tokens[1].pos = 27;
        place(game, [26, 27, 18 - 1]);
        moveTo(game, 18); // 席2も完成させるが、称号はない
        expect(game.players[2].panoramas.paddy).toBe(3);
        expect(game.players[2].achievements).toEqual([]);
    });
});

describe('出会い', () => {
    const encounterGame = (traveler, card, seed = 1) => {
        const game = startTravel(3, [traveler], seed);
        place(game, [2, 20, 21]);
        game.decks.encounter = [card, ...game.decks.encounter.filter(c => c !== card)];
        return game;
    };

    it('職人は土産1枚、侍は3点、公家は3文、巫女は寺に場の1文（1点）', () => {
        let g = encounterGame('kinko', 'shokunin:1');
        const top = g.decks.souvenir[0];
        moveTo(g, 3);
        expect(g.players[0].souvenirs).toEqual([top]);
        expect(g.players[0].points.souvenir).toBe(1);
        g = encounterGame('kinko', 'samurai:1');
        moveTo(g, 3);
        expect(g.players[0].points.encounter).toBe(3);
        g = encounterGame('kinko', 'kuge:1');
        moveTo(g, 3);
        expect(g.players[0].coins).toBe(10);
        g = encounterGame('kinko', 'miko:1');
        moveTo(g, 3);
        expect(g.players[0]).toMatchObject({ donations: 1, coins: 7 });
        expect(g.players[0].points.temple).toBe(1);
        expect(g.players[0].encounters).toEqual(['miko:1']);
    });

    it('案内人は景色の次の1枚。完成していれば、ほかの景色から選ぶ', () => {
        let g = encounterGame('kinko', 'annaibito-sea:1');
        moveTo(g, 3);
        expect(g.players[0].panoramas.sea).toBe(1);
        g = encounterGame('kinko', 'annaibito-paddy:1');
        g.players[0].panoramas.paddy = 3;
        moveTo(g, 3);
        expect(g.pending).toMatchObject({ kind: 'panorama', options: ['mountain', 'sea'] });
        expect(g.applyCommand(0, { type: 'panorama', kind: 'paddy' })).toBe(false);
        act(g, 0, { type: 'panorama', kind: 'mountain' });
        expect(g.players[0].panoramas.mountain).toBe(1);
    });

    it('大道芸人は出会いのたびに1点と1文', () => {
        const g = encounterGame('umegae', 'kuge:1');
        moveTo(g, 3);
        expect(g.players[0].coins).toBe(5 + 1 + 3);
        expect(g.players[0].points.encounter).toBe(1);
    });

    it('役人は2枚引いて1枚を選び、もう1枚は山の下へ（ほかの人には見えない）', () => {
        const g = encounterGame('yoshiyasu', 'samurai:1');
        g.decks.encounter = ['samurai:1', 'kuge:1', ...g.decks.encounter.filter(c => !['samurai:1', 'kuge:1'].includes(c))];
        moveTo(g, 3);
        expect(g.pending).toMatchObject({ kind: 'encounter', cards: ['samurai:1', 'kuge:1'] });
        expect(createGameView(g, 1).pending.cards).toBeUndefined();
        expect(JSON.stringify(createGameView(g, 1))).not.toContain('kuge:1');
        act(g, 0, { type: 'encounter', card: 'kuge:1' });
        expect(g.players[0].encounters).toEqual(['kuge:1']);
        expect(g.decks.encounter.at(-1)).toBe('samurai:1');
    });
});

describe('宿場の食事', () => {
    const atInnEve = (n, travelers, seed = 1) => {
        const game = startTravel(n, travelers, seed);
        place(game, Array.from({ length: n }, (_, i) => 13 - i));
        return game;
    };
    const finishInn = (game) => {
        while (game.tokens.some(t => t.pos !== 14)) {
            moveTo(game, 14);
            while (game.pending) act(game, game.pending.seat, { type: 'meal', card: null });
        }
    };

    it('最初に着いた人が人数＋1枚を引き、着いた順に1つずつ買う。同じ料理は2度食べられない', () => {
        const game = atInnEve(3, ['kinko', 'zenemon', 'mitsukuni']);
        game.decks.meal = ['dango:1', 'dango:2', 'tofu:1', 'unagi:1', ...game.decks.meal.filter(c => !['dango:1', 'dango:2', 'tofu:1', 'unagi:1'].includes(c))];
        game.players[2].meals = [];
        // 一番後ろ（席2）から動く
        expect(moveTo(game, 14)).toBe(2);
        expect(game.inn.meals).toEqual(['dango:1', 'dango:2', 'tofu:1', 'unagi:1']);
        // 宿場の札は、着いた人にだけ見える
        expect(createGameView(game, 0).inn.meals).toBe(null);
        expect(createGameView(game, 2).inn.meals).toHaveLength(4);
        act(game, 2, { type: 'meal', card: 'unagi:1' });
        expect(game.players[2].points.meal).toBe(6);
        expect(game.players[2].coins).toBe(6 - 3);
        moveTo(game, 14); // 席1
        act(game, 1, { type: 'meal', card: 'dango:1' });
        moveTo(game, 14); // 席0（浪人は1文安い）
        const coins = game.players[0].coins;
        act(game, 0, { type: 'meal', card: 'tofu:1' });
        expect(game.players[0].coins).toBe(coins - 1);
        // 全員が揃ったら、残りは山の下へ
        expect(game.inn).toBe(null);
        expect(game.decks.meal.at(-1)).toBe('dango:2');
    });

    it('同じ料理と、払えない料理は選べない', () => {
        const game = atInnEve(3, ['kinko', 'zenemon', 'mitsukuni']);
        game.decks.meal = ['dango:1', 'unagi:1', 'tofu:1', 'soba:1', ...game.decks.meal.filter(c => !['dango:1', 'unagi:1', 'tofu:1', 'soba:1'].includes(c))];
        game.players[2].meals = ['dango:3'];
        game.players[2].coins = 2;
        moveTo(game, 14);
        expect(game.pending.options).toEqual(['tofu:1', 'soba:1']);
        const before = snapshot(game);
        expect(game.applyCommand(2, { type: 'meal', card: 'dango:1' })).toBe(false);
        expect(game.applyCommand(2, { type: 'meal', card: 'unagi:1' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('孤児には、並んだ札から1枚がただで出る。断って買ってもよい', () => {
        const game = atInnEve(3, ['kinko', 'zenemon', 'satsuki']);
        game.players[2].coins = 0;
        moveTo(game, 14);
        const offer = game.pending.offer;
        expect(game.inn.meals).toContain(offer);
        expect(game.pending.options).toEqual([offer]);
        act(game, 2, { type: 'meal', card: offer });
        expect(game.players[2].coins).toBe(0);
        expect(game.players[2].meals).toEqual([offer]);
    });

    it('絵師と飛脚の力は、途中の宿場で食事の前に使う（江戸では使わない）', () => {
        const game = atInnEve(3, ['hiroshige', 'chuubei', 'kinko']);
        moveTo(game, 14); // 席2（浪人）
        while (game.pending) act(game, game.pending.seat, { type: 'meal', card: null });
        moveTo(game, 14); // 席1（飛脚）
        expect(game.players[1].encounters).toHaveLength(1);
        while (game.pending) {
            const p = game.pending;
            act(game, p.seat, p.kind === 'meal' ? { type: 'meal', card: null } : p.kind === 'panorama' ? { type: 'panorama', kind: p.options[0] } : { type: 'encounter', card: p.cards[0] });
        }
        moveTo(game, 14); // 席0（絵師）
        expect(game.pending).toMatchObject({ seat: 0, kind: 'panorama', options: ['paddy', 'mountain', 'sea'] });
        act(game, 0, { type: 'panorama', kind: 'sea' });
        expect(game.pending.kind).toBe('meal');
        expect(game.players[0].panoramas.sea).toBe(1);

        const edo = startTravel(3, ['hiroshige', 'chuubei', 'kinko']);
        place(edo, [53, 52, 51]);
        moveTo(edo, EDO);
        while (edo.pending) act(edo, edo.pending.seat, { type: 'meal', card: null });
        moveTo(edo, EDO);
        expect(edo.players[1].encounters).toHaveLength(0);
        while (edo.pending) act(edo, edo.pending.seat, { type: 'meal', card: null });
        moveTo(edo, EDO);
        expect(edo.players[0].panoramas.sea).toBe(0);
    });

    it('全員が江戸に着いたら終わる', () => {
        const game = startTravel(3);
        place(game, [53, 52, 51]);
        for (let i = 0; i < 3; i++) {
            moveTo(game, EDO);
            while (game.pending) act(game, game.pending.seat, { type: 'meal', card: null });
        }
        expect(game.isOver()).toBe(true);
        expect(game.applyCommand(0, { type: 'move', to: EDO })).toBe(false);
    });

    it('宿場で全員が揃うまで、先に着いた人は動けない', () => {
        const game = atInnEve(3, ['kinko', 'zenemon', 'mitsukuni']);
        finishInn(game);
        expect(game.tokens.every(t => t.pos === 14)).toBe(true);
    });
});

describe('2人のとき', () => {
    it('中立の旅人が加わり、いちばん後ろなら先頭の人が動かす', () => {
        const game = startTravel(2);
        expect(game.tokens).toHaveLength(3);
        expect(game.tokens[2].player).toBe(null);
        place(game, [5, 8, 3]);
        expect(game.moverToken()).toBe(2);
        expect(game.moverSeat()).toBe(1);
        expect(game.applyCommand(0, { type: 'move', to: 4 })).toBe(false);
        act(game, 1, { type: 'move', to: 4 });
        // 中立の旅人は景色を取らない
        expect(game.players.every(p => p.panoramas.paddy === 0)).toBe(true);
    });

    it('2マスには1人しか止まれない（2人と中立の旅人は3人として数える）', () => {
        const game = startTravel(2);
        place(game, [0, 1, 20]);
        expect(game.legalMoves(0)).not.toContain(1);
    });

    it('中立の旅人は寺で場の1文を寄付し、寄付の順位に入る', () => {
        const game = startTravel(2);
        place(game, [5, 8, 1]);
        moveTo(game, 2);
        expect(game.tokens[2].donations).toBe(1);
    });

    it('最初に着いた人は4枚を引き、中立の旅人が着くと、動かした人が1枚をランダムに捨てる', () => {
        const game = startTravel(2);
        place(game, [13, 12, 11]);
        moveTo(game, 14); // 中立の旅人（先に着く）
        expect(game.inn.meals).toHaveLength(3);
        expect(game.decks.meal).toHaveLength(25 - 4 + 1);
        expect(totalCards(game)).toBe(TOTAL_CARDS);
    });
});

describe('終わりの得点', () => {
    // 江戸の手前で状態を作り、全員を江戸へ
    const finish = (setup) => {
        const game = startTravel(setup.length, setup.map(s => s.traveler ?? null));
        place(game, setup.map((_, i) => 53 - i));
        setup.forEach((s, i) => Object.assign(game.players[i], s.state));
        game.players.forEach(p => { p.coins = 0; });
        while (!game.isOver()) {
            moveTo(game, EDO);
            while (game.pending) act(game, game.pending.seat, { type: 'meal', card: null });
        }
        return game;
    };

    it('寺の寄付：1番多い額10点・2番目7点・3番目4点・ほかの寄付した人2点。同じ額は同じ点', () => {
        const game = finish([{ state: { donations: 5 } }, { state: { donations: 3 } }, { state: { donations: 3 } }, { state: { donations: 0 } }, { state: { donations: 1 } }]);
        expect(game.result.temple).toEqual([10, 7, 7, 0, 4]);
    });

    it('称号（食通・収集家・湯治客・話し好き）は最も多い人に3点。同点は全員。隠居は称号1枚ごとに＋1', () => {
        const game = finish([
            { traveler: 'mitsukuni', state: { meals: ['unagi:1', 'dango:1'], springs: ['2:1'] } },
            { state: { meals: ['fugu:1', 'dango:2'], souvenirs: ['koma'] } },
            { state: { encounters: ['samurai:1'], springs: ['3:1'] } }
        ]);
        expect(game.result.awards).toEqual({ gourmet: [0, 1], collector: [1], bather: [0, 2], chatterbox: [2] });
        expect(game.players[0].points.achievement).toBe(8);
        expect(game.players[1].points.achievement).toBe(6);
    });

    it('点が同じなら、称号の多い人が勝ち', () => {
        const game = finish([
            { state: { score: 40, souvenirs: ['koma'] } },
            { state: { score: 43 } },
            { state: { score: 0 } }
        ]);
        // 席0：40＋収集家3＝43、席1：43。称号の多い席0の勝ち
        expect(game.players[0].score).toBe(game.players[1].score);
        expect(game.winners).toEqual([0]);
    });
});

describe('断る操作', () => {
    it('番でない人・知らない種類・形の違う操作は断り、状態を変えない', () => {
        const game = startTravel(3);
        const before = snapshot(game);
        const seat = game.moverSeat();
        const other = (seat + 1) % 3;
        [[other, { type: 'move', to: 1 }], [seat, { type: 'fly' }], [seat, null], [seat, 'move'], [seat, { type: 'buy', cards: [] }],
            [seat, { type: 'meal', card: null }], [seat, { type: 'choose', traveler: 'kinko' }], [seat, { type: 'move', to: () => 1 }]]
            .forEach(([s, c]) => expect(game.applyCommand(s, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録には決まった項目だけを残す', () => {
        const game = newGame(3);
        act(game, 0, { type: 'choose', traveler: game.players[0].offers[0], extra: 'x'.repeat(50) });
        expect(game.commands[0].command).toEqual({ type: 'choose', traveler: game.players[0].offers[0] });
    });
});

it('同じシードなら同じ配り方と並び', () => {
    expect(snapshot(new Game([{ name: 'a' }, { name: 'b' }, { name: 'c' }], { seed: 9 }))).toBe(snapshot(new Game([{ name: 'a' }, { name: 'b' }, { name: 'c' }], { seed: 9 })));
});
