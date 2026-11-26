/**
 * 画面（タイトル・ゲーム・結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 列は縦の柱として横に並べる（1本に3枚まで）。自分の手番では、各列の下に「今取ったら何点増えるか」を出す
 * - 引く：下の「山から引く」。引いたカードは下に表で出し、置ける列が光る。列を押すとそこに置く
 * - 取る：列を押して選び、「この列を取る」で決める
 */

import { JOKER, PLUS2, ROW_LIMIT, COLOR_NAMES } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { gainOf } from './cpu-player.js';
import { symbolsSvg, chameleon, cardHtml, cardBackHtml } from './art.js';
import { captureAnchors, playEvents } from './animator.js';

const SETTINGS_KEY = 'coloretto.settings';
const CPU_NAMES = ['ルル', 'ポポ', 'ミミ', 'ココ'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [3, 4, 5].includes(saved.count) ? saved.count : 4,
            table: saved.table === 'gray' ? 'gray' : 'brown'
        };
    } catch {
        return { count: 4, table: 'brown' };
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
        this.selectedRow = null; // 取るつもりで選んだ列
        this.lastSeq = 0;
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
        this.renderSettings();
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
        this.selectedRow = null;
        this.view = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, this.settings.count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: { table: this.settings.table } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        if ($('#result').open) $('#result').close();
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('#table-select').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-table]');
            if (!button) return;
            this.settings.table = button.dataset.table;
            saveSettings(this.settings);
            this.renderSettings();
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
        $('#open-help-game').addEventListener('click', () => {
            this.controller?.pause();
            $('#help').showModal();
        });
        $('#help').addEventListener('close', () => this.controller?.resume());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hint').addEventListener('click', () => this.showHint());
        $('#rows').addEventListener('click', (event) => {
            const column = event.target.closest('[data-row]');
            if (!column || !this.view) return;
            const row = Number(column.dataset.row);
            if (this.myTurn('place')) {
                if (this.openRows().includes(row)) this.controller?.send({ type: 'place', row });
            } else if (this.myTurn('play') && this.takableRows().includes(row)) {
                this.selectedRow = this.selectedRow === row ? null : row;
                this.render();
            }
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            const act = button.dataset.act;
            if (act === 'draw') {
                this.selectedRow = null;
                this.controller?.send({ type: 'draw' });
            } else if (act === 'take' && this.selectedRow !== null) {
                const row = this.selectedRow;
                this.selectedRow = null;
                this.controller?.send({ type: 'take', row });
            } else if (act === 'cancel') {
                this.selectedRow = null;
                this.render();
            }
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSettings() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#table-select button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.table === this.settings.table)));
    }

    renderTitleArt() {
        $('#title-art').innerHTML = ['red', 'yellow', JOKER, 'green', 'blue'].map((card, i) => cardHtml(card, { cls: `fan fan-${i}` })).join('');
    }

    renderHelpPictures() {
        $('#help-table').innerHTML = `<tr><th>枚数</th>${[1, 2, 3, 4, 5, '6+'].map(n => `<td>${n}</td>`).join('')}</tr>
            <tr><th>ふつう</th>${[1, 3, 6, 10, 15, 21].map(n => `<td>${n}</td>`).join('')}</tr>
            <tr><th>上級</th>${[1, 4, 8, 7, 6, 5].map(n => `<td>${n}</td>`).join('')}</tr>`;
        $('#help-cards').innerHTML = cardHtml(JOKER) + cardHtml(PLUS2);
    }

    // ---- 状態 ----

    myTurn(phase) {
        const view = this.view;
        return !!view && view.current === view.you && view.phase === phase;
    }

    openRows() {
        return this.view.rows.map((r, i) => (!r.taken && r.cards.length < ROW_LIMIT ? i : -1)).filter(i => i >= 0);
    }

    takableRows() {
        return this.view.rows.map((r, i) => (!r.taken && r.cards.length > 0 ? i : -1)).filter(i => i >= 0);
    }

    me() {
        return this.view.players[this.view.you];
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        this.view = view;
        if (!this.myTurn('play') || (this.selectedRow !== null && !this.takableRows().includes(this.selectedRow))) this.selectedRow = null;

        this.renderTop();
        this.renderPlayers();
        this.renderRows();
        this.renderMe();
        this.renderActions();

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        playEvents(fresh, before, { you: view.you });
        if (fresh.some(e => e.type === 'lastRound')) this.toast('最後のラウンドのカードが出ました。このラウンドで終わりです');
        else if (fresh.some(e => e.type === 'roundEnd') && view.phase !== 'end') this.toast(`第${view.round}ラウンド`);
        if (view.phase === 'end' && !$('#result').open) setTimeout(() => this.showResult(), 700);
    }

    renderTop() {
        const view = this.view;
        $('#round-info').innerHTML = `第${view.round}ラウンド${view.lastRound ? '<span class="last-badge">最後</span>' : ''}`;
        $('#deck').innerHTML = `${cardBackHtml('mini')}<b>${view.deckCount}</b>`;
    }

    // 集めたカード：色ごとの枚数。プラスの3色は縁取り、マイナスの色は薄く。ジョーカーと +2 は別に
    collectionHtml(player) {
        const view = this.view;
        const colors = view.colors.map(color => {
            const n = player.counts[color];
            const joker = player.jokerAssignment[color] ?? 0;
            const sign = n + joker === 0 ? 'none' : player.positive.includes(color) ? 'pos' : 'neg';
            return `<span class="col-chip c-${color} ${sign}" title="${COLOR_NAMES[color]}">${n}${joker ? `<i>+${joker}</i>` : ''}</span>`;
        }).join('');
        const extra = `${player.jokers ? `<span class="col-chip c-joker" title="ジョーカー">${player.jokers}</span>` : ''}${player.plus2 ? `<span class="col-chip c-plus2" title="+2">+${player.plus2 * 2}</span>` : ''}`;
        return `<span class="collection">${colors}${extra}</span>`;
    }

    renderPlayers() {
        const view = this.view;
        const order = view.players.map((_, i) => (view.you + 1 + i) % view.players.length).filter(i => i !== view.you);
        $('#players').innerHTML = order.map(seat => {
            const p = view.players[seat];
            const active = view.current === seat && view.phase !== 'end';
            return `<div class="player ${active ? 'active' : ''} ${p.took ? 'took' : ''}" data-player="${seat}">
                <span class="p-name">${escapeHtml(p.name)}</span>${this.collectionHtml(p)}
                <span class="p-score">${p.score}</span></div>`;
        }).join('');
    }

    renderRows() {
        const view = this.view;
        const me = this.me();
        const placing = this.myTurn('place');
        const playing = this.myTurn('play');
        const open = this.openRows();
        const takable = this.takableRows();
        $('#rows').style.setProperty('--n', view.rows.length);
        $('#rows').innerHTML = view.rows.map((row, i) => {
            const slots = Array.from({ length: ROW_LIMIT }, (_, s) => (row.cards[s] !== undefined
                ? `<div class="slot" data-slot="${i}-${s}">${cardHtml(row.cards[s])}</div>`
                : `<div class="slot empty" data-slot="${i}-${s}"></div>`)).join('');
            const target = (placing && open.includes(i)) || (playing && takable.includes(i));
            let foot = '';
            if (row.taken) foot = '<span class="row-foot taken">済</span>';
            else if (playing && row.cards.length > 0) {
                const gain = gainOf(me, row.cards, view.table);
                foot = `<span class="row-foot ${gain > 0 ? 'plus' : gain < 0 ? 'minus' : ''}">${signed(gain)}</span>`;
            } else foot = '<span class="row-foot"></span>';
            return `<div class="row ${row.taken ? 'taken' : ''} ${target ? 'target' : ''} ${this.selectedRow === i ? 'selected' : ''}" data-row="${i}" ${target ? 'role="button"' : ''}>
                <div class="slots">${slots}</div>${foot}</div>`;
        }).join('');
    }

    renderMe() {
        const view = this.view;
        const me = this.me();
        const active = view.current === me.id && view.phase !== 'end';
        $('#me').className = `me ${active ? 'active' : ''} ${me.took ? 'took' : ''}`;
        $('#me').innerHTML = `<span class="p-name">あなた</span>${this.collectionHtml(me)}<span class="p-score big">${me.score}<small>点</small></span>`;
    }

    renderActions() {
        const view = this.view;
        let html;
        if (this.myTurn('place')) {
            html = `<span id="pending">${cardHtml(view.pending)}</span><span class="act-label">置く列を選ぶ</span>`;
        } else if (this.myTurn('play')) {
            const canDraw = this.openRows().length > 0;
            if (this.selectedRow !== null) {
                const gain = gainOf(this.me(), view.rows[this.selectedRow].cards, view.table);
                html = `<button class="btn small primary" data-act="take">この列を取る ${signed(gain)}</button>
                    <button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>`;
            } else {
                html = `<button class="btn small primary" data-act="draw" ${canDraw ? '' : 'disabled'}>${chameleon('btn-icon')}山から引く</button>${canDraw ? '' : '<span class="act-reason">置ける列がないので、列を取る</span>'}`;
            }
        } else if (view.phase === 'place') {
            html = `<span id="pending">${cardHtml(view.pending)}</span><span class="act-label muted">${escapeHtml(view.players[view.current].name)}が置く列を選んでいます</span>`;
        } else {
            html = `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        }
        $('#actions').innerHTML = html;
        const h = this.hint;
        if (h && h.key === view.logs.length) {
            if (h.command.type === 'place') $(`#rows [data-row="${h.command.row}"]`)?.classList.add('recommended');
            else $(`#actions [data-act="${h.command.type}"]`)?.classList.add('recommended');
        }
    }

    // ヒント：CPU（ふつう）が選ぶ操作。取る列は選んだ状態にし、押すものに印を付ける
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('自分の番になったら、おすすめを出せます');
        if (command.type === 'take') this.selectedRow = command.row;
        this.hint = { key: this.view.logs.length, command };
        this.render();
        const text = { place: '光る列に置く', take: 'この列を取る', draw: '山から引く' }[command.type];
        this.toast(`おすすめ：${text}`);
    }

    // ---- 結果 ----

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end' || $('#result').open || !view.results) return;
        const ranked = [...view.results].sort((a, b) => b.score - a.score);
        const youWon = view.winners.includes(view.you);
        $('#result-title').textContent = youWon ? (view.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${view.winners.map(id => view.players[id].name).join('と')}の勝ち`;
        $('#result-list').innerHTML = ranked.map(r => {
            const p = view.players[r.seat];
            return `<li class="${view.winners.includes(r.seat) ? 'winner' : ''} ${r.seat === view.you ? 'me' : ''}">
                <span class="r-name">${escapeHtml(p.name)}</span>${this.collectionHtml({ ...p, positive: r.positive, jokerAssignment: r.jokerAssignment })}
                <span class="r-score">${r.score}</span></li>`;
        }).join('');
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
