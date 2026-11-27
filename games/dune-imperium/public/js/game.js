/**
 * デューン 砂の惑星：インペリウムのルール（DOM に依存しない）
 *
 * - すべての操作は applyCommand(seat, command) を通す。受け付けた操作だけを commands に記録し、replay で同じ状態を作り直せる
 * - 断る操作は状態を変えない（判定をすべて済ませてから変える）
 * - 乱数はシード付き。状態（rngState）として持つ
 *
 * ラウンドの流れ：
 *   初め：紛争のカードを1枚めくり、全員が5枚引く
 *   番（turns）：先手番から順に、エージェントを置く番（agent）か、公開の番（reveal）をする
 *     エージェント：手札1枚を出し、その印と同じ印の空いている場所に置く。費用を払い、場所とカードの効果を受ける
 *       紛争の場所なら、この番に得た部隊と、駐屯地から2部隊までを紛争に送れる
 *     公開：残りの手札をすべて公開し、説得で山札の列（インペリウムの列）のカードを買う。剣は紛争の戦力になる
 *     全員が公開したら、戦い（combat）へ
 *   戦い：紛争に部隊がいる人が、順に戦闘の陰謀カードを使うかパスする（戦闘のカードがない人は自動でパス）。全員が続けてパスしたら決着
 *     戦力 = 部隊 × 2 + 剣（部隊が1つもなければ0）。1位・2位（4人なら3位も）が褒美を得る。同点の1位は2位の褒美、同点の2位は3位の褒美
 *   終わり：紛争の部隊は戻る。だれもいない砂漠にスパイスが1たまる。だれかが10点以上か、紛争の山がなくなればゲーム終了
 *
 * 選ぶことがあると pending（1人が答える）に置き、答え（choose）が来たら todo（効果の列）の続きを進める
 *   deploy（紛争に送る部隊の数）・faction（勢力）・pay（払うか）・choice（どれか）・trash（除外するカード）・sell（売るスパイスの量）
 */

import {
    FACTIONS, FACTION_SHORT, FACTION_BONUS, SPACES, SPACE_BY_ID, DESERTS, CONTROLLED, SELL_RATES, STARTER, IMPERIUM, RESERVE,
    CARD_BY_ID, CONFLICTS, CONFLICT_BY_ID, CONFLICT_COUNTS, INTRIGUES, INTRIGUE_BY_ID, LEADERS, LEADER_BY_ID,
    WIN_VP, HAND_SIZE, ROW_SIZE, TROOP_SUPPLY, MAX_INFLUENCE, RES_NAME, effectText, costText
} from './cards.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

// 操作の種類と、記録に残す項目
export const COMMAND_FIELDS = {
    agent: ['card', 'space'],
    reveal: [],
    buy: ['slot'],
    done: [],
    plot: ['index'],
    combat: ['index'],
    pass: [],
    choose: ['index']
};

const RESERVE_IDS = RESERVE.map(c => c.id);
const isInt = (v) => Number.isInteger(v);
const expand = (list) => list.flatMap(c => Array(c.copies).fill(c.id));

export function canPay(p, cost) {
    return Object.entries(cost ?? {}).every(([k, n]) => p[k] >= n);
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, leaders: [リーダーの id か null] }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数が合いません');
        this.setup = players.map(p => ({ name: p.name, isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        const leaders = Array.isArray(options.leaders) ? options.leaders.slice(0, players.length).map(l => (LEADER_BY_ID[l] ? l : null)) : null;
        this.options = { seed: (options.seed ?? 1) >>> 0, ...(leaders ? { leaders } : {}) };
        this.rngState = this.options.seed;
        this.commands = [];
        this.logs = [];
        this.lastError = null;

        // リーダー：指定がなければ、残りから乱数で選ぶ（同じリーダーは2人にしない）
        const chosen = (leaders ?? []).filter((l, i, a) => l && a.indexOf(l) === i);
        const rest = this.shuffle(LEADERS.map(l => l.id).filter(id => !chosen.includes(id)));
        const used = new Set();
        const leaderFor = (i) => {
            const want = leaders?.[i];
            if (want && !used.has(want)) {
                used.add(want);
                return want;
            }
            const id = rest.find(r => !used.has(r));
            used.add(id);
            return id;
        };

        this.players = players.map((p, i) => {
            const leader = leaderFor(i);
            return {
                id: i, name: p.name, isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null, leader,
                solari: leader === 'rabban' ? 1 : 0, spice: leader === 'rabban' ? 1 : 0, water: 1, vp: 0,
                garrison: 3, troopsIn: 0, recruited: 0,
                deck: this.shuffle(expand(STARTER)), hand: [], discard: [], played: [], revealed: [], trashed: [],
                agents: 2, agentsLeft: 2, mentat: false, council: false, swordmaster: false,
                influence: Object.fromEntries(FACTIONS.map(f => [f, 0])),
                bonusTaken: Object.fromEntries(FACTIONS.map(f => [f, false])),
                intrigue: [], hasRevealed: false, persuasion: 0, swords: 0
            };
        });

        this.imperiumDeck = this.shuffle(expand(IMPERIUM));
        this.row = this.imperiumDeck.splice(0, ROW_SIZE);
        this.reserve = Object.fromEntries(RESERVE.map(c => [c.id, c.copies]));
        this.foldspace = CARD_BY_ID.foldspace.copies;
        this.intrigueDeck = this.shuffle(expand(INTRIGUES));
        this.intrigueDiscard = [];
        this.conflictDeck = [1, 2, 3].flatMap(level => this.shuffle(CONFLICTS.filter(c => c.level === level).map(c => c.id)).slice(0, CONFLICT_COUNTS[level]));
        this.conflict = null;
        this.bonusSpice = Object.fromEntries(DESERTS.map(d => [d, 0]));
        this.control = Object.fromEntries(CONTROLLED.map(s => [s, null]));
        this.alliance = Object.fromEntries(FACTIONS.map(f => [f, null]));
        this.occupied = {};
        this.mentatHolder = null;
        this.firstPlayer = Math.floor(this.random() * players.length);
        this.round = 0;
        this.phase = 'turns';
        this.stage = 'act';
        this.current = this.firstPlayer;
        this.combat = null;
        this.pending = null;
        this.todo = [];
        this.winners = [];
        this.players.forEach(p => this.log(`${p.name}のリーダーは${LEADER_BY_ID[p.leader].name}`, p.id));
        this.startRound();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`記録の ${i} 番目を再現できません: ${game.lastError}`);
        });
        return game;
    }

    // isCPU・cpuLevel は今の席から取る（オンライン対戦で部屋を出た人の席は、途中から CPU になる）
    persist() {
        return {
            players: this.setup.map((p, i) => ({ ...p, isCPU: !!this.players[i]?.isCPU, cpuLevel: this.players[i]?.cpuLevel ?? p.cpuLevel })),
            options: structuredClone(this.options),
            commands: this.commands.map(c => structuredClone(c))
        };
    }

    // ---- 乱数 ----

    random() {
        this.rngState = (this.rngState + 0x6D2B79F5) >>> 0;
        let t = this.rngState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
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
        if (this.pending) return [this.pending.seat];
        if (this.phase === 'turns') return [this.current];
        if (this.phase === 'combat' && this.combat) return [this.combat.order[this.combat.idx]];
        return [];
    }

    // 戦力（部隊が紛争にいなければ0）
    strength(seat) {
        const p = this.players[seat];
        return p.troopsIn > 0 ? p.troopsIn * 2 + p.swords : 0;
    }

    spaceCost(seat, space) {
        const cost = { ...(space.cost ?? {}) };
        if (this.players[seat].leader === 'leto' && space.icon === 'landsraad' && cost.solari) cost.solari = Math.max(0, cost.solari - 1);
        return cost;
    }

    // その手札でその場所に置けるか。置けなければ理由
    placeError(seat, cardIndex, spaceId) {
        const p = this.players[seat];
        if (p.agentsLeft <= 0) return 'エージェントが残っていません';
        if (!isInt(cardIndex) || cardIndex < 0 || cardIndex >= p.hand.length) return 'そのカードは手札にありません';
        const card = CARD_BY_ID[p.hand[cardIndex]];
        const space = SPACE_BY_ID[spaceId];
        if (!space || !Object.hasOwn(SPACE_BY_ID, spaceId)) return 'その場所はありません';
        if (!card.icons.includes(space.icon)) return 'カードの印が場所と合いません';
        const occ = this.occupied[spaceId] ?? [];
        if (occ.includes(seat)) return '自分のエージェントがすでにいます';
        const helena = p.leader === 'helena' && (space.icon === 'landsraad' || space.icon === 'city') && spaceId !== 'mentat';
        if (occ.length && !card.anySpace && !helena) return 'ほかのエージェントがいます';
        if (spaceId === 'mentat' && this.mentatHolder !== null) return 'メンタートはもう雇われています';
        if (space.need && Object.entries(space.need).some(([f, n]) => p.influence[f] < n)) return `${FACTION_SHORT.fremen}の影響力が2以上いります`;
        if (spaceId === 'council' && p.council) return '評議会の席はもう持っています';
        if (spaceId === 'swordmaster' && p.swordmaster) return 'ソードマスターはもう雇っています';
        if (spaceId === 'sell' && p.spice < 2) return 'スパイスが2以上いります';
        if (!canPay(p, this.spaceCost(seat, space))) return `${costText(this.spaceCost(seat, space))}が足りません`;
        return null;
    }

    // 置ける手の一覧（同じカードは1つにまとめる）
    legalPlacements(seat) {
        const p = this.players[seat];
        const list = [];
        const seen = new Set();
        p.hand.forEach((id, i) => {
            if (seen.has(id)) return;
            seen.add(id);
            SPACES.forEach(s => {
                if (!this.placeError(seat, i, s.id)) list.push({ card: i, space: s.id });
            });
        });
        return list;
    }

    buyCost(slot) {
        if (isInt(slot)) return this.row[slot] ? CARD_BY_ID[this.row[slot]].cost : null;
        if (RESERVE_IDS.includes(slot) && this.reserve[slot] > 0) return CARD_BY_ID[slot].cost;
        return null;
    }

    hasCombatIntrigue(seat) {
        return this.players[seat].intrigue.some(id => INTRIGUE_BY_ID[id].kind === 'combat');
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
        this.process();
        return true;
    }

    // 受け付けられるかだけを調べる（状態は変えない）。断る理由を返す
    check(seat, command) {
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return 'その操作はできません';
        if (this.isOver()) return 'ゲームは終わっています';
        if (!isInt(seat) || !this.players[seat]) return 'その席はありません';
        const p = this.players[seat];
        const { type } = command;
        if (this.pending) {
            if (type !== 'choose') return '先に選んでください';
            if (seat !== this.pending.seat) return 'あなたが選ぶ番ではありません';
            if (!isInt(command.index) || command.index < 0 || command.index >= this.pending.options.length) return 'その選択肢はありません';
            return null;
        }
        if (type === 'choose') return '今は選ぶことがありません';
        if (this.phase === 'turns') {
            if (seat !== this.current) return 'あなたの番ではありません';
            switch (type) {
                case 'agent':
                    if (this.stage !== 'act') return '今は置けません';
                    return this.placeError(seat, command.card, command.space);
                case 'reveal':
                    return this.stage === 'act' ? null : 'もう公開しています';
                case 'plot': {
                    const id = isInt(command.index) ? p.intrigue[command.index] : undefined;
                    if (!id) return 'その陰謀カードはありません';
                    return INTRIGUE_BY_ID[id].kind === 'plot' ? null : 'そのカードは今は使えません';
                }
                case 'buy': {
                    if (this.stage !== 'buy') return '公開してから買えます';
                    const cost = this.buyCost(command.slot);
                    if (cost === null) return 'そのカードはありません';
                    return cost <= p.persuasion ? null : '説得が足りません';
                }
                case 'done':
                    return this.stage === 'buy' ? null : 'まだ公開していません';
                default:
                    return '今はその操作はできません';
            }
        }
        if (this.phase === 'combat') {
            if (seat !== this.actors()[0]) return 'あなたの番ではありません';
            if (type === 'pass') return null;
            if (type === 'combat') {
                const id = isInt(command.index) ? p.intrigue[command.index] : undefined;
                if (!id) return 'その陰謀カードはありません';
                return INTRIGUE_BY_ID[id].kind === 'combat' ? null : 'そのカードは戦いでは使えません';
            }
        }
        return '今はその操作はできません';
    }

    execute(seat, command) {
        const p = this.players[seat];
        switch (command.type) {
            case 'agent': return this.placeAgent(seat, command.card, command.space);
            case 'reveal': return this.reveal(seat);
            case 'plot':
            case 'combat': {
                const [id] = p.intrigue.splice(command.index, 1);
                this.intrigueDiscard.push(id);
                const c = INTRIGUE_BY_ID[id];
                this.log(`${p.name}は陰謀カード「${c.name}」を使った`, seat);
                this.todo.push(...c.effects.map(eff => ({ seat, eff, ctx: {} })));
                if (command.type === 'combat') this.todo.push({ seat, eff: { flow: 'combatNext', played: true } });
                return;
            }
            case 'pass':
                this.log(`${p.name}はパスした`, seat);
                return this.todo.push({ seat, eff: { flow: 'combatNext', played: false } });
            case 'buy': return this.buy(seat, command.slot);
            case 'done': return this.todo.push({ seat, eff: { flow: 'endTurn' } });
            case 'choose': return this.answer(seat, command.index);
        }
    }

    placeAgent(seat, cardIndex, spaceId) {
        const p = this.players[seat];
        const space = SPACE_BY_ID[spaceId];
        const cost = this.spaceCost(seat, space);
        const [id] = p.hand.splice(cardIndex, 1);
        const card = CARD_BY_ID[id];
        p.played.push(id);
        p.agentsLeft--;
        p.recruited = 0;
        (this.occupied[spaceId] ??= []).push(seat);
        Object.entries(cost).forEach(([k, n]) => { p[k] -= n; });
        this.log(`${p.name}は「${card.name}」で${space.name}へ${Object.keys(cost).length && Object.values(cost).some(Boolean) ? `（${costText(cost)}を払った）` : ''}`, seat);
        const ctx = { space: spaceId, card: id };
        const items = [];
        if (p.leader === 'ilban' && cost.solari > 0) items.push({ seat, eff: { draw: 1 }, ctx });
        if (space.icon in FACTION_BONUS) items.push({ seat, eff: { influence: space.icon }, ctx });
        space.effects.forEach(eff => items.push({ seat, eff, ctx }));
        const owner = this.control[spaceId];
        if (space.control && owner !== null && owner !== undefined) items.push({ seat: owner, eff: { ...space.control, why: 'control' }, ctx });
        card.agent.forEach(eff => items.push({ seat, eff, ctx }));
        if (space.combat) items.push({ seat, eff: { flow: 'deploy' } });
        items.push({ seat, eff: { flow: 'endTurn' } });
        this.todo.push(...items);
    }

    reveal(seat) {
        const p = this.players[seat];
        const cards = p.hand.splice(0);
        p.revealed.push(...cards);
        p.hasRevealed = true;
        this.log(`${p.name}は手札を公開した${cards.length ? `（${cards.map(id => CARD_BY_ID[id].name).join('・')}）` : ''}`, seat);
        if (p.council) p.persuasion += 2;
        cards.forEach(id => CARD_BY_ID[id].reveal.forEach(eff => this.todo.push({ seat, eff, ctx: { card: id } })));
        this.todo.push({ seat, eff: { flow: 'buyStage' } });
    }

    buy(seat, slot) {
        const p = this.players[seat];
        const cost = this.buyCost(slot);
        let id;
        if (isInt(slot)) {
            [id] = this.row.splice(slot, 1);
            if (this.imperiumDeck.length) this.row.splice(slot, 0, this.imperiumDeck.shift());
        } else {
            id = slot;
            this.reserve[slot]--;
        }
        p.persuasion -= cost;
        p.discard.push(id);
        const card = CARD_BY_ID[id];
        this.log(`${p.name}は「${card.name}」を買った`, seat);
        (card.acquire ?? []).forEach(eff => this.todo.push({ seat, eff, ctx: { card: id } }));
    }

    // 選んだ答えを当てる
    answer(seat, index) {
        const pd = this.pending;
        this.pending = null;
        const p = this.players[seat];
        const opt = pd.options[index];
        switch (pd.kind) {
            case 'deploy':
                if (opt > 0) {
                    p.garrison -= opt;
                    p.troopsIn += opt;
                    this.log(`${p.name}は部隊${opt}を紛争に送った`, seat);
                }
                return;
            case 'faction':
                return this.changeInfluence(seat, opt, 1);
            case 'pay':
                if (!opt) return;
                Object.entries(pd.cost).forEach(([k, n]) => { p[k] -= n; });
                this.log(`${p.name}は${costText(pd.cost)}を払った`, seat);
                return this.todo.unshift(...pd.then.map(eff => ({ seat, eff, ctx: pd.ctx })));
            case 'choice':
                return this.todo.unshift(...opt.map(eff => ({ seat, eff, ctx: pd.ctx })));
            case 'trash': {
                if (opt.skip) return;
                const zone = p[opt.zone];
                const i = zone.indexOf(opt.id);
                if (i >= 0) zone.splice(i, 1);
                p.trashed.push(opt.id);
                return this.log(`${p.name}は「${CARD_BY_ID[opt.id].name}」を除外した`, seat);
            }
            case 'sell': {
                const gain = SELL_RATES[opt] + (p.leader === 'memnon' ? 2 : 0);
                p.spice -= opt;
                p.solari += gain;
                return this.log(`${p.name}はスパイス${opt}をソラリ${gain}に換えた`, seat);
            }
        }
    }

    // 効果の列を、選ぶことが出るか空になるまで進める
    process() {
        while (!this.pending && this.todo.length && !this.isOver()) {
            this.resolve(this.todo.shift());
        }
    }

    ask(seat, kind, options, extra = {}) {
        this.pending = { seat, kind, options, ...extra };
    }

    gain(seat, key, n, why = '') {
        const p = this.players[seat];
        p[key] += n;
        this.log(`${p.name}は${RES_NAME[key]}${n}を得た${why}`, seat);
    }

    resolve({ seat, eff, ctx = {} }) {
        const p = this.players[seat];
        if (eff.flow) return this.flow(seat, eff);
        const why = eff.why === 'control' ? '（支配）' : '';
        if (eff.solari) return this.gain(seat, 'solari', eff.solari, why);
        if (eff.spice) return this.gain(seat, 'spice', eff.spice, why);
        if (eff.water) return this.gain(seat, 'water', eff.water, why);
        if (eff.troops) return this.recruit(seat, eff.troops);
        if (eff.draw) return this.draw(seat, eff.draw);
        if (eff.intrigue) return this.drawIntrigue(seat, eff.intrigue);
        if (eff.vp) {
            p.vp += eff.vp;
            return this.log(`${p.name}は${eff.vp}点を得た`, seat);
        }
        if (eff.persuasion) {
            p.persuasion += eff.persuasion;
            return;
        }
        if (eff.swords) {
            p.swords += eff.swords;
            return;
        }
        if (eff.influence) {
            if (eff.influence === 'any') {
                const options = FACTIONS.filter(f => p.influence[f] < MAX_INFLUENCE);
                if (options.length) this.ask(seat, 'faction', options);
                return;
            }
            const f = eff.influence === 'space' ? SPACE_BY_ID[ctx.space]?.icon : eff.influence;
            if (FACTIONS.includes(f)) this.changeInfluence(seat, f, 1);
            return;
        }
        if (eff.trash) {
            const options = [];
            const seen = new Set();
            ['hand', 'played', 'discard'].forEach(zone => p[zone].forEach(id => {
                const key = `${zone}:${id}`;
                if (seen.has(key)) return;
                seen.add(key);
                options.push({ zone, id });
            }));
            if (options.length) this.ask(seat, 'trash', [...options, { skip: true }]);
            return;
        }
        if (eff.trashSelf) {
            const i = p.played.indexOf(ctx.card);
            if (i >= 0) {
                p.played.splice(i, 1);
                p.trashed.push(ctx.card);
                this.log(`${p.name}は「${CARD_BY_ID[ctx.card].name}」を除外した`, seat);
            }
            return;
        }
        if (eff.pay) {
            if (canPay(p, eff.pay)) this.ask(seat, 'pay', [true, false], { cost: eff.pay, then: eff.then, ctx });
            return;
        }
        if (eff.choice) return this.ask(seat, 'choice', eff.choice, { ctx });
        if (eff.bond) {
            const count = [...p.played, ...p.revealed].filter(id => CARD_BY_ID[id].faction === eff.bond).length;
            if (count >= 2) this.todo.unshift(...eff.then.map(e => ({ seat, eff: e, ctx })));
            return;
        }
        if (eff.needInfluence) {
            if (Object.entries(eff.needInfluence).every(([f, n]) => p.influence[f] >= n)) this.todo.unshift(...eff.then.map(e => ({ seat, eff: e, ctx })));
            return;
        }
        if (eff.ifCouncil) {
            if (p.council) this.todo.unshift(...eff.ifCouncil.map(e => ({ seat, eff: e, ctx })));
            return;
        }
        if (eff.signet) {
            this.todo.unshift(...LEADER_BY_ID[p.leader].signet.map(e => ({ seat, eff: e, ctx })));
            return;
        }
        if (eff.council) {
            p.council = true;
            return this.log(`${p.name}は最高評議会の席を得た`, seat);
        }
        if (eff.swordmaster) {
            p.swordmaster = true;
            p.agents = 3;
            p.agentsLeft++;
            return this.log(`${p.name}はソードマスターを雇った（エージェントが3人になった）`, seat);
        }
        if (eff.mentat) {
            p.mentat = true;
            p.agentsLeft++;
            this.mentatHolder = seat;
            return this.log(`${p.name}はメンタートを雇った`, seat);
        }
        if (eff.foldspace) {
            if (this.foldspace > 0) {
                this.foldspace--;
                p.discard.push('foldspace');
                this.log(`${p.name}は「空間の折り畳み」を得た`, seat);
            }
            return;
        }
        if (eff.steal) {
            this.players.forEach(o => {
                if (o.id === seat || o.intrigue.length < 4) return;
                const [id] = o.intrigue.splice(Math.floor(this.random() * o.intrigue.length), 1);
                p.intrigue.push(id);
                this.log(`${p.name}は${o.name}から陰謀カードを1枚奪った`, seat);
            });
            return;
        }
        if (eff.harvest) {
            let n = eff.harvest + (this.bonusSpice[ctx.space] ?? 0);
            if (ctx.space in this.bonusSpice) this.bonusSpice[ctx.space] = 0;
            if (p.leader === 'ariana') {
                n = Math.max(0, n - 1);
                this.todo.unshift({ seat, eff: { draw: 1 }, ctx });
            }
            if (n > 0) this.gain(seat, 'spice', n);
            return;
        }
        if (eff.sell) {
            const options = Object.keys(SELL_RATES).map(Number).filter(n => p.spice >= n);
            if (options.length) this.ask(seat, 'sell', options);
            return;
        }
        if (eff.control) {
            this.control[eff.control] = seat;
            this.log(`${p.name}は${SPACE_BY_ID[eff.control].name}を支配した`, seat);
        }
    }

    recruit(seat, n) {
        const p = this.players[seat];
        const added = Math.max(0, Math.min(n, TROOP_SUPPLY - p.garrison - p.troopsIn));
        p.garrison += added;
        p.recruited += added;
        if (added) this.log(`${p.name}は部隊${added}を得た`, seat);
    }

    draw(seat, n) {
        const p = this.players[seat];
        let got = 0;
        for (let i = 0; i < n; i++) {
            if (!p.deck.length) {
                if (!p.discard.length) break;
                p.deck = this.shuffle(p.discard.splice(0));
            }
            p.hand.push(p.deck.shift());
            got++;
        }
        if (got && this.round > 0 && this.phase !== 'start') this.log(`${p.name}はカード${got}枚を引いた`, seat);
    }

    drawIntrigue(seat, n) {
        const p = this.players[seat];
        for (let i = 0; i < n; i++) {
            if (!this.intrigueDeck.length) {
                if (!this.intrigueDiscard.length) break;
                this.intrigueDeck = this.shuffle(this.intrigueDiscard.splice(0));
            }
            p.intrigue.push(this.intrigueDeck.shift());
        }
        this.log(`${p.name}は陰謀カード${n}枚を引いた`, seat);
    }

    changeInfluence(seat, f, delta) {
        const p = this.players[seat];
        const before = p.influence[f];
        const after = Math.max(0, Math.min(MAX_INFLUENCE, before + delta));
        if (after === before) return;
        p.influence[f] = after;
        this.log(`${p.name}は${FACTION_SHORT[f]}の影響力が${after}になった`, seat);
        if (before < 2 && after >= 2) {
            p.vp++;
            this.log(`${p.name}は${FACTION_SHORT[f]}の影響力2で1点を得た`, seat);
        }
        if (before >= 2 && after < 2) p.vp--;
        if (after >= 4 && !p.bonusTaken[f]) {
            p.bonusTaken[f] = true;
            this.todo.unshift({ seat, eff: FACTION_BONUS[f], ctx: {} });
        }
        // 同盟：影響力4以上で一番の人が持つ（追い越したら移る）
        const holder = this.alliance[f];
        if (after >= 4 && holder !== seat && (holder === null || after > this.players[holder].influence[f])) {
            if (holder !== null) {
                this.players[holder].vp--;
                this.log(`${this.players[holder].name}は${FACTION_SHORT[f]}との同盟を失った`, holder);
            }
            this.alliance[f] = seat;
            p.vp++;
            this.log(`${p.name}は${FACTION_SHORT[f]}と同盟を結んだ（1点）`, seat);
        }
    }

    // ---- 流れ ----

    flow(seat, eff) {
        const p = this.players[seat];
        switch (eff.flow) {
            case 'deploy': {
                const max = Math.min(p.garrison, p.recruited + 2);
                if (max > 0) this.ask(seat, 'deploy', Array.from({ length: max + 1 }, (_, i) => i));
                return;
            }
            case 'endTurn': return this.endTurn();
            case 'buyStage':
                this.stage = 'buy';
                return;
            case 'combatNext': return this.combatNext(eff.played);
            case 'afterCombat': return this.afterCombat();
        }
    }

    endTurn() {
        this.players[this.current].recruited = 0;
        const n = this.players.length;
        for (let k = 1; k <= n; k++) {
            const s = (this.current + k) % n;
            if (!this.players[s].hasRevealed) {
                this.current = s;
                this.stage = 'act';
                return;
            }
        }
        this.startCombat();
    }

    startRound() {
        this.round++;
        this.conflict = this.conflictDeck.shift();
        const c = CONFLICT_BY_ID[this.conflict];
        this.log(`— ${this.round}ラウンド目：紛争「${c.name}」（レベル${c.level}） —`);
        this.phase = 'start';
        this.players.forEach(p => {
            p.hasRevealed = false;
            p.persuasion = 0;
            p.swords = 0;
            p.recruited = 0;
            p.mentat = false;
            p.agentsLeft = p.agents;
            this.draw(p.id, HAND_SIZE);
        });
        this.phase = 'turns';
        this.stage = 'act';
        this.current = this.firstPlayer;
    }

    startCombat() {
        const n = this.players.length;
        const order = Array.from({ length: n }, (_, k) => (this.firstPlayer + k) % n).filter(s => this.players[s].troopsIn > 0);
        this.phase = 'combat';
        this.stage = null;
        this.log('— 戦い —');
        this.combat = { order, idx: order.length - 1, passes: 0 };
        this.seekCombat();
    }

    combatNext(played) {
        if (!this.combat) return;
        this.combat.passes = played ? 0 : this.combat.passes + 1;
        this.seekCombat();
    }

    // 次に戦闘の陰謀カードを使える人へ回す。持っていない人はパスとみなす。全員が続けてパスしたら決着
    seekCombat() {
        const c = this.combat;
        const n = c.order.length;
        while (c.passes < n) {
            c.idx = (c.idx + 1) % n;
            if (this.hasCombatIntrigue(c.order[c.idx])) return;
            c.passes++;
        }
        this.resolveCombat();
    }

    resolveCombat() {
        this.combat = null;
        this.phase = 'rewards';
        const conflict = CONFLICT_BY_ID[this.conflict];
        const n = this.players.length;
        const rewardCount = n === 4 ? 3 : 2;
        const strengths = this.players.map(p => this.strength(p.id));
        const fighters = this.players.filter(p => strengths[p.id] > 0);
        if (fighters.length) this.log(`戦力：${fighters.map(p => `${p.name} ${strengths[p.id]}`).join('・')}`);
        else this.log('紛争にはだれも戦力を出さなかった');
        const levels = [...new Set(fighters.map(p => strengths[p.id]))].sort((a, b) => b - a);
        let place = 0;
        const items = [];
        for (const level of levels) {
            if (place >= rewardCount) break;
            const group = fighters.filter(p => strengths[p.id] === level).map(p => p.id);
            const rank = group.length === 1 ? place : place + 1;
            if (rank < rewardCount) {
                group.forEach(s => {
                    this.log(`${this.players[s].name}は${rank + 1}位${group.length > 1 ? '（同点）' : ''}：${effectText(conflict.rewards[rank])}`, s);
                    conflict.rewards[rank].forEach(eff => items.push({ seat: s, eff, ctx: {} }));
                    if (rank === 0 && this.players[s].leader === 'baron') items.push({ seat: s, eff: { intrigue: 1 }, ctx: {} });
                });
            }
            place += group.length;
        }
        this.todo.push(...items, { seat: 0, eff: { flow: 'afterCombat' } });
    }

    afterCombat() {
        this.players.forEach(p => {
            p.troopsIn = 0;
            p.swords = 0;
        });
        DESERTS.forEach(d => {
            if (!(this.occupied[d] ?? []).length) this.bonusSpice[d]++;
        });
        const reached = this.players.some(p => p.vp >= WIN_VP);
        if (reached || !this.conflictDeck.length) return this.endGame();
        // 片付け：エージェントを戻し、出したカードと公開したカードを捨て札へ
        this.occupied = {};
        this.mentatHolder = null;
        this.players.forEach(p => {
            p.discard.push(...p.hand.splice(0), ...p.played.splice(0), ...p.revealed.splice(0));
        });
        this.firstPlayer = (this.firstPlayer + 1) % this.players.length;
        this.startRound();
    }

    endGame() {
        this.players.forEach(p => {
            p.intrigue.forEach(id => {
                const c = INTRIGUE_BY_ID[id];
                if (c.kind !== 'end' || !this.endCondition(p, c.cond)) return;
                p.vp++;
                this.log(`${p.name}は「${c.name}」で1点を得た`, p.id);
            });
        });
        const key = (p) => [p.vp, p.spice, p.solari, p.water, p.garrison];
        const better = (a, b) => {
            const ka = key(a), kb = key(b);
            for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
            return 0;
        };
        const best = this.players.reduce((m, p) => (better(p, m) > 0 ? p : m), this.players[0]);
        this.winners = this.players.filter(p => better(p, best) === 0).map(p => p.id);
        this.phase = 'over';
        this.stage = null;
        this.pending = null;
        this.todo = [];
        this.log(`ゲーム終了。${this.winners.map(s => this.players[s].name).join('と')}の勝ち`);
    }

    endCondition(p, cond) {
        if (cond.solari) return p.solari >= cond.solari;
        if (cond.spice) return p.spice >= cond.spice;
        if (cond.influence4) return FACTIONS.filter(f => p.influence[f] >= 4).length >= cond.influence4;
        if (cond.control) return Object.values(this.control).filter(s => s === p.id).length >= cond.control;
        return false;
    }
}
