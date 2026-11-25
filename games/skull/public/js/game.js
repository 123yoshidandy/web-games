/**
 * スカルの進行（3〜6人）
 * DOM に依存しない。受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる
 * （最初の人と、ドクロで失敗したときに取り除く札はシードから決まる）
 *
 * ルール
 * - 各自、花3枚・ドクロ1枚の札と、コースター（表裏）を持つ
 * - ラウンドの始めに、札の残っている全員が1枚伏せる（ante）
 * - 手番（turn）には、手札から1枚を伏せて自分の山に重ねるか、挑戦（めくる枚数を宣言）する。手札がなければ挑戦する
 * - 挑戦が始まったら（bid）、順に、より大きな数に上げるか、パス（このラウンドは降りる）。1人だけ残るか、伏せた札の合計まで上がったら終わり
 * - 最大の宣言をした人が、まず自分の山を上から全部めくり、それからほかの人の山の上から好きにめくる（reveal）。1枚ずつ
 *   - 宣言の数だけ花が出たら成功。コースターを裏返し、2回目の成功で勝ち
 *   - ドクロが出たら失敗。ほかの人のドクロなら、失敗した人の札から1枚を見ずに取り除く（シードの乱数で決める）
 *     自分のドクロなら、自分で選んで1枚取り除く（lose）
 * - 札が0枚になった人は脱落。最後の1人も勝ち
 * - 次のラウンドは、挑戦した人から。挑戦した人が脱落したら、ほかの人のドクロならその持ち主から、自分のドクロなら次の人から
 */

import { createRandom } from './random.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const WINS_NEEDED = 2;
export const FLOWER = 'F';
export const SKULL = 'S';
export const COMMAND_FIELDS = { place: ['disc'], challenge: ['bid'], raise: ['bid'], pass: [], flip: ['target'], lose: ['disc'] };
const MAX_LOGS = 400;
const MAX_EVENTS = 150;

const countOf = (list, disc) => list.filter(d => d === disc).length;

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            discs: { F: 3, S: 1 },  // 持っている札（伏せた札も含む）
            stack: [],              // 伏せた札（下から上へ）
            revealed: 0,            // めくられた枚数（上から）
            wins: 0,                // 成功の数（1でコースターが裏返る）
            out: false,
            lost: 0                 // 取り除かれた札の数（公開）
        }));
        this.round = 0;
        this.start = Math.floor(this.random() * players.length);
        this.winner = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    // ---- 状態 ----

    hand(seat) {
        const p = this.players[seat];
        return { F: p.discs.F - countOf(p.stack, FLOWER), S: p.discs.S - countOf(p.stack, SKULL) };
    }

    handCount(seat) {
        const h = this.hand(seat);
        return h.F + h.S;
    }

    discCount(seat) {
        const p = this.players[seat];
        return p.discs.F + p.discs.S;
    }

    totalOnMats() {
        return this.players.reduce((s, p) => s + p.stack.length, 0);
    }

    activeSeats() {
        return this.players.filter(p => !p.out).map(p => p.id);
    }

    nextActive(seat, skip = () => false) {
        const n = this.players.length;
        for (let i = 1; i <= n; i++) {
            const s = (seat + i) % n;
            if (!this.players[s].out && !skip(s)) return s;
        }
        return null;
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        if (this.phase === 'ante') return this.activeSeats().filter(s => this.players[s].stack.length === 0);
        if (this.phase === 'end') return [];
        return [this.current];
    }

    // ---- ラウンド ----

    startRound() {
        this.round++;
        for (const p of this.players) {
            p.stack = [];
            p.revealed = 0;
        }
        this.phase = 'ante';
        this.current = null;
        this.bid = 0;
        this.bidder = null;
        this.passed = [];
        this.challenger = null;
        this.flipped = 0;
        this.emit({ type: 'round', round: this.round, start: this.start });
        this.log(`第${this.round}ラウンド：全員が1枚伏せます（${this.players[this.start].name}から）`);
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!Number.isInteger(playerId) || !this.players[playerId]) return this.fail('席が正しくありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { if (command[k] !== undefined) recorded[k] = command[k]; });
        const handler = { place: this.place, challenge: this.challenge, raise: this.raise, pass: this.pass, flip: this.flip, lose: this.lose }[command.type];
        if (!handler.call(this, playerId, recorded)) return false;
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'place', disc: 'F'|'S' }：最初の1枚（ante）か、手番に伏せる
    place(seat, { disc }) {
        if (this.phase !== 'ante' && this.phase !== 'turn') return this.fail('札を伏せる場面ではありません');
        if (disc !== FLOWER && disc !== SKULL) return this.fail('花かドクロを選んでください');
        if (this.hand(seat)[disc] <= 0) return this.fail(disc === SKULL ? 'ドクロは手札にありません' : '花は手札にありません');
        const p = this.players[seat];
        p.stack.push(disc);
        this.emit({ type: 'place', seat, count: p.stack.length });
        if (this.phase === 'ante') {
            if (this.actors().length === 0) {
                this.phase = 'turn';
                this.current = this.players[this.start].out ? this.nextActive(this.start) : this.start;
                this.log(`全員が1枚伏せました。${this.players[this.current].name}の番です`);
            }
            return true;
        }
        this.log(`${p.name}が札を伏せました（${p.stack.length}枚目）`);
        this.current = this.nextActive(seat);
        return true;
    }

    // { type: 'challenge', bid }：めくる枚数を宣言して、挑戦を始める
    challenge(seat, { bid }) {
        if (this.phase !== 'turn') return this.fail('挑戦を始める場面ではありません');
        const total = this.totalOnMats();
        if (!Number.isInteger(bid) || bid < 1 || bid > total) return this.fail(`1〜${total}の数を宣言してください`);
        this.phase = 'bid';
        this.bid = bid;
        this.bidder = seat;
        this.passed = [];
        this.emit({ type: 'bid', seat, bid, first: true });
        this.log(`${this.players[seat].name}が挑戦！ ${bid}枚めくると宣言しました`);
        this.afterBid(seat);
        return true;
    }

    // { type: 'raise', bid }：より大きな数に上げる
    raise(seat, { bid }) {
        if (this.phase !== 'bid') return this.fail('数を上げる場面ではありません');
        const total = this.totalOnMats();
        if (!Number.isInteger(bid) || bid <= this.bid || bid > total) return this.fail(`${this.bid + 1}〜${total}の数を宣言してください`);
        this.bid = bid;
        this.bidder = seat;
        this.emit({ type: 'bid', seat, bid });
        this.log(`${this.players[seat].name}が${bid}枚に上げました`);
        this.afterBid(seat);
        return true;
    }

    pass(seat) {
        if (this.phase !== 'bid') return this.fail('パスする場面ではありません');
        this.passed.push(seat);
        this.emit({ type: 'pass', seat });
        this.log(`${this.players[seat].name}はパスしました`);
        const remaining = this.activeSeats().filter(s => !this.passed.includes(s));
        if (remaining.length === 1) this.beginReveal();
        else this.current = this.nextActive(seat, s => this.passed.includes(s) || s === this.bidder);
        return true;
    }

    afterBid(seat) {
        const remaining = this.activeSeats().filter(s => !this.passed.includes(s));
        if (this.bid === this.totalOnMats() || remaining.length === 1) {
            this.beginReveal();
            return;
        }
        this.current = this.nextActive(seat, s => this.passed.includes(s) || s === this.bidder);
    }

    beginReveal() {
        this.phase = 'reveal';
        this.challenger = this.bidder;
        this.current = this.bidder;
        this.flipped = 0;
        this.emit({ type: 'reveal', seat: this.bidder, bid: this.bid });
        this.log(`${this.players[this.bidder].name}が${this.bid}枚めくります。まず自分の山から`);
    }

    // { type: 'flip', target }：target の山の、まだめくっていない一番上をめくる
    flip(seat, { target }) {
        if (this.phase !== 'reveal') return this.fail('めくる場面ではありません');
        const t = this.players[target];
        if (!Number.isInteger(target) || !t) return this.fail('めくる山を選んでください');
        if (t.revealed >= t.stack.length) return this.fail('その山はもう全部めくりました');
        const me = this.players[seat];
        if (target !== seat && me.revealed < me.stack.length) return this.fail('先に自分の山を全部めくります');
        const disc = t.stack[t.stack.length - 1 - t.revealed];
        t.revealed++;
        this.flipped++;
        this.emit({ type: 'flip', seat, target, disc, index: t.revealed, flipped: this.flipped, bid: this.bid });
        if (disc === SKULL) {
            this.log(`${t.name}の山からドクロ！ ${me.name}の挑戦は失敗です`);
            this.failChallenge(seat, target);
        } else if (this.flipped === this.bid) {
            this.succeed(seat);
        }
        return true;
    }

    succeed(seat) {
        const p = this.players[seat];
        p.wins++;
        this.emit({ type: 'success', seat, wins: p.wins });
        this.log(`${p.name}の挑戦は成功！${p.wins >= WINS_NEEDED ? '' : 'コースターを裏返しました'}`);
        if (p.wins >= WINS_NEEDED) return this.finish(seat, 'wins');
        this.start = seat;
        this.startRound();
    }

    failChallenge(seat, owner) {
        this.skullOwner = owner;
        if (owner === seat) {
            // 自分のドクロ：取り除く札を自分で選ぶ
            this.phase = 'lose';
            this.current = seat;
            return;
        }
        // ほかの人のドクロ：持ち主が、失敗した人の札から1枚を見ずに取り除く
        const p = this.players[seat];
        const pick = Math.floor(this.random() * (p.discs.F + p.discs.S));
        this.removeDisc(seat, pick < p.discs.F ? FLOWER : SKULL, owner);
    }

    // { type: 'lose', disc }：自分のドクロで失敗したとき、取り除く札を選ぶ
    lose(seat, { disc }) {
        if (this.phase !== 'lose') return this.fail('札を取り除く場面ではありません');
        if (disc !== FLOWER && disc !== SKULL) return this.fail('花かドクロを選んでください');
        if (this.players[seat].discs[disc] <= 0) return this.fail('その札は持っていません');
        this.removeDisc(seat, disc, seat);
        return true;
    }

    removeDisc(seat, disc, by) {
        // 挑戦が終わったので、伏せた札を手札に戻してから取り除く
        for (const x of this.players) {
            x.stack = [];
            x.revealed = 0;
        }
        const p = this.players[seat];
        p.discs[disc]--;
        p.lost++;
        // 取り除いた札の種類は、本人にしか見えない（ビューで隠す）
        this.emit({ type: 'lost', seat, by, disc });
        this.log(`${p.name}の札が1枚取り除かれました（残り${p.discs.F + p.discs.S}枚）`);
        if (p.discs.F + p.discs.S === 0) {
            p.out = true;
            this.emit({ type: 'out', seat });
            this.log(`${p.name}は札がなくなり、脱落しました`);
        }
        const active = this.activeSeats();
        if (active.length === 1) return this.finish(active[0], 'last');
        // 次のラウンドを始める人
        if (!p.out) this.start = seat;
        else if (by !== seat) this.start = by;
        else this.start = this.nextActive(seat);
        this.startRound();
    }

    finish(seat, reason) {
        this.winner = seat;
        this.phase = 'end';
        this.current = null;
        this.emit({ type: 'end', winner: seat, reason });
        this.log(`${this.players[seat].name}の勝ちです（${reason === 'wins' ? '2回成功' : '最後の1人'}）`);
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

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
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
