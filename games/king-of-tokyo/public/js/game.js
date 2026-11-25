/**
 * キング・オブ・トーキョー（基本ゲーム・第2版）のゲーム本体
 * DOM に依存しない。操作は applyCommand(seat, command) の 1 か所から受け付け、受け付けた操作だけを commands に記録する
 * Game.replay(players, options, commands) で、同じ状態を作り直せる（ダイスと山札もシード付きの乱数）
 *
 * 進め方：処理を「手順の列」（steps）で進め、人の判断が要るところで decision を出して止まる。判断は常に 1 つで、
 * decision.seat の人だけが答えられる（ほかの人の番に割り込む判断：東京を明け渡すか・翼・念力探査・機会主義も同じ形）
 *
 * 操作（decision.kind ごと）：
 *   roll    { type: 'reroll', dice: [振り直す添え字] } / { type: 'change', index, face, card: 'herdCuller'|'plotTwist'|'stretchy' } / { type: 'resolve' }
 *   buy     { type: 'buy', card } / { type: 'buyFrom', seat, card }（寄生触手）/ { type: 'buyTop' }（研究所生まれ）/ { type: 'sweep' } / { type: 'endBuy' }
 *   yield   { type: 'yield', yes }        wings { type: 'wings', yes }        psychicProbe { type: 'probe', index }（null で使わない）
 *   healingRay { type: 'healingRay', give: { 席: 体力 } }   opportunist { type: 'opportunist', card }（null で買わない）
 *   mimic   { type: 'mimic', target }（{ seat, card } か null）   metamorph { type: 'metamorph', cards: [id] }
 *   いつでも（持ち主）：{ type: 'rapidHeal' }（急速回復：2 エネルギーで 1 体力）
 */

import { createRandom, createSeed, shuffle } from './random.js';
import { CARD_IDS, cardOf, keyOf, FACES, MONSTERS, MAX_HEALTH, WIN_POINTS } from './cards.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const EVENT_KEEP = 200;
// ものまねで写せないカード（カードの上に載せる数を持つもの。写したときの扱いが決まっていないため）
export const NOT_MIMICABLE = ['mimic', 'smokeCloud', 'batteryMonster'];

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, cpuLevel }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は ${MIN_PLAYERS}〜${MAX_PLAYERS} 人です`);
        const seed = (options.seed ?? createSeed()) >>> 0;
        this.options = { ...options, seed };
        this.random = createRandom(seed);
        const monsters = shuffle([...MONSTERS], this.random).slice(0, players.length);
        this.players = players.map((p, id) => ({
            id, name: p.name, isCPU: !!p.isCPU, monster: monsters[id].key,
            health: MAX_HEALTH, vp: 0, energy: 0, cards: [], alive: true,
            poison: 0, shrink: 0, mimic: null, battery: 0, smoke: 0, wingsTurn: -1
        }));
        this.deck = shuffle([...CARD_IDS], this.random);
        this.market = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
        this.discardPile = [];
        this.tokyo = { city: null, bay: null };
        this.current = Math.floor(this.random() * players.length);
        this.turnNo = 0;
        this.winner = null;
        this.phase = 'play';
        this.steps = [];
        this.decision = null;
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startTurn({ fresh: true });
        this.run();
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
        this.events.push({ seq: this.eventSeq, turn: this.turnNo, ...event });
        if (this.events.length > EVENT_KEEP) this.events.splice(0, this.events.length - EVENT_KEEP);
    }

    // ---------- カードの効果を調べる ----------

    // 持っている数（ものまねで写しているカードも数える）
    count(seat, key) {
        const p = this.players[seat];
        let k = p.cards.filter(id => keyOf(id) === key).length;
        if (p.mimic && keyOf(p.mimic.card) === key && this.ownsCard(p.mimic.seat, p.mimic.card) && p.cards.some(id => keyOf(id) === 'mimic')) k++;
        return k;
    }

    has(seat, key) {
        return this.count(seat, key) > 0;
    }

    ownsCard(seat, id) {
        return this.players[seat]?.cards.includes(id);
    }

    maxHealth(seat) {
        return MAX_HEALTH + 2 * this.count(seat, 'evenBigger');
    }

    alive() {
        return this.players.filter(p => p.alive).map(p => p.id);
    }

    // 5 人以上で遊ぶときは、東京湾も使う（生き残りが 4 体以下になったら使わない）
    bayInUse() {
        return this.n >= 5 && this.alive().length >= 5;
    }

    inTokyo(seat) {
        return this.tokyo.city === seat || this.tokyo.bay === seat;
    }

    // 席の両隣（生きているモンスター）
    neighbors(seat) {
        const alive = this.alive();
        if (alive.length <= 1) return [];
        const i = alive.indexOf(seat);
        const left = alive[(i - 1 + alive.length) % alive.length];
        const right = alive[(i + 1) % alive.length];
        return left === right ? [left] : [left, right];
    }

    cardCost(seat, id) {
        return Math.max(0, cardOf(id).cost - this.count(seat, 'alienOrigin'));
    }

    // ---------- 得点・エネルギー・体力 ----------

    gainVp(seat, n, reason) {
        if (n <= 0 || !this.players[seat].alive) return;
        this.players[seat].vp += n;
        this.addEvent({ type: 'vp', seat, n, reason });
    }

    loseVp(seat, n, reason) {
        const p = this.players[seat];
        const lost = Math.min(p.vp, n);
        if (lost <= 0) return;
        p.vp -= lost;
        this.addEvent({ type: 'vp', seat, n: -lost, reason });
    }

    gainEnergy(seat, n, reason) {
        if (n <= 0) return;
        const total = n + this.count(seat, 'friendOfChildren');
        this.players[seat].energy += total;
        this.addEvent({ type: 'energy', seat, n: total, reason });
    }

    heal(seat, n, reason) {
        const p = this.players[seat];
        if (n <= 0 || !p.alive) return 0;
        const amount = Math.min(n + this.count(seat, 'regeneration'), this.maxHealth(seat) - p.health);
        if (amount <= 0) return 0;
        p.health += amount;
        this.addEvent({ type: 'heal', seat, n: amount, reason });
        return amount;
    }

    // 体力を失う（翼・装甲・擬態・逆境に強い・急速回復・子どもがいる、を当てはめる）。失った数を返す
    loseHealth(seat, n, reason) {
        const p = this.players[seat];
        if (n <= 0 || !p.alive) return 0;
        if (p.wingsTurn === this.turnNo) {
            this.addEvent({ type: 'blocked', seat, reason: 'wings' });
            return 0;
        }
        let amount = n;
        // 擬態：失う数だけダイスを振り、ハート 1 つにつき 1 減らす
        for (let k = this.count(seat, 'camouflage'); k > 0 && amount > 0; k--) {
            const rolls = Array.from({ length: amount }, () => this.rollFace());
            const saved = rolls.filter(f => f === 'heart').length;
            this.addEvent({ type: 'camouflage', seat, rolls, saved });
            amount -= saved;
        }
        if (amount === 1 && this.has(seat, 'armorPlating')) {
            this.addEvent({ type: 'blocked', seat, reason: 'armorPlating' });
            return 0;
        }
        if (amount <= 0) return 0;
        p.health -= amount;
        this.addEvent({ type: 'damage', seat, n: amount, reason });
        if (amount >= 2) this.gainEnergy(seat, this.count(seat, 'weReOnlyMakingItStronger'), 'weReOnlyMakingItStronger');
        // 急速回復：体力が 0 になるなら、エネルギーで回復して防ぐ（持ち主に得なので自動で使う）
        while (p.health <= 0 && this.has(seat, 'rapidHealing') && p.energy >= 2) {
            p.energy -= 2;
            p.health += 1;
            this.addEvent({ type: 'rapidHeal', seat });
        }
        if (p.health <= 0) this.knockOut(seat);
        return amount;
    }

    knockOut(seat) {
        const p = this.players[seat];
        p.health = 0;
        this.addEvent({ type: 'knockOut', seat });
        // モンスターの体力が 0 になるたびに、死肉喰らいの持ち主は 3 勝利点
        this.players.forEach(o => {
            if (o.alive && o.id !== seat) this.gainVp(o.id, 3 * this.count(o.id, 'eaterOfTheDead'), 'eaterOfTheDead');
        });
        if (this.has(seat, 'itHasAChild')) {
            this.discardPile.push(...p.cards.splice(0));
            p.mimic = null;
            p.vp = 0;
            p.health = MAX_HEALTH;
            p.poison = 0;
            p.shrink = 0;
            this.leaveTokyo(seat);
            this.addEvent({ type: 'reborn', seat });
            return;
        }
        p.alive = false;
        this.discardPile.push(...p.cards.splice(0));
        p.mimic = null;
        this.leaveTokyo(seat);
        // 生き残りが 4 体以下になったら、東京湾は使わない
        if (!this.bayInUse() && this.tokyo.bay !== null) {
            const s = this.tokyo.bay;
            this.tokyo.bay = null;
            this.addEvent({ type: 'leaveTokyo', seat: s, where: 'bay', reason: 'bayClosed' });
        }
    }

    leaveTokyo(seat) {
        if (this.tokyo.city === seat) this.tokyo.city = null;
        if (this.tokyo.bay === seat) this.tokyo.bay = null;
    }

    enterTokyo(seat, where) {
        this.tokyo[where] = seat;
        this.addEvent({ type: 'enterTokyo', seat, where });
        this.gainVp(seat, 1, 'enterTokyo');
    }

    rollFace() {
        return FACES[Math.floor(this.random() * 6)];
    }

    // ---------- 勝ち負け ----------

    checkWin() {
        if (this.isOver()) return true;
        const alive = this.alive();
        const reached = alive.filter(s => this.players[s].vp >= WIN_POINTS);
        if (reached.length > 0 || alive.length <= 1) {
            // 20 勝利点に届いた人（何人もなら勝利点の多い人、同じなら手番の人を先に）。いなければ最後の 1 体
            const order = reached.sort((a, b) => this.players[b].vp - this.players[a].vp || (a === this.current ? -1 : b === this.current ? 1 : a - b));
            this.winner = order[0] ?? alive[0] ?? null;
            this.phase = 'end';
            this.decision = null;
            this.steps = [];
            this.addEvent({ type: 'end', winner: this.winner, reason: reached.length ? 'points' : 'lastStanding' });
            return true;
        }
        return false;
    }

    // ---------- 手順の列 ----------

    run() {
        while (!this.decision && this.steps.length > 0 && !this.isOver()) {
            const step = this.steps[0];
            const done = this[`step_${step.op}`](step);
            if (this.checkWin()) return;
            if (done !== false) this.steps.shift();
        }
        this.checkWin();
    }

    // 手順を足す。手順の中では今の手順の次（1）、操作の中では今の手順の前（0。今の手順は答えのあとにもう一度実行される）
    insert(...steps) {
        this.steps.splice(this.insertIndex ?? 1, 0, ...steps);
    }

    ask(seat, kind, data = {}) {
        this.decision = { seat, kind, ...data };
        return false;
    }

    // ---------- 手番 ----------

    startTurn({ fresh = false, lessDice = 0 } = {}) {
        this.turnNo++;
        const seat = this.current;
        this.turn = {
            seat, rolls: 0, rerollsLeft: 2 + this.count(seat, 'giantBrain'), lessDice, herdCuller: false,
            damaged: false, frenzy: false, freezeTime: false, extra: !fresh && lessDice > 0, attackedTokyo: [], hit: []
        };
        this.dice = [];
        this.steps = [{ op: 'beginTurn' }];
    }

    step_beginTurn() {
        const seat = this.current;
        const p = this.players[seat];
        this.addEvent({ type: 'turn', seat });
        if (this.inTokyo(seat)) {
            this.gainVp(seat, 2, 'startInTokyo');
            this.gainVp(seat, this.count(seat, 'urbavore'), 'urbavore');
        }
        if (p.battery > 0) {
            const take = Math.min(2, p.battery);
            p.battery -= take;
            this.gainEnergy(seat, take, 'batteryMonster');
            if (p.battery === 0) this.discardOwn(seat, 'batteryMonster');
        }
        this.insert({ op: 'mimicMove' }, { op: 'firstRoll' });
    }

    // ものまね：番の初めに 1 エネルギーで写すカードを変えられる
    step_mimicMove(step) {
        const seat = this.current;
        if (step.answered || !this.ownsKey(seat, 'mimic') || this.players[seat].energy < 1 || this.mimicTargets(seat).length === 0) return true;
        return this.ask(seat, 'mimic', { move: true, targets: this.mimicTargets(seat) });
    }

    ownsKey(seat, key) {
        return this.players[seat].cards.some(id => keyOf(id) === key);
    }

    mimicTargets(seat) {
        const list = [];
        this.players.forEach(p => {
            if (!p.alive) return;
            p.cards.forEach(id => {
                if (cardOf(id).kind === 'keep' && !NOT_MIMICABLE.includes(keyOf(id))) list.push({ seat: p.id, card: id });
            });
        });
        return list;
    }

    diceCount(seat) {
        const p = this.players[seat];
        return Math.max(0, 6 + this.count(seat, 'extraHead') - p.shrink - this.turn.lessDice);
    }

    step_firstRoll() {
        const seat = this.current;
        this.dice = Array.from({ length: this.diceCount(seat) }, () => this.rollFace());
        this.turn.rolls = 1;
        this.addEvent({ type: 'roll', seat, dice: [...this.dice] });
        this.insert({ op: 'rolling' });
        return true;
    }

    // 振り直しに使えるもの（無料の振り直し → 煙幕 → エナジードリンク）
    rerollSource(seat, indices) {
        const p = this.players[seat];
        if (this.turn.rerollsLeft > 0) return 'free';
        if (p.smoke > 0) return 'smoke';
        if (this.has(seat, 'energyDrink') && p.energy >= 1) return 'drink';
        // 背景の住人：3 の目は、いつでも振り直せる
        if (this.has(seat, 'backgroundDweller') && indices.length > 0 && indices.every(i => this.dice[i] === '3')) return 'dweller';
        return null;
    }

    step_rolling() {
        return this.ask(this.current, 'roll');
    }

    // 出目を決めた：念力探査 → 出目の効果 → 東京 → カードを買う → 番の終わり
    afterRolling() {
        this.addEvent({ type: 'resolveDice', seat: this.current, dice: [...this.dice] });
        const others = this.alive().filter(s => s !== this.current && this.has(s, 'psychicProbe'));
        this.insert(...others.map(s => ({ op: 'psychicProbe', seat: s })), { op: 'resolveDice' }, { op: 'buyPhase' }, { op: 'endTurn' });
    }

    step_psychicProbe(step) {
        if (step.answered || !this.players[step.seat].alive || !this.has(step.seat, 'psychicProbe') || this.dice.length === 0) return true;
        return this.ask(step.seat, 'psychicProbe');
    }

    // ---------- 出目の効果 ----------

    step_resolveDice() {
        const seat = this.current;
        const counts = Object.fromEntries(FACES.map(f => [f, this.dice.filter(d => d === f).length]));
        // 完全破壊：6 種類の目がすべてある
        if (FACES.every(f => counts[f] > 0)) this.gainVp(seat, 9 * this.count(seat, 'completeDestruction'), 'completeDestruction');
        // 数字：同じ数字 3 つでその数の勝利点、4 つめからは 1 つにつき 1 点
        ['1', '2', '3'].forEach(f => {
            if (counts[f] >= 3) this.gainVp(seat, Number(f) + counts[f] - 3, `dice${f}`);
        });
        if (counts['1'] >= 3) {
            this.gainVp(seat, 2 * this.count(seat, 'gourmet'), 'gourmet');
            if (this.has(seat, 'freezeTime')) this.turn.freezeTime = true;
        }
        if (counts['1'] >= 1 && counts['2'] >= 1 && counts['3'] >= 1) this.gainVp(seat, 2 * this.count(seat, 'detritivore'), 'detritivore');
        // エネルギー
        this.gainEnergy(seat, counts.energy, 'dice');
        // ハート：まず毒・縮小を消し、残りで回復（東京にいる間は回復できない）。癒しの光線があれば、ほかのモンスターにも分けられる
        let hearts = counts.heart;
        const p = this.players[seat];
        while (hearts > 0 && (p.poison > 0 || p.shrink > 0)) {
            if (p.poison > 0) p.poison--;
            else p.shrink--;
            hearts--;
            this.addEvent({ type: 'removeToken', seat });
        }
        this.turn.hearts = hearts;
        // 攻撃の数
        let claws = counts.claw;
        const rolledClaw = counts.claw > 0;
        claws += this.count(seat, 'acidAttack');
        if (this.inTokyo(seat)) claws += this.count(seat, 'burrowing');
        if (rolledClaw) claws += this.count(seat, 'spikedTail');
        if (rolledClaw && this.inTokyo(seat)) claws += this.count(seat, 'urbavore');
        if (counts['2'] >= 3) claws += 2 * this.count(seat, 'poisonQuills');
        this.turn.claws = claws;
        this.turn.rolledClaw = rolledClaw;
        this.insert({ op: 'healingRay' }, { op: 'healSelf' }, { op: 'attack' });
        return true;
    }

    step_healingRay(step) {
        const seat = this.current;
        if (step.answered || this.turn.hearts <= 0 || !this.has(seat, 'healingRay')) return true;
        const targets = this.alive().filter(s => s !== seat && this.players[s].health < this.maxHealth(s) && this.players[s].energy > 0);
        if (targets.length === 0) return true;
        return this.ask(seat, 'healingRay', { hearts: this.turn.hearts, targets });
    }

    step_healSelf() {
        const seat = this.current;
        if (this.turn.hearts > 0 && !this.inTokyo(seat)) this.heal(seat, this.turn.hearts, 'dice');
        return true;
    }

    step_attack() {
        const seat = this.current;
        const claws = this.turn.claws;
        if (this.turn.rolledClaw) this.gainVp(seat, this.count(seat, 'alphaMonster'), 'alphaMonster');
        const hits = [];
        if (claws > 0) {
            const targets = this.has(seat, 'novaBreath') ? this.alive().filter(s => s !== seat)
                : this.inTokyo(seat) ? this.alive().filter(s => s !== seat && !this.inTokyo(s))
                    : this.alive().filter(s => this.inTokyo(s));
            targets.forEach(t => hits.push({ seat: t, amount: claws, smash: true }));
            this.addEvent({ type: 'attack', seat, claws, targets });
        }
        // 火炎の息：攻撃の目を出したら、席の両隣は 1 体力を失う
        if (this.turn.rolledClaw && this.has(seat, 'fireBreathing')) {
            this.neighbors(seat).forEach(t => hits.push({ seat: t, amount: this.count(seat, 'fireBreathing'), smash: false, reason: 'fireBreathing' }));
        }
        this.turn.hit = hits.filter(h => h.smash).map(h => h.seat);
        // 東京にいて攻撃されたモンスターは、明け渡すかを決める（攻撃を受ける前に決め、ジェットなら体力を失わない）
        const tokyoHit = this.turn.hit.filter(s => this.inTokyo(s));
        this.insert(
            ...tokyoHit.map(s => ({ op: 'askYield', seat: s })),
            { op: 'damage', hits, source: seat },
            { op: 'smashTokens' },
            { op: 'takeTokyo' });
        return true;
    }

    step_askYield(step) {
        const p = this.players[step.seat];
        if (step.answered || !p.alive || !this.inTokyo(step.seat)) return true;
        return this.ask(step.seat, 'yield', { attacker: this.current, damage: this.turn.claws });
    }

    // 体力を失わせる（翼を使うかを、受ける人が先に決める）
    step_damage(step) {
        step.i ??= 0;
        while (step.i < step.hits.length) {
            const hit = step.hits[step.i];
            const target = this.players[hit.seat];
            if (!target.alive) { step.i++; continue; }
            // ジェット：明け渡すことにしたら、その攻撃で体力を失わない
            if (hit.smash && this.turn.yielded?.includes(hit.seat) && this.has(hit.seat, 'jets')) {
                this.addEvent({ type: 'blocked', seat: hit.seat, reason: 'jets' });
                step.i++;
                continue;
            }
            if (!hit.wingsAsked && this.has(hit.seat, 'wings') && target.energy >= 2 && target.wingsTurn !== this.turnNo) {
                hit.wingsAsked = true;
                return this.ask(hit.seat, 'wings', { damage: hit.amount });
            }
            const lost = this.loseHealth(hit.seat, hit.amount, hit.reason ?? 'attack');
            if (lost > 0 && hit.seat !== this.current) this.turn.damaged = true;
            step.i++;
        }
        return true;
    }

    // 毒の唾・縮小光線：攻撃したモンスターに印を付ける
    step_smashTokens() {
        const seat = this.current;
        this.turn.hit.filter(s => this.players[s].alive).forEach(s => {
            const poison = this.count(seat, 'poisonSpit');
            const shrink = this.count(seat, 'shrinkRay');
            if (poison) { this.players[s].poison += poison; this.addEvent({ type: 'token', seat: s, token: 'poison', n: poison }); }
            if (shrink) { this.players[s].shrink += shrink; this.addEvent({ type: 'token', seat: s, token: 'shrink', n: shrink }); }
        });
        return true;
    }

    // 東京に入る：明け渡した場所を攻撃した人が取る。東京が空いていれば、手番の人が入る
    step_takeTokyo() {
        const seat = this.current;
        if (!this.players[seat].alive) return true;
        const yielded = this.turn.yielded ?? [];
        if (!this.inTokyo(seat)) {
            const where = this.tokyo.city === null ? 'city' : this.bayInUse() && this.tokyo.bay === null ? 'bay' : null;
            if (where) {
                this.enterTokyo(seat, where);
                // 地中もぐり：明け渡した人が持っていれば、入ってきたモンスターは 1 体力を失う
                yielded.forEach(s => {
                    const burrow = this.count(s, 'burrowing');
                    if (burrow && this.players[s].alive) this.loseHealth(seat, burrow, 'burrowing');
                });
            }
        }
        return true;
    }

    // ---------- カードを買う ----------

    step_buyPhase(step) {
        const seat = this.current;
        if (step.done || !this.players[seat].alive) return true;
        return this.ask(seat, 'buy');
    }

    // カードを得る（買ったとき）。使い捨てはすぐ効果を使って捨てる
    acquire(seat, id) {
        const p = this.players[seat];
        this.gainVp(seat, this.count(seat, 'mediaFriendly'), 'mediaFriendly');
        const card = cardOf(id);
        this.addEvent({ type: 'buy', seat, card: id });
        if (card.kind === 'discard') {
            this.discardPile.push(id);
            this.playDiscard(seat, keyOf(id));
            return;
        }
        p.cards.push(id);
        const key = keyOf(id);
        if (key === 'evenBigger') this.heal(seat, 2, 'evenBigger');
        if (key === 'batteryMonster') p.battery += 6;
        if (key === 'smokeCloud') p.smoke += 3;
        if (key === 'mimic' && this.mimicTargets(seat).length > 0) this.insert({ op: 'mimicChoose', seat });
    }

    step_mimicChoose(step) {
        if (step.answered) return true;
        return this.ask(step.seat, 'mimic', { move: false, targets: this.mimicTargets(step.seat) });
    }

    playDiscard(seat, key) {
        const others = this.alive().filter(s => s !== seat);
        const hits = list => this.insert({ op: 'damage', hits: list, source: seat });
        switch (key) {
            case 'apartmentBuilding': this.gainVp(seat, 3, key); break;
            case 'commuterTrain': this.gainVp(seat, 2, key); break;
            case 'cornerStore': this.gainVp(seat, 1, key); break;
            case 'skyscraper': this.gainVp(seat, 4, key); break;
            case 'energize': this.gainEnergy(seat, 9, key); break;
            case 'heal': this.heal(seat, 2, key); break;
            case 'nuclearPowerPlant': this.gainVp(seat, 2, key); this.heal(seat, 3, key); break;
            case 'jetFighters': this.gainVp(seat, 5, key); hits([{ seat, amount: 4, reason: key }]); break;
            case 'nationalGuard': this.gainVp(seat, 2, key); hits([{ seat, amount: 2, reason: key }]); break;
            case 'tank': this.gainVp(seat, 4, key); hits([{ seat, amount: 3, reason: key }]); break;
            case 'evacuationOrders': others.forEach(s => this.loseVp(s, 5, key)); break;
            case 'flameThrower': hits(others.map(s => ({ seat: s, amount: 2, reason: key }))); break;
            case 'gasRefinery': this.gainVp(seat, 2, key); hits(others.map(s => ({ seat: s, amount: 3, reason: key }))); break;
            case 'highAltitudeBombing': hits([seat, ...others].map(s => ({ seat: s, amount: 3, reason: key }))); break;
            case 'frenzy': this.turn.frenzy = true; break;
            case 'vastStorm':
                this.gainVp(seat, 2, key);
                others.forEach(s => {
                    const lose = Math.floor(this.players[s].energy / 2);
                    if (lose) { this.players[s].energy -= lose; this.addEvent({ type: 'energy', seat: s, n: -lose, reason: key }); }
                });
                break;
            case 'deathFromAbove':
                this.gainVp(seat, 2, key);
                // 東京に入り、ほかのモンスターは東京を明け渡す
                if (this.tokyo.city !== seat) {
                    [this.tokyo.city, this.tokyo.bay].filter(s => s !== null && s !== seat).forEach(s => {
                        this.leaveTokyo(s);
                        this.addEvent({ type: 'leaveTokyo', seat: s, reason: key });
                    });
                    this.leaveTokyo(seat);
                    this.enterTokyo(seat, 'city');
                }
                break;
            default: break;
        }
    }

    // 場からカードを取り、新しいカードを出す（機会主義の持ち主は、新しいカードをすぐ買える）
    takeFromMarket(index) {
        const id = this.market[index];
        const fresh = this.deck.length ? this.deck.pop() : null;
        this.market[index] = fresh;
        this.market = this.market.filter(Boolean);
        if (fresh) this.revealed([fresh]);
        return id;
    }

    revealed(ids) {
        this.addEvent({ type: 'reveal', cards: [...ids] });
        const order = [];
        for (let i = 1; i < this.n; i++) order.push((this.current + i) % this.n);
        this.insert(...order.filter(s => this.players[s].alive && this.has(s, 'opportunist')).map(s => ({ op: 'opportunist', seat: s, cards: [...ids] })));
    }

    step_opportunist(step) {
        if (step.answered) return true;
        const p = this.players[step.seat];
        const affordable = step.cards.filter(id => this.market.includes(id) && this.cardCost(step.seat, id) <= p.energy);
        if (!p.alive || affordable.length === 0) return true;
        return this.ask(step.seat, 'opportunist', { cards: affordable });
    }

    discardOwn(seat, key) {
        const p = this.players[seat];
        const i = p.cards.findIndex(id => keyOf(id) === key);
        if (i < 0) return;
        const [id] = p.cards.splice(i, 1);
        this.discardPile.push(id);
        if (p.mimic && p.mimic.card === id) p.mimic = null;
        this.players.forEach(o => { if (o.mimic && o.mimic.card === id) o.mimic = null; });
        this.addEvent({ type: 'discardCard', seat, card: id });
    }

    // ---------- 番の終わり ----------

    step_endTurn(step) {
        const seat = this.current;
        const p = this.players[seat];
        if (p.alive && !step.effectsDone) {
            step.effectsDone = true;
            if (!this.turn.damaged) this.gainVp(seat, this.count(seat, 'herbivore'), 'herbivore');
            this.gainVp(seat, Math.floor(p.energy / 6) * this.count(seat, 'energyHoarder'), 'energyHoarder');
            if (p.energy === 0) this.gainEnergy(seat, this.count(seat, 'solarPowered'), 'solarPowered');
            if (this.has(seat, 'rootingForTheUnderdog') && this.alive().every(s => this.players[s].vp >= p.vp)) this.gainVp(seat, this.count(seat, 'rootingForTheUnderdog'), 'rootingForTheUnderdog');
            // 毒：番の終わりに、毒 1 つにつき 1 体力を失う
            if (p.poison > 0) {
                this.insert({ op: 'damage', hits: [{ seat, amount: p.poison, reason: 'poison' }], source: null }, { op: 'endTurn', effectsDone: true });
                return true;
            }
        }
        if (p.alive && !step.metamorphAsked && this.has(seat, 'metamorph') && p.cards.length > 0) {
            step.metamorphAsked = true;
            return this.ask(seat, 'metamorph');
        }
        this.nextTurn();
        // 次の番の手順に入れ替えたので、先頭を取り除かない
        return false;
    }

    nextTurn() {
        const seat = this.current;
        const p = this.players[seat];
        // 狂乱・時間停止：もう 1 回手番（時間停止はダイスが 1 つ減る）
        if (p.alive && (this.turn.frenzy || this.turn.freezeTime)) {
            const lessDice = this.turn.freezeTime && !this.turn.frenzy ? this.turn.lessDice + 1 : 0;
            this.addEvent({ type: 'extraTurn', seat, reason: this.turn.frenzy ? 'frenzy' : 'freezeTime' });
            this.startTurn({ lessDice });
            return;
        }
        for (let i = 1; i <= this.n; i++) {
            const next = (seat + i) % this.n;
            if (this.players[next].alive) {
                this.current = next;
                break;
            }
        }
        this.startTurn({ fresh: true });
    }

    // ---------- 判定と操作 ----------

    validate(seat, command) {
        if (!command || typeof command !== 'object') return '操作の形が正しくありません';
        if (this.isOver()) return 'ゲームは終わっています';
        if (command.type === 'rapidHeal') {
            const p = this.players[seat];
            if (!p?.alive || !this.has(seat, 'rapidHealing')) return '急速回復を持っていません';
            if (p.energy < 2) return 'エネルギーが足りません';
            if (p.health >= this.maxHealth(seat)) return '体力は満タンです';
            return null;
        }
        const d = this.decision;
        if (!d || d.seat !== seat) return 'あなたが決める番ではありません';
        const p = this.players[seat];
        switch (d.kind) {
            case 'roll': {
                if (command.type === 'resolve') return null;
                if (command.type === 'reroll') {
                    const idx = command.dice;
                    if (!Array.isArray(idx) || idx.length === 0 || idx.some(i => !Number.isInteger(i) || i < 0 || i >= this.dice.length) || new Set(idx).size !== idx.length) return '振り直すダイスが正しくありません';
                    return this.rerollSource(seat, idx) ? null : 'もう振り直せません';
                }
                if (command.type === 'change') {
                    const { index, face, card } = command;
                    if (!Number.isInteger(index) || index < 0 || index >= this.dice.length) return 'ダイスが正しくありません';
                    if (card === 'herdCuller') return this.has(seat, 'herdCuller') && !this.turn.herdCuller && face === '1' ? null : '群れの間引きは使えません';
                    if (!FACES.includes(face)) return '目が正しくありません';
                    if (card === 'plotTwist') return this.ownsKey(seat, 'plotTwist') ? null : 'どんでん返しを持っていません';
                    if (card === 'stretchy') return this.has(seat, 'stretchy') && p.energy >= 2 ? null : '伸縮自在は使えません';
                    return 'そのカードでは変えられません';
                }
                return '今はその操作はできません';
            }
            case 'buy': {
                if (command.type === 'endBuy') return null;
                if (command.type === 'sweep') return p.energy >= 2 && this.deck.length > 0 ? null : 'エネルギーが足りません';
                if (command.type === 'buy') {
                    if (!this.market.includes(command.card)) return '場にないカードです';
                    return this.cardCost(seat, command.card) <= p.energy ? null : 'エネルギーが足りません';
                }
                if (command.type === 'buyTop') {
                    if (!this.has(seat, 'madeInALab') || this.deck.length === 0) return '研究所生まれは使えません';
                    return this.cardCost(seat, this.deck.at(-1)) <= p.energy ? null : 'エネルギーが足りません';
                }
                if (command.type === 'buyFrom') {
                    const owner = this.players[command.seat];
                    if (!this.has(seat, 'parasiticTentacles') || !owner || owner.id === seat || !owner.alive || !owner.cards.includes(command.card)) return 'そのカードは買えません';
                    return this.cardCost(seat, command.card) <= p.energy ? null : 'エネルギーが足りません';
                }
                return '今はその操作はできません';
            }
            case 'yield': return command.type === 'yield' && typeof command.yes === 'boolean' ? null : '明け渡すかどうかを選んでください';
            case 'wings': return command.type === 'wings' && typeof command.yes === 'boolean' ? null : '翼を使うかどうかを選んでください';
            case 'psychicProbe':
                if (command.type !== 'probe') return '念力探査の操作ではありません';
                return command.index === null || (Number.isInteger(command.index) && command.index >= 0 && command.index < this.dice.length) ? null : 'ダイスが正しくありません';
            case 'healingRay': {
                if (command.type !== 'healingRay' || typeof command.give !== 'object' || command.give === null) return '癒しの光線の操作ではありません';
                let total = 0;
                for (const [s, k] of Object.entries(command.give)) {
                    const t = Number(s);
                    if (!d.targets.includes(t) || !Number.isInteger(k) || k < 0) return '分け方が正しくありません';
                    if (k > this.maxHealth(t) - this.players[t].health) return '回復しすぎです';
                    if (k > this.players[t].energy) return '相手のエネルギーが足りません';
                    total += k;
                }
                return total <= d.hearts ? null : 'ハートが足りません';
            }
            case 'opportunist':
                if (command.type !== 'opportunist') return '機会主義の操作ではありません';
                return command.card === null || d.cards.includes(command.card) ? null : 'そのカードは買えません';
            case 'mimic':
                if (command.type !== 'mimic') return 'ものまねの操作ではありません';
                if (command.target === null) return null;
                return d.targets.some(t => t.seat === command.target?.seat && t.card === command.target?.card) ? null : 'そのカードは写せません';
            case 'metamorph':
                if (command.type !== 'metamorph' || !Array.isArray(command.cards)) return '変態の操作ではありません';
                return command.cards.every(id => p.cards.includes(id)) && new Set(command.cards).size === command.cards.length ? null : '持っていないカードです';
            default:
                return '知らない操作です';
        }
    }

    applyCommand(seat, command) {
        this.lastError = this.validate(seat, command);
        if (this.lastError) return false;
        this.commands.push({ seat, command: structuredClone(command) });
        this.insertIndex = 0;
        try {
            this.execute(seat, command);
        } finally {
            this.insertIndex = 1;
        }
        this.run();
        return true;
    }

    execute(seat, command) {
        const p = this.players[seat];
        const d = this.decision;
        const step = this.steps[0];
        if (command.type === 'rapidHeal') {
            p.energy -= 2;
            p.health += 1;
            this.addEvent({ type: 'rapidHeal', seat });
            return;
        }
        switch (d.kind) {
            case 'roll':
                if (command.type === 'resolve') {
                    this.decision = null;
                    this.steps.shift(); // rolling
                    this.afterRolling();
                    return;
                }
                if (command.type === 'reroll') {
                    const source = this.rerollSource(seat, command.dice);
                    if (source === 'free') this.turn.rerollsLeft--;
                    if (source === 'smoke') { p.smoke--; if (p.smoke === 0) this.discardOwn(seat, 'smokeCloud'); }
                    if (source === 'drink') p.energy -= 1;
                    command.dice.forEach(i => { this.dice[i] = this.rollFace(); });
                    this.turn.rolls++;
                    this.addEvent({ type: 'roll', seat, dice: [...this.dice], rerolled: [...command.dice], source });
                    return;
                }
                // change
                if (command.card === 'herdCuller') this.turn.herdCuller = true;
                if (command.card === 'plotTwist') this.discardOwn(seat, 'plotTwist');
                if (command.card === 'stretchy') p.energy -= 2;
                this.dice[command.index] = command.face;
                this.addEvent({ type: 'change', seat, index: command.index, face: command.face, card: command.card });
                return;
            case 'buy':
                if (command.type === 'endBuy') {
                    this.decision = null;
                    step.done = true;
                    return;
                }
                if (command.type === 'sweep') {
                    p.energy -= 2;
                    this.discardPile.push(...this.market);
                    this.market = [];
                    while (this.market.length < 3 && this.deck.length) this.market.push(this.deck.pop());
                    this.addEvent({ type: 'sweep', seat });
                    this.decision = null;
                    this.revealed(this.market);
                    return;
                }
                if (command.type === 'buy') {
                    p.energy -= this.cardCost(seat, command.card);
                    this.decision = null;
                    const id = this.takeFromMarket(this.market.indexOf(command.card));
                    this.acquire(seat, id);
                    return;
                }
                if (command.type === 'buyTop') {
                    const id = this.deck.pop();
                    p.energy -= this.cardCost(seat, id);
                    this.decision = null;
                    this.acquire(seat, id);
                    return;
                }
                if (command.type === 'buyFrom') {
                    const owner = this.players[command.seat];
                    const cost = this.cardCost(seat, command.card);
                    p.energy -= cost;
                    owner.energy += cost;
                    owner.cards.splice(owner.cards.indexOf(command.card), 1);
                    if (owner.mimic) owner.mimic = keyOf(command.card) === 'mimic' ? null : owner.mimic;
                    this.players.forEach(o => { if (o.mimic?.card === command.card) o.mimic = null; });
                    // 載せていたもの（煙・電池）は、持ち主と一緒に移らない
                    if (keyOf(command.card) === 'smokeCloud') owner.smoke = 0;
                    if (keyOf(command.card) === 'batteryMonster') owner.battery = 0;
                    this.decision = null;
                    this.addEvent({ type: 'buyFrom', seat, from: command.seat, card: command.card });
                    this.acquire(seat, command.card);
                    return;
                }
                return;
            case 'yield':
                this.decision = null;
                step.answered = true;
                if (command.yes) {
                    this.turn.yielded = [...(this.turn.yielded ?? []), seat];
                    const where = this.tokyo.city === seat ? 'city' : 'bay';
                    this.leaveTokyo(seat);
                    this.addEvent({ type: 'leaveTokyo', seat, where, reason: 'yield' });
                    // 攻撃した人が、明け渡した場所に入る（市街を先に）
                    const attacker = this.current;
                    if (!this.inTokyo(attacker) && this.players[attacker].alive) {
                        this.enterTokyo(attacker, where === 'bay' && this.tokyo.city === null ? 'city' : where);
                        const burrow = this.count(seat, 'burrowing');
                        if (burrow) this.insert({ op: 'damage', hits: [{ seat: attacker, amount: burrow, reason: 'burrowing' }], source: seat });
                    }
                } else {
                    this.addEvent({ type: 'stay', seat });
                }
                return;
            case 'wings':
                this.decision = null;
                if (command.yes) {
                    p.energy -= 2;
                    p.wingsTurn = this.turnNo;
                    this.addEvent({ type: 'wings', seat });
                }
                return;
            case 'psychicProbe': {
                this.decision = null;
                step.answered = true;
                if (command.index !== null) {
                    const face = this.rollFace();
                    this.dice[command.index] = face;
                    this.addEvent({ type: 'probe', seat, target: this.current, index: command.index, face, dice: [...this.dice] });
                    if (face === 'heart') this.discardOwn(seat, 'psychicProbe');
                }
                return;
            }
            case 'healingRay': {
                this.decision = null;
                step.answered = true;
                Object.entries(command.give).forEach(([s, k]) => {
                    const t = Number(s);
                    if (k <= 0) return;
                    const healed = this.heal(t, k, 'healingRay');
                    const pay = Math.min(this.players[t].energy, 2 * healed);
                    this.players[t].energy -= pay;
                    p.energy += pay;
                    this.turn.hearts -= k;
                    this.addEvent({ type: 'healingRayPay', seat: t, to: seat, energy: pay });
                });
                return;
            }
            case 'opportunist':
                this.decision = null;
                step.answered = true;
                if (command.card !== null) {
                    p.energy -= this.cardCost(seat, command.card);
                    const id = this.takeFromMarket(this.market.indexOf(command.card));
                    this.acquire(seat, id);
                }
                return;
            case 'mimic':
                this.decision = null;
                step.answered = true;
                if (d.move) {
                    if (command.target) {
                        p.energy -= 1;
                        p.mimic = { ...command.target };
                        this.addEvent({ type: 'mimic', seat, target: p.mimic });
                    }
                } else {
                    p.mimic = command.target ? { ...command.target } : null;
                    if (p.mimic) {
                        this.addEvent({ type: 'mimic', seat, target: p.mimic });
                        // 写したカードは「今買ったように」扱う
                        if (keyOf(p.mimic.card) === 'evenBigger') this.heal(seat, 2, 'evenBigger');
                    }
                }
                return;
            case 'metamorph':
                this.decision = null;
                command.cards.forEach(id => {
                    const cost = cardOf(id).cost;
                    this.discardOwn(seat, keyOf(id));
                    this.gainEnergy(seat, cost, 'metamorph');
                });
                return;
            default:
                return;
        }
    }

    step_noop() {
        return true;
    }
}
