/**
 * カスカディアの進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山と袋の順はシードから決まる）
 *
 * ルール（基本ゲーム。資料と、資料で分からない点の決め方は README に書く）
 * - 地形タイル85枚から、人数×20＋3枚を山にする（1人は 2人と同じ43枚）。各自、最初のタイル（3枚の三角形）を1組持つ
 * - 場に、タイルと動物トークンの組を4つ並べる。トークンが4つとも同じ動物なら、自動で4つとも流し直す（そろわなくなるまで）
 * - 手番：
 *   1. 場のトークンが3つ同じ動物なら、その3つを1回だけ流し直してよい
 *   2. 自然トークンを1つ使うごとに、好きなトークンを好きな数だけ流し直してよい（何度でも）
 *   3. 組を1つ取る。自然トークンを1つ使えば、タイルとトークンを別々の組から取れる
 *   4. タイルを自分の地のとなりに、好きな向きで置く。トークンは、その動物の印があり、まだトークンのないタイルに置く（取ったタイルでなくてよい）。置かずに袋に戻してもよい
 *   5. キーストーン（1地形のタイル）に動物を置いたら、自然トークンを1つ得る
 *   6. 取った分を、山と袋から補う。山が空で補えなければ、ゲームが終わる（各自20手番）
 * - 1人用：手番のあと、補う前に、山からいちばん遠い（右端の）タイルとトークンを捨てて（ゲームから除く）、残りを右へ寄せる。各地形のつながりが7以上なら2点
 * - 得点：動物の得点カード（各動物 A〜D の1枚）＋地形ごとの最大のつながりのタイル数＋最大のつながりのボーナス＋残った自然トークン
 * - 同点なら、残った自然トークンが多い人。それでも同じなら勝ちを分ける
 */

import { createRandom, shuffle } from './random.js';
import { TILES, STARTERS, ANIMALS, HABITATS, tilesFor } from './tiles.js';
import { key, parseKey, neighbors } from './hex.js';
import { scoreGame, CARD_IDS } from './scoring.js';

export const TURNS = 20;
export const SLOTS = 4;
const MAX_LOGS = 400;
const MAX_EVENTS = 80;
const MAX_AUTO_WIPES = 30; // 4つ同じの流し直しを続ける上限（袋に1種類しか残っていないときに止まらないように）

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    replace3: [],
    wipe: ['slots'],
    place: ['tile', 'token', 'q', 'r', 'rot', 'at']
};

export const DEFAULT_CARDS = Object.freeze({ bear: 'A', elk: 'A', salmon: 'A', hawk: 'A', fox: 'A' });

// 得点カードの組を正しくする（足りないものは A）
export function normalizeCards(cards) {
    const out = {};
    ANIMALS.forEach(a => { out[a] = CARD_IDS.includes(cards?.[a]) ? cards[a] : 'A'; });
    return out;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer, cards }
    constructor(players, options = {}) {
        const n = players.length;
        if (n < 1 || n > 4) throw new Error('人数は1〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * n);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn, cards: normalizeCards(options.cards) };
        this.cards = this.options.cards;
        this.solo = n === 1;
        // 山：85枚を混ぜて、人数分だけ使う
        this.stack = shuffle(TILES.filter(t => !t.starter).map(t => t.id), this.random).slice(0, tilesFor(n));
        // 袋：各動物20個
        this.bag = ANIMALS.flatMap(a => Array(20).fill(a));
        // 最初のタイル：5組を混ぜて配る
        const starters = shuffle(STARTERS.map((_, i) => i), this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            starter: starters[id], env: {}, nature: 0, turns: 0
        }));
        this.players.forEach(p => {
            STARTERS[p.starter].forEach(({ tile, q, r, rot }) => { p.env[key(q, r)] = { tile, rot, token: null }; });
        });
        this.display = { tiles: [], tokens: [] };
        for (let i = 0; i < SLOTS; i++) {
            this.display.tiles.push(this.stack.shift());
            this.display.tokens.push(this.draw());
        }
        this.current = this.options.startPlayer;
        this.phase = 'turn'; // turn：手番 / end
        this.replaced3 = false; // この手番に、3つ同じの流し直しを使ったか
        this.turnNumber = 1;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.result = null;
        this.autoWipe();
        this.log(this.solo ? '1人用で始めます' : `${this.players[this.current].name}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    // 袋から1つ（袋の中から乱数で選ぶ）。空なら null
    draw() {
        if (!this.bag.length) return null;
        const i = Math.floor(this.random() * this.bag.length);
        return this.bag.splice(i, 1)[0];
    }

    // 場の slots のトークンを流し直す。新しいトークンを引いてから、流したものを袋に戻す
    wipeSlots(slots) {
        const removed = slots.map(i => this.display.tokens[i]).filter(Boolean);
        slots.forEach(i => { this.display.tokens[i] = this.draw(); });
        this.bag.push(...removed);
        // 袋が空で引けなかった枠は、戻したトークンから引き直す
        slots.forEach(i => { if (!this.display.tokens[i]) this.display.tokens[i] = this.draw(); });
    }

    // 場のトークンが4つとも同じ動物なら、そろわなくなるまで流し直す
    autoWipe() {
        for (let k = 0; k < MAX_AUTO_WIPES; k++) {
            const tokens = this.display.tokens;
            if (tokens.some(t => !t) || !tokens.every(t => t === tokens[0])) return;
            this.wipeSlots([0, 1, 2, 3]);
            this.emit({ type: 'wipe', slots: [0, 1, 2, 3], auto: true });
            this.log('トークンが4つそろったので、流し直しました');
        }
    }

    // 3つ同じ動物の枠（なければ null）
    tripleSlots() {
        const tokens = this.display.tokens;
        for (const a of ANIMALS) {
            const slots = tokens.map((t, i) => (t === a ? i : -1)).filter(i => i >= 0);
            if (slots.length === 3) return slots;
        }
        return null;
    }

    canReplace3() {
        return this.phase === 'turn' && !this.replaced3 && !!this.tripleSlots();
    }

    // 自分の地のタイル（key → { tile, rot, token }）
    envOf(seat) {
        return this.players[seat].env;
    }

    // タイルを置ける空きマスか（空いていて、自分のタイルのとなり）
    canPlaceTileAt(seat, q, r) {
        const env = this.envOf(seat);
        if (env[key(q, r)]) return false;
        return neighbors(q, r).some(([x, y]) => env[key(x, y)]);
    }

    // タイルを置ける空きマスの一覧
    openSpots(seat) {
        const env = this.envOf(seat);
        const spots = new Map();
        Object.keys(env).forEach(k => {
            const [q, r] = parseKey(k);
            neighbors(q, r).forEach(([x, y]) => {
                const nk = key(x, y);
                if (!env[nk]) spots.set(nk, [x, y]);
            });
        });
        return [...spots.values()];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { replace3: this.replace3, wipe: this.wipe, place: this.place }[command.type];
        if (!handler || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        const done = handler.call(this, playerId, command);
        if (!done) return false;
        // 記録するのは決まった項目だけ（端末から余計な項目が届いても残さない）
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => {
            if (command[k] !== undefined) recorded[k] = structuredClone(command[k]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 流し直し ----

    replace3(seat) {
        if (this.replaced3) return this.fail('この手番は、もう流し直しました');
        const slots = this.tripleSlots();
        if (!slots) return this.fail('3つ同じ動物のトークンがありません');
        this.replaced3 = true;
        const animal = this.display.tokens[slots[0]];
        this.wipeSlots(slots);
        this.emit({ type: 'wipe', seat, slots });
        this.log(`${this.players[seat].name}：${animalName(animal)}3つを流し直し`);
        this.autoWipe();
        return true;
    }

    wipe(seat, { slots }) {
        const p = this.players[seat];
        if (p.nature < 1) return this.fail('自然トークンがありません');
        if (!Array.isArray(slots) || !slots.length || slots.length > SLOTS) return this.fail('流し直すトークンを選んでください');
        if (!slots.every(i => Number.isInteger(i) && i >= 0 && i < SLOTS) || new Set(slots).size !== slots.length) {
            return this.fail('流し直すトークンを選んでください');
        }
        p.nature -= 1;
        const sorted = [...slots].sort((a, b) => a - b);
        this.wipeSlots(sorted);
        this.emit({ type: 'wipe', seat, slots: sorted, nature: true });
        this.log(`${p.name}：自然トークンでトークン${sorted.length}つを流し直し`);
        this.autoWipe();
        return true;
    }

    // ---- 取って置く ----

    // tile・token：場の枠。q, r, rot：タイルを置く場所と向き。at：トークンを置くタイルの [q, r]（null なら袋に戻す）
    place(seat, { tile: ti, token: wi, q, r, rot, at }) {
        const p = this.players[seat];
        if (![ti, wi].every(i => Number.isInteger(i) && i >= 0 && i < SLOTS)) return this.fail('組を選んでください');
        const tileId = this.display.tiles[ti];
        const animal = this.display.tokens[wi];
        if (tileId == null || !animal) return this.fail('その組はありません');
        const split = ti !== wi;
        if (split && p.nature < 1) return this.fail('別々の組から取るには、自然トークンが要ります');
        if (!Number.isInteger(q) || !Number.isInteger(r) || !this.canPlaceTileAt(seat, q, r)) return this.fail('そこには置けません');
        if (!Number.isInteger(rot) || rot < 0 || rot > 5) return this.fail('向きが正しくありません');
        const tile = TILES[tileId];
        let target = null;
        if (at !== null && at !== undefined) {
            if (!Array.isArray(at) || at.length !== 2 || !at.every(Number.isInteger)) return this.fail('トークンを置く場所が正しくありません');
            const atKey = key(at[0], at[1]);
            const isNew = at[0] === q && at[1] === r;
            const spot = isNew ? { tile: tileId, token: null } : p.env[atKey];
            if (!spot) return this.fail('トークンは自分のタイルに置いてください');
            if (spot.token) return this.fail('そのタイルには、もうトークンがあります');
            if (!TILES[spot.tile].wildlife.includes(animal)) return this.fail(`そのタイルには${animalName(animal)}を置けません`);
            target = atKey;
        }
        // ここから状態を変える
        if (split) p.nature -= 1;
        const k = key(q, r);
        p.env[k] = { tile: tileId, rot: tile.habitats.length === 1 ? 0 : rot, token: null };
        let gained = false;
        if (target) {
            p.env[target].token = animal;
            if (TILES[p.env[target].tile].keystone) {
                p.nature += 1;
                gained = true;
            }
        } else {
            this.bag.push(animal);
        }
        p.turns += 1;
        this.display.tiles[ti] = null;
        this.display.tokens[wi] = null;
        this.emit({ type: 'place', seat, slotTile: ti, slotToken: wi, q, r, tile: tileId, animal, at: target ? parseKey(target) : null, nature: gained });
        const where = target ? `${animalName(animal)}を置く` : `${animalName(animal)}は袋へ`;
        this.log(`${p.name}：${habitatNames(tile)}のタイル・${where}${split ? '（自然トークンで別々に）' : ''}${gained ? '・自然トークン+1' : ''}`);
        this.endTurn(seat);
        return true;
    }

    endTurn(seat) {
        // 1人用は、補う前に、山からいちばん遠いタイルとトークンを捨てる
        if (this.solo) this.soloDiscard();
        // 空いた枠を山と袋から補う。山が空で補えなければ終わり
        const empty = this.display.tiles.map((t, i) => (t == null ? i : -1)).filter(i => i >= 0);
        if (this.stack.length < empty.length) {
            this.finish();
            return;
        }
        this.compact();
        this.display.tiles = this.display.tiles.map(t => (t == null ? this.stack.shift() : t));
        this.display.tokens = this.display.tokens.map(t => (t == null ? this.draw() : t));
        this.autoWipe();
        const n = this.players.length;
        this.current = (seat + 1) % n;
        this.replaced3 = false;
        this.turnNumber += 1;
        this.emit({ type: 'turn', seat: this.current });
    }

    // 1人用：残ったタイルとトークンのうち、山からいちばん遠いもの（右端）を捨てる
    soloDiscard() {
        const ti = this.display.tiles.findLastIndex(t => t != null);
        const wi = this.display.tokens.findLastIndex(t => t != null);
        if (ti >= 0) this.display.tiles[ti] = null;
        if (wi >= 0) this.display.tokens[wi] = null; // 捨てたトークンはゲームから除く
    }

    // 1人用：残りを山から遠い側（右）へ寄せ、空いた左から補う
    compact() {
        if (!this.solo) return;
        const right = (list) => {
            const kept = list.filter(x => x != null);
            return [...Array(list.length - kept.length).fill(null), ...kept];
        };
        this.display.tiles = right(this.display.tiles);
        this.display.tokens = right(this.display.tokens);
    }

    finish() {
        this.phase = 'end';
        this.result = scoreGame(this.players.map(p => p.env), this.cards, this.players.map(p => p.nature));
        const totals = this.result.players.map(s => s.total);
        const best = Math.max(...totals);
        let winners = this.players.filter((_, i) => totals[i] === best).map(p => p.id);
        if (winners.length > 1) {
            const most = Math.max(...winners.map(i => this.players[i].nature));
            winners = winners.filter(i => this.players[i].nature === most);
        }
        this.result.winners = winners;
        this.emit({ type: 'end', winners: [...winners] });
        if (this.solo) this.log(`終わり：${totals[0]}点`);
        else this.log(`${winners.map(i => this.players[i].name).join('と')}の勝ち（${best}点）`);
    }

    get winners() {
        return this.result?.winners ?? [];
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
            options: structuredClone(this.options),
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

const ANIMAL_NAMES = { bear: 'クマ', elk: 'ヘラジカ', salmon: 'サケ', hawk: 'タカ', fox: 'キツネ' };
const HABITAT_NAMES = { mountain: '山', forest: '森', prairie: '草原', wetland: '湿地', river: '川' };
export const animalName = (a) => ANIMAL_NAMES[a] ?? a;
export const habitatNames = (tile) => tile.habitats.map(h => HABITAT_NAMES[h]).join('と');
export { HABITATS };
