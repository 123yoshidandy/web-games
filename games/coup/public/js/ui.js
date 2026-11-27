/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { ROLES, ROLE_ORDER, ACTIONS, ACTION_ORDER } from './roles.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import * as Motion from './motion/motion.js';
import { measure, animate, dealExchange } from './animator.js';
import { symbolsSvg, cardHtml, backHtml, roleTag, coinHtml } from './art.js';

const GAME = 'coup';
const SETTINGS_KEY = 'coup.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン', 'ユイ'];
const RESULT_DELAY_MS = 900;
const FLOAT_MS = 1100;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
        this.selecting = null;      // 相手を選んでいる行動
        this.exchangePick = [];     // 交換で残す札（pool の位置）
        this.exchangeKey = null;    // 交換の画面を開いた番
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'クー',
            game: 'coup',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 650,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
        this.renderTitleArt();
        Motion.mountSpeedSetting($('#motion-setting'), { label: '' });
        Motion.mountSpeedSetting($('#motion-setting-help'), { label: '' });
        this.renderHelp();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
        this.renderSetup();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.render(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.stopGame();
        this.controller = controller;
        this.view = null;
        this.logHistory = [];
        this.selecting = null;
        this.exchangeKey = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.render();
        if (!controller.isOnline) controller.scheduleCpu();
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
        this.resultTimer?.();
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
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle())); // オンラインは確かめてから部屋を出る
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#hint').addEventListener('click', () => this.showHint());

        // ダイアログは外側のタップと「閉じる」で閉じる（終わりと交換は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result' || dialog.id === 'exchange') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#opponents').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-player]');
            if (!tile || !this.selecting) return;
            const target = Number(tile.dataset.player);
            if (!this.view.players[target].alive) return;
            const action = this.selecting;
            this.selecting = null;
            this.send({ type: 'action', action, target });
        });
        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('.card.pick');
            if (card && this.myPrompt('lose')) this.send({ type: 'lose', role: card.dataset.role });
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            const { action, answer, role } = button.dataset;
            if (action) return this.chooseAction(action);
            if (answer === 'block') return this.send({ type: 'block', role });
            if (answer) this.send({ type: answer });
        });
        $('#exchange-cards').addEventListener('click', (event) => {
            const card = event.target.closest('[data-index]');
            if (!card) return;
            const i = Number(card.dataset.index);
            const need = this.view.players[this.view.you].cardCount;
            if (this.exchangePick.includes(i)) this.exchangePick = this.exchangePick.filter(x => x !== i);
            else if (this.exchangePick.length < need) this.exchangePick.push(i);
            this.renderExchange();
        });
        $('#exchange-ok').addEventListener('click', () => {
            if (!this.myPrompt('exchange')) return;
            const pool = this.exchangePool();
            $('#exchange').close();
            this.send({ type: 'exchange', keep: this.exchangePick.map(i => pool[i]) });
        });
    }

    send(command) {
        this.controller?.send(command);
    }

    // ヒント：CPU（ふつう）が選ぶ操作に印を付ける（相手を選ぶ行動は、行動を選んだ状態にして相手に印）
    showHint() {
        const c = this.controller?.hint();
        if (!c) return this.toast('自分の番になったら、おすすめを出せます');
        const v = this.view;
        const name = (seat) => v.players[seat].name;
        if (c.type === 'action' && ACTIONS[c.action].target) this.selecting = c.action;
        this.hint = { key: v.events.at(-1)?.seq ?? 0, command: c };
        this.render();
        const text = {
            action: () => (ACTIONS[c.action].target ? `${ACTIONS[c.action].name}（${name(c.target)}に）` : ACTIONS[c.action].name),
            allow: () => '通す',
            challenge: () => 'チャレンジする',
            block: () => `${ROLES[c.role].name}でブロックする`,
            lose: () => `${ROLES[c.role].name}を失う`,
            exchange: () => '残すカードを選ぶ'
        }[c.type]?.() ?? '光るところを押す';
        this.toast(`おすすめ：${text}`);
    }

    markHint(view) {
        const h = this.hint;
        if (!h || h.key !== (view.events.at(-1)?.seq ?? 0)) return;
        const c = h.command;
        const mark = (selector) => document.querySelector(selector)?.classList.add('recommended');
        if (c.type === 'action') mark(ACTIONS[c.action].target ? `#opponents [data-player="${c.target}"]` : `#actions [data-action="${c.action}"]`);
        if (c.type === 'allow' || c.type === 'challenge') mark(`#actions [data-answer="${c.type}"]`);
        if (c.type === 'block') mark(`#actions [data-answer="block"][data-role="${c.role}"]`);
        if (c.type === 'lose') mark(`#me .card.pick[data-role="${c.role}"]`);
    }

    // 自分が答える番か
    myPrompt(phase) {
        const v = this.view;
        return !!v && v.phase === phase && v.winner === null && v.answering.includes(v.you);
    }

    chooseAction(action) {
        if (!this.myPrompt('action')) return;
        if (ACTIONS[action].target) {
            this.selecting = this.selecting === action ? null : action;
            music.play(this.selecting ? 'select' : 'cancel');
            this.render();
            return;
        }
        this.selecting = null;
        this.send({ type: 'action', action });
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        $('#title-art').innerHTML = ROLE_ORDER.map((role, i) => `<div class="fan" style="--i:${i - 2}">${cardHtml(role)}</div>`).join('');
    }

    renderHelp() {
        $('#help-actions').innerHTML = ACTION_ORDER.map(key => {
            const a = ACTIONS[key];
            const block = a.blockers.length ? `。${a.blockers.map(r => ROLES[r].name).join('か')}でブロックされる` : '';
            return `<li><span class="ha-name"><strong>${a.name}</strong>${a.claim ? roleTag(a.claim) : ''}</span><span>${a.text}${block}</span></li>`;
        }).join('');
        $('#help-roles').innerHTML = ROLE_ORDER.map(role => `<li>${cardHtml(role, { cls: 'small' })}<div><strong>${ROLES[role].name}</strong><br>${ROLES[role].text}</div></li>`).join('');
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const prev = this.view;
        const before = measure(prev);
        const view = this.controller.getView();
        this.view = view;
        // オンライン対戦のビューは新しい記録だけを運ぶので、記録の一覧のためにためておく（logCount は全体の数）
        this.logHistory = this.logHistory.slice(0, view.logCount - view.logs.length).concat(view.logs);
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        if (view.phase !== 'action' || view.current !== view.you) this.selecting = null;
        $('#deck').innerHTML = `${backHtml('tiny')}<span>${view.deckCount}</span>`;
        this.renderOpponents(view);
        this.renderStage(view);
        this.renderMe(view);
        this.renderActions(view);
        this.markHint(view);
        this.updateExchange(view);
        const fresh = this.playEvents(view, prev);
        animate(before, view, fresh ?? []);
        if ($('#log').open) this.renderLog();
        if (view.winner !== null && !$('#result').open && !this.resultTimer) {
            // 動きが終わってから結果を出す
            this.resultTimer = Motion.afterIdle(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    // 札の並び：伏せた札のあとに、失った札（表）
    cardsHtml(p, size) {
        return [...Array.from({ length: p.cardCount }, () => backHtml(size)), ...p.lost.map(r => cardHtml(r, { cls: `${size} lost` }))].join('');
    }

    renderOpponents(view) {
        const others = view.players.filter(p => p.id !== view.you);
        const t = view.turn;
        const answering = new Set(view.answering);
        $('#opponents').dataset.count = String(others.length);
        $('#opponents').innerHTML = others.map(p => {
            const cls = [
                p.alive ? '' : 'out',
                p.id === view.current && view.winner === null ? 'current' : '',
                answering.has(p.id) && view.phase !== 'action' ? 'thinking' : '',
                this.selecting && p.alive ? 'targetable' : '',
                t && t.target === p.id ? 'targeted' : ''
            ].join(' ');
            let say = '';
            if (t && t.blocker === p.id) say = `<span class="say">${roleTag(t.blockRole)}</span>`;
            else if (t && t.actor === p.id) say = t.claim ? `<span class="say">${roleTag(t.claim)}</span>` : `<span class="say plain">${ACTIONS[t.action].name}</span>`;
            return `<button class="opponent ${cls}" data-player="${p.id}">
                <span class="op-head"><span class="op-name">${escapeHtml(p.name)}</span><span data-coins="${p.id}">${coinHtml(p.coins)}</span></span>
                <span class="op-cards">${this.cardsHtml(p, 'mini')}</span>
                ${say}
            </button>`;
        }).join('');
    }

    renderStage(view) {
        const t = view.turn;
        const name = (seat) => escapeHtml(view.players[seat].name);
        let main = '';
        if (t) {
            const head = `${name(t.actor)}${t.target !== null ? `<span class="arrow">→</span>${name(t.target)}` : ''}`;
            main = `<div class="st-head">${head}</div><div class="st-action">${ACTIONS[t.action].name}${t.claim ? roleTag(t.claim) : ''}</div>`;
            if (t.blocker !== null) main += `<div class="st-block">${name(t.blocker)}がブロック${roleTag(t.blockRole)}</div>`;
        }
        let note = '';
        const me = view.you;
        if (view.winner !== null) note = '';
        else if (view.phase === 'action') note = view.current === me ? (this.selecting ? '相手を選ぶ' : 'あなたの番') : `${name(view.current)}の番`;
        else if (view.phase === 'lose') note = view.loser === me ? '失う札を選ぶ' : `${name(view.loser)}が失う札を選んでいます`;
        else if (view.phase === 'exchange') note = t.actor === me ? '' : `${name(t.actor)}が交換しています`;
        else if (view.waiting.includes(me)) note = view.phase === 'block' ? 'ブロックする？' : 'チャレンジする？';
        const last = this.logHistory.at(-1) ?? '';
        $('#stage').innerHTML = `<div class="st-main">${main}</div>${note ? `<div class="st-note">${note}</div>` : ''}<div class="st-log">${escapeHtml(last)}</div>`;
    }

    renderMe(view) {
        const me = view.players[view.you];
        const losing = this.myPrompt('lose');
        const hand = me.hand.map(r => cardHtml(r, { cls: `big ${losing ? 'pick' : ''}` })).join('');
        const lost = me.lost.map(r => cardHtml(r, { cls: 'big lost' })).join('');
        $('#me').innerHTML = `<div class="my-cards">${hand}${lost}</div><div class="my-coins" data-coins="${me.id}">${coinHtml(me.coins, 'big')}</div>`;
    }

    renderActions(view) {
        const me = view.players[view.you];
        let html = '';
        if (view.winner !== null || !me.alive) {
            html = '';
        } else if (this.myPrompt('action')) {
            html = `<div class="act-grid">${ACTION_ORDER.map(key => {
                const a = ACTIONS[key];
                const ok = view.legalActions.includes(key);
                const sub = a.claim ? ROLES[a.claim].name : (a.cost ? `${a.cost}コイン` : '');
                const style = a.claim ? ` style="--rc:${ROLES[a.claim].color}"` : '';
                return `<button class="act ${a.claim ? 'claim' : ''} ${this.selecting === key ? 'selected' : ''}" data-action="${key}"${style} ${ok ? '' : 'disabled'}>
                    <span>${a.name}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
            }).join('')}</div>`;
        } else if (view.waiting.includes(me.id) && (view.phase === 'challengeAction' || view.phase === 'challengeBlock')) {
            html = '<div class="answer"><button class="btn danger" data-answer="challenge">チャレンジ</button><button class="btn secondary" data-answer="allow">通す</button></div>';
        } else if (view.waiting.includes(me.id) && view.phase === 'block') {
            const roles = ACTIONS[view.turn.action].blockers;
            html = `<div class="answer">${roles.map(r => `<button class="btn block" style="--rc:${ROLES[r].color}" data-answer="block" data-role="${r}">${ROLES[r].name}でブロック</button>`).join('')}<button class="btn secondary" data-answer="allow">通す</button></div>`;
        }
        $('#actions').innerHTML = html;
    }

    // ---- 交換 ----

    exchangePool() {
        const v = this.view;
        return [...v.players[v.you].hand, ...(v.drawn ?? [])];
    }

    updateExchange(view) {
        const mine = this.myPrompt('exchange');
        if (!mine) {
            if ($('#exchange').open) $('#exchange').close();
            return;
        }
        const key = `${view.turnNumber}`;
        if (this.exchangeKey === key && $('#exchange').open) return;
        this.exchangeKey = key;
        this.exchangePick = [];
        this.renderExchange();
        if (!$('#exchange').open) $('#exchange').showModal();
        dealExchange();
    }

    renderExchange() {
        const need = this.view.players[this.view.you].cardCount;
        $('#exchange').querySelector('h2').textContent = `交換：残す札を${need}枚`;
        $('#exchange-cards').innerHTML = this.exchangePool().map((role, i) => cardHtml(role, { cls: `big ${this.exchangePick.includes(i) ? 'picked' : ''}`, attrs: `data-index="${i}"` })).join('');
        $('#exchange-ok').disabled = this.exchangePick.length !== need;
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
        $('#log-list').innerHTML = this.logHistory.slice(-150).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view || view.winner === null) return;
        if (view.players.filter(player => !player.isCPU).length !== 1) return;
        const id = `${GAME}-${controller.game.options.seed}`;
        if (this.recordedId === id) return;
        this.recordedId = id;
        recordResult({ game: GAME, id, outcome: view.winner === view.you ? 'win' : 'loss' });
    }

    showResult() {
        this.recordLocalResult(this.view);
        const v = this.view;
        if (!v || v.winner === null) return;
        $('#result-title').textContent = v.winner === v.you ? 'あなたの勝ち' : `${v.players[v.winner].name}の勝ち`;
        // 勝った人のあとは、脱落の遅かった順
        const outOrder = v.events.filter(e => e.type === 'lose').map(e => e.seat);
        const rank = (p) => (p.id === v.winner ? Infinity : outOrder.lastIndexOf(p.id));
        const ranked = [...v.players].sort((a, b) => rank(b) - rank(a));
        $('#result-list').innerHTML = ranked.map(p => `
            <li><span class="name">${escapeHtml(p.name)}</span><span class="op-cards">${this.cardsHtml(p, 'mini')}</span>${coinHtml(p.coins)}</li>`).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    // ---- 出来事の演出 ----

    // 効果音：新しいできごとを見て、1回の更新に1つだけ、大事な順に選んで鳴らす
    // 自分が影響力を失ったら払う音、自分の手で相手が失ったら取る音、お金は得る・払う音、交換は引く音、
    // 自分の行動は置く音、自分の番になったら自分の番の音、ほかは知らせ。勝者が決まったら勝ち・負け
    playSounds(view, fresh) {
        const me = view.you;
        const win = fresh.find(e => e.type === 'win');
        if (win) return music.play(win.seat === me ? 'win' : 'lose');
        if (fresh.some(e => e.type === 'lose' && e.seat === me)) return music.play('pay');
        const myMove = fresh.some(e => (e.type === 'action' || e.type === 'challenge') && e.seat === me) || view.current === me;
        if (myMove && fresh.some(e => e.type === 'lose' && e.seat !== me)) return music.play('capture');
        if (fresh.some(e => e.type === 'coins' && e.to === me)) return music.play('gain');
        if (fresh.some(e => e.type === 'coins' && e.from === me)) return music.play('pay');
        if (fresh.some(e => e.type === 'exchangeDraw' && e.seat === me)) return music.play('draw');
        if (fresh.some(e => ['action', 'challenge', 'block'].includes(e.type) && e.seat === me)) return music.play('place');
        if (fresh.some(e => e.type === 'turn' && e.seat === me)) return music.play('turn');
        music.play('notify');
    }

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return [];
        this.playSounds(view, fresh);
        const name = (seat) => view.players[seat].name;
        const deltas = new Map();
        const add = (seat, amount) => deltas.set(seat, (deltas.get(seat) ?? 0) + amount);
        fresh.forEach(e => {
            if (e.type === 'coins' && e.amount > 0) {
                add(e.to, e.amount);
                if (e.from !== null) add(e.from, -e.amount);
            }
            if (e.type === 'action' && ACTIONS[e.action].cost) add(e.seat, -ACTIONS[e.action].cost);
            if (e.type === 'challenge') {
                this.toast(e.success
                    ? `${name(e.claimant)}は${ROLES[e.role].name}を持っていなかった`
                    : `${name(e.claimant)}は${ROLES[e.role].name}を持っていた`);
            }
            if (e.type === 'redraw' && e.card && e.seat === view.you) this.toast(`${ROLES[e.card].name}を引き直した`);
        });
        deltas.forEach((amount, seat) => { if (amount) this.floatText(seat, amount); });
        return fresh;
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
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}
