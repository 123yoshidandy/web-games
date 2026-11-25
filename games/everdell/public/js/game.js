/**
 * エバーデール（Everdell）のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びと最初の手番はシードから決まる）
 *
 * 手番では次のどれか1つを行う
 * - place：ワーカーを場所に置き、その効果を使う（基本の場所・森の場所・港・旅・行事・目的地のカード）
 * - play：手札か草原のカードを街に出す（資源で払う・対応する建造物を使って無料で出す・割引のカードを使う）
 * - prepare：ワーカーを全部置いたら、季節の準備をする（ワーカーが戻り、季節が進む）
 * - pass：秋に、もう何もしないときに終える
 * 効果の途中で選ぶことがあれば、prompt に選択待ちを置き、answer の操作で続きを進める
 *
 * 基本セットのルールから、次のように割り切った
 * - 割引（宿屋・クレーン・宿の主人・地下牢・森の場所）で安くする資源と、裁判官で置きかえる資源は、払えるように自動で選ぶ
 * - 地下牢に入れる住民は、点数がいちばん低いものを自動で選ぶ
 * - 遺跡・大学で捨てられるのは、ワーカーが置かれていないカードだけ
 */

import {
    CARDS, RESOURCES, RESOURCE_NAMES, BASIC_LOCATIONS, FOREST_LOCATIONS, BASIC_EVENTS, SPECIAL_EVENTS,
    SPECIAL_EVENTS_IN_GAME, JOURNEY_SPOTS, buildDeck, locationName, gainText, TYPES
} from './cards.js';
import { nextRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const HAND_LIMIT = 8;
export const CITY_LIMIT = 15;
export const MEADOW_SIZE = 8;
export const SEASON_NAMES = ['冬', '春', '夏', '秋'];
export const WORKERS_BY_SEASON = [2, 3, 4, 6];
const START_HAND = [5, 6, 7, 8];
const MAX_LOGS = 300;
const MAX_EVENTS = 200;
// 自動で割り引く・置きかえるときの資源の重み（重いものから安くし、軽いものから払う）
const RES_WEIGHT = { twig: 1, berry: 1.1, resin: 1.2, pebble: 1.4 };

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    place: ['loc'],
    play: ['source', 'index', 'method', 'target'],
    prepare: [],
    pass: [],
    answer: ['id', 'values']
};

export const emptyRes = () => ({ twig: 0, resin: 0, pebble: 0, berry: 0 });
export const resTotal = (res) => RESOURCES.reduce((sum, r) => sum + (res[r] ?? 0), 0);
const resText = (res) => RESOURCES.filter(r => res[r] > 0).map(r => `${RESOURCE_NAMES[r]}${res[r]}`).join('・');
const card = (id) => CARDS[id];
const isCritter = (id) => CARDS[id].kind === 'critter';
const isConstruction = (id) => CARDS[id].kind === 'construction';

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.rng = seed;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: [], city: [], res: emptyRes(), points: 0, journey: 0,
            season: 0, workers: WORKERS_BY_SEASON[0], placed: [], passed: false, events: []
        }));
        this.deck = shuffle(buildDeck(), this.random);
        this.discard = [];
        this.forest = shuffle(FOREST_LOCATIONS.map(l => l.id), this.random).slice(0, players.length === 2 ? 3 : 4);
        this.specials = shuffle(SPECIAL_EVENTS.map(e => e.id), this.random).slice(0, SPECIAL_EVENTS_IN_GAME);
        this.claimed = {};
        this.uidSeq = 0;
        this.meadow = [];
        this.refillMeadow();
        this.first = Math.floor(this.random() * players.length);
        this.turn = this.first;
        for (let i = 0; i < players.length; i++) {
            const p = this.players[(this.first + i) % players.length];
            for (let k = 0; k < START_HAND[i]; k++) p.hand.push(this.drawFromDeck());
        }
        this.phase = 'play';
        this.prompt = null;
        this.promptSeq = 0;
        this.promptHandler = null;
        this.queue = [];
        this.inAction = false;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.sim = false;
        this.log(`${this.players[this.turn].name}から始めます`);
    }

    // ゲームの乱数（状態は this.rng の数値だけ）
    get random() {
        return () => nextRandom(this);
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作が必要な人
    actors() {
        if (this.phase !== 'play') return [];
        return [this.prompt ? this.prompt.player : this.turn];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (this.prompt) {
            if (command.type !== 'answer') return this.fail('先に選んでください');
            if (playerId !== this.prompt.player) return this.fail('あなたの選ぶ番ではありません');
        } else {
            if (command.type === 'answer') return this.fail('今は選ぶものがありません');
            if (playerId !== this.turn) return this.fail('あなたの番ではありません');
        }
        const p = this.players[playerId];
        let action;
        if (command.type === 'answer') action = this.checkAnswer(command);
        else if (command.type === 'place') action = this.checkPlace(p, command.loc);
        else if (command.type === 'play') action = this.checkPlay(p, command);
        else if (command.type === 'prepare') action = this.canPrepare(p) ? null : '季節の準備は、ワーカーを全部置いてからです';
        else if (command.type === 'pass') action = p.season === 3 ? null : '終えられるのは秋だけです';
        if (typeof action === 'string') return this.fail(action);

        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { if (command[key] !== undefined) recorded[key] = structuredClone(command[key]); });
        this.commands.push({ playerId, command: recorded });

        if (command.type === 'answer') {
            const handler = this.promptHandler;
            this.prompt = null;
            this.promptHandler = null;
            handler(command.values);
        } else {
            this.inAction = true;
            if (command.type === 'place') this.place(p, command.loc);
            else if (command.type === 'play') this.executePlay(p, action);
            else if (command.type === 'prepare') this.prepare(p);
            else if (command.type === 'pass') this.pass(p);
        }
        this.run();
        if (!this.prompt && this.queue.length === 0 && this.inAction) this.endAction();
        return true;
    }

    // ---- 手順の列と選択待ち ----

    // 列の先頭に、この順で積む
    now(...steps) {
        this.queue.unshift(...steps);
    }

    run() {
        let guard = 0;
        while (!this.prompt && this.queue.length > 0) {
            if (++guard > 10000) throw new Error('手順が終わりません');
            this.queue.shift()();
        }
    }

    // 選択待ちを出す。options: [{ value, label, card?, res?, seat?, n?, loc? }]、答えは value の配列
    ask(seat, spec, handler) {
        this.prompt = { id: ++this.promptSeq, player: seat, min: 1, max: 1, ...spec };
        this.promptHandler = handler;
    }

    checkAnswer(command) {
        const prompt = this.prompt;
        if (command.id !== prompt.id) return '選択がずれています';
        const values = command.values;
        if (!Array.isArray(values) || values.some(v => typeof v !== 'string')) return '選び方が正しくありません';
        if (new Set(values).size !== values.length) return '同じものは選べません';
        if (values.length < prompt.min || values.length > prompt.max) {
            return prompt.min === prompt.max ? `${prompt.min}つ選んでください` : `${prompt.min}〜${prompt.max}つ選んでください`;
        }
        if (values.some(v => !prompt.options.some(o => o.value === v))) return 'その選択肢はありません';
        return null;
    }

    // 好きな資源を n 個、1つずつ選んで得る
    gainAny(p, n, title = '好きな資源を選んでください', allowed = RESOURCES) {
        if (n <= 0) return;
        this.ask(p.id, {
            tag: 'gain', title: n > 1 ? `${title}（あと${n}つ）` : title,
            options: allowed.map(r => ({ value: r, label: RESOURCE_NAMES[r], res: r }))
        }, ([r]) => {
            p.res[r]++;
            this.log(`${p.name}が${RESOURCE_NAMES[r]}を得ました`);
            this.gainAny(p, n - 1, title, allowed);
        });
    }

    // 持っている資源を n 個、1つずつ選んで払う。then(払った資源の一覧)
    payAny(p, n, title, then, paid = []) {
        if (n <= 0 || resTotal(p.res) === 0) return then(paid);
        this.ask(p.id, {
            tag: 'pay', title: n > 1 ? `${title}（あと${n}つ）` : title,
            options: RESOURCES.filter(r => p.res[r] > 0).map(r => ({ value: r, label: `${RESOURCE_NAMES[r]}（${p.res[r]}）`, res: r }))
        }, ([r]) => {
            p.res[r]--;
            this.payAny(p, n - 1, title, then, [...paid, r]);
        });
    }

    // 0〜max の数を選ぶ
    askNumber(p, tag, title, max, unit, then) {
        if (max <= 0) return then(0);
        this.ask(p.id, {
            tag, title, options: Array.from({ length: max + 1 }, (_, n) => ({ value: String(n), label: n === 0 ? 'しない' : `${n}${unit}`, n }))
        }, ([v]) => then(Number(v)));
    }

    // 相手を選ぶ（1人だけなら選ばずに決める）
    askOpponent(p, title, then, tag = 'opponent', filter = () => true) {
        const list = this.players.filter(o => o.id !== p.id && filter(o));
        if (list.length === 0) return then(null);
        if (list.length === 1) return then(list[0]);
        this.ask(p.id, {
            tag, title, options: list.map(o => ({ value: String(o.id), label: o.name, seat: o.id }))
        }, ([v]) => then(this.players[Number(v)]));
    }

    // 手札から選ぶ。then(選んだ手札の位置の配列)
    askHand(p, tag, title, min, max, then, filter = () => true) {
        const options = p.hand.map((id, i) => ({ value: `h${i}`, label: card(id).name, card: id, index: i })).filter(o => filter(o.card));
        const hi = Math.min(max, options.length);
        if (hi <= 0 || hi < min) return then([]);
        this.ask(p.id, { tag, title, options, min: Math.min(min, hi), max: hi }, (values) => then(values.map(v => Number(v.slice(1)))));
    }

    // 手札の指定した位置のカードを取り除く（取り除いたカードを返す）
    takeFromHand(p, indices) {
        return [...indices].sort((a, b) => b - a).map(i => p.hand.splice(i, 1)[0]).reverse();
    }

    // ---- カードの出し入れ ----

    drawFromDeck() {
        if (this.deck.length === 0) {
            if (this.discard.length === 0) return null;
            this.deck = shuffle(this.discard, this.random);
            this.discard = [];
            this.log('捨て札を切り直して山札にしました');
        }
        return this.deck.pop();
    }

    // 手札の上限まで、n 枚引く
    draw(p, n) {
        let got = 0;
        for (let i = 0; i < n && p.hand.length < HAND_LIMIT; i++) {
            const id = this.drawFromDeck();
            if (!id) break;
            p.hand.push(id);
            got++;
        }
        return got;
    }

    // カードを受け取る（手札がいっぱいなら捨てる）
    receive(p, id) {
        if (p.hand.length < HAND_LIMIT) p.hand.push(id);
        else this.discard.push(id);
    }

    refillMeadow() {
        for (let i = 0; i < MEADOW_SIZE; i++) {
            if (!this.meadow[i]) this.meadow[i] = this.drawFromDeck() ?? null;
        }
    }

    // ---- 街 ----

    has(p, id) {
        return p.city.find(c => c.id === id) ?? null;
    }

    count(p, pred) {
        return p.city.filter(c => pred(c.id, c)).length;
    }

    findCard(uid) {
        for (const p of this.players) {
            const c = p.city.find(x => x.uid === uid);
            if (c) return { owner: p, card: c };
        }
        return null;
    }

    // 街の枠の数（放浪者は数えない。夫と妻の組は1枠）
    slotsUsed(p) {
        return p.city.filter(c => c.id !== 'wanderer' && !(c.id === 'wife' && c.paired)).length;
    }

    unpaired(p, id) {
        return p.city.find(c => c.id === id && !c.paired) ?? null;
    }

    // ワーカーが置かれていないか
    free(c) {
        return this.workersAt(`card-${c.uid}`).length === 0;
    }

    // その街にカードを足せるか（枠とユニーク）
    cityAccepts(p, id) {
        if (card(id).unique && this.has(p, id)) return false;
        if (id === 'wanderer') return true;
        if (id === 'ruins') return p.city.some(c => isConstruction(c.id) && this.free(c));
        if ((id === 'wife' && this.unpaired(p, 'husband')) || (id === 'husband' && this.unpaired(p, 'wife'))) return true;
        return this.slotsUsed(p) < CITY_LIMIT;
    }

    // カードを出せる街（道化は相手の街、ほかは自分の街）
    targetsFor(p, id) {
        if (id === 'fool') return this.players.filter(o => o.id !== p.id && this.cityAccepts(o, id)).map(o => o.id);
        return this.cityAccepts(p, id) ? [p.id] : [];
    }

    // 費用を n 個安くする（足りない資源から、次に重い資源から）
    reduceCost(cost, n, have, berryOnly = false) {
        const c = { ...cost };
        for (let k = 0; k < n; k++) {
            const list = RESOURCES.filter(r => c[r] > 0 && (!berryOnly || r === 'berry'));
            if (list.length === 0) break;
            const score = (r) => (c[r] > have[r] ? 100 : 0) + RES_WEIGHT[r];
            const r = list.reduce((a, b) => (score(b) > score(a) ? b : a));
            c[r]--;
        }
        return c;
    }

    // 払える形を返す（払えなければ null）。裁判官がいれば、足りない資源1つをほかの資源1つで払う
    payment(p, baseCost, { reduce = 0, berryOnly = false } = {}) {
        let c = { ...emptyRes(), ...baseCost };
        if (reduce > 0) c = this.reduceCost(c, reduce, p.res, berryOnly);
        const short = RESOURCES.filter(r => c[r] > p.res[r]);
        if (short.length === 0) return c;
        if (short.length === 1 && c[short[0]] - p.res[short[0]] === 1 && this.has(p, 'judge')) {
            const spare = RESOURCES.filter(r => r !== short[0] && p.res[r] > c[r]).sort((a, b) => RES_WEIGHT[a] - RES_WEIGHT[b])[0];
            if (spare) return { ...c, [short[0]]: c[short[0]] - 1, [spare]: c[spare] + 1 };
        }
        return null;
    }

    // 住民を無料で出すために使える建造物（決まった建造物を先に、なければ永遠の木）
    occupyHost(p, id) {
        const own = p.city.find(c => !c.occupied && (card(c.id).pairs ?? []).includes(id));
        return own ?? p.city.find(c => c.id === 'everTree' && !c.occupied) ?? null;
    }

    // 地下牢に入れる住民（点数がいちばん低く、ワーカーのいないもの）
    prisonerFor(p, playing) {
        const dungeon = this.has(p, 'dungeon');
        if (!dungeon || dungeon.under.length >= (this.has(p, 'ranger') ? 2 : 1)) return null;
        const list = p.city.filter(c => isCritter(c.id) && this.free(c) && c.id !== playing);
        return list.sort((a, b) => card(a.id).points - card(b.id).points)[0] ?? null;
    }

    // そのカードの出し方の一覧 [{ method, cost, target, host?, prisoner? }]
    methodsFor(p, id) {
        const targets = this.targetsFor(p, id);
        if (targets.length === 0) return [];
        const def = card(id);
        const out = [];
        const add = (method, cost, extra = {}) => {
            if (!cost) return;
            targets.forEach(t => out.push({ method, cost, ...(id === 'fool' ? { target: t } : {}), ...extra }));
        };
        add('pay', this.payment(p, def.cost));
        if (def.kind === 'critter') {
            const host = this.occupyHost(p, id);
            if (host) add('occupy', emptyRes(), { host: host.uid });
            if (this.has(p, 'innkeeper') && id !== 'innkeeper') add('innkeeper', this.payment(p, def.cost, { reduce: 3, berryOnly: true }));
        } else if (this.has(p, 'crane') && resTotal(def.cost) > 0) {
            add('crane', this.payment(p, def.cost, { reduce: 3 }));
        }
        if (resTotal(def.cost) > 0) {
            const prisoner = this.prisonerFor(p, id);
            if (prisoner) add('dungeon', this.payment(p, def.cost, { reduce: 3 }), { prisoner: prisoner.uid });
        }
        return out;
    }

    // 出せるカードと出し方の一覧
    playOptions(seat) {
        const p = this.players[seat];
        const sources = [
            ...p.hand.map((id, index) => ({ source: 'hand', index, id })),
            ...this.meadow.map((id, index) => ({ source: 'meadow', index, id })).filter(s => s.id)
        ];
        return sources.flatMap(s => this.methodsFor(p, s.id).map(m => ({ ...s, ...m })));
    }

    checkPlay(p, command) {
        const { source, index, method, target } = command;
        const list = source === 'hand' ? p.hand : source === 'meadow' ? this.meadow : null;
        if (!list || !Number.isInteger(index) || !list[index]) return 'そのカードはありません';
        const id = list[index];
        const options = this.methodsFor(p, id);
        if (options.length === 0) return this.targetsFor(p, id).length === 0 ? '街に置けません' : '資源が足りません';
        const option = options.find(o => o.method === method && (id !== 'fool' || o.target === target));
        if (!option) return 'その出し方はできません';
        return { ...option, source, index, id };
    }

    executePlay(p, option) {
        const { source, index, id, method, cost } = option;
        if (source === 'hand') p.hand.splice(index, 1);
        else this.meadow[index] = null;
        RESOURCES.forEach(r => { p.res[r] -= cost[r]; });
        let how = resTotal(cost) > 0 ? `（${resText(cost)}）` : '';
        if (method === 'occupy') {
            const host = p.city.find(c => c.uid === option.host);
            host.occupied = true;
            how = `（${card(host.id).name}で無料）`;
        } else if (method === 'crane' || method === 'innkeeper') {
            this.removeFromCity(p, this.has(p, method));
            this.discard.push(method);
            how += `（${card(method).name}を捨てて割引）`;
        } else if (method === 'dungeon') {
            const prisoner = p.city.find(c => c.uid === option.prisoner);
            this.removeFromCity(p, prisoner);
            this.has(p, 'dungeon').under.push(prisoner.id);
            how += `（${card(prisoner.id).name}を地下牢へ）`;
        }
        if (source === 'meadow') this.refillMeadow();
        this.putCard(p, id, { target: option.target, how, from: source });
    }

    // 街からカードを外す（夫と妻の組はほどく）
    removeFromCity(owner, c) {
        owner.city = owner.city.filter(x => x !== c);
        if (c.paired) {
            const partner = owner.city.find(x => x.uid === c.paired);
            if (partner) partner.paired = null;
        }
        if (c.under?.length) this.discard.push(...c.under);
    }

    // カードを街に置き、出したときの効果ときっかけの効果を積む。道化で相手が決まっていなければ選ぶ
    putCard(p, id, { target, how = '', from = 'hand' } = {}) {
        if (id === 'fool' && target === undefined) {
            const targets = this.targetsFor(p, id);
            if (targets.length === 0) {
                this.discard.push(id);
                return;
            }
            return this.askOpponent(p, '道化をだれの街に出しますか', (o) => this.putCard(p, id, { target: o.id, how, from }),
                'fool', o => targets.includes(o.id));
        }
        const owner = this.players[target ?? p.id];
        const c = { uid: ++this.uidSeq, id, occupied: false, paired: null, tokens: 0, res: null, under: [] };
        if (id === 'wife' || id === 'husband') {
            const partner = this.unpaired(owner, id === 'wife' ? 'husband' : 'wife');
            if (partner) {
                partner.paired = c.uid;
                c.paired = partner.uid;
            }
        }
        if (id === 'clockTower') c.tokens = 3;
        if (id === 'storehouse') c.res = emptyRes();
        owner.city.push(c);
        this.log(owner === p
            ? `${p.name}が${card(id).name}を出しました${how}`
            : `${p.name}が${owner.name}の街に${card(id).name}を出しました${how}`);
        this.emit({ type: 'play', seat: p.id, owner: owner.id, card: id, uid: c.uid, from });
        this.now(() => this.onPlay(p, c), () => this.triggers(p, id));
    }

    // 出したあとのきっかけ（歴史家・店主・裁判所）
    triggers(p, id) {
        if (id !== 'historian' && this.has(p, 'historian') && this.draw(p, 1) > 0) this.log(`${p.name}が歴史家でカードを1枚引きました`);
        if (isCritter(id) && id !== 'shopkeeper' && this.has(p, 'shopkeeper')) {
            p.res.berry++;
            this.log(`${p.name}が店主でベリーを1つ得ました`);
        }
        if (isConstruction(id) && id !== 'courthouse' && this.has(p, 'courthouse')) {
            this.gainAny(p, 1, '裁判所：資源を選んでください', ['twig', 'resin', 'pebble']);
        }
    }

    // 出したときの効果（緑の生産と茶の旅人）
    onPlay(p, c) {
        const def = card(c.id);
        if (def.type === 'prod') return this.produce(p, c, p);
        if (def.type !== 'trav') return;
        switch (c.id) {
            case 'ruins': {
                const options = p.city.filter(x => x !== c && isConstruction(x.id) && this.free(x));
                if (options.length === 0) return;
                return this.ask(p.id, {
                    tag: 'ruins', title: '遺跡：捨てる建造物を選んでください',
                    options: options.map(x => ({ value: String(x.uid), label: card(x.id).name, card: x.id }))
                }, ([v]) => {
                    const x = p.city.find(y => y.uid === Number(v));
                    this.removeFromCity(p, x);
                    this.discard.push(x.id);
                    RESOURCES.forEach(r => { p.res[r] += card(x.id).cost[r] ?? 0; });
                    const got = this.draw(p, 2);
                    this.log(`${p.name}が${card(x.id).name}を捨て、${resText(card(x.id).cost) || '資源なし'}とカード${got}枚を得ました`);
                });
            }
            case 'undertaker': return this.undertaker(p);
            case 'postalPigeon': {
                const revealed = [this.drawFromDeck(), this.drawFromDeck()].filter(Boolean);
                return this.chooseFreePlay(p, revealed, '伝書バト：無料で出すカードを選んでください');
            }
            case 'ranger': return this.ranger(p);
            case 'wanderer': {
                const got = this.draw(p, 3);
                return this.log(`${p.name}がカードを${got}枚引きました`);
            }
            case 'bard':
                return this.askHand(p, 'discard-points', '吟遊詩人：捨てるカードを選んでください（1枚1点）', 0, 5, (indices) => {
                    this.discard.push(...this.takeFromHand(p, indices));
                    p.points += indices.length;
                    if (indices.length) this.log(`${p.name}が${indices.length}枚捨てて${indices.length}点を得ました`);
                });
            case 'shepherd': {
                p.res.berry += 3;
                const chapel = this.has(p, 'chapel');
                const pts = chapel ? chapel.tokens : 0;
                p.points += pts;
                return this.log(`${p.name}がベリー3つ${pts ? `と${pts}点` : ''}を得ました`);
            }
            default:
        }
    }

    undertaker(p) {
        const filled = this.meadow.map((id, i) => ({ id, i })).filter(x => x.id);
        const n = Math.min(3, filled.length);
        const keep = () => {
            if (p.hand.length >= HAND_LIMIT) return;
            const options = this.meadow.map((id, i) => ({ value: `m${i}`, label: id && card(id).name, card: id })).filter(o => o.card);
            if (options.length === 0) return;
            this.ask(p.id, { tag: 'meadow-take', title: '墓守：草原から手札に加えるカードを選んでください', options }, ([v]) => {
                const i = Number(v.slice(1));
                p.hand.push(this.meadow[i]);
                this.meadow[i] = null;
                this.refillMeadow();
            });
        };
        if (n === 0) return keep();
        this.ask(p.id, {
            tag: 'meadow-discard', title: '墓守：草原から捨てるカードを3枚選んでください', min: n, max: n,
            options: filled.map(x => ({ value: `m${x.i}`, label: card(x.id).name, card: x.id }))
        }, (values) => {
            values.forEach(v => {
                const i = Number(v.slice(1));
                this.discard.push(this.meadow[i]);
                this.meadow[i] = null;
            });
            this.refillMeadow();
            keep();
        });
    }

    ranger(p) {
        const movable = [...new Set(p.placed.filter(loc => !this.isPermanent(loc)))];
        if (movable.length === 0) return;
        this.ask(p.id, {
            tag: 'ranger-from', title: '森番：動かすワーカーを選んでください',
            options: movable.map(loc => ({ value: loc, label: this.placeName(loc), loc }))
        }, ([from]) => {
            const i = p.placed.indexOf(from);
            p.placed.splice(i, 1);
            const targets = this.allLocations(p).filter(loc => loc !== from && this.checkPlace(p, loc) === null);
            if (targets.length === 0) {
                p.placed.push(from);
                return;
            }
            this.ask(p.id, {
                tag: 'ranger-to', title: '森番：ワーカーを動かす先を選んでください',
                options: targets.map(loc => ({ value: loc, label: this.placeName(loc), loc }))
            }, ([to]) => this.place(p, to));
        });
    }

    // めくったカードから、点数が3点以下のものを1枚無料で出す。残りは捨てる
    chooseFreePlay(p, revealed, title) {
        const ok = (id) => card(id).points <= 3 && this.targetsFor(p, id).length > 0;
        const options = revealed.map((id, i) => ({ value: `r${i}`, label: card(id).name, card: id, disabled: !ok(id) }));
        const finish = (chosen) => {
            revealed.forEach((id, i) => { if (i !== chosen) this.discard.push(id); });
            if (chosen >= 0) this.putCard(p, revealed[chosen], { how: '（無料）', from: 'reveal' });
        };
        if (!revealed.some(ok)) {
            this.log(`${p.name}は${revealed.map(id => card(id).name).join('・')}をめくりましたが、出せませんでした`);
            return finish(-1);
        }
        this.ask(p.id, {
            tag: 'free-play', title, min: 0, max: 1,
            options: options.filter(o => !o.disabled), shown: revealed
        }, (values) => finish(values.length ? Number(values[0].slice(1)) : -1));
    }

    // ---- 生産 ----

    produce(p, c, owner) {
        this.produceEffect(p, c.id, c, owner);
    }

    // 緑の生産の効果。owner はカードがある街（鉱夫モグラでまねたときは相手）
    produceEffect(p, id, c, owner = p) {
        const gain = (res, why = card(id).name) => {
            RESOURCES.forEach(r => { p.res[r] += res[r] ?? 0; });
            if (resTotal(res) > 0) this.log(`${p.name}が${why}で${resText(res)}を得ました`);
        };
        switch (id) {
            case 'farm': return gain({ berry: 1 });
            case 'twigBarge': return gain({ twig: 2 });
            case 'resinRefinery': return gain({ resin: 1 });
            case 'mine': return gain({ pebble: 1 });
            case 'generalStore': return gain({ berry: this.has(p, 'farm') ? 2 : 1 });
            case 'bargeToad': return gain({ twig: 2 * this.count(p, x => x === 'farm') });
            case 'fairgrounds': {
                const got = this.draw(p, 2);
                return this.log(`${p.name}が祭り広場でカードを${got}枚引きました`);
            }
            case 'husband':
                if (c?.paired && this.has(owner, 'farm')) this.gainAny(p, 1, '夫：好きな資源を選んでください');
                return;
            case 'storehouse': {
                const choices = [['twig', 3], ['resin', 2], ['pebble', 1], ['berry', 2]];
                return this.ask(p.id, {
                    tag: 'storehouse', title: '倉庫：上に置く資源を選んでください',
                    options: choices.map(([r, n]) => ({ value: r, label: `${RESOURCE_NAMES[r]}${n}`, res: r, n }))
                }, ([r]) => {
                    const store = c && c.res ? c : this.has(p, 'storehouse');
                    store.res[r] += choices.find(x => x[0] === r)[1];
                });
            }
            case 'chipSweep': {
                const list = p.city.filter(x => card(x.id).type === 'prod' && !['chipSweep', 'minerMole'].includes(x.id));
                if (list.length === 0) return;
                return this.ask(p.id, {
                    tag: 'copy-prod', title: '煙突掃除：まねる緑のカードを選んでください',
                    options: list.map(x => ({ value: String(x.uid), label: card(x.id).name, card: x.id }))
                }, ([v]) => {
                    const x = p.city.find(y => y.uid === Number(v));
                    this.produceEffect(p, x.id, x, p);
                });
            }
            case 'minerMole': {
                const list = this.players.filter(o => o.id !== p.id).flatMap(o => o.city
                    .filter(x => card(x.id).type === 'prod' && !['chipSweep', 'minerMole', 'storehouse'].includes(x.id))
                    .map(x => ({ o, x })));
                if (list.length === 0) return;
                return this.ask(p.id, {
                    tag: 'copy-prod', title: '鉱夫モグラ：まねる相手の緑のカードを選んでください',
                    options: list.map(({ o, x }) => ({ value: String(x.uid), label: `${card(x.id).name}（${o.name}）`, card: x.id }))
                }, ([v]) => {
                    const { o, x } = list.find(e => e.x.uid === Number(v));
                    this.produceEffect(p, x.id, x, o);
                });
            }
            case 'woodcarver':
                return this.askNumber(p, 'pay-points', '木彫り師：小枝をいくつ払いますか（1つ1点）', Math.min(3, p.res.twig), 'つ払う', (n) => {
                    p.res.twig -= n;
                    p.points += n;
                    if (n) this.log(`${p.name}が小枝${n}つで${n}点を得ました`);
                });
            case 'doctor':
                return this.askNumber(p, 'pay-points', '医者：ベリーをいくつ払いますか（1つ1点）', Math.min(3, p.res.berry), 'つ払う', (n) => {
                    p.res.berry -= n;
                    p.points += n;
                    if (n) this.log(`${p.name}がベリー${n}つで${n}点を得ました`);
                });
            case 'peddler':
                return this.askNumber(p, 'peddler', '行商人：資源をいくつ交換しますか', Math.min(2, resTotal(p.res)), 'つ交換', (n) => {
                    if (n === 0) return;
                    this.payAny(p, n, '行商人：払う資源を選んでください', () => this.gainAny(p, n, '行商人：得る資源を選んでください'));
                });
            case 'teacher': {
                const drawn = [this.drawFromDeck(), this.drawFromDeck()].filter(Boolean);
                if (drawn.length === 0) return;
                if (drawn.length === 1 || this.players.length < 2) {
                    drawn.forEach(d => this.receive(p, d));
                    return;
                }
                return this.ask(p.id, {
                    tag: 'teacher-keep', title: '先生：手元に残すカードを選んでください（もう1枚は相手へ）',
                    options: drawn.map((d, i) => ({ value: `d${i}`, label: card(d).name, card: d }))
                }, ([v]) => {
                    const keep = Number(v.slice(1));
                    this.receive(p, drawn[keep]);
                    this.askOpponent(p, '先生：カードを渡す相手を選んでください', (o) => {
                        this.receive(o, drawn[1 - keep]);
                        this.log(`${p.name}が${o.name}にカードを1枚渡しました`);
                    }, 'give');
                });
            }
            case 'monk':
                return this.askNumber(p, 'monk', '修道士：ベリーをいくつ相手に渡しますか（1つ2点）', Math.min(2, p.res.berry), 'つ渡す', (n) => {
                    if (n === 0) return;
                    this.askOpponent(p, '修道士：ベリーを渡す相手を選んでください', (o) => {
                        p.res.berry -= n;
                        o.res.berry += n;
                        p.points += 2 * n;
                        this.log(`${p.name}が${o.name}にベリー${n}つを渡し、${2 * n}点を得ました`);
                    }, 'give');
                });
            default:
        }
    }

    // ---- ワーカー ----

    workersAt(loc) {
        return this.players.flatMap(p => p.placed.filter(l => l === loc).map(() => p.id));
    }

    available(p) {
        return p.workers - p.placed.length;
    }

    isPermanent(loc) {
        if (!loc.startsWith('card-')) return false;
        const found = this.findCard(Number(loc.slice(5)));
        return !!found && card(found.card.id).permanent;
    }

    placeName(loc) {
        if (loc.startsWith('card-')) {
            const found = this.findCard(Number(loc.slice(5)));
            return found ? card(found.card.id).name : '場所';
        }
        return locationName(loc);
    }

    // p が置ける候補になりうる場所の一覧
    allLocations(p) {
        const cards = this.players.flatMap(o => o.city.filter(c => card(c.id).spot && (o === p || card(c.id).open)).map(c => `card-${c.uid}`));
        return [
            ...BASIC_LOCATIONS.map(l => l.id), ...this.forest, 'haven', ...JOURNEY_SPOTS.map(n => `journey-${n}`),
            ...BASIC_EVENTS.map(e => e.id), ...this.specials, ...cards
        ];
    }

    // 置けるなら null、置けなければ理由
    checkPlace(p, loc) {
        if (typeof loc !== 'string') return '場所が正しくありません';
        if (this.available(p) <= 0) return '置けるワーカーがいません';
        const here = this.workersAt(loc);
        const basic = BASIC_LOCATIONS.find(l => l.id === loc);
        if (basic) return basic.exclusive && here.length > 0 ? 'ほかのワーカーがいます' : null;
        if (loc.startsWith('f-')) {
            if (!this.forest.includes(loc)) return 'その場所はありません';
            if (here.includes(p.id)) return 'すでに置いています';
            return here.length >= (this.players.length === 4 ? 2 : 1) ? 'ほかのワーカーがいます' : null;
        }
        if (loc === 'haven') return null;
        if (loc.startsWith('journey-')) {
            const n = Number(loc.slice(8));
            if (!JOURNEY_SPOTS.includes(n)) return 'その場所はありません';
            if (p.season !== 3) return '旅は秋だけです';
            if (n !== 2 && here.length > 0) return 'ほかのワーカーがいます';
            return p.hand.length < n ? `手札が${n}枚いります` : null;
        }
        if (loc.startsWith('e-') || loc.startsWith('s-')) {
            if (!BASIC_EVENTS.some(e => e.id === loc) && !this.specials.includes(loc)) return 'その行事はありません';
            if (this.claimed[loc] !== undefined) return 'もう達成されています';
            return this.eventReady(p, loc) ? null : '条件を満たしていません';
        }
        if (loc.startsWith('card-')) {
            const found = this.findCard(Number(loc.slice(5)));
            if (!found) return 'その場所はありません';
            const { owner, card: c } = found;
            const def = card(c.id);
            if (!def.spot) return 'ワーカーを置けないカードです';
            if (owner !== p && !def.open) return 'ほかの人の街のカードです';
            const cap = (c.id === 'monastery' && this.has(owner, 'monk')) || (c.id === 'cemetery' && this.has(owner, 'undertaker')) ? 2 : 1;
            if (here.length >= cap) return 'ほかのワーカーがいます';
            return this.destinationReady(p, c);
        }
        return 'その場所はありません';
    }

    // 目的地のカードの効果を使えるか（使えなければ理由）
    destinationReady(p, c) {
        switch (c.id) {
            case 'inn': return this.innOptions(p).length > 0 ? null : '安くして出せる草原のカードがありません';
            case 'postOffice': return p.hand.length >= 2 ? null : '手札が2枚いります';
            case 'monastery': return resTotal(p.res) >= 2 ? null : '資源が2ついります';
            case 'university': return p.city.some(x => x !== c && this.free(x)) ? null : '捨てられるカードがありません';
            case 'queen': return this.queenOptions(p).length > 0 ? null : '出せるカードがありません';
            case 'storehouse': return resTotal(c.res) > 0 ? null : '倉庫に資源がありません';
            default: return null;
        }
    }

    innOptions(p) {
        return this.meadow.map((id, index) => ({ id, index })).filter(x => x.id && this.targetsFor(p, x.id).length > 0)
            .map(x => ({ ...x, cost: this.payment(p, card(x.id).cost, { reduce: 3 }) })).filter(x => x.cost);
    }

    queenOptions(p) {
        return [
            ...p.hand.map((id, index) => ({ id, index, source: 'hand' })),
            ...this.meadow.map((id, index) => ({ id, index, source: 'meadow' }))
        ].filter(x => x.id && card(x.id).points <= 3 && this.targetsFor(p, x.id).length > 0);
    }

    place(p, loc) {
        p.placed.push(loc);
        this.emit({ type: 'place', seat: p.id, loc });
        if (loc.startsWith('card-')) {
            const { owner, card: c } = this.findCard(Number(loc.slice(5)));
            if (owner !== p) {
                owner.points++;
                this.log(`${p.name}が${owner.name}の${card(c.id).name}にワーカーを置きました（${owner.name}に1点）`);
            } else {
                this.log(`${p.name}が${card(c.id).name}にワーカーを置きました`);
            }
            return this.destination(p, c);
        }
        this.log(`${p.name}が「${this.placeName(loc)}」にワーカーを置きました`);
        this.activate(p, loc);
    }

    // 基本・森の場所の効果
    gainFrom(p, def) {
        const got = emptyRes();
        Object.entries(def.gain ?? {}).forEach(([r, n]) => { p.res[r] += n; got[r] += n; });
        const drawn = def.cards ? this.draw(p, def.cards) : 0;
        if (def.points) p.points += def.points;
        const parts = [resText(got), drawn ? `カード${drawn}枚` : '', def.points ? `${def.points}点` : ''].filter(Boolean);
        if (parts.length) this.log(`${p.name}が${parts.join('・')}を得ました`);
        if (def.any) this.gainAny(p, def.any);
    }

    activate(p, loc) {
        const basic = BASIC_LOCATIONS.find(l => l.id === loc);
        if (basic) return this.gainFrom(p, basic);
        const forest = FOREST_LOCATIONS.find(l => l.id === loc);
        if (forest && !forest.text) return this.gainFrom(p, forest);
        switch (loc) {
            case 'f-copy':
                return this.ask(p.id, {
                    tag: 'copy-basic', title: 'まねる基本の場所を選んでください',
                    options: BASIC_LOCATIONS.map(l => ({ value: l.id, label: gainText(l), loc: l.id }))
                }, ([v]) => {
                    this.gainFrom(p, BASIC_LOCATIONS.find(l => l.id === v));
                    this.draw(p, 1);
                });
            case 'f-trade':
                return this.askHand(p, 'discard-gain', '捨てるカードを選んでください（1枚につき好きな資源1つ）', 0, 3, (indices) => {
                    this.discard.push(...this.takeFromHand(p, indices));
                    this.gainAny(p, indices.length);
                });
            case 'f-redraw':
                return this.askHand(p, 'discard-draw', '捨てるカードを選んでください（1枚につき2枚引く）', 0, HAND_LIMIT, (indices) => {
                    this.discard.push(...this.takeFromHand(p, indices));
                    const got = this.draw(p, indices.length * 2);
                    this.log(`${p.name}が${indices.length}枚捨てて${got}枚引きました`);
                });
            case 'f-meadow': return this.forestMeadow(p);
            case 'haven':
                return this.askHand(p, 'discard-gain2', '捨てるカードを選んでください（2枚につき好きな資源1つ）', 0, HAND_LIMIT, (indices) => {
                    this.discard.push(...this.takeFromHand(p, indices));
                    this.log(`${p.name}が${indices.length}枚捨てました`);
                    this.gainAny(p, Math.floor(indices.length / 2));
                });
            default:
        }
        if (loc.startsWith('journey-')) {
            const n = Number(loc.slice(8));
            return this.askHand(p, 'journey', `旅：捨てるカードを${n}枚選んでください`, n, n, (indices) => {
                this.discard.push(...this.takeFromHand(p, indices));
                p.journey += n;
                this.log(`${p.name}が旅に出て${n}点を得ました`);
            });
        }
        if (loc.startsWith('e-') || loc.startsWith('s-')) return this.claimEvent(p, loc);
    }

    forestMeadow(p) {
        const room = Math.min(2, HAND_LIMIT - p.hand.length);
        const options = this.meadow.map((id, i) => ({ value: `m${i}`, label: id && card(id).name, card: id })).filter(o => o.card);
        const n = Math.min(room, options.length);
        if (n <= 0) return;
        this.ask(p.id, { tag: 'meadow-take', title: `草原から手札に加えるカードを${n}枚選んでください`, min: n, max: n, options }, (values) => {
            const taken = values.map(v => {
                const i = Number(v.slice(1));
                const id = this.meadow[i];
                this.meadow[i] = null;
                return id;
            });
            p.hand.push(...taken);
            this.refillMeadow();
            const start = p.hand.length - taken.length;
            const playable = taken.map((id, k) => ({ id, index: start + k, cost: this.payment(p, card(id).cost, { reduce: 1 }) }))
                .filter(x => x.cost && this.targetsFor(p, x.id).length > 0);
            if (playable.length === 0) return;
            this.ask(p.id, {
                tag: 'discount-play', title: '資源1つ分安く出すカードを選んでください', min: 0, max: 1,
                options: playable.map(x => ({ value: `h${x.index}`, label: `${card(x.id).name}（${resText(x.cost) || '無料'}）`, card: x.id, cost: x.cost }))
            }, (vals) => {
                if (vals.length === 0) return;
                const x = playable.find(y => `h${y.index}` === vals[0]);
                p.hand.splice(x.index, 1);
                RESOURCES.forEach(r => { p.res[r] -= x.cost[r]; });
                this.putCard(p, x.id, { how: `（${resText(x.cost) || '無料'}）` });
            });
        });
    }

    // 目的地のカードの効果
    destination(p, c) {
        switch (c.id) {
            case 'inn': {
                const list = this.innOptions(p);
                return this.ask(p.id, {
                    tag: 'inn', title: '宿屋：草原から出すカードを選んでください（3つ安く）',
                    options: list.map(x => ({ value: `m${x.index}`, label: `${card(x.id).name}（${resText(x.cost) || '無料'}）`, card: x.id, cost: x.cost }))
                }, ([v]) => {
                    const x = list.find(y => `m${y.index}` === v);
                    this.meadow[x.index] = null;
                    RESOURCES.forEach(r => { p.res[r] -= x.cost[r]; });
                    this.refillMeadow();
                    this.putCard(p, x.id, { how: `（宿屋で${resText(x.cost) || '無料'}）`, from: 'meadow' });
                });
            }
            case 'postOffice':
                return this.askOpponent(p, '郵便局：カードを渡す相手を選んでください', (o) => {
                    this.askHand(p, 'give-cards', `郵便局：${o.name}に渡すカードを2枚選んでください`, 2, 2, (indices) => {
                        this.takeFromHand(p, indices).forEach(id => this.receive(o, id));
                        this.log(`${p.name}が${o.name}にカードを2枚渡しました`);
                        this.askHand(p, 'discard-refill', '郵便局：捨てるカードを選んでください（そのあと8枚まで引く）', 0, HAND_LIMIT, (more) => {
                            this.discard.push(...this.takeFromHand(p, more));
                            const got = this.draw(p, HAND_LIMIT);
                            this.log(`${p.name}が${more.length}枚捨てて${got}枚引きました`);
                        });
                    });
                }, 'give');
            case 'cemetery': {
                const reveal = (fromDiscard) => {
                    const revealed = [];
                    for (let i = 0; i < 4; i++) {
                        const id = fromDiscard ? this.discard.pop() : this.drawFromDeck();
                        if (id) revealed.push(id);
                    }
                    this.chooseFreePlay(p, revealed, '墓地：無料で出すカードを選んでください');
                };
                if (this.discard.length === 0) return reveal(false);
                return this.ask(p.id, {
                    tag: 'cemetery', title: '墓地：どこから4枚めくりますか',
                    options: [{ value: 'deck', label: '山札' }, { value: 'discard', label: '捨て札' }]
                }, ([v]) => reveal(v === 'discard'));
            }
            case 'chapel': {
                c.tokens++;
                const got = this.draw(p, 2 * c.tokens);
                return this.log(`${p.name}が礼拝堂に点数トークンを置き、カードを${got}枚引きました`);
            }
            case 'lookout':
                return this.ask(p.id, {
                    tag: 'lookout', title: '見張り台：使う場所を選んでください',
                    options: [...BASIC_LOCATIONS.map(l => l.id), ...this.forest].map(loc => ({ value: loc, label: locationName(loc), loc }))
                }, ([v]) => this.activate(p, v));
            case 'monastery':
                return this.payAny(p, 2, '修道院：相手に渡す資源を選んでください', (paid) => {
                    this.askOpponent(p, '修道院：資源を渡す相手を選んでください', (o) => {
                        paid.forEach(r => { o.res[r]++; });
                        p.points += 4;
                        this.log(`${p.name}が${o.name}に${paid.map(r => RESOURCE_NAMES[r]).join('と')}を渡し、4点を得ました`);
                    }, 'give');
                });
            case 'university': {
                const list = p.city.filter(x => x !== c && this.free(x));
                return this.ask(p.id, {
                    tag: 'university', title: '大学：捨てる街のカードを選んでください',
                    options: list.map(x => ({ value: String(x.uid), label: card(x.id).name, card: x.id }))
                }, ([v]) => {
                    const x = p.city.find(y => y.uid === Number(v));
                    this.removeFromCity(p, x);
                    this.discard.push(x.id);
                    RESOURCES.forEach(r => { p.res[r] += card(x.id).cost[r] ?? 0; });
                    p.points += 1;
                    this.log(`${p.name}が${card(x.id).name}を捨て、${resText(card(x.id).cost) || '資源なし'}と1点を得ました`);
                    this.gainAny(p, 1, '大学：好きな資源を選んでください');
                });
            }
            case 'queen': {
                const list = this.queenOptions(p);
                return this.ask(p.id, {
                    tag: 'queen', title: '女王：無料で出すカードを選んでください',
                    options: list.map(x => ({ value: `${x.source[0]}${x.index}`, label: card(x.id).name, card: x.id }))
                }, ([v]) => {
                    const x = list.find(y => `${y.source[0]}${y.index}` === v);
                    if (x.source === 'hand') p.hand.splice(x.index, 1);
                    else {
                        this.meadow[x.index] = null;
                        this.refillMeadow();
                    }
                    this.putCard(p, x.id, { how: '（女王で無料）', from: x.source });
                });
            }
            case 'storehouse': {
                const got = { ...c.res };
                RESOURCES.forEach(r => { p.res[r] += c.res[r]; });
                c.res = emptyRes();
                return this.log(`${p.name}が倉庫から${resText(got)}を受け取りました`);
            }
            default:
        }
    }

    // ---- 行事 ----

    // 街の色ごとの枚数（夫と妻の組も1枚ずつ数える）
    typeCounts(p) {
        const counts = { prod: 0, dest: 0, gov: 0, trav: 0, pros: 0 };
        p.city.forEach(c => { counts[card(c.id).type]++; });
        return counts;
    }

    eventReady(p, id) {
        const basic = BASIC_EVENTS.find(e => e.id === id);
        if (basic) return this.typeCounts(p)[basic.type] >= basic.need;
        const special = SPECIAL_EVENTS.find(e => e.id === id);
        if (special.needsTypes) return Object.values(this.typeCounts(p)).every(n => n >= 2);
        return special.needs.every(need => this.has(p, need));
    }

    claimEvent(p, id) {
        this.claimed[id] = p.id;
        const record = { id, points: 0, under: [], res: emptyRes() };
        p.events.push(record);
        const name = locationName(id);
        const done = (pts) => {
            record.points = pts;
            this.log(`${p.name}が行事「${name}」を達成しました${pts ? `（${pts}点）` : ''}`);
        };
        if (id.startsWith('e-')) return done(3);
        switch (id) {
            case 's-graduation':
                return this.askHand(p, 'event-cards', '卒業式：この下に置く手札の住民を選んでください（1枚2点）', 0, 3, (indices) => {
                    record.under = this.takeFromHand(p, indices);
                    done(2 * indices.length);
                }, isCritter);
            case 's-marketing':
                return this.askNumber(p, 'event-give', '売り込み：資源をいくつ相手に渡しますか（1つ2点）', Math.min(3, resTotal(p.res)), 'つ渡す', (n) => {
                    if (n === 0) return done(0);
                    this.payAny(p, n, '売り込み：渡す資源を選んでください', (paid) => {
                        this.askOpponent(p, '売り込み：資源を渡す相手を選んでください', (o) => {
                            paid.forEach(r => { o.res[r]++; });
                            done(2 * paid.length);
                        }, 'give');
                    });
                });
            case 's-performer':
                return this.askNumber(p, 'event-place', '吟遊詩人：ベリーをいくつ置きますか（1つ2点）', Math.min(3, p.res.berry), 'つ置く', (n) => {
                    p.res.berry -= n;
                    record.res.berry = n;
                    done(2 * n);
                });
            case 's-fireworks':
                return this.askNumber(p, 'event-place', '花火：小枝をいくつ置きますか（1つ2点）', Math.min(3, p.res.twig), 'つ置く', (n) => {
                    p.res.twig -= n;
                    record.res.twig = n;
                    done(2 * n);
                });
            case 's-management':
                return this.askNumber(p, 'event-place', '店のきりもり：資源をいくつ置きますか', Math.min(3, resTotal(p.res)), 'つ置く', (n) => {
                    this.payAny(p, n, '置く資源を選んでください（小枝・ベリー1点、樹脂・小石2点）', (paid) => {
                        paid.forEach(r => { record.res[r]++; });
                        done(paid.reduce((s, r) => s + (r === 'resin' || r === 'pebble' ? 2 : 1), 0));
                    });
                });
            case 's-thieves': {
                const list = p.city.filter(c => isCritter(c.id) && this.free(c));
                if (list.length === 0) return done(0);
                return this.ask(p.id, {
                    tag: 'event-city', title: '捕り物：この下に置く街の住民を選んでください（1枚3点）', min: 0, max: Math.min(2, list.length),
                    options: list.map(c => ({ value: String(c.uid), label: card(c.id).name, card: c.id }))
                }, (values) => {
                    values.forEach(v => {
                        const c = p.city.find(x => x.uid === Number(v));
                        this.removeFromCity(p, c);
                        record.under.push(c.id);
                    });
                    done(3 * values.length);
                });
            }
            case 's-tax': {
                done(3);
                const greens = p.city.filter(c => card(c.id).type === 'prod');
                return this.now(...greens.map(c => () => this.produce(p, c, p)));
            }
            case 's-wellrun': {
                done(4);
                const list = [...new Set(p.placed.filter(loc => loc !== id && !this.isPermanent(loc)))];
                if (list.length === 0) return;
                return this.ask(p.id, {
                    tag: 'recall', title: 'よく治まった街：手元に戻すワーカーを選んでください', min: 0, max: 1,
                    options: list.map(loc => ({ value: loc, label: this.placeName(loc), loc }))
                }, (values) => {
                    if (values.length) p.placed.splice(p.placed.indexOf(values[0]), 1);
                });
            }
            case 's-games': return done(9);
            default: return done(0); // 終わりに数える行事
        }
    }

    // ---- 季節 ----

    canPrepare(p) {
        return p.season < 3 && this.available(p) === 0;
    }

    prepare(p) {
        const tower = this.has(p, 'clockTower');
        const spots = [...new Set(p.placed.filter(loc => loc.startsWith('b-') || loc.startsWith('f-')))];
        if (tower && tower.tokens > 0 && spots.length > 0) {
            return this.ask(p.id, {
                tag: 'clock', title: '時計塔：トークンを1つ外して、もう一度使う場所を選んでください', min: 0, max: 1,
                options: spots.map(loc => ({ value: loc, label: locationName(loc), loc }))
            }, (values) => {
                this.now(() => this.advanceSeason(p));
                if (values.length) {
                    tower.tokens--;
                    this.log(`${p.name}が時計塔で「${locationName(values[0])}」をもう一度使いました`);
                    this.activate(p, values[0]);
                }
            });
        }
        this.advanceSeason(p);
    }

    advanceSeason(p) {
        p.placed = p.placed.filter(loc => this.isPermanent(loc));
        p.season++;
        const added = WORKERS_BY_SEASON[p.season] - WORKERS_BY_SEASON[p.season - 1];
        p.workers += added;
        this.log(`${p.name}が${SEASON_NAMES[p.season]}の準備をしました（ワーカー+${added}）`);
        this.emit({ type: 'season', seat: p.id, season: p.season });
        if (p.season === 1 || p.season === 3) {
            const greens = p.city.filter(c => card(c.id).type === 'prod');
            this.now(...greens.map(c => () => { if (p.city.includes(c)) this.produce(p, c, p); }));
        } else if (p.season === 2) {
            const room = Math.min(2, HAND_LIMIT - p.hand.length);
            const options = this.meadow.map((id, i) => ({ value: `m${i}`, label: id && card(id).name, card: id })).filter(o => o.card);
            if (room <= 0 || options.length === 0) return;
            this.ask(p.id, { tag: 'meadow-take', title: `夏：草原から手札に加えるカードを${room}枚まで選んでください`, min: 0, max: Math.min(room, options.length), options }, (values) => {
                values.forEach(v => {
                    const i = Number(v.slice(1));
                    p.hand.push(this.meadow[i]);
                    this.meadow[i] = null;
                });
                this.refillMeadow();
            });
        }
    }

    pass(p) {
        p.passed = true;
        this.log(`${p.name}は終えました`);
        this.emit({ type: 'pass', seat: p.id });
    }

    endAction() {
        this.inAction = false;
        if (this.players.every(p => p.passed)) return this.endGame();
        const n = this.players.length;
        for (let i = 1; i <= n; i++) {
            const next = (this.turn + i) % n;
            if (!this.players[next].passed) {
                this.turn = next;
                return;
            }
        }
    }

    // ---- 得点 ----

    scoreOf(seat) {
        const p = this.players[seat];
        let cards = 0;
        let bonus = 0;
        const commons = (kind) => p.city.filter(c => card(c.id).kind === kind && !card(c.id).unique).length;
        const uniques = (kind) => p.city.filter(c => card(c.id).kind === kind && card(c.id).unique).length;
        p.city.forEach(c => {
            cards += card(c.id).points;
            switch (c.id) {
                case 'everTree': bonus += p.city.filter(x => card(x.id).type === 'pros').length; break;
                case 'castle': bonus += commons('construction'); break;
                case 'palace': bonus += uniques('construction'); break;
                case 'school': bonus += commons('critter'); break;
                case 'theater': bonus += uniques('critter'); break;
                case 'architect': bonus += Math.min(6, p.res.resin + p.res.pebble); break;
                case 'king': bonus += p.events.reduce((s, e) => s + (e.id.startsWith('e-') ? 1 : 2), 0); break;
                case 'wife': bonus += c.paired ? 3 : 0; break;
                default:
            }
        });
        const tokens = p.points + p.city.reduce((s, c) => s + (c.id === 'clockTower' || c.id === 'chapel' ? c.tokens : 0), 0);
        const workersOn = (id) => p.city.filter(c => c.id === id).reduce((s, c) => s + p.placed.filter(l => l === `card-${c.uid}`).length, 0);
        const events = p.events.reduce((s, e) => {
            switch (e.id) {
                case 's-pilgrims': return s + 3 * workersOn('monastery');
                case 's-fallen': return s + 3 * workersOn('cemetery');
                case 's-doctor': return s + 3 * this.players.reduce((n, o) => n + o.city.filter(c => c.id === 'wife' && c.paired).length, 0);
                case 's-miscreants': return s + 3 * (this.has(p, 'dungeon')?.under.length ?? 0);
                default: return s + e.points;
            }
        }, 0);
        const total = cards + bonus + tokens + events + p.journey;
        return { seat, cards, bonus, tokens, events, journey: p.journey, total, eventCount: p.events.length, leftover: resTotal(p.res) };
    }

    results() {
        return this.players.map(p => this.scoreOf(p.id));
    }

    endGame() {
        this.phase = 'end';
        const results = this.results();
        const key = (r) => [r.total, r.eventCount, r.leftover];
        const better = (a, b) => {
            const ka = key(a);
            const kb = key(b);
            for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
            return 0;
        };
        const best = results.reduce((a, b) => (better(b, a) > 0 ? b : a));
        this.winners = results.filter(r => better(r, best) === 0).map(r => r.seat);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
    }

    // ---- 道具 ----

    emit(event) {
        if (this.sim) return;
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(text) {
        if (this.sim) return;
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    // 選択待ちのない状態を写す（CPU の先読み用。ログと記録は写さない）
    clone() {
        if (this.prompt || this.queue.length > 0) throw new Error('選択待ちの途中は写せません');
        const skip = new Set(['queue', 'promptHandler', 'commands', 'logs', 'events']);
        const data = {};
        Object.keys(this).forEach(key => { if (!skip.has(key)) data[key] = this[key]; });
        const g = Object.assign(Object.create(Game.prototype), structuredClone(data));
        Object.assign(g, { queue: [], promptHandler: null, commands: [], logs: [], events: [], sim: true });
        return g;
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

export { TYPES };
