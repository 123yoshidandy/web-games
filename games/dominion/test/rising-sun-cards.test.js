import { describe, it, expect, beforeEach } from 'vitest';
import Game from '../public/js/game.js';
import Card from '../public/js/card.js';
import { ALL_CARDS, LANDSCAPES } from '../public/js/card-data.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { createGame, makeCards } from './helpers.js';

const ids = (cards) => cards.map(card => card.id);
const KINGDOM = ['poet', 'tea_house', 'rustic_village', 'fishmonger', 'ninja', 'change', 'daimyo', 'aristocrat', 'artist', 'village'];

describe('旭日', () => {
    let game;
    let player;
    let opponent;

    const setupGame = (options = {}, kingdom = KINGDOM) => {
        game = createGame(['A', 'B'], kingdom, { colonies: false, shelters: false, landscapes: [], prophecy: 'bureaucracy', ...options });
        player = game.getCurrentPlayer();
        opponent = game.getPlayerToLeft(player);
        game.players.forEach(p => {
            if (p !== player) p.hand = makeCards(['COPPER', 'COPPER', 'COPPER', 'ESTATE', 'ESTATE']);
            p.deck = makeCards(Array(15).fill('COPPER'));
            p.discard = [];
        });
    };

    const play = (hand) => {
        player.hand = makeCards(hand);
        expect(game.playActionCard(0)).toBe(true);
    };

    // 予言をすぐに実現させる
    const activate = () => {
        game.prophecy.sun = 1;
        game.removeSun(player);
        expect(game.prophecy.sun).toBe(0);
    };

    // 手番のプレイヤーのターンを終える（残った選択には先頭の答えで答える）
    const finishTurn = () => {
        expect(game.endTurn()).toBe(true);
        while (game.pendingPrompt) game.resolvePrompt(game.pendingPrompt.type === 'confirm' ? false : [0]);
    };

    beforeEach(() => setupGame());

    describe('準備', () => {
        it('前兆が王国にあれば予言を1枚使い、人数で決まる数の☀を置く', () => {
            [[2, 5], [3, 8], [4, 10]].forEach(([count, sun]) => {
                const g = createGame(Array.from({ length: count }, (_, i) => `P${i}`), KINGDOM, { colonies: false, shelters: false });
                const prophecies = g.landscapes.filter(id => LANDSCAPES[id.toUpperCase()].kind === 'prophecy');
                expect(prophecies).toHaveLength(1);
                expect(g.prophecy.sun).toBe(sun);
            });
        });

        it('前兆がなければ予言を使わない', () => {
            const g = createGame(['A', 'B'], ['fishmonger', 'ninja', 'change', 'daimyo', 'aristocrat', 'artist', 'village', 'smithy', 'market', 'moat'], { colonies: false, shelters: false });
            expect(g.prophecy).toBeNull();
            expect(g.landscapes.some(id => LANDSCAPES[id.toUpperCase()].kind === 'prophecy')).toBe(false);
        });

        it('来寇は、アタックの王国カードの山を1つ加える', () => {
            const g = createGame(['A', 'B'], KINGDOM.filter(id => id !== 'ninja'), { colonies: false, shelters: false, prophecy: 'approaching_army' });
            expect(g.selectedKingdomCards).toHaveLength(10);
            const added = ALL_CARDS[g.approachingArmyPile.toUpperCase()];
            expect(added.isAttack || added.types.includes('attack')).toBe(true);
            expect(g.supply[g.approachingArmyPile]).toBeGreaterThan(0);
        });

        it('川船は、使っていない持続でないコスト5のアクションを脇に置く', () => {
            const g = createGame(['A', 'B'], [...KINGDOM.slice(0, 9), 'riverboat'], { colonies: false, shelters: false });
            const data = ALL_CARDS[g.riverboatPile.toUpperCase()];
            expect(data.cost).toBe(5);
            expect(data.types).toContain('action');
            expect(data.types).not.toContain('duration');
            expect(g.supply[g.riverboatPile]).toBeUndefined();
        });
    });

    describe('前兆と予言', () => {
        it('前兆のカードは☀を1つ取り除き、すべて取り除くと予言が実現する', () => {
            game.prophecy.sun = 2;
            play(['TEA_HOUSE', 'TEA_HOUSE']);
            expect(game.prophecy.sun).toBe(1);
            expect(player.coins).toBe(2);
            expect(game.playActionCard(player.hand.findIndex(card => card.id === 'tea_house'))).toBe(true);
            expect(game.prophecy.sun).toBe(0);
            expect(game.isProphecyActive('bureaucracy')).toBe(true);
            expect(game.logs.some(log => (log.message ?? log).includes('実現'))).toBe(true);
        });

        it('ビューに予言の残りの☀を出す', () => {
            const view = createGameView(game, player.id);
            expect(view.landscapes.find(item => item.id === 'bureaucracy').sun).toBe(5);
        });

        it('官僚制：コスト0でないカードを獲得すると銅貨も獲得する', () => {
            activate();
            game.gainCardFromSupply(player, 'village');
            game.processEffects();
            expect(ids(player.discard)).toEqual(['village', 'copper']);
        });

        it('進歩：獲得したカードを山札の上に置く', () => {
            setupGame({ prophecy: 'progress' });
            activate();
            game.gainCardFromSupply(player, 'village');
            game.processEffects();
            expect(player.deck[0].id).toBe('village');
        });

        it('偉大な指導者：アクションをプレイした後にアクション +1', () => {
            setupGame({ prophecy: 'great_leader' });
            activate();
            play(['FISHMONGER']);
            expect(player.actions).toBe(1);
        });

        it('盛大な取引：コストが1少なく、残りのアクションを購入として使える', () => {
            setupGame({ prophecy: 'flourishing_trade' });
            activate();
            expect(game.getCost('village')).toBe(2);
            player.hand = makeCards(['COPPER', 'COPPER', 'COPPER', 'COPPER']);
            player.actions = 1;
            expect(game.enterBuyPhase()).toBe(true);
            expect(game.buyCard('village')).toBe(true);
            expect(game.buyCard('village')).toBe(true);
            expect(player.actions).toBe(0);
            expect(game.buyCard('copper')).toBe(false);
        });

        it('悟り：財宝はアクションでもあり、アクションフェーズにプレイするとカード +1・アクション +1', () => {
            setupGame({ prophecy: 'enlightenment' });
            activate();
            player.hand = makeCards(['GOLD', 'ESTATE']);
            player.actions = 1;
            expect(game.playActionCard(0)).toBe(true);
            expect(player.coins).toBe(0);
            expect(player.actions).toBe(1);
            expect(player.hand).toHaveLength(2);
        });

        it('狼狽：財宝をプレイすると購入 +2、場の財宝は山に戻る', () => {
            setupGame({ prophecy: 'panic' });
            activate();
            const copper = game.supply.copper;
            player.hand = makeCards(['COPPER', 'COPPER']);
            expect(game.enterBuyPhase()).toBe(true);
            expect(player.buys).toBe(5);
            finishTurn();
            expect(game.supply.copper).toBe(copper + 2);
        });

        it('豊作：名前の違う財宝を初めてプレイしたとき、先に購入 +1 と財宝 +1', () => {
            setupGame({ prophecy: 'good_harvest' });
            activate();
            player.hand = makeCards(['COPPER', 'COPPER', 'SILVER']);
            expect(game.enterBuyPhase()).toBe(true);
            expect(player.coins).toBe(4 + 2);
            expect(player.buys).toBe(3);
        });

        it('病：ターンの開始時に、呪いを山札の上に獲得するか手札を3枚捨てる', () => {
            setupGame({ prophecy: 'sickness' });
            activate();
            expect(game.endTurn()).toBe(true);
            expect(game.pendingPrompt?.purpose).toBe('sickness');
            game.resolvePrompt([0]);
            expect(opponent.deck[0].id).toBe('curse');
        });

        it('神風：王国カードの山を、新しくランダムな10山に入れ替える', () => {
            setupGame({ prophecy: 'divine_wind' });
            const before = [...game.selectedKingdomCards];
            activate();
            expect(game.selectedKingdomCards).toHaveLength(10);
            expect(game.selectedKingdomCards.some(id => before.includes(id))).toBe(false);
            before.forEach(id => expect(game.supply[id]).toBeUndefined());
        });

        it('厳冬：自分のターンに獲得したとき、山に負債がなければ2置き、あれば負う', () => {
            setupGame({ prophecy: 'harsh_winter' });
            activate();
            game.gainCardFromSupply(player, 'village');
            expect(game.pileDebt.village).toBe(2);
            game.gainCardFromSupply(player, 'village');
            expect(player.debt).toBe(2);
            expect(game.pileDebt.village).toBe(0);
        });
    });

    describe('影', () => {
        it('シャッフルしたとき、影のカードは山札の一番下に置く', () => {
            player.deck = [];
            player.discard = makeCards(['NINJA', 'COPPER', 'COPPER', 'FISHMONGER', 'COPPER']);
            player.drawCards(1);
            expect(ids(player.deck.slice(-2)).sort()).toEqual(['fishmonger', 'ninja']);
        });

        it('山札の影のカードを、手札と同じようにプレイできる', () => {
            player.hand = makeCards(['ESTATE']);
            player.deck = makeCards(['COPPER', 'COPPER', 'FISHMONGER']);
            expect(game.applyCommand(player.id, { type: 'playShadow', cardId: 'fishmonger' })).toBe(true);
            expect(ids(player.playArea)).toEqual(['fishmonger']);
            expect(player.buys).toBe(2);
            expect(player.deck).toHaveLength(2);
            expect(createGameView(game, player.id).players.find(p => p.id === player.id).shadows).toEqual([]);
        });

        it('アクションが残っていなければ断り、山札は元のまま', () => {
            player.deck = makeCards(['COPPER', 'NINJA', 'COPPER']);
            player.actions = 0;
            const before = ids(player.deck);
            expect(game.applyCommand(player.id, { type: 'playShadow', cardId: 'ninja' })).toBe(false);
            expect(ids(player.deck)).toEqual(before);
        });

        it('ビューには、本人にだけ山札の影のカードを出す', () => {
            player.deck = makeCards(['NINJA', 'COPPER', 'NINJA']);
            const view = createGameView(game, player.id);
            expect(view.players.find(p => p.id === player.id).shadows).toEqual(['ninja']);
            expect(view.players.find(p => p.id === opponent.id).shadows).toBeNull();
        });
    });

    describe('王国カード', () => {
        it('公家：場の公家の枚数で効果が変わる', () => {
            play(['ARISTOCRAT', 'ARISTOCRAT']);
            expect(player.actions).toBe(3);
            expect(game.playActionCard(player.hand.findIndex(card => card.id === 'aristocrat'))).toBe(true);
            expect(player.hand.length).toBe(3);
        });

        it('絵師：場にちょうど1枚あるカード1種につきカードを引く', () => {
            player.playArea = makeCards(['VILLAGE', 'VILLAGE', 'FISHMONGER']);
            play(['ARTIST']);
            expect(player.hand).toHaveLength(2);
            expect(player.actions).toBe(1);
        });

        it('交替：負債があれば財宝 +3、なければ廃棄して高いカードを獲得し、差の分だけ負債', () => {
            player.debt = 1;
            play(['CHANGE']);
            expect(player.coins).toBe(3);
            setupGame();
            play(['CHANGE', 'ESTATE']);
            game.resolvePrompt([0]);
            const index = game.pendingPrompt.cards.findIndex(card => card.id === 'village');
            game.resolvePrompt([index]);
            expect(player.debt).toBe(1);
        });

        it('大名：次にプレイした命令でないアクションを、その後でもう一度プレイする', () => {
            play(['DAIMYO', 'FISHMONGER']);
            expect(game.playActionCard(player.hand.findIndex(card => card.id === 'fishmonger'))).toBe(true);
            expect(player.buys).toBe(3);
            expect(player.coins).toBe(2);
        });

        it('濡女：手札に同じ名前がなければ、山に戻して他のプレイヤーに呪いを獲得させる', () => {
            setupGame({}, ['snake_witch', ...KINGDOM.slice(0, 9)]);
            player.deck = makeCards(['GOLD']);
            play(['SNAKE_WITCH', 'ESTATE']);
            expect(game.pendingPrompt.purpose).toBe('snake-witch');
            const supply = game.supply.snake_witch;
            game.resolvePrompt(true);
            expect(game.supply.snake_witch).toBe(supply + 1);
            expect(ids(opponent.discard)).toContain('curse');
        });

        it('狐：違うものを2つ選ぶ', () => {
            setupGame({}, ['kitsune', ...KINGDOM.slice(0, 9)]);
            play(['KITSUNE']);
            game.resolvePrompt([1, 3]);
            expect(player.coins).toBe(2);
            expect(ids(player.discard)).toContain('silver');
        });

        it('川の社：購入フェーズに獲得しなければ、クリーンアップの開始時にコスト4以下を獲得する', () => {
            setupGame({}, ['river_shrine', ...KINGDOM.slice(0, 9)]);
            play(['RIVER_SHRINE']);
            game.resolvePrompt([]);
            expect(game.endTurn()).toBe(true);
            expect(game.pendingPrompt?.title).toBe('川の社');
        });

        it('川船：次のターンの開始時に、脇に置いたカードをプレイする', () => {
            setupGame({ riverboat: 'laboratory' }, [...KINGDOM.slice(0, 9), 'riverboat']);
            play(['RIVERBOAT']);
            finishTurn();
            finishTurn();
            expect(game.getCurrentPlayer()).toBe(player);
            expect(game.logs.some(log => (log.message ?? log).includes('川船で研究所をプレイしました'))).toBe(true);
        });

        it('米：場のカードの種類1つにつき財宝 +1', () => {
            player.playArea = makeCards(['VILLAGE', 'NINJA']);
            player.hand = makeCards(['RICE']);
            expect(game.enterBuyPhase()).toBe(true);
            // アクション・影・アタック・財宝
            expect(player.coins).toBe(4);
            expect(player.buys).toBe(2);
        });
    });

    describe('イベント', () => {
        const buy = (id, coins = 10, hand = []) => {
            setupGame({ landscapes: [id] });
            player.hand = makeCards(hand);
            expect(game.enterBuyPhase()).toBe(true);
            player.coins = coins;
            expect(game.buyLandscape(id)).toBe(true);
        };

        it('参集：コストちょうど3・4・5のカードを順に獲得する', () => {
            buy('gather');
            [3, 4, 5].forEach(cost => {
                expect(game.pendingPrompt.cards.every(card => game.getCost(card) === cost)).toBe(true);
                game.resolvePrompt([0]);
            });
            expect(player.discard).toHaveLength(3);
        });

        it('信用：コスト8以下のアクションか財宝を獲得し、そのコストだけ負債', () => {
            buy('credit', 2);
            game.resolvePrompt([game.pendingPrompt.cards.findIndex(card => card.id === 'gold')]);
            expect(player.debt).toBe(6);
        });

        it('継続：獲得したアクションをアクションフェーズに戻ってプレイする', () => {
            buy('continue', 0);
            game.resolvePrompt([game.pendingPrompt.cards.findIndex(card => card.id === 'village')]);
            expect(game.phase).toBe('action');
            expect(ids(player.playArea)).toContain('village');
            expect(player.debt).toBe(8);
        });

        it('洞察：アクションが出るまで公開し、それをターンの終わりに手札に加える', () => {
            setupGame({ landscapes: ['foresight'] });
            player.deck = makeCards(['COPPER', 'NINJA', ...Array(10).fill('COPPER')]);
            player.hand = makeCards(['COPPER', 'COPPER']);
            expect(game.enterBuyPhase()).toBe(true);
            expect(game.buyLandscape('foresight')).toBe(true);
            finishTurn();
            expect(ids(player.hand)).toContain('ninja');
        });

        it('苦行：財宝を支払った数だけ手札を廃棄する', () => {
            buy('asceticism', 4, ['ESTATE', 'ESTATE']);
            game.resolvePrompt([2]);
            game.resolvePrompt([0, 1]);
            expect(player.coins).toBe(0);
            expect(ids(game.trash)).toEqual(['estate', 'estate']);
        });
    });

    it('CPU同士の試合を、操作の記録から再現できる', () => {
        for (let round = 0; round < 6; round++) {
            const players = [{ name: 'CPU1', isCPU: true }, { name: 'CPU2', isCPU: true }, ...(round % 2 ? [{ name: 'CPU3', isCPU: true }] : [])];
            const options = { cardSets: ['rising_sun'], seed: 3100 + round };
            const g = new Game(players, options);
            g.setup();
            let steps = 0;
            while (g.phase !== 'end' && steps < 40000) {
                runCpuStep(g);
                steps++;
            }
            expect(g.phase).toBe('end');
            const replayed = Game.replay(players, options, g.commands);
            expect(replayed.result).toEqual(g.result);
        }
    });

    it('悟りの財宝の扱いは、次のゲームに残らない', () => {
        setupGame({ prophecy: 'enlightenment' });
        activate();
        expect(new Card(ALL_CARDS.GOLD).isType('action')).toBe(true);
        setupGame();
        expect(new Card(ALL_CARDS.GOLD).isType('action')).toBe(false);
    });
});
