/**
 * 画面（タイトル・プレイ中・宝石・結果・記録を見る）と入力
 * 画面はビューだけを見て描き、操作はコントローラーの send() に送る（ローカル対戦とオンライン対戦で同じ）
 * 盤面に置いたピースの位置は画面の側で持ち、全部のピースで埋まったら解答として送る
 */

import LocalGameController from './game-controller.js';
import { GEM_COLORS, COLOR_NAMES, formatTime, MAX_PLAYERS, HINT_PENALTY_MS, sortedCounts } from './game.js';
import { orient, placedCells, sizeOf, PIECE_COLORS, PIECES } from './pieces.js';
import { hintMove, suggest } from './cpu-player.js';
import ReplayPlayer from './replay-player.js';
import * as storage from './storage.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';

const CPU_NAMES = ['ゾラ', 'キボ', 'ネマ'];
const HUMAN_NAME = 'あなた';
const SEAT_COLORS = ['#e0613a', '#3a7fe0', '#2f9e62', '#a35ad6'];
const DRAG_THRESHOLD = 6;
const DOUBLE_TAP_MS = 320;
const UI_TICK_MS = 100;
const BANNER_MS = 2200;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = {
    scene: 'title',
    controller: null,
    replay: null,
    view: null,
    settings: { count: 2, difficulty: 3, time: 90000, level: 'normal', ...storage.load('settings', {}) },
    best: storage.load('best', {}),
    pieces: {},        // 盤面とトレイのピース { id: { rot, flip, x, y, on } }
    puzzleKey: null,
    selected: null,
    drag: null,
    lastTap: null,
    layout: null,
    resultShown: false,
    pingAt: null,
    bannerTimer: null,
    giveUpArmed: null
};

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#screen-title').hidden = scene !== 'title';
    $('#screen-game').hidden = scene !== 'game';
    if (scene === 'title') renderTitle();
}

function renderTitle() {
    const mark = (selector, value) => document.querySelectorAll(`${selector} button`).forEach(button => {
        button.classList.toggle('on', button.dataset.value === String(value));
        button.setAttribute('aria-pressed', String(button.dataset.value === String(value)));
    });
    mark('#count-select', app.settings.count);
    mark('#difficulty-select', app.settings.difficulty);
    mark('#time-select', app.settings.time);
    mark('#level-select', app.settings.level);
    const solo = app.settings.count === 1;
    document.querySelectorAll('.race-only').forEach(el => { el.hidden = solo; });
    const best = app.best[app.settings.difficulty];
    $('#mode-note').textContent = solo
        ? `タイムアタック：9問の合計タイム${best ? `（最高 ${formatTime(best)}）` : ''}`
        : `CPU ${app.settings.count - 1}人と、宝石を集める早解き`;
    $('#resume-button').hidden = !LocalGameController.loadSaved();
    $('#online-button').hidden = !online.available;
}

function newSetup() {
    const players = [{ name: HUMAN_NAME, isCPU: false }];
    for (let i = 1; i < app.settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { options: { players, difficulty: app.settings.difficulty, timeLimit: app.settings.time, level: app.settings.level } };
}

function startGame(setup) {
    beginGame(new LocalGameController(setup, {
        onUpdate: () => update(),
        onError: () => {
            music.play('error');
            update();
        }
    }));
}

// ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(controller) {
    if (app.controller !== controller) app.controller?.stop();
    stopReplay();
    app.controller = controller;
    app.view = null;
    app.puzzleKey = null;
    app.resultShown = false;
    app.selected = null;
    app.drag = null;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    hideBanner();
    showScene('game');
    update();
}

function goHome() {
    if (app.controller?.isOnline) return online.confirmLeave();
    app.controller?.stop();
    app.controller = null;
    stopReplay();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

// ===== オンライン対戦（入口とロビーは netplay-lobby.js の画面） =====

const online = new NetplayLobby({
    title: 'ウボンゴ',
    game: 'ubongo',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: 700,
    allowCpu: true,
    minPlayers: 2,
    maxPlayers: MAX_PLAYERS,
    settings: [
        { key: 'difficulty', label: 'ピース', options: [{ value: 3, label: '3つ' }, { value: 4, label: '4つ' }] },
        { key: 'time', label: '時間', options: [{ value: 60000, label: '60秒' }, { value: 90000, label: '90秒' }, { value: 120000, label: '120秒' }] },
        { key: 'level', label: 'CPU', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }, { value: 'hard', label: 'つよい' }] }
    ],
    onStart: (controller) => beginGame(controller),
    onUpdate: () => update(),
    onError: (message) => {
        music.play('error');
        showBanner(typeof message === 'string' ? message : message?.message ?? 'エラー', 'bad');
        update();
    },
    onExit: () => {
        app.controller = null;
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        showScene('title');
    }
});
app.online = online;

// ===== 時計 =====

const source = () => app.replay ?? app.controller;

function clockOf(view) {
    const src = source();
    if (!src || !view) return { elapsed: 0, countdown: false };
    if (!src.isOnline) return src.clock();
    const start = src.net.toLocalTime(view.phase === 'collect' ? view.pickAt ?? 0 : view.startAt ?? 0);
    const elapsed = Date.now() - start;
    return { elapsed, countdown: view.phase === 'play' && elapsed < 0 };
}

const mySeat = (view) => view?.you ?? 0;
const myResult = (view) => view?.players[mySeat(view)]?.result ?? null;
const canPlay = (view) => !app.replay && view?.phase === 'play' && myResult(view) === null && !clockOf(view).countdown;

// ===== 更新 =====

function update() {
    const src = source();
    if (!src) return;
    const view = src.getView();
    if (!view) return;
    const previous = app.view;
    app.view = view;
    if (!app.replay) playEvents(previous, view);
    const key = `${view.round}:${view.puzzle?.id}:${view.phase === 'end' ? 'end' : ''}`;
    if (view.puzzle && key !== app.puzzleKey && !(view.phase === 'end' && app.puzzleKey)) resetPieces(view);
    render(view);
    if (view.phase === 'end' && !app.resultShown && !app.replay) {
        app.resultShown = true;
        finishGame(view);
    }
}

// ビューの前後を比べて、音と知らせを出す
function playEvents(previous, view) {
    if (!previous || previous.round !== view.round && view.phase === 'play') {
        if (view.phase === 'play') music.play('dice');
        return;
    }
    const me = mySeat(view);
    let notified = false;
    view.players.forEach((player, seat) => {
        const before = previous.players[seat]?.result;
        if (before === null && player.result?.solved) {
            if (seat === me) {
                music.play('gain');
                showBanner(`解けた！ ${formatTime(player.result.time)}`, 'good');
            } else if (!notified) {
                music.play('notify');
                notified = true;
                if (myResult(view) === null) showBanner(`${player.name} が解いた`, 'info');
            }
        }
    });
    if (view.phase === 'collect') {
        const picksBefore = previous.history.at(-1)?.picks.length ?? 0;
        const picksNow = view.history.at(-1)?.picks.length ?? 0;
        if (previous.phase === 'collect' && picksNow > picksBefore) {
            const pick = view.history.at(-1).picks.at(-1);
            music.play(pick.seat === me ? 'gain' : 'notify');
        }
        if (view.collect.picker === me && (previous.phase !== 'collect' || previous.collect?.picker !== me)) music.play('turn');
    }
}

// 新しい問題：ピースを全部トレイに置く（続きからのときは、記録したピースの動きから戻す）
function resetPieces(view) {
    app.puzzleKey = `${view.round}:${view.puzzle.id}:${view.phase === 'end' ? 'end' : ''}`;
    app.pieces = {};
    view.puzzle.pieces.forEach(id => { app.pieces[id] = { rot: 0, flip: 0, x: 0, y: 0, on: false }; });
    const trace = !app.controller?.isOnline && app.controller?.traces?.[view.round];
    if (trace && view.phase === 'play' && myResult(view) === null) applyTrace(app.pieces, trace, Infinity);
    app.selected = null;
    $('#pieces').innerHTML = '';
}

// ピースの動きの記録を、時刻 until まで当てる
function applyTrace(pieces, trace, until) {
    for (const [t, id, rot, flip, x, y] of trace) {
        if (t > until || !pieces[id]) continue;
        pieces[id] = rot === undefined ? { ...pieces[id], on: false } : { rot, flip, x, y, on: true };
    }
}

// ===== 描画 =====

function render(view) {
    renderTop(view);
    renderPlayers(view);
    renderPlay(view);
    renderControls(view);
    renderCollect(view);
    renderClock();
}

function dieSvg(value) {
    const pips = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[value] ?? [];
    return `<svg viewBox="0 0 4 4" aria-hidden="true"><rect x=".15" y=".15" width="3.7" height="3.7" rx=".7" fill="#fffaf0" stroke="#5a3415" stroke-width=".18"/>${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".38" fill="#5a3415"/>`).join('')}</svg>`;
}

function renderTop(view) {
    $('#round-label').textContent = `${Math.min(view.round, view.rounds)}/${view.rounds}`;
    $('#die').innerHTML = dieSvg(view.die);
    $('#die').setAttribute('aria-label', `ダイスの目 ${view.die}`);
}

const gemIcon = (color, cls = '') => `<svg class="gem ${cls}" aria-label="${COLOR_NAMES[color]}"><use href="#gem-${color}"/></svg>`;

function renderPlayers(view) {
    const me = mySeat(view);
    $('#players').innerHTML = view.players.map((player, seat) => {
        const result = player.result;
        const status = view.mode === 'solo'
            ? `合計 ${formatTime(view.soloTotal)}`
            : result?.solved ? `✓ ${formatTime(result.time)}`
                : result ? '×'
                    : view.phase === 'play' ? '…' : '';
        const best = view.mode === 'race' ? `<span class="p-gems">${gemIcon(bestColor(player.gems))}${sortedCounts(player.gems)[0]}<small>/${player.gemTotal}</small></span>` : '';
        return `<div class="player${seat === me ? ' me' : ''}${result?.solved ? ' solved' : ''}" data-seat="${seat}">
            <span class="p-dot" style="background:${SEAT_COLORS[seat]}"></span>
            <span class="p-name">${escapeHtml(seat === me && !app.controller?.isOnline ? HUMAN_NAME : player.name)}</span>
            ${best}<span class="p-status">${status}</span></div>`;
    }).join('');
}

const bestColor = (gems) => GEM_COLORS.reduce((best, c) => (gems[c] > gems[best] ? c : best), GEM_COLORS[0]);

// 盤面とトレイの大きさを決める
function computeLayout(view) {
    const play = $('#play').getBoundingClientRect();
    const area = $('#board-area').getBoundingClientRect();
    const tray = $('#tray').getBoundingClientRect();
    const w = view.puzzle.shape[0].length;
    const h = view.puzzle.shape.length;
    const cs = Math.max(16, Math.floor(Math.min((area.width - 16) / w, (area.height - 12) / h, 60)));
    const ids = view.puzzle.pieces;
    const slotW = tray.width / ids.length;
    const slotH = tray.height;
    const maxDim = Math.max(...ids.map(id => Math.max(...Object.values(sizeOf(PIECES[id])))));
    const ts = Math.max(12, Math.floor(Math.min(cs * 0.75, Math.min(slotW - 8, slotH - 8) / maxDim)));
    return {
        cs,
        ts,
        w,
        h,
        bx: Math.round(area.left - play.left + (area.width - w * cs) / 2),
        by: Math.round(area.top - play.top + (area.height - h * cs) / 2),
        slots: ids.map((id, i) => ({ id, cx: tray.left - play.left + slotW * (i + 0.5), cy: tray.top - play.top + slotH / 2, left: tray.left - play.left + slotW * i, width: slotW })),
        trayTop: tray.top - play.top
    };
}

const shapeSet = (shape) => new Set(shape.flatMap((row, y) => [...row].map((ch, x) => (ch === '#' ? `${x},${y}` : null))).filter(Boolean));

function renderBoard(view, layout, preview = null) {
    const { cs, w, h, bx, by } = layout;
    const svg = $('#board');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    Object.assign(svg.style, { left: `${bx}px`, top: `${by}px`, width: `${w * cs}px`, height: `${h * cs}px` });
    const cells = [];
    view.puzzle.shape.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') cells.push([x, y]); }));
    const previewSet = new Set(preview ?? []);
    svg.innerHTML = `
        <g shape-rendering="crispEdges">${cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" class="cell${previewSet.has(`${x},${y}`) ? ' preview' : ''}"/>`).join('')}</g>
        <g class="grid">${cells.map(([x, y]) => `<rect x="${x + 0.04}" y="${y + 0.04}" width=".92" height=".92" rx=".12"/>`).join('')}</g>`;
}

function pieceSvg(id, st, cell) {
    const cells = orient(id, st.rot, st.flip);
    const { w, h } = sizeOf(cells);
    const color = PIECE_COLORS[id];
    return `<svg viewBox="0 0 ${w} ${h}" width="${w * cell}" height="${h * cell}" aria-hidden="true">
        <g shape-rendering="crispEdges" fill="${color}">${cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1"/>`).join('')}</g>
        <g fill="none" stroke="rgba(0,0,0,.22)" stroke-width=".06">${cells.map(([x, y]) => `<rect x="${x + 0.1}" y="${y + 0.1}" width=".8" height=".8" rx=".14"/>`).join('')}</g>
        <g fill="rgba(255,255,255,.28)">${cells.map(([x, y]) => `<rect x="${x + 0.16}" y="${y + 0.14}" width=".68" height=".14" rx=".07"/>`).join('')}</g>
    </svg>`;
}

// ピースの位置（#play の中の px）と、1マスの大きさ
function piecePosition(id, st, layout) {
    const cells = orient(id, st.rot, st.flip);
    const { w, h } = sizeOf(cells);
    if (st.on) return { left: layout.bx + st.x * layout.cs, top: layout.by + st.y * layout.cs, cell: layout.cs };
    const slot = layout.slots.find(s => s.id === id);
    return { left: slot.cx - (w * layout.ts) / 2, top: slot.cy - (h * layout.ts) / 2, cell: layout.ts };
}

function renderPlay(view) {
    const showPuzzle = Boolean(view.puzzle) && (view.phase === 'play' || app.replay);
    $('#play').classList.toggle('waiting', !showPuzzle);
    if (!view.puzzle) return;
    app.layout = computeLayout(view);
    const pieces = app.replay ? app.replay.placements() : app.pieces;
    renderBoard(view, app.layout, app.drag?.preview);
    const layer = $('#pieces');
    for (const id of view.puzzle.pieces) {
        let el = layer.querySelector(`[data-id="${id}"]`);
        if (!el) {
            el = document.createElement('div');
            el.className = 'piece';
            el.dataset.id = id;
            layer.append(el);
        }
        const st = pieces[id];
        if (!st) continue;
        const dragging = app.drag?.id === id && app.drag.moved;
        if (!dragging) {
            const pos = piecePosition(id, st, app.layout);
            el.innerHTML = pieceSvg(id, st, pos.cell);
            el.style.transform = `translate(${Math.round(pos.left)}px, ${Math.round(pos.top)}px)`;
        }
        el.classList.toggle('on-board', st.on);
        el.classList.toggle('selected', app.selected === id && !app.replay);
    }
    const covered = view.puzzle.pieces.every(id => pieces[id]?.on);
    $('#play').classList.toggle('complete', covered || Boolean(myResult(view)?.solved));
}

function renderControls(view) {
    const playing = canPlay(view);
    const online = Boolean(app.controller?.isOnline);
    $('#flip').disabled = !playing || !app.selected;
    $('#hint').hidden = online;
    $('#hint').disabled = !(playing || (view.phase === 'collect' && view.collect.picker === mySeat(view)));
    $('#give-up').disabled = !playing;
    if (app.giveUpArmed === null) $('#give-up').textContent = view.mode === 'solo' ? '飛ばす' : 'あきらめる';
    $('#screen-game').classList.toggle('replaying', Boolean(app.replay));
    $('#replay-bar').hidden = !app.replay;
}

function renderCollect(view) {
    const panel = $('#collect');
    const show = view.phase === 'collect' && !app.replay;
    panel.hidden = !show;
    if (!show) return;
    const me = mySeat(view);
    const { order, index, picker, rows } = view.collect;
    const last = view.history.at(-1);
    $('#collect-order').innerHTML = order.map((seat, i) => {
        const result = last.results[seat];
        const pick = last.picks.find(p => p.seat === seat);
        const reach = [3, 2, 1][i] ?? 0;
        const got = pick ? ` ${pick.gems.map(c => gemIcon(c, 'small')).join('')}` : '';
        return `<li class="${i === index ? 'now' : ''}${i < index ? ' done' : ''}">
            <span class="p-dot" style="background:${SEAT_COLORS[seat]}"></span>${i + 1}位 ${escapeHtml(nameOf(view, seat))}
            <small>${formatTime(result.time)}・${reach ? `${reach}列まで` : '動けない'}</small>${got}</li>`;
    }).join('');
    const mine = picker === me;
    const remaining = view.pickAt && view.pickMs ? Math.max(0, Math.ceil((view.pickMs - clockOf(view).elapsed) / 1000)) : null;
    $('#collect-note').textContent = mine
        ? `光っている列を選んでください${remaining !== null ? `（あと${remaining}秒）` : ''}`
        : `${nameOf(view, picker)} が選んでいます…`;
    const recommended = mine && app.hintRow !== undefined && app.hintRow !== null ? app.hintRow : null;
    $('#gem-board').innerHTML = view.gemRows.map((gems, row) => {
        const pawns = view.players.map((p, seat) => (p.pawn === row ? `<span class="pawn" style="background:${SEAT_COLORS[seat]}" title="${escapeHtml(nameOf(view, seat))}"></span>` : '')).join('');
        const can = mine && rows.includes(row);
        const shown = gems.slice(0, 8).map((c, i) => gemIcon(c, i < 2 ? 'front' : '')).join('');
        const more = gems.length > 8 ? `<small>+${gems.length - 8}</small>` : '';
        return `<button type="button" class="gem-row${can ? ' can' : ''}${recommended === row ? ' recommended' : ''}" data-row="${row}" ${can ? '' : 'disabled'}>
            <span class="row-no">${row + 1}</span><span class="row-pawns">${pawns}</span><span class="row-gems">${shown}${more}</span></button>`;
    }).join('');
    const myGems = view.players[me].gems;
    $('#my-gems').innerHTML = view.mode === 'race'
        ? `<span>あなたの宝石</span>${GEM_COLORS.map(c => `<span class="gem-count">${gemIcon(c, 'small')}${myGems[c]}</span>`).join('')}`
        : '';
}

const nameOf = (view, seat) => (seat === mySeat(view) && !app.controller?.isOnline ? HUMAN_NAME : view.players[seat].name);

// 時計・カウント・砂時計（一定の間隔で描き直す）
function renderClock() {
    const view = app.view;
    if (!view || app.scene !== 'game') return;
    const clock = clockOf(view);
    const countdown = $('#countdown');
    const showCount = view.phase === 'play' && clock.countdown;
    countdown.hidden = !showCount;
    if (showCount) {
        $('#countdown-round').textContent = `ラウンド ${view.round} / ${view.rounds}`;
        $('#countdown-die').innerHTML = dieSvg(view.die);
        $('#countdown-count').textContent = String(Math.max(1, Math.ceil(-clock.elapsed / 1000)));
        const prev = view.history.at(-1);
        $('#countdown-note').textContent = prev && prev.round === view.round - 1 && view.mode === 'race'
            ? (prev.order.length === 0 ? '前のラウンドは、誰も解けませんでした' : `前のラウンド：${prev.order.map((seat, i) => `${i + 1}位 ${nameOf(view, seat)}`).join('・')}`)
            : view.mode === 'solo' ? 'タイムアタック' : `${view.pieceCount}つのピースで埋めよう`;
    }
    const bar = $('#timer-bar');
    const text = $('#timer-text');
    const mine = myResult(view);
    if (view.phase !== 'play') {
        bar.style.transform = 'scaleX(0)';
        text.textContent = view.phase === 'end' ? '終わり' : '宝石';
        $('.timer').classList.remove('low');
    } else if (view.mode === 'solo') {
        const t = Math.max(0, clock.elapsed);
        bar.style.transform = 'scaleX(1)';
        text.textContent = mine ? formatTime(mine.time ?? t) : `${(t / 1000).toFixed(1)}`;
    } else {
        const left = Math.max(0, view.timeLimit - Math.max(0, clock.elapsed));
        bar.style.transform = `scaleX(${left / view.timeLimit})`;
        text.textContent = mine?.solved ? formatTime(mine.time) : String(Math.ceil(left / 1000));
        $('.timer').classList.toggle('low', !mine && left < 10000);
    }
    $('#play').classList.toggle('counting', showCount);
    if (view.phase === 'collect') renderCollectTimer(view);
    scheduleOnlinePing(view);
}

function renderCollectTimer(view) {
    if (!app.controller?.isOnline || view.collect?.picker !== mySeat(view)) return;
    const remaining = Math.max(0, Math.ceil((view.pickMs - clockOf(view).elapsed) / 1000));
    $('#collect-note').textContent = `光っている列を選んでください（あと${remaining}秒）`;
}

// オンライン：次の期限（CPU が解く・時間切れ・宝石の期限）を過ぎたら ping を送り、サーバーに締切を確かめてもらう
function scheduleOnlinePing(view) {
    const controller = app.controller;
    if (!controller?.isOnline || app.replay) return;
    let at = null;
    if (view.phase === 'play' && view.nextEventIn !== null && view.startAt) at = controller.net.toLocalTime(view.startAt + view.nextEventIn);
    if (view.phase === 'collect' && view.pickAt) at = controller.net.toLocalTime(view.pickAt + view.pickMs);
    if (at === null || Date.now() < at + 250) return;
    if (app.pingAt === at) return;
    app.pingAt = at;
    controller.net.ping?.();
}

// ===== ピースの操作 =====

const boardCells = () => shapeSet(app.view.puzzle.shape);

// 置き方が盤面の中で、ほかのピースとぶつからないか
function fits(id, st) {
    const inside = boardCells();
    const taken = new Set();
    for (const [other, o] of Object.entries(app.pieces)) {
        if (other === id || !o.on) continue;
        placedCells({ id: other, ...o }).forEach(([x, y]) => taken.add(`${x},${y}`));
    }
    return placedCells({ id, ...st }).every(([x, y]) => inside.has(`${x},${y}`) && !taken.has(`${x},${y}`));
}

function setPiece(id, st, { trace = true } = {}) {
    app.pieces[id] = st;
    if (trace && !app.controller?.isOnline) app.controller?.trace(st.on ? [id, st.rot, st.flip, st.x, st.y] : [id]);
}

// 向きを変える。盤面の上なら、なるべく同じ所に収め、収まらなければトレイに戻す
function reorient(id, next) {
    const st = app.pieces[id];
    if (!st.on) {
        setPiece(id, { ...next, on: false });
        return;
    }
    const before = sizeOf(orient(id, st.rot, st.flip));
    const after = sizeOf(orient(id, next.rot, next.flip));
    const cx = st.x + Math.floor((before.w - after.w) / 2);
    const cy = st.y + Math.floor((before.h - after.h) / 2);
    const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [dx, dy] of offsets) {
        const candidate = { rot: next.rot, flip: next.flip, x: cx + dx, y: cy + dy, on: true };
        if (fits(id, candidate)) {
            setPiece(id, candidate);
            return;
        }
    }
    setPiece(id, { ...next, x: 0, y: 0, on: false });
}

const rotated = (st) => ({ ...st, rot: (st.rot + 1) % 4 });
// 見えている形を左右に裏返す（裏返し → 回すの順なので、回す向きも逆になる）
const flipped = (st) => ({ ...st, rot: (4 - st.rot) % 4, flip: 1 - st.flip });

function tapPiece(id) {
    const now = performance.now();
    const st = app.pieces[id];
    if (app.lastTap?.id === id && now - app.lastTap.time < DOUBLE_TAP_MS) {
        // 2回目のタップ：1回目の回転を戻して、裏返す
        const before = app.lastTap.before;
        app.pieces[id] = before;
        reorient(id, flipped(before));
        app.lastTap = null;
    } else {
        app.lastTap = { id, time: now, before: { ...st } };
        reorient(id, rotated(st));
    }
    app.selected = id;
    music.play('select');
    afterMove();
}

function flipSelected() {
    const id = app.selected;
    if (!id || !canPlay(app.view)) return;
    reorient(id, flipped(app.pieces[id]));
    music.play('select');
    afterMove();
}

function afterMove() {
    render(app.view);
    checkSolved();
}

// 全部のピースが盤面にあれば、解答として送る
function checkSolved() {
    const view = app.view;
    if (!canPlay(view)) return;
    const ids = view.puzzle.pieces;
    if (!ids.every(id => app.pieces[id].on)) return;
    const placements = ids.map(id => {
        const { rot, flip, x, y } = app.pieces[id];
        return { id, rot, flip, x, y };
    });
    app.controller.send({ type: 'submit', placements });
}

function onPointerDown(event) {
    const view = app.view;
    if (!canPlay(view) || app.drag) return;
    let id = event.target.closest('.piece')?.dataset.id;
    if (!id && event.target.closest('#tray')) {
        // トレイの枠のどこを押しても、その枠のピースを持つ
        const play = $('#play').getBoundingClientRect();
        const x = event.clientX - play.left;
        id = app.layout?.slots.find(s => x >= s.left && x < s.left + s.width && !app.pieces[s.id].on)?.id;
    }
    if (!id) return;
    event.preventDefault();
    $('#play').setPointerCapture?.(event.pointerId);
    app.drag = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, touch: event.pointerType === 'touch', from: { ...app.pieces[id] }, snap: null, preview: null };
    app.selected = id;
}

function onPointerMove(event) {
    const drag = app.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const layout = app.layout;
    const st = app.pieces[drag.id];
    const { w, h } = sizeOf(orient(drag.id, st.rot, st.flip));
    const play = $('#play').getBoundingClientRect();
    if (!drag.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        music.play('select');
        // 持った所：盤面の上ならその点、トレイからならピースの真ん中。指で隠れないよう、指より少し上に出す
        const pos = piecePosition(drag.id, st, layout);
        const scale = layout.cs / pos.cell;
        drag.grabX = (drag.startX - play.left - pos.left) * scale;
        drag.grabY = (drag.startY - play.top - pos.top) * scale + (drag.touch ? layout.cs * 0.9 : 0);
        if (!st.on) {
            drag.grabX = (w * layout.cs) / 2;
            drag.grabY = (h * layout.cs) / 2 + (drag.touch ? layout.cs * 1.1 : 0);
        }
        const el = $(`#pieces [data-id="${drag.id}"]`);
        el.classList.add('dragging');
        el.innerHTML = pieceSvg(drag.id, st, layout.cs);
    }
    const left = event.clientX - play.left - drag.grabX;
    const top = event.clientY - play.top - drag.grabY;
    $(`#pieces [data-id="${drag.id}"]`).style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    const gx = Math.round((left - layout.bx) / layout.cs);
    const gy = Math.round((top - layout.by) / layout.cs);
    const candidate = { rot: st.rot, flip: st.flip, x: gx, y: gy, on: true };
    const ok = fits(drag.id, candidate);
    drag.snap = ok ? candidate : null;
    const preview = ok ? placedCells({ id: drag.id, ...candidate }).map(([x, y]) => `${x},${y}`) : null;
    if (String(preview) !== String(drag.preview)) {
        drag.preview = preview;
        renderBoard(app.view, layout, preview);
    }
}

function onPointerUp(event) {
    const drag = app.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    app.drag = null;
    $(`#pieces [data-id="${drag.id}"]`)?.classList.remove('dragging');
    if (!canPlay(app.view)) {
        render(app.view);
        return;
    }
    if (!drag.moved) {
        tapPiece(drag.id);
        return;
    }
    if (drag.snap) {
        setPiece(drag.id, drag.snap);
        music.play('place');
    } else {
        const st = app.pieces[drag.id];
        setPiece(drag.id, { ...st, on: false });
    }
    app.lastTap = null;
    afterMove();
}

function onPointerCancel(event) {
    const drag = app.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    app.drag = null;
    app.pieces[drag.id] = drag.from;
    render(app.view);
}

// ヒント：正しいピースを1つ置く（タイムに足される）。宝石のときは、おすすめの列を光らせる
function showHint() {
    const view = app.view;
    if (!view || app.controller?.isOnline) return;
    if (view.phase === 'collect' && view.collect.picker === mySeat(view)) {
        app.hintRow = suggest(app.controller.state, mySeat(view))?.row ?? null;
        renderCollect(view);
        return;
    }
    if (!canPlay(view)) return;
    const placed = view.puzzle.pieces.filter(id => app.pieces[id].on).map(id => ({ id, ...app.pieces[id] }));
    const move = hintMove(view.puzzle, placed);
    if (!move) return;
    if (!app.controller.send({ type: 'hint' })) return;
    move.remove.forEach(id => setPiece(id, { ...app.pieces[id], on: false }));
    const { id, rot, flip, x, y } = move.place;
    setPiece(id, { rot, flip, x, y, on: true });
    app.selected = id;
    music.play('place');
    showBanner(`ヒント（+${HINT_PENALTY_MS / 1000}秒）`, 'info');
    render(app.view);
    const el = $(`#pieces [data-id="${id}"]`);
    el?.classList.add('recommended');
    setTimeout(() => el?.classList.remove('recommended'), 1600);
    checkSolved();
}

function giveUp() {
    const view = app.view;
    if (!canPlay(view)) return;
    const button = $('#give-up');
    if (!app.giveUpArmed) {
        button.textContent = '本当に？';
        app.giveUpArmed = setTimeout(() => {
            app.giveUpArmed = null;
            renderControls(app.view);
        }, 2500);
        return;
    }
    clearTimeout(app.giveUpArmed);
    app.giveUpArmed = null;
    music.play('cancel');
    app.controller.send({ type: 'giveUp' });
    renderControls(app.view);
}

function pickRow(row) {
    const view = app.view;
    if (view?.phase !== 'collect' || view.collect.picker !== mySeat(view) || !view.collect.rows.includes(row)) return;
    app.hintRow = null;
    app.controller.send({ type: 'pick', row });
}

// ===== 知らせ =====

function showBanner(text, tone = 'info') {
    const banner = $('#banner');
    banner.textContent = text;
    banner.className = `banner ${tone}`;
    banner.hidden = false;
    clearTimeout(app.bannerTimer);
    app.bannerTimer = setTimeout(hideBanner, BANNER_MS);
}

function hideBanner() {
    clearTimeout(app.bannerTimer);
    $('#banner').hidden = true;
}

function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
    if (!app.controller?.isOnline) app.controller?.pause?.('dialog');
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume?.('dialog');
}

function showLog() {
    const logs = app.view?.logs ?? [];
    $('#log-list').innerHTML = logs.slice().reverse().map(line => `<li>${escapeHtml(line)}</li>`).join('') || '<li>まだありません</li>';
    openDialog($('#log'));
}

// ===== 結果 =====

// ローカル対戦（人1人と CPU・ひとり）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
// id はシードから作る（同じ対戦を2回数えない）。ひとり用は勝ち負けがないので、回数だけ
function recordLocalResult(view) {
    const controller = app.controller;
    if (!controller || controller.isOnline || app.replay) return;
    const winners = view.ranking.filter(r => r.rank === 1).map(r => r.seat);
    recordResult({
        game: GAME,
        id: `${GAME}-${controller.options.seed}`,
        outcome: view.mode === 'solo' ? null : outcomeFromWinners(winners, mySeat(view), view.players.length)
    });
}

function finishGame(view) {
    const me = mySeat(view);
    recordLocalResult(view);
    if (view.mode === 'solo') {
        const best = app.best[view.difficulty];
        const record = !best || view.soloTotal < best;
        if (record) {
            app.best[view.difficulty] = view.soloTotal;
            storage.save('best', app.best);
        }
        music.play(record ? 'win' : 'notify');
        showResult(view, { record, best });
        return;
    }
    const mine = view.ranking.find(r => r.seat === me);
    const winners = view.ranking.filter(r => r.rank === 1);
    music.play(mine.rank === 1 ? (winners.length > 1 ? 'notify' : 'win') : 'lose');
    showResult(view, {});
}

function showResult(view, { record, best }) {
    const me = mySeat(view);
    let title;
    let body;
    if (view.mode === 'solo') {
        title = `合計 ${formatTime(view.soloTotal)}`;
        body = `<p class="result-lead">${record ? '最高記録です！' : `最高記録 ${formatTime(best)}`}（ピース${view.difficulty}つ）</p>
            <ol class="round-times">${view.history.map(h => `<li>ラウンド ${h.round}<span>${h.results[0].solved ? '' : '飛ばし '}${formatTime(h.results[0].time)}</span></li>`).join('')}</ol>`;
    } else {
        const winners = view.ranking.filter(r => r.rank === 1).map(r => nameOf(view, r.seat));
        title = winners.length > 1 ? `${winners.join('・')} の引き分け` : winners[0] === HUMAN_NAME ? 'あなたの勝ち！' : `${winners[0]} の勝ち`;
        body = `<ol class="ranking">${view.ranking.map(r => {
            const gems = view.players[r.seat].gems;
            const colors = GEM_COLORS.slice().sort((a, b) => gems[b] - gems[a]).filter(c => gems[c] > 0);
            return `<li class="${r.seat === me ? 'me' : ''}"><span class="rank">${r.rank}位</span>
                <span class="p-dot" style="background:${SEAT_COLORS[r.seat]}"></span><span class="r-name">${escapeHtml(nameOf(view, r.seat))}</span>
                <span class="r-gems">${colors.map(c => `<span class="gem-count">${gemIcon(c, 'small')}${gems[c]}</span>`).join('') || 'なし'}</span></li>`;
        }).join('')}</ol><p class="result-note">多い色の数で比べ、同じなら次の色で比べます</p>`;
    }
    hideBanner();
    $('#result-title').textContent = title;
    $('#result-body').innerHTML = body;
    $('#replay-button').hidden = Boolean(app.controller?.isOnline);
    openDialog($('#result-dialog'));
}

// ===== 記録を見る（時刻どおりに再生する） =====

function startReplay() {
    const record = app.controller?.record;
    if (!record) return;
    $('#result-dialog').close();
    app.replay = new ReplayPlayer(record, {
        onUpdate: () => update(),
        onEnd: () => {
            stopReplay();
            update();
            showResult(app.view, { record: false, best: app.best[app.view.difficulty] });
        }
    });
    app.puzzleKey = null;
    $('#pieces').innerHTML = '';
    update();
}

function stopReplay() {
    if (!app.replay) return;
    app.replay.stop();
    app.replay = null;
    app.puzzleKey = null;
    $('#pieces').innerHTML = '';
}

// ===== 起動 =====

function init() {
    const bindSegment = (selector, key, parse) => $(selector).addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings[key] = parse(button.dataset.value);
        storage.save('settings', app.settings);
        music.play('select');
        renderTitle();
    });
    bindSegment('#count-select', 'count', Number);
    bindSegment('#difficulty-select', 'difficulty', Number);
    bindSegment('#time-select', 'time', Number);
    bindSegment('#level-select', 'level', String);

    $('#start').addEventListener('click', () => startGame(newSetup()));
    $('#online-button').addEventListener('click', () => online.open());
    $('#resume-button').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });

    const play = $('#play');
    play.addEventListener('pointerdown', onPointerDown);
    play.addEventListener('pointermove', onPointerMove);
    play.addEventListener('pointerup', onPointerUp);
    play.addEventListener('pointercancel', onPointerCancel);
    $('#gem-board').addEventListener('click', event => {
        const row = event.target.closest('.gem-row');
        if (row && !row.disabled) pickRow(Number(row.dataset.row));
    });

    document.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        if (action === 'home') goHome();
        if (action === 'help') openDialog($('#help'));
        if (action === 'flip') flipSelected();
        if (action === 'hint') showHint();
        if (action === 'give-up') giveUp();
        if (action === 'log') showLog();
        if (action === 'replay') startReplay();
        if (action === 'replay-speed' && app.replay) $('#replay-speed').textContent = `×${app.replay.toggleSpeed()}`;
        if (action === 'replay-next') app.replay?.nextRound();
        if (action === 'replay-close') {
            stopReplay();
            update();
            showResult(app.view, { record: false, best: app.best[app.view.difficulty] });
        }
        if (action === 'rematch') {
            $('#result-dialog').close();
            if (app.controller?.isOnline) {
                online.rematch();
                return;
            }
            const setup = app.controller?.setup;
            startGame(setup ?? newSetup());
        }
    });

    for (const dialog of document.querySelectorAll('dialog')) {
        dialog.addEventListener('close', onDialogClose);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.close();
        });
    }

    // ほかのタブを見ている間は、時計を止める（ローカル対戦）
    document.addEventListener('visibilitychange', () => {
        if (app.controller?.isOnline) return;
        if (document.hidden) app.controller?.pause?.('hidden');
        else app.controller?.resume?.('hidden');
    });

    // 長押しのメニューと、2本指の拡大を止める
    document.addEventListener('contextmenu', event => {
        if (!event.target.closest('input, textarea')) event.preventDefault();
    });
    document.addEventListener('gesturestart', event => event.preventDefault());
    window.addEventListener('resize', () => {
        if (app.view && app.scene === 'game') render(app.view);
    });
    setInterval(() => {
        if (app.scene === 'game' && app.view) {
            if (app.controller?.isOnline && app.view.phase === 'collect') renderCollect(app.view);
            renderClock();
            if (!canPlay(app.view) && app.view.phase === 'play' && !app.replay) renderControls(app.view);
            else if (app.view.phase === 'play') renderControls(app.view);
        }
    }, UI_TICK_MS);

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

    // 確認用（画面の確認スクリプトから状態を作る）
    app.reducedMotion = reducedMotion;
    window.__app = app;
}

init();
