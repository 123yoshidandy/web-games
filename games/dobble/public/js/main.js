/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る（ローカル・オンライン・リプレイで同じ形）
 * 時計：ローカルはコントローラーの now()、オンラインはサーバーの時刻から始まりの時刻を引いたもの
 */

import LocalGameController, { ReplayController } from './game-controller.js';
import { symbolDefs, cardSvg, cardLabel } from './symbol-art.js';
import { commonSymbol, SYMBOL_NAMES } from './deck.js';
import * as storage from './storage.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import * as Motion from './motion/motion.js';

const GAME = 'dobble';
const CPU_NAMES = ['ミナ', 'ソウタ', 'リオ'];
const HUMAN_NAME = 'あなた';
const LEVELS = [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }, { value: 'hard', label: 'つよい' }];
const BEST_LIMIT = 5;
const RESULT_DELAY_MS = 1000;
const CLOCK_MS = 100;
const PING_MS = 1000;       // オンラインで CPU がいる間、サーバーに CPU の時刻を確かめさせる間隔
const TOAST_MS = 1800;
const FLY_MS = 420;
const MARK_MS = 600;        // 当たった・まちがえたマークの印を出しておく時間
const SPEEDS = [1, 2, 4, 8];

const $ = selector => document.querySelector(selector);
const reducedMotion = () => !Motion.enabled();

// 動きの速さを、CSS（--motion-scale・data-motion）に伝え、タイトルの切り替えを作る
const paintMotion = () => {
    document.documentElement.style.setProperty('--motion-scale', Motion.speedScale());
    document.documentElement.dataset.motion = Motion.getSpeed();
};
paintMotion();
Motion.onSpeedChange(paintMotion);
Motion.mountSpeedSetting(document.getElementById('motion-setting'), { label: '' });

const app = {
    scene: 'title',
    controller: null,
    view: null,
    pendingClaim: false,    // 取りにいって、返事を待っている（オンライン）
    lastEventId: null,      // 演出と音を出したできごとの番号
    resultShown: false,
    bestRank: null,         // 今のタイムがベストの何位か
    got: null,              // 当たったマーク（自分のカードに少しの間だけ印を付ける）
    wrong: null,            // まちがえたマーク
    markTimer: null,
    settings: { mode: 'cpu', cpus: 1, level: 'normal', ...storage.load('settings', {}) },
    clockTimer: null,
    pingTimer: null,
    toastTimer: null
};

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// 1:23.4 の形
function formatTime(ms) {
    const tenths = Math.max(0, Math.floor(ms / 100));
    const minutes = Math.floor(tenths / 600);
    const seconds = Math.floor(tenths / 10) % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#screen-title').hidden = scene !== 'title';
    $('#screen-game').hidden = scene !== 'game';
    clearInterval(app.clockTimer);
    app.clockTimer = null;
    if (scene === 'title') {
        updatePing(null);
        renderTitle();
    } else {
        app.clockTimer = setInterval(tickClock, CLOCK_MS);
    }
}

function renderTitle() {
    const { mode, cpus, level } = app.settings;
    const mark = (selector, attr, value) => document.querySelectorAll(`${selector} button`).forEach(button => {
        const on = button.dataset[attr] === String(value);
        button.classList.toggle('on', on);
        button.setAttribute('aria-checked', String(on));
    });
    mark('#mode-select', 'mode', mode);
    mark('#cpu-count', 'count', cpus);
    mark('#level-select', 'level', level);
    $('#cpu-row').hidden = mode !== 'cpu';
    $('#level-row').hidden = mode !== 'cpu';
    $('#best-row').hidden = mode !== 'solo';
    const best = loadBest()[0];
    $('#best-time').textContent = best ? formatTime(best.time) : '—';
    $('#resume').hidden = !LocalGameController.loadSaved();
    $('#online-row').hidden = !online.available;
}

function newSetup() {
    const { mode, cpus, level } = app.settings;
    const players = [{ name: HUMAN_NAME, isCPU: false }];
    if (mode === 'cpu') for (let i = 0; i < cpus; i++) players.push({ name: CPU_NAMES[i], isCPU: true });
    return { mode, players, level };
}

function startGame(setup) {
    beginGame(new LocalGameController(setup, { onUpdate: () => update(), onError: (message) => onGameError(message) }));
}

// ローカル・オンライン・リプレイで同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(controller) {
    if (app.controller && app.controller !== controller) app.controller.stop();
    app.controller = controller;
    app.view = null;
    app.pendingClaim = false;
    app.lastEventId = null;
    app.resultShown = false;
    app.bestRank = null;
    clearMarks();
    hideToast();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('game');
    update();
}

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (app.controller?.isOnline) return online.confirmLeave();
    app.controller?.stop();
    app.controller = null;
    app.view = null;
    hideToast();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

// ===== オンライン対戦（入口とロビーは netplay-lobby.js の画面） =====

const online = new NetplayLobby({
    title: 'ドブル',
    game: 'dobble',
    serverUrl: getServerUrl(),
    minPlayers: 2,
    maxPlayers: 4,
    settings: [{ key: 'level', label: 'CPU の強さ', options: LEVELS }],
    onStart: (controller) => beginGame(controller),
    onUpdate: () => update(),
    onError: (message) => onGameError(message),
    onExit: () => {
        app.controller = null;
        app.view = null;
        hideToast();
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        showScene('title');
    }
});
app.online = online;

// オンラインで CPU（抜けた人の席を含む）がいる間は、サーバーが CPU の取る時刻を確かめられるよう ping を送る
function updatePing(view) {
    const need = Boolean(view && app.controller?.isOnline && view.phase === 'play' && view.players.some(player => player.isCPU));
    if (need && !app.pingTimer) {
        app.pingTimer = setInterval(() => app.controller?.net?.ping(), PING_MS);
    } else if (!need && app.pingTimer) {
        clearInterval(app.pingTimer);
        app.pingTimer = null;
    }
}

// ===== 時計 =====

// 始まりからの経過ミリ秒（終わっていれば終わりの時刻）
function clockNow(view = app.view) {
    if (!view || !app.controller) return 0;
    if (view.phase === 'end') return view.endT ?? view.lastT;
    if (app.controller.isOnline) return view.startedAt ? Math.max(0, app.controller.net.serverNow() - view.startedAt) : 0;
    return app.controller.now();
}

function lockRemaining(view = app.view) {
    if (!view || view.viewer === null || view.phase !== 'play') return 0;
    return Math.max(0, view.players[view.viewer].lockUntil - clockNow(view));
}

function tickClock() {
    const view = app.view;
    if (!view) return;
    $('#clock').textContent = formatTime(clockNow(view));
    const remaining = lockRemaining(view);
    $('#lock').hidden = remaining <= 0;
    $('#table').classList.toggle('locked', remaining > 0);
    if (remaining > 0) $('#lock-text').textContent = `あと ${(remaining / 1000).toFixed(1)} 秒`;
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const view = app.controller.getView();
    if (!view) return;
    const previous = app.view;
    const before = measureCenter();
    const lastId = view.events.length ? view.events[view.events.length - 1].id : 0;
    const fresh = app.lastEventId === null ? [] : view.events.filter(event => event.id > app.lastEventId);
    app.lastEventId = Math.max(app.lastEventId ?? 0, lastId);

    if (!previous || view.commandCount !== previous.commandCount || fresh.length) app.pendingClaim = false;
    for (const event of fresh) {
        if (event.seat !== view.viewer) continue;
        if (event.type === 'take') setMark('got', event.symbol);
        else if (event.type === 'wrong') setMark('wrong', event.symbol);
    }

    app.view = view;
    render(view, previous);
    animate(fresh, before, view);
    if (previous) playSounds(fresh, view);
    updatePing(view);

    if (view.phase === 'end' && !app.resultShown) {
        app.resultShown = true;
        recordLocalResult(view);
        onFinished(view);
        Motion.afterIdle(() => showResult(), previous ? RESULT_DELAY_MS : 0);
    }
}

// 当たった・まちがえたマークに、少しの間だけ印を付ける
function setMark(kind, symbol) {
    app.got = kind === 'got' ? symbol : null;
    app.wrong = kind === 'wrong' ? symbol : null;
    clearTimeout(app.markTimer);
    app.markTimer = setTimeout(() => {
        clearMarks();
        if (app.view && app.scene === 'game') renderCards(app.view);
    }, MARK_MS);
}

function clearMarks() {
    clearTimeout(app.markTimer);
    app.got = null;
    app.wrong = null;
}

function render(view, previous = null) {
    const replay = Boolean(app.controller?.isReplay);
    $('#hint').hidden = replay;
    $('#speed').hidden = !replay;
    $('#replay-label').hidden = !replay;
    $('#result-button').hidden = view.phase !== 'end';
    renderPlayers(view);
    fitTable();
    renderCards(view, previous);
    const me = view.viewer === null ? null : view.players[view.viewer];
    $('#pile-count').textContent = `残り ${view.pileCount}`;
    $('#taken-count').textContent = `取った ${me ? me.taken : 0}`;
    $('#wrong-count').textContent = `ミス ${me ? me.wrong : 0}`;
    tickClock();
}

function renderPlayers(view) {
    const solo = view.players.length === 1;
    $('#players').hidden = solo;
    if (solo) return;
    $('#players').innerHTML = view.players.map(player => `
        <div class="player${player.seat === view.viewer ? ' me' : ''}" data-seat="${player.seat}">
            <span class="pname">${escapeHtml(player.name)}</span>
            <span class="pscore">${player.score}</span>
        </div>`).join('');
}

function renderCards(view, previous = null) {
    const me = view.viewer === null ? null : view.players[view.viewer];
    const center = $('#center-card');
    center.innerHTML = cardSvg(view.center, { highlight: view.hintSymbol, wrong: app.wrong });
    center.classList.toggle('last', view.pileCount <= 1);
    center.setAttribute('aria-label', `真ん中のカード：${cardLabel(view.center)}`);
    if (previous && previous.center !== view.center && view.center !== null && !reducedMotion()) {
        center.classList.remove('enter');
        void center.offsetWidth;
        center.classList.add('enter');
    }
    const mine = $('#my-card');
    mine.innerHTML = cardSvg(me?.top ?? null, { got: app.got, wrong: app.wrong });
    mine.setAttribute('aria-label', `あなたのカード：${cardLabel(me?.top)}`);
}

// 置き場の広さに収まる一番大きなカードの大きさ（直径）。縦に2枚と横に2枚の、大きい方を選ぶ
function fitTable() {
    const table = $('#table');
    const width = table.clientWidth;
    const height = table.clientHeight;
    if (width <= 0 || height <= 0) return;
    const label = 22;
    const column = Math.min(width - 8, (height - label * 2 - 16) / 2);
    const row = Math.min((width - 32) / 2, height - label - 12);
    const wide = row > column;
    table.classList.toggle('wide', wide);
    document.documentElement.style.setProperty('--cd', `${Math.floor(Math.max(80, Math.min(wide ? row : column, 440)))}px`);
}

// ===== 演出 =====

function measureCenter() {
    const card = $('#center-card');
    return card ? { rect: card.getBoundingClientRect(), html: card.innerHTML } : null;
}

// 取られた真ん中のカードは、取った人の所へ飛ぶ（自分なら自分のカードの上に重なる）。まちがえたら自分のカードが揺れる
function animate(events, before, view) {
    for (const event of events) {
        if (event.type === 'take') {
            const mine = event.seat === view.viewer;
            const target = mine ? $('#my-card') : $(`#players [data-seat="${event.seat}"]`);
            const badge = mine ? $('#taken-count') : target;
            badge?.classList.remove('scored');
            void badge?.offsetWidth;
            badge?.classList.add('scored');
            if (!reducedMotion()) fly(before, target, mine);
        } else if (event.type === 'wrong' && event.seat === view.viewer) {
            const card = $('#my-card');
            card.classList.remove('shake');
            void card.offsetWidth;
            card.classList.add('shake');
        } else if (event.type === 'wrong') {
            const chip = $(`#players [data-seat="${event.seat}"]`);
            chip?.classList.add('missed');
            setTimeout(() => chip?.classList.remove('missed'), 700);
        }
    }
}

function fly(from, target, land) {
    if (!from || !target) return;
    const { rect, html } = from;
    const to = target.getBoundingClientRect();
    const flyer = document.createElement('div');
    flyer.className = 'card big flyer';
    flyer.innerHTML = html;
    Object.assign(flyer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    document.body.appendChild(flyer);
    const dx = to.left + to.width / 2 - (rect.left + rect.width / 2);
    const dy = to.top + to.height / 2 - (rect.top + rect.height / 2);
    const scale = land ? to.width / rect.width : 0.2;
    const animation = flyer.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: land ? 1 : 0.2 }
    ], { duration: Motion.ms(FLY_MS), easing: 'cubic-bezier(.4,0,.6,1)' });
    const done = () => flyer.remove();
    Motion.track(animation, Motion.ms(FLY_MS));
    animation.onfinish = done;
    setTimeout(done, FLY_MS + 300);
}

// 効果音：1回の更新に1つだけ。終わりは勝ち・負け、自分が取ったら得た音、自分のまちがいはできない音、ほかの人が取ったら知らせ
function playSounds(events, view) {
    if (!events.length) return;
    const mine = type => events.some(event => event.type === type && event.seat === view.viewer);
    if (events.some(event => event.type === 'end')) {
        const winners = view.result?.winners ?? [];
        if (view.players.length === 1 || (winners.length === 1 && winners[0] === view.viewer)) music.play('win');
        else if (winners.includes(view.viewer)) music.play('notify');
        else music.play('lose');
    } else if (mine('take')) {
        music.play('gain');
    } else if (mine('wrong')) {
        music.play('error');
    } else if (events.some(event => event.type === 'take')) {
        music.play('notify');
    }
}

function showToast(text) {
    const toast = $('#toast');
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
    clearTimeout(app.toastTimer);
    $('#toast').hidden = true;
}

// 操作を断られた（先に取られた・待ち中・接続が切れたなど）
function onGameError(message) {
    app.pendingClaim = false;
    const late = message === '先に取られました';
    music.play(late ? 'cancel' : 'error');
    showToast(message);
}

// ===== 入力 =====

// 自分のカードか真ん中のカードのマークをタップすると、そのマークで真ん中のカードを取りにいく（結果の音は返事で鳴らす）
function onTableTap(event) {
    const mark = event.target.closest('#center-card .sym, #my-card .sym');
    const view = app.view;
    if (!mark || !view || !app.controller || app.controller.isReplay || view.phase !== 'play' || view.viewer === null) return;
    event.preventDefault();
    if (lockRemaining(view) > 0) {
        music.play('error');
        $('#lock').classList.remove('pulse');
        void $('#lock').offsetWidth;
        $('#lock').classList.add('pulse');
        return;
    }
    if (app.pendingClaim) return;
    app.pendingClaim = true;
    if (!app.controller.send({ type: 'claim', symbol: Number(mark.dataset.symbol), center: view.center })) app.pendingClaim = false;
}

// ヒント：真ん中のカードの、同じマークを光らせる（対戦では1点減り、タイムアタックではタイムに5秒足す）
function showHint() {
    const view = app.view;
    if (!view || app.controller?.isReplay || view.phase !== 'play' || view.viewer === null) return;
    if (view.hintSymbol !== null) return;
    const first = view.players[view.viewer].hints === 0;
    music.play('select');
    if (app.controller.isOnline) app.controller.send({ type: 'hint' });
    else if (app.controller.hint() === null) return;
    else update();
    if (first) showToast(view.mode === 'solo' ? 'ヒントを使うと、タイムに5秒足されます' : 'ヒントを使うと1点減ります');
}

function showLog() {
    const logs = app.view?.logs ?? [];
    $('#log-list').innerHTML = logs.length ? logs.map(text => `<li>${escapeHtml(text)}</li>`).join('') : '<li>まだ記録はありません</li>';
    openDialog($('#log'));
    $('#log-list').scrollTop = $('#log-list').scrollHeight;
}

function openDialog(dialog) {
    app.controller?.pause();
    if (!dialog.open) dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]') && !document.hidden) app.controller?.resume();
}

// ===== 結果とベスト =====

function loadBest() {
    const best = storage.load('best', []);
    return Array.isArray(best) ? best.filter(entry => Number.isFinite(entry?.time)) : [];
}

// 終わった：タイムアタックなら、ベストに入れる（ヒントの5秒を足したタイム）
// ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
// id はシードから作る（同じ対戦を2回数えない）
let recordedId = null;
function recordLocalResult(view) {
    const controller = app.controller;
    if (!controller || controller.isOnline || controller.isReplay || !view.result) return;
    if (view.players.filter(player => !player.isCPU).length !== 1) return;
    const id = `${GAME}-${controller.setup.seed}`;
    if (recordedId === id) return;
    recordedId = id;
    // ひとりで遊ぶ（タイムアタック）は勝ち負けがないので、回数だけ数える
    const outcome = view.players.length === 1 ? null : outcomeFromWinners(view.result.winners, controller.humanSeat, view.players.length);
    recordResult({ game: GAME, id, outcome });
}

function onFinished(view) {
    if (app.controller?.isOnline || app.controller?.isReplay || view.mode !== 'solo') return;
    const entry = { time: view.result.time, date: new Date().toISOString().slice(0, 10) };
    const best = [...loadBest(), entry].sort((a, b) => a.time - b.time).slice(0, BEST_LIMIT);
    const rank = best.indexOf(entry);
    app.bestRank = rank >= 0 ? rank : null;
    storage.save('best', best);
}

function showResult() {
    const view = app.view;
    if (!view?.result || app.scene !== 'game') return;
    hideToast();
    const { standings, winners, time } = view.result;
    const solo = view.players.length === 1;
    let title;
    if (solo) title = `タイム ${formatTime(time)}`;
    else if (winners.length > 1 && winners.includes(view.viewer)) title = '引き分け';
    else if (winners.includes(view.viewer)) title = 'あなたの勝ち';
    else title = `${view.players[winners[0]].name}の勝ち`;
    if (app.controller?.isReplay) title = `リプレイ：${title}`;
    $('#result-title').textContent = title;

    const me = view.viewer === null ? null : view.players[view.viewer];
    let sub = '';
    if (solo && me.hints > 0) sub = `ヒント ${me.hints} 回（+${me.hints * 5} 秒）`;
    if (solo && app.bestRank === 0 && !app.controller?.isReplay) sub = sub ? `ベスト更新・${sub}` : 'ベスト更新';
    else if (!solo) sub = `タイム ${formatTime(time)}`;
    $('#result-sub').textContent = sub;

    $('#result-body').innerHTML = standings.map(entry => {
        const player = view.players[entry.seat];
        return `<tr class="${entry.seat === view.viewer ? 'me' : ''}"><td>${entry.rank}</td><td>${escapeHtml(player.name)}</td><td>${entry.taken}</td><td>${entry.wrong}</td><td class="total">${entry.score}</td></tr>`;
    }).join('');

    const showBest = solo && !app.controller?.isOnline;
    $('#best-list').hidden = !showBest;
    if (showBest) {
        const best = loadBest();
        $('#best-list').innerHTML = best.length
            ? best.map((entry, i) => `<li class="${i === app.bestRank && !app.controller?.isReplay ? 'now' : ''}"><span>${i + 1}</span><span>${formatTime(entry.time)}</span><span class="date">${escapeHtml(entry.date ?? '')}</span></li>`).join('')
            : '<li class="empty">まだベストはありません</li>';
    }
    $('#replay').hidden = Boolean(app.controller?.isOnline);
    $('#again').textContent = app.controller?.isOnline ? '再戦' : 'もう一度';
    openDialog($('#result-dialog'));
}

function rematch() {
    $('#result-dialog').close();
    if (app.controller?.isOnline) {
        online.rematch(); // ロビーを出し、ホストの「開始」で再戦する
        return;
    }
    const setup = app.controller?.isReplay ? app.controller.record : app.controller?.setup;
    startGame(setup ? { mode: setup.mode, players: setup.players, level: setup.level } : newSetup());
}

function startReplay() {
    const record = app.controller?.isReplay ? app.controller.record : app.controller?.record?.();
    if (!record) return;
    $('#result-dialog').close();
    const controller = new ReplayController(record, { onUpdate: () => update() }, { speed: 2 });
    beginGame(controller);
    $('#speed').textContent = '×2';
}

function cycleSpeed() {
    const controller = app.controller;
    if (!controller?.isReplay) return;
    const next = SPEEDS[(SPEEDS.indexOf(controller.speed) + 1) % SPEEDS.length];
    controller.setSpeed(next);
    $('#speed').textContent = `×${next}`;
}

// ===== タイトルの絵・遊び方の図 =====

// 同じマークに印を付けた2枚
function pairHtml(a, b, className) {
    const symbol = commonSymbol(a, b);
    return [a, b].map((card, i) => `<div class="card ${className} art-${i}">${cardSvg(card, { got: symbol })}</div>`).join('');
}

function renderArt() {
    $('#title-art').innerHTML = pairHtml(3, 20, 'art');
    $('#help-cards').innerHTML = pairHtml(10, 41, 'mini');
    $('#help-symbol').textContent = SYMBOL_NAMES[commonSymbol(10, 41)];
}

// ===== 初期化 =====

function saveSettings() {
    storage.save('settings', app.settings);
    renderTitle();
}

function init() {
    $('#symbol-defs').innerHTML = symbolDefs();
    renderArt();

    const choose = (selector, apply) => $(selector).addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        apply(button.dataset);
        saveSettings();
    });
    choose('#mode-select', data => { app.settings.mode = data.mode; });
    choose('#cpu-count', data => { app.settings.cpus = Number(data.count); });
    choose('#level-select', data => { app.settings.level = data.level; });
    $('#start').addEventListener('click', () => startGame(newSetup()));
    $('#resume').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });
    $('#online').addEventListener('click', () => online.open());
    $('#open-help-title').addEventListener('click', () => openDialog($('#help-dialog')));
    $('#open-help-game').addEventListener('click', () => openDialog($('#help-dialog')));
    $('#home').addEventListener('click', goHome);
    $('#hint').addEventListener('click', showHint);
    $('#log-button').addEventListener('click', showLog);
    $('#speed').addEventListener('click', cycleSpeed);
    $('#result-button').addEventListener('click', showResult);
    $('#again').addEventListener('click', rematch);
    $('#replay').addEventListener('click', startReplay);
    $('#result-home').addEventListener('click', () => {
        $('#result-dialog').close();
        goHome();
    });
    $('#table').addEventListener('pointerdown', onTableTap);
    $('#toast').addEventListener('click', hideToast);

    for (const dialog of document.querySelectorAll('dialog')) {
        dialog.addEventListener('close', onDialogClose);
        // 外側のタップと閉じるボタンで閉じる
        dialog.addEventListener('click', event => {
            if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
        });
    }

    // 別のタブを見ている間は時計を止める（ローカルだけ。オンラインは止まらない）
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) app.controller?.pause();
        else if (!document.querySelector('dialog[open]')) app.controller?.resume();
    });

    // 長押しのメニューと、2本指の拡大を止める
    document.addEventListener('contextmenu', event => {
        if (!event.target.closest('input, textarea')) event.preventDefault();
    });
    document.addEventListener('gesturestart', event => event.preventDefault());

    window.addEventListener('resize', () => {
        if (app.view && app.scene === 'game') render(app.view);
    });

    showScene('title');
    // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
    online.boot();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').then(registration => {
            const worker = registration.active || registration.waiting || registration.installing;
            const urls = performance.getEntriesByType('resource').map(entry => entry.name).concat(location.href);
            const send = target => target?.postMessage({ type: 'cache-urls', urls });
            if (worker?.state === 'activated') send(worker);
            else navigator.serviceWorker.ready.then(ready => send(ready.active));
        }).catch(() => {});
    }

    // 確認用（画面の確認スクリプトから状態を見る）
    window.__app = app;
}

init();
