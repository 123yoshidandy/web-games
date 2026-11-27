/**
 * スピリット・アイランドの対局（DOM に依存しない）
 * 操作はすべて applyCommand(seat, command) に通し、通った操作だけを記録する。Game.replay で同じ局面を作り直せる
 * 精霊フェイズと力のフェイズは、全員が同時に進める（actors() が、今操作を待っている席の一覧）
 * 侵略者フェイズとターンの終わりは、全員がそろった時点で自動で進む
 */

import { createRandom } from './random.js';
import { MIN_PLAYERS, MAX_PLAYERS, SPIRIT_KEYS, LEVELS } from './data.js';
import { createState, firstExplore, validate, execute, COMMAND_FIELDS } from './rules.js';

export { MIN_PLAYERS, MAX_PLAYERS, COMMAND_FIELDS };

const MAX_LOGS = 400;

// 精霊の割り当て：知らない名前や重なりがあれば、決まった順で埋める
export function normalizeSpirits(count, spirits) {
    const list = Array.isArray(spirits) ? spirits.filter(k => SPIRIT_KEYS.includes(k)) : [];
    const unique = [...new Set(list)].slice(0, count);
    SPIRIT_KEYS.forEach(k => { if (unique.length < count && !unique.includes(k)) unique.push(k); });
    return unique;
}

// 端末から届いた操作から、決まった項目だけを取り出す
export function sanitizeCommand(command) {
    if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return null;
    const out = { type: command.type };
    COMMAND_FIELDS[command.type].forEach(key => {
        if (command[key] !== undefined && command[key] !== null) out[key] = command[key];
    });
    if (out.cards) out.cards = Array.isArray(out.cards) ? out.cards.slice(0, 12) : out.cards;
    return out;
}

export default class Game {
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数が正しくありません');
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `${id + 1}P`), isCPU: !!p.isCPU }));
        this.options = {
            seed: (options.seed ?? 1) >>> 0,
            level: Object.hasOwn(LEVELS, options.level) ? options.level : 'normal',
            spirits: normalizeSpirits(players.length, options.spirits)
        };
        this.random = createRandom(this.options.seed);
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.s = createState(this.players, this.options, this.random);
        const ctx = this.ctx();
        ctx.log('― 準備 ―', 'phase');
        firstExplore(ctx);
        ctx.log('― 1ターン目 ―', 'phase');
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ seat, command }) => {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        });
        return game;
    }

    ctx() {
        return {
            s: this.s,
            random: this.random,
            log: (text, kind = 'info') => {
                this.logTotal++;
                this.logs.push({ n: this.logTotal, turn: this.s.turn, text, kind });
                if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
            },
            event: (e) => {
                this.eventSeq++;
                this.events.push({ seq: this.eventSeq, ...e });
            }
        };
    }

    // 操作を通す。通らなければ false を返し、状態は変えない（理由は lastError）
    applyCommand(seat, command) {
        const cmd = sanitizeCommand(command);
        if (!cmd) {
            this.lastError = '知らない操作です';
            return false;
        }
        if (!Number.isInteger(seat) || !this.s.spirits[seat]) {
            this.lastError = 'その席はありません';
            return false;
        }
        const error = validate(this.s, seat, cmd);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.lastError = null;
        this.events = [];
        execute(this.ctx(), seat, cmd);
        this.commands.push({ seat, command: cmd });
        return true;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: { ...this.options },
            commands: this.commands.map(c => ({ seat: c.seat, command: JSON.parse(JSON.stringify(c.command)) }))
        };
    }

    isOver() {
        return !!this.s.result;
    }

    get result() {
        return this.s.result;
    }

    // 今操作を待っている席
    actors() {
        const s = this.s;
        if (s.result) return [];
        if (s.phase === 'spirit') return s.spirits.filter(sp => sp.step === 'growth' || sp.prompt || sp.step === 'play').map(sp => sp.seat);
        if (s.phase === 'fast' || s.phase === 'slow') return s.spirits.filter(sp => !sp.done).map(sp => sp.seat);
        return [];
    }
}
