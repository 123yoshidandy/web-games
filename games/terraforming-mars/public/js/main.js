/**
 * 画面の進行：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController from './game-controller.js';
import { cardOf } from './cards.js';
import { STANDARD_PROJECTS, MILESTONES, AWARDS, MILESTONE_COST, AWARD_COSTS, RESOURCES, TEMPERATURE, OXYGEN, OCEANS, TAG_NAMES } from './data.js';
import { boardSvg, tileName, effectLines, actionLines, reqText, vpText, tagsText, TYPE_NAMES, RES_SHORT, RES_COLORS, PLAYER_COLORS, RESOURCE_KIND, ONGOING_TEXT, describeEvent } from './art.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';
import { suggest } from './cpu-player.js';
import { music } from './music.js';

const $ = id => document.getElementById(id);
const KEYS = { settings: 'tm.settings.v1', save: 'tm.save.v1' };
const CPU_NAMES = ['アレス', 'ルナ', 'ヴェガ', 'オリオン'];
const CPU_DELAY = Number(new URLSearchParams(location.search).get('cpuDelay')) || undefined;

const store = {
    load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* 同上 */ } }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let settings = { count: 2, level: 'normal', ...store.load(KEYS.settings) };
let controller = null;
let view = null;
let ui = { key: null, keep: [], corp: null, sell: [] };
let resultShown = false;
let sheet = null; // いま開いているシートの種類
let sending = false; // 自分の操作を送っている間（効果音は送った操作で決める）
let soundSeq = 0;    // 効果音を決めるのに見た出来事の番号
const camera = { scale: 1, x: 0, y: 0 };

const nameOf = seat => (seat === view.seat ? 'あなた' : view.players[seat].name);
const me = () => view.players[view.seat];
const mine = kind => view?.decision && view.decision.seat === view.seat && (!kind || view.decision.kind === kind);

// ---------- 画面の切り替え ----------

function showScene(name) {
    $('screen-title').hidden = name !== 'title';
    $('screen-game').hidden = name !== 'game';
    if (name === 'title') renderTitle();
}

function renderTitle() {
    document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === settings.count)));
    document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === settings.level)));
    $('resume').hidden = !store.load(KEYS.save);
}

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
    showScene('game');
    resetCamera();
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
    const wasMine = !!mine();
    view = controller.getView();
    if (!sending) playUpdate(wasMine);
    saveProgress();
    render();
}

function onError(message) {
    music.play('error');
    const feed = $('panel').querySelector('.feed');
    if (feed) feed.innerHTML = `<span class="error">${esc(message)}</span>`;
}

function send(command) {
    if (!controller) return false;
    sending = true;
    let ok = false;
    try {
        ok = controller.send(command);
    } finally {
        sending = false;
    }
    if (ok) playSent(command);
    return ok;
}

// ---------- 効果音 ----------

const freshEvents = () => {
    const fresh = view.events.filter(e => e.seq > soundSeq);
    soundSeq = view.eventSeq;
    return fresh;
};
const endSound = fresh => {
    const end = fresh.find(e => e.type === 'end');
    if (end) music.play(end.winners.includes(view.seat) ? 'win' : 'lose');
    return !!end;
};

// 自分が送った操作の音（1つの操作に1つ）
function playSent(command) {
    if (endSound(freshEvents())) return;
    const sound = {
        play: 'place', cardAction: 'place', convertPlants: 'place', place: 'place', convertHeat: 'gain', unmi: 'gain',
        milestone: 'gain', award: 'pay', setup: 'draw', research: 'draw', choose: 'select', pass: 'select',
        standard: command.project === 'sellPatents' ? 'pay' : 'place',
        finalGreenery: command.space === null ? 'cancel' : 'place',
        target: command.seat === null || command.seat === view.seat ? 'cancel' : 'capture',
        targetCard: command.seat === view.seat ? 'place' : 'capture'
    }[command.type];
    if (sound) music.play(sound);
}

// ほかの人が動いたときの音。自分の番になったら turn、世代が変わったら notify、終わりは勝ち負け
// CPU は1手ずつ速く打つので、CPU の手ごとには鳴らさない
function playUpdate(wasMine) {
    const fresh = freshEvents();
    if (endSound(fresh)) return;
    if (mine() && !wasMine) return music.play('turn');
    if (fresh.some(e => e.type === 'generation')) music.play('notify');
}

// ---------- ヒント ----------

function showHint() {
    const command = suggest(view);
    if (!command) {
        const feed = $('panel').querySelector('.feed');
        if (feed && view) feed.textContent = 'いまはあなたの番ではありません';
        return;
    }
    ui.hint = command;
    // 準備と研究は、おすすめのカードを選んだ状態にする（そのまま決められる）
    if (command.type === 'setup') ui.corp = command.corp;
    if (command.type === 'setup' || command.type === 'research') ui.keep = [...command.keep];
    render();
    const text = hintText(command);
    const feed = $('panel').querySelector('.feed');
    if (feed && text) feed.textContent = `おすすめ：${text}`;
}

function hintText(c) {
    switch (c.type) {
        case 'setup': return `企業「${cardOf(c.corp).name}」と、印の付いたカード`;
        case 'research': return c.keep.length ? '印の付いたカードを買う' : 'カードを買わない';
        case 'play': return `「${cardOf(c.card).name}」を出す（手札）`;
        case 'cardAction': return `「${cardOf(c.card).name}」の行動（カードの行動）`;
        case 'standard': return `${STANDARD_PROJECTS[c.project].name}（標準プロジェクト）`;
        case 'milestone': return `${MILESTONES[c.key].name}を取る`;
        case 'award': return `${AWARDS[c.key].name}に出資する`;
        case 'convertPlants': return '植物で緑地を置く';
        case 'convertHeat': return '熱で温度を上げる';
        case 'unmi': return '3 M€で TR+1';
        case 'pass': return 'パス';
        case 'endTurn': return '手番を終える';
        case 'place': case 'finalGreenery': return c.space === null ? '置かない' : '印の付いたマスに置く';
        case 'target': return c.seat === null ? '選ばない' : `${nameOf(c.seat)}を選ぶ`;
        case 'targetCard': return `${nameOf(c.seat)}の「${cardOf(c.card).name}」`;
        case 'choose': return '印の付いた選び方';
        default: return '';
    }
}

// おすすめの手のボタン・カード・マスに印を付ける（シートを開くボタンと、シートの中の両方）
function markHint() {
    document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
    const c = ui.hint;
    if (!c) return;
    const sheetButton = { play: 'openHand', cardAction: 'openActions', standard: 'openStandard', milestone: 'openMilestones', award: 'openMilestones' }[c.type];
    const selectors = [
        sheetButton && `[data-act="${sheetButton}"]`,
        ['convertPlants', 'convertHeat', 'unmi', 'pass', 'endTurn'].includes(c.type) && `[data-act="${c.type}"]`,
        c.type === 'play' && `[data-play="${c.card}"]`,
        c.type === 'cardAction' && `[data-caction="${c.card}"][data-variant="${c.variant ?? 0}"]`,
        c.type === 'standard' && `[data-standard="${c.project}"]`,
        c.type === 'milestone' && `[data-milestone="${c.key}"]`,
        c.type === 'award' && `[data-award="${c.key}"]`,
        (c.type === 'place' || c.type === 'finalGreenery') && c.space !== null && `[data-space="${c.space}"]`,
        c.type === 'finalGreenery' && c.space === null && '[data-act="finalSkip"]',
        c.type === 'target' && `[data-target="${c.seat ?? 'none'}"]`,
        c.type === 'choose' && `[data-choose="${c.index}"]`,
        c.type === 'setup' && `[data-corp="${c.corp}"]`,
        c.type === 'targetCard' && `[data-tcard="${view.decision.options.findIndex(o => o.seat === c.seat && o.card === c.card)}"]`,
        ...((c.type === 'setup' || c.type === 'research') ? c.keep.map(k => `[data-card="${k}"]`) : [])
    ].filter(Boolean);
    selectors.forEach(s => document.querySelectorAll(s).forEach(el => el.classList.add('recommended')));
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    const key = JSON.stringify([view.eventSeq, view.decision?.kind, view.decision?.seat]);
    if (ui.key !== key) ui = { key, keep: [], corp: null, sell: [] };
    renderStatus();
    renderParams();
    renderMap();
    renderMine();
    renderPanel();
    // 準備と研究は、自分の番になったらシートを開く
    if ((mine('setup') || mine('research')) && sheet !== 'buy') openSheet('buy');
    else if (sheet) renderSheet();
    markHint();
    if (view.phase === 'end' && !resultShown) {
        resultShown = true;
        setTimeout(showResult, 600);
    }
}

function renderStatus() {
    const d = view.decision;
    const phase = { setup: '準備', research: '研究', action: '行動', final: '最後の緑地', end: '終了', production: '生産' }[view.phase] ?? '';
    $('status').innerHTML = `第${view.generation}世代・${phase}<small>${d ? (d.seat === view.seat ? 'あなたの番' : `${esc(nameOf(d.seat))}の番`) : ''}</small>`;
}

function renderParams() {
    const p = me();
    const bar = (label, value, unit, now, min, max) => `<div class="param"><span class="pl">${label}</span><b>${value}${unit}</b><i style="--w:${((now - min) / (max - min) * 100).toFixed(0)}%"></i></div>`;
    $('params').innerHTML = bar('温度', view.temperature, '℃', view.temperature, TEMPERATURE.min, TEMPERATURE.max)
        + bar('酸素', view.oxygen, '%', view.oxygen, 0, OXYGEN.max)
        + bar('海洋', view.oceans, `/${OCEANS.max}`, view.oceans, 0, OCEANS.max)
        + `<div class="param tr"><span class="pl">TR</span><b>${p.tr}</b></div>`;
}

function renderMap() {
    const options = mine('place') || mine('finalGreenery') ? view.decision.options : [];
    $('map-inner').innerHTML = boardSvg(view, options);
    applyCamera();
}

function renderMine() {
    const p = me();
    $('mine').innerHTML = `<div class="corp">${p.corp ? esc(cardOf(p.corp).name) : '企業を選ぶ'}<small>手札${view.hand.length}</small></div>`
        + RESOURCES.map(r => `<div class="res" style="--c:${RES_COLORS[r]}"><span class="rn">${RES_SHORT[r]}</span><b>${p.res[r]}</b><small>+${p.prod[r]}</small></div>`).join('');
}

function feedLine() {
    const last = [...view.events].reverse().map(e => describeEvent(e, view)).find(Boolean) ?? '';
    return `<div class="feed">${esc(last)}</div>`;
}

function renderPanel() {
    const d = view.decision;
    let body = '';
    if (view.phase === 'end') body = '<div class="btn-row"><button class="primary" data-act="result">結果</button></div>';
    else if (!mine()) body = `<div class="prompt muted">${d ? `${esc(nameOf(d.seat))}が考えています` : ''}</div>`;
    else if (d.kind === 'setup' || d.kind === 'research') body = `<div class="prompt">${d.kind === 'setup' ? '企業と最初の手札を選ぶ' : '研究：買うカードを選ぶ（1枚3 M€）'}</div><div class="btn-row"><button class="primary" data-act="openBuy">カードを見る</button></div>`;
    else if (d.kind === 'place') body = `<div class="prompt">${esc(tileName(d.tile, d.card))}を置くマスを、地図の光っているマスから選ぶ</div>`;
    else if (d.kind === 'finalGreenery') body = '<div class="prompt">最後に植物で緑地を置ける：地図の光っているマスを選ぶ</div><div class="btn-row"><button class="secondary" data-act="finalSkip">置かない</button></div>';
    else if (d.kind === 'target') {
        const what = d.what === 'removePlants' ? `植物を ${d.count} まで取り除く相手` : d.what === 'removeMc' ? `M€ を ${d.count} まで取り除く相手（隣のタイルの持ち主）` : `${RES_SHORT[d.resource]}の生産を -${d.count} する相手`;
        body = `<div class="prompt">${what}を選ぶ</div><div class="btn-row wrap">${d.options.map(s => `<button class="secondary" data-target="${s}">${esc(nameOf(s))}</button>`).join('')}${d.optional ? '<button class="tertiary" data-target="none">選ばない</button>' : ''}</div>`;
    } else if (d.kind === 'targetCard') {
        const what = d.what === 'add' ? `${RESOURCE_KIND[d.type]}を載せるカード` : `${RESOURCE_KIND[d.type]}を取り除くカード`;
        body = `<div class="prompt">${what}を選ぶ</div><div class="btn-row wrap">${d.options.map((o, i) => `<button class="secondary" data-tcard="${i}">${esc(nameOf(o.seat))}：${esc(cardOf(o.card).name)}（${view.players[o.seat].cardRes[o.card] ?? 0}）</button>`).join('')}</div>`;
    } else if (d.kind === 'choose' && d.source === 'insulation') {
        body = `<div class="prompt">断熱：熱の生産を M€ の生産に変える段階を選ぶ（いま熱の生産 ${me().prod.heat}）</div><div class="btn-row wrap">${d.options.map((o, i) => `<button class="secondary" data-choose="${i}">${i + 1}</button>`).join('')}</div>`;
    } else if (d.kind === 'choose') body = `<div class="prompt">${d.options.length > 2 ? 'どれか' : 'どちらか'}を選ぶ</div><div class="btn-row wrap">${d.options.map((o, i) => `<button class="secondary" data-choose="${i}">${esc(effectLines(o).join('・'))}</button>`).join('')}</div>`;
    else if (d.kind === 'action') body = actionHtml();
    $('panel').innerHTML = feedLine() + body;
}

function actionHtml() {
    const o = view.options;
    const p = me();
    return `<div class="prompt">行動を選ぶ（この手番 ${view.decision.done + 1} 回目）</div>
        <div class="act-grid">
            <button class="act" data-act="openHand">手札<b>${o.playable.length}/${view.hand.length}</b></button>
            <button class="act" data-act="openStandard">標準プロジェクト</button>
            <button class="act" data-act="openActions">カードの行動<b>${o.cardActions.length || ''}</b></button>
            <button class="act" data-act="convertPlants" ${o.convertPlants ? '' : 'disabled'}>植物${o.greeneryCost}→緑地</button>
            <button class="act" data-act="convertHeat" ${o.convertHeat ? '' : 'disabled'}>熱8→温度</button>
            <button class="act" data-act="openMilestones">マイルストーン・褒賞${o.milestones.length || o.awards.length ? '<b>!</b>' : ''}</button>
            ${o.unmi ? '<button class="act" data-act="unmi">3 M€でTR+1</button>' : ''}
            ${view.decision.done ? '<button class="act end" data-act="endTurn">手番を終える</button>' : '<button class="act end" data-act="pass">パス</button>'}
        </div>`;
}

// ---------- シート（手札・標準プロジェクト・マイルストーン・準備） ----------

function openSheet(kind) {
    sheet = kind;
    renderSheet();
    markHint();
    const dialog = $('sheet-dialog');
    if (!dialog.open) { controller?.pause(); dialog.showModal(); }
}

function cardHtml(key, { cost, button = '', selected = false, dim = false, res } = {}) {
    const c = cardOf(key);
    const lines = effectLines(c.effect);
    const req = reqText(c);
    const vp = vpText(c);
    return `<div class="card t-${c.type} ${selected ? 'selected' : ''} ${dim ? 'dim' : ''}" data-card="${key}">
        <div class="card-head">${cost !== undefined && cost < c.cost ? `<span class="cost disc">${cost}</span><s class="cost-was">${c.cost}</s>` : `<span class="cost">${cost ?? c.cost}</span>`}<b>${esc(c.name)}</b><span class="ctype">${TYPE_NAMES[c.type] ?? ''}</span></div>
        <div class="card-tags">${c.tags.length ? esc(tagsText(c.tags)) : 'タグなし'}${vp ? `・<b>${vp}</b>` : ''}</div>
        ${req ? `<div class="card-req">条件：${esc(req)}</div>` : ''}
        <div class="card-text">${ONGOING_TEXT[key] ? `<div class="card-ongoing">効果：${esc(ONGOING_TEXT[key])}</div>` : ''}${lines.map(l => `<div>${esc(l)}</div>`).join('')}${actionLines(c, key).map(l => `<div class="card-action">行動：${esc(l)}</div>`).join('')}${c.resource ? `<div class="card-res">${RESOURCE_KIND[c.resource]}を載せる${res !== undefined ? `：いま ${res}` : ''}</div>` : ''}</div>
        ${button}
    </div>`;
}

function renderSheet() {
    const d = view.decision;
    let title = '';
    let body = '';
    if (sheet === 'buy' && (mine('setup') || mine('research'))) {
        const money = mine('setup') ? (ui.corp ? cardOf(ui.corp).mc : 0) : me().res.mc;
        title = mine('setup') ? '企業と最初の手札' : '研究';
        const corps = mine('setup') ? `<h3>企業</h3><div class="corp-list">${d.corps.map(k => {
            const c = cardOf(k);
            const extra = [...Object.entries(c.stock).map(([r, n]) => `${RES_SHORT[r]}${n}`), ...Object.entries(c.production).map(([r, n]) => `${RES_SHORT[r]}の生産+${n}`)].join('・');
            return `<button class="corp-btn ${ui.corp === k ? 'selected' : ''}" data-corp="${k}"><b>${esc(c.name)}</b>${c.mc} M€${extra ? `・${esc(extra)}` : ''}<small>${esc(CORP_TEXT[k])}</small></button>`;
        }).join('')}</div>` : '';
        const cost = ui.keep.length * 3;
        body = `${corps}<h3>カード（1枚3 M€。${ui.keep.length}枚で${cost} M€／${money} M€）</h3>
            <div class="card-list">${d.cards.map(k => cardHtml(k, { selected: ui.keep.includes(k) })).join('')}</div>
            <div class="sheet-foot"><button class="primary" data-act="buyOk" ${(mine('setup') && !ui.corp) || cost > money ? 'disabled' : ''}>決定</button></div>`;
    } else if (sheet === 'hand') {
        title = `手札（${view.hand.length}枚）`;
        const o = view.options;
        const slack = o?.reqSlack ? `<p class="muted note">温度・酸素・海洋の条件が ${o.reqSlack} 段階ゆるい${me().specialDesign ? '（特別設計は次の 1 枚だけ）' : ''}</p>` : '';
        body = `${slack}<div class="card-list">${view.hand.map(k => {
            const can = o?.playable.includes(k);
            const pay = o?.autoPay[k];
            const payText = pay ? [pay.steel ? `鋼鉄${pay.steel}` : '', pay.titanium ? `チタン${pay.titanium}` : '', pay.heat ? `熱${pay.heat}` : ''].filter(Boolean).join('・') : '';
            return cardHtml(k, { cost: o?.costs[k], dim: !can, button: can ? `<button class="primary small" data-play="${k}">出す${payText ? `（${payText}を使う）` : ''}</button>` : '' });
        }).join('') || '<p class="muted">手札なし</p>'}</div>`;
    } else if (sheet === 'actions' && view.options) {
        title = 'カードの行動（1世代に1回ずつ）';
        const usable = Object.fromEntries(view.options.cardActions.map(a => [a.card, a.variants]));
        const mineCards = me().played.filter(k => cardOf(k).action || k === 'searchForLife' || cardOf(k).resource);
        body = `<div class="card-list">${mineCards.map(k => {
            const variants = actionLines(cardOf(k), k);
            const used = me().used.includes(k);
            const buttons = variants.map((t, i) => `<button class="primary small" data-caction="${k}" data-variant="${i}" ${usable[k]?.includes(i) ? '' : 'disabled'}>${variants.length > 1 ? `${i + 1}つ目を` : ''}使う${used ? '（使った）' : ''}</button>`).join('');
            return cardHtml(k, { res: me().cardRes[k] ?? 0, button: buttons });
        }).join('') || '<p class="muted">行動や資源を持つカードはまだない</p>'}</div>`;
    } else if (sheet === 'standard' && view.options) {
        title = '標準プロジェクト';
        const o = view.options;
        body = Object.entries(STANDARD_PROJECTS).map(([k, sp]) => {
            if (k === 'sellPatents') {
                return `<div class="sp"><b>${sp.name}</b><span>${sp.text}</span>
                    <div class="sell-list">${view.hand.map(c => `<button class="chip ${ui.sell.includes(c) ? 'on' : ''}" data-sell="${c}">${esc(cardOf(c).name)}</button>`).join('')}</div>
                    <button class="secondary small" data-act="sellOk" ${ui.sell.length ? '' : 'disabled'}>${ui.sell.length}枚を売る</button></div>`;
            }
            return `<div class="sp"><b>${sp.name}</b><span>${o.standardCosts[k]} M€：${sp.text}</span><button class="primary small" data-standard="${k}" ${o.standard.includes(k) ? '' : 'disabled'}>行う</button></div>`;
        }).join('');
    } else if (sheet === 'milestones') {
        title = 'マイルストーン・褒賞';
        const o = view.options ?? { milestones: [], awards: [] };
        body = `<h3>マイルストーン（${MILESTONE_COST} M€・5点・${view.milestones.length}/3）</h3>${Object.entries(MILESTONES).map(([k, m]) => {
            const got = view.milestones.find(x => x.key === k);
            return `<div class="sp"><b>${m.name}</b><span>${m.text}${got ? `（${esc(nameOf(got.seat))}が取った）` : ''}</span><button class="primary small" data-milestone="${k}" ${o.milestones.includes(k) ? '' : 'disabled'}>取る</button></div>`;
        }).join('')}
        <h3>褒賞（${AWARD_COSTS[view.awards.length] ?? '-'} M€・1位5点・2位2点・${view.awards.length}/3）</h3>${Object.entries(AWARDS).map(([k, a]) => {
            const got = view.awards.find(x => x.key === k);
            return `<div class="sp"><b>${a.name}</b><span>${a.text}${got ? '（出資済み）' : ''}</span><button class="primary small" data-award="${k}" ${o.awards.includes(k) ? '' : 'disabled'}>出資する</button></div>`;
        }).join('')}`;
    } else if (sheet === 'players') {
        title = 'プレイヤー';
        body = view.players.map(p => `<div class="pl-row" style="--pc:${PLAYER_COLORS[p.id]}"><b>${esc(nameOf(p.id))}</b>（${p.corp ? esc(cardOf(p.corp).name) : '-'}）TR ${p.tr}・手札${p.handCount}${p.passed ? '・パス' : ''}
            <div class="pl-res">${RESOURCES.map(r => `<span>${RES_SHORT[r]} ${p.res[r]}(+${p.prod[r]})</span>`).join('')}</div>
            <div class="pl-tags">${Object.entries(p.tags).map(([t, n]) => `${TAG_NAMES[t]}${n}`).join('・') || 'タグなし'}</div>
            <div class="pl-cards">${p.played.map(k => esc(cardOf(k).name) + (p.cardRes[k] ? `（${RESOURCE_KIND[cardOf(k).resource]}${p.cardRes[k]}）` : '')).join('、') || '出したカードなし'}</div></div>`).join('');
    } else {
        $('sheet-dialog').close();
        return;
    }
    $('sheet-title').textContent = title;
    $('sheet-body').innerHTML = body;
}

const CORP_TEXT = {
    crediCor: '20 M€ 以上のカード・標準プロジェクトで +4 M€', ecoLine: '緑地は植物 7 で置ける', helion: '熱を M€ として使える',
    miningGuild: '鋼鉄・チタンの配置ボーナスで鋼鉄の生産 +1', interplanetaryCinematics: 'イベントを出すたびに +2 M€', inventrix: '最初に 3 枚引く。温度・酸素・海洋の条件が 2 ゆるい',
    phoboLog: 'チタンの価値 +1', tharsisRepublic: '最初の行動で都市を置く。都市が置かれるたびに M€ の生産 +1、自分の都市で +3 M€',
    thorgate: '電力タグのカードと発電所が 3 M€ 安い', unitedNationsMarsInitiative: 'この世代に TR が上がっていれば、3 M€ で TR +1'
};

// ---------- 地図の拡大と移動（盤面だけ） ----------

function applyCamera() {
    const inner = $('map-inner');
    inner.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

function resetCamera() {
    camera.scale = 1;
    camera.x = 0;
    camera.y = 0;
    applyCamera();
}

function setupMapGestures() {
    const map = $('map');
    const pointers = new Map();
    let start = null;
    let moved = false;
    map.addEventListener('pointerdown', e => {
        if (e.target.closest('#map-reset')) return;
        map.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = false;
        start = { camera: { ...camera }, pts: [...pointers.values()].map(p => ({ ...p })) };
    });
    map.addEventListener('pointermove', e => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...pointers.values()];
        if (pts.length === 1 && start.pts.length === 1) {
            const dx = pts[0].x - start.pts[0].x;
            const dy = pts[0].y - start.pts[0].y;
            if (Math.hypot(dx, dy) > 6) moved = true;
            camera.x = start.camera.x + dx;
            camera.y = start.camera.y + dy;
        } else if (pts.length >= 2 && start.pts.length >= 2) {
            const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
            const ratio = dist(pts[0], pts[1]) / Math.max(1, dist(start.pts[0], start.pts[1]));
            camera.scale = Math.min(3, Math.max(1, start.camera.scale * ratio));
            moved = true;
        }
        applyCamera();
    });
    const end = e => {
        pointers.delete(e.pointerId);
        start = { camera: { ...camera }, pts: [...pointers.values()].map(p => ({ ...p })) };
    };
    map.addEventListener('pointerup', e => {
        const wasDrag = moved;
        end(e);
        if (wasDrag) return;
        // 押したマス（指が動いていなければ）
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-space]');
        if (el && (mine('place') || mine('finalGreenery')) && view.decision.options.includes(el.dataset.space)) {
            send(mine('place') ? { type: 'place', space: el.dataset.space } : { type: 'finalGreenery', space: el.dataset.space });
        }
    });
    map.addEventListener('pointercancel', end);
    map.addEventListener('wheel', e => {
        e.preventDefault();
        camera.scale = Math.min(3, Math.max(1, camera.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
        applyCamera();
    }, { passive: false });
    $('map-reset').addEventListener('click', resetCamera);
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
            if (dialog.id === 'sheet-dialog') sheet = null;
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume();
        });
    });
    $('help-content').innerHTML = helpMarkup();
}

function openLog() {
    $('log-list').innerHTML = view.events.map(e => describeEvent(e, view)).filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('');
    openDialog('log-dialog');
    const body = $('log-dialog').querySelector('.dialog-body');
    body.scrollTop = body.scrollHeight;
}

function showResult() {
    if (!view || view.phase !== 'end') return;
    const winners = view.winners ?? [];
    $('result-title').textContent = winners.includes(view.seat) ? 'あなたの勝ち' : `${winners.map(nameOf).join('・')}の勝ち`;
    const ranked = [...view.players].sort((a, b) => b.score.total - a.score.total);
    $('result-body').innerHTML = `<table class="score-table"><thead><tr><th></th><th>TR</th><th>マイル<br>ストーン</th><th>褒賞</th><th>緑地</th><th>都市</th><th>カード</th><th>合計</th></tr></thead><tbody>
        ${ranked.map(p => `<tr class="${p.id === view.seat ? 'me' : ''}"><td>${esc(nameOf(p.id))}</td><td>${p.score.tr}</td><td>${p.score.milestones}</td><td>${p.score.awards}</td><td>${p.score.greenery}</td><td>${p.score.city}</td><td>${p.score.cards}</td><td><b>${p.score.total}</b></td></tr>`).join('')}
    </tbody></table><p class="muted">同点のときは M€ の多い人の勝ち</p>`;
    openDialog('result-dialog');
}

// ---------- 操作 ----------

function onAct(act) {
    switch (act) {
        case 'openBuy': return openSheet('buy');
        case 'openHand': return openSheet('hand');
        case 'openStandard': return openSheet('standard');
        case 'openActions': return openSheet('actions');
        case 'openMilestones': return openSheet('milestones');
        case 'convertPlants': return send({ type: 'convertPlants' });
        case 'convertHeat': return send({ type: 'convertHeat' });
        case 'unmi': return send({ type: 'unmi' });
        case 'pass': return send({ type: 'pass' });
        case 'endTurn': return send({ type: 'endTurn' });
        case 'finalSkip': return send({ type: 'finalGreenery', space: null });
        case 'result': return showResult();
        default: return null;
    }
}

function closeSheetAnd(command) {
    $('sheet-dialog').close();
    send(command);
}

function setup() {
    $('title-art').innerHTML = '<svg viewBox="0 0 320 140" aria-hidden="true"><rect width="320" height="140" fill="#140806"/><circle cx="160" cy="150" r="120" fill="#b5562f"/><path d="M60 110q50-30 100-10t100-20" stroke="#3f9b3f" stroke-width="10" fill="none" opacity=".8"/><path d="M90 96q20-10 40 0" stroke="#2b7fd4" stroke-width="8" fill="none"/><circle cx="260" cy="30" r="6" fill="#ffe08a"/>' + Array.from({ length: 14 }, (_, i) => `<circle cx="${(i * 47) % 320}" cy="${(i * 29) % 70}" r="1.2" fill="#fff"/>`).join('') + '</svg>';
    setupDialogs();
    setupMapGestures();
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
    $('hint').addEventListener('click', showHint);
    $('open-players').addEventListener('click', () => openSheet('players'));
    $('home').addEventListener('click', goHome);
    $('panel').addEventListener('click', e => {
        const t = e.target;
        const target = t.closest('[data-target]');
        if (target) return send({ type: 'target', seat: target.dataset.target === 'none' ? null : Number(target.dataset.target) });
        const tcard = t.closest('[data-tcard]');
        if (tcard) { const o = view.decision.options[Number(tcard.dataset.tcard)]; return send({ type: 'targetCard', seat: o.seat, card: o.card }); }
        const choose = t.closest('[data-choose]');
        if (choose) return send({ type: 'choose', index: Number(choose.dataset.choose) });
        const act = t.closest('[data-act]')?.dataset.act;
        if (act) onAct(act);
    });
    $('sheet-body').addEventListener('click', e => {
        const t = e.target;
        const play = t.closest('[data-play]');
        if (play) return closeSheetAnd({ type: 'play', card: play.dataset.play, pay: view.options.autoPay[play.dataset.play] });
        const ca = t.closest('[data-caction]');
        if (ca) return closeSheetAnd({ type: 'cardAction', card: ca.dataset.caction, variant: Number(ca.dataset.variant) });
        const sp = t.closest('[data-standard]');
        if (sp) return closeSheetAnd({ type: 'standard', project: sp.dataset.standard });
        const ms = t.closest('[data-milestone]');
        if (ms) return closeSheetAnd({ type: 'milestone', key: ms.dataset.milestone });
        const aw = t.closest('[data-award]');
        if (aw) return closeSheetAnd({ type: 'award', key: aw.dataset.award });
        const sell = t.closest('[data-sell]');
        if (sell) { const k = sell.dataset.sell; ui.sell = ui.sell.includes(k) ? ui.sell.filter(x => x !== k) : [...ui.sell, k]; return renderSheet(); }
        if (t.closest('[data-act="sellOk"]')) return closeSheetAnd({ type: 'standard', project: 'sellPatents', cards: ui.sell });
        const corp = t.closest('[data-corp]');
        if (corp) { ui.corp = corp.dataset.corp; return renderSheet(); }
        if (t.closest('[data-act="buyOk"]')) return closeSheetAnd(mine('setup') ? { type: 'setup', corp: ui.corp, keep: ui.keep } : { type: 'research', keep: ui.keep });
        const card = t.closest('[data-card]');
        if (card && sheet === 'buy') { const k = card.dataset.card; ui.keep = ui.keep.includes(k) ? ui.keep.filter(x => x !== k) : [...ui.keep, k]; return renderSheet(); }
        return null;
    });
    $('again').addEventListener('click', () => { $('result-dialog').close(); startGame(newSetup()); });
    $('result-home').addEventListener('click', () => { $('result-dialog').close(); goHome(); });
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
    showScene('title');
    registerServiceWorker();
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
