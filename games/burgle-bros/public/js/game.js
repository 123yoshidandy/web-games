/**
 * バーグルブロスのルールと状態（DOM に依存しない）
 * 操作はすべて applyCommand(seat, command) に通して記録する。Game.replay で記録から同じ局面を作り直せる
 * 乱数はシード付き（random.js）だけを使う
 *
 * 手番：アクションを4つまで（移動・のぞく・金庫にダイスを足す・金庫を破る・ハック・階段・得意・道具）
 * 手番の終わりに、手番の人がいる階の見張りが速さの数だけ動く（警報があれば警報へ、なければ巡回の行き先へ）
 */

import { createRandom, shuffle } from './random.js';
import {
    CELLS, ACTIONS_PER_TURN, START_STEALTH, MAX_DICE, MAX_HACK, MAX_SPEED, LAVATORY_TOKENS, BASE_SPEED, WALLS_PER_FLOOR,
    MIN_PLAYERS, MAX_PLAYERS, ROOMS, CHARACTER_KEYS, CHARACTERS, TOOLS, TOOL_KEYS, LOOT, HACK_TYPES, HACK_NAMES,
    SIZE, neighbors, wallKey, idOf, floorOf, cellOf, safeLine, cellLabel
} from './data.js';
import {
    tileAt, playersAt, topFloor, allCracked, guardNeighbors, occupied, moveTargets, peekTargets, peekCost,
    canUp, canDown, canRoof, canAddDie, canCrack, canHack, juiceTargets, canSpot, guardTarget, guardStep, alarmCells, guardDistances
} from './rules.js';

export { MIN_PLAYERS, MAX_PLAYERS };

export const END_REASONS = {
    escaped: '全員が屋上から逃げ切った',
    caught: '隠れきれずに見つかった'
};

// 端末から受け付ける操作と、記録する項目
export const COMMAND_FIELDS = {
    move: ['to'],
    peek: ['to'],
    addDie: [],
    crack: [],
    hack: [],
    up: [],
    down: [],
    roof: [],
    juice: ['to'],
    spot: [],
    spotKeep: [],
    spotBottom: [],
    tool: ['tool', 'to'],
    pass: []
};

// 始まりの部屋にしてよい種類（警報・扉・金庫・階段・研究室でないもの）
const START_ROOMS = ['atrium', 'camera', 'foyer', 'lavatory', 'secret', 'duct', 'fpComputer', 'laserComputer', 'motionComputer', 'walkway'];
const floorName = (f) => `${f + 1}階`;
const at = (f, cell) => `${floorName(f)}${cellLabel(cell)}`;

export default class Game {
    // players: [{ name, isCPU }]。options: { seed, floors（1〜3）, chars（泥棒の並び。省けばシードで配る） }
    constructor(players, options = {}) {
        if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数が違います');
        const floors = [1, 2, 3].includes(Number(options.floors)) ? Number(options.floors) : 2;
        this.options = { seed: options.seed >>> 0, floors };
        if (Array.isArray(options.chars)) this.options.chars = [...options.chars];
        this.random = createRandom(this.options.seed);
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.result = null;
        this.lastError = null;
        this.lastRoll = null;
        this.spotted = null;
        this.hacks = { fingerprint: 0, laser: 0, motion: 0 };
        this.crackedCount = 0;
        this.invisible = [];

        const chars = this.options.chars && this.options.chars.length === players.length && this.options.chars.every(c => CHARACTER_KEYS.includes(c)) && new Set(this.options.chars).size === players.length
            ? this.options.chars
            : shuffle([...CHARACTER_KEYS], this.random).slice(0, players.length);
        this.setupBuilding(floors);
        const start = [0, SIZE - 1, CELLS - SIZE, CELLS - 1][Math.floor(this.random() * 4)];
        this.prepareStart(start);
        this.players = players.map((p, i) => ({
            id: i, name: String(p.name ?? `${i + 1}P`), isCPU: !!p.isCPU, char: chars[i],
            floor: 0, cell: start, stealth: START_STEALTH, tools: [], loot: [], escaped: false
        }));
        this.toolDeck = shuffle([...TOOL_KEYS], this.random);
        this.lootDeck = shuffle([...LOOT], this.random);
        this.floors[0].tiles[start].revealed = true;
        this.log(`${floorName(0)}の${cellLabel(start)}（${ROOMS[this.floors[0].tiles[start].type].name}）から忍び込んだ`, true);
        this.activateFloor(0);
        this.current = 0;
        this.turnNo = 1;
        this.phase = 'actions';
        this.startTurn();
    }

    // ---- 準備 ----

    setupBuilding(count) {
        const pool = [];
        Object.entries(ROOMS).forEach(([type, room]) => {
            for (let i = 0; i < (room.count ?? 0); i++) pool.push(type);
        });
        shuffle(pool, this.random);
        this.floors = [];
        for (let f = 0; f < count; f++) {
            const types = shuffle(['safe', 'stairs', ...pool.splice(0, CELLS - 2)], this.random);
            const tiles = types.map(type => ({
                type, num: type === 'safe' ? 0 : 1 + Math.floor(this.random() * 6),
                revealed: false, cracked: false, alarm: false, open: false,
                lav: type === 'lavatory' ? LAVATORY_TOKENS : 0, used: false
            }));
            this.floors.push({
                tiles,
                walls: this.makeWalls(),
                guard: { active: false, cell: null, dest: null, speed: BASE_SPEED[f], deck: shuffle(Array.from({ length: CELLS }, (_, i) => i), this.random), discard: [] },
                safe: { dice: 0, cracked: false }
            });
        }
    }

    // 内壁を、どの部屋にも行けるように置く（行き止まりを作らない：どの部屋も出口を2つ以上残す）
    makeWalls() {
        const edges = [];
        for (let c = 0; c < CELLS; c++) {
            if (c % SIZE < SIZE - 1) edges.push([c, c + 1]);
            if (c + SIZE < CELLS) edges.push([c, c + SIZE]);
        }
        shuffle(edges, this.random);
        const walls = new Set();
        const count = Array(CELLS).fill(0);
        for (const [a, b] of edges) {
            if (walls.size >= WALLS_PER_FLOOR) break;
            if (neighbors(a).length - count[a] <= 2 || neighbors(b).length - count[b] <= 2) continue;
            walls.add(wallKey(a, b));
            if (this.connected(walls)) {
                count[a]++;
                count[b]++;
            } else {
                walls.delete(wallKey(a, b));
            }
        }
        return [...walls].sort();
    }

    connected(walls) {
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) {
            const c = queue.shift();
            neighbors(c).forEach(n => {
                if (!seen.has(n) && !walls.has(wallKey(c, n))) {
                    seen.add(n);
                    queue.push(n);
                }
            });
        }
        return seen.size === CELLS;
    }

    // 始まりの部屋が危ない種類なら、1階の別の部屋と入れ替える
    prepareStart(start) {
        const tiles = this.floors[0].tiles;
        if (START_ROOMS.includes(tiles[start].type)) return;
        const swap = tiles.findIndex((t, i) => i !== start && START_ROOMS.includes(t.type));
        [tiles[start], tiles[swap]] = [tiles[swap], tiles[start]];
    }

    // ---- 情報 ----

    isOver() {
        return !!this.result;
    }

    actors() {
        if (this.result) return [];
        return [this.current];
    }

    log(text, head = false) {
        this.logTotal++;
        this.logs.push({ n: this.logTotal, text, head });
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    // ---- 操作 ----

    applyCommand(seat, command) {
        this.lastError = null;
        if (this.result) return this.fail('ゲームは終わっています');
        const type = command?.type;
        if (typeof type !== 'string' || !Object.hasOwn(COMMAND_FIELDS, type)) return this.fail('その操作はできません');
        if (!this.actors().includes(seat)) return this.fail('今はその人の番ではありません');
        const clean = { type };
        COMMAND_FIELDS[type].forEach(key => {
            if (command[key] !== undefined) clean[key] = command[key];
        });
        if (this.phase === 'spot' && !['spotKeep', 'spotBottom'].includes(type)) return this.fail('巡回の山の上をどうするか選んでください');
        if (this.phase !== 'spot' && ['spotKeep', 'spotBottom'].includes(type)) return this.fail('その操作はできません');
        this.events = [];
        this.lastRoll = null;
        const ok = this[`do_${type}`](this.players[seat], clean);
        if (!ok) return false;
        this.commands.push({ playerId: seat, command: clean });
        if (!this.result && this.phase === 'actions' && this.actionsLeft <= 0) this.endTurn();
        return true;
    }

    do_move(p, { to }) {
        if (!Number.isInteger(to) || !moveTargets(this, p.id).includes(to)) return this.fail('そこへは動けません');
        const f = floorOf(to);
        const cell = cellOf(to);
        const t = tileAt(this, f, cell);
        // 開いていない暗証番号の扉：ダイスで6を出せば入れる
        if (t.revealed && t.type === 'keypad' && !t.open) {
            this.actionsLeft--;
            if (!this.tryKeypad(p, f, cell)) return true;
            return this.walk(p, f, cell, false);
        }
        if (t.revealed) {
            this.actionsLeft -= this.costOf(f, cell);
            return this.walk(p, f, cell, false);
        }
        // めくっていない部屋：入るとめくれる
        this.actionsLeft--;
        this.reveal(f, cell);
        if (t.type === 'deadbolt' && !occupied(this, f, cell)) {
            if (this.actionsLeft < 2) {
                this.log(`${at(f, cell)}はかんぬき扉。アクションが足りず入れなかった`);
                return true;
            }
            this.actionsLeft -= 2;
        }
        if (t.type === 'keypad' && !t.open && !this.tryKeypad(p, f, cell)) return true;
        return this.walk(p, f, cell, true);
    }

    costOf(f, cell) {
        const t = tileAt(this, f, cell);
        return t.type === 'deadbolt' && !occupied(this, f, cell) ? 3 : 1;
    }

    tryKeypad(p, f, cell) {
        const key = idOf(f, cell);
        const tries = (this.turn.keypad[key] ?? 0) + 1;
        this.turn.keypad[key] = tries;
        const values = Array.from({ length: tries }, () => 1 + Math.floor(this.random() * 6));
        const ok = values.includes(6);
        this.lastRoll = { kind: 'keypad', values, ok };
        this.events.push({ type: 'dice', values });
        if (ok) {
            tileAt(this, f, cell).open = true;
            this.log(`${p.name}：暗証番号を当てた（${values.join('・')}）`);
        } else {
            this.log(`${p.name}：暗証番号が外れた（${values.join('・')}）`);
        }
        return ok;
    }

    // 部屋から出て、となりの部屋へ入る
    walk(p, f, cell, justRevealed) {
        this.leave(p);
        if (this.result) return true;
        this.enter(p, f, cell, { justRevealed, fall: true });
        return true;
    }

    // 部屋を出る（入った手番のうちに動体センサーから出ると警報）
    leave(p) {
        const id = idOf(p.floor, p.cell);
        if (this.turn.motion.includes(id)) {
            this.turn.motion = this.turn.motion.filter(x => x !== id);
            if (this.hacks.motion > 0) {
                this.hacks.motion--;
                this.log(`動体センサーをハックで止めた（残り${this.hacks.motion}）`);
            } else {
                this.alarm(p.floor, p.cell, '動体センサー');
            }
        }
    }

    // 部屋に入る（見つかるかの判定・警報・研究室・吊り通路）
    enter(p, f, cell, { justRevealed = false, fall = false } = {}) {
        p.floor = f;
        p.cell = cell;
        const t = tileAt(this, f, cell);
        this.events.push({ type: 'move', seat: p.id, to: idOf(f, cell) });
        if (fall && justRevealed && t.type === 'walkway' && f > 0) {
            this.log(`${p.name}：吊り通路から下の階へ落ちた`);
            const below = tileAt(this, f - 1, cell);
            const reveal = !below.revealed;
            if (reveal) this.reveal(f - 1, cell);
            this.enter(p, f - 1, cell, { justRevealed: reveal, fall: false });
            return;
        }
        if (!this.floors[f].guard.active) this.activateFloor(f);
        const seen = new Set();
        const g = this.floors[f].guard;
        if (g.cell === cell) {
            if (p.char === 'acrobat') this.log(`${p.name}：見張りのすぐそばをすり抜けた`);
            else this.seen(p, '見張りのいる部屋に入った', seen);
        }
        this.seenByRoom(p, seen);
        if (this.result) return;
        const hacker = p.char === 'hacker';
        switch (t.type) {
            case 'fingerprint':
                if (hacker) break;
                if (this.hacks.fingerprint > 0) {
                    this.hacks.fingerprint--;
                    this.log(`指紋認証をハックで止めた（残り${this.hacks.fingerprint}）`);
                } else {
                    this.alarm(f, cell, '指紋認証');
                }
                break;
            case 'laser':
                if (hacker) break;
                if (this.actionsLeft >= 1 && this.current === p.id && this.phase === 'actions') {
                    this.actionsLeft--;
                    this.log('レーザーをよけて進んだ（アクション1つ）');
                } else if (this.hacks.laser > 0) {
                    this.hacks.laser--;
                    this.log(`レーザーをハックで止めた（残り${this.hacks.laser}）`);
                } else {
                    this.alarm(f, cell, 'レーザー');
                }
                break;
            case 'motion':
                if (!hacker) this.turn.motion.push(idOf(f, cell));
                break;
            case 'lab':
                if (!t.used) {
                    t.used = true;
                    this.drawTool(p, '研究室で');
                }
                break;
        }
    }

    // 部屋の種類で見つかる（カメラ・ロビー・吹き抜け）
    seenByRoom(p, seen) {
        const f = p.floor;
        const cell = p.cell;
        const t = tileAt(this, f, cell);
        if (!t.revealed) return;
        if (t.type === 'camera') {
            const watched = this.floors.some((fl, i) => fl.guard.active && (i !== f || fl.guard.cell !== cell) && tileAt(this, i, fl.guard.cell)?.revealed && tileAt(this, i, fl.guard.cell).type === 'camera');
            if (watched) this.seen(p, '監視カメラに映った', seen);
        }
        if (t.type === 'foyer') {
            const g = this.floors[f].guard;
            if (g.active && guardNeighbors(this, f, cell).includes(g.cell)) this.seen(p, 'ロビーで見張りに見られた', seen);
        }
        if (t.type === 'atrium') {
            const above = [f - 1, f + 1].some(i => this.floors[i]?.guard.active && this.floors[i].guard.cell === cell);
            if (above) this.seen(p, '吹き抜けごしに見られた', seen);
        }
    }

    // 見つかった：隠れ札（洗面所）→ 隠密の印を1つ失う → 印がなければ負け
    seen(p, why, seenSet) {
        if (seenSet?.has(p.id) || this.result) return;
        seenSet?.add(p.id);
        if (this.invisible.includes(p.id)) {
            this.log(`${p.name}：透明スーツで見つからなかった`);
            return;
        }
        const t = tileAt(this, p.floor, p.cell);
        if (t.revealed && t.type === 'lavatory' && t.lav > 0) {
            t.lav--;
            this.log(`${p.name}：${why}が、洗面所に隠れた（隠れ札 残り${t.lav}）`);
            return;
        }
        this.events.push({ type: 'seen', seat: p.id });
        if (p.stealth > 0) {
            p.stealth--;
            this.log(`${p.name}：${why}（隠密 残り${p.stealth}）`, true);
            return;
        }
        this.result = { won: false, reason: 'caught', seat: p.id };
        this.phase = 'end';
        this.log(`${p.name}：${why}。隠れきれずに捕まった`, true);
    }

    alarm(f, cell, why) {
        const g = this.floors[f].guard;
        const t = tileAt(this, f, cell);
        if (g.active && g.cell === cell) {
            this.log(`${why}が鳴ったが、見張りがその場で止めた`);
            return;
        }
        if (t.alarm) return;
        t.alarm = true;
        this.events.push({ type: 'alarm', at: idOf(f, cell) });
        this.log(`${at(f, cell)}で${why}の警報が鳴った`, true);
    }

    reveal(f, cell) {
        const t = tileAt(this, f, cell);
        if (t.revealed) return;
        t.revealed = true;
        this.events.push({ type: 'reveal', at: idOf(f, cell) });
        this.log(`${at(f, cell)}は${ROOMS[t.type].name}${t.type === 'safe' ? '' : `（${t.num}）`}`);
    }

    drawTool(p, where) {
        const tool = this.toolDeck.pop();
        if (!tool) return;
        p.tools.push(tool);
        this.log(`${p.name}：${where}道具「${TOOLS[tool].name}」を手に入れた`);
    }

    do_peek(p, { to }) {
        if (!Number.isInteger(to) || !peekTargets(this, p.id).includes(to)) return this.fail('そこはのぞけません');
        const cost = peekCost(this, p.id);
        if (this.actionsLeft < cost) return this.fail('アクションが足りません');
        this.actionsLeft -= cost;
        if (p.char === 'hawk') this.turn.hawkFree = false;
        this.reveal(floorOf(to), cellOf(to));
        return true;
    }

    do_addDie(p) {
        if (!canAddDie(this, p.id)) return this.fail('ダイスは足せません');
        this.actionsLeft -= 2;
        this.floors[p.floor].safe.dice++;
        this.log(`${p.name}：金庫にダイスを足した（${this.floors[p.floor].safe.dice}個）`);
        return true;
    }

    do_crack(p) {
        if (!canCrack(this, p.id)) return this.fail('金庫は破れません');
        this.actionsLeft--;
        const fl = this.floors[p.floor];
        const count = Math.min(MAX_DICE + 1, fl.safe.dice + (p.char === 'peterman' ? 1 : 0));
        const values = Array.from({ length: count }, () => 1 + Math.floor(this.random() * 6));
        const line = safeLine(p.cell);
        const hits = line.filter(c => fl.tiles[c].revealed && !fl.tiles[c].cracked && values.includes(fl.tiles[c].num));
        hits.forEach(c => { fl.tiles[c].cracked = true; });
        this.lastRoll = { kind: 'safe', values, hits: hits.map(c => idOf(p.floor, c)) };
        this.events.push({ type: 'dice', values });
        this.log(`${p.name}：金庫のダイス ${values.join('・')}${hits.length ? `、${hits.length}部屋に解錠の印` : '、外れ'}`);
        if (line.every(c => fl.tiles[c].cracked)) this.openSafe(p);
        return true;
    }

    // 金庫が開いた：お宝と道具。その階の見張りが1つ速くなる
    openSafe(p) {
        const fl = this.floors[p.floor];
        fl.safe.cracked = true;
        this.crackedCount++;
        const loot = this.lootDeck.pop();
        if (loot) p.loot.push(loot);
        this.log(`${p.name}：${floorName(p.floor)}の金庫が開いた！「${loot}」を手に入れた`, true);
        this.drawTool(p, '金庫で');
        fl.guard.speed = Math.min(MAX_SPEED, fl.guard.speed + 1);
        this.log(`物音で、${floorName(p.floor)}の見張りが速くなった（速さ${fl.guard.speed}）`);
        if (allCracked(this)) this.log(topFloor(this) === 0 ? '金庫はすべて開いた。階段から屋上へ逃げよう' : '金庫はすべて開いた。最上階の階段から屋上へ逃げよう', true);
    }

    do_hack(p) {
        if (!canHack(this, p.id)) return this.fail('ここではハックできません');
        const type = ROOMS[tileAt(this, p.floor, p.cell).type].hack;
        this.actionsLeft--;
        this.hacks[type]++;
        this.log(`${p.name}：${HACK_NAMES[type]}のハックを置いた（${this.hacks[type]}）`);
        return true;
    }

    do_up(p) {
        if (!canUp(this, p.id)) return this.fail('ここからは上がれません');
        this.actionsLeft--;
        this.leave(p);
        if (this.result) return true;
        const f = p.floor + 1;
        const reveal = !tileAt(this, f, p.cell).revealed;
        if (reveal) this.reveal(f, p.cell);
        this.log(`${p.name}：階段で${floorName(f)}へ`);
        this.enter(p, f, p.cell, { justRevealed: reveal, fall: false });
        return true;
    }

    do_down(p) {
        if (!canDown(this, p.id)) return this.fail('ここからは下りられません');
        this.actionsLeft--;
        this.leave(p);
        if (this.result) return true;
        this.log(`${p.name}：階段で${floorName(p.floor - 1)}へ`);
        this.enter(p, p.floor - 1, p.cell, { fall: false });
        return true;
    }

    do_roof(p) {
        if (!canRoof(this, p.id)) return this.fail('まだ屋上へは出られません');
        this.leave(p);
        if (this.result) return true;
        this.turn.lastFloor = p.floor;
        p.escaped = true;
        this.log(`${p.name}：屋上へ逃げた`, true);
        if (this.players.every(q => q.escaped)) {
            this.result = { won: true, reason: 'escaped' };
            this.phase = 'end';
            this.log('全員が逃げ切った！', true);
            return true;
        }
        this.endTurn();
        return true;
    }

    do_juice(p, { to }) {
        if (!Number.isInteger(to) || !juiceTargets(this, p.id).includes(to)) return this.fail('そこでは警報を鳴らせません');
        this.actionsLeft--;
        this.alarm(floorOf(to), cellOf(to), '仕掛け');
        return true;
    }

    do_spot(p) {
        if (!canSpot(this, p.id)) return this.fail('巡回の山を見られません');
        this.actionsLeft--;
        const g = this.floors[p.floor].guard;
        this.spotted = { floor: p.floor, cell: g.deck.at(-1) };
        this.phase = 'spot';
        this.log(`${p.name}：巡回の山の上は${cellLabel(this.spotted.cell)}`);
        return true;
    }

    do_spotKeep() {
        this.spotted = null;
        this.phase = 'actions';
        this.log('巡回の山はそのままにした');
        return true;
    }

    do_spotBottom() {
        const g = this.floors[this.spotted.floor].guard;
        g.deck.unshift(g.deck.pop());
        this.spotted = null;
        this.phase = 'actions';
        this.log('巡回の山の上を、山の下へ回した');
        return true;
    }

    do_tool(p, { tool, to }) {
        if (!p.tools.includes(tool)) return this.fail('その道具は持っていません');
        const f = p.floor;
        const fl = this.floors[f];
        switch (tool) {
            case 'blueprints':
                if (!Number.isInteger(to) || floorOf(to) !== f || tileAt(this, f, cellOf(to)).revealed) return this.fail('めくる部屋を選んでください');
                this.useTool(p, tool);
                this.reveal(f, cellOf(to));
                return true;
            case 'rollerskates':
                this.useTool(p, tool);
                this.actionsLeft += 2;
                return true;
            case 'invisible':
                this.useTool(p, tool);
                if (!this.invisible.includes(p.id)) this.invisible.push(p.id);
                return true;
            case 'smoke':
                this.useTool(p, tool);
                this.turn.smoke = f;
                return true;
            case 'crowbar': {
                const cells = neighbors(p.cell).filter(n => tileAt(this, f, n).revealed && tileAt(this, f, n).type === 'keypad' && !tileAt(this, f, n).open);
                if (!Number.isInteger(to) || floorOf(to) !== f || !cells.includes(cellOf(to))) return this.fail('となりの閉じた暗証番号の扉を選んでください');
                this.useTool(p, tool);
                tileAt(this, f, cellOf(to)).open = true;
                return true;
            }
            case 'stethoscope':
                if (fl.safe.cracked || fl.safe.dice >= MAX_DICE) return this.fail('この階の金庫にはダイスを足せません');
                this.useTool(p, tool);
                fl.safe.dice++;
                return true;
            case 'virus':
                this.useTool(p, tool);
                HACK_TYPES.forEach(k => { this.hacks[k] = Math.min(MAX_HACK, this.hacks[k] + 2); });
                return true;
            case 'dynamite': {
                if (!Number.isInteger(to) || floorOf(to) !== f || !fl.walls.includes(wallKey(p.cell, cellOf(to)))) return this.fail('となりとの壁を選んでください');
                this.useTool(p, tool);
                fl.walls = fl.walls.filter(w => w !== wallKey(p.cell, cellOf(to)));
                this.alarm(f, p.cell, 'ダイナマイト');
                return true;
            }
        }
        return this.fail('その道具は使えません');
    }

    useTool(p, tool) {
        p.tools.splice(p.tools.indexOf(tool), 1);
        this.log(`${p.name}：${TOOLS[tool].name}を使った`);
    }

    do_pass() {
        this.endTurn();
        return true;
    }

    // ---- 手番の終わりと見張り ----

    endTurn() {
        const p = this.players[this.current];
        if (!p.escaped) {
            const t = tileAt(this, p.floor, p.cell);
            if (t.revealed && t.type === 'thermo') this.alarm(p.floor, p.cell, '熱センサー');
        }
        const f = p.escaped ? this.turn.lastFloor : p.floor;
        if (this.turn.smoke === f) this.log('煙幕で、見張りは動けなかった');
        else this.moveGuard(f);
        if (this.result) return;
        this.nextPlayer();
    }

    nextPlayer() {
        const n = this.players.length;
        for (let i = 1; i <= n; i++) {
            const next = (this.current + i) % n;
            if (!this.players[next].escaped) {
                this.current = next;
                this.turnNo++;
                this.startTurn();
                return;
            }
        }
    }

    startTurn() {
        const p = this.players[this.current];
        this.actionsLeft = ACTIONS_PER_TURN;
        this.phase = 'actions';
        this.turn = { keypad: {}, motion: [], hawkFree: true, smoke: null, lastFloor: p.floor };
        this.invisible = this.invisible.filter(id => id !== p.id);
        this.log(`${p.name}（${CHARACTERS[p.char].name}）の番`, true);
    }

    // 階に初めて泥棒が入った：巡回の山から見張りの場所と行き先を決める
    activateFloor(f) {
        const g = this.floors[f].guard;
        g.active = true;
        g.speed = BASE_SPEED[f];
        let cell = this.drawPatrol(f);
        for (let i = 0; i < CELLS && playersAt(this, f, cell).length; i++) cell = this.drawPatrol(f);
        g.cell = cell;
        g.dest = this.nextDest(f);
        this.log(`${floorName(f)}に見張りが現れた（速さ${g.speed}）`, true);
    }

    drawPatrol(f) {
        const g = this.floors[f].guard;
        if (!g.deck.length) {
            g.deck = shuffle(Array.from({ length: CELLS }, (_, i) => i), this.random);
            g.discard = [];
            g.speed = Math.min(MAX_SPEED, g.speed + 1);
            this.log(`${floorName(f)}の巡回の山を切り直した。見張りが速くなった（速さ${g.speed}）`, true);
        }
        const card = g.deck.pop();
        g.discard.push(card);
        return card;
    }

    nextDest(f) {
        const g = this.floors[f].guard;
        let dest = this.drawPatrol(f);
        if (dest === g.cell) dest = this.drawPatrol(f);
        return dest;
    }

    // 見張りが今の部屋で、警報を止めるか、巡回の行き先に着いたかを片づける
    settleGuard(f) {
        const g = this.floors[f].guard;
        const t = tileAt(this, f, g.cell);
        if (t.alarm) {
            t.alarm = false;
            this.log(`見張りが${at(f, g.cell)}の警報を止めた`);
        }
        if (!alarmCells(this, f).length && g.cell === g.dest) g.dest = this.nextDest(f);
    }

    moveGuard(f) {
        const g = this.floors[f].guard;
        if (!g.active) return;
        let steps = g.speed;
        const seen = new Set();
        const path = [];
        while (steps > 0 && !this.result) {
            this.settleGuard(f);
            const next = guardStep(this, f, g.cell, guardTarget(this, f));
            if (next === null) break;
            g.cell = next;
            path.push(next);
            steps--;
            this.guardEntered(f, seen);
        }
        if (!this.result) this.settleGuard(f);
        this.events.push({ type: 'guard', floor: f, path });
    }

    // 見張りが部屋に入った：その部屋の泥棒・カメラ・となりのロビー・上下の吹き抜け
    guardEntered(f, seen) {
        const cell = this.floors[f].guard.cell;
        playersAt(this, f, cell).forEach(p => this.seen(p, '見張りに見つかった', seen));
        const t = tileAt(this, f, cell);
        if (t.revealed && t.type === 'camera') {
            this.players.filter(p => !p.escaped && !(p.floor === f && p.cell === cell)).forEach(p => {
                const pt = tileAt(this, p.floor, p.cell);
                if (pt.revealed && pt.type === 'camera') this.seen(p, '監視カメラに映った', seen);
            });
        }
        guardNeighbors(this, f, cell).forEach(n => {
            if (tileAt(this, f, n).revealed && tileAt(this, f, n).type === 'foyer') playersAt(this, f, n).forEach(p => this.seen(p, 'ロビーで見張りに見られた', seen));
        });
        [f - 1, f + 1].forEach(i => {
            if (this.floors[i] && tileAt(this, i, cell).revealed && tileAt(this, i, cell).type === 'atrium') playersAt(this, i, cell).forEach(p => this.seen(p, '吹き抜けごしに見られた', seen));
        });
    }

    // ---- 保存と再現 ----

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: { ...this.options, ...(this.options.chars ? { chars: [...this.options.chars] } : {}) },
            commands: this.commands.map(c => ({ playerId: c.playerId, command: { ...c.command } }))
        };
    }

    static replay(players, options, commands = []) {
        const game = new Game(players, options);
        for (const { playerId, command } of commands) {
            if (!game.applyCommand(playerId, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }
}

export { guardDistances };
