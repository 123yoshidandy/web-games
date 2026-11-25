/**
 * インジーニアスの進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（袋の順はシードから決まる）
 *
 * ルール（ルールブックによる）
 * - タイル120枚（2つの六角がつながったもの）を袋に入れ、各自6枚を手札にする
 * - 手番：手札の1枚を、使う範囲の中の空いた2マスに置く。最初の手番は、まだとなりにタイルがない印刷の記号のとなりに置く
 * - 得点：置いた2つの記号それぞれから、もう1つの記号の向きを除く5方向に、まっすぐ同じ記号が続く数を数え、その色の得点に足す（上限18）
 * - 18に届いた色ごとに「インジーニアス！」で、すぐもう1枚置く（補充の前。断れない）
 * - 補充の前に、得点がいちばん低い色（同じ点で並ぶ色はすべて）の記号が手札に1枚もなければ、手札を見せて全部取り替えてよい（1手番に1回）
 * - 手札を6枚に補充して、次の人へ
 * - 置ける2マスがなくなったら終わり。各自のいちばん低い色の点で比べ、同じなら次に低い色で比べる。6色とも18に届いたら、その場で勝ち
 * 遊び方（options.mode）
 * - standard：2〜4人。各自の得点（0〜18）
 * - team：4人の組み合わせ戦。向かいの2人（席0と2、席1と3）が得点（0〜36）を共有する。18と36に届いたら、置いた人がもう1枚置く
 * - solo：1人用。手札は持たず、袋から1枚引いてすぐ置く。得点は0〜36で、もう1枚置くことはない。使うのは2人と同じ範囲
 *
 * ルールブックで分からない点は、次のように決めた（README にも書く）
 * - 最初の人はシードから決める
 * - 取り替えは、袋に6枚以上あるときだけできる
 * - もう1枚置く権利が残っていても、手札がなければそこで終える
 * - 手札がなくなった人（袋が空のとき）は飛ばす。全員の手札がなくなったら終わり
 */

import { createRandom, shuffle } from './random.js';
import { COLORS, COLOR_ORDER, allTiles, HAND_SIZE, MAX_SCORE, MAX_SCORE_DOUBLE } from './colors.js';
import { CELLS, CELL_COUNT, NEIGHBORS, START_SYMBOLS, radiusFor } from './board.js';

export const MODES = ['standard', 'team', 'solo'];
const MAX_LOGS = 400;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { place: ['tile', 'cells'], swap: [], keep: [] };

const sameTile = (a, b) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
const isColor = (c) => typeof c === 'string' && COLOR_ORDER.includes(c);

// 得点の比べ方：低い順に並べ、低いものから比べる（大きいほうが上）。a が上なら正
export function compareScores(a, b) {
    const x = COLOR_ORDER.map(c => a[c]).sort((p, q) => p - q);
    const y = COLOR_ORDER.map(c => b[c]).sort((p, q) => p - q);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer, mode }
    constructor(players, options = {}) {
        const mode = options.mode ?? (players.length === 1 ? 'solo' : 'standard');
        if (!MODES.includes(mode)) throw new Error('遊び方が正しくありません');
        if (mode === 'solo' ? players.length !== 1 : mode === 'team' ? players.length !== 4 : players.length < 2 || players.length > 4) {
            throw new Error('人数が遊び方に合っていません');
        }
        const n = players.length;
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * n);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn, mode };
        this.mode = mode;
        this.radius = radiusFor(mode === 'solo' ? 2 : n);
        this.maxScore = mode === 'standard' ? MAX_SCORE : MAX_SCORE_DOUBLE;
        this.bonusAt = mode === 'standard' ? [MAX_SCORE] : mode === 'team' ? [MAX_SCORE, MAX_SCORE_DOUBLE] : [];
        this.handSize = mode === 'solo' ? 1 : HAND_SIZE;
        this.bag = shuffle(allTiles(), this.random);
        // 盤：マスごとの色（空きは null）。印刷の記号は最初から色がある
        this.board = new Array(CELL_COUNT).fill(null);
        START_SYMBOLS.forEach((color, cell) => { this.board[cell] = color; });
        this.tiles = []; // 置いたタイル { cells, colors, seat }
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            hand: [], placed: 0, side: mode === 'team' ? id % 2 : id
        }));
        // 得点を持つ単位（ふつうは1人ずつ、組み合わせ戦は2人で1つ）
        const sideCount = mode === 'team' ? 2 : n;
        this.sides = Array.from({ length: sideCount }, (_, i) => ({
            members: this.players.filter(p => p.side === i).map(p => p.id),
            scores: Object.fromEntries(COLOR_ORDER.map(c => [c, 0]))
        }));
        this.players.forEach(p => this.refill(p));
        this.current = this.options.startPlayer;
        this.phase = 'place';  // place：置く / swap：取り替えるか選ぶ / end
        this.bonus = 0;        // 残っている「もう1枚」の数
        this.turnNumber = 1;
        this.winners = [];     // 勝った単位（sides の番号）
        this.instantWin = false;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(mode === 'solo' ? '1人用で始めます' : `${this.players[this.current].name}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    sideOf(seat) {
        return this.sides[this.players[seat].side];
    }

    refill(p) {
        while (p.hand.length < this.handSize && this.bag.length) p.hand.push(this.bag.shift());
    }

    // 置ける空きマスか（使う範囲の中で、記号もタイルもない）
    open(cell) {
        return cell >= 0 && CELLS[cell].ring <= this.radius && this.board[cell] === null;
    }

    // 置ける2マスがまだあるか
    hasRoom() {
        for (let a = 0; a < CELL_COUNT; a++) {
            if (!this.open(a)) continue;
            if (NEIGHBORS[a].some(b => this.open(b))) return true;
        }
        return false;
    }

    // 最初の手番に使える印刷の記号（まだとなりにタイルがないもの）。どれもなければ空
    freeSymbols() {
        return [...START_SYMBOLS.keys()].filter(s => NEIGHBORS[s].every(nb => nb < 0 || !this.tiles.some(t => t.cells.includes(nb))));
    }

    // cells の置き方が、場所として正しいか（タイルの色は見ない）。正しくなければ理由
    placementError(seat, cells) {
        if (!Array.isArray(cells) || cells.length !== 2 || !cells.every(c => Number.isInteger(c))) return 'マスを2つ選んでください';
        const [a, b] = cells;
        if (!this.open(a) || !this.open(b)) return 'そこには置けません';
        if (!NEIGHBORS[a].includes(b)) return 'となり合う2マスに置いてください';
        if (this.players[seat].placed === 0) {
            const free = this.freeSymbols();
            if (free.length && !free.some(s => NEIGHBORS[s].includes(a) || NEIGHBORS[s].includes(b))) {
                return '最初は、まだだれも置いていない記号のとなりに置いてください';
            }
        }
        return null;
    }

    // a に color を置いたときの得点（b はタイルのもう一方のマス。その向きは数えない）
    linePoints(a, b, color) {
        let points = 0;
        for (let d = 0; d < 6; d++) {
            let c = NEIGHBORS[a][d];
            if (c === b) continue;
            while (c >= 0 && this.board[c] === color) {
                points++;
                c = NEIGHBORS[c][d];
            }
        }
        return points;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { place: { place: this.place }, swap: { swap: this.swap, keep: this.keep } }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        const done = handler.call(this, playerId, command);
        if (!done) return false;
        // 記録するのは決まった項目だけ（端末から余計な項目が届いても残さない）
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 置く ----

    // tile: [色, 色]（1つ目を cells[0] に、2つ目を cells[1] に置く）
    place(seat, { tile, cells }) {
        if (!Array.isArray(tile) || tile.length !== 2 || !tile.every(isColor)) return this.fail('タイルを選んでください');
        const p = this.players[seat];
        const index = p.hand.findIndex(t => sameTile(t, tile));
        if (index < 0) return this.fail('そのタイルは持っていません');
        const error = this.placementError(seat, cells);
        if (error) return this.fail(error);
        const [a, b] = cells;
        // 得点は、置く前の盤で数える（もう一方の記号は数えないので、置いた後でも同じ）
        const gains = {};
        [[a, b, tile[0]], [b, a, tile[1]]].forEach(([x, y, color]) => {
            gains[color] = (gains[color] ?? 0) + this.linePoints(x, y, color);
        });
        p.hand.splice(index, 1);
        this.board[a] = tile[0];
        this.board[b] = tile[1];
        this.tiles.push({ cells: [a, b], colors: [tile[0], tile[1]], seat });
        p.placed += 1;
        const side = this.sideOf(seat);
        const reached = [];
        Object.entries(gains).forEach(([color, points]) => {
            const before = side.scores[color];
            const after = Math.min(this.maxScore, before + points);
            side.scores[color] = after;
            this.bonusAt.forEach(mark => { if (before < mark && after >= mark) reached.push(color); });
        });
        const scored = Object.entries(gains).filter(([, v]) => v > 0);
        this.emit({ type: 'place', seat, cells: [a, b], colors: [tile[0], tile[1]], gains });
        this.log(`${p.name}：${scored.length ? scored.map(([c, v]) => `${COLORS[c].name}+${v}`).join('・') : '得点なし'}`);
        reached.forEach(color => {
            this.emit({ type: 'ingenious', seat, color });
            this.log(`${p.name}：インジーニアス！（${COLORS[color].name}）`);
        });
        // 6色とも上限に届いたら、その場で勝ち
        if (this.mode !== 'solo' && COLOR_ORDER.every(c => side.scores[c] >= this.maxScore)) {
            this.instantWin = true;
            this.finish();
            return true;
        }
        if (!this.hasRoom()) {
            this.finish();
            return true;
        }
        this.bonus += reached.length;
        if (this.bonus > 0 && p.hand.length) {
            this.bonus -= 1;
            return true; // もう1枚置く
        }
        this.bonus = 0;
        this.afterPlacing(seat);
        return true;
    }

    // 取り替えられるか（いちばん低い色の記号が手札に1枚もない）
    canSwap(seat) {
        if (this.mode === 'solo' || this.bag.length < HAND_SIZE) return false;
        const scores = this.sideOf(seat).scores;
        const low = Math.min(...COLOR_ORDER.map(c => scores[c]));
        const lowest = COLOR_ORDER.filter(c => scores[c] === low);
        return !this.players[seat].hand.some(t => t.some(c => lowest.includes(c)));
    }

    afterPlacing(seat) {
        if (this.canSwap(seat)) {
            this.phase = 'swap';
            return;
        }
        this.endTurn(seat);
    }

    swap(seat) {
        const p = this.players[seat];
        const old = p.hand;
        p.hand = [];
        this.refill(p);
        this.bag.push(...old);
        shuffle(this.bag, this.random);
        this.emit({ type: 'swap', seat, count: old.length });
        this.log(`${p.name}が手札を取り替えました`);
        this.endTurn(seat);
        return true;
    }

    keep(seat) {
        this.endTurn(seat);
        return true;
    }

    endTurn(seat) {
        this.refill(this.players[seat]);
        const n = this.players.length;
        // 次の人へ（手札がない人は飛ばす）
        for (let k = 1; k <= n; k++) {
            const next = (seat + k) % n;
            const q = this.players[next];
            if (this.mode === 'solo') this.refill(q);
            if (q.hand.length) {
                this.current = next;
                this.phase = 'place';
                this.turnNumber += 1;
                this.emit({ type: 'turn', seat: next });
                return;
            }
        }
        this.finish();
    }

    finish() {
        this.phase = 'end';
        this.bonus = 0;
        if (this.instantWin) {
            this.winners = [this.players[this.current].side];
        } else {
            const order = this.sides.map((s, i) => i).sort((x, y) => compareScores(this.sides[y].scores, this.sides[x].scores));
            this.winners = order.filter(i => compareScores(this.sides[i].scores, this.sides[order[0]].scores) === 0);
        }
        this.emit({ type: 'end', winners: [...this.winners] });
        if (this.mode === 'solo') this.log(`終わり：いちばん低い色は${this.finalScore(0)}点`);
        else this.log(`${this.winners.map(i => this.sideName(i)).join('と')}の勝ち`);
    }

    // その単位のいちばん低い色の点（最終得点）
    finalScore(sideIndex) {
        const s = this.sides[sideIndex].scores;
        return Math.min(...COLOR_ORDER.map(c => s[c]));
    }

    sideName(i) {
        return this.sides[i].members.map(id => this.players[id].name).join('・');
    }

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

    // 保存する形（参加者・設定・操作の記録）。オンライン対戦のサーバーもこの形で保存する
    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    // 操作の記録から同じゲームを作り直す
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

