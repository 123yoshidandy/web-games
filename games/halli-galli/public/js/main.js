/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る（ローカル・オンライン・リプレイで同じ形）
 * 時計：ローカルはコントローラーの now()、オンラインはサーバーの時刻から始まりの時刻を引いたもの
 */

import LocalGameController, { ReplayController } from './game-controller.js';
import { fiveFruits, FRUIT_NAMES, MAX_PLAYERS } from './game.js';
import { cardDefs, cardSvg, backSvg, bellSvg, cardLabel } from './card-art.js';
import * as storage from './storage.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';
import * as Motion from './motion/motion.js';

const CPU_NAMES = ['ミナ', 'ソウタ', 'リオ', 'ハル', 'ユイ'];
const HUMAN_NAME = 'あなた';
const LEVELS = [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }, { value: 'hard', label: 'つよい' }];
const SPEED_OPTIONS = [{ value: 'slow', label: 'ゆっくり' }, { value: 'normal', label: 'ふつう' }, { value: 'fast', label: 'はやい' }];
const TIME_OPTIONS = [{ value: 'short', label: '3分' }, { value: 'normal', label: '5分' }, { value: 'long', label: '10分' }];
const RESULT_DELAY_MS = 1200;
const CLOCK_MS = 100;
const TOAST_MS = 1800;
const BANNER_MS = 1300;
const FLY_MS = 480;
const REPLAY_SPEEDS = [1, 2, 4];
// オンライン：期限（自動でめくる時刻など）にサーバーへ確かめさせる ping の間隔
const PING_MIN_MS = 120;
const PING_MAX_MS = 1000;
const PING_FIVE_MS = 250;   // 5つが見えている間（CPU のベルを早く映す）

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
    pendingRing: false,     // ベルを送って、返事を待っている
    lastEventId: null,      // 演出と音を出したできごとの番号
    resultShown: false,
    settings: { mode: 'practice', cpus: 2, level: 'normal', speed: 'normal', timeLimit: 'normal', auto: false, hint: true, ...storage.load('settings', {}) },
    clockTimer: null,
    pingTimer: null,
    toastTimer: null,
    bannerTimer: null
};

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// 4:05 の形
function formatTime(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#screen-title').hidden = scene !== 'title';
    $('#screen-game').hidden = scene !== 'game';
    clearInterval(app.clockTimer);
    app.clockTimer = null;
    if (scene === 'title') {
        schedulePing(null);
        renderTitle();
    } else {
        app.clockTimer = setInterval(tickClock, CLOCK_MS);
    }
}

function renderTitle() {
    const { mode, cpus, level, speed, timeLimit } = app.settings;
    const mark = (selector, attr, value) => document.querySelectorAll(`${selector} button`).forEach(button => {
        const on = button.dataset[attr] === String(value);
        button.classList.toggle('on', on);
        button.setAttribute('aria-checked', String(on));
    });
    mark('#mode-select', 'mode', mode);
    mark('#cpu-count', 'count', cpus);
    mark('#level-select', 'level', level);
    mark('#speed-select', 'speed', speed);
    mark('#time-select', 'time', timeLimit);
    $('#resume').hidden = !LocalGameController.loadSaved();
    $('#online-row').hidden = !online.available;
}

function newSetup() {
    const { mode, cpus, level, speed, timeLimit, auto } = app.settings;
    const players = [{ name: HUMAN_NAME, isCPU: false, auto }];
    for (let i = 0; i < Math.min(cpus, MAX_PLAYERS - 1); i++) players.push({ name: CPU_NAMES[i], isCPU: true });
    return { mode, players, level, speed, timeLimit };
}

function startGame(setup) {
    beginGame(new LocalGameController(setup, { onUpdate: () => update(), onError: (message) => onGameError(message) }));
}

// ローカル・オンライン・リプレイで同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(controller) {
    if (app.controller && app.controller !== controller) app.controller.stop();
    app.controller = controller;
    app.view = null;
    app.pendingRing = false;
    app.lastEventId = null;
    app.resultShown = false;
    hideToast();
    hideBanner();
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
    hideBanner();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

// ===== オンライン対戦（入口とロビーは netplay-lobby.js の画面） =====

const online = new NetplayLobby({
    title: 'ハリガリ',
    game: GAME,
    serverUrl: getServerUrl(),
    minPlayers: 2,
    maxPlayers: MAX_PLAYERS,
    settings: [
        { key: 'level', label: 'CPU の強さ', options: LEVELS },
        { key: 'speed', label: 'めくる速さ', options: SPEED_OPTIONS },
        { key: 'timeLimit', label: '時間', options: TIME_OPTIONS }
    ],
    onStart: (controller) => beginGame(controller),
    onUpdate: () => update(),
    onError: (message) => onGameError(message),
    onExit: () => {
        app.controller = null;
        app.view = null;
        hideToast();
        hideBanner();
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        showScene('title');
    }
});
app.online = online;

// オンラインの対戦中は、自動でめくる時刻・CPU のベル・時間切れをサーバーに確かめさせるため ping を送る
// 次に起きる時刻（めくる時刻はビューにある）に合わせ、5つが見えている間は短い間隔で送る
function schedulePing(view) {
    clearTimeout(app.pingTimer);
    app.pingTimer = null;
    if (!view || !app.controller?.isOnline || view.phase !== 'play' || !view.startedAt) return;
    const net = app.controller.net;
    const now = net.serverNow() - view.startedAt;
    const wakes = [now + PING_MAX_MS, view.limitMs + 30];
    if (view.nextFlipAt !== null) wakes.push(view.nextFlipAt + 30);
    if (fiveFruits(view.players.map(player => player.top)).length > 0) wakes.push(now + PING_FIVE_MS);
    const delay = Math.min(PING_MAX_MS, Math.max(PING_MIN_MS, Math.min(...wakes) - now));
    app.pingTimer = setTimeout(() => {
        app.controller?.net?.ping();
        schedulePing(app.view);
    }, delay);
}

// ===== 時計 =====

// 始まりからの経過ミリ秒（終わっていれば終わりの時刻）
function clockNow(view = app.view) {
    if (!view || !app.controller) return 0;
    if (view.phase === 'end') return view.endT ?? view.lastT;
    if (app.controller.isOnline) return view.startedAt ? Math.max(0, app.controller.net.serverNow() - view.startedAt) : 0;
    return app.controller.now();
}

function tickClock() {
    const view = app.view;
    if (!view) return;
    const left = view.limitMs - clockNow(view);
    $('#clock').textContent = `残り ${formatTime(left)}`;
    $('#clock').classList.toggle('low', left < 30000 && view.phase === 'play');
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const view = app.controller.getView();
    if (!view) return;
    const previous = app.view;
    const before = measureTable();
    const lastId = view.events.length ? view.events[view.events.length - 1].id : 0;
    const fresh = app.lastEventId === null ? [] : view.events.filter(event => event.id > app.lastEventId);
    app.lastEventId = Math.max(app.lastEventId ?? 0, lastId);
    if (!previous || view.commandCount !== previous.commandCount || fresh.length) app.pendingRing = false;

    app.view = view;
    render(view, previous, fresh);
    animate(fresh, before, view);
    if (previous) playSounds(fresh, view, previous);
    schedulePing(view);

    if (view.phase === 'end' && !app.resultShown) {
        app.resultShown = true;
        onFinished(view);
        Motion.afterIdle(() => showResult(), previous ? RESULT_DELAY_MS : 0);
    }
}

const isLocal = () => !app.controller?.isOnline && !app.controller?.isReplay;
const hintOn = view => isLocal() && view.mode === 'practice' && app.settings.hint;

function render(view, previous = null, fresh = []) {
    const replay = Boolean(app.controller?.isReplay);
    $('#hint').hidden = !(isLocal() && view.mode === 'practice');
    $('#hint').setAttribute('aria-pressed', String(app.settings.hint));
    $('#speed').hidden = !replay;
    $('#replay-label').hidden = !replay;
    $('#result-button').hidden = view.phase !== 'end';
    renderTable(view, fresh);
    renderControls(view);
    tickClock();
}

// 席の並び：自分の次の人から順に、自分は最後（下の段の、操作に近い所）
function seatOrder(view) {
    const count = view.players.length;
    const me = view.viewer ?? count - 1;
    return Array.from({ length: count }, (_, i) => (me + 1 + i) % count);
}

function renderTable(view, fresh) {
    fitTable(view.players.length);
    const flipped = new Set(fresh.filter(event => event.type === 'flip').map(event => event.seat));
    $('#table').innerHTML = seatOrder(view).map(seat => {
        const player = view.players[seat];
        const classes = ['seat'];
        if (seat === view.viewer) classes.push('me');
        if (view.phase === 'play' && view.turn === seat && !player.out) classes.push('turn');
        if (player.out) classes.push('out');
        const count = player.out ? '脱落' : `${player.deckCount}枚`;
        const top = player.top === null ? '' : `<div class="card${flipped.has(seat) && !reducedMotion() ? ' enter' : ''}" aria-label="${cardLabel(player.top)}">${cardSvg(player.top)}</div>`;
        const under = player.pileCount > 1 ? `<div class="card under">${cardSvg(player.top)}</div>` : '';
        return `<div class="seat ${classes.slice(1).join(' ')}" data-seat="${seat}">
            <div class="seat-head"><span class="seat-name">${escapeHtml(player.name)}</span><span class="seat-count">${count}</span></div>
            <div class="slot">${under}${top}</div>
        </div>`;
    }).join('');
}

function renderControls(view) {
    const me = view.viewer === null ? null : view.players[view.viewer];
    const playing = view.phase === 'play' && !app.controller?.isReplay && me && !me.out;
    const myTurn = Boolean(playing && view.turn === view.viewer);
    const local = isLocal();
    $('#deck-art').innerHTML = me && me.deckCount > 0 ? backSvg() : '';
    $('#deck').disabled = !myTurn;
    $('#deck').classList.toggle('ready', myTurn && !me.auto);
    $('#deck-label').textContent = !me ? '' : me.out ? '脱落' : myTurn && !me.auto ? `めくる（${me.deckCount}）` : `山札 ${me.deckCount}`;
    $('#bell').disabled = !playing;
    $('#auto').hidden = !local;
    $('#auto').setAttribute('aria-pressed', String(Boolean(me?.auto)));
    $('#pot-count').hidden = view.potCount === 0;
    $('#pot-count').textContent = `真ん中 ${view.potCount}枚`;

    // れんしゅうのヒント：5つならベルに「いま5つ！」、自分の番なら山札に印
    const showHint = playing && hintOn(view);
    const five = showHint && fiveFruits(view.players.map(player => player.top)).length > 0;
    $('#five-flash').hidden = !five;
    $('#bell').classList.toggle('recommended', five);
    $('#deck').classList.toggle('recommended', Boolean(showHint && !five && myTurn && !me.auto));
}

// 卓の広さに収まる一番大きなカード（正方形）と列の数を選ぶ
function fitTable(count) {
    const wrap = $('#table-wrap');
    const width = wrap.clientWidth - 4;
    const height = wrap.clientHeight - 4;
    if (width <= 0 || height <= 0) return;
    const gap = width < 520 ? 8 : 12;
    const head = 25;
    let best = { cols: 2, cw: 0 };
    for (let cols = 2; cols <= Math.min(count, 6); cols++) {
        const rows = Math.ceil(count / cols);
        const cw = Math.min((width - gap * 1.5 * (cols - 1)) / cols, (height - gap * (rows - 1)) / rows - head, 210);
        if (cw > best.cw + 0.5) best = { cols, cw };
    }
    const root = document.documentElement.style;
    root.setProperty('--cols', best.cols);
    root.setProperty('--cw', `${Math.floor(best.cw)}px`);
    root.setProperty('--gap', `${gap}px`);
}

// ===== 演出 =====

function measureTable() {
    const rects = new Map();
    document.querySelectorAll('#table .seat').forEach(seat => {
        const card = seat.querySelector('.slot .card:not(.under)');
        if (card) rects.set(Number(seat.dataset.seat), { rect: card.getBoundingClientRect(), html: card.innerHTML });
    });
    return rects;
}

// 当たりのベル：表のカードが鳴らした人の所へ飛ぶ。まちがい：その人の名前が赤く光る
function animate(events, before, view) {
    for (const event of events) {
        if (event.type !== 'ring') continue;
        const seat = $(`#table .seat[data-seat="${event.seat}"]`);
        const name = view.players[event.seat]?.name ?? '';
        const me = event.seat === view.viewer;
        if (event.ok) {
            seat?.classList.add('gained');
            showBanner(`${me ? 'あなた' : name}：ベル！ ${event.fruits.map(fruit => FRUIT_NAMES[fruit]).join('・')}が5つ　+${event.gained}枚`, false);
            if (!reducedMotion() && seat) [...before.values()].forEach((from, i) => fly(from, seat.querySelector('.seat-head'), i));
        } else {
            seat?.classList.add('missed');
            showBanner(`${me ? 'あなた' : name}：まちがい　-${event.paid}枚`, true);
        }
        if (me || !app.controller?.isOnline) ringBell();
    }
}

function ringBell() {
    const bell = $('#bell');
    bell.classList.remove('ringing');
    void bell.offsetWidth;
    bell.classList.add('ringing');
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
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.2 }
    ], { duration: Motion.ms(FLY_MS), delay: Motion.ms(index * 40), easing: 'cubic-bezier(.5,0,.6,1)', fill: 'backwards' });
    const done = () => flyer.remove();
    Motion.track(animation, Motion.ms(FLY_MS + index * 40));
    animation.onfinish = done;
    setTimeout(done, FLY_MS + 600);
}

// 効果音：1回の更新に1つだけ。終わりは勝ち・負け、自分の当たりのベルは得た音、自分のまちがいは払う音、
// ほかの人のベルと脱落は知らせ、自分のカードをめくったら引く音、手動のときに自分の番が来たら自分の番の音
function playSounds(events, view, previous) {
    const mine = (type, test = () => true) => events.some(event => event.type === type && event.seat === view.viewer && test(event));
    if (events.some(event => event.type === 'end')) {
        const winners = view.result?.winners ?? [];
        if (winners.length === 1 && winners[0] === view.viewer) music.play('win');
        else if (winners.includes(view.viewer)) music.play('notify');
        else music.play('lose');
    } else if (mine('ring', event => event.ok)) {
        music.play('gain');
    } else if (mine('ring', event => !event.ok)) {
        music.play('pay');
    } else if (events.some(event => event.type === 'ring' || event.type === 'out')) {
        music.play('notify');
    } else if (mine('flip')) {
        music.play('draw');
    } else if (view.viewer !== null && view.phase === 'play' && view.turn === view.viewer && previous.turn !== view.viewer
        && !view.players[view.viewer].auto && !view.players[view.viewer].out) {
        music.play('turn');
    }
}

function showBanner(text, ng) {
    const banner = $('#banner');
    banner.textContent = text;
    banner.classList.toggle('ng', ng);
    banner.hidden = false;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    clearTimeout(app.bannerTimer);
    app.bannerTimer = setTimeout(hideBanner, BANNER_MS);
}

function hideBanner() {
    clearTimeout(app.bannerTimer);
    $('#banner').hidden = true;
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

// 操作を断られた（間に合わなかった・番でない・接続が切れたなど）
function onGameError(message) {
    app.pendingRing = false;
    const late = message === '間に合いませんでした';
    music.play(late ? 'cancel' : 'error');
    showToast(message);
}

// ===== 入力 =====

function ring(event) {
    event?.preventDefault?.();
    const view = app.view;
    if (!view || !app.controller || app.controller.isReplay || view.phase !== 'play' || view.viewer === null) return;
    if (view.players[view.viewer].out || app.pendingRing) return;
    app.pendingRing = Boolean(app.controller.isOnline);
    $('#bell').classList.add('pressed');
    setTimeout(() => $('#bell').classList.remove('pressed'), 120);
    if (!app.controller.send({ type: 'ring', version: view.tableVersion })) app.pendingRing = false;
}

function flip(event) {
    event?.preventDefault?.();
    const view = app.view;
    if (!view || !app.controller || app.controller.isReplay || view.phase !== 'play' || view.viewer === null) return;
    if (view.turn !== view.viewer) return;
    app.controller.send({ type: 'flip' });
}

function toggleAuto() {
    if (!isLocal() || !app.view) return;
    const on = !app.view.players[app.view.viewer].auto;
    app.settings.auto = on;
    storage.save('settings', app.settings);
    if (app.view.phase === 'play') app.controller.setAuto(on);
    music.play('select');
    update();
}

function toggleHint() {
    app.settings.hint = !app.settings.hint;
    storage.save('settings', app.settings);
    if (app.view) render(app.view);
}

function onKey(event) {
    if (app.scene !== 'game' || document.querySelector('dialog[open]') || event.repeat) return;
    if (event.key === ' ' || event.code === 'Space') ring(event);
    else if (event.key === 'Enter') flip(event);
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

// ===== 結果 =====

// 終わった：ローカルの対戦は、利用者ごとの記録に結果を入れる
function onFinished(view) {
    if (!isLocal()) return;
    recordResult({
        game: GAME,
        id: `${GAME}-${app.controller.setup.seed}`,
        outcome: outcomeFromWinners(view.result.winners, view.viewer, view.players.length)
    });
}

function showResult() {
    const view = app.view;
    if (!view?.result || app.scene !== 'game') return;
    hideToast();
    const { standings, winners, reason } = view.result;
    let title;
    if (winners.length > 1 && winners.includes(view.viewer)) title = '引き分け';
    else if (winners.includes(view.viewer)) title = 'あなたの勝ち';
    else title = `${winners.map(seat => view.players[seat].name).join('・')}の勝ち`;
    if (app.controller?.isReplay) title = `リプレイ：${title}`;
    $('#result-title').textContent = title;
    const why = { last: '残りが1人になりました', time: '時間切れ。カードの多い人の勝ち', humansOut: 'あなたのカードがなくなりました', stuck: '誰もめくれなくなりました' }[reason] ?? '';
    $('#result-sub').textContent = why;
    $('#result-body').innerHTML = standings.map(entry => {
        const player = view.players[entry.seat];
        const classes = [entry.seat === view.viewer ? 'me' : '', entry.out ? 'out' : ''].join(' ').trim();
        return `<tr class="${classes}"><td>${entry.rank}</td><td>${escapeHtml(player.name)}</td><td>${entry.bells}</td><td>${entry.misses}</td><td class="total">${entry.out ? '脱落' : entry.cards}</td></tr>`;
    }).join('');
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
    if (!setup) return startGame(newSetup());
    const players = setup.players.map(player => (player.isCPU ? player : { ...player, auto: app.settings.auto }));
    startGame({ mode: setup.mode, players, level: setup.level, speed: setup.speed, timeLimit: setup.timeLimit });
}

function startReplay() {
    const record = app.controller?.isReplay ? app.controller.record : app.controller?.record?.();
    if (!record) return;
    $('#result-dialog').close();
    const controller = new ReplayController(record, { onUpdate: () => update() }, { speed: 1 });
    beginGame(controller);
    $('#speed').textContent = '×1';
}

function cycleSpeed() {
    const controller = app.controller;
    if (!controller?.isReplay) return;
    const next = REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(controller.speed) + 1) % REPLAY_SPEEDS.length];
    controller.setSpeed(next);
    $('#speed').textContent = `×${next}`;
}

// ===== タイトルの絵・遊び方の図 =====

function renderArt() {
    // いちご 2・バナナ 4・いちご 3（いちごが5つ）とベル
    const cards = [5, 14 + 11, 8];
    $('#title-art').innerHTML = cards.map((card, i) => `<div class="card art-${i}">${cardSvg(card)}</div>`).join('')
        + `<div class="art-bell">${bellSvg()}</div>`;
    const row = list => list.map(card => `<div class="card">${cardSvg(card)}</div>`).join('');
    $('#help-five').innerHTML = row([5, 8, 14 * 2 + 0]);
    $('#help-miss').innerHTML = row([14 + 11, 14 + 5, 14 * 3 + 0]);
    $('#bell').innerHTML = bellSvg();
}

// ===== 初期化 =====

function saveSettings() {
    storage.save('settings', app.settings);
    renderTitle();
}

function bindSegmented(selector, apply) {
    $(selector).addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        apply(button.dataset);
        music.play('select');
        saveSettings();
    });
}

function init() {
    $('#card-defs').innerHTML = cardDefs();
    renderArt();

    bindSegmented('#mode-select', data => { app.settings.mode = data.mode; });
    bindSegmented('#cpu-count', data => { app.settings.cpus = Number(data.count); });
    bindSegmented('#level-select', data => { app.settings.level = data.level; });
    bindSegmented('#speed-select', data => { app.settings.speed = data.speed; });
    bindSegmented('#time-select', data => { app.settings.timeLimit = data.time; });
    $('#start').addEventListener('click', () => startGame(newSetup()));
    $('#resume').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });
    $('#online').addEventListener('click', () => online.open());
    $('#open-help-title').addEventListener('click', () => openDialog($('#help-dialog')));
    $('#open-help-game').addEventListener('click', () => openDialog($('#help-dialog')));
    $('#home').addEventListener('click', goHome);
    $('#hint').addEventListener('click', toggleHint);
    $('#log-button').addEventListener('click', showLog);
    $('#speed').addEventListener('click', cycleSpeed);
    $('#result-button').addEventListener('click', showResult);
    $('#again').addEventListener('click', rematch);
    $('#replay').addEventListener('click', startReplay);
    $('#result-home').addEventListener('click', () => {
        $('#result-dialog').close();
        goHome();
    });
    $('#bell').addEventListener('pointerdown', ring);
    $('#bell').addEventListener('click', event => event.preventDefault());
    $('#deck').addEventListener('pointerdown', flip);
    $('#auto').addEventListener('click', toggleAuto);
    $('#toast').addEventListener('click', hideToast);
    document.addEventListener('keydown', onKey);

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
