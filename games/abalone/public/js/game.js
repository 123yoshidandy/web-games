/**
 * アバロンの進行（2人）
 * ルールの中身は rules.js。ここでは、席と色（黒が先手。どちらの席が黒かはシードで決める）、操作の受け付けと記録、出来事の記録を受け持つ
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる
 */

import { createRandom } from './random.js';
import { createState, legalMoves, examineMove, applyMove, moveKey, positionKey, BLACK, WHITE, LAYOUTS } from './rules.js';

export const PLAYERS = 2;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { move: ['cells', 'dir'] };
export const COLOR_NAMES = { [BLACK]: '黒', [WHITE]: '白' };
const MAX_EVENTS = 60;

const ERRORS = {
    range: 'その動かし方はできません',
    own: '自分の玉を選んでください',
    line: '一列に並んだ玉（3個まで）を選んでください',
    edge: '自分の玉を盤の外へは出せません',
    blocked: '自分の玉にぶつかります',
    outnumbered: '押せるのは、相手より多いときだけです',
    sandwich: '相手の後ろに玉があるので押せません',
    side: '横に動かす先が空いていません'
};
export const errorMessage = (code) => ERRORS[code] ?? 'その動かし方はできません';

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, layout: 'standard' | 'belgian' | 'german' }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const layout = Object.hasOwn(LAYOUTS, options.layout) ? options.layout : 'standard';
        this.options = { seed, layout };
        const random = createRandom(seed);
        // 黒（先手）の席
        this.first = Math.floor(random() * PLAYERS);
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, color: id === this.first ? BLACK : WHITE }));
        this.state = createState({ layout });
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        // 同じ局面になった回数（CPU が堂々巡りしないように使う。ルールには関わらない）
        this.positions = { [positionKey(this.state)]: 1 };
        this.lastError = null;
        this.cachedMoves = null;
    }

    seatOf(color) {
        return this.players.find(p => p.color === color).id;
    }

    get current() {
        return this.state.result ? null : this.seatOf(this.state.current);
    }

    isOver() {
        return !!this.state.result;
    }

    get winner() {
        return this.state.result ? this.seatOf(this.state.result.winner) : null;
    }

    actors() {
        return this.isOver() ? [] : [this.current];
    }

    legalMoves() {
        this.cachedMoves ??= legalMoves(this.state);
        return this.cachedMoves;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false（状態は変えない）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!Array.isArray(command.cells)) return this.fail(errorMessage('range'));
        const cells = command.cells.slice().sort((a, b) => a - b);
        const examined = examineMove(this.state, cells, command.dir);
        if (examined.error) return this.fail(errorMessage(examined.error));
        const recorded = { type: 'move', cells, dir: command.dir };
        const color = this.state.current;
        this.state = applyMove(this.state, recorded, examined);
        this.cachedMoves = null;
        this.commands.push({ playerId, command: recorded });
        const pos = positionKey(this.state);
        this.positions[pos] = (this.positions[pos] ?? 0) + 1;
        this.emit({ type: 'move', seat: playerId, color, cells, dir: command.dir, moves: examined.moves, pushed: examined.pushed });
        if (this.state.result) this.emit({ type: 'end', winner: this.winner });
        return true;
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

export { moveKey };
