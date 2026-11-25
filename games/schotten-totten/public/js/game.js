/**
 * ショッテントッテン（Schotten Totten）のゲームの進行（2人用）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（山札の並びはシードから決まる）
 *
 * ルール（BGA の遊び方と同じ順）
 * - 氏族カード 6色×1〜9 の54枚。各自に6枚配る。境界石は9つ
 * - 手番：①手札から1枚を、自分の側の、まだ取られていない境界石に出す（各石3枚まで）
 *         ②境界石を主張する（何個でも。しなくてもよい） ③1枚引いて手札を戻す（山札がなければ引かない）
 * - 主張：自分の側に3枚そろっていて、相手より強い組なら取れる。相手がそろっていなくても、
 *   場に出ているカードだけから、相手がどう埋めても勝てないと示せれば取れる（自分の手札は証明に使わない）
 *   同じ強さなら、先にそろえた方の勝ち
 * - 組の強さ：同色の連番 ＞ 同じ数 ＞ 同色 ＞ 連番 ＞ 合計。同じ種類なら合計の大きい方
 * - 境界石を5つ取るか、隣り合う3つを取った方の勝ち
 * - 置ける石がないときは、パスできる（戦術カードありなら、出せる戦術カードを出してもよい）
 *
 * 戦術カード（選べる設定。既定はなし）：10枚の別の山札。手札は7枚。引くときにどちらの山札から引くか選ぶ
 * - 戦術カードは「相手が出した枚数＋1」までしか出せない
 * - ジョーカー2枚（色と数を選ぶ。1人1枚まで）・スパイ（色を選ぶ7）・盾持ち（色を選ぶ1〜3）：氏族カードのように石に出す
 * - 目隠し鬼（その石は合計だけで比べる）・泥んこ合戦（その石は4枚ずつ）：まだ取られていない石に出す
 * - 新兵募集：どちらかの山札から合わせて3枚引き、手札から2枚をそれぞれの山札の下に戻す
 * - 策士：自分の氏族カード1枚を、別の石に動かすか捨てる / バンシー：相手の氏族カード1枚を捨てさせる
 * - 裏切り者：相手の氏族カード1枚を、自分の側の石に動かす（どれも、まだ取られていない石のカードだけ）
 *
 * 決めたこと
 * - 最初の手番は、シードから決める
 * - 主張の証明では、まだ場に出ていないジョーカー・スパイ・盾持ちも、相手が使えるものとして数える
 *   （相手がジョーカーをもう出していれば、もう1枚のジョーカーは数えない）
 *   相手の手札が0枚で、どちらの山札もないときは、相手はもうカードを足せないものとして数える
 * - 動かした・捨てさせたカードで3枚がそろわなくなったら、そろった順番の記録も消す
 * - 戦術カードでカードが捨てられると、両側ともそろわない石が残り、だれも主張できなくなることがある
 *   山札がどちらもなく、両者が続けてパスしたら終わりにし、取った石の多い方の勝ち（同じなら引き分け）とする
 */

import { createRandom, shuffle } from './random.js';
import { bestFormation, clanId, colorOf, valueOf, COLORS, VALUES } from './formation.js';

export const STONES = 9;
export const HAND_BASE = 6;
export const HAND_TACTICS = 7;
export const STONES_TO_WIN = 5;
export const ADJACENT_TO_WIN = 3;
export const WILDS = ['joker1', 'joker2', 'spy', 'shield'];
export const MODES = ['blind', 'mud'];
export const RUSES = ['recruiter', 'strategist', 'banshee', 'traitor'];
export const TACTICS = [...WILDS, ...MODES, ...RUSES];
export const TACTIC_NAMES = {
    joker1: 'ジョーカー', joker2: 'ジョーカー', spy: 'スパイ', shield: '盾持ち', blind: '目隠し鬼', mud: '泥んこ合戦',
    recruiter: '新兵募集', strategist: '策士', banshee: 'バンシー', traitor: '裏切り者'
};
export const COLOR_NAMES = ['赤', '橙', '黄', '緑', '青', '紫'];
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    play: ['card', 'stone', 'as', 'draws', 'from', 'to', 'target'],
    pass: [], claim: ['stone'], end: ['draw'], return: ['cards']
};
const MAX_LOGS = 200;
const MAX_EVENTS = 80;

export const isClan = (card) => Number.isInteger(card) && card >= 0 && card < COLORS * VALUES;
export const isTactic = (card) => TACTICS.includes(card);
export const isJoker = (card) => card === 'joker1' || card === 'joker2';
export const wildKind = (card) => (isJoker(card) ? 'joker' : card);
export const cardLabel = (card) => (isClan(card) ? `${COLOR_NAMES[colorOf(card)]}${valueOf(card)}` : TACTIC_NAMES[card]);

// 手札の並び：氏族カードは色・数の順、戦術カードは後ろ
export function sortHand(hand) {
    return hand.sort((a, b) => {
        if (isClan(a) && isClan(b)) return a - b;
        if (isClan(a)) return -1;
        if (isClan(b)) return 1;
        return TACTICS.indexOf(a) - TACTICS.indexOf(b);
    });
}

// ジョーカーなどに選べる色・数
export function wildChoices(card) {
    const values = isJoker(card) ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : card === 'spy' ? [7] : card === 'shield' ? [1, 2, 3] : [];
    return Array.from({ length: COLORS }, (_, c) => values.map(v => ({ c, v }))).flat();
}

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const sideFull = (stone, seat) => stone.sides[seat].length >= stoneSize(stone);
export const stoneSize = (stone) => (stone.modes.includes('mud') ? 4 : 3);

export default class Game {
    // players: [{ name, isCPU }]（2人）、options: { seed, tactics }
    constructor(players, options = {}) {
        if (players.length !== 2) throw new Error('ショッテントッテンは2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed, tactics: !!options.tactics };
        this.random = createRandom(seed);
        this.handSize = this.options.tactics ? HAND_TACTICS : HAND_BASE;
        this.deck = shuffle(Array.from({ length: COLORS * VALUES }, (_, i) => i), this.random);
        this.tacticDeck = this.options.tactics ? shuffle([...TACTICS], this.random) : [];
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            hand: sortHand(this.deck.splice(0, this.handSize)), tacticsPlayed: 0, jokerPlayed: false
        }));
        // 境界石：各側のカード [{ card, c, v }]、戦い方（目隠し鬼・泥んこ合戦）、そろった順番、持ち主
        this.stones = Array.from({ length: STONES }, () => ({ sides: [[], []], modes: [], completed: [null, null], owner: null }));
        this.discards = [];      // 捨てたカード（だれでも見える）
        this.completeSeq = 0;
        this.passes = 0;         // 続けてパスした回数（カードを出すか、石を取ると0に戻る）
        this.current = Math.floor(this.random() * 2);
        this.phase = 'play';     // play：カードを出す / recruit：新兵募集で戻す2枚を選ぶ / claim：主張して番を終える / end：終わり
        this.winner = null;
        this.winReason = null;
        this.turn = 1;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.current].name}から始めます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    actor() {
        return this.phase === 'end' ? null : this.current;
    }

    actors() {
        return this.isOver() ? [] : [this.current];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (playerId !== this.current) return this.fail('あなたの番ではありません');
        const allowed = { play: ['play', 'pass'], recruit: ['return'], claim: ['claim', 'end'] }[this.phase];
        if (!allowed.includes(command.type)) return this.fail('今はその操作はできません');
        const handler = { play: this.play, pass: this.pass, claim: this.claim, end: this.endTurn, return: this.returnCards }[command.type];
        if (!handler.call(this, playerId, command)) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { if (command[key] !== undefined) recorded[key] = structuredClone(command[key]); });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    // ---- 判定（状態を変えない） ----

    openStone(index) {
        return isInt(index, 0, STONES - 1) && this.stones[index].owner === null;
    }

    canPlaceOn(seat, index) {
        return this.openStone(index) && !sideFull(this.stones[index], seat);
    }

    // 戦術カードを出せるか（相手が出した枚数＋1 まで）
    canPlayTactic(seat, card) {
        const me = this.players[seat];
        if (!this.options.tactics) return false;
        if (me.tacticsPlayed > this.players[1 - seat].tacticsPlayed) return false;
        if (isJoker(card) && me.jokerPlayed) return false;
        return true;
    }

    // 氏族カードを置ける石があるか
    canPlaceClan(seat) {
        return this.players[seat].hand.some(isClan) && this.stones.some((_, i) => this.canPlaceOn(seat, i));
    }

    // 主張できるか。できるなら true、できなければ理由の文字列
    claimCheck(seat, index) {
        if (!this.openStone(index)) return 'その境界石は主張できません';
        const stone = this.stones[index];
        const size = stoneSize(stone);
        const blind = stone.modes.includes('blind');
        const mine = stone.sides[seat];
        const theirs = stone.sides[1 - seat];
        if (mine.length < size) return `自分の側に${size}枚そろっていません`;
        const myStrength = bestFormation(mine, size, undefined, blind);
        if (theirs.length >= size) {
            const their = bestFormation(theirs, size, undefined, blind);
            if (myStrength > their) return true;
            if (myStrength === their && stone.completed[seat] < stone.completed[1 - seat]) return true;
            return '相手の組の方が強い';
        }
        // 相手がまだそろっていない：場に出ていないカードでどう埋めても、こちらを超えられないか
        const theirBest = bestFormation(theirs, size, this.unseenPool(1 - seat), blind);
        if (theirBest <= myStrength) return true; // 同じ強さなら、先にそろえたこちらの勝ち
        return '相手がまだ上回れます';
    }

    // 場に出ていない（相手が使えるかもしれない）カード
    unseenPool(seat) {
        const opponent = this.players[seat];
        if (opponent.hand.length === 0 && this.deck.length === 0 && this.tacticDeck.length === 0) return { clan: new Set(), wilds: [] };
        const seen = new Set();
        this.stones.forEach(stone => stone.sides.forEach(side => side.forEach(x => seen.add(x.card))));
        this.discards.forEach(card => seen.add(card));
        const clan = new Set();
        for (let id = 0; id < COLORS * VALUES; id++) if (!seen.has(id)) clan.add(id);
        const wilds = [];
        if (this.options.tactics) {
            const jokers = ['joker1', 'joker2'].filter(j => !seen.has(j));
            if (jokers.length > 0 && !opponent.jokerPlayed) wilds.push('joker');
            ['spy', 'shield'].forEach(w => { if (!seen.has(w)) wilds.push(w); });
        }
        return { clan, wilds };
    }

    // ---- 操作 ----

    // { type: 'play', card, ... }
    play(seat, command) {
        const me = this.players[seat];
        const { card } = command;
        if (!me.hand.includes(card)) return this.fail('そのカードは手札にありません');
        if (isTactic(card) && !this.canPlayTactic(seat, card)) {
            return this.fail(isJoker(card) && me.jokerPlayed ? 'ジョーカーは1人1枚までです' : '戦術カードは、相手が出した枚数より多くは出せません');
        }
        const handler = isClan(card) || WILDS.includes(card) ? this.playTroop : MODES.includes(card) ? this.playMode
            : { recruiter: this.playRecruiter, strategist: this.playStrategist, banshee: this.playBanshee, traitor: this.playTraitor }[card];
        const ok = handler.call(this, seat, command);
        if (ok) this.passes = 0;
        return ok;
    }

    playTroop(seat, { card, stone, as }) {
        if (!this.canPlaceOn(seat, stone)) return this.fail('その境界石には出せません');
        let entry;
        if (isClan(card)) {
            entry = { card, c: colorOf(card), v: valueOf(card) };
        } else {
            if (!as || typeof as !== 'object' || !wildChoices(card).some(x => x.c === as.c && x.v === as.v)) return this.fail('色と数を選んでください');
            entry = { card, c: as.c, v: as.v };
        }
        this.takeFromHand(seat, card);
        this.placeEntry(seat, stone, entry);
        this.emit({ type: 'play', seat, card, stone, entry: { ...entry } });
        this.log(`${this.players[seat].name}が${cardLabel(card)}${isClan(card) ? '' : `（${COLOR_NAMES[entry.c]}${entry.v}）`}を${stone + 1}番の石に出しました`);
        return this.toClaim();
    }

    playMode(seat, { card, stone }) {
        if (!this.openStone(stone)) return this.fail('まだ取られていない境界石に出します');
        if (this.stones[stone].modes.includes(card)) return this.fail('その境界石には、もう出ています');
        this.takeFromHand(seat, card);
        const target = this.stones[stone];
        target.modes.push(card);
        // 泥んこ合戦で4枚になると、3枚の側はそろっていない
        if (card === 'mud') [0, 1].forEach(s => { if (!sideFull(target, s)) target.completed[s] = null; });
        this.emit({ type: 'mode', seat, card, stone });
        this.log(`${this.players[seat].name}が${TACTIC_NAMES[card]}を${stone + 1}番の石に出しました`);
        return this.toClaim();
    }

    // { draws: ['clan' | 'tactic' ×3] }：引く山札を選ぶ。山札が足りなければ、あるだけ
    playRecruiter(seat, { draws }) {
        const total = Math.min(3, this.deck.length + this.tacticDeck.length);
        if (!Array.isArray(draws) || draws.length !== total || draws.some(d => d !== 'clan' && d !== 'tactic')) return this.fail('引く山札を選んでください');
        if (draws.filter(d => d === 'clan').length > this.deck.length || draws.filter(d => d === 'tactic').length > this.tacticDeck.length) return this.fail('その山札には足りません');
        this.takeFromHand(seat, 'recruiter');
        const drawn = draws.map(d => (d === 'clan' ? this.deck.shift() : this.tacticDeck.shift()));
        const me = this.players[seat];
        me.hand.push(...drawn);
        sortHand(me.hand);
        this.discards.push('recruiter');
        this.emit({ type: 'recruit', seat, drawn });
        this.log(`${me.name}が新兵募集で${drawn.length}枚引きました`);
        this.phase = me.hand.length >= 2 ? 'recruit' : 'claim';
        return true;
    }

    // { cards: [2枚] }：新兵募集で、手札から2枚をそれぞれの山札の下に戻す
    returnCards(seat, { cards }) {
        const me = this.players[seat];
        if (!Array.isArray(cards) || cards.length !== 2) return this.fail('戻すカードを2枚選びます');
        const rest = [...me.hand];
        for (const card of cards) {
            const i = rest.indexOf(card);
            if (i < 0) return this.fail('持っていないカードは戻せません');
            rest.splice(i, 1);
        }
        cards.forEach(card => {
            me.hand.splice(me.hand.indexOf(card), 1);
            (isClan(card) ? this.deck : this.tacticDeck).push(card);
        });
        this.emit({ type: 'return', seat, cards: [...cards] });
        this.log(`${me.name}が2枚を山札の下に戻しました`);
        this.phase = 'claim';
        return true;
    }

    // 石の上の氏族カードの位置 { stone, index } を確かめる
    findClan(owner, ref) {
        if (!ref || typeof ref !== 'object' || !this.openStone(ref.stone)) return null;
        const side = this.stones[ref.stone].sides[owner];
        if (!isInt(ref.index, 0, side.length - 1) || !isClan(side[ref.index].card)) return null;
        return side[ref.index];
    }

    // { from: { stone, index }, to: 石の番号か null（捨てる） }
    playStrategist(seat, { from, to }) {
        if (!this.findClan(seat, from)) return this.fail('動かす自分の氏族カードを選んでください');
        if (to !== null && (to === from.stone || !this.canPlaceOn(seat, to))) return this.fail('その境界石には動かせません');
        this.takeFromHand(seat, 'strategist');
        const entry = this.removeEntry(seat, from);
        if (to === null) this.discards.push(entry.card);
        else this.placeEntry(seat, to, entry);
        this.discards.push('strategist');
        this.emit({ type: 'strategist', seat, from: { ...from }, to, card: entry.card });
        this.log(`${this.players[seat].name}が策士で${cardLabel(entry.card)}を${to === null ? '捨てました' : `${to + 1}番の石に動かしました`}`);
        return this.toClaim();
    }

    // { target: { stone, index } }：相手の氏族カードを捨てさせる
    playBanshee(seat, { target }) {
        if (!this.findClan(1 - seat, target)) return this.fail('相手の氏族カードを選んでください');
        this.takeFromHand(seat, 'banshee');
        const entry = this.removeEntry(1 - seat, target);
        this.discards.push(entry.card, 'banshee');
        this.emit({ type: 'banshee', seat, target: { ...target }, card: entry.card });
        this.log(`${this.players[seat].name}がバンシーで${cardLabel(entry.card)}を捨てさせました`);
        return this.toClaim();
    }

    // { target: { stone, index }, to }：相手の氏族カードを、自分の側の石に動かす
    playTraitor(seat, { target, to }) {
        if (!this.findClan(1 - seat, target)) return this.fail('相手の氏族カードを選んでください');
        if (!this.canPlaceOn(seat, to)) return this.fail('その境界石には動かせません');
        this.takeFromHand(seat, 'traitor');
        const entry = this.removeEntry(1 - seat, target);
        this.placeEntry(seat, to, entry);
        this.discards.push('traitor');
        this.emit({ type: 'traitor', seat, target: { ...target }, to, card: entry.card });
        this.log(`${this.players[seat].name}が裏切り者で${cardLabel(entry.card)}を${to + 1}番の石に動かしました`);
        return this.toClaim();
    }

    // { type: 'pass' }：氏族カードを置ける石がないとき
    pass(seat) {
        if (this.canPlaceClan(seat)) return this.fail('置ける境界石があります');
        this.emit({ type: 'pass', seat });
        this.log(`${this.players[seat].name}はカードを出せませんでした`);
        this.passes++;
        return this.toClaim();
    }

    // 山札がどちらもなく、両者が続けてパスして石も取られなかったら、もう進まない。取った石の多い方の勝ち（同じなら引き分け）
    checkStalled() {
        if (this.passes < 2 || this.deck.length > 0 || this.tacticDeck.length > 0) return false;
        const counts = this.players.map(p => this.stones.filter(s => s.owner === p.id).length);
        this.phase = 'end';
        this.winner = counts[0] === counts[1] ? null : counts[0] > counts[1] ? 0 : 1;
        this.winReason = 'stalled';
        this.emit({ type: 'end', winner: this.winner, reason: 'stalled' });
        this.log(this.winner === null ? 'これ以上進まないので、引き分けです' : `これ以上進まないので、石の多い${this.players[this.winner].name}の勝ちです`);
        return true;
    }

    // { type: 'claim', stone }
    claim(seat, { stone }) {
        const check = this.claimCheck(seat, stone);
        if (check !== true) return this.fail(check);
        this.stones[stone].owner = seat;
        this.passes = 0;
        this.emit({ type: 'claim', seat, stone });
        this.log(`${this.players[seat].name}が${stone + 1}番の石を取りました`);
        this.checkWin(seat);
        return true;
    }

    // { type: 'end', draw: 'clan' | 'tactic' }：1枚引いて番を終える（手札が減っていなければ引かない）
    endTurn(seat, { draw }) {
        const me = this.players[seat];
        let from = null;
        if (me.hand.length < this.handSize) {
            const wanted = draw === 'tactic' ? this.tacticDeck : this.deck;
            if (draw !== undefined && draw !== 'clan' && draw !== 'tactic') return this.fail('引く山札を選んでください');
            if (draw === 'tactic' && !this.options.tactics) return this.fail('戦術カードはありません');
            if (wanted.length > 0) from = draw === 'tactic' ? 'tactic' : 'clan';
            else if (this.deck.length > 0) from = 'clan';
            else if (this.tacticDeck.length > 0) from = 'tactic';
        }
        if (from) {
            const card = (from === 'clan' ? this.deck : this.tacticDeck).shift();
            me.hand.push(card);
            sortHand(me.hand);
            this.emit({ type: 'draw', seat, from, card });
        }
        this.current = 1 - seat;
        this.phase = 'play';
        this.turn++;
        this.checkStalled();
        return true;
    }

    // ---- 道具 ----

    takeFromHand(seat, card) {
        const hand = this.players[seat].hand;
        hand.splice(hand.indexOf(card), 1);
        if (isTactic(card)) {
            this.players[seat].tacticsPlayed++;
            if (isJoker(card)) this.players[seat].jokerPlayed = true;
        }
    }

    placeEntry(seat, index, entry) {
        const stone = this.stones[index];
        stone.sides[seat].push(entry);
        if (sideFull(stone, seat) && stone.completed[seat] === null) stone.completed[seat] = ++this.completeSeq;
    }

    removeEntry(seat, { stone, index }) {
        const target = this.stones[stone];
        const [entry] = target.sides[seat].splice(index, 1);
        if (!sideFull(target, seat)) target.completed[seat] = null;
        return entry;
    }

    toClaim() {
        this.phase = 'claim';
        return true;
    }

    checkWin(seat) {
        const owned = this.stones.map(s => s.owner === seat);
        const count = owned.filter(Boolean).length;
        const adjacent = owned.some((_, i) => i + ADJACENT_TO_WIN <= STONES && owned.slice(i, i + ADJACENT_TO_WIN).every(Boolean));
        if (count < STONES_TO_WIN && !adjacent) return;
        this.phase = 'end';
        this.winner = seat;
        this.winReason = adjacent ? 'adjacent' : 'count';
        this.emit({ type: 'end', winner: seat, reason: this.winReason });
        this.log(`${this.players[seat].name}の勝ちです`);
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

export { clanId, colorOf, valueOf };
