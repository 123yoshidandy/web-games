/**
 * 画面（タイトル・対局・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * - 盤は1枚の SVG。押した位置から一番近い交点を求める
 * - マスが小さいとき（スマホの13路・19路）は、押すと仮に置き（線の十字で位置を示す）、もう一度押すか「ここに打つ」で打つ。
 *   指を動かすと仮の石も動く。マスが大きいとき（9路、PC）は、押した点にすぐ打つ。マウスでは、打つ前に薄い石で位置を示す
 * - 打てない点（コウ・自殺手）を押したら、わけを短く知らせる。コウで取り返せない点には、四角の印を付ける
 * - 終局のあとは、死に石を押して直す。地を小さな四角で示し、点を下に出す
 */

import { SIZES, MAX_HANDICAP, COLOR_NAME, colorOf, sqName, tryMove } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, LEVEL_NAMES } from './cpu-player.js';
import { resultText, marginText } from './game.js';
import { toSgf, sgfFileName } from './sgf.js';
import { symbolsSvg, stoneSvg, boardBaseSvg, boardExtent, pointXY, stoneAt, MARGIN } from './art.js';

const SETTINGS_KEY = 'go.settings';
const RESULT_DELAY_MS = 700;
const KOMI_OPTIONS = [0, 0.5, 5.5, 6.5, 7.5];
const CONFIRM_CELL_PX = 30;      // 交点の間がこれより狭いと、仮置きしてから打つ（指で押すとき）
const CONFIRM_CELL_PX_MOUSE = 18;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches;

const komiText = (komi) => (komi === 0 ? 'なし' : marginText(komi));
const handicapText = (n) => (n === 0 ? 'なし' : `${n}子`);

function loadSettings() {
    const defaults = { mode: 'cpu', size: 9, level: 'normal', color: 1, handicap: 0, komi: 6.5 };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        const size = SIZES.includes(saved.size) ? saved.size : defaults.size;
        const handicap = Number.isInteger(saved.handicap) && saved.handicap !== 1 && saved.handicap >= 0 && saved.handicap <= MAX_HANDICAP[size] ? saved.handicap : 0;
        return {
            mode: ['cpu', 'two'].includes(saved.mode) ? saved.mode : defaults.mode,
            size,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : defaults.level,
            color: [1, 2].includes(saved.color) ? saved.color : defaults.color,
            handicap,
            komi: KOMI_OPTIONS.includes(saved.komi) ? saved.komi : defaults.komi
        };
    } catch {
        return defaults;
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
        this.anim = null;          // 打った石と取った石の演出 { sq, captured, color }
        this.pending = null;       // 仮に置いた点
        this.hover = null;         // マウスの下の点
        this.press = null;         // 押している間の { sq, pointerId, hadPending }
        this.confirmMode = false;
        this.resultTimer = null;
        this.resultShown = false;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.bindBoard();
        this.renderTitleArt();
        this.renderHelp();
        new ResizeObserver(() => { if (this.view) this.renderBoard(); }).observe($('#board'));
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
        this.anim = null;
        this.pending = null;
        this.hover = null;
        this.resultShown = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { mode, level, color, size, handicap, komi } = this.settings;
        const players = mode === 'two'
            ? [{ name: '黒', isCPU: false }, { name: '白', isCPU: false }]
            : [{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true, cpuLevel: level }];
        if (mode === 'cpu' && color === 2) players.reverse();
        this.startGame({ players, options: { size, handicap, komi } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
        const pick = (selector, key, parse = (v) => v) => $(selector).addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (!button) return;
            this.settings[key] = parse(button.dataset.value);
            if (key === 'size') this.settings.handicap = Math.min(this.settings.handicap, MAX_HANDICAP[this.settings.size]);
            saveSettings(this.settings);
            this.renderSetup();
        });
        pick('#mode', 'mode');
        pick('#size', 'size', Number);
        pick('#cpu-level', 'level');
        pick('#color', 'color', Number);
        $('#handicap').addEventListener('click', (event) => {
            const step = Number(event.target.closest('button[data-step]')?.dataset.step ?? 0);
            if (!step) return;
            const list = [0, ...Array.from({ length: MAX_HANDICAP[this.settings.size] - 1 }, (_, i) => i + 2)];
            const i = Math.max(0, Math.min(list.length - 1, list.indexOf(this.settings.handicap) + step));
            const before = this.settings.handicap;
            this.settings.handicap = list[i];
            // 置き碁のコミはふつう半目。置き石を付けたり外したりしたら、決まりの値に合わせる
            if (before === 0 && list[i] > 0 && this.settings.komi === 6.5) this.settings.komi = 0.5;
            if (before > 0 && list[i] === 0 && this.settings.komi === 0.5) this.settings.komi = 6.5;
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#komi').addEventListener('click', (event) => {
            const step = Number(event.target.closest('button[data-step]')?.dataset.step ?? 0);
            if (!step) return;
            const i = Math.max(0, Math.min(KOMI_OPTIONS.length - 1, KOMI_OPTIONS.indexOf(this.settings.komi) + step));
            this.settings.komi = KOMI_OPTIONS[i];
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#again-end').addEventListener('click', () => this.newGame());
        $('#show-result').addEventListener('click', () => this.showResult());
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#result-sgf').addEventListener('click', () => this.saveSgf());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#undo').addEventListener('click', () => this.undo());
        $('#sgf').addEventListener('click', () => this.saveSgf());
        $('#resign').addEventListener('click', () => $('#resign-confirm').showModal());
        $('#resign-yes').addEventListener('click', () => {
            $('#resign-confirm').close();
            this.controller?.send({ type: 'resign' });
        });
        $('#pass').addEventListener('click', () => {
            this.pending = null;
            this.controller?.send({ type: 'pass' });
        });
        $('#place').addEventListener('click', () => {
            if (this.pending !== null) this.place(this.pending);
        });
        $('#resume-play').addEventListener('click', () => this.controller?.send({ type: 'resume' }));
        $('#confirm').addEventListener('click', () => this.controller?.send({ type: 'confirm' }));
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
    }

    // ---- 盤の操作 ----

    // 画面の座標から、一番近い交点（盤の外なら null）
    pointAt(event) {
        const v = this.view;
        if (!v) return null;
        const rect = $('#board').getBoundingClientRect();
        const ext = boardExtent(v.size);
        const x = (event.clientX - rect.left) / rect.width * ext - MARGIN;
        const y = (event.clientY - rect.top) / rect.height * ext - MARGIN;
        const c = Math.round(x);
        const r = Math.round(y);
        if (c < 0 || r < 0 || c >= v.size || r >= v.size || Math.abs(x - c) > 0.62 || Math.abs(y - r) > 0.62) return null;
        return r * v.size + c;
    }

    canPlay() {
        const v = this.view;
        return !!v && v.phase === 'play' && v.myTurn && !v.thinking;
    }

    bindBoard() {
        const board = $('#board');
        board.addEventListener('pointerdown', (event) => {
            const v = this.view;
            if (!v || event.button > 0) return;
            const sq = this.pointAt(event);
            if (v.phase === 'scoring') {
                this.press = { sq, pointerId: event.pointerId, scoring: true };
                return;
            }
            if (!this.canPlay()) return;
            this.press = { sq, pointerId: event.pointerId, hadPending: this.pending, moved: false };
            try { board.setPointerCapture(event.pointerId); } catch { /* 取れなくても動く */ }
            if (this.confirmMode && sq !== null && v.board[sq] === 0 && sq !== this.pending) {
                this.pending = sq;
                this.renderBoard();
            }
        });
        board.addEventListener('pointermove', (event) => {
            const v = this.view;
            if (!v) return;
            const sq = this.pointAt(event);
            const press = this.press;
            if (press && press.pointerId === event.pointerId && !press.scoring) {
                if (sq !== press.sq) press.moved = true;
                if (this.confirmMode && sq !== null && v.board[sq] === 0 && sq !== this.pending) {
                    this.pending = sq;
                    this.renderBoard();
                }
                return;
            }
            if (event.pointerType === 'mouse') {
                const hover = this.canPlay() && sq !== null && v.board[sq] === 0 ? sq : null;
                if (hover !== this.hover) {
                    this.hover = hover;
                    this.renderBoard();
                }
            }
        });
        board.addEventListener('pointerleave', () => {
            if (this.hover !== null) {
                this.hover = null;
                this.renderBoard();
            }
        });
        const end = (event, cancelled) => {
            const press = this.press;
            if (!press || press.pointerId !== event.pointerId) return;
            this.press = null;
            const sq = this.pointAt(event);
            if (cancelled || sq === null) return;
            if (press.scoring) {
                if (sq === press.sq) this.toggleDead(sq);
                return;
            }
            if (this.confirmMode) {
                // 仮に置いた点を、動かさずにもう一度押したら打つ
                if (!press.moved && press.hadPending === sq && sq === press.sq) this.place(sq);
                return;
            }
            if (sq === press.sq) this.place(sq);
        };
        board.addEventListener('pointerup', (event) => end(event, false));
        board.addEventListener('pointercancel', (event) => end(event, true));
    }

    place(sq) {
        const v = this.view;
        if (!this.canPlay() || sq === null) return;
        const res = tryMove(v.board, v.size, sq, v.toPlay, v.ko);
        if (!res.ok) {
            if (res.reason === 'ko') this.toast('コウなので、すぐには取り返せません');
            else if (res.reason === 'suicide') this.toast('自殺手は打てません');
            this.pending = null;
            this.renderBoard();
            return;
        }
        this.pending = null;
        this.hover = null;
        this.controller?.send({ type: 'move', sq });
    }

    toggleDead(sq) {
        const v = this.view;
        if (!v || v.phase !== 'scoring' || !v.board[sq]) return;
        this.controller?.send({ type: 'mark', sq, dead: !v.dead.includes(sq) });
    }

    undo() {
        if (!this.controller?.undo()) return;
        this.pending = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        $('#result').close();
    }

    saveSgf() {
        const game = this.controller?.game;
        if (!game) return;
        const date = new Date().toLocaleDateString('sv-SE');
        const blob = new Blob([toSgf(game, { date })], { type: 'application/x-go-sgf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = sgfFileName(game);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---- タイトル・遊び方 ----

    renderSetup() {
        const { mode, size, level, color, handicap, komi } = this.settings;
        const mark = (selector, value) => document.querySelectorAll(`${selector} button`).forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(value))));
        mark('#mode', mode);
        mark('#size', size);
        mark('#cpu-level', level);
        mark('#color', color);
        document.querySelectorAll('.cpu-only').forEach(el => el.classList.toggle('off', mode !== 'cpu'));
        $('#handicap .value').textContent = handicapText(handicap);
        $('#handicap [data-step="-1"]').disabled = handicap === 0;
        $('#handicap [data-step="1"]').disabled = handicap >= MAX_HANDICAP[size];
        $('#komi .value').textContent = komiText(komi);
        $('#komi [data-step="-1"]').disabled = komi === KOMI_OPTIONS[0];
        $('#komi [data-step="1"]').disabled = komi === KOMI_OPTIONS.at(-1);
    }

    // 9路の盤に、序盤の石をいくつか置いた絵
    renderTitleArt() {
        const size = 9;
        const ext = boardExtent(size);
        const stones = [[20, 1], [60, 2], [24, 1], [56, 2], [40, 1], [42, 2], [31, 1], [50, 2], [49, 1]];
        const art = $('#title-art');
        art.setAttribute('viewBox', `0 0 ${ext} ${ext}`);
        art.innerHTML = boardBaseSvg(size) + stones.map(([sq, c]) => stoneAt(sq, size, c)).join('')
            + `<circle cx="${pointXY(49, size)[0]}" cy="${pointXY(49, size)[1]}" r="0.2" class="last" fill="none" stroke="#e0533d" stroke-width="0.07"/>`;
    }

    renderHelp() {
        // 3×3 の小さな盤（X 黒・O 白・. 空き）
        const mini = (rows) => {
            const n = rows.length;
            const lines = [];
            for (let i = 0; i < n; i++) lines.push(`M0 ${i + 0.5}H${n}`, `M${i + 0.5} 0V${n}`);
            const stones = rows.join('').split('').map((ch, i) => (ch === '.' ? '' : `<use href="#s-${ch === 'X' ? 'black' : 'white'}" x="${(i % n) + 0.03}" y="${Math.floor(i / n) + 0.03}" width="0.94" height="0.94"/>`)).join('');
            return `<svg viewBox="0 0 ${n} ${n}" aria-hidden="true"><rect width="${n}" height="${n}" rx="0.15" fill="url(#g-wood)"/><path d="${lines.join('')}" stroke="#3a2a14" stroke-width="0.04"/>${stones}</svg>`;
        };
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>黒と白が交互に、盤の線の交わる点に石を1つずつ打ちます。石で囲んだ「地」と、取った石（アゲハマ）の多い方が勝ちです。黒が先に打ち、後から打つ白にはコミ（ふつう6目半）を足します。</p>
            <h3>取る</h3>
            <p>縦横でつながった相手の石のまわりを、すべて自分の石でふさぐと、その石を取れます。</p>
            <div class="help-figure">${mini(['.X.', 'XO.', '.X.'])}<span class="arrow">→</span>${mini(['.X.', 'X.X', '.X.'])}</div>
            <p>まわりがすべてふさがれる点には打てません（自殺手）。ただし、打つことで相手の石を取れるなら打てます。</p>
            <h3>コウ</h3>
            <p>1子を取り合う形で、取られた直後にすぐ取り返すと同じ形に戻ってしまう点には、ほかに1手打つまで打てません。打てない点には赤い四角が付きます。</p>
            <h3>終わり方</h3>
            <p>打つ手がなくなったらパスします。2人が続けてパスしたら終局です。CPU が死に石（取られるしかない石）を見込みで決めるので、違っていたら石を押して直し、確定します。続けたいときは「対局再開」。</p>
            <p>点は 地＋アゲハマ（相手の死に石を含む）。白にはコミを足します。投了（旗のボタン）もできます。</p>
            <h3>操作</h3>
            <p>点を押すと打ちます。盤が小さく表示されるとき（スマホの13路・19路）は、押すと仮に置かれ、指を動かすと位置を直せます。もう一度押すか「ここに打つ」で打ちます。</p>
            <p>上のボタン：待った（1手戻す。CPU 戦では CPU の手もいっしょに戻します）・棋譜の保存（SGF）・投了・遊び方。</p>
            <h3>置き碁</h3>
            <p>置き石を付けると、黒が先に星へ石を置き、白から打ちます。置き碁のコミはふつう半目です。</p>
            <h3>CPU の強さ</h3>
            <p>やさしい・ふつう・つよい・とてもつよい。強いほど多くの手を試して考えます（19路のとてもつよいは、スマホで数秒かかります）。</p>`;
    }

    // ---- 対局の画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        if (view.phase !== 'play' || !view.myTurn) {
            this.pending = null;
            this.hover = null;
        }
        if (this.pending !== null && view.board[this.pending] !== 0) this.pending = null;
        this.playEvents(view, prev);
        this.renderPlayers(view);
        this.renderBoard();
        this.renderActions(view);
        $('#move-number').textContent = view.moveNumber ? `${view.moveNumber}手` : '';
        $('#undo').disabled = !view.canUndo;
        $('#resign').disabled = view.over;
        if (!view.over) this.resultShown = false;
        if (view.over && !$('#result').open && !this.resultTimer && !this.resultShown) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    nameOf(seat) {
        return this.view.players[seat].name;
    }

    renderPlayers(view) {
        const named = view.players.some(p => p.isCPU);
        $('#players').innerHTML = [0, 1].map(seat => {
            const color = colorOf(seat);
            const active = !view.over && (view.phase === 'play' ? view.current === seat : !view.agreed[seat]);
            const thinking = view.phase === 'play' && active && view.players[seat].isCPU;
            const won = view.over && view.winner === seat;
            const name = named ? this.nameOf(seat) : COLOR_NAME[color];
            const sub = `アゲハマ ${view.prisoners[color]}${color === 2 ? `・コミ ${view.options.komi}` : ''}`;
            return `<div class="player ${active ? 'active' : ''} ${thinking ? 'thinking' : ''} ${won ? 'won' : ''}" data-seat="${seat}">
                ${stoneSvg(color)}<span class="who"><span class="name">${escapeHtml(name)}</span><span class="sub">${sub}</span></span></div>`;
        }).join('');
    }

    renderBoard() {
        const v = this.view;
        if (!v) return;
        const size = v.size;
        const svg = $('#board');
        const ext = boardExtent(size);
        const cellPx = svg.getBoundingClientRect().width / ext;
        this.confirmMode = cellPx > 0 && cellPx < (coarsePointer() ? CONFIRM_CELL_PX : CONFIRM_CELL_PX_MOUSE);
        if (!this.confirmMode) this.pending = null;
        const anim = this.anim;
        this.anim = null;
        const dead = new Set(v.dead);
        const parts = [this.baseCache?.size === size ? this.baseCache.svg : this.cacheBase(size)];
        // 地（死に石を決める段階と、数えて終わったあと）
        if (v.owner) {
            const s = 0.34;
            v.owner.forEach((o, sq) => {
                if (!o) return;
                const [x, y] = pointXY(sq, size);
                parts.push(`<rect class="terr-${o}" x="${(x - s / 2).toFixed(2)}" y="${(y - s / 2).toFixed(2)}" width="${s}" height="${s}" stroke-width="0.03"/>`);
            });
        }
        v.board.forEach((c, sq) => {
            if (!c) return;
            const cls = [dead.has(sq) ? 'dead' : '', anim?.sq === sq ? 'drop' : ''].join(' ').trim();
            parts.push(stoneAt(sq, size, c, cls));
        });
        if (v.owner) {
            v.dead.forEach(sq => {
                if (!v.board[sq]) return;
                const [x, y] = pointXY(sq, size);
                const d = 0.2;
                parts.push(`<path class="dead-x" d="M${x - d} ${y - d}L${x + d} ${y + d}M${x + d} ${y - d}L${x - d} ${y + d}" stroke-width="0.08"/>`);
            });
        }
        // 取られた石が消えていく
        if (anim?.captured.length) anim.captured.forEach(sq => parts.push(stoneAt(sq, size, anim.capturedColor, 'taken')));
        // 直前の手
        const last = v.lastMove?.sq ?? -1;
        if (last >= 0 && v.board[last] && !v.owner) {
            const [x, y] = pointXY(last, size);
            parts.push(`<circle class="last" cx="${x}" cy="${y}" r="0.2" stroke-width="0.07"/>`);
        }
        // コウで今は打てない点
        if (v.phase === 'play' && v.ko >= 0) {
            const [x, y] = pointXY(v.ko, size);
            parts.push(`<rect class="ko" x="${x - 0.22}" y="${y - 0.22}" width="0.44" height="0.44" stroke-width="0.07"/>`);
        }
        // 仮に置いた石と十字の線／マウスの下の薄い石
        if (this.pending !== null) {
            const [x, y] = pointXY(this.pending, size);
            const end = MARGIN + size - 1;
            parts.push(`<path class="cross" d="M${MARGIN} ${y}H${end}M${x} ${MARGIN}V${end}" stroke-width="0.06"/>`);
            parts.push(stoneAt(this.pending, size, v.toPlay, 'ghost'));
        } else if (this.hover !== null && v.board[this.hover] === 0) {
            parts.push(stoneAt(this.hover, size, v.toPlay, 'ghost hover'));
        }
        svg.setAttribute('viewBox', `0 0 ${ext} ${ext}`);
        svg.innerHTML = parts.join('');
        svg.classList.toggle('mine', this.canPlay() || v.phase === 'scoring');
        this.renderStatus();
        $('#place').hidden = !this.confirmMode || v.phase !== 'play';
        $('#place').disabled = this.pending === null || !this.canPlay();
    }

    cacheBase(size) {
        this.baseCache = { size, svg: boardBaseSvg(size) };
        return this.baseCache.svg;
    }

    renderStatus() {
        const v = this.view;
        const el = $('#status');
        if (v.phase === 'scoring' || (v.over && v.score)) {
            const s = v.score;
            const head = v.over ? escapeHtml(resultText({ result: v.result })) : '死に石の確認';
            el.innerHTML = `<span>${head}</span><span class="side">${stoneSvg(1)}<b>${s.black.total}</b></span><span class="side">${stoneSvg(2)}<b>${s.white.total}</b></span>`;
            return;
        }
        if (v.over) {
            el.textContent = resultText({ result: v.result });
            return;
        }
        if (this.pending !== null) {
            el.innerHTML = `<span class="side">${stoneSvg(v.toPlay)}<b>${sqName(this.pending, v.size)}</b></span>`;
            return;
        }
        const last = v.lastMove;
        if (!last) {
            el.textContent = v.options.handicap ? `置き石 ${v.options.handicap}子` : '';
            return;
        }
        const color = colorOf(last.seat);
        const what = last.sq < 0 ? 'パス' : sqName(last.sq, v.size);
        el.innerHTML = `<span class="side">${stoneSvg(color)}<b>${what}</b>${last.captured.length ? `<span>${last.captured.length}子取り</span>` : ''}</span>`;
    }

    renderActions(view) {
        $('#actions-play').hidden = view.phase !== 'play';
        $('#actions-scoring').hidden = view.phase !== 'scoring';
        $('#actions-end').hidden = !view.over;
        $('#pass').disabled = !this.canPlay();
        const humanSeats = view.players.filter(p => !p.isCPU).map(p => p.id);
        $('#confirm').disabled = view.phase !== 'scoring' || humanSeats.every(s => view.agreed[s]);
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        const move = fresh.filter(e => e.type === 'move').at(-1);
        if (move && !reduceMotion()) {
            this.anim = { sq: move.sq, captured: move.captured, capturedColor: 3 - colorOf(move.seat) };
        }
        const pass = fresh.filter(e => e.type === 'pass').at(-1);
        // CPU 戦では、CPU のパスだけを知らせる（自分のパスは分かっている）
        const cpuGame = view.players.some(p => p.isCPU);
        if (pass && view.phase === 'play' && (!cpuGame || view.players[pass.seat].isCPU)) this.toast(`${cpuGame ? this.nameOf(pass.seat) : COLOR_NAME[colorOf(pass.seat)]}はパス`);
        const resume = fresh.find(e => e.type === 'resume');
        if (resume) this.toast('対局再開');
    }

    // ---- ダイアログ ----

    showResult() {
        const v = this.view;
        if (!v || !v.over) return;
        this.resultShown = true;
        const r = v.result;
        const twoPlayers = v.players.every(p => !p.isCPU);
        const title = r.winner === null ? '持碁'
            : twoPlayers ? `${COLOR_NAME[colorOf(r.winner)]}の勝ち`
                : r.winner === v.you ? 'あなたの勝ち' : 'CPU の勝ち';
        $('#result-title').textContent = title;
        $('#result-sub').textContent = resultText({ result: r });
        if (r.score) {
            const { black, white } = r.score;
            const cell = (text, cls = 'v') => `<span class="${cls}">${text}</span>`;
            $('#result-score').innerHTML = [
                '<span></span>', cell('地', 'h'), cell('アゲハマ', 'h'), cell('コミ', 'h'), cell('計', 'h'),
                stoneSvg(1), cell(black.territory), cell(black.prisoners), cell('-'), cell(black.total, 'v total'),
                stoneSvg(2), cell(white.territory), cell(white.prisoners), cell(white.komi), cell(white.total, 'v total')
            ].join('');
            $('#result-score').hidden = false;
        } else {
            $('#result-score').hidden = true;
        }
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
    }
}
