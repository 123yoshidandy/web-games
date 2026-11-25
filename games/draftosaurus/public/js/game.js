/**
 * ドラフトザウルス（基本ゲーム・夏の面）のゲーム本体
 * DOM に依存しない。操作は applyCommand(seat, command) の 1 か所から受け付け、受け付けた操作だけを commands に記録する
 * Game.replay(players, options, commands) で、同じ状態を作り直せる（袋から引く恐竜とダイスの目もシード付きの乱数）
 *
 * 袋には人数に応じた数を入れる（rulesFor）。各ラウンドの初めに全員が袋から 6 匹を取る。手番ごとに、ダイスを振る人が配置ダイスを振り、
 * 全員が同時に 1 匹を選んで自分の公園に置く（ダイスを振った人は、ダイスの決まりを受けない）。
 * 全員がそろったら公開し、残りを左へ渡す（どのラウンドも左）。6 手番 × 2 ラウンド
 * 2 人のときは、置いて公開したあと、それぞれが手からもう 1 匹を選んで箱に戻し、残りの手を交換する。3 手番 × 4 ラウンド
 * （最後の手番で手に 1 匹だけ残るときは、選ぶまでもないので自動で箱に戻す）
 *
 * 操作：
 *   { type: 'place', dino, zone }  手の dino（種類）を、公園の zone（場所）に置く
 *   { type: 'discard', dino }      2 人のとき、手の dino を箱に戻す
 */

import { createRandom, createSeed, shuffle } from './random.js';
import { SPECIES_KEYS, PER_SPECIES, HAND_SIZE, DIE_KEYS, ZONE_KEYS, rulesFor } from './dinos.js';
import { emptyPark, legalZones, scorePark, countSpecies } from './park.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const EVENT_KEEP = 200;

// 席の番号が 1 つ増える向きを「左」とする
export const leftOf = (seat, n) => (seat + 1) % n;
export const rightOf = (seat, n) => (seat + n - 1) % n;

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, cpuLevel }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は ${MIN_PLAYERS}〜${MAX_PLAYERS} 人です`);
        const seed = (options.seed ?? createSeed()) >>> 0;
        this.options = { ...options, seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({ id, name: p.name, isCPU: !!p.isCPU }));
        this.rules = rulesFor(this.n);
        this.bag = shuffle(SPECIES_KEYS.flatMap(s => Array(PER_SPECIES - this.rules.boxed).fill(s)), this.random);
        // 2 人のとき、手番ごとに箱に戻した恐竜（誰にも見せない）
        this.box = [];
        this.parks = this.players.map(() => emptyPark());
        // 最初にダイスを振る人
        this.firstRoller = Math.floor(this.random() * this.n);
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.scores = null;
        this.startRound(1);
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ seat, command }, i) => {
            if (!game.applyCommand(seat, command)) throw new Error(`記録の ${i} 番目の操作を再現できません：${game.lastError}`);
        });
        return game;
    }

    get n() {
        return this.players.length;
    }

    isOver() {
        return this.phase === 'end';
    }

    addEvent(event) {
        this.eventSeq++;
        this.events.push({ seq: this.eventSeq, round: this.round, turn: this.turn, ...event });
        if (this.events.length > EVENT_KEEP) this.events.splice(0, this.events.length - EVENT_KEEP);
    }

    // どのラウンドも左へ渡す（2 人のときは交換になる）
    get direction() {
        return 'left';
    }

    // ---------- ラウンドと手番 ----------

    startRound(round) {
        this.round = round;
        this.hands = this.players.map(() => this.bag.splice(0, HAND_SIZE));
        this.turn = 1;
        this.addEvent({ type: 'round', round });
        this.startTurn();
    }

    // ダイスは手番ごとに左の人へ移る
    startTurn() {
        const index = (this.round - 1) * this.rules.turns + (this.turn - 1);
        this.roller = (this.firstRoller + index) % this.n;
        this.die = DIE_KEYS[Math.floor(this.random() * DIE_KEYS.length)];
        this.phase = 'choose';
        this.waiting = this.players.map(p => p.id);
        this.pending = {};
        this.addEvent({ type: 'roll', roller: this.roller, die: this.die });
    }

    // ---------- 判定 ----------

    zonesFor(seat, dino) {
        return legalZones(this.parks[seat], dino, this.die, seat === this.roller);
    }

    validate(seat, command) {
        if (!command || typeof command !== 'object') return '操作の形が正しくありません';
        if (this.phase === 'end') return 'ゲームは終わっています';
        if (command.type !== 'place' && command.type !== 'discard') return '知らない操作です';
        if (!this.waiting.includes(seat)) return '今は選べません';
        if (command.type !== (this.phase === 'discard' ? 'discard' : 'place')) return this.phase === 'discard' ? '箱に戻す恐竜を選んでください' : '今は箱に戻せません';
        if (this.pending[seat]) return 'もう選んでいます';
        if (!this.hands[seat].includes(command.dino)) return '手にいない恐竜です';
        if (command.type === 'discard') return null;
        if (!ZONE_KEYS.includes(command.zone)) return '知らない場所です';
        if (!this.zonesFor(seat, command.dino).includes(command.zone)) return 'そこには置けません';
        return null;
    }

    applyCommand(seat, command) {
        this.lastError = this.validate(seat, command);
        if (this.lastError) return false;
        const clean = command.type === 'discard' ? { type: 'discard', dino: command.dino } : { type: 'place', dino: command.dino, zone: command.zone };
        this.commands.push({ seat, command: clean });
        this.pending[seat] = clean;
        this.addEvent({ type: 'chosen', seat });
        if (this.waiting.every(s => this.pending[s])) {
            if (this.phase === 'discard') this.resolveDiscard();
            else this.resolveTurn();
        }
        return true;
    }

    // ---------- 公開と配置 ----------

    resolveTurn() {
        const placements = this.players.map(p => {
            const { dino, zone } = this.pending[p.id];
            const hand = this.hands[p.id];
            hand.splice(hand.indexOf(dino), 1);
            this.parks[p.id][zone].push(dino);
            return { seat: p.id, dino, zone };
        });
        this.addEvent({ type: 'reveal', placements, roller: this.roller, die: this.die });
        this.pending = {};
        if (this.rules.discard && this.hands.some(h => h.length > 0)) {
            // 手に 1 匹だけなら、選ぶまでもないので、そのまま箱に戻す
            if (this.hands.every(h => h.length <= 1)) {
                this.players.forEach(p => { this.pending[p.id] = { type: 'discard', dino: this.hands[p.id][0] }; });
                this.resolveDiscard();
                return;
            }
            this.phase = 'discard';
            this.waiting = this.players.map(p => p.id);
            this.addEvent({ type: 'discard-start' });
            return;
        }
        this.endTurn();
    }

    // 2 人のとき：選んだ恐竜を箱に戻す（何を戻したかは見せない）
    resolveDiscard() {
        this.players.forEach(p => {
            const { dino } = this.pending[p.id];
            const hand = this.hands[p.id];
            if (dino === undefined) return;
            hand.splice(hand.indexOf(dino), 1);
            this.box.push(dino);
        });
        this.addEvent({ type: 'discarded' });
        this.pending = {};
        this.endTurn();
    }

    endTurn() {
        this.passHands();
        if (this.turn < this.rules.turns) {
            this.turn++;
            this.startTurn();
            return;
        }
        if (this.round < this.rules.rounds) this.startRound(this.round + 1);
        else this.finish();
    }

    passHands() {
        const next = this.players.map(() => []);
        const to = this.direction === 'left' ? leftOf : rightOf;
        this.hands.forEach((hand, seat) => { next[to(seat, this.n)] = hand; });
        this.hands = next;
        this.addEvent({ type: 'pass', direction: this.direction });
    }

    finish() {
        this.phase = 'end';
        this.waiting = [];
        this.scores = this.players.map(p => scorePark(this.parks, p.id));
        this.addEvent({ type: 'end', scores: this.scores, ranking: this.ranking() });
    }

    // 順位：点の合計、同じならティラノサウルスの少ない人。それも同じなら同じ順位
    ranking() {
        const key = s => [this.scores[s].total, countSpecies(this.parks[s], 'trex')];
        const better = (a, b) => key(a)[0] > key(b)[0] || (key(a)[0] === key(b)[0] && key(a)[1] < key(b)[1]);
        const seats = this.players.map(p => p.id).sort((a, b) => key(b)[0] - key(a)[0] || key(a)[1] - key(b)[1] || a - b);
        return seats.map(seat => ({
            seat, total: this.scores[seat].total, trex: key(seat)[1],
            rank: 1 + seats.filter(s => better(s, seat)).length
        }));
    }

    winners() {
        return this.isOver() ? this.ranking().filter(r => r.rank === 1).map(r => r.seat) : [];
    }
}
