/**
 * レイルロードインク（基本ゲーム。拡張のダイスなし）の進行（1〜6人）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（ダイスの目はシードから決まる）
 *
 * ルール（公式のルールブックどおり）
 * - 7ラウンド。毎ラウンドのはじめにダイス4つ（道・線路のダイス3つと、高架・駅のダイス1つ）を振り、全員が同じ目を自分のボードに描く
 * - 4つの目は全部描く（描ける限り）。目は回しても裏返してもよいが、別の形にはできない
 * - 描くタイルは、少なくとも1辺で、出口か描いてある道・線路につながっていなければならない
 * - 道と線路は直接つなげない（駅でつなぐ）。出口とも、同じ種類でなければつなげない
 * - 特別なタイル6つ：1ラウンドに1つまで、ゲーム全体で3つまで、それぞれ1回だけ、ダイスの目に加えて描ける
 * - 全員が描き終えたら、次のラウンド。7ラウンドのあとに得点を数える（scoring.js）。同点なら減点の少ない人の勝ち
 *
 * 自分で決めた点
 * - そのラウンドに描いたタイルは、ラウンドを終えるまで取り消せる（前のラウンドのものは消せない）
 * - 目が描けないときは、その目を描かずにラウンドを終えられる（描ける目が残っている間は終えられない）
 */

import { createRandom } from './random.js';
import {
    SIZE, ROUNDS, MAX_SPECIALS, TILES, SPECIALS, DICE, index, placementError, canPlaceAnywhere
} from './tiles.js';
import { scoreBoard } from './scoring.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
// 操作の種類ごとに、記録する項目。source は 'd0'〜'd3'（ダイス）か 's1'〜's6'（特別なタイル）、o は向き（0〜7）
export const COMMAND_FIELDS = { place: ['source', 'x', 'y', 'o'], undo: [], end: [] };
const MAX_LOGS = 300;
const isInt = (v) => Number.isInteger(v);

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, level }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed, level: options.level === 'easy' ? 'easy' : 'normal' };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            cells: Array(SIZE * SIZE).fill(null),
            specialsUsed: [],       // 使った特別なタイル
            placed: [],             // このラウンドに描いたもの（取り消し用）：{ source, cell }
            done: false
        }));
        this.round = 0;
        this.dice = [];
        this.phase = 'play';
        this.results = null;        // 終わったときの得点
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人（全員が同時に描く）
    actors() {
        if (this.phase === 'end') return [];
        return this.players.filter(p => !p.done).map(p => p.id);
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!this.actors().includes(playerId)) return this.fail('このラウンドはもう終えています');
        const error = this.commandError(playerId, command);
        if (error) return this.fail(error);
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { recorded[k] = command[k]; });
        this.commands.push({ playerId, command: recorded });
        this.execute(playerId, recorded);
        return true;
    }

    // ---- 判定（状態を変えない） ----

    // 描くもの（source）の形の名前。使えなければ null
    kindOf(player, source) {
        if (typeof source !== 'string') return null;
        if (/^d[0-3]$/.test(source)) {
            const i = Number(source[1]);
            return player.placed.some(p => p.source === source) ? null : this.dice[i];
        }
        if (SPECIALS.includes(source)) {
            if (player.specialsUsed.includes(source)) return null;
            if (player.specialsUsed.length >= MAX_SPECIALS) return null;
            if (player.placed.some(p => SPECIALS.includes(p.source))) return null;
            return source;
        }
        return null;
    }

    sourceError(player, source) {
        if (typeof source !== 'string') return '描くものを選んでください';
        if (/^d[0-3]$/.test(source)) return player.placed.some(p => p.source === source) ? 'そのダイスはもう描きました' : null;
        if (!SPECIALS.includes(source)) return '描くものが正しくありません';
        if (player.specialsUsed.includes(source)) return 'その特別なタイルはもう使いました';
        if (player.specialsUsed.length >= MAX_SPECIALS) return '特別なタイルは3つまでです';
        if (player.placed.some(p => SPECIALS.includes(p.source))) return '特別なタイルは1ラウンドに1つまでです';
        return null;
    }

    commandError(seat, command) {
        const player = this.players[seat];
        if (command.type === 'place') {
            const sourceError = this.sourceError(player, command.source);
            if (sourceError) return sourceError;
            const { x, y, o } = command;
            if (!isInt(x) || !isInt(y) || !isInt(o) || o < 0 || o > 7) return '描く場所が正しくありません';
            return placementError(player.cells, this.kindOf(player, command.source), x, y, o);
        }
        if (command.type === 'undo') {
            if (player.placed.length === 0) return 'このラウンドに描いたものはありません';
            return null;
        }
        if (command.type === 'end') {
            const left = this.unplacedDice(seat).filter(i => canPlaceAnywhere(player.cells, this.dice[i]));
            if (left.length > 0) return 'まだ描けるダイスがあります';
            return null;
        }
        return '操作が正しくありません';
    }

    // まだ描いていないダイスの番号
    unplacedDice(seat) {
        const player = this.players[seat];
        return [0, 1, 2, 3].filter(i => !player.placed.some(p => p.source === `d${i}`));
    }

    // ---- 実行 ----

    execute(seat, command) {
        const player = this.players[seat];
        if (command.type === 'place') {
            const kind = this.kindOf(player, command.source);
            const cell = index(command.x, command.y);
            player.cells[cell] = { kind, o: command.o, round: this.round, special: SPECIALS.includes(command.source) };
            player.placed.push({ source: command.source, cell });
            if (SPECIALS.includes(command.source)) player.specialsUsed.push(command.source);
            this.emit({ type: 'place', seat, source: command.source, kind, x: command.x, y: command.y, o: command.o });
            return;
        }
        if (command.type === 'undo') {
            const last = player.placed.pop();
            player.cells[last.cell] = null;
            if (SPECIALS.includes(last.source)) player.specialsUsed = player.specialsUsed.filter(s => s !== last.source);
            this.emit({ type: 'undo', seat, cell: last.cell });
            return;
        }
        if (command.type === 'end') {
            player.done = true;
            const skipped = this.unplacedDice(seat).length;
            const special = player.placed.find(p => SPECIALS.includes(p.source));
            this.log(`${player.name}が第${this.round}ラウンドを描き終えました${special ? `（特別なタイル：${TILES[special.source].name}）` : ''}${skipped > 0 ? `（描けない目が${skipped}つ）` : ''}`);
            this.emit({ type: 'done', seat });
            if (this.players.every(p => p.done)) this.endRound();
        }
    }

    startRound() {
        this.round++;
        this.dice = DICE.map(faces => faces[Math.floor(this.random() * faces.length)]);
        this.players.forEach(p => {
            p.placed = [];
            p.done = false;
        });
        this.emit({ type: 'roll', round: this.round, dice: [...this.dice] });
        this.log(`第${this.round}ラウンド：${this.dice.map(k => TILES[k].name).join('・')}`, { head: true });
    }

    endRound() {
        if (this.round < ROUNDS) return this.startRound();
        this.phase = 'end';
        this.results = this.players.map(p => scoreBoard(p.cells));
        const best = Math.max(...this.results.map(r => r.total));
        const tied = this.players.filter((p, i) => this.results[i].total === best);
        const fewest = Math.min(...tied.map(p => this.results[p.id].errors));
        this.winners = tied.filter(p => this.results[p.id].errors === fewest).map(p => p.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`ゲーム終了。${this.winners.map(s => this.players[s].name).join('と')}の勝ち（${best}点）`, { head: true });
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
