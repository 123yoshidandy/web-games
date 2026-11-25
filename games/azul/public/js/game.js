/**
 * アズールのルールと状態（DOM に依存しない）
 *
 * 操作はすべて applyCommand(seat, command) に通す。受け付けたら true、断ったら false と lastError。
 * 受け付けた操作だけを commands に記録し、Game.replay で同じ状態を作り直せる。
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）。
 *
 * 操作は1種類だけ：
 *   { type: 'take', source: 'center' | 工房の番号, color: 0〜4, line: 0〜4 | 'floor' }
 *   工房か場の中央から1色を全部取り、パターンラインの1段（または床ライン）に置く
 */

import { createRandom, createSeed, shuffle } from './random.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const COLOR_COUNT = 5;
export const TILES_PER_COLOR = 20;
export const TILES_PER_FACTORY = 4;
export const FACTORY_COUNTS = { 2: 5, 3: 7, 4: 9 };
export const FLOOR_PENALTIES = [-1, -1, -2, -2, -2, -3, -3];
export const FIRST = 'first'; // 先手マーカー（床ラインでは1枚分の場所を取る）
export const BONUS = { row: 2, column: 7, color: 10 };

// 色の並び（壁の1段目の左から）。名前は画面の表示用
export const COLOR_NAMES = ['青', '黄', '赤', '黒', '水色'];

// 壁の (row, col) に置く色。段が1つ下がるごとに、色の並びが右へ1つずれる
export const wallColor = (row, col) => (col - row + COLOR_COUNT) % COLOR_COUNT;
// その色を row 段目の壁のどの列に置くか
export const wallColumn = (row, color) => (color + row) % COLOR_COUNT;

// 壁の (row, col) に置いたときの点数（縦横につながった数）
export function placementScore(wall, row, col) {
    const run = (dr, dc) => {
        let n = 0;
        for (let r = row + dr, c = col + dc; r >= 0 && r < 5 && c >= 0 && c < 5 && wall[r][c]; r += dr, c += dc) n++;
        return n;
    };
    const h = 1 + run(0, -1) + run(0, 1);
    const v = 1 + run(-1, 0) + run(1, 0);
    if (h === 1 && v === 1) return 1;
    return (h > 1 ? h : 0) + (v > 1 ? v : 0);
}

// パターンラインの line 段目に color を置けるか（プレイヤーの状態でもビューでも使える）
export function canPlaceInLine(player, line, color) {
    const target = player.lines[line];
    if (!target) return false;
    if (target.count >= line + 1) return false;
    if (target.count > 0 && target.color !== color) return false;
    return !player.wall[line][wallColumn(line, color)];
}

// 床ラインに n 個足したときに増える失点（0 以下）
export function floorPenaltyFor(floorLength, added) {
    let total = 0;
    for (let i = floorLength; i < Math.min(FLOOR_PENALTIES.length, floorLength + added); i++) total += FLOOR_PENALTIES[i];
    return total;
}

export const countRows = wall => wall.filter(row => row.every(Boolean)).length;
export const countColumns = wall => [0, 1, 2, 3, 4].filter(c => wall.every(row => row[c])).length;
export const countColors = wall => [0, 1, 2, 3, 4]
    .filter(color => [0, 1, 2, 3, 4].every(row => wall[row][wallColumn(row, color)])).length;

const emptyLines = () => [0, 1, 2, 3, 4].map(() => ({ color: null, count: 0 }));
const emptyWall = () => [0, 1, 2, 3, 4].map(() => [false, false, false, false, false]);

export default class Game {
    // players: [{ name, isCPU }] / options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        this.seed = (options.seed ?? createSeed()) >>> 0;
        this.random = createRandom(this.seed);
        this.players = players.map((player, seat) => ({
            seat,
            name: player.name,
            isCPU: !!player.isCPU,
            score: 0,
            lines: emptyLines(),
            wall: emptyWall(),
            floor: []
        }));
        this.bag = [];
        for (let color = 0; color < COLOR_COUNT; color++) {
            for (let i = 0; i < TILES_PER_COLOR; i++) this.bag.push(color);
        }
        shuffle(this.bag, this.random);
        this.lid = []; // 箱のふた（使い終わったタイル）
        this.factories = Array.from({ length: FACTORY_COUNTS[players.length] }, () => []);
        this.center = [];
        this.firstInCenter = false;
        this.firstTakenBy = null;
        this.startSeat = Math.floor(this.random() * players.length);
        this.current = this.startSeat;
        this.round = 0;
        this.phase = 'offer'; // 'offer'（タイルを取る） / 'end'（終了）
        this.commands = [];
        this.logs = [];
        this.lastError = null;
        this.lastMove = null;
        this.roundReports = [];
        this.result = null;
        this.startRound();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません: ${game.lastError}`);
        }
        return game;
    }

    get isOver() {
        return this.phase === 'end';
    }

    getCurrentPlayer() {
        return this.players[this.current];
    }

    // 取れるタイルの組（source と color）
    getSources() {
        const sources = [];
        this.factories.forEach((tiles, index) => {
            for (const color of new Set(tiles)) sources.push({ source: index, color, count: tiles.filter(t => t === color).length });
        });
        for (const color of new Set(this.center)) sources.push({ source: 'center', color, count: this.center.filter(t => t === color).length });
        return sources;
    }

    // 今の手番の人が打てる手の一覧
    getLegalMoves(seat = this.current) {
        if (this.phase !== 'offer' || seat !== this.current) return [];
        const player = this.players[seat];
        const moves = [];
        for (const { source, color, count } of this.getSources()) {
            for (let line = 0; line < 5; line++) {
                if (canPlaceInLine(player, line, color)) moves.push({ type: 'take', source, color, line, count });
            }
            moves.push({ type: 'take', source, color, line: 'floor', count });
        }
        return moves;
    }

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (command.type !== 'take') return this.fail('今はその操作はできません');
        if (this.phase !== 'offer') return this.fail('ゲームは終わっています');
        if (seat !== this.current) return this.fail('あなたの番ではありません');

        const { source, color, line } = command;
        if (!Number.isInteger(color) || color < 0 || color >= COLOR_COUNT) return this.fail('色が正しくありません');
        let tiles;
        if (source === 'center') {
            tiles = this.center;
        } else if (Number.isInteger(source) && source >= 0 && source < this.factories.length) {
            tiles = this.factories[source];
        } else {
            return this.fail('取る場所が正しくありません');
        }
        const count = tiles.filter(t => t === color).length;
        if (count === 0) return this.fail('その色のタイルはありません');
        const player = this.players[seat];
        if (line !== 'floor') {
            if (!Number.isInteger(line) || line < 0 || line > 4) return this.fail('置く段が正しくありません');
            if (!canPlaceInLine(player, line, color)) return this.fail('その段には置けません');
        }

        // ここから状態を変える
        const tookFirst = source === 'center' && this.firstInCenter;
        if (source === 'center') {
            this.center = this.center.filter(t => t !== color);
            if (tookFirst) {
                this.firstInCenter = false;
                this.firstTakenBy = seat;
                this.addToFloor(player, [FIRST]);
            }
        } else {
            this.center.push(...tiles.filter(t => t !== color));
            this.factories[source] = [];
        }
        let placed = 0;
        if (line !== 'floor') {
            const target = player.lines[line];
            placed = Math.min(count, line + 1 - target.count);
            target.color = color;
            target.count += placed;
        }
        const overflow = count - placed;
        this.addToFloor(player, Array(overflow).fill(color));

        const record = { type: 'take', source, color, line };
        this.commands.push({ seat, command: record });
        this.lastMove = { seat, source, color, line, count, placed, overflow, tookFirst, round: this.round };
        const from = source === 'center' ? '中央' : `工房${source + 1}`;
        const to = line === 'floor' ? '床' : `${line + 1}段目`;
        this.logs.push(`${player.name}：${from}から${COLOR_NAMES[color]}を${count}枚、${to}へ`);

        if (this.factories.every(f => f.length === 0) && this.center.length === 0) {
            this.endRound();
        } else {
            this.current = (seat + 1) % this.players.length;
        }
        return true;
    }

    // 床ラインに置く。7つの場所が埋まったら、残りは箱のふたへ（先手マーカーは捨てない）
    addToFloor(player, items) {
        for (const item of items) {
            if (player.floor.length < FLOOR_PENALTIES.length) {
                player.floor.push(item);
            } else if (item !== FIRST) {
                this.lid.push(item);
            }
        }
    }

    // ラウンドの始め：工房に4枚ずつ並べ、先手マーカーを中央に置く
    startRound() {
        this.round++;
        this.firstInCenter = true;
        this.firstTakenBy = null;
        this.center = [];
        for (const factory of this.factories) {
            while (factory.length < TILES_PER_FACTORY) {
                if (this.bag.length === 0) {
                    if (this.lid.length === 0) break; // 袋も箱も空なら、並べられた分で始める
                    this.bag = shuffle(this.lid, this.random);
                    this.lid = [];
                }
                factory.push(this.bag.pop());
            }
        }
        this.current = this.startSeat;
        this.logs.push(`ラウンド${this.round}`);
        // 並べるタイルが1枚もないときは（実際には起きない）、ゲームを終える
        if (this.factories.every(f => f.length === 0)) this.finishGame();
    }

    // 壁へのタイルの移動と得点。全員の分をまとめて行う
    endRound() {
        const report = { round: this.round, players: [] };
        for (const player of this.players) {
            const before = player.score;
            const placements = [];
            for (let row = 0; row < 5; row++) {
                const line = player.lines[row];
                if (line.count !== row + 1) continue;
                const col = wallColumn(row, line.color);
                player.wall[row][col] = true;
                const points = placementScore(player.wall, row, col);
                player.score += points;
                placements.push({ row, col, color: line.color, points });
                for (let i = 0; i < row; i++) this.lid.push(line.color);
                player.lines[row] = { color: null, count: 0 };
            }
            const gained = player.score - before;
            const penalty = floorPenaltyFor(0, player.floor.length);
            const afterGain = player.score;
            player.score = Math.max(0, player.score + penalty);
            for (const item of player.floor) {
                if (item !== FIRST) this.lid.push(item);
            }
            report.players.push({
                seat: player.seat,
                placements,
                gained,
                floorCount: player.floor.length,
                penalty: player.score - afterGain,
                scoreBefore: before,
                score: player.score
            });
            player.floor = [];
        }
        this.roundReports.push(report);
        if (this.firstTakenBy !== null) this.startSeat = this.firstTakenBy;
        this.firstInCenter = false;

        if (this.players.some(player => countRows(player.wall) > 0)) {
            this.finishGame();
        } else {
            this.startRound();
        }
    }

    // ゲームの終わり：横の列・縦の列・色のボーナスを足し、順位を決める
    finishGame() {
        this.phase = 'end';
        const standings = this.players.map(player => {
            const rows = countRows(player.wall);
            const columns = countColumns(player.wall);
            const colors = countColors(player.wall);
            const bonus = rows * BONUS.row + columns * BONUS.column + colors * BONUS.color;
            const base = player.score;
            player.score += bonus;
            return { seat: player.seat, base, rows, columns, colors, bonus, score: player.score };
        });
        // 点数が高い順。同点なら横の列が多い方が上。それも同じなら同じ順位
        const better = (a, b) => b.score - a.score || b.rows - a.rows;
        const sorted = [...standings].sort(better);
        sorted.forEach((entry, i) => {
            entry.rank = i > 0 && better(sorted[i - 1], entry) === 0 ? sorted[i - 1].rank : i + 1;
        });
        this.result = {
            standings: sorted,
            winners: sorted.filter(entry => entry.rank === 1).map(entry => entry.seat)
        };
        this.logs.push('ゲーム終了');
    }

    fail(message) {
        this.lastError = message;
        return false;
    }
}
