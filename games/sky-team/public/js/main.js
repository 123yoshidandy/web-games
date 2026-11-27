/**
 * 画面の進行：タイトル → ゲーム（進入路・操縦席・自分のダイス）→ 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController from './game-controller.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';
import { music } from './music.js';
import { AIRPORTS, AIRPORT_KEYS, SLOTS, SLOT_IDS, REASON_TEXT, ROLE_NAMES, canPlaceWithReserve } from './rules.js';
import { PLAYERS } from './game.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const $ = id => document.getElementById(id);
const KEYS = { settings: 'skyteam.settings', save: 'skyteam.save' };
const CPU_NAMES = ['ソラ', 'ハヤテ'];
// 確かめるときだけ、URL の ?cpuDelay=ミリ秒 で CPU の間隔を縮められる
const CPU_DELAY = Number(new URLSearchParams(location.search).get('cpuDelay')) || undefined;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

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

let settings = { role: 0, airport: 'YUL', level: 'normal', ...store.load(KEYS.settings) };
if (!AIRPORTS[settings.airport]) settings.airport = 'YUL';
let scene = 'title';
let controller = null;
let view = null;
let seenSeq = 0;
let ui = { die: null, delta: 0, hint: null };
let resultShown = false;

const SLOT_LABEL = {
    axis: '軸', engine: 'エンジン', radio: '無線', gear: '着陸装置', flap: 'フラップ', brake: 'ブレーキ', coffee: 'コーヒー'
};
const slotName = id => SLOT_LABEL[SLOTS[id].kind];
const roleOf = seat => ROLE_NAMES[seat];
const nameOf = seat => (seat === view?.seat ? 'あなた' : escapeHtml(view.players[seat].name));
const isMyTurn = () => view && view.phase === 'place' && view.seat !== null && view.turn === view.seat;

// ---------- オンライン対戦（入口とロビーは netplay-lobby.js の画面） ----------

const online = new NetplayLobby({
    title: 'スカイチーム',
    game: 'sky-team',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: 600,
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    settings: [
        { key: 'airport', label: '空港', options: AIRPORT_KEYS.map(key => ({ value: key, label: AIRPORTS[key].name })) },
        { key: 'cpuLevel', label: 'CPU の強さ', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }, { value: 'hard', label: 'つよい' }] }
    ],
    onStart: next => beginGame(next),
    onUpdate: () => onUpdate(),
    onError: message => onError(message),
    onExit: () => {
        controller = null;
        view = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        showScene('title');
    }
});

// ---------- 画面の切り替え ----------

function showScene(name) {
    scene = name;
    $('screen-title').hidden = name !== 'title';
    $('screen-game').hidden = name !== 'game';
    if (name === 'title') renderTitle();
}

function renderTitle() {
    $('airport-select').innerHTML = AIRPORT_KEYS.map(key => `<button type="button" role="radio" data-airport="${key}">${AIRPORTS[key].name}</button>`).join('');
    document.querySelectorAll('#role-select button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.role) === settings.role)));
    document.querySelectorAll('#airport-select button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.airport === settings.airport)));
    document.querySelectorAll('#level-select button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === settings.level)));
    $('resume').hidden = !store.load(KEYS.save);
    $('online-row').hidden = !online.available;
}

// タイトルの絵：雲の上を降りていく飛行機と滑走路
function drawTitleArt() {
    $('title-art').innerHTML = `
        <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f3b66"/><stop offset="1" stop-color="#f0a35e"/></linearGradient></defs>
        <rect width="240" height="120" rx="14" fill="url(#sky)"/>
        <circle cx="190" cy="78" r="16" fill="#ffd27a" opacity=".85"/>
        <g fill="#fff" opacity=".55"><ellipse cx="50" cy="38" rx="26" ry="7"/><ellipse cx="70" cy="33" rx="16" ry="6"/><ellipse cx="170" cy="30" rx="22" ry="6"/></g>
        <path d="M0 102 L240 96 L240 120 L0 120Z" fill="#263247"/>
        <path d="M60 112 L210 100" stroke="#e8edf5" stroke-width="2" stroke-dasharray="10 8"/>
        <g transform="translate(92 52) rotate(12)">${planeSvgPath('#eef3fb', '#3b6fb6')}</g>
        <path d="M70 56 L30 46" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
        <path d="M70 62 L36 56" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".35"/>`;
}

// 横から見た飛行機（右向き。幅 60）
function planeSvgPath(body, accent) {
    return `<path d="M2 14 Q2 9 10 9 L46 9 Q58 9 60 14 Q58 18 46 18 L10 18 Q4 18 2 14Z" fill="${body}"/>
        <path d="M22 13 L36 13 L28 28 L22 28Z" fill="${accent}"/><path d="M4 10 L2 0 L8 0 L14 10Z" fill="${accent}"/>
        <g fill="${accent}" opacity=".8"><circle cx="40" cy="12.5" r="1.3"/><circle cx="44" cy="12.5" r="1.3"/><circle cx="48" cy="12.5" r="1.3"/></g>`;
}

// ---------- ゲームの開始 ----------

function newSetup() {
    const players = [0, 1].map(seat => (seat === settings.role
        ? { name: 'あなた', isCPU: false }
        : { name: CPU_NAMES[seat], isCPU: true }));
    return { players, options: { seed: createSeed(), airport: settings.airport, cpuLevel: settings.level } };
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
    controller = next;
    view = controller.getView();
    seenSeq = view.eventSeq;
    ui = { die: null, delta: 0, hint: null };
    resultShown = false;
    showScene('game');
    render();
    renderLog();
    if (view.phase === 'end') showResult();
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
    showScene('title');
}

// ---------- 更新 ----------

function onUpdate() {
    if (!controller) return;
    const prev = view;
    view = controller.getView();
    const fresh = view.events.filter(e => e.seq > seenSeq);
    seenSeq = view.eventSeq;
    // 回が変わった・ダイスが変わったら、選んでいたダイスを外す
    if (!prev || prev.board.round !== view.board.round || ui.die !== null && view.dice?.[ui.die]?.used) ui = { die: null, delta: 0, hint: null };
    if (fresh.length) ui.hint = null;
    playSound(fresh, prev);
    saveProgress();
    render();
    renderLog();
    flash(fresh);
    if (view.phase === 'end' && !resultShown) setTimeout(showResult, REDUCED_MOTION.matches ? 0 : 900);
}

// 新しい出来事から効果音を1つ鳴らす（1つの操作に1つ。終わりは勝ち負けを2人とも）
function playSound(fresh, prev) {
    if (fresh.length === 0) return;
    const end = fresh.find(e => e.type === 'end');
    if (end) return music.play(end.win ? 'win' : 'lose');
    const mine = fresh.filter(e => (e.type === 'place' || e.type === 'reroll' || e.type === 'discard') && e.seat === view.seat);
    const other = fresh.filter(e => (e.type === 'place' || e.type === 'reroll' || e.type === 'discard') && e.seat !== view.seat);
    if (fresh.some(e => e.type === 'roll') && fresh.some(e => e.type === 'round')) return music.play('dice');
    if (mine.length) {
        const last = mine[mine.length - 1];
        if (last.type === 'reroll') return music.play('dice');
        if (last.type === 'place' && SLOTS[last.slot].kind === 'coffee') return music.play('gain');
        if (last.type === 'place' && last.delta) return music.play('pay');
        return music.play('place');
    }
    if (other.length) return music.play(isMyTurn() && prev?.turn !== view.turn ? 'turn' : 'notify');
}

function onError(message) {
    music.play('error');
    $('prompt').textContent = message;
}

// ---------- 操作 ----------

function selectDie(index) {
    if (!isMyTurn()) return;
    const die = view.dice[index];
    if (!die || die.used) return;
    if (ui.die === index) {
        ui.die = null;
        ui.delta = 0;
        music.play('cancel');
    } else {
        ui.die = index;
        ui.delta = ui.hint?.die === index ? ui.hint.delta ?? 0 : 0;
        music.play('select');
    }
    render();
}

function changeDelta(step) {
    if (ui.die === null) return;
    const value = view.dice[ui.die].value;
    const next = ui.delta + step;
    if (Math.abs(next) > view.board.coffee || value + next < 1 || value + next > 6) {
        music.play('error');
        return;
    }
    ui.delta = next;
    music.play('select');
    render();
}

function placeAt(slot) {
    if (!isMyTurn() || ui.die === null) return;
    if (!slotOpen(slot)) {
        music.play('error');
        return;
    }
    const command = { type: 'place', die: ui.die, slot, delta: ui.delta };
    ui = { die: null, delta: 0, hint: null };
    controller.send(command);
}

function reroll() {
    if (!isMyTurn() || view.board.rerolls <= 0) return;
    const dice = view.dice.map((d, i) => (d.used ? null : i)).filter(i => i !== null);
    // 選んでいるダイスがあればそれだけ、なければ残り全部を振り直す
    controller.send({ type: 'reroll', dice: ui.die !== null ? [ui.die] : dice });
    ui = { die: null, delta: 0, hint: null };
}

function discard() {
    if (!isMyTurn() || ui.die === null) return;
    controller.send({ type: 'discard', die: ui.die });
    ui = { die: null, delta: 0, hint: null };
}

// 選んだダイス（コーヒーで変えた目）を、その置き場に置けるか
function slotOpen(slot) {
    if (ui.die === null || !isMyTurn()) return false;
    const value = view.dice[ui.die].value + ui.delta;
    const left = view.dice.filter(d => !d.used).length;
    return canPlaceWithReserve(view.board, view.seat, slot, value, left);
}

function hasAnyPlacement(index) {
    const c = view.board.coffee;
    const left = view.dice.filter(d => !d.used).length;
    return SLOT_IDS.some(slot => {
        for (let delta = -c; delta <= c; delta++) if (canPlaceWithReserve(view.board, view.seat, slot, view.dice[index].value + delta, left)) return true;
        return false;
    });
}

// ---------- ヒント ----------

// おすすめの手：ダイスを選んだ状態にして、置き場に印を付ける（画面だけ。記録には入れない）
function showHint() {
    if (!isMyTurn() || controller?.isOnline) return;
    const command = controller.hint();
    if (!command) return;
    ui.hint = command;
    if (command.type === 'place') {
        ui.die = command.die;
        ui.delta = command.delta ?? 0;
    } else if (command.type === 'reroll' || command.type === 'discard') ui.die = command.type === 'discard' ? command.die : null;
    music.play('select');
    render();
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    const b = view.board;
    $('round-info').innerHTML = `<b>${b.round}/${b.rounds}回</b><span>高度 ${b.altitude.toLocaleString()}ft</span><span class="airport">${escapeHtml(view.airport.name)}</span>`;
    renderTrack();
    renderCockpit();
    renderPrompt();
    renderTray();
    const local = !controller?.isOnline;
    $('hint').hidden = !local; // ヒントと待ったはローカル対戦だけ
    $('undo').hidden = !local;
    $('hint').disabled = !isMyTurn();
    $('undo').disabled = !local || !controller?.canUndo?.();
}

function renderTrack() {
    const b = view.board;
    const cells = b.planes.map((n, i) => {
        const passed = i < b.pos;
        const here = i === b.pos;
        const airport = i === b.end;
        const planes = Array.from({ length: n }, () => '<span class="traffic" aria-hidden="true"></span>').join('');
        return `<div class="cell${passed ? ' passed' : ''}${here ? ' here' : ''}${airport ? ' airport' : ''}" title="${i}番">
            <span class="cell-no">${airport ? '空港' : i}</span>
            <span class="cell-planes">${planes}</span>
            ${here ? `<svg class="me-plane" viewBox="0 0 62 30" aria-label="自分の飛行機">${planeSvgPath('#eef3fb', '#3b6fb6')}</svg>` : ''}
        </div>`;
    }).join('');
    $('track').innerHTML = `<div class="cells" style="--n:${b.planes.length}">${cells}</div>
        <div class="track-info"><span>残りの飛行機 <b>${b.planesLeft}</b></span><span>空港まで <b>${b.end - b.pos}</b> マス</span></div>`;
}

function dieSvg(value, seat, extra = '') {
    const pips = {
        1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[7, 7], [12, 12], [17, 17]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]],
        5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]], 6: [[7, 6], [17, 6], [7, 12], [17, 12], [7, 18], [17, 18]]
    }[value] ?? [];
    return `<svg class="die die-${seat === 0 ? 'p' : 'c'} ${extra}" viewBox="0 0 24 24" aria-label="${value}"><rect x="1" y="1" width="22" height="22" rx="5"/>${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2"/>`).join('')}</svg>`;
}

// 置き場のボタン。置いたダイス・出した装置・置ける印を描く
function slotHtml(id, label = '') {
    const b = view.board;
    const slot = SLOTS[id];
    const placed = b.slots[id];
    const done = slot.kind === 'gear' ? b.gear[slot.index] : slot.kind === 'flap' ? b.flaps > slot.index : slot.kind === 'brake' ? b.brakes > slot.index : false;
    const open = slotOpen(id);
    const hint = ui.hint?.type === 'place' && ui.hint.slot === id;
    const owner = slot.seat === null ? 'any' : slot.seat === 0 ? 'p' : 'c';
    const cls = ['slot', `own-${owner}`, placed ? 'filled' : '', done && !placed ? 'done' : '', open ? 'open' : '', hint ? 'recommended' : ''].filter(Boolean).join(' ');
    const inner = placed ? dieSvg(placed.value, placed.seat, 'placed') : done ? '<span class="lamp" aria-hidden="true"></span>' : `<span class="need">${label}</span>`;
    const title = `${slotName(id)}${label ? ` ${label}` : ''}${done ? '（出した）' : ''}`;
    return `<button type="button" class="${cls}" data-slot="${id}" aria-label="${title}" title="${title}" ${open ? '' : 'aria-disabled="true"'}>${inner}</button>`;
}

function renderCockpit() {
    const b = view.board;
    const valuesOf = id => (SLOTS[id].values ? SLOTS[id].values.join('-') : '');
    // 軸：-3〜3 の目盛りに、今の傾き
    const axisMarks = [-3, -2, -1, 0, 1, 2, 3].map(v => `<span class="tick${v === b.axis ? ' on' : ''}${Math.abs(v) === 3 ? ' danger' : ''}">${Math.abs(v) === 3 ? '×' : ''}</span>`).join('');
    // 速度：2〜12 の目盛りに、進む数の帯とブレーキの線
    const speedMarks = Array.from({ length: 11 }, (_, i) => i + 2).map(v => {
        const zone = v <= b.blue ? 'z0' : v <= b.orange ? 'z1' : 'z2';
        return `<span class="sp ${zone}${v === b.speed ? ' on' : ''}${v < b.brake ? ' brake' : ''}">${v}</span>`;
    }).join('');
    $('cockpit').innerHTML = `
        <div class="instrument axis-row">
            ${slotHtml('axisP', '機長')}
            <div class="gauge"><span class="g-label">軸 <b>${b.axis > 0 ? `機長側に${b.axis}` : b.axis < 0 ? `副操縦士側に${-b.axis}` : '水平'}</b></span>
                <div class="axis-gauge" style="--tilt:${b.axis * -9}deg"><div class="ticks">${axisMarks}</div><svg class="horizon" viewBox="0 0 80 14" aria-hidden="true"><path d="M2 7h76M34 7l6-5 6 5" /></svg></div></div>
            ${slotHtml('axisC', '副操縦士')}
        </div>
        <div class="instrument engine-row">
            ${slotHtml('engineP', '機長')}
            <div class="gauge"><span class="g-label">速度 <b>${b.speed ?? '—'}</b>${b.advance !== null && !b.final ? `<small>${b.advance}マス進んだ</small>` : ''}</span>
                <div class="speed-gauge">${speedMarks}</div>
                <span class="g-legend"><i class="z0"></i>0 <i class="z1"></i>1 <i class="z2"></i>2マス <i class="brake"></i>ブレーキ ${b.brake || 'なし'}</span></div>
            ${slotHtml('engineC', '副操縦士')}
        </div>
        <div class="columns">
            <div class="col col-p">
                <div class="col-head p">機長</div>
                <div class="group"><span class="g-name">無線</span><div class="slots">${slotHtml('radioP', '')}</div></div>
                <div class="group"><span class="g-name">着陸装置 <small>${b.gearCount}/3</small></span><div class="slots">${['gear1', 'gear2', 'gear3'].map(id => slotHtml(id, valuesOf(id))).join('')}</div></div>
                <div class="group"><span class="g-name">ブレーキ <small>${b.brakes}/3</small></span><div class="slots">${['brake1', 'brake2', 'brake3'].map(id => slotHtml(id, valuesOf(id))).join('')}</div></div>
            </div>
            <div class="col col-c">
                <div class="col-head c">副操縦士</div>
                <div class="group"><span class="g-name">無線</span><div class="slots">${slotHtml('radioC1', '')}${slotHtml('radioC2', '')}</div></div>
                <div class="group"><span class="g-name">フラップ <small>${b.flaps}/4</small></span><div class="slots">${['flap1', 'flap2', 'flap3', 'flap4'].map(id => slotHtml(id, valuesOf(id))).join('')}</div></div>
            </div>
        </div>
        <div class="instrument coffee-row">
            <span class="g-name">コーヒー</span>
            <div class="slots">${['coffee1', 'coffee2', 'coffee3'].map(id => slotHtml(id, '')).join('')}</div>
            <span class="cups" aria-label="コーヒー ${b.coffee}杯">${[0, 1, 2].map(i => `<span class="cup${i < b.coffee ? ' full' : ''}"></span>`).join('')}</span>
            <span class="rerolls" title="振り直しのトークン">振り直し <b>${b.rerolls}</b></span>
        </div>`;
}

function renderPrompt() {
    let text;
    if (view.phase === 'end') text = view.result?.win ? '着陸成功！' : `失敗：${(view.result?.reasons ?? []).map(r => REASON_TEXT[r]).join('・')}`;
    else if (view.seat === null) text = `${escapeHtml(view.players[view.turn].name)}の番`;
    else if (!isMyTurn()) text = `${nameOf(view.turn)}（${roleOf(view.turn)}）が考えています`;
    else if (ui.die === null) text = view.board.final ? '最後の回：水平・速度をブレーキ未満に' : 'ダイスを選んで、光った場所に置く';
    else if (!hasAnyPlacement(ui.die)) text = 'このダイスは置ける場所がありません';
    else text = `${view.dice[ui.die].value + ui.delta} を置く場所を選ぶ`;
    $('prompt').innerHTML = text;
}

function renderTray() {
    const me = view.seat;
    if (me === null) {
        $('tray').innerHTML = '';
        return;
    }
    const partner = 1 - me;
    const mine = view.dice.map((d, i) => {
        if (d.used) return `<span class="die-slot used">${dieSvg(d.value, me, 'ghost')}</span>`;
        const selected = ui.die === i;
        const rec = ui.hint && ui.hint.die === i ? ' recommended' : '';
        return `<button type="button" class="die-button${selected ? ' selected' : ''}${rec}" data-die="${i}" aria-pressed="${selected}" ${isMyTurn() ? '' : 'disabled'}>${dieSvg(d.value + (selected ? ui.delta : 0), me)}${selected && ui.delta ? `<small>${ui.delta > 0 ? '+' : ''}${ui.delta}</small>` : ''}</button>`;
    }).join('');
    const hidden = Array.from({ length: view.players[partner].diceLeft }, () => `<span class="hidden-die ${partner === 0 ? 'p' : 'c'}" aria-hidden="true">?</span>`).join('');
    const coffee = ui.die !== null && view.board.coffee > 0 && isMyTurn();
    const canDiscard = ui.die !== null && isMyTurn() && !hasAnyPlacement(ui.die);
    const canReroll = isMyTurn() && view.board.rerolls > 0;
    $('tray').innerHTML = `
        <div class="tray-mine"><span class="tray-label ${me === 0 ? 'p' : 'c'}">${roleOf(me)}</span><div class="dice">${mine}</div></div>
        <div class="tray-actions">
            ${coffee ? '<button type="button" class="chip" data-delta="-1" aria-label="コーヒーで目を1下げる">−</button><button type="button" class="chip" data-delta="1" aria-label="コーヒーで目を1上げる">＋</button>' : ''}
            ${canReroll ? `<button type="button" class="chip${ui.hint?.type === 'reroll' ? ' recommended' : ''}" data-act="reroll">${ui.die !== null ? 'これを振り直す' : '振り直す'}</button>` : ''}
            ${canDiscard ? `<button type="button" class="chip${ui.hint?.type === 'discard' ? ' recommended' : ''}" data-act="discard">外す</button>` : ''}
        </div>
        <div class="tray-partner"><span class="tray-label ${partner === 0 ? 'p' : 'c'}">${escapeHtml(view.players[partner].name)}</span><div class="dice">${hidden || '<span class="muted">置き終えた</span>'}</div></div>`;
}

// 置かれた置き場を少し光らせる（動きを減らす設定では光らせない）
function flash(fresh) {
    if (REDUCED_MOTION.matches) return;
    fresh.filter(e => e.type === 'place').forEach(e => document.querySelector(`[data-slot="${e.slot}"]`)?.classList.add('just'));
}

// ---------- 履歴 ----------

function eventText(e) {
    const who = seat => `${nameOf(seat)}（${roleOf(seat)}）`;
    switch (e.type) {
    case 'start': return `${escapeHtml(AIRPORTS[e.airport].name)}空港へ進入開始`;
    case 'roll': return `<b>${e.round}回目</b>：2人ともダイスを振った`;
    case 'place': return `${who(e.seat)}：${slotName(e.slot)}に ${e.value}${e.delta ? `（コーヒー${Math.abs(e.delta)}杯で${e.delta > 0 ? '+' : ''}${e.delta}）` : ''}`;
    case 'axis': return `軸の傾き ${e.axis > 0 ? `機長側に${e.axis}` : e.axis < 0 ? `副操縦士側に${-e.axis}` : '水平'}`;
    case 'engine': return e.final ? `最後の速度 ${e.speed}` : `速度 ${e.speed}：${e.advance}マス進んだ`;
    case 'radio': return e.cleared ? `無線で ${e.target}番のマスの飛行機を誘導した` : '無線：誘導する飛行機がいなかった';
    case 'switch': return e.kind === 'gear' ? `着陸装置を出した（青 ${e.blue}）` : e.kind === 'flap' ? `フラップを出した（橙 ${e.orange}）` : `ブレーキを出した（ブレーキ ${e.brake}）`;
    case 'coffee': return e.gained ? `コーヒーが ${e.coffee}杯に` : 'コーヒーはもう満杯';
    case 'reroll': return `${who(e.seat)}：${e.count}個を振り直した`;
    case 'discard': return `${who(e.seat)}：置けないダイス（${e.value}）を外した`;
    case 'rerollToken': return '振り直しのトークンを得た';
    case 'round': return `高度 ${e.altitude.toLocaleString()}ft へ`;
    case 'end': return e.win ? '<b>着陸成功！</b>' : `<b>失敗</b>：${e.reasons.map(r => REASON_TEXT[r]).join('・')}`;
    default: return '';
    }
}

function renderLog() {
    if (!view) return;
    $('log').innerHTML = view.events.map(eventText).filter(Boolean).reverse().map(t => `<li>${t}</li>`).join('');
}

// ---------- ダイアログ ----------

function openDialog(id) {
    const dialog = $(id);
    if (dialog.open) return;
    controller?.pause?.();
    dialog.showModal();
}

function setupDialogs() {
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', e => {
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', () => {
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume?.();
        });
    });
    $('help').innerHTML = helpMarkup();
}

function showResult() {
    if (!view || view.phase !== 'end' || scene !== 'game') return;
    resultShown = true;
    const win = view.result?.win;
    $('result-title').textContent = win ? '着陸成功！' : '着陸失敗';
    $('result-art').innerHTML = `<svg viewBox="0 0 120 40"><path d="M0 34 L120 30 L120 40 L0 40Z" fill="#263247"/><g transform="translate(30 ${win ? 14 : 6}) rotate(${win ? 0 : 18})">${planeSvgPath('#eef3fb', win ? '#3b6fb6' : '#b8462e')}</g></svg>`;
    const b = view.board;
    const rows = win
        ? [`${escapeHtml(view.airport.name)}に無事着陸しました`, `最後の速度 ${b.speed}（ブレーキ ${b.brake}）`, `残ったコーヒー ${b.coffee}杯`]
        : view.result.reasons.map(r => REASON_TEXT[r]).concat(`${b.round}回目・高度 ${b.altitude.toLocaleString()}ft`);
    $('result-body').innerHTML = rows.map(t => `<li>${t}</li>`).join('');
    openDialog('result-dialog');
}

// ---------- 準備 ----------

function setup() {
    drawTitleArt();
    setupDialogs();
    const segment = (id, apply) => $(id).addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        apply(b.dataset);
        music.play('select');
        store.save(KEYS.settings, settings);
        renderTitle();
    });
    segment('role-select', d => { settings.role = Number(d.role); });
    segment('airport-select', d => { settings.airport = d.airport; });
    segment('level-select', d => { settings.level = d.level; });
    $('start').addEventListener('click', () => startGame(newSetup()));
    $('resume').addEventListener('click', () => startGame(store.load(KEYS.save) ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help-game').addEventListener('click', () => openDialog('help-dialog'));
    $('open-log').addEventListener('click', () => openDialog('log-dialog'));
    $('hint').addEventListener('click', showHint);
    $('undo').addEventListener('click', () => {
        if (controller?.undo?.()) music.play('cancel');
    });
    $('home').addEventListener('click', goHome);
    $('cockpit').addEventListener('click', e => {
        const b = e.target.closest('[data-slot]');
        if (b) placeAt(b.dataset.slot);
    });
    $('tray').addEventListener('click', e => {
        const die = e.target.closest('[data-die]');
        if (die) return selectDie(Number(die.dataset.die));
        const delta = e.target.closest('[data-delta]');
        if (delta) return changeDelta(Number(delta.dataset.delta));
        const act = e.target.closest('[data-act]');
        if (act?.dataset.act === 'reroll') reroll();
        if (act?.dataset.act === 'discard') discard();
    });
    $('again').addEventListener('click', () => {
        $('result-dialog').close();
        if (controller?.isOnline) online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        else startGame(newSetup());
    });
    $('result-home').addEventListener('click', () => {
        $('result-dialog').close();
        if (controller?.isOnline) online.leave();
        else goHome();
    });
    $('online').addEventListener('click', () => online.open());

    // ページの拡大を止める
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('input, textarea')) e.preventDefault();
    });

    showScene('title');
    registerServiceWorker();
    // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
    online.boot();
    // 確かめるときに使う
    window.__app = { get controller() { return controller; }, get view() { return view; }, get ui() { return ui; }, online, startGame, newSetup, selectDie, placeAt, showResult };
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
