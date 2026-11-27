/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る
 */

import LocalGameController, { CPU_STEP_DELAY_MS } from './game-controller.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';
import {
    ORIENTATIONS, END, INCOME_SPACES, QUILT_SIZE, BONUS_POINTS, placementCells, rotateOrient, flipOrient
} from './game.js';
import { PATCHES } from './patches.js';
import { placementScore } from './cpu-player.js';
import * as storage from './storage.js';
import { music } from './music.js';

// 自分の操作の音：買って置く・革のパッチを置く・進んでボタンを得る
const COMMAND_SOUND = { buy: 'place', leather: 'place', advance: 'gain' };

const HUMAN_NAME = 'あなた';
const CPU_NAME = 'ローザ';
const PLAYER_COLORS = ['#f2a93b', '#3bb0a5'];
const LEATHER_COLOR = '#8a5a35';

const $ = selector => document.querySelector(selector);

const app = {
    scene: 'title',
    controller: null,
    view: null,
    place: null, // { choice, orient, x, y }
    hint: null, // ヒントで示している手 { count, command }（その手番の間だけ）
    settings: { level: 'normal', ...storage.load('settings', {}) }
};

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// パッチごとの布の色（自作の配色）と模様
const patchColor = id => (id === 'L' ? LEATHER_COLOR : `hsl(${Math.round((id * 137.5 + 20) % 360)}, 48%, ${id % 2 ? 50 : 58}%)`);
const patchPattern = id => (id === 'L' ? null : `pat-${id % 4}`);
const buttonIcon = (cx, cy, r) => `<use href="#button-icon" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}"/>`;

// ===== 部品（SVG） =====

// キルト。ghost：{ id, cells }、cand：覆えるマスの集合、fresh：置いたばかりのマス
function quiltSvg(player, cell, { ghost = null, cand = null, fresh = null, interactive = false } = {}) {
    const size = QUILT_SIZE * cell;
    const owner = {};
    player.placed.forEach((item, index) => item.cells.forEach(([x, y]) => { owner[`${x},${y}`] = index; }));
    let html = `<svg class="quilt-svg" viewBox="-1 -1 ${size + 2} ${size + 2}" width="${size + 2}" height="${size + 2}">`;
    html += `<rect x="-1" y="-1" width="${size + 2}" height="${size + 2}" rx="4" fill="#d9ccb0"/>`;
    for (let y = 0; y < QUILT_SIZE; y++) {
        for (let x = 0; x < QUILT_SIZE; x++) {
            const key = `${x},${y}`;
            const index = owner[key];
            const attrs = interactive ? ` data-x="${x}" data-y="${y}"` : '';
            if (index === undefined) {
                html += `<rect class="q-empty" x="${x * cell + 1}" y="${y * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="2"${attrs}/>`;
                if (cand?.has(key)) html += `<circle class="q-cand" cx="${x * cell + cell / 2}" cy="${y * cell + cell / 2}" r="${Math.max(2, cell * 0.13)}" pointer-events="none"/>`;
                continue;
            }
            const id = player.placed[index].id;
            html += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${patchColor(id)}"${attrs}/>`;
            if (patchPattern(id)) html += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="url(#${patchPattern(id)})" pointer-events="none"/>`;
            if (fresh?.has(key)) html += `<rect class="q-fresh" x="${x * cell + 1}" y="${y * cell + 1}" width="${cell - 2}" height="${cell - 2}" pointer-events="none"/>`;
        }
    }
    // パッチの縫い目（ほかのパッチや空きとの境目）とボタン
    player.placed.forEach((item, index) => {
        const has = (x, y) => owner[`${x},${y}`] === index;
        let d = '';
        for (const [x, y] of item.cells) {
            if (!has(x, y - 1)) d += `M${x * cell} ${y * cell}h${cell}`;
            if (!has(x, y + 1)) d += `M${x * cell} ${(y + 1) * cell}h${cell}`;
            if (!has(x - 1, y)) d += `M${x * cell} ${y * cell}v${cell}`;
            if (!has(x + 1, y)) d += `M${(x + 1) * cell} ${y * cell}v${cell}`;
        }
        html += `<path d="${d}" class="q-seam" pointer-events="none"/>`;
        const income = item.id === 'L' ? 0 : PATCHES[item.id].income;
        const sorted = [...item.cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        for (let i = 0; i < income; i++) {
            const [x, y] = sorted[i];
            html += `<g pointer-events="none">${buttonIcon(x * cell + cell / 2, y * cell + cell / 2, cell * 0.28)}</g>`;
        }
    });
    if (ghost) {
        for (const [x, y] of ghost.cells) {
            html += `<rect class="q-ghost" x="${x * cell + 1}" y="${y * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="${patchColor(ghost.id)}" data-x="${x}" data-y="${y}"/>`;
        }
    }
    return `${html}</svg>`;
}

// パッチの形（店に並べる絵）
function shapeSvg(id, cell, orient = null) {
    const cells = ORIENTATIONS[id][orient ?? landscapeOrient(id)];
    const w = Math.max(...cells.map(c => c[0])) + 1;
    const h = Math.max(...cells.map(c => c[1])) + 1;
    let html = `<svg class="shape" viewBox="0 0 ${w * cell} ${h * cell}" width="${w * cell}" height="${h * cell}">`;
    for (const [x, y] of cells) {
        html += `<rect x="${x * cell + 0.5}" y="${y * cell + 0.5}" width="${cell - 1}" height="${cell - 1}" rx="1.5" fill="${patchColor(id)}"/>`;
        html += `<rect x="${x * cell + 0.5}" y="${y * cell + 0.5}" width="${cell - 1}" height="${cell - 1}" fill="url(#${patchPattern(id)})"/>`;
    }
    const sorted = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (let i = 0; i < PATCHES[id].income; i++) {
        const [x, y] = sorted[i];
        html += buttonIcon(x * cell + cell / 2, y * cell + cell / 2, cell * 0.32);
    }
    return `${html}</svg>`;
}

// 店に並べるときは、横長の向き（幅 ≥ 高さ）で見せる
function landscapeOrient(id) {
    const list = ORIENTATIONS[id];
    const index = list.findIndex(cells => Math.max(...cells.map(c => c[0])) >= Math.max(...cells.map(c => c[1])));
    return index < 0 ? 0 : index;
}

// 時間の盤：外側から内側へ回る道（8×8 の中の 54 マス）
const SPIRAL = (() => {
    const n = 8;
    const list = [];
    let x0 = 0, y0 = 0, x1 = n - 1, y1 = n - 1;
    while (x0 <= x1 && y0 <= y1) {
        for (let x = x0; x <= x1; x++) list.push([x, y0]);
        for (let y = y0 + 1; y <= y1; y++) list.push([x1, y]);
        if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) list.push([x, y1]);
        if (x0 < x1) for (let y = y1 - 1; y > y0; y--) list.push([x0, y]);
        x0++; y0++; x1--; y1--;
    }
    return list.slice(0, END + 1);
})();

function timeBoardSvg(view, size) {
    const cell = size / 8;
    let html = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="time-svg">`;
    // 道
    const points = SPIRAL.map(([x, y]) => `${x * cell + cell / 2},${y * cell + cell / 2}`).join(' ');
    html += `<polyline points="${points}" fill="none" stroke="#6f5a3c" stroke-width="${cell * 0.86}" stroke-linejoin="round" stroke-linecap="round"/>`;
    html += `<polyline points="${points}" fill="none" stroke="#e9dcc0" stroke-width="${cell * 0.62}" stroke-linejoin="round" stroke-linecap="round"/>`;
    SPIRAL.forEach(([x, y], i) => {
        const cx = x * cell + cell / 2;
        const cy = y * cell + cell / 2;
        if (INCOME_SPACES.includes(i)) html += buttonIcon(cx, cy, cell * 0.3);
        else if (view.leatherLeft.includes(i)) html += `<rect x="${cx - cell * 0.22}" y="${cy - cell * 0.22}" width="${cell * 0.44}" height="${cell * 0.44}" rx="1.5" fill="${LEATHER_COLOR}" stroke="#4d2f19" stroke-width="1"/>`;
        else html += `<circle cx="${cx}" cy="${cy}" r="${cell * 0.07}" fill="#b8a37c"/>`;
    });
    // ゴール
    const [gx, gy] = SPIRAL[END];
    html += `<path d="M${gx * cell + cell * 0.25} ${gy * cell + cell * 0.2} v${cell * 0.6} M${gx * cell + cell * 0.25} ${gy * cell + cell * 0.2} h${cell * 0.5} l-${cell * 0.12} ${cell * 0.15} l${cell * 0.12} ${cell * 0.15} h-${cell * 0.5}" fill="#c0392b" stroke="#7a1f14" stroke-width="1"/>`;
    // 駒（上にいる人を後に描く）
    const order = view.players.map(p => p.seat).sort((a, b) => (a === view.top) - (b === view.top));
    const same = view.players[0].position === view.players[1].position;
    for (const seat of order) {
        const p = view.players[seat];
        const [x, y] = SPIRAL[p.position];
        const offset = same ? (seat === view.top ? -cell * 0.14 : cell * 0.14) : 0;
        html += `<circle class="token${view.current === seat ? ' active' : ''}" cx="${x * cell + cell / 2 + offset}" cy="${y * cell + cell / 2 + offset}" r="${cell * 0.36}" fill="${PLAYER_COLORS[seat]}" stroke="#fff" stroke-width="1.5"/>`;
    }
    return `${html}</svg>`;
}

const statHtml = player => `
    <span class="stat" title="ボタン"><svg class="icon"><use href="#button-icon"/></svg>${player.buttons}</span>
    <span class="stat income" title="収入">+${player.income}</span>
    <span class="stat" title="残りの時間"><svg class="icon time"><use href="#time-icon"/></svg>${END - player.position}</span>`;

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#title-screen').hidden = scene !== 'title';
    $('#game-screen').hidden = scene !== 'game';
    if (scene === 'title') renderTitle();
}

function renderTitle() {
    for (const b of document.querySelectorAll('#level-select button')) b.classList.toggle('on', b.dataset.value === app.settings.level);
    $('#resume-button').hidden = !LocalGameController.loadSaved();
    $('#online-button').hidden = !online.available;
}

function newSetup() {
    return { players: [{ name: HUMAN_NAME, isCPU: false }, { name: CPU_NAME, isCPU: true }], level: app.settings.level };
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
    app.view = null;
    app.place = null;
    app.hint = null;
    if ($('#result-dialog').open) $('#result-dialog').close();
    app.controller = controller;
    showScene('game');
    update();
}

// ===== オンライン対戦（入口とロビーは netplay-lobby.js の画面） =====

const online = new NetplayLobby({
    title: 'パッチワーク',
    game: 'patchwork',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: CPU_STEP_DELAY_MS,
    minPlayers: 2,
    maxPlayers: 2,
    settings: [],
    onStart: (controller) => beginGame(controller),
    onUpdate: () => update(),
    onError: () => {
        music.play('error');
        update();
    },
    onExit: () => {
        app.controller = null;
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        showScene('title');
    }
});
app.online = online;

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (app.controller?.isOnline) return online.confirmLeave();
    app.controller?.stop();
    app.controller = null;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const previous = app.view;
    const view = app.controller.getView();
    if (previous && view.commandCount !== previous.commandCount) app.place = null;
    app.view = view;
    render(view);
    playUpdateSound(view, previous);
    recordLocalResult(view);
    if (view.phase === 'end' && previous && previous.phase !== 'end') setTimeout(showResult, 1200);
}

// ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
// id はシードから作る（同じ対戦を2回数えない）。同点は先にゴールした方の勝ちなので、引き分けはない
let recordedController = null;
function recordLocalResult(view) {
    const controller = app.controller;
    if (!controller || controller.isOnline || !view.result || recordedController === controller) return;
    recordedController = controller;
    recordResult({
        game: GAME,
        id: `${GAME}-${controller.setup.seed}`,
        outcome: outcomeFromWinners([view.result.winner], view.viewer, view.players.length)
    });
}

// 1回の更新に1つの音。自分の手の音は send で鳴らす。CPU の手は知らせ、自分の番になったらチャイム
function playUpdateSound(view, previous) {
    if (!previous || view.commandCount === previous.commandCount) return;
    if (view.phase === 'end') {
        if (previous.phase !== 'end') music.play(view.result?.winner === view.viewer ? 'win' : 'lose');
        return;
    }
    if (app.sending) return;
    music.play(myTurn(view) && !myTurn(previous) ? 'turn' : 'notify');
}

function send(command) {
    app.sending = true;
    const ok = app.controller.send(command);
    app.sending = false;
    if (ok && app.view.phase !== 'end') music.play(COMMAND_SOUND[command.type] ?? 'place');
    return ok;
}

const myTurn = view => view.phase !== 'end' && view.current === view.viewer;

function render(view) {
    fitLayout(view);
    $('#status').textContent = statusText(view);
    $('#result-button').hidden = view.phase !== 'end';
    $('#hint').disabled = !myTurn(view);
    $('#hint').hidden = Boolean(app.controller?.isOnline); // ヒントはローカル対戦だけ
    if (app.hint && app.hint.count !== view.commandCount) app.hint = null;
    if ($('#log-dialog').open) renderLog(view);
    renderTimeBoard(view);
    renderOpponent(view);
    renderMarket(view);
    renderMe(view);
    renderControls(view);
}

function renderTimeBoard(view) {
    const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tb'));
    $('#time-board').innerHTML = timeBoardSvg(view, size);
}

function renderOpponent(view) {
    const opp = view.players[1 - view.viewer];
    const m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--m'));
    const turn = view.phase !== 'end' && view.current === opp.seat;
    $('#opponent').innerHTML = `<button type="button" class="opp${turn ? ' turn' : ''}" data-action="opponent">
        <span class="opp-name"><span class="dot" style="background:${PLAYER_COLORS[opp.seat]}"></span>${escapeHtml(opp.name)}${opp.bonus ? '<span class="bonus">7×7</span>' : ''}</span>
        <span class="opp-body">${quiltSvg(opp, m)}<span class="opp-stats">${statHtml(opp)}</span></span>
    </button>`;
}

function renderMarket(view) {
    const c = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--c'));
    const canAct = myTurn(view) && !view.pendingLeather;
    const cards = view.offer.map((id, choice) => {
        const patch = PATCHES[id];
        const info = view.buyable[choice];
        const ok = canAct && info && info.affordable && info.placements.length > 0;
        const picked = app.place && app.place.choice === choice;
        return `<button type="button" class="card${ok ? ' live' : ''}${canAct && !ok ? ' dim' : ''}${picked ? ' picked' : ''}" data-choice="${choice}"${ok ? '' : ' aria-disabled="true"'}>
            <span class="card-shape">${shapeSvg(id, c)}</span>
            <span class="card-stats">
                <span class="cost"><svg class="icon"><use href="#button-icon"/></svg>${patch.cost}</span>
                <span class="time"><svg class="icon time"><use href="#time-icon"/></svg>${patch.time}</span>
            </span>
        </button>`;
    }).join('');
    const rest = view.ring.slice(3);
    const next = rest.slice(0, 7).map(id => `<span class="mini-patch">${shapeSvg(id, Math.max(4, Math.floor(c * 0.45)))}</span>`).join('');
    $('#market').innerHTML = `<div class="cards"><span class="needle" title="中立の駒">▶</span>${cards}</div>
        <button type="button" class="ring-row" data-action="ring"><span class="ring-label">このあと</span>${next}<span class="ring-count">全${view.ring.length}</span></button>`;
}

function renderMe(view) {
    const me = view.players[view.viewer];
    const q = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--q'));
    $('#me-head').innerHTML = `<span class="pname"><span class="dot" style="background:${PLAYER_COLORS[me.seat]}"></span>${escapeHtml(me.name)}${me.bonus ? '<span class="bonus">7×7</span>' : ''}</span>
        <span class="me-stats">${statHtml(me)}<span class="stat empty" title="空きマス">空き ${me.empty}</span></span>`;
    let ghost = null;
    let cand = null;
    const fresh = view.lastMove && view.lastMove.seat === view.viewer && view.lastMove.cells ? new Set(view.lastMove.cells.map(c => c.join(','))) : null;
    if (myTurn(view) && view.pendingLeather) {
        cand = new Set();
        me.quilt.forEach((row, y) => row.forEach((c, x) => { if (c === null) cand.add(`${x},${y}`); }));
    } else if (app.place) {
        const id = view.offer[app.place.choice];
        const cells = placementCells(me.quilt, ORIENTATIONS[id][app.place.orient], app.place.x, app.place.y);
        ghost = { id, cells };
        cand = new Set();
        for (const p of view.buyable[app.place.choice].placements) {
            if (p.orient !== app.place.orient) continue;
            for (const [x, y] of ORIENTATIONS[id][p.orient]) cand.add(`${p.x + x},${p.y + y}`);
        }
    }
    $('#quilt').innerHTML = quiltSvg(me, q, { ghost, cand, fresh, interactive: true });
    const leather = hinted('leather');
    if (leather) $(`#quilt rect.q-empty[data-x="${leather.x}"][data-y="${leather.y}"]`)?.classList.add('suggested');
    $('#right').classList.toggle('turn', myTurn(view));
}

function renderControls(view) {
    let html = '';
    if (myTurn(view)) {
        if (view.pendingLeather) {
            html = '<span class="note">革のパッチを置くマスを押す</span>';
        } else if (app.place) {
            html = `<button type="button" class="icon-btn tool" data-action="rotate" aria-label="回転" title="回転">
                    <svg class="line-icon" viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg></button>
                <button type="button" class="icon-btn tool" data-action="flip" aria-label="裏返す" title="裏返す">
                    <svg class="line-icon" viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M9 7 4 12l5 5z"/><path d="M15 7l5 5-5 5z"/></svg></button>
                <button type="button" class="btn btn-primary${buyHinted() ? ' suggested' : ''}" data-action="buy">置く</button>
                <button type="button" class="icon-btn tool" data-action="cancel" aria-label="やめる" title="やめる">
                    <svg class="line-icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
        } else {
            const me = view.players[view.viewer];
            const gain = view.advanceTarget - me.position;
            html = `<button type="button" class="btn btn-secondary${hinted('advance') ? ' suggested' : ''}" data-action="advance">進む<small>ボタン +${gain}</small></button>`;
        }
    }
    $('#controls').innerHTML = html;
}

function statusText(view) {
    const m = view.lastMove;
    if (view.phase === 'end') return '終了';
    if (!m) return myTurn(view) ? 'あなたの番' : `${view.players[view.current].name}の番`;
    const name = view.players[m.seat].name;
    let text = '';
    if (m.type === 'advance') text = `${name}：${m.gained}マス進んだ`;
    if (m.type === 'buy') text = `${name}：パッチを買った（ボタン${PATCHES[m.id].cost}・時間${PATCHES[m.id].time}）`;
    if (m.type === 'leather') text = `${name}：革のパッチを置いた`;
    if (m.leathers) text += '・革のパッチ';
    return text;
}

// ===== ヒント・履歴 =====

// ヒントで示している手のうち、種類が合うもの
const hinted = type => (app.hint?.count === app.view?.commandCount && app.hint.command.type === type ? app.hint.command : null);

// 選んでいる置き方が、ヒントの買い方と同じか
function buyHinted() {
    const c = hinted('buy');
    return !!c && !!app.place && ['choice', 'orient', 'x', 'y'].every(k => app.place[k] === c[k]);
}

// おすすめの手を示す。買う手なら、そのパッチと向き・場所を選んでおく（「置く」を押せば買える）
function showHint() {
    const view = app.view;
    if (!view || !app.controller || !myTurn(view)) return;
    const command = app.controller.suggest();
    if (!command) return;
    app.hint = { count: view.commandCount, command };
    if (command.type === 'buy') app.place = { choice: command.choice, orient: command.orient, x: command.x, y: command.y };
    else if (command.type === 'advance') app.place = null;
    music.play('select');
    render(view);
}

function renderLog(view) {
    $('#log').innerHTML = view.logs.length
        ? view.logs.map(line => `<li>${escapeHtml(line)}</li>`).reverse().join('')
        : '<li class="empty">まだ何も起きていません</li>';
}

// ===== 大きさ =====

function fitLayout(view) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const landscape = width > height && width >= 600;
    document.body.classList.toggle('landscape', landscape);
    const root = document.documentElement.style;
    let tb, m, c, q;
    if (!landscape) {
        const w = Math.min(width, 560) - 16;
        tb = height < 620 ? 92 : 124;
        m = height < 620 ? 7 : 9;
        c = Math.min(height < 620 ? 10 : 13, (w - 30 - 2 * 8) / 3 / 5 - 2);
        const marketH = 3 * c + 30 + 22;
        // 上のバー + 時間の盤 + 店 + 見出し + キルト + 操作 + すき間
        q = Math.min(42, (w - 4) / 9, (height - 44 - tb - marketH - 26 - 52 - 50) / 9);
    } else {
        tb = Math.min(200, height * 0.3);
        m = height < 420 ? 7 : height < 640 ? 10 : 14;
        const leftW = Math.min(width * 0.48, 600);
        c = Math.min(22, (leftW - 30 - 16) / 3 / 5 - 2);
        q = Math.min(46, (height - 44 - 26 - 52 - 30) / 9, (width - leftW - 60) / 9);
    }
    root.setProperty('--tb', `${Math.floor(tb)}px`);
    root.setProperty('--m', `${Math.floor(m)}px`);
    root.setProperty('--c', `${Math.floor(c)}px`);
    root.setProperty('--q', `${Math.floor(q)}px`);
}

// ===== 入力 =====

// パッチを選んだ：置ける向きと場所のうち、収まりの良いところをゴーストで出す
function pickCard(choice) {
    const view = app.view;
    const info = view.buyable[choice];
    if (!info || !info.affordable || info.placements.length === 0) {
        music.play('error');
        return;
    }
    if (app.place && app.place.choice === choice) {
        app.place = null;
        music.play('cancel');
        return render(view);
    }
    const id = view.offer[choice];
    const quilt = view.players[view.viewer].quilt;
    let best = info.placements[0];
    let bestScore = -Infinity;
    for (const p of info.placements) {
        const score = placementScore(quilt, placementCells(quilt, ORIENTATIONS[id][p.orient], p.x, p.y));
        if (score > bestScore) {
            bestScore = score;
            best = p;
        }
    }
    app.place = { choice, ...best };
    music.play('select');
    render(view);
}

// 向きを変える：同じあたりに置けるならそのまま、置けなければ近くの置ける場所へ
function changeOrient(next) {
    const view = app.view;
    const { choice, x, y } = app.place;
    const id = view.offer[choice];
    const list = view.buyable[choice].placements;
    const candidates = list.filter(p => p.orient === next);
    if (candidates.length === 0) {
        // その向きでは置けない：さらに次の向きを試す
        const order = ORIENTATIONS[id].map((_, i) => i);
        const other = order.find(o => o !== app.place.orient && list.some(p => p.orient === o));
        if (other === undefined) return;
        return changeOrient(other);
    }
    const nearest = candidates.reduce((a, b) => (Math.hypot(a.x - x, a.y - y) <= Math.hypot(b.x - x, b.y - y) ? a : b));
    app.place = { choice, ...nearest };
    render(view);
}

// キルトのマスを押した：そのマスを覆う置き方へ動かす（今の向きを優先）
function tapQuilt(cx, cy) {
    const view = app.view;
    if (view.pendingLeather) {
        send({ type: 'leather', x: cx, y: cy });
        return;
    }
    if (!app.place) return;
    const { choice, orient } = app.place;
    const id = view.offer[choice];
    const list = view.buyable[choice].placements;
    const covers = p => ORIENTATIONS[id][p.orient].some(([x, y]) => p.x + x === cx && p.y + y === cy);
    // 押したマスが、形の真ん中あたりに来る置き方を選ぶ
    const center = p => {
        const cells = ORIENTATIONS[id][p.orient];
        const mx = cells.reduce((s, c) => s + c[0], 0) / cells.length + p.x;
        const my = cells.reduce((s, c) => s + c[1], 0) / cells.length + p.y;
        return Math.hypot(mx - cx, my - cy);
    };
    let options = list.filter(p => p.orient === orient && covers(p));
    if (options.length === 0) options = list.filter(covers);
    if (options.length === 0) return;
    const best = options.reduce((a, b) => (center(a) <= center(b) ? a : b));
    app.place = { choice, ...best };
    music.play('select');
    render(view);
}

function onPlayClick(event) {
    const view = app.view;
    if (!view || !app.controller) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'opponent') return openOpponent();
    if (action === 'ring') return openRing();
    if (!myTurn(view)) return;
    if (action === 'advance') return send({ type: 'advance' });
    if (app.place) {
        const id = view.offer[app.place.choice];
        if (action === 'rotate' || action === 'flip') music.play('select');
        if (action === 'rotate') return changeOrient(rotateOrient(id, app.place.orient));
        if (action === 'flip') return changeOrient(flipOrient(id, app.place.orient));
        if (action === 'cancel') {
            app.place = null;
            music.play('cancel');
            return render(view);
        }
        if (action === 'buy') {
            const { choice, orient, x, y } = app.place;
            return send({ type: 'buy', choice, orient, x, y });
        }
    }
    const card = event.target.closest('.card[data-choice]');
    if (card && !view.pendingLeather) return pickCard(Number(card.dataset.choice));
    const cell = event.target.closest('#quilt [data-x]');
    if (cell) tapQuilt(Number(cell.dataset.x), Number(cell.dataset.y));
}

function openDialog(dialog) {
    app.controller?.pause();
    dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume();
}

function openOpponent() {
    const view = app.view;
    const opp = view.players[1 - view.viewer];
    $('#info-body').innerHTML = `<h2 class="sheet-title">${escapeHtml(opp.name)}のキルト</h2>
        <div class="big-quilt">${quiltSvg(opp, 30)}</div>
        <p class="info-stats">${statHtml(opp)}<span class="stat empty">空き ${opp.empty}</span></p>`;
    openDialog($('#info-dialog'));
}

// パッチの環：中立の駒の先から順に、全部
function openRing() {
    const view = app.view;
    const items = view.ring.map((id, i) => {
        const p = PATCHES[id];
        return `<span class="ring-item${i < 3 ? ' offer' : ''}">
            <span class="ring-no">${i + 1}</span>${shapeSvg(id, 9)}
            <span class="ring-stats"><svg class="icon"><use href="#button-icon"/></svg>${p.cost} <svg class="icon time"><use href="#time-icon"/></svg>${p.time}</span>
        </span>`;
    }).join('');
    $('#info-body').innerHTML = `<h2 class="sheet-title">並んだパッチ</h2>
        <p class="ring-note">中立の駒の先から順に並んでいます。買えるのは先頭の3枚（金色）です。買ったパッチの場所へ中立の駒が進みます。</p>
        <div class="ring-list">${items}</div>`;
    openDialog($('#info-dialog'));
}

// ===== 結果 =====

function showResult() {
    const view = app.view;
    if (!view?.result || app.scene !== 'game') return;
    const { standings, winner, tie } = view.result;
    $('#result-title').textContent = winner === view.viewer ? 'あなたの勝ち' : `${view.players[winner].name}の勝ち`;
    const note = tie ? '<p class="result-note">同点のため、先にゴールした方の勝ち</p>' : '';
    $('#result-body').innerHTML = `${note}<ol class="standings">${standings.map((s, i) => {
        const player = view.players[s.seat];
        const detail = [`ボタン ${s.buttons}`, `空き ${s.empty}×2 = −${s.empty * 2}`, s.bonus ? `7×7 +${BONUS_POINTS}` : ''].filter(Boolean).join('・');
        return `<li class="${s.seat === view.viewer ? 'me' : ''}"><span class="rank">${i + 1}</span>
            <span class="who"><span class="pname">${escapeHtml(player.name)}</span><span class="detail">${detail}</span></span>
            <span class="total">${s.total}</span></li>`;
    }).join('')}</ol>`;
    openDialog($('#result-dialog'));
}

// ===== タイトルの絵 =====

// 実際のパッチの形をいくつか並べる
function renderStaticArt() {
    $('#title-art').innerHTML = [4, 20, 9, 26, 5].map((id, i) =>
        `<span class="art-patch" style="--i:${i}">${shapeSvg(id, 18)}</span>`).join('');
}

// ===== 初期化 =====

function init() {
    renderStaticArt();
    $('#level-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.level = button.dataset.value;
        storage.save('settings', app.settings);
        renderTitle();
    });
    $('#start-button').addEventListener('click', () => startGame(newSetup()));
    $('#resume-button').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });
    $('#play').addEventListener('click', onPlayClick);

    document.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'home') goHome();
        if (action === 'help') openDialog($('#help-dialog'));
        if (action === 'hint') showHint();
        if (action === 'log' && app.view) {
            renderLog(app.view);
            openDialog($('#log-dialog'));
        }
        if (action === 'close-log') $('#log-dialog').close();
        if (action === 'close-help') $('#help-dialog').close();
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
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.close();
        });
    }

    document.addEventListener('contextmenu', event => {
        if (!event.target.closest('input, textarea')) event.preventDefault();
    });
    document.addEventListener('gesturestart', event => event.preventDefault());
    window.addEventListener('resize', () => {
        if (app.view && app.scene === 'game') render(app.view);
    });

    $('#online-button').addEventListener('click', () => online.open());
    showScene('title');
    online.boot(); // 招待の URL（?room=）から入る、または前の部屋に戻る

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
    window.__pw = app;
    window.__app = app;
}

init();
