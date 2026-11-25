/**
 * パンデミック（2013年の新版の基本ゲーム）の進行（2〜4人の協力ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びはシードから決まる）
 *
 * 手番の流れ
 * - 行動（4アクション）→ プレイヤーカードを2枚引く（伝染はその場で解決）→ 感染（感染率の枚数だけめくる）→ 次の人
 * - 手札が8枚以上になったら、すぐに7枚まで捨てる（イベントを使ってもよい）
 * - イベントカードは、誰の手番でも使える（アクションではない）。伝染の解決の途中は「強い住民」だけを、感染と強化の間に使える
 *   2枚とも伝染だったときは、1枚目を解決したあとにも使える
 * 勝ち：4色の治療薬を発見した時点。負け：アウトブレイクが8回・置く病原体が足りない・プレイヤーカードを2枚引けない
 *
 * 自分で決めた点（README の「資料で分からない点の決め方」）
 * - 「引く」「感染」は、手番の人が押して進める（イベントを使う間を作るため。画面は、使えるイベントがなければ自動で押す）
 * - 伝染で「強い住民」を持っている人がいるときだけ、感染と強化の間で止まる。2枚とも伝染なら、イベントを持っている人がいるときだけ間で止まる
 * - 感染カードの山が切れたら、捨て札を切り直して山にする（原作では起きない想定）
 */

import { createRandom, shuffle } from './random.js';
import {
    CITIES, CITY_COUNT, NEIGHBORS, COLOR_NAMES, ROLES, START_CITY, EVENTS, EPIDEMIC_BASE,
    INFECTION_RATES, MAX_OUTBREAKS, CUBES_PER_COLOR, MAX_STATIONS, HAND_LIMIT, ACTIONS_PER_TURN, HAND_SIZES, LEVELS,
    isCityCard, isEventCard, isEpidemicCard, eventOf, cardColor, cardName
} from './cities.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
// 操作の種類ごとに、記録する項目
// 移動の pawn は動かす駒（通信指令員だけが、ほかの駒を動かせる）
export const COMMAND_FIELDS = {
    drive: ['pawn', 'to'],
    direct: ['pawn', 'card'],
    charter: ['pawn', 'to'],
    shuttle: ['pawn', 'to'],
    dispatch: ['pawn', 'to'],
    opsmove: ['to', 'card'],
    build: ['remove'],
    treat: ['color'],
    give: ['to', 'card'],
    take: ['from', 'card'],
    cure: ['cards'],
    retrieve: ['card'],
    pass: [],
    draw: [],
    intensify: [],
    continue: [],
    infect: [],
    discard: ['card'],
    event: ['card', 'stored', 'pawn', 'to', 'city', 'remove'],
    forecast: ['order']
};
export const MOVE_TYPES = ['drive', 'direct', 'charter', 'shuttle', 'dispatch', 'opsmove'];
export const ACTION_TYPES = [...MOVE_TYPES, 'build', 'treat', 'give', 'take', 'cure', 'retrieve'];
export const END_REASONS = {
    won: '4色の治療薬がそろいました',
    outbreaks: 'アウトブレイクが8回に達しました',
    cubes: '病原体の駒が足りなくなりました',
    deck: 'プレイヤーカードが尽きました'
};
const MAX_LOGS = 400;
const isInt = (v) => Number.isInteger(v);
const isCity = (v) => isInt(v) && v >= 0 && v < CITY_COUNT;

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, level（intro・standard・heroic）, roles（役割の key の並び。省くとランダム）}
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const level = Object.hasOwn(LEVELS, options.level) ? options.level : 'standard';
        const roleKeys = ROLES.map(r => r.key);
        const fixedRoles = Array.isArray(options.roles) && options.roles.length === players.length
            && options.roles.every(k => roleKeys.includes(k)) && new Set(options.roles).size === players.length
            ? [...options.roles] : null;
        this.options = { seed, level, ...(fixedRoles ? { roles: fixedRoles } : {}) };
        this.random = createRandom(seed);

        this.cubes = CITIES.map(() => [0, 0, 0, 0]);
        this.supply = [0, 1, 2, 3].map(() => CUBES_PER_COLOR);
        this.stations = [START_CITY];
        this.cures = [0, 0, 0, 0];          // 0：まだ・1：治療薬・2：根絶
        this.outbreaks = 0;
        this.rateIndex = 0;
        this.quiet = false;                 // 次の感染をとばす（静かな夜）
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.result = null;                 // { won, reason }

        // 準備の感染：3都市に3個、3都市に2個、3都市に1個（役割を配る前なので、衛生兵・検疫官は効かない）
        this.infectionDeck = shuffle(CITIES.map(c => c.id), this.random);
        this.infectionDiscard = [];
        this.infectionRemoved = [];
        this.known = [];                    // 山の上にあると分かっている感染カードのまとまり（上から。中の順は分からない）
        [3, 2, 1].forEach(n => {
            for (let k = 0; k < 3; k++) {
                const city = this.infectionDeck.shift();
                const color = CITIES[city].color;
                this.cubes[city][color] += n;
                this.supply[color] -= n;
                this.infectionDiscard.push(city);
            }
        });

        // 役割と駒
        const roles = fixedRoles ?? shuffle([...roleKeys], this.random).slice(0, players.length);
        this.players = players.map((p, id) => ({
            id,
            name: String(p.name ?? `プレイヤー${id + 1}`),
            isCPU: !!p.isCPU,
            role: roles[id],
            city: START_CITY,
            hand: [],
            stored: null                    // 危機管理官が取っておいたイベント
        }));

        // プレイヤーカード：配ってから、残りを伝染の枚数の山に分け、1枚ずつ混ぜて重ねる（大きい山を上に）
        const deck = shuffle([...CITIES.map(c => c.id), ...EVENTS.map(e => e.id)], this.random);
        const handSize = HAND_SIZES[players.length];
        this.players.forEach(p => { p.hand = deck.splice(0, handSize); });
        const epidemics = LEVELS[level].epidemics;
        const base = Math.floor(deck.length / epidemics);
        const extra = deck.length % epidemics;
        this.playerDeck = [];
        this.pileSizes = [];                // 山ごとの枚数（伝染を含む。見てよい情報）
        for (let i = 0; i < epidemics; i++) {
            const pile = deck.splice(0, base + (i < extra ? 1 : 0));
            this.pileSizes.push(pile.length + 1);
            pile.push(EPIDEMIC_BASE + i);
            this.playerDeck.push(...shuffle(pile, this.random));
        }
        this.epidemicsTotal = epidemics;
        this.epidemicsDrawn = 0;
        this.playerDiscard = [];
        this.removedCards = [];

        // 最初の手番：人口がいちばん多い都市カードを持っている人
        let best = -1;
        this.current = 0;
        this.players.forEach(p => p.hand.filter(isCityCard).forEach(card => {
            if (CITIES[card].pop > best) {
                best = CITIES[card].pop;
                this.current = p.id;
            }
        }));
        this.turnNo = 1;
        this.stage = 'actions';
        this.phase = 'actions';
        this.actionsLeft = ACTIONS_PER_TURN;
        this.opsMoveUsed = false;
        this.drawLeft = 0;
        this.drawn = [];                    // この手番に引いたカード（伝染を含む）
        this.forecastBy = null;
        this.infected = [];                 // 直前の感染・伝染で病原体を置いた都市（画面で光らせる）
        this.log(`${this.players[this.current].name}（${this.roleName(this.current)}）から始めます`, { head: true });
    }

    // ---- 調べる ----

    roleOf(seat) { return this.players[seat].role; }
    roleName(seat) { return ROLES.find(r => r.key === this.players[seat].role).name; }
    hasRole(key) { return this.players.find(p => p.role === key) ?? null; }
    isOver() { return this.phase === 'end'; }
    infectionRate() { return INFECTION_RATES[this.rateIndex]; }
    needForCure(seat) { return this.roleOf(seat) === 'scientist' ? 4 : 5; }
    onBoard(color) { return CUBES_PER_COLOR - this.supply[color]; }
    pawnsAt(city) { return this.players.filter(p => p.city === city).map(p => p.id); }
    overLimit() { return this.players.filter(p => p.hand.length > HAND_LIMIT).map(p => p.id); }

    // 進めるのに操作が要る人（イベントは任意なので含めない）
    actors() {
        switch (this.phase) {
            case 'end': return [];
            case 'discard': return this.overLimit();
            case 'forecast': return [this.forecastBy];
            default: return [this.current];
        }
    }

    // その人が使えるイベント（手札と、取っておいたもの）
    eventsOf(seat) {
        const p = this.players[seat];
        const list = p.hand.filter(isEventCard).map(card => ({ card, stored: false }));
        if (p.stored !== null) list.push({ card: p.stored, stored: true });
        return list;
    }

    // 今、イベントを使える段階か（伝染の途中は「強い住民」だけ）
    eventWindow(card) {
        if (this.phase === 'end' || this.phase === 'forecast') return false;
        if (this.phase === 'epidemic') return eventOf(card).key === 'resilient';
        // 'between'（2枚目の伝染の前）は、どのイベントも使える
        return true;
    }

    // 病原体を置くのを防がれるか（検疫官・衛生兵）
    prevented(city, color) {
        return this.players.some(p => (p.role === 'quarantine' && (p.city === city || NEIGHBORS[p.city].includes(city)))
            || (p.role === 'medic' && p.city === city && this.cures[color] > 0));
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!isInt(playerId) || !this.players[playerId]) return this.fail('プレイヤーが正しくありません');
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => {
            if (command[k] !== undefined && command[k] !== null) recorded[k] = command[k];
        });
        const error = this.commandError(playerId, recorded);
        if (error) return this.fail(error);
        this.commands.push({ playerId, command: structuredClone(recorded) });
        this.execute(playerId, recorded);
        return true;
    }

    // 判定（状態を変えない）。通らなければ理由を返す
    commandError(seat, command) {
        const type = command.type;
        if (type === 'event') return this.eventError(seat, command);
        if (type === 'discard') {
            if (this.phase !== 'discard') return '今は捨てる段階ではありません';
            if (!this.overLimit().includes(seat)) return '手札は7枚以内です';
            return this.players[seat].hand.includes(command.card) ? null : 'そのカードは持っていません';
        }
        if (type === 'forecast') {
            if (this.phase !== 'forecast' || seat !== this.forecastBy) return '今は並べ替えられません';
            const k = Math.min(6, this.infectionDeck.length);
            const order = command.order;
            if (!Array.isArray(order) || order.length !== k || !order.every(i => isInt(i) && i >= 0 && i < k) || new Set(order).size !== k) return '並べ方が正しくありません';
            return null;
        }
        if (seat !== this.current) return 'あなたの手番ではありません';
        if (type === 'draw') return this.phase === 'draw' ? null : '今はカードを引けません';
        if (type === 'intensify') return this.phase === 'epidemic' ? null : '今は強化に進めません';
        if (type === 'continue') return this.phase === 'between' ? null : '今は先へ進めません';
        if (type === 'infect') return this.phase === 'infect' ? null : '今は感染に進めません';
        if (this.phase !== 'actions') return '今はアクションを行えません';
        if (type === 'pass') return null;
        return this.actionError(seat, command);
    }

    actionError(seat, command) {
        const me = this.players[seat];
        const role = me.role;
        if (MOVE_TYPES.includes(command.type)) {
            const pawn = command.type === 'opsmove' ? seat : (command.pawn ?? seat);
            if (!isInt(pawn) || !this.players[pawn]) return '駒が正しくありません';
            if (pawn !== seat && role !== 'dispatcher') return 'ほかの駒は動かせません';
            const from = this.players[pawn].city;
            switch (command.type) {
                case 'drive':
                    return isCity(command.to) && NEIGHBORS[from].includes(command.to) ? null : 'つながった都市にしか行けません';
                case 'direct':
                    if (!isCityCard(command.card) || !me.hand.includes(command.card)) return 'その都市のカードがありません';
                    return command.card === from ? 'もうその都市にいます' : null;
                case 'charter':
                    if (!me.hand.includes(from)) return '今いる都市のカードがありません';
                    return isCity(command.to) && command.to !== from ? null : '行き先が正しくありません';
                case 'shuttle':
                    if (!this.stations.includes(from)) return '研究所にいません';
                    return isCity(command.to) && command.to !== from && this.stations.includes(command.to) ? null : '研究所のある都市にしか行けません';
                case 'dispatch':
                    if (role !== 'dispatcher') return '通信指令員だけの移動です';
                    if (!isCity(command.to) || command.to === from) return '行き先が正しくありません';
                    return this.players.some(p => p.id !== pawn && p.city === command.to) ? null : 'ほかの駒のいる都市にしか行けません';
                case 'opsmove':
                    if (role !== 'ops') return '作戦エキスパートだけの移動です';
                    if (this.opsMoveUsed) return 'この移動は手番に1回です';
                    if (!this.stations.includes(from)) return '研究所にいません';
                    if (!isCityCard(command.card) || !me.hand.includes(command.card)) return '捨てる都市カードがありません';
                    return isCity(command.to) && command.to !== from ? null : '行き先が正しくありません';
            }
        }
        const city = me.city;
        switch (command.type) {
            case 'build': {
                if (this.stations.includes(city)) return 'もう研究所があります';
                if (role !== 'ops' && !me.hand.includes(city)) return 'この都市のカードがありません';
                return this.removeError(command.remove, city);
            }
            case 'treat': {
                const c = command.color;
                if (!isInt(c) || c < 0 || c > 3) return '色が正しくありません';
                return this.cubes[city][c] > 0 ? null : 'その色の病原体はありません';
            }
            case 'give':
            case 'take': {
                const other = command.type === 'give' ? command.to : command.from;
                if (!isInt(other) || !this.players[other] || other === seat) return '相手が正しくありません';
                if (this.players[other].city !== city) return '同じ都市にいる人とだけ共有できます';
                const giver = command.type === 'give' ? me : this.players[other];
                if (!isCityCard(command.card) || !giver.hand.includes(command.card)) return 'そのカードは持っていません';
                if (command.card !== city && giver.role !== 'researcher') return '今いる都市のカードだけを共有できます';
                return null;
            }
            case 'cure': {
                if (!this.stations.includes(city)) return '研究所で発見します';
                const cards = command.cards;
                if (!Array.isArray(cards) || new Set(cards).size !== cards.length || !cards.every(c => isCityCard(c) && me.hand.includes(c))) return 'カードが正しくありません';
                if (cards.length !== this.needForCure(seat)) return `同じ色のカードが${this.needForCure(seat)}枚要ります`;
                const color = cardColor(cards[0]);
                if (!cards.every(c => cardColor(c) === color)) return '同じ色のカードをそろえます';
                return this.cures[color] ? 'その色の治療薬はもうあります' : null;
            }
            case 'retrieve':
                if (role !== 'planner') return '危機管理官だけのアクションです';
                if (me.stored !== null) return 'もう1枚取ってあります';
                return isEventCard(command.card) && this.playerDiscard.includes(command.card) ? null : '捨て札にそのイベントはありません';
        }
        return '操作が正しくありません';
    }

    // 研究所が6つあるときは、どれかを移す
    removeError(remove, city) {
        if (this.stations.length < MAX_STATIONS) return remove === undefined ? null : '研究所はまだ置けます';
        if (!isCity(remove) || !this.stations.includes(remove) || remove === city) return '移す研究所を選びます';
        return null;
    }

    eventError(seat, command) {
        const p = this.players[seat];
        const card = command.card;
        if (!isEventCard(card)) return 'イベントカードではありません';
        if (command.stored !== undefined && typeof command.stored !== 'boolean') return '操作が正しくありません';
        if (command.stored ? p.stored !== card : !p.hand.includes(card)) return 'そのイベントは持っていません';
        if (!this.eventWindow(card)) return '今はイベントを使えません';
        switch (eventOf(card).key) {
            case 'airlift':
                if (!isInt(command.pawn) || !this.players[command.pawn]) return '駒が正しくありません';
                return isCity(command.to) && command.to !== this.players[command.pawn].city ? null : '行き先が正しくありません';
            case 'forecast':
                return this.infectionDeck.length ? null : '感染カードの山がありません';
            case 'grant':
                if (!isCity(command.city) || this.stations.includes(command.city)) return '研究所のない都市を選びます';
                return this.removeError(command.remove, command.city);
            case 'quiet':
                return this.quiet ? '次の感染は、もうとばします' : null;
            case 'resilient':
                return isCity(command.city) && this.infectionDiscard.includes(command.city) ? null : '感染カードの捨て札から選びます';
        }
        return '操作が正しくありません';
    }

    // ---- 実行 ----

    execute(seat, command) {
        switch (command.type) {
            case 'event': this.playEvent(seat, command); break;
            case 'discard': {
                const p = this.players[seat];
                p.hand.splice(p.hand.indexOf(command.card), 1);
                this.playerDiscard.push(command.card);
                this.log(`${p.name}が${cardName(command.card)}を捨てました`);
                this.emit({ type: 'discard', seat, card: command.card });
                break;
            }
            case 'forecast': {
                const k = Math.min(6, this.infectionDeck.length);
                const top = this.infectionDeck.slice(0, k);
                const ordered = command.order.map(i => top[i]);
                this.infectionDeck.splice(0, k, ...ordered);
                // 並べた6枚は順まで分かる。残りのまとまりからは除く
                const rest = this.known.map(seg => seg.filter(c => !ordered.includes(c))).filter(seg => seg.length);
                this.known = [...ordered.map(c => [c]), ...rest];
                this.forecastBy = null;
                this.log('感染カードの山の上を並べ替えました');
                this.phase = this.stage;
                break;
            }
            case 'pass':
                this.log(`${this.players[seat].name}がアクションを終えました`);
                this.actionsLeft = 0;
                break;
            case 'draw': this.startDraw(); break;
            case 'intensify':
                this.intensify();
                this.continueDraw();
                break;
            case 'continue':
                this.continueDraw({ resume: true });
                break;
            case 'infect': this.infectStep(); break;
            default:
                this.doAction(seat, command);
                this.actionsLeft--;
        }
        this.settle();
    }

    // 段階を決め直す（手札の上限・アクションの残り）
    settle() {
        if (['end', 'forecast', 'epidemic', 'between'].includes(this.phase)) return;
        if (this.overLimit().length) {
            this.phase = 'discard';
            return;
        }
        if (this.stage === 'actions' && this.actionsLeft <= 0) this.stage = 'draw';
        this.phase = this.stage;
    }

    doAction(seat, command) {
        const me = this.players[seat];
        const spend = (card) => {
            me.hand.splice(me.hand.indexOf(card), 1);
            this.playerDiscard.push(card);
        };
        const pawn = command.type === 'opsmove' ? seat : (command.pawn ?? seat);
        const who = pawn === seat ? me.name : `${me.name}が${this.players[pawn].name}の駒を`;
        switch (command.type) {
            case 'drive':
                this.log(`${who}${CITIES[command.to].name}へ移動`);
                this.movePawn(pawn, command.to, 'drive');
                return;
            case 'direct':
                spend(command.card);
                this.log(`${who}${CITIES[command.card].name}へ直行便（${cardName(command.card)}を使用）`);
                this.movePawn(pawn, command.card, 'fly');
                return;
            case 'charter': {
                const from = this.players[pawn].city;
                spend(from);
                this.log(`${who}${CITIES[command.to].name}へチャーター便（${cardName(from)}を使用）`);
                this.movePawn(pawn, command.to, 'fly');
                return;
            }
            case 'shuttle':
                this.log(`${who}${CITIES[command.to].name}へシャトル便`);
                this.movePawn(pawn, command.to, 'fly');
                return;
            case 'dispatch':
                this.log(`${who}${CITIES[command.to].name}へ呼び寄せ`);
                this.movePawn(pawn, command.to, 'fly');
                return;
            case 'opsmove':
                spend(command.card);
                this.opsMoveUsed = true;
                this.log(`${me.name}が研究所から${CITIES[command.to].name}へ移動（${cardName(command.card)}を使用）`);
                this.movePawn(seat, command.to, 'fly');
                return;
            case 'build': {
                if (me.role !== 'ops') spend(me.city);
                this.buildStation(me.city, command.remove);
                this.log(`${me.name}が${CITIES[me.city].name}に研究所を建てました`);
                return;
            }
            case 'treat': {
                const c = command.color;
                const all = me.role === 'medic' || this.cures[c] > 0;
                const n = all ? this.cubes[me.city][c] : 1;
                this.removeCubes(me.city, c, n);
                this.log(`${me.name}が${CITIES[me.city].name}の${COLOR_NAMES[c]}を${n}個治療`);
                this.emit({ type: 'treat', city: me.city, color: c, n });
                this.checkEradicated(c);
                return;
            }
            case 'give':
            case 'take': {
                const giver = command.type === 'give' ? me : this.players[command.from];
                const taker = command.type === 'give' ? this.players[command.to] : me;
                giver.hand.splice(giver.hand.indexOf(command.card), 1);
                taker.hand.push(command.card);
                this.log(`${giver.name}が${taker.name}に${cardName(command.card)}を渡しました`);
                this.emit({ type: 'share', from: giver.id, to: taker.id, card: command.card });
                return;
            }
            case 'cure': {
                const color = cardColor(command.cards[0]);
                command.cards.forEach(spend);
                this.cures[color] = 1;
                this.log(`${me.name}が${COLOR_NAMES[color]}の治療薬を発見しました`, { head: true });
                this.emit({ type: 'cure', color, seat });
                // 衛生兵のいる都市からは、すぐに取り除く
                const medic = this.hasRole('medic');
                if (medic) this.medicSweep(medic);
                this.checkEradicated(color);
                if (this.cures.every(c => c > 0)) this.finish(true, 'won');
                return;
            }
            case 'retrieve': {
                this.playerDiscard.splice(this.playerDiscard.indexOf(command.card), 1);
                me.stored = command.card;
                this.log(`${me.name}が${cardName(command.card)}を取っておきました`);
            }
        }
    }

    movePawn(pawn, to, how) {
        const p = this.players[pawn];
        const from = p.city;
        p.city = to;
        this.emit({ type: 'move', seat: pawn, from, to, how });
        if (p.role === 'medic') this.medicSweep(p);
    }

    // 衛生兵：治療薬のある色を、いる都市から取り除く
    medicSweep(medic) {
        [0, 1, 2, 3].forEach(c => {
            const n = this.cubes[medic.city][c];
            if (this.cures[c] > 0 && n > 0) {
                this.removeCubes(medic.city, c, n);
                this.log(`${medic.name}が${CITIES[medic.city].name}の${COLOR_NAMES[c]}を${n}個取り除きました`);
                this.emit({ type: 'treat', city: medic.city, color: c, n });
                this.checkEradicated(c);
            }
        });
    }

    removeCubes(city, color, n) {
        this.cubes[city][color] -= n;
        this.supply[color] += n;
    }

    checkEradicated(color) {
        if (this.cures[color] === 1 && this.onBoard(color) === 0) {
            this.cures[color] = 2;
            this.log(`${COLOR_NAMES[color]}の病原体を根絶しました`, { head: true });
            this.emit({ type: 'eradicate', color });
        }
    }

    buildStation(city, remove) {
        if (remove !== undefined) this.stations.splice(this.stations.indexOf(remove), 1);
        this.stations.push(city);
        this.emit({ type: 'build', city, remove: remove ?? null });
    }

    playEvent(seat, command) {
        const p = this.players[seat];
        const card = command.card;
        if (command.stored) {
            p.stored = null;
            this.removedCards.push(card);
        } else {
            p.hand.splice(p.hand.indexOf(card), 1);
            this.playerDiscard.push(card);
        }
        const ev = eventOf(card);
        this.emit({ type: 'event', seat, key: ev.key });
        switch (ev.key) {
            case 'airlift':
                this.log(`${p.name}が空輸：${this.players[command.pawn].name}の駒を${CITIES[command.to].name}へ`);
                this.movePawn(command.pawn, command.to, 'fly');
                break;
            case 'forecast':
                this.log(`${p.name}が予測を使いました`);
                this.forecastBy = seat;
                this.phase = 'forecast';
                break;
            case 'grant':
                this.buildStation(command.city, command.remove);
                this.log(`${p.name}が政府の助成金：${CITIES[command.city].name}に研究所`);
                break;
            case 'quiet':
                this.quiet = true;
                this.log(`${p.name}が静かな夜：次の感染をとばします`);
                break;
            case 'resilient':
                this.infectionDiscard.splice(this.infectionDiscard.indexOf(command.city), 1);
                this.infectionRemoved.push(command.city);
                this.log(`${p.name}が強い住民：${CITIES[command.city].name}の感染カードを取り除きました`);
                break;
        }
    }

    // ---- カードを引く・伝染 ----

    startDraw() {
        this.infected = [];
        if (this.playerDeck.length < 2) {
            this.log('プレイヤーカードが2枚ありません', { head: true });
            this.finish(false, 'deck');
            return;
        }
        this.drawLeft = 2;
        this.drawn = [];
        this.continueDraw();
    }

    continueDraw({ resume = false } = {}) {
        const p = this.players[this.current];
        while (this.drawLeft > 0 && this.phase !== 'end') {
            // 2枚とも伝染なら、1枚目を解決したあと、イベントを使う間を作る（持っている人がいるときだけ）
            if (!resume && this.drawLeft === 1 && isEpidemicCard(this.drawn[0]) && isEpidemicCard(this.playerDeck[0])
                && this.players.some(q => this.eventsOf(q.id).length)) {
                this.phase = 'between';
                return;
            }
            resume = false;
            const card = this.playerDeck.shift();
            this.drawLeft--;
            this.drawn.push(card);
            if (isEpidemicCard(card)) {
                this.epidemicsDrawn++;
                this.removedCards.push(card);
                this.epidemicInfect();
                if (this.phase === 'end') return;
                // 「強い住民」を持っている人がいれば、強化の前に止まる
                if (this.players.some(q => this.eventsOf(q.id).some(e => eventOf(e.card).key === 'resilient'))) {
                    this.phase = 'epidemic';
                    return;
                }
                this.intensify();
            } else {
                p.hand.push(card);
                this.log(`${p.name}が${cardName(card)}を引きました`);
                this.emit({ type: 'draw', seat: p.id, card });
            }
        }
        if (this.phase === 'end') return;
        this.stage = 'infect';
        this.phase = 'infect';
    }

    // 伝染の「感染率の上昇」と「感染」
    epidemicInfect() {
        this.rateIndex = Math.min(this.rateIndex + 1, 6);
        const city = this.infectionDeck.pop();
        this.forgetKnown(city);
        const color = CITIES[city].color;
        this.log(`伝染！ ${CITIES[city].name}（感染率 ${this.infectionRate()}）`, { head: true });
        this.emit({ type: 'epidemic', city });
        this.infectionDiscard.push(city);
        this.infect(city, color, 3);
    }

    // 伝染の「強化」：捨て札を切って山の上に置く
    intensify() {
        const pile = shuffle([...this.infectionDiscard], this.random);
        this.infectionDiscard = [];
        this.infectionDeck.unshift(...pile);
        if (pile.length) this.known.unshift([...pile].sort((a, b) => a - b));
        this.phase = 'draw';
        this.emit({ type: 'intensify', n: pile.length });
    }

    infectStep() {
        this.infected = [];
        if (this.quiet) {
            this.quiet = false;
            this.log('静かな夜：感染をとばしました');
        } else {
            const n = this.infectionRate();
            for (let i = 0; i < n && this.phase !== 'end'; i++) {
                if (!this.infectionDeck.length) {
                    // 原作では起きない想定。捨て札を切り直して続ける
                    this.infectionDeck = shuffle(this.infectionDiscard, this.random);
                    this.infectionDiscard = [];
                    this.known = [];
                }
                const city = this.infectionDeck.shift();
                this.forgetKnown(city);
                this.infectionDiscard.push(city);
                this.infect(city, CITIES[city].color, 1);
            }
        }
        if (this.phase !== 'end') this.nextTurn();
    }

    forgetKnown(city) {
        this.known = this.known.map(seg => seg.filter(c => c !== city)).filter(seg => seg.length);
    }

    // 病原体を n 個置く。3個を超えるときはアウトブレイク（連鎖では、同じ都市は1回だけ）
    infect(city, color, n, chain = new Set()) {
        if (this.phase === 'end') return;
        if (this.cures[color] === 2) {
            if (!chain.size) this.log(`${CITIES[city].name}：${COLOR_NAMES[color]}は根絶済み`);
            return;
        }
        if (this.prevented(city, color)) {
            this.log(`${CITIES[city].name}：防がれました`);
            return;
        }
        for (let i = 0; i < n; i++) {
            if (this.cubes[city][color] >= 3) {
                this.outbreak(city, color, chain);
                return;
            }
            if (this.supply[color] === 0) {
                this.log(`${COLOR_NAMES[color]}の病原体が足りません`, { head: true });
                this.finish(false, 'cubes');
                return;
            }
            this.cubes[city][color]++;
            this.supply[color]--;
        }
        if (!this.infected.includes(city)) this.infected.push(city);
        this.log(`${CITIES[city].name}に${COLOR_NAMES[color]}を${n}個`);
        this.emit({ type: 'infect', city, color, n });
    }

    outbreak(city, color, chain) {
        if (chain.has(city)) return;
        chain.add(city);
        this.outbreaks++;
        this.log(`アウトブレイク！ ${CITIES[city].name}（${this.outbreaks}回目）`, { head: true });
        this.emit({ type: 'outbreak', city, color, count: this.outbreaks });
        if (!this.infected.includes(city)) this.infected.push(city);
        if (this.outbreaks >= MAX_OUTBREAKS) {
            this.finish(false, 'outbreaks');
            return;
        }
        for (const n of NEIGHBORS[city]) {
            if (this.phase === 'end') return;
            if (!chain.has(n)) this.infect(n, color, 1, chain);
        }
    }

    nextTurn() {
        this.current = (this.current + 1) % this.players.length;
        this.turnNo++;
        this.stage = 'actions';
        this.phase = 'actions';
        this.actionsLeft = ACTIONS_PER_TURN;
        this.opsMoveUsed = false;
        this.drawn = [];
        const p = this.players[this.current];
        this.log(`${p.name}（${this.roleName(p.id)}）の手番`, { head: true });
        this.emit({ type: 'turn', seat: p.id });
    }

    finish(won, reason) {
        this.phase = 'end';
        this.stage = 'end';
        this.result = { won, reason };
        this.log(won ? `勝利！ ${END_REASONS[reason]}` : `敗北…… ${END_REASONS[reason]}`, { head: true });
        this.emit({ type: 'end', won, reason });
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
    }

    log(text, { head = false } = {}) {
        this.logs.push({ n: ++this.logTotal, text, head });
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: structuredClone(this.options),
            commands: structuredClone(this.commands)
        };
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${i} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }

    // CPU が手を試すための写し（記録・ログ・乱数の状態は持たない。行動の判定と実行だけに使う）
    simClone() {
        const g = Object.create(Game.prototype);
        g.options = this.options;
        g.cubes = this.cubes.map(row => [...row]);
        g.supply = [...this.supply];
        g.stations = [...this.stations];
        g.cures = [...this.cures];
        g.outbreaks = this.outbreaks;
        g.rateIndex = this.rateIndex;
        g.quiet = this.quiet;
        g.players = this.players.map(p => ({ ...p, hand: [...p.hand] }));
        g.playerDiscard = [...this.playerDiscard];
        g.removedCards = [...this.removedCards];
        g.infectionDeck = this.infectionDeck;
        g.infectionDiscard = this.infectionDiscard;
        g.known = this.known;
        g.playerDeck = this.playerDeck;
        g.current = this.current;
        g.stage = this.stage;
        g.phase = this.phase;
        g.actionsLeft = this.actionsLeft;
        g.opsMoveUsed = this.opsMoveUsed;
        g.result = null;
        g.infected = [];
        g.sim = true;
        g.commands = { push() {} };
        g.logs = null;
        g.events = null;
        g.log = () => {};
        g.emit = () => {};
        return g;
    }
}
