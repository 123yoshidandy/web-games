/**
 * スカイチームのゲーム本体（DOM に依存しない）
 * 2人の協力ゲーム：席0が機長、席1が副操縦士。各回、2人とも4個のダイスをひそかに振り、交互に1個ずつ操縦席に置く
 * すべての操作を applyCommand に通し、受け付けた操作だけを commands に記録する（Game.replay で同じ状態に戻せる）
 * ダイスはシード付きの乱数で振る。断る操作は状態を変えない
 */

import { createRandom } from './random.js';
import {
    createBoard, cloneBoard, canPlaceWithReserve, place, endRound, firstSeatOf, SLOT_IDS, SLOTS, AIRPORTS
} from './rules.js';

export const PLAYERS = 2;
export const DICE_PER_PLAYER = 4;

export default class Game {
    // players: [{ name, isCPU }]（2人）、options: { seed, airport, cpuLevel }（cpuLevel はルールに関係しない。CPU の強さを記録と一緒に運ぶだけ）
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('スカイチームは2人で遊びます');
        this.players = players.map((p, id) => ({ id, name: p.name, isCPU: !!p.isCPU }));
        this.options = { seed: options.seed >>> 0, airport: AIRPORTS[options.airport] ? options.airport : 'YUL', cpuLevel: options.cpuLevel ?? 'normal' };
        this.random = createRandom(this.options.seed);
        this.board = createBoard(this.options.airport);
        this.dice = [[], []];
        this.turn = 0;
        this.phase = 'place';
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.emit({ type: 'start', airport: this.options.airport });
        this.startRound();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
    }

    isOver() {
        return this.phase === 'end';
    }

    get won() {
        return this.board.result?.win === true;
    }

    rollDie() {
        return 1 + Math.floor(this.random() * 6);
    }

    startRound() {
        for (let seat = 0; seat < PLAYERS; seat++) {
            this.dice[seat] = Array.from({ length: DICE_PER_PLAYER }, () => ({ value: this.rollDie(), used: false }));
        }
        this.turn = firstSeatOf(this.board.round);
        this.emit({ type: 'roll', round: this.board.round });
    }

    diceLeft(seat) {
        return this.dice[seat].filter(d => !d.used).length;
    }

    // その席のダイス（番号）を、その置き場に、コーヒー delta 個分変えて置けるか
    canPlaceDie(seat, die, slot, delta = 0) {
        const d = this.dice[seat]?.[die];
        if (!d || d.used || !SLOTS[slot]) return false;
        if (!Number.isInteger(delta) || Math.abs(delta) > this.board.coffee) return false;
        return canPlaceWithReserve(this.board, seat, slot, d.value + delta, this.diceLeft(seat));
    }

    // そのダイスを置ける場所があるか（コーヒーで変える分も含めて）
    hasPlacement(seat, die) {
        const c = this.board.coffee;
        for (const slot of SLOT_IDS) {
            for (let delta = -c; delta <= c; delta++) if (this.canPlaceDie(seat, die, slot, delta)) return true;
        }
        return false;
    }

    // 受け付けたら true。断ったら false と lastError（状態は変えない）
    applyCommand(seat, command) {
        this.lastError = null;
        const error = this.check(seat, command);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.commands.push({ seat, command: structuredClone(command) });
        this.execute(seat, command);
        return true;
    }

    check(seat, command) {
        if (this.phase !== 'place') return 'ゲームは終わっています';
        if (!command || typeof command !== 'object') return '操作が正しくありません';
        if (seat !== this.turn) return 'あなたの番ではありません';
        const dice = this.dice[seat];
        if (command.type === 'place') {
            const delta = command.delta ?? 0;
            if (!Number.isInteger(command.die) || !dice[command.die] || dice[command.die].used) return 'そのダイスは置けません';
            if (!SLOTS[command.slot]) return 'その場所はありません';
            if (!Number.isInteger(delta) || Math.abs(delta) > this.board.coffee) return 'コーヒーが足りません';
            const value = dice[command.die].value + delta;
            if (value < 1 || value > 6) return '目は 1〜6 にしか変えられません';
            if (!this.canPlaceDie(seat, command.die, command.slot, delta)) return 'そこには置けません';
            return null;
        }
        if (command.type === 'reroll') {
            if (this.board.rerolls <= 0) return '振り直しのトークンがありません';
            const list = command.dice;
            if (!Array.isArray(list) || list.length === 0) return '振り直すダイスを選んでください';
            if (new Set(list).size !== list.length || list.some(i => !Number.isInteger(i) || !dice[i] || dice[i].used)) return 'そのダイスは振り直せません';
            return null;
        }
        if (command.type === 'discard') {
            if (!Number.isInteger(command.die) || !dice[command.die] || dice[command.die].used) return 'そのダイスはありません';
            if (this.hasPlacement(seat, command.die)) return 'まだ置ける場所があります';
            return null;
        }
        return '操作が正しくありません';
    }

    execute(seat, command) {
        const dice = this.dice[seat];
        if (command.type === 'reroll') {
            this.board.rerolls--;
            command.dice.forEach(i => { dice[i].value = this.rollDie(); });
            this.emit({ type: 'reroll', seat, count: command.dice.length });
            return;
        }
        const die = dice[command.die];
        die.used = true;
        if (command.type === 'discard') {
            this.emit({ type: 'discard', seat, value: die.value });
        } else {
            const delta = command.delta ?? 0;
            const value = die.value + delta;
            this.board.coffee -= Math.abs(delta);
            this.emit({ type: 'place', seat, slot: command.slot, value, delta, round: this.board.round });
            place(this.board, seat, command.slot, value).forEach(e => this.emit(e));
        }
        this.advanceTurn();
    }

    advanceTurn() {
        if (this.board.result) {
            this.phase = 'end';
            return;
        }
        const other = 1 - this.turn;
        if (this.diceLeft(other) > 0) this.turn = other;
        else if (this.diceLeft(this.turn) === 0) {
            endRound(this.board).forEach(e => this.emit(e));
            if (this.board.result) this.phase = 'end';
            else this.startRound();
        }
    }

    // 確かめる用：盤の写し
    snapshotBoard() {
        return cloneBoard(this.board);
    }
}
