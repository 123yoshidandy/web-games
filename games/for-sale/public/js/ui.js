/**
 * 画面（タイトル・ゲーム・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 届いたイベントを順に再生して見せる（各イベントには、その時点の全員に見せてよい状態が付いている）
 * 売りは2段で見せる：全員の物件を、もらう小切手の下に高い順で並べて公開 → 小切手が持ち主へ飛ぶ
 */

import { MIN_PLAYERS, MAX_PLAYERS, rankResults } from './game.js';
import { LEVELS } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, coinIcon, propertyHtml, checkHtml, propTagHtml, checkTagHtml, money } from './art.js';
import { fly, rectOf, reducedMotion } from './animator.js';

const SETTINGS_KEY = 'for-sale.settings';
const CPU_NAMES = ['ハンス', 'エマ', 'ルイ', 'ミア', 'オット'];
// 再生の間（ミリ秒）
const STEP_MS = { auction: 650, bid: 480, pass: 720, win: 820, checks: 650, sale: 1500, award: 950 };
const AUTO_PASS_MS = 1200;      // コインが足りず降りるしかないときに、自動で降りるまでの間

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const sum = (list) => list.reduce((s, v) => s + v, 0);

function loadSettings() {
    const fallback = { count: 4, level: 'normal' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(saved.count) && saved.count >= MIN_PLAYERS && saved.count <= MAX_PLAYERS ? saved.count : fallback.count,
            level: Object.hasOwn(LEVELS, saved.level) ? saved.level : fallback.level
        };
    } catch {
        return fallback;
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.display = null;    // 画面に描いている状態（再生の途中ではビューより遅れている）
        this.queue = [];        // まだ再生していないイベント
        this.timer = null;
        this.lastSeq = 0;
        this.picked = null;     // 売りで選んだ物件
        this.amount = 1;        // 競りで出す額
        this.autoTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.renderTitleArt();
        this.renderHelpPictures();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        this.renderSetup();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
                onUpdate: () => this.onUpdate(),
                onError: (message) => this.toast(message)
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.picked = null;
        this.queue = [];
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は再生しない
        this.display = this.fromView(this.view);
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.dealIn();
        this.afterIdle();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {}, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.timer);
        clearTimeout(this.autoTimer);
        this.timer = null;
        if ($('#result').open) $('#result').close();
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#count-down').addEventListener('click', () => this.changeSetting({ count: this.settings.count - 1 }));
        $('#count-up').addEventListener('click', () => this.changeSetting({ count: this.settings.count + 1 }));
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (button) this.changeSetting({ level: button.dataset.level });
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());

        // ダイアログは外側のタップと「閉じる」で閉じる（結果は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) this.pickCard(Number(card.dataset.card));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            const act = button.dataset.act;
            if (act === 'down' || act === 'up') return this.changeAmount(act === 'up' ? 1 : -1);
            if (act === 'bid' && this.canBid()) this.controller?.send({ type: 'bid', amount: this.amount });
            if (act === 'pass' && this.canBid()) this.controller?.send({ type: 'pass' });
            if (act === 'sell' && this.canSell() && this.picked !== null) this.sellPicked();
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    changeSetting(change) {
        const next = { ...this.settings, ...change };
        next.count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, next.count));
        this.settings = next;
        saveSettings(next);
        this.renderSetup();
    }

    renderSetup() {
        $('#count-value').textContent = `${this.settings.count}人`;
        $('#count-down').disabled = this.settings.count <= MIN_PLAYERS;
        $('#count-up').disabled = this.settings.count >= MAX_PLAYERS;
        $('#level').innerHTML = Object.entries(LEVELS).map(([key, label]) =>
            `<button data-level="${key}" role="radio" aria-checked="${key === this.settings.level}" class="${key === this.settings.level ? 'on' : ''}">${label}</button>`).join('');
    }

    renderTitleArt() {
        $('#title-art').innerHTML = `${[4, 17, 29].map((card, i) => propertyHtml(card, { cls: `fan fan-${i}` })).join('')}
            ${checkHtml(15, { cls: 'title-check' })}`;
    }

    renderHelpPictures() {
        $('#help-bid').innerHTML = `<div class="mini-row">${[3, 12, 27].map(c => propertyHtml(c)).join('')}
            <span class="mini-bid">${coinIcon()}<b>×6</b></span></div>`;
        $('#help-sell').innerHTML = `<div class="mini-row">${[[13, 28], [9, 20], [0, 8]].map(([check, card]) =>
            `<div class="mini-pair">${checkHtml(check)}${propertyHtml(card)}</div>`).join('')}</div>`;
    }

    // ---- 操作 ----

    idle() {
        return this.queue.length === 0 && this.timer === null;
    }

    canBid() {
        const view = this.view;
        return !!view && this.idle() && view.phase === 'bid' && view.turn === view.you && !!view.options;
    }

    canSell() {
        const view = this.view;
        return !!view && this.idle() && view.phase === 'sell' && view.mySelection === null;
    }

    changeAmount(delta) {
        const range = this.view?.options?.range;
        if (!range) return;
        this.amount = Math.min(range.max, Math.max(range.min, this.amount + delta));
        this.renderActions();
    }

    pickCard(card) {
        if (!this.canSell()) return;
        // 選んだ物件をもう一度押したら出す
        if (this.picked === card) return this.sellPicked();
        this.picked = card;
        this.renderMe();
        this.renderActions();
    }

    sellPicked() {
        const card = this.picked;
        this.picked = null;
        this.controller?.send({ type: 'sell', card });
    }

    // ---- 再生 ----

    onUpdate() {
        if (!this.controller) return;
        this.view = this.controller.getView();
        const fresh = this.view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = this.view.events.at(-1)?.seq ?? this.lastSeq;
        this.queue.push(...fresh);
        if (this.timer === null) this.pump();
    }

    // イベントを1つ再生し、間を置いて次へ。なくなったらビューにそろえる
    pump() {
        this.timer = null;
        if (!this.controller) return;
        if (this.queue.length === 0) {
            this.display = this.fromView(this.view);
            this.render();
            this.afterIdle();
            return;
        }
        const event = this.queue.shift();
        const delay = this.step(event);
        if (delay === null) return;
        if (delay === 0) return this.pump();
        this.timer = setTimeout(() => this.pump(), delay);
    }

    fromView(view) {
        return { ...structuredClone(view), reveal: null };
    }

    // イベントを display に当てて描く。次までの間（ミリ秒）を返す。null なら止める
    step(event) {
        const before = this.display;
        const next = { ...structuredClone(event.state), you: this.view.you, mySelection: null, reveal: null };
        switch (event.type) {
        case 'auction':
            this.display = next;
            this.render();
            this.dealIn();
            return STEP_MS.auction;
        case 'checks':
            this.display = next;
            this.render();
            this.dealIn();
            return STEP_MS.checks;
        case 'bid':
            this.display = next;
            this.render();
            fly(coinIcon(), rectOf(this.seatEl(event.seat)), rectOf($('#high')), { size: { width: 22, height: 22 } });
            return STEP_MS.bid;
        case 'pass':
        case 'win': {
            const from = rectOf($(`#table .card[data-card="${event.card}"]`));
            this.display = next;
            this.render();
            const to = rectOf(this.seatEl(event.seat)?.querySelector(`[data-tag="${event.card}"]`)) ?? rectOf(this.seatEl(event.seat));
            fly(propertyHtml(event.card), from, to);
            if (event.paid > 0) this.bump(this.seatEl(event.seat));
            return event.type === 'pass' ? STEP_MS.pass : STEP_MS.win;
        }
        case 'selected':
            before.players[event.seat].selected = true;
            this.renderPlayers();
            return 0;
        case 'sale': {
            // 1段目：出した物件を、もらう小切手の下に高い順で並べる（各自の席から飛ばす）
            const from = Object.fromEntries(event.plays.map(p => [p.seat, rectOf(p.seat === this.view.you ? $(`#me .card[data-card="${p.card}"]`) ?? $('#me') : this.seatEl(p.seat))]));
            this.display = { ...before, reveal: { plays: event.plays, checks: before.checkMarket } };
            this.display.players = before.players.map(p => ({ ...p, hand: p.hand.filter(card => !event.plays.some(play => play.seat === p.id && play.card === card)), selected: false }));
            this.display.mySelection = null;
            this.render();
            event.plays.forEach((p, i) => {
                const target = $(`#table [data-slot="${i}"] .prop`);
                fly(propertyHtml(p.card), from[p.seat], rectOf(target), { delay: i * 60, hide: target });
            });
            this.queue.unshift({ type: 'award', plays: event.plays, state: event.state });
            return STEP_MS.sale;
        }
        case 'award': {
            // 2段目：小切手が持ち主へ飛ぶ
            const from = event.plays.map((_, i) => rectOf($(`#table [data-slot="${i}"] .check`)));
            this.display = next;
            this.render();
            event.plays.forEach((p, i) => {
                fly(checkHtml(p.check), from[i], rectOf(this.seatEl(p.seat)), { delay: i * 80 });
                this.bump(this.seatEl(p.seat), i * 80);
            });
            return STEP_MS.award;
        }
        case 'end':
            this.display = next;
            this.render();
            this.timer = setTimeout(() => { this.timer = null; this.showResult(); }, 600);
            return null;
        default:
            return 0;
        }
    }

    seatEl(seat) {
        return seat === this.view.you ? $('#me') : $(`[data-player="${seat}"]`);
    }

    // 並べたカードを、上から順に置く
    dealIn() {
        if (reducedMotion()) return;
        document.querySelectorAll('#table .slot > .card').forEach((el, i) => {
            el.animate([{ transform: 'translateY(-24px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }],
                { duration: 300, delay: i * 70, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
        });
    }

    bump(el, delay = 0) {
        if (!el || reducedMotion()) return;
        el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 320, delay: delay + 380 });
    }

    // 再生が終わったあと：入札額を範囲に合わせる。上げられないなら自動で降りる。終わっていれば結果を出す
    afterIdle() {
        clearTimeout(this.autoTimer);
        const view = this.view;
        if (!this.canSell()) this.picked = null;
        const range = view.options?.range;
        if (range) this.amount = range.min;
        this.renderActions();
        if (this.canBid() && !range) {
            this.autoTimer = setTimeout(() => { if (this.canBid() && !this.view.options.range) this.controller?.send({ type: 'pass' }); }, AUTO_PASS_MS);
        }
        if (view.phase === 'end' && !$('#result').open) this.showResult();
    }

    // ---- 描く ----

    render() {
        if (!this.display) return;
        this.renderTop();
        this.renderPlayers();
        this.renderTable();
        this.renderMe();
        this.renderActions();
        this.fitTags();
    }

    // 札が欄に収まらないときだけ、小さく詰める
    fitTags() {
        document.querySelectorAll('#screen-game .tags').forEach(el => {
            el.classList.remove('dense');
            if (el.scrollHeight > el.clientHeight + 1) el.classList.add('dense');
        });
    }

    renderTop() {
        const d = this.display;
        const label = d.phase === 'sell' ? '売り' : d.phase === 'bid' ? '競り' : '結果';
        $('#phase-info').innerHTML = d.phase === 'end' ? label : `${label}<b>${d.round}</b><span class="of">/ ${d.rounds}</span>`;
    }

    renderPlayers() {
        const d = this.display;
        const others = d.players.filter(p => p.id !== this.view.you);
        const el = $('#players');
        const cols = others.length === 4 ? 2 : Math.min(3, others.length);
        el.style.setProperty('--cols', cols);
        el.style.setProperty('--lines', Math.ceil(others.length / cols) === 1 ? 2 : 1);
        el.innerHTML = others.map(p => {
            const active = d.phase === 'bid' && d.turn === p.id;
            let status = '';
            if (d.phase === 'bid') {
                if (p.passed) status = '<span class="status muted">降りた</span>';
                else if (p.bid > 0) status = `<span class="bid-badge ${p.bid === d.high ? 'top' : ''}">${coinIcon()}${p.bid}</span>`;
                if (active) status += '<span class="thinking" aria-label="考えています"><i></i><i></i><i></i></span>';
            } else {
                status = `<span class="checks-sum" title="小切手の合計">${money(sum(p.checks))}</span>${p.selected ? '<span class="status done" title="出しました">✓</span>' : ''}`;
            }
            return `<div class="player ${active ? 'active' : ''} ${d.phase === 'bid' && p.passed ? 'out' : ''}" data-player="${p.id}">
                <div class="p-head"><span class="p-name">${escapeHtml(p.name)}</span><span class="p-coins">${coinIcon()}<b>${p.coins}</b></span></div>
                <div class="tags">${p.hand.map(c => propTagHtml(c)).join('')}</div>
                <div class="p-status">${status}</div>
            </div>`;
        }).join('');
    }

    renderTable() {
        const d = this.display;
        const n = d.players.length;
        const el = $('#table');
        el.style.setProperty('--n', n);
        if (d.phase === 'bid') {
            const leader = d.players.find(p => p.bid > 0 && p.bid === d.high);
            el.className = 'table bidding';
            el.innerHTML = `<div class="slots">${d.market.map(m => {
                const taker = m.takenBy === null ? '' : `<span class="taker">${escapeHtml(d.players[m.takenBy].name)}</span>`;
                return `<div class="slot ${m.takenBy === null ? '' : 'taken'}">${propertyHtml(m.card)}${taker}</div>`;
            }).join('')}</div>
            <div class="high" id="high">${leader ? `<span class="high-label">最高</span>${coinIcon()}<b>${d.high}</b><span class="high-name">${escapeHtml(leader.name)}</span>` : '<span class="high-label">入札なし</span>'}</div>`;
            return;
        }
        if (d.phase === 'sell' || d.reveal) {
            el.className = 'table selling';
            const checks = d.reveal ? d.reveal.checks : d.checkMarket;
            el.innerHTML = `<div class="slots">${checks.map((check, i) => {
                const play = d.reveal?.plays[i];
                const under = play
                    ? `${propertyHtml(play.card)}<span class="taker ${play.seat === this.view.you ? 'mine' : ''}">${escapeHtml(d.players[play.seat].name)}</span>`
                    : '<div class="card prop placeholder"></div><span class="taker"></span>';
                return `<div class="slot pair" data-slot="${i}">${checkHtml(check)}${under}</div>`;
            }).join('')}</div>`;
            return;
        }
        el.className = 'table';
        el.innerHTML = '';
    }

    renderMe() {
        const d = this.display;
        const me = d.players[this.view.you];
        const selling = d.phase === 'sell';
        const total = sum(me.checks);
        $('#me').className = `me ${selling ? 'selling' : ''} ${(d.phase === 'bid' && d.turn === me.id) || this.canSell() ? 'active' : ''}`;
        let status = '';
        if (d.phase === 'bid') status = me.passed ? '<span class="status muted">降りた</span>' : me.bid > 0 ? `<span class="bid-badge ${me.bid === d.high ? 'top' : ''}">${coinIcon()}${me.bid}</span>` : '';
        else status = `<span class="me-checks">小切手 <b>${money(total)}</b></span>`;
        const selected = d.mySelection ?? (this.idle() ? this.view.mySelection : null);
        const hand = selling
            ? `<div class="hand ${this.canSell() ? 'playable' : ''}">${me.hand.map(card => propertyHtml(card, {
                cls: card === this.picked ? 'picked' : card === selected ? 'sent' : '', attrs: this.canSell() ? 'role="button"' : ''
            })).join('')}</div>`
            : d.phase === 'bid'
                ? `<div class="tags">${me.hand.length > 0 ? me.hand.map(c => propTagHtml(c)).join('') : '<span class="empty">まだ物件はありません</span>'}</div>`
                : '';
        $('#me').innerHTML = `<div class="me-head">
                <span class="me-name">${escapeHtml(me.name)}</span>
                <span class="p-coins">${coinIcon()}<b>${me.coins}</b></span>
                ${status}
            </div>${hand}`;
    }

    renderActions() {
        const view = this.view;
        const d = this.display;
        if (!view || !d) return;
        let html = '';
        if (this.canBid()) {
            const range = view.options.range;
            const pass = `<button class="btn pass" data-act="pass">降りる<span class="sub">${view.options.lowest}を取る</span></button>`;
            html = range
                ? `${pass}<div class="stepper amount">
                        <button class="step-btn" data-act="down" aria-label="減らす" ${this.amount <= range.min ? 'disabled' : ''}>−</button>
                        <span class="amount-value">${coinIcon()}<b>${this.amount}</b></span>
                        <button class="step-btn" data-act="up" aria-label="増やす" ${this.amount >= range.max ? 'disabled' : ''}>＋</button>
                   </div><button class="btn primary" data-act="bid">入札</button>`
                : `<span class="act-label">コインが足りないので降ります</span>`;
        } else if (this.canSell()) {
            const card = this.picked !== null ? `<span class="act-label">${this.picked}を</span>` : '<span class="act-label muted">売る物件を選ぶ</span>';
            html = `${card}<button class="btn primary" data-act="sell" ${this.picked === null ? 'disabled' : ''}>出す</button>`;
        } else if (this.idle() && view.phase === 'sell') {
            html = '<span class="act-label muted">ほかの人を待っています</span>';
        } else if (this.idle() && view.phase === 'bid') {
            html = `<span class="act-label muted">${escapeHtml(view.players[view.turn].name)}の番</span>`;
        }
        $('#actions').innerHTML = html;
    }

    // ---- 結果 ----

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end' || $('#result').open) return;
        const ranked = rankResults(view.results);
        const winner = ranked[0];
        const name = (seat) => view.players[seat].name;
        $('#result-title').textContent = winner.seat === view.you ? 'あなたの勝ち' : `${name(winner.seat)}の勝ち`;
        $('#result-list').innerHTML = ranked.map(r => `<li class="${r.seat === winner.seat ? 'winner' : ''} ${r.seat === view.you ? 'mine' : ''}">
            <span class="r-name">${escapeHtml(name(r.seat))}</span>
            <span class="r-calc">${checkTagHtml(r.checkTotal)}<span class="plus">＋</span>${coinIcon()}${r.coins}</span>
            <b class="r-score">${money(r.score)}</b></li>`).join('');
        // 同点の決まりを使ったときだけ、理由を書く
        const second = ranked[1];
        let note = '';
        if (second && second.score === winner.score) {
            note = winner.coins !== second.coins ? '同点のため、コインの多い人の勝ち。' : '同点でコインも同じため、一番高い物件を買った人の勝ち。';
        }
        const removed = view.removed.properties.length > 0
            ? [`除かれていた物件：${view.removed.properties.join('・')}`, `除かれていた小切手：${view.removed.checks.join('・')}`]
            : [];
        $('#result-note').innerHTML = [note, ...removed].filter(Boolean).map(escapeHtml).join('<br>');
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
