/**
 * SET のルールと状態（DOM に依存しない。ブラウザ・サーバー・テストで同じものを使う）
 *
 * カードは 81 枚。4つの特徴（数・形・塗り・色）がそれぞれ3通りで、カードの番号 0〜80 から特徴が決まる
 * 場に 12 枚を並べ、3枚の組で、どの特徴も「全部同じ」か「全部違う」ならセット
 * セットがなければ3枚足す。山札がなくなり、場にセットが残っていなければ終わり
 *
 * 早い者勝ちのゲームなので、操作には時刻 t（対戦の始まりからのミリ秒）が付く。時刻は記録に入り、記録から同じ展開を再現できる
 * ロジックは時計を見ない。t は操作を送る側（ローカルの時計・サーバーの時計）が決める
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）
 */

import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const DECK_SIZE = 81;
export const BOARD_SIZE = 12;
export const LOCK_MS = 3000;        // セットでない3枚を取ったら、この間は取れない
export const WRONG_PENALTY = 1;     // セットでない3枚を取ったら1点減らす（0 より下にはしない）
export const HINT_COST = 1;         // CPU・オンラインの対戦で、ヒントを使うと1点減らす（タイムアタックはベストに数えない）
export const MODES = ['solo', 'cpu', 'online'];
export const LEVELS = ['easy', 'normal', 'hard'];
const LOG_LIMIT = 200;

export const ATTRIBUTES = ['number', 'shape', 'shading', 'color'];
export const SHAPE_NAMES = ['ダイヤ', 'カプセル', 'なみ'];
export const SHADING_NAMES = ['塗り', 'しま', '白抜き'];
export const COLOR_NAMES = ['朱', '緑', '青'];

// カードの特徴（どれも 0〜2）
export function cardAttributes(card) {
    return {
        number: card % 3,
        shape: Math.floor(card / 3) % 3,
        shading: Math.floor(card / 9) % 3,
        color: Math.floor(card / 27) % 3
    };
}

// 3枚がセットか（特徴ごとに、3つの値の和が3の倍数なら「全部同じ」か「全部違う」）
export function isSet(a, b, c) {
    if (a === b || b === c || a === c) return false;
    const x = cardAttributes(a);
    const y = cardAttributes(b);
    const z = cardAttributes(c);
    return ATTRIBUTES.every(key => (x[key] + y[key] + z[key]) % 3 === 0);
}

// 2枚からセットになる3枚目
export function thirdCard(a, b) {
    const x = cardAttributes(a);
    const y = cardAttributes(b);
    const v = key => (6 - x[key] - y[key]) % 3;
    return v('number') + v('shape') * 3 + v('shading') * 9 + v('color') * 27;
}

// 場のセットをすべて（場の並びの順。各セットも場の並びの順）
export function findSets(board) {
    const index = new Map(board.map((card, i) => [card, i]));
    const sets = [];
    for (let i = 0; i < board.length; i++) {
        for (let j = i + 1; j < board.length; j++) {
            const k = index.get(thirdCard(board[i], board[j]));
            if (k !== undefined && k > j) sets.push([board[i], board[j], board[k]]);
        }
    }
    return sets;
}

export const hasSet = board => findSets(board).length > 0;

// 特徴ごとに、3枚が同じか違うか（遊び方・ログの説明用）
export function describeTrio(cards) {
    const attrs = cards.map(cardAttributes);
    return ATTRIBUTES.map(key => {
        const values = new Set(attrs.map(a => a[key]));
        return { key, same: values.size === 1, different: values.size === 3 };
    });
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, mode, level }
    constructor(players, { seed = 1, mode = 'solo', level = 'normal' } = {}) {
        if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
            throw new Error('人数が正しくありません');
        }
        this.seed = seed >>> 0;
        this.mode = MODES.includes(mode) ? mode : 'solo';
        this.level = LEVELS.includes(level) ? level : 'normal';
        this.players = players.map((player, seat) => ({
            seat,
            name: String(player.name ?? `P${seat + 1}`),
            isCPU: Boolean(player.isCPU),
            score: 0,
            sets: 0,
            wrong: 0,
            hints: 0,
            lockUntil: 0
        }));
        const random = createRandom(this.seed);
        this.deck = shuffle(Array.from({ length: DECK_SIZE }, (_, i) => i), random);
        this.board = [];
        this.boardVersion = 0;
        this.changedAt = 0;   // 場が最後に変わった時刻
        this.lastT = 0;       // 最後の操作の時刻（記録の時刻は減らない）
        this.phase = 'play';
        this.endT = null;
        this.commands = [];
        this.logs = [];
        this.events = [];     // 起きたこと（画面の演出と音が拾う）。{ id, type, seat?, cards?, t }
        this.eventCount = 0;
        this.hintCards = {};  // 席ごとのヒント { [seat]: { version, card } }
        this.lastError = null;
        this.result = null;

        this.dealTo(BOARD_SIZE);
        this.ensureSet(0);
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const entry of commands) {
            const { seat, ...command } = entry;
            if (!game.applyCommand(seat, command)) {
                throw new Error(`記録を再現できません（${game.commands.length + 1} 手目：${game.lastError}）`);
            }
        }
        return game;
    }

    get isOver() {
        return this.phase === 'end';
    }

    // ===== 操作 =====

    // command: { type: 'claim', cards: [3枚], t } / { type: 'hint', t }
    applyCommand(seat, command) {
        this.lastError = null;
        const player = Number.isInteger(seat) ? this.players[seat] : null;
        if (!player) return this.fail('席が正しくありません');
        if (this.phase !== 'play') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object') return this.fail('今はその操作はできません');
        const rawT = command.t;
        if (typeof rawT !== 'number' || !Number.isFinite(rawT) || rawT < 0) return this.fail('時刻が正しくありません');
        const t = Math.max(Math.round(rawT), this.lastT);

        switch (command.type) {
            case 'claim': return this.claim(player, command.cards, t);
            case 'hint': return this.hint(player, t);
            default: return this.fail('今はその操作はできません');
        }
    }

    claim(player, cards, t) {
        if (!Array.isArray(cards) || cards.length !== 3 || !cards.every(card => Number.isInteger(card))) {
            return this.fail('3枚を選んでください');
        }
        if (new Set(cards).size !== 3) return this.fail('3枚を選んでください');
        if (!cards.every(card => this.board.includes(card))) return this.fail('そのカードはもう場にありません');
        if (t < player.lockUntil) return this.fail('少し待ってから取れます');

        const picked = [...cards];
        this.record(player.seat, { type: 'claim', cards: picked, t });
        if (!isSet(...picked)) {
            player.wrong += 1;
            player.score = Math.max(0, player.score - WRONG_PENALTY);
            player.lockUntil = t + LOCK_MS;
            this.log(`${player.name}：セットではありません（-${WRONG_PENALTY}）`);
            this.emit({ type: 'wrong', seat: player.seat, cards: picked, t });
            return true;
        }

        player.sets += 1;
        player.score += 1;
        this.log(`${player.name}：セット！`);
        this.emit({ type: 'take', seat: player.seat, cards: picked, t });
        this.removeAndRefill(picked, t);
        return true;
    }

    hint(player, t) {
        const given = this.hintCards[player.seat];
        if (given && given.version === this.boardVersion) return this.fail('ヒントはもう出ています');
        const sets = findSets(this.board);
        if (sets.length === 0) return this.fail('場にセットがありません');
        this.record(player.seat, { type: 'hint', t });
        player.hints += 1;
        if (this.mode !== 'solo') player.score = Math.max(0, player.score - HINT_COST);
        this.hintCards[player.seat] = { version: this.boardVersion, card: sets[0][0] };
        this.log(`${player.name}：ヒント`);
        this.emit({ type: 'hint', seat: player.seat, cards: [sets[0][0]], t });
        return true;
    }

    // ===== 場 =====

    // 取った3枚を外し、場が 12 枚より少なければ山札から足す（同じ位置に置く）
    removeAndRefill(cards, t) {
        const refill = this.board.length <= BOARD_SIZE && this.deck.length >= 3;
        if (refill) {
            this.board = this.board.map(card => (cards.includes(card) ? this.deck.pop() : card));
        } else {
            this.board = this.board.filter(card => !cards.includes(card));
            this.dealTo(BOARD_SIZE);
        }
        this.boardChanged(t);
        this.ensureSet(t);
    }

    dealTo(size) {
        while (this.board.length < size && this.deck.length > 0) this.board.push(this.deck.pop());
    }

    // 場にセットがなければ3枚ずつ足す。山札もなければ終わり
    ensureSet(t) {
        while (!hasSet(this.board)) {
            if (this.deck.length === 0) {
                this.finish(t);
                return;
            }
            const added = [];
            for (let i = 0; i < 3 && this.deck.length > 0; i++) {
                const card = this.deck.pop();
                this.board.push(card);
                added.push(card);
            }
            this.boardChanged(t);
            this.log('セットがないので3枚足しました');
            this.emit({ type: 'deal', cards: added, t });
        }
    }

    boardChanged(t) {
        this.boardVersion += 1;
        this.changedAt = t;
    }

    finish(t) {
        this.phase = 'end';
        this.endT = t;
        const order = [...this.players].sort((a, b) => b.score - a.score || b.sets - a.sets || a.seat - b.seat);
        const standings = order.map(player => ({
            seat: player.seat,
            score: player.score,
            sets: player.sets,
            wrong: player.wrong,
            hints: player.hints,
            rank: 1 + this.players.filter(other => other.score > player.score).length
        }));
        const top = standings[0].score;
        this.result = {
            time: t,
            standings,
            winners: standings.filter(entry => entry.score === top).map(entry => entry.seat)
        };
        this.log('山札がなくなり、場にセットが残っていないので終わり');
        this.emit({ type: 'end', t });
    }

    // ===== 記録 =====

    record(seat, command) {
        this.commands.push({ seat, ...command });
        this.lastT = command.t;
    }

    emit(event) {
        this.eventCount += 1;
        this.events.push({ id: this.eventCount, ...event });
        if (this.events.length > 30) this.events.shift();
    }

    log(text) {
        this.logs.push(text);
        if (this.logs.length > LOG_LIMIT) this.logs.shift();
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    // ===== 見る =====

    hintFor(seat) {
        const given = this.hintCards[seat];
        return given && given.version === this.boardVersion ? given.card : null;
    }

    // 席が今取れるか（t の時刻で）
    canClaim(seat, t) {
        const player = this.players[seat];
        return Boolean(player) && this.phase === 'play' && t >= player.lockUntil;
    }
}
