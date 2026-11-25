/**
 * 拡張「旭日」の王国カードデータ、イベント、予言
 * - 影：山札からも手札と同じようにプレイできる（game.playShadowCard）。シャッフルしたとき、山札の一番下に置く
 * - 前兆：プレイすると、予言から太陽のトークン（☀）を1つ取り除く（game.removeSun）。すべて取り除くと予言が実現する
 * - 予言（LANDSCAPES の kind: 'prophecy'）は、前兆のある王国で1枚使う。効果は game-rising-sun.js が ID を見て起こす
 */

import { CARD_TYPES, LANDSCAPE_KINDS } from './card-types.js';
import {
    isAction, isTreasure, names, gainBenefits, promptFromHand, promptTrashFromHand, promptDiscardFromHand,
    discardDownTo, takeTopCards, curseAttack
} from './card-helpers.js';

const { ACTION, TREASURE, DURATION, COMMAND, SHADOW, OMEN } = CARD_TYPES;
const { EVENT, PROPHECY } = LANDSCAPE_KINDS;

const gainAndLog = (game, player, cardId, destination) => {
    const card = game.gainCardFromSupply(player, cardId, destination) ?? null;
    if (card) game.log(`${player.name}は${card.name}を獲得しました`);
    return card;
};

// 影の説明に添える文
const SHADOW_NOTE = '（影：山札からも、手札と同じようにプレイできる）';

// 手札を1枚廃棄し、それよりコストが最大 extra 多いカードを1枚獲得する（狸）
const trashAndGainUpTo = (game, player, extra, title) => promptTrashFromHand(game, player, {
    title, message: '廃棄するカードを1枚選んでください。', purpose: 'remodel-trash',
    callback: ([trashed]) => {
        if (!trashed) return;
        const maxCost = game.getCost(trashed) + extra;
        game.promptGain({
            player, maxCost, ...game.costExtras(trashed), title,
            message: `コスト${maxCost}以下のカードを1枚獲得してください。`
        });
    }
});

export const RISING_SUN_CARDS = {
    // ===== コスト2 =====
    FISHMONGER: {
        id: 'fishmonger', name: '魚屋', cost: 2, types: [ACTION, SHADOW],
        description: `購入 +1。財宝 +1${SHADOW_NOTE}`,
        count: 10,
        onPlay: (player, game) => gainBenefits(player, game, { buys: 1, coins: 1 })
    },
    SNAKE_WITCH: {
        id: 'snake_witch', name: '濡女', cost: 2, types: [ACTION],
        description: 'カードを1枚引く。アクション +1。手札に同じ名前のカードがなければ、手札を公開し、これを山に戻してもよい。そうしたら、他のプレイヤーは呪いを1枚獲得する',
        isAttack: true,
        count: 10,
        onPlay: (player, game, witch) => {
            gainBenefits(player, game, { cards: 1, actions: 1 });
            const unique = new Set(player.hand.map(card => card.id)).size === player.hand.length;
            if (!unique || !player.playArea.includes(witch)) return;
            game.promptConfirm({
                player, card: witch, title: '濡女', message: '手札を公開し、濡女を山に戻して、他のプレイヤーに呪いを獲得させますか？',
                yesLabel: '戻す', noLabel: '戻さない', purpose: 'snake-witch',
                callback: (yes) => {
                    if (!yes) return;
                    game.log(`${player.name}は手札（${player.hand.length > 0 ? names(player.hand) : 'なし'}）を公開しました`);
                    if (!game.returnToSupply(player, witch)) return;
                    curseAttack(game, player);
                }
            });
        }
    },

    // ===== コスト3 =====
    ARISTOCRAT: {
        id: 'aristocrat', name: '公家', cost: 3, types: [ACTION],
        description: '場にある公家の枚数が、1か5ならアクション +3、2か6ならカードを3枚引く、3か7なら財宝 +3、4か8なら購入 +3',
        count: 10,
        onPlay: (player, game) => {
            const count = player.playArea.filter(card => card.id === 'aristocrat').length;
            if (count < 1 || count > 8) return;
            const benefits = [{ buys: 3 }, { actions: 3 }, { cards: 3 }, { coins: 3 }][count % 4];
            gainBenefits(player, game, benefits, `公家（${count}枚）`);
        }
    },
    CRAFTSMAN: {
        id: 'craftsman', name: '名匠', cost: 3, types: [ACTION],
        description: '負債 +2。コスト5以下のカードを1枚獲得する',
        count: 10,
        onPlay: (player, game) => {
            game.takeDebt(player, 2, '名匠');
            game.promptGain({ player, maxCost: 5, title: '名匠', message: 'コスト5以下のカードを1枚獲得してください。' });
        }
    },
    RIVERBOAT: {
        id: 'riverboat', name: '川船', cost: 3, types: [ACTION, DURATION],
        description: '次のターンの開始時に、脇に置いたカードを、そのまま置いたままプレイする。準備：使っていない、持続でないコスト5のアクションの王国カードを1枚脇に置く',
        count: 10,
        onPlay: (player, game, boat) => {
            const card = game.getRiverboatCard();
            if (!card) {
                game.log('川船で脇に置いたカードがありません');
                return;
            }
            player.addDuration(boat, () => {
                game.log(`${player.name}は川船で${card.name}をプレイしました`);
                card.play(player, game);
            });
        }
    },
    ROOT_CELLAR: {
        id: 'root_cellar', name: '室', cost: 3, types: [ACTION],
        description: 'カードを3枚引く。アクション +1。負債 +3',
        count: 10,
        onPlay: (player, game) => {
            gainBenefits(player, game, { cards: 3, actions: 1 });
            game.takeDebt(player, 3, '室');
        }
    },

    // ===== コスト4 =====
    ALLEY: {
        id: 'alley', name: '小路', cost: 4, types: [ACTION, SHADOW],
        description: `カードを1枚引く。アクション +1。手札を1枚捨て札にする${SHADOW_NOTE}`,
        count: 10,
        onPlay: (player, game) => {
            gainBenefits(player, game, { cards: 1, actions: 1 });
            promptDiscardFromHand(game, player, 1, '小路');
        }
    },
    CHANGE: {
        id: 'change', name: '交替', cost: 4, types: [ACTION],
        description: '負債があれば、財宝 +3。なければ、手札を1枚廃棄し、それよりコストの高いカードを1枚獲得して、コストの差だけ負債 +',
        count: 10,
        onPlay: (player, game) => {
            if (player.debt > 0) {
                gainBenefits(player, game, { coins: 3 }, '交替');
                return;
            }
            promptTrashFromHand(game, player, {
                title: '交替', message: '廃棄するカードを1枚選んでください。', purpose: 'change-trash',
                callback: ([trashed]) => {
                    if (!trashed) return;
                    const cost = game.getCost(trashed);
                    game.promptGain({
                        player, minCost: cost + 1, potion: Infinity, debt: Infinity, title: '交替',
                        message: `コストが${cost}より高いカードを1枚獲得してください。差の分だけ負債を負います。`,
                        onGained: (gained) => game.takeDebt(player, game.getCost(gained) - cost, '交替')
                    });
                }
            });
        }
    },
    NINJA: {
        id: 'ninja', name: '忍者', cost: 4, types: [ACTION, SHADOW],
        description: `カードを1枚引く。他のプレイヤーは、手札が3枚になるまで捨て札にする${SHADOW_NOTE}`,
        isAttack: true,
        count: 10,
        onPlay: (player, game) => {
            gainBenefits(player, game, { cards: 1 });
            game.attackOtherPlayers(player, (target) => discardDownTo(game, target, 3, '忍者'));
        }
    },
    POET: {
        id: 'poet', name: '歌人', cost: 4, types: [ACTION, OMEN],
        description: '☀ +1。カードを1枚引く。アクション +1。山札の一番上を公開し、コスト3以下なら手札に加える',
        count: 10,
        onPlay: (player, game) => {
            game.removeSun(player);
            gainBenefits(player, game, { cards: 1, actions: 1 });
            const [top] = takeTopCards(player, 1);
            if (!top) return;
            if (game.getCost(top) <= 3 && !game.hasExtraCost(top)) {
                player.hand.push(top);
                game.log(`${player.name}は山札の一番上の${top.name}を公開して、手札に加えました`);
            } else {
                player.deck.unshift(top);
                game.log(`${player.name}は山札の一番上の${top.name}を公開しました`);
            }
        }
    },
    RIVER_SHRINE: {
        id: 'river_shrine', name: '川の社', cost: 4, types: [ACTION, OMEN],
        description: '☀ +1。手札を2枚まで廃棄してもよい。クリーンアップの開始時に、このターンの購入フェーズにカードを獲得していなければ、コスト4以下のカードを1枚獲得する',
        count: 10,
        onPlay: (player, game) => {
            game.removeSun(player);
            game.turnState.riverShrines++;
            promptTrashFromHand(game, player, {
                min: 0, max: 2, title: '川の社', message: '廃棄するカードを2枚まで選んでください（選ばなくてもかまいません）。', purpose: 'optional-trash'
            });
        }
    },
    RUSTIC_VILLAGE: {
        id: 'rustic_village', name: '田舎の村', cost: 4, types: [ACTION, OMEN],
        description: '☀ +1。カードを1枚引く。アクション +2。手札を2枚捨て札にして、カードを1枚引いてもよい',
        count: 10,
        onPlay: (player, game, village) => {
            game.removeSun(player);
            gainBenefits(player, game, { cards: 1, actions: 2 });
            if (player.hand.length < 2) return;
            game.promptConfirm({
                player, card: village, title: '田舎の村', message: '手札を2枚捨て札にして、カードを1枚引きますか？',
                yesLabel: '捨てて引く', noLabel: '引かない', purpose: 'rustic-village',
                callback: (yes) => {
                    if (!yes) return;
                    promptDiscardFromHand(game, player, 2, '田舎の村', {
                        callback: () => gainBenefits(player, game, { cards: 1 }, '田舎の村')
                    });
                }
            });
        }
    },

    // ===== コスト5 =====
    GOLD_MINE: {
        id: 'gold_mine', name: '金山', cost: 5, types: [ACTION],
        description: 'カードを1枚引く。アクション +1。購入 +1。金貨を1枚獲得して、負債 +4 してもよい',
        count: 10,
        onPlay: (player, game, mine) => {
            gainBenefits(player, game, { cards: 1, actions: 1, buys: 1 });
            if (!(game.supply.gold > 0)) return;
            game.promptConfirm({
                player, card: mine, title: '金山', message: '金貨を1枚獲得して、負債を4負いますか？',
                yesLabel: '獲得する', noLabel: '獲得しない', purpose: 'gold-mine',
                callback: (yes) => {
                    if (!yes) return;
                    gainAndLog(game, player, 'gold');
                    game.takeDebt(player, 4, '金山');
                }
            });
        }
    },
    IMPERIAL_ENVOY: {
        id: 'imperial_envoy', name: '勅使', cost: 5, types: [ACTION],
        description: 'カードを5枚引く。購入 +1。負債 +2',
        count: 10,
        onPlay: (player, game) => {
            gainBenefits(player, game, { cards: 5, buys: 1 });
            game.takeDebt(player, 2, '勅使');
        }
    },
    KITSUNE: {
        id: 'kitsune', name: '狐', cost: 5, types: [ACTION, OMEN],
        description: '☀ +1。違うものを2つ選ぶ：アクション +2、財宝 +2、他のプレイヤーは呪いを1枚獲得する、銀貨を1枚獲得する',
        isAttack: true,
        count: 10,
        onPlay: (player, game, kitsune) => {
            game.removeSun(player);
            game.chooseAbilities({
                player, card: kitsune, count: 2, title: '狐',
                options: ['アクション +2', '財宝 +2', '他のプレイヤーは呪いを1枚獲得する', '銀貨を1枚獲得する'],
                purpose: 'kitsune',
                apply: (index) => {
                    if (index === 0) gainBenefits(player, game, { actions: 2 });
                    if (index === 1) gainBenefits(player, game, { coins: 2 });
                    if (index === 2) curseAttack(game, player);
                    if (index === 3) gainAndLog(game, player, 'silver');
                }
            });
        }
    },
    LITTER: {
        id: 'litter', name: '駕籠', cost: 5, types: [ACTION],
        description: 'カードを2枚引く。アクション +2。負債 +1',
        count: 10,
        onPlay: (player, game) => {
            gainBenefits(player, game, { cards: 2, actions: 2 });
            game.takeDebt(player, 1, '駕籠');
        }
    },
    RICE_BROKER: {
        id: 'rice_broker', name: '札差', cost: 5, types: [ACTION],
        description: 'アクション +1。手札を1枚廃棄する。それが財宝ならカードを2枚引く。アクションならカードを5枚引く',
        count: 10,
        onPlay: (player, game) => {
            gainBenefits(player, game, { actions: 1 });
            promptTrashFromHand(game, player, {
                title: '札差', message: '廃棄するカードを1枚選んでください。', purpose: 'rice-broker',
                callback: ([trashed]) => {
                    if (!trashed) return;
                    const cards = (isTreasure(trashed) ? 2 : 0) + (isAction(trashed) ? 5 : 0);
                    if (cards > 0) gainBenefits(player, game, { cards }, '札差');
                }
            });
        }
    },
    RONIN: {
        id: 'ronin', name: '浪人', cost: 5, types: [ACTION, SHADOW],
        description: `手札が7枚になるまでカードを引く${SHADOW_NOTE}`,
        count: 10,
        onPlay: (player, game) => {
            const count = 7 - player.hand.length;
            if (count > 0) gainBenefits(player, game, { cards: count }, '浪人');
        }
    },
    TANUKI: {
        id: 'tanuki', name: '狸', cost: 5, types: [ACTION, SHADOW],
        description: `手札を1枚廃棄し、それよりコストが最大2多いカードを1枚獲得する${SHADOW_NOTE}`,
        count: 10,
        onPlay: (player, game) => trashAndGainUpTo(game, player, 2, '狸')
    },
    TEA_HOUSE: {
        id: 'tea_house', name: '茶屋', cost: 5, types: [ACTION, OMEN],
        description: '☀ +1。カードを1枚引く。アクション +1。財宝 +2',
        count: 10,
        onPlay: (player, game) => {
            game.removeSun(player);
            gainBenefits(player, game, { cards: 1, actions: 1, coins: 2 });
        }
    },

    // ===== コスト6以上 =====
    SAMURAI: {
        id: 'samurai', name: '侍', cost: 6, types: [ACTION, DURATION],
        description: '他のプレイヤーは、手札が3枚になるまで捨て札にする（1度だけ）。このゲームの残りの間、自分のターンの開始時に財宝 +1（場に残り続ける）',
        isAttack: true,
        count: 10,
        onPlay: (player, game, samurai) => {
            game.attackOtherPlayers(player, (target) => discardDownTo(game, target, 3, '侍'));
            player.addDuration(samurai, () => gainBenefits(player, game, { coins: 1 }, '侍'), { permanent: true });
        }
    },
    RICE: {
        id: 'rice', name: '米', cost: 7, types: [TREASURE],
        value: 0,
        description: '購入 +1。場にあるカードの種類（アクション・財宝・持続など）1つにつき、財宝 +1',
        count: 10,
        onPlay: (player, game) => {
            const types = new Set(player.playArea.flatMap(card => card.types));
            gainBenefits(player, game, { buys: 1, coins: types.size }, `米（種類${types.size}）`);
        }
    },
    MOUNTAIN_SHRINE: {
        id: 'mountain_shrine', name: '山の社', cost: 0, debtCost: 5, types: [ACTION, OMEN],
        description: '☀ +1。財宝 +2。手札を1枚廃棄してもよい。その後、廃棄置き場にアクションカードがあれば、カードを2枚引く',
        count: 10,
        onPlay: (player, game) => {
            game.removeSun(player);
            gainBenefits(player, game, { coins: 2 });
            game.runNext(
                () => promptTrashFromHand(game, player, {
                    min: 0, title: '山の社', message: '廃棄するカードを選んでください（選ばなくてもかまいません）。', purpose: 'optional-trash'
                }),
                () => {
                    if (game.trash.some(card => card.isType(ACTION))) gainBenefits(player, game, { cards: 2 }, '山の社');
                }
            );
        }
    },
    DAIMYO: {
        id: 'daimyo', name: '大名', cost: 0, debtCost: 6, types: [ACTION, COMMAND],
        description: 'カードを1枚引く。アクション +1。このターン、次に命令でないアクションカードをプレイしたとき、その後でもう一度プレイする',
        count: 10,
        onPlay: (player, game) => {
            gainBenefits(player, game, { cards: 1, actions: 1 });
            game.turnState.daimyos++;
        }
    },
    ARTIST: {
        id: 'artist', name: '絵師', cost: 0, debtCost: 8, types: [ACTION],
        description: 'アクション +1。場にちょうど1枚だけあるカード1種につき、カードを1枚引く',
        count: 10,
        onPlay: (player, game) => {
            const counts = new Map();
            player.playArea.forEach(card => counts.set(card.id, (counts.get(card.id) ?? 0) + 1));
            const cards = [...counts.values()].filter(count => count === 1).length;
            gainBenefits(player, game, { actions: 1, cards }, '絵師');
        }
    }
};

// イベント：購入フェーズに購入して効果を使う
export const RISING_SUN_EVENTS = {
    AMASS: {
        id: 'amass', name: '蓄積', kind: EVENT, cost: 2,
        description: '場にアクションカードがなければ、コスト5以下のアクションカードを1枚獲得する',
        onBuy: (player, game) => {
            if (player.playArea.some(card => card.isType(ACTION))) {
                game.log('場にアクションカードがあるため、蓄積では獲得しません');
                return;
            }
            game.promptGain({ player, maxCost: 5, filter: (data) => data.types.includes(ACTION), title: '蓄積', message: 'コスト5以下のアクションカードを1枚獲得してください。' });
        }
    },
    ASCETICISM: {
        id: 'asceticism', name: '苦行', kind: EVENT, cost: 2,
        description: '財宝を好きなだけ支払い、その数だけ手札を廃棄する',
        onBuy: (player, game) => {
            const max = Math.min(player.coins - (player.debt ?? 0), player.hand.length);
            if (max <= 0) return;
            game.promptChoose({
                player, options: Array.from({ length: max + 1 }, (_, i) => `財宝${i}を支払って${i}枚廃棄する`), title: '苦行',
                message: '支払う財宝の数を選んでください。', purpose: 'asceticism',
                callback: ([count]) => {
                    if (!count) return;
                    player.coins -= count;
                    game.log(`${player.name}は苦行で財宝${count}を支払いました`);
                    promptTrashFromHand(game, player, {
                        min: count, max: count, title: '苦行', message: `廃棄するカードを${count}枚選んでください。`, purpose: 'trash'
                    });
                }
            });
        }
    },
    CREDIT: {
        id: 'credit', name: '信用', kind: EVENT, cost: 2,
        description: 'コスト8以下のアクションか財宝を1枚獲得し、そのコストだけ負債 +',
        onBuy: (player, game) => game.promptGain({
            player, maxCost: 8, filter: (data) => data.types.includes(ACTION) || data.types.includes(TREASURE), title: '信用',
            message: 'コスト8以下のアクションか財宝を1枚獲得してください。コストの分だけ負債を負います。',
            onGained: (gained) => game.takeDebt(player, game.getCost(gained), '信用')
        })
    },
    FORESIGHT: {
        id: 'foresight', name: '洞察', kind: EVENT, cost: 2,
        description: 'アクションカードが出るまで山札を公開する。それを脇に置き、残りを捨て札にする。ターンの終わりに、それを手札に加える',
        onBuy: (player, game) => {
            const revealed = [];
            let found = null;
            for (;;) {
                const card = player.takeTopCard();
                if (!card) break;
                if (card.isType(ACTION)) {
                    found = card;
                    break;
                }
                revealed.push(card);
            }
            if (revealed.length > 0) game.log(`${player.name}は${names(revealed)}を公開しました`);
            game.discardCards(player, revealed);
            if (!found) return;
            player.setAside.push(found);
            game.turnState.hounds.push({ player, card: found });
            game.log(`${player.name}は${found.name}を脇に置きました（ターンの終わりに手札に加えます）`);
        }
    },
    KINTSUGI: {
        id: 'kintsugi', name: '金継ぎ', kind: EVENT, cost: 3,
        description: '手札を1枚廃棄する。このゲームで金貨を獲得していれば、廃棄したカードよりコストが最大2多いカードを1枚獲得する',
        onBuy: (player, game) => promptTrashFromHand(game, player, {
            title: '金継ぎ', message: '廃棄するカードを1枚選んでください。', purpose: 'remodel-trash',
            callback: ([trashed]) => {
                if (!trashed || !player.gainedGold) return;
                const maxCost = game.getCost(trashed) + 2;
                game.promptGain({ player, maxCost, ...game.costExtras(trashed), title: '金継ぎ', message: `コスト${maxCost}以下のカードを1枚獲得してください。` });
            }
        })
    },
    PRACTICE: {
        id: 'practice', name: '稽古', kind: EVENT, cost: 3,
        description: '手札のアクションカードを1枚、2回プレイしてもよい',
        onBuy: (player, game) => promptFromHand(game, player, {
            min: 0, filter: (card) => card.isType(ACTION), title: '稽古', message: '2回プレイするアクションカードを選んでください（選ばなくてもかまいません）。',
            confirmLabel: '2回プレイする', purpose: 'practice',
            callback: ([card]) => { if (card) game.playMultipleTimes(player, card, 2, null, { asTreasure: false }); }
        })
    },
    SEA_TRADE: {
        id: 'sea_trade', name: '海上交易', kind: EVENT, cost: 4,
        description: '場のアクションカード1枚につき、カードを1枚引く。その枚数まで手札を廃棄してもよい',
        onBuy: (player, game) => {
            const count = player.playArea.filter(card => card.isType(ACTION)).length;
            if (count === 0) return;
            gainBenefits(player, game, { cards: count }, '海上交易');
            promptTrashFromHand(game, player, {
                min: 0, max: count, title: '海上交易', message: `廃棄するカードを${count}枚まで選んでください（選ばなくてもかまいません）。`, purpose: 'optional-trash'
            });
        }
    },
    RECEIVE_TRIBUTE: {
        id: 'receive_tribute', name: '賛辞', kind: EVENT, cost: 5,
        description: 'このターンにカードを3枚以上獲得していれば、場にない名前の、名前の違うアクションカードを3枚まで獲得してもよい',
        onBuy: (player, game) => {
            if (player.gainedThisTurn.length < 3) {
                game.log('このターンに獲得したカードが3枚未満のため、賛辞では獲得しません');
                return;
            }
            const gained = [];
            const gainNext = (left) => {
                if (left <= 0) return;
                game.promptGain({
                    player, optional: true, title: '賛辞',
                    filter: (data) => data.types.includes(ACTION) && !gained.includes(data.id) && !player.playArea.some(card => card.id === data.id),
                    message: `場にない名前のアクションカードを獲得できます（あと${left}枚。選ばなくてもかまいません）。`,
                    onGained: (card) => {
                        gained.push(card.id);
                        game.runNext(() => gainNext(left - 1));
                    }
                });
            };
            gainNext(3);
        }
    },
    GATHER: {
        id: 'gather', name: '参集', kind: EVENT, cost: 7,
        description: 'コストがちょうど3、4、5のカードを、この順に1枚ずつ獲得する',
        onBuy: (player, game) => game.runNext(...[3, 4, 5].map(cost => () => game.promptGain({
            player, exactCost: cost, title: '参集', message: `コストがちょうど${cost}のカードを1枚獲得してください。`
        })))
    },
    CONTINUE: {
        id: 'continue', name: '継続', kind: EVENT, cost: 0, debtCost: 8, oncePerTurn: true,
        description: '1ターンに1回だけ：アタックでないコスト4以下のアクションカードを1枚獲得する。アクションフェーズに戻り、それをプレイする。アクション +1、購入 +1',
        onBuy: (player, game) => game.promptGain({
            player, maxCost: 4, filter: (data) => data.types.includes(ACTION) && !data.isAttack, title: '継続',
            message: 'アタックでないコスト4以下のアクションカードを1枚獲得してください。アクションフェーズに戻ってプレイします。',
            onGained: (card) => {
                game.returnToActionPhase(player);
                game.runNext(
                    () => { if (player.getAllCards().includes(card) && !player.playArea.includes(card)) game.playCardFrom(player, card); },
                    () => gainBenefits(player, game, { actions: 1, buys: 1 }, '継続')
                );
            }
        })
    }
};

// 予言：前兆のある王国で1枚使い、☀のトークンを置く。すべて取り除くと、ゲームの終わりまで効果がある
const prophecy = (key, id, name, description) => ({ [key]: { id, name, kind: PROPHECY, description } });

export const RISING_SUN_PROPHECIES = {
    ...prophecy('APPROACHING_ARMY', 'approaching_army', '来寇', 'アタックカードをプレイした後、財宝 +1。準備：アタックの王国カードの山を1つ加える'),
    ...prophecy('BIDING_TIME', 'biding_time', '好機到来', 'クリーンアップの開始時に、手札をすべて裏向きで脇に置く。次のターンの開始時に、それを手札に加える'),
    ...prophecy('BUREAUCRACY', 'bureaucracy', '官僚制', 'コスト0でないカードを獲得したとき、銅貨を1枚獲得する'),
    ...prophecy('DIVINE_WIND', 'divine_wind', '神風', '最後の☀を取り除いたとき、サプライの王国カードの山をすべて取り除き、新しくランダムに10山を置く'),
    ...prophecy('ENLIGHTENMENT', 'enlightenment', '悟り', '財宝はアクションでもある。アクションフェーズに財宝をプレイしたときは、その効果の代わりに、カードを1枚引きアクション +1'),
    ...prophecy('FLOURISHING_TRADE', 'flourishing_trade', '盛大な取引', 'カードのコストは1少ない。アクション（残りのアクション数）を購入として使ってよい'),
    ...prophecy('GOOD_HARVEST', 'good_harvest', '豊作', '各ターン、名前の違う財宝を初めてプレイするたびに、先に購入 +1 と財宝 +1'),
    ...prophecy('GREAT_LEADER', 'great_leader', '偉大な指導者', 'アクションカードをプレイするたびに、その後でアクション +1'),
    ...prophecy('GROWTH', 'growth', '成長', '財宝を獲得したとき、それより安いカードを1枚獲得する'),
    ...prophecy('HARSH_WINTER', 'harsh_winter', '厳冬', '自分のターンにカードを獲得したとき、その山に負債があれば負う。なければ、その山に負債を2置く'),
    ...prophecy('KIND_EMPEROR', 'kind_emperor', '神器', 'ターンの開始時と、最後の☀を取り除いたときに、アクションカードを1枚手札に獲得する'),
    ...prophecy('PANIC', 'panic', '狼狽', '財宝をプレイしたとき、購入 +2。場の財宝を捨て札にするときは、山に戻す'),
    ...prophecy('PROGRESS', 'progress', '進歩', 'カードを獲得したとき、それを山札の上に置く'),
    ...prophecy('RAPID_EXPANSION', 'rapid_expansion', '急速拡大', 'アクションか財宝を獲得したとき、それを脇に置き、次のターンの開始時にプレイする'),
    ...prophecy('SICKNESS', 'sickness', '病', 'ターンの開始時に、1つを選ぶ：呪いを1枚山札の上に獲得する、手札を3枚捨て札にする')
};

// 予言の☀の数（プレイヤーの人数で決まる）
export const SUN_TOKENS = { 1: 5, 2: 5, 3: 8, 4: 10, 5: 12, 6: 13 };
