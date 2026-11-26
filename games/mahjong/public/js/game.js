/**
 * リーチ麻雀（4人打ち）の進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じ対局を再現できる（牌山の並びと起家はシードから決まる）
 *
 * 局の流れ
 * - turn：手番の人がツモった（または鳴いた）あと。打牌・ツモ和了・カン・九種九牌を選ぶ
 * - call：打牌（または加槓）のあと。ロン・ポン・チー・大明槓ができる人が、全員答えるまで待つ
 *   答えがそろったら、ロン ＞ ポン・カン ＞ チー の順で1つに決める
 * - result：局の結果。全員が「次へ」を送ったら、次の局か終局へ進む
 * - end：終局
 */

import { createRandom, shuffle } from './random.js';
import { kindOf, toCounts, isWind, suitOf, TILE_COUNT, YAOCHU_KINDS, isRed } from './tiles.js';
import { shanten, waitsOf } from './shanten.js';
import { evaluateWin, payments } from './scoring.js';

export const PLAYER_COUNT = 4;
export const START_SCORE = 25000;
export const RETURN_SCORE = 30000; // 西入（延長）の基準。だれもこの点に届かなければ、次の風に入る
export const LENGTHS = { east: '東風戦', south: '半荘戦' };
const MAX_LOGS = 300;
const MAX_EVENTS = 200;
const ROUND_NAMES = ['東', '南', '西', '北'];

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    discard: ['tile', 'riichi'], tsumo: [], kan: ['kind'], kyuushu: [],
    ron: [], pon: ['tiles'], chi: ['tiles'], minkan: [], pass: [], next: []
};
const TURN_COMMANDS = ['discard', 'tsumo', 'kan', 'kyuushu'];
const CALL_COMMANDS = ['ron', 'pon', 'chi', 'minkan', 'pass'];

export const DRAW_REASONS = {
    exhaust: '流局', kyuushu: '九種九牌', suufon: '四風連打', suucha: '四家立直', suukan: '四槓散了', sanchahou: '三家和'
};

export const roundName = (round) => `${ROUND_NAMES[round.wind]}${round.kyoku + 1}局`;

export default class Game {
    // players: [{ name, isCPU }] を4人。options: { seed, length: 'east' | 'south', level: CPU の強さ 'easy' | 'normal'（ルールには関わらない） }
    constructor(players, options = {}) {
        if (players.length !== PLAYER_COUNT) throw new Error('4人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const length = LENGTHS[options.length] ? options.length : 'east';
        this.options = { seed, length, level: options.level === 'easy' ? 'easy' : 'normal' };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, score: START_SCORE
        }));
        this.firstDealer = Math.floor(this.random() * PLAYER_COUNT);
        this.round = { wind: 0, kyoku: 0, honba: 0, kyotaku: 0 };
        this.handNo = 0;
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.result = null;
        this.final = null;
        this.startHand();
    }

    // ---- 状態を読む ----

    get dealer() {
        return (this.firstDealer + this.round.kyoku) % PLAYER_COUNT;
    }

    get roundWind() {
        return 27 + this.round.wind;
    }

    get lastWind() {
        return this.options.length === 'south' ? 1 : 0;
    }

    seatWind(seat) {
        return 27 + (seat - this.dealer + PLAYER_COUNT) % PLAYER_COUNT;
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作が必要な人
    actors() {
        if (this.phase === 'turn') return [this.h.turn];
        if (this.phase === 'call') return Object.keys(this.h.call.responses).map(Number).filter(s => this.h.call.responses[s] === null);
        if (this.phase === 'result') return this.players.map(p => p.id).filter(s => !this.acks.has(s));
        return [];
    }

    doraIndicators() {
        return Array.from({ length: this.h.doraCount }, (_, i) => this.h.dead[4 + 2 * i]);
    }

    uraIndicators() {
        return Array.from({ length: this.h.doraCount }, (_, i) => this.h.dead[5 + 2 * i]);
    }

    totalKans() {
        return this.h.kans.reduce((s, n) => s + n, 0);
    }

    isClosed(seat) {
        return this.h.melds[seat].every(m => m.type === 'ankan');
    }

    // 手の中と鳴いた牌を合わせた枚数（空の待ちを除くため）
    heldCounts(seat) {
        return toCounts([...this.h.hands[seat], ...this.h.melds[seat].flatMap(m => m.tiles)]);
    }

    // 13枚（鳴いた分を除く）のときの待ち
    waits(seat) {
        return waitsOf(toCounts(this.h.hands[seat]), this.h.melds[seat].length, this.heldCounts(seat));
    }

    isTenpai(seat) {
        return this.waits(seat).length > 0;
    }

    // 自分の捨て牌に待ちがある、見逃した、立直のあとに見逃した
    isFuriten(seat) {
        const h = this.h;
        if (h.tempFuriten[seat] || h.riichiFuriten[seat]) return true;
        const discarded = new Set(h.discards[seat].map(d => kindOf(d.tile)));
        return this.waits(seat).some(k => discarded.has(k));
    }

    // 和了の評価に渡す状況
    winContext(seat, winTile, { tsumo = false, chankan = false } = {}) {
        const h = this.h;
        const firstDraw = tsumo && h.noCalls && h.discardCount[seat] === 0;
        return {
            hand: tsumo ? [...h.hands[seat]] : [...h.hands[seat], winTile],
            melds: h.melds[seat].map(m => ({ type: m.type, tiles: [...m.tiles] })),
            winTile, tsumo, chankan,
            seatWind: this.seatWind(seat), roundWind: this.roundWind, dealer: seat === this.dealer,
            riichi: h.riichi[seat], ippatsu: h.ippatsu[seat],
            haitei: tsumo && h.wall.length === 0 && !h.afterKan,
            houtei: !tsumo && !chankan && h.wall.length === 0,
            rinshan: tsumo && h.afterKan,
            tenhou: firstDraw && seat === this.dealer,
            chiihou: firstDraw && seat !== this.dealer,
            doraIndicators: this.doraIndicators(),
            uraIndicators: h.riichi[seat] ? this.uraIndicators() : []
        };
    }

    // 手番の人ができること
    turnOptions(seat) {
        const h = this.h;
        const none = { discards: [], riichi: [], tsumo: false, kans: [], kyuushu: false };
        if (this.phase !== 'turn' || seat !== h.turn) return none;
        const hand = h.hands[seat];
        const inRiichi = h.riichi[seat] > 0;
        const drew = h.drawn !== null;
        const discards = inRiichi ? [h.drawn] : hand.filter(id => !h.kuikae.includes(kindOf(id)));
        const counts = toCounts(hand);
        const meldCount = h.melds[seat].length;

        let riichi = [];
        if (!inRiichi && drew && this.isClosed(seat) && this.players[seat].score >= 1000 && h.wall.length >= 4) {
            const held = this.heldCounts(seat);
            riichi = hand.filter(id => {
                const c = [...counts];
                c[kindOf(id)]--;
                const h2 = [...held];
                h2[kindOf(id)]--;
                return shanten(c, meldCount) === 0 && waitsOf(c, meldCount, h2).length > 0;
            });
        }

        const tsumo = drew && !!evaluateWin(this.winContext(seat, h.drawn, { tsumo: true }));

        const kans = [];
        if (drew && h.wall.length > 0 && this.totalKans() < 4) {
            for (let k = 0; k < 34; k++) {
                if (counts[k] === 4) {
                    if (!inRiichi || (k === kindOf(h.drawn) && this.riichiKanKeepsWaits(seat, k))) kans.push(k);
                }
            }
            if (!inRiichi) {
                h.melds[seat].forEach(m => {
                    const k = kindOf(m.tiles[0]);
                    if (m.type === 'pon' && counts[k] > 0) kans.push(k);
                });
            }
        }

        const kyuushu = drew && h.noCalls && h.discardCount[seat] === 0
            && YAOCHU_KINDS.filter(k => counts[k] > 0).length >= 9;
        return { discards, riichi, tsumo, kans, kyuushu };
    }

    // 立直のあとの暗槓は、待ちが変わらないときだけ
    riichiKanKeepsWaits(seat, kind) {
        const h = this.h;
        const before = toCounts(h.hands[seat]);
        before[kindOf(h.drawn)]--;
        const after = toCounts(h.hands[seat]);
        after[kind] -= 4;
        const meldCount = h.melds[seat].length;
        const w1 = waitsOf(before, meldCount);
        const w2 = waitsOf(after, meldCount + 1);
        return w1.length > 0 && w1.join() === w2.join();
    }

    // 打牌（kind='discard'）か加槓（kind='chankan'）に対して、seat ができること
    callOptions(seat, tile, from, kind) {
        const h = this.h;
        const k = kindOf(tile);
        const opts = { ron: false, pon: [], chi: [], minkan: false };
        if (this.waits(seat).includes(k) && !this.isFuriten(seat)
            && evaluateWin(this.winContext(seat, tile, { chankan: kind === 'chankan' }))) {
            opts.ron = true;
        }
        if (kind !== 'discard' || h.riichi[seat] > 0 || h.wall.length === 0) return opts;
        const hand = h.hands[seat];
        const same = hand.filter(id => kindOf(id) === k);
        // 鳴いたあとに捨てられる牌が残るか（食い替えの禁止）
        const canDiscardAfter = (used, banned) => hand.some(id => !used.includes(id) && !banned.includes(kindOf(id)));
        if (same.length >= 2) {
            variants(same, 2).forEach(pair => {
                if (canDiscardAfter(pair, [k])) opts.pon.push(pair);
            });
        }
        if (same.length >= 3 && this.totalKans() < 4) opts.minkan = true;
        if (seat === (from + 1) % PLAYER_COUNT && k < 27) {
            const inSuit = (x) => x >= 0 && x < 27 && suitOf(x) === suitOf(k);
            [[k - 2, k - 1, k - 3], [k - 1, k + 1, null], [k + 1, k + 2, k + 3]].forEach(([a, b, swap]) => {
                if (!inSuit(a) || !inSuit(b)) return;
                const as = hand.filter(id => kindOf(id) === a);
                const bs = hand.filter(id => kindOf(id) === b);
                if (!as.length || !bs.length) return;
                const banned = swap !== null && inSuit(swap) ? [k, swap] : [k];
                variants(as, 1).forEach(([x]) => variants(bs, 1).forEach(([y]) => {
                    if (canDiscardAfter([x, y], banned)) opts.chi.push([x, y]);
                }));
            });
        }
        return opts;
    }

    // seat が今できること（画面と CPU が使う）
    optionsFor(seat) {
        if (this.phase === 'turn' && seat === this.h.turn) return { type: 'turn', ...this.turnOptions(seat) };
        if (this.phase === 'call' && this.h.call.responses[seat] === null) {
            return { type: 'call', ...this.h.call.options[seat] };
        }
        if (this.phase === 'result' && !this.acks.has(seat)) return { type: 'next' };
        return null;
    }

    // ---- 操作 ----

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('対局は終わっています');
        if (!this.players[playerId]) return this.fail('参加していません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) {
            return this.fail('今はその操作はできません');
        }
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => {
            if (command[key] !== undefined) recorded[key] = structuredClone(command[key]);
        });
        let ok;
        if (this.phase === 'turn') {
            if (!TURN_COMMANDS.includes(command.type)) return this.fail('今はその操作はできません');
            if (playerId !== this.h.turn) return this.fail('あなたの番ではありません');
            ok = this.turnCommand(playerId, recorded);
        } else if (this.phase === 'call') {
            if (!CALL_COMMANDS.includes(command.type)) return this.fail('今はその操作はできません');
            if (this.h.call.responses[playerId] !== null) return this.fail('今はその操作はできません');
            ok = this.callCommand(playerId, recorded);
        } else {
            if (command.type !== 'next' || this.acks.has(playerId)) return this.fail('今はその操作はできません');
            ok = true;
        }
        if (!ok) return false;
        this.commands.push({ playerId, command: recorded });
        if (this.phase === 'result') {
            this.acks.add(playerId);
            if (this.acks.size === PLAYER_COUNT) this.advance();
        }
        return true;
    }

    turnCommand(seat, command) {
        const opts = this.turnOptions(seat);
        const h = this.h;
        if (command.type === 'discard') {
            const tile = command.tile;
            if (command.riichi) {
                if (!opts.riichi.includes(tile)) return this.fail('その牌では立直できません');
            } else if (!opts.discards.includes(tile)) {
                return this.fail(h.riichi[seat] ? '立直のあとは、ツモった牌を捨てます' : 'その牌は捨てられません');
            }
            this.discard(seat, tile, !!command.riichi);
            return true;
        }
        if (command.type === 'tsumo') {
            if (!opts.tsumo) return this.fail('和了できません');
            this.settleWin([seat], null, h.drawn, { tsumo: true });
            return true;
        }
        if (command.type === 'kan') {
            if (!opts.kans.includes(command.kind)) return this.fail('カンできません');
            this.declareKan(seat, command.kind);
            return true;
        }
        if (command.type === 'kyuushu') {
            if (!opts.kyuushu) return this.fail('九種九牌ではありません');
            this.log(`${this.players[seat].name}：九種九牌`);
            this.emit({ type: 'call', seat, call: 'kyuushu' });
            this.abortHand('kyuushu');
            return true;
        }
        return this.fail('今はその操作はできません');
    }

    callCommand(seat, command) {
        const opts = this.h.call.options[seat];
        const sameTiles = (a, b) => Array.isArray(a) && a.length === b.length && [...a].sort().join() === [...b].sort().join();
        if (command.type === 'ron' && !opts.ron) return this.fail('ロンできません');
        if (command.type === 'minkan' && !opts.minkan) return this.fail('カンできません');
        if (command.type === 'pon') {
            const match = opts.pon.find(p => sameTiles(command.tiles, p));
            if (!match) return this.fail('ポンできません');
            command.tiles = [...match];
        }
        if (command.type === 'chi') {
            const match = opts.chi.find(p => sameTiles(command.tiles, p));
            if (!match) return this.fail('チーできません');
            command.tiles = [...match];
        }
        this.h.call.responses[seat] = command;
        if (Object.values(this.h.call.responses).every(r => r !== null)) this.resolveCall();
        return true;
    }

    // ---- 局の進行 ----

    startHand() {
        const dealer = this.dealer;
        const tiles = shuffle(Array.from({ length: TILE_COUNT }, (_, i) => i), this.random);
        const dead = tiles.splice(0, 14);
        this.h = {
            wall: tiles,            // 山（末尾からツモる）
            dead,                   // 王牌。0〜3 が嶺上牌、4・6・8… がドラ表示牌、5・7・9… が裏ドラ表示牌
            doraCount: 1,
            rinshan: 0,
            hands: [[], [], [], []],
            melds: [[], [], [], []],
            discards: [[], [], [], []],
            riichi: [0, 0, 0, 0],   // 0：なし・1：立直・2：ダブル立直
            ippatsu: [false, false, false, false],
            riichiPending: null,    // 立直を宣言した打牌が通るまで（ロンされたら立直は成立しない）
            tempFuriten: [false, false, false, false],
            riichiFuriten: [false, false, false, false],
            noCalls: true,          // まだだれも鳴いていない（暗槓を含む）。ダブル立直・天和・地和・九種九牌・四風連打に使う
            discardCount: [0, 0, 0, 0],
            kans: [0, 0, 0, 0],
            turn: dealer,
            drawn: null,            // ツモった牌（鳴いたあとは null）
            afterKan: false,
            kuikae: [],             // 鳴いた直後に捨てられない種類
            call: null,
            pendingKakan: null,
            lastDiscard: null
        };
        for (let n = 0; n < 13; n++) {
            for (let i = 0; i < PLAYER_COUNT; i++) this.h.hands[(dealer + i) % PLAYER_COUNT].push(this.h.wall.pop());
        }
        this.handNo++;
        this.result = null;
        this.phase = 'turn';
        this.log(`${roundName(this.round)} ${this.round.honba}本場`);
        this.emit({ type: 'start', round: { ...this.round }, dealer });
        this.drawTile(dealer, false);
    }

    drawTile(seat, rinshan) {
        const h = this.h;
        const tile = rinshan ? h.dead[h.rinshan++] : h.wall.pop();
        if (rinshan) h.wall.shift(); // 王牌を14枚に保つため、山の反対の端を1枚減らす
        h.hands[seat].push(tile);
        h.drawn = tile;
        h.afterKan = rinshan;
        h.turn = seat;
        h.kuikae = [];
        this.phase = 'turn';
        this.emit({ type: 'draw', seat, rinshan });
    }

    discard(seat, tile, riichi) {
        const h = this.h;
        const hand = h.hands[seat];
        hand.splice(hand.indexOf(tile), 1);
        if (!riichi && h.ippatsu[seat]) h.ippatsu[seat] = false;
        h.tempFuriten[seat] = false;
        h.discards[seat].push({ tile, riichi, called: false, tsumogiri: tile === h.drawn });
        if (riichi) {
            h.riichiPending = { seat, double: h.noCalls && h.discardCount[seat] === 0 };
            this.emit({ type: 'call', seat, call: 'riichi' });
        }
        h.discardCount[seat]++;
        h.drawn = null;
        h.afterKan = false;
        h.kuikae = [];
        h.lastDiscard = { seat, tile };
        this.emit({ type: 'discard', seat, tile, riichi });
        this.openCallWindow(seat, tile, 'discard');
    }

    openCallWindow(from, tile, kind) {
        const h = this.h;
        const options = {};
        const responses = {};
        for (let d = 1; d < PLAYER_COUNT; d++) {
            const seat = (from + d) % PLAYER_COUNT;
            const o = this.callOptions(seat, tile, from, kind);
            if (o.ron || o.pon.length || o.chi.length || o.minkan) {
                options[seat] = o;
                responses[seat] = null;
            }
        }
        h.call = { tile, from, kind, options, responses };
        this.phase = 'call';
        if (Object.keys(responses).length === 0) this.resolveCall();
    }

    resolveCall() {
        const h = this.h;
        const call = h.call;
        h.call = null;
        const k = kindOf(call.tile);
        const order = [1, 2, 3].map(d => (call.from + d) % PLAYER_COUNT);
        // 和了できる牌を見逃した人はフリテン（立直していれば、その局の終わりまで）
        order.forEach(seat => {
            if (call.responses[seat]?.type === 'ron' || !this.waits(seat).includes(k)) return;
            if (h.riichi[seat]) h.riichiFuriten[seat] = true;
            else h.tempFuriten[seat] = true;
        });
        const rons = order.filter(seat => call.responses[seat]?.type === 'ron');
        if (rons.length === 3) {
            h.riichiPending = null;
            rons.forEach(seat => this.emit({ type: 'call', seat, call: 'ron' }));
            this.abortHand('sanchahou');
            return;
        }
        if (rons.length) {
            this.settleWin(rons, call.from, call.tile, { chankan: call.kind === 'chankan' });
            return;
        }
        if (call.kind === 'chankan') {
            this.completeKakan(call.from, call.tile);
            return;
        }
        this.establishRiichi();
        const ponSeat = order.find(seat => ['pon', 'minkan'].includes(call.responses[seat]?.type));
        const chiSeat = order.find(seat => call.responses[seat]?.type === 'chi');
        const caller = ponSeat ?? chiSeat;
        if (caller !== undefined) {
            this.makeCall(caller, call.responses[caller], call);
            return;
        }
        this.afterDiscard();
    }

    establishRiichi() {
        const h = this.h;
        const pending = h.riichiPending;
        if (!pending) return;
        h.riichiPending = null;
        h.riichi[pending.seat] = pending.double ? 2 : 1;
        h.ippatsu[pending.seat] = true;
        this.players[pending.seat].score -= 1000;
        this.round.kyotaku++;
        this.log(`${this.players[pending.seat].name}：${pending.double ? 'ダブル立直' : '立直'}`);
    }

    makeCall(seat, response, call) {
        const h = this.h;
        const from = call.from;
        const k = kindOf(call.tile);
        const hand = h.hands[seat];
        const used = response.type === 'minkan' ? hand.filter(id => kindOf(id) === k).slice(0, 3) : response.tiles;
        used.forEach(id => hand.splice(hand.indexOf(id), 1));
        h.discards[from].at(-1).called = true;
        const type = response.type;
        h.melds[seat].push({ type, tiles: [...used, call.tile].sort((a, b) => a - b), called: call.tile, from });
        h.noCalls = false;
        h.ippatsu.fill(false);
        const names = { pon: 'ポン', chi: 'チー', minkan: 'カン' };
        this.log(`${this.players[seat].name}：${names[type]}`);
        this.emit({ type: 'call', seat, call: type === 'minkan' ? 'kan' : type, from });
        if (type === 'minkan') {
            h.kans[seat]++;
            this.kanDraw(seat);
            return;
        }
        h.turn = seat;
        h.drawn = null;
        h.afterKan = false;
        if (type === 'pon') {
            h.kuikae = [k];
        } else {
            const kinds = [...used.map(kindOf), k].sort((a, b) => a - b);
            const banned = [k];
            if (kinds[0] === k && k % 9 <= 5) banned.push(k + 3);
            if (kinds[2] === k && k % 9 >= 3) banned.push(k - 3);
            h.kuikae = banned;
        }
        this.phase = 'turn';
    }

    declareKan(seat, kind) {
        const h = this.h;
        const hand = h.hands[seat];
        const same = hand.filter(id => kindOf(id) === kind);
        if (same.length === 4) {
            same.forEach(id => hand.splice(hand.indexOf(id), 1));
            h.melds[seat].push({ type: 'ankan', tiles: same, called: null, from: seat });
            h.kans[seat]++;
            h.noCalls = false;
            h.ippatsu.fill(false);
            this.log(`${this.players[seat].name}：暗槓`);
            this.emit({ type: 'call', seat, call: 'kan' });
            this.kanDraw(seat);
            return;
        }
        // 加槓：ほかの人の槍槓を待つ
        const tile = same[0];
        hand.splice(hand.indexOf(tile), 1);
        h.drawn = null;
        h.pendingKakan = { seat, tile };
        this.emit({ type: 'call', seat, call: 'kan' });
        this.openCallWindow(seat, tile, 'chankan');
    }

    completeKakan(seat, tile) {
        const h = this.h;
        const meld = h.melds[seat].find(m => m.type === 'pon' && kindOf(m.tiles[0]) === kindOf(tile));
        meld.type = 'kakan';
        meld.tiles = [...meld.tiles, tile].sort((a, b) => a - b);
        meld.added = tile;
        h.pendingKakan = null;
        h.kans[seat]++;
        h.noCalls = false;
        h.ippatsu.fill(false);
        this.log(`${this.players[seat].name}：加槓`);
        this.kanDraw(seat);
    }

    // カンのあと：新しいドラをめくり、嶺上牌をツモる（ドラは、どのカンでもすぐにめくる）
    kanDraw(seat) {
        this.h.doraCount++;
        this.drawTile(seat, true);
    }

    afterDiscard() {
        const h = this.h;
        const firsts = h.discards.map(list => list[0]);
        if (h.noCalls && h.discardCount.every(n => n === 1) && isWind(kindOf(firsts[0].tile))
            && firsts.every(d => kindOf(d.tile) === kindOf(firsts[0].tile))) {
            this.abortHand('suufon');
            return;
        }
        if (h.riichi.every(r => r > 0)) {
            this.abortHand('suucha');
            return;
        }
        if (this.totalKans() === 4 && !h.kans.includes(4)) {
            this.abortHand('suukan');
            return;
        }
        if (h.wall.length === 0) {
            this.exhaustiveDraw();
            return;
        }
        this.drawTile((h.lastDiscard.seat + 1) % PLAYER_COUNT, false);
    }

    // ---- 局の終わり ----

    settleWin(winners, from, tile, { tsumo = false, chankan = false } = {}) {
        const h = this.h;
        h.riichiPending = null; // 立直の宣言牌でロンされたら、立直は成立しない
        const dealer = this.dealer;
        const honba = this.round.honba;
        const deltas = [0, 0, 0, 0];
        const wins = winners.map(seat => {
            const ctx = this.winContext(seat, tile, { tsumo, chankan });
            const r = evaluateWin(ctx);
            const pay = payments(r.base, { dealer: seat === dealer, tsumo, honba });
            if (tsumo) {
                this.players.forEach(p => {
                    if (p.id === seat) return;
                    const amount = p.id === dealer ? pay.dealer : pay.child;
                    deltas[p.id] -= amount;
                    deltas[seat] += amount;
                });
            } else {
                deltas[from] -= pay.ron;
                deltas[seat] += pay.ron;
            }
            this.emit({ type: 'call', seat, call: tsumo ? 'tsumo' : 'ron', from });
            return {
                seat, from, tsumo, tile,
                hand: [...ctx.hand].sort((a, b) => a - b),
                melds: structuredClone(h.melds[seat]),
                han: r.han, fu: r.fu, yakuman: r.yakuman, yaku: r.yaku, limit: r.limit,
                points: tsumo ? pay.total : pay.ron, pay,
                riichi: h.riichi[seat] > 0
            };
        });
        // 供託は、放銃者から見て一番近い和了者がもらう
        const sticks = this.round.kyotaku;
        deltas[winners[0]] += sticks * 1000;
        this.round.kyotaku = 0;
        deltas.forEach((d, i) => { this.players[i].score += d; });
        wins.forEach(w => {
            const how = w.tsumo ? 'ツモ' : `ロン（${this.players[w.from].name}から）`;
            this.log(`${this.players[w.seat].name}：${how} ${w.limit || `${w.fu}符${w.han}翻`} ${w.points}点`);
        });
        const dealerWon = winners.includes(dealer);
        this.finishHand({
            type: 'win', wins, deltas, sticks,
            uraIndicators: wins.some(w => w.riichi) ? this.uraIndicators() : []
        }, { renchan: dealerWon, honba: dealerWon ? honba + 1 : 0 });
    }

    exhaustiveDraw() {
        const tenpai = this.players.map(p => this.isTenpai(p.id));
        const count = tenpai.filter(Boolean).length;
        const deltas = [0, 0, 0, 0];
        if (count > 0 && count < PLAYER_COUNT) {
            tenpai.forEach((t, i) => { deltas[i] = t ? 3000 / count : -3000 / (PLAYER_COUNT - count); });
        }
        deltas.forEach((d, i) => { this.players[i].score += d; });
        const hands = tenpai.map((t, i) => (t ? [...this.h.hands[i]].sort((a, b) => a - b) : null));
        this.log(`流局（テンパイ：${tenpai.map((t, i) => (t ? this.players[i].name : null)).filter(Boolean).join('・') || 'なし'}）`);
        this.finishHand({ type: 'draw', reason: 'exhaust', tenpai, hands, deltas },
            { renchan: tenpai[this.dealer], honba: this.round.honba + 1 });
    }

    abortHand(reason) {
        this.log(`途中流局：${DRAW_REASONS[reason]}`);
        this.finishHand({ type: 'draw', reason, tenpai: null, hands: null, deltas: [0, 0, 0, 0] },
            { renchan: true, honba: this.round.honba + 1 });
    }

    finishHand(result, next) {
        this.result = {
            ...result,
            round: { ...this.round },
            dealer: this.dealer,
            doraIndicators: this.doraIndicators(),
            scores: this.players.map(p => p.score)
        };
        this.next = next;
        this.phase = 'result';
        this.acks = new Set();
        this.emit({ type: 'result' });
    }

    // 全員が結果を見たら、次の局か終局へ
    advance() {
        const { renchan, honba } = this.next;
        const round = this.round;
        const scores = this.players.map(p => p.score);
        const top = Math.max(...scores);
        const lastWind = this.lastWind;
        const allLast = round.wind >= lastWind && round.kyoku === 3;
        const dealer = this.dealer;
        // 箱割れ（0点未満）で終わり
        if (scores.some(s => s < 0)) return this.endMatch();
        // 延長（西入など）では、だれかが基準点に届いたら終わり
        if (round.wind > lastWind && top >= RETURN_SCORE) return this.endMatch();
        if (renchan) {
            // オーラスの親が和了・テンパイで、基準点以上の単独トップなら終わり（和了止め・テンパイ止め）
            const dealerTop = scores[dealer] === top && scores.filter(s => s === top).length === 1;
            if (allLast && dealerTop && scores[dealer] >= RETURN_SCORE) return this.endMatch();
            round.honba = honba;
            this.startHand();
            return;
        }
        let wind = round.wind;
        let kyoku = round.kyoku + 1;
        if (kyoku === 4) { wind++; kyoku = 0; }
        if (wind > lastWind && (top >= RETURN_SCORE || wind > lastWind + 1)) return this.endMatch();
        round.wind = wind;
        round.kyoku = kyoku;
        round.honba = honba;
        this.startHand();
    }

    // 順位は点数の順。同点は起家に近い順。残った供託はトップがもらう
    standings() {
        const order = (seat) => (seat - this.firstDealer + PLAYER_COUNT) % PLAYER_COUNT;
        return [...this.players].sort((a, b) => b.score - a.score || order(a.id) - order(b.id)).map(p => p.id);
    }

    endMatch() {
        const ranking = this.standings();
        this.players[ranking[0]].score += this.round.kyotaku * 1000;
        this.round.kyotaku = 0;
        this.phase = 'end';
        this.final = ranking.map((seat, i) => ({ seat, rank: i + 1, score: this.players[seat].score }));
        this.log(`終局：${this.players[ranking[0]].name}がトップ`);
        this.emit({ type: 'end' });
    }

    // ---- 道具 ----

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

    // 操作の記録から同じ対局を作り直す
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

// 同じ種類の牌から n 枚選ぶ組み合わせのうち、赤かどうかで見分けられるものだけ（赤あり・赤なしの2通りまで）
function variants(tiles, n) {
    const reds = tiles.filter(isRed);
    const plain = tiles.filter(id => !isRed(id));
    const list = [];
    for (let r = Math.min(reds.length, n); r >= 0; r--) {
        if (plain.length >= n - r) list.push([...reds.slice(0, r), ...plain.slice(0, n - r)]);
    }
    return list;
}
