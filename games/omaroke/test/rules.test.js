import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { POKEMON, rolesFor, leaderBonus } from '../public/js/data.js';
import { players, chooseAll, setupGame, stackWeather, handKeys, cardOf, snapshot } from './helpers.js';

// 追加効果も特性もない（またはテストに関わらない）ポケモン
const PLAIN = ['rhydon', 'golduck', 'slowbro', 'starmie'];

describe('準備', () => {
    it('4〜6 人。役割は 4 人で 1 人ずつ、5〜6 人は挑戦者が増える', () => {
        expect(() => new Game(players(3))).toThrow();
        expect(() => new Game(players(7))).toThrow();
        expect(rolesFor(4).sort()).toEqual(['challenger', 'leader', 'rocket', 'trainer']);
        expect(rolesFor(6).filter(r => r === 'challenger')).toHaveLength(3);
        for (let n = 4; n <= 6; n++) {
            const game = new Game(players(n), { seed: n });
            expect(game.players.map(p => p.role).sort()).toEqual(rolesFor(n).sort());
            expect(game.players.every(p => p.hand.length === 4)).toBe(true);
        }
    });

    it('基本ルールは Lv3 を 2 枚から 1 匹、玄人ルールは Lv1 を 4 枚から 2 匹選ぶ', () => {
        const basic = new Game(players(5), { seed: 3 });
        basic.players.forEach(p => {
            expect(p.offers).toHaveLength(2);
            expect(p.offers.every(id => POKEMON[id].level === 3)).toBe(true);
        });
        const expert = new Game(players(6), { seed: 3, mode: 'expert' });
        expert.players.forEach(p => {
            expect(p.offers).toHaveLength(4);
            expect(p.offers.every(id => POKEMON[id].level === 1)).toBe(true);
        });
        // 配られていないポケモンや、数の違う選び方は断る
        expect(basic.applyCommand(0, { type: 'choose', picks: [basic.players[1].offers[0]] })).toBe(false);
        expect(expert.applyCommand(0, { type: 'choose', picks: [expert.players[0].offers[0]] })).toBe(false);
    });

    it('全員が選ぶと公開し、ジムリーダーの番から始まる。リーダーの HP は人数に応じて増える', () => {
        const game = new Game(players(6), { seed: 8 });
        chooseAll(game);
        expect(game.phase).toBe('play');
        expect(game.turn.seat).toBe(game.leader);
        // リーダーは 4 枚 + 2 枚引いた
        expect(game.players[game.leader].hand).toHaveLength(6);
        const leader = game.players[game.leader].pokemon[0];
        expect(leader.maxHp).toBe(POKEMON[leader.id].hp + leaderBonus('basic', 6));
    });

    it('ほかの人の選んだポケモンは、全員が選ぶまで見えない', () => {
        const game = new Game(players(4), { seed: 2 });
        game.applyCommand(1, { type: 'choose', picks: [game.players[1].offers[0]] });
        const view = createGameView(game, 0);
        expect(view.players[1].ready).toBe(true);
        expect(view.players[1].pokemon).toEqual([]);
        expect(JSON.stringify(view)).not.toContain(game.players[1].offers[1]);
    });
});

describe('攻撃', () => {
    it('「くらえ！」は番に 1 回。受けた人は「よけて！」でよけるか、わざのダメージを受ける', () => {
        const game = setupGame({ mons: PLAIN, hands: ['kurae kurae', 'yokete', '', ''] });
        expect(game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 1 })).toBe(true);
        expect(game.prompt).toMatchObject({ seat: 1, kind: 'dodge' });
        expect(game.applyCommand(1, { type: 'respond', choice: 'yokete' })).toBe(true);
        expect(game.players[1].pokemon[0].hp).toBe(8);
        expect(handKeys(game, 1)).toEqual([]);
        // 2 回目は断る
        expect(game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 2 })).toBe(false);
        expect(game.lastError).toContain('番に 1 回');
    });

    it('「よけて！」がなければ、聞かずにダメージを受ける', () => {
        const game = setupGame({ mons: PLAIN, hands: ['kurae', '', '', ''] });
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 2 });
        expect(game.prompt).toBeNull();
        expect(game.players[2].pokemon[0].hp).toBe(9 - 2);
    });

    it('2 回攻撃のわざは、1 回ごとによける', () => {
        const game = setupGame({ mons: ['kangaskhan', ...PLAIN], hands: ['kurae', 'yokete', '', ''] });
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 1 });
        game.applyCommand(1, { type: 'respond', choice: 'yokete' });
        // 2 回目は「よけて！」がないので当たる（れんぞくパンチ 1）
        expect(game.players[1].pokemon[0].hp).toBe(POKEMON.rhydon.hp - 1);
    });

    it('HP が 0 になったら、持ち主から順にキズぐすりで助けられる。誰も助けなければひんしで、倒した人は 1 枚引く', () => {
        const game = setupGame({ mons: ['aerodactyl', ...PLAIN], hands: ['kurae', '', 'potion', 'potion'] });
        game.players[1].pokemon[0].hp = 3;
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 1 });
        // 持ち主（席 1）は持っていないので、次の席 2 に聞く
        expect(game.prompt).toMatchObject({ seat: 2, kind: 'rescue', victim: 1 });
        game.applyCommand(2, { type: 'respond', choice: 'pass' });
        expect(game.prompt).toMatchObject({ seat: 3, kind: 'rescue' });
        game.applyCommand(3, { type: 'respond', choice: cardOf(game, 3, 'potion') });
        expect(game.players[1].pokemon[0].hp).toBe(2);
        expect(game.acts.some(a => a.type === 'rescue' && a.from === 3 && a.to === 1)).toBe(true);

        const g2 = setupGame({ mons: ['aerodactyl', ...PLAIN], hands: ['kurae', '', '', ''] });
        g2.players[1].pokemon[0].hp = 3;
        g2.applyCommand(0, { type: 'play', card: cardOf(g2, 0, 'kurae'), target: 1 });
        expect(g2.players[1].alive).toBe(false);
        expect(g2.players[0].hand).toHaveLength(1);
    });

    it('退場した人の役割は公開される', () => {
        const game = setupGame({ mons: ['aerodactyl', ...PLAIN], hands: ['kurae', '', '', ''] });
        game.players[2].pokemon[0].hp = 1;
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 2 });
        const view = createGameView(game, 1);
        expect(view.players[2].role).toBe('challenger');
        expect(view.players[3].role).toBeNull();
        expect(view.players[0].role).toBe('leader');
    });
});

describe('勝ち負け', () => {
    const kill = (game, from, to) => {
        game.turn.seat = from;
        game.turn.attacks = 0;
        game.players[to].pokemon.forEach(m => { m.hp = 1; });
        game.players[from].hand.push(game.deck.find(id => game.cards[id].key === 'kurae'));
        game.deck = game.deck.filter(id => !game.players[from].hand.includes(id));
        game.applyCommand(from, { type: 'play', card: cardOf(game, from, 'kurae'), target: to });
    };

    it('挑戦者とロケット団員が全員退場したら、ジムリーダーとジムトレーナーの勝ち（トレーナーは退場していても勝つ）', () => {
        const game = setupGame({ mons: ['aerodactyl', ...PLAIN] });
        kill(game, 0, 1);
        kill(game, 0, 2);
        expect(game.isOver()).toBe(false);
        kill(game, 0, 3);
        expect(game.winnerSide).toBe('gym');
        expect(game.winners.sort()).toEqual([0, 1]);
    });

    it('ジムリーダーが退場したら挑戦者の勝ち。ロケット団員だけが残っていたら、ロケット団員の勝ち', () => {
        const a = setupGame({ mons: ['aerodactyl', ...PLAIN], seat: 2 });
        kill(a, 2, 0);
        expect(a.winnerSide).toBe('challenger');
        expect(a.winners).toEqual([2]);

        const b = setupGame({ mons: [...PLAIN, 'aerodactyl'] });
        kill(b, 3, 1);
        kill(b, 3, 2);
        kill(b, 3, 0);
        expect(b.winnerSide).toBe('rocket');
        expect(b.winners).toEqual([3]);
    });
});

describe('番の流れ', () => {
    it('番の初めに 2 枚引き、終わりに手札を 4 枚まで捨てる', () => {
        const game = setupGame({ mons: PLAIN, hands: ['kurae kurae kurae yokete potion nugget', '', '', ''] });
        game.applyCommand(0, { type: 'end' });
        expect(game.prompt).toMatchObject({ seat: 0, kind: 'trim', count: 2 });
        expect(game.applyCommand(0, { type: 'respond', discards: [cardOf(game, 0, 'kurae')] })).toBe(false);
        const two = game.players[0].hand.slice(0, 2);
        game.applyCommand(0, { type: 'respond', discards: two });
        expect(game.players[0].hand).toHaveLength(4);
        expect(game.turn.seat).toBe(1);
        expect(game.players[1].hand).toHaveLength(2);
    });

    it('残りが 2 人になったら、キズぐすりは使えない', () => {
        const game = setupGame({ mons: PLAIN, hands: ['potion', '', '', ''] });
        game.players[0].pokemon[0].hp = 3;
        expect(game.validate(0, { type: 'play', card: cardOf(game, 0, 'potion'), target: 0 })).toBeNull();
        game.players[2].alive = false;
        game.players[3].alive = false;
        expect(game.validate(0, { type: 'play', card: cardOf(game, 0, 'potion'), target: 0 })).toContain('2 人');
    });

    it('どくは番の初めに 1 ダメージ。ねむりの間は「くらえ！」を使えない', () => {
        const game = setupGame({ mons: PLAIN, hands: ['', 'kurae', '', ''] });
        game.players[1].pokemon[0].status = 'poison';
        game.applyCommand(0, { type: 'end' });
        expect(game.players[1].pokemon[0].hp).toBe(POKEMON.golduck.hp - 1);

        const g2 = setupGame({ mons: PLAIN, hands: ['kurae', '', '', ''] });
        g2.players[0].pokemon[0].status = 'sleep';
        expect(g2.applyCommand(0, { type: 'play', card: cardOf(g2, 0, 'kurae'), target: 1 })).toBe(false);
    });

    it('わざの追加効果は、おてんきチェックの結果で決まる', () => {
        // カビゴンののしかかりは「はれ」ならまひ
        const game = setupGame({ mons: ['snorlax', ...PLAIN], hands: ['kurae', '', '', ''] });
        stackWeather(game, 'sun');
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 1 });
        expect(game.players[1].pokemon[0].status).toBe('paralysis');
    });
});

describe('資料で確かめた細部', () => {
    it('ゴツゴツメットは、持っているポケモンがひんしになったら働かない', () => {
        const helmet = game => { const id = game.deck.find(x => game.cards[x].key === 'rockyHelmet'); game.deck.splice(game.deck.indexOf(id), 1); return id; };
        const a = setupGame({ mons: ['aerodactyl', ...PLAIN], hands: ['kurae', '', '', ''] });
        a.players[1].pokemon[0].item = helmet(a);
        a.applyCommand(0, { type: 'play', card: cardOf(a, 0, 'kurae'), target: 1 });
        expect(a.players[0].pokemon[0].maxHp - a.players[0].pokemon[0].hp).toBe(1);

        const b = setupGame({ mons: ['aerodactyl', ...PLAIN], hands: ['kurae', '', '', ''] });
        b.players[1].pokemon[0].item = helmet(b);
        b.players[1].pokemon[0].hp = 3;
        b.applyCommand(0, { type: 'play', card: cardOf(b, 0, 'kurae'), target: 1 });
        expect(b.players[1].alive).toBe(false);
        expect(b.players[0].pokemon[0].hp).toBe(b.players[0].pokemon[0].maxHp);
    });

    it('ひるみは、次の自分の番に山札から 1 枚しか引けない（引いたら治る）', () => {
        const game = setupGame({ mons: PLAIN });
        game.players[1].pokemon[0].status = 'flinch';
        game.applyCommand(0, { type: 'end' });
        expect(game.players[1].hand).toHaveLength(1);
        expect(game.players[1].pokemon[0].status).toBeNull();
    });

    it('ホネブーメランは 2 ダメージ。当たったあと、おてんきチェックが「はれ」ならもう 1 回攻撃する', () => {
        const game = setupGame({ mons: ['marowak', ...PLAIN], hands: ['kurae', '', '', ''] });
        stackWeather(game, 'sun', 'rain');
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 1 });
        expect(game.players[1].pokemon[0].maxHp - game.players[1].pokemon[0].hp).toBe(4);
    });
});

describe('イベント', () => {
    it('ミュウツーのプレッシャー：ほかの全員が「よけて！」を出すか 2 ダメージ。フリーザーの守りでも防げる', () => {
        const game = setupGame({ mons: PLAIN, hands: ['mewtwo', 'yokete', 'articuno', ''] });
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'mewtwo') });
        expect(game.prompt).toMatchObject({ seat: 1, kind: 'dodge', event: true });
        game.applyCommand(1, { type: 'respond', choice: 'yokete' });
        expect(game.prompt).toMatchObject({ seat: 2 });
        game.applyCommand(2, { type: 'respond', choice: 'articuno' });
        expect(game.players.map(p => p.pokemon[0].maxHp - p.pokemon[0].hp)).toEqual([0, 0, 0, 2]);
    });

    it('ファイヤーからの試練：「くらえ！」を捨てるか 2 ダメージ', () => {
        const game = setupGame({ mons: PLAIN, hands: ['moltres', 'kurae', '', ''] });
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'moltres') });
        game.applyCommand(1, { type: 'respond', choice: 'kurae' });
        expect(game.players.map(p => p.pokemon[0].maxHp - p.pokemon[0].hp)).toEqual([0, 0, 2, 2]);
    });

    it('ライバルからの挑戦：相手から順に「くらえ！」を捨て合い、先に出せなかった人が 2 ダメージ', () => {
        const game = setupGame({ mons: PLAIN, hands: ['rival kurae', 'kurae kurae', '', ''] });
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'rival'), target: 1 });
        expect(game.prompt).toMatchObject({ seat: 1, kind: 'discardAttack' });
        game.applyCommand(1, { type: 'respond', choice: 'kurae' });
        expect(game.prompt).toMatchObject({ seat: 0 });
        game.applyCommand(0, { type: 'respond', choice: 'kurae' });
        game.applyCommand(1, { type: 'respond', choice: 'kurae' });
        // 席 0 はもう「くらえ！」がない
        expect(game.players[0].pokemon[0].maxHp - game.players[0].pokemon[0].hp).toBe(2);
        expect(game.players[1].pokemon[0].maxHp - game.players[1].pokemon[0].hp).toBe(0);
    });

    it('バリヤードのトリック：取ったカードは、取った人と取られた人にだけ見える', () => {
        const game = setupGame({ mons: PLAIN, hands: ['mrMime', 'potion', '', ''] });
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'mrMime'), target: 1 });
        expect(handKeys(game, 0)).toEqual(['potion']);
        const text = view => view.logs.at(-1).text;
        expect(text(createGameView(game, 0))).toContain('キズぐすり');
        expect(text(createGameView(game, 1))).toContain('キズぐすり');
        expect(text(createGameView(game, 2))).not.toContain('キズぐすり');
    });

    it('きのみ大豊作：残っている人数分をめくり、使った人から順に 1 枚ずつ取る', () => {
        const game = setupGame({ mons: PLAIN, hands: ['berries', '', '', ''] });
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'berries') });
        expect(game.prompt).toMatchObject({ seat: 0, kind: 'pick' });
        expect(game.prompt.cards).toHaveLength(4);
        for (const seat of [0, 1, 2]) game.applyCommand(seat, { type: 'respond', choice: game.prompt.cards[0] });
        expect(game.players.map(p => p.hand.length)).toEqual([1, 1, 1, 1]);
    });
});

describe('玄人ルール', () => {
    const expert = (extra = {}) => setupGame({ mode: 'expert', mons: [['charmander', 'pikachu'], ['squirtle', 'meowth'], ['bulbasaur', 'mankey'], ['pidgey', 'psyduck']], ...extra });

    it('番に 1 回、バトルポケモンとベンチのポケモンを交代できる', () => {
        const game = expert();
        expect(game.applyCommand(0, { type: 'switch' })).toBe(true);
        expect(game.mon(0).id).toBe('pikachu');
        expect(game.applyCommand(0, { type: 'switch' })).toBe(false);
    });

    it('攻撃しなかった番の終わりに、ポケモン 1 匹を進化させられる（受けたダメージは引き継ぐ）', () => {
        const game = expert({ hands: ['kurae', '', '', ''] });
        game.players[0].pokemon[0].hp = 2;
        expect(game.applyCommand(0, { type: 'end', evolve: 0 })).toBe(true);
        const m = game.players[0].pokemon[0];
        expect(m.id).toBe('charmeleon');
        expect(m.maxHp - m.hp).toBe(POKEMON.charmander.hpX - 2);

        const g2 = expert({ hands: ['kurae', '', '', ''] });
        g2.applyCommand(0, { type: 'play', card: cardOf(g2, 0, 'kurae'), target: 1 });
        expect(g2.applyCommand(0, { type: 'end', evolve: 0 })).toBe(false);
    });

    it('バトルポケモンがひんしになったら、ベンチのポケモンが出る。2 匹ともひんしで退場', () => {
        const game = expert({ hands: ['kurae', '', '', ''] });
        game.players[1].pokemon[0].hp = 1;
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 1 });
        expect(game.players[1].alive).toBe(true);
        expect(game.mon(1).id).toBe('meowth');
    });
});

describe('記録と再現', () => {
    it('断る操作は状態を変えない', () => {
        const game = setupGame({ mons: PLAIN, hands: ['kurae yokete', 'yokete', '', ''] });
        const before = snapshot(game);
        const bad = [
            null, {}, { type: 'nothing' }, { type: 'play', card: 999 }, { type: 'play', card: cardOf(game, 0, 'yokete') },
            { type: 'play', card: cardOf(game, 0, 'kurae'), target: 0 }, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 9 },
            { type: 'respond', choice: 'take' }, { type: 'switch' }, { type: 'end', evolve: 0 }, { type: 'band', discards: [], target: 1 }
        ];
        bad.forEach(command => expect(game.applyCommand(0, command), JSON.stringify(command)).toBe(false));
        expect(game.applyCommand(1, { type: 'end' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('ビューには、ほかの人の手札と隠れた役割が入らない。よける答え待ちは、誰に聞いているかを伏せる', () => {
        const game = setupGame({ mons: PLAIN, hands: ['kurae', 'yokete', '', ''] });
        game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'kurae'), target: 1 });
        const view = createGameView(game, 2);
        expect(view.hand).toEqual([]);
        expect(view.players[1].handCount).toBe(1);
        expect(view.players[1].role).toBeNull();
        expect(view.prompt).toMatchObject({ kind: 'secret', seat: null });
        expect(view.waitingOn).toBeNull();
        expect(createGameView(game, 1).prompt).toMatchObject({ kind: 'dodge', seat: 1 });
        expect(JSON.stringify(view)).not.toContain('"offers":[');
    });
});
