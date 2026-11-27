/**
 * ザ・ゲーム（The Game）のルールと状態（DOM に依存しない。ブラウザ・サーバー・テストで同じものを使う）
 *
 * 2〜99 の98枚を、全員で協力して4つの山に出し切る
 * - 上りの山2つ（1から始まる）には、一番上より大きいカードを出す。下りの山2つ（100から始まる）には、小さいカードを出す
 * - ちょうど10戻すカード（上りの山に「一番上 − 10」、下りの山に「一番上 + 10」）は、逆向きでも出せる
 * - 自分の番には2枚以上（山札が空になったら1枚以上）出し、番を終えたら手札の上限まで引く
 * - 番の人が決まった枚数を出せなくなったら終わり。残ったカード（山札と全員の手札）が少ないほどよい。0枚なら勝ち
 * - 数字は伝えられない。代わりに、山ごとに「出さないで」「大事なカードがある」の合図を置ける
 *
 * 操作はすべて applyCommand(seat, command) を通し、受け付けた操作だけを記録する（Game.replay で再現できる）
 * 断る操作は状態を変えない
 */

import { createRandom, shuffle } from './random.js';

export const LOWEST = 2;
export const HIGHEST = 99;
export const CARD_COUNT = HIGHEST - LOWEST + 1;
export const BACK_STEP = 10;
export const EXCELLENT = 10; // 残りがこの枚数以下なら「すばらしい」
export const PILES = [
    { dir: 'up', start: 1 }, { dir: 'up', start: 1 },
    { dir: 'down', start: 100 }, { dir: 'down', start: 100 }
];
export const PILE_NAMES = ['上り①', '上り②', '下り①', '下り②'];
export const MARKS = ['stop', 'good'];
export const MARK_NAMES = { stop: '出さないで', good: '大事なカードがある' };

// 人数ごとの手札の枚数
export const handSizeFor = count => (count === 1 ? 8 : count === 2 ? 7 : 6);

// その山にそのカードを出せるか
export function canPlace(pile, card) {
    if (pile.dir === 'up') return card > pile.top || card === pile.top - BACK_STEP;
    return card < pile.top || card === pile.top + BACK_STEP;
}

// 山の一番上からどれだけ進むか（10戻すときは -10）
export function jumpOf(pile, card) {
    return pile.dir === 'up' ? card - pile.top : pile.top - card;
}

export default class Game {
    // players: [{ name, isCPU, level }]、options: { seed }
    constructor(players, options = {}) {
        if (!Array.isArray(players) || players.length < 1 || players.length > 5) throw new Error('人数は1〜5人です');
        this.seed = options.seed >>> 0;
        this.players = players.map((p, seat) => ({ seat, name: String(p.name ?? `P${seat + 1}`), isCPU: !!p.isCPU, level: p.level ?? 'normal' }));
        this.handSize = handSizeFor(players.length);
        const random = createRandom(this.seed);
        const cards = Array.from({ length: CARD_COUNT }, (_, i) => LOWEST + i);
        this.deck = shuffle(cards, random); // 末尾から引く
        this.hands = this.players.map(() => []);
        for (let n = 0; n < this.handSize; n++) this.players.forEach((_, seat) => this.hands[seat].push(this.deck.pop()));
        this.hands.forEach(hand => hand.sort((a, b) => a - b));
        this.piles = PILES.map(p => ({ dir: p.dir, top: p.start, count: 0 }));
        this.signals = this.players.map(() => PILES.map(() => null));
        this.current = 0;
        this.played = 0;      // 今の番に出した枚数
        this.turn = 1;        // 何番目の番か
        this.backs = 0;       // 10戻した回数
        this.phase = 'play';
        this.result = null;
        this.commands = [];
        this.logs = [];
        this.lastMove = null;
        this.lastError = null;
        this.log(`${this.players[0].name}の番から始めます`);
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    get isOver() {
        return this.phase === 'end';
    }

    // 今の番に出さなければならない枚数（山札が空なら1枚）
    get required() {
        return this.deck.length > 0 ? 2 : 1;
    }

    get canEnd() {
        return !this.isOver && this.played >= this.required;
    }

    // 残ったカード（山札と全員の手札）
    get remaining() {
        return this.deck.length + this.hands.reduce((sum, hand) => sum + hand.length, 0);
    }

    // その席が今出せる手 [{ card, pile }]
    legalPlays(seat) {
        if (this.isOver || seat !== this.current) return [];
        const plays = [];
        for (const card of this.hands[seat]) {
            this.piles.forEach((pile, index) => {
                if (canPlace(pile, card)) plays.push({ card, pile: index });
            });
        }
        return plays;
    }

    log(text) {
        this.logs.push(text);
    }

    reject(message) {
        this.lastError = message;
        return false;
    }

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object') return this.reject('操作の形が違います');
        if (!Number.isInteger(seat) || !this.players[seat]) return this.reject('席がありません');
        if (this.isOver) return this.reject('ゲームは終わっています');
        let ok = false;
        if (command.type === 'play') ok = this.play(seat, command);
        else if (command.type === 'end') ok = this.endTurn(seat);
        else if (command.type === 'signal') ok = this.signal(seat, command);
        else return this.reject('知らない操作です');
        if (!ok) return false;
        this.commands.push({ seat, command: structuredClone(command) });
        return true;
    }

    play(seat, { card, pile }) {
        if (seat !== this.current) return this.reject('あなたの番ではありません');
        if (!Number.isInteger(pile) || !this.piles[pile]) return this.reject('山がありません');
        const hand = this.hands[seat];
        if (!hand.includes(card)) return this.reject('そのカードは手札にありません');
        const target = this.piles[pile];
        if (!canPlace(target, card)) return this.reject(`${PILE_NAMES[pile]}には出せません`);
        // ここから状態を変える
        const back = jumpOf(target, card) === -BACK_STEP;
        hand.splice(hand.indexOf(card), 1);
        target.top = card;
        target.count++;
        this.played++;
        if (back) this.backs++;
        this.lastMove = { type: 'play', seat, card, pile, back, turn: this.turn };
        this.log(`${this.players[seat].name}：${card} を${PILE_NAMES[pile]}へ${back ? '（10戻し）' : ''}`);
        this.checkState();
        return true;
    }

    endTurn(seat) {
        if (seat !== this.current) return this.reject('あなたの番ではありません');
        if (this.played < this.required) return this.reject(`あと${this.required - this.played}枚出してください`);
        const hand = this.hands[seat];
        let drawn = 0;
        while (this.deck.length > 0 && hand.length < this.handSize) {
            hand.push(this.deck.pop());
            drawn++;
        }
        hand.sort((a, b) => a - b);
        this.lastMove = { type: 'end', seat, played: this.played, drawn, turn: this.turn };
        this.log(`${this.players[seat].name}：${this.played}枚出して番を終える${drawn ? `（${drawn}枚引く）` : ''}`);
        this.nextTurn();
        return true;
    }

    signal(seat, { pile, mark }) {
        if (!Number.isInteger(pile) || !this.piles[pile]) return this.reject('山がありません');
        const value = mark ?? null;
        if (value !== null && !MARKS.includes(value)) return this.reject('知らない合図です');
        if (this.signals[seat][pile] === value) return this.reject('合図は変わりません');
        this.signals[seat][pile] = value;
        this.lastMove = { type: 'signal', seat, pile, mark: value, turn: this.turn };
        const name = this.players[seat].name;
        this.log(value ? `${name}：${PILE_NAMES[pile]}に「${MARK_NAMES[value]}」` : `${name}：${PILE_NAMES[pile]}の合図を外す`);
        return true;
    }

    // 次の人へ（手札のない人は飛ばす）
    nextTurn() {
        this.played = 0;
        this.turn++;
        for (let i = 1; i <= this.players.length; i++) {
            const seat = (this.current + i) % this.players.length;
            if (this.hands[seat].length > 0) {
                this.current = seat;
                break;
            }
        }
        this.checkState();
    }

    // 出し切ったか、番の人が決まった枚数を出せなくなったかを確かめる
    checkState() {
        if (this.remaining === 0) return this.finish();
        if (this.played < this.required && this.legalPlays(this.current).length === 0) return this.finish();
    }

    finish() {
        const remaining = this.remaining;
        this.phase = 'end';
        this.result = { win: remaining === 0, remaining, excellent: remaining <= EXCELLENT, played: CARD_COUNT - remaining, turns: this.turn };
        this.log(remaining === 0 ? '98枚すべてを出し切りました' : `${this.players[this.current].name}が出せなくなりました。残り${remaining}枚`);
    }
}
