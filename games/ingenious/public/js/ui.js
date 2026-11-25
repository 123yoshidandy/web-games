/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 置き方：手札のタイルを押して選び（もう一度押すと上下が入れ替わる）、盤のマスを押すと、そこに上の記号、となりに下の記号の下書きが出る。
 * となりのマスを押すか回転のボタンで向きを変え、「置く」で決める。盤のマスが小さいときは、最初のタップでその辺りを大きく出す
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { COLORS, COLOR_ORDER } from './colors.js';
import { CELLS, CELL_COUNT, NEIGHBORS, START_SYMBOLS } from './board.js';
import { symbolsSvg, hexPoints, symbolUse, symbolIcon, tileSvg, icon } from './art.js';

const SETTINGS_KEY = 'ingenious.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 1200;
const S = 10;                           // マスの中心から角まで（盤の座標）
const H = Math.sqrt(3) * S;             // マスの高さ
const ROTATE_ORDER = [2, 1, 0, 5, 4, 3]; // 画面で時計回りの向き（上・右上・右下・下・左下・左上）
const MIN_CELL_PX = 30;                 // これより小さく描かれるときは、タップで大きくする
const ZOOM = 2.5;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const center = (cell) => {
    const { q, r } = CELLS[cell];
    return { x: 1.5 * S * q, y: H * (r + q / 2) };
};

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [1, 2, 3, 4].includes(saved.count) ? saved.count : 2,
            team: !!saved.team,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 2, team: false, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// a に color を置いたときの点（b の向きは数えない）
function linePoints(board, a, b, color) {
    let points = 0;
    for (let d = 0; d < 6; d++) {
        let c = NEIGHBORS[a][d];
        if (c === b) continue;
        while (c >= 0 && board[c] === color) {
            points++;
            c = NEIGHBORS[c][d];
        }
    }
    return points;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.sel = null;     // 置こうとしているもの { index, flip, anchor, dir }
        this.zoom = null;    // 大きく出している中心 { x, y }
        this.resultTimer = null;
        this.prevTiles = 0;
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
        this.sel = null;
        this.zoom = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.lastSeq = view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.prevTiles = view.tiles.length;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level, team } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        const mode = count === 1 ? 'solo' : count === 4 && team ? 'team' : 'standard';
        this.startGame({ players, options: { mode } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
        const segment = (selector, attr, apply) => $(selector).addEventListener('click', (event) => {
            const button = event.target.closest(`button[${attr}]`);
            if (!button) return;
            apply(button.getAttribute(attr));
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#player-count', 'data-count', (v) => { this.settings.count = Number(v); });
        segment('#team-mode', 'data-team', (v) => { this.settings.team = v === '1'; });
        segment('#cpu-level', 'data-level', (v) => { this.settings.level = v; });
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

        $('#hand').addEventListener('click', (event) => {
            const b = event.target.closest('[data-index]');
            if (!b || !this.myTurn('place')) return;
            const index = Number(b.dataset.index);
            if (this.sel?.index === index) this.sel.flip = !this.sel.flip;
            else this.sel = { index, flip: false, anchor: this.sel?.anchor ?? null, dir: this.sel?.dir ?? 5 };
            this.render();
        });
        $('#board').addEventListener('click', (event) => this.tapBoard(event));
        $('#act').addEventListener('click', (event) => {
            const b = event.target.closest('button[data-act]');
            if (!b || b.disabled) return;
            const act = b.dataset.act;
            if (act === 'rotate') this.rotate();
            else if (act === 'place') this.confirm();
            else if (act === 'zoom-out') {
                this.zoom = null;
                this.render();
            } else if (act === 'swap' || act === 'keep') this.send({ type: act });
        });
    }

    send(command) {
        this.controller?.send(command);
    }

    myTurn(phase) {
        const v = this.view;
        return !!v && v.phase === phase && v.answering.includes(v.you);
    }

    // ---- 置く ----

    selectedColors() {
        const t = this.view.players[this.view.you].hand[this.sel.index];
        return this.sel.flip ? [t[1], t[0]] : [t[0], t[1]];
    }

    open(cell) {
        const v = this.view;
        return cell >= 0 && CELLS[cell].ring <= v.radius && v.board[cell] === null;
    }

    // 最初の手番の決まりに合うか
    firstOk(cells) {
        const v = this.view;
        if (v.players[v.you].placed > 0 || !v.freeSymbols.length) return true;
        return v.freeSymbols.some(s => cells.some(c => NEIGHBORS[s].includes(c)));
    }

    validPair(a, b) {
        return this.open(a) && this.open(b) && this.firstOk([a, b]);
    }

    // anchor から、向き dir を起点に時計回りで、置ける向きを探す
    findDir(anchor, from) {
        const start = ROTATE_ORDER.indexOf(from);
        for (let k = 0; k < 6; k++) {
            const d = ROTATE_ORDER[(start + k) % 6];
            if (this.validPair(anchor, NEIGHBORS[anchor][d])) return d;
        }
        for (let k = 0; k < 6; k++) {
            const d = ROTATE_ORDER[(start + k) % 6];
            if (this.open(NEIGHBORS[anchor][d])) return d;
        }
        return from;
    }

    tapBoard(event) {
        if (!this.myTurn('place')) return;
        const el = event.target.closest('[data-cell]');
        // 小さく描かれているときは、まずその辺りを大きく出す
        if (!this.zoom && this.cellPx() < MIN_CELL_PX) {
            const p = this.toBoard(event);
            if (p) {
                this.zoom = p;
                this.render();
            }
            return;
        }
        if (!el) return;
        const cell = Number(el.dataset.cell);
        if (!this.sel) {
            this.toast('手札のタイルを選んでください');
            return;
        }
        const { anchor } = this.sel;
        if (anchor !== null && cell === anchor) {
            this.sel.flip = !this.sel.flip; // 同じマスをもう一度押したら、上下を入れ替える
        } else if (anchor !== null && NEIGHBORS[anchor].includes(cell) && this.open(cell)) {
            this.sel.dir = NEIGHBORS[anchor].indexOf(cell);
        } else if (this.open(cell)) {
            this.sel.anchor = cell;
            this.sel.dir = this.findDir(cell, this.sel.dir ?? 5);
        } else {
            return;
        }
        this.render();
    }

    rotate() {
        if (!this.sel || this.sel.anchor === null) return;
        const next = ROTATE_ORDER[(ROTATE_ORDER.indexOf(this.sel.dir) + 1) % 6];
        this.sel.dir = this.findDir(this.sel.anchor, next);
        this.render();
    }

    pending() {
        if (!this.sel || this.sel.anchor === null || !this.view.players[this.view.you].hand[this.sel.index]) return null;
        const a = this.sel.anchor;
        const b = NEIGHBORS[a][this.sel.dir];
        return { cells: [a, b], colors: this.selectedColors(), ok: this.validPair(a, b) };
    }

    confirm() {
        const p = this.pending();
        if (!p?.ok) return;
        this.send({ type: 'place', tile: p.colors, cells: p.cells });
    }

    // ---- 盤の座標 ----

    baseBox() {
        const R = this.view?.radius ?? 5;
        const w = 2 * (1.5 * S * R + S) + 4;
        const h = 2 * (H * R + H / 2) + 4;
        return { x: -w / 2, y: -h / 2, w, h };
    }

    viewBox() {
        const b = this.baseBox();
        if (!this.zoom) return b;
        const w = b.w / ZOOM;
        const h = b.h / ZOOM;
        const x = Math.min(b.x + b.w - w, Math.max(b.x, this.zoom.x - w / 2));
        const y = Math.min(b.y + b.h - h, Math.max(b.y, this.zoom.y - h / 2));
        return { x, y, w, h };
    }

    // 1マスの高さが画面で何ピクセルか（大きくしていないとき）
    cellPx() {
        const svg = $('#board');
        const b = this.baseBox();
        const scale = Math.min(svg.clientWidth / b.w, svg.clientHeight / b.h);
        return H * scale;
    }

    toBoard(event) {
        const svg = $('#board');
        const m = svg.getScreenCTM();
        if (!m) return null;
        const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
        return { x: pt.x, y: pt.y };
    }

    // ---- タイトル ----

    renderSetup() {
        const s = this.settings;
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === s.count)));
        document.querySelectorAll('#team-mode button').forEach(b => b.setAttribute('aria-checked', String((b.dataset.team === '1') === s.team)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === s.level)));
        $('#row-team').hidden = s.count !== 4;
        $('#row-level').hidden = s.count === 1;
    }

    // 盤の一部：記号が並んだタイル
    renderTitleArt() {
        const tiles = [
            [[0, 0], [0, 1], 'red', 'blue'], [[1, 0], [1, 1], 'red', 'green'], [[-1, 1], [-1, 2], 'yellow', 'blue'],
            [[1, -1], [2, -1], 'purple', 'orange'], [[-1, 0], [-2, 1], 'purple', 'yellow'], [[2, 0], [2, 1], 'orange', 'green']
        ];
        const body = tiles.map(([a, b, ca, cb]) => [[a, ca], [b, cb]].map(([[q, r], color]) => {
            const x = 1.5 * S * q;
            const y = H * (r + q / 2);
            return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><polygon class="tile-hex" points="${hexPoints(S * 0.96)}"/>${symbolUse(color, 12)}</g>`;
        }).join('')).join('');
        $('#title-art').innerHTML = `<svg viewBox="-42 -19 84 64">${body}</svg>`;
    }

    renderHelp() {
        $('#help-colors').innerHTML = COLOR_ORDER.map(c => `<span class="help-color">${symbolIcon(c)}${COLORS[c].name}・${COLORS[c].shape}</span>`).join('');
        // 置いたタイル（赤と青）から、赤が2、青が1
        const cells = [
            [[0, 0], 'red', true], [[0, 1], 'blue', true], [[1, -1], 'red'], [[2, -2], 'red'], [[0, 2], 'blue'], [[-1, 0], 'green'],
            [[-1, 1], null], [[1, 0], null], [[1, 1], null], [[-1, 2], null], [[0, -1], null], [[2, -1], 'purple']
        ];
        const body = cells.map(([[q, r], color, fresh]) => {
            const x = 1.5 * S * q;
            const y = H * (r + q / 2);
            const hex = color ? `<polygon class="tile-hex ${fresh ? 'fresh' : ''}" points="${hexPoints(S * 0.96)}"/>${symbolUse(color, 12)}` : `<polygon class="cell" points="${hexPoints(S * 0.96)}"/>`;
            return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">${hex}</g>`;
        }).join('');
        $('#help-diagram').innerHTML = `<svg viewBox="-27 -28 68 73">${body}</svg>
            <p class="caption">光るタイルを置くと、赤は右上へ2つで2点、青は下へ1つで1点</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        if (!this.myTurn('place')) {
            this.sel = null;
            this.zoom = null;
        } else if (this.sel && !view.players[view.you].hand[this.sel.index]) {
            this.sel = null;
        }
        if (this.sel?.anchor !== null && this.sel?.anchor !== undefined && !this.open(this.sel.anchor)) this.sel.anchor = null;
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        this.renderStatus(view);
        this.renderScores(view, fresh);
        this.renderBoard(view);
        this.renderHand(view);
        this.renderAct(view);
        this.renderNote(view);
        if (view.phase !== 'end') fresh.filter(e => e.type === 'ingenious').forEach(e => {
            const who = e.seat === view.you ? '' : `${view.players[e.seat].name}：`;
            this.toast(`${who}インジーニアス！（${COLORS[e.color].name}）もう1枚`);
        });
        if ($('#log').open) this.renderLog();
        if (view.phase === 'end' && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    sideName(view, i) {
        return view.sides[i].members.map(id => (id === view.you ? 'あなた' : view.players[id].name)).join('・');
    }

    renderStatus(view) {
        let text = '';
        if (view.phase !== 'end' && view.mode !== 'solo') text = view.current === view.you ? 'あなたの番' : `${escapeHtml(view.players[view.current].name)}の番`;
        $('#status').innerHTML = `${text}<span class="bag">袋 ${view.bagCount}</span>`;
    }

    renderScores(view, fresh) {
        const raised = new Map();
        fresh.filter(e => e.type === 'place').forEach(e => {
            const side = view.players[e.seat].side;
            Object.entries(e.gains).forEach(([c, v]) => { if (v > 0) raised.set(`${side}:${c}`, true); });
        });
        const currentSide = view.phase === 'end' ? -1 : view.players[view.current].side;
        $('#scores').dataset.rows = String(view.sides.length);
        $('#scores').innerHTML = view.sides.map((s, i) => {
            const low = Math.min(...COLOR_ORDER.map(c => s.scores[c]));
            const chips = COLOR_ORDER.map(c => {
                const cls = [s.scores[c] === low ? 'low' : '', s.scores[c] >= view.maxScore ? 'max' : '', raised.has(`${i}:${c}`) ? 'up' : ''].join(' ');
                return `<span class="chip ${cls}">${symbolIcon(c)}<b>${s.scores[c]}</b></span>`;
            }).join('');
            return `<div class="score-row ${i === currentSide ? 'current' : ''}"><span class="who">${escapeHtml(this.sideName(view, i))}</span><span class="chips">${chips}</span></div>`;
        }).join('');
    }

    renderBoard(view) {
        const box = this.viewBox();
        $('#board').setAttribute('viewBox', `${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`);
        const tileCells = new Set(view.tiles.flatMap(t => t.cells));
        const mine = this.myTurn('place');
        const hints = new Set();
        if (mine && view.players[view.you].placed === 0) {
            view.freeSymbols.forEach(s => NEIGHBORS[s].forEach(c => { if (this.open(c)) hints.add(c); }));
        }
        let cells = '';
        for (let c = 0; c < CELL_COUNT; c++) {
            if (CELLS[c].ring > view.radius || tileCells.has(c)) continue;
            const { x, y } = center(c);
            const t = `transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"`;
            if (START_SYMBOLS.has(c)) {
                cells += `<g ${t}><polygon class="printed" points="${hexPoints(S * 0.96)}"/>${symbolUse(START_SYMBOLS.get(c), 12)}</g>`;
            } else {
                cells += `<polygon class="cell ${hints.has(c) ? 'hint' : ''}" data-cell="${c}" points="${hexPoints(S * 0.96)}" ${t}/>`;
            }
        }
        $('#cells').innerHTML = cells;
        // 置いたタイル（2つの六角をつなぐ帯の上に描く）。この手番に置いたものは縁を光らせ、新しいものは落とす
        const lastTurn = this.lastTurnTiles(view);
        $('#placed').innerHTML = view.tiles.map((tile, i) => {
            const [p, q] = tile.cells.map(center);
            const cls = [lastTurn.has(i) ? 'last' : '', i >= this.prevTiles ? 'drop' : ''].join(' ');
            const hexes = tile.cells.map((c, k) => {
                const { x, y } = center(c);
                return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><polygon class="tile-hex" points="${hexPoints(S * 0.96)}"/>${symbolUse(tile.colors[k], 12)}</g>`;
            }).join('');
            return `<g class="tile ${cls}"><line class="bridge" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"/>${hexes}</g>`;
        }).join('');
        this.prevTiles = view.tiles.length;
        // 下書き
        const p = mine ? this.pending() : null;
        $('#preview').innerHTML = p ? p.cells.map((c, k) => {
            if (c < 0) return '';
            const { x, y } = center(c);
            return `<g class="ghost ${p.ok ? '' : 'bad'}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><polygon class="tile-hex" points="${hexPoints(S * 0.96)}"/>${symbolUse(p.colors[k], 12)}</g>`;
        }).join('') : '';
    }

    // 最後の手番に置いたタイル（その人が続けて置いた分）
    lastTurnTiles(view) {
        const set = new Set();
        if (!view.tiles.length) return set;
        if (view.mode === 'solo') return new Set([view.tiles.length - 1]); // 1人用は、いつも同じ人なので最後の1枚だけ
        const seat = view.tiles.at(-1).seat;
        for (let i = view.tiles.length - 1; i >= 0 && view.tiles[i].seat === seat; i--) set.add(i);
        return set;
    }

    renderHand(view) {
        const me = view.players[view.you];
        const mine = this.myTurn('place');
        $('#hand').innerHTML = (me.hand ?? []).map((t, i) => {
            const selected = this.sel?.index === i;
            const colors = selected && this.sel.flip ? [t[1], t[0]] : t;
            return `<button class="tile-btn ${selected ? 'selected' : ''}" data-index="${i}" ${mine ? '' : 'disabled'}>${tileSvg(colors)}</button>`;
        }).join('');
    }

    renderAct(view) {
        let html = '';
        if (this.myTurn('place')) {
            const p = this.pending();
            html = `${this.zoom ? `<button class="icon-btn" data-act="zoom-out" aria-label="小さく" title="小さく">${icon('zoomOut')}</button>` : ''}
                <button class="icon-btn" data-act="rotate" aria-label="向きを変える" title="向きを変える" ${p ? '' : 'disabled'}>${icon('rotate')}</button>
                <button class="btn primary small" data-act="place" ${p?.ok ? '' : 'disabled'}>置く</button>`;
        } else if (this.myTurn('swap')) {
            html = '<button class="btn primary small" data-act="swap">取り替え</button><button class="btn secondary small" data-act="keep">そのまま</button>';
        }
        $('#act').innerHTML = html;
    }

    renderNote(view) {
        let text = '';
        if (view.phase === 'end') text = '';
        else if (this.myTurn('swap')) {
            const s = view.sides[view.players[view.you].side].scores;
            const low = Math.min(...COLOR_ORDER.map(c => s[c]));
            text = `手札に${COLOR_ORDER.filter(c => s[c] === low).map(c => symbolIcon(c)).join('')}がありません。取り替えますか`;
        } else if (this.myTurn('place')) {
            const p = this.pending();
            const bonus = view.bonus > 0 || this.bonusTurn(view) ? 'もう1枚：' : '';
            if (!this.sel) text = `${bonus}手札のタイルを選ぶ`;
            else if (!p) text = this.zoom || this.cellPx() >= MIN_CELL_PX ? `${bonus}置くマスを選ぶ` : `${bonus}置く辺りを押す`;
            else if (!p.ok) text = view.players[view.you].placed === 0 ? '最初は光る記号のとなりに' : 'そこには置けません';
            else text = this.gainText(view, p) || '得点なし';
        } else if (view.mode !== 'solo') {
            text = `${escapeHtml(view.players[view.current].name)}が考えています`;
        }
        $('#note').innerHTML = text;
    }

    // 続けて置いている（インジーニアスのあと）
    bonusTurn(view) {
        const last = view.tiles.at(-1);
        return !!last && last.seat === view.you && view.current === view.you && view.events.at(-1)?.type !== 'turn';
    }

    gainText(view, p) {
        const [a, b] = p.cells;
        const gains = {};
        gains[p.colors[0]] = (gains[p.colors[0]] ?? 0) + linePoints(view.board, a, b, p.colors[0]);
        gains[p.colors[1]] = (gains[p.colors[1]] ?? 0) + linePoints(view.board, b, a, p.colors[1]);
        return Object.entries(gains).filter(([, v]) => v > 0).map(([c, v]) => `<span class="gain">${symbolIcon(c)}+${v}</span>`).join('');
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
        if (!v || v.phase !== 'end') return;
        const final = (s) => Math.min(...COLOR_ORDER.map(c => s.scores[c]));
        if (v.mode === 'solo') {
            $('#result-title').textContent = `いちばん低い色は ${final(v.sides[0])} 点`;
        } else {
            const mySide = v.players[v.you].side;
            const names = v.winners.map(i => this.sideName(v, i));
            $('#result-title').textContent = v.winners.length > 1 ? `${names.join('と')}の引き分け`
                : v.winners[0] === mySide ? (v.mode === 'team' ? 'あなたの組の勝ち' : 'あなたの勝ち') : `${names[0]}の勝ち`;
        }
        const order = v.sides.map((s, i) => i).sort((x, y) => {
            const a = COLOR_ORDER.map(c => v.sides[x].scores[c]).sort((p, q) => p - q);
            const b = COLOR_ORDER.map(c => v.sides[y].scores[c]).sort((p, q) => p - q);
            for (let k = 0; k < 6; k++) if (a[k] !== b[k]) return b[k] - a[k];
            return x - y;
        });
        $('#result-list').innerHTML = order.map(i => {
            const s = v.sides[i];
            const low = final(s);
            const chips = COLOR_ORDER.map(c => `<span class="chip ${s.scores[c] === low ? 'low' : ''}">${symbolIcon(c)}<b>${s.scores[c]}</b></span>`).join('');
            return `<li class="${v.winners.includes(i) && v.mode !== 'solo' ? 'winner' : ''}"><span class="name">${escapeHtml(this.sideName(v, i))}</span><b class="final">${low}</b><span class="chips">${chips}</span></li>`;
        }).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.innerHTML = escapeHtml(message);
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}
