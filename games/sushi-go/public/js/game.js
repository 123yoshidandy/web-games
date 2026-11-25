/**
 * スシゴー！の進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びはシードから決まる）
 *
 * ルール
 * - 108枚を切り、2人10枚・3人9枚・4人8枚・5人7枚を配る。3ラウンド
 * - 全員が同時に手札から1枚を選んで伏せ、全員がそろったら表にする。残りの手札を左（次の席）の人へ渡す
 * - わさびがあれば、次に取ったにぎりは必ずわさびに載せる（3倍）。わさび1枚に、にぎりは1枚まで
 * - 箸が前にあれば、あとの番に手札から2枚を取れる。使った箸は手札に戻し、ほかの人へ渡る。1回に使える箸は1つ
 * - 最後の1枚は、そのまま自分の前に置く
 * - ラウンドの終わりに得点を数え、プリン以外を捨てる。プリンは最後まで残し、ゲームの終わりに数える
 * - 3ラウンドのあと、合計点の多い人の勝ち。同点ならプリンの多い人
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 巻き寿司が0の人は、2位にもならない（全員が0なら、だれも点を取らない）
 * - 箸で2枚を取るときは、選んだ順に置く（わさび → にぎりの順なら、そのにぎりはわさびに載る）
 * - 選んだ札は、全員がそろうまで変えられない
 * - 合計点もプリンも同じなら、同点の全員が勝ち
 * - 2人の変種（ダミーの3人目）と、渡す向きを入れ替える変種は入れていない
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, CARD_ORDER, HAND_SIZE, ROUNDS, isNigiri } from './cards.js';
import { scoreRound, puddingScores, countOf } from './scoring.js';

export { CARDS, CARD_ORDER };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const MAX_LOGS = 300;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { pick: ['card', 'second'] };

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜5人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed };
        this.deck = shuffle(CARD_ORDER.flatMap(type => Array(CARDS[type].count).fill(type)), this.random);
        this.discards = [];         // ラウンドの終わりに捨てた札（プリン以外）
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            hand: [], tableau: [], picked: null, puddings: 0, score: 0, rounds: []
        }));
        this.handSize = HAND_SIZE[players.length];
        this.round = 0;
        this.turn = 0;              // ラウンドの中の何枚目か
        this.phase = 'pick';        // pick：選ぶ / end：終わり
        this.roundResult = null;    // 直前のラウンドの得点
        this.puddingResult = null;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    isOver() {
        return this.phase === 'end';
    }

    // 選ぶのを待っている人
    actors() {
        return this.phase === 'pick' ? this.players.filter(p => !p.picked).map(p => p.id) : [];
    }

    startRound() {
        this.round += 1;
        this.turn = 1;
        this.players.forEach(p => {
            p.hand = this.deck.splice(0, this.handSize);
            p.tableau = [];
            p.picked = null;
        });
        this.emit({ type: 'round', round: this.round });
        this.log(`ラウンド${this.round}`);
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('もう選んでいます');
        if (!command || typeof command !== 'object' || command.type !== 'pick') return this.fail('今はその操作はできません');
        if (!this.pick(playerId, command)) return false;
        const recorded = { type: 'pick', card: command.card };
        if (command.second !== undefined && command.second !== null) recorded.second = command.second;
        this.commands.push({ playerId, command: recorded });
        this.afterPick();
        return true;
    }

    // 箸を使えるか（前に箸があり、手札が2枚以上）
    canUseChopsticks(seat) {
        const p = this.players[seat];
        return countOf(p.tableau, 'chopsticks') > 0 && p.hand.length >= 2;
    }

    pick(seat, { card, second }) {
        const p = this.players[seat];
        if (typeof card !== 'string' || !p.hand.includes(card)) return this.fail('その札は手札にありません');
        const cards = [card];
        if (second !== undefined && second !== null) {
            if (!this.canUseChopsticks(seat)) return this.fail('箸は使えません');
            const rest = [...p.hand];
            rest.splice(rest.indexOf(card), 1);
            if (typeof second !== 'string' || !rest.includes(second)) return this.fail('2枚目の札は手札にありません');
            cards.push(second);
        }
        p.picked = cards;
        return true;
    }

    // 全員がそろったら表にして、手札を渡す
    afterPick() {
        if (this.actors().length) return;
        this.reveal();
        if (this.players[0].hand.length === 1) {
            // 最後の1枚は、そのまま自分の前に置く
            this.players.forEach(p => { p.picked = [p.hand[0]]; });
            this.reveal();
        }
        if (this.players[0].hand.length === 0) this.endRound();
    }

    reveal() {
        const n = this.players.length;
        const shown = this.players.map(p => [...p.picked]);
        this.players.forEach(p => {
            const used = p.picked.length === 2;
            p.picked.forEach(card => {
                p.hand.splice(p.hand.indexOf(card), 1);
                this.place(p, card);
            });
            if (used) {
                // 使った箸は手札に戻す
                const i = p.tableau.findIndex(c => c.type === 'chopsticks');
                p.tableau.splice(i, 1);
                p.hand.push('chopsticks');
            }
            p.picked = null;
        });
        this.emit({ type: 'reveal', round: this.round, turn: this.turn, cards: shown });
        this.log(this.players.map((p, i) => `${p.name}：${shown[i].map(c => CARDS[c].name).join('と')}`).join('　'));
        // 左（次の席）の人へ渡す
        const hands = this.players.map(p => p.hand);
        this.players.forEach((p, i) => { p.hand = hands[(i - 1 + n) % n]; });
        this.turn += 1;
    }

    // にぎりは、空いているわさびがあれば載せる
    place(p, card) {
        if (isNigiri(card)) {
            const wasabi = p.tableau.find(c => c.type === 'wasabi' && !c.nigiri);
            if (wasabi) {
                wasabi.nigiri = card;
                return;
            }
        }
        p.tableau.push(card === 'wasabi' ? { type: 'wasabi', nigiri: null } : { type: card });
    }

    endRound() {
        const scores = scoreRound(this.players.map(p => p.tableau));
        this.players.forEach((p, i) => {
            p.score += scores[i].total;
            p.rounds.push(scores[i].total);
            p.puddings += countOf(p.tableau, 'pudding');
            p.tableau.forEach(c => {
                if (c.type !== 'pudding') this.discards.push(c.type);
                if (c.nigiri) this.discards.push(c.nigiri);
            });
        });
        this.roundResult = {
            round: this.round,
            scores,
            tableaus: this.players.map(p => p.tableau.map(c => ({ ...c })))
        };
        this.emit({ type: 'roundEnd', round: this.round, scores: scores.map(s => s.total) });
        this.log(`ラウンド${this.round}の得点：${this.players.map((p, i) => `${p.name} ${scores[i].total}`).join('・')}`);
        if (this.round < ROUNDS) {
            this.startRound();
            return;
        }
        // プリン
        const pudding = puddingScores(this.players.map(p => p.puddings));
        this.players.forEach((p, i) => { p.score += pudding[i]; });
        this.puddingResult = pudding;
        const best = Math.max(...this.players.map(p => p.score));
        const top = this.players.filter(p => p.score === best);
        const mostPudding = Math.max(...top.map(p => p.puddings));
        this.winners = top.filter(p => p.puddings === mostPudding).map(p => p.id);
        this.phase = 'end';
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`プリン：${this.players.map((p, i) => `${p.name} ${pudding[i] >= 0 ? '+' : ''}${pudding[i]}`).join('・')}`);
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ち`);
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
