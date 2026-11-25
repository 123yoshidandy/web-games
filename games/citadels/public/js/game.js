/**
 * あやつり人形の進行（基本の8役と、基本の地区カード）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山と役割の並びはシードから決まる）
 *
 * ルール
 * - 2〜7人。各自2金と地区カード4枚で始める。最初の王冠はランダムな1人
 * - 巡ごとに、王冠を持つ人から順に役割を1つずつ選ぶ。8枚を切り、1枚を伏せて捨てる。表で捨てるのは4人2枚・5人1枚（王様は表で捨てない）
 *   7人のときは、最後の人が残りの1枚と伏せた1枚から選ぶ
 *   3人のときは2周して1人2役。2人のときは1人2役で、2人目からは選んだあとに1枚を伏せて捨てる
 * - 役割の番号の順に呼び、その役割の人が手番を行う
 *   手番：行動（2金か、地区カードを2枚引いて1枚残す）→ 地区を1つ建てられる（建築家は3つ）。自分の都市に同じ名前の地区は建てられない
 *   収入（その色の地区1つにつき1金）と役割の能力は、手番の中でいつでも1回
 * - だれかの都市が完成（COMPLETE_CITY 地区）したら、その巡の終わりで終了
 * - 得点：地区の得点（ふつうは費用）の合計、5色そろえて+3、最初に完成した人+4、ほかに完成した人+2
 *   同点なら、地区の費用の合計が多い人、それも同じなら金の多い人が上（FFG 英語版 2010年刷の決め方）
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 収入を取らずに手番を終えたら、自動で受け取る（受け取って損をすることはないため）
 * - 商人の1金と建築家の2枚は、行動のあとに自動で受け取る
 * - 将軍の破壊・研究所・鍛冶屋も、手番の中でいつでも1回（FFG 版の将軍は「手番の終わりに」。2016年版に合わせて、いつでもにした）
 * - 天文台と図書館を両方持てば、3枚引いて2枚を残す（FFG 版の補足）
 * - 捨てた地区カード（奇術師・研究所・残さなかった札・壊された地区）は、山の下に入れる
 * - 山が尽きたら、引ける分だけ引く
 */

import { createRandom, shuffle } from './random.js';
import {
    CHARACTERS, CHARACTER_ORDER, DISTRICTS, COLOR_ORDER, CARD_COUNT, cardType, cardInfo, districtPoints,
    STARTING_GOLD, STARTING_HAND
} from './cards.js';

export { CHARACTERS, CHARACTER_ORDER, DISTRICTS };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 7;
export const COMPLETE_CITY = 8;
const MAX_LOGS = 400;
const MAX_EVENTS = 120;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    pick: ['character'], discard: ['character'], gold: [], draw: [], keep: ['cards'], build: ['card'], income: [],
    assassinate: ['character'], steal: ['character'], swap: ['target'], redraw: ['cards'], destroy: ['target', 'card'],
    lab: ['card'], smithy: [], graveyard: ['take'], end: []
};

// 表で捨てる枚数（人数ごと）
const FACE_UP = { 4: 2, 5: 1 };

const isInt = (v) => Number.isInteger(v);

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, crown }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜7人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * players.length);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, crown: options.crown ?? drawn };
        this.deck = shuffle(Array.from({ length: CARD_COUNT }, (_, i) => i), this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            gold: STARTING_GOLD, hand: [], city: [], characters: [], hauntedRound: null, completedAt: null
        }));
        this.players.forEach(p => { p.hand = this.drawCards(STARTING_HAND); });
        this.crown = this.options.crown;
        this.round = 0;
        this.phase = 'draft';       // draft：役割を選ぶ / turn：手番 / keep：引いた札から残す / graveyard：墓地で拾うか / end
        this.draft = null;          // { steps, step, available, faceDown, faceUp, offers（見せた役割）, discarded（2人のとき伏せた役割） }
        this.holder = {};           // 役割 → 席（この巡）
        this.calling = 0;           // 呼んでいる役割の番号（0 は役割を選んでいるあいだ）
        this.revealed = {};         // 手番を行った役割 → 席（公開）
        this.killed = null;         // 殺された役割（公開）
        this.robbed = null;         // 盗賊に指名された役割（公開）
        this.turn = null;           // 手番の状態
        this.drawn = [];            // 行動で引いた札（残す札を選ぶまで）
        this.keepCount = 1;         // 引いた札から残す枚数
        this.pendingGrave = null;   // 墓地で拾うかを聞いている { seat, card, warlord }
        this.firstComplete = null;
        this.finalRound = false;
        this.scores = null;
        this.winner = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.crown].name}が王冠を持って始めます`);
        this.startRound();
    }

    drawCards(n) {
        return this.deck.splice(0, Math.min(n, this.deck.length));
    }

    isOver() {
        return this.phase === 'end';
    }

    // 1人が持つ役割の数
    get charsPerPlayer() {
        return this.players.length <= 3 ? 2 : 1;
    }

    // 操作を待っている人
    actors() {
        switch (this.phase) {
            case 'draft': return [this.draft.steps[this.draft.step].seat];
            case 'turn': case 'keep': return [this.turn.seat];
            case 'graveyard': return [this.pendingGrave.seat];
            default: return [];
        }
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const handler = this.handlerFor(command.type);
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

    handlerFor(type) {
        if (this.phase === 'draft') return { pick: this.pick, discard: this.discardCharacter }[type];
        if (this.phase === 'keep') return type === 'keep' ? this.keep : null;
        if (this.phase === 'graveyard') return type === 'graveyard' ? this.answerGraveyard : null;
        if (this.phase !== 'turn') return null;
        return {
            gold: this.takeGold, draw: this.takeDraw, build: this.build, income: this.takeIncome,
            assassinate: this.assassinate, steal: this.steal, swap: this.swap, redraw: this.redraw, destroy: this.destroy,
            lab: this.useLab, smithy: this.useSmithy, end: this.endTurn
        }[type];
    }

    // ---- 役割を選ぶ ----

    startRound() {
        this.round += 1;
        const n = this.players.length;
        const deck = shuffle([...CHARACTER_ORDER], this.random);
        const faceDown = [deck.shift()];
        const faceUp = [];
        // 表で捨てる札に王様が出たら、王様は残して次の札を捨てる
        for (let i = 0; i < deck.length && faceUp.length < (FACE_UP[n] ?? 0);) {
            if (deck[i] === 'king') i++;
            else faceUp.push(deck.splice(i, 1)[0]);
        }
        const seats = Array.from({ length: n }, (_, k) => (this.crown + k) % n);
        let steps;
        if (n === 2) {
            const [a, b] = seats;
            steps = [{ seat: a, kind: 'pick' }, { seat: b, kind: 'pick' }, { seat: b, kind: 'discard' },
                { seat: a, kind: 'pick' }, { seat: a, kind: 'discard' }, { seat: b, kind: 'pick' }];
        } else if (n === 3) {
            steps = [...seats, ...seats].map(seat => ({ seat, kind: 'pick' }));
        } else {
            steps = seats.map(seat => ({ seat, kind: 'pick' }));
        }
        this.draft = { steps, step: 0, available: deck.sort((x, y) => CHARACTERS[x].rank - CHARACTERS[y].rank), faceDown, faceUp, offers: this.players.map(() => []), discarded: this.players.map(() => []) };
        this.players.forEach(p => { p.characters = []; });
        this.holder = {};
        this.revealed = {};
        this.killed = null;
        this.robbed = null;
        this.calling = 0;
        this.turn = null;
        this.phase = 'draft';
        this.emit({ type: 'round', round: this.round, faceUp: [...faceUp] });
        this.log(`第${this.round}巡${faceUp.length ? `：表で捨てた役割は${faceUp.map(c => CHARACTERS[c].name).join('・')}` : ''}`);
        this.prepareStep();
    }

    // 今の人に見せる役割（7人の最後の人は、伏せた札も選べる）
    draftOptions() {
        const d = this.draft;
        const last = this.players.length === 7 && d.step === d.steps.length - 1;
        return last ? [...d.available, ...d.faceDown].sort((x, y) => CHARACTERS[x].rank - CHARACTERS[y].rank) : [...d.available];
    }

    // 選ぶ人が見た役割を残す（その人だけが見られる情報。CPU の推測に使う）
    prepareStep() {
        const d = this.draft;
        const step = d.steps[d.step];
        if (step.kind === 'pick') d.offers[step.seat].push({ step: d.step, options: this.draftOptions() });
    }

    pick(seat, { character }) {
        const d = this.draft;
        if (d.steps[d.step].kind !== 'pick') return this.fail('伏せて捨てる役割を選んでください');
        if (!this.draftOptions().includes(character)) return this.fail('その役割は選べません');
        if (d.faceDown.includes(character)) {
            // 7人の最後の人が伏せた札を取った：残りの札を伏せる
            d.faceDown = [...d.available];
            d.available = [];
        } else {
            d.available = d.available.filter(c => c !== character);
        }
        this.holder[character] = seat;
        this.players[seat].characters.push(character);
        this.emit({ type: 'pick', seat });
        this.log(`${this.players[seat].name}が役割を選びました`);
        return this.nextStep();
    }

    discardCharacter(seat, { character }) {
        const d = this.draft;
        if (d.steps[d.step].kind !== 'discard') return this.fail('役割を選んでください');
        if (!d.available.includes(character)) return this.fail('その役割は捨てられません');
        d.available = d.available.filter(c => c !== character);
        d.faceDown.push(character);
        d.discarded[seat].push(character);
        this.emit({ type: 'discardCharacter', seat });
        this.log(`${this.players[seat].name}が役割を1枚伏せて捨てました`);
        return this.nextStep();
    }

    nextStep() {
        const d = this.draft;
        d.step += 1;
        if (d.step < d.steps.length) {
            this.prepareStep();
            return true;
        }
        // 残った札は伏せて捨てる
        d.faceDown.push(...d.available);
        d.available = [];
        this.log('役割を呼びます');
        this.callNext();
        return true;
    }

    // ---- 役割を呼ぶ ----

    callNext() {
        this.turn = null;
        this.phase = 'turn';
        while (this.calling < CHARACTER_ORDER.length) {
            this.calling += 1;
            const character = CHARACTER_ORDER[this.calling - 1];
            const seat = this.holder[character];
            const name = CHARACTERS[character].name;
            if (seat === undefined) {
                this.emit({ type: 'call', character, seat: null });
                continue;
            }
            if (this.killed === character) {
                this.emit({ type: 'call', character, seat: null, killed: true });
                this.log(`${name}は殺されているので、手番がありません`);
                continue;
            }
            this.startTurn(seat, character);
            return;
        }
        this.endRound();
    }

    startTurn(seat, character) {
        const p = this.players[seat];
        this.revealed[character] = seat;
        this.emit({ type: 'call', character, seat });
        this.log(`${name(p)}は${CHARACTERS[character].name}`);
        if (this.robbed === character) {
            const thief = this.revealed.thief ?? this.holder.thief;
            const amount = p.gold;
            p.gold = 0;
            this.players[thief].gold += amount;
            this.emit({ type: 'gold', from: seat, to: thief, amount });
            this.log(`${name(this.players[thief])}が${name(p)}から${amount}金を奪いました`);
        }
        if (character === 'king' && this.crown !== seat) {
            this.crown = seat;
            this.emit({ type: 'crown', seat });
            this.log(`${name(p)}が王冠を受け取りました`);
        }
        this.turn = {
            seat, character, acted: false, built: 0, buildLimit: character === 'architect' ? 3 : 1,
            income: !CHARACTERS[character].income, ability: false, lab: false, smithy: false
        };
    }

    endRound() {
        this.calling = CHARACTER_ORDER.length + 1;
        this.turn = null;
        // 殺された王様の持ち主も、巡の終わりに王冠を受け取る
        if (this.killed) {
            const seat = this.holder[this.killed];
            if (seat !== undefined) {
                this.log(`殺された${CHARACTERS[this.killed].name}は${name(this.players[seat])}でした`);
                this.revealed[this.killed] = seat;
                if (this.killed === 'king' && this.crown !== seat) {
                    this.crown = seat;
                    this.emit({ type: 'crown', seat });
                    this.log(`${name(this.players[seat])}が王冠を受け取りました`);
                }
            }
        }
        if (this.finalRound) return this.finish();
        this.startRound();
    }

    // ---- 手番 ----

    // 今の手番でできること（画面と CPU が使う）
    choices() {
        const t = this.turn;
        if (this.phase !== 'turn' || !t) return null;
        const p = this.players[t.seat];
        const c = t.character;
        const result = {
            act: !t.acted,
            draw: !t.acted && this.deck.length > 0,
            build: t.acted && t.built < t.buildLimit ? p.hand.filter(id => this.canBuild(p, id)) : [],
            income: t.income ? 0 : this.incomeOf(t.seat, c),
            canIncome: !t.income,
            ability: null,
            lab: !t.lab && this.has(p, 'laboratory') && p.hand.length > 0,
            smithy: !t.smithy && this.has(p, 'smithy') && p.gold >= 2 && this.deck.length > 0,
            end: t.acted
        };
        if (!t.ability) {
            if (c === 'assassin') result.ability = { type: 'assassinate', characters: CHARACTER_ORDER.filter(x => x !== 'assassin') };
            if (c === 'thief') result.ability = { type: 'steal', characters: CHARACTER_ORDER.filter(x => x !== 'assassin' && x !== 'thief' && x !== this.killed) };
            if (c === 'magician') result.ability = { type: 'magic', swap: this.players.filter(o => o.id !== t.seat).map(o => o.id), redraw: p.hand.length > 0 };
            if (c === 'warlord') result.ability = { type: 'destroy', targets: this.destroyTargets(t.seat) };
        }
        return result;
    }

    has(p, type) {
        return p.city.some(id => cardType(id) === type);
    }

    canBuild(p, id) {
        const info = cardInfo(id);
        return p.hand.includes(id) && p.gold >= info.cost && !p.city.some(c => cardType(c) === cardType(id));
    }

    // 役割の色の地区1つにつき1金。魔法学校は、収入のある役割の色として数える
    incomeOf(seat, character) {
        const color = CHARACTERS[character].income;
        if (!color) return 0;
        return this.players[seat].city.filter(id => cardInfo(id).color === color || cardType(id) === 'schoolOfMagic').length;
    }

    // 将軍が壊せる地区 [{ target, card, cost }]（払えるかは見ない）
    destroyTargets(seat) {
        const list = [];
        const bishop = this.killed === 'bishop' ? undefined : this.holder.bishop;
        this.players.forEach(o => {
            if (o.city.length >= COMPLETE_CITY) return;
            if (bishop === o.id) return;
            const wall = this.has(o, 'greatWall');
            o.city.forEach(card => {
                const type = cardType(card);
                if (type === 'keep') return;
                const cost = Math.max(0, DISTRICTS[type].cost - 1) + (wall && type !== 'greatWall' ? 1 : 0);
                list.push({ target: o.id, card, cost });
            });
        });
        return list;
    }

    requireAbility(type) {
        const choice = this.choices();
        const ability = choice?.ability;
        if (!ability || ability.type !== type) return null;
        return ability;
    }

    takeGold(seat) {
        if (this.turn.acted) return this.fail('行動はもう選びました');
        this.gain(seat, 2);
        this.log(`${name(this.players[seat])}は2金を取りました`);
        this.afterAction(seat);
        return true;
    }

    takeDraw(seat) {
        if (this.turn.acted) return this.fail('行動はもう選びました');
        if (!this.deck.length) return this.fail('山に札がありません');
        const p = this.players[seat];
        const count = this.has(p, 'observatory') ? 3 : 2;
        this.drawn = this.drawCards(count);
        this.turn.acted = true;
        this.log(`${name(p)}は地区カードを${this.drawn.length}枚引きました`);
        // 残す枚数：ふつうは1枚。図書館は引いた札をすべて（天文台もあれば3枚から2枚）
        const library = this.has(p, 'library');
        this.keepCount = Math.min(this.drawn.length, library ? (count === 3 ? 2 : count) : 1);
        if (this.keepCount === this.drawn.length) {
            const kept = this.drawn;
            this.drawn = [];
            p.hand.push(...kept);
            this.emit({ type: 'draw', seat, count: kept.length, cards: [...kept], visibleTo: [seat] });
            this.afterAction(seat);
            return true;
        }
        this.phase = 'keep';
        this.emit({ type: 'drawOffer', seat, count: this.drawn.length, cards: [...this.drawn], visibleTo: [seat] });
        return true;
    }

    // 引いた札から keepCount 枚残す（残りは山の下）
    keep(seat, { cards }) {
        const n = this.keepCount;
        if (!Array.isArray(cards) || cards.length !== n || new Set(cards).size !== n || !cards.every(id => this.drawn.includes(id))) {
            return this.fail(`残す札を${n}枚選んでください`);
        }
        const p = this.players[seat];
        const rest = this.drawn.filter(id => !cards.includes(id));
        p.hand.push(...cards);
        this.deck.push(...rest);
        this.drawn = [];
        this.phase = 'turn';
        this.emit({ type: 'draw', seat, count: n, cards: [...cards], visibleTo: [seat] });
        this.afterAction(seat);
        return true;
    }

    // 行動のあと：商人は1金、建築家は2枚
    afterAction(seat) {
        const t = this.turn;
        t.acted = true;
        if (t.character === 'merchant') {
            this.gain(seat, 1);
            this.log(`${name(this.players[seat])}は商人の1金を受け取りました`);
        }
        if (t.character === 'architect') {
            const cards = this.drawCards(2);
            this.players[seat].hand.push(...cards);
            if (cards.length) {
                this.emit({ type: 'draw', seat, count: cards.length, cards: [...cards], visibleTo: [seat] });
                this.log(`${name(this.players[seat])}は建築家の${cards.length}枚を引きました`);
            }
        }
    }

    takeIncome(seat) {
        const t = this.turn;
        if (t.income) return this.fail('収入はもう受け取りました');
        this.collectIncome(seat);
        return true;
    }

    collectIncome(seat) {
        const t = this.turn;
        const amount = this.incomeOf(seat, t.character);
        t.income = true;
        if (amount) {
            this.gain(seat, amount);
            this.log(`${name(this.players[seat])}は${COLOR_NAME[CHARACTERS[t.character].income]}の地区の収入${amount}金`);
        }
    }

    build(seat, { card }) {
        const t = this.turn;
        const p = this.players[seat];
        if (!t.acted) return this.fail('先に行動を選んでください');
        if (t.built >= t.buildLimit) return this.fail(t.buildLimit > 1 ? 'この手番ではもう建てられません' : '地区はもう建てました');
        if (!isInt(card) || !p.hand.includes(card)) return this.fail('その札は持っていません');
        const info = cardInfo(card);
        if (p.city.some(c => cardType(c) === cardType(card))) return this.fail('同じ地区はもう建っています');
        if (p.gold < info.cost) return this.fail('金が足りません');
        p.gold -= info.cost;
        p.hand.splice(p.hand.indexOf(card), 1);
        p.city.push(card);
        t.built += 1;
        if (cardType(card) === 'hauntedCity') p.hauntedRound = this.round;
        this.emit({ type: 'build', seat, card, cost: info.cost });
        this.log(`${name(p)}が${info.name}（${info.cost}）を建てました`);
        if (p.city.length >= COMPLETE_CITY && p.completedAt === null) {
            p.completedAt = this.round;
            this.emit({ type: 'complete', seat });
            if (this.firstComplete === null) {
                this.firstComplete = seat;
                this.finalRound = true;
                this.log(`${name(p)}の都市が完成しました。この巡で終わります`);
            } else {
                this.log(`${name(p)}の都市も完成しました`);
            }
        }
        return true;
    }

    // ---- 役割の能力 ----

    assassinate(seat, { character }) {
        const ability = this.requireAbility('assassinate');
        if (!ability) return this.fail('今は使えません');
        if (!ability.characters.includes(character)) return this.fail('その役割は選べません');
        this.turn.ability = true;
        this.killed = character;
        this.emit({ type: 'kill', seat, character });
        this.log(`暗殺者が${CHARACTERS[character].name}を殺しました`);
        return true;
    }

    steal(seat, { character }) {
        const ability = this.requireAbility('steal');
        if (!ability) return this.fail('今は使えません');
        if (!ability.characters.includes(character)) return this.fail('その役割は選べません');
        this.turn.ability = true;
        this.robbed = character;
        this.emit({ type: 'rob', seat, character });
        this.log(`盗賊が${CHARACTERS[character].name}を狙いました`);
        return true;
    }

    swap(seat, { target }) {
        const ability = this.requireAbility('magic');
        if (!ability) return this.fail('今は使えません');
        if (!ability.swap.includes(target)) return this.fail('その人とは交換できません');
        const p = this.players[seat];
        const o = this.players[target];
        [p.hand, o.hand] = [o.hand, p.hand];
        this.turn.ability = true;
        this.emit({ type: 'swap', seat, target, counts: [p.hand.length, o.hand.length] });
        this.log(`${name(p)}が${name(o)}と手札を交換しました（${o.hand.length}枚と${p.hand.length}枚）`);
        return true;
    }

    redraw(seat, { cards }) {
        const ability = this.requireAbility('magic');
        if (!ability) return this.fail('今は使えません');
        const p = this.players[seat];
        if (!Array.isArray(cards) || !cards.length || new Set(cards).size !== cards.length || !cards.every(id => isInt(id) && p.hand.includes(id))) {
            return this.fail('戻す札を選んでください');
        }
        p.hand = p.hand.filter(id => !cards.includes(id));
        this.deck.push(...cards);
        const fresh = this.drawCards(cards.length);
        p.hand.push(...fresh);
        this.turn.ability = true;
        this.emit({ type: 'redraw', seat, count: cards.length, cards: [...fresh], visibleTo: [seat] });
        this.log(`${name(p)}が手札を${cards.length}枚戻して引き直しました`);
        return true;
    }

    destroy(seat, { target, card }) {
        const ability = this.requireAbility('destroy');
        if (!ability) return this.fail('今は使えません');
        const option = ability.targets.find(x => x.target === target && x.card === card);
        if (!option) return this.fail('その地区は壊せません');
        const p = this.players[seat];
        if (p.gold < option.cost) return this.fail('金が足りません');
        const o = this.players[target];
        p.gold -= option.cost;
        o.city.splice(o.city.indexOf(card), 1);
        if (cardType(card) === 'hauntedCity') o.hauntedRound = null;
        this.turn.ability = true;
        this.emit({ type: 'destroy', seat, target, card, cost: option.cost });
        this.log(`${name(p)}が${name(o)}の${cardInfo(card).name}を壊しました（${option.cost}金）`);
        // 墓地：持ち主（将軍でない）が1金で拾えるか聞く
        const keeper = this.players.find(x => x.id !== seat && this.has(x, 'graveyard') && x.gold >= 1);
        if (keeper && cardType(card) !== 'graveyard') {
            this.pendingGrave = { seat: keeper.id, card, warlord: seat };
            this.phase = 'graveyard';
            return true;
        }
        this.deck.push(card);
        return true;
    }

    answerGraveyard(seat, { take }) {
        if (typeof take !== 'boolean') return this.fail('拾うかどうかを選んでください');
        const { card } = this.pendingGrave;
        const p = this.players[seat];
        if (take) {
            p.gold -= 1;
            p.hand.push(card);
            this.emit({ type: 'graveyard', seat, card });
            this.log(`${name(p)}が墓地で${cardInfo(card).name}を拾いました（1金）`);
        } else {
            this.deck.push(card);
        }
        this.pendingGrave = null;
        this.phase = 'turn';
        return true;
    }

    // ---- 紫の地区 ----

    useLab(seat, { card }) {
        const p = this.players[seat];
        if (this.turn.lab || !this.has(p, 'laboratory')) return this.fail('今は使えません');
        if (!isInt(card) || !p.hand.includes(card)) return this.fail('その札は持っていません');
        p.hand.splice(p.hand.indexOf(card), 1);
        this.deck.push(card);
        this.turn.lab = true;
        this.gain(seat, 1);
        this.log(`${name(p)}が研究所で札を1枚捨てて1金`);
        return true;
    }

    useSmithy(seat) {
        const p = this.players[seat];
        if (this.turn.smithy || !this.has(p, 'smithy')) return this.fail('今は使えません');
        if (p.gold < 2) return this.fail('金が足りません');
        if (!this.deck.length) return this.fail('山に札がありません');
        p.gold -= 2;
        const cards = this.drawCards(3);
        p.hand.push(...cards);
        this.turn.smithy = true;
        this.emit({ type: 'gold', from: seat, to: null, amount: 2 });
        this.emit({ type: 'draw', seat, count: cards.length, cards: [...cards], visibleTo: [seat] });
        this.log(`${name(p)}が鍛冶屋で2金を払い、${cards.length}枚引きました`);
        return true;
    }

    endTurn(seat) {
        const t = this.turn;
        if (!t.acted) return this.fail('先に行動を選んでください');
        if (!t.income) this.collectIncome(seat);
        this.callNext();
        return true;
    }

    gain(seat, amount) {
        this.players[seat].gold += amount;
        this.emit({ type: 'gold', from: null, to: seat, amount });
    }

    // ---- 終わり ----

    // 得点の内訳
    scoreOf(seat) {
        const p = this.players[seat];
        const districts = p.city.reduce((s, id) => s + districtPoints(cardType(id)), 0);
        const colors = new Set(p.city.filter(id => cardType(id) !== 'hauntedCity').map(id => cardInfo(id).color));
        // 幽霊街は、最後の巡より前に建てていれば、好きな色1つとして数える（最後の巡に建てたら紫）
        const flexible = this.has(p, 'hauntedCity') && p.hauntedRound < this.round;
        if (this.has(p, 'hauntedCity') && !flexible) colors.add('purple');
        const missing = COLOR_ORDER.filter(c => !colors.has(c)).length;
        const allColors = missing === 0 || (missing === 1 && flexible) ? 3 : 0;
        const complete = p.completedAt === null ? 0 : (seat === this.firstComplete ? 4 : 2);
        return { districts, colors: allColors, complete, total: districts + allColors + complete };
    }

    finish() {
        this.phase = 'end';
        this.turn = null;
        this.scores = this.players.map(p => ({ seat: p.id, ...this.scoreOf(p.id) }));
        // 同点なら、地区の費用の合計が多い人、それも同じなら金の多い人が上
        const cost = (seat) => this.players[seat].city.reduce((s, id) => s + cardInfo(id).cost, 0);
        const gold = (seat) => this.players[seat].gold;
        this.ranking = [...this.scores].sort((a, b) => b.total - a.total || cost(b.seat) - cost(a.seat) || gold(b.seat) - gold(a.seat)).map(s => s.seat);
        this.winner = this.ranking[0];
        this.emit({ type: 'end', winner: this.winner });
        this.log(`${name(this.players[this.winner])}の勝ち（${this.scores[this.winner].total}点）`);
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

const COLOR_NAME = { yellow: '黄', blue: '青', green: '緑', red: '赤' };
const name = (p) => p.name;
