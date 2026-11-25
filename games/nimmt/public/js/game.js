/**
 * ニムト（6 nimmt!）のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（配り方はシードから決まる）
 *
 * ルール
 * - カードは1〜104。牛の頭の数は、ふつう1、5の倍数は2、10の倍数は3、ぞろ目（11・22…）は5、55は7
 * - 2〜10人。ラウンドごとに全部のカードを切り、各自に10枚配り、4枚を4つの列の先頭に置く
 * - 全員が同時に1枚ずつ選んで出し、そろったら公開して、小さい順に列へ置く
 *   - 置くのは、末尾がそのカードより小さい列のうち、末尾との差がいちばん小さい列
 *   - 6枚目になるときは、その列の5枚を引き取り、出したカードが新しい列の先頭になる
 *   - どの列の末尾よりも小さいときは、好きな列を選んで引き取り、出したカードが新しい列の先頭になる
 * - 10回出したらラウンドの終わり。引き取ったカードの牛の頭の数が失点になる
 * - だれかの失点の合計が66点以上になったら終わり。失点のいちばん少ない人が勝ち
 *
 * ルールブックに書かれていないので、次のように決めた
 * - 失点がいちばん少ない人が複数いたら、その全員を勝ちとする
 * - 引き取ったカードの牛の数は、ラウンドの途中でも全員に見せる（アプリでよくある形。実物では伏せて置く）
 */

import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const CARD_COUNT = 104;
export const HAND_SIZE = 10;
export const ROW_COUNT = 4;
export const ROW_LIMIT = 5;      // 列に並べられる枚数。6枚目で引き取る
export const END_SCORE = 66;
const MAX_LOGS = 200;
const MAX_EVENTS = 200;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { play: ['card'], takeRow: ['row'] };

// 牛の頭の数
export function bullsOf(card) {
    if (card === 55) return 7;
    if (card % 11 === 0) return 5;
    if (card % 10 === 0) return 3;
    if (card % 5 === 0) return 2;
    return 1;
}
export const sumBulls = (cards) => cards.reduce((sum, card) => sum + bullsOf(card), 0);

// 置く列（末尾がカードより小さく、差がいちばん小さい列）。どこにも置けなければ -1
export function targetRow(rows, card) {
    let best = -1;
    rows.forEach((row, index) => {
        const last = row.at(-1);
        if (last < card && (best < 0 || last > rows[best].at(-1))) best = index;
    });
    return best;
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: [], taken: [], score: 0
        }));
        this.rows = [];
        this.round = 0;
        this.turn = 0;               // ラウンドの中で何回目に出すか（1〜10）
        this.phase = 'select';       // select：出すカードを選ぶ / chooseRow：引き取る列を選ぶ / end：終わり
        this.selected = this.players.map(() => null); // 選んだカード（公開するまで、ほかの人には見せない）
        this.pending = [];           // 公開して、まだ置いていないカード（小さい順）
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

    // 今操作が必要な人
    actors() {
        if (this.phase === 'select') return this.players.filter(p => this.selected[p.id] === null).map(p => p.id);
        if (this.phase === 'chooseRow') return [this.pending[0].seat];
        return [];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { select: { play: this.play }, chooseRow: { takeRow: this.takeRow } }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = command[key]; });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'play', card }：出すカードを選ぶ。全員がそろったら、公開して置いていく
    play(seat, { card }) {
        if (this.selected[seat] !== null) return this.fail('もう出しています');
        if (!this.players[seat].hand.includes(card)) return this.fail('そのカードは持っていません');
        this.selected[seat] = card;
        this.emit({ type: 'selected', seat });
        if (this.selected.every(c => c !== null)) this.reveal();
        return true;
    }

    // { type: 'takeRow', row }：どの列にも置けないカードを出した人が、引き取る列を選ぶ
    takeRow(seat, { row }) {
        if (seat !== this.pending[0].seat) return this.fail('列を選ぶのはあなたではありません');
        if (!Number.isInteger(row) || row < 0 || row >= ROW_COUNT) return this.fail('列が正しくありません');
        const { card } = this.pending.shift();
        this.take(seat, row, 'low');
        this.rows[row] = [card];
        this.emit({ type: 'place', seat, card, row, rows: this.copyRows() });
        this.placeAll();
        return true;
    }

    // ---- 進行 ----

    deal() {
        this.round++;
        this.turn = 1;
        const deck = shuffle(Array.from({ length: CARD_COUNT }, (_, i) => i + 1), this.random);
        this.players.forEach(p => {
            p.hand = deck.splice(0, HAND_SIZE).sort((a, b) => a - b);
            p.taken = [];
        });
        this.rows = deck.splice(0, ROW_COUNT).map(card => [card]);
        this.selected = this.players.map(() => null);
        this.phase = 'select';
        this.emit({ type: 'deal', round: this.round, rows: this.copyRows(), hands: this.players.map(p => [...p.hand]) });
        this.log(`第${this.round}ラウンド`);
    }

    reveal() {
        const plays = this.players.map(p => ({ seat: p.id, card: this.selected[p.id] })).sort((a, b) => a.card - b.card);
        plays.forEach(({ seat, card }) => {
            const hand = this.players[seat].hand;
            hand.splice(hand.indexOf(card), 1);
        });
        this.pending = plays;
        this.selected = this.players.map(() => null);
        this.emit({ type: 'reveal', plays: plays.map(p => ({ ...p })) });
        this.placeAll();
    }

    // 公開したカードを小さい順に置く。どの列にも置けないカードの番で、その人が列を選ぶまで止まる
    placeAll() {
        while (this.pending.length > 0) {
            const { seat, card } = this.pending[0];
            const row = targetRow(this.rows, card);
            if (row < 0) {
                this.phase = 'chooseRow';
                this.emit({ type: 'chooseRow', seat, card });
                return;
            }
            this.pending.shift();
            if (this.rows[row].length >= ROW_LIMIT) {
                this.take(seat, row, 'sixth');
                this.rows[row] = [card];
            } else {
                this.rows[row].push(card);
            }
            this.emit({ type: 'place', seat, card, row, rows: this.copyRows() });
        }
        this.finishTurn();
    }

    take(seat, row, reason) {
        const cards = this.rows[row];
        const player = this.players[seat];
        player.taken.push(...cards);
        this.rows[row] = [];
        const bulls = sumBulls(cards);
        this.emit({ type: 'take', seat, row, cards: [...cards], bulls, reason });
        this.log(`${player.name}が${cards.length}枚を引き取りました（牛${bulls}）`);
    }

    finishTurn() {
        this.phase = 'select';
        if (this.players[0].hand.length > 0) {
            this.turn++;
            return;
        }
        // ラウンドの終わり：引き取った牛の数を失点に足す
        this.players.forEach(p => { p.score += sumBulls(p.taken); });
        this.emit({ type: 'roundEnd', round: this.round, results: this.players.map(p => ({ seat: p.id, bulls: sumBulls(p.taken), score: p.score })) });
        this.log(`第${this.round}ラウンドが終わりました`);
        if (this.players.some(p => p.score >= END_SCORE)) return this.endGame();
        this.deal();
    }

    endGame() {
        this.phase = 'end';
        const best = Math.min(...this.players.map(p => p.score));
        this.winners = this.players.filter(p => p.score === best).map(p => p.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
    }

    // ---- 道具 ----

    copyRows() {
        return this.rows.map(row => [...row]);
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
