/**
 * 画面の進行：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController, { CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { SPECIES, ZONES, DIE_FACES } from './dinos.js';
import { dieAllows } from './park.js';
import { spritesMarkup, dinoSvg, faceSvg } from './art.js';
import { boardHtml } from './board.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const $ = id => document.getElementById(id);
const KEYS = { settings: 'draftosaurus.settings.v1', save: 'draftosaurus.save.v1' };
const CPU_NAMES = ['ミナ', 'ケン', 'ソラ', 'ハル'];
const RESULT_DELAY_MS = 1100;
const INPUT_LOCK_MS = 450;
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

let settings = { count: 4, level: 'normal', ...store.load(KEYS.settings) };
let scene = 'title';
let controller = null;
let view = null;
let seenSeq = 0;
let ui = { dino: null, zone: null, key: null };
// 演出：さっき置いた場所、各人が最後に置いたもの、手が来た向き
let fx = { just: null, flash: false, handFrom: null, roll: false };
let lastPlaced = {};
let lockUntil = 0;
let resultTimer = null;

const nameOf = seat => (seat === view.seat ? 'あなた' : view.players[seat].name);

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

// タイトルの絵：川をはさんだ公園と、6 種の恐竜
function drawTitleArt() {
    const dinos = ['brachio', 'trex', 'stego', 'tri', 'para', 'spino'];
    const pos = [[14, 30, 62], [76, 52, 50], [140, 60, 46], [196, 40, 56], [40, 74, 40], [176, 78, 42]];
    const art = dinos.map((d, i) => {
        const [x, y, w] = pos[i];
        return `<use href="#dino-${d}" x="${x}" y="${y}" width="${w}" height="${w * 0.75}"/>`;
    }).join('');
    $('title-art').innerHTML = `
        <rect x="2" y="20" width="256" height="96" rx="18" fill="#3f7d45" stroke="#1d3d22" stroke-width="2"/>
        <path d="M2 82h256v16c0 10-8 18-18 18H20c-10 0-18-8-18-18Z" fill="#9cbf55"/>
        <path d="M118 20c10 20-12 40 4 60s-6 26 0 36h22c-6-12 14-18 0-36s6-40-4-60Z" fill="#4c9fd4"/>
        <path d="M124 36c4 3 8 3 12 0M122 62c4 3 8 3 12 0M128 92c4 3 8 3 12 0" fill="none" stroke="#c9e7f7" stroke-width="2" stroke-linecap="round"/>
        <g fill="#2a5f30"><circle cx="30" cy="28" r="12"/><circle cx="46" cy="22" r="10"/><circle cx="222" cy="26" r="12"/><circle cx="238" cy="34" r="9"/></g>
        ${art}`;
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
        console.warn(error);
        store.remove(KEYS.save);
        local = new LocalGameController({ ...newSetup(), cpuDelay: CPU_DELAY }, { onUpdate, onError });
    }
    beginGame(local);
}

// ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(next) {
    if (controller !== next) controller?.stop();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    clearTimeout(resultTimer);
    controller = next;
    view = controller.getView();
    seenSeq = view.eventSeq;
    ui = { dino: null, zone: null, key: null };
    fx = { just: null, flash: false, handFrom: null, roll: true };
    lastPlaced = lastPlacementsOf(view.events);
    showScene('game');
    render();
    if (view.phase === 'end') showResult();
    saveProgress();
}

// 続きから開いたときも、各人が最後に置いたものを出す
function lastPlacementsOf(events) {
    const reveal = [...events].reverse().find(e => e.type === 'reveal');
    return reveal ? Object.fromEntries(reveal.placements.map(p => [p.seat, p])) : {};
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
    title: 'ドラフトザウルス',
    game: 'draftosaurus',
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
    fx = { just: null, flash: false, handFrom: null, roll: false };
    const reveal = [...fresh].reverse().find(e => e.type === 'reveal');
    if (reveal) {
        lastPlaced = Object.fromEntries(reveal.placements.map(p => [p.seat, p]));
        fx.just = { zone: lastPlaced[view.seat].zone };
        fx.flash = true;
        lockUntil = performance.now() + INPUT_LOCK_MS;
    }
    const pass = fresh.find(e => e.type === 'pass');
    if (pass && view.phase !== 'end' && !fresh.some(e => e.type === 'round' && e.round > 1)) fx.handFrom = pass.direction === 'left' ? 'right' : 'left';
    if (fresh.some(e => e.type === 'round' && e.round > 1)) {
        fx.handFrom = 'top';
        showToast(view.discardRule ? `第${view.round}ラウンド` : `第${view.round}ラウンド：${view.direction === 'left' ? '左' : '右'}へ渡す`);
    }
    if (fresh.some(e => e.type === 'roll')) fx.roll = true;
    if (fresh.some(e => e.type === 'end')) {
        clearTimeout(resultTimer);
        resultTimer = setTimeout(showResult, RESULT_DELAY_MS);
    }
    playSounds(fresh);
    saveProgress();
    render();
}

// 効果音：1回の更新に1つだけ鳴らす。終局は1位なら勝ち（同点は知らせ）・それ以外は負け、
// 自分が選び終えたら置く音、新しいラウンドは引く音、ダイスを振ったらさいころの音、公開は知らせ（ほかの人が選び終えたのは鳴らさない）
function playSounds(fresh) {
    const end = fresh.find(e => e.type === 'end');
    if (end) {
        const firsts = end.ranking.filter(r => r.rank === 1);
        if (!firsts.some(r => r.seat === view.seat)) return music.play('lose');
        return music.play(firsts.length > 1 ? 'notify' : 'win');
    }
    if (fresh.some(e => e.type === 'chosen' && e.seat === view.seat)) return music.play('place');
    if (fresh.some(e => e.type === 'round' && e.round > 1)) return music.play('draw');
    if (fresh.some(e => e.type === 'roll')) return music.play('dice');
    if (fresh.some(e => e.type === 'reveal' || e.type === 'discarded')) music.play('notify');
}

function onError(message) {
    music.play('error');
    const prompt = $('action').querySelector('.prompt');
    if (prompt) prompt.textContent = message;
}

const choosing = () => !!view?.handOptions;
const discarding = () => !!view?.discarding;
// 渡す向きの短い表示（2 人のときは交換）
const passText = () => (view.discardRule ? '⇄交換' : `${view.direction === 'left' ? '◀左' : '▶右'}へ渡す`);
const optionOf = dino => view.handOptions?.find(o => o.dino === dino) ?? null;

// ---------- 操作 ----------

function selectDino(dino) {
    if (!(choosing() || discarding()) || performance.now() < lockUntil) return;
    ui.dino = ui.dino === dino ? null : dino;
    music.play(ui.dino ? 'select' : 'cancel');
    ui.zone = null;
    render();
}

function selectZone(zone) {
    if (!choosing() || !ui.dino || performance.now() < lockUntil) return;
    const option = optionOf(ui.dino);
    if (!option?.zones.some(z => z.zone === zone)) return;
    // 同じ場所をもう一度押したら置く
    if (ui.zone === zone) {
        place();
        return;
    }
    music.play('select');
    ui.zone = zone;
    render();
}

function place() {
    if (!ui.dino || !ui.zone) return;
    const command = { type: 'place', dino: ui.dino, zone: ui.zone };
    ui.dino = null;
    ui.zone = null;
    controller.send(command);
}

// 2 人のとき：選んだ恐竜を箱に戻す
function discard() {
    if (!discarding() || !ui.dino) return;
    const command = { type: 'discard', dino: ui.dino };
    ui.dino = null;
    controller.send(command);
}

// ヒント：おすすめの恐竜と場所を選んだ状態にし、決めるボタンに印を付ける
function showHint() {
    if (!controller || !view) return;
    const command = controller.hint();
    if (!command) return showToast('選ぶ番になったら、おすすめを出せます');
    ui.dino = command.dino;
    ui.zone = command.type === 'place' ? command.zone : null;
    ui.hint = `${ui.dino}:${ui.zone}`;
    render();
    showToast(command.type === 'place' ? `おすすめ：${SPECIES[command.dino].short}を${ZONES[command.zone].name}へ` : `おすすめ：${SPECIES[command.dino].short}を箱に戻す`);
}

// できることが 1 つだけなら選んでおく（最後の 1 匹）
function autoSelect() {
    if (!choosing() || ui.dino) return;
    const kinds = view.handOptions;
    if (kinds.length === 1) ui.dino = kinds[0].dino;
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    $('hint').hidden = Boolean(controller?.isOnline); // ヒントはローカル対戦だけ
    const key = `${view.round}:${view.turn}:${view.phase}`;
    if (ui.key !== key) ui = { dino: null, zone: null, key };
    autoSelect();
    renderTop();
    renderRivals();
    renderBoard();
    renderAction();
    markHint();
    renderHand();
    // 演出は 1 回だけ（恐竜を選び直したときの描き直しで、くり返さない）
    fx = { just: null, flash: false, handFrom: null, roll: false };
}

function renderTop() {
    $('turn-info').innerHTML = view.phase === 'end' ? '<b>ゲーム終了</b>'
        : `<b>第${view.round}ラウンド</b><span class="turn-line"><span class="turn-count">${view.turn}/${view.turns}</span><span class="dir">${passText()}</span></span>`;
    const die = $('die');
    $('turn-info').classList.toggle('wide', view.phase === 'end');
    if (view.phase === 'end') {
        die.innerHTML = '';
        die.hidden = true;
        return;
    }
    die.hidden = false;
    // 2 人のときの箱に戻す段階：ダイスは関係ないので薄くし、何をする番かを出す
    if (view.phase === 'discard') {
        die.className = 'die-badge discard';
        die.innerHTML = `<span class="die-face">${faceSvg(view.die, 'die-icon')}</span>
            <span class="die-text"><b>箱に戻す番</b><small>残りは相手と交換</small></span>`;
        return;
    }
    const face = DIE_FACES[view.die];
    const who = view.exempt ? 'あなたが振った' : `${escapeHtml(nameOf(view.roller))}が振った`;
    die.className = `die-badge${view.exempt ? ' exempt' : ''}${fx.roll ? ' rolling' : ''}`;
    die.innerHTML = `<span class="die-face">${faceSvg(view.die, 'die-icon')}</span>
        <span class="die-text"><b>${view.exempt ? '自由に置ける' : face.text}</b><small>${who}</small></span>`;
}

// 全員の欄：自分、そのあと渡す向きの順。最後に置いたものと、選び終えた印
function renderRivals() {
    const n = view.players.length;
    const order = view.players.map((_, i) => (view.seat + i) % n);
    const passTo = view.direction === 'left' ? (view.seat + 1) % n : (view.seat + n - 1) % n;
    $('rivals').innerHTML = order.map(seat => {
        const p = view.players[seat];
        const last = lastPlaced[seat];
        const status = view.phase !== 'choose' && view.phase !== 'discard' ? '' : p.ready ? '<span class="ready" title="選び終えた">✓</span>' : '<span class="thinking" title="選んでいる">…</span>';
        const lastHtml = last ? `<span class="last${fx.flash ? ' flash' : ''}">${dinoSvg(last.dino, 'dino mini')}<span>${ZONES[last.zone].short}</span></span>` : '<span class="last muted">—</span>';
        const tags = [seat === view.roller && view.phase === 'choose' ? `<span class="tag-die" title="ダイスを振った">${faceSvg(view.die, 'tag-icon')}</span>` : '',
            seat === passTo && seat !== view.seat && view.phase !== 'end' && !view.discardRule ? `<span class="tag-pass" title="手を渡す相手">${view.direction === 'left' ? '◀' : '▶'}渡す</span>` : ''].join('');
        return `<button class="rival${seat === view.seat ? ' me' : ''}" data-seat="${seat}">
            <span class="rv-head"><span class="rv-name">${escapeHtml(nameOf(seat))}</span><span class="rv-score">${p.score.total}</span>${status}</span>
            <span class="rv-foot">${lastHtml}${tags}</span>
        </button>`;
    }).join('');
}

function renderBoard() {
    const me = view.players[view.seat];
    const option = ui.dino ? optionOf(ui.dino) : null;
    const legal = option ? new Map(option.zones.map(z => [z.zone, z.gain])) : null;
    // 恐竜を選ぶ前は、ダイスの決まりで置ける囲いをうっすら示す
    const dieZones = choosing() && !view.exempt ? new Set(Object.keys(ZONES).filter(k => k !== 'river' && dieAllows(me.park, k, view.die))) : null;
    $('board').innerHTML = boardHtml(me, {
        interactive: true, legal, dieZones,
        preview: ui.zone ? { zone: ui.zone, dino: ui.dino } : null,
        just: fx.just
    });
}

function renderAction() {
    const el = $('action-main');
    if (view.phase === 'end') {
        el.innerHTML = '<div class="prompt">ゲーム終了</div><button class="primary" data-act="result">結果</button>';
        return;
    }
    if (discarding()) {
        const text = ui.dino ? `${SPECIES[ui.dino].short}を箱に戻す` : '箱に戻す恐竜を選ぶ（残りは相手と交換）';
        el.innerHTML = `<div class="prompt">${text}</div><button class="primary" data-act="discard" ${ui.dino ? '' : 'disabled'}>戻す</button>`;
        return;
    }
    if (!choosing()) {
        const waiting = view.players.filter(p => !p.ready && p.id !== view.seat).map(p => escapeHtml(p.name));
        const c = view.myChoice;
        const mine = !c ? '' : c.type === 'discard' ? `${SPECIES[c.dino].short}を箱へ。` : `${SPECIES[c.dino].short}を${ZONES[c.zone].name}へ。`;
        const label = view.phase === 'discard' ? '戻す' : '置く';
        el.innerHTML = `<div class="prompt">${mine}${waiting.length ? `${waiting.join('・')}を待っています` : ''}</div><button class="primary" disabled>${label}</button>`;
        return;
    }
    let text;
    if (!ui.dino) text = '置く恐竜を選ぶ';
    else if (!ui.zone) text = `${SPECIES[ui.dino].short}を置く場所を選ぶ`;
    else {
        const gain = optionOf(ui.dino).zones.find(z => z.zone === ui.zone).gain;
        text = `${ZONES[ui.zone].name}へ<span class="gain-inline${gain < 0 ? ' minus' : ''}">${gain > 0 ? '+' : ''}${gain}点</span>`;
    }
    el.innerHTML = `<div class="prompt">${text}</div><button class="primary" data-act="place" ${ui.zone ? '' : 'disabled'}>置く</button>`;
}

// ヒントの手を選んでいる間は、決めるボタンに印を付ける（描き直しても消さない）
function markHint() {
    const button = $('action').querySelector('[data-act]');
    if (button && ui.hint && ui.hint === `${ui.dino}:${ui.zone}`) button.classList.add('recommended');
}

function renderHand() {
    const hand = view.hand ?? [];
    const can = choosing() || discarding();
    // 同じ種類が複数あるときは、最初の 1 匹を選んだ印にする
    const firstIndex = ui.dino ? hand.indexOf(ui.dino) : -1;
    const from = fx.handFrom;
    $('hand').innerHTML = hand.map((d, i) => {
        const chosen = view.myChoice && i === hand.indexOf(view.myChoice.dino);
        const cls = ['token', i === firstIndex ? 'selected' : '', chosen ? 'chosen' : '', can ? '' : 'idle', from ? `in-${from}` : ''].filter(Boolean).join(' ');
        return `<button class="${cls}" data-dino="${d}" style="--i:${i}" aria-label="${SPECIES[d].name}">${dinoSvg(d)}</button>`;
    }).join('');
}

// ---------- 知らせ ----------

let toastTimer = null;
function showToast(text) {
    let el = document.querySelector('.toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        $('screen-game').append(el);
    }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
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

const BREAKDOWN = [['forest', '森'], ['meadow', '草原'], ['love', '恋人'], ['trio', '木'], ['king', '王'], ['island', '島'], ['river', '川'], ['trex', 'ティラノ']];

function openPark(seat) {
    if (!view) return;
    const p = view.players[seat];
    $('park-title').textContent = seat === view.seat ? 'あなたの公園' : `${p.name}の公園`;
    const counts = Object.keys(SPECIES).map(s => {
        const k = Object.values(p.park).flat().filter(d => d === s).length;
        return k ? `<span class="count">${dinoSvg(s, 'dino mini')}${k}</span>` : '';
    }).join('');
    $('park-body').innerHTML = `
        <div class="park-stats"><b>${p.score.total}点</b><span class="muted">今の点</span>${counts}</div>
        <div class="board static">${boardHtml(p)}</div>
        <div class="breakdown">${BREAKDOWN.map(([k, l]) => `<span>${l} <b>${p.score[k]}</b></span>`).join('')}</div>`;
    openDialog('park-dialog');
}

function showResult() {
    if (!view?.scores || scene !== 'game') return;
    const winners = view.ranking.filter(r => r.rank === 1).map(r => r.seat);
    $('result-title').textContent = winners.length === 1 && winners[0] === view.seat ? 'あなたの勝ち' : `${winners.map(nameOf).join('と')}の勝ち`;
    // 合計は名前のすぐ右に（狭い画面で、右へはみ出して隠れないように）
    $('result-head').innerHTML = `<th></th><th>合計</th>${BREAKDOWN.map(([, l]) => `<th>${l}</th>`).join('')}`;
    $('result-body').innerHTML = view.ranking.map(r => {
        const s = view.scores[r.seat];
        return `<tr class="${r.seat === view.seat ? 'me' : ''}"><th>${r.rank}. ${escapeHtml(nameOf(r.seat))}</th><td class="total">${s.total}</td>${BREAKDOWN.map(([k]) => `<td>${s[k]}</td>`).join('')}</tr>`;
    }).join('');
    const tied = view.ranking.some((r, i) => i > 0 && r.total === view.ranking[i - 1].total);
    $('result-note').textContent = tied ? '同点は、ティラノサウルスの少ない方が上' : '';
    openDialog('result-dialog');
}

// ---------- 準備 ----------

function setup() {
    $('sprites').innerHTML = spritesMarkup();
    drawTitleArt();
    setupDialogs();
    const segment = (id, apply) => $(id).addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        apply(b.dataset);
        store.save(KEYS.settings, settings);
        renderTitle();
    });
    segment('player-count', d => { settings.count = Number(d.count); });
    segment('cpu-level', d => { settings.level = d.level; });
    $('start').addEventListener('click', () => startGame(newSetup()));
    $('online-button').addEventListener('click', () => online.open());
    $('resume').addEventListener('click', () => startGame(store.load(KEYS.save) ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('hint').addEventListener('click', showHint);
    $('home').addEventListener('click', goHome);
    $('rivals').addEventListener('click', e => {
        const b = e.target.closest('[data-seat]');
        if (b) openPark(Number(b.dataset.seat));
    });
    $('board').addEventListener('click', e => {
        const z = e.target.closest('[data-zone]');
        if (z) selectZone(z.dataset.zone);
    });
    $('hand').addEventListener('click', e => {
        const b = e.target.closest('[data-dino]');
        if (b) selectDino(b.dataset.dino);
    });
    $('action').addEventListener('click', e => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'result') showResult();
        else if (act.dataset.act === 'discard') discard();
        else place();
    });
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

    // ページの拡大を止める
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('input, textarea')) e.preventDefault();
    });

    showScene('title');
    registerServiceWorker();
    // 確かめるときに使う
    window.__app = { get controller() { return controller; }, get view() { return view; }, get ui() { return ui; }, startGame, selectDino, selectZone, place, discard, openPark, showResult, online };
    // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
    online.boot();
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
