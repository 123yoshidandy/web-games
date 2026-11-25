/**
 * レース・フォー・ザ・ギャラクシー（基本ゲーム）のルール。DOM に依存しない
 *
 * 進み方：最初に手札 6 枚から 2 枚を捨てる → ラウンドごとに、全員が同時に行動を選ぶ → 選ばれた段階だけを順に行う
 *   （探索・開発・入植・消費・生産）→ 手札を 10 枚まで捨てる → 場札 12 枚か勝利点チップが尽きていれば終わり
 * 判断は席ごとに 1 つずつ（pending[seat]）。全員の判断がなくなったら次へ進む
 * 操作の入口は applyCommand(seat, command) だけ。断る操作は状態を変えない。commands と Game.replay で再現できる
 *
 * 操作（command.type）
 *   startDiscard { cards: [2 枚] }        最初の手札から捨てる
 *   action { actions: [行動] }             行動を選ぶ（2 人の上級ルールでは 2 つ）
 *   explore { keep: [カード] }             探索で残すカード
 *   develop { card|null, pay: [手札] }     開発（null は置かない）
 *   settle { card|null, pay: [手札], colonyShip?: 場札, tactics?: [場札], payMilitary?: true }
 *   trade { good: 世界 }                   交易（消費・交易を選んだ人）
 *   consume { use: 番号, goods?: [世界], cards?: [手札], number?: 数 } / consume { done: true }
 *   windfall { world }                     ウィンドフォールの世界に商品を置く
 *   discard { cards }                      手札の上限（10 枚）を超えた分を捨てる
 */

import { CARD_IDS, cardOf, keyOf, START_WORLDS, TRADE_VALUE } from './cards.js';
import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const HAND_LIMIT = 10;
export const TABLEAU_END = 12;
export const CHIPS_PER_PLAYER = 12;

export const ACTIONS = ['explore5', 'explore1', 'develop', 'develop2', 'settle', 'settle2', 'trade', 'vp2', 'produce'];
export const ACTION_NAMES = {
    explore5: '探索 +5', explore1: '探索 +1+1', develop: '開発', develop2: '開発（2枚目）', settle: '入植', settle2: '入植（2枚目）',
    trade: '消費：交易', vp2: '消費：勝利点2倍', produce: '生産'
};
// 段階の順と、その段階を起こす行動
export const PHASE_ORDER = [
    { phase: 'explore', actions: ['explore5', 'explore1'] },
    { phase: 'develop', actions: ['develop'] },
    { phase: 'develop2', actions: ['develop2'] },
    { phase: 'settle', actions: ['settle'] },
    { phase: 'settle2', actions: ['settle2'] },
    { phase: 'consume', actions: ['trade', 'vp2'] },
    { phase: 'produce', actions: ['produce'] }
];
export const PHASE_NAMES = { explore: '探索', develop: '開発', develop2: '開発', settle: '入植', settle2: '入植', consume: '消費', produce: '生産' };
const PHASE_NUMBER = { explore: 1, develop: 2, develop2: 2, settle: 3, settle2: 3, consume: 4, produce: 5 };

const GOOD_CODE = { NOVELTY: 'novelty', RARE: 'rare', GENE: 'gene', ALIEN: 'alien' };
const has = (power, code) => power.code.includes(code);

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, advanced（2 人の上級ルール） }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`${MIN_PLAYERS}〜${MAX_PLAYERS}人で遊びます`);
        const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
        this.options = { ...options, seed, advanced: !!options.advanced && players.length === 2 };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({ id, name: p.name, isCPU: !!p.isCPU, hand: [], tableau: [], goods: [], chips: 0 }));
        this.pool = CHIPS_PER_PLAYER * players.length;
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.round = 0;
        this.phase = 'start';
        this.pending = players.map(() => null);
        this.chosen = players.map(() => null);   // このラウンドに選んだ行動（全員がそろうまでは公開しない）
        this.revealed = false;
        this.choices = players.map(() => null);  // 開発・入植で選んだ中身（全員がそろってから行う）
        this.phases = [];
        this.winner = null;
        this.scores = null;
        this.lastError = null;
        this.setup();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    emit(event) {
        this.eventSeq++;
        this.events.push({ seq: this.eventSeq, round: this.round, ...event });
    }

    isOver() {
        return this.phase === 'end';
    }

    // ---------- 準備 ----------

    setup() {
        const starts = shuffle([...START_WORLDS], this.random);
        const startIds = new Set(this.players.map((_, i) => starts[i]));
        this.deck = shuffle(CARD_IDS.filter(id => !startIds.has(id)), this.random);
        this.discardPile = [];
        this.players.forEach((p, i) => this.place(i, starts[i]));
        this.players.forEach((p, i) => this.draw(i, 6));
        this.players.forEach((p, i) => { this.pending[i] = { kind: 'startDiscard', count: 2 }; });
    }

    draw(seat, n) {
        const got = [];
        for (let i = 0; i < n; i++) {
            if (!this.deck.length) {
                if (!this.discardPile.length) break;
                this.deck = shuffle(this.discardPile, this.random);
                this.discardPile = [];
                this.emit({ type: 'reshuffle' });
            }
            got.push(this.deck.pop());
        }
        this.players[seat].hand.push(...got);
        return got;
    }

    drawFor(seat, n, reason) {
        if (n <= 0) return;
        const got = this.draw(seat, n);
        if (got.length) this.emit({ type: 'draw', seat, n: got.length, reason });
    }

    place(seat, id) {
        const p = this.players[seat];
        p.tableau.push(id);
        // ウィンドフォールの世界は、置いたときに商品が 1 つ載る
        if (cardOf(id).flags?.includes('windfall')) p.goods.push(id);
    }

    discardFromHand(seat, ids) {
        const p = this.players[seat];
        for (const id of ids) p.hand.splice(p.hand.indexOf(id), 1);
        this.discardPile.push(...ids);
    }

    gainVp(seat, n, reason) {
        if (n <= 0) return;
        this.players[seat].chips += n;
        this.pool -= n;
        this.emit({ type: 'vp', seat, n, reason });
    }

    chose(seat, action) {
        return this.chosen[seat]?.includes(action) ?? false;
    }

    // ---------- 力 ----------

    powers(seat, phase) {
        const list = [];
        for (const id of this.players[seat].tableau) {
            (cardOf(id).powers ?? []).forEach((power, index) => {
                if (power.phase === phase) list.push({ card: id, index, power });
            });
        }
        return list;
    }

    goodOf(world) {
        return cardOf(world).good ?? null;
    }

    // 世界に対する軍事力（種類を限る力は、その世界のときだけ）
    military(seat, world = null, extra = 0) {
        const c = world ? cardOf(world) : null;
        let total = extra;
        for (const { power } of this.powers(seat, 3)) {
            if (!has(power, 'EXTRA_MILITARY') || has(power, 'DISCARD')) continue;
            if (has(power, 'RARE') && c?.good !== 'rare') continue;
            if (has(power, 'ALIEN') && c?.good !== 'alien') continue;
            if (has(power, 'AGAINST_REBEL') && !(c?.flags?.includes('rebel') && c?.flags?.includes('military'))) continue;
            total += power.value;
        }
        return total;
    }

    // 種類を限らない軍事力（表示と得点用）
    baseMilitary(seat) {
        return this.powers(seat, 3).filter(({ power }) => power.code.length === 1 && power.code[0] === 'EXTRA_MILITARY').reduce((s, { power }) => s + power.value, 0);
    }

    developCost(seat, id, phase = this.phase) {
        let cost = cardOf(id).cost;
        for (const { power } of this.powers(seat, 2)) if (has(power, 'REDUCE')) cost -= power.value;
        if (this.chose(seat, phase === 'develop2' ? 'develop2' : 'develop')) cost -= 1;
        return Math.max(0, cost);
    }

    // 入植の費用。払うときは手札の枚数、軍事の世界を力で取るときは null
    settleCost(seat, id, { colonyShip = false, payMilitary = false } = {}) {
        const c = cardOf(id);
        const military = c.flags?.includes('military');
        if (military && !payMilitary) return null;
        let cost = c.cost;
        for (const { power } of this.powers(seat, 3)) {
            if (!has(power, 'REDUCE') || has(power, 'DISCARD')) continue;
            if (has(power, 'RARE') && c.good !== 'rare') continue;
            if (has(power, 'ALIEN') && c.good !== 'alien') continue;
            cost -= power.value;
        }
        if (payMilitary) cost -= this.powers(seat, 3).filter(({ power }) => has(power, 'PAY_MILITARY')).reduce((m, { power }) => Math.max(m, power.value), 0);
        if (colonyShip && c.good !== 'alien') cost = 0;
        return Math.max(0, cost);
    }

    canPayMilitary(seat, id) {
        const c = cardOf(id);
        return c.flags?.includes('military') && c.good !== 'alien' && this.powers(seat, 3).some(({ power }) => has(power, 'PAY_MILITARY'));
    }

    // ---------- 操作 ----------

    applyCommand(seat, command) {
        this.lastError = null;
        const error = this.check(seat, command);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.commands.push({ seat, command: structuredClone(command) });
        this.execute(seat, command);
        this.advance();
        return true;
    }

    check(seat, command) {
        if (this.isOver()) return 'ゲームは終わっています';
        if (!command || typeof command !== 'object') return '操作が正しくありません';
        const d = this.pending[seat];
        if (!d) return 'いまは選ぶ番ではありません';
        const handler = {
            startDiscard: () => this.checkDiscard(seat, command, d),
            discard: () => this.checkDiscard(seat, command, d),
            action: () => this.checkAction(seat, command),
            explore: () => this.checkExplore(seat, command, d),
            develop: () => this.checkDevelop(seat, command),
            settle: () => this.checkSettle(seat, command),
            trade: () => this.checkTrade(seat, command, d),
            consume: () => this.checkConsume(seat, command, d),
            windfall: () => (d.candidates.includes(command.world) ? null : 'その世界には置けません')
        }[d.kind];
        if (command.type !== d.kind) return 'いまはその操作はできません';
        return handler();
    }

    execute(seat, command) {
        const d = this.pending[seat];
        ({
            startDiscard: () => this.doDiscard(seat, command),
            discard: () => this.doDiscard(seat, command),
            action: () => this.doAction(seat, command),
            explore: () => this.doExplore(seat, command, d),
            develop: () => { this.choices[seat] = command; this.pending[seat] = null; },
            settle: () => { this.choices[seat] = command; this.pending[seat] = null; },
            trade: () => this.doTrade(seat, command),
            consume: () => this.doConsume(seat, command, d),
            windfall: () => this.doWindfall(seat, command, d)
        })[d.kind]();
    }

    validCards(list, pool, n = null) {
        if (!Array.isArray(list)) return false;
        if (n !== null && list.length !== n) return false;
        if (new Set(list).size !== list.length) return false;
        return list.every(id => pool.includes(id));
    }

    // 手札を捨てる（最初の 2 枚・手札の上限）
    checkDiscard(seat, command, d) {
        return this.validCards(command.cards, this.players[seat].hand, d.count) ? null : `手札から${d.count}枚を選んでください`;
    }

    doDiscard(seat, command) {
        this.discardFromHand(seat, command.cards);
        if (this.phase === 'roundEnd') this.emit({ type: 'handLimit', seat, n: command.cards.length });
        this.pending[seat] = null;
    }

    actionChoices() {
        return this.options.advanced ? ACTIONS : ACTIONS.filter(a => a !== 'develop2' && a !== 'settle2');
    }

    checkAction(seat, command) {
        const n = this.options.advanced ? 2 : 1;
        const list = command.actions;
        if (!Array.isArray(list) || list.length !== n || new Set(list).size !== n) return `行動を${n}つ選んでください`;
        if (!list.every(a => this.actionChoices().includes(a))) return 'その行動は選べません';
        return null;
    }

    doAction(seat, command) {
        this.chosen[seat] = [...command.actions];
        this.pending[seat] = null;
    }

    checkExplore(seat, command, d) {
        const n = Math.min(d.keep, d.drawn.length);
        return this.validCards(command.keep, d.drawn, n) ? null : `${n}枚を選んでください`;
    }

    doExplore(seat, command, d) {
        const p = this.players[seat];
        const rest = d.drawn.filter(id => !command.keep.includes(id));
        p.hand = p.hand.filter(id => !rest.includes(id));
        this.discardPile.push(...rest);
        this.pending[seat] = null;
    }

    checkDevelop(seat, command) {
        const p = this.players[seat];
        if (command.card === null) return null;
        const c = p.hand.includes(command.card) ? cardOf(command.card) : null;
        if (!c || c.type !== 'dev') return '手札の開発を選んでください';
        if (p.tableau.some(id => keyOf(id) === keyOf(command.card))) return '同じ開発は 2 枚置けません';
        const cost = this.developCost(seat, command.card);
        const rest = p.hand.filter(id => id !== command.card);
        if (!this.validCards(command.pay, rest, cost)) return `ほかの手札を${cost}枚捨てて払います`;
        return null;
    }

    // 入植の中身を確かめる。使う場札（植民船・新戦術）も含めて
    checkSettle(seat, command) {
        const p = this.players[seat];
        if (command.card === null) return null;
        const c = p.hand.includes(command.card) ? cardOf(command.card) : null;
        if (!c || c.type !== 'world') return '手札の世界を選んでください';
        const tactics = command.tactics ?? [];
        if (!this.validCards(tactics, p.tableau) || !tactics.every(id => this.powersOfCard(id).some(pw => pw.phase === 3 && has(pw, 'DISCARD') && has(pw, 'EXTRA_MILITARY')))) return '新戦術が正しくありません';
        const colonyShip = command.colonyShip ?? null;
        if (colonyShip !== null && !(p.tableau.includes(colonyShip) && this.powersOfCard(colonyShip).some(pw => has(pw, 'REDUCE_ZERO')))) return '植民船が正しくありません';
        if (colonyShip !== null && c.good === 'alien') return '植民船は異星の世界には使えません';
        const military = c.flags?.includes('military');
        const payMilitary = !!command.payMilitary;
        if (payMilitary && !this.canPayMilitary(seat, command.card)) return 'この軍事の世界は手札で払えません';
        if (colonyShip !== null && military && !payMilitary) return '植民船は軍事の世界には使えません';
        const rest = p.hand.filter(id => id !== command.card);
        if (military && !payMilitary) {
            if (colonyShip !== null) return '植民船は使えません';
            const strength = this.military(seat, command.card, 3 * tactics.length);
            if (strength < c.cost) return `軍事力が足りません（${strength}／${c.cost}）`;
            if ((command.pay ?? []).length) return '軍事の世界は手札を払いません';
            return null;
        }
        if (tactics.length) return '新戦術は軍事の世界を取るときだけ使えます';
        const cost = this.settleCost(seat, command.card, { colonyShip: colonyShip !== null, payMilitary });
        if (!this.validCards(command.pay ?? [], rest, cost)) return `ほかの手札を${cost}枚捨てて払います`;
        return null;
    }

    powersOfCard(id) {
        return cardOf(id).powers ?? [];
    }

    removeFromTableau(seat, id) {
        const p = this.players[seat];
        p.tableau.splice(p.tableau.indexOf(id), 1);
        p.goods = p.goods.filter(g => g !== id);
        this.discardPile.push(id);
    }

    // ---------- 段階の進行 ----------

    advance() {
        while (this.pending.every(d => d === null) && !this.isOver()) this.nextStep();
    }

    nextStep() {
        switch (this.phase) {
            case 'start':
                return this.startRound();
            case 'action':
                return this.reveal();
            case 'develop': case 'develop2':
                this.resolveDevelop();
                return this.nextPhase();
            case 'settle': case 'settle2':
                this.resolveSettle();
                return this.nextPhase();
            case 'produce':
                this.finishProduce();
                return this.nextPhase();
            case 'roundEnd':
                return this.endRound();
            default:
                return this.nextPhase();
        }
    }

    startRound() {
        this.round++;
        this.phase = 'action';
        this.chosen = this.players.map(() => null);
        this.revealed = false;
        this.emit({ type: 'round' });
        this.players.forEach((p, i) => { this.pending[i] = { kind: 'action', count: this.options.advanced ? 2 : 1 }; });
    }

    reveal() {
        this.revealed = true;
        this.emit({ type: 'reveal', actions: this.chosen.map(a => [...a]) });
        const all = new Set(this.chosen.flat());
        this.phases = PHASE_ORDER.filter(p => p.actions.some(a => all.has(a))).map(p => p.phase);
        this.nextPhase();
    }

    nextPhase() {
        const phase = this.phases.shift();
        if (!phase) return this.beginRoundEnd();
        this.phase = phase;
        this.choices = this.players.map(() => null);
        this.emit({ type: 'phase', phase });
        ({
            explore: () => this.beginExplore(),
            develop: () => this.beginDevelop(),
            develop2: () => this.beginDevelop(),
            settle: () => this.beginSettle(),
            settle2: () => this.beginSettle(),
            consume: () => this.beginConsume(),
            produce: () => this.beginProduce()
        })[phase]();
    }

    // 探索：2 枚引いて 1 枚残す。+5 は 5 枚多く引く、+1+1 は 1 枚多く引いて 1 枚多く残す。カードの力で増える
    beginExplore() {
        this.players.forEach((p, seat) => {
            let draw = 2;
            let keep = 1;
            for (const { power } of this.powers(seat, 1)) {
                if (has(power, 'DRAW')) draw += power.value;
                if (has(power, 'KEEP')) keep += power.value;
            }
            if (this.chose(seat, 'explore5')) draw += 5;
            if (this.chose(seat, 'explore1')) { draw += 1; keep += 1; }
            const drawn = this.draw(seat, draw);
            this.emit({ type: 'explore', seat, draw: drawn.length, keep: Math.min(keep, drawn.length) });
            this.pending[seat] = drawn.length ? { kind: 'explore', drawn, keep } : null;
        });
    }

    beginDevelop() {
        this.players.forEach((p, seat) => {
            for (const { card, power } of this.powers(seat, 2)) if (has(power, 'DRAW') && !has(power, 'DRAW_AFTER')) this.drawFor(seat, power.value, card);
            this.pending[seat] = { kind: 'develop', bonus: this.chose(seat, this.phase === 'develop2' ? 'develop2' : 'develop') };
        });
    }

    resolveDevelop() {
        this.players.forEach((p, seat) => {
            const c = this.choices[seat];
            if (!c || c.card === null) return;
            this.discardFromHand(seat, c.pay);
            p.hand.splice(p.hand.indexOf(c.card), 1);
            this.place(seat, c.card);
            this.emit({ type: 'develop', seat, card: c.card, paid: c.pay.length });
            for (const { card, power } of this.powers(seat, 2)) if (has(power, 'DRAW_AFTER')) this.drawFor(seat, power.value, card);
        });
    }

    beginSettle() {
        this.players.forEach((p, seat) => {
            this.pending[seat] = { kind: 'settle', bonus: this.chose(seat, this.phase === 'settle2' ? 'settle2' : 'settle') };
        });
    }

    resolveSettle() {
        this.players.forEach((p, seat) => {
            const c = this.choices[seat];
            if (!c || c.card === null) return;
            for (const id of c.tactics ?? []) this.removeFromTableau(seat, id);
            if (c.colonyShip) this.removeFromTableau(seat, c.colonyShip);
            this.discardFromHand(seat, c.pay ?? []);
            p.hand.splice(p.hand.indexOf(c.card), 1);
            this.place(seat, c.card);
            const military = cardOf(c.card).flags?.includes('military') && !c.payMilitary;
            this.emit({ type: 'settle', seat, card: c.card, paid: (c.pay ?? []).length, military, used: [...(c.tactics ?? []), ...(c.colonyShip ? [c.colonyShip] : [])] });
            for (const { card, power } of this.powers(seat, 3)) if (has(power, 'DRAW_AFTER')) this.drawFor(seat, power.value, card);
            if (this.chose(seat, this.phase === 'settle2' ? 'settle2' : 'settle')) this.drawFor(seat, 1, 'settleBonus');
        });
    }

    // ---------- 消費 ----------

    beginConsume() {
        this.used = this.players.map(() => new Set());
        this.players.forEach((p, seat) => {
            for (const { card, power } of this.powers(seat, 4)) if (power.code.length === 1 && power.code[0] === 'DRAW') this.drawFor(seat, power.value, card);
            this.pending[seat] = this.chose(seat, 'trade') && p.goods.length ? { kind: 'trade' } : this.consumeDecision(seat);
        });
    }

    tradePrice(seat, world, { bonus = true } = {}) {
        const kind = this.goodOf(world);
        let price = TRADE_VALUE[kind];
        if (!bonus) return price;
        for (const { card, power } of this.powers(seat, 4)) {
            if (has(power, 'TRADE_ANY')) price += power.value;
            if (has(power, 'TRADE_THIS') && card === world) price += power.value;
            for (const [code, k] of Object.entries(GOOD_CODE)) if (has(power, `TRADE_${code}`) && kind === k) price += power.value;
        }
        return price;
    }

    checkTrade(seat, command, d) {
        return this.players[seat].goods.includes(command.good) ? null : '商品のある世界を選んでください';
    }

    sell(seat, world, bonus) {
        const price = this.tradePrice(seat, world, { bonus });
        this.players[seat].goods = this.players[seat].goods.filter(g => g !== world);
        this.emit({ type: 'trade', seat, world, n: price });
        this.draw(seat, price);
    }

    doTrade(seat, command) {
        this.sell(seat, command.good, true);
        this.pending[seat] = this.consumeDecision(seat);
    }

    // 使える消費の力の一覧。商品を使う力は必ず使う（順は選べる）。手札を捨てる力・賭博・交易の力は使わなくてよい
    consumeOptions(seat) {
        const p = this.players[seat];
        const goods = p.goods;
        const kinds = new Set(goods.map(g => this.goodOf(g)));
        const options = [];
        for (const { card, index, power } of this.powers(seat, 4)) {
            const key = `${card}:${index}`;
            if (this.used[seat].has(key)) continue;
            const code = power.code;
            const kind = Object.entries(GOOD_CODE).find(([c]) => code.includes(`CONSUME_${c}`))?.[1] ?? null;
            const eligible = goods.filter(g => code.includes('CONSUME_ANY') || this.goodOf(g) === kind);
            const base = { use: options.length, card, index, power };
            if (code.includes('CONSUME_TWO')) {
                if (eligible.length >= 2) options.push({ ...base, need: 2, kind, optional: false });
            } else if (code.includes('CONSUME_3_DIFF')) {
                if (kinds.size >= 3) options.push({ ...base, need: 3, diff: true, optional: false });
            } else if (code.includes('CONSUME_ALL')) {
                if (goods.length) options.push({ ...base, need: goods.length, all: true, optional: false });
            } else if (code.includes('CONSUME_ANY') || kind) {
                if (eligible.length) options.push({ ...base, need: Math.min(power.times ?? 1, eligible.length), kind, optional: false });
            } else if (code.includes('DISCARD_HAND')) {
                if (p.hand.length) options.push({ ...base, discard: Math.min(power.times ?? 1, p.hand.length), optional: true });
            } else if (code.includes('DRAW_LUCKY')) {
                options.push({ ...base, lucky: true, optional: true });
            } else if (code.includes('TRADE_ACTION')) {
                if (goods.length) options.push({ ...base, trade: true, noBonus: code.includes('TRADE_NO_BONUS'), optional: true });
            }
        }
        return options;
    }

    consumeDecision(seat) {
        const options = this.consumeOptions(seat);
        if (!options.length) return null;
        return { kind: 'consume', options, mustUse: options.some(o => !o.optional) };
    }

    checkConsume(seat, command, d) {
        if (command.done) return d.mustUse ? '商品を使う消費の力が残っています' : null;
        const o = d.options[command.use];
        if (!o) return '消費の力を選んでください';
        const p = this.players[seat];
        if (o.discard) {
            const cards = command.cards ?? [];
            if (!this.validCards(cards, p.hand) || cards.length < 1 || cards.length > o.discard) return `手札を1〜${o.discard}枚選んでください`;
            return null;
        }
        if (o.lucky) return Number.isInteger(command.number) && command.number >= 1 && command.number <= 7 ? null : '1〜7の数を選んでください';
        const goods = command.goods ?? [];
        if (o.trade) return goods.length === 1 && p.goods.includes(goods[0]) ? null : '売る商品を選んでください';
        if (!this.validCards(goods, p.goods, o.need)) return `商品を${o.need}つ選んでください`;
        if (o.kind && !goods.every(g => this.goodOf(g) === o.kind)) return 'その種類の商品ではありません';
        if (o.diff && new Set(goods.map(g => this.goodOf(g))).size !== 3) return '違う種類の商品を3つ選んでください';
        return null;
    }

    doConsume(seat, command, d) {
        if (command.done) {
            this.pending[seat] = null;
            return;
        }
        const o = d.options[command.use];
        const p = this.players[seat];
        this.used[seat].add(`${o.card}:${o.index}`);
        const power = o.power;
        const mult = has(power, 'GET_VP') && this.chose(seat, 'vp2') ? 2 : 1;
        if (o.discard) {
            this.discardFromHand(seat, command.cards);
            this.emit({ type: 'consumeDiscard', seat, card: o.card, n: command.cards.length });
            this.gainVp(seat, power.value * command.cards.length * mult, o.card);
        } else if (o.lucky) {
            const [id] = this.draw(seat, 1);
            if (id) {
                const hit = cardOf(id).cost === command.number;
                if (!hit) this.discardFromHand(seat, [id]);
                this.emit({ type: 'lucky', seat, number: command.number, card: id, hit });
            }
        } else if (o.trade) {
            this.sell(seat, command.goods[0], !o.noBonus);
        } else {
            const goods = command.goods;
            p.goods = p.goods.filter(g => !goods.includes(g));
            const times = o.all ? goods.length - 1 : (has(power, 'CONSUME_TWO') || has(power, 'CONSUME_3_DIFF')) ? 1 : goods.length;
            this.emit({ type: 'consume', seat, card: o.card, goods: [...goods] });
            if (has(power, 'GET_VP')) this.gainVp(seat, power.value * times * mult, o.card);
            if (has(power, 'GET_CARD')) this.drawFor(seat, power.value * times, o.card);
            if (has(power, 'GET_2_CARD')) this.drawFor(seat, 2 * times, o.card);
        }
        this.pending[seat] = this.consumeDecision(seat);
    }

    // ---------- 生産 ----------

    beginProduce() {
        this.produced = this.players.map(() => []);
        this.windfallQueue = this.players.map(() => []);
        this.players.forEach((p, seat) => {
            for (const { card, power } of this.powers(seat, 5)) {
                if (has(power, 'PRODUCE') && !p.goods.includes(card)) {
                    p.goods.push(card);
                    this.produced[seat].push(card);
                }
            }
            for (const { card, power } of this.powers(seat, 5)) {
                const code = power.code.find(c => c.startsWith('WINDFALL_'));
                if (code) this.windfallQueue[seat].push({ source: card, kind: code === 'WINDFALL_ANY' ? null : GOOD_CODE[code.slice(9)] });
            }
            if (this.chose(seat, 'produce')) this.windfallQueue[seat].push({ source: 'produceBonus', kind: null });
            if (this.produced[seat].length) this.emit({ type: 'produce', seat, worlds: [...this.produced[seat]] });
            this.pending[seat] = this.nextWindfall(seat);
        });
    }

    windfallCandidates(seat, kind) {
        const p = this.players[seat];
        return p.tableau.filter(id => cardOf(id).flags?.includes('windfall') && !p.goods.includes(id) && (kind === null || cardOf(id).good === kind));
    }

    // 次のウィンドフォール。置ける世界が 1 つだけなら、その場で置く
    nextWindfall(seat) {
        while (this.windfallQueue[seat].length) {
            const w = this.windfallQueue[seat].shift();
            const candidates = this.windfallCandidates(seat, w.kind);
            if (!candidates.length) continue;
            if (candidates.length === 1) {
                this.putWindfall(seat, candidates[0], w.source);
                continue;
            }
            return { kind: 'windfall', source: w.source, good: w.kind, candidates };
        }
        return null;
    }

    putWindfall(seat, world, source) {
        this.players[seat].goods.push(world);
        this.produced[seat].push(world);
        this.emit({ type: 'windfall', seat, world, source });
    }

    doWindfall(seat, command, d) {
        this.putWindfall(seat, command.world, d.source);
        this.pending[seat] = this.nextWindfall(seat);
    }

    // 生産のあとに引く力（作った商品を数える）
    finishProduce() {
        const count = (seat, kind) => this.produced[seat].filter(w => this.goodOf(w) === kind).length;
        this.players.forEach((p, seat) => {
            for (const { card, power } of this.powers(seat, 5)) {
                const code = power.code;
                let n = 0;
                if (code.includes('DRAW_IF')) n = this.produced[seat].includes(card) ? power.value : 0;
                else if (code.includes('DRAW_DIFFERENT')) n = new Set(this.produced[seat].map(w => this.goodOf(w))).size * power.value;
                else if (code.includes('DRAW_EACH_NOVELTY')) n = count(seat, 'novelty') * power.value;
                else if (code.includes('DRAW_EACH_ALIEN')) n = count(seat, 'alien') * power.value;
                else if (code.includes('DRAW_WORLD_GENE')) n = p.tableau.filter(id => cardOf(id).good === 'gene').length * power.value;
                else if (code.includes('DRAW_MOST_RARE')) n = this.players.every((o, i) => i === seat || count(i, 'rare') < count(seat, 'rare')) ? power.value : 0;
                else if (code.length === 1 && code[0] === 'DRAW') n = power.value;
                this.drawFor(seat, n, card);
            }
        });
    }

    // ---------- ラウンドの終わり ----------

    beginRoundEnd() {
        this.phase = 'roundEnd';
        this.players.forEach((p, seat) => {
            const over = p.hand.length - HAND_LIMIT;
            this.pending[seat] = over > 0 ? { kind: 'discard', count: over } : null;
        });
    }

    endRound() {
        if (this.players.some(p => p.tableau.length >= TABLEAU_END) || this.pool <= 0) return this.finish();
        this.phase = 'start';
    }

    // ---------- 得点 ----------

    bonusMatch(b, c, seat) {
        const isWorld = c.type === 'world';
        const consumePowers = (c.powers ?? []).filter(p => p.phase === 4);
        const isTrade = p => p.code.some(code => code.startsWith('TRADE_'));
        const production = kind => isWorld && c.good === kind && !c.flags?.includes('windfall');
        const windfall = kind => isWorld && c.good === kind && c.flags?.includes('windfall');
        switch (b.type) {
            case 'NOVELTY_PRODUCTION': return production('novelty');
            case 'RARE_PRODUCTION': return production('rare');
            case 'GENE_PRODUCTION': return production('gene');
            case 'ALIEN_PRODUCTION': return production('alien');
            case 'NOVELTY_WINDFALL': return windfall('novelty');
            case 'RARE_WINDFALL': return windfall('rare');
            case 'GENE_WINDFALL': return windfall('gene');
            case 'ALIEN_WINDFALL': return windfall('alien');
            case 'MILITARY': return isWorld && !!c.flags?.includes('military');
            case 'REBEL_MILITARY': return isWorld && !!c.flags?.includes('military') && !!c.flags?.includes('rebel');
            case 'NAME': return c.key === b.name;
            case 'ALIEN_FLAG': return !!c.flags?.includes('alien');
            case 'DEVEL_EXPLORE': return !isWorld && (c.powers ?? []).some(p => p.phase === 1);
            case 'WORLD_EXPLORE': return isWorld && (c.powers ?? []).some(p => p.phase === 1);
            case 'DEVEL_TRADE': return !isWorld && consumePowers.some(isTrade);
            case 'WORLD_TRADE': return isWorld && consumePowers.some(isTrade);
            case 'DEVEL_CONSUME': return !isWorld && consumePowers.some(p => !isTrade(p));
            case 'WORLD_CONSUME': return isWorld && consumePowers.some(p => !isTrade(p));
            case 'SIX_DEVEL': return !isWorld && c.cost === 6;
            case 'DEVEL': return !isWorld;
            case 'WORLD': return isWorld;
            default: return false;
        }
    }

    bonusScore(seat, id) {
        const p = this.players[seat];
        const bonus = cardOf(id).bonus ?? [];
        let total = 0;
        for (const b of bonus) {
            if (b.type === 'THREE_VP') total += Math.floor(p.chips / 3) * b.value;
            if (b.type === 'TOTAL_MILITARY') total += this.baseMilitary(seat) * b.value;
        }
        for (const other of p.tableau) {
            const b = bonus.find(x => this.bonusMatch(x, cardOf(other), seat));
            if (b) total += b.value;
        }
        return total;
    }

    score(seat) {
        const p = this.players[seat];
        const cards = p.tableau.reduce((s, id) => s + cardOf(id).vp, 0);
        const bonus = p.tableau.reduce((s, id) => s + this.bonusScore(seat, id), 0);
        return { chips: p.chips, cards, bonus, total: p.chips + cards + bonus, tiebreak: p.goods.length + p.hand.length };
    }

    finish() {
        this.phase = 'end';
        this.pending = this.players.map(() => null);
        this.scores = this.players.map((p, seat) => this.score(seat));
        const best = Math.max(...this.scores.map(s => s.total));
        const top = this.scores.map((s, i) => i).filter(i => this.scores[i].total === best);
        const tb = Math.max(...top.map(i => this.scores[i].tiebreak));
        const winners = top.filter(i => this.scores[i].tiebreak === tb);
        this.winner = winners.length === 1 ? winners[0] : null;
        this.winners = winners;
        this.emit({ type: 'end', winners, scores: this.scores });
    }
}
