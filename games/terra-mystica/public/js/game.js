/**
 * テラミスティカ（Terra Mystica）のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる
 * 状態はすべて this.state（JSON にできる素のオブジェクト）に持つ。隠す情報はない
 *
 * 操作の入口は applyCommand(seat, command) だけ。断る操作は状態を変えない（判定を先にすべて行う）
 *
 * ルールは基本セットに合わせた。割り切った点
 * - 地形の変換は「自分の地形へ近づける」向きだけ（ほかの人の地形に変えて邪魔する手は使えない）
 * - 人魚の町は、川1マスをはさんだ自分の建物どうしを、自動でつながっているとみなす
 * - 魔力のもらいは、建てた手番の直後に、手番の順で1人ずつ決める
 */

import {
    TERRAINS, FACTIONS, CULTS, CULT_POWER, PRIEST_SPOTS, BUILDING_INFO, UPGRADE_FROM, POWER_ACTIONS, BONUS_CARDS,
    FAVOR_TILES, TOWN_TILES, TOWN_COUNT, SCORE_TILES, ROUNDS, START_VP, MAX_PRIESTS, MAX_BRIDGES, TOWN_POWER,
    NETWORK_VP, CULT_VP, SHIP_COST, DIG_VP, CULT_INFO, TERRAIN_INFO, RESOURCE_NAMES
} from './data.js';
import { HEXES, ADJ, LAND, RIVER_DIST, hexDistance, BRIDGE_KEYS, bridgeKey, wheelDistance, stepToward } from './map.js';
import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const MAX_LOGS = 300;
const MAX_EVENTS = 200;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    place: ['hex'], bonus: ['id'],
    build: ['hex'], transform: ['hex', 'full'], upgrade: ['hex', 'to'], ship: [], dig: [], priest: ['track', 'steps'],
    power: ['id', 'bridge'], special: ['id', 'track', 'hex', 'bridge'], pass: ['bonus'],
    convert: ['kind', 'n'], done: [], favor: ['id'], town: ['id'], leech: ['accept'], cultist: ['track'], darklings: ['n']
};

// 交換（いつでもできる。手番を使わない）
export const CONVERSIONS = {
    'PW>P': { from: { PW: 5 }, to: { P: 1 }, text: '魔力5 → 司祭1' },
    'PW>W': { from: { PW: 3 }, to: { W: 1 }, text: '魔力3 → 職人1' },
    'PW>C': { from: { PW: 1 }, to: { C: 1 }, text: '魔力1 → コイン1' },
    'P>W': { from: { P: 1 }, to: { W: 1 }, text: '司祭1 → 職人1' },
    'W>C': { from: { W: 1 }, to: { C: 1 }, text: '職人1 → コイン1' },
    burn: { text: '魔力を燃やす（2つ目の器の2つを捨て、1つを3つ目へ）' },
    'VP>C': { from: { VP: 1 }, to: { C: 1 }, only: 'alchemists', text: '勝利点1 → コイン1' },
    'C>VP': { from: { C: 2 }, to: { VP: 1 }, only: 'alchemists', text: 'コイン2 → 勝利点1' }
};

// 鋤1つの職人の数（鋤の段ごと）
const SPADE_WORKERS = [3, 2, 1];

// 勢力の特別な行動（要塞で使えるようになる）
export const SPECIALS = {
    BON1: { name: '鋤1（ボーナスカード）' },
    BON2: { name: '宗教の段＋1（ボーナスカード）' },
    FAV6: { name: '宗教の段＋1（恩恵タイル）' },
    ACTA: { name: '宗教の段＋2（森の賢者）', faction: 'auren' },
    ACTG: { name: '鋤2（巨人）', faction: 'giants' },
    ACTN: { name: '砂嵐（遊牧民）', faction: 'nomads' },
    ACTW: { name: '魔女の飛行', faction: 'witches' },
    ACTS: { name: '交易所に無料で改良（群れの民）', faction: 'swarmlings' },
    ACTC: { name: '2回行動（混沌の魔術師）', faction: 'chaosmagicians' },
    ACTE: { name: '橋（職人2）', faction: 'engineers', repeat: true }
};

const sum = (list) => list.reduce((a, b) => a + b, 0);
const addCost = (a, b) => {
    const out = { ...a };
    Object.entries(b ?? {}).forEach(([k, v]) => { out[k] = (out[k] ?? 0) + v; });
    return out;
};
export const costText = (cost) => {
    const parts = Object.entries(cost ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${RESOURCE_NAMES[k]}${v}`);
    return parts.length ? parts.join('・') : '無料';
};

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, factions: [勢力の id（席の順。null は乱数で決める）] }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const random = createRandom(seed);
        // 勢力は別の乱数で選ぶ（記録には選んだ勢力が入るので、再現のときに本体の乱数の進みがずれないように）
        const factions = pickFactions(players.length, options.factions ?? [], createRandom((seed ^ 0x5BD1E995) >>> 0));
        this.options = { seed, factions: [...factions] };
        this.commands = [];
        this.lastError = null;
        const scoreTiles = (() => {
            for (;;) {
                const list = shuffle(Object.keys(SCORE_TILES), random).slice(0, ROUNDS);
                if (list[4] !== 'SCORE1' && list[5] !== 'SCORE1') return list;
            }
        })();
        const bonusIds = shuffle(Object.keys(BONUS_CARDS), random).slice(0, players.length + 3).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
        const start = Math.floor(random() * players.length);
        const order = players.map((_, i) => (start + i) % players.length);
        const s = {
            round: 0,
            phase: 'setup',
            players: players.map((p, id) => newPlayer(id, p, factions[id])),
            hexes: HEXES.map(h => ({ terrain: h.terrain, owner: null, building: null, town: 0 })),
            bridges: [],
            scoreTiles,
            bonusPool: Object.fromEntries(bonusIds.map(id => [id, 0])),
            favorPool: Object.fromEntries(Object.entries(FAVOR_TILES).map(([id, f]) => [id, f.count])),
            townPool: Object.fromEntries(Object.keys(TOWN_TILES).map(id => [id, TOWN_COUNT])),
            powerUsed: {},
            cultSpots: Object.fromEntries(CULTS.map(c => [c, [null, null, null, null]])),
            order,
            passOrder: [],
            current: null,
            turnDone: false,
            queue: [],
            setup: setupSequence(order, factions),
            townSeq: 0,
            leechSeq: 0,
            winners: [],
            final: null,
            logs: [],
            events: [],
            eventSeq: 0,
            lastTurn: null
        };
        this.state = s;
        this.log(`手番の順：${order.map(seat => this.pname(seat)).join('→')}`);
        this.log('最初の住居を置きます');
    }

    // 状態から作る（画面の試し打ちと CPU の先読みに使う。記録は持たない）
    static fromState(state, options = {}) {
        const game = Object.create(Game.prototype);
        game.state = structuredClone(state);
        game.options = { ...options };
        game.commands = [];
        game.lastError = null;
        return game;
    }

    clone() {
        const { logs, events, ...rest } = this.state;
        const game = Game.fromState({ ...rest, logs: [], events: [] }, this.options);
        game.quiet = true;
        return game;
    }

    get players() {
        return this.state.players;
    }

    isOver() {
        return this.state.phase === 'end';
    }

    // 今操作が必要な人
    actors() {
        const s = this.state;
        if (s.phase === 'end') return [];
        if (s.queue.length > 0) return [s.queue[0].seat];
        if (s.phase === 'setup') return [s.setup[0].seat];
        if (s.phase === 'actions') return [s.current];
        return [];
    }

    // 今、何を待っているか（画面と CPU 用）
    waiting() {
        const s = this.state;
        if (s.phase === 'end') return null;
        if (s.queue.length > 0) return { ...s.queue[0] };
        if (s.phase === 'setup') return { ...s.setup[0] };
        return { kind: 'action', seat: s.current };
    }

    // seat のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    applyCommand(seat, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.players[seat]) return this.fail('参加していません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.actors().includes(seat)) return this.fail('あなたの番ではありません');
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { if (command[key] !== undefined) recorded[key] = command[key]; });
        if (!validFields(recorded)) return this.fail('操作が正しくありません');
        const ok = this.dispatch(seat, recorded);
        if (!ok) return false;
        this.commands.push({ playerId: seat, command: recorded });
        this.settle();
        return true;
    }

    dispatch(seat, c) {
        const s = this.state;
        const w = this.waiting();
        if (c.type === 'convert') return this.doConvert(seat, c.kind, c.n ?? 1);
        if (s.phase === 'setup') {
            if (w.kind === 'place' && c.type === 'place') return this.doPlace(seat, c.hex);
            if (w.kind === 'bonus' && c.type === 'bonus') return this.doSetupBonus(seat, c.id);
            return this.fail('今はその操作はできません');
        }
        if (w.kind !== 'action') {
            const handlers = {
                spades: { transform: () => this.doPendingTransform(seat, c.hex, !!c.full), build: () => this.doPendingBuild(seat, c.hex), done: () => this.doDone(seat) },
                favor: { favor: () => this.doFavor(seat, c.id) },
                town: { town: () => this.doTown(seat, c.id) },
                leech: { leech: () => this.doLeech(seat, !!c.accept) },
                cultist: { cultist: () => this.doCultist(seat, c.track) },
                darklings: { darklings: () => this.doDarklings(seat, c.n ?? 0) }
            }[w.kind];
            const handler = handlers?.[c.type];
            if (!handler) return this.fail('先に、出ている選択に答えてください');
            return handler();
        }
        const main = {
            build: () => this.doBuild(seat, c.hex),
            transform: () => this.doTransformAction(seat, c.hex),
            upgrade: () => this.doUpgrade(seat, c.hex, c.to),
            ship: () => this.doShip(seat),
            dig: () => this.doDig(seat),
            priest: () => this.doPriest(seat, c.track, c.steps),
            power: () => this.doPower(seat, c.id, c.bridge),
            special: () => this.doSpecial(seat, c),
            pass: () => this.doPass(seat, c.bonus)
        }[c.type];
        if (!main) return this.fail('今はその操作はできません');
        return main();
    }

    // ---- 道具 ----

    pname(seat) {
        return FACTIONS[this.players[seat].faction].name;
    }

    fac(seat) {
        return FACTIONS[this.players[seat].faction];
    }

    home(seat) {
        return this.fac(seat).terrain;
    }

    log(text) {
        if (this.quiet) return;
        const logs = this.state.logs;
        logs.push(text);
        if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    }

    emit(event) {
        if (this.quiet) return;
        const s = this.state;
        s.events.push({ seq: ++s.eventSeq, ...event });
        if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    // ---- 資源 ----

    canPay(seat, cost) {
        const p = this.players[seat];
        return Object.entries(cost).every(([k, v]) => {
            if (!v) return true;
            if (k === 'PW') return p.power[2] >= v;
            if (k === 'VP') return p.res.VP >= v;
            return (p.res[k] ?? 0) >= v;
        });
    }

    pay(seat, cost) {
        const p = this.players[seat];
        Object.entries(cost).forEach(([k, v]) => {
            if (!v) return;
            if (k === 'PW') {
                p.power[2] -= v;
                p.power[0] += v;
            } else {
                p.res[k] -= v;
            }
        });
    }

    gain(seat, gain) {
        const p = this.players[seat];
        Object.entries(gain).forEach(([k, v]) => {
            if (!v) return;
            if (k === 'PW') this.gainPower(seat, v);
            else if (k === 'P') p.res.P = Math.min(this.maxPriests(seat), p.res.P + v);
            else p.res[k] = (p.res[k] ?? 0) + v;
        });
    }

    maxPriests(seat) {
        return MAX_PRIESTS - this.players[seat].priestsOnCult;
    }

    // 魔力を得る。1つ目の器から2つ目へ、それから2つ目から3つ目へ動かす。動いた数を返す
    gainPower(seat, n) {
        const pw = this.players[seat].power;
        const a = Math.min(n, pw[0]);
        pw[0] -= a;
        pw[1] += a;
        const b = Math.min(n - a, pw[1]);
        pw[1] -= b;
        pw[2] += b;
        return a + b;
    }

    powerRoom(seat) {
        const pw = this.players[seat].power;
        return pw[0] * 2 + pw[1];
    }

    addVp(seat, n, why) {
        if (!n) return;
        this.players[seat].res.VP += n;
        if (why) this.log(`${this.pname(seat)}：${why}で ${n} 点`);
    }

    // ---- 地図 ----

    // 隣（橋も含む）
    neighbors(hex) {
        const list = [...ADJ[hex]];
        this.state.bridges.forEach(b => {
            if (b.a === hex) list.push(b.b);
            else if (b.b === hex) list.push(b.a);
        });
        return list;
    }

    ownHexes(seat) {
        const out = [];
        this.state.hexes.forEach((h, id) => { if (h.owner === seat) out.push(id); });
        return out;
    }

    shipRange(seat, forFinal = false) {
        const p = this.players[seat];
        if (this.fac(seat).ship.max === 0) return 0;
        return p.ship + (!forFinal && p.bonus === 'BON4' && !p.passed ? 1 : 0);
    }

    // そのマスに届くか。届くなら、トンネル・じゅうたんで払うものを返す
    reach(seat, hex) {
        if (this.state.round === 0) return { ok: true, extra: null };
        const own = this.ownHexes(seat);
        const nb = this.neighbors(hex);
        if (own.some(o => nb.includes(o))) return { ok: true, extra: null };
        const range = this.shipRange(seat);
        if (range > 0 && own.some(o => (RIVER_DIST[hex].get(o) ?? 99) <= range)) return { ok: true, extra: null };
        const p = this.players[seat];
        const t = this.fac(seat).teleport;
        if (t && !p.passed) {
            const pending = this.state.queue[0];
            if (pending?.kind === 'spades' && pending.seat === seat && pending.teleported === hex) return { ok: true, extra: null };
            const r = this.teleportRange(seat);
            if (own.some(o => hexDistance(o, hex) <= r + 1)) {
                const cost = t.type === 'tunnel' ? { W: p.buildings.SH ? 1 : 2 } : { P: 1 };
                return { ok: true, extra: { type: t.type, cost, vp: t.vp } };
            }
        }
        return { ok: false };
    }

    teleportRange(seat) {
        const t = this.fac(seat).teleport;
        if (!t) return 0;
        return t.range + (t.type === 'carpet' && this.players[seat].buildings.SH ? 1 : 0);
    }

    spadesNeeded(seat, hex) {
        const terrain = this.state.hexes[hex].terrain;
        const home = this.home(seat);
        if (terrain === home) return 0;
        if (this.players[seat].faction === 'giants') return 2;
        return wheelDistance(terrain, home, TERRAINS);
    }

    // 鋤 n 個を払う費用
    spadeCost(seat, n) {
        if (n <= 0) return {};
        if (this.players[seat].faction === 'darklings') return { P: n };
        return { W: SPADE_WORKERS[this.players[seat].dig] * n };
    }

    // 変換の判定。free：無料の鋤の数、full：足りない鋤を払って自分の地形まで変えるか
    checkTransform(seat, hex, { free = 0, full = true, paidAllowed = true } = {}) {
        const s = this.state;
        if (!Number.isInteger(hex) || !HEXES[hex]?.land) return { ok: false, reason: '土地を選んでください' };
        const h = s.hexes[hex];
        if (h.building) return { ok: false, reason: '建物のある土地は変えられません' };
        const need = this.spadesNeeded(seat, hex);
        if (need === 0) return { ok: false, reason: 'すでに自分の地形です' };
        const reach = this.reach(seat, hex);
        if (!reach.ok) return { ok: false, reason: '自分の建物から届きません' };
        const useFree = Math.min(free, need);
        let paid = 0;
        let to;
        if (useFree >= need || (full && paidAllowed)) {
            paid = need - useFree;
            to = this.home(seat);
        } else {
            if (this.players[seat].faction === 'giants') return { ok: false, reason: '巨人は鋤2つで一度に荒地に変えます' };
            to = stepToward(h.terrain, this.home(seat), useFree, TERRAINS);
        }
        const cost = addCost(this.spadeCost(seat, paid), reach.extra?.cost);
        if (!this.canPay(seat, cost)) return { ok: false, reason: `${costText(cost)}が要ります`, cost };
        return { ok: true, cost, to, free: useFree, paid, spades: useFree + paid, extra: reach.extra };
    }

    applyTransform(seat, hex, t) {
        const h = this.state.hexes[hex];
        const from = h.terrain;
        this.pay(seat, t.cost);
        h.terrain = t.to;
        if (t.extra) {
            this.addVp(seat, t.extra.vp, t.extra.type === 'tunnel' ? 'トンネル' : 'じゅうたん');
            const pending = this.state.queue[0];
            if (pending?.kind === 'spades' && pending.seat === seat) pending.teleported = hex;
        }
        this.scoreSpades(seat, t.spades, t.paid);
        this.emit({ type: 'transform', seat, hex, from, to: t.to });
        this.log(`${this.pname(seat)}が${HEXES[hex].label}を${TERRAIN_INFO[from].name}から${TERRAIN_INFO[t.to].name}に変えました`);
    }

    // 鋤を使ったときの得点など
    scoreSpades(seat, spades, paid) {
        if (spades <= 0) return;
        const p = this.players[seat];
        const tile = this.scoreTile();
        if (tile?.vp.spade) this.addVp(seat, tile.vp.spade * spades, '得点タイル（鋤）');
        if (p.faction === 'halflings') this.addVp(seat, spades, '鋤');
        if (p.faction === 'darklings' && paid > 0) this.addVp(seat, paid * 2, '司祭の鋤');
        if (p.faction === 'alchemists' && p.buildings.SH) this.gainPower(seat, spades * 2);
    }

    scoreTile() {
        const s = this.state;
        return s.round >= 1 && s.round <= ROUNDS ? SCORE_TILES[s.scoreTiles[s.round - 1]] : null;
    }

    // 住居を建てられるか（自分の地形・空き・届く・駒が残っている）。cost は住居の費用（無料なら空）
    checkDwelling(seat, hex, { free = false, needReach = true } = {}) {
        const p = this.players[seat];
        if (!Number.isInteger(hex) || !HEXES[hex]?.land) return { ok: false, reason: '土地を選んでください' };
        const h = this.state.hexes[hex];
        if (h.building) return { ok: false, reason: 'すでに建物があります' };
        if (h.terrain !== this.home(seat)) return { ok: false, reason: '自分の地形にしか建てられません' };
        if (p.buildings.D >= BUILDING_INFO.D.max) return { ok: false, reason: '住居の駒が残っていません' };
        const reach = needReach ? this.reach(seat, hex) : { ok: true };
        if (!reach.ok) return { ok: false, reason: '自分の建物から届きません' };
        const cost = addCost(free ? {} : this.fac(seat).cost.D, reach.extra?.cost);
        if (!this.canPay(seat, cost)) return { ok: false, reason: `${costText(cost)}が要ります`, cost };
        return { ok: true, cost, extra: reach.extra };
    }

    placeBuilding(seat, hex, type) {
        const h = this.state.hexes[hex];
        const p = this.players[seat];
        if (h.building) p.buildings[h.building]--;
        h.building = type;
        h.owner = seat;
        p.buildings[type]++;
    }

    // 住居を建てる（費用はすでに確かめてある）
    applyDwelling(seat, hex, check) {
        this.pay(seat, check.cost);
        if (check.extra) this.addVp(seat, check.extra.vp, check.extra.type === 'tunnel' ? 'トンネル' : 'じゅうたん');
        this.placeBuilding(seat, hex, 'D');
        this.log(`${this.pname(seat)}が${HEXES[hex].label}に住居を建てました`);
        this.emit({ type: 'build', seat, hex, building: 'D' });
        this.afterBuild(seat, hex, 'D');
    }

    // 建てた・改良したあと：得点・恩恵・町・魔力のもらい
    afterBuild(seat, hex, type) {
        const p = this.players[seat];
        if (this.state.round > 0) {
            const tile = this.scoreTile();
            if (tile?.vp[type]) this.addVp(seat, tile.vp[type], `得点タイル（${BUILDING_INFO[type].name}）`);
            p.favors.forEach(f => {
                const v = FAVOR_TILES[f].buildVp?.[type];
                if (v) this.addVp(seat, v, `恩恵タイル（${BUILDING_INFO[type].name}）`);
            });
        }
        if (type === 'TE' || type === 'SA') {
            const count = p.faction === 'chaosmagicians' ? 2 : 1;
            for (let i = 0; i < count; i++) this.state.queue.push({ kind: 'favor', seat });
        }
        if (type === 'SH') this.strongholdBonus(seat);
        this.detectTown(seat, hex);
        if (this.state.round > 0) this.offerLeech(seat, hex);
    }

    strongholdBonus(seat) {
        const p = this.players[seat];
        switch (p.faction) {
        case 'alchemists': this.gainPower(seat, 12); break;
        case 'auren': this.state.queue.push({ kind: 'favor', seat }); break;
        case 'cultists': this.addVp(seat, 7, '要塞'); break;
        case 'darklings': this.state.queue.push({ kind: 'darklings', seat }); break;
        case 'halflings': this.state.queue.push({ kind: 'spades', seat, spades: 3, canBuild: true, built: false, transformed: [], topUp: true, source: 'SH' }); break;
        case 'mermaids':
            if (p.ship < this.fac(seat).ship.max) {
                p.ship++;
                this.addVp(seat, this.fac(seat).ship.vp[p.ship - 1], '航海');
            }
            break;
        default: break;
        }
    }

    // 町ができたか調べる。新しい建物がすでにある町に隣り合えば、その町に入るだけ
    detectTown(seat, hex) {
        const s = this.state;
        const h = s.hexes[hex];
        if (h.town || h.owner !== seat) return;
        const links = (id) => this.townLinks(seat, id);
        const joined = links(hex).find(id => s.hexes[id].town);
        if (joined !== undefined) {
            const mark = (id, town) => {
                s.hexes[id].town = town;
                links(id).forEach(n => { if (!s.hexes[n].town) mark(n, town); });
            };
            mark(hex, s.hexes[joined].town);
            return;
        }
        const group = new Set();
        const visit = (id) => {
            if (group.has(id)) return;
            group.add(id);
            links(id).forEach(visit);
        };
        visit(hex);
        const list = [...group];
        const power = sum(list.map(id => BUILDING_INFO[s.hexes[id].building].power));
        const count = list.length + list.filter(id => s.hexes[id].building === 'SA').length;
        const need = this.players[seat].favors.includes('FAV5') ? 6 : TOWN_POWER;
        const tilesLeft = Object.values(s.townPool).some(n => n > 0);
        if (power >= need && count >= 4 && tilesLeft) {
            const town = ++s.townSeq;
            list.forEach(id => { s.hexes[id].town = town; });
            s.queue.unshift({ kind: 'town', seat });
            this.emit({ type: 'town', seat, hexes: list });
            this.log(`${this.pname(seat)}が町を作りました`);
        }
    }

    // 町としてつながる自分の建物（隣・橋。人魚は川1マスをはさんでもよい）
    townLinks(seat, id) {
        const s = this.state;
        const out = this.neighbors(id).filter(n => s.hexes[n].owner === seat);
        if (this.players[seat].faction === 'mermaids') {
            RIVER_DIST[id].forEach((d, n) => { if (d === 1 && s.hexes[n].owner === seat && !out.includes(n)) out.push(n); });
        }
        return out;
    }

    // 隣に建物を持つほかの人に、魔力のもらいを申し出る（手番の順に）
    offerLeech(seat, hex) {
        const s = this.state;
        const by = new Map();
        this.neighbors(hex).forEach(n => {
            const h = s.hexes[n];
            if (h.building && h.owner !== seat) by.set(h.owner, (by.get(h.owner) ?? 0) + BUILDING_INFO[h.building].power);
        });
        if (by.size === 0) return;
        const id = ++s.leechSeq;
        const order = this.turnOrderFrom(seat).filter(o => by.has(o));
        let offers = 0;
        order.forEach(o => {
            if (this.powerRoom(o) <= 0) return;
            s.queue.push({ kind: 'leech', seat: o, from: seat, amount: by.get(o), id });
            offers++;
        });
        if (this.players[seat].faction === 'cultists' && offers > 0) {
            s.queue.push({ kind: 'cultistCheck', seat, id, accepted: 0 });
        }
    }

    // seat の次の人から、手番の順に並べた席（seat 自身は除く）
    turnOrderFrom(seat) {
        const order = this.state.order;
        const i = order.indexOf(seat);
        return order.slice(i + 1).concat(order.slice(0, i));
    }

    // 宗教の段を n 進める。進んだ数を返す
    advanceCult(seat, track, n) {
        const p = this.players[seat];
        const from = p.cult[track];
        let to = Math.min(10, from + n);
        if (to === 10) {
            const others = this.players.some(o => o.id !== seat && o.cult[track] === 10);
            const used = CULTS.filter(c => p.cult[c] === 10).length;
            if (others || p.keys <= used) to = 9;
        }
        if (to <= from) return 0;
        p.cult[track] = to;
        Object.entries(CULT_POWER).forEach(([step, pw]) => {
            if (from < Number(step) && to >= Number(step)) this.gainPower(seat, pw);
        });
        return to - from;
    }

    canAdvanceCult(seat, track) {
        const p = this.players[seat];
        const pos = p.cult[track];
        if (pos >= 10) return false;
        if (pos === 9) {
            const others = this.players.some(o => o.id !== seat && o.cult[track] === 10);
            const used = CULTS.filter(c => p.cult[c] === 10).length;
            return !others && p.keys > used;
        }
        return true;
    }

    // ---- 準備 ----

    doPlace(seat, hex) {
        const check = this.checkDwelling(seat, hex, { free: true, needReach: false });
        if (!check.ok) return this.fail(check.reason);
        this.placeBuilding(seat, hex, 'D');
        this.emit({ type: 'build', seat, hex, building: 'D' });
        this.log(`${this.pname(seat)}が${HEXES[hex].label}に住居を置きました`);
        this.state.setup.shift();
        if (this.state.setup[0]?.kind === 'bonus' && this.state.setup.filter(x => x.kind === 'place').length === 0) {
            this.log('ボーナスカードを選びます（手番の逆順）');
        }
        return true;
    }

    doSetupBonus(seat, id) {
        const s = this.state;
        if (!Object.hasOwn(s.bonusPool, id)) return this.fail('そのボーナスカードはありません');
        this.takeBonus(seat, id);
        s.setup.shift();
        if (s.setup.length === 0) this.startRound(1);
        return true;
    }

    takeBonus(seat, id) {
        const s = this.state;
        const p = this.players[seat];
        const coins = s.bonusPool[id];
        delete s.bonusPool[id];
        if (p.bonus) s.bonusPool[p.bonus] = 0;
        p.bonus = id;
        if (coins) p.res.C += coins;
        this.log(`${this.pname(seat)}がボーナスカードを取りました${coins ? `（コイン${coins}つき）` : ''}`);
    }

    // ---- ラウンド ----

    startRound(round) {
        const s = this.state;
        s.round = round;
        s.phase = 'actions';
        s.powerUsed = {};
        s.passOrder = [];
        s.turnDone = false;
        this.players.forEach(p => {
            p.passed = false;
            p.used = {};
            p.extra = 0;
        });
        this.log(`―― ラウンド ${round}（${SCORE_TILES[s.scoreTiles[round - 1]].text}）――`);
        this.players.forEach(p => this.gain(p.id, this.income(p.id)));
        s.current = s.order[0];
        this.emit({ type: 'round', round });
    }

    // ラウンドの始めの収入（建物・恩恵タイル・ボーナスカード）
    income(seat) {
        const p = this.players[seat];
        const f = this.fac(seat);
        const total = { C: 0, W: 0, P: 0, PW: 0 };
        Object.entries(f.income).forEach(([b, table]) => {
            Object.entries(table).forEach(([k, list]) => { total[k] += list[p.buildings[b]] ?? 0; });
        });
        p.favors.forEach(id => Object.entries(FAVOR_TILES[id].income ?? {}).forEach(([k, v]) => { total[k] += v; }));
        if (p.bonus) Object.entries(BONUS_CARDS[p.bonus].income).forEach(([k, v]) => { total[k] += v; });
        return total;
    }

    // 手番を進める。全員がパスしたらラウンドを終える
    advanceTurn() {
        const s = this.state;
        const p = this.players[s.current];
        s.lastTurn = s.current;
        if (!p.passed && p.extra > 0) {
            p.extra--;
            return;
        }
        if (this.players.every(o => o.passed)) {
            this.endRound();
            return;
        }
        const order = s.order;
        let i = order.indexOf(s.current);
        for (let k = 0; k < order.length; k++) {
            i = (i + 1) % order.length;
            if (!this.players[order[i]].passed) {
                s.current = order[i];
                return;
            }
        }
    }

    endRound() {
        const s = this.state;
        const tile = this.scoreTile();
        s.phase = 'cleanup';
        s.current = null;
        if (s.round < ROUNDS) {
            // 宗教のボーナス（鋤はすぐに使う）
            s.passOrder.forEach(seat => {
                const p = this.players[seat];
                const times = Math.floor(p.cult[tile.cult] / tile.req);
                if (times <= 0) return;
                const [[k, v]] = Object.entries(tile.bonus);
                if (k === 'spade') {
                    s.queue.push({ kind: 'spades', seat, spades: v * times, canBuild: false, built: false, transformed: [], topUp: false, source: 'cult' });
                    this.log(`${this.pname(seat)}：宗教のボーナスで鋤 ${v * times}`);
                } else {
                    this.gain(seat, { [k]: v * times });
                    this.log(`${this.pname(seat)}：宗教のボーナスで${RESOURCE_NAMES[k]} ${v * times}`);
                }
            });
            Object.keys(s.bonusPool).forEach(id => { s.bonusPool[id]++; });
        }
        s.order = [...s.passOrder];
    }

    // 待ちがなくなったら、手番・ラウンドを進める
    settle() {
        const s = this.state;
        for (let guard = 0; guard < 50; guard++) {
            this.pruneQueue();
            if (s.queue.length > 0) return;
            if (s.phase === 'actions') {
                if (!s.turnDone) return;
                s.turnDone = false;
                this.advanceTurn();
                continue;
            }
            if (s.phase === 'cleanup') {
                if (s.round >= ROUNDS) this.finish();
                else this.startRound(s.round + 1);
                continue;
            }
            return;
        }
    }

    // 答えようのない待ちを除く（魔力を受け取る余地がない・取れるタイルがない・鋤を使える土地がない など）
    pruneQueue() {
        const s = this.state;
        while (s.queue.length > 0) {
            const q = s.queue[0];
            if (q.kind === 'cultistCheck') {
                s.queue.shift();
                this.resolveCultist(q);
                continue;
            }
            if (q.kind === 'leech' && Math.min(q.amount, this.powerRoom(q.seat)) <= 0) {
                s.queue.shift();
                continue;
            }
            if (q.kind === 'favor' && this.availableFavors(q.seat).length === 0) {
                s.queue.shift();
                continue;
            }
            if (q.kind === 'darklings' && this.players[q.seat].res.W === 0) {
                s.queue.shift();
                continue;
            }
            if (q.kind === 'spades' && !this.spadesUsable(q)) {
                s.queue.shift();
                continue;
            }
            return;
        }
    }

    spadesUsable(q) {
        if (q.spades > 0 && LAND.some(hex => this.spadeTargetOk(q, hex))) return true;
        return this.pendingBuildTargets(q).length > 0;
    }

    // 待ちの鋤で、その土地を変えられるか（足りない分を払える待ちなら、払って変える場合も含める）
    spadeTargetOk(q, hex) {
        if (this.checkTransform(q.seat, hex, { free: q.spades, full: false, paidAllowed: q.topUp }).ok) return true;
        return q.topUp && this.checkTransform(q.seat, hex, { free: q.spades, full: true }).ok;
    }

    pendingBuildTargets(q) {
        if (!q.canBuild || q.built) return [];
        return q.transformed.filter(hex => this.checkDwelling(q.seat, hex, { needReach: false }).ok);
    }

    // ---- 手番の行動 ----

    doBuild(seat, hex) {
        if (!Number.isInteger(hex) || !HEXES[hex]?.land) return this.fail('土地を選んでください');
        const h = this.state.hexes[hex];
        if (h.building) return this.fail('すでに建物があります');
        const need = this.spadesNeeded(seat, hex);
        let t = null;
        if (need > 0) {
            t = this.checkTransform(seat, hex);
            if (!t.ok) return this.fail(t.reason);
        }
        const p = this.players[seat];
        if (p.buildings.D >= BUILDING_INFO.D.max) return this.fail('住居の駒が残っていません');
        const reach = this.reach(seat, hex);
        if (!reach.ok) return this.fail('自分の建物から届きません');
        const total = addCost(addCost(t ? this.spadeCost(seat, t.paid) : {}, reach.extra?.cost), this.fac(seat).cost.D);
        if (!this.canPay(seat, total)) return this.fail(`${costText(total)}が要ります`);
        if (t) this.applyTransform(seat, hex, t);
        this.applyDwelling(seat, hex, { cost: t ? this.fac(seat).cost.D : addCost(this.fac(seat).cost.D, reach.extra?.cost), extra: t ? null : reach.extra });
        this.state.turnDone = true;
        return true;
    }

    doTransformAction(seat, hex) {
        const t = this.checkTransform(seat, hex);
        if (!t.ok) return this.fail(t.reason);
        this.applyTransform(seat, hex, t);
        this.state.turnDone = true;
        return true;
    }

    checkUpgrade(seat, hex, to) {
        const s = this.state;
        if (!Object.hasOwn(UPGRADE_FROM, to)) return { ok: false, reason: '改良の先が正しくありません' };
        if (!Number.isInteger(hex) || !HEXES[hex]) return { ok: false, reason: '建物を選んでください' };
        const h = s.hexes[hex];
        if (h.owner !== seat || h.building !== UPGRADE_FROM[to]) return { ok: false, reason: `${BUILDING_INFO[UPGRADE_FROM[to]].name}を選んでください` };
        const p = this.players[seat];
        if (p.buildings[to] >= BUILDING_INFO[to].max) return { ok: false, reason: `${BUILDING_INFO[to].name}の駒が残っていません` };
        const cost = { ...this.fac(seat).cost[to] };
        if (to === 'TP' && !this.neighbors(hex).some(n => s.hexes[n].building && s.hexes[n].owner !== seat)) cost.C *= 2;
        if (!this.canPay(seat, cost)) return { ok: false, reason: `${costText(cost)}が要ります`, cost };
        return { ok: true, cost };
    }

    doUpgrade(seat, hex, to, free = false) {
        const check = free ? { ok: true, cost: {} } : this.checkUpgrade(seat, hex, to);
        if (!check.ok) return this.fail(check.reason);
        this.pay(seat, check.cost);
        this.placeBuilding(seat, hex, to);
        this.log(`${this.pname(seat)}が${HEXES[hex].label}を${BUILDING_INFO[to].name}に改良しました`);
        this.emit({ type: 'build', seat, hex, building: to });
        this.afterBuild(seat, hex, to);
        this.state.turnDone = true;
        return true;
    }

    checkShip(seat) {
        const p = this.players[seat];
        const f = this.fac(seat);
        if (p.ship >= f.ship.max) return { ok: false, reason: '航海はこれ以上伸ばせません' };
        if (!this.canPay(seat, SHIP_COST)) return { ok: false, reason: `${costText(SHIP_COST)}が要ります` };
        return { ok: true, cost: SHIP_COST, vp: f.ship.vp[p.ship] };
    }

    doShip(seat) {
        const check = this.checkShip(seat);
        if (!check.ok) return this.fail(check.reason);
        const p = this.players[seat];
        this.pay(seat, check.cost);
        p.ship++;
        this.log(`${this.pname(seat)}が航海を ${p.ship} にしました`);
        this.addVp(seat, check.vp);
        this.state.turnDone = true;
        return true;
    }

    checkDig(seat) {
        const p = this.players[seat];
        const f = this.fac(seat);
        if (p.dig >= f.dig.max) return { ok: false, reason: '鋤はこれ以上改良できません' };
        if (!this.canPay(seat, f.dig.cost)) return { ok: false, reason: `${costText(f.dig.cost)}が要ります` };
        return { ok: true, cost: f.dig.cost };
    }

    doDig(seat) {
        const check = this.checkDig(seat);
        if (!check.ok) return this.fail(check.reason);
        const p = this.players[seat];
        this.pay(seat, check.cost);
        p.dig++;
        this.log(`${this.pname(seat)}が鋤を改良しました（鋤1つ 職人${SPADE_WORKERS[p.dig]}）`);
        this.addVp(seat, DIG_VP);
        this.state.turnDone = true;
        return true;
    }

    // 司祭を宗教の段に送る。steps：3・2（置き場に残る）か 1（司祭は戻る）
    checkPriest(seat, track, steps) {
        if (!CULTS.includes(track)) return { ok: false, reason: '宗教の段を選んでください' };
        if (![1, 2, 3].includes(steps)) return { ok: false, reason: '進む数が正しくありません' };
        const p = this.players[seat];
        if (p.res.P < 1) return { ok: false, reason: '司祭がいません' };
        if (!this.canAdvanceCult(seat, track)) return { ok: false, reason: 'この段はこれ以上進めません' };
        const spots = this.state.cultSpots[track];
        let spot = -1;
        if (steps === 3) spot = spots[0] === null ? 0 : -2;
        if (steps === 2) spot = [1, 2, 3].find(i => spots[i] === null) ?? -2;
        if (spot === -2) return { ok: false, reason: 'その置き場は埋まっています' };
        return { ok: true, spot };
    }

    doPriest(seat, track, steps) {
        const check = this.checkPriest(seat, track, steps);
        if (!check.ok) return this.fail(check.reason);
        const p = this.players[seat];
        p.res.P--;
        if (check.spot >= 0) {
            this.state.cultSpots[track][check.spot] = seat;
            p.priestsOnCult++;
        }
        const moved = this.advanceCult(seat, track, steps);
        this.log(`${this.pname(seat)}が司祭を${CULT_INFO[track].name}の段に送りました（${moved}つ進む）`);
        this.state.turnDone = true;
        return true;
    }

    // 橋を架けられるか
    checkBridge(seat, pair) {
        if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isInteger)) return { ok: false, reason: '橋の場所を選んでください' };
        const [a, b] = pair;
        const key = bridgeKey(a, b);
        if (!BRIDGE_KEYS.has(key)) return { ok: false, reason: 'そこには橋を架けられません' };
        const s = this.state;
        if (s.bridges.some(x => bridgeKey(x.a, x.b) === key)) return { ok: false, reason: 'すでに橋があります' };
        if (this.players[seat].bridges >= MAX_BRIDGES) return { ok: false, reason: '橋は3本までです' };
        if (s.hexes[a].owner !== seat && s.hexes[b].owner !== seat) return { ok: false, reason: '片方の岸に自分の建物が要ります' };
        return { ok: true };
    }

    applyBridge(seat, [a, b]) {
        this.state.bridges.push({ a: Math.min(a, b), b: Math.max(a, b), owner: seat });
        this.players[seat].bridges++;
        this.log(`${this.pname(seat)}が${HEXES[a].label}と${HEXES[b].label}の間に橋を架けました`);
        this.emit({ type: 'bridge', seat, a, b });
        this.detectTown(seat, a);
        this.detectTown(seat, b);
    }

    checkPower(seat, id, bridge) {
        const act = POWER_ACTIONS[id];
        if (!act) return { ok: false, reason: 'その魔力アクションはありません' };
        if (this.state.powerUsed[id] !== undefined) return { ok: false, reason: 'このラウンドはもう使われています' };
        if (this.players[seat].power[2] < act.cost) return { ok: false, reason: `3つ目の器に魔力${act.cost}が要ります` };
        if (id === 'ACT1') {
            const b = this.checkBridge(seat, bridge);
            if (!b.ok) return b;
        }
        if (id === 'ACT5' || id === 'ACT6') {
            const n = id === 'ACT5' ? 1 : 2;
            if (!LAND.some(hex => this.checkTransform(seat, hex, { free: n, full: false }).ok || this.checkTransform(seat, hex, { free: n }).ok)) {
                return { ok: false, reason: '鋤を使える土地がありません' };
            }
        }
        return { ok: true };
    }

    doPower(seat, id, bridge) {
        const check = this.checkPower(seat, id, bridge);
        if (!check.ok) return this.fail(check.reason);
        const act = POWER_ACTIONS[id];
        this.pay(seat, { PW: act.cost });
        this.state.powerUsed[id] = seat;
        this.log(`${this.pname(seat)}が魔力アクション「${act.name}」を使いました`);
        if (id === 'ACT1') this.applyBridge(seat, bridge);
        if (id === 'ACT2') this.gain(seat, { P: 1 });
        if (id === 'ACT3') this.gain(seat, { W: 2 });
        if (id === 'ACT4') this.gain(seat, { C: 7 });
        if (id === 'ACT5' || id === 'ACT6') {
            this.state.queue.unshift({ kind: 'spades', seat, spades: id === 'ACT5' ? 1 : 2, canBuild: true, built: false, transformed: [], topUp: true, source: id });
        }
        this.state.turnDone = true;
        return true;
    }

    // 使える特別な行動の一覧
    availableSpecials(seat) {
        const p = this.players[seat];
        const out = [];
        if (p.bonus === 'BON1') out.push('BON1');
        if (p.bonus === 'BON2') out.push('BON2');
        if (p.favors.includes('FAV6')) out.push('FAV6');
        if (p.buildings.SH) {
            const sh = { auren: 'ACTA', giants: 'ACTG', nomads: 'ACTN', witches: 'ACTW', swarmlings: 'ACTS', chaosmagicians: 'ACTC' }[p.faction];
            if (sh) out.push(sh);
        }
        if (p.faction === 'engineers') out.push('ACTE');
        return out.filter(id => SPECIALS[id].repeat || !p.used[id]);
    }

    checkSpecial(seat, c) {
        const id = c.id;
        if (!this.availableSpecials(seat).includes(id)) return { ok: false, reason: 'その行動は今は使えません' };
        const p = this.players[seat];
        const s = this.state;
        switch (id) {
        case 'BON2': case 'FAV6': case 'ACTA':
            if (!CULTS.includes(c.track)) return { ok: false, reason: '宗教の段を選んでください' };
            if (!this.canAdvanceCult(seat, c.track)) return { ok: false, reason: 'この段はこれ以上進めません' };
            return { ok: true };
        case 'BON1': case 'ACTG': {
            const n = id === 'BON1' ? 1 : 2;
            if (!LAND.some(hex => this.checkTransform(seat, hex, { free: n, full: false }).ok || this.checkTransform(seat, hex, { free: n }).ok)) {
                return { ok: false, reason: '鋤を使える土地がありません' };
            }
            return { ok: true };
        }
        case 'ACTN': {
            const hex = c.hex;
            if (!Number.isInteger(hex) || !HEXES[hex]?.land) return { ok: false, reason: '土地を選んでください' };
            const h = s.hexes[hex];
            if (h.building || h.terrain === 'desert') return { ok: false, reason: '建物のない、砂漠でない土地を選んでください' };
            if (!ADJ[hex].some(n => s.hexes[n].owner === seat)) return { ok: false, reason: '自分の建物のすぐ隣（橋は除く）を選んでください' };
            return { ok: true };
        }
        case 'ACTW': {
            const check = this.checkDwelling(seat, c.hex, { free: true, needReach: false });
            if (!check.ok) return check;
            return { ok: true };
        }
        case 'ACTS': {
            const hex = c.hex;
            if (!Number.isInteger(hex) || s.hexes[hex]?.owner !== seat || s.hexes[hex].building !== 'D') return { ok: false, reason: '自分の住居を選んでください' };
            if (p.buildings.TP >= BUILDING_INFO.TP.max) return { ok: false, reason: '交易所の駒が残っていません' };
            return { ok: true };
        }
        case 'ACTC':
            return { ok: true };
        case 'ACTE': {
            if (!this.canPay(seat, { W: 2 })) return { ok: false, reason: '職人2が要ります' };
            return this.checkBridge(seat, c.bridge);
        }
        default:
            return { ok: false, reason: 'その行動はありません' };
        }
    }

    doSpecial(seat, c) {
        const check = this.checkSpecial(seat, c);
        if (!check.ok) return this.fail(check.reason);
        const p = this.players[seat];
        const s = this.state;
        const id = c.id;
        p.used[id] = true;
        this.log(`${this.pname(seat)}が「${SPECIALS[id].name}」を使いました`);
        switch (id) {
        case 'BON2': case 'FAV6': case 'ACTA':
            this.advanceCult(seat, c.track, id === 'ACTA' ? 2 : 1);
            break;
        case 'BON1': case 'ACTG':
            s.queue.unshift({ kind: 'spades', seat, spades: id === 'BON1' ? 1 : 2, canBuild: true, built: false, transformed: [], topUp: true, source: id });
            break;
        case 'ACTN': {
            const from = s.hexes[c.hex].terrain;
            s.hexes[c.hex].terrain = 'desert';
            this.emit({ type: 'transform', seat, hex: c.hex, from, to: 'desert' });
            this.log(`${HEXES[c.hex].label}が砂漠になりました`);
            s.queue.unshift({ kind: 'spades', seat, spades: 0, canBuild: true, built: false, transformed: [c.hex], topUp: false, source: id });
            break;
        }
        case 'ACTW':
            this.applyDwelling(seat, c.hex, { cost: {}, extra: null });
            break;
        case 'ACTS':
            this.placeBuilding(seat, c.hex, 'TP');
            this.log(`${this.pname(seat)}が${HEXES[c.hex].label}を交易所に改良しました`);
            this.emit({ type: 'build', seat, hex: c.hex, building: 'TP' });
            this.afterBuild(seat, c.hex, 'TP');
            break;
        case 'ACTC':
            p.extra = 2;
            s.turnDone = true;
            return true;
        case 'ACTE':
            this.pay(seat, { W: 2 });
            this.applyBridge(seat, c.bridge);
            break;
        default: break;
        }
        s.turnDone = true;
        return true;
    }

    doPass(seat, bonus) {
        const s = this.state;
        const p = this.players[seat];
        if (s.round < ROUNDS) {
            if (!bonus || !Object.hasOwn(s.bonusPool, bonus)) return this.fail('次のラウンドのボーナスカードを選んでください');
        }
        // パスの得点（返すボーナスカード・恩恵タイル・技師の要塞）
        const card = p.bonus ? BONUS_CARDS[p.bonus] : null;
        if (card?.passVp) {
            const vp = sum(Object.entries(card.passVp).map(([b, v]) => v * p.buildings[b]));
            this.addVp(seat, vp, 'ボーナスカード');
        }
        if (p.favors.includes('FAV12')) this.addVp(seat, FAVOR_TILES.FAV12.passTp[p.buildings.TP], '恩恵タイル（交易所）');
        if (p.faction === 'engineers' && p.buildings.SH) {
            const n = s.bridges.filter(b => b.owner === seat && s.hexes[b.a].owner === seat && s.hexes[b.b].owner === seat).length;
            this.addVp(seat, n * 3, '要塞（橋）');
        }
        p.passed = true;
        p.extra = 0;
        s.passOrder.push(seat);
        this.log(`${this.pname(seat)}がパスしました`);
        if (s.round < ROUNDS) this.takeBonus(seat, bonus);
        else if (p.bonus) {
            s.bonusPool[p.bonus] = 0;
            p.bonus = null;
        }
        this.emit({ type: 'pass', seat });
        s.turnDone = true;
        return true;
    }

    // ---- 交換 ----

    checkConvert(seat, kind, n = 1) {
        const conv = CONVERSIONS[kind];
        if (!conv) return { ok: false, reason: 'その交換はありません' };
        if (!Number.isInteger(n) || n < 1 || n > 30) return { ok: false, reason: '数が正しくありません' };
        const p = this.players[seat];
        if (conv.only && p.faction !== conv.only) return { ok: false, reason: 'その交換はできません' };
        if (kind === 'burn') {
            if (p.power[1] < 2 * n) return { ok: false, reason: '2つ目の器の魔力が足りません' };
            return { ok: true };
        }
        const cost = Object.fromEntries(Object.entries(conv.from).map(([k, v]) => [k, v * n]));
        if (!this.canPay(seat, cost)) return { ok: false, reason: `${costText(cost)}が要ります` };
        if (conv.to.P && p.res.P + n > this.maxPriests(seat)) return { ok: false, reason: '司祭はこれ以上持てません' };
        return { ok: true, cost };
    }

    doConvert(seat, kind, n = 1) {
        const check = this.checkConvert(seat, kind, n);
        if (!check.ok) return this.fail(check.reason);
        const p = this.players[seat];
        if (kind === 'burn') {
            p.power[1] -= 2 * n;
            p.power[2] += n;
            return true;
        }
        this.pay(seat, check.cost);
        this.gain(seat, Object.fromEntries(Object.entries(CONVERSIONS[kind].to).map(([k, v]) => [k, v * n])));
        return true;
    }

    // ---- 待ちへの答え ----

    doPendingTransform(seat, hex, full) {
        const q = this.state.queue[0];
        if (q.spades <= 0) return this.fail('鋤が残っていません');
        const t = this.checkTransform(seat, hex, { free: q.spades, full, paidAllowed: q.topUp });
        if (!t.ok) return this.fail(t.reason);
        q.spades -= t.free;
        if (!q.transformed.includes(hex)) q.transformed.push(hex);
        this.applyTransform(seat, hex, t);
        this.finishSpadesIfDone(q);
        return true;
    }

    doPendingBuild(seat, hex) {
        const q = this.state.queue[0];
        if (!q.canBuild || q.built) return this.fail('ここでは建てられません');
        if (!q.transformed.includes(hex)) return this.fail('今変えた土地を選んでください');
        const check = this.checkDwelling(seat, hex, { needReach: false });
        if (!check.ok) return this.fail(check.reason);
        q.built = true;
        this.applyDwelling(seat, hex, check);
        this.finishSpadesIfDone(q);
        return true;
    }

    finishSpadesIfDone(q) {
        const s = this.state;
        if (q.spades > 0 && LAND.some(hex => this.spadeTargetOk(q, hex))) return;
        if (this.pendingBuildTargets(q).length > 0) return;
        const i = s.queue.indexOf(q);
        if (i >= 0) s.queue.splice(i, 1);
    }

    doDone(seat) {
        const s = this.state;
        s.queue.shift();
        this.log(`${this.pname(seat)}は鋤の残りを使わずに終えました`);
        return true;
    }

    availableFavors(seat) {
        const p = this.players[seat];
        return Object.keys(FAVOR_TILES).filter(id => this.state.favorPool[id] > 0 && !p.favors.includes(id));
    }

    doFavor(seat, id) {
        if (!this.availableFavors(seat).includes(id)) return this.fail('その恩恵タイルは取れません');
        const s = this.state;
        const p = this.players[seat];
        s.queue.shift();
        s.favorPool[id]--;
        p.favors.push(id);
        Object.entries(FAVOR_TILES[id].cult).forEach(([track, n]) => this.advanceCult(seat, track, n));
        this.log(`${this.pname(seat)}が恩恵タイル（${FAVOR_TILES[id].text}）を取りました`);
        if (id === 'FAV5') {
            // 町の大きさが下がったので、町ができていないか調べ直す
            this.ownHexes(seat).forEach(hex => this.detectTown(seat, hex));
        }
        return true;
    }

    doTown(seat, id) {
        const s = this.state;
        if (!(s.townPool[id] > 0)) return this.fail('その町タイルは残っていません');
        const p = this.players[seat];
        const tile = TOWN_TILES[id];
        s.queue.shift();
        s.townPool[id]--;
        p.towns.push(id);
        p.keys++;
        this.addVp(seat, tile.vp, '町タイル');
        if (tile.gain) this.gain(seat, tile.gain);
        if (tile.cult) CULTS.forEach(track => this.advanceCult(seat, track, tile.cult));
        if (p.faction === 'witches') this.addVp(seat, 5, '町（魔女）');
        if (p.faction === 'swarmlings') this.gain(seat, { W: 3 });
        const score = this.scoreTile();
        if (score?.vp.town) this.addVp(seat, score.vp.town, '得点タイル（町）');
        return true;
    }

    // 受け取れる魔力と、払う勝利点
    leechAmount(q) {
        const p = this.players[q.seat];
        const amount = Math.min(q.amount, this.powerRoom(q.seat), p.res.VP + 1);
        return { amount, vp: Math.max(0, amount - 1) };
    }

    doLeech(seat, accept) {
        const s = this.state;
        const q = s.queue.shift();
        if (accept) {
            const { amount, vp } = this.leechAmount(q);
            const got = this.gainPower(seat, amount);
            this.players[seat].res.VP -= vp;
            this.log(`${this.pname(seat)}が魔力 ${got} を受け取りました${vp ? `（${vp}点を払う）` : ''}`);
            const check = s.queue.find(x => x.kind === 'cultistCheck' && x.id === q.id);
            if (check) check.accepted++;
        } else {
            this.log(`${this.pname(seat)}は魔力を受け取りませんでした`);
        }
        return true;
    }

    resolveCultist(q) {
        if (q.accepted > 0) {
            this.state.queue.unshift({ kind: 'cultist', seat: q.seat });
        } else {
            this.gainPower(q.seat, 1);
            this.log(`${this.pname(q.seat)}：だれも魔力を受け取らなかったので魔力 1`);
        }
    }

    doCultist(seat, track) {
        if (!CULTS.includes(track)) return this.fail('宗教の段を選んでください');
        this.state.queue.shift();
        const moved = this.advanceCult(seat, track, 1);
        this.log(`${this.pname(seat)}が${CULT_INFO[track].name}の段を${moved}つ進めました`);
        return true;
    }

    doDarklings(seat, n) {
        const p = this.players[seat];
        if (!Number.isInteger(n) || n < 0 || n > 3 || n > p.res.W) return this.fail('替える数が正しくありません');
        if (p.res.P + n > this.maxPriests(seat)) return this.fail('司祭はこれ以上持てません');
        this.state.queue.shift();
        p.res.W -= n;
        p.res.P += n;
        if (n > 0) this.log(`${this.pname(seat)}が職人${n}人を司祭にしました`);
        return true;
    }

    // ---- 最後の得点 ----

    // 一番大きなつながり（航海・トンネル・じゅうたんで届く建物もつながりとみなす）
    networkSize(seat) {
        const own = this.ownHexes(seat);
        const t = this.fac(seat).teleport;
        const range = t ? this.teleportRange(seat) : this.shipRange(seat, true);
        const linked = (a, b) => this.neighbors(a).includes(b)
            || (t ? hexDistance(a, b) <= range + 1 : (RIVER_DIST[a].get(b) ?? 99) <= range);
        const seen = new Set();
        let best = 0;
        own.forEach(start => {
            if (seen.has(start)) return;
            let size = 0;
            const stack = [start];
            seen.add(start);
            while (stack.length) {
                const a = stack.pop();
                size++;
                own.forEach(b => {
                    if (!seen.has(b) && linked(a, b)) {
                        seen.add(b);
                        stack.push(b);
                    }
                });
            }
            best = Math.max(best, size);
        });
        return best;
    }

    // 順位の得点を分ける（同点は、その順位の点を合わせて頭数で割り、切り捨て）
    static rankPoints(values, points) {
        const out = values.map(() => 0);
        const sorted = [...new Set(values.filter(v => v > 0))].sort((a, b) => b - a);
        let pos = 0;
        sorted.forEach(v => {
            const tied = values.map((x, i) => (x === v ? i : -1)).filter(i => i >= 0);
            const share = sum(points.slice(pos, pos + tied.length));
            tied.forEach(i => { out[i] = Math.floor(share / tied.length); });
            pos += tied.length;
        });
        return out;
    }

    // 残った資源の勝利点（魔力は燃やしてコインに、司祭・職人もコインに。3コインで1点。錬金術師は2コインで1点）
    resourceVp(seat) {
        const p = this.players[seat];
        const coins = p.res.C + p.res.W + p.res.P + p.power[2] + Math.floor(p.power[1] / 2);
        return Math.floor(coins / (p.faction === 'alchemists' ? 2 : 3));
    }

    finish() {
        const s = this.state;
        s.phase = 'end';
        const network = this.players.map(p => this.networkSize(p.id));
        const netVp = Game.rankPoints(network, NETWORK_VP);
        const cultVp = CULTS.map(track => Game.rankPoints(this.players.map(p => p.cult[track]), CULT_VP));
        s.final = this.players.map(p => {
            const before = p.res.VP;
            const cults = CULTS.map((_, i) => cultVp[i][p.id]);
            const res = this.resourceVp(p.id);
            p.res.VP += netVp[p.id] + sum(cults) + res;
            return { seat: p.id, before, network: network[p.id], networkVp: netVp[p.id], cultVp: cults, resourceVp: res, total: p.res.VP };
        });
        const best = Math.max(...this.players.map(p => p.res.VP));
        s.winners = this.players.filter(p => p.res.VP === best).map(p => p.id);
        this.log(`最後の得点：つながり・宗教の段・残りの資源`);
        this.log(`${s.winners.map(i => this.pname(i)).join('と')}の勝ちです（${best}点）`);
        this.emit({ type: 'end', winners: [...s.winners] });
    }

    // ---- 画面と CPU のための一覧 ----

    // その土地でできること（手番の行動）
    hexOptions(seat, hex) {
        const out = [];
        const s = this.state;
        const h = s.hexes[hex];
        if (!HEXES[hex].land) return out;
        const w = this.waiting();
        if (!w || w.seat !== seat) return out;
        if (w.kind === 'place') {
            const c = this.checkDwelling(seat, hex, { free: true, needReach: false });
            if (c.ok) out.push({ command: { type: 'place', hex }, label: '住居を置く', cost: {} });
            return out;
        }
        if (w.kind === 'spades') {
            if (w.spades > 0 && !h.building) {
                const need = this.spadesNeeded(seat, hex);
                const part = this.checkTransform(seat, hex, { free: w.spades, full: false, paidAllowed: w.topUp });
                if (part.ok) out.push({ command: { type: 'transform', hex, full: false }, label: part.to === this.home(seat) ? `${TERRAIN_INFO[part.to].name}に変える` : `${TERRAIN_INFO[part.to].name}に変える（鋤${part.free}）`, cost: part.cost });
                if (w.topUp && need > w.spades) {
                    const full = this.checkTransform(seat, hex, { free: w.spades, full: true });
                    if (full.ok) out.push({ command: { type: 'transform', hex, full: true }, label: `${TERRAIN_INFO[full.to].name}に変える（鋤を足す）`, cost: full.cost });
                }
            }
            if (this.pendingBuildTargets(w).includes(hex)) {
                const c = this.checkDwelling(seat, hex, { needReach: false });
                out.push({ command: { type: 'build', hex }, label: '住居を建てる', cost: c.cost });
            }
            return out;
        }
        if (w.kind !== 'action') return out;
        if (!h.building) {
            const need = this.spadesNeeded(seat, hex);
            const reach = this.reach(seat, hex);
            // トンネル・じゅうたんで届く土地は、そのことと点を書き添える
            const via = reach.extra ? `（${reach.extra.type === 'tunnel' ? 'トンネル' : 'じゅうたん'}・${reach.extra.vp}点）` : '';
            if (reach.ok && this.players[seat].buildings.D < 8) {
                const cost = addCost(addCost(this.spadeCost(seat, need), reach.extra?.cost), this.fac(seat).cost.D);
                const label = (need > 0 ? `鋤${need}で変えて住居を建てる` : '住居を建てる') + via;
                out.push({ command: { type: 'build', hex }, label, cost, ok: this.canPay(seat, cost) });
            }
            if (need > 0 && reach.ok) {
                const cost = addCost(this.spadeCost(seat, need), reach.extra?.cost);
                out.push({ command: { type: 'transform', hex }, label: `鋤${need}で${TERRAIN_INFO[this.home(seat)].name}に変えるだけ${via}`, cost, ok: this.canPay(seat, cost) });
            }
        } else if (h.owner === seat) {
            ['TP', 'TE', 'SH', 'SA'].forEach(to => {
                if (UPGRADE_FROM[to] !== h.building) return;
                if (this.players[seat].buildings[to] >= BUILDING_INFO[to].max) return;
                const c = this.checkUpgrade(seat, hex, to);
                const cost = c.cost ?? this.fac(seat).cost[to];
                out.push({ command: { type: 'upgrade', hex, to }, label: `${BUILDING_INFO[to].name}に改良`, cost, ok: c.ok });
            });
        }
        return out;
    }

    // 保存する形（参加者・設定・操作の記録）
    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: structuredClone(this.options),
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

function newPlayer(id, p, factionId) {
    const f = FACTIONS[factionId];
    return {
        id,
        name: String(p.name ?? `プレイヤー${id + 1}`),
        isCPU: !!p.isCPU,
        faction: factionId,
        res: { ...f.res, VP: START_VP },
        power: [...f.power],
        cult: { ...f.cult },
        keys: 0,
        priestsOnCult: 0,
        ship: f.ship.start,
        dig: 0,
        buildings: { D: 0, TP: 0, TE: 0, SH: 0, SA: 0 },
        bridges: 0,
        bonus: null,
        favors: [],
        towns: [],
        passed: false,
        used: {},
        extra: 0
    };
}

// 勢力を決める（指定がなければ乱数で。地形が重ならないように）
function pickFactions(count, wanted, random) {
    const chosen = [];
    for (let i = 0; i < count; i++) {
        const want = wanted[i];
        if (want && FACTIONS[want] && !chosen.some(f => f && FACTIONS[f].terrain === FACTIONS[want].terrain)) chosen.push(want);
        else chosen.push(null);
    }
    const ids = Object.keys(FACTIONS).sort();
    chosen.forEach((f, i) => {
        if (f) return;
        const free = ids.filter(id => !chosen.some(c => c && FACTIONS[c].terrain === FACTIONS[id].terrain));
        chosen[i] = free[Math.floor(random() * free.length)];
    });
    return chosen;
}

// 最初の住居の順（手番の順に1つずつ、逆の順に1つずつ。遊牧民の3つ目、混沌の魔術師の1つは最後）と、ボーナスカードの順（逆順）
function setupSequence(order, factions) {
    const seq = [];
    const normal = order.filter(seat => factions[seat] !== 'chaosmagicians');
    normal.forEach(seat => seq.push({ kind: 'place', seat }));
    [...normal].reverse().forEach(seat => seq.push({ kind: 'place', seat }));
    order.filter(seat => factions[seat] === 'nomads').forEach(seat => seq.push({ kind: 'place', seat }));
    order.filter(seat => factions[seat] === 'chaosmagicians').forEach(seat => seq.push({ kind: 'place', seat }));
    [...order].reverse().forEach(seat => seq.push({ kind: 'bonus', seat }));
    return seq;
}

// 記録する項目の形を確かめる（壊れた操作を記録しない）
function validFields(c) {
    const isInt = (v) => v === undefined || Number.isInteger(v);
    if (!isInt(c.hex) || !isInt(c.n) || !isInt(c.steps)) return false;
    if (c.hex !== undefined && (c.hex < 0 || c.hex >= HEXES.length)) return false;
    for (const key of ['id', 'to', 'track', 'kind', 'bonus']) {
        if (c[key] !== undefined && (typeof c[key] !== 'string' || c[key].length > 12)) return false;
    }
    for (const key of ['full', 'accept']) {
        if (c[key] !== undefined && typeof c[key] !== 'boolean') return false;
    }
    if (c.bridge !== undefined && !(Array.isArray(c.bridge) && c.bridge.length === 2 && c.bridge.every(v => Number.isInteger(v) && v >= 0 && v < HEXES.length))) return false;
    return true;
}
