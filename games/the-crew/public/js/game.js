/**
 * ザ・クルーのルールと状態（DOM に依存しない）。1つのゲームが、1つのミッションの1回の挑戦
 *
 * 操作はすべて applyCommand(seat, command) に通す。受け付けたら true、断ったら false と lastError。
 * 受け付けた操作だけを commands に記録し、Game.replay で同じ状態を作り直せる。
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）。
 *
 * 2人のときは、3人目の JARVIS（14枚の2段の列）を指揮官が動かす（JARVIS の手番は指揮官が操作する）
 *
 * 操作：
 *   準備   { type: 'swapTokens', a, b } / { type: 'moveToken', from, to } / { type: 'silence', seat }
 *          { type: 'answer', value } / { type: 'choose', seat } / { type: 'roles', first, last }
 *          { type: 'pickTask', index } / { type: 'assignTask', seat } / { type: 'handover', from, to, task } / { type: 'skip' }
 *   遭難信号 { type: 'distress', direction: 1 | -1 } → { type: 'passCard', card }（全員）
 *   通信   { type: 'communicate', card }（トリックの前ならいつでも、各人1回）
 *   トリック { type: 'play', card }
 */

import { ALL_CARDS, TASK_CARDS, MISSIONS, ROCKET, parseCard, handoverAllowed } from './missions.js';
import { createRandom, createSeed, shuffle } from './random.js';

export const JARVIS = 'JARVIS';
const ARROW_RANK = { '>': 1, '>>': 2, '>>>': 3, '>>>>': 4 };

// トリックの勝ち：ロケットがあれば一番大きいロケット、なければ出された色で一番大きいカード
export function trickWinner(plays) {
    const led = parseCard(plays[0].card).suit;
    let best = plays[0];
    for (const p of plays.slice(1)) {
        const a = parseCard(p.card);
        const b = parseCard(best.card);
        const beats = a.suit === b.suit ? a.rank > b.rank : a.suit === ROCKET || (a.suit === led && b.suit !== ROCKET && b.suit !== led);
        if (beats) best = p;
    }
    return best;
}

// 通信できるカードか：色のカードで、その色の一番上・唯一・一番下のどれか
export function commPosition(hand, card) {
    const c = parseCard(card);
    if (c.suit === ROCKET || !hand.includes(card)) return null;
    const same = hand.map(parseCard).filter(h => h.suit === c.suit).map(h => h.rank);
    if (same.length === 1) return 'single';
    if (c.rank === Math.max(...same)) return 'top';
    if (c.rank === Math.min(...same)) return 'bottom';
    return null;
}

export default class Game {
    // players: [{ name, isCPU }]（2〜5人） / options: { seed, mission, distress }（distress：このミッションで遭難信号を使ったことがある）
    constructor(players, options = {}) {
        if (players.length < 2 || players.length > 5) throw new Error('人数は2〜5人です');
        this.seed = (options.seed ?? createSeed()) >>> 0;
        this.random = createRandom(this.seed);
        this.missionNumber = options.mission ?? 1;
        this.mission = MISSIONS[this.missionNumber];
        if (!this.mission) throw new Error('ミッションがありません');
        this.distressActive = !!options.distress;
        this.players = players.map((p, seat) => ({ seat, name: p.name, isCPU: !!p.isCPU, jarvis: false }));
        if (players.length === 2) this.players.push({ seat: 2, name: JARVIS, isCPU: true, jarvis: true });
        this.n = this.players.length;
        this.deal();
        this.commander = this.players.findIndex(p => this.holds(p.seat, 'rocket4'));
        this.tasks = [];
        this.comms = this.players.map(() => null);   // { card, position, played }
        this.silenced = null;
        this.chosen = null;      // 特別な条件で選ばれた人
        this.roles = null;       // ミッション50の役割
        this.answers = [];       // はい・いいえの答え（今の問いかけの分）
        this.lastAnswers = null; // 終わった問いかけの答え（指揮官が選ぶときに見る）
        this.trick = { leader: this.commander, plays: [] };
        this.trickNumber = 1;    // 次に行う（行っている）トリックの番号
        this.tricksWon = this.players.map(() => 0);
        this.won = this.players.map(() => []);
        this.history = [];       // 終わったトリック { leader, plays, winner }
        this.doneCount = 0;
        this.specialState = { ones: 0, rockets: [] };
        this.distressUsed = false;
        this.passing = null;     // 遭難信号で渡すカード { direction, cards: [] }
        this.phase = 'prep';
        this.step = null;
        this.result = null;
        this.commands = [];
        this.logs = [];
        this.lastError = null;
        this.lastMove = null;
        this.totalTricks = this.players.filter(p => !p.jarvis).map(p => this.hands[p.seat].length).reduce((a, b) => Math.min(a, b));
        this.prepare();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません: ${game.lastError}`);
        }
        return game;
    }

    // CPU の読みのための写し（記録とログは持たない）
    clone() {
        const g = Object.create(Game.prototype);
        Object.assign(g, this);
        g.random = createRandom((this.seed + this.commands.length * 7919) >>> 0);
        g.hands = this.hands.map(h => [...h]);
        g.jarvisPiles = this.jarvisPiles && this.jarvisPiles.map(p => ({ ...p }));
        g.tasks = this.tasks.map(t => ({ ...t }));
        g.comms = this.comms.map(c => c && { ...c });
        g.trick = { leader: this.trick.leader, plays: [...this.trick.plays] };
        g.tricksWon = [...this.tricksWon];
        g.won = this.won.map(w => [...w]);
        g.history = [...this.history];
        g.specialState = { ones: this.specialState.ones, rockets: [...this.specialState.rockets] };
        g.steps = this.steps.map(s => ({ ...s }));
        g.step = this.step && { ...this.step };
        g.answers = [...this.answers];
        g.passing = this.passing && { direction: this.passing.direction, cards: { ...this.passing.cards } };
        g.commands = [];
        g.logs = [];
        return g;
    }

    get isOver() {
        return this.phase === 'end';
    }

    // ===== 配る =====

    deal() {
        const deck = shuffle([...ALL_CARDS], this.random);
        this.hands = this.players.map(() => []);
        this.jarvisPiles = null;
        if (this.players.length === 3 && this.players[2].jarvis) {
            // 2人：ロケットの4を除いた39枚から、JARVIS に裏7枚・表7枚、残り25枚とロケットの4を2人に13枚ずつ
            const rest = deck.filter(c => c !== 'rocket4');
            this.jarvisPiles = Array.from({ length: 7 }, (_, i) => ({ down: rest[i], up: rest[7 + i] }));
            const others = shuffle([...rest.slice(14), 'rocket4'], this.random);
            others.forEach((card, i) => this.hands[i % 2].push(card));
        } else {
            deck.forEach((card, i) => this.hands[i % this.n].push(card));
        }
        for (const hand of this.hands) hand.sort(cardOrder);
    }

    holds(seat, card) {
        if (this.players[seat].jarvis) return this.jarvisPiles.some(p => p.up === card || p.down === card);
        return this.hands[seat].includes(card);
    }

    // その人が今出せるカード（JARVIS は表のカードだけ）
    handOf(seat) {
        if (this.players[seat].jarvis) return this.jarvisPiles.map(p => p.up).filter(Boolean);
        return this.hands[seat];
    }

    // ===== 準備 =====

    prepare() {
        const mission = this.mission;
        if (mission.tasks > 0) {
            const taskDeck = shuffle([...TASK_CARDS], this.random);
            this.tasks = taskDeck.slice(0, mission.tasks).map((card, i) => ({
                card, token: mission.tokens[i] ?? null, owner: null, done: false, order: null
            }));
        }
        // 準備の段階を順に積む
        const steps = [];
        const kind = mission.special?.kind;
        if (kind === 'swapTokens') steps.push({ kind: 'swapTokens', actor: this.commander });
        if (kind === 'moveToken') steps.push({ kind: 'moveToken', actor: this.commander });
        if (mission.comm?.silenced) steps.push({ kind: 'silence', actor: this.commander });
        if (['sick', 'exactlyOne', 'firstAndLast'].includes(kind)) {
            steps.push({ kind: 'ask', question: kind === 'sick' ? 'condition' : 'willing', target: 'choose' });
            steps.push({ kind: 'choose', actor: this.commander, purpose: kind });
        }
        if (kind === 'roles') {
            steps.push({ kind: 'ask', question: 'role' });
            steps.push({ kind: 'roles', actor: this.commander });
        }
        if (kind === 'pinkLeftOfNine') {
            const owner = this.players.find(p => this.holds(p.seat, 'pink9')).seat;
            this.chosen = (owner + 1) % this.n;
            this.logs.push(`桃の9は${this.players[owner].name}。${this.players[this.chosen].name}が桃のカードをすべて取る`);
        }
        if (mission.tasks > 0) {
            if (mission.assign === 'pick') steps.push({ kind: 'pick' });
            if (mission.assign === 'decision') {
                steps.push({ kind: 'ask', question: 'willing' });
                steps.push({ kind: 'choose', actor: this.commander, purpose: 'decision' });
            }
            if (mission.assign === 'distribution') {
                this.tasks.forEach((_, i) => {
                    steps.push({ kind: 'ask', question: 'task', task: i });
                    steps.push({ kind: 'assignTask', actor: this.commander, task: i });
                });
            }
            // 渡すかどうかは乗組員の相談で決める。人がいれば人が操作する
            if (handoverAllowed(this.missionNumber, this.players.length)) {
                const human = this.players.find(p => !p.isCPU);
                steps.push({ kind: 'handover', actor: human ? human.seat : this.commander });
            }
        }
        this.steps = steps;
        this.nextStep();
    }

    // 問いかけに答える人（指揮官と JARVIS を除き、指揮官の次から順に）
    askOrder() {
        const order = [];
        for (let i = 1; i < this.n; i++) {
            const seat = (this.commander + i) % this.n;
            if (!this.players[seat].jarvis) order.push(seat);
        }
        return order;
    }

    nextStep() {
        this.step = this.steps.shift() ?? null;
        if (!this.step) {
            this.phase = 'play';
            this.trick = { leader: this.commander, plays: [] };
            return;
        }
        if (this.step.kind === 'ask') {
            this.answers = [];
            this.step.order = this.askOrder();
            if (this.step.order.length === 0) this.nextStep();
        }
        if (this.step && this.step.kind === 'pick') {
            this.step.turn = this.commander;
        }
    }

    // 今、操作する人（JARVIS の番は指揮官）
    get current() {
        if (this.phase === 'end') return null;
        if (this.passing) {
            const seat = this.passOrder().find(s => !this.passing.cards[s]);
            return seat ?? null;
        }
        if (this.phase === 'prep') {
            const step = this.step;
            if (step.kind === 'ask') return step.order[this.answers.length];
            if (step.kind === 'pick') return this.players[step.turn].jarvis ? this.commander : step.turn;
            return step.actor;
        }
        const seat = this.turnSeat();
        return this.players[seat].jarvis ? this.commander : seat;
    }

    // トリックで、次にカードを出す席
    turnSeat() {
        return (this.trick.leader + this.trick.plays.length) % this.n;
    }

    passOrder() {
        return this.players.filter(p => !p.jarvis).map(p => p.seat);
    }

    // ===== 操作 =====

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (this.phase === 'end') return this.fail('この挑戦は終わっています');
        // 通信と遭難信号は、手番と関係なく受け付ける
        if (command.type === 'communicate') return this.communicate(seat, command);
        if (command.type === 'distress') return this.distress(seat, command);
        if (seat !== this.current) return this.fail('今はあなたの番ではありません');
        if (this.passing) {
            if (command.type !== 'passCard') return this.fail('先に渡すカードを選んでください');
            return this.passCard(seat, command);
        }
        if (this.phase === 'prep') return this.prepCommand(seat, command);
        if (command.type !== 'play') return this.fail('今はその操作はできません');
        return this.play(seat, command);
    }

    prepCommand(seat, command) {
        const step = this.step;
        const name = this.players[seat].name;
        const valid = s => Number.isInteger(s) && s >= 0 && s < this.n;
        switch (step.kind) {
            case 'swapTokens':
            case 'moveToken': {
                if (command.type === 'skip') return this.done(seat, command, null);
                if (step.kind === 'swapTokens') {
                    if (command.type !== 'swapTokens') return this.fail('入れ替えるか、そのままにしてください');
                    const { a, b } = command;
                    if (![a, b].every(i => Number.isInteger(i) && this.tasks[i]?.token) || a === b) return this.fail('トークンのある課題を2つ選んでください');
                    [this.tasks[a].token, this.tasks[b].token] = [this.tasks[b].token, this.tasks[a].token];
                    return this.done(seat, command, `${name}：順番のトークンを入れ替えた`);
                }
                if (command.type !== 'moveToken') return this.fail('動かすか、そのままにしてください');
                const { from, to } = command;
                if (!this.tasks[from]?.token || !this.tasks[to] || this.tasks[to].token) return this.fail('トークンのある課題から、ない課題へ動かしてください');
                this.tasks[to].token = this.tasks[from].token;
                this.tasks[from].token = null;
                return this.done(seat, command, `${name}：順番のトークンを動かした`);
            }
            case 'silence': {
                const target = command.seat;
                if (command.type !== 'silence' || !valid(target) || target === this.commander || this.players[target].jarvis) {
                    return this.fail('通信できない人を、指揮官以外から選んでください');
                }
                this.silenced = target;
                return this.done(seat, command, `${name}：${this.players[target].name}は通信できない`);
            }
            case 'ask': {
                if (command.type !== 'answer') return this.fail('答えてください');
                const allowed = step.question === 'condition' ? ['good', 'bad'] : step.question === 'role' ? ['first', 'last', 'middle'] : ['yes', 'no'];
                if (!allowed.includes(command.value)) return this.fail('答えが正しくありません');
                this.answers.push({ seat, value: command.value });
                this.record(seat, command, `${name}：${answerText(command.value)}`, { type: 'answer', seat, value: command.value });
                if (this.answers.length >= step.order.length) {
                    this.lastAnswers = { question: step.question, task: step.task, answers: [...this.answers] };
                    this.nextStep();
                }
                return true;
            }
            case 'choose': {
                const target = command.seat;
                if (command.type !== 'choose' || !valid(target)) return this.fail('1人を選んでください');
                if (step.purpose === 'decision') {
                    if (target === this.commander) return this.fail('指揮官は自分を選べません');
                    for (const t of this.tasks) t.owner = target;
                    return this.done(seat, command, `${name}：${this.players[target].name}がすべての課題を受け持つ`);
                }
                this.chosen = target;
                return this.done(seat, command, `${name}：${this.players[target].name}を選んだ`);
            }
            case 'roles': {
                const { first, last } = command;
                if (command.type !== 'roles' || !valid(first) || !valid(last) || first === last) return this.fail('違う2人を選んでください');
                this.roles = { first, last };
                return this.done(seat, command, `${name}：役割を決めた`);
            }
            case 'pick': {
                const { index } = command;
                if (command.type !== 'pickTask' || !this.tasks[index] || this.tasks[index].owner !== null) return this.fail('残っている課題を選んでください');
                const taker = step.turn;
                this.tasks[index].owner = taker;
                this.record(seat, command, `${this.players[taker].name}：課題を取った`, { type: 'pickTask', seat: taker, index });
                if (this.tasks.every(t => t.owner !== null)) {
                    this.nextStep();
                } else {
                    step.turn = (step.turn + 1) % this.n;
                }
                return true;
            }
            case 'assignTask': {
                const target = command.seat;
                if (command.type !== 'assignTask' || !valid(target)) return this.fail('課題を受け持つ人を選んでください');
                if (!this.canAssign(target)) return this.fail('課題の数に2枚以上の差がついてしまいます');
                this.tasks[step.task].owner = target;
                return this.done(seat, command, `${name}：課題を${this.players[target].name}に配った`);
            }
            case 'handover': {
                if (command.type === 'skip') return this.done(seat, command, null);
                const { from, to, task } = command;
                if (command.type !== 'handover' || !valid(from) || !valid(to) || from === to || this.tasks[task]?.owner !== from) {
                    return this.fail('渡す課題と相手を選んでください');
                }
                this.tasks[task].owner = to;
                return this.done(seat, command, `${this.players[from].name}の課題を${this.players[to].name}へ渡した`);
            }
            default:
                return this.fail('今はその操作はできません');
        }
    }

    // 指揮官の配分：配ったあとも、最後に差が1以内にできるか
    canAssign(target) {
        const counts = this.players.map(p => this.tasks.filter(t => t.owner === p.seat).length);
        counts[target]++;
        const total = this.tasks.length;
        const high = Math.ceil(total / this.n);
        const highSlots = total % this.n === 0 ? this.n : total % this.n;
        if (counts.some(c => c > high)) return false;
        return counts.filter(c => c === high).length <= highSlots || high === Math.floor(total / this.n);
    }

    done(seat, command, log) {
        this.record(seat, command, log, { type: command.type, seat });
        this.nextStep();
        return true;
    }

    // ===== 遭難信号 =====

    distressAvailable() {
        return this.phase === 'play' && !this.passing && !this.distressUsed && this.trickNumber === 1
            && this.trick.plays.length === 0 && this.comms.every(c => c === null);
    }

    distress(seat, { direction }) {
        if (!this.distressAvailable()) return this.fail('今は遭難信号を使えません');
        if (direction !== 1 && direction !== -1) return this.fail('渡す向きを選んでください');
        if (this.players[seat].jarvis) return this.fail('JARVIS は使えません');
        this.distressUsed = true;
        this.passing = { direction, cards: {} };
        this.record(seat, { type: 'distress', direction }, `遭難信号：全員が${direction === 1 ? '左' : '右'}の人へ1枚ずつ渡す`, { type: 'distress', seat, direction });
        return true;
    }

    passCard(seat, { card }) {
        const hand = this.hands[seat];
        if (!hand.includes(card) || parseCard(card).suit === ROCKET) return this.fail('ロケット以外の手札を1枚選んでください');
        this.passing.cards[seat] = card;
        this.record(seat, { type: 'passCard', card }, null, { type: 'passCard', seat });
        const order = this.passOrder();
        if (order.every(s => this.passing.cards[s])) {
            // 全員が選んだら、同じ向きの隣（JARVIS は飛ばす）へ渡す
            const moves = order.map((from, i) => ({ from, to: order[(i + (this.passing.direction === 1 ? 1 : order.length - 1)) % order.length], card: this.passing.cards[from] }));
            for (const m of moves) this.hands[m.from] = this.hands[m.from].filter(c => c !== m.card);
            for (const m of moves) this.hands[m.to].push(m.card);
            for (const hand of this.hands) hand.sort(cardOrder);
            this.passing = null;
            this.logs.push('カードを渡した');
        }
        return true;
    }

    // ===== 通信 =====

    commAllowed(seat) {
        if (this.phase !== 'play' || this.passing) return false;
        if (this.players[seat].jarvis || this.comms[seat] || seat === this.silenced) return false;
        if (this.trick.plays.length > 0) return false;
        const from = this.mission.comm?.from;
        return !(from && this.trickNumber < from);
    }

    communicate(seat, { card }) {
        if (!this.commAllowed(seat)) return this.fail('今は通信できません');
        const position = commPosition(this.hands[seat], card);
        if (!position) return this.fail('その色で一番上・唯一・一番下のカードだけ通信できます');
        this.comms[seat] = { card, position, hidden: !!this.mission.comm?.deadSpot, played: false };
        this.record(seat, { type: 'communicate', card }, `${this.players[seat].name}：通信した`, { type: 'communicate', seat, card });
        return true;
    }

    // ===== トリック =====

    // 出せるカード（出された色があれば、その色を持っている限りその色）
    playable(seat) {
        const hand = this.handOf(seat);
        if (this.trick.plays.length === 0) return [...hand];
        const led = parseCard(this.trick.plays[0].card).suit;
        const follow = hand.filter(c => parseCard(c).suit === led);
        return follow.length ? follow : [...hand];
    }

    play(seat, { card }) {
        const playSeat = this.turnSeat();
        if (!this.playable(playSeat).includes(card)) return this.fail('そのカードは出せません');
        if (this.players[playSeat].jarvis) {
            const pile = this.jarvisPiles.find(p => p.up === card);
            pile.up = null;
        } else {
            this.hands[playSeat] = this.hands[playSeat].filter(c => c !== card);
        }
        const comm = this.comms[playSeat];
        if (comm && comm.card === card) comm.played = true;
        this.trick.plays.push({ seat: playSeat, card });
        this.record(seat, { type: 'play', card }, null, { type: 'play', seat: playSeat, card });
        if (this.trick.plays.length === this.n) this.finishTrick();
        return true;
    }

    finishTrick() {
        const plays = this.trick.plays;
        const win = trickWinner(plays);
        const winner = win.seat;
        this.tricksWon[winner]++;
        this.won[winner].push(...plays.map(p => p.card));
        this.history.push({ number: this.trickNumber, leader: this.trick.leader, plays: [...plays], winner });
        this.lastTrick = this.history[this.history.length - 1];
        const name = this.players[winner].name;
        this.logs.push(`${this.trickNumber}トリック目：${name}が取った`);
        // JARVIS の表のカードが出たら、下のカードを表にする
        if (this.jarvisPiles) {
            for (const pile of this.jarvisPiles) {
                if (!pile.up && pile.down) {
                    pile.up = pile.down;
                    pile.down = null;
                }
            }
        }
        const failure = this.checkTasks(plays, winner) ?? this.checkSpecial(plays, win);
        if (failure) return this.end(false, failure);
        const last = this.trickNumber >= this.totalTricks;
        if (this.isSuccess(last)) return this.end(true, null);
        if (last) return this.end(false, this.unfinishedReason());
        if (this.mission.special?.kind === 'stealAfterFirst' && this.trickNumber === 1) this.steal();
        this.trickNumber++;
        this.trick = { leader: winner, plays: [] };
    }

    // 課題：取ったカードの課題は取った人のものでなければ失敗。順番のトークンを確かめる
    checkTasks(plays, winner) {
        const group = [];
        for (const { card } of plays) {
            const task = this.tasks.find(t => t.card === card);
            if (!task) continue;
            if (task.owner !== winner) return `${this.players[winner].name}が、ほかの人の課題のカードを取った`;
            group.push(task);
        }
        if (group.length === 0) return null;
        const before = this.doneCount;
        const after = before + group.length;
        const pendingAfter = this.tasks.filter(t => !t.done && !group.includes(t));
        for (const task of group) {
            const token = task.token;
            if (!token) continue;
            if (/^\d$/.test(token)) {
                const k = Number(token);
                if (k <= before || k > after) return `${token}の課題を${k}番目に果たせなかった`;
            } else if (token === 'omega') {
                if (pendingAfter.length > 0) return 'Ω の課題を最後に果たせなかった';
                if (this.mission.special?.kind === 'omegaLastTrick' && this.trickNumber < this.totalTricks) return 'Ω の課題を最後のトリックで果たせなかった';
            } else {
                const rank = ARROW_RANK[token];
                const lowerPending = pendingAfter.some(t => ARROW_RANK[t.token] && ARROW_RANK[t.token] < rank);
                if (lowerPending) return '矢印の順番を守れなかった';
            }
        }
        // まだ果たしていない数字のトークンの番号を越えた
        for (const task of pendingAfter) {
            if (task.token && /^\d$/.test(task.token) && Number(task.token) <= after) return `${task.token}の課題を${task.token}番目に果たせなかった`;
        }
        group.forEach((task, i) => {
            task.done = true;
            task.order = before + i + 1;
        });
        this.doneCount = after;
        return null;
    }

    // 特別な条件
    checkSpecial(plays, win) {
        const special = this.mission.special;
        if (!special) return null;
        const winner = win.seat;
        const winCard = parseCard(win.card);
        const trick = this.trickNumber;
        const last = trick >= this.totalTricks;
        const state = this.specialState;
        switch (special.kind) {
            case 'sick':
                return winner === this.chosen ? `${this.players[winner].name}（具合が悪い）がトリックを取った` : null;
            case 'winWithOnes': {
                if (winCard.rank === 1 && winCard.suit !== ROCKET) state.ones++;
                const onesLeft = this.cardsLeft().filter(c => { const p = parseCard(c); return p.rank === 1 && p.suit !== ROCKET; }).length;
                if (state.ones + onesLeft < special.count) return '1のカードでトリックを取れなくなった';
                return null;
            }
            case 'rocketsWin': {
                for (const p of plays) {
                    const c = parseCard(p.card);
                    if (c.suit !== ROCKET) continue;
                    if (p !== win) return `ロケットの${c.rank}でトリックを取れなかった`;
                    if (special.ordered && c.rank !== state.rockets.length + 1) return 'ロケットの順番を守れなかった';
                    state.rockets.push(c.rank);
                }
                return null;
            }
            case 'noNines':
                return winCard.rank === 9 && winCard.suit !== ROCKET ? '9のカードでトリックを取った' : null;
            case 'balance': {
                const counts = this.tricksWon;
                if (Math.max(...counts) - Math.min(...counts) >= 2) return '取ったトリックの数に2つの差がついた';
                if (special.commanderFirstLast && (trick === 1 || last) && winner !== this.commander) return '指揮官が最初か最後のトリックを取れなかった';
                return null;
            }
            case 'exactlyOne':
                if (winner !== this.chosen) return null;
                if (winCard.suit === ROCKET) return 'ロケットでトリックを取った';
                return this.tricksWon[winner] > 1 ? '2つ目のトリックを取った' : null;
            case 'firstAndLast': {
                const must = trick === 1 || last;
                if (must && winner !== this.chosen) return '最初か最後のトリックを取れなかった';
                if (!must && winner === this.chosen) return '最初と最後以外のトリックを取った';
                if (winner === this.chosen && winCard.suit === ROCKET) return 'ロケットでトリックを取った';
                return null;
            }
            case 'pinkLeftOfNine':
                return plays.some(p => parseCard(p.card).suit === 'pink') && winner !== this.chosen ? 'ほかの人が桃のカードを取った' : null;
            case 'roles': {
                const { first, last: lastSeat } = this.roles;
                if (trick <= 4 && winner !== first) return '最初の4トリックを決めた人が取れなかった';
                if (last && winner !== lastSeat) return '最後のトリックを決めた人が取れなかった';
                if (trick > 4 && !last && (winner === first || winner === lastSeat)) return '間のトリックを残りの人が取れなかった';
                return null;
            }
            default:
                return null;
        }
    }

    // まだ誰かの手にあるカード
    cardsLeft() {
        const cards = this.players.flatMap(p => (p.jarvis ? this.jarvisPiles.flatMap(x => [x.up, x.down]).filter(Boolean) : this.hands[p.seat]));
        return cards;
    }

    isSuccess(last) {
        const special = this.mission.special;
        const tasksDone = this.tasks.every(t => t.done);
        if (!special || ['stealAfterFirst', 'swapTokens', 'moveToken', 'omegaLastTrick'].includes(special.kind)) return this.tasks.length > 0 && tasksDone;
        switch (special.kind) {
            case 'winWithOnes': return this.specialState.ones >= special.count;
            case 'rocketsWin': return this.specialState.rockets.length === 4;
            case 'noNines': return this.tasks.length > 0 ? tasksDone : last;
            case 'pinkLeftOfNine': return last || this.won[this.chosen].filter(c => parseCard(c).suit === 'pink').length === 9;
            case 'exactlyOne': return last && this.tricksWon[this.chosen] === 1;
            default: return last; // sick・balance・firstAndLast・roles は最後まで守れたら成功
        }
    }

    unfinishedReason() {
        if (this.tasks.some(t => !t.done)) return '果たせなかった課題がある';
        if (this.mission.special?.kind === 'exactlyOne') return '選ばれた人がちょうど1トリックを取れなかった';
        return 'ミッションの条件を満たせなかった';
    }

    // ミッション12：1トリック目のあと、全員が右の人（JARVIS は飛ばす）の手札から1枚を引く
    steal() {
        const order = this.passOrder();
        const taken = order.map((seat, i) => {
            const right = order[(i + order.length - 1) % order.length];
            const hand = this.hands[right];
            return { seat, from: right, card: hand[Math.floor(this.random() * hand.length)] };
        });
        for (const t of taken) this.hands[t.from] = this.hands[t.from].filter(c => c !== t.card);
        for (const t of taken) this.hands[t.seat].push(t.card);
        for (const hand of this.hands) hand.sort(cardOrder);
        for (const [seat, comm] of this.comms.entries()) {
            if (comm && !comm.played && !this.hands[seat].includes(comm.card)) comm.played = true;
        }
        this.logs.push('全員が右の人の手札から1枚を引いた');
    }

    end(success, reason) {
        this.phase = 'end';
        this.result = { success, reason };
        this.logs.push(success ? 'ミッション成功' : `ミッション失敗：${reason}`);
    }

    record(seat, command, log, move) {
        this.commands.push({ seat, command });
        if (log) this.logs.push(log);
        this.lastMove = move;
    }

    fail(message) {
        this.lastError = message;
        return false;
    }
}

// 手札の並び：色ごと、小さい順。ロケットは最後
const SUIT_ORDER = { pink: 0, yellow: 1, blue: 2, green: 3, rocket: 4 };
export function cardOrder(a, b) {
    const x = parseCard(a);
    const y = parseCard(b);
    return SUIT_ORDER[x.suit] - SUIT_ORDER[y.suit] || x.rank - y.rank;
}

export function answerText(value) {
    return { yes: 'はい', no: 'いいえ', good: '元気', bad: '具合が悪い', first: '最初の4トリック', last: '最後のトリック', middle: '間のトリック' }[value] ?? value;
}
