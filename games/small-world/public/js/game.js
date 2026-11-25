/**
 * スモールワールド（基本セット、2〜5人）の進行
 * DOM に依存しないので、ブラウザ・テスト・オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（種族と特殊能力の山・サイコロはシードから決まる）
 *
 * 準備：人数に合わせた地図。種族14と特殊能力20をそれぞれ混ぜ、上から組にして6組を並べる。1人5金
 * 手番：
 *   1. 衰退していないグールがいれば、先にグールで征服と再配置をする
 *   2. 種族がなければ、並びから組を選ぶ（上から i 番目なら、上の i 組に1金ずつ置く。選んだ組の上の金はもらう）
 *      種族があれば、部隊を各領域に1体ずつ残して手に戻し、征服する。または、征服の代わりに衰退する
 *   3. 征服：2＋部隊＋山・巣・砦・野営地の数だけ置く。足りなければ、最後に1回だけサイコロ（0,0,0,1,2,3）に賭けられる
 *   4. 再配置：手の部隊を自分の領域に置き直す
 *   5. 自分の種族がいる領域1つにつき1金と、種族・特殊能力のコインをもらう
 * 終わり：決まったラウンド（2・3人 10、4人 9、5人 8）が終わったとき、コインが一番多い人の勝ち
 *
 * 原作どおりにしなかった点（README にも書く）
 * - 攻められた人の手に戻った部隊は、攻めた人の番の終わりに、自動で自分の領域に置き直す（守りの薄いところから）
 * - 再配置の初めに、手の部隊・英雄・野営地・砦を自動で置き、そこから動かせるようにする
 * - コインは伏せず、全員に見せる
 */

import { createRandom, shuffle } from './random.js';
import {
    RACES, POWERS, RACE_IDS, POWER_IDS, ROUNDS, START_COINS, ROW_SIZE, DIE_FACES, AMAZON_BONUS,
    MAX_HEROES, MAX_CAMPS, MAX_HOLES, comboName
} from './data.js';
import { getMap } from './map.js';
import {
    regionsOf, powerOf, isActive, trayOf, conquestTargets, dragonTargets, sorceryTargets, canAbandon, canDecline,
    canRoll, redeployChecks, canFinishRedeploy, peaceOptions, canStoutDecline, turnIncome, threatOf
} from './rules.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const MAX_LOGS = 500;
const MAX_EVENTS = 60;

export const COMMAND_FIELDS = {
    pick: ['index'],
    conquer: ['region'],
    dragon: ['region'],
    sorcery: ['region'],
    abandon: ['region'],
    roll: [],
    decline: [],
    redeploy: [],
    place: ['region'],
    lift: ['region'],
    hero: ['region'],
    camp: ['region'],
    uncamp: ['region'],
    fort: ['region'],
    done: ['decline', 'peace']
};

const emptyRegion = () => ({ race: null, count: 0, lair: false, fort: false, camps: 0, hero: false, hole: false, dragon: false });

export default class Game {
    // players: [{ name, isCPU, cpuLevel }]、options: { seed }
    constructor(players, options = {}) {
        const n = players.length;
        if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('人数は2〜5人です');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.random = createRandom(seed);
        this.options = { seed };
        this.map = getMap(n);
        this.regions = this.map.regions.map(info => (info.lost ? { ...emptyRegion(), race: 'lost', count: 1 } : emptyRegion()));
        this.raceDeck = shuffle([...RACE_IDS], this.random);
        this.powerDeck = shuffle([...POWER_IDS], this.random);
        this.row = [];
        this.refillRow();
        this.bands = {};
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, cpuLevel: p.cpuLevel ?? null,
            coins: START_COINS, active: null, declined: [], peace: null, lastConquered: [], lastIncome: null
        }));
        this.start = Math.floor(this.random() * n);
        this.current = this.start;
        this.round = 1;
        this.rounds = ROUNDS[n];
        this.phase = 'play';       // play：遊んでいる / end：終わり
        this.stage = 'pick';       // pick：組を選ぶ / conquer：征服 / redeploy：再配置 / end
        this.acting = null;        // いま動かしている種族
        this.step = null;          // いま動かしている種族のこの番の記録
        this.turnInfo = null;      // この番の記録（だれかのいた領域を征服した数、攻めた相手）
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.log(`${this.players[this.start].name}から始めます（${this.rounds}ラウンド）`);
        this.beginTurn();
    }

    static replay(players, options, commands) {
        const game = new Game(players, options);
        commands.forEach(({ playerId, command }, i) => {
            if (!game.applyCommand(playerId, command)) throw new Error(`記録の${i + 1}手目を再現できません：${game.lastError}`);
        });
        return game;
    }

    persist() {
        return {
            players: this.players.map(p => ({ name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
            options: structuredClone(this.options),
            commands: structuredClone(this.commands)
        };
    }

    isOver() {
        return this.phase === 'end';
    }

    actors() {
        return this.phase === 'play' ? [this.current] : [];
    }

    // ---- 操作 ----

    applyCommand(playerId, command) {
        this.lastError = null;
        const error = this.check(playerId, command);
        if (error) {
            this.lastError = error;
            return false;
        }
        this.events = [];
        const clean = Object.fromEntries(COMMAND_FIELDS[command.type].filter(k => command[k] !== undefined && command[k] !== null).map(k => [k, command[k]]));
        this.commands.push({ playerId, command: { type: command.type, ...clean } });
        this.execute(command);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
        return true;
    }

    // 状態を変えずに、操作が通るかを確かめる。通らなければ理由を返す
    check(seat, command) {
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return '知らない操作です';
        if (this.phase !== 'play') return 'ゲームは終わっています';
        if (seat !== this.current) return '手番ではありません';
        const player = this.players[seat];
        const { type, region } = command;
        if (COMMAND_FIELDS[type].includes('region') && !(Number.isInteger(region) && region >= 0 && region < this.regions.length)) return '領域を選んでください';
        switch (type) {
            case 'pick':
                if (this.stage !== 'pick') return '今は組を選べません';
                if (!Number.isInteger(command.index) || command.index < 0 || command.index >= this.row.length) return 'その組はありません';
                if (command.index > player.coins) return 'コインが足りません';
                return null;
            case 'conquer':
                return conquestTargets(this).some(t => t.id === region) ? null : 'そこは征服できません';
            case 'dragon':
                return dragonTargets(this).includes(region) ? null : '竜はそこへ行けません';
            case 'sorcery':
                return sorceryTargets(this).includes(region) ? null : '魔術はそこに使えません';
            case 'abandon':
                return canAbandon(this, region) ? null : 'その領域は放棄できません';
            case 'roll':
                return canRoll(this) ? null : '今はサイコロを振れません';
            case 'decline':
                return canDecline(this) ? null : '今は衰退できません';
            case 'redeploy':
                return this.stage === 'conquer' && this.acting ? null : '今は再配置に移れません';
            case 'place': case 'lift': case 'hero': case 'camp': case 'uncamp': case 'fort': {
                const checks = redeployChecks(this, region);
                if (!checks) return '自分の領域を選んでください';
                return checks[type] ? null : 'それはできません';
            }
            case 'done': {
                if (this.stage !== 'redeploy') return '今は番を終えられません';
                if (!canFinishRedeploy(this)) return '手の部隊をすべて置いてください';
                if (command.decline !== undefined && typeof command.decline !== 'boolean') return '知らない指定です';
                if (command.decline && !canStoutDecline(this)) return '今は衰退できません';
                if (command.peace !== undefined && command.peace !== null && !peaceOptions(this).includes(command.peace)) return 'その人とは和平を結べません';
                return null;
            }
            default:
                return '知らない操作です';
        }
    }

    execute(command) {
        const player = this.players[this.current];
        const { region } = command;
        switch (command.type) {
            case 'pick':
                this.pick(player, command.index);
                break;
            case 'conquer':
                this.conquer(region);
                break;
            case 'dragon': {
                this.ready();
                this.regions.forEach(r => { if (r.race === this.acting) r.dragon = false; });
                this.take(region, 1, '竜で');
                this.regions[region].dragon = true;
                this.step.dragonUsed = true;
                break;
            }
            case 'sorcery': {
                this.ready();
                const seat = this.bands[this.regions[region].race].seat;
                this.take(region, 0, '魔術で', true);
                this.step.sorcered.push(seat);
                break;
            }
            case 'abandon': {
                this.ready();
                const r = this.regions[region];
                this.bands[this.acting].hand += r.count;
                this.regions[region] = emptyRegion();
                this.emit({ type: 'abandon', seat: this.current, region });
                this.log(`${player.name}が領域を放棄した`);
                break;
            }
            case 'roll': {
                this.ready();
                const value = this.rollDie();
                this.step.roll = value;
                this.emit({ type: 'dice', seat: this.current, value, berserk: true });
                this.log(`${player.name}の狂戦士のサイコロは ${value}`);
                break;
            }
            case 'decline':
                this.decline(player, player.active);
                this.finishTurn({});
                break;
            case 'redeploy':
                this.ready();
                this.enterRedeploy();
                break;
            case 'place':
                this.regions[region].count++;
                this.bands[this.acting].hand--;
                break;
            case 'lift':
                this.regions[region].count--;
                this.bands[this.acting].hand++;
                break;
            case 'hero':
                this.regions[region].hero = !this.regions[region].hero;
                break;
            case 'camp':
                this.regions[region].camps++;
                break;
            case 'uncamp':
                this.regions[region].camps--;
                break;
            case 'fort': {
                const prev = this.step.fortRegion;
                if (prev !== null) this.regions[prev].fort = false;
                if (prev === region) {
                    this.step.fortRegion = null;
                } else {
                    this.regions[region].fort = true;
                    this.step.fortRegion = region;
                }
                break;
            }
            case 'done':
                if (this.step.ghoul) this.startMain();
                else this.finishTurn({ decline: !!command.decline, peace: command.peace ?? null });
                break;
        }
    }

    // ---- 組を選ぶ ----

    refillRow() {
        while (this.row.length < ROW_SIZE && this.raceDeck.length > 0 && this.powerDeck.length > 0) {
            this.row.push({ race: this.raceDeck.shift(), power: this.powerDeck.shift(), coins: 0 });
        }
    }

    pick(player, index) {
        player.coins -= index;
        for (let i = 0; i < index; i++) this.row[i].coins++;
        const [combo] = this.row.splice(index, 1);
        player.coins += combo.coins;
        this.refillRow();
        this.bands[combo.race] = {
            race: combo.race, power: combo.power, seat: player.id, declined: false,
            hand: RACES[combo.race].tokens + POWERS[combo.power].tokens, holes: 0, wealthyPaid: false, amazonBonus: 0
        };
        player.active = combo.race;
        this.emit({ type: 'pick', seat: player.id, race: combo.race, power: combo.power, index, coins: combo.coins });
        this.log(`${player.name}が${comboName(combo.race, combo.power)}を選んだ${combo.coins ? `（${combo.coins}金を得た）` : ''}`);
        this.startStep(combo.race);
    }

    // ---- 征服 ----

    beginTurn() {
        const player = this.players[this.current];
        player.peace = null;
        player.lastConquered = [];
        this.turnInfo = { nonEmpty: 0, attacked: [] };
        this.emit({ type: 'turn', seat: this.current });
        const ghouls = player.declined.find(race => race === 'ghouls');
        if (ghouls && (regionsOf(this, ghouls).length > 0 || this.bands[ghouls].hand > 0)) this.startStep(ghouls);
        else this.startMain();
    }

    startMain() {
        const player = this.players[this.current];
        if (!player.active) {
            this.stage = 'pick';
            this.acting = null;
            this.step = null;
            return;
        }
        this.startStep(player.active);
    }

    startStep(race) {
        this.stage = 'conquer';
        this.acting = race;
        this.step = {
            ready: false, ghoul: this.bands[race].declined, conquered: [], nonEmpty: 0, roll: null,
            dragonUsed: false, sorcered: [], fortRegion: null, final: false
        };
    }

    // 部隊を各領域に1体ずつ残して手に戻す（最初の操作のときに行う。衰退するなら戻さない）
    ready() {
        if (this.step.ready) return;
        this.step.ready = true;
        const band = this.bands[this.acting];
        this.regions.forEach(r => {
            if (r.race !== this.acting || r.count < 2) return;
            band.hand += r.count - 1;
            r.count = 1;
        });
        if (this.acting === 'amazons' && !band.declined) {
            band.amazonBonus = Math.min(AMAZON_BONUS, trayOf(this, 'amazons'));
            band.hand += band.amazonBonus;
        }
    }

    rollDie() {
        return DIE_FACES[Math.floor(this.random() * DIE_FACES.length)];
    }

    conquer(region) {
        const target = conquestTargets(this).find(t => t.id === region);
        this.ready();
        const player = this.players[this.current];
        if (!target.final) {
            this.take(region, target.need, '');
            this.step.roll = null;
            return;
        }
        // 最後の征服：サイコロの目を足して届けば、手の部隊を全部置く
        const band = this.bands[this.acting];
        const value = this.rollDie();
        const success = band.hand + value >= target.cost;
        this.step.final = true;
        this.emit({ type: 'dice', seat: this.current, value, success, region });
        this.log(`${player.name}が援軍のサイコロを振って ${value}。${success ? '征服した' : '届かなかった'}`);
        if (success) this.take(region, band.hand, 'サイコロで');
        this.enterRedeploy();
    }

    // 領域を征服する。fromTray なら箱から1体（魔術師）
    take(region, tokens, how, fromTray = false) {
        const r = this.regions[region];
        const band = this.bands[this.acting];
        const player = this.players[this.current];
        const prev = r.race;
        const nonEmpty = r.count > 0;
        if (prev) this.lose(region, fromTray);
        Object.assign(r, emptyRegion(), { race: this.acting, count: fromTray ? 1 : tokens });
        if (!fromTray) band.hand -= tokens;
        if (this.acting === 'trolls') r.lair = true;
        if (this.acting === 'halflings' && !band.declined && band.holes < MAX_HOLES) {
            r.hole = true;
            band.holes++;
        }
        this.step.conquered.push(region);
        if (nonEmpty) {
            this.step.nonEmpty++;
            if (!this.step.ghoul) this.turnInfo.nonEmpty++;
        }
        player.lastConquered.push(region);
        this.emit({ type: 'conquer', seat: this.current, region, race: this.acting, from: prev });
        const terrain = this.map.regions[region].terrain;
        const target = prev === 'lost' ? '失われた部族の' : prev ? `${this.players[this.bands[prev].seat].name}の` : '';
        this.log(`${player.name}が${how}${target}${({ farm: '農地', forest: '森', hill: '丘', mountain: '山', swamp: '沼', sea: '海', lake: '湖' })[terrain]}を征服した`);
    }

    // 征服された側：部隊を1体失い、残りは手に戻る（エルフは失わない。魔術では1体を失う）
    lose(region, sorcery) {
        const r = this.regions[region];
        if (r.race === 'lost') return;
        const band = this.bands[r.race];
        const loss = sorcery ? r.count : (r.race === 'elves' && !band.declined ? 0 : 1);
        band.hand += Math.max(0, r.count - loss);
        if (!band.declined && band.seat !== this.current && !this.turnInfo.attacked.includes(band.seat)) this.turnInfo.attacked.push(band.seat);
    }

    // 衰退：前の衰退した種族を消し（霊の種族は残す）、各領域に1体だけ残す（グールは全部残す）
    decline(player, race) {
        const band = this.bands[race];
        if (band.power !== 'spirit') {
            [...player.declined].filter(d => this.bands[d].power !== 'spirit').forEach(d => this.removeBand(d));
        }
        band.declined = true;
        band.hand = 0;
        player.active = null;
        player.declined.push(race);
        this.regions.forEach(r => {
            if (r.race !== race) return;
            if (race !== 'ghouls') r.count = 1;
            Object.assign(r, { hero: false, hole: false, camps: 0, dragon: false });
        });
        this.emit({ type: 'decline', seat: player.id, race });
        this.log(`${player.name}の${comboName(race, band.power)}が衰退した`);
    }

    removeBand(race) {
        const band = this.bands[race];
        this.regions.forEach((r, id) => {
            if (r.race === race) this.regions[id] = emptyRegion();
        });
        const player = this.players[band.seat];
        player.declined = player.declined.filter(d => d !== race);
        this.raceDeck.push(race);
        this.powerDeck.push(band.power);
        delete this.bands[race];
        this.refillRow();
    }

    // ---- 再配置 ----

    enterRedeploy() {
        this.stage = 'redeploy';
        const race = this.acting;
        const band = this.bands[race];
        const mine = () => regionsOf(this, race);
        if (race === 'amazons' && !band.declined && band.amazonBonus > 0) {
            // 征服のためだけの4体を戻す（手から、足りなければ領域から）
            let left = band.amazonBonus;
            const fromHand = Math.min(left, band.hand);
            band.hand -= fromHand;
            left -= fromHand;
            while (left > 0) {
                const most = mine().filter(id => this.regions[id].count > 1).sort((a, b) => this.regions[b].count - this.regions[a].count || a - b)[0];
                if (most === undefined) break;
                this.regions[most].count--;
                left--;
            }
            band.amazonBonus = 0;
        }
        if (race === 'skeletons' && !band.declined) {
            const gain = Math.min(Math.floor(this.step.nonEmpty / 2), trayOf(this, race));
            if (gain > 0) {
                band.hand += gain;
                this.log(`${this.players[this.current].name}のガイコツが${gain}体増えた`);
            }
        }
        this.autoDeploy(race);
        const power = powerOf(this, race);
        const byThreat = () => mine().map(id => ({ id, t: threatOf(this, race, id) - (this.regions[id].hero ? 0 : 0) }))
            .sort((a, b) => b.t - a.t || a.id - b.id).map(x => x.id);
        if (power === 'heroic') {
            mine().forEach(id => { this.regions[id].hero = false; });
            byThreat().slice(0, MAX_HEROES).forEach(id => { this.regions[id].hero = true; });
        }
        if (power === 'bivouacking') {
            mine().forEach(id => { this.regions[id].camps = 0; });
            const order = byThreat();
            for (let i = 0; i < MAX_CAMPS && order.length; i++) this.regions[order[i % Math.min(order.length, 3)]].camps++;
        }
        if (power === 'fortified') {
            const spot = byThreat().find(id => !this.regions[id].fort);
            const checks = spot !== undefined ? redeployChecks(this, spot) : null;
            if (checks?.fort) {
                this.regions[spot].fort = true;
                this.step.fortRegion = spot;
            }
        }
    }

    // 手の部隊を、守りの薄い領域から順に置く（同じ規則で動くので、記録の再現はずれない）
    autoDeploy(race) {
        const band = this.bands[race];
        const mine = regionsOf(this, race);
        if (mine.length === 0 || band.hand <= 0) return;
        const threat = Object.fromEntries(mine.map(id => [id, threatOf(this, race, id)]));
        while (band.hand > 0) {
            let best = mine[0];
            let bestScore = -Infinity;
            for (const id of mine) {
                const score = (threat[id] + 0.5) / this.regions[id].count;
                if (score > bestScore) {
                    best = id;
                    bestScore = score;
                }
            }
            this.regions[best].count++;
            band.hand--;
        }
    }

    // ---- 手番の終わり ----

    finishTurn({ decline = false, peace = null }) {
        const player = this.players[this.current];
        if (peace !== null) {
            player.peace = peace;
            this.log(`${player.name}が${this.players[peace].name}と和平を結んだ`);
        }
        const income = turnIncome(this, this.current);
        player.coins += income.total;
        player.lastIncome = income;
        if (player.active) this.bands[player.active].wealthyPaid = true;
        this.emit({ type: 'income', seat: this.current, coins: income.total, parts: income.parts });
        this.log(`${player.name}が${income.total}金を得た`);
        if (decline) this.decline(player, player.active);
        // 攻められて手に戻った部隊を、自分の領域に置き直す。領域がなく、衰退した種族の部隊は消える
        Object.values(this.bands).forEach(band => {
            if (band.hand <= 0) return;
            if (regionsOf(this, band.race).length > 0) this.autoDeploy(band.race);
            else if (band.declined) band.hand = 0;
        });
        const n = this.players.length;
        this.current = (this.current + 1) % n;
        if (this.current === this.start) {
            if (this.round >= this.rounds) {
                this.finish();
                return;
            }
            this.round++;
            this.log(`ラウンド${this.round}`);
        }
        this.beginTurn();
    }

    // 部隊の数（同点のときに比べる）
    tokensOf(seat) {
        const p = this.players[seat];
        const races = [p.active, ...p.declined].filter(Boolean);
        return this.regions.reduce((s, r) => s + (races.includes(r.race) ? r.count : 0), 0);
    }

    finish() {
        this.phase = 'end';
        this.stage = 'end';
        this.acting = null;
        const best = Math.max(...this.players.map(p => p.coins));
        const top = this.players.filter(p => p.coins === best);
        const most = Math.max(...top.map(p => this.tokensOf(p.id)));
        this.winners = top.filter(p => this.tokensOf(p.id) === most).map(p => p.id);
        this.log(`終わり。${this.winners.map(i => this.players[i].name).join('・')}の勝ち（${best}金）`);
        this.emit({ type: 'end' });
    }

    emit(event) {
        this.events.push({ ...event, seq: ++this.eventSeq });
    }

    log(text) {
        this.logs.push(text);
    }
}

export { isActive };
