/**
 * 禁断の島の進行（2〜4人の協力ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びと島の並びはシードから決まる）
 *
 * 手番の流れ
 * - 行動（3アクション：移動・補強・カードを渡す・宝を手に入れる）→ 宝のカードを2枚引く（水位上昇はその場で解決）
 *   → 浸水（水位の枚数だけ浸水のカードを1枚ずつめくる）→ 次の人
 * - 浸水した場所がもう一度めくられると沈む。沈んだ場所にいた駒は、となりへ泳いで逃げる（逃げ先が2つ以上なら、その人が選ぶ）
 * - 手札は5枚まで。6枚以上になったら、すぐに捨てる（特別なカードを使ってもよい）
 * - 特別なカード（ヘリで脱出・土のう）は、誰の手番でも、いつでも使える（アクションではない）。泳いで逃げる途中だけは使えない
 * 勝ち：宝を4つ手に入れ、全員が発着場にいるときに「ヘリで脱出」を使う
 * 負け：発着場が沈む・まだ手に入れていない宝の神殿が2つとも沈む・泳いで逃げる先がない・水位が頂点に達する
 *
 * 自分で決めた点（README の「決めたこと」）
 * - 「引く」「浸水」は手番の人が押して進める（特別なカードを使う間を作るため。画面は少し待って自動で押す）
 * - 航海士がほかの駒を動かすときは、上下左右に2マスまで（動かされる人の役割の移動は使わない）
 * - 泳いで逃げる先が1つだけなら、その場で動かす
 */

import { createRandom, shuffle } from './random.js';
import {
    GRID, CELLS, rowOf, colOf, cellAt, TREASURES, TREASURE_KEYS, TILES, TILE_COUNT, FOOLS, TEMPLES, ROLES, TREASURE_DECK,
    isTreasureCard, isSpecialCard, cardName, MAX_WATER, FLOOD_RATES, LEVELS, ACTIONS_PER_TURN, HAND_LIMIT, START_CARDS, INITIAL_FLOODS
} from './data.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    move: ['to'],
    fly: ['to'],
    shore: ['tile', 'tile2'],
    give: ['to', 'card'],
    capture: [],
    navigate: ['pawn', 'to'],
    pass: [],
    draw: [],
    flood: [],
    discard: ['card'],
    swim: ['to'],
    heli: ['pawns', 'to'],
    liftoff: [],
    sand: ['tile']
};
export const ACTION_TYPES = ['move', 'fly', 'shore', 'give', 'capture', 'navigate'];
export const SPECIAL_TYPES = ['heli', 'liftoff', 'sand'];
export const END_REASONS = {
    won: '宝を4つ持って、島から脱出しました',
    fools: '愚者の発着場が沈みました',
    temple: 'まだ手に入れていない宝の神殿が、2つとも沈みました',
    drown: '泳いで逃げられる場所がありませんでした',
    water: '水位が頂点に達し、島が沈みました'
};
// 場所の様子
export const DRY = 0;
export const FLOODED = 1;
export const SUNK = 2;

const MAX_LOGS = 400;
const isInt = (v) => Number.isInteger(v);
const isTile = (v) => isInt(v) && v >= 0 && v < TILE_COUNT;
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

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

        // 島：24 枚のタイルを、ランダムに並べる
        this.cellOf = [];                   // タイル → マス
        this.tileAt = Array(GRID * GRID).fill(null);
        shuffle(TILES.map(t => t.id), this.random).forEach((tile, i) => {
            this.cellOf[tile] = CELLS[i];
            this.tileAt[CELLS[i]] = tile;
        });
        this.tiles = Array(TILE_COUNT).fill(DRY);
        this.captured = [false, false, false, false];
        this.water = LEVELS[level].water;
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.result = null;                 // { won, reason }

        // 浸水のカード：6枚めくって浸水させる
        this.floodDeck = shuffle(TILES.map(t => t.id), this.random);
        this.floodDiscard = [];
        this.floodRemoved = [];
        this.floodTop = 0;                  // 山の上の、水位上昇で戻した束の残り枚数（どの場所かは公開されている）
        for (let i = 0; i < INITIAL_FLOODS; i++) {
            const tile = this.floodDeck.shift();
            this.tiles[tile] = FLOODED;
            this.floodDiscard.push(tile);
        }

        // 役割と駒
        const roles = fixedRoles ?? shuffle([...roleKeys], this.random).slice(0, players.length);
        this.players = players.map((p, id) => ({
            id,
            name: String(p.name ?? `プレイヤー${id + 1}`),
            isCPU: !!p.isCPU,
            role: roles[id],
            tile: TILES.find(t => t.start === roles[id]).id,
            hand: []
        }));

        // 宝のカード：2枚ずつ配る。水位上昇は配らずに戻して、切り直す
        this.treasureDeck = shuffle([...TREASURE_DECK], this.random);
        this.treasureDiscard = [];
        const rises = [];
        this.players.forEach(p => {
            while (p.hand.length < START_CARDS) {
                const card = this.treasureDeck.shift();
                if (card === 'rise') rises.push(card);
                else p.hand.push(card);
            }
        });
        if (rises.length) this.treasureDeck = shuffle([...this.treasureDeck, ...rises], this.random);

        this.current = 0;
        this.turnNo = 1;
        this.phase = 'actions';             // actions・draw・flood・discard・swim・end
        this.actionsLeft = ACTIONS_PER_TURN;
        this.pilotUsed = false;
        this.floodLeft = 0;
        this.swimQueue = [];                // 泳いで逃げる駒（先頭の人が選ぶ）
        this.resume = null;                 // 捨てたあとに戻る段階（actions・flood）
        this.drawn = [];                    // 今の手番に引いた宝のカード
        this.flooded = [];                  // 今の手番にめくった浸水のカード
        this.log('島の探検が始まった', { head: true });
        this.log(`${this.nameOf(0)}の番`, { head: true });
    }

    // ---- 調べる（状態を変えない）----

    isOver() { return this.phase === 'end'; }
    floodRate() { return FLOOD_RATES[Math.min(this.water, MAX_WATER - 1)]; }
    roleOf(seat) { return this.players[seat].role; }
    nameOf(seat) { return ROLES.find(r => r.key === this.players[seat].role).name; }
    overLimit() { return this.players.filter(p => p.hand.length > HAND_LIMIT).map(p => p.id); }
    alive(tile) { return isTile(tile) && this.tiles[tile] !== SUNK; }
    pawnsOn(tile) { return this.players.filter(p => p.tile === tile).map(p => p.id); }

    // 進めるのに操作が要る人（特別なカードは任意なので含めない）
    actors() {
        switch (this.phase) {
            case 'end': return [];
            case 'discard': return this.overLimit();
            case 'swim': return this.swimQueue.length ? [this.swimQueue[0]] : [];
            default: return [this.current];
        }
    }

    // そのマスのとなりのタイル（diagonal なら斜めも）。沈んだタイルも含む
    neighborTiles(tile, diagonal = false) {
        const cell = this.cellOf[tile];
        const dirs = diagonal ? [...ORTHO, ...DIAG] : ORTHO;
        return dirs.map(([dr, dc]) => this.tileAt[cellAt(rowOf(cell) + dr, colOf(cell) + dc)] ?? null)
            .filter(t => t !== null && t !== undefined);
    }

    // 移動できる場所（役割ごと）
    moveTargets(seat) {
        const p = this.players[seat];
        if (p.role === 'diver') return this.diveTargets(p.tile);
        return this.neighborTiles(p.tile, p.role === 'explorer').filter(t => this.alive(t));
    }

    // ダイバー：浸水・沈んだ場所を続けて抜けて、沈んでいない場所へ
    diveTargets(from) {
        const seen = new Set([from]);
        const queue = [from];
        const targets = new Set();
        while (queue.length) {
            const at = queue.shift();
            for (const t of this.neighborTiles(at)) {
                if (seen.has(t)) continue;
                seen.add(t);
                if (this.alive(t)) targets.add(t);
                if (this.tiles[t] !== DRY) queue.push(t);
            }
        }
        targets.delete(from);
        return [...targets];
    }

    // 補強できる場所（自分の場所と、となり。探検家は斜めも）
    shoreTargets(seat) {
        const p = this.players[seat];
        return [p.tile, ...this.neighborTiles(p.tile, p.role === 'explorer')].filter(t => this.tiles[t] === FLOODED);
    }

    // 航海士が、ほかの駒を動かせる場所（上下左右に2マスまで）
    navigateTargets(pawn) {
        const from = this.players[pawn].tile;
        const one = this.neighborTiles(from).filter(t => this.alive(t));
        const set = new Set(one);
        one.forEach(t => this.neighborTiles(t).filter(u => this.alive(u)).forEach(u => set.add(u)));
        set.delete(from);
        return [...set];
    }

    // 沈んだ場所から泳いで逃げる先
    swimTargets(seat) {
        const p = this.players[seat];
        const alive = TILES.map(t => t.id).filter(t => t !== p.tile && this.alive(t));
        if (p.role === 'pilot') return alive;
        if (p.role === 'diver') {
            // いちばん近い場所（マスの上下左右の歩数）
            const cell = this.cellOf[p.tile];
            const dist = (t) => Math.abs(rowOf(this.cellOf[t]) - rowOf(cell)) + Math.abs(colOf(this.cellOf[t]) - colOf(cell));
            const best = Math.min(...alive.map(dist));
            return alive.filter(t => dist(t) === best);
        }
        return this.neighborTiles(p.tile, p.role === 'explorer').filter(t => this.alive(t));
    }

    // 宝を手に入れられるか（神殿にいて、同じ宝のカードが4枚）。手に入れられる宝の番号か null
    capturable(seat) {
        const p = this.players[seat];
        const k = TILES[p.tile].treasure;
        if (k === null || this.captured[k] || !this.alive(p.tile)) return null;
        return p.hand.filter(c => c === TREASURE_KEYS[k]).length >= 4 ? k : null;
    }

    // カードを渡せる相手
    giveTargets(seat) {
        const p = this.players[seat];
        return this.players.filter(q => q.id !== seat && (p.role === 'messenger' || q.tile === p.tile)).map(q => q.id);
    }

    // 脱出できるか（宝が4つ・全員が発着場）
    canLiftoff() {
        return this.captured.every(Boolean) && this.alive(FOOLS) && this.players.every(p => p.tile === FOOLS);
    }

    // 特別なカードを使える段階か
    specialWindow() {
        return !['end', 'swim'].includes(this.phase);
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
    commandError(seat, command) {
        const type = command.type;
        const me = this.players[seat];
        if (SPECIAL_TYPES.includes(type)) {
            if (!this.specialWindow()) return '今は特別なカードを使えません';
            const card = type === 'sand' ? 'sand' : 'heli';
            if (!me.hand.includes(card)) return `${cardName(card)}のカードがありません`;
            if (type === 'liftoff') return this.canLiftoff() ? null : '宝が4つそろい、全員が発着場にいるときだけ脱出できます';
            if (type === 'sand') return isTile(command.tile) && this.tiles[command.tile] === FLOODED ? null : '浸水している場所を選んでください';
            const pawns = command.pawns;
            if (!Array.isArray(pawns) || !pawns.length || new Set(pawns).size !== pawns.length
                || !pawns.every(s => isInt(s) && this.players[s])) return '運ぶ駒が正しくありません';
            const from = this.players[pawns[0]].tile;
            if (!pawns.every(s => this.players[s].tile === from)) return '同じ場所にいる駒だけを運べます';
            if (!this.alive(command.to) || command.to === from) return '運べる場所ではありません';
            return null;
        }
        if (type === 'discard') {
            if (this.phase !== 'discard') return '今は捨てる段階ではありません';
            if (!this.overLimit().includes(seat)) return `手札は${HAND_LIMIT}枚以内です`;
            return typeof command.card === 'string' && me.hand.includes(command.card) ? null : 'そのカードは持っていません';
        }
        if (type === 'swim') {
            if (this.phase !== 'swim' || this.swimQueue[0] !== seat) return '今は泳ぐ番ではありません';
            return this.swimTargets(seat).includes(command.to) ? null : 'そこへは泳げません';
        }
        if (seat !== this.current) return 'あなたの手番ではありません';
        if (type === 'draw') return this.phase === 'draw' ? null : '今はカードを引けません';
        if (type === 'flood') return this.phase === 'flood' ? null : '今は浸水に進めません';
        if (this.phase !== 'actions') return '今はアクションを行えません';
        if (type === 'pass') return null;
        return this.actionError(seat, command);
    }

    actionError(seat, command) {
        const me = this.players[seat];
        switch (command.type) {
            case 'move':
                return this.moveTargets(seat).includes(command.to) ? null : 'そこへは移動できません';
            case 'fly':
                if (me.role !== 'pilot') return 'パイロットだけが飛べます';
                if (this.pilotUsed) return '飛べるのは手番に1回です';
                return this.alive(command.to) && command.to !== me.tile ? null : 'そこへは飛べません';
            case 'shore': {
                const targets = this.shoreTargets(seat);
                if (!targets.includes(command.tile)) return '補強できる場所ではありません';
                if (command.tile2 === undefined) return null;
                if (me.role !== 'engineer') return '2か所を補強できるのは技師だけです';
                return targets.includes(command.tile2) && command.tile2 !== command.tile ? null : '2か所目を補強できません';
            }
            case 'give':
                if (!isInt(command.to) || !this.giveTargets(seat).includes(command.to)) return '同じ場所にいる仲間にしか渡せません';
                return isTreasureCard(command.card) && me.hand.includes(command.card) ? null : '渡せるのは宝のカードだけです';
            case 'capture':
                return this.capturable(seat) !== null ? null : '神殿で、同じ宝のカードが4枚要ります';
            case 'navigate':
                if (me.role !== 'navigator') return '航海士だけがほかの駒を動かせます';
                if (!isInt(command.pawn) || !this.players[command.pawn] || command.pawn === seat) return '動かす駒が正しくありません';
                return this.navigateTargets(command.pawn).includes(command.to) ? null : 'そこへは動かせません';
        }
        return '操作が正しくありません';
    }

    execute(seat, command) {
        const me = this.players[seat];
        const name = this.nameOf(seat);
        switch (command.type) {
            case 'move':
                me.tile = command.to;
                this.log(`${name}：${TILES[command.to].name}へ移動`);
                return this.spendAction();
            case 'fly':
                me.tile = command.to;
                this.pilotUsed = true;
                this.log(`${name}：${TILES[command.to].name}へ飛んだ`);
                return this.spendAction();
            case 'shore':
                [command.tile, command.tile2].filter(t => t !== undefined).forEach(t => { this.tiles[t] = DRY; });
                this.log(`${name}：${[command.tile, command.tile2].filter(t => t !== undefined).map(t => TILES[t].name).join('と')}を補強`);
                this.emit({ type: 'shore', tiles: [command.tile, command.tile2].filter(t => t !== undefined) });
                return this.spendAction();
            case 'give': {
                me.hand.splice(me.hand.indexOf(command.card), 1);
                this.players[command.to].hand.push(command.card);
                this.log(`${name}：${cardName(command.card)}を${this.nameOf(command.to)}に渡した`);
                return this.spendAction();
            }
            case 'capture': {
                const k = this.capturable(seat);
                for (let i = 0; i < 4; i++) me.hand.splice(me.hand.indexOf(TREASURE_KEYS[k]), 1);
                this.treasureDiscard.push(...Array(4).fill(TREASURE_KEYS[k]));
                this.captured[k] = true;
                this.log(`${name}：${TREASURES[k].name}を手に入れた！`, { head: true });
                this.emit({ type: 'capture', treasure: k, seat });
                return this.spendAction();
            }
            case 'navigate':
                this.players[command.pawn].tile = command.to;
                this.log(`${name}：${this.nameOf(command.pawn)}を${TILES[command.to].name}へ動かした`);
                return this.spendAction();
            case 'pass':
                this.log(`${name}：アクションを終えた`);
                this.phase = 'draw';
                return;
            case 'draw': return this.drawTreasure();
            case 'flood': return this.floodStep();
            case 'discard':
                me.hand.splice(me.hand.indexOf(command.card), 1);
                this.treasureDiscard.push(command.card);
                this.log(`${name}：${cardName(command.card)}を捨てた`);
                return this.settleDiscard();
            case 'swim':
                me.tile = command.to;
                this.swimQueue.shift();
                this.log(`${name}：${TILES[command.to].name}へ泳いで逃げた`);
                return this.afterSwim();
            case 'heli': {
                this.useCard(me, 'heli');
                command.pawns.forEach(s => { this.players[s].tile = command.to; });
                this.log(`${name}：ヘリで${command.pawns.map(s => this.nameOf(s)).join('・')}を${TILES[command.to].name}へ運んだ`);
                this.emit({ type: 'heli', pawns: [...command.pawns], to: command.to });
                return this.settleDiscard();
            }
            case 'sand':
                this.useCard(me, 'sand');
                this.tiles[command.tile] = DRY;
                this.log(`${name}：土のうで${TILES[command.tile].name}を補強`);
                this.emit({ type: 'shore', tiles: [command.tile] });
                return this.settleDiscard();
            case 'liftoff':
                this.useCard(me, 'heli');
                this.log(`${name}：ヘリで全員が島から脱出した！`, { head: true });
                return this.finish(true, 'won');
        }
    }

    useCard(p, card) {
        p.hand.splice(p.hand.indexOf(card), 1);
        this.treasureDiscard.push(card);
    }

    spendAction() {
        this.actionsLeft--;
        if (this.overLimit().length) {
            this.resume = 'actions';
            this.phase = 'discard';
            return;
        }
        this.afterActions();
    }

    afterActions() {
        this.phase = this.actionsLeft > 0 ? 'actions' : 'draw';
    }

    // 捨てる段階で、全員が上限以内になったら元の段階へ
    settleDiscard() {
        if (this.phase !== 'discard' || this.overLimit().length) return;
        const resume = this.resume;
        this.resume = null;
        if (resume === 'flood') this.startFlood();
        else this.afterActions();
    }

    drawTreasure() {
        const p = this.players[this.current];
        this.drawn = [];
        this.flooded = [];
        for (let i = 0; i < 2 && !this.result; i++) {
            if (!this.treasureDeck.length) {
                this.treasureDeck = shuffle(this.treasureDiscard, this.random);
                this.treasureDiscard = [];
                this.log('宝のカードの山を切り直した');
            }
            const card = this.treasureDeck.shift();
            this.drawn.push(card);
            if (card === 'rise') this.watersRise();
            else p.hand.push(card);
        }
        if (this.result) return;
        const got = this.drawn.filter(c => c !== 'rise');
        if (got.length) this.log(`${this.nameOf(p.id)}：${got.map(cardName).join('・')}を引いた`);
        this.emit({ type: 'draw', seat: p.id, cards: [...this.drawn] });
        if (this.overLimit().length) {
            this.resume = 'flood';
            this.phase = 'discard';
            return;
        }
        this.startFlood();
    }

    watersRise() {
        this.treasureDiscard.push('rise');
        this.water++;
        this.emit({ type: 'rise', water: this.water });
        if (this.water >= MAX_WATER) {
            this.log('水位上昇！ 水位が頂点に達した', { head: true });
            this.finish(false, 'water');
            return;
        }
        this.log(`水位上昇！ 水位${this.water}（浸水 ${this.floodRate()}枚）`, { head: true });
        // 浸水のカードの捨て札を切って、山の上に戻す
        if (this.floodDiscard.length) {
            this.floodTop += this.floodDiscard.length;
            this.floodDeck = [...shuffle(this.floodDiscard, this.random), ...this.floodDeck];
            this.floodDiscard = [];
        }
    }

    startFlood() {
        this.floodLeft = this.floodRate();
        this.phase = 'flood';
    }

    floodStep() {
        if (!this.floodDeck.length) {
            this.floodDeck = shuffle(this.floodDiscard, this.random);
            this.floodDiscard = [];
            this.floodTop = 0;
            this.log('浸水のカードの山を切り直した');
        }
        const tile = this.floodDeck.shift();
        if (this.floodTop > 0) this.floodTop--;
        this.floodLeft--;
        this.flooded.push(tile);
        if (this.tiles[tile] === DRY) {
            this.tiles[tile] = FLOODED;
            this.floodDiscard.push(tile);
            this.log(`${TILES[tile].name}が浸水した`);
            this.emit({ type: 'flood', tile });
        } else {
            this.sink(tile);
            if (this.result) return;
        }
        if (this.swimQueue.length) {
            this.phase = 'swim';
            return;
        }
        this.afterFloodCard();
    }

    sink(tile) {
        this.tiles[tile] = SUNK;
        this.floodRemoved.push(tile);
        this.log(`${TILES[tile].name}が沈んだ！`, { head: true });
        this.emit({ type: 'sink', tile });
        if (tile === FOOLS) return this.finish(false, 'fools');
        const k = TILES[tile].treasure;
        if (k !== null && !this.captured[k] && TEMPLES[k].every(t => this.tiles[t] === SUNK)) return this.finish(false, 'temple');
        // 駒を泳がせる（手番の人から順に）。逃げ先が1つならその場で動かす
        const order = this.players.map((_, i) => (this.current + i) % this.players.length);
        for (const seat of order) {
            if (this.players[seat].tile !== tile) continue;
            const targets = this.swimTargets(seat);
            if (!targets.length) {
                this.log(`${this.nameOf(seat)}は逃げられなかった`, { head: true });
                return this.finish(false, 'drown');
            }
            if (targets.length === 1) {
                this.players[seat].tile = targets[0];
                this.log(`${this.nameOf(seat)}：${TILES[targets[0]].name}へ泳いで逃げた`);
            } else {
                this.swimQueue.push(seat);
            }
        }
    }

    afterSwim() {
        if (this.swimQueue.length) return;
        this.afterFloodCard();
    }

    afterFloodCard() {
        if (this.floodLeft > 0) {
            this.phase = 'flood';
            return;
        }
        this.nextTurn();
    }

    nextTurn() {
        this.current = (this.current + 1) % this.players.length;
        this.turnNo++;
        this.phase = 'actions';
        this.actionsLeft = ACTIONS_PER_TURN;
        this.pilotUsed = false;
        this.log(`${this.nameOf(this.current)}の番`, { head: true });
        this.emit({ type: 'turn', seat: this.current });
    }

    finish(won, reason) {
        this.phase = 'end';
        this.swimQueue = [];
        this.result = { won, reason };
        this.log(won ? `勝利！ ${END_REASONS[reason]}` : `敗北…… ${END_REASONS[reason]}`, { head: true });
        this.emit({ type: 'end', won, reason });
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
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

    // CPU が手を試すための写し（記録・ログは持たない。アクションの判定と実行だけに使う。山札は引かない）
    simClone() {
        const g = Object.create(Game.prototype);
        g.options = this.options;
        g.cellOf = this.cellOf;
        g.tileAt = this.tileAt;
        g.tiles = [...this.tiles];
        g.captured = [...this.captured];
        g.water = this.water;
        g.players = this.players.map(p => ({ ...p, hand: [...p.hand] }));
        g.treasureDeck = this.treasureDeck;
        g.treasureDiscard = [...this.treasureDiscard];
        g.floodDeck = this.floodDeck;
        g.floodDiscard = this.floodDiscard;
        g.floodRemoved = this.floodRemoved;
        g.floodTop = this.floodTop;
        g.current = this.current;
        g.turnNo = this.turnNo;
        g.phase = this.phase;
        g.actionsLeft = this.actionsLeft;
        g.pilotUsed = this.pilotUsed;
        g.floodLeft = this.floodLeft;
        g.swimQueue = [...this.swimQueue];
        g.resume = this.resume;
        g.result = this.result;
        g.sim = true;
        g.commands = { push() {} };
        g.log = () => {};
        g.emit = () => {};
        return g;
    }
}

export { isSpecialCard };
