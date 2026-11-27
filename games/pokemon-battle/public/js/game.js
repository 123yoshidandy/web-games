/**
 * ポケモン 6対6 タクティクスのルール（DOM を使わない。操作は applyCommand だけ）
 *
 * 流れ
 * - setup：両方の席が手持ち6体（技2つと戦術ルール）を送る。そろったら、マップの両端に並べて対戦を始める
 * - battle：自軍フェイズと敵軍フェイズを交互に行う。フェイズでは、自分のポケモンが1体ずつ「動いて、技を使うか待機」する
 *   全員が行動するか「フェイズ終了」で相手のフェイズへ。先手のフェイズに戻るとターンが進む
 * - 相手のポケモンを全員たおせば勝ち。MAX_ROUNDS ターンで決着しなければ、残りHPの割合の合計で判定（同じなら引き分け）
 *
 * 操作（command）
 * - { type: 'team', team: [{ id, moves: [技, 技], rules: [{ cond, act }…] } ×6] }
 * - { type: 'act', unit, to: { x, y }, move: 0|1|null, target: 相手の番号|null }（move が null なら移動して待機）
 * - { type: 'auto', unit }：そのポケモンの戦術ルールのとおりに行動する（おまかせ）
 * - { type: 'end' }：残りのポケモンを待機させてフェイズを終える
 * 乱数（命中と乱数の幅）はシード付きなので、操作の記録から同じ対戦を再現できる
 */

import { createRandom } from './random.js';
import {
    SPECIES, MOVES, TEAM_SIZE, MOVE_SLOTS, MAX_RULES, MAX_ROUNDS, CONDITIONS, ACTIONS, MAPS, TYPES,
    statsOf, moveRangeOf, startCell, effectiveness
} from './data.js';
import { calcDamage, ROLL_MIN, ROLL_MAX } from './damage.js';
import { reachable, key, dist, unitsOf, planTactics, hpScore, alive } from './rules.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 2;

// 操作ごとに記録する項目（ほかの項目は捨てる）
export const COMMAND_FIELDS = {
    team: ['team'],
    act: ['unit', 'to', 'move', 'target'],
    auto: ['unit'],
    end: []
};

export const END_REASONS = {
    ko: '相手のポケモンを全員たおした',
    time: `${MAX_ROUNDS}ターンで決着がつかず、残りHPの割合で判定した`
};

// 手持ちの形を確かめて、記録する形にそろえる。おかしければ null
export function normalizeTeam(team) {
    if (!Array.isArray(team) || team.length !== TEAM_SIZE) return null;
    const ids = new Set();
    const out = [];
    for (const entry of team) {
        const sp = SPECIES[entry?.id];
        if (!sp || ids.has(entry.id)) return null;
        ids.add(entry.id);
        const moves = Array.isArray(entry.moves) ? entry.moves : [];
        if (moves.length !== MOVE_SLOTS || new Set(moves).size !== MOVE_SLOTS || !moves.every(m => sp.pool.includes(m))) return null;
        const rules = Array.isArray(entry.rules) ? entry.rules : [];
        if (rules.length > MAX_RULES || !rules.every(r => Object.hasOwn(CONDITIONS, r?.cond) && Object.hasOwn(ACTIONS, r?.act))) return null;
        out.push({ id: entry.id, moves: [...moves], rules: rules.map(r => ({ cond: r.cond, act: r.act })) });
    }
    return out;
}

function makeUnit(entry, seat, i) {
    const sp = SPECIES[entry.id];
    const stats = statsOf(entry.id);
    return {
        id: entry.id, name: sp.name, short: sp.short, types: [...sp.types], stats, hp: stats.hp, maxHp: stats.hp,
        mov: moveRangeOf(entry.id), moves: [...entry.moves], rules: entry.rules.map(r => ({ ...r })),
        ...startCell(seat, i), acted: false, fainted: false
    };
}

const isInt = (v) => Number.isInteger(v);

export default class Game {
    // players: [{ name, isCPU }]×2。options: { seed, first（先手の席。省くと乱数）, map（マップの番号。省くと乱数） }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('2人で遊びます');
        this.players = players.map((p, i) => ({ id: i, name: String(p.name ?? `P${i + 1}`), isCPU: !!p.isCPU }));
        this.options = { ...options, seed: (options.seed ?? 1) >>> 0 };
        this.random = createRandom(this.options.seed);
        const mapId = isInt(options.map) && MAPS[options.map] ? options.map : Math.floor(this.random() * MAPS.length);
        this.first = options.first === 0 || options.first === 1 ? options.first : (this.random() < 0.5 ? 0 : 1);
        this.map = { id: mapId, name: MAPS[mapId].name, blocks: MAPS[mapId].blocks.map(b => [...b]) };
        this.phase = 'setup';
        this.teams = [null, null];
        this.sides = null;
        this.current = this.first;
        this.round = 1;
        this.result = null;
        this.logs = [];
        this.logTotal = 0;
        this.events = [];
        this.commands = [];
        this.lastError = null;
    }

    static replay(players, options, commands = []) {
        const game = new Game(players, options);
        for (const { seat, command } of commands) {
            if (!game.applyCommand(seat, command)) throw new Error(`記録を再現できません：${game.lastError}`);
        }
        return game;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: { ...this.options },
            commands: this.commands.map(c => JSON.parse(JSON.stringify(c)))
        };
    }

    isOver() {
        return !!this.result;
    }

    // 今、操作を待っている席
    actors() {
        if (this.result) return [];
        if (this.phase === 'setup') return [0, 1].filter(s => !this.teams[s]);
        return [this.current];
    }

    log(text, seat = null) {
        this.logTotal++;
        this.logs.push({ n: this.logTotal, seat, text });
        if (this.logs.length > 200) this.logs.shift();
    }

    fail(message) {
        this.lastError = message;
        return false;
    }

    applyCommand(seat, raw) {
        this.lastError = null;
        if (!raw || typeof raw !== 'object' || !Object.hasOwn(COMMAND_FIELDS, raw.type)) return this.fail('知らない操作です');
        if (!this.actors().includes(seat)) return this.fail('今はあなたの番ではありません');
        const command = { type: raw.type };
        for (const f of COMMAND_FIELDS[raw.type]) if (raw[f] !== undefined) command[f] = raw[f];
        this.events = [];
        let ok;
        if (command.type === 'team') ok = this.doTeam(seat, command);
        else if (this.phase !== 'battle') ok = this.fail('まだ対戦が始まっていません');
        else if (command.type === 'act') ok = this.doAct(seat, command);
        else if (command.type === 'auto') ok = this.doAuto(seat, command);
        else ok = this.doEnd(seat);
        if (!ok) return false;
        this.commands.push({ seat, command: JSON.parse(JSON.stringify(command)) });
        return true;
    }

    doTeam(seat, command) {
        if (this.phase !== 'setup') return this.fail('編成はもう決まっています');
        const team = normalizeTeam(command.team);
        if (!team) return this.fail('手持ちは、ちがうポケモン6体と、それぞれの技2つにしてください');
        command.team = team;
        this.teams[seat] = team;
        this.log(`${this.players[seat].name} の編成が決まった`, seat);
        if (this.teams.every(Boolean)) this.startBattle();
        return true;
    }

    startBattle() {
        this.phase = 'battle';
        this.sides = this.teams.map((team, seat) => ({ units: team.map((entry, i) => makeUnit(entry, seat, i)) }));
        this.log(`マップ「${this.map.name}」で対戦開始。先手は ${this.players[this.first].name}`);
        this.log(`ターン 1：${this.players[this.current].name} のフェイズ`, this.current);
    }

    unitFor(seat, i) {
        const u = isInt(i) ? this.sides[seat].units[i] : null;
        if (!u || u.fainted) return null;
        return u;
    }

    doAct(seat, { unit, to, move, target }) {
        const u = this.unitFor(seat, unit);
        if (!u) return this.fail('そのポケモンは動かせません');
        if (u.acted) return this.fail('そのポケモンはもう行動しました');
        if (!to || !isInt(to.x) || !isInt(to.y) || !reachable(this, seat, unit).has(key(to))) return this.fail('そこへは動けません');
        const attacking = move !== null && move !== undefined;
        if (attacking) {
            if (!isInt(move) || !u.moves[move]) return this.fail('その技はありません');
            const t = this.unitFor(1 - seat, target);
            if (!t) return this.fail('その相手はいません');
            if (dist(to, t) > MOVES[u.moves[move]].range) return this.fail('技が届きません');
        } else if (target !== null && target !== undefined) {
            return this.fail('技を選んでください');
        }
        this.resolve(seat, unit, { x: to.x, y: to.y }, attacking ? move : null, attacking ? target : null);
        return true;
    }

    doAuto(seat, { unit }) {
        const u = this.unitFor(seat, unit);
        if (!u) return this.fail('そのポケモンは動かせません');
        if (u.acted) return this.fail('そのポケモンはもう行動しました');
        const plan = planTactics(this, seat, unit);
        this.resolve(seat, unit, plan.to, plan.move, plan.target, plan.rule);
        return true;
    }

    doEnd(seat) {
        this.sides[seat].units.forEach(u => { u.acted = true; });
        this.log(`${this.players[seat].name} はフェイズを終えた`, seat);
        this.endPhase();
        return true;
    }

    // 行動を行う：動いて、技を使う（move が null なら待機）
    resolve(seat, i, to, move, target, rule = undefined) {
        const u = this.sides[seat].units[i];
        const from = { x: u.x, y: u.y };
        u.x = to.x;
        u.y = to.y;
        u.acted = true;
        if (from.x !== to.x || from.y !== to.y) this.events.push({ type: 'move', seat, unit: i, from, to: { ...to } });
        const how = rule === undefined ? '' : rule === null ? '（おまかせ）' : `（ルール${rule + 1}）`;
        if (move === null) {
            this.log(`${u.name} は待機した${how}`, seat);
        } else {
            this.attack(seat, i, move, target, how);
        }
        this.checkEnd(seat);
        if (!this.result && this.sides[seat].units.every(f => f.acted || f.fainted)) this.endPhase();
    }

    attack(seat, i, m, target, how) {
        const u = this.sides[seat].units[i];
        const t = this.sides[1 - seat].units[target];
        const moveId = u.moves[m];
        const move = MOVES[moveId];
        const hit = this.random() * 100 < move.acc;
        const head = `${u.name} の ${move.name}${how}`;
        if (!hit) {
            this.events.push({ type: 'attack', seat, unit: i, target, move: moveId, hit: false, damage: 0, eff: 1 });
            this.log(`${head} → ${t.name} には当たらなかった`, seat);
            return;
        }
        const roll = ROLL_MIN + this.random() * (ROLL_MAX - ROLL_MIN);
        const { damage, eff } = calcDamage(u, t, moveId, roll);
        t.hp = Math.max(0, t.hp - damage);
        const fainted = t.hp === 0;
        if (fainted) t.fainted = true;
        this.events.push({ type: 'attack', seat, unit: i, target, move: moveId, hit: true, damage, eff, fainted });
        const effText = eff === 0 ? '（こうかが ないようだ）' : eff > 1 ? '（こうかは ばつぐんだ）' : eff < 1 ? '（こうかは いまひとつ）' : '';
        this.log(`${head} → ${t.name} に ${damage}${effText}${fainted ? `。${t.name} は たおれた` : ''}`, seat);
    }

    checkEnd(seat) {
        if (unitsOf(this, 1 - seat).every(f => f.fainted)) {
            this.finish(seat, 'ko');
        }
    }

    endPhase() {
        const next = 1 - this.current;
        if (next === this.first) {
            if (this.round >= MAX_ROUNDS) {
                const a = hpScore(this, 0);
                const b = hpScore(this, 1);
                this.finish(Math.abs(a - b) < 1e-9 ? null : a > b ? 0 : 1, 'time');
                return;
            }
            this.round++;
        }
        this.current = next;
        this.sides[next].units.forEach(f => { f.acted = false; });
        this.log(`ターン ${this.round}：${this.players[next].name} のフェイズ`, next);
    }

    finish(winner, reason) {
        this.phase = 'over';
        this.result = { winner, reason, scores: [hpScore(this, 0), hpScore(this, 1)].map(v => Math.round(v * 1000) / 1000), left: [0, 1].map(s => unitsOf(this, s).filter(alive).length) };
        this.log(winner === null ? '引き分け' : `${this.players[winner].name} の勝ち（${END_REASONS[reason]}）`);
    }
}

export { TYPES, effectiveness };
