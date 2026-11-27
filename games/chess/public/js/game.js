/**
 * チェス（2人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（乱数は使わない）
 *
 * ルール（FIDE Laws of Chess）
 * - 席0が白（先手）、席1が黒。指し手は rules.js が作る合法手だけを受け付ける（キャスリング・アンパッサン・昇格を含む）
 * - 昇格は、クイーン・ルーク・ビショップ・ナイトから必ず選ぶ（操作に promo がなければ断る）
 * - 終わり：チェックメイト（勝ち）、ステイルメイト（引き分け）、駒不足（引き分け）、投了、引き分けの合意
 * - 同じ局面の3回目と、50手（両者が50手ずつ、ポーンを動かさず駒も取らない）も引き分けにする
 *
 * ルールにない点・画面の都合で決めた点（README にも書く）
 * - 3回同一局面と 50手は、FIDE では申し立てで引き分けになる。画面では申し立てを待たず、その局面になったら自動で引き分けにする
 * - 引き分けの提案は、自分の番にだけできる（1手につき1回）。相手は受けるか断るかを答え、断られたら提案した人がそのまま指す
 * - 投了は、どちらの席もいつでもできる
 *
 * 持ち時間（options.clock。clock.js）
 * - 時計が進むのは、操作を待っている席（引き分けの提案中は答える側）。操作のたびに、その席にかかった時間（ミリ秒）を記録に残す
 *   フィッシャーの加算は指し手だけ（提案・答えには足さない）
 * - 時間切れは記録の { type: 'timeout' }（端末からは送れない）。相手にメイトできる駒がない（キングだけか、キングと小駒1つ）なら引き分け
 * - 時刻は持たない。手番が始まった時刻（turnStartedAt）は、コントローラーとサーバーが外から入れる
 */

import {
    Position, START_FEN, WHITE, findMove, toSan, moveToUci, moveFrom, moveTo, movePromo, moveFlag,
    FLAG_CASTLE, FLAG_EP, typeOf, colorOf, onBoard, LETTER, sqName, isSquareName, KNIGHT, BISHOP, KING
} from './rules.js';
import { normalizeClock, createClockSides, limitOf, spend } from './clock.js';

export const PLAYERS = 2;
const MAX_LOGS = 500;
const MAX_EVENTS = 150;

export const COMMAND_FIELDS = {
    move: ['from', 'to', 'promo'],
    resign: [],
    offerDraw: [],
    acceptDraw: [],
    declineDraw: []
};

export const REASONS = {
    checkmate: 'チェックメイト',
    stalemate: 'ステイルメイト',
    repetition: '同じ局面が3回',
    fifty: '50手ルール',
    material: '駒不足',
    resign: '投了',
    agreement: '合意',
    timeout: '時間切れ',
    timeoutDraw: '時間切れ（相手にメイトできる駒がない）'
};

// 持ち時間の選び方（タイトル画面とロビー。この順に並べる）。切れ負けと、フィッシャー（1手ごとに加算）
// 名前は数字だけにしない（数字だけの名前は、オブジェクトの中で先に並んでしまう）
export const CLOCK_PRESETS = {
    none: { label: 'なし', clock: null },
    '3m': { label: '3分', clock: { main: 180000 } },
    '5m': { label: '5分', clock: { main: 300000 } },
    '10m': { label: '10分', clock: { main: 600000 } },
    '3m+2s': { label: '3分+2秒', clock: { main: 180000, increment: 2000 } },
    '5m+5s': { label: '5分+5秒', clock: { main: 300000, increment: 5000 } }
};
export const clockOption = (key) => (Object.hasOwn(CLOCK_PRESETS, key) ? CLOCK_PRESETS[key].clock : null);

// 色 color の駒だけでメイトできるか（キングだけか、キングと小駒1つならできない）
function canMate(pos, color) {
    let minors = 0;
    for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) {
            sq += 7;
            continue;
        }
        const p = pos.board[sq];
        if (!p || colorOf(p) !== color) continue;
        const type = typeOf(p);
        if (type === KING) continue;
        if (type === KNIGHT || type === BISHOP) minors++;
        else return true;
        if (minors > 1) return true;
    }
    return false;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]（席0：白、席1：黒）。options.fen で途中の局面から始められる（テスト用）
    // options.clock：持ち時間の設定（clock.js。なければ時計なし）
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        const { clock, ...rest } = options;
        this.clockConfig = normalizeClock(clock);
        this.options = this.clockConfig ? { ...rest, clock: { ...this.clockConfig } } : rest;
        this.clock = this.clockConfig ? createClockSides(this.clockConfig) : null;
        this.turnStartedAt = null;  // 手番が始まった時刻（コントローラーとサーバーが入れる。記録には入れない）
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null }));
        this.startFen = options.fen ?? START_FEN;
        this.pos = new Position(this.startFen);
        this.legal = this.pos.legalMoves();
        this.history = [];        // 指した手 { seat, san, uci, from, to, captured, promo }
        this.repetitions = new Map();
        this.countPosition();
        this.phase = 'play';
        this.result = null;       // { winner（引き分けは null）, reason }
        this.drawOffer = null;    // 引き分けを提案している席
        this.drawOfferPly = [-1, -1];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        // 途中の局面から始めて、もう終わっている場合
        this.checkEnd();
    }

    get current() {
        return this.pos.turn;
    }

    get ply() {
        return this.history.length;
    }

    isOver() {
        return this.phase === 'end';
    }

    get winner() {
        return this.result?.winner ?? null;
    }

    // 今、操作を待っている席（引き分けの提案中は、答える側）
    actors() {
        if (this.isOver()) return [];
        return [this.drawOffer === null ? this.current : 1 - this.drawOffer];
    }

    inCheck() {
        return this.pos.inCheck();
    }

    // 手番の人の合法手（UCI の形 { from, to, promo }）
    moves() {
        return this.legal.map(m => ({ from: sqName(moveFrom(m)), to: sqName(moveTo(m)), promo: movePromo(m) ? LETTER[movePromo(m)] : null }));
    }

    canOfferDraw(seat) {
        return !this.isOver() && this.drawOffer === null && seat === this.current && this.drawOfferPly[seat] !== this.ply;
    }

    // ---- 持ち時間 ----

    // 時計が進んでいる席（時計なし・終わったあとは null）
    clockSeat() {
        if (!this.clock || this.isOver()) return null;
        return this.actors()[0] ?? null;
    }

    // 手番を始めてから、時間切れになるまでの時間（時計が進んでいなければ null）
    clockLimit() {
        const seat = this.clockSeat();
        return seat === null ? null : limitOf(this.clockConfig, this.clock[seat]);
    }

    // 手番を始めて elapsed ミリ秒たったら、時間切れか
    isFlagged(elapsed) {
        const limit = this.clockLimit();
        return limit !== null && elapsed >= limit;
    }

    // 時間切れで終える。seat は時計が進んでいる席
    timeout(seat, elapsed) {
        this.lastError = null;
        if (seat !== this.clockSeat()) return this.fail('時間切れにできません');
        const ms = Math.max(0, Math.round(elapsed) || 0);
        if (ms < this.clockLimit()) return this.fail('まだ時間があります');
        this.clock[seat] = { main: 0, periods: 0 };
        this.drawOffer = null;
        this.commands.push({ playerId: seat, command: { type: 'timeout' }, ms });
        this.log(`${this.players[seat].name}の時間切れ`);
        if (canMate(this.pos, 1 - seat)) this.finish(1 - seat, 'timeout');
        else this.finish(null, 'timeoutDraw');
        return true;
    }

    // 操作を受け付ける。elapsed：時計が進んでいる席が、この手番にかけた時間（ミリ秒。時計なしなら見ない）
    // 時間を使い切っていたら断る（呼ぶ側が先に timeout で終える）
    applyCommand(playerId, command, elapsed = 0) {
        const seat = this.clockSeat();
        const ms = Math.max(0, Math.round(elapsed) || 0);
        if (seat !== null && ms >= this.clockLimit()) return this.fail('時間切れです');
        const count = this.commands.length;
        const ok = this.applyAction(playerId, command);
        if (ok && this.clock && this.commands.length > count) {
            this.commands.at(-1).ms = ms;
            if (seat !== null) this.clock[seat] = spend(this.clockConfig, this.clock[seat], ms, { increment: command.type === 'move' }).side;
        }
        return ok;
    }

    applyAction(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (playerId !== 0 && playerId !== 1) return this.fail('席が正しくありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        switch (command.type) {
            case 'resign':
                this.finish(1 - playerId, 'resign');
                this.record(playerId, { type: 'resign' });
                return true;
            case 'offerDraw':
                if (!this.canOfferDraw(playerId)) return this.fail('今は引き分けを提案できません');
                this.drawOffer = playerId;
                this.drawOfferPly[playerId] = this.ply;
                this.log(`${this.players[playerId].name}が引き分けを提案`);
                this.pushEvent({ type: 'drawOffer', seat: playerId });
                this.record(playerId, { type: 'offerDraw' });
                return true;
            case 'acceptDraw':
            case 'declineDraw': {
                if (this.drawOffer === null || playerId !== 1 - this.drawOffer) return this.fail('答える提案がありません');
                const by = this.drawOffer;
                this.drawOffer = null;
                if (command.type === 'acceptDraw') {
                    this.finish(null, 'agreement');
                } else {
                    this.log(`${this.players[playerId].name}は引き分けを断った`);
                    this.pushEvent({ type: 'drawDeclined', seat: playerId, by });
                }
                this.record(playerId, { type: command.type });
                return true;
            }
            default:
                return this.applyMove(playerId, command);
        }
    }

    applyMove(seat, command) {
        if (this.drawOffer !== null) return this.fail('引き分けの提案への答えを待っています');
        if (seat !== this.current) return this.fail('今はあなたの番ではありません');
        const { from, to } = command;
        const promo = command.promo ?? '';
        if (!isSquareName(from) || !isSquareName(to)) return this.fail('マスが正しくありません');
        if (promo !== '' && !['q', 'r', 'b', 'n'].includes(promo)) return this.fail('成る駒が正しくありません');
        const m = findMove(this.legal, from, to, promo);
        if (m === null) {
            if (!promo && findMove(this.legal, from, to, 'q') !== null) return this.fail('成る駒を選んでください');
            return this.fail('そこへは動かせません');
        }
        this.play(seat, m);
        this.record(seat, promo ? { type: 'move', from, to, promo } : { type: 'move', from, to });
        return true;
    }

    play(seat, m) {
        const pos = this.pos;
        const san = toSan(pos, m, this.legal);
        const from = moveFrom(m);
        const to = moveTo(m);
        const flag = moveFlag(m);
        const capSq = flag === FLAG_EP ? to + (seat === WHITE ? -16 : 16) : to;
        const capturedPiece = pos.board[capSq];
        const captured = capturedPiece ? LETTER[typeOf(capturedPiece)] : null;
        const moved = LETTER[typeOf(pos.board[from])];
        pos.makeUnchecked(m);
        this.legal = pos.legalMoves();
        const entry = {
            seat, san, uci: moveToUci(m), from: sqName(from), to: sqName(to), piece: moved,
            captured, capturedAt: captured ? sqName(capSq) : null,
            promo: movePromo(m) ? LETTER[movePromo(m)] : null
        };
        if (flag === FLAG_CASTLE) {
            entry.rookFrom = sqName(to > from ? from + 3 : from - 4);
            entry.rookTo = sqName(to > from ? from + 1 : from - 1);
        }
        this.history.push(entry);
        this.countPosition();
        const number = Math.ceil(this.history.length / 2);
        this.log(`${number}.${seat === WHITE ? '' : '..'} ${san}`);
        this.pushEvent({ type: 'move', ...entry, check: pos.inCheck() });
        this.checkEnd();
    }

    countPosition() {
        const key = this.pos.repetitionKey(this.legal);
        this.repetitions.set(key, (this.repetitions.get(key) ?? 0) + 1);
        return this.repetitions.get(key);
    }

    // チェックメイトとステイルメイトを先に見る（50手目や3回目の局面でも、メイトならメイトが優先）
    checkEnd() {
        const pos = this.pos;
        if (!this.legal.length) {
            if (pos.inCheck()) this.finish(1 - pos.turn, 'checkmate');
            else this.finish(null, 'stalemate');
            return;
        }
        if (pos.insufficientMaterial()) return this.finish(null, 'material');
        if (pos.halfmove >= 100) return this.finish(null, 'fifty');
        const key = pos.repetitionKey(this.legal);
        if ((this.repetitions.get(key) ?? 0) >= 3) this.finish(null, 'repetition');
    }

    finish(winner, reason) {
        this.phase = 'end';
        this.drawOffer = null;
        this.result = { winner, reason };
        const text = winner === null ? '引き分け' : `${this.players[winner].name}の勝ち`;
        this.log(`終わり：${REASONS[reason]}。${text}`);
        this.pushEvent({ type: 'end', winner, reason });
    }

    // 盤の上にある駒から、取られた駒を数える（昇格した駒は、ポーンが取られたのではなく盤に残る）
    capturedPieces() {
        const lists = [[], []]; // 席ごとに、その席が取った駒
        this.history.forEach(h => { if (h.captured) lists[h.seat].push(h.captured); });
        return lists;
    }

    kingSquareInCheck() {
        if (!this.pos.inCheck()) return null;
        return sqName(this.pos.kings[this.pos.turn]);
    }

    // ---- 記録 ----

    record(playerId, command) {
        this.commands.push({ playerId, command });
    }

    log(text) {
        this.logs.push(text);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    pushEvent(event) {
        this.events.push({ ...event, seq: ++this.eventSeq });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: { ...this.options },
            commands: structuredClone(this.commands)
        };
    }

    // 記録から再現する。ms（かかった時間）のない古い記録は 0 として読む
    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command, ms = 0 }, index) => {
            const ok = command?.type === 'timeout' ? game.timeout(playerId, ms) : game.applyCommand(playerId, command, ms);
            if (!ok) throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}

export { WHITE };
