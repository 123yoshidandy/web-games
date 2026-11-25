/**
 * スターレルム（基本セット・2人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札と交易デッキの順はシードから決まる）
 *
 * ルール（細かい点の決め方は README にも書く）
 * - 各自、スカウト8枚とバイパー2枚のデッキ、権威50。交易の列に5枚、エクスプローラー10枚
 * - 最初の人は手札3枚、次の人は5枚で始める。手番の終わりに、出した艦と手札を捨て札にして5枚引く（基地は残る）
 * - 手番：手札を出し（効果はすぐ使う）、交易で交易の列やエクスプローラーを獲得（捨て札へ）し、戦闘で相手の基地や権威を攻撃する
 * - 同盟の能力：同じ勢力のカードがほかに場（この手番に出した艦・自分の基地）にあれば使える。カードごとに1手番1回。満たしたらすぐ使う
 * - 廃棄の能力：場のカードを廃棄して使う（いつでも）。廃棄したエクスプローラーは山に戻る
 * - 基地は毎手番、手番の始めに効果を使う。前哨がある間は、相手はほかの基地も権威も攻撃できない
 * - 「相手は1枚捨てる」は、相手の次の手番の始めに、基地の効果より先に、相手が選んで捨てる（デジタル版と同じ扱い）
 * - 艦隊司令部は「艦を出すたびに戦闘+1」（公式の訂正のあとの文）
 * - 権威が0以下になったら負け
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, TRADE_CARDS, EXPLORER, STARTING_AUTHORITY, HAND_SIZE, FIRST_HAND, ROW_SIZE, FACTIONS, isBase } from './cards.js';

const MAX_LOGS = 600;
const MAX_EVENTS = 120;
const EXPLORERS = 10;

export const COMMAND_FIELDS = {
    play: ['card'],
    playAll: [],
    buy: ['card'],
    scrap: ['card'],
    attack: ['target'],
    end: [],
    choose: ['option', 'cards']
};

const name = (key) => CARDS[key].name;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length !== 2) throw new Error('2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        const drawn = Math.floor(this.random() * 2);
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        // カードの実体：番号 → カードの種類
        this.cards = [];
        const make = (key) => this.cards.push(key) - 1;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            authority: STARTING_AUTHORITY,
            deck: shuffle([...Array(8).fill('scout'), ...Array(2).fill('viper')].map(make), this.random),
            hand: [], discard: [], inPlay: [], bases: [],
            pendingDiscard: 0
        }));
        this.tradeDeck = shuffle(TRADE_CARDS.flatMap(c => Array(c.count).fill(c.key)).map(make), this.random);
        this.tradeRow = [];
        this.refillRow();
        this.explorers = EXPLORERS;
        this.scrapHeap = [];
        this.current = this.options.startPlayer;
        this.players.forEach(p => this.draw(p, p.id === this.current ? FIRST_HAND : HAND_SIZE));
        this.turnNumber = 1;
        this.phase = 'main';
        this.winner = null;
        this.prompts = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}から始めます`);
        this.startTurn();
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        if (this.phase === 'end') return [];
        return [this.prompts[0]?.seat ?? this.current];
    }

    keyOf(id) {
        return this.cards[id];
    }

    // ---- 山札 ----

    draw(p, n) {
        let drawn = 0;
        for (let i = 0; i < n; i++) {
            if (!p.deck.length) {
                if (!p.discard.length) break;
                p.deck = shuffle(p.discard, this.random);
                p.discard = [];
                this.emit({ type: 'shuffle', seat: p.id });
            }
            p.hand.push(p.deck.shift());
            drawn++;
        }
        return drawn;
    }

    refillRow() {
        while (this.tradeRow.length < ROW_SIZE && this.tradeDeck.length) this.tradeRow.push(this.tradeDeck.shift());
        // 交易の列は場所を保つ（空いた場所を詰めずに埋める）
    }

    // 交易の列の1枚を取り除き、その場所に山から補充する
    takeFromRow(id) {
        const i = this.tradeRow.indexOf(id);
        if (this.tradeDeck.length) this.tradeRow[i] = this.tradeDeck.shift();
        else this.tradeRow.splice(i, 1);
    }

    // ---- 手番 ----

    startTurn() {
        const p = this.players[this.current];
        this.turn = {
            trade: 0, combat: 0,
            used: {},            // カード番号 → { primary, ally, as }（as は写した種類）
            blobPlayed: 0,       // この手番に出したブロブのカード
            fleetHq: false,
            topdeckNext: false
        };
        this.emit({ type: 'turn', seat: this.current, turn: this.turnNumber });
        if (p.pendingDiscard > 0) {
            const n = Math.min(p.pendingDiscard, p.hand.length);
            p.pendingDiscard = 0;
            if (n > 0) {
                // 捨ててから基地の効果を使う（基地の効果で引いた札まで捨てる対象にしない）
                this.prompts.push({ kind: 'discard', seat: p.id, count: n });
                return;
            }
        }
        this.activateBases();
    }

    // 基地の効果（毎手番、手番の始めに使う）
    activateBases() {
        this.players[this.current].bases.forEach(id => this.activate(id));
        this.triggerAllies();
    }

    // カードの効果（主の効果）を使う
    activate(id) {
        const used = this.turn.used[id] ??= {};
        if (used.primary) return;
        used.primary = true;
        this.applyEffects(CARDS[this.keyOf(id)].primary, id);
    }

    // 効果の種類（写していればその種類）
    effectiveKey(id) {
        return this.turn.used[id]?.as ?? this.keyOf(id);
    }

    factionsOf(id) {
        const key = this.keyOf(id);
        const out = new Set([CARDS[key].faction]);
        const as = this.turn.used[id]?.as;
        if (as) out.add(CARDS[as].faction);
        return out;
    }

    // 同盟の相手がいるか（ほかの場のカードに同じ勢力、またはメックの星）
    hasAlly(id) {
        const p = this.players[this.current];
        const others = [...p.inPlay, ...p.bases].filter(x => x !== id);
        const mine = this.factionsOf(id);
        return others.some(x => this.keyOf(x) === 'mechWorld' || [...this.factionsOf(x)].some(f => f !== 'none' && mine.has(f)));
    }

    triggerAllies() {
        const p = this.players[this.current];
        let changed = true;
        while (changed && this.phase !== 'end') {
            changed = false;
            for (const id of [...p.inPlay, ...p.bases]) {
                const used = this.turn.used[id] ??= {};
                const ally = CARDS[this.effectiveKey(id)].ally;
                if (used.ally || !ally.length || !used.primary || !this.hasAlly(id)) continue;
                used.ally = true;
                this.emit({ type: 'ally', seat: p.id, card: id });
                this.applyEffects(ally, id);
                changed = true;
            }
        }
    }

    applyEffects(effects, source) {
        const p = this.players[this.current];
        const opp = this.players[1 - this.current];
        for (const e of effects) {
            if (e.trade) this.turn.trade += e.trade;
            if (e.combat) this.turn.combat += e.combat;
            if (e.authority) p.authority += e.authority;
            if (e.draw) this.draw(p, e.draw);
            if (e.or) this.prompts.push({ kind: 'or', seat: p.id, source, options: e.or });
            if (e.oppDiscard) opp.pendingDiscard += e.oppDiscard;
            if (e.scrapRow) this.prompts.push({ kind: 'scrapRow', seat: p.id, source, max: e.scrapRow });
            if (e.scrapHandOrDiscard) this.prompts.push({ kind: 'scrapCards', seat: p.id, source, max: e.scrapHandOrDiscard });
            if (e.destroyBase && opp.bases.length) this.prompts.push({ kind: 'destroyBase', seat: p.id, source });
            if (e.topdeckNext) this.turn.topdeckNext = true;
            if (e.drawIfBases && p.bases.length >= e.drawIfBases.bases) this.draw(p, e.drawIfBases.draw);
            if (e.copyShip) {
                if (p.inPlay.some(x => x !== source && CARDS[this.keyOf(x)].type === 'ship')) this.prompts.push({ kind: 'copyShip', seat: p.id, source });
            }
            if (e.freeShipTop) {
                if (this.tradeRow.some(x => CARDS[this.keyOf(x)].type === 'ship')) this.prompts.push({ kind: 'freeShip', seat: p.id, source });
            }
            if (e.drawPerBlob) this.draw(p, this.turn.blobPlayed);
            if (e.fleetHq) this.turn.fleetHq = true;
            if (e.drawThenScrapHand) {
                this.draw(p, 1);
                if (p.hand.length) this.prompts.push({ kind: 'scrapHand', seat: p.id, source });
            }
            if (e.brainWorld) this.prompts.push({ kind: 'brainWorld', seat: p.id, source, max: 2 });
            if (e.recycle) {
                if (p.hand.length) this.prompts.push({ kind: 'recycle', seat: p.id, source, max: e.recycle });
            }
        }
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (this.prompts.length && command.type !== 'choose') return this.fail('先に選んでください');
        if (!this.prompts.length && command.type === 'choose') return this.fail('選ぶものはありません');
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        const error = this[`check_${command.type}`](playerId, recorded);
        if (error) return this.fail(error);
        this[`do_${command.type}`](playerId, recorded);
        if (this.phase !== 'end') this.triggerAllies();
        this.checkWin();
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    check_play(seat, { card }) {
        if (!this.players[seat].hand.includes(card)) return 'そのカードは手札にありません';
        return null;
    }

    do_play(seat, { card }) {
        this.playCard(seat, card);
    }

    playCard(seat, id) {
        const p = this.players[seat];
        p.hand.splice(p.hand.indexOf(id), 1);
        const key = this.keyOf(id);
        const c = CARDS[key];
        if (isBase(key)) p.bases.push(id);
        else p.inPlay.push(id);
        if (c.faction === 'blob') this.turn.blobPlayed += 1;
        this.emit({ type: 'play', seat, card: id, key });
        this.log(`${p.name}：${c.name}を出しました`);
        if (c.type === 'ship' && this.turn.fleetHq) this.turn.combat += 1;
        this.activate(id);
    }

    check_playAll(seat) {
        if (!this.players[seat].hand.length) return '手札がありません';
        return null;
    }

    // 手札を順に出す。選ぶものが出たら、そこで止める
    do_playAll(seat) {
        const p = this.players[seat];
        while (p.hand.length && !this.prompts.length) {
            this.playCard(seat, p.hand[0]);
            this.triggerAllies();
        }
    }

    check_buy(seat, { card }) {
        if (card === 'explorer') {
            if (this.explorers <= 0) return 'エクスプローラーはもうありません';
            return this.turn.trade >= EXPLORER.cost ? null : '交易が足りません';
        }
        if (!this.tradeRow.includes(card)) return 'そのカードは交易の列にありません';
        return this.turn.trade >= CARDS[this.keyOf(card)].cost ? null : '交易が足りません';
    }

    do_buy(seat, { card }) {
        const p = this.players[seat];
        let id;
        if (card === 'explorer') {
            this.explorers -= 1;
            id = this.cards.push('explorer') - 1;
        } else {
            id = card;
            this.takeFromRow(card);
        }
        const key = this.keyOf(id);
        this.turn.trade -= CARDS[key].cost;
        this.gain(p, id);
        this.emit({ type: 'buy', seat, card: id, key });
    }

    // 獲得：ふつうは捨て札。「次に獲得する艦を山札の上に」なら山札の上
    gain(p, id, top = false) {
        const key = this.keyOf(id);
        const onTop = top || (this.turn.topdeckNext && CARDS[key].type === 'ship');
        if (onTop) {
            p.deck.unshift(id);
            if (!top) this.turn.topdeckNext = false;
        } else {
            p.discard.push(id);
        }
        this.log(`${p.name}：${name(key)}を獲得しました${onTop ? '（山札の上へ）' : ''}`);
    }

    check_scrap(seat, { card }) {
        const p = this.players[seat];
        if (!p.inPlay.includes(card) && !p.bases.includes(card)) return 'そのカードは場にありません';
        if (!CARDS[this.effectiveKey(card)].scrap.length) return 'そのカードに廃棄の能力はありません';
        return null;
    }

    do_scrap(seat, { card }) {
        const p = this.players[seat];
        const key = this.effectiveKey(card);
        this.removeFromPlay(p, card);
        this.scrapCard(card);
        this.emit({ type: 'scrap', seat, card, key: this.keyOf(card) });
        this.log(`${p.name}：${name(this.keyOf(card))}を廃棄して使いました`);
        this.applyEffects(CARDS[key].scrap, card);
    }

    removeFromPlay(p, id) {
        p.inPlay = p.inPlay.filter(x => x !== id);
        p.bases = p.bases.filter(x => x !== id);
    }

    // 廃棄：エクスプローラーは山に戻る。ほかは廃棄の山へ
    scrapCard(id) {
        if (this.keyOf(id) === 'explorer') this.explorers += 1;
        else this.scrapHeap.push(id);
    }

    hasOutpost(seat) {
        return this.players[seat].bases.some(id => CARDS[this.keyOf(id)].type === 'outpost');
    }

    check_attack(seat, { target }) {
        const opp = this.players[1 - seat];
        if (this.turn.combat <= 0) return '戦闘がありません';
        if (target === 'player') return this.hasOutpost(opp.id) ? '先に前哨を破壊してください' : null;
        if (!opp.bases.includes(target)) return 'その基地はありません';
        const c = CARDS[this.keyOf(target)];
        if (c.type !== 'outpost' && this.hasOutpost(opp.id)) return '先に前哨を破壊してください';
        if (this.turn.combat < c.defense) return '戦闘が足りません';
        return null;
    }

    do_attack(seat, { target }) {
        const p = this.players[seat];
        const opp = this.players[1 - seat];
        if (target === 'player') {
            const damage = this.turn.combat;
            opp.authority -= damage;
            this.turn.combat = 0;
            this.emit({ type: 'attack', seat, target: 'player', damage });
            this.log(`${p.name}：${opp.name}に${damage}の攻撃`);
            return;
        }
        const c = CARDS[this.keyOf(target)];
        this.turn.combat -= c.defense;
        this.destroyBase(opp, target);
        this.emit({ type: 'attack', seat, target, key: this.keyOf(target), damage: c.defense });
    }

    destroyBase(owner, id) {
        owner.bases = owner.bases.filter(x => x !== id);
        owner.discard.push(id);
        this.log(`${owner.name}の${name(this.keyOf(id))}が破壊されました`);
    }

    check_end() {
        return null;
    }

    do_end(seat) {
        const p = this.players[seat];
        p.discard.push(...p.inPlay, ...p.hand);
        p.inPlay = [];
        p.hand = [];
        this.draw(p, HAND_SIZE);
        this.emit({ type: 'end', seat });
        this.current = 1 - this.current;
        this.turnNumber += 1;
        this.startTurn();
    }

    // ---- 選ぶ ----

    check_choose(seat, { option, cards }) {
        const pr = this.prompts[0];
        const p = this.players[seat];
        const opp = this.players[1 - seat];
        const list = Array.isArray(cards) ? cards : [];
        if (cards !== undefined && (!Array.isArray(cards) || new Set(cards).size !== cards.length)) return 'カードの選び方が正しくありません';
        if (pr.kind === 'or') return Number.isInteger(option) && option >= 0 && option < pr.options.length ? null : 'どれかを選んでください';
        if (pr.kind === 'discard') {
            if (list.length !== pr.count) return `${pr.count}枚を選んでください`;
            return list.every(id => p.hand.includes(id)) ? null : '手札から選んでください';
        }
        if (pr.kind === 'scrapCards' || pr.kind === 'brainWorld') {
            if (list.length > pr.max) return `${pr.max}枚まで選べます`;
            return list.every(id => p.hand.includes(id) || p.discard.includes(id)) ? null : '手札か捨て札から選んでください';
        }
        if (pr.kind === 'scrapHand') return list.length === 1 && p.hand.includes(list[0]) ? null : '手札から1枚選んでください';
        if (pr.kind === 'recycle') {
            if (list.length > pr.max) return `${pr.max}枚まで選べます`;
            return list.every(id => p.hand.includes(id)) ? null : '手札から選んでください';
        }
        if (pr.kind === 'scrapRow') {
            if (list.length > pr.max) return `${pr.max}枚まで選べます`;
            return list.every(id => this.tradeRow.includes(id)) ? null : '交易の列から選んでください';
        }
        if (pr.kind === 'destroyBase') {
            if (list.length > 1) return '1つまで選べます';
            return list.every(id => opp.bases.includes(id)) ? null : '相手の基地を選んでください';
        }
        if (pr.kind === 'copyShip') {
            if (list.length !== 1) return '艦を1枚選んでください';
            const id = list[0];
            return id !== pr.source && p.inPlay.includes(id) && CARDS[this.keyOf(id)].type === 'ship' ? null : 'この手番に出した艦を選んでください';
        }
        if (pr.kind === 'freeShip') {
            if (list.length > 1) return '1枚まで選べます';
            return list.every(id => this.tradeRow.includes(id) && CARDS[this.keyOf(id)].type === 'ship') ? null : '交易の列の艦を選んでください';
        }
        return '選べません';
    }

    do_choose(seat, { option, cards }) {
        const pr = this.prompts.shift();
        const p = this.players[seat];
        const opp = this.players[1 - seat];
        const list = cards ?? [];
        const fromHandOrDiscard = (id) => {
            if (p.hand.includes(id)) p.hand.splice(p.hand.indexOf(id), 1);
            else p.discard.splice(p.discard.indexOf(id), 1);
        };
        if (pr.kind === 'or') {
            this.applyEffects(pr.options[option], pr.source);
        } else if (pr.kind === 'discard') {
            list.forEach(id => { p.hand.splice(p.hand.indexOf(id), 1); p.discard.push(id); });
            this.log(`${p.name}：${list.map(id => name(this.keyOf(id))).join('・')}を捨てました`);
            this.emit({ type: 'discard', seat, cards: [...list] });
            this.activateBases();
        } else if (pr.kind === 'scrapCards' || pr.kind === 'scrapHand' || pr.kind === 'brainWorld') {
            list.forEach(id => { fromHandOrDiscard(id); this.scrapCard(id); });
            if (list.length) this.log(`${p.name}：${list.map(id => name(this.keyOf(id))).join('・')}を廃棄しました`);
            this.emit({ type: 'scrapCards', seat, cards: [...list], keys: list.map(id => this.keyOf(id)) });
            if (pr.kind === 'brainWorld') this.draw(p, list.length);
        } else if (pr.kind === 'recycle') {
            list.forEach(id => { p.hand.splice(p.hand.indexOf(id), 1); p.discard.push(id); });
            this.draw(p, list.length);
            this.emit({ type: 'discard', seat, cards: [...list] });
        } else if (pr.kind === 'scrapRow') {
            list.forEach(id => { this.takeFromRow(id); this.scrapHeap.push(id); });
            if (list.length) this.log(`${p.name}：交易の列の${name(this.keyOf(list[0]))}を廃棄しました`);
        } else if (pr.kind === 'destroyBase') {
            list.forEach(id => this.destroyBase(opp, id));
        } else if (pr.kind === 'copyShip') {
            const as = this.keyOf(list[0]);
            this.turn.used[pr.source] = { ...(this.turn.used[pr.source] ?? {}), as };
            if (CARDS[as].faction === 'blob') this.turn.blobPlayed += 1;
            this.log(`${p.name}：${name(this.keyOf(pr.source))}が${name(as)}を写しました`);
            this.applyEffects(CARDS[as].primary, pr.source);
        } else if (pr.kind === 'freeShip') {
            list.forEach(id => {
                this.takeFromRow(id);
                this.gain(p, id, true);
            });
        }
    }

    checkWin() {
        if (this.phase === 'end') return;
        const loser = this.players.find(p => p.authority <= 0);
        if (!loser) return;
        this.phase = 'end';
        this.winner = 1 - loser.id;
        this.prompts = [];
        this.emit({ type: 'gameEnd', winner: this.winner });
        this.log(`${this.players[this.winner].name}の勝ち`);
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

export { FACTIONS };
