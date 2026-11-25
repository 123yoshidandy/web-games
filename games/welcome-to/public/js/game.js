/**
 * ウェルカム・トゥ（基本ゲーム。ラウンドアバウトと上級の都市計画なし）の進行（1〜6人）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（カードの並びはシードから決まる）
 *
 * ルール（公式のルールブックどおり）
 * - 家番号のカード81枚を27枚ずつ3つの山にする。毎手、各山の上のカードをめくって横に置く。
 *   めくったカードの裏（効果）と、山の新しい一番上（番号）が、1つの組み合わせになる。全員が同時に、3つから1つを選ぶ
 * - 番号は、3本の通りのどこかの空いた家に書く。通りの中では、左から右へ大きくなる（同じ番号は書けない。間は空けてよい）
 * - 書けなければ、断り（建築許可の却下）を1つ消す。そのときは効果も使えない
 * - 効果（使うかは選べる）：測量士（フェンス）・不動産屋（家並みの値）・造園家（公園）・プール業者（プール）・派遣（番号を ±1・±2）・ビス（隣の番号の複製）
 * - 都市計画（n°1〜3 から1枚ずつ）：条件の家並みをそろえたら達成できる。最初の手に達成した人は高い点、それより後は低い点
 *   計画に使った家並みは、ほかの計画に使えず、フェンスで分けられない
 * - 最初の都市計画が達成されたとき、達成した人は、カード81枚を切り直してもらえる
 * - 誰かが、断りを3つ消す・都市計画を3つ達成する・家を全部建てる、のどれかをした手で終わる
 * 1人のとき（公式の1人用の変種）
 * - 81枚を1つの山にし、後半に1人用のカードを混ぜる。毎手3枚をめくり、1枚の番号と、別の1枚の効果を使う
 * - 1人用のカードが出たら、都市計画はどれも低い点になる。山がなくなっても終わる。派遣は6人以上で7点
 *
 * 自分で決めた点
 * - 公園・プール・派遣は、選んだ組み合わせで建てたときに自動で消す（得しかないため）。派遣は、番号を変えなくても1人と数える
 * - その手に書いたものは、手を終えるまで取り消せる
 * - 都市計画に使う家並みは、自動で選ぶ（まだ使っていないものから、上の通りの左から）
 */

import { createRandom, shuffle } from './random.js';
import {
    CARDS, SOLO_CARD, PLANS, EFFECT_NAMES, MAX_NUMBER, MAX_REFUSALS, TEMP_SCORES, SOLO_TEMP_NEED
} from './cards.js';
import {
    createSheet, cloneSheet, canWrite, writableHouses, bisSpots, canFence, canRaiseEstate, canAddPark, isPoolSpot,
    planEstates, writeHouse, markPlan, sheetScore, isFull
} from './sheet.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
// 操作の種類ごとに、記録する項目
// build：num（番号に使うカード）・eff（効果に使うカード）・value（書く番号）・street・house
// effect：測量士は street・pos（家 pos と pos+1 の間）、不動産屋は size、ビスは street・pos（家）・value（写す番号）
// plan：plan（0〜2）・reshuffle（最初の達成で、カードを切り直してもらうか）
export const COMMAND_FIELDS = {
    build: ['num', 'eff', 'value', 'street', 'house'],
    effect: ['street', 'pos', 'size', 'value'],
    plan: ['plan', 'reshuffle'],
    refuse: [],
    undo: [],
    end: []
};
// 選んで使う効果（ほかは建てたときに自動）
export const CHOICE_EFFECTS = ['surveyor', 'estate', 'bis'];
const MAX_LOGS = 300;
const isInt = (v) => Number.isInteger(v);

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, level }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed, level: options.level === 'easy' ? 'easy' : 'normal' };
        this.random = createRandom(seed);
        this.solo = players.length === 1;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            sheet: createSheet(),
            plans: [null, null, null],     // 達成した計画：{ turn, points }
            start: null,                   // この手のはじめの紙（取り消し用）
            turn: null,                    // この手にしたこと
            log: [],                       // この手の操作（取り消し用）
            done: false
        }));
        // 都市計画：n°1〜3 から1枚ずつ
        this.plans = [1, 2, 3].map(stack => {
            const list = PLANS.filter(p => p.stack === stack);
            return list[Math.floor(this.random() * list.length)].id;
        });
        this.planClaimed = [false, false, false];   // 前の手までに誰かが達成したか
        this.approved = false;                      // 1人用のカードが出た（計画はどれも低い点）
        this.reshuffled = false;                    // 最初の達成で切り直したか（1度だけ）
        this.turnNo = 0;
        this.phase = 'play';
        this.results = null;
        this.winners = [];
        this.endReason = null;
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.setupDeck();
        this.startTurn();
    }

    setupDeck() {
        const ids = shuffle(CARDS.map(c => c.id), this.random);
        if (this.solo) {
            // 2つの山に分け、1人用のカードを片方に混ぜて、もう片方の下に置く（引く順の後半に入る）
            const top = ids.slice(0, 40);
            const bottom = shuffle([...ids.slice(40), SOLO_CARD], this.random);
            this.deck = [...top, ...bottom];
            this.drawn = [];
        } else {
            this.stacks = [ids.slice(0, 27), ids.slice(27, 54), ids.slice(54)];
            this.discard = [];
            this.shown = [null, null, null];   // { effect: カード, number: カード }
        }
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人（全員が同時に進める）
    actors() {
        if (this.phase === 'end') return [];
        return this.players.filter(p => !p.done).map(p => p.id);
    }

    // 今の手の組み合わせ：{ num, eff, n, e }（num・eff はカードの位置）
    combos() {
        if (this.solo) {
            const list = [];
            this.drawn.forEach((_, i) => this.drawn.forEach((__, j) => {
                if (i !== j) list.push({ num: i, eff: j, n: CARDS[this.drawn[i]].n, e: CARDS[this.drawn[j]].e });
            }));
            return list;
        }
        return this.shown.map((s, i) => ({ num: i, eff: i, n: CARDS[s.number].n, e: CARDS[s.effect].e }));
    }

    combo(num, eff) {
        return this.combos().find(c => c.num === num && c.eff === eff) ?? null;
    }

    // 組み合わせで書ける番号（派遣なら ±2 まで）
    static values(combo) {
        if (combo.e !== 'temp') return [combo.n];
        return [-2, -1, 0, 1, 2].map(d => combo.n + d).filter(v => v >= 0 && v <= MAX_NUMBER);
    }

    // どの組み合わせでも、どこにも書けないか
    mustRefuse(player) {
        return !this.combos().some(c => Game.values(c).some(v => writableHouses(player.sheet, v).length > 0));
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!this.actors().includes(playerId)) return this.fail('この手はもう終えています');
        const error = this.commandError(this.players[playerId], command);
        if (error) return this.fail(error);
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { recorded[k] = command[k]; });
        this.commands.push({ playerId, command: recorded });
        this.execute(this.players[playerId], recorded);
        return true;
    }

    // ---- 判定（状態を変えない） ----

    commandError(player, command) {
        const t = player.turn;
        const acted = t.built || t.refused;
        switch (command.type) {
            case 'build': {
                if (acted) return 'この手はもう建てました';
                const { num, eff, value, street, house } = command;
                if (![num, eff, value, street, house].every(isInt)) return '建てる場所が正しくありません';
                const combo = this.combo(num, eff);
                if (!combo) return 'その組み合わせは選べません';
                if (!Game.values(combo).includes(value)) return combo.e === 'temp' ? '派遣で変えられるのは ±2 までです' : 'カードの番号を書きます';
                if (!canWrite(player.sheet, street, house, value)) return '通りの番号は、左から右へ大きくなるように書きます';
                return null;
            }
            case 'effect': {
                if (!t.built) return '先に家を建てます';
                const kind = t.built.effect;
                if (!CHOICE_EFFECTS.includes(kind)) return 'この組み合わせに選ぶ効果はありません';
                if (t.effectUsed) return '効果はもう使いました';
                const { street, pos, size, value } = command;
                if (kind === 'surveyor') return isInt(street) && isInt(pos) && canFence(player.sheet, street, pos) ? null : 'そこにはフェンスを立てられません';
                if (kind === 'estate') return canRaiseEstate(player.sheet, size) ? null : 'その家並みの値は、もう上げられません';
                if (!bisSpots(player.sheet).some(b => b.street === street && b.house === pos && b.n === value)) return 'ビスは、隣の家と同じ番号で、フェンスをはさまずに建てます';
                return null;
            }
            case 'plan': {
                if (!acted) return '先に家を建てます';
                const k = command.plan;
                if (!isInt(k) || k < 0 || k > 2) return '都市計画が正しくありません';
                if (player.plans[k] || t.plans.includes(k)) return 'その都市計画はもう達成しました';
                if (!planEstates(player.sheet, PLANS[this.plans[k]])) return '条件の家並みがそろっていません';
                if (command.reshuffle !== undefined && typeof command.reshuffle !== 'boolean') return '操作が正しくありません';
                return null;
            }
            case 'refuse':
                if (acted) return 'この手はもう建てました';
                if (!this.mustRefuse(player)) return 'まだ建てられる家があります';
                return null;
            case 'undo':
                return player.log.length === 0 ? 'この手にしたことはありません' : null;
            case 'end':
                return acted ? null : '先に家を建てます';
            default:
                return '操作が正しくありません';
        }
    }

    // 最初の都市計画の達成で、切り直しを選べるか
    canAskReshuffle() {
        return !this.solo && !this.reshuffled && !this.planClaimed.some(Boolean);
    }

    // ---- 実行 ----

    execute(player, command) {
        if (command.type === 'undo') {
            player.log.pop();
            const rest = player.log;
            player.sheet = cloneSheet(player.start);
            player.turn = Game.blankTurn();
            player.log = [];
            rest.forEach(c => {
                this.run(player, c);
                player.log.push(c);
            });
            this.emit({ type: 'undo', seat: player.id });
            return;
        }
        if (command.type === 'end') {
            player.done = true;
            this.log(this.summary(player));
            this.emit({ type: 'done', seat: player.id });
            if (this.players.every(p => p.done)) this.endTurn();
            return;
        }
        this.run(player, command);
        player.log.push(command);
    }

    static blankTurn() {
        return { built: null, refused: false, effectUsed: false, bisAt: null, plans: [], reshuffle: false };
    }

    run(player, command) {
        const sheet = player.sheet;
        const t = player.turn;
        if (command.type === 'build') {
            const combo = this.combo(command.num, command.eff);
            const { street, house, value } = command;
            writeHouse(sheet, street, house, value);
            t.built = { street, house, value, effect: combo.e, n: combo.n };
            if (combo.e === 'temp') sheet.temps++;
            if (combo.e === 'pool' && isPoolSpot(street, house)) sheet.pools[street][house] = true;
            if (combo.e === 'park' && canAddPark(sheet, street)) sheet.parks[street]++;
            this.emit({ type: 'build', seat: player.id, street, house, value });
        } else if (command.type === 'effect') {
            const kind = t.built.effect;
            if (kind === 'surveyor') sheet.fences[command.street][command.pos] = true;
            if (kind === 'estate') sheet.estates[command.size - 1]++;
            if (kind === 'bis') {
                writeHouse(sheet, command.street, command.pos, command.value, { bis: true });
                sheet.bis++;
                t.bisAt = { street: command.street, house: command.pos };
            }
            t.effectUsed = true;
            this.emit({ type: 'effect', seat: player.id, kind });
        } else if (command.type === 'plan') {
            markPlan(sheet, planEstates(sheet, PLANS[this.plans[command.plan]]));
            t.plans.push(command.plan);
            if (command.reshuffle && this.canAskReshuffle()) t.reshuffle = true;
            this.emit({ type: 'plan', seat: player.id, plan: command.plan });
        } else if (command.type === 'refuse') {
            sheet.refusals++;
            t.refused = true;
            this.emit({ type: 'refuse', seat: player.id });
        }
    }

    summary(player) {
        const t = player.turn;
        const parts = [];
        if (t.refused) parts.push(`建てられず、断りが${player.sheet.refusals}つ目`);
        else {
            const b = t.built;
            parts.push(`${['上', '中', '下'][b.street]}の通りに${b.value}番（${EFFECT_NAMES[b.effect]}）`);
        }
        t.plans.forEach(k => parts.push(`都市計画 n°${k + 1} を達成`));
        return `${player.name}：${parts.join('・')}`;
    }

    startTurn() {
        this.turnNo++;
        if (this.solo) {
            this.drawn = [];
            while (this.drawn.length < 3 && this.deck.length > 0) {
                const id = this.deck.shift();
                if (id === SOLO_CARD) {
                    this.approved = true;
                    this.log('1人用のカードが出ました。都市計画は、どれも低い点になります', { head: true });
                    this.emit({ type: 'solo-card' });
                    continue;
                }
                this.drawn.push(id);
            }
        } else {
            const tops = [];   // この手に捨てた効果のカード（捨て札の一番上）
            for (let i = 0; i < 3; i++) {
                const prev = this.shown[i];
                if (prev) {
                    this.discard.push(prev.effect);
                    tops.push(prev.effect);
                }
                const effect = prev ? prev.number : this.drawCard(i, tops);
                this.shown[i] = { effect, number: this.drawCard(i, tops) };
            }
        }
        this.players.forEach(p => {
            p.start = cloneSheet(p.sheet);
            p.turn = Game.blankTurn();
            p.log = [];
            p.done = false;
        });
        this.emit({ type: 'turn', turn: this.turnNo });
        this.log(this.solo
            ? `第${this.turnNo}手：${this.drawn.map(id => `${CARDS[id].n}（${EFFECT_NAMES[CARDS[id].e]}）`).join('・')}`
            : `第${this.turnNo}手：${this.combos().map(c => `${c.n}と${EFFECT_NAMES[c.e]}`).join('・')}`, { head: true });
    }

    // 山 i から1枚引く。山がなくなったら、表に出ているカードと捨て札の一番上（tops）を残して、ほかを全部切り直す
    drawCard(i, tops = []) {
        if (this.stacks[i].length === 0) {
            const keep = new Set([...this.shown.filter(Boolean).flatMap(s => [s.effect, s.number]), ...tops]);
            const rest = shuffle([...this.discard, ...this.stacks.flat()].filter(id => !keep.has(id)), this.random);
            const third = Math.ceil(rest.length / 3);
            this.stacks = [rest.slice(0, third), rest.slice(third, third * 2), rest.slice(third * 2)];
            this.discard = this.discard.filter(id => keep.has(id));
            this.log('山札がなくなったので、切り直しました');
        }
        return this.stacks[i].pop();
    }

    endTurn() {
        // 都市計画：前の手までに誰も達成していなければ高い点
        let reshuffle = false;
        const firstEver = this.canAskReshuffle();
        for (let k = 0; k < 3; k++) {
            const claimers = this.players.filter(p => p.turn.plans.includes(k));
            if (claimers.length === 0) continue;
            const rank = this.planClaimed[k] || this.approved ? 1 : 0;
            const points = PLANS[this.plans[k]].points[rank];
            claimers.forEach(p => {
                p.plans[k] = { turn: this.turnNo, points };
                if (p.turn.reshuffle) reshuffle = true;
            });
        }
        for (let k = 0; k < 3; k++) if (this.players.some(p => p.turn.plans.includes(k))) this.planClaimed[k] = true;
        if (firstEver && reshuffle) {
            this.reshuffled = true;
            const ids = shuffle(CARDS.map(c => c.id), this.random);
            this.stacks = [ids.slice(0, 27), ids.slice(27, 54), ids.slice(54)];
            this.discard = [];
            this.shown = [null, null, null];
            this.log('最初の都市計画の達成で、カードを切り直しました', { head: true });
        }
        const reason = this.endCheck();
        if (reason) return this.finish(reason);
        this.startTurn();
    }

    endCheck() {
        for (const p of this.players) {
            if (p.sheet.refusals >= MAX_REFUSALS) return `${p.name}の断りが3つになりました`;
            if (p.plans.every(Boolean)) return `${p.name}が都市計画を3つ達成しました`;
            if (isFull(p.sheet)) return `${p.name}の家が全部建ちました`;
        }
        if (this.solo && this.deck.filter(id => id !== SOLO_CARD).length < 3) return '山札がなくなりました';
        return null;
    }

    finish(reason) {
        this.phase = 'end';
        this.endReason = reason;
        this.results = this.scores();
        const best = Math.max(...this.results.map(r => r.total));
        let tied = this.players.filter(p => this.results[p.id].total === best).map(p => p.id);
        // 同点なら、完成した家並みの多い人。それも同じなら、1軒の家並みの多い人、2軒の…
        const keys = [(r) => r.estateCounts.reduce((a, b) => a + b, 0), ...[0, 1, 2, 3, 4, 5].map(i => (r) => r.estateCounts[i])];
        for (const key of keys) {
            const top = Math.max(...tied.map(id => key(this.results[id])));
            tied = tied.filter(id => key(this.results[id]) === top);
        }
        this.winners = tied;
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`ゲーム終了（${reason}）。${this.winners.map(s => this.players[s].name).join('と')}の勝ち（${best}点）`, { head: true });
    }

    // 得点（今のまま終わったときの点）。派遣は、1人以上を雇った人のうち、人数の多い順に 7・4・1点（同数は同じ点）
    scores() {
        const temps = this.players.map(p => p.sheet.temps);
        const ranks = [...new Set(temps.filter(n => n > 0))].sort((a, b) => b - a).slice(0, 3);
        return this.players.map(p => {
            const s = sheetScore(p.sheet);
            const plans = p.plans.reduce((sum, c) => sum + (c ? c.points : 0), 0);
            const temp = this.solo
                ? (p.sheet.temps >= SOLO_TEMP_NEED ? TEMP_SCORES[0] : 0)
                : (ranks.includes(p.sheet.temps) ? TEMP_SCORES[ranks.indexOf(p.sheet.temps)] : 0);
            const total = plans + s.parks + s.pools + temp + s.estates - s.bis - s.refusals;
            return { plans, parks: s.parks, pools: s.pools, temps: temp, estates: s.estates, bis: s.bis, refusals: s.refusals, estateCounts: s.estateCounts, total };
        });
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
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
            options: { ...this.options },
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
}

