/**
 * ギズモのゲームの進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びとディスペンサーの出方はシードから決まる）
 *
 * ルール
 * - 準備：エネルギーは4色13個ずつ（52個）をディスペンサーに入れ、6個を列に出す。レベル3の山札は20枚を除いて16枚で遊ぶ
 *         場にレベル1を4枚・レベル2を3枚・レベル3を2枚並べる。各自、最初のギズモ（保管したら1個引く）を建てた状態で始める
 *         上限は、エネルギー5個・保管庫1枚・研究3枚から始まり、強化のギズモで増える
 * - 手番：次の4つのうち1つを行う
 *   1. 保管：場のギズモを1枚、保管庫に置く（保管庫の上限まで）
 *   2. 取る：列のエネルギーを1個取る（エネルギーの上限まで）。列はディスペンサーから1個補充する
 *   3. 建てる：場か保管庫のギズモを、その色のエネルギーを費用の数だけ払って建てる。払ったエネルギーはディスペンサーに戻す
 *   4. 研究：山札を1つ選び、研究の数だけ引く。1枚を建てるか保管してよい。残りは山札の下に戻す
 * - 連鎖：行動のあと、その行動に合うギズモ（保管したら・取ったら・建てたら）が働く。使うかどうかと順番は選べる
 *         効果で行う行動（取る・保管・研究・建てる）も、さらにギズモを働かせる。各ギズモは1巡に1回だけ。建てた行動では、そのギズモ自身は働かない
 * - 終わり：だれかが16枚（最初のギズモを含む）建てるか、レベル3を4枚建てたら、その巡の終わり（最初の手番の人の前）まで続ける
 * - 得点：建てたギズモの点＋得点チップ。同点なら、建てた枚数が多い人、残りのエネルギーが多い人、最初の手番の人から遠い人の順
 *
 * ルールブックに書かれていないので、次のように決めた
 * - ディスペンサーが空なら、引けない・列は補充しない
 * - 山札がなくなったら、場の空いた所はそのまま
 * - 得点チップは数に限りがないものとする
 * - どの行動もできないときだけ、何もせずに手番を終えられる（パス）。全員が続けてパスしたら、その時点で終わる
 * - 研究で戻すカードの順番は、引いた順のまま山札の下に入れる
 * - 変換のギズモは、払えるうちで一番少ない数を使う（どれを使ったかは、払うエネルギーから決める）
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, COLORS, COLOR_NAMES, TYPE_NAMES, ENERGY_PER_COLOR, STARTING_CARDS } from './cards.js';
import { emptyEnergy, countEnergy, checkSpend, autoSpend } from './payment.js';

export { CARDS, COLORS, COLOR_NAMES, TYPE_NAMES, emptyEnergy, countEnergy };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const LEVELS = [1, 2, 3];
export const ROW_SIZE = 6;
export const DISPLAY_SLOTS = { 1: 4, 2: 3, 3: 2 };
export const LEVEL3_IN_GAME = 16;
export const START_LIMITS = { storage: 5, archive: 1, research: 3 };
export const END_GIZMOS = 16;
export const END_LEVEL3 = 4;
const MAX_LOGS = 300;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    file: ['card'], pick: ['slot'], build: ['card', 'spend'], research: ['level'], pass: [],
    researchBuild: ['card', 'spend'], researchFile: ['card'], researchSkip: [],
    use: ['gizmo', 'slot', 'card', 'level'], stop: []
};

// ---- プレイヤーの持ち物（ビューの形でもよい）から計算する道具。画面と CPU でも使う ----

export function limitsOf(player) {
    const limits = { ...START_LIMITS };
    player.built.forEach(id => {
        const up = CARDS[id].upgrade;
        if (!up) return;
        limits.storage += up.storage ?? 0;
        limits.archive += up.archive ?? 0;
        limits.research += up.research ?? 0;
    });
    return limits;
}

export const isBlocked = (player, action) => player.built.some(id => CARDS[id].upgrade?.block === action);

// source：'display'・'archive'・'research'
export function discountFor(player, card, source) {
    return player.built.filter(id => {
        const d = CARDS[id].upgrade?.discount;
        return (d === 'level2' && card.level === 2) || (d === 'archive' && source === 'archive') || (d === 'research' && source === 'research');
    }).length;
}

export const costFor = (player, card, source) => Math.max(0, card.cost - discountFor(player, card, source));

// その巡にまだ使っていない、変換のギズモ
export const convertersOf = (player, used = []) => player.built.filter(id => CARDS[id].convert && !used.includes(id));

export const level3Count = (player) => player.built.filter(id => CARDS[id].level === 3).length;

// 点数の決まらないカード（残りのエネルギー・得点チップ）も含めた、ギズモ1枚の点
export function gizmoPoints(player, id) {
    const card = CARDS[id];
    if (card.upgrade?.score === 'energy') return countEnergy(player.energy);
    if (card.upgrade?.score === 'tokens') return player.vp;
    return card.points;
}

export const pointsOf = (player) => player.built.reduce((sum, id) => sum + gizmoPoints(player, id), 0) + player.vp;

// ギズモの効果がこの行動で働くか。ctx：{ action, color?（取った色）, card?・source?（建てたギズモと、どこから） }
export function triggerMatches(card, ctx) {
    const t = card.trigger;
    if (!t || t.action !== ctx.action) return false;
    if (ctx.action === 'pick') return t.colors.includes(ctx.color);
    if (ctx.action === 'build') {
        const built = CARDS[ctx.card];
        if (t.colors && !(built.color === 'any' || t.colors.includes(built.color))) return false;
        if (t.fromArchive && ctx.source !== 'archive') return false;
        if (t.level && built.level !== t.level) return false;
    }
    return true;
}

// おまかせの支払い（払えなければ null）。CPU と画面の初期値に使う
export function paymentFor(player, cardId, source, used = []) {
    const card = CARDS[cardId];
    return autoSpend(player.energy, convertersOf(player, used), card.color, costFor(player, card, source));
}

export const formatEnergy = (energy) => COLORS.filter(c => energy[c] > 0).map(c => `${COLOR_NAMES[c]}${energy[c]}`).join('・');

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// 端末から届いた払うエネルギー（{ red: 1, ... }）を検証して、4色そろった形にする。おかしければ null
export function parseEnergy(value) {
    if (value === undefined) return emptyEnergy();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.keys(value).some(key => !COLORS.includes(key))) return null;
    const energy = emptyEnergy();
    for (const c of COLORS) {
        const n = value[c] ?? 0;
        if (!isInt(n, 0, 60)) return null;
        energy[c] = n;
    }
    return energy;
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * players.length);
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            energy: emptyEnergy(), archive: [], built: [STARTING_CARDS[id]], vp: 0
        }));
        this.decks = {};
        this.display = {};
        LEVELS.forEach(level => {
            const deck = shuffle(CARDS.filter(card => card.level === level).map(card => card.id), this.random);
            this.decks[level] = level === 3 ? deck.slice(0, LEVEL3_IN_GAME) : deck;
            this.display[level] = this.decks[level].splice(0, DISPLAY_SLOTS[level]);
        });
        this.dispenser = Object.fromEntries(COLORS.map(c => [c, ENERGY_PER_COLOR]));
        this.row = Array.from({ length: ROW_SIZE }, () => this.drawFromDispenser());

        this.startPlayer = this.options.startPlayer;
        this.current = this.startPlayer;
        this.turn = 1;              // 何手番目か（1から）
        this.phase = 'action';      // action：行動を選ぶ / research：研究で引いたカードを選ぶ / chain：働いたギズモを使う / end：終わり
        this.used = [];             // この手番に使ったギズモ
        this.pending = [];          // 働いて、使われるのを待っているギズモ { gizmo, left }（left は「2回取る」の残り）
        this.research = null;       // 研究で引いたカード { level, cards }
        this.finalRound = false;
        this.passStreak = 0;
        this.winners = [];
        this.endReason = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}の手番から始めます`);
    }

    get currentPlayer() {
        return this.players[this.current];
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            action: { file: this.fileAction, pick: this.pickAction, build: this.buildAction, research: this.researchAction, pass: this.pass },
            research: { researchBuild: this.researchBuild, researchFile: this.researchFile, researchSkip: this.researchSkip },
            chain: { use: this.use, stop: this.stop }
        }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        const done = handler.call(this, playerId, command);
        if (!done) return false;
        this.settle();
        // 記録するのは決まった項目だけ（端末から余計な項目が届いても残さない）
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 手番の行動 ----

    // { type: 'file', card: id }
    fileAction(seat, { card }) {
        const reason = this.fileProblem(seat, card);
        if (reason) return this.fail(reason);
        this.passStreak = 0;
        this.doFile(seat, card, this.findOnDisplay(card));
        return true;
    }

    // { type: 'pick', slot: 0〜5 }
    pickAction(seat, { slot }) {
        const reason = this.pickProblem(seat, slot);
        if (reason) return this.fail(reason);
        this.passStreak = 0;
        this.doPick(seat, slot);
        return true;
    }

    // { type: 'build', card: id, spend: { red: 2, ... } }。spend を省くと、おまかせで払う
    buildAction(seat, { card, spend }) {
        const player = this.players[seat];
        const from = this.findOnDisplay(card) ?? (player.archive.includes(card) ? { archive: true } : null);
        if (!from) return this.fail('そのギズモは建てられません');
        const paid = this.checkPayment(player, card, from.archive ? 'archive' : 'display', spend);
        if (!paid) return false;
        this.passStreak = 0;
        this.doBuild(seat, card, from, paid.spend, paid.converters);
        return true;
    }

    // { type: 'research', level: 1〜3 }
    researchAction(seat, { level }) {
        const reason = this.researchProblem(seat, level);
        if (reason) return this.fail(reason);
        this.passStreak = 0;
        this.startResearch(seat, level);
        return true;
    }

    // どの行動もできないときだけ、何もせずに手番を終える
    pass(seat) {
        if (this.hasAnyAction(seat)) return this.fail('できる行動があるときは、パスできません');
        this.passStreak++;
        this.emit({ type: 'pass', seat });
        this.log(`${this.players[seat].name}はできることがなく、パスしました`);
        return true;
    }

    // ---- 研究で引いたカード ----

    // { type: 'researchBuild', card: id, spend }
    researchBuild(seat, { card, spend }) {
        if (!this.research.cards.includes(card)) return this.fail('そのギズモは引いていません');
        const paid = this.checkPayment(this.players[seat], card, 'research', spend);
        if (!paid) return false;
        const level = this.endResearch(card);
        this.doBuild(seat, card, { research: level }, paid.spend, paid.converters);
        return true;
    }

    // { type: 'researchFile', card: id }
    researchFile(seat, { card }) {
        if (!this.research.cards.includes(card)) return this.fail('そのギズモは引いていません');
        const reason = this.archiveProblem(seat);
        if (reason) return this.fail(reason);
        const level = this.endResearch(card);
        this.doFile(seat, card, { research: level });
        return true;
    }

    researchSkip(seat) {
        this.endResearch(null);
        this.log(`${this.players[seat].name}は研究したギズモを取りませんでした`);
        return true;
    }

    // ---- 連鎖：働いたギズモを使う ----

    // { type: 'use', gizmo: id, slot?（取る）, card?（保管・建てる）, level?（研究） }
    use(seat, command) {
        const entry = this.pending.find(p => p.gizmo === command.gizmo);
        if (!entry) return this.fail('そのギズモは今は使えません');
        const player = this.players[seat];
        const card = CARDS[entry.gizmo];
        const effect = card.effect;
        let reason = this.useProblem(seat, entry);
        if (!reason && effect.kind === 'pick') reason = this.pickProblem(seat, command.slot);
        if (!reason && effect.kind === 'file') reason = this.fileProblem(seat, command.card);
        if (!reason && effect.kind === 'research') reason = this.researchProblem(seat, command.level);
        if (!reason && effect.kind === 'freeBuild') reason = this.freeBuildProblem(seat, command.card);
        if (reason) return this.fail(reason);

        // ここから状態を変える
        if (!this.used.includes(entry.gizmo)) this.used.push(entry.gizmo);
        this.emit({ type: 'activate', seat, gizmo: entry.gizmo, effect: effect.kind });
        if (effect.kind === 'pick' && effect.amount === 2 && entry.left === 2) entry.left = 1;
        else this.pending = this.pending.filter(p => p !== entry);
        switch (effect.kind) {
            case 'draw': this.doDraw(seat, effect.amount, entry.gizmo); break;
            case 'vp':
                player.vp += effect.amount;
                this.emit({ type: 'vp', seat, amount: effect.amount, gizmo: entry.gizmo });
                this.log(`${player.name}が得点チップを${effect.amount}点もらいました`);
                break;
            case 'pick': this.doPick(seat, command.slot); break;
            case 'file': this.doFile(seat, command.card, this.findOnDisplay(command.card)); break;
            case 'research': this.startResearch(seat, command.level); break;
            case 'freeBuild': {
                const from = this.findOnDisplay(command.card) ?? { archive: true };
                this.doBuild(seat, command.card, from, emptyEnergy(), [], true);
                break;
            }
        }
        return true;
    }

    // 残りの働いたギズモを使わずに、手番を終える
    stop() {
        this.pending = [];
        return true;
    }

    // ---- 行動の中身（判定は済んでいる） ----

    doFile(seat, cardId, from) {
        const player = this.players[seat];
        this.takeFrom(cardId, from);
        player.archive.push(cardId);
        this.emit({ type: 'file', seat, card: cardId, from });
        this.log(`${player.name}がギズモを保管しました（${describeCard(cardId)}）`);
        this.queueTriggers(seat, { action: 'file' });
    }

    doPick(seat, slot) {
        const player = this.players[seat];
        const color = this.row[slot];
        player.energy[color]++;
        const refill = this.drawFromDispenser();
        this.row[slot] = refill;
        this.emit({ type: 'pick', seat, slot, color, refill });
        this.log(`${player.name}が${COLOR_NAMES[color]}のエネルギーを取りました`);
        this.queueTriggers(seat, { action: 'pick', color });
    }

    // ディスペンサーからランダムに引く（エネルギーの上限まで）
    doDraw(seat, amount, gizmo) {
        const player = this.players[seat];
        const drawn = [];
        for (let i = 0; i < amount; i++) {
            if (countEnergy(player.energy) >= limitsOf(player).storage) break;
            const color = this.drawFromDispenser();
            if (!color) break;
            player.energy[color]++;
            drawn.push(color);
        }
        this.emit({ type: 'draw', seat, colors: drawn, gizmo });
        this.log(drawn.length > 0
            ? `${player.name}がエネルギーを引きました（${drawn.map(c => COLOR_NAMES[c]).join('・')}）`
            : `${player.name}はエネルギーを引けませんでした`);
    }

    doBuild(seat, cardId, from, spend, converters, free = false) {
        const player = this.players[seat];
        this.takeFrom(cardId, from);
        COLORS.forEach(c => {
            player.energy[c] -= spend[c];
            this.dispenser[c] += spend[c];
        });
        converters.forEach(id => { if (!this.used.includes(id)) this.used.push(id); });
        player.built.push(cardId);
        const source = from.archive ? 'archive' : from.research ? 'research' : 'display';
        this.emit({ type: 'build', seat, card: cardId, from, spend: { ...spend }, converters: [...converters], free });
        if (converters.length > 0) converters.forEach(id => this.emit({ type: 'activate', seat, gizmo: id, effect: 'convert' }));
        this.log(`${player.name}がギズモを建てました（${describeCard(cardId)}${free ? '・無料' : ''}）`);
        // 建てた行動では、建てたギズモ自身は働かない
        this.queueTriggers(seat, { action: 'build', card: cardId, source }, cardId);
    }

    startResearch(seat, level) {
        const player = this.players[seat];
        const count = Math.min(limitsOf(player).research, this.decks[level].length);
        this.research = { level, cards: this.decks[level].splice(0, count) };
        this.phase = 'research';
        this.emit({ type: 'research', seat, level, count });
        this.log(`${player.name}がレベル${level}の山札を${count}枚研究しています`);
    }

    // 研究を終える。選んだカード以外は、山札の下に戻す。研究した山札のレベルを返す
    endResearch(chosen) {
        const { level, cards } = this.research;
        this.decks[level].push(...cards.filter(id => id !== chosen));
        this.research = null;
        this.phase = 'action';
        return level;
    }

    // 働くギズモを、待ちの列に足す（使ったものと、すでに待っているものは除く）
    queueTriggers(seat, ctx, exclude = null) {
        this.players[seat].built.forEach(id => {
            if (id === exclude || this.used.includes(id)) return;
            if (this.pending.some(p => p.gizmo === id)) return;
            const card = CARDS[id];
            if (!triggerMatches(card, ctx)) return;
            this.pending.push({ gizmo: id, left: card.effect.kind === 'pick' ? card.effect.amount : null });
            this.emit({ type: 'trigger', seat, gizmo: id });
        });
    }

    // 操作のあとの片付け：待っているギズモのうち、選ぶ余地のないもの（得点、空きが十分ある引く）を自動で使う
    // 選ぶものが残れば chain で待つ。使えるものがなければ手番を終える
    settle() {
        for (let guard = 0; guard < 200; guard++) {
            if (this.phase === 'research' || this.phase === 'end') return;
            const usable = this.usablePending();
            if (usable.length === 0) {
                this.pending = [];
                this.endTurn();
                return;
            }
            const auto = usable.find(entry => this.isAutoNow(entry, usable));
            if (auto) {
                this.use(this.current, { type: 'use', gizmo: auto.gizmo });
                continue;
            }
            this.phase = 'chain';
            return;
        }
        throw new Error('連鎖が終わりません');
    }

    // 自動で使ってよいか：得点はいつも。引くは、エネルギーの空きが、待っている引く・取るの合計以上あるとき
    // （空きが足りないときは、どれを先に使うかで結果が変わるので、本人に選ばせる）
    isAutoNow(entry, usable) {
        const effect = CARDS[entry.gizmo].effect;
        if (effect.kind === 'vp') return true;
        if (effect.kind !== 'draw') return false;
        const player = this.currentPlayer;
        const room = limitsOf(player).storage - countEnergy(player.energy);
        const wanted = usable.reduce((sum, e) => {
            const kind = CARDS[e.gizmo].effect.kind;
            if (kind === 'draw') return sum + CARDS[e.gizmo].effect.amount;
            if (kind === 'pick') return sum + (e.left ?? 1);
            return sum;
        }, 0);
        return room >= wanted;
    }

    usablePending() {
        return this.pending.filter(entry => !this.useProblem(this.current, entry));
    }

    // そのギズモの効果を、今使えるか（相手を選ぶ前の判定）。使えなければ理由
    useProblem(seat, entry) {
        const player = this.players[seat];
        const effect = CARDS[entry.gizmo].effect;
        switch (effect.kind) {
            case 'draw':
                if (countEnergy(player.energy) >= limitsOf(player).storage) return 'エネルギーが上限です';
                if (countEnergy(this.dispenser) === 0) return 'ディスペンサーが空です';
                return null;
            case 'vp': return null;
            case 'pick':
                if (countEnergy(player.energy) >= limitsOf(player).storage) return 'エネルギーが上限です';
                if (this.row.every(c => c === null)) return '列にエネルギーがありません';
                return null;
            case 'file':
                return this.archiveProblem(seat) ?? (this.displayCards().length === 0 ? '場にギズモがありません' : null);
            case 'research':
                if (isBlocked(player, 'research')) return 'もう研究できません';
                return LEVELS.some(l => this.decks[l].length > 0) ? null : '山札がありません';
            case 'freeBuild':
                return this.freeBuildTargets(seat).length > 0 ? null : '建てられるレベル1のギズモがありません';
            default: return '使えません';
        }
    }

    endTurn() {
        const seat = this.current;
        const player = this.players[seat];
        if (!this.finalRound && (player.built.length >= END_GIZMOS || level3Count(player) >= END_LEVEL3)) {
            this.finalRound = true;
            this.log(player.built.length >= END_GIZMOS
                ? `${player.name}が${END_GIZMOS}枚建てました。この巡で終わりです`
                : `${player.name}がレベル3を${END_LEVEL3}枚建てました。この巡で終わりです`);
            this.emit({ type: 'finalRound', seat });
        }
        const next = (seat + 1) % this.players.length;
        this.used = [];
        this.pending = [];
        if (this.finalRound && next === this.startPlayer) return this.endGame('gizmos');
        if (this.passStreak >= this.players.length) return this.endGame('stalled');
        this.current = next;
        this.turn++;
        this.phase = 'action';
        this.emit({ type: 'turn', seat: next });
    }

    endGame(reason) {
        this.phase = 'end';
        this.endReason = reason;
        this.winners = [rankPlayers(this.players, this.startPlayer)[0].id];
        this.emit({ type: 'end', winners: [...this.winners] });
        if (reason === 'stalled') this.log('全員ができることがなくなったので、ここで終わります');
        this.log(`${this.players[this.winners[0]].name}の勝ちです`);
    }

    // ---- 判定（状態を変えない） ----

    archiveProblem(seat) {
        const player = this.players[seat];
        if (isBlocked(player, 'file')) return 'もう保管できません';
        if (player.archive.length >= limitsOf(player).archive) return '保管庫がいっぱいです';
        return null;
    }

    fileProblem(seat, card) {
        return this.archiveProblem(seat) ?? (this.findOnDisplay(card) ? null : 'そのギズモは場にありません');
    }

    pickProblem(seat, slot) {
        const player = this.players[seat];
        if (!isInt(slot, 0, ROW_SIZE - 1) || this.row[slot] === null) return 'そのエネルギーは取れません';
        if (countEnergy(player.energy) >= limitsOf(player).storage) return 'エネルギーが上限です';
        return null;
    }

    researchProblem(seat, level) {
        if (isBlocked(this.players[seat], 'research')) return 'もう研究できません';
        if (!LEVELS.includes(level)) return '山札が正しくありません';
        if (this.decks[level].length === 0) return 'その山札はもうありません';
        return null;
    }

    freeBuildTargets(seat) {
        const player = this.players[seat];
        return [...this.displayCards(), ...player.archive].filter(id => CARDS[id].level === 1);
    }

    freeBuildProblem(seat, card) {
        return this.freeBuildTargets(seat).includes(card) ? null : 'レベル1のギズモを選んでください';
    }

    // 払い方を確かめる。よければ { spend, converters }、だめなら lastError に理由を入れて null
    checkPayment(player, cardId, source, spendValue) {
        const card = CARDS[cardId];
        const need = costFor(player, card, source);
        const converters = convertersOf(player, this.used);
        if (spendValue === undefined) {
            const auto = paymentFor(player, cardId, source, this.used);
            if (!auto) {
                this.fail('エネルギーが足りません');
                return null;
            }
            return auto;
        }
        const spend = parseEnergy(spendValue);
        if (!spend) {
            this.fail('払うエネルギーが正しくありません');
            return null;
        }
        const used = checkSpend(player.energy, spend, converters, card.color, need);
        if (!used) {
            this.fail('その払い方では建てられません');
            return null;
        }
        return { spend, converters: used };
    }

    // 手番の行動（パス以外）が1つでもできるか
    hasAnyAction(seat) {
        const player = this.players[seat];
        if (!this.archiveProblem(seat) && this.displayCards().length > 0) return true;
        if (this.row.some(c => c !== null) && countEnergy(player.energy) < limitsOf(player).storage) return true;
        if (LEVELS.some(level => !this.researchProblem(seat, level))) return true;
        return this.buildOptions(seat).length > 0;
    }

    // 今建てられるギズモ（場と保管庫）{ card, source }
    buildOptions(seat) {
        const player = this.players[seat];
        return [
            ...this.displayCards().map(card => ({ card, source: 'display' })),
            ...player.archive.map(card => ({ card, source: 'archive' }))
        ].filter(({ card, source }) => paymentFor(player, card, source, this.used) !== null);
    }

    // ---- 道具 ----

    findOnDisplay(cardId) {
        if (cardId === null || cardId === undefined) return null;
        for (const level of LEVELS) {
            const slot = this.display[level].indexOf(cardId);
            if (slot >= 0) return { level, slot };
        }
        return null;
    }

    displayCards() {
        return LEVELS.flatMap(level => this.display[level].filter(id => id !== null));
    }

    // 場・保管庫・研究から取り除く。場なら山札から補充する
    takeFrom(cardId, from) {
        if (from.archive) {
            const player = this.currentPlayer;
            player.archive.splice(player.archive.indexOf(cardId), 1);
        } else if (from.level) {
            this.display[from.level][from.slot] = null;
            if (this.decks[from.level].length > 0) {
                const card = this.decks[from.level].shift();
                this.display[from.level][from.slot] = card;
                this.emit({ type: 'refill', level: from.level, slot: from.slot, card });
            }
        }
    }

    // ディスペンサーからランダムに1個。空なら null
    drawFromDispenser() {
        const total = countEnergy(this.dispenser);
        if (total === 0) return null;
        let r = Math.floor(this.random() * total);
        for (const c of COLORS) {
            if (r < this.dispenser[c]) {
                this.dispenser[c]--;
                return c;
            }
            r -= this.dispenser[c];
        }
        return null;
    }

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

// 選ぶ必要のない効果（自動で使う）
export const isAutomatic = (effect) => effect.kind === 'draw' || effect.kind === 'vp';

// 順位：点・建てた枚数・残りのエネルギー・最初の手番の人から遠い順
export function rankPlayers(players, startPlayer) {
    const n = players.length;
    return [...players].sort((a, b) => (pointsOf(b) - pointsOf(a))
        || (b.built.length - a.built.length)
        || (countEnergy(b.energy) - countEnergy(a.energy))
        || (((b.id - startPlayer + n) % n) - ((a.id - startPlayer + n) % n)));
}

// ログ用の短い説明（色・レベル・点）
export function describeCard(id) {
    const card = CARDS[id];
    const color = card.color === 'any' ? '全色' : COLOR_NAMES[card.color];
    return `${color}・レベル${card.level}・${TYPE_NAMES[card.type]}`;
}
