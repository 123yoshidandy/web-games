/**
 * コリドールの進行（2人か4人）
 * ルールの中身は rules.js。ここでは、席と最初の手番、操作の受け付けと記録、出来事の記録を受け持つ
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（最初の手番はシードから決まる）
 */

import { createRandom } from './random.js';
import { createState, legalActions, applyAction, actionKey, wallReason, positionKey, cellOf, distances } from './rules.js';

export const PLAYER_COUNTS = [2, 4];
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { move: ['x', 'y'], wall: ['x', 'y', 'o'], pass: [] };
const MAX_EVENTS = 60;

export default class Game {
    // players: [{ name, isCPU }]（2人か4人）、options: { seed }
    constructor(players, options = {}) {
        if (!PLAYER_COUNTS.includes(players.length)) throw new Error('2人か4人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        const random = createRandom(seed);
        this.first = Math.floor(random() * players.length);
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU }));
        this.state = createState({ players: players.length, first: this.first });
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        // 同じ局面になった回数（CPU が堂々巡りしないように使う。ルールには関わらない）
        this.positions = { [positionKey(this.state)]: 1 };
        this.lastError = null;
        this.cachedActions = null;
    }

    get current() {
        return this.state.result ? null : this.state.current;
    }

    isOver() {
        return !!this.state.result;
    }

    get winner() {
        return this.state.result ? this.state.result.winner : null;
    }

    actors() {
        return this.isOver() ? [] : [this.current];
    }

    legalActions() {
        this.cachedActions ??= legalActions(this.state);
        return this.cachedActions;
    }

    distances() {
        return distances(this.state);
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false（状態は変えない）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { if (command[k] !== undefined && command[k] !== null) recorded[k] = command[k]; });
        const key = actionKey(recorded);
        const action = this.legalActions().find(a => actionKey(a) === key);
        if (!action) return this.fail(this.reasonFor(recorded));
        const from = this.state.pawns[playerId];
        this.state = applyAction(this.state, action);
        this.cachedActions = null;
        this.commands.push({ playerId, command: recorded });
        const pos = positionKey(this.state);
        this.positions[pos] = (this.positions[pos] ?? 0) + 1;
        if (action.type === 'move') this.emit({ type: 'move', seat: playerId, from, to: cellOf(action.x, action.y) });
        else if (action.type === 'wall') this.emit({ type: 'wall', seat: playerId, x: action.x, y: action.y, o: action.o });
        else this.emit({ type: 'pass', seat: playerId });
        if (this.state.result) this.emit({ type: 'end', winner: this.winner });
        return true;
    }

    // 断った理由
    reasonFor(command) {
        if (command.type === 'pass') return 'まだ打てる手があります';
        if (command.type === 'move') return 'そこへは動かせません';
        return wallMessage(wallReason(this.state, command), this.players);
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
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
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) {
                throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
            }
        });
        return game;
    }
}

// 壁を置けない理由の文（画面でも使う）。viewerSeat から見て「あなた」と書く
export function wallMessage(reason, players, viewerSeat = null) {
    if (!reason) return null;
    switch (reason.code) {
        case 'none': return '壁が残っていません';
        case 'range': return 'そこには置けません';
        case 'overlap': return 'ほかの壁と重なります';
        case 'cross': return 'ほかの壁と交差します';
        case 'block': {
            const who = reason.seat === viewerSeat ? 'あなた' : players[reason.seat]?.name ?? '相手';
            return `${who}のゴールへの道がふさがります`;
        }
        default: return 'そこには置けません';
    }
}
