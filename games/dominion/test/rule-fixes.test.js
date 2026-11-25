import { describe, it, expect } from 'vitest';
import { createGame, makeCards, DEFAULT_KINGDOM } from './helpers.js';

// 拡張のカードで、簡単にしていたところをルールどおりに直したもの（Issue #5）
// どのテストも、操作を applyCommand で行って記録し、同じ準備をしたゲームに記録を流して同じ結果になることを確かめる

const ids = (cards) => cards.map(card => card.id);

// build で同じ状態のゲームを作り、act で操作する。記録した操作を作り直したゲームに流して、ログが同じになるかを確かめる
const scenario = (build, act) => {
    const game = build();
    act(game);
    const again = build();
    game.commands.forEach(({ playerId, ...command }) => expect(again.applyCommand(playerId, command)).toBe(true));
    expect(again.logs).toEqual(game.logs);
    return game;
};

const current = (game) => game.getCurrentPlayer();
const send = (game, command, player = current(game)) => expect(game.applyCommand(player.id, command)).toBe(true);
const playCard = (game, id) => send(game, { type: 'play', cardIndex: current(game).hand.findIndex(card => card.id === id) });
const answer = (game, value) => {
    const prompt = game.pendingPrompt;
    expect(prompt).toBeTruthy();
    send(game, { type: 'answer', answer: value, promptId: prompt.id }, game.getController(prompt.player));
};
const pick = (game, id) => answer(game, [game.pendingPrompt.cards.findIndex(card => card.id === id)]);
// 手番のプレイヤーのターンを終える（残った選択には、いいえか先頭で答える）
const endTurn = (game) => {
    send(game, { type: 'endTurn' });
    while (game.pendingPrompt) answer(game, game.pendingPrompt.type === 'confirm' ? false : [0]);
};

const setup = (kingdom, options = {}, prepare = () => {}) => () => {
    const game = createGame(['A', 'B'], kingdom, { colonies: false, shelters: false, ...options });
    game.players.forEach(player => {
        player.deck = makeCards(Array(12).fill('COPPER'));
        player.discard = [];
    });
    prepare(game, current(game));
    return game;
};

describe('ルールどおりに直したカード', () => {
    it('改築で廃棄したカードの「廃棄したとき」の効果は、獲得するカードを選ぶ前に起きる', () => {
        const kingdom = ['remodel', 'squire', 'witch', ...DEFAULT_KINGDOM.filter(id => id !== 'witch').slice(0, 7)];
        const game = scenario(setup(kingdom, {}, (g, p) => { p.hand = makeCards(['REMODEL', 'SQUIRE', 'COPPER', 'COPPER', 'COPPER']); }), (g) => {
            playCard(g, 'remodel');
            pick(g, 'squire');
            // 先に従者の効果（アタックカードの獲得）を選ぶ
            expect(g.pendingPrompt.title).toBe('従者');
            pick(g, 'witch');
            expect(g.pendingPrompt.title).toBe('改築');
            pick(g, 'silver');
        });
        expect(ids(current(game).discard)).toEqual(['witch', 'silver']);
    });

    it('カメレオンの習性：効果で直接得る財宝（灯台）も、カードを引くことに入れ替わる', () => {
        const kingdom = ['lighthouse', ...DEFAULT_KINGDOM.slice(0, 9)];
        const game = scenario(setup(kingdom, { landscapes: ['way_of_the_chameleon'] }, (g, p) => { p.hand = makeCards(['LIGHTHOUSE', 'ESTATE']); }), (g) => {
            playCard(g, 'lighthouse');
            answer(g, [g.pendingPrompt.options.findIndex(option => option.startsWith('カメレオンの習性'))]);
        });
        const player = current(game);
        expect(player.coins).toBe(0);
        expect(ids(player.hand)).toEqual(['estate', 'copper']);
        expect(player.chameleonActive).toBe(false);
    });

    describe('守備隊', () => {
        const kingdom = ['forts', 'townsfolk', ...DEFAULT_KINGDOM.slice(0, 8)];
        const build = setup(kingdom, { ally: 'league_of_bankers' }, (g, p) => { p.hand = makeCards(['GARRISON', 'ESTATE']); });

        it('カードを獲得しなければトークンがないので、次のターンまで場に残らない', () => {
            const game = scenario(build, (g) => {
                playCard(g, 'garrison');
                endTurn(g);
            });
            const player = game.players.find(p => p.discard.some(card => card.id === 'garrison'));
            expect(player).toBeTruthy();
            expect(player.playArea).toHaveLength(0);
        });

        it('カードを獲得すれば、トークンが置かれて場に残る', () => {
            const game = scenario(build, (g) => {
                playCard(g, 'garrison');
                send(g, { type: 'buyPhase' });
                send(g, { type: 'buy', cardId: 'copper' });
                endTurn(g);
            });
            expect(game.players.some(p => ids(p.playArea).includes('garrison'))).toBe(true);
        });
    });

    it('航海の追加のターン：玉座の間で手札からプレイしたカードも3枚に数える', () => {
        const kingdom = ['odysseys', 'townsfolk', ...DEFAULT_KINGDOM.slice(0, 8)];
        const build = setup(kingdom, { ally: 'league_of_bankers' }, (g, p) => {
            p.hand = makeCards(['VOYAGE', 'ESTATE']);
            // 追加のターンの手札
            p.deck = makeCards(['THRONE_ROOM', 'VILLAGE', 'VILLAGE', 'COPPER', 'COPPER', ...Array(8).fill('COPPER')]);
        });
        const game = scenario(build, (g) => {
            playCard(g, 'voyage');
            endTurn(g);
            expect(g.turnState.handPlayLimit).toBe(3);
            playCard(g, 'throne_room');
            pick(g, 'village');
            // 玉座の間と、玉座の間で手札からプレイした村で2枚
            expect(g.turnState.handPlays).toBe(2);
            playCard(g, 'village');
            expect(g.turnState.handPlays).toBe(3);
        });
        // 3枚に達したので、残りの村はプレイできない
        expect(game.applyCommand(current(game).id, { type: 'play', cardIndex: current(game).hand.findIndex(card => card.id === 'village') })).toBe(false);
    });

    it('受け継がれた：初期デッキのどのカードと入れ替えるかを選べる', () => {
        const kingdom = ['village', ...DEFAULT_KINGDOM.filter(id => id !== 'village').slice(0, 9)];
        const build = () => createGame(['A', 'B'], kingdom, { colonies: false, shelters: false, landscapes: ['inherited'], traitPiles: { inherited: 'village' } });
        const game = scenario(build, (g) => {
            expect(g.phase).toBe('setup');
            expect(g.pendingPrompt.purpose).toBe('inherited');
            pick(g, 'copper');
            pick(g, 'estate');
        });
        const [a, b] = game.players;
        const count = (player, id) => player.getAllCards().filter(card => card.id === id).length;
        expect([count(a, 'copper'), count(a, 'estate'), count(a, 'village')]).toEqual([6, 3, 1]);
        expect([count(b, 'copper'), count(b, 'estate'), count(b, 'village')]).toEqual([7, 2, 1]);
        expect(a.hand).toHaveLength(5);
        expect(game.phase).toBe('action');
    });

    it('準備：脇に置いたカードをプレイする順を選べる', () => {
        const kingdom = DEFAULT_KINGDOM;
        const game = scenario(setup(kingdom, { landscapes: ['prepare'] }, (g, p) => { p.hand = makeCards(['VILLAGE', 'SMITHY', 'SILVER', 'COPPER']); }), (g) => {
            const player = current(g);
            send(g, { type: 'buyPhase' });
            send(g, { type: 'buyLandscape', landscapeId: 'prepare' });
            endTurn(g);
            // 相手のターンを終えると、自分のターンの開始時に順番を選ぶ
            send(g, { type: 'endTurn' });
            expect(current(g)).toBe(player);
            expect(g.pendingPrompt.purpose).toBe('prepare-order');
            pick(g, 'smithy');
        });
        const plays = game.logs.map(log => log.message ?? log).filter(message => /は(鍛冶屋|村)をプレイしました$/.test(message));
        expect(plays.map(message => message.match(/は(.+)をプレイしました$/)[1])).toEqual(['鍛冶屋', '村']);
    });

    it('一等航海士：同じ名前のカードを、プレイする枚数を選べる', () => {
        const kingdom = ['first_mate', ...DEFAULT_KINGDOM.slice(0, 9)];
        const game = scenario(setup(kingdom, {}, (g, p) => { p.hand = makeCards(['FIRST_MATE', 'VILLAGE', 'VILLAGE', 'VILLAGE']); }), (g) => {
            playCard(g, 'first_mate');
            pick(g, 'village');
            expect(g.pendingPrompt.purpose).toBe('first-mate-more');
            answer(g, true);
            answer(g, false);
        });
        const player = current(game);
        expect(player.playArea.filter(card => card.id === 'village')).toHaveLength(2);
        expect(player.hand.filter(card => card.id === 'village')).toHaveLength(1);
        expect(player.hand).toHaveLength(6);
    });

    it('長老：ほかの拡張の「1つを選ぶ」カード（執事）でも、もう1つ選べる', () => {
        const kingdom = ['townsfolk', 'steward', ...DEFAULT_KINGDOM.slice(0, 8)];
        const game = scenario(setup(kingdom, { ally: 'league_of_bankers' }, (g, p) => { p.hand = makeCards(['ELDER', 'STEWARD', 'ESTATE']); }), (g) => {
            playCard(g, 'elder');
            pick(g, 'steward');
            expect(g.pendingPrompt.max).toBe(2);
            answer(g, [0, 1]);
        });
        const player = current(game);
        expect(player.coins).toBe(4);
        expect(player.hand).toHaveLength(3);
    });
});
