/**
 * ヴィティカルチャー（Essential Edition の基本ルール、2〜6人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びはシードから決まる）
 *
 * 1年は4つの季節
 * - 春：最初の番の人から順に、起床時間の表の段を選ぶ（早い段ほど先に動け、段ごとにおまけがある）
 * - 夏：起床の早い順に、1人ずつ夏の行動の場所に人を置くか、パスする。全員がパスしたら秋
 * - 秋：起床の早い順に、夏か冬の訪問者カードを1枚引く（離れがあればもう1枚）
 * - 冬：夏と同じように冬の行動の場所に人を置く。夏に置いた人は、年の終わりまで戻らない
 * 年の終わり：ブドウとワインの価値が1上がり、手札は7枚まで、残りの収入を受け取る。だれかが20点以上なら終わり
 *
 * 状態はすべて JSON にできる形で持つ（乱数の状態も数で持つ）。CPU は写しを作って選択肢を試す
 * 効果は「手順」（{ seat, op, ... }）の列 queue で進める。選択が要る手順は pending に選択肢を出して止まり、
 * choose の答えを受けて answer_<handler> が続きを行う
 *
 * ルールブックで分からない点・割り切った点（README にも書く）
 * - 行動の場所の枠は、2人なら1つ、3〜4人なら2つ、5〜6人なら3つ。最初の枠に置くとおまけが付く。人は空いている最初の枠に入る
 * - 大きいワーカーは、枠が埋まっていても置ける（そのときおまけはない）。同じ季節に同じ場所へ自分の人を2人は置けない
 * - できない行動には置けない（植えるブドウがないのに「植える」など）
 * - ワインの価値が地下室に入らないときや、同じ価値のところが埋まっているときは、空いている一番近い下の価値に置く
 * - 注文に使うワインは、条件を満たすうちで価値の低いものを自動で選ぶ
 * - 最初の番は、年ごとに右隣（反時計回り）へ移る
 */

import {
    CARDS, DECKS, DECK_NAME, STRUCTURE, STRUCTURES, ACTION, ACTIONS, actionTasks, WAKE_ROWS, MAMAS, PAPAS,
    FIELD_MAX, START_WORKERS, MAX_WORKERS, HAND_LIMIT, MAX_RESIDUAL, WIN_VP, WINE_MIN, WINE_NAME,
    grapePrice, vineValue, cardTitle
} from './cards.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const MAX_LOGS = 600;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    wake: ['row'],
    place: ['action', 'grande'],
    pass: [],
    choose: ['index']
};

export const SEASON_NAME = { setup: '準備', spring: '春', summer: '夏', fall: '秋', winter: '冬', yearEnd: '年の終わり', end: '終わり' };
const COLOR_NAME = { red: '赤', white: '白' };

// 人数ごとの行動の場所の枠の数
export const slotCount = (n) => (n <= 2 ? 1 : n <= 4 ? 2 : 3);

// mulberry32 の1歩（状態を数で持つので、写しても同じ続きになる）
function nextRandom(state) {
    const s = (state + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

export const cellarCap = (p) => (p.structures.includes('large') ? 9 : p.structures.includes('medium') ? 6 : 3);

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜6人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.rng = seed;
        this.options = { seed };
        const n = players.length;
        this.players = players.map((pl, id) => ({
            id, name: String(pl.name ?? `プレイヤー${id + 1}`), isCPU: !!pl.isCPU, cpuLevel: pl.cpuLevel ?? null,
            lira: 0, vp: 0, residual: 0,
            workers: START_WORKERS, temp: 0, fresh: 0, used: 0, grandeFree: true,
            hand: [],
            fields: FIELD_MAX.map(max => ({ max, vines: [], sold: false, harvested: false })),
            crush: { red: [], white: [] },
            cellar: { red: [], white: [], blush: [], sparkling: [] },
            structures: [],
            wake: null, passed: false, yokeUsed: null,
            windmillUsed: false, tastingUsed: false,
            mama: null, papa: null,
            ctx: { planted: [], plantedField: null, harvested: 0, made: [] }
        }));
        this.decks = Object.fromEntries(DECKS.map(deck => [deck, this.shuffle(CARDS.filter(c => c.deck === deck).map(c => c.id))]));
        this.discards = Object.fromEntries(DECKS.map(deck => [deck, []]));
        this.first = Math.floor(this.random() * n);
        this.year = 0;
        this.season = 'setup';
        this.wakeTaken = Array(WAKE_ROWS.length).fill(null);
        this.pickers = [];
        this.order = [];
        this.turnPtr = -1;
        this.current = null;
        this.turnOpen = false;
        this.spaces = {};
        this.queue = [];
        this.pending = null;
        this.promptSeq = 0;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.lastError = null;

        // ママとパパを1枚ずつ配る。ママの持ち物はすぐ受け取り、パパは2つから選ぶ
        const mamas = this.shuffle(MAMAS.map((_, i) => i));
        const papas = this.shuffle(PAPAS.map((_, i) => i));
        this.players.forEach((p, seat) => {
            p.mama = mamas[seat % mamas.length];
            p.papa = papas[seat % papas.length];
            const mama = MAMAS[p.mama];
            const papa = PAPAS[p.papa];
            Object.entries(mama.cards).forEach(([deck, k]) => this.drawCards(seat, deck, k, false));
            p.lira += mama.lira + papa.lira;
            this.log(`${p.name}：ママ${mama.name}とパパ${papa.name}`);
        });
        this.players.forEach((_, seat) => this.queue.push({ seat, op: 'papa' }));
        this.advance();
    }

    // ---- 乱数 ----

    random() {
        const [state, value] = nextRandom(this.rng);
        this.rng = state;
        return value;
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    isOver() {
        return this.season === 'end';
    }

    // 操作を待っている人（いつも0人か1人）
    actors() {
        if (this.season === 'end') return [];
        if (this.pending) return [this.pending.seat];
        if (this.turnOpen) return [this.current];
        return [];
    }

    // ---- 進行 ----

    // 手順の列を進め、選択か手番の操作を待つところで止まる
    advance() {
        for (let guard = 0; guard < 100000; guard++) {
            if (this.pending || this.season === 'end') return;
            if (this.queue.length) {
                this.exec(this.queue.shift());
                continue;
            }
            if (this.turnOpen) return;
            this.nextTurn();
        }
        throw new Error('進行が止まりません');
    }

    nextTurn() {
        const n = this.players.length;
        switch (this.season) {
            case 'setup':
                this.startYear();
                return;
            case 'spring': {
                const seat = this.pickers.find(s => this.players[s].wake === null);
                if (seat !== undefined) {
                    this.current = seat;
                    this.turnOpen = true;
                    return;
                }
                this.order = this.players.map(p => p.id).sort((a, b) => this.players[a].wake - this.players[b].wake);
                this.startSeason('summer');
                return;
            }
            case 'summer':
            case 'winter': {
                for (let k = 1; k <= n; k++) {
                    const idx = (this.turnPtr + k + n) % n;
                    const seat = this.order[idx];
                    const p = this.players[seat];
                    if (p.passed) continue;
                    if (!this.canPlaceAny(seat)) {
                        p.passed = true;
                        this.log(`${p.name}：置ける場所がないのでパス`);
                        continue;
                    }
                    this.turnPtr = idx;
                    this.current = seat;
                    this.turnOpen = true;
                    return;
                }
                if (this.season === 'summer') this.startFall();
                else this.endYear();
                return;
            }
            case 'fall':
                this.startSeason('winter');
                return;
            case 'yearEnd':
                this.finishYear();
                return;
            default:
                throw new Error(`知らない季節: ${this.season}`);
        }
    }

    startYear() {
        const n = this.players.length;
        this.year += 1;
        this.season = 'spring';
        this.wakeTaken = Array(WAKE_ROWS.length).fill(null);
        this.pickers = Array.from({ length: n }, (_, i) => (this.first + i) % n);
        this.order = [];
        this.spaces = {};
        ACTIONS.forEach(a => {
            this.spaces[a.id] = { slots: a.open ? [] : Array(slotCount(n)).fill(null), extra: [] };
        });
        this.players.forEach(p => { p.wake = null; });
        this.log(`── ${this.year}年目の春（最初に選ぶ人：${this.players[this.first].name}）`);
    }

    startSeason(season) {
        this.season = season;
        this.turnPtr = -1;
        this.current = null;
        this.players.forEach(p => {
            p.passed = false;
            p.fresh = 0;            // 前の季節に雇った人も、この季節から使える
        });
        this.log(`── ${this.year}年目の${SEASON_NAME[season]}`);
    }

    startFall() {
        this.season = 'fall';
        this.current = null;
        this.log(`── ${this.year}年目の秋`);
        this.order.forEach(seat => {
            const k = this.players[seat].structures.includes('cottage') ? 2 : 1;
            this.queue.push({ seat, op: 'drawVisitor', n: k });
        });
    }

    endYear() {
        this.season = 'yearEnd';
        this.current = null;
        this.log(`── ${this.year}年目の終わり`);
        // ブドウとワインの熟成（価値の高いものから1つずつ上げる）
        this.players.forEach(p => {
            ['red', 'white'].forEach(color => { p.crush[color] = this.ageList(p.crush[color], 1, 9); });
            this.ageCellar(p);
        });
        this.order.forEach(seat => {
            if (this.players[seat].hand.length > HAND_LIMIT) this.queue.push({ seat, op: 'handLimit' });
        });
    }

    finishYear() {
        this.players.forEach(p => {
            if (p.residual > 0) {
                p.lira += p.residual;
                this.log(`${p.name}：残りの収入${p.residual}リラ`);
            }
        });
        if (this.players.some(p => p.vp >= WIN_VP)) {
            this.endGame();
            return;
        }
        const n = this.players.length;
        this.players.forEach(p => {
            p.used = 0;
            p.temp = 0;
            p.fresh = 0;
            p.grandeFree = true;
            p.yokeUsed = null;
            p.windmillUsed = false;
            p.tastingUsed = false;
            p.fields.forEach(f => { f.harvested = false; });
        });
        this.first = (this.first - 1 + n) % n;
        this.startYear();
    }

    endGame() {
        this.season = 'end';
        this.current = null;
        this.turnOpen = false;
        this.pending = null;
        this.queue = [];
        const key = (p) => [p.vp, p.lira, wineTotal(p), grapeTotal(p)];
        const ranked = [...this.players].sort((a, b) => {
            const ka = key(a);
            const kb = key(b);
            for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
            return 0;
        });
        const best = key(ranked[0]).join(',');
        this.winners = ranked.filter(p => key(p).join(',') === best).map(p => p.id);
        this.log(`得点：${this.players.map(p => `${p.name} ${p.vp}`).join('・')}`);
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ち`);
    }

    // ---- 操作 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.season === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        const check = this[`check_${command.type}`](playerId, command);
        if (typeof check === 'string') return this.fail(check);
        this.commands.push({ playerId, command: check.recorded });
        check.run();
        this.advance();
        return true;
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    check_wake(seat, { row }) {
        if (this.season !== 'spring' || this.pending) return '今は起床時間を選べません';
        if (!Number.isInteger(row) || row < 0 || row >= WAKE_ROWS.length) return 'その段はありません';
        if (this.wakeTaken[row] !== null) return 'その段はもう選ばれています';
        return {
            recorded: { type: 'wake', row },
            run: () => {
                const p = this.players[seat];
                p.wake = row;
                this.wakeTaken[row] = seat;
                this.turnOpen = false;
                this.log(`${p.name}：起床 ${row + 1}（${WAKE_ROWS[row].label}）`);
                this.pushTasks(seat, WAKE_ROWS[row].tasks);
            }
        };
    }

    check_place(seat, { action, grande }) {
        if ((this.season !== 'summer' && this.season !== 'winter') || this.pending) return '今は人を置けません';
        const big = grande === true;
        const error = this.placeError(seat, action, big);
        if (error) return error;
        return {
            recorded: { type: 'place', action, grande: big },
            run: () => {
                const p = this.players[seat];
                if (big) p.grandeFree = false;
                else p.used += 1;
                this.turnOpen = false;
                let bonus = false;
                if (action === 'yoke') {
                    p.yokeUsed = this.season;
                } else {
                    const space = this.spaces[action];
                    const slot = space.slots.indexOf(null);
                    if (slot >= 0) {
                        space.slots[slot] = seat;
                        bonus = slot === 0;
                    } else space.extra.push(seat);
                }
                const name = action === 'yoke' ? 'くびき' : ACTION[action].name;
                this.log(`${p.name}：${big ? '大きいワーカーを' : ''}${name}${bonus && ACTION[action]?.bonusText ? `（おまけ：${ACTION[action].bonusText}）` : ''}`);
                this.pushTasks(seat, actionTasks(action, bonus));
            }
        };
    }

    check_pass(seat) {
        if ((this.season !== 'summer' && this.season !== 'winter') || this.pending) return '今はパスできません';
        return {
            recorded: { type: 'pass' },
            run: () => {
                this.players[seat].passed = true;
                this.turnOpen = false;
                this.log(`${this.players[seat].name}：パス`);
            }
        };
    }

    check_choose(seat, { index }) {
        const pending = this.pending;
        if (!pending || pending.seat !== seat) return '今は選ぶものがありません';
        if (!Number.isInteger(index) || index < 0 || index >= pending.options.length) return 'その選択肢はありません';
        return {
            recorded: { type: 'choose', index },
            run: () => {
                this.pending = null;
                this[`answer_${pending.handler}`](seat, pending.options[index], pending.task);
            }
        };
    }

    // ---- 人を置く ----

    availableWorkers(p) {
        return p.workers + p.temp - p.fresh - p.used;
    }

    // 置けないなら理由、置けるなら null
    placeError(seat, action, grande) {
        const p = this.players[seat];
        if (action === 'yoke') {
            if (!p.structures.includes('yoke')) return 'くびきを建てていません';
            if (p.yokeUsed === this.season) return 'くびきはこの季節にもう使っています';
        } else {
            const info = ACTION[action];
            if (!info) return 'その場所はありません';
            if (info.season !== this.season) return `${SEASON_NAME[info.season]}の場所です`;
        }
        if (grande ? !p.grandeFree : this.availableWorkers(p) <= 0) return grande ? '大きいワーカーはもう置いています' : '置ける人がいません';
        let bonus = false;
        if (action !== 'yoke') {
            const space = this.spaces[action];
            if (space.slots.includes(seat) || space.extra.includes(seat)) return 'そこにはもう自分の人がいます';
            const slot = space.slots.indexOf(null);
            if (!ACTION[action].open && slot < 0 && !grande) return '空いている枠がありません（大きいワーカーなら置けます）';
            bonus = slot === 0;
        }
        if (!this.tasksFeasible(seat, actionTasks(action, bonus))) return '今はその行動ができません';
        return null;
    }

    // 置ける場所の一覧 [{ action, grande }]
    legalPlacements(seat) {
        const result = [];
        const ids = [...ACTIONS.filter(a => a.season === this.season).map(a => a.id), 'yoke'];
        ids.forEach(action => {
            [false, true].forEach(grande => {
                if (!this.placeError(seat, action, grande)) result.push({ action, grande });
            });
        });
        return result;
    }

    canPlaceAny(seat) {
        return this.legalPlacements(seat).length > 0;
    }

    // ---- 手順 ----

    // 手順を列の先頭に積む（今の手順の続きとして、すぐに行う）
    pushTasks(seat, tasks) {
        this.queue.unshift(...tasks.map(t => ({ ...t, seat })));
    }

    // 選択を出して止まる。options：[{ label, ...答えに使う値 }]
    ask(seat, handler, task, title, options) {
        this.pending = { id: ++this.promptSeq, seat, handler, task, title, options };
    }

    exec(task) {
        const seat = task.seat;
        const p = this.players[seat];
        switch (task.op) {
            case 'lira':
                p.lira = Math.max(0, p.lira + task.n);
                if (task.n) this.log(`${p.name}：${task.n > 0 ? `${task.n}リラ得た` : `${-task.n}リラ払った`}`);
                return;
            case 'vp':
                p.vp += task.n;
                if (task.n) this.log(`${p.name}：${task.n > 0 ? `${task.n}点得た` : `${-task.n}点失った`}`);
                return;
            case 'residual':
                p.residual = Math.max(0, Math.min(MAX_RESIDUAL, p.residual + task.n));
                this.log(`${p.name}：残りの収入が${p.residual}に`);
                return;
            case 'draw':
                this.drawCards(seat, task.deck, task.n);
                return;
            case 'drawVisitor':
                if (task.n <= 0) return;
                this.ask(seat, 'drawDeck', task, `訪問者カードを引く（あと${task.n}枚）`, [
                    { label: '夏の訪問者', deck: 'summer' }, { label: '冬の訪問者', deck: 'winter' }
                ]);
                return;
            case 'drawAny':
                if (task.n <= 0) return;
                this.ask(seat, 'drawDeck', task, `カードを引く（あと${task.n}枚）`, DECKS.map(deck => ({ label: DECK_NAME[deck], deck })));
                return;
            case 'plant': {
                const options = this.plantOptions(seat, task);
                if (!options.length) return;
                this.ask(seat, 'plant', task, `ブドウを植える${task.n > 1 ? `（あと${task.n}本まで）` : ''}`, this.withSkip(options, task));
                return;
            }
            case 'build': {
                const options = this.buildOptions(seat, task);
                if (!options.length) return;
                this.ask(seat, 'build', task, '建物を建てる', this.withSkip(options, task));
                return;
            }
            case 'harvest': {
                const options = this.harvestOptions(seat);
                if (!options.length) return;
                this.ask(seat, 'harvest', task, `畑を収穫する${task.n > 1 ? `（あと${task.n}つまで）` : ''}`, this.withSkip(options, task));
                return;
            }
            case 'make': {
                const options = this.makeOptions(seat);
                if (!options.length) return;
                this.ask(seat, 'make', task, `ワインを造る${task.n > 1 ? `（あと${task.n}つまで）` : ''}`, this.withSkip(options, task));
                return;
            }
            case 'fill': {
                const options = this.fillOptions(seat);
                if (!options.length) return;
                this.ask(seat, 'fill', task, `注文を果たす${task.bonus ? `（さらに${task.bonus}点）` : ''}`, this.withSkip(options, task));
                return;
            }
            case 'train':
                if (p.workers >= MAX_WORKERS - 1 || p.lira < task.cost) return;
                p.lira -= task.cost;
                p.workers += 1;
                p.fresh += 1;
                this.log(`${p.name}：${task.cost}リラで人を1人雇った（${p.workers + 1}人。次の季節から）`);
                return;
            case 'sell': {
                const options = this.sellOptions(seat, false);
                if (!options.length) return;
                this.ask(seat, 'sell', task, 'ブドウを売るか、畑を売る・買い戻す', options);
                return;
            }
            case 'sellMore': {
                const options = this.sellOptions(seat, true);
                if (!options.length) return;
                this.ask(seat, 'sell', task, 'ほかのブドウも売る？', [...options, { label: 'これで終わる', skip: true }]);
                return;
            }
            case 'uprootDiscard':
            case 'uproot': {
                if (task.n <= 0) return;
                const options = this.vineOptions(seat);
                if (!options.length) return;
                const title = task.op === 'uproot' ? 'ブドウを1本抜いて手札に戻す' : `ブドウを抜いて捨てる（あと${task.n}本）`;
                this.ask(seat, task.op, task, title, options);
                return;
            }
            case 'yoke': {
                const options = [];
                if (this.vineOptions(seat).length) options.push({ label: 'ブドウを1本抜いて手札に戻す', tasks: [{ op: 'uproot', n: 1 }] });
                if (this.harvestOptions(seat).length) options.push({ label: '畑を1つ収穫する', tasks: [{ op: 'harvest', n: 1 }] });
                if (options.length === 1) this.pushTasks(seat, options[0].tasks);
                else if (options.length) this.ask(seat, 'tasks', task, 'くびき', options);
                return;
            }
            case 'age':
                for (let i = 0; i < task.times; i++) this.ageCellar(p);
                this.log(`${p.name}：ワインを${task.times}回熟成させた`);
                return;
            case 'ageOne': {
                const options = this.wineOptions(seat, 1).filter(o => this.ageTarget(p, o.kind, o.value) !== null);
                if (!options.length) return;
                this.ask(seat, 'ageOne', task, 'ワインを1つ熟成させる', options);
                return;
            }
            case 'upgradeCellar': {
                const next = this.nextCellar(p);
                if (!next) return;
                const price = this.cellarPrice(task, next);
                if (p.lira < price) return;
                p.lira -= price;
                p.structures.push(next);
                this.log(`${p.name}：${STRUCTURE[next].name}を${price}リラで建てた`);
                return;
            }
            case 'discardCards': {
                if (task.n <= 0) return;
                const options = this.handOptions(seat, task.filter);
                if (!options.length) return;
                this.ask(seat, 'discardCard', task, `${task.filter === 'visitor' ? '訪問者' : ''}カードを捨てる（あと${task.n}枚）`, options);
                return;
            }
            case 'discardHand': {
                const k = p.hand.length;
                p.hand.forEach(id => this.discards[CARDS[id].deck].push(id));
                p.hand = [];
                this.log(`${p.name}：手札を${k}枚捨てた`);
                return;
            }
            case 'handLimit': {
                if (p.hand.length <= HAND_LIMIT) return;
                this.ask(seat, 'discardCard', { ...task, n: p.hand.length - HAND_LIMIT }, `手札は${HAND_LIMIT}枚まで。捨てるカード（あと${p.hand.length - HAND_LIMIT}枚）`, this.handOptions(seat));
                return;
            }
            case 'discardWine': {
                const options = this.wineOptions(seat, task.min);
                if (!options.length) return;
                this.ask(seat, 'discardWine', task, `ワインを1つ捨てる${task.min > 1 ? `（価値${task.min}以上）` : ''}`, options);
                return;
            }
            case 'discardWines': {
                const options = this.winePairOptions(seat, task.sum);
                if (!options.length) return;
                this.ask(seat, 'discardWines', task, `ワインを2つ捨てる（合計${task.sum}以上）`, options);
                return;
            }
            case 'taster': {
                const options = this.wineOptions(seat, 1);
                if (!options.length) return;
                this.ask(seat, 'taster', task, 'ワインを1つ捨てる', options);
                return;
            }
            case 'discardGrape': {
                const options = this.grapeOptions(seat);
                if (!options.length) return;
                this.ask(seat, 'discardGrape', task, 'ブドウを1つ捨てる', options);
                return;
            }
            case 'gainGrape':
                task.colors.forEach(color => this.placeGrape(p, color, task.value));
                return;
            case 'perEmptyField': {
                const k = p.fields.filter(f => !f.sold && f.vines.length === 0).length;
                p.lira += k * task.lira;
                this.log(`${p.name}：空いている畑${k}つで${k * task.lira}リラ`);
                return;
            }
            case 'perPlantedField': {
                const k = p.fields.filter(f => f.vines.length > 0).length;
                p.vp += k * task.vp;
                this.log(`${p.name}：ブドウのある畑${k}つで${k * task.vp}点`);
                return;
            }
            case 'perStruct4': {
                const k = p.structures.filter(id => STRUCTURE[id].cost === 4).length;
                p.vp += k * task.vp;
                this.log(`${p.name}：値段4の建物${k}つで${k * task.vp}点`);
                return;
            }
            case 'perHandCard': {
                const k = p.hand.length;
                p.lira += k * task.lira;
                this.log(`${p.name}：手札${k}枚で${k * task.lira}リラ`);
                return;
            }
            case 'perMade': {
                const made = p.ctx.made;
                const k = task.kind === 'types' ? new Set(made).size : made.filter(kind => kind === task.kind).length;
                if (k > 0) {
                    p.vp += k * task.vp;
                    this.log(`${p.name}：${k * task.vp}点`);
                }
                return;
            }
            case 'ifCond':
                if (this.condition(seat, task.cond)) this.pushTasks(seat, task.tasks);
                return;
            case 'tasting':
                if (p.structures.includes('tasting') && !p.tastingUsed && wineCount(p) > 0) {
                    p.tastingUsed = true;
                    p.vp += 1;
                    this.log(`${p.name}：試飲室で1点`);
                }
                return;
            case 'tempWorker':
                p.temp = 1;
                return;
            case 'gainStructure':
                if (!p.structures.includes(task.id)) p.structures.push(task.id);
                this.log(`${p.name}：${STRUCTURE[task.id].name}を受け取った`);
                return;
            case 'gainWorker':
                p.workers = Math.min(MAX_WORKERS - 1, p.workers + 1);
                this.log(`${p.name}：人が1人増えた`);
                return;
            case 'papa': {
                const papa = PAPAS[p.papa];
                this.ask(seat, 'tasks', task, `パパ${papa.name}から受け取るもの`, [
                    { label: papa.pick.label, tasks: papa.pick.tasks },
                    { label: `${papa.alt}リラ`, tasks: [{ op: 'lira', n: papa.alt }] }
                ]);
                return;
            }
            case 'playVisitor': {
                if (task.n <= 0) return;
                const options = p.hand.filter(id => CARDS[id].deck === task.deck && this.visitorPlayable(seat, id))
                    .map(id => ({ label: CARDS[id].name, card: id }));
                if (!options.length) return;
                this.ask(seat, 'visitor', task, `${DECK_NAME[task.deck]}カードを出す`, this.withSkip(options, task));
                return;
            }
            case 'visitorEffect': {
                const card = CARDS[task.card];
                const options = card.options.filter(o => this.tasksFeasible(seat, o.tasks)).map(o => ({ label: o.label, tasks: o.tasks }));
                if (options.length === 1 && card.options.length === 1) this.pushTasks(seat, options[0].tasks);
                else if (options.length) this.ask(seat, 'tasks', task, card.name, options);
                return;
            }
            case 'ctxReset':
                p.ctx = { planted: [], plantedField: null, harvested: 0, made: [] };
                return;
            default:
                throw new Error(`知らない手順: ${task.op}`);
        }
    }

    // 「〜まで」の手順は、1つ目のあとか、なくてもよい手順なら「終わる」を足す
    withSkip(options, task) {
        return task.started || task.opt ? [...options, { label: task.started ? 'これで終わる' : 'しない', skip: true }] : options;
    }

    // 残りの回数を1つ減らして、同じ手順を次に積む
    again(seat, task) {
        if (task.n > 1) this.pushTasks(seat, [{ ...task, n: task.n - 1, started: true }]);
    }

    // ---- 答え ----

    answer_tasks(seat, option) {
        this.pushTasks(seat, option.tasks);
    }

    answer_drawDeck(seat, option, task) {
        this.drawCards(seat, option.deck, 1);
        if (task.n > 1) this.pushTasks(seat, [{ ...task, n: task.n - 1 }]);
    }

    answer_plant(seat, option, task) {
        if (option.skip) return;
        const p = this.players[seat];
        const card = CARDS[option.card];
        p.hand.splice(p.hand.indexOf(option.card), 1);
        p.fields[option.field].vines.push(option.card);
        p.ctx.planted.push(option.card);
        p.ctx.plantedField = option.field;
        this.log(`${p.name}：${card.name}を${p.fields[option.field].max}の畑に植えた`);
        if (p.structures.includes('windmill') && !p.windmillUsed) {
            p.windmillUsed = true;
            p.vp += 1;
            this.log(`${p.name}：風車で1点`);
        }
        this.again(seat, task);
    }

    answer_build(seat, option, task) {
        if (option.skip) return;
        const p = this.players[seat];
        p.lira -= option.price;
        p.structures.push(option.id);
        this.log(`${p.name}：${STRUCTURE[option.id].name}を${option.price}リラで建てた`);
        if (task.vpIfCost5 && STRUCTURE[option.id].cost >= 5) {
            p.vp += 1;
            this.log(`${p.name}：1点`);
        }
    }

    answer_harvest(seat, option, task) {
        if (option.skip) return;
        const p = this.players[seat];
        const field = p.fields[option.field];
        field.harvested = true;
        p.ctx.harvested += 1;
        const red = field.vines.reduce((s, id) => s + CARDS[id].red, 0);
        const white = field.vines.reduce((s, id) => s + CARDS[id].white, 0);
        const got = [];
        if (red > 0) got.push(this.placeGrape(p, 'red', red));
        if (white > 0) got.push(this.placeGrape(p, 'white', white));
        this.log(`${p.name}：${field.max}の畑を収穫（${got.join('・')}）`);
        this.again(seat, task);
    }

    answer_make(seat, option, task) {
        if (option.skip) return;
        const p = this.players[seat];
        option.red.forEach(v => p.crush.red.splice(p.crush.red.indexOf(v), 1));
        option.white.forEach(v => p.crush.white.splice(p.crush.white.indexOf(v), 1));
        const value = this.wineTarget(p, option.kind, option.sum);
        p.cellar[option.kind].push(value);
        p.ctx.made.push(option.kind);
        this.log(`${p.name}：${WINE_NAME[option.kind]}ワイン${value}を造った`);
        this.again(seat, task);
    }

    answer_fill(seat, option, task) {
        if (option.skip) return;
        const p = this.players[seat];
        const card = CARDS[option.card];
        option.wines.forEach(w => p.cellar[w.kind].splice(p.cellar[w.kind].indexOf(w.value), 1));
        p.hand.splice(p.hand.indexOf(option.card), 1);
        this.discards.order.push(option.card);
        const vp = card.vp + (task.bonus ?? 0);
        p.vp += vp;
        p.residual = Math.min(MAX_RESIDUAL, p.residual + card.residual);
        this.log(`${p.name}：注文（${option.wines.map(w => `${WINE_NAME[w.kind]}${w.value}`).join('・')}）を果たして${vp}点${card.residual ? `・残りの収入+${card.residual}` : ''}`);
    }

    answer_sell(seat, option) {
        if (option.skip) return;
        const p = this.players[seat];
        if (option.grape) {
            const { color, value } = option.grape;
            p.crush[color].splice(p.crush[color].indexOf(value), 1);
            p.lira += grapePrice(value);
            this.log(`${p.name}：${COLOR_NAME[color]}ブドウ${value}を${grapePrice(value)}リラで売った`);
            this.pushTasks(seat, [{ op: 'sellMore' }]);
        } else if (option.sellField !== undefined) {
            const field = p.fields[option.sellField];
            field.sold = true;
            p.lira += field.max;
            this.log(`${p.name}：${field.max}の畑を${field.max}リラで売った`);
        } else {
            const field = p.fields[option.buyField];
            field.sold = false;
            p.lira -= field.max;
            this.log(`${p.name}：${field.max}の畑を${field.max}リラで買い戻した`);
        }
    }

    answer_uproot(seat, option, task) {
        const p = this.players[seat];
        const field = p.fields[option.field];
        field.vines.splice(field.vines.indexOf(option.card), 1);
        p.hand.push(option.card);
        this.log(`${p.name}：${CARDS[option.card].name}を抜いて手札に戻した`);
        this.again(seat, task);
    }

    answer_uprootDiscard(seat, option, task) {
        const p = this.players[seat];
        const field = p.fields[option.field];
        field.vines.splice(field.vines.indexOf(option.card), 1);
        this.discards.vine.push(option.card);
        this.log(`${p.name}：${CARDS[option.card].name}を抜いて捨てた`);
        this.again(seat, task);
    }

    answer_ageOne(seat, option) {
        const p = this.players[seat];
        const to = this.ageTarget(p, option.kind, option.value);
        const list = p.cellar[option.kind];
        list[list.indexOf(option.value)] = to;
        this.log(`${p.name}：${WINE_NAME[option.kind]}ワイン${option.value}を${to}に熟成させた`);
    }

    answer_discardCard(seat, option, task) {
        const p = this.players[seat];
        p.hand.splice(p.hand.indexOf(option.card), 1);
        this.discards[CARDS[option.card].deck].push(option.card);
        this.log(`${p.name}：カードを1枚捨てた`);
        if (task.op === 'handLimit') this.pushTasks(seat, [{ op: 'handLimit' }]);
        else this.again(seat, task);
    }

    answer_discardWine(seat, option) {
        const p = this.players[seat];
        p.cellar[option.kind].splice(p.cellar[option.kind].indexOf(option.value), 1);
        this.log(`${p.name}：${WINE_NAME[option.kind]}ワイン${option.value}を捨てた`);
    }

    answer_discardWines(seat, option) {
        option.wines.forEach(w => this.answer_discardWine(seat, w));
    }

    answer_taster(seat, option) {
        const p = this.players[seat];
        const best = Math.max(...this.players.flatMap(q => Object.values(q.cellar).flat()));
        this.answer_discardWine(seat, option);
        p.lira += 4;
        this.log(`${p.name}：4リラ得た`);
        if (option.value >= best) {
            p.vp += 2;
            this.log(`${p.name}：一番価値の高いワインで2点`);
        }
    }

    answer_discardGrape(seat, option) {
        const p = this.players[seat];
        p.crush[option.color].splice(p.crush[option.color].indexOf(option.value), 1);
        this.log(`${p.name}：${COLOR_NAME[option.color]}ブドウ${option.value}を捨てた`);
    }

    answer_visitor(seat, option, task) {
        if (option.skip) return;
        const p = this.players[seat];
        const card = CARDS[option.card];
        p.hand.splice(p.hand.indexOf(option.card), 1);
        this.discards[card.deck].push(option.card);
        this.log(`${p.name}：訪問者「${card.name}」`);
        this.pushTasks(seat, [
            { op: 'ctxReset' },
            { op: 'visitorEffect', card: option.card },
            ...(task.n > 1 ? [{ ...task, n: task.n - 1, started: true }] : [])
        ]);
    }

    // ---- 選択肢 ----

    plantOptions(seat, task = {}, exclude = null) {
        const p = this.players[seat];
        const seen = new Set();
        const options = [];
        p.hand.forEach(id => {
            const card = CARDS[id];
            if (card.deck !== 'vine' || id === exclude || seen.has(card.type)) return;
            seen.add(card.type);
            if (!task.free && !card.needs.every(s => p.structures.includes(s))) return;
            p.fields.forEach((field, i) => {
                if (field.sold) return;
                const total = field.vines.reduce((s, v) => s + vineValue(CARDS[v]), 0);
                if (!task.overMax && total + vineValue(card) > field.max) return;
                options.push({ label: `${cardTitle(card)}を${field.max}の畑に`, card: id, field: i });
            });
        });
        return options;
    }

    buildOptions(seat, task = {}) {
        const p = this.players[seat];
        return STRUCTURES.filter(s => {
            if (p.structures.includes(s.id)) return false;
            if (s.id === 'large' && !p.structures.includes('medium')) return false;
            if (task.only && s.id !== task.only) return false;
            if (task.costs && !task.costs.includes(s.cost)) return false;
            return p.lira >= this.buildPrice(task, s);
        }).map(s => ({ label: `${s.name}（${this.buildPrice(task, s)}リラ）`, id: s.id, price: this.buildPrice(task, s) }));
    }

    buildPrice(task, structure) {
        if (task.free) return 0;
        if (task.price !== undefined) return task.price;
        return Math.max(0, structure.cost - (task.discount ?? 0));
    }

    nextCellar(p) {
        if (!p.structures.includes('medium')) return 'medium';
        if (!p.structures.includes('large')) return 'large';
        return null;
    }

    cellarPrice(task, id) {
        if (task.price !== undefined) return task.price;
        return Math.max(0, STRUCTURE[id].cost - (task.discount ?? 0));
    }

    harvestOptions(seat) {
        const p = this.players[seat];
        return p.fields.map((field, i) => ({ field, i })).filter(({ field }) => !field.sold && !field.harvested && field.vines.length > 0)
            .map(({ field, i }) => {
                const red = field.vines.reduce((s, id) => s + CARDS[id].red, 0);
                const white = field.vines.reduce((s, id) => s + CARDS[id].white, 0);
                return { label: `${field.max}の畑（${[red ? `赤${red}` : '', white ? `白${white}` : ''].filter(Boolean).join('・')}）`, field: i };
            });
    }

    makeOptions(seat) {
        const p = this.players[seat];
        const reds = [...p.crush.red].sort((a, b) => a - b);
        const whites = [...p.crush.white].sort((a, b) => a - b);
        const options = [];
        const add = (kind, red, white) => {
            const sum = [...red, ...white].reduce((s, v) => s + v, 0);
            if (sum < WINE_MIN[kind]) return;
            const value = this.wineTarget(p, kind, sum);
            if (value === null) return;
            const from = [...red.map(v => `赤${v}`), ...white.map(v => `白${v}`)].join('＋');
            options.push({ label: `${WINE_NAME[kind]}ワイン${value}（${from}）`, kind, red, white, sum, value });
        };
        reds.forEach(r => add('red', [r], []));
        whites.forEach(w => add('white', [], [w]));
        if (p.structures.includes('medium')) reds.forEach(r => whites.forEach(w => add('blush', [r], [w])));
        if (p.structures.includes('large')) {
            reds.forEach((r1, i) => reds.slice(i + 1).forEach(r2 => whites.forEach(w => add('sparkling', [r1, r2], [w]))));
        }
        return options;
    }

    fillOptions(seat) {
        const p = this.players[seat];
        const options = [];
        p.hand.forEach(id => {
            const card = CARDS[id];
            if (card.deck !== 'order') return;
            const wines = matchOrder(p.cellar, card.wines);
            if (wines) options.push({ label: `${cardTitle(card)} → ${card.vp}点${card.residual ? `・収入+${card.residual}` : ''}`, card: id, wines });
        });
        return options;
    }

    sellOptions(seat, grapesOnly) {
        const p = this.players[seat];
        const options = this.grapeOptions(seat).map(o => ({ label: `${o.label}を${grapePrice(o.value)}リラで売る`, grape: { color: o.color, value: o.value } }));
        if (grapesOnly) return options;
        p.fields.forEach((field, i) => {
            if (!field.sold && field.vines.length === 0) options.push({ label: `${field.max}の畑を${field.max}リラで売る`, sellField: i });
            if (field.sold && p.lira >= field.max) options.push({ label: `${field.max}の畑を${field.max}リラで買い戻す`, buyField: i });
        });
        return options;
    }

    grapeOptions(seat) {
        const p = this.players[seat];
        return ['red', 'white'].flatMap(color => [...p.crush[color]].sort((a, b) => a - b)
            .map(value => ({ label: `${COLOR_NAME[color]}ブドウ${value}`, color, value })));
    }

    wineOptions(seat, min) {
        const p = this.players[seat];
        return Object.keys(p.cellar).flatMap(kind => [...p.cellar[kind]].sort((a, b) => a - b).filter(v => v >= min)
            .map(value => ({ label: `${WINE_NAME[kind]}ワイン${value}`, kind, value })));
    }

    winePairOptions(seat, sum) {
        const wines = this.wineOptions(seat, 1);
        const options = [];
        wines.forEach((a, i) => wines.slice(i + 1).forEach(b => {
            if (a.value + b.value >= sum) options.push({ label: `${a.label}と${b.label}`, wines: [a, b] });
        }));
        return options;
    }

    vineOptions(seat) {
        const p = this.players[seat];
        return p.fields.flatMap((field, i) => field.vines.map(id => ({ label: `${field.max}の畑の${cardTitle(CARDS[id])}`, field: i, card: id })));
    }

    handOptions(seat, filter) {
        const p = this.players[seat];
        return p.hand.filter(id => !filter || (filter === 'visitor' && ['summer', 'winter'].includes(CARDS[id].deck)))
            .map(id => ({ label: `${DECK_NAME[CARDS[id].deck]}：${cardTitle(CARDS[id])}`, card: id }));
    }

    // ---- できるかの判定（状態を変えない） ----

    // 手順の並びを今の状態で始められるか（なくてもよい手順 opt は数えない）
    tasksFeasible(seat, tasks, exclude = null) {
        const p = this.players[seat];
        const pay = tasks.reduce((s, t) => s + (t.op === 'lira' && t.n < 0 ? -t.n : 0) + (t.op === 'train' ? t.cost : 0), 0);
        if (p.lira < pay) return false;
        return tasks.every(t => t.opt || this.taskFeasible(seat, t, exclude));
    }

    taskFeasible(seat, task, exclude = null) {
        const p = this.players[seat];
        const hand = p.hand.filter(id => id !== exclude);
        switch (task.op) {
            case 'residual': return task.n >= 0 || p.residual >= -task.n;
            case 'plant': return this.plantOptions(seat, task, exclude).length > 0;
            case 'build': return this.buildOptions(seat, task).length > 0;
            case 'harvest': return this.harvestOptions(seat).length > 0;
            case 'make': return this.makeOptions(seat).length > 0;
            case 'fill': return this.fillOptions(seat).length > 0;
            case 'train': return p.workers < MAX_WORKERS - 1 && p.lira >= task.cost;
            case 'sell': return this.sellOptions(seat, false).length > 0;
            case 'uprootDiscard': return this.vineOptions(seat).length >= task.n;
            case 'upgradeCellar': {
                const next = this.nextCellar(p);
                return !!next && p.lira >= this.cellarPrice(task, next);
            }
            case 'ageOne': return this.wineOptions(seat, 1).some(o => this.ageTarget(p, o.kind, o.value) !== null);
            case 'discardCards': return hand.filter(id => !task.filter || ['summer', 'winter'].includes(CARDS[id].deck)).length >= task.n;
            case 'discardHand': return hand.length > 0;
            case 'discardWine': return this.wineOptions(seat, task.min).length > 0;
            case 'discardWines': return this.winePairOptions(seat, task.sum).length > 0;
            case 'taster': return wineCount(p) > 0;
            case 'discardGrape': return this.grapeOptions(seat).length > 0;
            case 'playVisitor': return p.hand.some(id => CARDS[id].deck === task.deck && this.visitorPlayable(seat, id));
            case 'yoke': return this.vineOptions(seat).length > 0 || this.harvestOptions(seat).length > 0;
            case 'ifCond': return !task.req || this.condition(seat, task.cond);
            default: return true;
        }
    }

    // 訪問者カードを、効果のどれか1つを行える形で出せるか
    visitorPlayable(seat, id) {
        return CARDS[id].options.some(o => this.tasksFeasible(seat, o.tasks, id));
    }

    condition(seat, cond) {
        const p = this.players[seat];
        switch (cond) {
            case 'vineTotal6': return p.fields.reduce((s, f) => s + f.vines.reduce((t, id) => t + vineValue(CARDS[id]), 0), 0) >= 6;
            case 'planted4': return p.ctx.planted.some(id => vineValue(CARDS[id]) >= 4);
            case 'field3types': return p.ctx.plantedField !== null && new Set(p.fields[p.ctx.plantedField].vines.map(id => CARDS[id].type)).size >= 3;
            case 'harvested3': return p.ctx.harvested >= 3;
            case 'workers4': return p.workers + 1 >= 4;
            case 'workers6': return p.workers + 1 >= MAX_WORKERS;
            case 'vpNegative': return p.vp < 0;
            case 'structures6': return p.structures.length >= 6;
            default: throw new Error(`知らない条件: ${cond}`);
        }
    }

    // ---- ブドウとワイン ----

    // ブドウを置く（同じ価値が埋まっていれば下へ）。置いた価値の文字を返す
    placeGrape(p, color, value) {
        let v = Math.min(9, value);
        while (v >= 1 && p.crush[color].includes(v)) v--;
        if (v < 1) return `${COLOR_NAME[color]}ブドウは置けなかった`;
        p.crush[color].push(v);
        return `${COLOR_NAME[color]}ブドウ${v}`;
    }

    // ワインを置ける価値（地下室の大きさと、埋まっているところを避けて下へ）。置けなければ null
    wineTarget(p, kind, sum) {
        const lo = WINE_MIN[kind];
        let v = Math.min(sum, cellarCap(p));
        while (v >= lo && p.cellar[kind].includes(v)) v--;
        return v >= lo ? v : null;
    }

    // ワインを1つ熟成させた先の価値（上げられなければ null）
    ageTarget(p, kind, value) {
        const to = value + 1;
        if (to > cellarCap(p) || p.cellar[kind].includes(to)) return null;
        return to;
    }

    ageList(list, step, cap) {
        const sorted = [...list].sort((a, b) => b - a);
        const result = [];
        sorted.forEach(v => {
            const to = Math.min(cap, v + step);
            result.push(to > v && !result.includes(to) ? to : v);
        });
        return result;
    }

    ageCellar(p) {
        const cap = cellarCap(p);
        Object.keys(p.cellar).forEach(kind => { p.cellar[kind] = this.ageList(p.cellar[kind], 1, cap); });
    }

    // ---- カード ----

    drawCard(deck) {
        if (this.decks[deck].length === 0 && this.discards[deck].length) {
            this.decks[deck] = this.shuffle(this.discards[deck]);
            this.discards[deck] = [];
        }
        return this.decks[deck].shift() ?? null;
    }

    drawCards(seat, deck, n, log = true) {
        const p = this.players[seat];
        let got = 0;
        for (let i = 0; i < n; i++) {
            const id = this.drawCard(deck);
            if (id === null) break;
            p.hand.push(id);
            got++;
        }
        if (log) this.log(`${p.name}：${DECK_NAME[deck]}カードを${got}枚引いた`);
    }

    // ---- 記録 ----

    log(text) {
        if (this.quiet) return;
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
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

    // CPU が手を試すための写し（記録とログは持たない）
    clone() {
        const { commands, logs, ...rest } = this;
        const copy = Object.assign(Object.create(Game.prototype), structuredClone(rest));
        copy.commands = [];
        copy.logs = [];
        copy.quiet = true;
        return copy;
    }
}

// ---- 数える ----

export const wineCount = (p) => Object.values(p.cellar).reduce((s, list) => s + list.length, 0);
export const wineTotal = (p) => Object.values(p.cellar).flat().reduce((s, v) => s + v, 0);
export const grapeTotal = (p) => [...p.crush.red, ...p.crush.white].reduce((s, v) => s + v, 0);

// 注文に使うワインを選ぶ（要るものの価値の高い順に、条件を満たす一番低いワインを当てる）。足りなければ null
export function matchOrder(cellar, wines) {
    const used = { red: [], white: [], blush: [], sparkling: [] };
    const picked = [];
    for (const need of [...wines].sort((a, b) => b.min - a.min)) {
        const left = [...cellar[need.kind]].sort((a, b) => a - b);
        used[need.kind].forEach(v => left.splice(left.indexOf(v), 1));
        const v = left.find(x => x >= need.min);
        if (v === undefined) return null;
        used[need.kind].push(v);
        picked.push({ kind: need.kind, value: v });
    }
    return picked;
}
