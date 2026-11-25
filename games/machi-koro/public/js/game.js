/**
 * 街コロの進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（サイコロの目はシードから決まる）
 *
 * ルール
 * - 準備：各自、麦畑とパン屋を1つずつと、3コインを持つ。ランドマーク4つ（駅・ショッピングモール・遊園地・電波塔）は工事中
 *   市場には15種の施設を全部並べる（紫は4枚ずつ、ほかは6枚ずつ）
 * - 手番：
 *   1. サイコロを振る（駅があれば1個か2個を選ぶ。2個なら合計）。電波塔があれば、1回だけ振り直せる
 *   2. 出目の施設が働く。順番は 赤 → 緑と青 → 紫
 *      赤：振った人以外が持つ施設。振った人から受け取る。複数の人なら、振った人から反時計回りの順に払う
 *      払えない分は免除（コインは0より減らない）
 *      緑：振った人の施設。銀行から / 青：全員の施設。銀行から / 紫：振った人の施設。ほかの人から
 *   3. 施設を1つ建てるか、ランドマークを1つ完成させる（建てなくてもよい）。紫は同じ種類を1人1つまで
 * - 遊園地があって、2個でゾロ目を出したら、この番のあとにもう1回自分の番
 * - ランドマーク4つを最初に完成させた人の勝ち（完成させた時点で終わる）
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 銀行のコインは尽きない
 * - 電波塔の振り直しは、最初と同じ個数で振る。振り直したら、その目に従う
 * - 遊園地は、振った時点で完成していれば働く（ゾロ目を出した番に遊園地を完成させても、もう1回はない）
 * - 振った人が複数の紫を持つときは、スタジアム → テレビ局 → ビジネスセンターの順に働く
 * - スタジアムは、振った人から反時計回りの順に集める
 * - テレビ局は、ほかの人が1人だけなら自動でその人から取る。コインのない人も選べる
 * - ビジネスセンターの交換は任意。紫どうしは交換できない（最初の麦畑とパン屋は交換できる）
 */

import { createRandom } from './random.js';
import {
    ESTABLISHMENTS, ESTABLISHMENT_ORDER, LANDMARKS, LANDMARK_ORDER,
    STARTING_CARDS, STARTING_COINS, MARK_MEMBERS, isMajor
} from './cards.js';

export { ESTABLISHMENTS, ESTABLISHMENT_ORDER, LANDMARKS, LANDMARK_ORDER };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
const MAX_LOGS = 300;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    roll: ['dice'], reroll: [], keep: [],
    tv: ['target'], trade: ['give', 'target', 'take'], skipTrade: [],
    build: ['card'], pass: []
};

// その人の施設1つが、働いたときに得るコイン（紫のビジネスセンターは0）
// 赤とパンの印は、ショッピングモールで+1。工場と市場は、自分の印の施設の数で決まる
export function cardIncome(player, key, playerCount) {
    const card = ESTABLISHMENTS[key];
    if (card.per) return card.gain * MARK_MEMBERS[card.per].reduce((sum, k) => sum + (player.cards[k] ?? 0), 0);
    if (key === 'stadium') return card.gain * (playerCount - 1);
    const mall = player.landmarks.mall && (card.mark === 'bread' || card.mark === 'cup') ? 1 : 0;
    return card.gain + mall;
}

export const landmarkCount = (player) => LANDMARK_ORDER.filter(k => player.landmarks[k]).length;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、目がずれないように）
        const drawn = Math.floor(this.random() * players.length);
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            coins: STARTING_COINS,
            cards: { ...STARTING_CARDS },
            landmarks: Object.fromEntries(LANDMARK_ORDER.map(k => [k, false]))
        }));
        this.supply = Object.fromEntries(ESTABLISHMENT_ORDER.map(k => [k, ESTABLISHMENTS[k].count]));
        this.current = this.options.startPlayer;
        this.turn = 1;
        this.phase = 'roll';        // roll：振る / reroll：振り直すか決める / tv：テレビ局の相手 / trade：ビジネスセンター / build：建てる / end：終わり
        this.dice = [];             // この番の目
        this.rerolled = false;
        this.parkAtRoll = false;    // 振った時点で遊園地があったか
        this.pending = [];          // まだ働いていない紫（tv・trade）
        this.winner = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.currentPlayer.name}の番から始めます`);
    }

    get currentPlayer() {
        return this.players[this.current];
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人
    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    get diceSum() {
        return this.dice.reduce((s, d) => s + d, 0);
    }

    get isDoubles() {
        return this.dice.length === 2 && this.dice[0] === this.dice[1];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            roll: { roll: this.roll },
            reroll: { reroll: this.reroll, keep: this.keep },
            tv: { tv: this.useTv },
            trade: { trade: this.trade, skipTrade: this.skipTrade },
            build: { build: this.build, pass: this.pass }
        }[this.phase]?.[command.type];
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

    // ---- 振る ----

    canRollTwo(seat) {
        return this.players[seat].landmarks.station;
    }

    roll(seat, { dice }) {
        if (dice !== 1 && dice !== 2) return this.fail('サイコロの数が正しくありません');
        if (dice === 2 && !this.canRollTwo(seat)) return this.fail('駅がないので、2個は振れません');
        this.parkAtRoll = this.players[seat].landmarks.park;
        this.throwDice(seat, dice);
        if (this.players[seat].landmarks.tower) {
            this.phase = 'reroll';
            return true;
        }
        this.resolve();
        return true;
    }

    reroll(seat) {
        this.rerolled = true;
        this.log(`${this.players[seat].name}が振り直しました`);
        this.throwDice(seat, this.dice.length);
        this.resolve();
        return true;
    }

    keep() {
        this.resolve();
        return true;
    }

    throwDice(seat, count) {
        this.dice = Array.from({ length: count }, () => 1 + Math.floor(this.random() * 6));
        this.emit({ type: 'roll', seat, dice: [...this.dice], reroll: this.rerolled });
        this.log(`${this.players[seat].name}：${this.dice.join('＋')}${count === 2 ? `＝${this.diceSum}` : ''}`);
    }

    // ---- 出目の施設が働く（赤 → 緑と青 → 紫） ----

    resolve() {
        const sum = this.diceSum;
        const roller = this.current;
        const n = this.players.length;
        const hits = (key) => ESTABLISHMENTS[key].rolls.includes(sum);

        // 赤：振った人から反時計回り
        for (let k = 1; k < n; k++) {
            const owner = this.players[(roller - k + n) % n];
            ESTABLISHMENT_ORDER.filter(key => ESTABLISHMENTS[key].color === 'red' && hits(key) && owner.cards[key]).forEach(key => {
                const owed = owner.cards[key] * cardIncome(owner, key, n);
                this.transfer(roller, owner.id, owed, key);
            });
        }
        // 緑（振った人だけ）と青（全員）。どちらも銀行からなので、振った人から時計回りに
        for (let k = 0; k < n; k++) {
            const owner = this.players[(roller + k) % n];
            ESTABLISHMENT_ORDER.filter(key => hits(key) && owner.cards[key]).forEach(key => {
                const color = ESTABLISHMENTS[key].color;
                if (color === 'blue' || (color === 'green' && owner.id === roller)) {
                    this.gainFromBank(owner.id, owner.cards[key] * cardIncome(owner, key, n), key);
                }
            });
        }
        // 紫（振った人だけ）
        this.pending = [];
        const me = this.players[roller];
        if (hits('stadium') && me.cards.stadium) {
            for (let k = 1; k < n; k++) this.transfer((roller - k + n) % n, roller, ESTABLISHMENTS.stadium.gain, 'stadium');
        }
        if (hits('tv') && me.cards.tv) this.pending.push('tv');
        if (hits('business') && me.cards.business) this.pending.push('trade');
        this.nextPending();
    }

    nextPending() {
        const next = this.pending.shift();
        if (next === 'tv') {
            const others = this.players.filter(p => p.id !== this.current);
            if (others.length === 1) {
                this.takeTv(others[0].id);
                return this.nextPending();
            }
            this.phase = 'tv';
            return;
        }
        if (next === 'trade') {
            this.phase = 'trade';
            return;
        }
        this.phase = 'build';
    }

    tvTargets(seat) {
        return this.players.filter(p => p.id !== seat).map(p => p.id);
    }

    useTv(seat, { target }) {
        if (!this.tvTargets(seat).includes(target)) return this.fail('その人からは取れません');
        this.takeTv(target);
        this.nextPending();
        return true;
    }

    takeTv(target) {
        this.transfer(target, this.current, ESTABLISHMENTS.tv.gain, 'tv');
    }

    // 交換に出せる施設（紫以外で、持っているもの）
    tradeable(seat) {
        return ESTABLISHMENT_ORDER.filter(key => !isMajor(key) && this.players[seat].cards[key] > 0);
    }

    trade(seat, { give, target, take }) {
        if (!Number.isInteger(target) || target === seat || !this.players[target]) return this.fail('交換する相手が正しくありません');
        if (!this.tradeable(seat).includes(give)) return this.fail('出す施設が正しくありません');
        if (!this.tradeable(target).includes(take)) return this.fail('もらう施設が正しくありません');
        const me = this.players[seat];
        const other = this.players[target];
        this.moveCard(me, other, give);
        this.moveCard(other, me, take);
        this.emit({ type: 'trade', seat, target, give, take });
        this.log(`${me.name}が${ESTABLISHMENTS[give].name}を出し、${other.name}の${ESTABLISHMENTS[take].name}と交換しました`);
        this.nextPending();
        return true;
    }

    skipTrade() {
        this.nextPending();
        return true;
    }

    moveCard(from, to, key) {
        from.cards[key] -= 1;
        if (!from.cards[key]) delete from.cards[key];
        to.cards[key] = (to.cards[key] ?? 0) + 1;
    }

    // ---- 建てる ----

    // 建てられるもの（施設のキーとランドマークのキー）
    buildable(seat) {
        const p = this.players[seat];
        const list = ESTABLISHMENT_ORDER.filter(key => this.canBuild(seat, key));
        LANDMARK_ORDER.forEach(key => { if (!p.landmarks[key] && p.coins >= LANDMARKS[key].cost) list.push(key); });
        return list;
    }

    canBuild(seat, key) {
        const p = this.players[seat];
        if (LANDMARKS[key]) return !p.landmarks[key] && p.coins >= LANDMARKS[key].cost;
        const card = ESTABLISHMENTS[key];
        if (!card) return false;
        return this.supply[key] > 0 && p.coins >= card.cost && !(isMajor(key) && p.cards[key]);
    }

    build(seat, { card }) {
        const p = this.players[seat];
        if (typeof card !== 'string' || !(Object.hasOwn(ESTABLISHMENTS, card) || Object.hasOwn(LANDMARKS, card))) return this.fail('その施設はありません');
        if (LANDMARKS[card]) {
            if (p.landmarks[card]) return this.fail('もう完成しています');
            if (p.coins < LANDMARKS[card].cost) return this.fail('コインが足りません');
            p.coins -= LANDMARKS[card].cost;
            p.landmarks[card] = true;
            this.emit({ type: 'build', seat, card, landmark: true, cost: LANDMARKS[card].cost });
            this.log(`${p.name}が${LANDMARKS[card].name}を完成させました`);
            if (landmarkCount(p) === LANDMARK_ORDER.length) {
                this.winner = seat;
                this.phase = 'end';
                this.emit({ type: 'win', seat });
                this.log(`${p.name}がランドマークを全部完成させて勝ちました`);
                return true;
            }
        } else {
            const info = ESTABLISHMENTS[card];
            if (this.supply[card] <= 0) return this.fail('売り切れです');
            if (isMajor(card) && p.cards[card]) return this.fail('紫の施設は、同じものを1つまでです');
            if (p.coins < info.cost) return this.fail('コインが足りません');
            p.coins -= info.cost;
            this.supply[card] -= 1;
            p.cards[card] = (p.cards[card] ?? 0) + 1;
            this.emit({ type: 'build', seat, card, landmark: false, cost: info.cost });
            this.log(`${p.name}が${info.name}を建てました`);
        }
        this.endTurn();
        return true;
    }

    pass(seat) {
        this.log(`${this.players[seat].name}は建てませんでした`);
        this.endTurn();
        return true;
    }

    endTurn() {
        const again = this.isDoubles && this.parkAtRoll;
        if (again) {
            this.log(`ゾロ目なので、${this.currentPlayer.name}がもう1回`);
        } else {
            this.current = (this.current + 1) % this.players.length;
        }
        this.turn += 1;
        this.phase = 'roll';
        this.dice = [];
        this.rerolled = false;
        this.parkAtRoll = false;
        this.pending = [];
        this.emit({ type: 'turn', seat: this.current, again });
    }

    // ---- コインの出入り ----

    // from から to へ。払えない分は免除
    transfer(from, to, owed, card) {
        const amount = Math.min(owed, this.players[from].coins);
        this.players[from].coins -= amount;
        this.players[to].coins += amount;
        this.emit({ type: 'pay', from, to, amount, owed, card });
        const name = ESTABLISHMENTS[card].name;
        this.log(amount === owed
            ? `${this.players[to].name}の${name}：${this.players[from].name}から${amount}コイン`
            : `${this.players[to].name}の${name}：${this.players[from].name}から${amount}コイン（${owed}のうち）`);
    }

    gainFromBank(to, amount, card) {
        if (amount <= 0) return;
        this.players[to].coins += amount;
        this.emit({ type: 'pay', from: null, to, amount, owed: amount, card });
        this.log(`${this.players[to].name}の${ESTABLISHMENTS[card].name}：${amount}コイン`);
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
