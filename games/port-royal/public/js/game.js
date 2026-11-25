/**
 * ポートロイヤルの進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びはシードから決まる）
 *
 * ルール（Pegasus Spiele の英語版ルールブック）
 * - 120枚。カードの裏はコインで、コインを得るときは山から裏のまま取る（表は見ない）。払ったコインは捨て札へ
 *   5人用の遠征は、5人のときだけ最初から場に出し、それ以外は使わない。各自3コインから
 * - 手番は2つの段階
 *   1. 発見：山から1枚ずつ港にめくる。めくるたびに、続けるか止めるかを決める（最初の1枚は必ずめくる）
 *      船：港に置くか、剣（船乗り・海賊）が船の剣以上なら撃退して捨てる（ドクロの船は撃退できない）
 *      港にある船と同じ色の船を撃退しなかったら失敗：港を全部捨て、手番は終わり（道化を持つ人は1コイン）
 *      遠征：港とは別の場に置く。手番の人は、自分の手番の間いつでも、条件の人物を捨てて遠征を取れる（点とコイン）
 *      税金：12コイン以上の人は半分（切り捨て）を捨て、そのあと剣が最も多い人か、点が最も少ない人が1コイン（同点はみな）
 *   2. 取引と雇用：港の船の色の数が 0〜3 なら1枚、4なら2枚、5なら3枚を、手番の人が1枚ずつ取る
 *      船を取ればそのコインを得て（同じ色の商人1人につき+1）、人物を取れば費用を払って雇う
 *      そのあと、ほかの人も時計回りに1枚ずつ取れる（手番の人に1コイン払う。船ならそのコインから払ってよい）。残りは捨てる
 * - 人物の力は重なる。マドモアゼルは雇う費用を1下げる、総督は取れる枚数を1増やす、
 *   提督は取る番に港が5枚以上なら2コイン、道化は手番でない人が取る番に港が空なら1コイン
 * - 誰かが12点以上になったら、その巡の終わり（最初の手番の人の右隣の手番のあと）で終わる
 *   点の多い人の勝ち。同点はコインの多い人、それも同じなら同点の人がみな勝ち
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 取引と雇用では、取れる枚数より少なく取って終えてよい（手番の人も、取らずに終えてよい）
 * - 遠征に出す人物は、条件を満たすうち、点の低いものから自動で選ぶ（同じ点なら、何でもよい人物は最後に）
 * - 山も捨て札も尽きたら、それ以上のコインは得られない（失敗のときと同じく、めくれなければ止める）
 * - 手番の始めに山も捨て札もない（カードが全部コインとして持たれている）ときは、誰もめくれないので、その時点で終わり（勝ち負けはふだんどおり）
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, CARD_COUNT, FIVE_PLAYER_EXPEDITION, SHIP_COLORS, WIN_POINTS, TAX_LIMIT, STARTING_COINS } from './cards.js';

export { CARDS, SHIP_COLORS };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const MAX_LOGS = 300;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    draw: [], stop: [], repel: [], keep: [], claim: ['card'], take: ['card'], pass: []
};

// ---- 持ち物を数える（状態を変えない。CPU と画面でも使う） ----

const persons = (player) => player.display.map(id => CARDS[id]);
export const countRole = (player, role) => persons(player).filter(c => c.role === role).length;
export const swordsOf = (player) => persons(player).reduce((n, c) => n + (c.swords ?? 0), 0);
export const pointsOf = (player) => persons(player).reduce((n, c) => n + c.vp, 0) + player.expeditions.reduce((n, id) => n + CARDS[id].vp, 0);
export const traderBonus = (player, color) => persons(player).filter(c => c.role === 'trader' && c.color === color).length;
export const hireCost = (player, id) => Math.max(0, CARDS[id].cost - countRole(player, 'mademoiselle'));

// 港の船の色の数から、手番の人が取れる枚数
export function baseTakes(harbor) {
    const colors = new Set(harbor.map(id => CARDS[id]).filter(c => c.kind === 'ship').map(c => c.color)).size;
    return colors >= 5 ? 3 : colors === 4 ? 2 : 1;
}

// 遠征に出す人物（条件を満たさなければ null）。点の低いものから、何でもよい人物（jack）は最後に
export function expeditionPayment(player, id) {
    const needs = CARDS[id].needs;
    const pool = player.display.map(pid => CARDS[pid]).filter(c => c.symbol).sort((a, b) => a.vp - b.vp || a.id - b.id);
    const used = new Set();
    for (const symbol of needs) {
        const exact = pool.find(c => !used.has(c.id) && c.symbol === symbol);
        const joker = pool.find(c => !used.has(c.id) && c.symbol === 'joker');
        const pick = exact ?? joker;
        if (!pick) return null;
        used.add(pick.id);
    }
    return [...used];
}

export default class Game {
    static isPerson(id) {
        return CARDS[id].kind === 'person';
    }

    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜5人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * players.length);
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        const n = players.length;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            coins: [], display: [], expeditions: []
        }));
        const ids = Array.from({ length: CARD_COUNT }, (_, i) => i).filter(id => id !== FIVE_PLAYER_EXPEDITION);
        this.deck = shuffle(ids, this.random);
        this.discardPile = [];
        this.harbor = [];
        this.expeditions = n === 5 ? [FIVE_PLAYER_EXPEDITION] : [];
        this.start = this.options.startPlayer;
        this.current = this.start;
        this.events = [];
        this.eventSeq = 0;
        this.logs = [];
        this.commands = [];
        this.lastError = null;
        this.players.forEach((_, seat) => this.gain(seat, STARTING_COINS, { quiet: true }));
        this.phase = 'discover';    // discover：めくる / repel：撃退するか決める / trade：取引と雇用 / end：終わり
        this.drawnThisTurn = 0;
        this.pendingShip = null;    // 撃退するか決めている船
        this.taker = null;          // 取引と雇用で、今取る人
        this.takeQueue = [];        // これから取る人
        this.takesLeft = 0;
        this.turn = 1;
        this.endTriggered = false;
        this.winners = [];
        this.log(`${this.players[this.start].name}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        if (this.isOver()) return [];
        return [this.phase === 'trade' ? this.taker : this.current];
    }

    get activePlayer() {
        return this.players[this.current];
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            discover: { draw: this.draw, stop: this.stop, claim: this.claim },
            repel: { repel: this.repel, keep: this.keep },
            trade: { take: this.take, pass: this.pass, claim: this.claim }
        }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = command[key]; });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 1. 発見 ----

    draw(seat) {
        if (!this.deck.length && !this.discardPile.length) return this.fail('山にカードがありません');
        const turn = this.turn;
        const id = this.drawCard();
        const card = CARDS[id];
        this.drawnThisTurn += 1;
        this.emit({ type: 'draw', seat, card: id });
        if (card.kind === 'expedition') {
            this.expeditions.push(id);
            this.log(`遠征が出た（${card.name}）`);
        } else if (card.kind === 'tax') {
            this.discardPile.push(id);
            this.tax(card);
        } else if (card.kind === 'person') {
            this.harbor.push(id);
            this.log(`${card.name}が港に来た`);
        } else {
            // 船：撃退できるなら選ぶ。できなければ港へ（同じ色なら失敗）
            if (this.canRepel(seat, id)) {
                this.pendingShip = id;
                this.phase = 'repel';
            } else {
                this.dock(id);
            }
        }
        // 山も捨て札も尽きたら、それ以上めくれないので止める
        if (this.turn === turn && this.phase === 'discover' && !this.deck.length && !this.discardPile.length) this.beginTrade();
        return true;
    }

    stop() {
        if (this.drawnThisTurn === 0) return this.fail('まず1枚めくります');
        this.beginTrade();
        return true;
    }

    canRepel(seat, id) {
        const card = CARDS[id];
        return card.kind === 'ship' && card.swords !== null && swordsOf(this.players[seat]) >= card.swords;
    }

    repel(seat) {
        const id = this.pendingShip;
        this.pendingShip = null;
        this.discardPile.push(id);
        this.phase = 'discover';
        this.emit({ type: 'repel', seat, card: id });
        this.log(`${this.players[seat].name}：${CARDS[id].name}を撃退`);
        return true;
    }

    keep() {
        const id = this.pendingShip;
        this.pendingShip = null;
        this.phase = 'discover';
        this.dock(id);
        return true;
    }

    // 船を港に置く。同じ色があれば失敗
    dock(id) {
        const card = CARDS[id];
        const clash = this.harbor.some(h => CARDS[h].kind === 'ship' && CARDS[h].color === card.color);
        this.harbor.push(id);
        if (!clash) {
            this.log(`${card.name}（${card.coins}コイン）が港に来た`);
            return;
        }
        this.log(`${card.name}が2隻目。${this.activePlayer.name}の手番は失敗`);
        this.emit({ type: 'bust', seat: this.current, card: id });
        this.discardPile.push(...this.harbor);
        this.harbor = [];
        this.players.forEach((p, seat) => {
            const jesters = countRole(p, 'jester');
            if (jesters) this.gain(seat, jesters, { reason: '道化' });
        });
        this.endTurn();
    }

    tax(card) {
        this.log(`税金（${card.bonus === 'swords' ? '剣の最も多い人' : '点の最も少ない人'}に1コイン）`);
        this.players.forEach((p, seat) => {
            if (p.coins.length >= TAX_LIMIT) {
                const lost = Math.floor(p.coins.length / 2);
                this.pay(seat, lost, null);
                this.log(`${p.name}は${lost}コインを失った`);
            }
        });
        const values = this.players.map(p => (card.bonus === 'swords' ? swordsOf(p) : pointsOf(p)));
        const target = card.bonus === 'swords' ? Math.max(...values) : Math.min(...values);
        values.forEach((v, seat) => { if (v === target) this.gain(seat, 1, { reason: '税金' }); });
        this.emit({ type: 'tax', bonus: card.bonus });
    }

    // ---- 遠征 ----

    claim(seat, { card }) {
        if (seat !== this.current) return this.fail('遠征は自分の手番に取ります');
        if (this.phase === 'trade' && this.taker !== this.current) return this.fail('今は遠征を取れません');
        if (!this.expeditions.includes(card)) return this.fail('その遠征はありません');
        const payment = expeditionPayment(this.players[seat], card);
        if (!payment) return this.fail('遠征の条件を満たしていません');
        const p = this.players[seat];
        p.display = p.display.filter(id => !payment.includes(id));
        this.discardPile.push(...payment);
        this.expeditions = this.expeditions.filter(id => id !== card);
        p.expeditions.push(card);
        this.emit({ type: 'claim', seat, card, discarded: payment });
        this.log(`${p.name}：遠征（${CARDS[card].name}）を果たした`);
        this.gain(seat, CARDS[card].coins, { reason: '遠征' });
        this.checkTrigger(seat);
        return true;
    }

    // ---- 2. 取引と雇用 ----

    beginTrade() {
        const n = this.players.length;
        this.phase = 'trade';
        this.baseTakes = baseTakes(this.harbor);
        this.takeQueue = Array.from({ length: n }, (_, k) => (this.current + k) % n);
        this.nextTaker();
    }

    // 次に取る人へ。取れる人がいなければ手番を終える
    nextTaker() {
        while (this.takeQueue.length) {
            const seat = this.takeQueue.shift();
            const p = this.players[seat];
            const active = seat === this.current;
            // 手番でない人は、港が空なら道化で1コイン（取ることはできない）
            if (!this.harbor.length) {
                if (!active && countRole(p, 'jester')) this.gain(seat, countRole(p, 'jester'), { reason: '道化' });
                continue;
            }
            this.taker = seat;
            this.takesLeft = (active ? this.baseTakes : 1) + countRole(p, 'governor');
            const admirals = countRole(p, 'admiral');
            if (admirals && this.harbor.length >= 5) this.gain(seat, admirals * 2, { reason: '提督' });
            if (!this.canTakeAny(seat)) continue;
            return;
        }
        this.discardPile.push(...this.harbor);
        this.harbor = [];
        this.taker = null;
        this.endTurn();
    }

    // そのカードを取れるか（手番でない人は、手番の人に1コイン払う。船ならそのコインから払ってよい）
    canTake(seat, id) {
        const card = CARDS[id];
        if (!this.harbor.includes(id)) return false;
        const p = this.players[seat];
        const fee = seat === this.current ? 0 : 1;
        if (card.kind === 'ship') return p.coins.length + this.shipIncome(p, id) >= fee;
        return p.coins.length >= hireCost(p, id) + fee;
    }

    canTakeAny(seat) {
        return this.harbor.some(id => this.canTake(seat, id));
    }

    shipIncome(player, id) {
        return CARDS[id].coins + traderBonus(player, CARDS[id].color);
    }

    take(seat, { card }) {
        if (!Number.isInteger(card) || !this.harbor.includes(card)) return this.fail('そのカードは港にありません');
        if (!this.canTake(seat, card)) return this.fail('コインが足りません');
        const p = this.players[seat];
        const c = CARDS[card];
        this.harbor = this.harbor.filter(id => id !== card);
        if (c.kind === 'ship') {
            const income = this.shipIncome(p, card);
            this.discardPile.push(card);
            this.gain(seat, income, { quiet: true });
            this.emit({ type: 'trade', seat, card, coins: income });
            this.log(`${p.name}：${c.name}で${income}コイン`);
        } else {
            const cost = hireCost(p, card);
            this.pay(seat, cost, null);
            p.display.push(card);
            this.emit({ type: 'hire', seat, card, cost });
            this.log(`${p.name}：${c.name}を雇った${cost ? `（${cost}コイン）` : ''}`);
            this.checkTrigger(seat);
        }
        if (seat !== this.current) this.pay(seat, 1, this.current);
        this.takesLeft -= 1;
        if (this.takesLeft <= 0 || !this.harbor.length || !this.canTakeAny(seat)) this.nextTaker();
        return true;
    }

    pass(seat) {
        this.log(`${this.players[seat].name}：取らない`);
        this.nextTaker();
        return true;
    }

    // ---- 手番の終わり ----

    checkTrigger(seat) {
        if (!this.endTriggered && pointsOf(this.players[seat]) >= WIN_POINTS) {
            this.endTriggered = true;
            this.emit({ type: 'trigger', seat });
            this.log(`${this.players[seat].name}が${WIN_POINTS}点に届いた。この巡で終わり`);
        }
    }

    endTurn() {
        const n = this.players.length;
        const last = (this.start + n - 1) % n;
        if (this.endTriggered && this.current === last) {
            this.finish();
            return;
        }
        this.current = (this.current + 1) % n;
        if (!this.deck.length && !this.discardPile.length) {
            this.log('山も捨て札もなくなったので、ここで終わり');
            this.finish();
            return;
        }
        this.phase = 'discover';
        this.drawnThisTurn = 0;
        this.turn += 1;
        this.emit({ type: 'turn', seat: this.current });
    }

    finish() {
        this.phase = 'end';
        this.taker = null;
        const points = this.players.map(pointsOf);
        const best = Math.max(...points);
        const tied = this.players.map((_, i) => i).filter(i => points[i] === best);
        const coins = Math.max(...tied.map(i => this.players[i].coins.length));
        this.winners = tied.filter(i => this.players[i].coins.length === coins);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(this.winners.length > 1 ? `${this.winners.map(i => this.players[i].name).join('と')}の勝ち（同点）` : `${this.players[this.winners[0]].name}の勝ち（${best}点）`);
    }

    // ---- コイン（山のカードを裏のまま持つ） ----

    drawCard() {
        if (!this.deck.length) {
            this.deck = shuffle(this.discardPile, this.random);
            this.discardPile = [];
            this.emit({ type: 'reshuffle' });
            this.log('捨て札を切って山にした');
        }
        return this.deck.pop();
    }

    gain(seat, amount, { reason = null, quiet = false } = {}) {
        let got = 0;
        for (let i = 0; i < amount && (this.deck.length || this.discardPile.length); i++) {
            this.players[seat].coins.push(this.drawCard());
            got += 1;
        }
        if (!got) return;
        this.emit({ type: 'coins', seat, delta: got });
        if (reason && !quiet) this.log(`${this.players[seat].name}：${reason}で${got}コイン`);
    }

    // 払う。to が null なら捨て札へ、席なら その人へ
    pay(seat, amount, to) {
        const p = this.players[seat];
        const moved = p.coins.splice(p.coins.length - Math.min(amount, p.coins.length));
        if (!moved.length) return;
        if (to === null) this.discardPile.push(...moved);
        else this.players[to].coins.push(...moved);
        this.emit({ type: 'coins', seat, delta: -moved.length });
        if (to !== null) this.emit({ type: 'coins', seat: to, delta: moved.length });
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
