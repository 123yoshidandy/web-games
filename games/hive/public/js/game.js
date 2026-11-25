/**
 * ハイブの進行（2人）
 * ルールの中身は rules.js。ここでは、席と手番の順（先手＝白）、操作の受け付けと記録、記録・出来事を受け持つ
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（先手はシードから決まる）
 */

import { createRandom } from './random.js';
import { createState, legalActions, applyAction, actionKey, KIND_NAMES, EXPANSIONS, topAt } from './rules.js';

export { KIND_NAMES, EXPANSIONS };
export const PLAYERS = 2;
export const COLOR_NAMES = ['白', '黒'];
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { place: ['kind', 'to'], move: ['from', 'to', 'via'], pass: [] };
const MAX_LOGS = 400;
const MAX_EVENTS = 120;

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, expansions: ['L','M','P'] の一部, tournament }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const expansions = EXPANSIONS.filter(k => (options.expansions ?? []).includes(k));
        const tournament = options.tournament ?? true;
        this.options = { seed, expansions, tournament };
        const random = createRandom(seed);
        // 先手（白）はシードで決める。colors[seat] が 0 なら白
        this.first = Math.floor(random() * PLAYERS);
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, color: (id - this.first + PLAYERS) % PLAYERS }));
        this.state = createState({ expansions, tournament });
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.cachedActions = null;
        this.log(`${this.players[this.first].name}（白）が先手です`);
    }

    // 色（0 白・1 黒）と席の変換
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
        const r = this.state.result;
        return r && r.winner !== null ? this.seatOf(r.winner) : null;
    }

    actors() {
        return this.isOver() ? [] : [this.current];
    }

    legalActions() {
        this.cachedActions ??= legalActions(this.state);
        return this.cachedActions;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
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
        const color = this.state.current;
        const piece = action.type === 'move' ? topAt(this.state.board, action.from) : null;
        this.state = applyAction(this.state, action);
        this.cachedActions = null;
        this.commands.push({ playerId, command: recorded });
        this.emit({ type: action.type, seat: playerId, color, kind: action.kind ?? piece?.kind ?? null, from: action.from ?? null, to: action.to ?? null, via: action.via ?? null, owner: piece ? piece.owner : color });
        const name = this.players[playerId].name;
        if (action.type === 'place') this.log(`${name}が${KIND_NAMES[action.kind]}を置きました`);
        else if (action.type === 'move') {
            const whose = piece.owner === color ? '' : '相手の';
            this.log(action.via ? `${name}がダンゴムシの力で${whose}${KIND_NAMES[piece.kind]}を動かしました` : `${name}が${KIND_NAMES[piece.kind]}を動かしました`);
        } else this.log(`${name}は動かせる駒がないので、パスしました`);
        if (this.state.result) this.finish();
        return true;
    }

    // 断った理由（よくあるものだけ、分かりやすく）
    reasonFor(command) {
        const s = this.state;
        const color = s.current;
        if (command.type === 'pass') return 'まだ打てる手があります';
        if (command.type === 'place') {
            if (!(s.hands[color][command.kind] > 0)) return 'その駒は手持ちにありません';
            if (command.kind === 'Q' && s.turns[color] === 0 && s.tournament) return '最初の手には、女王蜂を置けません';
            if (s.hands[color].Q > 0 && s.turns[color] === 3 && command.kind !== 'Q') return '4手目までに、女王蜂を置かなければなりません';
            return 'そこには置けません';
        }
        if (s.hands[color].Q > 0) return '女王蜂を置くまでは、駒を動かせません';
        return 'そこへは動かせません';
    }

    finish() {
        const r = this.state.result;
        const winner = this.winner;
        this.emit({ type: 'end', winner, reason: r.reason });
        if (winner !== null) this.log(`${this.players[winner].name}の勝ちです（女王蜂を囲みました）`);
        else this.log(r.reason === 'repetition' ? '同じ局面が3回になったので、引き分けです' : '両方の女王蜂が同時に囲まれたので、引き分けです');
    }

    // ---- 道具 ----

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
