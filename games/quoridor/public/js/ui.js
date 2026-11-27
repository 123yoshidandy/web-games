/**
 * コリドールの画面
 * - 盤は、見る人の辺が下に来るように回して描く（rot 回、時計回りに 90 度ずつ）
 * - 自分の番には、駒の動ける先に点を出す。押すと動く
 * - 盤のほかの場所か「壁」のボタンを押すと、壁を置いたときの姿を出す。指でずらして位置、同じ場所をもう一度押すか「向き」で向きを変え、「置く」で置く
 *   置けない場所は赤く出し、理由を出す。置けるなら、誰の歩数がどう変わるかを出す
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { stateFromView } from './game-view.js';
import { wallReason, applyAction, distances, paths, SIZE, SLOTS, xOf, yOf } from './rules.js';
import { wallMessage } from './game.js';
import * as art from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';

const GAME = 'quoridor';

const SETTINGS_KEY = 'quoridor.settings';
const $ = (id) => document.getElementById(id);

// ---- 回す（論理の座標 ⇔ 見る人の座標） ----
const rotCell = ([x, y]) => [SIZE - 1 - y, x];
const rotWall = ({ x, y, o }) => ({ x: SLOTS - 1 - y, y: x, o: o === 'h' ? 'v' : 'h' });
function repeat(fn, value, times) {
    for (let i = 0; i < times; i++) value = fn(value);
    return value;
}
const cellToView = (c, rot) => repeat(rotCell, [xOf(c), yOf(c)], rot);
const cellToLogic = (x, y, rot) => repeat(rotCell, [x, y], (4 - rot) % 4);
const wallToView = (w, rot) => repeat(rotWall, w, rot);
const wallToLogic = (w, rot) => repeat(rotWall, w, (4 - rot) % 4);

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
        return { count: s?.count === 4 ? 4 : 2, level: s?.level === 'easy' ? 'easy' : 'normal' };
    } catch {
        return { count: 2, level: 'normal' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.rot = 0;
        this.wallMode = false;
        this.preview = null;      // 見る人の座標の壁 { x, y, o }
        this.orientation = 'h';   // 見る人から見た向き
        this.drag = null;
        this.resultShown = false;
        this.hint = null;         // ヒントで示している手 { seq, command }（その手番の間だけ）
        this.log = [];            // 履歴の行（ビューの出来事から作る）
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。2人か4人で、足りない席は CPU
        this.online = new NetplayLobby({
            title: 'コリドール',
            game: 'quoridor',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: 2,
            maxPlayers: 4,
            settings: [{ key: 'level', label: 'CPU の強さ', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }] }],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onControllerUpdate(),
            onError: (message) => this.onControllerError(message),
            onExit: () => this.showTitle()
        });
        this.buildBoard();
        this.bind();
        this.drawStaticArt();
    }

    // ---- 組み立て ----

    buildBoard() {
        const svg = $('board');
        art.createBoardSvg(SIZE, svg);
        this.layers = {};
        for (const name of ['goals', 'marks', 'targets', 'walls', 'pawns', 'preview']) {
            this.layers[name] = art.el('g', { class: name }, svg);
        }
        this.pawns = [];
    }

    drawStaticArt() {
        $('title-art').appendChild(art.diagram({
            pawns: [{ x: 4, y: 6, seat: 0 }, { x: 3, y: 2, seat: 1 }],
            walls: [{ x: 3, y: 4, o: 'h' }, { x: 5, y: 2, o: 'v' }, { x: 1, y: 2, o: 'h' }, { x: 2, y: 6, o: 'v' }, { x: 6, y: 5, o: 'h' }],
            goals: [{ side: 2, seat: 0 }, { side: 0, seat: 1 }]
        }));
        // 遊び方の図（3×3 の切り出し）
        $('fig-jump').appendChild(art.diagram({ n: 3, pawns: [{ x: 1, y: 2, seat: 0 }, { x: 1, y: 1, seat: 1 }], targets: [[1, 0], [0, 2], [2, 2]] }));
        $('fig-diag').appendChild(art.diagram({ n: 3, pawns: [{ x: 1, y: 2, seat: 0 }, { x: 1, y: 1, seat: 1 }], walls: [{ x: 0, y: 0, o: 'h' }], targets: [[0, 1], [2, 1], [0, 2], [2, 2]] }));
    }

    bind() {
        // 設定
        $('count').addEventListener('click', e => {
            const b = e.target.closest('button[data-count]');
            if (!b) return;
            this.settings.count = Number(b.dataset.count);
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('level').addEventListener('click', e => {
            const b = e.target.closest('button[data-level]');
            if (!b) return;
            this.settings.level = b.dataset.level;
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('start').addEventListener('click', () => this.startNew());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.start(saved);
        });
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('online-button').addEventListener('click', () => this.online.open());
        $('hint').addEventListener('click', () => this.showHint());
        $('open-log').addEventListener('click', () => {
            this.renderLog();
            $('log-dialog').showModal();
        });
        // 遊び方
        const help = $('help');
        $('open-help-title').addEventListener('click', () => help.showModal());
        $('open-help-game').addEventListener('click', () => {
            this.controller?.pause?.(); // ローカル対戦だけ、読んでいる間 CPU を止める
            help.showModal();
        });
        help.addEventListener('close', () => this.controller?.resume?.());
        document.querySelectorAll('dialog').forEach(d => {
            d.querySelector('.close')?.addEventListener('click', () => d.close());
            // 外側を押したら閉じる（結果は閉じない）
            if (d.id !== 'result') d.addEventListener('click', e => { if (e.target === d) d.close(); });
        });
        // 結果
        $('look').addEventListener('click', () => $('result').close());
        $('again').addEventListener('click', () => {
            $('result').close();
            if (this.controller?.isOnline) this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
            else this.startNew();
        });
        $('result-home').addEventListener('click', () => {
            $('result').close();
            if (this.controller?.isOnline) this.online.leave();
            else this.showTitle();
        });
        // 盤
        const board = $('board');
        board.addEventListener('pointerdown', e => this.onPointerDown(e));
        board.addEventListener('pointermove', e => this.onPointerMove(e));
        board.addEventListener('pointerup', e => this.onPointerUp(e));
        board.addEventListener('pointercancel', () => { this.drag = null; });
        // 長押しのメニューを出さない
        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.renderSettings();
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online.available;
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
    }

    renderSettings() {
        document.querySelectorAll('#count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    startNew() {
        const { count, level } = this.settings;
        const players = count === 2
            ? [{ name: 'あなた' }, { name: 'CPU', isCPU: true }]
            : [{ name: 'あなた' }, { name: 'CPU 1', isCPU: true }, { name: 'CPU 2', isCPU: true }, { name: 'CPU 3', isCPU: true }];
        clearSavedGame();
        this.start({ players, options: {}, level });
    }

    start(setup) {
        const controller = new LocalGameController(setup, {
            onUpdate: () => this.onControllerUpdate(),
            onError: (message) => this.onControllerError(message)
        });
        this.beginGame(controller);
        controller.scheduleCpu();
    }

    onControllerUpdate() {
        const previous = this.view;
        this.render();
        this.playUpdateSound(previous);
    }

    onControllerError(message) {
        music.play('error');
        this.toast(message);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        const view = controller.getView();
        this.view = null;
        this.resultShown = view.over;
        this.hint = null;
        this.log = [];
        this.wallMode = false;
        this.preview = null;
        this.orientation = 'h';
        this.layers.pawns.replaceChildren();
        this.pawns = view.players.map(p => art.createPawn(p.id, this.layers.pawns));
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.render({ still: true });
    }

    // ---- 描画 ----

    get myTurn() {
        const v = this.view;
        return !!v && !v.over && v.current === v.seat;
    }

    render({ still = false } = {}) {
        const view = this.controller.getView();
        this.view = view;
        const me = view.players[view.seat];
        this.rot = (4 - me.side) % 4;
        if (!this.myTurn) this.leaveWallMode(false);
        if (this.hint && this.hint.seq !== view.eventSeq) this.hint = null;
        $('hint').disabled = !this.myTurn;
        $('hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        this.collectLog(view);
        this.renderTurn();
        this.renderPanels();
        this.renderBoard(still);
        this.renderBottom();
        if (view.over && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.showResult(), 700);
        }
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）。1台で人が交代する対戦（人が2人以上）は送らない
    recordLocalResult(v) {
        const controller = this.controller;
        if (!controller || controller.isOnline || controller.game.players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners([v.winner], v.seat, v.players.length) });
    }

    // 1回の更新に1つの音。自分の手の音は send で鳴らす。CPU の手は知らせ、自分の番になったらチャイム
    playUpdateSound(previous) {
        const v = this.view;
        if (!previous) return;
        if (v.over) {
            if (!previous.over) {
                music.play(v.winner === v.seat ? 'win' : 'lose');
                this.recordLocalResult(v);
            }
            return;
        }
        if (this.sending) return;
        const wasMine = !previous.over && previous.current === previous.seat;
        music.play(this.myTurn && !wasMine ? 'turn' : 'notify');
    }

    send(command) {
        this.sending = true;
        const ok = this.controller.send(command);
        this.sending = false;
        if (ok && !this.view.over) music.play('place');
        return ok;
    }

    nameOf(seat) {
        return seat === this.view.seat ? 'あなた' : this.view.players[seat].name;
    }

    renderTurn() {
        const v = this.view;
        $('turn-info').textContent = v.over
            ? `${this.nameOf(v.winner)}の勝ち`
            : v.current === v.seat ? 'あなたの番' : `${this.nameOf(v.current)}の番`;
    }

    panelHtml(p) {
        const v = this.view;
        const cls = ['panel', v.current === p.id ? 'active' : '', v.winner === p.id ? 'won' : ''].join(' ');
        const steps = p.dist === Infinity ? '—' : p.dist;
        return `<div class="${cls}" data-seat="${p.id}">
            <span class="dot" style="background:${art.SEAT_COLORS[p.id]}"></span>
            <div class="who"><span class="name">${escapeHtml(this.nameOf(p.id))}</span>
            <span class="stats"><span class="walls" title="残りの壁"><b>${p.walls}</b></span><span title="ゴールまでの最短の歩数">あと<b>${steps}</b>歩</span></span></div>
        </div>`;
    }

    renderPanels() {
        const v = this.view;
        // 相手は、見る人の左隣から時計回り（左・上・右）に並べる
        const others = [];
        for (let i = 1; i < v.players.length; i++) others.push(v.players[(v.seat + i) % v.players.length]);
        const rivals = $('rivals');
        rivals.classList.toggle('four', v.players.length === 4);
        rivals.innerHTML = others.map(p => this.panelHtml(p)).join('');
        $('me').outerHTML = this.panelHtml(v.players[v.seat]).replace('class="panel', 'id="me" class="panel me');
    }

    renderBoard(still) {
        const v = this.view;
        const L = this.layers;
        // ゴールの帯
        L.goals.replaceChildren();
        v.players.forEach(p => art.drawGoal(L.goals, ((p.side + 2) % 4 + this.rot) % 4, p.id, SIZE));
        // 最後の手
        const last = [...v.events].reverse().find(e => e.type === 'move' || e.type === 'wall');
        L.marks.replaceChildren();
        if (last?.type === 'move') {
            const [x, y] = cellToView(last.from, this.rot);
            art.el('circle', { class: 'from-mark', cx: art.cellCenter(x), cy: art.cellCenter(y), r: 12, stroke: art.SEAT_COLORS[last.seat] }, L.marks);
        }
        // 壁（新しく置かれた壁は、落ちてくるように見せる）
        const known = this.wallCount ?? 0;
        L.walls.replaceChildren();
        v.placed.forEach((w, i) => {
            const rect = art.drawWall(L.walls, wallToView(w, this.rot));
            if (last?.type === 'wall' && i === v.placed.length - 1) {
                rect.classList.add('last');
                rect.style.stroke = art.SEAT_COLORS[w.seat];
            }
            if (!still && i >= known) rect.classList.add('drop');
        });
        this.wallCount = v.placed.length;
        // 駒
        v.players.forEach(p => {
            const g = this.pawns[p.id];
            g.classList.toggle('still', still);
            g.classList.toggle('active', v.current === p.id);
            const [x, y] = cellToView(p.pawn, this.rot);
            art.placePawn(g, x, y);
        });
        // 動ける先
        L.targets.replaceChildren();
        if (this.myTurn && !this.wallMode) {
            v.moves.forEach(m => {
                const [x, y] = repeat(rotCell, [m.x, m.y], this.rot);
                art.el('rect', { class: 'target-cell', x: art.cellOrigin(x), y: art.cellOrigin(y), width: art.CELL, height: art.CELL, rx: 4 }, L.targets);
                art.el('circle', { class: 'target-dot', cx: art.cellCenter(x), cy: art.cellCenter(y), r: 7 }, L.targets);
            });
        }
        // ヒントの行き先
        if (this.hint?.command.type === 'move' && this.myTurn && !this.wallMode) {
            const [x, y] = repeat(rotCell, [this.hint.command.x, this.hint.command.y], this.rot);
            art.el('rect', { class: 'suggested-cell', x: art.cellOrigin(x) + 2, y: art.cellOrigin(y) + 2, width: art.CELL - 4, height: art.CELL - 4, rx: 5 }, L.targets);
        }
        this.renderPreview();
    }

    // 置いたときの姿と、その判定
    checkPreview() {
        if (!this.preview) return null;
        const state = stateFromView(this.view);
        const wall = wallToLogic(this.preview, this.rot);
        const reason = wallReason(state, wall);
        if (reason) return { wall, reason, message: wallMessage(reason, this.view.players, this.view.seat) };
        const before = distances(state);
        const after = distances(applyAction(state, { type: 'wall', ...wall }));
        return { wall, reason: null, before, after };
    }

    renderPreview() {
        const L = this.layers;
        L.preview.replaceChildren();
        this.previewCheck = this.wallMode ? this.checkPreview() : null;
        if (!this.previewCheck) return;
        const rect = art.drawWall(L.preview, this.preview, 'preview');
        rect.classList.add(this.previewCheck.reason ? 'ng' : 'ok');
    }

    renderBottom() {
        const v = this.view;
        const actions = $('actions');
        const info = $('wall-info');
        const me = v.players[v.seat];
        $('me').hidden = this.wallMode;
        info.hidden = !this.wallMode;
        if (this.wallMode) {
            const c = this.previewCheck;
            if (c?.reason) {
                info.innerHTML = `<span class="line ng">${escapeHtml(c.message)}</span>`;
            } else if (c) {
                const changed = v.players.filter(p => c.after[p.id] !== c.before[p.id]);
                info.innerHTML = changed.length
                    ? changed.map(p => `<span class="line"><span class="${p.id === v.seat ? 'ng' : 'up'}">${escapeHtml(this.nameOf(p.id))}</span> あと${c.before[p.id]}→${c.after[p.id]}歩</span>`).join('')
                    : '<span class="line muted">誰の歩数も変わりません</span>';
            }
            actions.innerHTML = `
                <button class="btn ghost square" data-act="rotate" aria-label="向きを変える" title="向きを変える">
                    <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>
                </button>
                <button class="btn primary small${this.wallHinted() ? ' suggested' : ''}" data-act="place" ${c?.reason ? 'disabled' : ''}>置く</button>
                <button class="btn ghost square" data-act="cancel" aria-label="やめる" title="やめる">
                    <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
                </button>`;
        } else if (this.myTurn) {
            actions.innerHTML = `<button class="btn secondary small" data-act="wall" ${me.walls > 0 ? '' : 'disabled'}>壁<span class="count">残り${me.walls}</span></button>`;
        } else {
            actions.innerHTML = '';
        }
        actions.querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', () => this.onAction(b.dataset.act)));
    }

    // ---- 操作 ----

    onAction(act) {
        if (!this.myTurn) return;
        if (act === 'wall' || act === 'rotate') music.play('select');
        if (act === 'cancel') music.play('cancel');
        if (act === 'wall') this.enterWallMode(this.defaultPreview());
        else if (act === 'rotate') this.setPreview({ ...this.preview, o: this.preview.o === 'h' ? 'v' : 'h' });
        else if (act === 'cancel') this.leaveWallMode();
        else if (act === 'place') {
            const c = this.checkPreview();
            if (!c || c.reason) return;
            this.leaveWallMode(false);
            this.send({ type: 'wall', ...c.wall });
        }
    }

    // 最初に出す壁の位置：次の手番の相手の最短の道を、駒に近い方から見て、相手の歩数が延びて自分の歩数は延びない壁
    // なければ、相手の道を切る最初の置ける壁
    defaultPreview() {
        const v = this.view;
        const state = stateFromView(v);
        const ps = paths(state);
        const n = v.players.length;
        const before = distances(state);
        let fallback = null;
        for (let i = 1; i < n; i++) {
            const q = (v.seat + i) % n;
            const path = ps[q];
            for (let j = 1; path && j < path.length; j++) {
                const a = path[j - 1];
                const b = path[j];
                const lo = Math.min(a, b);
                const x = xOf(lo);
                const y = yOf(lo);
                const cands = Math.abs(a - b) === SIZE
                    ? [{ x: Math.min(x, SLOTS - 1), y, o: 'h' }, { x: x - 1, y, o: 'h' }]
                    : [{ x, y: Math.min(y, SLOTS - 1), o: 'v' }, { x, y: y - 1, o: 'v' }];
                for (const w of cands) {
                    if (w.x < 0 || w.y < 0 || wallReason(state, w, ps)) continue;
                    fallback ??= w;
                    const after = distances(applyAction(state, { type: 'wall', ...w }));
                    if (after[q] > before[q] && after[v.seat] <= before[v.seat]) return wallToView(w, this.rot);
                }
            }
        }
        return fallback ? wallToView(fallback, this.rot) : { x: 3, y: 3, o: this.orientation };
    }

    enterWallMode(preview) {
        this.wallMode = true;
        this.preview = preview;
        this.orientation = preview.o;
        this.render();
    }

    leaveWallMode(redraw = true) {
        if (!this.wallMode) return;
        this.wallMode = false;
        this.preview = null;
        this.drag = null;
        if (redraw && this.view) this.render();
    }

    setPreview(preview) {
        this.preview = preview;
        this.orientation = preview.o;
        this.renderPreview();
        this.renderBottom();
    }

    // 押した位置（盤の座標）
    boardPoint(e) {
        const svg = $('board');
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        return { gx: (p.x - art.MARGIN) / art.PITCH, gy: (p.y - art.MARGIN) / art.PITCH };
    }

    // いちばん近い溝の交点
    nearestAnchor({ gx, gy }) {
        const off = 1 - art.GAP / (2 * art.PITCH);
        const clamp = (n) => Math.max(0, Math.min(SLOTS - 1, Math.round(n - off)));
        return { x: clamp(gx), y: clamp(gy) };
    }

    onPointerDown(e) {
        if (!this.myTurn || e.button > 0) return;
        const pt = this.boardPoint(e);
        if (!this.wallMode) {
            // 動ける先のマスなら動かす
            const vx = Math.floor(pt.gx);
            const vy = Math.floor(pt.gy);
            if (vx >= 0 && vy >= 0 && vx < SIZE && vy < SIZE) {
                const [x, y] = cellToLogic(vx, vy, this.rot);
                if (this.view.moves.some(m => m.x === x && m.y === y)) {
                    this.send({ type: 'move', x, y });
                    return;
                }
            }
            const a = this.nearestAnchor(pt);
            this.enterWallMode({ ...a, o: this.orientation });
            this.drag = { id: e.pointerId, toggle: false };
        } else {
            const a = this.nearestAnchor(pt);
            const same = this.preview && a.x === this.preview.x && a.y === this.preview.y;
            if (!same) this.setPreview({ ...a, o: this.orientation });
            this.drag = { id: e.pointerId, toggle: same };
        }
        try {
            $('board').setPointerCapture(e.pointerId);
        } catch { /* 取れなくても動く */ }
    }

    onPointerMove(e) {
        if (!this.drag || this.drag.id !== e.pointerId || !this.wallMode) return;
        const a = this.nearestAnchor(this.boardPoint(e));
        if (a.x === this.preview.x && a.y === this.preview.y) return;
        this.drag.toggle = false;
        this.setPreview({ ...a, o: this.orientation });
    }

    onPointerUp(e) {
        if (!this.drag || this.drag.id !== e.pointerId) return;
        if (this.drag.toggle && this.wallMode) this.setPreview({ ...this.preview, o: this.preview.o === 'h' ? 'v' : 'h' });
        this.drag = null;
    }

    // ---- ヒント・履歴 ----

    // おすすめの手を示す。駒の手なら行き先のマスを光らせ、壁なら置く画面に入ってその壁を出しておく（「置く」を押せば置ける）
    showHint() {
        if (!this.myTurn) return;
        const command = this.controller.suggest();
        if (!command) return;
        this.hint = { seq: this.view.eventSeq, command };
        music.play('select');
        if (command.type === 'wall') this.enterWallMode(wallToView(command, this.rot));
        else {
            this.leaveWallMode(false);
            this.render();
        }
        if (command.type === 'pass') this.toast('おすすめ：パス');
    }

    // 置こうとしている壁が、ヒントの壁と同じか
    wallHinted() {
        const c = this.hint?.command;
        if (c?.type !== 'wall' || !this.preview) return false;
        const w = wallToLogic(this.preview, this.rot);
        return w.x === c.x && w.y === c.y && w.o === c.o;
    }

    // ビューの出来事から、履歴の行を足していく（同じ出来事は1度だけ）
    collectLog(view) {
        const last = this.log.at(-1)?.seq ?? 0;
        for (const e of view.events) {
            if (e.seq <= last) continue;
            let text = null;
            if (e.type === 'move') text = `${this.nameOf(e.seat)}：駒を動かした`;
            else if (e.type === 'wall') text = `${this.nameOf(e.seat)}：壁を置いた`;
            else if (e.type === 'pass') text = `${this.nameOf(e.seat)}：パス`;
            else if (e.type === 'end') text = `${this.nameOf(e.winner)}の勝ち`;
            if (text) this.log.push({ seq: e.seq, text });
        }
    }

    renderLog() {
        $('log').innerHTML = this.log.length
            ? this.log.map(l => `<li>${escapeHtml(l.text)}</li>`).reverse().join('')
            : '<li class="empty">まだ何も起きていません</li>';
    }

    // ---- 結果・知らせ ----

    showResult() {
        const v = this.view;
        if (!v?.over || $('screen-game').hidden) return;
        const won = v.winner === v.seat;
        $('result-title').textContent = won ? 'あなたの勝ち' : `${this.nameOf(v.winner)}の勝ち`;
        const mine = v.players[v.seat];
        $('result-detail').textContent = won ? `壁を${(v.players.length === 2 ? 10 : 5) - mine.walls}枚使いました` : `あなたはゴールまで、あと${mine.dist}歩でした`;
        $('result').showModal();
    }

    toast(message) {
        const t = $('toast');
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    }
}
