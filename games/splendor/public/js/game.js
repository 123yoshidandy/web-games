/**
 * スプレンダーのゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びはシードから決まる）
 *
 * ルール（基本セット）
 * - 準備: 宝石は 2人 各色4個・3人 各色5個・4人 各色7個。黄金は人数によらず5個
 *         貴族は 人数+1 枚。各レベルの山札から4枚ずつ表向きに並べる
 * - 手番: 次の4つのうち1つを行う
 *   1. 違う色の宝石を3個取る
 *   2. 同じ色の宝石を2個取る（取る前に、その色が4個以上残っているときだけ）
 *   3. カードを1枚予約して黄金を1個取る（場の表向きのカードか、山札の一番上を伏せたまま。予約は3枚まで。黄金がなくても予約はできる）
 *   4. 場か予約したカードを1枚買う（ボーナスの分だけ安くなる。黄金はどの色にも使える）
 * - 手番の終わりに、宝石（黄金を含む）が10個を超えていたら、10個になるまで選んで返す
 * - 手番の終わりに、ボーナスが条件を満たした貴族が自動で訪れる（3点）。1手番に1人まで。複数なら選ぶ。断れない
 * - だれかが15点に達したら、その巡の終わり（最初の手番の人の前）まで続ける
 *   点数の多い人が勝ち。同点なら、買ったカードの少ない人が勝ち
 *
 * ルールブックに書かれていないので、次のように決めた
 * - 場に残っている宝石の色が3色に満たないときは、残っている色を1個ずつ（3色より少なく）取ってよい
 * - どの操作もできないときだけ、何もせずに手番を終えられる（パス）。全員が続けてパスしたら、その時点で終わる
 * - 同点で、買ったカードの数も同じなら、その全員を勝ちとする
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, NOBLES, COLORS, GOLD, TOKEN_COLORS, COLOR_NAMES } from './cards.js';

export { CARDS, NOBLES, COLORS, GOLD, TOKEN_COLORS, COLOR_NAMES };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const WIN_POINTS = 15;
export const TOKEN_LIMIT = 10;
export const RESERVE_LIMIT = 3;
export const GOLD_COUNT = 5;
export const GEMS_BY_PLAYERS = { 2: 4, 3: 5, 4: 7 };
export const BOARD_SLOTS = 4;
export const LEVELS = [1, 2, 3];
const MAX_LOGS = 200;
const MAX_EVENTS = 60;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { take: ['tokens'], reserve: ['card', 'level'], buy: ['card', 'payment'], pass: [], discard: ['tokens'], noble: ['noble'] };

export const emptyTokens = () => Object.fromEntries(TOKEN_COLORS.map(c => [c, 0]));
export const countTokens = (tokens) => TOKEN_COLORS.reduce((sum, c) => sum + (tokens[c] ?? 0), 0);
export const formatTokens = (tokens) => TOKEN_COLORS.filter(c => tokens[c] > 0).map(c => `${COLOR_NAMES[c]}${tokens[c]}`).join('・');

// プレイヤーの持ち物（ビューの形でもよい）から計算する道具。画面と CPU でも使う
export const bonusesOf = (player) => {
    const bonuses = Object.fromEntries(COLORS.map(c => [c, 0]));
    player.cards.forEach(id => { bonuses[CARDS[id].bonus]++; });
    return bonuses;
};
export const pointsOf = (player) => player.cards.reduce((sum, id) => sum + CARDS[id].points, 0) + player.nobles.length * NOBLES[0].points;

// カードを買うのに足りない宝石（黄金で埋める数）。ボーナスと手持ちの宝石を引いた残り
export function shortfall(player, card, bonuses = bonusesOf(player)) {
    return COLORS.reduce((sum, c) => sum + Math.max(0, card.cost[c] - bonuses[c] - player.tokens[c]), 0);
}

// 色の宝石を先に使い、足りない分を黄金で払う支払い。払えなければ null
export function autoPayment(player, card, bonuses = bonusesOf(player)) {
    const payment = emptyTokens();
    COLORS.forEach(c => {
        const need = Math.max(0, card.cost[c] - bonuses[c]);
        payment[c] = Math.min(need, player.tokens[c]);
        payment[GOLD] += need - payment[c];
    });
    return payment[GOLD] <= player.tokens[GOLD] ? payment : null;
}

export const canAfford = (player, card) => autoPayment(player, card) !== null;
export const nobleQualifies = (bonuses, noble) => COLORS.every(c => bonuses[c] >= noble.req[c]);

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// 端末から届いた宝石の組（{ white: 1, ... }）を検証して、6色そろった形にする。おかしければ null
export function parseTokens(value, colors = TOKEN_COLORS) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.keys(value).some(key => !colors.includes(key))) return null;
    const tokens = emptyTokens();
    for (const c of colors) {
        const n = value[c] ?? 0;
        if (!isInt(n, 0, TOKEN_LIMIT + 3)) return null;
        tokens[c] = n;
    }
    return tokens;
}

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const random = createRandom(seed);
        const gems = GEMS_BY_PLAYERS[players.length];

        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、山札の並びがずれないように）
        const drawn = Math.floor(random() * players.length);
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            tokens: emptyTokens(), cards: [], reserved: [], nobles: []
        }));
        this.bank = Object.fromEntries(TOKEN_COLORS.map(c => [c, c === GOLD ? GOLD_COUNT : gems]));
        this.decks = {};
        this.board = {};
        LEVELS.forEach(level => {
            this.decks[level] = shuffle(CARDS.filter(card => card.level === level).map(card => card.id), random);
            this.board[level] = this.decks[level].splice(0, BOARD_SLOTS);
        });
        this.nobles = shuffle(NOBLES.map(n => n.id), random).slice(0, players.length + 1);

        this.startPlayer = this.options.startPlayer;
        this.current = this.startPlayer;
        this.turn = 1;              // 何手番目か（1から）
        this.phase = 'action';      // action：操作を選ぶ / discard：宝石を返す / noble：貴族を選ぶ / end：終わり
        this.finalRound = false;    // だれかが15点に達して、最後の巡に入った
        this.passStreak = 0;
        this.nobleChoices = [];
        this.winners = [];
        this.endReason = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}の手番から始めます`);
    }

    get currentPlayer() {
        return this.players[this.current];
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作できる人（このゲームでは常に手番の人だけ）
    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            action: { take: this.take, reserve: this.reserve, buy: this.buy, pass: this.pass },
            discard: { discard: this.discard },
            noble: { noble: this.chooseNoble }
        }[this.phase]?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        const done = handler.call(this, playerId, command);
        if (!done) return false;
        // 記録するのは決まった項目だけ（端末から余計な項目が届いても残さない）
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 手番の操作 ----

    // { type: 'take', tokens: { white: 1, blue: 1, green: 1 } } か { tokens: { red: 2 } }
    take(seat, { tokens: value }) {
        const tokens = parseTokens(value, COLORS);
        if (!tokens) return this.fail('取る宝石が正しくありません');
        const picked = COLORS.filter(c => tokens[c] > 0);
        const total = countTokens(tokens);
        if (picked.length === 0) return this.fail('宝石を選んでください');
        if (picked.some(c => tokens[c] > this.bank[c])) return this.fail('場に残っていない宝石は取れません');
        if (picked.length === 1 && total === 2) {
            if (this.bank[picked[0]] < 4) return this.fail('同じ色を2個取れるのは、その色が4個以上残っているときだけです');
        } else {
            if (picked.some(c => tokens[c] !== 1)) return this.fail('違う色を1個ずつか、同じ色を2個取ります');
            const available = COLORS.filter(c => this.bank[c] > 0).length;
            if (picked.length !== Math.min(3, available)) return this.fail('違う色の宝石を3個取ります');
        }
        const player = this.players[seat];
        picked.forEach(c => { this.bank[c] -= tokens[c]; player.tokens[c] += tokens[c]; });
        this.passStreak = 0;
        this.emit({ type: 'take', seat, tokens: { ...tokens } });
        this.log(`${player.name}が宝石を取りました（${formatTokens(tokens)}）`);
        this.afterAction(seat);
        return true;
    }

    // { type: 'reserve', card: id }（場の表向きのカード）か { type: 'reserve', level: 1 }（山札の一番上を伏せたまま）
    reserve(seat, command) {
        const player = this.players[seat];
        if (player.reserved.length >= RESERVE_LIMIT) return this.fail(`予約できるのは${RESERVE_LIMIT}枚までです`);
        let cardId, from, hidden;
        if (command.card !== undefined) {
            from = this.findOnBoard(command.card);
            if (!from) return this.fail('そのカードは場にありません');
            cardId = command.card;
            hidden = false;
        } else {
            const level = command.level;
            if (!LEVELS.includes(level)) return this.fail('山札が正しくありません');
            if (this.decks[level].length === 0) return this.fail('その山札はもうありません');
            cardId = this.decks[level][0];
            from = { deck: level };
            hidden = true;
        }
        if (from.deck) this.decks[from.deck].shift();
        else this.board[from.level][from.slot] = null;
        player.reserved.push({ id: cardId, hidden });
        const gold = this.bank[GOLD] > 0;
        if (gold) {
            this.bank[GOLD]--;
            player.tokens[GOLD]++;
        }
        this.passStreak = 0;
        this.emit({ type: 'reserve', seat, card: cardId, hidden, level: CARDS[cardId].level, from, gold });
        if (!from.deck) this.refill(from.level, from.slot);
        this.log(`${player.name}が${hidden ? `山札（レベル${CARDS[cardId].level}）から` : 'カードを'}予約しました${gold ? '（黄金を1個）' : ''}`);
        this.afterAction(seat);
        return true;
    }

    // { type: 'buy', card: id, payment?: { white: 1, ..., gold: 1 } }。payment を省くと、色の宝石を先に使う
    buy(seat, command) {
        const player = this.players[seat];
        const cardId = command.card;
        const reservedIndex = player.reserved.findIndex(r => r.id === cardId);
        const from = reservedIndex >= 0 ? { reserved: true } : this.findOnBoard(cardId);
        if (!from) return this.fail('そのカードは買えません');
        const card = CARDS[cardId];
        const bonuses = bonusesOf(player);
        let payment;
        if (command.payment === undefined) {
            payment = autoPayment(player, card, bonuses);
            if (!payment) return this.fail('宝石が足りません');
        } else {
            payment = parseTokens(command.payment);
            if (!payment) return this.fail('支払いが正しくありません');
            if (TOKEN_COLORS.some(c => payment[c] > player.tokens[c])) return this.fail('持っていない宝石では払えません');
            const needs = COLORS.map(c => Math.max(0, card.cost[c] - bonuses[c]));
            if (COLORS.some((c, i) => payment[c] > needs[i])) return this.fail('必要より多くは払えません');
            const goldNeeded = COLORS.reduce((sum, c, i) => sum + needs[i] - payment[c], 0);
            if (payment[GOLD] !== goldNeeded) return this.fail('支払いの数が合いません');
        }
        TOKEN_COLORS.forEach(c => { player.tokens[c] -= payment[c]; this.bank[c] += payment[c]; });
        if (from.reserved) player.reserved.splice(reservedIndex, 1);
        else this.board[from.level][from.slot] = null;
        player.cards.push(cardId);
        this.passStreak = 0;
        this.emit({ type: 'buy', seat, card: cardId, from, payment: { ...payment } });
        if (!from.reserved) this.refill(from.level, from.slot);
        this.log(`${player.name}がカードを買いました（${COLOR_NAMES[card.bonus]}${card.points > 0 ? `・${card.points}点` : ''}）`);
        this.afterAction(seat);
        return true;
    }

    // どの操作もできないときだけ、何もせずに手番を終える
    pass(seat) {
        if (this.hasAnyAction(seat)) return this.fail('できる操作があるときは、パスできません');
        this.passStreak++;
        this.emit({ type: 'pass', seat });
        this.log(`${this.players[seat].name}はできることがなく、パスしました`);
        this.afterAction(seat);
        return true;
    }

    // 手番の終わり：10個を超えた分を返す。{ type: 'discard', tokens: { red: 1 } }
    discard(seat, { tokens: value }) {
        const player = this.players[seat];
        const tokens = parseTokens(value);
        if (!tokens) return this.fail('返す宝石が正しくありません');
        const excess = countTokens(player.tokens) - TOKEN_LIMIT;
        if (countTokens(tokens) !== excess) return this.fail(`宝石を${excess}個返してください`);
        if (TOKEN_COLORS.some(c => tokens[c] > player.tokens[c])) return this.fail('持っていない宝石は返せません');
        TOKEN_COLORS.forEach(c => { player.tokens[c] -= tokens[c]; this.bank[c] += tokens[c]; });
        this.emit({ type: 'discard', seat, tokens: { ...tokens } });
        this.log(`${player.name}が宝石を返しました（${formatTokens(tokens)}）`);
        this.checkNobles(seat);
        return true;
    }

    // 手番の終わり：訪れる貴族が複数いるときに選ぶ。{ type: 'noble', noble: id }
    chooseNoble(seat, { noble }) {
        if (!this.nobleChoices.includes(noble)) return this.fail('その貴族は選べません');
        this.receiveNoble(seat, noble);
        this.finishTurn(seat);
        return true;
    }

    // ---- 手番の終わりの処理 ----

    afterAction(seat) {
        if (countTokens(this.players[seat].tokens) > TOKEN_LIMIT) {
            this.phase = 'discard';
            return;
        }
        this.checkNobles(seat);
    }

    checkNobles(seat) {
        const bonuses = bonusesOf(this.players[seat]);
        const eligible = this.nobles.filter(id => nobleQualifies(bonuses, NOBLES[id]));
        if (eligible.length > 1) {
            this.phase = 'noble';
            this.nobleChoices = eligible;
            return;
        }
        if (eligible.length === 1) this.receiveNoble(seat, eligible[0]);
        this.finishTurn(seat);
    }

    receiveNoble(seat, nobleId) {
        this.nobles = this.nobles.filter(id => id !== nobleId);
        this.players[seat].nobles.push(nobleId);
        this.nobleChoices = [];
        this.emit({ type: 'noble', seat, noble: nobleId });
        this.log(`貴族が${this.players[seat].name}を訪れました（${NOBLES[nobleId].points}点）`);
    }

    finishTurn(seat) {
        if (!this.finalRound && pointsOf(this.players[seat]) >= WIN_POINTS) {
            this.finalRound = true;
            this.log(`${this.players[seat].name}が${WIN_POINTS}点に達しました。この巡で終わりです`);
        }
        const next = (seat + 1) % this.players.length;
        if (this.finalRound && next === this.startPlayer) return this.endGame('points');
        if (this.passStreak >= this.players.length) return this.endGame('stalled');
        this.current = next;
        this.turn++;
        this.phase = 'action';
        this.emit({ type: 'turn', seat: next });
    }

    endGame(reason) {
        this.phase = 'end';
        this.endReason = reason;
        const scores = this.players.map(p => ({ id: p.id, points: pointsOf(p), cards: p.cards.length }));
        const best = Math.max(...scores.map(s => s.points));
        const top = scores.filter(s => s.points === best);
        const fewest = Math.min(...top.map(s => s.cards));
        this.winners = top.filter(s => s.cards === fewest).map(s => s.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        if (reason === 'stalled') this.log('全員ができることがなくなったので、ここで終わります');
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
    }

    // ---- 道具 ----

    findOnBoard(cardId) {
        for (const level of LEVELS) {
            const slot = this.board[level].indexOf(cardId);
            if (slot >= 0 && cardId !== null) return { level, slot };
        }
        return null;
    }

    // 空いた場所を山札から補充する。山札がなければ空いたまま
    refill(level, slot) {
        if (this.decks[level].length === 0) return;
        const card = this.decks[level].shift();
        this.board[level][slot] = card;
        this.emit({ type: 'refill', level, slot, card });
    }

    boardCards() {
        return LEVELS.flatMap(level => this.board[level].filter(id => id !== null));
    }

    // 手番の操作（パス以外）が1つでもできるか
    hasAnyAction(seat) {
        const player = this.players[seat];
        if (COLORS.some(c => this.bank[c] > 0)) return true;
        if (player.reserved.length < RESERVE_LIMIT && (this.boardCards().length > 0 || LEVELS.some(l => this.decks[l].length > 0))) return true;
        return [...this.boardCards(), ...player.reserved.map(r => r.id)].some(id => canAfford(player, CARDS[id]));
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
