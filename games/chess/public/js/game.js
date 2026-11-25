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
 */

import {
    Position, START_FEN, WHITE, findMove, toSan, moveToUci, moveFrom, moveTo, movePromo, moveFlag,
    FLAG_CASTLE, FLAG_EP, typeOf, LETTER, sqName, isSquareName
} from './rules.js';

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
    agreement: '合意'
};

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]（席0：白、席1：黒）。options.fen で途中の局面から始められる（テスト用）
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        this.options = { ...options };
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

    applyCommand(playerId, command) {
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

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }
}

export { WHITE };
