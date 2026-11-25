/**
 * イスタンブール（Istanbul、基本セット）のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（並び・山札・サイコロはシードから決まる）
 *
 * 手番の流れ（stage）
 * - move：商人を1〜2マス動かす（カードで3〜4マス、または動かない）。行き先に自分の助手がいれば束に戻し、
 *   いなければ束の下から1人置く。置けなければ番が終わる（噴水だけは助手がいなくても行動できる）
 * - pay：行き先にほかの商人がいれば、1人に2リラずつ払う。払わなければ番が終わる（噴水では払わない）
 * - action：場所の行動をする（しなくてもよい）。茶屋・闇市はサイコロ（dice）、隊商宿はカードを引いて捨てる（caravan）
 * - after：宮殿・郵便局・宝石商で「もう1回」のカードを使えるときだけ止まる
 * - encounter：ほかの人の家族・総督・密輸人に会う
 * ボーナスカードは、自分の番ならいつでも使える（移動のカードと小市場のカードは、その操作の中で使う）
 *
 * ルールブックにないので、次のように決めた
 * - 行き先に自分の助手がいないとき、助手は必ず置く（置かずに番を終える選択は省いた）
 * - 出会いの順は、家族 → 総督 → 密輸人に固定する
 * - 「3〜4マス動く」は、縦横に数えた距離が3か4の場所へ動ける
 * - 「居残り」のカードは、今の場所に助手をもう1人置いて、もう一度行動する
 * - 宮殿の「好きな品物」のマスは、指定がなければ多く持っている品物から払う
 */

import { shuffle } from './random.js';
import {
    GOODS, GOOD_NAMES, PLACES, FOUNTAIN, POLICE, LAYOUTS, CENTER_CELLS, POST_OFFICE,
    SMALL_DEMANDS, LARGE_DEMANDS, SMALL_PAY, LARGE_PAY, SULTAN_TRACK, sultanStart, SULTAN_MAX,
    gemStart, GEM_MAX, BASE_CAPACITY, MAX_EXTENSIONS, EXTENSION_COST, MOSQUE_OF, MOSQUE_TILES, mosqueStack,
    BONUS_CARDS, RUBY_TARGET, MIN_PLAYERS, MAX_PLAYERS
} from './data.js';

export { MIN_PLAYERS, MAX_PLAYERS };
const MAX_LOGS = 300;
const MAX_EVENTS = 100;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    move: ['to', 'card'],
    pay: ['accept'],
    act: ['extra', 'places', 'bet', 'sell', 'card', 'to', 'any', 'tile'],
    skip: [],
    draw: ['from'],
    discard: ['index'],
    dice: ['mode', 'die'],
    good: ['good'],
    catch: ['reward'],
    governor: ['use', 'pay', 'index'],
    smuggler: ['use', 'good', 'pay'],
    bonus: ['card', 'good', 'from', 'reward'],
    yellow: ['from'],
    end: []
};

// 自分の番のどの段階でも使える操作（行動の途中、隊商宿で引く・サイコロ・闇市の品物選びの間は使えない）
const ANY_STAGE = ['bonus', 'yellow'];
const FREE_STAGES = ['move', 'pay', 'action', 'after', 'encounter'];
const STAGE_OF = {
    move: 'move', pay: 'pay', act: 'action', skip: 'action', draw: 'caravan', discard: 'caravanDiscard',
    dice: 'dice', good: 'blackGood', catch: 'encounter', governor: 'encounter', smuggler: 'encounter', end: 'after'
};

// 状態として写す項目（CPU の先読みで使う）
const STATE_KEYS = ['options', 'rngState', 'layout', 'players', 'startSeat', 'deck', 'discard', 'demand', 'post',
    'gemPrice', 'sultanCount', 'mosqueTiles', 'mosqueRubies', 'governor', 'smuggler', 'neutrals', 'turn', 'round',
    'step', 'phase', 'endTriggered', 'winners', 'finalResults', 'eventSeq'];

// ---- 盤面の道具（ビューからも使う） ----

export function cellOf(layout, place) {
    return layout.indexOf(place);
}

// 縦横に数えた距離
export function distance(layout, a, b) {
    const i = layout.indexOf(a);
    const j = layout.indexOf(b);
    return Math.abs((i >> 2) - (j >> 2)) + Math.abs((i & 3) - (j & 3));
}

export const capacityOf = (player) => BASE_CAPACITY + player.ext;
export const goodsTotal = (player) => GOODS.reduce((sum, g) => sum + player.goods[g], 0);
export const ownsCard = (player, card) => Array.isArray(player.cards) && player.cards.includes(card);

// 宮殿で次のルビーに要る品物（{ red, green, yellow, blue, any }）。売り切れなら null
export function sultanNeed(count) {
    if (count > SULTAN_MAX) return null;
    const need = { red: 0, green: 0, yellow: 0, blue: 0, any: 0 };
    SULTAN_TRACK.slice(0, count).forEach(g => { need[g]++; });
    return need;
}

// 宮殿の「好きな品物」のマスに払う品物を決める（多く残る品物から）
export function autoSultanAny(goods, need) {
    const left = { ...goods };
    GOODS.forEach(g => { left[g] -= need[g]; });
    const picks = [];
    for (let i = 0; i < need.any; i++) {
        const best = [...GOODS].sort((a, b) => left[b] - left[a] || GOODS.indexOf(a) - GOODS.indexOf(b))[0];
        if (left[best] <= 0) return null;
        left[best]--;
        picks.push(best);
    }
    return picks;
}

// 郵便局で今もらえるもの
export function postRewards(post) {
    return POST_OFFICE.map((column, i) => (i < post ? column.top : column.bottom));
}

export const demandOf = (place, index) => (place === 10 ? LARGE_DEMANDS : SMALL_DEMANDS)[index];
export const marketPay = (place, count) => (place === 10 ? LARGE_PAY : SMALL_PAY)[count] ?? 0;

// 闇市のサイコロの合計ごとの宝石の数
export const blackMarketJewels = (sum) => (sum >= 11 ? 3 : sum >= 9 ? 2 : sum >= 7 ? 1 : 0);

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isPlace = (value) => isInt(value, 1, 16);

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, layout: 'short' | 'order' | 'random' }
    constructor(players, options = {}) {
        if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
            throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        }
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const layoutKey = ['short', 'order', 'random'].includes(options.layout) ? options.layout : 'short';
        this.options = { seed, layout: layoutKey };
        this.rngState = seed;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.quiet = false;
        const n = players.length;
        this.layout = layoutKey === 'random' ? this.randomLayout() : [...LAYOUTS[layoutKey]];
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            lira: 0, goods: { red: 0, green: 0, yellow: 0, blue: 0 }, ext: 0, rubies: 0, tiles: [], cards: [],
            merchant: FOUNTAIN, stack: 4, assistants: [], family: POLICE
        }));
        this.startSeat = Math.floor(this.rand() * n);
        for (let i = 0; i < n; i++) this.players[(this.startSeat + i) % n].lira = 2 + i;
        this.deck = shuffle(Object.entries(BONUS_CARDS).flatMap(([key, card]) => Array(card.count).fill(key)), () => this.rand());
        this.discard = [];
        this.demand = {
            small: shuffle([0, 1, 2, 3, 4], () => this.rand()),
            large: shuffle([0, 1, 2, 3, 4], () => this.rand())
        };
        this.post = 0;
        this.gemPrice = gemStart(n);
        this.sultanCount = sultanStart(n);
        this.mosqueTiles = Object.fromEntries(GOODS.map(g => [g, mosqueStack(n)]));
        this.mosqueRubies = { 14: n === 5 ? 4 : n, 15: n === 5 ? 4 : n };
        this.governor = this.rollPlace();
        this.smuggler = this.rollPlace();
        this.neutrals = n === 2 ? [14, 15, 16] : [];
        for (let i = 0; i < n; i++) this.drawCard(this.players[(this.startSeat + i) % n]);
        this.phase = 'play';
        this.endTriggered = false;
        this.winners = [];
        this.finalResults = null;
        this.round = 1;
        this.log(`${this.players[this.startSeat].name}から始めます`);
        this.startTurn(this.startSeat);
    }

    // ---- 乱数（状態に数で持つので、写して先読みできる） ----

    rand() {
        this.rngState = (this.rngState + 0x6D2B79F5) >>> 0;
        let t = this.rngState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    rollDie() {
        return 1 + Math.floor(this.rand() * 6);
    }

    rollPlace() {
        return this.rollDie() + this.rollDie();
    }

    randomLayout() {
        for (;;) {
            const layout = shuffle(Array.from({ length: 16 }, (_, i) => i + 1), () => this.rand());
            if (CENTER_CELLS.includes(layout.indexOf(FOUNTAIN)) && distance(layout, 8, 9) >= 3) return layout;
        }
    }

    // ---- 問い合わせ ----

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'play' ? [this.turn] : [];
    }

    current() {
        return this.players[this.turn];
    }

    rubyTarget() {
        return RUBY_TARGET(this.players.length);
    }

    cardsLeft() {
        return this.deck.length + this.discard.length;
    }

    // 行き先にいるほかの商人（中立を含む）の数
    othersAt(seat, place) {
        if (place === FOUNTAIN) return 0;
        return this.players.filter(q => q.id !== seat && q.merchant === place).length
            + this.neutrals.filter(x => x === place).length;
    }

    // その場所で今、行動できるか（できないときは飛ばす）。手元のカードで足りるようになるかもしれないときは、できるとみなす
    canAct(p, place, via = 'merchant') {
        const helped = ownsCard(p, 'lira5') || ownsCard(p, 'good');
        const cap = capacityOf(p);
        switch (place) {
            case 1: return p.ext < MAX_EXTENSIONS && (p.lira >= EXTENSION_COST || helped);
            case 2: case 3: case 4: {
                const good = PLACES[place].good;
                return p.goods[good] < cap || (p.tiles.includes('green') && GOODS.some(g => p.goods[g] < cap));
            }
            case 7: return p.assistants.length > 0;
            case 10: case 11: {
                const demand = demandOf(place, this.demand[place === 10 ? 'large' : 'small'][0]);
                const any = place === 11 && ownsCard(p, 'market');
                return GOODS.some(g => p.goods[g] > 0 && (any || demand[g] > 0)) || helped;
            }
            case 12: return via === 'merchant' && p.family === POLICE;
            case 13: {
                const need = sultanNeed(this.sultanCount);
                if (!need) return false;
                return helped || (GOODS.every(g => p.goods[g] >= need[g]) && autoSultanAny(p.goods, need) !== null);
            }
            case 14: case 15:
                return MOSQUE_TILES[place].some(c => !p.tiles.includes(c) && this.mosqueTiles[c].length > 0
                    && (p.goods[c] >= this.mosqueTiles[c][0] || helped));
            case 16: return this.gemPrice <= GEM_MAX && (p.lira >= this.gemPrice || helped);
            default: return true;
        }
    }

    // 「もう1回」のカードを、今使えるか
    canDouble(p, card) {
        const step = this.step;
        if (!step || !step.acted || step.via !== 'merchant' || !ownsCard(p, card)) return false;
        if (card === 'sultan2') {
            const need = sultanNeed(this.sultanCount);
            return step.actPlace === 13 && !!need && GOODS.every(g => p.goods[g] >= need[g]) && autoSultanAny(p.goods, need) !== null;
        }
        if (card === 'post2') return step.actPlace === 5;
        if (card === 'gem2') return step.actPlace === 16 && this.gemPrice <= GEM_MAX && p.lira >= this.gemPrice;
        return false;
    }

    // ---- 操作の入口 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const type = command.type;
        if (typeof type !== 'string' || !Object.hasOwn(COMMAND_FIELDS, type)) return this.fail('今はその操作はできません');
        if (playerId !== this.turn) return this.fail('あなたの番ではありません');
        if (ANY_STAGE.includes(type) ? !FREE_STAGES.includes(this.step.stage) : this.step.stage !== STAGE_OF[type]) {
            return this.fail('今はその操作はできません');
        }
        const handler = this[`do_${type}`];
        if (!handler.call(this, this.players[playerId], command)) return false;
        const recorded = { type };
        COMMAND_FIELDS[type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 移動 ----

    startTurn(seat) {
        this.turn = seat;
        this.step = { stage: 'move', yellowUsed: false, acted: false };
        this.emit({ type: 'turn', seat });
    }

    do_move(p, { to, card }) {
        if (!isPlace(to)) return this.fail('行き先が正しくありません');
        const d = distance(this.layout, p.merchant, to);
        if (card === undefined || card === null) {
            if (d < 1 || d > 2) return this.fail('1〜2マス先の場所を選んでください');
        } else if (card === 'move34') {
            if (!ownsCard(p, card)) return this.fail('そのカードを持っていません');
            if (d < 3 || d > 4) return this.fail('3〜4マス先の場所を選んでください');
        } else if (card === 'stay') {
            if (!ownsCard(p, card)) return this.fail('そのカードを持っていません');
            if (to !== p.merchant) return this.fail('居残りは、今の場所に留まります');
            if (p.stack < 1) return this.fail('置ける助手がいません');
        } else {
            return this.fail('そのカードは移動には使えません');
        }
        if (card) this.useCard(p, card);
        const from = p.merchant;
        p.merchant = to;
        this.emit({ type: 'move', seat: p.id, from, to });
        this.step.place = to;
        // 助手
        if (card === 'stay') {
            p.stack--;
            p.assistants.push(to);
            this.log(`${p.name}は${PLACES[to].name}に留まりました`);
        } else {
            const index = p.assistants.indexOf(to);
            if (index >= 0) {
                p.assistants.splice(index, 1);
                p.stack++;
                this.log(`${p.name}が${PLACES[to].name}へ（助手を連れ戻す）`);
            } else if (to === FOUNTAIN) {
                this.log(`${p.name}が${PLACES[to].name}へ`);
            } else if (p.stack > 0) {
                p.stack--;
                p.assistants.push(to);
                this.log(`${p.name}が${PLACES[to].name}へ（助手を置く）`);
            } else {
                this.log(`${p.name}が${PLACES[to].name}へ。連れている助手がいないので、行動できません`);
                this.endTurn();
                return true;
            }
        }
        // ほかの商人への支払い
        const cost = this.othersAt(p.id, to) * 2;
        if (cost > 0) {
            if (p.lira < cost && !ownsCard(p, 'lira5')) {
                this.log(`${p.name}はほかの商人に${cost}リラを払えないので、番が終わります`);
                this.endTurn();
                return true;
            }
            this.step.stage = 'pay';
            this.step.payCost = cost;
            return true;
        }
        this.enterAction(to, 'merchant');
        return true;
    }

    do_pay(p, { accept }) {
        const cost = this.step.payCost;
        if (typeof accept !== 'boolean') return this.fail('払うかどうかを選んでください');
        if (!accept) {
            this.log(`${p.name}は支払わずに番を終えました`);
            this.endTurn();
            return true;
        }
        if (p.lira < cost) return this.fail(`${cost}リラ足りません`);
        const place = p.merchant;
        p.lira -= cost;
        this.players.forEach(q => {
            if (q.id !== p.id && q.merchant === place) q.lira += 2;
        });
        this.log(`${p.name}がほかの商人に${cost}リラを払いました`);
        this.neutrals.forEach((x, i) => {
            if (x === place) {
                this.neutrals[i] = this.rollPlace();
                this.emit({ type: 'neutral', index: i, from: place, to: this.neutrals[i] });
            }
        });
        this.enterAction(place, 'merchant');
        return true;
    }

    // ---- 行動 ----

    enterAction(place, via) {
        const p = this.current();
        this.step.stage = 'action';
        this.step.actPlace = place;
        this.step.via = via;
        if (!this.canAct(p, place, via)) {
            this.log(`${PLACES[place].name}では今は行動できません`);
            this.beginEncounters();
        }
    }

    do_skip(p) {
        this.log(`${p.name}は行動しませんでした`);
        this.beginEncounters();
        return true;
    }

    do_act(p, params) {
        const place = this.step.actPlace;
        const fn = this[`act${place}`] ?? this.actWarehouse;
        return fn.call(this, p, params, place);
    }

    // 手押し車工房：7リラで拡張。3つ目でルビー
    act1(p) {
        if (p.ext >= MAX_EXTENSIONS) return this.fail('手押し車はもう広げられません');
        if (p.lira < EXTENSION_COST) return this.fail(`${EXTENSION_COST}リラ要ります`);
        p.lira -= EXTENSION_COST;
        p.ext++;
        this.log(`${p.name}が手押し車を広げました（品物ごとに${capacityOf(p)}つまで）`);
        if (p.ext === MAX_EXTENSIONS) this.gainRuby(p, 1);
        this.afterAction();
        return true;
    }

    // 倉庫：その品物をいっぱいまで。緑のタイルがあれば2リラで好きな品物を1つ足せる
    actWarehouse(p, { extra }, place) {
        const good = PLACES[place].good;
        const cap = capacityOf(p);
        if (extra !== undefined && extra !== null) {
            if (!p.tiles.includes('green')) return this.fail('緑のタイルがありません');
            if (!GOODS.includes(extra)) return this.fail('品物が正しくありません');
            if (p.lira < 2) return this.fail('2リラ要ります');
            if (extra === good || p.goods[extra] >= cap) return this.fail('その品物はもう積めません');
        }
        const gained = cap - p.goods[good];
        p.goods[good] = cap;
        this.log(`${p.name}が${GOOD_NAMES[good]}を${gained}つ積みました`);
        if (extra) {
            p.lira -= 2;
            p.goods[extra]++;
            this.log(`${p.name}が2リラで${GOOD_NAMES[extra]}を1つ足しました`);
        }
        this.afterAction();
        return true;
    }

    // 郵便局：見えている4マスをもらい、印を1つ下ろす
    act5(p) {
        const got = [];
        let lira = 0;
        postRewards(this.post).forEach(reward => {
            if (reward.lira) lira += reward.lira;
            else if (this.addGood(p, reward.good)) got.push(GOOD_NAMES[reward.good]);
        });
        p.lira += lira;
        this.post = this.post === 4 ? 0 : this.post + 1;
        this.log(`${p.name}が郵便局で${[`${lira}リラ`, ...got].join('・')}を受け取りました`);
        this.afterAction();
        return true;
    }

    // 隊商宿：カードを2枚引き（捨て札の上からも引ける）、1枚捨てる
    act6(p) {
        this.step.draws = 2;
        this.step.stage = 'caravan';
        if (this.cardsLeft() === 0) this.toCaravanDiscard(p);
        return true;
    }

    do_draw(p, { from }) {
        if (from === 'discard') {
            if (this.discard.length === 0) return this.fail('捨て札がありません');
            p.cards.push(this.discard.pop());
            this.log(`${p.name}が捨て札からカードを取りました`);
        } else if (from === 'deck') {
            if (this.cardsLeft() === 0) return this.fail('山札がありません');
            this.drawCard(p);
            this.log(`${p.name}が山札からカードを引きました`);
        } else {
            return this.fail('引く場所が正しくありません');
        }
        this.step.draws--;
        if (this.step.draws <= 0 || this.cardsLeft() === 0) this.toCaravanDiscard(p);
        return true;
    }

    toCaravanDiscard(p) {
        if (p.cards.length === 0) return this.afterAction();
        this.step.stage = 'caravanDiscard';
    }

    do_discard(p, { index }) {
        if (!isInt(index, 0, p.cards.length - 1)) return this.fail('捨てるカードを選んでください');
        const [card] = p.cards.splice(index, 1);
        this.discard.push(card);
        this.log(`${p.name}が「${BONUS_CARDS[card].name}」を捨てました`);
        this.afterAction();
        return true;
    }

    // 噴水：置いてある助手を好きなだけ戻す（指定がなければ全員）
    act7(p, { places }) {
        const list = places === undefined || places === null ? [...p.assistants] : places;
        if (!Array.isArray(list) || list.length > p.assistants.length) return this.fail('戻す助手が正しくありません');
        const left = [...p.assistants];
        for (const place of list) {
            const index = left.indexOf(place);
            if (index < 0) return this.fail('そこに助手はいません');
            left.splice(index, 1);
        }
        p.assistants = left;
        p.stack += list.length;
        this.log(`${p.name}が助手を${list.length}人呼び戻しました`);
        this.afterAction();
        return true;
    }

    // 闇市：サイコロで宝石、そのあと布・香辛料・果物から1つ
    act8(p) {
        this.rollFor(p, 'black');
        return true;
    }

    // 茶屋：3〜12に賭けて振る。出目が賭けた数以上なら、その数のリラ。届かなければ2リラ
    act9(p, { bet }) {
        if (!isInt(bet, 3, 12)) return this.fail('3〜12の数を選んでください');
        this.step.bet = bet;
        this.rollFor(p, 'tea');
        return true;
    }

    rollFor(p, kind) {
        this.step.dice = [this.rollDie(), this.rollDie()];
        this.step.diceFor = kind;
        this.step.diceAdjusted = false;
        this.emit({ type: 'dice', seat: p.id, dice: [...this.step.dice], kind });
        if (p.tiles.includes('red')) this.step.stage = 'dice';
        else this.resolveDice(p);
    }

    // 赤のタイル：1つを4にするか、2つとも振り直す（1回）
    do_dice(p, { mode, die }) {
        if (mode === 'four') {
            if (die !== 0 && die !== 1) return this.fail('どちらのサイコロかを選んでください');
            this.step.dice[die] = 4;
            this.step.diceAdjusted = true;
            this.log(`${p.name}がサイコロを1つ4にしました`);
        } else if (mode === 'reroll') {
            this.step.dice = [this.rollDie(), this.rollDie()];
            this.step.diceAdjusted = true;
            this.emit({ type: 'dice', seat: p.id, dice: [...this.step.dice], kind: this.step.diceFor, reroll: true });
            this.log(`${p.name}がサイコロを振り直しました`);
        } else if (mode !== 'keep') {
            return this.fail('選び方が正しくありません');
        }
        this.resolveDice(p);
        return true;
    }

    resolveDice(p) {
        const sum = this.step.dice[0] + this.step.dice[1];
        if (this.step.diceFor === 'tea') {
            const bet = this.step.bet;
            const won = sum >= bet ? bet : 2;
            p.lira += won;
            this.log(`${p.name}が茶屋で${bet}に賭け、${sum}が出て${won}リラ`);
            this.afterAction();
            return;
        }
        const jewels = blackMarketJewels(sum);
        let got = 0;
        for (let i = 0; i < jewels; i++) if (this.addGood(p, 'blue')) got++;
        this.log(`${p.name}が闇市で${sum}を出し、宝石を${got}つ`);
        const cap = capacityOf(p);
        if (['red', 'green', 'yellow'].some(g => p.goods[g] < cap)) this.step.stage = 'blackGood';
        else this.afterAction();
    }

    do_good(p, { good }) {
        if (!['red', 'green', 'yellow'].includes(good)) return this.fail('布・香辛料・果物から選んでください');
        if (p.goods[good] >= capacityOf(p)) return this.fail('その品物はもう積めません');
        p.goods[good]++;
        this.log(`${p.name}が闇市で${GOOD_NAMES[good]}を1つ`);
        this.afterAction();
        return true;
    }

    // 市場：需要タイルの品物を1〜5個売る
    act10(p, params, place = 10) {
        const { sell, card } = params;
        const key = place === 10 ? 'large' : 'small';
        const demand = demandOf(place, this.demand[key][0]);
        const anyGoods = card === 'market';
        if (card !== undefined && card !== null && !anyGoods) return this.fail('そのカードはここでは使えません');
        if (anyGoods && (place !== 11 || !ownsCard(p, 'market'))) return this.fail('そのカードは小市場で使います');
        if (!sell || typeof sell !== 'object') return this.fail('売る品物を選んでください');
        let total = 0;
        for (const g of GOODS) {
            const n = sell[g] ?? 0;
            if (!isInt(n, 0, 5) || n > p.goods[g]) return this.fail('売る数が正しくありません');
            if (!anyGoods && n > demand[g]) return this.fail(`${GOOD_NAMES[g]}は${demand[g]}つまでです`);
            total += n;
        }
        if (total < 1 || total > 5) return this.fail('1〜5個を選んでください');
        if (anyGoods) this.useCard(p, 'market');
        GOODS.forEach(g => { p.goods[g] -= sell[g] ?? 0; });
        const pay = marketPay(place, total);
        p.lira += pay;
        this.demand[key].push(this.demand[key].shift());
        this.log(`${p.name}が${PLACES[place].name}で${total}個を売り、${pay}リラ`);
        this.afterAction();
        return true;
    }

    act11(p, params) {
        return this.act10(p, params, 11);
    }

    // 警察署：家族を好きな場所へ送り、その場所の行動をする（出会いはない）
    act12(p, { to }) {
        if (p.family !== POLICE) return this.fail('家族が警察署にいません');
        if (!isPlace(to) || to === POLICE) return this.fail('送る場所を選んでください');
        p.family = to;
        this.emit({ type: 'family', seat: p.id, from: POLICE, to });
        this.log(`${p.name}が家族を${PLACES[to].name}へ送りました`);
        this.enterAction(to, 'family');
        return true;
    }

    // スルタンの宮殿：覆われていないマスの品物を全部渡して、ルビー
    act13(p, { any }) {
        const need = sultanNeed(this.sultanCount);
        if (!need) return this.fail('宮殿のルビーはもうありません');
        const picks = this.sultanPicks(p, need, any);
        if (!picks) return this.fail('品物が足りません');
        this.paySultan(p, need, picks);
        this.afterAction();
        return true;
    }

    sultanPicks(p, need, any) {
        if (GOODS.some(g => p.goods[g] < need[g])) return null;
        if (any === undefined || any === null) return autoSultanAny(p.goods, need);
        if (!Array.isArray(any) || any.length !== need.any || any.some(g => !GOODS.includes(g))) return null;
        const use = { ...need };
        any.forEach(g => { use[g]++; });
        return GOODS.every(g => p.goods[g] >= use[g]) ? any : null;
    }

    paySultan(p, need, picks) {
        GOODS.forEach(g => { p.goods[g] -= need[g]; });
        picks.forEach(g => { p.goods[g]--; });
        this.log(`${p.name}がスルタンに品物を${GOODS.reduce((s, g) => s + need[g], 0) + picks.length}つ納めました`);
        this.sultanCount++;
        this.gainRuby(p, 13);
    }

    // モスク：品物がそろっていればタイルを取り、1つ払う
    act14(p, { tile }, place = 14) {
        if (!MOSQUE_TILES[place].includes(tile)) return this.fail('タイルを選んでください');
        if (p.tiles.includes(tile)) return this.fail('そのタイルはもう持っています');
        const stack = this.mosqueTiles[tile];
        if (stack.length === 0) return this.fail('そのタイルはもうありません');
        if (p.goods[tile] < stack[0]) return this.fail(`${GOOD_NAMES[tile]}が${stack[0]}つ要ります`);
        const need = stack.shift();
        p.goods[tile]--;
        p.tiles.push(tile);
        this.log(`${p.name}が${PLACES[place].name}のタイル（${GOOD_NAMES[tile]}${need}）を取りました`);
        if (tile === 'blue') {
            p.stack++;
            this.log(`${p.name}に5人目の助手が加わりました`);
        }
        if (MOSQUE_TILES[place].every(c => p.tiles.includes(c)) && this.mosqueRubies[place] > 0) {
            this.mosqueRubies[place]--;
            this.gainRuby(p, place);
        }
        this.afterAction();
        return true;
    }

    act15(p, params) {
        return this.act14(p, params, 15);
    }

    // 宝石商：今の値段を払ってルビー
    act16(p) {
        if (this.gemPrice > GEM_MAX) return this.fail('宝石商のルビーはもうありません');
        if (p.lira < this.gemPrice) return this.fail(`${this.gemPrice}リラ要ります`);
        this.buyGem(p);
        this.afterAction();
        return true;
    }

    buyGem(p) {
        p.lira -= this.gemPrice;
        this.log(`${p.name}が${this.gemPrice}リラでルビーを買いました`);
        this.gemPrice++;
        this.gainRuby(p, 16);
    }

    afterAction() {
        const p = this.current();
        this.step.acted = true;
        if (['sultan2', 'post2', 'gem2'].some(card => this.canDouble(p, card))) this.step.stage = 'after';
        else this.beginEncounters();
    }

    do_end() {
        this.beginEncounters();
        return true;
    }

    // ---- 出会い ----

    beginEncounters() {
        const p = this.current();
        const place = p.merchant;
        const list = [];
        if (place !== POLICE) {
            this.players.forEach(q => {
                if (q.id !== p.id && q.family === place) list.push({ kind: 'family', seat: q.id });
            });
        }
        if (this.governor === place) list.push({ kind: 'governor' });
        if (this.smuggler === place) list.push({ kind: 'smuggler' });
        if (list.length === 0) return this.endTurn();
        this.step.stage = 'encounter';
        this.step.encounters = list;
    }

    nextEncounter() {
        this.step.encounters.shift();
        if (this.step.encounters.length === 0) this.endTurn();
    }

    // ほかの人の家族を警察署へ送り、3リラかカード1枚
    do_catch(p, { reward }) {
        const encounter = this.step.encounters[0];
        if (encounter?.kind !== 'family') return this.fail('今はその操作はできません');
        if (reward !== 'lira' && reward !== 'card') return this.fail('ごほうびを選んでください');
        if (reward === 'card' && this.cardsLeft() === 0) return this.fail('カードがありません');
        const q = this.players[encounter.seat];
        q.family = POLICE;
        this.emit({ type: 'family', seat: q.id, from: p.merchant, to: POLICE });
        this.takeReward(p, reward);
        this.log(`${p.name}が${q.name}の家族を警察署へ送りました`);
        this.nextEncounter();
        return true;
    }

    takeReward(p, reward) {
        if (reward === 'card') this.drawCard(p);
        else p.lira += 3;
    }

    // 総督：カードを1枚引き、2リラか手札1枚を払う
    do_governor(p, { use, pay, index }) {
        if (this.step.encounters[0]?.kind !== 'governor') return this.fail('今はその操作はできません');
        if (use === true) {
            if (this.cardsLeft() === 0) return this.fail('カードがありません');
            if (pay === 'lira') {
                if (p.lira < 2) return this.fail('2リラ要ります');
            } else if (pay === 'card') {
                if (!isInt(index, 0, p.cards.length)) return this.fail('捨てるカードを選んでください');
            } else {
                return this.fail('払い方を選んでください');
            }
            this.drawCard(p);
            if (pay === 'lira') p.lira -= 2;
            else this.discard.push(p.cards.splice(index, 1)[0]);
            this.log(`${p.name}が総督からカードを受け取りました`);
            const from = this.governor;
            this.governor = this.rollPlace();
            this.emit({ type: 'governor', from, to: this.governor });
        }
        this.nextEncounter();
        return true;
    }

    // 密輸人：好きな品物を1つ得て、2リラか品物1つを払う
    do_smuggler(p, { use, good, pay }) {
        if (this.step.encounters[0]?.kind !== 'smuggler') return this.fail('今はその操作はできません');
        if (use === true) {
            if (good !== null && good !== undefined && (!GOODS.includes(good) || p.goods[good] >= capacityOf(p))) {
                return this.fail('その品物は積めません');
            }
            const after = { ...p.goods };
            if (good) after[good]++;
            if (pay === 'lira') {
                if (p.lira < 2) return this.fail('2リラ要ります');
            } else if (GOODS.includes(pay)) {
                if (after[pay] < 1) return this.fail('払う品物がありません');
            } else {
                return this.fail('払い方を選んでください');
            }
            if (good) p.goods[good]++;
            if (pay === 'lira') p.lira -= 2;
            else p.goods[pay]--;
            this.log(`${p.name}が密輸人から${good ? GOOD_NAMES[good] : '何も'}受け取り、${pay === 'lira' ? '2リラ' : GOOD_NAMES[pay]}を払いました`);
            const from = this.smuggler;
            this.smuggler = this.rollPlace();
            this.emit({ type: 'smuggler', from, to: this.smuggler });
        }
        this.nextEncounter();
        return true;
    }

    // ---- 自分の番ならいつでも ----

    do_bonus(p, { card, good, from, reward }) {
        if (!Object.hasOwn(BONUS_CARDS, card) || !ownsCard(p, card)) return this.fail('そのカードを持っていません');
        switch (card) {
            case 'lira5':
                this.useCard(p, card);
                p.lira += 5;
                break;
            case 'good':
                if (!GOODS.includes(good) || p.goods[good] >= capacityOf(p)) return this.fail('その品物は積めません');
                this.useCard(p, card);
                p.goods[good]++;
                break;
            case 'return':
                if (!p.assistants.includes(from)) return this.fail('そこに助手はいません');
                this.useCard(p, card);
                p.assistants.splice(p.assistants.indexOf(from), 1);
                p.stack++;
                break;
            case 'family':
                if (p.family === POLICE) return this.fail('家族はもう警察署にいます');
                if (reward !== 'lira' && reward !== 'card') return this.fail('ごほうびを選んでください');
                if (reward === 'card' && this.cardsLeft() === 0) return this.fail('カードがありません');
                this.useCard(p, card);
                this.emit({ type: 'family', seat: p.id, from: p.family, to: POLICE });
                p.family = POLICE;
                this.takeReward(p, reward);
                break;
            case 'sultan2': case 'post2': case 'gem2': {
                if (this.step.stage !== 'after' || !this.canDouble(p, card)) return this.fail('今はそのカードは使えません');
                this.useCard(p, card);
                this.log(`${p.name}が「${BONUS_CARDS[card].name}」を使いました`);
                if (card === 'post2') {
                    this.act5(p);
                } else if (card === 'gem2') {
                    this.buyGem(p);
                    this.afterAction();
                } else {
                    const need = sultanNeed(this.sultanCount);
                    this.paySultan(p, need, autoSultanAny(p.goods, need));
                    this.afterAction();
                }
                return true;
            }
            default:
                return this.fail(card === 'market' ? 'このカードは小市場で売るときに使います' : 'このカードは移動のときに使います');
        }
        this.log(`${p.name}が「${BONUS_CARDS[card].name}」を使いました`);
        return true;
    }

    // 黄のタイル：番に1回、2リラで助手を1人戻す
    do_yellow(p, { from }) {
        if (!p.tiles.includes('yellow')) return this.fail('黄のタイルがありません');
        if (this.step.yellowUsed) return this.fail('この番はもう使いました');
        if (p.lira < 2) return this.fail('2リラ要ります');
        if (!p.assistants.includes(from)) return this.fail('そこに助手はいません');
        p.lira -= 2;
        p.assistants.splice(p.assistants.indexOf(from), 1);
        p.stack++;
        this.step.yellowUsed = true;
        this.log(`${p.name}が2リラで助手を呼び戻しました`);
        return true;
    }

    // ---- 進行 ----

    gainRuby(p, source) {
        p.rubies++;
        this.emit({ type: 'ruby', seat: p.id, source });
        this.log(`${p.name}がルビーを得ました（${p.rubies}個目）`);
        if (!this.endTriggered && p.rubies >= this.rubyTarget()) {
            this.endTriggered = true;
            this.log(`${p.name}のルビーが${this.rubyTarget()}個になりました。このラウンドで終わりです`);
        }
    }

    endTurn() {
        const next = (this.turn + 1) % this.players.length;
        if (this.endTriggered && next === this.startSeat) {
            this.endGame();
            return;
        }
        if (next === this.startSeat) this.round++;
        this.startTurn(next);
    }

    endGame() {
        this.phase = 'end';
        this.step = { stage: 'end' };
        // 残ったカードのうち、リラと品物になるものを使う（同点のときの比べ方に関わる）
        this.players.forEach(p => {
            p.cards = p.cards.filter(card => {
                const good = card === 'good'
                    && GOODS.filter(g => p.goods[g] < capacityOf(p)).sort((a, b) => p.goods[a] - p.goods[b])[0];
                if (card !== 'lira5' && !good) return true;
                if (card === 'lira5') p.lira += 5;
                else p.goods[good]++;
                this.discard.push(card);
                return false;
            });
        });
        const results = this.results();
        const best = results[0];
        this.winners = results.filter(r => ['rubies', 'lira', 'goods', 'cards'].every(k => r[k] === best[k])).map(r => r.seat);
        this.finalResults = results;
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
    }

    // 順位の順（ルビー → リラ → 品物 → カード）
    results() {
        return this.players.map(p => ({
            seat: p.id, rubies: p.rubies, lira: p.lira, goods: goodsTotal(p), cards: p.cards.length
        })).sort((a, b) => b.rubies - a.rubies || b.lira - a.lira || b.goods - a.goods || b.cards - a.cards);
    }

    // ---- 道具 ----

    addGood(p, good) {
        if (p.goods[good] >= capacityOf(p)) return false;
        p.goods[good]++;
        return true;
    }

    drawCard(p) {
        if (this.deck.length === 0) {
            if (this.discard.length === 0) return null;
            this.deck = shuffle(this.discard, () => this.rand());
            this.discard = [];
        }
        const card = this.deck.pop();
        p.cards.push(card);
        return card;
    }

    useCard(p, card) {
        p.cards.splice(p.cards.indexOf(card), 1);
        this.discard.push(card);
    }

    emit(event) {
        if (this.quiet) return;
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(text) {
        if (this.quiet) return;
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    // 先読み用の写し（記録・ログ・イベントは持たない）
    clone() {
        const copy = Object.create(Game.prototype);
        STATE_KEYS.forEach(key => { copy[key] = structuredClone(this[key]); });
        copy.commands = [];
        copy.logs = [];
        copy.events = [];
        copy.lastError = null;
        copy.quiet = true;
        return copy;
    }

    // 保存する形（参加者・設定・操作の記録）。オンライン対戦のサーバーもこの形で保存する
    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
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

