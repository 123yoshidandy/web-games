/**
 * ロード・オブ・ウォーターディープのルール（DOM に依存しない）
 *
 * - すべての操作は applyCommand(seat, command) を通す。受け付けた操作だけを commands に記録し、replay で同じ状態を作り直せる
 * - 断る操作は状態を変えない（判定をすべて済ませてから変える）
 * - 乱数はシード付き。状態（rngState）として持つので、状態を JSON にそのまま写せる（CPU の先読みで使う）
 *
 * 流れ：
 *   ラウンドの初め：建築家の会館の建物に1点ずつ積む・5ラウンド目にエージェントが1人増える・大使を持つ人が先に置く
 *   置く段階（place）：先手番から順に1人ずつエージェントを置き、その場所の効果を受ける。番の終わりにクエストを1枚達成できる
 *   置き直す段階（reassign）：港に置いたエージェントを、港の順に空いている場所へ置き直す
 *   8ラウンドの後、冒険者1体1点・金貨2で1点・ロードの点を足して終わる
 *
 * 選ぶことがあると、queue に「決めること」を積み、先頭から1つずつ答えてもらう（相手の番でも答えることがある）
 *   pick（冒険者を選ぶ）・quest（表のクエストを取る）・buy（建物を建てる）・intrigue（陰謀カードを使う）
 *   opponent（相手を選ぶ）・option（頼みごとの5択）・target（ゾアスターで使う場所）・complete（クエストを達成するか）
 */

import {
    BASIC_SPACES, SPACE_BY_ID, HARBORS, BUILDINGS, BUILDING_BY_ID, QUESTS, QUEST_BY_ID, INTRIGUES, INTRIGUE_BY_ID,
    LORDS, LORD_BY_ID, CUBES, RESOURCES, RESOURCE_NAME, FAVOR_OPTIONS, ROUNDS, gainText
} from './cards.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const AGENTS = { 2: 4, 3: 3, 4: 2, 5: 2 };
export const HALL_SIZE = 3;
export const INN_SIZE = 4;

// 操作の種類と、記録に残す項目
export const COMMAND_FIELDS = {
    place: ['space'],
    pick: ['cubes'],
    quest: ['index'],
    buy: ['building'],
    intrigue: ['index'],
    opponent: ['seat'],
    option: ['index'],
    target: ['space'],
    complete: ['quest']
};

const zeroRes = () => ({ f: 0, r: 0, w: 0, c: 0, g: 0 });
const isInt = (v) => Number.isInteger(v);

export function meets(res, req) {
    return RESOURCES.every(r => (res[r] ?? 0) >= (req[r] ?? 0));
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数が合いません');
        this.setup = players.map(p => ({ name: p.name, isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        this.options = { seed: (options.seed ?? 1) >>> 0 };
        this.rngState = this.options.seed;
        this.commands = [];
        this.logs = [];
        this.lastError = null;
        this.round = 0;
        this.phase = 'place';
        this.queue = [];
        this.turn = null;
        this.occupied = {};
        this.buildings = [];          // 建てた建物 [{ id, owner }]
        this.ambassador = { holder: null, out: false };
        this.winners = [];

        const n = players.length;
        this.questDeck = this.shuffle(QUESTS.map(q => q.id));
        this.questDiscard = [];
        this.intrigueDeck = this.shuffle(INTRIGUES.flatMap(c => Array(c.count).fill(c.id)));
        this.intrigueDiscard = [];
        this.buildingDeck = this.shuffle(BUILDINGS.map(b => b.id));
        const lords = this.shuffle(LORDS.map(l => l.id));
        this.firstPlayer = Math.floor(this.rand() * n);
        this.current = this.firstPlayer;

        this.players = this.setup.map((p, id) => ({
            id,
            name: p.name,
            isCPU: p.isCPU,
            cpuLevel: p.cpuLevel,
            lord: lords[id],
            res: zeroRes(),
            vp: 0,
            agents: AGENTS[n],
            agentsLeft: 0,
            quests: [],
            completed: [],
            plots: [],
            intrigue: [],
            final: null
        }));
        // 金貨は先手番から4・5・6…
        for (let i = 0; i < n; i++) this.players[(this.firstPlayer + i) % n].res.g = 4 + i;
        this.players.forEach(p => {
            p.quests.push(this.drawQuest(), this.drawQuest());
            p.intrigue.push(this.drawIntrigue(), this.drawIntrigue());
        });
        this.inn = Array.from({ length: INN_SIZE }, () => this.drawQuest()).filter(Boolean);
        this.hall = Array.from({ length: HALL_SIZE }, () => ({ id: this.buildingDeck.shift(), vp: 0 }));
        this.log(`${this.players[this.firstPlayer].name}が先手番`);
        this.startRound();
        this.advance();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`記録の ${i} 番目を再現できません: ${game.lastError}`);
        });
        return game;
    }

    persist() {
        return { players: this.setup.map(p => ({ ...p })), options: { ...this.options }, commands: this.commands.map(c => structuredClone(c)) };
    }

    // CPU の先読み用の写し（記録とログは持たない）
    clone() {
        const copy = Object.create(Game.prototype);
        for (const [key, value] of Object.entries(this)) {
            if (key === 'commands' || key === 'logs') copy[key] = [];
            else copy[key] = typeof value === 'object' && value !== null ? structuredClone(value) : value;
        }
        return copy;
    }

    // ---- 乱数 ----

    rand() {
        this.rngState = (this.rngState + 0x6D2B79F5) >>> 0;
        let t = this.rngState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.rand() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // ---- 山札 ----

    drawQuest() {
        if (!this.questDeck.length && this.questDiscard.length) {
            this.questDeck = this.shuffle(this.questDiscard);
            this.questDiscard = [];
        }
        return this.questDeck.shift() ?? null;
    }

    drawIntrigue() {
        if (!this.intrigueDeck.length && this.intrigueDiscard.length) {
            this.intrigueDeck = this.shuffle(this.intrigueDiscard);
            this.intrigueDiscard = [];
        }
        return this.intrigueDeck.shift() ?? null;
    }

    refillInn() {
        while (this.inn.length < INN_SIZE) {
            const q = this.drawQuest();
            if (!q) break;
            this.inn.push(q);
        }
    }

    log(text, seat = null) {
        this.logs.push({ text, seat, round: this.round });
    }

    // ---- 状態を調べる ----

    isOver() {
        return this.phase === 'over';
    }

    // 今、操作を待っている人（いつも0人か1人）
    actors() {
        if (this.isOver()) return [];
        if (this.queue.length) return [this.queue[0].seat];
        if (this.turn) return [];
        return [this.current];
    }

    // 置ける場所の一覧（建てた建物の id は 'b:<建物>'）
    allSpaces() {
        return [...BASIC_SPACES.map(s => s.id), ...this.buildings.map(b => `b:${b.id}`)];
    }

    ownerOf(space) {
        if (!space.startsWith('b:')) return null;
        return this.buildings.find(b => `b:${b.id}` === space)?.owner ?? null;
    }

    // 空いているかを除いた、使えるかどうか
    usable(seat, space, { ambassador = false, reassign = false, viaZoar = false } = {}) {
        const p = this.players[seat];
        if (HARBORS.includes(space)) return !reassign && !viaZoar && p.intrigue.length > 0;
        if (space === 'builders') return this.hall.some(h => h && BUILDING_BY_ID[h.id].cost <= p.res.g);
        if (space.startsWith('b:')) {
            const b = BUILDING_BY_ID[space.slice(2)];
            if (!b || !this.buildings.some(x => x.id === b.id)) return false;
            if (b.gain.pay && p.res.g < b.gain.pay) return false;
            if (b.special === 'palace') return !ambassador && this.ambassador.holder === null && !this.ambassador.out;
            if (b.special === 'zoar') return !viaZoar && this.zoarTargets(seat).length > 0;
            return true;
        }
        return !!SPACE_BY_ID[space];
    }

    zoarTargets(seat) {
        return Object.entries(this.occupied)
            .filter(([space, a]) => a.seat !== seat && space !== 'b:zoar' && !HARBORS.includes(space))
            .map(([space]) => space)
            .filter(space => this.usable(seat, space, { viaZoar: true }));
    }

    legalSpaces(seat) {
        if (this.isOver() || this.queue.length || this.turn || seat !== this.current) return [];
        const opts = { ambassador: this.phase === 'ambassador', reassign: this.phase === 'reassign' };
        return this.allSpaces().filter(s => !this.occupied[s] && this.usable(seat, s, opts));
    }

    hasMandatory(seat) {
        return this.players[seat].quests.some(id => QUEST_BY_ID[id].type === 'mandatory');
    }

    completable(seat) {
        const p = this.players[seat];
        const mandatory = this.hasMandatory(seat);
        return p.quests.filter(id => {
            const q = QUEST_BY_ID[id];
            return (!mandatory || q.type === 'mandatory') && meets(p.res, q.req);
        });
    }

    hasPlot(seat, kind, key) {
        return this.players[seat].plots.some(id => {
            const plot = QUEST_BY_ID[id].plot;
            return plot.kind === kind && (key === undefined || plot.res === key || plot.qtype === key);
        });
    }

    // ---- 操作 ----

    applyCommand(seat, command) {
        this.lastError = null;
        const error = this.check(seat, command);
        if (error) {
            this.lastError = error;
            return false;
        }
        const clean = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(f => { clean[f] = structuredClone(command[f] ?? null); });
        this.commands.push({ playerId: seat, command: clean });
        this.execute(seat, clean);
        this.advance();
        return true;
    }

    // 受け付けられるかだけを調べる（状態は変えない）。断る理由を返す
    check(seat, command) {
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return 'その操作はできません';
        if (this.isOver()) return 'ゲームは終わっています';
        if (!isInt(seat) || !this.players[seat]) return 'その席はありません';
        const p = this.players[seat];
        const head = this.queue[0];
        if (command.type === 'place') {
            if (head || this.turn) return '今は置けません';
            if (seat !== this.current) return 'あなたの番ではありません';
            if (!this.legalSpaces(seat).includes(command.space)) return 'そこには置けません';
            return null;
        }
        if (!head || head.seat !== seat) return '今はその操作はできません';
        if (head.type !== command.type) return '今はその操作はできません';
        switch (command.type) {
            case 'pick': {
                const cubes = command.cubes;
                if (!cubes || typeof cubes !== 'object') return '選び方が正しくありません';
                let sum = 0;
                for (const [k, v] of Object.entries(cubes)) {
                    if (!CUBES.includes(k) || !isInt(v) || v < 0) return '選び方が正しくありません';
                    if (v > 0 && !head.types.includes(k)) return 'その冒険者は選べません';
                    sum += v;
                }
                return sum === head.n ? null : `${head.n}体を選んでください`;
            }
            case 'quest':
                return isInt(command.index) && this.inn[command.index] ? null : 'そのクエストはありません';
            case 'buy': {
                const slot = this.hall.find(h => h && h.id === command.building);
                if (!slot) return 'その建物はありません';
                if (!head.free && BUILDING_BY_ID[slot.id].cost > p.res.g) return '金貨が足りません';
                return null;
            }
            case 'intrigue':
                return isInt(command.index) && p.intrigue[command.index] ? null : 'その陰謀カードはありません';
            case 'opponent':
                return isInt(command.seat) && this.players[command.seat] && command.seat !== seat ? null : 'その相手は選べません';
            case 'option':
                return isInt(command.index) && FAVOR_OPTIONS[command.index] ? null : 'その選択肢はありません';
            case 'target':
                return this.zoarTargets(seat).includes(command.space) ? null : 'その場所は使えません';
            case 'complete':
                if (command.quest === null || command.quest === undefined) return null;
                return this.completable(seat).includes(command.quest) ? null : 'そのクエストは達成できません';
            default:
                return 'その操作はできません';
        }
    }

    execute(seat, command) {
        if (command.type === 'place') {
            this.place(seat, command.space);
            return;
        }
        const head = this.queue.shift();
        const p = this.players[seat];
        switch (command.type) {
            case 'pick': {
                const got = {};
                CUBES.forEach(k => { if (command.cubes[k]) got[k] = command.cubes[k]; });
                this.addRes(seat, got);
                this.log(`${p.name}は${gainText(got)}を得た`, seat);
                break;
            }
            case 'quest': {
                const [id] = this.inn.splice(command.index, 1);
                p.quests.push(id);
                if (head.garden && this.turn) this.turn.garden = id;
                this.refillInn();
                this.log(`${p.name}はクエスト「${QUEST_BY_ID[id].name}」を取った`, seat);
                break;
            }
            case 'buy':
                this.build(seat, command.building, head.free);
                break;
            case 'intrigue': {
                const [id] = p.intrigue.splice(command.index, 1);
                this.intrigueDiscard.push(id);
                this.playIntrigue(seat, id);
                break;
            }
            case 'opponent':
                this.giveTo(seat, command.seat, head);
                break;
            case 'option': {
                const g = FAVOR_OPTIONS[command.index];
                this.addRes(seat, g);
                this.log(`${p.name}は${gainText(g)}を得た`, seat);
                break;
            }
            case 'target':
                this.log(`${p.name}はゾアスターで${this.spaceName(command.space)}を使った`, seat);
                this.resolveSpace(seat, command.space, true);
                break;
            case 'complete':
                if (command.quest) this.completeQuest(seat, command.quest);
                break;
        }
    }

    // ---- 置く ----

    place(seat, space) {
        const p = this.players[seat];
        const ambassador = this.phase === 'ambassador';
        if (this.phase === 'reassign') {
            const from = HARBORS[this.reassignSlot];
            const agent = this.occupied[from];
            delete this.occupied[from];
            this.occupied[space] = { seat, ambassador: !!agent?.ambassador };
            this.log(`${p.name}は港から${this.spaceName(space)}へ置き直した`, seat);
        } else {
            this.occupied[space] = { seat, ambassador };
            if (ambassador) {
                this.ambassador = { holder: null, out: true };
                this.log(`${p.name}は大使を${this.spaceName(space)}に置いた`, seat);
            } else {
                p.agentsLeft--;
                this.log(`${p.name}は${this.spaceName(space)}に置いた`, seat);
            }
        }
        this.turn = { seat, offered: false, garden: null };
        this.resolveSpace(seat, space, false);
    }

    spaceName(space) {
        if (space.startsWith('b:')) return BUILDING_BY_ID[space.slice(2)].name;
        return SPACE_BY_ID[space].name;
    }

    // その場所の効果を受ける（viaZoar：ゾアスターから使った）
    resolveSpace(seat, space, viaZoar) {
        const p = this.players[seat];
        if (space === 'castle') {
            this.firstPlayer = seat;
        }
        if (space === 'builders') {
            this.queue.push({ type: 'buy', seat, free: false });
            return;
        }
        if (HARBORS.includes(space)) {
            this.queue.push({ type: 'intrigue', seat });
            return;
        }
        if (space === 'inn2') {
            this.questDiscard.push(...this.inn);
            this.inn = [];
            this.refillInn();
            this.log('崖見の宿のクエストが入れ替わった');
        }
        if (space.startsWith('b:')) {
            const b = BUILDING_BY_ID[space.slice(2)];
            const owner = this.ownerOf(space);
            if (b.special === 'palace') {
                this.ambassador.holder = seat;
                this.log(`${p.name}は大使を取った`, seat);
            } else if (b.special === 'zoar') {
                this.queue.push({ type: 'target', seat });
            } else if (b.special === 'stone') {
                this.gain(seat, { g: this.buildings.length }, true);
            } else if (b.special === 'garden') {
                if (this.inn.length) this.queue.push({ type: 'quest', seat, garden: true });
            } else {
                this.gain(seat, b.gain, true);
            }
            if (owner !== null && owner !== seat) {
                this.gain(owner, b.owner, false);
                this.log(`持ち主の${this.players[owner].name}は${gainText(b.owner)}を得た`, owner);
            }
            return;
        }
        this.gain(seat, SPACE_BY_ID[space].gain, true);
    }

    addRes(seat, g) {
        const res = this.players[seat].res;
        RESOURCES.forEach(r => { if (g[r]) res[r] += g[r]; });
    }

    // 得る。fromSpace：場所の効果として得た（プロットの「もう1つ」が効く）
    gain(seat, g, fromSpace) {
        const p = this.players[seat];
        if (g.pay) p.res.g -= g.pay;
        const got = {};
        RESOURCES.forEach(r => { if (g[r]) got[r] = g[r]; });
        if (fromSpace) {
            CUBES.forEach(r => { if (got[r] && this.hasPlot(seat, 'extra', r)) got[r] += 1; });
            if (got.g && this.hasPlot(seat, 'extra', 'g')) got.g += 2;
        }
        this.addRes(seat, got);
        if (g.vp) p.vp += g.vp;
        for (let i = 0; i < (g.intrigue ?? 0); i++) {
            const card = this.drawIntrigue();
            if (card) p.intrigue.push(card);
        }
        if (g.pick) this.queue.push({ type: 'pick', seat, n: g.pick.n, types: [...g.pick.types] });
        for (let i = 0; i < (g.quest ?? 0); i++) if (this.inn.length) this.queue.push({ type: 'quest', seat });
        if (g.building && this.hall.some(Boolean)) this.queue.push({ type: 'buy', seat, free: true });
    }

    build(seat, id, free) {
        const p = this.players[seat];
        const index = this.hall.findIndex(h => h && h.id === id);
        const slot = this.hall[index];
        const b = BUILDING_BY_ID[id];
        if (!free) p.res.g -= b.cost;
        p.vp += slot.vp;
        this.buildings.push({ id, owner: seat });
        const next = this.buildingDeck.shift();
        this.hall[index] = next ? { id: next, vp: 0 } : null;
        let text = `${p.name}は${b.name}を建てた`;
        if (slot.vp) text += `（${slot.vp}点）`;
        if (this.hasPlot(seat, 'buildVp')) {
            p.vp += 4;
            text += '。プロットで4点';
        }
        this.log(text, seat);
    }

    // ---- 陰謀カード ----

    opponents(seat) {
        const n = this.players.length;
        return Array.from({ length: n - 1 }, (_, i) => (seat + 1 + i) % n);
    }

    playIntrigue(seat, id) {
        const card = INTRIGUE_BY_ID[id];
        const p = this.players[seat];
        this.log(`${p.name}は陰謀カード「${card.name}」を使った`, seat);
        switch (card.kind) {
            case 'gift':
                this.gain(seat, card.self, false);
                this.askOpponent(seat, { give: card.other });
                break;
            case 'everyone':
                this.gain(seat, card.self, false);
                this.opponents(seat).forEach(o => this.queue.push({ type: 'pick', seat: o, n: 1, types: [...CUBES] }));
                break;
            case 'favor':
                this.queue.push({ type: 'option', seat });
                break;
            case 'attack': {
                let missed = 0;
                this.opponents(seat).forEach(o => {
                    const res = this.players[o].res;
                    if (res[card.res] > 0) {
                        res[card.res]--;
                        this.log(`${this.players[o].name}は${RESOURCE_NAME[card.res]}1を返した`, o);
                    } else missed++;
                });
                for (let i = 0; i < missed; i++) this.gain(seat, card.bonus, false);
                if (missed) this.log(`${p.name}は${gainText(card.bonus)}を${missed}回得た`, seat);
                break;
            }
            case 'mandatory':
                this.askOpponent(seat, { mandatory: card.quest });
                break;
        }
    }

    // 相手を選ぶ（相手が1人ならすぐ決める）
    askOpponent(seat, what) {
        const others = this.opponents(seat);
        if (others.length === 1) this.giveTo(seat, others[0], what);
        else this.queue.push({ type: 'opponent', seat, ...what });
    }

    giveTo(seat, target, what) {
        const t = this.players[target];
        if (what.give) {
            this.gain(target, what.give, false);
            this.log(`${t.name}は${gainText(what.give)}を得た`, target);
        }
        if (what.mandatory) {
            t.quests.push(what.mandatory);
            this.log(`${t.name}に義務クエスト「${QUEST_BY_ID[what.mandatory].name}」が渡った`, target);
        }
    }

    // ---- クエスト ----

    completeQuest(seat, id) {
        const p = this.players[seat];
        const q = QUEST_BY_ID[id];
        RESOURCES.forEach(r => { p.res[r] -= q.req[r] ?? 0; });
        p.quests.splice(p.quests.indexOf(id), 1);
        p.completed.push(id);
        let bonus = 0;
        p.plots.forEach(pid => {
            const plot = QUEST_BY_ID[pid].plot;
            if (plot.kind === 'typeVp' && plot.qtype === q.type) bonus += 2;
        });
        if (this.turn?.garden === id) bonus += 4;
        p.vp += bonus;
        if (q.plot) {
            p.plots.push(id);
            if (q.plot.kind === 'lieutenant') {
                p.agents++;
                p.agentsLeft++;
            }
        }
        this.gain(seat, q.reward, false);
        const reward = gainText(q.reward);
        this.log(`${p.name}は「${q.name}」を達成した${reward ? `（${reward}${bonus ? `、ほかに${bonus}点` : ''}）` : ''}`, seat);
    }

    // ---- 進行 ----

    // 決めることがなくなったら、次の番へ進める
    advance() {
        for (let guard = 0; guard < 500; guard++) {
            this.prune();
            if (this.isOver() || this.queue.length) return;
            if (this.turn) {
                if (!this.turn.offered) {
                    this.turn.offered = true;
                    if (this.completable(this.turn.seat).length) {
                        this.queue.push({ type: 'complete', seat: this.turn.seat });
                        return;
                    }
                }
                this.turn = null;
                this.nextActor();
                continue;
            }
            if (this.legalSpaces(this.current).length) return;
            // 置ける場所がない（まれ）。そのエージェントは置かずに次へ
            const p = this.players[this.current];
            this.log(`${p.name}は置ける場所がなかった`, this.current);
            if (this.phase === 'place') p.agentsLeft--;
            if (this.phase === 'ambassador') this.ambassador = { holder: null, out: false };
            if (this.phase === 'reassign') delete this.occupied[HARBORS[this.reassignSlot]];
            this.nextActor();
        }
    }

    // 答えようのなくなった決めごと（宿のクエストや会館の建物が尽きた）を飛ばす
    prune() {
        while (this.queue.length) {
            const head = this.queue[0];
            const stale = (head.type === 'quest' && !this.inn.length)
                || (head.type === 'buy' && !this.hall.some(h => h && (head.free || BUILDING_BY_ID[h.id].cost <= this.players[head.seat].res.g)))
                || (head.type === 'target' && !this.zoarTargets(head.seat).length)
                || (head.type === 'intrigue' && !this.players[head.seat].intrigue.length);
            if (!stale) return;
            this.queue.shift();
        }
    }

    nextActor() {
        const n = this.players.length;
        if (this.phase === 'ambassador') {
            this.phase = 'place';
            this.current = (this.roundFirst + n - 1) % n;
        }
        if (this.phase === 'place') {
            for (let i = 1; i <= n; i++) {
                const seat = (this.current + i) % n;
                if (this.players[seat].agentsLeft > 0) {
                    this.current = seat;
                    return;
                }
            }
            this.phase = 'reassign';
            this.reassignSlot = -1;
        }
        if (this.phase === 'reassign') {
            for (let s = this.reassignSlot + 1; s < HARBORS.length; s++) {
                const agent = this.occupied[HARBORS[s]];
                if (agent) {
                    this.reassignSlot = s;
                    this.current = agent.seat;
                    return;
                }
            }
            this.endRound();
        }
    }

    startRound() {
        this.round++;
        this.occupied = {};
        this.reassignSlot = -1;
        if (this.round === 5) {
            this.players.forEach(p => { p.agents++; });
            this.log('5ラウンド目。エージェントが1人ずつ増えた');
        }
        this.players.forEach(p => { p.agentsLeft = p.agents; });
        this.roundFirst = this.firstPlayer;
        this.hall.forEach(h => { if (h) h.vp++; });
        this.log(`— ${this.round}ラウンド目 —`);
        const n = this.players.length;
        for (let i = 0; i < n; i++) {
            const seat = (this.firstPlayer + i) % n;
            if (this.hasPlot(seat, 'roundPick')) this.queue.push({ type: 'pick', seat, n: 1, types: [...CUBES] });
        }
        if (this.ambassador.holder !== null) {
            this.phase = 'ambassador';
            this.current = this.ambassador.holder;
        } else {
            this.phase = 'place';
            this.current = this.firstPlayer;
        }
    }

    endRound() {
        this.occupied = {};
        this.ambassador.out = false;
        if (this.round >= ROUNDS) {
            this.finish();
            return;
        }
        // nextActor の for から呼ばれるので、次のラウンドの初めの人は startRound で決まる
        this.startRound();
    }

    finish() {
        this.phase = 'over';
        this.players.forEach(p => {
            const lord = LORD_BY_ID[p.lord];
            const cubes = CUBES.reduce((s, r) => s + p.res[r], 0);
            const gold = Math.floor(p.res.g / 2);
            const lordQuests = lord.buildings ? 0 : p.completed.filter(id => lord.types.includes(QUEST_BY_ID[id].type)).length;
            const owned = this.buildings.filter(b => b.owner === p.id).length;
            const lordVp = lord.buildings ? owned * 6 : lordQuests * 4;
            p.final = { base: p.vp, cubes, gold, lord: lordVp, total: p.vp + cubes + gold + lordVp };
            p.vp = p.final.total;
        });
        const best = Math.max(...this.players.map(p => p.vp));
        const tied = this.players.filter(p => p.vp === best);
        const mostGold = Math.max(...tied.map(p => p.res.g));
        this.winners = tied.filter(p => p.res.g === mostGold).map(p => p.id);
        this.log(`ゲーム終了。${this.winners.map(s => this.players[s].name).join('と')}の勝ち`);
    }
}
