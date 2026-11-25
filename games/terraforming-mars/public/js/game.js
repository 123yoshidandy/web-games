/**
 * テラフォーミング・マーズ（基本ゲーム、企業時代を除く、2〜5 人）のルール。DOM に依存しない
 *
 * 進み方：最初に企業と手札を選ぶ → 世代ごとに（2 世代目から）研究（4 枚引いて 1 枚 3 M€ で買う）→ 行動（手番に 1〜2 回、パスするまで）
 *   → 生産（電力は熱に。M€ は生産 ＋ TR）→ 温度・酸素・海洋がすべて最大になった世代の終わりに、植物を緑地に変えてから得点
 * カードの効果は手順の列（tasks）に積んで順に行う。タイルの置き場所など入力が要る手順では判断（decision）を出して止まる
 * 操作の入口は applyCommand(seat, command) だけ。断る操作は状態を変えない
 *
 * 操作（command.type）
 *   setup { corp, keep: [カード] }            research { keep: [カード] }
 *   play { card, pay: { steel, titanium, heat } }
 *   standard { project, cards? }             convertPlants {}  convertHeat {}
 *   milestone { key }  award { key }  unmi {}  endTurn {}（1 回目のあと）  pass {}
 *   place { space }   target { seat | null }   choose { index }   finalGreenery { space | null }
 */

import { CARDS, CORPORATIONS, cardOf } from './cards.js';
import {
    SPACES, OFF_MARS, isOnMars, neighbors, RESOURCES, TEMPERATURE, OXYGEN, OCEANS, TEMPERATURE_BONUS, OXYGEN_BONUS, STARTING_TR,
    STANDARD_PROJECTS, PLANTS_FOR_GREENERY, HEAT_FOR_TEMPERATURE, MILESTONES, MILESTONE_COST, AWARDS, AWARD_COSTS
} from './data.js';
import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const CARD_PRICE = 3;

const zero = () => Object.fromEntries(RESOURCES.map(r => [r, 0]));

export default class Game {
    constructor(players, options = {}) {
        const n = players.length;
        if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`${MIN_PLAYERS}〜${MAX_PLAYERS}人で遊びます`);
        const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
        this.options = { ...options, seed };
        this.random = createRandom(seed);
        // 企業時代を入れないので、全員が各資源の生産 1 から始める
        this.players = players.map((p, id) => ({
            id, name: p.name, isCPU: !!p.isCPU, corp: null, tr: STARTING_TR,
            res: zero(), prod: Object.fromEntries(RESOURCES.map(r => [r, 1])), hand: [], played: [], trRaisedThisGen: false, passed: false,
            cardRes: {}, used: []
        }));
        this.temperature = TEMPERATURE.min;
        this.oxygen = 0;
        this.oceans = 0;
        this.tiles = {};
        this.deck = shuffle(CARDS.map(c => c.key), this.random);
        this.discard = [];
        this.milestones = [];
        this.awards = [];
        this.generation = 1;
        this.firstPlayer = 0;
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.tasks = [];
        this.scores = null;
        this.winners = null;
        // 企業 2 社と手札 10 枚を配り、順に選ぶ
        const corps = shuffle(CORPORATIONS.map(c => c.key), this.random);
        this.offers = this.players.map((p, i) => ({ corps: corps.slice(i * 2, i * 2 + 2), cards: this.draw(10) }));
        this.phase = 'setup';
        this.decision = { seat: 0, kind: 'setup', ...this.offers[0] };
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    get n() { return this.players.length; }

    emit(event) {
        this.eventSeq++;
        this.events.push({ seq: this.eventSeq, generation: this.generation, ...event });
    }

    isOver() { return this.phase === 'end'; }

    draw(k) {
        const out = [];
        for (let i = 0; i < k; i++) {
            if (!this.deck.length) {
                if (!this.discard.length) break;
                this.deck = shuffle(this.discard, this.random);
                this.discard = [];
            }
            out.push(this.deck.pop());
        }
        return out;
    }

    // ---------- 調べる ----------

    corpIs(seat, key) { return this.players[seat].corp === key; }

    tags(seat) {
        const p = this.players[seat];
        const counts = {};
        const add = list => list.forEach(t => { counts[t] = (counts[t] ?? 0) + 1; });
        if (p.corp) add(cardOf(p.corp).tags);
        // イベントのタグは、出したあとは数えない
        for (const key of p.played) if (cardOf(key).type !== 'event') add(cardOf(key).tags);
        return counts;
    }

    tilesOf(seat, type) {
        return Object.entries(this.tiles).filter(([, t]) => t.owner === seat && (!type || t.type === type)).map(([id]) => id);
    }

    // 都市の数（火星の外の都市を含む）と、火星の上の都市の数
    cities() { return Object.values(this.tiles).filter(t => t.type === 'city').length; }
    citiesOnMars() { return Object.entries(this.tiles).filter(([id, t]) => t.type === 'city' && isOnMars(id)).length; }

    allMaxed() {
        return this.temperature >= TEMPERATURE.max && this.oxygen >= OXYGEN.max && this.oceans >= OCEANS.max;
    }

    // 温度・酸素・海洋の条件をゆるめる段階（インヴェントリックス・適応技術・特別設計のあとの次の 1 枚で 2 ずつ）
    reqSlack(seat) {
        const p = this.players[seat];
        return (this.corpIs(seat, 'inventrix') ? 2 : 0) + (p.played.includes('adaptationTechnology') ? 2 : 0) + (p.specialDesign ? 2 : 0);
    }

    // 条件を満たすか
    meets(seat, card) {
        const slack = this.reqSlack(seat);
        const tags = this.tags(seat);
        for (const r of card.req ?? []) {
            if (r.tag) { if ((tags[r.tag] ?? 0) < r.count) return false; continue; }
            if (r.greeneries) { if (this.tilesOf(seat, 'greenery').length < r.greeneries) return false; continue; }
            const [[k, v]] = Object.entries(r).filter(([key]) => key !== 'max');
            const now = { temperature: this.temperature, oxygen: this.oxygen, oceans: this.oceans }[k];
            const step = k === 'temperature' ? TEMPERATURE.step * slack : slack;
            if (r.max ? now > v + step : now < v - step) return false;
        }
        return true;
    }

    cardCost(seat, key) {
        const c = cardOf(key);
        let cost = c.cost;
        if (this.corpIs(seat, 'thorgate') && c.tags.includes('power')) cost -= 3;
        // 研究前哨基地：カードの費用 -1。シャトル：宇宙タグのカードの費用 -2
        const p = this.players[seat];
        if (p.played.includes('researchOutpost')) cost -= 1;
        if (p.played.includes('shuttles') && c.tags.includes('space')) cost -= 2;
        return Math.max(0, cost);
    }

    titaniumValue(seat) { return 3 + (this.corpIs(seat, 'phoboLog') ? 1 : 0); }

    // 払える額（M€・鋼鉄・チタン・ヘリオンの熱）
    buyingPower(seat, key) {
        const p = this.players[seat];
        const c = cardOf(key);
        let total = p.res.mc;
        if (c.tags.includes('building')) total += p.res.steel * 2;
        if (c.tags.includes('space')) total += p.res.titanium * this.titaniumValue(seat);
        if (this.corpIs(seat, 'helion')) total += p.res.heat;
        return total;
    }

    // 生産を減らす効果が行えるか（自分の生産は 0 未満にならない。M€ は -5 まで）
    productionOk(seat, production) {
        const p = this.players[seat];
        return Object.entries(production ?? {}).every(([r, v]) => typeof v !== 'number' || p.prod[r] + v >= (r === 'mc' ? -5 : 0));
    }

    // 資源を払う効果（コケの植物 -1 など）が行えるか
    stockOk(seat, stock) {
        const p = this.players[seat];
        return Object.entries(stock ?? {}).every(([r, v]) => typeof v !== 'number' || v >= 0 || p.res[r] + v >= 0);
    }

    canPlay(seat, key) {
        const c = cardOf(key);
        const e = c.effect;
        if (!this.players[seat].hand.includes(key)) return false;
        if (!this.meets(seat, c)) return false;
        if (this.buyingPower(seat, key) < this.cardCost(seat, key)) return false;
        if (!this.productionOk(seat, e.production)) return false;
        // タイルのあとに減らす生産（移民都市は、自分の都市で M€ の生産 +1 が先に入る）
        if (e.productionAfter && !this.productionOk(seat, { ...e.productionAfter, ...(e.productionAfter.mc ? { mc: e.productionAfter.mc + (key === 'immigrantCity' ? 1 : 0) } : {}) })) return false;
        if (!this.stockOk(seat, e.stock)) return false;
        if (e.insulation && this.players[seat].prod.heat < 1) return false;
        // 都市・特別なタイルは、置けるマスがなければ出せない（海洋が最大のときの人工湖は、効果なしで出せる）
        if (e.city && !this.legalSpaces(seat, 'city').length) return false;
        if (e.tile && !(e.tile.type === 'ocean' && this.oceans >= OCEANS.max) && !this.legalSpaces(seat, e.tile.type, { on: e.tile.on }).length) return false;
        return true;
    }

    // タイルを置けるマス。on は特別な置き場所（カードで決まる）
    legalSpaces(seat, tile, { onOceanSpace = false, on = null } = {}) {
        if (on && on in OFF_MARS) return this.tiles[on] ? [] : [on];
        if (on === 'noctis') return SPACES.filter(s => s.reserved && !this.tiles[s.id]).map(s => s.id);
        const free = SPACES.filter(s => !this.tiles[s.id] && !s.reserved);
        if (tile === 'ocean' && on !== 'land') return free.filter(s => s.ocean).map(s => s.id);
        if ((tile === 'greenery' && onOceanSpace) || on === 'oceanSpace') return free.filter(s => s.ocean).map(s => s.id);
        const land = free.filter(s => !s.ocean);
        const around = (s, f) => neighbors(s.id).filter(nb => this.tiles[nb] && f(this.tiles[nb])).length;
        if (on === 'land') return land.map(s => s.id);
        if (on === 'volcanic') return land.filter(s => s.volcanic).map(s => s.id);
        if (on === 'isolated') return land.filter(s => !around(s, () => true)).map(s => s.id);
        if (on === 'mining') return land.filter(s => s.bonus.includes('steel') || s.bonus.includes('titanium')).map(s => s.id);
        if (on === 'nextTo2Cities') return land.filter(s => around(s, t => t.type === 'city') >= 2).map(s => s.id);
        if (tile === 'city') return land.filter(s => !around(s, t => t.type === 'city')).map(s => s.id);
        // 緑地：自分のタイルの隣に置けるなら、そこに置かなければならない
        const mine = this.tilesOf(seat);
        const next = land.filter(s => neighbors(s.id).some(nb => mine.includes(nb)));
        return (next.length ? next : land).map(s => s.id);
    }

    // ---------- 操作 ----------

    applyCommand(seat, command) {
        this.lastError = null;
        const error = this.check(seat, command);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.commands.push({ seat, command: structuredClone(command) });
        this.execute(seat, command);
        return true;
    }

    validKeep(list, from, money) {
        return Array.isArray(list) && new Set(list).size === list.length && list.every(k => from.includes(k)) && list.length * CARD_PRICE <= money;
    }

    check(seat, c) {
        if (this.isOver()) return 'ゲームは終わっています';
        if (!c || typeof c !== 'object') return '操作が正しくありません';
        const d = this.decision;
        if (!d || d.seat !== seat) return 'いまはあなたの番ではありません';
        const p = this.players[seat];
        if (d.kind === 'setup') {
            if (c.type !== 'setup' || !d.corps.includes(c.corp)) return '企業を選んでください';
            return this.validKeep(c.keep, d.cards, cardOf(c.corp).mc) ? null : '買うカードが正しくないか、お金が足りません';
        }
        if (d.kind === 'research') return c.type === 'research' && this.validKeep(c.keep, d.cards, p.res.mc) ? null : '買うカードが正しくないか、お金が足りません';
        if (d.kind === 'place') return c.type === 'place' && d.options.includes(c.space) ? null : 'そこには置けません';
        if (d.kind === 'target') return c.type === 'target' && (d.options.includes(c.seat) || (c.seat === null && d.optional)) ? null : 'その相手は選べません';
        if (d.kind === 'targetCard') return c.type === 'targetCard' && d.options.some(o => o.seat === c.seat && o.card === c.card) ? null : 'そのカードは選べません';
        if (d.kind === 'choose') return c.type === 'choose' && Number.isInteger(c.index) && c.index >= 0 && c.index < d.options.length ? null : '選んでください';
        if (d.kind === 'finalGreenery') return c.type === 'finalGreenery' && (c.space === null || (p.res.plants >= this.greeneryCost(seat) && this.legalSpaces(seat, 'greenery').includes(c.space))) ? null : 'そこには置けません';
        if (d.kind !== 'action') return 'いまはその操作はできません';
        switch (c.type) {
            case 'play': {
                if (!this.canPlay(seat, c.card)) return 'そのカードは出せません';
                const pay = this.normalizePay(seat, c.card, c.pay);
                return pay ? null : '払い方が正しくありません';
            }
            case 'standard': {
                const sp = STANDARD_PROJECTS[c.project];
                if (!sp) return 'その標準プロジェクトはありません';
                if (c.project === 'sellPatents') return Array.isArray(c.cards) && c.cards.length > 0 && new Set(c.cards).size === c.cards.length && c.cards.every(k => p.hand.includes(k)) ? null : '売るカードを選んでください';
                const cost = this.standardCost(seat, c.project);
                if (p.res.mc + (this.corpIs(seat, 'helion') ? p.res.heat : 0) < cost) return 'M€ が足りません';
                if (c.project === 'aquifer' && !this.legalSpaces(seat, 'ocean').length) return '海洋を置けるマスがありません';
                if (c.project === 'aquifer' && this.oceans >= OCEANS.max) return '海洋はもう置けません';
                if (c.project === 'asteroid' && this.temperature >= TEMPERATURE.max) return '温度はもう上がりません';
                if ((c.project === 'city' || c.project === 'greenery') && !this.legalSpaces(seat, c.project).length) return '置けるマスがありません';
                return null;
            }
            case 'convertPlants': return p.res.plants >= this.greeneryCost(seat) && this.legalSpaces(seat, 'greenery').length ? null : '植物が足りません';
            case 'convertHeat': return p.res.heat >= HEAT_FOR_TEMPERATURE && this.temperature < TEMPERATURE.max ? null : '熱が足りないか、温度が最大です';
            case 'milestone': return this.canClaim(seat, c.key) ? null : 'そのマイルストーンは取れません';
            case 'award': return this.canFund(seat, c.key) ? null : 'その褒賞には出資できません';
            case 'unmi': return this.canUnmi(seat) ? null : 'その行動はできません';
            case 'cardAction': return this.canCardAction(seat, c.card, c.variant ?? 0) ? null : 'そのカードの行動はできません';
            case 'endTurn': return d.done >= 1 ? null : '1 回は行動してください';
            case 'pass': return null;
            default: return '操作が正しくありません';
        }
    }

    greeneryCost(seat) { return PLANTS_FOR_GREENERY - (this.corpIs(seat, 'ecoLine') ? 1 : 0); }

    standardCost(seat, project) {
        let cost = STANDARD_PROJECTS[project].cost;
        if (project === 'powerPlant' && this.corpIs(seat, 'thorgate')) cost -= 3;
        return cost;
    }

    canClaim(seat, key) {
        if (!MILESTONES[key] || this.milestones.length >= 3 || this.milestones.some(m => m.key === key)) return false;
        const p = this.players[seat];
        if (p.res.mc < MILESTONE_COST) return false;
        return this.milestoneProgress(seat, key) >= { terraformer: 35, mayor: 3, gardener: 3, builder: 8, planner: 16 }[key];
    }

    milestoneProgress(seat, key) {
        const p = this.players[seat];
        return {
            terraformer: () => p.tr, mayor: () => this.tilesOf(seat, 'city').length, gardener: () => this.tilesOf(seat, 'greenery').length,
            builder: () => this.tags(seat).building ?? 0, planner: () => p.hand.length
        }[key]();
    }

    canFund(seat, key) {
        if (!AWARDS[key] || this.awards.length >= 3 || this.awards.some(a => a.key === key)) return false;
        return this.players[seat].res.mc >= AWARD_COSTS[this.awards.length];
    }

    awardValue(seat, key) {
        const p = this.players[seat];
        return {
            landlord: () => this.tilesOf(seat).length, banker: () => p.prod.mc, scientist: () => this.tags(seat).science ?? 0,
            thermalist: () => p.res.heat, miner: () => p.res.steel + p.res.titanium
        }[key]();
    }

    canUnmi(seat) {
        const p = this.players[seat];
        return this.corpIs(seat, 'unitedNationsMarsInitiative') && p.trRaisedThisGen && !this.unmiUsed?.has(seat) && p.res.mc >= 3;
    }

    // 払い方：指定がなければ、鋼鉄・チタン・熱を多い順に足りるまで使う
    normalizePay(seat, key, pay = {}) {
        const p = this.players[seat];
        const c = cardOf(key);
        const cost = this.cardCost(seat, key);
        const steel = c.tags.includes('building') ? Math.min(pay.steel ?? 0, p.res.steel) : 0;
        const titanium = c.tags.includes('space') ? Math.min(pay.titanium ?? 0, p.res.titanium) : 0;
        const heat = this.corpIs(seat, 'helion') ? Math.min(pay.heat ?? 0, p.res.heat) : 0;
        if ((pay.steel ?? 0) !== steel || (pay.titanium ?? 0) !== titanium || (pay.heat ?? 0) !== heat) return null;
        const mc = Math.max(0, cost - steel * 2 - titanium * this.titaniumValue(seat) - heat);
        if (mc > p.res.mc) return null;
        return { mc, steel, titanium, heat };
    }

    autoPay(seat, key) {
        const p = this.players[seat];
        const c = cardOf(key);
        let left = this.cardCost(seat, key);
        const pay = { steel: 0, titanium: 0, heat: 0 };
        if (c.tags.includes('space')) { pay.titanium = Math.min(p.res.titanium, Math.floor(left / this.titaniumValue(seat))); left -= pay.titanium * this.titaniumValue(seat); }
        if (c.tags.includes('building')) { pay.steel = Math.min(p.res.steel, Math.floor(left / 2)); left -= pay.steel * 2; }
        // M€ が足りなければ、鋼鉄・チタンを 1 つ多く使う（払い過ぎになってもよい）
        if (left > p.res.mc && c.tags.includes('space') && pay.titanium < p.res.titanium) { pay.titanium++; left = Math.max(0, left - this.titaniumValue(seat)); }
        if (left > p.res.mc && c.tags.includes('building') && pay.steel < p.res.steel) { pay.steel++; left = Math.max(0, left - 2); }
        if (left > p.res.mc && this.corpIs(seat, 'helion')) pay.heat = Math.min(p.res.heat, left - p.res.mc);
        return pay;
    }

    execute(seat, c) {
        const d = this.decision;
        switch (d.kind) {
            case 'setup': return this.doSetup(seat, c);
            case 'research': return this.doResearch(seat, c);
            case 'place': return this.resolveInput(() => this.placeTile(seat, d.tile, c.space, d));
            case 'target': return this.resolveInput(() => this.applyTarget(d, c.seat));
            case 'targetCard': return this.resolveInput(() => this.applyTargetCard(d, c));
            case 'choose': return this.resolveInput(() => this.queueEffect(seat, d.options[c.index], true, d.source));
            case 'finalGreenery': return this.doFinalGreenery(seat, c.space);
            default: return this.doAction(seat, c);
        }
    }

    // ---------- 準備・研究 ----------

    doSetup(seat, c) {
        const p = this.players[seat];
        const corp = cardOf(c.corp);
        p.corp = c.corp;
        p.res.mc = corp.mc - c.keep.length * CARD_PRICE;
        for (const [r, v] of Object.entries(corp.stock)) p.res[r] += v;
        for (const [r, v] of Object.entries(corp.production)) p.prod[r] += v;
        p.hand.push(...c.keep);
        this.discard.push(...this.offers[seat].cards.filter(k => !c.keep.includes(k)));
        this.emit({ type: 'corp', seat, corp: c.corp, bought: c.keep.length });
        if (seat + 1 < this.n) {
            this.decision = { seat: seat + 1, kind: 'setup', ...this.offers[seat + 1] };
            return;
        }
        // インヴェントリックスは最初に 3 枚引く。タルシス共和国は最初の行動で都市を置く
        this.players.forEach((q, i) => {
            if (q.corp === 'inventrix') q.hand.push(...this.draw(3));
            if (q.corp === 'tharsisRepublic') this.tharsisFirst = new Set([...(this.tharsisFirst ?? []), i]);
        });
        this.startActions();
    }

    startResearch() {
        this.phase = 'research';
        this.researchOffers = this.players.map(() => this.draw(4));
        this.decision = { seat: this.firstPlayer, kind: 'research', cards: this.researchOffers[this.firstPlayer] };
        this.researchCount = 0;
    }

    doResearch(seat, c) {
        const p = this.players[seat];
        p.res.mc -= c.keep.length * CARD_PRICE;
        p.hand.push(...c.keep);
        this.discard.push(...this.researchOffers[seat].filter(k => !c.keep.includes(k)));
        this.emit({ type: 'research', seat, bought: c.keep.length });
        this.researchCount++;
        if (this.researchCount < this.n) {
            const next = (seat + 1) % this.n;
            this.decision = { seat: next, kind: 'research', cards: this.researchOffers[next] };
            return;
        }
        this.startActions();
    }

    // ---------- 行動 ----------

    startActions() {
        this.phase = 'action';
        this.unmiUsed = new Set();
        this.players.forEach(p => { p.passed = false; });
        this.turnSeat = this.firstPlayer;
        this.beginTurn();
    }

    beginTurn() {
        this.decision = { seat: this.turnSeat, kind: 'action', done: 0 };
        // タルシス共和国の最初の行動：都市を置く
        if (this.tharsisFirst?.has(this.turnSeat)) {
            this.tharsisFirst.delete(this.turnSeat);
            this.decision = null;
            this.actionDone = 0;
            this.tasks = [{ op: 'tile', tile: 'city', seat: this.turnSeat }];
            this.afterTasks = () => this.afterAction(this.turnSeat);
            this.runTasks();
        }
    }

    doAction(seat, c) {
        const p = this.players[seat];
        if (c.type === 'pass') {
            p.passed = true;
            this.emit({ type: 'pass', seat });
            return this.nextTurn();
        }
        if (c.type === 'endTurn') return this.nextTurn();
        this.actionDone = this.decision.done;
        this.decision = null;
        this.tasks = [];
        this.afterTasks = () => this.afterAction(seat);
        switch (c.type) {
            case 'play': this.playCard(seat, c.card, this.normalizePay(seat, c.card, c.pay)); break;
            case 'standard': this.standardProject(seat, c); break;
            case 'convertPlants':
                p.res.plants -= this.greeneryCost(seat);
                this.emit({ type: 'convertPlants', seat });
                this.tasks.push({ op: 'tile', tile: 'greenery', seat });
                break;
            case 'convertHeat':
                p.res.heat -= HEAT_FOR_TEMPERATURE;
                this.emit({ type: 'convertHeat', seat });
                this.tasks.push({ op: 'temperature', steps: 1, seat });
                break;
            case 'milestone':
                p.res.mc -= MILESTONE_COST;
                this.milestones.push({ key: c.key, seat });
                this.emit({ type: 'milestone', seat, key: c.key });
                break;
            case 'award': {
                const cost = AWARD_COSTS[this.awards.length];
                p.res.mc -= cost;
                this.awards.push({ key: c.key, seat });
                this.emit({ type: 'award', seat, key: c.key, cost });
                break;
            }
            case 'cardAction': this.doCardAction(seat, c.card, c.variant ?? 0); break;
            case 'unmi':
                p.res.mc -= 3;
                this.unmiUsed.add(seat);
                this.emit({ type: 'unmi', seat });
                this.tasks.push({ op: 'tr', n: 1, seat });
                break;
            default: break;
        }
        this.runTasks();
    }

    afterAction(seat) {
        if (this.isOver() || this.phase === 'final') return;
        const done = this.actionDone ?? 0;
        if (done + 1 >= 2) return this.nextTurn();
        this.decision = { seat, kind: 'action', done: done + 1 };
    }

    nextTurn() {
        if (this.players.every(p => p.passed)) return this.production();
        let s = this.turnSeat;
        do { s = (s + 1) % this.n; } while (this.players[s].passed);
        this.turnSeat = s;
        this.beginTurn();
    }

    playCard(seat, key, pay) {
        const p = this.players[seat];
        const c = cardOf(key);
        p.res.mc -= pay.mc;
        p.res.steel -= pay.steel;
        p.res.titanium -= pay.titanium;
        p.res.heat -= pay.heat;
        p.hand.splice(p.hand.indexOf(key), 1);
        p.played.push(key);
        this.emit({ type: 'play', seat, card: key, paid: pay });
        if (this.corpIs(seat, 'crediCor') && c.cost >= 20) this.gain(seat, 'mc', 4, 'crediCor');
        if (this.corpIs(seat, 'interplanetaryCinematics') && c.type === 'event') this.gain(seat, 'mc', 2, 'interplanetaryCinematics');
        // 分解者：植物・微生物・動物のタグ 1 つにつき微生物 1。生態系保護区：動物・植物のタグ 1 つにつき動物 1（どちらも出したカード自身を含む）
        const count = list => c.tags.filter(t => list.includes(t)).length;
        if (p.played.includes('decomposers')) this.addRes(seat, 'decomposers', count(['plant', 'microbe', 'animal']));
        if (p.played.includes('ecologicalZone')) this.addRes(seat, 'ecologicalZone', count(['animal', 'plant']));
        // 最適な空力ブレーキ：宇宙タグのイベントで +3 M€・熱 +3
        if (p.played.includes('optimalAerobraking') && c.type === 'event' && c.tags.includes('space')) {
            this.gain(seat, 'mc', 3, 'optimalAerobraking');
            this.gain(seat, 'heat', 3, 'optimalAerobraking');
        }
        // 特別設計：この世代に次に出すカード 1 枚だけ、条件をゆるめる
        if (key === 'specialDesign') p.specialDesign = true;
        else delete p.specialDesign;
        this.queueEffect(seat, c.effect, false, key);
    }

    // 効果を手順の列にする（順番：生産 → 資源 → グローバル → TR → タイル → 相手への効果 → カードを引く）
    queueEffect(seat, e, front = false, source = null) {
        const list = [];
        if (e.or) list.push({ op: 'choose', seat, options: e.or, source });
        else this.effectTasks(seat, e, list, source);
        if (front) this.tasks.unshift(...list);
        else this.tasks.push(...list);
    }

    effectTasks(seat, e, tasks, source = null) {
        // 捕食動物・アリ：先にほかのカードから取り除き、そのあと自分に載せる
        if (e.removeAny) tasks.push({ op: 'removeAny', seat, type: e.removeAny.type, source });
        if (e.addHere) tasks.push({ op: 'addHere', seat, card: source, n: e.addHere });
        if (e.production) tasks.push({ op: 'production', seat, delta: e.production });
        if (e.stock) tasks.push({ op: 'stock', seat, delta: e.stock });
        if (e.global?.temperature) tasks.push({ op: 'temperature', steps: e.global.temperature, seat });
        if (e.global?.oxygen) tasks.push({ op: 'oxygen', steps: e.global.oxygen, seat });
        if (e.tr) tasks.push({ op: 'tr', n: e.tr, seat });
        for (let i = 0; i < (e.ocean ?? 0); i++) tasks.push({ op: 'tile', tile: 'ocean', seat, ...(e.flood ? { flood: true } : {}) });
        if (e.city) tasks.push({ op: 'tile', tile: 'city', seat });
        if (e.greenery) tasks.push({ op: 'tile', tile: 'greenery', seat, onOceanSpace: !!e.greenery.onOceanSpace });
        if (e.tile) tasks.push({ op: 'tile', tile: e.tile.type, on: e.tile.on, card: source, seat });
        if (e.productionAfter) tasks.push({ op: 'production', seat, delta: e.productionAfter });
        if (e.decreaseAnyProduction) tasks.push({ op: 'decreaseAny', seat, ...e.decreaseAnyProduction });
        if (e.removeAnyPlants) tasks.push({ op: 'removePlants', seat, n: e.removeAnyPlants });
        if (e.draw) tasks.push({ op: 'draw', seat, n: e.draw });
        for (const a of [e.addAny ?? []].flat()) tasks.push({ op: 'addAny', seat, type: a.type, count: a.count, source });
        if (e.searchForLife) tasks.push({ op: 'searchForLife', seat });
        if (e.plantsOr) tasks.push({ op: 'plantsOr', seat, ...e.plantsOr, source });
        if (e.insulation) tasks.push({ op: 'insulation', seat, source });
    }

    standardProject(seat, c) {
        const p = this.players[seat];
        if (c.project === 'sellPatents') {
            for (const k of c.cards) p.hand.splice(p.hand.indexOf(k), 1);
            this.discard.push(...c.cards);
            p.res.mc += c.cards.length;
            this.emit({ type: 'standard', seat, project: 'sellPatents', n: c.cards.length });
            return;
        }
        const cost = this.standardCost(seat, c.project);
        const fromMc = Math.min(p.res.mc, cost);
        p.res.mc -= fromMc;
        p.res.heat -= cost - fromMc;
        this.emit({ type: 'standard', seat, project: c.project });
        if (this.corpIs(seat, 'crediCor') && STANDARD_PROJECTS[c.project].cost >= 20) this.gain(seat, 'mc', 4, 'crediCor');
        ({
            powerPlant: () => this.tasks.push({ op: 'production', seat, delta: { energy: 1 } }),
            asteroid: () => this.tasks.push({ op: 'temperature', steps: 1, seat }),
            aquifer: () => this.tasks.push({ op: 'tile', tile: 'ocean', seat }),
            greenery: () => this.tasks.push({ op: 'tile', tile: 'greenery', seat }),
            city: () => this.tasks.push({ op: 'tile', tile: 'city', seat }, { op: 'production', seat, delta: { mc: 1 } })
        })[c.project]();
    }

    // ---------- 手順の列 ----------

    runTasks() {
        while (this.tasks.length) {
            const t = this.tasks.shift();
            if (this.runTask(t) === false) return;
        }
        const after = this.afterTasks;
        this.afterTasks = null;
        after?.();
    }

    resolveInput(fn) {
        this.decision = null;
        fn();
        this.runTasks();
    }

    gain(seat, r, n, reason) {
        this.players[seat].res[r] += n;
        this.emit({ type: 'gain', seat, resource: r, n, reason });
    }

    raiseTr(seat, n, reason) {
        const p = this.players[seat];
        p.tr += n;
        if (n > 0) p.trRaisedThisGen = true;
        this.emit({ type: 'tr', seat, n, reason });
    }

    // 数で決まる値（都市の数・自分のタグの数）を数える
    amount(seat, v) {
        if (typeof v === 'number') return v;
        if (v.count === 'cities') return this.cities();
        if (v.count === 'citiesOnMars') return this.citiesOnMars();
        // 窒素の豊富な小惑星：そのタグが min 以上なら then、なければ else
        if (v.count === 'tagAtLeast') return (this.tags(seat)[v.tag] ?? 0) >= v.min ? v.then : v.else;
        return Math.floor((this.tags(seat)[v.tag] ?? 0) / v.per);
    }

    runTask(t) {
        const p = this.players[t.seat];
        switch (t.op) {
            case 'production': {
                const delta = Object.fromEntries(Object.entries(t.delta).map(([r, v]) => [r, this.amount(t.seat, v)]));
                for (const [r, v] of Object.entries(delta)) p.prod[r] += v;
                this.emit({ type: 'production', seat: t.seat, delta });
                return true;
            }
            case 'stock': {
                const delta = Object.fromEntries(Object.entries(t.delta).map(([r, v]) => [r, this.amount(t.seat, v)]));
                for (const [r, v] of Object.entries(delta)) p.res[r] += v;
                this.emit({ type: 'stock', seat: t.seat, delta });
                return true;
            }
            case 'tr':
                this.raiseTr(t.seat, t.n, 'card');
                return true;
            case 'draw':
                p.hand.push(...this.draw(t.n));
                this.emit({ type: 'draw', seat: t.seat, n: t.n });
                return true;
            case 'temperature':
                for (let i = 0; i < t.steps; i++) {
                    if (this.temperature >= TEMPERATURE.max) break;
                    this.temperature += TEMPERATURE.step;
                    this.raiseTr(t.seat, 1, 'temperature');
                    this.emit({ type: 'temperature', seat: t.seat, value: this.temperature });
                    const bonus = TEMPERATURE_BONUS[this.temperature];
                    if (bonus === 'heatProduction') { p.prod.heat += 1; this.emit({ type: 'bonus', seat: t.seat, what: 'heatProduction' }); }
                    if (bonus === 'ocean') this.tasks.unshift({ op: 'tile', tile: 'ocean', seat: t.seat });
                }
                return true;
            case 'oxygen':
                for (let i = 0; i < t.steps; i++) {
                    if (this.oxygen >= OXYGEN.max) break;
                    this.oxygen += 1;
                    this.raiseTr(t.seat, 1, 'oxygen');
                    this.emit({ type: 'oxygen', seat: t.seat, value: this.oxygen });
                    if (OXYGEN_BONUS[this.oxygen] === 'temperature') this.tasks.unshift({ op: 'temperature', steps: 1, seat: t.seat });
                }
                return true;
            case 'tile': {
                if (t.tile === 'ocean' && this.oceans >= OCEANS.max) return true;
                const options = this.legalSpaces(t.seat, t.tile, { onOceanSpace: t.onOceanSpace, on: t.on });
                if (!options.length) return true;
                // 置き場所が決まっているもの（ノクティス・火星の外）は、選ばずに置く
                if (['noctis', ...Object.keys(OFF_MARS)].includes(t.on)) {
                    this.placeTile(t.seat, t.tile, options[0], t);
                    return true;
                }
                this.decision = { seat: t.seat, kind: 'place', tile: t.tile, options, ...(t.card ? { card: t.card } : {}), ...(t.flood ? { flood: true } : {}) };
                return false;
            }
            case 'choose':
                this.decision = { seat: t.seat, kind: 'choose', options: t.options, source: t.source };
                return false;
            case 'addHere':
                this.addRes(t.seat, t.card, t.n);
                return true;
            case 'addAny': {
                // 自分のカードで、その資源を載せられるもの（行動の「ほかのカード」は、行動のカード自身を除く）
                const options = p.played.filter(k => cardOf(k).resource === t.type && k !== t.source).map(card => ({ seat: t.seat, card }));
                if (!options.length) return true;
                if (options.length === 1) { this.addRes(t.seat, options[0].card, t.count); return true; }
                this.decision = { seat: t.seat, kind: 'targetCard', what: 'add', type: t.type, count: t.count, options };
                return false;
            }
            case 'removeAny': {
                const options = this.removable(t.type).filter(o => !(o.seat === t.seat && o.card === t.source));
                if (!options.length) return true;
                this.decision = { seat: t.seat, kind: 'targetCard', what: 'remove', type: t.type, count: 1, options };
                return false;
            }
            case 'searchForLife': {
                const [top] = this.draw(1);
                if (!top) return true;
                this.discard.push(top);
                const hit = cardOf(top).tags.includes('microbe');
                this.emit({ type: 'searchForLife', seat: t.seat, card: top, hit });
                if (hit) this.addRes(t.seat, 'searchForLife', 1);
                return true;
            }
            // 植物を得るか、ほかのカードに資源を載せるか（載せられるカードがなければ植物）
            case 'plantsOr': {
                const options = [{ stock: { plants: t.plants } }, ...t.add.filter(a => p.played.some(k => cardOf(k).resource === a.type && k !== t.source)).map(a => ({ addAny: a }))];
                if (options.length === 1) { this.queueEffect(t.seat, options[0], true, t.source); return true; }
                this.decision = { seat: t.seat, kind: 'choose', options, source: t.source };
                return false;
            }
            // 断熱：熱の生産を 1 以上好きなだけ減らし、同じだけ M€ の生産を増やす
            case 'insulation': {
                const options = Array.from({ length: p.prod.heat }, (_, i) => ({ production: { heat: -(i + 1), mc: i + 1 } }));
                if (!options.length) return true;
                this.decision = { seat: t.seat, kind: 'choose', options, source: t.source };
                return false;
            }
            // 洪水：置いた海洋の隣のタイルの持ち主（自分を除く）1 人から 4 M€ を取り除いてよい
            case 'flood':
                this.decision = { seat: t.seat, kind: 'target', what: 'removeMc', count: 4, options: t.options, optional: true };
                return false;
            case 'decreaseAny': {
                const options = this.players.filter(o => o.prod[t.resource] >= (t.resource === 'mc' ? -5 + t.count : t.count)).map(o => o.id);
                if (!options.length) return true;
                this.decision = { seat: t.seat, kind: 'target', what: 'decreaseProduction', resource: t.resource, count: t.count, options, optional: false };
                return false;
            }
            case 'removePlants': {
                const options = this.players.filter(o => o.res.plants > 0).map(o => o.id);
                if (!options.length) return true;
                this.decision = { seat: t.seat, kind: 'target', what: 'removePlants', count: t.n, options, optional: true };
                return false;
            }
            default:
                return true;
        }
    }

    addRes(seat, card, n) {
        if (n <= 0) return;
        const p = this.players[seat];
        p.cardRes[card] = (p.cardRes[card] ?? 0) + n;
        this.emit({ type: 'addResource', seat, card, n });
    }

    // 取り除ける資源（ペットの動物は取り除けない）
    removable(type) {
        return this.players.flatMap(q => q.played.filter(k => cardOf(k).resource === type && (q.cardRes[k] ?? 0) > 0 && k !== 'pets').map(card => ({ seat: q.id, card })));
    }

    applyTargetCard(d, c) {
        const q = this.players[c.seat];
        if (d.what === 'add') return this.addRes(c.seat, c.card, d.count);
        q.cardRes[c.card] -= d.count;
        this.emit({ type: 'removeResource', seat: d.seat, target: c.seat, card: c.card, n: d.count });
    }

    // 生命探査の行動は、本家の実装では自前の処理なので、ここで形にする（1 M€ で山札の一番上をめくる）
    actionOf(key) {
        if (key === 'searchForLife') return { spend: { mc: 1 }, effect: { searchForLife: true } };
        return cardOf(key).action ?? null;
    }

    actionVariants(key) {
        const a = this.actionOf(key);
        return a ? (a.or ?? [a]) : [];
    }

    // 行動の支払い（M€ は、許されていれば鋼鉄・チタンでも）
    actionPay(seat, v) {
        const p = this.players[seat];
        let left = v.spend?.mc ?? 0;
        const pay = { mc: 0, steel: 0, titanium: 0 };
        if (v.titanium) { pay.titanium = Math.min(p.res.titanium, Math.floor(left / this.titaniumValue(seat))); left -= pay.titanium * this.titaniumValue(seat); }
        if (v.steel) { pay.steel = Math.min(p.res.steel, Math.floor(left / 2)); left -= pay.steel * 2; }
        if (left > p.res.mc && v.titanium && pay.titanium < p.res.titanium) { pay.titanium++; left = Math.max(0, left - this.titaniumValue(seat)); }
        if (left > p.res.mc && v.steel && pay.steel < p.res.steel) { pay.steel++; left = Math.max(0, left - 2); }
        pay.mc = left;
        return pay.mc <= p.res.mc ? pay : null;
    }

    canCardAction(seat, key, variant) {
        const p = this.players[seat];
        if (!p.played.includes(key) || p.used.includes(key)) return false;
        const v = this.actionVariants(key)[variant];
        if (!v) return false;
        if (!this.actionPay(seat, v)) return false;
        if ((v.spend?.energy ?? 0) > p.res.energy) return false;
        if ((v.spend?.here ?? 0) > (p.cardRes[key] ?? 0)) return false;
        const e = v.effect;
        if (!this.productionOk(seat, e.production)) return false;
        if (e.removeAny && !this.removable(e.removeAny.type).some(o => !(o.seat === seat && o.card === key))) return false;
        if (e.ocean && (this.oceans >= OCEANS.max || !this.legalSpaces(seat, 'ocean').length)) return false;
        if (e.addAny && !p.played.some(k => cardOf(k).resource === e.addAny.type && k !== key)) return false;
        return true;
    }

    doCardAction(seat, key, variant) {
        const p = this.players[seat];
        const v = this.actionVariants(key)[variant];
        const pay = this.actionPay(seat, v);
        p.res.mc -= pay.mc;
        p.res.steel -= pay.steel;
        p.res.titanium -= pay.titanium;
        p.res.energy -= v.spend?.energy ?? 0;
        if (v.spend?.here) p.cardRes[key] -= v.spend.here;
        p.used.push(key);
        this.emit({ type: 'cardAction', seat, card: key });
        this.queueEffect(seat, v.effect, false, key);
    }

    applyTarget(d, target) {
        if (d.what === 'decreaseProduction') {
            this.players[target].prod[d.resource] -= d.count;
            this.emit({ type: 'decreaseProduction', seat: d.seat, target, resource: d.resource, n: d.count });
            return;
        }
        if (target === null) return;
        if (d.what === 'removeMc') {
            const k = Math.min(d.count, this.players[target].res.mc);
            this.players[target].res.mc -= k;
            this.emit({ type: 'removeMc', seat: d.seat, target, n: k });
            return;
        }
        const k = Math.min(d.count, this.players[target].res.plants);
        this.players[target].res.plants -= k;
        this.emit({ type: 'removePlants', seat: d.seat, target, n: k });
    }

    // タイルを置く。from はカードで置くときの手順か判断（card：置いたカード、flood：洪水）
    placeTile(seat, tile, space, from = {}) {
        const owner = tile === 'ocean' ? null : seat;
        this.tiles[space] = { type: tile, owner, ...(from.card ? { card: from.card } : {}) };
        this.emit({ type: 'tile', seat, tile, space, ...(from.card ? { card: from.card } : {}) });
        const bonus = SPACES.find(x => x.id === space)?.bonus ?? [];
        const p = this.players[seat];
        // 配置ボーナス
        for (const b of bonus) {
            if (b === 'card') { p.hand.push(...this.draw(1)); this.emit({ type: 'draw', seat, n: 1 }); } else p.res[b] += 1;
        }
        // 採掘ギルド：鋼鉄かチタンの配置ボーナスを得たら、1 回の配置につき鋼鉄の生産 +1
        if (this.corpIs(seat, 'miningGuild') && bonus.some(b => b === 'steel' || b === 'titanium')) p.prod.steel += 1;
        if (bonus.length) this.emit({ type: 'placementBonus', seat, bonus });
        // 採掘権：そのマスの鋼鉄（なければチタン）の生産 +1
        if (from.card === 'miningRights') {
            const r = bonus.includes('steel') ? 'steel' : 'titanium';
            p.prod[r] += 1;
            this.emit({ type: 'production', seat, delta: { [r]: 1 } });
        }
        const oceansNext = neighbors(space).filter(nb => this.tiles[nb]?.type === 'ocean').length;
        if (oceansNext) this.gain(seat, 'mc', 2 * oceansNext, 'ocean');
        if (tile === 'ocean') {
            this.oceans++;
            this.raiseTr(seat, 1, 'ocean');
            // 極地の藻類：だれかが海洋を置くたびに植物 +2
            this.players.forEach((q, i) => { if (q.played.includes('arcticAlgae')) this.gain(i, 'plants', 2, 'arcticAlgae'); });
        }
        if (from.flood && tile === 'ocean') {
            const owners = [...new Set(neighbors(space).map(nb => this.tiles[nb]?.owner).filter(o => o !== null && o !== undefined && o !== seat))];
            if (owners.length) this.tasks.unshift({ op: 'flood', seat, options: owners.sort() });
        }
        if (tile === 'greenery') this.tasks.unshift({ op: 'oxygen', steps: 1, seat });
        if (tile === 'greenery' && p.played.includes('herbivores')) this.addRes(seat, 'herbivores', 1);
        if (tile === 'city') this.cityPlaced(seat, space);
    }

    // 都市が置かれたときの誘発（火星の外の都市を含む）
    cityPlaced(seat, space) {
        this.players.forEach((q, i) => {
            if (q.played.includes('pets')) this.addRes(i, 'pets', 1);
            // 探査車の製造：+2 M€。移民都市：M€ の生産 +1（どちらも、だれの都市でも）
            if (q.played.includes('roverConstruction')) this.gain(i, 'mc', 2, 'roverConstruction');
            if (q.played.includes('immigrantCity')) {
                q.prod.mc += 1;
                this.emit({ type: 'production', seat: i, delta: { mc: 1 } });
            }
            // タルシス共和国：火星の上の都市で M€ の生産 +1。自分の都市なら +3 M€
            if (q.corp === 'tharsisRepublic') {
                if (isOnMars(space)) q.prod.mc += 1;
                if (i === seat) this.gain(i, 'mc', 3, 'tharsisRepublic');
            }
        });
    }

    // ---------- 生産と世代の終わり ----------

    production() {
        this.phase = 'production';
        for (const p of this.players) {
            p.res.heat += p.res.energy;
            p.res.energy = 0;
            p.res.mc += p.prod.mc + p.tr;
            for (const r of ['steel', 'titanium', 'plants', 'energy', 'heat']) p.res[r] += p.prod[r];
            p.trRaisedThisGen = false;
            p.used = [];
            delete p.specialDesign;
        }
        this.emit({ type: 'production' });
        if (this.allMaxed()) return this.startFinal();
        this.generation++;
        this.firstPlayer = (this.firstPlayer + 1) % this.n;
        this.emit({ type: 'generation' });
        this.startResearch();
    }

    // 最後に、植物で緑地を置ける（先手から順に）
    startFinal() {
        this.phase = 'final';
        this.finalQueue = this.players.map((_, i) => (this.firstPlayer + i) % this.n);
        this.nextFinal();
    }

    nextFinal() {
        while (this.finalQueue.length) {
            const seat = this.finalQueue[0];
            if (this.players[seat].res.plants >= this.greeneryCost(seat) && this.legalSpaces(seat, 'greenery').length) {
                this.decision = { seat, kind: 'finalGreenery', options: this.legalSpaces(seat, 'greenery') };
                return;
            }
            this.finalQueue.shift();
        }
        this.finish();
    }

    doFinalGreenery(seat, space) {
        if (space === null) {
            this.finalQueue.shift();
            return this.nextFinal();
        }
        const p = this.players[seat];
        p.res.plants -= this.greeneryCost(seat);
        // 最後の緑地では酸素は上がらない（すべて最大なので）。タイルとボーナスだけ
        this.decision = null;
        this.placeTile(seat, 'greenery', space);
        this.tasks = [];
        this.nextFinal();
    }

    // ---------- 得点 ----------

    cardVp(seat) {
        const p = this.players[seat];
        return p.played.reduce((s, k) => {
            const vp = cardOf(k).vp;
            if (typeof vp === 'number') return s + vp;
            if (vp?.cities) return s + Math.floor(this.cities() / vp.per);
            if (vp?.resources) return s + Math.floor((p.cardRes[k] ?? 0) / vp.per);
            if (vp?.tag) return s + Math.floor((this.tags(seat)[vp.tag] ?? 0) / vp.per);
            if (vp?.searchForLife) return s + ((p.cardRes[k] ?? 0) > 0 ? 3 : 0);
            // 首都：隣の海洋 1 つにつき 1 点
            if (vp?.oceansNextTo) {
                const at = Object.keys(this.tiles).find(id => this.tiles[id].card === k && this.tiles[id].owner === seat);
                return s + (at ? neighbors(at).filter(nb => this.tiles[nb]?.type === 'ocean').length : 0);
            }
            return s;
        }, 0);
    }

    awardPoints() {
        const pts = this.players.map(() => 0);
        for (const a of this.awards) {
            const values = this.players.map((_, i) => this.awardValue(i, a.key));
            const best = Math.max(...values);
            const firsts = values.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
            firsts.forEach(i => { pts[i] += 5; });
            // 2 位は、1 位がひとりのときだけ（2 人のときは 2 位なし）
            if (firsts.length === 1 && this.n > 2) {
                const second = Math.max(...values.filter((v, i) => i !== firsts[0]));
                values.forEach((v, i) => { if (i !== firsts[0] && v === second) pts[i] += 2; });
            }
        }
        return pts;
    }

    score(seat, awardPts) {
        const p = this.players[seat];
        const greenery = this.tilesOf(seat, 'greenery').length;
        const city = this.tilesOf(seat, 'city').reduce((s, id) => s + neighbors(id).filter(nb => this.tiles[nb]?.type === 'greenery').length, 0);
        const milestones = this.milestones.filter(m => m.seat === seat).length * 5;
        const cards = this.cardVp(seat);
        const total = p.tr + milestones + awardPts[seat] + greenery + city + cards;
        return { tr: p.tr, milestones, awards: awardPts[seat], greenery, city, cards, total, mc: p.res.mc };
    }

    finish() {
        this.phase = 'end';
        this.decision = null;
        const awardPts = this.awardPoints();
        this.scores = this.players.map((_, i) => this.score(i, awardPts));
        const best = Math.max(...this.scores.map(s => s.total));
        const top = this.scores.map((_, i) => i).filter(i => this.scores[i].total === best);
        // 同点なら M€ の多い人
        const mc = Math.max(...top.map(i => this.scores[i].mc));
        this.winners = top.filter(i => this.scores[i].mc === mc);
        this.emit({ type: 'end', winners: this.winners });
    }
}
