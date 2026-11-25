/**
 * 拡張「旭日」の仕組み：予言と☀、前兆、影、川船・大名、予言の効果
 * - 前兆のある王国では予言（LANDSCAPES の kind: 'prophecy'）を1枚使い、人数で決まる数の☀を置く（game.prophecy）
 * - 前兆のカードをプレイすると☀を1つ取り除く（removeSun）。すべて取り除くと予言が実現し、ゲームの終わりまで効く
 * - 影のカードは山札からもプレイできる（playShadowCard）。シャッフルしたとき山札の一番下に置く（player.js）
 * Game.prototype に処理を加える
 */

import Card from './card.js';
import { ALL_CARDS, CARD_TYPES, LANDSCAPES, KINGDOM_CARDS, getKingdomCardIds } from './card-data.js';
import { LANDSCAPE_KINDS } from './card-types.js';
import { SUN_TOKENS } from './card-data-rising-sun.js';
import { gainBenefits, promptDiscardFromHand } from './card-helpers.js';
import { REALTIME_EXCLUDED_CARDS } from './game-realtime.js';

const { ACTION, TREASURE, ATTACK, DURATION, COMMAND, SHADOW, OMEN, LOOTER, LIAISON, FATE, DOOM } = CARD_TYPES;

// 準備で特別なこと（中身の混ざった山・サプライ外の山・ポーション・恩恵など）の要らない王国カードか
// 川船で脇に置くカードと、神風で置き直す山は、この中から選ぶ
const SPECIAL_SETUP_IDS = ['young_witch', 'ferryman', 'joust', 'riverboat', 'necromancer'];
const needsNoSetup = (data) => Boolean(data) && !data.pileCards && !data.pileCardsFor && !data.nonSupplyPiles && !data.artifacts &&
    !data.potionCost && !data.usesLoot && !data.setupFavors && !data.heirloom && !SPECIAL_SETUP_IDS.includes(data.id) &&
    ![LOOTER, LIAISON, FATE, DOOM, OMEN].some(type => data.types.includes(type));

const isAttackData = (data) => Boolean(data) && (data.isAttack || data.types.includes(ATTACK));

const risingSunMethods = {
    // 予言を選ぶ（王国カードを選んだ直後に initializeSupply から呼ぶ）。options.prophecy が null なら使わない
    // 来寇なら、アタックの王国カードの山を1つ加える（王国カードとして、ほかの準備もそのまま受ける）
    setupProphecy() {
        this.prophecy = null;
        const option = this.options.prophecy;
        if (option === null) return;
        const omen = this.selectedKingdomCards.some(id => ALL_CARDS[id.toUpperCase()]?.types.includes(OMEN));
        if (!option && !omen) return;
        const pool = Object.values(LANDSCAPES).filter(data => data.kind === LANDSCAPE_KINDS.PROPHECY).map(data => data.id);
        const id = option ?? pool[Math.floor(this.random() * pool.length)];
        this.prophecy = { id, sun: SUN_TOKENS[this.players.length] ?? 5 };
        if (id === 'approaching_army') {
            const attack = this.pickUnusedKingdomCard(data => isAttackData(data) && !this.selectedKingdomCards.includes(data.id));
            if (attack) {
                this.selectedKingdomCards.push(attack);
                this.approachingArmyPile = attack;
            }
        }
    },

    // 予言を札に加え、川船で脇に置くカードを選ぶ（initializeSupply から呼ぶ）
    setupRisingSun() {
        if (this.prophecy && !this.landscapes.includes(this.prophecy.id)) this.landscapes.push(this.prophecy.id);
        if (this.isInSupply('riverboat')) {
            this.riverboatPile = this.options.riverboat ?? this.pickUnusedKingdomCard(data =>
                data.types.includes(ACTION) && !data.types.includes(DURATION) && data.cost === 5 && !data.debtCost && needsNoSetup(data));
        }
    },

    // 川船で脇に置いたカード（何度プレイしても同じカード）
    getRiverboatCard() {
        if (!this.riverboatPile) return null;
        this.riverboatCard ??= new Card(ALL_CARDS[this.riverboatPile.toUpperCase()]);
        return this.riverboatCard;
    },

    // 予言が実現しているか
    isProphecyActive(id) {
        return this.prophecy?.id === id && this.prophecy.sun === 0;
    },

    // 悟り：財宝をアクションとしても扱う（Card の判定が見る。ゲームごとに合わせる）
    syncEnlightenment() {
        Card.treasuresAreActions = Boolean(this.isProphecyActive?.('enlightenment'));
    },

    // 前兆：予言から☀を1つ取り除く。最後の☀なら予言が実現する
    removeSun(player) {
        const prophecy = this.prophecy;
        if (!prophecy || prophecy.sun === 0) return;
        prophecy.sun--;
        const name = this.getLandscape(prophecy.id).name;
        this.log(`${player.name}は${name}から☀を1つ取り除きました（残り${prophecy.sun}）`);
        if (prophecy.sun > 0) return;
        this.log(`予言「${name}」が実現しました`);
        this.syncEnlightenment();
        if (prophecy.id === 'divine_wind') this.divineWind();
        if (prophecy.id === 'kind_emperor') this.runNext(() => this.promptKindEmperor(player));
    },

    // 神風：サプライの王国カードの山をすべて取り除き、新しくランダムに10山を置く
    divineWind() {
        const removed = [...this.selectedKingdomCards, ...(this.bane ? [this.bane] : [])];
        removed.forEach(pileId => {
            delete this.supply[pileId];
            delete this.pileCards[pileId];
        });
        const candidates = getKingdomCardIds(this.cardSets).map(id => id.toLowerCase())
            .filter(id => !removed.includes(id) && needsNoSetup(KINGDOM_CARDS[id.toUpperCase()]) &&
                !(this.isRealtime() && REALTIME_EXCLUDED_CARDS.includes(id)));
        const chosen = [];
        while (chosen.length < 10 && candidates.length > 0) {
            chosen.push(candidates.splice(Math.floor(this.random() * candidates.length), 1)[0]);
        }
        const victoryCount = this.players.length <= 2 ? 8 : 12;
        chosen.forEach(id => {
            const data = KINGDOM_CARDS[id.toUpperCase()];
            this.supply[id] = data.types.includes(CARD_TYPES.VICTORY) ? victoryCount : (data.count ?? 10);
        });
        this.selectedKingdomCards = chosen;
        this.log(`神風で、王国カードの山が${chosen.map(id => ALL_CARDS[id.toUpperCase()].name).join('・')}に入れ替わりました`);
    },

    // 神器：アクションカードを1枚手札に獲得する
    promptKindEmperor(player) {
        this.promptGain({
            player, filter: (data) => data.types.includes(ACTION), destination: 'hand', potion: Infinity, debt: Infinity,
            title: '神器', message: 'アクションカードを1枚、手札に獲得してください。'
        });
    },

    // 影：山札のカードを、手札と同じようにプレイする（山札の一番下にあるものから）。断ったら元に戻す
    playShadowCard(cardId) {
        const player = this.getCurrentPlayer();
        const index = player.deck.map(card => card.id).lastIndexOf(cardId);
        const card = player.deck[index];
        if (!card || !card.isType(SHADOW)) {
            this.reject('山札にその影のカードはありません');
            return false;
        }
        if (this.phase !== 'action') {
            this.reject('アクションフェーズではありません');
            return false;
        }
        player.deck.splice(index, 1);
        player.hand.push(card);
        if (this.playActionCard(player.hand.length - 1)) return true;
        player.hand.splice(player.hand.indexOf(card), 1);
        player.deck.splice(index, 0, card);
        return false;
    },

    // 盛大な取引：残りのアクションを購入として使える
    hasBuyLeft(player) {
        return player.buys > 0 || (this.isProphecyActive('flourishing_trade') && this.phase === 'buy' && player.actions > 0);
    },

    spendBuy(player) {
        if (player.buys > 0) {
            player.buys--;
            return;
        }
        player.actions--;
        this.log(`${player.name}は盛大な取引で、アクションを購入として使いました`);
    },

    // 財宝をプレイしたとき（豊作・狼狽）。財宝を得る前に呼ぶ
    risingSunOnTreasure(player, card) {
        if (this.isProphecyActive('good_harvest') && player === this.getCurrentPlayer()) {
            const harvested = this.turnState.harvested;
            if (!harvested.includes(card.id)) {
                harvested.push(card.id);
                gainBenefits(player, this, { buys: 1, coins: 1 }, '豊作');
            }
        }
        if (this.isProphecyActive('panic')) gainBenefits(player, this, { buys: 2 }, '狼狽');
    },

    // 悟り：アクションフェーズに財宝をプレイしたときは、効果の代わりにカード +1 とアクション +1
    isEnlightenedPlay(card) {
        return this.isProphecyActive('enlightenment') && this.phase === 'action' && card.types.includes(TREASURE);
    },

    // カードを獲得したときの効果（川の社・金継ぎの記録と、予言）
    risingSunGainSteps(player, card, isCurrent) {
        const steps = [];
        if (card.id === 'gold') player.gainedGold = true;
        if (!this.prophecy || this.prophecy.sun > 0) return steps;
        const isTreasureCard = card.types.includes(TREASURE);

        // 官僚制：コスト0でないカードを獲得したとき、銅貨を獲得する
        if (this.isProphecyActive('bureaucracy') && (this.getCost(card) > 0 || this.hasExtraCost(card))) {
            steps.push(() => { if (this.gainCardFromSupply(player, 'copper')) this.log(`${player.name}は官僚制で銅貨を獲得しました`); });
        }
        // 成長：財宝を獲得したとき、それより安いカードを獲得する
        if (this.isProphecyActive('growth') && isTreasureCard) {
            steps.push(() => this.promptGain({
                player, lessThan: card, title: '成長', message: `${card.name}より安いカードを1枚獲得してください。`
            }));
        }
        // 厳冬：自分のターンに獲得したとき、山に負債があれば負い、なければ負債を2置く
        if (this.isProphecyActive('harsh_winter') && isCurrent) {
            const pileId = this.pileOf[card.id] ?? card.id;
            if (this.supply[pileId] !== undefined || this.nonSupply[pileId] !== undefined) {
                if ((this.pileDebt[pileId] ?? 0) > 0) {
                    this.takeDebt(player, this.pileDebt[pileId], '厳冬');
                    this.pileDebt[pileId] = 0;
                } else {
                    this.pileDebt[pileId] = (this.pileDebt[pileId] ?? 0) + 2;
                    this.log(`${this.getPileName(pileId)}の山に負債を2置きました（厳冬）`);
                }
            }
        }
        // 進歩：獲得したカードを山札の上に置く
        if (this.isProphecyActive('progress')) {
            steps.push(() => {
                if (!player.removeCard(card)) return;
                player.deck.unshift(card);
                this.log(`${player.name}は進歩で${card.name}を山札の上に置きました`);
            });
        }
        // 急速拡大：アクションか財宝を獲得したとき、脇に置き、次のターンの開始時にプレイする
        if (this.isProphecyActive('rapid_expansion') && (card.types.includes(ACTION) || isTreasureCard)) {
            steps.push(() => {
                if (!player.removeCard(card)) return;
                player.setAside.push(card);
                player.startOfTurnPlays.push(card);
                this.log(`${player.name}は急速拡大で${card.name}を脇に置きました（次のターンの開始時にプレイします）`);
            });
        }
        return steps;
    },

    // カードをプレイした後の効果（大名・来寇・偉大な指導者）
    risingSunAfterPlaySteps(player, card) {
        const steps = [];
        const isActionCard = card.isType(ACTION);
        // 大名：このターン次にプレイした命令でないアクションを、その後でもう一度プレイする
        if (isActionCard && !card.isType(COMMAND) && player === this.getCurrentPlayer() && this.turnState.daimyos > 0) {
            const count = this.turnState.daimyos;
            this.turnState.daimyos = 0;
            for (let i = 0; i < count; i++) {
                steps.push(() => {
                    this.log(`${player.name}は大名で${card.name}をもう一度プレイしました`);
                    card.play(player, this);
                });
            }
        }
        if (this.isProphecyActive('approaching_army') && card.isType(ATTACK)) {
            steps.push(() => gainBenefits(player, this, { coins: 1 }, '来寇'));
        }
        if (this.isProphecyActive('great_leader') && isActionCard) {
            steps.push(() => gainBenefits(player, this, { actions: 1 }, '偉大な指導者'));
        }
        return steps;
    },

    // ターンの開始時の効果（好機到来で脇に置いた手札・神器・病）。startTurn から手順として積む
    risingSunStartOfTurnSteps(player) {
        const steps = [];
        if (player.bidingTime.length > 0) {
            steps.push(() => {
                const cards = player.bidingTime.splice(0).filter(card => player.setAside.includes(card));
                cards.forEach(card => player.setAside.splice(player.setAside.indexOf(card), 1));
                player.hand.push(...cards);
                if (cards.length > 0) this.log(`${player.name}は好機到来で脇に置いた${cards.length}枚を手札に加えました`);
            });
        }
        if (this.isProphecyActive('kind_emperor')) steps.push(() => this.promptKindEmperor(player));
        if (this.isProphecyActive('sickness')) {
            steps.push(() => this.promptChoose({
                player, options: ['呪いを1枚山札の上に獲得する', '手札を3枚捨て札にする'], title: '病',
                message: '1つを選んでください。', purpose: 'sickness',
                callback: ([index]) => {
                    if (index === 0) {
                        this.gainCurse(player, 'deck');
                        return;
                    }
                    if (player.hand.length <= 3) {
                        const cards = player.hand.splice(0);
                        this.discardCards(player, cards);
                        this.log(`${player.name}は病で手札を${cards.length}枚捨て札にしました`);
                        return;
                    }
                    promptDiscardFromHand(this, player, 3, '病');
                }
            }));
        }
        return steps;
    },

    // クリーンアップの開始時の効果（川の社・好機到来）。endTurn から手順として積む
    risingSunCleanupSteps(player) {
        const steps = [];
        const shrines = this.turnState.riverShrines;
        if (shrines > 0 && this.turnState.buyPhaseGains === 0) {
            for (let i = 0; i < shrines; i++) {
                steps.push(() => this.promptGain({ player, maxCost: 4, title: '川の社', message: 'コスト4以下のカードを1枚獲得してください。' }));
            }
        }
        if (this.isProphecyActive('biding_time')) {
            steps.push(() => {
                const cards = player.hand.splice(0);
                if (cards.length === 0) return;
                player.setAside.push(...cards);
                player.bidingTime.push(...cards);
                this.log(`${player.name}は好機到来で手札を${cards.length}枚脇に置きました`);
            });
        }
        return steps;
    },

    // 場のカードを捨て札にする直前（狼狽：場の財宝を山に戻す）
    risingSunBeforeCleanup(player) {
        if (!this.isProphecyActive('panic')) return;
        const treasures = player.playArea.filter(card => card.types.includes(TREASURE) && !player.hasPendingDuration(card));
        const returned = treasures.filter(card => this.returnToSupply(player, card));
        if (returned.length > 0) this.log(`${player.name}は狼狽で場の財宝（${returned.length}枚）を山に戻しました`);
    }
};

export function installRisingSun(Game) {
    Object.assign(Game.prototype, risingSunMethods);
    // プレイした後の効果に、旭日のものを加える（同盟の getAfterPlayStep を包む）
    const baseAfterPlay = Game.prototype.getAfterPlayStep;
    Game.prototype.getAfterPlayStep = function (player, card) {
        const base = baseAfterPlay.call(this, player, card);
        const steps = [...(base ? [base] : []), ...this.risingSunAfterPlaySteps(player, card)];
        return steps.length > 0 ? () => this.runNext(...steps) : null;
    };
}
