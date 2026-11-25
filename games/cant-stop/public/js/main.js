/**
 * 画面の進行：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController from './game-controller.js';
import BoardView, { PLAYER_COLORS, dieSvg } from './board-view.js';
import { PAIRINGS, COLUMNS, COLUMN_LENGTH } from './game.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';

const $ = id => document.getElementById(id);
const KEYS = { settings: 'cantstop.settings.v1', save: 'cantstop.save.v1' };
const CPU_NAMES = ['ジャン', 'マリー', 'ピエール'];
const AUTO_DELAY_MS = 650;      // できることが 1 つだけのとき、自動で行うまでの間
const RESULT_DELAY_MS = 1400;
// 確かめるときだけ、URL の ?cpuDelay=ミリ秒 で CPU の間隔を縮められる
const CPU_DELAY = Number(new URLSearchParams(location.search).get('cpuDelay')) || undefined;

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

let settings = { count: 2, level: 'normal', ...store.load(KEYS.settings) };
let scene = 'title';
let controller = null;
let view = null;
let seenSeq = 0;
let lastMove = null;      // 直前に進んだ組（ダイスを組に分けて見せる）
let rolling = false;      // 振ったばかり（ダイスを転がす演出）
let autoTimer = null;
let resultTimer = null;
let bannerTimer = null;
let boardView = null;

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
}

// タイトルの絵：ゲームの途中の盤面（実際にありうる状態）
function drawTitleArt() {
    const progress = (entries) => Object.fromEntries(COLUMNS.map(c => [c, entries[c] ?? 0]));
    const claimed = Object.fromEntries(COLUMNS.map(c => [c, null]));
    claimed[4] = 0;
    const art = new BoardView($('title-art'));
    art.render({
        current: 1, claimed, runners: { 6: 8, 7: 9, 9: 6 },
        players: [
            { id: 0, progress: progress({ 4: COLUMN_LENGTH[4], 6: 3, 8: 6, 10: 2 }) },
            { id: 1, progress: progress({ 6: 5, 7: 6, 9: 4, 11: 2 }) },
            { id: 2, progress: progress({ 5: 5, 7: 8, 8: 3 }) }
        ]
    });
}

// ---------- ゲームの開始 ----------

function newSetup() {
    const players = [{ name: 'あなた', isCPU: false }];
    for (let i = 1; i < settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, options: { seed: createSeed() }, level: settings.level };
}

function startGame(setup) {
    controller?.stop();
    clearTimeout(resultTimer);
    clearTimeout(autoTimer);
    if ($('result-dialog').open) $('result-dialog').close();
    try {
        controller = new LocalGameController({ ...setup, cpuDelay: CPU_DELAY }, { onUpdate, onError });
    } catch (error) {
        // 保存した記録が読めないときは、新しく始める
        console.warn(error);
        store.remove(KEYS.save);
        controller = new LocalGameController({ ...newSetup(), cpuDelay: CPU_DELAY }, { onUpdate, onError });
    }
    view = controller.getView();
    seenSeq = view.eventSeq;
    lastMove = [...view.events].reverse().find(e => e.type === 'move') ?? null;
    showScene('game');
    render();
    if (view.phase === 'end') showResultSoon(0);
    saveProgress();
}

function saveProgress() {
    if (!controller) return;
    if (controller.game.isOver()) store.remove(KEYS.save);
    else store.save(KEYS.save, controller.saveData());
}

function goHome() {
    controller?.stop();
    controller = null;
    clearTimeout(resultTimer);
    clearTimeout(autoTimer);
    showScene('title');
}

// ---------- 更新 ----------

function onUpdate() {
    if (!controller) return;
    view = controller.getView();
    const fresh = view.events.filter(e => e.seq > seenSeq);
    seenSeq = view.eventSeq;
    fresh.forEach(e => {
        const name = view.players[e.seat ?? e.winner]?.name;
        if (e.type === 'roll') {
            rolling = true;
            lastMove = null;
            setTimeout(() => { rolling = false; renderPanel(); }, 420);
        } else if (e.type === 'move') {
            lastMove = e;
        } else if (e.type === 'bust') {
            boardView.showBust(e.lost);
            showBanner('バースト！', 'bust');
            lastMove = null;
        } else if (e.type === 'stop') {
            e.claimed.forEach(col => boardView.showClaim(col));
            if (e.claimed.length > 0) showBanner(`${name}が ${e.claimed.join('・')} の列を取った`, 'claim', PLAYER_COLORS[e.seat]);
        } else if (e.type === 'end') {
            showBanner(`${name}の勝ち`, 'claim', PLAYER_COLORS[e.winner]);
            showResultSoon(RESULT_DELAY_MS);
        }
    });
    saveProgress();
    render();
}

function onError(message) {
    showBanner(message, 'info');
}

function showBanner(text, kind, color = null) {
    const el = $('banner');
    el.textContent = text;
    el.className = `banner show ${kind}`;
    el.style.setProperty('--banner-color', color ?? '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.className = 'banner'; }, kind === 'bust' ? 1300 : 1800);
}

const mine = () => view && view.phase !== 'end' && view.current === view.seat;

// ---------- 操作 ----------

function send(command) {
    clearTimeout(autoTimer);
    if (!controller || !mine()) return;
    controller.send(command);
}

function roll() {
    if (mine() && (view.phase === 'roll' || view.phase === 'decide')) send({ type: 'roll' });
}

function stop() {
    if (mine() && view.phase === 'decide') send({ type: 'stop' });
}

function chooseOption(index) {
    if (!mine() || view.phase !== 'choose') return;
    const option = view.options[index];
    if (option) send({ type: 'move', pair: option.pair, sums: option.sums });
}

// できることが 1 つだけなら、少し間を置いて自動で行う（手番の初めに振る、進め方が 1 つだけ）
function scheduleAuto() {
    clearTimeout(autoTimer);
    if (!mine() || document.querySelector('dialog[open]')) return;
    const key = controller.game.commands.length;
    const again = () => controller && controller.game.commands.length === key && mine();
    // 前の人のバーストや止めた結果を見る間を取ってから振る
    const lastType = view.events.at(-1)?.type;
    const rollDelay = lastType === 'bust' || lastType === 'stop' ? AUTO_DELAY_MS + 900 : AUTO_DELAY_MS;
    if (view.phase === 'roll') autoTimer = setTimeout(() => again() && roll(), rollDelay);
    else if (view.phase === 'choose' && view.options.length === 1) autoTimer = setTimeout(() => again() && chooseOption(0), AUTO_DELAY_MS + 250);
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    renderPlayers();
    boardView.render(view, { highlight: view.phase === 'choose' ? [...new Set(view.sums.flat())] : [] });
    renderPanel();
    scheduleAuto();
}

function renderPlayers() {
    $('players').innerHTML = view.players.map(p => `
        <div class="player${p.id === view.current ? ' current' : ''}${p.id === view.seat ? ' me' : ''}" style="--c:${PLAYER_COLORS[p.id]}">
            <span class="player-dot"></span>
            <span class="player-text">
                <span class="player-name">${escapeHtml(p.name)}</span>
                <span class="player-flags" aria-label="取った列 ${p.claimedCount}">${[0, 1, 2].map(i => `<i class="${i < p.claimedCount ? 'on' : ''}"></i>`).join('')}</span>
            </span>
        </div>`).join('');
}

function renderPanel() {
    if (!view) return;
    const playing = view.phase !== 'end';
    const my = mine();
    const who = playing ? view.players[view.current] : view.players[view.winner];
    let status = '';
    if (!playing) status = `${who.name}の勝ち`;
    else if (my) status = { roll: 'あなたの番', choose: '進む列を選ぶ', decide: '続ける？止める？' }[view.phase];
    else status = `${who.name}の番`;
    $('status-line').textContent = status;
    $('status-line').style.setProperty('--turn-color', PLAYER_COLORS[who.id]);

    const choosing = view.phase === 'choose';
    $('pairs').hidden = !choosing;
    $('dice-area').hidden = choosing;
    if (choosing) renderPairs(my);
    else renderDice(my, playing);
}

// 3 通りの分け方。押せる所だけをボタンにする
function renderPairs(my) {
    const rows = view.sums.map((sums, pair) => {
        const options = my ? view.options.map((o, index) => ({ ...o, index })).filter(o => o.pair === pair) : [];
        const halves = PAIRINGS[pair].map((idx, h) => ({ dice: idx.map(i => view.dice[i]), sum: sums[h] }));
        const halfHtml = half => `<span class="half-dice">${half.dice.map(v => dieSvg(v, 22)).join('')}</span><span class="half-sum">${half.sum}</span>`;
        const PLUS = '<span class="plus">＋</span>';
        if (!my) {
            return `<div class="pair-row card watching">${halves.map(h => `<span class="half">${halfHtml(h)}</span>`).join(PLUS)}</div>`;
        }
        if (options.length === 0) {
            return `<div class="pair-row card none">${halves.map(h => `<span class="half off">${halfHtml(h)}</span>`).join(PLUS)}</div>`;
        }
        if (options.length === 1) {
            // 使う和だけを強く、使えない和は打ち消す
            const left = [...options[0].sums];
            const cells = halves.map(h => {
                const i = left.indexOf(h.sum);
                if (i >= 0) left.splice(i, 1);
                return `<span class="half ${i >= 0 ? 'used' : 'off'}">${halfHtml(h)}</span>`;
            });
            return `<button class="pair-row card one" data-option="${options[0].index}" aria-label="組 ${pair + 1}">${cells.join(PLUS)}</button>`;
        }
        // どちらか 1 つを選ぶ
        return `<div class="pair-row either">${halves.map(h => {
            const o = options.find(x => x.sums[0] === h.sum);
            return o ? `<button class="half used" data-option="${o.index}" aria-label="${h.sum} の列">${halfHtml(h)}</button>` : `<span class="half off">${halfHtml(h)}</span>`;
        }).join('<span class="or">か</span>')}</div>`;
    });
    $('pairs').innerHTML = rows.join('');
}

function renderDice(my, playing) {
    // ダイス：進んだあとは、選んだ組に分けて見せる
    let html;
    if (!view.dice) {
        html = [1, 2, 3, 4].map(() => '<span class="die-blank"></span>').join('');
    } else if (lastMove && view.phase === 'decide') {
        html = PAIRINGS[lastMove.pair].map((idx, h) => `<span class="die-group">${idx.map(i => dieSvg(view.dice[i], 34)).join('')}<b>${view.sums[lastMove.pair][h]}</b></span>`).join('');
    } else {
        html = view.dice.map(v => dieSvg(v, 40, rolling ? 'rolling' : '')).join('');
    }
    $('dice').innerHTML = html;

    // バーストの確率と、この手番の進み（止めれば残り、バーストすれば失う）
    const risk = $('risk');
    const p = view.bustChance;
    risk.classList.toggle('hidden', p === null);
    if (p !== null) {
        const pct = Math.round(p * 100);
        const at = view.players[view.current];
        const steps = Object.entries(view.runners).reduce((s, [c, pos]) => s + pos - at.progress[c], 0);
        $('risk-value').textContent = `${pct}%　進み ${steps}マス`;
        $('risk-fill').style.width = `${Math.max(3, pct)}%`;
        $('risk-fill').style.background = `hsl(${Math.round(120 * Math.max(0, 1 - p * 2))} 70% 48%)`;
        risk.classList.toggle('danger', p >= 0.35);
    }
    const rollButton = $('roll');
    const stopButton = $('stop');
    stopButton.hidden = !playing;
    if (!playing) {
        rollButton.textContent = '結果';
        rollButton.disabled = false;
        rollButton.classList.remove('danger');
        return;
    }
    rollButton.textContent = view.phase === 'roll' ? '振る' : '続ける';
    rollButton.disabled = !(my && (view.phase === 'roll' || view.phase === 'decide'));
    stopButton.disabled = !(my && view.phase === 'decide');
    rollButton.classList.toggle('danger', my && view.phase === 'decide' && p >= 0.35);
}

// ---------- ダイアログ ----------

function openDialog(id) {
    const dialog = $(id);
    if (dialog.open) return;
    clearTimeout(autoTimer);
    controller?.pause();
    dialog.showModal();
}

function setupDialogs() {
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', e => {
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', () => {
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) {
                controller?.resume();
                if (view) scheduleAuto();
            }
        });
    });
    $('help-content').innerHTML = helpMarkup();
}

function showResultSoon(delay) {
    clearTimeout(resultTimer);
    resultTimer = setTimeout(showResult, delay);
}

function showResult() {
    if (!view || view.phase !== 'end' || scene !== 'game') return;
    const winner = view.players[view.winner];
    $('result-title').textContent = winner.id === view.seat ? 'あなたの勝ち' : `${winner.name}の勝ち`;
    const ranked = [...view.players].sort((a, b) => (b.id === view.winner) - (a.id === view.winner) || b.claimedCount - a.claimedCount);
    $('result-body').innerHTML = ranked.map(p => {
        const cols = COLUMNS.filter(c => view.claimed[c] === p.id);
        return `<div class="result-row${p.id === view.seat ? ' me' : ''}" style="--c:${PLAYER_COLORS[p.id]}">
            <span class="player-dot"></span><span class="result-name">${escapeHtml(p.name)}</span>
            <span class="result-cols">${cols.map(c => `<b>${c}</b>`).join('') || '<span class="none">なし</span>'}</span></div>`;
    }).join('');
    openDialog('result-dialog');
}

// ---------- 準備 ----------

function setup() {
    drawTitleArt();
    boardView = new BoardView($('board'));
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
    $('resume').addEventListener('click', () => startGame(store.load(KEYS.save) ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('home').addEventListener('click', goHome);
    $('roll').addEventListener('click', () => (view?.phase === 'end' ? showResult() : roll()));
    $('stop').addEventListener('click', stop);
    $('pairs').addEventListener('click', e => {
        const b = e.target.closest('[data-option]');
        if (b) chooseOption(Number(b.dataset.option));
    });
    $('again').addEventListener('click', () => {
        $('result-dialog').close();
        startGame(newSetup());
    });
    $('result-home').addEventListener('click', () => {
        $('result-dialog').close();
        goHome();
    });
    document.addEventListener('keydown', e => {
        if (scene !== 'game' || document.querySelector('dialog[open]') || !view) return;
        if (e.key === ' ') {
            e.preventDefault();
            roll();
        } else if (e.key === 's' || e.key === 'S') {
            stop();
        } else if (['1', '2', '3'].includes(e.key) && view.phase === 'choose' && view.options) {
            const index = view.options.findIndex(o => o.pair === Number(e.key) - 1);
            if (index >= 0) chooseOption(index);
        }
    });

    // ページの拡大を止める
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('input, textarea')) e.preventDefault();
    });

    showScene('title');
    registerServiceWorker();
    // 確かめるときに使う
    window.__app = { get controller() { return controller; }, get view() { return view; }, startGame, chooseOption, roll, stop };
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then(registration => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map(r => r.name)];
        const post = worker => worker?.postMessage({ type: 'cache-urls', urls });
        if (registration.active) post(registration.active);
        else navigator.serviceWorker.ready.then(r => post(r.active));
    }).catch(() => {});
}

setup();
