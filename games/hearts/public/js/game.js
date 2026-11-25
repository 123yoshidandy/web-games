/**
 * ハーツ（Hearts）のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（配り方はシードから決まる）
 *
 * カードは「ランク＋スート」の2文字（例：'2C'・'TD'・'QS'・'AH'）。T は10。スートは C♣・D♦・S♠・H♥
 * 席は時計回りに 0→1→2→3。「左」は次の席（+1）、「右」は前の席（+3）、「向かい」は +2
 *
 * ルール（ボードゲームアリーナの既定）
 * - 4人。52枚を13枚ずつ配る
 * - 配ったら3枚を渡す。ラウンドごとに、左 → 右 → 向かい → 渡さない、をくり返す
 * - クラブの2を持つ人が、それを出して最初のトリックを始める。時計回りに1枚ずつ出す
 * - 出された最初のスートを持っていれば、それを出す（マスト・フォロー）。なければ何を出してもよい
 * - 一番強いのは、最初のスートの一番高いランク（A が最強）。取った人が次を始める
 * - 最初のトリックでは、クラブがなくても、ハートとスペードのクイーンを出せない
 * - ハートが出るまで（ハートが割れるまで）、ハートで始められない
 * - 取ったハートは1枚1点、スペードのクイーンは13点の失点。ダイヤのジャックは使わない（既定で無効）
 * - 失点の札を1人で全部取ったら（シュート・ザ・ムーン）、その人は0点、ほかの全員が26点
 * - だれかの失点の合計が100点に達したら終わり。失点が一番少ない人の勝ち
 *   （ボードゲームアリーナは「100点から引いて0点で終わり、多い人の勝ち」の形で数える。同じことを失点で数えている）
 *
 * 公式ルールにないので、次のように決めた
 * - 最初のトリックで手札が失点の札だけなら、それを出してよい（出せる札がなくならないように）
 * - 手札がハートだけなら、割れる前でもハートで始めてよい
 * - スペードのクイーンでは、ハートは割れない
 * - 失点が一番少ない人が複数いたら、その全員を勝ちとする
 */

import { createRandom, shuffle } from './random.js';

export const PLAYERS = 4;
export const HAND_SIZE = 13;
export const END_SCORE = 100;
export const SUITS = ['C', 'D', 'S', 'H'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const QUEEN = 'QS';
export const PASS_COUNT = 3;
// ラウンドごとの渡す先（席に足す数）。0 は渡さない
export const PASS_OFFSETS = [1, 3, 2, 0];
const MAX_LOGS = 200;
const MAX_EVENTS = 120;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { pass: ['cards'], play: ['card'] };

export const suitOf = (card) => card[1];
export const rankOf = (card) => RANKS.indexOf(card[0]) + 2; // 2〜14
export const pointsOf = (card) => (card === QUEEN ? 13 : suitOf(card) === 'H' ? 1 : 0);
export const isPoint = (card) => pointsOf(card) > 0;
export const DECK = SUITS.flatMap(s => RANKS.map(r => r + s));

// 手札の並び（クラブ・ダイヤ・スペード・ハートの順に、小さい順）
export const sortCards = (cards) => [...cards].sort((a, b) => SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || rankOf(a) - rankOf(b));

// トリックを取る人（最初のスートの一番高いランク）
export function trickWinner(trick) {
    const suit = suitOf(trick[0].card);
    return trick.filter(t => suitOf(t.card) === suit).reduce((best, t) => (rankOf(t.card) > rankOf(best.card) ? t : best)).seat;
}

// 出せる札。hand：手札、trick：場のトリック、firstTrick：最初のトリックか、broken：ハートが割れたか
export function legalCards(hand, trick, { firstTrick, broken }) {
    if (trick.length === 0) {
        if (firstTrick) return hand.includes('2C') ? ['2C'] : [];
        if (broken) return [...hand];
        const nonHearts = hand.filter(c => suitOf(c) !== 'H');
        return nonHearts.length > 0 ? nonHearts : [...hand];
    }
    const suit = suitOf(trick[0].card);
    const follow = hand.filter(c => suitOf(c) === suit);
    if (follow.length > 0) return follow;
    if (firstTrick) {
        const safe = hand.filter(c => !isPoint(c));
        return safe.length > 0 ? safe : [...hand];
    }
    return [...hand];
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error(`人数は${PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: [], taken: [], score: 0
        }));
        this.round = 0;
        this.phase = 'pass';         // pass：渡す札を選ぶ / play：出す / end：終わり
        this.passes = this.players.map(() => null); // 選んだ渡す札（そろうまで、ほかの人には見せない）
        this.trick = [];             // 場のトリック [{ seat, card }]
        this.trickNo = 0;            // このラウンドで何回目のトリックか（1〜13）
        this.turn = null;
        this.broken = false;         // ハートが割れたか
        this.played = [];            // このラウンドで出された札
        this.winners = [];
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

    passOffset() {
        return PASS_OFFSETS[(this.round - 1) % PASS_OFFSETS.length];
    }

    // 今操作が必要な人
    actors() {
        if (this.phase === 'pass') return this.players.filter(p => this.passes[p.id] === null).map(p => p.id);
        if (this.phase === 'play') return [this.turn];
        return [];
    }

    legalFor(seat) {
        if (this.phase !== 'play' || seat !== this.turn) return [];
        return legalCards(this.players[seat].hand, this.trick, { firstTrick: this.trickNo === 1, broken: this.broken });
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { pass: { pass: this.pass }, play: { play: this.play } }[this.phase]?.[command.type];
        if (!handler || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = Array.isArray(command[key]) ? [...command[key]] : command[key]; });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'pass', cards: [3枚] }：渡す札を選ぶ。全員がそろったら、まとめて渡す
    pass(seat, { cards }) {
        if (this.passes[seat] !== null) return this.fail('もう選んでいます');
        const hand = this.players[seat].hand;
        if (!Array.isArray(cards) || cards.length !== PASS_COUNT || new Set(cards).size !== PASS_COUNT) return this.fail(`${PASS_COUNT}枚を選んでください`);
        if (!cards.every(c => hand.includes(c))) return this.fail('持っていない札です');
        this.passes[seat] = sortCards(cards);
        this.emit({ type: 'passReady', seat });
        if (this.passes.every(p => p !== null)) this.exchange();
        return true;
    }

    // { type: 'play', card }：手番の人が1枚出す
    play(seat, { card }) {
        if (seat !== this.turn) return this.fail('あなたの番ではありません');
        if (!this.players[seat].hand.includes(card)) return this.fail('持っていない札です');
        if (!this.legalFor(seat).includes(card)) return this.fail(this.whyIllegal(seat, card));
        const player = this.players[seat];
        player.hand.splice(player.hand.indexOf(card), 1);
        this.trick.push({ seat, card });
        this.played.push(card);
        const breaks = suitOf(card) === 'H' && !this.broken;
        if (breaks) this.broken = true;
        this.emit({ type: 'play', seat, card, breaks });
        if (this.trick.length < PLAYERS) {
            this.turn = (seat + 1) % PLAYERS;
            return true;
        }
        this.finishTrick();
        return true;
    }

    whyIllegal(seat, card) {
        if (this.trick.length === 0) {
            if (this.trickNo === 1) return 'クラブの2から始めます';
            return 'ハートが割れるまで、ハートでは始められません';
        }
        const suit = suitOf(this.trick[0].card);
        if (suitOf(card) !== suit && this.players[seat].hand.some(c => suitOf(c) === suit)) return '出されたスートを出してください';
        return '最初のトリックでは、失点の札は出せません';
    }

    // ---- 進行 ----

    deal() {
        this.round++;
        const deck = shuffle([...DECK], this.random);
        this.players.forEach(p => {
            p.hand = sortCards(deck.splice(0, HAND_SIZE));
            p.taken = [];
        });
        this.trick = [];
        this.trickNo = 0;
        this.broken = false;
        this.played = [];
        this.passes = this.players.map(() => null);
        this.emit({ type: 'deal', round: this.round, offset: this.passOffset(), hands: this.players.map(p => [...p.hand]) });
        this.log(`第${this.round}ラウンド`);
        if (this.passOffset() === 0) this.startPlay();
        else this.phase = 'pass';
    }

    exchange() {
        const offset = this.passOffset();
        const received = this.players.map(() => []);
        this.players.forEach(p => {
            const to = (p.id + offset) % PLAYERS;
            received[to] = this.passes[p.id];
            p.hand = p.hand.filter(c => !this.passes[p.id].includes(c));
        });
        this.players.forEach(p => { p.hand = sortCards([...p.hand, ...received[p.id]]); });
        this.emit({ type: 'exchange', offset, sent: this.passes.map(c => [...c]), received, hands: this.players.map(p => [...p.hand]) });
        this.startPlay();
    }

    startPlay() {
        this.phase = 'play';
        this.trickNo = 1;
        this.turn = this.players.find(p => p.hand.includes('2C')).id;
        this.emit({ type: 'lead', seat: this.turn });
    }

    finishTrick() {
        const winner = trickWinner(this.trick);
        const cards = this.trick.map(t => t.card);
        const points = cards.reduce((s, c) => s + pointsOf(c), 0);
        this.players[winner].taken.push(...cards);
        this.emit({ type: 'trick', winner, cards: this.trick.map(t => ({ ...t })), points, trickNo: this.trickNo });
        this.trick = [];
        if (this.players[winner].hand.length > 0) {
            this.trickNo++;
            this.turn = winner;
            return;
        }
        this.finishRound();
    }

    // ラウンドの終わり：取った失点を足す。全部を1人で取ったら、ほかの全員に26点
    finishRound() {
        const taken = this.players.map(p => p.taken.reduce((s, c) => s + pointsOf(c), 0));
        const moon = taken.findIndex(t => t === 26);
        const added = moon >= 0 ? taken.map((_, i) => (i === moon ? 0 : 26)) : taken;
        this.players.forEach((p, i) => { p.score += added[i]; });
        this.turn = null;
        this.emit({ type: 'roundEnd', round: this.round, taken, added, moon: moon >= 0 ? moon : null, scores: this.players.map(p => p.score) });
        this.log(moon >= 0 ? `${this.players[moon].name}がシュート・ザ・ムーン` : `第${this.round}ラウンドが終わりました`);
        if (this.players.some(p => p.score >= END_SCORE)) return this.endGame();
        this.deal();
    }

    endGame() {
        this.phase = 'end';
        const best = Math.min(...this.players.map(p => p.score));
        this.winners = this.players.filter(p => p.score === best).map(p => p.id);
        this.emit({ type: 'end', winners: [...this.winners], scores: this.players.map(p => p.score) });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
    }

    // ---- 道具 ----

    // 全員に見せてよい状態（イベントに付けて、画面がその時点の様子を描けるようにする）
    publicState() {
        return {
            phase: this.phase,
            round: this.round,
            offset: this.passOffset(),
            trickNo: this.trickNo,
            turn: this.turn,
            broken: this.broken,
            trick: this.trick.map(t => ({ ...t })),
            played: [...this.played],
            players: this.players.map(p => ({
                id: p.id, name: p.name, isCPU: p.isCPU, count: p.hand.length,
                points: p.taken.reduce((s, c) => s + pointsOf(c), 0), queen: p.taken.includes(QUEEN),
                score: p.score, passed: this.passes[p.id] !== null
            }))
        };
    }

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event, state: this.publicState() });
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
