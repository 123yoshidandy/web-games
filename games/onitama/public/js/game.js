/**
 * オニタマ（基本ゲーム、2人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（使う5枚はシードから決まる）
 *
 * ルール（Arcane Wonders 版のルールブック）
 * - 5×5 の盤。各自、師匠1つを手前の段の真ん中（神殿の門）に、弟子4つをその左右に置く
 * - 動きのカード16枚を混ぜ、各自に2枚、脇に1枚を表で置く。残りは使わない。脇のカードの印の色の人が先手
 * - 手番：1. 手札のカード1枚を選び、自分の駒（師匠か弟子）1つを、カードの図のマスへ動かす
 *         盤の外と、自分の駒のいるマスには動けない。ほかの駒は飛び越えてよい。相手の駒のマスに動いたら取る
 *         2. 使ったカードを相手の向きに回して脇に置き、脇にあったカードを手札に入れる
 * - 動ける手があれば、必ず動く。どのカードでも動けないときだけ、駒を動かさずにカード1枚を脇と入れ替える
 * - 勝ち：相手の師匠を取る（石の道）か、自分の師匠を相手の神殿の門へ動かす（川の道）
 *
 * ルールブックに書かれていない点は、次のように決めた（README にも書く）
 * - 千日手：同じ局面（盤・手札・脇・手番）が3回目に現れたら引き分け
 * - 手数の上限：300手（両者150手ずつ）で決着がつかなければ引き分け（CPU どうしの試合が終わらないのを防ぐ）
 */

import { createRandom, shuffle } from './random.js';
import { CARD_IDS, CARDS, SEAT_COLORS, initialBoard, legalMoves, applyMove, positionKey, seatOf, isMaster, CELLS } from './rules.js';

export const PLAYERS = 2;
export const REPEAT_LIMIT = 3;
export const MAX_PLIES = 300;
const MAX_LOGS = 500;
const MAX_EVENTS = 150;

export const COMMAND_FIELDS = { move: ['card', 'from', 'to'], pass: ['card'] };

const isInt = (v) => Number.isInteger(v);

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]（席0：藍、席1：朱）、options: { seed }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        const deck = shuffle([...CARD_IDS], this.random);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null, color: SEAT_COLORS[id]
        }));
        this.board = initialBoard();
        this.hands = [[deck[0], deck[1]], [deck[2], deck[3]]];
        this.side = deck[4];
        this.first = SEAT_COLORS.indexOf(CARDS[this.side].stamp);
        this.current = this.first;
        this.ply = 0;
        this.phase = 'play';         // play / end
        this.winner = null;          // 勝った席（引き分けなら null）
        this.result = null;          // 'stone' | 'stream' | 'repetition' | 'limit'
        this.lastMove = null;
        this.seen = new Map([[positionKey(this.state(), this.current), 1]]);
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`脇のカードは${CARDS[this.side].name}（${this.stampName(this.side)}）。${this.players[this.first].name}が先手`);
    }

    stampName(card) {
        return CARDS[card].stamp === 'blue' ? '藍' : '朱';
    }

    state() {
        return { board: this.board, hands: this.hands, side: this.side };
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.isOver() ? [] : [this.current];
    }

    moves(seat = this.current) {
        return legalMoves(this.state(), seat);
    }

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('今はあなたの番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const ok = command.type === 'move' ? this.move(playerId, command) : this.pass(playerId, command);
        if (!ok) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = command[key];
        });
        this.commands.push({ playerId, command: recorded });
        return true;
    }

    move(seat, { card, from, to }) {
        if (!this.hands[seat].includes(card)) return this.fail('そのカードは手札にありません');
        if (!isInt(from) || !isInt(to) || from < 0 || from >= CELLS || to < 0 || to >= CELLS) return this.fail('マスが正しくありません');
        if (seatOf(this.board[from]) !== seat) return this.fail('自分の駒を選んでください');
        if (!this.moves(seat).some(m => m.card === card && m.from === from && m.to === to)) return this.fail('そのカードでは、そこへ動けません');
        this.advance(seat, { card, from, to });
        return true;
    }

    pass(seat, { card }) {
        if (!this.hands[seat].includes(card)) return this.fail('そのカードは手札にありません');
        if (this.moves(seat).length) return this.fail('動ける手があるときは、動かなければなりません');
        this.advance(seat, { card, pass: true });
        return true;
    }

    // 手を指す（判定はすべて済んでいる）
    advance(seat, move) {
        const p = this.players[seat];
        const piece = move.pass ? null : this.board[move.from];
        const result = applyMove(this.state(), seat, move);
        this.board = result.state.board;
        this.hands = result.state.hands;
        this.side = result.state.side;
        this.ply++;
        this.lastMove = { seat, ...move, captured: result.captured || null, master: piece ? isMaster(piece) : false };
        const cardName = CARDS[move.card].name;
        if (move.pass) this.log(`${p.name}は動けず、${cardName}を脇へ`);
        else this.log(`${p.name}：${cardName}で${isMaster(piece) ? '師匠' : '弟子'}を動かす${result.captured ? `（${isMaster(result.captured) ? '師匠' : '弟子'}を取る）` : ''}`);
        this.pushEvent({ type: 'move', ...this.lastMove, side: move.card });
        if (result.win) return this.finish(seat, result.win);
        this.current = 1 - seat;
        const key = positionKey(this.state(), this.current);
        const count = (this.seen.get(key) ?? 0) + 1;
        this.seen.set(key, count);
        if (count >= REPEAT_LIMIT) return this.finish(null, 'repetition');
        if (this.ply >= MAX_PLIES) return this.finish(null, 'limit');
    }

    finish(winner, result) {
        this.phase = 'end';
        this.winner = winner;
        this.result = result;
        const text = {
            stone: '相手の師匠を取った（石の道）',
            stream: '師匠が相手の神殿の門に入った（川の道）',
            repetition: '同じ局面が3回目（千日手）',
            limit: `${MAX_PLIES}手で決着がつかない`
        }[result];
        this.log(winner === null ? `引き分け：${text}` : `${this.players[winner].name}の勝ち：${text}`);
        this.pushEvent({ type: 'end', winner, result });
    }

    // ---- 記録 ----

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
