/**
 * バックギャモンの進行（2人）
 * ルールの中身は rules.js。ここでは、ダイス（シード付きの乱数）、手番、ダブリングキューブ、マッチの点数、操作の受け付けと記録、出来事の記録を受け持つ
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる
 *
 * 1ゲームの流れ：最初は各自1個ずつ振り、大きい目の人がその2つの目で動かす（同じ目は振り直し）
 * 手番：（キューブを使えれば）ダブルかロール → 動かす（1番分の歩をまとめて play で送る）→ 相手の番
 * ダブルできないときは、ロールを自動で行う。動かせる手がなければ、自動で相手の番になる
 */

import { createRandom } from './random.js';
import { createBoard, legalPlays, checkPlay, winKind, pipCount, cloneBoard, BAR, OFF, CHECKERS } from './rules.js';

export const PLAYERS = 2;
export const MATCH_LENGTHS = [1, 3, 5, 7];
export const MAX_CUBE = 64;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { roll: [], double: [], take: [], drop: [], play: ['steps'], next: [] };
const MAX_EVENTS = 60;

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, matchLength: 1・3・5・7（何点先取か）, cube: ダブリングキューブを使うか }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const matchLength = MATCH_LENGTHS.includes(options.matchLength) ? options.matchLength : 3;
        this.options = { seed, matchLength, cube: options.cube !== false };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU }));
        this.score = [0, 0];
        this.gameNo = 0;
        this.crawfordDone = false;
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startGame(false);
    }

    // ---- 状態を読む ----

    // 操作する番の席（ダブルの返事は相手。ゲームの間と終わりは null）
    get current() {
        const s = this.state;
        if (s.phase === 'roll' || s.phase === 'move') return s.turn;
        if (s.phase === 'double') return 1 - s.turn;
        return null;
    }

    isOver() {
        return this.state.phase === 'over';
    }

    get winner() {
        if (!this.isOver()) return null;
        return this.score[0] >= this.options.matchLength ? 0 : 1;
    }

    // 操作できる人（ゲームの間は、どちらが「次のゲーム」を押してもよい）
    actors() {
        if (this.state.phase === 'between') return [0, 1];
        return this.current === null ? [] : [this.current];
    }

    // seat がいまダブルできるか
    canDouble(seat) {
        const s = this.state;
        if (!this.options.cube || this.options.matchLength === 1 || s.crawford) return false;
        if (s.phase !== 'roll' || s.turn !== seat) return false;
        if (s.cube.owner !== null && s.cube.owner !== seat) return false;
        if (s.cube.value >= MAX_CUBE) return false;
        // 今のキューブで勝てばマッチに届くなら、ダブルしても意味がないので出さない
        return this.score[seat] + s.cube.value < this.options.matchLength;
    }

    // いまの番の通る手（番の初めの盤から）
    legal() {
        const s = this.state;
        if (s.phase !== 'move') return { max: 0, plays: [], keys: new Set() };
        s.legalCache ??= legalPlays(s.board, s.turn, s.dice);
        return s.legalCache;
    }

    pips(seat) {
        return pipCount(this.state.board[seat]);
    }

    // ---- 操作 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false（状態は変えない）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('マッチは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        const s = this.state;
        const type = command.type;
        let recorded = { type };
        if (type === 'next') {
            if (s.phase !== 'between') return this.fail('ゲームの途中です');
        } else if (type === 'roll' || type === 'double') {
            if (s.phase !== 'roll') return this.fail('今はダイスを振れません');
            if (type === 'double' && !this.canDouble(playerId)) return this.fail('今はダブルできません');
        } else if (type === 'take' || type === 'drop') {
            if (s.phase !== 'double') return this.fail('ダブルの提案はありません');
        } else if (type === 'play') {
            if (s.phase !== 'move') return this.fail('先にダイスを振ってください');
            const steps = Array.isArray(command.steps) && command.steps.length <= 4 ? command.steps.map(x => Array.isArray(x) ? [x[0], x[1]] : x) : null;
            const played = steps && checkPlay(s.board, s.turn, s.dice, steps, this.legal());
            if (!played) return this.fail('その動かし方はできません');
            recorded = { type, steps };
            this.commands.push({ playerId, command: recorded });
            this.doPlay(played);
            return true;
        }
        this.commands.push({ playerId, command: recorded });
        if (type === 'next') this.startGame(true);
        else if (type === 'roll') this.doRoll();
        else if (type === 'double') {
            s.phase = 'double';
            this.emit({ type: 'double', seat: playerId, value: s.cube.value * 2 });
        } else if (type === 'take') {
            s.cube = { value: s.cube.value * 2, owner: playerId };
            s.phase = 'roll';
            this.emit({ type: 'take', seat: playerId, value: s.cube.value });
            // ダブルした人は、もうダブルできないので、そのまま振る
            this.doRoll();
        } else if (type === 'drop') {
            this.emit({ type: 'drop', seat: playerId });
            this.endGame(s.turn, s.cube.value, 0);
        }
        return true;
    }

    // ---- 進行 ----

    startGame(emit) {
        this.gameNo++;
        // 誰かが初めてマッチの1点前に来た次のゲームは、キューブを使わない（クロフォード・ルール）
        const target = this.options.matchLength;
        const crawford = target > 1 && !this.crawfordDone && this.score.some(v => v === target - 1);
        if (crawford) this.crawfordDone = true;
        this.state = {
            board: createBoard(),
            phase: 'move',
            turn: 0,
            dice: null,
            cube: { value: 1, owner: null },
            crawford,
            result: null,
            lastPlay: null
        };
        if (emit) this.emit({ type: 'newGame', gameNo: this.gameNo, crawford });
        // 最初は1個ずつ振り、大きい目の人が先に、その2つの目で動かす
        let a;
        let b;
        do {
            a = this.die();
            b = this.die();
        } while (a === b);
        this.state.turn = a > b ? 0 : 1;
        this.state.dice = [a, b];
        this.emit({ type: 'opening', dice: [a, b], seat: this.state.turn, gameNo: this.gameNo });
        this.afterRoll();
    }

    die() {
        return 1 + Math.floor(this.random() * 6);
    }

    doRoll() {
        const s = this.state;
        s.dice = [this.die(), this.die()];
        s.phase = 'move';
        s.legalCache = null;
        this.emit({ type: 'roll', seat: s.turn, dice: s.dice.slice() });
        this.afterRoll();
    }

    // 振ったあと：動かせなければ相手の番へ
    afterRoll() {
        const s = this.state;
        s.phase = 'move';
        s.legalCache = null;
        if (this.legal().max === 0) {
            this.emit({ type: 'noMove', seat: s.turn, dice: s.dice.slice() });
            this.nextTurn();
        }
    }

    doPlay(played) {
        const s = this.state;
        const seat = s.turn;
        const before = cloneBoard(s.board);
        s.board = played.board;
        s.legalCache = null;
        s.lastPlay = { seat, moves: played.moves };
        this.emit({ type: 'play', seat, dice: s.dice.slice(), moves: played.moves, before });
        if (s.board[seat][OFF] === CHECKERS) {
            const kind = winKind(s.board, seat);
            this.endGame(seat, s.cube.value * kind, kind);
        } else {
            this.nextTurn();
        }
    }

    // 相手の番にする。ダブルできなければ自動で振る（動かせない番が続いても進むように、くり返しで書く）
    nextTurn() {
        const s = this.state;
        s.turn = 1 - s.turn;
        s.phase = 'roll';
        s.dice = null;
        s.legalCache = null;
        if (this.canDouble(s.turn)) return;
        s.dice = [this.die(), this.die()];
        s.phase = 'move';
        this.emit({ type: 'roll', seat: s.turn, dice: s.dice.slice(), auto: true });
        if (this.legal().max === 0) {
            this.emit({ type: 'noMove', seat: s.turn, dice: s.dice.slice() });
            // 両者が続けて動けないことはルール上起きないが、念のため深いくり返しにしない
            this.passes = (this.passes ?? 0) + 1;
            if (this.passes > 50) throw new Error('動けない番が続きました');
            this.nextTurn();
        }
        this.passes = 0;
    }

    // kind：1 シングル・2 ギャモン・3 バックギャモン・0 ダブルを降りた
    endGame(winner, points, kind) {
        const s = this.state;
        this.score[winner] += points;
        const matchOver = this.score[winner] >= this.options.matchLength;
        s.result = { winner, points, kind, cube: s.cube.value };
        s.phase = matchOver ? 'over' : 'between';
        s.dice = null;
        this.emit({ type: 'gameEnd', winner, points, kind, score: this.score.slice(), matchOver });
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

export { BAR, OFF };
