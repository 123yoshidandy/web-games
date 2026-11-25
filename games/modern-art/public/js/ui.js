/**
 * 画面（タイトル・ゲーム・回の結果・記録・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { CARDS, ARTISTS, TYPES, END_COUNT, ROUNDS } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, cardHtml, artistMark, typeIcon } from './art.js';
import { helpHtml, titleArtHtml } from './help.js';

const SETTINGS_KEY = 'modern-art.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン'];
export const COLORS = ['#e05d4f', '#4f8fe0', '#59b36b', '#d9a43a', '#a46fd6'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const artistOf = (card) => CARDS[card].artist;
const sortHand = (hand) => [...hand].sort((a, b) => CARDS[a].artist - CARDS[b].artist || a - b);

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [3, 4, 5].includes(saved.count) ? saved.count : 4, level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy' };
    } catch {
        return { count: 4, level: 'easy' };
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
        this.selected = null;        // 手札で選んだカード
        this.amount = 0;             // 付ける値
        this.amountKey = null;       // 値を初めに合わせた競り（変わったら合わせ直す）
        this.seenCommands = 0;
        this.shownRounds = 0;
        this.resultShown = false;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
        this.bindStatic();
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
                onUpdate: () => this.render(),
                onError: (message) => this.toast(message)
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.selected = null;
        this.amountKey = null;
        this.shownRounds = this.controller.game.history.length;
        this.resultShown = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    send(command) {
        if (!this.controller) return false;
        const ok = this.controller.send(command);
        if (ok) this.selected = null;
        return ok;
    }

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#cpu-level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSetup();
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
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#hand').addEventListener('click', (event) => {
            const el = event.target.closest('[data-card]');
            if (el) this.pressCard(Number(el.dataset.card));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act, button.dataset);
        });
        // 回の結果を見ている間は CPU を待たせ、閉じたら続ける。最後の回なら、続けて終わりの結果を出す
        $('#round').addEventListener('close', () => {
            this.controller?.setHold(false);
            if (this.view?.phase === 'end') this.showResult();
        });
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // ---- 操作 ----

    myAct(view = this.view) {
        return view && view.actors.includes(view.you);
    }

    // 手札で選べるカード
    selectable(view) {
        if (!this.myAct(view)) return [];
        const hand = view.players[view.you].hand;
        if (view.phase === 'play') return hand;
        if (view.phase === 'double') {
            const first = view.lot.cards[0];
            return hand.filter(c => artistOf(c) === artistOf(first) && CARDS[c].type !== 'double');
        }
        return [];
    }

    pressCard(cardId) {
        const view = this.view;
        if (!view) return;
        if (!this.selectable(view).includes(cardId)) {
            const card = CARDS[cardId];
            this.toast(`${ARTISTS[card.artist].name}・${TYPES[card.type].name}：${TYPES[card.type].text}`);
            return;
        }
        this.selected = this.selected === cardId ? null : cardId;
        this.render();
    }

    act(action, data) {
        const view = this.view;
        switch (action) {
            case 'play': if (this.selected !== null) this.send({ type: 'play', card: this.selected }); break;
            case 'second': if (this.selected !== null) this.send({ type: 'second', card: this.selected }); break;
            case 'no-second': this.send({ type: 'second', card: null }); break;
            case 'step': {
                const { min, max } = this.amountRange(view);
                this.amount = Math.min(max, Math.max(min, this.amount + Number(data.d)));
                this.renderActions(view);
                break;
            }
            case 'bid': this.send({ type: 'bid', amount: this.amount }); break;
            case 'pass': this.send({ type: 'pass' }); break;
            case 'price': this.send({ type: 'price', amount: this.amount }); break;
            case 'buy': this.send({ type: 'buy' }); break;
        }
    }

    // 付けられる値の範囲
    amountRange(view) {
        const money = view.players[view.you].money;
        const a = view.auction;
        if (!a) return { min: 0, max: 0 };
        if (a.type === 'sealed') return { min: 0, max: money };
        if (a.type === 'fixed') return { min: money > 0 ? 1 : 0, max: money };
        return { min: Math.min(money, a.high + 1), max: money };
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        if (this.selected !== null && !this.selectable(view).includes(this.selected)) this.selected = null;
        // 競りが変わったら、付ける値を合わせ直す
        const key = view.auction ? `${view.lot.cards.join(',')}:${view.auction.type}:${view.auction.high}:${view.auction.price}` : null;
        if (key !== this.amountKey) {
            this.amountKey = key;
            if (view.auction) {
                const { min, max } = this.amountRange(view);
                const suggest = view.auction.type === 'fixed' ? 20 : view.auction.type === 'sealed' ? 10 : view.auction.high + 1;
                this.amount = Math.min(max, Math.max(min, suggest));
            }
        }
        this.renderStatus(view);
        this.renderMarket(view);
        this.renderPlayers(view);
        this.renderStage(view);
        this.renderHand(view);
        this.renderActions(view);
        if ($('#log').open) this.renderLog();
        this.checkRound(view);
    }

    // 回が終わったら結果を出す（CPU は閉じるまで待つ）
    checkRound(view) {
        if (view.history.length > this.shownRounds) {
            this.shownRounds = view.history.length;
            this.showRound(view, view.history.at(-1));
            return;
        }
        if (view.phase === 'end' && !$('#round').open && !this.resultShown) this.showResult();
    }

    statusText(view) {
        const name = (s) => (s === view.you ? 'あなた' : escapeHtml(view.players[s].name));
        const a = view.auction;
        if (view.phase === 'end') return '<span class="who">終わり</span>';
        if (view.phase === 'play') return view.auctioneer === view.you ? '<span class="who me">あなたが出す番</span>' : `<span class="who">${name(view.auctioneer)}が出す番</span>`;
        if (view.phase === 'double') return view.lot.offer === view.you ? '<span class="who me">ダブル：2枚目を足すか</span>' : `<span class="who">ダブル：${name(view.lot.offer)}が考え中</span>`;
        const type = `<span class="tname">${typeIcon(a.type)}${TYPES[a.type].name}</span>`;
        if (a.type === 'sealed') return `${type}<span class="who${this.myAct(view) ? ' me' : ''}">${this.myAct(view) ? '値を握る' : '開くのを待っています'}</span>`;
        if (a.type === 'fixed' && a.price === null) return `${type}<span class="who">${name(view.lot.seller)}が値を決める</span>`;
        return `${type}<span class="who${a.turn === view.you ? ' me' : ''}">${a.turn === view.you ? 'あなたの番' : `${name(a.turn)}の番`}</span>`;
    }

    renderStatus(view) {
        $('#status').innerHTML = `<span class="round">第${Math.min(view.round, ROUNDS)}回</span>${this.statusText(view)}`;
    }

    renderMarket(view) {
        $('#market').innerHTML = ARTISTS.map((artist, i) => {
            const total = view.tokens.reduce((s, row) => s + row[i], 0);
            const pips = Array.from({ length: END_COUNT }, (_, k) => `<i class="${k < view.counts[i] ? 'on' : ''}"></i>`).join('');
            const tokens = view.tokens.map((row, r) => `<span class="${r + 1 === view.round ? 'now' : ''}">${row[i] || '·'}</span>`).join('');
            return `<div class="artist" style="--c:${artist.color};--d:${artist.deep}">
                <div class="a-head">${artistMark(i, 14)}<b>${artist.short}</b></div>
                <div class="pips">${pips}</div>
                <div class="tokens">${tokens}</div>
                <div class="a-total">${total}</div>
            </div>`;
        }).join('');
    }

    renderPlayers(view) {
        $('#players').style.setProperty('--n', view.players.length);
        $('#players').classList.toggle('n5', view.players.length >= 5);
        $('#players').innerHTML = view.players.map((p, i) => {
            const won = ARTISTS.map((artist, a) => {
                const n = p.won.filter(c => artistOf(c) === a).length;
                return n ? `<span class="w" style="--c:${artist.color}">${n}</span>` : '';
            }).join('');
            const acting = view.actors.includes(i);
            const sealed = view.auction?.type === 'sealed' && view.auction.sealedDone[i];
            const money = p.money === null ? '?' : p.money;
            return `<div class="pl${acting ? ' acting' : ''}${i === view.you ? ' me' : ''}" style="--c:${COLORS[i]}">
                <div class="pl-top"><span class="pl-name">${escapeHtml(p.name)}</span>${sealed ? '<span class="fist" title="握った">✓</span>' : ''}</div>
                <div class="pl-bottom"><b class="pl-money">${money}</b><span class="pl-hand">${p.handCount}枚</span><span class="pl-won">${won}</span></div>
            </div>`;
        }).join('');
    }

    renderStage(view) {
        const name = (s) => (s === view.you ? 'あなた' : escapeHtml(view.players[s].name));
        let html = '';
        if (view.lot) {
            const a = view.auction;
            const lines = [];
            if (view.phase === 'double') lines.push(`${name(view.lot.first)}がダブルを出した。同じ画家の2枚目を足した人が売る`);
            if (a) {
                lines.push(TYPES[a.type].text);
                if (a.type === 'open' || a.type === 'once') {
                    lines.push(a.highBidder >= 0 ? `<b class="big">${a.high}</b>　${name(a.highBidder)}` : 'まだ値が付いていない');
                    if (a.passed.length) lines.push(`降りた：${a.passed.map(name).join('・')}`);
                }
                if (a.type === 'fixed' && a.price !== null) lines.push(`値 <b class="big">${a.price}</b>`);
                if (a.type === 'sealed' && a.mySealed !== null) lines.push(`あなたは ${a.mySealed || '入れない'} を握った`);
            }
            html = `<div class="lot">${view.lot.cards.map(c => cardHtml(c, { cls: 'big' })).join('')}</div>
                <div class="lot-info"><div class="seller">売る人：${name(view.lot.seller)}</div>${lines.map(l => `<p>${l}</p>`).join('')}</div>`;
        } else if (view.last) {
            const l = view.last;
            let text;
            if (l.winner < 0) text = `${name(l.taker)}が無料でもらった`;
            else if (l.toBank) text = `${name(l.taker)}が <b class="big">${l.price}</b> で買った（銀行に払う）`;
            else text = `${name(l.taker)}が <b class="big">${l.price}</b> で買った（${name(l.seller)}に払う）`;
            const bids = l.bids ? `<p class="bids">${l.bids.map((b, s) => `${name(s)} ${b || '−'}`).join('・')}</p>` : '';
            html = `<div class="lot past">${l.cards.map(c => cardHtml(c, { cls: 'big' })).join('')}</div>
                <div class="lot-info"><div class="seller">前の競り（${TYPES[l.type].name}）</div><p>${text}</p>${bids}</div>`;
        } else {
            html = `<div class="lot-info empty"><p>第${Math.min(view.round, ROUNDS)}回</p></div>`;
        }
        $('#stage').innerHTML = html;
    }

    renderHand(view) {
        const me = view.players[view.you];
        const can = this.selectable(view);
        const hand = sortHand(me.hand);
        $('#hand').style.setProperty('--count', Math.max(hand.length, 1));
        $('#hand').innerHTML = hand.length
            ? hand.map(c => cardHtml(c, { cls: [can.includes(c) ? 'can' : '', this.selected === c ? 'sel' : ''].join(' ') })).join('')
            : '<span class="none">手札なし</span>';
    }

    renderActions(view) {
        const me = view.players[view.you];
        const a = view.auction;
        let html = '';
        const stepper = () => `<div class="stepper">
            <button class="step" data-act="step" data-d="-10">−10</button><button class="step" data-act="step" data-d="-1">−1</button>
            <span class="amount">${this.amount}</span>
            <button class="step" data-act="step" data-d="1">+1</button><button class="step" data-act="step" data-d="10">+10</button></div>`;
        if (this.myAct(view)) {
            if (view.phase === 'play') {
                html = `<span class="hint">${this.selected === null ? '出す絵を選ぶ' : `${ARTISTS[artistOf(this.selected)].name}・${TYPES[CARDS[this.selected].type].name}`}</span>
                    <button class="btn primary" data-act="play"${this.selected === null ? ' disabled' : ''}>出す</button>`;
            } else if (view.phase === 'double') {
                html = `<span class="hint">${this.selectable(view).length ? '足す絵を選ぶ' : '足せる絵がない'}</span>
                    <button class="btn primary" data-act="second"${this.selected === null ? ' disabled' : ''}>足す</button>
                    <button class="btn secondary" data-act="no-second">足さない</button>`;
            } else if (a.type === 'fixed' && a.price === null) {
                html = `${stepper()}<button class="btn primary" data-act="price">この値</button>`;
            } else if (a.type === 'fixed') {
                html = `<span class="hint">値 ${a.price}・所持金 ${me.money}</span>
                    <button class="btn primary" data-act="buy"${a.price > me.money ? ' disabled' : ''}>買う</button>
                    <button class="btn secondary" data-act="pass">断る</button>`;
            } else if (a.type === 'sealed') {
                html = `${stepper()}<button class="btn primary" data-act="bid">${this.amount ? '握る' : '入れない'}</button>`;
            } else {
                const { min, max } = this.amountRange(view);
                html = `${stepper()}<button class="btn primary" data-act="bid"${min > max || this.amount <= a.high ? ' disabled' : ''}>入札</button>
                    <button class="btn secondary" data-act="pass">降りる</button>`;
            }
        } else if (view.phase !== 'end') {
            html = `<span class="hint muted">所持金 ${me.money}</span>`;
        }
        $('#actions').innerHTML = html;
    }

    // ---- ダイアログ ----

    showRound(view, h) {
        const name = (s) => (s === view.you ? 'あなた' : escapeHtml(view.players[s].name));
        $('#round-title').textContent = `第${h.round}回の結果`;
        const ranks = ARTISTS.map((artist, a) => {
            const place = h.rank.indexOf(a);
            return `<tr class="${place >= 0 ? 'ranked' : ''}"><th>${artistMark(a, 16)}${artist.name}</th><td>${h.counts[a]}枚</td><td>${place >= 0 ? `${place + 1}位` : '−'}</td><td class="val">${h.values[a]}</td></tr>`;
        }).join('');
        const paid = h.paid.map((v, s) => `<li><span class="dot" style="--c:${COLORS[s]}"></span>${name(s)}<b>${v ? `+${v}` : '0'}</b></li>`).join('');
        $('#round-body').innerHTML = `<table class="rtable"><thead><tr><th>画家</th><th>出た</th><th>順位</th><th>1枚</th></tr></thead><tbody>${ranks}</tbody></table>
            <p class="note">1枚の値は、3位までの画家だけ、これまでの回の合計。</p>
            <ul class="paid">${paid}</ul>`;
        this.controller.setHold(true);
        $('#round').showModal();
    }

    showLog() {
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        if (!this.view) return;
        $('#log-list').innerHTML = this.view.logs.map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    showResult() {
        const view = this.controller?.getView();
        if (!view || this.resultShown) return;
        this.resultShown = true;
        const won = view.winners.includes(view.you);
        $('#result-title').textContent = won ? (view.winners.length > 1 ? '引き分け（勝ち）' : 'あなたの勝ち') : `${view.winners.map(i => view.players[i].name).join('・')}の勝ち`;
        const order = view.players.map((_, i) => i).sort((a, b) => view.players[b].money - view.players[a].money);
        const head = view.history.map(h => `<th>${h.round}回</th>`).join('');
        const rows = order.map(i => {
            const cls = [view.winners.includes(i) ? 'win' : '', i === view.you ? 'you' : ''].join(' ');
            return `<tr class="${cls}"><th><span class="dot" style="--c:${COLORS[i]}"></span>${escapeHtml(view.players[i].name)}</th>${view.history.map(h => `<td>${h.paid[i]}</td>`).join('')}<td class="total">${view.players[i].money}</td></tr>`;
        }).join('');
        $('#result-table').innerHTML = `<table><thead><tr><th></th>${head}<th>所持金</th></tr></thead><tbody>${rows}</tbody></table>
            <p class="note">各回の数は、絵を売った額。</p>`;
        $('#result').showModal();
    }

    toast(message) {
        const toast = $('#toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    }
}
