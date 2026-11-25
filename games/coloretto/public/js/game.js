/**
 * コロレット（Coloretto）のゲームの進行（3〜5人）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びはシードから決まる）
 *
 * ルール（標準版）
 * - カード：カメレオン7色×9枚、ジョーカー3枚、+2 カード10枚、最後のラウンドのカード1枚
 * - 3人では1色を除く（6色）。列は人数と同じ数
 * - 準備：各自に違う色のカメレオンを1枚ずつ配る。山札の下から15枚目の上に、最後のラウンドのカードを入れる
 * - 手番（そのラウンドでまだ列を取っていない人が、順に1つ行う）
 *   - 山札から1枚引いて表にし、まだ取られていない、3枚未満の列に置く（置ける列がなければ引けない）
 *   - カードが1枚以上ある列を1つ取る。取った人は、そのラウンドの残りは手番がない
 * - 全員が列を取ったらラウンドの終わり。最後に列を取った人から次のラウンドを始める
 * - 最後のラウンドのカードが出たら、脇に置いて代わりにもう1枚引く。そのラウンドの終わりでゲームが終わる
 * - 得点：色ごとの枚数で 1・3・6・10・15・21（6枚以上は21。茶色の面）。3色をプラス、残りの色はマイナス
 *   ジョーカーは最後に好きな色として数える。+2 は1枚2点
 *
 * ルールブックに書かれていないので、次のように決めた
 * - プラスにする3色とジョーカーの色は、得点がいちばん高くなるように自動で選ぶ
 * - 点数が同じなら、その全員を勝ちとする
 * - 最初の1番手はシードから決める
 * - 2人用の変種は入れていない（列のカードの置ける枚数を確かめられなかったため）
 */

import { createRandom, shuffle } from './random.js';

export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown'];
export const COLOR_NAMES = { red: '赤', orange: '橙', yellow: '黄', green: '緑', blue: '青', purple: '紫', brown: '茶' };
export const JOKER = 'joker';
export const PLUS2 = 'plus2';
export const LAST = 'last';
export const CARDS_PER_COLOR = 9;
export const JOKERS = 3;
export const PLUS2_CARDS = 10;
export const ROW_LIMIT = 3;
export const LAST_ROUND_DEPTH = 15;   // 最後のラウンドのカードの下に置く枚数
export const POSITIVE_COLORS = 3;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;
// 枚数ごとの点数（0〜6枚以上）。茶色の面がふつう、灰色の面は上級
export const SCORE_TABLES = { brown: [0, 1, 3, 6, 10, 15, 21], gray: [0, 1, 4, 8, 7, 6, 5] };
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { draw: [], place: ['row'], take: ['row'] };
const MAX_LOGS = 200;
const MAX_EVENTS = 80;

export const cardName = (card) => (card === JOKER ? 'ジョーカー' : card === PLUS2 ? '+2' : card === LAST ? '最後のラウンド' : COLOR_NAMES[card]);
const pointsFor = (table, n) => SCORE_TABLES[table][Math.min(n, 6)];

// 集めたカード（色ごとの枚数・ジョーカー・+2）の得点。プラスの3色とジョーカーの色は、いちばん高くなるように選ぶ
export function bestScore(counts, jokers, plus2, table = 'brown') {
    const colors = Object.keys(counts);
    let best = null;
    // ジョーカーの割り当てを全部試す（ジョーカーは3枚まで、色は7つまでなので多くない）
    const assign = (left, from, current) => {
        if (left === 0) {
            const result = scoreWithout(current, table);
            if (!best || result.score > best.score) best = { ...result, counts: { ...current } };
            return;
        }
        for (let i = from; i < colors.length; i++) {
            current[colors[i]]++;
            assign(left - 1, i, current);
            current[colors[i]]--;
        }
    };
    assign(colors.length ? jokers : 0, 0, { ...counts });
    if (!best) best = { ...scoreWithout(counts, table), counts: { ...counts } };
    best.score += plus2 * 2;
    best.jokerAssignment = Object.fromEntries(colors.map(c => [c, best.counts[c] - counts[c]]).filter(([, n]) => n > 0));
    return best;
}

// ジョーカーを割り当てたあとの、色ごとの得点（多い3色がプラス）
function scoreWithout(counts, table) {
    const values = Object.entries(counts).map(([color, n]) => ({ color, n, points: pointsFor(table, n) }))
        .filter(v => v.n > 0)
        .sort((a, b) => b.points - a.points || b.n - a.n);
    const positive = values.slice(0, POSITIVE_COLORS).map(v => v.color);
    const score = values.reduce((s, v, i) => s + (i < POSITIVE_COLORS ? v.points : -v.points), 0);
    return { score, positive };
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, table }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const table = SCORE_TABLES[options.table] ? options.table : 'brown';
        this.options = { seed, table };
        const random = createRandom(seed);
        // 3人では1色を除く
        this.colors = players.length === 3 ? shuffle([...COLORS], random).slice(0, 6).sort((a, b) => COLORS.indexOf(a) - COLORS.indexOf(b)) : [...COLORS];
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            counts: Object.fromEntries(this.colors.map(c => [c, 0])), jokers: 0, plus2: 0, took: false
        }));
        // 各自に違う色を1枚ずつ配り、残りで山札を作る
        const startColors = shuffle([...this.colors], random).slice(0, players.length);
        this.players.forEach((p, i) => { p.counts[startColors[i]]++; });
        const rest = [];
        this.colors.forEach(color => {
            const n = CARDS_PER_COLOR - (startColors.includes(color) ? 1 : 0);
            for (let i = 0; i < n; i++) rest.push(color);
        });
        for (let i = 0; i < JOKERS; i++) rest.push(JOKER);
        for (let i = 0; i < PLUS2_CARDS; i++) rest.push(PLUS2);
        shuffle(rest, random);
        // 下から15枚目の上に、最後のラウンドのカードを入れる（山札の先頭から引く）
        this.deck = [...rest.slice(0, rest.length - LAST_ROUND_DEPTH), LAST, ...rest.slice(rest.length - LAST_ROUND_DEPTH)];
        this.rows = players.map(() => ({ cards: [], taken: false }));
        this.round = 1;
        this.current = Math.floor(random() * players.length);
        this.phase = 'play';       // play：引くか取る / place：引いたカードを置く / end：終わり
        this.pending = null;       // 引いて、まだ置いていないカード
        this.lastRound = false;
        this.winners = [];
        this.results = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.emit({ type: 'start', starts: this.players.map((p, i) => ({ seat: p.id, color: startColors[i] })), current: this.current });
        this.log(`${this.players[this.current].name}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    // 引いたカードを置ける列
    openRows() {
        return this.rows.map((row, i) => (!row.taken && row.cards.length < ROW_LIMIT ? i : -1)).filter(i => i >= 0);
    }

    // 取れる列（まだ取られていず、カードが1枚以上ある）
    takableRows() {
        return this.rows.map((row, i) => (!row.taken && row.cards.length > 0 ? i : -1)).filter(i => i >= 0);
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { play: { draw: this.draw, take: this.take }, place: { place: this.place } }[this.phase]?.[command.type];
        if (!handler) return this.fail(this.phase === 'place' ? '引いたカードを置く列を選んでください' : '今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = command[key]; });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'draw' }：山札から1枚引いて表にする
    draw(seat) {
        if (this.openRows().length === 0) return this.fail('置ける列がないので、列を取ってください');
        if (this.deck.length === 0) return this.fail('山札がありません');
        let card = this.deck.shift();
        if (card === LAST) {
            // 最後のラウンドのカードは脇に置き、代わりにもう1枚引く
            this.lastRound = true;
            this.emit({ type: 'lastRound', seat });
            this.log('最後のラウンドのカードが出ました。このラウンドで終わりです');
            card = this.deck.shift();
        }
        this.pending = card;
        this.phase = 'place';
        this.emit({ type: 'draw', seat, card });
        return true;
    }

    // { type: 'place', row }：引いたカードを列に置く
    place(seat, { row }) {
        if (!this.openRows().includes(row)) return this.fail('その列には置けません');
        const card = this.pending;
        this.rows[row].cards.push(card);
        this.pending = null;
        this.phase = 'play';
        this.emit({ type: 'place', seat, card, row });
        this.log(`${this.players[seat].name}が${cardName(card)}を${row + 1}列目に置きました`);
        this.nextTurn(seat);
        return true;
    }

    // { type: 'take', row }：列を取る。そのラウンドの残りは手番がない
    take(seat, { row }) {
        if (!this.takableRows().includes(row)) return this.fail('その列は取れません');
        const player = this.players[seat];
        const cards = this.rows[row].cards;
        cards.forEach(card => {
            if (card === JOKER) player.jokers++;
            else if (card === PLUS2) player.plus2++;
            else player.counts[card]++;
        });
        this.rows[row].taken = true;
        player.took = true;
        this.emit({ type: 'take', seat, row, cards: [...cards] });
        this.log(`${player.name}が${row + 1}列目を取りました（${cards.map(cardName).join('・')}）`);
        if (this.players.every(p => p.took)) return this.endRound(seat) ?? true;
        this.nextTurn(seat);
        return true;
    }

    // ---- 進行 ----

    nextTurn(seat) {
        const n = this.players.length;
        for (let i = 1; i <= n; i++) {
            const next = (seat + i) % n;
            if (!this.players[next].took) {
                this.current = next;
                return;
            }
        }
    }

    // ラウンドの終わり。最後に列を取った人から次のラウンドを始める
    endRound(lastTaker) {
        this.emit({ type: 'roundEnd', round: this.round });
        if (this.lastRound) return this.endGame();
        this.round++;
        this.rows = this.players.map(() => ({ cards: [], taken: false }));
        this.players.forEach(p => { p.took = false; });
        this.current = lastTaker;
        this.log(`第${this.round}ラウンド。${this.players[lastTaker].name}から始めます`);
        return true;
    }

    scoreOf(player) {
        return bestScore(player.counts, player.jokers, player.plus2, this.options.table);
    }

    endGame() {
        this.phase = 'end';
        this.results = this.players.map(p => ({ seat: p.id, ...this.scoreOf(p) }));
        const best = Math.max(...this.results.map(r => r.score));
        this.winners = this.results.filter(r => r.score === best).map(r => r.seat);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
        return true;
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
