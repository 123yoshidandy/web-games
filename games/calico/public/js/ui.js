/**
 * 画面（タイトル・ゲーム・目標選び・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 置き方：手札のパッチを押して選び、キルトの光る空きマスを押すと下書きが出る（来るボタンと猫が下に出る）。
 * 決定のボタンか、同じマスをもう一度押して置く。置いたら、光る市場のパッチを押して手札に取る
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { TILES, CATS, GOALS, COLORS, PATTERNS } from './data.js';
import { BORDER, GOAL_CELLS, OPEN_CELLS, CELL_COUNT, cellCenter } from './board.js';
import { patchAt, awardsFor, scorePlayer, goalResult } from './scoring.js';
import { colorName, patternName, tileName } from './game.js';
import { symbolsSvg, patchSvg, tileSvg, goalSvg, goalTileSvg, catSvg, buttonSvg, patternSwatch, colorSwatch, hexPoints, COLOR_INFO } from './art.js';

const SETTINGS_KEY = 'calico.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 1200;
const S = 10; // マスの中心から角まで（盤の座標）

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [1, 2, 3, 4].includes(saved.count) ? saved.count : 2,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'normal',
            setup: ['beginner', 'standard'].includes(saved.setup) ? saved.setup : 'beginner'
        };
    } catch {
        return { count: 2, level: 'normal', setup: 'beginner' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 盤の全体の範囲（viewBox）
const BOARD_BOX = (() => {
    const pts = Array.from({ length: CELL_COUNT }, (_, c) => cellCenter(c, S));
    const minX = Math.min(...pts.map(p => p.x)) - S;
    const maxX = Math.max(...pts.map(p => p.x)) + S;
    const minY = Math.min(...pts.map(p => p.y)) - S * 1.05;
    const maxY = Math.max(...pts.map(p => p.y)) + S * 1.05;
    return `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`;
})();

// 猫の条件の小さな図（count は「n+」、直線と形は六角を並べる）
export function needSvg(catId, px = 14) {
    const cat = CATS[catId];
    if (cat.kind === 'count') return `<span class="need">${cat.size}+</span>`;
    const r = 3;
    const w = Math.sqrt(3) * r;
    const cells = cat.kind === 'line'
        ? Array.from({ length: cat.size }, (_, i) => [i * w, 0])
        : cat.shape === 'triangle' ? [[0, 0], [w, 0], [w / 2, r * 1.5]] : [[0, r * 1.5], [w, r * 1.5], [2 * w, r * 1.5], [w / 2, 0], [w * 1.5, 0]];
    const maxX = Math.max(...cells.map(c => c[0])) + w / 2 + 0.5;
    const maxY = Math.max(...cells.map(c => c[1])) + r + 0.5;
    const body = cells.map(([x, y]) => `<polygon points="${hexPoints(x, y, r * 0.95)}" fill="#fbf6ec" stroke="#8a7a80" stroke-width=".5"/>`).join('');
    return `<span class="shape"><svg viewBox="${-w / 2 - 0.5} ${-r - 0.5} ${maxX + w / 2 + 0.5} ${maxY + r + 0.5}" height="${px}">${body}</svg></span>`;
}

const catText = (catId) => {
    const cat = CATS[catId];
    if (cat.kind === 'count') return `好きな模様が${cat.size}枚以上つながる`;
    if (cat.kind === 'line') return `好きな模様が${cat.size}枚まっすぐ並ぶ`;
    return cat.shape === 'triangle' ? '好きな模様が三角の3枚で並ぶ' : '好きな模様が、3枚の列の上に2枚の形で並ぶ';
};

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.viewSeat = 0;
        this.sel = null;     // 選んだ手札の番号
        this.draft = null;   // 下書きのマス
        this.goalPicks = [];
        this.fresh = new Set();
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
        this.clearSelection();
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.viewSeat = view.you;
        this.lastSeq = view.events.at(-1)?.seq ?? 0;
        this.render();
        if (view.phase === 'end') this.showResult();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level, setup } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: { setup } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    clearSelection() {
        this.sel = null;
        this.draft = null;
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
        segment('#cpu-level', 'data-level', (v) => { this.settings.level = v; });
        segment('#setup-mode', 'data-setup', (v) => { this.settings.setup = v; });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#home').addEventListener('click', () => this.showTitle());
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-close').addEventListener('click', () => $('#result').close());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.openLog());
        $('#cats').addEventListener('click', () => this.openCats());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.addEventListener('click', (event) => {
                if (dialog.id === 'goals') return; // 目標は選ぶまで閉じない
                if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
            });
        });
        $('#goals').addEventListener('cancel', (event) => event.preventDefault());
        $('#goals-body').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-goal]');
            if (!button) return;
            const i = Number(button.dataset.goal);
            const at = this.goalPicks.indexOf(i);
            if (at >= 0) this.goalPicks.splice(at, 1);
            else if (this.goalPicks.length < 3) this.goalPicks.push(i);
            this.renderGoalDialog();
        });
        $('#goals-ok').addEventListener('click', () => {
            if (this.goalPicks.length !== 3) return;
            const pick = [...this.goalPicks];
            $('#goals').close();
            this.send({ type: 'goals', pick });
        });
        $('#players').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-seat]');
            if (!button || !this.view) return;
            this.viewSeat = Number(button.dataset.seat);
            this.render();
        });
        $('#board').addEventListener('click', (event) => this.onBoard(event));
        $('#hand').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-hand]');
            if (!button || !this.canPlace()) return;
            const i = Number(button.dataset.hand);
            this.sel = this.sel === i ? null : i;
            if (this.sel === null) this.draft = null;
            this.viewSeat = this.view.you;
            this.render();
        });
        $('#market').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-market]');
            if (!button || !this.canTake()) return;
            this.send({ type: 'take', market: Number(button.dataset.market) });
        });
        $('#confirm').addEventListener('click', () => this.confirmPlace());
    }

    // ---- タイトル ----

    renderSetup() {
        const { count, level, setup } = this.settings;
        const check = (selector, attr, value) => document.querySelectorAll(`${selector} button[${attr}]`).forEach(b => {
            b.setAttribute('aria-checked', String(b.getAttribute(attr) === String(value)));
        });
        check('#player-count', 'data-count', count);
        check('#cpu-level', 'data-level', level);
        check('#setup-mode', 'data-setup', setup);
        $('#row-level').style.visibility = count === 1 ? 'hidden' : '';
    }

    renderTitleArt() {
        // 小さなキルトの一部に、猫とボタンを置いた絵
        const cells = [
            { q: 0, r: 0, p: { color: 'pink', pattern: 'flowers' } },
            { q: 1, r: 0, p: { color: 'pink', pattern: 'dots' } },
            { q: 2, r: 0, p: { color: 'sky', pattern: 'ferns' } },
            { q: -0.5, r: 1, p: { color: 'purple', pattern: 'dots' } },
            { q: 0.5, r: 1, p: { color: 'pink', pattern: 'stripes' } },
            { q: 1.5, r: 1, p: { color: 'yellow', pattern: 'dots' } },
            { q: 2.5, r: 1, p: { color: 'green', pattern: 'vines' } },
            { q: 0, r: 2, p: { color: 'navy', pattern: 'quatrefoil' } },
            { q: 1, r: 2, p: { color: 'green', pattern: 'stripes' } },
            { q: 2, r: 2, p: { color: 'yellow', pattern: 'ferns' } }
        ];
        const w = Math.sqrt(3) * S;
        const body = cells.map(({ q, r, p }) => patchSvg(p, q * w, r * S * 1.5, S)).join('');
        const tok = (id, x, y, s) => `<circle cx="${x}" cy="${y + 0.5}" r="${s * 0.5}" class="token-shadow"/><use href="#${id}" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}"/>`;
        $('#title-art').innerHTML = `<svg viewBox="-14 -14 76 52">${body}${tok('cat-millie', 0.5 * w, 15, 15)}${tok('btn-pink', w * 1.15, 4, 8)}${tok('cat-leo', 2.1 * w, 26, 13)}</svg>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        this.fresh = new Set();
        view.events.filter(e => e.seq > this.lastSeq).forEach(e => {
            if (e.type === 'place') this.fresh.add(`${e.seat}:${e.cell}`);
        });
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!this.canPlace()) this.clearSelection();
        if (this.sel !== null && this.sel >= (view.players[view.you].hand?.length ?? 0)) this.clearSelection();
        if (prev && prev.current !== view.current && view.current === view.you) this.viewSeat = view.you;
        this.renderStatus();
        this.renderPlayers();
        this.renderCats();
        this.renderBoard();
        this.renderTiles();
        this.renderNote();
        this.maybeAskGoals();
        if (view.phase === 'end' && prev && prev.phase !== 'end') {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    isMyTurn() {
        const v = this.view;
        return !!v && v.answering.includes(v.you);
    }

    canPlace() {
        return this.isMyTurn() && this.view.phase === 'place';
    }

    canTake() {
        return this.isMyTurn() && this.view.phase === 'take';
    }

    renderStatus() {
        const v = this.view;
        const me = v.players[v.you];
        let text;
        if (v.phase === 'end') text = '終わり';
        else if (v.phase === 'goals') text = me.chosen ? 'ほかの人が選んでいます' : '目標を選んでください';
        else if (v.current === v.you) text = 'あなたの番';
        else text = `${escapeHtml(v.players[v.current].name)}の番`;
        $('#status').innerHTML = `<span>${text}</span><span class="left">残り${v.turns - me.placed}手</span>`;
    }

    renderPlayers() {
        const v = this.view;
        const scores = v.result ? v.result.players.map(s => s.total) : v.players.map(p => scorePlayer({ ...p, goals: p.goals ?? [] }).total);
        $('#players').innerHTML = v.players.map((p, i) => `<button type="button" class="player${i === v.current && v.phase !== 'end' && v.phase !== 'goals' ? ' current' : ''}${i === this.viewSeat ? ' viewing' : ''}" data-seat="${i}" aria-label="${escapeHtml(p.name)}のキルト">
            <span class="who"><span class="nm">${escapeHtml(p.name)}</span><span class="pt">${scores[i]}点</span></span><span class="meta"><span>${catSvg('millie', 13)}${p.cats.length}</span><span>${buttonSvg('rainbow', 12)}${p.buttons.length + (p.rainbow ? 1 : 0)}</span></span></button>`).join('');
    }

    renderCats() {
        $('#cats').innerHTML = this.view.cats.map(c => `<span class="cat-chip">${catSvg(c.id, 26)}<b>${CATS[c.id].points}</b>${patternSwatch(c.patterns[0], 15)}${patternSwatch(c.patterns[1], 15)}${needSvg(c.id)}</span>`).join('');
    }

    renderBoard() {
        const v = this.view;
        const seat = this.viewSeat;
        const p = v.players[seat];
        const mine = seat === v.you;
        const placing = mine && this.canPlace() && this.sel !== null;
        const lastPlace = [...v.events].reverse().find(e => e.type === 'place' && e.seat === seat);
        const parts = [];
        for (let cell = 0; cell < CELL_COUNT; cell++) {
            const { x, y } = cellCenter(cell, S);
            const spot = GOAL_CELLS.indexOf(cell);
            if (spot >= 0) {
                if (p.goals) parts.push(goalSvg(p.goals[spot], x, y, S, { status: goalResult(p.board, p.quilt, p.goals[spot], spot) }));
                else parts.push(`<polygon points="${hexPoints(x, y, S * 0.96)}" class="goal-hex"/><text x="${x}" y="${y + 3}" class="goal-label" font-size="8">${spot + 1}</text>`);
                continue;
            }
            const patch = patchAt(p.board, p.quilt, cell);
            if (patch) {
                const edge = BORDER.includes(cell);
                const cls = [edge ? 'edge' : '', lastPlace?.cell === cell ? 'last' : '', this.fresh.has(`${seat}:${cell}`) ? 'drop' : ''].join(' ');
                parts.push(patchSvg(patch, x, y, S, { cls, attrs: `data-cell="${cell}"` }));
            } else if (placing && cell === this.draft) {
                parts.push(patchSvg(TILES[p.hand[this.sel]], x, y, S, { cls: 'draft' }));
            } else {
                parts.push(`<polygon points="${hexPoints(x, y, S * 0.9)}" class="cell${placing ? ' on' : ''}" data-cell="${cell}"/>`);
            }
        }
        // ボタン（左下）と猫（右上）
        const tok = (href, cell, dx, dy, size) => {
            const { x, y } = cellCenter(cell, S);
            const cx = x + dx * S;
            const cy = y + dy * S;
            return `<circle cx="${cx}" cy="${cy + size * 0.06}" r="${size * 0.48}" class="token-shadow"/><use href="#${href}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" pointer-events="none"/>`;
        };
        p.buttons.forEach(b => parts.push(tok(`btn-${b.color}`, b.cell, -0.38, 0.36, S * 0.7)));
        p.cats.forEach(c => parts.push(tok(`cat-${c.cat}`, c.cell, 0.22, -0.2, S * 1.12)));
        if (p.rainbow && p.buttons.length) {
            const last = p.buttons.at(-1).cell;
            parts.push(tok('btn-rainbow', last, 0.4, 0.4, S * 0.7));
        }
        const svg = $('#board');
        svg.setAttribute('viewBox', BOARD_BOX);
        svg.innerHTML = parts.join('');
        const label = $('#board-label');
        label.hidden = mine;
        label.textContent = mine ? '' : `${p.name}のキルト`;
    }

    onBoard(event) {
        const target = event.target.closest('[data-cell]');
        if (!target || !this.canPlace() || this.sel === null || this.viewSeat !== this.view.you) return;
        const cell = Number(target.dataset.cell);
        if (!OPEN_CELLS.includes(cell) || this.view.players[this.view.you].quilt[cell] != null) return;
        if (this.draft === cell) {
            this.confirmPlace();
            return;
        }
        this.draft = cell;
        this.render();
    }

    confirmPlace() {
        if (!this.canPlace() || this.sel === null || this.draft === null) return;
        const command = { type: 'place', hand: this.sel, cell: this.draft };
        this.clearSelection();
        this.send(command);
    }

    renderTiles() {
        const v = this.view;
        const me = v.players[v.you];
        const take = this.canTake();
        const market = $('#market');
        market.classList.toggle('choose', take);
        market.innerHTML = v.market.map((t, i) => `<button type="button" data-market="${i}" ${take && t != null ? '' : 'disabled'} aria-label="${t == null ? '空き' : tileName(t)}">${tileSvg(t, 42)}</button>`).join('');
        const hand = $('#hand');
        hand.classList.toggle('choose', this.canPlace() && this.sel === null);
        const shown = this.viewSeat === v.you ? me : v.players[this.viewSeat];
        if (shown.hand) {
            hand.innerHTML = shown.hand.map((t, i) => `<button type="button" data-hand="${i}" class="${this.sel === i ? 'sel' : ''}" ${this.canPlace() ? '' : 'disabled'} aria-label="${tileName(t)}">${tileSvg(t, 42)}</button>`).join('')
                + (shown.hand.length < 2 ? '<button type="button" disabled aria-label="空き"></button>' : '');
        } else {
            hand.innerHTML = Array.from({ length: shown.handCount }, () => '<button type="button" disabled aria-label="手札"><span class="back"></span></button>').join('');
        }
        $('#confirm').disabled = !(this.canPlace() && this.sel !== null && this.draft !== null);
    }

    // 下の1行：何をするか、置いたら何が来るか、相手が何をしたか
    renderNote() {
        const v = this.view;
        const note = $('#note');
        if (v.phase === 'end' || v.phase === 'goals') {
            note.textContent = '';
            return;
        }
        if (this.canTake()) {
            note.textContent = '市場から1枚取る';
            return;
        }
        if (this.canPlace()) {
            if (this.sel === null || this.draft === null) {
                note.textContent = 'パッチを1枚縫い付ける';
                return;
            }
            const me = v.players[v.you];
            const next = { ...me, quilt: [...me.quilt], goals: me.goals ?? [] };
            next.quilt[this.draft] = me.hand[this.sel];
            const award = awardsFor(next, v.cats, this.draft);
            const parts = [];
            if (award.button) parts.push(`${buttonSvg(award.button, 16)}ボタン`);
            if (award.rainbow) parts.push(`${buttonSvg('rainbow', 16)}虹`);
            if (award.cat) parts.push(`${catSvg(award.cat, 18)}${CATS[award.cat].name}`);
            note.innerHTML = parts.length ? `この手で ${parts.join(' ')}` : '';
            return;
        }
        const last = [...v.events].reverse().find(e => e.type === 'place' || e.type === 'take');
        if (!last) {
            note.textContent = '';
            return;
        }
        const who = escapeHtml(v.players[last.seat].name);
        note.innerHTML = last.type === 'place'
            ? `${who}：${tileName(last.tile)}を置く${last.gained.length ? `・${last.gained.map(escapeHtml).join('・')}` : ''}`
            : `${who}：${tileName(last.tile)}を取る`;
    }

    send(command) {
        if (!this.controller) return;
        if (!this.controller.send(command)) this.render();
    }

    // ---- 目標タイルを選ぶ ----

    maybeAskGoals() {
        const v = this.view;
        const me = v.players[v.you];
        const dialog = $('#goals');
        if (v.phase === 'goals' && !me.chosen && me.offered) {
            if (!dialog.open) {
                this.goalPicks = [];
                this.renderGoalDialog();
                dialog.showModal();
            }
        } else if (dialog.open) dialog.close();
    }

    renderGoalDialog() {
        const me = this.view.players[this.view.you];
        const tiles = me.offered.map((g, i) => {
            const order = this.goalPicks.indexOf(i);
            return `<button type="button" data-goal="${i}" class="${order >= 0 ? 'sel' : ''}"><span class="order">${order >= 0 ? order + 1 : ''}</span>${goalTileSvg(g, 54)}<span>${GOALS[g].one}／${GOALS[g].both}</span></button>`;
        }).join('');
        // 置き場の位置を、小さな盤で見せる
        const mini = [];
        for (let cell = 0; cell < CELL_COUNT; cell++) {
            const { x, y } = cellCenter(cell, S);
            const spot = GOAL_CELLS.indexOf(cell);
            if (spot >= 0) {
                const pick = this.goalPicks[spot];
                mini.push(pick !== undefined ? goalSvg(me.offered[pick], x, y, S) : `<polygon points="${hexPoints(x, y, S * 0.96)}" class="goal-hex"/><text x="${x}" y="${y + 3}" class="goal-label" font-size="8">${spot + 1}</text>`);
            } else {
                const patch = patchAt(me.board, me.quilt, cell);
                mini.push(patch ? patchSvg(patch, x, y, S, { cls: 'edge' }) : `<polygon points="${hexPoints(x, y, S * 0.9)}" class="cell"/>`);
            }
        }
        $('#goals-body').innerHTML = `<div class="goals-pick">${tiles}</div>
            <div class="goals-board"><svg viewBox="${BOARD_BOX}">${mini.join('')}</svg></div>
            <p class="goals-help">押した順に、置き場の1・2・3に入ります。まわりの6枚の色か模様が数の形に合えば青い数、両方で合えば金の数の点です。</p>`;
        $('#goals-ok').disabled = this.goalPicks.length !== 3;
    }

    // ---- ダイアログ ----

    openLog() {
        const v = this.view;
        $('#log-list').innerHTML = (v?.logs ?? []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    openCats() {
        const v = this.view;
        if (!v) return;
        const me = v.players[this.viewSeat];
        const cats = v.cats.map(c => {
            const got = me.cats.filter(x => x.cat === c.id).length;
            return `<div class="card">
                <div class="head">${catSvg(c.id, 40)}<span>${CATS[c.id].points}点</span></div>
                <div class="title">${CATS[c.id].name} ${patternSwatch(c.patterns[0], 18)}${patternName(c.patterns[0])} ${patternSwatch(c.patterns[1], 18)}${patternName(c.patterns[1])}<span class="mine">×${got}</span></div>
                <div class="text">${catText(c.id)}${CATS[c.id].kind === 'count' ? '' : ` ${needSvg(c.id, 16)}`}</div>
            </div>`;
        }).join('');
        const colors = COLORS.map(c => `${buttonSvg(c, 18)}`).join('');
        $('#cats-body').innerHTML = `${cats}
            <div class="card"><div class="head">${buttonSvg('rainbow', 36)}<span>3点</span></div>
            <div class="title">ボタン ${colors}<span class="mine">×${me.buttons.length + (me.rainbow ? 1 : 0)}</span></div>
            <div class="text">同じ色が3枚以上つながると、ボタン1つ（3点）。広げても増えません。6色そろうと虹のボタン（3点）。縁のパッチも数えます。</div></div>`;
        $('#cats-dialog').showModal();
    }

    showResult() {
        const v = this.view;
        if (!v?.result) return;
        const res = v.result;
        const winners = new Set(res.winners);
        const title = v.solo ? `${res.players[0].total}点` : res.winners.includes(v.you) ? (res.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${res.winners.map(i => v.players[i].name).join('と')}の勝ち`;
        $('#result-title').textContent = title;
        const cols = v.players.map((p, i) => `<th class="${winners.has(i) ? 'win' : ''}">${escapeHtml(p.name)}</th>`).join('');
        const row = (label, values) => `<tr><td><span class="ic">${label}</span></td>${values.map(x => `<td>${x}</td>`).join('')}</tr>`;
        const named = v.players.length <= 3; // 4人では、猫とボタンの名前を省いて幅を空ける
        const goalCell = (s, i, spot) => {
            const g = s.goals[spot];
            const id = v.players[i].goals?.[spot];
            const how = g.color && g.pattern ? '両方' : g.color ? '色' : g.pattern ? '模様' : '';
            return `${id ? `<small>${GOALS[id].label}</small>` : ''}${g.points}${how ? `<small>${how}</small>` : ''}`;
        };
        const rows = [
            ...[0, 1, 2].map(spot => row(`目標${spot + 1}`, res.players.map((s, i) => goalCell(s, i, spot)))),
            row(`${buttonSvg('rainbow', 18)}${named ? 'ボタン' : ''}`, res.players.map((s, i) => `${s.buttonPoints}<small>${v.players[i].buttons.length}個${v.players[i].rainbow ? '＋虹' : ''}</small>`)),
            ...v.cats.map(c => row(`${catSvg(c.id, 22)}${named ? CATS[c.id].name : ''}`, v.players.map(p => {
                const n = p.cats.filter(x => x.cat === c.id).length;
                return `${n * CATS[c.id].points}${n ? `<small>${n}匹</small>` : ''}`;
            }))),
            `<tr class="total"><td>合計</td>${res.players.map((s, i) => `<td class="${winners.has(i) ? 'win' : ''}">${s.total}</td>`).join('')}</tr>`
        ];
        $('#result-table').innerHTML = `<table><thead><tr><th></th>${cols}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
        $('#result').showModal();
    }

    renderHelp() {
        const legendC = COLORS.map(c => `<span>${colorSwatch(c, 22)}${COLOR_INFO[c].name}</span>`).join('');
        const legendP = PATTERNS.map(p => `<span>${patternSwatch(p, 22)}${patternName(p)}</span>`).join('');
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>パッチ（6色×6模様）を自分のキルトに縫い付けて、<strong>目標タイル</strong>・<strong>猫</strong>・<strong>ボタン</strong>の点を集めます。キルトが埋まったら（22手番）、点の多い人の勝ちです。</p>
            <div class="help-legend">${legendC}</div>
            <div class="help-legend">${legendP}</div>
            <h3>手番</h3>
            <p>手札の2枚から1枚を、キルトの空きマスに置きます。そのあと、市場の3枚から1枚を手札に取ります（市場は袋から補います）。</p>
            <h3>ボタン</h3>
            <p>同じ<strong>色</strong>が3枚以上つながると、ボタン1つ（3点）。広げても増えません。2つ目は、離れた別のまとまりで。6色そろうと<strong>虹のボタン</strong>（3点）。盤の縁のパッチも数えます。</p>
            <h3>猫</h3>
            <p>3匹の猫には、それぞれ好きな<strong>模様</strong>が2つあります。好きな模様のまとまりが、猫ごとの枚数か形になると、猫が来ます（上の猫の欄を押すと詳しく見られます）。猫のいるまとまりに、もう猫は来ません。縁のパッチも数えます。</p>
            <h3>目標タイル</h3>
            <p>まわりの6枚の<strong>色</strong>か<strong>模様</strong>の数が、タイルの形（AAA-BBB なら「3つと3つ」、≠ なら「すべて違う」）に合うと、青い数の点。色と模様の両方で合うと、金の数の点だけをもらいます。</p>
            <h3>準備</h3>
            <p>「はじめて」は、猫がミリー・ティビット・ココナッツ、目標が ≠・AA-BB-CC・AAA-BBB。「ふつう」は、猫を札の・の数ごとに1匹ずつ選び、目標は配られた4枚から3枚を選んで置きます。</p>
            <h3>終わり</h3>
            <p>全員のキルトが埋まったら終わり。同点なら猫が多い人、次にボタンが多い人の勝ちです。1人用は、市場から取るたびに、いちばん右のパッチを捨てて詰めます。</p>`;
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

export { colorName };
