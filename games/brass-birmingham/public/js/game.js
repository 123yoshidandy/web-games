/**
 * ブラス：バーミンガムのゲーム（操作の入口と記録）
 * 操作はすべて applyCommand(seat, command) を通す。写しの状態で試し、通ったときだけ差し替えるので、断った操作は状態を変えない
 * 受け付けた操作だけを commands に記録し、Game.replay で同じ状態を作り直せる
 */

import { MIN_PLAYERS, MAX_PLAYERS } from './data.js';
import {
    createState, doAction, afterAction, clone, RuleError, COMMAND_FIELDS, currentSeat, ranking, incomeLevel, eraPoints
} from './rules.js';

export { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS };

const MAX_LOGS = 400;

// 記録する項目だけを残す（オンラインで余計なものを送られても、記録が膨らまないように）
function sanitize(command) {
    const fields = COMMAND_FIELDS[command.type];
    const result = { type: command.type };
    for (const field of fields) {
        if (command[field] === undefined) continue;
        let value = command[field];
        if (field === 'sales' && Array.isArray(value)) {
            value = value.slice(0, 12).map(s => ({ slot: s?.slot, merchant: s?.merchant, ...(s?.develop ? { develop: s.develop } : {}) }));
        } else if (Array.isArray(value)) {
            value = value.slice(0, 3);
        }
        result[field] = value;
    }
    return result;
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
            throw new Error(`人数は ${MIN_PLAYERS}〜${MAX_PLAYERS} 人です`);
        }
        this.setup = players.map(p => ({ name: String(p.name ?? ''), isCPU: !!p.isCPU }));
        this.options = { seed: (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0 };
        this.state = createState(this.setup, this.options.seed);
        this.commands = [];
        this.logs = [];
        this.seq = 0;
        this.lastError = null;
        this.log(null, `運河の時代が始まった（順番：${this.state.order.map(s => this.state.players[s].name).join('→')}）`);
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    persist() {
        return { players: this.setup, options: this.options, commands: this.commands };
    }

    get players() {
        return this.state.players;
    }

    get turn() {
        return currentSeat(this.state);
    }

    isOver() {
        return this.state.phase === 'over';
    }

    get winners() {
        return this.state.winners;
    }

    log(seat, text, marks = null, when = this.state) {
        this.logs.push({ seq: ++this.seq, seat, text, era: when.era, round: when.round, ...(marks ? { marks } : {}) });
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
            this.lastError = '知らない操作です';
            return false;
        }
        const clean = sanitize(command);
        const next = clone(this.state);
        const out = { text: '', logs: [], marks: { slots: [], links: [] }, used: {} };
        try {
            doAction(next, seat, clean, out);
            const actionMarks = { slots: [...out.marks.slots], links: [...out.marks.links] };
            const when = { era: next.era, round: next.round };
            afterAction(next, out);
            this.state = next;
            this.commands.push({ seat, command: clean });
            this.log(seat, out.text, actionMarks, when);
            out.logs.forEach(l => this.log(l.seat, l.text));
            return true;
        } catch (error) {
            if (error instanceof RuleError) {
                this.lastError = error.message;
                return false;
            }
            throw error;
        }
    }

    // 最後の結果（順位・得点・収入・お金と、時代ごとの得点の内訳）
    results() {
        return ranking(this.state).map(r => ({
            ...r,
            name: this.state.players[r.seat].name,
            eras: this.state.scores.map(s => s.points[r.seat])
        }));
    }

    incomeOf(seat) {
        return incomeLevel(this.state.players[seat].incomeSpace);
    }

    eraPointsOf(seat) {
        return eraPoints(this.state, seat);
    }
}
