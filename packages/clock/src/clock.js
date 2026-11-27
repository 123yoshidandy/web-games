/**
 * 対局時計（持ち時間）の計算
 * DOM に依存せず、時刻も読まない（経過はミリ秒で受け取る）。ブラウザ・テスト・オンライン対戦のサーバーのどこでも同じ結果になる
 * 元は packages/clock。chess・shogi・go・gomoku の public/js/clock.js へ写して使う（scripts/sync.mjs）
 * ゲームごとの違い（切れ負け・秒読み・フィッシャー）は、すべて設定で表す
 *
 * 設定 { main, byoyomi, periods, increment }（時間はミリ秒、periods は秒読みの回数）
 * - 切れ負け：main だけ。使い切ったら負け
 * - 秒読み（将棋・囲碁の日本式）：main を使い切ったら、1手ごとに byoyomi の秒読み。秒読みを超えると1回減り、次の秒読みが始まる
 *   periods 回とも超えたら負け（将棋は1回、囲碁は3回など）
 * - フィッシャー（チェス）：1手指すたびに increment を足す。使い切ったら負け
 * 席ごとの残り { main（残りの持ち時間）, periods（残りの秒読みの回数） }
 */

export const LOW_TIME_MS = 10000;   // 残りがこれ以下なら、時計を目立たせて知らせる

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);

// 設定をそろえる。時計なし（null・空・時間が0）は null
export function normalizeClock(value) {
    if (!value || typeof value !== 'object') return null;
    const main = count(value.main);
    const byoyomi = count(value.byoyomi);
    const periods = byoyomi ? Math.max(1, count(value.periods) || 1) : 0;
    const increment = byoyomi ? 0 : count(value.increment);
    if (!main && !byoyomi) return null;
    return { main, byoyomi, periods, increment };
}

export function createClockSides(config) {
    return [0, 1].map(() => ({ main: config.main, periods: config.periods }));
}

// 手番を始めてから、この時間がたつと負け
export function limitOf(config, side) {
    return side.main + config.byoyomi * side.periods;
}

// 1手に elapsed ミリ秒かけた。新しい残りと、時間切れかを返す（side は変えない）
// increment：フィッシャーの加算をするか（指し手だけ。引き分けの提案などには足さない）
export function spend(config, side, elapsed, { increment = true } = {}) {
    const ms = Math.max(0, Math.round(elapsed) || 0);
    if (ms >= limitOf(config, side)) return { side: { main: 0, periods: 0 }, flagged: true };
    if (ms < side.main) {
        return { side: { main: side.main - ms + (increment ? config.increment : 0), periods: side.periods }, flagged: false };
    }
    // 秒読みに入った：超えた秒読みの回数だけ減らす（秒読みの中で指せば、次の手も同じ秒読み）
    const lost = Math.floor((ms - side.main) / config.byoyomi);
    return { side: { main: 0, periods: side.periods - lost }, flagged: false };
}

// 手番を始めて elapsed ミリ秒たったときの表示
// shown：大きく出す時間（持ち時間か、今の秒読み）、byoyomi：秒読みに入ったか、periods：残りの秒読みの回数、total：負けまでの時間
export function reading(config, side, elapsed = 0) {
    const ms = Math.max(0, elapsed);
    const total = Math.max(0, limitOf(config, side) - ms);
    if (ms < side.main || !config.byoyomi) {
        return { shown: Math.max(0, side.main - ms), byoyomi: false, periods: side.periods, total };
    }
    const over = ms - side.main;
    const lost = Math.floor(over / config.byoyomi);
    if (lost >= side.periods) return { shown: 0, byoyomi: true, periods: 0, total: 0 };
    return { shown: config.byoyomi - (over % config.byoyomi), byoyomi: true, periods: side.periods - lost, total };
}

export const isLow = (read) => read.total <= LOW_TIME_MS;

// 「4:59」「0:42」、10秒を切ったら「9.8」
export function formatClock(ms) {
    const value = Math.max(0, ms);
    if (value < LOW_TIME_MS) return (Math.floor(value / 100) / 10).toFixed(1);
    const seconds = Math.ceil(value / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// 設定の短い名前（「5分」「3分+2秒」「10分+秒読み30秒」「10分+秒読み30秒×3」）
export function clockLabel(config) {
    if (!config) return 'なし';
    const time = (ms) => (ms >= 60000 && ms % 60000 === 0 ? `${ms / 60000}分` : `${Math.round(ms / 1000)}秒`);
    const parts = [];
    if (config.main) parts.push(time(config.main));
    if (config.byoyomi) parts.push(`秒読み${time(config.byoyomi)}${config.periods > 1 ? `×${config.periods}` : ''}`);
    if (config.increment) parts.push(time(config.increment));
    return parts.join('+');
}

// CPU が1手に使ってよい時間（ミリ秒）。残りの持ち時間を moves 手で割り、加算・秒読みの分を足す
// 負けまでの時間の一部しか使わないので、ふつうに指していれば時間切れにならない
export function cpuBudget(config, side, { moves = 30 } = {}) {
    if (!config) return null;
    const limit = limitOf(config, side);
    let budget = side.main / moves + config.increment * 0.7;
    if (config.byoyomi) budget = Math.max(budget, config.byoyomi * 0.4);
    // 秒読みに入る前でも、秒読みの半分までなら回数を減らさない
    const cap = config.byoyomi ? Math.min(limit, side.main + config.byoyomi * 0.5) : limit * 0.25;
    return Math.max(0, Math.floor(Math.min(budget, cap)));
}
