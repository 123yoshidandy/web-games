/**
 * 花火のルールと状態（DOM に依存しない）
 *
 * 操作はすべて applyCommand(seat, command) に通す。受け付けたら true、断ったら false と lastError。
 * 受け付けた操作だけを commands に記録し、Game.replay で同じ状態を作り直せる。
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）。
 *
 * 操作：
 *   { type: 'clue', target, kind: 'color' | 'rank', value }   ヒントを出す（色は 0〜4、数字は 1〜5）
 *   { type: 'play', order }                                  手札の札を出す
 *   { type: 'discard', order }                               手札の札を捨てる
 *
 * 札は「配られた順の番号」（order）で区別する。ビューで自分の札の中身が分からないようにするため。
 * 手札は、新しく引いた札を右（配列の後ろ）に足す
 */

import { createRandom, createSeed, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const COLORS = ['red', 'yellow', 'green', 'blue', 'white'];
export const COLOR_NAMES = ['赤', '黄', '緑', '青', '白'];
export const RANKS = [1, 2, 3, 4, 5];
export const COPIES = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 };
export const MAX_CLUES = 8;
export const MAX_MISTAKES = 3;
export const handSizeFor = players => (players <= 3 ? 5 : 4);

const ALL = 0b11111;
export const colorBit = color => 1 << color;
export const rankBit = rank => 1 << (rank - 1);
export const bitsToColors = bits => [0, 1, 2, 3, 4].filter(c => bits & colorBit(c));
export const bitsToRanks = bits => RANKS.filter(r => bits & rankBit(r));
export const touches = (card, kind, value) => (kind === 'color' ? card.color === value : card.rank === value);
export const clueText = (kind, value) => (kind === 'color' ? COLOR_NAMES[value] : String(value));

export default class Game {
    // players: [{ name, isCPU }] / options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜5人です');
        this.seed = (options.seed ?? createSeed()) >>> 0;
        this.random = createRandom(this.seed);
        this.players = players.map((player, seat) => ({ seat, name: player.name, isCPU: !!player.isCPU }));
        const deck = [];
        for (let color = 0; color < COLORS.length; color++) {
            for (const rank of RANKS) {
                for (let i = 0; i < COPIES[rank]; i++) deck.push({ color, rank });
            }
        }
        this.deck = shuffle(deck, this.random);
        this.cards = [];      // order → { order, color, rank }
        this.knowledge = [];  // order → { colors, ranks, clued }（その札を持つ人が、ヒントで分かっていること）
        this.hands = this.players.map(() => []);
        this.handSize = handSizeFor(players.length);
        for (let i = 0; i < this.handSize; i++) {
            for (const player of this.players) this.draw(player.seat);
        }
        this.fireworks = [0, 0, 0, 0, 0];
        this.discards = [];   // 捨てた札と、出して失敗した札の order
        this.clues = MAX_CLUES;
        this.mistakes = 0;
        this.current = Math.floor(this.random() * players.length);
        this.turn = 0;
        this.turnsLeft = null; // 山札が尽きたあとに残る手番の数
        this.phase = 'play';   // 'play' / 'end'
        this.endReason = null; // 'mistakes' / 'perfect' / 'deck'
        this.clueLog = [];     // 出されたヒントの記録
        this.commands = [];
        this.logs = [];
        this.lastError = null;
        this.lastMove = null;
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません: ${game.lastError}`);
        }
        return game;
    }

    get isOver() {
        return this.phase === 'end';
    }

    // 得点：各色の一番大きな数字の合計。ミスが3回になったら花火が爆発して全員の負け（0点）
    get score() {
        if (this.mistakes >= MAX_MISTAKES) return 0;
        return this.fireworks.reduce((sum, n) => sum + n, 0);
    }

    draw(seat) {
        const card = this.deck.pop();
        if (!card) return null;
        const order = this.cards.length;
        this.cards.push({ order, ...card });
        this.knowledge.push({ colors: ALL, ranks: ALL, clued: false });
        this.hands[seat].push(order);
        return order;
    }

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (seat !== this.current) return this.fail('あなたの番ではありません');
        if (command.type === 'clue') return this.clue(seat, command);
        if (command.type === 'play' || command.type === 'discard') return this.useCard(seat, command);
        return this.fail('今はその操作はできません');
    }

    // ヒントで指される札（target の手札のうち、その色か数字の札すべて）
    clueTouches(target, kind, value) {
        return this.hands[target].filter(order => touches(this.cards[order], kind, value));
    }

    clue(seat, { target, kind, value }) {
        if (!Number.isInteger(target) || target < 0 || target >= this.players.length || target === seat) {
            return this.fail('ヒントを出す相手が正しくありません');
        }
        if (kind === 'color' ? !(Number.isInteger(value) && value >= 0 && value < 5) : !(kind === 'rank' && RANKS.includes(value))) {
            return this.fail('ヒントの内容が正しくありません');
        }
        if (this.clues <= 0) return this.fail('ヒントが残っていません');
        const touched = this.clueTouches(target, kind, value);
        if (touched.length === 0) return this.fail('その色・数字の札はありません');

        const newly = touched.filter(order => !this.knowledge[order].clued);
        for (const order of this.hands[target]) {
            const k = this.knowledge[order];
            const hit = touched.includes(order);
            if (kind === 'color') k.colors = hit ? colorBit(value) : k.colors & ~colorBit(value);
            else k.ranks = hit ? rankBit(value) : k.ranks & ~rankBit(value);
            if (hit) k.clued = true;
        }
        this.clues--;
        this.clueLog.push({ turn: this.turn, giver: seat, target, kind, value, touched, newly, fireworks: [...this.fireworks] });
        this.lastMove = { type: 'clue', seat, target, kind, value, touched };
        this.record(seat, { type: 'clue', target, kind, value },
            `${this.players[seat].name} → ${this.players[target].name}：「${clueText(kind, value)}」`);
        this.endTurn();
        return true;
    }

    useCard(seat, { type, order }) {
        const hand = this.hands[seat];
        const index = hand.indexOf(order);
        if (!Number.isInteger(order) || index < 0) return this.fail('その札は手札にありません');
        if (type === 'discard' && this.clues >= MAX_CLUES) return this.fail('ヒントが8つあるときは捨てられません');

        const card = this.cards[order];
        hand.splice(index, 1);
        let success = null;
        if (type === 'play') {
            success = this.fireworks[card.color] === card.rank - 1;
            if (success) {
                this.fireworks[card.color] = card.rank;
                if (card.rank === 5 && this.clues < MAX_CLUES) this.clues++;
            } else {
                this.mistakes++;
                this.discards.push(order);
            }
        } else {
            this.discards.push(order);
            this.clues++;
        }
        const drawn = this.draw(seat);
        const name = `${COLOR_NAMES[card.color]}${card.rank}`;
        const log = type === 'discard' ? `${this.players[seat].name}：${name}を捨てた`
            : success ? `${this.players[seat].name}：${name}を出した` : `${this.players[seat].name}：${name}を出して失敗`;
        this.lastMove = { type, seat, order, color: card.color, rank: card.rank, success, drawn };
        this.record(seat, { type, order }, log);
        // 山札の最後の1枚を引いたら、引いた人を含めて全員があと1回ずつ
        if (drawn !== null && this.deck.length === 0) this.turnsLeft = this.players.length + 1;
        this.endTurn();
        return true;
    }

    endTurn() {
        this.turn++;
        if (this.mistakes >= MAX_MISTAKES) return this.finish('mistakes');
        if (this.score === 25) return this.finish('perfect');
        if (this.turnsLeft !== null) {
            this.turnsLeft--;
            if (this.turnsLeft === 0) return this.finish('deck');
        }
        this.current = (this.current + 1) % this.players.length;
    }

    finish(reason) {
        this.phase = 'end';
        this.endReason = reason;
        this.logs.push(`ゲーム終了：${this.score}点`);
    }

    record(seat, command, log) {
        this.commands.push({ seat, command });
        this.logs.push(log);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }
}
