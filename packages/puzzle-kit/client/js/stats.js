/**
 * 遊んだ記録（端末に保存する。DOM に触れない）
 *
 * stats：{
 *   free:   { <難しさ>: { solved（解いた数）, best（ヒントなしの最短のミリ秒 | null） } },
 *   attack: { '<難しさ>:<問題の数>': 自己ベストのミリ秒 },
 *   daily:  { 'YYYY-MM-DD': その日の最短のミリ秒 }（新しい日から DAILY_KEEP 日分）,
 *   online: { played（終わりまで遊んだ数）, wins（1位の数） }
 * }
 * 記録する関数は stats を書き換え、更新したかどうかを返す
 */

export const DAILY_KEEP = 60;

export const emptyStats = () => ({ free: {}, attack: {}, daily: {}, online: { played: 0, wins: 0 } });

// 保存から読んだ値を、決まった形にそろえる（古い形・壊れた値でも投げない）
export function normalizeStats(raw) {
    const stats = emptyStats();
    if (!raw || typeof raw !== 'object') return stats;
    const isTime = (v) => Number.isFinite(v) && v >= 0;
    for (const [difficulty, row] of Object.entries(raw.free ?? {})) {
        if (!row || typeof row !== 'object') continue;
        stats.free[difficulty] = { solved: Number.isInteger(row.solved) ? row.solved : 0, best: isTime(row.best) ? row.best : null };
    }
    for (const [key, ms] of Object.entries(raw.attack ?? {})) if (isTime(ms)) stats.attack[key] = ms;
    for (const [key, ms] of Object.entries(raw.daily ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(key) && isTime(ms)) stats.daily[key] = ms;
    if (Number.isInteger(raw.online?.played)) stats.online.played = raw.online.played;
    if (Number.isInteger(raw.online?.wins)) stats.online.wins = raw.online.wins;
    return stats;
}

// フリープレイで1問解いた。ヒントを見なかったときだけ最短を比べる。最短を更新したら true
export function recordFree(stats, difficulty, ms, hints = 0) {
    const row = stats.free[difficulty] ?? (stats.free[difficulty] = { solved: 0, best: null });
    row.solved++;
    if (hints > 0 || (row.best !== null && row.best <= ms)) return false;
    row.best = ms;
    return true;
}

// タイムアタックを解き終えた。{ first（初めての記録）, best（自己ベストの更新） }
export function recordAttack(stats, key, ms) {
    const before = stats.attack[key];
    if (before !== undefined && before <= ms) return { first: false, best: false };
    stats.attack[key] = ms;
    return { first: before === undefined, best: before !== undefined };
}

// 今日のパズルを解き終えた。{ first（その日の初めての記録）, best（その日の記録の更新） }
export function recordDaily(stats, key, ms) {
    const before = stats.daily[key];
    if (before !== undefined && before <= ms) return { first: false, best: false };
    stats.daily[key] = ms;
    stats.daily = Object.fromEntries(Object.entries(stats.daily).sort().slice(-DAILY_KEEP));
    return { first: before === undefined, best: before !== undefined };
}

// オンラインの対戦が終わった（rank は自分の順位）
export function recordOnline(stats, rank) {
    stats.online.played++;
    if (rank === 1) stats.online.wins++;
}

// 今日のパズルを続けて解いた日数（today か、その前の日で終わる連続。today は 'YYYY-MM-DD'）
export function dailyStreak(stats, today) {
    const [y, m, d] = today.split('-').map(Number);
    const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const date = new Date(y, m - 1, d);
    if (stats.daily[key(date)] === undefined) date.setDate(date.getDate() - 1);
    let streak = 0;
    while (stats.daily[key(date)] !== undefined) {
        streak++;
        date.setDate(date.getDate() - 1);
    }
    return streak;
}
