/**
 * キャント・ストップのゲーム本体
 * DOM に依存しない。操作は applyCommand(seat, command) の 1 か所から受け付け、受け付けた操作だけを commands に記録する
 * Game.replay(players, options, commands) で、同じ状態を作り直せる（ダイスもシード付きの乱数で振る）
 *
 * 手番の流れ：
 *   roll    ダイスを振る（手番の初めと、進んだあとに続けるとき）。どの組でも進めなければバースト
 *   choose  ダイスの組と、進める列を選ぶ { type: 'move', pair, sums }
 *   decide  続ける（roll）か止める（stop）
 *
 * 操作：{ type: 'roll' } / { type: 'move', pair: 0〜2, sums: [列] か [列, 列] } / { type: 'stop' }
 */

import { createRandom, createSeed } from './random.js';

export const COLUMNS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// 列の長さ（頂上までのマスの数）
export const COLUMN_LENGTH = { 2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 11, 9: 9, 10: 7, 11: 5, 12: 3 };
export const MAX_RUNNERS = 3;
export const COLUMNS_TO_WIN = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
const EVENT_KEEP = 80;

// 4 つのダイスの分け方（組の番号ごとに、2 つずつの添え字）
export const PAIRINGS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

export const pairSums = dice => PAIRINGS.map(([a, b]) => [dice[a[0]] + dice[a[1]], dice[b[0]] + dice[b[1]]]);

/**
 * 進め方の一覧（ルールの中心。ゲーム・CPU・バーストの確率が同じものを使う）
 * position(col)：その列の今の位置（ランナーがあればランナー、なければ自分のマーカー）
 * runners：今のランナー { 列: 位置 }、claimed：取られた列 { 列: 席 | null }
 * 公式のルール：2 つの和の両方で進めるなら、両方とも進む。片方しか進めないならその片方。
 * どちらか片方なら進めるが両方は進めない（ランナーが 1 つしか残っていない）ときは、どちらかを選ぶ
 */
export function moveOptions(dice, { position, runners, claimed }) {
    const options = [];
    const seen = new Set();
    pairSums(dice).forEach((sums, pair) => {
        const add = used => {
            const key = `${pair}:${used.join(',')}`;
            if (seen.has(key)) return;
            seen.add(key);
            options.push({ pair, sums: used });
        };
        if (simulate(sums, position, runners, claimed)) {
            add(sums);
            return;
        }
        // 同じ和が 2 つで、1 マスしか進めないときも、ここで 1 つだけ使う
        const singles = [...new Set(sums)].filter(s => simulate([s], position, runners, claimed));
        singles.forEach(s => add([s]));
    });
    return options;
}

// sums の順に進めたときの、新しいランナーの位置（進めなければ null）
export function simulate(sums, position, runners, claimed) {
    const next = { ...runners };
    for (const col of sums) {
        if (claimed[col] !== null) return null;
        const pos = col in next ? next[col] : position(col);
        if (pos >= COLUMN_LENGTH[col]) return null;
        if (!(col in next) && Object.keys(next).length >= MAX_RUNNERS) return null;
        next[col] = pos + 1;
    }
    return next;
}

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, cpuLevel }（cpuLevel などは記録と一緒に残すだけ）
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は ${MIN_PLAYERS}〜${MAX_PLAYERS} 人です`);
        const seed = (options.seed ?? createSeed()) >>> 0;
        this.options = { ...options, seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: p.name, isCPU: !!p.isCPU, progress: Object.fromEntries(COLUMNS.map(c => [c, 0]))
        }));
        this.claimed = Object.fromEntries(COLUMNS.map(c => [c, null]));
        this.current = Math.floor(this.random() * players.length);
        this.phase = 'roll';
        this.dice = null;
        this.runners = {};
        this.turn = 1;
        this.winner = null;
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ seat, command }, i) => {
            if (!game.applyCommand(seat, command)) throw new Error(`記録の ${i} 番目の操作を再現できません：${game.lastError}`);
        });
        return game;
    }

    isOver() {
        return this.phase === 'end';
    }

    addEvent(event) {
        this.eventSeq++;
        this.events.push({ seq: this.eventSeq, ...event });
        if (this.events.length > EVENT_KEEP) this.events.splice(0, this.events.length - EVENT_KEEP);
    }

    // 手番の人の、列の今の位置（ランナーがあればランナーの位置）
    position(col) {
        return col in this.runners ? this.runners[col] : this.players[this.current].progress[col];
    }

    ruleState() {
        return { position: col => this.players[this.current].progress[col], runners: this.runners, claimed: this.claimed };
    }

    legalMoves() {
        return this.phase === 'choose' ? moveOptions(this.dice, this.ruleState()) : [];
    }

    validate(seat, command) {
        if (!command || typeof command !== 'object') return '操作の形が正しくありません';
        if (this.phase === 'end') return 'ゲームは終わっています';
        if (seat !== this.current) return '手番ではありません';
        switch (command.type) {
            case 'roll':
                return this.phase === 'roll' || this.phase === 'decide' ? null : '今はダイスを振れません';
            case 'stop':
                return this.phase === 'decide' ? null : '今は止められません';
            case 'move': {
                if (this.phase !== 'choose') return '今は進めません';
                if (!Array.isArray(command.sums)) return '進め方が正しくありません';
                const ok = this.legalMoves().some(o => o.pair === command.pair && o.sums.length === command.sums.length && o.sums.every((s, i) => s === command.sums[i]));
                return ok ? null : 'その進め方はできません';
            }
            default:
                return '知らない操作です';
        }
    }

    applyCommand(seat, command) {
        this.lastError = this.validate(seat, command);
        if (this.lastError) return false;
        const clean = command.type === 'move' ? { type: 'move', pair: command.pair, sums: [...command.sums] } : { type: command.type };
        this.commands.push({ seat, command: clean });
        if (clean.type === 'roll') this.roll();
        else if (clean.type === 'move') this.move(clean);
        else this.stop();
        return true;
    }

    roll() {
        const seat = this.current;
        this.dice = [0, 1, 2, 3].map(() => 1 + Math.floor(this.random() * 6));
        this.addEvent({ type: 'roll', seat, dice: [...this.dice] });
        if (moveOptions(this.dice, this.ruleState()).length > 0) {
            this.phase = 'choose';
            return;
        }
        // バースト：この手番の進みをすべて失う
        this.addEvent({ type: 'bust', seat, dice: [...this.dice], lost: { ...this.runners } });
        this.runners = {};
        this.nextPlayer();
    }

    move({ pair, sums }) {
        this.runners = simulate(sums, col => this.players[this.current].progress[col], this.runners, this.claimed);
        this.addEvent({ type: 'move', seat: this.current, pair, sums: [...sums], runners: { ...this.runners } });
        this.phase = 'decide';
    }

    // 止める：ランナーの位置まで自分のマーカーを進め、頂上に着いた列を取る
    stop() {
        const seat = this.current;
        const player = this.players[seat];
        const claimedNow = [];
        Object.entries(this.runners).forEach(([key, pos]) => {
            const col = Number(key);
            player.progress[col] = pos;
            if (pos >= COLUMN_LENGTH[col]) {
                this.claimed[col] = seat;
                claimedNow.push(col);
                // ほかの人のマーカーは、その列から取り除く
                this.players.forEach(p => { if (p.id !== seat) p.progress[col] = 0; });
            }
        });
        this.addEvent({ type: 'stop', seat, runners: { ...this.runners }, claimed: claimedNow });
        this.runners = {};
        if (this.claimedCount(seat) >= COLUMNS_TO_WIN) {
            this.phase = 'end';
            this.dice = null;
            this.winner = seat;
            this.addEvent({ type: 'end', winner: seat });
            return;
        }
        this.nextPlayer();
    }

    claimedCount(seat) {
        return COLUMNS.filter(c => this.claimed[c] === seat).length;
    }

    nextPlayer() {
        this.current = (this.current + 1) % this.players.length;
        this.phase = 'roll';
        this.turn++;
    }
}

// 1 マスでも進める列（取られていない・頂上に着いていない・ランナーがあるか、ランナーが残っている）
export function usableColumns({ position, runners, claimed }) {
    const free = Object.keys(runners).length < MAX_RUNNERS;
    return COLUMNS.filter(c => {
        if (claimed[c] !== null) return false;
        const pos = c in runners ? runners[c] : position(c);
        return pos < COLUMN_LENGTH[c] && (c in runners || free);
    });
}

/**
 * 次に振ったときにバーストする確率（4 つのダイスの 1296 通りを数える）
 * どちらかの和が「進める列」に入れば進めるので、進める列の組だけで決まる。同じ組は覚えておく
 */
const bustCache = new Map();
export function bustChance(state) {
    const cols = usableColumns(state);
    const key = cols.join(',');
    if (bustCache.has(key)) return bustCache.get(key);
    const usable = new Set(cols);
    let bust = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) for (let d = 1; d <= 6; d++) {
        if (!pairSums([a, b, c, d]).some(([x, y]) => usable.has(x) || usable.has(y))) bust++;
    }
    const p = bust / 1296;
    bustCache.set(key, p);
    return p;
}
