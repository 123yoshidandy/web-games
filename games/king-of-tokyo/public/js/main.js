/**
 * 画面の進行：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController from './game-controller.js';
import { cardOf, keyOf, FACES, FACE_NAMES, MONSTERS } from './cards.js';
import { monsterSvg, monsterOf, dieSvg, icon, describeEvent } from './art.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';

const $ = id => document.getElementById(id);
const KEYS = { settings: 'kingoftokyo.settings.v1', save: 'kingoftokyo.save.v1' };
const CPU_NAMES = ['ジャン', 'マリー', 'ピエール', 'ソフィ', 'ルイ'];
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
let ui = freshUi();
let resultShown = false;

// ヒント：おすすめの手 { key, command }（その場面の間だけ）
let hint = null;
const HINT_BUTTON = '<button type="button" id="hint" class="chip hint-button" data-act="hint" aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>ヒント</button>';
const hintKey = () => `${view.turnNo}:${view.decision?.kind}:${view.events.at(-1)?.seq ?? 0}`;

// おすすめの手を、選んだ状態にして光らせる（残すダイス・買うカード・ダイアログの答え）
function showHint() {
    if (!mine() || !controller) return;
    const c = controller.suggest();
    if (!c) return;
    hint = { key: hintKey(), command: c };
    if (c.type === 'reroll') ui.kept = new Set(view.dice.map((_, i) => i).filter(i => !c.dice.includes(i)));
    if (c.type === 'buy') ui.card = c.card;
    if (c.type === 'resolve' || c.type === 'endBuy' || c.type === 'sweep') ui.card = null;
    render();
}

function renderHint() {
    const c = hint?.key === hintKey() && mine() ? hint.command : null;
    if (!c) {
        hint = null;
        return;
    }
    const d = view.decision;
    const target = {
        reroll: '#actions [data-act="reroll"]', resolve: '#actions [data-act="resolve"]', change: `#actions [data-change="${c.card}"]`,
        buy: '#actions [data-act="buy"]', sweep: '#actions [data-act="sweep"]', endBuy: '#actions [data-act="endBuy"]',
        buyTop: '#actions [data-act="otherBuys"]', buyFrom: '#actions [data-act="otherBuys"]',
        yield: `[data-answer="${c.yes ? 'yield' : 'stay'}"]`, wings: `[data-answer="${c.yes ? 'yes' : 'no'}"]`,
        probe: c.index === null || c.index === undefined ? '[data-answer="noProbe"]' : `[data-probe="${c.index}"]`,
        opportunist: c.card ? `#decide-body .pick[data-card="${c.card}"]` : '[data-answer="noBuy"]',
        mimic: c.target ? `[data-mimic="${d.targets.findIndex(t => t.seat === c.target.seat && t.card === c.target.card)}"]` : '[data-answer="noMimic"]',
        metamorph: '[data-answer="metamorph"]', healingRay: '[data-answer="ray"]'
    }[c.type];
    if (target) document.querySelector(target)?.classList.add('suggested');
    if (c.type === 'buy') $('market').querySelector(`[data-card="${c.card}"]`)?.classList.add('suggested');
}

function freshUi() {
    return { key: null, kept: new Set(), card: null, change: null };
}

const nameOf = seat => (seat === view.seat ? 'あなた' : view.players[seat].name);
const mine = kind => view?.decision && view.decision.seat === view.seat && (!kind || view.decision.kind === kind);

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

function drawTitleArt() {
    const skyline = '<svg class="skyline" viewBox="0 0 232 70" aria-hidden="true"><path d="M0 70V40h20V25h18v20h14V10h22v35h12V30h20v40h10V20h16v25h14V35h18v35h10V15h24v30h14V28h20v42z" fill="#2a2466"/><g fill="#f7dc6f" opacity=".7"><rect x="58" y="16" width="4" height="5"/><rect x="66" y="26" width="4" height="5"/><rect x="152" y="30" width="4" height="5"/><rect x="236" y="22" width="4" height="5"/><rect x="246" y="34" width="4" height="5"/></g></svg>';
    $('title-art').innerHTML = `<div class="title-monsters">${MONSTERS.map(m => monsterSvg(m.key, 52)).join('')}</div>${skyline}`;
}

// ---------- ゲームの開始 ----------

function newSetup() {
    const players = [{ name: 'あなた', isCPU: false }];
    for (let i = 1; i < settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, options: { seed: createSeed() }, level: settings.level };
}

function startGame(setup) {
    controller?.stop();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    resultShown = false;
    try {
        controller = new LocalGameController({ ...setup, cpuDelay: CPU_DELAY }, { onUpdate, onError });
    } catch (error) {
        console.warn(error);
        store.remove(KEYS.save);
        controller = new LocalGameController({ ...newSetup(), cpuDelay: CPU_DELAY }, { onUpdate, onError });
    }
    view = controller.getView();
    ui = freshUi();
    showScene('game');
    render();
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
    showScene('title');
}

// ---------- 更新 ----------

function onUpdate() {
    if (!controller) return;
    view = controller.getView();
    saveProgress();
    render();
}

function onError(message) {
    $('feed').innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function send(command) {
    if (!controller) return;
    controller.send(command);
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    const key = `${view.turnNo}`;
    if (ui.key !== key) ui = { ...freshUi(), key };
    // 振り直しのあとは、残していないダイスの印を外す（残したダイスはそのまま）
    renderStatus();
    renderMonsters();
    renderMarket();
    renderTable();
    renderMyCards();
    renderDecision();
    renderHint();
    if (view.phase === 'end' && !resultShown) {
        resultShown = true;
        setTimeout(showResult, 900);
    }
}

function renderStatus() {
    const d = view.decision;
    let text;
    if (view.phase === 'end') text = view.winner === null ? '全員の体力が0' : `${nameOf(view.winner)}の勝ち`;
    else if (!d) text = '';
    else if (d.seat === view.seat && view.current === view.seat) text = { roll: 'あなたの番：ダイス', buy: 'あなたの番：カードを買う' }[d.kind] ?? 'あなたの番';
    else if (d.seat === view.seat) text = 'あなたが決める番';
    else text = `${nameOf(view.current)}の番`;
    $('status').textContent = text;
}

function renderMonsters() {
    $('monsters').dataset.count = view.players.length;
    $('monsters').innerHTML = view.players.map(p => {
        const where = view.tokyo.city === p.id ? '<span class="tokyo-badge">東京</span>' : view.tokyo.bay === p.id ? '<span class="tokyo-badge bay">湾</span>' : '';
        const tokens = [p.poison ? `<span class="tok">毒${p.poison}</span>` : '', p.shrink ? `<span class="tok">縮${p.shrink}</span>` : ''].join('');
        const cls = ['mon', p.id === view.current ? 'current' : '', p.id === view.seat ? 'me' : '', p.alive ? '' : 'dead', p.inTokyo ? 'in-tokyo' : ''].join(' ');
        return `<button class="${cls}" data-seat="${p.id}" style="--c:${monsterOf(p.monster).color}">
            <span class="mon-face">${monsterSvg(p.monster, 34)}${where}</span>
            <span class="mon-info">
                <span class="mon-name">${escapeHtml(p.id === view.seat ? 'あなた' : p.name)}</span>
                <span class="mon-stats"><span>${icon.vp}${p.vp}</span><span>${icon.hp}${p.alive ? p.health : 0}</span><span>${icon.energy}${p.energy}</span></span>
                <span class="mon-extra">${p.cards.length ? `<span class="tok cards">カード${p.cards.length}</span>` : ''}${tokens}${p.alive ? '' : '<span class="tok">退場</span>'}</span>
            </span>
        </button>`;
    }).join('');
}

function cardHtml(id, { cost, selected, disabled, cls = '' } = {}) {
    const c = cardOf(id);
    return `<button class="pcard ${c.kind} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${cls}" data-card="${id}">
        <span class="pc-head"><span class="pc-cost">${icon.energy}${cost ?? c.cost}</span><span class="pc-kind">${c.kind === 'keep' ? '持続' : '使い捨て'}</span></span>
        <span class="pc-name">${c.name}</span>
        <span class="pc-text">${c.text}</span>
    </button>`;
}

function renderMarket() {
    const buying = mine('buy');
    const energy = view.players[view.seat].energy;
    $('market').innerHTML = view.market.map(id => {
        const cost = buying ? view.options.costs[id] : cardOf(id).cost;
        return cardHtml(id, { cost, selected: ui.card === id, disabled: buying && cost > energy });
    }).join('') + `<div class="deck-count" title="山札">${view.deckCount}</div>`;
}

function renderTokyo() {
    const slot = (label, seat) => `<div class="tz-slot ${seat === null ? 'empty' : ''}">
        <span class="tz-label">${label}</span>
        ${seat === null ? '<span class="tz-empty">空き</span>' : `${monsterSvg(view.players[seat].monster, 46)}<span class="tz-name">${escapeHtml(nameOf(seat))}</span>`}
    </div>`;
    $('tokyo').innerHTML = slot('東京', view.tokyo.city ?? null) + (view.bayInUse ? slot('東京湾', view.tokyo.bay ?? null) : '');
}

function renderTable() {
    renderTokyo();
    const rolling = mine('roll');
    const dice = view.dice;
    $('dice').innerHTML = dice.map((f, i) => {
        const kept = rolling && ui.kept.has(i);
        const picking = rolling && ui.change && ui.change.index === null;
        const chosen = rolling && ui.change && ui.change.index === i;
        return `<button class="die-btn ${kept ? 'kept' : ''} ${picking ? 'picking' : ''} ${chosen ? 'chosen' : ''}" data-die="${i}" ${rolling ? '' : 'tabindex="-1"'} aria-label="${FACE_NAMES[f]}${kept ? '（残す）' : ''}">${dieSvg(f, 42)}</button>`;
    }).join('') || '<span class="muted">ダイスなし</span>';
    // 最近の出来事（2 行）
    const lines = view.events.filter(e => e.turn === view.turnNo || e.turn === view.turnNo - 1).map(e => describeEvent(e, view)).filter(Boolean);
    $('feed').innerHTML = lines.slice(-4).map(l => `<div>${escapeHtml(l)}</div>`).join('');
    renderActions();
    // 欄に収まらない古い行は消す（半分だけ見える行を残さない）
    const feed = $('feed');
    const linesHeight = () => [...feed.children].reduce((sum, el) => sum + el.offsetHeight, 0);
    while (feed.firstChild && linesHeight() > feed.clientHeight + 1) feed.firstChild.remove();
}

function renderActions() {
    const el = $('actions');
    const me = view.players[view.seat];
    if (view.phase === 'end') {
        el.innerHTML = '<button class="primary" data-act="result">結果</button>';
        return;
    }
    if (mine('roll')) {
        const o = view.options;
        if (ui.change) {
            const faces = ui.change.card === 'herdCuller' ? ['1'] : FACES;
            el.innerHTML = ui.change.index === null
                ? '<div class="hint">変えるダイスを押す</div><button class="secondary" data-act="cancelChange">やめる</button>'
                : `<div class="face-pick">${faces.map(f => `<button class="face-btn" data-face="${f}">${dieSvg(f, 34)}</button>`).join('')}</div><button class="secondary" data-act="cancelChange">やめる</button>`;
            return;
        }
        const rerollable = dice => dice.some((_, i) => !ui.kept.has(i));
        const left = view.rerollsLeft;
        const extra = left === 0 ? (me.smoke > 0 ? '煙幕' : o.energyDrink && me.energy >= 1 ? '1⚡' : o.dweller ? '3だけ' : '') : `あと${left}回`;
        const changeCards = [o.herdCuller && ['herdCuller', '間引き'], o.plotTwist && ['plotTwist', 'どんでん返し'], o.stretchy && ['stretchy', '伸縮（2⚡）']].filter(Boolean);
        el.innerHTML = `
            ${changeCards.length ? `<div class="change-row">${changeCards.map(([k, l]) => `<button class="chip" data-change="${k}">${l}</button>`).join('')}</div>` : ''}
            <div class="btn-row">
                ${HINT_BUTTON}
                <button class="secondary" data-act="reroll" ${o.canReroll || o.dweller ? '' : 'disabled'} ${rerollable(view.dice) ? '' : 'disabled'}>振り直す<small>${extra}</small></button>
                <button class="primary" data-act="resolve">決定</button>
            </div>`;
        return;
    }
    if (mine('buy')) {
        const o = view.options;
        const sel = ui.card ? `<div class="sel">${escapeHtml(cardOf(ui.card).name)}：${escapeHtml(cardOf(ui.card).text)}</div>` : '<div class="hint">買うカードを選ぶ</div>';
        const others = (o.fromOthers?.length || o.top) ? '<button class="chip" data-act="otherBuys">ほかの買い方</button>' : '';
        const canBuy = ui.card && view.market.includes(ui.card) && o.costs[ui.card] <= me.energy;
        el.innerHTML = `${sel}<div class="btn-row">
            ${HINT_BUTTON}
            <button class="primary" data-act="buy" ${canBuy ? '' : 'disabled'}>買う</button>
            <button class="secondary" data-act="sweep" ${o.canSweep ? '' : 'disabled'}>流す<small>2⚡</small></button>
            <button class="tertiary" data-act="endBuy">終える</button>
        </div>${others}`;
        return;
    }
    const d = view.decision;
    const who = d ? nameOf(d.seat) : '';
    const doing = d ? { roll: 'ダイスを振っています', buy: 'カードを選んでいます', yield: '東京を明け渡すか考えています', wings: '翼を使うか考えています', psychicProbe: '念力探査を使うか考えています', opportunist: 'カードを買うか考えています', mimic: 'ものまねを選んでいます', metamorph: '変態を使うか考えています', healingRay: '癒しの光線を使っています' }[d.kind] : '';
    const rapid = me.alive && me.cards.some(id => keyOf(id) === 'rapidHealing') && me.energy >= 2 && me.health < me.maxHealth ? '<button class="chip" data-act="rapidHeal">急速回復（2⚡で+1体力）</button>' : '';
    el.innerHTML = `<div class="hint">${escapeHtml(who)}が${doing}</div>${rapid}`;
}

function renderMyCards() {
    const me = view.players[view.seat];
    const rapid = mine() && me.alive && me.cards.some(id => keyOf(id) === 'rapidHealing') && me.energy >= 2 && me.health < me.maxHealth;
    $('my-cards').innerHTML = (rapid ? '<button class="chip" data-act="rapidHeal">急速回復（2⚡で+1体力）</button>' : '')
        + (me.cards.length ? me.cards.map(id => `<button class="card-chip ${cardOf(id).kind}" data-mycard="${id}">${cardOf(id).name}${keyOf(id) === 'smokeCloud' ? `（煙${me.smoke}）` : keyOf(id) === 'batteryMonster' ? `（${me.battery}⚡）` : keyOf(id) === 'mimic' && me.mimic ? `→${cardOf(me.mimic.card).name}` : ''}</button>`).join('') : '<span class="muted">カードなし</span>');
}

// ---------- 判断のダイアログ ----------

function renderDecision() {
    const dialog = $('decide-dialog');
    const d = view.decision;
    const show = d && d.seat === view.seat && !['roll', 'buy'].includes(d.kind) && view.phase !== 'end';
    if (!show) {
        if (dialog.open) dialog.close();
        return;
    }
    const me = view.players[view.seat];
    let title = '';
    let body = '';
    switch (d.kind) {
        case 'yield':
            title = view.tokyo.bay === view.seat ? '東京湾を明け渡す？' : '東京を明け渡す？';
            body = `<p>${escapeHtml(nameOf(d.attacker))}の攻撃 ${d.damage}。体力 ${me.health} → ${Math.max(0, me.health - d.damage)}</p>
                <div class="big-choices"><button class="secondary big" data-answer="stay">残る</button><button class="primary big" data-answer="yield">明け渡す</button></div>`;
            break;
        case 'wings':
            title = '翼を使う？';
            body = `<p>2エネルギーで、この番は体力を失いません（攻撃 ${d.damage}）。</p>
                <div class="big-choices"><button class="secondary big" data-answer="no">使わない</button><button class="primary big" data-answer="yes">使う</button></div>`;
            break;
        case 'psychicProbe':
            title = '念力探査';
            body = `<p>${escapeHtml(nameOf(view.current))}のダイスを1つ振り直させられます（ハートが出たらカードを捨てる）。</p>
                <div class="probe-dice">${view.dice.map((f, i) => `<button class="die-btn" data-probe="${i}">${dieSvg(f, 40)}</button>`).join('')}</div>
                <button class="secondary wide" data-answer="noProbe">使わない</button>`;
            break;
        case 'opportunist':
            title = '機会主義：すぐ買う？';
            body = `<div class="card-list">${d.cards.map(id => cardHtml(id, { cls: 'pick' })).join('')}</div><button class="secondary wide" data-answer="noBuy">買わない</button>`;
            break;
        case 'mimic':
            title = d.move ? 'ものまねを選び直す？（1エネルギー）' : 'ものまねするカード';
            body = `<div class="target-list">${d.targets.map((t, i) => `<button class="chip target" data-mimic="${i}">${escapeHtml(nameOf(t.seat))}：${cardOf(t.card).name}<small>${cardOf(t.card).text}</small></button>`).join('')}</div>
                <button class="secondary wide" data-answer="noMimic">${d.move ? '選び直さない' : '選ばない'}</button>`;
            break;
        case 'metamorph':
            title = '変態：カードを捨ててエネルギーにする？';
            body = `<div class="target-list">${me.cards.map(id => `<label class="check"><input type="checkbox" data-meta="${id}"> ${cardOf(id).name}（${cardOf(id).cost}⚡）</label>`).join('')}</div>
                <button class="primary wide" data-answer="metamorph">決める</button>`;
            break;
        case 'healingRay': {
            title = '癒しの光線';
            body = `<p>ハート ${d.hearts} つを、ほかのモンスターの回復に使えます（相手は1体力につき2エネルギーを払う）。残りは自分の回復に使います。</p>
                <div class="target-list">${d.targets.map(t => `<div class="stepper" data-ray="${t}" data-value="0"><span>${escapeHtml(nameOf(t))}<small>（${view.players[t].energy}⚡・体力${view.players[t].health}）</small></span><button class="step" data-step="-1" aria-label="減らす">−</button><b>0</b><button class="step" data-step="1" aria-label="増やす">＋</button></div>`).join('')}</div>
                <button class="primary wide" data-answer="ray">決める</button>`;
            break;
        }
        default:
            break;
    }
    $('decide-title').textContent = title;
    $('decide-body').innerHTML = `${body}<div class="hint-row">${HINT_BUTTON}</div>`;
    if (!dialog.open) {
        controller?.pause();
        dialog.showModal();
    }
}

function answerDecision(target) {
    const d = view.decision;
    if (!d || d.seat !== view.seat) return;
    const a = target.dataset.answer;
    let command = null;
    if (target.dataset.probe !== undefined) command = { type: 'probe', index: Number(target.dataset.probe) };
    else if (target.dataset.mimic !== undefined) command = { type: 'mimic', target: d.targets[Number(target.dataset.mimic)] };
    else if (target.dataset.card && d.kind === 'opportunist') command = { type: 'opportunist', card: target.dataset.card };
    else if (a === 'stay' || a === 'yield') command = { type: 'yield', yes: a === 'yield' };
    else if (a === 'yes' || a === 'no') command = { type: 'wings', yes: a === 'yes' };
    else if (a === 'noProbe') command = { type: 'probe', index: null };
    else if (a === 'noBuy') command = { type: 'opportunist', card: null };
    else if (a === 'noMimic') command = { type: 'mimic', target: null };
    else if (a === 'metamorph') command = { type: 'metamorph', cards: [...document.querySelectorAll('[data-meta]:checked')].map(x => x.dataset.meta) };
    else if (a === 'ray') {
        const give = {};
        document.querySelectorAll('[data-ray]').forEach(x => { const k = Number(x.dataset.value) || 0; if (k > 0) give[x.dataset.ray] = k; });
        command = { type: 'healingRay', give };
    }
    if (!command) return;
    $('decide-dialog').close();
    send(command);
}

// ---------- ほかのダイアログ ----------

function openDialog(id) {
    const dialog = $(id);
    if (dialog.open) return;
    controller?.pause();
    dialog.showModal();
}

function setupDialogs() {
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', e => {
            if (dialog.id === 'decide-dialog') return; // 判断は答えで閉じる
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('cancel', e => { if (dialog.id === 'decide-dialog') e.preventDefault(); });
        dialog.addEventListener('close', () => {
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume();
        });
    });
    $('help-content').innerHTML = helpMarkup();
}

function showInfo(title, html) {
    $('info-title').textContent = title;
    $('info-body').innerHTML = html;
    openDialog('info-dialog');
}

function showMonster(seat) {
    const p = view.players[seat];
    const cards = p.cards.map(id => `<div class="info-card"><b>${cardOf(id).name}</b>（${cardOf(id).cost}⚡・${cardOf(id).kind === 'keep' ? '持続' : '使い捨て'}）<div>${cardOf(id).text}</div></div>`).join('') || '<p class="muted">カードなし</p>';
    showInfo(`${nameOf(seat)}（${monsterOf(p.monster).name}）`, `<p class="info-stats">${icon.vp}${p.vp}　${icon.hp}${p.health}/${p.maxHealth}　${icon.energy}${p.energy}${p.poison ? `　毒${p.poison}` : ''}${p.shrink ? `　縮小${p.shrink}` : ''}</p>${cards}`);
}

function openOtherBuys() {
    const o = view.options;
    const list = [];
    if (o.top) list.push(`<div class="info-card"><b>山札の一番上：${cardOf(o.top.card).name}</b>（${o.top.cost}⚡）<div>${cardOf(o.top.card).text}</div><button class="primary" data-other="top">買う</button></div>`);
    o.fromOthers.forEach((f, i) => list.push(`<div class="info-card"><b>${escapeHtml(nameOf(f.seat))}の${cardOf(f.card).name}</b>（${f.cost}⚡を持ち主に払う）<div>${cardOf(f.card).text}</div><button class="primary" data-other="${i}">買う</button></div>`));
    showInfo('ほかの買い方', list.join(''));
}

function openLog() {
    const lines = view.events.map(e => describeEvent(e, view)).filter(Boolean);
    $('log-list').innerHTML = lines.map(l => `<li>${escapeHtml(l)}</li>`).join('');
    openDialog('log-dialog');
    const body = $('log-dialog').querySelector('.dialog-body');
    body.scrollTop = body.scrollHeight;
}

function showResult() {
    if (!view || view.phase !== 'end' || scene !== 'game') return;
    $('result-title').textContent = view.winner === null ? '全員の体力が0になった' : view.winner === view.seat ? 'あなたの勝ち' : `${nameOf(view.winner)}の勝ち`;
    const ranked = [...view.players].sort((a, b) => (b.id === view.winner) - (a.id === view.winner) || b.alive - a.alive || b.vp - a.vp);
    $('result-body').innerHTML = ranked.map(p => `<div class="result-row${p.id === view.seat ? ' me' : ''}">${monsterSvg(p.monster, 30)}<span class="rr-name">${escapeHtml(nameOf(p.id))}</span><span>${icon.vp}${p.vp}</span><span>${icon.hp}${p.alive ? p.health : 0}</span>${p.alive ? '' : '<span class="muted">退場</span>'}</div>`).join('');
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
        store.save(KEYS.settings, settings);
        renderTitle();
    });
    segment('player-count', d => { settings.count = Number(d.count); });
    segment('cpu-level', d => { settings.level = d.level; });
    $('start').addEventListener('click', () => startGame(newSetup()));
    $('resume').addEventListener('click', () => startGame(store.load(KEYS.save) ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('open-log').addEventListener('click', openLog);
    $('home').addEventListener('click', goHome);
    $('monsters').addEventListener('click', e => {
        const b = e.target.closest('[data-seat]');
        if (b) showMonster(Number(b.dataset.seat));
    });
    $('market').addEventListener('click', e => {
        const b = e.target.closest('[data-card]');
        if (!b) return;
        if (mine('buy')) {
            ui.card = ui.card === b.dataset.card ? null : b.dataset.card;
            render();
        } else {
            const c = cardOf(b.dataset.card);
            showInfo(c.name, `<p>${c.cost}⚡・${c.kind === 'keep' ? '持続' : '使い捨て'}</p><p>${c.text}</p>`);
        }
    });
    $('dice').addEventListener('click', e => {
        const b = e.target.closest('[data-die]');
        if (!b || !mine('roll')) return;
        const i = Number(b.dataset.die);
        if (ui.change) {
            ui.change.index = i;
            render();
            return;
        }
        if (ui.kept.has(i)) ui.kept.delete(i);
        else ui.kept.add(i);
        render();
    });
    $('actions').addEventListener('click', e => {
        const face = e.target.closest('[data-face]');
        if (face && ui.change) {
            const { card, index } = ui.change;
            ui.change = null;
            send({ type: 'change', index, face: face.dataset.face, card });
            return;
        }
        const change = e.target.closest('[data-change]');
        if (change) {
            ui.change = { card: change.dataset.change, index: null };
            render();
            return;
        }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'hint') return showHint();
        if (act === 'reroll') {
            const dice = view.dice.map((_, i) => i).filter(i => !ui.kept.has(i));
            send({ type: 'reroll', dice });
        } else if (act === 'resolve') send({ type: 'resolve' });
        else if (act === 'cancelChange') { ui.change = null; render(); } else if (act === 'buy' && ui.card) { const card = ui.card; ui.card = null; send({ type: 'buy', card }); } else if (act === 'sweep') { ui.card = null; send({ type: 'sweep' }); } else if (act === 'endBuy') { ui.card = null; send({ type: 'endBuy' }); } else if (act === 'otherBuys') openOtherBuys();
        else if (act === 'rapidHeal') send({ type: 'rapidHeal' });
        else if (act === 'result') showResult();
    });
    $('my-cards').addEventListener('click', e => {
        if (e.target.closest('[data-act="rapidHeal"]')) { send({ type: 'rapidHeal' }); return; }
        const b = e.target.closest('[data-mycard]');
        if (b) { const c = cardOf(b.dataset.mycard); showInfo(c.name, `<p>${c.text}</p>`); }
    });
    $('info-body').addEventListener('click', e => {
        const b = e.target.closest('[data-other]');
        if (!b) return;
        $('info-dialog').close();
        const o = view.options;
        if (b.dataset.other === 'top') send({ type: 'buyTop' });
        else { const f = o.fromOthers[Number(b.dataset.other)]; send({ type: 'buyFrom', seat: f.seat, card: f.card }); }
    });
    $('decide-body').addEventListener('click', e => {
        const step = e.target.closest('[data-step]');
        if (step) {
            // 癒しの光線：配るハートの合計は、出たハートの数まで
            const row = step.closest('[data-ray]');
            const total = [...document.querySelectorAll('[data-ray]')].reduce((sum, x) => sum + Number(x.dataset.value), 0);
            const delta = Number(step.dataset.step);
            const next = Number(row.dataset.value) + delta;
            if (next < 0 || (delta > 0 && total >= view.decision.hearts)) return;
            row.dataset.value = next;
            row.querySelector('b').textContent = next;
            return;
        }
        if (e.target.closest('[data-act="hint"]')) return showHint();
        const b = e.target.closest('[data-answer], [data-probe], [data-mimic], .pick');
        if (b) answerDecision(b);
    });
    $('again').addEventListener('click', () => { $('result-dialog').close(); startGame(newSetup()); });
    $('result-home').addEventListener('click', () => { $('result-dialog').close(); goHome(); });

    // ページの拡大を止める
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('input, textarea')) e.preventDefault();
    });

    showScene('title');
    registerServiceWorker();
    // 確かめるときに使う
    window.__app = { get controller() { return controller; }, get view() { return view; }, get ui() { return ui; }, startGame, send };
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
