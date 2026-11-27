/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る（ローカル対戦とオンライン対戦で同じ形）
 */

import LocalGameController from './game-controller.js';
import { PILE_NAMES, MARK_NAMES, BACK_STEP, CARD_COUNT } from './game.js';
import { CPU_HELP, LEVELS, LEVEL_NAMES } from './cpu.js';
import * as storage from './storage.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const CPU_NAMES = ['ハル', 'ミオ', 'ソラ', 'レン'];
const HUMAN_NAME = 'あなた';
const RESULT_DELAY_MS = 1200;

const $ = selector => document.querySelector(selector);

const app = {
    scene: 'title',
    controller: null,
    view: null,
    selected: null,    // 選んでいる手札のカード
    hint: null,        // ヒントのおすすめの手（場面が変わったら消す）
    signalPile: null,  // 合図を選んでいる山
    resultTimer: null,
    settings: { count: 3, level: 'normal', ...storage.load('settings', {}) }
};

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// ===== 部品 =====

// 数字の大きさで色が変わる（小さいほど青、大きいほど赤）
const hueOf = value => Math.round(212 - (Math.min(99, Math.max(1, value)) - 1) / 98 * 200);

function cardHtml(value, cls = '', style = '') {
    return `<span class="card ${cls}" style="--h:${hueOf(value)};${style}"><span class="num">${value}</span></span>`;
}

const nameOf = (view, seat) => (seat === view.viewer ? HUMAN_NAME : view.players[seat]?.name ?? '');
const isMyTurn = view => !!view && !view.result && view.viewer !== null && view.current === view.viewer;

// 山にそのカードを出したときに進む数（出せなければ null。10戻しは -10）
function jumpFor(pile, card) {
    const jump = pile.dir === 'up' ? card - pile.top : pile.top - card;
    return jump > 0 || jump === -BACK_STEP ? jump : null;
}

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#screen-title').hidden = scene !== 'title';
    $('#screen-game').hidden = scene !== 'game';
    if (scene === 'title') renderTitle();
}

function renderTitle() {
    for (const b of document.querySelectorAll('#count-select button')) b.classList.toggle('on', Number(b.dataset.value) === app.settings.count);
    for (const b of document.querySelectorAll('#level-select button')) b.classList.toggle('on', b.dataset.level === app.settings.level);
    $('#level-setting').classList.toggle('muted', app.settings.count === 1);
    $('#resume').hidden = !LocalGameController.loadSaved();
    $('#online').hidden = !online.available;
}

function newSetup() {
    const players = [{ name: HUMAN_NAME, isCPU: false, level: app.settings.level }];
    for (let i = 1; i < app.settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true, level: app.settings.level });
    return { players };
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
    clearTimeout(app.resultTimer);
    app.view = null;
    app.selected = null;
    app.hint = null;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    app.controller = controller;
    showScene('game');
    music.play('shuffle');
    update();
}

// ===== オンライン対戦（入口とロビーは netplay-lobby.js の画面） =====

const online = new NetplayLobby({
    title: 'ザ・ゲーム',
    game: 'the-game',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: 750,
    minPlayers: 2,
    maxPlayers: 5,
    settings: [{ key: 'level', label: 'CPU', options: LEVELS.map(value => ({ value, label: LEVEL_NAMES[value] })) }],
    onStart: (controller) => beginGame(controller),
    onUpdate: () => update(),
    onError: () => {
        music.play('error');
        update();
    },
    onExit: () => {
        app.controller = null;
        clearTimeout(app.resultTimer);
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
    clearTimeout(app.resultTimer);
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const previous = app.view;
    const view = app.controller.getView();
    if (previous && view.commandCount !== previous.commandCount) {
        app.hint = null;
        if (app.selected !== null && !view.hand.includes(app.selected)) app.selected = null;
        if (!isMyTurn(view)) app.selected = null;
        // ほかの人の手は notify、自分の番になったら turn（CPU が続けて出すときは最後に1回）
        const move = view.lastMove;
        if (isMyTurn(view) && !isMyTurn(previous) && view.commandCount > previous.commandCount) music.play('turn');
        else if (move?.type === 'play' && move.seat !== view.viewer && view.commandCount > previous.commandCount) music.play('notify');
    }
    if (view.result && (!previous || !previous.result)) onGameEnd(view, !!previous);
    app.view = view;
    if (app.scene === 'game') render(view);
}

function onGameEnd(view, live) {
    // 出し切りは win、10枚以下は notify、それ以外は lose
    if (live) music.play(view.result.win ? 'win' : view.result.excellent ? 'notify' : 'lose');
    clearTimeout(app.resultTimer);
    app.resultTimer = setTimeout(showResult, live ? RESULT_DELAY_MS : 0);
}

function render(view) {
    renderTopbar(view);
    renderTeam(view);
    renderPiles(view);
    renderStatus(view);
    renderHand(view);
    const end = $('#end-turn');
    end.disabled = !(isMyTurn(view) && view.canEnd);
    end.classList.toggle('recommended', app.hint?.type === 'end');
    end.hidden = view.viewer === null;
}

function renderTopbar(view) {
    $('#deck-info').innerHTML = `<span class="deck-icon" aria-hidden="true"></span>山札 <b>${view.deckCount}</b><span class="sep">·</span>残り <b>${view.remaining}</b>`;
    const isOnline = !!app.controller?.isOnline;
    $('#hint').hidden = isOnline || view.viewer === null || !!view.result;
    $('#undo').hidden = isOnline || !app.controller?.canUndo?.();
    $('#result-open').hidden = !view.result;
}

function renderTeam(view) {
    $('#team').innerHTML = view.players.map(p => {
        const cls = ['member', p.seat === view.current && !view.result ? 'turn' : '', p.seat === view.viewer ? 'me' : '', p.handCount === 0 ? 'out' : ''].join(' ');
        return `<div class="${cls}"><span class="member-name">${escapeHtml(nameOf(view, p.seat))}</span><span class="member-hand"><span class="mini-back" aria-hidden="true"></span>${p.handCount}</span></div>`;
    }).join('');
}

function renderPiles(view) {
    const myTurn = isMyTurn(view);
    const just = view.lastMove?.type === 'play' ? view.lastMove.pile : null;
    $('#piles').innerHTML = view.piles.map((pile, i) => {
        const jump = myTurn && app.selected !== null ? jumpFor(pile, app.selected) : null;
        const recommended = app.hint?.type === 'play' && app.hint.pile === i;
        const cls = ['pile', pile.dir, jump !== null ? 'playable' : '', recommended ? 'recommended' : '', just === i ? 'just' : ''].join(' ');
        const top = pile.count === 0
            ? `<span class="card base"><span class="num">${pile.top}</span></span>`
            : cardHtml(pile.top, just === i ? 'flip' : '');
        const jumpText = jump === null ? '' : jump === -BACK_STEP ? '10戻し' : `+${jump}`;
        const marks = view.players
            .filter(p => p.seat !== view.viewer && p.signals[i])
            .map(p => `<span class="mark ${p.signals[i]}" title="${escapeHtml(p.name)}：${MARK_NAMES[p.signals[i]]}"><svg><use href="#sym-${p.signals[i]}"/></svg>${escapeHtml(p.name.slice(0, 4))}</span>`)
            .join('');
        const mine = view.viewer !== null ? view.players[view.viewer].signals[i] : null;
        const myMark = view.viewer === null || view.result ? '' : `<button type="button" class="my-mark${mine ? ` ${mine}` : ''}" data-mark-pile="${i}" aria-label="${PILE_NAMES[i]}に合図">${mine ? `<svg><use href="#sym-${mine}"/></svg>` : ''}${mine === 'stop' ? '出さないで' : mine === 'good' ? '大事' : '合図'}</button>`;
        return `<div class="${cls}" data-pile="${i}">
            <div class="pile-head"><svg><use href="#sym-${pile.dir}"/></svg>${pile.dir === 'up' ? '上り' : '下り'}</div>
            <button type="button" class="pile-slot" data-pile="${i}" aria-label="${PILE_NAMES[i]}（${pile.top}）">${top}<span class="pile-jump${jump === -BACK_STEP ? ' back' : ''}">${jumpText}</span></button>
            <div class="pile-marks">${marks}</div>
            ${myMark}
        </div>`;
    }).join('');
}

function renderStatus(view) {
    let text;
    if (view.result) text = view.result.win ? '98枚すべて出し切った' : `残り${view.result.remaining}枚で終わり`;
    else if (isMyTurn(view)) {
        const left = view.required - view.played;
        text = left > 0 ? `あなたの番　あと${left}枚${view.required === 1 ? '' : '以上'}` : 'あなたの番　続けて出すか、番を終える';
    } else text = `${escapeHtml(nameOf(view, view.current))}の番`;
    $('#status').innerHTML = text;
    $('#status').classList.toggle('mine', isMyTurn(view));
}

function renderHand(view) {
    const myTurn = isMyTurn(view);
    const count = Math.max(view.hand.length, view.handSize);
    $('#hand').style.setProperty('--slots', count);
    $('#hand').innerHTML = view.hand.map(card => {
        const playable = view.piles.some(pile => jumpFor(pile, card) !== null);
        const cls = [
            'hand-card',
            app.selected === card ? 'selected' : '',
            myTurn && !playable ? 'dead' : '',
            app.hint?.type === 'play' && app.hint.card === card ? 'recommended' : ''
        ].join(' ');
        return `<button type="button" class="${cls}" data-card="${card}" aria-label="${card}">${cardHtml(card)}</button>`;
    }).join('');
}

// ===== 操作 =====

function send(command) {
    if (!app.controller) return false;
    app.hint = null;
    return app.controller.send(command);
}

function onPlayClick(event) {
    const view = app.view;
    if (!view || view.result) return;
    const markButton = event.target.closest('[data-mark-pile]');
    if (markButton) return openSignal(Number(markButton.dataset.markPile));
    const cardButton = event.target.closest('[data-card]');
    if (cardButton) {
        if (!isMyTurn(view)) return;
        const card = Number(cardButton.dataset.card);
        app.selected = app.selected === card ? null : card;
        music.play(app.selected === null ? 'cancel' : 'select');
        render(view);
        return;
    }
    const pileButton = event.target.closest('.pile-slot');
    if (pileButton && isMyTurn(view) && app.selected !== null) {
        const pile = Number(pileButton.dataset.pile);
        const jump = jumpFor(view.piles[pile], app.selected);
        if (jump === null) {
            music.play('error');
            return;
        }
        const card = app.selected;
        app.selected = null;
        if (send({ type: 'play', card, pile })) music.play(jump === -BACK_STEP ? 'gain' : 'place');
    }
}

function endTurn() {
    const view = app.view;
    if (!isMyTurn(view) || !view.canEnd) return;
    app.selected = null;
    if (send({ type: 'end' })) music.play(view.deckCount > 0 ? 'draw' : 'place');
}

function showHint() {
    const hint = app.controller?.hint?.();
    if (!hint || !app.view) return;
    app.hint = hint;
    app.selected = hint.type === 'play' ? hint.card : null;
    music.play('select');
    render(app.view);
}

function undo() {
    if (!app.controller?.undo?.()) return;
    app.selected = null;
    music.play('cancel');
}

// ===== 合図 =====

function openSignal(pile) {
    const view = app.view;
    if (!view || view.viewer === null) return;
    app.signalPile = pile;
    const mine = view.players[view.viewer].signals[pile];
    $('#signal-title').textContent = `${PILE_NAMES[pile]}に合図`;
    for (const b of document.querySelectorAll('.signal-choice')) {
        b.classList.toggle('on', (b.dataset.mark || null) === mine);
        b.hidden = !b.dataset.mark && !mine;
    }
    openDialog($('#signal-dialog'));
}

function chooseSignal(mark) {
    const pile = app.signalPile;
    $('#signal-dialog').close();
    const view = app.view;
    if (pile === null || !view || view.viewer === null) return;
    if ((view.players[view.viewer].signals[pile] ?? null) === mark) return;
    if (send({ type: 'signal', pile, mark })) music.play(mark ? 'select' : 'cancel');
}

// ===== ダイアログ =====

function openDialog(dialog) {
    if (!app.controller?.isOnline) app.controller?.pause?.();
    if (!dialog.open) dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume?.();
}

function openLog() {
    const view = app.view;
    if (!view) return;
    $('#log-body').innerHTML = [...view.logs].reverse().map(line => `<li>${escapeHtml(line)}</li>`).join('');
    openDialog($('#log-dialog'));
}

// ===== 結果 =====

function showResult() {
    const view = app.view;
    if (!view || !view.result || app.scene !== 'game') return;
    const r = view.result;
    const title = r.win ? '全部出し切った' : r.excellent ? 'すばらしい' : 'ここまで';
    $('#result-title').textContent = title;
    $('#result-title').className = `sheet-title ${r.win ? 'won' : r.excellent ? 'good' : 'lost'}`;
    $('#result-body').innerHTML = `
        <div class="result-score"><span class="result-num">${r.remaining}</span><span class="result-unit">枚残り</span></div>
        <ul class="result-stats">
            <li>出したカード <b>${r.played}</b> / ${CARD_COUNT}</li>
            <li>10戻し <b>${view.backs}</b>回</li>
            <li>番の数 <b>${r.turns}</b></li>
        </ul>`;
    if (!$('#result-dialog').open) openDialog($('#result-dialog'));
}

function playAgain() {
    $('#result-dialog').close();
    if (app.controller?.isOnline) return online.rematch();
    const setup = app.controller?.setup;
    LocalGameController.clearSaved();
    startGame(setup ? { players: setup.players } : newSetup());
}

// ===== タイトルの絵 =====

function renderTitleArt() {
    const cards = [12, 37, 27, 74, 96];
    $('#title-art').innerHTML = cards.map((c, i) => cardHtml(c, '', `--i:${i - 2}`)).join('');
}

// ===== 初期化 =====

function init() {
    // ヘッドレス Chrome での確認に使う
    window.__app = app;
    renderTitleArt();
    $('#cpu-help').innerHTML = CPU_HELP.map(line => `<li>${escapeHtml(line)}</li>`).join('');
    $('#count-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.count = Number(button.dataset.value);
        storage.save('settings', app.settings);
        music.play('select');
        renderTitle();
    });
    $('#level-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.level = button.dataset.level;
        storage.save('settings', app.settings);
        music.play('select');
        renderTitle();
    });
    $('#start').addEventListener('click', () => {
        LocalGameController.clearSaved();
        startGame(newSetup());
    });
    $('#online').addEventListener('click', () => online.open());
    $('#resume').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });
    $('#play').addEventListener('click', onPlayClick);
    $('#signal-dialog').addEventListener('click', event => {
        const choice = event.target.closest('.signal-choice');
        if (choice) chooseSignal(choice.dataset.mark || null);
    });

    document.addEventListener('click', event => {
        const el = event.target.closest('[data-action]');
        const action = el?.dataset.action;
        if (!action) return;
        if (action === 'home') goHome();
        if (action === 'help') openDialog($('#help'));
        if (action === 'close-help') $('#help').close();
        if (action === 'log') openLog();
        if (action === 'hint') showHint();
        if (action === 'undo') undo();
        if (action === 'end') endTurn();
        if (action === 'result') showResult();
        if (action === 'close-result') $('#result-dialog').close();
        if (action === 'again') playAgain();
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

    showScene('title');
    // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
    online.boot();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').then(registration => {
            const worker = registration.active || registration.waiting || registration.installing;
            const urls = performance.getEntriesByType('resource').map(entry => entry.name).concat(location.href);
            const post = target => target?.postMessage({ type: 'cache-urls', urls });
            if (worker?.state === 'activated') post(worker);
            else navigator.serviceWorker.ready.then(ready => post(ready.active));
        }).catch(() => {});
    }
}

init();
