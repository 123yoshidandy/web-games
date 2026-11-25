/**
 * クアックサルバー（Die Quacksalber von Quedlinburg）の進行
 * DOM に依存しないので、ブラウザ・テスト・（のちの）オンライン対戦のサーバーのどこでも動く
 * 受け付けた操作を commands に記録し、Game.replay で同じゲームを再現できる
 *
 * 1回の流れ（全9回）
 * 1. 占い：カードを1枚めくる。すぐ起きるものは全員に起こし、選ぶものは各自が選ぶ（fortune）
 *    ネズミ：いちばん点の多い人との間にあるネズミのしっぽの数だけ、しずくの先にネズミを置く
 * 2. 調合：全員が同時に、袋から1つずつ引いて鍋に置く。好きなときに止められる。白の合計が7を超えたら爆発（brew）
 * 3. 評価：いちばん進んだ（爆発していない）人がサイコロ → 黒・緑・紫の効果 → ルビーのマス → 点（evaluate）
 *    爆発した人は、点か買い物のどちらか一方だけ
 * 4. 買い物：最後のマスのお金で、違う色を2つまで。ルビー2つで、しずくを1マス進めるかフラスコを満たす（shop）
 * 9回目は買い物の代わりに、お金5で1点・ルビー2つで1点に替えて終わる
 *
 * 乱数は人ごとに分けた。ほかの人が引く順番で、自分の袋から出るものが変わらないように
 */

import { createRandom, shuffle } from './random.js';
import {
    ROUNDS, WHITE_LIMIT, LAST_SPACE, RUBY_COST, START_RUBIES, START_BAG, DIE_FACES, DIE_LABELS,
    FORTUNES, INGREDIENTS, NEXT_VALUE, space, ratTailsBetween, chipColor, chipValue, chipCost, available, isChip
} from './data.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
const MAX_LOGS = 300;
const MAX_EVENTS = 300;
const POT_END = LAST_SPACE - 1; // 置けるいちばん外のマス（その次が最後のマス）

// 操作の種類ごとに、記録する項目
export const COMMAND_FIELDS = {
    draw: [], stop: [], flask: [], bubble: [], mandrake: [], restart: [],
    pick: ['index'], choose: ['option'], shop: ['buy', 'droplet', 'refill']
};

const chipName = (chip) => `${INGREDIENTS[chipColor(chip)].name}${chipValue(chip)}`;
export { chipName };

export default class Game {
    // players: [{ name, isCPU }]、options: { seed }
    constructor(players, options = {}) {
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人です`);
        const seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
        this.options = { seed };
        this.random = createRandom(seed);
        this.players = players.map((p, id) => ({
            id, name: String(p.name ?? `プレイヤー${id + 1}`), isCPU: !!p.isCPU,
            random: createRandom((seed ^ Math.imul(id + 1, 0x9E3779B1)) >>> 0),
            score: 0, rubies: START_RUBIES, droplet: 0, flask: true, rats: 0,
            bag: [...START_BAG], pot: [], prompts: [], brew: null, result: null, shopped: false
        }));
        this.fortunes = shuffle(FORTUNES.map(card => card.id), this.random);
        this.round = 0;
        this.fortune = null;
        this.phase = 'fortune';      // fortune / brew / evaluate / shop / end
        this.winners = [];
        this.commands = [];
        this.logs = [];
        this.events = [];
        this.eventSeq = 0;
        this.promptSeq = 0;
        this.lastError = null;
        this.startRound();
    }

    isOver() {
        return this.phase === 'end';
    }

    // 今操作が必要な人（全員が同時に動くので、複数いる）
    actors() {
        return this.players.filter(p => this.needsAction(p)).map(p => p.id);
    }

    needsAction(p) {
        if (this.phase === 'fortune' || this.phase === 'evaluate') return p.prompts.length > 0;
        if (this.phase === 'brew') return !p.brew.done;
        if (this.phase === 'shop') return !p.shopped;
        return false;
    }

    whiteLimit() {
        return this.fortune === 'portentous' ? 9 : WHITE_LIMIT;
    }

    // playerId のプレイヤーの操作を受け付ける。受け付けたら true、できなければ lastError に理由を入れて false
    // 断る操作は状態を変えない（判定をすべて先に行い、受け付けが決まってから変える）
    applyCommand(playerId, command) {
        this.lastError = null;
        if (this.phase === 'end') return this.fail('ゲームは終わっています');
        const p = this.players[playerId];
        if (!p) return this.fail('参加していません');
        if (!command || typeof command !== 'object') return this.fail('操作が正しくありません');
        if (!Object.hasOwn(COMMAND_FIELDS, command.type)) return this.fail('今はその操作はできません');
        if (!this.needsAction(p)) return this.fail('今は操作できません');
        const ok = {
            draw: this.draw, stop: this.stop, flask: this.useFlask, bubble: this.useBubble, mandrake: this.useMandrake,
            restart: this.restartBrew, pick: this.pick, choose: this.choose, shop: this.shop
        }[command.type].call(this, p, command);
        if (!ok) return false;
        const recorded = { type: command.type };
        COMMAND_FIELDS[command.type].forEach(key => { if (command[key] !== undefined) recorded[key] = structuredClone(command[key]); });
        this.commands.push({ playerId, command: recorded });
        this.advance();
        return true;
    }

    // ---- 調合 ----

    canBrew(p) {
        return this.phase === 'brew' && !p.brew.done && !p.brew.pending;
    }

    // { type: 'draw' }：袋から1つ引いて鍋に置く
    draw(p) {
        if (!this.canBrew(p)) return this.fail('今は引けません');
        if (p.bag.length === 0) return this.fail('袋が空です');
        if (p.brew.pos >= POT_END) return this.fail('鍋がいっぱいです');
        if (p.pot.length >= 5) p.brew.passedFive = true;
        const chip = this.takeFromBag(p);
        this.place(p, chip);
        return true;
    }

    // 袋から1つ取り出す（人ごとの乱数）
    takeFromBag(p) {
        const index = Math.floor(p.random() * p.bag.length);
        return p.bag.splice(index, 1)[0];
    }

    // 鍋に置く。効果（赤・黄・青・白）をここで起こす
    place(p, chip, { from = 'bag' } = {}) {
        const b = p.brew;
        const color = chipColor(chip);
        const value = chipValue(chip);
        let move = value;
        if (color === 'R') {
            const oranges = p.pot.filter(e => chipColor(e.chip) === 'O').length;
            move += oranges >= 3 ? 2 : oranges >= 1 ? 1 : 0;
        }
        if (color === 'O' && this.fortune === 'pumpkin') move += 1;
        const pos = Math.min(POT_END, b.pos + move);
        p.pot.push({ chip, pos });
        b.pos = pos;
        b.canFlask = false;
        b.canBubble = false;
        b.canMandrake = false;
        this.emit({ type: 'draw', seat: p.id, chip, pos, from });
        if (color === 'W') {
            b.whites += value;
            if (b.whites > this.whiteLimit()) {
                b.exploded = true;
                b.done = true;
                this.emit({ type: 'explode', seat: p.id, whites: b.whites });
                this.log(`${p.name}の鍋が爆発しました`);
                return;
            }
            if (this.fortune === 'bubble' && !b.firstWhiteSeen) b.canBubble = true;
            else if (p.flask) b.canFlask = true;
            b.firstWhiteSeen = true;
        }
        if (color === 'Y' && p.pot.length >= 2 && chipColor(p.pot.at(-2).chip) === 'W') b.canMandrake = true;
        // 「念のため」で置いたカラスは、もう引かない（止めたあとなので）
        if (color === 'B' && from !== 'safety') {
            const count = Math.min(value, p.bag.length);
            if (count > 0) {
                const chips = Array.from({ length: count }, () => this.takeFromBag(p));
                b.pending = { kind: 'crow', chips };
            }
        }
        if (b.pos >= POT_END && !b.pending) this.finishBrew(p, '鍋がいっぱいになりました');
    }

    // 直前に置いた白を袋に戻す
    returnLastWhite(p) {
        const b = p.brew;
        const last = p.pot.pop();
        b.whites -= chipValue(last.chip);
        b.pos = p.pot.at(-1)?.pos ?? b.start;
        p.bag.push(last.chip);
        b.canFlask = false;
        b.canBubble = false;
        b.canMandrake = false;
        return last.chip;
    }

    // { type: 'flask' }：引いた白をフラスコで袋に戻す（フラスコは空になる）
    useFlask(p) {
        if (!this.canBrew(p) || !p.brew.canFlask || !p.flask) return this.fail('フラスコは使えません');
        const chip = this.returnLastWhite(p);
        p.flask = false;
        this.emit({ type: 'flask', seat: p.id, chip });
        return true;
    }

    // { type: 'bubble' }：占い「ひと泡」で、最初の白を袋に戻す
    useBubble(p) {
        if (!this.canBrew(p) || !p.brew.canBubble) return this.fail('今は戻せません');
        const chip = this.returnLastWhite(p);
        this.emit({ type: 'flask', seat: p.id, chip, free: true });
        return true;
    }

    // { type: 'mandrake' }：マンドラゴラのすぐ前の白を袋に戻す（マンドラゴラはそのまま）
    useMandrake(p) {
        const b = p.brew;
        if (!this.canBrew(p) || !b.canMandrake) return this.fail('今は戻せません');
        const [white] = p.pot.splice(p.pot.length - 2, 1);
        b.whites -= chipValue(white.chip);
        p.bag.push(white.chip);
        b.canMandrake = false;
        this.emit({ type: 'mandrake', seat: p.id, chip: white.chip, pos: white.pos });
        return true;
    }

    // 占い「やり直し」：最初の5つを置いたところで、一度だけ全部を袋に戻して引き直せる
    canRestart(p) {
        const b = p.brew;
        return this.fortune === 'second' && this.canBrew(p) && !b.restarted && !b.passedFive && p.pot.length >= 5;
    }

    restartBrew(p) {
        if (!this.canRestart(p)) return this.fail('やり直せません');
        const b = p.brew;
        p.bag.push(...p.pot.map(e => e.chip));
        p.pot = [];
        Object.assign(b, { pos: b.start, whites: 0, canFlask: false, canBubble: false, canMandrake: false, restarted: true });
        this.emit({ type: 'restart', seat: p.id });
        return true;
    }

    // { type: 'pick', index }：カラスや「念のため」で引いた材料から、鍋に置く1つを選ぶ（-1 は置かない）
    pick(p, command) {
        const pending = p.brew?.pending;
        if (this.phase !== 'brew' || !pending) return this.fail('選ぶものがありません');
        const index = command.index;
        if (!Number.isInteger(index) || index < -1 || index >= pending.chips.length) return this.fail('選び方が正しくありません');
        const chosen = index >= 0 ? pending.chips[index] : null;
        p.bag.push(...pending.chips.filter((_, i) => i !== index));
        p.brew.pending = null;
        if (chosen) this.place(p, chosen, { from: pending.kind });
        if (pending.kind === 'safety' && !p.brew.done) this.finishBrew(p);
        return true;
    }

    // { type: 'stop' }：引くのをやめる
    stop(p) {
        if (!this.canBrew(p)) return this.fail('今は止められません');
        if (this.fortune === 'safety' && p.bag.length > 0) {
            const chips = Array.from({ length: Math.min(5, p.bag.length) }, () => this.takeFromBag(p));
            p.brew.pending = { kind: 'safety', chips };
            p.brew.stopped = true;
            return true;
        }
        this.finishBrew(p);
        return true;
    }

    finishBrew(p, reason = null) {
        p.brew.done = true;
        p.brew.pending = null;
        this.emit({ type: 'stop', seat: p.id, pos: p.brew.pos });
        if (reason) this.log(`${p.name}：${reason}`);
    }

    // ---- 選択（占い・評価） ----

    addPrompt(p, kind, title, options) {
        p.prompts.push({ id: ++this.promptSeq, kind, title, options });
    }

    // { type: 'choose', option }：出ている選択に答える
    choose(p, command) {
        const prompt = p.prompts[0];
        if (!prompt) return this.fail('選ぶものがありません');
        const option = prompt.options.find(o => o.key === command.option);
        if (!option) return this.fail('その選択肢はありません');
        p.prompts.shift();
        this.resolvePrompt(p, prompt, option.key);
        return true;
    }

    resolvePrompt(p, prompt, key) {
        const [what, arg] = key.split(':');
        if (what === 'chip') this.gain(p, arg);
        if (what === 'rubies') this.addRubies(p, Number(arg), '占い');
        if (what === 'vp') this.addScore(p, Number(arg), prompt.title);
        if (what === 'droplet') this.moveDroplet(p, Number(arg));
        if (what === 'removeWhite') {
            p.bag.splice(p.bag.indexOf('W1'), 1);
            this.log(`${p.name}が白1を取り除きました`);
        }
        if (what === 'rats') {
            const n = Number(arg);
            p.rats -= n;
            this.addRubies(p, n, '占い');
        }
        if (what === 'upgrade') {
            const [from, to] = arg.split('>');
            p.bag.splice(p.bag.indexOf(from), 1, to);
            this.log(`${p.name}が${chipName(from)}を${chipName(to)}に替えました`);
        }
        if (prompt.kind === 'wheeling' && what === 'chip') this.addRubies(p, -1);
        if (what === 'die') this.applyDie(p, arg);
        if (what === 'explode') p.result.choice = arg; // points / coins
    }

    // ---- 1回の流れ ----

    // 選択がそろったら次の段階へ進める
    advance() {
        while (this.phase !== 'end') {
            if (this.actors().length > 0) return;
            if (this.phase === 'fortune') this.startBrew();
            else if (this.phase === 'brew') this.evaluate();
            else if (this.phase === 'evaluate') this.finishEvaluation();
            else if (this.phase === 'shop') this.startRound();
        }
    }

    startRound() {
        this.round++;
        this.players.forEach(p => {
            p.bag.push(...p.pot.map(e => e.chip));
            p.pot = [];
            p.shopped = false;
            p.result = null;
            p.prompts = [];
        });
        if (this.round === 6) {
            this.players.forEach(p => p.bag.push('W1'));
            this.log('6回目：全員の袋に白1が1つ入ります');
        }
        // ネズミ
        const leader = Math.max(...this.players.map(p => p.score));
        this.players.forEach(p => { p.rats = ratTailsBetween(p.score, leader); });
        // 占い
        this.fortune = this.fortunes[(this.round - 1) % this.fortunes.length];
        const card = FORTUNES.find(c => c.id === this.fortune);
        this.phase = 'fortune';
        this.emit({ type: 'round', round: this.round, fortune: this.fortune });
        this.log(`${this.round}回目　占い「${card.name}」`);
        this.applyFortune(card);
        this.advance();
    }

    applyFortune(card) {
        const ps = this.players;
        const fewest = (key) => {
            const min = Math.min(...ps.map(p => p[key]));
            return ps.filter(p => p[key] === min);
        };
        const chipOptions = (chips) => chips.map(chip => ({ key: `chip:${chip}`, label: chipName(chip), chip }));
        switch (card.id) {
            case 'drop': ps.forEach(p => this.moveDroplet(p, 1)); break;
            case 'charity': fewest('rubies').forEach(p => this.addRubies(p, 1, '占い')); break;
            case 'beginner': fewest('score').forEach(p => this.gain(p, 'G1')); break;
            case 'infestation': ps.forEach(p => { p.rats *= 2; }); break;
            case 'chance': ps.forEach(p => this.applyDie(p, DIE_FACES[Math.floor(p.random() * DIE_FACES.length)])); break;
            case 'less': {
                const sums = ps.map(p => {
                    const drawn = Array.from({ length: Math.min(5, p.bag.length) }, () => this.takeFromBag(p));
                    p.bag.push(...drawn);
                    this.emit({ type: 'reveal', seat: p.id, chips: drawn });
                    return drawn.reduce((s, c) => s + chipValue(c), 0);
                });
                const min = Math.min(...sums);
                ps.forEach((p, i) => (sums[i] === min ? this.gain(p, 'B2') : this.addRubies(p, 1, '占い')));
                break;
            }
            case 'choices':
                ps.forEach(p => this.addPrompt(p, card.id, card.name, [
                    ...chipOptions(['K1', 'G2', 'R2', 'B2', 'Y2']), { key: 'rubies:3', label: 'ルビー3つ' }]));
                break;
            case 'wheeling':
                ps.filter(p => p.rubies >= 1).forEach(p => this.addPrompt(p, card.id, card.name, [
                    ...chipOptions(['O1', 'G1', 'R1', 'B1', 'Y1']), { key: 'none', label: '替えない' }]));
                break;
            case 'boomberry':
                ps.forEach(p => this.addPrompt(p, card.id, card.name, [
                    { key: 'vp:4', label: '4点' },
                    ...(p.bag.includes('W1') ? [{ key: 'removeWhite', label: '白1を取り除く' }] : [])]));
                break;
            case 'goodstart':
                ps.filter(p => p.rats > 0).forEach(p => this.addPrompt(p, card.id, card.name, [
                    { key: 'none', label: '戻さない' },
                    ...Array.from({ length: Math.min(3, p.rats) }, (_, i) => ({ key: `rats:${i + 1}`, label: `${i + 1}マス戻してルビー${i + 1}つ` }))]));
                break;
            case 'ratatat':
                ps.forEach(p => this.addPrompt(p, card.id, card.name, [
                    ...chipOptions(['G4', 'R4', 'B4', 'Y4']), { key: `vp:${p.rats}`, label: `${p.rats}点` }]));
                break;
            case 'decisions':
                ps.forEach(p => this.addPrompt(p, card.id, card.name, [
                    { key: 'droplet:2', label: 'しずく2マス' }, ...chipOptions(['P1'])]));
                break;
            case 'flea':
                ps.forEach(p => {
                    const drawn = Array.from({ length: Math.min(4, p.bag.length) }, () => this.takeFromBag(p));
                    p.bag.push(...drawn);
                    const ups = [...new Set(drawn)].filter(c => chipColor(c) !== 'W' && chipCost(`${chipColor(c)}${NEXT_VALUE[chipValue(c)]}`) !== null);
                    if (ups.length === 0) {
                        this.emit({ type: 'reveal', seat: p.id, chips: drawn });
                        this.gain(p, 'G1');
                        return;
                    }
                    this.addPrompt(p, card.id, card.name, [
                        ...ups.map(c => {
                            const to = `${chipColor(c)}${NEXT_VALUE[chipValue(c)]}`;
                            return { key: `upgrade:${c}>${to}`, label: `${chipName(c)}→${chipValue(to)}`, chip: to };
                        }),
                        { key: 'none', label: '替えない' }]);
                    p.prompts.at(-1).drawn = drawn;
                });
                break;
            default: break; // その回のあいだ効くカードは、各所で this.fortune を見る
        }
    }

    startBrew() {
        this.phase = 'brew';
        this.players.forEach(p => {
            const start = Math.min(POT_END - 1, p.droplet + p.rats);
            p.brew = {
                start, pos: start, whites: 0, exploded: false, done: false, stopped: false, pending: null,
                canFlask: false, canBubble: false, canMandrake: false, firstWhiteSeen: false, restarted: false, passedFive: false
            };
        });
        this.emit({ type: 'brew', round: this.round });
    }

    // 評価：サイコロ・材料の効果・ルビー。選択が要るもの（サイコロ2回・爆発した人・とばっちり）は選んでもらう
    evaluate() {
        this.phase = 'evaluate';
        const ps = this.players;
        const n = ps.length;
        ps.forEach(p => {
            const b = p.brew;
            const scoring = Math.min(LAST_SPACE, b.pos + 1);
            p.result = { space: scoring, exploded: b.exploded, choice: b.exploded ? null : 'both', gains: [], die: [] };
            // 止めたとき白がちょうど7なら、しずく1マス
            if (this.fortune === 'bubbling' && !b.exploded && b.whites === 7) this.moveDroplet(p, 1, 'ぴったり7');
        });
        // ボーナスのサイコロ：爆発していない人のうち、いちばん進んだ人（同じなら全員）
        const alive = ps.filter(p => !p.result.exploded);
        if (alive.length > 0) {
            const best = Math.max(...alive.map(p => p.result.space));
            alive.filter(p => p.result.space === best).forEach(p => {
                const roll = () => DIE_FACES[Math.floor(p.random() * DIE_FACES.length)];
                if (this.fortune === 'double') {
                    const faces = [roll(), roll()];
                    this.emit({ type: 'die', seat: p.id, faces });
                    if (faces[0] === faces[1]) this.applyDie(p, faces[0]);
                    else this.addPrompt(p, 'die', 'サイコロ', faces.map(f => ({ key: `die:${f}`, label: DIE_LABELS[f] })));
                } else {
                    const face = roll();
                    this.emit({ type: 'die', seat: p.id, faces: [face] });
                    this.applyDie(p, face);
                }
            });
        }
        // 黒：両どなりと数を比べる（2人なら相手と）
        const blacks = ps.map(p => p.pot.filter(e => chipColor(e.chip) === 'K').length);
        ps.forEach((p, i) => {
            if (n === 2) {
                const other = blacks[1 - i];
                if (blacks[i] > other) {
                    this.moveDroplet(p, 1, 'ドクロガ');
                    this.addRubies(p, 1, 'ドクロガ');
                } else if (blacks[i] === other && blacks[i] > 0) this.moveDroplet(p, 1, 'ドクロガ');
                return;
            }
            const beats = [(i + n - 1) % n, (i + 1) % n].filter(j => blacks[i] > blacks[j]).length;
            if (beats >= 1) this.moveDroplet(p, 1, 'ドクロガ');
            if (beats === 2) this.addRubies(p, 1, 'ドクロガ');
        });
        ps.forEach(p => {
            // 緑：最後と最後から2番目のクモ
            const greens = p.pot.slice(-2).filter(e => chipColor(e.chip) === 'G').length;
            if (greens > 0) this.addRubies(p, greens, 'クモ');
            // 紫：数で決まる
            const purples = p.pot.filter(e => chipColor(e.chip) === 'P').length;
            if (purples === 1) this.addScore(p, 1, 'ゴースト');
            if (purples === 2) {
                this.addScore(p, 1, 'ゴースト');
                this.addRubies(p, 1, 'ゴースト');
            }
            if (purples >= 3) {
                this.addScore(p, 2, 'ゴースト');
                this.moveDroplet(p, 1, 'ゴースト');
            }
            // ルビーのマス
            const s = space(p.result.space);
            if (s.ruby) {
                this.addRubies(p, this.fortune === 'fire' ? 2 : 1, 'マス');
                if (this.fortune === 'lucky') this.addScore(p, 2, '幸運のルビー');
            }
            // 爆発した人は、点か買い物（9回目はお金を点に替える）を選ぶ
            if (p.result.exploded) {
                const coinsLabel = this.round === ROUNDS ? `お金${s.coins}（${Math.floor(s.coins / 5)}点）` : `買い物（お金${s.coins}）`;
                this.addPrompt(p, 'explode', '爆発', [
                    { key: 'explode:points', label: `${s.points}点` }, { key: 'explode:coins', label: coinsLabel }]);
                // とばっちり：左どなりが値2の材料をもらう
                if (this.fortune === 'toil') {
                    const left = ps[(p.id + 1) % n];
                    this.addPrompt(left, 'toil', 'とばっちり', ['G2', 'R2', 'B2', 'Y2'].map(chip => ({ key: `chip:${chip}`, label: chipName(chip), chip })));
                }
            }
        });
        this.emit({ type: 'evaluate', round: this.round });
    }

    finishEvaluation() {
        const last = this.round === ROUNDS;
        this.players.forEach(p => {
            const s = space(p.result.space);
            const choice = p.result.choice;
            if (choice === 'both' || choice === 'points') this.addScore(p, s.points, '鍋');
            p.result.coins = choice === 'both' || choice === 'coins' ? s.coins : 0;
            if (this.fortune === 'rabbit' && !p.flask) {
                p.flask = true;
                p.result.gains.push('フラスコ');
            }
        });
        this.emit({ type: 'scored', round: this.round, results: this.players.map(p => ({ seat: p.id, ...structuredClone(p.result) })) });
        if (last) {
            this.endGame();
            return;
        }
        this.phase = 'shop';
    }

    // { type: 'shop', buy: ['G2', 'R1'], droplet: 0, refill: false }：買い物とルビーの使い道をまとめて決める
    shop(p, command) {
        if (this.phase !== 'shop') return this.fail('今は買えません');
        const buy = command.buy ?? [];
        const droplet = command.droplet ?? 0;
        const refill = !!command.refill;
        if (!Array.isArray(buy) || buy.length > 2) return this.fail('買えるのは2つまでです');
        if (!buy.every(chip => isChip(chip) && available(chip, this.round))) return this.fail('その材料は買えません');
        if (new Set(buy.map(chipColor)).size !== buy.length) return this.fail('同じ色は1つしか買えません');
        const cost = buy.reduce((sum, chip) => sum + chipCost(chip), 0);
        if (cost > p.result.coins) return this.fail('お金が足りません');
        if (!Number.isInteger(droplet) || droplet < 0) return this.fail('しずくの数が正しくありません');
        if (refill && p.flask) return this.fail('フラスコは満ちています');
        if ((droplet + (refill ? 1 : 0)) * RUBY_COST > p.rubies) return this.fail('ルビーが足りません');
        buy.forEach(chip => p.bag.push(chip));
        if (buy.length > 0) this.log(`${p.name}が${buy.map(chipName).join('と')}を買いました`);
        if (refill) {
            p.rubies -= RUBY_COST;
            p.flask = true;
        }
        if (droplet > 0) {
            p.rubies -= droplet * RUBY_COST;
            this.moveDroplet(p, droplet);
        }
        p.shopped = true;
        this.emit({ type: 'shop', seat: p.id, buy: [...buy], droplet, refill });
        return true;
    }

    // ---- 得るもの ----

    applyDie(p, face) {
        if (face === 'vp1') this.addScore(p, 1, 'サイコロ');
        if (face === 'vp2') this.addScore(p, 2, 'サイコロ');
        if (face === 'ruby') this.addRubies(p, 1, 'サイコロ');
        if (face === 'droplet') this.moveDroplet(p, 1, 'サイコロ');
        if (face === 'pumpkin') this.gain(p, 'O1', 'サイコロ');
        p.result?.die.push(face);
        this.log(`${p.name}のサイコロ：${DIE_LABELS[face]}`);
    }

    gain(p, chip, why = '') {
        p.bag.push(chip);
        if (why !== 'サイコロ') p.result?.gains.push(chipName(chip));
        this.emit({ type: 'gain', seat: p.id, chip });
        this.log(`${p.name}が${why ? `${why}で` : ''}${chipName(chip)}をもらいました`);
    }

    addRubies(p, n, why = '') {
        p.rubies += n;
        if (n > 0 && why !== 'サイコロ') p.result?.gains.push(`ルビー${n > 1 ? n : ''}`);
        if (n > 0 && why) this.emit({ type: 'ruby', seat: p.id, n, why });
    }

    addScore(p, n, why = '') {
        if (n <= 0) return;
        p.score += n;
        if (p.result && why !== '鍋' && why !== 'サイコロ') p.result.gains.push(`${n}点`);
        this.emit({ type: 'score', seat: p.id, n, why });
    }

    moveDroplet(p, n, why = '') {
        p.droplet = Math.min(POT_END - 1, p.droplet + n);
        if (why !== 'サイコロ') p.result?.gains.push(`しずく${n > 1 ? n : ''}`);
        this.emit({ type: 'droplet', seat: p.id, n, why });
    }

    // ---- 終わり ----

    endGame() {
        this.players.forEach(p => {
            const coins = p.result.coins;
            const fromCoins = Math.floor(coins / 5);
            const fromRubies = Math.floor(p.rubies / 2);
            p.final = { fromCoins, fromRubies };
            p.score += fromCoins + fromRubies;
        });
        this.phase = 'end';
        // 同点なら、最後の回に鍋で先まで進んだ人
        const key = (p) => p.score * 100 + p.result.space;
        const best = Math.max(...this.players.map(key));
        this.winners = this.players.filter(p => key(p) === best).map(p => p.id);
        this.emit({ type: 'end', winners: [...this.winners] });
        this.log(`${this.winners.map(id => this.players[id].name).join('と')}の勝ちです`);
    }

    results() {
        return this.players.map(p => ({
            seat: p.id, score: p.score, rubies: p.rubies, final: p.final ? { ...p.final } : null,
            lastSpace: p.result?.space ?? 0
        }));
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
