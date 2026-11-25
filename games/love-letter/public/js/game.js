/**
 * ラブレター（2019 年の改訂版）のゲーム本体
 * DOM に依存しない。操作は applyCommand(seat, command) の 1 か所から受け付け、受け付けた操作だけを commands に記録する
 * Game.replay(players, options, commands) で、同じ状態を作り直せる（山札もシード付きの乱数で切る）
 *
 * 操作：
 *   { type: 'play', card, target, guess }  手札から card（値）を出す。target：選ぶ人（選べる人がいなければ null）、guess：兵士で言い当てる値
 *   { type: 'keep', card, bottom }        宰相：残す 1 枚と、山札の下に戻す順（bottom の最後が一番下）
 *
 * 隠された情報：手札・山札・伏せて除外したカード。誰が何を知っているかを knowledge[見た人][持ち主] に持ち、
 * ビューでは自分の知っていることだけを渡す（イベントの secret も、関係者にだけ渡す）
 */

import { createRandom, createSeed, shuffle } from './random.js';
import { fullDeck, TOKENS_TO_WIN, TARGETS_OTHER, GUARD, PRIEST, BARON, HANDMAID, PRINCE, CHANCELLOR, KING, COUNTESS, PRINCESS, SPY, VALUES } from './cards.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const EVENT_KEEP = 300;

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, cpuLevel }（cpuLevel などは記録と一緒に残すだけ）
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は ${MIN_PLAYERS}〜${MAX_PLAYERS} 人です`);
        const seed = (options.seed ?? createSeed()) >>> 0;
        this.options = { ...options, seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({ id, name: p.name, isCPU: !!p.isCPU, tokens: 0 }));
        this.tokensToWin = TOKENS_TO_WIN[players.length];
        this.round = 0;
        this.winner = null;
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound(Math.floor(this.random() * players.length));
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
        this.events.push({ seq: this.eventSeq, round: this.round, ...event });
        if (this.events.length > EVENT_KEEP) this.events.splice(0, this.events.length - EVENT_KEEP);
    }

    // ---------- ラウンド ----------

    startRound(starter) {
        this.round++;
        this.deck = shuffle(fullDeck(), this.random);
        // 1 枚を伏せて除外する。2 人なら、さらに 3 枚を表にして除外する
        this.setAside = this.deck.pop();
        this.faceUp = this.n === 2 ? [this.deck.pop(), this.deck.pop(), this.deck.pop()] : [];
        this.hands = this.players.map(() => []);
        this.discards = this.players.map(() => []);
        this.out = this.players.map(() => false);
        this.protected = this.players.map(() => false);
        this.knowledge = this.players.map(() => this.players.map(() => null));
        this.addEvent({ type: 'round', starter, faceUp: [...this.faceUp] });
        for (let i = 0; i < this.n; i++) {
            const seat = (starter + i) % this.n;
            this.hands[seat].push(this.deck.pop());
        }
        this.current = starter;
        this.startTurn();
    }

    startTurn() {
        this.protected[this.current] = false;
        const card = this.deck.pop();
        this.hands[this.current].push(card);
        this.phase = 'play';
        this.addEvent({ type: 'draw', seat: this.current, secret: { to: [this.current], card } });
    }

    alive() {
        return this.players.filter(p => !this.out[p.id]).map(p => p.id);
    }

    nextAlive(seat) {
        for (let i = 1; i <= this.n; i++) {
            const s = (seat + i) % this.n;
            if (!this.out[s]) return s;
        }
        return seat;
    }

    endTurn() {
        if (this.alive().length <= 1 || this.deck.length === 0) {
            this.endRound();
            return;
        }
        this.current = this.nextAlive(this.current);
        this.startTurn();
    }

    // ラウンドの終わり：残った 1 人、または手札の一番大きい人（同じなら捨て札の合計。それも同じなら全員）が好意の印をもらう
    endRound() {
        const alive = this.alive();
        let winners = alive;
        if (alive.length > 1) {
            const best = Math.max(...alive.map(s => this.hands[s][0]));
            winners = alive.filter(s => this.hands[s][0] === best);
            if (winners.length > 1) {
                const sum = s => this.discards[s].reduce((a, b) => a + b, 0);
                const bestSum = Math.max(...winners.map(sum));
                winners = winners.filter(s => sum(s) === bestSum);
            }
        }
        winners.forEach(s => { this.players[s].tokens++; });
        // スパイ：残っている人のうち、スパイを出したか捨てたのが 1 人だけなら、その人に 1 つ
        const spies = alive.filter(s => this.discards[s].includes(SPY));
        const spy = spies.length === 1 ? spies[0] : null;
        if (spy !== null) this.players[spy].tokens++;
        const reveal = Object.fromEntries(alive.map(s => [s, this.hands[s][0]]));
        this.addEvent({
            type: 'roundEnd', winners, spy, reveal, setAside: this.setAside,
            tokens: this.players.map(p => p.tokens), byElimination: alive.length === 1
        });
        // 勝つのに要る数に届いた人が 1 人なら、その人の勝ち（同時に届いて同じ数なら、もう 1 ラウンド）
        const reached = this.players.filter(p => p.tokens >= this.tokensToWin);
        if (reached.length > 0) {
            const top = Math.max(...reached.map(p => p.tokens));
            const leaders = reached.filter(p => p.tokens === top);
            if (leaders.length === 1) {
                this.winner = leaders[0].id;
                this.phase = 'end';
                this.addEvent({ type: 'end', winner: this.winner });
                return;
            }
        }
        const starter = winners.length === 1 ? winners[0] : winners[Math.floor(this.random() * winners.length)];
        this.startRound(starter);
    }

    // ---------- 操作 ----------

    // card を出すときに選べる人（選べる人がいなければ空。そのときは効果なしで出す）
    targetsFor(seat, card) {
        const others = this.alive().filter(s => s !== seat && !this.protected[s]);
        if (TARGETS_OTHER.includes(card)) return others;
        if (card === PRINCE) return [...others, seat].sort((a, b) => a - b);
        return [];
    }

    // 大臣と、将軍か魔術師を一緒に持っていたら、大臣を出さなければならない
    mustPlayCountess(seat) {
        const hand = this.hands[seat];
        return hand.includes(COUNTESS) && (hand.includes(KING) || hand.includes(PRINCE));
    }

    validate(seat, command) {
        if (!command || typeof command !== 'object') return '操作の形が正しくありません';
        if (this.phase === 'end') return 'ゲームは終わっています';
        if (seat !== this.current) return '手番ではありません';
        const hand = this.hands[seat];
        if (command.type === 'keep') {
            if (this.phase !== 'chancellor') return '今は選べません';
            if (!hand.includes(command.card)) return '持っていないカードです';
            const rest = [...hand];
            rest.splice(rest.indexOf(command.card), 1);
            const bottom = command.bottom;
            if (!Array.isArray(bottom) || bottom.length !== rest.length || [...bottom].sort().join() !== [...rest].sort().join()) return '戻すカードが正しくありません';
            return null;
        }
        if (command.type !== 'play') return '知らない操作です';
        if (this.phase !== 'play') return '今は出せません';
        const { card } = command;
        if (!hand.includes(card)) return '持っていないカードです';
        if (card !== COUNTESS && this.mustPlayCountess(seat)) return '大臣を出さなければなりません';
        const targets = this.targetsFor(seat, card);
        const target = command.target ?? null;
        if (targets.length === 0) {
            if (target !== null) return '選べる人がいません';
        } else if (TARGETS_OTHER.includes(card) || card === PRINCE) {
            if (!targets.includes(target)) return 'その人は選べません';
        }
        if (card === GUARD && target !== null) {
            const guess = command.guess;
            if (!VALUES.includes(guess) || guess === GUARD) return '兵士以外のカードを言い当ててください';
        }
        return null;
    }

    applyCommand(seat, command) {
        this.lastError = this.validate(seat, command);
        if (this.lastError) return false;
        if (command.type === 'keep') {
            const clean = { type: 'keep', card: command.card, bottom: [...command.bottom] };
            this.commands.push({ seat, command: clean });
            this.keep(seat, clean);
            return true;
        }
        const target = command.target ?? null;
        const clean = { type: 'play', card: command.card, target, guess: command.card === GUARD && target !== null ? command.guess : null };
        this.commands.push({ seat, command: clean });
        this.play(seat, clean);
        return true;
    }

    // 手札の card を捨て札にする（出したとき・魔術師で捨てたとき・脱落したとき）
    discardFrom(seat, card) {
        const hand = this.hands[seat];
        hand.splice(hand.indexOf(card), 1);
        this.discards[seat].push(card);
        // その人の手札を知っていた人は、出したカードがそれなら、残りが分からなくなる
        this.players.forEach(o => { if (this.knowledge[o.id][seat] === card) this.knowledge[o.id][seat] = null; });
    }

    knockOut(seat, reason) {
        this.out[seat] = true;
        const cards = [...this.hands[seat]];
        cards.forEach(c => this.discardFrom(seat, c));
        this.addEvent({ type: 'out', seat, cards, reason });
    }

    play(seat, { card, target, guess }) {
        this.discardFrom(seat, card);
        this.addEvent({ type: 'play', seat, card, target, guess });
        const mine = () => this.hands[seat][0];
        const theirs = () => this.hands[target][0];
        if (target === null && (TARGETS_OTHER.includes(card) || card === PRINCE)) {
            this.addEvent({ type: 'noEffect', seat, card });
        } else if (card === GUARD) {
            const hit = theirs() === guess;
            this.addEvent({ type: 'guard', seat, target, guess, hit });
            if (hit) this.knockOut(target, 'guard');
        } else if (card === PRIEST) {
            this.knowledge[seat][target] = theirs();
            this.addEvent({ type: 'priest', seat, target, secret: { to: [seat], card: theirs() } });
        } else if (card === BARON) {
            const a = mine();
            const b = theirs();
            const loser = a < b ? seat : b < a ? target : null;
            this.knowledge[seat][target] = b;
            this.knowledge[target][seat] = a;
            this.addEvent({ type: 'baron', seat, target, loser, secret: { to: [seat, target], cards: { [seat]: a, [target]: b } } });
            if (loser !== null) this.knockOut(loser, 'baron');
        } else if (card === HANDMAID) {
            this.protected[seat] = true;
        } else if (card === PRINCE) {
            const discarded = theirs();
            this.discardFrom(target, discarded);
            this.players.forEach(o => { if (o.id !== target) this.knowledge[o.id][target] = null; });
            if (discarded === PRINCESS) {
                this.addEvent({ type: 'prince', seat, target, discarded });
                this.knockOut(target, 'princess');
            } else {
                // 山札が尽きていたら、伏せて除外したカードを引く
                const fromSetAside = this.deck.length === 0;
                const drawn = fromSetAside ? this.setAside : this.deck.pop();
                if (fromSetAside) this.setAside = null;
                this.hands[target].push(drawn);
                this.addEvent({ type: 'prince', seat, target, discarded, fromSetAside, secret: { to: [target], card: drawn } });
            }
        } else if (card === CHANCELLOR) {
            const k = Math.min(2, this.deck.length);
            if (k > 0) {
                const drawn = [];
                for (let i = 0; i < k; i++) drawn.push(this.deck.pop());
                this.hands[seat].push(...drawn);
                this.players.forEach(o => { if (o.id !== seat) this.knowledge[o.id][seat] = null; });
                this.phase = 'chancellor';
                this.addEvent({ type: 'chancellor', seat, count: k, secret: { to: [seat], cards: drawn } });
                return;
            }
        } else if (card === KING) {
            const gave = mine();
            const got = theirs();
            this.hands[seat] = [got];
            this.hands[target] = [gave];
            // ほかの人が知っていたことは、カードと一緒に移る。交換した 2 人は、渡したカードを知っている
            this.players.forEach(o => {
                const k = this.knowledge[o.id];
                [k[seat], k[target]] = [k[target], k[seat]];
            });
            this.knowledge[seat][target] = gave;
            this.knowledge[target][seat] = got;
            this.knowledge[seat][seat] = null;
            this.knowledge[target][target] = null;
            this.addEvent({ type: 'king', seat, target, secret: { to: [seat, target], gave, got } });
        } else if (card === PRINCESS) {
            this.knockOut(seat, 'princess');
        }
        this.endTurn();
    }

    keep(seat, { card, bottom }) {
        this.hands[seat] = [card];
        // bottom の最後が一番下になるように戻す
        bottom.forEach(c => this.deck.unshift(c));
        this.addEvent({ type: 'keep', seat, count: bottom.length });
        this.endTurn();
    }
}
