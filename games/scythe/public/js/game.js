/**
 * サイズ -大鎌戦役- のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びなどはシードから決まる）
 *
 * 手番の流れ
 *   choose（区画を選ぶ）→ top（上段）→ [combat（戦闘）→ encounter（遭遇）/ factory（工場）] → bottom（下段）→ 次の人
 *   工場カードの区画（5つ目）は、上段が工場カードの行動、下段が「1体を2マスまで動かす」
 * 上段と下段は、どちらも省いてよい。前の手番と同じ区画は選べない（ルスヴィエトは選べる）
 * だれかが6つ目の星を置いたら、その場で終わり、得点を数える
 */

import {
    MAP, FACTIONS, FACTION_KEYS, MATS, MAT_KEYS, BANNED, RESOURCES, BOTTOMS, BOTTOM_INFO, TOP_UPGRADES, ONE_TIME,
    STRUCTURES, MECH_ABILITIES, COMBAT_DECK, ENCOUNTER_CARDS, FACTORY_CARDS, TOPS, amountText, RESOURCE_NAMES, TERRAINS
} from './data.js';
import {
    WORKERS_MAX, POWER_MAX, POPULARITY_MAX, hexOf, isBoard, isFighter, unitsAt, structureAt, workersOnBoard,
    hasAbility, controllerOf, controlledHexes, resourceTotals, reachable, scoreOf, OBJECTIVES, STRUCTURE_BONUSES, terrainName
} from './rules.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const STARS_TO_END = 6;
export const MAX_TURNS = 400;       // 万一終わらないときの安全弁（全員の手番の合計）
const MAX_LOGS = 300;
const MAX_EVENTS = 200;
const MAX_DIAL = 7;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    section: ['index'], move: ['moves'], gain: [], produce: ['hexes'], trade: ['mode', 'res', 'hex'], bolster: ['choice'],
    factoryTop: [], skip: [], upgrade: ['top', 'bottom'], deploy: ['mech', 'hex'], build: ['structure', 'hex'],
    enlist: ['recruit', 'bonus'], factoryMove: ['moves'], combat: ['power', 'cards'], encounter: ['options'], factory: ['card']
};

const isInt = (v) => Number.isInteger(v);
const intList = (v, max) => Array.isArray(v) && v.length <= max && v.every(isInt);

// 記録する形に整える（型が違えば null）
function sanitize(command) {
    const c = command;
    switch (c.type) {
        case 'section': return isInt(c.index) ? { type: c.type, index: c.index } : null;
        case 'move': case 'factoryMove': {
            if (!Array.isArray(c.moves) || c.moves.length > 3) return null;
            const moves = [];
            for (const m of c.moves) {
                if (!m || !isInt(m.unit) || !isInt(m.to)) return null;
                const workers = m.workers ?? [];
                if (!intList(workers, WORKERS_MAX)) return null;
                moves.push({ unit: m.unit, to: m.to, carry: !!m.carry, workers: [...workers] });
            }
            return { type: c.type, moves };
        }
        case 'produce': return intList(c.hexes, 3) ? { type: c.type, hexes: [...c.hexes] } : null;
        case 'trade': {
            if (c.mode === 'popularity') return { type: c.type, mode: 'popularity' };
            if (c.mode !== 'res' || !isInt(c.hex) || !c.res || typeof c.res !== 'object') return null;
            const res = {};
            for (const [k, n] of Object.entries(c.res)) {
                if (!RESOURCES.includes(k) || !isInt(n) || n < 0) return null;
                if (n > 0) res[k] = n;
            }
            return { type: c.type, mode: 'res', res, hex: c.hex };
        }
        case 'bolster': return ['power', 'cards'].includes(c.choice) ? { type: c.type, choice: c.choice } : null;
        case 'gain': case 'factoryTop': case 'skip': return { type: c.type };
        case 'upgrade': return Object.hasOwn(TOP_UPGRADES, c.top) && isInt(c.bottom) ? { type: c.type, top: c.top, bottom: c.bottom } : null;
        case 'deploy': return isInt(c.mech) && isInt(c.hex) ? { type: c.type, mech: c.mech, hex: c.hex } : null;
        case 'build': return Object.hasOwn(STRUCTURES, c.structure) && isInt(c.hex) ? { type: c.type, structure: c.structure, hex: c.hex } : null;
        case 'enlist': return isInt(c.recruit) && Object.hasOwn(ONE_TIME, c.bonus) ? { type: c.type, recruit: c.recruit, bonus: c.bonus } : null;
        case 'combat': return isInt(c.power) && intList(c.cards, 6) ? { type: c.type, power: c.power, cards: [...c.cards] } : null;
        case 'encounter': return intList(c.options, 2) ? { type: c.type, options: [...c.options] } : null;
        case 'factory': return isInt(c.card) ? { type: c.type, card: c.card } : null;
        default: return null;
    }
}

// 費用の合計から、資源の部分を取り出す
const resourcePart = (cost) => Object.fromEntries(RESOURCES.filter(r => cost[r] > 0).map(r => [r, cost[r]]));

export default class Game {
    // players: [{ name, isCPU, faction?, mat? }]（勢力とマットを省くとランダム）、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.rng = seed;
        this.setupPlayers = players.map(p => ({ name: String(p.name ?? ''), isCPU: !!p.isCPU, ...(p.faction ? { faction: p.faction } : {}), ...(p.mat ? { mat: p.mat } : {}) }));
        const assigned = this.assign(this.setupPlayers);
        // 手番の順は、マットの番号の小さい順
        assigned.sort((a, b) => MATS[a.mat].no - MATS[b.mat].no);

        this.combatDeck = this.shuffle([...COMBAT_DECK]);
        this.combatDiscard = [];
        this.encounterDeck = this.shuffle(ENCOUNTER_CARDS.map((_, i) => i));
        this.factoryDeck = this.shuffle(FACTORY_CARDS.map((_, i) => i));
        const objectiveDeck = this.shuffle(OBJECTIVES.map((_, i) => i));
        this.structureBonus = Math.floor(this.random() * STRUCTURE_BONUSES.length);

        this.units = [];
        this.nextUnitId = 1;
        this.structures = [];
        this.res = MAP.hexes.map(() => ({ oil: 0, metal: 0, food: 0, wood: 0 }));
        this.encounters = MAP.hexes.filter(h => h.encounter).map(h => h.id);
        this.players = assigned.map((p, id) => {
            const f = FACTIONS[p.faction];
            const m = MATS[p.mat];
            return {
                id, name: p.name || `プレイヤー${id + 1}`, isCPU: p.isCPU, faction: p.faction, mat: p.mat,
                power: f.power, popularity: m.popularity, coins: m.coins, cards: [],
                objectives: objectiveDeck.splice(0, 2), doneObjectives: [],
                upgrades: { top: [], bottom: [0, 0, 0, 0] },
                mechs: [false, false, false, false],
                recruits: [false, false, false, false],
                oneTime: [],
                built: [],
                stars: {}, combatStars: 0, starCount: 0,
                lastSection: null, factoryCard: null, coercionUsed: false
            };
        });
        this.players.forEach(p => {
            for (let i = 0; i < FACTIONS[p.faction].cards; i++) this.drawCard(p.id);
            const home = MAP.homes[p.faction];
            this.addUnit(p.id, 'char', home);
            hexOf(home).adj.forEach(h => this.addUnit(p.id, 'worker', h));
        });

        this.turn = 0;
        this.turnCount = 0;          // 全員の手番の合計
        this.step = 'choose';
        this.section = null;
        this.resumeTo = null;        // 戦闘などのあとに戻る先（bottom か end）
        this.combatQueue = [];
        this.combat = null;
        this.encounter = null;
        this.factoryOffer = null;
        this.charMove = null;        // この行動で指導者が動いた先
        this.phase = 'play';
        this.winners = [];
        this.endReason = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players.map(p => `${p.name}（${FACTIONS[p.faction].name}・${MATS[p.mat].name}）`).join('、')}の順で始めます`);
    }

    // 勢力とマットを決める（省いた分はランダム。強すぎる組み合わせは避ける）
    assign(players) {
        const usedF = new Set(players.map(p => p.faction).filter(Boolean));
        const usedM = new Set(players.map(p => p.mat).filter(Boolean));
        return players.map(p => {
            const faction = p.faction ?? this.pick(FACTION_KEYS.filter(k => !usedF.has(k)));
            usedF.add(faction);
            let mats = MAT_KEYS.filter(k => !usedM.has(k));
            if (!p.mat) {
                const ok = mats.filter(m => !BANNED.some(([f, mm]) => f === faction && mm === m));
                if (ok.length > 0) mats = ok;
            }
            const mat = p.mat ?? this.pick(mats);
            usedM.add(mat);
            if (!FACTIONS[faction] || !MATS[mat]) throw new Error('勢力かマットが正しくありません');
            return { ...p, faction, mat };
        });
    }

    // ---- 乱数（状態を数で持つので、写しても同じ並びになる） ----

    random() {
        this.rng = (this.rng + 0x6D2B79F5) >>> 0;
        let t = this.rng;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    pick(list) {
        return list[Math.floor(this.random() * list.length)];
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // ---- 問い合わせ ----

    isOver() {
        return this.phase === 'end';
    }

    // 今操作が必要な人
    actors() {
        if (this.phase === 'end') return [];
        if (this.step === 'combat') return [this.combat.attacker, this.combat.defender].filter(s => !this.combat.choices[s]);
        return [this.turn];
    }

    topOf(section) {
        return section === 4 ? 'factoryTop' : MATS[this.players[this.turn].mat].tops[section];
    }

    bottomOf(section) {
        return section === 4 ? 'factoryMove' : BOTTOMS[section];
    }

    bottomCost(seat, index) {
        const p = this.players[seat];
        return MATS[p.mat].bottom[index].cost - p.upgrades.bottom[index];
    }

    moveLimit(seat) {
        return this.players[seat].upgrades.top.includes('moveUnits') ? 3 : 2;
    }

    produceLimit(seat) {
        return this.players[seat].upgrades.top.includes('produce') ? 3 : 2;
    }

    // 生産の費用（盤上の労働者が4人以上で力1、6人以上で人気1、8人で金1）
    produceCost(seat) {
        const n = workersOnBoard(this, seat);
        return { power: n >= 4 ? 1 : 0, popularity: n >= 6 ? 1 : 0, coins: n >= 8 ? 1 : 0 };
    }

    cardAllowance(seat, hex) {
        const here = unitsAt(this, hex).filter(u => u.seat === seat);
        let n = here.filter(isFighter).length;
        if (hasAbility(this, seat, 'peoplesArmy') && here.some(u => u.kind === 'worker')) n++;
        return n;
    }

    // ---- 費用 ----

    // 払えるか（資源は支配する領地から。クリミアは1手番に1回、足りない資源1つを戦闘カードで払える）
    canPay(seat, cost) {
        const p = this.players[seat];
        if ((cost.coins ?? 0) > p.coins || (cost.power ?? 0) > p.power || (cost.popularity ?? 0) > p.popularity) return false;
        let cards = p.cards.length - (cost.cards ?? 0);
        if (cards < 0) return false;
        const have = resourceTotals(this, seat);
        let short = 0;
        RESOURCES.forEach(r => { short += Math.max(0, (cost[r] ?? 0) - have[r]); });
        if (short === 0) return true;
        return short === 1 && this.canCoerce(seat) && cards >= 1;
    }

    canCoerce(seat) {
        const p = this.players[seat];
        return p.faction === 'crimea' && !p.coercionUsed && seat === this.turn;
    }

    pay(seat, cost) {
        const p = this.players[seat];
        p.coins -= cost.coins ?? 0;
        p.power -= cost.power ?? 0;
        p.popularity -= cost.popularity ?? 0;
        for (let i = 0; i < (cost.cards ?? 0); i++) this.discardLowest(seat);
        const have = resourceTotals(this, seat);
        const hexes = controlledHexes(this, seat);
        RESOURCES.forEach(r => {
            let need = cost[r] ?? 0;
            if (need > have[r]) {
                // 徴発：足りない1つを戦闘カードで払う
                p.coercionUsed = true;
                this.discardLowest(seat);
                need = have[r];
                this.log(`${p.name}が戦闘カードを${RESOURCE_NAMES[r]}の代わりに使いました`);
            }
            // 多く置いてある領地から取る
            const order = hexes.filter(h => this.res[h][r] > 0).sort((a, b) => this.res[b][r] - this.res[a][r] || a - b);
            for (const h of order) {
                if (need <= 0) break;
                const take = Math.min(need, this.res[h][r]);
                this.res[h][r] -= take;
                need -= take;
            }
        });
    }

    discardLowest(seat) {
        const cards = this.players[seat].cards;
        if (cards.length === 0) return;
        const index = cards.indexOf(Math.min(...cards));
        this.combatDiscard.push(cards.splice(index, 1)[0]);
    }

    drawCard(seat) {
        if (this.combatDeck.length === 0) {
            if (this.combatDiscard.length === 0) return;
            this.combatDeck = this.shuffle(this.combatDiscard);
            this.combatDiscard = [];
        }
        this.players[seat].cards.push(this.combatDeck.pop());
    }

    // もらう（資源と労働者は hex に置く）
    gain(seat, gain, hex = null) {
        const p = this.players[seat];
        p.coins += gain.coins ?? 0;
        p.power = Math.min(POWER_MAX, p.power + (gain.power ?? 0));
        p.popularity = Math.min(POPULARITY_MAX, p.popularity + (gain.popularity ?? 0));
        for (let i = 0; i < (gain.cards ?? 0); i++) this.drawCard(seat);
        if (hex !== null && isBoard(hex)) {
            RESOURCES.forEach(r => { this.res[hex][r] += gain[r] ?? 0; });
            const free = WORKERS_MAX - workersOnBoard(this, seat);
            for (let i = 0; i < Math.min(free, gain.workers ?? 0); i++) this.addUnit(seat, 'worker', hex);
        }
    }

    addUnit(seat, kind, hex) {
        const unit = { id: this.nextUnitId++, seat, kind, hex };
        this.units.push(unit);
        return unit;
    }

    // ---- 操作 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        const c = sanitize(command);
        if (!c) return this.fail('操作が正しくありません');
        const handlers = {
            choose: { section: this.chooseSection },
            top: { move: this.move, gain: this.gainCoins, produce: this.produce, trade: this.trade, bolster: this.bolster, factoryTop: this.factoryTop, skip: this.skipTop },
            combat: { combat: this.chooseCombat },
            encounter: { encounter: this.resolveEncounter },
            factory: { factory: this.takeFactoryCard },
            bottom: { upgrade: this.upgrade, deploy: this.deploy, build: this.build, enlist: this.enlist, factoryMove: this.factoryMove, skip: this.skipBottom }
        }[this.step];
        const handler = handlers?.[c.type];
        if (!handler) return this.fail('今はその操作はできません');
        if (!handler.call(this, playerId, c)) return false;
        this.commands.push({ playerId, command: c });
        this.afterCommand();
        return true;
    }

    afterCommand() {
        if (this.phase === 'end') return;
        this.checkObjectives(this.turn);
        this.checkStars();
        const winner = this.players.find(p => p.starCount >= STARS_TO_END);
        if (winner) this.endGame(`${winner.name}が6つ目の星を置きました`);
        else if (this.turnCount >= MAX_TURNS) this.endGame('手番の上限に達しました');
    }

    // { type: 'section', index }：区画を選ぶ（0〜3。工場カードがあれば 4）
    chooseSection(seat, { index }) {
        const p = this.players[seat];
        if (index < 0 || index > 4 || (index === 4 && p.factoryCard === null)) return this.fail('その区画はありません');
        if (index === p.lastSection && p.faction !== 'rusviet') return this.fail('前の手番と同じ区画は選べません');
        this.section = index;
        this.step = 'top';
        return true;
    }

    // 上段を行ったときの、建物（武器庫・記念碑）の恩恵
    topDone(seat) {
        const p = this.players[seat];
        if (this.section === 4) return;
        const type = MATS[p.mat].structures[this.section];
        if (!p.built.includes(type)) return;
        if (type === 'armory') this.gain(seat, { power: 1 });
        if (type === 'monument') this.gain(seat, { popularity: 1 });
    }

    toBottom() {
        this.step = 'bottom';
    }

    // { type: 'skip' }（上段）：上段を省く
    skipTop() {
        this.toBottom();
        return true;
    }

    requireTop(key) {
        if (this.topOf(this.section) !== key) return this.fail(`この区画の上段は${TOPS[this.topOf(this.section)]?.name ?? '工場カード'}です`);
        return true;
    }

    // { type: 'gain' }：移動の代わりに金を得る
    gainCoins(seat) {
        if (!this.requireTop('move')) return false;
        const n = this.players[seat].upgrades.top.includes('gainCoins') ? 2 : 1;
        this.gain(seat, { coins: n });
        this.log(`${this.players[seat].name}が金${n}を得ました`);
        this.emit({ type: 'gain', seat, gain: { coins: n } });
        this.topDone(seat);
        this.toBottom();
        return true;
    }

    // { type: 'bolster', choice: 'power'|'cards' }：金1を払って、力かカード
    bolster(seat, { choice }) {
        if (!this.requireTop('bolster')) return false;
        const p = this.players[seat];
        if (p.coins < 1) return this.fail('金が足りません');
        p.coins -= 1;
        const up = p.upgrades.top.includes(choice);
        const gain = choice === 'power' ? { power: up ? 3 : 2 } : { cards: up ? 2 : 1 };
        this.gain(seat, gain);
        this.log(`${p.name}が支持で${amountText(gain)}を得ました`);
        this.emit({ type: 'gain', seat, gain });
        this.topDone(seat);
        this.toBottom();
        return true;
    }

    // { type: 'trade', mode: 'res', res, hex } か { mode: 'popularity' }：金1を払って、資源2つか人気
    trade(seat, c) {
        if (!this.requireTop('trade')) return false;
        const p = this.players[seat];
        if (p.coins < 1) return this.fail('金が足りません');
        if (c.mode === 'res') {
            const total = Object.values(c.res).reduce((a, b) => a + b, 0);
            if (total !== 2) return this.fail('資源を2つ選んでください');
            if (!isBoard(c.hex) || !unitsAt(this, c.hex).some(u => u.seat === seat && u.kind === 'worker')) return this.fail('自分の労働者がいる領地に置きます');
            p.coins -= 1;
            this.gain(seat, c.res, c.hex);
            this.log(`${p.name}が交易で${amountText(c.res)}を得ました`);
            this.emit({ type: 'gain', seat, gain: c.res, hex: c.hex });
        } else {
            p.coins -= 1;
            const gain = { popularity: p.upgrades.top.includes('popularity') ? 2 : 1 };
            this.gain(seat, gain);
            this.log(`${p.name}が交易で人気${gain.popularity}を得ました`);
            this.emit({ type: 'gain', seat, gain });
        }
        this.topDone(seat);
        this.toBottom();
        return true;
    }

    // { type: 'produce', hexes }：労働者のいる領地（2か所、アップグレードで3か所）で生産する
    produce(seat, { hexes }) {
        if (!this.requireTop('produce')) return false;
        const p = this.players[seat];
        if (hexes.length === 0) return this.fail('領地を選んでください');
        if (hexes.length > this.produceLimit(seat)) return this.fail(`生産できるのは${this.produceLimit(seat)}か所までです`);
        if (new Set(hexes).size !== hexes.length) return this.fail('同じ領地は1回だけです');
        const mill = (h) => this.structures.some(s => s.seat === seat && s.type === 'mill' && s.hex === h);
        for (const h of hexes) {
            if (!isBoard(h)) return this.fail('その領地では生産できません');
            if (!unitsAt(this, h).some(u => u.seat === seat && u.kind === 'worker') && !(mill(h) && controllerOf(this, h) === seat)) return this.fail('自分の労働者のいる領地を選んでください');
        }
        const cost = this.produceCost(seat);
        if (!this.canPay(seat, cost)) return this.fail('生産の費用が払えません');
        this.pay(seat, cost);
        const made = [];
        hexes.forEach(h => {
            const n = unitsAt(this, h).filter(u => u.seat === seat && u.kind === 'worker').length + (mill(h) ? 1 : 0);
            const kind = TERRAINS[hexOf(h).terrain].produces;
            if (kind === 'worker') {
                const add = Math.min(n, WORKERS_MAX - workersOnBoard(this, seat));
                for (let i = 0; i < add; i++) this.addUnit(seat, 'worker', h);
                if (add > 0) made.push({ hex: h, kind: 'workers', n: add });
            } else if (kind) {
                this.res[h][kind] += n;
                made.push({ hex: h, kind, n });
            }
        });
        this.log(`${p.name}が生産しました（${made.map(m => `${m.kind === 'workers' ? '労働者' : RESOURCE_NAMES[m.kind]}${m.n}`).join('・') || 'なし'}）`);
        this.emit({ type: 'produce', seat, made });
        this.topDone(seat);
        this.toBottom();
        return true;
    }

    // { type: 'factoryTop' }：工場カードの上段
    factoryTop(seat) {
        if (this.section !== 4) return this.fail('工場カードの区画ではありません');
        const card = FACTORY_CARDS[this.players[seat].factoryCard];
        if (!this.canPay(seat, card.cost)) return this.fail('費用が払えません');
        this.pay(seat, card.cost);
        this.gain(seat, card.gain);
        this.log(`${this.players[seat].name}が工場カードで${amountText(card.gain)}を得ました`);
        this.emit({ type: 'gain', seat, gain: card.gain });
        this.toBottom();
        return true;
    }

    // { type: 'move', moves: [{ unit, to, workers, carry }] }：2体（アップグレードで3体）を動かす
    move(seat, { moves }) {
        if (!this.requireTop('move')) return false;
        if (moves.length === 0) return this.fail('動かすユニットを選んでください');
        if (!this.doMoves(seat, moves, this.moveLimit(seat), null)) return false;
        this.topDone(seat);
        this.afterMove(seat, 'bottom');
        return true;
    }

    // { type: 'factoryMove', moves: [1つ] }：工場カードの下段。1体を2マスまで
    factoryMove(seat, { moves }) {
        if (this.section !== 4) return this.fail('工場カードの区画ではありません');
        if (moves.length !== 1) return this.fail('1体だけ動かせます');
        if (!this.doMoves(seat, moves, 1, 2)) return false;
        this.afterMove(seat, 'end');
        return true;
    }

    // 移動を確かめてから行う。range が null なら、ユニットごとの歩数（速さで2）
    doMoves(seat, moves, limit, range) {
        if (moves.length > limit) return this.fail(`動かせるのは${limit}体までです`);
        // 写しの上で順に確かめる（断るときは本物の状態を変えない）
        const S = { players: this.players, units: this.units.map(u => ({ ...u })), structures: this.structures, res: this.res, encounters: this.encounters };
        const moved = new Set();
        const plan = [];
        for (const m of moves) {
            const unit = S.units.find(u => u.id === m.unit);
            if (!unit || unit.seat !== seat) return this.fail('自分のユニットを選んでください');
            if (moved.has(unit.id)) return this.fail('同じユニットは1回だけ動かせます');
            const steps = range ?? (isFighter(unit) && hasAbility(this, seat, 'speed') ? 2 : 1);
            if (!reachable(S, unit, steps).has(m.to)) return this.fail('そこへは動かせません');
            if (m.workers.length > 0) {
                if (unit.kind !== 'mech') return this.fail('労働者を運べるのはメックだけです');
                if (hexOf(m.to).terrain === 'lake') return this.fail('労働者は湖に入れません');
                if (new Set(m.workers).size !== m.workers.length) return this.fail('同じ労働者が2回選ばれています');
                for (const id of m.workers) {
                    const w = S.units.find(u => u.id === id);
                    if (!w || w.seat !== seat || w.kind !== 'worker' || w.hex !== unit.hex || moved.has(id)) return this.fail('運べない労働者が入っています');
                }
            }
            const from = unit.hex;
            unit.hex = m.to;
            moved.add(unit.id);
            m.workers.forEach(id => {
                S.units.find(u => u.id === id).hex = m.to;
                moved.add(id);
            });
            plan.push({ unit: unit.id, kind: unit.kind, from, to: m.to, workers: [...m.workers], carry: m.carry && isBoard(from) && isBoard(m.to) });
        }
        // 受け付ける。資源は、運ぶと決めた移動の順に、元の領地から全部運ぶ
        const p = this.players[seat];
        plan.forEach(m => {
            const unit = this.units.find(u => u.id === m.unit);
            unit.hex = m.to;
            m.workers.forEach(id => { this.units.find(u => u.id === id).hex = m.to; });
            if (m.carry) {
                RESOURCES.forEach(r => {
                    this.res[m.to][r] += this.res[m.from][r];
                    this.res[m.from][r] = 0;
                });
            }
            if (m.kind === 'char') this.charMove = m.to;
        });
        this.log(`${p.name}が${plan.map(m => `${this.unitName(m.kind)}を${this.placeName(m.to)}へ`).join('、')}動かしました`);
        this.emit({ type: 'move', seat, moves: plan.map(m => ({ unit: m.unit, from: m.from, to: m.to, workers: m.workers })) });
        return true;
    }

    unitName(kind) {
        return { char: '指導者', mech: 'メック', worker: '労働者' }[kind];
    }

    placeName(hex) {
        const h = hexOf(hex);
        return h.terrain === 'home' ? `${FACTIONS[h.home].name}の本拠地` : terrainName(hex);
    }

    // 移動のあと：労働者だけの領地からは労働者を退かせ、戦闘を並べる
    afterMove(seat, resumeTo) {
        const p = this.players[seat];
        this.resumeTo = resumeTo;
        const hexes = [...new Set(this.units.filter(u => u.seat === seat && isFighter(u)).map(u => u.hex))].filter(isBoard);
        this.combatQueue = [];
        hexes.forEach(h => {
            const enemies = unitsAt(this, h).filter(u => u.seat !== seat);
            if (enemies.length === 0) return;
            const fighters = enemies.filter(isFighter);
            if (fighters.length > 0) {
                this.combatQueue.push(h);
                return;
            }
            // 労働者だけなら、本拠地へ退く。退かせた数だけ人気が下がる（友愛なら下がらない）
            const bySeat = new Map();
            enemies.forEach(u => {
                u.hex = MAP.homes[this.players[u.seat].faction];
                bySeat.set(u.seat, (bySeat.get(u.seat) ?? 0) + 1);
            });
            const lose = hasAbility(this, seat, 'camaraderie') ? 0 : enemies.length;
            p.popularity = Math.max(0, p.popularity - lose);
            bySeat.forEach((n, s) => this.log(`${this.players[s].name}の労働者${n}人が本拠地へ退きました${lose ? `（${p.name}の人気−${n}）` : ''}`));
            this.emit({ type: 'retreat', seat, hex: h, workers: enemies.length, popularity: lose });
        });
        this.nextCombat();
    }

    nextCombat() {
        const seat = this.turn;
        while (this.combatQueue.length > 0) {
            const hex = this.combatQueue.shift();
            const enemy = unitsAt(this, hex).find(u => u.seat !== seat && isFighter(u));
            if (!enemy || !unitsAt(this, hex).some(u => u.seat === seat && isFighter(u))) continue;
            this.startCombat(hex, seat, enemy.seat);
            return;
        }
        this.combat = null;
        this.afterCombats();
    }

    startCombat(hex, attacker, defender) {
        const notes = [];
        // 戦闘の前の能力（偵察・砲撃・武装解除）。持っていれば自動で使う
        [[attacker, defender], [defender, attacker]].forEach(([me, foe]) => {
            const P = this.players[me];
            const F = this.players[foe];
            if (hasAbility(this, me, 'scout') && F.cards.length > 0) {
                const card = F.cards.splice(Math.floor(this.random() * F.cards.length), 1)[0];
                P.cards.push(card);
                notes.push(`${P.name}の偵察で、${F.name}の戦闘カードを1枚奪いました`);
            }
            if (hasAbility(this, me, 'artillery') && P.power >= 1 && F.power > 0) {
                P.power -= 1;
                F.power = Math.max(0, F.power - 2);
                notes.push(`${P.name}の砲撃で、${F.name}の力が2下がりました`);
            }
            if (hasAbility(this, me, 'disarm') && hexOf(hex).tunnel && F.power > 0) {
                F.power = Math.max(0, F.power - 2);
                notes.push(`${P.name}の武装解除で、${F.name}の力が2下がりました`);
            }
        });
        notes.forEach(n => this.log(n));
        this.combat = { hex, attacker, defender, choices: {} };
        this.step = 'combat';
        this.log(`${this.players[attacker].name}と${this.players[defender].name}が${terrainName(hex)}で戦います`);
        this.emit({ type: 'combat-start', hex, attacker, defender });
    }

    // { type: 'combat', power, cards }：力（0〜7）と戦闘カード（領地の指導者とメックの数まで）を選ぶ
    chooseCombat(seat, { power, cards }) {
        const p = this.players[seat];
        if (power < 0 || power > Math.min(MAX_DIAL, p.power)) return this.fail(`力は0〜${Math.min(MAX_DIAL, p.power)}です`);
        if (cards.length > this.cardAllowance(seat, this.combat.hex)) return this.fail('使えるカードの枚数を超えています');
        const hand = [...p.cards];
        for (const v of cards) {
            const i = hand.indexOf(v);
            if (i < 0) return this.fail('持っていないカードです');
            hand.splice(i, 1);
        }
        this.combat.choices[seat] = { power, cards: [...cards] };
        if (this.actors().length === 0) this.resolveCombat();
        return true;
    }

    resolveCombat() {
        const { hex, attacker, defender, choices } = this.combat;
        const total = (s) => choices[s].power + choices[s].cards.reduce((a, b) => a + b, 0);
        const a = total(attacker);
        const d = total(defender);
        const winner = a >= d ? attacker : defender;
        const loser = winner === attacker ? defender : attacker;
        [attacker, defender].forEach(s => {
            const p = this.players[s];
            p.power -= choices[s].power;
            choices[s].cards.forEach(v => {
                p.cards.splice(p.cards.indexOf(v), 1);
                this.combatDiscard.push(v);
            });
        });
        const W = this.players[winner];
        const L = this.players[loser];
        let star = false;
        if (W.combatStars < 2 || W.faction === 'saxony') {
            W.combatStars++;
            star = true;
        }
        const losers = unitsAt(this, hex).filter(u => u.seat === loser);
        const workers = losers.filter(u => u.kind === 'worker').length;
        losers.forEach(u => { u.hex = MAP.homes[L.faction]; });
        let popularity = 0;
        if (winner === attacker && workers > 0 && !hasAbility(this, attacker, 'camaraderie')) {
            popularity = Math.min(W.popularity, workers);
            W.popularity -= popularity;
        }
        if (choices[loser].power > 0) this.drawCard(loser);
        this.log(`戦闘：${this.players[attacker].name} ${a}（力${choices[attacker].power}＋カード${choices[attacker].cards.join('+') || 0}）対 ${this.players[defender].name} ${d}（力${choices[defender].power}＋カード${choices[defender].cards.join('+') || 0}）。${W.name}の勝ち${star ? '（星）' : ''}`);
        if (popularity) this.log(`${W.name}は労働者を退かせたので、人気−${popularity}`);
        this.emit({
            type: 'combat', hex, attacker, defender, winner,
            choices: { [attacker]: choices[attacker], [defender]: choices[defender] }, totals: { [attacker]: a, [defender]: d }, star, popularity
        });
        this.combat = null;
        this.nextCombat();
    }

    // 戦闘のあと：指導者が遭遇の印か工場に着いていれば、それを行う
    afterCombats() {
        const seat = this.turn;
        const p = this.players[seat];
        const char = this.units.find(u => u.seat === seat && u.kind === 'char');
        const at = this.charMove;
        this.charMove = null;
        if (at !== null && char.hex === at && this.encounters.includes(at)) {
            if (this.encounterDeck.length === 0) this.encounterDeck = this.shuffle(ENCOUNTER_CARDS.map((_, i) => i));
            this.encounter = { card: this.encounterDeck.pop(), hex: at };
            this.encounters = this.encounters.filter(h => h !== at);
            this.step = 'encounter';
            this.log(`${p.name}の指導者が遭遇しました`);
            this.emit({ type: 'encounter-start', seat, hex: at, card: this.encounter.card });
            return;
        }
        if (at !== null && char.hex === MAP.factory && at === MAP.factory && p.factoryCard === null && this.factoryDeck.length > 0) {
            this.factoryOffer = this.factoryDeck.splice(-Math.min(3, this.factoryDeck.length));
            this.step = 'factory';
            this.log(`${p.name}の指導者が工場に着きました`);
            return;
        }
        this.resume();
    }

    resume() {
        if (this.resumeTo === 'bottom') this.toBottom();
        else this.endTurn();
    }

    // { type: 'encounter', options: [番号] }：遭遇カードの選択肢を選ぶ（ポラニアは2つまで）
    resolveEncounter(seat, { options }) {
        const p = this.players[seat];
        const max = p.faction === 'polania' ? 2 : 1;
        if (options.length < 1 || options.length > max) return this.fail(max === 2 ? '1つか2つ選んでください' : '1つ選んでください');
        if (new Set(options).size !== options.length || options.some(o => o < 0 || o > 2)) return this.fail('選択肢が正しくありません');
        const card = ENCOUNTER_CARDS[this.encounter.card];
        const total = {};
        options.forEach(o => Object.entries(card[o].cost ?? {}).forEach(([k, n]) => { total[k] = (total[k] ?? 0) + n; }));
        if (!this.canPay(seat, total)) return this.fail('費用が払えません');
        options.forEach(o => {
            this.pay(seat, card[o].cost ?? {});
            this.gain(seat, card[o].gain, this.encounter.hex);
        });
        this.log(`${p.name}が遭遇で${options.map(o => amountText(card[o].gain)).join('、')}を得ました`);
        this.emit({ type: 'gain', seat, gain: options.reduce((acc, o) => { Object.entries(card[o].gain).forEach(([k, n]) => { acc[k] = (acc[k] ?? 0) + n; }); return acc; }, {}), hex: this.encounter.hex });
        this.encounter = null;
        // 遭遇の印が工場の上にはないので、工場は見なくてよい
        this.resume();
        return true;
    }

    // { type: 'factory', card }：工場で、見せられたカードから1枚もらう
    takeFactoryCard(seat, { card }) {
        if (!this.factoryOffer.includes(card)) return this.fail('そのカードはありません');
        this.players[seat].factoryCard = card;
        this.factoryDeck.unshift(...this.factoryOffer.filter(c => c !== card));
        this.factoryOffer = null;
        this.log(`${this.players[seat].name}が工場カードを手に入れました（5つ目の区画）`);
        this.emit({ type: 'factory', seat, card });
        this.resume();
        return true;
    }

    // ---- 下段 ----

    requireBottom(key) {
        if (this.bottomOf(this.section) !== key) return this.fail(`この区画の下段は${BOTTOM_INFO[this.bottomOf(this.section)]?.name ?? '工場の移動'}です`);
        return true;
    }

    // 下段を行ったあとの共通の処理：マットの金と、募集の常時の恩恵（自分と両隣）
    bottomDone(seat, index) {
        const p = this.players[seat];
        const coins = MATS[p.mat].bottom[index].coins;
        if (coins) this.gain(seat, { coins });
        const n = this.players.length;
        const seats = [...new Set([seat, (seat + 1) % n, (seat + n - 1) % n])];
        seats.forEach(s => {
            if (!this.players[s].recruits[index]) return;
            const key = BOTTOM_INFO[BOTTOMS[index]].ongoing;
            this.gain(s, { [key]: 1 });
            this.emit({ type: 'gain', seat: s, gain: { [key]: 1 }, ongoing: true });
        });
        this.endTurn();
    }

    // { type: 'upgrade', top, bottom }：上段の場所を1つよくし、下段の費用を1下げる
    upgrade(seat, { top, bottom }) {
        if (!this.requireBottom('upgrade')) return false;
        const p = this.players[seat];
        if (p.upgrades.top.includes(top)) return this.fail('そこはもうアップグレードしています');
        const mat = MATS[p.mat].bottom[bottom];
        if (!mat || this.bottomCost(seat, bottom) <= mat.min) return this.fail('その下段の費用はもう下げられません');
        const cost = { oil: this.bottomCost(seat, 0) };
        if (!this.canPay(seat, cost)) return this.fail('石油が足りません');
        this.pay(seat, cost);
        p.upgrades.top.push(top);
        p.upgrades.bottom[bottom]++;
        this.log(`${p.name}がアップグレードしました（${TOP_UPGRADES[top].name}、${BOTTOM_INFO[BOTTOMS[bottom]].name}の費用−1）`);
        this.emit({ type: 'upgrade', seat, top, bottom });
        this.bottomDone(seat, 0);
        return true;
    }

    // { type: 'deploy', mech, hex }：自分の労働者のいる領地にメックを出す
    deploy(seat, { mech, hex }) {
        if (!this.requireBottom('deploy')) return false;
        const p = this.players[seat];
        if (mech < 0 || mech > 3 || p.mechs[mech]) return this.fail('そのメックはもう出しています');
        if (!isBoard(hex) || !unitsAt(this, hex).some(u => u.seat === seat && u.kind === 'worker')) return this.fail('自分の労働者のいる領地に出します');
        const cost = { metal: this.bottomCost(seat, 1) };
        if (!this.canPay(seat, cost)) return this.fail('金属が足りません');
        this.pay(seat, cost);
        p.mechs[mech] = true;
        this.addUnit(seat, 'mech', hex);
        const ability = FACTIONS[p.faction].mechs[mech];
        this.log(`${p.name}がメックを出しました（${MECH_ABILITIES[ability].name}）`);
        this.emit({ type: 'deploy', seat, hex, ability });
        this.bottomDone(seat, 1);
        return true;
    }

    // { type: 'build', structure, hex }：自分の労働者のいる領地に建物を建てる（1つの領地に1つ。湖と工場には建てない）
    build(seat, { structure, hex }) {
        if (!this.requireBottom('build')) return false;
        const p = this.players[seat];
        if (p.built.includes(structure)) return this.fail('その建物はもう建てています');
        if (!isBoard(hex) || hex === MAP.factory || !unitsAt(this, hex).some(u => u.seat === seat && u.kind === 'worker')) return this.fail('自分の労働者のいる領地に建てます');
        if (structureAt(this, hex)) return this.fail('その領地にはもう建物があります');
        const cost = { wood: this.bottomCost(seat, 2) };
        if (!this.canPay(seat, cost)) return this.fail('木材が足りません');
        this.pay(seat, cost);
        p.built.push(structure);
        this.structures.push({ seat, type: structure, hex });
        this.log(`${p.name}が${terrainName(hex)}に${STRUCTURES[structure].name}を建てました`);
        this.emit({ type: 'build', seat, hex, structure });
        this.bottomDone(seat, 2);
        return true;
    }

    // { type: 'enlist', recruit, bonus }：下段の1つに新兵を置き（常時の恩恵）、1回だけの恩恵を1つもらう
    enlist(seat, { recruit, bonus }) {
        if (!this.requireBottom('enlist')) return false;
        const p = this.players[seat];
        if (recruit < 0 || recruit > 3 || p.recruits[recruit]) return this.fail('そこにはもう新兵がいます');
        if (p.oneTime.includes(bonus)) return this.fail('その恩恵はもうもらっています');
        const cost = { food: this.bottomCost(seat, 3) };
        if (!this.canPay(seat, cost)) return this.fail('食料が足りません');
        this.pay(seat, cost);
        p.recruits[recruit] = true;
        p.oneTime.push(bonus);
        const gain = { [bonus]: 2 };
        this.gain(seat, gain);
        this.log(`${p.name}が募集しました（${ONE_TIME[bonus].name}、${BOTTOM_INFO[BOTTOMS[recruit]].name}の常時の恩恵）`);
        this.emit({ type: 'enlist', seat, recruit, bonus });
        this.bottomDone(seat, 3);
        return true;
    }

    // { type: 'skip' }（下段）：下段を省いて手番を終える
    skipBottom() {
        this.endTurn();
        return true;
    }

    endTurn() {
        const p = this.players[this.turn];
        this.checkObjectives(this.turn);
        p.lastSection = this.section;
        p.coercionUsed = false;
        this.section = null;
        this.resumeTo = null;
        this.turnCount++;
        this.turn = (this.turn + 1) % this.players.length;
        this.step = 'choose';
    }

    // ---- 星 ----

    // 自分の手番に、目標を満たしていれば公開する（1枚まで。サクソニーは2枚とも）
    checkObjectives(seat) {
        const p = this.players[seat];
        if (this.phase === 'end') return;
        const S = this.boardState();
        p.objectives.forEach(id => {
            if (p.doneObjectives.includes(id)) return;
            if (p.doneObjectives.length >= 1 && p.faction !== 'saxony') return;
            if (!OBJECTIVES[id].test(S, seat)) return;
            p.doneObjectives.push(id);
            this.log(`${p.name}が目標を達成しました（${OBJECTIVES[id].text}）`);
            this.emit({ type: 'objective', seat, objective: id });
        });
    }

    checkStars() {
        this.players.forEach(p => {
            const s = p.stars;
            const before = p.starCount;
            const set = (key, ok) => { if (ok && !s[key]) s[key] = true; };
            set('upgrade', p.upgrades.top.length >= 6);
            set('mech', p.mechs.every(Boolean));
            set('build', p.built.length >= 4);
            set('enlist', p.recruits.every(Boolean));
            set('workers', workersOnBoard(this, p.id) >= WORKERS_MAX);
            set('popularity', p.popularity >= POPULARITY_MAX);
            set('power', p.power >= POWER_MAX);
            p.starCount = Object.keys(s).length + p.doneObjectives.length + p.combatStars;
            if (p.starCount > before) {
                this.log(`${p.name}が星を置きました（${p.starCount}つ目）`);
                this.emit({ type: 'star', seat: p.id, count: p.starCount });
            }
        });
    }

    // ルールの関数に渡す形（rules.js の S）
    boardState() {
        return {
            players: this.players.map(p => ({ ...p, cardCount: p.cards.length })),
            units: this.units, structures: this.structures, res: this.res, encounters: this.encounters
        };
    }

    results() {
        const S = this.boardState();
        return this.players.map(p => scoreOf(S, p.id, this.structureBonus));
    }

    endGame(reason) {
        this.phase = 'end';
        this.step = 'end';
        this.endReason = reason;
        const results = this.results();
        const best = Math.max(...results.map(r => r.total));
        this.winners = results.filter(r => r.total === best).map(r => r.seat);
        this.log(reason);
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです（${best}点）`);
        this.emit({ type: 'end', winners: [...this.winners], results, reason });
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

    // CPU が手を試すための写し（記録・ログ・イベントは持たない）
    clone() {
        const g = Object.create(Game.prototype);
        for (const [key, value] of Object.entries(this)) {
            if (key === 'commands' || key === 'logs' || key === 'events') g[key] = [];
            else g[key] = typeof value === 'object' && value !== null ? structuredClone(value) : value;
        }
        return g;
    }

    // 保存する形（参加者・設定・操作の記録）。オンライン対戦のサーバーもこの形で保存する
    persist() {
        return {
            players: structuredClone(this.setupPlayers),
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

export { hexOf, MAP };
