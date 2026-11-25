/**
 * サントリーニの進行（2人か3人）
 * ルールの中身は rules.js。ここでは、席と最初の手番・神の割り当て、操作の受け付けと記録、出来事の記録を受け持つ
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（最初の手番と「おまかせ」の神はシードから決まる）
 */

import { createRandom } from './random.js';
import { createState, legalSteps, applyStep, stepKey, GODS, ownerAt } from './rules.js';

export { GODS };
export const PLAYER_COUNTS = [2, 3];
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = { place: ['to'], move: ['from', 'to'], build: ['by', 'at', 'dome'], end: [] };
const MAX_EVENTS = 60;

export const GOD_NAMES = {
    apollo: 'アポロン', artemis: 'アルテミス', athena: 'アテナ', atlas: 'アトラス', demeter: 'デメテル',
    hephaestus: 'ヘファイストス', hermes: 'ヘルメス', minotaur: 'ミノタウロス', pan: 'パン', prometheus: 'プロメテウス'
};
// 神の力（画面と遊び方で使う）
export const GOD_POWERS = {
    apollo: '動くとき、相手の職人のいるマスへ動ける。相手の職人は、自分が今いたマスへ移る',
    artemis: '動くとき、もう1回動ける（元のマスへは戻れない）',
    athena: '自分の職人が上った次の相手の番には、相手は上れない',
    atlas: '建てるとき、どの段にもドームを建てられる',
    demeter: '建てるとき、もう1回建てられる（同じマスには建てられない）',
    hephaestus: '建てるとき、同じマスにもう1段ブロックを建てられる（ドームは不可）',
    hermes: '職人が上りも下りもしないなら、2人とも何マスでも動け（動かなくてもよい）、そのあとどちらかが建てる',
    minotaur: '動くとき、相手の職人のいるマスへ動ける。相手の職人は、まっすぐ後ろの空いたマスへ押し出す（段は問わない）',
    pan: '職人が2段以上下りても勝ち',
    prometheus: '上らないなら、動く前にも建てられる（動く前と後に建てる）'
};

export default class Game {
    // players: [{ name, isCPU }]（2人か3人）、options: { seed, gods: 席ごとに神の名前・'random'・null }
    constructor(players, options = {}) {
        if (!PLAYER_COUNTS.includes(players.length)) throw new Error('2人か3人で遊びます');
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        const godOptions = players.length === 2 && Array.isArray(options.gods) && options.gods.some(Boolean)
            ? players.map((_, i) => options.gods[i] ?? null)
            : null;
        this.options = { seed, gods: godOptions };
        const random = createRandom(seed);
        this.first = Math.floor(random() * players.length);
        this.gods = godOptions ? resolveGods(godOptions, random) : Array(players.length).fill(null);
        this.players = players.map((p, id) => ({ id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU }));
        this.state = createState({ players: players.length, first: this.first, gods: this.gods });
        this.commands = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        this.cachedSteps = null;
    }

    get current() {
        return this.state.result ? null : this.state.current;
    }

    isOver() {
        return !!this.state.result;
    }

    get winner() {
        return this.state.result ? this.state.result.winner : null;
    }

    actors() {
        return this.isOver() ? [] : [this.current];
    }

    legalSteps() {
        this.cachedSteps ??= legalSteps(this.state);
        return this.cachedSteps;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false（状態は変えない）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.isOver()) return this.fail('ゲームは終わっています');
        if (playerId !== this.current) return this.fail('あなたの手番ではありません');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => { if (command[k] !== undefined && command[k] !== null && command[k] !== false) recorded[k] = command[k]; });
        const key = stepKey(recorded);
        const step = this.legalSteps().find(a => stepKey(a) === key);
        if (!step) return this.fail(this.reasonFor(recorded));
        const before = this.state;
        this.state = applyStep(before, step);
        this.cachedSteps = null;
        this.commands.push({ playerId, command: recorded });
        this.recordEvents(playerId, step, before);
        return true;
    }

    recordEvents(seat, step, before) {
        const after = this.state;
        if (step.type === 'place') this.emit({ type: 'place', seat, to: step.to });
        else if (step.type === 'move') {
            const pushed = ownerAt(before, step.to);
            const event = { type: 'move', seat, from: step.from, to: step.to };
            if (pushed >= 0 && pushed !== seat) {
                // 押し出された（入れ替わった）相手の職人
                const moved = after.workers[pushed].find(c => !before.workers[pushed].includes(c));
                event.forced = { seat: pushed, from: step.to, to: moved ?? step.from };
            }
            this.emit(event);
        } else if (step.type === 'build') {
            this.emit({ type: 'build', seat, at: step.at, dome: after.dome[step.at] && !before.dome[step.at], height: after.height[step.at] });
        }
        after.alive.forEach((a, p) => { if (!a && before.alive[p] && !after.result) this.emit({ type: 'out', seat: p }); });
        if (after.result) this.emit({ type: 'end', winner: after.result.winner, reason: after.result.reason });
    }

    reasonFor(command) {
        const s = this.state;
        if (command.type === 'place') return 'そこには置けません';
        if (command.type === 'end') return 'まだ番を終えられません';
        if (command.type === 'move') {
            if (s.turn.builds > 0) return 'もう建てたあとです';
            if (s.dome[command.to]) return 'ドームのマスへは動けません';
            if (s.height[command.to] - s.height[command.from] > 1) return '上れるのは1段までです';
            return 'そこへは動けません';
        }
        if (s.turn.moves === 0 && !s.turn.prebuilt && !['prometheus', 'hermes'].includes(s.gods[s.current])) return '先に職人を動かします';
        return 'そこには建てられません';
    }

    // ---- 道具 ----

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
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
        commands.forEach(({ playerId, command }, index) => {
            if (!game.applyCommand(playerId, command)) {
                throw new Error(`操作 ${index} を再現できませんでした: ${game.lastError}`);
            }
        });
        return game;
    }
}

// 'random' の席には、ほかの席と重ならない神をシードから選ぶ
function resolveGods(choices, random) {
    const taken = new Set(choices.filter(g => GODS.includes(g)));
    return choices.map(g => {
        if (GODS.includes(g)) return g;
        if (g !== 'random') return null;
        const pool = GODS.filter(x => !taken.has(x));
        const pick = pool[Math.floor(random() * pool.length)];
        taken.add(pick);
        return pick;
    });
}
