/**
 * 世界の七不思議デュエルの進行（基本ゲーム）
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（カードの並びはシードから決まる）
 *
 * ルール
 * - 準備：各自7コイン。進歩トークン10枚から5枚を盤に並べる（残りの5枚は使わない。大図書館で引く）
 *   七不思議12枚から8枚を選び、4枚ずつ2回ドラフトする。1回目は先手が1枚 → 後手が2枚 → 先手が残り1枚、
 *   2回目は後手が1枚 → 先手が2枚 → 後手が残り1枚。残りの4枚は使わない
 * - 各時代のカード23枚から3枚を見ずに抜き、20枚を決まった形に並べる（表の行と裏の行が交互）
 *   時代IIIは、時代IIIのカード20枚から3枚を抜いた17枚に、ギルド7枚から3枚を混ぜる
 * - 手番：ほかのカードに覆われていないカードを1枚取り、次のどれかに使う
 *   建てる（費用を払う。連鎖の印があれば無料）／捨てて 2＋自分の黄のカードの数 のコインを得る／七不思議を建てる
 *   取ったことで覆いがなくなった裏のカードは、表にする
 * - 資源は自分のカードで生む。足りない分は1つにつき 2＋相手の茶と灰のカードが生むその資源の数 のコインで買う（銀行に払う）
 * - 七不思議は、2人合わせて7つまで。7つ目が建ったら、残りの1つは使わない
 * - 軍事：盾1つにつき、駒を相手の都へ1マス進める。3マス目と6マス目のトークンで、相手は2コインと5コインを失う。
 *   9マス目（相手の都）に着いたら、その場で勝ち（軍事の勝利）
 * - 科学：同じ印を2つそろえたら、盤の進歩トークンを1枚取る。違う印を6種類そろえたら、その場で勝ち（科学の勝利）
 * - 時代の終わり：軍事で負けている方が、次の時代の先手を決める。並んでいれば、最後のカードを取った人が決める
 * - 時代IIIの終わりに、点の多い方の勝ち。同点なら青のカードの点の多い方。それも同じなら引き分け
 *
 * ルールブックに書かれていない、または読み方が分かれる点は、次のように決めた（README にも書く）
 * - 時代の最後のカードで「もう1手」の七不思議を建てたら、もう1手は失われる（次の時代の先手は、ふだんどおりに決める）
 * - 捨て札は全員に見える（取るときに表だったカードしか捨てられないため）
 * - 銀行のコインは尽きない
 */

import { createRandom, shuffle } from './random.js';
import {
    CARDS, AGE_CARDS, GUILDS, WONDERS, WONDER_ORDER, TOKENS, TOKEN_ORDER, RESOURCES,
    layoutSlots, STARTING_COINS, MAX_WONDERS, CARDS_PER_AGE, GUILDS_IN_AGE3, MILITARY_TOKENS, MILITARY_WIN, militaryPoints
} from './cards.js';

export { CARDS, WONDERS, TOKENS };

export const PLAYERS = 2;
const MAX_LOGS = 300;
const MAX_EVENTS = 80;
const REDUCTION = 2;      // 石工・建築で減る資源の数
const URBANISM_COINS = 4;
const TOKEN_COINS = 6;    // 農業・都市計画
const LIBRARY_DRAW = 3;
export const ROMAN = ['', 'I', 'II', 'III'];

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    pickWonder: ['wonder'],
    build: ['slot'], discard: ['slot'], wonder: ['slot', 'wonder'],
    progress: ['token'], destroy: ['card'], revive: ['card'], starter: ['seat']
};

const other = (seat) => 1 - seat;

// ---- 都市を数える（ゲームの状態を変えない関数。CPU と画面でも使う） ----

export const cardsOfColor = (player, color) => player.cards.filter(k => CARDS[k].color === color);
export const builtWonders = (player) => player.wonders.filter(w => w.built);

// 茶と灰のカードが生む資源（相手の買う値段にも使う）
export function fixedProduction(player) {
    const out = Object.fromEntries(RESOURCES.map(r => [r, 0]));
    player.cards.forEach(k => {
        const produce = CARDS[k].produce;
        if (produce) Object.entries(produce).forEach(([r, n]) => { out[r] += n; });
    });
    return out;
}

// 「どれか1つ」を生むもの（黄のカードと七不思議）
export function choiceSources(player) {
    return [
        ...player.cards.map(k => CARDS[k].choice).filter(Boolean),
        ...builtWonders(player).map(w => WONDERS[w.key].choice).filter(Boolean)
    ];
}

// 1コインで買える資源
export function reserves(player) {
    return new Set(player.cards.flatMap(k => CARDS[k].reserve ?? []));
}

// 資源1つを買う値段
export function tradePrice(player, opponent, resource) {
    if (reserves(player).has(resource)) return 1;
    return 2 + fixedProduction(opponent)[resource];
}

// 費用を払うのに要るコイン。trade は資源を買う分（経済のトークンで相手に渡る分）
// 「どれか1つ」の割り振りをすべて試し、石工・建築の割引は、買うと一番高い資源から当てる
export function payment(player, opponent, cost, reduction = 0) {
    const fixed = fixedProduction(player);
    const need = Object.fromEntries(RESOURCES.map(r => [r, Math.max(0, cost[r] - fixed[r])]));
    const choices = choiceSources(player);
    const prices = Object.fromEntries(RESOURCES.map(r => [r, tradePrice(player, opponent, r)]));
    let best = Infinity;
    const visit = (i) => {
        if (i === choices.length) {
            const units = RESOURCES.flatMap(r => Array(need[r]).fill(prices[r])).sort((a, b) => b - a);
            best = Math.min(best, units.slice(reduction).reduce((s, v) => s + v, 0));
            return;
        }
        visit(i + 1);
        for (const r of new Set(choices[i])) {
            if (need[r] === 0) continue;
            need[r] -= 1;
            visit(i + 1);
            need[r] += 1;
        }
    };
    visit(0);
    return { coins: cost.coins + best, trade: best, chain: false };
}

export const hasChain = (player, symbol) => !!symbol && player.cards.some(k => CARDS[k].chain === symbol);

// 科学の印（緑のカードと、法のトークン）
export function scienceSymbols(player) {
    const list = player.cards.map(k => CARDS[k].science).filter(Boolean);
    if (player.tokens.includes('law')) list.push('law');
    return list;
}

export const distinctScience = (player) => new Set(scienceSymbols(player)).size;

// ギルドで数える値（その都市の分）
function guildCount(player, count) {
    if (count[0] === 'wonders') return builtWonders(player).length;
    if (count[0] === 'money') return Math.floor(player.coins / 3);
    return player.cards.filter(k => count.includes(CARDS[k].color)).length;
}

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed, startPlayer }
    constructor(players, options = {}) {
        if (players.length !== PLAYERS) throw new Error('2人で遊ぶゲームです');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        // 指定があっても乱数は同じ回数だけ使う（保存した options で再現したときに、並びがずれないように）
        const drawn = Math.floor(this.random() * PLAYERS);
        // CPU の迷いに使う値（ビューには入れない。ゲームの乱数とは別に、CPU が自分で乱数を作るため）
        this.cpuSalt = Math.floor(this.random() * 2 ** 32) >>> 0;
        this.options = { seed, startPlayer: options.startPlayer ?? drawn };
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            coins: STARTING_COINS, cards: [], wonders: [], tokens: []
        }));

        // 七不思議：4枚ずつ2回のドラフト。残りの4枚は使わない
        const wonders = shuffle([...WONDER_ORDER], this.random);
        this.wonderOffers = [wonders.slice(0, 4), wonders.slice(4, 8)];
        this.unusedWonders = wonders.slice(8);
        // 進歩トークン：5枚を盤に、残りは使わない（大図書館で引く）
        const tokens = shuffle([...TOKEN_ORDER], this.random);
        this.tokensBoard = tokens.slice(0, 5);
        this.tokensOut = tokens.slice(5);
        // 各時代のカード（見ずに抜いた3枚は使わない）
        this.decks = {};
        this.removed = {};
        [1, 2, 3].forEach(age => {
            const deck = shuffle([...AGE_CARDS[age - 1]], this.random);
            if (age === 3) {
                const guilds = shuffle([...GUILDS], this.random);
                const used = shuffle([...deck.slice(0, CARDS_PER_AGE - GUILDS_IN_AGE3), ...guilds.slice(0, GUILDS_IN_AGE3)], this.random);
                this.decks[age] = used;
                this.removed[age] = [...deck.slice(CARDS_PER_AGE - GUILDS_IN_AGE3), ...guilds.slice(GUILDS_IN_AGE3)];
            } else {
                this.decks[age] = deck.slice(0, CARDS_PER_AGE);
                this.removed[age] = deck.slice(CARDS_PER_AGE);
            }
        });

        this.first = this.options.startPlayer;
        const second = other(this.first);
        this.draft = { round: 0, offer: [...this.wonderOffers[0]], order: [this.first, second, second, this.first], step: 0 };
        this.age = 0;
        this.structure = [];
        this.discardPile = [];
        this.military = 0;          // 正なら席0が優勢（席1の都へ向かう）、負なら席1が優勢
        this.militaryTokens = [0, 1].flatMap(loser => MILITARY_TOKENS.map(t => ({ loser, at: t.at, coins: t.coins, taken: false })));
        this.current = this.first;
        this.turn = 1;
        this.phase = 'draft';       // draft：七不思議を選ぶ / play：カードを取る / progress：進歩トークンを選ぶ / library：大図書館 /
        //                             destroy：相手のカードを捨てさせる / revive：霊廟 / starter：次の時代の先手を決める / end：終わり
        this.pending = [];          // これから選ぶこと [{ type, seat, color }]
        this.libraryDraw = [];      // 大図書館で引いた進歩トークン（引いた人にだけ見える）
        this.replayTurn = false;    // この番のあとに、もう1手
        this.lastTaker = null;
        this.chooser = null;        // 次の時代の先手を決める人
        this.winner = null;
        this.victory = null;        // military / science / civil / draw
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.first].name}が先手です。七不思議を選びます`);
    }

    isOver() {
        return this.phase === 'end';
    }

    // 操作を待っている人
    actors() {
        if (this.phase === 'end') return [];
        if (this.phase === 'draft') return [this.draft.order[this.draft.step]];
        if (this.phase === 'starter') return [this.chooser];
        if (this.pending.length) return [this.pending[0].seat];
        return [this.current];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        const handler = {
            draft: { pickWonder: this.pickWonder },
            play: { build: this.build, discard: this.discard, wonder: this.buildWonder },
            progress: { progress: this.takeProgress },
            library: { progress: this.takeLibrary },
            destroy: { destroy: this.destroy },
            revive: { revive: this.revive },
            starter: { starter: this.chooseStarter }
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

    // ---- 七不思議のドラフト ----

    pickWonder(seat, { wonder }) {
        if (!this.draft.offer.includes(wonder)) return this.fail('その七不思議は選べません');
        this.giveWonder(seat, wonder);
        // 最後の1枚は、残った人に自動で渡す
        if (this.draft.offer.length === 1) this.giveWonder(this.draft.order[3], this.draft.offer[0]);
        if (this.draft.offer.length === 0) {
            if (this.draft.round === 0) {
                const second = other(this.first);
                this.draft = { round: 1, offer: [...this.wonderOffers[1]], order: [second, this.first, this.first, second], step: 0 };
                this.emit({ type: 'draftRound', round: 1 });
            } else {
                this.startAge(1, this.first);
            }
        }
        return true;
    }

    giveWonder(seat, key) {
        this.draft.offer = this.draft.offer.filter(k => k !== key);
        this.draft.step += 1;
        this.players[seat].wonders.push({ key, built: false, card: null });
        this.emit({ type: 'pickWonder', seat, wonder: key });
        this.log(`${this.players[seat].name}：${WONDERS[key].name}`);
    }

    // ---- 時代 ----

    startAge(age, starter) {
        this.age = age;
        this.structure = layoutSlots(age).map((slot, i) => ({ ...slot, key: this.decks[age][i], taken: false }));
        this.current = starter;
        this.phase = 'play';
        this.chooser = null;
        this.emit({ type: 'age', age, starter });
        this.log(`時代${ROMAN[age]}：${this.players[starter].name}から`);
    }

    // 覆っているカード（すぐ下の行の、横に重なる取られていないカード）がなければ取れる
    isAccessible(index) {
        const slot = this.structure[index];
        if (!slot || slot.taken) return false;
        return !this.structure.some(s => !s.taken && s.row === slot.row + 1 && Math.abs(s.x - slot.x) < 2);
    }

    accessibleSlots() {
        return this.structure.map((_, i) => i).filter(i => this.isAccessible(i));
    }

    // 取れるカードの番号か。取れなければ理由を lastError に入れる
    checkSlot(slot) {
        if (!Number.isInteger(slot) || !this.isAccessible(slot)) {
            this.fail('そのカードは取れません');
            return false;
        }
        return true;
    }

    takeSlot(seat, slot, action) {
        const s = this.structure[slot];
        s.taken = true;
        this.lastTaker = seat;
        this.emit({ type: 'take', seat, slot, card: s.key, action });
        // 覆いがなくなった裏のカードを表にする
        const revealed = this.structure.map((_, i) => i).filter(i => !this.structure[i].faceUp && this.isAccessible(i));
        revealed.forEach(i => { this.structure[i].faceUp = true; });
        if (revealed.length) this.emit({ type: 'reveal', slots: revealed });
        return s.key;
    }

    // ---- 値段 ----

    // カードを建てるのに要るコイン（連鎖なら0）
    cardPrice(seat, key) {
        const player = this.players[seat];
        const card = CARDS[key];
        if (hasChain(player, card.free)) return { coins: 0, trade: 0, chain: true };
        const reduction = card.color === 'blue' && player.tokens.includes('masonry') ? REDUCTION : 0;
        return payment(player, this.players[other(seat)], card.cost, reduction);
    }

    wonderPrice(seat, key) {
        const player = this.players[seat];
        const reduction = player.tokens.includes('architecture') ? REDUCTION : 0;
        return payment(player, this.players[other(seat)], WONDERS[key].cost, reduction);
    }

    discardValue(seat) {
        return 2 + cardsOfColor(this.players[seat], 'yellow').length;
    }

    wondersBuiltTotal() {
        return this.players.reduce((n, p) => n + builtWonders(p).length, 0);
    }

    // 建てられる七不思議（まだ建てていない、7つに達していない）
    canBuildWonder(seat, key) {
        const w = this.players[seat].wonders.find(x => x.key === key);
        if (!w || w.built || this.wondersBuiltTotal() >= MAX_WONDERS) return false;
        return this.wonderPrice(seat, key).coins <= this.players[seat].coins;
    }

    // ---- カードを使う ----

    build(seat, { slot }) {
        if (!this.checkSlot(slot)) return false;
        const key = this.structure[slot].key;
        const price = this.cardPrice(seat, key);
        if (price.coins > this.players[seat].coins) return this.fail('コインが足りません');
        this.takeSlot(seat, slot, 'build');
        this.pay(seat, price);
        this.players[seat].cards.push(key);
        this.log(`${this.players[seat].name}：${CARDS[key].name}を建てた${price.chain ? '（連鎖）' : price.coins ? `（${price.coins}コイン）` : ''}`);
        this.applyCard(seat, key, price.chain);
        this.afterAction();
        return true;
    }

    discard(seat, { slot }) {
        if (!this.checkSlot(slot)) return false;
        const coins = this.discardValue(seat);
        const key = this.takeSlot(seat, slot, 'discard');
        this.discardPile.push(key);
        this.gain(seat, coins);
        this.log(`${this.players[seat].name}：${CARDS[key].name}を捨てて${coins}コイン`);
        this.afterAction();
        return true;
    }

    buildWonder(seat, { slot, wonder }) {
        if (!this.checkSlot(slot)) return false;
        const w = this.players[seat].wonders.find(x => x.key === wonder);
        if (!w || w.built) return this.fail('その七不思議は建てられません');
        if (this.wondersBuiltTotal() >= MAX_WONDERS) return this.fail('七不思議はもう建てられません');
        const price = this.wonderPrice(seat, wonder);
        if (price.coins > this.players[seat].coins) return this.fail('コインが足りません');
        const key = this.takeSlot(seat, slot, 'wonder');
        this.pay(seat, price);
        w.built = true;
        w.card = key;
        w.age = this.age;
        this.emit({ type: 'wonder', seat, wonder });
        this.log(`${this.players[seat].name}：${WONDERS[wonder].name}を建てた${price.coins ? `（${price.coins}コイン）` : ''}`);
        this.applyWonder(seat, wonder);
        // 7つ目が建ったら、残りの七不思議は使わない
        if (this.wondersBuiltTotal() === MAX_WONDERS) {
            this.players.forEach(p => {
                p.wonders.filter(x => !x.built).forEach(x => {
                    x.removed = true;
                    this.log(`7つの七不思議が建ったので、${p.name}の${WONDERS[x.key].name}は建てられなくなった`);
                });
                p.wonders = p.wonders.filter(x => !x.removed);
            });
        }
        this.afterAction();
        return true;
    }

    // 払う。資源を買った分は、相手が経済のトークンを持っていれば相手へ
    pay(seat, price) {
        if (price.coins <= 0) return;
        this.players[seat].coins -= price.coins;
        this.emit({ type: 'coins', seat, delta: -price.coins });
        const opponent = this.players[other(seat)];
        if (price.trade > 0 && opponent.tokens.includes('economy')) {
            opponent.coins += price.trade;
            this.emit({ type: 'coins', seat: other(seat), delta: price.trade });
            this.log(`${opponent.name}：経済で${price.trade}コイン`);
        }
    }

    gain(seat, coins) {
        if (coins <= 0) return;
        this.players[seat].coins += coins;
        this.emit({ type: 'coins', seat, delta: coins });
    }

    lose(seat, coins) {
        const amount = Math.min(coins, this.players[seat].coins);
        if (amount <= 0) return 0;
        this.players[seat].coins -= amount;
        this.emit({ type: 'coins', seat, delta: -amount });
        return amount;
    }

    // 建てたカードの効果
    applyCard(seat, key, viaChain) {
        const player = this.players[seat];
        const card = CARDS[key];
        let coins = card.coins;
        if (card.per) {
            const count = card.per.wonders ? builtWonders(player).length : player.cards.filter(k => card.per.colors.includes(CARDS[k].color)).length;
            coins += count * card.per.coins;
        }
        if (card.guild?.coins) coins += Math.max(...this.players.map(p => guildCount(p, card.guild.count))) * card.guild.coins;
        if (viaChain && player.tokens.includes('urbanism')) coins += URBANISM_COINS;
        if (coins) {
            this.gain(seat, coins);
            this.log(`${player.name}：${coins}コイン`);
        }
        if (card.shields) this.moveMilitary(seat, card.shields + (player.tokens.includes('strategy') ? 1 : 0));
        if (this.isOver()) return;
        if (card.science) this.addScience(seat, card.science);
    }

    applyWonder(seat, key) {
        const wonder = WONDERS[key];
        const player = this.players[seat];
        if (wonder.coins) {
            this.gain(seat, wonder.coins);
        }
        if (wonder.loss) {
            const lost = this.lose(other(seat), wonder.loss);
            if (lost) this.log(`${this.players[other(seat)].name}は${lost}コインを失った`);
        }
        if (wonder.shields) this.moveMilitary(seat, wonder.shields);
        if (this.isOver()) return;
        if (wonder.replay || player.tokens.includes('theology')) this.replayTurn = true;
        if (wonder.destroy && cardsOfColor(this.players[other(seat)], wonder.destroy).length) {
            this.pending.push({ type: 'destroy', seat, color: wonder.destroy });
        }
        if (wonder.revive && this.discardPile.length) this.pending.push({ type: 'revive', seat });
        if (wonder.library && this.tokensOut.length) {
            const pool = shuffle([...this.tokensOut], this.random);
            this.libraryDraw = pool.slice(0, LIBRARY_DRAW);
            this.pending.push({ type: 'library', seat });
        }
    }

    // ---- 軍事 ----

    // seat 側から見た駒の位置（相手の都へ向かうほど大きい）
    militaryFor(seat) {
        return seat === 0 ? this.military : -this.military;
    }

    moveMilitary(seat, shields) {
        const from = this.military;
        const dir = seat === 0 ? 1 : -1;
        for (let i = 0; i < shields && Math.abs(this.military) < MILITARY_WIN; i++) {
            this.military += dir;
            for (const t of this.militaryTokens) {
                if (t.taken || t.loser === seat || this.militaryFor(seat) < t.at) continue;
                t.taken = true;
                const lost = this.lose(t.loser, t.coins);
                this.emit({ type: 'militaryToken', loser: t.loser, at: t.at, lost });
                this.log(`${this.players[t.loser].name}は軍事で${lost}コインを失った`);
            }
        }
        this.emit({ type: 'military', seat, from, to: this.military });
        if (this.militaryFor(seat) >= MILITARY_WIN) this.win(seat, 'military');
    }

    // ---- 科学と進歩トークン ----

    addScience(seat, symbol) {
        const player = this.players[seat];
        const same = scienceSymbols(player).filter(s => s === symbol).length;
        if (distinctScience(player) >= 6) {
            this.win(seat, 'science');
            return;
        }
        if (same === 2 && this.tokensBoard.length) this.pending.push({ type: 'progress', seat });
    }

    takeProgress(seat, { token }) {
        if (!this.tokensBoard.includes(token)) return this.fail('その進歩トークンは取れません');
        this.tokensBoard = this.tokensBoard.filter(k => k !== token);
        this.pending.shift();
        this.gainToken(seat, token);
        this.afterAction();
        return true;
    }

    takeLibrary(seat, { token }) {
        if (!this.libraryDraw.includes(token)) return this.fail('その進歩トークンは取れません');
        this.tokensOut = this.tokensOut.filter(k => k !== token);
        this.libraryDraw = [];
        this.pending.shift();
        this.gainToken(seat, token);
        this.afterAction();
        return true;
    }

    gainToken(seat, token) {
        const player = this.players[seat];
        player.tokens.push(token);
        this.emit({ type: 'token', seat, token });
        this.log(`${player.name}：進歩トークン「${TOKENS[token].name}」`);
        if (token === 'agriculture' || token === 'urbanism') this.gain(seat, TOKEN_COINS);
        if (token === 'law') this.addScience(seat, 'law');
    }

    // ---- 七不思議の選ぶ効果 ----

    destroy(seat, { card }) {
        const { color } = this.pending[0];
        const opponent = this.players[other(seat)];
        if (!opponent.cards.includes(card) || CARDS[card].color !== color) return this.fail('そのカードは選べません');
        opponent.cards = opponent.cards.filter(k => k !== card);
        this.discardPile.push(card);
        this.pending.shift();
        this.emit({ type: 'destroy', seat: other(seat), card });
        this.log(`${opponent.name}の${CARDS[card].name}を捨てさせた`);
        this.afterAction();
        return true;
    }

    revive(seat, { card }) {
        if (!this.discardPile.includes(card)) return this.fail('そのカードは選べません');
        this.discardPile = this.discardPile.filter(k => k !== card);
        this.pending.shift();
        this.players[seat].cards.push(card);
        this.emit({ type: 'revive', seat, card });
        this.log(`${this.players[seat].name}：捨て札から${CARDS[card].name}を建てた`);
        this.applyCard(seat, card, false);
        this.afterAction();
        return true;
    }

    // ---- 番の終わり ----

    afterAction() {
        if (this.isOver()) return;
        if (this.pending.length) {
            this.phase = this.pending[0].type;
            return;
        }
        this.endTurn();
    }

    endTurn() {
        if (this.structure.every(s => s.taken)) {
            this.endAge();
            return;
        }
        if (this.replayTurn) {
            this.log(`${this.players[this.current].name}がもう1手`);
        } else {
            this.current = other(this.current);
        }
        this.replayTurn = false;
        this.turn += 1;
        this.phase = 'play';
        this.emit({ type: 'turn', seat: this.current });
    }

    endAge() {
        if (this.replayTurn) this.log('時代が終わったので、もう1手はなくなった');
        this.replayTurn = false;
        if (this.age === 3) {
            this.finish();
            return;
        }
        // 軍事で負けている方が決める。並んでいれば、最後のカードを取った人
        this.chooser = this.military > 0 ? 1 : this.military < 0 ? 0 : this.lastTaker;
        this.phase = 'starter';
        this.emit({ type: 'ageEnd', age: this.age, chooser: this.chooser });
    }

    chooseStarter(seat, { seat: starter }) {
        if (starter !== 0 && starter !== 1) return this.fail('先手を選んでください');
        this.turn += 1;
        this.startAge(this.age + 1, starter);
        return true;
    }

    // ---- 勝ち負け ----

    win(seat, victory) {
        this.winner = seat;
        this.victory = victory;
        this.phase = 'end';
        this.pending = [];
        this.emit({ type: 'end', winner: seat, victory });
        this.log(`${this.players[seat].name}の${victory === 'military' ? '軍事' : '科学'}の勝利`);
    }

    finish() {
        const scores = [0, 1].map(s => this.score(s));
        const [a, b] = scores;
        let winner = null;
        if (a.total !== b.total) winner = a.total > b.total ? 0 : 1;
        else if (a.blue !== b.blue) winner = a.blue > b.blue ? 0 : 1;
        this.winner = winner;
        this.victory = winner === null ? 'draw' : 'civil';
        this.phase = 'end';
        this.emit({ type: 'end', winner, victory: this.victory });
        this.log(winner === null ? `${a.total}点で引き分け` : `${this.players[winner].name}の勝ち（${scores[winner].total}点対${scores[other(winner)].total}点）`);
    }

    // 点の内訳（途中でも数えられる。ゲームの終わりの点と同じ数え方）
    score(seat) {
        const player = this.players[seat];
        const sum = (color) => cardsOfColor(player, color).reduce((n, k) => n + CARDS[k].vp, 0);
        const guilds = cardsOfColor(player, 'purple').reduce((n, k) => {
            const { count, vp } = CARDS[k].guild;
            return n + Math.max(...this.players.map(p => guildCount(p, count))) * vp;
        }, 0);
        const wonders = builtWonders(player).reduce((n, w) => n + WONDERS[w.key].vp, 0);
        const tokens = player.tokens.reduce((n, t) => n + (t === 'agriculture' ? 4 : t === 'philosophy' ? 7 : t === 'mathematics' ? 3 * player.tokens.length : 0), 0);
        const out = {
            blue: sum('blue'), green: sum('green'), yellow: sum('yellow'), purple: guilds,
            wonders, tokens, coins: Math.floor(player.coins / 3), military: militaryPoints(this.militaryFor(seat))
        };
        out.total = Object.values(out).reduce((n, v) => n + v, 0);
        return out;
    }

    // ---- 記録 ----

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

