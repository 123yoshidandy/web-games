/**
 * サントリーニのルールの中身（DOM に依存しない。CPU の先読みでも使う）
 *
 * 盤は 5×5。マスは番号 c = y * 5 + x
 * 各マスに、ブロックの段（height 0〜3）とドームの有無（dome）を持つ
 * 手番は1段ずつの操作（ステップ）で進める：
 *   place { to }            職人を置く（始める前に、各自2人ずつ）
 *   move { from, to }       職人を1マス動かす
 *   build { by, at, dome? } 職人 by の隣の at に建てる（dome: true はアトラスのドーム）
 *   end                     任意の追加の操作をせずに番を終える（デメテル・ヘファイストス）
 * 神の力の任意の操作は、次に必要な操作と一緒に選べるようにする（アルテミスの2回目の移動は、建てる操作と並べる、など）
 * 置く職人がなくなったら、最初の手番の人から番を始める
 */

export const N = 5;
export const CELLS = N * N;
export const GODS = ['apollo', 'artemis', 'athena', 'atlas', 'demeter', 'hephaestus', 'hermes', 'minotaur', 'pan', 'prometheus'];
// 段ごとのブロックの数（1段・2段・3段・ドーム）
export const SUPPLY = [0, 22, 18, 14, 18];
export const WORKERS = 2;

export const xOf = (c) => c % N;
export const yOf = (c) => Math.floor(c / N);
export const cellOf = (x, y) => y * N + x;

export const NEIGHBORS = Array.from({ length: CELLS }, (_, c) => {
    const list = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const x = xOf(c) + dx;
            const y = yOf(c) + dy;
            if (x >= 0 && y >= 0 && x < N && y < N) list.push(cellOf(x, y));
        }
    }
    return list;
});

const newTurn = () => ({ worker: null, start: null, moves: 0, movedUp: false, builds: 0, buildAt: null, builder: null, prebuilt: false, hermes: false });

// players: 2 か 3、first: 最初の手番の席、gods: 席ごとの神（なしは null）
export function createState({ players = 2, first = 0, gods = null } = {}) {
    if (players !== 2 && players !== 3) throw new Error('2人か3人で遊びます');
    return {
        players,
        first,
        gods: gods ? gods.slice() : Array(players).fill(null),
        height: Array(CELLS).fill(0),
        dome: Array(CELLS).fill(false),
        workers: Array.from({ length: players }, () => []),
        alive: Array(players).fill(true),
        current: first,
        phase: 'place',
        turn: newTurn(),
        supply: SUPPLY.slice(),
        athena: Array(players).fill(false),   // アテナの職人が前の番に上ったか
        result: null                          // { winner, reason: 'climb' | 'pan' | 'stuck' }
    };
}

export function cloneState(s) {
    return {
        ...s,
        gods: s.gods,
        height: s.height.slice(),
        dome: s.dome.slice(),
        workers: s.workers.map(w => w.slice()),
        alive: s.alive.slice(),
        turn: { ...s.turn },
        supply: s.supply.slice(),
        athena: s.athena.slice(),
        result: s.result ? { ...s.result } : null
    };
}

// c にいる職人の持ち主（いなければ -1）
export function ownerAt(s, c) {
    for (let p = 0; p < s.workers.length; p++) if (s.workers[p].includes(c)) return p;
    return -1;
}

// 自分以外のアテナが、前の番に上っていれば、上れない
const upBlocked = (s, seat) => s.gods.some((g, p) => p !== seat && g === 'athena' && s.alive[p] && s.athena[p]);

// 職人を動かす操作。opts: sameLevel（ヘルメス）・noUp（プロメテウス）・exclude（アルテミスの元のマス）
function moveSteps(s, seat, from, opts = {}) {
    const god = s.gods[seat];
    const noUp = opts.noUp || upBlocked(s, seat);
    const list = [];
    for (const w of from) {
        const h = s.height[w];
        for (const n of NEIGHBORS[w]) {
            if (s.dome[n] || n === opts.exclude) continue;
            const dh = s.height[n] - h;
            if (dh > 1 || (dh > 0 && noUp) || (opts.sameLevel && dh !== 0)) continue;
            const owner = ownerAt(s, n);
            if (owner === seat) continue;
            if (owner >= 0) {
                if (god === 'apollo') {
                    list.push({ type: 'move', from: w, to: n });
                } else if (god === 'minotaur') {
                    const bx = 2 * xOf(n) - xOf(w);
                    const by = 2 * yOf(n) - yOf(w);
                    if (bx < 0 || by < 0 || bx >= N || by >= N) continue;
                    const b = cellOf(bx, by);
                    if (!s.dome[b] && ownerAt(s, b) < 0) list.push({ type: 'move', from: w, to: n });
                }
                continue;
            }
            list.push({ type: 'move', from: w, to: n });
        }
    }
    return list;
}

// 建てる操作。opts: only（ヘファイストスの同じマス、ドームなし）・exclude（デメテルの1回目のマス）
function buildSteps(s, seat, by, opts = {}) {
    const atlas = s.gods[seat] === 'atlas';
    const list = [];
    for (const w of by) {
        for (const n of NEIGHBORS[w]) {
            if (s.dome[n] || n === opts.exclude || (opts.only !== undefined && n !== opts.only)) continue;
            if (ownerAt(s, n) >= 0) continue;
            const h = s.height[n];
            if (h < 3) {
                if (s.supply[h + 1] > 0) list.push({ type: 'build', by: w, at: n });
                if (atlas && !opts.noDome && s.supply[4] > 0) list.push({ type: 'build', by: w, at: n, dome: true });
            } else if (!opts.noDome && s.supply[4] > 0) {
                list.push({ type: 'build', by: w, at: n });
            }
        }
    }
    return list;
}

// 今の手番の人が選べる操作
export function legalSteps(s) {
    if (s.result) return [];
    const seat = s.current;
    const mine = s.workers[seat];
    if (s.phase === 'place') {
        const list = [];
        for (let c = 0; c < CELLS; c++) if (ownerAt(s, c) < 0) list.push({ type: 'place', to: c });
        return list;
    }
    const god = s.gods[seat];
    const t = s.turn;
    if (t.moves === 0 && t.builds === 0 && !t.prebuilt) {
        const list = moveSteps(s, seat, mine);
        // プロメテウス：動く前に建てられる。ヘルメス：1歩も動かずに建てられる
        if (god === 'prometheus' || god === 'hermes') list.push(...buildSteps(s, seat, mine));
        return list;
    }
    if (t.prebuilt && t.moves === 0) return moveSteps(s, seat, [t.worker], { noUp: true });
    if (t.builds === 0) {
        if (t.hermes) return [...buildSteps(s, seat, mine), ...moveSteps(s, seat, mine, { sameLevel: true })];
        const list = buildSteps(s, seat, [t.worker]);
        if (god === 'artemis' && t.moves === 1) list.push(...moveSteps(s, seat, [t.worker], { exclude: t.start }));
        return list;
    }
    if (t.builds === 1 && t.moves > 0) {
        if (god === 'demeter') return [...buildSteps(s, seat, [t.builder], { exclude: t.buildAt }), { type: 'end' }];
        if (god === 'hephaestus' && s.height[t.buildAt] <= 2 && !s.dome[t.buildAt]) {
            return [...buildSteps(s, seat, [t.builder], { only: t.buildAt, noDome: true }), { type: 'end' }];
        }
    }
    return [];
}

export const stepKey = (a) => a.type === 'place' ? `place:${a.to}`
    : a.type === 'move' ? `move:${a.from}>${a.to}`
    : a.type === 'build' ? `build:${a.by}>${a.at}${a.dome ? ':dome' : ''}`
    : a.type;

const aliveCount = (s) => s.alive.filter(Boolean).length;

function nextAlive(s, seat) {
    for (let i = 1; i <= s.players; i++) {
        const q = (seat + i) % s.players;
        if (s.alive[q]) return q;
    }
    return seat;
}

// 負けた人を外す。2人なら相手の勝ち、3人なら職人を盤から取り除き、残りが1人になったらその人の勝ち
function eliminate(s, seat) {
    s.alive[seat] = false;
    s.workers[seat] = [];
    s.athena[seat] = false;
    if (aliveCount(s) === 1) {
        s.result = { winner: s.alive.indexOf(true), reason: 'stuck' };
        return;
    }
    s.current = nextAlive(s, seat);
    s.turn = newTurn();
    startTurn(s);
}

// 番の始めに、動ける手がなければ負け
function startTurn(s) {
    if (s.result) return;
    if (legalSteps(s).length === 0) eliminate(s, s.current);
}

function endTurn(s) {
    const seat = s.current;
    if (s.gods[seat] === 'athena') s.athena[seat] = s.turn.movedUp;
    s.turn = newTurn();
    s.current = nextAlive(s, seat);
    startTurn(s);
}

// 操作を当てた新しい状態を返す（元の状態は変えない）。操作が通るかは確かめない（legalSteps で確かめてから呼ぶ）
export function applyStep(state, step) {
    const s = cloneState(state);
    const seat = s.current;
    const god = s.gods[seat];
    const t = s.turn;
    if (step.type === 'place') {
        s.workers[seat].push(step.to);
        if (s.workers[seat].length === WORKERS) {
            const next = nextAlive(s, seat);
            if (next === s.first) {
                s.phase = 'turn';
                s.current = s.first;
                startTurn(s);
            } else {
                s.current = next;
            }
        }
        return s;
    }
    if (step.type === 'move') {
        const { from, to } = step;
        const owner = ownerAt(s, to);
        if (owner >= 0 && owner !== seat) {
            const list = s.workers[owner];
            const i = list.indexOf(to);
            // アポロン：相手を元のマスへ。ミノタウロス：相手をまっすぐ後ろへ押す（押された駒は「動いた」とはみなさない）
            list[i] = god === 'apollo' ? from : cellOf(2 * xOf(to) - xOf(from), 2 * yOf(to) - yOf(from));
        }
        const mine = s.workers[seat];
        mine[mine.indexOf(from)] = to;
        const dh = s.height[to] - s.height[from];
        if (dh > 0) t.movedUp = true;
        if (t.moves === 0 && !t.prebuilt) t.start = from;
        if (god === 'hermes' && dh === 0 && (t.moves === 0 || t.hermes)) t.hermes = true;
        t.moves++;
        t.worker = to;
        // 自分の番に3段目へ上ったら勝ち。パンは2段以上下りても勝ち
        if (dh > 0 && s.height[to] === 3) s.result = { winner: seat, reason: 'climb' };
        else if (god === 'pan' && dh <= -2) s.result = { winner: seat, reason: 'pan' };
        else if (legalSteps(s).length === 0) eliminate(s, seat); // 動いたあとに建てられなければ負け
        return s;
    }
    if (step.type === 'build') {
        const { at } = step;
        if (step.dome || s.height[at] === 3) {
            s.dome[at] = true;
            s.supply[4]--;
        } else {
            s.height[at]++;
            s.supply[s.height[at]]--;
        }
        if (t.moves === 0 && god === 'prometheus' && !t.prebuilt) {
            t.prebuilt = true;
            t.worker = step.by;
            if (legalSteps(s).length === 0) eliminate(s, seat);
            return s;
        }
        t.builds++;
        t.buildAt = at;
        t.builder = step.by;
        const rest = legalSteps(s);
        if (rest.length === 0 || (rest.length === 1 && rest[0].type === 'end')) endTurn(s);
        return s;
    }
    if (step.type === 'end') endTurn(s);
    return s;
}

// 職人の段（勝ちに近いか）などを見るための道具
export const workerHeights = (s, seat) => s.workers[seat].map(c => s.height[c]);
