/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る（ローカル・オンライン・リプレイで同じ形）
 * 時計：ローカルはコントローラーの now()、オンラインはサーバーの時刻から始まりの時刻を引いたもの
 */

import LocalGameController, { ReplayController } from './game-controller.js';
import { cardDefs, cardSvg, cardLabel } from './card-art.js';
import * as storage from './storage.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const CPU_NAMES = ['ミナ', 'ソウタ', 'リオ'];
const HUMAN_NAME = 'あなた';
const LEVELS = [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }, { value: 'hard', label: 'つよい' }];
const BEST_LIMIT = 5;
const RESULT_DELAY_MS = 1000;
const CLOCK_MS = 100;
const PING_MS = 1000;       // オンラインで CPU がいる間、サーバーに CPU の時刻を確かめさせる間隔
const TOAST_MS = 1800;
const FLY_MS = 520;
const SPEEDS = [1, 2, 4, 8];

const $ = selector => document.querySelector(selector);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const app = {
    scene: 'title',
    controller: null,
    view: null,
    selection: [],          // 選んでいるカード（3枚になったら取りにいく）
    pendingClaim: false,    // 取りにいって、返事を待っている
    lastEventId: null,      // 演出と音を出したできごとの番号
    resultShown: false,
    bestRank: null,         // 今のタイムがベストの何位か
    settings: { mode: 'solo', cpus: 1, level: 'normal', marks: false, ...storage.load('settings', {}) },
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
    const { mode, cpus, level, marks } = app.settings;
    const mark = (selector, attr, value) => document.querySelectorAll(`${selector} button`).forEach(button => {
        const on = button.dataset[attr] === String(value);
        button.classList.toggle('on', on);
        button.setAttribute('aria-checked', String(on));
    });
    mark('#mode-select', 'mode', mode);
    mark('#cpu-count', 'count', cpus);
    mark('#level-select', 'level', level);
    mark('#mark-select', 'marks', marks ? 'on' : 'off');
    $('#cpu-row').hidden = mode !== 'cpu';
    $('#level-row').hidden = mode !== 'cpu';
    $('#best-row').hidden = mode !== 'solo';
    const best = loadBest()[0];
    $('#best-time').textContent = best ? formatTime(best.time) : '—';
    $('#resume').hidden = !LocalGameController.loadSaved();
    $('#online-row').hidden = !online.available;
    renderTitleArt();
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
    app.selection = [];
    app.pendingClaim = false;
    app.lastEventId = null;
    app.resultShown = false;
    app.bestRank = null;
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
    title: 'SET',
    game: 'set',
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
    $('#board').classList.toggle('locked', remaining > 0);
    if (remaining > 0) $('#lock-text').textContent = `あと ${(remaining / 1000).toFixed(1)} 秒`;
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const view = app.controller.getView();
    if (!view) return;
    const previous = app.view;
    const before = measureCards();
    const lastId = view.events.length ? view.events[view.events.length - 1].id : 0;
    const fresh = app.lastEventId === null ? [] : view.events.filter(event => event.id > app.lastEventId);
    app.lastEventId = Math.max(app.lastEventId ?? 0, lastId);

    if (!previous || view.commandCount !== previous.commandCount || fresh.length) app.pendingClaim = false;
    if (fresh.some(event => event.seat === view.viewer && (event.type === 'take' || event.type === 'wrong'))) app.selection = [];
    app.selection = app.selection.filter(card => view.board.includes(card));

    app.view = view;
    render(view, previous);
    animate(fresh, before, view);
    if (previous) playSounds(fresh, view);
    updatePing(view);

    if (view.phase === 'end' && !app.resultShown) {
        app.resultShown = true;
        onFinished(view);
        setTimeout(() => showResult(), previous ? RESULT_DELAY_MS : 0);
    }
}

function render(view, previous = null) {
    const replay = Boolean(app.controller?.isReplay);
    const local = !app.controller?.isOnline && !replay;
    $('#hint').hidden = !local;
    $('#speed').hidden = !replay;
    $('#replay-label').hidden = !replay;
    $('#result-button').hidden = view.phase !== 'end';
    renderPlayers(view);
    renderBoard(view, previous);
    const me = view.viewer === null ? null : view.players[view.viewer];
    $('#deck-count').textContent = `山札 ${view.deckCount}`;
    $('#found-count').textContent = `セット ${me ? me.sets : 0}`;
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

function renderBoard(view, previous) {
    fitBoard(view.board.length);
    const marks = app.settings.marks;
    const fresh = previous ? new Set(view.board.filter(card => !previous.board.includes(card))) : new Set();
    const playable = view.phase === 'play' && !app.controller?.isReplay;
    $('#board').innerHTML = view.board.map(card => {
        const classes = ['card'];
        if (app.selection.includes(card)) classes.push('selected');
        if (view.hintCard === card) classes.push('recommended');
        if (fresh.has(card)) classes.push('enter');
        return `<button type="button" class="${classes.join(' ')}" data-card="${card}" aria-label="${cardLabel(card)}"${playable ? '' : ' disabled'}>${cardSvg(card, { marks })}</button>`;
    }).join('');
}

// 選んだカードの表示だけを直す（タップのたびに全体を描き直さない）
function renderSelection() {
    document.querySelectorAll('#board .card').forEach(button => {
        button.classList.toggle('selected', app.selection.includes(Number(button.dataset.card)));
    });
}

// 場の広さに収まる一番大きなカードの並べ方（列の数）を選ぶ。カードは 3:2 の横長
function fitBoard(count) {
    const wrap = $('#board-wrap');
    const width = wrap.clientWidth - 8;
    const height = wrap.clientHeight - 8;
    if (width <= 0 || height <= 0) return;
    const gap = width < 520 ? 6 : 10;
    let best = { cols: 3, cw: 0 };
    for (let cols = 3; cols <= 7; cols++) {
        const rows = Math.ceil(count / cols);
        const cw = Math.min((width - gap * (cols - 1)) / cols, ((height - gap * (rows - 1)) / rows) * 1.5, 200);
        // 同じ大きさなら、横に広い場では列の多い並びにする
        if (cw > best.cw + 0.5 || (cw > best.cw - 0.5 && width > height)) best = { cols, cw };
    }
    const root = document.documentElement.style;
    root.setProperty('--cols', best.cols);
    root.setProperty('--cw', `${Math.floor(best.cw)}px`);
    root.setProperty('--gap', `${gap}px`);
}

// ===== 演出 =====

function measureCards() {
    const rects = new Map();
    document.querySelectorAll('#board .card').forEach(button => rects.set(Number(button.dataset.card), { rect: button.getBoundingClientRect(), html: button.innerHTML }));
    return rects;
}

// 取られた3枚は、取った人の所へ飛んで消える。まちがえた3枚は揺れる
function animate(events, before, view) {
    for (const event of events) {
        if (event.type === 'take') {
            const target = view.players.length === 1 ? $('#found-count') : $(`#players [data-seat="${event.seat}"]`);
            target?.classList.remove('scored');
            void target?.offsetWidth;
            target?.classList.add('scored');
            if (!reducedMotion()) event.cards.forEach((card, i) => fly(before.get(card), target, i));
        } else if (event.type === 'wrong') {
            event.cards.forEach(card => $(`#board [data-card="${card}"]`)?.classList.add('shake'));
            $(`#players [data-seat="${event.seat}"]`)?.classList.add('missed');
            setTimeout(() => $(`#players [data-seat="${event.seat}"]`)?.classList.remove('missed'), 700);
        }
    }
}

function fly(from, target, index) {
    if (!from || !target) return;
    const { rect, html } = from;
    const to = target.getBoundingClientRect();
    const flyer = document.createElement('div');
    flyer.className = 'card flyer';
    flyer.innerHTML = html;
    Object.assign(flyer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    document.body.appendChild(flyer);
    const dx = to.left + to.width / 2 - (rect.left + rect.width / 2);
    const dy = to.top + to.height / 2 - (rect.top + rect.height / 2);
    const animation = flyer.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: 'translate(0, -6px) scale(1.06)', opacity: 1, offset: 0.25 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.2 }
    ], { duration: FLY_MS, delay: index * 50, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'backwards' });
    const done = () => flyer.remove();
    animation.onfinish = done;
    setTimeout(done, FLY_MS + 400);
}

// 効果音：1回の更新に1つだけ。終わりは勝ち・負け、自分のセットは得た音、自分のまちがいはできない音、
// ほかの人のセットは知らせ、セットがなくて足したのは引く音
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
    } else if (events.some(event => event.type === 'deal')) {
        music.play('draw');
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
    app.selection = [];
    app.pendingClaim = false;
    const late = message === '先に取られました' || message === 'そのカードはもう場にありません';
    music.play(late ? 'cancel' : 'error');
    showToast(late ? '先に取られました' : message);
    if (app.view) renderSelection();
}

// ===== 入力 =====

function onCardTap(event) {
    const button = event.target.closest('#board .card');
    const view = app.view;
    if (!button || !view || !app.controller || app.controller.isReplay || view.phase !== 'play' || view.viewer === null) return;
    event.preventDefault();
    if (lockRemaining(view) > 0) {
        music.play('error');
        $('#lock').classList.remove('pulse');
        void $('#lock').offsetWidth;
        $('#lock').classList.add('pulse');
        return;
    }
    if (app.pendingClaim) return;
    const card = Number(button.dataset.card);
    const index = app.selection.indexOf(card);
    if (index >= 0) {
        app.selection.splice(index, 1);
        music.play('cancel');
        renderSelection();
        return;
    }
    app.selection.push(card);
    renderSelection();
    if (app.selection.length < 3) {
        music.play('select');
        return;
    }
    // 3枚そろったら取りにいく（結果の音は、返事で鳴らす）
    app.pendingClaim = true;
    const cards = [...app.selection];
    if (!app.controller.send({ type: 'claim', cards })) {
        app.selection = [];
        app.pendingClaim = false;
        renderSelection();
    }
}

// ヒント：場のセットの1枚を光らせる（タイムアタックではベストに残らなくなる。CPU 対戦では1点減る）
function showHint() {
    const view = app.view;
    if (!view || app.controller?.isOnline || app.controller?.isReplay || view.phase !== 'play') return;
    const first = view.players[view.viewer].hints === 0 && view.hintCard === null;
    const card = app.controller.hint();
    if (card === null) return;
    app.selection = [];
    update();
    if (first) showToast(view.mode === 'solo' ? 'ヒントを使ったので、ベストには残りません' : 'ヒントを使うと1点減ります');
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

// 終わった：タイムアタックでヒントを使っていなければ、ベストに入れる
function onFinished(view) {
    if (app.controller?.isOnline || app.controller?.isReplay || view.mode !== 'solo') return;
    if (view.players[0].hints > 0) return;
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
    if (solo && me.hints > 0) sub = `ヒント ${me.hints} 回（ベストには残りません）`;
    else if (solo && app.bestRank === 0) sub = 'ベスト更新';
    else if (!solo) sub = `タイム ${formatTime(time)}`;
    $('#result-sub').textContent = sub;

    $('#result-body').innerHTML = standings.map(entry => {
        const player = view.players[entry.seat];
        return `<tr class="${entry.seat === view.viewer ? 'me' : ''}"><td>${entry.rank}</td><td>${escapeHtml(player.name)}</td><td>${entry.sets}</td><td>${entry.wrong}</td><td class="total">${entry.score}</td></tr>`;
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

function renderTitleArt() {
    const marks = app.settings.marks;
    // 数・形・塗り・色が全部違う3枚（セットの見本）
    const cards = [0 + 0 * 3 + 0 * 9 + 0 * 27, 1 + 1 * 3 + 1 * 9 + 1 * 27, 2 + 2 * 3 + 2 * 9 + 2 * 27];
    $('#title-art').innerHTML = cards.map((card, i) => `<div class="card art-card art-${i}">${cardSvg(card, { marks })}</div>`).join('');
}

function renderHelpArt() {
    const row = cards => cards.map(card => `<div class="card mini">${cardSvg(card, { marks: app.settings.marks })}</div>`).join('');
    $('#help-set').innerHTML = row([0, 1 + 3 + 9 + 27, 2 + 6 + 18 + 54]);
    $('#help-set2').innerHTML = row([1 + 3, 1 + 3 + 27, 1 + 3 + 54]);
    $('#help-miss').innerHTML = row([2, 2 + 3 + 27, 2 + 6]);
}

// ===== 初期化 =====

function saveSettings() {
    storage.save('settings', app.settings);
    renderTitle();
}

function init() {
    $('#card-defs').innerHTML = cardDefs();
    renderHelpArt();

    $('#mode-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.mode = button.dataset.mode;
        saveSettings();
    });
    $('#cpu-count').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.cpus = Number(button.dataset.count);
        saveSettings();
    });
    $('#level-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.level = button.dataset.level;
        saveSettings();
    });
    $('#mark-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.marks = button.dataset.marks === 'on';
        saveSettings();
        renderHelpArt();
    });
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
    $('#board').addEventListener('pointerdown', onCardTap);
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
