/**
 * 花見小路（Hanamikoji）のゲームの進行（2人用）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（配り方はシードから決まる）
 *
 * ルール
 * - 芸者7人（点数 2・2・2・3・3・4・5）と、品物のカード21枚（芸者ごとに点数と同じ枚数）
 * - ラウンドの準備：品物を切って1枚を伏せたまま除き、各自に6枚配る。残りの8枚が山札
 * - 手番の初めに山札から1枚引き、まだ使っていない行動を1つ行う。行動は4つで、各ラウンドに1回ずつ使う
 *   - 秘密：1枚を伏せて取っておく。ラウンドの終わりに、自分の側に置いたものとして数える
 *   - 放棄：2枚を伏せて捨てる。このラウンドでは数えない
 *   - 贈り物：3枚を見せ、相手が1枚選んで相手の側に置く。残りの2枚は自分の側に置く
 *   - 競争：2枚ずつの2組を見せ、相手が1組選んで相手の側に置く。残りの1組は自分の側に置く
 * - 両者が4つの行動を使い終えたら、ラウンドの終わり。秘密のカードを開け、芸者ごとに置いた枚数の多い方が好意を得る
 *   同数なら、好意の印は前のラウンドのまま（最初のラウンドなら、だれのものでもない）
 * - 好意を得た芸者の点数の合計が11点以上か、芸者4人以上の好意を得た方の勝ち（点数を先に見る）
 *   どちらでもなければ、好意の印をそのままにして次のラウンドを行う。手番の順は、ラウンドごとに入れ替える
 *
 * 公式のルールに書かれていないので、次のように決めた
 * - 最初のラウンドの1番手は、シードから決める
 * - 除いたカードと、放棄したカードは、ラウンドの終わりにも見せない
 */

import { createRandom, shuffle } from './random.js';

export const GEISHA = [
    { name: '椿', value: 2 },
    { name: '山吹', value: 2 },
    { name: '柳', value: 2 },
    { name: '朝顔', value: 3 },
    { name: '桔梗', value: 3 },
    { name: '藤', value: 4 },
    { name: '桜', value: 5 }
];
export const GEISHA_COUNT = GEISHA.length;
export const ACTIONS = ['secret', 'discard', 'gift', 'compete'];
export const ACTION_NAMES = { secret: '秘密', discard: '放棄', gift: '贈り物', compete: '競争' };
export const ACTION_SIZES = { secret: 1, discard: 2, gift: 3, compete: 4 };
export const HAND_START = 6;
export const POINTS_TO_WIN = 11;
export const GEISHAS_TO_WIN = 4;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { secret: ['card'], discard: ['cards'], gift: ['cards'], compete: ['groups'], pick: ['index'] };
const MAX_LOGS = 200;
const MAX_EVENTS = 80;

export const cardName = (g) => GEISHA[g].name;
export const countOf = (cards, g) => cards.filter(c => c === g).length;
const sortCards = (cards) => cards.sort((a, b) => a - b);
const sum = (list) => list.reduce((s, v) => s + v, 0);
const isCard = (value) => Number.isInteger(value) && value >= 0 && value < GEISHA_COUNT;

// 手札から cards（重なりあり）を出せるか
export function hasCards(hand, cards) {
    const rest = [...hand];
    for (const card of cards) {
        const i = rest.indexOf(card);
        if (i < 0) return false;
        rest.splice(i, 1);
    }
    return true;
}

export function removeCards(hand, cards) {
    cards.forEach(card => hand.splice(hand.indexOf(card), 1));
    return hand;
}

// 全部の品物のカード（芸者の番号の列）
export function fullDeck() {
    return GEISHA.flatMap((g, i) => Array(g.value).fill(i));
}

export default class Game {
    // players: [{ name, isCPU }]（2人）、options: { seed }
    constructor(players, options = {}) {
        if (players.length !== 2) throw new Error('花見小路は2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: [], secret: null, discards: [], placed: Array(GEISHA_COUNT).fill(0), used: [], points: 0, geishas: 0
        }));
        this.favor = Array(GEISHA_COUNT).fill(null);  // 好意の印：席の番号か null
        this.round = 0;
        this.starter = Math.floor(this.random() * 2);
        this.current = this.starter;
        this.phase = 'play';         // play：手番 / choose：相手が贈り物・競争から選ぶ / end：終わり
        this.pending = null;         // 選ぶのを待っている贈り物・競争 { type, from, cards | groups }
        this.history = [];           // ラウンドごとの結果
        this.winner = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.deal();
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今、操作する人
    actor() {
        if (this.phase === 'play') return this.current;
        if (this.phase === 'choose') return 1 - this.pending.from;
        return null;
    }

    actors() {
        const actor = this.actor();
        return actor === null ? [] : [actor];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (playerId !== this.actor()) return this.fail('あなたの番ではありません');
        if ((command.type === 'pick') !== (this.phase === 'choose')) return this.fail('今はその操作はできません');
        const handler = { secret: this.playSecret, discard: this.playDiscard, gift: this.playGift, compete: this.playCompete, pick: this.pick }[command.type];
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = structuredClone(command[key]); });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 行動の判定（状態を変えない） ----

    checkAction(seat, type, cards) {
        const player = this.players[seat];
        if (player.used.includes(type)) return this.fail(`${ACTION_NAMES[type]}はこのラウンドで使いました`);
        if (!Array.isArray(cards) || cards.length !== ACTION_SIZES[type] || !cards.every(isCard)) return this.fail(`${ACTION_NAMES[type]}には${ACTION_SIZES[type]}枚を選びます`);
        if (!hasCards(player.hand, cards)) return this.fail('持っていないカードは出せません');
        return true;
    }

    // ---- 手番の操作 ----

    // { type: 'secret', card }：1枚を伏せて取っておく
    playSecret(seat, { card }) {
        if (!this.checkAction(seat, 'secret', [card])) return false;
        const player = this.players[seat];
        removeCards(player.hand, [card]);
        player.secret = card;
        player.used.push('secret');
        this.emit({ type: 'secret', seat, card });
        this.log(`${player.name}が秘密を使いました`);
        this.nextTurn(seat);
        return true;
    }

    // { type: 'discard', cards: [2枚] }：2枚を伏せて捨てる
    playDiscard(seat, { cards }) {
        if (!this.checkAction(seat, 'discard', cards)) return false;
        const player = this.players[seat];
        removeCards(player.hand, cards);
        player.discards = sortCards([...cards]);
        player.used.push('discard');
        this.emit({ type: 'discard', seat, cards: [...player.discards] });
        this.log(`${player.name}が放棄を使いました`);
        this.nextTurn(seat);
        return true;
    }

    // { type: 'gift', cards: [3枚] }：3枚を見せ、相手に1枚選ばせる
    playGift(seat, { cards }) {
        if (!this.checkAction(seat, 'gift', cards)) return false;
        const player = this.players[seat];
        const shown = sortCards([...cards]);
        removeCards(player.hand, shown);
        player.used.push('gift');
        this.pending = { type: 'gift', from: seat, cards: shown };
        this.phase = 'choose';
        this.emit({ type: 'offer', seat, kind: 'gift', cards: [...shown] });
        this.log(`${player.name}が贈り物を出しました`);
        return true;
    }

    // { type: 'compete', groups: [[2枚], [2枚]] }：2組を見せ、相手に1組選ばせる
    playCompete(seat, { groups }) {
        if (!Array.isArray(groups) || groups.length !== 2 || groups.some(g => !Array.isArray(g) || g.length !== 2)) return this.fail('競争には2枚ずつの2組を選びます');
        if (!this.checkAction(seat, 'compete', groups.flat())) return false;
        const player = this.players[seat];
        const shown = groups.map(g => sortCards([...g]));
        removeCards(player.hand, shown.flat());
        player.used.push('compete');
        this.pending = { type: 'compete', from: seat, groups: shown };
        this.phase = 'choose';
        this.emit({ type: 'offer', seat, kind: 'compete', groups: structuredClone(shown) });
        this.log(`${player.name}が競争を出しました`);
        return true;
    }

    // { type: 'pick', index }：贈り物なら3枚のうち1枚（0〜2）、競争なら2組のうち1組（0〜1）を選ぶ
    pick(seat, { index }) {
        const offer = this.pending;
        const options = offer.type === 'gift' ? offer.cards.map(c => [c]) : offer.groups;
        if (!Number.isInteger(index) || index < 0 || index >= options.length) return this.fail('選ぶものが正しくありません');
        const mine = options[index];
        const theirs = options.filter((_, i) => i !== index).flat();
        const from = offer.from;
        mine.forEach(c => { this.players[seat].placed[c]++; });
        theirs.forEach(c => { this.players[from].placed[c]++; });
        this.pending = null;
        this.phase = 'play';
        this.emit({ type: 'pick', seat, from, kind: offer.type, index, offer: offer.type === 'gift' ? { cards: [...offer.cards] } : { groups: structuredClone(offer.groups) }, mine: [...mine], theirs: [...theirs] });
        this.log(`${this.players[seat].name}が${mine.map(cardName).join('・')}を選びました`);
        this.nextTurn(from);
        return true;
    }

    // ---- 進行 ----

    deal() {
        this.round++;
        const cards = shuffle(fullDeck(), this.random);
        this.removed = cards.shift();
        this.players.forEach(p => {
            p.hand = sortCards(cards.splice(0, HAND_START));
            p.secret = null;
            p.discards = [];
            p.placed = Array(GEISHA_COUNT).fill(0);
            p.used = [];
        });
        this.deck = cards;
        this.pending = null;
        this.phase = 'play';
        this.emit({ type: 'deal', round: this.round, starter: this.starter, hands: this.players.map(p => [...p.hand]), favor: [...this.favor] });
        this.log(`第${this.round}ラウンド。${this.players[this.starter].name}から始めます`);
        this.startTurn(this.starter);
    }

    // 手番の初めに1枚引く
    startTurn(seat) {
        this.current = seat;
        const player = this.players[seat];
        if (this.deck.length > 0) {
            const card = this.deck.shift();
            player.hand.push(card);
            sortCards(player.hand);
            this.emit({ type: 'draw', seat, card });
        }
    }

    // 行動を終えた人（贈り物・競争なら、相手が選んだあと）の次
    nextTurn(seat) {
        if (this.players.every(p => p.used.length === ACTIONS.length)) return this.endRound();
        this.startTurn(1 - seat);
    }

    endRound() {
        const favorBefore = [...this.favor];
        const counts = this.players.map(p => p.placed.map((n, g) => n + (p.secret === g ? 1 : 0)));
        GEISHA.forEach((_, g) => {
            if (counts[0][g] > counts[1][g]) this.favor[g] = 0;
            else if (counts[1][g] > counts[0][g]) this.favor[g] = 1;
        });
        this.players.forEach(p => {
            p.points = sum(GEISHA.map((g, i) => (this.favor[i] === p.id ? g.value : 0)));
            p.geishas = this.favor.filter(f => f === p.id).length;
        });
        const byPoints = this.players.find(p => p.points >= POINTS_TO_WIN);
        const byGeishas = this.players.find(p => p.geishas >= GEISHAS_TO_WIN);
        const champion = byPoints ?? byGeishas ?? null;
        const result = {
            round: this.round, counts, secrets: this.players.map(p => p.secret), favorBefore, favor: [...this.favor],
            points: this.players.map(p => p.points), geishas: this.players.map(p => p.geishas),
            winner: champion ? champion.id : null, reason: champion ? (byPoints ? 'points' : 'geishas') : null
        };
        this.history.push(structuredClone(result));
        this.emit({ type: 'roundEnd', ...structuredClone(result) });
        this.log(`第${this.round}ラウンドの終わり。${this.players.map(p => `${p.name} ${p.points}点・${p.geishas}人`).join('、')}`);
        if (champion) {
            this.phase = 'end';
            this.winner = champion.id;
            this.emit({ type: 'end', winner: champion.id, reason: result.reason });
            this.log(`${champion.name}の勝ちです`);
            return;
        }
        // 次のラウンドは、手番の順を入れ替える
        this.starter = 1 - this.starter;
        this.deal();
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(text) {
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    // 保存する形（参加者・設定・操作の記録）。オンライン対戦のサーバーもこの形で保存する
    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    // 操作の記録から同じゲームを作り直す
    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) {
                throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
            }
        });
        return game;
    }
}
