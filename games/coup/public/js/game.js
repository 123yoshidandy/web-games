/**
 * クーの進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びはシードから決まる）
 *
 * ルール
 * - 役割5種（公爵・暗殺者・大使・船長・伯爵夫人）×3枚。各自2枚（影響力）を伏せて持ち、2コイン。残りは山
 *   2人のときは、最初の人は1コイン
 * - 手番：行動を1つ（収入・援助・クー・税・暗殺・強奪・交換）。10コイン以上で始めたら、クーしかできない
 * - 役割を名乗る行動（税・暗殺・強奪・交換）には、ほかの全員がチャレンジできる
 * - ブロック：援助は公爵（だれでも）、暗殺は伯爵夫人（対象）、強奪は船長か大使（対象）。ブロックにも、ほかの全員がチャレンジできる
 * - チャレンジ：名乗った人がその役割を持っていれば見せ、チャレンジした人が影響力を1つ失う。見せた札は山に戻して切り、1枚引き直す
 *   持っていなければ、名乗った人が影響力を1つ失う。行動へのチャレンジが通れば、行動は失敗し、払ったコインは戻る
 *   ブロックされた行動は失敗し、払ったコインは戻らない
 * - 影響力を失うときは、どの札を表にするかを本人が選ぶ。2枚とも失ったら脱落。最後の1人が勝ち
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - チャレンジとブロックは、順に聞く。行動を名乗ったら、まずほかの全員にチャレンジするかを聞き、全員が通したら、ブロックできる人に聞く
 *   答えは届いた順に処理し、最初のチャレンジ（ブロック）が通る
 * - 聞く相手はルールだけで決める（手札によって変えない）。援助のブロックは本人以外の全員、暗殺と強奪のブロックは対象の人
 * - チャレンジされたら、持っていれば必ず見せる（見せずに負ける選択はしない）
 * - 対象が途中で脱落したら（暗殺へのチャレンジに負けて最後の札を失った、など）、その行動は何も起きない
 * - 銀行のコインは尽きない
 * - 2人の変種（セットから1枚ずつ選ぶ準備）は入れていない
 */

import { createRandom, shuffle } from './random.js';
import { ROLES, ROLE_ORDER, COPIES, ACTIONS, STARTING_COINS, MUST_COUP } from './roles.js';

export { ROLES, ROLE_ORDER, ACTIONS };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const MAX_LOGS = 300;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    action: ['action', 'target'], allow: [], challenge: [], block: ['role'], lose: ['role'], exchange: ['keep']
};

// multiset として、list から items を1枚ずつ抜けるか。抜けたら残りを返す
function takeFrom(list, items) {
    const rest = [...list];
    for (const item of items) {
        const i = rest.indexOf(item);
        if (i < 0) return null;
        rest.splice(i, 1);
    }
    return rest;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜6人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * players.length);
        // CPU の迷いに使う値（ビューには入れない。ゲームの乱数とは別に、CPU が自分で乱数を作るため）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        this.deck = shuffle(ROLE_ORDER.flatMap(r => Array(COPIES).fill(r)), this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            coins: STARTING_COINS, hand: [], lost: []
        }));
        this.players.forEach(p => { p.hand = [this.deck.shift(), this.deck.shift()]; });
        if (players.length === 2) this.players[this.options.startPlayer].coins = 1;
        this.current = this.options.startPlayer;
        this.turnNumber = 1;
        this.phase = 'action';      // action：行動を選ぶ / challengeAction：行動へのチャレンジ / block：ブロック / challengeBlock：ブロックへのチャレンジ / lose：失う札を選ぶ / exchange：交換 / end
        this.turn = null;           // { actor, action, target, paid, blocker, blockRole }
        this.waiting = [];          // 答えを待っている人
        this.losses = [];           // これから影響力を失う人
        this.loser = null;          // 失う札を選んでいる人
        this.next = null;           // 失う札を選び終えたら進む先
        this.drawn = [];            // 交換で引いた札
        this.claims = this.players.map(() => []); // 名乗った役割の履歴（公開）{ role, turn, kind, result }
        this.winner = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}の番から始めます`);
    }

    isAlive(seat) {
        return this.players[seat].hand.length > 0;
    }

    alive() {
        return this.players.filter(p => p.hand.length).map(p => p.id);
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人
    actors() {
        switch (this.phase) {
            case 'action': return [this.current];
            case 'challengeAction': case 'block': case 'challengeBlock': return [...this.waiting];
            case 'lose': return [this.loser];
            case 'exchange': return [this.turn.actor];
            default: return [];
        }
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            action: { action: this.declare },
            challengeAction: { challenge: this.challenge, allow: this.allow },
            block: { block: this.block, allow: this.allow },
            challengeBlock: { challenge: this.challenge, allow: this.allow },
            lose: { lose: this.loseCard },
            exchange: { exchange: this.exchange }
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

    // ---- 行動 ----

    // その人が今できる行動
    legalActions(seat) {
        const p = this.players[seat];
        if (p.coins >= MUST_COUP) return ['coup'];
        return Object.keys(ACTIONS).filter(a => p.coins >= ACTIONS[a].cost);
    }

    targets(seat) {
        return this.alive().filter(id => id !== seat);
    }

    declare(seat, { action, target }) {
        const info = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
        if (!info) return this.fail('その行動はありません');
        const p = this.players[seat];
        if (p.coins >= MUST_COUP && action !== 'coup') return this.fail('10コイン以上なら、クーしかできません');
        if (p.coins < info.cost) return this.fail('コインが足りません');
        if (info.target) {
            if (!this.targets(seat).includes(target)) return this.fail('その人は選べません');
        } else if (target !== undefined && target !== null) {
            return this.fail('この行動は相手を選びません');
        }
        p.coins -= info.cost;
        this.turn = { actor: seat, action, target: info.target ? target : null, paid: info.cost, blocker: null, blockRole: null };
        const to = info.target ? `${this.players[target].name}に` : '';
        this.log(`${p.name}：${to}${info.name}${info.claim ? `（${ROLES[info.claim].name}）` : ''}`);
        this.emit({ type: 'action', seat, action, target: this.turn.target, claim: info.claim });
        if (info.claim) {
            this.claims[seat].push({ role: info.claim, turn: this.turnNumber, kind: 'action', result: null });
            return this.openWindow('challengeAction', this.alive().filter(id => id !== seat));
        }
        this.go('block');
        return true;
    }

    openWindow(phase, waiting) {
        this.phase = phase;
        this.waiting = waiting;
        if (!waiting.length) this.closeWindow();
        return true;
    }

    // 全員が通した
    closeWindow() {
        const phase = this.phase;
        this.waiting = [];
        if (phase === 'challengeAction') this.go('block');
        else if (phase === 'block') this.go('resolve');
        else if (phase === 'challengeBlock') this.blocked();
    }

    allow(seat) {
        this.waiting = this.waiting.filter(id => id !== seat);
        if (!this.waiting.length) this.closeWindow();
        return true;
    }

    // ---- チャレンジ ----

    challenge(seat) {
        const t = this.turn;
        const onBlock = this.phase === 'challengeBlock';
        const claimant = onBlock ? t.blocker : t.actor;
        const role = onBlock ? t.blockRole : ACTIONS[t.action].claim;
        const c = this.players[claimant];
        const claim = this.claims[claimant].at(-1);
        this.waiting = [];
        this.log(`${this.players[seat].name}が${c.name}の${ROLES[role].name}にチャレンジ`);
        if (c.hand.includes(role)) {
            // 本当だった：見せた札を山に戻して切り、引き直す。チャレンジした人が失う
            claim.result = 'proven';
            c.hand.splice(c.hand.indexOf(role), 1);
            this.deck.push(role);
            shuffle(this.deck, this.random);
            const fresh = this.deck.shift();
            c.hand.push(fresh);
            this.emit({ type: 'challenge', seat, claimant, role, success: false });
            this.emit({ type: 'redraw', seat: claimant, card: fresh, visibleTo: [claimant] });
            this.log(`${c.name}は${ROLES[role].name}を見せ、山から引き直しました`);
            this.losses.push(seat);
            this.next = onBlock ? 'blocked' : 'block';
        } else {
            claim.result = 'caught';
            this.emit({ type: 'challenge', seat, claimant, role, success: true });
            this.log(`${c.name}は${ROLES[role].name}を持っていませんでした`);
            this.losses.push(claimant);
            if (onBlock) {
                this.next = 'resolve';
            } else {
                // 行動は失敗し、払ったコインは戻る
                if (t.paid) this.gain(t.actor, t.paid);
                t.paid = 0;
                this.next = 'end';
            }
        }
        this.processLosses();
        return true;
    }

    // ---- ブロック ----

    block(seat, { role }) {
        const t = this.turn;
        if (!ACTIONS[t.action].blockers.includes(role)) return this.fail('その役割ではブロックできません');
        t.blocker = seat;
        t.blockRole = role;
        this.claims[seat].push({ role, turn: this.turnNumber, kind: 'block', result: null });
        this.emit({ type: 'block', seat, role, actor: t.actor });
        this.log(`${this.players[seat].name}が${ROLES[role].name}でブロック`);
        return this.openWindow('challengeBlock', this.alive().filter(id => id !== seat));
    }

    blocked() {
        const t = this.turn;
        this.log(`${ACTIONS[t.action].name}はブロックされました`);
        this.emit({ type: 'blocked', seat: t.actor, action: t.action });
        this.go('end');
    }

    // ---- 進める ----

    go(step) {
        const t = this.turn;
        const info = ACTIONS[t.action];
        if (step === 'block') {
            const targetOk = !info.target || this.isAlive(t.target);
            if (info.blockers.length && this.isAlive(t.actor) && targetOk) {
                const waiting = info.anyone ? this.alive().filter(id => id !== t.actor) : [t.target];
                this.openWindow('block', waiting);
                return;
            }
            step = 'resolve';
        }
        if (step === 'blocked') return this.blocked();
        if (step === 'resolve') return this.resolve();
        this.endTurn();
    }

    resolve() {
        const t = this.turn;
        const actor = this.players[t.actor];
        if (!this.isAlive(t.actor)) return this.endTurn();
        if (ACTIONS[t.action].target && !this.isAlive(t.target)) {
            this.log(`${this.players[t.target].name}はもういないので、何も起きません`);
            return this.endTurn();
        }
        switch (t.action) {
            case 'income': this.gain(t.actor, 1); break;
            case 'foreignAid': this.gain(t.actor, 2); break;
            case 'tax': this.gain(t.actor, 3); break;
            case 'steal': {
                const victim = this.players[t.target];
                const amount = Math.min(2, victim.coins);
                victim.coins -= amount;
                actor.coins += amount;
                this.emit({ type: 'coins', from: t.target, to: t.actor, amount });
                this.log(`${actor.name}が${victim.name}から${amount}コイン奪いました`);
                break;
            }
            case 'coup': case 'assassinate':
                this.losses.push(t.target);
                this.next = 'end';
                return this.processLosses();
            case 'exchange':
                this.drawn = [this.deck.shift(), this.deck.shift()];
                this.phase = 'exchange';
                this.emit({ type: 'exchangeDraw', seat: t.actor, cards: [...this.drawn], visibleTo: [t.actor] });
                return;
        }
        this.endTurn();
    }

    gain(seat, amount) {
        this.players[seat].coins += amount;
        this.emit({ type: 'coins', from: null, to: seat, amount });
    }

    // 交換：手札と引いた札から、手札と同じ枚数を残す
    exchange(seat, { keep }) {
        const p = this.players[seat];
        if (!Array.isArray(keep) || keep.length !== p.hand.length) return this.fail(`${p.hand.length}枚を選んでください`);
        const rest = takeFrom([...p.hand, ...this.drawn], keep);
        if (!rest) return this.fail('その札は選べません');
        p.hand = [...keep];
        this.deck.push(...rest);
        shuffle(this.deck, this.random);
        this.drawn = [];
        this.emit({ type: 'exchange', seat });
        this.log(`${p.name}が交換しました`);
        this.endTurn();
        return true;
    }

    // ---- 影響力を失う ----

    processLosses() {
        while (this.losses.length) {
            const seat = this.losses[0];
            const p = this.players[seat];
            if (!p.hand.length) {
                this.losses.shift();
                continue;
            }
            if (p.hand.length === 1) {
                this.losses.shift();
                this.discard(seat, p.hand[0]);
                if (this.isOver()) return true;
                continue;
            }
            this.phase = 'lose';
            this.loser = seat;
            return true;
        }
        this.loser = null;
        const next = this.next;
        this.next = null;
        this.go(next);
        return true;
    }

    loseCard(seat, { role }) {
        if (!this.players[seat].hand.includes(role)) return this.fail('その札は持っていません');
        this.losses.shift();
        this.discard(seat, role);
        if (!this.isOver()) this.processLosses();
        return true;
    }

    discard(seat, role) {
        const p = this.players[seat];
        p.hand.splice(p.hand.indexOf(role), 1);
        p.lost.push(role);
        this.emit({ type: 'lose', seat, role });
        this.log(`${p.name}が${ROLES[role].name}を失いました`);
        if (!p.hand.length) this.log(`${p.name}が脱落しました`);
        const alive = this.alive();
        if (alive.length === 1) {
            this.winner = alive[0];
            this.phase = 'end';
            this.waiting = [];
            this.losses = [];
            this.loser = null;
            this.emit({ type: 'win', seat: this.winner });
            this.log(`${this.players[this.winner].name}の勝ち`);
        }
    }

    endTurn() {
        if (this.isOver()) return;
        const n = this.players.length;
        let next = this.current;
        do next = (next + 1) % n; while (!this.isAlive(next));
        this.current = next;
        this.turnNumber += 1;
        this.phase = 'action';
        this.turn = null;
        this.waiting = [];
        this.drawn = [];
        this.emit({ type: 'turn', seat: next });
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
