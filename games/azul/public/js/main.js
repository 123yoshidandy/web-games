/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る
 */

import LocalGameController from './game-controller.js';
import { canPlaceInLine, wallColor, FLOOR_PENALTIES, FIRST, BONUS, COLOR_NAMES, MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { measureBefore, playMove } from './motion.js';
import * as storage from './storage.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const CPU_NAMES = ['ルシア', 'マテウス', 'イネス'];
const HUMAN_NAME = 'あなた';
const TOAST_MS = 3200;

const $ = selector => document.querySelector(selector);

const app = {
    scene: 'title',
    controller: null,
    view: null,
    selection: null, // { source, color }
    settings: { count: 2, level: 'normal', ...storage.load('settings', {}) },
    freshRound: null, // 壁に置いたばかりのタイルを光らせるラウンド
    toastTimer: null
};

// 文字のエスケープ（名前は将来オンラインで外から来る）
const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const tileSvg = (color, className = '') => `<svg class="tile ${className}" aria-hidden="true"><use href="#tile-${color === FIRST ? 'first' : color}"/></svg>`;

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#title-screen').hidden = scene !== 'title';
    $('#game-screen').hidden = scene !== 'game';
    if (scene === 'title') renderTitle();
}

function renderTitle() {
    for (const button of document.querySelectorAll('#count-select button')) {
        button.classList.toggle('on', Number(button.dataset.value) === app.settings.count);
    }
    for (const button of document.querySelectorAll('#level-select button')) {
        button.classList.toggle('on', button.dataset.value === app.settings.level);
    }
    $('#resume-button').hidden = !LocalGameController.loadSaved();
    $('#online-button').hidden = !online.available;
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
    app.selection = null;
    app.hint = null;
    app.view = null;
    app.freshRound = null;
    hideToast();
    $('#result-dialog').open && $('#result-dialog').close();
    app.controller = controller;
    showScene('game');
    update();
}

// ===== オンライン対戦（入口とロビーは netplay-lobby.js の画面） =====

const online = new NetplayLobby({
    title: 'アズール',
    game: 'azul',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: 650,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: [{ key: 'level', label: 'CPU の強さ', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }] }],
    onStart: (controller) => beginGame(controller),
    onUpdate: () => update(),
    onError: (message) => {
        music.play('error');
        showNote('オンライン対戦', message);
        update();
    },
    onExit: () => {
        app.controller = null;
        hideToast();
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        showScene('title');
    }
});
app.online = online;

function newSetup() {
    const players = [{ name: HUMAN_NAME, isCPU: false }];
    for (let i = 1; i < app.settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, level: app.settings.level };
}

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (app.controller?.isOnline) return online.confirmLeave();
    app.controller?.stop();
    app.controller = null;
    hideToast();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const previous = app.view;
    const view = app.controller.getView();
    const moved = previous && view.lastMove && view.commandCount === previous.commandCount + 1;
    const before = moved ? measureBefore(view.lastMove) : null;

    if (previous && view.commandCount !== previous.commandCount) {
        app.selection = null;
        app.hint = null;
    }
    if (view.lastReport && (!previous || previous.lastReport?.round !== view.lastReport.round) && previous) {
        app.freshRound = view.lastReport.round;
        showRoundToast(view);
    } else if (moved) {
        app.freshRound = null;
    }
    app.view = view;
    render(view);
    if (moved) playMove(view.lastMove, before, view.viewer);
    if (previous) playSounds(previous, view, moved);
    if (view.phase === 'end' && previous && previous.phase !== 'end') {
        setTimeout(() => showResult(), 1400);
    }
}

// 効果音：1回の更新に1つだけ鳴らす。終局は勝ち・負け、ラウンドの得点は得た音か知らせ、
// 自分の手は置いた音、ほかの人の手のあとは自分の番か知らせ
function playSounds(previous, view, moved) {
    if (view.phase === 'end' && previous.phase !== 'end') {
        music.play(view.result?.winners.includes(view.viewer) ? 'win' : 'lose');
    } else if (view.lastReport && previous.lastReport?.round !== view.lastReport.round) {
        const mine = view.lastReport.players.find(entry => entry.seat === view.viewer);
        music.play(mine?.gained ? 'gain' : 'notify');
    } else if (moved) {
        if (view.lastMove.seat === view.viewer) music.play('place');
        else music.play(view.phase === 'offer' && view.current === view.viewer ? 'turn' : 'notify');
    }
}

function render(view) {
    fitLayout(view);
    const myTurn = view.phase === 'offer' && view.current === view.viewer;
    $('#round-label').textContent = view.phase === 'end' ? '終了' : `ラウンド ${view.round}`;
    $('#result-button').hidden = view.phase !== 'end';
    $('#hint').hidden = Boolean(app.controller?.isOnline); // ヒントはローカル対戦だけ
    $('#play').classList.toggle('my-turn', myTurn);
    $('#play').classList.toggle('picking', myTurn && !!app.selection);
    renderOpponents(view);
    renderTable(view, myTurn);
    renderMyBoard(view, myTurn);
}

function renderOpponents(view) {
    const others = view.players.filter(player => player.seat !== view.viewer);
    $('#opponents').innerHTML = others.map(player => {
        const turn = view.phase === 'offer' && view.current === player.seat;
        const lines = player.lines.map((line, row) => {
            const cells = [];
            for (let i = 0; i < row + 1; i++) {
                const filled = i >= row + 1 - line.count;
                cells.push(`<i class="m${filled ? ` c${line.color}` : ''}"></i>`);
            }
            return `<div class="mini-line">${cells.join('')}</div>`;
        }).join('');
        const wall = player.wall.map((row, r) => row.map((filled, c) => {
            const fresh = filled && isFresh(view, player.seat, r, c);
            return `<i class="m ${filled ? `c${wallColor(r, c)}` : `g${wallColor(r, c)}`}${fresh ? ' fresh' : ''}"></i>`;
        }).join('')).join('');
        const floor = FLOOR_PENALTIES.map((_, i) => {
            const item = player.floor[i];
            return `<i class="m${item === undefined ? '' : item === FIRST ? ' first' : ` c${item}`}"></i>`;
        }).join('');
        return `
            <button type="button" class="opp${turn ? ' turn' : ''}" data-seat="${player.seat}" aria-label="${escapeHtml(player.name)}の盤面">
                <span class="opp-head"><span class="pname">${escapeHtml(player.name)}</span><span class="pscore">${player.score}</span></span>
                <span class="opp-body"><span class="mini-lines">${lines}</span><span class="mini-wall">${wall}</span></span>
                <span class="mini-floor">${floor}</span>
            </button>`;
    }).join('');
}

function renderTable(view, myTurn) {
    const sel = app.selection;
    $('#factories').innerHTML = view.factories.map((tiles, index) => {
        const picked = sel && sel.source === index;
        const cells = [0, 1, 2, 3].map(i => {
            const color = tiles[i];
            if (color === undefined) return '<span class="fslot"></span>';
            const state = picked ? (color === sel.color ? ' picked' : ' dim') : '';
            return `<span class="ftile${state}" data-src="${index}" data-color="${color}">${tileSvg(color)}</span>`;
        }).join('');
        return `<div class="factory${tiles.length === 0 ? ' empty' : ''}${myTurn && tiles.length ? ' live' : ''}" data-src="${index}">${cells}</div>`;
    }).join('');

    const groups = [0, 1, 2, 3, 4].map(color => {
        const count = view.center.filter(t => t === color).length;
        if (!count) return '';
        const state = sel && sel.source === 'center' ? (sel.color === color ? ' picked' : ' dim') : '';
        return `<span class="center-group${state}" data-src="center" data-color="${color}">${tileSvg(color)}<span class="count">${count}</span></span>`;
    }).join('');
    const first = view.firstInCenter ? `<span class="center-first${sel && sel.source === 'center' ? ' picked' : ''}">${tileSvg(FIRST)}</span>` : '';
    $('#center').innerHTML = `<span class="center-label">中央</span>${first}${groups}`;
    $('#center').classList.toggle('live', myTurn && view.center.length > 0);
}

function boardHtml(view, player, { interactive = false, myTurn = false } = {}) {
    const sel = interactive && myTurn ? app.selection : null;
    const lines = player.lines.map((line, row) => {
        const slots = [];
        for (let i = 0; i < 5; i++) {
            if (i < 4 - row) {
                slots.push('<span class="slot void"></span>');
                continue;
            }
            const filled = i >= 5 - line.count;
            slots.push(filled ? `<span class="slot filled">${tileSvg(line.color)}</span>` : '<span class="slot"></span>');
        }
        const ok = sel && canPlaceInLine(player, row, sel.color);
        const best = sel && app.hint && app.hint.line === row ? ' recommended' : '';
        return `<div class="line${ok ? ' droppable' : ''}${best}" data-line="${row}">${slots.join('')}</div>`;
    }).join('');
    const wall = player.wall.map((row, r) => row.map((filled, c) => {
        const color = wallColor(r, c);
        if (!filled) return `<span class="cell">${tileSvg(color, 'ghost')}</span>`;
        return `<span class="cell${isFresh(view, player.seat, r, c) ? ' fresh' : ''}">${tileSvg(color)}</span>`;
    }).join('')).join('');
    const floor = FLOOR_PENALTIES.map((penalty, i) => {
        const item = player.floor[i];
        const inner = item === undefined ? '' : tileSvg(item);
        return `<span class="fcell"><span class="slot${item === undefined ? '' : ' filled'}">${inner}</span><span class="pen">${penalty}</span></span>`;
    }).join('');
    const turn = view.phase === 'offer' && view.current === player.seat;
    return `
        <div class="board${turn ? ' turn' : ''}">
            <div class="board-head"><span class="pname">${escapeHtml(player.name)}</span><span class="pscore">${player.score}</span></div>
            <div class="board-main">
                <div class="lines">${lines}</div>
                <div class="wall">${wall}</div>
            </div>
            <div class="floor${sel ? ' droppable' : ''}${sel && app.hint?.line === 'floor' ? ' recommended' : ''}" data-line="floor">${floor}</div>
        </div>`;
}

function renderMyBoard(view, myTurn) {
    const me = view.players[view.viewer];
    $('#my-board').innerHTML = boardHtml(view, me, { interactive: true, myTurn });
}

function isFresh(view, seat, row, col) {
    if (app.freshRound === null || !view.lastReport || view.lastReport.round !== app.freshRound) return false;
    const entry = view.lastReport.players.find(p => p.seat === seat);
    return !!entry?.placements.some(p => p.row === row && p.col === col);
}

// ===== 大きさ =====

// 一番小さい画面（375×548）でも、スクロールなしで全部が収まるように、タイルの大きさを決める
function fitLayout(view) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const landscape = width > height && width >= 600;
    const factoryCount = view.factories.length;
    const opponents = view.players.length - 1;
    const root = document.documentElement.style;
    document.body.classList.toggle('landscape', landscape);
    const TOP = 44;
    if (!landscape) {
        const w = Math.min(width, 560) - 16;
        const perRow = Math.min(5, factoryCount);
        const rows = Math.ceil(factoryCount / perRow);
        let f = Math.min(30, (w - (perRow - 1) * 6) / perRow / 2.6);
        let t = Math.min(40, w / 11.6);
        const oppH = opponents ? 86 : 0;
        // 高さ：上のバー + 相手 + 工房 + 中央 + 自分の盤面 + すき間
        const need = () => TOP + oppH + rows * (f * 2.6) + (rows - 1) * 6 + (f + 16) + (30 + 5 * (t + 3) + t + 22) + 46;
        let guard = 0;
        while (need() > height && guard++ < 60) {
            t *= 0.97;
            f *= 0.98;
        }
        root.setProperty('--t', `${Math.floor(t)}px`);
        root.setProperty('--f', `${Math.floor(f)}px`);
        root.setProperty('--m', `${opponents >= 3 ? 9 : 10}px`);
    } else {
        const m = height < 420 ? 9 : height < 640 ? 11 : 14;
        // 左の列（相手と工房）と右の列（自分の盤面）で幅を分ける。相手の盤面の幅は先に確保する
        const avail = Math.min(width, 1240) - 24 - 16;
        const oppW = opponents * (10.5 * m + 24) + (opponents - 1) * 6;
        const boardW = size => 10.35 * size + 40;
        let t = Math.min(50, (height - TOP - 70) / 7.4, (avail * 0.5 - 40) / 10.35);
        if (avail - boardW(t) < oppW) t = (avail - oppW - 40) / 10.35;
        const left = avail - boardW(t);
        const oppH = opponents ? m * 7.5 + 36 : 0;
        const perRow = Math.min(5, factoryCount);
        const rows = Math.ceil(factoryCount / perRow);
        const f = Math.min(42, (Math.min(left, 700) - (perRow - 1) * 6) / perRow / 2.6,
            (height - TOP - oppH - 50 - (rows - 1) * 6) / (rows * 2.6 + 1));
        root.setProperty('--t', `${Math.floor(t)}px`);
        root.setProperty('--f', `${Math.floor(f)}px`);
        root.setProperty('--m', `${m}px`);
    }
}

// ===== 入力 =====

function onPlayClick(event) {
    const view = app.view;
    if (!view || !app.controller) return;
    const opp = event.target.closest('.opp');
    if (opp) {
        openBoard(Number(opp.dataset.seat));
        return;
    }
    const myTurn = view.phase === 'offer' && view.current === view.viewer;
    if (!myTurn) return;
    const pick = event.target.closest('[data-src]');
    if (pick && (pick.classList.contains('ftile') || pick.classList.contains('center-group'))) {
        const source = pick.dataset.src === 'center' ? 'center' : Number(pick.dataset.src);
        const color = Number(pick.dataset.color);
        const same = app.selection && app.selection.source === source && app.selection.color === color;
        app.selection = same ? null : { source, color };
        music.play(same ? 'cancel' : 'select');
        app.hint = null;
        render(view);
        return;
    }
    const target = event.target.closest('#my-board [data-line]');
    if (target && app.selection) {
        const line = target.dataset.line === 'floor' ? 'floor' : Number(target.dataset.line);
        const me = view.players[view.viewer];
        if (line !== 'floor' && !canPlaceInLine(me, line, app.selection.color)) {
            music.play('error');
            return;
        }
        app.controller.send({ type: 'take', source: app.selection.source, color: app.selection.color, line });
    }
}

// ヒント：CPU（ふつう）が自分の番に選ぶ手。取るタイルを選んだ状態にし、置く段を光らせる（すべて公開の情報で決まる）
function showHint() {
    const view = app.view;
    if (!view || app.scene !== 'game') return;
    const move = app.controller?.hint();
    if (!move) return showNote('おすすめ', '自分の番になったら、おすすめを出せます');
    app.selection = { source: move.source, color: move.color };
    app.hint = move;
    render(view);
    const from = move.source === 'center' ? '中央' : `工房${move.source + 1}`;
    showNote('おすすめ', `${from}の${COLOR_NAMES[move.color]}を、${move.line === 'floor' ? '床' : `${move.line + 1}段目`}へ`);
}

function showLog() {
    const logs = app.view?.logs ?? [];
    $('#log-list').innerHTML = logs.length ? logs.map(text => `<li>${escapeHtml(text)}</li>`).join('') : '<li>まだ記録はありません</li>';
    openDialog($('#log'));
    $('#log-list').scrollTop = $('#log-list').scrollHeight;
}

function openBoard(seat) {
    const player = app.view.players[seat];
    $('#board-dialog-body').innerHTML = boardHtml(app.view, player);
    openDialog($('#board-dialog'));
}

function openDialog(dialog) {
    app.controller?.pause();
    dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume();
}

// ===== ラウンドの得点と結果 =====

function showRoundToast(view) {
    const report = view.lastReport;
    const rows = report.players.map(entry => {
        const player = view.players[entry.seat];
        const gain = entry.gained ? `<span class="plus">+${entry.gained}</span>` : '<span class="zero">±0</span>';
        const loss = entry.penalty ? `<span class="minus">${entry.penalty}</span>` : '';
        return `<li><span class="pname">${escapeHtml(player.name)}</span>${gain}${loss}<span class="total">${entry.score}</span></li>`;
    }).join('');
    const toast = $('#round-toast');
    toast.innerHTML = `<div class="toast-title">ラウンド ${report.round} の得点</div><ul>${rows}</ul>`;
    toast.hidden = false;
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(hideToast, TOAST_MS);
}

function showNote(title, text) {
    const toast = $('#round-toast');
    toast.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div><p class="toast-note">${escapeHtml(text)}</p>`;
    toast.hidden = false;
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
    clearTimeout(app.toastTimer);
    $('#round-toast').hidden = true;
}

function showResult() {
    const view = app.view;
    if (!view?.result || app.scene !== 'game') return;
    hideToast();
    const { standings, winners } = view.result;
    const names = winners.map(seat => view.players[seat].name);
    let title;
    if (winners.length > 1) {
        title = `${names.join('と')}が同点で勝ち`;
    } else if (winners[0] === view.viewer) {
        title = 'あなたの勝ち';
    } else {
        title = `${names[0]}の勝ち`;
    }
    $('#result-title').textContent = title;
    $('#result-body').innerHTML = `<ol class="standings">${standings.map(entry => {
        const player = view.players[entry.seat];
        const bonus = [
            entry.rows ? `横の列 +${entry.rows * BONUS.row}` : '',
            entry.columns ? `縦の列 +${entry.columns * BONUS.column}` : '',
            entry.colors ? `色 +${entry.colors * BONUS.color}` : ''
        ].filter(Boolean).join('・');
        return `<li class="${entry.seat === view.viewer ? 'me' : ''}">
            <span class="rank">${entry.rank}</span>
            <span class="who"><span class="pname">${escapeHtml(player.name)}</span><span class="detail">壁 ${entry.base}${bonus ? `・${bonus}` : ''}</span></span>
            <span class="total">${entry.score}</span>
        </li>`;
    }).join('')}</ol>`;
    openDialog($('#result-dialog'));
}

// ===== タイトルの絵・遊び方の図 =====

function miniWallHtml(placed, highlight) {
    let html = '';
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const on = placed.some(([pr, pc]) => pr === r && pc === c);
            const hl = highlight && highlight[0] === r && highlight[1] === c;
            html += `<span class="cell${hl ? ' fresh-static' : ''}">${tileSvg(wallColor(r, c), on ? '' : 'ghost')}</span>`;
        }
    }
    return html;
}

function renderStaticArt() {
    const titlePlaced = [[0, 1], [0, 2], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 2], [3, 3], [4, 2]];
    $('#title-art').innerHTML = `<div class="wall art-wall">${miniWallHtml(titlePlaced)}</div>`;
    const helpPlaced = [[1, 2], [2, 0], [2, 1], [2, 2], [3, 2], [4, 2]];
    $('#help-wall').innerHTML = `<div class="wall">${miniWallHtml(helpPlaced, [2, 2])}</div>`;
}

// ===== 初期化 =====

function init() {
    renderStaticArt();

    $('#count-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.count = Number(button.dataset.value);
        storage.save('settings', app.settings);
        renderTitle();
    });
    $('#level-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.level = button.dataset.value;
        storage.save('settings', app.settings);
        renderTitle();
    });
    $('#start-button').addEventListener('click', () => startGame(newSetup()));
    $('#online-button').addEventListener('click', () => online.open());
    $('#resume-button').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });
    $('#play').addEventListener('click', onPlayClick);
    $('#round-toast').addEventListener('click', hideToast);

    document.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        if (action === 'home') goHome();
        if (action === 'help') openDialog($('#help-dialog'));
        if (action === 'close-help') $('#help-dialog').close();
        if (action === 'hint') showHint();
        if (action === 'log') showLog();
        if (action === 'close-log') $('#log').close();
        if (action === 'result') showResult();
        if (action === 'close-result') $('#result-dialog').close();
        if (action === 'rematch' && app.controller?.isOnline) {
            $('#result-dialog').close();
            online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
            return;
        }
        if (action === 'rematch') {
            const setup = app.controller?.setup;
            $('#result-dialog').close();
            startGame(setup ? { players: setup.players, level: setup.level } : newSetup());
        }
    });

    for (const dialog of document.querySelectorAll('dialog')) {
        dialog.addEventListener('close', onDialogClose);
        // 外側のタップで閉じる
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.close();
        });
    }

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

    // 確認用（画面の確認スクリプトから状態を作る）
    window.__azul = app;
    window.__app = app;
}

init();
