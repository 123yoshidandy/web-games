/**
 * 宝石の煌き デュエルのゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並び・袋から出る順はシードから決まる）
 *
 * ルール（2人用）
 * - 準備: トークン25個（宝石5色×4・パール2・黄金3）を袋で混ぜ、5×5 の盤に中央かららせんの順に置く
 *         カードは段ごとに混ぜ、1段目5枚・2段目4枚・3段目3枚を表にする。王族のカード4枚を並べる
 *         特権の巻物は3枚。後手の人が最初に1枚持つ
 * - 手番: 任意の行動（この順で、しなくてもよい）→ 必須の行動を1つ → 能力 → 10個を超えた分を返す → 勝ちの判定
 *   任意1. 特権を使う：特権1枚につき、盤の宝石かパールを1個取る（黄金は取れない）
 *   任意2. 盤を補充する：袋のトークンを混ぜ、空いたマスに中央かららせんの順に置く。相手が特権を1枚得る
 *   必須1. トークンを取る：縦・横・斜めにすき間なく連なる1〜3個（黄金は取れない）
 *          同じ色を3個、またはパールを2個取ったら、相手が特権を1枚得る
 *   必須2. 黄金を1個取り、カードを1枚予約する（場の表のカードか、山札の一番上を伏せたまま。予約は3枚まで。盤に黄金がなければできない）
 *   必須3. 場か予約したカードを1枚買う（ボーナスの分だけ安くなる。パールはボーナスで安くならない。黄金はどの色の代わりにもなる）
 *   必須の行動ができないときは、先に盤を補充する
 * - 能力: もう一度（この手番のあとにもう1手番）・同じ色を取る（盤から、カードの色のトークンを1個）・特権・盗む（相手の宝石かパールを1個）
 *         色なしのカードは、持っているボーナスの色を1つ写す（ボーナスのカードを持っていないと買えない）
 * - 特権を得るとき、巻物が残っていなければ相手から取る（相手も持っていなければ何もない）
 * - 王冠が3つ目・6つ目になったとき、王族のカードを1枚取る（点と能力がある。行動には数えない）
 * - 能力は「色を写す → カードの能力 → 王族のカードを取り、その能力」の順に行う
 * - 手番の終わりに、20点・王冠10個・同じ色のカードで10点のどれかに達していたら、その場で勝ち
 *
 * ルールブックに書かれていないので、次のように決めた
 * - 盤のらせんは、中央から上へ出て時計回りに回る順
 * - 「もう一度」が同じ手番に重なったら、その数だけ続けて手番を行う
 * - 必須の行動ができず、袋も空で補充もできないときは、何もせずに手番を終える（パス）。2人が続けてパスしたら、点の多い人の勝ち（同じなら引き分け）
 * - 能力の選択肢が1つしかないとき（取れるトークンが1個だけ、など）は、自動で選ぶ
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, ROYALS, COLORS, PEARL, GOLD, GEM_AND_PEARL, TOKEN_COLORS, COLOR_NAMES, ABILITY_NAMES } from './cards.js';

export { CARDS, ROYALS, COLORS, PEARL, GOLD, GEM_AND_PEARL, TOKEN_COLORS, COLOR_NAMES, ABILITY_NAMES };

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const TOKEN_LIMIT = 10;
export const RESERVE_LIMIT = 3;
export const PRIVILEGE_COUNT = 3;
export const TOKEN_SUPPLY = { white: 4, blue: 4, green: 4, red: 4, black: 4, pearl: 2, gold: 3 };
export const PYRAMID = { 1: 5, 2: 4, 3: 3 };
export const LEVELS = [1, 2, 3];
export const WIN_POINTS = 20;
export const WIN_CROWNS = 10;
export const WIN_COLOR_POINTS = 10;
export const ROYAL_CROWNS = [3, 6];
const MAX_LOGS = 200;
const MAX_EVENTS = 60;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    privilege: ['cell'], replenish: [], take: ['cells'], reserve: ['card', 'level', 'gold'], buy: ['card', 'payment'], pass: [],
    wild: ['color'], token: ['cell'], steal: ['color'], royal: ['royal'], discard: ['tokens']
};

// 盤のらせん：中央から上へ出て、時計回りに外へ回る。マスの番号は 行×5＋列
export const SPIRAL = (() => {
    const order = [];
    let r = 2, c = 2;
    order.push(r * SIZE + c);
    const dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    let len = 1, d = 0;
    while (order.length < CELLS) {
        for (let rep = 0; rep < 2 && order.length < CELLS; rep++) {
            for (let i = 0; i < len && order.length < CELLS; i++) {
                r += dirs[d][0];
                c += dirs[d][1];
                order.push(r * SIZE + c);
            }
            d = (d + 1) % 4;
        }
        len++;
    }
    return order;
})();

export const emptyTokens = () => Object.fromEntries(TOKEN_COLORS.map(c => [c, 0]));
export const countTokens = (tokens) => TOKEN_COLORS.reduce((sum, c) => sum + (tokens[c] ?? 0), 0);
export const formatTokens = (tokens) => TOKEN_COLORS.filter(c => tokens[c] > 0).map(c => `${COLOR_NAMES[c]}${tokens[c]}`).join('・');
export const isGemOrPearl = (token) => GEM_AND_PEARL.includes(token);

// ---- プレイヤーの持ち物（ビューの形でもよい）から計算する道具。画面と CPU でも使う ----

// 持っているカードの色（色なしのカードは写した色）
export const cardColorOf = (owned) => owned.color ?? CARDS[owned.id].color;

export function bonusesOf(player) {
    const bonuses = Object.fromEntries(COLORS.map(c => [c, 0]));
    player.cards.forEach(owned => {
        const color = cardColorOf(owned);
        if (COLORS.includes(color)) bonuses[color] += CARDS[owned.id].bonus;
    });
    return bonuses;
}

export const pointsOf = (player) => player.cards.reduce((sum, owned) => sum + CARDS[owned.id].points, 0)
    + player.royals.reduce((sum, id) => sum + ROYALS[id].points, 0);
export const crownsOf = (player) => player.cards.reduce((sum, owned) => sum + CARDS[owned.id].crowns, 0);

// 色ごとのカードの点（同じ色のカードで10点の勝ち）
export function colorPointsOf(player) {
    const points = Object.fromEntries(COLORS.map(c => [c, 0]));
    player.cards.forEach(owned => {
        const color = cardColorOf(owned);
        if (COLORS.includes(color)) points[color] += CARDS[owned.id].points;
    });
    return points;
}

// 色ごとに払う数（ボーナスを引いた残り）。パールはボーナスで安くならない
export function needOf(card, bonuses) {
    const need = Object.fromEntries(COLORS.map(c => [c, Math.max(0, card.cost[c] - bonuses[c])]));
    need[PEARL] = card.cost[PEARL];
    return need;
}

// 色のトークンを先に使い、足りない分を黄金で払う支払い。払えなければ null
export function autoPayment(player, card, bonuses = bonusesOf(player)) {
    const need = needOf(card, bonuses);
    const payment = emptyTokens();
    GEM_AND_PEARL.forEach(c => {
        payment[c] = Math.min(need[c], player.tokens[c]);
        payment[GOLD] += need[c] - payment[c];
    });
    return payment[GOLD] <= player.tokens[GOLD] ? payment : null;
}

// 色なしのカードは、ボーナスのある色のカードを持っていないと買えない
export const hasBonusCard = (player) => player.cards.some(owned => COLORS.includes(cardColorOf(owned)));
export const canAfford = (player, card) => (card.color !== 'wild' || hasBonusCard(player)) && autoPayment(player, card) !== null;

// ---- 盤の道具 ----

export const cellRow = (cell) => Math.floor(cell / SIZE);
export const cellCol = (cell) => cell % SIZE;
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// 取れる連なり（1〜3個）をすべて列挙する。各連なりはマスの番号の配列（並びの順）
export function takeLines(board) {
    const lines = [];
    for (let cell = 0; cell < CELLS; cell++) {
        if (!isGemOrPearl(board[cell])) continue;
        lines.push([cell]);
        DIRECTIONS.forEach(([dr, dc]) => {
            const line = [cell];
            for (let i = 1; i < 3; i++) {
                const r = cellRow(cell) + dr * i, c = cellCol(cell) + dc * i;
                if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) break;
                const next = r * SIZE + c;
                if (!isGemOrPearl(board[next])) break;
                line.push(next);
                lines.push([...line]);
            }
        });
    }
    return lines;
}

// 選んだマスが、すき間のない1本の連なりか（並びの順は問わない）。連なりなら並べ直した配列、違えば null
export function asLine(cells) {
    if (cells.length === 1) return [...cells];
    const sorted = [...cells].sort((a, b) => a - b);
    const dr = cellRow(sorted[1]) - cellRow(sorted[0]);
    const dc = cellCol(sorted[1]) - cellCol(sorted[0]);
    if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (dr === 0 && dc === 0)) return null;
    for (let i = 1; i < sorted.length; i++) {
        if (cellRow(sorted[i]) - cellRow(sorted[i - 1]) !== dr || cellCol(sorted[i]) - cellCol(sorted[i - 1]) !== dc) return null;
    }
    return sorted;
}

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// 端末から届いたトークンの組（{ white: 1, ... }）を検証して、7色そろった形にする。おかしければ null
export function parseTokens(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.keys(value).some(key => !TOKEN_COLORS.includes(key))) return null;
    const tokens = emptyTokens();
    for (const c of TOKEN_COLORS) {
        const n = value[c] ?? 0;
        if (!isInt(n, 0, 25)) return null;
        tokens[c] = n;
    }
    return tokens;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length !== 2) throw new Error('2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * 2);
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            tokens: emptyTokens(), cards: [], reserved: [], royals: [], privileges: 0
        }));
        this.decks = {};
        this.pyramid = {};
        LEVELS.forEach(level => {
            this.decks[level] = shuffle(CARDS.filter(card => card.level === level).map(card => card.id), this.random);
            this.pyramid[level] = this.decks[level].splice(0, PYRAMID[level]);
        });
        this.royals = ROYALS.map(r => r.id);
        // 袋に全部入れて、らせんの順に置く
        this.bag = { ...TOKEN_SUPPLY };
        this.board = Array(CELLS).fill(null);
        this.fillBoard();

        this.startPlayer = this.options.startPlayer;
        this.current = this.startPlayer;
        this.privileges = PRIVILEGE_COUNT;
        this.gainPrivilege(1 - this.startPlayer, { silent: true });
        this.turn = 1;              // 何手番目か（1から。もう一度の手番も数える）
        this.phase = 'main';        // main：任意と必須の行動 / choose：能力の選択 / discard：トークンを返す / end：終わり
        this.replenished = false;   // この手番で補充した（そのあとは特権を使えない）
        this.pending = [];          // 解決を待つ能力（{ type: 'wild' | 'token' | 'steal' | 'royal', ... }）
        this.extraTurns = 0;
        this.passStreak = 0;
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

    opponentOf(seat) {
        return 1 - seat;
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
        const handlers = {
            main: { privilege: this.usePrivilege, replenish: this.replenish, take: this.take, reserve: this.reserve, buy: this.buy, pass: this.pass },
            choose: { wild: this.chooseWild, token: this.chooseToken, steal: this.chooseSteal, royal: this.chooseRoyal },
            discard: { discard: this.discard }
        }[this.phase];
        const handler = handlers?.[command.type];
        if (!handler) return this.fail('今はその操作はできません');
        if (this.phase === 'choose' && this.pending[0]?.type !== command.type) return this.fail('今はその操作はできません');
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

    // ---- 任意の行動 ----

    // 特権を1枚使って、盤の宝石かパールを1個取る。{ type: 'privilege', cell }
    usePrivilege(seat, { cell }) {
        const player = this.players[seat];
        if (player.privileges <= 0) return this.fail('特権を持っていません');
        if (this.replenished) return this.fail('補充したあとは特権を使えません');
        if (!isInt(cell, 0, CELLS - 1) || !isGemOrPearl(this.board[cell])) return this.fail('そのマスの宝石は取れません');
        const color = this.board[cell];
        player.privileges--;
        this.privileges++;
        this.board[cell] = null;
        player.tokens[color]++;
        this.emit({ type: 'privilege', seat, cell, color });
        this.log(`${player.name}が特権を使い、${COLOR_NAMES[color]}を取りました`);
        return true;
    }

    // 袋のトークンを盤に補充する。相手が特権を1枚得る。{ type: 'replenish' }
    replenish(seat) {
        if (countTokens(this.bag) === 0) return this.fail('袋が空なので補充できません');
        if (!this.board.includes(null)) return this.fail('盤に空いたマスがありません');
        const placed = this.fillBoard();
        this.replenished = true;
        this.emit({ type: 'replenish', seat, placed });
        this.log(`${this.players[seat].name}が盤を補充しました`);
        this.gainPrivilege(this.opponentOf(seat));
        return true;
    }

    // ---- 必須の行動 ----

    // { type: 'take', cells: [マスの番号, ...] }（縦・横・斜めにすき間なく連なる1〜3個）
    take(seat, { cells }) {
        if (!Array.isArray(cells) || cells.length < 1 || cells.length > 3) return this.fail('取るトークンを1〜3個選んでください');
        if (cells.some(cell => !isInt(cell, 0, CELLS - 1)) || new Set(cells).size !== cells.length) return this.fail('取るトークンが正しくありません');
        if (cells.some(cell => this.board[cell] === GOLD)) return this.fail('黄金はこの方法では取れません');
        if (cells.some(cell => !isGemOrPearl(this.board[cell]))) return this.fail('空いたマスは選べません');
        const line = asLine(cells);
        if (!line) return this.fail('縦・横・斜めにすき間なく並んだトークンを選んでください');
        const player = this.players[seat];
        const colors = line.map(cell => this.board[cell]);
        line.forEach(cell => { this.board[cell] = null; });
        colors.forEach(c => { player.tokens[c]++; });
        this.passStreak = 0;
        this.emit({ type: 'take', seat, cells: line, colors });
        this.log(`${player.name}が${colors.map(c => COLOR_NAMES[c]).join('・')}を取りました`);
        const sameThree = colors.length === 3 && colors.every(c => c === colors[0]);
        const twoPearls = colors.filter(c => c === PEARL).length >= 2;
        if (sameThree || twoPearls) this.gainPrivilege(this.opponentOf(seat));
        this.afterMandatory(seat);
        return true;
    }

    // { type: 'reserve', card: id, gold?: cell }（場の表のカード）か { type: 'reserve', level: 1, gold?: cell }（山札の一番上）
    // gold を省くと、盤の最初の黄金を取る
    reserve(seat, command) {
        const player = this.players[seat];
        if (player.reserved.length >= RESERVE_LIMIT) return this.fail(`予約できるのは${RESERVE_LIMIT}枚までです`);
        const goldCell = command.gold ?? this.board.indexOf(GOLD);
        if (!isInt(goldCell, 0, CELLS - 1) || this.board[goldCell] !== GOLD) {
            return this.fail(this.board.includes(GOLD) ? 'そのマスに黄金はありません' : '盤に黄金がないので予約できません');
        }
        let cardId, from, hidden;
        if (command.card !== undefined) {
            from = this.findInPyramid(command.card);
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
        else this.pyramid[from.level][from.slot] = null;
        player.reserved.push({ id: cardId, hidden });
        this.board[goldCell] = null;
        player.tokens[GOLD]++;
        this.passStreak = 0;
        this.emit({ type: 'reserve', seat, card: cardId, hidden, level: CARDS[cardId].level, from, gold: goldCell });
        if (!from.deck) this.refill(from.level, from.slot);
        this.log(`${player.name}が${hidden ? `山札（${CARDS[cardId].level}段目）から` : 'カードを'}予約し、黄金を取りました`);
        this.afterMandatory(seat);
        return true;
    }

    // { type: 'buy', card: id, payment?: { white: 1, ..., gold: 1 } }。payment を省くと、色のトークンを先に使う
    buy(seat, command) {
        const player = this.players[seat];
        const cardId = command.card;
        const reservedIndex = player.reserved.findIndex(r => r.id === cardId);
        const from = reservedIndex >= 0 ? { reserved: true } : this.findInPyramid(cardId);
        if (!from) return this.fail('そのカードは買えません');
        const card = CARDS[cardId];
        if (card.color === 'wild' && !hasBonusCard(player)) return this.fail('色なしのカードは、ボーナスのカードを持っていないと買えません');
        const bonuses = bonusesOf(player);
        let payment;
        if (command.payment === undefined) {
            payment = autoPayment(player, card, bonuses);
            if (!payment) return this.fail('トークンが足りません');
        } else {
            payment = parseTokens(command.payment);
            if (!payment) return this.fail('支払いが正しくありません');
            if (TOKEN_COLORS.some(c => payment[c] > player.tokens[c])) return this.fail('持っていないトークンでは払えません');
            const need = needOf(card, bonuses);
            if (GEM_AND_PEARL.some(c => payment[c] > need[c])) return this.fail('必要より多くは払えません');
            const goldNeeded = GEM_AND_PEARL.reduce((sum, c) => sum + need[c] - payment[c], 0);
            if (payment[GOLD] !== goldNeeded) return this.fail('支払いの数が合いません');
        }
        const crownsBefore = crownsOf(player);
        TOKEN_COLORS.forEach(c => { player.tokens[c] -= payment[c]; this.bag[c] += payment[c]; });
        if (from.reserved) player.reserved.splice(reservedIndex, 1);
        else this.pyramid[from.level][from.slot] = null;
        const owned = { id: cardId, color: card.color === 'wild' ? null : card.color };
        player.cards.push(owned);
        this.passStreak = 0;
        this.emit({ type: 'buy', seat, card: cardId, from, payment: { ...payment } });
        if (!from.reserved) this.refill(from.level, from.slot);
        const label = card.color && card.color !== 'wild' ? COLOR_NAMES[card.color] : '色なし';
        this.log(`${player.name}がカードを買いました（${label}${card.points > 0 ? `・${card.points}点` : ''}${card.crowns > 0 ? `・王冠${card.crowns}` : ''}）`);

        // 能力：色を写す → カードの能力 → 王冠で王族のカード
        if (card.color === 'wild') this.pending.push({ type: 'wild', card: cardId });
        if (card.ability === 'turn') this.extraTurns++;
        if (card.ability === 'token') this.pending.push({ type: 'token', color: card.color });
        if (card.ability === 'privilege') this.pending.push({ type: 'gainPrivilege' });
        if (card.ability === 'steal') this.pending.push({ type: 'steal' });
        const crownsAfter = crownsOf(player);
        ROYAL_CROWNS.forEach(n => { if (crownsBefore < n && crownsAfter >= n) this.pending.push({ type: 'royal' }); });
        this.afterMandatory(seat);
        return true;
    }

    // 必須の行動ができず、補充もできないときだけ、何もせずに手番を終える
    pass(seat) {
        if (this.hasMandatoryAction(seat)) return this.fail('できる行動があるときは、パスできません');
        if (countTokens(this.bag) > 0 && this.board.includes(null)) return this.fail('先に盤を補充してください');
        this.passStreak++;
        this.emit({ type: 'pass', seat });
        this.log(`${this.players[seat].name}はできることがなく、パスしました`);
        this.afterMandatory(seat);
        return true;
    }

    // ---- 能力の選択 ----

    // 色なしのカードに写す色。{ type: 'wild', color }
    chooseWild(seat, { color }) {
        if (!this.optionsFor(seat, this.pending[0]).includes(color)) return this.fail('その色は写せません');
        this.resolveWild(seat, color);
        this.resolvePending(seat);
        return true;
    }

    // 「同じ色を取る」で取るマス。{ type: 'token', cell }
    chooseToken(seat, { cell }) {
        if (!this.optionsFor(seat, this.pending[0]).includes(cell)) return this.fail('そのマスは選べません');
        this.resolveToken(seat, cell);
        this.resolvePending(seat);
        return true;
    }

    // 相手から盗む色。{ type: 'steal', color }
    chooseSteal(seat, { color }) {
        if (!this.optionsFor(seat, this.pending[0]).includes(color)) return this.fail('その色は盗めません');
        this.resolveSteal(seat, color);
        this.resolvePending(seat);
        return true;
    }

    // 取る王族のカード。{ type: 'royal', royal: id }
    chooseRoyal(seat, { royal }) {
        if (!this.optionsFor(seat, this.pending[0]).includes(royal)) return this.fail('その王族のカードは取れません');
        this.resolveRoyal(seat, royal);
        this.resolvePending(seat);
        return true;
    }

    // 選べるもの（色・マス・王族のカードの id）の一覧
    optionsFor(seat, item) {
        if (!item) return [];
        const player = this.players[seat];
        if (item.type === 'wild') return COLORS.filter(c => player.cards.some(owned => owned.id !== item.card && cardColorOf(owned) === c));
        if (item.type === 'token') return this.board.map((t, cell) => (t === item.color ? cell : -1)).filter(cell => cell >= 0);
        if (item.type === 'steal') return GEM_AND_PEARL.filter(c => this.players[this.opponentOf(seat)].tokens[c] > 0);
        if (item.type === 'royal') return [...this.royals];
        return [];
    }

    // 選択の要らない能力と、選択肢が1つ以下の能力を進める。選ぶ必要があれば choose で止まる
    resolvePending(seat) {
        while (this.pending.length > 0) {
            const item = this.pending[0];
            if (item.type === 'gainPrivilege') {
                this.pending.shift();
                this.gainPrivilege(seat);
                continue;
            }
            const options = this.optionsFor(seat, item);
            if (options.length > 1) {
                this.phase = 'choose';
                return;
            }
            if (options.length === 0) {
                this.pending.shift();
                this.log(item.type === 'token' ? `盤に${COLOR_NAMES[item.color]}がないので、取れませんでした`
                    : item.type === 'steal' ? '相手が宝石もパールも持っていないので、盗めませんでした'
                        : item.type === 'royal' ? '王族のカードが残っていません' : '');
                continue;
            }
            const choice = options[0];
            if (item.type === 'wild') this.resolveWild(seat, choice);
            if (item.type === 'token') this.resolveToken(seat, choice);
            if (item.type === 'steal') this.resolveSteal(seat, choice);
            if (item.type === 'royal') this.resolveRoyal(seat, choice);
        }
        this.endOfTurn(seat);
    }

    resolveWild(seat, color) {
        const item = this.pending.shift();
        const owned = this.players[seat].cards.find(o => o.id === item.card);
        owned.color = color;
        this.emit({ type: 'wild', seat, card: item.card, color });
        this.log(`${this.players[seat].name}が色なしのカードを${COLOR_NAMES[color]}にしました`);
    }

    resolveToken(seat, cell) {
        this.pending.shift();
        const color = this.board[cell];
        this.board[cell] = null;
        this.players[seat].tokens[color]++;
        this.emit({ type: 'ability-token', seat, cell, color });
        this.log(`${this.players[seat].name}が能力で${COLOR_NAMES[color]}を取りました`);
    }

    resolveSteal(seat, color) {
        this.pending.shift();
        const opponent = this.players[this.opponentOf(seat)];
        opponent.tokens[color]--;
        this.players[seat].tokens[color]++;
        this.emit({ type: 'steal', seat, from: opponent.id, color });
        this.log(`${this.players[seat].name}が${opponent.name}から${COLOR_NAMES[color]}を盗みました`);
    }

    resolveRoyal(seat, royalId) {
        this.pending.shift();
        const player = this.players[seat];
        this.royals = this.royals.filter(id => id !== royalId);
        player.royals.push(royalId);
        const royal = ROYALS[royalId];
        this.emit({ type: 'royal', seat, royal: royalId });
        this.log(`${player.name}が王族のカードを取りました（${royal.points}点${royal.ability ? `・${ABILITY_NAMES[royal.ability]}` : ''}）`);
        // 王族のカードの能力は、残りの能力より先に行う
        if (royal.ability === 'turn') this.extraTurns++;
        if (royal.ability === 'privilege') this.pending.unshift({ type: 'gainPrivilege' });
        if (royal.ability === 'steal') this.pending.unshift({ type: 'steal' });
    }

    // ---- 手番の終わり ----

    afterMandatory(seat) {
        this.resolvePending(seat);
    }

    // 手番の終わり：10個を超えた分を返す。{ type: 'discard', tokens: { red: 1 } }
    discard(seat, { tokens: value }) {
        const player = this.players[seat];
        const tokens = parseTokens(value);
        if (!tokens) return this.fail('返すトークンが正しくありません');
        const excess = countTokens(player.tokens) - TOKEN_LIMIT;
        if (countTokens(tokens) !== excess) return this.fail(`トークンを${excess}個返してください`);
        if (TOKEN_COLORS.some(c => tokens[c] > player.tokens[c])) return this.fail('持っていないトークンは返せません');
        TOKEN_COLORS.forEach(c => { player.tokens[c] -= tokens[c]; this.bag[c] += tokens[c]; });
        this.emit({ type: 'discard', seat, tokens: { ...tokens } });
        this.log(`${player.name}がトークンを袋に返しました（${formatTokens(tokens)}）`);
        this.endOfTurn(seat);
        return true;
    }

    endOfTurn(seat) {
        if (countTokens(this.players[seat].tokens) > TOKEN_LIMIT) {
            this.phase = 'discard';
            return;
        }
        const reason = this.victoryOf(this.players[seat]);
        if (reason) return this.endGame(reason, [seat]);
        if (this.passStreak >= 2) return this.endStalled();
        let next = this.opponentOf(seat);
        if (this.extraTurns > 0) {
            this.extraTurns--;
            next = seat;
            this.log(`${this.players[seat].name}がもう一度手番を行います`);
        }
        this.current = next;
        this.turn++;
        this.phase = 'main';
        this.replenished = false;
        this.emit({ type: 'turn', seat: next });
    }

    // 勝ちの条件に達していれば、その理由（points・crowns・color）
    victoryOf(player) {
        if (pointsOf(player) >= WIN_POINTS) return 'points';
        if (crownsOf(player) >= WIN_CROWNS) return 'crowns';
        if (Object.values(colorPointsOf(player)).some(p => p >= WIN_COLOR_POINTS)) return 'color';
        return null;
    }

    endGame(reason, winners) {
        this.phase = 'end';
        this.endReason = reason;
        this.winners = winners;
        this.pending = [];
        this.extraTurns = 0;
        this.emit({ type: 'end', winners: [...winners], reason });
        const text = { points: `${WIN_POINTS}点に達しました`, crowns: `王冠が${WIN_CROWNS}個になりました`, color: `同じ色のカードで${WIN_COLOR_POINTS}点に達しました`, stalled: '2人とも何もできなくなりました' }[reason];
        this.log(text);
        this.log(winners.length === 1 ? `${this.players[winners[0]].name}の勝ちです` : '引き分けです');
    }

    endStalled() {
        const [a, b] = this.players.map(pointsOf);
        this.endGame('stalled', a === b ? [0, 1] : [a > b ? 0 : 1]);
    }

    // ---- 道具 ----

    // 特権を1枚得る。巻物が残っていなければ相手から取る
    gainPrivilege(seat, { silent = false } = {}) {
        const player = this.players[seat];
        const opponent = this.players[this.opponentOf(seat)];
        let from = null;
        if (this.privileges > 0) {
            this.privileges--;
            from = 'pool';
        } else if (opponent.privileges > 0) {
            opponent.privileges--;
            from = 'opponent';
        } else {
            return;
        }
        player.privileges++;
        if (silent) return;
        this.emit({ type: 'gain-privilege', seat, from });
        this.log(`${player.name}が特権を1枚得ました${from === 'opponent' ? '（相手から）' : ''}`);
    }

    // 袋の中身を混ぜ、空いたマスにらせんの順に置く。置いた [{ cell, color }]
    fillBoard() {
        const tokens = shuffle(TOKEN_COLORS.flatMap(c => Array(this.bag[c]).fill(c)), this.random);
        const placed = [];
        for (const cell of SPIRAL) {
            if (tokens.length === 0) break;
            if (this.board[cell] !== null) continue;
            const color = tokens.shift();
            this.board[cell] = color;
            this.bag[color]--;
            placed.push({ cell, color });
        }
        return placed;
    }

    findInPyramid(cardId) {
        if (cardId === null || cardId === undefined) return null;
        for (const level of LEVELS) {
            const slot = this.pyramid[level].indexOf(cardId);
            if (slot >= 0) return { level, slot };
        }
        return null;
    }

    // 空いた場所を山札から補充する。山札がなければ空いたまま
    refill(level, slot) {
        if (this.decks[level].length === 0) return;
        const card = this.decks[level].shift();
        this.pyramid[level][slot] = card;
        this.emit({ type: 'refill', level, slot, card });
    }

    pyramidCards() {
        return LEVELS.flatMap(level => this.pyramid[level].filter(id => id !== null));
    }

    // 必須の行動が1つでもできるか
    hasMandatoryAction(seat) {
        const player = this.players[seat];
        if (this.board.some(isGemOrPearl)) return true;
        if (this.board.includes(GOLD) && player.reserved.length < RESERVE_LIMIT
            && (this.pyramidCards().length > 0 || LEVELS.some(l => this.decks[l].length > 0))) return true;
        return [...this.pyramidCards(), ...player.reserved.map(r => r.id)].some(id => canAfford(player, CARDS[id]));
    }

    // 今の手番の人ができる操作の一覧（テストと CPU の候補に使う）
    // 黄金のマスは最初の1つだけ、支払いは自動、返すトークンは多い色からの1通りだけに絞る
    legalCommands() {
        const seat = this.current;
        const player = this.players[seat];
        if (this.phase === 'end') return [];
        if (this.phase === 'choose') {
            const item = this.pending[0];
            const key = { wild: 'color', token: 'cell', steal: 'color', royal: 'royal' }[item.type];
            return this.optionsFor(seat, item).map(value => ({ type: item.type, [key]: value }));
        }
        if (this.phase === 'discard') {
            let excess = countTokens(player.tokens) - TOKEN_LIMIT;
            const tokens = {};
            const left = { ...player.tokens };
            while (excess > 0) {
                const color = TOKEN_COLORS.filter(c => left[c] > 0).sort((a, b) => left[b] - left[a])[0];
                left[color]--;
                tokens[color] = (tokens[color] ?? 0) + 1;
                excess--;
            }
            return [{ type: 'discard', tokens }];
        }
        const commands = [];
        if (player.privileges > 0 && !this.replenished) {
            this.board.forEach((t, cell) => { if (isGemOrPearl(t)) commands.push({ type: 'privilege', cell }); });
        }
        if (countTokens(this.bag) > 0 && this.board.includes(null)) commands.push({ type: 'replenish' });
        takeLines(this.board).forEach(cells => commands.push({ type: 'take', cells }));
        const gold = this.board.indexOf(GOLD);
        if (gold >= 0 && player.reserved.length < RESERVE_LIMIT) {
            this.pyramidCards().forEach(card => commands.push({ type: 'reserve', card, gold }));
            LEVELS.forEach(level => { if (this.decks[level].length > 0) commands.push({ type: 'reserve', level, gold }); });
        }
        [...this.pyramidCards(), ...player.reserved.map(r => r.id)].forEach(card => {
            if (canAfford(player, CARDS[card])) commands.push({ type: 'buy', card });
        });
        if (!this.hasMandatoryAction(seat) && !commands.some(c => c.type === 'replenish')) commands.push({ type: 'pass' });
        return commands;
    }

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(text) {
        if (!text) return;
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
