/**
 * おばけポーカーの進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（配り方はシードから決まる）
 *
 * ルール（Drei Magier Spiele のルールブックによる）
 * - 8種×8枚の64枚を、全部伏せて配る。割り切れなくてよい
 * - 親は手札から1枚を伏せて好きな人に渡し、「これは○○」と種類の名前を言う（本当でも嘘でもよい）
 * - 受けた人は、次のどちらか
 *   1. 受ける：「本当」か「うそ」と答えて表にする。当たれば渡した人が、外れれば受けた人が、そのカードを自分の前に表で置く
 *   2. 回す：こっそり見てから、まだ見ていない人に伏せて渡し、同じ種類か別の種類を言う。全員が見たカードは、受けるしかない
 * - カードを置いた人が、次の親になる
 * - 同じ種類が4枚たまった人、または親なのに手札がない人の負け（ほかの全員の勝ち）
 * - 2人のとき：最初に10枚を伏せたまま除く。回すことはできない。同じ種類が5枚で負け
 *
 * ルールブックに書かれていない点は、次のように決めた（README にも書く）
 * - 最初の親はシードから決める。配るのは親から順に1枚ずつ（割り切れない分は、親から順に1枚多い）
 * - 親が渡す相手は、自分以外のだれでもよい（手札がない人にも渡せる）
 * - 回すときの「まだ見ていない人」に、最初に渡した親は入らない（親はカードを見ている）
 */

import { createRandom, shuffle } from './random.js';
import { KINDS, KIND_ORDER, COPIES, REMOVED_FOR_TWO, LIMIT, LIMIT_FOR_TWO } from './kinds.js';

export { KINDS, KIND_ORDER };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const MAX_LOGS = 400;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    give: ['card', 'target', 'claim'], answer: ['truth'], peek: [], pass: ['target', 'claim']
};

const isKind = (kind) => typeof kind === 'string' && Object.hasOwn(KINDS, kind);

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜6人です');
        const n = players.length;
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * n);
        // CPU の迷いに使う値（ビューには入れない。ゲームの乱数とは別に、CPU が自分で乱数を作るため）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        const deck = shuffle(KIND_ORDER.flatMap(k => Array(COPIES).fill(k)), this.random);
        this.removed = n === 2 ? deck.splice(0, REMOVED_FOR_TWO) : [];
        this.limit = n === 2 ? LIMIT_FOR_TWO : LIMIT;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            hand: [], table: []
        }));
        deck.forEach((card, i) => this.players[(this.options.startPlayer + i) % n].hand.push(card));
        this.players.forEach(p => this.sortHand(p));
        this.current = this.options.startPlayer; // 親
        this.roundNumber = 1;
        this.phase = 'give';  // give：親が渡す / respond：受けた人が答えるか回すかを選ぶ / pass：見た人が回す / end
        this.round = null;    // { card, starter, from, to, claim, seen, chain: [{ from, to, claim }] }
        this.history = [];    // 終わった回（表になったので全員に見せてよい）{ card, chain, answerer, said, correct, taker }
        this.loser = null;
        this.reason = null;   // 'set'：同じ種類がたまった / 'empty'：親なのに手札がない
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}が親で始めます`);
    }

    sortHand(p) {
        p.hand.sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人
    actors() {
        switch (this.phase) {
            case 'give': return [this.current];
            case 'respond': case 'pass': return [this.round.to];
            default: return [];
        }
    }

    // 今のカードを回せる相手（まだ見ていない人）
    passTargets() {
        if (!this.round) return [];
        return this.players.map(p => p.id).filter(id => id !== this.round.to && !this.round.seen.includes(id));
    }

    tableCount(seat, kind) {
        return this.players[seat].table.filter(k => k === kind).length;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            give: { give: this.give },
            respond: { answer: this.answer, peek: this.peek },
            pass: { pass: this.pass }
        }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        const done = handler.call(this, playerId, command);
        if (!done) return false;
        // 記録するのは決まった項目だけ（端末から余計な項目が届いても残さない）
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 親が渡す ----

    give(seat, { card, target, claim }) {
        const p = this.players[seat];
        if (!isKind(card) || !p.hand.includes(card)) return this.fail('そのカードは持っていません');
        if (!Number.isInteger(target) || target === seat || !this.players[target]) return this.fail('その人には渡せません');
        if (!isKind(claim)) return this.fail('種類を選んでください');
        p.hand.splice(p.hand.indexOf(card), 1);
        this.round = { card, starter: seat, from: seat, to: target, claim, seen: [seat], chain: [{ from: seat, to: target, claim }] };
        this.phase = 'respond';
        this.emit({ type: 'give', seat, target, claim, card, visibleTo: [seat] });
        this.log(`${p.name}→${this.players[target].name}「${KINDS[claim].name}」`);
        return true;
    }

    // ---- 受けた人 ----

    answer(seat, { truth }) {
        if (typeof truth !== 'boolean') return this.fail('「本当」か「うそ」で答えてください');
        const r = this.round;
        const actual = r.card === r.claim;
        const correct = truth === actual;
        const taker = correct ? r.from : seat;
        const p = this.players[seat];
        this.log(`${p.name}「${truth ? '本当' : 'うそ'}」→ ${KINDS[r.card].name}でした`);
        this.players[taker].table.push(r.card);
        this.history.push({ card: r.card, chain: r.chain.map(c => ({ ...c })), answerer: seat, said: truth, correct, taker });
        this.emit({ type: 'reveal', seat, said: truth, card: r.card, claim: r.claim, from: r.from, correct, taker });
        this.log(`${this.players[taker].name}が${KINDS[r.card].name}を引き取りました`);
        this.round = null;
        if (this.tableCount(taker, r.card) >= this.limit) return this.finish(taker, 'set');
        this.current = taker;
        if (!this.players[taker].hand.length) return this.finish(taker, 'empty');
        this.roundNumber += 1;
        this.phase = 'give';
        this.emit({ type: 'turn', seat: taker });
        return true;
    }

    peek(seat) {
        if (!this.passTargets().length) return this.fail('もう全員が見たカードです。答えてください');
        const r = this.round;
        r.seen.push(seat);
        this.phase = 'pass';
        this.emit({ type: 'peek', seat, card: r.card, visibleTo: [...r.seen] });
        this.log(`${this.players[seat].name}がカードを見ました`);
        return true;
    }

    pass(seat, { target, claim }) {
        if (!this.passTargets().includes(target)) return this.fail('その人には回せません');
        if (!isKind(claim)) return this.fail('種類を選んでください');
        const r = this.round;
        r.from = seat;
        r.to = target;
        r.claim = claim;
        r.chain.push({ from: seat, to: target, claim });
        this.phase = 'respond';
        this.emit({ type: 'pass', seat, target, claim, card: r.card, visibleTo: [...r.seen] });
        this.log(`${this.players[seat].name}→${this.players[target].name}「${KINDS[claim].name}」`);
        return true;
    }

    finish(seat, reason) {
        this.loser = seat;
        this.reason = reason;
        this.phase = 'end';
        this.round = null;
        this.emit({ type: 'end', seat, reason });
        const name = this.players[seat].name;
        this.log(reason === 'set' ? `${name}の前に同じ種類が${this.limit}枚。${name}の負け` : `${name}は手札がなく、渡せません。${name}の負け`);
        return true;
    }

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
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
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
