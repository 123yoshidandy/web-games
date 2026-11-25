/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { ESTABLISHMENTS, ESTABLISHMENT_ORDER, LANDMARKS, LANDMARK_ORDER, COLOR_NAMES, rollText } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, cardHtml, chipHtml, landmarkHtml, artSvg, coinHtml, dieHtml, icon } from './art.js';

const SETTINGS_KEY = 'machi-koro.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 900;
const FLOAT_MS = 1100;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4].includes(saved.count) ? saved.count : 3,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 3, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

const cardInfo = (key) => ESTABLISHMENTS[key] ?? LANDMARKS[key];

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.openedPrompt = null;   // 自動で開いた選択（テレビ局・ビジネスセンター）。閉じても同じ選択では開き直さない
        this.tradePick = { take: null, give: null };
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.renderTitleArt();
        this.renderHelp();
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
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.openedPrompt = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
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
        clearTimeout(this.resultTimer);
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#fx').innerHTML = '';
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
        $('#status').addEventListener('click', () => this.showLog());

        // ダイアログは外側のタップと「閉じる」で閉じる（終わりの画面は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#market').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.showCardDetail(card.dataset.card);
        });
        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.showCardDetail(card.dataset.card);
        });
        $('#opponents').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-player]');
            if (chip) this.showPlayerDetail(Number(chip.dataset.player));
        });
        $('#player-detail-body').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.showCardDetail(card.dataset.card, { readOnly: true });
        });
        $('#card-detail-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            $('#card-detail').close();
            if (button.dataset.build) this.send({ type: 'build', card: button.dataset.build });
        });
        $('#tv-players').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-player]');
            if (!button || !this.myTurn('tv')) return;
            $('#tv').close();
            this.send({ type: 'tv', target: Number(button.dataset.player) });
        });
        $('#trade').addEventListener('click', (event) => {
            const pick = event.target.closest('[data-pick]');
            if (!pick) return;
            const [side, value] = [pick.dataset.side, pick.dataset.pick];
            this.tradePick[side] = this.tradePick[side] === value ? null : value;
            this.renderTrade();
        });
        $('#trade-ok').addEventListener('click', () => {
            const { take, give } = this.tradePick;
            if (!take || !give || !this.myTurn('trade')) return;
            const [target, card] = take.split(':');
            $('#trade').close();
            this.send({ type: 'trade', give, target: Number(target), take: card });
        });
        $('#trade-skip').addEventListener('click', () => {
            $('#trade').close();
            if (this.myTurn('trade')) this.send({ type: 'skipTrade' });
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act);
        });
    }

    send(command) {
        this.controller?.send(command);
    }

    myTurn(phase) {
        const v = this.view;
        return !!v && v.current === v.you && v.winner === null && (!phase || v.phase === phase);
    }

    act(action) {
        switch (action) {
            case 'roll1': return this.send({ type: 'roll', dice: 1 });
            case 'roll2': return this.send({ type: 'roll', dice: 2 });
            case 'reroll': return this.send({ type: 'reroll' });
            case 'keep': return this.send({ type: 'keep' });
            case 'pass': return this.send({ type: 'pass' });
            case 'tv': return this.openTv();
            case 'trade': return this.openTrade();
        }
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        const keys = ['wheat', 'ranch', 'bakery', 'cafe', 'apple'];
        $('#title-art').innerHTML = keys.map((key, i) => `<div class="fan" style="--i:${i - 2}">${cardHtml(key)}</div>`).join('');
    }

    renderHelp() {
        $('#help-cards').innerHTML = ESTABLISHMENT_ORDER.map(key => {
            const c = ESTABLISHMENTS[key];
            return `<li>${chipHtml(key, 1)}<div><strong>${c.name}</strong><span class="meta">${COLOR_NAMES[c.color]}・目 ${rollText(key)}・${c.cost}コイン・${c.count}枚</span><br>${c.text}</div></li>`;
        }).join('');
        $('#help-landmarks').innerHTML = LANDMARK_ORDER.map(key => {
            const l = LANDMARKS[key];
            return `<li><div class="chip landmark-chip">${artSvg(key)}</div><div><strong>${l.name}</strong><span class="meta">${l.cost}コイン</span><br>${l.text}</div></li>`;
        }).join('');
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const prev = this.view;
        const view = this.controller.getView();
        this.view = view;
        this.renderOpponents(view);
        this.renderStatus(view);
        this.renderMarket(view);
        this.renderMe(view);
        this.renderActions(view);
        this.playEvents(view, prev);
        this.updatePrompts(view);
        if ($('#log').open) this.renderLog();
        if (view.winner !== null && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    renderOpponents(view) {
        $('#opponents').dataset.count = String(view.players.length - 1);
        $('#opponents').innerHTML = view.players.filter(p => p.id !== view.you).map(p => `
            <button class="opponent ${p.id === view.current && view.winner === null ? 'current' : ''}" data-player="${p.id}">
                <span class="op-name">${escapeHtml(p.name)}</span>
                <span class="op-coins" data-coins="${p.id}">${coinHtml(p.coins)}</span>
                <span class="op-lms">${LANDMARK_ORDER.map(k => `<i class="${p.landmarks[k] ? 'on' : ''}"></i>`).join('')}</span>
            </button>`).join('');
    }

    renderStatus(view) {
        const dice = view.dice.length ? view.dice.map(dieHtml).join('') : '';
        const last = view.logs.at(-1) ?? '';
        $('#status').innerHTML = `<span class="dice">${dice}</span><span class="last">${escapeHtml(last)}</span>${icon('log')}`;
    }

    renderMarket(view) {
        const can = new Set(view.buildable);
        $('#market').innerHTML = ESTABLISHMENT_ORDER.map(key => cardHtml(key, {
            stock: view.supply[key],
            cls: [can.has(key) ? 'can' : '', view.supply[key] ? '' : 'soldout'].join(' ')
        })).join('');
    }

    // 直前に振った目で、自分の施設のうち働いたもの
    hitCards(view, seat) {
        const events = view.events;
        const start = events.findLastIndex(e => e.type === 'roll');
        if (start < 0 || !view.dice.length) return new Set();
        return new Set(events.slice(start).filter(e => e.type === 'pay' && e.to === seat).map(e => e.card));
    }

    renderMe(view) {
        const me = view.players[view.you];
        const can = new Set(view.buildable);
        $('#my-landmarks').innerHTML = LANDMARK_ORDER.map(key => landmarkHtml(key, me.landmarks[key], { cls: can.has(key) ? 'can' : '' })).join('');
        const hits = this.hitCards(view, view.you);
        $('#my-cards').innerHTML = ESTABLISHMENT_ORDER.filter(k => me.cards[k]).map(k => chipHtml(k, me.cards[k]).replace('class="chip ', `class="chip ${hits.has(k) ? 'hit ' : ''}`)).join('');
    }

    renderActions(view) {
        const me = view.players[view.you];
        const coins = `<div class="my-coins" data-coins="${view.you}">${coinHtml(me.coins, 'big')}</div>`;
        let buttons = '';
        if (view.winner !== null) {
            buttons = '';
        } else if (view.current !== view.you) {
            buttons = `<span class="waiting">${escapeHtml(view.players[view.current].name)}の番</span>`;
        } else if (view.phase === 'roll') {
            buttons = view.canRollTwo
                ? `<button class="btn primary" data-act="roll1">${dieHtml(1)}1個</button><button class="btn primary" data-act="roll2">${dieHtml(1)}${dieHtml(1)}2個</button>`
                : `<button class="btn primary wide" data-act="roll1">${dieHtml(1)}振る</button>`;
        } else if (view.phase === 'reroll') {
            buttons = '<button class="btn secondary" data-act="reroll">振り直す</button><button class="btn primary" data-act="keep">このまま</button>';
        } else if (view.phase === 'tv') {
            buttons = '<button class="btn primary wide" data-act="tv">テレビ局</button>';
        } else if (view.phase === 'trade') {
            buttons = '<button class="btn primary wide" data-act="trade">ビジネスセンター</button>';
        } else if (view.phase === 'build') {
            buttons = '<button class="btn ghost wide" data-act="pass">建てない</button>';
        }
        $('#actions').innerHTML = `${coins}<div class="act-buttons">${buttons}</div>`;
    }

    // テレビ局とビジネスセンターは、その選択になったら一度だけ自動で開く
    updatePrompts(view) {
        const key = this.myTurn() && (view.phase === 'tv' || view.phase === 'trade') ? `${view.turn}:${view.phase}` : null;
        if (!key) {
            if ($('#tv').open) $('#tv').close();
            if ($('#trade').open) $('#trade').close();
            return;
        }
        if (this.openedPrompt === key) return;
        this.openedPrompt = key;
        if (view.phase === 'tv') this.openTv();
        else {
            this.tradePick = { take: null, give: null };
            this.openTrade();
        }
    }

    openTv() {
        const v = this.view;
        $('#tv-players').innerHTML = v.tvTargets.map(id => {
            const p = v.players[id];
            return `<button class="pick" data-player="${id}"><span>${escapeHtml(p.name)}</span>${coinHtml(p.coins)}</button>`;
        }).join('');
        if (!$('#tv').open) $('#tv').showModal();
    }

    openTrade() {
        this.renderTrade();
        if (!$('#trade').open) $('#trade').showModal();
    }

    renderTrade() {
        const v = this.view;
        if (!v) return;
        const tradeable = (p) => ESTABLISHMENT_ORDER.filter(k => p.cards[k] && ESTABLISHMENTS[k].color !== 'purple');
        const pickChip = (side, value, key, count) => `<button class="pick-chip ${this.tradePick[side] === value ? 'picked' : ''}" data-side="${side}" data-pick="${value}" aria-label="${ESTABLISHMENTS[key].name}">${chipHtml(key, count)}</button>`;
        $('#trade-take').innerHTML = v.players.filter(p => p.id !== v.you).map(p => `
            <div class="trade-row"><span class="trade-owner">${escapeHtml(p.name)}</span>
            <div class="trade-chips">${tradeable(p).map(k => pickChip('take', `${p.id}:${k}`, k, p.cards[k])).join('')}</div></div>`).join('');
        const me = v.players[v.you];
        $('#trade-give').innerHTML = `<div class="trade-chips">${tradeable(me).map(k => pickChip('give', k, k, me.cards[k])).join('')}</div>`;
        $('#trade-ok').disabled = !(this.tradePick.take && this.tradePick.give);
    }

    // ---- 説明のシート ----

    showCardDetail(key, { readOnly = false } = {}) {
        const v = this.view;
        if (!v) return;
        const info = cardInfo(key);
        const isLandmark = !!LANDMARKS[key];
        const art = isLandmark ? `<div class="landmark-big">${artSvg(key)}</div>` : cardHtml(key, { stock: v.supply[key], cls: 'big' });
        const meta = isLandmark ? `${info.cost}コイン` : `${COLOR_NAMES[info.color]}・目 ${rollText(key)}・${info.cost}コイン・残り${v.supply[key]}`;
        $('#card-detail-body').innerHTML = `${art}<h2 tabindex="-1" autofocus>${info.name}</h2><p class="meta">${meta}</p><p>${info.text}</p>`;
        const canBuild = !readOnly && v.buildable.includes(key);
        $('#card-detail-buttons').innerHTML = canBuild
            ? `<button class="btn primary" data-build="${key}">建てる</button><button class="btn secondary">閉じる</button>`
            : '<button class="btn secondary">閉じる</button>';
        if ($('#player-detail').open) $('#player-detail').close();
        $('#card-detail').showModal();
    }

    showPlayerDetail(seat) {
        const p = this.view.players[seat];
        $('#player-detail-name').innerHTML = `${escapeHtml(p.name)}${coinHtml(p.coins)}`;
        $('#player-detail-body').innerHTML = `
            <div class="landmarks">${LANDMARK_ORDER.map(k => landmarkHtml(k, p.landmarks[k])).join('')}</div>
            <div class="chips">${ESTABLISHMENT_ORDER.filter(k => p.cards[k]).map(k => chipHtml(k, p.cards[k])).join('')}</div>`;
        $('#player-detail').showModal();
    }

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-120).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    showResult() {
        const v = this.view;
        if (!v || v.winner === null) return;
        const winner = v.players[v.winner];
        $('#result-title').textContent = v.winner === v.you ? 'あなたの勝ち' : `${winner.name}の勝ち`;
        const ranked = [...v.players].sort((a, b) => (b.id === v.winner) - (a.id === v.winner) || (b.built - a.built) || (b.coins - a.coins));
        $('#result-list').innerHTML = ranked.map(p => `
            <li class="${p.id === v.you ? 'you' : ''}"><span class="name">${escapeHtml(p.name)}</span>
            <span class="op-lms">${LANDMARK_ORDER.map(k => `<i class="${p.landmarks[k] ? 'on' : ''}"></i>`).join('')}</span>${coinHtml(p.coins)}</li>`).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        const deltas = new Map();
        const add = (seat, amount) => deltas.set(seat, (deltas.get(seat) ?? 0) + amount);
        fresh.forEach(e => {
            if (e.type === 'pay' && e.amount > 0) {
                add(e.to, e.amount);
                if (e.from !== null) add(e.from, -e.amount);
            }
            if (e.type === 'build') {
                add(e.seat, -e.cost);
                const el = e.landmark && e.seat === view.you ? $(`#my-landmarks [data-card="${e.card}"]`) : $(`#market [data-card="${e.card}"]`);
                el?.classList.add('bought');
            }
            if (e.type === 'trade') this.toast(`${view.players[e.seat].name}：${ESTABLISHMENTS[e.give].name} ⇄ ${view.players[e.target].name}の${ESTABLISHMENTS[e.take].name}`);
            if (e.type === 'turn' && e.again) this.toast(`ゾロ目：${view.players[e.seat].name}がもう1回`);
        });
        if (fresh.some(e => e.type === 'roll')) $('#status .dice')?.classList.add('rolled');
        deltas.forEach((amount, seat) => { if (amount) this.floatText(seat, amount); });
    }

    floatText(seat, amount) {
        const target = $(`[data-coins="${seat}"]`);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = `float ${amount > 0 ? 'plus' : 'minus'}`;
        el.textContent = amount > 0 ? `+${amount}` : `−${-amount}`;
        el.style.left = `${rect.left + rect.width / 2}px`;
        el.style.top = `${rect.top}px`;
        $('#fx').appendChild(el);
        setTimeout(() => el.remove(), reduceMotion() ? 600 : FLOAT_MS);
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
