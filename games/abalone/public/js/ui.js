/**
 * アバロンの画面
 * - 盤は自分が下に来るように描く（白なら 180 度回す。マスの番号を逆に読むだけで回せる）
 * - 自分の玉を押して選ぶ（一列なら3個まで。両端を押すと真ん中も選ぶ）。選ぶと、動かせる向きにだけ矢印を出す。赤い矢印は押し出し
 * - 玉は出来事（動いた玉と押された玉の元と先）に合わせて滑らせる。盤の外へ押し出された玉は、外へ動いてから消える
 * - 各人の欄に、押し出した数を6つの丸で出す
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { createState, lineAxis, STEP, SIZE, BLACK, WHITE, LAYOUTS } from './rules.js';
import { COLOR_NAMES } from './game.js';
import * as art from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'abalone.settings';
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const keyOf = (cells) => cells.slice().sort((a, b) => a - b).join(',');

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
        return { level: s?.level === 'easy' ? 'easy' : 'normal', layout: Object.hasOwn(LAYOUTS, s?.layout ?? '') ? s.layout : 'standard' };
    } catch {
        return { level: 'normal', layout: 'standard' };
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
        this.flip = false;
        this.selection = [];
        this.marbles = new Map(); // 論理のマス → 玉の要素
        this.seenSeq = 0;
        this.shownCaptured = {};
        this.resultShown = false;
        this.buildBoard();
        this.bind();
        $('title-art').appendChild(art.diagram(createState().board));
    }

    // ---- 組み立て ----

    buildBoard() {
        const svg = $('board');
        svg.setAttribute('viewBox', `0 0 ${art.WIDTH} ${art.HEIGHT}`);
        svg.classList.add('board-svg');
        svg.style.setProperty('--board-ratio', String(art.WIDTH / art.HEIGHT));
        art.addDefs();
        art.drawBoard(svg);
        this.layers = {};
        for (const name of ['marks', 'marbles', 'overlay', 'hits', 'arrows']) this.layers[name] = art.el('g', { class: name }, svg);
        for (let v = 0; v < SIZE; v++) {
            const [x, y] = art.cellXY(v);
            art.el('circle', { class: 'hit', 'data-cell': v, cx: x, cy: y, r: art.S / 2 }, this.layers.hits);
        }
    }

    bind() {
        const seg = (id, key) => $(id).addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            this.settings[key] = b.dataset[key];
            saveSettings(this.settings);
            this.renderSettings();
        });
        seg('level', 'level');
        seg('layout', 'layout');
        $('start').addEventListener('click', () => this.startNew());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.start(saved);
        });
        $('home').addEventListener('click', () => this.showTitle());
        const help = $('help');
        $('open-help-title').addEventListener('click', () => help.showModal());
        $('open-help-game').addEventListener('click', () => {
            this.controller?.pause();
            help.showModal();
        });
        help.addEventListener('close', () => this.controller?.resume());
        $('hint').addEventListener('click', () => this.showHint());
        $('open-log').addEventListener('click', () => this.showLog());
        document.querySelectorAll('dialog').forEach(d => {
            d.querySelector('.close')?.addEventListener('click', () => d.close());
            if (d.id !== 'result') d.addEventListener('click', e => { if (e.target === d) d.close(); });
        });
        $('look').addEventListener('click', () => $('result').close());
        $('again').addEventListener('click', () => {
            $('result').close();
            this.startNew();
        });
        $('result-home').addEventListener('click', () => {
            $('result').close();
            this.showTitle();
        });
        $('clear').addEventListener('click', () => {
            music.play('cancel');
            this.selection = [];
            this.render();
        });
        $('board').addEventListener('click', e => {
            const arrow = e.target.closest('.arrow');
            if (arrow) return this.onArrow(Number(arrow.dataset.dir));
            const hit = e.target.closest('.hit');
            if (hit) this.onCell(this.toLogic(Number(hit.dataset.cell)));
        });
        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- 回す ----

    toView(c) {
        return this.flip ? SIZE - 1 - c : c;
    }

    toLogic(v) {
        return this.flip ? SIZE - 1 - v : v;
    }

    dirToView(d) {
        return this.flip ? (d + 3) % 6 : d;
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.renderSettings();
        $('resume').hidden = !loadSavedGame();
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
    }

    renderSettings() {
        document.querySelectorAll('#level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
        document.querySelectorAll('#layout button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.layout === this.settings.layout)));
    }

    startNew() {
        clearSavedGame();
        this.start({ players: [{ name: 'あなた' }, { name: 'CPU', isCPU: true }], options: { layout: this.settings.layout }, level: this.settings.level });
    }

    start(setup) {
        this.controller?.stop();
        this.controller = new LocalGameController(setup, {
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            }
        });
        this.resultShown = this.controller.game.isOver();
        this.selection = [];
        this.marbles.forEach(g => g.remove());
        this.marbles.clear();
        this.seenSeq = this.controller.game.eventSeq;
        this.soundSeq = this.controller.game.eventSeq;
        this.shownCaptured = {};
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.render({ still: true });
        this.controller.scheduleCpu();
    }

    // ---- 描画 ----

    get myTurn() {
        const v = this.view;
        return !!v && !v.over && v.current === v.seat;
    }

    get myColor() {
        return this.view.players[this.view.seat].color;
    }

    nameOf(seat) {
        return seat === this.view.seat ? 'あなた' : this.view.players[seat].name;
    }

    render({ still = false } = {}) {
        const view = this.controller.getView();
        this.view = view;
        this.flip = this.myColor === WHITE;
        if (!this.myTurn) this.selection = [];
        if (this.hintMove && keyOf(this.hintMove.cells) !== keyOf(this.selection)) this.hintMove = null;
        this.selection = this.selection.filter(c => view.board[c] === this.myColor);
        this.renderTurn();
        this.renderPanels(still);
        this.renderMarbles(still);
        this.renderMarks();
        this.playSounds(view);
        if (view.over && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.showResult(), 800);
        }
    }

    renderTurn() {
        const v = this.view;
        $('turn-info').textContent = v.over ? `${this.nameOf(v.winner)}の勝ち`
            : !this.myTurn ? `${this.nameOf(v.current)}の番`
            : this.selection.length ? '矢印で動かす' : '玉を選ぶ（3個まで）';
        $('clear').hidden = !this.selection.length;
        $('hint').disabled = !this.myTurn;
    }

    panelHtml(p, still) {
        const v = this.view;
        const opp = p.color === BLACK ? 'white' : 'black';
        const before = still ? p.captured : (this.shownCaptured[p.id] ?? p.captured);
        const pips = Array.from({ length: 6 }, (_, i) => `<span class="pip${i < p.captured ? ` filled ${opp}` : ''}${i >= before && i < p.captured ? ' new' : ''}"></span>`).join('');
        this.shownCaptured[p.id] = p.captured;
        const first = p.id === v.first ? '・先手' : '';
        return `<span class="stone ${p.color === BLACK ? 'black' : 'white'}"></span>
            <div class="who"><span class="name">${escapeHtml(this.nameOf(p.id))}</span><span class="color-name">${COLOR_NAMES[p.color]}${first}</span></div>
            <div class="score" title="押し出した数">${pips}<span class="count">${p.captured}/6</span></div>`;
    }

    renderPanels(still) {
        const v = this.view;
        const me = v.players[v.seat];
        const rival = v.players[1 - v.seat];
        $('rival').innerHTML = this.panelHtml(rival, still);
        $('me').innerHTML = this.panelHtml(me, still);
        $('rival').classList.toggle('active', !v.over && v.current === rival.id);
        $('me').classList.toggle('active', !v.over && v.current === me.id);
    }

    // 玉：新しい出来事に合わせて動かす。盤と食い違ったら描き直す
    renderMarbles(still) {
        const v = this.view;
        const layer = this.layers.marbles;
        const events = still ? [] : v.events.filter(e => e.seq > this.seenSeq && e.type === 'move');
        this.seenSeq = v.eventSeq;
        for (const e of events) {
            const moving = [...e.moves, ...e.pushed].map(([from, to]) => ({ from, to, g: this.marbles.get(from) }));
            moving.forEach(m => this.marbles.delete(m.from));
            for (const m of moving) {
                if (!m.g) continue;
                m.g.classList.remove('still');
                if (m.to === -1) {
                    // 盤の外へ：押した向きに1マス分動かしてから消す
                    const [x, y] = art.cellXY(this.toView(m.from));
                    const [dx, dy] = art.dirXY(this.dirToView(e.dir));
                    m.g.style.transform = `translate(${x + dx * art.S * 1.1}px, ${y + dy * art.S * 1.1}px)`;
                    m.g.classList.add('gone');
                    setTimeout(() => m.g.remove(), 400);
                } else {
                    this.marbles.set(m.to, m.g);
                    art.placeMarble(m.g, this.toView(m.to));
                }
            }
        }
        // 盤と照らし合わせる
        let ok = true;
        for (let c = 0; c < SIZE; c++) {
            const g = this.marbles.get(c);
            const color = v.board[c];
            if (!color && g) ok = false;
            if (color && (!g || g.classList.contains('black') !== (color === BLACK))) ok = false;
        }
        if (!ok || events.length === 0) {
            if (!ok || still || this.lastFlip !== this.flip) {
                this.marbles.forEach(g => g.remove());
                this.marbles.clear();
                v.board.forEach((color, c) => {
                    if (!color) return;
                    const g = art.createMarble(color, layer);
                    g.classList.add('still');
                    art.placeMarble(g, this.toView(c));
                    this.marbles.set(c, g);
                });
            }
        }
        this.lastFlip = this.flip;
    }

    // 選んだ玉・選べる玉・最後の手・矢印
    renderMarks() {
        const v = this.view;
        const L = this.layers;
        L.marks.replaceChildren();
        L.overlay.replaceChildren();
        L.arrows.replaceChildren();
        // 相手の最後の手で動いた先
        const last = [...v.events].reverse().find(e => e.type === 'move');
        if (last && last.seat !== v.seat) {
            last.moves.forEach(([, to]) => {
                const [x, y] = art.cellXY(this.toView(to));
                art.el('circle', { class: 'last', cx: x, cy: y, r: art.R_MARBLE + 3 }, L.marks);
            });
        }
        if (!this.myTurn) return;
        const sel = this.selection;
        if (!sel.length) return;
        sel.forEach(c => {
            const [x, y] = art.cellXY(this.toView(c));
            art.el('circle', { class: 'sel', cx: x, cy: y, r: art.R_MARBLE + 2 }, L.overlay);
        });
        // 矢印：選んだ玉の真ん中から、列の向きは先頭の先、横は少し横へ
        const key = keyOf(sel);
        const pts = sel.map(c => art.cellXY(this.toView(c)));
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const axis = lineAxis(sel);
        v.moves.filter(m => keyOf(m.cells) === key).forEach(m => {
            const vd = this.dirToView(m.dir);
            const [dx, dy] = art.dirXY(vd);
            const inline = axis === -1 || axis === m.dir % 3;
            const dist = inline ? ((sel.length - 1) / 2 + 1) * art.S : art.S * 0.95;
            const arrow = art.drawArrow(L.arrows, cx + dx * dist, cy + dy * dist, m.dir, m.push, vd);
            if (this.hintMove?.dir === m.dir) arrow.classList.add('recommended');
        });
    }

    // ---- 操作 ----

    onCell(c) {
        if (!this.myTurn) return;
        const v = this.view;
        const sel = this.selection;
        const mine = v.board[c] === this.myColor;
        if (mine) music.play(sel.includes(c) && sel.length === 1 ? 'cancel' : 'select');
        else if (sel.length) music.play('cancel');
        if (!mine) {
            this.selection = [];
        } else if (sel.includes(c)) {
            // 選んだ玉を押したら外す（真ん中なら、その玉だけを選び直す）
            if (sel.length === 1) this.selection = [];
            else if (lineAxis(sel.filter(x => x !== c)) !== null) this.selection = sel.filter(x => x !== c);
            else this.selection = [c];
        } else {
            const joined = [...sel, c];
            if (joined.length <= 3 && lineAxis(joined) !== null) this.selection = joined;
            else if (sel.length === 1 && this.middle(sel[0], c) !== -1) this.selection = [sel[0], this.middle(sel[0], c), c];
            else this.selection = [c];
        }
        this.render();
    }

    // 効果音：前の更新からのできごとを見て、1回の更新に1つだけ鳴らす
    // 自分の手は置いた（押し出したら取った）音、CPU の手のあとは自分の番の音、終局は勝ち・負けの音
    playSounds(view) {
        const fresh = view.events.filter(e => e.seq > this.soundSeq);
        if (!fresh.length) return;
        this.soundSeq = fresh.at(-1).seq;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winner === view.seat ? 'win' : 'lose');
        const mine = fresh.filter(e => e.type === 'move' && e.seat === view.seat);
        if (mine.length && !fresh.some(e => e.type === 'move' && e.seat !== view.seat)) {
            const out = mine.some(e => e.pushed.some(([, to]) => to === -1));
            return music.play(out ? 'capture' : 'place');
        }
        music.play(this.myTurn ? 'turn' : 'notify');
    }

    // a と b が1つおきに並び、間が自分の玉なら、その間のマス
    middle(a, b) {
        for (let d = 0; d < 6; d++) {
            const m = STEP[a][d];
            if (m !== -1 && STEP[m][d] === b && this.view.board[m] === this.myColor) return m;
        }
        return -1;
    }

    onArrow(dir) {
        if (!this.myTurn || !this.selection.length) return;
        const cells = this.selection.slice().sort((a, b) => a - b);
        this.selection = [];
        this.controller.send({ type: 'move', cells, dir });
    }

    // おすすめの手の玉を選び、その矢印を金色で囲む
    showHint() {
        if (!this.myTurn) return;
        const move = this.controller.hint();
        if (!move) return this.toast('今はおすすめの手がありません');
        this.selection = move.cells.slice();
        this.hintMove = move;
        this.render();
        this.toast('おすすめ：光る矢印の向きへ動かす');
    }

    showLog() {
        const v = this.view;
        const moves = v.events.filter(e => e.type === 'move');
        const items = moves.map(e => {
            const out = e.pushed.filter(([, to]) => to === -1).length;
            const pushed = e.pushed.length ? `・${e.pushed.length}個を押す${out ? '（押し出し）' : ''}` : '';
            return `<li>${escapeHtml(this.nameOf(e.seat))}（${COLOR_NAMES[e.color]}）：${e.cells.length}個を動かす${pushed}</li>`;
        });
        $('log-list').innerHTML = items.length ? items.join('') : '<li>まだ手はありません</li>';
        $('log').showModal();
        $('log-list').scrollTop = $('log-list').scrollHeight;
    }

    // ---- 結果・知らせ ----

    showResult() {
        const v = this.view;
        if (!v?.over || $('screen-game').hidden) return;
        const won = v.winner === v.seat;
        $('result-title').textContent = won ? 'あなたの勝ち' : `${this.nameOf(v.winner)}の勝ち`;
        const me = v.players[v.seat];
        const rival = v.players[1 - v.seat];
        $('result-detail').textContent = `押し出した数　あなた ${me.captured}・${rival.name} ${rival.captured}`;
        $('result').showModal();
    }

    toast(message) {
        const t = $('toast');
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
    }
}
