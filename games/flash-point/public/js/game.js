/**
 * フラッシュポイント（燃える家から人を助け出す、2〜6人の協力ゲーム）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（ダイスの目と要救助者の印の正体はシードから決まる）
 *
 * 手番の流れ
 * - AP（行動力）を使って動く。使わなかった AP は4まで次の手番へ持ち越せる
 * - 手番を終えると、火が広がる：ダイスで決めたマスに煙を置く（煙なら火、火なら爆発）→ 煙が火に移る（フラッシュオーバー）
 *   → 火の中の消防士は倒れて救急車の場所へ、火の中の要救助者は失われる → 要救助者の印を3つまで補う
 * 勝ち：要救助者を7人、建物の外へ運び出す。負け：4人を失う、または建物が崩れる（ダメージが24）
 *
 * 2つの遊び方
 * - family（家族向け）：決まった場所の火と印で始め、全員が4AP の消防士
 * - experienced（上級）：はじめの爆発・危険物・ホットスポット、専門職、救急車と消防車（放水）。難しさは新人・ベテラン・ヒーロー
 *
 * 自分で決めた点（README の「決めたこと」）
 * - 倒れた消防士は、家族向けではいちばん近い救急車の駐車場へ、上級では救急車のいる駐車場へ移る
 * - 運べるのは1人（か危険物1つ）まで。手当てした要救助者は1APで連れて歩ける（運ぶのと同じ扱いで、1人まで）
 * - 救急車はどこからでも呼べる（2AP で隣の駐車場へ）。消防車は、乗っている隊員が動かす。乗って一緒に動くのは動かした隊員だけ
 * - 機関員の放水は、外れた目（火も煙もないマス）が出たときだけ1回振り直す
 */

import { createRandom, shuffle } from './random.js';
import {
    CELL_COUNT, NEIGHBORS, cellOf, rowOf, colOf, isInside, isOutside, isCell, edgeKey, stepFrom, initialEdges,
    INSIDE_CELLS, DAMAGE_LIMIT, WIN_RESCUED, LOSE_LOST, POI_ON_BOARD, POI_VICTIMS, POI_FALSE, HOTSPOT_SUPPLY, SAVE_LIMIT,
    ENGINE_SPOTS, AMBULANCE_SPOTS, ENGINE_QUADRANT, QUADRANTS, inQuadrant, sideDistance, SIDE_NAMES,
    FAMILY_FIRES, FAMILY_POI, LEVELS, ROLE, ROLES, roleOf, ROOM_NAMES, roomOf
} from './board.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    role: ['role'],           // 専門職を選ぶ（上級の準備）
    place: ['cell'],          // 始める場所（建物の外）を選ぶ
    move: ['to'],
    carry: ['item'],          // 自分のマスの要救助者（'p<番号>'）か危険物（'h<番号>'）を持つ
    drop: [],
    door: ['to'],             // となりのマスとの間の扉を開け閉めする
    extinguish: ['cell'],     // 火→煙、煙→なし
    chop: ['to'],             // となりのマスとの間の壁を壊す
    identify: ['cell'],       // 探査隊員：印の正体を調べる
    treat: [],                // 救急隊員：自分のマスの要救助者を手当てする
    dispose: [],              // 危険物処理員：自分のマスの危険物を処理する
    drive: ['vehicle', 'side'],
    gun: [],                  // 消防車から放水する
    command: ['seat', 'to'],  // 隊長：ほかの隊員を1マス動かす
    crew: ['role'],           // 消防車で専門職を替える
    end: []
};
export const END_REASONS = {
    won: '7人を助け出しました',
    lost: '4人を失いました',
    collapse: '建物が崩れました'
};
const MAX_LOGS = 400;
const MAX_EVENTS = 200;
const isInt = (v) => Number.isInteger(v);
const DOOR_OPEN = (e) => !e || e.t === 'broken' || (e.t === 'door' && e.s === 'open');

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, mode（family・experienced）, level（recruit・veteran・heroic）}
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const mode = options.mode === 'experienced' ? 'experienced' : 'family';
        const level = Object.hasOwn(LEVELS, options.level) ? options.level : 'recruit';
        this.options = { seed, mode, level };
        this.random = createRandom(seed);
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.result = null;
        this.turnNo = 0;

        this.fire = new Array(CELL_COUNT).fill(0);   // 0：なし・1：煙・2：火
        this.edges = initialEdges();
        this.damage = 0;
        this.rescued = 0;
        this.lost = 0;
        this.pois = [];          // { id, cell, revealed, victim（正体。見せるのは revealed のときだけ）, treated }
        this.hazmats = [];       // { id, cell }
        this.hotspots = [];      // ホットスポットのマス
        this.hotspotSupply = mode === 'experienced' ? HOTSPOT_SUPPLY : 0;
        this.nextId = 1;
        this.vehicles = mode === 'experienced' ? { ambulance: 2, engine: 0 } : null;
        this.lastRoll = null;    // 最後の延焼のダイス { r, c }
        this.poiPool = shuffle([...Array(POI_VICTIMS).fill(true), ...Array(POI_FALSE).fill(false)], this.random);

        this.players = players.map((p, id) => ({
            id,
            name: String(p.name ?? `プレイヤー${id + 1}`),
            isCPU: !!p.isCPU,
            role: null,
            cell: null,
            ap: 0,
            ext: 0,       // 消火だけに使える AP（泡消火隊員）
            mv: 0,        // 移動だけに使える AP（救助専門員）
            cp: 0,        // 指揮の点（隊長）
            carry: null   // 持っているもの 'p<番号>'（要救助者）・'h<番号>'（危険物）
        }));

        if (mode === 'family') this.setupFamily();
        else this.setupExperienced(LEVELS[level]);
        this.current = 0;
        this.phase = mode === 'experienced' ? 'role' : 'place';
        this.log(mode === 'experienced'
            ? `上級（${LEVELS[level].name}）：専門職を選んでください`
            : '家族向け：建物の外の、始める場所を選んでください', { head: true });
    }

    // ---- 準備 ----

    setupFamily() {
        FAMILY_FIRES.forEach(cell => { this.fire[cell] = 2; });
        FAMILY_POI.forEach(cell => this.addPoi(cell));
    }

    setupExperienced(level) {
        // はじめの爆発：火のないマスに火を置いて爆発させ、ホットスポットを置く
        for (let i = 0; i < level.explosions; i++) {
            const cell = this.rollCell(c => this.fire[c] !== 2);
            this.fire[cell] = 2;
            this.explode(cell);
            this.addHotspot(cell);
        }
        for (let i = 0; i < level.hazmat; i++) {
            const cell = this.rollCell(c => this.fire[c] !== 2 && !this.hazmatAt(c));
            this.hazmats.push({ id: this.nextId++, cell });
        }
        for (let i = 0; i < level.hotspots; i++) {
            const cell = this.rollCell(c => !this.hotspots.includes(c));
            this.addHotspot(cell);
        }
        for (let i = 0; i < POI_ON_BOARD; i++) {
            const cell = this.rollCell(c => this.fire[c] === 0 && !this.poiAt(c));
            this.addPoi(cell);
        }
    }

    // 条件に合うマスが出るまでダイスを振る（建物の中のマス）
    rollCell(ok = () => true) {
        for (let i = 0; i < 200; i++) {
            const cell = this.rollDice();
            if (ok(cell)) return cell;
        }
        return INSIDE_CELLS.find(ok) ?? INSIDE_CELLS[0];
    }

    rollDice() {
        const r = 1 + Math.floor(this.random() * 6);
        const c = 1 + Math.floor(this.random() * 8);
        return cellOf(r, c);
    }

    addPoi(cell) {
        if (!this.poiPool.length) return null;
        const poi = { id: this.nextId++, cell, revealed: false, victim: this.poiPool.pop(), treated: false };
        this.pois.push(poi);
        return poi;
    }

    addHotspot(cell) {
        if (this.hotspotSupply <= 0 || this.hotspots.includes(cell)) return;
        this.hotspots.push(cell);
        this.hotspotSupply--;
    }

    // ---- 調べる ----

    isOver() { return this.phase === 'end'; }
    role(seat) { return roleOf(this.players[seat].role); }
    poiAt(cell) { return this.pois.find(p => p.cell === cell && !this.carrierOf(`p${p.id}`)) ?? null; }
    poisAt(cell) { return this.pois.filter(p => p.cell === cell); }
    hazmatAt(cell) { return this.hazmats.find(h => h.cell === cell) ?? null; }
    playersAt(cell) { return this.players.filter(p => p.cell === cell); }
    carrierOf(item) { return this.players.find(p => p.carry === item) ?? null; }
    item(key) {
        if (typeof key !== 'string') return null;
        const id = Number(key.slice(1));
        if (key[0] === 'p') return this.pois.find(p => p.id === id) ?? null;
        if (key[0] === 'h') return this.hazmats.find(h => h.id === id) ?? null;
        return null;
    }
    edge(a, b) { return this.edges[edgeKey(a, b)] ?? null; }
    // 2つのとなりのマスの間を通れるか（壁がない・壊れた・扉が開いている）
    passable(a, b) { return DOOR_OPEN(this.edge(a, b)); }
    // 盤面にある要救助者の印（運ばれている人も数える）
    poiCount() { return this.pois.length; }
    // 持っているものを運ぶのに 2AP かかるか（手当てした要救助者を連れて歩くのは 1AP）
    heavy(seat) {
        const carry = this.players[seat].carry;
        if (!carry) return false;
        if (carry[0] === 'h') return true;
        return !this.item(carry)?.treated;
    }
    // 隊員がとなりのマスへ動くのにかかる AP（動けなければ null）
    moveCost(seat, to) {
        const p = this.players[seat];
        if (p.cell === null || !isCell(to) || !NEIGHBORS[p.cell].includes(to)) return null;
        if (!this.passable(p.cell, to)) return null;
        if (p.carry && this.fire[to] === 2) return null;
        if (p.carry) return this.heavy(seat) ? 2 : 1;
        return this.fire[to] === 2 ? 2 : 1;
    }
    // 消火にかかる AP（救急隊員・救助専門員は2倍）
    extCost(seat) { return ['paramedic', 'rescue'].includes(this.players[seat].role) ? 2 : 1; }
    canPay(seat, cost, pool = null) {
        const p = this.players[seat];
        return p.ap + (pool ? p[pool] : 0) >= cost;
    }
    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }
    // 救急車・消防車の駐車場の、そのマスに近い方
    spotCell(spots, side, from) {
        const [a, b] = spots[side];
        if (from === null || from === undefined) return a;
        const d = (x) => Math.abs(rowOf(x) - rowOf(from)) + Math.abs(colOf(x) - colOf(from));
        return d(b) < d(a) ? b : a;
    }
    onVehicle(seat, kind) {
        const cell = this.players[seat].cell;
        const spots = kind === 'engine' ? ENGINE_SPOTS : AMBULANCE_SPOTS;
        return this.vehicles !== null && spots[this.vehicles[kind]].includes(cell);
    }
    // 放水できる区画に隊員がいないか
    quadrantClear(q) {
        return !this.players.some(p => p.cell !== null && inQuadrant(p.cell, q));
    }
    unusedRoles() {
        const used = new Set(this.players.map(p => p.role));
        return ROLES.filter(r => !used.has(r.key)).map(r => r.key);
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!isInt(playerId) || !this.players[playerId]) return this.fail('プレイヤーが正しくありません');
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => {
            if (command[k] !== undefined && command[k] !== null) recorded[k] = command[k];
        });
        const error = this.commandError(playerId, recorded);
        if (error) return this.fail(error);
        this.commands.push({ playerId, command: structuredClone(recorded) });
        this.execute(playerId, recorded);
        return true;
    }

    // 判定（状態を変えない）。通らなければ理由を返す
    commandError(seat, c) {
        if (seat !== this.current) return 'あなたの番ではありません';
        const p = this.players[seat];
        const exp = this.options.mode === 'experienced';
        if (this.phase === 'role') {
            if (c.type !== 'role') return '専門職を選んでください';
            return this.unusedRoles().includes(c.role) ? null : 'その専門職は選べません';
        }
        if (this.phase === 'place') {
            if (c.type !== 'place') return '始める場所を選んでください';
            return isOutside(c.cell) ? null : '建物の外のマスを選んでください';
        }
        if (['role', 'place'].includes(c.type)) return '準備は終わっています';
        switch (c.type) {
            case 'end': return null;
            case 'move': {
                const cost = this.moveCost(seat, c.to);
                if (cost === null) {
                    if (p.carry && isCell(c.to) && this.fire[c.to] === 2) return '運んでいる間は火の中へ入れません';
                    return 'そこへは動けません';
                }
                return this.canPay(seat, cost, 'mv') ? null : 'AP が足りません';
            }
            case 'carry': {
                if (p.carry) return 'すでに運んでいます';
                const it = this.item(c.item);
                if (!it || it.cell !== p.cell || this.carrierOf(c.item)) return 'ここに運べるものはありません';
                if (c.item[0] === 'p' && !it.revealed) return '正体の分からない印は運べません';
                return null;
            }
            case 'drop': return p.carry ? null : '何も運んでいません';
            case 'door': {
                if (!isCell(c.to) || !NEIGHBORS[p.cell].includes(c.to)) return 'となりの扉を選んでください';
                const e = this.edge(p.cell, c.to);
                if (!e || e.t !== 'door') return 'そこに扉はありません';
                return this.canPay(seat, 1) ? null : 'AP が足りません';
            }
            case 'extinguish': {
                if (!isCell(c.cell) || !isInside(c.cell) || !this.fire[c.cell]) return '火も煙もありません';
                if (c.cell !== p.cell && !(NEIGHBORS[p.cell].includes(c.cell) && this.passable(p.cell, c.cell))) return '自分のマスかとなりのマスだけ消せます';
                return this.canPay(seat, this.extCost(seat), 'ext') ? null : 'AP が足りません';
            }
            case 'chop': {
                if (!isCell(c.to) || !NEIGHBORS[p.cell].includes(c.to)) return 'となりの壁を選んでください';
                const e = this.edge(p.cell, c.to);
                if (!e || e.t !== 'wall') return 'そこに壁はありません';
                return this.canPay(seat, p.role === 'rescue' ? 1 : 2) ? null : 'AP が足りません';
            }
            case 'identify': {
                if (p.role !== 'imaging') return '探査隊員だけができます';
                const poi = this.pois.find(x => x.cell === c.cell && !x.revealed);
                if (!poi) return '正体の分からない印はありません';
                return this.canPay(seat, 1) ? null : 'AP が足りません';
            }
            case 'treat': {
                if (p.role !== 'paramedic') return '救急隊員だけができます';
                if (!this.pois.some(x => x.cell === p.cell && x.revealed && !x.treated)) return '手当てする人がいません';
                return this.canPay(seat, 1) ? null : 'AP が足りません';
            }
            case 'dispose': {
                if (p.role !== 'hazmat') return '危険物処理員だけができます';
                if (!this.hazmatAt(p.cell)) return 'ここに危険物はありません';
                return this.canPay(seat, 2) ? null : 'AP が足りません';
            }
            case 'drive': {
                if (!exp) return '家族向けでは車を使いません';
                if (!['ambulance', 'engine'].includes(c.vehicle) || !isInt(c.side) || c.side < 0 || c.side > 3) return '行き先が正しくありません';
                const dist = sideDistance(this.vehicles[c.vehicle], c.side);
                if (!dist) return 'すでにそこにいます';
                if (c.vehicle === 'engine' && !this.onVehicle(seat, 'engine')) return '消防車に乗っている隊員だけが動かせます';
                return this.canPay(seat, 2 * dist) ? null : 'AP が足りません';
            }
            case 'gun': {
                if (!exp) return '家族向けでは放水しません';
                if (!this.onVehicle(seat, 'engine')) return '消防車のマスにいるときだけ放水できます';
                if (!this.quadrantClear(ENGINE_QUADRANT[this.vehicles.engine])) return '放水する区画に隊員がいます';
                return this.canPay(seat, p.role === 'driver' ? 2 : 4) ? null : 'AP が足りません';
            }
            case 'command': {
                if (p.role !== 'captain') return '隊長だけができます';
                if (!isInt(c.seat) || !this.players[c.seat] || c.seat === seat) return 'ほかの隊員を選んでください';
                const cost = this.moveCost(c.seat, c.to);
                if (cost === null) return 'そこへは動かせません';
                return p.cp >= cost ? null : '指揮の点が足りません';
            }
            case 'crew': {
                if (!exp) return '家族向けでは専門職を替えません';
                if (!this.onVehicle(seat, 'engine')) return '消防車のマスにいるときだけ替えられます';
                if (!this.unusedRoles().includes(c.role)) return 'その専門職は選べません';
                return this.canPay(seat, 2) ? null : 'AP が足りません';
            }
        }
        return '操作が正しくありません';
    }

    execute(seat, c) {
        const p = this.players[seat];
        switch (c.type) {
            case 'role': {
                p.role = c.role;
                this.log(`${p.name}は${ROLE[c.role].name}`);
                this.nextSetup();
                return;
            }
            case 'place': {
                p.cell = c.cell;
                this.log(`${p.name}が${SIDE_NAMES[this.sideOfOutside(c.cell)]}から入ります`);
                this.emit({ type: 'move', seat, to: c.cell });
                this.nextSetup();
                return;
            }
            case 'move': {
                this.pay(seat, this.moveCost(seat, c.to), 'mv');
                this.moveFirefighter(seat, c.to);
                return;
            }
            case 'carry': {
                p.carry = c.item;
                this.log(c.item[0] === 'p' ? `${p.name}が要救助者を${this.item(c.item).treated ? '連れて歩きます' : '運びます'}` : `${p.name}が危険物を運びます`);
                return;
            }
            case 'drop': {
                this.log(`${p.name}が${p.carry[0] === 'p' ? '要救助者' : '危険物'}を降ろしました`);
                p.carry = null;
                return;
            }
            case 'door': {
                this.pay(seat, 1);
                const e = this.edge(p.cell, c.to);
                e.s = e.s === 'open' ? 'closed' : 'open';
                this.log(`${p.name}が扉を${e.s === 'open' ? '開けました' : '閉めました'}`);
                this.emit({ type: 'door', a: p.cell, b: c.to, open: e.s === 'open' });
                return;
            }
            case 'extinguish': {
                this.pay(seat, this.extCost(seat), 'ext');
                const was = this.fire[c.cell];
                this.fire[c.cell] = was - 1;
                this.log(`${p.name}が${was === 2 ? '火を煙にしました' : '煙を消しました'}`);
                this.emit({ type: 'extinguish', cell: c.cell, to: was - 1 });
                return;
            }
            case 'chop': {
                this.pay(seat, p.role === 'rescue' ? 1 : 2);
                const broke = this.damageWall(edgeKey(p.cell, c.to));
                this.log(`${p.name}が壁を${broke ? '壊しました' : '傷めました'}（ダメージ ${this.damage}）`);
                this.emit({ type: 'chop', a: p.cell, b: c.to });
                this.checkCollapse();
                return;
            }
            case 'identify': {
                this.pay(seat, 1);
                const poi = this.pois.find(x => x.cell === c.cell && !x.revealed);
                this.reveal(poi, p.name);
                return;
            }
            case 'treat': {
                this.pay(seat, 1);
                const poi = this.pois.find(x => x.cell === p.cell && x.revealed && !x.treated);
                poi.treated = true;
                this.log(`${p.name}が要救助者を手当てしました`);
                return;
            }
            case 'dispose': {
                this.pay(seat, 2);
                const h = this.hazmatAt(p.cell);
                this.hazmats = this.hazmats.filter(x => x !== h);
                this.players.forEach(q => { if (q.carry === `h${h.id}`) q.carry = null; });
                this.log(`${p.name}が危険物を処理しました`);
                return;
            }
            case 'drive': {
                const from = this.vehicles[c.vehicle];
                const riding = this.onVehicle(seat, c.vehicle);
                this.pay(seat, 2 * sideDistance(from, c.side));
                this.vehicles[c.vehicle] = c.side;
                const spots = c.vehicle === 'engine' ? ENGINE_SPOTS : AMBULANCE_SPOTS;
                if (riding) {
                    const k = spots[from].indexOf(p.cell);
                    this.placeAt(seat, spots[c.side][Math.max(0, k)]);
                }
                this.log(`${p.name}が${c.vehicle === 'engine' ? '消防車' : '救急車'}を${SIDE_NAMES[c.side]}へ動かしました`);
                this.emit({ type: 'drive', vehicle: c.vehicle, side: c.side });
                return;
            }
            case 'gun': {
                this.pay(seat, p.role === 'driver' ? 2 : 4);
                this.fireGun(seat);
                return;
            }
            case 'command': {
                const q = this.players[c.seat];
                p.cp -= this.moveCost(c.seat, c.to);
                this.log(`${p.name}の指揮で${q.name}が動きます`);
                this.moveFirefighter(c.seat, c.to);
                return;
            }
            case 'crew': {
                this.pay(seat, 2);
                p.role = c.role;
                p.ext = 0;
                p.mv = 0;
                p.cp = 0;
                this.log(`${p.name}が${ROLE[c.role].name}に替わりました`);
                return;
            }
            case 'end': {
                this.endTurn(seat);
            }
        }
    }

    nextSetup() {
        if (this.current < this.players.length - 1) {
            this.current++;
            return;
        }
        this.current = 0;
        if (this.phase === 'role') {
            this.phase = 'place';
            this.log('建物の外の、始める場所を選んでください', { head: true });
            return;
        }
        this.phase = 'turn';
        this.startTurn();
    }

    sideOfOutside(cell) {
        const r = rowOf(cell);
        const c = colOf(cell);
        if (r === 0) return 0;
        if (c === 9) return 1;
        if (r === 7) return 2;
        return 3;
    }

    // AP を払う。pool（mv・ext）があれば先に使う
    pay(seat, cost, pool = null) {
        const p = this.players[seat];
        let rest = cost;
        if (pool) {
            const use = Math.min(p[pool], rest);
            p[pool] -= use;
            rest -= use;
        }
        p.ap -= rest;
    }

    placeAt(seat, cell) {
        const p = this.players[seat];
        p.cell = cell;
        if (p.carry) {
            const it = this.item(p.carry);
            if (it) it.cell = cell;
        }
    }

    // 隊員を動かし、持っているものも動かす。外に出たら助け出す。印のマスに入ったら正体を見る
    moveFirefighter(seat, to) {
        const p = this.players[seat];
        const from = p.cell;
        this.placeAt(seat, to);
        this.emit({ type: 'move', seat, from, to });
        if (p.carry && !isInside(to)) {
            const key = p.carry;
            p.carry = null;
            if (key[0] === 'p') {
                this.pois = this.pois.filter(x => `p${x.id}` !== key);
                this.rescued++;
                this.log(`${p.name}が要救助者を助け出しました（${this.rescued}人）`, { head: true });
                this.emit({ type: 'rescued', seat, cell: to });
                if (this.rescued >= WIN_RESCUED) this.finish(true, 'won');
            } else {
                this.hazmats = this.hazmats.filter(x => `h${x.id}` !== key);
                this.log(`${p.name}が危険物を外へ運び出しました`);
            }
            return;
        }
        const poi = this.pois.find(x => x.cell === to && !x.revealed);
        if (poi) this.reveal(poi, p.name);
    }

    reveal(poi, by) {
        poi.revealed = true;
        this.emit({ type: 'reveal', cell: poi.cell, victim: poi.victim });
        if (poi.victim) {
            this.log(`${by}が要救助者を見つけました`);
        } else {
            this.pois = this.pois.filter(x => x !== poi);
            this.log(`${by}が見たのは誤報でした`);
        }
    }

    // 壁に1つダメージ。2つで壊れる。壊れたら true
    damageWall(key) {
        const e = this.edges[key];
        e.d++;
        this.damage++;
        if (e.d >= 2) {
            this.edges[key] = { t: 'broken', was: 'wall' };
            return true;
        }
        return false;
    }

    checkCollapse() {
        if (this.phase !== 'end' && this.damage >= DAMAGE_LIMIT) this.finish(false, 'collapse');
    }

    // 放水：消防車の区画にダイスを振り（区画の外の目は裏返す）、そのマスとつながったとなりの火と煙を消す
    fireGun(seat) {
        const p = this.players[seat];
        const q = QUADRANTS[ENGINE_QUADRANT[this.vehicles.engine]];
        const roll = () => {
            let r = 1 + Math.floor(this.random() * 6);
            let c = 1 + Math.floor(this.random() * 8);
            if (r < q.rows[0] || r > q.rows[1]) r = 7 - r;
            if (c < q.cols[0] || c > q.cols[1]) c = 9 - c;
            return cellOf(r, c);
        };
        let cell = roll();
        if (p.role === 'driver' && !this.fire[cell]) cell = roll();
        const hit = [cell, ...NEIGHBORS[cell].filter(n => isInside(n) && this.passable(cell, n))];
        let n = 0;
        hit.forEach(x => {
            if (this.fire[x]) n++;
            this.fire[x] = 0;
        });
        this.log(`${p.name}が${q.name}へ放水（${rowOf(cell)}-${colOf(cell)}）：${n ? `${n}マスを消しました` : '外れました'}`);
        this.emit({ type: 'gun', cell, cells: hit });
    }

    // ---- 手番の終わりと延焼 ----

    startTurn() {
        const p = this.players[this.current];
        const role = roleOf(p.role);
        this.turnNo++;
        p.ap = Math.min(p.ap, SAVE_LIMIT) + role.ap;
        p.ext = role.ext ?? 0;
        p.mv = role.mv ?? 0;
        p.cp = role.cp ?? 0;
        this.log(`${p.name}（${role.name}）の番：${p.ap}AP`, { head: true });
        this.emit({ type: 'turn', seat: this.current });
    }

    endTurn(seat) {
        const p = this.players[seat];
        p.ap = Math.min(p.ap, SAVE_LIMIT);
        p.ext = 0;
        p.mv = 0;
        p.cp = 0;
        this.advanceFire();
        if (this.phase === 'end') return;
        this.current = (seat + 1) % this.players.length;
        this.startTurn();
    }

    // 火が広がる。ホットスポットに当たったら、もう一度振る
    advanceFire() {
        for (let k = 0; k < 6 && this.phase !== 'end'; k++) {
            const cell = this.rollDice();
            this.lastRoll = { r: rowOf(cell), c: colOf(cell) };
            const before = this.fire[cell];
            const where = `${ROOM_NAMES[roomOf(cell)]}（${rowOf(cell)}-${colOf(cell)}）`;
            if (before === 0) {
                this.fire[cell] = 1;
                this.log(`延焼：${where}に煙`);
            } else if (before === 1) {
                this.fire[cell] = 2;
                this.log(`延焼：${where}の煙が火に`);
            } else {
                this.log(`爆発！ ${where}`, { head: true });
                this.explode(cell);
            }
            this.emit({ type: 'roll', cell, r: rowOf(cell), c: colOf(cell), result: ['smoke', 'fire', 'explosion'][before] });
            if (!this.hotspots.includes(cell)) break;
            this.log('ホットスポット：もう一度広がります');
        }
        if (this.phase === 'end') return;
        this.resolveEffects();
        if (this.phase === 'end') return;
        this.replenish();
    }

    // 爆発：4つの向きへ。壁にはダメージ、閉じた扉は吹き飛び止まる。火のマスは衝撃波が突き抜ける
    explode(origin) {
        this.emit({ type: 'explosion', cell: origin });
        for (let dir = 0; dir < 4; dir++) {
            let cur = origin;
            while (this.phase !== 'end') {
                const next = stepFrom(cur, dir);
                if (next < 0) break;
                const key = edgeKey(cur, next);
                const e = this.edges[key];
                if (e?.t === 'wall') {
                    this.damageWall(key);
                    this.checkCollapse();
                    break;
                }
                if (e?.t === 'door') {
                    const closed = e.s === 'closed';
                    this.edges[key] = { t: 'broken', was: 'door' };
                    if (closed) break;
                }
                if (!isInside(next)) break;
                if (this.fire[next] !== 2) {
                    this.fire[next] = 2;
                    break;
                }
                cur = next;
            }
        }
    }

    // 延焼のあとの出来事：煙が火に移る・危険物の爆発・倒れる消防士・失われる要救助者
    resolveEffects() {
        for (let guard = 0; guard < 50 && this.phase !== 'end'; guard++) {
            let changed = this.flashover();
            // 火の中の消防士は倒れる。運んでいた要救助者は失われ、危険物はその場に落ちる
            this.players.forEach(p => {
                if (p.cell === null || !isInside(p.cell) || this.fire[p.cell] !== 2) return;
                const from = p.cell;
                if (p.carry) {
                    const key = p.carry;
                    p.carry = null;
                    if (key[0] === 'p') this.loseVictim(this.item(key));
                }
                const dest = this.knockdownCell(from);
                p.cell = dest;
                this.log(`${p.name}が倒れ、救急車へ運ばれました`, { head: true });
                this.emit({ type: 'knockdown', seat: p.id, from, to: dest });
                changed = true;
            });
            // 火の中の危険物は爆発し、ホットスポットが残る
            const burning = this.hazmats.filter(h => this.fire[h.cell] === 2 && !this.carrierOf(`h${h.id}`));
            burning.forEach(h => {
                if (this.phase === 'end') return;
                this.hazmats = this.hazmats.filter(x => x !== h);
                this.log('危険物が爆発！', { head: true });
                this.explode(h.cell);
                this.addHotspot(h.cell);
                changed = true;
            });
            if (!changed) break;
        }
        if (this.phase === 'end') return;
        // 火の中の印：要救助者なら失われ、誤報なら取り除く
        this.pois.filter(x => this.fire[x.cell] === 2).forEach(x => {
            if (this.phase === 'end') return;
            if (!x.revealed && !x.victim) {
                this.pois = this.pois.filter(y => y !== x);
                this.log('火に包まれた印は誤報でした');
                return;
            }
            this.loseVictim(x);
        });
    }

    // 煙のうち、つながったとなりに火があるものを火にする（変わらなくなるまで）
    flashover() {
        let any = false;
        for (let again = true; again;) {
            again = false;
            INSIDE_CELLS.forEach(cell => {
                if (this.fire[cell] !== 1) return;
                if (NEIGHBORS[cell].some(n => isInside(n) && this.fire[n] === 2 && this.passable(cell, n))) {
                    this.fire[cell] = 2;
                    again = true;
                    any = true;
                }
            });
        }
        return any;
    }

    loseVictim(poi) {
        if (!poi || this.phase === 'end') return;
        this.pois = this.pois.filter(x => x !== poi);
        this.players.forEach(q => { if (q.carry === `p${poi.id}`) q.carry = null; });
        this.lost++;
        this.log(`要救助者が炎に包まれました（${this.lost}人目）`, { head: true });
        this.emit({ type: 'lost', cell: poi.cell });
        if (this.lost >= LOSE_LOST) this.finish(false, 'lost');
    }

    // 倒れた消防士の行き先：家族向けはいちばん近い救急車の駐車場、上級は救急車のいる駐車場
    knockdownCell(from) {
        if (this.vehicles) return this.spotCell(AMBULANCE_SPOTS, this.vehicles.ambulance, from);
        const d = (x) => Math.abs(rowOf(x) - rowOf(from)) + Math.abs(colOf(x) - colOf(from));
        return AMBULANCE_SPOTS.flat().reduce((best, x) => (d(x) < d(best) ? x : best));
    }

    // 印を3つまで補う。火か煙のマスなら消してから置き、消防士のいるマスならすぐに正体を見る
    replenish() {
        for (let guard = 0; guard < 30 && this.poiCount() < POI_ON_BOARD && this.poiPool.length && this.phase !== 'end'; guard++) {
            const cell = this.rollCell(c => !this.pois.some(x => x.cell === c));
            this.fire[cell] = 0;
            const poi = this.addPoi(cell);
            this.log(`要救助者の印が${ROOM_NAMES[roomOf(cell)]}（${rowOf(cell)}-${colOf(cell)}）に`);
            this.emit({ type: 'poi', cell });
            if (this.playersAt(cell).length) this.reveal(poi, this.playersAt(cell)[0].name);
        }
    }

    finish(won, reason) {
        if (this.phase === 'end') return;
        this.phase = 'end';
        this.result = { won, reason };
        this.log(won ? `勝利！ ${END_REASONS[reason]}` : `敗北…… ${END_REASONS[reason]}`, { head: true });
        this.emit({ type: 'end', won, reason });
    }

    // ---- 道具 ----

    emit(event) {
        if (!this.events) return;
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(text, { head = false } = {}) {
        if (!this.logs) return;
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
            options: structuredClone(this.options),
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

    // ビューから、判定（commandError・moveCost など）だけに使うゲームを作る。画面が押せる手を調べるのに使う
    static fromView(view) {
        const g = Object.create(Game.prototype);
        Object.assign(g, {
            options: { mode: view.mode, level: view.level }, fire: view.fire, edges: view.edges, damage: view.damage,
            pois: view.pois, hazmats: view.hazmats, hotspots: view.hotspots, vehicles: view.vehicles, players: view.players,
            current: view.current, phase: view.phase, result: view.result, logs: null, events: null
        });
        return g;
    }

    // CPU が手番の中の手を試すための写し（記録・ログを持たず、乱数は使わない）
    // 正体の分からない印は、写しでは見ない（入っても正体を見ずに残す）
    simClone() {
        const g = Object.create(Game.prototype);
        g.options = this.options;
        g.fire = [...this.fire];
        g.edges = { ...this.edges };
        g.damage = this.damage;
        g.rescued = this.rescued;
        g.lost = this.lost;
        g.pois = this.pois.map(x => ({ id: x.id, cell: x.cell, revealed: x.revealed, victim: x.revealed ? x.victim : null, treated: x.treated }));
        g.hazmats = this.hazmats.map(h => ({ ...h }));
        g.hotspots = this.hotspots;
        g.vehicles = this.vehicles ? { ...this.vehicles } : null;
        g.players = this.players.map(p => ({ ...p }));
        g.current = this.current;
        g.phase = this.phase;
        g.result = null;
        g.sim = true;
        g.commands = { push() {} };
        g.logs = null;
        g.events = null;
        return g;
    }
}

// 写しで手を試すとき：扉の開け閉め・壁のダメージは辺を写してから変える
Game.prototype.simApply = function (seat, command) {
    const c = command;
    if (this.commandError(seat, c)) return false;
    const p = this.players[seat];
    if (c.type === 'door' || c.type === 'chop') {
        const key = edgeKey(p.cell, c.to);
        this.edges[key] = { ...this.edges[key] };
    }
    if (c.type === 'move' || c.type === 'command') {
        const s = c.type === 'command' ? c.seat : seat;
        const cost = this.moveCost(s, c.to);
        if (c.type === 'command') p.cp -= cost;
        else this.pay(seat, cost, 'mv');
        const q = this.players[s];
        this.placeAt(s, c.to);
        if (q.carry && !isInside(c.to)) {
            const key = q.carry;
            q.carry = null;
            if (key[0] === 'p') {
                this.pois = this.pois.filter(x => `p${x.id}` !== key);
                this.rescued++;
            } else this.hazmats = this.hazmats.filter(x => `h${x.id}` !== key);
        }
        return true;
    }
    if (c.type === 'end' || c.type === 'gun' || c.type === 'identify') return false;
    this.execute(seat, c);
    return true;
};

export { ROLES, LEVELS };
