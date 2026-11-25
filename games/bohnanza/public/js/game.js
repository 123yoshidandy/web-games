/**
 * ボーナンザ（基本ゲーム、3〜5人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びはシードから決まる）
 *
 * 手番：1. 手札の一番前を植える（もう1枚も可）→ 2. 山から2枚を表にし、取引と贈与 → 3. もらった豆と残った表の豆を植える → 4. 山から3枚を手札の後ろへ
 * 取引は、手番の人とほかの人の間だけ。手番の人は表の2枚と手札を、ほかの人は手札だけを出せる。もらった豆は取っておき、3で植える
 * 売る（畑の豆を全部、売値の表で金に）と、3つ目の畑を買う（3金）は、いつでもできる
 * 山が3回（3人は2回）なくなったら終わり。畑の豆を売り、金の多い人の勝ち。同点なら手札の多い人
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 提案は1件ずつ。提案された人が受けるか断るまで、ほかの提案はできない
 * - ほかの人の手札から欲しいものは「豆の種類と枚数」で求める。受ける人が、手札のどの位置のカードを渡すか選ぶ
 * - 1つの手番に1人が出せる提案は8件まで。手番でない人は「取引しない」と言ったら、その手番はもう提案しない
 * - 畑に同じ種類の豆があれば、そこに植える（ほかの空いた畑には植えられない）
 * - 1枚だけの畑は、ほかに2枚以上の畑があれば売れない（空いた畑は数えない）
 * - 同点で手札の枚数も同じなら、その全員の勝ち
 */

import { createRandom, shuffle } from './random.js';
import { BEANS, MIN_PLAYERS, MAX_PLAYERS, HAND_START, DRAW_FACE_UP, DRAW_END, FIELD_PRICE, MAX_OFFERS, setupFor, coinsFor, legalFieldsFor, canHarvestField } from './cards.js';

export { MIN_PLAYERS, MAX_PLAYERS };
const MAX_LOGS = 400;
const MAX_EVENTS = 60;

export const COMMAND_FIELDS = {
    plant: ['field'],
    next: [],
    offer: ['to', 'give', 'want'],
    respond: ['accept', 'hand'],
    pass: [],
    endTrade: [],
    plantPending: ['index', 'field'],
    harvest: ['field'],
    buyField: []
};

const isIdx = (i, n) => Number.isInteger(i) && i >= 0 && i < n;
const distinct = (list) => new Set(list).size === list.length;
const cardsText = (cards) => cards.map(t => BEANS[t].name).join('・') || 'なし';

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        const n = players.length;
        if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('人数は3〜5人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        this.setup = setupFor(n);
        this.deck = shuffle(this.setup.types.flatMap(t => Array(BEANS[t].count).fill(t)), this.random);
        this.discard = [];
        this.exhausted = 0;
        this.deckOut = false;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            hand: [], fields: Array(this.setup.thirdField ? 3 : 2).fill(null), coins: [], toPlant: []
        }));
        this.active = Math.floor(this.random() * n);
        // 手番の人から順に5枚ずつ配る
        for (let k = 0; k < n; k++) {
            const p = this.players[(this.active + k) % n];
            for (let i = 0; i < HAND_START; i++) p.hand.push(this.deck.shift());
        }
        this.turn = 0;
        this.phase = 'plant';       // plant：植える / trade：取引 / plantTraded：もらった豆を植える / end：終わり
        this.planted = 0;
        this.faceUp = [];
        this.offer = null;
        this.passed = [];
        this.offers = {};
        this.turnOffers = [];      // この手番の提案と結果 { from, to, give: [種類], want: [種類], accepted }
        this.endAfterTurn = false;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startTurn();
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        switch (this.phase) {
            case 'plant': return [this.active];
            case 'trade':
                if (this.offer) return [this.offer.to];
                return [this.active, ...this.players.map(p => p.id).filter(id => id !== this.active && this.canOffer(id))];
            case 'plantTraded': return this.players.filter(p => p.toPlant.length).map(p => p.id);
            default: return [];
        }
    }

    canOffer(seat) {
        return (this.offers[seat] ?? 0) < MAX_OFFERS && (seat === this.active || !this.passed.includes(seat));
    }

    // ---- 山 ----

    // 1枚引く。山がなくなったら捨て札を切り直す。決まった回数なくなったら null（終わり）
    drawCard() {
        if (this.deckOut) return null;
        if (!this.deck.length) {
            this.exhausted += 1;
            if (this.exhausted >= this.setup.exhaustLimit || !this.discard.length) {
                this.deckOut = true;
                this.log(`山が${this.exhausted}回なくなりました`);
                return null;
            }
            this.deck = shuffle(this.discard, this.random);
            this.discard = [];
            this.emit({ type: 'reshuffle', exhausted: this.exhausted });
            this.log(`山が${this.exhausted}回なくなり、捨て札を切り直しました`);
        }
        return this.deck.shift();
    }

    // ---- 手番 ----

    startTurn() {
        this.turn += 1;
        this.phase = 'plant';
        this.planted = 0;
        const p = this.players[this.active];
        this.emit({ type: 'turn', seat: this.active });
        this.log(`${p.name}の番`);
        if (!p.hand.length) this.toTrade();
    }

    toTrade() {
        for (let i = 0; i < DRAW_FACE_UP; i++) {
            const card = this.drawCard();
            if (card === null) break;
            this.faceUp.push(card);
        }
        // 山が終わったら、この手番の3（植える）までで終わり
        if (this.deckOut) this.endAfterTurn = true;
        this.phase = 'trade';
        this.offer = null;
        this.passed = [];
        this.offers = {};
        this.turnOffers = [];
        this.emit({ type: 'faceUp', cards: [...this.faceUp] });
        if (this.faceUp.length) this.log(`表に${cardsText(this.faceUp)}`);
    }

    endTrade() {
        const p = this.players[this.active];
        p.toPlant.push(...this.faceUp);
        this.faceUp = [];
        this.offer = null;
        this.phase = 'plantTraded';
        this.checkPlanted();
    }

    checkPlanted() {
        if (this.players.some(p => p.toPlant.length)) return;
        if (this.endAfterTurn) {
            this.endGame();
            return;
        }
        const p = this.players[this.active];
        for (let i = 0; i < DRAW_END; i++) {
            const card = this.drawCard();
            if (card === null) {
                this.endGame();
                return;
            }
            p.hand.push(card);
        }
        this.active = (this.active + 1) % this.players.length;
        this.startTurn();
    }

    endGame() {
        this.phase = 'end';
        this.offer = null;
        this.faceUp = [];
        this.players.forEach(p => {
            p.fields.forEach((f, i) => { if (f) this.sell(p, i); });
        });
        const best = Math.max(...this.players.map(p => p.coins.length));
        const top = this.players.filter(p => p.coins.length === best);
        const most = Math.max(...top.map(p => p.hand.length));
        this.winners = top.filter(p => p.hand.length === most).map(p => p.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`得点：${this.players.map(p => `${p.name} ${p.coins.length}金`).join('・')}`);
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ち`);
    }

    // ---- 畑 ----

    // この豆を植えられる畑（同じ種類の畑があればそこだけ、なければ空いた畑）
    legalFields(p, type) {
        return legalFieldsFor(p.fields, type);
    }

    // 売れる畑か（1枚だけの畑は、ほかに2枚以上の畑があれば売れない）
    canHarvest(p, i) {
        return canHarvestField(p.fields, i);
    }

    plantCard(p, type, field) {
        const f = p.fields[field];
        if (f) f.n += 1;
        else p.fields[field] = { type, n: 1 };
        this.emit({ type: 'plant', seat: p.id, bean: type, field });
    }

    sell(p, i) {
        const f = p.fields[i];
        const coins = coinsFor(f.type, f.n);
        for (let k = 0; k < coins; k++) p.coins.push(f.type);
        for (let k = coins; k < f.n; k++) this.discard.push(f.type);
        p.fields[i] = null;
        this.emit({ type: 'sell', seat: p.id, bean: f.type, n: f.n, coins });
        this.log(`${p.name}：${BEANS[f.type].name}${f.n}枚を売って${coins}金`);
    }

    // ---- 操作 ----

    // 受け付けたら true、できなければ lastError に理由を入れて false。断る操作は状態を変えない
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!isIdx(playerId, this.players.length)) return this.fail('席が正しくありません');
        // 売るのと畑を買うのは、いつでも（手番でなくても）できる
        const anytime = command.type === 'harvest' || command.type === 'buyField';
        if (!anytime && !this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        const check = this[`check_${command.type}`](playerId, command);
        if (typeof check === 'string') return this.fail(check);
        this.commands.push({ playerId, command: check.recorded });
        check.run();
        return true;
    }

    check_plant(seat, { field }) {
        if (this.phase !== 'plant') return '今は植えられません';
        const p = this.players[seat];
        if (!p.hand.length) return '手札がありません';
        if (this.planted >= 2) return '植えられるのは2枚までです';
        const type = p.hand[0];
        if (!this.legalFields(p, type).includes(field)) return 'その畑には植えられません';
        return {
            recorded: { type: 'plant', field },
            run: () => {
                p.hand.shift();
                this.plantCard(p, type, field);
                this.planted += 1;
                this.log(`${p.name}：${BEANS[type].name}を植えた`);
                if (this.planted >= 2 || !p.hand.length) this.toTrade();
            }
        };
    }

    check_next(seat) {
        if (this.phase !== 'plant') return '今はその操作はできません';
        if (this.planted < 1 && this.players[seat].hand.length) return '手札の一番前は植えます';
        return { recorded: { type: 'next' }, run: () => this.toTrade() };
    }

    // 提案。give：出す側のカード（表の位置・手札の位置）、want：もらう側のカード（表の位置・手札から種類と枚数）
    check_offer(seat, { to, give, want }) {
        if (this.phase !== 'trade' || this.offer) return '今は提案できません';
        if (!this.canOffer(seat)) return 'もう提案できません';
        if (!isIdx(to, this.players.length) || to === seat) return '相手が正しくありません';
        const active = seat === this.active;
        if (!active && to !== this.active) return '取引は手番の人とだけです';
        const p = this.players[seat];
        const g = { faceUp: give?.faceUp ?? [], hand: give?.hand ?? [] };
        const w = { faceUp: want?.faceUp ?? [], types: want?.types ?? {} };
        if (!Array.isArray(g.faceUp) || !Array.isArray(g.hand) || !Array.isArray(w.faceUp) || typeof w.types !== 'object' || w.types === null) return '提案の形が正しくありません';
        if (!distinct(g.faceUp) || !distinct(g.hand) || !distinct(w.faceUp)) return '同じカードは1回だけです';
        if (!g.hand.every(i => isIdx(i, p.hand.length))) return 'そのカードは手札にありません';
        if (active) {
            if (!g.faceUp.every(i => isIdx(i, this.faceUp.length))) return 'その表のカードはありません';
            if (w.faceUp.length) return '表のカードは手番の人のものです';
        } else {
            if (g.faceUp.length) return '表のカードは手番の人だけが出せます';
            if (!w.faceUp.every(i => isIdx(i, this.faceUp.length))) return 'その表のカードはありません';
        }
        const types = {};
        for (const [t, n] of Object.entries(w.types)) {
            if (!BEANS[t] || !Number.isInteger(n) || n < 0 || n > 20) return '欲しい豆の指定が正しくありません';
            if (n) types[t] = n;
        }
        const count = g.faceUp.length + g.hand.length + w.faceUp.length + Object.values(types).reduce((s, k) => s + k, 0);
        if (!count) return '何かを出すか、求めてください';
        const offer = { from: seat, to, give: { faceUp: [...g.faceUp], hand: [...g.hand] }, want: { faceUp: [...w.faceUp], types } };
        return {
            recorded: { type: 'offer', to, give: structuredClone(offer.give), want: structuredClone(offer.want) },
            run: () => {
                this.offer = offer;
                this.offers[seat] = (this.offers[seat] ?? 0) + 1;
                this.turnOffers.push({ from: seat, to, ...this.offerCards(offer), accepted: null });
                this.emit({ type: 'offer', ...structuredClone(offer) });
                this.log(`${p.name}→${this.players[to].name}：${this.offerText(offer)}`);
            }
        };
    }

    // 提案で動くカードの種類（出す側 give・もらう側 want）
    offerCards(offer) {
        const from = this.players[offer.from];
        const give = [...offer.give.faceUp.map(i => this.faceUp[i]), ...offer.give.hand.map(i => from.hand[i])];
        const want = [...offer.want.faceUp.map(i => this.faceUp[i]), ...Object.entries(offer.want.types).flatMap(([t, n]) => Array(n).fill(t))];
        return { give, want };
    }

    // 提案の中身の文
    offerText(offer) {
        const from = this.players[offer.from];
        const giveCards = [...offer.give.faceUp.map(i => this.faceUp[i]), ...offer.give.hand.map(i => from.hand[i])];
        const wantFace = offer.want.faceUp.map(i => this.faceUp[i]);
        const wantTypes = Object.entries(offer.want.types).flatMap(([t, n]) => Array(n).fill(t));
        const want = [...wantFace, ...wantTypes];
        if (!want.length) return `${cardsText(giveCards)}をあげる`;
        if (!giveCards.length) return `${cardsText(want)}をください`;
        return `${cardsText(giveCards)}と${cardsText(want)}を交換`;
    }

    // 提案への答え。受けるとき hand は、求められた種類と枚数に合う自分の手札の位置
    check_respond(seat, { accept, hand }) {
        const offer = this.offer;
        if (this.phase !== 'trade' || !offer || offer.to !== seat) return '答える提案がありません';
        if (typeof accept !== 'boolean') return '受けるか断るかを選んでください';
        if (!accept) {
            return {
                recorded: { type: 'respond', accept: false, hand: [] },
                run: () => {
                    this.offer = null;
                    this.turnOffers.at(-1).accepted = false;
                    this.emit({ type: 'decline', from: offer.from, to: seat });
                    this.log(`${this.players[seat].name}：断った`);
                }
            };
        }
        const me = this.players[seat];
        const picks = hand ?? [];
        if (!Array.isArray(picks) || !distinct(picks) || !picks.every(i => isIdx(i, me.hand.length))) return '渡すカードが正しくありません';
        const counts = {};
        picks.forEach(i => { counts[me.hand[i]] = (counts[me.hand[i]] ?? 0) + 1; });
        const need = offer.want.types;
        const keys = new Set([...Object.keys(counts), ...Object.keys(need)]);
        if ([...keys].some(t => (counts[t] ?? 0) !== (need[t] ?? 0))) return '求められた豆と合っていません';
        return {
            recorded: { type: 'respond', accept: true, hand: [...picks] },
            run: () => {
                const from = this.players[offer.from];
                const toFrom = [...picks.map(i => me.hand[i]), ...offer.want.faceUp.map(i => this.faceUp[i])];
                const toMe = [...offer.give.faceUp.map(i => this.faceUp[i]), ...offer.give.hand.map(i => from.hand[i])];
                const removeAt = (list, idx) => [...idx].sort((a, b) => b - a).forEach(i => list.splice(i, 1));
                removeAt(me.hand, picks);
                removeAt(from.hand, offer.give.hand);
                removeAt(this.faceUp, [...offer.give.faceUp, ...offer.want.faceUp]);
                from.toPlant.push(...toFrom);
                me.toPlant.push(...toMe);
                this.offer = null;
                this.turnOffers.at(-1).accepted = true;
                this.emit({ type: 'trade', from: offer.from, to: seat, toFrom, toMe });
                this.log(`${me.name}：受けた`);
            }
        };
    }

    check_pass(seat) {
        if (this.phase !== 'trade' || this.offer || seat === this.active) return '今はその操作はできません';
        return {
            recorded: { type: 'pass' },
            run: () => { this.passed.push(seat); }
        };
    }

    check_endTrade(seat) {
        if (this.phase !== 'trade' || this.offer || seat !== this.active) return '今はその操作はできません';
        return { recorded: { type: 'endTrade' }, run: () => this.endTrade() };
    }

    check_plantPending(seat, { index, field }) {
        if (this.phase !== 'plantTraded') return '今は植えられません';
        const p = this.players[seat];
        if (!isIdx(index, p.toPlant.length)) return 'そのカードはありません';
        const type = p.toPlant[index];
        if (!this.legalFields(p, type).includes(field)) return 'その畑には植えられません';
        return {
            recorded: { type: 'plantPending', index, field },
            run: () => {
                p.toPlant.splice(index, 1);
                this.plantCard(p, type, field);
                this.checkPlanted();
            }
        };
    }

    check_harvest(seat, { field }) {
        const p = this.players[seat];
        if (!isIdx(field, p.fields.length) || !p.fields[field]) return 'その畑には豆がありません';
        if (!this.canHarvest(p, field)) return '1枚だけの畑は、ほかに2枚以上の畑があれば売れません';
        return { recorded: { type: 'harvest', field }, run: () => this.sell(p, field) };
    }

    check_buyField(seat) {
        const p = this.players[seat];
        if (!this.setup.canBuyField) return 'この人数では3つ目の畑は最初からあります';
        if (p.fields.length >= 3) return 'もう3つ目の畑があります';
        if (p.coins.length < FIELD_PRICE) return `${FIELD_PRICE}金が要ります`;
        return {
            recorded: { type: 'buyField' },
            run: () => {
                for (let k = 0; k < FIELD_PRICE; k++) this.discard.push(p.coins.pop());
                p.fields.push(null);
                this.emit({ type: 'buyField', seat });
                this.log(`${p.name}：3つ目の畑を買った`);
            }
        };
    }

    // ---- 記録 ----

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

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

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
