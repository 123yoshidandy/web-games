/**
 * ヤッツィー（Yahtzee）のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（出目はシードから決まる）
 *
 * ルール（Hasbro の Yahtzee の公式ルール）
 * - 1〜4人（1人ならハイスコアを目指す）。サイコロは5個。全員が13回ずつ手番を行う
 * - 手番では、サイコロを3回まで振れる。2回目と3回目は、残したいサイコロを選んで、ほかを振り直す
 * - 振り終えたら（途中でもよい）、得点表の空いている欄を1つ選んで記入する。条件に合わなければ0点
 * - 上段（1〜6の目）：その目の合計。上段の合計が63点以上なら、ボーナス35点
 * - 下段
 *   - スリーカード：同じ目が3個以上で、5個の合計
 *   - フォーカード：同じ目が4個以上で、5個の合計
 *   - フルハウス：3個と2個の組で25点
 *   - S・ストレート：4つ続いた目で30点
 *   - L・ストレート：5つ続いた目で40点
 *   - ヤッツィー：5個とも同じ目で50点
 *   - チャンス：5個の合計
 * - ヤッツィーボーナス：ヤッツィーの欄に50点を書いたあと、またヤッツィーを出したら、記入のたびに100点
 * - ジョーカー：ヤッツィーの欄が埋まっている（50点でも0点でも）ときにヤッツィーを出したら
 *   - その目の上段が空いていれば、そこに書く
 *   - 上段が埋まっていれば、下段の空いている欄に書く。フルハウス・ストレートも満点になる
 *   - 下段も埋まっていれば、空いている上段に0点で書く
 * - 合計点が一番高い人の勝ち。同点なら、その全員で勝ちを分け合う
 *
 * 公式ルールにないので、次のように決めた
 * - 手番は席の順（席0から）。人数が多くても、全員が同じ13回なので、順番による差はない
 */

import { createRandom } from './random.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const DICE = 5;
export const ROLLS = 3;
export const UPPER_BONUS_AT = 63;
export const UPPER_BONUS = 35;
export const YAHTZEE_BONUS = 100;
const MAX_LOGS = 200;
const MAX_EVENTS = 200;

export const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER = ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];
export const CATEGORIES = [...UPPER, ...LOWER];
export const ROUNDS = CATEGORIES.length; // 13
export const CATEGORY_NAMES = {
    ones: '1の目', twos: '2の目', threes: '3の目', fours: '4の目', fives: '5の目', sixes: '6の目',
    threeKind: 'スリーカード', fourKind: 'フォーカード', fullHouse: 'フルハウス',
    smallStraight: 'S・ストレート', largeStraight: 'L・ストレート', yahtzee: 'ヤッツィー', chance: 'チャンス'
};
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { roll: ['keep'], score: ['category'] };

// 上段の欄の目（ones → 1）
export const faceOf = (category) => UPPER.indexOf(category) + 1;

// 目ごとの個数（counts[1]〜counts[6]）
export function countsOf(dice) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach(d => { counts[d]++; });
    return counts;
}

const sum = (dice) => dice.reduce((s, d) => s + d, 0);

export const isYahtzee = (dice) => dice.length === DICE && dice.every(d => d === dice[0]);

// 続いた目の一番長い長さ
function longestRun(counts) {
    let best = 0;
    let run = 0;
    for (let face = 1; face <= 6; face++) {
        run = counts[face] > 0 ? run + 1 : 0;
        best = Math.max(best, run);
    }
    return best;
}

// その欄に書いたときの点数（ヤッツィーボーナスは含まない）。joker：ジョーカーとして書く（フルハウス・ストレートを満点にする）
export function scoreFor(dice, category, joker = false) {
    const counts = countsOf(dice);
    const most = Math.max(...counts);
    switch (category) {
        case 'threeKind': return most >= 3 ? sum(dice) : 0;
        case 'fourKind': return most >= 4 ? sum(dice) : 0;
        case 'fullHouse': return joker || (counts.includes(3) && counts.includes(2)) ? 25 : 0;
        case 'smallStraight': return joker || longestRun(counts) >= 4 ? 30 : 0;
        case 'largeStraight': return joker || longestRun(counts) >= 5 ? 40 : 0;
        case 'yahtzee': return most === 5 ? 50 : 0;
        case 'chance': return sum(dice);
        default: {
            const face = faceOf(category);
            if (face < 1) throw new Error(`知らない欄です: ${category}`);
            return counts[face] * face;
        }
    }
}

// その出目で記入できる欄（ジョーカーのときは絞られる）。scores：その人の得点表
export function legalCategories(scores, dice) {
    const open = CATEGORIES.filter(c => scores[c] === null);
    if (!isJoker(scores, dice)) return open;
    const upper = UPPER[dice[0] - 1];
    if (scores[upper] === null) return [upper];
    const lower = open.filter(c => LOWER.includes(c));
    return lower.length > 0 ? lower : open;
}

// ヤッツィーの欄が埋まっていて、ヤッツィーを出した
export const isJoker = (scores, dice) => isYahtzee(dice) && scores.yahtzee !== null;

// 記入したら何点になるか。{ points, bonus }（bonus はヤッツィーボーナス）
export function pointsFor(scores, dice, category) {
    const joker = isJoker(scores, dice);
    return {
        points: scoreFor(dice, category, joker),
        bonus: isYahtzee(dice) && scores.yahtzee === 50 ? YAHTZEE_BONUS : 0
    };
}

// 得点表の集計
export function totalsOf(player) {
    const upper = UPPER.reduce((s, c) => s + (player.scores[c] ?? 0), 0);
    const lower = LOWER.reduce((s, c) => s + (player.scores[c] ?? 0), 0);
    const upperBonus = upper >= UPPER_BONUS_AT ? UPPER_BONUS : 0;
    const yahtzeeBonus = player.yahtzeeBonus * YAHTZEE_BONUS;
    return { upper, upperBonus, lower, yahtzeeBonus, total: upper + upperBonus + lower + yahtzeeBonus };
}

export const emptyScores = () => Object.fromEntries(CATEGORIES.map(c => [c, null]));

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            scores: emptyScores(), yahtzeeBonus: 0
        }));
        this.turn = 0;
        this.round = 1;              // 何回目の手番か（1〜13）
        this.dice = [0, 0, 0, 0, 0]; // 0 はまだ振っていない
        this.kept = [false, false, false, false, false]; // 直前に振ったときに残したサイコロ
        this.rollsLeft = ROLLS;
        this.phase = 'play';         // play：手番の人が振るか記入する / end：終わり
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.emit({ type: 'turn', seat: this.turn, round: this.round });
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作が必要な人
    actors() {
        return this.phase === 'play' ? [this.turn] : [];
    }

    hasRolled() {
        return this.rollsLeft < ROLLS;
    }

    // 手番の人が今記入できる欄（振る前は空）
    legal() {
        return this.hasRolled() ? legalCategories(this.players[this.turn].scores, this.dice) : [];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { roll: this.roll, score: this.score }[command.type];
        if (!handler || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (playerId !== this.turn) return this.fail('あなたの番ではありません');
        const recorded = handler.call(this, playerId, command);
        if (!recorded) return false;
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'roll', keep: [bool×5] }：残さないサイコロを振る。1回目は全部振る（keep は見ない）
    roll(seat, command) {
        if (this.rollsLeft <= 0) return this.fail('もう振れません。欄を選んで記入してください');
        let keep = [false, false, false, false, false];
        if (this.hasRolled()) {
            if (!Array.isArray(command.keep) || command.keep.length !== DICE || !command.keep.every(k => typeof k === 'boolean')) {
                return this.fail('残すサイコロの指定が正しくありません');
            }
            if (command.keep.every(Boolean)) return this.fail('振るサイコロを1個以上選んでください');
            keep = [...command.keep];
        }
        this.dice = this.dice.map((d, i) => (keep[i] ? d : 1 + Math.floor(this.random() * 6)));
        this.kept = keep;
        this.rollsLeft--;
        this.emit({ type: 'roll', seat, dice: [...this.dice], keep: [...keep], rollsLeft: this.rollsLeft });
        return { type: 'roll', keep };
    }

    // { type: 'score', category }：空いている欄に記入し、次の人の番にする
    score(seat, command) {
        if (!this.hasRolled()) return this.fail('先にサイコロを振ってください');
        const category = command.category;
        if (typeof category !== 'string' || !CATEGORIES.includes(category)) return this.fail('知らない欄です');
        const player = this.players[seat];
        if (player.scores[category] !== null) return this.fail('その欄はもう埋まっています');
        if (!this.legal().includes(category)) return this.fail('ジョーカーのため、その欄には書けません');
        const { points, bonus } = pointsFor(player.scores, this.dice, category);
        const joker = isJoker(player.scores, this.dice);
        player.scores[category] = points;
        if (bonus > 0) player.yahtzeeBonus++;
        this.emit({ type: 'score', seat, category, points, bonus, joker, dice: [...this.dice] });
        this.log(`${player.name}：${CATEGORY_NAMES[category]}に${points}点${bonus > 0 ? `（ヤッツィーボーナス +${bonus}）` : ''}`);
        this.nextTurn();
        return { type: 'score', category };
    }

    // ---- 進行 ----

    nextTurn() {
        this.dice = [0, 0, 0, 0, 0];
        this.kept = [false, false, false, false, false];
        this.rollsLeft = ROLLS;
        const next = (this.turn + 1) % this.players.length;
        if (next === 0) this.round++;
        if (this.round > ROUNDS) {
            this.endGame();
            return;
        }
        this.turn = next;
        this.emit({ type: 'turn', seat: this.turn, round: this.round });
    }

    results() {
        return this.players.map(p => ({ seat: p.id, ...totalsOf(p) }));
    }

    endGame() {
        this.phase = 'end';
        this.round = ROUNDS;
        const results = this.results();
        const best = Math.max(...results.map(r => r.total));
        this.winners = results.filter(r => r.total === best).map(r => r.seat);
        this.emit({ type: 'end', winners: [...this.winners], results });
        this.log(this.players.length === 1
            ? `${best}点で終わりました`
            : `${this.winners.map(id => this.players[id].name).join('と')}の勝ちです（${best}点）`);
    }

    // ---- 道具 ----

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
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
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
