/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * - 自分の駒を押すと、動ける先のマスが光る。光るマスを押すと動く
 * - 先に手札のカードを押すと、そのカードの動きだけが光る（もう一度押すと外れる）
 * - 2枚のどちらでも行けるマスを押したときは、使うカードを選ぶ（カードが光る）
 * - 動けないときは、カードを押すと脇のカードと入れ替える
 * 自分は下。オンラインで朱の席のときは、盤を180度回して描く
 */

import { CARDS, CARD_IDS, TEMPLE, seatOf, isMaster } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, pieceSvg, templeSvg, cardHtml, gridSvg, SEAT_NAME } from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'onitama.settings';
const RESULT_DELAY_MS = 900;
const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', strong: 'つよい' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { level: CPU_LEVELS.includes(saved.level) ? saved.level : 'normal' };
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
        this.lastSeq = 0;
        this.selPiece = null;   // 選んだ自分の駒のマス
        this.selCard = null;    // 絞り込みに選んだカード
        this.pendingTo = null;  // 2枚のどちらでも行けるマス（カードを選んでもらう）
        this.slide = null;      // 駒の動きの演出 { from, to }
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
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.clearSelection();
        this.resultShown = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const level = this.settings.level;
        this.startGame({ players: [{ name: 'あなた', isCPU: false }, { name: `CPU（${LEVEL_NAMES[level]}）`, isCPU: true, cpuLevel: level }], options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
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
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#board').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-sq]');
            if (cell) this.onCell(Number(cell.dataset.sq));
        });
        $('#row-bottom').addEventListener('click', (event) => {
            const card = event.target.closest('button.card[data-card]');
            if (card) this.onCard(card.dataset.card);
        });
    }

    // ---- 操作 ----

    myTurn() {
        const v = this.view;
        return !!v && !v.over && v.current === v.you;
    }

    // おすすめの手を示す。駒と行き先を選んでおき、使うカードを光らせる（カードを押せば動く）
    showHint() {
        if (!this.myTurn()) return;
        const command = this.controller?.suggest();
        if (!command) return;
        this.clearSelection();
        if (command.type === 'move') {
            this.selPiece = command.from;
            this.pendingTo = command.to;
        }
        this.hint = command;
        music.play('select');
        this.render();
    }

    clearSelection() {
        this.hint = null;
        this.selPiece = null;
        this.selCard = null;
        this.pendingTo = null;
    }

    // 今の選び方で行けるマス
    targets() {
        if (!this.myTurn() || this.selPiece === null) return [];
        return this.view.moves.filter(m => m.from === this.selPiece && (!this.selCard || m.card === this.selCard)).map(m => m.to);
    }

    onCell(sq) {
        const v = this.view;
        if (!this.myTurn() || v.mustPass) return;
        this.hint = null;
        if (seatOf(v.board[sq]) === v.you) {
            this.selPiece = this.selPiece === sq ? null : sq;
            this.pendingTo = null;
            music.play(this.selPiece === null ? 'cancel' : 'select');
            return this.render();
        }
        if (this.selPiece === null || !this.targets().includes(sq)) {
            this.clearSelection();
            return this.render();
        }
        const cards = [...new Set(v.moves.filter(m => m.from === this.selPiece && m.to === sq && (!this.selCard || m.card === this.selCard)).map(m => m.card))];
        if (cards.length === 1) return this.send({ type: 'move', card: cards[0], from: this.selPiece, to: sq });
        this.pendingTo = sq;
        music.play('select');
        this.render();
    }

    onCard(card) {
        const v = this.view;
        if (!this.myTurn() || !v.hands[v.you].includes(card)) return;
        if (v.mustPass) return this.send({ type: 'pass', card });
        if (this.pendingTo !== null) {
            const ok = v.moves.some(m => m.card === card && m.from === this.selPiece && m.to === this.pendingTo);
            if (ok) return this.send({ type: 'move', card, from: this.selPiece, to: this.pendingTo });
        }
        this.selCard = this.selCard === card ? null : card;
        this.pendingTo = null;
        music.play(this.selCard === null ? 'cancel' : 'select');
        this.render();
    }

    send(command) {
        const ok = this.controller?.send(command);
        if (ok) this.clearSelection();
        else this.render();
        return ok;
    }

    // ---- タイトル・遊び方 ----

    renderSetup() {
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        $('#title-art').innerHTML = ['tiger', 'dragon', 'crane'].map((card, i) => `<span class="fan" style="--i:${i - 1}">${cardHtml(card)}</span>`).join('');
    }

    renderHelp() {
        const cards = CARD_IDS.map(id => `<li>${gridSvg(id, { cls: 'mini' })}<span>${CARDS[id].name}<small>${CARDS[id].stamp === 'blue' ? '藍' : '朱'}</small></span></li>`).join('');
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>5×5 の盤で、師匠1つと弟子4つを動かします。相手の師匠を取るか（石の道）、自分の師匠を相手の神殿の門（相手の師匠が最初にいたマス）に入れたら（川の道）勝ちです。</p>
            <h3>はじめに</h3>
            <p>動きのカード16枚から5枚を使います。各自2枚を手札にし、1枚を脇に置きます。脇のカードの右上の印の色（藍か朱）の人が先手です。</p>
            <h3>手番</h3>
            <ul class="help-list">
                <li><strong>動く</strong><span>手札のカード1枚を選び、自分の駒1つを、カードの図の色の付いたマスへ動かす。真ん中の黒いマスが駒。図は自分から見た向き</span></li>
                <li><strong>取る</strong><span>相手の駒のマスに動いたら、その駒を取る。ほかの駒は飛び越えてよい。盤の外と自分の駒のマスには動けない</span></li>
                <li><strong>入れ替える</strong><span>使ったカードを、相手の向きに回して脇に置き、脇にあったカードを手札に入れる</span></li>
            </ul>
            <p>動ける手があれば必ず動きます。どのカードでも動けないときだけ、駒を動かさずにカード1枚を脇と入れ替えます。</p>
            <h3>引き分け</h3>
            <p>同じ局面（盤・手札・脇・手番）が3回目に現れたら千日手で引き分け。300手で決着がつかないときも引き分けです。</p>
            <h3>操作</h3>
            <p>自分の駒を押すと、行ける先が光ります。光るマスを押すと動きます。先にカードを押すと、そのカードの動きだけが光ります。2枚のどちらでも行けるマスでは、使うカードを押して選びます。</p>
            <h3>動きのカード（16枚）</h3>
            <ul class="card-list">${cards}</ul>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        if (!this.myTurn()) this.clearSelection();
        $('#hint').disabled = !this.myTurn();
        this.playEvents(view, prev);
        this.renderStatus(view);
        this.renderBoard(view);
        this.renderRows(view);
        if ($('#log').open) this.renderLog();
        if (view.over && !$('#result').open && !this.resultTimer && !this.resultShown) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    statusText(view) {
        if (view.over) {
            if (view.winner === null) return '引き分け';
            return view.winner === view.you ? 'あなたの勝ち' : '相手の勝ち';
        }
        if (!this.myTurn()) return '相手の番';
        if (view.mustPass) return '動けない。カードを1枚脇へ';
        if (this.pendingTo !== null) return 'カードを選ぶ';
        return 'あなたの番';
    }

    renderStatus(view) {
        const seat = view.current;
        const dot = view.over ? '' : `<span class="dot s${seat}"></span>`;
        const repeat = !view.over && view.repeat >= 2 ? `<span class="repeat" title="同じ局面が3回目で引き分け">同じ局面 ${view.repeat}回目</span>` : '';
        $('#status').innerHTML = `${dot}<span>${escapeHtml(this.statusText(view))}</span>${repeat}`;
    }

    // 盤は、自分が下になる向きで描く
    displaySq(i) {
        return this.view.you === 1 ? 24 - i : i;
    }

    renderBoard(view) {
        const targets = new Set(this.targets());
        const last = view.lastMove && !view.lastMove.pass ? view.lastMove : null;
        const mine = this.myTurn() && !view.mustPass;
        const cells = [];
        for (let i = 0; i < 25; i++) {
            const sq = this.displaySq(i);
            const p = view.board[sq];
            const s = seatOf(p);
            const cls = [
                'cell',
                (Math.floor(i / 5) + i) % 2 ? 'alt' : '',
                targets.has(sq) ? 'target' : '',
                this.pendingTo === sq ? 'pending' : '',
                this.selPiece === sq ? 'selected' : '',
                mine && s === view.you && view.moves.some(m => m.from === sq) && this.selPiece === null ? 'can' : '',
                last && (last.from === sq || last.to === sq) ? 'last' : ''
            ].join(' ');
            const temple = TEMPLE.includes(sq) ? `<span class="temple-mark t${TEMPLE.indexOf(sq)}">${templeSvg()}</span>` : '';
            const piece = p ? `<span class="piece-wrap ${this.slide?.to === sq ? 'slide' : ''}" ${this.slide?.to === sq ? `style="--dx:${this.slide.dx};--dy:${this.slide.dy}"` : ''}>${pieceSvg(s, isMaster(p))}</span>` : '';
            cells.push(`<button class="${cls}" data-sq="${sq}" aria-label="マス${sq}">${temple}${piece}${targets.has(sq) && p ? '<span class="hit"></span>' : ''}</button>`);
        }
        $('#board').innerHTML = cells.join('');
        this.slide = null;
    }

    renderRows(view) {
        const me = view.you;
        const them = 1 - me;
        const sideRow = view.over ? null : view.current;
        const row = (seat, bottom) => {
            const hand = view.hands[seat].map(card => {
                const cls = [];
                if (bottom && this.myTurn()) {
                    if (view.mustPass) cls.push('choose');
                    else if (this.pendingTo !== null) {
                        if (view.moves.some(m => m.card === card && m.from === this.selPiece && m.to === this.pendingTo)) cls.push('choose');
                    } else if (this.selCard === card) cls.push('picked');
                    if (this.hint?.card === card) cls.push('suggested');
                    else if (this.selCard) cls.push('dim');
                }
                return cardHtml(card, { flip: !bottom, cls: cls.join(' '), tag: bottom ? 'button' : 'div', attrs: bottom ? 'type="button"' : '' });
            }).join('');
            const side = sideRow === seat
                ? `<div class="side-slot"><span class="side-label">次</span>${cardHtml(view.side, { flip: !bottom, cls: `side compact ${this.freshSide ? 'fresh' : ''}` })}</div>`
                : `<div class="side-slot empty"><span class="who s${seat}">${SEAT_NAME[seat]}</span></div>`;
            return `${hand}${side}`;
        };
        $('#row-top').innerHTML = row(them, false);
        $('#row-bottom').innerHTML = row(me, true);
        $('#row-bottom').classList.toggle('active', this.myTurn());
        this.freshSide = false;
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        const move = [...fresh].reverse().find(e => e.type === 'move');
        // 音：終わったら勝ち負け、自分の手は置く・取る、相手の手のあとは自分の番
        if (view.over && !prev.over) music.play(view.winner === null ? 'notify' : view.winner === view.you ? 'win' : 'lose');
        else if (move?.seat === view.you) music.play(move.captured ? 'capture' : 'place');
        else if (move) music.play(this.myTurn() ? 'turn' : 'notify');
        if (!move) return;
        this.freshSide = true;
        if (move.pass || reduceMotion()) return;
        // 駒が元のマスから滑ってくる（表示の向きでの差）
        const pos = (sq) => {
            const i = view.you === 1 ? 24 - sq : sq;
            return [i % 5, Math.floor(i / 5)];
        };
        const [fc, fr] = pos(move.from);
        const [tc, tr] = pos(move.to);
        this.slide = { to: move.to, dx: fc - tc, dy: fr - tr };
        if (move.captured && move.seat !== view.you) this.toast(isMaster(move.captured) ? '師匠を取られました' : '弟子を取られました');
    }

    // ---- ダイアログ ----

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
        if (!v || !v.over) return;
        this.resultShown = true;
        const way = { stone: '石の道：相手の師匠を取った', stream: '川の道：師匠が相手の神殿の門に入った', repetition: '千日手：同じ局面が3回目', limit: '300手で決着がつかない' }[v.result];
        $('#result-title').textContent = v.winner === null ? '引き分け' : (v.winner === v.you ? 'あなたの勝ち' : '相手の勝ち');
        $('#result-text').textContent = `${way}（${v.ply}手）`;
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
