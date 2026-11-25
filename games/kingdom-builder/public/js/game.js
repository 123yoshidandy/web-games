/**
 * キングダムビルダー（基本ゲーム、2〜4人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（盤面・王のカード・山の並びはシードから決まる）
 *
 * 準備：8枚の盤面から4枚を選んで並べる（それぞれ 180度回すこともある）。場所のマスに同じ種類のタイルを2枚ずつ置く。
 *       王のカード10種から3枚。地形カード25枚（5種×5枚）を混ぜ、1人1枚ずつ配る。家は1人40軒
 * 手番：手札の地形カードを見せ、その地形に家を3軒、1軒ずつ建てる（必須）。場所タイルは、必須の前か後に各1回使える。
 *       終わったらカードを捨て、1枚引く
 * 終わり：だれかが最後の家を建てたら、その巡（最初の人の右隣の人の手番）まで続けて終わり。
 *        王のカード3枚と城（隣接する城1つにつき3点）の合計がいちばん多い人の勝ち。同点なら勝ちを分け合う
 *
 * ルールブックの本文だけでは分かりにくい点は、資料によって次のようにした（README に出典を書く）
 * - 納屋と港で家を動かすときは、動かす家を取り除いてから「できれば自分の家の隣に」を判定する（BGG の FAQ）
 * - 一度タイルを失った場所からは、もう取れない（BGG の FAQ）
 * - 領主：同数の1位は全員12点。2位は、1位の次に多い数の人（同数なら全員6点）（ルールブックの例と注）
 * - 手札の地形に建てられるマスがなくなったら（手番の初めでも途中でも）、そのカードを取り除いて引き直す（ルールブック）
 * 資料で分からない、または資料と違う形にした点
 * - 領主：家のない盤面では点にならない（BGG の FAQ は0軒の人も順位に入れる）
 * - 必須の3軒の途中で家がなくなったら、必須の行動はそこで終わり
 */

import { createRandom, shuffle } from './random.js';
import { BOARD_IDS, BUILDABLE, CARDS_PER_TERRAIN, KING_CARD_IDS, LOCATIONS, TILES_PER_LOCATION, TERRAINS, buildMap } from './boards.js';
import { CELLS, NEIGHBORS } from './hex.js';
import { buildTargets, tileTargets, inMandatory, scoreAll } from './rules.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const HOUSES = 40;
export const MANDATORY = 3;
const MAX_LOGS = 400;
const MAX_EVENTS = 60;

export const COMMAND_FIELDS = {
    build: ['cell'],
    tile: ['tile', 'from', 'cell'],
    end: []
};

const isCell = (v) => Number.isInteger(v) && v >= 0 && v < CELLS;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, boards?: [{ id, rot }×4], cards?: [王のカード×3] }
    constructor(players, options = {}) {
        const n = players.length;
        if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 乱数の使い方を毎回そろえるため、指定があっても先に引いてから差し替える
        const boards = shuffle([...BOARD_IDS], this.random).slice(0, 4).map(id => ({ id, rot: this.random() < 0.5 }));
        const cards = shuffle([...KING_CARD_IDS], this.random).slice(0, 3);
        this.options = { seed, boards: options.boards ?? boards, cards: options.cards ?? cards };
        this.boards = this.options.boards.map(b => ({ id: b.id, rot: !!b.rot }));
        this.cards = [...this.options.cards];
        const map = buildMap(this.boards);
        this.terrain = map.terrain;
        this.locations = map.locations.map(l => ({ ...l, tiles: TILES_PER_LOCATION }));
        this.owner = Array(CELLS).fill(-1);
        this.deck = shuffle(BUILDABLE.flatMap(t => Array(CARDS_PER_TERRAIN).fill(t)), this.random);
        this.discard = [];
        this.removed = [];         // 建てる場所がなくて取り除いた地形カード
        this.start = Math.floor(this.random() * n);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            supply: HOUSES, card: null, tiles: [], lost: []
        }));
        for (let k = 0; k < n; k++) this.players[(this.start + k) % n].card = this.draw();
        this.active = this.start;
        this.turn = 1;
        this.round = 1;
        this.phase = 'play';       // play：手番 / end：終わり
        this.built = 0;            // この手番に必須の行動で建てた数
        this.mandatoryDone = false;
        this.finalRound = false;
        this.scores = null;
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.start].name}から始めます`);
        this.beginTurn();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`記録の${i + 1}手目を再現できません：${game.lastError}`);
        });
        return game;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: structuredClone(this.options),
            commands: structuredClone(this.commands)
        };
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人
    actors() {
        return this.phase === 'play' ? [this.active] : [];
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        const error = this.check(playerId, command);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.events = [];
        const clean = Object.fromEntries(COMMAND_FIELDS[command.type].filter(k => command[k] !== undefined).map(k => [k, command[k]]));
        this.commands.push({ playerId, command: { type: command.type, ...clean } });
        this.execute(playerId, command);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
        return true;
    }

    // 状態を変えずに、操作が通るかを確かめる。通らなければ理由を返す
    check(seat, command) {
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return '知らない操作です';
        if (this.phase !== 'play') return 'ゲームは終わっています';
        if (seat !== this.active) return '手番ではありません';
        const player = this.players[seat];
        switch (command.type) {
            case 'build':
                if (this.mandatoryDone) return '3軒建て終えています';
                if (!isCell(command.cell) || !buildTargets(this, seat).includes(command.cell)) return 'そこには建てられません';
                return null;
            case 'tile': {
                const type = command.tile;
                if (!Object.hasOwn(LOCATIONS, type)) return '知らないタイルです';
                if (inMandatory(this)) return '3軒建て終えてから使えます';
                if (!player.tiles.some(t => t.type === type && !t.fresh && !t.used)) return 'そのタイルは今は使えません';
                const move = LOCATIONS[type].kind === 'move';
                if (move && (!isCell(command.from) || this.owner[command.from] !== seat)) return '動かす家を選んでください';
                if (!move && command.from !== undefined) return '動かす家は選べません';
                if (!isCell(command.cell) || !tileTargets(this, seat, type, move ? command.from : -1).includes(command.cell)) return 'そこには置けません';
                return null;
            }
            case 'end':
                if (!this.mandatoryDone) return '先に3軒建ててください';
                return null;
            default:
                return '知らない操作です';
        }
    }

    execute(seat, command) {
        const player = this.players[seat];
        switch (command.type) {
            case 'build':
                this.place(seat, command.cell);
                this.built++;
                this.emit({ type: 'build', seat, cell: command.cell });
                this.log(`${player.name}が${TERRAINS[this.terrain[command.cell]].name}に建てた`);
                if (this.built >= MANDATORY || player.supply === 0) this.mandatoryDone = true;
                break;
            case 'tile': {
                const tile = player.tiles.find(t => t.type === command.tile && !t.fresh && !t.used);
                tile.used = true;
                const name = LOCATIONS[command.tile].name;
                if (LOCATIONS[command.tile].kind === 'move') {
                    this.owner[command.from] = -1;
                    this.place(seat, command.cell, false);
                    this.emit({ type: 'move', seat, from: command.from, cell: command.cell, tile: command.tile });
                    this.log(`${player.name}が${name}で家を動かした`);
                    this.dropTiles(seat);
                } else {
                    this.place(seat, command.cell);
                    this.emit({ type: 'build', seat, cell: command.cell, tile: command.tile });
                    this.log(`${player.name}が${name}で${TERRAINS[this.terrain[command.cell]].name}に建てた`);
                }
                break;
            }
            case 'end':
                this.endTurn();
                return;
        }
        this.checkCard();
    }

    // 家を置き、隣の場所のタイルを取る。fromSupply が false なら、動かした家
    place(seat, cell, fromSupply = true) {
        const player = this.players[seat];
        this.owner[cell] = seat;
        if (fromSupply) player.supply--;
        for (const n of NEIGHBORS[cell]) {
            if (this.terrain[n] !== 'L') continue;
            const loc = this.locations.find(l => l.cell === n);
            if (loc.tiles <= 0 || player.tiles.some(t => t.loc === n) || player.lost.includes(n)) continue;
            loc.tiles--;
            player.tiles.push({ type: loc.type, loc: n, fresh: true, used: false });
            this.emit({ type: 'take', seat, loc: n, tile: loc.type });
            this.log(`${player.name}が${LOCATIONS[loc.type].name}のタイルを取った`);
        }
        if (fromSupply && player.supply === 0 && !this.finalRound) {
            this.finalRound = true;
            this.log(`${player.name}が家を建て終えた。この巡で終わり`);
        }
    }

    // 家を動かしたあと、隣に自分の家がなくなった場所のタイルを返す（ゲームから取り除く）。その場所からは、もう取れない
    dropTiles(seat) {
        const player = this.players[seat];
        player.tiles = player.tiles.filter(t => {
            if (NEIGHBORS[t.loc].some(n => this.owner[n] === seat)) return true;
            if (!player.lost.includes(t.loc)) player.lost.push(t.loc);
            this.emit({ type: 'drop', seat, loc: t.loc, tile: t.type });
            this.log(`${player.name}が${LOCATIONS[t.type].name}のタイルを失った`);
            return false;
        });
    }

    // 必須の行動が残っているのに、手札の地形に建てられるマスがなければ、カードを取り除いて引き直す
    checkCard() {
        const player = this.players[this.active];
        while (!this.mandatoryDone) {
            if (player.supply === 0) { this.mandatoryDone = true; break; }
            if (player.card && buildTargets(this, this.active).length > 0) break;
            if (player.card) {
                this.removed.push(player.card);
                this.log(`${TERRAINS[player.card].name}に建てられる場所がないので、引き直した`);
            }
            player.card = this.draw();
            if (!player.card) { this.mandatoryDone = true; break; }
        }
    }

    draw() {
        if (this.deck.length === 0 && this.discard.length > 0) {
            this.deck = shuffle(this.discard, this.random);
            this.discard = [];
            this.log('捨て札を混ぜて山にした');
        }
        return this.deck.shift() ?? null;
    }

    beginTurn() {
        this.built = 0;
        this.mandatoryDone = false;
        const player = this.players[this.active];
        this.emit({ type: 'turn', seat: this.active });
        this.checkCard();
        if (player.card) this.log(`${player.name}の番：${TERRAINS[player.card].name}`);
    }

    endTurn() {
        const player = this.players[this.active];
        if (player.card) this.discard.push(player.card);
        player.card = this.draw();
        player.tiles.forEach(t => { t.fresh = false; t.used = false; });
        const n = this.players.length;
        this.active = (this.active + 1) % n;
        this.turn++;
        if (this.active === this.start) {
            if (this.finalRound) {
                this.finish();
                return;
            }
            this.round++;
        }
        this.beginTurn();
    }

    finish() {
        this.phase = 'end';
        this.scores = scoreAll(this);
        const best = Math.max(...this.scores.map(s => s.total));
        this.winners = this.players.filter((_, i) => this.scores[i].total === best).map(p => p.id);
        this.log(`終わり。${this.winners.map(i => this.players[i].name).join('・')}の勝ち（${best}点）`);
        this.emit({ type: 'end' });
    }

    emit(event) {
        this.events.push({ ...event, seq: ++this.eventSeq });
    }

    log(text) {
        this.logs.push(text);
    }
}
