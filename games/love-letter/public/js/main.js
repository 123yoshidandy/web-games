/**
 * 画面の進行：タイトル → ゲーム（ラウンドの結果を挟む）→ 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController from './game-controller.js';
import { CARDS, cardName, GUARD, PRINCE, PRINCESS } from './cards.js';
import { cardFace, cardBack, emblemSvg } from './card-art.js';
import { describeEvent } from './log.js';
import { unseenCounts } from './cpu-player.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';
import { music } from './music.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { recordResult } from './netplay/user-stats.js';
import * as Motion from './motion/motion.js';
import { measure, animate } from './animator.js';

const $ = id => document.getElementById(id);
const KEYS = { settings: 'loveletter.settings.v1', save: 'loveletter.save.v1' };
const CPU_NAMES = ['ジャン', 'マリー', 'ピエール', 'ソフィ', 'ルイ'];
const SPOTLIGHT_MS = 1500;
const ROUND_DIALOG_DELAY_MS = 1200;
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

let settings = { count: 3, level: 'normal', ...store.load(KEYS.settings) };
let scene = 'title';
let controller = null;
let view = null;
let seenSeq = 0;
let ui = freshUi();
let spotlightTimer = null;
let roundTimer = null; // 結果のダイアログを出す予約（取り消す関数。動きが終わってから出す）
let pendingRound = null; // ラウンドの終わりのイベント（結果のダイアログに出す）
let hint = null; // ヒントで示している手 { key, command }（その手番の間だけ）

function cancelRound() {
    roundTimer?.();
    roundTimer = null;
}

function freshUi() {
    return { key: null, card: null, target: null, guess: null };
}

const nameOf = seat => (seat === view.seat ? 'あなた' : view.players[seat].name);
const hearts = (n, max) => `<span class="hearts" aria-label="好意の印 ${n}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

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
    $('title-art').innerHTML = [1, 3, 9, 5].map((v, i) => `<div class="fan fan-${i}">${cardFace(v, { size: 'mid' })}</div>`).join('');
}

// ---------- ゲームの開始 ----------

function newSetup() {
    const players = [{ name: 'あなた', isCPU: false }];
    for (let i = 1; i < settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, options: { seed: createSeed() }, level: settings.level };
}

function startGame(setup) {
    let local;
    try {
        local = new LocalGameController({ ...setup, cpuDelay: CPU_DELAY }, { onUpdate, onError });
    } catch (error) {
        // 保存した記録が読めないときは、新しく始める
        console.warn(error);
        store.remove(KEYS.save);
        local = new LocalGameController({ ...newSetup(), cpuDelay: CPU_DELAY }, { onUpdate, onError });
    }
    beginGame(local);
}

// ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(next) {
    if (controller !== next) controller?.stop();
    cancelRound();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    pendingRound = null;
    hint = null;
    controller = next;
    view = controller.getView();
    seenSeq = view.eventSeq;
    ui = freshUi();
    showScene('game');
    render();
    if (view.phase === 'end') showRoundSoon(view.events.filter(e => e.type === 'roundEnd').at(-1), 0);
    saveProgress();
}

function saveProgress() {
    if (!controller || controller.isOnline) return; // オンライン対戦はサーバーが持つ
    if (controller.game.isOver()) store.remove(KEYS.save);
    else store.save(KEYS.save, controller.saveData());
}

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (controller?.isOnline) return online.confirmLeave();
    controller?.stop();
    controller = null;
    cancelRound();
    showScene('title');
}

// ---------- オンライン対戦（入口とロビーは netplay-lobby.js の画面） ----------

const online = new NetplayLobby({
    title: 'ラブレター',
    game: 'love-letter',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: 1400,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: [{ key: 'cpuLevel', label: 'CPU の強さ', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }] }],
    onStart: (next) => beginGame(next),
    onUpdate: () => onUpdate(),
    onError: (message) => onError(message),
    onExit: () => {
        controller = null;
        view = null;
        cancelRound();
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        showScene('title');
    }
});

// ---------- 更新 ----------

function onUpdate() {
    if (!controller) return;
    const before = measure(view);
    view = controller.getView();
    const fresh = view.events.filter(e => e.seq > seenSeq);
    seenSeq = view.eventSeq;
    playSound(fresh);
    if (fresh.some(e => e.type === 'end')) recordLocalResult();
    const play = fresh.find(e => e.type === 'play');
    if (play) showSpotlight(play, fresh);
    const roundEnd = fresh.find(e => e.type === 'roundEnd');
    if (roundEnd) showRoundSoon(roundEnd, ROUND_DIALOG_DELAY_MS);
    saveProgress();
    render();
    animate(before, view, fresh);
}

// ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
// id はシードから作る（同じ対戦を2回数えない）
function recordLocalResult() {
    if (!controller || controller.isOnline || controller.game.players.filter(p => !p.isCPU).length !== 1) return;
    const outcome = view.winner === null ? 'draw' : view.winner === view.seat ? 'win' : 'loss';
    recordResult({ game: 'love-letter', id: `love-letter-${controller.game.options.seed}`, outcome });
}

// 1つの更新に1つの音。自分の手は置く（相手を脱落させたら capture）、相手の手は notify、自分の番になったら turn
function playSound(fresh) {
    if (!fresh.length) return;
    const end = fresh.find(e => e.type === 'end');
    if (end) return music.play(end.winner === view.seat ? 'win' : 'lose');
    const roundEnd = fresh.find(e => e.type === 'roundEnd');
    if (roundEnd) return music.play(roundEnd.winners.includes(view.seat) ? 'gain' : 'notify');
    const acts = fresh.filter(e => e.type === 'play' || e.type === 'keep');
    const last = acts.at(-1);
    if (fresh.some(e => e.type === 'out' && e.seat === view.seat)) return music.play('pay');
    if (last?.seat === view.seat) return music.play(fresh.some(e => e.type === 'out') ? 'capture' : 'place');
    if (myTurn()) return music.play('turn');
    if (last) music.play('notify');
}

function onError(message) {
    music.play('error');
    $('prompt').textContent = message;
}

// 出されたカードを真ん中に大きく出し、誰が誰に出したか・結果を添える
function showSpotlight(play, fresh) {
    const lines = fresh.filter(e => e.seq > play.seq && e.type !== 'draw' && e.type !== 'round' && e.type !== 'roundEnd' && e.type !== 'end')
        .map(e => describeEvent(e, view)).filter(Boolean).slice(0, 2);
    const who = play.target === null ? nameOf(play.seat) : play.target === play.seat ? `${nameOf(play.seat)}（自分）` : `${nameOf(play.seat)} → ${nameOf(play.target)}`;
    const guess = play.guess !== null && play.guess !== undefined ? `<div class="spot-guess">「${cardName(play.guess)}」</div>` : '';
    const el = $('spotlight');
    el.innerHTML = `<div class="spot-card">${cardFace(play.card, { size: 'mid' })}</div><div class="spot-text"><b>${escapeHtml(who)}</b>${guess}${lines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}</div>`;
    el.classList.add('show');
    clearTimeout(spotlightTimer);
    spotlightTimer = setTimeout(() => el.classList.remove('show'), SPOTLIGHT_MS);
}

const myTurn = () => view && view.phase !== 'end' && view.current === view.seat;

// ---------- 操作 ----------

function legalOf(card) {
    return view.legal?.find(l => l.card === card) ?? null;
}

function selectCard(card) {
    if (!myTurn()) return;
    if (view.phase === 'chancellor') {
        music.play(ui.card === card ? 'cancel' : 'select');
        ui.card = ui.card === card ? null : card;
        render();
        return;
    }
    const legal = legalOf(card);
    if (!legal) {
        music.play('error');
        $('prompt').textContent = '大臣を出さなければなりません';
        return;
    }
    music.play(ui.card === card ? 'cancel' : 'select');
    if (ui.card === card) {
        ui = { ...freshUi(), key: ui.key };
    } else {
        ui = { ...freshUi(), key: ui.key, card };
        // 選べる人が 1 人だけなら、その人を選んでおく
        if (legal.targets.length === 1) ui.target = legal.targets[0];
    }
    render();
    if (legal.needsGuess && ui.target !== null && ui.guess === null) openGuess();
}

function selectTarget(seat) {
    if (!myTurn() || ui.card === null) return;
    const legal = legalOf(ui.card);
    if (!legal?.targets.includes(seat)) return;
    music.play('select');
    ui.target = seat;
    render();
    if (legal.needsGuess && ui.guess === null) openGuess();
}

function openGuess() {
    $('guess-title').textContent = `${nameOf(ui.target)}の手札は？`;
    const target = view.players[ui.target];
    $('guess-list').innerHTML = CARDS.filter(c => c.value !== GUARD).map(c => `
        <button class="guess-item${target.known === c.value ? ' known' : ''}" data-guess="${c.value}">
            ${cardFace(c.value, { size: 'mini' })}<span>${c.name}</span>
        </button>`).join('');
    openDialog('guess-dialog');
}

// おすすめの手を、そのまま選んだ状態にする（「出す」「残す」を押せば打てる）
function showHint() {
    if (!myTurn() || !controller || controller.isOnline) return;
    const command = controller.suggest();
    if (!command) return;
    music.play('select');
    if (command.type === 'keep') ui = { ...freshUi(), key: ui.key, card: command.card };
    else ui = { ...freshUi(), key: ui.key, card: command.card, target: command.target, guess: command.guess };
    hint = { key: ui.key, command };
    render();
}

// 選んでいる手が、ヒントの手と同じか
function hinted() {
    const c = hint?.key === ui.key ? hint.command : null;
    if (!c || ui.card !== c.card) return false;
    return c.type === 'keep' || ((c.target ?? null) === (legalOf(ui.card)?.targets.length ? ui.target : null) && (c.guess ?? null) === (legalOf(ui.card)?.needsGuess && ui.target !== null ? ui.guess : null));
}

function ready() {
    if (!myTurn() || ui.card === null) return false;
    if (view.phase === 'chancellor') return true;
    const legal = legalOf(ui.card);
    if (!legal) return false;
    if (legal.targets.length > 0 && ui.target === null) return false;
    if (legal.needsGuess && legal.targets.length > 0 && ui.guess === null) return false;
    return true;
}

function confirm() {
    if (!ready()) return;
    let command;
    if (view.phase === 'chancellor') {
        const bottom = [...view.hand];
        bottom.splice(bottom.indexOf(ui.card), 1);
        command = { type: 'keep', card: ui.card, bottom };
    } else {
        const legal = legalOf(ui.card);
        const target = legal.targets.length ? ui.target : null;
        command = { type: 'play', card: ui.card, target, guess: legal.needsGuess && target !== null ? ui.guess : null };
    }
    ui = freshUi();
    controller.send(command);
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    const key = `${view.round}:${view.current}:${view.phase}:${view.hand?.length}`;
    if (ui.key !== key) ui = { ...freshUi(), key };
    $('round-info').innerHTML = `ラウンド ${view.round}<small>${view.tokensToWin}つで勝ち</small>`;
    renderOpponents();
    renderTable();
    renderMe();
    renderAction();
}

function renderOpponents() {
    const legal = myTurn() && ui.card !== null ? legalOf(ui.card) : null;
    const order = [];
    for (let i = 1; i < view.players.length; i++) order.push(view.players[(view.seat + i) % view.players.length]);
    $('opponents').dataset.count = order.length;
    $('opponents').innerHTML = order.map(p => {
        const targetable = legal?.targets.includes(p.id);
        const cls = ['opp', p.id === view.current ? 'current' : '', p.out ? 'out' : '', targetable ? 'targetable' : '', ui.target === p.id && legal ? 'chosen' : ''].join(' ');
        const handHtml = p.out ? '<span class="out-label">脱落</span>'
            : p.known !== null ? `<div class="known" title="あなたが知っている手札">${cardFace(p.known, { size: 'mini', extra: 'known-card' })}</div>`
                : cardBack('back-small');
        return `<button class="${cls}" data-seat="${p.id}" ${targetable ? '' : 'tabindex="-1"'}>
            <div class="opp-head"><span class="opp-name">${escapeHtml(p.name)}</span>${p.protected ? '<span class="shield" title="守られている">' + emblemSvg(4, 'shield-icon') + '</span>' : ''}</div>
            ${hearts(p.tokens, view.tokensToWin)}
            <div class="opp-body"><div class="opp-hand">${handHtml}</div><div class="discards">${p.discards.map(v => cardFace(v, { size: 'mini' })).join('')}</div></div>
        </button>`;
    }).join('');
}

function renderTable() {
    const faceUp = view.faceUp.length ? `<span class="face-up">除外 ${view.faceUp.map(v => cardFace(v, { size: 'mini' })).join('')}</span>` : '';
    $('deck-info').innerHTML = `<span class="deck">${cardBack('back-tiny')}<b>${view.deckCount}</b></span>${faceUp}`;
    const lines = view.events.filter(e => e.round === view.round).map(e => describeEvent(e, view)).filter(Boolean);
    $('last-log').innerHTML = lines.slice(-2).map(l => `<div>${escapeHtml(l)}</div>`).join('');
}

function renderMe() {
    const me = view.players[view.seat];
    const exposed = view.exposedTo.length ? `<span class="exposed">${view.exposedTo.map(s => escapeHtml(view.players[s].name)).join('・')}に見られている</span>` : '';
    $('me-info').innerHTML = `<span class="me-name${view.current === view.seat ? ' current' : ''}">あなた</span>${hearts(me.tokens, view.tokensToWin)}
        ${me.protected ? '<span class="shield">' + emblemSvg(4, 'shield-icon') + '</span>' : ''}${exposed}
        <span class="discards">${me.discards.map(v => cardFace(v, { size: 'mini' })).join('')}</span>`;
    const playable = myTurn();
    $('hand').dataset.count = view.hand.length;
    $('hand').innerHTML = me.out ? '<div class="out-big">脱落</div>' : view.hand.map((v, i) => {
        const disabled = playable && view.phase === 'play' && !legalOf(v);
        const cls = ['hand-card', ui.card === v && view.hand.indexOf(v) === i ? 'selected' : '', disabled ? 'disabled' : '', playable ? 'playable' : ''].join(' ');
        return `<button class="${cls}" data-card="${v}" ${playable ? '' : 'tabindex="-1"'}>${cardFace(v)}</button>`;
    }).join('');
}

function renderAction() {
    const prompt = $('prompt');
    const choices = $('choices');
    const button = $('confirm');
    choices.innerHTML = '';
    button.textContent = view.phase === 'chancellor' ? '残す' : '出す';
    button.disabled = !ready();
    $('hint').hidden = Boolean(controller?.isOnline); // ヒントはローカル対戦だけ
    $('hint').disabled = !myTurn();
    button.classList.toggle('suggested', myTurn() && ready() && hinted());
    if (view.phase === 'end') {
        prompt.textContent = `${nameOf(view.winner)}の勝ち`;
        button.textContent = '結果';
        button.disabled = false;
        return;
    }
    if (!myTurn()) {
        prompt.textContent = view.players[view.seat].out ? `脱落。${nameOf(view.current)}の番` : `${nameOf(view.current)}の番`;
        return;
    }
    if (view.phase === 'chancellor') {
        prompt.textContent = ui.card === null ? '残す1枚を選ぶ（ほかは山札の下へ）' : `${cardName(ui.card)}を残す`;
        return;
    }
    if (ui.card === null) {
        prompt.textContent = view.legal.length === 1 && view.hand.length === 2 && view.hand[0] !== view.hand[1] ? '大臣を出さなければならない' : '出すカードを選ぶ';
        return;
    }
    const legal = legalOf(ui.card);
    const card = CARDS[ui.card];
    prompt.textContent = ui.card === PRINCESS ? '姫を出すと脱落します' : `${card.name}：${card.text}`;
    if (legal.targets.length === 0) {
        if (legal.needsTarget) choices.innerHTML = '<span class="note">選べる人がいないので、効果なし</span>';
        return;
    }
    // 選ぶ人（魔術師は自分も）
    choices.innerHTML = legal.targets.map(s => `<button class="chip${ui.target === s ? ' on' : ''}" data-target="${s}">${s === view.seat ? '自分' : escapeHtml(view.players[s].name)}</button>`).join('')
        + (legal.needsGuess && ui.target !== null ? `<button class="chip guess-chip${ui.guess !== null ? ' on' : ''}" data-open-guess>${ui.guess === null ? '言い当てる' : `「${cardName(ui.guess)}」`}</button>` : '');
    if (ui.card === PRINCE && ui.target === view.seat && view.hand.includes(PRINCESS)) prompt.textContent = '姫を捨てることになり、脱落します';
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
            if (dialog.id === 'round-dialog') return; // 結果はボタンで閉じる
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', () => {
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume();
        });
    });
    $('help-content').innerHTML = helpMarkup();
}

function openLog() {
    if (!view) return;
    let lastRound = null;
    const items = [];
    view.events.forEach(e => {
        const text = describeEvent(e, view);
        if (!text) return;
        if (e.round !== lastRound && e.type !== 'round') items.push(`<li class="log-round">ラウンド ${e.round}</li>`);
        lastRound = e.round;
        items.push(`<li class="${e.type === 'round' ? 'log-round' : ''}${text.includes('（あなただけ）') ? ' secret' : ''}">${escapeHtml(text)}</li>`);
    });
    $('log-list').innerHTML = items.join('');
    openDialog('log-dialog');
    const body = $('log-dialog').querySelector('.dialog-body');
    body.scrollTop = body.scrollHeight;
}

function openCards() {
    if (!view) return;
    const unseen = unseenCounts(view);
    $('cards-table').innerHTML = `<tr><th></th><th></th><th>枚数</th><th>残り</th></tr>` + CARDS.map(c => `
        <tr><td>${cardFace(c.value, { size: 'mini' })}</td><th>${c.name}<div class="cards-text">${c.text}</div></th><td>${c.count}</td><td class="${unseen[c.value] === 0 ? 'zero' : ''}"><b>${unseen[c.value]}</b></td></tr>`).join('');
    openDialog('cards-dialog');
}

function showRoundSoon(event, delay) {
    if (!event) return;
    pendingRound = event;
    cancelRound();
    controller?.pause();
    roundTimer = Motion.afterIdle(showRound, delay);
}

function showRound() {
    const e = pendingRound;
    if (!e || scene !== 'game') return;
    const over = view.phase === 'end';
    const winners = e.winners.map(nameOf).join('と');
    $('round-title').textContent = over ? `${nameOf(view.winner)}の勝ち` : `${winners}がラウンドに勝った`;
    const rows = view.players.map(p => {
        const revealed = e.reveal[p.id];
        const card = revealed !== undefined ? cardFace(revealed, { size: 'mini' }) + `<span>${cardName(revealed)}</span>` : '<span class="muted">脱落</span>';
        const badges = (e.winners.includes(p.id) ? '<b class="badge">勝ち</b>' : '') + (e.spy === p.id ? '<b class="badge spy">スパイ +1</b>' : '');
        return `<div class="round-row${e.winners.includes(p.id) ? ' win' : ''}"><span class="rr-name">${escapeHtml(nameOf(p.id))}</span><span class="rr-card">${card}</span>${badges}${hearts(e.tokens[p.id], view.tokensToWin)}</div>`;
    }).join('');
    const setAside = e.setAside !== null && e.setAside !== undefined ? `<p class="dialog-note">伏せて除外していたカード：${cardName(e.setAside)}</p>` : '';
    $('round-body').innerHTML = rows + setAside;
    $('round-next').parentElement.hidden = over;
    $('round-dialog').querySelector('.end-buttons').hidden = !over;
    openDialog('round-dialog');
}

// ---------- 準備 ----------

function setup() {
    drawTitleArt();
    Motion.mountSpeedSetting($('motion-setting'), { label: '' });
    Motion.mountSpeedSetting($('motion-setting-help'), { label: '動き' });
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
    $('resume').addEventListener('click', () => startGame(store.load(KEYS.save) ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('open-log').addEventListener('click', openLog);
    $('open-cards').addEventListener('click', openCards);
    $('home').addEventListener('click', goHome);
    $('hand').addEventListener('click', e => {
        const b = e.target.closest('[data-card]');
        if (b) selectCard(Number(b.dataset.card));
    });
    $('opponents').addEventListener('click', e => {
        const b = e.target.closest('[data-seat]');
        if (b) selectTarget(Number(b.dataset.seat));
    });
    $('choices').addEventListener('click', e => {
        const t = e.target.closest('[data-target]');
        if (t) selectTarget(Number(t.dataset.target));
        if (e.target.closest('[data-open-guess]')) openGuess();
    });
    $('guess-list').addEventListener('click', e => {
        const b = e.target.closest('[data-guess]');
        if (!b) return;
        music.play('select');
        ui.guess = Number(b.dataset.guess);
        $('guess-dialog').close();
        render();
    });
    $('confirm').addEventListener('click', () => (view?.phase === 'end' ? showRound() : confirm()));
    $('hint').addEventListener('click', showHint);
    $('round-next').addEventListener('click', () => {
        pendingRound = null;
        $('round-dialog').close();
    });
    $('again').addEventListener('click', () => {
        $('round-dialog').close();
        if (controller?.isOnline) online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        else startGame(newSetup());
    });
    $('result-home').addEventListener('click', () => {
        $('round-dialog').close();
        if (controller?.isOnline) online.leave();
        else goHome();
    });

    // ページの拡大を止める
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('input, textarea')) e.preventDefault();
    });

    showScene('title');
    // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
    online.boot();
    registerServiceWorker();
    // 確かめるときに使う
    window.__app = { get controller() { return controller; }, get view() { return view; }, get ui() { return ui; }, online, startGame, selectCard, selectTarget, confirm, setGuess: g => { ui.guess = g; render(); } };
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
