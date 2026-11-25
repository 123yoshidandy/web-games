/**
 * シーソルト＆ペーパーのゲームの進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びと、奪うカードはシードから決まる）
 *
 * ルール
 * - ラウンドの準備：58枚を切って山札にし、上から1枚ずつ表にして、捨て札の山を2つ作る。手札は0枚から
 * - 手番：
 *   1. 引く：山札の上から2枚を見て1枚を手札に入れ、もう1枚を表にして好きな捨て札の山に置く（空の山があれば、そこに置く）
 *            か、捨て札の山の一番上を1枚取る（捨て札の山の中は見られない）
 *   2. 2枚組を出す（何組でも、出さなくてもよい）。出すと効果が働く
 *      カニ2枚：捨て札の山を1つ選んで中を見て、1枚を手札に入れる／ボート2枚：手番をもう1回／
 *      魚2枚：山札の上を1枚手札に入れる／泳ぐ人とサメ：ほかの人の手札から1枚をランダムに取る
 *   3. カードの点（手札と出した2枚組）が7点以上なら、ラウンドを終えられる（ストップ／ラストチャンス）
 * - ストップ：すぐに終わり、全員がカードの点を得る
 * - ラストチャンス：ほかの人が1手番ずつ行ってから終わる。宣言した人のカードの点が一番多ければ（同点も含む）、
 *   宣言した人はカードの点と色のボーナス、ほかの人は色のボーナスだけを得る。そうでなければ、宣言した人は色のボーナスだけ、
 *   ほかの人はカードの点を得る
 * - 手番の終わりに山札がなければ、そのラウンドは点なしで終わる（ストップを除く）
 * - 次のラウンドは、終わりを宣言した人の次の人から
 * - 終わり：だれかが目標の点（2人 40・3人 35・4人 30）に届いたら終わり。人魚を4枚持ったら、その場で勝ち
 *   同点なら、最後のラウンドで手番の順が後の人が勝ち
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 山札が1枚しかないときに山札から引くと、その1枚を手札に入れる（捨て札には置かない）
 * - ラストチャンスでは、宣言した人と、最後の手番を終えた人の手札は公開されているので、サメと泳ぐ人で取れない
 * - ラストチャンスの最後の手番でボートの2枚組を出すと、もう1回手番を行える（ラウンドは終えられない）
 * - ラストチャンスを宣言したときに山札がなければ、点なしで終わる（手番の終わりに山札がない、と同じ扱い）
 * - 取れる相手がいないとき（全員の手札が0枚か公開済み）のサメと泳ぐ人、捨て札が両方空のカニ、山札が空の魚は、効果なしで出せる（1点は数える）
 * - 山札から引いた2枚と、カニで取ったカード、奪ったカードは、ほかの人に見せない
 */

import { createRandom, shuffle } from './random.js';
import { CARDS, TYPES, DECK_SIZE, DUO_PAIRS, DUO_EFFECTS } from './cards.js';
import { cardPoints, colorBonus, mermaidCount } from './scoring.js';

export { CARDS, TYPES };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const TARGETS = { 2: 40, 3: 35, 4: 30 };
export const END_THRESHOLD = 7;
export const MERMAIDS_TO_WIN = 4;
const MAX_LOGS = 300;
const MAX_EVENTS = 80;

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    drawDeck: [], keep: ['card', 'pile'], takeDiscard: ['pile'],
    duo: ['cards', 'target'], crabLook: ['pile'], crabTake: ['card'],
    endTurn: [], stop: [], lastChance: [], nextRound: []
};

const isPile = (value) => value === 0 || value === 1;

// その2枚が2枚組か。組なら効果の種類（crab・boat・fish・steal）
export function duoEffect(a, b) {
    const ta = CARDS[a]?.type;
    const tb = CARDS[b]?.type;
    if (!ta || !tb) return null;
    return DUO_PAIRS.some(([x, y]) => (ta === x && tb === y) || (ta === y && tb === x)) ? DUO_EFFECTS[ta] : null;
}

// プレイヤーの全部のカード（手札と出した2枚組）
export const allCards = (player) => [...player.hand, ...player.duos.flat()];

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('人数は2〜4人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * players.length);
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            hand: [], duos: [], score: 0
        }));
        this.target = TARGETS[players.length];
        this.round = 0;
        this.roundStarter = this.options.startPlayer;
        this.current = this.roundStarter;
        this.phase = 'draw';        // draw：引く / keep：引いた2枚から選ぶ / play：2枚組と終わり方 / crab：カニの効果 / roundEnd：ラウンドの結果 / end：終わり
        this.deck = [];
        this.discards = [[], []];
        this.drawn = [];            // 山札から引いて、まだ選んでいないカード
        this.crab = null;           // カニの効果 { pile }（pile が null なら山を選ぶところ）
        this.extraTurns = 0;        // ボートでもらった手番の残り
        this.lastChance = null;     // { caller, queue: まだ最後の手番をしていない人, done: 終えた人 }
        this.roundResult = null;    // 直前のラウンドの結果
        this.history = [];          // ラウンドごとの得た点
        this.winners = [];
        this.endReason = null;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    get currentPlayer() {
        return this.players[this.current];
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人。ラウンドの結果は、だれが進めてもよい
    actors() {
        if (this.phase === 'end') return [];
        if (this.phase === 'roundEnd') return this.players.map(p => p.id);
        return [this.current];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            draw: { drawDeck: this.drawDeck, takeDiscard: this.takeDiscard },
            keep: { keep: this.keep },
            play: { duo: this.playDuo, endTurn: this.endTurn, stop: this.stop, lastChance: this.callLastChance },
            crab: { crabLook: this.crabLook, crabTake: this.crabTake },
            roundEnd: { nextRound: this.nextRound }
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

    // ---- 引く ----

    drawDeck(seat) {
        if (this.deck.length === 0) return this.fail('山札がありません');
        const player = this.players[seat];
        const cards = this.deck.splice(0, Math.min(2, this.deck.length));
        this.emit({ type: 'drawDeck', seat, count: cards.length, cards }, [seat]);
        if (cards.length === 1) {
            this.log(`${player.name}が山札の最後の1枚を引きました`);
            this.gain(seat, cards[0]);
            if (this.phase !== 'end') this.phase = 'play';
            return true;
        }
        this.drawn = cards;
        this.phase = 'keep';
        return true;
    }

    // { type: 'keep', card, pile }：引いた2枚のうち card を手札に入れ、もう1枚を pile に置く
    keep(seat, { card, pile }) {
        if (!this.drawn.includes(card)) return this.fail('そのカードは引いていません');
        const reason = this.discardProblem(pile);
        if (reason) return this.fail(reason);
        const other = this.drawn.find(id => id !== card);
        this.drawn = [];
        this.discards[pile].push(other);
        this.emit({ type: 'discard', seat, pile, card: other });
        this.log(`${this.players[seat].name}が山札から引き、${TYPES[CARDS[other].type].name}を捨てました`);
        this.gain(seat, card);
        if (this.phase !== 'end') this.phase = 'play';
        return true;
    }

    // 引いた残りを置ける山か。空の山があれば、そこにしか置けない
    discardProblem(pile) {
        if (!isPile(pile)) return '捨て札の山を選んでください';
        const empty = [0, 1].filter(p => this.discards[p].length === 0);
        if (empty.length === 1 && empty[0] !== pile) return '空の捨て札の山に置いてください';
        return null;
    }

    // { type: 'takeDiscard', pile }
    takeDiscard(seat, { pile }) {
        if (!isPile(pile) || this.discards[pile].length === 0) return this.fail('その捨て札の山からは取れません');
        const card = this.discards[pile].pop();
        this.emit({ type: 'takeDiscard', seat, pile, card });
        this.log(`${this.players[seat].name}が捨て札の${TYPES[CARDS[card].type].name}を取りました`);
        this.gain(seat, card);
        if (this.phase !== 'end') this.phase = 'play';
        return true;
    }

    // ---- 2枚組 ----

    // { type: 'duo', cards: [a, b], target?（サメと泳ぐ人で取る相手） }
    playDuo(seat, { cards, target }) {
        const player = this.players[seat];
        if (!Array.isArray(cards) || cards.length !== 2 || cards[0] === cards[1]) return this.fail('2枚を選んでください');
        if (!cards.every(id => player.hand.includes(id))) return this.fail('そのカードは手札にありません');
        const effect = duoEffect(cards[0], cards[1]);
        if (!effect) return this.fail('その2枚は組になりません');
        if (effect === 'steal') {
            const targets = this.stealTargets(seat);
            if (targets.length > 0 && !targets.includes(target)) return this.fail('取る相手を選んでください');
            if (targets.length === 0 && target !== undefined) return this.fail('取れる相手がいません');
        } else if (target !== undefined) {
            return this.fail('操作が正しくありません');
        }

        // ここから状態を変える
        player.hand = player.hand.filter(id => !cards.includes(id));
        player.duos.push([...cards]);
        this.emit({ type: 'duo', seat, cards: [...cards], effect });
        const name = player.name;
        switch (effect) {
            case 'crab':
                if (this.discards.every(pile => pile.length === 0)) {
                    this.log(`${name}がカニの2枚組を出しました（捨て札がないので効果なし）`);
                } else {
                    this.log(`${name}がカニの2枚組を出しました`);
                    this.crab = { pile: null };
                    this.phase = 'crab';
                }
                break;
            case 'boat':
                this.extraTurns++;
                this.log(`${name}がボートの2枚組を出しました。もう1回手番を行います`);
                break;
            case 'fish':
                if (this.deck.length === 0) {
                    this.log(`${name}が魚の2枚組を出しました（山札がないので効果なし）`);
                } else {
                    const card = this.deck.shift();
                    this.emit({ type: 'fish', seat, card }, [seat]);
                    this.log(`${name}が魚の2枚組を出し、山札から1枚引きました`);
                    this.gain(seat, card);
                }
                break;
            case 'steal':
                if (target === undefined) {
                    this.log(`${name}がサメと泳ぐ人を出しました（取れる相手がいないので効果なし）`);
                } else {
                    const victim = this.players[target];
                    const index = Math.floor(this.random() * victim.hand.length);
                    const [card] = victim.hand.splice(index, 1);
                    this.emit({ type: 'steal', seat, target, card }, [seat, target]);
                    this.log(`${name}がサメと泳ぐ人を出し、${victim.name}の手札から1枚取りました`);
                    this.gain(seat, card);
                }
                break;
        }
        return true;
    }

    // サメと泳ぐ人で取れる相手（手札があり、公開していない人）
    stealTargets(seat) {
        const shown = this.protectedSeats();
        return this.players.filter(p => p.id !== seat && p.hand.length > 0 && !shown.includes(p.id)).map(p => p.id);
    }

    // 手札を公開している人（ラストチャンスを宣言した人と、最後の手番を終えた人）
    protectedSeats() {
        return this.lastChance ? [this.lastChance.caller, ...this.lastChance.done] : [];
    }

    // { type: 'crabLook', pile }：中を見る捨て札の山を選ぶ
    crabLook(seat, { pile }) {
        if (this.crab.pile !== null) return this.fail('今はその操作はできません');
        if (!isPile(pile) || this.discards[pile].length === 0) return this.fail('その捨て札の山は空です');
        this.crab = { pile };
        this.emit({ type: 'crabLook', seat, pile });
        return true;
    }

    // { type: 'crabTake', card }：見ている山から1枚を手札に入れる
    crabTake(seat, { card }) {
        if (this.crab.pile === null) return this.fail('先に捨て札の山を選んでください');
        const pile = this.discards[this.crab.pile];
        const index = pile.indexOf(card);
        if (index < 0) return this.fail('そのカードは選んだ山にありません');
        pile.splice(index, 1);
        this.emit({ type: 'crabTake', seat, pile: this.crab.pile, card }, [seat]);
        this.log(`${this.players[seat].name}が捨て札の山から1枚を手札に入れました`);
        this.crab = null;
        this.phase = 'play';
        this.gain(seat, card);
        return true;
    }

    // ---- 手番の終わり ----

    endTurn(seat) {
        this.finishTurn(seat);
        return true;
    }

    canEndRound(seat) {
        return !this.lastChance && cardPoints(allCards(this.players[seat])) >= END_THRESHOLD;
    }

    stop(seat) {
        if (!this.canEndRound(seat)) return this.fail(this.lastChance ? 'ラストチャンスの最中です' : `${END_THRESHOLD}点に届いていません`);
        this.emit({ type: 'call', seat, call: 'stop' });
        this.log(`${this.players[seat].name}が「ストップ」を宣言しました`);
        this.scoreRound('stop', seat);
        return true;
    }

    callLastChance(seat) {
        if (!this.canEndRound(seat)) return this.fail(this.lastChance ? 'ラストチャンスの最中です' : `${END_THRESHOLD}点に届いていません`);
        const n = this.players.length;
        const queue = Array.from({ length: n - 1 }, (_, i) => (seat + 1 + i) % n);
        this.lastChance = { caller: seat, queue, done: [] };
        this.extraTurns = 0;
        this.emit({ type: 'call', seat, call: 'lastChance' });
        this.log(`${this.players[seat].name}が「ラストチャンス」を宣言しました`);
        this.finishTurn(seat);
        return true;
    }

    finishTurn(seat) {
        if (this.deck.length === 0) {
            this.log('山札がなくなったので、点なしでラウンドを終えます');
            return this.endRoundWithoutScore(seat);
        }
        const lc = this.lastChance;
        if (this.extraTurns > 0 && (!lc || lc.caller !== seat)) {
            this.extraTurns--;
            this.phase = 'draw';
            this.emit({ type: 'turn', seat, extra: true });
            return;
        }
        this.extraTurns = 0;
        let next;
        if (lc) {
            if (seat !== lc.caller && !lc.done.includes(seat)) lc.done.push(seat);
            next = lc.queue.shift();
            if (next === undefined) return this.scoreRound('lastChance', lc.caller);
        } else {
            next = (seat + 1) % this.players.length;
        }
        this.current = next;
        this.phase = 'draw';
        this.emit({ type: 'turn', seat: next });
    }

    // ---- ラウンドの終わり ----

    scoreRound(reason, caller) {
        const hands = this.players.map(p => [...p.hand]);
        const points = this.players.map(p => cardPoints(allCards(p)));
        const bonus = this.players.map(p => colorBonus(allCards(p)));
        let gained = [...points];
        let success = null;
        if (reason === 'lastChance') {
            success = points.every((pts, i) => i === caller || points[caller] >= pts);
            gained = points.map((pts, i) => {
                if (i === caller) return success ? pts + bonus[i] : bonus[i];
                return success ? bonus[i] : pts;
            });
        }
        this.players.forEach((p, i) => { p.score += gained[i]; });
        this.finishRound({ reason, caller, points, bonus, gained, success, hands });
    }

    endRoundWithoutScore(seat) {
        const n = this.players.length;
        this.finishRound({
            reason: 'deckEmpty', caller: seat,
            points: this.players.map(p => cardPoints(allCards(p))), bonus: this.players.map(p => colorBonus(allCards(p))),
            gained: Array(n).fill(0), success: null, hands: this.players.map(p => [...p.hand])
        });
    }

    finishRound(result) {
        this.roundResult = { round: this.round, ...result, totals: this.players.map(p => p.score) };
        this.history.push([...result.gained]);
        this.extraTurns = 0;
        this.drawn = [];
        this.crab = null;
        this.emit({ type: 'roundEnd', reason: result.reason, gained: [...result.gained] });
        if (result.reason === 'lastChance') {
            this.log(result.success ? `${this.players[result.caller].name}のラストチャンスが成功しました` : `${this.players[result.caller].name}のラストチャンスは失敗しました`);
        }
        // 次のラウンドは、終わりを宣言した人（山札が尽きたときは、最後に手番を行った人）の次の人から
        this.roundStarter = (result.caller + 1) % this.players.length;
        const top = Math.max(...this.players.map(p => p.score));
        if (top >= this.target) return this.endGame('target');
        this.current = this.roundStarter;
        this.phase = 'roundEnd';
    }

    nextRound() {
        this.startRound();
        return true;
    }

    startRound() {
        this.round++;
        this.deck = shuffle(Array.from({ length: DECK_SIZE }, (_, i) => i), this.random);
        this.discards = [[this.deck.shift()], [this.deck.shift()]];
        this.players.forEach(p => { p.hand = []; p.duos = []; });
        this.drawn = [];
        this.crab = null;
        this.extraTurns = 0;
        this.lastChance = null;
        this.current = this.roundStarter;
        this.currentRoundStarter = this.roundStarter; // 遊んでいるラウンドの最初の手番の人（同点の決着に使う）
        this.phase = 'draw';
        this.emit({ type: 'roundStart', round: this.round, seat: this.current, discards: this.discards.map(p => p.at(-1)) });
        this.log(`ラウンド${this.round}：${this.players[this.current].name}の手番から始めます`);
    }

    endGame(reason, winner = null) {
        this.phase = 'end';
        this.endReason = reason;
        if (winner === null) winner = rankPlayers(this.players, this.currentRoundStarter)[0].id;
        this.winners = [winner];
        this.emit({ type: 'end', reason, winners: [winner] });
        this.log(reason === 'mermaids'
            ? `${this.players[winner].name}が人魚を${MERMAIDS_TO_WIN}枚そろえました。${this.players[winner].name}の勝ちです`
            : `${this.players[winner].name}の勝ちです`);
    }

    // カードを手札に入れる。人魚が4枚そろったら、その場で勝ち
    gain(seat, card) {
        const player = this.players[seat];
        player.hand.push(card);
        if (mermaidCount(allCards(player)) >= MERMAIDS_TO_WIN) this.endGame('mermaids', seat);
    }

    // ---- 道具 ----

    // 出せる2枚組の候補（手札から）。[{ cards: [a, b], effect }]（同じ種類の組み合わせは1つにまとめない）
    duoOptions(seat) {
        const hand = this.players[seat].hand;
        const options = [];
        for (let i = 0; i < hand.length; i++) {
            for (let j = i + 1; j < hand.length; j++) {
                const effect = duoEffect(hand[i], hand[j]);
                if (effect) options.push({ cards: [hand[i], hand[j]], effect });
            }
        }
        return options;
    }

    emit(event, visibleTo = null) {
        this.events.push({ seq: ++this.eventSeq, ...event, ...(visibleTo ? { visibleTo } : {}) });
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

// 順位：合計点の多い順。同点なら、最後のラウンドで手番の順が後の人
export function rankPlayers(players, roundStarter) {
    const n = players.length;
    const order = (p) => (p.id - roundStarter + n) % n;
    return [...players].sort((a, b) => (b.score - a.score) || (order(b) - order(a)));
}
