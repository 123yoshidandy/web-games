/**
 * バン！ダイスゲーム（基本ゲーム）の進行（3〜8人）
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる（役割・キャラクター・ダイスはシードから決まる）
 *
 * ルール
 * - 役割を人数ごとに配る。保安官だけ公開し、保安官から始める（3人は副保安官・無法者・裏切り者を全員に公開し、副保安官から）
 * - キャラクターを1人ずつ配る。体力の上限はキャラクターの体力（保安官は +2）
 * 公式のルールブックの新しい版（dV Giochi の「BANG! Dice Game_Rules_ENG.pdf」）に合わせる
 * - 手番：シド・ケッチャムならはじめにだれかを1回復 → ダイス5つを振る → 好きなダイスを最大2回振り直す（ラッキー・デュークは3回）
 *   - 矢：出た時点で山から1本取る。山が尽きたらインディアンの襲撃（全員が持っている矢の数だけ体力を失い、矢を山に戻す）
 *   - ダイナマイト：振り直せない。3つ以上で体力を1失い、もう振り直せない（残りのダイスは使う。ダイナマイトで脱落したら使わない）
 * - 振り終えたら、1・2（撃つ）→ ビール（回復）→ ガトリングの順に使う。1と2とビールは必ず使う
 *   - 1と2は、相手を全部決めてから同時に撃つ（残りの体力より多く割り当ててもよい）
 *   - 1：距離1の人を撃つ（1点）。2：距離2の人を撃つ。距離は左右の近いほう
 *     前の手番までに脱落した人は飛ばす（この手番の中で倒れた人は数える。その人を撃つと無駄になる）
 *     残りが3人以下（距離2にだれもいない）ときは、2も距離1の人を撃つ
 *   - ビール：だれか（自分も可）が1回復。上限を超えない
 *   - ガトリング3つ以上：ほかの全員が1点を失い、自分の矢をすべて山に戻す（4つ以上でも1回）
 * - 体力が0になったら脱落し、役割を公開する。持っていた矢は山に戻す
 * - 勝ち：保安官が倒れたら無法者の勝ち（裏切り者が1人だけ残ったときだけ裏切り者の勝ち。全員が同時に倒れたら無法者）
 *        無法者と裏切り者が全員倒れたら、保安官と副保安官の勝ち（脱落していても、チームが勝てば勝ち）
 *        3人：副保安官は裏切り者を、裏切り者は無法者を、無法者は副保安官を、自分の手で倒せば勝ち
 *             的をほかの人に倒されたら、残った2人の倒し合い（ルールブックの例による）
 *
 * 資料で分からない点や、自分で決めた点
 * - ペドロ・ラミレスは、失った1点ごとに1本まで矢を捨ててよい（襲撃では矢がすべて山に戻るので聞かない）
 * - バート・キャシディは、山の最後の1本を取るためには能力を使えない
 * - 手番の人が襲撃で倒れたときも、ダイナマイトと同じく、残りのダイスは使わずに手番を終える
 * - 3人で、残った2人の一方が襲撃・ダイナマイトで倒れたときも、残った1人の勝ちとする
 */

import { createRandom, shuffle } from './random.js';
import {
    CHARACTERS, CHARACTER_BY_ID, ROLE_NAMES, ROLES_BY_PLAYERS, FACES, FACE_NAMES,
    DICE_COUNT, ARROWS, ROLLS, SHERIFF_BONUS, VULTURE_HEAL
} from './characters.js';

export { CHARACTERS, CHARACTER_BY_ID, ROLE_NAMES, FACE_NAMES };
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    sid: ['target'],
    roll: ['dice'],             // 振り直すダイスの番号（最初の1回は全部）
    stop: [],                   // 振るのを終える
    shoot: ['die', 'target', 'double'],
    beer: ['die', 'target'],
    kit: ['die', 'target'],     // target が null なら使わない
    bart: ['arrows'],           // 体力を失う代わりに取る矢の数
    pedro: ['arrows']           // 体力を失ったときに捨てる矢の数
};
const MAX_LOGS = 400;
const MAX_EVENTS = 300;

const isInt = (value) => Number.isInteger(value);
const SHOT = new Set(['shot', 'gatling']);
// 3人のときの、それぞれの的
export const TARGET_OF = { deputy: 'renegade', renegade: 'outlaw', outlaw: 'deputy' };

export default class Game {
    // players: [{ name, isCPU }]、options: { seed, level }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed, level: options.level === 'easy' ? 'easy' : 'normal' };
        this.random = createRandom(seed);
        const n = players.length;
        const roles = shuffle([...ROLES_BY_PLAYERS[n]], this.random);
        const characters = shuffle(CHARACTERS.map(c => c.id), this.random).slice(0, n);
        this.players = players.map((p, id) => {
            const role = roles[id];
            const character = characters[id];
            const maxLife = CHARACTER_BY_ID[character].life + (role === 'sheriff' ? SHERIFF_BONUS : 0);
            return { id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU, role, character, maxLife, life: maxLife, arrows: 0, alive: true };
        });
        this.threePlayer = n === 3;
        this.arrowPile = ARROWS;
        this.phase = 'play';     // play：対戦中 / end：終わり
        this.winners = [];       // 勝った人の席
        this.winnerSide = null;  // law（保安官側）/ outlaw / renegade / 3人のときは役割
        this.turnCount = 0;
        this.turn = null;
        this.pending = null;     // ダメージの途中の判断（バート・キャシディ、ペドロ・ラミレス）。手番の人以外が答えることもある
        this.queue = [];         // まだ与えていないダメージ
        this.holdEnd = false;    // 同時のダメージを与えている間は、勝ち負けの判定を待つ
        this.pedroDue = null;    // 体力を失ったペドロ・ラミレス（矢を捨てるかを聞く）
        this.vultureDue = 0;     // まだ回復していない、ヴァルチャー・サムの回復の回数（脱落の数）
        this.logTotal = 0;       // これまでのログの数（古いログを捨てても数え続ける）
        this.eliminations = [];  // 脱落した人と、倒した人（撃った・ガトリング。襲撃とダイナマイトは null）
        this.acts = [];          // 公開された行動（だれがだれを撃った・回復した）。CPU の推測に使う
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.lastError = null;
        const first = this.threePlayer ? roles.indexOf('deputy') : roles.indexOf('sheriff');
        this.emit({ type: 'deal', roles: [...roles], characters: [...characters] });
        this.log(this.threePlayer
            ? `3人の対戦。役割は全員に公開されます。${this.name(first)}（副保安官）から始めます`
            : `${this.name(first)}が保安官です。保安官から始めます`);
        this.startTurn(first);
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今、操作を待っている人（いなければ空）
    actors() {
        if (this.phase === 'end') return [];
        if (this.pending) return [this.pending.seat];
        return [this.turn.seat];
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        if (!command || typeof command !== 'object' || !Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('操作が正しくありません');
        if (!this.actors().includes(playerId)) return this.fail('あなたの番ではありません');
        const error = this.commandError(playerId, command);
        if (error) return this.fail(error);
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(k => {
            const v = command[k];
            recorded[k] = Array.isArray(v) ? [...v] : (v ?? null);
        });
        this.commands.push({ playerId, command: recorded });
        this.execute(playerId, recorded);
        return true;
    }

    // ---- 判定（状態を変えない） ----

    commandError(seat, command) {
        const t = this.turn;
        if (this.pending) {
            if (command.type !== this.pending.type) return `先に${this.name(this.pending.seat)}の判断を待っています`;
            const n = command.arrows;
            if (!isInt(n) || n < 0 || n > this.pending.max) return '矢の数が正しくありません';
            return null;
        }
        if (command.type === 'bart' || command.type === 'pedro') return '今はできません';
        if (command.type === 'sid') {
            if (t.stage !== 'sid') return '今はできません';
            if (!this.isAliveSeat(command.target)) return '回復させる人を選んでください';
            return null;
        }
        if (t.stage === 'sid') return '先にシド・ケッチャムの能力で、回復させる人を選んでください';
        if (command.type === 'roll') {
            if (t.stage !== 'roll') return '今は振れません';
            if (t.rolls === 0) return null;
            if (t.rolls >= t.maxRolls) return 'もう振り直せません';
            const dice = command.dice;
            if (!Array.isArray(dice) || dice.length === 0 || new Set(dice).size !== dice.length) return '振り直すダイスを選んでください';
            for (const i of dice) {
                if (!isInt(i) || i < 0 || i >= DICE_COUNT) return '振り直すダイスが正しくありません';
                if (t.dice[i] === 'dynamite' && !this.has(seat, 'blackjack')) return 'ダイナマイトは振り直せません';
            }
            return null;
        }
        if (command.type === 'stop') {
            if (t.stage !== 'roll') return '今はできません';
            if (t.rolls === 0) return 'まずダイスを振ってください';
            return null;
        }
        if (t.stage !== 'resolve') return 'まずダイスを振り終えてください';
        const die = command.die;
        if (!isInt(die) || die < 0 || die >= DICE_COUNT || t.used[die]) return '使うダイスを選んでください';
        const face = t.dice[die];
        if (command.type === 'shoot') {
            if (face !== '1' && face !== '2') return '撃つには1か2のダイスを選んでください';
            if (!this.shotTargets(seat, face).includes(command.target)) return 'その人は撃てません（距離が合いません）';
            const double = command.double ?? null;
            if (double !== null) {
                if (!this.has(seat, 'slab')) return 'スラブ・ザ・キラーだけが使えます';
                if (t.slabUsed) return 'この手番ではもう使いました';
                if (!isInt(double) || double === die || t.used[double] || t.dice[double] !== 'beer') return '2倍にするにはビールのダイスを選んでください';
            }
            return null;
        }
        if (command.type === 'beer') {
            if (face !== 'beer') return 'ビールのダイスを選んでください';
            if (this.remaining('shot').length > 0) return '先に1と2を使ってください';
            if (!this.isAliveSeat(command.target)) return '回復させる人を選んでください';
            return null;
        }
        if (command.type === 'kit') {
            if (!this.has(seat, 'kit') || face !== 'gatling') return '今はできません';
            if (this.remaining('shot').length > 0 || this.remaining('beer').length > 0) return '先に1・2とビールを使ってください';
            if (t.kitDone[die]) return 'そのダイスはもう使いました';
            const target = command.target ?? null;
            if (target !== null && (!this.isAliveSeat(target) || this.players[target].arrows === 0)) return '矢を持っている人を選んでください';
            return null;
        }
        return '操作が正しくありません';
    }

    // ---- 実行 ----

    execute(seat, command) {
        const t = this.turn;
        switch (command.type) {
            case 'bart': return this.answerBart(command.arrows);
            case 'pedro': return this.answerPedro(command.arrows);
            case 'sid': {
                const target = command.target;
                const healed = this.heal(target, 1);
                this.acts.push({ type: 'beer', from: seat, to: target, turn: this.turnCount });
                this.emit({ type: 'heal', seat, target, amount: healed, cause: 'sid' });
                this.log(`${this.name(seat)}がシド・ケッチャムの能力で${this.who(seat, target)}を${healed}回復しました`);
                t.stage = 'roll';
                return;
            }
            case 'roll': return this.roll(t.rolls === 0 ? null : command.dice);
            case 'stop':
                this.log(`${this.name(seat)}は振るのを終えました`, { minor: true });
                return this.toResolve();
            case 'shoot': {
                const amount = command.double !== null ? 2 : 1;
                t.used[command.die] = true;
                if (command.double !== null) {
                    t.used[command.double] = true;
                    t.slabUsed = true;
                }
                this.acts.push({ type: 'shot', from: seat, to: command.target, amount, turn: this.turnCount });
                this.emit({ type: 'shot', seat, target: command.target, die: command.die, face: t.dice[command.die], amount });
                this.log(`${this.name(seat)}が${this.name(command.target)}を撃ちました${amount === 2 ? '（2倍）' : ''}`);
                t.shots.push({ target: command.target, amount, from: seat, cause: 'shot' });
                return this.proceed();
            }
            case 'beer': {
                t.used[command.die] = true;
                const target = command.target;
                const amount = target === seat && this.has(seat, 'jesse') && this.players[seat].life <= 4 ? 2 : 1;
                const healed = this.heal(target, amount);
                this.acts.push({ type: 'beer', from: seat, to: target, turn: this.turnCount });
                this.emit({ type: 'heal', seat, target, amount: healed, cause: 'beer', die: command.die });
                this.log(`${this.name(seat)}がビールで${this.who(seat, target)}を${healed}回復しました`);
                return this.proceed();
            }
            case 'kit': {
                t.kitDone[command.die] = true;
                const target = command.target;
                if (target !== null) {
                    this.players[target].arrows--;
                    this.arrowPile++;
                    this.acts.push({ type: 'kit', from: seat, to: target, turn: this.turnCount });
                    this.emit({ type: 'discardArrow', seat, target, cause: 'kit' });
                    this.log(`${this.name(seat)}がキット・カールソンの能力で${this.who(seat, target)}の矢を1本捨てました`);
                }
                return this.proceed();
            }
        }
    }

    // ---- 手番 ----

    startTurn(seat) {
        this.turnCount++;
        const lucky = this.has(seat, 'lucky');
        this.turn = {
            seat, stage: this.has(seat, 'sid') ? 'sid' : 'roll',
            dice: Array(DICE_COUNT).fill(null), rolls: 0, maxRolls: ROLLS + (lucky ? 1 : 0),
            used: Array(DICE_COUNT).fill(false), kitDone: Array(DICE_COUNT).fill(false),
            slabUsed: false, dynamiteHit: false, number: this.turnCount,
            seated: this.alive().map(p => p.id),   // 手番の始めに生きていた人。この手番の距離はこれで数える
            shots: []                               // 割り当て済みで、まだ与えていない撃つダメージ
        };
        this.emit({ type: 'turn', seat, number: this.turnCount });
        this.log(`― ${this.name(seat)}の番 ―`, { turn: seat });
    }

    // 振る（indices が null なら全部）。矢はすぐ取り、ダイナマイト3つで終える
    roll(indices) {
        const t = this.turn;
        const seat = t.seat;
        const list = indices ?? [...Array(DICE_COUNT).keys()];
        list.forEach(i => { t.dice[i] = FACES[Math.floor(this.random() * FACES.length)]; });
        t.rolls++;
        this.emit({ type: 'roll', seat, dice: [...t.dice], rolled: [...list], rolls: t.rolls });
        const faces = list.map(i => FACE_NAMES[t.dice[i]]);
        this.log(`${this.name(seat)}が${t.rolls === 1 ? '振りました' : `振り直しました（${t.rolls - 1}回目）`}：${faces.join('・')}`, { minor: true });
        const arrows = list.filter(i => t.dice[i] === 'arrow').length;
        for (let k = 0; k < arrows && this.phase !== 'end' && this.players[seat].alive; k++) this.takeArrow(seat);
        if (this.phase === 'end') return;
        if (!this.players[seat].alive) return this.endTurn();
        if (t.dice.filter(f => f === 'dynamite').length >= 3) {
            t.dynamiteHit = true;
            this.emit({ type: 'dynamite', seat });
            this.log(`ダイナマイトが3つ。${this.name(seat)}が体力を1失い、振るのを終えます`);
            this.queue.push({ target: seat, amount: 1, from: null, cause: 'dynamite' });
            this.toResolve(true);
            return;
        }
        if (t.rolls >= t.maxRolls) this.toResolve();
    }

    toResolve(silent = false) {
        this.turn.stage = 'resolve';
        if (!silent) this.emit({ type: 'stop', seat: this.turn.seat });
        this.proceed();
    }

    // 残っているダイス（kind：shot・beer・kit）
    remaining(kind) {
        const t = this.turn;
        return t.dice.map((f, i) => i).filter(i => {
            if (t.used[i]) return false;
            const f = t.dice[i];
            if (kind === 'shot') return f === '1' || f === '2';
            if (kind === 'beer') return f === 'beer';
            if (kind === 'kit') return f === 'gatling' && !t.kitDone[i] && this.has(t.seat, 'kit') && this.players.some(p => p.alive && p.arrows > 0);
            return false;
        });
    }

    // ダメージを与え、判断が要らなければ手番を進める（ガトリングと手番の終わりは自動）
    proceed() {
        if (this.flushQueue()) return;              // 判断待ち、または終わった
        const t = this.turn;
        if (!this.players[t.seat].alive) return this.endTurn();
        if (t.stage !== 'resolve') return;
        if (this.remaining('shot').length > 0) return;
        // 1と2の相手を全部決めたら、同時に撃つ
        if (t.shots.length > 0) {
            this.queue.push(...t.shots);
            t.shots = [];
            if (this.flushQueue()) return;
            if (!this.players[t.seat].alive) return this.endTurn();
        }
        if (this.remaining('beer').length > 0 || this.remaining('kit').length > 0) return;
        if (!t.gatlingDone) {
            t.gatlingDone = true;
            const gatlings = t.dice.filter(f => f === 'gatling').length;
            if (gatlings >= (this.has(t.seat, 'willy') ? 2 : 3)) {
                this.fireGatling(t.seat);
                if (this.flushQueue()) return;
                if (!this.players[t.seat].alive) return this.endTurn();
            }
        }
        this.endTurn();
    }

    fireGatling(seat) {
        const returned = this.players[seat].arrows;
        this.arrowPile += returned;
        this.players[seat].arrows = 0;
        this.acts.push({ type: 'gatling', from: seat, turn: this.turnCount });
        this.emit({ type: 'gatling', seat, returned });
        this.log(`${this.name(seat)}がガトリングを撃ちました${returned > 0 ? `（矢を${returned}本戻す）` : ''}`);
        this.alive().forEach(p => {
            if (p.id === seat) return;
            if (p.character === 'paul') {
                this.log(`${p.name}（ポール・レグレット）はガトリングで体力を失いません`);
                return;
            }
            this.queue.push({ target: p.id, amount: 1, from: seat, cause: 'gatling' });
        });
    }

    endTurn() {
        if (this.phase === 'end') return;
        const t = this.turn;
        const seat = t.seat;
        const me = this.players[seat];
        if (me.alive && me.character === 'suzy' && t.rolls > 0 && !t.dice.some(f => f === '1' || f === '2')) {
            const healed = this.heal(seat, 2);
            this.emit({ type: 'heal', seat, target: seat, amount: healed, cause: 'suzy' });
            this.log(`${me.name}はスージー・ラファイエットの能力で${healed}回復しました`);
        }
        t.stage = 'done';
        const n = this.players.length;
        for (let i = 1; i <= n; i++) {
            const next = (seat + i) % n;
            if (this.players[next].alive) return this.startTurn(next);
        }
    }

    // ---- ダメージと回復 ----

    // ダメージの列を順に与える。判断待ちか、ゲームが終わったら true
    // ガトリングのように同時に与えるダメージは、全員に与えてから勝ち負けを判定する（判断待ちの間も持ち越す）
    flushQueue() {
        this.holdEnd = true;
        while (this.queue.length > 0) {
            if (this.phase === 'end') break;
            const hit = this.queue[0];
            const target = this.players[hit.target];
            if (!target.alive) {
                this.queue.shift();
                continue;
            }
            // バート・キャシディは、山の最後の1本を取るためには能力を使えない
            const bartMax = Math.min(hit.amount, this.arrowPile - 1);
            if (target.character === 'bart' && SHOT.has(hit.cause) && bartMax > 0 && !hit.asked) {
                hit.asked = true;
                this.pending = { seat: hit.target, type: 'bart', amount: hit.amount, max: bartMax, from: hit.from, cause: hit.cause };
                return true;
            }
            this.queue.shift();
            this.loseLife(hit.target, hit.amount, hit.from, hit.cause);
            if (this.askPedro()) return true;
        }
        this.holdEnd = false;
        this.queue = [];
        this.settle();
        return this.phase === 'end';
    }

    answerBart(arrows) {
        const hit = this.pending;
        this.pending = null;
        this.queue.shift();
        const seat = hit.seat;
        if (arrows > 0) this.log(`${this.name(seat)}はバート・キャシディの能力で、体力の代わりに矢を${arrows}本取りました`);
        for (let k = 0; k < arrows && this.phase !== 'end' && this.players[seat].alive; k++) this.takeArrow(seat);
        if (hit.amount - arrows > 0 && this.phase !== 'end') this.loseLife(seat, hit.amount - arrows, hit.from, hit.cause);
        if (this.phase === 'end') return;
        this.proceed();
    }

    // ペドロ・ラミレスが体力を失ったら、失った1点ごとに1本まで、自分の矢を捨てるかを聞く
    askPedro() {
        const due = this.pedroDue;
        this.pedroDue = null;
        if (!due || this.phase === 'end') return false;
        const p = this.players[due.seat];
        const max = Math.min(due.lost, p.arrows);
        if (!p.alive || max <= 0) return false;
        this.pending = { seat: due.seat, type: 'pedro', amount: due.lost, max };
        return true;
    }

    answerPedro(arrows) {
        const seat = this.pending.seat;
        this.pending = null;
        const p = this.players[seat];
        if (arrows > 0) {
            p.arrows -= arrows;
            this.arrowPile += arrows;
            this.emit({ type: 'discardArrow', seat, target: seat, cause: 'pedro', count: arrows });
            this.log(`${p.name}はペドロ・ラミレスの能力で矢を${arrows}本捨てました`);
        }
        this.proceed();
    }

    loseLife(seat, amount, from, cause) {
        const p = this.players[seat];
        if (!p.alive || amount <= 0) return;
        const lost = Math.min(amount, p.life);
        p.life -= lost;
        this.emit({ type: 'damage', target: seat, from, amount: lost, cause });
        const why = { shot: '撃たれて', gatling: 'ガトリングで', dynamite: 'ダイナマイトで', indians: 'インディアンの襲撃で', arrow: '' }[cause] ?? '';
        this.log(`${p.name}が${why}体力を${lost}失いました（残り${p.life}）`);
        // ペドロ・ラミレスの判断は、ダメージの列の中で聞く（襲撃では矢がすべて山に戻るので聞かない）
        if (p.character === 'pedro' && cause !== 'indians') this.pedroDue = { seat, lost };
        if (p.life === 0) this.eliminate(seat, from, cause);
        this.gringo(seat, from, cause, lost);
    }

    // エル・グリンゴの体力を減らした人は、矢を1本取る（インディアンとダイナマイトは除く）
    gringo(seat, from, cause, lost) {
        if (this.phase === 'end' || this.players[seat].character !== 'gringo' || !SHOT.has(cause)) return;
        if (from === null || from === seat || !this.players[from].alive) return;
        if (lost <= 0) return;
        this.log(`エル・グリンゴの能力で、${this.name(from)}が矢を1本取ります`);
        this.takeArrow(from);
    }

    heal(seat, amount) {
        const p = this.players[seat];
        const healed = Math.max(0, Math.min(amount, p.maxLife - p.life));
        p.life += healed;
        return healed;
    }

    takeArrow(seat) {
        this.arrowPile--;
        this.players[seat].arrows++;
        this.emit({ type: 'arrow', seat, pile: this.arrowPile });
        this.log(`${this.name(seat)}が矢を1本取りました（山の残り${this.arrowPile}）`, { minor: true });
        if (this.arrowPile === 0) this.indianAttack();
    }

    // 矢の山が尽きたら、全員が持っている矢の数だけ体力を失い、矢を山に戻す
    indianAttack() {
        const losses = this.players.map(p => (p.alive && p.arrows > 0 ? (p.character === 'jourdonnais' ? 1 : p.arrows) : 0));
        this.emit({ type: 'indians', losses: [...losses] });
        this.log('インディアンの襲撃！ 矢を持っている人は、その数だけ体力を失います');
        this.players.forEach(p => { p.arrows = 0; });
        this.arrowPile = ARROWS;
        // 同時に失うので、全員に与えてから勝ち負けを判定する
        const held = this.holdEnd;
        this.holdEnd = true;
        losses.forEach((loss, seat) => { if (loss > 0) this.loseLife(seat, loss, null, 'indians'); });
        this.holdEnd = held;
        if (!held) this.settle();
    }

    eliminate(seat, from, cause) {
        const p = this.players[seat];
        p.alive = false;
        this.arrowPile += p.arrows;
        p.arrows = 0;
        this.eliminations.push({ seat, from: SHOT.has(cause) ? from : null });
        this.emit({ type: 'eliminate', seat, role: p.role, from, cause });
        this.log(`${p.name}が脱落しました。役割は${ROLE_NAMES[p.role]}でした`);
        this.vultureDue++;
        if (!this.holdEnd) this.settle();
    }

    // 同時のダメージを与え終えたら、ヴァルチャー・サムの回復（同時に倒れていたら回復しない）と、勝ち負けの判定をする
    settle() {
        const due = this.vultureDue;
        this.vultureDue = 0;
        if (due > 0) {
            this.players.forEach(q => {
                if (!q.alive || q.character !== 'vulture') return;
                const healed = this.heal(q.id, VULTURE_HEAL * due);
                if (healed > 0) {
                    this.emit({ type: 'heal', seat: q.id, target: q.id, amount: healed, cause: 'vulture' });
                    this.log(`${q.name}はヴァルチャー・サムの能力で${healed}回復しました`);
                }
            });
        }
        this.checkEnd();
    }

    // 勝ち負けの判定
    checkEnd() {
        if (this.phase === 'end') return;
        const alive = this.alive();
        if (this.threePlayer) {
            // 3人：自分の的（副保安官→裏切り者、裏切り者→無法者、無法者→副保安官）の最後の1点を自分で奪えば勝ち
            // 的をほかの人に倒されたら、残った2人の倒し合いになり、最後の1人が勝つ
            const hit = this.eliminations.find(e => e.from !== null && TARGET_OF[this.players[e.from].role] === this.players[e.seat].role);
            if (hit) return this.finish([hit.from], this.players[hit.from].role);
            if (alive.length === 1) return this.finish([alive[0].id], alive[0].role);
            // 全員が同時に倒れたら、ふつうの対戦と同じく無法者の勝ち（3人のときの決まりは書かれていないので、それに合わせた）
            if (alive.length === 0) return this.finish(this.players.filter(p => p.role === 'outlaw').map(p => p.id), 'outlaw');
            return;
        }
        const sheriff = this.players.find(p => p.role === 'sheriff');
        if (!sheriff.alive) {
            if (alive.length === 1 && alive[0].role === 'renegade') return this.finish([alive[0].id], 'renegade');
            return this.finish(this.players.filter(p => p.role === 'outlaw').map(p => p.id), 'outlaw');
        }
        if (!alive.some(p => p.role === 'outlaw' || p.role === 'renegade')) {
            return this.finish(this.players.filter(p => p.role === 'sheriff' || p.role === 'deputy').map(p => p.id), 'law');
        }
    }

    finish(winners, side) {
        this.phase = 'end';
        this.winners = winners;
        this.winnerSide = side;
        this.pending = null;
        this.queue = [];
        this.emit({ type: 'end', winners: [...winners], side, roles: this.players.map(p => p.role) });
        const label = { law: '保安官と副保安官', outlaw: '無法者', renegade: '裏切り者', deputy: '副保安官', null: 'なし' }[side];
        this.log(`ゲーム終了。${label}の勝ちです`);
    }

    // ---- 距離 ----

    alive() {
        return this.players.filter(p => p.alive);
    }

    isAliveSeat(seat) {
        return isInt(seat) && !!this.players[seat]?.alive;
    }

    has(seat, character) {
        return this.players[seat].character === character;
    }

    // 左右の近いほうの距離。前の手番までに脱落した人は飛ばす（この手番の中で倒れた人は数える）
    distance(from, to) {
        const order = this.turn?.seated ?? this.alive().map(p => p.id);
        const a = order.indexOf(from);
        const b = order.indexOf(to);
        if (a < 0 || b < 0) return Infinity;
        const d = Math.abs(a - b);
        return Math.min(d, order.length - d);
    }

    // 1か2で撃てる人
    shotTargets(seat, face) {
        const base = face === '1' ? [1] : [2];
        let ranges = this.has(seat, 'calamity') ? [1, 2] : base;
        if (this.has(seat, 'rose')) ranges = [...new Set(ranges.flatMap(r => [r, r + 1]))];
        // 手番の始めに生きていた人が相手（この手番の中で倒れた人を撃つと、無駄になる）
        const seated = this.turn?.seated ?? this.alive().map(p => p.id);
        const others = seated.filter(id => id !== seat).map(id => this.players[id]);
        const hit = others.filter(p => ranges.includes(this.distance(seat, p.id)));
        if (hit.length > 0) return hit.map(p => p.id);
        // その距離にだれもいない（残りが3人以下で2を使う）ときは、いちばん遠い人
        const far = Math.max(...others.map(p => this.distance(seat, p.id)));
        return others.filter(p => this.distance(seat, p.id) === far).map(p => p.id);
    }

    // ---- 道具 ----

    name(seat) {
        return this.players[seat].name;
    }

    who(seat, target) {
        return seat === target ? '自分' : this.name(target);
    }

    emit(event) {
        this.events.push({ seq: ++this.eventSeq, ...event });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    // turn：手番の始まりの行（その人の席）。minor：記録にだけ出す細かい行（振った目・矢を取った）
    log(text, { turn = null, minor = false } = {}) {
        this.logs.push({ n: ++this.logTotal, text, turn, minor });
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
