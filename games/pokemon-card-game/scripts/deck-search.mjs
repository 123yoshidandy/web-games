/**
 * 最強のデッキの探索：CPU 同士の対戦で勝率を測り、デッキの中身を少しずつ変えて、勝率の上がるデッキをさがす
 * 結果は public/data/best-decks.json（ゲームの「最強のデッキ」の画面が読む）。前の結果から続けるので、走らせるたびに良くなる
 *
 * 使い方: node scripts/deck-search.mjs [--minutes 分] [--with カードID] [--seed シード] [--rounds 回数] [--workers 数]
 *   --minutes   探索にかける時間（既定 3 分）。最後の測り直しの時間も含む
 *   --with      このカードを軸にしたデッキだけをさがす（デッキの型の一覧にない軸なら、新しい型として足す）
 *   --seed      乱数の種（省くと、前の結果の回数 + 1）。同じ種・同じ前の結果・同じ --rounds なら、同じ結果になる
 *   --rounds    型ごとの探索の回数の上限（時間でなく回数で止める。テストと、結果を再現するとき）
 *   --workers   対戦を並べて流す数（既定は CPU の数 - 1。0 なら並べない）。数を変えても結果は同じ
 *   --final-games  最後の総当たりの、1組あたりの試合数（偶数。省くと残りの時間から決める）
 *   --out       書き出すファイル（既定 public/data/best-decks.json）
 *
 * しくみ
 *   ・相手（ガントレット）：構築済みデッキすべてと、ほかの型の今いちばんのデッキ
 *   ・1回の探索：今のデッキ（現役）を少し変えた候補を CANDIDATES 個作り、同じシードの試合で現役と比べる（試合の運をそろえる）。
 *     現役より勝った候補は、別のシードで追加の試合をして、追加の試合だけでも、合わせても勝っていれば入れ替える
 *   ・変え方：1〜3枚を、ほかのカードと入れ替える（構築の決まりを守り、進化元のない進化ポケモンを増やさない。軸のカードは2枚以上残す）
 *   ・最後に、構築済みデッキと各型のいちばんのデッキで総当たりをして、勝率（と95%の信頼区間）を測り直す
 *     構築済みデッキより勝率が低かった型は、構築済みデッキに戻す
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { DECKS, expandDeck } from '../public/js/decks.js';
import { CARDS, resolveCardId, isBasicEnergy, isBasicPokemon } from '../public/js/card-data.js';
import { validateDeck } from '../public/js/deck-rules.js';
import { isStandardLegal } from '../public/js/regulation.js';
import { createRandom } from '../public/js/random.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
export const DEFAULT_OUT = path.join(ROOT, 'public', 'data', 'best-decks.json');
export const FORMAT_VERSION = 1;

// 時間の安全弁を外す（負荷で先読みが打ち切られて、手が変わらないように）
globalThis.CPU_TIME_BUDGET = Infinity;

const MAX_STEPS = 5000;     // 1試合の操作の上限（超えたら「進まなくなった」として引き分けに数える）
const CANDIDATES = 3;       // 1回の探索で作る候補の数
const SCREEN_GAMES = 2;     // 候補を比べる試合の数（相手1つあたり。先後を入れ替える）
const CONFIRM_GAMES = 4;    // 現役に勝った候補の、追加の試合の数（相手1つあたり）
const KEY_MIN = 2;          // 軸のカードは、この枚数より減らさない
const FINAL_SHARE = 0.25;   // 時間のうち、最後の総当たりに残す割合
const MAX_FINAL_GAMES = 10; // 最後の総当たりの、1組あたりの試合数の上限

// デッキの型：構築済みデッキと、その軸のカード（--with で、ほかの軸の型も足せる）
export const ARCHETYPES = [
    { id: 'dragapult', key: 'SV6-120' },     // ドラパルトex
    { id: 'mega-lucario', key: 'M1L-092' },  // メガルカリオex
    { id: 'bakegakure', key: 'M5-088' },     // ダダリン
    { id: 'n-zoroark', key: 'SV9-061' },     // Nのゾロアークex
    { id: 'ogerpon', key: 'SV6-131' },       // オーガポン みどりのめんex
    { id: 'alakazam', key: 'M1S-071' },      // フーディン
    { id: 'festival', key: 'SV6-103' },      // カミッチュ
    { id: 'slowking', key: 'SV7-039' },      // ヤドキング
    { id: 'excadrill', key: 'M5-101' },      // メガドリュウズex
    { id: 'garchomp', key: 'SV-P-255' }      // シロナのガブリアスex
].map(item => ({ ...item, key: resolveCardId(item.key), base: item.id }));

// ===== 乱数・統計 =====

// いくつかの整数から、32ビットのシードを作る（同じ並びなら同じ値）
export function mixSeed(...parts) {
    let h = 0x811C9DC5;
    for (const part of parts.map(String).join('|')) {
        h ^= part.charCodeAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85EBCA6B) >>> 0;
    h ^= h >>> 13;
    return h >>> 0;
}

// 勝率の95%の信頼区間（Wilson）
export function wilson(wins, games) {
    if (!games) return [0, 1];
    const z = 1.96;
    const p = wins / games;
    const center = (p + z * z / (2 * games)) / (1 + z * z / games);
    const half = (z * Math.sqrt(p * (1 - p) / games + z * z / (4 * games * games))) / (1 + z * z / games);
    return [Math.max(0, center - half), Math.min(1, center + half)];
}

const round3 = value => Math.round(value * 1000) / 1000;

// ===== デッキ =====

const sortCards = cards => Object.fromEntries(Object.entries(cards).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
export const deckKey = cards => JSON.stringify(sortCards(cards));
const presetOf = id => DECKS.find(deck => deck.id === id);

// 進化元がデッキにない進化ポケモンの種類の数（構築済みデッキにもあるので、0 にはせず、増やさないようにだけする）
export function orphanCount(cards) {
    const names = new Set(Object.keys(cards).map(id => CARDS[id]).filter(card => card.kind === 'pokemon').map(card => card.name));
    return Object.keys(cards).filter(id => {
        const card = CARDS[id];
        return card.kind === 'pokemon' && card.evolvesFrom && !names.has(card.evolvesFrom);
    }).length;
}

// 構築の決まりに合うか（だめなら理由）
export function deckIssue(cards) {
    return validateDeck(expandDeck({ cards }));
}

// 入れられるカード：構築済みデッキに入っているカードすべてと基本エネルギー、軸のカードの進化のライン
export function buildPool(extra = []) {
    const ids = new Set(DECKS.flatMap(deck => Object.keys(deck.cards)));
    Object.values(CARDS).filter(card => isBasicEnergy(card)).forEach(card => ids.add(card.id));
    extra.forEach(id => ids.add(id));
    return [...ids].filter(id => CARDS[id] && isStandardLegal(CARDS[id]) && CARDS[id].supported).sort();
}

// 進化のライン（そのカードと、進化元を名前でたどった先。同じ名前のカードは、入れられるカードの中で番号の若いもの）
export function evolutionLine(id) {
    const line = [id];
    const seen = new Set([CARDS[id].name]);
    let from = CARDS[id].evolvesFrom;
    while (from && !seen.has(from)) {
        seen.add(from);
        const pre = Object.values(CARDS)
            .filter(card => card.kind === 'pokemon' && card.name === from && isStandardLegal(card) && card.supported)
            .sort((a, b) => a.id.localeCompare(b.id))[0];
        if (!pre) break;
        line.unshift(pre.id);
        from = pre.evolvesFrom;
    }
    return line;
}

// 1枚を入れ替える。決まりに合わない・進化元のない進化ポケモンが増える・軸のカードが減りすぎるなら null
function swapOne(cards, random, pool, key) {
    const entries = Object.entries(cards);
    const total = entries.reduce((sum, [, n]) => sum + n, 0);
    let pick = random() * total;
    const [out] = entries.find(([, n]) => (pick -= n) < 0) ?? entries[entries.length - 1];
    // 半分は、もう入っているカードの枚数を変える。残りは、入れられるカードから
    const inDeck = Object.keys(cards);
    const source = random() < 0.5 ? inDeck : pool;
    const add = source[Math.floor(random() * source.length)];
    if (add === out) return null;
    const next = { ...cards, [add]: (cards[add] ?? 0) + 1, [out]: cards[out] - 1 };
    if (next[out] === 0) delete next[out];
    if (key && (next[key] ?? 0) < Math.min(KEY_MIN, cards[key] ?? 0)) return null;
    if (deckIssue(next)) return null;
    if (orphanCount(next) > orphanCount(cards)) return null;
    return next;
}

// デッキを少し変える（1〜3枚の入れ替え）。必ず決まりに合うデッキを返す（変えられなければ元のまま）
export function mutateDeck(cards, random, { pool, key = null } = {}) {
    const swaps = 1 + (random() < 0.4 ? 1 : 0) + (random() < 0.15 ? 1 : 0);
    let current = cards;
    for (let i = 0; i < swaps; i++) {
        for (let tries = 0; tries < 100; tries++) {
            const next = swapOne(current, random, pool, key);
            if (next) {
                current = next;
                break;
            }
        }
    }
    return sortCards(current);
}

// 軸のカードのデッキの元：その軸の構築済みデッキ。なければ、同じタイプの構築済みデッキに、軸の進化のラインを入れる
export function seedDeckFor(key) {
    const own = DECKS.find(deck => deck.cards[key]);
    if (own) return { base: own.id, cards: sortCards(own.cards) };
    const card = CARDS[key];
    const base = DECKS.find(deck => deck.type === card.type) ?? DECKS[0];
    const line = evolutionLine(key);
    const cards = { ...base.cards };
    // 元のデッキの軸のラインを抜き、軸のラインを入れる（たね4・1進化3・2進化3。軸が ex なら3）
    const baseKey = ARCHETYPES.find(item => item.base === base.id)?.key;
    if (baseKey) evolutionLine(baseKey).forEach(id => { delete cards[id]; });
    line.forEach((id, index) => { cards[id] = (cards[id] ?? 0) + (index === 0 && line.length > 1 ? 4 : 3); });
    // 60枚にそろえる（多ければ、枚数の多いグッズ・サポートから減らし、少なければ基本エネルギーを足す）
    const total = () => Object.values(cards).reduce((sum, n) => sum + n, 0);
    while (total() > 60) {
        const [id] = Object.entries(cards)
            .filter(([cid]) => !line.includes(cid) && !isBasicEnergy(CARDS[cid]) && CARDS[cid].kind === 'trainer')
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        cards[id]--;
        if (!cards[id]) delete cards[id];
    }
    const energy = card.type === 'colorless' ? 'basic-psychic-energy' : `basic-${card.type}-energy`;
    if (total() < 60) cards[CARDS[energy] ? energy : 'basic-psychic-energy'] = (cards[energy] ?? 0) + 60 - total();
    const issue = deckIssue(cards);
    if (issue) throw new Error(`${card.name} のデッキを作れません（${issue}）`);
    return { base: base.id, cards: sortCards(cards) };
}

// 目立つポケモン：軸のカードと、枚数の多い順のポケモン（同じ名前は1つ。進化の段階の高いほう）を3つまで
export function keyPokemon(cards, key) {
    const list = Object.entries(cards)
        .filter(([id]) => CARDS[id].kind === 'pokemon')
        .sort((a, b) => b[1] - a[1] || CARDS[b[0]].stage - CARDS[a[0]].stage || a[0].localeCompare(b[0]))
        .map(([id]) => id);
    const result = key && cards[key] ? [key] : [];
    const lineNames = new Set(key ? evolutionLine(key).map(id => CARDS[id].name) : []);
    for (const id of list) {
        if (result.length >= 3) break;
        if (lineNames.has(CARDS[id].name) || result.some(other => CARDS[other].name === CARDS[id].name)) continue;
        result.push(id);
    }
    return result;
}

// ===== 対戦 =====

// 1試合。0 か 1（勝った席）、'draw'、決着しなければ null
export function playGame(cardsA, cardsB, seed) {
    const players = [{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }];
    const game = new Game(players, { seed, decks: [expandDeck({ cards: cardsA }), expandDeck({ cards: cardsB })] });
    game.setup();
    for (let steps = 0; game.phase !== 'end' && steps < MAX_STEPS; steps++) {
        if (!runCpuStep(game)) break;
    }
    if (game.phase !== 'end') return null;
    return game.winner;
}

// 対戦の一覧（{ a, b, seed }）を流して、a から見た点（勝ち 1・引き分けと決着しない 0.5・負け 0）の一覧を返す
function runTaskInline(task) {
    const winner = playGame(task.a, task.b, task.seed);
    if (winner === null) return { score: 0.5, stuck: true };
    if (winner === 'draw') return { score: 0.5, stuck: false };
    return { score: winner === 0 ? 1 : 0, stuck: false };
}

export function createRunner(workers = 0) {
    if (workers <= 0) {
        return { run: async tasks => tasks.map(runTaskInline), close: async () => {} };
    }
    const pool = Array.from({ length: workers }, () => new Worker(fileURLToPath(import.meta.url)));
    return {
        run(tasks) {
            return new Promise((resolve, reject) => {
                const results = new Array(tasks.length);
                let next = 0;
                let done = 0;
                if (!tasks.length) return resolve(results);
                const feed = worker => {
                    if (next >= tasks.length) return;
                    const index = next++;
                    worker.once('message', message => {
                        results[index] = message;
                        done++;
                        if (done === tasks.length) resolve(results);
                        else feed(worker);
                    });
                    worker.postMessage(tasks[index]);
                };
                pool.forEach(worker => {
                    worker.removeAllListeners('error');
                    worker.once('error', reject);
                    feed(worker);
                });
            });
        },
        close: () => Promise.all(pool.map(worker => worker.terminate()))
    };
}

// デッキを相手の一覧と戦わせる試合（相手1つあたり games 試合。先後を交互に入れ替える）
function matchTasks(cards, opponents, games, seedParts) {
    return opponents.flatMap(opponent => Array.from({ length: games }, (_, k) => {
        const seed = mixSeed(...seedParts, opponent.id, k);
        return k % 2 === 0 ? { a: cards, b: opponent.cards, seed, flip: false } : { a: opponent.cards, b: cards, seed, flip: true };
    }));
}

// デッキの勝率を測る（同じシードなら同じ結果）
export async function evaluateDeck(cards, opponents, { games, seedParts, runner }) {
    const tasks = matchTasks(cards, opponents, games, seedParts);
    const results = await runner.run(tasks.map(({ a, b, seed }) => ({ a, b, seed })));
    let wins = 0;
    let stuck = 0;
    results.forEach((result, index) => {
        wins += tasks[index].flip ? 1 - result.score : result.score;
        if (result.stuck) stuck++;
    });
    return { wins, games: results.length, stuck };
}

// ===== 探索 =====

function engineVersion() {
    const hash = createHash('sha256');
    const js = path.join(ROOT, 'public', 'js');
    const files = ['game.js', 'cpu-player.js', 'card-data.js', 'decks.js', 'deck-rules.js', 'regulation.js', 'random.js'].map(file => path.join(js, file));
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
    files.push(...walk(path.join(js, 'cards')).filter(file => file.endsWith('.js')).sort());
    files.forEach(file => hash.update(readFileSync(file)));
    return hash.digest('hex').slice(0, 12);
}

export function loadPrevious(file) {
    if (!file || !existsSync(file)) return null;
    try {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        return data?.version === FORMAT_VERSION ? data : null;
    } catch {
        return null;
    }
}

// 前の結果のデッキを読む（カードのIDを今のIDに読み替え、決まりに合わなければ捨てる）
function restoreCards(saved) {
    if (!saved || typeof saved !== 'object') return null;
    const cards = {};
    for (const [id, n] of Object.entries(saved)) {
        const current = resolveCardId(id);
        if (!CARDS[current] || !Number.isInteger(n) || n <= 0) return null;
        cards[current] = (cards[current] ?? 0) + n;
    }
    return deckIssue(cards) ? null : sortCards(cards);
}

function archetypeName(arch) {
    const preset = presetOf(arch.id);
    return preset ? preset.name : CARDS[arch.key].name;
}

/**
 * 探索の本体
 * options: previous（前の結果）/ minutes / rounds / seed / withCard / runner / log / finalGames
 *   テスト用：now（時計）/ date / engine / archetypeIds（考える型をしぼる）/ presetIds（相手の構築済みデッキをしぼる）
 */
export async function search(options) {
    const { previous = null, minutes = 3, rounds = Infinity, withCard = null, runner, log = () => {}, now = () => Date.now() } = options;
    const runs = (previous?.runs ?? 0) + 1;
    const seed = options.seed ?? runs;
    const started = now();
    const deadline = started + minutes * 60000;
    const searchEnd = started + minutes * 60000 * (1 - FINAL_SHARE);

    // 型の一覧：決まった型と、前の結果にある --with の型と、今回の --with の型
    const archetypes = ARCHETYPES.filter(item => !options.archetypeIds || options.archetypeIds.includes(item.id)).map(item => ({ ...item }));
    for (const saved of previous?.decks ?? []) {
        const key = resolveCardId(saved.key ?? '');
        if (options.archetypeIds && !options.archetypeIds.includes(saved.archetype)) continue;
        if (CARDS[key] && !archetypes.some(item => item.id === saved.archetype)) archetypes.push({ id: saved.archetype, key, base: saved.base });
    }
    let targets = archetypes;
    if (withCard) {
        const key = resolveCardId(withCard);
        if (!CARDS[key] || CARDS[key].kind !== 'pokemon') throw new Error(`ポケモンのカード ${withCard} はない`);
        let arch = archetypes.find(item => item.key === key);
        if (!arch) {
            arch = { id: `with-${key}`, key, base: seedDeckFor(key).base };
            archetypes.push(arch);
        }
        targets = [arch];
    }

    // 現役：前の結果のデッキ（読めなければ元のデッキ）
    const state = new Map(archetypes.map(arch => {
        const saved = previous?.decks?.find(deck => deck.archetype === arch.id);
        const restored = restoreCards(saved?.cards);
        const seedDeck = presetOf(arch.id) ? { cards: sortCards(presetOf(arch.id).cards) } : seedDeckFor(arch.key);
        return [arch.id, {
            arch,
            cards: restored ?? seedDeck.cards,
            pool: buildPool(evolutionLine(arch.key)),
            random: createRandom(mixSeed(seed, 'mutate', arch.id)),
            rounds: saved?.rounds ?? 0,
            accepted: saved?.accepted ?? 0,
            roundsNow: 0,
            acceptedNow: 0
        }];
    }));
    const presets = DECKS.filter(deck => !options.presetIds || options.presetIds.includes(deck.id)).map(deck => ({ id: deck.id, cards: sortCards(deck.cards) }));
    const gauntletFor = archId => [
        ...presets,
        ...[...state.values()].filter(s => s.arch.id !== archId && !presets.some(p => deckKey(p.cards) === deckKey(s.cards)))
            .map(s => ({ id: `best-${s.arch.id}`, cards: s.cards }))
    ];

    let gameMs = null; // 1試合にかかる時間（並べた分を割った、見かけの時間）
    let round = 0;
    while (round < rounds) {
        let progressed = false;
        for (const target of targets) {
            if (now() >= searchEnd || round >= rounds) break;
            const s = state.get(target.id);
            const opponents = gauntletFor(target.id);
            const candidates = Array.from({ length: CANDIDATES }, () => mutateDeck(s.cards, s.random, { pool: s.pool, key: target.key }))
                .filter((cards, index, list) => deckKey(cards) !== deckKey(s.cards) && list.findIndex(other => deckKey(other) === deckKey(cards)) === index);
            const t0 = now();
            const screenSeed = [seed, 'screen', target.id, round];
            const incumbent = await evaluateDeck(s.cards, opponents, { games: SCREEN_GAMES, seedParts: screenSeed, runner });
            const scored = [];
            for (const cards of candidates) scored.push({ cards, result: await evaluateDeck(cards, opponents, { games: SCREEN_GAMES, seedParts: screenSeed, runner }) });
            let played = incumbent.games * (1 + candidates.length);
            const best = scored.sort((a, b) => b.result.wins - a.result.wins)[0];
            let accepted = false;
            if (best && best.result.wins > incumbent.wins) {
                const confirmSeed = [seed, 'confirm', target.id, round];
                const a = await evaluateDeck(best.cards, opponents, { games: CONFIRM_GAMES, seedParts: confirmSeed, runner });
                const b = await evaluateDeck(s.cards, opponents, { games: CONFIRM_GAMES, seedParts: confirmSeed, runner });
                played += a.games + b.games;
                // ふるい分けは候補の中の一番を選んでいて甘めに出るので、別のシードの追加の試合だけでも勝っていることを求める
                if (a.wins > b.wins && best.result.wins + a.wins > incumbent.wins + b.wins) {
                    s.cards = best.cards;
                    s.accepted++;
                    s.acceptedNow++;
                    accepted = true;
                }
            }
            s.rounds++;
            s.roundsNow++;
            progressed = true;
            const ms = (now() - t0) / played;
            gameMs = gameMs === null ? ms : gameMs * 0.7 + ms * 0.3;
            log(`${archetypeName(target)}：${round + 1}回目 現役 ${(incumbent.wins / incumbent.games * 100).toFixed(0)}%・候補 ${best ? (best.result.wins / best.result.games * 100).toFixed(0) : '-'}%${accepted ? ' → 入れ替えた' : ''}`);
        }
        if (!progressed) break;
        round++;
    }

    // 最後の総当たり：構築済みデッキと、各型のいちばんのデッキ（構築済みと同じ中身なら、構築済みのほうだけ）
    const entries = [
        ...presets.map(p => ({ id: p.id, kind: 'preset', cards: p.cards })),
        ...[...state.values()].filter(s => !presets.some(p => deckKey(p.cards) === deckKey(s.cards)))
            .map(s => ({ id: `best-${s.arch.id}`, kind: 'best', cards: s.cards }))
    ];
    const pairs = entries.length * (entries.length - 1) / 2;
    let finalGames = options.finalGames;
    if (!finalGames) {
        const leftMs = Math.max(0, deadline - now());
        const affordable = gameMs ? Math.floor(leftMs / gameMs / pairs) : 2;
        finalGames = Math.max(2, Math.min(MAX_FINAL_GAMES, affordable - (affordable % 2)));
    }
    log(`最後の総当たり：${entries.length}デッキ、1組 ${finalGames} 試合`);
    const tally = new Map(entries.map(entry => [entry.id, { wins: 0, games: 0, stuck: 0 }]));
    const tasks = [];
    entries.forEach((a, i) => entries.slice(i + 1).forEach(b => {
        for (let k = 0; k < finalGames; k++) {
            const seedValue = mixSeed(seed, 'final', a.id, b.id, k);
            tasks.push(k % 2 === 0 ? { first: a, second: b, seed: seedValue } : { first: b, second: a, seed: seedValue });
        }
    }));
    const results = await runner.run(tasks.map(task => ({ a: task.first.cards, b: task.second.cards, seed: task.seed })));
    results.forEach((result, index) => {
        const { first, second } = tasks[index];
        const x = tally.get(first.id);
        const y = tally.get(second.id);
        x.wins += result.score;
        y.wins += 1 - result.score;
        x.games++;
        y.games++;
        if (result.stuck) { x.stuck++; y.stuck++; }
    });

    const stats = id => {
        const t = tally.get(id);
        return { winRate: round3(t.wins / t.games), wins: t.wins, games: t.games, ci95: wilson(t.wins, t.games).map(round3), stuck: t.stuck };
    };
    // 総当たりで構築済みデッキより勝率が低ければ、構築済みデッキに戻す（探索での入れ替えが運だったときに、弱いデッキを残さない）
    let reverted = 0;
    for (const s of state.values()) {
        const preset = presets.find(p => p.id === s.arch.id);
        if (!preset || deckKey(preset.cards) === deckKey(s.cards)) continue;
        if (stats(`best-${s.arch.id}`).winRate < stats(preset.id).winRate) {
            log(`${archetypeName(s.arch)}：総当たりで構築済みより低かったので、構築済みに戻した`);
            s.cards = preset.cards;
            reverted++;
        }
    }
    const decks = [...state.values()].map(s => {
        const same = presets.find(p => deckKey(p.cards) === deckKey(s.cards));
        // 比べる構築済みデッキは、構築済みの型だけ（--with の型は、元にしたデッキと型がちがう）
        const base = presetOf(s.arch.id) ? s.arch.id : null;
        return {
            archetype: s.arch.id,
            name: archetypeName(s.arch),
            key: s.arch.key,
            base,
            keyPokemon: keyPokemon(s.cards, s.arch.key),
            cards: s.cards,
            ...stats(same ? same.id : `best-${s.arch.id}`),
            sameAsPreset: Boolean(same),
            rounds: s.rounds,
            accepted: s.accepted
        };
    }).sort((a, b) => b.winRate - a.winRate || a.archetype.localeCompare(b.archetype));

    return {
        version: FORMAT_VERSION,
        updatedAt: new Date(options.date ?? Date.now()).toISOString().slice(0, 10),
        engine: options.engine ?? engineVersion(),
        seed,
        runs,
        searched: targets.map(item => item.id),
        roundsThisRun: Object.fromEntries([...state.values()].filter(s => s.roundsNow).map(s => [s.arch.id, { rounds: s.roundsNow, accepted: s.acceptedNow }])),
        gamesPerPair: finalGames,
        revertedThisRun: reverted,
        gauntlet: entries.map(entry => ({ id: entry.id, kind: entry.kind })),
        presets: Object.fromEntries(presets.map(p => [p.id, stats(p.id)])),
        decks
    };
}

// ===== コマンド =====

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const match = argv[i].match(/^--([\w-]+)(?:=(.*))?$/);
        if (!match) throw new Error(`わからない引数 ${argv[i]}`);
        args[match[1]] = match[2] ?? argv[++i];
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const out = path.resolve(args.out ?? DEFAULT_OUT);
    const workers = args.workers !== undefined ? Number(args.workers) : Math.max(1, availableParallelism() - 1);
    const runner = createRunner(workers);
    const startedAt = Date.now();
    try {
        const result = await search({
            previous: loadPrevious(out),
            minutes: Number(args.minutes ?? 3),
            rounds: args.rounds !== undefined ? Number(args.rounds) : Infinity,
            seed: args.seed !== undefined ? Number(args.seed) : undefined,
            withCard: args.with || null,
            finalGames: args['final-games'] ? Number(args['final-games']) : undefined,
            runner,
            log: line => console.log(line)
        });
        mkdirSync(path.dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(result)}\n`);
        console.log(`\n${((Date.now() - startedAt) / 60000).toFixed(1)}分。${path.relative(process.cwd(), out)} に書き出した`);
        for (const deck of result.decks) {
            const preset = result.presets[deck.base];
            const diff = preset && !deck.sameAsPreset ? `（構築済み ${(preset.winRate * 100).toFixed(1)}%）` : deck.sameAsPreset ? '（構築済みのまま）' : '';
            console.log(`${deck.name}：勝率 ${(deck.winRate * 100).toFixed(1)}% [${(deck.ci95[0] * 100).toFixed(0)}–${(deck.ci95[1] * 100).toFixed(0)}%]（${deck.games} 試合）${diff}`);
        }
    } finally {
        await runner.close();
    }
}

if (!isMainThread) {
    // 対戦を流す係
    parentPort.on('message', task => parentPort.postMessage(runTaskInline(task)));
} else if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}
