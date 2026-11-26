/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send() に渡す
 * 置き方：手札を押して選び、光るマスを押す。または、手札から盤へ指で引っぱる。置いたタイルを押すと手札に戻る
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { checkPlacements, keyOf, frontier, generateMoves, HAND_SIZE } from './board.js';
import { tileDefs, tileGroup, tileSvg } from './art.js';
import { HELP_HTML } from './help.js';

const SETTINGS_KEY = 'qwirkle.settings';
const CPU_NAMES = ['ノア', 'エマ', 'レオ'];
const CELL = 100;
const DRAG_START = 8;   // これだけ指が動いたら、引っぱりとみなす

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
    home: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
    hint: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
    log: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6" fill="currentColor"/><circle cx="4" cy="12" r=".6" fill="currentColor"/><circle cx="4" cy="18" r=".6" fill="currentColor"/></svg>',
    help: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>'
};

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 2,
            level: s.level === 'easy' ? 'easy' : 'normal'
        };
    } catch {
        return { count: 2, level: 'normal' };
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
        this.selected = null;     // 選んだ手札の位置
        this.pending = [];        // 置いている途中のタイル：{ x, y, tile, index }（index は手札の位置）
        this.trading = false;     // 交換を選んでいるか
        this.tradeSet = new Set();
        this.resultShown = false;
        this.drag = null;
        $('defs').innerHTML = tileDefs();
        $('home').innerHTML = ICONS.home;
        $('open-help-game').innerHTML = ICONS.help;
        $('hint').innerHTML = ICONS.hint;
        $('open-log').innerHTML = ICONS.log;
        $('title-art').innerHTML = this.titleArt();
        this.bindTitle();
        this.bindGame();
        document.addEventListener('contextmenu', event => event.preventDefault());
    }

    // タイトルの絵：オレンジの列（横）と、ひし形の列（縦）が交わるところ。どちらもクワークル
    titleArt() {
        const tiles = [0, 1, 2, 3, 4, 5].map(shape => tileGroup(1 * 6 + shape, shape * CELL, 2 * CELL, CELL));
        [0, 2, 1, 3, 4, 5].forEach((color, y) => { if (y !== 2) tiles.push(tileGroup(color * 6 + 2, 2 * CELL, y * CELL, CELL)); });
        return `<svg viewBox="-20 -20 640 640" aria-hidden="true">${tiles.join('')}</svg>`;
    }

    // ---- タイトル ----

    bindTitle() {
        $('count').addEventListener('click', event => {
            const b = event.target.closest('button');
            if (!b) return;
            this.settings.count = Number(b.dataset.count);
            saveSettings(this.settings);
            this.renderTitle();
        });
        $('level').addEventListener('click', event => {
            const b = event.target.closest('button');
            if (!b) return;
            this.settings.level = b.dataset.level;
            saveSettings(this.settings);
            this.renderTitle();
        });
        $('start').addEventListener('click', () => this.start());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startWith(saved);
        });
        $('open-help-title').addEventListener('click', () => this.openHelp());
    }

    renderTitle() {
        $('count').querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.count) === this.settings.count));
        $('level').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.level === this.settings.level));
        $('resume').hidden = !loadSavedGame();
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.closeSheet();
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
        this.renderTitle();
    }

    start() {
        const { count, level } = this.settings;
        const players = Array.from({ length: count }, (_, i) => (i === 0
            ? { name: 'あなた', isCPU: false }
            : { name: CPU_NAMES[i - 1], isCPU: true, level }));
        clearSavedGame();
        this.startWith({ players, options: {} });
    }

    startWith(setup) {
        this.controller?.stop();
        this.resultShown = false;
        this.resetTurn();
        this.closeSheet();
        try {
            this.controller = new LocalGameController(setup, {
                onUpdate: () => this.update(),
                onError: (message) => this.toast(message)
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.toast('続きを読み込めませんでした');
            this.renderTitle();
            return;
        }
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.update();
        this.controller.scheduleCpu();
    }

    resetTurn() {
        this.selected = null;
        this.pending = [];
        this.trading = false;
        this.tradeSet = new Set();
        this.hinted = false; // ヒントで手を選んだ（決定を光らせる）
    }

    // ---- ゲーム ----

    bindGame() {
        $('home').addEventListener('click', () => this.showTitle());
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('undo').addEventListener('click', () => {
            this.hinted = false;
            if (this.trading) this.tradeSet.clear();
            else this.pending = [];
            this.selected = null;
            this.render();
        });
        $('trade').addEventListener('click', () => {
            if (!this.myTurn()) return;
            this.trading = !this.trading;
            this.pending = [];
            this.selected = null;
            this.tradeSet = new Set();
            this.render();
        });
        $('commit').addEventListener('click', () => this.commit());
        $('hint').addEventListener('click', () => this.showHint());
        $('open-log').addEventListener('click', () => this.openLog());
        $('board').addEventListener('click', event => {
            if (this.suppressClick) return;
            const cell = event.target.closest('[data-x]');
            if (cell) this.tapCell(Number(cell.dataset.x), Number(cell.dataset.y));
        });
        $('hand').addEventListener('pointerdown', event => this.pointerDown(event));
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && this.sheetKind !== 'result') this.closeSheet();
        });
        $('sheet').addEventListener('click', event => {
            const b = event.target.closest('[data-i]');
            if (b) this.sheetHandlers?.[Number(b.dataset.i)]?.();
        });
    }

    myTurn() {
        const v = this.view;
        return v && v.phase !== 'end' && v.current === v.you;
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        const prev = this.view;
        this.view = v;
        // 手番が変わったら、置いている途中のものを消す
        if (!prev || prev.turnNo !== v.turnNo) this.resetTurn();
        this.render();
        if (v.phase === 'end' && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.openResult(), 700);
        }
    }

    boardMap() {
        return new Map(this.view.board.map(p => [keyOf(p.x, p.y), p.tile]));
    }

    myHand() {
        return this.view.players[this.view.you].hand ?? [];
    }

    // 選んだタイルを置けるマス
    targets(tile) {
        const board = this.boardMap();
        const temp = new Map(board);
        this.pending.forEach(p => temp.set(keyOf(p.x, p.y), p.tile));
        const cells = temp.size ? frontier(temp) : [{ x: 0, y: 0 }];
        return cells.filter(c => checkPlacements(board, [...this.pending, { x: c.x, y: c.y, tile }], { partial: true }).ok);
    }

    // 置いている途中のタイルを決めたときの結果
    pendingResult() {
        if (!this.pending.length) return null;
        return checkPlacements(this.boardMap(), this.pending, { firstSize: this.view.firstSize });
    }

    render() {
        const v = this.view;
        if (!v) return;
        // 得点の欄
        $('scores').innerHTML = v.players.map(p => `<div class="sc${p.id === v.current && v.phase !== 'end' ? ' cur' : ''}${v.winners.includes(p.id) ? ' win' : ''}">`
            + `<span class="sc-name">${escapeHtml(p.name)}</span><b>${p.score}</b><small>${p.handCount}枚</small></div>`).join('');
        $('bag').innerHTML = `<span class="bag-icon"></span>${v.bagCount}`;
        this.renderBoard();
        this.renderHand();
        // 状態の欄と、ボタン
        const mine = this.myTurn();
        const result = this.pendingResult();
        let status = '';
        if (v.phase === 'end') status = '';
        else if (!mine) status = `${escapeHtml(v.players[v.current].name)}の番`;
        else if (this.trading) status = '交換するタイルを選ぶ';
        else if (this.pending.length) status = result?.ok ? `${result.score}点${result.qwirkles ? '・クワークル！' : ''}` : '';
        else if (v.firstSize) status = `最初は、そろった${v.firstSize}枚の組を置く`;
        else if (!this.canPlay() && v.bagCount === 0) status = '置けるタイルがありません';
        const last = v.lastMove && !this.pending.length && !this.trading ? this.lastText(v) : '';
        $('status').innerHTML = status || last;
        $('undo').disabled = !mine || (this.trading ? !this.tradeSet.size : !this.pending.length);
        $('trade').disabled = !mine || !!v.firstSize || v.bagCount === 0;
        $('trade').classList.toggle('on', this.trading);
        $('hint').disabled = !mine;
        const commit = $('commit');
        commit.classList.toggle('suggested', mine && this.hinted);
        if (this.trading) {
            commit.textContent = this.tradeSet.size ? `${this.tradeSet.size}枚を交換` : '交換';
            commit.disabled = !mine || !this.tradeSet.size || this.tradeSet.size > v.bagCount;
        } else if (mine && !this.pending.length && v.bagCount === 0 && !this.canPlay()) {
            commit.textContent = 'パス';
            commit.disabled = false;
        } else {
            commit.textContent = result?.ok ? `決定 +${result.score}` : '決定';
            commit.disabled = !mine || !result?.ok;
        }
    }

    canPlay() {
        return generateMoves(this.boardMap(), this.myHand(), { firstSize: this.view.firstSize }).length > 0;
    }

    lastText(v) {
        const m = v.lastMove;
        const name = escapeHtml(v.players[m.seat].name);
        if (m.type === 'play') return `${name}：${m.count}枚 +${m.score}点${m.qwirkles ? '（クワークル！）' : ''}`;
        if (m.type === 'trade') return `${name}：${m.count}枚交換`;
        return `${name}：パス`;
    }

    renderBoard() {
        const v = this.view;
        const mine = this.myTurn() && !this.trading;
        const hand = this.myHand();
        const targets = mine && this.selected !== null ? this.targets(hand[this.selected]) : [];
        const lastCells = new Set((v.lastMove?.cells ?? []).map(c => keyOf(c.x, c.y)));
        // 盤の広さ：タイル・置いている途中・置ける場所が全部入るように、縮尺を自動で合わせる
        const all = [...v.board, ...this.pending, ...targets];
        if (!all.length) all.push({ x: 0, y: 0 });
        let minX = Math.min(...all.map(c => c.x)) - 1;
        let maxX = Math.max(...all.map(c => c.x)) + 1;
        let minY = Math.min(...all.map(c => c.y)) - 1;
        let maxY = Math.max(...all.map(c => c.y)) + 1;
        // 小さいうちは広げすぎない（最低 5×5 マス）
        const grow = (lo, hi, min) => {
            const span = hi - lo + 1;
            if (span >= min) return [lo, hi];
            const add = min - span;
            return [lo - Math.floor(add / 2), hi + Math.ceil(add / 2)];
        };
        [minX, maxX] = grow(minX, maxX, 5);
        [minY, maxY] = grow(minY, maxY, 5);
        const parts = [];
        // 置ける場所
        targets.forEach(c => parts.push(`<rect class="target" data-x="${c.x}" data-y="${c.y}" x="${c.x * CELL + 4}" y="${c.y * CELL + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="12"/>`));
        v.board.forEach(p => parts.push(tileGroup(p.tile, p.x * CELL, p.y * CELL, CELL, lastCells.has(keyOf(p.x, p.y)) ? 'last' : '')));
        this.pending.forEach(p => parts.push(`<g data-x="${p.x}" data-y="${p.y}">${tileGroup(p.tile, p.x * CELL, p.y * CELL, CELL, 'pending')}</g>`));
        const w = (maxX - minX + 1) * CELL;
        const h = (maxY - minY + 1) * CELL;
        $('board').innerHTML = `<svg class="board-svg" viewBox="${minX * CELL} ${minY * CELL} ${w} ${h}" preserveAspectRatio="xMidYMid meet">`
            + `<rect class="board-bg" x="${minX * CELL}" y="${minY * CELL}" width="${w}" height="${h}"/>${parts.join('')}</svg>`;
    }

    renderHand() {
        const hand = this.myHand();
        const used = new Set(this.pending.map(p => p.index));
        const mine = this.myTurn();
        const slots = [];
        for (let i = 0; i < HAND_SIZE; i++) {
            if (i >= hand.length) {
                slots.push('<div class="slot empty"></div>');
                continue;
            }
            const cls = ['slot', used.has(i) ? 'used' : '', this.selected === i ? 'sel' : '', this.tradeSet.has(i) ? 'trade' : '', mine ? '' : 'wait'].join(' ');
            slots.push(`<button class="${cls}" data-i="${i}" aria-label="タイル${i + 1}">${used.has(i) ? '' : tileSvg(hand[i])}</button>`);
        }
        $('hand').innerHTML = slots.join('');
    }

    // ---- ヒント・履歴 ----

    // おすすめの手を、そのまま選んだ状態にする（置く手は仮置き、交換は交換するタイルを選ぶ）。「決定」を押せば打てる
    showHint() {
        if (!this.myTurn()) return;
        const command = this.controller.suggest();
        if (!command) return;
        this.resetTurn();
        const hand = this.myHand();
        const take = (tile, used) => {
            const i = hand.findIndex((t, k) => t === tile && !used.has(k));
            used.add(i);
            return i;
        };
        if (command.type === 'play') {
            const used = new Set();
            this.pending = command.placements.map(p => ({ ...p, index: take(p.tile, used) }));
        } else if (command.type === 'trade') {
            this.trading = true;
            const used = new Set();
            command.tiles.forEach(t => take(t, used));
            this.tradeSet = used;
        }
        this.hinted = true;
        this.render();
    }

    openLog() {
        const logs = this.view?.logs ?? [];
        const html = logs.length
            ? `<ol class="log-list">${[...logs].reverse().map(l => `<li${l.head ? ' class="head"' : ''}>${escapeHtml(l.text)}</li>`).join('')}</ol>`
            : '<p class="sheet-text">まだ何も起きていません</p>';
        this.openSheet({ title: '履歴', html, buttons: [{ label: '閉じる', primary: true, run: () => {} }] });
    }

    // ---- 操作 ----

    tapHand(i) {
        if (!this.myTurn()) return;
        this.hinted = false;
        if (this.pending.some(p => p.index === i)) return;
        if (this.trading) {
            if (this.tradeSet.has(i)) this.tradeSet.delete(i);
            else this.tradeSet.add(i);
        } else {
            this.selected = this.selected === i ? null : i;
        }
        this.render();
    }

    tapCell(x, y) {
        if (!this.myTurn() || this.trading) return;
        this.hinted = false;
        // 置いている途中のタイルを押したら、手札に戻す
        const k = this.pending.findIndex(p => p.x === x && p.y === y);
        if (k >= 0) {
            this.pending.splice(k, 1);
            this.render();
            return;
        }
        if (this.selected === null) return;
        this.placeAt(this.selected, x, y);
    }

    placeAt(index, x, y) {
        const tile = this.myHand()[index];
        if (!this.targets(tile).some(c => c.x === x && c.y === y)) return false;
        this.pending.push({ x, y, tile, index });
        this.selected = null;
        this.render();
        return true;
    }

    commit() {
        const v = this.view;
        if (!this.myTurn()) return;
        if (this.trading) {
            const hand = this.myHand();
            this.controller.send({ type: 'trade', tiles: [...this.tradeSet].map(i => hand[i]) });
            return;
        }
        if (!this.pending.length && v.bagCount === 0 && !this.canPlay()) {
            this.controller.send({ type: 'pass' });
            return;
        }
        if (!this.pendingResult()?.ok) return;
        this.controller.send({ type: 'play', placements: this.pending.map(({ x, y, tile }) => ({ x, y, tile })) });
    }

    // 手札を押す（そのまま離せば選ぶ、動かせば盤へ引っぱる）
    // 引っぱっている間は手札を描き直さない（押した要素が作り直されると、指の動きを受け取れなくなる）。動きは window で受ける
    pointerDown(event) {
        const slot = event.target.closest('[data-i]');
        if (!slot || !this.myTurn() || this.trading) {
            if (slot && this.trading) this.tapHand(Number(slot.dataset.i));
            return;
        }
        const index = Number(slot.dataset.i);
        if (this.pending.some(p => p.index === index)) return;
        const start = { x: event.clientX, y: event.clientY };
        const id = event.pointerId;
        let dragging = false;
        const ghost = $('drag');
        const move = (e) => {
            if (e.pointerId !== id) return;
            if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_START) {
                dragging = true;
                this.selected = index;
                this.renderBoard();
                slot.classList.add('sel');
                ghost.innerHTML = tileSvg(this.myHand()[index]);
                ghost.hidden = false;
            }
            if (dragging) ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 70}px)`;
        };
        const up = (e) => {
            if (e.pointerId !== id) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            ghost.hidden = true;
            if (!dragging) {
                this.tapHand(index);
                return;
            }
            // 指の少し上（タイルの見えている位置）のマスに置く
            const target = document.elementFromPoint(e.clientX, e.clientY - 42)?.closest('[data-x]');
            if (!target || !this.placeAt(index, Number(target.dataset.x), Number(target.dataset.y))) {
                this.selected = null;
                this.render();
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    }

    // ---- シート ----

    openHelp() {
        this.openSheet({ title: '遊び方', html: HELP_HTML, buttons: [{ label: '閉じる', run: () => this.closeSheet() }] });
    }

    openResult() {
        const v = this.view;
        const ranked = [...v.players].sort((a, b) => b.score - a.score);
        const won = v.winners.includes(v.you);
        const reason = v.endReason === 'out' ? '袋が空になり、手札を出し切った人が出ました' : '誰も置けなくなりました';
        const rows = ranked.map(p => `<tr class="${v.winners.includes(p.id) ? 'win' : ''}"><td>${escapeHtml(p.name)}</td><td>${p.score}点</td></tr>`).join('');
        this.openSheet({
            kind: 'result',
            title: won ? (v.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${escapeHtml(v.players[v.winners[0]].name)}の勝ち`,
            html: `<p class="sheet-text">${reason}</p><table class="score-table">${rows}</table>`,
            buttons: [
                { label: 'もう一度', primary: true, run: () => this.start() },
                { label: 'ホーム', run: () => this.showTitle() }
            ]
        });
    }

    openSheet({ kind = 'info', title, html, buttons = [] }) {
        this.sheetKind = kind;
        $('sheet-title').textContent = title;
        $('sheet-body').innerHTML = html;
        $('sheet-buttons').innerHTML = buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : 'secondary'}" data-i="${i}">${b.label}</button>`).join('');
        this.sheetHandlers = buttons.map(b => () => {
            this.closeSheet();
            b.run();
        });
        $('overlay').hidden = false;
        $('sheet-body').scrollTop = 0;
    }

    closeSheet() {
        this.sheetKind = null;
        $('overlay').hidden = true;
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
