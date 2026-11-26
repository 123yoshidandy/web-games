// 画面の検査の判定（scripts/layout-check-rules.mjs）のテスト。ブラウザは使わない
// 使い方: node --test scripts/layout-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseArgs, sizeNames, isInfoOnly, shardGames, intersection, overlaps, inViewport,
    evaluateTitle, evaluatePlay, evaluateAudio, resultStatus, summarize, formatMarkdown, usable, issue
} from './layout-check-rules.mjs';

const viewport = { width: 390, height: 664 };
const rect = (x, y, width, height) => ({ x, y, width, height });
// 届いて、覆われず、44px の要素
const el = (index, box, extra = {}) => ({ label: `#e${index}`, rect: box, inView: true, reachable: true, covered: null, index, related: [], ...extra });
const snapshot = (elements, interactive = [], extra = {}) => ({
    viewport,
    scroll: { width: 390, height: 664 },
    elements,
    interactive,
    inDialog: {},
    ...extra
});
const goodTitle = () => {
    const portal = el(0, rect(10, 10, 100, 44));
    const bgm = el(1, rect(200, 10, 60, 44));
    const start = el(2, rect(100, 500, 190, 48));
    const help = el(3, rect(280, 10, 60, 44));
    const all = [portal, bgm, start, help];
    return snapshot({ portal: [portal], bgm: [bgm], start: [start], help: [help] }, all.map((e) => ({ index: e.index, label: e.label, rect: e.rect, top: true })));
};
const kinds = (issues) => issues.map((item) => item.kind);

test('引数：ゲームの名前・大きさ・出力先・分け方を読む', () => {
    const options = parseArgs(['games/azul/', 'abalone', '--sizes', 'all', '--out', 'x', '--shard', '2/4', '--jobs', '2']);
    assert.deepEqual(options.games, ['azul', 'abalone']);
    assert.equal(options.sizes, 'all');
    assert.equal(options.out, 'x');
    assert.deepEqual(options.shard, { index: 2, total: 4 });
    assert.equal(options.jobs, 2);
    assert.equal(parseArgs([]).sizes, 'phone');
    assert.throws(() => parseArgs(['--shard', '5/4']));
    assert.throws(() => parseArgs(['--sizes', 'tablet']));
    assert.throws(() => parseArgs(['--verbose']));
});

test('大きさ：phone はゲームの向きのスマホ、all は3つ。反対の向きは参考', () => {
    assert.deepEqual(sizeNames('phone', 'portrait'), ['portrait']);
    assert.deepEqual(sizeNames('phone', 'any'), ['portrait']);
    assert.deepEqual(sizeNames('phone', 'landscape'), ['landscape']);
    assert.deepEqual(sizeNames('all', 'portrait'), ['portrait', 'landscape', 'desktop']);
    assert.deepEqual(sizeNames('landscape,desktop', 'portrait'), ['landscape', 'desktop']);
    assert.equal(isInfoOnly('landscape', 'portrait'), true);
    assert.equal(isInfoOnly('portrait', 'landscape'), true);
    assert.equal(isInfoOnly('landscape', 'any'), false);
    assert.equal(isInfoOnly('desktop', 'portrait'), false);
});

test('分け方：名前の順に配り、全部の組でもれも重なりもない', () => {
    const games = ['a', 'b', 'c', 'd', 'e'];
    const parts = [1, 2, 3].map((index) => shardGames(games, { index, total: 3 }));
    assert.deepEqual(parts, [['a', 'd'], ['b', 'e'], ['c']]);
    assert.deepEqual(shardGames(games, null), games);
});

test('重なり：食い込みが 2px 以下なら数えない。接するだけ・離れていれば重ならない', () => {
    assert.deepEqual(intersection(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), { width: 5, height: 5 });
    assert.equal(intersection(rect(0, 0, 10, 10), rect(10, 0, 10, 10)), null);
    assert.equal(overlaps(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), true);
    assert.equal(overlaps(rect(0, 0, 10, 10), rect(8, 0, 10, 10)), false);
    assert.equal(inViewport(rect(0, 0, 390, 664), viewport), true);
    assert.equal(inViewport(rect(0, 600, 100, 80), viewport), false);
});

test('タイトル：そろった画面は問題なし', () => {
    assert.deepEqual(evaluateTitle(goodTitle()), []);
});

test('タイトル：横のはみ出しは失敗、縦のスクロールは注意', () => {
    const s = goodTitle();
    s.scroll = { width: 392, height: 900 };
    const issues = evaluateTitle(s);
    assert.deepEqual(kinds(issues), ['h-overflow', 'v-overflow']);
    assert.equal(resultStatus(issues), 'fail');
    s.scroll.width = 390.5; // 丸めの誤差は数えない
    assert.equal(resultStatus(evaluateTitle(s)), 'warn');
});

test('タイトル：ない・届かない・覆われる・低い・重なる', () => {
    const s = goodTitle();
    s.elements.help = [];
    s.elements.start[0] = { ...s.elements.start[0], inView: false, reachable: false };
    s.elements.bgm[0] = { ...s.elements.bgm[0], rect: rect(200, 10, 60, 30) };
    s.elements.portal[0] = { ...s.elements.portal[0], rect: rect(10, 10, 100, 20) };
    assert.deepEqual(kinds(evaluateTitle(s)), ['small', 'tap-size', 'offscreen', 'missing']);
    const t = goodTitle();
    t.elements.start[0] = { ...t.elements.start[0], covered: 'div.overlay' };
    assert.deepEqual(kinds(evaluateTitle(t)), ['covered']);
});

test('タイトル：スクロールで届くなら、画面の外でも失敗にしない', () => {
    const s = goodTitle();
    s.elements.start[0] = { ...s.elements.start[0], inView: false, reachable: true };
    s.scroll.height = 800;
    assert.deepEqual(kinds(evaluateTitle(s)), ['v-overflow']);
});

test('タイトル：主要な要素どうしの重なりは1回だけ数える。入れ子と、裏に隠れた要素は数えない', () => {
    const s = goodTitle();
    s.elements.bgm[0].rect = rect(250, 10, 60, 44);
    s.interactive[1].rect = s.elements.bgm[0].rect;
    const issues = evaluateTitle(s);
    assert.deepEqual(kinds(issues), ['overlap']);
    const t = goodTitle();
    t.interactive.push({ index: 9, label: 'button.key', rect: rect(20, 20, 30, 30), top: false });
    t.interactive.push({ index: 8, label: 'div.wrap', rect: rect(0, 0, 120, 60), top: true });
    t.elements.portal[0].related = [8];
    assert.deepEqual(evaluateTitle(t), []);
});

test('タイトル：一覧へのリンクや BGM の切り替えが複数あれば、押せるものだけを判定する', () => {
    const hidden = el(5, rect(0, 0, 28, 28), { covered: '#modal' });
    const shown = el(6, rect(0, 100, 80, 44));
    assert.deepEqual(usable('bgm', [hidden, shown]), [shown]);
    assert.deepEqual(usable('bgm', [hidden]), [hidden]);
    assert.deepEqual(usable('start', [hidden, shown]), [hidden, shown]);
});

test('タイトル：optional の役割は、なくても問題にしない', () => {
    const s = goodTitle();
    s.elements.start = [];
    assert.deepEqual(evaluateTitle(s, { optional: ['start'] }), []);
});

test('プレイ画面：一覧へのリンクが見えると失敗、BGM の切り替えは届けばよい', () => {
    const toggle = el(1, rect(300, 10, 34, 34));
    assert.deepEqual(evaluatePlay(snapshot({ portal: [], bgm: [toggle] })), []);
    const portal = el(0, rect(10, 10, 100, 44));
    assert.deepEqual(kinds(evaluatePlay(snapshot({ portal: [portal], bgm: [toggle] }))), ['portal-in-play']);
    // ダイアログの裏の一覧へのリンクは見えていない
    assert.deepEqual(evaluatePlay(snapshot({ portal: [{ ...portal, covered: '#play' }], bgm: [toggle] })), []);
    assert.deepEqual(kinds(evaluatePlay(snapshot({ portal: [], bgm: [] }))), ['missing']);
    assert.deepEqual(evaluatePlay(snapshot({ portal: [], bgm: [] }), { bgm: false }), []);
});

test('プレイ画面：BGM の切り替えが閉じたダイアログの中なら届く。開始直後のダイアログに覆われるのは注意', () => {
    assert.deepEqual(evaluatePlay(snapshot({ portal: [], bgm: [] }, [], { inDialog: { bgm: 1 } })), []);
    const covered = el(1, rect(300, 10, 34, 34), { covered: '#choose' });
    const issues = evaluatePlay(snapshot({ portal: [], bgm: [covered] }));
    assert.deepEqual(kinds(issues), ['bgm-covered']);
    assert.equal(resultStatus(issues), 'warn');
    const gone = el(1, rect(300, 900, 34, 34), { inView: false, reachable: false });
    assert.deepEqual(kinds(evaluatePlay(snapshot({ portal: [], bgm: [gone] }))), ['offscreen']);
});

test('音：fail だけを問題にし、n/a は問題にしない', () => {
    assert.deepEqual(evaluateAudio({ on: 'ok', off: 'ok' }), []);
    assert.deepEqual(evaluateAudio({ on: 'n/a', off: 'n/a' }), []);
    assert.deepEqual(kinds(evaluateAudio({ on: 'fail', off: 'n/a', detail: 'x' })), ['audio-on']);
    assert.deepEqual(kinds(evaluateAudio({ on: 'ok', off: 'fail' })), ['audio-off']);
});

test('状態：参考の大きさは、失敗があっても参考にする', () => {
    const fail = [issue('title', 'h-overflow', 'x')];
    assert.equal(resultStatus(fail), 'fail');
    assert.equal(resultStatus(fail, { infoOnly: true }), 'info');
    assert.equal(resultStatus([issue('title', 'v-overflow', 'x')]), 'warn');
    assert.equal(resultStatus([]), 'ok');
});

test('結果の表：数え上げと、NG・参考の行、理由、音の n/a', () => {
    const results = [
        { game: 'b', size: 'portrait', status: 'fail', issues: [issue('title', 'h-overflow', 'ページの幅が 400px'), issue('title', 'small', '低い | 線')], audio: { on: 'ok', off: 'ok' } },
        { game: 'a', size: 'desktop', status: 'fail', issues: [issue('play', 'h-overflow', 'ページの幅が 1300px')], audio: { on: 'ok', off: 'n/a' } },
        { game: 'a', size: 'portrait', status: 'warn', issues: [issue('title', 'tap-size', '40px')], audio: { on: 'ok', off: 'ok' } },
        { game: 'a', size: 'landscape', status: 'info', issues: [issue('title', 'offscreen', '届かない')], audio: null },
        { game: 'c', size: 'portrait', status: 'ok', issues: [], audio: { on: 'ok', off: 'ok' } }
    ];
    const s = summarize(results);
    assert.equal(s.total, 5);
    assert.equal(s.games, 3);
    assert.deepEqual([s.ok, s.warn, s.fail, s.info], [1, 1, 2, 1]);
    assert.deepEqual(s.kinds, [['h-overflow', 2], ['small', 1]]);
    assert.deepEqual(s.warnings, [['tap-size', 1]]);
    assert.deepEqual(s.worst, [['b', 2], ['a', 1]]);
    assert.deepEqual(s.audioNa, ['a']);
    const md = formatMarkdown(results);
    const rows = md.split('\n').filter((line) => /^\| [abc] \|/.test(line));
    assert.deepEqual(rows.map((line) => line.split('|')[1].trim() + line.split('|')[2].trim()), ['alandscape', 'adesktop', 'bportrait']);
    assert.match(md, /低い \\\| 線/);
    assert.match(md, /横にはみ出す（h-overflow） \| 2/);
    assert.match(md, /音を確かめられなかったゲーム（n\/a）：a/);
    assert.equal(formatMarkdown(results, { full: true }).split('\n').filter((line) => /^\| [abc] \|/.test(line)).length, 5);
});
