/**
 * 画面（タイトル・ゲーム・ラウンドの結果・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 全員が出したあとの流れ（公開 → 小さい順に置く → 引き取る）は、ロジックでは一度に進む。
 * 画面は、届いたイベントを順に再生し（display を少しずつ進めて描く）、終わったらビューの状態にそろえる
 */

import { ROW_LIMIT, MIN_PLAYERS, MAX_PLAYERS, HAND_SIZE, END_SCORE, sumBulls } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, bullIcon, cardHtml } from './art.js';
import { fly, rectOf } from './animator.js';
import { music } from './music.js';

const SETTINGS_KEY = 'nimmt.settings';
const CPU_NAMES = ['ハンス', 'エマ', 'ルイ', 'ミア', 'オット', 'リナ', 'カール', 'ノア', 'ソフィ'];
// 再生の間（ミリ秒）
const STEP_MS = { reveal: 1100, place: 560, take: 760, chooseRow: 700, deal: 500 };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: Number.isInteger(saved.count) && saved.count >= MIN_PLAYERS && saved.count <= MAX_PLAYERS ? saved.count : 4 };
    } catch {
        return { count: 4 };
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
        this.picked = null;     // 手札から選んだカード
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
        this.renderCount();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
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
        this.picked = null;
        this.queue = [];
        this.paused = false;
        this.wasActive = true; // 再開した直後は「自分の番」を鳴らさない
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は再生しない
        this.display = this.fromView(this.view);
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.afterIdle();
        this.controller.scheduleCpu();
    }

    newGame() {
        const count = this.settings.count;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {} });
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
        $('#count-down').addEventListener('click', () => this.changeCount(-1));
        $('#count-up').addEventListener('click', () => this.changeCount(1));
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

        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) this.pickCard(Number(card.dataset.card));
        });
        $('#rows').addEventListener('click', (event) => {
            const row = event.target.closest('[data-row]');
            if (row && this.canChooseRow()) this.controller?.send({ type: 'takeRow', row: Number(row.dataset.row) });
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'hint') this.showHint();
            if (button.dataset.act === 'play' && this.picked !== null) this.playPicked();
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    changeCount(delta) {
        this.settings.count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, this.settings.count + delta));
        saveSettings(this.settings);
        this.renderCount();
    }

    renderCount() {
        $('#count-value').textContent = `${this.settings.count}人`;
        $('#count-down').disabled = this.settings.count <= MIN_PLAYERS;
        $('#count-up').disabled = this.settings.count >= MAX_PLAYERS;
    }

    renderTitleArt() {
        $('#title-art').innerHTML = [12, 34, 55, 66, 90].map((card, i) => cardHtml(card, { cls: `fan fan-${i}` })).join('');
    }

    renderHelpPictures() {
        // 置く列：末尾がカードより小さく、差がいちばん小さい列
        $('#help-place').innerHTML = `
            <div class="mini-row">${[12, 18].map(c => cardHtml(c)).join('')}<span class="arrow">←</span>${cardHtml(21, { cls: 'new' })}</div>
            <div class="mini-row">${[30, 33].map(c => cardHtml(c)).join('')}</div>`;
        $('#help-sixth').innerHTML = `<div class="mini-row">${[40, 44, 47, 50, 52].map(c => cardHtml(c)).join('')}<span class="arrow">←</span>${cardHtml(58, { cls: 'new' })}</div>`;
        $('#help-bulls').innerHTML = [3, 5, 10, 11, 55].map(c => cardHtml(c)).join('');
    }

    // ---- 操作 ----

    // 今、手札から出せるか（再生が終わっていて、まだ出していない）
    canPlay() {
        const view = this.view;
        return !!view && this.idle() && view.phase === 'select' && view.mySelection === null;
    }

    canChooseRow() {
        const view = this.view;
        return !!view && this.idle() && view.phase === 'chooseRow' && view.chooser === view.you;
    }

    idle() {
        return this.queue.length === 0 && this.timer === null && !this.paused;
    }

    // おすすめの手を示す。出す手ならそのカードを選んでおき、列を引き取る手ならその列を光らせる
    showHint() {
        if (!this.canPlay() && !this.canChooseRow()) return;
        const command = this.controller?.suggest();
        if (!command) return;
        this.hint = command;
        if (command.type === 'play') this.picked = command.card;
        music.play('select');
        this.render();
    }

    renderHint() {
        const active = this.canPlay() || this.canChooseRow();
        const c = this.hint;
        if (!active || !c || (c.type === 'play') !== this.canPlay()) {
            this.hint = null;
            return;
        }
        if (c.type === 'play' && this.picked === c.card) $('#actions [data-act="play"]')?.classList.add('suggested');
        if (c.type === 'takeRow') $(`#rows [data-row="${c.row}"]`)?.classList.add('suggested');
    }

    pickCard(card) {
        if (!this.canPlay()) return;
        // 選んだカードをもう一度押したら出す
        if (this.picked === card) return this.playPicked();
        music.play('select');
        this.picked = card;
        this.render();
    }

    playPicked() {
        const card = this.picked;
        this.picked = null;
        if (this.controller?.send({ type: 'play', card })) music.play('place');
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
        if (delay === null) return; // ダイアログを見ている間は止める
        if (delay === 0) return this.pump();
        this.timer = setTimeout(() => this.pump(), delay);
    }

    // ビューから、画面に描く状態を作る
    fromView(view) {
        return {
            rows: view.rows.map(row => [...row]),
            strip: view.pending.map(p => ({ ...p, done: false })),
            hand: view.hand.filter(card => card !== view.mySelection),
            mySelection: view.mySelection,
            bulls: view.players.map(p => p.bulls),
            scores: view.players.map(p => p.score),
            selected: view.players.map(p => p.selected),
            chooser: view.chooser,
            round: view.round,
            turn: view.turn
        };
    }

    // イベントを display に当てて描く。次までの間（ミリ秒）を返す。null なら止める
    step(event) {
        const d = this.display;
        const you = this.view.you;
        switch (event.type) {
        case 'selected':
            d.selected[event.seat] = true;
            this.renderPlayers();
            return 0;
        case 'deal':
            Object.assign(d, { rows: event.rows, hand: event.hand, strip: [], mySelection: null, chooser: null, round: event.round, turn: 1 });
            d.bulls = d.bulls.map(() => 0);
            d.selected = d.selected.map(() => false);
            this.render();
            music.play('shuffle');
            return STEP_MS.deal;
        case 'reveal': {
            // 各自のカードを、持ち主の札（自分は手札の場所）から、小さい順に並べた帯へ飛ばす
            const from = Object.fromEntries(event.plays.map(p => [p.seat, rectOf(p.seat === you ? $('#hand') : $(`[data-player="${p.seat}"]`))]));
            d.strip = event.plays.map(p => ({ ...p, done: false }));
            d.hand = d.hand.filter(card => !event.plays.some(p => p.seat === you && p.card === card));
            d.mySelection = null;
            d.selected = d.selected.map(() => false);
            this.render();
            event.plays.forEach((p, i) => {
                const target = $(`#strip [data-strip="${i}"] .card`);
                fly(cardHtml(p.card), from[p.seat], rectOf(target), { delay: i * 40, hide: target, size: rectOf(target) });
            });
            music.play('draw', { delay: 0.15 });
            return STEP_MS.reveal;
        }
        case 'chooseRow':
            d.chooser = event.seat;
            this.render();
            // 自分が選ぶ番なら、ここで止まって押されるのを待つ（ロジックも待っている）
            return event.seat === you && this.queue.length === 0 ? 0 : STEP_MS.chooseRow;
        case 'take': {
            const cards = [...document.querySelectorAll(`#rows [data-row="${event.row}"] .card`)].map(el => ({ card: Number(el.dataset.card), rect: rectOf(el) }));
            const to = rectOf(event.seat === you ? $('#my-score') : $(`[data-player="${event.seat}"]`));
            d.rows[event.row] = [];
            d.bulls[event.seat] += event.bulls;
            this.render();
            cards.forEach(({ card, rect }, i) => fly(cardHtml(card), rect, to, { delay: i * 50 }));
            this.bumpPlayer(event.seat);
            music.play(event.seat === you ? 'pay' : 'notify');
            return STEP_MS.take;
        }
        case 'place': {
            const index = d.strip.findIndex(p => !p.done && p.card === event.card);
            const from = rectOf($(`#strip [data-strip="${index}"] .card`));
            if (index >= 0) d.strip[index].done = true;
            d.rows = event.rows;
            d.chooser = null;
            this.render();
            const target = $(`#rows .card[data-card="${event.card}"]`);
            fly(cardHtml(event.card), from, rectOf(target), { hide: target });
            music.play('place');
            return STEP_MS.place;
        }
        case 'roundEnd':
            event.results.forEach(r => { d.scores[r.seat] = r.score; });
            d.strip = [];
            this.render();
            // 最後のラウンドなら、そのまま最後の結果へ
            if (this.queue[0]?.type === 'end') return 0;
            music.play('notify');
            this.showRoundResult(event);
            this.paused = true;
            return null;
        case 'end': {
            this.render();
            const winners = this.view.winners ?? [];
            music.play(!winners.includes(you) ? 'lose' : winners.length > 1 ? 'notify' : 'win');
            this.showResult();
            return null;
        }
        default:
            return 0;
        }
    }

    afterIdle() {
        if (!this.canPlay()) this.picked = null;
        // カードを出す・列を選ぶ番になったら知らせる
        const active = this.canPlay() || this.canChooseRow();
        if (active && !this.wasActive) music.play('turn');
        this.wasActive = active;
        if (this.view.phase === 'end' && !$('#result').open) this.showResult();
    }

    bumpPlayer(seat) {
        const el = seat === this.view.you ? $('#my-score') : $(`[data-player="${seat}"]`);
        el?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 380, delay: 380 });
    }

    // ---- 描く ----

    render() {
        if (!this.display) return;
        this.renderTop();
        this.renderPlayers();
        this.renderRows();
        this.renderHand();
        this.renderActions();
        this.renderHint();
    }

    renderTop() {
        const d = this.display;
        const you = this.view.you;
        $('#round-info').innerHTML = `第${d.round}ラウンド<span class="turn">${Math.min(d.turn, HAND_SIZE)} / ${HAND_SIZE}</span>`;
        const plus = d.bulls[you] > 0 ? `<span class="plus">+${d.bulls[you]}</span>` : '';
        $('#my-score').innerHTML = `${bullIcon()}<b>${d.scores[you]}</b>${plus}`;
    }

    renderPlayers() {
        const view = this.view;
        const d = this.display;
        const others = view.players.filter(p => p.id !== view.you);
        const el = $('#players');
        el.style.setProperty('--cols', Math.min(3, others.length));
        el.innerHTML = others.map(p => {
            const status = d.chooser === p.id ? '<span class="status choosing" title="列を選んでいます">…</span>'
                : d.selected[p.id] ? '<span class="status done" title="出しました">✓</span>' : '<span class="status"></span>';
            const plus = d.bulls[p.id] > 0 ? `<span class="plus">+${d.bulls[p.id]}</span>` : '';
            return `<div class="player ${d.chooser === p.id ? 'active' : ''}" data-player="${p.id}">
                <span class="p-name">${escapeHtml(p.name)}</span>
                <span class="p-score">${bullIcon()}<b>${d.scores[p.id]}</b>${plus}</span>${status}
            </div>`;
        }).join('');
    }

    renderRows() {
        const d = this.display;
        const choosing = this.canChooseRow();
        $('#rows').innerHTML = d.rows.map((row, index) => {
            const slots = Array.from({ length: ROW_LIMIT + 1 }, (_, i) => {
                if (row[i] !== undefined) return `<div class="slot">${cardHtml(row[i])}</div>`;
                return `<div class="slot ${i === ROW_LIMIT ? 'sixth' : 'empty'}">${i === ROW_LIMIT ? bullIcon('sixth-bull') : ''}</div>`;
            }).join('');
            const bulls = sumBulls(row);
            const tag = choosing ? 'button' : 'div';
            return `<${tag} class="row ${choosing ? 'choosable' : ''}" data-row="${index}" ${choosing ? `aria-label="${index + 1}列目を引き取る（牛${bulls}）"` : ''}>
                ${slots}<span class="row-bulls">${bullIcon()}<b>${bulls}</b></span>
            </${tag}>`;
        }).join('');
    }

    renderHand() {
        const d = this.display;
        const strip = $('#strip');
        const hand = $('#hand');
        // 公開したカードがあるあいだは、手札の代わりに小さい順の帯を出す
        if (d.strip.length > 0) {
            hand.hidden = true;
            strip.hidden = false;
            strip.style.setProperty('--n', d.strip.length);
            const current = d.strip.findIndex(p => !p.done);
            strip.innerHTML = d.strip.map((p, i) => `<div class="strip-item ${p.done ? 'done' : ''} ${i === current ? 'current' : ''} ${p.seat === this.view.you ? 'mine' : ''}" data-strip="${i}">
                ${cardHtml(p.card)}<span class="s-name">${escapeHtml(this.view.players[p.seat].name)}</span></div>`).join('');
            return;
        }
        strip.hidden = true;
        hand.hidden = false;
        const playable = this.canPlay();
        // 枚数が多いときは重ねる（最後の1枚だけ全部見せる）
        const n = d.hand.length;
        hand.style.gridTemplateColumns = n > 1 ? `repeat(${n - 1}, minmax(0, calc(var(--cw) + 4px))) var(--cw)` : 'var(--cw)';
        hand.className = `hand ${playable ? 'playable' : ''}`;
        hand.innerHTML = d.hand.map(card => cardHtml(card, { cls: card === this.picked ? 'picked' : '', attrs: playable ? 'role="button"' : '' })).join('');
    }

    renderActions() {
        const view = this.view;
        const d = this.display;
        let html = '';
        if (this.canChooseRow()) {
            html = `<span class="act-label">引き取る列を選ぶ</span>`;
        } else if (this.canPlay()) {
            const card = this.picked !== null ? cardHtml(this.picked, { cls: 'tiny' }) : '';
            html = `${card}<button class="btn small primary" data-act="play" ${this.picked === null ? 'disabled' : ''}>出す</button>`;
        } else if (this.idle() && view.phase === 'select' && d.mySelection !== null) {
            html = `${cardHtml(d.mySelection, { cls: 'tiny' })}<span class="act-label muted">ほかの人を待っています</span>`;
        } else if (d.chooser !== null && d.chooser !== view.you) {
            html = `<span class="act-label muted">${escapeHtml(view.players[d.chooser].name)}が引き取る列を選んでいます</span>`;
        }
        // ヒントのボタン（自分が選ぶ番だけ出す）
        if (this.canPlay() || this.canChooseRow()) html = `<button type="button" id="hint" class="icon-btn" data-act="hint" aria-label="ヒント" title="おすすめの手"><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg></button>${html}`;
        $('#actions').innerHTML = html;
    }

    // ---- ダイアログ ----

    showRoundResult(event) {
        const players = this.view.players;
        const rows = [...event.results].sort((a, b) => a.score - b.score);
        $('#round-title').textContent = `第${event.round}ラウンドの結果`;
        $('#round-list').innerHTML = rows.map(r => `<li class="${r.seat === this.view.you ? 'me' : ''}">
            <span class="r-name">${escapeHtml(players[r.seat].name)}</span>
            <span class="r-plus">${r.bulls > 0 ? `+${r.bulls}` : ''}</span>
            <span class="r-score">${bullIcon()}<b>${r.score}</b></span></li>`).join('');
        $('#round-note').textContent = `だれかが${END_SCORE}点に達するまで続きます`;
        $('#round-result').showModal();
    }

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end' || $('#result').open) return;
        const ranked = [...view.players].sort((a, b) => a.score - b.score);
        const youWon = view.winners.includes(view.you);
        $('#result-title').textContent = youWon ? (view.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${view.winners.map(id => view.players[id].name).join('と')}の勝ち`;
        $('#result-list').innerHTML = ranked.map(p => `<li class="${view.winners.includes(p.id) ? 'winner' : ''} ${p.id === view.you ? 'me' : ''}">
            <span class="r-name">${escapeHtml(p.name)}</span><span class="r-score">${bullIcon()}<b>${p.score}</b></span></li>`).join('');
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
