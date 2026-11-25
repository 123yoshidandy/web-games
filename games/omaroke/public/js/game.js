/**
 * お前、もしかしてロケット団？ のゲーム本体（DOM に依存しない）
 * 操作は applyCommand(seat, command) の 1 か所で受け、受け付けた操作だけを commands に記録する
 * Game.replay(players, options, commands) で同じ状態を作り直せる（山札・配るポケモン・おてんきチェックもシード付きの乱数）
 *
 * 流れ：
 *   1. 役割を配る（ジムリーダーだけ公開）。全員にプレイカードを 4 枚配り、ポケモンのカードを配る
 *   2. 全員が同時に相棒のポケモンを選ぶ（基本：Lv3 を 2 枚から 1 匹、玄人：Lv1 を 4 枚から 2 匹。最初に選んだ方がバトルポケモン）
 *   3. ジムリーダーから順に手番。番の初めに 2 枚引き、カードを使い、手札を上限まで捨てる
 * ほかの人の答えが要る処理（よける・ひんしを助ける・イベント）は、処理の列（tasks）に積み、答え待ち（prompt）で止まる
 *
 * 操作：
 *   { type: 'choose', picks: [ポケモン id, ...] }        相棒を選ぶ（最初がバトルポケモン）
 *   { type: 'play', card, target?, targets?, slot? }   手札のカードを使う（card はカードの id）
 *   { type: 'band', discards: [id, id], target }       ちからのハチマキ：手札を 2 枚捨てて攻撃する
 *   { type: 'switch' }                                 玄人：バトルポケモンとベンチのポケモンを入れ替える（番に 1 回）
 *   { type: 'end', evolve? }                           番を終える。玄人では、攻撃しなかった番に、ポケモン 1 匹（slot）を進化させられる
 *   { type: 'respond', choice?, discards? }           答え待ちに答える
 */

import { createRandom, createSeed, shuffle } from './random.js';
import {
    MIN_PLAYERS, MAX_PLAYERS, HAND_LIMIT, START_HAND, DRAW_PER_TURN, leaderBonus, POTION_HEAL, EVENT_DAMAGE,
    ROLES, rolesFor, MODES, POKEMON, POKEMON_IDS, nextStage, CARDS, buildDeck, WEATHERS, STATUSES
} from './data.js';

export { MIN_PLAYERS, MAX_PLAYERS };

// 記録する操作の項目（端末から届いた操作は、これだけを取り出す）
export const COMMAND_FIELDS = {
    choose: ['picks'],
    play: ['card', 'target', 'targets', 'slot'],
    band: ['discards', 'target'],
    switch: [],
    end: ['evolve'],
    respond: ['choice', 'discards']
};

const LOG_KEEP = 300;
// 基本ルールのレベルアップ（ふしぎなアメ・ミュウの祝福）で上がる最大 HP の上限
const LEVEL_UP_CAP = 2;

export default class Game {
    // players: [{ name, isCPU }] / options: { seed, mode: 'basic' | 'expert', level }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は ${MIN_PLAYERS}〜${MAX_PLAYERS} 人です`);
        const seed = (options.seed ?? createSeed()) >>> 0;
        this.options = { ...options, seed, mode: options.mode === 'expert' ? 'expert' : 'basic' };
        this.mode = this.options.mode;
        this.random = createRandom(seed);
        this.cards = buildDeck();
        const roles = shuffle(rolesFor(players.length), this.random);
        this.players = players.map((p, id) => ({
            id, name: p.name, isCPU: !!p.isCPU, role: roles[id], alive: true,
            hand: [], pokemon: [], battle: 0, picked: null
        }));
        this.deck = shuffle(this.cards.map(c => c.id), this.random);
        this.discard = [];
        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.acts = [];
        this.tasks = [];
        this.prompt = null;
        this.turn = null;
        this.winners = [];
        this.winnerSide = null;
        this.lastError = null;
        this.lastWeather = null;
        // ポケモンのカードを配る（基本：Lv3 を 2 枚、玄人：Lv1 を 4 枚）
        const m = MODES[this.mode];
        const pool = shuffle(POKEMON_IDS.filter(k => POKEMON[k].level === m.level), this.random);
        this.players.forEach(p => { p.offers = pool.splice(0, m.deal); });
        this.players.forEach(p => { for (let i = 0; i < START_HAND; i++) p.hand.push(this.drawCard()); });
        this.phase = 'choose';
        this.leader = this.players.find(p => p.role === 'leader').id;
        this.log(`${this.players[this.leader].name}がジムリーダー`);
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ seat, command }, i) => {
            if (!game.applyCommand(seat, command)) throw new Error(`記録の ${i} 番目の操作を再現できません：${game.lastError}`);
        });
        return game;
    }

    persist() {
        return { players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })), options: this.options, commands: this.commands };
    }

    get n() {
        return this.players.length;
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今、操作を待っている人
    actors() {
        if (this.phase === 'end') return [];
        if (this.phase === 'choose') return this.players.filter(p => !p.picked).map(p => p.id);
        if (this.prompt) return [this.prompt.seat];
        return this.turn ? [this.turn.seat] : [];
    }

    // ---------- 記録 ----------

    // seats：見てよい人（null なら全員）。others：ほかの人に見せる文
    log(text, { seats = null, others = null, kind = null } = {}) {
        this.logTotal++;
        this.logs.push({ n: this.logTotal, text, seats, others, kind });
        if (this.logs.length > LOG_KEEP) this.logs.splice(0, this.logs.length - LOG_KEEP);
    }

    act(type, from, to = null, extra = {}) {
        this.acts.push({ type, from, to, turn: this.turn?.number ?? 0, ...extra });
    }

    // ---------- カードとポケモン ----------

    card(id) {
        return this.cards[id];
    }

    cardName(id) {
        return CARDS[this.cards[id].key].name;
    }

    // 山札の上から 1 枚。尽きたら捨て札を混ぜて山札にする
    drawCard() {
        if (this.deck.length === 0) {
            if (this.discard.length === 0) return null;
            this.deck = shuffle(this.discard, this.random);
            this.discard = [];
            this.log('捨て札を混ぜて山札にした');
        }
        return this.deck.shift();
    }

    draw(seat, count) {
        const p = this.players[seat];
        let got = 0;
        for (let i = 0; i < count; i++) {
            const id = this.drawCard();
            if (id === null || id === undefined) break;
            p.hand.push(id);
            got++;
        }
        return got;
    }

    // おてんきチェック：山札の上をめくって、マークを見て捨てる。seat：誰のためのチェックか（ひでりなら「はれ」になる）
    weatherCheck(reason, seat = null) {
        const id = this.drawCard();
        if (id === null || id === undefined) return 'sun';
        const weather = seat !== null && this.hasAbility(seat, 'drought') ? 'sun' : this.cards[id].weather;
        this.discard.push(id);
        this.lastWeather = { weather, card: id, reason };
        this.log(`おてんきチェック（${reason}）：${WEATHERS[weather].name}`, { kind: 'weather' });
        return weather;
    }

    mon(seat, slot = this.players[seat].battle) {
        return this.players[seat].pokemon[slot] ?? null;
    }

    data(mon) {
        return POKEMON[mon.id];
    }

    hasAbility(seat, ability) {
        const m = this.mon(seat);
        return !!m && !m.fainted && this.data(m).ability === ability;
    }

    hasItem(seat, key) {
        const m = this.mon(seat);
        return !!m && !m.fainted && m.item !== null && this.cards[m.item].key === key;
    }

    removeFromHand(seat, id) {
        const hand = this.players[seat].hand;
        hand.splice(hand.indexOf(id), 1);
    }

    countInHand(seat, key) {
        return this.players[seat].hand.filter(id => this.cards[id].key === key).length;
    }

    firstInHand(seat, key) {
        return this.players[seat].hand.find(id => this.cards[id].key === key);
    }

    handLimit(seat) {
        return this.hasAbility(seat, 'defiant') ? 6 : HAND_LIMIT;
    }

    // 特殊状態にする（なっていれば、ならない。特性で防ぐものもある）
    setStatus(seat, status) {
        const m = this.mon(seat);
        if (!m || m.fainted || m.status) return false;
        const ability = this.data(m).ability;
        if (ability === 'oblivious' && (status === 'confusion' || status === 'sleep')) return false;
        if (ability === 'innerFocus' && status === 'flinch') return false;
        m.status = status;
        this.log(`${this.monName(seat)}は${STATUSES[status].name}になった`);
        return true;
    }

    monName(seat, slot) {
        const m = this.mon(seat, slot);
        return `${this.players[seat].name}の${m ? this.data(m).name : 'ポケモン'}`;
    }

    alivePlayers() {
        return this.players.filter(p => p.alive).map(p => p.id);
    }

    // 手番の順で、seat の次から 1 周（seat 自身は最後）
    orderFrom(seat, includeSelf = true) {
        const list = [];
        for (let i = 0; i < this.n; i++) {
            const s = (seat + i) % this.n;
            if (this.players[s].alive && (includeSelf || s !== seat)) list.push(s);
        }
        return list;
    }

    // ---------- 判定（状態を変えない） ----------

    validate(seat, command) {
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return '知らない操作です';
        if (this.phase === 'end') return 'ゲームは終わっています';
        if (!this.actors().includes(seat)) return '今は操作できません';
        if (this.phase === 'choose') return command.type === 'choose' ? this.validateChoose(seat, command) : 'ポケモンを選んでください';
        if (this.prompt) return command.type === 'respond' ? this.validateRespond(seat, command) : '答えを待っています';
        switch (command.type) {
            case 'play': return this.validatePlay(seat, command);
            case 'band': return this.validateBand(seat, command);
            case 'switch': return this.validateSwitch(seat);
            case 'end': return this.validateEnd(seat, command);
            default: return '今はその操作はできません';
        }
    }

    validateChoose(seat, { picks }) {
        const p = this.players[seat];
        const need = MODES[this.mode].pick;
        if (!Array.isArray(picks) || picks.length !== need) return `ポケモンを ${need} 匹選んでください`;
        if (new Set(picks).size !== picks.length || !picks.every(id => p.offers.includes(id))) return '配られたポケモンから選んでください';
        return null;
    }

    isOther(seat, target) {
        return Number.isInteger(target) && target !== seat && this.players[target]?.alive;
    }

    isAnyone(target) {
        return Number.isInteger(target) && !!this.players[target]?.alive;
    }

    // 「くらえ！」を使えるか（回数・特殊状態）。理由を返す
    attackBlocked(seat) {
        const m = this.mon(seat);
        if (!m) return 'ポケモンがいません';
        if (this.turn.attacks >= 1 && !this.hasAbility(seat, 'skillLink')) return '「くらえ！」は番に 1 回です';
        if (m.status === 'sleep') return 'ねむっていて攻撃できません';
        if (this.turn.paralyzed) return 'まひで攻撃できません';
        return null;
    }

    validatePlay(seat, { card, target, targets, slot }) {
        const p = this.players[seat];
        if (slot !== undefined && slot !== null && !(slot === 0 || slot === 1)) return 'ポケモンを選んでください';
        if (!p.hand.includes(card)) return '手札にないカードです';
        const key = this.cards[card].key;
        const def = CARDS[key];
        switch (key) {
            case 'kurae':
                if (!this.isOther(seat, target)) return '攻撃する相手を選んでください';
                return this.attackBlocked(seat);
            case 'yokete':
                return '「よけて！」は攻撃を受けたときに使います';
            case 'articuno':
                return '「フリーザーの守り」はイベントを受けたときに使います';
            case 'potion':
            case 'revive': {
                if (!this.healAllowed()) return '残りが 2 人のときは回復できません';
                if (!this.isAnyone(target)) return '回復させる人を選んでください';
                const m = this.mon(target, slot ?? this.players[target].battle);
                if (!m || m.fainted) return '回復できるポケモンがいません';
                if (m.hp >= m.maxHp) return 'HP は最大です';
                return null;
            }
            case 'nugget':
                return this.isAnyone(target) ? null : 'カードを引く人を選んでください';
            case 'fullHeal': {
                if (!this.isAnyone(target)) return '治す人を選んでください';
                return this.mon(target)?.status ? null : '特殊状態のポケモンではありません';
            }
            case 'rareCandy':
                return this.levelUpBlocked(seat, slot);
            case 'mew':
                return null;
            case 'mrMime':
            case 'farfetchd':
                if (!this.isOther(seat, target)) return '相手を選んでください';
                return this.players[target].hand.length > 0 ? null : '手札がない人です';
            case 'rival':
                return this.isOther(seat, target) ? null : '相手を選んでください';
            case 'zapdos': {
                if (!Array.isArray(targets) || targets.length < 1 || targets.length > 2 || new Set(targets).size !== targets.length) return '相手を 1〜2 人選んでください';
                return targets.every(t => this.isOther(seat, t)) ? null : '相手を選んでください';
            }
            case 'mewtwo':
            case 'moltres':
            case 'berries':
            case 'jigglypuff':
                return null;
            default:
                if (def.kind === 'item') return this.mon(seat) ? null : 'ポケモンがいません';
                return '使えないカードです';
        }
    }

    // ふしぎなアメ（玄人は進化。基本は最大 HP +1）
    levelUpBlocked(seat, slot) {
        if (this.mode === 'basic') return null;
        const s = slot ?? this.players[seat].battle;
        const m = this.mon(seat, s);
        if (!m || m.fainted) return '進化させるポケモンを選んでください';
        return nextStage(m.id) ? null : 'これ以上進化しません';
    }

    validateBand(seat, { discards, target }) {
        if (!this.hasItem(seat, 'choiceBand')) return 'ちからのハチマキを持っていません';
        const hand = this.players[seat].hand;
        if (!Array.isArray(discards) || discards.length !== 2 || new Set(discards).size !== 2 || !discards.every(id => hand.includes(id))) return '捨てるカードを 2 枚選んでください';
        if (!this.isOther(seat, target)) return '攻撃する相手を選んでください';
        return this.attackBlocked(seat);
    }

    validateSwitch(seat) {
        if (this.mode !== 'expert') return '基本ルールでは交代できません';
        if (this.turn.switched) return '交代は番に 1 回です';
        const p = this.players[seat];
        const bench = p.pokemon[1 - p.battle];
        return bench && !bench.fainted ? null : 'ベンチにポケモンがいません';
    }

    validateEnd(seat, { evolve }) {
        if (evolve === undefined || evolve === null) return null;
        if (this.mode !== 'expert') return '基本ルールでは進化しません';
        if (this.turn.attacked) return '攻撃した番は進化できません';
        const m = this.players[seat].pokemon[evolve];
        if (!m || m.fainted) return '進化させるポケモンを選んでください';
        return nextStage(m.id) ? null : 'これ以上進化しません';
    }

    validateRespond(seat, command) {
        const pr = this.prompt;
        const choice = command.choice;
        const has = key => this.countInHand(seat, key) > 0;
        switch (pr.kind) {
            case 'dodge':
                if (choice === 'take') return null;
                if (choice === 'yokete') return has('yokete') && this.canDodge(seat) ? null : '「よけて！」を出せません';
                if (choice === 'articuno') return pr.event && has('articuno') ? null : '「フリーザーの守り」を出せません';
                return '答えを選んでください';
            case 'discardAttack':
                if (choice === 'take') return null;
                if (choice === 'kurae') return has('kurae') ? null : '「くらえ！」がありません';
                if (choice === 'articuno') return pr.canShield && has('articuno') ? null : '「フリーザーの守り」を出せません';
                return '答えを選んでください';
            case 'shield':
                if (choice === 'pass') return null;
                return choice === 'articuno' && has('articuno') ? null : '答えを選んでください';
            case 'rescue': {
                if (choice === 'pass') return null;
                if (!this.players[seat].hand.includes(choice)) return '手札にないカードです';
                const key = this.cards[choice].key;
                return key === 'potion' || key === 'revive' ? null : '回復のカードを選んでください';
            }
            case 'pick':
                return pr.cards.includes(choice) ? null : 'めくったカードから選んでください';
            case 'trim': {
                const hand = this.players[seat].hand;
                const d = command.discards;
                if (!Array.isArray(d) || d.length !== pr.count || new Set(d).size !== d.length || !d.every(id => hand.includes(id))) return `${pr.count} 枚選んで捨ててください`;
                return null;
            }
            default:
                return '今は答えられません';
        }
    }

    // 残りが 2 人になったら、キズぐすり・げんきのかけらは使えない（決着がつかなくなるのを防ぐ。BANG! のビールと同じ）
    healAllowed() {
        return this.alivePlayers().length > 2;
    }

    canDodge(seat) {
        return this.mon(seat)?.status !== 'sleep';
    }

    // ---------- 操作 ----------

    applyCommand(seat, command) {
        this.lastError = this.validate(seat, command);
        if (this.lastError) return false;
        const clean = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => {
            if (command[k] !== undefined && command[k] !== null) clean[k] = structuredClone(command[k]);
        });
        this.commands.push({ seat, command: clean });
        switch (clean.type) {
            case 'choose': this.doChoose(seat, clean); break;
            case 'play': this.doPlay(seat, clean); break;
            case 'band': this.doBand(seat, clean); break;
            case 'switch': this.doSwitch(seat); break;
            case 'end': this.doEnd(seat, clean); break;
            case 'respond': this.doRespond(seat, clean); break;
        }
        this.run();
        return true;
    }

    // ---------- 準備 ----------

    doChoose(seat, { picks }) {
        const p = this.players[seat];
        p.picked = picks;
        if (this.players.some(q => !q.picked)) return;
        // 全員がそろったら公開する
        this.players.forEach(q => {
            q.pokemon = q.picked.map(id => {
                const d = POKEMON[id];
                const hp = (this.mode === 'basic' ? d.hp : d.hpX) + (q.role === 'leader' ? leaderBonus(this.mode, this.n) : 0);
                return { id, hp, maxHp: hp, baseHp: hp, status: null, item: null, fainted: false };
            });
            q.battle = 0;
            this.log(`${q.name}の相棒：${q.pokemon.map(m => POKEMON[m.id].name).join('・')}`);
        });
        this.phase = 'play';
        this.startTurn(this.leader, 1);
    }

    // ---------- 手番 ----------

    startTurn(seat, number) {
        this.turn = { seat, number, attacks: 0, attacked: false, switched: false, paralyzed: false };
        this.log(`${this.players[seat].name}の番`, { kind: 'turn' });
        this.tasks.push({ t: 'turnStart', seat });
    }

    doPlay(seat, { card, target, targets, slot }) {
        const key = this.cards[card].key;
        const def = CARDS[key];
        const name = this.players[seat].name;
        this.removeFromHand(seat, card);
        if (def.kind === 'item') {
            const m = this.mon(seat);
            if (m.item !== null) this.discard.push(m.item);
            m.item = card;
            this.log(`${name}の${this.data(m).name}に${def.name}を持たせた`);
            return;
        }
        this.discard.push(card);
        const tName = Number.isInteger(target) ? this.players[target].name : '';
        switch (key) {
            case 'kurae':
                this.log(`${name}：くらえ！ → ${tName}`, { kind: 'attack' });
                this.beginAttack(seat, target, 'kurae');
                break;
            case 'potion':
            case 'revive': {
                const m = this.mon(target, slot ?? this.players[target].battle);
                const before = m.hp;
                m.hp = key === 'revive' ? m.maxHp : Math.min(m.maxHp, m.hp + this.potionAmount(seat, target));
                this.log(`${name}：${def.name} → ${this.players[target].name}の${this.data(m).name}（HP ${before}→${m.hp}）`);
                if (target !== seat) this.act('heal', seat, target);
                break;
            }
            case 'nugget':
                this.draw(target, 2);
                this.log(`${name}：きんのたま → ${tName}が 2 枚引いた`);
                if (target !== seat) this.act('gift', seat, target);
                break;
            case 'fullHeal': {
                const m = this.mon(target);
                this.log(`${name}：なんでもなおし → ${tName}の${this.data(m).name}の${STATUSES[m.status].name}が治った`);
                m.status = null;
                if (target !== seat) this.act('heal', seat, target);
                break;
            }
            case 'rareCandy':
                this.log(`${name}：ふしぎなアメ`);
                this.levelUp(seat, slot ?? this.players[seat].battle);
                break;
            case 'mew': {
                const m = this.mon(seat);
                this.log(`${name}：ミュウの祝福`, { kind: 'event' });
                if (m.hp >= m.maxHp) this.levelUp(seat, this.players[seat].battle);
                else {
                    m.hp = Math.min(m.maxHp, m.hp + 2);
                    this.log(`${this.monName(seat)}の HP が ${m.hp} になった`);
                }
                break;
            }
            case 'mewtwo':
                this.log(`${name}：ミュウツーのプレッシャー`, { kind: 'event' });
                this.act('area', seat);
                this.orderFrom(seat, false).forEach(t => this.tasks.push({ t: 'eventDodge', from: seat, to: t, card: key }));
                break;
            case 'zapdos':
                this.log(`${name}：サンダーのペナルティ → ${targets.map(t => this.players[t].name).join('・')}`, { kind: 'event' });
                targets.forEach(t => {
                    this.act('attack', seat, t, { amount: EVENT_DAMAGE, event: true });
                    this.tasks.push({ t: 'eventDodge', from: seat, to: t, card: key });
                });
                break;
            case 'moltres':
                this.log(`${name}：ファイヤーからの試練`, { kind: 'event' });
                this.act('area', seat);
                this.orderFrom(seat, false).forEach(t => this.tasks.push({ t: 'trial', from: seat, to: t }));
                break;
            case 'berries': {
                const cards = [];
                this.alivePlayers().forEach(() => {
                    const id = this.drawCard();
                    if (id !== null && id !== undefined) cards.push(id);
                });
                this.log(`${name}：きのみ大豊作（${cards.map(id => this.cardName(id)).join('・')}）`, { kind: 'event' });
                this.tasks.push({ t: 'berries', cards, order: this.orderFrom(seat), i: 0 });
                break;
            }
            case 'mrMime':
            case 'farfetchd':
                this.log(`${name}：${def.name} → ${tName}`, { kind: 'event' });
                this.act(key === 'mrMime' ? 'steal' : 'scrap', seat, target);
                this.tasks.push({ t: 'shieldThen', from: seat, to: target, card: key });
                break;
            case 'jigglypuff':
                this.log(`${name}：プリンのライブ`, { kind: 'event' });
                this.orderFrom(seat, false).forEach(t => this.tasks.push({ t: 'shieldThen', from: seat, to: t, card: key }));
                break;
            case 'rival':
                this.log(`${name}：ライバルからの挑戦 → ${tName}`, { kind: 'event' });
                this.act('attack', seat, target, { amount: EVENT_DAMAGE, event: true });
                this.tasks.push({ t: 'duel', from: seat, to: target, turn: target, first: true });
                break;
        }
    }

    // キズぐすりの回復量（user：使った人、target：回復するポケモンの持ち主）
    potionAmount(user, target = user) {
        return POTION_HEAL + (this.hasAbility(user, 'sereneGrace') ? 1 : 0) + (user === target && this.hasAbility(user, 'gluttony') ? 1 : 0);
    }

    // 玄人：次の段に進化（受けたダメージは引き継ぐ）。基本：最大 HP +1、HP 1 回復
    levelUp(seat, slot) {
        const m = this.mon(seat, slot);
        if (this.mode === 'basic') {
            // 最大 HP は、もとの HP + LEVEL_UP_CAP まで
            if (m.maxHp < m.baseHp + LEVEL_UP_CAP) m.maxHp++;
            m.hp = Math.min(m.maxHp, m.hp + 1);
            this.log(`${this.monName(seat, slot)}の最大 HP は ${m.maxHp}、HP は ${m.hp}`);
            return;
        }
        const next = nextStage(m.id);
        if (!next) {
            this.log(`${this.monName(seat, slot)}はこれ以上進化しない`);
            return;
        }
        const before = this.data(m).name;
        const damage = m.maxHp - m.hp;
        const bonus = this.players[seat].role === 'leader' ? leaderBonus(this.mode, this.n) : 0;
        m.id = next;
        m.maxHp = POKEMON[next].hpX + bonus;
        m.hp = Math.max(1, m.maxHp - damage);
        this.log(`${this.players[seat].name}の${before}が${POKEMON[next].name}に進化した`, { kind: 'evolve' });
    }

    doBand(seat, { discards, target }) {
        discards.forEach(id => {
            this.removeFromHand(seat, id);
            this.discard.push(id);
        });
        this.log(`${this.players[seat].name}：ちからのハチマキ（2 枚捨てて攻撃）→ ${this.players[target].name}`, { kind: 'attack' });
        this.beginAttack(seat, target, 'band');
    }

    doSwitch(seat) {
        const p = this.players[seat];
        const out = this.mon(seat);
        // ベンチに下がると特殊状態は治る
        out.status = null;
        p.battle = 1 - p.battle;
        this.turn.switched = true;
        this.log(`${p.name}：${this.data(out).name}と${this.data(this.mon(seat)).name}を交代`);
    }

    doEnd(seat, { evolve }) {
        if (evolve !== undefined) this.levelUp(seat, evolve);
        this.tasks.push({ t: 'turnEnd', seat });
    }

    // ---------- 攻撃 ----------

    beginAttack(from, to, source) {
        this.turn.attacks++;
        this.turn.attacked = true;
        const m = this.mon(from);
        // こんらん：おてんきチェックが「あめ」なら失敗して自分に 1 ダメージ
        if (m.status === 'confusion' && this.weatherCheck('こんらん', from) === 'rain') {
            this.log(`${this.monName(from)}はこんらんして、自分を攻撃した`);
            this.tasks.unshift({ t: 'damage', to: from, amount: 1, from: null });
            return;
        }
        const move = this.data(m).move;
        this.act('attack', from, to, { amount: move.damage * move.hits });
        this.tasks.unshift({ t: 'attack', from, to, hit: 0, hits: move.hits, stage: 'start' });
    }

    // わざの 1 回分のダメージ
    moveDamage(from, to) {
        const m = this.mon(from);
        const d = this.data(m);
        let dmg = d.move.damage;
        if (dmg <= 0) return 0;
        if (['blaze', 'overgrow', 'torrent'].includes(d.ability) && m.hp * 2 <= m.maxHp) dmg++;
        if (d.ability === 'download' && this.players[to].hand.length > this.players[from].hand.length) dmg++;
        if (this.hasItem(from, 'lifeOrb')) dmg++;
        if (this.hasItem(from, 'lightBall') && d.element === 'electric') dmg++;
        if (d.ability === 'guts' && m.status) dmg++;
        else if (m.status === 'burn') dmg = 1;
        if (this.hasAbility(to, 'intimidate')) dmg = Math.max(1, dmg - 1);
        if (this.hasAbility(to, 'battleArmor') && dmg >= 3) dmg--;
        return dmg;
    }

    // ---------- 処理の列 ----------

    run() {
        let guard = 0;
        while (!this.prompt && this.phase === 'play') {
            if (++guard > 10000) throw new Error('処理が終わりません');
            if (this.tasks.length === 0) {
                // 手番の人が自分の番に退場したら、次の人の番へ
                if (this.players[this.turn.seat].alive) break;
                this.tasks.push({ t: 'nextTurn', seat: this.turn.seat });
            }
            const task = this.tasks[0];
            const done = this.step(task);
            if (done) this.tasks.splice(this.tasks.indexOf(task), 1);
        }
    }

    ask(seat, kind, extra = {}) {
        this.prompt = { seat, kind, ...extra };
        return false;
    }

    // 1 つ進める。終わったら true、答え待ちなら false（prompt を立てる）
    step(task) {
        switch (task.t) {
            case 'turnStart': return this.stepTurnStart(task);
            case 'draw':
                if (this.players[task.seat].alive) this.draw(task.seat, task.count);
                return true;
            case 'attack': return this.stepAttack(task);
            case 'damage': return this.stepDamage(task);
            case 'rescue': return this.stepRescue(task);
            case 'faint': return this.stepFaint(task);
            case 'eventDodge': return this.stepEventDodge(task);
            case 'trial': return this.stepTrial(task);
            case 'duel': return this.stepDuel(task);
            case 'shieldThen': return this.stepShieldThen(task);
            case 'berries': return this.stepBerries(task);
            case 'turnEnd': return this.stepTurnEnd(task);
            case 'nextTurn': return this.stepNextTurn(task);
            default: return true;
        }
    }

    stepTurnStart({ seat }) {
        if (!this.players[seat].alive) {
            this.tasks.push({ t: 'nextTurn', seat });
            return true;
        }
        const m = this.mon(seat);
        const queue = [];
        if (this.hasItem(seat, 'leftovers') && m.hp * 2 <= m.maxHp) {
            m.hp++;
            this.log(`${this.monName(seat)}はたべのこしで HP 1 回復`);
        }
        if (m.status === 'poison') queue.push({ t: 'damage', to: seat, amount: 1, from: null, note: 'どく' });
        if (m.status === 'sleep') {
            const w = this.weatherCheck('ねむり', seat);
            if (w === 'sun' || w === 'sand') {
                m.status = null;
                this.log(`${this.monName(seat)}は目を覚ました`);
            }
        }
        if (m.status === 'paralysis') {
            const w = this.weatherCheck('まひ', seat);
            if (w === 'rain' || w === 'snow') {
                this.turn.paralyzed = true;
                this.log(`${this.monName(seat)}はからだがしびれて、この番は攻撃できない`);
            }
        }
        // ひるみ：この番に引くのは 1 枚（引いたら治る）。すいすい：「あめ」なら 1 枚多く引く
        let count = DRAW_PER_TURN;
        if (m.status === 'flinch') {
            count--;
            m.status = null;
            this.log(`${this.monName(seat)}はひるんで、1 枚しか引けない`);
        }
        if (this.hasAbility(seat, 'swiftSwim') && this.weatherCheck('すいすい', seat) === 'rain') count++;
        queue.push({ t: 'draw', seat, count });
        this.tasks.splice(1, 0, ...queue);
        return true;
    }

    stepAttack(task) {
        const { from, to } = task;
        if (!this.players[to].alive || !this.players[from].alive) return true;
        const target = this.mon(to);
        if (!target || target.fainted) return true;
        if (task.stage === 'start') {
            // 受ける側の、カードを使わずによける効果（するどいめには効かない）
            const keen = this.hasAbility(from, 'keenEye');
            if (!keen && this.hasAbility(to, 'sandVeil') && this.weatherCheck('すながくれ', to) === 'sand') return this.dodged(task, 'すながくれでよけた');
            if (!keen && this.hasItem(to, 'brightPowder') && this.weatherCheck('ひかりのこな', to) === 'snow') return this.dodged(task, 'ひかりのこなでよけた');
            task.stage = 'ask';
            if (this.countInHand(to, 'yokete') > 0 && this.canDodge(to)) return this.ask(to, 'dodge', { from, event: false, hit: task.hit, hits: task.hits });
            return this.hitLands(task);
        }
        // 答えを受けたあと（doRespond が task.answer を置く）
        if (task.answer === 'yokete') return this.dodged(task, 'よけた');
        return this.hitLands(task);
    }

    dodged(task, text) {
        this.log(`${this.players[task.to].name}は${text}`, { kind: 'dodge' });
        if (this.hasItem(task.from, 'blunderPolicy')) {
            this.draw(task.from, 1);
            this.log(`${this.players[task.from].name}はからぶりほけんで 1 枚引いた`);
        }
        return this.nextHit(task);
    }

    hitLands(task) {
        const { from, to } = task;
        const amount = this.moveDamage(from, to);
        const move = this.data(this.mon(from)).move;
        const queue = [{ t: 'damage', to, amount, from, move: true, effect: move.effect }];
        if (this.hasItem(from, 'lifeOrb') && amount > 0 && !this.hasAbility(from, 'rockHead')) queue.push({ t: 'damage', to: from, amount: 1, from: null, note: 'いのちのたま' });
        this.tasks.splice(this.tasks.indexOf(task) + 1, 0, ...queue);
        // ホネブーメラン：当たったあと、おてんきチェックが合えば、もう 1 回
        if (move.again && task.hits === 1 && this.weatherCheck(move.name, from) === move.again) {
            task.hits = 2;
            this.log(`${move.name}がもう 1 回飛ぶ`);
        }
        return this.nextHit(task);
    }

    nextHit(task) {
        task.hit++;
        task.answer = null;
        if (task.hit >= task.hits) return true;
        task.stage = 'start';
        // 次の 1 回は、いまのダメージ（とひんしの処理）のあとに行う
        const rest = { ...task };
        const after = this.tasks.indexOf(task) + 1;
        let i = after;
        while (i < this.tasks.length && ['damage', 'rescue', 'faint'].includes(this.tasks[i].t)) i++;
        this.tasks.splice(i, 0, rest);
        return true;
    }

    stepDamage(task) {
        const { to, from, move } = task;
        if (!this.players[to].alive) return true;
        const m = this.mon(to);
        if (!m || m.fainted) return true;
        let amount = task.amount;
        if (task.event && this.hasAbility(to, 'levitate')) {
            this.log(`${this.monName(to)}はふゆうでダメージを受けない`);
            return true;
        }
        if (amount <= 0) {
            this.log(`${this.monName(to)}にダメージはなかった`);
            return true;
        }
        const before = m.hp;
        if (this.data(m).ability === 'sturdy' && m.hp === m.maxHp && amount >= m.hp) {
            amount = m.hp - 1;
            this.log(`${this.monName(to)}はがんじょうで持ちこたえた`);
        }
        m.hp = Math.max(0, m.hp - amount);
        this.log(`${this.monName(to)}に ${amount} ダメージ（HP ${before}→${m.hp}）${task.note ? `（${task.note}）` : ''}`, { kind: 'damage' });
        const queue = [];
        if (move && from !== null && from !== to && this.players[from].alive) {
            // わざの追加効果と、攻撃した側のもちもの（ひんしにしたときは働かない）
            if (m.hp > 0) {
                const effect = task.effect;
                if (effect) {
                    const [cond, status] = effect.includes(':') ? effect.split(':') : [null, effect];
                    if (!cond || this.weatherCheck(this.data(this.mon(from)).move.name, from) === cond) this.setStatus(to, status);
                }
                if (this.hasItem(from, 'flameOrb')) this.setStatus(to, 'burn');
                if (this.hasItem(from, 'kingsRock') && this.weatherCheck('おうじゃのしるし', from) === 'sun') this.setStatus(to, 'flinch');
                if (this.hasAbility(from, 'poisonTouch') && this.weatherCheck('どくしゅ', from) === 'sun') this.setStatus(to, 'poison');
                // 受けた側のもちものと特性（ひんしになったら働かない。公式 FAQ）
                if (this.hasItem(to, 'rockyHelmet')) queue.push({ t: 'damage', to: from, amount: 1, from: null, note: 'ゴツゴツメット' });
                if (this.hasItem(to, 'poisonBarb')) this.setStatus(from, 'poison');
                if (this.hasAbility(to, 'staticAb') && this.weatherCheck('せいでんき', to) === 'sun') this.setStatus(from, 'paralysis');
                if (this.hasAbility(to, 'poisonPoint') && this.weatherCheck('どくのトゲ', to) === 'sun') this.setStatus(from, 'poison');
            }
        }
        if (m.hp === 0) {
            const slot = this.players[to].pokemon.indexOf(m);
            queue.unshift({ t: 'rescue', victim: to, slot, killer: move ? from : null, order: this.orderFrom(to), i: 0 });
        }
        this.tasks.splice(this.tasks.indexOf(task) + 1, 0, ...queue);
        return true;
    }

    // HP が 0 になったポケモン：持ち主から順に、キズぐすり・げんきのかけらで助けるかを聞く
    stepRescue(task) {
        const m = this.players[task.victim].pokemon[task.slot];
        if (!m || m.fainted || m.hp > 0) return true;
        while (task.i < task.order.length) {
            const s = task.order[task.i];
            if (task.answer === undefined && this.players[s].alive && this.healAllowed() && (this.countInHand(s, 'potion') > 0 || this.countInHand(s, 'revive') > 0)) {
                return this.ask(s, 'rescue', { victim: task.victim, slot: task.slot });
            }
            if (task.answer !== undefined && task.answer !== 'pass') {
                const card = task.answer;
                const key = this.cards[card].key;
                this.removeFromHand(s, card);
                this.discard.push(card);
                m.hp = key === 'revive' ? m.maxHp : Math.min(m.maxHp, this.potionAmount(s, task.victim));
                this.log(`${this.players[s].name}が${CARDS[key].name}で${this.monName(task.victim, task.slot)}を助けた（HP ${m.hp}）`, { kind: 'rescue' });
                if (s !== task.victim) this.act('rescue', s, task.victim);
                return true;
            }
            task.answer = undefined;
            task.i++;
        }
        this.tasks.splice(this.tasks.indexOf(task) + 1, 0, { t: 'faint', victim: task.victim, slot: task.slot, killer: task.killer });
        return true;
    }

    stepFaint({ victim, slot, killer }) {
        const p = this.players[victim];
        const m = p.pokemon[slot];
        m.fainted = true;
        m.status = null;
        if (m.item !== null) {
            this.discard.push(m.item);
            m.item = null;
        }
        this.log(`${this.monName(victim, slot)}はひんしになった`, { kind: 'faint' });
        // ひんしにした人（わざで）は 1 枚引く
        if (killer !== null && killer !== undefined && killer !== victim && this.players[killer].alive) {
            this.draw(killer, 1);
            this.log(`${this.players[killer].name}は 1 枚引いた`);
        }
        const rest = p.pokemon.findIndex(x => !x.fainted);
        if (rest >= 0) {
            if (slot === p.battle) {
                p.battle = rest;
                this.log(`${p.name}は${this.data(p.pokemon[rest]).name}をバトルに出した`);
            }
            return true;
        }
        this.eliminate(victim, killer);
        return true;
    }

    eliminate(seat, killer) {
        const p = this.players[seat];
        p.alive = false;
        this.log(`${p.name}は退場（${ROLES[p.role].name}）`, { kind: 'out' });
        // 手札：ものひろいのポケモンを出している人がいれば、その人がもらう。いなければ捨てる
        const picker = this.orderFrom(seat, false).find(s => this.hasAbility(s, 'pickup'));
        if (picker !== undefined && p.hand.length > 0) {
            this.players[picker].hand.push(...p.hand);
            this.log(`${this.players[picker].name}はものひろいで手札を ${p.hand.length} 枚もらった`);
        } else this.discard.push(...p.hand);
        p.hand = [];
        if (killer !== null && killer !== undefined && this.players[killer].alive && this.hasAbility(killer, 'moxie')) {
            const km = this.mon(killer);
            km.hp = Math.min(km.maxHp, km.hp + 2);
            this.log(`${this.monName(killer)}はじしんかじょうで HP 2 回復`);
        }
        // 答え待ちや処理の列から、退場した人の分を除く
        this.tasks = this.tasks.filter(t => !(t.to === seat && ['attack', 'eventDodge', 'trial', 'shieldThen'].includes(t.t)));
        this.checkWin();
    }

    checkWin() {
        const alive = this.alivePlayers();
        const role = s => this.players[s].role;
        const leaderAlive = this.players[this.leader].alive;
        let side = null;
        if (!leaderAlive) side = alive.length === 1 && role(alive[0]) === 'rocket' ? 'rocket' : 'challenger';
        else if (!alive.some(s => role(s) === 'challenger' || role(s) === 'rocket')) side = 'gym';
        if (!side) return;
        this.winnerSide = side;
        this.winners = this.players.filter(p => ROLES[p.role].team === side).map(p => p.id);
        this.phase = 'end';
        this.prompt = null;
        this.tasks = [];
        const label = { gym: 'ジムリーダーとジムトレーナー', challenger: '挑戦者', rocket: 'ロケット団員' }[side];
        this.log(`${label}の勝ち`, { kind: 'win' });
    }

    // ミュウツー・サンダー：よけて！を出すか、2 ダメージ（フリーザーの守りでも防げる）
    stepEventDodge(task) {
        const { from, to } = task;
        if (!this.players[to].alive) return true;
        if (task.answer === undefined) {
            if (this.hasItem(to, 'stealthCloak')) {
                this.log(`${this.players[to].name}はおんみつマントで効果を受けない`);
                return true;
            }
            const canYokete = this.countInHand(to, 'yokete') > 0 && this.canDodge(to);
            const canShield = this.countInHand(to, 'articuno') > 0;
            if (canYokete || canShield) return this.ask(to, 'dodge', { from, event: true, card: task.card });
            task.answer = 'take';
        }
        if (task.answer === 'yokete') this.log(`${this.players[to].name}はよけた`, { kind: 'dodge' });
        else if (task.answer === 'articuno') this.log(`${this.players[to].name}はフリーザーの守りで防いだ`);
        else this.tasks.splice(this.tasks.indexOf(task) + 1, 0, { t: 'damage', to, amount: EVENT_DAMAGE, from, event: true });
        return true;
    }

    // ファイヤーからの試練：くらえ！を捨てるか、2 ダメージ
    stepTrial(task) {
        const { from, to } = task;
        if (!this.players[to].alive) return true;
        if (task.answer === undefined) {
            if (this.hasItem(to, 'stealthCloak')) {
                this.log(`${this.players[to].name}はおんみつマントで効果を受けない`);
                return true;
            }
            if (this.countInHand(to, 'kurae') > 0 || this.countInHand(to, 'articuno') > 0) return this.ask(to, 'discardAttack', { from, canShield: true, card: 'moltres' });
            task.answer = 'take';
        }
        if (task.answer === 'kurae') this.log(`${this.players[to].name}は「くらえ！」を捨てた`);
        else if (task.answer === 'articuno') this.log(`${this.players[to].name}はフリーザーの守りで防いだ`);
        else this.tasks.splice(this.tasks.indexOf(task) + 1, 0, { t: 'damage', to, amount: EVENT_DAMAGE, from, event: true });
        return true;
    }

    // ライバルからの挑戦：相手から順に「くらえ！」を捨て合い、捨てられなかった人が 2 ダメージ
    stepDuel(task) {
        const { from, to } = task;
        if (!this.players[from].alive || !this.players[to].alive) return true;
        while (true) {
            const s = task.turn;
            if (task.answer === undefined) {
                if (task.first && this.hasItem(to, 'stealthCloak')) {
                    this.log(`${this.players[to].name}はおんみつマントで効果を受けない`);
                    return true;
                }
                const canShield = task.first && s === to && this.countInHand(to, 'articuno') > 0;
                if (this.countInHand(s, 'kurae') > 0 || canShield) return this.ask(s, 'discardAttack', { from: s === to ? from : to, canShield, card: 'rival' });
                task.answer = 'take';
            }
            const answer = task.answer;
            task.answer = undefined;
            task.first = false;
            if (answer === 'articuno') {
                this.log(`${this.players[s].name}はフリーザーの守りで防いだ`);
                return true;
            }
            if (answer === 'take') {
                const other = s === to ? from : to;
                this.log(`${this.players[s].name}は「くらえ！」を出せなかった`);
                this.tasks.splice(this.tasks.indexOf(task) + 1, 0, { t: 'damage', to: s, amount: EVENT_DAMAGE, from: other, event: true });
                return true;
            }
            this.log(`${this.players[s].name}は「くらえ！」を捨てた`);
            task.turn = s === to ? from : to;
        }
    }

    // バリヤード・カモネギ・プリン：フリーザーの守りで防ぐかを聞いてから行う
    stepShieldThen(task) {
        const { from, to, card } = task;
        if (!this.players[to].alive) return true;
        if (task.answer === undefined) {
            if (this.hasItem(to, 'stealthCloak')) {
                this.log(`${this.players[to].name}はおんみつマントで効果を受けない`);
                return true;
            }
            if (this.countInHand(to, 'articuno') > 0) return this.ask(to, 'shield', { from, card });
            task.answer = 'pass';
        }
        if (task.answer === 'articuno') {
            this.log(`${this.players[to].name}はフリーザーの守りで防いだ`);
            return true;
        }
        const hand = this.players[to].hand;
        if (card === 'mrMime' && hand.length > 0) {
            const id = hand[Math.floor(this.random() * hand.length)];
            this.removeFromHand(to, id);
            this.players[from].hand.push(id);
            this.log(`${this.players[from].name}は${this.players[to].name}の手札から${this.cardName(id)}を取った`, { seats: [from, to], others: `${this.players[from].name}は${this.players[to].name}の手札から 1 枚取った` });
        } else if (card === 'farfetchd' && hand.length > 0) {
            const id = hand[Math.floor(this.random() * hand.length)];
            this.removeFromHand(to, id);
            this.discard.push(id);
            this.log(`${this.players[to].name}は${this.cardName(id)}を捨てた`);
        } else if (card === 'jigglypuff') {
            const w = this.weatherCheck(`${this.players[to].name}`);
            if (w === 'rain' || w === 'snow') this.setStatus(to, 'sleep');
        }
        return true;
    }

    stepBerries(task) {
        while (task.i < task.order.length && task.cards.length > 0) {
            const s = task.order[task.i];
            if (!this.players[s].alive) {
                task.i++;
                continue;
            }
            if (task.answer === undefined) {
                if (task.cards.length === 1) task.answer = task.cards[0];
                else return this.ask(s, 'pick', { cards: [...task.cards] });
            }
            const id = task.answer;
            task.answer = undefined;
            task.cards.splice(task.cards.indexOf(id), 1);
            this.players[s].hand.push(id);
            this.log(`${this.players[s].name}は${this.cardName(id)}を取った`);
            task.i++;
        }
        this.discard.push(...task.cards);
        return true;
    }

    stepTurnEnd(task) {
        const { seat } = task;
        if (!this.players[seat].alive) {
            this.tasks.push({ t: 'nextTurn', seat });
            return true;
        }
        if (task.answer === undefined) {
            const m = this.mon(seat);
            if (m.status && this.hasAbility(seat, 'naturalCure')) {
                this.log(`${this.monName(seat)}はしぜんかいふくで${STATUSES[m.status].name}が治った`);
                m.status = null;
            }
            const over = this.players[seat].hand.length - this.handLimit(seat);
            if (over > 0) return this.ask(seat, 'trim', { count: over });
            task.answer = [];
        }
        if (task.answer.length > 0) {
            task.answer.forEach(id => {
                this.removeFromHand(seat, id);
                this.discard.push(id);
            });
            this.log(`${this.players[seat].name}は手札を ${task.answer.length} 枚捨てた`);
        }
        if (this.hasAbility(seat, 'harvest')) {
            this.draw(seat, 1);
            this.log(`${this.players[seat].name}はしゅうかくで 1 枚引いた`);
        }
        this.tasks.push({ t: 'nextTurn', seat });
        return true;
    }

    stepNextTurn({ seat }) {
        const next = this.orderFrom(seat, false)[0];
        if (next === undefined) return true;
        this.startTurn(next, this.turn.number + 1);
        return true;
    }

    // 答え待ちへの答え：その処理（列の先頭）に answer を置いて、続きを進める
    doRespond(seat, { choice, discards }) {
        const pr = this.prompt;
        this.prompt = null;
        const task = this.tasks[0];
        const takeCard = key => {
            const id = this.firstInHand(seat, key);
            this.removeFromHand(seat, id);
            this.discard.push(id);
        };
        switch (pr.kind) {
            case 'dodge':
                if (choice === 'yokete') takeCard('yokete');
                if (choice === 'articuno') takeCard('articuno');
                task.answer = choice;
                break;
            case 'discardAttack':
                if (choice === 'kurae') takeCard('kurae');
                if (choice === 'articuno') takeCard('articuno');
                task.answer = choice;
                break;
            case 'shield':
                if (choice === 'articuno') takeCard('articuno');
                task.answer = choice;
                break;
            case 'rescue':
            case 'pick':
                task.answer = choice;
                break;
            case 'trim':
                task.answer = discards;
                break;
        }
    }
}

