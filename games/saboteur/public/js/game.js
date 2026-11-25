/**
 * お邪魔者（Saboteur）の基本ゲームの進行（3〜10人）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（役割・山札・金塊の並びはシードから決まる）
 *
 * ルール
 * - 人数ごとの役割（お邪魔者・金鉱掘り）のカードを人数+1枚混ぜて1枚ずつ配る（1枚は使わない）。自分の役割は自分だけが知る
 * - 道のカード40枚とアクションカード27枚を切り、人数ごとの枚数（3〜5人6枚・6〜7人5枚・8〜10人4枚）を配る
 * - 盤面：スタートと、8マス右の列に伏せたゴール3枚（1枚が金）
 * - 手番には1枚を出すか、1枚を伏せて捨てる（パス）。そのあと山札があれば1枚引く
 *   - 道：隣のカードとすべての辺が合い、スタートからつながる場所に置く。180度回してよい。道具が壊れていると置けない
 *   - 壊す：ほかの人の前に置く（同じ道具を2つは壊せない）／直す：自分かほかの人の、壊れた道具を1つ直す
 *   - 地図：伏せたゴールを1枚、自分だけ見る／落盤：スタートとゴール以外の道のカードを1枚取り除く
 * - 道がゴールに届いたらめくる。金なら金鉱掘りの勝ちでラウンドの終わり。石なら道に合う向きで置いて続ける
 * - 山札と全員の手札がなくなったら、お邪魔者の勝ちでラウンドの終わり
 * - 金塊：金鉱掘りの勝ちなら、人数ぶん（9枚まで）引き、金にたどり着いた人から反時計回りに、金鉱掘りが1枚ずつ取る
 *   お邪魔者の勝ちなら、お邪魔者1人あたり 1人：4・2〜3人：3・4人：2 の金塊
 * - 3ラウンドの金塊の合計がいちばん多い人の勝ち（同じなら全員）
 *
 * ルールブックで分からない点や、資料で食い違う点は、次のように決めた
 * - 金塊は、各自が選ぶ代わりに、高いものから自動で取る
 * - お邪魔者が金にたどり着いたときも金鉱掘りの勝ち。金塊は、その人から反時計回りで次の金鉱掘りから取る
 * - 道具を壊すカードは、自分以外にだけ出せる
 * - 石のゴール2枚の形は、曲がり角（上と右・上と左）とした
 * - 次のラウンドは、前のラウンドの最後に手番をした人の左隣（次の席）から始める
 */

import { createRandom, shuffle } from './random.js';
import {
    CARDS, GOAL_CARDS, GOAL_POSITIONS, TOOLS, TOOL_NAMES, ROLES_BY_PLAYERS, HAND_BY_PLAYERS,
    GOLD_CARDS, SABOTEUR_REWARD, MAX_GOLD_DRAW
} from './cards.js';
import { key, placementError, reachedGoals, goalRotation } from './board.js';

export { CARDS, TOOLS, TOOL_NAMES };
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const ROUNDS = 3;
export const ROLE_NAMES = { digger: '金鉱掘り', saboteur: 'お邪魔者' };
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    path: ['card', 'x', 'y', 'rotated'], break: ['card', 'target'], repair: ['card', 'target', 'tool'],
    map: ['card', 'goal'], rockfall: ['card', 'x', 'y'], discard: ['card']
};
const MAX_LOGS = 300;
const MAX_EVENTS = 300;

const isInt = (value) => Number.isInteger(value);

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            role: null, hand: [], broken: [], gold: 0, goldCards: [], knownGoals: {}
        }));
        this.goldDeck = shuffle([...GOLD_CARDS], this.random);
        this.round = 0;
        this.phase = 'play';     // play：手番 / end：終わり
        this.history = [];       // ラウンドごとの結果
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.deal(Math.floor(this.random() * players.length));
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'end' ? [] : [this.current];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const player = this.players[playerId];
        if (!player.hand.includes(command.card)) return this.fail('そのカードは持っていません');
        const card = CARDS[command.card];
        if (command.type !== 'discard' && card.kind !== command.type) return this.fail('そのカードではできません');
        const handler = { path: this.playPath, break: this.playBreak, repair: this.playRepair, map: this.playMap, rockfall: this.playRockfall, discard: this.discard }[command.type];
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { recorded[k] = command[k]; });
        this.commands.push({ playerId, command: recorded });
        this.afterTurn(playerId, command.card);
        return true;
    }

    // ---- 手番の操作 ----

    playPath(seat, { card, x, y, rotated }) {
        if (this.players[seat].broken.length > 0) return this.fail('道具が壊れているあいだは、道を置けません');
        if (!isInt(x) || !isInt(y) || typeof rotated !== 'boolean') return this.fail('置く場所が正しくありません');
        const error = placementError(this.board, this.goals, card, x, y, rotated);
        if (error) return this.fail(error);
        this.board[key(x, y)] = { type: 'path', id: card, rotated, by: seat };
        this.emit({ type: 'path', seat, card, x, y, rotated });
        this.log({ seat, text: `${this.name(seat)}が${CARDS[card].connected ? '道' : '行き止まり'}を置きました` });
        this.revealGoals(seat);
        return true;
    }

    playBreak(seat, { card, target }) {
        const tool = CARDS[card].tools[0];
        if (!isInt(target) || !this.players[target] || target === seat) return this.fail('道具を壊すのは、ほかの人です');
        if (this.players[target].broken.includes(tool)) return this.fail(`その人の${TOOL_NAMES[tool]}はもう壊れています`);
        this.players[target].broken.push(tool);
        this.emit({ type: 'break', seat, card, target, tool });
        this.log({ seat, text: `${this.name(seat)}が${this.name(target)}の${TOOL_NAMES[tool]}を壊しました` });
        return true;
    }

    playRepair(seat, { card, target, tool }) {
        if (!isInt(target) || !this.players[target]) return this.fail('直す人を選んでください');
        if (!CARDS[card].tools.includes(tool)) return this.fail('そのカードでは直せない道具です');
        if (!this.players[target].broken.includes(tool)) return this.fail(`その人の${TOOL_NAMES[tool]}は壊れていません`);
        const broken = this.players[target].broken;
        broken.splice(broken.indexOf(tool), 1);
        this.emit({ type: 'repair', seat, card, target, tool });
        this.log({ seat, text: `${this.name(seat)}が${target === seat ? '自分' : this.name(target)}の${TOOL_NAMES[tool]}を直しました` });
        return true;
    }

    playMap(seat, { goal }) {
        if (!isInt(goal) || !this.goals[goal]) return this.fail('見るゴールを選んでください');
        if (this.goals[goal].revealed) return this.fail('そのゴールはもうめくれています');
        const gold = GOAL_CARDS[this.goals[goal].card].gold;
        this.players[seat].knownGoals[goal] = gold ? 'gold' : 'stone';
        // 見た中身は本人だけが知る（ビューが隠す）
        this.emit({ type: 'map', seat, goal, gold });
        this.log({ seat, text: `${this.name(seat)}が地図で${goal + 1}番目のゴールを見ました` });
        return true;
    }

    playRockfall(seat, { x, y }) {
        if (!isInt(x) || !isInt(y)) return this.fail('取り除くカードを選んでください');
        const cell = this.board[key(x, y)];
        if (!cell || cell.type !== 'path') return this.fail('スタートとゴール以外の道のカードを選んでください');
        delete this.board[key(x, y)];
        this.emit({ type: 'rockfall', seat, x, y, removed: cell.id });
        this.log({ seat, text: `${this.name(seat)}が落盤で道を1枚取り除きました` });
        return true;
    }

    discard(seat, { card }) {
        this.emit({ type: 'discard', seat, card });
        this.log({ seat, text: `${this.name(seat)}はパスしました（1枚捨てる）` });
        return true;
    }

    // ---- 進行 ----

    name(seat) {
        return this.players[seat].name;
    }

    // ゴールに届いたらめくる。金なら金鉱掘りの勝ち。石なら向きを合わせて置き、さらに先のゴールに届いていないか見る
    revealGoals(seat) {
        for (;;) {
            const reached = reachedGoals(this.board, this.goals);
            if (reached.length === 0) return;
            for (const index of reached) {
                const goal = this.goals[index];
                goal.revealed = true;
                goal.rotated = goalRotation(this.board, this.goals, index);
                const gold = GOAL_CARDS[goal.card].gold;
                this.emit({ type: 'reveal', seat, goal: index, gold, card: goal.card, rotated: goal.rotated });
                this.log({ seat, text: `${index + 1}番目のゴールは${gold ? '金でした' : '石でした'}` });
                if (gold) this.goldFound = { seat };
            }
            if (this.goldFound) return;
        }
    }

    afterTurn(seat, card) {
        const player = this.players[seat];
        player.hand.splice(player.hand.indexOf(card), 1);
        if (this.deck.length > 0) player.hand.push(this.deck.shift());
        this.lastActor = seat;
        if (this.goldFound) return this.endRound('diggers');
        // 次の、手札のある人の手番。だれも手札がなければ、お邪魔者の勝ち
        const n = this.players.length;
        for (let i = 1; i <= n; i++) {
            const next = (seat + i) % n;
            if (this.players[next].hand.length > 0) {
                this.current = next;
                return;
            }
        }
        this.endRound('saboteurs');
    }

    deal(starter) {
        this.round++;
        const n = this.players.length;
        const [saboteurs, diggers] = ROLES_BY_PLAYERS[n];
        const roles = shuffle([...Array(saboteurs).fill('saboteur'), ...Array(diggers).fill('digger')], this.random);
        this.deck = shuffle(CARDS.map(c => c.id), this.random);
        const goalCards = shuffle([0, 1, 2], this.random);
        this.goals = GOAL_POSITIONS.map((pos, i) => ({ pos, card: goalCards[i], revealed: false, rotated: false }));
        this.board = { [key(0, 0)]: { type: 'start' } };
        this.goals.forEach((goal, i) => { this.board[key(...goal.pos)] = { type: 'goal', goal: i }; });
        this.players.forEach((p, i) => {
            p.role = roles[i];
            p.hand = this.deck.splice(0, HAND_BY_PLAYERS[n]);
            p.broken = [];
            p.knownGoals = {};
        });
        this.goldFound = null;
        this.current = starter;
        this.lastActor = null;
        this.emit({ type: 'deal', round: this.round, starter, roles: this.players.map(p => p.role) });
        this.log({ seat: null, text: `第${this.round}ラウンド。${this.name(starter)}から始めます` });
    }

    // ラウンドの終わり：役割を明かし、金塊を配る
    endRound(winner) {
        const payouts = this.players.map(() => []);
        const diggers = this.players.filter(p => p.role === 'digger').map(p => p.id);
        const saboteurs = this.players.filter(p => p.role === 'saboteur').map(p => p.id);
        if (winner === 'diggers') {
            const count = Math.min(this.players.length, MAX_GOLD_DRAW);
            const drawn = this.goldDeck.splice(0, count).sort((a, b) => b - a);
            // 金にたどり着いた人から反時計回り（席の番号が小さくなる向き）に、金鉱掘りが高いものから1枚ずつ取る
            const order = [];
            const n = this.players.length;
            for (let i = 0; i < n; i++) {
                const seat = (this.goldFound.seat - i + n) % n;
                if (this.players[seat].role === 'digger') order.push(seat);
            }
            drawn.forEach((value, i) => payouts[order[i % order.length]].push(value));
        } else if (saboteurs.length > 0) {
            const amount = SABOTEUR_REWARD[saboteurs.length];
            saboteurs.forEach(seat => { payouts[seat] = this.takeGold(amount); });
        }
        payouts.forEach((cards, seat) => {
            const player = this.players[seat];
            player.goldCards.push(...cards);
            player.gold += cards.reduce((s, v) => s + v, 0);
        });
        const result = {
            round: this.round, winner, finder: this.goldFound?.seat ?? null,
            roles: this.players.map(p => p.role), payouts: payouts.map(cards => cards.reduce((s, v) => s + v, 0)),
            totals: this.players.map(p => p.gold), goldGoal: this.goals.findIndex(g => GOAL_CARDS[g.card].gold)
        };
        this.history.push(result);
        this.emit({ type: 'roundEnd', ...structuredClone(result) });
        this.log({ seat: null, text: winner === 'diggers' ? `金鉱掘りの勝ちです（第${this.round}ラウンド）` : `お邪魔者の勝ちです（第${this.round}ラウンド）` });
        if (this.round >= ROUNDS) {
            this.phase = 'end';
            const best = Math.max(...this.players.map(p => p.gold));
            this.winners = this.players.filter(p => p.gold === best).map(p => p.id);
            this.emit({ type: 'end', winners: [...this.winners] });
            this.log({ seat: null, text: `${this.winners.map(s => this.name(s)).join('と')}の勝ちです` });
            return;
        }
        // 最後に手番をした人の左隣（次の席）から
        this.deal(((this.lastActor ?? 0) + 1) % this.players.length);
    }

    // 合計が amount になるように金塊カードを取る（大きいものから。足りなければ取れる分だけ）
    takeGold(amount) {
        const taken = [];
        let left = amount;
        while (left > 0) {
            const candidates = this.goldDeck.map((v, i) => [v, i]).filter(([v]) => v <= left).sort((a, b) => b[0] - a[0]);
            if (candidates.length === 0) break;
            const [value, index] = candidates[0];
            this.goldDeck.splice(index, 1);
            taken.push(value);
            left -= value;
        }
        return taken;
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    log(entry) {
        this.logs.push(entry);
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
