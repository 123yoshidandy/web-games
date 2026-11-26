/**
 * 画面（タイトル・ゲーム・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 届いたイベントのうち新しいもの（いらない・取る・めくる）を、描いたあとに動きで見せる
 */

import { MIN_PLAYERS, MAX_PLAYERS, addedPoints } from './game.js';
import { LEVELS } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, chipIcon, cardHtml, cardBackHtml, runsHtml, potHtml } from './art.js';
import { fly, rectOf, reducedMotion } from './animator.js';

const SETTINGS_KEY = 'no-thanks.settings';
const CPU_NAMES = ['ハンス', 'エマ', 'ルイ', 'ミア', 'オット', 'リナ'];
const AUTO_TAKE_MS = 1200;      // チップがないときに、自動で取るまでの間
const RESULT_DELAY_MS = 900;    // 最後のカードが取られてから、結果を出すまでの間
const MAX_ANIMATED_EVENTS = 4;  // 1回の更新で、動きを見せる出来事の数の上限（取る＋めくるで2つ）

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

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
        this.lastSeq = 0;
        this.autoTimer = null;
        this.resultTimer = null;
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
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.flipCard();
        this.afterRender();
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
        clearTimeout(this.autoTimer);
        clearTimeout(this.resultTimer);
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
        $('#hint').addEventListener('click', () => this.showHint());
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

        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled || !this.myTurn()) return;
            this.hint = null;
            this.controller?.send({ type: button.dataset.act });
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
        // チップが積もった 26 を囲んで、ほかのカードが扇に並ぶ
        $('#title-art').innerHTML = `
            ${[8, 17, 31].map((card, i) => cardHtml(card, { cls: `fan fan-${i}` })).join('')}
            ${cardHtml(26, { cls: 'hero' })}
            <div class="title-pot">${potHtml(7)}</div>`;
    }

    renderHelpPictures() {
        $('#help-turn').innerHTML = `<div class="mini-stage">${cardHtml(26)}<span class="mini-pot">${chipIcon()}<b>×4</b></span>
            <span class="mini-offer">取ると <b class="up">+22</b></span></div>`;
        $('#help-run').innerHTML = `<div class="mini-runs">${[13, 14, 15, 16].map(c => cardHtml(c)).join('')}<span class="arrow">→</span>
            <span class="runs">${runsHtml([13, 14, 15, 16])}</span><span class="mini-eq">13点</span></div>`;
    }

    // ---- 操作 ----

    myTurn() {
        const view = this.view;
        return !!view && view.phase === 'play' && view.turn === view.you;
    }

    // ---- 更新 ----

    onUpdate() {
        if (!this.controller) return;
        // 動かす前の位置を測ってから描き直す
        const before = { card: rectOf($('#stage-card .card')), pot: rectOf($('#pot .pot-pile')) ?? rectOf($('#pot')) };
        this.view = this.controller.getView();
        const fresh = this.view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = this.view.events.at(-1)?.seq ?? this.lastSeq;
        this.render();
        this.animate(fresh, before);
        this.afterRender();
    }

    animate(events, before) {
        // 一度にたくさん届いたとき（裏のタブから戻ったときなど）は、動かさずに今の状態だけを見せる
        if (events.length > MAX_ANIMATED_EVENTS) return;
        const tookNow = events.some(e => e.type === 'take');
        events.forEach(event => {
            if (event.type === 'pass') {
                fly(chipIcon(), rectOf(this.seatEl(event.seat)), rectOf($('#pot')), { size: { width: 22, height: 22 } });
                this.bump($('#pot'));
            } else if (event.type === 'take') {
                const to = rectOf(this.runTarget(event.seat, event.card)) ?? rectOf(this.seatEl(event.seat));
                fly(cardHtml(event.card), before.card, to);
                Array.from({ length: Math.min(event.chips, 6) }, (_, i) =>
                    fly(chipIcon(), before.pot, to, { delay: 60 + i * 45, size: { width: 22, height: 22 } }));
                this.bump(this.seatEl(event.seat), 420);
            } else if (event.type === 'reveal') {
                this.flipCard(tookNow ? 260 : 0);
            }
        });
    }

    // 取ったカードが入った札（連続ならまとめた札）
    runTarget(seat, card) {
        const runs = [...(this.seatEl(seat)?.querySelectorAll('.run[data-run]') ?? [])];
        return runs.filter(el => Number(el.dataset.run) <= card).at(-1) ?? null;
    }

    seatEl(seat) {
        return seat === this.view.you ? $('#me') : $(`[data-player="${seat}"]`);
    }

    flipCard(delay = 0) {
        const el = $('#stage-card .card');
        if (!el || reducedMotion()) return;
        el.animate([
            { transform: 'translateX(-40%) rotateY(90deg) scale(.85)', opacity: 0 },
            { transform: 'translateX(0) rotateY(0) scale(1)', opacity: 1 }
        ], { duration: 360, delay, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    }

    bump(el, delay = 0) {
        if (!el || reducedMotion()) return;
        el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 320, delay: delay + 300 });
    }

    // 描いたあと：チップがないなら自動で取る。終わったら結果を出す
    afterRender() {
        clearTimeout(this.autoTimer);
        const view = this.view;
        if (this.myTurn() && view.players[view.you].chips === 0) {
            this.autoTimer = setTimeout(() => {
                if (this.myTurn() && this.view.players[this.view.you].chips === 0) this.controller?.send({ type: 'take' });
            }, AUTO_TAKE_MS);
        }
        if (view.phase === 'end' && !$('#result').open) {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    // ---- 描く ----

    // おすすめの手（ノーサンキューか取るか）のボタンを光らせる
    showHint() {
        if (!this.myTurn()) return;
        this.hint = this.controller?.suggest()?.type ?? null;
        this.renderActions();
    }

    render() {
        if (!this.view) return;
        if (!this.myTurn()) this.hint = null;
        $('#hint').disabled = !this.myTurn();
        this.renderTop();
        this.renderPlayers();
        this.renderStage();
        this.renderMe();
        this.renderActions();
        this.fitRuns();
    }

    // 札が欄に収まらないときだけ、小さく詰める
    fitRuns() {
        document.querySelectorAll('#screen-game .runs').forEach(el => {
            el.classList.remove('dense');
            if (el.scrollHeight > el.clientHeight + 1) el.classList.add('dense');
        });
    }

    renderTop() {
        const view = this.view;
        $('#deck-info').innerHTML = `${cardBackHtml('tiny')}<span>残り <b>${view.deckCount}</b></span>`;
    }

    renderPlayers() {
        const view = this.view;
        const others = view.players.filter(p => p.id !== view.you);
        const el = $('#players');
        const cols = others.length === 4 ? 2 : Math.min(3, others.length);
        el.style.setProperty('--cols', cols);
        // 1段に収まるなら、札を3行まで並べられる
        el.style.setProperty('--lines', Math.ceil(others.length / cols) === 1 ? 3 : 2);
        el.innerHTML = others.map(p => {
            const active = view.turn === p.id;
            return `<div class="player ${active ? 'active' : ''}" data-player="${p.id}">
                <div class="p-head">
                    <span class="p-name">${escapeHtml(p.name)}</span>
                    ${active ? '<span class="thinking" aria-label="考えています"><i></i><i></i><i></i></span>' : ''}
                    <span class="p-pts" title="カードの失点（チップは伏せられています）">${p.cardPoints}<small>点</small></span>
                </div>
                <div class="runs">${runsHtml(p.cards, view.current)}</div>
            </div>`;
        }).join('');
    }

    renderStage() {
        const view = this.view;
        $('#stage').classList.toggle('mine', this.myTurn());
        if (view.current === null) {
            $('#stage-card').innerHTML = '';
            $('#pot').innerHTML = '';
            $('#offer').innerHTML = '';
            return;
        }
        $('#stage-card').innerHTML = cardHtml(view.current, { cls: 'big' });
        $('#pot').innerHTML = `${potHtml(view.pot)}<span class="pot-count ${view.pot === 0 ? 'zero' : ''}">${chipIcon()}<b>×${view.pot}</b></span>`;
        // あなたが取ったら、得点がいくつ動くか（カードで増える分 − 上のチップ）
        const me = view.players[view.you];
        const added = addedPoints(me.cards, view.current);
        const net = added - view.pot;
        const linked = added < view.current;
        $('#offer').innerHTML = `<span class="offer-label">取ると</span><b class="${net > 0 ? 'up' : 'down'}">${signed(net)}</b>${linked ? '<span class="link-tag">つながる</span>' : ''}`;
    }

    renderMe() {
        const view = this.view;
        const me = view.players[view.you];
        const score = me.cardPoints - me.chips;
        $('#me').className = `me ${this.myTurn() ? 'active' : ''}`;
        $('#me').innerHTML = `
            <div class="me-head">
                <span class="me-name">${escapeHtml(me.name)}</span>
                <span class="me-chips" title="チップ">${chipIcon()}<b>${me.chips}</b></span>
                <span class="me-score">得点 <b>${score}</b><small>${me.cardPoints} − ${me.chips}</small></span>
            </div>
            <div class="runs">${me.cards.length > 0 ? runsHtml(me.cards, view.current) : '<span class="empty-runs">まだカードはありません</span>'}</div>`;
    }

    renderActions() {
        const view = this.view;
        let html = '';
        if (this.myTurn()) {
            const chips = view.players[view.you].chips;
            html = chips === 0
                ? `<span class="act-label">チップがないので取ります</span>`
                : `<button class="btn primary" data-act="pass">ノーサンキュー<span class="cost">${chipIcon()}−1</span></button>
                   <button class="btn take" data-act="take">取る</button>`;
        } else if (view.phase === 'play') {
            html = `<span class="act-label muted">${escapeHtml(view.players[view.turn].name)}の番</span>`;
        }
        $('#actions').innerHTML = html;
        if (this.hint) $(`#actions [data-act="${this.hint}"]`)?.classList.add('suggested');
    }

    // ---- 結果 ----

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end' || $('#result').open) return;
        const ranked = [...view.results].sort((a, b) => a.score - b.score);
        const youWon = view.winners.includes(view.you);
        $('#result-title').textContent = youWon
            ? (view.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち')
            : `${view.winners.map(id => view.players[id].name).join('と')}の勝ち`;
        $('#result-list').innerHTML = ranked.map(r => `<li class="${view.winners.includes(r.seat) ? 'winner' : ''} ${r.seat === view.you ? 'mine' : ''}">
            <span class="r-name">${escapeHtml(view.players[r.seat].name)}</span>
            <span class="runs">${runsHtml(r.cards)}</span>
            <span class="r-calc">${r.cardPoints} − ${chipIcon()}${r.chips}</span><b class="r-score">${r.score}</b></li>`).join('');
        $('#result-removed').textContent = `除かれていた9枚：${view.removed.join('・')}`;
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
