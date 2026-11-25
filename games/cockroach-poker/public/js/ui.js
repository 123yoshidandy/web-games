/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { KINDS, KIND_ORDER } from './kinds.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, cardHtml, backHtml, kindTag, critter, icon } from './art.js';

const SETTINGS_KEY = 'cockroach-poker.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン', 'ユイ'];
const RESULT_DELAY_MS = 1400;
const FLY_MS = 520;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const countOf = (list, item) => list.filter(x => x === item).length;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5, 6].includes(saved.count) ? saved.count : 4,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
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
        this.lastSeq = 0;
        this.pick = { card: null, target: null }; // 渡す・回すときに選んでいるもの
        this.pickKey = null;                      // 選んでいる場面（変わったら選び直す）
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
        this.pickKey = null;
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
        this.resultTimer = null;
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
        $('#open-log').addEventListener('click', () => this.showLog());

        // ダイアログは外側のタップと「閉じる」で閉じる（終わりは、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#opponents').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-player]');
            if (!tile || !tile.classList.contains('targetable')) return;
            const target = Number(tile.dataset.player);
            this.pick.target = this.pick.target === target ? null : target;
            this.render();
        });
        $('#my-hand').addEventListener('click', (event) => {
            const slot = event.target.closest('[data-kind]');
            if (!slot || !this.myPrompt('give') || slot.classList.contains('empty')) return;
            const kind = slot.dataset.kind;
            this.pick.card = this.pick.card === kind ? null : kind;
            this.render();
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            const { claim, answer } = button.dataset;
            if (claim) return this.declare(claim);
            if (answer === 'peek') return this.send({ type: 'peek' });
            if (answer) this.send({ type: 'answer', truth: answer === 'true' });
        });
    }

    send(command) {
        this.controller?.send(command);
    }

    // 自分が操作する番か
    myPrompt(phase) {
        const v = this.view;
        return !!v && v.phase === phase && v.answering.includes(v.you);
    }

    // 言う虫を決めて、渡すか回す
    declare(claim) {
        const { card, target } = this.pick;
        if (this.myPrompt('give') && card && target !== null) this.send({ type: 'give', card, target, claim });
        else if (this.myPrompt('pass') && target !== null) this.send({ type: 'pass', target, claim });
    }

    // 渡せる相手（親は自分以外の全員、回すときは見ていない人）
    targetSeats(view) {
        if (this.myPrompt('give')) return view.players.filter(p => p.id !== view.you).map(p => p.id);
        if (this.myPrompt('pass')) return view.passTargets;
        return [];
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        const fan = ['frog', 'rat', 'cockroach', 'spider', 'bat'];
        $('#title-art').innerHTML = fan.map((kind, i) => `<div class="fan" style="--i:${i - 2}">${cardHtml(kind)}</div>`).join('');
    }

    renderHelp() {
        $('#help-kinds').innerHTML = KIND_ORDER.map(kind => `<li>${kindTag(kind)}</li>`).join('');
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const prev = this.view;
        const view = this.controller.getView();
        this.view = view;
        this.syncPick(view);
        $('#rule').textContent = view.removedCount
            ? `同じ虫${view.limit}枚で負け・除いた${view.removedCount}枚`
            : `同じ虫${view.limit}枚で負け`;
        this.renderOpponents(view);
        this.renderStage(view);
        this.renderMe(view);
        this.renderActions(view);
        this.playEvents(view, prev);
        if ($('#log').open) this.renderLog();
        if (view.loser !== null && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    // 場面が変わったら選び直す。相手が1人しかいなければ、その人を選んでおく
    syncPick(view) {
        const key = `${view.roundNumber}:${view.phase}:${view.round?.chain.length ?? 0}`;
        if (key !== this.pickKey) {
            this.pickKey = key;
            this.pick = { card: null, target: null };
        }
        const targets = this.targetSeats(view);
        if (!targets.includes(this.pick.target)) this.pick.target = null;
        if (targets.length === 1) this.pick.target = targets[0];
        if (this.pick.card && !view.players[view.you].hand.includes(this.pick.card)) this.pick.card = null;
    }

    // 前に置いたカードの一覧（虫ごとの枚数。負けに近いものは色を変える）
    tableHtml(view, p, { all = false } = {}) {
        return KIND_ORDER.map(kind => {
            const n = countOf(p.table, kind);
            if (!n && !all) return '';
            const level = n >= view.limit - 1 ? 'danger' : n === view.limit - 2 ? 'warn' : '';
            return `<span class="chip ${n ? level : 'zero'}" style="--kc:${KINDS[kind].color}" title="${KINDS[kind].name}">${critter(kind)}<b>${n}</b></span>`;
        }).join('');
    }

    renderOpponents(view) {
        const others = view.players.filter(p => p.id !== view.you);
        const r = view.round;
        const targets = new Set(this.targetSeats(view));
        const acting = new Set(view.answering);
        $('#opponents').dataset.count = String(others.length);
        $('#opponents').innerHTML = others.map(p => {
            const cls = [
                p.id === view.current && view.loser === null ? 'current' : '',
                acting.has(p.id) ? 'thinking' : '',
                targets.has(p.id) ? 'targetable' : '',
                this.pick.target === p.id ? 'chosen' : '',
                r && r.to === p.id ? 'holding' : '',
                r && r.seen.includes(p.id) ? 'seen' : '',
                view.loser === p.id ? 'lost' : ''
            ].join(' ');
            return `<button class="opponent ${cls}" data-player="${p.id}">
                <span class="op-head"><span class="op-name">${escapeHtml(p.name)}</span><span class="op-hand">${backHtml('tiny')}${p.handCount}</span></span>
                <span class="op-table">${this.tableHtml(view, p)}</span>
                ${r && r.seen.includes(p.id) ? `<span class="seen-mark" title="見た">${icon('eye')}</span>` : ''}
            </button>`;
        }).join('');
    }

    renderStage(view) {
        const r = view.round;
        const name = (seat) => (seat === view.you ? 'あなた' : escapeHtml(view.players[seat].name));
        let main = '';
        if (r) {
            const flow = `${name(r.from)}<span class="arrow">→</span>${name(r.to)}`;
            const card = r.card ? cardHtml(r.card, { cls: 'stage-card' }) : backHtml('stage-card');
            main = `<div class="st-flow">${flow}</div>
                <div class="st-play">${card}<div class="st-claim"><span>これは</span>${kindTag(r.claim)}</div></div>`;
        } else if (this.myPrompt('give') && this.pick.card) {
            // 渡そうとしているカードと相手
            const to = this.pick.target === null ? '？' : name(this.pick.target);
            main = `<div class="st-flow">あなた<span class="arrow">→</span>${to}</div>
                <div class="st-play">${cardHtml(this.pick.card, { cls: 'stage-card' })}</div>`;
        } else if (view.history.length) {
            // 前の回の結果
            const h = view.history.at(-1);
            const last = h.chain.at(-1);
            main = `<div class="st-flow">${name(last.from)}「${KINDS[last.claim].name}」<span class="arrow">→</span>${name(h.answerer)}「${h.said ? '本当' : 'うそ'}」</div>
                <div class="st-play">${cardHtml(h.card, { cls: 'stage-card' })}
                <div class="st-result ${h.correct ? 'hit' : 'miss'}">${h.correct ? '当たり' : '外れ'}<small>${name(h.taker)}が引き取り</small></div></div>`;
        }
        let note = '';
        const me = view.you;
        const actor = view.answering[0];
        if (view.loser !== null) note = '';
        else if (view.phase === 'give') {
            if (actor !== me) note = `${name(actor)}が親`;
            else if (!this.pick.card) note = '渡すカードを選ぶ';
            else if (this.pick.target === null) note = '渡す相手を選ぶ';
            else note = '何と言って渡す？';
        } else if (view.phase === 'respond') note = actor === me ? '本当？ うそ？' : `${name(actor)}が考えています`;
        else if (view.phase === 'pass') {
            if (actor !== me) note = `${name(actor)}がカードを見ました`;
            else note = this.pick.target === null ? '回す相手を選ぶ' : '何と言って回す？';
        }
        $('#stage').innerHTML = `<div class="st-main">${main}</div><div class="st-note">${note}</div>`;
    }

    renderMe(view) {
        const me = view.players[view.you];
        const giving = this.myPrompt('give');
        $('#my-table').innerHTML = `<span class="label">あなた</span>${this.tableHtml(view, me, { all: true })}`;
        $('#my-hand').innerHTML = KIND_ORDER.map(kind => {
            const n = countOf(me.hand, kind);
            const cls = [!n ? 'empty' : '', giving && n ? 'pickable' : '', this.pick.card === kind ? 'picked' : ''].join(' ');
            return `<button class="slot ${cls}" data-kind="${kind}" style="--kc:${KINDS[kind].color}" aria-label="${KINDS[kind].name} ${n}枚" ${n ? '' : 'tabindex="-1"'}>
                ${critter(kind)}<b>${n}</b></button>`;
        }).join('');
        $('#me').classList.toggle('current', view.current === me.id && view.loser === null);
    }

    renderActions(view) {
        let html = '';
        if (view.loser !== null) {
            html = '';
        } else if (this.myPrompt('give') || this.myPrompt('pass')) {
            const ready = this.myPrompt('give') ? !!this.pick.card && this.pick.target !== null : this.pick.target !== null;
            html = `<div class="claim-grid">${KIND_ORDER.map(kind => `<button class="claim" data-claim="${kind}" style="--kc:${KINDS[kind].color}" ${ready ? '' : 'disabled'}>
                ${critter(kind)}<span>${KINDS[kind].name}</span></button>`).join('')}</div>`;
        } else if (this.myPrompt('respond')) {
            const canPeek = view.passTargets.length > 0;
            html = `<div class="answer">
                <button class="btn truth" data-answer="true">本当</button>
                <button class="btn danger" data-answer="false">うそ</button>
                ${canPeek ? `<button class="btn secondary" data-answer="peek">${icon('eye')}見て回す</button>` : ''}
            </div>`;
        }
        $('#actions').innerHTML = html;
    }

    // ---- 記録・終わり ----

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-200).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    showResult() {
        const v = this.view;
        if (!v || v.loser === null) return;
        const loser = v.players[v.loser];
        $('#result-title').textContent = v.loser === v.you ? 'あなたの負け' : `${loser.name}の負け　あなたの勝ち`;
        const set = KIND_ORDER.find(k => countOf(loser.table, k) >= v.limit);
        $('#result-reason').textContent = v.reason === 'set' && set
            ? `${v.loser === v.you ? 'あなた' : loser.name}の前に${KINDS[set].name}が${v.limit}枚`
            : `${v.loser === v.you ? 'あなた' : loser.name}は手札がなく、渡せません`;
        const ranked = [...v.players].sort((a, b) => (a.id === v.loser) - (b.id === v.loser) || a.table.length - b.table.length);
        $('#result-list').innerHTML = ranked.map(p => `
            <li class="${p.id === v.loser ? 'loser' : ''}"><span class="name">${escapeHtml(p.name)}</span><span class="op-table">${this.tableHtml(v, p)}</span></li>`).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        fresh.forEach(e => {
            if (e.type === 'give' || e.type === 'pass') this.fly(e.seat, e.target);
            if (e.type === 'reveal') {
                this.fly(null, e.taker, e.card);
                const who = e.seat === view.you ? 'あなた' : view.players[e.seat].name;
                this.toast(`${KINDS[e.card].name}でした。${who}の${e.correct ? '当たり' : '外れ'}`);
            }
        });
    }

    // 席の場所（自分は手札のあたり、null は真ん中の場）
    seatRect(seat) {
        if (seat === null) return $('#stage .stage-card')?.getBoundingClientRect() ?? $('#stage').getBoundingClientRect();
        if (seat === this.view.you) return $('#my-table').getBoundingClientRect();
        return $(`[data-player="${seat}"]`)?.getBoundingClientRect() ?? null;
    }

    // カードを from の席から to の席へ飛ばす（kind があれば表）
    fly(from, to, kind = null) {
        if (reduceMotion()) return;
        const a = this.seatRect(from);
        const b = this.seatRect(to);
        if (!a || !b) return;
        const holder = document.createElement('div');
        holder.className = 'flying';
        holder.innerHTML = kind ? cardHtml(kind, { cls: 'fly-card' }) : backHtml('fly-card');
        const x0 = a.left + a.width / 2;
        const y0 = a.top + a.height / 2;
        const x1 = b.left + b.width / 2;
        const y1 = b.top + b.height / 2;
        holder.style.left = `${x0}px`;
        holder.style.top = `${y0}px`;
        $('#fx').appendChild(holder);
        const lift = Math.min(60, Math.hypot(x1 - x0, y1 - y0) * 0.25);
        holder.animate([
            { transform: 'translate(-50%, -50%) scale(1)' },
            { transform: `translate(calc(-50% + ${(x1 - x0) / 2}px), calc(-50% + ${(y1 - y0) / 2 - lift}px)) scale(1.08)`, offset: 0.5 },
            { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(.8)` }
        ], { duration: FLY_MS, easing: 'ease-in-out' }).finished.finally(() => holder.remove());
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}
