/**
 * ノー・サンキュー（No Thanks!）のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びと最初の手番はシードから決まる）
 *
 * ルール（Amigo の公式ルール）
 * - 3〜7人。カードは3〜35の33枚。切って9枚を見ずに除き、残り24枚を山札にする
 * - チップは、3〜5人なら11枚、6人なら9枚、7人なら7枚ずつ。持っているチップの数は、ほかの人には伏せる
 * - 山札の一番上をめくる。手番の人は、次のどちらかを選ぶ
 *   - いらない：チップを1枚カードの上に置き、左隣（席の順で次）の人の手番になる
 *   - 取る：カードと、その上のチップを全部もらう。次のカードをめくり、同じ人がまた選ぶ
 * - チップがないときは、取るしかない
 * - 最後のカードが取られたら終わり。カードの数の合計が失点。ただし連続した数は、その中で一番小さい数だけを数える
 *   残ったチップは1枚1点として失点から引く。失点が一番少ない人の勝ち。同点なら、その全員で勝ちを分け合う
 *
 * 公式ルールにないので、次のように決めた
 * - 最初の手番（ルールでは「最後に No thanks! と言った人」）は、シードからランダムに決める
 */

import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;
export const LOWEST = 3;
export const HIGHEST = 35;
export const REMOVED_COUNT = 9;
export const DECK_COUNT = HIGHEST - LOWEST + 1 - REMOVED_COUNT; // 24
const MAX_LOGS = 200;
const MAX_EVENTS = 200;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { pass: [], take: [] };

// 人数ごとのチップの数
export const chipsFor = (count) => (count <= 5 ? 11 : count === 6 ? 9 : 7);

// 連続した数のまとまり（小さい順）。例：[3, 13, 14, 15, 25] → [[3], [13, 14, 15], [25]]
export function runsOf(cards) {
    const sorted = [...cards].sort((a, b) => a - b);
    const runs = [];
    sorted.forEach(card => {
        const last = runs.at(-1);
        if (last && last.at(-1) === card - 1) last.push(card);
        else runs.push([card]);
    });
    return runs;
}

// カードの失点（連続した数は一番小さい数だけを数える）
export const cardPoints = (cards) => runsOf(cards).reduce((sum, run) => sum + run[0], 0);

// 得点（失点）＝カードの失点 − チップの数。少ないほどよい
export const scoreOf = (cards, chips) => cardPoints(cards) - chips;

// そのカードを取ったときに、カードの失点がいくつ増えるか（つながると小さくなる。すき間を埋めると減ることもある）
export const addedPoints = (cards, card) => cardPoints([...cards, card]) - cardPoints(cards);

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        const chips = chipsFor(players.length);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            cards: [], chips
        }));
        const all = shuffle(Array.from({ length: HIGHEST - LOWEST + 1 }, (_, i) => LOWEST + i), this.random);
        this.removed = all.splice(0, REMOVED_COUNT).sort((a, b) => a - b); // 見ずに除いたカード（終わるまでだれにも見せない）
        this.deck = all;             // 山札（末尾が一番上）
        this.current = null;         // めくってあるカード
        this.pot = 0;                // めくってあるカードの上のチップ
        this.turn = Math.floor(this.random() * players.length);
        this.phase = 'play';         // play：手番の人が選ぶ / end：終わり
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.turn].name}から始めます`);
        this.reveal();
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作が必要な人
    actors() {
        return this.phase === 'play' ? [this.turn] : [];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { pass: this.pass, take: this.take }[command.type];
        if (!handler || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (playerId !== this.turn) return this.fail('あなたの番ではありません');
        if (!handler.call(this, playerId)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = command[key]; });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'pass' }：チップを1枚置いて、次の人の番にする
    pass(seat) {
        const player = this.players[seat];
        if (player.chips <= 0) return this.fail('チップがないので、取るしかありません');
        player.chips--;
        this.pot++;
        this.turn = (seat + 1) % this.players.length;
        this.emit({ type: 'pass', seat, card: this.current, pot: this.pot });
        return true;
    }

    // { type: 'take' }：カードとチップを取る。次のカードをめくり、同じ人がまた選ぶ
    take(seat) {
        const player = this.players[seat];
        const card = this.current;
        const chips = this.pot;
        player.cards.push(card);
        player.cards.sort((a, b) => a - b);
        player.chips += chips;
        this.pot = 0;
        this.current = null;
        this.emit({ type: 'take', seat, card, chips });
        this.log(chips > 0 ? `${player.name}が${card}とチップ${chips}枚を取りました` : `${player.name}が${card}を取りました`);
        if (this.deck.length === 0) this.endGame();
        else this.reveal();
        return true;
    }

    // ---- 進行 ----

    reveal() {
        this.current = this.deck.pop();
        this.emit({ type: 'reveal', card: this.current, left: this.deck.length, seat: this.turn });
    }

    // 最後の結果（全員のチップを公開する）
    results() {
        return this.players.map(p => ({
            seat: p.id, cards: [...p.cards], cardPoints: cardPoints(p.cards), chips: p.chips, score: scoreOf(p.cards, p.chips)
        }));
    }

    endGame() {
        this.phase = 'end';
        const results = this.results();
        const best = Math.min(...results.map(r => r.score));
        this.winners = results.filter(r => r.score === best).map(r => r.seat);
        this.emit({ type: 'end', winners: [...this.winners], results, removed: [...this.removed] });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
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
