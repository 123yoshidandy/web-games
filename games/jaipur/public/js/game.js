/**
 * ジャイプル（Jaipur）のゲームの進行（2人用）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札とボーナスの並びはシードから決まる）
 *
 * ルール
 * - カード55枚：ダイヤ6・金6・銀6・布8・香辛料8・革10・ラクダ11
 * - ラウンドの準備：市場にラクダ3枚を置き、残りを切って各自に5枚配る。手札のラクダは自分の群れに出す。市場を5枚にする
 * - 手番には、次のどれか1つを行う
 *   - 取る：市場の商品を1枚取る／市場のラクダを全部取る（群れへ）／市場の商品を2枚以上取り、同じ枚数の手札かラクダを市場へ返す
 *     （取った種類と同じ種類の商品は返せない。ラクダは交換では取れない）。取ったあと、市場の空きを山札から補充する
 *   - 売る：手札の1種類の商品を好きな枚数売り、その種類の商品トークンを上から枚数分もらう（なくなっていたら、その分はもらえない）
 *     ダイヤ・金・銀は2枚以上でないと売れない。3枚・4枚・5枚以上売ると、それぞれの山からボーナストークンを1枚もらう
 * - 手札（ラクダは数えない）は7枚まで
 * - 商品トークンの山が3種類なくなるか、市場を補充できなくなったら、ラウンドの終わり
 *   ラクダの多い人がラクダのトークン（5点）をもらう（同数ならだれも）。点数の多い人がラウンドの勝ちで、印を1つもらう
 *   同点なら、ボーナストークンの多い人、それも同じなら商品トークンの多い人
 * - 印を2つ集めた人の勝ち。次のラウンドは、前のラウンドで負けた人から始める
 *
 * ルールブックに書かれていないので、次のように決めた
 * - ラウンドの勝ち負けが、点数・ボーナス・商品トークンの数でも決まらなければ、引き分けで印はだれにも渡さない
 *   次のラウンドは、そのラウンドの2番手から始める
 * - 最初のラウンドの1番手は、シードから決める
 */

import { createRandom, shuffle } from './random.js';

export const GOODS = ['diamond', 'gold', 'silver', 'cloth', 'spice', 'leather'];
export const CAMEL = 'camel';
export const PRECIOUS = ['diamond', 'gold', 'silver'];  // 2枚以上でないと売れない
export const CARD_COUNTS = { diamond: 6, gold: 6, silver: 6, cloth: 8, spice: 8, leather: 10, camel: 11 };
export const GOODS_TOKENS = {
    diamond: [7, 7, 5, 5, 5],
    gold: [6, 6, 5, 5, 5],
    silver: [5, 5, 5, 5, 5],
    cloth: [5, 3, 3, 2, 2, 1, 1],
    spice: [5, 3, 3, 2, 2, 1, 1],
    leather: [4, 3, 2, 1, 1, 1, 1, 1, 1]
};
export const BONUS_TOKENS = { 3: [1, 1, 2, 2, 2, 3, 3], 4: [4, 4, 5, 5, 6, 6], 5: [8, 8, 9, 10, 10] };
export const NAMES = { diamond: 'ダイヤ', gold: '金', silver: '銀', cloth: '布', spice: '香辛料', leather: '革', camel: 'ラクダ' };
export const MARKET_SIZE = 5;
export const HAND_LIMIT = 7;
export const HAND_START = 5;
export const CAMEL_BONUS = 5;
export const SEALS_TO_WIN = 2;
export const EMPTY_STACKS_TO_END = 3;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { take: ['index'], camels: [], exchange: ['take', 'give'], sell: ['good', 'count'] };
const MAX_LOGS = 200;
const MAX_EVENTS = 80;

export const bonusSize = (count) => (count >= 5 ? 5 : count >= 3 ? count : null);
export const countOf = (cards, type) => cards.filter(c => c === type).length;
export const sortHand = (hand) => hand.sort((a, b) => GOODS.indexOf(a) - GOODS.indexOf(b));
const sum = (list) => list.reduce((s, v) => s + v, 0);
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export default class Game {
    // players: [{ name, isCPU }]（2人）、options: { seed }
    constructor(players, options = {}) {
        if (players.length !== 2) throw new Error('ジャイプルは2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: [], herd: 0, tokens: [], bonus: [], camelToken: false, seals: 0
        }));
        this.round = 0;
        this.starter = Math.floor(this.random() * 2);
        this.current = this.starter;
        this.phase = 'play';         // play：手番 / end：終わり
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

    actors() {
        return this.phase === 'play' ? [this.current] : [];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { take: this.takeOne, camels: this.takeCamels, exchange: this.exchange, sell: this.sell }[command.type];
        if (!handler || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = structuredClone(command[key]); });
        this.commands.push({ playerId, command: recorded });
        this.afterAction(playerId);
        return true;
    }

    // ---- 手番の操作 ----

    // { type: 'take', index }：市場の商品を1枚取る
    takeOne(seat, { index }) {
        const player = this.players[seat];
        if (!isInt(index, 0, this.market.length - 1)) return this.fail('市場のカードを選んでください');
        const card = this.market[index];
        if (card === CAMEL) return this.fail('ラクダは1枚だけでは取れません（全部取ります）');
        if (player.hand.length >= HAND_LIMIT) return this.fail(`手札は${HAND_LIMIT}枚までです`);
        player.hand.push(card);
        sortHand(player.hand);
        this.market[index] = null;
        const refill = this.refill();
        this.emit({ type: 'take', seat, index, card, refill });
        this.log(`${player.name}が${NAMES[card]}を取りました`);
        return true;
    }

    // { type: 'camels' }：市場のラクダを全部取る
    takeCamels(seat) {
        const player = this.players[seat];
        const indices = this.market.map((c, i) => (c === CAMEL ? i : -1)).filter(i => i >= 0);
        if (indices.length === 0) return this.fail('市場にラクダがいません');
        indices.forEach(i => { this.market[i] = null; });
        player.herd += indices.length;
        const refill = this.refill();
        this.emit({ type: 'camels', seat, indices, refill });
        this.log(`${player.name}がラクダを${indices.length}頭取りました`);
        return true;
    }

    // { type: 'exchange', take: [市場の位置], give: { 種類: 枚数, camel: 頭数 } }：2枚以上取り、同じ枚数を返す
    exchange(seat, { take, give }) {
        const player = this.players[seat];
        if (!Array.isArray(take) || take.length < 2) return this.fail('交換では2枚以上取ります');
        if (new Set(take).size !== take.length || take.some(i => !isInt(i, 0, this.market.length - 1))) return this.fail('市場のカードの選び方が正しくありません');
        const taken = take.map(i => this.market[i]);
        if (taken.includes(CAMEL)) return this.fail('交換ではラクダは取れません');
        if (!give || typeof give !== 'object' || Array.isArray(give)) return this.fail('返すカードを選んでください');
        if (Object.keys(give).some(key => ![...GOODS, CAMEL].includes(key))) return this.fail('返すカードが正しくありません');
        const counts = {};
        for (const key of [...GOODS, CAMEL]) {
            const n = give[key] ?? 0;
            if (!isInt(n, 0, 20)) return this.fail('返すカードが正しくありません');
            if (n > 0) counts[key] = n;
        }
        const total = sum(Object.values(counts));
        if (total !== take.length) return this.fail('取った枚数と同じ枚数を返します');
        if ((counts[CAMEL] ?? 0) > player.herd) return this.fail('ラクダが足りません');
        if (GOODS.some(g => (counts[g] ?? 0) > countOf(player.hand, g))) return this.fail('持っていないカードは返せません');
        if (taken.some(card => counts[card])) return this.fail('取った種類と同じ種類の商品は返せません');
        const goodsGiven = total - (counts[CAMEL] ?? 0);
        if (player.hand.length - goodsGiven + take.length > HAND_LIMIT) return this.fail(`手札は${HAND_LIMIT}枚までです`);

        // 返すカードを、取った場所に順に置く
        const given = Object.entries(counts).flatMap(([type, n]) => Array(n).fill(type));
        given.forEach(type => {
            if (type === CAMEL) player.herd--;
            else player.hand.splice(player.hand.indexOf(type), 1);
        });
        take.forEach((index, i) => { this.market[index] = given[i]; });
        player.hand.push(...taken);
        sortHand(player.hand);
        this.emit({ type: 'exchange', seat, take: take.map((index, i) => ({ index, card: taken[i] })), give: take.map((index, i) => ({ index, card: given[i] })) });
        this.log(`${player.name}が${taken.length}枚を交換しました`);
        return true;
    }

    // { type: 'sell', good, count }：手札の1種類の商品を売る
    sell(seat, { good, count }) {
        const player = this.players[seat];
        if (!GOODS.includes(good)) return this.fail('売る商品を選んでください');
        if (!isInt(count, 1, HAND_LIMIT)) return this.fail('売る枚数が正しくありません');
        if (count > countOf(player.hand, good)) return this.fail('持っている枚数より多くは売れません');
        if (PRECIOUS.includes(good) && count < 2) return this.fail(`${NAMES[good]}は2枚以上でないと売れません`);
        for (let i = 0; i < count; i++) player.hand.splice(player.hand.indexOf(good), 1);
        const tokens = this.goodsTokens[good].splice(0, count);
        tokens.forEach(value => player.tokens.push({ good, value }));
        const size = bonusSize(count);
        let bonus = null;
        if (size && this.bonusTokens[size].length > 0) {
            bonus = { size, value: this.bonusTokens[size].shift() };
            player.bonus.push(bonus);
        }
        this.emit({ type: 'sell', seat, good, count, tokens, bonus: bonus ? { ...bonus } : null });
        this.log(`${player.name}が${NAMES[good]}を${count}枚売りました（${sum(tokens)}点${bonus ? '＋ボーナス' : ''}）`);
        return true;
    }

    // ---- 進行 ----

    deal() {
        this.round++;
        const deck = [];
        Object.entries(CARD_COUNTS).forEach(([type, n]) => deck.push(...Array(n - (type === CAMEL ? 3 : 0)).fill(type)));
        this.deck = shuffle(deck, this.random);
        this.market = [CAMEL, CAMEL, CAMEL, null, null];
        this.players.forEach(p => {
            const cards = this.deck.splice(0, HAND_START);
            p.herd = countOf(cards, CAMEL);
            p.hand = sortHand(cards.filter(c => c !== CAMEL));
            p.tokens = [];
            p.bonus = [];
            p.camelToken = false;
        });
        this.refill();
        this.goodsTokens = structuredClone(GOODS_TOKENS);
        this.bonusTokens = Object.fromEntries(Object.entries(BONUS_TOKENS).map(([size, values]) => [size, shuffle([...values], this.random)]));
        this.current = this.starter;
        this.emit({ type: 'deal', round: this.round, market: [...this.market], hands: this.players.map(p => [...p.hand]), herds: this.players.map(p => p.herd), starter: this.starter });
        this.log(`第${this.round}ラウンド。${this.players[this.starter].name}から始めます`);
    }

    // 市場の空きを山札から補充する。補充した { index, card } の一覧を返す
    refill() {
        const filled = [];
        this.market.forEach((card, index) => {
            if (card === null && this.deck.length > 0) {
                this.market[index] = this.deck.shift();
                filled.push({ index, card: this.market[index] });
            }
        });
        return filled;
    }

    afterAction(seat) {
        const empty = GOODS.filter(g => this.goodsTokens[g].length === 0).length;
        if (empty >= EMPTY_STACKS_TO_END || this.market.includes(null)) return this.endRound();
        this.current = 1 - seat;
    }

    scoreOf(player) {
        return sum(player.tokens.map(t => t.value)) + sum(player.bonus.map(b => b.value)) + (player.camelToken ? CAMEL_BONUS : 0);
    }

    endRound() {
        const [a, b] = this.players;
        if (a.herd !== b.herd) (a.herd > b.herd ? a : b).camelToken = true;
        const results = this.players.map(p => ({
            seat: p.id, score: this.scoreOf(p), goods: p.tokens.length, bonus: p.bonus.length,
            bonusValues: p.bonus.map(t => t.value), herd: p.herd, camelToken: p.camelToken
        }));
        const compare = (x, y) => x.score - y.score || x.bonus - y.bonus || x.goods - y.goods;
        const diff = compare(results[0], results[1]);
        const winner = diff === 0 ? null : diff > 0 ? 0 : 1;
        if (winner !== null) this.players[winner].seals++;
        const reason = GOODS.filter(g => this.goodsTokens[g].length === 0).length >= EMPTY_STACKS_TO_END ? 'tokens' : 'deck';
        this.history.push({ round: this.round, winner, results });
        this.emit({ type: 'roundEnd', round: this.round, winner, reason, results, seals: this.players.map(p => p.seals) });
        this.log(winner === null ? `第${this.round}ラウンドは引き分けです` : `第${this.round}ラウンドは${this.players[winner].name}の勝ちです`);
        const champion = this.players.find(p => p.seals >= SEALS_TO_WIN);
        if (champion) {
            this.phase = 'end';
            this.winner = champion.id;
            this.emit({ type: 'end', winner: champion.id });
            this.log(`${champion.name}の勝ちです`);
            return;
        }
        // 次のラウンドは負けた人から（引き分けなら、このラウンドの2番手から）
        this.starter = winner === null ? 1 - this.starter : 1 - winner;
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
