/**
 * タケノコのルールと状態（DOM に依存しない）
 *
 * 操作はすべて applyCommand(seat, command) に通す。受け付けたら true、断ったら false と lastError。
 * 受け付けた操作だけを commands に記録し、Game.replay で同じ状態を作り直せる。
 * 断る操作は状態を変えない（判定をすべて済ませてから変える）。
 *
 * 操作：
 *   天気   { type: 'weather', weather }（「？」の目で天気を選ぶ） / { type: 'rain', q, r } / { type: 'storm', q, r }
 *          { type: 'improve', improvement, q, r }（雲：チップを置く） / { type: 'improve', from: [q, r], q, r }（チップがないとき、置いたチップを動かす）
 *          { type: 'skip' }（雨・嵐・雲の効果を使わない）
 *   行動   { type: 'drawPlots' } → { type: 'placePlot', choice, q, r }（区画）
 *          { type: 'irrigate', a: [q, r], b: [q, r] }（灌漑：2つの区画の境目に水路を置く）
 *          { type: 'gardener', q, r } / { type: 'panda', q, r } / { type: 'drawObjective', kind }
 *   いつでも { type: 'complete', card }（目標を達成する）
 *   終わり { type: 'endTurn' }
 *
 * 六角形の座標は軸座標 (q, r)。池は (0, 0)
 */

import {
    PLOTS, CARDS, CARD_TYPES, SHAPES, MAX_BAMBOO, IMPROVEMENTS, IMPROVEMENT_TOKENS, IRRIGATION_CHANNELS,
    HAND_LIMIT, OBJECTIVES_TO_END, EMPEROR_POINTS, WEATHERS, ACTIONS, cardIdsOf
} from './data.js';
import { createRandom, createSeed, shuffle } from './random.js';

export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const key = (q, r) => `${q},${r}`;
export const parseKey = k => k.split(',').map(Number);
export const neighbors = (q, r) => DIRS.map(([dq, dr]) => [q + dq, r + dr]);
export const edgeKey = (a, b) => [key(...a), key(...b)].sort().join('|');
const adjacent = (a, b) => DIRS.some(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);

// 辺 (a, b) の両端の点。点は、そこで接する3つの六角形の座標の組で表す
export function edgeVertices(a, b) {
    const common = neighbors(...a).filter(n => adjacent(n, b));
    return common.map(c => [key(...a), key(...b), key(...c)].sort().join('|'));
}

// 形を60度ずつ回す（軸座標）
const rotate = ([q, r]) => [-r, q + r];
export function rotations(cells) {
    const list = [];
    let current = cells;
    for (let i = 0; i < 6; i++) {
        list.push(current);
        current = current.map(rotate);
    }
    return list;
}

export default class Game {
    // players: [{ name, isCPU }]（2〜4人） / options: { seed }
    constructor(players, options = {}) {
        if (players.length < 2 || players.length > 4) throw new Error('人数は2〜4人です');
        this.seed = (options.seed ?? createSeed()) >>> 0;
        this.random = createRandom(this.seed);
        this.tiles = { [key(0, 0)]: { q: 0, r: 0, color: 'pond', improvement: null, fixed: false, bamboo: 0, wet: true } };
        this.channels = {};
        this.plotDeck = shuffle(PLOTS.map(p => p.id), this.random);
        this.tokens = Object.fromEntries(IMPROVEMENTS.map(i => [i, IMPROVEMENT_TOKENS]));
        this.irrigationLeft = IRRIGATION_CHANNELS;
        this.gardener = [0, 0];
        this.panda = [0, 0];
        this.decks = Object.fromEntries(CARD_TYPES.map(type => [type, shuffle(cardIdsOf(type), this.random)]));
        // 最初に、全員が各種類の目標を1枚ずつ持つ
        this.players = players.map((player, seat) => ({
            seat,
            name: player.name,
            isCPU: !!player.isCPU,
            hand: CARD_TYPES.map(type => this.decks[type].pop()),
            done: [],
            eaten: { green: 0, yellow: 0, pink: 0 },
            emperor: false
        }));
        this.startSeat = Math.floor(this.random() * players.length);
        this.current = this.startSeat;
        this.round = 1;
        this.finalRound = null; // { trigger, remaining }
        this.phase = 'play';
        this.commands = [];
        this.logs = [];
        this.lastError = null;
        this.lastMove = null;
        this.result = null;
        this.beginTurn();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません: ${game.lastError}`);
        }
        return game;
    }

    get isOver() {
        return this.phase === 'end';
    }

    // ===== 盤面を調べる =====

    tileAt(q, r) {
        return this.tiles[key(q, r)];
    }

    isPlot(q, r) {
        const t = this.tileAt(q, r);
        return !!t && t.color !== 'pond';
    }

    plots() {
        return Object.values(this.tiles).filter(t => t.color !== 'pond');
    }

    // 灌漑されているか：池の隣、まわりの辺に水路、池の改良
    isIrrigated(q, r) {
        const t = this.tileAt(q, r);
        if (!t || t.color === 'pond') return false;
        if (t.improvement === 'watershed') return true;
        return neighbors(q, r).some(([nq, nr]) => {
            if (nq === 0 && nr === 0) return true;
            return !!this.channels[edgeKey([q, r], [nq, nr])];
        });
    }

    // 区画を置ける場所：空いていて、池の隣か、置いてある2枚以上の隣
    plotSpots() {
        const spots = new Map();
        for (const t of Object.values(this.tiles)) {
            for (const [q, r] of neighbors(t.q, t.r)) {
                const k = key(q, r);
                if (this.tiles[k] || spots.has(k)) continue;
                const around = neighbors(q, r).filter(([nq, nr]) => this.tiles[key(nq, nr)]);
                const nearPond = around.some(([nq, nr]) => nq === 0 && nr === 0);
                if (nearPond || around.length >= 2) spots.set(k, [q, r]);
            }
        }
        return [...spots.values()];
    }

    // 水路を置ける辺：2つの区画の境目で、池の縁ではなく、池か水路につながる
    irrigationSpots() {
        const result = [];
        const seen = new Set();
        const ends = new Set();
        for (const k of Object.keys(this.channels)) {
            const [a, b] = k.split('|').map(parseKey);
            for (const v of edgeVertices(a, b)) ends.add(v);
        }
        for (const t of this.plots()) {
            for (const n of neighbors(t.q, t.r)) {
                if (!this.isPlot(...n)) continue;
                const k = edgeKey([t.q, t.r], n);
                if (seen.has(k) || this.channels[k]) continue;
                seen.add(k);
                const vertices = edgeVertices([t.q, t.r], n);
                const connected = vertices.some(v => v.split('|').includes(key(0, 0)) || ends.has(v));
                if (connected) result.push([[t.q, t.r], n]);
            }
        }
        return result;
    }

    // まっすぐ進める先（池も通れて、止まれる。空きは越えられない）
    reachable(from) {
        const result = [];
        for (const [dq, dr] of DIRS) {
            let [q, r] = from;
            while (this.tileAt(q + dq, r + dr)) {
                q += dq;
                r += dr;
                result.push([q, r]);
            }
        }
        return result;
    }

    // ===== 目標 =====

    canComplete(seat, cardId) {
        const player = this.players[seat];
        const card = CARDS[cardId];
        if (!card || !player.hand.includes(cardId)) return false;
        if (card.type === 'panda') return ['green', 'yellow', 'pink'].every(c => player.eaten[c] >= card.need[c]);
        if (card.type === 'gardener') return this.gardenerDone(card);
        return this.plotDone(card);
    }

    gardenerDone(card) {
        const matches = this.plots().filter(t => t.color === card.color && t.bamboo === card.height && (
            card.improvement === 'any' || (card.improvement === 'none' ? !t.improvement : t.improvement === card.improvement)));
        if (matches.length < card.count) return false;
        // 庭師が、その区画（複数本なら、そのどれか）にいること
        return matches.some(t => t.q === this.gardener[0] && t.r === this.gardener[1]);
    }

    plotDone(card) {
        const cells = SHAPES[card.shape];
        for (const t of this.plots()) {
            for (const form of rotations(cells)) {
                const ok = form.every(([dq, dr], i) => {
                    const q = t.q + dq - form[0][0];
                    const r = t.r + dr - form[0][1];
                    const tile = this.tileAt(q, r);
                    return tile && tile.color === card.colors[i] && this.isIrrigated(q, r);
                });
                if (ok) return true;
            }
        }
        return false;
    }

    // ===== 手番 =====

    get turn() {
        return this.turnState;
    }

    beginTurn() {
        this.turnState = { weather: null, pending: null, actions: [], max: 2, repeat: false, drawn: null };
        // 天気のダイスは2巡目から
        if (this.round >= 2) {
            const weather = WEATHERS[Math.floor(this.random() * WEATHERS.length)];
            this.applyWeather(weather);
        }
    }

    applyWeather(weather) {
        const turn = this.turnState;
        turn.weather = weather;
        turn.pending = null;
        if (weather === 'sun') turn.max = 3;
        if (weather === 'wind') turn.repeat = true;
        if (weather === 'choice') turn.pending = 'choice';
        if (weather === 'rain' && this.rainSpots().length) turn.pending = 'rain';
        if (weather === 'storm' && this.plots().length) turn.pending = 'storm';
        if (weather === 'clouds' && this.cloudOptions()) turn.pending = 'clouds';
    }

    rainSpots() {
        return this.plots().filter(t => t.bamboo < MAX_BAMBOO && this.isIrrigated(t.q, t.r)).map(t => [t.q, t.r]);
    }

    // 雲で置ける場所：改良のない区画
    improvableSpots() {
        return this.plots().filter(t => !t.improvement).map(t => [t.q, t.r]);
    }

    // 雲の目が使えるか（チップか、動かせる置いたチップがあり、置ける区画がある）
    cloudOptions() {
        if (this.improvableSpots().length === 0) return false;
        if (IMPROVEMENTS.some(i => this.tokens[i] > 0)) return true;
        return this.plots().some(t => t.improvement && !t.fixed);
    }

    // 行動が使えるか（同じ行動は風のときだけ2回）
    actionAvailable(action) {
        const turn = this.turnState;
        if (this.phase !== 'play' || turn.pending || turn.drawn) return false;
        if (turn.actions.length >= turn.max) return false;
        if (!turn.repeat && turn.actions.includes(action)) return false;
        if (turn.repeat && turn.actions.filter(a => a === action).length >= 2) return false;
        const player = this.players[this.current];
        if (action === 'plot') return this.plotDeck.length > 0;
        if (action === 'irrigation') return this.irrigationLeft > 0 && this.irrigationSpots().length > 0;
        if (action === 'gardener') return this.reachable(this.gardener).length > 0;
        if (action === 'panda') return this.reachable(this.panda).length > 0;
        if (action === 'objective') return player.hand.length < HAND_LIMIT && CARD_TYPES.some(t => this.decks[t].length > 0);
        return false;
    }

    availableActions() {
        return ACTIONS.filter(a => this.actionAvailable(a));
    }

    // 手番を終えられるか：天気の効果と区画を置き終え、行動を使い切った（または取れる行動がない）
    canEndTurn() {
        const turn = this.turnState;
        if (this.phase !== 'play' || turn.pending || turn.drawn) return false;
        return turn.actions.length >= turn.max || this.availableActions().length === 0;
    }

    applyCommand(seat, command) {
        this.lastError = null;
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (seat !== this.current) return this.fail('あなたの番ではありません');
        const turn = this.turnState;
        switch (command.type) {
            case 'complete': return this.complete(seat, command);
            case 'weather': return this.chooseWeather(seat, command);
            case 'rain': return this.rain(seat, command);
            case 'storm': return this.storm(seat, command);
            case 'improve': return this.improve(seat, command);
            case 'skip':
                if (!['rain', 'storm', 'clouds'].includes(turn.pending)) return this.fail('今は使わずに進めません');
                turn.pending = null;
                this.record(seat, command, `${this.players[seat].name}：天気の効果を使わなかった`, { type: 'skip', seat });
                return true;
            case 'drawPlots': return this.drawPlots(seat);
            case 'placePlot': return this.placePlot(seat, command);
            case 'irrigate': return this.irrigate(seat, command);
            case 'gardener': return this.moveGardener(seat, command);
            case 'panda': return this.movePanda(seat, command);
            case 'drawObjective': return this.drawObjective(seat, command);
            case 'endTurn': return this.endTurn(seat);
            default: return this.fail('今はその操作はできません');
        }
    }

    chooseWeather(seat, { weather }) {
        if (this.turnState.pending !== 'choice') return this.fail('今は天気を選べません');
        if (!WEATHERS.includes(weather) || weather === 'choice') return this.fail('天気が正しくありません');
        this.applyWeather(weather);
        this.turnState.chosen = true;
        this.record(seat, { type: 'weather', weather }, `${this.players[seat].name}：天気を選んだ`, { type: 'weather', seat, weather });
        return true;
    }

    rain(seat, { q, r }) {
        if (this.turnState.pending !== 'rain') return this.fail('今は雨を使えません');
        if (!this.rainSpots().some(([a, b]) => a === q && b === r)) return this.fail('そこには竹を足せません');
        this.grow(this.tileAt(q, r));
        this.turnState.pending = null;
        this.record(seat, { type: 'rain', q, r }, `${this.players[seat].name}：雨で竹が伸びた`, { type: 'rain', seat, at: [q, r] });
        return true;
    }

    storm(seat, { q, r }) {
        if (this.turnState.pending !== 'storm') return this.fail('今は嵐を使えません');
        if (!this.isPlot(q, r)) return this.fail('パンダは区画にしか動かせません');
        const eaten = this.eat(seat, q, r);
        this.turnState.pending = null;
        this.record(seat, { type: 'storm', q, r }, `${this.players[seat].name}：嵐でパンダが動いた`, { type: 'storm', seat, to: [q, r], eaten });
        return true;
    }

    improve(seat, { improvement, from, q, r }) {
        if (this.turnState.pending !== 'clouds') return this.fail('今は改良を置けません');
        const target = this.tileAt(q, r);
        if (!target || target.color === 'pond' || target.improvement) return this.fail('そこには改良を置けません');
        let kind = improvement;
        let source = null;
        if (from) {
            // チップが残っていないときだけ、置いたチップを動かせる
            if (IMPROVEMENTS.some(i => this.tokens[i] > 0)) return this.fail('チップが残っています');
            source = this.tileAt(...from);
            if (!source || !source.improvement || source.fixed) return this.fail('動かせる改良がありません');
            kind = source.improvement;
        } else if (!IMPROVEMENTS.includes(kind) || this.tokens[kind] <= 0) {
            return this.fail('そのチップは残っていません');
        }
        if (source) source.improvement = null;
        else this.tokens[kind]--;
        target.improvement = kind;
        this.updateIrrigation();
        this.turnState.pending = null;
        const command = from ? { type: 'improve', from, q, r } : { type: 'improve', improvement: kind, q, r };
        this.record(seat, command, `${this.players[seat].name}：改良を置いた`, { type: 'improve', seat, at: [q, r], improvement: kind });
        return true;
    }

    // 行動の前に、使えるかを確かめる
    checkAction(action) {
        if (this.turnState.pending) return '先に天気の効果を決めてください';
        if (this.turnState.drawn) return '先に区画を置いてください';
        if (!this.actionAvailable(action)) return 'その行動は今は取れません';
        return null;
    }

    drawPlots(seat) {
        const error = this.checkAction('plot');
        if (error) return this.fail(error);
        const drawn = this.plotDeck.splice(-3).reverse();
        this.turnState.drawn = drawn;
        this.turnState.actions.push('plot');
        this.record(seat, { type: 'drawPlots' }, `${this.players[seat].name}：区画を引いた`, { type: 'drawPlots', seat });
        return true;
    }

    placePlot(seat, { choice, q, r }) {
        const drawn = this.turnState.drawn;
        if (!drawn) return this.fail('先に区画を引いてください');
        if (!Number.isInteger(choice) || choice < 0 || choice >= drawn.length) return this.fail('区画が正しくありません');
        if (!this.plotSpots().some(([a, b]) => a === q && b === r)) return this.fail('そこには置けません');
        const plot = PLOTS[drawn[choice]];
        this.tiles[key(q, r)] = { q, r, color: plot.color, improvement: plot.improvement, fixed: !!plot.improvement, bamboo: 0, wet: false, plot: plot.id };
        // 残りは山の下へ
        this.plotDeck.unshift(...drawn.filter((_, i) => i !== choice));
        this.turnState.drawn = null;
        this.updateIrrigation();
        this.record(seat, { type: 'placePlot', choice, q, r }, `${this.players[seat].name}：区画を置いた`, { type: 'placePlot', seat, at: [q, r], plot: plot.id });
        return true;
    }

    irrigate(seat, { a, b }) {
        const error = this.checkAction('irrigation');
        if (error) return this.fail(error);
        if (!Array.isArray(a) || !Array.isArray(b)) return this.fail('置く場所が正しくありません');
        const k = edgeKey(a, b);
        if (!this.irrigationSpots().some(([x, y]) => edgeKey(x, y) === k)) return this.fail('そこには水路を置けません');
        this.channels[k] = true;
        this.irrigationLeft--;
        this.turnState.actions.push('irrigation');
        this.updateIrrigation();
        this.record(seat, { type: 'irrigate', a, b }, `${this.players[seat].name}：水路を引いた`, { type: 'irrigate', seat, edge: [a, b] });
        return true;
    }

    moveGardener(seat, { q, r }) {
        const error = this.checkAction('gardener');
        if (error) return this.fail(error);
        if (!this.reachable(this.gardener).some(([a, b]) => a === q && b === r)) return this.fail('そこへは動けません');
        this.gardener = [q, r];
        const grown = [];
        const here = this.tileAt(q, r);
        if (here.color !== 'pond') {
            for (const t of [here, ...neighbors(q, r).map(n => this.tileAt(...n)).filter(t => t && t.color === here.color)]) {
                if (this.grow(t)) grown.push([t.q, t.r]);
            }
        }
        this.turnState.actions.push('gardener');
        this.record(seat, { type: 'gardener', q, r }, `${this.players[seat].name}：庭師が竹を育てた`, { type: 'gardener', seat, to: [q, r], grown });
        return true;
    }

    movePanda(seat, { q, r }) {
        const error = this.checkAction('panda');
        if (error) return this.fail(error);
        if (!this.reachable(this.panda).some(([a, b]) => a === q && b === r)) return this.fail('そこへは動けません');
        const eaten = this.eat(seat, q, r);
        this.turnState.actions.push('panda');
        this.record(seat, { type: 'panda', q, r }, `${this.players[seat].name}：パンダが${eaten ? '竹を食べた' : '動いた'}`, { type: 'panda', seat, to: [q, r], eaten });
        return true;
    }

    drawObjective(seat, { kind }) {
        const error = this.checkAction('objective');
        if (error) return this.fail(error);
        if (!CARD_TYPES.includes(kind) || this.decks[kind].length === 0) return this.fail('その目標の山はありません');
        this.players[seat].hand.push(this.decks[kind].pop());
        this.turnState.actions.push('objective');
        this.record(seat, { type: 'drawObjective', kind }, `${this.players[seat].name}：目標を引いた`, { type: 'drawObjective', seat, kind });
        return true;
    }

    complete(seat, { card }) {
        if (!this.canComplete(seat, card)) return this.fail('その目標はまだ達成できません');
        const player = this.players[seat];
        const data = CARDS[card];
        if (data.type === 'panda') {
            for (const c of ['green', 'yellow', 'pink']) player.eaten[c] -= data.need[c];
        }
        player.hand = player.hand.filter(id => id !== card);
        player.done.push(card);
        // 決まった数の目標を達成した最初の人が皇帝のカードをもらい、ほかの人があと1回ずつ
        if (!this.finalRound && player.done.length >= OBJECTIVES_TO_END[this.players.length]) {
            player.emperor = true;
            this.finalRound = { trigger: seat, remaining: this.players.length - 1, started: false };
        }
        this.record(seat, { type: 'complete', card }, `${player.name}：目標を達成した（${data.points}点）`, { type: 'complete', seat, card });
        return true;
    }

    endTurn(seat) {
        if (!this.canEndTurn()) return this.fail('まだ行動が残っています');
        this.record(seat, { type: 'endTurn' }, null, { type: 'endTurn', seat });
        if (this.finalRound) {
            if (this.finalRound.started) this.finalRound.remaining--;
            this.finalRound.started = true;
            if (this.finalRound.remaining === 0) {
                this.finish();
                return true;
            }
        }
        this.current = (this.current + 1) % this.players.length;
        if (this.current === this.startSeat) this.round++;
        this.beginTurn();
        return true;
    }

    // ===== 竹 =====

    // 竹が伸びる（灌漑された区画だけ。肥料なら2つ、最大4）
    grow(tile) {
        if (!tile || tile.color === 'pond' || !this.isIrrigated(tile.q, tile.r) || tile.bamboo >= MAX_BAMBOO) return false;
        tile.bamboo = Math.min(MAX_BAMBOO, tile.bamboo + (tile.improvement === 'fertilizer' ? 2 : 1));
        return true;
    }

    // パンダが動いて食べる（囲いの区画では食べない）
    eat(seat, q, r) {
        this.panda = [q, r];
        const t = this.tileAt(q, r);
        if (!t || t.color === 'pond' || t.bamboo === 0 || t.improvement === 'enclosure') return null;
        t.bamboo--;
        this.players[seat].eaten[t.color]++;
        return t.color;
    }

    // 初めて灌漑された区画には、竹が1つ生える
    updateIrrigation() {
        for (const t of this.plots()) {
            if (!t.wet && this.isIrrigated(t.q, t.r)) {
                t.wet = true;
                if (t.bamboo < MAX_BAMBOO) t.bamboo++;
            }
        }
    }

    // ===== 終わり =====

    scoreOf(seat) {
        const p = this.players[seat];
        const points = p.done.reduce((sum, id) => sum + CARDS[id].points, 0) + (p.emperor ? EMPEROR_POINTS : 0);
        const panda = p.done.filter(id => CARDS[id].type === 'panda').reduce((sum, id) => sum + CARDS[id].points, 0);
        return { total: points, panda, count: p.done.length };
    }

    // 点数が高い順。同点ならパンダの目標の点が多い方、それも同じなら勝ちを分け合う
    finish() {
        this.phase = 'end';
        const standings = this.players.map(p => ({ seat: p.seat, ...this.scoreOf(p.seat), emperor: p.emperor }));
        const better = (a, b) => b.total - a.total || b.panda - a.panda;
        standings.sort(better);
        standings.forEach((s, i) => { s.rank = i > 0 && better(standings[i - 1], s) === 0 ? standings[i - 1].rank : i + 1; });
        this.result = { standings, winners: standings.filter(s => s.rank === 1).map(s => s.seat) };
        this.logs.push('ゲーム終了');
    }

    record(seat, command, log, move) {
        this.commands.push({ seat, command });
        if (log) this.logs.push(log);
        this.lastMove = move;
    }

    fail(message) {
        this.lastError = message;
        return false;
    }
}
