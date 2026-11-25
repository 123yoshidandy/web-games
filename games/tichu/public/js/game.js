/**
 * ティチューの進行（4人・2対2。向かい合う席が味方：席0と2、席1と3）
 * DOM に依存しない。受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（配り方はシードから決まる）
 *
 * ラウンドの流れ
 * 1. 8枚ずつ配る。各自、大ティチュー（200点）を宣言するか決める（grand）
 * 2. 残りの6枚を配る。各自、左・向かい・右の3人に1枚ずつ渡す（exchange）。小ティチュー（100点）は、自分の最初の札を出す前ならいつでも
 * 3. 麻雀を持つ人から出す（play）。出す番の人は、場の組と同じ形のより強い組を出すか、パス（pass）
 *    爆弾は、場に組があればいつでも（自分の番でなくても）出せる
 *    ほかの人が続けて全員パスしたら、最後に出した人が場の札を取り、次を出す（上がっていれば、その次の人）
 *    竜で取った場は、相手のどちらかに渡す（dragon）。犬は最初に出し、味方に出す番を渡す
 *    麻雀を出した人は、数を願える（wish）。願いの数を持ち、その数を含む組を出せる人は、出さなければならない
 * 4. 1人だけ札が残るか、味方どうしが1・2番目に上がったら終わり
 *    ダブル勝利：200点（札の点は数えない）。それ以外：最後の人の手札は相手のチームへ、取った札は1番目に上がった人へ。札の点を数える
 *    宣言：1番目に上がれば +100（大は +200）、上がれなければ −100（−200）
 * 5. どちらかが目標（既定 1000点）に届き、点が違えば終わり。同じならもう1ラウンド
 */

import { createRandom, shuffle } from './random.js';
import { DECK_SIZE, MAHJONG, DRAGON, classify, beats, enumerateCombos, rankOf, pointsOf, comboLabel, rankLabel, sortCards } from './cards.js';

export const PLAYERS = 4;
export const TARGETS = [1000, 500];
export const COMMAND_FIELDS = {
    grand: ['call'], tichu: [], exchange: ['cards'], play: ['cards', 'wish'], pass: [], dragon: ['to']
};
export const partnerOf = (seat) => (seat + 2) % PLAYERS;
export const teamOf = (seat) => seat % 2;
const MAX_LOGS = 400;
const MAX_EVENTS = 150;

export default class Game {
    // players: [{ name, isCPU }]×4、options: { seed, target }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('4人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const target = TARGETS.includes(options.target) ? options.target : 1000;
        this.options = { seed, target };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU }));
        this.scores = [0, 0];
        this.rounds = [];      // ラウンドごとの結果
        this.round = 0;
        this.winner = null;    // 勝ったチーム（0 か 1）
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    // ---- ラウンド ----

    startRound() {
        this.round++;
        this.deck = shuffle(Array.from({ length: DECK_SIZE }, (_, i) => i), this.random);
        this.hands = [0, 1, 2, 3].map(s => sortCards(this.deck.slice(s * 14, s * 14 + 8)));
        this.calls = [null, null, null, null];        // null / 'tichu' / 'grand'
        this.grandDecided = [false, false, false, false];
        this.exchange = [null, null, null, null];     // 渡す札 [左, 向かい, 右]
        this.received = [null, null, null, null];     // もらった札 { from: card }
        this.played = [false, false, false, false];   // 1枚でも出したか（小ティチューの期限）
        this.won = [[], [], [], []];                  // 取った札
        this.finished = [];                           // 上がった順
        this.table = [];                              // 場に出た組（古い順）{ seat, combo }
        this.passes = 0;
        this.current = null;
        this.wish = null;
        this.dragonFrom = null;
        this.phase = 'grand';
        this.emit({ type: 'deal', round: this.round });
        this.log(`第${this.round}ラウンド：8枚ずつ配りました`);
    }

    dealRest() {
        for (let s = 0; s < PLAYERS; s++) this.hands[s] = sortCards([...this.hands[s], ...this.deck.slice(s * 14 + 8, s * 14 + 14)]);
        this.phase = 'exchange';
        this.log('残りの6枚を配りました。3人に1枚ずつ渡します');
    }

    doExchange() {
        const gifts = [0, 1, 2, 3].map(s => this.exchange[s]);
        this.received = [{}, {}, {}, {}];
        for (let s = 0; s < PLAYERS; s++) {
            gifts[s].forEach((card, i) => {
                const to = (s + 1 + i) % PLAYERS; // 左（次の人）・向かい・右
                this.hands[s] = this.hands[s].filter(c => c !== card);
                this.received[to][s] = card;
            });
        }
        for (let s = 0; s < PLAYERS; s++) this.hands[s] = sortCards([...this.hands[s], ...Object.values(this.received[s])]);
        this.phase = 'play';
        this.current = this.hands.findIndex(h => h.includes(MAHJONG));
        this.emit({ type: 'exchange' });
        this.log(`札を渡しました。麻雀を持つ${this.players[this.current].name}から出します`);
    }

    // ---- 状態 ----

    isOver() {
        return this.phase === 'end';
    }

    active(seat) {
        return this.hands[seat].length > 0;
    }

    nextActive(seat) {
        for (let i = 1; i <= PLAYERS; i++) {
            const s = (seat + i) % PLAYERS;
            if (this.active(s)) return s;
        }
        return null;
    }

    top() {
        return this.table.at(-1) ?? null;
    }

    // 今操作を待っている人（同時に決める場面では複数）
    actors() {
        if (this.phase === 'grand') return [0, 1, 2, 3].filter(s => !this.grandDecided[s]);
        if (this.phase === 'exchange') return [0, 1, 2, 3].filter(s => !this.exchange[s]);
        if (this.phase === 'play') return [this.current];
        if (this.phase === 'dragon') return [this.dragonFrom];
        return [];
    }

    canCallTichu(seat) {
        return (this.phase === 'exchange' || this.phase === 'play') && !this.calls[seat] && !this.played[seat] && this.grandDecided[seat];
    }

    // 願いの数を含む組を出せるなら、出さなければならない（seat が出す番のとき）
    wishCombos(seat, combos) {
        if (this.wish === null || !this.hands[seat].some(c => c < 52 && rankOf(c) === this.wish)) return [];
        return combos.filter(c => c.cards.some(x => x < 52 && rankOf(x) === this.wish));
    }

    // seat が出す番のときに出せる組（願いの決まりも入れる）。mustPlay は、パスできないとき true
    playOptions(seat) {
        const top = this.top()?.combo ?? null;
        let combos = enumerateCombos(this.hands[seat], top);
        if (top) combos = combos.filter(c => c.type !== 'dog');
        const wished = this.wishCombos(seat, combos);
        if (wished.length) return { combos: wished, mustPlay: true, wishBound: true };
        return { combos, mustPlay: !top, wishBound: false };
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!Number.isInteger(playerId) || playerId < 0 || playerId >= PLAYERS) return this.fail('席が正しくありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const handler = { grand: this.grand, tichu: this.tichu, exchange: this.giveCards, play: this.play, pass: this.pass, dragon: this.giveDragon }[command.type];
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { if (command[k] !== undefined && command[k] !== null) recorded[k] = structuredClone(command[k]); });
        if (!handler.call(this, playerId, recorded)) return false;
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // { type: 'grand', call: true|false }
    grand(seat, { call }) {
        if (this.phase !== 'grand') return this.fail('大ティチューを決める場面ではありません');
        if (this.grandDecided[seat]) return this.fail('もう決めました');
        if (typeof call !== 'boolean') return this.fail('宣言するかどうかを選んでください');
        this.grandDecided[seat] = true;
        if (call) {
            this.calls[seat] = 'grand';
            this.emit({ type: 'call', seat, call: 'grand' });
            this.log(`${this.players[seat].name}が大ティチューを宣言しました`);
        }
        if (this.grandDecided.every(Boolean)) this.dealRest();
        return true;
    }

    tichu(seat) {
        if (!this.canCallTichu(seat)) return this.fail(this.calls[seat] ? 'もう宣言しています' : '小ティチューは、最初の札を出す前に宣言します');
        this.calls[seat] = 'tichu';
        this.emit({ type: 'call', seat, call: 'tichu' });
        this.log(`${this.players[seat].name}がティチューを宣言しました`);
        return true;
    }

    // { type: 'exchange', cards: [左へ, 向かいへ, 右へ] }
    giveCards(seat, { cards }) {
        if (this.phase !== 'exchange') return this.fail('札を渡す場面ではありません');
        if (this.exchange[seat]) return this.fail('もう渡しました');
        if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3 || !cards.every(c => this.hands[seat].includes(c))) {
            return this.fail('渡す札を3枚、別々に選んでください');
        }
        this.exchange[seat] = [...cards];
        if (this.exchange.every(Boolean)) this.doExchange();
        return true;
    }

    // { type: 'play', cards, wish? }。爆弾は、場に組があれば番でなくても出せる
    play(seat, { cards, wish }) {
        if (this.phase !== 'play') return this.fail('札を出す場面ではありません');
        if (!Array.isArray(cards) || cards.length === 0 || !cards.every(c => this.hands[seat].includes(c))) return this.fail('出す札を選んでください');
        const top = this.top()?.combo ?? null;
        const combo = classify(cards, top);
        if (!combo) return this.fail('その札は組になっていません');
        const myTurn = seat === this.current;
        if (!myTurn) {
            // 番でないときは、場の組に勝つ爆弾だけ（願いを満たさなくてよい）
            if (!(combo.type === 'bomb' && top && beats(combo, top))) return this.fail('あなたの番ではありません（爆弾なら、場に組があるときに出せます）');
        } else {
            if (top && combo.type === 'dog') return this.fail('犬は、最初に出すときだけ出せます');
            if (top && !beats(combo, top)) return this.fail('場の組と同じ形で、より強い組を出してください');
            const options = this.playOptions(seat);
            if (options.wishBound && !combo.cards.some(c => c < 52 && rankOf(c) === this.wish)) {
                return this.fail(`願いの数（${rankLabel(this.wish)}）を含む組を出さなければなりません`);
            }
        }
        const hasMahjong = cards.includes(MAHJONG);
        if (wish !== undefined && (!hasMahjong || !Number.isInteger(wish) || wish < 2 || wish > 14)) return this.fail('願いは、麻雀を出すときに 2〜A から選びます');
        // ここから状態を変える
        this.hands[seat] = this.hands[seat].filter(c => !cards.includes(c));
        this.played[seat] = true;
        if (this.wish !== null && cards.some(c => c < 52 && rankOf(c) === this.wish)) {
            this.log(`願いの数（${rankLabel(this.wish)}）が出ました`);
            this.wish = null;
        }
        if (hasMahjong && wish !== undefined) this.wish = wish;
        this.emit({ type: 'play', seat, cards: [...cards], combo: { type: combo.type, rank: combo.rank, length: combo.length }, label: comboLabel(combo), wish: hasMahjong ? wish ?? null : null, bomb: combo.type === 'bomb', outOfTurn: !myTurn });
        this.log(`${this.players[seat].name}：${comboLabel(combo)}${hasMahjong && wish !== undefined ? `（願い ${rankLabel(wish)}）` : ''}`);
        if (this.hands[seat].length === 0) this.goOut(seat);
        if (combo.type === 'dog') {
            // 犬：場に残さず、味方に出す番を渡す（味方が上がっていれば、その次の人）
            this.won[seat].push(...cards);
            const partner = partnerOf(seat);
            if (this.checkRoundEnd()) return true;
            this.current = this.active(partner) ? partner : this.nextActive(partner);
            this.passes = 0;
            return true;
        }
        this.table.push({ seat, combo: { ...combo, cards: [...cards] } });
        this.passes = 0;
        if (this.checkRoundEnd()) return true;
        this.current = this.nextActive(seat);
        return true;
    }

    pass(seat) {
        if (this.phase !== 'play') return this.fail('パスする場面ではありません');
        if (seat !== this.current) return this.fail('あなたの番ではありません');
        if (!this.top()) return this.fail('最初に出す人はパスできません');
        if (this.playOptions(seat).wishBound) return this.fail(`願いの数（${rankLabel(this.wish)}）を含む組を出せるので、パスできません`);
        this.passes++;
        this.emit({ type: 'pass', seat });
        const owner = this.top().seat;
        // 場の持ち主のほか、札の残っている全員がパスしたら場を取る
        const others = [0, 1, 2, 3].filter(s => s !== owner && this.active(s)).length;
        if (this.passes >= others) this.takeTrick(owner);
        else this.current = this.nextActive(seat);
        return true;
    }

    takeTrick(owner) {
        const cards = this.table.flatMap(t => t.combo.cards);
        const top = this.top().combo;
        this.table = [];
        this.passes = 0;
        if (top.type === 'single' && top.cards[0] === DRAGON) {
            // 竜で取った場は、相手のどちらかに渡す
            this.pendingTrick = cards;
            this.dragonFrom = owner;
            this.phase = 'dragon';
            this.current = null;
            return;
        }
        this.won[owner].push(...cards);
        this.emit({ type: 'trick', seat: owner, to: owner, points: pointsOf(cards) });
        this.log(`${this.players[owner].name}が場を取りました（${pointsOf(cards)}点）`);
        this.current = this.active(owner) ? owner : this.nextActive(owner);
    }

    // { type: 'dragon', to }：竜で取った場を渡す相手
    giveDragon(seat, { to }) {
        if (this.phase !== 'dragon' || seat !== this.dragonFrom) return this.fail('竜の場を渡す場面ではありません');
        if (!Number.isInteger(to) || teamOf(to) === teamOf(seat)) return this.fail('相手のどちらかを選んでください');
        const cards = this.pendingTrick;
        this.pendingTrick = null;
        this.won[to].push(...cards);
        this.emit({ type: 'trick', seat, to, points: pointsOf(cards), dragon: true });
        this.log(`${this.players[seat].name}が竜の場を${this.players[to].name}に渡しました（${pointsOf(cards)}点）`);
        this.phase = 'play';
        this.dragonFrom = null;
        this.current = this.active(seat) ? seat : this.nextActive(seat);
        return true;
    }

    goOut(seat) {
        this.finished.push(seat);
        this.emit({ type: 'out', seat, place: this.finished.length });
        this.log(`${this.players[seat].name}が${this.finished.length}番目に上がりました`);
    }

    // ラウンドの終わりを調べ、終わっていれば点を数える
    checkRoundEnd() {
        const [first, second] = this.finished;
        const double = this.finished.length >= 2 && teamOf(first) === teamOf(second);
        const remaining = [0, 1, 2, 3].filter(s => this.active(s));
        if (!double && remaining.length > 1) return false;
        this.scoreRound(double);
        return true;
    }

    scoreRound(double) {
        // 場に残っている札は、最後に出した人が取る（竜なら、残っている相手へ）
        if (this.table.length) {
            const cards = this.table.flatMap(t => t.combo.cards);
            const owner = this.top().seat;
            const top = this.top().combo;
            let to = owner;
            if (top.type === 'single' && top.cards[0] === DRAGON) {
                const opponents = [0, 1, 2, 3].filter(s => teamOf(s) !== teamOf(owner));
                to = opponents.find(s => this.active(s)) ?? opponents[0];
            }
            this.won[to].push(...cards);
            this.table = [];
        }
        const points = [0, 0];
        const first = this.finished[0];
        let detail;
        if (double) {
            points[teamOf(first)] += 200;
            detail = 'double';
        } else {
            const last = [0, 1, 2, 3].find(s => this.active(s));
            // 最後の人：手札は相手のチームへ、取った札は1番目に上がった人へ
            points[1 - teamOf(last)] += pointsOf(this.hands[last]);
            this.won[first].push(...this.won[last]);
            this.won[last] = [];
            for (let s = 0; s < PLAYERS; s++) points[teamOf(s)] += pointsOf(this.won[s]);
            if (!this.finished.includes(last)) this.finished.push(last);
            detail = 'cards';
        }
        const cardPoints = [...points];
        const bonus = [0, 0];
        this.calls.forEach((call, s) => {
            if (!call) return;
            const value = call === 'grand' ? 200 : 100;
            bonus[teamOf(s)] += s === first ? value : -value;
        });
        const total = [points[0] + bonus[0], points[1] + bonus[1]];
        this.scores = [this.scores[0] + total[0], this.scores[1] + total[1]];
        const result = { round: this.round, detail, cardPoints, bonus, total, scores: [...this.scores], finished: [...this.finished], calls: [...this.calls] };
        this.rounds.push(result);
        this.emit({ type: 'roundEnd', result });
        this.log(`第${this.round}ラウンドの終わり：${detail === 'double' ? 'ダブル勝利。' : ''}${this.teamName(0)} ${total[0] >= 0 ? '+' : ''}${total[0]}・${this.teamName(1)} ${total[1] >= 0 ? '+' : ''}${total[1]}`);
        const reached = Math.max(...this.scores) >= this.options.target;
        if (reached && this.scores[0] !== this.scores[1]) {
            this.winner = this.scores[0] > this.scores[1] ? 0 : 1;
            this.phase = 'end';
            this.current = null;
            this.emit({ type: 'end', winner: this.winner });
            this.log(`${this.teamName(this.winner)}の勝ちです（${this.scores[0]} 対 ${this.scores[1]}）`);
            return;
        }
        this.startRound();
    }

    // ---- 道具 ----

    teamName(team) {
        return `${this.players[team].name}と${this.players[team + 2].name}`;
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
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
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

