/**
 * 画面の進行：タイトル → ゲーム（手番ごとに公開の一覧）→ 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController from './game-controller.js';
import { cardOf, WONDER_BY_KEY, COLOR_NAMES } from './cards.js';
import { producersOf, sellableOf, stagesOf, scienceOf } from './city.js';
import { res, coin, shield, vp, sci, costHtml, effectHtml, chainHtml, stageHtml, COLOR_HEX } from './card-text.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';
import { music } from './music.js';

const $ = id => document.getElementById(id);
const KEYS = { settings: 'sevenwonders.settings.v1', save: 'sevenwonders.save.v1' };
const CPU_NAMES = ['ジャン', 'マリー', 'ピエール', 'ソフィ', 'ルイ', 'アンナ'];
const REVEAL_AUTO_CLOSE_MS = 5000;
const COLOR_ORDER = ['brown', 'grey', 'blue', 'yellow', 'red', 'green', 'purple'];
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

let settings = { count: 4, sides: 'A', level: 'normal', ...store.load(KEYS.settings) };
let scene = 'title';
let controller = null;
let view = null;
let seenSeq = 0;
let ui = { card: null, buildPay: 0, wonderPay: 0, key: null };
let revealTimer = null;
let resultPending = false;
let lastAction = null; // 自分が最後に選んだ手（効果音を選ぶ）

const nameOf = seat => (seat === view.seat ? 'あなた' : view.players[seat].name);
const wonderName = city => WONDER_BY_KEY[city.wonder].name;

// ---------- 画面の切り替え ----------

function showScene(name) {
    scene = name;
    $('screen-title').hidden = name !== 'title';
    $('screen-game').hidden = name !== 'game';
    if (name === 'title') renderTitle();
}

function renderTitle() {
    document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === settings.count)));
    document.querySelectorAll('#wonder-side button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.side === settings.sides)));
    document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === settings.level)));
    $('resume').hidden = !store.load(KEYS.save);
}

// タイトルの絵：ピラミッドと柱と、色とりどりのカード
function drawTitleArt() {
    const cards = COLOR_ORDER.map((c, i) => `<rect x="${18 + i * 30}" y="${96 - (i % 2) * 4}" width="24" height="32" rx="3" fill="${COLOR_HEX[c]}" stroke="#f3e2b3" stroke-width="1.5" transform="rotate(${(i - 3) * 4} ${30 + i * 30} 112)"/>`).join('');
    $('title-art').innerHTML = `
        <circle cx="186" cy="30" r="14" fill="#f1c75b" opacity=".9"/>
        <path d="M40 92 92 26 144 92Z" fill="#d9b26a" stroke="#6b4d1c" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M92 26 144 92H110Z" fill="#b88f47"/>
        <path d="M60 66h64M50 79h84M71 52h42M81 39h22" stroke="#8a6a2f" stroke-width="1.5"/>
        <g fill="#efe3c3" stroke="#6b4d1c" stroke-width="1.5"><rect x="156" y="52" width="58" height="6" rx="1"/><rect x="160" y="58" width="7" height="34"/><rect x="176" y="58" width="7" height="34"/><rect x="192" y="58" width="7" height="34"/><rect x="204" y="58" width="7" height="34"/><rect x="154" y="90" width="62" height="5" rx="1"/></g>
        ${cards}`;
}

// ---------- ゲームの開始 ----------

function newSetup() {
    const players = [{ name: 'あなた', isCPU: false }];
    for (let i = 1; i < settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, options: { seed: createSeed(), sides: settings.sides }, level: settings.level };
}

function startGame(setup) {
    controller?.stop();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    clearTimeout(revealTimer);
    resultPending = false;
    try {
        controller = new LocalGameController({ ...setup, cpuDelay: CPU_DELAY }, { onUpdate, onError });
    } catch (error) {
        console.warn(error);
        store.remove(KEYS.save);
        controller = new LocalGameController({ ...newSetup(), cpuDelay: CPU_DELAY }, { onUpdate, onError });
    }
    view = controller.getView();
    seenSeq = view.eventSeq;
    ui = { card: null, buildPay: 0, wonderPay: 0, key: null };
    showScene('game');
    render();
    if (view.phase === 'end') showResult();
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
    clearTimeout(revealTimer);
    showScene('title');
}

// ---------- 更新 ----------

function onUpdate() {
    if (!controller) return;
    view = controller.getView();
    const fresh = view.events.filter(e => e.seq > seenSeq);
    seenSeq = view.eventSeq;
    const reveals = fresh.filter(e => e.type === 'reveal' || e.type === 'discardBuild' || e.type === 'military');
    if (fresh.some(e => e.type === 'end')) resultPending = true;
    playSound(fresh);
    if (reveals.length) showReveal(reveals);
    else if (resultPending && !$('reveal-dialog').open) showResult();
    saveProgress();
    render();
}

// 新しい出来事から効果音を1つ鳴らす。自分の手はその音、全員の手が開いて次を選べるようになったら turn、終わりは勝ち負け
function playSound(fresh) {
    if (fresh.length === 0) return;
    if (fresh.some(e => e.type === 'end')) {
        const first = view.ranking.filter(r => r.rank === 1).map(r => r.seat);
        return music.play(first.includes(view.seat) ? 'win' : 'lose');
    }
    if (fresh.some(e => e.type === 'age')) return music.play('shuffle');
    const mine = fresh.find(e => (e.type === 'chosen' || e.type === 'discardBuild') && e.seat === view.seat);
    if (mine?.type === 'discardBuild') return music.play('place');
    if (mine) return music.play(lastAction === 'discard' ? 'gain' : 'place');
    if (fresh.some(e => e.type === 'reveal')) music.play(view.handOptions ? 'turn' : 'notify');
}

function onError(message) {
    music.play('error');
    $('action').querySelector('.prompt')?.replaceChildren(document.createTextNode(message));
}

const choosing = () => !!view?.handOptions;

// ---------- 操作 ----------

function optionOf(card) {
    return view.handOptions?.find(o => o.card === card) ?? null;
}

function selectCard(card) {
    if (!choosing()) return;
    ui.card = ui.card === card ? null : card;
    music.play(ui.card === null ? 'cancel' : 'select');
    ui.buildPay = 0;
    ui.wonderPay = 0;
    render();
}

function play(action) {
    const option = optionOf(ui.card);
    if (!option) return;
    let command;
    if (action === 'discard') command = { type: 'play', card: ui.card, action: 'discard' };
    else if (action === 'wonder') command = { type: 'play', card: ui.card, action: 'wonder', pay: option.wonder[ui.wonderPay] };
    else {
        const b = option.build;
        const choices = buildChoices(b);
        const choice = choices[ui.buildPay];
        command = { type: 'play', card: ui.card, action: 'build', pay: choice.pay, free: choice.free };
    }
    ui.card = null;
    lastAction = action;
    controller.send(command);
}

// 建てるときの払い方の候補（連鎖なら無料、オリンピアの無料の建設も候補に入れる）
function buildChoices(build) {
    if (!build) return [];
    if (build.free === 'chain') return [{ pay: { left: 0, right: 0 }, free: 'chain', label: '連鎖で無料' }];
    const list = build.options.map(pay => ({ pay, free: null, label: payLabel(pay) }));
    if (build.olympia) list.push({ pay: { left: 0, right: 0 }, free: 'olympia', label: 'ゼウス像で無料' });
    return list;
}

// ---------- ヒント ----------

const samePay = (a, b) => a.left === b.left && a.right === b.right;

// おすすめの手を、カード・払い方を選んだ状態にして、押すボタンに印を付ける（画面だけ。記録には入れない）
function showHint() {
    const command = choosing() ? controller?.hint() : null;
    if (command?.type !== 'play') return;
    const option = optionOf(command.card);
    if (!option) return;
    ui.card = command.card;
    ui.hint = command;
    ui.buildPay = command.action === 'build' ? Math.max(0, buildChoices(option.build).findIndex(c => c.free === (command.free ?? null) && samePay(c.pay, command.pay))) : 0;
    ui.wonderPay = command.action === 'wonder' ? Math.max(0, option.wonder.findIndex(p => samePay(p, command.pay))) : 0;
    render();
}

function markHint() {
    $('hint').disabled = !choosing();
    const h = ui.hint;
    if (!h || !choosing()) return;
    document.querySelector(`#hand [data-card="${h.card}"]`)?.classList.add('recommended');
    if (ui.card === h.card) document.querySelector(`#action [data-act="${h.action}"]`)?.classList.add('recommended');
}

const payLabel = pay => (pay.left + pay.right === 0 ? '払わない' : [pay.left ? `左に${pay.left}` : '', pay.right ? `右に${pay.right}` : ''].filter(Boolean).join('・'));

// ---------- 描画 ----------

function render() {
    if (!view) return;
    const key = `${view.age}:${view.turn}:${view.phase}`;
    if (ui.key !== key) ui = { card: null, buildPay: 0, wonderPay: 0, key };
    const dir = view.direction === 'left' ? '左へ' : '右へ';
    $('age-info').innerHTML = view.phase === 'end' ? '<b>ゲーム終了</b>'
        : `<b>第${view.age}時代</b><span>${Math.min(view.turn, 6)}/6</span><span class="dir">${view.direction === 'left' ? '◀' : '▶'} ${dir}<span class="dir-verb">渡す</span></span>`;
    renderNeighbors();
    renderMyCity();
    renderHand();
    renderAction();
    markHint();
    if (view.phase === 'discardBuild' && view.discardPile && !$('discard-dialog').open) openDiscard();
}

function producerHtml(producers) {
    return producers.map(options => (options.length > 3 ? `<span class="res-any">${options.length === 4 ? '原' : '加'}</span>` : options.map(res).join('<span class="or">/</span>'))).join('');
}

function renderNeighbors() {
    const me = view.players[view.seat];
    const side = (seat, label) => {
        const p = view.players[seat];
        const c = p.city;
        const ready = p.ready ? '<span class="ready" title="選び終えた">✓</span>' : '';
        return `<button class="neighbor" data-seat="${seat}">
            <div class="nb-head"><span class="nb-side">${label}</span><span class="nb-name">${escapeHtml(p.name)}</span>${ready}</div>
            <div class="nb-res">${producerHtml(sellableOf(c))}</div>
            <div class="nb-stats">${coin(c.coins)}${shield(1)}<b>${p.shields}</b><span class="stage-count">段階 ${c.stages}/${p.stagesTotal}</span></div>
        </button>`;
    };
    $('neighbors').innerHTML = side(me.left, '◀ 左') + side(me.right, '右 ▶');
}

function renderMyCity() {
    const me = view.players[view.seat];
    const c = me.city;
    const stages = stagesOf(c).map((s, i) => `<span class="stage${i < c.stages ? ' done' : ''}${i === c.stages ? ' next' : ''}" title="${i + 1}段目">${i < c.stages ? '✓' : [...s.cost].map(res).join('')}</span>`).join('');
    const counts = COLOR_ORDER.map(color => [color, c.built.filter(id => cardOf(id).color === color).length]).filter(([, k]) => k > 0)
        .map(([color, k]) => `<span class="count-chip" style="--c:${COLOR_HEX[color]}" title="${COLOR_NAMES[color]}">${k}</span>`).join('');
    const s = scienceOf(c);
    const science = s.counts.some(Boolean) || s.wild ? `<span class="sci-counts">${['c', 'g', 't'].map((k, i) => s.counts[i] ? `${sci(k)}${s.counts[i]}` : '').join('')}${s.wild ? sci('any') + s.wild : ''}</span>` : '';
    $('my-city').innerHTML = `
        <button class="city-head" data-seat="${view.seat}">
            <span class="wonder-name">${wonderName(c)}<small>${c.side}面</small></span>
            <span class="city-stats">${coin(c.coins)}${shield(1)}<b>${me.shields}</b>${vp(me.score.total)}</span>
        </button>
        <div class="stages">${stages}</div>
        <div class="city-rows">
            <div class="city-row"><span class="label">生産</span><span class="prod">${producerHtml(producersOf(c))}</span></div>
            <div class="city-row"><span class="label">建物</span><span class="counts">${counts || '<span class="muted">なし</span>'}</span>${science}</div>
        </div>`;
}

function renderHand() {
    const hand = view.hand ?? [];
    const can = choosing();
    $('hand').innerHTML = hand.map(id => {
        const c = cardOf(id);
        const o = optionOf(id);
        let status = '';
        if (can) {
            const b = o?.build;
            if (!b) status = '<span class="st st-no">建てられない</span>';
            else if (b.free === 'chain') status = '<span class="st st-free">連鎖で無料</span>';
            else if (b.options[0]) {
                const p = b.options[0];
                const total = p.left + p.right + c.coins;
                status = total ? `<span class="st">払う ${total}</span>` : '<span class="st st-free">建てられる</span>';
            } else status = '<span class="st st-free">ゼウス像で無料</span>';
        }
        const chosen = view.myChoice?.card === id;
        const cls = ['hand-card', ui.card === id ? 'selected' : '', can && !o?.build ? 'cannot' : '', chosen ? 'chosen' : '', can ? '' : 'idle'].join(' ');
        return `<button class="${cls}" data-card="${id}" style="--c:${COLOR_HEX[c.color]}">
            <span class="hc-top"><span class="hc-name">${c.name}</span><span class="hc-cost">${costHtml(c)}</span></span>
            <span class="hc-bottom"><span class="hc-effect">${effectHtml(c)}</span>${status}</span>
        </button>`;
    }).join('');
}

function renderAction() {
    const el = $('action');
    if (view.phase === 'end') {
        el.innerHTML = '<div class="prompt">ゲーム終了</div><button class="primary" data-act="result">結果</button>';
        return;
    }
    if (!choosing()) {
        const waiting = view.players.filter(p => p.waiting && !p.ready && p.id !== view.seat).map(p => escapeHtml(p.name));
        const mine = view.myChoice ? `「${cardOf(view.myChoice.card).name}」を${{ build: '建てる', wonder: '段階に使う', discard: '捨てる' }[view.myChoice.action]}` : '';
        const text = view.phase === 'discardBuild' ? `${nameOf(view.players.find(p => p.waiting).id)}が捨て札から選んでいます`
            : mine ? `${mine}。${waiting.length ? `${waiting.join('・')}を待っています` : ''}` : 'ほかの人を待っています';
        el.innerHTML = `<div class="prompt">${text}</div>`;
        return;
    }
    if (ui.card === null) {
        el.innerHTML = '<div class="prompt">使うカードを選ぶ</div>';
        return;
    }
    const c = cardOf(ui.card);
    const o = optionOf(ui.card);
    const choices = buildChoices(o.build);
    const me = view.players[view.seat].city;
    const stage = stagesOf(me)[me.stages];
    const payRow = (list, selected, kind) => (list.length > 1
        ? `<div class="pay-row"><span class="label">${kind === 'build' ? '建てる' : '段階'}の払い方</span>${list.map((x, i) => `<button class="chip${i === selected ? ' on' : ''}" data-pay="${kind}:${i}">${x.label ?? payLabel(x)}</button>`).join('')}</div>` : '');
    const chain = chainHtml(c);
    el.innerHTML = `
        <div class="sel-info"><b style="--c:${COLOR_HEX[c.color]}">${c.name}</b>${chain ? `<span class="muted">（${chain}から連鎖）</span>` : ''}</div>
        ${payRow(choices, ui.buildPay, 'build')}
        ${payRow(o.wonder ?? [], ui.wonderPay, 'wonder')}
        <div class="act-buttons">
            <button class="primary" data-act="build" ${o.build ? '' : 'disabled'}>建てる<small>${choices[ui.buildPay] ? payLabel(choices[ui.buildPay].pay) : ''}</small></button>
            <button class="secondary wonder-btn" data-act="wonder" ${o.wonder ? '' : 'disabled'}>段階${stage ? ` ${me.stages + 1}` : ''}<small>${stage ? stageText(stage, o.wonder?.[ui.wonderPay]) : '完成'}</small></button>
            <button class="tertiary" data-act="discard">捨てる<small>+3コイン</small></button>
        </div>`;
}

// 段階のボタンの補足：払い方か、建てられない理由
function stageText(stage, pay) {
    return pay ? payLabel(pay) : '資源が足りない';
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
            if (dialog.id === 'discard-dialog') return;
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', () => {
            if (dialog.id === 'reveal-dialog') {
                clearTimeout(revealTimer);
                if (resultPending) setTimeout(showResult, 200);
            }
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume();
        });
    });
    $('help-content').innerHTML = helpMarkup();
}

// 公開：各人が何をしたか（自分を先に、そのあと席の順）
function showReveal(events) {
    const order = view.players.map((_, i) => (view.seat + i) % view.players.length);
    const sections = events.map(e => {
        if (e.type === 'reveal') {
            const rows = order.filter(s => e.choices.some(c => c.seat === s)).map(s => {
                const ch = e.choices.find(c => c.seat === s);
                const card = cardOf(ch.card);
                const what = ch.action === 'discard' ? '<span class="act act-discard">捨てた</span>'
                    : ch.action === 'wonder' ? '<span class="act act-wonder">段階</span>'
                        : `<span class="card-chip" style="--c:${COLOR_HEX[card.color]}">${card.name}</span>`;
                const pays = [ch.pay?.left ? `左に${coin(ch.pay.left)}` : '', ch.pay?.right ? `右に${coin(ch.pay.right)}` : '', ch.free === 'chain' ? '連鎖' : '', ch.free === 'olympia' ? 'ゼウス像' : ''].filter(Boolean).join(' ');
                return `<div class="rv-row${s === view.seat ? ' me' : ''}"><span class="rv-name">${escapeHtml(nameOf(s))}</span>${what}<span class="rv-pay">${pays}</span>${e.income[s] ? `<span class="rv-income">+${coin(e.income[s])}</span>` : ''}</div>`;
            }).join('');
            return `<div class="rv-section"><h3>第${e.age}時代 ${e.turn > 6 ? '7枚目' : `${e.turn}手目`}</h3>${rows}</div>`;
        }
        if (e.type === 'discardBuild') {
            return `<div class="rv-section"><div class="rv-row"><span class="rv-name">${escapeHtml(nameOf(e.seat))}</span>${e.card ? `捨て札から<span class="card-chip" style="--c:${COLOR_HEX[cardOf(e.card).color]}">${cardOf(e.card).name}</span>を建てた` : '捨て札から建てなかった'}</div></div>`;
        }
        // 軍事
        const rows = order.map(s => {
            const r = e.results[s];
            const text = r.map((x, i) => `${i === 0 ? '左' : '右'} ${x.result === 'win' ? `<b class="win">勝ち +${x.points}</b>` : x.result === 'lose' ? '<b class="lose">負け -1</b>' : '引き分け'}`).join('　');
            return `<div class="rv-row${s === view.seat ? ' me' : ''}"><span class="rv-name">${escapeHtml(nameOf(s))}</span><span>${text}</span></div>`;
        }).join('');
        return `<div class="rv-section"><h3>第${e.age}時代の軍事</h3>${rows}</div>`;
    }).join('');
    $('reveal-title').textContent = events.some(e => e.type === 'military') ? '公開と軍事' : '公開';
    $('reveal-body').innerHTML = sections;
    openDialog('reveal-dialog');
    clearTimeout(revealTimer);
    const hasMilitary = events.some(e => e.type === 'military');
    revealTimer = setTimeout(() => $('reveal-dialog').close(), hasMilitary ? REVEAL_AUTO_CLOSE_MS + 3000 : REVEAL_AUTO_CLOSE_MS);
}

function cityHtml(seat) {
    const p = view.players[seat];
    const c = p.city;
    const groups = COLOR_ORDER.map(color => {
        const cards = c.built.filter(id => cardOf(id).color === color);
        if (!cards.length) return '';
        return `<div class="cg"><span class="cg-label" style="--c:${COLOR_HEX[color]}">${COLOR_NAMES[color]}</span>${cards.map(id => `<span class="cg-card">${cardOf(id).name}<span class="cg-effect">${effectHtml(cardOf(id))}</span></span>`).join('')}</div>`;
    }).join('');
    const stages = stagesOf(c).map((s, i) => `<div class="cs-stage${i < c.stages ? ' done' : ''}"><span>${i + 1}</span><span class="cs-cost">${[...s.cost].map(res).join('')}</span><span class="cs-effect">${stageHtml(s)}</span></div>`).join('');
    return `<section class="city-card${seat === view.seat ? ' me' : ''}">
        <div class="cc-head"><b>${escapeHtml(nameOf(seat))}</b><span class="muted">${wonderName(c)}（${c.side}面）</span></div>
        <div class="cc-stats">${coin(c.coins)}${shield(1)}<b>${p.shields}</b><span>軍事 ${c.tokens.reduce((a, b) => a + b, 0) - c.defeats}（負け${c.defeats}）</span>${vp(p.score.total)}<span class="muted">今の点</span></div>
        <div class="cc-stages">${stages}</div>
        <div class="cc-prod"><span class="label">売れる資源</span>${producerHtml(sellableOf(c))}</div>
        ${groups || '<p class="muted">建物なし</p>'}
    </section>`;
}

function openCities(seat = null) {
    if (!view) return;
    const order = view.players.map((_, i) => (view.seat + i) % view.players.length);
    $('cities-title').textContent = seat === null ? '全員の都市' : `${nameOf(seat)}の都市`;
    $('cities-body').innerHTML = (seat === null ? order : [seat]).map(cityHtml).join('');
    openDialog('cities-dialog');
}

function openDiscard() {
    $('discard-body').innerHTML = view.discardPile.map(id => {
        const c = cardOf(id);
        const ok = view.discardBuildable.includes(id);
        return `<button class="hand-card${ok ? '' : ' cannot'}" data-discard="${id}" ${ok ? '' : 'disabled'} style="--c:${COLOR_HEX[c.color]}">
            <span class="hc-top"><span class="hc-name">${c.name}</span></span><span class="hc-bottom"><span class="hc-effect">${effectHtml(c)}</span></span></button>`;
    }).join('');
    openDialog('discard-dialog');
}

function showResult() {
    if (!view?.scores || scene !== 'game') return;
    resultPending = false;
    // 合計は名前のすぐ右に（狭い画面で、右へはみ出して隠れないように）
    const cats = [['total', '合計'], ['military', '軍事'], ['treasury', 'お金'], ['wonder', '不思議'], ['civilian', '市民'], ['science', '科学'], ['commercial', '商業'], ['guilds', 'ギルド']];
    const winners = view.ranking.filter(r => r.rank === 1).map(r => r.seat);
    $('result-title').textContent = winners.length === 1 && winners[0] === view.seat ? 'あなたの勝ち' : `${winners.map(nameOf).join('と')}の勝ち`;
    $('result-head').innerHTML = `<th></th>${cats.map(([, l]) => `<th>${l}</th>`).join('')}`;
    $('result-body').innerHTML = view.ranking.map(r => {
        const s = view.scores[r.seat];
        return `<tr class="${r.seat === view.seat ? 'me' : ''}"><th>${r.rank}. ${escapeHtml(nameOf(r.seat))}</th>${cats.map(([k]) => `<td class="${k === 'total' ? 'total' : ''}">${s[k]}</td>`).join('')}</tr>`;
    }).join('');
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
    segment('wonder-side', d => { settings.sides = d.side; });
    segment('cpu-level', d => { settings.level = d.level; });
    $('start').addEventListener('click', () => startGame(newSetup()));
    $('resume').addEventListener('click', () => startGame(store.load(KEYS.save) ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('hint').addEventListener('click', showHint);
    $('open-cities').addEventListener('click', () => openCities());
    $('home').addEventListener('click', goHome);
    $('neighbors').addEventListener('click', e => {
        const b = e.target.closest('[data-seat]');
        if (b) openCities(Number(b.dataset.seat));
    });
    $('my-city').addEventListener('click', e => {
        if (e.target.closest('[data-seat]')) openCities(view.seat);
    });
    $('hand').addEventListener('click', e => {
        const b = e.target.closest('[data-card]');
        if (b) selectCard(b.dataset.card);
    });
    $('action').addEventListener('click', e => {
        const pay = e.target.closest('[data-pay]');
        if (pay) {
            const [kind, i] = pay.dataset.pay.split(':');
            if (kind === 'build') ui.buildPay = Number(i);
            else ui.wonderPay = Number(i);
            render();
            return;
        }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'result') showResult();
        else play(act.dataset.act);
    });
    $('discard-body').addEventListener('click', e => {
        const b = e.target.closest('[data-discard]');
        if (!b) return;
        $('discard-dialog').close();
        controller.send({ type: 'discardBuild', card: b.dataset.discard });
    });
    $('discard-skip').addEventListener('click', () => {
        $('discard-dialog').close();
        controller.send({ type: 'discardBuild', card: null });
    });
    $('again').addEventListener('click', () => {
        $('result-dialog').close();
        startGame(newSetup());
    });
    $('result-home').addEventListener('click', () => {
        $('result-dialog').close();
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
    window.__app = { get controller() { return controller; }, get view() { return view; }, get ui() { return ui; }, startGame, selectCard, play };
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
