/**
 * ミスター・ジャック・ポケットの進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（タイルの並び・行動タイルの面・アリバイの山はシードから決まる）
 *
 * 席0がジャック側、席1が刑事側
 *
 * ルール（細かい点の決め方は README にも書く）
 * - 3×3 の街区タイル（容疑者9人。各タイルは1辺に壁がある T 字の通り）。まわりの道を刑事3人（ホームズ・ワトソン・トビー）が時計回りに動く
 * - ジャックはアリバイカード9枚から1枚を引いて決める（ジャック側だけが知る）。残り8枚がアリバイの山
 * - ラウンドは8回。奇数ラウンドは行動タイル4枚を投げて面を決め、刑事側1枚 → ジャック側2枚 → 刑事側1枚
 *   偶数ラウンドは前のラウンドの4枚を裏返し、ジャック側1枚 → 刑事側2枚 → ジャック側1枚
 * - 行動：刑事を1〜2マス進める／ジョーカー（どの刑事でも1マス。ジャック側は動かさなくてもよい）／タイルを回す（そのラウンドに回したタイルは回せない）
 *   ／2枚を入れ替える（向きはそのまま）／アリバイ（刑事側は引いた容疑者を無実にする。ジャック側は伏せて持ち、札の砂時計を得る）
 * - ラウンドの終わりに目撃：刑事から壁にさえぎられずに見える容疑者を数える
 *   ジャックが見えていれば、見えていない容疑者は全員無実。見えていなければ、見えている容疑者が全員無実になり、ジャック側が砂時計1つ
 * - 勝ち：ラウンドの終わり（目撃のあと）に、無実でない容疑者がジャックだけなら刑事側。砂時計が6つ以上ならジャック側
 *   両方を同時に満たしたら、ゲームは続き、その後でジャックが見えたラウンドで刑事側の勝ち。8ラウンドの終わりまで見えなければジャック側の勝ち
 *   （8ラウンドの終わりに初めて両方を満たしたときは、そのラウンドにジャックが見えていれば刑事側）
 * - 8ラウンドで決まらなければジャック側の勝ち
 */

import { createRandom, shuffle } from './random.js';
import { SUSPECTS, CROSS_SUSPECT, DETECTIVES, TOKENS, ROUNDS, HOURGLASSES_TO_WIN } from './data.js';
import { SIZE, TRACK, LEFT, RIGHT, DOWN, opposite, sightLine } from './board.js';

export const JACK = 0;
export const DETECTIVE = 1;
const MAX_LOGS = 400;
const MAX_EVENTS = 80;
const DETECTIVE_KEYS = DETECTIVES.map(d => d.key);
const SUSPECT_NAME = Object.fromEntries(SUSPECTS.map(s => [s.key, s.name]));
const DETECTIVE_NAME = Object.fromEntries(DETECTIVES.map(d => [d.key, d.name]));

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    move: ['who', 'steps'],
    joker: ['who', 'steps'],
    rotate: ['tile', 'rot'],
    exchange: ['a', 'b'],
    alibi: []
};

// ラウンドの中で選ぶ人の順（奇数ラウンド・偶数ラウンド）
export const pickOrder = (round) => (round % 2 === 1 ? [DETECTIVE, JACK, JACK, DETECTIVE] : [JACK, DETECTIVE, DETECTIVE, JACK]);

// タイルの壁のある辺（なければ null）
export function wallOf(tile) {
    if (tile.cleared && tile.suspect === CROSS_SUSPECT) return null;
    return tile.rot;
}

// 刑事たちから見える容疑者（無実でないもの）。tiles・detectives だけを使う
export function visibleSuspects(tiles, detectives) {
    const seen = new Set();
    Object.values(detectives).forEach(space => {
        const { from, tiles: line } = sightLine(space);
        for (const pos of line) {
            const tile = tiles[pos];
            const wall = wallOf(tile);
            if (wall === from) break;
            if (!tile.cleared) seen.add(tile.suspect);
            if (wall === opposite(from)) break;
        }
    });
    return seen;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]（席0がジャック側、席1が刑事側）、options: { seed }
    constructor(players, options = {}) {
        if (players.length !== 2) throw new Error('2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? (id === JACK ? 'ジャック' : '刑事')), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null
        }));
        // タイル：並びと向きはでたらめ。最初に刑事と向き合う3枚は、壁を刑事に向ける
        const order = shuffle(SUSPECTS.map(s => s.key), this.random);
        this.tiles = order.map(suspect => ({ suspect, rot: Math.floor(this.random() * 4), cleared: false }));
        this.tiles[0].rot = LEFT;   // ホームズ（左の辺・上の行）と向き合う
        this.tiles[2].rot = RIGHT;  // ワトソン（右の辺・上の行）と向き合う
        this.tiles[7].rot = DOWN;   // トビー（下の辺・まん中の列）と向き合う
        this.detectives = Object.fromEntries(DETECTIVES.map(d => [d.key, d.start]));
        // ジャックとアリバイの山
        const cards = shuffle(SUSPECTS.map(s => s.key), this.random);
        this.jack = cards.shift();
        this.deck = cards;
        this.jackCards = [];       // ジャック側が引いたアリバイ（伏せる）
        this.detectiveCards = [];  // 刑事側が引いたアリバイ（見せる）
        this.hourglasses = 0;      // 目撃で得た砂時計（見せる）
        this.round = 0;
        this.tokens = TOKENS.map(() => ({ face: 0, used: false }));
        this.rotated = [];         // このラウンドに回したタイル
        this.pick = 0;             // このラウンドの何枚目か（0〜3）
        this.phase = 'action';
        this.winner = null;
        this.endReason = null;
        this.lastWitness = null;   // 前のラウンドの目撃 { visible, jackSeen, cleared }
        this.standoff = false;     // 両方の勝ちを同時に満たしたあと（ジャックが見えるか、8ラウンドが終わるまで続ける）
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [pickOrder(this.round)[this.pick]];
    }

    // ジャック側の砂時計（伏せたアリバイの分も含む）
    totalHourglasses() {
        return this.hourglasses + this.jackCards.reduce((s, k) => s + SUSPECTS.find(x => x.key === k).hourglasses, 0);
    }

    suspectsLeft() {
        return this.tiles.filter(t => !t.cleared).map(t => t.suspect);
    }

    startRound() {
        this.round += 1;
        if (this.round % 2 === 1) {
            this.tokens = TOKENS.map(() => ({ face: this.random() < 0.5 ? 0 : 1, used: false }));
        } else {
            this.tokens = this.tokens.map(t => ({ face: 1 - t.face, used: false }));
        }
        this.rotated = [];
        this.pick = 0;
        this.emit({ type: 'round', round: this.round, faces: this.tokens.map(t => t.face) });
        this.log(`ラウンド${this.round}：${this.players[pickOrder(this.round)[0]].name}から`);
    }

    // 今使える行動（使っていない行動タイルの上の面）
    available() {
        return this.tokens.map((t, i) => (t.used ? null : TOKENS[i][t.face]));
    }

    tokenFor(action) {
        return this.available().indexOf(action);
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const error = this.commandError(playerId, command);
        if (error) return this.fail(error);
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.perform(playerId, recorded);
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // 操作ができるか。できなければ理由
    commandError(seat, c) {
        const action = c.type === 'move' ? c.who : c.type;
        if (c.type === 'move' && !DETECTIVE_KEYS.includes(c.who)) return '刑事を選んでください';
        const token = this.tokenFor(action);
        if (token < 0) return 'その行動タイルはありません';
        if (c.type === 'move') {
            if (c.steps !== 1 && c.steps !== 2) return '1マスか2マス進めます';
        } else if (c.type === 'joker') {
            if (!DETECTIVE_KEYS.includes(c.who)) return '刑事を選んでください';
            const allowed = seat === JACK ? [0, 1] : [1];
            if (!allowed.includes(c.steps)) return seat === JACK ? '0マスか1マス進めます' : '1マス進めます';
        } else if (c.type === 'rotate') {
            if (!Number.isInteger(c.tile) || c.tile < 0 || c.tile >= SIZE * SIZE) return 'タイルを選んでください';
            if (!Number.isInteger(c.rot) || c.rot < 0 || c.rot > 3) return '向きを選んでください';
            if (this.rotated.includes(c.tile)) return 'このラウンドに回したタイルです';
            if (this.tiles[c.tile].rot === c.rot) return '向きを変えてください';
        } else if (c.type === 'exchange') {
            const ok = (x) => Number.isInteger(x) && x >= 0 && x < SIZE * SIZE;
            if (!ok(c.a) || !ok(c.b) || c.a === c.b) return '2枚のタイルを選んでください';
        } else if (c.type === 'alibi') {
            if (!this.deck.length) return 'アリバイカードがありません';
        }
        return null;
    }

    perform(seat, c) {
        const action = c.type === 'move' ? c.who : c.type;
        const token = this.tokenFor(action);
        this.tokens[token].used = true;
        const name = this.players[seat].name;
        if (c.type === 'move' || c.type === 'joker') {
            const from = this.detectives[c.who];
            this.detectives[c.who] = (from + c.steps) % TRACK;
            this.emit({ type: 'move', seat, action, who: c.who, from, to: this.detectives[c.who], steps: c.steps });
            this.log(c.steps ? `${name}：${c.type === 'joker' ? 'ジョーカーで' : ''}${DETECTIVE_NAME[c.who]}を${c.steps}マス進めました` : `${name}：ジョーカーで、だれも動かしませんでした`);
        } else if (c.type === 'rotate') {
            this.tiles[c.tile].rot = c.rot;
            this.rotated.push(c.tile);
            this.emit({ type: 'rotate', seat, tile: c.tile, rot: c.rot });
            this.log(`${name}：タイルを回しました`);
        } else if (c.type === 'exchange') {
            [this.tiles[c.a], this.tiles[c.b]] = [this.tiles[c.b], this.tiles[c.a]];
            // 回したタイルの記録も、タイルと一緒に動かす
            this.rotated = this.rotated.map(p => (p === c.a ? c.b : p === c.b ? c.a : p));
            this.emit({ type: 'exchange', seat, a: c.a, b: c.b });
            this.log(`${name}：タイルを入れ替えました`);
        } else if (c.type === 'alibi') {
            const card = this.deck.shift();
            if (seat === JACK) {
                this.jackCards.push(card);
                this.emit({ type: 'alibi', seat });
                this.log(`${name}：アリバイカードを引きました`);
            } else {
                this.detectiveCards.push(card);
                const tile = this.tiles.find(t => t.suspect === card);
                const fresh = !tile.cleared;
                tile.cleared = true;
                this.emit({ type: 'alibi', seat, card, cleared: fresh });
                this.log(`${name}：アリバイ（${SUSPECT_NAME[card]}）${fresh ? 'を無実にしました' : ''}`);
            }
        }
        this.pick += 1;
        if (this.pick >= 4) this.endRound();
    }

    // ラウンドの終わり：目撃と勝ち負け
    endRound() {
        const visible = visibleSuspects(this.tiles, this.detectives);
        const jackSeen = visible.has(this.jack);
        const cleared = [];
        this.tiles.forEach(t => {
            if (t.cleared) return;
            if (jackSeen ? !visible.has(t.suspect) : visible.has(t.suspect)) {
                t.cleared = true;
                cleared.push(t.suspect);
            }
        });
        if (!jackSeen) this.hourglasses += 1;
        this.lastWitness = { round: this.round, visible: [...visible], jackSeen, cleared };
        this.emit({ type: 'witness', round: this.round, jackSeen, visible: [...visible], cleared });
        this.log(jackSeen ? `目撃あり：見えていない${cleared.length}人が無実` : `目撃なし：見えていた${cleared.length}人が無実。ジャック側に砂時計`);
        const caught = this.suspectsLeft().length === 1;
        const escaped = this.totalHourglasses() >= HOURGLASSES_TO_WIN;
        if (this.standoff) {
            if (jackSeen) return this.finish(DETECTIVE, 'both');
            if (this.round >= ROUNDS) return this.finish(JACK, 'both');
            return this.startRound();
        }
        if (caught && escaped) {
            if (this.round >= ROUNDS) return this.finish(jackSeen ? DETECTIVE : JACK, 'both');
            this.standoff = true;
            this.emit({ type: 'standoff', round: this.round });
            this.log('ジャックは絞られたが、砂時計もそろった。ジャックが見えれば刑事側の勝ち');
            return this.startRound();
        }
        if (caught) return this.finish(DETECTIVE, 'caught');
        if (escaped) return this.finish(JACK, 'hourglasses');
        if (this.round >= ROUNDS) return this.finish(JACK, 'time');
        this.startRound();
    }

    finish(winner, reason) {
        this.phase = 'end';
        this.winner = winner;
        this.endReason = reason;
        this.emit({ type: 'end', winner, reason, jack: this.jack });
        this.log(`${winner === JACK ? 'ジャック側' : '刑事側'}の勝ち（ジャックは${SUSPECT_NAME[this.jack]}）`);
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
            if (!game.applyCommand(playerId, command)) {
                throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
            }
        });
        return game;
    }
}
