/**
 * キャリコの進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（袋の順はシードから決まる）
 *
 * ルール（基本ゲーム。資料と、資料で分からない点の決め方は README に書く）
 * - パッチ108枚を袋に入れ、各自2枚を手札に、3枚を市場に出す。盤（縁の模様が違う4枚）を1人1枚
 * - 猫：ふつうの準備は、・の数（1・2・3）ごとに札を1枚ずつ選び、表か裏をでたらめに使う。はじめての準備は、ミリー・ティビット・ココナッツ
 *   6つの模様を、3匹に2つずつでたらめに割り当てる
 * - 目標タイル：ふつうの準備は、各自6種から4枚を配られ、3枚を選んで置き場に置く（全員が同時に選ぶ）。はじめての準備は ≠・AA-BB-CC・AAA-BBB
 * - 手番：1. 手札の2枚から1枚を、キルトの空きマスに置く。ボタンと猫が来たら取る 2. 市場の3枚から1枚を手札に取り、袋から補う
 * - 1人用：市場から取ったあと、山からいちばん遠いパッチを捨て、残りの1枚を遠い側へ寄せ、山の側から補う
 * - 全員のキルトが埋まったら終わり（各自22手番）
 * - 同点なら猫が多い人、それも同じならボタン（虹を含む）が多い人。それでも同じなら勝ちを分ける
 */

import { createRandom, shuffle } from './random.js';
import { TILES, BOARDS, GOAL_IDS, CATS, CAT_TILES, PATTERNS, BEGINNER_GOALS, BEGINNER_CATS, HAND_SIZE, MARKET_SIZE } from './data.js';
import { CELL_COUNT, OPEN_CELLS } from './board.js';
import { awardsFor, scorePlayer } from './scoring.js';

export const SETUPS = ['standard', 'beginner'];
const MAX_LOGS = 400;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { goals: ['pick'], place: ['hand', 'cell'], take: ['market'] };

const COLOR_NAMES = { yellow: '黄', pink: 'ピンク', purple: '紫', sky: '水色', green: '緑', navy: '紺' };
const PATTERN_NAMES = { stripes: 'しま', ferns: 'シダ', dots: '水玉', flowers: '花', quatrefoil: '四つ葉', vines: 'つる' };
export const colorName = (c) => COLOR_NAMES[c] ?? c;
export const patternName = (p) => PATTERN_NAMES[p] ?? p;
export const tileName = (id) => `${colorName(TILES[id].color)}の${patternName(TILES[id].pattern)}`;

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer, setup }
    constructor(players, options = {}) {
        const n = players.length;
        if (n < 1 || n > 4) throw new Error('人数は1〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const setup = SETUPS.includes(options.setup) ? options.setup : 'standard';
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * n);
        // CPU の迷いに使う値（ビューには入れない）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn, setup };
        this.solo = n === 1;
        this.bag = shuffle(TILES.map((_, i) => i), this.random);
        this.tileCount = this.bag.length;
        // 猫と、猫ごとの模様
        const sides = [1, 2, 3].map(d => {
            const tiles = CAT_TILES[d];
            const front = tiles[Math.floor(this.random() * tiles.length)];
            return this.random() < 0.5 ? front : CATS[front].back;
        });
        const catIds = setup === 'beginner' ? [...BEGINNER_CATS] : sides;
        const patterns = shuffle([...PATTERNS], this.random);
        this.cats = catIds.map((id, i) => ({ id, patterns: [patterns[2 * i], patterns[2 * i + 1]] }));
        // 盤と目標タイル
        const boards = shuffle(BOARDS.map((_, i) => i), this.random);
        this.players = players.map((p, id) => {
            const offered = shuffle([...GOAL_IDS], this.random).slice(0, 4);
            return {
                id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
                board: boards[id], quilt: new Array(CELL_COUNT).fill(null), hand: [],
                offered: setup === 'beginner' ? null : offered,
                goals: setup === 'beginner' ? [...BEGINNER_GOALS] : null,
                buttons: [], rainbow: false, cats: [], placed: 0
            };
        });
        this.players.forEach(p => { for (let k = 0; k < HAND_SIZE; k++) p.hand.push(this.bag.shift()); });
        this.market = Array.from({ length: MARKET_SIZE }, () => this.bag.shift());
        this.discarded = []; // 1人用で捨てたパッチ
        this.current = this.options.startPlayer;
        this.phase = setup === 'beginner' ? 'place' : 'goals'; // goals：目標を選ぶ / place：置く / take：取る / end
        this.turnNumber = 1;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.result = null;
        this.log(this.solo ? '1人用で始めます' : `${this.players[this.current].name}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        if (this.phase === 'end') return [];
        if (this.phase === 'goals') return this.players.filter(p => !p.goals).map(p => p.id);
        return [this.current];
    }

    // その模様を好む猫
    catFor(pattern) {
        return this.cats.find(c => c.patterns.includes(pattern)) ?? null;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { goals: { goals: this.chooseGoals }, place: { place: this.place }, take: { take: this.take } }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
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

    // ---- 目標タイルを選ぶ（pick：配られた4枚の番号を、置き場の順に3つ） ----

    chooseGoals(seat, { pick }) {
        const p = this.players[seat];
        if (!Array.isArray(pick) || pick.length !== 3 || !pick.every(i => Number.isInteger(i) && i >= 0 && i < 4) || new Set(pick).size !== 3) {
            return this.fail('目標タイルを3枚選んでください');
        }
        p.goals = pick.map(i => p.offered[i]);
        this.log(`${p.name}が目標タイルを選びました`);
        if (this.players.every(q => q.goals)) {
            this.phase = 'place';
            this.emit({ type: 'turn', seat: this.current });
        }
        return true;
    }

    // ---- 置く ----

    place(seat, { hand, cell }) {
        const p = this.players[seat];
        if (!Number.isInteger(hand) || hand < 0 || hand >= p.hand.length) return this.fail('手札のパッチを選んでください');
        if (!Number.isInteger(cell) || !OPEN_CELLS.includes(cell) || p.quilt[cell] != null) return this.fail('そこには置けません');
        const tileId = p.hand[hand];
        p.hand.splice(hand, 1);
        p.quilt[cell] = tileId;
        p.placed += 1;
        // ボタン（同じ色が3枚以上つながり、まだボタンのないまとまり）と猫（条件を満たし、まだ猫のいないまとまり）
        const award = awardsFor(p, this.cats, cell);
        const gained = [];
        if (award.button) {
            p.buttons.push({ color: award.button, cell });
            gained.push(`${colorName(award.button)}のボタン`);
        }
        if (award.rainbow) {
            p.rainbow = true;
            gained.push('虹のボタン');
        }
        if (award.cat) {
            p.cats.push({ cat: award.cat, cell });
            gained.push(CATS[award.cat].name);
        }
        this.emit({ type: 'place', seat, cell, tile: tileId, gained: [...gained] });
        this.log(`${p.name}：${tileName(tileId)}を置く${gained.length ? `・${gained.join('・')}` : ''}`);
        this.phase = 'take';
        return true;
    }

    // ---- 市場から取る ----

    take(seat, { market }) {
        const p = this.players[seat];
        if (!Number.isInteger(market) || market < 0 || market >= MARKET_SIZE || this.market[market] == null) return this.fail('市場のパッチを選んでください');
        const tileId = this.market[market];
        p.hand.push(tileId);
        this.market[market] = null;
        this.emit({ type: 'take', seat, market, tile: tileId });
        if (this.solo) {
            // 山からいちばん遠い（番号の大きい）残りを捨て、残りを遠い側へ寄せて、山の側から補う
            const far = this.market.findLastIndex(t => t != null);
            if (far >= 0) {
                this.discarded.push(this.market[far]);
                this.market[far] = null;
            }
            const kept = this.market.filter(t => t != null);
            this.market = [...Array(MARKET_SIZE - kept.length).fill(null), ...kept];
        }
        for (let i = MARKET_SIZE - 1; i >= 0; i--) {
            if (this.market[i] == null && this.bag.length) this.market[i] = this.bag.shift();
        }
        this.endTurn(seat);
        return true;
    }

    endTurn(seat) {
        if (this.players.every(q => q.placed >= OPEN_CELLS.length)) {
            this.finish();
            return;
        }
        const n = this.players.length;
        for (let k = 1; k <= n; k++) {
            const next = (seat + k) % n;
            if (this.players[next].placed < OPEN_CELLS.length) {
                this.current = next;
                break;
            }
        }
        this.phase = 'place';
        this.turnNumber += 1;
        this.emit({ type: 'turn', seat: this.current });
    }

    finish() {
        this.phase = 'end';
        const scores = this.players.map(p => scorePlayer(p));
        const key = (i) => [scores[i].total, this.players[i].cats.length, this.players[i].buttons.length + (this.players[i].rainbow ? 1 : 0)];
        const better = (a, b) => {
            const x = key(a);
            const y = key(b);
            for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] - y[k];
            return 0;
        };
        const order = this.players.map(p => p.id).sort((a, b) => better(b, a));
        const winners = order.filter(i => better(i, order[0]) === 0);
        this.result = { players: scores, winners };
        this.emit({ type: 'end', winners: [...winners] });
        if (this.solo) this.log(`終わり：${scores[0].total}点`);
        else this.log(`${winners.map(i => this.players[i].name).join('と')}の勝ち（${scores[winners[0]].total}点）`);
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
