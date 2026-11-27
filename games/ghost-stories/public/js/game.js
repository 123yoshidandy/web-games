/**
 * ゴーストストーリーズのルール（DOM に依存しない。ブラウザ・サーバー・テストで同じものを動かす）
 *
 * 4人の僧（赤・黄・緑・青）が、3×3 の村を幽霊から守る協力ゲーム。人が受け持たない僧は CPU が動かす
 * 手番は2つの段階
 *   陰：手番の僧のボードの幽霊が動く（憑き手が進む・呪い・呼び寄せ・気を奪う）→ ボードが埋まっていれば気を1つ失う → 幽霊が1体来る
 *   陽：となりのタイルへ動いてよい → 村人の力を借りる・除霊する・何もしない、のどれか1つ
 * 勝ち：山の底の近くにいる魔王の化身を祓う。負け：呪われたタイルが3枚・僧が全員倒れる・魔王が残ったまま山が尽きる
 *
 * 操作はすべて applyCommand(seat, command) に通して記録し、Game.replay で同じ局面を作り直せる
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）
 */

import { createRandom, createSeed, shuffle } from './random.js';
import {
    COLOR_NAMES, BLACK, WHITE, MONKS, MAX_QI, HAUNT_LIMIT, BASE_DICE, BUDDHAS, POWERS, TILES, LEVELS,
    GHOSTS, INCARNATIONS, REGULAR_GHOSTS, LINES, SLOTS, FACING, CENTER, boardOf, ghostOf, tileDistance
} from './data.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;

// 端末から受け付ける操作の種類と、記録する項目
export const COMMAND_FIELDS = {
    place: ['slot'],
    move: ['to'],
    help: ['color', 'bonus', 'slot', 'monk', 'to', 'tile'],
    exorcise: [],
    assign: ['targets'],
    buddha: ['slot'],
    mantra: ['slot'],
    pass: []
};

const CPU_NAMES = ['紅蓮', '金剛', '翠雲', '蒼海'];
// 呪いのダイスの面：0・1 何もなし、2 気を1つ失う、3 道の札をすべて失う、4 前のタイルが呪われる、5 幽霊が1体来る
export const CURSE_FACES = ['none', 'none', 'qi', 'tao', 'haunt', 'ghost'];
// 祓ったごほうびで呪いを解くときに、先に戻すタイル
const UNHAUNT_ORDER = ['watch', 'tea', 'herb', 'cemetery', 'temple', 'prayer', 'sorcerer', 'altar', 'pavilion'];

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// 除霊に要る札の数：need（色ごとの数）を、出目 dice と手持ちの札 tao でまかなえれば、使う札の数（色ごと）を返す。だめなら null
// 出目の同じ色を先に使い、白は札の足りない色に回し、余った白で札を節約する（黒の札を一番残す）
export function planExorcism(need, dice, tao) {
    const have = [0, 0, 0, 0, 0];
    let white = 0;
    dice.forEach(face => (face === WHITE ? white++ : have[face]++));
    const deficit = need.map((n, c) => Math.max(0, n - have[c]));
    const byWhite = deficit.map((d, c) => Math.max(0, d - tao[c]));
    let spare = white - byWhite.reduce((a, b) => a + b, 0);
    if (spare < 0) return null;
    const use = [0, 0, 0, 0, 0];
    [BLACK, 0, 1, 2, 3].forEach(c => {
        const extra = Math.min(spare, deficit[c] - byWhite[c]);
        byWhite[c] += extra;
        spare -= extra;
        use[c] = deficit[c] - byWhite[c];
    });
    return use;
}

export default class Game {
    // players：1〜4人の { name, isCPU }。4人に足りない分は CPU の僧で埋める
    // options：{ seed, level }
    constructor(players, options = {}) {
        const level = Object.hasOwn(LEVELS, options.level) ? options.level : 'normal';
        const seed = Number.isInteger(options.seed) ? options.seed >>> 0 : createSeed();
        this.options = { seed, level };
        this.random = createRandom(seed);
        const spec = LEVELS[level];
        const list = players.slice(0, MONKS);
        this.players = Array.from({ length: MONKS }, (_, i) => {
            const p = list[i];
            const tao = [0, 0, 0, 0, 0];
            tao[i] += spec.tao.own;
            tao[BLACK] += spec.tao.black;
            return {
                id: i,
                name: String(p?.name ?? CPU_NAMES[i]).slice(0, 16),
                isCPU: p ? Boolean(p.isCPU) : true,
                qi: spec.qi,
                tao,
                tile: CENTER,
                alive: true,
                buddhas: 0
            };
        });
        // 村のタイルの並び
        this.tiles = shuffle(TILES.map(t => t.key), this.random).map(key => ({ key, haunted: false }));
        // 幽霊の山（配列の最後が一番上）。魔王の化身は、下から spec.below 枚目の上に入れる
        const regular = shuffle([...REGULAR_GHOSTS], this.random).slice(0, spec.deck);
        const incKey = spec.incarnations[Math.floor(this.random() * spec.incarnations.length)];
        this.incarnation = GHOSTS.find(g => g.incarnation && g.key === incKey).id;
        this.deck = [...regular.slice(0, spec.below), this.incarnation, ...regular.slice(spec.below)];
        this.discard = [];
        this.slots = Array(SLOTS).fill(null);      // { card, haunter }（haunter：null なし・-1 札の上・0〜8 そのタイル）
        this.buddhaAt = Array(SLOTS).fill(false);
        this.temple = BUDDHAS;                     // 仏堂に残っている仏像
        this.prayer = null;                        // 祈りの輪で選んだ色
        this.mantraAt = null;                      // 真言の札を置いた置き場
        this.current = 0;
        this.turnNo = 1;
        this.phase = 'yin';
        this.moved = false;
        this.dice = null;                          // 除霊で振った出目
        this.lastRoll = null;                      // 最後に振ったダイス（画面の表示用）{ kind, faces, seat }
        this.queue = [];                           // 置く場所を決める幽霊
        this.queueThen = null;                     // 置き終えたら：'yang' 陽の段階へ・'end' 手番を終える
        this.result = null;
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.lastError = null;
        this.startTurn();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません: ${JSON.stringify(command)}（${game.lastError}）`);
        }
        return game;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: { ...this.options },
            commands: this.commands.map(c => ({ seat: c.seat, command: { ...c.command, ...(c.command.targets ? { targets: [...c.command.targets] } : {}) } }))
        };
    }

    isOver() {
        return this.result !== null;
    }

    // 操作を待っている席
    actors() {
        if (this.result) return [];
        return ['place', 'yang', 'exorcise'].includes(this.phase) ? [this.current] : [];
    }

    // ---- 調べる（状態を変えない） ----

    level() {
        return LEVELS[this.options.level];
    }

    hauntedCount() {
        return this.tiles.filter(t => t.haunted).length;
    }

    tileIndex(key) {
        return this.tiles.findIndex(t => t.key === key);
    }

    // そのタイルの村人の力を借りられるか（呪われていない）
    tileActive(key) {
        return !this.tiles[this.tileIndex(key)].haunted;
    }

    ghostAt(slot) {
        return this.slots[slot] ? ghostOf(this.slots[slot].card) : null;
    }

    // 僧の力が使えるか（生きていて、ボードに力を封じる幽霊がいない）
    powerActive(seat) {
        const p = this.players[seat];
        if (!p.alive) return false;
        for (let k = 0; k < 3; k++) {
            const g = this.ghostAt(seat * 3 + k);
            if (g?.arrive.includes('block')) return false;
        }
        return true;
    }

    hasPower(seat, key) {
        return POWERS[seat].key === key && this.powerActive(seat);
    }

    // 祈りの輪と真言を当てたあとの抵抗
    resistance(slot) {
        const g = this.ghostAt(slot);
        if (!g) return 0;
        let res = g.res;
        if (this.prayer === g.color && this.tileActive('prayer')) res--;
        if (this.mantraAt === slot) res--;
        return Math.max(1, res);
    }

    // 除霊で振るダイスの数
    diceCount(seat) {
        const captured = this.slots.filter(s => s && ghostOf(s.card).arrive.includes('capture')).length;
        return Math.max(1, BASE_DICE - captured) + (this.hasPower(seat, 'heaven') ? 1 : 0);
    }

    // そのタイルから除霊できる幽霊の置き場
    targetsFrom(tile) {
        return FACING[tile].filter(s => this.slots[s]);
    }

    // 幽霊を置ける場所：色の幽霊はその色のボード、黒は手番の僧のボード。埋まっていれば、どこかの空き
    placeOptions(id) {
        const g = ghostOf(id);
        const board = g.color === BLACK ? this.current : g.color;
        const own = [0, 1, 2].map(k => board * 3 + k).filter(s => !this.slots[s]);
        if (own.length > 0) return own;
        return Array.from({ length: SLOTS }, (_, s) => s).filter(s => !this.slots[s]);
    }

    // targets（置き場の一覧）を祓うのに要る、色ごとの数
    needOf(targets) {
        const need = [0, 0, 0, 0, 0];
        targets.forEach(s => { need[this.ghostAt(s).color] += this.resistance(s); });
        return need;
    }

    canMoveTo(seat, to) {
        const p = this.players[seat];
        return isInt(to, 0, 8) && (tileDistance(p.tile, to) <= 1 || this.hasPower(seat, 'peaks'));
    }

    // 村人の力を借りられるか。だめなら理由
    helpError(seat, c) {
        const p = this.players[seat];
        const key = this.tiles[p.tile].key;
        if (this.tiles[p.tile].haunted) return 'このタイルは呪われていて、力を借りられません';
        const color = (v) => isInt(v, 0, 4);
        if (c.bonus !== undefined && !color(c.bonus)) return '札の色を選んでください';
        switch (key) {
            case 'tea': return color(c.color) ? null : '札の色を選んでください';
            case 'herb': return null;
            case 'sorcerer':
                if (p.qi < 2) return '気が2つ以上ないと使えません';
                if (!isInt(c.slot, 0, SLOTS - 1) || !this.slots[c.slot]) return '祓う幽霊を選んでください';
                return this.ghostAt(c.slot).incarnation ? '魔王の化身は祓えません' : null;
            case 'prayer':
                if (!color(c.color)) return '色を選んでください';
                return c.color === this.prayer ? 'すでにその色です' : null;
            case 'temple': return this.temple > 0 ? null : '仏像が残っていません';
            case 'pavilion':
                if (!isInt(c.monk, 0, MONKS - 1) || !this.players[c.monk].alive) return '動かす僧を選んでください';
                if (!isInt(c.to, 0, 8) || c.to === this.players[c.monk].tile) return '行き先を選んでください';
                return null;
            case 'cemetery':
                return isInt(c.monk, 0, MONKS - 1) && !this.players[c.monk].alive ? null : '倒れた僧がいません';
            case 'altar': return this.deck.length > 0 ? null : '山が残っていません';
            case 'watch':
                return isInt(c.tile, 0, 8) && this.tiles[c.tile].haunted ? null : '呪われたタイルを選んでください';
            default: return '使えません';
        }
    }

    // 操作が通るか。だめなら理由（状態は変えない）
    check(seat, c) {
        if (this.result) return 'ゲームは終わっています';
        if (seat !== this.current || !this.actors().includes(seat)) return '今はあなたの番ではありません';
        const p = this.players[seat];
        const inYang = this.phase === 'yang';
        switch (c.type) {
            case 'place':
                if (this.phase !== 'place') return '今は幽霊を置く時ではありません';
                return this.placeOptions(this.queue[0]).includes(c.slot) ? null : 'そこには置けません';
            case 'move':
                if (!inYang || this.moved) return '今は動けません';
                return this.canMoveTo(seat, c.to) ? null : 'そこへは動けません';
            case 'help':
                return inYang ? this.helpError(seat, c) : '今は力を借りられません';
            case 'exorcise':
                if (!inYang) return '今は除霊できません';
                return this.targetsFrom(p.tile).length > 0 ? null : 'このタイルの前に幽霊がいません';
            case 'assign': {
                if (this.phase !== 'exorcise') return '今は除霊の結果を決める時ではありません';
                const ts = c.targets;
                if (!Array.isArray(ts) || ts.length > 2) return '祓う幽霊を選んでください';
                const facing = this.targetsFrom(p.tile);
                if (new Set(ts).size !== ts.length || !ts.every(s => facing.includes(s))) return 'その幽霊は祓えません';
                return planExorcism(this.needOf(ts), this.dice, p.tao) ? null : '出目と札が足りません';
            }
            case 'buddha':
                if (!inYang || p.buddhas <= 0) return '仏像を持っていません';
                if (!isInt(c.slot, 0, SLOTS - 1) || !FACING[p.tile].includes(c.slot)) return '自分のタイルに向いた場所に置いてください';
                return this.slots[c.slot] || this.buddhaAt[c.slot] ? 'その場所は空いていません' : null;
            case 'mantra':
                if (!inYang || !this.hasPower(seat, 'mantra')) return '真言は使えません';
                if (this.mantraAt !== null) return '真言の札はもう置いてあります';
                return isInt(c.slot, 0, SLOTS - 1) && this.slots[c.slot] ? null : '幽霊を選んでください';
            case 'pass':
                return inYang ? null : '今は終えられません';
            default:
                return 'その操作はできません';
        }
    }

    // ---- 操作 ----

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
            this.lastError = 'その操作はできません';
            return false;
        }
        // 記録する項目だけを写す
        const c = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] === undefined) return;
            c[key] = key === 'targets' && Array.isArray(command.targets) ? command.targets.slice(0, 4) : command[key];
        });
        if (!Number.isInteger(seat)) {
            this.lastError = 'その操作はできません';
            return false;
        }
        const error = this.check(seat, c);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.events = [];
        this.commands.push({ seat, command: c });
        this.execute(seat, c);
        return true;
    }

    execute(seat, c) {
        const p = this.players[seat];
        switch (c.type) {
            case 'place': {
                const id = this.queue.shift();
                this.placeGhost(id, c.slot);
                this.processQueue();
                break;
            }
            case 'move':
                this.moved = true;
                if (c.to !== p.tile) {
                    p.tile = c.to;
                    this.log(`${p.name}が${TILES.find(t => t.key === this.tiles[c.to].key).name}へ動いた`, seat);
                    this.event('move', { seat });
                }
                break;
            case 'help':
                this.help(seat, c);
                break;
            case 'exorcise':
                this.dice = this.roll(this.diceCount(seat));
                this.lastRoll = { kind: 'exorcise', faces: [...this.dice], seat };
                this.phase = 'exorcise';
                this.log(`${p.name}が除霊のダイスを振った：${this.dice.map(faceName).join('・')}`, seat);
                this.event('dice', { seat });
                break;
            case 'assign':
                this.assign(seat, c.targets);
                break;
            case 'buddha':
                p.buddhas--;
                this.buddhaAt[c.slot] = true;
                this.log(`${p.name}が仏像を置いた`, seat);
                this.event('place', { seat });
                break;
            case 'mantra':
                this.mantraAt = c.slot;
                this.log(`${p.name}が真言の札を${this.ghostAt(c.slot).name}に置いた`, seat);
                this.event('place', { seat });
                break;
            case 'pass':
                this.log(`${p.name}は何もしなかった`, seat);
                this.endTurn();
                break;
        }
    }

    help(seat, c) {
        const p = this.players[seat];
        const tile = this.tiles[p.tile];
        const name = TILES.find(t => t.key === tile.key).name;
        const pockets = this.hasPower(seat, 'pockets');
        const bonus = c.bonus ?? seat;
        switch (tile.key) {
            case 'tea':
                p.qi = Math.min(MAX_QI, p.qi + 1);
                p.tao[c.color]++;
                if (pockets) p.tao[bonus]++;
                this.log(`${p.name}が${name}で気を回復し、${COLOR_NAMES[c.color]}の札${pockets ? `と${COLOR_NAMES[bonus]}の札` : ''}を得た`, seat);
                this.event('gain', { seat });
                break;
            case 'herb': {
                const faces = this.roll(2);
                this.lastRoll = { kind: 'herb', faces: [...faces], seat };
                faces.forEach(f => { p.tao[f === WHITE ? seat : f]++; });
                if (pockets) p.tao[bonus]++;
                this.log(`${p.name}が${name}でダイスを振り（${faces.map(faceName).join('・')}）、札を得た`, seat);
                this.event('gain', { seat });
                break;
            }
            case 'sorcerer': {
                const g = this.ghostAt(c.slot);
                this.loseQi(p, 1, '呪術の代わり');
                this.removeGhost(c.slot);
                this.log(`${p.name}が${name}で${g.name}を祓った`, seat);
                this.event('exorcise', { seat });
                break;
            }
            case 'prayer':
                this.prayer = c.color;
                this.log(`${p.name}が${name}で${COLOR_NAMES[c.color]}を選んだ（${COLOR_NAMES[c.color]}の幽霊の抵抗が1下がる）`, seat);
                this.event('place', { seat });
                break;
            case 'temple':
                this.temple--;
                p.buddhas++;
                this.log(`${p.name}が${name}で仏像を受け取った`, seat);
                this.event('gain', { seat });
                break;
            case 'pavilion': {
                const m = this.players[c.monk];
                m.tile = c.to;
                this.log(`${p.name}が${name}で${m.name}を${TILES.find(t => t.key === this.tiles[c.to].key).name}へ動かした`, seat);
                this.event('place', { seat });
                break;
            }
            case 'cemetery': {
                const m = this.players[c.monk];
                m.alive = true;
                m.qi = 2;
                m.tile = p.tile;
                this.log(`${p.name}が${name}で${m.name}を呼び戻した`, seat);
                this.event('gain', { seat });
                break;
            }
            case 'altar': {
                const id = this.deck.pop();
                const g = ghostOf(id);
                if (g.incarnation) {
                    this.log(`${p.name}が${name}で山をめくると、${g.name}が現れた！`, seat);
                    this.event('arrive', { seat });
                    this.queue.push(id);
                    this.queueThen = 'end';
                    this.processQueue();
                    return;
                }
                this.discard.push(id);
                this.log(`${p.name}が${name}で山をめくり、${g.name}を祓った`, seat);
                this.event('exorcise', { seat });
                break;
            }
            case 'watch':
                this.tiles[c.tile].haunted = false;
                this.log(`${p.name}が${name}で${TILES.find(t => t.key === this.tiles[c.tile].key).name}の呪いを解いた`, seat);
                this.event('gain', { seat });
                break;
        }
        if (!this.result) this.endTurn();
    }

    assign(seat, targets) {
        const p = this.players[seat];
        const use = planExorcism(this.needOf(targets), this.dice, p.tao);
        use.forEach((n, color) => { p.tao[color] -= n; });
        this.dice = null;
        if (targets.length === 0) {
            this.log(`${p.name}の除霊はうまくいかなかった`, seat);
            this.event('fail', { seat });
        }
        for (const slot of targets) {
            const g = this.ghostAt(slot);
            this.log(`${p.name}が${g.name}を祓った`, seat);
            this.event('exorcise', { seat });
            this.removeGhost(slot);
            if (g.incarnation) {
                this.finish(true, 'wufeng');
                return;
            }
            this.reward(p, g, slot);
        }
        this.endTurn();
    }

    // 祓ったごほうび
    reward(p, g) {
        if (!p.alive) return;
        g.reward.forEach(r => {
            if (r === 'qi' && p.qi < MAX_QI) {
                p.qi++;
                this.log(`${p.name}が気を1つ得た`, p.id);
            } else if (r === 'tao') {
                p.tao[g.color]++;
                this.log(`${p.name}が${COLOR_NAMES[g.color]}の札を得た`, p.id);
            } else if (r === 'unhaunt') {
                const key = UNHAUNT_ORDER.find(k => this.tiles[this.tileIndex(k)].haunted);
                if (key) {
                    this.tiles[this.tileIndex(key)].haunted = false;
                    this.log(`${TILES.find(t => t.key === key).name}の呪いが解けた`, p.id);
                }
            }
        });
    }

    // ---- 手番の流れ ----

    startTurn() {
        if (this.result) return;
        const p = this.players[this.current];
        this.phase = 'yin';
        this.moved = false;
        this.dice = null;
        this.log(`― ${this.turnNo}手番：${p.name}${p.alive ? '' : '（倒れている）'} ―`, this.current, 'turn');
        // 陰：このボードの幽霊が動く
        for (let k = 0; k < 3 && !this.result; k++) {
            const slot = this.current * 3 + k;
            const s = this.slots[slot];
            if (!s) continue;
            const g = ghostOf(s.card);
            for (const effect of g.yin) {
                if (this.result || !this.slots[slot]) break;
                this.yinEffect(slot, effect);
            }
        }
        if (this.result) return;
        // ボードが埋まっていれば、気を1つ失う
        if (p.alive && [0, 1, 2].every(k => this.slots[this.current * 3 + k])) {
            this.loseQi(p, 1, 'ボードが幽霊で埋まっていた');
            if (this.result) return;
        }
        // 幽霊が1体来る
        const id = this.draw();
        if (id === null) return;
        this.queue.push(id);
        this.queueThen = 'yang';
        this.processQueue();
    }

    yinEffect(slot, effect) {
        const g = this.ghostAt(slot);
        const owner = this.players[this.current];
        if (effect === 'haunt') this.advanceHaunter(slot);
        else if (effect === 'curse') this.curse(slot);
        else if (effect === 'summon') {
            this.log(`${g.name}が仲間を呼んだ`, null, 'ghost');
            const id = this.draw();
            if (id !== null) this.queue.push(id);
        } else if (effect === 'drain') this.loseQi(owner, 1, `${g.name}に気を奪われた`);
    }

    // 憑き手：札の上なら、前の呪われていないタイルへ出る。タイルの上なら、そのタイルを呪って札へ戻る
    advanceHaunter(slot) {
        const s = this.slots[slot];
        if (s.haunter === null) return;
        const g = ghostOf(s.card);
        const line = LINES[slot];
        if (s.haunter === -1 || this.tiles[s.haunter].haunted) {
            const next = line.find(t => !this.tiles[t].haunted);
            if (next === undefined) {
                s.haunter = -1;
                return;
            }
            s.haunter = next;
            this.log(`${g.name}の憑き手が${tileName(this.tiles[next].key)}に迫った`, null, 'ghost');
            this.event('haunter', {});
            return;
        }
        const tile = s.haunter;
        s.haunter = -1;
        this.haunt(tile, `${g.name}の憑き手`);
    }

    haunt(tile, by) {
        const t = this.tiles[tile];
        if (t.haunted) return;
        t.haunted = true;
        this.log(`${by}が${tileName(t.key)}を呪った（呪われたタイル ${this.hauntedCount()}/${HAUNT_LIMIT}）`, null, 'bad');
        this.event('haunt', {});
        if (this.hauntedCount() >= HAUNT_LIMIT) this.finish(false, 'haunted');
    }

    // 呪いのダイス
    curse(slot) {
        const g = this.ghostAt(slot);
        const face = CURSE_FACES[Math.floor(this.random() * CURSE_FACES.length)];
        const p = this.players[this.current];
        this.lastRoll = { kind: 'curse', faces: [face], seat: this.current };
        this.event('curse', { face });
        const head = `${g.name}の呪いのダイス：`;
        if (face === 'none') this.log(`${head}何も起きなかった`, null, 'ghost');
        else if (face === 'qi') {
            this.log(`${head}気を失う`, null, 'ghost');
            this.loseQi(p, 1, '呪い');
        } else if (face === 'tao') {
            this.log(`${head}道の札を失う`, null, 'ghost');
            if (p.alive) p.tao = [0, 0, 0, 0, 0];
        } else if (face === 'haunt') {
            this.log(`${head}前のタイルが呪われる`, null, 'ghost');
            const tile = LINES[slot].find(t => !this.tiles[t].haunted);
            if (tile !== undefined) this.haunt(tile, g.name);
        } else {
            this.log(`${head}幽霊がもう1体来る`, null, 'ghost');
            const id = this.draw();
            if (id !== null) this.queue.push(id);
        }
    }

    // 山の一番上を引く。尽きていれば負け（魔王の化身が残っている）
    draw() {
        if (this.result) return null;
        if (this.deck.length === 0) {
            this.finish(false, 'deck');
            return null;
        }
        return this.deck.pop();
    }

    // 置く場所を決める幽霊を、順に置く。選べる場所が1つなら自動で置く
    processQueue() {
        while (this.queue.length > 0 && !this.result) {
            const id = this.queue[0];
            const options = this.placeOptions(id);
            if (options.length === 0) {
                // どこにも置けない：手番の僧が気を1つ失い、幽霊は山の底へ
                this.queue.shift();
                this.deck.unshift(id);
                this.log(`${ghostOf(id).name}の居場所がない`, null, 'ghost');
                this.loseQi(this.players[this.current], 1, 'ボードがすべて埋まっていた');
                continue;
            }
            if (options.length === 1) {
                this.queue.shift();
                this.placeGhost(id, options[0]);
                continue;
            }
            this.phase = 'place';
            return;
        }
        if (this.result) return;
        const then = this.queueThen;
        this.queueThen = null;
        if (then === 'yang') {
            if (this.players[this.current].alive) this.phase = 'yang';
            else this.endTurn();
        } else {
            this.endTurn();
        }
    }

    placeGhost(id, slot) {
        const g = ghostOf(id);
        if (this.buddhaAt[slot]) {
            this.buddhaAt[slot] = false;
            this.temple++;
            if (!g.incarnation) {
                this.discard.push(id);
                this.log(`${g.name}が来たが、仏像が祓った`, null, 'good');
                this.event('buddha', {});
                return;
            }
            this.log('魔王の化身が仏像を砕いた', null, 'bad');
        }
        this.slots[slot] = { card: id, haunter: g.arrive.includes('haunter') ? -1 : null };
        this.log(`${g.incarnation ? '魔王の化身' : '幽霊'}「${g.name}」が${this.players[boardOf(slot)].name}のボードに現れた`, null, g.incarnation ? 'bad' : 'ghost');
        this.event('arrive', { slot, incarnation: g.incarnation });
        for (const effect of g.arrive) {
            if (this.result || !this.slots[slot]) break;
            if (effect === 'summon') {
                this.log(`${g.name}が仲間を呼んだ`, null, 'ghost');
                const next = this.draw();
                if (next !== null) this.queue.push(next);
            } else if (effect === 'curse') this.curse(slot);
            else if (effect === 'drain') this.loseQi(this.players[this.current], 1, `${g.name}に気を奪われた`);
        }
    }

    removeGhost(slot) {
        const s = this.slots[slot];
        this.slots[slot] = null;
        if (this.mantraAt === slot) this.mantraAt = null;
        this.discard.push(s.card);
    }

    loseQi(p, n, why) {
        if (!p.alive) return;
        p.qi = Math.max(0, p.qi - n);
        this.log(`${p.name}が気を${n}つ失った（${why}）`, p.id, 'bad');
        this.event('qi', { seat: p.id });
        if (p.qi > 0) return;
        p.alive = false;
        p.tao = [0, 0, 0, 0, 0];
        this.temple += p.buddhas;
        p.buddhas = 0;
        if (POWERS[p.id].key === 'mantra') this.mantraAt = null;
        this.log(`${p.name}が倒れた`, p.id, 'bad');
        this.event('dead', { seat: p.id });
        if (this.players.every(m => !m.alive)) this.finish(false, 'dead');
    }

    endTurn() {
        if (this.result) return;
        this.current = (this.current + 1) % MONKS;
        this.turnNo++;
        this.startTurn();
    }

    finish(won, reason) {
        if (this.result) return;
        this.result = { won, reason };
        this.phase = 'over';
        this.queue = [];
        const text = { wufeng: '魔王の化身を祓い、村を守り抜いた！', haunted: `村のタイルが${HAUNT_LIMIT}枚呪われた`, dead: '僧が全員倒れた', deck: '魔王が残ったまま、幽霊の山が尽きた' }[reason];
        this.log(text, null, won ? 'good' : 'bad');
        this.event(won ? 'win' : 'lose', {});
    }

    roll(n) {
        return Array.from({ length: n }, () => Math.floor(this.random() * 6));
    }

    log(text, seat = null, kind = '') {
        this.logTotal++;
        this.logs.push({ n: this.logTotal, text, seat, kind });
        if (this.logs.length > 400) this.logs.shift();
    }

    event(type, data) {
        this.events.push({ type, ...data });
    }
}

export const FACE_NAMES = ['赤', '黄', '緑', '青', '黒', '白'];
export const faceName = (f) => FACE_NAMES[f];
export const tileName = (key) => TILES.find(t => t.key === key).name;
export { INCARNATIONS };
