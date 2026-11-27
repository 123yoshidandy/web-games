/**
 * 利用者ごとの記録（回数・勝ち・負け・引き分け、オンラインの相手ごとの勝ち負け）
 * ログインは名前だけ（個人で使う前提。同じ名前ならほかの端末からも同じ記録になる）
 *
 * - オンライン対戦：部屋の処理（RoomService の onMatchEnd）が、対戦の終わりに全員の分をサーバーで記録する
 *   結果はゲームの定義の result(game, room) があればそれ、なければ game の決まった形の項目から取り出す（resultOf）
 * - ローカル対戦（CPU・ひとり）：画面の user-stats.js が POST /results で送る（stats-handler.js）
 *
 * 保存の形（DynamoStatsStore と MemoryStatsStore で同じ）：利用者ごとに1つの項目に、数えるものを平らな名前で持つ
 *   p|<ゲーム>  回数        w|<ゲーム>  勝ち      l|<ゲーム>  負け      d|<ゲーム>  引き分け    o|<ゲーム>  そのうちオンライン
 *   v|<ゲーム>|<h か c>|<相手の名前>|<p w l d>   オンラインの相手ごと（h は人、c は CPU）
 * 平らにしておくと、DynamoDB の ADD で読まずに足せる（入れ子の map は、親がないと ADD できない）
 */

import { isGameName } from './game-name.js';

export const MAX_NAME_LENGTH = 12;          // ロビーの名前と同じ長さ
export const OUTCOMES = ['win', 'loss', 'draw'];
// 名前を入れなかったときにロビーが付ける名前は、誰の記録でもないので数えない
const PLACEHOLDER_NAMES = ['プレイヤー', '観戦者'];
const SEP = '|';

// 名前を揃える：全角・半角を揃え（NFKC）、制御文字と区切りの | を除き、前後の空白を取り、12文字まで
export function normalizeName(name) {
    return String(name ?? '').normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_NAME_LENGTH)
        .trim();
}

// 記録を引くキー：英字の大文字・小文字は区別しない（スマホの自動の大文字で別人にならないように）
export function nameKey(name) {
    const normalized = normalizeName(name);
    if (!normalized || PLACEHOLDER_NAMES.includes(normalized)) return '';
    return normalized.toLowerCase();
}

// ===== 結果の取り出し =====

const isSeat = (value, count) => Number.isInteger(value) && value >= 0 && value < count;
const call = (value, game) => (typeof value === 'function' ? value.call(game) : value);

// 勝った席の一覧 → 席ごとの順位（勝ちは1、ほかは2）
const ranksFromWinners = (winners, count) => {
    if (!Array.isArray(winners) || winners.length === 0 || !winners.every(seat => isSeat(seat, count))) return null;
    return Array.from({ length: count }, (_, seat) => (winners.includes(seat) ? 1 : 2));
};

// [{ seat, rank }] → 席ごとの順位（全員の分がそろっているときだけ）
const ranksFromStandings = (standings, count) => {
    if (!Array.isArray(standings) || standings.length !== count) return null;
    const ranks = Array(count).fill(null);
    for (const entry of standings) {
        if (!isSeat(entry?.seat, count) || !Number.isFinite(entry?.rank)) return null;
        ranks[entry.seat] = entry.rank;
    }
    return ranks.every(rank => rank !== null) ? ranks : null;
};

// 定義の result(game, room) が返す形を、席ごとの順位か協力の結果にそろえる（読めなければ null）
//   { winners: [席…] } / { ranks: [席ごとの順位] } / { draw: true } / { coop: true, won: true|false } / null
export function normalizeResult(result, count) {
    if (!result || typeof result !== 'object') return null;
    if (result.coop) return { coop: true, won: Boolean(result.won) };
    if (result.draw) return { ranks: Array(count).fill(1) };
    if (Array.isArray(result.ranks) && result.ranks.length === count && result.ranks.every(Number.isFinite)) return { ranks: [...result.ranks] };
    const ranks = ranksFromWinners(result.winners, count);
    return ranks ? { ranks } : null;
}

// 終わったゲームから、結果を取り出す。定義の result があればそれだけを使う
// なければ、多くのゲームが持つ形を順に試す（どれにも当たらなければ null：回数だけを数える）
//   game.result.standings（[{ seat, rank }]）/ game.result.winners / game.ranking（[{ seat, rank }]。関数でもよい）
//   game.winners（席の配列。関数でもよい）/ game.winner（席の番号。関数でもよい）
export function resultOf(definition, game, room) {
    const count = room.players.length;
    if (typeof definition?.result === 'function') return normalizeResult(definition.result(game, room), count);
    if (!game || typeof game !== 'object') return null;
    const candidates = [
        () => ranksFromStandings(game.result?.standings, count),
        () => ranksFromWinners(game.result?.winners, count),
        () => ranksFromStandings(call(game.ranking, game), count),
        () => ranksFromWinners(call(game.winners, game), count),
        () => {
            const winner = call(game.winner, game);
            return isSeat(winner, count) ? ranksFromWinners([winner], count) : null;
        }
    ];
    for (const candidate of candidates) {
        try {
            const ranks = candidate();
            if (ranks) return { ranks };
        } catch {
            // 形が違えば次を試す
        }
    }
    return null;
}

// 順位どうしを比べた勝ち負け（小さいほうが上）
const compare = (mine, theirs) => (mine < theirs ? 'win' : mine > theirs ? 'loss' : 'draw');

// 席ごとの順位から、その席の結果：全員が同じなら引き分け、いちばん上なら勝ち（同点の勝ちも勝ち）、ほかは負け
export function outcomeOf(ranks, seat) {
    const best = Math.min(...ranks);
    if (ranks.every(rank => rank === best)) return 'draw';
    return ranks[seat] === best ? 'win' : 'loss';
}

// オンライン対戦の終わりに、記録する中身を作る（人の席だけ。名前のない席は数えない）
// 同じ部屋の同じ対戦は、id が同じになる（二重に数えない）
export function matchRecord({ gameName, room, result, now = Date.now() }) {
    const players = room.players;
    const entries = [];
    players.forEach((player, seat) => {
        if (player.isCPU || !nameKey(player.name)) return;
        const outcome = result?.coop ? (result.won ? 'win' : 'loss') : result?.ranks ? outcomeOf(result.ranks, seat) : null;
        // 協力のゲームは、相手がいないので相手ごとの記録を残さない
        const vs = result?.coop ? [] : players
            .map((other, index) => ({ other, index }))
            .filter(({ index }) => index !== seat)
            .map(({ other, index }) => ({
                name: normalizeName(other.name) || (other.isCPU ? 'CPU' : 'プレイヤー'),
                cpu: Boolean(other.isCPU),
                outcome: result?.ranks ? compare(result.ranks[seat], result.ranks[index]) : null
            }));
        entries.push({ name: normalizeName(player.name), outcome, online: true, vs });
    });
    return { id: `online:${gameName}:${room.code}:${room.createdAt ?? 0}:${room.matchId}`, game: gameName, at: now, entries };
}

// RoomService の onMatchEnd に渡す関数を作る。記録に失敗しても、対戦の処理は止めない（ログに1行残す）
export function createMatchRecorder({ gameName, definition, store, now = () => Date.now(), log = (entry) => console.log(JSON.stringify(entry)) }) {
    return async ({ room, game }) => {
        try {
            const record = matchRecord({ gameName, room, result: resultOf(definition, game, room), now: now() });
            if (record.entries.length > 0) await store.record(record);
        } catch (error) {
            log({ event: 'stats_failed', game: gameName, room: room.code, matchId: room.matchId, error: error.name, message: error.message });
        }
    };
}

// ===== 保存の形 =====

const OUTCOME_LETTER = { win: 'w', loss: 'l', draw: 'd' };
const LETTER_FIELD = { p: 'plays', w: 'wins', l: 'losses', d: 'draws', o: 'online' };

// 1人分の記録（entry）を、足す数の名前と数（{ 'p|azul': 1, … }）にする。同じ人が2つあれば足し合わせる
export function countersOf(game, entries) {
    const counters = {};
    const add = (key) => { counters[key] = (counters[key] ?? 0) + 1; };
    for (const entry of entries) {
        add(`p${SEP}${game}`);
        if (OUTCOME_LETTER[entry.outcome]) add(`${OUTCOME_LETTER[entry.outcome]}${SEP}${game}`);
        if (entry.online) add(`o${SEP}${game}`);
        for (const opponent of entry.vs ?? []) {
            const base = ['v', game, opponent.cpu ? 'c' : 'h', normalizeName(opponent.name)].join(SEP);
            add(`${base}${SEP}p`);
            if (OUTCOME_LETTER[opponent.outcome]) add(`${base}${SEP}${OUTCOME_LETTER[opponent.outcome]}`);
        }
    }
    return counters;
}

// 記録を利用者ごとにまとめる（同じ名前が2席にいても1つにする）→ [{ key, name, counters }]
export function groupByUser(record) {
    const users = new Map();
    for (const entry of record.entries) {
        const key = nameKey(entry.name);
        if (!key) continue;
        if (!users.has(key)) users.set(key, { key, name: normalizeName(entry.name), entries: [] });
        users.get(key).entries.push(entry);
    }
    return [...users.values()].map(({ key, name, entries }) => ({ key, name, counters: countersOf(record.game, entries) }));
}

// 保存した項目（平らな数）を、画面に返す形にする
//   { name, games: { azul: { plays, wins, losses, draws, online, vs: [{ name, cpu, plays, wins, losses, draws }] } } }
export function statsFromItem(item, fallbackName = '') {
    const games = {};
    const gameOf = (name) => (games[name] ??= { plays: 0, wins: 0, losses: 0, draws: 0, online: 0, vs: [] });
    const opponents = new Map();
    for (const [attribute, value] of Object.entries(item ?? {})) {
        const parts = attribute.split(SEP);
        const count = Number(value);
        if (!Number.isFinite(count)) continue;
        if (parts.length === 2 && LETTER_FIELD[parts[0]] && isGameName(parts[1])) {
            gameOf(parts[1])[LETTER_FIELD[parts[0]]] = count;
        } else if (parts.length === 5 && parts[0] === 'v' && isGameName(parts[1]) && LETTER_FIELD[parts[4]]) {
            const id = parts.slice(1, 4).join(SEP);
            if (!opponents.has(id)) {
                const opponent = { name: parts[3], cpu: parts[2] === 'c', plays: 0, wins: 0, losses: 0, draws: 0 };
                opponents.set(id, opponent);
                gameOf(parts[1]).vs.push(opponent);
            }
            opponents.get(id)[LETTER_FIELD[parts[4]]] = count;
        }
    }
    for (const stats of Object.values(games)) stats.vs.sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));
    return { name: item?.name ?? fallbackName, games };
}

// 手元で使う保存先（テストと npm run dev:online 用）。DynamoStatsStore と同じ形
export class MemoryStatsStore {
    constructor() {
        this.users = new Map();     // キー → { name, 数… }
        this.recorded = new Set();  // 数えた記録の id（二重に数えない）
    }

    // 同じ id の記録は2回目から数えない。数えたら true
    async record(record) {
        if (this.recorded.has(record.id)) return false;
        this.recorded.add(record.id);
        for (const { key, name, counters } of groupByUser(record)) {
            const item = this.users.get(key) ?? {};
            for (const [counter, count] of Object.entries(counters)) item[counter] = (item[counter] ?? 0) + count;
            item.name = name;
            item.updatedAt = record.at;
            this.users.set(key, item);
        }
        return true;
    }

    async get(name) {
        const key = nameKey(name);
        return statsFromItem(key ? this.users.get(key) : null, normalizeName(name));
    }
}
