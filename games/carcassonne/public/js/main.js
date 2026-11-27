/**
 * 画面の進行：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import { spriteMarkup, tileUse, meepleUse, PLAYER_COLORS, meepleStroke, TITLE_LAYOUT } from './tile-art.js';
import LocalGameController, { CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import BoardView from './board-view.js';
import { createSeed } from './random.js';
import { TILE_TYPES, UNIQUE_ROTATIONS, KIND_NAMES, rotatedTile } from './tiles.js';
import { helpMarkup } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';

const $ = id => document.getElementById(id);
const KEYS = { settings: 'carcassonne.settings.v1', save: 'carcassonne.save.v1' };
const CPU_NAMES = ['ジャン', 'マリー', 'ピエール', 'ソフィ'];
const RESULT_DELAY_MS = 1600;

const store = {
    load(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch { /* 同上 */ }
    }
};

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let settings = { count: 3, level: 'normal', ...store.load(KEYS.settings) };
let scene = 'title';
let controller = null;
let view = null;
let seenSeq = 0;
let ui = freshUi();
let resultTimer = null;
let toastTimer = null;
let dropKey = null;
let boardView = null;

function freshUi(previewRot = 0) {
    return { turnKey: null, tentative: null, step: 'place', meeple: null, previewRot };
}

// ---------- 画面の切り替え ----------

function showScene(name) {
    scene = name;
    $('screen-title').hidden = name !== 'title';
    $('screen-game').hidden = name !== 'game';
    if (name === 'title') renderTitle();
}

function renderTitle() {
    document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === settings.count)));
    document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === settings.level)));
    $('resume').hidden = !store.load(KEYS.save);
    $('online-button').hidden = !online.available;
}

function drawTitleArt() {
    $('title-art').innerHTML = TITLE_LAYOUT.map(([x, y, type, rot]) => tileUse(type, rot, x, y)).join('')
        + TITLE_LAYOUT.filter(t => t[4]).map(([x, y, type, rot, [seat, fi]]) => {
            const f = rotatedTile(type, rot).features[fi];
            return meepleUse(x * 100 + f.spot[0], y * 100 + f.spot[1], seat, { size: 34, lying: f.kind === 'field' });
        }).join('');
}

// ---------- ゲームの開始 ----------

function newSetup() {
    const players = [{ name: 'あなた', isCPU: false }];
    for (let i = 1; i < settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, options: { seed: createSeed() }, level: settings.level };
}

// 確かめるときだけ、URL の ?cpuDelay=ミリ秒 で CPU の間隔を縮められる
const CPU_DELAY = Number(new URLSearchParams(location.search).get('cpuDelay')) || undefined;

function startGame(setup) {
    setup = { ...setup, cpuDelay: CPU_DELAY };
    let local;
    try {
        local = new LocalGameController(setup, { onUpdate, onError });
    } catch (error) {
        // 保存した記録が読めないときは、新しく始める
        console.warn(error);
        store.remove(KEYS.save);
        local = new LocalGameController(newSetup(), { onUpdate, onError });
    }
    beginGame(local);
}

// ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(next) {
    if (controller !== next) controller?.stop();
    clearTimeout(resultTimer);
    $('result-dialog').close?.();
    boardView.clear();
    controller = next;
    view = controller.getView();
    seenSeq = view.eventSeq;
    ui = freshUi();
    dropKey = null;
    showScene('game');
    render();
    requestAnimationFrame(() => boardView.fit(false));
    if (view.phase === 'end') {
        recordLocalResult();
        showResultSoon(0);
    }
    saveProgress();
}

// オンライン対戦は保存しない（部屋の記録はサーバーにある）
function saveProgress() {
    if (!controller || controller.isOnline) return;
    if (controller.game.isOver()) store.remove(KEYS.save);
    else store.save(KEYS.save, controller.saveData());
}

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (controller?.isOnline) return online.confirmLeave();
    controller?.stop();
    controller = null;
    clearTimeout(resultTimer);
    showScene('title');
}

// ---------- オンライン対戦（入口とロビーは netplay-lobby.js の画面） ----------

const online = new NetplayLobby({
    title: 'カルカソンヌ',
    game: 'carcassonne',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: CPU_STEP_DELAY_MS,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: [{ key: 'cpuLevel', label: 'CPU の強さ', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }] }],
    onStart: (next) => beginGame(next),
    onUpdate: () => onUpdate(),
    onError: (message) => onError(message),
    onExit: () => {
        controller = null;
        clearTimeout(resultTimer);
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        showScene('title');
    }
});

// ---------- 更新 ----------

function onUpdate() {
    if (!controller) return;
    view = controller.getView();
    const fresh = view.events.filter(e => e.seq > seenSeq);
    seenSeq = view.eventSeq;
    dropKey = null;
    let fxIndex = 0;
    const messages = [];
    fresh.forEach(e => {
        if (e.type === 'place') {
            dropKey = `${e.x},${e.y}`;
            if (e.seat !== view.seat) boardView.ensureVisible(e.x, e.y);
        } else if (e.type === 'score') {
            boardView.showScore(e, fxDelay(fxIndex));
            fxIndex++;
            messages.push(scoreMessage(e));
        } else if (e.type === 'discard') {
            messages.push('置けないタイルを引いたので、引き直し');
        } else if (e.type === 'end') {
            recordLocalResult();
            showResultSoon(RESULT_DELAY_MS + fxDelay(fxIndex));
        }
    });
    if (messages.length > 0) showToast(messages.length > 3 ? '終了時の得点' : messages.join('　'));
    saveProgress();
    render();
    playSounds(fresh);
}

// 効果音：1回の更新に1つだけ鳴らす。終局は勝ち（同点は知らせ）・負け、自分の得点は得た音、
// 自分が置いたら置いた音、引き直しは引く音、相手の手のあとは自分の番か知らせ
function playSounds(fresh) {
    if (!fresh.length) return;
    const end = fresh.find(e => e.type === 'end');
    if (end) {
        const firsts = end.ranking.filter(r => r.rank === 1);
        if (!firsts.some(r => r.seat === view.seat)) return music.play('lose');
        return music.play(firsts.length > 1 ? 'notify' : 'win');
    }
    if (fresh.some(e => e.type === 'score' && e.winners.includes(view.seat))) return music.play('gain');
    const places = fresh.filter(e => e.type === 'place');
    if (places.length && places.every(e => e.seat === view.seat)) return music.play('place');
    if (places.length) return music.play(myTurn() ? 'turn' : 'notify');
    if (fresh.some(e => e.type === 'discard')) music.play('draw');
}

// 同時に数えた得点の演出は、少しずつずらして見せる（終了時のように多いときは、全体で 3 秒まで）
const fxDelay = index => Math.min(index * 350, 3000);

function onError(message) {
    music.play('error');
    showToast(message);
}

function scoreMessage(e) {
    const names = e.winners.map(s => view.players[s].name).join('・');
    const what = KIND_NAMES[e.kind];
    if (e.winners.length === 0) return `${what} 0点`;
    return `${names} ${what} +${e.points}`;
}

function showToast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

const myTurn = () => view && view.phase === 'play' && view.current === view.seat && view.placements;

// (x, y) で使える向き（タイルの向きの順）
function rotsAt(x, y) {
    if (!myTurn()) return [];
    return view.placements.filter(p => p.x === x && p.y === y).map(p => p.rot);
}

function placementOf(t) {
    return view.placements.find(p => p.x === t.x && p.y === t.y && p.rot === t.rot);
}

// 向きの一覧で、from から時計回りに数えて最初に使える向き（includeSelf：from 自身も含める）
function nextRot(rots, from, includeSelf) {
    const order = UNIQUE_ROTATIONS[view.tile];
    const start = order.indexOf(from);
    for (let i = includeSelf ? 0 : 1; i <= order.length; i++) {
        const r = order[(start + i + order.length) % order.length];
        if (rots.includes(r)) return r;
    }
    return rots[0];
}

// ---------- 操作 ----------

function onBoardTap({ x, y, spot }) {
    if (!myTurn()) return;
    if (ui.step === 'meeple') {
        if (spot !== null) {
            ui.meeple = ui.meeple === spot ? null : spot;
            music.play(ui.meeple === null ? 'cancel' : 'select');
            render();
        }
        return;
    }
    const rots = rotsAt(x, y);
    if (rots.length === 0) return;
    music.play('select');
    if (ui.tentative && ui.tentative.x === x && ui.tentative.y === y) {
        ui.tentative.rot = nextRot(rots, ui.tentative.rot, false);
    } else {
        ui.tentative = { x, y, rot: nextRot(rots, ui.previewRot, true) };
    }
    ui.previewRot = ui.tentative.rot;
    render();
}

function rotate() {
    if (!myTurn() || ui.step !== 'place') return;
    music.play('select');
    if (ui.tentative) {
        ui.tentative.rot = nextRot(rotsAt(ui.tentative.x, ui.tentative.y), ui.tentative.rot, false);
        ui.previewRot = ui.tentative.rot;
    } else {
        const order = UNIQUE_ROTATIONS[view.tile];
        ui.previewRot = order[(order.indexOf(ui.previewRot) + 1) % order.length];
    }
    render();
}

function confirm() {
    if (!myTurn() || !ui.tentative) return;
    if (ui.step === 'place') {
        const options = placementOf(ui.tentative)?.meeples ?? [];
        if (options.length > 0) {
            ui.step = 'meeple';
            const h = ui.hint;
            ui.meeple = h && h.x === ui.tentative.x && h.y === ui.tentative.y && h.rot === ui.tentative.rot ? h.meeple : null;
            render();
            return;
        }
        send(null);
        return;
    }
    send(ui.meeple);
}

function send(meeple) {
    const { x, y, rot } = ui.tentative;
    controller.send({ type: 'play', x, y, rot, meeple });
}

function back() {
    if (ui.step !== 'meeple') return;
    ui.step = 'place';
    ui.meeple = null;
    render();
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    $('hint').hidden = Boolean(controller?.isOnline); // ヒントはローカル対戦だけ
    // 手番が変わったら、仮置きを消す
    const turnKey = `${view.turn}:${view.current}:${view.phase}`;
    if (ui.turnKey !== turnKey) {
        const startOfMyTurn = !!myTurn();
        ui = freshUi(view.tile ? UNIQUE_ROTATIONS[view.tile][0] : 0);
        ui.turnKey = turnKey;
        if (startOfMyTurn) requestAnimationFrame(revealCandidates);
    }
    renderPlayers();
    renderBoard();
    renderPanel();
    const t = ui.tentative;
    const h = ui.hint;
    $('confirm').classList.toggle('recommended', !!(myTurn() && h && t && h.x === t.x && h.y === t.y && h.rot === t.rot && (ui.step === 'place' || ui.meeple === h.meeple)));
}

// ヒント：CPU（ふつう）が選ぶ場所と向きに仮置きし、コマの場所も選んでおく
function showHint() {
    const command = myTurn() ? controller?.hint() : null;
    if (!command) return showToast('自分の番になったら、おすすめを出せます');
    ui.step = 'place';
    ui.meeple = null;
    ui.tentative = { x: command.x, y: command.y, rot: command.rot };
    ui.previewRot = command.rot;
    ui.hint = command;
    render();
    showToast(command.meeple === null ? 'おすすめ：この場所と向きで置く（コマは置かない）' : 'おすすめ：この場所と向きで置き、コマも置く');
}

function renderPlayers() {
    $('players').innerHTML = view.players.map(p => `
        <div class="player${p.id === view.current ? ' current' : ''}${p.id === view.seat ? ' me' : ''}">
            <div class="player-top">
                <svg class="player-meeple" viewBox="0 0 24 24" aria-hidden="true"><use href="#meeple" style="color:${PLAYER_COLORS[p.id]};--meeple-stroke:${meepleStroke(p.id)}"/></svg>
                <span class="player-name">${escapeHtml(p.name)}</span>
            </div>
            <div class="player-bottom">
                <span class="player-score">${p.score}</span>
                <span class="player-meeples" aria-label="残りのコマ">×${p.meeples}</span>
            </div>
        </div>`).join('');
}

function candidateCells() {
    if (!myTurn() || ui.step !== 'place') return [];
    const seen = new Map();
    view.placements.forEach(p => seen.set(`${p.x},${p.y}`, { x: p.x, y: p.y }));
    return [...seen.values()];
}

function renderBoard() {
    const tentative = myTurn() && ui.tentative ? { ...ui.tentative, type: view.tile } : null;
    const spots = tentative && ui.step === 'meeple' ? placementOf(ui.tentative)?.meeples ?? [] : [];
    boardView.render({
        board: view.board, candidates: candidateCells(), tentative, spots, selected: ui.meeple, seat: view.seat, dropKey,
        last: view.board.length > 1 ? view.lastPlaced : null
    });
    dropKey = null;
}

// 自分の番の初めに、置ける場所が 1 つも見えていなければ、全体が見えるように合わせる
function revealCandidates() {
    const cells = candidateCells();
    const rect = boardView.container.getBoundingClientRect();
    const visible = cells.some(({ x, y }) => {
        const left = boardView.tx + x * 100 * boardView.scale;
        const top = boardView.ty + y * 100 * boardView.scale;
        return left >= 0 && top >= 0 && left + 100 * boardView.scale <= rect.width && top + 100 * boardView.scale <= rect.height;
    });
    if (!visible && cells.length > 0) boardView.fit(true);
}

function renderPanel() {
    const playing = view.phase === 'play';
    const mine = !!myTurn();
    // 手元のタイル：仮に置いた向き（なければ選んでいる向き）で見せる
    const rot = mine ? (ui.tentative?.rot ?? ui.previewRot) : 0;
    $('preview-tile').innerHTML = view.tile ? `<use href="#tile-${view.tile}-${rot}" width="100" height="100"/>` : '';
    $('tile-preview').disabled = !mine || ui.step !== 'place';
    $('tile-preview').classList.toggle('waiting', playing && !mine);

    let status = '';
    if (!playing) status = 'ゲーム終了';
    else if (mine) status = ui.step === 'meeple' ? 'コマを置く？' : 'あなたの番';
    else status = `${view.players[view.current].name}の番`;
    $('status-line').textContent = status;
    $('status-line').style.setProperty('--turn-color', playing ? PLAYER_COLORS[view.current] : 'transparent');
    $('open-remaining').textContent = `残り ${view.bagCount}`;

    $('rotate').hidden = ui.step === 'meeple' && mine;
    $('rotate').disabled = !mine;
    $('back').hidden = !(ui.step === 'meeple' && mine);
    const confirmButton = $('confirm');
    confirmButton.hidden = !playing;
    $('show-result').hidden = playing;
    if (mine && ui.step === 'meeple') {
        confirmButton.textContent = ui.meeple === null ? 'コマなし' : '決定';
        confirmButton.disabled = false;
    } else {
        confirmButton.textContent = '置く';
        confirmButton.disabled = !(mine && ui.tentative);
    }
}

// ---------- ダイアログ ----------

function openDialog(id) {
    const dialog = $(id);
    if (dialog.open) return;
    controller?.pause();
    dialog.showModal();
}

function setupDialogs() {
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', e => {
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', () => {
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume();
        });
    });
    $('help-content').innerHTML = helpMarkup();
}

function openRemaining() {
    if (!view) return;
    $('remaining-title').textContent = `残りのタイル ${view.bagCount}枚`;
    $('remaining-list').innerHTML = TILE_TYPES.map(t => `
        <div class="remaining-item${view.remaining[t] === 0 ? ' none' : ''}">
            <svg viewBox="0 0 100 100" aria-hidden="true"><use href="#tile-${t}-0" width="100" height="100"/></svg>
            <span>×${view.remaining[t]}</span>
        </div>`).join('');
    openDialog('remaining-dialog');
}

// ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
// id はシードから作る（同じ対戦を2回数えない）
let recordedId = null;
function recordLocalResult() {
    if (!controller || controller.isOnline || controller.humanSeat < 0 || !controller.game.isOver()) return;
    const game = controller.game;
    const id = `${GAME}-${game.options.seed}`;
    if (recordedId === id) return;
    recordedId = id;
    recordResult({ game: GAME, id, outcome: outcomeFromWinners(game.winners(), controller.humanSeat, game.players.length) });
}

function showResultSoon(delay) {
    clearTimeout(resultTimer);
    resultTimer = setTimeout(showResult, delay);
}

function showResult() {
    if (!view?.ranking || scene !== 'game') return;
    const winners = view.ranking.filter(r => r.rank === 1).map(r => view.players[r.seat]);
    const names = winners.map(p => p.name).join('と');
    $('result-title').textContent = winners.length === 1 && winners[0].id === view.seat ? 'あなたの勝ち' : `${names}の勝ち`;
    $('result-body').innerHTML = view.ranking.map(r => {
        const p = view.players[r.seat];
        const b = p.breakdown;
        return `<tr class="${r.seat === view.seat ? 'me' : ''}">
            <td class="rank">${r.rank}</td>
            <td class="name-col"><span class="dot" style="background:${PLAYER_COLORS[p.id]}"></span>${escapeHtml(p.name)}</td>
            <td>${b.city}</td><td>${b.road}</td><td>${b.monastery}</td><td>${b.field}</td><td class="total">${p.score}</td></tr>`;
    }).join('');
    openDialog('result-dialog');
}

// ---------- 準備 ----------

function setup() {
    $('sprite').innerHTML = spriteMarkup();
    drawTitleArt();
    boardView = new BoardView($('board'), { onTap: onBoardTap });
    setupDialogs();

    $('player-count').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        settings.count = Number(b.dataset.count);
        store.save(KEYS.settings, settings);
        renderTitle();
    });
    $('cpu-level').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        settings.level = b.dataset.level;
        store.save(KEYS.settings, settings);
        renderTitle();
    });
    $('start').addEventListener('click', () => startGame(newSetup()));
    $('online-button').addEventListener('click', () => online.open());
    $('resume').addEventListener('click', () => {
        const saved = store.load(KEYS.save);
        startGame(saved ?? newSetup());
    });
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('home').addEventListener('click', goHome);
    $('fit').addEventListener('click', () => boardView.fit(true));
    $('rotate').addEventListener('click', rotate);
    $('hint').addEventListener('click', showHint);
    $('tile-preview').addEventListener('click', rotate);
    $('confirm').addEventListener('click', confirm);
    $('back').addEventListener('click', back);
    $('open-remaining').addEventListener('click', openRemaining);
    $('show-result').addEventListener('click', showResult);
    $('again').addEventListener('click', () => {
        $('result-dialog').close();
        if (controller?.isOnline) return online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        startGame(newSetup());
    });
    $('result-home').addEventListener('click', () => {
        $('result-dialog').close();
        if (controller?.isOnline) return online.leave();
        goHome();
    });
    document.addEventListener('keydown', e => {
        if (scene !== 'game' || document.querySelector('dialog[open]')) return;
        if (e.key === 'r' || e.key === 'R') rotate();
        else if (e.key === 'Enter') confirm();
        else if (e.key === 'Escape') back();
    });

    // ページの拡大を止める（盤面の拡大・縮小は、盤面の中で受け取る）
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('input, textarea')) e.preventDefault();
    });

    showScene('title');
    registerServiceWorker();
    // 確かめるときに使う
    window.__app = { get controller() { return controller; }, get view() { return view; }, get ui() { return ui; }, boardView, startGame, onBoardTap, confirm, online };
    // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
    online.boot();
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then(registration => {
        // 初めて開いたときに読み込んだファイルも、キャッシュに入れてもらう
        const urls = [location.href, ...performance.getEntriesByType('resource').map(r => r.name)];
        const post = worker => worker?.postMessage({ type: 'cache-urls', urls });
        if (registration.active) post(registration.active);
        else navigator.serviceWorker.ready.then(r => post(r.active));
    }).catch(() => {});
}

setup();
