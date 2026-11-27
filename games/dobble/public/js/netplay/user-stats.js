// netplay-kit 1.14.0（560fbd6）からコピーしたファイル。ここでは直さず、netplay-kit で直してから同期する
/**
 * 利用者ごとの記録（画面側）：ログインの名前、ローカル対戦（CPU・ひとり）の結果の送信、記録の読み込み
 * オンライン対戦の結果は、サーバー（netplay-kit の stats.js）が対戦の終わりに記録するので、ここからは送らない
 *
 * - ログインは名前だけ。名前はロビーと同じ netplay.name に入れる（全ゲームのロビーで、その名前が最初から入る）
 * - 結果は、まず端末の待ち行列（localStorage）に入れてから送る。送れなければ残し、次の読み込み・通信の回復・次の結果のときに送り直す
 *   サーバーは同じ id を2回数えないので、届いたか分からないときも送り直してよい
 *
 * 使い方（ゲームの画面。ローカル対戦が終わったとき）:
 *   import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
 *   recordResult({ game: 'azul', id: `azul-${seed}`, outcome: outcomeFromWinners(winners, humanSeat, players.length) });
 *   ログインしていなければ何もしない。id は同じ対戦なら同じになるもの（シードなど）にする
 */

export const NAME_KEY = 'netplay.name';
const QUEUE_KEY = 'netplay.statsQueue';
const LOCAL_STATS_URL = 'http://localhost:8787';
const MAX_NAME_LENGTH = 12;
const MAX_QUEUE = 200;              // 送れないまま、これより多くたまったら古いものから捨てる
const OUTCOMES = ['win', 'loss', 'draw'];

// web-games のサーバー（web-games-online）をデプロイしたら、出力された StatsApiUrl を書く
// 空のあいだは、公開したページでは記録を送らない（手元では npm run dev:online のサーバーに送る）
export const DEPLOYED_STATS_URL = '';

const storage = () => {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
};

// 記録の API の場所：?stats= があればそれ、?server=（オンライン対戦の接続先）が ws なら同じ場所の http、
// 手元（localhost）なら手元のテスト用サーバー、なければ配備先（空なら null：送らない）
export function resolveStatsUrl({ deployed = DEPLOYED_STATS_URL, local = LOCAL_STATS_URL } = {}) {
    if (typeof location === 'undefined') return deployed || null;
    const params = new URLSearchParams(location.search);
    const override = params.get('stats');
    if (override) return override.replace(/\/+$/, '');
    const server = params.get('server');
    if (server && /^wss?:\/\//.test(server)) {
        const url = new URL(server);
        if (['localhost', '127.0.0.1'].includes(url.hostname)) return `http://${url.host}`;
    }
    if (['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:') return local;
    return deployed || null;
}

// サーバーと同じ揃え方（全角・半角、区切りの |、前後の空白、12文字まで）
export function normalizeName(name) {
    return String(name ?? '').normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_NAME_LENGTH)
        .trim();
}

// ===== ログイン =====

export function currentUser() {
    try {
        return normalizeName(storage()?.getItem(NAME_KEY) ?? '');
    } catch {
        return '';
    }
}

// 名前でログインする（ロビーの名前も同じになる）。揃えた名前を返す（空なら ''）
export function login(name) {
    const normalized = normalizeName(name);
    if (!normalized) return '';
    try {
        storage()?.setItem(NAME_KEY, normalized);
    } catch {
        // 保存できなくても、この画面のあいだは使える
    }
    return normalized;
}

export function logout() {
    try {
        storage()?.removeItem(NAME_KEY);
    } catch {
        // 消せなくてもよい
    }
}

// ===== 結果 =====

// 勝った席の一覧から、その席の結果：全員（count 人）が勝ちなら引き分け、入っていれば勝ち、ほかは負け
export function outcomeFromWinners(winners, seat, count = Infinity) {
    if (!Array.isArray(winners) || winners.length === 0) return null;
    if (!winners.includes(seat)) return 'loss';
    return new Set(winners).size >= count ? 'draw' : 'win';
}

function readQueue() {
    try {
        const queue = JSON.parse(storage()?.getItem(QUEUE_KEY) ?? '[]');
        return Array.isArray(queue) ? queue : [];
    } catch {
        return [];
    }
}

function writeQueue(queue) {
    try {
        if (queue.length === 0) storage()?.removeItem(QUEUE_KEY);
        else storage()?.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
    } catch {
        // 保存できなければ、この結果は送れない
    }
}

export const pendingResults = () => readQueue();

// ローカル対戦の結果を1つ記録する（ログインしていなければ何もしない）。待ち行列に入れたら true
// outcome: 'win' / 'loss' / 'draw' / null（勝ち負けのないゲーム：回数だけ）
export function recordResult({ game, id, outcome = null, name = currentUser() }) {
    const user = normalizeName(name);
    if (!user || !game || !id) return false;
    const result = { id: String(id), name: user, game, outcome: OUTCOMES.includes(outcome) ? outcome : null, at: Date.now() };
    const queue = readQueue();
    if (queue.some(entry => entry.id === result.id && entry.game === game && entry.name === user)) return false;
    queue.push(result);
    writeQueue(queue);
    flushResults();
    return true;
}

let flushing = null;

// 待ち行列を送る。届いた（200）・形が違うと断られた（4xx）ものは消し、送れなかったものは残す
// 送り終えた数を返す。同時に呼ばれたら、前の送信を待つ
export function flushResults({ fetchImpl = globalThis.fetch, url = resolveStatsUrl() } = {}) {
    if (flushing) return flushing;
    flushing = (async () => {
        if (!url || typeof fetchImpl !== 'function') return 0;
        let sent = 0;
        for (const result of readQueue()) {
            let status = 0;
            try {
                const response = await fetchImpl(`${url}/results`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: result.id, name: result.name, game: result.game, outcome: result.outcome })
                });
                status = response.status;
            } catch {
                break; // つながらなければ、残りも次の機会に送る
            }
            if (status >= 500 || status === 429) break;
            writeQueue(readQueue().filter(entry => !(entry.id === result.id && entry.game === result.game && entry.name === result.name)));
            if (status >= 200 && status < 300) sent++;
        }
        return sent;
    })().finally(() => { flushing = null; });
    return flushing;
}

// 記録を読む。{ name, games: { <ゲーム>: { plays, wins, losses, draws, online, vs: [...] } } }。読めなければ null
export async function fetchStats(name = currentUser(), { fetchImpl = globalThis.fetch, url = resolveStatsUrl() } = {}) {
    const user = normalizeName(name);
    if (!user || !url || typeof fetchImpl !== 'function') return null;
    try {
        const response = await fetchImpl(`${url}/stats?name=${encodeURIComponent(user)}`);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

// 全ゲームの、ロビーで人を待っている部屋（入口のページの「いま立っている部屋」）。読めなければ null
// [{ game, roomCode, hostName, players, maxPlayers, createdAt }]（新しい順）。入るときは <ゲーム>/?room=<部屋番号>（招待URLと同じ）
export async function fetchOpenRooms({ fetchImpl = globalThis.fetch, url = resolveStatsUrl() } = {}) {
    if (!url || typeof fetchImpl !== 'function') return null;
    try {
        const response = await fetchImpl(`${url}/rooms`);
        if (!response.ok) return null;
        const { rooms } = await response.json();
        return Array.isArray(rooms) ? rooms : null;
    } catch {
        return null;
    }
}

// ブラウザで読み込まれたら、残っている結果を送り、通信が戻ったときにも送る
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => flushResults());
    setTimeout(() => flushResults(), 1500);
}
