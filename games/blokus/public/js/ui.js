/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * ピースの置き方
 * - 下の置き場のピースを押して選ぶ。盤の上に、置ける位置があればそこに、なければ中央に影が出る
 * - 盤の上で指を動かすと、影がその分だけ動く（指でピースが隠れないように、指の下ではなく動いた分だけ動かす）
 *   押しただけなら、押したマスに影の中心を寄せる
 * - 回す・裏返すで向きを変える（影の中心は動かさない）。置ける位置なら「✓」で置く
 */

import { SIZE, COLORS, COLOR_NAMES, PIECES, PIECE_ORDER, SHARED, canPlaceCells, placedCells, anchors, legalMoves } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';

const SETTINGS_KEY = 'blokus.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 900;
const TAP_PX = 8;     // これより動かなければ「押しただけ」

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4].includes(saved.count) ? saved.count : 4,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy',
            scoring: ['basic', 'advanced'].includes(saved.scoring) ? saved.scoring : 'advanced'
        };
    } catch {
        return { count: 4, level: 'easy', scoring: 'advanced' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// ピースの小さな絵（SVG）
export function pieceSvg(piece, orient = 0, color = 'blue', cell = 7) {
    const cells = PIECES[piece].orientations[orient];
    const w = Math.max(...cells.map(([x]) => x)) + 1;
    const h = Math.max(...cells.map(([, y]) => y)) + 1;
    return `<svg class="piece-svg c-${color}" width="${w * cell}" height="${h * cell}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${cells.map(([x, y]) => `<rect x="${x + 0.06}" y="${y + 0.06}" width=".88" height=".88" rx=".14"/>`).join('')}</svg>`;
}

const rotateOrient = (t) => (t < 4 ? (t + 1) % 4 : 4 + ((t + 1) % 4));
const flipOrient = (t) => (t < 4 ? t + 4 : t - 4);

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selected = null;     // { piece, orient, x, y }
        this.orients = {};        // ピースごとに、最後に使った向き
        this.lastSeq = 0;
        this.resultTimer = null;
        this.drag = null;
        this.buildBoard();
        this.bindStatic();
        this.renderTitleArt();
        this.renderHelpFigure();
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
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.selected = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level, scoring } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: { scoring } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
        const segment = (id, key, parse) => $(id).addEventListener('click', (event) => {
            const button = event.target.closest('button[role=radio]');
            if (!button) return;
            this.settings[key] = parse(button.dataset[key]);
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#player-count', 'count', Number);
        segment('#cpu-level', 'level', String);
        segment('#scoring', 'scoring', String);
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#home').addEventListener('click', () => this.showTitle());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#again').addEventListener('click', () => this.newGame());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#status').addEventListener('click', () => this.openLog());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
            });
        });
        $('#tray').addEventListener('click', (event) => {
            const button = event.target.closest('[data-piece]');
            if (button) this.select(button.dataset.piece);
        });
        $('#rotate').addEventListener('click', () => this.turnPiece(rotateOrient));
        $('#flip').addEventListener('click', () => this.turnPiece(flipOrient));
        $('#hint').addEventListener('click', () => this.showHint());
        $('#cancel').addEventListener('click', () => {
            this.selected = null;
            this.renderBoard();
            this.renderTray();
            this.renderControls();
        });
        $('#place').addEventListener('click', () => this.placeSelected());
        this.bindBoardPointer();
        window.addEventListener('resize', () => this.layoutBoard());
    }

    renderSetup() {
        const mark = (id, key) => document.querySelectorAll(`${id} button`).forEach(b => b.setAttribute('aria-checked', String(String(this.settings[key]) === b.dataset[key])));
        mark('#player-count', 'count');
        mark('#cpu-level', 'level');
        mark('#scoring', 'scoring');
    }

    renderTitleArt() {
        // 4色が角から伸びた小さな盤（実際のルールどおり、同じ色は角だけで接する）
        const rows = [
            'BBB..YY',
            'B..B.Y.',
            '...BYY.',
            '..R.G..',
            '.RR.GG.',
            'R.....G',
            'RR...GG'
        ];
        const color = { B: 'blue', Y: 'yellow', R: 'red', G: 'green' };
        $('#title-art').innerHTML = `<svg viewBox="0 0 7 7" aria-hidden="true">${rows.flatMap((row, y) => [...row].map((ch, x) => (ch === '.' ? `<rect class="empty" x="${x + 0.05}" y="${y + 0.05}" width=".9" height=".9" rx=".1"/>` : `<rect class="c-${color[ch]}" x="${x + 0.05}" y="${y + 0.05}" width=".9" height=".9" rx=".14"/>`))).join('')}</svg>`;
    }

    renderHelpFigure() {
        // 置ける（角で接する）と、置けない（辺で接する）の図
        const fig = (rows, ok) => `<div class="fig ${ok ? 'ok' : 'ng'}"><svg viewBox="0 0 5 4">${rows.flatMap((row, y) => [...row].map((ch, x) => (ch === '.' ? `<rect class="empty" x="${x + 0.05}" y="${y + 0.05}" width=".9" height=".9" rx=".1"/>` : `<rect class="${ch === 'A' ? 'c-blue' : 'c-blue new'}" x="${x + 0.05}" y="${y + 0.05}" width=".9" height=".9" rx=".14"/>`))).join('')}</svg><span>${ok ? '○ 角で接する' : '× 辺で接する'}</span></div>`;
        $('#help-figure').innerHTML = fig(['AA...', 'A....', '.NNN.', '...N.'], true) + fig(['AA...', 'A....', 'NNN..', '..N..'], false);
    }

    // ---- 盤 ----

    buildBoard() {
        const board = $('#board');
        board.innerHTML = Array.from({ length: SIZE * SIZE }, (_, i) => `<div class="cell" data-i="${i}"></div>`).join('');
        this.cells = [...board.children];
    }

    layoutBoard() {
        const wrap = $('#board-wrap');
        const size = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight) / SIZE) * SIZE;
        $('#board').style.width = `${size}px`;
        $('#board').style.height = `${size}px`;
    }

    // 指の位置から、盤のマス
    cellAt(clientX, clientY) {
        const r = $('#board').getBoundingClientRect();
        const unit = r.width / SIZE;
        return [Math.floor((clientX - r.left) / unit), Math.floor((clientY - r.top) / unit)];
    }

    bindBoardPointer() {
        const board = $('#board');
        board.addEventListener('pointerdown', (event) => {
            if (!this.selected || !this.isMyTurn()) return;
            board.setPointerCapture(event.pointerId);
            this.drag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, x: this.selected.x, y: this.selected.y, moved: false };
        });
        board.addEventListener('pointermove', (event) => {
            const d = this.drag;
            if (!d || d.id !== event.pointerId || !this.selected) return;
            const unit = board.getBoundingClientRect().width / SIZE;
            const dx = event.clientX - d.sx;
            const dy = event.clientY - d.sy;
            if (Math.hypot(dx, dy) > TAP_PX) d.moved = true;
            if (!d.moved) return;
            this.moveGhost(d.x + Math.round(dx / unit), d.y + Math.round(dy / unit));
        });
        const end = (event) => {
            const d = this.drag;
            if (!d || d.id !== event.pointerId) return;
            this.drag = null;
            if (!d.moved && this.selected) {
                // 押しただけ：影の中心をそのマスへ
                const [cx, cy] = this.cellAt(event.clientX, event.clientY);
                const { w, h } = this.shapeSize();
                this.moveGhost(cx - Math.floor((w - 1) / 2), cy - Math.floor((h - 1) / 2));
            }
        };
        board.addEventListener('pointerup', end);
        board.addEventListener('pointercancel', (event) => {
            if (this.drag?.id === event.pointerId) this.drag = null;
        });
    }

    shapeSize(sel = this.selected) {
        const cells = PIECES[sel.piece].orientations[sel.orient];
        return { w: Math.max(...cells.map(([x]) => x)) + 1, h: Math.max(...cells.map(([, y]) => y)) + 1 };
    }

    // 影を盤の内側に収めて動かす
    moveGhost(x, y) {
        const { w, h } = this.shapeSize();
        this.selected.x = Math.max(0, Math.min(SIZE - w, x));
        this.selected.y = Math.max(0, Math.min(SIZE - h, y));
        this.renderBoard();
        this.renderControls();
    }

    // ---- 選ぶ・回す・置く ----

    isMyTurn() {
        const v = this.view;
        return !!v && v.phase !== 'end' && v.actors.includes(v.you);
    }

    select(piece) {
        const v = this.view;
        if (!this.isMyTurn() || !v.colors[v.current].pieces.includes(piece)) return;
        const orient = this.orients[piece] ?? 0;
        const color = v.current;
        // 置ける位置があれば、そこに影を出す（同じ向きを優先）
        const moves = legalMoves(v.board, color, [piece], v.colors[color].placed === 0, { only: [piece] });
        const move = moves.find(m => PIECES[piece].orientations[m.orient].join() === PIECES[piece].orientations[orient].join()) ?? null;
        if (move) {
            this.selected = { piece, orient, x: move.x, y: move.y };
        } else {
            this.selected = { piece, orient, x: 0, y: 0 };
            const { w, h } = this.shapeSize();
            this.selected.x = Math.floor((SIZE - w) / 2);
            this.selected.y = Math.floor((SIZE - h) / 2);
        }
        this.renderBoard();
        this.renderTray();
        this.renderControls();
    }

    turnPiece(change) {
        if (!this.selected) return;
        const before = this.shapeSize();
        const cx = this.selected.x + (before.w - 1) / 2;
        const cy = this.selected.y + (before.h - 1) / 2;
        this.selected.orient = change(this.selected.orient);
        this.orients[this.selected.piece] = this.selected.orient;
        const after = this.shapeSize();
        this.moveGhost(Math.round(cx - (after.w - 1) / 2), Math.round(cy - (after.h - 1) / 2));
        this.renderTray();
    }

    ghostCells() {
        const s = this.selected;
        return s ? placedCells(s.piece, s.orient, s.x, s.y) : [];
    }

    ghostValid() {
        const v = this.view;
        if (!this.selected || !this.isMyTurn()) return false;
        return canPlaceCells(v.board, v.current, this.ghostCells(), v.colors[v.current].placed === 0);
    }

    // ヒント：CPU（ふつう）が選ぶピースを、その向きと位置で選んだ状態にする
    showHint() {
        const command = this.isMyTurn() ? this.controller?.hint() : null;
        if (!command) return this.toast('自分の番になったら、おすすめを出せます');
        const { piece, orient, x, y } = command;
        this.orients[piece] = orient;
        this.selected = { piece, orient, x, y };
        this.render();
        $('#place').classList.add('recommended');
        this.toast('おすすめ：この位置で「✓」を押して置く');
    }

    placeSelected() {
        if (!this.ghostValid()) return;
        const { piece, orient, x, y } = this.selected;
        this.selected = null;
        this.controller.send({ type: 'place', piece, orient, x, y });
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        this.view = this.controller.getView();
        $('#place').classList.remove('recommended');
        const v = this.view;
        // 自分の番でなくなったら、選んでいたピースを外す
        if (this.selected && (!this.isMyTurn() || !v.colors[v.current].pieces.includes(this.selected.piece))) this.selected = null;
        this.layoutBoard();
        this.renderPlayers();
        this.renderBoard();
        this.renderTray();
        this.renderControls();
        this.lastSeq = v.events.at(-1)?.seq ?? this.lastSeq;
        this.maybeResult();
    }

    colorOwnerName(color) {
        const v = this.view;
        const owner = v.owners[color];
        return owner === SHARED ? '交代' : v.players[owner].name;
    }

    renderPlayers() {
        const v = this.view;
        $('#players').innerHTML = COLORS.map((name, color) => {
            const c = v.colors[color];
            const active = v.phase !== 'end' && v.current === color;
            const mine = v.owners[color] === v.you;
            return `<div class="pchip c-${name} ${active ? 'active' : ''} ${c.out ? 'out' : ''} ${mine ? 'mine' : ''}">
                <span class="dot"></span><span class="pname">${escapeHtml(this.colorOwnerName(color))}</span><b>${c.remaining}</b></div>`;
        }).join('');
    }

    renderBoard() {
        const v = this.view;
        if (!v) return;
        const fresh = new Set();
        v.events.filter(e => e.seq > this.lastSeq && e.type === 'place').forEach(e => e.cells.forEach(([x, y]) => fresh.add(y * SIZE + x)));
        const last = new Set((v.lastMove?.cells ?? []).map(([x, y]) => y * SIZE + x));
        const hints = new Set();
        if (this.isMyTurn()) anchors(v.board, v.current, v.colors[v.current].placed === 0).forEach(([x, y]) => hints.add(y * SIZE + x));
        const ghost = new Set(this.ghostCells().map(([x, y]) => y * SIZE + x));
        const valid = this.ghostValid();
        const ghostColor = COLORS[v.current];
        const corners = new Map([[0, 'blue'], [SIZE - 1, 'yellow'], [SIZE * SIZE - 1, 'red'], [SIZE * (SIZE - 1), 'green']]);
        v.board.forEach((color, i) => {
            const cls = ['cell'];
            if (color >= 0) {
                cls.push(`c-${COLORS[color]}`, 'filled');
                if (last.has(i)) cls.push('last');
                if (fresh.has(i)) cls.push('drop');
            } else {
                if (corners.has(i)) cls.push('corner', `k-${corners.get(i)}`);
                if (hints.has(i)) cls.push('hint', `h-${ghostColor}`);
            }
            if (ghost.has(i)) cls.push('ghost', `g-${ghostColor}`, valid ? 'ok' : 'ng');
            const className = cls.join(' ');
            if (this.cells[i].className !== className) this.cells[i].className = className;
        });
    }

    // 置き場：自分の番なら今の色、そうでなければ自分の次の色
    trayColor() {
        const v = this.view;
        if (this.isMyTurn()) return v.current;
        const mine = COLORS.map((_, i) => i).filter(i => v.owners[i] === v.you && !v.colors[i].out);
        for (let k = 1; k <= 4; k++) {
            const c = (v.current + k) % 4;
            if (mine.includes(c)) return c;
        }
        return mine[0] ?? null;
    }

    renderTray() {
        const v = this.view;
        if (!v) return;
        const color = this.trayColor();
        const tray = $('#tray');
        if (color === null) {
            const done = COLORS.some((_, c) => v.owners[c] === v.you && v.colors[c].pieces.length === 0);
            tray.innerHTML = `<p class="note">${done ? '全部置きました' : '置けるピースはありません'}</p>`;
            return;
        }
        const name = COLORS[color];
        const active = this.isMyTurn();
        const pieces = v.colors[color].pieces;
        tray.classList.toggle('waiting', !active);
        tray.innerHTML = PIECE_ORDER.map(p => {
            if (!pieces.includes(p)) return `<span class="tray-piece used">${pieceSvg(p, 0, name)}</span>`;
            const sel = this.selected?.piece === p;
            return `<button class="tray-piece ${sel ? 'selected' : ''}" data-piece="${p}" aria-label="${PIECES[p].size}マスのピース" ${active ? '' : 'disabled'}>${pieceSvg(p, sel ? this.selected.orient : (this.orients[p] ?? 0), name)}</button>`;
        }).join('');
    }

    renderControls() {
        const v = this.view;
        const has = !!this.selected;
        $('#rotate').disabled = !has;
        $('#flip').disabled = !has;
        $('#cancel').disabled = !has;
        $('#place').disabled = !this.ghostValid();
        const actor = v.actors[0];
        let text;
        if (v.phase === 'end') text = '終わり';
        else if (actor === v.you) text = has ? (this.ghostValid() ? '置けます' : 'ここには置けません') : `あなたの番（${COLOR_NAMES[COLORS[v.current]]}）`;
        else text = `${v.players[actor].name}の番（${COLOR_NAMES[COLORS[v.current]]}）`;
        $('#status').className = `status ${actor === v.you && v.phase !== 'end' ? 'mine' : ''}`;
        $('#status').innerHTML = `<span class="dot c-${COLORS[v.current]}"></span>${escapeHtml(text)}`;
    }

    openLog() {
        const v = this.controller?.getView();
        if (!v) return;
        $('#log-list').innerHTML = v.logs.map(l => `<li>${escapeHtml(l)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    // ---- 終わり ----

    maybeResult() {
        const v = this.view;
        clearTimeout(this.resultTimer);
        if (v.phase !== 'end' || this.shownResult === v.logCount) return;
        this.resultTimer = setTimeout(() => {
            this.shownResult = v.logCount;
            this.showResult();
        }, RESULT_DELAY_MS);
    }

    showResult() {
        const v = this.view;
        const me = v.you;
        const winners = v.winners;
        $('#result-title').textContent = winners.length > 1
            ? (winners.includes(me) ? '引き分け' : `${winners.map(i => v.players[i].name).join('と')}の勝ち`)
            : winners[0] === me ? 'あなたの勝ち' : `${v.players[winners[0]].name}の勝ち`;
        $('#result-sub').textContent = v.scoring === 'advanced' ? '上級の得点法（残り1マスで−1点、全部置けたら+15点、最後が1マスなら+5点）' : '基本の得点法（残りのマスが少ない人の勝ち）';
        const order = v.players.map((_, i) => i).sort((a, b) => v.players[b].score - v.players[a].score);
        const colorsOf = (seat) => COLORS.map((_, c) => c).filter(c => v.owners[c] === seat);
        $('#result-table').innerHTML = `<tr><th></th><th>色</th><th>残り</th><th>点</th></tr>` + order.map(seat => `<tr class="${winners.includes(seat) ? 'win' : ''}">
            <td>${escapeHtml(v.players[seat].name)}</td>
            <td>${colorsOf(seat).map(c => `<span class="dot c-${COLORS[c]}"></span>`).join('')}</td>
            <td>${colorsOf(seat).reduce((n, c) => n + v.colors[c].remaining, 0)}</td>
            <td>${v.scoring === 'advanced' ? v.players[seat].score : '−'}</td></tr>`).join('');
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
