/**
 * 画面の進行：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController from './game-controller.js';
import { cardOf, GOOD_NAMES, TRADE_VALUE } from './cards.js';
import { ACTION_NAMES, PHASE_NAMES, HAND_LIMIT } from './game.js';
import { fullText, shortText, kindText, powerText } from './card-text.js';
import { actionIcon, chipIcon, swordIcon, titleArt, describeEvent, ACTION_BONUS, ACTION_SHORT, GOOD_COLORS } from './art.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';
import { music } from './music.js';

// 自分の操作の音：行動を選ぶ・捨てる・探索で残す・開発/入植・交易/消費/思わぬ収穫
const COMMAND_SOUND = { action: 'place', startDiscard: 'pay', discard: 'pay', explore: 'draw', develop: 'place', settle: 'place', trade: 'gain', consume: 'gain', windfall: 'gain' };

const $ = id => document.getElementById(id);
const KEYS = { settings: 'rftg.settings.v1', save: 'rftg.save.v1' };
const CPU_NAMES = ['ノヴァ', 'ベガ', 'リゲル'];
// 確かめるときだけ、URL の ?cpuDelay=ミリ秒 で CPU の間隔を縮められる
const CPU_DELAY = Number(new URLSearchParams(location.search).get('cpuDelay')) || undefined;
const REVEAL_MS = 2600;

const store = {
    load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* 同上 */ } }
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let settings = { count: 3, level: 'normal', advanced: false, ...store.load(KEYS.settings) };
let scene = 'title';
let controller = null;
let view = null;
let ui = freshUi();
let seenSeq = 0;
let resultShown = false;
let revealTimer = null;
let sending = false; // 自分の操作を送っている間（その音は送った側で鳴らす）

// ヒント：おすすめの手 { key, command }（その場面の間だけ）
let hint = null;
const HINT_BUTTON = '<button type="button" id="hint" class="chip hint-button" data-act="hint" aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>ヒント</button>';

// おすすめの手を、選んだ状態にして光らせる
function showHint() {
    const d = decision();
    if (!d || !controller) return;
    const c = controller.suggest();
    if (!c) return;
    if (c.type === 'startDiscard' || c.type === 'discard') ui.sel = [...c.cards];
    if (c.type === 'action') ui.actions = [...c.actions];
    if (c.type === 'explore') ui.keep = [...c.keep];
    if ((c.type === 'develop' || c.type === 'settle') && c.card) {
        Object.assign(ui, { place: c.card, sel: [...c.pay], tactics: [...(c.tactics ?? [])], colonyShip: !!c.colonyShip, payMilitary: !!c.payMilitary });
    }
    if (c.type === 'trade') ui.goods = [c.good];
    if (c.type === 'windfall') ui.goods = [c.world];
    if (c.type === 'consume' && !c.done) {
        Object.assign(ui, { use: d.options.findIndex(o => o.use === c.use), sel: [...(c.cards ?? [])], goods: [...(c.goods ?? [])], number: c.number ?? null });
    }
    hint = { key: ui.key, command: c };
    music.play('select');
    render();
}

function renderHint() {
    const c = hint?.key === ui.key && decision() ? hint.command : null;
    if (!c) {
        hint = null;
        return;
    }
    let target = {
        startDiscard: '[data-act="discard"]', discard: '[data-act="discard"]', action: '[data-act="chooseAction"]', explore: '#explore-ok',
        trade: '[data-act="trade"]', windfall: '[data-act="windfall"]'
    }[c.type];
    if (c.type === 'develop' || c.type === 'settle') target = c.card ? '[data-act="place"]' : '[data-act="pass"]';
    if (c.type === 'consume') target = c.done ? '[data-act="consumeDone"]' : '[data-act="consumeUse"]';
    if (target) document.querySelector(target)?.classList.add('suggested');
}

function freshUi(key = null) {
    return { key, sel: [], place: null, goods: [], use: null, tactics: [], colonyShip: false, payMilitary: false, focus: null, actions: [], keep: [] };
}

const nameOf = seat => (seat === view.seat ? 'あなた' : view.players[seat].name);
const me = () => view.players[view.seat];
const decision = () => view.decision;
const toggle = (list, id, max = Infinity) => (list.includes(id) ? list.filter(x => x !== id) : list.length < max ? [...list, id] : list);

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
    $('advanced').checked = settings.advanced;
    $('advanced').disabled = settings.count !== 2;
    $('advanced-row').classList.toggle('disabled', settings.count !== 2);
    $('resume').hidden = !store.load(KEYS.save);
}

// ---------- ゲームの開始 ----------

function newSetup() {
    const players = [{ name: 'あなた', isCPU: false }];
    for (let i = 1; i < settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, options: { seed: createSeed(), advanced: settings.advanced && settings.count === 2 }, level: settings.level };
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
    seenSeq = view.eventSeq;
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

function onUpdate() {
    if (!controller) return;
    const previous = view;
    view = controller.getView();
    saveProgress();
    render();
    playUpdateSound(previous);
}

// 1回の更新に1つの音。CPU の手は知らせ、自分が選ぶ番になったらチャイム、終わったら勝ち負け
function playUpdateSound(previous) {
    if (!previous) return;
    if (view.phase === 'end') {
        const winners = view.winners ?? [];
        if (previous.phase !== 'end') music.play(!winners.includes(view.seat) ? 'lose' : winners.length > 1 ? 'notify' : 'win');
        return;
    }
    if (sending) return;
    music.play(view.decision && !previous.decision ? 'turn' : 'notify');
}

function onError(message) {
    music.play('error');
    $('panel').querySelector('.feed')?.replaceChildren(Object.assign(document.createElement('span'), { className: 'error', textContent: message }));
}

function send(command) {
    if (!controller) return;
    sending = true;
    const ok = controller.send(command);
    sending = false;
    const passed = command.card === null || command.done;
    if (ok && view.phase !== 'end') music.play(passed ? 'select' : COMMAND_SOUND[command.type] ?? 'place');
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    const key = JSON.stringify([view.round, view.phase, view.decision]);
    if (ui.key !== key) ui = { ...freshUi(key), focus: ui.focus };
    renderStatus();
    renderOpponents();
    renderMine();
    renderHand();
    renderPanel();
    renderExplore();
    renderHint();
    checkReveal();
    if (view.phase === 'end' && !resultShown) {
        resultShown = true;
        setTimeout(showResult, 700);
    }
}

function renderStatus() {
    const phase = view.phase === 'action' ? '行動を選ぶ' : view.phase === 'start' ? '準備' : view.phase === 'roundEnd' ? 'ラウンドの終わり' : view.phase === 'end' ? '終了' : PHASE_NAMES[view.phase];
    $('status').textContent = view.round ? `R${view.round}・${phase}` : phase;
    $('pool').innerHTML = `${chipIcon}${Math.max(0, view.pool)}`;
}

function actionBadges(actions) {
    return actions ? actions.map(a => `<span class="act-badge" title="${ACTION_NAMES[a]}">${actionIcon(a)}</span>`).join('') : '';
}

function renderOpponents() {
    $('opponents').innerHTML = view.players.filter(p => p.id !== view.seat).map(p => {
        const waiting = p.waiting ? '<span class="dots" title="選んでいます">…</span>' : '';
        const acts = view.phase === 'action' ? (p.chosen ? '<span class="chosen-mark">選んだ</span>' : waiting) : actionBadges(p.actions);
        return `<button class="opp" data-seat="${p.id}">
            <span class="opp-name">${esc(p.name)}${view.phase !== 'action' ? waiting : ''}</span>
            <span class="opp-stats"><span>${chipIcon}${p.chips}</span><span class="tab-count">場${p.tableau.length}</span><span>手${p.handCount}</span><span>${swordIcon}${p.military}</span></span>
            <span class="opp-acts">${acts}</span>
        </button>`;
    }).join('');
}

// 小さなカード
function cardHtml(id, { cls = '', good = false, badge = '', data = 'card' } = {}) {
    const c = cardOf(id);
    const kind = c.type === 'dev' ? 'dev' : c.good ?? 'none';
    const classes = ['card', `k-${kind}`, c.type, c.flags?.includes('military') ? 'military' : '', c.flags?.includes('windfall') ? 'windfall' : '', c.cost === 6 && c.type === 'dev' ? 'six' : '', cls].join(' ');
    return `<button class="${classes}" data-${data}="${id}">
        <span class="c-top"><span class="c-cost">${c.cost}</span><span class="c-vp">${c.vp}${c.bonus ? '+' : ''}</span></span>
        <span class="c-name">${esc(c.name)}</span>
        <span class="c-pw">${shortText(id).map(t => `<span>${esc(t)}</span>`).join('')}</span>
        ${good ? `<span class="good-cube" style="--g:${GOOD_COLORS[c.good]}"></span>` : ''}
        ${badge ? `<span class="c-badge">${badge}</span>` : ''}
    </button>`;
}

function renderMine() {
    const p = me();
    $('my-summary').innerHTML = `<span class="ms-name">あなた</span><span>${chipIcon}${p.chips}</span><span>場${p.tableau.length}/12</span><span>${swordIcon}${p.military}</span><span class="ms-acts">${actionBadges(p.actions)}</span>`;
    const d = decision();
    const pickable = id => {
        if (!d) return false;
        if (d.kind === 'trade') return p.goods.includes(id);
        if (d.kind === 'windfall') return d.candidates.includes(id);
        if (d.kind === 'consume' && ui.use !== null) {
            const o = d.options[ui.use];
            return (o.need || o.trade) && p.goods.includes(id) && (!o.kind || cardOf(id).good === o.kind);
        }
        if (d.kind === 'settle' && ui.place) return view.options.tactics.includes(id) || id === view.options.colonyShip;
        return false;
    };
    $('tableau').innerHTML = p.tableau.map(id => {
        const sel = ui.goods.includes(id) || ui.tactics.includes(id) || (ui.colonyShip && id === view.options?.colonyShip);
        return cardHtml(id, { good: p.goods.includes(id), cls: `${pickable(id) ? 'pickable' : ''} ${sel ? 'selected' : ''}`, data: 'tab' });
    }).join('');
}

// 手札のカードに付ける印（払う・置く・費用）
function handBadge(id) {
    const d = decision();
    if (!d) return '';
    if (ui.place === id) return '置く';
    if (ui.sel.includes(id)) return d.kind === 'develop' || d.kind === 'settle' ? '払う' : '捨てる';
    if (d.kind === 'develop' && cardOf(id).type === 'dev' && !ui.place) {
        const o = view.options.develop[id];
        return o.duplicate ? '置けない' : `費用${o.cost}`;
    }
    if (d.kind === 'settle' && cardOf(id).type === 'world' && !ui.place) {
        const o = view.options.settle[id];
        return o.military ? `軍${o.strength}/${o.need}` : `費用${o.cost}`;
    }
    return '';
}

function renderHand() {
    const hand = view.hand ?? [];
    const d = decision();
    const dim = id => d && !ui.place && ((d.kind === 'develop' && cardOf(id).type !== 'dev') || (d.kind === 'settle' && cardOf(id).type !== 'world'));
    $('hand').innerHTML = hand.length
        ? hand.map(id => cardHtml(id, { cls: `${ui.place === id ? 'placing' : ''} ${ui.sel.includes(id) ? 'selected' : ''} ${ui.focus === id ? 'focus' : ''} ${dim(id) ? 'dim' : ''}`, badge: handBadge(id), data: 'hand' })).join('')
        : '<span class="muted">手札なし</span>';
}

function focusLine() {
    if (!ui.focus || !cardOf(ui.focus)) return '';
    const c = cardOf(ui.focus);
    return `<div class="focus-line"><b>${esc(c.name)}</b><small>${esc(kindText(c))}・${c.vp}点</small> ${esc(fullText(ui.focus).slice(0, 3).join('／') || '力なし')}<button class="link small" data-act="detail">詳しく</button></div>`;
}

function feedLine() {
    const last = [...view.events].reverse().map(e => describeEvent(e, view)).find(Boolean) ?? '';
    return `<div class="feed">${esc(last)}</div>`;
}

function renderPanel() {
    const d = decision();
    let body = '';
    if (view.phase === 'end') body = '<div class="prompt">ゲーム終了</div><div class="btn-row"><button class="primary" data-act="result">結果</button></div>';
    else if (!d) body = waitingHtml();
    else body = ({
        startDiscard: discardHtml, discard: discardHtml, action: actionHtml, explore: () => '<div class="prompt">引いたカードから残すカードを選ぶ</div><div class="btn-row"><button class="primary" data-act="openExplore">カードを見る</button></div>',
        develop: placeHtml, settle: placeHtml, trade: tradeHtml, consume: consumeHtml, windfall: windfallHtml
    })[d.kind]();
    // ヒントのボタン（自分が選ぶ番だけ。案内文の右端）
    if (d && view.phase !== 'end') body = body.replace('<div class="prompt">', `<div class="prompt">${HINT_BUTTON}`);
    $('panel').innerHTML = feedLine() + body + focusLine();
}

function waitingHtml() {
    if (view.phase === 'action') return '<div class="prompt">ほかの人が選ぶのを待っています</div>';
    const c = view.myChoice;
    if (c?.card) return `<div class="prompt">「${esc(cardOf(c.card).name)}」を置きます（全員がそろったら公開）</div>`;
    if (c) return '<div class="prompt">置きません（全員がそろったら公開）</div>';
    return '<div class="prompt">ほかの人を待っています</div>';
}

function discardHtml() {
    const d = decision();
    const label = d.kind === 'startDiscard' ? '最初の手札から捨てるカード' : `手札の上限は${HAND_LIMIT}枚。捨てるカード`;
    return `<div class="prompt">${label}を${d.count}枚選ぶ（${ui.sel.length}/${d.count}）</div>
        <div class="btn-row"><button class="primary" data-act="discard" ${ui.sel.length === d.count ? '' : 'disabled'}>捨てる</button></div>`;
}

function actionHtml() {
    const d = decision();
    const list = view.advanced ? ['explore5', 'explore1', 'develop', 'develop2', 'settle', 'settle2', 'trade', 'vp2', 'produce'] : ['explore5', 'explore1', 'develop', 'settle', 'trade', 'vp2', 'produce'];
    const chosen = ui.actions.map(a => `<b>${ACTION_NAMES[a]}</b>：${ACTION_BONUS[a]}`).join('<br>') || '選んだ行動のボーナスがここに出ます';
    return `<div class="prompt">行動を${d.count}つ選ぶ（${ui.actions.length}/${d.count}）</div>
        <div class="action-grid">${list.map(a => `<button class="action-btn ${ui.actions.includes(a) ? 'selected' : ''}" data-action="${a}" aria-label="${ACTION_NAMES[a]}">${actionIcon(a)}<span class="ab-name">${ACTION_SHORT[a]}</span></button>`).join('')}</div>
        <div class="ab-bonus">${chosen}</div>
        <div class="btn-row"><button class="primary" data-act="chooseAction" ${ui.actions.length === d.count ? '' : 'disabled'}>決定</button></div>`;
}

// 開発・入植：置くカードと払いの枚数
function placeCost() {
    const d = decision();
    if (!ui.place) return null;
    if (d.kind === 'develop') return view.options.develop[ui.place].cost;
    const o = view.options.settle[ui.place];
    if (o.military && !ui.payMilitary) return 0;
    if (ui.colonyShip) return 0;
    return o.military ? o.payCost : o.cost;
}

function placeHtml() {
    const d = decision();
    const word = d.kind === 'develop' ? '開発' : '世界';
    const bonus = d.bonus ? `<span class="bonus-tag">${d.kind === 'develop' ? '費用-1' : '置いたら1枚引く'}</span>` : '';
    if (!ui.place) {
        return `<div class="prompt">${d.kind === 'develop' ? '開発' : '入植'}：置く${word}を手札から選ぶ ${bonus}</div>
            <div class="btn-row"><button class="secondary" data-act="pass">置かない</button></div>`;
    }
    const c = cardOf(ui.place);
    const cost = placeCost();
    let extra = '';
    let ready = ui.sel.length === cost;
    if (d.kind === 'settle') {
        const o = view.options.settle[ui.place];
        const toggles = [];
        if (o.military) {
            const strength = o.strength + 3 * ui.tactics.length;
            if (!ui.payMilitary) {
                extra += `<div class="mil-line">${swordIcon}軍事力 ${strength} ／ 防御 ${o.need} ${strength >= o.need ? '<b class="ok">置ける</b>' : '<b class="ng">足りない</b>'}</div>`;
                ready = strength >= o.need;
                if (view.options.tactics.length) toggles.push('<span class="hint">新戦術（場札）を押すと +3</span>');
            }
            if (o.payCost !== undefined) toggles.push(`<button class="chip ${ui.payMilitary ? 'on' : ''}" data-act="payMilitary">接触の専門家で払う（${o.payCost}枚）</button>`);
        }
        if (o.colonyShip && (!o.military || ui.payMilitary)) toggles.push(`<button class="chip ${ui.colonyShip ? 'on' : ''}" data-act="colonyShip">植民船を使う（0枚）</button>`);
        if (toggles.length) extra += `<div class="toggle-row">${toggles.join('')}</div>`;
    }
    const payText = cost > 0 ? `ほかの手札を${cost}枚選んで払う（${ui.sel.length}/${cost}）` : '払いはなし';
    return `<div class="prompt">「${esc(c.name)}」を置く：${payText} ${bonus}</div>${extra}
        <div class="btn-row"><button class="primary" data-act="place" ${ready ? '' : 'disabled'}>置く</button><button class="secondary" data-act="cancelPlace">選び直す</button><button class="tertiary" data-act="pass">置かない</button></div>`;
}

function tradeHtml() {
    const price = ui.goods[0] ? ` → ${tradePriceHint(ui.goods[0])}` : '';
    return `<div class="prompt">交易：売る商品を場札から選ぶ${price}</div>
        <div class="btn-row"><button class="primary" data-act="trade" ${ui.goods.length ? '' : 'disabled'}>売る</button></div>`;
}

const tradePriceHint = world => `${GOOD_NAMES[cardOf(world).good]}（基本${TRADE_VALUE[cardOf(world).good]}枚＋交易の力）`;

function consumeHtml() {
    const d = decision();
    if (ui.use === null) {
        return `<div class="prompt">消費：使う力を選ぶ${d.mustUse ? ' <span class="hint">枠が光る力は必ず使う</span>' : ''}</div>
            <div class="power-list">${d.options.map(o => `<button class="power-btn ${o.optional ? '' : 'must'}" data-use="${o.use}"><b>${esc(cardOf(o.card).name)}</b><span>${esc(powerLabel(o))}</span></button>`).join('')}</div>
            <div class="btn-row"><button class="secondary" data-act="consumeDone" ${d.mustUse ? 'disabled' : ''}>消費を終える</button></div>`;
    }
    const o = d.options[ui.use];
    let pick = '';
    let ready = false;
    if (o.discard) {
        pick = `手札を1〜${o.discard}枚選ぶ（${ui.sel.length}）`;
        ready = ui.sel.length >= 1 && ui.sel.length <= o.discard;
    } else if (o.lucky) {
        pick = `数を選ぶ：<span class="num-row">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="num ${ui.number === n ? 'on' : ''}" data-num="${n}">${n}</button>`).join('')}</span>`;
        ready = !!ui.number;
    } else {
        const need = o.trade ? 1 : o.need;
        pick = `場札の商品を${need}つ選ぶ（${ui.goods.length}/${need}）${o.diff ? '・違う種類' : ''}`;
        ready = ui.goods.length === need && (!o.diff || new Set(ui.goods.map(g => cardOf(g).good)).size === 3);
    }
    return `<div class="prompt"><b>${esc(cardOf(o.card).name)}</b>：${esc(powerLabel(o))}<br>${pick}</div>
        <div class="btn-row"><button class="primary" data-act="consumeUse" ${ready ? '' : 'disabled'}>使う</button><button class="secondary" data-act="consumeBack">ほかの力</button></div>`;
}

function powerLabel(o) {
    if (o.trade) return o.noBonus ? '商品を1つ売る（交易の力なし）' : '商品を1つ売る（交易の力つき）';
    return powerText(o.power).replace(/^消費：/, '');
}

function windfallHtml() {
    const d = decision();
    const what = d.good ? `${GOOD_NAMES[d.good]}の` : '';
    const from = d.source === 'produceBonus' ? '生産のボーナス' : `「${cardOf(d.source).name}」`;
    return `<div class="prompt">${esc(from)}：${what}ウィンドフォールの世界を場札から選ぶ</div>
        <div class="btn-row"><button class="primary" data-act="windfall" ${ui.goods.length ? '' : 'disabled'}>商品を置く</button></div>`;
}

// ---------- 探索のダイアログ ----------

function renderExplore() {
    const d = decision();
    const dialog = $('explore-dialog');
    if (!d || d.kind !== 'explore') {
        if (dialog.open) dialog.close();
        return;
    }
    const n = Math.min(d.keep, d.drawn.length);
    $('explore-title').textContent = `探索：${d.drawn.length}枚から${n}枚残す（${ui.keep.length}/${n}）`;
    $('explore-cards').innerHTML = d.drawn.map(id => `<div class="explore-item ${ui.keep.includes(id) ? 'selected' : ''}" data-keep="${id}">
        ${cardHtml(id, { cls: ui.keep.includes(id) ? 'selected' : '', data: 'keep' })}
        <div class="ex-text"><small>${esc(kindText(cardOf(id)))}・${cardOf(id).vp}点</small>${fullText(id).map(t => `<div>${esc(t)}</div>`).join('') || '<div class="muted">力なし</div>'}</div>
    </div>`).join('');
    $('explore-ok').disabled = ui.keep.length !== n;
    if (!dialog.open && ui.exploreOpen !== false) openDialog('explore-dialog');
}

// ---------- 行動の公開 ----------

function checkReveal() {
    const fresh = view.events.filter(e => e.seq > seenSeq);
    seenSeq = view.eventSeq;
    const reveal = [...fresh].reverse().find(e => e.type === 'reveal');
    if (!reveal) return;
    $('reveal-title').textContent = `ラウンド${reveal.round}の行動`;
    $('reveal-body').innerHTML = reveal.actions.map((acts, i) => `<div class="reveal-row ${i === view.seat ? 'me' : ''}"><span class="rv-name">${esc(nameOf(i))}</span>${acts.map(a => `<span class="rv-act">${actionIcon(a)}${ACTION_NAMES[a]}</span>`).join('')}</div>`).join('')
        + `<div class="rv-phases">この順に行う：${[...new Set(reveal.actions.flat().map(a => PHASE_NAMES[{ explore5: 'explore', explore1: 'explore', develop: 'develop', develop2: 'develop2', settle: 'settle', settle2: 'settle2', trade: 'consume', vp2: 'consume', produce: 'produce' }[a]]))]
            .sort((a, b) => ['探索', '開発', '入植', '消費', '生産'].indexOf(a) - ['探索', '開発', '入植', '消費', '生産'].indexOf(b)).join(' → ')}</div>`;
    if ($('explore-dialog').open) $('explore-dialog').close();
    openDialog('reveal-dialog');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => { if ($('reveal-dialog').open) $('reveal-dialog').close(); }, REVEAL_MS);
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
            if (dialog.id === 'explore-dialog') return;
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('cancel', e => { if (dialog.id === 'explore-dialog') e.preventDefault(); });
        dialog.addEventListener('close', () => {
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume();
            // 公開のあとに探索のカードを出す
            if (dialog.id === 'reveal-dialog' && view) render();
        });
    });
    $('help-content').innerHTML = helpMarkup();
}

function showInfo(title, html) {
    $('info-title').textContent = title;
    $('info-body').innerHTML = html;
    openDialog('info-dialog');
}

function cardInfoHtml(id) {
    const c = cardOf(id);
    return `<div class="info-card k-${c.type === 'dev' ? 'dev' : c.good ?? 'none'}"><div class="ic-kind">${esc(kindText(c))}・${c.vp}点${c.bonus ? '＋得点' : ''}</div>
        ${fullText(id).map(t => `<div>${esc(t)}</div>`).join('') || '<div class="muted">力はありません</div>'}<div class="ic-en">${esc(c.en)}</div></div>`;
}

function showCard(id) {
    showInfo(cardOf(id).name, cardInfoHtml(id));
}

function showPlayer(seat) {
    const p = view.players[seat];
    const acts = p.actions ? `<p>行動：${p.actions.map(a => ACTION_NAMES[a]).join('・')}</p>` : '';
    showInfo(`${nameOf(seat)}の場札（${p.tableau.length}枚）`, `<p class="info-stats">${chipIcon}${p.chips}　手札${p.handCount}枚　${swordIcon}${p.military}</p>${acts}
        <div class="tableau info-tableau">${p.tableau.map(id => cardHtml(id, { good: p.goods.includes(id), data: 'info' })).join('')}</div><p class="muted">カードを押すと効果が見られます</p>`);
}

function openLog() {
    const lines = view.events.map(e => describeEvent(e, view)).filter(Boolean);
    $('log-list').innerHTML = lines.map(l => `<li>${esc(l)}</li>`).join('');
    openDialog('log-dialog');
    const body = $('log-dialog').querySelector('.dialog-body');
    body.scrollTop = body.scrollHeight;
}

function showResult() {
    if (!view || view.phase !== 'end' || scene !== 'game') return;
    const winners = view.winners ?? [];
    $('result-title').textContent = winners.includes(view.seat) ? (winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${winners.map(nameOf).join('・')}の勝ち`;
    const ranked = [...view.players].sort((a, b) => b.score.total - a.score.total || b.score.tiebreak - a.score.tiebreak);
    $('result-body').innerHTML = `<table class="score-table"><thead><tr><th></th><th>チップ</th><th>カード</th><th>6コスト</th><th>合計</th></tr></thead><tbody>
        ${ranked.map(p => `<tr class="${p.id === view.seat ? 'me' : ''}"><td>${esc(nameOf(p.id))}</td><td>${p.score.chips}</td><td>${p.score.cards}</td><td>${p.score.bonus}</td><td><b>${p.score.total}</b></td></tr>`).join('')}
    </tbody></table><p class="muted">同点のときは、商品と手札の合計が多い人の勝ち</p>`;
    openDialog('result-dialog');
}

// ---------- 操作 ----------

function onHand(id) {
    const d = decision();
    ui.focus = id;
    if (!d) return render();
    const c = cardOf(id);
    if (d.kind === 'startDiscard' || d.kind === 'discard') ui.sel = toggle(ui.sel, id, d.count);
    else if (d.kind === 'develop' || d.kind === 'settle') {
        const type = d.kind === 'develop' ? 'dev' : 'world';
        if (!ui.place) {
            if (c.type === type && !(d.kind === 'develop' && view.options.develop[id].duplicate)) {
                ui.place = id;
                ui.sel = [];
            }
        } else if (id === ui.place) {
            ui.place = null;
            ui.sel = [];
            ui.tactics = [];
            ui.colonyShip = false;
            ui.payMilitary = false;
        } else {
            ui.sel = toggle(ui.sel, id, placeCost());
        }
    } else if (d.kind === 'consume' && ui.use !== null && d.options[ui.use].discard) {
        ui.sel = toggle(ui.sel, id, d.options[ui.use].discard);
    }
    music.play('select');
    render();
}

function onTableau(id) {
    const d = decision();
    const p = me();
    if (d?.kind === 'trade' && p.goods.includes(id)) ui.goods = [id];
    else if (d?.kind === 'windfall' && d.candidates.includes(id)) ui.goods = [id];
    else if (d?.kind === 'consume' && ui.use !== null && p.goods.includes(id)) {
        const o = d.options[ui.use];
        if (o.trade) ui.goods = [id];
        else if (o.need && (!o.kind || cardOf(id).good === o.kind)) ui.goods = toggle(ui.goods, id, o.need);
        else return showCard(id);
    } else if (d?.kind === 'settle' && ui.place && view.options.tactics.includes(id)) ui.tactics = toggle(ui.tactics, id);
    else if (d?.kind === 'settle' && ui.place && id === view.options.colonyShip) ui.colonyShip = !ui.colonyShip;
    else return showCard(id);
    music.play('select');
    render();
}

function onAct(act) {
    const d = decision();
    switch (act) {
        case 'hint': return showHint();
        case 'discard': return send({ type: d.kind, cards: ui.sel });
        case 'chooseAction': return send({ type: 'action', actions: ui.actions });
        case 'openExplore': ui.exploreOpen = true; return openDialog('explore-dialog');
        case 'pass': return send({ type: d.kind, card: null, pay: [] });
        case 'cancelPlace': music.play('cancel'); ui.place = null; ui.sel = []; ui.tactics = []; ui.colonyShip = false; ui.payMilitary = false; return render();
        case 'payMilitary': ui.payMilitary = !ui.payMilitary; ui.sel = []; ui.tactics = []; if (!ui.payMilitary) ui.colonyShip = false; return render();
        case 'colonyShip': ui.colonyShip = !ui.colonyShip; ui.sel = []; return render();
        case 'place': {
            const command = { type: d.kind, card: ui.place, pay: ui.sel };
            if (d.kind === 'settle') {
                if (ui.tactics.length) command.tactics = ui.tactics;
                if (ui.colonyShip) command.colonyShip = view.options.colonyShip;
                if (ui.payMilitary) command.payMilitary = true;
            }
            return send(command);
        }
        case 'trade': return send({ type: 'trade', good: ui.goods[0] });
        case 'consumeDone': return send({ type: 'consume', done: true });
        case 'consumeBack': ui.use = null; ui.goods = []; ui.sel = []; ui.number = null; return render();
        case 'consumeUse': {
            const o = d.options[ui.use];
            if (o.discard) return send({ type: 'consume', use: o.use, cards: ui.sel });
            if (o.lucky) return send({ type: 'consume', use: o.use, number: ui.number });
            return send({ type: 'consume', use: o.use, goods: ui.goods });
        }
        case 'windfall': return send({ type: 'windfall', world: ui.goods[0] });
        case 'detail': return ui.focus && showCard(ui.focus);
        case 'result': return showResult();
        default: return null;
    }
}

function setup() {
    $('title-art').innerHTML = titleArt();
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
    $('advanced').addEventListener('change', () => { settings.advanced = $('advanced').checked; store.save(KEYS.settings, settings); });
    $('start').addEventListener('click', () => startGame(newSetup()));
    $('resume').addEventListener('click', () => startGame(store.load(KEYS.save) ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('open-log').addEventListener('click', openLog);
    $('home').addEventListener('click', goHome);
    $('opponents').addEventListener('click', e => { const b = e.target.closest('[data-seat]'); if (b) showPlayer(Number(b.dataset.seat)); });
    $('hand').addEventListener('click', e => { const b = e.target.closest('[data-hand]'); if (b) onHand(b.dataset.hand); });
    $('tableau').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) onTableau(b.dataset.tab); });
    $('my-summary').addEventListener('click', () => showPlayer(view.seat));
    $('panel').addEventListener('click', e => {
        const a = e.target.closest('[data-action]');
        if (a) { ui.actions = toggle(ui.actions, a.dataset.action, decision().count); if (decision().count === 1) ui.actions = [a.dataset.action]; music.play('select'); return render(); }
        const u = e.target.closest('[data-use]');
        if (u) { ui.use = Number(u.dataset.use); ui.goods = []; ui.sel = []; return render(); }
        const n = e.target.closest('[data-num]');
        if (n) { ui.number = Number(n.dataset.num); return render(); }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act) onAct(act);
    });
    $('explore-cards').addEventListener('click', e => {
        const b = e.target.closest('[data-keep]');
        if (!b) return;
        const d = decision();
        ui.keep = toggle(ui.keep, b.dataset.keep, Math.min(d.keep, d.drawn.length));
        if (Math.min(d.keep, d.drawn.length) === 1) ui.keep = [b.dataset.keep];
        music.play('select');
        renderExplore();
    });
    $('explore-ok').addEventListener('click', () => { $('explore-dialog').close(); send({ type: 'explore', keep: ui.keep }); });
    // 相手の場札のカードを押すと、その効果に切り替える
    $('info-body').addEventListener('click', e => { const b = e.target.closest('[data-info]'); if (b) showInfo(cardOf(b.dataset.info).name, cardInfoHtml(b.dataset.info)); });
    $('again').addEventListener('click', () => { $('result-dialog').close(); startGame(newSetup()); });
    $('result-home').addEventListener('click', () => { $('result-dialog').close(); goHome(); });

    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });

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
