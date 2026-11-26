/**
 * ルート（Root）のゲームの進行。基本セットの4陣営（侯爵家・鷲の王朝・森林連合・放浪者）と秋の地図
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札・遺跡・サイコロはシードから決まる）
 *
 * 操作は、legalActions(seat) が返す一覧のどれかに合うものだけを受け付ける（画面・CPU・検証が同じ一覧を使う）
 * 断る操作は状態を変えない（一覧と照らすだけで、受け付けが決まってから変える）
 *
 * 進め方
 * - phase：setup（陣営の準備）→ birdsong（鳥の歌）→ daylight（昼）→ evening（夕方）→ 次の人の birdsong … → end
 * - step：陣営ごとの手順（決めることがないときは、自動で次へ進む）
 * - prompts：手番の人以外が答える割り込み（待ち伏せ・野戦病院）。答えが来るまで進まない
 *
 * 公式ルールから割り切った点（README に書く）
 * - 打撃で除く建物・トークンの順、放浪者が傷めるアイテム、憤激で渡すカード、木材の払い方、放浪者が回復させるアイテムは自動で選ぶ
 * - 武具師・工兵・非情な戦術は、効くときに自動で使う
 * - 放浪者の同盟の兵を連れて動く・一緒に戦う効果は入れていない
 */

import { createRandom, shuffle } from './random.js';
import {
    CLEARINGS, adjacency, FORESTS, forestAdjacency, CARDS, ITEM_SUPPLY, RUIN_ITEMS, ITEM_NAMES, SUIT_NAMES, CORNERS,
    OPPOSITE_CORNER, FACTIONS, FACTION_INFO, MARQUISE_COST, MARQUISE_VP, MARQUISE_DRAW_AT, MARQUISE_WARRIORS, MARQUISE_WOOD,
    BUILDING_NAMES, EYRIE_WARRIORS, ROOST_VP, ROOST_DRAW_AT, DECREE, DECREE_NAMES, LEADERS, ALLIANCE_WARRIORS,
    SYMPATHY_COST, SYMPATHY_VP, CHARACTERS, RELATION_NAMES, RELATION_STEPS, QUESTS, WIN_SCORE, HAND_LIMIT, MAX_ROUNDS
} from './data.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
const MAX_LOGS = 400;
const MAX_EVENTS = 200;
const WARRIOR_TOTAL = { marquise: MARQUISE_WARRIORS, eyrie: EYRIE_WARRIORS, alliance: ALLIANCE_WARRIORS, vagabond: 0 };
const ROOST_TOTAL = 7;
const SYMPATHY_TOTAL = 10;
const BUILD_KINDS = ['sawmill', 'workshop', 'recruiter'];

// 操作の種類ごとに、記録する項目（オンライン対戦でも、この項目だけを受け取る）
export const COMMAND_FIELDS = {
    next: [], discard: ['cards'],
    keep: ['clearing'], place: ['clearing'], corner: ['clearing'], leader: ['leader'], character: ['character'], forest: ['forest'],
    move: ['from', 'to', 'count', 'card'], battle: ['clearing', 'defender', 'card'], craft: ['card'],
    recruit: ['clearing'], build: ['kind', 'clearing'], overwork: ['card', 'clearing'], hawks: ['card'],
    decree: ['card', 'column'], newRoost: ['clearing'],
    revolt: ['clearing'], spread: ['clearing'], mobilize: ['card'], train: ['card'], organize: ['clearing'],
    slip: ['clearing', 'forest'], explore: [], aid: ['target', 'card'], quest: ['quest', 'reward'], strike: ['target'],
    repair: ['item'], steal: ['target'], daylabor: ['card'], hideout: [],
    dominance: ['card'], takeDominance: ['card', 'pay'], royal: ['card'], stand: ['card', 'target'], bank: ['card', 'target'],
    tax: ['card', 'clearing'], peek: ['card', 'target'],
    ambush: ['card'], counter: ['card'], hospital: ['card']
};

const cardOf = (id) => CARDS[id];
// 鳥のカードは、どの印としても使える
export const matches = (id, suit) => cardOf(id).suit === suit || cardOf(id).suit === 'bird';
const sum = (list) => list.reduce((s, v) => s + v, 0);

export default class Game {
    // players: [{ name, isCPU, faction }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const factions = players.map(p => p.faction);
        if (factions.some(f => !FACTIONS.includes(f)) || new Set(factions).size !== factions.length) throw new Error('陣営が正しくありません');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        // level：CPU の強さ（'easy' のときだけ持つ。ふつうは省く）
        this.options = { seed, ...(options.level === 'easy' ? { level: 'easy' } : {}) };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, faction: p.faction,
            hand: [], score: 0, effects: [], crafted: [], dominance: null, coalition: null
        }));
        this.seatOf = {};
        this.players.forEach(p => { this.seatOf[p.faction] = p.id; });
        this.map = CLEARINGS.map(() => ({ warriors: {}, buildings: [], tokens: [], ruin: null }));
        const ruinItems = shuffle([...RUIN_ITEMS], this.random);
        CLEARINGS.filter(c => c.ruin).forEach((c, i) => { this.map[c.id].ruin = ruinItems[i]; });
        this.items = { ...ITEM_SUPPLY };
        this.deck = shuffle(CARDS.map(c => c.id), this.random);
        this.discardPile = [];
        this.dominancePool = [];
        this.fs = {};
        if (this.has('marquise')) this.fs.marquise = {};
        if (this.has('eyrie')) this.fs.eyrie = { leader: null, deposed: [], decree: { recruit: [], move: [], battle: [], build: [] } };
        if (this.has('alliance')) this.fs.alliance = { supporters: [], officers: 0 };
        if (this.has('vagabond')) {
            const relations = {};
            factions.filter(f => f !== 'vagabond').forEach(f => { relations[f] = 'indifferent'; });
            this.fs.vagabond = {
                character: null, items: [], clearing: null, forest: null, relations, quests: [], completed: [],
                questDeck: shuffle(QUESTS.map(q => q.id), this.random)
            };
        }
        this.firstSeat = Math.floor(this.random() * players.length);
        this.round = 0;
        this.turn = this.firstSeat;
        this.phase = 'setup';
        this.step = null;
        this.setupQueue = FACTIONS.filter(f => this.has(f));
        this.prompts = [];
        this.battle = null;
        this.hospitalQueue = [];
        this.tt = this.newTurnState();
        this.winners = [];
        this.endReason = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.peek = null;
        this.players.forEach(p => this.draw(p.id, 5, true));
        this.log(`${this.players[this.firstSeat].name}から始めます`);
        this.nextSetup();
        this.autoAdvance();
    }

    // ---- 調べる道具 ----

    has(faction) {
        return this.seatOf[faction] !== undefined;
    }

    factionOf(seat) {
        return this.players[seat].faction;
    }

    nameOf(faction) {
        return this.players[this.seatOf[faction]]?.name ?? FACTION_INFO[faction].name;
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作が必要な人
    actors() {
        if (this.isOver()) return [];
        if (this.prompts.length > 0) return [this.prompts[0].seat];
        return [this.turn];
    }

    warriors(c, f) {
        return this.map[c].warriors[f] ?? 0;
    }

    warriorsOnMap(f) {
        return sum(this.map.map(m => m.warriors[f] ?? 0));
    }

    supply(f) {
        return WARRIOR_TOTAL[f] - this.warriorsOnMap(f) - (f === 'alliance' ? this.fs.alliance.officers : 0);
    }

    buildingCount(f, kind) {
        return sum(this.map.map(m => m.buildings.filter(b => b.faction === f && (!kind || b.kind === kind)).length));
    }

    tokenCount(f, kind) {
        return sum(this.map.map(m => m.tokens.filter(t => t.faction === f && (!kind || t.kind === kind)).length));
    }

    hasBuilding(c, f, kind) {
        return this.map[c].buildings.some(b => b.faction === f && (!kind || b.kind === kind));
    }

    hasToken(c, f, kind) {
        return this.map[c].tokens.some(t => t.faction === f && (!kind || t.kind === kind));
    }

    freeSlots(c) {
        return CLEARINGS[c].slots - this.map[c].buildings.length - (this.map[c].ruin ? 1 : 0);
    }

    keepClearing() {
        return this.map.findIndex(m => m.tokens.some(t => t.kind === 'keep'));
    }

    // ほかの陣営は、本拠のある空き地に駒を置けない
    canPlace(f, c) {
        return f === 'marquise' || this.keepClearing() !== c;
    }

    // 支配：兵と建物の数が一番多い陣営。同数なら支配なし（鷲の王朝は同数でも支配する）
    ruler(c) {
        const counts = FACTIONS.filter(f => f !== 'vagabond' && this.has(f)).map(f => ({
            f, n: this.warriors(c, f) + this.map[c].buildings.filter(b => b.faction === f).length
        }));
        const max = Math.max(0, ...counts.map(x => x.n));
        if (max === 0) return null;
        const top = counts.filter(x => x.n === max).map(x => x.f);
        if (top.length === 1) return top[0];
        return top.includes('eyrie') ? 'eyrie' : null;
    }

    rules(f, c) {
        return this.ruler(c) === f;
    }

    // その陣営の駒（兵・建物・トークン。放浪者は駒）が空き地にあるか
    present(f, c) {
        if (f === 'vagabond') return this.fs.vagabond?.clearing === c;
        const m = this.map[c];
        return (m.warriors[f] ?? 0) > 0 || m.buildings.some(b => b.faction === f) || m.tokens.some(t => t.faction === f);
    }

    piecesIn(c) {
        const m = this.map[c];
        return sum(Object.values(m.warriors)) + m.buildings.length + m.tokens.length + (this.fs.vagabond?.clearing === c ? 1 : 0);
    }

    // 放浪者のアイテム
    vbHas(type, n = 1) {
        return (this.fs.vagabond?.items ?? []).filter(i => i.type === type && !i.exhausted && !i.damaged).length >= n;
    }

    vbCount(type, { damaged } = {}) {
        return (this.fs.vagabond?.items ?? []).filter(i => i.type === type && (damaged === undefined || i.damaged === damaged)).length;
    }

    vbSwords() {
        return this.vbCount('sword', { damaged: false });
    }

    hostileTo(f) {
        return this.fs.vagabond?.relations[f] === 'hostile';
    }

    newTurnState() {
        return {
            actions: 0, marchLeft: 0, recruited: false, acted: false, craftUsed: { fox: 0, rabbit: 0, mouse: 0 },
            usedCards: [], added: 0, birdAdded: false, decreeCol: 0, resolved: [], ops: 0, opsUsed: 0,
            slipped: false, aids: {}, setupBuild: 0
        };
    }

    // ---- 操作の受け付け ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        const normalized = this.matchLegal(playerId, command);
        if (!normalized) return this.fail(this.lastError ?? '今はその操作はできません');
        this.peek = null;
        this.execute(playerId, normalized);
        this.commands.push({ playerId, command: normalized });
        this.autoAdvance();
        return true;
    }

    // 合法手の一覧と照らし、記録する形にそろえる（一覧の項目と count だけを残す）
    matchLegal(seat, command) {
        const legal = this.legalActions(seat);
        if (command.type === 'discard') {
            const option = legal.find(a => a.type === 'discard');
            if (!option) return null;
            const cards = command.cards;
            const hand = this.players[seat].hand;
            if (!Array.isArray(cards) || cards.length !== option.count || new Set(cards).size !== cards.length
                || cards.some(id => !hand.includes(id))) return this.failNull(`${option.count}枚を選んでください`);
            return { type: 'discard', cards: [...cards] };
        }
        for (const option of legal) {
            if (option.type !== command.type) continue;
            const keys = Object.keys(option).filter(k => k !== 'type' && k !== 'max');
            if (keys.some(k => command[k] !== option[k] && !(option[k] === null && command[k] === undefined))) continue;
            const result = { type: option.type };
            keys.forEach(k => { result[k] = option[k]; });
            if (option.max !== undefined) {
                const count = command.count ?? option.max;
                if (!Number.isInteger(count) || count < 1 || count > option.max) continue;
                result.count = count;
            }
            return result;
        }
        return null;
    }

    // 決めることがないときは、自動で進める（記録しない。再現のときも同じように進む）
    autoAdvance() {
        let guard = 0;
        while (!this.isOver() && this.prompts.length === 0 && !this.battle && guard++ < 500) {
            if (this.phase === 'daylight' && this.step === 'resolve') {
                if (this.decreeColumnDone()) {
                    this.advanceDecree();
                    continue;
                }
                if (this.decreeOptions().length === 0) {
                    this.turmoil();
                    continue;
                }
            }
            const legal = this.legalActions(this.turn);
            if (legal.length === 0 || (legal.length === 1 && legal[0].type === 'next')) {
                this.next();
                continue;
            }
            break;
        }
    }

    // ---- 合法手 ----

    legalActions(seat) {
        if (this.isOver()) return [];
        if (this.prompts.length > 0) {
            const p = this.prompts[0];
            return p.seat === seat ? this.promptOptions(p) : [];
        }
        if (seat !== this.turn || this.battle) return [];
        if (this.phase === 'setup') return this.setupOptions();
        if (this.step === 'discard') return [{ type: 'discard', count: this.players[seat].hand.length - HAND_LIMIT }];
        const f = this.factionOf(seat);
        return this[`${f}Options`](seat);
    }

    promptOptions(p) {
        const hand = this.players[p.seat].hand;
        const c = p.clearing;
        if (p.kind === 'ambush' || p.kind === 'counter') {
            const cards = hand.filter(id => cardOf(id).kind === 'ambush' && matches(id, CLEARINGS[c].suit));
            return [...cards.map(card => ({ type: p.kind, card })), { type: p.kind, card: null }];
        }
        if (p.kind === 'hospital') {
            const cards = hand.filter(id => matches(id, CLEARINGS[c].suit));
            return [...cards.map(card => ({ type: 'hospital', card })), { type: 'hospital', card: null }];
        }
        return [];
    }

    setupOptions() {
        const f = this.setupQueue[0];
        if (f === 'marquise') {
            if (this.step === 'keep') return CORNERS.map(clearing => ({ type: 'keep', clearing }));
            const keep = this.keepClearing();
            return [keep, ...adjacency[keep]].filter(c => this.freeSlots(c) > 0).map(clearing => ({ type: 'place', clearing }));
        }
        if (f === 'eyrie') {
            if (this.step === 'corner') return CORNERS.filter(c => this.freeSlots(c) > 0).map(clearing => ({ type: 'corner', clearing }));
            return Object.keys(LEADERS).map(leader => ({ type: 'leader', leader }));
        }
        if (f === 'vagabond') {
            if (this.step === 'character') return Object.keys(CHARACTERS).map(character => ({ type: 'character', character }));
            return FORESTS.map(forest => ({ type: 'forest', forest: forest.id }));
        }
        return [];
    }

    // 鳥の歌に使える持続効果
    birdsongCardOptions(seat) {
        const p = this.players[seat];
        const result = [];
        p.effects.forEach(card => {
            if (this.tt.usedCards.includes(card)) return;
            const effect = cardOf(card).effect;
            if (effect === 'royal') result.push({ type: 'royal', card });
            if (effect === 'stand') this.players.filter(o => o.id !== seat && o.hand.length > 0).forEach(o => result.push({ type: 'stand', card, target: o.id }));
            if (effect === 'bank') this.players.filter(o => o.id !== seat).forEach(o => result.push({ type: 'bank', card, target: o.id }));
        });
        return result;
    }

    // 昼にいつでもできること（支配・徴税人・暗号破り）
    daylightFreeOptions(seat) {
        const p = this.players[seat];
        const f = p.faction;
        const result = [];
        if (!p.dominance && p.score >= 10 && !(f === 'vagabond' && this.players.length < 3)) {
            p.hand.filter(id => cardOf(id).kind === 'dominance').forEach(card => result.push({ type: 'dominance', card }));
        }
        this.dominancePool.forEach(card => {
            const suit = cardOf(card).suit;
            p.hand.filter(id => cardOf(id).kind !== 'dominance' && (suit === 'bird' ? cardOf(id).suit === 'bird' : matches(id, suit)))
                .forEach(pay => result.push({ type: 'takeDominance', card, pay }));
        });
        p.effects.forEach(card => {
            if (this.tt.usedCards.includes(card)) return;
            const effect = cardOf(card).effect;
            if (effect === 'tax') {
                this.map.forEach((m, c) => { if ((m.warriors[f] ?? 0) > 0) result.push({ type: 'tax', card, clearing: c }); });
            }
            if (effect === 'codebreakers') this.players.filter(o => o.id !== seat).forEach(o => result.push({ type: 'peek', card, target: o.id }));
        });
        return result;
    }

    // 昼の初めの戦闘（司令の巣穴）
    warrenOptions(seat) {
        const p = this.players[seat];
        if (this.tt.acted) return [];
        const card = p.effects.find(id => cardOf(id).effect === 'warren' && !this.tt.usedCards.includes(id));
        if (card === undefined) return [];
        return this.battleTargets(p.faction).map(b => ({ ...b, card }));
    }

    // 夕方の初めの移動（靴職人）
    cobblerOptions(seat) {
        const p = this.players[seat];
        if (this.tt.acted) return [];
        const card = p.effects.find(id => cardOf(id).effect === 'cobbler' && !this.tt.usedCards.includes(id));
        if (card === undefined) return [];
        return this.moveOptions(p.faction).map(m => ({ ...m, card }));
    }

    moveOptions(f) {
        if (f === 'vagabond') return this.vbMoveOptions();
        const result = [];
        this.map.forEach((m, from) => {
            const n = m.warriors[f] ?? 0;
            if (n === 0) return;
            adjacency[from].forEach(to => {
                if (this.rules(f, from) || this.rules(f, to)) result.push({ type: 'move', from, to, card: null, max: n });
            });
        });
        return result;
    }

    vbMoveOptions() {
        const vb = this.fs.vagabond;
        const targets = vb.clearing !== null ? adjacency[vb.clearing] : FORESTS[vb.forest].clearings;
        return targets.filter(to => this.vbHas('boot', this.vbBootCost(to))).map(to => ({ type: 'move', to, card: null }));
    }

    vbBootCost(to) {
        return 1 + (FACTIONS.some(f => f !== 'vagabond' && this.hostileTo(f) && this.warriors(to, f) > 0) ? 1 : 0);
    }

    // 攻撃できる相手（空き地と守り手）
    battleTargets(f) {
        const result = [];
        const clearings = f === 'vagabond'
            ? (this.fs.vagabond.clearing !== null ? [this.fs.vagabond.clearing] : [])
            : this.map.map((m, c) => c).filter(c => this.warriors(c, f) > 0);
        clearings.forEach(c => {
            FACTIONS.filter(g => g !== f && this.has(g) && this.present(g, c)).forEach(defender => {
                result.push({ type: 'battle', clearing: c, defender, card: null });
            });
        });
        return result;
    }

    // 工作に使える駒の、印ごとの残り（この手番でまだ使っていない数）
    craftCapacity(f) {
        const cap = { fox: 0, rabbit: 0, mouse: 0 };
        this.map.forEach((m, c) => {
            const suit = CLEARINGS[c].suit;
            if (f === 'marquise') cap[suit] += m.buildings.filter(b => b.faction === f && b.kind === 'workshop').length;
            if (f === 'eyrie') cap[suit] += m.buildings.filter(b => b.faction === f && b.kind === 'roost').length;
            if (f === 'alliance') cap[suit] += m.tokens.filter(t => t.faction === f && t.kind === 'sympathy').length;
        });
        Object.keys(cap).forEach(s => { cap[s] -= this.tt.craftUsed[s]; });
        return cap;
    }

    // 印の費用を、残りの駒に割り当てる（できなければ null）
    assignCraft(cost, cap) {
        const left = { ...cap };
        const used = { fox: 0, rabbit: 0, mouse: 0 };
        for (const s of cost.filter(s => s !== 'any')) {
            if (left[s] <= 0) return null;
            left[s]--;
            used[s]++;
        }
        for (let i = 0; i < cost.filter(s => s === 'any').length; i++) {
            const best = Object.keys(left).sort((a, b) => left[b] - left[a])[0];
            if (left[best] <= 0) return null;
            left[best]--;
            used[best]++;
        }
        return used;
    }

    canCraftCard(seat, id) {
        const card = cardOf(id);
        const p = this.players[seat];
        if (!card.cost) return false;
        if (card.item && this.items[card.item] <= 0) return false;
        if (card.kind === 'effect' && p.effects.some(e => cardOf(e).key === card.key)) return false;
        if (p.faction === 'vagabond') {
            const vb = this.fs.vagabond;
            if (vb.clearing === null) return false;
            const suit = CLEARINGS[vb.clearing].suit;
            return card.cost.every(s => s === 'any' || s === suit) && this.vbHas('hammer', card.cost.length);
        }
        return this.assignCraft(card.cost, this.craftCapacity(p.faction)) !== null;
    }

    craftOptions(seat) {
        return this.players[seat].hand.filter(id => this.canCraftCard(seat, id)).map(card => ({ type: 'craft', card }));
    }

    // ---- 侯爵家 ----

    marquiseOptions(seat) {
        const p = this.players[seat];
        const t = this.tt;
        if (this.phase === 'birdsong') return [...this.birdsongCardOptions(seat), { type: 'next' }];
        if (this.phase === 'evening') return [...this.cobblerOptions(seat), { type: 'next' }];
        const result = [...this.daylightFreeOptions(seat)];
        if (!t.acted) result.push(...this.craftOptions(seat), ...this.warrenOptions(seat));
        if (t.actions > 0 || t.marchLeft > 0) result.push(...this.moveOptions('marquise'));
        if (t.actions > 0) {
            result.push(...this.battleTargets('marquise'));
            if (!t.recruited && this.supply('marquise') > 0 && this.buildingCount('marquise', 'recruiter') > 0) result.push({ type: 'recruit', clearing: null });
            result.push(...this.marquiseBuildOptions());
            if (this.tokenCount('marquise', 'wood') < MARQUISE_WOOD) {
                this.map.forEach((m, c) => {
                    if (!this.hasBuilding(c, 'marquise', 'sawmill')) return;
                    p.hand.filter(id => matches(id, CLEARINGS[c].suit)).forEach(card => result.push({ type: 'overwork', card, clearing: c }));
                });
            }
        }
        p.hand.filter(id => cardOf(id).suit === 'bird').forEach(card => result.push({ type: 'hawks', card }));
        result.push({ type: 'next' });
        return result;
    }

    // 建設：支配している空き地の空いた枠に。木材は、支配している空き地でつながった範囲から払う
    marquiseBuildOptions() {
        const result = [];
        BUILD_KINDS.forEach(kind => {
            const placed = this.buildingCount('marquise', kind);
            if (placed >= 6) return;
            const cost = MARQUISE_COST[placed];
            this.map.forEach((m, c) => {
                if (!this.rules('marquise', c) || this.freeSlots(c) <= 0) return;
                if (this.woodReachable(c).length >= cost) result.push({ type: 'build', kind, clearing: c });
            });
        });
        return result;
    }

    // c から、支配している空き地をたどって届く木材の場所（近い順。同じ空き地に2つあれば2回入る）
    woodReachable(c) {
        const seen = new Set([c]);
        const queue = [c];
        const wood = [];
        while (queue.length) {
            const x = queue.shift();
            this.map[x].tokens.forEach(t => { if (t.kind === 'wood') wood.push(x); });
            adjacency[x].forEach(y => {
                if (!seen.has(y) && this.rules('marquise', y)) {
                    seen.add(y);
                    queue.push(y);
                }
            });
        }
        return wood;
    }

    // ---- 鷲の王朝 ----

    eyrieOptions(seat) {
        const p = this.players[seat];
        const t = this.tt;
        if (this.phase === 'birdsong') {
            if (this.step === 'newRoost') return this.newRoostCandidates().map(clearing => ({ type: 'newRoost', clearing }));
            const result = [...this.birdsongCardOptions(seat)];
            if (t.added < 2) {
                p.hand.forEach(card => {
                    if (cardOf(card).suit === 'bird' && t.birdAdded) return;
                    DECREE.forEach(column => result.push({ type: 'decree', card, column }));
                });
            }
            if (t.added >= 1 || p.hand.length === 0) result.push({ type: 'next' });
            return result;
        }
        if (this.phase === 'evening') return [...this.cobblerOptions(seat), { type: 'next' }];
        if (this.step === 'leader') return this.availableLeaders().map(leader => ({ type: 'leader', leader }));
        if (this.step === 'craft') {
            return [...this.daylightFreeOptions(seat), ...this.craftOptions(seat), ...this.warrenOptions(seat), { type: 'next' }];
        }
        return [...this.daylightFreeOptions(seat), ...this.decreeOptions()];
    }

    availableLeaders() {
        const e = this.fs.eyrie;
        const left = Object.keys(LEADERS).filter(l => !e.deposed.includes(l) && l !== e.leader);
        return left.length > 0 ? left : Object.keys(LEADERS);
    }

    // 新しい止まり木：駒の一番少ない空き地（置ける所の中で）
    newRoostCandidates() {
        const ok = this.map.map((m, c) => c).filter(c => this.freeSlots(c) > 0 && this.canPlace('eyrie', c));
        const min = Math.min(...ok.map(c => this.piecesIn(c)));
        return ok.filter(c => this.piecesIn(c) === min);
    }

    // 今の列で、まだ実行していない布告のカード
    decreeRemaining() {
        const column = DECREE[this.tt.decreeCol];
        if (!column) return [];
        return this.fs.eyrie.decree[column].map((entry, index) => ({ ...entry, index })).filter(e => !this.tt.resolved.includes(e.index));
    }

    decreeColumnDone() {
        return this.decreeRemaining().length === 0;
    }

    // 布告の実行で、取れる行動（印が合う空き地で）
    decreeOptions() {
        const column = DECREE[this.tt.decreeCol];
        const remaining = this.decreeRemaining();
        if (!column || remaining.length === 0) return [];
        const suits = new Set(remaining.map(e => e.suit));
        const fits = (c) => suits.has('bird') || suits.has(CLEARINGS[c].suit);
        if (column === 'recruit') {
            if (this.supply('eyrie') <= 0) return [];
            return this.map.map((m, c) => c).filter(c => this.hasBuilding(c, 'eyrie', 'roost') && fits(c)).map(clearing => ({ type: 'recruit', clearing }));
        }
        if (column === 'move') return this.moveOptions('eyrie').filter(m => fits(m.from));
        if (column === 'battle') return this.battleTargets('eyrie').filter(b => fits(b.clearing));
        if (this.buildingCount('eyrie', 'roost') >= ROOST_TOTAL) return [];
        return this.map.map((m, c) => c).filter(c => fits(c) && this.rules('eyrie', c) && this.freeSlots(c) > 0
            && !this.hasBuilding(c, 'eyrie', 'roost') && this.canPlace('eyrie', c)).map(clearing => ({ type: 'build', kind: 'roost', clearing }));
    }

    // 行動に使う布告のカード（印がちょうど合うものを先に、なければ鳥）
    takeDecreeEntry(c) {
        const suit = CLEARINGS[c].suit;
        const remaining = this.decreeRemaining();
        const entry = remaining.find(e => e.suit === suit) ?? remaining.find(e => e.suit === 'bird');
        this.tt.resolved.push(entry.index);
    }

    // ---- 森林連合 ----

    allianceOptions(seat) {
        const p = this.players[seat];
        const a = this.fs.alliance;
        const t = this.tt;
        if (this.phase === 'birdsong') return [...this.birdsongCardOptions(seat), ...this.revoltOptions(), ...this.spreadOptions(), { type: 'next' }];
        if (this.phase === 'daylight') {
            const result = [...this.daylightFreeOptions(seat), ...this.craftOptions(seat), ...this.warrenOptions(seat)];
            p.hand.forEach(card => result.push({ type: 'mobilize', card }));
            if (this.supply('alliance') > 0) {
                const baseSuits = this.map.map((m, c) => c).filter(c => this.hasBuilding(c, 'alliance', 'base')).map(c => CLEARINGS[c].suit);
                p.hand.filter(id => baseSuits.some(s => matches(id, s))).forEach(card => result.push({ type: 'train', card }));
            }
            result.push({ type: 'next' });
            return result;
        }
        const result = [...this.cobblerOptions(seat)];
        if (t.opsUsed < a.officers) {
            result.push(...this.moveOptions('alliance'), ...this.battleTargets('alliance'));
            if (this.supply('alliance') > 0) {
                this.map.forEach((m, c) => { if (this.hasBuilding(c, 'alliance', 'base')) result.push({ type: 'recruit', clearing: c }); });
            }
            if (this.tokenCount('alliance', 'sympathy') < SYMPATHY_TOTAL) {
                this.map.forEach((m, c) => {
                    if (this.warriors(c, 'alliance') > 0 && !this.hasToken(c, 'alliance', 'sympathy') && this.canPlace('alliance', c)) result.push({ type: 'organize', clearing: c });
                });
            }
        }
        result.push({ type: 'next' });
        return result;
    }

    supporterCount(suit) {
        return this.fs.alliance.supporters.filter(id => matches(id, suit)).length;
    }

    revoltOptions() {
        const result = [];
        this.map.forEach((m, c) => {
            const suit = CLEARINGS[c].suit;
            if (!this.hasToken(c, 'alliance', 'sympathy')) return;
            if (this.map.some(x => x.buildings.some(b => b.faction === 'alliance' && b.kind === 'base' && b.suit === suit))) return;
            if (this.supporterCount(suit) >= 2) result.push({ type: 'revolt', clearing: c });
        });
        return result;
    }

    spreadCost(c) {
        const placed = this.tokenCount('alliance', 'sympathy');
        const martial = FACTIONS.some(f => f !== 'alliance' && this.warriors(c, f) >= 3);
        return SYMPATHY_COST[placed] + (martial ? 1 : 0);
    }

    spreadOptions() {
        const placed = this.tokenCount('alliance', 'sympathy');
        if (placed >= SYMPATHY_TOTAL) return [];
        const sympathetic = this.map.map((m, c) => c).filter(c => this.hasToken(c, 'alliance', 'sympathy'));
        return this.map.map((m, c) => c).filter(c => !this.hasToken(c, 'alliance', 'sympathy') && this.canPlace('alliance', c)
            && (sympathetic.length === 0 || adjacency[c].some(x => sympathetic.includes(x)))
            && this.supporterCount(CLEARINGS[c].suit) >= this.spreadCost(c)).map(clearing => ({ type: 'spread', clearing }));
    }

    // ---- 放浪者 ----

    vagabondOptions(seat) {
        const vb = this.fs.vagabond;
        const p = this.players[seat];
        if (this.phase === 'birdsong') {
            const result = [...this.birdsongCardOptions(seat)];
            if (!this.tt.slipped) {
                if (vb.clearing !== null) {
                    adjacency[vb.clearing].forEach(c => result.push({ type: 'slip', clearing: c, forest: null }));
                    FORESTS.filter(f => f.clearings.includes(vb.clearing)).forEach(f => result.push({ type: 'slip', clearing: null, forest: f.id }));
                } else {
                    FORESTS[vb.forest].clearings.forEach(c => result.push({ type: 'slip', clearing: c, forest: null }));
                    forestAdjacency[vb.forest].forEach(f => result.push({ type: 'slip', clearing: null, forest: f }));
                }
            }
            result.push({ type: 'next' });
            return result;
        }
        if (this.phase === 'evening') return [...this.cobblerOptions(seat), { type: 'next' }];
        const result = [...this.daylightFreeOptions(seat), ...this.warrenOptions(seat), ...this.vbMoveOptions()];
        const c = vb.clearing;
        if (c !== null) {
            const suit = CLEARINGS[c].suit;
            const others = FACTIONS.filter(f => f !== 'vagabond' && this.has(f) && this.present(f, c));
            if (this.vbHas('sword')) others.forEach(defender => result.push({ type: 'battle', clearing: c, defender, card: null }));
            if (this.map[c].ruin && this.vbHas('torch')) result.push({ type: 'explore' });
            if (vb.items.some(i => !i.exhausted && !i.damaged)) {
                others.forEach(target => p.hand.filter(id => matches(id, suit)).forEach(card => result.push({ type: 'aid', target, card })));
            }
            vb.quests.forEach(qid => {
                const q = QUESTS[qid];
                if (q.suit !== suit) return;
                const ok = q.items[0] === q.items[1] ? this.vbHas(q.items[0], 2) : this.vbHas(q.items[0]) && this.vbHas(q.items[1]);
                if (ok) ['draw', 'score'].forEach(reward => result.push({ type: 'quest', quest: qid, reward }));
            });
            if (this.vbHas('crossbow')) others.forEach(target => result.push({ type: 'strike', target }));
            result.push(...this.craftOptions(seat));
            if (this.vbHas('torch')) {
                if (vb.character === 'thief') others.filter(f => this.players[this.seatOf[f]].hand.length > 0).forEach(target => result.push({ type: 'steal', target }));
                if (vb.character === 'tinker') this.discardPile.filter(id => matches(id, suit)).forEach(card => result.push({ type: 'daylabor', card }));
            }
        }
        if (this.vbHas('hammer')) {
            [...new Set(vb.items.filter(i => i.damaged).map(i => i.type))].forEach(item => result.push({ type: 'repair', item }));
        }
        if (vb.character === 'ranger' && this.vbHas('torch') && vb.items.some(i => i.damaged)) result.push({ type: 'hideout' });
        result.push({ type: 'next' });
        return result;
    }

    // ---- 実行 ----

    execute(seat, cmd) {
        const f = this.factionOf(seat);
        const p = this.players[seat];
        const handler = {
            next: () => this.next(),
            discard: () => {
                cmd.cards.forEach(id => this.discardCard(seat, id));
                this.log(`${p.name}が手札を${cmd.cards.length}枚捨てました`);
                this.endTurn();
            },
            keep: () => this.setupKeep(cmd.clearing),
            place: () => this.setupPlace(cmd.clearing),
            corner: () => this.setupEyrie(cmd.clearing),
            leader: () => this.chooseLeader(cmd.leader),
            character: () => this.setupCharacter(cmd.character),
            forest: () => this.setupForest(cmd.forest),
            move: () => this.doMove(seat, cmd),
            battle: () => this.doBattleAction(seat, cmd),
            craft: () => this.craft(seat, cmd.card),
            recruit: () => this.doRecruit(seat, cmd.clearing),
            build: () => this.doBuild(seat, cmd),
            overwork: () => {
                this.spendAction();
                this.discardCard(seat, cmd.card);
                this.map[cmd.clearing].tokens.push({ faction: 'marquise', kind: 'wood' });
                this.log(`${p.name}が残業で${cmd.clearing + 1}に木材を置きました`);
            },
            hawks: () => {
                this.discardCard(seat, cmd.card);
                this.tt.actions++;
                this.log(`${p.name}が鳥のカードで行動を1回増やしました`);
            },
            decree: () => this.addDecree(seat, cmd),
            newRoost: () => this.placeNewRoost(cmd.clearing),
            revolt: () => this.revolt(seat, cmd.clearing),
            spread: () => this.spread(seat, cmd.clearing),
            mobilize: () => {
                this.removeFromHand(seat, cmd.card);
                this.addSupporter(cmd.card);
                this.tt.acted = true;
                this.log(`${p.name}が手札を支持者に加えました`);
            },
            train: () => {
                this.discardCard(seat, cmd.card);
                this.fs.alliance.officers++;
                this.tt.acted = true;
                this.log(`${p.name}が兵を官吏に育てました（官吏${this.fs.alliance.officers}）`);
            },
            organize: () => {
                this.tt.opsUsed++;
                this.tt.acted = true;
                this.map[cmd.clearing].warriors.alliance--;
                this.placeSympathy(seat, cmd.clearing, '組織');
            },
            slip: () => {
                this.tt.slipped = true;
                this.vbMoveTo(cmd.clearing, cmd.forest);
                this.log(`${p.name}が${cmd.clearing !== null ? `${cmd.clearing + 1}へ` : '森へ'}抜け出しました`);
            },
            explore: () => this.explore(seat),
            aid: () => this.aid(seat, cmd),
            quest: () => this.quest(seat, cmd),
            strike: () => this.strike(seat, cmd.target),
            repair: () => {
                this.vbExhaust('hammer');
                this.vbRepair(cmd.item);
                this.tt.acted = true;
                this.log(`${p.name}が${ITEM_NAMES[cmd.item]}を直しました`);
            },
            steal: () => {
                this.vbExhaust('torch');
                this.tt.acted = true;
                const target = this.players[this.seatOf[cmd.target]];
                const card = target.hand[Math.floor(this.random() * target.hand.length)];
                this.removeFromHand(target.id, card);
                p.hand.push(card);
                this.log(`${p.name}が${target.name}の手札を1枚盗みました`);
            },
            daylabor: () => {
                this.vbExhaust('torch');
                this.tt.acted = true;
                this.discardPile.splice(this.discardPile.indexOf(cmd.card), 1);
                p.hand.push(cmd.card);
                this.log(`${p.name}が日雇いで捨て札の「${cardOf(cmd.card).name}」を取りました`);
            },
            hideout: () => {
                this.vbExhaust('torch');
                for (let i = 0; i < 3; i++) {
                    const item = this.fs.vagabond.items.find(x => x.damaged);
                    if (item) item.damaged = false;
                }
                this.log(`${p.name}が隠れ家でアイテムを直しました`);
                this.startEvening();
            },
            dominance: () => this.activateDominance(seat, cmd.card),
            takeDominance: () => {
                this.discardCard(seat, cmd.pay);
                this.dominancePool.splice(this.dominancePool.indexOf(cmd.card), 1);
                p.hand.push(cmd.card);
                this.log(`${p.name}が「${cardOf(cmd.card).name}」を手札に取りました`);
            },
            royal: () => {
                this.removeEffect(seat, cmd.card);
                const n = this.map.filter((m, c) => this.rules(f, c)).length;
                this.log(`${p.name}が王の権利を捨てて${n}点`);
                this.scoreVP(seat, n);
            },
            stand: () => {
                this.tt.usedCards.push(cmd.card);
                const target = this.players[cmd.target];
                const card = target.hand[Math.floor(this.random() * target.hand.length)];
                this.removeFromHand(target.id, card);
                p.hand.push(card);
                this.log(`${p.name}が${target.name}から1枚取りました（${target.name}に1点）`);
                this.scoreVP(target.id, 1);
            },
            bank: () => {
                this.tt.usedCards.push(cmd.card);
                this.draw(seat, 1);
                this.draw(cmd.target, 1);
                this.log(`${p.name}と${this.players[cmd.target].name}が1枚ずつ引きました`);
            },
            tax: () => {
                this.tt.usedCards.push(cmd.card);
                this.map[cmd.clearing].warriors[f]--;
                this.draw(seat, 1);
                this.log(`${p.name}が徴税人で兵を1体除き、1枚引きました`);
            },
            peek: () => {
                this.tt.usedCards.push(cmd.card);
                this.peek = { seat, target: cmd.target, cards: [...this.players[cmd.target].hand] };
                this.log(`${p.name}が${this.players[cmd.target].name}の手札を見ました`);
            },
            ambush: () => this.answerAmbush(seat, cmd.card),
            counter: () => this.answerCounter(seat, cmd.card),
            hospital: () => this.answerHospital(seat, cmd.card)
        }[cmd.type];
        handler();
    }

    // ---- 準備 ----

    nextSetup() {
        while (this.setupQueue.length > 0) {
            const f = this.setupQueue[0];
            this.turn = this.seatOf[f];
            if (f === 'marquise') {
                this.step = 'keep';
                return;
            }
            if (f === 'eyrie') {
                if (this.has('marquise')) {
                    this.setupEyrie(OPPOSITE_CORNER[this.keepClearing()], true);
                    return;
                }
                this.step = 'corner';
                return;
            }
            if (f === 'alliance') {
                this.draw(this.seatOf.alliance, 3, true, true);
                this.log(`${this.nameOf('alliance')}が支持者を3枚引きました`);
                this.setupQueue.shift();
                continue;
            }
            if (f === 'vagabond') {
                this.step = 'character';
                return;
            }
        }
        this.startGame();
    }

    setupKeep(clearing) {
        this.map[clearing].tokens.push({ faction: 'marquise', kind: 'keep' });
        const opposite = OPPOSITE_CORNER[clearing];
        this.map.forEach((m, c) => { if (c !== opposite) m.warriors.marquise = 1; });
        this.log(`${this.nameOf('marquise')}が${clearing + 1}に本拠を置きました`);
        this.step = 'place';
        this.tt.setupBuild = 0;
    }

    setupPlace(clearing) {
        const kind = BUILD_KINDS[this.tt.setupBuild];
        this.map[clearing].buildings.push({ faction: 'marquise', kind });
        this.log(`${this.nameOf('marquise')}が${clearing + 1}に${BUILDING_NAMES[kind]}を置きました`);
        this.tt.setupBuild++;
        if (this.tt.setupBuild >= BUILD_KINDS.length) {
            this.setupQueue.shift();
            this.nextSetup();
        }
    }

    setupEyrie(clearing, auto = false) {
        this.map[clearing].buildings.push({ faction: 'eyrie', kind: 'roost' });
        this.map[clearing].warriors.eyrie = 6;
        this.log(`${this.nameOf('eyrie')}が${clearing + 1}に止まり木と兵6体を置きました`);
        this.step = 'leader';
        if (!auto) return;
        this.turn = this.seatOf.eyrie;
    }

    chooseLeader(leader) {
        const e = this.fs.eyrie;
        e.leader = leader;
        // 宰相（鳥のカードとして扱う）を、指導者の決まった列に置く
        DECREE.forEach(col => { e.decree[col] = e.decree[col].filter(x => !x.vizier); });
        LEADERS[leader].viziers.forEach(col => e.decree[col].unshift({ card: null, suit: 'bird', vizier: true }));
        this.log(`${this.nameOf('eyrie')}の指導者は「${LEADERS[leader].name}」`);
        if (this.phase === 'setup') {
            this.setupQueue.shift();
            this.nextSetup();
        } else {
            this.startEvening();
        }
    }

    setupCharacter(character) {
        const vb = this.fs.vagabond;
        vb.character = character;
        vb.items = CHARACTERS[character].items.map(type => ({ type, exhausted: false, damaged: false }));
        vb.quests = vb.questDeck.splice(0, 3);
        this.log(`${this.nameOf('vagabond')}は「${CHARACTERS[character].name}」`);
        this.step = 'forest';
    }

    setupForest(forest) {
        this.fs.vagabond.forest = forest;
        this.log(`${this.nameOf('vagabond')}が森に入りました`);
        this.setupQueue.shift();
        this.nextSetup();
    }

    startGame() {
        this.round = 1;
        this.log('―― 1巡目 ――');
        this.startTurn(this.firstSeat);
    }

    // ---- 手番の流れ ----

    startTurn(seat) {
        this.turn = seat;
        this.tt = this.newTurnState();
        this.phase = 'birdsong';
        this.step = 'birdsong';
        const p = this.players[seat];
        const f = p.faction;
        this.emit({ type: 'turn', seat });
        if (this.checkDominanceWin(seat)) return;
        if (f === 'marquise') {
            let placed = 0;
            this.map.forEach((m, c) => {
                m.buildings.filter(b => b.faction === 'marquise' && b.kind === 'sawmill').forEach(() => {
                    if (this.tokenCount('marquise', 'wood') < MARQUISE_WOOD) {
                        m.tokens.push({ faction: 'marquise', kind: 'wood' });
                        placed++;
                    }
                });
            });
            if (placed > 0) this.log(`${p.name}が製材所に木材を${placed}個置きました`);
        }
        if (f === 'eyrie') {
            this.step = 'decree';
            if (p.hand.length === 0) this.draw(seat, 1);
        }
        if (f === 'vagabond') this.vbRefresh();
    }

    next() {
        const f = this.factionOf(this.turn);
        if (this.phase === 'birdsong') {
            if (f === 'eyrie' && this.step === 'decree' && this.buildingCount('eyrie', 'roost') === 0) {
                this.step = 'newRoost';
                return;
            }
            this.phase = 'daylight';
            this.step = f === 'eyrie' ? 'craft' : 'daylight';
            this.tt.actions = 3;
            return;
        }
        if (this.phase === 'daylight') {
            if (f === 'eyrie' && this.step === 'craft') {
                this.step = 'resolve';
                this.tt.decreeCol = 0;
                this.tt.resolved = [];
                this.tt.acted = true;
                return;
            }
            this.startEvening();
            return;
        }
        if (this.phase === 'evening') this.finishEvening();
    }

    startEvening() {
        const seat = this.turn;
        const p = this.players[seat];
        const f = p.faction;
        this.phase = 'evening';
        this.step = 'evening';
        this.tt.acted = false;
        if (f === 'eyrie') {
            const roosts = this.buildingCount('eyrie', 'roost');
            const vp = roosts > 0 ? ROOST_VP[roosts - 1] : 0;
            if (vp > 0) {
                this.log(`${p.name}が止まり木で${vp}点`);
                this.scoreVP(seat, vp);
            }
        }
        if (f === 'alliance') {
            this.tt.ops = this.fs.alliance.officers;
            this.tt.opsUsed = 0;
        }
        if (f === 'vagabond' && this.fs.vagabond.forest !== null) {
            this.fs.vagabond.items.forEach(i => { i.damaged = false; });
            this.log(`${p.name}が森でアイテムを直しました`);
        }
    }

    finishEvening() {
        const seat = this.turn;
        const p = this.players[seat];
        const f = p.faction;
        let n = 1;
        if (f === 'marquise') n += MARQUISE_DRAW_AT.filter(k => this.buildingCount('marquise', 'recruiter') >= k).length;
        if (f === 'eyrie') n += ROOST_DRAW_AT.filter(k => this.buildingCount('eyrie', 'roost') >= k).length;
        if (f === 'alliance') n += this.buildingCount('alliance', 'base');
        if (f === 'vagabond') n += this.vbCount('coins', { damaged: false });
        this.draw(seat, n);
        if (f === 'vagabond') this.vbCheckCapacity();
        if (this.isOver()) return;
        if (p.hand.length > HAND_LIMIT) {
            this.step = 'discard';
            return;
        }
        this.endTurn();
    }

    endTurn() {
        const n = this.players.length;
        const nextSeat = (this.turn + 1) % n;
        if (nextSeat === this.firstSeat) {
            this.round++;
            if (this.round > MAX_ROUNDS) {
                const best = Math.max(...this.players.map(p => p.score));
                this.endGame(this.players.filter(p => p.score === best).map(p => p.id), 'rounds');
                return;
            }
            this.log(`―― ${this.round}巡目 ――`);
        }
        this.startTurn(nextSeat);
    }

    spendAction() {
        const t = this.tt;
        t.actions--;
        t.marchLeft = 0;
        t.acted = true;
    }

    // ---- 移動 ----

    doMove(seat, cmd) {
        const f = this.factionOf(seat);
        const p = this.players[seat];
        if (cmd.card !== null && cmd.card !== undefined) this.tt.usedCards.push(cmd.card);
        else if (f === 'marquise') {
            if (this.tt.marchLeft > 0) this.tt.marchLeft--;
            else {
                this.spendAction();
                this.tt.marchLeft = 1;
            }
        } else if (f === 'eyrie') this.takeDecreeEntry(cmd.from);
        else if (f === 'alliance') this.tt.opsUsed++;
        this.tt.acted = true;
        if (f === 'vagabond') {
            const cost = this.vbBootCost(cmd.to);
            this.vbExhaust('boot', cost);
            this.vbMoveTo(cmd.to, null);
            this.log(`${p.name}が${cmd.to + 1}へ移動しました`);
            this.emit({ type: 'move', faction: f, from: null, to: cmd.to, count: 1 });
            return;
        }
        this.map[cmd.from].warriors[f] -= cmd.count;
        this.map[cmd.to].warriors[f] = this.warriors(cmd.to, f) + cmd.count;
        this.log(`${p.name}が${cmd.from + 1}から${cmd.to + 1}へ${cmd.count}体移動しました`);
        this.emit({ type: 'move', faction: f, from: cmd.from, to: cmd.to, count: cmd.count });
        this.outrage(seat, cmd.to);
    }

    vbMoveTo(clearing, forest) {
        const vb = this.fs.vagabond;
        vb.clearing = clearing;
        vb.forest = forest;
        if (clearing !== null) this.outrage(this.seatOf.vagabond, clearing);
    }

    // ---- 徴兵・建設 ----

    doRecruit(seat, clearing) {
        const f = this.factionOf(seat);
        const p = this.players[seat];
        if (f === 'marquise') {
            this.spendAction();
            this.tt.recruited = true;
            let placed = 0;
            this.map.forEach((m, c) => {
                m.buildings.filter(b => b.faction === 'marquise' && b.kind === 'recruiter').forEach(() => {
                    if (this.supply('marquise') > 0) {
                        m.warriors.marquise = this.warriors(c, 'marquise') + 1;
                        placed++;
                    }
                });
            });
            this.log(`${p.name}が徴兵で兵を${placed}体置きました`);
            return;
        }
        let n = 1;
        if (f === 'eyrie') {
            this.takeDecreeEntry(clearing);
            if (this.fs.eyrie.leader === 'charismatic') n = 2;
        } else {
            this.tt.opsUsed++;
            this.tt.acted = true;
        }
        n = Math.min(n, this.supply(f));
        this.map[clearing].warriors[f] = this.warriors(clearing, f) + n;
        this.log(`${p.name}が${clearing + 1}に兵を${n}体置きました`);
    }

    doBuild(seat, cmd) {
        const f = this.factionOf(seat);
        const p = this.players[seat];
        const c = cmd.clearing;
        if (f === 'eyrie') {
            this.takeDecreeEntry(c);
            const before = this.buildingCount('eyrie', 'roost');
            this.map[c].buildings.push({ faction: 'eyrie', kind: 'roost' });
            this.log(`${p.name}が${c + 1}に止まり木を建てました（${before + 1}つ目）`);
            return;
        }
        this.spendAction();
        const placed = this.buildingCount('marquise', cmd.kind);
        const cost = MARQUISE_COST[placed];
        const wood = this.woodReachable(c).slice(0, cost);
        wood.forEach(x => {
            const tokens = this.map[x].tokens;
            tokens.splice(tokens.findIndex(t => t.kind === 'wood'), 1);
        });
        this.map[c].buildings.push({ faction: 'marquise', kind: cmd.kind });
        const vp = MARQUISE_VP[cmd.kind][placed];
        this.log(`${p.name}が${c + 1}に${BUILDING_NAMES[cmd.kind]}を建てました（木材${cost}）${vp > 0 ? `${vp}点` : ''}`);
        this.emit({ type: 'build', faction: f, clearing: c, kind: cmd.kind });
        this.scoreVP(seat, vp);
    }

    // ---- 鷲の王朝の布告 ----

    addDecree(seat, cmd) {
        const p = this.players[seat];
        this.removeFromHand(seat, cmd.card);
        const suit = cardOf(cmd.card).suit;
        this.fs.eyrie.decree[cmd.column].push({ card: cmd.card, suit, vizier: false });
        this.tt.added++;
        if (suit === 'bird') this.tt.birdAdded = true;
        this.log(`${p.name}が布告の「${DECREE_NAMES[cmd.column]}」に${SUIT_NAMES[suit]}のカードを加えました`);
        if (this.tt.added >= 2) this.next();
    }

    placeNewRoost(c) {
        const p = this.players[this.seatOf.eyrie];
        this.map[c].buildings.push({ faction: 'eyrie', kind: 'roost' });
        const n = Math.min(3, this.supply('eyrie'));
        this.map[c].warriors.eyrie = this.warriors(c, 'eyrie') + n;
        this.log(`${p.name}が${c + 1}に新しい止まり木と兵${n}体を置きました`);
        this.phase = 'daylight';
        this.step = 'craft';
    }

    advanceDecree() {
        this.tt.decreeCol++;
        this.tt.resolved = [];
        if (this.tt.decreeCol >= DECREE.length) this.startEvening();
    }

    // 混乱：鳥のカードの数だけ失点、布告を捨て、指導者を替えて、昼を終える
    turmoil() {
        const seat = this.seatOf.eyrie;
        const p = this.players[seat];
        const e = this.fs.eyrie;
        const birds = sum(DECREE.map(col => e.decree[col].filter(x => x.suit === 'bird').length));
        this.log(`${p.name}が布告を果たせず、混乱に陥りました（${birds}点を失う）`);
        this.emit({ type: 'turmoil', seat });
        this.scoreVP(seat, -birds);
        DECREE.forEach(col => {
            e.decree[col].filter(x => !x.vizier).forEach(x => this.discardToPile(x.card));
            e.decree[col] = e.decree[col].filter(x => x.vizier);
        });
        e.deposed.push(e.leader);
        if (Object.keys(LEADERS).every(l => e.deposed.includes(l))) e.deposed = [];
        this.step = 'leader';
    }

    // ---- 森林連合 ----

    paySupporters(suit, n) {
        const a = this.fs.alliance;
        for (let i = 0; i < n; i++) {
            const idx = a.supporters.findIndex(id => cardOf(id).suit === suit);
            const pick = idx >= 0 ? idx : a.supporters.findIndex(id => cardOf(id).suit === 'bird');
            const [card] = a.supporters.splice(pick, 1);
            this.discardToPile(card);
        }
    }

    addSupporter(card) {
        const a = this.fs.alliance;
        if (this.buildingCount('alliance', 'base') === 0 && a.supporters.length >= 5) {
            this.discardToPile(card);
            return;
        }
        a.supporters.push(card);
    }

    placeSympathy(seat, c, how) {
        const placed = this.tokenCount('alliance', 'sympathy');
        this.map[c].tokens.push({ faction: 'alliance', kind: 'sympathy' });
        const vp = SYMPATHY_VP[placed];
        this.log(`${this.players[seat].name}が${how}で${c + 1}に同調者を置きました${vp > 0 ? `（${vp}点）` : ''}`);
        this.scoreVP(seat, vp);
    }

    spread(seat, c) {
        this.paySupporters(CLEARINGS[c].suit, this.spreadCost(c));
        this.placeSympathy(seat, c, '同調の広まり');
    }

    revolt(seat, c) {
        const p = this.players[seat];
        const suit = CLEARINGS[c].suit;
        this.paySupporters(suit, 2);
        this.log(`${p.name}が${c + 1}で暴動を起こしました`);
        this.emit({ type: 'revolt', clearing: c });
        this.removeAllEnemies(c, 'alliance');
        this.map[c].buildings.push({ faction: 'alliance', kind: 'base', suit });
        const n = Math.min(this.supply('alliance'), this.map.filter((m, x) => CLEARINGS[x].suit === suit && this.hasToken(x, 'alliance', 'sympathy')).length);
        this.map[c].warriors.alliance = this.warriors(c, 'alliance') + n;
        if (this.supply('alliance') > 0) this.fs.alliance.officers++;
        this.log(`${p.name}が${c + 1}に拠点と兵${n}体を置きました`);
    }

    // ---- 放浪者 ----

    vbExhaust(type, n = 1) {
        for (let i = 0; i < n; i++) {
            const item = this.fs.vagabond.items.find(x => x.type === type && !x.exhausted && !x.damaged);
            item.exhausted = true;
        }
    }

    vbRepair(type) {
        const item = this.fs.vagabond.items.find(x => x.type === type && x.damaged);
        item.damaged = false;
    }

    // 鳥の歌：使ったアイテムを 3＋お茶2つずつ 戻す（使えるアイテムから先に）
    vbRefresh() {
        const vb = this.fs.vagabond;
        let n = 3 + 2 * this.vbCount('tea', { damaged: false });
        const order = ['boot', 'sword', 'torch', 'hammer', 'crossbow', 'tea', 'coins', 'bag'];
        const exhausted = vb.items.filter(i => i.exhausted).sort((a, b) => (a.damaged - b.damaged) || (order.indexOf(a.type) - order.indexOf(b.type)));
        exhausted.forEach(i => {
            if (n > 0) {
                i.exhausted = false;
                n--;
            }
        });
    }

    // 持てる数（6＋袋1つにつき2）を超えたら、価値の低いものから手放す
    vbCheckCapacity() {
        const vb = this.fs.vagabond;
        const tracked = ['tea', 'coins', 'bag'];
        const capacity = 6 + 2 * this.vbCount('bag');
        const satchel = vb.items.filter(i => !tracked.includes(i.type));
        const order = ['crossbow', 'hammer', 'torch', 'boot', 'sword'];
        while (satchel.length > capacity) {
            satchel.sort((a, b) => (b.damaged - a.damaged) || (order.indexOf(a.type) - order.indexOf(b.type)));
            const drop = satchel.shift();
            vb.items.splice(vb.items.indexOf(drop), 1);
            this.log(`${this.nameOf('vagabond')}が持ちきれない${ITEM_NAMES[drop.type]}を手放しました`);
        }
    }

    explore(seat) {
        const vb = this.fs.vagabond;
        const c = vb.clearing;
        this.vbExhaust('torch');
        this.tt.acted = true;
        const item = this.map[c].ruin;
        this.map[c].ruin = null;
        vb.items.push({ type: item, exhausted: false, damaged: false });
        this.log(`${this.players[seat].name}が${c + 1}の遺跡で${ITEM_NAMES[item]}を見つけました（1点）`);
        this.scoreVP(seat, 1);
    }

    aid(seat, cmd) {
        const vb = this.fs.vagabond;
        const p = this.players[seat];
        const target = this.players[this.seatOf[cmd.target]];
        // 援助で使うアイテム：価値の低いものから
        const order = ['bag', 'coins', 'tea', 'crossbow', 'hammer', 'torch', 'sword', 'boot'];
        const item = vb.items.filter(i => !i.exhausted && !i.damaged).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))[0];
        item.exhausted = true;
        this.tt.acted = true;
        this.removeFromHand(seat, cmd.card);
        target.hand.push(cmd.card);
        let text = `${p.name}が${target.name}を援助しました`;
        if (target.crafted.length > 0) {
            const prefer = ['sword', 'boot', 'hammer', 'torch', 'crossbow', 'tea', 'coins', 'bag'];
            target.crafted.sort((a, b) => prefer.indexOf(a) - prefer.indexOf(b));
            const got = target.crafted.shift();
            vb.items.push({ type: got, exhausted: false, damaged: false });
            text += `（${ITEM_NAMES[got]}を受け取る）`;
        }
        this.log(text);
        const relation = vb.relations[cmd.target];
        if (relation === 'hostile') return;
        if (relation === 'allied') {
            this.scoreVP(seat, 2);
            return;
        }
        this.tt.aids[cmd.target] = (this.tt.aids[cmd.target] ?? 0) + 1;
        const step = RELATION_STEPS[relation];
        if (this.tt.aids[cmd.target] >= step.aids) {
            this.tt.aids[cmd.target] = 0;
            const order2 = ['indifferent', 'amiable', 'friendly', 'allied'];
            vb.relations[cmd.target] = order2[order2.indexOf(relation) + 1];
            this.log(`${target.name}との関係が「${RELATION_NAMES[vb.relations[cmd.target]]}」になりました（${step.vp}点）`);
            this.scoreVP(seat, step.vp);
        }
    }

    quest(seat, cmd) {
        const vb = this.fs.vagabond;
        const p = this.players[seat];
        const q = QUESTS[cmd.quest];
        q.items.forEach(type => this.vbExhaust(type));
        this.tt.acted = true;
        vb.quests.splice(vb.quests.indexOf(cmd.quest), 1);
        vb.completed.push(cmd.quest);
        if (vb.questDeck.length > 0) vb.quests.push(vb.questDeck.shift());
        if (cmd.reward === 'draw') {
            this.draw(seat, 2);
            this.log(`${p.name}がクエスト「${q.name}」を果たし、2枚引きました`);
        } else {
            const n = vb.completed.filter(id => QUESTS[id].suit === q.suit).length;
            this.log(`${p.name}がクエスト「${q.name}」を果たしました（${n}点）`);
            this.scoreVP(seat, n);
        }
    }

    strike(seat, target) {
        const c = this.fs.vagabond.clearing;
        this.vbExhaust('crossbow');
        this.tt.acted = true;
        this.log(`${this.players[seat].name}がクロスボウで${this.nameOf(target)}を撃ちました`);
        this.applyHits(c, target, 1, 'vagabond');
    }

    // ---- 工作 ----

    craft(seat, id) {
        const p = this.players[seat];
        const f = p.faction;
        const card = cardOf(id);
        if (f === 'vagabond') {
            this.vbExhaust('hammer', card.cost.length);
            this.tt.acted = true;
        } else {
            const used = this.assignCraft(card.cost, this.craftCapacity(f));
            Object.keys(used).forEach(s => { this.tt.craftUsed[s] += used[s]; });
            if (f === 'alliance') this.tt.acted = true;
        }
        this.removeFromHand(seat, id);
        this.emit({ type: 'craft', seat, card: id });
        if (card.item) {
            this.items[card.item]--;
            const vp = f === 'eyrie' && this.fs.eyrie.leader !== 'builder' ? 1 : card.vp;
            if (f === 'vagabond') this.fs.vagabond.items.push({ type: card.item, exhausted: false, damaged: false });
            else p.crafted.push(card.item);
            this.discardToPile(id);
            this.log(`${p.name}が「${card.name}」で${ITEM_NAMES[card.item]}を作りました（${vp}点）`);
            this.scoreVP(seat, vp);
            return;
        }
        if (card.kind === 'favor') {
            this.discardToPile(id);
            this.log(`${p.name}が「${card.name}」を使いました`);
            this.map.forEach((m, c) => { if (CLEARINGS[c].suit === card.suit) this.removeAllEnemies(c, f); });
            return;
        }
        p.effects.push(id);
        this.log(`${p.name}が「${card.name}」を作りました`);
    }

    // ---- 支配 ----

    activateDominance(seat, id) {
        const p = this.players[seat];
        this.removeFromHand(seat, id);
        p.dominance = id;
        if (p.faction === 'vagabond') {
            const others = this.players.filter(o => o.id !== seat);
            const low = Math.min(...others.map(o => o.score));
            p.coalition = others.find(o => o.score === low).id;
            this.log(`${p.name}が「${cardOf(id).name}」で${this.players[p.coalition].name}と連合を組みました`);
            return;
        }
        this.log(`${p.name}が「${cardOf(id).name}」を出しました。これからは得点の代わりに支配で勝ちを目指します`);
        this.emit({ type: 'dominance', seat, card: id });
    }

    checkDominanceWin(seat) {
        const p = this.players[seat];
        if (p.dominance === null || p.coalition !== null) return false;
        const suit = cardOf(p.dominance).suit;
        const f = p.faction;
        let won;
        if (suit === 'bird') won = [[0, 2], [1, 3]].some(([a, b]) => this.rules(f, a) && this.rules(f, b));
        else won = this.map.filter((m, c) => CLEARINGS[c].suit === suit && this.rules(f, c)).length >= 3;
        if (won) {
            this.log(`${p.name}が${SUIT_NAMES[suit]}の支配で勝ちました`);
            this.endGame([seat], 'dominance');
        }
        return won;
    }

    // ---- 戦闘 ----

    doBattleAction(seat, cmd) {
        const f = this.factionOf(seat);
        if (cmd.card !== null && cmd.card !== undefined) this.tt.usedCards.push(cmd.card);
        else if (f === 'marquise') this.spendAction();
        else if (f === 'eyrie') this.takeDecreeEntry(cmd.clearing);
        else if (f === 'alliance') this.tt.opsUsed++;
        else if (f === 'vagabond') this.vbExhaust('sword');
        this.tt.acted = true;
        this.startBattle(f, cmd.clearing, cmd.defender);
    }

    startBattle(att, c, def) {
        this.battle = { att, def, clearing: c, hostile: att === 'vagabond' && this.hostileTo(def) };
        this.log(`${this.nameOf(att)}が${c + 1}で${this.nameOf(def)}に戦いを挑みました`);
        const attSeat = this.seatOf[att];
        const defSeat = this.seatOf[def];
        const scouting = this.players[attSeat].effects.some(id => cardOf(id).effect === 'scouting');
        const suit = CLEARINGS[c].suit;
        if (!scouting && this.players[defSeat].hand.some(id => cardOf(id).kind === 'ambush' && matches(id, suit))) {
            this.prompts.push({ seat: defSeat, kind: 'ambush', clearing: c });
            return;
        }
        this.rollBattle();
    }

    answerAmbush(seat, card) {
        this.prompts.shift();
        const { att, clearing: c } = this.battle;
        if (card === null) {
            this.rollBattle();
            return;
        }
        this.discardCard(seat, card);
        this.log(`${this.players[seat].name}が待ち伏せを出しました`);
        const attSeat = this.seatOf[att];
        if (this.players[attSeat].hand.some(id => cardOf(id).kind === 'ambush' && matches(id, CLEARINGS[c].suit))) {
            this.prompts.push({ seat: attSeat, kind: 'counter', clearing: c });
            return;
        }
        this.ambushHits();
    }

    answerCounter(seat, card) {
        this.prompts.shift();
        if (card === null) {
            this.ambushHits();
            return;
        }
        this.discardCard(seat, card);
        this.log(`${this.players[seat].name}が待ち伏せで打ち消しました`);
        this.rollBattle();
    }

    ambushHits() {
        const { att, def, clearing: c } = this.battle;
        this.applyHits(c, att, 2, def);
        if (this.isOver()) return;
        if (att !== 'vagabond' && this.warriors(c, att) === 0) {
            this.log('攻撃側の兵がいなくなり、戦闘は終わりました');
            this.finishBattle();
            return;
        }
        this.rollBattle();
    }

    rollBattle() {
        const { att, def, clearing: c } = this.battle;
        const attP = this.players[this.seatOf[att]];
        const defP = this.players[this.seatOf[def]];
        const d1 = Math.floor(this.random() * 4);
        const d2 = Math.floor(this.random() * 4);
        let attRoll = Math.max(d1, d2);
        let defRoll = Math.min(d1, d2);
        // ゲリラ戦：森林連合が守るときは、大きい目を取る
        if (def === 'alliance') [attRoll, defRoll] = [defRoll, attRoll];
        const cap = (f) => (f === 'vagabond' ? this.vbSwords() : this.warriors(c, f));
        let attHits = Math.min(attRoll, cap(att));
        let defHits = Math.min(defRoll, cap(def));
        const notes = [];
        // 武具師：受ける出目の打撃を無視する（効くときだけ使う）
        const armorers = (p, incoming, f) => {
            const card = p.effects.find(id => cardOf(id).effect === 'armorers');
            if (card === undefined || incoming === 0) return false;
            if (incoming >= 2 || f === 'vagabond' || this.warriors(c, f) <= incoming) {
                this.removeEffect(p.id, card);
                notes.push(`${p.name}が武具師で打撃を防ぎました`);
                return true;
            }
            return false;
        };
        if (armorers(defP, attHits, def)) attHits = 0;
        if (armorers(attP, defHits, att)) defHits = 0;
        let attExtra = 0;
        let defExtra = 0;
        if (def !== 'vagabond' && this.warriors(c, def) === 0) attExtra++;
        if (att === 'eyrie' && this.fs.eyrie.leader === 'commander') attExtra++;
        const brutal = attP.effects.find(id => cardOf(id).effect === 'brutal');
        if (brutal !== undefined && this.nextPieceIsBuilding(c, def, attHits + attExtra)) {
            attExtra++;
            notes.push(`${attP.name}が非情な戦術で追加の打撃（${defP.name}に1点）`);
            this.scoreVP(defP.id, 1);
            if (this.isOver()) return;
        }
        const sappers = defP.effects.find(id => cardOf(id).effect === 'sappers');
        const attLeft = att === 'vagabond' ? this.fs.vagabond.items.filter(i => !i.damaged).length : this.warriors(c, att);
        if (sappers !== undefined && attLeft > defHits) {
            this.removeEffect(defP.id, sappers);
            defExtra++;
            notes.push(`${defP.name}が工兵で追加の打撃`);
        }
        this.log(`サイコロ ${d1}・${d2}：${attP.name}の打撃${attHits + attExtra}、${defP.name}の打撃${defHits + defExtra}`);
        notes.forEach(n => this.log(n));
        this.emit({ type: 'battle', clearing: c, att, def, dice: [d1, d2], attHits: attHits + attExtra, defHits: defHits + defExtra });
        const hostile = this.battle.hostile;
        const removedDef = this.applyHits(c, def, attHits + attExtra, att);
        const removedAtt = this.applyHits(c, att, defHits + defExtra, def);
        if (this.isOver()) return;
        if (att === 'eyrie' && this.fs.eyrie.leader === 'despot' && removedDef.pieces > 0) this.scoreVP(attP.id, 1);
        if (def === 'eyrie' && this.fs.eyrie.leader === 'despot' && removedAtt.pieces > 0) this.scoreVP(defP.id, 1);
        // 悪名：敵対している陣営の駒を戦闘で除くと、1つにつき1点
        if (att === 'vagabond' && hostile) this.scoreVP(attP.id, removedDef.warriors + removedDef.pieces);
        if (this.isOver()) return;
        this.finishBattle();
    }

    // 打撃をあと1つ与えたら、建物かトークンが除かれるか（非情な戦術を使うかの判断）
    nextPieceIsBuilding(c, f, hits) {
        if (f === 'vagabond') return false;
        const m = this.map[c];
        const w = this.warriors(c, f);
        const pieces = m.buildings.filter(b => b.faction === f).length + m.tokens.filter(t => t.faction === f).length;
        return hits >= w && hits < w + pieces;
    }

    finishBattle() {
        this.battle = null;
        this.flushHospital();
    }

    // 打撃を受ける：兵から先に除き、残りで建物・トークン（安いものから）。放浪者はアイテムを傷める
    applyHits(c, f, hits, by) {
        const result = { warriors: 0, pieces: 0 };
        if (hits <= 0) return result;
        if (f === 'vagabond') {
            const order = ['bag', 'coins', 'tea', 'crossbow', 'hammer', 'torch', 'boot', 'sword'];
            for (let i = 0; i < hits; i++) {
                const items = this.fs.vagabond.items.filter(x => !x.damaged)
                    .sort((a, b) => (b.exhausted - a.exhausted) || (order.indexOf(a.type) - order.indexOf(b.type)));
                if (items.length === 0) break;
                items[0].damaged = true;
                result.pieces++;
            }
            if (result.pieces > 0) this.log(`${this.nameOf('vagabond')}のアイテムが${result.pieces}つ傷みました`);
            return result;
        }
        const w = Math.min(hits, this.warriors(c, f));
        if (w > 0) {
            this.removeWarriors(c, f, w, by);
            result.warriors = w;
        }
        let left = hits - w;
        const tokenOrder = ['wood', 'sympathy', 'keep'];
        while (left > 0) {
            const m = this.map[c];
            const ti = m.tokens.map((t, i) => ({ t, i })).filter(x => x.t.faction === f).sort((a, b) => tokenOrder.indexOf(a.t.kind) - tokenOrder.indexOf(b.t.kind))[0];
            const bi = m.buildings.findIndex(b => b.faction === f);
            if (ti && (ti.t.kind !== 'keep' || bi < 0)) this.removeToken(c, ti.i, by);
            else if (bi >= 0) this.removeBuilding(c, bi, by);
            else break;
            result.pieces++;
            left--;
        }
        return result;
    }

    removeWarriors(c, f, n, by) {
        this.map[c].warriors[f] -= n;
        if (by && by !== f) this.log(`${this.nameOf(f)}の兵が${c + 1}で${n}体除かれました`);
        if (by === 'vagabond' && this.fs.vagabond.relations[f] && this.fs.vagabond.relations[f] !== 'hostile') {
            this.fs.vagabond.relations[f] = 'hostile';
            this.log(`${this.nameOf(f)}が放浪者に敵対しました`);
        }
        if (f === 'marquise' && by && by !== 'marquise') {
            this.hospitalQueue = this.hospitalQueue ?? [];
            this.hospitalQueue.push({ clearing: c, count: n });
            if (!this.battle) this.flushHospital();
        }
    }

    removeBuilding(c, index, by) {
        const [b] = this.map[c].buildings.splice(index, 1);
        this.log(`${this.nameOf(b.faction)}の${BUILDING_NAMES[b.kind]}が${c + 1}で除かれました`);
        if (by && by !== b.faction) this.scoreVP(this.seatOf[by], 1);
        if (b.kind === 'base') {
            const a = this.fs.alliance;
            const lost = a.supporters.filter(id => matches(id, b.suit));
            a.supporters = a.supporters.filter(id => !matches(id, b.suit));
            lost.forEach(id => this.discardToPile(id));
            a.officers -= Math.ceil(a.officers / 2);
            this.log(`森林連合が支持者を${lost.length}枚失い、官吏が${a.officers}になりました`);
        }
    }

    removeToken(c, index, by) {
        const [t] = this.map[c].tokens.splice(index, 1);
        if (t.kind !== 'wood') this.log(`${this.nameOf(t.faction)}の${t.kind === 'keep' ? '本拠' : '同調者'}が${c + 1}で除かれました`);
        if (by && by !== t.faction) this.scoreVP(this.seatOf[by], 1);
        if (t.kind === 'sympathy' && by && by !== 'alliance') this.outrage(this.seatOf[by], c, true);
    }

    // 暴動・恩寵：その空き地のほかの陣営の駒をすべて除く（放浪者の駒は残る）
    removeAllEnemies(c, by) {
        const m = this.map[c];
        FACTIONS.filter(f => f !== by && f !== 'vagabond').forEach(f => {
            const w = m.warriors[f] ?? 0;
            if (w > 0) this.removeWarriors(c, f, w, by);
        });
        for (let i = m.buildings.length - 1; i >= 0; i--) if (m.buildings[i].faction !== by) this.removeBuilding(c, i, by);
        for (let i = m.tokens.length - 1; i >= 0; i--) if (m.tokens[i].faction !== by) this.removeToken(c, i, by);
    }

    // 野戦病院：除かれた兵を、合う印のカードを払って本拠に戻せる
    flushHospital() {
        const queue = this.hospitalQueue ?? [];
        this.hospitalQueue = [];
        const seat = this.seatOf.marquise;
        queue.forEach(({ clearing, count }) => {
            if (this.keepClearing() < 0 || count <= 0) return;
            if (!this.players[seat].hand.some(id => matches(id, CLEARINGS[clearing].suit))) return;
            this.prompts.push({ seat, kind: 'hospital', clearing, count });
        });
    }

    answerHospital(seat, card) {
        const p = this.prompts.shift();
        if (card === null) return;
        const keep = this.keepClearing();
        if (keep < 0) return;
        this.discardCard(seat, card);
        const n = Math.min(p.count, this.supply('marquise'));
        this.map[keep].warriors.marquise = this.warriors(keep, 'marquise') + n;
        this.log(`${this.players[seat].name}が野戦病院で兵${n}体を本拠に戻しました`);
    }

    // 憤激：同調者を除いたり、同調している空き地に兵が入ったりしたら、印の合うカードを支持者に渡す
    outrage(seat, c, removed = false) {
        if (!this.has('alliance') || this.factionOf(seat) === 'alliance') return;
        if (!removed && !this.hasToken(c, 'alliance', 'sympathy')) return;
        const p = this.players[seat];
        const suit = CLEARINGS[c].suit;
        const pick = p.hand.find(id => cardOf(id).suit === suit && cardOf(id).kind !== 'dominance')
            ?? p.hand.find(id => cardOf(id).suit === suit) ?? p.hand.find(id => cardOf(id).suit === 'bird');
        if (pick !== undefined) {
            this.removeFromHand(seat, pick);
            this.addSupporter(pick);
            this.log(`${p.name}が憤激で森林連合にカードを1枚渡しました`);
        } else {
            const [card] = this.takeFromDeck(1);
            if (card !== undefined) this.addSupporter(card);
            this.log(`${p.name}は合うカードがなく、森林連合が山札から支持者を1枚加えました`);
        }
    }

    // ---- カード ----

    takeFromDeck(n) {
        const result = [];
        for (let i = 0; i < n; i++) {
            if (this.deck.length === 0) {
                if (this.discardPile.length === 0) break;
                this.deck = shuffle(this.discardPile, this.random);
                this.discardPile = [];
                this.log('捨て札を切り直して山札にしました');
            }
            result.push(this.deck.pop());
        }
        return result;
    }

    draw(seat, n, quiet = false, toSupporters = false) {
        const cards = this.takeFromDeck(n);
        if (toSupporters) cards.forEach(id => this.fs.alliance.supporters.push(id));
        else this.players[seat].hand.push(...cards);
        if (!quiet && cards.length > 0) this.emit({ type: 'draw', seat, count: cards.length });
        return cards;
    }

    removeFromHand(seat, id) {
        const hand = this.players[seat].hand;
        hand.splice(hand.indexOf(id), 1);
    }

    discardToPile(id) {
        if (id === null || id === undefined) return;
        if (cardOf(id).kind === 'dominance') this.dominancePool.push(id);
        else this.discardPile.push(id);
    }

    discardCard(seat, id) {
        this.removeFromHand(seat, id);
        this.discardToPile(id);
    }

    removeEffect(seat, id) {
        const effects = this.players[seat].effects;
        effects.splice(effects.indexOf(id), 1);
        this.discardToPile(id);
    }

    // ---- 得点と終わり ----

    scoreVP(seat, n) {
        const p = this.players[seat];
        if (n === 0 || p.dominance !== null || this.isOver()) return;
        p.score = Math.max(0, p.score + n);
        this.emit({ type: 'score', seat, delta: n, score: p.score });
        if (p.score >= WIN_SCORE) {
            this.log(`${p.name}が${WIN_SCORE}点に届きました`);
            this.endGame([seat], 'score');
        }
    }

    endGame(winners, reason) {
        // 連合を組んだ放浪者は、相手と一緒に勝つ
        const all = [...winners];
        this.players.forEach(p => { if (p.coalition !== null && winners.includes(p.coalition) && !all.includes(p.id)) all.push(p.id); });
        this.phase = 'end';
        this.step = null;
        this.prompts = [];
        this.battle = null;
        this.winners = all;
        this.endReason = reason;
        this.emit({ type: 'end', winners: [...all], reason });
        this.log(`${all.map(id => this.players[id].name).join('と')}の勝ちです`);
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

    failNull(message) {
        this.lastError = message;
        return null;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, faction: p.faction })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

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

export { cardOf };
