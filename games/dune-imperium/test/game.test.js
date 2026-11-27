import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { candidates } from '../public/js/cpu-player.js';
import { newGame, setHand, run, agent, choose, snapshot, playRandom, players } from './helpers.js';

// 番を終えて、席 seat の番まで進める（ほかの人は公開して何も買わない）
function revealUntil(game, seat) {
    let guard = 0;
    while (game.current !== seat && guard++ < 20) {
        const s = game.current;
        run(game, [[s, { type: 'reveal' }]]);
        if (game.pending) throw new Error('思わぬ選択');
        run(game, [[s, { type: 'done' }]]);
    }
}

// 全員が公開して戦いまで進める
function revealAll(game) {
    let guard = 0;
    const round = game.round;
    while (game.phase === 'turns' && game.round === round && guard++ < 20) {
        const s = game.current;
        run(game, [[s, { type: 'reveal' }]]);
        while (game.pending) run(game, [[game.pending.seat, choose(0)]]);
        if (game.phase === 'turns' && game.round === round && game.stage === 'buy') run(game, [[s, { type: 'done' }]]);
    }
}

describe('準備', () => {
    it('全員が5枚の手札・駐屯地に3部隊・水1で始まり、列に5枚並ぶ', () => {
        const game = new Game(players(4), { seed: 3 });
        game.players.forEach(p => {
            expect(p.hand.length).toBe(5);
            expect(p.deck.length).toBe(5);
            expect(p.garrison).toBe(3);
            expect(p.water).toBe(1);
            expect(p.agentsLeft).toBe(2);
        });
        expect(game.row.length).toBe(5);
        expect(game.conflictDeck.length).toBe(9);
        expect(new Set(game.players.map(p => p.leader)).size).toBe(4);
    });

    it('同じシードなら同じ準備になる。リーダーは指定でき、ラッバーンは資源が多い', () => {
        expect(snapshot(new Game(players(3), { seed: 8 }))).toBe(snapshot(new Game(players(3), { seed: 8 })));
        const game = newGame(2, { leaders: ['rabban', 'paul'] });
        expect(game.players.map(p => p.leader)).toEqual(['rabban', 'paul']);
        expect(game.players[0]).toMatchObject({ solari: 1, spice: 1 });
        expect(game.players[1]).toMatchObject({ solari: 0, spice: 0 });
    });

    it('紛争の山はレベル1・2・3の順に並ぶ', () => {
        const game = newGame(3);
        expect(game.conflict).toMatch(/^skirmish/);
    });
});

describe('エージェントを置く', () => {
    it('カードの印と同じ印の場所に置き、場所の効果と勢力の影響力を得る', () => {
        const game = newGame(3);
        setHand(game, 0, ['diplomacy', 'dagger']);
        run(game, [[0, agent(0, 'wealth')]]);
        const p = game.players[0];
        expect(p.solari).toBe(2);
        expect(p.influence.emperor).toBe(1);
        expect(p.played).toEqual(['diplomacy']);
        expect(p.agentsLeft).toBe(1);
        expect(game.occupied.wealth).toEqual([0]);
        expect(game.current).toBe(1);
    });

    it('印が合わない・ほかの人がいる・費用が足りない場所には置けず、状態は変わらない', () => {
        const game = newGame(3);
        setHand(game, 0, ['dagger', 'diplomacy', 'dunePlanet']);
        game.occupied.wealth = [1];
        const before = snapshot(game);
        [agent(0, 'wealth'), agent(1, 'wealth'), agent(2, 'greatFlat'), agent(1, 'conspire'), agent(5, 'wealth'), agent(0, 'nowhere')].forEach(c => {
            expect(game.applyCommand(0, c), JSON.stringify(c)).toBe(false);
        });
        expect(game.applyCommand(1, agent(0, 'wealth'))).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('紛争の場所では、この番に得た部隊と駐屯地の2部隊までを送れる', () => {
        const game = newGame(3);
        setHand(game, 0, ['diplomacy']);
        run(game, [[0, agent(0, 'hardy')]]);
        expect(game.players[0].garrison).toBe(5);
        expect(game.pending).toMatchObject({ kind: 'deploy', seat: 0, options: [0, 1, 2, 3, 4] });
        run(game, [[0, choose(4)]]);
        expect(game.players[0]).toMatchObject({ garrison: 1, troopsIn: 4, water: 0 });
        expect(game.current).toBe(1);
    });

    it('影響力2で1点、4で褒美と同盟（1点）。追い越されると同盟は移る', () => {
        const game = newGame(3, { leaders: ['paul', 'leto', 'helena'] });
        game.changeInfluence(0, 'guild', 1);
        game.changeInfluence(0, 'guild', 1);
        expect(game.players[0].vp).toBe(1);
        game.changeInfluence(0, 'guild', 2);
        game.process();
        expect(game.players[0].solari).toBe(3);
        expect(game.alliance.guild).toBe(0);
        expect(game.players[0].vp).toBe(2);
        [1, 1, 1, 1].forEach(() => game.changeInfluence(1, 'guild', 1));
        expect(game.alliance.guild).toBe(0); // 並んだだけでは移らない
        game.changeInfluence(1, 'guild', 1);
        expect(game.alliance.guild).toBe(1);
        expect(game.players[0].vp).toBe(1);
        expect(game.players[1].vp).toBe(2);
    });

    it('メンタートでこのラウンドだけエージェントが増え、ソードマスターで3人目になる', () => {
        const game = newGame(2, { leaders: ['paul', 'helena'] });
        game.players[0].solari = 10;
        setHand(game, 0, ['signet', 'dagger', 'dagger']);
        run(game, [[0, agent(1, 'mentat')]]);
        expect(game.players[0].agentsLeft).toBe(2);
        expect(game.mentatHolder).toBe(0);
        run(game, [[1, { type: 'reveal' }], [1, { type: 'done' }]]);
        run(game, [[0, agent(1, 'swordmaster')]]);
        expect(game.players[0]).toMatchObject({ agents: 3, agentsLeft: 2, swordmaster: true, solari: 0 });
    });

    it('リーダーの能力：レトはランドスラードが1ソラリ安く、ヘレナはほかの人がいても置ける', () => {
        const game = newGame(2, { leaders: ['leto', 'helena'] });
        game.players[0].solari = 4;
        setHand(game, 0, ['signet']);
        game.players[0].solari = 3;
        run(game, [[0, agent(0, 'rally')]]);
        expect(game.players[0].solari).toBe(0);
        while (game.pending) run(game, [[game.pending.seat, choose(0)]]);
        game.players[1].solari = 4;
        setHand(game, 1, ['dagger']);
        run(game, [[1, agent(0, 'rally')]]);
        expect(game.occupied.rally).toEqual([0, 1]);
    });

    it('メランジの売却：払う量を選んでソラリに換える', () => {
        const game = newGame(2, { leaders: ['memnon', 'paul'] });
        game.players[0].spice = 4;
        setHand(game, 0, ['dunePlanet']);
        run(game, [[0, agent(0, 'sell')]]);
        expect(game.pending).toMatchObject({ kind: 'sell', options: [2, 3, 4] });
        run(game, [[0, choose(2)]]);
        expect(game.players[0]).toMatchObject({ spice: 0, solari: 12 });
    });

    it('同盟を求めては、使うと除外される', () => {
        const game = newGame(2);
        setHand(game, 0, ['seekAllies']);
        run(game, [[0, agent(0, 'stillsuits')]]);
        expect(game.players[0].played).toEqual([]);
        expect(game.players[0].trashed).toEqual(['seekAllies']);
    });
});

describe('公開と買い物', () => {
    it('公開した手札の説得で列のカードを買い、列はすぐ補われる。評議会の席は説得+2', () => {
        const game = newGame(2);
        game.players[0].council = true;
        setHand(game, 0, ['convincing', 'convincing', 'dagger']);
        game.row[0] = 'stilgar';
        run(game, [[0, { type: 'reveal' }]]);
        const p = game.players[0];
        expect(p.persuasion).toBe(6);
        expect(p.swords).toBe(1);
        expect(game.stage).toBe('buy');
        const left = game.imperiumDeck.length;
        run(game, [[0, { type: 'buy', slot: 0 }]]);
        expect(p.persuasion).toBe(1);
        expect(p.discard).toContain('stilgar');
        expect(game.row.length).toBe(5);
        expect(game.imperiumDeck.length).toBe(left - 1);
        expect(game.applyCommand(0, { type: 'buy', slot: 'liaison' })).toBe(false);
        expect(game.applyCommand(0, { type: 'agent', card: 0, space: 'wealth' })).toBe(false);
        run(game, [[0, { type: 'done' }]]);
        expect(game.current).toBe(1);
    });

    it('「スパイスは流れねばならない」は買うと1点', () => {
        const game = newGame(2);
        setHand(game, 0, []);
        run(game, [[0, { type: 'reveal' }]]);
        game.players[0].persuasion = 9;
        run(game, [[0, { type: 'buy', slot: 'spiceFlow' }]]);
        expect(game.players[0].vp).toBe(1);
        expect(game.reserve.spiceFlow).toBe(9);
    });
});

describe('戦い', () => {
    it('戦力の順に褒美。同点の1位は2位の褒美を得る', () => {
        const game = newGame(4, { leaders: ['paul', 'leto', 'helena', 'ilban'] });
        game.conflict = 'greatWar';
        game.players.forEach(p => setHand(game, p.id, []));
        game.players[0].troopsIn = 2;
        game.players[1].troopsIn = 2;
        game.players[2].troopsIn = 1;
        game.players.forEach(p => { p.intrigue = []; });
        revealAll(game);
        // 席0と1は4（同点）、席2は2＋剣
        expect(game.round).toBe(2);
        const [a, b] = game.players;
        expect(a.vp).toBe(0);
        expect(b.vp).toBe(0);
        expect(a.intrigue.length).toBe(1);
        expect(a.spice).toBe(3);
        expect(b.spice).toBe(3);
        expect(game.players[2].spice).toBe(2);
        expect(game.players[3].spice).toBe(0);
        expect(game.players.every(p => p.troopsIn === 0)).toBe(true);
    });

    it('剣は部隊が紛争にいるときだけ数える。戦闘の陰謀カードで剣を足せる', () => {
        const game = newGame(2);
        game.conflict = 'greatWar';
        game.players[0].troopsIn = 1;
        game.players[0].intrigue = ['ambush'];
        game.players[1].troopsIn = 2;
        game.players[1].intrigue = [];
        setHand(game, 0, []);
        setHand(game, 1, ['dagger']);
        run(game, [[0, { type: 'reveal' }], [0, { type: 'done' }], [1, { type: 'reveal' }], [1, { type: 'done' }]]);
        expect(game.phase).toBe('combat');
        expect(game.actors()).toEqual([0]);
        expect(game.strength(0)).toBe(2);
        expect(game.strength(1)).toBe(5);
        run(game, [[0, { type: 'combat', index: 0 }]]);
        expect(game.players[0].vp).toBe(2);
        expect(game.players[1].vp).toBe(0);
    });

    it('だれもいない砂漠にはスパイスがたまり、置いた人がまとめて得る', () => {
        const game = newGame(2, { leaders: ['paul', 'leto'] });
        game.players.forEach(p => { p.intrigue = []; });
        revealAll(game);
        expect(game.bonusSpice).toEqual({ imperialBasin: 1, hagga: 1, greatFlat: 1 });
        const s = game.current;
        setHand(game, s, ['dunePlanet']);
        run(game, [[s, agent(0, 'imperialBasin')], [s, choose(0)]]);
        expect(game.players[s].spice).toBe(2);
        expect(game.bonusSpice.imperialBasin).toBe(0);
    });

    it('支配した場所は、だれかが置くたびに持ち主が得る', () => {
        const game = newGame(2);
        game.control.arrakeen = 1;
        setHand(game, 0, ['recon']);
        run(game, [[0, agent(0, 'arrakeen')]]);
        expect(game.players[1].solari).toBe(1);
    });
});

describe('ゲームの終わり', () => {
    it('ラウンドの終わりにだれかが10点以上なら終わり、点が同じならスパイスの多い人が勝つ', () => {
        const game = newGame(2, { leaders: ['paul', 'leto'] });
        game.players.forEach(p => { p.intrigue = []; });
        game.players[0].vp = 10;
        game.players[1].vp = 10;
        game.players[1].spice = 3;
        revealAll(game);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([1]);
        expect(game.applyCommand(0, { type: 'reveal' })).toBe(false);
    });

    it('終局の陰謀カードは条件を満たせば1点', () => {
        const game = newGame(2);
        game.players.forEach(p => { p.intrigue = []; });
        game.players[0].intrigue = ['wealthEnd', 'hoardEnd'];
        game.players[0].solari = 8;
        game.players[0].vp = 10;
        revealAll(game);
        expect(game.players[0].vp).toBe(11);
    });

    it.each([2, 3, 4])('%i人のランダムな試合が最後まで進む', (n) => {
        for (let seed = 1; seed <= 4; seed++) {
            const game = playRandom(new Game(players(n), { seed }), seed * 13);
            expect(game.isOver()).toBe(true);
            expect(game.round).toBeLessThanOrEqual(10);
        }
    });
});

describe('記録からの再現', () => {
    it.each([1, 2, 3])('ランダムな試合を記録から再現すると同じ状態になる（シード %i）', (seed) => {
        const game = playRandom(new Game(players(3), { seed, leaders: ['paul', null, 'helena'] }), seed);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
    });

    it('途中の記録からも同じ局面に戻る', () => {
        const game = new Game(players(4), { seed: 21 });
        playRandom(game, 5, 300);
        const saved = game.persist();
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('断る操作は状態を変えない（試合の途中でいろいろな操作を試す）', () => {
        const game = new Game(players(3), { seed: 4 });
        const bad = [
            { type: 'agent', card: 0, space: 'moon' }, { type: 'agent', card: -1, space: 'wealth' }, { type: 'buy', slot: 99 },
            { type: 'buy', slot: 'nothing' }, { type: 'plot', index: 50 }, { type: 'choose', index: 99 },
            { type: 'combat', index: 50 }, { type: 'unknown' }
        ];
        let state = 7;
        for (let step = 0; step < 600 && !game.isOver(); step++) {
            const [seat] = game.actors();
            bad.forEach(command => {
                [seat, (seat + 1) % 3].forEach(s => {
                    const before = snapshot(game);
                    if (!game.applyCommand(s, command)) expect(snapshot(game)).toBe(before);
                    else throw new Error(`通ってしまった: ${JSON.stringify(command)}`);
                });
            });
            const list = candidates(game, seat);
            state = (state * 1103515245 + 12345) >>> 0;
            expect(game.applyCommand(seat, list[state % list.length])).toBe(true);
        }
    });
});
