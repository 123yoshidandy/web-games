/**
 * CPU（協力する仲間）
 *
 * 見えるもの（自分の手札・場・通信・JARVIS の表のカード・出されたカード）だけで考える。
 * ゲームの乱数は使わず、ゲームのシードと操作の数から作った自分の乱数を使う。
 *
 * カードを出すとき：
 *   1. 見えないカードの配り方を、通信（一番上・唯一・一番下）と、色を出せなかった人（その色がない）に合う形で何通りか作る
 *   2. それぞれで、出せるカードごとに、全員が「課題のカードを持ち主に取らせる」ように協力したとして最後まで進め、
 *      成功した割合（失敗したときは進み具合）を比べる
 * 課題を選ぶとき：自分が取れそうな課題（その色の大きいカードやロケットを持っている、課題のカードを自分で持っていて大きい）を選ぶ
 * 通信：ほかの人の課題のカードを持っているとき、自分の課題の色で一番大きいカードを持っているときに伝える
 */

import { ALL_CARDS, ROCKET, SUITS, parseCard } from './missions.js';
import { createRandom, shuffle } from './random.js';
import { trickWinner, commPosition } from './game.js';

export const CPU_STYLES = {
    easy: { samples: 1, rollout: false },
    normal: { samples: 12, rollout: true },
    strong: { samples: 24, rollout: true }
};

const INFO = Object.fromEntries(ALL_CARDS.map(id => [id, parseCard(id)]));
const suitOf = c => INFO[c].suit;
const rankOf = c => INFO[c].rank;
const isRocket = c => INFO[c].suit === ROCKET;

// a が b に勝つか（led は出された色）
function beats(a, b, led) {
    const x = INFO[a];
    const y = INFO[b];
    if (x.suit === y.suit) return x.rank > y.rank;
    if (x.suit === ROCKET) return true;
    if (y.suit === ROCKET) return false;
    return x.suit === led && y.suit !== led;
}

function cpuRandom(game, salt = 0) {
    return createRandom((game.seed ^ (game.commands.length * 2654435761) ^ salt) >>> 0);
}

// ===== 入口 =====

// CPU がやることがあるか（重い読みをせずに確かめる）
export function hasCpuWork(game) {
    if (game.phase === 'end') return false;
    const seat = game.current;
    if (seat !== null && game.players[seat].isCPU) return true;
    if (game.phase !== 'play' || game.passing || game.trick.plays.length > 0) return false;
    return game.players.some(p => p.isCPU && !p.jarvis && game.commAllowed(p.seat) && chooseCommunication(game, p.seat));
}

// CPU が今やることを1つ返す（{ seat, command }）。CPU の番でなく、通信もしないなら null
export function nextCpuCommand(game, style = 'normal') {
    if (game.phase === 'end') return null;
    // トリックの前：CPU は通信するかを考える（手番と関係ない）
    if (game.phase === 'play' && !game.passing && game.trick.plays.length === 0) {
        for (const p of game.players) {
            if (!p.isCPU || p.jarvis || !game.commAllowed(p.seat)) continue;
            const card = chooseCommunication(game, p.seat);
            if (card) return { seat: p.seat, command: { type: 'communicate', card } };
        }
    }
    const seat = game.current;
    if (seat === null || !game.players[seat].isCPU) return null;
    return { seat, command: chooseCommand(game, seat, style) };
}

// CPU の手を進める。考えた手が断られたら、出せる手のどれかを打つ
export function runCpuStep(game, style = 'normal') {
    const next = nextCpuCommand(game, style);
    if (!next) return false;
    if (game.applyCommand(next.seat, next.command)) return true;
    const fallback = legalCommands(game, next.seat)[0];
    return fallback ? game.applyCommand(next.seat, fallback) : false;
}

// その人が今できる操作（手番の操作だけ。通信と遭難信号は含めない）
export function legalCommands(game, seat) {
    if (game.phase === 'end' || game.current !== seat) return [];
    if (game.passing) return game.hands[seat].filter(c => !isRocket(c)).map(card => ({ type: 'passCard', card }));
    if (game.phase === 'play') return game.playable(game.turnSeat()).map(card => ({ type: 'play', card }));
    const step = game.step;
    const others = game.players.map(p => p.seat);
    switch (step.kind) {
        case 'swapTokens':
        case 'moveToken':
        case 'handover':
            return [{ type: 'skip' }];
        case 'silence':
            return others.filter(s => s !== game.commander && !game.players[s].jarvis).map(s => ({ type: 'silence', seat: s }));
        case 'ask':
            return (step.question === 'condition' ? ['good', 'bad'] : step.question === 'role' ? ['middle', 'first', 'last'] : ['yes', 'no']).map(value => ({ type: 'answer', value }));
        case 'choose':
            return others.filter(s => step.purpose !== 'decision' || s !== game.commander).map(s => ({ type: 'choose', seat: s }));
        case 'roles':
            return [{ type: 'roles', first: others[0], last: others[1] }];
        case 'pick':
            return game.tasks.map((t, index) => ({ t, index })).filter(x => x.t.owner === null).map(x => ({ type: 'pickTask', index: x.index }));
        case 'assignTask':
            return others.filter(s => game.canAssign(s)).map(s => ({ type: 'assignTask', seat: s }));
        default:
            return [];
    }
}

// ヒント：seat のおすすめの手（CPU の「ふつう」が選ぶ手番の手）。seat の番でなければ null。通信はすすめない
export function suggest(game, seat) {
    if (game.phase === 'end' || game.current !== seat) return null;
    return chooseCommand(game, seat, 'normal');
}

export function chooseCommand(game, seat, style = 'normal') {
    if (game.passing) return { type: 'passCard', card: choosePass(game, seat) };
    if (game.phase === 'play') return { type: 'play', card: choosePlay(game, seat, CPU_STYLES[style] ?? CPU_STYLES.normal) };
    return choosePrep(game, seat);
}

// ===== 手札の強さ =====

function strength(hand) {
    let s = 0;
    for (const c of hand) {
        if (isRocket(c)) s += 1 + rankOf(c) * 0.25;
        else if (rankOf(c) === 9) s += 1;
        else if (rankOf(c) === 8) s += 0.5;
        else if (rankOf(c) === 7) s += 0.2;
    }
    return s / Math.max(1, hand.length) * 10;
}

// 課題のカードを、その手札の人が取れそうか（大きいほど取りやすい）
export function taskScore(hand, card) {
    const suit = suitOf(card);
    const rank = rankOf(card);
    const rockets = hand.filter(isRocket).length;
    const same = hand.filter(c => suitOf(c) === suit).map(rankOf);
    if (hand.includes(card)) {
        // 自分で持っている：そのカード自身で勝つしかない
        const higherOutside = 9 - rank - same.filter(r => r > rank).length;
        return 1.2 - higherOutside * 0.35 + (same.length >= 4 ? -0.2 : 0) + rockets * 0.05;
    }
    const above = same.filter(r => r > rank);
    if (above.length) return 0.5 + above.length * 0.2 + (Math.max(...above) === 9 ? 0.4 : 0) + (above.length >= 2 ? 0.1 : 0);
    if (same.length === 0) return rockets > 0 ? 0.2 + rockets * 0.25 : -0.2;
    return -0.4 + rockets * 0.1;
}

// ===== 準備 =====

function seatHand(game, seat) {
    return game.players[seat].jarvis ? game.jarvisPiles.map(p => p.up).filter(Boolean) : game.hands[seat];
}

function choosePrep(game, seat) {
    const step = game.step;
    const hand = game.hands[seat];
    const s = strength(hand);
    const rockets = hand.filter(isRocket).length;
    const nines = hand.filter(c => !isRocket(c) && rankOf(c) === 9).length;
    switch (step.kind) {
        case 'swapTokens':
        case 'moveToken':
        case 'handover':
            return { type: 'skip' };
        case 'silence': {
            // 人の通信を残すため、CPU の1人を選ぶ（いなければ指揮官の次の人）
            const cands = game.players.filter(p => p.seat !== game.commander && !p.jarvis);
            const cpu = cands.find(p => p.isCPU) ?? cands[0];
            return { type: 'silence', seat: cpu.seat };
        }
        case 'ask': {
            if (step.question === 'condition') return { type: 'answer', value: s < 2.2 && rockets === 0 ? 'bad' : 'good' };
            if (step.question === 'role') {
                if (s >= 4) return { type: 'answer', value: 'first' };
                if (rockets > 0 || nines > 0) return { type: 'answer', value: 'last' };
                return { type: 'answer', value: 'middle' };
            }
            if (step.question === 'task') {
                const task = game.tasks[step.task];
                return { type: 'answer', value: taskScore(hand, task.card) >= 0.5 ? 'yes' : 'no' };
            }
            // willing：指揮官の決定・ちょうど1トリック・最初と最後
            const purpose = game.steps[0]?.purpose ?? game.mission.special?.kind;
            let yes;
            if (purpose === 'exactlyOne') yes = rockets === 0 && nines >= 1;
            else if (purpose === 'firstAndLast') yes = nines >= 2 && rockets <= 1;
            else yes = s >= 3.5;
            return { type: 'answer', value: yes ? 'yes' : 'no' };
        }
        case 'choose': {
            const answers = game.lastAnswers?.answers ?? [];
            const wanted = step.purpose === 'sick' ? 'bad' : 'yes';
            const volunteer = answers.find(a => a.value === wanted);
            if (volunteer) return { type: 'choose', seat: volunteer.seat };
            if (step.purpose === 'sick' && s < 2.5) return { type: 'choose', seat };
            if (step.purpose === 'exactlyOne' && rockets === 0 && nines >= 1) return { type: 'choose', seat };
            if (step.purpose === 'firstAndLast' && nines >= 2) return { type: 'choose', seat };
            const next = game.players.find(p => p.seat !== game.commander && !p.jarvis) ?? game.players[(seat + 1) % game.n];
            return { type: 'choose', seat: next.seat };
        }
        case 'roles': {
            const answers = game.lastAnswers?.answers ?? [];
            const all = game.players.map(p => p.seat);
            const mine = s >= 4 ? 'first' : rockets > 0 || nines > 0 ? 'last' : 'middle';
            const pool = [...answers, { seat, value: mine }];
            const first = pool.find(a => a.value === 'first')?.seat ?? seat;
            const last = pool.find(a => a.value === 'last' && a.seat !== first)?.seat ?? all.find(x => x !== first);
            return { type: 'roles', first, last };
        }
        case 'pick': {
            const taker = step.turn;
            const hand = seatHand(game, taker);
            let best = null;
            game.tasks.forEach((t, index) => {
                if (t.owner !== null) return;
                const score = taskScore(hand, t.card);
                if (!best || score > best.score) best = { index, score };
            });
            return { type: 'pickTask', index: best.index };
        }
        case 'assignTask': {
            const task = game.tasks[step.task];
            const answers = game.lastAnswers?.answers ?? [];
            const yes = answers.filter(a => a.value === 'yes' && game.canAssign(a.seat)).map(a => a.seat);
            if (taskScore(hand, task.card) >= 0.8 && game.canAssign(seat)) return { type: 'assignTask', seat };
            if (yes.length) {
                const counts = game.players.map(p => game.tasks.filter(t => t.owner === p.seat).length);
                yes.sort((a, b) => counts[a] - counts[b]);
                return { type: 'assignTask', seat: yes[0] };
            }
            const valid = game.players.map(p => p.seat).filter(x => game.canAssign(x));
            const scored = valid.map(x => ({ x, score: x === seat || game.players[x].jarvis ? taskScore(seatHand(game, x), task.card) : 0.3 }));
            scored.sort((a, b) => b.score - a.score);
            return { type: 'assignTask', seat: scored[0].x };
        }
        default:
            return legalCommands(game, seat)[0];
    }
}

// ===== 遭難信号で渡すカード =====

function choosePass(game, seat) {
    const hand = game.hands[seat].filter(c => !isRocket(c));
    const myTasks = game.tasks.filter(t => t.owner === seat && !t.done);
    const value = c => {
        let v = rankOf(c);
        if (myTasks.some(t => t.card === c)) v += 20;
        if (myTasks.some(t => suitOf(t.card) === suitOf(c) && rankOf(c) > rankOf(t.card))) v += 10;
        // ほかの人の課題のカードは、渡して手放したい
        if (game.tasks.some(t => t.card === c && t.owner !== seat)) v -= 5;
        return v;
    };
    return hand.reduce((a, b) => (value(b) < value(a) ? b : a));
}

// ===== 通信 =====

export function chooseCommunication(game, seat) {
    const hand = game.hands[seat];
    const pending = game.tasks.filter(t => !t.done && t.owner !== null);
    if (pending.length === 0) return null;
    // 1. ほかの人の課題のカードを持っている
    for (const t of pending) {
        if (t.owner !== seat && hand.includes(t.card) && commPosition(hand, t.card)) return t.card;
    }
    // 2. 自分の課題の色で、課題のカードより大きい一番上のカードを持っている
    for (const t of pending) {
        if (t.owner !== seat || hand.includes(t.card)) continue;
        const same = hand.filter(c => suitOf(c) === suitOf(t.card));
        if (!same.length) continue;
        const top = same.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
        if (rankOf(top) > rankOf(t.card)) return top;
    }
    return null;
}

// ===== カードを出す =====

function choosePlay(game, actor, style) {
    const seat = game.turnSeat();
    const legal = game.playable(seat);
    if (legal.length === 1) return legal[0];
    const random = cpuRandom(game, actor);
    const samples = Math.max(1, style.samples);
    const totals = new Map(legal.map(c => [c, 0]));
    for (let i = 0; i < samples; i++) {
        const sim = determinize(game, actor, random);
        if (!style.rollout) {
            const pick = policyPlay(sim, seat);
            totals.set(pick, totals.get(pick) + 1);
            continue;
        }
        for (const card of legal) {
            const g = sim.clone();
            g.applyCommand(g.current, { type: 'play', card });
            totals.set(card, totals.get(card) + rollout(g));
        }
        const pick = policyPlay(sim, seat);
        totals.set(pick, totals.get(pick) + 0.05);
    }
    let best = legal[0];
    for (const c of legal) if (totals.get(c) > totals.get(best)) best = c;
    return best;
}

function rollout(g) {
    let guard = 200;
    while (g.phase === 'play' && guard-- > 0) {
        const seat = g.turnSeat();
        g.applyCommand(g.current, { type: 'play', card: policyPlay(g, seat) });
    }
    if (g.result?.success) return 1;
    const tasks = g.tasks.length;
    const progress = tasks ? g.tasks.filter(t => t.done).length / tasks : (g.trickNumber - 1) / g.totalTricks;
    return progress * 0.4;
}

// 見えないカードを、分かっていることに合う形で配り直した写しを作る
export function determinize(game, me, random) {
    const sim = game.clone();
    const known = new Set(game.hands[me]);
    const jarvis = game.players.find(p => p.jarvis);
    if (jarvis) for (const pile of game.jarvisPiles) if (pile.up) known.add(pile.up);
    const played = new Set(game.history.flatMap(h => h.plays.map(p => p.card)));
    for (const p of game.trick.plays) played.add(p.card);
    const unknown = ALL_CARDS.filter(c => !known.has(c) && !played.has(c));
    // 受け取る人と枚数
    const holders = [];
    for (const p of game.players) {
        if (p.seat === me) continue;
        if (p.jarvis) {
            const downs = game.jarvisPiles.filter(x => x.down).length;
            if (downs) holders.push({ seat: p.seat, jarvis: true, count: downs, allow: () => true });
        } else {
            holders.push({ seat: p.seat, count: game.hands[p.seat].length, allow: constraintFor(game, p.seat) });
        }
    }
    const fixed = new Map(); // 通信で分かっているカード
    for (const h of holders) {
        if (h.jarvis) continue;
        const comm = game.comms[h.seat];
        if (comm && !comm.played && unknown.includes(comm.card)) fixed.set(comm.card, h.seat);
    }
    let assignment = null;
    for (let attempt = 0; attempt < 30 && !assignment; attempt++) assignment = tryDeal(unknown, holders, fixed, random, true);
    if (!assignment) assignment = tryDeal(unknown, holders, fixed, random, false);
    for (const h of holders) {
        const cards = assignment.get(h.seat) ?? [];
        if (h.jarvis) {
            let i = 0;
            for (const pile of sim.jarvisPiles) if (pile.down) pile.down = cards[i++];
        } else {
            sim.hands[h.seat] = cards;
        }
    }
    return sim;
}

function tryDeal(unknown, holders, fixed, random, strict) {
    const left = new Map(holders.map(h => [h.seat, h.count]));
    const result = new Map(holders.map(h => [h.seat, []]));
    const rest = [];
    for (const c of unknown) {
        const seat = fixed.get(c);
        if (seat !== undefined && left.get(seat) > 0) {
            result.get(seat).push(c);
            left.set(seat, left.get(seat) - 1);
        } else rest.push(c);
    }
    const cards = shuffle(rest, random);
    const eligible = c => holders.filter(h => left.get(h.seat) > 0 && (!strict || h.allow(c)));
    // 置ける人の少ないカードから
    cards.sort((a, b) => eligible(a).length - eligible(b).length);
    for (const c of cards) {
        const options = eligible(c);
        if (!options.length) {
            if (strict) return null;
            continue;
        }
        const h = options[Math.floor(random() * options.length)];
        result.get(h.seat).push(c);
        left.set(h.seat, left.get(h.seat) - 1);
    }
    return result;
}

// その人の手札に入りうるカードか（色がないこと・通信の位置）
function constraintFor(game, seat) {
    const voids = new Set();
    const afterSteal = game.mission.special?.kind === 'stealAfterFirst';
    const tricks = [...game.history.map(h => ({ number: h.number, plays: h.plays })), { number: game.trickNumber, plays: game.trick.plays }];
    for (const t of tricks) {
        if (afterSteal && t.number < 2) continue;
        if (!t.plays.length) continue;
        const led = suitOf(t.plays[0].card);
        for (const p of t.plays) if (p.seat === seat && suitOf(p.card) !== led) voids.add(led);
    }
    const comm = game.comms[seat];
    const stale = afterSteal && game.trickNumber > 1;
    return c => {
        if (voids.has(suitOf(c))) return false;
        if (comm && !stale && !comm.hidden && suitOf(c) === suitOf(comm.card) && c !== comm.card) {
            if (comm.position === 'single') return false;
            // 通信のあとに出したカードは、その時点で手札にあった。今の手札だけに当てはめる
            if (comm.position === 'top' && rankOf(c) > rankOf(comm.card)) return false;
            if (comm.position === 'bottom' && rankOf(c) < rankOf(comm.card)) return false;
        }
        return true;
    };
}

// ===== 全部見えている前提の、1手の方針 =====

// 課題を今果たしてよいか（順番のトークン）
function taskReady(g, task, alsoDone = 0) {
    const token = task.token;
    if (!token) return true;
    const pendingOthers = g.tasks.filter(t => !t.done && t !== task);
    if (/^\d$/.test(token)) return Number(token) === g.doneCount + 1 + alsoDone || (Number(token) > g.doneCount && Number(token) <= g.doneCount + 1 + alsoDone);
    if (token === 'omega') return pendingOthers.length === alsoDone;
    const rank = token.length;
    return !pendingOthers.some(t => t.token && t.token.startsWith('>') && t.token.length < rank);
}

// このトリックで勝ってよい人の集まり（null は誰でもよい）
function allowedWinners(g, cards) {
    let allowed = null;
    const restrict = set => {
        allowed = allowed ? new Set([...allowed].filter(x => set.has(x))) : set;
    };
    for (const c of cards) {
        const t = g.tasks.find(x => x.card === c && !x.done);
        if (t) restrict(new Set([t.owner]));
    }
    const special = g.mission.special;
    if (!special) return allowed;
    const all = g.players.map(p => p.seat);
    const trick = g.trickNumber;
    const last = trick >= g.totalTricks;
    const without = (...xs) => new Set(all.filter(s => !xs.includes(s)));
    switch (special.kind) {
        case 'sick': restrict(without(g.chosen)); break;
        case 'exactlyOne': if (g.tricksWon[g.chosen] >= 1) restrict(without(g.chosen)); break;
        case 'firstAndLast': restrict(trick === 1 || last ? new Set([g.chosen]) : without(g.chosen)); break;
        case 'balance': {
            const ok = all.filter(s => {
                const counts = [...g.tricksWon];
                counts[s]++;
                return Math.max(...counts) - Math.min(...counts) < 2;
            });
            restrict(new Set(ok));
            if (special.commanderFirstLast && (trick === 1 || last)) restrict(new Set([g.commander]));
            break;
        }
        case 'roles': {
            const { first, last: lastSeat } = g.roles;
            if (trick <= 4) restrict(new Set([first]));
            else if (last) restrict(new Set([lastSeat]));
            else restrict(without(first, lastSeat));
            break;
        }
        case 'pinkLeftOfNine':
            if (cards.some(c => suitOf(c) === 'pink')) restrict(new Set([g.chosen]));
            break;
        default:
    }
    return allowed;
}

// トリックの終わりの評価（失敗なら大きく負）
function verdict(g, plays) {
    const win = trickWinner(plays);
    const cards = plays.map(p => p.card);
    const allowed = allowedWinners(g, cards);
    if (allowed && !allowed.has(win.seat)) return -100;
    let score = 0;
    const group = g.tasks.filter(t => !t.done && cards.includes(t.card));
    for (const t of group) {
        if (!taskReady(g, t, group.length - 1)) return -100;
        score += 10;
    }
    // 後の数字のトークンを越えてしまう
    if (group.length) {
        const after = g.doneCount + group.length;
        if (g.tasks.some(t => !t.done && !group.includes(t) && /^\d$/.test(t.token ?? '') && Number(t.token) <= after)) return -100;
    }
    const special = g.mission.special;
    const wc = win.card;
    if (special) {
        switch (special.kind) {
            case 'noNines': if (!isRocket(wc) && rankOf(wc) === 9) return -100; break;
            case 'winWithOnes': if (!isRocket(wc) && rankOf(wc) === 1) score += 20; break;
            case 'rocketsWin': {
                for (const p of plays) {
                    if (!isRocket(p.card)) continue;
                    if (p !== win) return -100;
                    if (special.ordered && rankOf(p.card) !== g.specialState.rockets.length + 1) return -100;
                    score += 20;
                }
                break;
            }
            case 'exactlyOne':
                if (win.seat === g.chosen && isRocket(wc)) return -100;
                if (win.seat === g.chosen) score += 10;
                break;
            case 'firstAndLast': if (win.seat === g.chosen && isRocket(wc)) return -100; break;
            case 'omegaLastTrick':
                if (group.some(t => t.token === 'omega') && g.trickNumber < g.totalTricks) return -100;
                break;
            default:
        }
    }
    return score;
}

// 残りの人の動きを見積もる：勝つべき人は勝ちに行き、それ以外は勝たないようにし、持ち主が勝っていれば課題のカードを捨てる
function resolve(g, plays) {
    const n = g.n;
    const result = [...plays];
    const leader = g.trick.leader;
    for (let i = result.length; i < n; i++) {
        const seat = (leader + i) % n;
        const hand = seatHand(g, seat);
        const led = suitOf(result[0].card);
        const follow = hand.filter(c => suitOf(c) === led);
        const legal = follow.length ? follow : hand;
        if (!legal.length) break;
        const win = trickWinner(result);
        const allowed = allowedWinners(g, result.map(p => p.card));
        const winnerOk = !allowed || allowed.has(win.seat);
        const nonBeating = legal.filter(c => !beats(c, win.card, led));
        const beating = legal.filter(c => beats(c, win.card, led));
        let pick = null;
        if (winnerOk) {
            // 勝っている人の課題のカードを捨てる
            pick = nonBeating.find(c => {
                const t = g.tasks.find(x => x.card === c && !x.done);
                return t && t.owner === win.seat && taskReady(g, t);
            }) ?? null;
        }
        if (!pick && !winnerOk && beating.length) {
            const cards = result.map(p => p.card);
            pick = lowest(beating.filter(c => {
                const a = allowedWinners(g, [...cards, c]);
                return !a || a.has(seat);
            })) ?? null;
        }
        if (!pick) {
            const safe = nonBeating.filter(c => !isOthersTask(g, c, seat));
            pick = highestNonRocket(safe) ?? lowest(nonBeating) ?? lowest(legal.filter(c => !isOthersTask(g, c, seat))) ?? lowest(legal);
        }
        result.push({ seat, card: pick });
    }
    return result;
}

function isOthersTask(g, card, seat) {
    const t = g.tasks.find(x => x.card === card && !x.done);
    return !!t && t.owner !== seat;
}

function lowest(cards) {
    if (!cards.length) return null;
    return cards.reduce((a, b) => (cardPower(b) < cardPower(a) ? b : a));
}

function highestNonRocket(cards) {
    const xs = cards.filter(c => !isRocket(c));
    if (!xs.length) return null;
    return xs.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
}

const cardPower = c => (isRocket(c) ? 10 + rankOf(c) : rankOf(c));

// 全部見えている前提で、1枚を選ぶ（読みの中で、全員がこれで動く）
export function policyPlay(g, seat) {
    const legal = g.playable(seat);
    if (legal.length === 1) return legal[0];
    const myPending = g.tasks.filter(t => !t.done && t.owner === seat);
    let best = null;
    for (const card of legal) {
        const plays = [...g.trick.plays, { seat, card }];
        const full = resolve(g, plays);
        let score = verdict(g, full);
        const win = trickWinner(full);
        // カードの温存：ロケットと、自分の課題の色の大きいカードは残す
        if (isRocket(card)) score -= 1.5 + rankOf(card) * 0.3;
        else if (myPending.some(t => suitOf(t.card) === suitOf(card) && rankOf(card) > rankOf(t.card) && !full.some(p => p.card === t.card))) score -= 1 + rankOf(card) * 0.1;
        // 勝たないときは大きいカードを手放し、先に出すときは小さいカード
        if (win.seat !== seat) score += rankOf(card) * 0.03;
        else score -= rankOf(card) * 0.02;
        // ほかの人の課題のカードを、まだ持ち主が取れないうちに出さない
        if (isOthersTask(g, card, seat) && !full.some(p => p.seat !== seat && p === win && g.tasks.find(t => t.card === card)?.owner === p.seat)) score -= 2;
        if (!best || score > best.score) best = { card, score };
    }
    return best.card;
}

export const CPU_HELP = [
    'CPU は、見えている情報（自分の手札・場・通信・出されたカード）だけで考えます。ほかの人の手札はのぞきません',
    '課題を選ぶとき：その色の大きいカードやロケットを持っていて、自分で取れそうな課題を選びます',
    '通信：ほかの人の課題のカードを持っているとき、自分の課題の色で一番大きいカードを持っているときに伝えます',
    'あなたの通信を読みます：「一番上」ならそれより大きいカードはない、「唯一」ならその色はそれだけ、「一番下」ならそれより小さいカードはない、と考えます。色を出せなかった人はその色を持っていない、とも考えます',
    'カードを出すとき：見えないカードの配り方を何通りか想像し、出せるカードごとに、全員が課題のカードを持ち主に取らせるよう協力したとして最後まで進め、成功しやすいカードを選びます',
    '課題の持ち主が勝っているトリックには、その人の課題のカードを捨てます。持ち主でない人が勝つトリックには、課題のカードを出しません'
];

export { SUITS };
