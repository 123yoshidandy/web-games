/**
 * サグラダの進行（基本ゲーム。1〜4人）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（袋から引く色と目はシードから決まる）
 *
 * 流れ
 * - 各人に個人の目標（色）と窓枠カード2枚（表裏で4つの窓）を配り、窓を1つ選ぶ（全員が同時に選ぶ）。好意トークンは窓の難しさの数
 * - 10ラウンド。ラウンドの始めに、袋から人数×2＋1個を引いて振り、ドラフトプールにする
 * - 手番は スタートの人 → … → 最後の人 → 最後の人 → … → スタートの人 の往復。手番では、ダイスを1個選んで窓に置く・道具を1枚使う、を好きな順に（どちらも任意）
 * - ラウンドの終わりに残ったダイスをラウンドトラックへ。スタートの人は次の人へ
 * - 10ラウンドのあと、公共の目標・個人の目標・残りの好意トークン − 空きマスで点を数える
 *   同点は、個人の目標の点 → 残りの好意トークン → 最終ラウンドの手番の逆順（あとの人が上）
 *
 * 1人用：好意トークンは使わない。公共の目標2枚・個人の目標2枚（点の多い方を使う）。道具は1〜5枚（多いほどやさしい）を、
 * プールの同じ色のダイス1個で払って1回ずつ使う。毎ラウンド4個を引き、2回の手番。空きマスは −3。
 * ラウンドトラックのダイスの目の合計（目標の点）より多ければ勝ち
 *
 * ルールブックに書かれていない、または読み方が分かれる点の決め方は README と各所のコメントに書いた
 */

import { createRandom, shuffle } from './random.js';
import {
    COLORS, COLOR_INFO, CELLS, ROUNDS, DICE_PER_COLOR, PATTERNS, PATTERN_CARDS, TOOLS, TOOL_IDS, OBJECTIVE_IDS,
    SOLO_DICE, SOLO_OPEN_PENALTY
} from './data.js';
import { canPlace, legalCells, canMove, applyMove, scoreWindow } from './rules.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
const MAX_LOGS = 400;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    choose: ['pattern'],
    draft: ['die', 'cell'],
    tool: ['tool', 'die', 'cell', 'delta', 'track', 'from', 'to', 'moves', 'pay'],
    place: ['cell'],
    fluxValue: ['value'],
    end: []
};

// 選んだダイスに手を加えてから置く道具
const AFTER_DRAFT = ['grozing', 'grinding', 'lens', 'fluxBrush', 'fluxRemover', 'cork'];

const isCell = (x) => Number.isInteger(x) && x >= 0 && x < CELLS;
const dieName = (d) => `${COLOR_INFO[d.color].name}の${d.value}`;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, soloTools（1人用の道具の枚数 1〜5）, tools（使う道具を決めるとき。確かめる用） }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は1〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const solo = players.length === 1;
        const soloTools = solo ? Math.min(5, Math.max(1, Number(options.soloTools) || 3)) : null;
        this.random = createRandom(seed);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        const toolCount = solo ? soloTools : 3;
        const fixedTools = Array.isArray(options.tools) && options.tools.length === toolCount && new Set(options.tools).size === toolCount
            && options.tools.every(id => TOOL_IDS.includes(id)) ? [...options.tools] : null;
        this.options = { seed, ...(solo ? { soloTools } : {}), ...(fixedTools ? { tools: fixedTools } : {}) };
        this.solo = solo;
        // 個人の目標（色）と窓枠カード
        const privates = shuffle([...COLORS], this.random);
        const cards = shuffle([...PATTERN_CARDS], this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            privates: solo ? privates.slice(0, 2) : [privates[id]],
            offers: PATTERNS.filter(pt => cards.slice(id * 2, id * 2 + 2).includes(pt.card)).map(pt => pt.id),
            pattern: null,
            window: Array(CELLS).fill(null),
            tokens: 0,
            result: null
        }));
        const dealt = shuffle([...TOOL_IDS], this.random).slice(0, toolCount);
        this.tools = (fixedTools ?? dealt).map(id => ({ id, tokens: 0, used: false }));
        this.objectives = shuffle([...OBJECTIVE_IDS], this.random).slice(0, solo ? 2 : 3);
        this.bag = Object.fromEntries(COLORS.map(c => [c, DICE_PER_COLOR]));
        this.firstStart = Math.floor(this.random() * players.length);
        this.nextDieId = 1;
        this.pool = [];
        this.roundTrack = [];
        this.round = 0;
        this.order = [];
        this.turnIndex = 0;
        this.turn = null;           // { seat, second, drafted, toolUsed }
        this.skip = [];             // このラウンドの2回目の手番がない人（続けざまのやっとこ）
        this.pending = null;        // 選ぶのを待っていること { seat, kind: 'place' | 'fluxValue', ... }
        this.phase = 'choose';      // choose：窓を選ぶ / play：ラウンド / end：終わり
        this.target = null;         // 1人用の目標の点
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        if (this.phase === 'choose') return this.players.filter(p => p.pattern === null).map(p => p.id);
        if (this.phase !== 'play') return [];
        if (this.pending) return [this.pending.seat];
        return [this.turn.seat];
    }

    patternOf(seat) {
        return PATTERNS[this.players[seat].pattern];
    }

    // ---- 袋とダイス ----

    // 袋から1個を引いて振る（袋が空なら null）
    drawDie() {
        const total = COLORS.reduce((s, c) => s + this.bag[c], 0);
        if (!total) return null;
        let k = Math.floor(this.random() * total);
        const color = COLORS.find(c => {
            if (k < this.bag[c]) return true;
            k -= this.bag[c];
            return false;
        });
        this.bag[color] -= 1;
        return { id: this.nextDieId++, color, value: this.roll() };
    }

    roll() {
        return 1 + Math.floor(this.random() * 6);
    }

    poolDie(id) {
        return this.pool.find(d => d.id === id) ?? null;
    }

    takeFromPool(id) {
        return this.pool.splice(this.pool.findIndex(d => d.id === id), 1)[0];
    }

    // ---- 道具 ----

    toolCost(tool) {
        return tool.tokens > 0 ? 2 : 1;
    }

    // 払えるか（1人用は、プールに同じ色のダイスがあるか。except のダイスは払いに使えない）
    canAfford(seat, tool, except = null) {
        if (this.solo) return !tool.used && this.pool.some(d => d.color === TOOLS[tool.id].color && d.id !== except);
        return this.players[seat].tokens >= this.toolCost(tool);
    }

    // 手番でまだできることがあるか（なければ自動で番を終える）
    canDoMore(seat) {
        const t = this.turn;
        const p = this.players[seat];
        const pattern = this.patternOf(seat);
        if (!t.drafted && this.pool.some(d => legalCells(p.window, pattern, d).length)) return true;
        if (!t.toolUsed && this.tools.some(tool => this.canAfford(seat, tool))) return true;
        return false;
    }

    // ---- 操作 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.actors().includes(playerId)) return this.fail('今は操作できません');
        const recorded = { type: command.type };
        try {
            COMMAND_FIELDS[command.type].forEach(key => {
                if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
            });
        } catch {
            return this.fail('今はその操作はできません');
        }
        const handler = {
            choose: () => this.choose(playerId, command),
            draft: () => this.draft(playerId, command),
            tool: () => this.useTool(playerId, command),
            place: () => this.placePending(playerId, command),
            fluxValue: () => this.chooseFluxValue(playerId, command),
            end: () => this.endTurn(playerId)
        }[command.type];
        if (!handler()) return false;
        this.commands.push({ playerId, command: recorded });
        this.afterAction();
        return true;
    }

    choose(seat, { pattern }) {
        const p = this.players[seat];
        if (this.phase !== 'choose') return this.fail('窓はもう選んでいます');
        if (!p.offers.includes(pattern)) return this.fail('その窓は選べません');
        p.pattern = pattern;
        p.tokens = this.solo ? 0 : PATTERNS[pattern].difficulty;
        if (this.players.every(q => q.pattern !== null)) {
            this.phase = 'play';
            this.log(`窓：${this.players.map(q => `${q.name}は${PATTERNS[q.pattern].name}（${PATTERNS[q.pattern].difficulty}）`).join('、')}`);
            this.startRound();
        }
        return true;
    }

    startRound() {
        this.round += 1;
        const n = this.players.length;
        const start = (this.firstStart + this.round - 1) % n;
        const count = this.solo ? SOLO_DICE : n * 2 + 1;
        this.pool = [];
        for (let k = 0; k < count; k++) {
            const die = this.drawDie();
            if (die) this.pool.push(die);
        }
        const first = Array.from({ length: n }, (_, k) => (start + k) % n);
        this.order = this.solo ? [0, 0] : [...first, ...[...first].reverse()];
        this.turnIndex = 0;
        this.skip = [];
        this.emit({ type: 'round', round: this.round });
        this.log(`ラウンド${this.round}：${this.pool.map(dieName).join('・')}`);
        this.beginTurn();
    }

    beginTurn() {
        const seat = this.order[this.turnIndex];
        this.turn = { seat, second: this.solo ? this.turnIndex === 1 : this.turnIndex >= this.players.length, drafted: false, toolUsed: false };
    }

    draft(seat, { die, cell }) {
        if (this.phase !== 'play' || this.pending) return this.fail('今は選べません');
        if (this.turn.drafted) return this.fail('この手番ではもう選んでいます');
        const d = this.poolDie(die);
        if (!d) return this.fail('そのダイスはプールにありません');
        const p = this.players[seat];
        if (!canPlace(p.window, this.patternOf(seat), cell, d)) return this.fail('そこには置けません');
        this.takeFromPool(die);
        p.window[cell] = d;
        this.turn.drafted = true;
        this.emit({ type: 'place', seat, die: { ...d }, cell });
        this.log(`${p.name}が${dieName(d)}を置いた`);
        return true;
    }

    endTurn(seat) {
        if (this.phase !== 'play' || this.pending) return this.fail('今は番を終えられません');
        this.log(`${this.players[seat].name}が番を終えた`);
        this.advanceTurn();
        return true;
    }

    // 手番を進める。できることのない人の番は、自動で飛ばす
    afterAction() {
        if (this.phase !== 'play' || this.pending) return;
        let guard = 0;
        while (this.phase === 'play' && !this.pending && !this.canDoMore(this.turn.seat) && guard++ < 200) this.advanceTurn();
    }

    advanceTurn() {
        this.turnIndex += 1;
        while (this.turnIndex < this.order.length && this.isSecondTurn(this.turnIndex) && this.skip.includes(this.order[this.turnIndex])) this.turnIndex += 1;
        if (this.turnIndex >= this.order.length) this.endRound();
        else this.beginTurn();
    }

    isSecondTurn(index) {
        return this.solo ? index === 1 : index >= this.players.length;
    }

    endRound() {
        this.roundTrack.push(this.pool);
        if (this.pool.length) this.log(`ラウンドトラックへ：${this.pool.map(dieName).join('・')}`);
        this.pool = [];
        this.turn = null;
        if (this.round >= ROUNDS) this.endGame();
        else this.startRound();
    }

    // ---- 道具を使う ----

    useTool(seat, command) {
        if (this.phase !== 'play' || this.pending) return this.fail('今は道具を使えません');
        const tool = this.tools.find(t => t.id === command.tool);
        if (!tool) return this.fail('その道具はありません');
        if (this.turn.toolUsed) return this.fail('この手番ではもう道具を使っています');
        if (this.solo && tool.used) return this.fail('その道具はもう使っています');
        // 払い：1人用はプールの同じ色のダイス、ほかは好意トークン
        let payDie = null;
        if (this.solo) {
            payDie = this.poolDie(command.pay);
            if (!payDie || payDie.color !== TOOLS[tool.id].color || payDie.id === command.die) return this.fail(`${COLOR_INFO[TOOLS[tool.id].color].name}のダイスで払います`);
        } else if (this.players[seat].tokens < this.toolCost(tool)) {
            return this.fail('好意トークンが足りません');
        }
        if (AFTER_DRAFT.includes(tool.id) && this.turn.drafted) return this.fail('この手番ではもう選んでいます');
        const apply = this.prepareTool(seat, tool.id, command);
        if (!apply) return false;
        // ここから状態を変える
        const p = this.players[seat];
        if (this.solo) {
            this.takeFromPool(payDie.id);
            tool.used = true;
        } else {
            const cost = this.toolCost(tool);
            p.tokens -= cost;
            tool.tokens += cost;
        }
        this.turn.toolUsed = true;
        this.emit({ type: 'tool', seat, tool: tool.id });
        this.log(`${p.name}が${TOOLS[tool.id].name}を使った${this.solo ? `（${dieName(payDie)}で払った）` : ''}`);
        apply();
        return true;
    }

    // 道具の中身を確かめ、使ってよければ、状態を変える関数を返す（確かめる間は状態を変えない）
    prepareTool(seat, id, command) {
        const p = this.players[seat];
        const pattern = this.patternOf(seat);
        const window = p.window;
        const pick = () => this.poolDie(command.die);
        // 手を加えたダイスを置く。置ける場所がないときだけ cell: null でプールに戻せる
        const placeChanged = (changed, cell) => {
            if (cell === null || cell === undefined) return legalCells(window, pattern, changed).length === 0;
            return canPlace(window, pattern, cell, changed);
        };
        const finishDraft = (die, changed, cell) => {
            this.turn.drafted = true;
            if (cell === null || cell === undefined) {
                Object.assign(die, changed);
                this.log(`${p.name}は${dieName(die)}を置けず、プールに戻した`);
                return;
            }
            this.takeFromPool(die.id);
            Object.assign(die, changed);
            window[cell] = die;
            this.emit({ type: 'place', seat, die: { ...die }, cell });
            this.log(`${p.name}が${dieName(die)}を置いた`);
        };
        switch (id) {
            case 'grozing': {
                const d = pick();
                if (!d) return this.fail('そのダイスはプールにありません');
                if (command.delta !== 1 && command.delta !== -1) return this.fail('目は1つだけ増やすか減らします');
                const value = d.value + command.delta;
                if (value < 1 || value > 6) return this.fail('1を6に、6を1にはできません');
                const changed = { color: d.color, value };
                if (!placeChanged({ ...changed, id: d.id }, command.cell)) return this.fail('そこには置けません');
                return () => finishDraft(d, changed, command.cell);
            }
            case 'grinding': {
                const d = pick();
                if (!d) return this.fail('そのダイスはプールにありません');
                const changed = { color: d.color, value: 7 - d.value };
                if (!placeChanged({ ...changed, id: d.id }, command.cell)) return this.fail('そこには置けません');
                return () => finishDraft(d, changed, command.cell);
            }
            case 'cork': {
                const d = pick();
                if (!d) return this.fail('そのダイスはプールにありません');
                if (!canPlace(window, pattern, command.cell, d, { alone: true })) return this.fail('ほかのダイスと接しないマスに置きます');
                return () => finishDraft(d, { color: d.color, value: d.value }, command.cell);
            }
            case 'lens': {
                const d = pick();
                if (!d) return this.fail('そのダイスはプールにありません');
                const [r, k] = Array.isArray(command.track) ? command.track : [];
                const other = Number.isInteger(r) && Number.isInteger(k) ? this.roundTrack[r]?.[k] : null;
                if (!other) return this.fail('ラウンドトラックのダイスを選びます');
                const changed = { color: other.color, value: other.value };
                if (!placeChanged({ ...changed, id: d.id }, command.cell)) return this.fail('そこには置けません');
                return () => {
                    // プールのダイスとラウンドトラックのダイスの色と目を入れ替える
                    this.roundTrack[r][k] = { ...other, color: d.color, value: d.value };
                    finishDraft(d, changed, command.cell);
                };
            }
            case 'fluxBrush': {
                const d = pick();
                if (!d) return this.fail('そのダイスはプールにありません');
                return () => {
                    d.value = this.roll();
                    this.turn.drafted = true;
                    this.log(`${p.name}が振り直して${dieName(d)}`);
                    this.offerPlace(seat, d, { mustPlace: true });
                };
            }
            case 'fluxRemover': {
                const d = pick();
                if (!d) return this.fail('そのダイスはプールにありません');
                return () => {
                    this.takeFromPool(d.id);
                    this.bag[d.color] += 1;
                    const drawn = this.drawDie();
                    this.turn.drafted = true;
                    this.log(`${p.name}が${dieName(d)}を袋に戻し、${COLOR_INFO[drawn.color].name}を引いた`);
                    this.pool.push(drawn);
                    this.pending = { seat, kind: 'fluxValue', die: drawn.id, color: drawn.color };
                };
            }
            case 'glazing': {
                if (!this.turn.second || this.turn.drafted) return this.fail('2回目の手番で、選ぶ前にだけ使えます');
                return () => {
                    this.pool.forEach(d => { d.value = this.roll(); });
                    this.log(`プールを振り直した：${this.pool.map(dieName).join('・')}`);
                };
            }
            case 'running': {
                if (this.turn.second || !this.turn.drafted) return this.fail('1回目の手番で、選んだあとに使えます');
                const d = pick();
                if (!d) return this.fail('そのダイスはプールにありません');
                if (!canPlace(window, pattern, command.cell, d)) return this.fail('そこには置けません');
                return () => {
                    this.takeFromPool(d.id);
                    window[command.cell] = d;
                    this.skip.push(seat);
                    this.emit({ type: 'place', seat, die: { ...d }, cell: command.cell });
                    this.log(`${p.name}が続けて${dieName(d)}を置いた（このラウンドの2回目の手番はない）`);
                };
            }
            case 'eglomise': case 'copper': {
                const options = id === 'eglomise' ? { ignoreColor: true } : { ignoreValue: true };
                if (!canMove(window, pattern, command.from, command.to, options)) return this.fail('そこへは動かせません');
                return () => this.moveDice(seat, [[command.from, command.to]]);
            }
            case 'lathekin': {
                const moves = command.moves;
                if (!Array.isArray(moves) || moves.length !== 2 || !this.validMoves(window, pattern, moves)) return this.fail('2個を、決まりを守って動かします');
                return () => this.moveDice(seat, moves);
            }
            case 'tapWheel': {
                const moves = command.moves;
                if (!Array.isArray(moves) || moves.length < 1 || moves.length > 2 || !this.validMoves(window, pattern, moves)) return this.fail('決まりを守って動かします');
                const colors = new Set(moves.map(([from]) => window[from]?.color));
                const trackColors = new Set(this.roundTrack.flat().map(d => d.color));
                if (colors.size !== 1 || !trackColors.has([...colors][0])) return this.fail('ラウンドトラックにある色の、同じ色のダイスを動かします');
                return () => this.moveDice(seat, moves);
            }
            default:
                return this.fail('その道具はありません');
        }
    }

    // 順に動かせるか（同じダイスを2回は動かさない）
    validMoves(window, pattern, moves) {
        let w = window;
        const moved = [];
        for (const move of moves) {
            if (!Array.isArray(move) || move.length !== 2) return false;
            const [from, to] = move;
            if (!isCell(from) || !isCell(to) || moved.includes(from) || !canMove(w, pattern, from, to)) return false;
            w = applyMove(w, from, to);
            moved.push(to);
        }
        return true;
    }

    moveDice(seat, moves) {
        const p = this.players[seat];
        moves.forEach(([from, to]) => {
            const die = p.window[from];
            p.window = applyMove(p.window, from, to);
            this.emit({ type: 'move', seat, from, to });
            this.log(`${p.name}が${dieName(die)}を動かした`);
        });
    }

    // 手を加えたダイスを置く場所を選ばせる。置ける場所がなければプールに戻す
    offerPlace(seat, die, { mustPlace }) {
        const p = this.players[seat];
        if (!legalCells(p.window, this.patternOf(seat), die).length) {
            this.log(`${p.name}は${dieName(die)}を置けず、プールに戻した`);
            return;
        }
        this.pending = { seat, kind: 'place', die: die.id, mustPlace };
    }

    placePending(seat, { cell }) {
        const pending = this.pending;
        if (pending?.kind !== 'place' || pending.seat !== seat) return this.fail('今は置けません');
        const d = this.poolDie(pending.die);
        const p = this.players[seat];
        if (cell === null) {
            if (pending.mustPlace) return this.fail('置ける場所があるので置きます');
            this.pending = null;
            this.log(`${p.name}は${dieName(d)}をプールに戻した`);
            return true;
        }
        if (!canPlace(p.window, this.patternOf(seat), cell, d)) return this.fail('そこには置けません');
        this.pending = null;
        this.takeFromPool(d.id);
        p.window[cell] = d;
        this.emit({ type: 'place', seat, die: { ...d }, cell });
        this.log(`${p.name}が${dieName(d)}を置いた`);
        return true;
    }

    chooseFluxValue(seat, { value }) {
        const pending = this.pending;
        if (pending?.kind !== 'fluxValue' || pending.seat !== seat) return this.fail('今は目を選べません');
        if (!Number.isInteger(value) || value < 1 || value > 6) return this.fail('目は1〜6です');
        const d = this.poolDie(pending.die);
        this.pending = null;
        d.value = value;
        this.offerPlace(seat, d, { mustPlace: false });
        return true;
    }

    // ---- 終わり ----

    endGame() {
        const openPenalty = this.solo ? SOLO_OPEN_PENALTY : 1;
        this.players.forEach(p => {
            p.result = scoreWindow(p.window, { objectives: this.objectives, privates: p.privates, tokens: this.solo ? 0 : p.tokens, openPenalty });
        });
        this.phase = 'end';
        if (this.solo) {
            this.target = this.roundTrack.flat().reduce((s, d) => s + d.value, 0);
            const p = this.players[0];
            this.winners = p.result.total > this.target ? [0] : [];
            this.log(`目標の点 ${this.target}・${p.name} ${p.result.total}点：${this.winners.length ? '勝ち' : '負け'}`);
        } else {
            // 同点は、個人の目標の点 → 残りの好意トークン → 最終ラウンドの手番の逆順（あとの人が上）
            const n = this.players.length;
            const lastStart = (this.firstStart + ROUNDS - 1) % n;
            const late = (seat) => (seat - lastStart + n) % n;
            const ranked = [...this.players].sort((a, b) => (b.result.total - a.result.total)
                || (b.result.private - a.result.private) || (b.tokens - a.tokens) || (late(b.id) - late(a.id)));
            this.ranking = ranked.map(p => p.id);
            this.winners = [ranked[0].id];
            this.log(`得点：${ranked.map(p => `${p.name} ${p.result.total}`).join('・')}`);
            this.log(`${ranked[0].name}の勝ち`);
        }
        this.emit({ type: 'end', winners: [...this.winners] });
    }

    // ---- 共通 ----

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

