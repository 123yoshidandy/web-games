/**
 * ホラーファイド（村を襲う怪物たちに、英雄が力を合わせて立ち向かう協力ゲーム）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（袋・山札の並びとダイスはシードから決まる）
 *
 * 手番の流れ
 * - 英雄の番：アクション（移動・案内・拾う・共有・前進・退治・特殊）を英雄ごとの回数まで。特典はアクションを使わずに使える
 * - 怪物の番：怪物カードを1枚めくる → アイテムを袋から出す → できごと → カードに描かれた怪物が順に動き、人がいれば襲う
 *   襲うとき：同じ地点に英雄・村人が2人以上いれば、手番の人が標的を選ぶ → ダイスを振る
 *   英雄に命中したら、命中の数だけアイテムを捨てて防げる。防がなければ病院へ運ばれ、恐怖が1つ上がる
 *   村人に命中したら、村人は倒れ、恐怖が1つ上がる
 * 勝ち：すべての怪物を退治した時点。負け：恐怖が7に達する・怪物カードを引けない
 */

import { createRandom, shuffle } from './random.js';
import {
    LOCATIONS, LOCATION_COUNT, NEIGHBORS, DIST, stepToward, HOSPITAL, ITEMS, ITEM_COUNT, COLORS, COLOR_NAMES,
    HEROES, HERO, MONSTERS, MONSTER, MONSTER_KEYS, LEVELS, VILLAGERS, PERK_CARDS, PERK, MONSTER_CARDS, SPECIAL_EVENTS,
    DIE_FACES, TERROR_MAX, START_ITEMS
} from './data.js';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 5;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    move: ['to', 'villagers'],
    guide: ['villager', 'to'],
    pickup: ['from'],
    share: ['with', 'give', 'take'],
    advance: ['monster', 'items'],
    defeat: ['monster', 'items'],
    special: ['to'],
    perk: ['card', 'to', 'item'],
    end: [],
    target: ['choice'],
    defend: ['items']
};
export const ACTION_TYPES = ['move', 'guide', 'pickup', 'share', 'advance', 'defeat', 'special'];
export const END_REASONS = {
    won: 'すべての怪物を退治しました',
    terror: '恐怖が限界に達しました',
    deck: '怪物カードが尽きました'
};
const MAX_LOGS = 400;
const isInt = (v) => Number.isInteger(v);
const isLoc = (v) => isInt(v) && v >= 0 && v < LOCATION_COUNT;
const isItem = (v) => isInt(v) && v >= 0 && v < ITEM_COUNT;
const itemList = (ids) => ids.map(id => `${COLOR_NAMES[ITEMS[id].color]}${ITEMS[id].strength}の${ITEMS[id].name}`).join('・');

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, level（怪物の数 2・3・4）, monsters（怪物の key の並び。省くとランダム）, heroes（英雄の key の並び。省くとランダム）}
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const level = Object.hasOwn(LEVELS, options.level) ? Number(options.level) : 2;
        const pick = (list, keys, n) => (Array.isArray(list) && list.length === n && list.every(k => keys.includes(k)) && new Set(list).size === n ? [...list] : null);
        const fixedMonsters = pick(options.monsters, MONSTER_KEYS, LEVELS[level].monsters);
        const fixedHeroes = pick(options.heroes, HEROES.map(h => h.key), players.length);
        this.options = { seed, level, ...(fixedMonsters ? { monsters: fixedMonsters } : {}), ...(fixedHeroes ? { heroes: fixedHeroes } : {}) };
        this.random = createRandom(seed);

        this.commands = [];
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.result = null;                 // { won, reason }
        this.terror = 0;

        const monsterKeys = fixedMonsters ?? shuffle([...MONSTER_KEYS], this.random).slice(0, LEVELS[level].monsters);
        this.monsters = monsterKeys.map(key => ({ key, loc: MONSTER[key].start, defeated: false, task: Game.emptyTask(key) }));
        this.frenzy = 0;                    // 狂乱の怪物（this.monsters の番号。いなければ -1）

        const heroKeys = fixedHeroes ?? shuffle(HEROES.map(h => h.key), this.random).slice(0, players.length);
        this.players = players.map((p, id) => ({
            id,
            name: String(p.name ?? `プレイヤー${id + 1}`),
            isCPU: !!p.isCPU,
            hero: heroKeys[id],
            loc: HERO[heroKeys[id]].start,
            items: [],
            perks: []
        }));

        this.board = LOCATIONS.map(() => []);   // 地点ごとの、置かれたアイテム
        this.bag = shuffle(ITEMS.map(i => i.id), this.random);
        this.used = [];                     // 使った・捨てたアイテム（袋が空になったら戻す）
        this.villagers = VILLAGERS.map(() => null);   // 村人のいる地点（いなければ null）
        this.perkDeck = shuffle(PERK_CARDS.map(p => p.id), this.random);
        this.perkUsed = [];
        this.deck = shuffle(MONSTER_CARDS.map(c => c.id), this.random);
        this.cardsUsed = [];
        this.card = null;                   // 直前にめくった怪物カード
        this.lastStrike = [];               // 直前の怪物の番で起きたこと（画面に出す）

        for (let i = 0; i < START_ITEMS; i++) this.placeItem();
        this.players.forEach(p => this.gainPerk(p, false));

        this.current = 0;
        this.turnNo = 1;
        this.phase = 'actions';
        this.mq = [];                       // 怪物の番の、これから動く怪物の列
        this.prompt = null;                 // 選択待ち：{ type: 'target' | 'defend', seat, ... }
        this.skipMonster = false;
        this.startTurnState();
        this.log(`${this.monsters.map(m => MONSTER[m.key].name).join('・')}が村に現れました`, { head: true });
        this.log(`${this.heroLabel(0)}の手番`, { head: true });
    }

    static emptyTask(key) {
        if (key === 'vampire') return [false, false, false, false];
        if (key === 'mummy') return [false, false, false];
        if (key === 'invisible') return [];
        return 0;
    }

    // ---- 調べる ----

    isOver() { return this.phase === 'end'; }
    heroOf(seat) { return HERO[this.players[seat].hero]; }
    heroLabel(seat) { return `${this.players[seat].name}（${this.heroOf(seat).name}）`; }
    monsterAlive() { return this.monsters.filter(m => !m.defeated); }

    // 怪物の目的の進み具合と全体の数
    static taskProgress(m) {
        if (Array.isArray(m.task)) return m.key === 'invisible' ? m.task.length : m.task.filter(Boolean).length;
        return m.task;
    }
    static taskTotal(key) {
        if (key === 'vampire') return 4;
        if (key === 'mummy') return 3;
        return MONSTER[key].steps;
    }
    taskDone(m) { return Game.taskProgress(m) >= Game.taskTotal(m.key); }

    heroesAt(at) { return this.players.filter(p => p.loc === at).map(p => p.id); }
    villagersAt(at) { return this.villagers.map((l, v) => (l === at ? v : -1)).filter(v => v >= 0); }

    // 進めるのに操作が要る人
    actors() {
        if (this.phase === 'end') return [];
        if (this.prompt) return [this.prompt.seat];
        return [this.current];
    }

    // アイテムの強さの合計（科学者は手番に1回 +1 できる：足りないときだけ使う）
    strengthOf(ids) { return ids.reduce((s, id) => s + ITEMS[id].strength, 0); }
    bonusFor(seat) { return this.players[seat].hero === 'scientist' && !this.bonusUsed ? 1 : 0; }

    // 今この英雄が前進できる地点か（目的の条件）。items は検証済みとする
    advanceError(seat, monsterIndex, items) {
        const p = this.players[seat];
        const m = this.monsters[monsterIndex];
        if (!m || m.defeated) return 'その怪物はいません';
        if (this.taskDone(m)) return 'その怪物の目的は果たしました';
        const def = MONSTER[m.key];
        if (!items.length) return 'アイテムを選んでください';
        const colors = new Set(items.map(id => ITEMS[id].color));
        const total = this.strengthOf(items);
        const enough = (need) => total >= need || total + this.bonusFor(seat) >= need;
        switch (m.key) {
            case 'vampire': {
                const k = def.coffins.indexOf(p.loc);
                if (k < 0 || m.task[k]) return '壊せる棺がこの地点にありません';
                if (colors.size !== 1 || !colors.has('red')) return '赤のアイテムだけを使います';
                return enough(def.need.total) ? null : `赤の合計${def.need.total}以上が要ります`;
            }
            case 'mummy': {
                if (p.loc !== def.at) return `${LOCATIONS[def.at].name}でしか前進できません`;
                if (colors.size !== 1) return '1色だけを使います';
                const c = COLORS.indexOf([...colors][0]);
                if (m.task[c]) return 'その色の封印は解けています';
                return enough(def.need.total) ? null : `合計${def.need.total}以上が要ります`;
            }
            case 'invisible': {
                if (p.loc !== def.at) return `${LOCATIONS[def.at].name}でしか証拠を届けられません`;
                const froms = items.map(id => ITEMS[id].at);
                if (new Set(froms).size !== froms.length || froms.some(f => m.task.includes(f))) return '出どころが同じ証拠は1つまでです';
                return items.length <= Game.taskTotal('invisible') - m.task.length ? null : '証拠が多すぎます';
            }
            default: {
                if (p.loc !== def.at) return `${LOCATIONS[def.at].name}でしか前進できません`;
                if (colors.size !== 1 || !colors.has(def.need.color)) return `${COLOR_NAMES[def.need.color]}のアイテムだけを使います`;
                return enough(def.need.total) ? null : `${COLOR_NAMES[def.need.color]}の合計${def.need.total}以上が要ります`;
            }
        }
    }

    defeatError(seat, monsterIndex, items) {
        const p = this.players[seat];
        const m = this.monsters[monsterIndex];
        if (!m || m.defeated) return 'その怪物はいません';
        if (!this.taskDone(m)) return '先に目的を果たします';
        if (p.loc !== m.loc) return '怪物のいる地点でしか退治できません';
        const def = MONSTER[m.key].defeat;
        if (!items.length || items.some(id => ITEMS[id].color !== def.color)) return `${COLOR_NAMES[def.color]}のアイテムだけを使います`;
        const total = this.strengthOf(items);
        return total >= def.total || total + this.bonusFor(seat) >= def.total ? null : `${COLOR_NAMES[def.color]}の合計${def.total}以上が要ります`;
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!isInt(playerId) || !this.players[playerId]) return this.fail('プレイヤーが正しくありません');
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => {
            if (command[k] !== undefined && command[k] !== null) recorded[k] = command[k];
        });
        const error = this.commandError(playerId, recorded);
        if (error) return this.fail(error);
        this.commands.push({ playerId, command: structuredClone(recorded) });
        this.execute(playerId, recorded);
        return true;
    }

    // 判定（状態を変えない）。通らなければ理由を返す
    commandError(seat, c) {
        const type = c.type;
        if (type === 'target') {
            if (this.prompt?.type !== 'target' || this.prompt.seat !== seat) return '今は標的を選べません';
            return isInt(c.choice) && c.choice >= 0 && c.choice < this.prompt.options.length ? null : '標的が正しくありません';
        }
        if (type === 'defend') {
            if (this.prompt?.type !== 'defend' || this.prompt.seat !== seat) return '今は防げません';
            const items = c.items ?? [];
            if (!Array.isArray(items) || !items.every(isItem) || new Set(items).size !== items.length) return 'アイテムが正しくありません';
            if (items.length && items.length !== this.prompt.hits) return `アイテムを${this.prompt.hits}つ選んでください`;
            return items.every(id => this.players[seat].items.includes(id)) ? null : 'そのアイテムは持っていません';
        }
        if (this.prompt || this.phase !== 'actions') return '今は操作できません';
        if (seat !== this.current) return 'あなたの手番ではありません';
        const p = this.players[seat];
        if (type === 'end') return null;
        if (type === 'perk') return this.perkError(seat, c);
        if (this.actionsLeft <= 0 && !(type === 'guide' && this.freeGuide(seat))) return 'アクションが残っていません';
        const ownsAll = (ids) => Array.isArray(ids) && ids.every(isItem) && new Set(ids).size === ids.length;
        switch (type) {
            case 'move': {
                if (!isLoc(c.to) || !NEIGHBORS[p.loc].includes(c.to)) return '隣の地点にしか移れません';
                const vs = c.villagers ?? [];
                if (!Array.isArray(vs) || new Set(vs).size !== vs.length || !vs.every(v => isInt(v) && this.villagers[v] === p.loc)) return '連れて行ける村人ではありません';
                return null;
            }
            case 'guide': {
                if (!isInt(c.villager) || this.villagers[c.villager] === undefined || this.villagers[c.villager] === null) return 'その村人はいません';
                if (!isLoc(c.to)) return '行き先が正しくありません';
                const at = this.villagers[c.villager];
                const ok = (at === p.loc && NEIGHBORS[p.loc].includes(c.to)) || (NEIGHBORS[p.loc].includes(at) && c.to === p.loc);
                return ok ? null : '案内できるのは、同じ地点から隣へか、隣から自分の地点へです';
            }
            case 'pickup': {
                const from = c.from ?? p.loc;
                if (!isLoc(from)) return '地点が正しくありません';
                if (from !== p.loc && !(p.hero === 'archaeologist' && NEIGHBORS[p.loc].includes(from))) return 'その地点のアイテムは拾えません';
                return this.board[from].length ? null : '拾えるアイテムがありません';
            }
            case 'share': {
                const other = this.players[c.with];
                if (!isInt(c.with) || !other || other.id === seat || other.loc !== p.loc) return '同じ地点の英雄とだけ渡し合えます';
                const give = c.give ?? [];
                const take = c.take ?? [];
                if (!ownsAll(give) || !ownsAll(take) || !give.every(id => p.items.includes(id)) || !take.every(id => other.items.includes(id))) return 'アイテムが正しくありません';
                return give.length + take.length ? null : '渡すか受け取るアイテムを選んでください';
            }
            case 'advance':
            case 'defeat': {
                if (!isInt(c.monster)) return '怪物が正しくありません';
                if (!ownsAll(c.items ?? []) || !(c.items ?? []).every(id => p.items.includes(id))) return 'アイテムが正しくありません';
                return type === 'advance' ? this.advanceError(seat, c.monster, c.items ?? []) : this.defeatError(seat, c.monster, c.items ?? []);
            }
            case 'special': {
                if (p.hero !== 'courier') return 'この英雄には特殊なアクションがありません';
                if (!isLoc(c.to) || c.to === p.loc || !this.players.some(q => q.id !== seat && q.loc === c.to)) return 'ほかの英雄のいる地点を選んでください';
                return null;
            }
            default:
                return '操作が正しくありません';
        }
    }

    hasPerk(seat, key) { return this.players[seat].perks.some(id => PERK_CARDS[id]?.key === key); }

    freeGuide(seat) { return this.players[seat].hero === 'inspector' && !this.guideUsed; }

    perkError(seat, c) {
        const p = this.players[seat];
        if (!isInt(c.card) || !p.perks.includes(c.card)) return 'その特典は持っていません';
        const key = PERK_CARDS[c.card].key;
        if (key === 'hurry') return isLoc(c.to) && DIST[p.loc][c.to] >= 1 && DIST[p.loc][c.to] <= 2 ? null : '2つ先までの地点を選んでください';
        if (key === 'search') return isItem(c.item) && this.board.some(list => list.includes(c.item)) ? null : '村に置かれたアイテムを選んでください';
        if (key === 'supply') return this.bag.length + this.used.length ? null : '袋にアイテムがありません';
        if (key === 'dawn') return this.skipMonster ? 'もう使っています' : null;
        return null;
    }

    execute(seat, c) {
        if (c.type === 'target') {
            this.mq[0].target = this.prompt.options[c.choice];
            this.prompt = null;
            this.runMonsters();
            return;
        }
        if (c.type === 'defend') {
            this.resolveDefense(c.items ?? []);
            return;
        }
        if (c.type === 'end') {
            this.log(`${this.heroLabel(seat)}が手番を終えました`);
            this.startMonsterPhase();
            return;
        }
        if (c.type === 'perk') {
            this.usePerk(seat, c);
            return;
        }
        if (c.type === 'guide' && this.freeGuide(seat)) this.guideUsed = true;
        else this.actionsLeft--;
        this.doAction(seat, c);
        if (this.isOver()) return;
        if (this.actionsLeft <= 0 && !this.freeGuide(seat) && !this.hasPerk(seat, 'late')) this.startMonsterPhase();
    }

    doAction(seat, c) {
        const p = this.players[seat];
        switch (c.type) {
            case 'move': {
                const from = p.loc;
                p.loc = c.to;
                (c.villagers ?? []).forEach(v => { this.villagers[v] = c.to; });
                const with_ = (c.villagers ?? []).length ? `（${(c.villagers ?? []).map(v => VILLAGERS[v].name).join('・')}を連れて）` : '';
                this.log(`${p.name}が${LOCATIONS[c.to].name}へ移動${with_}`);
                this.emit({ type: 'move', seat, from, to: c.to });
                (c.villagers ?? []).forEach(v => this.checkHome(v, seat));
                break;
            }
            case 'guide': {
                this.villagers[c.villager] = c.to;
                this.log(`${p.name}が${VILLAGERS[c.villager].name}を${LOCATIONS[c.to].name}へ案内`);
                this.emit({ type: 'guide', seat, villager: c.villager, to: c.to });
                this.checkHome(c.villager, seat);
                break;
            }
            case 'pickup': {
                const from = c.from ?? p.loc;
                const ids = this.board[from];
                this.board[from] = [];
                p.items.push(...ids);
                this.log(`${p.name}が${LOCATIONS[from].name}で${itemList(ids)}を拾いました`);
                this.emit({ type: 'pickup', seat, at: from, items: [...ids] });
                break;
            }
            case 'share': {
                const other = this.players[c.with];
                const give = c.give ?? [];
                const take = c.take ?? [];
                p.items = p.items.filter(id => !give.includes(id)).concat(take);
                other.items = other.items.filter(id => !take.includes(id)).concat(give);
                const parts = [];
                if (give.length) parts.push(`${other.name}に${itemList(give)}を渡し`);
                if (take.length) parts.push(`${other.name}から${itemList(take)}を受け取り`);
                this.log(`${p.name}が${parts.join('、')}ました`);
                this.emit({ type: 'share', seat, with: other.id });
                break;
            }
            case 'advance':
                this.advance(seat, c.monster, c.items);
                break;
            case 'defeat':
                this.defeat(seat, c.monster, c.items);
                break;
            case 'special': {
                const from = p.loc;
                p.loc = c.to;
                this.log(`${p.name}が${LOCATIONS[c.to].name}へ駆けつけました`);
                this.emit({ type: 'move', seat, from, to: c.to });
                break;
            }
        }
    }

    useItems(seat, ids) {
        const p = this.players[seat];
        const total = this.strengthOf(ids);
        p.items = p.items.filter(id => !ids.includes(id));
        this.used.push(...ids);
        return total;
    }

    // 足りないときだけ科学者の +1 を使う
    applyBonus(seat, total, need) {
        if (total < need && this.bonusFor(seat)) {
            this.bonusUsed = true;
            return '（科学者の+1）';
        }
        return '';
    }

    advance(seat, index, items) {
        const m = this.monsters[index];
        const def = MONSTER[m.key];
        const p = this.players[seat];
        const total = this.strengthOf(items);
        let text;
        switch (m.key) {
            case 'vampire': {
                const k = def.coffins.indexOf(p.loc);
                const note = this.applyBonus(seat, total, def.need.total);
                m.task[k] = true;
                text = `${LOCATIONS[p.loc].name}の棺を壊しました${note}`;
                break;
            }
            case 'mummy': {
                const c = COLORS.indexOf(ITEMS[items[0]].color);
                const note = this.applyBonus(seat, total, def.need.total);
                m.task[c] = true;
                text = `石板の${COLOR_NAMES[COLORS[c]]}の封印を解きました${note}`;
                break;
            }
            case 'invisible':
                m.task.push(...items.map(id => ITEMS[id].at));
                text = `透明人間の証拠を${items.length}つ届けました（${m.task.length}/5）`;
                break;
            default: {
                const note = this.applyBonus(seat, total, def.need.total);
                m.task++;
                text = `${def.name}の目的を進めました（${m.task}/${def.steps}）${note}`;
            }
        }
        this.useItems(seat, items);
        this.log(`${p.name}が${itemList(items)}で、${text}`, { head: this.taskDone(m) });
        this.emit({ type: 'advance', seat, monster: index });
        if (this.taskDone(m)) this.log(`${def.name}を退治できるようになりました`, { head: true });
    }

    defeat(seat, index, items) {
        const m = this.monsters[index];
        const def = MONSTER[m.key];
        const note = this.applyBonus(seat, this.strengthOf(items), def.defeat.total);
        this.useItems(seat, items);
        m.defeated = true;
        m.loc = null;
        this.log(`${this.players[seat].name}が${def.name}を退治しました！${note}`, { head: true });
        this.emit({ type: 'defeat', seat, monster: index });
        if (this.frenzy === index) this.passFrenzy();
        if (this.monsters.every(x => x.defeated)) this.finish(true, 'won');
    }

    // 村人が家に着いたら、連れてきた英雄が特典をもらう
    checkHome(v, seat) {
        if (this.villagers[v] !== VILLAGERS[v].home) return;
        this.villagers[v] = null;
        this.log(`${VILLAGERS[v].name}が無事に家へ帰りました`, { head: true });
        this.emit({ type: 'safe', villager: v, seat });
        this.gainPerk(this.players[seat], true);
    }

    gainPerk(p, announce) {
        if (!this.perkDeck.length) {
            this.perkDeck = shuffle(this.perkUsed, this.random);
            this.perkUsed = [];
        }
        const card = this.perkDeck.shift();
        if (card === undefined) return;
        p.perks.push(card);
        if (announce) this.log(`${p.name}が特典「${PERK[PERK_CARDS[card].key].name}」をもらいました`);
    }

    usePerk(seat, c) {
        const p = this.players[seat];
        const key = PERK_CARDS[c.card].key;
        p.perks = p.perks.filter(id => id !== c.card);
        this.perkUsed.push(c.card);
        const name = PERK[key].name;
        this.emit({ type: 'perk', seat, key });
        switch (key) {
            case 'late':
                this.actionsLeft += 2;
                this.log(`${p.name}が「${name}」：アクションが2回増えました`);
                break;
            case 'dawn':
                this.skipMonster = true;
                this.log(`${p.name}が「${name}」：次の怪物の番をとばします`);
                break;
            case 'hurry': {
                const from = p.loc;
                p.loc = c.to;
                this.log(`${p.name}が「${name}」で${LOCATIONS[c.to].name}へ`);
                this.emit({ type: 'move', seat, from, to: c.to });
                break;
            }
            case 'supply': {
                const got = [];
                for (let i = 0; i < 2; i++) {
                    const id = this.drawItem();
                    if (id !== null) got.push(id);
                }
                p.items.push(...got);
                this.log(`${p.name}が「${name}」：${itemList(got)}を手に入れました`);
                break;
            }
            case 'search': {
                const at = this.board.findIndex(list => list.includes(c.item));
                this.board[at] = this.board[at].filter(id => id !== c.item);
                p.items.push(c.item);
                this.log(`${p.name}が「${name}」：${LOCATIONS[at].name}の${itemList([c.item])}を手に入れました`);
                break;
            }
        }
        if (this.actionsLeft <= 0 && !this.hasPerk(seat, 'late') && !this.freeGuide(seat)) this.startMonsterPhase();
    }

    // ---- アイテムの袋 ----

    drawItem() {
        if (!this.bag.length) {
            if (!this.used.length) return null;
            this.bag = shuffle(this.used, this.random);
            this.used = [];
            this.log('使ったアイテムを袋に戻しました');
        }
        return this.bag.shift();
    }

    placeItem() {
        const id = this.drawItem();
        if (id === null) return null;
        this.board[ITEMS[id].at].push(id);
        return id;
    }

    // ---- 怪物の番 ----

    startMonsterPhase() {
        this.lastStrike = [];
        if (this.skipMonster) {
            this.skipMonster = false;
            this.log('夜明け：怪物の番をとばしました', { head: true });
            this.nextTurn();
            return;
        }
        if (!this.deck.length) {
            this.finish(false, 'deck');
            return;
        }
        const card = MONSTER_CARDS[this.deck.shift()];
        this.cardsUsed.push(card.id);
        this.card = card.id;
        this.phase = 'monster';
        this.log(`怪物の番（残り${this.deck.length}枚）`, { head: true });
        this.emit({ type: 'card', card: card.id });
        const placed = [];
        for (let i = 0; i < card.items; i++) {
            const id = this.placeItem();
            if (id !== null) placed.push(id);
        }
        if (placed.length) {
            this.log(`アイテムが現れました：${placed.map(id => `${LOCATIONS[ITEMS[id].at].name}に${itemList([id])}`).join('、')}`);
            this.emit({ type: 'items', items: placed });
        }
        this.resolveEvent(card.event);
        if (this.isOver()) return;
        this.mq = card.strike.icons
            .map(icon => (icon === 'frenzy' ? this.frenzy : this.monsters.findIndex(m => m.key === icon)))
            .filter(i => i >= 0 && !this.monsters[i].defeated)
            .map(m => ({ m, steps: card.strike.steps, dice: card.strike.dice, moved: false, target: null }));
        this.runMonsters();
    }

    monsterIndex(key) {
        const i = this.monsters.findIndex(m => m.key === key);
        return i >= 0 && !this.monsters[i].defeated ? i : -1;
    }

    resolveEvent(ev) {
        switch (ev.type) {
            case 'villager':
                this.placeVillager(ev.villager, ev.at);
                return;
            case 'frenzy':
                this.passFrenzy();
                return;
            case 'calm':
                this.log('静かな夜……');
                return;
        }
        const i = this.monsterIndex(ev.monster);
        const name = MONSTER[ev.monster].name;
        if (i < 0) {
            this.log(`${name}のできごと：${name}がいないので何も起きません`);
            return;
        }
        const m = this.monsters[i];
        if (ev.type === 'hunt') {
            const from = m.loc;
            this.moveMonster(i, ev.steps);
            this.log(`${name}が獲物を探してうろつきます${from !== m.loc ? `（${LOCATIONS[m.loc].name}へ）` : ''}`);
            return;
        }
        if (ev.type === 'call') {
            this.placeVillager(ev.villager, m.loc, `${name}の近くで、`);
            return;
        }
        const sp = SPECIAL_EVENTS[ev.monster];
        this.log(`${name}のできごと「${sp.name}」`, { head: true });
        switch (ev.monster) {
            case 'vampire': {
                const left = MONSTER.vampire.coffins.filter((_, k) => !m.task[k]);
                if (left.length) {
                    const to = left.reduce((best, l) => (DIST[m.loc][l] < DIST[m.loc][best] ? l : best), left[0]);
                    this.setMonsterLoc(i, to);
                    this.log(`吸血鬼が${LOCATIONS[to].name}の棺へ戻りました`);
                }
                break;
            }
            case 'golem':
                if (m.task > 0 && !this.taskDone(m)) {
                    m.task--;
                    this.log(`人造人間の心が1つ戻りました（${m.task}/3）`);
                }
                break;
            case 'werewolf':
                this.frenzy = i;
                this.log('狼男が狂乱しました');
                this.emit({ type: 'frenzy', monster: i });
                break;
            case 'mummy': {
                const spots = [m.loc, ...NEIGHBORS[m.loc]];
                const gone = spots.flatMap(l => this.board[l]);
                spots.forEach(l => { this.board[l] = []; });
                this.used.push(...gone);
                this.log(gone.length ? `アイテムが${gone.length}つ飛ばされました` : '飛ばされるアイテムはありませんでした');
                break;
            }
            case 'fishman': {
                const vs = this.villagers.filter(l => l !== null);
                if (vs.length) {
                    const to = vs.reduce((best, l) => (DIST[m.loc][l] < DIST[m.loc][best] || (DIST[m.loc][l] === DIST[m.loc][best] && l < best) ? l : best), vs[0]);
                    this.setMonsterLoc(i, to);
                    this.log(`半魚人が${LOCATIONS[to].name}へ水路を抜けてきました`);
                }
                break;
            }
            case 'invisible':
                if (m.task.length && !this.taskDone(m)) {
                    m.task.pop();
                    this.log(`証拠が1つなくなりました（${m.task.length}/5）`);
                }
                break;
        }
    }

    placeVillager(v, at, prefix = '') {
        if (this.villagers[v] !== null || VILLAGERS[v].home === at) return;
        this.villagers[v] = at;
        this.log(`${prefix}${VILLAGERS[v].name}が${LOCATIONS[at].name}に現れました（家は${LOCATIONS[VILLAGERS[v].home].name}）`);
        this.emit({ type: 'villager', villager: v, at });
    }

    passFrenzy() {
        const n = this.monsters.length;
        for (let k = 1; k <= n; k++) {
            const i = ((this.frenzy < 0 ? 0 : this.frenzy) + k) % n;
            if (!this.monsters[i].defeated) {
                const changed = i !== this.frenzy;
                this.frenzy = i;
                if (changed) {
                    this.log(`${MONSTER[this.monsters[i].key].name}が狂乱しました`);
                    this.emit({ type: 'frenzy', monster: i });
                }
                return;
            }
        }
        this.frenzy = -1;
    }

    setMonsterLoc(i, to) {
        const from = this.monsters[i].loc;
        this.monsters[i].loc = to;
        if (from !== to) this.emit({ type: 'monster', monster: i, from, to });
    }

    // いちばん近い人（英雄・村人）。同じ距離なら英雄を先に、地点の番号の小さい方
    nearestPerson(from) {
        let best = null;
        const consider = (l, hero) => {
            const d = DIST[from][l];
            if (!best || d < best.d || (d === best.d && hero && !best.hero) || (d === best.d && hero === best.hero && l < best.l)) best = { d, l, hero };
        };
        this.players.forEach(p => consider(p.loc, true));
        this.villagers.forEach(l => { if (l !== null) consider(l, false); });
        return best;
    }

    moveMonster(i, steps) {
        const m = this.monsters[i];
        const target = this.nearestPerson(m.loc);
        if (!target) return;
        let at = m.loc;
        for (let k = 0; k < steps && at !== target.l; k++) at = stepToward(at, target.l);
        this.setMonsterLoc(i, at);
    }

    roll(n) {
        const faces = [];
        for (let k = 0; k < n; k++) faces.push(DIE_FACES[Math.floor(this.random() * DIE_FACES.length)]);
        return faces;
    }

    // 怪物の列を、選択待ちになるか終わるまで進める
    runMonsters() {
        while (this.mq.length && !this.isOver()) {
            const s = this.mq[0];
            const m = this.monsters[s.m];
            if (m.defeated) {
                this.mq.shift();
                continue;
            }
            const name = MONSTER[m.key].name;
            if (!s.moved) {
                s.moved = true;
                const from = m.loc;
                this.moveMonster(s.m, s.steps);
                const where = from === m.loc ? `${LOCATIONS[m.loc].name}にとどまります` : `${LOCATIONS[m.loc].name}へ移動`;
                const options = [
                    ...this.heroesAt(m.loc).map(id => ({ kind: 'hero', id })),
                    ...this.villagersAt(m.loc).map(id => ({ kind: 'villager', id }))
                ];
                this.log(`${name}${s.m === this.frenzy ? '（狂乱）' : ''}が${where}`);
                if (!options.length) {
                    this.lastStrike.push({ monster: s.m, at: m.loc, target: null });
                    this.mq.shift();
                    continue;
                }
                if (options.length > 1) {
                    this.prompt = { type: 'target', seat: this.current, monster: s.m, dice: s.dice, options };
                    return;
                }
                s.target = options[0];
            }
            if (!s.rolled) {
                s.rolled = true;
                const faces = this.roll(s.dice);
                s.faces = faces;
                s.hits = faces.filter(f => f === 'hit').length;
                s.powers = faces.filter(f => f === 'power').length;
                if (m.key === 'golem') s.hits += s.powers;
                const who = s.target.kind === 'hero' ? this.players[s.target.id].name : VILLAGERS[s.target.id].name;
                this.log(`${name}が${who}を襲います：命中${s.hits}・力${s.powers}`);
                this.emit({ type: 'attack', monster: s.m, target: s.target, faces });
                if (s.target.kind === 'hero' && s.hits > 0) {
                    const hero = this.players[s.target.id];
                    if (hero.items.length >= s.hits) {
                        this.prompt = { type: 'defend', seat: hero.id, monster: s.m, hits: s.hits };
                        return;
                    }
                }
                this.resolveHits(s, []);
            }
        }
        if (!this.isOver()) this.nextTurn();
    }

    resolveDefense(items) {
        const s = this.mq[0];
        this.prompt = null;
        this.resolveHits(s, items);
        this.runMonsters();
    }

    // 命中と力を解決して、列から外す
    resolveHits(s, blockItems) {
        const m = this.monsters[s.m];
        let outcome = 'miss';
        if (s.hits > 0) {
            if (s.target.kind === 'villager') {
                const v = s.target.id;
                this.villagers[v] = null;
                this.log(`${VILLAGERS[v].name}が倒れました`, { head: true });
                this.emit({ type: 'killed', villager: v });
                outcome = 'killed';
                this.raiseTerror();
            } else {
                const hero = this.players[s.target.id];
                if (blockItems.length === s.hits) {
                    this.useItems(hero.id, blockItems);
                    this.log(`${hero.name}が${itemList(blockItems)}を捨てて防ぎました`);
                    outcome = 'blocked';
                } else {
                    const from = hero.loc;
                    hero.loc = HOSPITAL;
                    this.log(`${hero.name}が倒され、${LOCATIONS[HOSPITAL].name}へ運ばれました`, { head: true });
                    this.emit({ type: 'down', seat: hero.id, from });
                    outcome = 'down';
                    this.raiseTerror();
                }
            }
        }
        this.lastStrike.push({ monster: s.m, at: m.loc, target: s.target, faces: s.faces, outcome });
        if (!this.isOver() && m.key !== 'golem') for (let k = 0; k < s.powers && !this.isOver(); k++) this.monsterPower(s.m);
        this.mq.shift();
    }

    monsterPower(i) {
        const m = this.monsters[i];
        switch (m.key) {
            case 'vampire': {
                const p = this.players[this.current];
                if (p.loc !== m.loc) {
                    const from = p.loc;
                    p.loc = m.loc;
                    this.log(`魅了：${p.name}が${LOCATIONS[m.loc].name}へ引き寄せられました`);
                    this.emit({ type: 'move', seat: p.id, from, to: m.loc });
                }
                break;
            }
            case 'werewolf':
                this.log('遠吠え：村が恐怖に包まれます');
                this.raiseTerror();
                break;
            case 'mummy':
                this.heroesAt(m.loc).forEach(id => {
                    const p = this.players[id];
                    if (!p.items.length) return;
                    const weakest = p.items.reduce((a, b) => (ITEMS[b].strength < ITEMS[a].strength ? b : a));
                    this.useItems(id, [weakest]);
                    this.log(`呪い：${p.name}の${itemList([weakest])}が朽ちました`);
                });
                break;
            case 'fishman': {
                const gone = this.board[m.loc];
                if (gone.length) {
                    this.board[m.loc] = [];
                    this.used.push(...gone);
                    this.log(`水しぶき：${LOCATIONS[m.loc].name}のアイテムが流されました`);
                }
                break;
            }
            case 'invisible': {
                const p = this.players[this.current];
                if (!p.items.length) break;
                const strongest = p.items.reduce((a, b) => (ITEMS[b].strength > ITEMS[a].strength ? b : a));
                this.useItems(p.id, [strongest]);
                this.log(`盗み：${p.name}の${itemList([strongest])}が消えました`);
                break;
            }
        }
    }

    raiseTerror() {
        this.terror++;
        this.log(`恐怖 ${this.terror}/${TERROR_MAX}`);
        this.emit({ type: 'terror', terror: this.terror });
        if (this.terror >= TERROR_MAX) this.finish(false, 'terror');
    }

    startTurnState() {
        this.actionsLeft = this.heroOf(this.current).actions;
        this.bonusUsed = false;
        this.guideUsed = false;
    }

    nextTurn() {
        this.mq = [];
        this.prompt = null;
        this.phase = 'actions';
        this.current = (this.current + 1) % this.players.length;
        this.turnNo++;
        this.startTurnState();
        this.log(`${this.heroLabel(this.current)}の手番`, { head: true });
        this.emit({ type: 'turn', seat: this.current });
    }

    finish(won, reason) {
        this.phase = 'end';
        this.mq = [];
        this.prompt = null;
        this.result = { won, reason };
        this.log(won ? `勝利！ ${END_REASONS[reason]}` : `敗北…… ${END_REASONS[reason]}`, { head: true });
        this.emit({ type: 'end', won, reason });
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
    }

    log(text, { head = false } = {}) {
        this.logs.push({ n: ++this.logTotal, text, head });
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: structuredClone(this.options),
            commands: structuredClone(this.commands)
        };
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`操作 ${i} を再現できませんでした: ${game.lastError}`);
        });
        return game;
    }

    // CPU が手を試すための写し（英雄の番のアクションだけに使う。記録・ログ・乱数は持たない）
    simClone() {
        const g = Object.create(Game.prototype);
        g.options = this.options;
        g.players = this.players.map(p => ({ ...p, items: [...p.items], perks: [...p.perks] }));
        g.monsters = this.monsters.map(m => ({ ...m, task: Array.isArray(m.task) ? [...m.task] : m.task }));
        g.board = this.board.map(list => [...list]);
        g.villagers = [...this.villagers];
        g.used = [];
        g.bag = [];
        g.perkDeck = [];
        g.perkUsed = [];
        g.frenzy = this.frenzy;
        g.terror = this.terror;
        g.current = this.current;
        g.phase = this.phase;
        g.prompt = null;
        g.actionsLeft = this.actionsLeft;
        g.bonusUsed = this.bonusUsed;
        g.guideUsed = this.guideUsed;
        g.skipMonster = this.skipMonster;
        g.result = null;
        g.sim = true;
        g.safeCount = 0;
        g.commands = { push() {} };
        g.log = () => {};
        g.emit = () => {};
        // 試すときは怪物の番に入らない。特典は1枚もらえたことだけを数える
        g.startMonsterPhase = () => {};
        g.gainPerk = (p) => { p.perks.push(-1); g.safeCount++; };
        g.finish = (won, reason) => { g.result = { won, reason }; };
        g.isOver = () => g.result !== null;
        return g;
    }
}

export { LOCATIONS, MONSTER, HERO };
