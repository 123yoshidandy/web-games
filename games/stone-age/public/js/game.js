/**
 * ストーンエイジの進行（基本ゲーム、2〜4人）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びとサイコロの目はシードから決まる）
 *
 * ラウンドは3つの段階
 * 1. 人を置く：最初の番の人から順に、1か所に1人以上を置く。全員が置き終えるか、置ける場所がなくなるまで続ける
 * 2. 行動する：最初の番の人から順に、置いた場所を好きな順で使う（サイコロ・道具・文明カード・建物）
 * 3. 食べさせる：畑の段だけ食料を得て、人1人に食料1つ。足りなければ資源で払うか −10点
 * 建物の山が1つでも空になったら、そのラウンドの終わりに終了。文明カードの置き場を埋められなければ、次のラウンドを始めずに終了
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 小屋（人が10人）・畑（10段）・道具作り（道具が4・4・4）が上限でも置ける（効果はない。ほかの人に使わせないために置ける）
 * - 払えない文明カード・建物は、行動するときに自動で取らない
 * - 道具を足しても得る数が変わらないときは、道具を使うかを聞かない
 * - 食料が足りないとき、資源で払うのは足りない分ちょうど（一部だけ払って −10点、はできない）
 * - ダイスのカードで、最後の人は残った1つを自動で受け取る。道具・畑が上限なら、その目を選んでも何も得ない
 * - 好きな資源2つのカードは、自分が操作する番（行動する段階と、食べさせる段階で払うとき）ならいつでも使える
 * - 道具のタイル（18枚）・資源・食料の数の上限はない（ルールブックの「足りなくなったら代わりのもので」から）
 */

import { createRandom, shuffle } from './random.js';
import {
    CIV_CARDS, BUILDINGS, RESOURCES, RESOURCE_NAME, GATHER, RESOURCE_SPOTS, VILLAGE, PLACE_NAME, DIE_REWARD,
    START_PEOPLE, START_FOOD, MAX_PEOPLE, MAX_AGRI, MAX_TOOL_TILES, MAX_TOOL_VALUE, CIV_SLOTS, STACK_SIZE, STARVE_PENALTY,
    resourceCount, buildingPoints, isPay, normalizePay
} from './cards.js';
import { finalBonus, tieBreak } from './scoring.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
const MAX_LOGS = 400;
const MAX_EVENTS = 60;

export const CIV_PLACES = Array.from({ length: CIV_SLOTS }, (_, i) => `civ${i}`);
export const BUILDING_PLACES = Array.from({ length: MAX_PLAYERS }, (_, i) => `bld${i}`);
export const PLACES = ['hunt', ...RESOURCE_SPOTS, ...VILLAGE, ...CIV_PLACES, ...BUILDING_PLACES];

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    place: ['place', 'count'],
    resolve: ['place'],
    tools: ['tools', 'oneUse'],
    pay: ['pay'],
    decline: [],
    pickDie: ['die'],
    feed: ['pay'],
    choice2: ['take']
};

export const placeName = (place) => {
    if (place.startsWith('civ')) return '文明カード';
    if (place.startsWith('bld')) return '建物';
    return PLACE_NAME[place];
};

const payText = (pay) => RESOURCES.filter(r => pay[r] > 0).map(r => `${RESOURCE_NAME[r]}${pay[r]}`).join('・') || 'なし';

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        const n = players.length;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            people: START_PEOPLE, available: START_PEOPLE, food: START_FOOD,
            res: { wood: 0, clay: 0, stone: 0, gold: 0 },
            agri: 0, tools: [], toolsUsed: [], score: 0,
            cards: [], hidden: [], oneUse: [], choice2: [], buildings: [],
            starved: 0, final: null
        }));
        this.civDeck = shuffle(CIV_CARDS.map(card => card.id), this.random);
        this.civSlots = this.civDeck.splice(0, CIV_SLOTS);
        const tiles = shuffle(BUILDINGS.map(b => b.id), this.random);
        // 人数分の山（7枚ずつ）。各山の先頭が表の建物
        this.stacks = Array.from({ length: n }, (_, i) => tiles.slice(i * STACK_SIZE, (i + 1) * STACK_SIZE));
        this.startPlayer = Math.floor(this.random() * n);
        this.round = 0;
        this.phase = 'place';       // place：置く / action：行動する / feed：食べさせる / end：終わり
        this.current = this.startPlayer;
        this.actionIndex = 0;       // 行動する段階で、最初の番の人から何人目か
        this.feedIndex = 0;
        this.placed = [];           // 席ごとの { 場所: 人数 }
        this.pending = null;        // 答えを待っている選択
        this.winners = [];
        this.endReason = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人（いつも0人か1人）
    actors() {
        if (this.phase === 'end') return [];
        if (this.pending) return [this.pending.seat];
        if (this.phase === 'place' || this.phase === 'action') return [this.current];
        return [];
    }

    // ---- ラウンド ----

    startRound() {
        this.round += 1;
        this.phase = 'place';
        this.placed = this.players.map(() => ({}));
        this.players.forEach(p => {
            p.available = p.people;
            p.toolsUsed = p.tools.map(() => false);
        });
        this.current = this.startPlayer;
        this.emit({ type: 'round', round: this.round, startPlayer: this.startPlayer });
        this.log(`ラウンド${this.round}（最初の番：${this.players[this.startPlayer].name}）`);
        if (!this.canPlaceAny(this.current)) this.nextPlacer();
    }

    endRound() {
        if (this.stacks.some(stack => stack.length === 0)) {
            this.endGame('建物の山が1つ空になりました');
            return;
        }
        this.startPlayer = (this.startPlayer + 1) % this.players.length;
        // 残った文明カードを安い側へ寄せ、山から補充する。足りなければ終わり
        const rest = this.civSlots.filter(id => id !== null);
        const need = CIV_SLOTS - rest.length;
        if (this.civDeck.length < need) {
            this.civSlots = [...rest, ...Array(need).fill(null)];
            this.endGame('文明カードを補充できなくなりました');
            return;
        }
        this.civSlots = [...rest, ...this.civDeck.splice(0, need)];
        this.startRound();
    }

    endGame(reason) {
        this.phase = 'end';
        this.pending = null;
        this.endReason = reason;
        this.log(reason);
        this.players.forEach(p => {
            const bonus = finalBonus(p);
            p.final = { track: p.score, ...bonus };
            p.score += bonus.total;
        });
        const best = Math.max(...this.players.map(p => p.score));
        const top = this.players.filter(p => p.score === best);
        const bestTie = Math.max(...top.map(tieBreak));
        this.winners = top.filter(p => tieBreak(p) === bestTie).map(p => p.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`得点：${this.players.map(p => `${p.name} ${p.score}`).join('・')}`);
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ち`);
    }

    // ---- 操作 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        const check = this[`check_${command.type}`](playerId, command);
        if (typeof check === 'string') return this.fail(check);
        this.commands.push({ playerId, command: check.recorded });
        check.run();
        this.advance();
        return true;
    }

    // 選択が片付いたら、段階を先へ進める
    advance() {
        if (this.pending || this.phase === 'end') return;
        if (this.phase === 'action') this.nextActor();
        else if (this.phase === 'feed') this.processFeeding();
    }

    // -- 人を置く --

    // 置けないなら理由、置けるなら null
    placeError(seat, place, count) {
        const p = this.players[seat];
        if (!PLACES.includes(place)) return 'その場所はありません';
        if (!Number.isInteger(count) || count < 1) return '人数が正しくありません';
        if (count > p.available) return '人が足りません';
        if (this.placed[seat][place]) return 'そこにはもう置いています';
        const n = this.players.length;
        const occupants = this.placed.map(m => m[place] ?? 0);
        const total = occupants.reduce((s, k) => s + k, 0);
        if (place === 'hunt') return null;
        if (GATHER[place]) {
            if (total + count > GATHER[place].cap) return 'そこには7人までです';
            const others = occupants.filter(k => k > 0).length;
            if (n < 4 && others >= n - 1) return n === 2 ? '2人のときは、1人しか置けません' : '3人のときは、2人までしか置けません';
            return null;
        }
        if (total > 0) return 'もうふさがっています';
        if (VILLAGE.includes(place)) {
            if (count !== (place === 'hut' ? 2 : 1)) return place === 'hut' ? '小屋にはちょうど2人を置きます' : 'ちょうど1人を置きます';
            if (n < 4 && VILLAGE.filter(v => this.placed.some(m => m[v])).length >= 2) return '村の3か所のうち、使えるのは2か所までです';
            return null;
        }
        if (count !== 1) return 'ちょうど1人を置きます';
        if (place.startsWith('civ')) return this.civSlots[Number(place.slice(3))] === null ? 'カードがありません' : null;
        const k = Number(place.slice(3));
        return k < this.stacks.length && this.stacks[k].length > 0 ? null : '建物がありません';
    }

    // 置ける (場所, 人数) の一覧
    legalPlacements(seat) {
        const p = this.players[seat];
        const result = [];
        PLACES.forEach(place => {
            const counts = GATHER[place] ? Array.from({ length: p.available }, (_, i) => i + 1) : [place === 'hut' ? 2 : 1];
            counts.forEach(count => {
                if (!this.placeError(seat, place, count)) result.push({ place, count });
            });
        });
        return result;
    }

    canPlaceAny(seat) {
        const p = this.players[seat];
        if (p.available <= 0) return false;
        return PLACES.some(place => !this.placeError(seat, place, place === 'hut' ? 2 : 1));
    }

    check_place(seat, { place, count }) {
        if (this.phase !== 'place') return '今は人を置けません';
        const error = this.placeError(seat, place, count);
        if (error) return error;
        return {
            recorded: { type: 'place', place, count },
            run: () => {
                this.placed[seat][place] = count;
                this.players[seat].available -= count;
                this.emit({ type: 'place', seat, place, count });
                this.log(`${this.players[seat].name}：${this.placeLabel(place)}に${count}人`);
                this.nextPlacer();
            }
        };
    }

    placeLabel(place) {
        if (place.startsWith('civ')) return `文明カード（${Number(place.slice(3)) + 1}）`;
        if (place.startsWith('bld')) return `建物（${Number(place.slice(3)) + 1}）`;
        return PLACE_NAME[place];
    }

    nextPlacer() {
        const n = this.players.length;
        for (let k = 1; k <= n; k++) {
            const seat = (this.current + k) % n;
            if (this.canPlaceAny(seat)) {
                this.current = seat;
                return;
            }
        }
        this.phase = 'action';
        this.actionIndex = 0;
        this.current = this.startPlayer;
        this.log('行動する');
        this.nextActor();
    }

    // -- 行動する --

    // 置いた場所が残っている人を、最初の番の人から順に探す。いなければ食べさせる段階へ
    nextActor() {
        const n = this.players.length;
        while (this.actionIndex < n) {
            const seat = (this.startPlayer + this.actionIndex) % n;
            if (Object.keys(this.placed[seat]).length) {
                this.current = seat;
                return;
            }
            this.actionIndex += 1;
        }
        this.startFeeding();
    }

    check_resolve(seat, { place }) {
        if (this.phase !== 'action' || this.pending) return '今はその操作はできません';
        if (typeof place !== 'string' || !this.placed[seat][place]) return 'そこには置いていません';
        return {
            recorded: { type: 'resolve', place },
            run: () => {
                const count = this.placed[seat][place];
                delete this.placed[seat][place];
                this.resolvePlace(seat, place, count);
            }
        };
    }

    resolvePlace(seat, place, count) {
        const p = this.players[seat];
        if (GATHER[place]) {
            this.roll(seat, count, GATHER[place].resource, GATHER[place].divisor, place);
        } else if (place === 'field') {
            this.addAgri(p);
        } else if (place === 'toolmaker') {
            this.addTool(p);
        } else if (place === 'hut') {
            if (p.people < MAX_PEOPLE) {
                p.people += 1;
                this.log(`${p.name}：人が1人増えて${p.people}人`);
            } else this.log(`${p.name}：人はもう${MAX_PEOPLE}人です`);
        } else if (place.startsWith('civ')) {
            const slot = Number(place.slice(3));
            const cost = slot + 1;
            if (resourceCount(p.res) + 2 * p.choice2.length < cost) {
                this.log(`${p.name}：文明カードの資源が足りません`);
                return;
            }
            this.pending = { kind: 'civ', seat, slot, cost };
        } else {
            const stack = Number(place.slice(3));
            if (!this.canAfford(p, BUILDINGS[this.stacks[stack][0]])) {
                this.log(`${p.name}：建物の資源が足りません`);
                return;
            }
            this.pending = { kind: 'building', seat, stack };
        }
    }

    // 建物を建てられるか（好きな資源2つのカードを持っていれば、その分も見込む）
    canAfford(p, building) {
        const extra = 2 * p.choice2.length;
        if (building.kind === 'fixed') {
            return RESOURCES.reduce((s, r) => s + Math.max(0, (building.cost[r] ?? 0) - p.res[r]), 0) <= extra;
        }
        if (building.kind === 'any') return resourceCount(p.res) + extra >= building.min;
        if (extra) return resourceCount(p.res) + extra >= building.n;
        // 多い順に、決まった種類の数だけ選んで足りるか
        const counts = RESOURCES.map(r => p.res[r]).sort((a, b) => b - a).slice(0, building.kinds);
        return counts.every(k => k > 0) && counts.reduce((s, k) => s + k, 0) >= building.n;
    }

    // サイコロを振る。道具を足して得る数が増えるなら、道具を使うかを聞く
    roll(seat, count, resource, divisor, source) {
        const p = this.players[seat];
        const dice = Array.from({ length: count }, () => 1 + Math.floor(this.random() * 6));
        const sum = dice.reduce((s, d) => s + d, 0);
        this.emit({ type: 'roll', seat, source, dice, resource, divisor });
        const extra = p.tools.reduce((s, v, i) => s + (p.toolsUsed[i] ? 0 : v), 0)
            + p.oneUse.reduce((s, id) => s + CIV_CARDS[id].top.n, 0);
        if (Math.floor((sum + extra) / divisor) > Math.floor(sum / divisor)) {
            this.pending = { kind: 'tools', seat, dice, sum, resource, divisor, source };
            return;
        }
        this.gain(seat, resource, Math.floor(sum / divisor), `${dice.join('+')}=${sum}`);
    }

    gain(seat, resource, n, detail) {
        const p = this.players[seat];
        if (resource === 'food') p.food += n;
        else p.res[resource] += n;
        this.emit({ type: 'gain', seat, resource, n });
        this.log(`${p.name}：${detail ? `${detail} → ` : ''}${RESOURCE_NAME[resource]}${n}`);
    }

    check_tools(seat, { tools, oneUse }) {
        const pending = this.pending;
        if (pending?.kind !== 'tools') return '今は道具を使えません';
        const p = this.players[seat];
        const tiles = tools ?? [];
        const cards = oneUse ?? [];
        if (!Array.isArray(tiles) || !Array.isArray(cards)) return '道具の指定が正しくありません';
        if (new Set(tiles).size !== tiles.length || new Set(cards).size !== cards.length) return '同じ道具は1回だけです';
        if (!tiles.every(i => Number.isInteger(i) && i >= 0 && i < p.tools.length && !p.toolsUsed[i])) return 'その道具は使えません';
        if (!cards.every(id => p.oneUse.includes(id))) return 'その道具は持っていません';
        return {
            recorded: { type: 'tools', tools: [...tiles], oneUse: [...cards] },
            run: () => {
                const added = tiles.reduce((s, i) => s + p.tools[i], 0) + cards.reduce((s, id) => s + CIV_CARDS[id].top.n, 0);
                tiles.forEach(i => { p.toolsUsed[i] = true; });
                p.oneUse = p.oneUse.filter(id => !cards.includes(id));
                const total = pending.sum + added;
                this.pending = null;
                const detail = `${pending.dice.join('+')}${added ? `+道具${added}` : ''}=${total}`;
                this.gain(seat, pending.resource, Math.floor(total / pending.divisor), detail);
            }
        };
    }

    check_pay(seat, { pay }) {
        const pending = this.pending;
        const p = this.players[seat];
        if (pending?.kind !== 'civ' && pending?.kind !== 'building') return '今は払えません';
        if (!isPay(pay)) return '払う資源が正しくありません';
        const amount = normalizePay(pay);
        if (RESOURCES.some(r => amount[r] > p.res[r])) return '資源が足りません';
        if (pending.kind === 'civ') {
            if (resourceCount(amount) !== pending.cost) return `資源をちょうど${pending.cost}つ払います`;
            return {
                recorded: { type: 'pay', pay: amount },
                run: () => {
                    RESOURCES.forEach(r => { p.res[r] -= amount[r]; });
                    const id = this.civSlots[pending.slot];
                    this.civSlots[pending.slot] = null;
                    p.cards.push(id);
                    this.pending = null;
                    this.emit({ type: 'civ', seat, card: id, slot: pending.slot });
                    this.log(`${p.name}：文明カードを取った（${payText(amount)}）`);
                    this.applyCivTop(seat, CIV_CARDS[id]);
                }
            };
        }
        const id = this.stacks[pending.stack][0];
        const points = buildingPoints(BUILDINGS[id], amount);
        if (points === null) return 'この建物には、その払い方はできません';
        return {
            recorded: { type: 'pay', pay: amount },
            run: () => {
                RESOURCES.forEach(r => { p.res[r] -= amount[r]; });
                this.stacks[pending.stack].shift();
                p.buildings.push(id);
                p.score += points;
                this.pending = null;
                this.emit({ type: 'building', seat, building: id, points });
                this.log(`${p.name}：建物で${points}点（${payText(amount)}）`);
            }
        };
    }

    check_decline(seat) {
        const pending = this.pending;
        if (pending?.kind !== 'civ' && pending?.kind !== 'building') return '今はその操作はできません';
        return {
            recorded: { type: 'decline' },
            run: () => {
                this.pending = null;
                this.log(`${this.players[seat].name}：${pending.kind === 'civ' ? '文明カード' : '建物'}を取らなかった`);
            }
        };
    }

    // 文明カードの上半分
    applyCivTop(seat, card) {
        const p = this.players[seat];
        const top = card.top;
        switch (top.kind) {
            case 'diceAll': {
                const n = this.players.length;
                const dice = Array.from({ length: n }, () => 1 + Math.floor(this.random() * 6));
                const order = Array.from({ length: n }, (_, k) => (seat + k) % n);
                this.emit({ type: 'diceAll', seat, dice: [...dice] });
                this.log(`${p.name}：ダイス ${dice.join('・')}`);
                this.pending = { kind: 'dice', seat, buyer: seat, dice, order, index: 0 };
                break;
            }
            case 'food':
                p.food += top.n;
                this.log(`${p.name}：食料${top.n}`);
                break;
            case 'res':
                this.gain(seat, top.res, top.n);
                break;
            case 'resDice':
                this.roll(seat, 2, top.res, GATHER[{ wood: 'forest', clay: 'clay', stone: 'quarry', gold: 'river' }[top.res]].divisor, 'card');
                break;
            case 'points':
                p.score += top.n;
                this.log(`${p.name}：${top.n}点`);
                break;
            case 'tool':
                this.addTool(p);
                break;
            case 'agri':
                this.addAgri(p);
                break;
            case 'extra':
                if (this.civDeck.length) {
                    const id = this.civDeck.shift();
                    p.cards.push(id);
                    p.hidden.push(id);
                    this.log(`${p.name}：山の上のカードを伏せて取った`);
                }
                break;
            case 'oneUse':
                p.oneUse.push(card.id);
                break;
            case 'choice2':
                p.choice2.push(card.id);
                break;
        }
    }

    addTool(p) {
        if (p.tools.length < MAX_TOOL_TILES) {
            p.tools.push(1);
            p.toolsUsed.push(false);
        } else {
            const low = Math.min(...p.tools);
            if (low >= MAX_TOOL_VALUE) {
                this.log(`${p.name}：道具はもう上限です`);
                return;
            }
            p.tools[p.tools.indexOf(low)] += 1;
        }
        this.log(`${p.name}：道具（${p.tools.join('・')}）`);
    }

    addAgri(p) {
        if (p.agri >= MAX_AGRI) {
            this.log(`${p.name}：畑はもう${MAX_AGRI}段です`);
            return;
        }
        p.agri += 1;
        this.log(`${p.name}：畑が${p.agri}段`);
    }

    check_pickDie(seat, { die }) {
        const pending = this.pending;
        if (pending?.kind !== 'dice') return '今はサイコロを選べません';
        if (!Number.isInteger(die) || die < 0 || die >= pending.dice.length) return 'そのサイコロはありません';
        return {
            recorded: { type: 'pickDie', die },
            run: () => {
                const value = pending.dice[die];
                const dice = pending.dice.filter((_, i) => i !== die);
                this.takeDie(seat, value);
                const index = pending.index + 1;
                if (dice.length === 1) {
                    // 最後の人は、残った1つを受け取る
                    this.pending = null;
                    this.takeDie(pending.order[index], dice[0]);
                } else {
                    this.pending = { ...pending, dice, index, seat: pending.order[index] };
                }
            }
        };
    }

    takeDie(seat, value) {
        const p = this.players[seat];
        const reward = DIE_REWARD[value];
        this.emit({ type: 'pickDie', seat, value });
        if (reward === 'tool') this.addTool(p);
        else if (reward === 'agri') this.addAgri(p);
        else this.gain(seat, reward, 1, `目${value}`);
    }

    check_choice2(seat, { take }) {
        const p = this.players[seat];
        if (!p.choice2.length) return '好きな資源2つのカードを持っていません';
        if (!this.actors().includes(seat) || this.phase === 'place') return '今は使えません';
        if (!isPay(take)) return '資源の指定が正しくありません';
        const amount = normalizePay(take);
        if (resourceCount(amount) !== 2) return '資源を2つ選びます';
        return {
            recorded: { type: 'choice2', take: amount },
            run: () => {
                p.choice2.shift();
                RESOURCES.forEach(r => { p.res[r] += amount[r]; });
                this.emit({ type: 'choice2', seat, take: amount });
                this.log(`${p.name}：好きな資源2つ（${payText(amount)}）`);
            }
        };
    }

    // -- 食べさせる --

    startFeeding() {
        this.phase = 'feed';
        this.feedIndex = 0;
        this.log('食べさせる');
        this.processFeeding();
    }

    processFeeding() {
        const n = this.players.length;
        while (this.feedIndex < n) {
            const seat = (this.startPlayer + this.feedIndex) % n;
            this.feedIndex += 1;
            const p = this.players[seat];
            p.food += p.agri;
            if (p.food >= p.people) {
                p.food -= p.people;
                continue;
            }
            const short = p.people - p.food;
            p.food = 0;
            if (resourceCount(p.res) + 2 * p.choice2.length >= short) {
                this.pending = { kind: 'feed', seat, short };
                return;
            }
            this.starve(p, short);
        }
        this.endRound();
    }

    starve(p, short) {
        p.score -= STARVE_PENALTY;
        p.starved += 1;
        this.emit({ type: 'starve', seat: p.id });
        this.log(`${p.name}：食料が${short}足りず −${STARVE_PENALTY}点`);
    }

    check_feed(seat, { pay }) {
        const pending = this.pending;
        if (pending?.kind !== 'feed') return '今は食べさせる番ではありません';
        const p = this.players[seat];
        if (pay === null || pay === undefined) {
            return { recorded: { type: 'feed', pay: null }, run: () => { this.pending = null; this.starve(p, pending.short); } };
        }
        if (!isPay(pay)) return '払う資源が正しくありません';
        const amount = normalizePay(pay);
        if (resourceCount(amount) !== pending.short) return `資源をちょうど${pending.short}つ払います`;
        if (RESOURCES.some(r => amount[r] > p.res[r])) return '資源が足りません';
        return {
            recorded: { type: 'feed', pay: amount },
            run: () => {
                RESOURCES.forEach(r => { p.res[r] -= amount[r]; });
                this.pending = null;
                this.log(`${p.name}：食料の代わりに${payText(amount)}`);
            }
        };
    }

    // ---- 記録 ----

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
