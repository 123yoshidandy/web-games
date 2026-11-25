/**
 * アグリコラ（ファミリー版、1〜4人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（ラウンドカードの順はシードから決まる）
 *
 * ラウンドの流れ：ラウンドカードを1枚めくる → ためる場所に足す → スタートプレイヤーから順に家族を1人ずつ置いて行動 → 家に戻る
 * 4・7・9・11・13・14ラウンドのあとに収穫：畑から1つずつ取る → 食事（1人2食料、生まれたばかりは1） → 繁殖
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 換算（穀物・野菜・動物・作業場を食料に）は、収穫の食事と、動物があふれたときだけ行う
 * - あふれた動物は、調理の進歩があれば自動で食料にする（なければ逃がす）
 * - 繁殖で全部の赤ちゃんが入らないときは、牛・猪・羊の順に入れる
 * - 食事で、食料が足りていて作業場も使えないときは、自動で払う。足りなくて換算できるものがなければ、自動で物乞いカード
 * - 柵：新しい牧場は、つながったマスを選んで囲う。今の牧場の中のマスだけを選ぶと、その牧場を分ける
 */

import { createRandom, shuffle } from './random.js';
import {
    SPACES, BOARD_SPACES, PLAYER_CARDS, STAGES, MAJORS, MAJOR, FIREPLACES, ROUNDS, HARVEST_ROUNDS, MAX_FAMILY,
    BUILDING_RES, GOOD_NAME, hasAll
} from './cards.js';
import {
    CELLS, ANIMALS, MAX_STABLES, createFarm, fieldAt, canPlow, canRoom, canStable, addPastures, ROOM_COST, NEXT_HOUSE,
    renovationCost, fits, pastureIndex
} from './farm.js';
import { cookRates, bakeFood, crafts } from './cooking.js';
import { scoreBreakdown } from './scoring.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
const MAX_LOGS = 500;
const MAX_EVENTS = 60;
const HOUSE_NAME = { wood: '木の家', clay: 'レンガの家', stone: '石の家' };

export const COMMAND_FIELDS = {
    act: ['space', 'rooms', 'stables', 'cell', 'sow', 'bake', 'pastures', 'major', 'payWith', 'res'],
    keep: ['animals'],
    feed: ['convert', 'crafts']
};

const goodsText = (goods) => Object.entries(goods).filter(([, n]) => n > 0).map(([k, n]) => `${GOOD_NAME[k]}${n}`).join('・') || 'なし';
const isInt = (n) => Number.isInteger(n) && n >= 0;
const cellsOk = (list) => Array.isArray(list) && list.every(c => Number.isInteger(c) && c >= 0 && c < CELLS) && new Set(list).size === list.length;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は1〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        const n = players.length;
        this.solo = n === 1;
        this.startPlayer = Math.floor(this.random() * n);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            members: 2, newborns: 0, available: 0,
            food: this.solo ? 0 : (id === this.startPlayer ? 2 : 3),
            res: { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, veg: 0 },
            animals: { sheep: 0, boar: 0, cattle: 0 },
            farm: createFarm(), majors: [], begging: 0, wellRounds: [], craftsUsed: [], final: null
        }));
        this.roundCards = STAGES.flatMap(stage => shuffle([...stage], this.random));
        this.spaces = [...BOARD_SPACES, ...PLAYER_CARDS[n]];
        this.goods = {};
        this.spaces.forEach(id => { this.goods[id] = {}; });
        this.occupied = {};
        this.majorsLeft = MAJORS.map(m => m.id);
        this.round = 0;
        this.phase = 'work';        // work：行動 / feed：収穫の食事 / end：終わり
        this.current = this.startPlayer;
        this.pending = null;        // 動物があふれたときの選択
        this.feeding = [];          // 食事を決めていない人
        this.winners = [];
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

    actors() {
        if (this.phase === 'end') return [];
        if (this.pending) return [this.pending.seat];
        if (this.phase === 'feed') return [...this.feeding];
        return [this.current];
    }

    // ---- ラウンド ----

    startRound() {
        this.round += 1;
        this.phase = 'work';
        const card = this.roundCards[this.round - 1];
        this.spaces.push(card);
        this.goods[card] = {};
        // ためる場所に足す（1人用の森は2）
        this.spaces.forEach(id => {
            const add = SPACES[id].add;
            if (!add) return;
            Object.entries(add).forEach(([k, v]) => {
                const n = id === 'forest' && this.solo ? 2 : v;
                this.goods[id][k] = (this.goods[id][k] ?? 0) + n;
            });
        });
        this.occupied = {};
        this.players.forEach(p => {
            p.newborns = 0;
            p.available = p.members;
            if (p.wellRounds.includes(this.round)) {
                p.food += 1;
                p.wellRounds = p.wellRounds.filter(r => r !== this.round);
            }
        });
        this.current = this.startPlayer;
        this.emit({ type: 'round', round: this.round, card });
        this.log(`ラウンド${this.round}：${SPACES[card].name}が加わった`);
    }

    nextTurn() {
        const n = this.players.length;
        for (let k = 1; k <= n; k++) {
            const seat = (this.current + k) % n;
            if (this.players[seat].available > 0 && this.legalSpaces(seat).length) {
                this.current = seat;
                return;
            }
        }
        this.endWork();
    }

    endWork() {
        if (HARVEST_ROUNDS.includes(this.round)) this.harvest();
        else this.startRound();
    }

    harvest() {
        this.log(`収穫（ラウンド${this.round}）`);
        this.players.forEach(p => {
            const got = { grain: 0, veg: 0 };
            p.farm.fields.forEach(f => {
                if (!f.crop || !f.n) return;
                got[f.crop] += 1;
                p.res[f.crop] += 1;
                f.n -= 1;
                if (!f.n) f.crop = null;
            });
            if (got.grain || got.veg) this.log(`${p.name}：畑から${goodsText(got)}`);
            p.craftsUsed = [];
        });
        this.phase = 'feed';
        this.feeding = [];
        this.players.forEach(p => {
            if (this.needsFeedChoice(p)) this.feeding.push(p.id);
            else this.payFood(p);
        });
        if (!this.feeding.length) this.breed();
    }

    foodNeed(p) {
        const adults = p.members - p.newborns;
        return adults * (this.solo ? 3 : 2) + p.newborns;
    }

    // 食事で選ぶことがあるか（足りないが換算できるものがある、または作業場を使える）
    needsFeedChoice(p) {
        const craftable = crafts(p.majors).some(c => p.res[c.res] > 0);
        if (craftable) return true;
        if (p.food >= this.foodNeed(p)) return false;
        const rates = cookRates(p.majors);
        return p.res.grain > 0 || p.res.veg > 0 || ANIMALS.some(t => p.animals[t] > 0 && rates[t] > 0);
    }

    payFood(p) {
        const need = this.foodNeed(p);
        const paid = Math.min(need, p.food);
        p.food -= paid;
        if (paid < need) {
            p.begging += need - paid;
            this.emit({ type: 'beg', seat: p.id, n: need - paid });
            this.log(`${p.name}：食料が${need - paid}足りず、物乞いカード${need - paid}枚`);
        }
    }

    breed() {
        this.players.forEach(p => {
            const born = [];
            ['cattle', 'boar', 'sheep'].forEach(t => {
                if (p.animals[t] < 2) return;
                const next = { ...p.animals, [t]: p.animals[t] + 1 };
                if (fits(p.farm, next)) {
                    p.animals = next;
                    born.push(GOOD_NAME[t]);
                }
            });
            if (born.length) this.log(`${p.name}：${born.join('・')}が生まれた`);
        });
        if (this.round >= ROUNDS) this.endGame();
        else this.startRound();
    }

    endGame() {
        this.phase = 'end';
        this.pending = null;
        this.feeding = [];
        this.players.forEach(p => {
            p.final = scoreBreakdown(p);
        });
        const best = Math.max(...this.players.map(p => p.final.total));
        this.winners = this.players.filter(p => p.final.total === best).map(p => p.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`得点：${this.players.map(p => `${p.name} ${p.final.total}`).join('・')}`);
        this.log(this.players.length === 1 ? `${this.players[0].final.total}点` : `${this.winners.map(id => this.players[id].name).join('と')}の勝ち`);
    }

    // ---- 操作 ----

    // 受け付けたら true、できなければ lastError に理由を入れて false。断る操作は状態を変えない
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        const check = this[`check_${command.type}`](playerId, command);
        if (typeof check === 'string') return this.fail(check);
        this.commands.push({ playerId, command: check.recorded });
        check.run();
        return true;
    }

    // 置ける行動スペース
    legalSpaces(seat) {
        if (this.phase !== 'work') return [];
        return this.spaces.filter(id => this.occupied[id] === undefined && this.canUse(seat, id));
    }

    // その行動スペースで、何かできるか（細かい選び方は check_act で確かめる）
    canUse(seat, id) {
        const p = this.players[seat];
        const farm = p.farm;
        const kind = SPACES[id].kind;
        const all = Array.from({ length: CELLS }, (_, c) => c);
        switch (kind) {
            case 'build': {
                const room = hasAll(p.res, ROOM_COST[farm.house]) && all.some(c => canRoom(farm, c));
                const stable = p.res.wood >= 2 && farm.stables.length < MAX_STABLES && all.some(c => canStable(farm, c));
                return room || stable;
            }
            case 'plow': return all.some(c => canPlow(farm, c));
            case 'sowBake': return this.canSow(p) || this.canBakeNow(p);
            case 'plowSow': return all.some(c => canPlow(farm, c)) || this.canSow(p);
            case 'fences': return this.canFence(p);
            case 'major': return this.affordableMajors(p).length > 0;
            case 'renoMajor':
            case 'renoFences': {
                const cost = renovationCost(farm);
                return !!cost && hasAll(p.res, cost);
            }
            case 'family': return p.members < MAX_FAMILY && farm.rooms.length > p.members;
            case 'urgent': return p.members < MAX_FAMILY;
            default: return true;
        }
    }

    canSow(p) {
        return (p.res.grain > 0 || p.res.veg > 0) && p.farm.fields.some(f => !f.crop);
    }

    canBakeNow(p) {
        return p.res.grain > 0 && bakeFood(p.majors, 1) !== null;
    }

    // 1マスの牧場（新しく作るか、今の牧場を分ける）を、1つでも建てられるか
    canFence(p) {
        const farm = p.farm;
        for (let c = 0; c < CELLS; c++) {
            const i = pastureIndex(farm, c);
            if (i >= 0 && farm.pastures[i].length < 2) continue;
            const r = addPastures(farm, [[c]]);
            if (!r.error && r.newFences <= p.res.wood && r.newFences > 0) return true;
        }
        return false;
    }

    // 買える大きな進歩（調理場は、かまどを返して買うこともできる）
    affordableMajors(p, res = p.res) {
        return this.majorsLeft.filter(id => hasAll(res, MAJOR[id].cost) || (MAJOR[id].upgrade && p.majors.some(m => FIREPLACES.includes(m))));
    }

    check_act(seat, command) {
        if (this.phase !== 'work' || this.pending) return '今は家族を置けません';
        const id = command.space;
        if (typeof id !== 'string' || !this.spaces.includes(id)) return 'その行動はありません';
        if (this.occupied[id] !== undefined) return 'もう使われています';
        const p = this.players[seat];
        const plan = this.planAction(p, id, command);
        if (typeof plan === 'string') return plan;
        return {
            recorded: { type: 'act', space: id, ...plan.recorded },
            run: () => {
                this.occupied[id] = seat;
                p.available -= 1;
                plan.run();
                this.emit({ type: 'act', seat, space: id });
                if (!this.pending) this.nextTurn();
            }
        };
    }

    // 行動の中身を確かめる。だめなら理由、よければ { recorded, run }
    planAction(p, id, command) {
        const space = SPACES[id];
        const farm = p.farm;
        const say = (text) => this.log(`${p.name}：${space.name}（${text}）`);
        switch (space.kind) {
            case 'take':
                return { recorded: {}, run: () => { this.gain(p, space.take); say(goodsText(space.take)); } };
            case 'acc':
                return {
                    recorded: {},
                    run: () => {
                        const goods = this.goods[id];
                        this.goods[id] = {};
                        this.gain(p, goods);
                        say(goodsText(goods));
                    }
                };
            case 'animal':
                return {
                    recorded: {},
                    run: () => {
                        const goods = this.goods[id];
                        this.goods[id] = {};
                        say(goodsText(goods));
                        this.addAnimals(p, goods);
                    }
                };
            case 'start':
                return { recorded: {}, run: () => { this.startPlayer = p.id; say('次のラウンドから最初の番'); } };
            case 'laborer': {
                if (!BUILDING_RES.includes(command.res)) return '資源を選んでください';
                return { recorded: { res: command.res }, run: () => { this.gain(p, { food: 1, [command.res]: 1 }); say(`食料1・${GOOD_NAME[command.res]}1`); } };
            }
            case 'build': return this.planBuild(p, command, say);
            case 'plow': {
                if (!Number.isInteger(command.cell) || !canPlow(farm, command.cell)) return 'そこは耕せません';
                return { recorded: { cell: command.cell }, run: () => { farm.fields.push({ cell: command.cell, crop: null, n: 0 }); say('畑を1つ'); } };
            }
            case 'sowBake': return this.planSowBake(p, command, say, { plow: false });
            case 'plowSow': return this.planSowBake(p, command, say, { plow: true });
            case 'fences': {
                const fence = this.planFences(p, command.pastures, p.res);
                if (typeof fence === 'string') return fence;
                if (!fence.count) return '牧場を選んでください';
                return { recorded: { pastures: fence.pastures }, run: () => { fence.run(); say(`柵${fence.newFences}本・牧場${p.farm.pastures.length}つ`); } };
            }
            case 'major': {
                const major = this.planMajor(p, command, p.res);
                if (typeof major === 'string') return major;
                if (!major.id) return '大きな進歩を選んでください';
                return { recorded: major.recorded, run: () => { major.run(); say(major.text); } };
            }
            case 'renoMajor':
            case 'renoFences': {
                const cost = renovationCost(farm);
                if (!cost || !hasAll(p.res, cost)) return '改築できません';
                const after = { ...p.res };
                Object.entries(cost).forEach(([k, v]) => { after[k] -= v; });
                const renovate = () => {
                    Object.entries(cost).forEach(([k, v]) => { p.res[k] -= v; });
                    farm.house = NEXT_HOUSE[farm.house];
                };
                if (space.kind === 'renoMajor') {
                    const major = this.planMajor(p, command, after);
                    if (typeof major === 'string') return major;
                    return {
                        recorded: major.recorded,
                        run: () => { renovate(); if (major.id) major.run(); say(`${HOUSE_NAME[farm.house]}に${major.id ? `・${major.text}` : ''}`); }
                    };
                }
                const list = command.pastures ?? [];
                const fence = list.length ? this.planFences(p, list, after) : { pastures: [], count: 0, run: () => {} };
                if (typeof fence === 'string') return fence;
                return {
                    recorded: { pastures: fence.pastures },
                    run: () => { renovate(); fence.run(); say(`${HOUSE_NAME[farm.house]}に${fence.count ? `・柵${fence.newFences}本` : ''}`); }
                };
            }
            case 'family':
            case 'urgent': {
                if (p.members >= MAX_FAMILY) return '家族は5人までです';
                if (space.kind === 'family' && farm.rooms.length <= p.members) return '家族より多い部屋が要ります';
                return {
                    recorded: {},
                    run: () => {
                        p.members += 1;
                        p.newborns += 1;
                        this.emit({ type: 'born', seat: p.id });
                        say(`家族が${p.members}人に`);
                    }
                };
            }
            default:
                return 'その行動はありません';
        }
    }

    planBuild(p, { rooms = [], stables = [] }, say) {
        const farm = p.farm;
        if (!cellsOk(rooms) || !cellsOk(stables)) return 'マスが正しくありません';
        if (!rooms.length && !stables.length) return '部屋か厩を選んでください';
        const built = [];
        for (const c of rooms) {
            if (!canRoom(farm, c, built)) return 'そこには部屋を建てられません';
            built.push(c);
        }
        if (stables.some(c => rooms.includes(c) || !canStable(farm, c))) return 'そこには厩を建てられません';
        if (farm.stables.length + stables.length > MAX_STABLES) return `厩は${MAX_STABLES}つまでです`;
        const cost = {};
        Object.entries(ROOM_COST[farm.house]).forEach(([k, v]) => { cost[k] = (cost[k] ?? 0) + v * rooms.length; });
        cost.wood = (cost.wood ?? 0) + 2 * stables.length;
        if (!hasAll(p.res, cost)) return '資源が足りません';
        return {
            recorded: { rooms: [...rooms], stables: [...stables] },
            run: () => {
                Object.entries(cost).forEach(([k, v]) => { p.res[k] -= v; });
                farm.rooms.push(...rooms);
                farm.stables.push(...stables);
                say([rooms.length ? `部屋${rooms.length}` : '', stables.length ? `厩${stables.length}` : ''].filter(Boolean).join('・'));
            }
        };
    }

    planSowBake(p, { cell = null, sow = [], bake = 0 }, say, { plow }) {
        const farm = p.farm;
        if (!Array.isArray(sow)) return '種まきの指定が正しくありません';
        if (!plow && cell !== null) return '耕せません';
        let plowed = null;
        if (plow && cell !== null) {
            if (!Number.isInteger(cell) || !canPlow(farm, cell)) return 'そこは耕せません';
            plowed = cell;
        }
        const cells = sow.map(s => s?.cell);
        if (!cellsOk(cells)) return 'マスが正しくありません';
        const use = { grain: 0, veg: 0 };
        for (const s of sow) {
            if (s.crop !== 'grain' && s.crop !== 'veg') return 'まくものを選んでください';
            const field = fieldAt(farm, s.cell);
            if (!(field && !field.crop) && s.cell !== plowed) return '空いている畑にまきます';
            use[s.crop] += 1;
        }
        if (use.grain > p.res.grain || use.veg > p.res.veg) return '種が足りません';
        if (plow) bake = 0;
        if (!isInt(bake)) return 'パンの数が正しくありません';
        let food = 0;
        if (bake > 0) {
            if (bake > p.res.grain - use.grain) return '穀物が足りません';
            food = bakeFood(p.majors, bake);
            if (food === null) return 'そんなに焼けません';
        }
        if (plowed === null && !sow.length && !bake) return plow ? '耕すか、まくか、選んでください' : 'まくか、焼くか、選んでください';
        return {
            recorded: plow ? { cell: plowed, sow: sow.map(s => ({ cell: s.cell, crop: s.crop })) } : { sow: sow.map(s => ({ cell: s.cell, crop: s.crop })), bake },
            run: () => {
                if (plowed !== null) farm.fields.push({ cell: plowed, crop: null, n: 0 });
                sow.forEach(s => {
                    const field = fieldAt(farm, s.cell);
                    field.crop = s.crop;
                    field.n = s.crop === 'grain' ? 3 : 2;
                    p.res[s.crop] -= 1;
                });
                if (bake) {
                    p.res.grain -= bake;
                    p.food += food;
                }
                say([plowed !== null ? '畑を1つ' : '', use.grain ? `穀物を${use.grain}` : '', use.veg ? `野菜を${use.veg}` : '', bake ? `パン${bake}で食料${food}` : ''].filter(Boolean).join('・'));
            }
        };
    }

    planFences(p, list, res) {
        if (!Array.isArray(list) || !list.every(cellsOk)) return '牧場のマスが正しくありません';
        const result = addPastures(p.farm, list);
        if (result.error) return result.error;
        if (result.newFences > res.wood) return `木が足りません（柵${result.newFences}本）`;
        return {
            pastures: list.map(cells => [...cells]),
            count: list.length,
            newFences: result.newFences,
            run: () => {
                p.res.wood -= result.newFences;
                p.farm.pastures = result.farm.pastures;
            }
        };
    }

    // 大きな進歩。major が null なら買わない（改築のあとの任意の進歩）
    planMajor(p, { major = null, payWith = null, bake = 0 }, res) {
        if (major === null || major === undefined) return { id: null, recorded: {}, run: () => {} };
        if (!this.majorsLeft.includes(major)) return 'その進歩はもうありません';
        const card = MAJOR[major];
        let cost = card.cost;
        let returned = null;
        if (payWith !== null && payWith !== undefined) {
            if (!card.upgrade || !FIREPLACES.includes(payWith) || !p.majors.includes(payWith)) return 'その払い方はできません';
            cost = {};
            returned = payWith;
        }
        if (!hasAll(res, cost)) return '資源が足りません';
        if (!isInt(bake)) return 'パンの数が正しくありません';
        const after = [...p.majors.filter(m => m !== returned), major];
        let food = 0;
        if (bake) {
            if (!card.oven) return '暖炉を建てたときだけ、すぐに焼けます';
            if (bake > res.grain) return '穀物が足りません';
            food = bakeFood(after, bake);
            if (food === null) return 'そんなに焼けません';
        }
        return {
            id: major,
            recorded: { major, payWith: returned, bake },
            text: `${card.name}${returned ? '（かまどを返す）' : ''}${bake ? `・パン${bake}で食料${food}` : ''}`,
            run: () => {
                Object.entries(cost).forEach(([k, v]) => { p.res[k] -= v; });
                this.majorsLeft = this.majorsLeft.filter(m => m !== major);
                if (returned) {
                    p.majors = p.majors.filter(m => m !== returned);
                    this.majorsLeft.push(returned);
                    this.majorsLeft.sort((a, b) => MAJORS.findIndex(m => m.id === a) - MAJORS.findIndex(m => m.id === b));
                }
                p.majors.push(major);
                if (card.well) {
                    for (let r = this.round + 1; r <= Math.min(ROUNDS, this.round + card.well); r++) p.wellRounds.push(r);
                }
                if (bake) {
                    p.res.grain -= bake;
                    p.food += food;
                }
            }
        };
    }

    gain(p, goods) {
        Object.entries(goods).forEach(([k, v]) => {
            if (k === 'food') p.food += v;
            else p.res[k] += v;
        });
    }

    // 動物を農場に入れる。入りきらなければ、残す数を選ぶ
    addAnimals(p, goods) {
        const next = { ...p.animals };
        ANIMALS.forEach(t => { next[t] += goods[t] ?? 0; });
        if (fits(p.farm, next)) {
            p.animals = next;
            return;
        }
        this.pending = { kind: 'keep', seat: p.id, animals: next };
    }

    check_keep(seat, { animals }) {
        const pending = this.pending;
        if (pending?.kind !== 'keep') return '今はその操作はできません';
        if (!animals || typeof animals !== 'object' || !ANIMALS.every(t => isInt(animals[t] ?? 0))) return '数が正しくありません';
        const keep = Object.fromEntries(ANIMALS.map(t => [t, animals[t] ?? 0]));
        if (ANIMALS.some(t => keep[t] > pending.animals[t])) return 'そんなにいません';
        const p = this.players[seat];
        if (!fits(p.farm, keep)) return '農場に入りきりません';
        return {
            recorded: { type: 'keep', animals: { ...keep } },
            run: () => {
                const rates = cookRates(p.majors);
                let food = 0;
                const gone = {};
                ANIMALS.forEach(t => {
                    const n = pending.animals[t] - keep[t];
                    if (n > 0) gone[t] = n;
                    food += n * rates[t];
                });
                p.animals = { ...keep };
                p.food += food;
                this.pending = null;
                this.log(`${p.name}：${goodsText(gone)}を${food ? `食料${food}にした` : '逃がした'}`);
                this.nextTurn();
            }
        };
    }

    check_feed(seat, { convert = {}, crafts: used = [] }) {
        if (this.phase !== 'feed' || !this.feeding.includes(seat)) return '今は食事ではありません';
        const p = this.players[seat];
        if (!convert || typeof convert !== 'object' || !Array.isArray(used)) return '換算の指定が正しくありません';
        const keys = ['grain', 'veg', ...ANIMALS];
        const amount = Object.fromEntries(keys.map(k => [k, convert[k] ?? 0]));
        if (!keys.every(k => isInt(amount[k]))) return '数が正しくありません';
        const rates = cookRates(p.majors);
        for (const k of keys) {
            const have = ANIMALS.includes(k) ? p.animals[k] : p.res[k];
            if (amount[k] > have) return `${GOOD_NAME[k]}が足りません`;
            if (amount[k] && !rates[k]) return `${GOOD_NAME[k]}は調理の進歩がないと食料にできません`;
        }
        const own = crafts(p.majors);
        if (new Set(used).size !== used.length) return '作業場は1回ずつです';
        for (const id of used) {
            const craft = own.find(c => c.id === id);
            if (!craft) return 'その作業場はありません';
            if (p.res[craft.res] - (amount[craft.res] ?? 0) < 1) return `${GOOD_NAME[craft.res]}が足りません`;
        }
        return {
            recorded: { type: 'feed', convert: { ...amount }, crafts: [...used] },
            run: () => {
                let food = 0;
                keys.forEach(k => {
                    if (!amount[k]) return;
                    if (ANIMALS.includes(k)) p.animals[k] -= amount[k];
                    else p.res[k] -= amount[k];
                    food += amount[k] * rates[k];
                });
                used.forEach(id => {
                    const craft = own.find(c => c.id === id);
                    p.res[craft.res] -= 1;
                    food += craft.food;
                });
                p.food += food;
                if (food) this.log(`${p.name}：食料${food}を作った`);
                this.payFood(p);
                this.feeding = this.feeding.filter(s => s !== seat);
                if (!this.feeding.length) this.breed();
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

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
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

