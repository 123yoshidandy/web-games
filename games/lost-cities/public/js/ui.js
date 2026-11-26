/**
 * 画面（タイトル・ゲーム・ラウンドの結果・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 出す：手札を1枚押すと、その色の自分の探検（置けるとき）と捨て場が光る。列を押すか、下のボタンで決める
 * 引く：引ける捨て場の一番上が光る。捨て場を押すか、下の「山札から引く」
 */

import { CARDS, COLORS, COLOR_NAMES, ROUND_OPTIONS, DEFAULT_ROUNDS, expeditionScore, canPlace } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { music } from './music.js';
import { symbolsSvg, icon, cardHtml, chipHtml, cardBackHtml } from './art.js';
import { captureAnchors, playEvents } from './animator.js';

const CPU_NAME = 'インディ';
const SETTINGS_KEY = 'lost-cities.settings';
const ROUND_DIALOG_DELAY_MS = 700;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const scoreClass = (n) => (n > 0 ? 'plus' : n < 0 ? 'minus' : 'zero');

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { rounds: ROUND_OPTIONS.includes(saved.rounds) ? saved.rounds : DEFAULT_ROUNDS };
    } catch {
        return { rounds: DEFAULT_ROUNDS };
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
        this.picked = null;    // 手札から選んだカード
        this.lastSeq = 0;
        this.dialogTimer = null;
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
        this.renderRoundsSelect();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
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
        this.picked = null;
        this.view = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        this.startGame({ players: [{ name: 'あなた', isCPU: false }, { name: CPU_NAME, isCPU: true }], options: { rounds: this.settings.rounds } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.dialogTimer);
        ['#round-result', '#result'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#rounds-select').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-rounds]');
            if (!button) return;
            this.settings.rounds = Number(button.dataset.rounds);
            saveSettings(this.settings);
            this.renderRoundsSelect();
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
        $('#next-round').addEventListener('click', () => {
            $('#round-result').close();
            this.render(); // 閉じたら、自分の番の操作を受け付ける
            this.controller?.resume();
        });

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result' || dialog.id === 'round-result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (!card || !this.myTurn('play')) return;
            const id = Number(card.dataset.card);
            music.play(this.picked === id ? 'cancel' : 'select');
            this.picked = this.picked === id ? null : id;
            this.render();
        });
        $('#my-expeditions').addEventListener('click', (event) => {
            const column = event.target.closest('[data-color]');
            if (column && this.picked !== null && CARDS[this.picked].color === column.dataset.color) this.playPicked('expedition');
        });
        $('#discards').addEventListener('click', (event) => {
            const pile = event.target.closest('[data-color]');
            if (!pile) return;
            const color = pile.dataset.color;
            if (this.myTurn('play') && this.picked !== null && CARDS[this.picked].color === color) this.playPicked('discard');
            else if (this.myTurn('draw') && this.canDrawFrom(color)) this.controller?.send({ type: 'draw', from: color });
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            const act = button.dataset.act;
            if (act === 'expedition' || act === 'discard') this.playPicked(act);
            else if (act === 'deck') this.controller?.send({ type: 'draw', from: 'deck' });
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderRoundsSelect() {
        document.querySelectorAll('#rounds-select button').forEach(button => {
            button.setAttribute('aria-checked', String(Number(button.dataset.rounds) === this.settings.rounds));
        });
    }

    renderTitleArt() {
        const ids = [['yellow', 4], ['blue', 0], ['white', 7], ['green', 8], ['red', 9]].map(([color, value]) => CARDS.find(c => c.color === color && c.value === value).id);
        $('#title-art').innerHTML = ids.map((id, i) => cardHtml(id, { cls: `fan fan-${i}` })).join('');
    }

    renderHelpPictures() {
        const red = (value, nth = 0) => CARDS.filter(c => c.color === 'red' && c.value === value)[nth].id;
        $('#help-expedition').innerHTML = [red(0), red(0, 1), red(4), red(6), red(9)].map(id => chipHtml(id)).join('')
            + `<span class="help-score">（19 − 20）× 3 ＝ −3</span>`;
    }

    // ---- 状態 ----

    myTurn(phase) {
        const view = this.view;
        return !!view && view.current === view.you && view.phase === phase && !$('#round-result').open;
    }

    me() {
        return this.view.players[this.view.you];
    }

    canDrawFrom(color) {
        const pile = this.view.discards[color];
        return pile.length > 0 && pile.at(-1) !== this.view.justDiscarded;
    }

    playPicked(to) {
        const card = this.picked;
        if (card === null || !this.myTurn('play')) return;
        this.picked = null;
        this.controller?.send({ type: 'play', card, to });
    }

    // ---- ヒント ----

    // おすすめの手を示す。出す手なら、そのカードを選んでおき、出し先のボタンを光らせる
    showHint() {
        if (!this.myTurn('play') && !this.myTurn('draw')) return;
        const command = this.controller?.suggest();
        if (!command) return;
        music.play('select');
        this.hint = { at: this.view.logCount, command };
        if (command.type === 'play') this.picked = command.card;
        this.render();
    }

    renderHint() {
        const playing = this.myTurn('play') || this.myTurn('draw');
        $('#hint').disabled = !playing;
        if (this.hint && this.hint.at !== this.view.logCount) this.hint = null;
        const c = this.hint?.command;
        if (!c || !playing) return;
        if (c.type === 'play' && this.picked === c.card) $(`#actions [data-act="${c.to}"]`)?.classList.add('suggested');
        if (c.type === 'draw') (c.from === 'deck' ? $('#actions [data-act="deck"]') : $(`#discards [data-color="${c.from}"]`))?.classList.add('suggested');
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        this.view = view;
        if (!this.myTurn('play') || (this.picked !== null && !this.me().hand.includes(this.picked))) this.picked = null;

        this.renderTop();
        this.renderRival();
        this.renderExpeditions();
        this.renderDiscards();
        this.renderHand();
        this.renderActions();
        this.renderHint();

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        const roundEnd = fresh.find(e => e.type === 'roundEnd');
        this.playSound(fresh);
        if (roundEnd) {
            // ラウンドが終わったときは、新しいラウンドが配られているので動かさず、結果を出す。見ている間は CPU を止める
            this.controller.pause();
            clearTimeout(this.dialogTimer);
            this.dialogTimer = setTimeout(() => this.showRoundResult(roundEnd, fresh.some(e => e.type === 'end')), ROUND_DIALOG_DELAY_MS);
        } else {
            playEvents(fresh, before, { you: view.you });
        }
    }

    // 1つの更新に1つの音。自分は出す・捨てる・引く、相手の手は notify、自分の番になったら turn
    playSound(fresh) {
        const view = this.view;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(view.you) ? 'win' : 'lose');
        if (fresh.some(e => e.type === 'roundEnd')) return music.play('notify');
        const last = fresh.filter(e => e.type === 'play' || e.type === 'draw').at(-1);
        if (!last) return;
        if (last.seat === view.you) return music.play(last.type === 'draw' ? 'draw' : last.to === 'discard' ? 'pay' : 'place');
        music.play(this.myTurn('play') ? 'turn' : 'notify');
    }

    renderTop() {
        const view = this.view;
        const me = this.me();
        const rival = view.players[1 - view.you];
        $('#round-info').innerHTML = `第${view.round}<span class="of">/${view.rounds}</span>ラウンド`;
        $('#totals').innerHTML = `<span title="あなたの合計">${me.total}</span><span class="vs">対</span><span title="${escapeHtml(rival.name)}の合計">${rival.total}</span>`;
        $('#deck').innerHTML = `${cardBackHtml('mini')}<b>${view.deckCount}</b>`;
    }

    renderRival() {
        const view = this.view;
        const rival = view.players[1 - view.you];
        const round = COLORS.reduce((s, c) => s + rival.scores[c], 0);
        $('#rival').className = `rival ${view.current === rival.id && view.phase !== 'end' ? 'active' : ''}`;
        $('#rival').innerHTML = `<span class="r-name">${escapeHtml(rival.name)}</span>
            <span id="rival-hand" class="rival-hand" title="手札">${cardBackHtml('mini')}<b>${rival.handCount}</b></span>
            <span class="round-score ${scoreClass(round)}" title="このラウンドの得点">${signed(round)}</span>`;
    }

    // 探検の列。自分の列は、選んだカードを置いたときの得点の見込みも出す
    renderExpeditions() {
        const view = this.view;
        const me = this.me();
        const rival = view.players[1 - view.you];
        const picked = this.picked;
        const column = (player, color, mine) => {
            const cards = player.expeditions[color];
            const score = player.scores[color];
            let preview = '';
            let target = false;
            if (mine && picked !== null && CARDS[picked].color === color && canPlace(cards, picked)) {
                target = true;
                preview = `<span class="preview">→${signed(expeditionScore([...cards, picked]))}</span>`;
            }
            const scoreHtml = `<span class="exp-score ${cards.length ? scoreClass(score) : 'none'}">${cards.length ? signed(score) : '−'}${preview}</span>`;
            return `<div class="exp c-${color} ${target ? 'target' : ''}" data-color="${color}" ${target ? 'role="button"' : ''}>
                ${mine ? '' : scoreHtml}<div class="chips">${cards.map(chipHtml).join('')}</div>${mine ? scoreHtml : ''}</div>`;
        };
        $('#rival-expeditions').innerHTML = COLORS.map(c => column(rival, c, false)).join('');
        $('#my-expeditions').innerHTML = COLORS.map(c => column(me, c, true)).join('');
        const round = COLORS.reduce((s, c) => s + me.scores[c], 0);
        $('#my-round').className = `round-score ${scoreClass(round)}`;
        $('#my-round').textContent = signed(round);
        $('#me-label').className = `me-label ${view.current === me.id && view.phase !== 'end' ? 'active' : ''}`;
    }

    renderDiscards() {
        const view = this.view;
        const picked = this.picked;
        const drawing = this.myTurn('draw');
        $('#discards').innerHTML = COLORS.map(color => {
            const pile = view.discards[color];
            const top = pile.at(-1);
            const target = (picked !== null && CARDS[picked].color === color) || (drawing && this.canDrawFrom(color));
            const body = top === undefined ? icon(color, 'pile-icon') : cardHtml(top, { cls: 'pile-card' });
            const count = pile.length > 1 ? `<span class="pile-count">${pile.length}</span>` : '';
            return `<div class="pile c-${color} ${target ? 'target' : ''}" data-color="${color}" ${target ? 'role="button"' : ''} aria-label="${COLOR_NAMES[color]}の捨て場">${body}${count}</div>`;
        }).join('');
    }

    renderHand() {
        const me = this.me();
        const playing = this.myTurn('play');
        $('#hand').className = `hand ${playing ? 'playable' : ''}`;
        $('#hand').innerHTML = me.hand.map(id => cardHtml(id, { cls: id === this.picked ? 'picked' : '', attrs: playing ? 'role="button"' : '' })).join('');
    }

    renderActions() {
        const view = this.view;
        let html;
        if (this.myTurn('play') && this.picked !== null) {
            const me = this.me();
            const { color } = CARDS[this.picked];
            const cards = me.expeditions[color];
            const ok = canPlace(cards, this.picked);
            const label = ok ? `出す ${cards.length ? signed(expeditionScore(cards)) : '0'}→${signed(expeditionScore([...cards, this.picked]))}` : '出す';
            const reason = ok ? '' : `<span class="act-reason">${CARDS[this.picked].value === 0 ? '握手は数字より前' : '小さい順のみ'}</span>`;
            html = `${reason}<button class="btn small primary" data-act="expedition" ${ok ? '' : 'disabled'}>${label}</button>
                <button class="btn small secondary" data-act="discard">捨てる</button>`;
        } else if (this.myTurn('draw')) {
            html = `<button class="btn small primary" data-act="deck">山札から引く（残り${view.deckCount}）</button>`;
        } else {
            html = `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        }
        $('#actions').innerHTML = html;
    }

    // ---- ダイアログ ----

    scoreTable(event) {
        const view = this.view;
        const order = [view.you, 1 - view.you];
        const results = order.map(seat => event.results.find(r => r.seat === seat));
        const head = `<tr><th></th>${order.map(seat => `<th>${escapeHtml(view.players[seat].name)}</th>`).join('')}</tr>`;
        const rows = COLORS.map(color => `<tr><th>${icon(color, `th-icon c-${color}`)}</th>${results.map(r => {
            const started = r.expeditions[color].length > 0;
            return `<td class="${started ? scoreClass(r.scores[color]) : 'none'}">${started ? signed(r.scores[color]) : '−'}</td>`;
        }).join('')}</tr>`).join('');
        const sum = `<tr class="sum"><th>ラウンド</th>${results.map(r => `<td>${signed(r.score)}</td>`).join('')}</tr>`;
        const total = `<tr class="total"><th>合計</th>${results.map(r => `<td>${r.total}</td>`).join('')}</tr>`;
        return `<thead>${head}</thead><tbody>${rows}${sum}${total}</tbody>`;
    }

    showRoundResult(event, gameOver) {
        if (gameOver) return this.showResult(event);
        $('#round-title').textContent = `第${event.round}ラウンドの結果`;
        $('#round-table').innerHTML = this.scoreTable(event);
        if (!$('#round-result').open) $('#round-result').showModal();
        this.render();
    }

    showResult(event) {
        const view = this.view;
        const youWon = view.winners.length === 1 && view.winners[0] === view.you;
        $('#result-title').textContent = view.winners.length > 1 ? '引き分け' : youWon ? 'あなたの勝ち' : `${view.players[view.winners[0]].name}の勝ち`;
        $('#result-table').innerHTML = this.scoreTable(event);
        if (!$('#result').open) $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
