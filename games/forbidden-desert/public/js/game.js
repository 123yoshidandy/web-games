/**
 * 禁断の砂漠の進行（2〜5人の協力ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山の並びはシードから決まる）
 *
 * 手番の流れ
 * - 行動（4つ）：移動・砂の除去・発掘・部品を拾う・役割の力。水と装備を渡すのと、装備を使うのは行動を使わない
 * - 行動を終えたら、嵐の目盛りの枚数だけ嵐のカードを1枚ずつ引いて解決する（気象学者が減らした分は引かない）
 *   - 風：嵐の目が矢印の向きに動き、すべり込んだタイルに砂が1つずつ積もる（端に着いたら残りはとばす）
 *   - 嵐が強まる：目盛りが1つ上がる。日差しが照りつける：トンネル・日よけの下にいない全員が水を1つ失う
 * 勝ち：4つの部品を拾い、全員が掘り出した発射台に集まって離陸する
 * 負け：水が尽きた人が日差しを受ける・置く砂がなくなる・嵐の目盛りが最後を越える
 *
 * 自分で決めた点（README の「決めたこと」）
 * - 水や装備を渡す・装備を使うのは、誰でも、どの手番の行動と嵐の段階でもできる（時間の加速だけは自分の手番の行動の段階）
 * - 嵐のカードは、手番の人が1枚ずつ引く（画面は自動で引く）
 * - 気象学者の力は「引く枚数を減らす」だけにし、山の上を見て1枚を下に回す力は入れていない
 * - 水が0の人がさらに日差しを受けたら、渇きで負け
 */

import { createRandom, shuffle } from './random.js';
import {
    CELLS, MIN_PLAYERS, MAX_PLAYERS, ACTIONS_PER_TURN, SAND_TOTAL, BLOCKED, START_SAND, STORM_START,
    PARTS, TILES, TILE_NAMES, GEAR_KINDS, ROLES, ROLE_BY_KEY, GEAR_CARDS, GEAR_BY_KEY, DIRS, STORM_CARDS, METER, LEVELS,
    rowOf, colOf, posAt, adjacent
} from './data.js';

export { MIN_PLAYERS, MAX_PLAYERS };

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    move: ['to', 'carry'],
    tunnel: ['to'],
    dig: ['at'],
    excavate: [],
    pickup: [],
    collect: [],
    calm: [],
    navigate: ['who', 'path'],
    water: ['to'],
    give: ['to', 'card'],
    gear: ['card', 'at', 'carry'],
    launch: [],
    pass: [],
    storm: []
};
// 行動を1つ使う操作
export const ACTION_TYPES = ['move', 'tunnel', 'dig', 'excavate', 'pickup', 'collect', 'calm', 'navigate'];
// 待った（1手戻す）ができる操作。隠れた情報を見せる操作（発掘・地中鏡）と嵐は戻せない
const UNDOABLE = ['move', 'tunnel', 'dig', 'pickup', 'collect', 'calm', 'navigate', 'water', 'give'];
const UNDOABLE_GEAR = ['blaster', 'jetpack', 'shield', 'reserve', 'throttle'];

export const END_REASONS = {
    won: '部品をそろえ、飛行機で砂漠を脱出しました',
    thirst: '水が尽きて、仲間が倒れました',
    sand: '砂が積もりきり、砂漠に埋もれました',
    storm: '嵐が強まりきり、飲み込まれました'
};
const MAX_LOGS = 400;
const isInt = (v) => Number.isInteger(v);
const isPos = (v) => isInt(v) && v >= 0 && v < CELLS;

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, level（novice・normal・elite・legendary）, roles（役割の key の並び。省くとランダム）}
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const level = Object.hasOwn(LEVELS, options.level) ? options.level : 'normal';
        const roleKeys = ROLES.map(r => r.key);
        const fixedRoles = Array.isArray(options.roles) && options.roles.length === players.length
            && options.roles.every(k => roleKeys.includes(k)) && new Set(options.roles).size === players.length
            ? [...options.roles] : null;
        this.options = { seed, level, ...(fixedRoles ? { roles: fixedRoles } : {}) };
        this.random = createRandom(seed);

        // タイル：裏向きに並べ、真ん中を嵐の目にする
        this.tiles = TILES.map(t => ({ ...t, revealed: false, sand: 0 }));
        const order = shuffle(this.tiles.map(t => t.id), this.random);
        this.grid = [];
        for (let pos = 0; pos < CELLS; pos++) this.grid.push(pos === STORM_START ? null : order.shift());
        // home：最初に置いたマス。画面がタイルを見分けるのに使う（裏のタイルの種類はわからない）
        this.grid.forEach((id, pos) => { if (id !== null) this.tiles[id].home = pos; });
        START_SAND.forEach(pos => { this.tiles[this.grid[pos]].sand = 1; });
        this.storm = STORM_START;

        // 部品：まだ見つかっていない（hidden）→ 置き場所がわかった（placed。tile が null なら嵐の目の中）→ 拾った（found）
        this.parts = PARTS.map(p => ({ key: p.key, state: 'hidden', tile: null }));
        this.peeked = [];                         // 地中鏡でのぞいたタイル（協力ゲームなので全員に見せる）
        this.shields = [];                        // 日よけ { tile, owner }
        this.gearDeck = shuffle(GEAR_CARDS.map((_, i) => i), this.random);
        this.stormDeck = shuffle(STORM_CARDS.map(c => c.id), this.random);
        this.stormDiscard = [];
        this.meter = LEVELS[level].start;
        this.ladder = METER[players.length];

        const roles = fixedRoles ?? shuffle([...roleKeys], this.random).slice(0, players.length);
        const crash = this.tiles.find(t => t.kind === 'crash').id;
        this.players = players.map((p, id) => ({
            id,
            name: String(p.name ?? `プレイヤー${id + 1}`),
            isCPU: !!p.isCPU,
            role: roles[id],
            tile: crash,
            water: ROLE_BY_KEY[roles[id]].water,
            gear: []
        }));

        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.result = null;                       // { won, reason }
        this.turnNo = 0;
        this.current = 0;
        this.phase = 'actions';                   // actions → storm → 次の人の actions。終われば end
        this.actionsLeft = ACTIONS_PER_TURN;
        this.calmed = 0;                          // 気象学者が減らした嵐のカードの枚数
        this.stormLeft = 0;
        this.lastStorm = null;                    // いちばん最近引いた嵐のカード
        this.log(`${this.players.map(p => `${p.name}（${this.roleName(p.id)}）`).join('・')}が墜落地点から出発します`, { head: true });
        this.beginTurn(0);
    }

    // ---- 見てよい情報の道具 ----

    roleName(seat) {
        return ROLE_BY_KEY[this.players[seat].role].name;
    }

    posOf(tileId) {
        return this.grid.indexOf(tileId);
    }

    playerPos(seat) {
        return this.posOf(this.players[seat].tile);
    }

    tileAt(pos) {
        const id = this.grid[pos];
        return id === null || id === undefined ? null : this.tiles[id];
    }

    sandOnBoard() {
        return this.tiles.reduce((sum, t) => sum + t.sand, 0);
    }

    stormDraws() {
        return this.ladder[Math.min(this.meter, this.ladder.length - 1)];
    }

    isBlocked(tileId) {
        return this.tiles[tileId].sand >= BLOCKED;
    }

    playersOn(tileId) {
        return this.players.filter(p => p.tile === tileId).map(p => p.id);
    }

    // 斜めに動ける（探検家）
    diagonal(seat) {
        return this.players[seat].role === 'explorer';
    }

    // ふさがったタイルから出られるか（登山家か、登山家と同じタイル）
    canLeave(seat) {
        const p = this.players[seat];
        if (!this.isBlocked(p.tile)) return true;
        return this.players.some(q => q.role === 'climber' && q.tile === p.tile);
    }

    canEnter(seat, pos) {
        const tile = this.tileAt(pos);
        if (!tile) return false;
        return this.players[seat].role === 'climber' || tile.sand < BLOCKED;
    }

    // 1歩で行けるマス（移動の決まり。トンネルは含まない）
    stepTargets(seat, from = this.playerPos(seat)) {
        return adjacent(from, this.diagonal(seat)).filter(pos => this.canEnter(seat, pos));
    }

    // 砂を取り除ける・吹き飛ばせるマス（自分のマスと、となり。探検家は斜めも）
    reach(seat) {
        const pos = this.playerPos(seat);
        return [pos, ...adjacent(pos, this.diagonal(seat))].filter(p => this.tileAt(p));
    }

    revealedOf(kind) {
        return this.tiles.filter(t => t.revealed && t.kind === kind).map(t => t.id);
    }

    partsFound() {
        return this.parts.filter(p => p.state === 'found').length;
    }

    launchReady() {
        const pad = this.tiles.find(t => t.kind === 'launch');
        return pad.revealed && pad.sand < BLOCKED && this.partsFound() === PARTS.length && this.players.every(p => p.tile === pad.id);
    }

    shielded(tileId) {
        return this.shields.some(s => s.tile === tileId);
    }

    // 待った：最後の操作が、今の手番の行動の段階のもので、隠れた情報を見せないものなら戻せる
    canUndo() {
        if (this.phase !== 'actions' || !this.commands.length) return false;
        const last = this.commands.at(-1);
        if (last.turn !== this.turnNo || last.playerId !== this.current) return false;
        const c = last.command;
        return UNDOABLE.includes(c.type) || (c.type === 'gear' && UNDOABLE_GEAR.includes(GEAR_CARDS[c.card]));
    }

    // 操作を待っている席（協力ゲームで、手番の人だけが動かす）
    actors() {
        return this.isOver() ? [] : [this.current];
    }

    isOver() {
        return this.phase === 'end';
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
        this.commands.push({ playerId, command: structuredClone(recorded), turn: this.turnNo });
        this.execute(playerId, recorded);
        return true;
    }

    // 判定（状態を変えない）。通らなければ理由を返す
    commandError(seat, c) {
        const me = this.players[seat];
        const pos = this.playerPos(seat);
        const here = this.tiles[me.tile];
        // 水・装備を渡す・装備を使うのは、手番でない人もできる
        if (seat !== this.current && !['water', 'give', 'gear'].includes(c.type)) return 'あなたの手番ではありません';
        if (c.type === 'storm') {
            return this.phase === 'storm' && this.stormLeft > 0 ? null : '今は嵐のカードを引けません';
        }
        if (c.type === 'water') {
            if (this.phase !== 'actions' && this.phase !== 'storm') return '今は水を渡せません';
            const to = this.players[c.to];
            if (!isInt(c.to) || !to || c.to === seat) return '渡す相手が正しくありません';
            const near = to.tile === me.tile || (me.role === 'waterCarrier' && adjacent(pos, false).includes(this.playerPos(c.to)));
            if (!near) return '同じタイルの仲間にだけ渡せます';
            if (me.water <= 0) return '水がありません';
            if (to.water >= ROLE_BY_KEY[to.role].water) return '相手の水筒はいっぱいです';
            return null;
        }
        if (c.type === 'give') {
            if (this.phase !== 'actions' && this.phase !== 'storm') return '今は装備を渡せません';
            const to = this.players[c.to];
            if (!isInt(c.to) || !to || c.to === seat) return '渡す相手が正しくありません';
            if (to.tile !== me.tile) return '同じタイルの仲間にだけ渡せます';
            return me.gear.includes(c.card) ? null : 'その装備は持っていません';
        }
        if (c.type === 'gear') return this.gearError(seat, c);
        if (this.phase !== 'actions') return '今は行動できません';
        if (c.type === 'pass') return null;
        if (c.type === 'launch') return this.launchReady() ? null : '全員が部品を持って発射台に集まる必要があります';
        if (this.actionsLeft <= 0) return '行動が残っていません';
        switch (c.type) {
            case 'move': {
                if (!isPos(c.to) || !adjacent(pos, this.diagonal(seat)).includes(c.to)) return 'となりのタイルにだけ動けます';
                if (!this.canLeave(seat)) return '砂に埋もれていて動けません。先に砂を取り除きましょう';
                if (!this.canEnter(seat, c.to)) return 'ふさがったタイルには入れません';
                if (c.carry !== undefined) {
                    if (me.role !== 'climber') return '仲間を連れて行けるのは登山家だけです';
                    const q = this.players[c.carry];
                    if (!isInt(c.carry) || !q || c.carry === seat || q.tile !== me.tile) return '連れて行く仲間が正しくありません';
                }
                return null;
            }
            case 'tunnel': {
                if (here.kind !== 'tunnel' || !here.revealed || here.sand >= BLOCKED) return '掘り出したトンネルにいるときだけ使えます';
                const to = this.tileAt(c.to);
                if (!isPos(c.to) || !to || to.id === here.id || to.kind !== 'tunnel' || !to.revealed || to.sand >= BLOCKED) return 'ほかのトンネルにだけ移れます';
                return null;
            }
            case 'dig': {
                if (!isPos(c.at) || !this.reach(seat).includes(c.at)) return '自分か、となりのタイルの砂だけを取り除けます';
                return this.tileAt(c.at).sand > 0 ? null : 'そのタイルに砂はありません';
            }
            case 'excavate':
                if (here.revealed) return 'このタイルは掘り出し済みです';
                return here.sand > 0 ? '砂をすべて取り除いてから掘り出します' : null;
            case 'pickup': {
                const part = this.parts.find(p => p.state === 'placed' && p.tile === here.id);
                if (!part) return 'このタイルに部品はありません';
                return here.sand > 0 ? '砂をすべて取り除いてから拾います' : null;
            }
            case 'collect':
                if (me.role !== 'waterCarrier') return '水をくめるのは水運びだけです';
                if (here.kind !== 'water' || !here.revealed) return '掘り出した井戸でだけくめます';
                return me.water >= ROLE_BY_KEY[me.role].water ? '水筒はいっぱいです' : null;
            case 'calm':
                if (me.role !== 'meteorologist') return '嵐を静められるのは気象学者だけです';
                return this.calmed >= this.stormDraws() ? 'これ以上は減らせません' : null;
            case 'navigate':
                return this.navigateError(seat, c);
            default:
                return '操作が正しくありません';
        }
    }

    navigateError(seat, c) {
        if (this.players[seat].role !== 'navigator') return '仲間を動かせるのは航海士だけです';
        const q = this.players[c.who];
        if (!isInt(c.who) || !q || c.who === seat) return '動かす仲間が正しくありません';
        const path = c.path;
        if (!Array.isArray(path) || path.length < 1 || path.length > 3 || !path.every(isPos)) return '動かす道が正しくありません';
        if (!this.canLeave(c.who)) return 'その仲間は砂に埋もれていて動けません';
        let from = this.playerPos(c.who);
        for (const step of path) {
            if (!adjacent(from, this.diagonal(c.who)).includes(step) || !this.canEnter(c.who, step)) return '通れない道です';
            from = step;
        }
        return null;
    }

    gearError(seat, c) {
        if (this.phase !== 'actions' && this.phase !== 'storm') return '今は装備を使えません';
        const me = this.players[seat];
        if (!isInt(c.card) || !me.gear.includes(c.card)) return 'その装備は持っていません';
        switch (GEAR_CARDS[c.card]) {
            case 'blaster':
                if (!isPos(c.at) || !this.reach(seat).includes(c.at)) return '自分か、となりのタイルにだけ使えます';
                return this.tileAt(c.at).sand > 0 ? null : 'そのタイルに砂はありません';
            case 'jetpack': {
                const to = this.tileAt(c.at);
                if (!isPos(c.at) || !to || to.id === me.tile) return '飛ぶ先が正しくありません';
                if (to.sand >= BLOCKED) return 'ふさがったタイルには飛べません';
                if (c.carry !== undefined) {
                    const q = this.players[c.carry];
                    if (!isInt(c.carry) || !q || c.carry === seat || q.tile !== me.tile) return '連れて行く仲間が正しくありません';
                }
                return null;
            }
            case 'shield':
                return null;
            case 'terrascope': {
                const t = this.tileAt(c.at);
                if (!isPos(c.at) || !t || t.revealed) return 'まだ掘り出していないタイルにだけ使えます';
                return this.peeked.includes(t.id) ? 'そのタイルはのぞき済みです' : null;
            }
            case 'reserve':
                return null;
            case 'throttle':
                return this.phase === 'actions' && seat === this.current ? null : '自分の手番の行動の段階でだけ使えます';
            default:
                return '操作が正しくありません';
        }
    }

    execute(seat, c) {
        const me = this.players[seat];
        const pos = this.playerPos(seat);
        switch (c.type) {
            case 'storm':
                this.drawStorm();
                return;
            case 'water': {
                const to = this.players[c.to];
                me.water--;
                to.water++;
                this.log(`${me.name}が${to.name}に水を渡しました`);
                this.emit({ type: 'water', from: seat, to: c.to });
                return;
            }
            case 'give': {
                me.gear.splice(me.gear.indexOf(c.card), 1);
                this.players[c.to].gear.push(c.card);
                this.log(`${me.name}が${this.players[c.to].name}に${GEAR_BY_KEY[GEAR_CARDS[c.card]].name}を渡しました`);
                return;
            }
            case 'gear':
                this.useGear(seat, c);
                return;
            case 'pass':
                this.log(`${me.name}が行動を終えました`);
                this.endActions();
                return;
            case 'launch':
                this.log('全員で飛行機に乗り込み、離陸しました', { head: true });
                this.finish(true, 'won');
                return;
        }
        this.actionsLeft--;
        switch (c.type) {
            case 'move': {
                me.tile = this.grid[c.to];
                const carried = c.carry !== undefined ? this.players[c.carry] : null;
                if (carried) carried.tile = me.tile;
                this.log(`${me.name}${carried ? `が${carried.name}を連れて` : 'が'}${this.dirName(pos, c.to)}へ移動`);
                this.emit({ type: 'move', seat, to: c.to });
                break;
            }
            case 'tunnel':
                me.tile = this.grid[c.to];
                this.log(`${me.name}がトンネルを通って移動`);
                this.emit({ type: 'move', seat, to: c.to });
                break;
            case 'dig': {
                const tile = this.tileAt(c.at);
                const n = Math.min(tile.sand, me.role === 'archeologist' ? 2 : 1);
                tile.sand -= n;
                this.log(`${me.name}が砂を${n}つ取り除きました`);
                this.emit({ type: 'dig', at: c.at, n });
                break;
            }
            case 'excavate':
                this.excavate(seat);
                break;
            case 'pickup': {
                const part = this.parts.find(p => p.state === 'placed' && p.tile === me.tile);
                part.state = 'found';
                part.tile = null;
                part.by = seat;
                this.log(`${me.name}が${PARTS.find(p => p.key === part.key).name}を拾いました（${this.partsFound()}/4）`, { head: true });
                this.emit({ type: 'pickup', seat, part: part.key });
                break;
            }
            case 'collect': {
                const max = ROLE_BY_KEY[me.role].water;
                me.water = Math.min(max, me.water + 2);
                this.log(`${me.name}が井戸で水をくみました`);
                this.emit({ type: 'water', to: seat });
                break;
            }
            case 'calm':
                this.calmed++;
                this.log(`${me.name}が嵐を静めました（引く枚数 -${this.calmed}）`);
                break;
            case 'navigate': {
                const q = this.players[c.who];
                q.tile = this.grid[c.path.at(-1)];
                this.log(`${me.name}が${q.name}を${c.path.length}マス動かしました`);
                this.emit({ type: 'move', seat: c.who, to: c.path.at(-1) });
                break;
            }
        }
        if (this.phase === 'actions' && this.actionsLeft <= 0) this.endActions();
    }

    useGear(seat, c) {
        const me = this.players[seat];
        const kind = GEAR_CARDS[c.card];
        me.gear.splice(me.gear.indexOf(c.card), 1);
        const name = GEAR_BY_KEY[kind].name;
        switch (kind) {
            case 'blaster': {
                const tile = this.tileAt(c.at);
                const n = tile.sand;
                tile.sand = 0;
                this.log(`${me.name}が${name}で砂を${n}つ取り除きました`);
                this.emit({ type: 'dig', at: c.at, n });
                break;
            }
            case 'jetpack': {
                const carried = c.carry !== undefined ? this.players[c.carry] : null;
                me.tile = this.grid[c.at];
                if (carried) carried.tile = me.tile;
                this.log(`${me.name}が${name}で飛びました${carried ? `（${carried.name}も一緒に）` : ''}`);
                this.emit({ type: 'move', seat, to: c.at });
                break;
            }
            case 'shield':
                this.shields = this.shields.filter(s => s.owner !== seat);
                this.shields.push({ tile: me.tile, owner: seat });
                this.log(`${me.name}が${name}を広げました`);
                break;
            case 'terrascope': {
                const tile = this.tileAt(c.at);
                this.peeked.push(tile.id);
                this.log(`${me.name}が${name}でのぞきました：${this.tileName(tile)}`);
                break;
            }
            case 'reserve':
                this.playersOn(me.tile).forEach(s => {
                    const p = this.players[s];
                    p.water = Math.min(ROLE_BY_KEY[p.role].water, p.water + 2);
                });
                this.log(`${me.name}が${name}を分け合いました`);
                this.emit({ type: 'water', to: seat });
                break;
            case 'throttle':
                this.actionsLeft += 2;
                this.log(`${me.name}が${name}を使いました（行動 +2）`);
                break;
        }
    }

    tileName(tile) {
        if (tile.kind === 'clue') return `${PARTS.find(p => p.key === tile.part).name}の手がかり（${tile.axis === 'row' ? '行' : '列'}）`;
        return TILE_NAMES[tile.kind];
    }

    dirName(from, to) {
        const dr = rowOf(to) - rowOf(from);
        const dc = colOf(to) - colOf(from);
        return `${dr < 0 ? '北' : dr > 0 ? '南' : ''}${dc < 0 ? '西' : dc > 0 ? '東' : ''}`;
    }

    excavate(seat) {
        const me = this.players[seat];
        const tile = this.tiles[me.tile];
        tile.revealed = true;
        this.peeked = this.peeked.filter(id => id !== tile.id);
        this.log(`${me.name}が掘り出しました：${this.tileName(tile)}`, { head: tile.kind === 'clue' || tile.kind === 'launch' });
        this.emit({ type: 'reveal', home: tile.home, kind: tile.kind });
        if (GEAR_KINDS.includes(tile.kind)) {
            const card = this.gearDeck.shift();
            if (card !== undefined) {
                me.gear.push(card);
                this.log(`${me.name}が装備を見つけました：${GEAR_BY_KEY[GEAR_CARDS[card]].name}`);
            }
        }
        if (tile.kind === 'water') {
            this.playersOn(tile.id).forEach(s => {
                const p = this.players[s];
                p.water = Math.min(ROLE_BY_KEY[p.role].water, p.water + 2);
            });
            this.log('井戸から水がわき出ました');
        }
        if (tile.kind === 'mirage') this.log('水は蜃気楼でした');
        if (tile.kind === 'clue') this.checkPart(tile.part);
    }

    // 部品の手がかりが2枚とも表になったら、行と列の交わるところに部品を置く
    checkPart(key) {
        const clues = this.tiles.filter(t => t.kind === 'clue' && t.part === key);
        if (!clues.every(t => t.revealed)) return;
        const part = this.parts.find(p => p.key === key);
        if (part.state !== 'hidden') return;
        const row = rowOf(this.posOf(clues.find(t => t.axis === 'row').id));
        const col = colOf(this.posOf(clues.find(t => t.axis === 'col').id));
        const pos = posAt(row, col);
        part.state = 'placed';
        part.tile = this.grid[pos];        // 嵐の目なら null（次にすべり込んだタイルに乗る）
        this.log(`${PARTS.find(p => p.key === key).name}の場所がわかりました`, { head: true });
        this.emit({ type: 'part', part: key, pos });
    }

    endActions() {
        this.phase = 'storm';
        this.stormLeft = Math.max(0, this.stormDraws() - this.calmed);
        if (this.stormLeft === 0) this.nextTurn();
    }

    drawStorm() {
        if (!this.stormDeck.length) {
            this.stormDeck = shuffle(this.stormDiscard, this.random);
            this.stormDiscard = [];
            this.log('嵐のカードを切り直しました');
        }
        const id = this.stormDeck.shift();
        this.stormDiscard.push(id);
        this.stormLeft--;
        const card = STORM_CARDS[id];
        this.lastStorm = { id, seq: this.eventSeq + 1 };
        if (card.kind === 'wind') this.blow(card);
        else if (card.kind === 'up') {
            this.meter++;
            this.emit({ type: 'storm', card: id });
            if (this.meter >= this.ladder.length) {
                this.log('嵐が強まりきりました', { head: true });
                this.finish(false, 'storm');
                return;
            }
            this.log(`嵐が強まりました（次から${this.stormDraws()}枚）`, { head: true });
        } else {
            this.emit({ type: 'storm', card: id });
            const hit = this.players.filter(p => !this.shielded(p.tile) && !(this.tiles[p.tile].kind === 'tunnel' && this.tiles[p.tile].revealed));
            this.log(`日差しが照りつけました${hit.length < this.players.length ? `（${this.players.length - hit.length}人は日陰）` : ''}`);
            for (const p of hit) {
                if (p.water <= 0) {
                    this.log(`${p.name}の水が尽きました`, { head: true });
                    this.finish(false, 'thirst');
                    return;
                }
                p.water--;
            }
        }
        if (this.isOver()) return;
        if (this.stormLeft <= 0) this.nextTurn();
    }

    // 風：嵐の目が dir へ n マス動く。すべり込んだタイルに砂が1つ積もる
    blow(card) {
        const { dr, dc } = DIRS[card.dir];
        let moved = 0;
        for (let i = 0; i < card.n; i++) {
            const from = posAt(rowOf(this.storm) + dr, colOf(this.storm) + dc);
            if (from < 0) break;
            if (this.sandOnBoard() >= SAND_TOTAL) {
                this.emit({ type: 'storm', card: card.id, moved });
                this.log('置く砂がなくなりました', { head: true });
                this.finish(false, 'sand');
                return;
            }
            const id = this.grid[from];
            this.grid[this.storm] = id;
            this.grid[from] = null;
            this.tiles[id].sand++;
            // 嵐の目の中で待っていた部品は、すべり込んだタイルに乗る
            this.parts.forEach(p => {
                if (p.state === 'placed' && p.tile === null) p.tile = id;
            });
            this.storm = from;
            moved++;
        }
        this.emit({ type: 'storm', card: card.id, moved });
        this.log(moved ? `風が${DIRS[card.dir].name}へ${card.n}（${moved}枚が動き、砂が積もりました）` : `風が${DIRS[card.dir].name}へ${card.n}（嵐の目は端で止まりました）`);
    }

    beginTurn(seat) {
        this.current = seat;
        this.phase = 'actions';
        this.actionsLeft = ACTIONS_PER_TURN;
        this.calmed = 0;
        this.stormLeft = 0;
        this.turnNo++;
        // 日よけは、使った人の次の手番の初めまで
        this.shields = this.shields.filter(s => s.owner !== seat);
        const p = this.players[seat];
        this.log(`${p.name}（${this.roleName(seat)}）の手番`, { head: true });
        this.emit({ type: 'turn', seat });
    }

    nextTurn() {
        this.beginTurn((this.current + 1) % this.players.length);
    }

    finish(won, reason) {
        this.phase = 'end';
        this.result = { won, reason };
        this.log(won ? `勝利！ ${END_REASONS[reason]}` : `敗北…… ${END_REASONS[reason]}`, { head: true });
        this.emit({ type: 'end', won, reason });
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > 100) this.events.splice(0, this.events.length - 100);
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

    // 最後の操作を取り消した局面（待った）。戻せなければ null
    undo() {
        if (!this.canUndo()) return null;
        const saved = this.persist();
        return Game.replay(saved.players, saved.options, saved.commands.slice(0, -1));
    }
}
