// ゲームの画面を、ヘッドレス Chrome で開いて確かめる（はみ出し・主要なボタン・開始・BGM・エラー）
// - タイトル画面：横のはみ出し、縦のスクロール（注意）、コンソールのエラーと読み込みの失敗、
//   「← ゲーム一覧」・BGM の切り替え・開始・遊び方のボタンが見えて、届き、44px 以上で、ほかの操作の要素と重ならないこと
// - 開始のボタンを押したあと（プレイ画面）：一覧へのリンクが見えないこと、BGM の切り替えに届くこと、横のはみ出し、エラー
// - 音：開始のボタンを押したあと BGM が流れ、BGM の切り替えを押すと止まること（確かめられないゲームは n/a）
// - 判定は scripts/layout-check-rules.mjs、決まりと閾値は docs/standards.md の「ブラウザでの画面の検査」
// 使い方:
//   node scripts/layout-check.mjs abalone azul            指定したゲームを、ゲームの向きのスマホの大きさだけで（手元で直したあと）
//   node scripts/layout-check.mjs --sizes all             全ゲームを、スマホ縦・スマホ横・PC で（CI）
//   node scripts/layout-check.mjs --shard 1/4 --sizes all  4つに分けた1つ目（CI の並列）
//   node scripts/layout-check.mjs --site _site …          build-site.mjs で集めた _site/ を配る（省くと games/ から直接、同じ形で配る）
//   node scripts/layout-check.mjs --report <フォルダ>      分けて流した results.json を集めて、表を出す
// 結果は --out のフォルダ（省くと一時フォルダ）の results.json・results.md と、失敗した画面の PNG。失敗があれば終了コード1
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import http from 'node:http';
import { join, dirname, extname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../packages/netplay-kit/tools/chrome.mjs';
import { PRIVATE } from './portal/metadata.mjs';
import {
    SIZES, parseArgs, sizeNames, isInfoOnly, shardGames, evaluateTitle, evaluatePlay, evaluateAudio,
    resultStatus, issue, formatMarkdown, summarize, KINDS
} from './layout-check-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'games');

// ゲームの package.json の layoutCheck に書ける欄（標準の id や文言で見つからないゲームだけが書く）
const HINT_KEYS = ['start', 'help', 'bgmToggle', 'portalOpen'];

// 主要な要素を探す CSS セレクタ。前から順に試し、見えている要素があった最初のものを使う
const SELECTORS = {
    titleRoot: ['#screen-title', '#title-screen', '#screen-setup', '#topScreen', '.title-screen'],
    start: ['#start', '#start-button', '#start-local', '#start-cpu'],
    help: ['#open-help-title'],
    portal: ['.portal-link'],
    bgm: ['.sound-toggle', '.bgm-toggle']
};

const readJson = (path) => {
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
};
const publicDir = (game) => (existsSync(join(gamesDir, game, 'public')) ? join(gamesDir, game, 'public') : join(gamesDir, game));

// ゲームの向き・手がかり・BGM の作りを package.json と manifest から読む
export function gameConfig(game) {
    const pkg = readJson(join(gamesDir, game, 'package.json')) ?? {};
    const manifest = readJson(join(publicDir(game), 'manifest.webmanifest')) ?? {};
    const hints = pkg.layoutCheck ?? {};
    const errors = Object.keys(hints).filter((key) => !HINT_KEYS.includes(key)).map((key) => `package.json の layoutCheck.${key} は決めた欄にない（${HINT_KEYS.join('・')}）`);
    const ownSound = Boolean(pkg.standards?.skip?.bgm);
    return {
        game,
        orientation: pkg.standards?.orientation === 'any' ? 'any' : (manifest.orientation ?? 'any'),
        hints,
        errors,
        ownSound,
        selectors: {
            start: hints.start === null ? [] : [hints.start, ...SELECTORS.start].filter(Boolean),
            help: [hints.help, ...SELECTORS.help].filter(Boolean),
            portal: SELECTORS.portal,
            // 独自の音のゲームは、自前の切り替えを layoutCheck.bgmToggle に書く（なければ確かめない）
            bgm: ownSound ? [hints.bgmToggle].filter(Boolean) : [hints.bgmToggle, ...SELECTORS.bgm].filter(Boolean),
            titleRoot: SELECTORS.titleRoot
        },
        noStart: hints.start === null,
        portalOpen: hints.portalOpen ?? null
    };
}

const listGames = () => readdirSync(gamesDir).filter((name) => existsSync(join(gamesDir, name, 'package.json'))).sort();

// ---- 配信（本番の GitHub Pages と同じ形：/<ゲーム>/ に、公開するファイルを置く）

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8'
};

// site を渡すと、そのフォルダ（_site/）をそのまま配る。省くと games/ から build-site.mjs と同じ選び方で配る
function resolveFile(pathname, site) {
    const parts = decodeURIComponent(pathname).split('/').filter(Boolean);
    if (parts.some((part) => part === '..' || part.includes(sep))) return null;
    if (site) return join(site, ...parts);
    const [game, ...rest] = parts;
    if (!game || !existsSync(join(gamesDir, game, 'package.json'))) return null;
    const base = publicDir(game);
    if (base === join(gamesDir, game) && rest.length > 0 && PRIVATE.has(rest[0])) return null;
    return join(base, ...rest);
}

function startServer(site) {
    const server = http.createServer((request, response) => {
        const { pathname } = new URL(request.url, 'http://localhost');
        let file = resolveFile(pathname, site);
        if (file && existsSync(file) && statSync(file).isDirectory()) {
            if (!pathname.endsWith('/')) {
                response.writeHead(301, { Location: `${pathname}/` });
                response.end();
                return;
            }
            file = join(file, 'index.html');
        }
        if (!file || !existsSync(file)) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('not found');
            return;
        }
        response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(readFileSync(file));
    });
    // ポートは OS に選ばせる（ほかのセッションの配信や、8080 とぶつからない）
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

// 空いているポートを OS に選ばせる（Chrome のデバッグ用。launchChrome は使われているポートを断る）
const freePort = () => new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
});

// ---- DevTools Protocol（launchChrome の接続はコンソールしか受け取らないので、例外と通信のイベントを受ける接続を別に持つ）

async function connect(port) {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', () => reject(new Error('Chrome につなげませんでした')));
    });
    let nextId = 0;
    const pending = new Map();
    const listeners = new Map(); // sessionId → (method, params) を受け取る関数
    ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(`${message.error.message}`));
            else resolve(message.result);
        } else if (message.method && message.sessionId) {
            listeners.get(message.sessionId)?.(message.method, message.params);
        }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
    // 閉じ終わるのを待つ（先に Chrome を止めると、閉じる手続きの返事が来ず、node が 30 秒ほど終わらない）
    const close = () => new Promise((resolve) => {
        ws.addEventListener('close', resolve);
        setTimeout(resolve, 2000);
        ws.close();
    });
    return { send, listeners, close };
}

// ---- ページの中で動かす関数（toString して送る。外の変数は使えない）

// 読み込む前に入れる：AudioContext と、共通の音のエンジンのプレイヤーを記録する
function installProbe() {
    const state = { contexts: [], players: [], marked: {} };
    Object.defineProperty(window, '__layoutCheck', { value: state });
    const Original = window.AudioContext;
    if (typeof Original === 'function') {
        const Wrapped = function AudioContext(...args) {
            const context = new Original(...args);
            state.contexts.push(context);
            return context;
        };
        Wrapped.prototype = Original.prototype;
        window.AudioContext = Wrapped;
    }
    // engine.js は globalThis.Sound = Sound で公開する。そこで createPlayer を包み、作ったプレイヤーを記録する
    let sound;
    Object.defineProperty(globalThis, 'Sound', {
        configurable: true,
        enumerable: true,
        get: () => sound,
        set(value) {
            sound = value;
            if (value && typeof value.createPlayer === 'function' && !value.createPlayer.layoutCheck) {
                const create = value.createPlayer;
                const wrapped = (...args) => {
                    const player = create.apply(value, args);
                    state.players.push(player);
                    return player;
                };
                wrapped.layoutCheck = true;
                value.createPlayer = wrapped;
            }
        }
    });
}

// 字体を待ち、ボタンの位置とページの大きさが 3 回続けて変わらなくなるまで待つ
async function settle(maxMs) {
    await Promise.race([document.fonts?.ready, new Promise((resolve) => setTimeout(resolve, maxMs))]);
    const signature = () => {
        const d = document.documentElement;
        const boxes = [...document.querySelectorAll('button, a, input, canvas, section, dialog')].slice(0, 120).map((el) => {
            const r = el.getBoundingClientRect();
            return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
        });
        return `${d.scrollWidth}x${d.scrollHeight}|${boxes.join(';')}`;
    };
    let last = signature();
    let stable = 0;
    const start = performance.now();
    while (performance.now() - start < maxMs) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const now = signature();
        if (now === last) {
            if (++stable >= 3) return true;
        } else {
            stable = 0;
            last = now;
        }
    }
    return false;
}

// 画面の数値を集める。spec：{ width, height, selectors, roles }
function collectSnapshot(spec) {
    const EDGE = 1;
    const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
    const START_TEXT = /^(ゲーム)?(を)?(開始|スタート|はじめる|始める|対局開始|ゲームスタート)/;
    const HELP_TEXT = /遊び方|ルール/;
    const viewport = { width: spec.width, height: spec.height };
    const state = window.__layoutCheck;

    const isVisible = (el) => {
        if (!el.isConnected) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        if (getComputedStyle(el).visibility === 'hidden') return false;
        for (let node = el; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.display === 'none' || Number(style.opacity) === 0) return false;
        }
        return true;
    };
    const label = (el) => {
        if (el.id) return `#${el.id}`;
        const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14);
        const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '';
        return `${el.tagName.toLowerCase()}${cls}${text ? `「${text}」` : ''}`;
    };
    const box = (r) => ({ x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 });
    const within = (r) => r.x >= -EDGE && r.y >= -EDGE && r.x + r.width <= viewport.width + EDGE && r.y + r.height <= viewport.height + EDGE;
    const pageElement = (n) => n === document.scrollingElement || n === document.documentElement || n === document.body;
    // 利用者がその向きにスクロールできるか（overflow: hidden で切っていれば、スクリプトでしか動かない）
    const userScrollable = (n, axis) => {
        const key = axis === 'y' ? 'overflowY' : 'overflowX';
        if (pageElement(n)) return ![getComputedStyle(document.documentElement)[key], getComputedStyle(document.body)[key]].some((v) => v === 'hidden' || v === 'clip');
        return ['auto', 'scroll'].includes(getComputedStyle(n)[key]);
    };
    const scrollers = (el) => {
        const list = [];
        for (let n = el.parentElement; n; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1) list.push(n);
        if (!list.includes(document.scrollingElement)) list.push(document.scrollingElement);
        return list;
    };

    const interactiveElements = [...document.querySelectorAll(INTERACTIVE)].filter(isVisible);
    // top：真ん中が手前に出ているか（ダイアログの裏に隠れた要素とは、重なりを数えない）。画面の外の要素は手前とみなす
    const onTop = (el) => {
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) return true;
        const hit = document.elementFromPoint(x, y);
        return !hit || el.contains(hit) || hit.contains(el);
    };
    const interactive = interactiveElements.map((el, index) => ({ index, label: label(el), rect: box(el.getBoundingClientRect()), top: onTop(el) }));

    const measure = (el) => {
        const rect = el.getBoundingClientRect();
        const inView = within(rect);
        const saved = scrollers(el).map((n) => [n, n.scrollTop, n.scrollLeft]);
        let reachable = inView;
        let point = rect;
        if (!inView) {
            el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            point = el.getBoundingClientRect();
            const moved = saved.filter(([n, top, left]) => n.scrollTop !== top || n.scrollLeft !== left);
            reachable = within(point) && moved.every(([n, top, left]) => (n.scrollTop === top || userScrollable(n, 'y')) && (n.scrollLeft === left || userScrollable(n, 'x')));
        }
        let covered = null;
        if (within(point)) {
            const hit = document.elementFromPoint(point.x + point.width / 2, point.y + point.height / 2);
            if (hit && !el.contains(hit) && !hit.contains(el)) covered = label(hit);
        }
        for (const [n, top, left] of saved) {
            n.scrollTop = top;
            n.scrollLeft = left;
        }
        const index = interactiveElements.indexOf(el);
        const related = interactiveElements.flatMap((other, i) => (other !== el && (other.contains(el) || el.contains(other)) ? [i] : []));
        return { label: label(el), rect: box(rect), inView, reachable, covered, index, related };
    };

    const visibleRoot = spec.selectors.titleRoot.map((s) => document.querySelector(s)).find((el) => el && isVisible(el)) ?? document.body;
    const firstVisible = (selectors) => {
        for (const selector of selectors) {
            const found = [...document.querySelectorAll(selector)].filter(isVisible);
            if (found.length > 0) return found;
        }
        return [];
    };
    const allVisible = (selectors) => [...new Set(selectors.flatMap((s) => [...document.querySelectorAll(s)]))].filter(isVisible);
    const byText = (pattern) => [...visibleRoot.querySelectorAll('button, a[href], [role="button"]')].filter(isVisible)
        .filter((el) => pattern.test((el.getAttribute('aria-label') || '') + (el.textContent || '').trim()) && !/close|閉じる/.test(`${el.className} ${el.getAttribute('aria-label') ?? ''}`));
    const find = {
        portal: () => allVisible(spec.selectors.portal),
        bgm: () => allVisible(spec.selectors.bgm),
        start: () => {
            // プレイ画面では、タイトルで押した要素がまだ見えているかだけを見る（別の「スタート」の文言のボタンと取り違えない）
            if (spec.keepStart) return (previous.start ?? []).filter(isVisible);
            const found = firstVisible(spec.selectors.start);
            if (found.length > 0 || spec.noStartFallback) return found.slice(0, 1);
            return byText(START_TEXT).filter((el) => START_TEXT.test((el.textContent || '').trim())).slice(0, 1);
        },
        help: () => {
            const found = firstVisible(spec.selectors.help);
            return (found.length > 0 ? found : byText(HELP_TEXT)).slice(0, 1);
        }
    };
    const elements = {};
    const previous = state.marked ?? {};
    // 閉じたダイアログ（設定など）の中にある数。ダイアログを開けば届く
    const inDialog = {};
    state.marked = { ...previous };
    for (const role of spec.roles) {
        const found = find[role]();
        state.marked[role] = found;
        elements[role] = found.map(measure);
        inDialog[role] = (spec.selectors[role] ?? []).flatMap((s) => [...document.querySelectorAll(s)]).filter((el) => el.closest('dialog:not([open])')).length;
    }
    const d = document.documentElement;
    return {
        viewport,
        scroll: { width: Math.max(d.scrollWidth, document.body?.scrollWidth ?? 0), height: Math.max(d.scrollHeight, document.body?.scrollHeight ?? 0) },
        elements,
        inDialog,
        interactive,
        visibility: document.visibilityState
    };
}

// 記録した要素を画面の中に出し、真ん中の座標を返す（押すのは本物のマウスの入力で行う）
function markedCenter(role, index) {
    const el = window.__layoutCheck.marked[role]?.[index];
    if (!el || !el.isConnected) return null;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function audioState() {
    const state = window.__layoutCheck;
    const position = (player) => {
        try { return player.position(); } catch { return null; }
    };
    return {
        players: state.players.length,
        playing: state.players.some((player) => position(player) !== null),
        contexts: state.contexts.map((context) => context.state)
    };
}

const foundLabels = (snapshot) => Object.fromEntries(Object.entries(snapshot.elements).map(([role, list]) => [role, list.map((el) => `${el.label} ${Math.round(el.rect.width)}×${Math.round(el.rect.height)}${el.covered ? ` 覆い:${el.covered}` : ''}${el.inView ? '' : el.reachable ? ' スクロール' : ' 届かない'}`)]));

const call = (fn, ...args) => `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(', ')})`;

// ---- 1つのゲーム・大きさを確かめる

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkOne(cdp, baseUrl, config, sizeName, { out, timeout, infoOnly }) {
    const size = SIZES[sizeName];
    const started = Date.now();
    const issues = [];
    const shots = [];
    const found = {}; // 見つけた主要な要素（どの要素で判定したかを、あとで確かめるため）
    let audio = null;
    const problems = { console: [], requests: [] };
    const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
    let sessionId = null;
    let phase = 'title';
    const deadline = started + timeout;
    const remaining = () => Math.max(500, deadline - Date.now());

    const evaluate = async (expression, label = '') => {
        const result = await Promise.race([
            cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId),
            sleep(remaining()).then(() => { throw new Error(`時間切れ（${timeout / 1000} 秒）${label}`); })
        ]);
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        return result.result.value;
    };
    const waitFor = async (expression, ms) => {
        const end = Date.now() + Math.min(ms, remaining());
        while (Date.now() < end) {
            if (await evaluate(expression)) return true;
            await sleep(150);
        }
        return false;
    };
    const click = async (role, index = 0) => {
        const point = await evaluate(call(markedCenter, role, index));
        if (!point) return false;
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
            await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }, sessionId);
        }
        return true;
    };
    const shoot = async (name) => {
        if (infoOnly || !out) return;
        const file = `${config.game}-${sizeName}-${name}.png`;
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
        writeFileSync(join(out, file), Buffer.from(data, 'base64'));
        shots.push(file);
    };
    const takeErrors = () => {
        const found = [
            ...problems.console.map((text) => issue(phase, 'console-error', text)),
            ...problems.requests.map((text) => issue(phase, 'request-failed', text))
        ];
        problems.console = [];
        problems.requests = [];
        return found;
    };

    try {
        for (const message of config.errors) issues.push(issue('title', 'load', message));
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
        ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
        const requests = new Map();
        let loaded = false;
        cdp.listeners.set(sessionId, (method, params) => {
            if (method === 'Runtime.exceptionThrown') {
                const d = params.exceptionDetails;
                problems.console.push(`例外：${(d.exception?.description ?? d.text ?? '').split('\n')[0]}`);
            } else if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
                problems.console.push(`console.error：${params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ').split('\n')[0]}`);
            } else if (method === 'Network.requestWillBeSent') {
                requests.set(params.requestId, params.request.url);
            } else if (method === 'Network.responseReceived' && params.response.status >= 400) {
                problems.requests.push(`${params.response.status} ${new URL(params.response.url).pathname}`);
            } else if (method === 'Network.loadingFailed' && !params.blockedReason && !params.canceled) {
                const url = requests.get(params.requestId) ?? '';
                // 外への要求（Google Fonts など）は止めているので数えない
                if (url.startsWith(baseUrl)) problems.requests.push(`${params.errorText} ${new URL(url).pathname}`);
            } else if (method === 'Page.loadEventFired') {
                loaded = true;
            }
        });
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Network.enable', {}, sessionId);
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
        // 外への要求は止める（CI とオフラインで結果を同じにする。字体は代わりのもので描く）
        await cdp.send('Network.setBlockedURLs', { urls: ['https://*', 'wss://*'] }, sessionId);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.mobile ? 2 : 1, mobile: size.mobile }, sessionId);
        if (size.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installProbe.toString()})()` }, sessionId);

        await cdp.send('Page.navigate', { url: `${baseUrl}/${config.game}/` }, sessionId);
        const loadEnd = Date.now() + Math.min(15000, remaining());
        while (!loaded && Date.now() < loadEnd) await sleep(100);
        if (!loaded) throw new Error('読み込みが終わらない（15 秒）');
        await evaluate(call(settle, 4000));

        // ---- タイトル画面
        if (config.portalOpen) {
            await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(config.portalOpen)}); if (el) el.click(); return true; })()`);
            await evaluate(call(settle, 2000));
            const portalSnapshot = await evaluate(call(collectSnapshot, { ...size, selectors: config.selectors, roles: ['portal'] }));
            issues.push(...evaluateTitle(portalSnapshot, { roles: ['portal'] }).filter((item) => !['h-overflow', 'v-overflow'].includes(item.kind)));
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
            await evaluate(`(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); return true; })()`);
            await evaluate(call(settle, 2000));
        }
        const titleRoles = ['bgm', 'start', 'help', ...(config.portalOpen ? [] : ['portal'])];
        const optional = [...(config.noStart ? ['start'] : []), ...(config.selectors.bgm.length === 0 ? ['bgm'] : [])];
        const title = await evaluate(call(collectSnapshot, { ...size, selectors: config.selectors, roles: titleRoles, noStartFallback: config.noStart }));
        found.title = foundLabels(title);
        issues.push(...evaluateTitle(title, { roles: titleRoles, optional }));
        issues.push(...takeErrors());
        if (issues.some((item) => item.level === 'fail')) await shoot('title');

        // ---- 開始のボタンを押す（これが最初の操作になり、音が使えるようになる）
        const hasStart = title.elements.start.length > 0;
        if (hasStart) {
            phase = 'play';
            await click('start');
            await sleep(400);
            await evaluate(call(settle, 4000));
            const play = await evaluate(call(collectSnapshot, { ...size, selectors: config.selectors, roles: ['portal', 'bgm', 'start'], keepStart: true }));
            found.play = foundLabels(play);
            const playIssues = [];
            const stillTitle = play.elements.start.some((el) => el.inView && !el.covered);
            if (stillTitle) playIssues.push(issue('play', 'start-failed', '開始のボタンを押しても、タイトル画面のまま'));
            else playIssues.push(...evaluatePlay(play, { bgm: config.selectors.bgm.length > 0 }));
            playIssues.push(...takeErrors());
            issues.push(...playIssues);
            if (playIssues.some((item) => item.level === 'fail')) await shoot('play');

            // ---- 音
            phase = 'audio';
            audio = { on: 'n/a', off: 'n/a' };
            const engine = await waitFor(`window.__layoutCheck.players.length > 0 && ${call(audioState)}.playing`, 4000);
            const state = await evaluate(call(audioState));
            if (state.players > 0) {
                audio.on = engine ? 'ok' : 'fail';
                if (!engine) audio.detail = `プレイヤー ${state.players}・AudioContext ${state.contexts.join(',') || 'なし'}`;
                const toggles = play.elements.bgm.filter((el) => (el.inView || el.reachable) && !el.covered);
                if (engine && toggles.length > 0 && !stillTitle) {
                    await click('bgm', play.elements.bgm.indexOf(toggles[0]));
                    audio.off = (await waitFor(`!${call(audioState)}.playing`, 2000)) ? 'ok' : 'fail';
                }
            } else if (state.contexts.includes('running')) {
                // 独自の音：AudioContext が動いていれば鳴らせる状態。止まったかは外から分からない
                audio.on = 'ok';
            } else if (!config.ownSound) {
                audio.on = 'fail';
                audio.detail = '共通の音のエンジンのプレイヤーが作られていない';
            }
            issues.push(...evaluateAudio(audio));
            issues.push(...takeErrors());
        }
    } catch (error) {
        issues.push(issue(phase, 'load', error.message.split('\n')[0]));
        issues.push(...takeErrors());
        try { await shoot(phase); } catch { /* 撮れなくても続ける */ }
    } finally {
        if (sessionId) cdp.listeners.delete(sessionId);
        await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    }
    return {
        game: config.game,
        size: sizeName,
        orientation: config.orientation,
        infoOnly,
        status: resultStatus(issues, { infoOnly }),
        issues,
        audio,
        found,
        shots,
        ms: Date.now() - started
    };
}

// ---- 結果を集める（--report）

function collectResults(dir) {
    const files = [];
    const walk = (path) => {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            if (entry.isDirectory()) walk(join(path, entry.name));
            else if (entry.name === 'results.json') files.push(join(path, entry.name));
        }
    };
    walk(dir);
    return files.flatMap((file) => readJson(file)?.results ?? []);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.report) {
        const results = collectResults(options.report);
        console.log(formatMarkdown(results));
        process.exitCode = results.some((r) => r.status === 'fail') ? 1 : 0;
        return;
    }
    const all = listGames();
    const unknown = options.games.filter((game) => !all.includes(game));
    if (unknown.length > 0) throw new Error(`ゲームがありません: ${unknown.join(', ')}`);
    const games = shardGames(options.games.length > 0 ? options.games : all, options.shard);
    const tasks = games.flatMap((game) => {
        const config = gameConfig(game);
        return sizeNames(options.sizes, config.orientation).map((size) => ({ config, size, infoOnly: isInfoOnly(size, config.orientation) }));
    });
    const out = resolve(options.out ?? join(tmpdir(), 'web-games-layout-check'));
    mkdirSync(out, { recursive: true });
    const site = options.site ? resolve(options.site) : null;
    if (site && !existsSync(join(site, 'index.html'))) throw new Error(`${options.site} に index.html がありません（先に node scripts/build-site.mjs）`);

    const server = await startServer(site);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    let chrome = null;
    let cdp = null;
    const results = [];
    const started = Date.now();
    try {
        const port = await freePort();
        chrome = await launchChrome({ port });
        cdp = await connect(port);
        let next = 0;
        const worker = async () => {
            while (next < tasks.length) {
                const task = tasks[next++];
                const result = await checkOne(cdp, baseUrl, task.config, task.size, { out, timeout: options.timeout, infoOnly: task.infoOnly });
                results.push(result);
                const reasons = result.issues.filter((item) => item.level === 'fail').map((item) => KINDS[item.kind]?.label ?? item.kind);
                console.log(`${{ ok: 'OK  ', warn: '注意', fail: 'NG  ', info: '参考' }[result.status]} ${result.game} ${result.size}${reasons.length > 0 ? `：${[...new Set(reasons)].join('・')}` : ''}`);
            }
        };
        await Promise.all(Array.from({ length: Math.min(options.jobs, tasks.length) }, worker));
    } finally {
        await cdp?.close();
        await chrome?.close();
        // Chrome の keep-alive の接続が残っていると、close が待ち続ける
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }

    const markdown = formatMarkdown(results);
    writeFileSync(join(out, 'results.json'), `${JSON.stringify({ sizes: options.sizes, shard: options.shard, results }, null, 2)}\n`);
    writeFileSync(join(out, 'results.md'), `${markdown}\n`);
    const s = summarize(results);
    console.log(`\n${s.games} 本・${s.total} 件（${((Date.now() - started) / 1000).toFixed(1)} 秒）：OK ${s.ok}・注意 ${s.warn}・NG ${s.fail}・参考 ${s.info}`);
    for (const [kind, n] of s.kinds) console.log(`  ${KINDS[kind]?.label ?? kind}：${n}`);
    console.log(`結果：${join(out, 'results.md')}`);
    process.exitCode = s.fail > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 2;
    }).finally(() => process.exit());
}
