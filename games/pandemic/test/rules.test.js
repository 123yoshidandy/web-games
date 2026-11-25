import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import {
    CITIES, EDGES, NEIGHBORS, EVENT_BY_KEY, EPIDEMIC_BASE, START_CITY, HAND_SIZES, LEVELS, isEpidemicCard, isCityCard
} from '../public/js/cities.js';
import { makeGame, players, C, clearBoard, setCubes, setHand, moveTo, snapshot, pass } from './helpers.js';

const cubesOn = (game, name) => game.cubes[C(name)];
const total = (game, color) => 24 - game.supply[color];

describe('地図', () => {
    it('48都市が4色×12で、つながりは向きなしでそろっている', () => {
        expect(CITIES).toHaveLength(48);
        [0, 1, 2, 3].forEach(color => expect(CITIES.filter(c => c.color === color)).toHaveLength(12));
        expect(new Set(EDGES.map(([a, b]) => [a, b].sort((x, y) => x - y).join('-'))).size).toBe(EDGES.length);
        NEIGHBORS.forEach((list, a) => list.forEach(b => expect(NEIGHBORS[b]).toContain(a)));
        expect(EDGES.length).toBe(93);
    });

    it('どの都市からも、すべての都市へ行ける', () => {
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) NEIGHBORS[queue.shift()].forEach(n => !seen.has(n) && (seen.add(n), queue.push(n)));
        expect(seen.size).toBe(48);
    });
});

describe('準備', () => {
    it('9都市に3・2・1個ずつ置き、研究所と駒はアトランタ', () => {
        const game = makeGame(3, { seed: 5 });
        const counts = CITIES.map(c => game.cubes[c.id].reduce((a, b) => a + b, 0)).filter(Boolean).sort();
        expect(counts).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
        expect(game.infectionDiscard).toHaveLength(9);
        expect(game.infectionDeck).toHaveLength(39);
        expect(game.stations).toEqual([START_CITY]);
        game.players.forEach(p => expect(p.city).toBe(START_CITY));
        // 置いた病原体は、その都市の色
        CITIES.forEach(c => game.cubes[c.id].forEach((n, color) => n && expect(color).toBe(c.color)));
    });

    it('初期の手札は2人4枚・3人3枚・4人2枚。山は伝染を含めて正しい枚数', () => {
        [2, 3, 4].forEach(n => Object.keys(LEVELS).forEach(level => {
            const game = makeGame(n, { seed: n * 7, level });
            game.players.forEach(p => expect(p.hand).toHaveLength(HAND_SIZES[n]));
            const epidemics = LEVELS[level].epidemics;
            expect(game.playerDeck).toHaveLength(53 - n * HAND_SIZES[n] + epidemics);
            expect(game.playerDeck.filter(isEpidemicCard)).toHaveLength(epidemics);
        }));
    });

    it('伝染は、山を等分した各山に1枚ずつ入る（大きい山が上）', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = makeGame(4, { seed, level: 'heroic' });
            let start = 0;
            game.pileSizes.forEach((size, i) => {
                const pile = game.playerDeck.slice(start, start + size);
                expect(pile.filter(isEpidemicCard)).toHaveLength(1);
                if (i > 0) expect(size).toBeLessThanOrEqual(game.pileSizes[i - 1]);
                start += size;
            });
            expect(start).toBe(game.playerDeck.length);
        }
    });

    it('最初の手番は、人口がいちばん多い都市カードを持っている人', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = makeGame(4, { seed });
            const best = Math.max(...game.players.flatMap(p => p.hand.filter(isCityCard).map(c => CITIES[c].pop)));
            expect(game.players[game.current].hand.some(c => isCityCard(c) && CITIES[c].pop === best)).toBe(true);
        }
    });

    it('役割は7種から重ならずに選ばれ、指定もできる', () => {
        const game = makeGame(4, { seed: 3 });
        expect(new Set(game.players.map(p => p.role)).size).toBe(4);
        const fixed = makeGame(2, { roles: ['medic', 'dispatcher'] });
        expect(fixed.players.map(p => p.role)).toEqual(['medic', 'dispatcher']);
    });

    it('同じシードなら同じ準備になる', () => {
        expect(snapshot(makeGame(3, { seed: 42 }))).toBe(snapshot(makeGame(3, { seed: 42 })));
        expect(snapshot(makeGame(3, { seed: 42 }))).not.toBe(snapshot(makeGame(3, { seed: 43 })));
    });
});

// 決まった役割の2人で、P1 の手番から始める
function setup(roles = ['scientist', 'researcher'], seed = 1) {
    const game = makeGame(roles.length, { seed, roles });
    game.current = 0;
    clearBoard(game);
    game.players.forEach((p, i) => setHand(game, i, []));
    return game;
}

describe('移動', () => {
    it('車・船はつながった都市へ。つながっていなければ断る', () => {
        const game = setup();
        expect(game.applyCommand(0, { type: 'drive', to: C('Chicago') })).toBe(true);
        expect(game.players[0].city).toBe(C('Chicago'));
        expect(game.applyCommand(0, { type: 'drive', to: C('Tokyo') })).toBe(false);
        expect(game.actionsLeft).toBe(3);
    });

    it('直行便は行き先のカード、チャーター便は今いる都市のカードを捨てる', () => {
        const game = setup();
        setHand(game, 0, ['Tokyo', 'Atlanta']);
        expect(game.applyCommand(0, { type: 'direct', card: C('Tokyo') })).toBe(true);
        expect(game.players[0].city).toBe(C('Tokyo'));
        expect(game.playerDiscard).toContain(C('Tokyo'));
        expect(game.applyCommand(0, { type: 'charter', to: C('Paris') })).toBe(false);
        moveTo(game, 0, 'Atlanta');
        expect(game.applyCommand(0, { type: 'charter', to: C('Paris') })).toBe(true);
        expect(game.players[0].city).toBe(C('Paris'));
        expect(game.players[0].hand).toEqual([]);
    });

    it('シャトル便は研究所から研究所へ', () => {
        const game = setup();
        expect(game.applyCommand(0, { type: 'shuttle', to: C('Paris') })).toBe(false);
        game.stations.push(C('Paris'));
        expect(game.applyCommand(0, { type: 'shuttle', to: C('Paris') })).toBe(true);
    });

    it('ほかの駒は、通信指令員だけが動かせる', () => {
        const game = setup(['scientist', 'dispatcher']);
        expect(game.applyCommand(0, { type: 'drive', pawn: 1, to: C('Chicago') })).toBe(false);
        game.current = 1;
        expect(game.applyCommand(1, { type: 'drive', pawn: 0, to: C('Chicago') })).toBe(true);
        expect(game.players[0].city).toBe(C('Chicago'));
        // 呼び寄せ：ほかの駒のいる都市へ
        expect(game.applyCommand(1, { type: 'dispatch', pawn: 1, to: C('Chicago') })).toBe(true);
        expect(game.players[1].city).toBe(C('Chicago'));
        expect(game.applyCommand(1, { type: 'dispatch', pawn: 0, to: C('Tokyo') })).toBe(false);
        // ほかの駒のチャーター便は、その駒のいる都市のカードを、通信指令員が捨てる
        setHand(game, 1, ['Chicago']);
        expect(game.applyCommand(1, { type: 'charter', pawn: 0, to: C('Sydney') })).toBe(true);
        expect(game.players[0].city).toBe(C('Sydney'));
        expect(game.players[1].hand).toEqual([]);
    });

    it('作戦エキスパートは、研究所から都市カード1枚でどこへでも（手番に1回）', () => {
        const game = setup(['ops', 'scientist']);
        setHand(game, 0, ['Tokyo', 'Paris']);
        expect(game.applyCommand(0, { type: 'opsmove', to: C('Sydney'), card: C('Paris') })).toBe(true);
        expect(game.players[0].city).toBe(C('Sydney'));
        moveTo(game, 0, 'Atlanta');
        expect(game.applyCommand(0, { type: 'opsmove', to: C('Lima'), card: C('Tokyo') })).toBe(false);
    });
});

describe('研究所・治療・共有・治療薬', () => {
    it('研究所は今いる都市のカードで建てる。6つあれば1つ移す', () => {
        const game = setup();
        moveTo(game, 0, 'Paris');
        setHand(game, 0, ['Paris', 'London']);
        expect(game.applyCommand(0, { type: 'build' })).toBe(true);
        expect(game.stations).toContain(C('Paris'));
        game.stations = ['Atlanta', 'Paris', 'Tokyo', 'Lima', 'Cairo', 'Delhi'].map(C);
        moveTo(game, 0, 'London');
        expect(game.applyCommand(0, { type: 'build' })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', remove: C('Tokyo') })).toBe(true);
        expect(game.stations).toHaveLength(6);
        expect(game.stations).not.toContain(C('Tokyo'));
        expect(game.stations).toContain(C('London'));
    });

    it('作戦エキスパートはカードなしで建てる', () => {
        const game = setup(['ops', 'medic']);
        moveTo(game, 0, 'Lima');
        expect(game.applyCommand(0, { type: 'build' })).toBe(true);
        expect(game.stations).toContain(C('Lima'));
    });

    it('治療は1個ずつ。治療薬のある色と衛生兵は全部', () => {
        const game = setup(['scientist', 'medic']);
        setCubes(game, { Atlanta: 3, Chicago: 3 });
        expect(game.applyCommand(0, { type: 'treat', color: 0 })).toBe(true);
        expect(cubesOn(game, 'Atlanta')[0]).toBe(2);
        game.cures[0] = 1;
        expect(game.applyCommand(0, { type: 'treat', color: 0 })).toBe(true);
        expect(cubesOn(game, 'Atlanta')[0]).toBe(0);
        expect(game.applyCommand(0, { type: 'treat', color: 0 })).toBe(false);
        game.cures[0] = 0;
        game.current = 1;
        game.actionsLeft = 4;
        moveTo(game, 1, 'Chicago');
        expect(game.applyCommand(1, { type: 'treat', color: 0 })).toBe(true);
        expect(cubesOn(game, 'Chicago')[0]).toBe(0);
    });

    it('知識の共有は、同じ都市にいて、その都市のカードだけ（研究員はどれでも渡せる）', () => {
        const game = setup(['scientist', 'researcher']);
        setHand(game, 0, ['Atlanta', 'Paris']);
        setHand(game, 1, ['Tokyo']);
        expect(game.applyCommand(0, { type: 'give', to: 1, card: C('Paris') })).toBe(false);
        expect(game.applyCommand(0, { type: 'give', to: 1, card: C('Atlanta') })).toBe(true);
        expect(game.players[1].hand).toContain(C('Atlanta'));
        // 研究員から受け取るのは、どのカードでもよい
        expect(game.applyCommand(0, { type: 'take', from: 1, card: C('Tokyo') })).toBe(true);
        expect(game.players[0].hand).toContain(C('Tokyo'));
        // 違う都市にいれば共有できない
        moveTo(game, 1, 'Chicago');
        expect(game.applyCommand(0, { type: 'take', from: 1, card: C('Atlanta') })).toBe(false);
    });

    it('共有で8枚になったら、受け取った人が捨てるまで待つ', () => {
        const game = setup();
        setHand(game, 0, ['Atlanta']);
        setHand(game, 1, ['Paris', 'London', 'Madrid', 'Essen', 'Milan', 'Tokyo', 'Lima']);
        expect(game.applyCommand(0, { type: 'give', to: 1, card: C('Atlanta') })).toBe(true);
        expect(game.phase).toBe('discard');
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(0, { type: 'drive', to: C('Chicago') })).toBe(false);
        expect(game.applyCommand(1, { type: 'discard', card: C('Lima') })).toBe(true);
        expect(game.phase).toBe('actions');
        expect(game.applyCommand(0, { type: 'drive', to: C('Chicago') })).toBe(true);
    });

    it('治療薬は研究所で同じ色5枚（科学者は4枚）。4色で勝ち', () => {
        const game = setup(['researcher', 'scientist']);
        setHand(game, 0, ['Paris', 'London', 'Madrid', 'Essen', 'Milan', 'Tokyo']);
        expect(game.applyCommand(0, { type: 'cure', cards: ['Paris', 'London', 'Madrid', 'Essen'].map(C) })).toBe(false);
        expect(game.applyCommand(0, { type: 'cure', cards: ['Paris', 'London', 'Madrid', 'Essen', 'Tokyo'].map(C) })).toBe(false);
        expect(game.applyCommand(0, { type: 'cure', cards: ['Paris', 'London', 'Madrid', 'Essen', 'Milan'].map(C) })).toBe(true);
        expect(game.cures[0]).toBe(2);   // 盤上に青がないので、すぐ根絶
        game.current = 1;
        game.actionsLeft = 4;
        setHand(game, 1, ['Lima', 'Bogota', 'Miami', 'Lagos']);
        setCubes(game, { Lima: 1 });
        expect(game.applyCommand(1, { type: 'cure', cards: ['Lima', 'Bogota', 'Miami', 'Lagos'].map(C) })).toBe(true);
        expect(game.cures[1]).toBe(1);
        game.cures[2] = 1;
        setHand(game, 1, ['Tokyo', 'Seoul', 'Beijing', 'Osaka']);
        expect(game.applyCommand(1, { type: 'cure', cards: ['Tokyo', 'Seoul', 'Beijing', 'Osaka'].map(C) })).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.result).toEqual({ won: true, reason: 'won' });
    });

    it('研究所がない都市では発見できない', () => {
        const game = setup(['scientist', 'medic']);
        moveTo(game, 0, 'Paris');
        setHand(game, 0, ['Paris', 'London', 'Madrid', 'Essen']);
        expect(game.applyCommand(0, { type: 'cure', cards: ['Paris', 'London', 'Madrid', 'Essen'].map(C) })).toBe(false);
    });
});

describe('衛生兵と検疫官', () => {
    it('衛生兵は、治療薬のある色を、着いた都市から取り除き、置かれるのも防ぐ', () => {
        const game = setup(['medic', 'scientist']);
        setCubes(game, { Chicago: 2, Tokyo: 1 });
        game.cures[0] = 1;
        expect(game.applyCommand(0, { type: 'drive', to: C('Chicago') })).toBe(true);
        expect(cubesOn(game, 'Chicago')[0]).toBe(0);
        game.infect(C('Chicago'), 0, 1);
        expect(cubesOn(game, 'Chicago')[0]).toBe(0);
        expect(game.cures[0]).toBe(2);
    });

    it('衛生兵のいる都市は、治療薬を発見した時点で取り除く', () => {
        const game = setup(['scientist', 'medic']);
        setCubes(game, { Paris: 2, Lima: 1 });
        moveTo(game, 1, 'Paris');
        setHand(game, 0, ['Paris', 'London', 'Madrid', 'Essen']);
        expect(game.applyCommand(0, { type: 'cure', cards: ['Paris', 'London', 'Madrid', 'Essen'].map(C) })).toBe(true);
        expect(cubesOn(game, 'Paris')[0]).toBe(0);
    });

    it('検疫官は、いる都市とつながった都市に置かせない（アウトブレイクも）', () => {
        const game = setup(['quarantine', 'scientist']);
        moveTo(game, 0, 'Paris');
        game.infect(C('London'), 0, 1);
        game.infect(C('Paris'), 0, 3);
        game.infect(C('Tokyo'), 3, 1);
        expect(cubesOn(game, 'London')[0]).toBe(0);
        expect(cubesOn(game, 'Paris')[0]).toBe(0);
        expect(cubesOn(game, 'Tokyo')[3]).toBe(1);
        setCubes(game, { 'New York': 3 });
        game.infect(C('New York'), 0, 1);
        expect(game.outbreaks).toBe(1);
        expect(cubesOn(game, 'London')[0]).toBe(0);
        expect(cubesOn(game, 'Madrid')[0]).toBe(0);
        expect(cubesOn(game, 'Montreal')[0]).toBe(1);
    });
});

describe('アウトブレイク', () => {
    it('3個の都市に置くと、つながった都市へ1個ずつ広がる', () => {
        const game = setup();
        setCubes(game, { Santiago: 3 });
        game.infect(C('Santiago'), 1, 1);
        expect(game.outbreaks).toBe(1);
        expect(cubesOn(game, 'Santiago')[1]).toBe(3);
        expect(cubesOn(game, 'Lima')[1]).toBe(1);
    });

    it('連鎖する。同じ都市は1回だけ', () => {
        const game = setup();
        setCubes(game, { Lima: 3, Santiago: 3, Bogota: 3 });
        game.infect(C('Santiago'), 1, 1);
        // Santiago → Lima → Bogota の順に連鎖し、Santiago には戻らない
        expect(game.outbreaks).toBe(3);
        expect(cubesOn(game, 'Santiago')[1]).toBe(3);
        expect(cubesOn(game, 'Mexico City')[1]).toBe(2);   // Lima と Bogota の両方から
        expect(cubesOn(game, 'Miami')[1]).toBe(1);
        expect(cubesOn(game, 'Sao Paulo')[1]).toBe(1);
        expect(cubesOn(game, 'Buenos Aires')[1]).toBe(1);
    });

    it('アウトブレイクの色は、広がる元の色（都市の色でなくても）', () => {
        const game = setup();
        setCubes(game, { Miami: [3, 0, 0, 0] });
        game.infect(C('Miami'), 0, 1);
        expect(cubesOn(game, 'Bogota')[0]).toBe(1);
        expect(cubesOn(game, 'Bogota')[1]).toBe(0);
    });

    it('8回目で負け', () => {
        const game = setup();
        game.outbreaks = 7;
        setCubes(game, { Santiago: 3 });
        game.infect(C('Santiago'), 1, 1);
        expect(game.isOver()).toBe(true);
        expect(game.result).toEqual({ won: false, reason: 'outbreaks' });
    });

    it('置く病原体が足りなければ負け', () => {
        const game = setup();
        game.supply[3] = 0;
        game.infect(C('Tokyo'), 3, 1);
        expect(game.result).toEqual({ won: false, reason: 'cubes' });
    });

    it('根絶した色は置かれない', () => {
        const game = setup();
        game.cures[3] = 2;
        game.infect(C('Tokyo'), 3, 3);
        expect(cubesOn(game, 'Tokyo')[3]).toBe(0);
    });
});

describe('カードを引く・伝染・感染', () => {
    it('2枚引いて、感染率の枚数だけ感染し、次の人へ', () => {
        const game = setup();
        game.playerDeck = ['Paris', 'Tokyo', 'Lima'].map(C);
        game.infectionDeck = ['Cairo', 'Delhi', 'Lagos'].map(C);
        pass(game);
        expect(game.phase).toBe('draw');
        expect(game.applyCommand(1, { type: 'draw' })).toBe(false);
        expect(game.applyCommand(0, { type: 'draw' })).toBe(true);
        expect(game.players[0].hand).toEqual(['Paris', 'Tokyo'].map(C));
        expect(game.phase).toBe('infect');
        expect(game.applyCommand(0, { type: 'infect' })).toBe(true);
        expect(cubesOn(game, 'Cairo')[2]).toBe(1);
        expect(cubesOn(game, 'Delhi')[2]).toBe(1);
        expect(cubesOn(game, 'Lagos')[1]).toBe(0);
        expect(game.current).toBe(1);
        expect(game.phase).toBe('actions');
        expect(game.actionsLeft).toBe(4);
    });

    it('伝染：感染率が上がり、一番下の都市に3個、捨て札を山の上へ戻す', () => {
        const game = setup();
        game.playerDeck = [EPIDEMIC_BASE, C('Paris'), C('Lima')];
        game.infectionDeck = ['Cairo', 'Delhi', 'Tokyo'].map(C);
        game.infectionDiscard = ['Lagos', 'Miami'].map(C);
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(game.rateIndex).toBe(1);
        expect(cubesOn(game, 'Tokyo')[3]).toBe(3);
        expect(game.infectionDeck.slice(0, 3).sort()).toEqual(['Lagos', 'Miami', 'Tokyo'].map(C).sort());
        expect(game.infectionDiscard).toEqual([]);
        expect(game.known).toEqual([['Lagos', 'Miami', 'Tokyo'].map(C).sort((a, b) => a - b)]);
        expect(game.players[0].hand).toEqual([C('Paris')]);
        expect(game.epidemicsDrawn).toBe(1);
    });

    it('伝染の都市にすでに病原体があれば、3個までにしてアウトブレイク', () => {
        const game = setup();
        setCubes(game, { Tokyo: 2 });
        game.playerDeck = [EPIDEMIC_BASE, C('Paris'), C('Lima')];
        game.infectionDeck = ['Cairo', 'Tokyo'].map(C);
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(cubesOn(game, 'Tokyo')[3]).toBe(3);
        expect(game.outbreaks).toBe(1);
        expect(cubesOn(game, 'Seoul')[3]).toBe(1);
    });

    it('2枚引けなければ負け', () => {
        const game = setup();
        game.playerDeck = [C('Paris')];
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(game.result).toEqual({ won: false, reason: 'deck' });
    });

    it('引いて8枚になったら、感染の前に捨てる', () => {
        const game = setup();
        setHand(game, 0, ['Paris', 'London', 'Madrid', 'Essen', 'Milan', 'Tokyo']);
        game.playerDeck = ['Lima', 'Bogota', 'Miami'].map(C);
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(game.phase).toBe('discard');
        expect(game.applyCommand(0, { type: 'infect' })).toBe(false);
        expect(game.applyCommand(0, { type: 'discard', card: C('Tokyo') })).toBe(true);
        expect(game.phase).toBe('infect');
    });
});

describe('イベント', () => {
    it('空輸：好きな駒を好きな都市へ。誰の手番でも使える', () => {
        const game = setup();
        setHand(game, 1, [EVENT_BY_KEY.airlift.id]);
        expect(game.applyCommand(1, { type: 'event', card: EVENT_BY_KEY.airlift.id, pawn: 0, to: C('Sydney') })).toBe(true);
        expect(game.players[0].city).toBe(C('Sydney'));
        expect(game.actionsLeft).toBe(4);
        expect(game.playerDiscard).toContain(EVENT_BY_KEY.airlift.id);
    });

    it('政府の助成金：好きな都市に研究所', () => {
        const game = setup();
        setHand(game, 0, [EVENT_BY_KEY.grant.id]);
        expect(game.applyCommand(0, { type: 'event', card: EVENT_BY_KEY.grant.id, city: C('Delhi') })).toBe(true);
        expect(game.stations).toContain(C('Delhi'));
    });

    it('静かな夜：次の感染をとばす', () => {
        const game = setup();
        setHand(game, 1, [EVENT_BY_KEY.quiet.id]);
        game.playerDeck = ['Paris', 'Tokyo', 'Lima'].map(C);
        game.infectionDeck = ['Cairo', 'Delhi'].map(C);
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(game.applyCommand(1, { type: 'event', card: EVENT_BY_KEY.quiet.id })).toBe(true);
        game.applyCommand(0, { type: 'infect' });
        expect(cubesOn(game, 'Cairo')[2]).toBe(0);
        expect(game.infectionDeck).toHaveLength(2);
        expect(game.quiet).toBe(false);
    });

    it('強い住民：伝染の感染と強化の間に使える', () => {
        const game = setup();
        setHand(game, 1, [EVENT_BY_KEY.resilient.id]);
        game.playerDeck = [EPIDEMIC_BASE, C('Paris'), C('Lima')];
        game.infectionDeck = ['Cairo', 'Tokyo'].map(C);
        game.infectionDiscard = [C('Lagos')];
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(game.phase).toBe('epidemic');
        expect(game.applyCommand(1, { type: 'event', card: EVENT_BY_KEY.resilient.id, city: C('Tokyo') })).toBe(true);
        expect(game.applyCommand(0, { type: 'intensify' })).toBe(true);
        expect(game.infectionRemoved).toEqual([C('Tokyo')]);
        expect(game.infectionDeck[0]).toBe(C('Lagos'));
        expect(game.infectionDeck).not.toContain(C('Tokyo'));
        expect(game.phase).toBe('infect');
        expect(game.players[0].hand).toEqual([C('Paris')]);
    });

    it('2枚とも伝染なら、1枚目を解決したあとにイベントを使える', () => {
        const game = setup();
        setHand(game, 1, [EVENT_BY_KEY.airlift.id]);
        game.playerDeck = [EPIDEMIC_BASE, EPIDEMIC_BASE + 1, C('Lima')];
        game.infectionDeck = ['Cairo', 'Tokyo', 'Paris'].map(C);
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(game.phase).toBe('between');
        expect(game.rateIndex).toBe(1);
        expect(game.applyCommand(1, { type: 'event', card: EVENT_BY_KEY.airlift.id, pawn: 0, to: C('Sydney') })).toBe(true);
        expect(game.applyCommand(0, { type: 'continue' })).toBe(true);
        expect(game.rateIndex).toBe(2);
        expect(game.phase).toBe('infect');
    });

    it('2枚とも伝染でも、イベントを誰も持っていなければ止まらない', () => {
        const game = setup();
        game.playerDeck = [EPIDEMIC_BASE, EPIDEMIC_BASE + 1, C('Lima')];
        game.infectionDeck = ['Cairo', 'Tokyo', 'Paris'].map(C);
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(game.rateIndex).toBe(2);
        expect(game.phase).toBe('infect');
    });

    it('伝染の途中は、強い住民のほかのイベントは使えない', () => {
        const game = setup();
        setHand(game, 1, [EVENT_BY_KEY.resilient.id, EVENT_BY_KEY.airlift.id]);
        game.playerDeck = [EPIDEMIC_BASE, C('Paris'), C('Lima')];
        pass(game);
        game.applyCommand(0, { type: 'draw' });
        expect(game.applyCommand(1, { type: 'event', card: EVENT_BY_KEY.airlift.id, pawn: 0, to: C('Sydney') })).toBe(false);
    });

    it('予測：上の6枚を並べ替える。並べた順は「次に出る」として分かる', () => {
        const game = setup();
        setHand(game, 0, [EVENT_BY_KEY.forecast.id]);
        game.infectionDeck = ['Cairo', 'Delhi', 'Tokyo', 'Lima', 'Paris', 'Seoul', 'Bogota'].map(C);
        expect(game.applyCommand(0, { type: 'event', card: EVENT_BY_KEY.forecast.id })).toBe(true);
        expect(game.phase).toBe('forecast');
        expect(game.applyCommand(0, { type: 'drive', to: C('Chicago') })).toBe(false);
        expect(game.applyCommand(0, { type: 'forecast', order: [0, 1, 2] })).toBe(false);
        expect(game.applyCommand(0, { type: 'forecast', order: [5, 4, 3, 2, 1, 0] })).toBe(true);
        expect(game.infectionDeck).toEqual(['Seoul', 'Paris', 'Lima', 'Tokyo', 'Delhi', 'Cairo', 'Bogota'].map(C));
        expect(game.known[0]).toEqual([C('Seoul')]);
        expect(game.phase).toBe('actions');
    });

    it('危機管理官は捨て札のイベントを拾い、使うとゲームから取り除く', () => {
        const game = setup(['planner', 'scientist']);
        game.playerDiscard = [EVENT_BY_KEY.airlift.id];
        expect(game.applyCommand(0, { type: 'retrieve', card: EVENT_BY_KEY.airlift.id })).toBe(true);
        expect(game.players[0].stored).toBe(EVENT_BY_KEY.airlift.id);
        expect(game.players[0].hand).toEqual([]);
        expect(game.applyCommand(0, { type: 'event', card: EVENT_BY_KEY.airlift.id, pawn: 1, to: C('Lima') })).toBe(false);
        expect(game.applyCommand(0, { type: 'event', card: EVENT_BY_KEY.airlift.id, stored: true, pawn: 1, to: C('Lima') })).toBe(true);
        expect(game.players[0].stored).toBe(null);
        expect(game.playerDiscard).not.toContain(EVENT_BY_KEY.airlift.id);
        expect(game.removedCards).toContain(EVENT_BY_KEY.airlift.id);
    });
});

describe('操作の受け付け', () => {
    it('断った操作は状態を変えない', () => {
        const game = makeGame(3, { seed: 9 });
        const before = snapshot(game);
        const seat = game.current;
        const other = (seat + 1) % 3;
        [
            [other, { type: 'drive', to: NEIGHBORS[START_CITY][0] }],
            [seat, { type: 'drive', to: C('Tokyo') }],
            [seat, { type: 'direct', card: 999 }],
            [seat, { type: 'charter', to: START_CITY }],
            [seat, { type: 'shuttle', to: C('Tokyo') }],
            [seat, { type: 'build' }],
            [seat, { type: 'treat', color: 7 }],
            [seat, { type: 'give', to: seat, card: 0 }],
            [seat, { type: 'cure', cards: [0, 1, 2, 3, 4] }],
            [seat, { type: 'draw' }],
            [seat, { type: 'infect' }],
            [seat, { type: 'discard', card: 0 }],
            [seat, { type: 'forecast', order: [] }],
            [seat, { type: 'event', card: 48, stored: true, pawn: 0, to: C('Tokyo') }],
            [seat, { type: 'nope' }],
            [seat, null],
            [99, { type: 'pass' }]
        ].forEach(([s, c]) => expect(game.applyCommand(s, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じゲームを再現できる。余計な項目は記録しない', () => {
        const game = makeGame(2, { seed: 11 });
        const seat = game.current;
        game.applyCommand(seat, { type: 'drive', to: NEIGHBORS[START_CITY][0], extra: 'x'.repeat(30) });
        expect(Object.keys(game.commands[0].command)).toEqual(['type', 'to']);
        pass(game);
        game.applyCommand(seat, { type: 'draw' });
        if (game.phase === 'infect') game.applyCommand(seat, { type: 'infect' });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('人数は2〜4人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(5))).toThrow();
    });
});
