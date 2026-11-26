// 画面の検査（scripts/layout-check.mjs）の、ブラウザを使わない部分：サイズの選び方・判定・結果の表
// - ブラウザの中で集めた数値（snapshot）を受け取り、問題（issue）の一覧にする。テストは layout-check.test.mjs
// - 決まりと閾値は docs/standards.md の「ブラウザでの画面の検査」に書いた。変えたら資料も直す

// 画面の大きさ。phone は、ゲームの向き（manifest の orientation）に合うスマホの大きさだけを使う
export const SIZES = {
    portrait: { width: 390, height: 664, mobile: true, label: 'スマホ縦 390×664' },
    landscape: { width: 844, height: 390, mobile: true, label: 'スマホ横 844×390' },
    desktop: { width: 1280, height: 800, mobile: false, label: 'PC 1280×800' }
};

// 押す場所の高さ（px）。MIN_TAP 未満は失敗（WCAG 2.2 の押す場所の最小）、GOOD_TAP 未満は注意（iOS の指針の 44pt）
export const MIN_TAP = 24;
export const GOOD_TAP = 44;
// 重なりとみなす、食い込みの幅と高さ（px）。枠線が触れる程度は数えない
export const OVERLAP_TOLERANCE = 2;
// 位置の誤差（px）。小数の丸めで、画面の端にちょうど接する要素をはみ出しにしない
const EDGE = 1;

// 問題の種類。level が fail のものだけを失敗に数える（warn は表に出すだけ）
export const KINDS = {
    load: { level: 'fail', label: '読み込めない' },
    'h-overflow': { level: 'fail', label: '横にはみ出す' },
    'v-overflow': { level: 'warn', label: '縦にスクロールする' },
    'console-error': { level: 'fail', label: 'コンソールのエラー' },
    'request-failed': { level: 'fail', label: '読み込みの失敗' },
    missing: { level: 'fail', label: '要素がない' },
    offscreen: { level: 'fail', label: '画面の外で届かない' },
    small: { level: 'fail', label: `高さ ${MIN_TAP}px 未満` },
    'tap-size': { level: 'warn', label: `高さ ${GOOD_TAP}px 未満` },
    overlap: { level: 'fail', label: 'ほかの操作の要素と重なる' },
    covered: { level: 'fail', label: 'ほかの要素に覆われている' },
    'bgm-covered': { level: 'warn', label: 'プレイ中の BGM の切り替えがダイアログに覆われる' },
    'start-failed': { level: 'fail', label: '開始できない' },
    'portal-in-play': { level: 'fail', label: 'プレイ中に一覧へのリンクが見える' },
    'audio-on': { level: 'fail', label: '押しても BGM が鳴らない' },
    'audio-off': { level: 'fail', label: 'OFF にしても BGM が止まらない' }
};

export const ROLE_LABELS = { portal: '「← ゲーム一覧」', bgm: 'BGM の切り替え', start: '開始のボタン', help: '遊び方のボタン' };

export const issue = (phase, kind, message) => ({ phase, kind, level: KINDS[kind]?.level ?? 'fail', message });

// 引数を読む。games が空なら全部
export function parseArgs(argv) {
    const options = { games: [], sizes: 'phone', out: null, jobs: 4, shard: null, site: null, report: null, timeout: 30000 };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            const next = argv[++i];
            if (next === undefined) throw new Error(`${arg} の値がありません`);
            return next;
        };
        if (arg === '--sizes') options.sizes = value();
        else if (arg === '--out') options.out = value();
        else if (arg === '--jobs') options.jobs = Number(value());
        else if (arg === '--site') options.site = value();
        else if (arg === '--report') options.report = value();
        else if (arg === '--timeout') options.timeout = Number(value());
        else if (arg === '--shard') {
            const match = value().match(/^(\d+)\/(\d+)$/);
            if (!match || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) throw new Error('--shard は 1/4 のように書く');
            options.shard = { index: Number(match[1]), total: Number(match[2]) };
        } else if (arg.startsWith('--')) throw new Error(`知らない引数です: ${arg}`);
        else options.games.push(arg.replace(/^games\//, '').replace(/\/$/, ''));
    }
    if (!(options.jobs >= 1)) throw new Error('--jobs は1以上');
    sizeNames(options.sizes, 'portrait'); // 書き間違いをここで見つける
    return options;
}

// ゲームの向きに合う、スマホの大きさの名前
export const phoneSize = (orientation) => (orientation === 'landscape' ? 'landscape' : 'portrait');

// --sizes の値から、使う大きさの名前の一覧を作る
// phone：ゲームの向きのスマホだけ。all：3つすべて。portrait,desktop のような並びも書ける
export function sizeNames(sizes, orientation) {
    if (sizes === 'phone') return [phoneSize(orientation)];
    if (sizes === 'all') return Object.keys(SIZES);
    const names = sizes.split(',').map((name) => name.trim()).filter(Boolean);
    const unknown = names.filter((name) => !SIZES[name]);
    if (names.length === 0 || unknown.length > 0) throw new Error(`--sizes は phone・all か、${Object.keys(SIZES).join('・')} の並び（${sizes}）`);
    return names;
}

// 向きを決めたゲームの、反対の向きのスマホの大きさは、参考（失敗に数えない）にする
export const isInfoOnly = (size, orientation) => (orientation === 'portrait' && size === 'landscape') || (orientation === 'landscape' && size === 'portrait');

// CI で分けて流すときの、受け持つゲーム（名前の順に並べ、順番に配る）
export const shardGames = (games, shard) => (shard ? games.filter((_, i) => i % shard.total === shard.index - 1) : games);

// 2つの箱の重なりの幅と高さ
export function intersection(a, b) {
    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return width > 0 && height > 0 ? { width, height } : null;
}

export const overlaps = (a, b, tolerance = OVERLAP_TOLERANCE) => {
    const area = intersection(a, b);
    return Boolean(area && area.width > tolerance && area.height > tolerance);
};

export const inViewport = (rect, viewport) => rect.x >= -EDGE && rect.y >= -EDGE
    && rect.x + rect.width <= viewport.width + EDGE && rect.y + rect.height <= viewport.height + EDGE;

// 横のはみ出し（ページ全体の幅が、指定した画面の幅より広い）
export const horizontalOverflow = (snapshot) => snapshot.scroll.width > snapshot.viewport.width + EDGE;
export const verticalOverflow = (snapshot) => snapshot.scroll.height > snapshot.viewport.height + EDGE;

// 主要な要素1つの問題。el はブラウザで集めた { label, rect, inView, reachable, covered, index, related }
// reachable：画面の外にあるとき、利用者がスクロールして届くか（overflow: hidden で切れていれば false）
// seen：数えた重なりの組（主要な要素どうしは、どちらから見ても重なるので1回だけ数える）
function elementIssues(phase, role, el, snapshot, seen = new Set()) {
    const name = `${ROLE_LABELS[role] ?? role}（${el.label}）`;
    const issues = [];
    if (!el.inView && !el.reachable) issues.push(issue(phase, 'offscreen', `${name}が画面の外にあり、スクロールでも届かない`));
    else if (el.covered) issues.push(issue(phase, 'covered', `${name}が ${el.covered} に覆われている`));
    if (el.rect.height < MIN_TAP - 0.5) issues.push(issue(phase, 'small', `${name}の高さが ${Math.round(el.rect.height)}px`));
    else if (el.rect.height < GOOD_TAP - 0.5) issues.push(issue(phase, 'tap-size', `${name}の高さが ${Math.round(el.rect.height)}px`));
    for (const other of snapshot.interactive) {
        // ダイアログの裏に隠れた要素（真ん中が手前に出ていない）とは比べない
        if (other.index === el.index || el.related.includes(other.index) || other.top === false) continue;
        const pair = [el.index, other.index].sort((a, b) => a - b).join('-');
        if (overlaps(el.rect, other.rect) && !seen.has(pair)) {
            seen.add(pair);
            issues.push(issue(phase, 'overlap', `${name}が ${other.label} と重なる`));
        }
    }
    return issues;
}

// 見えている要素が1つもなければ「ない」。required が false の役割は、ないことを問題にしない
export function evaluateTitle(snapshot, { roles = ['portal', 'bgm', 'start', 'help'], optional = [] } = {}) {
    const issues = [];
    const seen = new Set();
    if (horizontalOverflow(snapshot)) issues.push(issue('title', 'h-overflow', `ページの幅が ${snapshot.scroll.width}px（画面は ${snapshot.viewport.width}px）`));
    if (verticalOverflow(snapshot)) issues.push(issue('title', 'v-overflow', `ページの高さが ${snapshot.scroll.height}px（画面は ${snapshot.viewport.height}px）`));
    for (const role of roles) {
        const found = snapshot.elements[role] ?? [];
        if (found.length === 0) {
            if (!optional.includes(role)) issues.push(issue('title', 'missing', `${ROLE_LABELS[role]}が見えない`));
            continue;
        }
        for (const el of usable(role, found)) issues.push(...elementIssues('title', role, el, snapshot, seen));
    }
    return issues;
}

// 一覧へのリンクと BGM の切り替えは、タイトルとプレイ画面に1つずつ置くことが多い。
// 押せるもの（届いて、覆われていない）が1つでもあれば、ダイアログの裏に隠れたほうは判定しない
const MULTI_ROLES = ['portal', 'bgm'];
export function usable(role, found) {
    if (!MULTI_ROLES.includes(role)) return found;
    const ok = found.filter((el) => (el.inView || el.reachable) && !el.covered);
    return ok.length > 0 ? ok : found;
}

// プレイ画面：一覧へのリンクが見えないこと、BGM の切り替えに届くこと、横にはみ出さないこと
export function evaluatePlay(snapshot, { bgm = true } = {}) {
    const issues = [];
    if (horizontalOverflow(snapshot)) issues.push(issue('play', 'h-overflow', `ページの幅が ${snapshot.scroll.width}px（画面は ${snapshot.viewport.width}px）`));
    if (verticalOverflow(snapshot)) issues.push(issue('play', 'v-overflow', `ページの高さが ${snapshot.scroll.height}px（画面は ${snapshot.viewport.height}px）`));
    const portals = (snapshot.elements.portal ?? []).filter((el) => el.inView && !el.covered);
    if (portals.length > 0) issues.push(issue('play', 'portal-in-play', `${ROLE_LABELS.portal}がプレイ中に見える`));
    if (bgm) {
        const toggles = snapshot.elements.bgm ?? [];
        // 設定のダイアログの中に置く作り（katan）は、ダイアログを開けば届く
        if (toggles.length === 0) {
            if (!(snapshot.inDialog?.bgm > 0)) issues.push(issue('play', 'missing', `${ROLE_LABELS.bgm}がプレイ中に見えない`));
        }
        else if (!toggles.some((el) => (el.inView || el.reachable) && !el.covered)) {
            // 開始の直後に、選ぶまで閉じないダイアログ（最初の手札・種族など）が出る作りは許す。閉じれば届く
            const coveredOnly = toggles.find((el) => (el.inView || el.reachable) && el.covered);
            if (coveredOnly) issues.push(issue('play', 'bgm-covered', `${ROLE_LABELS.bgm}（${coveredOnly.label}）が ${coveredOnly.covered} に覆われている`));
            else issues.push(issue('play', 'offscreen', `${ROLE_LABELS.bgm}（${toggles[0].label}）がプレイ中に画面の外にあり、スクロールでも届かない`));
        }
    }
    return issues;
}

// 音の結果（'ok'・'fail'・'n/a'）を問題にする
export function evaluateAudio(audio) {
    const issues = [];
    if (audio.on === 'fail') issues.push(issue('audio', 'audio-on', `開始のボタンを押したあと、BGM が流れていない（${audio.detail ?? ''}）`.replace('（）', '')));
    if (audio.off === 'fail') issues.push(issue('audio', 'audio-off', 'BGM の切り替えを押しても、BGM が止まらない'));
    return issues;
}

// 1つのゲーム・大きさの結果の状態。参考の大きさは失敗を数えない
export function resultStatus(issues, { infoOnly = false } = {}) {
    if (issues.some((item) => item.level === 'fail')) return infoOnly ? 'info' : 'fail';
    if (issues.some((item) => item.level === 'warn')) return 'warn';
    return 'ok';
}

const STATUS_LABELS = { ok: 'OK', warn: '注意', fail: 'NG', info: '参考' };

// 結果の数え上げ：失敗の種類ごとの件数、失敗の多いゲーム、音を確かめられなかったゲーム
export function summarize(results) {
    const failed = results.filter((r) => r.status === 'fail');
    const kinds = {};
    for (const r of failed) {
        for (const kind of new Set(r.issues.filter((item) => item.level === 'fail').map((item) => item.kind))) kinds[kind] = (kinds[kind] ?? 0) + 1;
    }
    const warnings = {};
    for (const r of results.filter((x) => x.status !== 'info')) {
        for (const kind of new Set(r.issues.filter((item) => item.level === 'warn').map((item) => item.kind))) warnings[kind] = (warnings[kind] ?? 0) + 1;
    }
    const byGame = {};
    for (const r of failed) byGame[r.game] = (byGame[r.game] ?? 0) + r.issues.filter((item) => item.level === 'fail').length;
    const audioNa = [...new Set(results.filter((r) => r.audio && (r.audio.on === 'n/a' || r.audio.off === 'n/a')).map((r) => r.game))].sort();
    const count = (status) => results.filter((r) => r.status === status).length;
    return {
        total: results.length,
        games: new Set(results.map((r) => r.game)).size,
        ok: count('ok'), warn: count('warn'), fail: failed.length, info: count('info'),
        kinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]),
        warnings: Object.entries(warnings).sort((a, b) => b[1] - a[1]),
        worst: Object.entries(byGame).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
        audioNa
    };
}

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// 結果の表（Markdown）。full：注意だけ・問題のない組も表に出す
export function formatMarkdown(results, { full = false } = {}) {
    const s = summarize(results);
    const lines = [
        '# 画面の検査の結果',
        '',
        `${s.games} 本・${s.total} 件：OK ${s.ok}・注意 ${s.warn}・NG ${s.fail}・参考 ${s.info}`,
        ''
    ];
    if (s.kinds.length > 0) {
        lines.push('## NG の種類', '', '| 種類 | 件数 |', '|---|--:|');
        for (const [kind, n] of s.kinds) lines.push(`| ${KINDS[kind]?.label ?? kind}（${kind}） | ${n} |`);
        lines.push('');
    }
    if (s.warnings.length > 0) {
        lines.push('## 注意（失敗には数えない）', '', '| 種類 | 件数 |', '|---|--:|');
        for (const [kind, n] of s.warnings) lines.push(`| ${KINDS[kind]?.label ?? kind}（${kind}） | ${n} |`);
        lines.push('');
    }
    // 注意だけの組は件数が多い（押す場所の高さ）ので、表には NG と参考だけを出す。full ですべて出す
    const rows = [...results]
        .filter((r) => full || r.status === 'fail' || r.status === 'info')
        .sort((a, b) => (a.game < b.game ? -1 : a.game > b.game ? 1 : Object.keys(SIZES).indexOf(a.size) - Object.keys(SIZES).indexOf(b.size)));
    if (rows.length > 0) {
        lines.push('## ゲームごと', '', '| ゲーム | 大きさ | 結果 | 音（ON / OFF） | 理由 |', '|---|---|---|---|---|');
        for (const r of rows) {
            const reasons = r.issues.map((item) => `${item.level === 'fail' ? '' : '（注意）'}${item.message}`);
            const audio = r.audio ? `${r.audio.on} / ${r.audio.off}` : '-';
            lines.push(`| ${r.game} | ${r.size} | ${STATUS_LABELS[r.status] ?? r.status} | ${audio} | ${cell(reasons.join('<br>') || '-')} |`);
        }
        lines.push('');
    }
    if (s.audioNa.length > 0) lines.push(`音を確かめられなかったゲーム（n/a）：${s.audioNa.join('、')}`, '');
    return lines.join('\n');
}
