/**
 * ツォロ（基本ゲーム、2〜8人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の順はシードから決まる）
 *
 * ルール（Calliope Games 2009 年の英語版のルールブックと、その FAQ）
 * - 6×6 の盤、道のタイル35枚、竜のタイル1枚、駒8つ。山をよく混ぜ、各自に3枚ずつ配る
 * - 最初の人から時計回りに、盤の縁の印（48か所）の空いているところに駒を置く。タイルを置くのは、全員が駒を置いてから
 * - 手番：1. 手札のタイル1枚を、自分の駒の前のマスに置く（どの向きでもよい）
 *         2. 駒を動かす。自分の駒と、そのタイルに面しているほかの駒を、道の終わりまで進める
 *         3. タイルを引く
 * - 自分の道を盤の縁につなぐ置き方（自分から脱落する置き方）は、ほかに置き方がないときしかできない
 * - 盤の外に出た駒は脱落。2つの駒が出会ったら（道がつながってぶつかったら）両方とも脱落
 * - 脱落した人の手札は山に入れて混ぜる
 * - 引く：初めのうちは手番の人だけが1枚引く。手札が3枚に満たない人がいれば、手番の人から時計回りに1枚ずつ、
 *   全員が3枚になるか山がなくなるまで引く
 * - 竜のタイル（3人以上のときだけ使う）：山が空で引けなかった人は、竜のタイルを取る（その手番はもう引かない）。
 *   あとでタイルが山に戻ったら、手番の人ではなく竜のタイルを持つ人から引き始め、引いたら竜のタイルを手放す
 *   竜のタイルを持つ人が脱落したら、時計回りで次の、手札が3枚に満たない人に渡す
 * - 盤に残った駒が1つになったら、その人の勝ち。残りの全員が同じ手で脱落したら、その人たちの引き分け。
 *   タイルがすべて置かれたときに2人以上残っていれば、残った人たちの引き分け
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 最初の人：ルールブックは「最年長の人」。ここではシードで決める
 * - 自分から脱落する置き方には、ほかの駒との衝突も含める（衝突した道は、相手の来た道をたどって盤の縁につながっているため）
 * - 竜のタイルを持つ人が脱落し、手札が3枚に満たない人がいなければ、竜のタイルはだれも持たない
 * - 手番に手札が1枚もない人（山が空のとき）は、置かずに次の人へ回す
 */

import { createRandom, shuffle } from './random.js';
import { TILE_COUNT, CELLS, HAND_SIZE, START_MARKS, simulate, pointKey } from './tiles.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const DRAGON_MIN_PLAYERS = 3;
const MAX_LOGS = 500;
const MAX_EVENTS = 150;

export const COMMAND_FIELDS = { place: ['mark'], play: ['tile', 'rotation'] };

const isInt = (v) => Number.isInteger(v);

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜8人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        const n = players.length;
        this.pile = shuffle(Array.from({ length: TILE_COUNT }, (_, i) => i), this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            hand: [], mark: null, pos: null, alive: true, out: null, outTurn: null, trail: []
        }));
        for (let i = 0; i < HAND_SIZE; i++) this.players.forEach(p => p.hand.push(this.pile.shift()));
        this.first = Math.floor(this.random() * n);
        this.current = this.first;
        this.useDragon = n >= DRAGON_MIN_PLAYERS;
        this.dragon = null;          // 竜のタイルを持つ人
        this.board = Array(CELLS).fill(null);  // { tile, rot, seat }
        this.placed = 0;
        this.phase = 'place';        // place：駒を置く / play：手番 / end
        this.winners = null;
        this.turn = 0;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.first].name}から、駒を縁に置きます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    alive() {
        return this.players.filter(p => p.alive);
    }

    markers() {
        return this.players.filter(p => p.alive && p.pos).map(p => ({ seat: p.id, pos: p.pos }));
    }

    // 時計回りで seat の次から、条件に合う人を探す
    nextSeat(seat, test) {
        const n = this.players.length;
        for (let i = 1; i <= n; i++) {
            const s = (seat + i) % n;
            if (test(this.players[s])) return s;
        }
        return null;
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const handler = { place: { place: this.placeMarker }, play: { play: this.playTile } }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 駒を置く ----

    freeMarks() {
        const used = new Set(this.players.map(p => p.mark).filter(m => m !== null));
        return START_MARKS.map((_, i) => i).filter(i => !used.has(i));
    }

    placeMarker(seat, { mark }) {
        if (!isInt(mark) || mark < 0 || mark >= START_MARKS.length) return this.fail('置く場所が正しくありません');
        if (this.players.some(p => p.mark === mark)) return this.fail('そこにはもう駒があります');
        const p = this.players[seat];
        p.mark = mark;
        p.pos = { ...START_MARKS[mark] };
        this.pushEvent({ type: 'place', seat, mark });
        const next = this.nextSeat(seat, q => q.mark === null);
        if (next === null) {
            this.phase = 'play';
            this.current = this.first;
            this.log(`${this.players[this.first].name}から、タイルを置きます`);
        } else {
            this.current = next;
        }
        return true;
    }

    // ---- タイルを置く ----

    // 手札のタイルを置いたときの結果（盤は変えない）
    preview(seat, tile, rot) {
        const p = this.players[seat];
        return simulate(this.board, this.markers(), p.pos.cell, { tile, rot });
    }

    selfOut(seat, tile, rot) {
        return this.preview(seat, tile, rot).some(m => m.seat === seat && m.out);
    }

    // 自分が脱落しない置き方があるか
    hasSafeMove(seat) {
        return this.players[seat].hand.some(tile => [0, 1, 2, 3].some(rot => !this.selfOut(seat, tile, rot)));
    }

    playTile(seat, { tile, rotation }) {
        const p = this.players[seat];
        if (!isInt(tile) || !p.hand.includes(tile)) return this.fail('そのタイルは手札にありません');
        if (!isInt(rotation) || rotation < 0 || rotation > 3) return this.fail('向きが正しくありません');
        const moves = this.preview(seat, tile, rotation);
        if (moves.some(m => m.seat === seat && m.out) && this.hasSafeMove(seat)) {
            return this.fail('自分の駒が脱落する置き方は、ほかに置けるときはできません');
        }
        // ここから状態を変える
        const cell = p.pos.cell;
        this.board[cell] = { tile, rot: rotation, seat };
        this.placed++;
        this.turn++;
        p.hand.splice(p.hand.indexOf(tile), 1);
        const out = [];
        moves.forEach(m => {
            const q = this.players[m.seat];
            q.trail.push(...m.segs);
            q.pos = m.pos;
            if (m.out) {
                q.alive = false;
                q.out = m.out;
                q.outTurn = this.turn;
                out.push(q);
            }
        });
        this.pushEvent({ type: 'play', seat, cell, tile, rot: rotation, moves: moves.map(m => ({ seat: m.seat, segs: m.segs, out: m.out })) });
        if (out.length) {
            this.log(`${p.name}がタイルを置き、${out.map(q => `${q.name}${q.out === 'edge' ? 'が盤の外へ' : 'がぶつかって'}`).join('、')}脱落`);
        }
        this.afterElimination(out);
        if (this.checkEnd(out)) return true;
        this.drawTiles(seat);
        // 残った人の手札が全部なくなったら、タイルはすべて置かれている
        if (!this.alive().some(q => q.hand.length)) this.finish(this.alive().map(q => q.id));
        else this.advance(seat);
        return true;
    }

    // 脱落した人の手札を山に戻して混ぜる。竜のタイルを渡す
    afterElimination(out) {
        if (!out.length) return;
        const returned = out.flatMap(q => q.hand.splice(0));
        if (returned.length) {
            this.pile.push(...returned);
            shuffle(this.pile, this.random);
        }
        if (this.dragon !== null && !this.players[this.dragon].alive) {
            const from = this.dragon;
            this.dragon = this.nextSeat(from, q => q.alive && q.hand.length < HAND_SIZE);
            if (this.dragon !== null) this.log(`竜のタイルは${this.players[this.dragon].name}へ`);
        }
    }

    checkEnd(out) {
        const alive = this.alive();
        let winners = null;
        if (alive.length === 0) winners = out.map(q => q.id);
        else if (alive.length === 1) winners = [alive[0].id];
        else if (this.placed >= TILE_COUNT) winners = alive.map(q => q.id);
        if (!winners) return false;
        this.finish(winners);
        return true;
    }

    finish(winners) {
        this.phase = 'end';
        this.winners = winners;
        this.dragon = null;
        const names = winners.map(s => this.players[s].name).join('・');
        this.log(winners.length === 1 ? `${names}の勝ち` : `${names}の引き分け`);
        this.pushEvent({ type: 'end', winners: [...winners] });
    }

    // 手札が3枚に満たない人が、1枚ずつ順に引く（竜のタイルを持つ人から。いなければ手番の人から）
    drawTiles(active) {
        const startSeat = this.dragon ?? (this.players[active].alive ? active : this.nextSeat(active, q => q.alive));
        const n = this.players.length;
        const order = Array.from({ length: n }, (_, i) => (startSeat + i) % n).filter(s => this.players[s].alive);
        let drew = true;
        while (drew) {
            drew = false;
            for (const s of order) {
                const q = this.players[s];
                if (q.hand.length >= HAND_SIZE) continue;
                if (!this.pile.length) {
                    if (this.useDragon && this.dragon === null) {
                        this.dragon = s;
                        this.log(`山が空。${q.name}が竜のタイルを取りました`);
                        this.pushEvent({ type: 'dragon', seat: s });
                    }
                    return;
                }
                q.hand.push(this.pile.shift());
                if (this.dragon === s) this.dragon = null;
                drew = true;
            }
        }
    }

    // 次の人へ（脱落した人と、手札のない人は飛ばす）
    advance(seat) {
        const next = this.nextSeat(seat, q => q.alive && q.hand.length > 0);
        this.current = next ?? seat;
    }

    // ---- 記録 ----

    log(text) {
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    pushEvent(event) {
        this.events.push({ ...event, seq: ++this.eventSeq });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}

export { pointKey };
