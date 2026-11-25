/**
 * ハイスコアの記録（localStorage）
 * 上位10回の点数と日付、遊んだ回数、平均を出すための合計を持つ
 */

const RECORDS_KEY = 'yahtzee.records';
const TOP = 10;

const empty = () => ({ plays: 0, sum: 0, top: [] });

export function loadRecords() {
    try {
        const saved = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? 'null');
        if (!saved || !Array.isArray(saved.top) || !Number.isFinite(saved.plays) || !Number.isFinite(saved.sum)) return empty();
        return { plays: saved.plays, sum: saved.sum, top: saved.top.filter(r => Number.isFinite(r?.score)).slice(0, TOP) };
    } catch {
        return empty();
    }
}

export const bestOf = (records) => records.top[0]?.score ?? null;

// 1回分を足す。{ records, rank（上位に入った順位。入らなければ null）, best（自己ベストを更新したか）}
export function addRecord({ score, opponents = 0, level = null, won = false }, now = new Date()) {
    const records = loadRecords();
    const previousBest = bestOf(records);
    const entry = { score, date: now.toISOString().slice(0, 10), opponents, level, won };
    records.plays++;
    records.sum += score;
    records.top.push(entry);
    // 同じ点数なら、先に出した記録を上にする
    records.top.sort((a, b) => b.score - a.score);
    records.top = records.top.slice(0, TOP);
    const index = records.top.indexOf(entry);
    try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    } catch { /* 保存できない環境でも遊べるようにする */ }
    return { records, rank: index >= 0 ? index + 1 : null, best: previousBest === null || score > previousBest, score };
}
