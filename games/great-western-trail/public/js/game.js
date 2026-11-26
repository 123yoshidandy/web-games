/**
 * グレート・ウエスタン・トレイルのゲーム（操作の入口と記録）
 * 操作はすべて applyCommand(seat, command) を通す。写しの状態で試し、通ったときだけ差し替えるので、断った操作は状態を変えない
 * 受け付けた操作だけを commands に記録し、Game.replay で同じ状態を作り直せる
 */

import { MIN_PLAYERS, MAX_PLAYERS } from './data.js';
import { createState, doCommand, clone, RuleError, COMMAND_FIELDS, currentSeat, ranking } from './rules.js';

export { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS };

const MAX_LOGS = 400;

// 記録する項目だけを残す（オンラインで余計なものを送られても、記録が膨らまないように）
function sanitize(command) {
    const result = { type: command.type };
    for (const field of COMMAND_FIELDS[command.type]) {
        let value = command[field];
        if (value === undefined) continue;
        if (Array.isArray(value)) value = value.slice(0, 12).map(v => (typeof v === 'object' ? null : v));
        else if (value !== null && typeof value === 'object') continue;
        else if (typeof value === 'string') value = value.slice(0, 40);
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
        this.log(null, `${this.state.players[this.state.first].name}から始める`);
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    // isCPU は今の席から取る（オンライン対戦で部屋を出た人の席は、途中から CPU になる）
    persist() {
        const players = this.setup.map((p, i) => ({ ...p, isCPU: !!this.players[i]?.isCPU }));
        return { players, options: this.options, commands: structuredClone(this.commands) };
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

    log(seat, text) {
        if (!text) return;
        this.logs.push({ seq: ++this.seq, seat, text, round: this.state.round });
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
        const out = { text: '', notes: [], logs: [] };
        try {
            doCommand(next, seat, clean, out);
        } catch (error) {
            if (error instanceof RuleError) {
                this.lastError = error.message;
                return false;
            }
            throw error;
        }
        this.state = next;
        this.commands.push({ seat, command: clean });
        this.log(seat, out.text || out.notes.join('・'));
        out.logs.forEach(l => this.log(l.seat, l.text));
        return true;
    }

    // 最後の結果（順位と得点の内訳）
    results() {
        return ranking(this.state).map(r => ({ ...r, name: this.state.players[r.seat].name }));
    }
}
