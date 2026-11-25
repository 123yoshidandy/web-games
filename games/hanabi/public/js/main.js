/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る
 */

import LocalGameController from './game-controller.js';
import { COLOR_NAMES, MAX_CLUES, MAX_MISTAKES, bitsToColors, bitsToRanks, clueText } from './game.js';
import * as storage from './storage.js';

const CPU_NAMES = ['ハル', 'ミオ', 'ソラ', 'レン'];
const HUMAN_NAME = 'あなた';
const FLY_MS = 450;

const $ = selector => document.querySelector(selector);

const app = {
    scene: 'title',
    controller: null,
    view: null,
    selection: null, // { seat, order }
    settings: { count: 3, ...storage.load('settings', {}) }
};

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ===== 部品 =====

function faceHtml(color, rank, extra = '', attrs = '') {
    return `<span class="card face c${color}${extra}"${attrs}>
        <svg class="sym"><use href="#s${color}"/></svg>
        <svg class="burst"><use href="#burst"/></svg>
        <span class="rank">${rank}</span>
    </span>`;
}

// その人が分かっていることの印（ほかの人の札の下）
function knownMark(card) {
    const colors = bitsToColors(card.colors);
    const ranks = bitsToRanks(card.ranks);
    const color = colors.length === 1 ? `<svg class="mark-sym c${colors[0]}"><use href="#s${colors[0]}"/></svg>` : '';
    const rank = ranks.length === 1 ? `<b>${ranks[0]}</b>` : '';
    return `<span class="known">${color}${rank}</span>`;
}

// 自分の札（裏）。ヒントで分かったことを表に出し、下にまだあり得る色と数字を並べる
function myCardHtml(card, extra) {
    const colors = bitsToColors(card.colors);
    const ranks = bitsToRanks(card.ranks);
    const colorClass = colors.length === 1 ? ` c${colors[0]} known-color` : '';
    const sym = colors.length === 1 ? `<svg class="sym"><use href="#s${colors[0]}"/></svg>` : '';
    const rank = ranks.length === 1 ? ranks[0] : '?';
    const possColors = colors.length < 5
        ? colors.map(c => `<svg class="mark-sym c${c}"><use href="#s${c}"/></svg>`).join('') : '';
    const possRanks = ranks.length < 5 ? ranks.join('') : '';
    return `<span class="slot" data-seat="me" data-order="${card.order}">
        <span class="card back${colorClass}${card.clued ? ' clued' : ''}${extra}" data-order="${card.order}">${sym}<span class="rank">${rank}</span></span>
        <span class="poss"><span class="poss-colors">${possColors}</span><span class="poss-ranks">${possRanks}</span></span>
    </span>`;
}

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#title-screen').hidden = scene !== 'title';
    $('#game-screen').hidden = scene !== 'game';
    if (scene === 'title') renderTitle();
}

function renderTitle() {
    for (const b of document.querySelectorAll('#count-select button')) b.classList.toggle('on', Number(b.dataset.value) === app.settings.count);
    $('#resume-button').hidden = !LocalGameController.loadSaved();
}

function newSetup() {
    const players = [{ name: HUMAN_NAME, isCPU: false }];
    for (let i = 1; i < app.settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players };
}

function startGame(setup) {
    app.controller?.stop();
    app.view = null;
    app.selection = null;
    if ($('#result-dialog').open) $('#result-dialog').close();
    app.controller = new LocalGameController(setup, { onUpdate: () => update(), onError: () => update() });
    showScene('game');
    update();
}

function goHome() {
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
    const moved = previous && view.commandCount === previous.commandCount + 1 ? view.lastMove : null;
    if (previous && view.commandCount !== previous.commandCount) app.selection = null;
    // 描画の前に、出した・捨てた札の位置を測る
    const from = moved && moved.type !== 'clue' && !reduced()
        ? document.querySelector(`.card[data-order="${moved.order}"]`)?.getBoundingClientRect() : null;
    app.view = view;
    render(view);
    if (moved && from) flyCard(moved, from);
    if (view.phase === 'end' && previous && previous.phase !== 'end') setTimeout(showResult, 1300);
}

const myTurn = view => view.phase !== 'end' && view.current === view.viewer;

function render(view) {
    fitLayout(view);
    renderTokens(view);
    renderFireworks(view);
    renderOthers(view);
    renderMe(view);
    renderActions(view);
    $('#status').textContent = statusText(view);
    $('#result-button').hidden = view.phase !== 'end';
}

function renderTokens(view) {
    const mistakes = Array.from({ length: MAX_MISTAKES }, (_, i) =>
        `<span class="fuse${i < view.mistakes ? ' on' : ''}"></span>`).join('');
    const last = view.turnsLeft !== null && view.phase !== 'end' ? `<span class="token last">残り${view.turnsLeft}手</span>` : '';
    $('#tokens').innerHTML = `
        <span class="token" title="ヒント"><span class="clue-dot"></span>${view.clues}</span>
        <span class="token" title="ミス">${mistakes}</span>
        <span class="token" title="山札"><span class="deck-icon"></span>${view.deckCount}</span>${last}`;
}

function renderFireworks(view) {
    const piles = view.fireworks.map((top, color) => top
        ? `<span class="pile" data-color="${color}">${faceHtml(color, top)}</span>`
        : `<span class="pile" data-color="${color}"><span class="card empty c${color}"><svg class="sym"><use href="#s${color}"/></svg></span></span>`).join('');
    $('#fireworks').innerHTML = `${piles}<button type="button" class="discard-button" data-action="discards" aria-label="捨て札">
        <span class="discard-count">${view.discards.length}</span><span class="discard-label">捨て札</span></button>`;
}

function touchedNow(view) {
    return view.lastMove?.type === 'clue' ? view.lastMove.touched : [];
}

function renderOthers(view) {
    const touched = touchedNow(view);
    const sel = app.selection;
    const order = [];
    for (let i = 1; i < view.players.length; i++) order.push(view.players[(view.viewer + i) % view.players.length]);
    $('#others').innerHTML = order.map(player => {
        const turn = view.phase !== 'end' && view.current === player.seat;
        const cards = player.hand.map(card => {
            let extra = '';
            if (card.clued) extra += ' clued';
            if (touched.includes(card.order)) extra += ' touched';
            if (sel && sel.seat === player.seat) {
                const picked = view.players[sel.seat].hand.find(c => c.order === sel.order);
                if (card.order === sel.order) extra += ' selected';
                else if (picked && (card.color === picked.color || card.rank === picked.rank)) extra += ' related';
            }
            return `<span class="slot" data-seat="${player.seat}" data-order="${card.order}">
                ${faceHtml(card.color, card.rank, extra, ` data-order="${card.order}"`)}${knownMark(card)}</span>`;
        }).join('');
        return `<div class="other${turn ? ' turn' : ''}" data-seat="${player.seat}">
            <span class="other-name">${escapeHtml(player.name)}</span><div class="hand">${cards}</div></div>`;
    }).join('');
}

function renderMe(view) {
    const me = view.players[view.viewer];
    const touched = touchedNow(view);
    const sel = app.selection;
    const drawn = view.lastMove && view.lastMove.type !== 'clue' ? view.lastMove.drawn : null;
    const cards = me.hand.map(card => {
        let extra = '';
        if (touched.includes(card.order)) extra += ' touched';
        if (sel && sel.seat === view.viewer && sel.order === card.order) extra += ' selected';
        if (card.order === drawn) extra += ' dealt';
        return myCardHtml(card, extra);
    }).join('');
    $('#me').innerHTML = `<div class="me-head"><span class="pname">${escapeHtml(me.name)}</span><span class="score">${view.score}<small>点</small></span></div>
        <div class="hand mine">${cards}</div>`;
    $('#me').classList.toggle('turn', myTurn(view));
}

function renderActions(view) {
    const sel = app.selection;
    let html = '';
    if (myTurn(view) && sel) {
        if (sel.seat === view.viewer) {
            html = `<button type="button" class="btn btn-primary" data-action="play">出す</button>
                <button type="button" class="btn btn-secondary" data-action="discard"${view.clues >= MAX_CLUES ? ' disabled' : ''}>捨てる</button>`;
        } else {
            const target = view.players[sel.seat];
            const card = target.hand.find(c => c.order === sel.order);
            const colorCount = target.hand.filter(c => c.color === card.color).length;
            const rankCount = target.hand.filter(c => c.rank === card.rank).length;
            const disabled = view.clues <= 0 ? ' disabled' : '';
            html = `<button type="button" class="btn clue-btn c${card.color}" data-action="clue-color"${disabled}>
                    <svg class="sym"><use href="#s${card.color}"/></svg>${COLOR_NAMES[card.color]}<small>${colorCount}枚</small></button>
                <button type="button" class="btn clue-btn rank-btn" data-action="clue-rank"${disabled}>
                    <b>${card.rank}</b><small>${rankCount}枚</small></button>`;
        }
    }
    $('#actions').innerHTML = html;
}

function statusText(view) {
    const m = view.lastMove;
    if (view.phase === 'end') return view.endReason === 'mistakes' ? '花火が爆発：全員の負け' : `終了：${view.score}点`;
    if (!m) return myTurn(view) ? 'あなたの番' : '';
    const name = seat => view.players[seat].name;
    if (m.type === 'clue') return `${name(m.seat)} → ${name(m.target)}：「${clueText(m.kind, m.value)}」${m.touched.length}枚`;
    const card = `${COLOR_NAMES[m.color]}${m.rank}`;
    if (m.type === 'discard') return `${name(m.seat)}：${card}を捨てた`;
    return m.success ? `${name(m.seat)}：${card}を出した` : `${name(m.seat)}：${card}を出してミス`;
}

// 出した札は花火へ、捨てた札とミスの札は捨て札へ飛ばす
function flyCard(move, from) {
    const target = move.type === 'play' && move.success
        ? document.querySelector(`.pile[data-color="${move.color}"]`) : document.querySelector('.discard-button');
    if (!target) return;
    const to = target.getBoundingClientRect();
    const wrap = document.createElement('div');
    wrap.innerHTML = faceHtml(move.color, move.rank, ' flying');
    const el = wrap.firstElementChild;
    Object.assign(el.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, fontSize: `${from.width}px` });
    document.body.appendChild(el);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.min(1, to.width / from.width);
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 - 40}px) scale(${(1 + scale) / 2 + 0.1})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: move.success ? 1 : 0.3 }
    ], { duration: FLY_MS, easing: 'cubic-bezier(.4,.1,.3,1)' });
    const done = () => el.remove();
    animation.onfinish = done;
    animation.oncancel = done;
    setTimeout(done, FLY_MS + 400);
}

// ===== 大きさ =====

function fitLayout(view) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const landscape = width > height && width >= 600;
    document.body.classList.toggle('landscape', landscape);
    const others = view.players.length - 1;
    const hs = view.handSize;
    const TOP = 44;
    const STATUS = 24;
    const ACTIONS = 52;
    const NAME = 50;
    let cw, mw, fw;
    if (!landscape) {
        const w = Math.min(width, 560) - 16;
        cw = Math.min(others <= 2 ? 64 : 54, (w - NAME - (hs - 1) * 4) / hs);
        mw = Math.min(74, (w - 24 - (hs - 1) * 6) / hs); // 自分の手札の枠の余白と枠線（24）を引く
        fw = Math.min(44, (w - 70 - 4 * 6) / 5);
        // 1行 = 札 + 分かっていることの印（12）+ すき間・余白・枠線（16）。自分 = 札 + 見出し（22）+ 候補（24）+ 余白・枠線（14）
        const need = () => TOP + (fw * 1.4 + 10) + others * (cw * 1.4 + 28) + STATUS + (mw * 1.4 + 66) + ACTIONS + 32;
        let guard = 0;
        while (need() > height && guard++ < 80) {
            cw *= 0.97;
            mw *= 0.975;
            fw *= 0.98;
        }
    } else {
        const leftW = Math.min(width * 0.52, 640) - 16;
        const rightW = Math.min(width - leftW - 48, 620);
        fw = Math.min(60, (leftW - 70 - 24) / 5, (height - TOP) * 0.12);
        cw = Math.min(84, (leftW - NAME - (hs - 1) * 4) / hs, ((height - TOP - (fw * 1.4 + 10) - 20) / others - 28) / 1.4);
        mw = Math.min(104, (rightW - 24 - (hs - 1) * 6) / hs, (height - TOP - STATUS - ACTIONS - 66 - 30) / 1.4);
    }
    const root = document.documentElement.style;
    root.setProperty('--cw', `${Math.floor(cw)}px`);
    root.setProperty('--mw', `${Math.floor(mw)}px`);
    root.setProperty('--fw', `${Math.floor(fw)}px`);
}

// ===== 入力 =====

function onPlayClick(event) {
    const view = app.view;
    if (!view || !app.controller) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'discards') return openDiscards();
    if (!myTurn(view)) return;
    const sel = app.selection;
    if (action === 'play' && sel) return app.controller.send({ type: 'play', order: sel.order });
    if (action === 'discard' && sel) return app.controller.send({ type: 'discard', order: sel.order });
    if ((action === 'clue-color' || action === 'clue-rank') && sel) {
        const card = view.players[sel.seat].hand.find(c => c.order === sel.order);
        const kind = action === 'clue-color' ? 'color' : 'rank';
        return app.controller.send({ type: 'clue', target: sel.seat, kind, value: kind === 'color' ? card.color : card.rank });
    }
    const slot = event.target.closest('.slot');
    if (slot) {
        const seat = slot.dataset.seat === 'me' ? view.viewer : Number(slot.dataset.seat);
        const order = Number(slot.dataset.order);
        const same = sel && sel.seat === seat && sel.order === order;
        app.selection = same ? null : { seat, order };
        render(view);
    }
}

function openDialog(dialog) {
    app.controller?.pause();
    dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume();
}

function openDiscards() {
    const view = app.view;
    const rows = [0, 1, 2, 3, 4].map(color => {
        const cards = view.discards.filter(c => c.color === color).sort((a, b) => a.rank - b.rank)
            .map(c => faceHtml(c.color, c.rank)).join('');
        return `<div class="discard-row"><svg class="mark-sym c${color}"><use href="#s${color}"/></svg><div class="discard-cards">${cards || '<span class="none">なし</span>'}</div></div>`;
    }).join('');
    $('#discard-body').innerHTML = rows;
    openDialog($('#discard-dialog'));
}

function openLog() {
    const view = app.view;
    if (!view) return;
    $('#log-body').innerHTML = [...view.logs].reverse().map(line => `<li>${escapeHtml(line)}</li>`).join('');
    openDialog($('#log-dialog'));
}

// ===== 結果 =====

function verdict(score) {
    if (score === 25) return '完璧な花火';
    if (score >= 21) return '見事な花火';
    if (score >= 16) return '上々の花火';
    if (score >= 11) return 'まずまずの花火';
    if (score >= 6) return 'ささやかな花火';
    return 'しけった花火';
}

function showResult() {
    const view = app.view;
    if (!view || view.phase !== 'end' || app.scene !== 'game') return;
    const exploded = view.endReason === 'mistakes';
    $('#result-title').textContent = exploded ? '爆発：全員の負け' : `${view.score}点：${verdict(view.score)}`;
    $('#result-title').classList.toggle('lost', exploded);
    const reason = {
        mistakes: 'ミスが3回になり、花火が爆発しました（0点）',
        perfect: '25点で終了',
        deck: '山札が尽きて終了'
    }[view.endReason];
    const piles = view.fireworks.map((top, color) => top ? faceHtml(color, top) : `<span class="card empty c${color}"><svg class="sym"><use href="#s${color}"/></svg></span>`).join('');
    $('#result-body').innerHTML = `<p class="result-note">${reason}</p><div class="result-piles${exploded ? ' exploded' : ''}">${piles}</div>`;
    openDialog($('#result-dialog'));
}

// ===== タイトルの絵 =====

function renderStaticArt() {
    const cards = [[0, 5], [1, 4], [2, 3], [3, 2], [4, 1]];
    $('#title-art').innerHTML = `<div class="fan">${cards.map(([c, r], i) =>
        `<span class="fan-card" style="--i:${i - 2}">${faceHtml(c, r)}</span>`).join('')}</div>`;
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
        if (action === 'close-help') $('#help-dialog').close();
        if (action === 'log') openLog();
        if (action === 'result') showResult();
        if (action === 'close-result') $('#result-dialog').close();
        if (action === 'rematch') {
            const setup = app.controller?.setup;
            $('#result-dialog').close();
            startGame(setup ? { players: setup.players } : newSetup());
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

    showScene('title');

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
    window.__hb = app;
}

init();
