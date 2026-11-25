/**
 * センチュリー：スパイスロード（基本ゲーム）の進行（2〜5人）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びと手番の順はシードから決まる）
 *
 * ルール
 * - 準備：商人カードを6枚、得点カードを5枚並べる。左端の得点カードの上に金貨を人数×2枚、2番目の上に銀貨を人数×2枚置く
 *   各自の手札は「黄2個を得る」「格上げ2回」。手番の順に香辛料（黄3／黄4／黄4／黄3赤1／黄3赤1）をもらう
 * - 手番には、次のどれか1つを行う
 *   - 出す：手札の商人カードを1枚使い、使用済みにする
 *     香辛料：描かれた香辛料を得る／格上げ：香辛料を1段ずつ、描かれた回数まで格上げする（同じ香辛料を続けて上げてよい）
 *     交換：描かれた交換を、香辛料がある限り何回でも続けて行う
 *   - 取る：商人カードを1枚取る。それより左のカードに香辛料を1個ずつ置いていく。取ったカードの上の香辛料ももらう
 *   - 休む：使用済みのカードを全部手札に戻す
 *   - 得点カードを買う：描かれた香辛料を払う。左端なら金貨、2番目なら銀貨ももらう（金貨が尽きたら、銀貨が左端へ移る）
 * - キャラバン（香辛料）は10個まで。手番の終わりに超えていたら、選んで戻す
 * - だれかが得点カードを（2〜3人は6枚、4〜5人は5枚）取ったら、その巡の終わりで終わる
 * - 得点：得点カードの点＋金貨3点・銀貨1点＋黄以外の香辛料1個1点。同点なら、手番の順が後の人の勝ち
 */

import { createRandom, shuffle } from './random.js';
import { SPICES, SPICE_NAMES, MERCHANTS, STARTING_IDS, DECK_IDS, POINT_CARDS, STARTING_SPICES } from './cards.js';

export { SPICES, SPICE_NAMES, MERCHANTS, POINT_CARDS };
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const MARKET_SIZE = 6;
export const POINT_ROW_SIZE = 5;
export const CARAVAN_LIMIT = 10;
export const GOLD_POINTS = 3;
export const SILVER_POINTS = 1;
export const endCount = (players) => (players <= 3 ? 6 : 5);
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { play: ['card', 'times', 'steps'], acquire: ['index', 'pay'], rest: [], claim: ['index'], discard: ['spices'] };
const MAX_LOGS = 300;
const MAX_EVENTS = 120;

export const total = (spices) => spices.reduce((s, n) => s + n, 0);
export const spiceText = (spices) => spices.map((n, i) => SPICE_NAMES[i].repeat(n)).join('') || 'なし';
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const canPay = (have, cost) => cost.every((n, i) => have[i] >= n);

// 格上げの手順（格上げする香辛料の色を順に並べたもの）を当てた結果。できなければ null
export function applyUpgrades(caravan, steps, limit) {
    if (!Array.isArray(steps) || steps.length === 0 || steps.length > limit) return null;
    const result = [...caravan];
    for (const color of steps) {
        if (!isInt(color, 0, 2) || result[color] === 0) return null;
        result[color]--;
        result[color + 1]++;
    }
    return result;
}

// 交換を何回できるか
export const maxTrades = (caravan, card) => Math.min(...card.in.map((n, i) => (n > 0 ? Math.floor(caravan[i] / n) : Infinity)));

export function scoreOf(player) {
    return player.points.reduce((s, id) => s + POINT_CARDS[id].points, 0)
        + player.gold * GOLD_POINTS + player.silver * SILVER_POINTS
        + player.caravan[1] + player.caravan[2] + player.caravan[3];
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        const random = createRandom(seed);
        const n = players.length;
        this.first = Math.floor(random() * n); // 最初の手番の人
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: [...STARTING_IDS], played: [], caravan: [...STARTING_SPICES[(id - this.first + n) % n]],
            points: [], gold: 0, silver: 0
        }));
        this.deck = shuffle([...DECK_IDS], random);
        this.market = this.deck.splice(0, MARKET_SIZE).map(card => ({ card, spices: [0, 0, 0, 0] }));
        this.pointDeck = shuffle(POINT_CARDS.map(c => c.id), random);
        this.pointRow = this.pointDeck.splice(0, POINT_ROW_SIZE);
        this.coins = { gold: n * 2, silver: n * 2 };
        this.current = this.first;
        this.phase = 'play';        // play：手番 / discard：香辛料を戻す / end：終わり
        this.lastRound = false;
        this.turn = 1;
        this.results = null;
        this.winner = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.first].name}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    // 得点カードの上の硬貨：左端と2番目に、金貨・銀貨の残っている山を左から置く
    coinAt(index) {
        const piles = [];
        if (this.coins.gold > 0) piles.push('gold');
        if (this.coins.silver > 0) piles.push('silver');
        return piles[index] ?? null;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { play: { play: this.play, acquire: this.acquire, rest: this.rest, claim: this.claim }, discard: { discard: this.discard } }[this.phase]?.[command.type];
        if (!handler) return this.fail(this.phase === 'discard' ? '香辛料を10個まで戻してください' : '今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { if (command[k] !== undefined) recorded[k] = structuredClone(command[k]); });
        this.commands.push({ playerId, command: recorded });
        if (command.type !== 'discard' && total(this.players[playerId].caravan) > CARAVAN_LIMIT) {
            this.phase = 'discard';
            return true;
        }
        this.endTurn(playerId);
        return true;
    }

    // { type: 'play', card, times?, steps? }
    play(seat, { card, times, steps }) {
        const player = this.players[seat];
        if (!player.hand.includes(card)) return this.fail('そのカードは手札にありません');
        const merchant = MERCHANTS[card];
        let after;
        let detail;
        if (merchant.kind === 'produce') {
            after = player.caravan.map((n, i) => n + merchant.out[i]);
            detail = `${spiceText(merchant.out)}を得ました`;
        } else if (merchant.kind === 'trade') {
            if (!isInt(times, 1, 20)) return this.fail('交換の回数を選んでください');
            if (times > maxTrades(player.caravan, merchant)) return this.fail('香辛料が足りません');
            after = player.caravan.map((n, i) => n + (merchant.out[i] - merchant.in[i]) * times);
            detail = `${spiceText(merchant.in)}を${spiceText(merchant.out)}に${times}回交換しました`;
        } else {
            after = applyUpgrades(player.caravan, steps, merchant.upgrades);
            if (!after) return this.fail(`格上げできる香辛料を、${merchant.upgrades}回まで選んでください`);
            detail = `${steps.length}回格上げしました`;
        }
        player.caravan = after;
        player.hand.splice(player.hand.indexOf(card), 1);
        player.played.push(card);
        this.emit({ type: 'play', seat, card, times: times ?? null, steps: steps ?? null });
        this.log(`${player.name}が${detail}`);
        return true;
    }

    // { type: 'acquire', index, pay: [左のカードから順に置く香辛料の色] }
    acquire(seat, { index, pay = [] }) {
        const player = this.players[seat];
        if (!isInt(index, 0, this.market.length - 1)) return this.fail('取るカードを選んでください');
        if (!Array.isArray(pay) || pay.length !== index || pay.some(c => !isInt(c, 0, 3))) return this.fail(`左の${index}枚に香辛料を1個ずつ置きます`);
        const need = [0, 0, 0, 0];
        pay.forEach(c => { need[c]++; });
        if (!canPay(player.caravan, need)) return this.fail('置く香辛料が足りません');
        pay.forEach((c, i) => { this.market[i].spices[c]++; });
        need.forEach((n, i) => { player.caravan[i] -= n; });
        const [taken] = this.market.splice(index, 1);
        taken.spices.forEach((n, i) => { player.caravan[i] += n; });
        player.hand.push(taken.card);
        if (this.deck.length > 0) this.market.push({ card: this.deck.shift(), spices: [0, 0, 0, 0] });
        this.emit({ type: 'acquire', seat, index, card: taken.card, pay: [...pay], gained: [...taken.spices] });
        this.log(`${player.name}が商人カードを取りました${total(taken.spices) ? `（${spiceText(taken.spices)}も）` : ''}`);
        return true;
    }

    rest(seat) {
        const player = this.players[seat];
        if (player.played.length === 0) return this.fail('使用済みのカードがありません');
        player.hand.push(...player.played);
        player.played = [];
        this.emit({ type: 'rest', seat });
        this.log(`${player.name}が休みました`);
        return true;
    }

    // { type: 'claim', index }
    claim(seat, { index }) {
        const player = this.players[seat];
        if (!isInt(index, 0, this.pointRow.length - 1)) return this.fail('得点カードを選んでください');
        const card = POINT_CARDS[this.pointRow[index]];
        if (!canPay(player.caravan, card.cost)) return this.fail('香辛料が足りません');
        const coin = this.coinAt(index);
        card.cost.forEach((n, i) => { player.caravan[i] -= n; });
        this.pointRow.splice(index, 1);
        player.points.push(card.id);
        if (coin) {
            this.coins[coin]--;
            player[coin]++;
        }
        if (this.pointDeck.length > 0) this.pointRow.push(this.pointDeck.shift());
        this.emit({ type: 'claim', seat, index, card: card.id, coin });
        this.log(`${player.name}が得点カード（${card.points}点）を取りました${coin ? `（${coin === 'gold' ? '金貨' : '銀貨'}も）` : ''}`);
        if (!this.lastRound && player.points.length >= endCount(this.players.length)) {
            this.lastRound = true;
            this.log(`${player.name}が${player.points.length}枚目を取りました。この巡で終わりです`);
        }
        return true;
    }

    // { type: 'discard', spices: [黄, 赤, 緑, 茶] }：10個を超えた分を戻す
    discard(seat, { spices }) {
        const player = this.players[seat];
        if (!Array.isArray(spices) || spices.length !== 4 || spices.some(n => !isInt(n, 0, 99))) return this.fail('戻す香辛料が正しくありません');
        if (!canPay(player.caravan, spices)) return this.fail('持っていない香辛料は戻せません');
        if (total(spices) !== total(player.caravan) - CARAVAN_LIMIT) return this.fail(`${total(player.caravan) - CARAVAN_LIMIT}個戻してください`);
        spices.forEach((n, i) => { player.caravan[i] -= n; });
        this.emit({ type: 'discard', seat, spices: [...spices] });
        this.log(`${player.name}が香辛料を戻しました（${spiceText(spices)}）`);
        return true;
    }

    // 手番を終える。最後の巡なら、最初の手番の人に戻る前で終わる
    endTurn(seat) {
        const next = (seat + 1) % this.players.length;
        if (this.lastRound && next === this.first) return this.endGame();
        this.current = next;
        this.phase = 'play';
        this.turn++;
    }

    endGame() {
        this.phase = 'end';
        const n = this.players.length;
        this.results = this.players.map(p => ({ seat: p.id, score: scoreOf(p), order: (p.id - this.first + n) % n }));
        // 同点なら、手番の順が後の人の勝ち
        const best = [...this.results].sort((a, b) => b.score - a.score || b.order - a.order)[0];
        this.winner = best.seat;
        this.emit({ type: 'end', winner: best.seat });
        this.log(`${this.players[best.seat].name}の勝ちです`);
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
