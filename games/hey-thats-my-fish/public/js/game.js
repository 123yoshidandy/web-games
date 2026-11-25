/**
 * それはオレの魚だ！の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（氷の並びはシードから決まる）
 *
 * ルール（ルールブックによる）
 * - 六角の氷60枚（魚1匹30枚・2匹20枚・3匹10枚）を混ぜて、7枚と8枚の列が交互の8列に並べる
 * - ペンギンは 2人なら4羽、3人なら3羽、4人なら2羽ずつ
 * - 最初の人から順に1羽ずつ、魚1匹の空いている氷に置く。全員が置き終えたら、同じ人から動かし始める
 * - 手番：自分のペンギン1羽を、6方向のどれかにまっすぐ何マスでも動かす（向きは変えられない。穴とペンギンは越えられない）。
 *   動かしたら、出発した氷を取る
 * - 手番の始めにどのペンギンも動けない人は、ゲームから抜ける。ペンギンを全部取り除き、その下の氷を取る
 * - 全員が抜けたら終わり。魚の数の合計が多い人の勝ち。同じなら氷の枚数が多い人。それも同じなら、勝ちを分け合う
 *
 * ルールブックで分からない点は、次のように決めた（README にも書く）
 * - 最初の人はシードから決める。氷の並びはシードで混ぜるだけで、2匹と3匹の偏りは直さない
 * - 抜ける処理は、手番が回ってきたときに自動で行う（操作は要らない）
 */

import { createRandom, shuffle } from './random.js';
import { CELL_COUNT, slides } from './board.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const PENGUINS_PER_PLAYER = { 2: 4, 3: 3, 4: 2 };
export const FISH_COUNTS = { 1: 30, 2: 20, 3: 10 };
const MAX_LOGS = 400;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { place: ['cell'], move: ['penguin', 'to'] };

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const n = players.length;
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * n);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        // 氷：マスごとの魚の数（取られたら 0）
        this.fish = shuffle(Object.entries(FISH_COUNTS).flatMap(([f, k]) => Array(k).fill(Number(f))), this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            catch: [], // 取った氷の魚の数
            out: false
        }));
        // ペンギン：{ owner, cell }（cell が null なら、まだ置いていないか、取り除いた）
        this.perPlayer = PENGUINS_PER_PLAYER[n];
        this.penguins = [];
        for (let k = 0; k < this.perPlayer; k++) this.players.forEach(p => this.penguins.push({ owner: p.id, cell: null, removed: false }));
        this.penguins.sort((a, b) => a.owner - b.owner);
        this.current = this.options.startPlayer;
        this.phase = 'place'; // place：置く / move：動かす / end
        this.placed = 0;
        this.turnNumber = 1;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}から、ペンギンを置きます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    alive(cell) {
        return this.fish[cell] > 0;
    }

    occupied(cell) {
        return this.penguins.some(p => p.cell === cell);
    }

    // 置けるマス（魚1匹で、ペンギンがいない）
    placeable() {
        return Array.from({ length: CELL_COUNT }, (_, c) => c).filter(c => this.fish[c] === 1 && !this.occupied(c));
    }

    // ペンギンの動ける先
    movesOf(index) {
        const p = this.penguins[index];
        if (p.cell === null) return [];
        return slides(p.cell, c => this.alive(c), c => this.occupied(c));
    }

    // その人の動けるペンギンの番号
    movablePenguins(seat) {
        return this.penguins.map((p, i) => i).filter(i => this.penguins[i].owner === seat && this.movesOf(i).length);
    }

    score(seat) {
        const c = this.players[seat].catch;
        return { fish: c.reduce((s, f) => s + f, 0), tiles: c.length };
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { place: { place: this.place }, move: { move: this.move } }[this.phase]?.[command.type];
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

    place(seat, { cell }) {
        if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return this.fail('そのマスはありません');
        if (this.fish[cell] !== 1) return this.fail('置けるのは魚1匹の氷だけです');
        if (this.occupied(cell)) return this.fail('もうペンギンがいます');
        const index = this.penguins.findIndex(p => p.owner === seat && p.cell === null && !p.removed);
        this.penguins[index].cell = cell;
        this.placed += 1;
        this.emit({ type: 'place', seat, penguin: index, cell });
        this.log(`${this.players[seat].name}がペンギンを置きました`);
        if (this.placed === this.penguins.length) {
            this.phase = 'move';
            this.current = this.options.startPlayer;
            this.log('全員が置き終えました。動かし始めます');
            this.startTurn();
        } else {
            this.current = (this.current + 1) % this.players.length;
        }
        return true;
    }

    // ---- 動かす ----

    move(seat, { penguin, to }) {
        const p = Number.isInteger(penguin) ? this.penguins[penguin] : null;
        if (!p || p.owner !== seat || p.cell === null) return this.fail('そのペンギンは動かせません');
        if (!Number.isInteger(to) || !this.movesOf(penguin).includes(to)) return this.fail('そこへは動けません');
        const from = p.cell;
        const fish = this.fish[from];
        p.cell = to;
        this.fish[from] = 0;
        this.players[seat].catch.push(fish);
        this.emit({ type: 'move', seat, penguin, from, to, fish });
        this.log(`${this.players[seat].name}が魚${fish}匹の氷を取りました`);
        this.nextTurn();
        return true;
    }

    nextTurn() {
        const n = this.players.length;
        let next = this.current;
        for (let k = 0; k < n; k++) {
            next = (next + 1) % n;
            if (!this.players[next].out) break;
        }
        this.current = next;
        this.turnNumber += 1;
        this.startTurn();
    }

    // 手番の始め：動けなければ抜ける（ペンギンを取り除き、その下の氷を取る）。全員が抜けたら終わり
    startTurn() {
        const n = this.players.length;
        for (let k = 0; k <= n; k++) {
            const seat = this.current;
            const p = this.players[seat];
            if (!p.out && this.movablePenguins(seat).length) {
                this.emit({ type: 'turn', seat });
                return;
            }
            if (!p.out) this.retire(seat);
            if (this.players.every(q => q.out)) return this.finish();
            let next = seat;
            do next = (next + 1) % n; while (this.players[next].out);
            this.current = next;
        }
    }

    retire(seat) {
        const p = this.players[seat];
        const cells = [];
        this.penguins.forEach(pg => {
            if (pg.owner !== seat || pg.cell === null) return;
            cells.push(pg.cell);
            p.catch.push(this.fish[pg.cell]);
            this.fish[pg.cell] = 0;
            pg.cell = null;
            pg.removed = true;
        });
        p.out = true;
        this.emit({ type: 'retire', seat, cells });
        const fish = cells.length ? `（足もとの氷${cells.length}枚を取りました）` : '';
        this.log(`${p.name}はもう動けません${fish}`);
    }

    finish() {
        this.phase = 'end';
        const scores = this.players.map(p => this.score(p.id));
        const best = scores.reduce((b, s) => (s.fish > b.fish || (s.fish === b.fish && s.tiles > b.tiles) ? s : b));
        this.winners = this.players.map(p => p.id).filter(id => scores[id].fish === best.fish && scores[id].tiles === best.tiles);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ち`);
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
