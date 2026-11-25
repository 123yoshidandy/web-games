/**
 * フォーセール（For Sale）のゲームの進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びと最初の手番はシードから決まる）
 *
 * ルール（金額の単位は千ドル。コイン1枚が1）
 * - 3〜6人。物件は1〜30の30枚、小切手は0と2〜15が2枚ずつの30枚
 * - 3人なら物件と小切手を6枚ずつ、4人なら2枚ずつ、見ずに除く。5〜6人は全部使う
 * - コインは3〜4人なら18枚、5〜6人なら14枚ずつ
 * - 前半（競り）：人数分の物件を並べ、手番の人は「上げる」か「降りる」
 *   - 上げる：今の最高額より多いコインを出す（それまでに出した分を含めた合計で言う）
 *   - 降りる：残っている中で一番安い物件を取り、出したコインの半分（切り捨て）が戻る。残りは払う。この競りにはもう加わらない
 *   - 最後に残った1人は、残りの物件を取り、出したコインを全部払う。その人が次の競りを始める
 * - 後半（売り）：人数分の小切手を並べ、全員が同時に物件を1枚出す。高い物件から順に、高い小切手をもらう
 * - 得点は、小切手の合計＋残りのコイン。一番多い人の勝ち
 *
 * 版によって違うところは、ボードゲームアリーナに合わせた
 * - コインと除く枚数は、最初の版とボードゲームアリーナの値（IELLO 版は 3人28・4人21・5人16・6人14枚で、3人は除かない）
 * - 同点なら、残りのコインが多い人。それでも同点なら、競りで手に入れた一番高い物件の人（物件は1枚ずつなので、必ず決まる）
 *
 * 公式ルールにないので、次のように決めた
 * - 最初の手番（ルールでは「ランダムに決める」）は、シードから決める
 * - 物件・コイン・もらった小切手は、全員に見せる（どれも公開の場で動くので、覚えていれば分かる情報のため）
 *   後半に出す物件だけは、全員がそろうまで伏せる
 */

import { createRandom, shuffle } from './random.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const PROPERTIES = Array.from({ length: 30 }, (_, i) => i + 1);
export const CHECKS = [0, 0, ...Array.from({ length: 14 }, (_, i) => [i + 2, i + 2]).flat()];
const MAX_LOGS = 200;
const MAX_EVENTS = 80;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { bid: ['amount'], pass: [], sell: ['card'] };

// 人数ごとの、除く枚数と最初のコイン
export const removedFor = (count) => (count === 3 ? 6 : count === 4 ? 2 : 0);
export const coinsFor = (count) => (count <= 4 ? 18 : 14);

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        const n = players.length;
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            coins: coinsFor(n),
            bid: 0,              // この競りで出しているコイン（合計）
            passed: false,       // この競りを降りたか
            hand: [],            // 持っている物件
            bought: [],          // 競りで手に入れた物件（売ったあとも残す。同点の決まりに使う）
            checks: []           // もらった小切手
        }));
        const props = shuffle([...PROPERTIES], this.random);
        const checks = shuffle([...CHECKS], this.random);
        const removed = removedFor(n);
        this.removedProps = props.splice(0, removed).sort((a, b) => a - b);
        this.removedChecks = checks.splice(0, removed).sort((a, b) => a - b);
        this.propDeck = props;       // 末尾が一番上
        this.checkDeck = checks;
        this.rounds = props.length / n;
        this.round = 0;              // 前半・後半それぞれで何回目か
        this.phase = 'bid';          // bid：競り / sell：売り / end：終わり
        this.market = [];            // 並べた物件 { card, takenBy }（小さい順）。後半は空
        this.checkMarket = [];       // 並べた小切手（大きい順）
        this.high = 0;               // 今の最高額
        this.turn = Math.floor(this.random() * n);
        this.selected = this.players.map(() => null); // 後半に出す物件（そろうまで、ほかの人には見せない）
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.turn].name}から始めます`);
        this.dealProperties();
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作が必要な人
    actors() {
        if (this.phase === 'bid') return [this.turn];
        if (this.phase === 'sell') return this.players.filter(p => this.selected[p.id] === null).map(p => p.id);
        return [];
    }

    // その人が今出せる最小と最大の入札額。出せないなら null
    bidRange(seat) {
        const player = this.players[seat];
        const min = this.high + 1;
        return player.coins >= min ? { min, max: player.coins } : null;
    }

    // 降りたときに取る物件（残っている中で一番安い物件）
    lowestOpen() {
        return this.market.find(m => m.takenBy === null)?.card ?? null;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = { bid: { bid: this.bid, pass: this.pass }, sell: { sell: this.sell } }[this.phase]?.[command.type];
        if (!handler || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { recorded[key] = command[key]; });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'bid', amount }：今の最高額より多いコインを出す（それまでに出した分を含めた合計）
    bid(seat, { amount }) {
        if (seat !== this.turn) return this.fail('あなたの番ではありません');
        const player = this.players[seat];
        if (!Number.isInteger(amount)) return this.fail('金額が正しくありません');
        if (amount <= this.high) return this.fail(`${this.high + 1}より多く出す必要があります`);
        if (amount > player.coins) return this.fail('コインが足りません');
        player.bid = amount;
        this.high = amount;
        this.emit({ type: 'bid', seat, amount });
        this.advanceTurn();
        return true;
    }

    // { type: 'pass' }：降りる。一番安い物件を取り、出したコインの半分が戻る
    pass(seat) {
        if (seat !== this.turn) return this.fail('あなたの番ではありません');
        const player = this.players[seat];
        const card = this.lowestOpen();
        const bid = player.bid;
        const refund = Math.floor(bid / 2);
        const paid = bid - refund;
        player.coins -= paid;
        player.bid = 0;
        player.passed = true;
        this.takeProperty(seat, card);
        this.emit({ type: 'pass', seat, card, bid, paid });
        this.log(bid > 0 ? `${player.name}が降りて${card}を取りました（${paid}を払い、${refund}が戻る）` : `${player.name}が降りて${card}を取りました`);
        const left = this.players.filter(p => !p.passed);
        if (left.length === 1) this.finishAuction(left[0]);
        else this.advanceTurn();
        return true;
    }

    // { type: 'sell', card }：後半、出す物件を選ぶ。全員がそろったら公開して小切手を配る
    sell(seat, { card }) {
        if (this.selected[seat] !== null) return this.fail('もう出しています');
        if (!this.players[seat].hand.includes(card)) return this.fail('その物件は持っていません');
        this.selected[seat] = card;
        this.emit({ type: 'selected', seat });
        if (this.selected.every(c => c !== null)) this.settleSale();
        return true;
    }

    // ---- 進行 ----

    advanceTurn() {
        const n = this.players.length;
        let next = this.turn;
        do next = (next + 1) % n; while (this.players[next].passed);
        this.turn = next;
    }

    takeProperty(seat, card) {
        const player = this.players[seat];
        this.market.find(m => m.card === card).takenBy = seat;
        player.hand.push(card);
        player.hand.sort((a, b) => a - b);
        player.bought.push(card);
    }

    // 最後に残った人が、残りの物件を取り、出したコインを全部払う
    finishAuction(player) {
        const card = this.lowestOpen();
        const paid = player.bid;
        player.coins -= paid;
        player.bid = 0;
        this.takeProperty(player.id, card);
        this.emit({ type: 'win', seat: player.id, card, paid });
        this.log(`${player.name}が${paid}で${card}を取りました`);
        this.turn = player.id; // 次の競りを始める
        if (this.propDeck.length > 0) this.dealProperties();
        else this.startSelling();
    }

    dealProperties() {
        this.round++;
        const n = this.players.length;
        this.market = this.propDeck.splice(-n).sort((a, b) => a - b).map(card => ({ card, takenBy: null }));
        this.high = 0;
        this.players.forEach(p => { p.bid = 0; p.passed = false; });
        this.emit({ type: 'auction', round: this.round, cards: this.market.map(m => m.card), starter: this.turn });
    }

    startSelling() {
        this.phase = 'sell';
        this.round = 0;
        this.market = [];
        this.high = 0;
        this.log('売りの時間です');
        this.dealChecks();
    }

    dealChecks() {
        this.round++;
        const n = this.players.length;
        this.checkMarket = this.checkDeck.splice(-n).sort((a, b) => b - a);
        this.selected = this.players.map(() => null);
        this.emit({ type: 'checks', round: this.round, checks: [...this.checkMarket] });
    }

    // 全員の物件を公開し、高い物件から順に高い小切手を配る
    settleSale() {
        const plays = this.players.map(p => ({ seat: p.id, card: this.selected[p.id] })).sort((a, b) => b.card - a.card);
        plays.forEach((play, i) => {
            const player = this.players[play.seat];
            player.hand.splice(player.hand.indexOf(play.card), 1);
            play.check = this.checkMarket[i];
            player.checks.push(play.check);
        });
        this.checkMarket = [];
        this.selected = this.players.map(() => null);
        this.emit({ type: 'sale', round: this.round, plays: plays.map(p => ({ ...p })) });
        if (this.checkDeck.length > 0) this.dealChecks();
        else this.endGame();
    }

    // 最後の結果。順位は、得点 → 残りのコイン → 競りで手に入れた一番高い物件
    results() {
        return this.players.map(p => {
            const checkTotal = p.checks.reduce((sum, c) => sum + c, 0);
            return { seat: p.id, checks: [...p.checks], checkTotal, coins: p.coins, score: checkTotal + p.coins, best: Math.max(0, ...p.bought) };
        });
    }

    endGame() {
        this.phase = 'end';
        const ranked = rankResults(this.results());
        this.winners = [ranked[0].seat];
        this.emit({ type: 'end', winners: [...this.winners], results: this.results() });
        this.log(`${this.players[this.winners[0]].name}の勝ちです`);
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event, state: this.publicState() });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    // 全員に見せてよい状態（イベントに付けて、画面がその時点の様子を描けるようにする）
    publicState() {
        return {
            phase: this.phase,
            round: this.round,
            rounds: this.rounds,
            turn: this.phase === 'bid' ? this.turn : null,
            high: this.high,
            market: this.market.map(m => ({ ...m })),
            checkMarket: [...this.checkMarket],
            propsLeft: this.propDeck.length,
            checksLeft: this.checkDeck.length,
            players: this.players.map(p => ({
                id: p.id, name: p.name, isCPU: p.isCPU, coins: p.coins, bid: p.bid, passed: p.passed,
                hand: [...p.hand], checks: [...p.checks], selected: this.selected[p.id] !== null
            }))
        };
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

// 順位の順に並べる（得点 → 残りのコイン → 一番高い物件）
export const rankResults = (results) => [...results].sort((a, b) => b.score - a.score || b.coins - a.coins || b.best - a.best);
