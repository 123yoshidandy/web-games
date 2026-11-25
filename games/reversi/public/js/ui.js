/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * - 手番の人の置けるマスが光る。光るマスを押すと置く
 * - 置いた石は上から落ち、返る石は置いた石に近い順に裏返る。CPU の手も同じ動きで見せる
 * - パスは自動。誰がパスしたかを短く知らせる
 */

import { SIZE, colorOf, sqName } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, stoneSvg, COLOR_NAME } from './art.js';

const SETTINGS_KEY = 'reversi.settings';
const RESULT_DELAY_MS = 1100;
const FLIP_STEP_MS = 70;
const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', strong: 'つよい', expert: 'とてもつよい' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    const defaults = { mode: 'cpu', level: 'normal', color: 1 };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            mode: ['cpu', 'two'].includes(saved.mode) ? saved.mode : defaults.mode,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : defaults.level,
            color: [1, 2].includes(saved.color) ? saved.color : defaults.color
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
        this.anim = null;       // 置いた石と返る石の演出 { sq, flips, color }
        this.resultTimer = null;
        this.resultShown = false;
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
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.anim = null;
        this.resultShown = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { mode, level, color } = this.settings;
        const players = mode === 'two'
            ? [{ name: '黒', isCPU: false }, { name: '白', isCPU: false }]
            : [{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true, cpuLevel: level }];
        if (mode === 'cpu' && color === 2) players.reverse();
        this.startGame({ players, options: {} });
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
            saveSettings(this.settings);
            this.renderSetup();
        });
        pick('#mode', 'mode');
        pick('#cpu-level', 'level');
        pick('#color', 'color', Number);
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#undo').addEventListener('click', () => this.undo());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#board').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-sq]');
            if (cell) this.onCell(Number(cell.dataset.sq));
        });
    }

    // ---- 操作 ----

    myTurn() {
        const v = this.view;
        return !!v && !v.over && v.myTurn;
    }

    onCell(sq) {
        if (!this.myTurn() || !this.view.moves.includes(sq)) return;
        this.controller?.send({ type: 'move', sq });
    }

    undo() {
        if (!this.controller?.undo()) return;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        $('#result').close();
    }

    // ---- タイトル・遊び方 ----

    renderSetup() {
        const { mode, level, color } = this.settings;
        const mark = (selector, value) => document.querySelectorAll(`${selector} button`).forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(value))));
        mark('#mode', mode);
        mark('#cpu-level', level);
        mark('#color', color);
        document.querySelectorAll('.cpu-only').forEach(el => el.classList.toggle('off', mode !== 'cpu'));
    }

    // 盤の真ん中（c3〜f6）を切り取った絵。最初の配置に、黒の置けるマスを光らせる
    renderTitleArt() {
        const board = [0, 0, 0, 0, 0, 2, 1, 0, 0, 1, 2, 0, 0, 0, 0, 0];
        const hints = [1, 4, 11, 14];
        $('#title-art').innerHTML = board.map((s, i) => `<span class="cell">${s ? `<span class="disc">${stoneSvg(s)}</span>` : ''}${hints.includes(i) ? '<span class="hint c1"></span>' : ''}</span>`).join('');
    }

    renderHelp() {
        const row = (stones) => `<span class="help-row">${stones.map(s => `<span class="help-cell">${s ? stoneSvg(s) : ''}</span>`).join('')}</span>`;
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>8×8 の盤に黒と白の石を交互に置き、最後に石の多い方が勝ちです。黒が先手です。</p>
            <h3>置き方</h3>
            <p>相手の石を、縦・横・斜めのどれかで自分の石ではさめるマスにだけ置けます。はさんだ石はすべて自分の色に返ります。</p>
            <div class="help-figure">${row([1, 2, 2, 0])}<span class="arrow">→</span>${row([1, 1, 1, 1])}</div>
            <p>返るのは、置いた石と元からある自分の石ではさんだ石だけです。返った石が、さらに別の石をはさんでも返りません。</p>
            <h3>パスと終わり</h3>
            <p>置けるマスがあれば必ず置きます。置けるマスがないときだけパスになり、相手がもう一度置きます。両者とも置けなくなったら終わりです。</p>
            <h3>操作</h3>
            <p>置けるマスが光ります。押すと置きます。右上の矢印で1手戻せます（待った。CPU 戦では、あなたの手とそのあとの CPU の手を戻します）。</p>
            <h3>CPU の強さ</h3>
            <p>やさしい・ふつう・つよい・とてもつよい の4つ。強いほど先の手まで読み、終盤は最後まで読み切ります。</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        this.playEvents(view, prev);
        this.renderPlayers(view);
        this.renderBoard(view);
        $('#undo').disabled = !view.canUndo;
        if (!view.over) this.resultShown = false;
        if (view.over && !$('#result').open && !this.resultTimer && !this.resultShown) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    // 席の呼び名（CPU 戦は「あなた」「CPU」、2人で遊ぶときは「黒」「白」）
    nameOf(seat) {
        return this.view.players[seat].name;
    }

    renderPlayers(view) {
        const counts = [view.counts.black, view.counts.white];
        // 名前は CPU 戦（あなた／CPU）のときだけ出す。2人で遊ぶときは石の色で分かる
        const named = view.players.some(p => p.isCPU);
        $('#players').innerHTML = [0, 1].map(seat => {
            const active = !view.over && view.current === seat;
            const thinking = active && view.players[seat].isCPU;
            const won = view.over && view.winner === seat;
            const name = named ? `<span class="name">${escapeHtml(this.nameOf(seat))}</span>` : '';
            return `<div class="player ${active ? 'active' : ''} ${thinking ? 'thinking' : ''} ${won ? 'won' : ''}" data-seat="${seat}">
                ${stoneSvg(colorOf(seat))}<span class="count">${counts[seat]}</span>${name}</div>`;
        }).join('');
    }

    renderBoard(view) {
        const hints = new Set(this.myTurn() ? view.moves : []);
        const hintColor = colorOf(view.current);
        const anim = this.anim;
        const last = view.lastMove?.sq ?? null;
        const cells = [];
        for (let sq = 0; sq < SIZE * SIZE; sq++) {
            const s = view.board[sq];
            let disc = '';
            if (s) {
                let cls = '';
                let style = '';
                let old = '';
                if (anim?.sq === sq) cls = 'drop';
                else if (anim?.flips.has(sq)) {
                    cls = 'flip';
                    style = `style="--delay:${anim.flips.get(sq) * FLIP_STEP_MS + 120}ms"`;
                    old = stoneSvg(3 - s, 'old');
                }
                disc = `<span class="disc ${cls}" ${style}>${stoneSvg(s, 'new')}${old}${last === sq ? '<span class="last"></span>' : ''}</span>`;
            }
            const hint = hints.has(sq) ? `<span class="hint c${hintColor}"></span>` : '';
            cells.push(`<button class="cell" data-sq="${sq}" aria-label="${sqName(sq)}${s ? `（${COLOR_NAME[s]}）` : ''}">${disc}${hint}</button>`);
        }
        const dots = [[25, 25], [75, 25], [25, 75], [75, 75]].map(([x, y]) => `<span style="left:${x}%;top:${y}%"></span>`).join('');
        $('#board').innerHTML = `${cells.join('')}<span class="dots" aria-hidden="true">${dots}</span>`;
        $('#board').classList.toggle('mine', hints.size > 0);
        this.anim = null;
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        const move = [...fresh].reverse().find(e => e.type === 'move');
        if (move && !reduceMotion()) {
            // 置いた石からの距離（縦横斜めの歩数）の順に裏返す
            const r0 = Math.floor(move.sq / SIZE);
            const c0 = move.sq % SIZE;
            const flips = new Map(move.flips.map(f => [f, Math.max(Math.abs(Math.floor(f / SIZE) - r0), Math.abs(f % SIZE - c0)) - 1]));
            this.anim = { sq: move.sq, flips };
        }
        const pass = fresh.filter(e => e.type === 'pass').at(-1);
        if (pass && !view.over) this.toast(`${this.nameOf(pass.seat)}はパス`);
    }

    // ---- ダイアログ ----

    showResult() {
        const v = this.view;
        if (!v || !v.over) return;
        this.resultShown = true;
        const twoPlayers = v.players.every(p => !p.isCPU);
        const title = v.winner === null ? '引き分け'
            : twoPlayers ? `${COLOR_NAME[colorOf(v.winner)]}の勝ち`
                : v.winner === v.you ? 'あなたの勝ち' : 'CPU の勝ち';
        $('#result-title').textContent = title;
        const { black, white, empty } = v.counts;
        $('#result-text').innerHTML = `<span class="score">${stoneSvg(1)}${black}</span><span class="score">${stoneSvg(2)}${white}</span>${empty ? `<small>空き ${empty}</small>` : ''}`;
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
