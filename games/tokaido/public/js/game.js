/**
 * 東海道の進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びはシードから決まる）
 *
 * 流れ
 * - 各人に旅人の札を2枚配り、1枚を選ぶ（全員が同時に選ぶ）。旅人の札の数だけお金を持って、京都に並ぶ（並びはランダム）
 * - 道のいちばん後ろの旅人が、先の空いたマスへ好きなだけ進む。宿場は追い越せない。同じマスの2人目（2マスの外側）は後ろとみなす
 * - 止まったマスの効果を受ける。宿場には全員が揃うまで止まり、食事を1つ買える。最後に着いた人から出発する
 * - 全員が江戸に着いたら、寺の寄付の順位と称号を足して終わり。点の多い人の勝ち。同点なら称号の多い人
 *
 * 2人のとき：中立の旅人（灰色）を足す。中立の旅人がいちばん後ろなら、先頭の人が動かす。
 * 中立の旅人は寺で場のお金1文を寄付し（寄付の順位に入る）、宿場では食事の札を1枚ランダムに捨てる
 *
 * ルールブックに書かれていない、または読み方が分かれる点の決め方は README と各所のコメントに書いた
 */

import { createRandom, shuffle } from './random.js';
import {
    BOARD, EDO, INN_NAMES, nextInn, SPACE_TYPES, PANORAMAS, PANORAMA_KINDS, TRAVELERS, TRAVELER_IDS,
    SOUVENIRS, SOUVENIR_IDS, DISHES, MEAL_CARDS, MEAL_POINTS, dishOf, ENCOUNTERS, ENCOUNTER_CARDS, encounterKind,
    SPRING_CARDS, springValue, ACHIEVEMENTS, ACHIEVEMENT_POINTS
} from './data.js';
import { souvenirGain, souvenirCost, mealCost, mealPriceTotal, templeRankPoints, mostOf } from './scoring.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const MAX_LOGS = 400;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    choose: ['traveler'],
    move: ['to'],
    buy: ['cards'],
    donate: ['amount'],
    encounter: ['card'],
    panorama: ['kind'],
    meal: ['card']
};

const emptyPoints = () => ({ panorama: 0, souvenir: 0, meal: 0, spring: 0, encounter: 0, temple: 0, achievement: 0 });

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜5人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            traveler: null, offers: [], coins: 0, score: 0, points: emptyPoints(),
            souvenirs: [], meals: [], springs: [], encounters: [],
            panoramas: { paddy: 0, mountain: 0, sea: 0 }, donations: 0, achievements: []
        }));
        // 旅人の札を2枚ずつ配る
        const tiles = shuffle([...TRAVELER_IDS], this.random);
        this.players.forEach((p, i) => { p.offers = tiles.slice(i * 2, i * 2 + 2); });
        this.decks = {
            souvenir: shuffle([...SOUVENIR_IDS], this.random),
            meal: shuffle([...MEAL_CARDS], this.random),
            encounter: shuffle([...ENCOUNTER_CARDS], this.random),
            spring: shuffle([...SPRING_CARDS], this.random)
        };
        // 道の上のこま。席の順に並べ、2人のときは最後に中立の旅人（player: null）
        const n = players.length;
        const count = n === 2 ? 3 : n;
        this.tokens = Array.from({ length: count }, (_, i) => ({ player: i < n ? i : null, pos: 0, seq: 0, donations: 0 }));
        // 京都の並び（seq の小さい方が前。前から順に着いたとみなす）
        shuffle([...this.tokens.keys()], this.random).forEach((t, k) => { this.tokens[t].seq = k + 1; });
        this.seq = count;
        this.panoramaFirst = { paddy: null, mountain: null, sea: null };
        this.inn = null;            // 宿場の食事 { pos, meals }
        this.pending = null;        // 選ぶのを待っていること { seat, kind, ... }
        this.queue = [];            // 止まったマスで、これから行うこと
        this.phase = 'choose';      // choose：旅人を選ぶ / travel：旅 / end：終わり
        this.result = null;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    isOver() {
        return this.phase === 'end';
    }

    // ---- 道 ----

    // そのマスに止まれる人数（宿場は全員。2マスは4・5人のときだけ2人）
    capacity(pos) {
        const space = BOARD[pos];
        if (space.type === 'inn') return Infinity;
        return space.double && this.players.length >= 4 ? 2 : 1;
    }

    occupants(pos) {
        return this.tokens.filter(t => t.pos === pos).length;
    }

    // いちばん後ろのこま（同じマスなら、あとから着いた方が後ろ）。全員が江戸なら null
    moverToken() {
        if (this.phase !== 'travel') return null;
        let best = null;
        this.tokens.forEach((t, i) => {
            if (t.pos === EDO) return;
            const b = best === null ? null : this.tokens[best];
            if (b === null || t.pos < b.pos || (t.pos === b.pos && t.seq > b.seq)) best = i;
        });
        return best;
    }

    // 先頭のプレイヤー（中立の旅人を動かす人）
    leaderSeat() {
        let best = null;
        this.tokens.forEach(t => {
            if (t.player === null) return;
            const b = best === null ? null : this.tokens[best];
            if (b === null || t.pos > b.pos || (t.pos === b.pos && t.seq < b.seq)) best = t.player;
        });
        return best;
    }

    // こまを動かす人
    moverSeat() {
        const t = this.moverToken();
        if (t === null) return null;
        return this.tokens[t].player ?? this.leaderSeat();
    }

    // 操作を待っている人
    actors() {
        if (this.phase === 'choose') return this.players.filter(p => !p.traveler).map(p => p.id);
        if (this.phase !== 'travel') return [];
        if (this.pending) return [this.pending.seat];
        const seat = this.moverSeat();
        return seat === null ? [] : [seat];
    }

    // そのこまが pos に止まれるか
    canStop(tokenIndex, pos) {
        const token = this.tokens[tokenIndex];
        const space = BOARD[pos];
        if (!space || pos <= token.pos || pos > nextInn(token.pos)) return false;
        if (this.occupants(pos) >= this.capacity(pos)) return false;
        if (token.player === null) return true;
        const p = this.players[token.player];
        // 店と寺は、1文以上ないと止まれない
        if ((space.type === 'village' || space.type === 'temple') && p.coins < 1) return false;
        // 完成させた景色には止まれない
        if (PANORAMAS[space.type] && p.panoramas[space.type] >= PANORAMAS[space.type].size) return false;
        return true;
    }

    legalMoves(tokenIndex = this.moverToken()) {
        if (tokenIndex === null) return [];
        const token = this.tokens[tokenIndex];
        const moves = [];
        for (let pos = token.pos + 1; pos <= nextInn(token.pos); pos++) {
            if (this.canStop(tokenIndex, pos)) moves.push(pos);
        }
        return moves;
    }

    // ---- 操作 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.actors().includes(playerId)) return this.fail('今は操作できません');
        const handler = {
            choose: () => this.choose(playerId, command),
            move: () => this.move(playerId, command),
            buy: () => this.buy(playerId, command),
            donate: () => this.donate(playerId, command),
            encounter: () => this.pickEncounter(playerId, command),
            panorama: () => this.pickPanorama(playerId, command),
            meal: () => this.eat(playerId, command)
        }[command.type];
        // 記録する形（決まった項目だけを、写して残す）
        const recorded = { type: command.type };
        try {
            COMMAND_FIELDS[command.type].forEach(key => {
                if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
            });
        } catch {
            return this.fail('今はその操作はできません');
        }
        if (!handler()) return false;
        this.commands.push({ playerId, command: recorded });
        this.runQueue();
        return true;
    }

    choose(seat, { traveler }) {
        const p = this.players[seat];
        if (this.phase !== 'choose') return this.fail('旅人はもう選んでいます');
        if (typeof traveler !== 'string' || !p.offers.includes(traveler)) return this.fail('その旅人は選べません');
        p.traveler = traveler;
        if (this.players.every(q => q.traveler)) this.startJourney();
        return true;
    }

    startJourney() {
        this.players.forEach(p => { p.coins = TRAVELERS[p.traveler].coins; });
        this.phase = 'travel';
        this.emit({ type: 'start' });
        this.log(`旅立ち：${this.players.map(p => `${p.name}は${TRAVELERS[p.traveler].role}の${TRAVELERS[p.traveler].name}（${p.coins}文）`).join('、')}`);
    }

    move(seat, { to }) {
        if (this.phase !== 'travel' || this.pending) return this.fail('今は進めません');
        const t = this.moverToken();
        if (!Number.isInteger(to) || !this.legalMoves(t).includes(to)) return this.fail('そこには止まれません');
        const token = this.tokens[t];
        token.pos = to;
        token.seq = ++this.seq;
        const space = BOARD[to];
        const who = token.player === null ? '中立の旅人' : this.players[token.player].name;
        this.emit({ type: 'move', token: t, to });
        this.log(`${who}が${space.type === 'inn' ? INN_NAMES[space.inn] : SPACE_TYPES[space.type].name}へ`);
        if (token.player === null) this.neutralArrive(to);
        else this.arrive(token.player, to);
        return true;
    }

    // 止まったマスで行うことを並べる
    arrive(seat, pos) {
        const p = this.players[seat];
        const space = BOARD[pos];
        if (space.type !== 'inn') {
            this.queue.push({ step: space.type, seat });
            return;
        }
        this.queue.push({ step: 'inn', seat, pos });
        // 飛脚と絵師の力は、途中の3つの宿場だけ
        if (pos !== EDO) {
            if (p.traveler === 'hiroshige') this.queue.push({ step: 'hiroshige', seat });
            if (p.traveler === 'chuubei') this.queue.push({ step: 'encounter', seat });
        }
        this.queue.push({ step: 'meal', seat });
    }

    // 中立の旅人は、寺と宿場のほかでは何もしない
    neutralArrive(pos) {
        const t = this.tokens.findIndex(tok => tok.player === null);
        const type = BOARD[pos].type;
        if (type === 'temple') {
            this.tokens[t].donations += 1;
            this.log('中立の旅人が寺に1文を寄付');
        } else if (type === 'inn') {
            this.openInn(pos);
            if (this.inn.meals.length) {
                // 動かした人が、食事の札を1枚ランダムに捨てる（伏せたまま山の下へ）
                const i = Math.floor(this.random() * this.inn.meals.length);
                this.decks.meal.push(...this.inn.meals.splice(i, 1));
                this.log('中立の旅人が食事の札を1枚捨てた');
            }
        }
    }

    // 最初に着いた人が、旅人の数＋1枚の食事の札を引く
    openInn(pos) {
        if (this.inn?.pos === pos) return;
        this.inn = { pos, meals: this.decks.meal.splice(0, this.tokens.length + 1) };
    }

    // 並べたことを、選ぶのを待つところまで進める。全員が宿場に揃ったら食事を片付け、江戸なら終わり
    runQueue() {
        while (!this.pending && this.queue.length) this.runStep(this.queue.shift());
        if (this.pending || this.phase !== 'travel') return;
        if (this.inn && this.tokens.every(t => t.pos === this.inn.pos)) {
            const pos = this.inn.pos;
            this.decks.meal.push(...this.inn.meals);
            this.inn = null;
            if (pos === EDO) this.endGame();
            else this.log(`全員が${INN_NAMES[BOARD[pos].inn]}に揃った`);
        }
    }

    runStep({ step, seat, pos }) {
        const p = this.players[seat];
        switch (step) {
            case 'village': {
                const cards = this.decks.souvenir.splice(0, 3);
                if (!cards.length) {
                    this.log('土産の札が尽きていた');
                    return;
                }
                this.pending = { seat, kind: 'buy', cards };
                return;
            }
            case 'farm':
                p.coins += 3;
                this.emit({ type: 'coins', seat, amount: 3 });
                this.log(`${p.name}が3文をもらった`);
                return;
            case 'temple':
                this.pending = { seat, kind: 'donate', max: Math.min(3, p.coins) };
                return;
            case 'encounter':
                this.drawEncounter(seat);
                return;
            case 'spring': {
                const card = this.decks.spring.shift();
                if (!card) {
                    this.log('温泉の札が尽きていた');
                    return;
                }
                p.springs.push(card);
                const bonus = p.traveler === 'mitsukuni' ? 1 : 0;
                this.addPoints(p, 'spring', springValue(card) + bonus);
                this.emit({ type: 'spring', seat, card });
                this.log(`${p.name}が温泉で${springValue(card)}点${bonus ? '（＋1）' : ''}`);
                return;
            }
            case 'paddy': case 'mountain': case 'sea':
                this.takePanorama(seat, step);
                return;
            case 'inn':
                this.openInn(pos);
                return;
            case 'hiroshige':
                this.offerPanorama(seat, PANORAMA_KINDS, 'hiroshige');
                return;
            case 'meal':
                this.offerMeal(seat);
                return;
            default:
                throw new Error(`知らない手順: ${step}`);
        }
    }

    // ---- 店 ----

    buy(seat, { cards }) {
        const pending = this.pending;
        if (pending?.kind !== 'buy' || pending.seat !== seat) return this.fail('今は買えません');
        if (!Array.isArray(cards) || new Set(cards).size !== cards.length || !cards.every(c => pending.cards.includes(c))) return this.fail('その土産は並んでいません');
        const p = this.players[seat];
        const { pay, need } = souvenirCost(p.traveler, cards);
        if (need > p.coins) return this.fail('お金が足りません');
        this.pending = null;
        p.coins -= pay;
        this.gainSouvenirs(seat, cards);
        // 買わなかった札は、伏せて山の下へ
        this.decks.souvenir.push(...pending.cards.filter(c => !cards.includes(c)));
        this.log(cards.length ? `${p.name}が${cards.map(c => SOUVENIRS[c].name).join('・')}を${pay}文で買った` : `${p.name}は何も買わなかった`);
        return true;
    }

    gainSouvenirs(seat, cards) {
        const p = this.players[seat];
        const gain = souvenirGain(p.souvenirs, cards);
        p.souvenirs.push(...cards);
        this.addPoints(p, 'souvenir', gain);
        if (cards.length) this.emit({ type: 'souvenir', seat, cards: [...cards], points: gain });
    }

    // ---- 寺 ----

    donate(seat, { amount }) {
        const pending = this.pending;
        if (pending?.kind !== 'donate' || pending.seat !== seat) return this.fail('今は寄付できません');
        if (!Number.isInteger(amount) || amount < 1 || amount > pending.max) return this.fail('寄付は1〜3文です');
        const p = this.players[seat];
        this.pending = null;
        p.coins -= amount;
        // 僧は、場のお金1文を足して寄付する
        const extra = p.traveler === 'hirotada' ? 1 : 0;
        p.donations += amount + extra;
        this.addPoints(p, 'temple', amount + extra);
        this.emit({ type: 'donate', seat, amount: amount + extra });
        this.log(`${p.name}が寺に${amount}文${extra ? '（＋場の1文）' : ''}を寄付`);
        return true;
    }

    // ---- 出会い ----

    drawEncounter(seat) {
        const p = this.players[seat];
        if (p.traveler === 'yoshiyasu' && this.decks.encounter.length >= 2) {
            this.pending = { seat, kind: 'encounter', cards: this.decks.encounter.splice(0, 2) };
            return;
        }
        const card = this.decks.encounter.shift();
        if (!card) {
            this.log('出会いの札が尽きていた');
            return;
        }
        this.resolveEncounter(seat, card);
    }

    pickEncounter(seat, { card }) {
        const pending = this.pending;
        if (pending?.kind !== 'encounter' || pending.seat !== seat) return this.fail('今は選べません');
        if (!pending.cards.includes(card)) return this.fail('その札は引いていません');
        this.pending = null;
        // 選ばなかった札は、見せずに山の下へ
        this.decks.encounter.push(...pending.cards.filter(c => c !== card));
        this.resolveEncounter(seat, card);
        return true;
    }

    resolveEncounter(seat, card) {
        const p = this.players[seat];
        const kind = encounterKind(card);
        p.encounters.push(card);
        this.emit({ type: 'encounter', seat, card });
        this.log(`${p.name}が${ENCOUNTERS[kind].name}に出会った`);
        // 大道芸人は、効果の前に1点と1文
        if (p.traveler === 'umegae') {
            p.coins += 1;
            this.addPoints(p, 'encounter', 1);
        }
        switch (kind) {
            case 'shokunin': {
                const souvenir = this.decks.souvenir.shift();
                if (souvenir) {
                    this.gainSouvenirs(seat, [souvenir]);
                    this.log(`${p.name}が${SOUVENIRS[souvenir].name}をもらった`);
                }
                return;
            }
            case 'annaibito-paddy': case 'annaibito-mountain': case 'annaibito-sea': {
                const target = kind.split('-')[1];
                // 完成していれば、ほかの景色から選ぶ
                if (p.panoramas[target] < PANORAMAS[target].size) this.takePanorama(seat, target);
                else this.offerPanorama(seat, PANORAMA_KINDS.filter(k => k !== target), 'guide');
                return;
            }
            case 'samurai':
                this.addPoints(p, 'encounter', 3);
                return;
            case 'kuge':
                p.coins += 3;
                return;
            case 'miko':
                p.donations += 1;
                this.addPoints(p, 'temple', 1);
                return;
            default:
                throw new Error(`知らない出会い: ${card}`);
        }
    }

    // ---- 景色 ----

    // 完成していない景色から選ぶ（1つだけならそれを取る）
    offerPanorama(seat, kinds, reason) {
        const p = this.players[seat];
        const options = kinds.filter(k => p.panoramas[k] < PANORAMAS[k].size);
        if (options.length === 1) this.takePanorama(seat, options[0]);
        else if (options.length > 1) this.pending = { seat, kind: 'panorama', options, reason };
    }

    pickPanorama(seat, { kind }) {
        const pending = this.pending;
        if (pending?.kind !== 'panorama' || pending.seat !== seat) return this.fail('今は選べません');
        if (!pending.options.includes(kind)) return this.fail('その景色は選べません');
        this.pending = null;
        this.takePanorama(seat, kind);
        return true;
    }

    takePanorama(seat, kind) {
        const p = this.players[seat];
        p.panoramas[kind] += 1;
        const value = p.panoramas[kind];
        this.addPoints(p, 'panorama', value);
        this.emit({ type: 'panorama', seat, kind, value });
        this.log(`${p.name}が${PANORAMAS[kind].name}の景色${value}（${value}点）`);
        if (value === PANORAMAS[kind].size && this.panoramaFirst[kind] === null) {
            this.panoramaFirst[kind] = seat;
            this.award(p, kind);
            this.log(`${p.name}が最初に${PANORAMAS[kind].name}の景色を完成させた（${ACHIEVEMENT_POINTS}点）`);
        }
    }

    award(p, id) {
        p.achievements.push(id);
        this.addPoints(p, 'achievement', ACHIEVEMENT_POINTS + (p.traveler === 'mitsukuni' ? 1 : 0));
    }

    // ---- 宿場の食事 ----

    mealPrice(seat, card) {
        return mealCost(this.players[seat].traveler, card);
    }

    offerMeal(seat) {
        const p = this.players[seat];
        const meals = this.inn?.meals ?? [];
        const eaten = new Set(p.meals.map(dishOf));
        // 孤児には、並んだ札から1枚をランダムにただで出す（もう食べた料理なら、ただでは食べられない）
        let offer = null;
        if (p.traveler === 'satsuki' && meals.length) {
            offer = meals[Math.floor(this.random() * meals.length)];
            if (eaten.has(dishOf(offer))) offer = null;
        }
        const options = meals.filter(c => !eaten.has(dishOf(c)) && (c === offer || this.mealPrice(seat, c) <= p.coins));
        if (!options.length) {
            this.log(`${p.name}は食事なし`);
            return;
        }
        this.pending = { seat, kind: 'meal', options, offer };
    }

    eat(seat, { card }) {
        const pending = this.pending;
        if (pending?.kind !== 'meal' || pending.seat !== seat) return this.fail('今は食事を選べません');
        if (card !== null && !pending.options.includes(card)) return this.fail('その食事は選べません');
        const p = this.players[seat];
        this.pending = null;
        if (card === null) {
            this.log(`${p.name}は食事をしなかった`);
            return true;
        }
        const pay = card === pending.offer ? 0 : this.mealPrice(seat, card);
        p.coins -= pay;
        this.inn.meals.splice(this.inn.meals.indexOf(card), 1);
        p.meals.push(card);
        this.addPoints(p, 'meal', MEAL_POINTS);
        this.emit({ type: 'meal', seat, card });
        this.log(`${p.name}が${DISHES[dishOf(card)].name}を食べた（${pay}文）`);
        return true;
    }

    // ---- 終わり ----

    endGame() {
        // 寺の寄付の順位（中立の旅人も順位に入るが、点は取らない）
        const donations = this.tokens.map(t => (t.player === null ? t.donations : this.players[t.player].donations));
        const rank = templeRankPoints(donations);
        const temple = this.players.map(p => rank[p.id]);
        this.players.forEach(p => this.addPoints(p, 'temple', temple[p.id]));
        // 称号（同点は全員。1枚もなければ取れない）
        const awards = {
            gourmet: mostOf(this.players.map(p => mealPriceTotal(p.meals))),
            collector: mostOf(this.players.map(p => p.souvenirs.length)),
            bather: mostOf(this.players.map(p => p.springs.length)),
            chatterbox: mostOf(this.players.map(p => p.encounters.length))
        };
        Object.entries(awards).forEach(([id, seats]) => seats.forEach(seat => this.award(this.players[seat], id)));
        // 勝ち：点の多い人。同点なら称号の多い人。それも同じなら全員
        const best = Math.max(...this.players.map(p => p.score));
        const top = this.players.filter(p => p.score === best);
        const most = Math.max(...top.map(p => p.achievements.length));
        this.winners = top.filter(p => p.achievements.length === most).map(p => p.id);
        this.result = { temple, neutralDonations: this.tokens.find(t => t.player === null)?.donations ?? null, awards };
        this.phase = 'end';
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`寺の寄付の順位：${this.players.map(p => `${p.name} ${temple[p.id]}点`).join('・')}`);
        Object.entries(awards).forEach(([id, seats]) => {
            if (seats.length) this.log(`${ACHIEVEMENTS[id].name}：${seats.map(s => this.players[s].name).join('・')}`);
        });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ち`);
    }

    // ---- 共通 ----

    addPoints(p, category, n) {
        p.points[category] += n;
        p.score += n;
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
