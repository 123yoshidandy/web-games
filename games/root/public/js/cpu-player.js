/**
 * CPU の手を決める（DOM に依存しない）
 * - 選ぶのは game.legalActions(seat) の中から。ルールを守るのは、この一覧が保証する
 * - 見るのは、地図などの公開された情報と、自分の手札だけ（ほかの人の手札・山札・遺跡の中身はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 陣営ごとの方針で、取れる手に点数を付け、一番よい手を選ぶ。よい手がなければ「次へ」
 *   - 侯爵家：徴兵と建設を優先し、支配する空き地を広げる。勝てる戦いだけをする
 *   - 鷲の王朝：布告は果たせそうな列にだけ足す。止まり木を増やす
 *   - 森林連合：同調者を広げ、支持者がそろえば暴動。官吏を育てて夕方に組織する
 *   - 放浪者：遺跡の探索・クエスト・援助を目当てに動く。守りのない建物は攻める
 */

import { CLEARINGS, adjacency, CARDS, FORESTS, QUESTS, MARQUISE_COST, MARQUISE_VP } from './data.js';
import { createRandom } from './random.js';
import { matches } from './game.js';

export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// seat の CPU に1手打たせる。決めた手が断られたら、一覧の最後（次へ・答えない）か最初の手で必ず進める
export function runCpuStep(game, seat) {
    if (!game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    const legal = game.legalActions(seat);
    const fallback = legal.find(a => a.type === 'next') ?? legal.find(a => a.card === null) ?? legal[0];
    if (!fallback) return false;
    return game.applyCommand(seat, fallbackCommand(game, seat, fallback));
}

function fallbackCommand(game, seat, action) {
    if (action.type === 'discard') return { type: 'discard', cards: game.players[seat].hand.slice(0, action.count) };
    const command = { ...action };
    delete command.max;
    if (action.max) command.count = action.max;
    return command;
}

// 人の席のおすすめの手（ヒント）。CPU と同じ判断（公開された情報と自分の手札だけを見る）。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.isOver?.() || !game.actors().includes(seat)) return null;
    return chooseCpuCommand(game, seat, 'normal');
}

// level：'easy' は判断の揺れを大きくして、ときどき甘い手を選ぶ
export function chooseCpuCommand(game, seat, level = game.options.level ?? 'normal') {
    const noise = level === 'easy' ? 3 : 0.05;
    const legal = game.legalActions(seat);
    if (legal.length === 0) return null;
    const random = cpuRandom(game, seat);
    const ctx = new Context(game, seat, random);
    if (legal[0].type === 'discard') return { type: 'discard', cards: ctx.cardsToDiscard(legal[0].count) };
    let best = null;
    let bestValue = -Infinity;
    legal.forEach(action => {
        const scored = ctx.evaluate(action);
        if (!scored) return;
        const value = scored.value + random() * noise;
        if (value > bestValue) {
            bestValue = value;
            best = scored.command;
        }
    });
    const next = legal.find(a => a.type === 'next');
    if (next && bestValue <= 0.1) return { type: 'next' };
    return best ?? fallbackCommand(game, seat, legal[0]);
}

class Context {
    constructor(game, seat, random) {
        this.game = game;
        this.seat = seat;
        this.random = random;
        this.p = game.players[seat];
        this.f = this.p.faction;
    }

    // ---- カードの値打ち（手元に残したい度合い） ----

    keepValue(id) {
        const card = CARDS[id];
        if (card.kind === 'ambush') return 2;
        if (card.kind === 'dominance') return 1.2;
        let v = card.suit === 'bird' ? 0.6 : 0.3;
        if (card.item) v += card.vp * 0.6 + (this.f === 'vagabond' ? 0.6 : 0);
        if (card.kind === 'effect') v += 0.8;
        if (card.kind === 'favor') v += 1;
        return v;
    }

    cardsToDiscard(n) {
        return [...this.p.hand].sort((a, b) => this.keepValue(a) - this.keepValue(b)).slice(0, n);
    }

    // ---- 地図の見積もり ----

    myWarriors(c) {
        return this.game.warriors(c, this.f);
    }

    enemyStrength(c) {
        const g = this.game;
        return ['marquise', 'eyrie', 'alliance'].filter(f => f !== this.f && g.has(f))
            .reduce((s, f) => s + g.warriors(c, f) + g.map[c].buildings.filter(b => b.faction === f).length, 0);
    }

    ruledCount(f = this.f) {
        return this.game.map.filter((m, c) => this.game.rules(f, c)).length;
    }

    // 移動したら、支配する空き地がいくつ変わるか（見積もり）
    moveGain(from, to, count) {
        const g = this.game;
        const before = [from, to].filter(c => g.rules(this.f, c)).length;
        const saved = [g.map[from].warriors[this.f], g.map[to].warriors[this.f]];
        g.map[from].warriors[this.f] = saved[0] - count;
        g.map[to].warriors[this.f] = (saved[1] ?? 0) + count;
        const after = [from, to].filter(c => g.rules(this.f, c)).length;
        // 元に戻す（項目がなかったときは、項目ごと消す）
        g.map[from].warriors[this.f] = saved[0];
        if (saved[1] === undefined) delete g.map[to].warriors[this.f];
        else g.map[to].warriors[this.f] = saved[1];
        return after - before;
    }

    evaluateMove(action, bonus = () => 0) {
        const g = this.game;
        const n = action.max;
        const counts = [...new Set([1, Math.ceil(n / 2), n - 1, n].filter(k => k >= 1 && k <= n))];
        let best = null;
        counts.forEach(count => {
            const left = n - count;
            const hasBuildings = g.map[action.from].buildings.some(b => b.faction === this.f);
            let v = this.moveGain(action.from, action.to, count) * 3;
            if (hasBuildings && left === 0) v -= 3;
            if (left > 0 && left < this.enemyStrength(action.from)) v -= 1;
            const toEnemies = this.enemyStrength(action.to);
            if (toEnemies > 0 && count + g.warriors(action.to, this.f) > toEnemies) v += 0.8;
            if (g.freeSlots(action.to) > 0 && !g.rules(this.f, action.to)) v += 0.5;
            // 守りのない敵の建物・トークン（とくに首位の陣営の）へ向かう
            const exposed = ['marquise', 'eyrie', 'alliance'].filter(f => f !== this.f && g.has(f) && g.warriors(action.to, f) === 0
                && (g.map[action.to].buildings.some(b => b.faction === f) || g.map[action.to].tokens.some(t => t.faction === f)));
            if (exposed.length > 0) v += exposed.some(f => this.isLeader(f) || f === 'alliance') ? 1 : 0.4;
            // 同調者のある空き地に入ると、憤激でカードを渡す。連合が脅威で、勝てる数で崩しに入るときだけ値打ちがある
            if (this.f !== 'alliance' && this.sympathetic(action.to)) {
                const strong = count + g.warriors(action.to, this.f) > g.warriors(action.to, 'alliance');
                if (this.allianceThreat() && strong) v += g.hasBuilding(action.to, 'alliance', 'base') ? 2.5 : 1.5;
                else v -= 2;
            }
            v += bonus(action.to, count) - 0.3;
            if (!best || v > best.value) best = { value: v, command: { type: 'move', from: action.from, to: action.to, count, card: action.card } };
        });
        return best;
    }

    evaluateBattle(action) {
        const g = this.game;
        const c = action.clearing;
        const def = action.defender;
        const mine = this.f === 'vagabond' ? g.vbSwords() : this.myWarriors(c);
        if (def === 'vagabond') return { value: mine >= 3 ? 0.5 : -1, command: action };
        const theirs = g.warriors(c, def);
        const pieces = g.map[c].buildings.filter(b => b.faction === def).length + g.map[c].tokens.filter(t => t.faction === def).length;
        let v = -1;
        if (theirs === 0 && pieces > 0) v = 2 + pieces;
        else if (mine >= theirs + 1 && mine >= 2) {
            // 兵だけを相手にする戦闘は点にならない。自分の建物を守るか、支配を取り返せるときだけ
            const mineHere = g.map[c].buildings.some(b => b.faction === this.f);
            v = pieces > 0 ? 0.8 + pieces * 0.8 : (mineHere || g.rules(def, c) ? 0.6 : 0.05);
        }
        if (this.f === 'vagabond' && theirs > 0 && g.fs.vagabond.relations[def] !== 'hostile') v -= 1;
        // 得点の首位と、森林連合の同調者は、崩す値打ちが高い
        if (v > 0 && this.isLeader(def)) v += 0.8;
        if (v > 0 && def === 'alliance') {
            v += g.map[c].tokens.filter(t => t.kind === 'sympathy').length * 0.8;
            if (this.allianceThreat()) v += 2 + (g.hasBuilding(c, 'alliance', 'base') ? 2 : 0);
        }
        return { value: v, command: action };
    }

    sympathetic(c) {
        return this.game.map[c].tokens.some(t => t.kind === 'sympathy');
    }

    // 森林連合が勝ちに近い（得点がほかの最高に迫る、または同調者が多い）
    allianceThreat() {
        const g = this.game;
        if (!g.has('alliance') || this.f === 'alliance') return false;
        const score = g.players[g.seatOf.alliance].score;
        const best = Math.max(...g.players.filter(o => o.faction !== 'alliance').map(o => o.score));
        return score >= best - 2 || g.tokenCount('alliance', 'sympathy') >= 4;
    }

    isLeader(f) {
        const g = this.game;
        const score = g.players[g.seatOf[f]].score;
        return score >= 10 && g.players.every(o => o.faction === this.f || o.score <= score);
    }

    evaluateCraft(action) {
        const card = CARDS[action.card];
        const g = this.game;
        if (card.item) return { value: 2 + card.vp + (this.f === 'vagabond' ? 1 : 0), command: action };
        if (card.kind === 'favor') {
            let v = 0;
            g.map.forEach((m, c) => {
                if (CLEARINGS[c].suit !== card.suit) return;
                m.buildings.forEach(b => { if (b.faction !== this.f) v += 1.5; });
                m.tokens.forEach(t => { if (t.faction !== this.f) v += 1; });
                Object.entries(m.warriors).forEach(([f, n]) => { if (f !== this.f) v += n * 0.4; });
            });
            return { value: v - 1.5, command: action };
        }
        const effects = { armorers: 1.6, brutal: 1.2, royal: 1.6, sappers: 1.6, stand: 1.4, tax: 1.8, bank: 1.8, cobbler: 1.2, warren: 1.2, codebreakers: 0.2, scouting: 1 };
        return { value: effects[card.effect] ?? 0.5, command: action };
    }

    // ---- 1手の評価 ----

    evaluate(action) {
        const g = this.game;
        const type = action.type;
        // 割り込みの答え
        if (type === 'ambush' || type === 'counter') return { value: action.card === null ? 0.2 : 1, command: action };
        if (type === 'hospital') {
            const prompt = g.prompts[0];
            const use = action.card !== null && (prompt.count >= 2 || this.p.hand.length >= 4);
            return { value: action.card === null ? 0.5 : (use ? 1.5 - this.keepValue(action.card) * 0.3 : 0), command: action };
        }
        if (type === 'next') return null;
        // 準備
        if (type === 'keep') return { value: this.cornerValue(action.clearing), command: action };
        if (type === 'place') return { value: g.freeSlots(action.clearing) + (action.clearing === g.keepClearing() ? 0.5 : 0), command: action };
        if (type === 'corner') return { value: this.cornerValue(action.clearing), command: action };
        if (type === 'leader') return { value: { despot: 4, charismatic: 3, builder: 2.5, commander: 2 }[action.leader] + this.random(), command: action };
        if (type === 'character') return { value: this.random(), command: action };
        if (type === 'forest') {
            const f = FORESTS[action.forest];
            return { value: f.clearings.filter(c => g.map[c].ruin).length + this.random(), command: action };
        }
        // 共通
        if (type === 'craft') {
            const scored = this.evaluateCraft(action);
            if (this.f === 'marquise' && scored.value > 0) scored.value += 3;
            return scored;
        }
        if (type === 'dominance') {
            const suit = CARDS[action.card].suit;
            const ruled = suit === 'bird'
                ? ([[0, 2], [1, 3]].some(([a, b]) => g.rules(this.f, a) && g.rules(this.f, b)) ? 3 : 0)
                : g.map.filter((m, c) => CLEARINGS[c].suit === suit && g.rules(this.f, c)).length;
            return { value: ruled >= 3 && this.p.score < 24 && this.f !== 'vagabond' ? 5 : -1, command: action };
        }
        if (type === 'takeDominance' || type === 'peek') return { value: -1, command: action };
        if (type === 'royal') return { value: this.ruledCount() - 2.5, command: action };
        if (type === 'stand' || type === 'bank') {
            const low = Math.min(...g.players.filter(o => o.id !== this.seat).map(o => o.score));
            return { value: g.players[action.target].score === low ? 1.2 : 0, command: action };
        }
        if (type === 'tax') return { value: this.myWarriors(action.clearing) >= 3 && this.p.hand.length < 5 ? 0.8 : -1, command: action };
        if (type === 'battle') return this.evaluateBattle(action);
        return this[`${this.f}Evaluate`](action);
    }

    cornerValue(c) {
        const g = this.game;
        return adjacency[c].reduce((s, x) => s + CLEARINGS[x].slots, CLEARINGS[c].slots) + this.random();
    }

    // ---- 侯爵家 ----

    marquiseEvaluate(action) {
        const g = this.game;
        const t = g.tt;
        switch (action.type) {
            case 'recruit': return { value: g.supply('marquise') >= 1 ? 3 : -1, command: action };
            case 'build': {
                const placed = g.buildingCount('marquise', action.kind);
                const vp = MARQUISE_VP[action.kind][placed];
                const wood = g.tokenCount('marquise', 'wood');
                let v = 4.5 + vp - MARQUISE_COST[placed] * 0.3;
                if (action.kind === 'sawmill' && wood <= 2) v += 1;
                if (action.kind === 'recruiter' && g.buildingCount('marquise', 'recruiter') >= 3) v -= 0.5;
                v += Math.min(2, this.myWarriors(action.clearing)) * 0.2 - this.enemyStrength(action.clearing) * 0.3;
                return { value: v, command: action };
            }
            case 'overwork': {
                const low = g.tokenCount('marquise', 'wood') < 4;
                return { value: (low ? 2.4 : 1) - this.keepValue(action.card) * 0.6, command: action };
            }
            case 'hawks': {
                const birds = this.p.hand.filter(id => CARDS[id].suit === 'bird').length;
                return { value: t.actions === 0 && birds >= 2 && this.keepValue(action.card) < 1 ? 1 : -1, command: action };
            }
            case 'move': return this.evaluateMove(action);
            default: return null;
        }
    }

    // ---- 鷲の王朝 ----

    // 布告の列にその印のカードを足したとき、果たせそうか（果たせる数の余裕）
    decreeRoom(column, suit) {
        const g = this.game;
        const decree = g.fs.eyrie.decree[column];
        const need = decree.filter(e => e.suit === suit).length + 1;
        const fit = (c) => suit === 'bird' || CLEARINGS[c].suit === suit;
        // 移動は、今動ける空き地の兵の数だけできる（1回に1体以上動かすので）
        const movable = new Set(g.moveOptions('eyrie').map(m => m.from));
        let have = 0;
        g.map.forEach((m, c) => {
            if (!fit(c)) return;
            if (column === 'recruit' && g.hasBuilding(c, 'eyrie', 'roost')) have++;
            if (column === 'move' && movable.has(c)) have += Math.max(0, g.warriors(c, 'eyrie') - (g.hasBuilding(c, 'eyrie', 'roost') ? 1 : 0));
            if (column === 'battle' && g.warriors(c, 'eyrie') >= 3 && this.enemyStrength(c) + g.map[c].tokens.filter(tk => tk.faction !== 'eyrie').length > 0) have++;
            if (column === 'build' && g.rules('eyrie', c) && g.freeSlots(c) > 0 && !g.hasBuilding(c, 'eyrie', 'roost') && g.canPlace('eyrie', c)) have++;
        });
        // 鳥のカードは、どの印のカードとも同じ空き地を取り合う
        if (suit === 'bird') return have - decree.length;
        return have - need - decree.filter(e => e.suit === 'bird').length + 1;
    }

    eyrieEvaluate(action) {
        const g = this.game;
        switch (action.type) {
            case 'decree': {
                const suit = CARDS[action.card].suit;
                const room = this.decreeRoom(action.column, suit);
                const base = { recruit: 1.4, move: 1.2, build: 1.6, battle: 0.6 }[action.column];
                const second = g.tt.added >= 1;
                let v = room > 0 ? base + Math.min(room, 2) * 0.3 : -2;
                if (second && (room < 2 || this.p.hand.length < 3)) v -= 2;
                if (suit === 'bird') v -= 0.3;
                v -= this.keepValue(action.card) * 0.3;
                return { value: v, command: action };
            }
            case 'newRoost': return { value: adjacency[action.clearing].length + this.random(), command: action };
            case 'recruit': return { value: 2 + this.enemyStrength(action.clearing) * 0.2, command: action };
            case 'build': return { value: 5, command: action };
            case 'move': {
                const builds = g.fs.eyrie.decree.build.map(e => e.suit);
                const bonus = (to, count) => {
                    const fitsBuild = builds.some(s => s === 'bird' || s === CLEARINGS[to].suit) && g.freeSlots(to) > 0 && !g.hasBuilding(to, 'eyrie', 'roost');
                    return fitsBuild ? 1.5 : 0;
                };
                const result = this.evaluateMove(action, bonus);
                // 布告の移動は必ず果たすので、点数が低くても選べるようにする
                return { value: result.value + 3, command: result.command };
            }
            default: return null;
        }
    }

    // ---- 森林連合 ----

    allianceEvaluate(action) {
        const g = this.game;
        const a = g.fs.alliance;
        switch (action.type) {
            case 'spread': {
                const enemies = this.enemyStrength(action.clearing);
                return { value: 3 - enemies * 0.4 + g.spreadCost(action.clearing) * -0.2, command: action };
            }
            case 'revolt': {
                const c = action.clearing;
                const m = g.map[c];
                let v = 4;
                m.buildings.forEach(b => { if (b.faction !== 'alliance') v += 1.5; });
                m.tokens.forEach(t => { if (t.faction !== 'alliance') v += 1; });
                v += g.map.filter((x, i) => CLEARINGS[i].suit === CLEARINGS[c].suit && g.hasToken(i, 'alliance', 'sympathy')).length * 0.5;
                return { value: v, command: action };
            }
            case 'mobilize': {
                const keep = this.keepValue(action.card);
                // 手札は工作と待ち伏せのために残し、多すぎる分だけ支持者に回す
                return { value: this.p.hand.length > 4 ? 1.5 - keep * 0.5 : -1, command: action };
            }
            case 'train': return { value: a.officers < 4 ? 2 - this.keepValue(action.card) * 0.5 : 0.3, command: action };
            case 'organize': return { value: 3.5, command: action };
            case 'recruit': return { value: 1.5, command: action };
            case 'move': {
                const bonus = (to) => (!g.hasToken(to, 'alliance', 'sympathy') && g.canPlace('alliance', to) ? 1.2 : 0);
                return this.evaluateMove(action, bonus);
            }
            default: return null;
        }
    }

    // ---- 放浪者 ----

    // 目当ての空き地（遺跡・クエスト・援助）と、その値打ち
    vagabondGoals() {
        const g = this.game;
        const vb = g.fs.vagabond;
        const goals = new Map();
        const add = (c, v) => goals.set(c, Math.max(goals.get(c) ?? 0, v));
        g.map.forEach((m, c) => {
            if (m.ruin && g.vbCount('torch', { damaged: false }) > 0) add(c, 4);
            vb.quests.forEach(qid => {
                const q = QUESTS[qid];
                if (q.suit !== CLEARINGS[c].suit) return;
                const own = q.items.every(type => g.vbCount(type, { damaged: false }) >= q.items.filter(x => x === type).length);
                if (own) add(c, 3);
            });
            const others = ['marquise', 'eyrie', 'alliance'].filter(f => g.has(f) && g.present(f, c) && vb.relations[f] !== 'hostile');
            if (others.length > 0 && this.p.hand.some(id => matches(id, CLEARINGS[c].suit))) add(c, 1);
            const weak = ['marquise', 'eyrie', 'alliance'].some(f => g.has(f) && g.warriors(c, f) === 0
                && (m.buildings.some(b => b.faction === f) || m.tokens.some(t => t.faction === f)));
            if (weak && g.vbSwords() > 0) add(c, 2);
        });
        return goals;
    }

    distances(from) {
        const dist = new Array(CLEARINGS.length).fill(Infinity);
        dist[from] = 0;
        const queue = [from];
        while (queue.length) {
            const x = queue.shift();
            adjacency[x].forEach(y => {
                if (dist[y] === Infinity) {
                    dist[y] = dist[x] + 1;
                    queue.push(y);
                }
            });
        }
        return dist;
    }

    // その空き地へ行く値打ち（目当てに近づくほど高い）
    placeValue(to) {
        const goals = this.vagabondGoals();
        const dist = this.distances(to);
        let best = 0;
        goals.forEach((v, c) => { best = Math.max(best, v / (1 + dist[c])); });
        return best;
    }

    vagabondEvaluate(action) {
        const g = this.game;
        const vb = g.fs.vagabond;
        const here = vb.clearing;
        switch (action.type) {
            case 'slip':
            case 'move': {
                if (action.type === 'slip' && action.clearing === null) return { value: -1, command: action };
                const to = action.type === 'slip' ? action.clearing : action.to;
                const current = here !== null ? this.placeValue(here) : 0;
                const v = this.placeValue(to) - current - (action.type === 'move' ? 0.3 : 0) - (this.sympathetic(to) ? 1 : 0);
                return { value: here === null ? v + 1 : v, command: action };
            }
            case 'explore': return { value: 5, command: action };
            case 'quest': {
                const q = QUESTS[action.quest];
                const n = vb.completed.filter(id => QUESTS[id].suit === q.suit).length + 1;
                const v = action.reward === 'score' ? 3 + n : 4.5 - (this.p.hand.length >= 4 ? 1.5 : 0);
                return { value: v, command: action };
            }
            case 'aid': {
                const relation = vb.relations[action.target];
                if (relation === 'hostile') return { value: -1, command: action };
                const target = g.players[g.seatOf[action.target]];
                let v = 1.2 - this.keepValue(action.card) * 0.6 + (target.crafted.length > 0 ? 1.5 : 0) + (relation === 'allied' ? 1 : 0);
                const lead = Math.max(...g.players.map(o => o.score));
                if (target.score === lead && target.score >= 15) v -= 2;
                return { value: v, command: action };
            }
            case 'strike': {
                const c = here;
                const def = action.target;
                const pieces = g.map[c].buildings.filter(b => b.faction === def).length + g.map[c].tokens.filter(t => t.faction === def).length;
                return { value: g.warriors(c, def) === 0 && pieces > 0 ? 2.5 : -1, command: action };
            }
            case 'repair': return { value: ['sword', 'boot', 'torch', 'hammer'].includes(action.item) ? 3 : 1.5, command: action };
            case 'steal': return { value: 1.5, command: action };
            case 'daylabor': return { value: 0.5 + this.keepValue(action.card), command: action };
            case 'hideout': return { value: vb.items.filter(i => i.damaged).length >= 2 ? 2 : -1, command: action };
            default: return null;
        }
    }
}
