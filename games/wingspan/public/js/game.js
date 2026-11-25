/**
 * ウイングスパン（基本セット、2〜5人）のルール。DOM に依存しない
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札・サイコロはシードから決まる）
 *
 * 進み方
 * - 準備：鳥5枚・ボーナスカード2枚・餌5つ（各種1つ）を配る。鳥を残した数だけ餌を捨て、ボーナスカードを1枚残す（全員が同時に選ぶ）
 * - 4ラウンド。手番は 8・7・6・5 回ずつ。手番には次のどれか1つを行う
 *   - 鳥を出す：生息地を選び、餌（2つで好きな1つの代わりにできる）と、列の位置で決まる卵を払う。白い能力はここで働く
 *   - 森林：餌箱から餌を取る / 草原：卵を産む / 湿地：カードを引く。量はその列の鳥の数で決まる。
 *     そのあと、その列の茶色の能力を右から順に使える（使うかどうかは選べる）
 *   - 列の2・4・6番目の位置では、ボーナスの交換（森林：カード→餌、草原：餌→卵、湿地：卵→カード）を1回できる
 * - 手番の終わりに、場の3枚を補充する。ラウンドの終わりに目標（緑の面）を採点し、場の3枚を入れ替え、先手を次の人に回す
 * - 得点：鳥の点・ボーナスカード・ラウンドの目標・卵・貯えた餌・差し込んだカード（各1点）。同点なら残った餌の多い人の勝ち
 *
 * カードの効果は手順の列（tasks）に積んで順に行う。入力が要る手順では選択待ち（decision）を出して止まる
 * 操作の入口は applyCommand(seat, command) だけ。断る操作は状態を変えない（判定を先に済ませてから変える）
 */

import {
    FOODS, HABITATS, DIE_FACES, ACTION_AMOUNTS, BONUS_COLUMNS, EGG_COST, ROW_SIZE, TURNS_PER_ROUND, ROUNDS, GOAL_POINTS,
    BIRDS, birdOf, BONUS_CARDS, bonusOf, bonusPoints, GOALS, goalOf, boardBirds, HABITAT_NAMES, FOOD_NAMES
} from './birds.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const MAX_LOGS = 300;
const MAX_EVENTS = 200;
const FEEDER_DICE = 5;
const START_BIRDS = 5;
const START_BONUS = 2;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    setup: ['birds', 'food', 'bonus'],
    play: ['bird', 'habitat', 'food', 'eggs'],
    action: ['habitat', 'bonus'],
    take: ['die', 'as'],
    reroll: [],
    lay: ['targets'],
    draw: ['tray', 'deck'],
    power: ['card', 'target', 'give', 'get'],
    skip: [],
    bonus: ['id']
};

const zeroFood = () => Object.fromEntries(FOODS.map(f => [f, 0]));
const isRef = (ref) => ref && typeof ref === 'object' && HABITATS.includes(ref.h) && Number.isInteger(ref.i);
const sameRef = (a, b) => a.h === b.h && a.i === b.i;

// ---- 餌の支払い ----

// 必要な餌を [受け付ける種類の配列] の列にする
function requirements(cost) {
    if (cost.or) return [cost.items];
    return cost.items.map(item => (item === 'any' ? FOODS : [item]));
}

// 払う餌（種類の配列）で、ちょうど払えるか。好きな1つの代わりに、どれでも2つを払ってよい
export function canPay(cost, payment) {
    const counts = zeroFood();
    for (const f of payment) {
        if (!FOODS.includes(f)) return false;
        counts[f]++;
    }
    const reqs = requirements(cost);
    const match = (k) => {
        if (k === reqs.length) return FOODS.every(f => counts[f] === 0);
        for (const f of reqs[k]) {
            if (counts[f] > 0) {
                counts[f]--;
                const ok = match(k + 1);
                counts[f]++;
                if (ok) return true;
            }
        }
        for (let a = 0; a < FOODS.length; a++) {
            for (let b = a; b < FOODS.length; b++) {
                const fa = FOODS[a], fb = FOODS[b];
                if (counts[fa] < 1 || counts[fb] < (fa === fb ? 2 : 1)) continue;
                counts[fa]--; counts[fb]--;
                const ok = match(k + 1);
                counts[fa]++; counts[fb]++;
                if (ok) return true;
            }
        }
        return false;
    };
    return match(0);
}

// 持っている餌で払える組み合わせ（重複なし）。2つで1つの代わりにするのは、そのままでは払えないときだけ並べる
export function paymentOptions(cost, food, limit = 12) {
    const reqs = requirements(cost);
    const counts = { ...food };
    const found = new Map();
    const walk = (k, paid, allowSub) => {
        if (found.size >= limit) return;
        if (k === reqs.length) {
            const key = [...paid].sort().join(',');
            if (!found.has(key)) found.set(key, [...paid].sort());
            return;
        }
        for (const f of reqs[k]) {
            if (counts[f] > 0) {
                counts[f]--; paid.push(f);
                walk(k + 1, paid, allowSub);
                counts[f]++; paid.pop();
            }
        }
        if (!allowSub) return;
        for (let a = 0; a < FOODS.length; a++) {
            for (let b = a; b < FOODS.length; b++) {
                const fa = FOODS[a], fb = FOODS[b];
                if (counts[fa] < 1 || counts[fb] < (fa === fb ? 2 : 1)) continue;
                counts[fa]--; counts[fb]--; paid.push(fa, fb);
                walk(k + 1, paid, allowSub);
                counts[fa]++; counts[fb]++; paid.pop(); paid.pop();
            }
        }
    };
    walk(0, [], false);
    if (found.size === 0) walk(0, [], true);
    return [...found.values()];
}

// ---- 得点 ----

// ラウンドの目標の順位点（緑の面）。同じ値の人は、占める順位の点を足して人数で割る（切り捨て）。0 の人は点なし
export function rankGoal(values, round) {
    const table = GOAL_POINTS[round - 1];
    const order = values.map((value, seat) => ({ seat, value })).filter(e => e.value > 0).sort((a, b) => b.value - a.value);
    const points = values.map(() => 0);
    let place = 0;
    while (place < order.length && place < table.length) {
        const tied = order.filter(e => e.value === order[place].value);
        const share = tied.reduce((s, _, k) => s + (table[place + k] ?? 0), 0);
        tied.forEach(e => { points[e.seat] = Math.floor(share / tied.length); });
        place += tied.length;
    }
    return points;
}

export function scoreOf(player) {
    const birds = boardBirds(player);
    const result = {
        birds: birds.reduce((s, { bird }) => s + bird.points, 0),
        bonus: player.bonus.reduce((s, id) => s + bonusPoints(bonusOf(id), player), 0),
        goals: player.goalPoints.reduce((s, v) => s + v, 0),
        eggs: birds.reduce((s, { slot }) => s + slot.eggs, 0),
        cache: birds.reduce((s, { slot }) => s + FOODS.reduce((t, f) => t + (slot.cache[f] ?? 0), 0), 0),
        tucked: birds.reduce((s, { slot }) => s + slot.tucked, 0)
    };
    result.total = result.birds + result.bonus + result.goals + result.eggs + result.cache + result.tucked;
    return result;
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.rng = seed;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: [], bonus: [], food: zeroFood(),
            board: { forest: [], grassland: [], wetland: [] },
            goalPoints: [], actions: 0,
            offer: null // 準備で配られたもの（選ぶまで）
        }));
        this.deck = this.shuffle(BIRDS.map(b => b.id));
        this.discard = [];
        this.bonusDeck = this.shuffle(BONUS_CARDS.map(c => c.id));
        this.bonusDiscard = [];
        this.goals = this.shuffle(GOALS.map(g => g.id)).slice(0, ROUNDS);
        this.goalResults = []; // ラウンドごとの [{ seat, value, points }]
        this.tray = [];
        this.feeder = [];
        this.rollFeeder();
        this.players.forEach(p => {
            p.offer = { birds: this.drawFromDeck(START_BIRDS), bonus: this.bonusDeck.splice(0, START_BONUS) };
        });
        this.refillTray();
        this.round = 1;
        this.firstPlayer = Math.floor(this.rand() * players.length);
        this.turn = this.firstPlayer;
        this.turnNo = 0;
        this.phase = 'setup'; // setup：準備 / play：対戦中 / end：終わり
        this.decision = null;
        this.tasks = [];
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    get n() { return this.players.length; }

    // ---- 乱数（状態を数1つで持つので、写して試せる） ----

    rand() {
        this.rng = (this.rng + 0x6D2B79F5) >>> 0;
        let t = this.rng;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(this.rand() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    rollDie() {
        return DIE_FACES[Math.floor(this.rand() * DIE_FACES.length)];
    }

    // ---- 調べる ----

    isOver() { return this.phase === 'end'; }

    // 今操作が必要な人
    actors() {
        if (this.phase === 'setup') return this.players.filter(p => p.offer).map(p => p.id);
        if (this.phase === 'play' && this.decision) return [this.decision.seat];
        return [];
    }

    turnsThisRound() { return TURNS_PER_ROUND[this.round - 1] ?? 0; }

    slotAt(seat, ref) {
        return isRef(ref) ? this.players[seat].board[ref.h][ref.i] ?? null : null;
    }

    eggRoom(seat) {
        return boardBirds(this.players[seat]).reduce((s, { bird, slot }) => s + bird.eggs - slot.eggs, 0);
    }

    eggTotal(seat) {
        return boardBirds(this.players[seat]).reduce((s, { slot }) => s + slot.eggs, 0);
    }

    cardsAvailable() { return this.deck.length + this.discard.length; }

    feederAllSame() {
        return this.feeder.length > 0 && this.feeder.every(face => face === this.feeder[0]);
    }

    // 鳥を出せるか（餌と卵が足りて、置き場所がある）。habitat を省くと、どこかに出せるか
    canPlayBird(seat, birdId, habitat = null) {
        const p = this.players[seat];
        const bird = birdOf(birdId);
        if (!bird || !p.hand.includes(birdId)) return false;
        if (paymentOptions(bird.cost, p.food, 1).length === 0) return false;
        const list = habitat ? [habitat] : bird.habitats;
        return list.some(h => bird.habitats.includes(h) && p.board[h].length < ROW_SIZE && this.eggTotal(seat) >= EGG_COST[p.board[h].length]);
    }

    // 行動の量とボーナスの交換ができるか
    actionInfo(seat, habitat) {
        const column = this.players[seat].board[habitat].length;
        return { column, amount: ACTION_AMOUNTS[habitat][column], bonus: BONUS_COLUMNS.includes(column) };
    }

    // ---- 操作 ----

    applyCommand(seat, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[seat]) return this.fail('参加していません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!this.actors().includes(seat)) return this.fail('あなたの番ではありません');
        const ok = this.phase === 'setup' ? this.doSetup(seat, command) : this.dispatch(seat, command);
        if (!ok) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ seat, command: recorded });
        if (this.phase === 'play') this.run();
        return true;
    }

    dispatch(seat, command) {
        const d = this.decision;
        const allowed = {
            turn: ['play', 'action'], food: ['take', 'reroll'], lay: ['lay'], draw: ['draw'],
            power: ['power', 'skip'], bonus: ['bonus'], playExtra: ['play', 'skip']
        }[d.kind];
        if (!allowed.includes(command.type)) return this.fail('今はその操作はできません');
        switch (command.type) {
            case 'play': return this.doPlay(seat, command);
            case 'action': return this.doAction(seat, command);
            case 'take': return this.doTake(seat, command);
            case 'reroll': return this.doReroll(seat);
            case 'lay': return this.doLay(seat, command);
            case 'draw': return this.doDraw(seat, command);
            case 'power': return this.doPower(seat, command);
            case 'skip': return this.doSkip(seat);
            case 'bonus': return this.doBonus(seat, command);
            default: return this.fail('今はその操作はできません');
        }
    }

    // { type:'setup', birds:[残す鳥], food:[残す餌], bonus: 残すボーナスカード }。鳥と餌は合わせて5つ
    doSetup(seat, { birds, food, bonus }) {
        const p = this.players[seat];
        const offer = p.offer;
        if (!offer) return this.fail('準備は済んでいます');
        if (!Array.isArray(birds) || !Array.isArray(food)) return this.fail('選び方が正しくありません');
        if (new Set(birds).size !== birds.length || !birds.every(id => offer.birds.includes(id))) return this.fail('配られた鳥から選んでください');
        if (new Set(food).size !== food.length || !food.every(f => FOODS.includes(f))) return this.fail('餌は種類ごとに1つです');
        if (birds.length + food.length !== START_BIRDS) return this.fail('鳥を残した数だけ、餌を捨ててください');
        if (!offer.bonus.includes(bonus)) return this.fail('ボーナスカードを1枚選んでください');
        p.hand = [...birds];
        this.discard.push(...offer.birds.filter(id => !birds.includes(id)));
        p.food = zeroFood();
        food.forEach(f => { p.food[f] = 1; });
        p.bonus = [bonus];
        this.bonusDiscard.push(...offer.bonus.filter(id => id !== bonus));
        p.offer = null;
        this.emit({ type: 'setup', seat });
        if (this.players.every(q => !q.offer)) this.startPlay();
        return true;
    }

    startPlay() {
        this.phase = 'play';
        this.log(`第1ラウンド。${this.players[this.firstPlayer].name}から始めます`);
        this.emit({ type: 'round', round: 1 });
        this.startTurn();
    }

    startTurn() {
        this.decision = { seat: this.turn, kind: 'turn' };
    }

    // { type:'play', bird, habitat, food:[払う餌], eggs:[卵を取る鳥の位置] }
    doPlay(seat, { bird: birdId, habitat, food, eggs }) {
        const d = this.decision;
        const p = this.players[seat];
        const bird = birdOf(birdId);
        if (!bird || !p.hand.includes(birdId)) return this.fail('手札にない鳥です');
        if (d.kind === 'playExtra' && habitat !== d.habitat) return this.fail(`${HABITAT_NAMES[d.habitat]}に出してください`);
        if (!bird.habitats.includes(habitat)) return this.fail('その生息地には住めません');
        const row = p.board[habitat];
        if (row.length >= ROW_SIZE) return this.fail('その生息地はいっぱいです');
        if (!Array.isArray(food) || !Array.isArray(eggs)) return this.fail('支払いが正しくありません');
        const have = { ...p.food };
        for (const f of food) {
            if (!FOODS.includes(f) || have[f] <= 0) return this.fail('餌が足りません');
            have[f]--;
        }
        if (!canPay(bird.cost, food)) return this.fail('餌の払い方が正しくありません');
        if (eggs.length !== EGG_COST[row.length]) return this.fail(`卵を${EGG_COST[row.length]}個払います`);
        const taken = new Map();
        for (const ref of eggs) {
            const slot = this.slotAt(seat, ref);
            const key = `${ref?.h}:${ref?.i}`;
            if (!slot || slot.eggs - (taken.get(key) ?? 0) <= 0) return this.fail('卵が足りません');
            taken.set(key, (taken.get(key) ?? 0) + 1);
        }
        // ここから状態を変える
        p.hand.splice(p.hand.indexOf(birdId), 1);
        food.forEach(f => { p.food[f]--; });
        eggs.forEach(ref => { this.slotAt(seat, ref).eggs--; });
        row.push({ bird: birdId, eggs: 0, cache: {}, tucked: 0 });
        const ref = { h: habitat, i: row.length - 1 };
        this.log(`${p.name}が${bird.name}を${HABITAT_NAMES[habitat]}に出しました`);
        this.emit({ type: 'play', seat, bird: birdId, ref, food: [...food], eggs: eggs.length });
        this.decision = null;
        if (bird.power?.color === 'white') this.tasks.unshift({ k: 'power', seat, ref });
        return true;
    }

    // { type:'action', habitat, bonus? }。bonus は 森林 { card }・草原 { food }・湿地 { egg: 位置 }
    doAction(seat, { habitat, bonus }) {
        if (!HABITATS.includes(habitat)) return this.fail('生息地を選んでください');
        const p = this.players[seat];
        const info = this.actionInfo(seat, habitat);
        let amount = info.amount;
        if (bonus != null) {
            if (!info.bonus) return this.fail('この位置ではボーナスの交換はできません');
            if (typeof bonus !== 'object') return this.fail('ボーナスの交換が正しくありません');
            if (habitat === 'forest' && !p.hand.includes(bonus.card)) return this.fail('捨てるカードを選んでください');
            if (habitat === 'grassland' && !(FOODS.includes(bonus.food) && p.food[bonus.food] > 0)) return this.fail('捨てる餌を選んでください');
            if (habitat === 'grassland' && this.eggRoom(seat) <= amount) return this.fail('卵を産める場所が足りません');
            if (habitat === 'wetland' && !(this.slotAt(seat, bonus.egg)?.eggs > 0)) return this.fail('捨てる卵を選んでください');
            if (habitat === 'wetland' && this.cardsAvailable() + this.tray.length <= amount) return this.fail('引けるカードが足りません');
            amount++;
        }
        // ここから状態を変える
        if (bonus != null) {
            if (habitat === 'forest') {
                p.hand.splice(p.hand.indexOf(bonus.card), 1);
                this.discard.push(bonus.card);
            } else if (habitat === 'grassland') {
                p.food[bonus.food]--;
            } else {
                this.slotAt(seat, bonus.egg).eggs--;
            }
        }
        const verb = { forest: '餌を取ります', grassland: '卵を産みます', wetland: 'カードを引きます' }[habitat];
        this.log(`${p.name}が${HABITAT_NAMES[habitat]}で${verb}（${amount}）`);
        this.emit({ type: 'action', seat, habitat, amount, bonus: bonus != null });
        this.decision = null;
        const main = { forest: 'gainFood', grassland: 'layEggs', wetland: 'drawCards' }[habitat];
        const tasks = [{ k: main, seat, n: amount }];
        for (let i = p.board[habitat].length - 1; i >= 0; i--) {
            if (birdOf(p.board[habitat][i].bird).power?.color === 'brown') tasks.push({ k: 'power', seat, ref: { h: habitat, i } });
        }
        this.tasks.unshift(...tasks);
        return true;
    }

    // { type:'take', die, as }：餌箱のサイコロを1つ取る。虫か種の面は as でどちらかを選ぶ
    doTake(seat, { die, as }) {
        const d = this.decision;
        const face = this.feeder[die];
        if (!Number.isInteger(die) || !face) return this.fail('そのサイコロはありません');
        let food = face;
        if (face === 'invseed') {
            if (as !== 'inv' && as !== 'seed') return this.fail('虫か種を選んでください');
            food = as;
        }
        if (d.only && !d.only.includes(food)) return this.fail(`${d.only.map(f => FOOD_NAMES[f]).join('か')}を取ってください`);
        this.feeder.splice(die, 1);
        const ref = d.cacheOn;
        if (ref) {
            const slot = this.slotAt(seat, ref);
            slot.cache[food] = (slot.cache[food] ?? 0) + 1;
        } else {
            this.players[seat].food[food]++;
        }
        this.emit({ type: 'take', seat, food, cache: ref ?? null });
        this.decision = null;
        if (d.left > 1) this.tasks.unshift({ k: 'gainFood', seat, n: d.left - 1 });
        return true;
    }

    // 餌箱のサイコロがすべて同じ面なら、振り直せる
    doReroll(seat) {
        if (!this.feederAllSame()) return this.fail('サイコロがすべて同じ面のときだけ振り直せます');
        this.rollFeeder();
        this.log(`${this.players[seat].name}が餌箱を振り直しました`);
        this.emit({ type: 'reroll', seat, feeder: [...this.feeder] });
        // 振り直したあと、取れるものがなくなる（only の餌がない）こともある
        if (this.decision.only && !this.feederHas(this.decision.only)) {
            this.decision = null;
        }
        return true;
    }

    // { type:'lay', targets:[位置...] }：卵を1つずつ置く位置
    doLay(seat, { targets }) {
        const d = this.decision;
        if (!Array.isArray(targets) || targets.length !== d.n) return this.fail(`卵を${d.n}個置いてください`);
        const added = new Map();
        for (const ref of targets) {
            const slot = this.slotAt(seat, ref);
            if (!slot) return this.fail('鳥のいない場所です');
            if (d.only && !d.only.some(r => sameRef(r, ref))) return this.fail('その鳥には置けません');
            const key = `${ref.h}:${ref.i}`;
            const count = (added.get(key) ?? 0) + 1;
            if (slot.eggs + count > birdOf(slot.bird).eggs) return this.fail('卵の上限を超えます');
            added.set(key, count);
        }
        targets.forEach(ref => { this.slotAt(seat, ref).eggs++; });
        this.emit({ type: 'lay', seat, targets: targets.map(r => ({ h: r.h, i: r.i })) });
        this.decision = null;
        return true;
    }

    // { type:'draw', tray:[場の位置], deck: 山札から引く枚数 }
    doDraw(seat, { tray, deck }) {
        const d = this.decision;
        if (!Array.isArray(tray) || !Number.isInteger(deck) || deck < 0) return this.fail('引き方が正しくありません');
        if (new Set(tray).size !== tray.length || !tray.every(i => Number.isInteger(i) && i >= 0 && i < this.tray.length)) return this.fail('場のカードを選んでください');
        if (tray.length + deck !== d.n) return this.fail(`${d.n}枚引いてください`);
        if (deck > this.cardsAvailable()) return this.fail('山札が足りません');
        const p = this.players[seat];
        const fromTray = [...tray].sort((a, b) => b - a).map(i => this.tray.splice(i, 1)[0]);
        const fromDeck = this.drawFromDeck(deck);
        p.hand.push(...fromTray, ...fromDeck);
        this.emit({ type: 'draw', seat, tray: fromTray, deck: fromDeck.length });
        this.decision = null;
        return true;
    }

    // 能力の選択への答え
    doPower(seat, command) {
        const d = this.decision;
        if (d.kind === 'playExtra') return this.fail('出す鳥を選んでください');
        const p = this.players[seat];
        const slot = this.slotAt(seat, d.ref);
        const bird = birdOf(slot.bird);
        const { kind, arg } = bird.power;
        switch (kind) {
            case 'tuckDraw': case 'tuckFood': case 'tuckEgg': {
                if (!p.hand.includes(command.card)) return this.fail('差し込むカードを選んでください');
                if (kind === 'tuckFood' && arg === 'choice' && !FOODS.includes(command.get)) return this.fail('餌を選んでください');
                p.hand.splice(p.hand.indexOf(command.card), 1);
                slot.tucked++;
                let extra = '';
                if (kind === 'tuckDraw') {
                    const got = this.drawFromDeck(1);
                    p.hand.push(...got);
                    extra = got.length ? '、1枚引きました' : '';
                } else if (kind === 'tuckFood') {
                    p.food[arg]++;
                    extra = `、${FOOD_NAMES[arg]}を得ました`;
                } else if (slot.eggs < bird.eggs) {
                    slot.eggs++;
                    extra = '、卵を産みました';
                }
                this.log(`${bird.name}：カードを差し込み${extra}`);
                this.emit({ type: 'tuck', seat, ref: d.ref, kind });
                break;
            }
            case 'discardEggFood': case 'discardEggCards': {
                const from = this.slotAt(seat, command.target);
                if (!from || sameRef(command.target, d.ref) || from.eggs <= 0) return this.fail('卵を捨てるほかの鳥を選んでください');
                if (kind === 'discardEggFood') {
                    if (!Array.isArray(command.get) || command.get.length !== arg || !command.get.every(f => FOODS.includes(f))) return this.fail(`餌を${arg}つ選んでください`);
                }
                from.eggs--;
                if (kind === 'discardEggFood') {
                    command.get.forEach(f => { p.food[f]++; });
                    this.log(`${bird.name}：卵を捨てて、${command.get.map(f => FOOD_NAMES[f]).join('と')}を得ました`);
                } else {
                    p.hand.push(...this.drawFromDeck(arg));
                    this.log(`${bird.name}：卵を捨てて、${arg}枚引きました`);
                }
                this.emit({ type: 'discardEgg', seat, ref: d.ref, from: { h: command.target.h, i: command.target.i } });
                break;
            }
            case 'discardFoodTuck': {
                if (p.food[arg] <= 0) return this.fail(`${FOOD_NAMES[arg]}がありません`);
                p.food[arg]--;
                const cards = this.drawFromDeck(2);
                slot.tucked += cards.length;
                this.log(`${bird.name}：${FOOD_NAMES[arg]}を捨てて、カードを${cards.length}枚差し込みました`);
                this.emit({ type: 'tuck', seat, ref: d.ref, kind });
                break;
            }
            case 'tradeFood': {
                const { give, get } = command;
                if (!FOODS.includes(give) || p.food[give] <= 0) return this.fail('渡す餌を選んでください');
                if (!FOODS.includes(get) || get === give) return this.fail('ほかの種類の餌を選んでください');
                p.food[give]--;
                p.food[get]++;
                this.log(`${bird.name}：${FOOD_NAMES[give]}を${FOOD_NAMES[get]}に替えました`);
                this.emit({ type: 'trade', seat, ref: d.ref, give, get });
                break;
            }
            case 'layAny': {
                const target = this.slotAt(seat, command.target);
                if (!target || target.eggs >= birdOf(target.bird).eggs) return this.fail('卵を産める鳥を選んでください');
                target.eggs++;
                this.emit({ type: 'lay', seat, targets: [{ h: command.target.h, i: command.target.i }] });
                break;
            }
            default:
                return this.fail('今はその操作はできません');
        }
        this.decision = null;
        return true;
    }

    // 能力を使わない・追加の鳥を出さない
    doSkip() {
        this.decision = null;
        return true;
    }

    // { type:'bonus', id }：引いたボーナスカードから1枚残す
    doBonus(seat, { id }) {
        const d = this.decision;
        if (!d.options.includes(id)) return this.fail('ボーナスカードを選んでください');
        this.players[seat].bonus.push(id);
        this.bonusDiscard.push(...d.options.filter(o => o !== id));
        this.log(`${this.players[seat].name}がボーナスカードを1枚加えました`);
        this.emit({ type: 'bonus', seat });
        this.decision = null;
        return true;
    }

    // ---- 手順の列 ----

    run() {
        let guard = 0;
        while (this.phase === 'play' && !this.decision && guard++ < 1000) {
            const task = this.tasks.shift();
            if (!task) {
                this.endTurn();
                continue;
            }
            this.exec(task);
        }
    }

    exec(task) {
        const { seat } = task;
        const p = this.players[seat];
        switch (task.k) {
            case 'gainFood': {
                if (this.feeder.length === 0) this.rollFeeder(true);
                this.decision = { seat, kind: 'food', left: task.n };
                break;
            }
            case 'layEggs': {
                const n = Math.min(task.n, this.eggRoom(seat));
                if (n > 0) this.decision = { seat, kind: 'lay', n };
                else this.log(`${p.name}は卵を産める鳥がいません`);
                break;
            }
            case 'drawCards': {
                const n = Math.min(task.n, this.tray.length + this.cardsAvailable());
                if (n <= 0) break;
                if (this.tray.length === 0) {
                    p.hand.push(...this.drawFromDeck(n));
                    this.emit({ type: 'draw', seat, tray: [], deck: n });
                } else {
                    this.decision = { seat, kind: 'draw', n };
                }
                break;
            }
            case 'power':
                this.activate(seat, task.ref);
                break;
            default:
                break;
        }
    }

    feederHas(foods) {
        return this.feeder.some(face => foods.includes(face) || (face === 'invseed' && (foods.includes('inv') || foods.includes('seed'))));
    }

    // 能力を使う。選ぶことのない能力はそのまま行い、選ぶものがあれば選択待ちにする
    activate(seat, ref) {
        const p = this.players[seat];
        const slot = this.slotAt(seat, ref);
        if (!slot) return;
        const bird = birdOf(slot.bird);
        const { kind, arg } = bird.power;
        const ask = (extra = {}) => { this.decision = { seat, kind: 'power', ref, bird: bird.id, power: kind, ...extra }; };
        const note = (text) => { this.log(`${bird.name}：${text}`); this.emit({ type: 'power', seat, ref, kind, text }); };
        switch (kind) {
            case 'gainFeeder': case 'cacheFeeder': {
                // 欲しい餌がなく、サイコロがすべて同じ面なら振り直す
                if (!this.feederHas([arg]) && (this.feeder.length === 0 || this.feederAllSame())) this.rollFeeder(true);
                if (!this.feederHas([arg])) { note(`餌箱に${FOOD_NAMES[arg]}がありません`); break; }
                const die = this.feeder.indexOf(arg) >= 0 ? this.feeder.indexOf(arg) : this.feeder.indexOf('invseed');
                this.feeder.splice(die, 1);
                if (kind === 'cacheFeeder') slot.cache[arg] = (slot.cache[arg] ?? 0) + 1;
                else p.food[arg]++;
                note(kind === 'cacheFeeder' ? `${FOOD_NAMES[arg]}を取って貯えました` : `${FOOD_NAMES[arg]}を取りました`);
                this.emit({ type: 'take', seat, food: arg, cache: kind === 'cacheFeeder' ? ref : null });
                break;
            }
            case 'cacheSupply':
                slot.cache[arg] = (slot.cache[arg] ?? 0) + 1;
                note(`${FOOD_NAMES[arg]}を貯えました`);
                break;
            case 'hunt': {
                const count = FEEDER_DICE - this.feeder.length;
                if (count === 0) { note('振るサイコロがありません'); break; }
                const faces = Array.from({ length: count }, () => this.rollDie());
                const hit = faces.includes(arg);
                if (hit) slot.cache[arg] = (slot.cache[arg] ?? 0) + 1;
                this.emit({ type: 'hunt', seat, ref, faces, hit });
                note(`${faces.map(f => (f === 'invseed' ? '虫/種' : FOOD_NAMES[f])).join('・')}${hit ? `。${FOOD_NAMES[arg]}を貯えました` : '。外れました'}`);
                break;
            }
            case 'predator': {
                const [card] = this.drawFromDeck(1);
                if (!card) { note('山札がありません'); break; }
                const prey = birdOf(card);
                const hit = prey.wingspan < arg;
                if (hit) slot.tucked++;
                else this.discard.push(card);
                this.emit({ type: 'predator', seat, ref, card, hit });
                note(`${prey.name}（${prey.wingspan}cm）${hit ? 'を捕らえました' : 'は逃げました'}`);
                break;
            }
            case 'tuckDraw': case 'tuckFood': case 'tuckEgg':
                if (p.hand.length > 0) ask();
                break;
            case 'layThis':
                if (slot.eggs < bird.eggs) {
                    slot.eggs++;
                    this.emit({ type: 'lay', seat, targets: [ref] });
                    note('卵を産みました');
                }
                break;
            case 'layAny':
                if (this.eggRoom(seat) > 0) ask();
                break;
            case 'drawCard': {
                const got = this.drawFromDeck(1);
                p.hand.push(...got);
                if (got.length) note('1枚引きました');
                break;
            }
            case 'allFood':
                this.players.forEach(q => { q.food[arg]++; });
                note(`全員が${FOOD_NAMES[arg]}を得ました`);
                break;
            case 'allDraw':
                this.players.forEach(q => { q.hand.push(...this.drawFromDeck(1)); });
                note('全員が1枚引きました');
                break;
            case 'fewestDraw': {
                const least = Math.min(...this.players.map(q => q.board[arg].length));
                const who = this.players.filter(q => q.board[arg].length === least);
                who.forEach(q => { q.hand.push(...this.drawFromDeck(1)); });
                note(`${who.map(q => q.name).join('・')}が1枚引きました`);
                break;
            }
            case 'discardEggFood': case 'discardEggCards': {
                const others = boardBirds(p).some(({ slot: s }) => s !== slot && s.eggs > 0);
                if (others && (kind === 'discardEggFood' || this.cardsAvailable() > 0)) ask();
                break;
            }
            case 'discardFoodTuck':
                if (p.food[arg] > 0 && this.cardsAvailable() > 0) ask();
                break;
            case 'tradeFood':
                if (FOODS.some(f => p.food[f] > 0)) ask();
                break;
            // ---- 白：出したときに1回 ----
            case 'gainSupply':
                p.food[arg] += 3;
                note(`${FOOD_NAMES[arg]}を3つ得ました`);
                break;
            case 'gainAllFeeder': {
                const got = this.feeder.filter(face => face === arg).length;
                this.feeder = this.feeder.filter(face => face !== arg);
                p.food[arg] += got;
                note(got ? `餌箱の${FOOD_NAMES[arg]}を${got}つ取りました` : `餌箱に${FOOD_NAMES[arg]}がありません`);
                break;
            }
            case 'laySameNest': {
                const targets = [];
                HABITATS.forEach(h => p.board[h].forEach((s, i) => {
                    const b = birdOf(s.bird);
                    if ((b.nest === arg || b.nest === 'star') && s.eggs < b.eggs) {
                        s.eggs++;
                        targets.push({ h, i });
                    }
                }));
                this.emit({ type: 'lay', seat, targets });
                note(`卵を${targets.length}個産みました`);
                break;
            }
            case 'drawCards': {
                const got = this.drawFromDeck(arg);
                p.hand.push(...got);
                note(`${got.length}枚引きました`);
                break;
            }
            case 'bonusDraw': {
                if (this.bonusDeck.length < arg) {
                    this.bonusDeck.push(...this.shuffle(this.bonusDiscard.splice(0)));
                }
                const options = this.bonusDeck.splice(0, arg);
                if (options.length) this.decision = { seat, kind: 'bonus', options, ref, bird: bird.id };
                break;
            }
            case 'playAnother': {
                const can = p.hand.some(id => this.canPlayBird(seat, id, arg));
                if (can) this.decision = { seat, kind: 'playExtra', habitat: arg, ref, bird: bird.id };
                break;
            }
            default:
                break;
        }
    }

    // ---- 進行 ----

    endTurn() {
        this.refillTray();
        this.players[this.turn].actions++;
        this.turnNo++;
        const limit = this.turnsThisRound();
        if (this.players.every(p => p.actions >= limit)) {
            this.endRound();
            return;
        }
        this.turn = (this.turn + 1) % this.n;
        this.startTurn();
    }

    endRound() {
        const round = this.round;
        const goal = goalOf(this.goals[round - 1]);
        const values = this.players.map(p => goal.measure(p));
        const points = rankGoal(values, round);
        this.players.forEach((p, i) => { p.goalPoints[round - 1] = points[i]; });
        this.goalResults[round - 1] = this.players.map((p, i) => ({ seat: i, value: values[i], points: points[i] }));
        this.log(`第${round}ラウンド終了。目標「${goal.name}」：${this.players.map((p, i) => `${p.name} ${points[i]}点`).join('・')}`);
        this.emit({ type: 'roundEnd', round, goal: goal.id, values, points });
        if (round >= ROUNDS) {
            this.endGame();
            return;
        }
        // 場の3枚を入れ替える
        this.discard.push(...this.tray.splice(0));
        this.refillTray();
        this.round++;
        this.players.forEach(p => { p.actions = 0; });
        this.firstPlayer = (this.firstPlayer + 1) % this.n;
        this.turn = this.firstPlayer;
        this.log(`第${this.round}ラウンド。${this.players[this.turn].name}から始めます`);
        this.emit({ type: 'round', round: this.round });
        this.startTurn();
    }

    results() {
        return this.players.map(p => ({ seat: p.id, ...scoreOf(p), food: FOODS.reduce((s, f) => s + p.food[f], 0) }));
    }

    endGame() {
        this.phase = 'end';
        this.decision = null;
        this.tasks = [];
        const results = this.results();
        const best = Math.max(...results.map(r => r.total));
        const top = results.filter(r => r.total === best);
        const mostFood = Math.max(...top.map(r => r.food));
        this.winners = top.filter(r => r.food === mostFood).map(r => r.seat);
        this.emit({ type: 'end', winners: [...this.winners], results });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
    }

    // ---- 道具 ----

    rollFeeder(quiet = false) {
        this.feeder = Array.from({ length: FEEDER_DICE }, () => this.rollDie());
        if (quiet) this.emit({ type: 'reroll', seat: null, feeder: [...this.feeder] });
    }

    // 山札から引く。なくなったら捨て札を切って山札にする
    drawFromDeck(k) {
        const out = [];
        for (let i = 0; i < k; i++) {
            if (this.deck.length === 0) {
                if (this.discard.length === 0) break;
                this.deck = this.shuffle(this.discard.splice(0));
            }
            out.push(this.deck.pop());
        }
        return out;
    }

    refillTray() {
        while (this.tray.length < 3) {
            const [card] = this.drawFromDeck(1);
            if (!card) break;
            this.tray.push(card);
        }
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

    // 試すための写し（記録・ログは持たない）。CPU の先読みに使う
    clone() {
        const copy = Object.create(Game.prototype);
        for (const [key, value] of Object.entries(this)) {
            if (key === 'commands' || key === 'logs' || key === 'events') copy[key] = [];
            else copy[key] = typeof value === 'object' && value !== null ? structuredClone(value) : value;
        }
        return copy;
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
        commands.forEach(({ seat, command }, index) => {
            if (!game.applyCommand(seat, command)) {
                throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
            }
        });
        return game;
    }
}
