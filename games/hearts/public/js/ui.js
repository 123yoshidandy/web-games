/**
 * 画面（タイトル・ゲーム・ラウンドの結果・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 届いたイベントを順に再生して見せる（各イベントには、その時点の全員に見せてよい状態が付いている）
 * 自分の手札は、配る・渡す・出すのイベントで追いかける（再生の途中では、ビューの手札より遅れている）
 * 席は、自分を下にして、時計回りに 左 → 上 → 右 と並べる
 */

import { suitOf, QUEEN, END_SCORE, PLAYERS } from './game.js';
import { LEVELS, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, suitIcon, cardHtml } from './art.js';
import { fly, rectOf, reducedMotion } from './animator.js';

const GAME = 'hearts';
const SETTINGS_KEY = 'hearts.settings';
const CPU_NAMES = ['ハンス', 'エマ', 'ルイ'];
const POSITIONS = ['bottom', 'left', 'top', 'right'];
const DIRECTIONS = { 1: '左', 3: '右', 2: '向かい', 0: null };
// 再生の間（ミリ秒）
const STEP_MS = { deal: 550, exchange: 950, play: 400, trick: 750, sweep: 520 };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { level: Object.hasOwn(LEVELS, saved.level) ? saved.level : 'normal' };
    } catch {
        return { level: 'normal' };
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
        this.paused = false;    // ラウンドの結果を見ている間は、再生を止める
        this.lastSeq = 0;
        this.picked = null;     // 出すために選んだ札
        this.passPick = [];     // 渡すために選んだ札
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ハーツ',
            game: 'hearts',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 700,
            minPlayers: PLAYERS,
            maxPlayers: PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onUpdate(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                this.controller = null;
                this.showTitle();
            }
        });
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
        $('#online-button').hidden = !this.online.available;
        this.renderSetup();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.onUpdate(),
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
        this.beginGame(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.stopGame();
        else document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        this.hint = null;
        this.picked = null;
        this.passPick = [];
        this.queue = [];
        this.paused = false;
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は再生しない
        this.display = this.fromView(this.view);
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.dealIn();
        this.afterIdle();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {}, level: this.settings.level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.timer);
        this.timer = null;
        ['#round-result', '#result'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#level').addEventListener('click', (event) => {
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
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#next-round').addEventListener('click', () => {
            $('#round-result').close();
            this.paused = false;
            this.pump();
        });

        // ダイアログは外側のタップと「閉じる」で閉じる（結果は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result' || dialog.id === 'round-result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hint').addEventListener('click', () => this.showHint());
        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) this.pickCard(card.dataset.card);
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'pass' && this.canPass() && this.passPick.length === 3) {
                const cards = this.passPick;
                this.passPick = [];
                this.controller?.send({ type: 'pass', cards });
            }
            if (button.dataset.act === 'play' && this.canPlay() && this.picked) this.playPicked();
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSetup() {
        $('#level').innerHTML = Object.entries(LEVELS).map(([key, label]) =>
            `<button data-level="${key}" role="radio" aria-checked="${key === this.settings.level}" class="${key === this.settings.level ? 'on' : ''}">${label}</button>`).join('');
    }

    renderTitleArt() {
        $('#title-art').innerHTML = ['AH', 'KH', 'QS', 'JH', 'TH'].map((card, i) => cardHtml(card, { cls: `fan fan-${i}` })).join('');
    }

    renderHelpPictures() {
        $('#help-points').innerHTML = `<div class="mini-row">${cardHtml('7H')}<span class="mini-pts">1点</span>${cardHtml(QUEEN)}<span class="mini-pts">13点</span></div>`;
    }

    // ---- 操作 ----

    idle() {
        return this.queue.length === 0 && this.timer === null && !this.paused;
    }

    canPass() {
        const view = this.view;
        return !!view && this.idle() && view.phase === 'pass' && view.myPass === null;
    }

    canPlay() {
        const view = this.view;
        return !!view && this.idle() && view.phase === 'play' && view.turn === view.you;
    }

    pickCard(card) {
        if (this.canPass()) {
            const i = this.passPick.indexOf(card);
            music.play(i >= 0 ? 'cancel' : 'select');
            if (i >= 0) this.passPick.splice(i, 1);
            else if (this.passPick.length < 3) this.passPick.push(card);
            else this.passPick = [...this.passPick.slice(1), card]; // 4枚目を押したら、一番前に選んだ札と入れ替える
            this.renderHand();
            this.renderActions();
            return;
        }
        if (!this.canPlay()) return;
        if (!this.view.legal.includes(card)) {
            music.play('error');
            this.toast(this.illegalReason(card));
            return;
        }
        // 選んだ札をもう一度押したら出す
        if (this.picked === card) return this.playPicked();
        music.play('select');
        this.picked = card;
        this.renderHand();
        this.renderActions();
    }

    // 出せない理由（ルールの言葉で短く）
    illegalReason(card) {
        const view = this.view;
        if (view.trick.length === 0) return view.trickNo === 1 ? 'クラブの2から始めます' : 'ハートはまだ割れていません';
        const suit = suitOf(view.trick[0].card);
        if (suitOf(card) !== suit && view.hand.some(c => suitOf(c) === suit)) return '出されたスートを出します';
        return '最初のトリックでは失点の札を出せません';
    }

    playPicked() {
        const card = this.picked;
        this.picked = null;
        this.controller?.send({ type: 'play', card });
    }

    // ---- 再生 ----

    onUpdate() {
        if (!this.controller) return;
        this.view = this.controller.getView();
        const fresh = this.view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = this.view.events.at(-1)?.seq ?? this.lastSeq;
        this.queue.push(...fresh);
        if (this.timer === null && !this.paused) this.pump();
    }

    // イベントを1つ再生し、間を置いて次へ。なくなったらビューにそろえる
    pump() {
        this.timer = null;
        if (!this.controller || this.paused) return;
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
        return { ...structuredClone(view), received: this.display?.round === view.round ? this.display.received ?? [] : [], winner: null };
    }

    // イベントの状態に、画面で追いかける自分の手札などを足す
    withState(event, change = {}) {
        return { ...structuredClone(event.state), you: this.view.you, hand: this.display.hand, received: this.display.received ?? [], winner: null, ...change };
    }

    // イベントを display に当てて描く。次までの間（ミリ秒）を返す。null なら止める
    step(event) {
        const you = this.view.you;
        this.playSound(event);
        switch (event.type) {
        case 'deal':
            this.display = this.withState(event, { hand: event.hand, received: [] });
            this.passPick = [];
            this.render();
            this.dealIn();
            return STEP_MS.deal;
        case 'passReady':
            this.display.players[event.seat].passed = true;
            this.renderSeats();
            return 0;
        case 'exchange': {
            // 渡した札は相手の席へ飛び、もらった札は相手の席から手札へ入る
            const to = this.seatEl((you + event.offset) % 4);
            const from = this.seatEl((you + 4 - event.offset) % 4);
            const sentRects = event.sent.map(c => rectOf($(`#hand .card[data-card="${c}"]`)));
            this.display = this.withState(event, { hand: event.hand, received: event.received });
            this.render();
            event.sent.forEach((c, i) => fly(cardHtml(c), sentRects[i], rectOf(to), { delay: i * 60 }));
            event.received.forEach((c, i) => {
                const target = $(`#hand .card[data-card="${c}"]`);
                fly(cardHtml(c), rectOf(from), rectOf(target), { delay: 360 + i * 60, hide: target, size: rectOf(target) });
            });
            return STEP_MS.exchange;
        }
        case 'lead':
            this.display = this.withState(event);
            this.render();
            return 0;
        case 'play': {
            const from = event.seat === you ? rectOf($(`#hand .card[data-card="${event.card}"]`)) : rectOf(this.seatEl(event.seat));
            const hand = event.seat === you ? this.display.hand.filter(c => c !== event.card) : this.display.hand;
            this.display = this.withState(event, { hand });
            this.render();
            const target = $(`#trick .card[data-card="${event.card}"]`);
            fly(cardHtml(event.card), from, rectOf(target), { hide: target, size: rectOf(target) });
            if (event.breaks) this.toast('ハートが割れました');
            return STEP_MS.play;
        }
        case 'trick':
            // 4枚を見せたまま、取る札を光らせる。続けて取った人へ集める
            this.display.winner = event.cards.find(t => t.seat === event.winner).card;
            this.renderTrick();
            this.queue.unshift({ type: 'sweep', winner: event.winner, state: event.state });
            return STEP_MS.trick;
        case 'sweep': {
            const rects = [...document.querySelectorAll('#trick .card')].map(el => ({ card: el.dataset.card, rect: rectOf(el) }));
            this.display = this.withState(event);
            this.render();
            const to = rectOf(this.seatEl(event.winner));
            rects.forEach(({ card, rect }, i) => fly(cardHtml(card), rect, to, { delay: i * 40 }));
            this.bump(this.seatEl(event.winner));
            return STEP_MS.sweep;
        }
        case 'roundEnd':
            this.display = this.withState(event, { hand: [] });
            this.render();
            if (this.queue[0]?.type === 'end') return 0;
            this.showRoundResult(event);
            this.paused = true;
            return null;
        case 'end':
            this.display = this.withState(event, { hand: [] });
            this.render();
            this.showResult(event);
            return null;
        default:
            return 0;
        }
    }

    // 出来事の音。自分の札は置く、ほかの人の札は notify。取ったトリックに失点があれば pay
    playSound(event) {
        const you = this.view.you;
        switch (event.type) {
        case 'deal': return music.play('shuffle');
        case 'exchange': return music.play('draw');
        case 'play': return music.play(event.seat === you ? 'place' : 'notify');
        case 'trick':
            if (event.winner === you) music.play(event.points > 0 ? 'pay' : 'capture', { delay: 0.15 });
            return;
        case 'roundEnd': return music.play('notify');
        case 'end': return music.play(event.winners.includes(you) ? 'win' : 'lose');
        }
    }

    // ---- ヒント ----

    showHint() {
        if ((!this.canPass() && !this.canPlay()) || this.controller?.isOnline) return;
        const command = suggest(this.controller.game, this.view.you);
        if (!command) return;
        music.play('select');
        this.hint = { at: this.controller.game.commands.length, command };
        if (command.type === 'pass') this.passPick = [...command.cards];
        else this.picked = command.card;
        this.renderHand();
        this.renderActions();
    }

    // おすすめの札と操作のボタンに .recommended を付ける。盤面が進んだら消す
    markHint() {
        const can = this.canPass() || this.canPlay();
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        $('#hint').disabled = !can;
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const hint = this.hint;
        if (!hint || this.controller?.isOnline || hint.at !== this.controller?.game.commands.length || !can) {
            this.hint = null;
            return;
        }
        const c = hint.command;
        (c.type === 'pass' ? c.cards : [c.card]).forEach(card => $(`#hand .card[data-card="${card}"]`)?.classList.add('recommended'));
        $(`#actions [data-act="${c.type}"]`)?.classList.add('recommended');
    }

    // 席の要素（自分は自分の欄）
    seatEl(seat) {
        return seat === this.view.you ? $('#me') : $(`.seat[data-pos="${this.posOf(seat)}"]`);
    }

    posOf(seat) {
        return POSITIONS[(seat - this.view.you + 4) % 4];
    }

    // 配った手札を、左から順に置く
    dealIn() {
        if (reducedMotion()) return;
        document.querySelectorAll('#hand .card').forEach((el, i) => {
            el.animate([{ transform: 'translateY(-30px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
                { duration: 260, delay: i * 25, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
        });
    }

    bump(el) {
        if (!el || reducedMotion()) return;
        el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 320, delay: 380 });
    }

    // 再生が終わったあと：選んでいた札を、今できることに合わせる。終わっていれば結果を出す
    afterIdle() {
        if (!this.canPlay() || !this.view.legal.includes(this.picked)) this.picked = null;
        if (!this.canPass()) this.passPick = [];
        // 出せる札が1枚だけなら、選んだ状態にしておく
        if (this.canPlay() && this.view.legal.length === 1) this.picked = this.view.legal[0];
        this.renderHand();
        this.renderActions();
        // 自分が操作できるようになったら知らせる
        const canAct = this.canPass() || this.canPlay();
        if (canAct && !this.couldAct) music.play('turn', { delay: 0.15 });
        this.couldAct = canAct;
        if (this.view.phase === 'end' && !$('#result').open) this.showResult({ scores: this.view.players.map(p => p.score), winners: this.view.winners });
    }

    // ---- 描く ----

    render() {
        if (!this.display) return;
        this.renderTop();
        this.renderSeats();
        this.renderTrick();
        this.renderMe();
        this.renderHand();
        this.renderActions();
    }

    renderTop() {
        const d = this.display;
        const direction = DIRECTIONS[d.offset];
        $('#round-info').innerHTML = d.phase === 'end' ? '結果'
            : `第${d.round}ラウンド<span class="dir">${direction ? `${direction}へ渡す` : '渡さない'}</span>`;
    }

    // 取った失点（ハートの数とクイーン）
    takenHtml(p) {
        const hearts = p.points - (p.queen ? 13 : 0);
        return `<span class="taken">${hearts > 0 ? `${suitIcon('H')}<b>${hearts}</b>` : ''}${p.queen ? `<span class="q-mark">${suitIcon('S')}Q</span>` : ''}</span>`;
    }

    renderSeats() {
        const d = this.display;
        d.players.filter(p => p.id !== this.view.you).forEach(p => {
            const el = $(`.seat[data-pos="${this.posOf(p.id)}"]`);
            const active = d.phase === 'play' && d.turn === p.id;
            const status = d.phase === 'pass' ? (p.passed ? '<span class="done" title="選びました">✓</span>' : '<span class="thinking"><i></i><i></i><i></i></span>')
                : active ? '<span class="thinking" aria-label="考えています"><i></i><i></i><i></i></span>' : '';
            el.className = `seat seat-${this.posOf(p.id)} ${active ? 'active' : ''}`;
            el.dataset.seat = p.id;
            el.innerHTML = `<div class="s-head"><span class="s-name">${escapeHtml(p.name)}</span>${status}</div>
                <div class="s-score"><span class="total" title="失点の合計">${p.score}</span>${this.takenHtml(p)}</div>`;
        });
    }

    renderTrick() {
        const d = this.display;
        $('#trick').innerHTML = d.trick.map(t => `<div class="slot slot-${this.posOf(t.seat)}">${cardHtml(t.card, { cls: t.card === d.winner ? 'winning' : '' })}</div>`).join('');
    }

    renderMe() {
        const d = this.display;
        const me = d.players[this.view.you];
        const active = (d.phase === 'play' && d.turn === me.id) || this.canPass();
        $('#me').className = `me ${active ? 'active' : ''}`;
        $('#me').innerHTML = `<span class="me-name">${escapeHtml(me.name)}</span>
            <span class="s-score"><span class="total" title="失点の合計">${me.score}</span>${this.takenHtml(me)}</span>`;
    }

    renderHand() {
        const d = this.display;
        if (!d) return;
        const playing = this.canPlay();
        const passing = this.canPass();
        const legal = playing ? this.view.legal : null;
        const sentNow = d.phase === 'pass' && this.idle() ? this.view.myPass ?? [] : [];
        const hand = d.hand.filter(c => !sentNow.includes(c));
        // 2段に分ける（上に7枚、下に6枚）
        const half = Math.ceil(hand.length / 2);
        const rowHtml = (cards) => `<div class="hand-row">${cards.map(card => {
            const cls = [
                legal && !legal.includes(card) ? 'disabled' : '',
                card === this.picked || this.passPick.includes(card) ? 'picked' : '',
                (d.received ?? []).includes(card) && d.trickNo <= 1 ? 'received' : ''
            ].join(' ');
            return cardHtml(card, { cls, attrs: playing || passing ? 'role="button"' : '' });
        }).join('')}</div>`;
        $('#hand').className = `hand ${playing || passing ? 'playable' : ''}`;
        $('#hand').innerHTML = rowHtml(hand.slice(0, half)) + rowHtml(hand.slice(half));
    }

    renderActions() {
        const view = this.view;
        const d = this.display;
        if (!view || !d) return;
        let html = '';
        if (this.canPass()) {
            const direction = DIRECTIONS[view.offset];
            html = `<span class="act-label">${direction}へ渡す札<b class="count">${this.passPick.length}/3</b></span>
                <button class="btn primary" data-act="pass" ${this.passPick.length === 3 ? '' : 'disabled'}>渡す</button>`;
        } else if (this.canPlay()) {
            html = this.picked
                ? `${cardHtml(this.picked, { cls: 'tiny' })}<button class="btn primary" data-act="play">出す</button>`
                : '<span class="act-label muted">出す札を選ぶ</span><button class="btn primary" data-act="play" disabled>出す</button>';
        } else if (this.idle() && view.phase === 'pass') {
            html = '<span class="act-label muted">ほかの人を待っています</span>';
        } else if (this.idle() && view.phase === 'play') {
            html = `<span class="act-label muted">${escapeHtml(view.players[view.turn].name)}の番</span>`;
        }
        $('#actions').innerHTML = html;
        this.markHint();
    }

    // ---- ダイアログ ----

    showRoundResult(event) {
        const players = this.view.players;
        $('#round-title').textContent = `第${event.round}ラウンドの結果`;
        const moon = $('#round-moon');
        moon.hidden = event.moon === null;
        moon.textContent = event.moon === null ? '' : `${event.moon === this.view.you ? 'あなた' : players[event.moon].name}がシュート・ザ・ムーン。ほかの全員に26点`;
        const order = [...players.keys()].sort((a, b) => event.scores[a] - event.scores[b]);
        $('#round-list').innerHTML = order.map(seat => `<li class="${seat === this.view.you ? 'mine' : ''}">
            <span class="r-name">${escapeHtml(players[seat].name)}</span>
            <span class="r-plus">${event.added[seat] > 0 ? `+${event.added[seat]}` : ''}</span>
            <b class="r-score">${event.scores[seat]}</b></li>`).join('');
        $('#round-result').showModal();
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view || !(view.phase === 'end')) return;
        const id = `${GAME}-${controller.game.options.seed}`;
        if (this.recordedId === id) return;
        this.recordedId = id;
        recordResult({ game: GAME, id, outcome: outcomeFromWinners(view.winners, view.you, view.players.length) });
    }

    showResult({ scores, winners }) {
        this.recordLocalResult(this.view);
        if ($('#result').open) return;
        const players = this.view.players;
        const you = this.view.you;
        const youWon = winners.includes(you);
        $('#result-title').textContent = youWon ? (winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち') : `${winners.map(id => players[id].name).join('と')}の勝ち`;
        const order = [...players.keys()].sort((a, b) => scores[a] - scores[b]);
        $('#result-list').innerHTML = order.map(seat => `<li class="${winners.includes(seat) ? 'winner' : ''} ${seat === you ? 'mine' : ''}">
            <span class="r-name">${escapeHtml(players[seat].name)}</span>
            <b class="r-score ${scores[seat] >= END_SCORE ? 'over' : ''}">${scores[seat]}</b></li>`).join('');
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }
}
