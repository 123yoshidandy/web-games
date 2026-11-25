/**
 * チグリス・ユーフラテスの進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（袋の順はシードから決まる）
 *
 * ルール（基本ゲーム。細かい点の決め方は README にも書く）
 * - 盤には川と、宝物の載った神殿10か所。各自、手札6枚・指導者4人（王＝黒・神官＝赤・農民＝青・商人＝緑）・大災害2枚
 * - 手番に2アクション：タイルを置く／指導者を置く・動かす／指導者を取り除く／大災害／手札の交換（1〜6枚）／見送る
 * - タイル：青は川だけ、ほかの色は陸だけ。3つ以上の王国（指導者のいる地域）はつなげない
 *   王国に置いたら、同じ色の指導者の持ち主がその色の1点。いなければ王の持ち主が、その色の1点
 * - 指導者：神殿（赤）のとなりの空いた陸に置く。2つの王国をつなぐ場所には置けない
 *   同じ色の指導者がいる王国に置くと内乱。強さは、となりの神殿の数＋手札から出した赤。同点は守る側。勝った側は赤1点
 * - 2つの王国をつなぐタイルで、両方に同じ色の指導者がいれば外乱。そのタイルは争いが終わるまでどちらの王国にも数えない
 *   強さは、自分の側の王国の、その色のタイルの数＋手札から出した同じ色。同点は守る側
 *   負けた指導者と、負けた側の王国のその色のタイルを取り除き（宝物の神殿と、ほかの指導者を支える神殿は残す）、勝った側はその数＋1点
 *   争いが2つ以上なら、手番の人が順番を決める。手番の人が関わらない争いは、手番の人の次から数えて先の人が攻める側
 * - 同じ色の4枚の正方形ができたら、記念碑を建ててよい（4枚は裏返り、色を失う）
 *   手番の終わりに、記念碑の色の指導者を記念碑のある王国に置いている手番の人は、その色の1点
 * - 宝物が2つ以上ある王国に商人がいれば、その持ち主が1つを残して取る（隅の宝物を先に）
 * - 大災害：指導者・記念碑・宝物のないマスに置き、タイルを取り除く。神殿がとなりからなくなった指導者は手元に戻る
 * - 手番の終わりに、手番の人から時計回りに、6枚より少ない人が全員6枚に補充する（争いで手札を出した人も、ここで補充する）。
 *   そのあとで、盤の宝物が2つ以下か、袋のタイルで補充できなかったら終わり
 * - 勝ち：4色のうちいちばん低い色の点（宝物は好きな色に足せる）。同じなら次に低い色で比べる
 */

import { createRandom, shuffle } from './random.js';
import { COLORS, COLOR_INFO, BAG_COUNTS, HAND_SIZE, ACTIONS_PER_TURN, CATASTROPHES_PER_PLAYER, MONUMENTS } from './data.js';
import { CELL_COUNT, NEIGHBORS, START_TEMPLES, CORNER_TREASURES, isRiver, squaresWith, squareCells, rowOf, colOf } from './board.js';

const MAX_LOGS = 600;
const MAX_EVENTS = 120;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    tile: ['color', 'cell'],
    leader: ['color', 'cell'],
    withdraw: ['color'],
    catastrophe: ['cell'],
    swap: ['tiles'],
    pass: [],
    support: ['count'],
    war: ['color'],
    monument: ['cell', 'monument'],
    skip: []
};

// 局面ごとに受け付ける操作
const PHASE_COMMANDS = {
    action: ['tile', 'leader', 'withdraw', 'catastrophe', 'swap', 'pass'],
    support: ['support'],
    warOrder: ['war'],
    monument: ['monument', 'skip']
};

const isColor = (c) => typeof c === 'string' && COLORS.includes(c);
const isCell = (c) => Number.isInteger(c) && c >= 0 && c < CELL_COUNT;
export const cellName = (cell) => `${String.fromCharCode(65 + colOf(cell))}${rowOf(cell) + 1}`;

// 宝物を足した最終の点（低い順の並び）。宝物は、いちばん低い色に1つずつ足していく
export function finalValues(scores, treasures) {
    const values = COLORS.map(c => scores[c]).sort((a, b) => a - b);
    for (let i = 0; i < treasures; i++) {
        values[0] += 1;
        values.sort((a, b) => a - b);
    }
    return values;
}

// 得点の比べ方（低い色から比べる）。a が上なら正
export function compareFinal(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < 2 || players.length > 4) throw new Error('人数は2〜4人です');
        const n = players.length;
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * n);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        this.bag = shuffle(COLORS.flatMap(c => Array(BAG_COUNTS[c]).fill(c)), this.random);
        // 盤：null（空き）か { kind: 'tile', color } / { kind: 'leader', seat, color } / { kind: 'cat' } / { kind: 'mon', id }
        this.board = new Array(CELL_COUNT).fill(null);
        START_TEMPLES.forEach(cell => { this.board[cell] = { kind: 'tile', color: 'red' }; });
        this.treasures = [...START_TEMPLES];
        this.monuments = MONUMENTS.map(colors => ({ colors: [...colors], cell: null }));
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            hand: [],
            leaders: Object.fromEntries(COLORS.map(c => [c, null])), // 盤の上のマス（手元なら null）
            catastrophes: CATASTROPHES_PER_PLAYER,
            scores: Object.fromEntries(COLORS.map(c => [c, 0])),
            treasures: 0
        }));
        this.players.forEach(p => this.draw(p, HAND_SIZE));
        this.current = this.options.startPlayer;
        this.actionsLeft = ACTIONS_PER_TURN;
        this.phase = 'action';   // action / support（争いで手札を出す）/ warOrder（外乱の順番）/ monument / end
        this.conflict = null;    // 進めている争い
        this.war = null;         // 外乱の途中 { cell, color, seat, pending }
        this.monumentChoice = null; // { color, squares }
        this.turnNumber = 1;
        this.winners = [];
        this.endReason = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている席
    actors() {
        if (this.phase === 'end') return [];
        if (this.phase === 'support') {
            const c = this.conflict;
            return [c.attacker.commit === null ? c.attacker.seat : c.defender.seat];
        }
        return [this.current];
    }

    draw(p, count) {
        for (let i = 0; i < count && this.bag.length; i++) p.hand.push(this.bag.shift());
    }

    // ---- 盤の計算 ----

    occupied(cell, skip) {
        if (skip?.has(cell)) return false;
        const x = this.board[cell];
        return !!x && x.kind !== 'cat';
    }

    // start からつながったマス（タイル・指導者・記念碑）。skip のマスは空きとみなす
    region(start, skip) {
        if (!this.occupied(start, skip)) return [];
        const seen = new Set([start]);
        const stack = [start];
        while (stack.length) {
            const c = stack.pop();
            NEIGHBORS[c].forEach(nb => {
                if (!seen.has(nb) && this.occupied(nb, skip)) {
                    seen.add(nb);
                    stack.push(nb);
                }
            });
        }
        return [...seen];
    }

    leadersIn(cells) {
        return cells.filter(c => this.board[c]?.kind === 'leader').map(c => ({ cell: c, seat: this.board[c].seat, color: this.board[c].color }));
    }

    // cell のとなりにある王国（指導者のいる地域）。同じ王国は1回だけ
    adjacentKingdoms(cell, skip) {
        const out = [];
        const seen = new Set();
        NEIGHBORS[cell].forEach(nb => {
            if (seen.has(nb) || !this.occupied(nb, skip)) return;
            const cells = this.region(nb, skip);
            cells.forEach(c => seen.add(c));
            const leaders = this.leadersIn(cells);
            if (leaders.length) out.push({ cells, leaders });
        });
        return out;
    }

    isTemple(cell) {
        const x = this.board[cell];
        return x?.kind === 'tile' && x.color === 'red';
    }

    templesAround(cell) {
        return NEIGHBORS[cell].filter(nb => this.isTemple(nb)).length;
    }

    hasTreasure(cell) {
        return this.treasures.includes(cell);
    }

    // ---- 操作 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (!PHASE_COMMANDS[this.phase]?.includes(command.type)) return this.fail('今はその操作はできません');
        const done = this[`cmd_${command.type}`](playerId, command);
        if (!done) return false;
        // 記録するのは決まった項目だけ（端末から余計な項目が届いても残さない）
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // タイルを置けるか。置けなければ理由
    tileError(seat, color, cell) {
        if (!isColor(color)) return 'タイルを選んでください';
        if (!this.players[seat].hand.includes(color)) return 'そのタイルは持っていません';
        if (!isCell(cell)) return '置くマスを選んでください';
        if (this.board[cell]) return 'そこには置けません';
        if (color === 'blue' && !isRiver(cell)) return '農地（青）は川にだけ置けます';
        if (color !== 'blue' && isRiver(cell)) return '川には農地（青）だけ置けます';
        if (this.adjacentKingdoms(cell).length > 2) return '3つの王国はつなげません';
        return null;
    }

    cmd_tile(seat, { color, cell }) {
        const error = this.tileError(seat, color, cell);
        if (error) return this.fail(error);
        const kingdoms = this.adjacentKingdoms(cell);
        const p = this.players[seat];
        p.hand.splice(p.hand.indexOf(color), 1);
        this.board[cell] = { kind: 'tile', color };
        this.emit({ type: 'tile', seat, cell, color });
        // 2つの王国をつなぎ、両方に同じ色の指導者がいれば外乱
        if (kingdoms.length === 2) {
            const [a, b] = kingdoms;
            const fights = COLORS.map(c => {
                const x = a.leaders.find(l => l.color === c);
                const y = b.leaders.find(l => l.color === c);
                return x && y ? { color: c, cells: [x.cell, y.cell] } : null;
            }).filter(Boolean);
            if (fights.length) {
                this.log(`${p.name}：${COLOR_INFO[color].tile}を${cellName(cell)}に置き、王国をつなぎました（外乱：${fights.map(f => COLOR_INFO[f.color].leader).join('・')}）`);
                this.war = { cell, color, seat, pending: fights };
                this.nextWar();
                return true;
            }
        }
        this.scoreTile(seat, cell, color);
        this.afterTile(cell, color);
        return true;
    }

    // 置いたタイルの点：同じ色の指導者、いなければ王の持ち主へ
    scoreTile(seat, cell, color) {
        const leaders = this.leadersIn(this.region(cell));
        const who = leaders.find(l => l.color === color) ?? leaders.find(l => l.color === 'black');
        const name = this.players[seat].name;
        if (!who) {
            this.log(`${name}：${COLOR_INFO[color].tile}を${cellName(cell)}に置きました`);
            return;
        }
        this.players[who.seat].scores[color] += 1;
        this.emit({ type: 'score', seat: who.seat, color, points: 1, cell });
        this.log(`${name}：${COLOR_INFO[color].tile}を${cellName(cell)}に置き、${this.players[who.seat].name}が${COLOR_INFO[color].name}1点`);
    }

    // タイルを置いたあと：記念碑を建てられるか
    afterTile(cell, color) {
        const squares = this.monumentSquares(cell, color);
        if (squares.length && this.monuments.some(m => m.cell === null && m.colors.includes(color))) {
            this.phase = 'monument';
            this.monumentChoice = { color, squares };
            return;
        }
        this.completeAction();
    }

    monumentSquares(cell, color) {
        return squaresWith(cell).filter(top => squareCells(top).every(c => this.board[c]?.kind === 'tile' && this.board[c].color === color));
    }

    cmd_monument(seat, { cell, monument }) {
        const choice = this.monumentChoice;
        if (!choice.squares.includes(cell)) return this.fail('その場所には建てられません');
        const m = this.monuments[monument];
        if (!Number.isInteger(monument) || !m || m.cell !== null || !m.colors.includes(choice.color)) return this.fail('その記念碑は建てられません');
        squareCells(cell).forEach(c => { this.board[c] = { kind: 'mon', id: monument }; });
        m.cell = cell;
        this.monumentChoice = null;
        this.emit({ type: 'monument', seat, cell, monument });
        this.log(`${this.players[seat].name}：記念碑（${m.colors.map(c => COLOR_INFO[c].name).join('・')}）を建てました`);
        this.dropUnsupported();
        this.completeAction();
        return true;
    }

    cmd_skip() {
        this.monumentChoice = null;
        this.completeAction();
        return true;
    }

    // 指導者を置けるか（動かすときは、元の場所を空きとみなす）。置けなければ理由
    leaderError(seat, color, cell) {
        if (!isColor(color)) return '指導者を選んでください';
        if (!isCell(cell)) return '置くマスを選んでください';
        const from = this.players[seat].leaders[color];
        if (from === cell) return 'すでにそこにいます';
        if (this.board[cell]) return 'そこには置けません';
        if (isRiver(cell)) return '指導者は川に置けません';
        if (!this.templesAround(cell)) return '指導者は神殿のとなりに置きます';
        const skip = from === null ? null : new Set([from]);
        if (this.adjacentKingdoms(cell, skip).length > 1) return '2つの王国をつなぐ場所には置けません';
        return null;
    }

    cmd_leader(seat, { color, cell }) {
        const error = this.leaderError(seat, color, cell);
        if (error) return this.fail(error);
        const p = this.players[seat];
        const from = p.leaders[color];
        if (from !== null) this.board[from] = null;
        this.board[cell] = { kind: 'leader', seat, color };
        p.leaders[color] = cell;
        this.emit({ type: 'leader', seat, color, cell, from });
        this.log(`${p.name}：${COLOR_INFO[color].leader}を${cellName(cell)}に${from === null ? '置きました' : '動かしました'}`);
        // 同じ色の指導者がいる王国に入ったら内乱
        const rival = this.leadersIn(this.region(cell)).find(l => l.color === color && l.seat !== seat);
        if (rival) {
            this.startConflict('revolt', 'red', { seat, cell }, { seat: rival.seat, cell: rival.cell }, color);
            return true;
        }
        this.completeAction();
        return true;
    }

    cmd_withdraw(seat, { color }) {
        if (!isColor(color)) return this.fail('指導者を選んでください');
        const p = this.players[seat];
        const cell = p.leaders[color];
        if (cell === null) return this.fail('その指導者は盤にいません');
        this.board[cell] = null;
        p.leaders[color] = null;
        this.emit({ type: 'withdraw', seat, color, cell });
        this.log(`${p.name}：${COLOR_INFO[color].leader}を手元に戻しました`);
        this.completeAction();
        return true;
    }

    catastropheError(seat, cell) {
        if (this.players[seat].catastrophes <= 0) return '大災害はもうありません';
        if (!isCell(cell)) return '置くマスを選んでください';
        const x = this.board[cell];
        if (x && x.kind !== 'tile') return 'そこには置けません';
        if (this.hasTreasure(cell)) return '宝物のある神殿には置けません';
        return null;
    }

    cmd_catastrophe(seat, { cell }) {
        const error = this.catastropheError(seat, cell);
        if (error) return this.fail(error);
        const p = this.players[seat];
        const removed = this.board[cell]?.color ?? null;
        this.board[cell] = { kind: 'cat' };
        p.catastrophes -= 1;
        this.emit({ type: 'catastrophe', seat, cell, removed });
        this.log(`${p.name}：大災害を${cellName(cell)}に${removed ? `置き、${COLOR_INFO[removed].tile}を壊しました` : '置きました'}`);
        this.dropUnsupported();
        this.completeAction();
        return true;
    }

    cmd_swap(seat, { tiles }) {
        const p = this.players[seat];
        if (!Array.isArray(tiles) || !tiles.length || tiles.length > HAND_SIZE || !tiles.every(isColor)) return this.fail('捨てるタイルを選んでください');
        const rest = [...p.hand];
        for (const c of tiles) {
            const i = rest.indexOf(c);
            if (i < 0) return this.fail('そのタイルは持っていません');
            rest.splice(i, 1);
        }
        p.hand = rest;
        this.draw(p, tiles.length);
        this.emit({ type: 'swap', seat, count: tiles.length });
        this.log(`${p.name}：手札を${tiles.length}枚取り替えました`);
        this.completeAction();
        return true;
    }

    cmd_pass(seat) {
        this.emit({ type: 'pass', seat });
        this.log(`${this.players[seat].name}：見送りました`);
        this.completeAction();
        return true;
    }

    // ---- 争い ----

    // kind: revolt（内乱）/ war（外乱）。color は争う色（内乱は赤で支える）。leaderColor は争う指導者の色
    startConflict(kind, color, attacker, defender, leaderColor) {
        const base = (side) => (kind === 'revolt' ? this.templesAround(side.cell) : this.warStrength(side.cell, leaderColor));
        this.conflict = {
            kind, color, leaderColor,
            attacker: { ...attacker, base: base(attacker), commit: null },
            defender: { ...defender, base: base(defender), commit: null }
        };
        this.phase = 'support';
        const c = this.conflict;
        this.emit({ type: 'conflict', kind, color: leaderColor, attacker: c.attacker.seat, defender: c.defender.seat });
        this.log(`${kind === 'revolt' ? '内乱' : '外乱'}（${COLOR_INFO[leaderColor].leader}）：${this.players[c.attacker.seat].name} ${c.attacker.base} 対 ${this.players[c.defender.seat].name} ${c.defender.base}`);
    }

    // 外乱の強さ：指導者の側の王国（つないだタイルを除く）の、その色のタイルの数
    warStrength(leaderCell, color) {
        const skip = new Set([this.war.cell]);
        return this.region(leaderCell, skip).filter(c => this.board[c]?.kind === 'tile' && this.board[c].color === color).length;
    }

    cmd_support(seat, { count }) {
        const c = this.conflict;
        const side = c.attacker.commit === null ? c.attacker : c.defender;
        const p = this.players[seat];
        const have = p.hand.filter(x => x === c.color).length;
        if (!Number.isInteger(count) || count < 0 || count > have) return this.fail(`出せる${COLOR_INFO[c.color].tile}は${have}枚までです`);
        for (let i = 0; i < count; i++) p.hand.splice(p.hand.indexOf(c.color), 1);
        side.commit = count;
        this.emit({ type: 'support', seat, count, color: c.color });
        if (count) this.log(`${p.name}：${COLOR_INFO[c.color].tile}を${count}枚出しました`);
        if (side === c.defender) this.resolveConflict();
        return true;
    }

    resolveConflict() {
        const c = this.conflict;
        const a = c.attacker.base + c.attacker.commit;
        const d = c.defender.base + c.defender.commit;
        const [winner, loser] = a > d ? [c.attacker, c.defender] : [c.defender, c.attacker];
        const color = c.leaderColor;
        // 外乱では、負けた側の王国の、その色のタイルも取り除く（指導者を取り除く前に数える）
        const removed = c.kind === 'war' ? this.loserTiles(loser.cell, color) : [];
        this.board[loser.cell] = null;
        this.players[loser.seat].leaders[color] = null;
        removed.forEach(cell => { this.board[cell] = null; });
        const points = 1 + removed.length;
        const scoreColor = c.kind === 'revolt' ? 'red' : color;
        this.players[winner.seat].scores[scoreColor] += points;
        this.emit({ type: 'resolve', kind: c.kind, color, winner: winner.seat, loser: loser.seat, strength: [a, d], removed, points, scoreColor });
        this.log(`${this.players[winner.seat].name}の勝ち（${a} 対 ${d}）。${this.players[loser.seat].name}の${COLOR_INFO[color].leader}が退き、${this.players[winner.seat].name}が${COLOR_INFO[scoreColor].name}${points}点`);
        this.conflict = null;
        this.dropUnsupported();
        if (c.kind === 'revolt') this.completeAction();
        else this.nextWar();
    }

    // 外乱で負けた側から取り除くタイル：負けた指導者の側の王国（つないだタイルを除く）の、その色のタイル
    // 宝物の神殿と、ほかの指導者を支える神殿（負けた指導者のほかの指導者のとなり）は残す
    loserTiles(leaderCell, color) {
        const cells = this.region(leaderCell, new Set([this.war.cell]));
        return cells.filter(cell => {
            const x = this.board[cell];
            if (x?.kind !== 'tile' || x.color !== color) return false;
            if (color === 'red' && (this.hasTreasure(cell) || NEIGHBORS[cell].some(nb => nb !== leaderCell && this.board[nb]?.kind === 'leader'))) return false;
            return true;
        });
    }

    // 外乱の次の争いへ。残っていなければ、つないだタイルを王国に戻す
    nextWar() {
        const w = this.war;
        const skip = new Set([w.cell]);
        w.pending = w.pending.filter(f => {
            const [x, y] = f.cells;
            const ok = (cell) => this.board[cell]?.kind === 'leader' && this.board[cell].color === f.color && NEIGHBORS[w.cell].some(nb => this.region(nb, skip).includes(cell));
            return ok(x) && ok(y) && !this.region(x, skip).includes(y);
        });
        if (!w.pending.length) {
            this.war = null;
            this.afterTile(w.cell, w.color);
            return;
        }
        if (w.pending.length > 1) {
            this.phase = 'warOrder';
            return;
        }
        this.startWar(w.pending[0]);
    }

    cmd_war(seat, { color }) {
        const fight = this.war.pending.find(f => f.color === color);
        if (!fight) return this.fail('その争いはありません');
        this.startWar(fight);
        return true;
    }

    startWar(fight) {
        const w = this.war;
        w.pending = w.pending.filter(f => f !== fight);
        const sides = fight.cells.map(cell => ({ seat: this.board[cell].seat, cell }));
        // 手番の人が関わっていればその人、いなければ手番の人の次から数えて先の人が攻める
        const n = this.players.length;
        const order = (s) => (s - this.current + n) % n;
        sides.sort((x, y) => order(x.seat) - order(y.seat));
        this.startConflict('war', fight.color, sides[0], sides[1], fight.color);
    }

    // 神殿がとなりにない指導者を手元に戻す
    dropUnsupported() {
        this.players.forEach(p => COLORS.forEach(color => {
            const cell = p.leaders[color];
            if (cell === null || this.templesAround(cell)) return;
            this.board[cell] = null;
            p.leaders[color] = null;
            this.emit({ type: 'withdraw', seat: p.id, color, cell, forced: true });
            this.log(`${p.name}の${COLOR_INFO[color].leader}は、神殿を失って手元に戻りました`);
        }));
    }

    // ---- アクションと手番の終わり ----

    completeAction() {
        this.phase = 'action';
        this.collectTreasures();
        this.actionsLeft -= 1;
        if (this.actionsLeft > 0) return;
        this.endTurn();
    }

    // 宝物が2つ以上ある王国に商人がいれば、その持ち主が1つを残して取る（隅の宝物から）
    collectTreasures() {
        const seen = new Set();
        for (const start of [...this.treasures]) {
            if (seen.has(start)) continue;
            const cells = this.region(start);
            cells.forEach(c => seen.add(c));
            const here = this.treasures.filter(t => cells.includes(t));
            const trader = this.leadersIn(cells).find(l => l.color === 'green');
            if (here.length < 2 || !trader) continue;
            const order = [...here].sort((x, y) => (CORNER_TREASURES.has(y) - CORNER_TREASURES.has(x)) || x - y);
            const taken = order.slice(0, here.length - 1);
            this.treasures = this.treasures.filter(t => !taken.includes(t));
            const p = this.players[trader.seat];
            p.treasures += taken.length;
            this.emit({ type: 'treasure', seat: p.id, cells: taken });
            this.log(`${p.name}：宝物を${taken.length}つ取りました`);
        }
    }

    endTurn() {
        const p = this.players[this.current];
        // 記念碑：その色の指導者を、記念碑のある王国に置いていれば1点
        this.monuments.forEach((m, id) => {
            if (m.cell === null) return;
            const cells = this.region(m.cell);
            m.colors.forEach(color => {
                const l = this.leadersIn(cells).find(x => x.color === color && x.seat === p.id);
                if (!l) return;
                p.scores[color] += 1;
                this.emit({ type: 'score', seat: p.id, color, points: 1, monument: id });
                this.log(`${p.name}：記念碑で${COLOR_INFO[color].name}1点`);
            });
        });
        // 手番の人から時計回りに補充し、そのあとで終わりかを確かめる（FAQ の順：記念碑の点 → 補充 → 終わりの判定）
        const n = this.players.length;
        let short = false;
        for (let k = 0; k < n; k++) {
            const q = this.players[(this.current + k) % n];
            const need = HAND_SIZE - q.hand.length;
            if (need > this.bag.length) short = true;
            this.draw(q, need);
        }
        if (this.treasures.length <= 2) {
            this.finish('treasure');
            return;
        }
        if (short) {
            this.finish('bag');
            return;
        }
        this.current = (this.current + 1) % this.players.length;
        this.actionsLeft = ACTIONS_PER_TURN;
        this.turnNumber += 1;
        this.emit({ type: 'turn', seat: this.current });
    }

    finish(reason) {
        this.phase = 'end';
        this.endReason = reason;
        this.conflict = null;
        this.war = null;
        this.monumentChoice = null;
        const finals = this.players.map(p => finalValues(p.scores, p.treasures));
        const order = this.players.map(p => p.id).sort((x, y) => compareFinal(finals[y], finals[x]));
        this.winners = order.filter(i => compareFinal(finals[i], finals[order[0]]) === 0);
        this.emit({ type: 'end', winners: [...this.winners], reason });
        this.log(reason === 'treasure' ? '盤の宝物が2つ以下になりました' : '袋のタイルが足りなくなりました');
        this.log(`${this.winners.map(i => this.players[i].name).join('と')}の勝ち`);
    }

    finalValues(seat) {
        const p = this.players[seat];
        return finalValues(p.scores, p.treasures);
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
