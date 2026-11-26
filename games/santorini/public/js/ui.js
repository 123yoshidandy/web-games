/**
 * サントリーニの画面
 * - 盤は 2.5D の SVG（art.js）。押す判定はマスごとの透明な面で受け、奥の行から手前の行の順に重ねる
 * - 自分の番：職人を押して選び（1人しか選べなければ自動で選ぶ）、動ける先（点）・建てられる先（四角）を押す
 * - 神の力で「動く」と「建てる」の両方ができるときは、下のボタンで切り替える。アトラスはドームの切り替え、デメテル・ヘファイストスは「終える」
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { GODS, GOD_NAMES, GOD_POWERS } from './game.js';
import { N, xOf, yOf } from './rules.js';
import * as art from './art.js';

const SETTINGS_KEY = 'santorini.settings';
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
        return {
            count: s?.count === 3 ? 3 : 2,
            level: s?.level === 'easy' ? 'easy' : 'normal',
            gods: !!s?.gods,
            myGod: GODS.includes(s?.myGod) ? s.myGod : 'random'
        };
    } catch {
        return { count: 2, level: 'normal', gods: false, myGod: 'random' };
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
        this.mode = null;        // 'move' か 'build'
        this.selected = null;    // 選んだ職人のマス
        this.domeMode = false;   // アトラスのドーム
        this.turnKey = null;
        this.seenSeq = 0;
        this.resultShown = false;
        this.buildBoard();
        this.bind();
        this.drawStaticArt();
    }

    // ---- 組み立て ----

    buildBoard() {
        const svg = $('board');
        const w = art.boardWidth(N);
        const h = art.boardHeight(N);
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.classList.add('board-svg');
        svg.style.setProperty('--board-ratio', String(w / h));
        art.drawGround(svg, N);
        this.layers = {};
        for (const name of ['scene', 'workers', 'hits']) this.layers[name] = art.el('g', { class: name }, svg);
        this.workerEls = new Map();
    }

    drawStaticArt() {
        $('title-art').appendChild(art.diagram({
            heights: { '0,0': 1, '1,0': 2, '2,0': 3, '0,1': 1, '1,1': 2, '2,1': 1, '0,2': 0, '1,2': 1 },
            domes: ['2,0'],
            workers: [{ x: 1, y: 1, seat: 0 }, { x: 2, y: 2, seat: 1 }]
        }));
        $('fig-move').appendChild(art.diagram({
            heights: { '1,1': 1, '0,0': 2, '1,0': 3, '2,0': 1, '0,1': 0, '2,1': 2, '0,2': 1, '2,2': 3 },
            workers: [{ x: 1, y: 1, seat: 0 }],
            marks: [{ x: 0, y: 0, kind: 'move' }, { x: 2, y: 0, kind: 'move' }, { x: 0, y: 1, kind: 'move' }, { x: 2, y: 1, kind: 'move' }, { x: 0, y: 2, kind: 'move' }, { x: 1, y: 2, kind: 'move' }]
        }));
        $('fig-win').appendChild(art.diagram({
            heights: { '0,1': 1, '1,1': 2, '2,1': 3, '1,0': 3, '2,0': 3, '0,2': 0 },
            domes: ['1,0'],
            workers: [{ x: 1, y: 1, seat: 0 }],
            marks: [{ x: 2, y: 1, kind: 'move' }, { x: 2, y: 0, kind: 'move' }]
        }));
        $('help-gods').innerHTML = GODS.map(g => `<p><b>${GOD_NAMES[g]}</b>：${GOD_POWERS[g]}</p>`).join('');
        $('god-list').innerHTML = ['random', ...GODS].map(g => `<button type="button" class="god-item" role="radio" data-god="${g}">
            <b>${g === 'random' ? 'おまかせ' : GOD_NAMES[g]}</b><span>${g === 'random' ? 'CPU と重ならない神を、くじで選びます' : GOD_POWERS[g]}</span></button>`).join('');
    }

    bind() {
        const seg = (id, key, parse) => $(id).addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            this.settings[key] = parse(b);
            saveSettings(this.settings);
            this.renderSettings();
        });
        seg('count', 'count', b => Number(b.dataset.count));
        seg('level', 'level', b => b.dataset.level);
        seg('gods', 'gods', b => b.dataset.gods === 'on');
        $('my-god').addEventListener('click', () => $('god-picker').showModal());
        $('god-list').addEventListener('click', e => {
            const b = e.target.closest('[data-god]');
            if (!b) return;
            this.settings.myGod = b.dataset.god;
            saveSettings(this.settings);
            this.renderSettings();
            $('god-picker').close();
        });
        $('start').addEventListener('click', () => this.startNew());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.start(saved);
        });
        $('home').addEventListener('click', () => this.showTitle());
        $('hint').addEventListener('click', () => this.showHint());
        const help = $('help');
        $('open-help-title').addEventListener('click', () => help.showModal());
        $('open-help-game').addEventListener('click', () => {
            this.controller?.pause();
            help.showModal();
        });
        help.addEventListener('close', () => this.controller?.resume());
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
        $('board').addEventListener('click', e => {
            const hit = e.target.closest('.hit');
            if (hit) this.onCell(Number(hit.dataset.cell));
        });
        // 名前を押すと神の力を見せる
        $('screen-game').addEventListener('click', e => {
            const panel = e.target.closest('.panel[data-seat]');
            if (panel) this.showGod(Number(panel.dataset.seat));
        });
        $('actions').addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (b) this.onAction(b.dataset.act);
        });
        document.addEventListener('contextmenu', e => e.preventDefault());
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
        const s = this.settings;
        document.querySelectorAll('#count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === s.count)));
        document.querySelectorAll('#level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === s.level)));
        document.querySelectorAll('#gods button').forEach(b => b.setAttribute('aria-checked', String((b.dataset.gods === 'on') === s.gods)));
        document.querySelectorAll('#god-list [data-god]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.god === s.myGod)));
        // 神の力は2人のときだけ
        $('gods-row').hidden = s.count !== 2;
        $('my-god-row').hidden = s.count !== 2 || !s.gods;
        $('my-god-name').textContent = s.myGod === 'random' ? 'おまかせ' : GOD_NAMES[s.myGod];
    }

    startNew() {
        const { count, level, gods, myGod } = this.settings;
        const players = count === 2
            ? [{ name: 'あなた' }, { name: 'CPU', isCPU: true }]
            : [{ name: 'あなた' }, { name: 'CPU 1', isCPU: true }, { name: 'CPU 2', isCPU: true }];
        clearSavedGame();
        this.start({ players, options: { gods: count === 2 && gods ? [myGod, 'random'] : null }, level });
    }

    start(setup) {
        this.controller?.stop();
        this.controller = new LocalGameController(setup, {
            onUpdate: () => {
                // ヒントを出している間は、今の場面のおすすめに出し直す（自分の番でなくなれば消す）
                if (this.hintCommand) this.applyHint(this.controller.hint());
                this.render();
            },
            onError: (message) => this.toast(message)
        });
        this.resultShown = this.controller.game.isOver();
        this.hintCommand = null;
        this.turnKey = null;
        this.seenSeq = this.controller.game.eventSeq;
        this.layers.workers.replaceChildren();
        this.workerEls.clear();
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

    nameOf(seat) {
        return seat === this.view.seat ? 'あなた' : this.view.players[seat].name;
    }

    render({ still = false } = {}) {
        const view = this.controller.getView();
        this.view = view;
        this.updateChoice();
        this.renderTurn();
        this.renderPanels();
        this.renderBoard(still);
        this.renderActions();
        if (view.over && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.showResult(), 800);
        }
    }

    // 選べる操作を、動く・建てる・置く・終えるに分ける
    groups() {
        const steps = this.view.steps;
        return {
            place: steps.filter(a => a.type === 'place'),
            move: steps.filter(a => a.type === 'move'),
            build: steps.filter(a => a.type === 'build'),
            end: steps.some(a => a.type === 'end')
        };
    }

    // 番の段が変わったら、既定の向き（動く・建てる）と選んだ職人を決め直す
    updateChoice() {
        const v = this.view;
        const key = `${v.current}|${v.phase}|${JSON.stringify(v.turn)}|${v.players.map(p => p.workers.join(',')).join('/')}`;
        const g = this.groups();
        if (key !== this.turnKey) {
            this.turnKey = key;
            this.selected = null;
            this.domeMode = false;
            const t = v.turn;
            const fresh = t.moves === 0 && t.builds === 0 && !t.prebuilt;
            this.mode = fresh ? (g.move.length ? 'move' : 'build') : (g.build.length ? 'build' : 'move');
        }
        if (this.mode === 'move' && !g.move.length && g.build.length) this.mode = 'build';
        if (this.mode === 'build' && !g.build.length && g.move.length) this.mode = 'move';
        // 選べる職人が1人なら、自動で選ぶ
        const actors = this.actors();
        if (!actors.includes(this.selected)) this.selected = actors.length === 1 ? actors[0] : null;
    }

    // 今の向きで選べる職人
    actors() {
        const g = this.groups();
        const list = this.mode === 'move' ? g.move.map(a => a.from) : this.mode === 'build' ? g.build.map(a => a.by) : [];
        return [...new Set(list)];
    }

    targets() {
        if (this.selected === null) return [];
        const g = this.groups();
        if (this.mode === 'move') return g.move.filter(a => a.from === this.selected).map(a => a.to);
        return [...new Set(g.build.filter(a => a.by === this.selected && (!this.domeMode || a.dome || this.view.height[a.at] === 3)).map(a => a.at))];
    }

    renderTurn() {
        const v = this.view;
        let text;
        if (v.over) text = `${this.nameOf(v.winner)}の勝ち`;
        else if (!this.myTurn) text = `${this.nameOf(v.current)}の番`;
        else if (v.phase === 'place') text = `職人を置く（あと${2 - v.players[v.seat].workers.length}人）`;
        else {
            const god = v.players[v.seat].god;
            const t = v.turn;
            const g = this.groups();
            if (g.end && god === 'demeter') text = 'もう1回建てられる（別のマス）';
            else if (g.end && god === 'hephaestus') text = '同じマスにもう1段建てられる';
            else if (t.hermes) text = '同じ段なら続けて動ける';
            else if (this.mode === 'move') text = t.moves > 0 ? 'もう1回動く' : t.prebuilt ? '動く（上れない）' : '動く';
            else text = t.moves === 0 && !t.prebuilt ? '動かずに建てる' : '建てる';
        }
        $('turn-info').textContent = text;
    }

    panelHtml(p, extra = '') {
        const v = this.view;
        const cls = ['panel', v.current === p.id && !v.over ? 'active' : '', p.alive ? '' : 'out', extra].join(' ');
        const god = p.god ? `<b>${GOD_NAMES[p.god]}</b>` : '';
        const supply = extra === 'me' ? `<span class="supply" title="ブロックの残り（1段・2段・3段・ドーム）">残り ${v.supply.slice(1).join('・')}</span>` : '';
        return `<div class="${cls.trim()}" data-seat="${p.id}" ${extra === 'me' ? 'id="me"' : ''}>
            <span class="dot" style="background:${art.SEAT_COLORS[p.id]}"></span>
            <div class="who"><span class="name">${escapeHtml(this.nameOf(p.id))}</span><span class="god">${god}${p.alive ? '' : '　負け'}${god && supply ? '　' : ''}${supply}</span></div>
        </div>`;
    }

    renderPanels() {
        const v = this.view;
        const others = [];
        for (let i = 1; i < v.players.length; i++) others.push(v.players[(v.seat + i) % v.players.length]);
        $('rivals').innerHTML = others.map(p => this.panelHtml(p)).join('');
        $('me').outerHTML = this.panelHtml(v.players[v.seat], 'me');
    }

    // 最後の番の出来事（動いた先と元、建てたマス）
    lastTurnCells() {
        const events = this.view.events.filter(e => ['move', 'build', 'place'].includes(e.type));
        const last = events.at(-1);
        if (!last || last.seat === this.view.seat) return new Set();
        const cells = new Set();
        for (let i = events.length - 1; i >= 0 && events[i].seat === last.seat; i--) {
            const e = events[i];
            if (e.type === 'move') { cells.add(e.from); cells.add(e.to); }
            else if (e.type === 'build') cells.add(e.at);
            else cells.add(e.to);
        }
        return cells;
    }

    renderBoard(still) {
        const v = this.view;
        const L = this.layers;
        // 新しく建てた段（落ちてくるように見せる）
        const fresh = new Map();
        if (!still) v.events.filter(e => e.seq > this.seenSeq && e.type === 'build').forEach(e => fresh.set(e.at, e.dome ? 'dome' : e.height));
        this.seenSeq = v.eventSeq;
        const mine = this.myTurn;
        const targets = mine ? new Set(this.targets()) : new Set();
        const actors = mine && v.phase === 'turn' ? new Set(this.actors()) : new Set();
        const places = mine && v.phase === 'place' ? new Set(this.groups().place.map(a => a.to)) : new Set();
        const last = this.lastTurnCells();
        const hinted = mine ? this.hintCell() : null;
        L.scene.replaceChildren();
        L.hits.replaceChildren();
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const c = y * N + x;
                const h = v.height[c];
                art.drawTower(L.scene, x, y, h, v.dome[c], fresh.get(c) ?? null);
                if (v.dome[c]) {
                    if (targets.has(c)) art.drawMark(L.scene, x, y, h, 'build');
                    continue;
                }
                if (places.has(c)) art.drawMark(L.scene, x, y, h, 'move').classList.toggle('recommended', c === hinted);
                else if (targets.has(c)) {
                    const m = art.drawMark(L.scene, x, y, h, this.mode === 'move' ? 'move' : 'build');
                    if (this.domeMode) m.classList.add('dome-mode');
                    m.classList.toggle('recommended', c === hinted);
                } else if (c === this.selected) art.drawMark(L.scene, x, y, h, 'select');
                else if (actors.has(c)) art.drawMark(L.scene, x, y, h, 'can');
                else if (last.has(c)) art.drawMark(L.scene, x, y, h, 'last');
            }
        }
        // 押す判定（塔の正面も含めた柱の形。手前の行が上に重なる）
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const c = y * N + x;
                const top = art.cellY(y) - v.height[c] * art.L - (v.height[c] ? 6 : 0);
                art.el('rect', { class: 'hit', 'data-cell': c, x: art.cellX(x), y: top, width: art.W, height: art.cellY(y) + art.D - top }, L.hits);
            }
        }
        // 職人
        const alive = new Set();
        v.players.forEach(p => p.workers.forEach((c, i) => {
            const key = `${p.id}-${i}`;
            alive.add(key);
            let g = this.workerEls.get(key);
            const isNew = !g;
            if (!g) {
                g = art.createWorker(p.id, L.workers);
                this.workerEls.set(key, g);
            }
            g.classList.toggle('still', still || isNew);
            g.classList.toggle('selected', mine && c === this.selected);
            art.placeWorker(g, xOf(c), yOf(c), v.height[c]);
        }));
        for (const [key, g] of this.workerEls) {
            if (!alive.has(key)) {
                g.remove();
                this.workerEls.delete(key);
            }
        }
        // 奥の職人から描く（手前の職人が上に重なる）
        [...this.workerEls.values()]
            .sort((a, b) => parseFloat(a.style.transform.split(',')[1]) - parseFloat(b.style.transform.split(',')[1]))
            .forEach(g => L.workers.appendChild(g));
    }

    renderActions() {
        const actions = $('actions');
        if (!this.myTurn || this.view.phase !== 'turn') {
            actions.innerHTML = '';
            return;
        }
        const g = this.groups();
        const parts = [];
        if (g.move.length && g.build.length) {
            parts.push(`<div class="segmented small" role="radiogroup" aria-label="動く・建てる">
                <button type="button" role="radio" data-act="mode-move" aria-checked="${this.mode === 'move'}">動く</button>
                <button type="button" role="radio" data-act="mode-build" aria-checked="${this.mode === 'build'}">建てる</button></div>`);
        }
        if (this.mode === 'build' && g.build.some(a => a.dome)) {
            parts.push(`<button type="button" class="toggle" data-act="dome" aria-pressed="${this.domeMode}">ドーム</button>`);
        }
        if (g.end) parts.push(`<button type="button" class="btn secondary small${this.hintCommand?.type === 'end' ? ' recommended' : ''}" data-act="end">終える</button>`);
        actions.innerHTML = parts.join('');
    }

    // ---- 操作 ----

    onAction(act) {
        if (!this.myTurn) return;
        if (act === 'mode-move' || act === 'mode-build') {
            this.mode = act === 'mode-move' ? 'move' : 'build';
            this.selected = null;
            this.render();
        } else if (act === 'dome') {
            this.domeMode = !this.domeMode;
            this.render();
        } else if (act === 'end') {
            this.controller.send({ type: 'end' });
        }
    }

    onCell(c) {
        if (!this.myTurn) return;
        const v = this.view;
        const g = this.groups();
        if (v.phase === 'place') {
            if (g.place.some(a => a.to === c)) this.controller.send({ type: 'place', to: c });
            return;
        }
        // 選べる職人を押したら、選び直す
        if (this.actors().includes(c) && !(this.selected !== null && this.targets().includes(c))) {
            this.selected = c;
            this.render();
            return;
        }
        if (this.selected === null) {
            if (v.players[v.seat].workers.includes(c)) this.toast(this.mode === 'move' ? 'その職人は動けません' : 'その職人は建てられません');
            return;
        }
        if (this.mode === 'move') {
            const step = g.move.find(a => a.from === this.selected && a.to === c);
            if (step) this.controller.send(step);
            return;
        }
        const options = g.build.filter(a => a.by === this.selected && a.at === c);
        const step = options.find(a => !!a.dome === this.domeMode) ?? options[0];
        if (step) this.controller.send(step);
    }

    // ---- ダイアログ・知らせ ----

    showGod(seat) {
        const p = this.view?.players[seat];
        if (!p?.god) return;
        $('god-info-name').textContent = `${this.nameOf(seat)}：${GOD_NAMES[p.god]}`;
        $('god-info-text').textContent = GOD_POWERS[p.god];
        $('god-info').showModal();
    }

    showResult() {
        const v = this.view;
        if (!v?.over || $('screen-game').hidden) return;
        const won = v.winner === v.seat;
        $('result-title').textContent = won ? 'あなたの勝ち' : `${this.nameOf(v.winner)}の勝ち`;
        const reason = v.result.reason;
        $('result-detail').textContent = reason === 'climb' ? '3段目に上りました'
            : reason === 'pan' ? '2段以上下りました（パン）'
            : won ? 'ほかの人が動けなくなりました' : v.players[v.seat].alive ? '' : 'あなたは動けなくなりました';
        $('result').showModal();
    }

    // ---- ヒント ----

    // おすすめの1歩を、職人と行き先を選んだ状態にして印を付ける（画面だけ。記録には入れない）
    showHint() {
        const command = this.myTurn ? this.controller?.hint() : null;
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.applyHint(command);
        this.render();
        const text = { place: '白い枠のマスに職人を置く', move: '白い枠のマスへ動く', build: command.dome ? '白い枠のマスにドームを建てる' : '白い枠のマスに建てる', end: '番を終える' }[command.type] ?? '';
        this.toast(`おすすめ：${text}`);
    }

    applyHint(command) {
        this.hintCommand = command;
        if (command?.type === 'move') {
            this.mode = 'move';
            this.selected = command.from;
        } else if (command?.type === 'build') {
            this.mode = 'build';
            this.selected = command.by;
            this.domeMode = !!command.dome;
        }
    }

    // おすすめの行き先のマス（選んでいる職人がおすすめと同じときだけ）
    hintCell() {
        const c = this.hintCommand;
        if (!c) return null;
        if (c.type === 'place') return c.to;
        if (c.type === 'move' && this.mode === 'move' && this.selected === c.from) return c.to;
        if (c.type === 'build' && this.mode === 'build' && this.selected === c.by) return c.at;
        return null;
    }

    toast(message) {
        const t = $('toast');
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    }
}
