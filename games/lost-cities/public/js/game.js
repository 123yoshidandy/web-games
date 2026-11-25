/**
 * ロストシティ（Lost Cities）のゲームの進行（2人用）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びはシードから決まる）
 *
 * ルール
 * - カード60枚：5色（黄・青・白・緑・赤）×（2〜10 の数字9枚と、握手（賭け）3枚）
 * - 各自に8枚配る。手番には、1枚を出し（自分の探検に置くか、その色の捨て場に捨てる）、1枚を引く（山札か、捨て場の一番上）
 *   - 探検には、同じ色のカードを小さい順にしか置けない（同じ数はない）。握手は、その色の数字より前にだけ置ける
 *   - 今捨てたカードは、その手番には引けない
 * - 山札の最後の1枚を引いたら、ラウンドの終わり
 * - 得点：始めた探検ごとに（数字の合計 − 20）×（握手の枚数 + 1）。8枚以上なら、さらに +20（倍にしない）。始めていない色は0点
 * - 決めた数のラウンド（既定は3）の合計で、多い方の勝ち
 *
 * ルールブックに書かれていないので、次のように決めた
 * - 最初のラウンドの1番手はシードから決め、そのあとは交代する
 * - 合計が同じなら引き分け
 */

import { createRandom, shuffle } from './random.js';

export const COLORS = ['yellow', 'blue', 'white', 'green', 'red'];
export const COLOR_NAMES = { yellow: '黄', blue: '青', white: '白', green: '緑', red: '赤' };
export const NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
export const WAGERS = 3;
export const HAND_SIZE = 8;
export const EXPEDITION_COST = 20;
export const LONG_BONUS = 20;
export const LONG_COUNT = 8;
export const ROUND_OPTIONS = [1, 3];
export const DEFAULT_ROUNDS = 3;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { play: ['card', 'to'], draw: ['from'] };
const MAX_LOGS = 200;
const MAX_EVENTS = 80;

// カードは 0〜59 の番号。色ごとに、握手3枚（value 0）と 2〜10
export const CARDS = COLORS.flatMap(color => [
    ...Array.from({ length: WAGERS }, () => ({ color, value: 0 })),
    ...NUMBERS.map(value => ({ color, value }))
])
    .map((card, id) => Object.freeze({ id, ...card }));

export const cardName = (id) => `${COLOR_NAMES[CARDS[id].color]}${CARDS[id].value === 0 ? 'の握手' : CARDS[id].value}`;
const sortCards = (cards) => cards.sort((a, b) => COLORS.indexOf(CARDS[a].color) - COLORS.indexOf(CARDS[b].color) || CARDS[a].value - CARDS[b].value || a - b);

// 1つの探検の得点（カードの番号の配列）
export function expeditionScore(cards) {
    if (cards.length === 0) return 0;
    const wagers = cards.filter(id => CARDS[id].value === 0).length;
    const sum = cards.reduce((s, id) => s + CARDS[id].value, 0);
    return (sum - EXPEDITION_COST) * (wagers + 1) + (cards.length >= LONG_COUNT ? LONG_BONUS : 0);
}

export const totalScore = (expeditions) => COLORS.reduce((s, c) => s + expeditionScore(expeditions[c]), 0);

// その探検にカードを置けるか（小さい順。握手は数字より前）
export function canPlace(expedition, id) {
    const last = expedition.at(-1);
    if (last === undefined) return true;
    const value = CARDS[id].value;
    const lastValue = CARDS[last].value;
    if (value === 0) return lastValue === 0;
    return value > lastValue;
}

const emptyColors = () => Object.fromEntries(COLORS.map(c => [c, []]));

export default class Game {
    // players: [{ name, isCPU }]（2人）、options: { seed, rounds }
    constructor(players, options = {}) {
        if (players.length !== 2) throw new Error('ロストシティは2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const rounds = ROUND_OPTIONS.includes(options.rounds) ? options.rounds : DEFAULT_ROUNDS;
        this.options = { seed, rounds };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: [], expeditions: emptyColors(), total: 0
        }));
        this.round = 0;
        this.firstStarter = Math.floor(this.random() * 2);
        this.phase = 'play';       // play：出す / draw：引く / end：終わり
        this.justDiscarded = null; // この手番に捨てたカード（引けない）
        this.history = [];
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

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { play: { play: this.play }, draw: { draw: this.draw } }[this.phase]?.[command.type];
        if (!handler) return this.fail(this.phase === 'play' ? '先にカードを出してください' : '次はカードを引きます');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = command[key]; });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'play', card, to: 'expedition' | 'discard' }
    play(seat, { card, to }) {
        const player = this.players[seat];
        if (!player.hand.includes(card)) return this.fail('そのカードは持っていません');
        if (to !== 'expedition' && to !== 'discard') return this.fail('出す先が正しくありません');
        const { color } = CARDS[card];
        if (to === 'expedition' && !canPlace(player.expeditions[color], card)) {
            return this.fail(CARDS[card].value === 0 ? '握手は、その色の数字より前にだけ置けます' : '探検には小さい順にしか置けません');
        }
        player.hand.splice(player.hand.indexOf(card), 1);
        if (to === 'expedition') {
            player.expeditions[color].push(card);
            this.justDiscarded = null;
        } else {
            this.discards[color].push(card);
            this.justDiscarded = card;
        }
        this.phase = 'draw';
        this.emit({ type: 'play', seat, card, to });
        this.log(`${player.name}が${cardName(card)}を${to === 'expedition' ? '探検に出しました' : '捨てました'}`);
        return true;
    }

    // { type: 'draw', from: 'deck' | 色 }
    draw(seat, { from }) {
        const player = this.players[seat];
        let card;
        if (from === 'deck') {
            if (this.deck.length === 0) return this.fail('山札がありません');
            card = this.deck.shift();
        } else {
            if (!COLORS.includes(from)) return this.fail('引く場所が正しくありません');
            const pile = this.discards[from];
            if (pile.length === 0) return this.fail('その捨て場は空です');
            if (pile.at(-1) === this.justDiscarded) return this.fail('今捨てたカードは引けません');
            card = pile.pop();
        }
        player.hand.push(card);
        sortCards(player.hand);
        this.justDiscarded = null;
        // 山札から引いたカードの中身は、本人だけが知る（イベントでは、ビューが隠す）
        this.emit({ type: 'draw', seat, from, card });
        this.log(`${player.name}が${from === 'deck' ? '山札から' : `${COLOR_NAMES[from]}の捨て場から${cardName(card)}を`}引きました`);
        if (this.deck.length === 0) return this.endRound() || true;
        this.current = 1 - seat;
        this.phase = 'play';
        return true;
    }

    // ---- 進行 ----

    deal() {
        this.round++;
        this.deck = shuffle(CARDS.map(c => c.id), this.random);
        this.discards = emptyColors();
        this.players.forEach(p => {
            p.hand = sortCards(this.deck.splice(0, HAND_SIZE));
            p.expeditions = emptyColors();
        });
        this.starter = (this.firstStarter + this.round - 1) % 2;
        this.current = this.starter;
        this.phase = 'play';
        this.justDiscarded = null;
        this.emit({ type: 'deal', round: this.round, hands: this.players.map(p => [...p.hand]), starter: this.starter });
        this.log(`第${this.round}ラウンド。${this.players[this.starter].name}から始めます`);
    }

    endRound() {
        const results = this.players.map(p => {
            const scores = Object.fromEntries(COLORS.map(c => [c, expeditionScore(p.expeditions[c])]));
            const score = Object.values(scores).reduce((s, v) => s + v, 0);
            p.total += score;
            return { seat: p.id, scores, score, total: p.total, expeditions: structuredClone(p.expeditions) };
        });
        this.history.push({ round: this.round, results });
        this.emit({ type: 'roundEnd', round: this.round, results });
        this.log(`第${this.round}ラウンドが終わりました（${results.map(r => `${this.players[r.seat].name} ${r.score}点`).join('・')}）`);
        if (this.round >= this.options.rounds) {
            this.phase = 'end';
            const best = Math.max(...this.players.map(p => p.total));
            this.winners = this.players.filter(p => p.total === best).map(p => p.id);
            this.emit({ type: 'end', winners: [...this.winners] });
            this.log(this.winners.length > 1 ? '引き分けです' : `${this.players[this.winners[0]].name}の勝ちです`);
            return;
        }
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
