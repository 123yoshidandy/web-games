/**
 * 画面（タイトル・対局・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * - 盤は1枚の SVG。押した位置から一番近い交点を求める
 * - マスが小さいとき（スマホの13路・19路）は、押すと仮に置き（線の十字で位置を示す）、もう一度押すか「ここに打つ」で打つ。
 *   指を動かすと仮の石も動く。マスが大きいとき（9路、PC）は、押した点にすぐ打つ。マウスでは、打つ前に薄い石で位置を示す
 * - 打てない点（コウ・自殺手）を押したら、わけを短く知らせる。コウで取り返せない点には、四角の印を付ける
 * - 終局のあとは、死に石を押して直す。地を小さな四角で示し、点を下に出す
 * - 持ち時間があるときは、対局者の帯の右に残りの時間を出す。時計の数字だけを短い間隔で描き直す（残り10秒で色を変え、知らせの音を1回鳴らす）
 *   秒読みに入ったら、今の秒読みの残りと、残りの回数（「0:28×3」）を出す
 *   CPU 戦では、アプリが隠れている間は時計を止める。オンラインでは止めず、相手の時計が0になったらサーバーに確かめてもらう（ping）
 */

import { SIZES, MAX_HANDICAP, COLOR_NAME, colorOf, sqName, tryMove } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, LEVEL_NAMES, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { resultText, marginText, PLAYERS, CLOCK_PRESETS } from './game.js';
import { reading, isLow, formatClock } from './clock.js';
import { toSgf, sgfFileName } from './sgf.js';
import * as Motion from './motion/motion.js';
import { symbolsSvg, stoneSvg, boardBaseSvg, boardExtent, pointXY, stoneAt, MARGIN } from './art.js';

const SETTINGS_KEY = 'go.settings';
const RESULT_DELAY_MS = 700;
const DROP_MS = 180;      // 石を打つ動き（CSS の drop と合わせる）
const TAKEN_MS = 400;     // 取った石が消える動き（CSS の taken と合わせる）
const KOMI_OPTIONS = [0, 0.5, 5.5, 6.5, 7.5];
const CONFIRM_CELL_PX = 30;      // 交点の間がこれより狭いと、仮置きしてから打つ（指で押すとき）
const CONFIRM_CELL_PX_MOUSE = 18;
const CLOCK_TICK_MS = 100;
const FLAG_PING_MS = 1000;   // オンラインで時計が0になったあと、サーバーに時間切れを確かめてもらう間隔
const CLOCK_OPTIONS = Object.entries(CLOCK_PRESETS).map(([value, preset]) => ({ value, label: preset.label }));

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches;

const komiText = (komi) => (komi === 0 ? 'なし' : marginText(komi));
const handicapText = (n) => (n === 0 ? 'なし' : `${n}子`);

function loadSettings() {
    const defaults = { mode: 'cpu', size: 9, level: 'normal', color: 1, handicap: 0, komi: 6.5, clock: 'none' };
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
            komi: KOMI_OPTIONS.includes(saved.komi) ? saved.komi : defaults.komi,
            clock: Object.hasOwn(CLOCK_PRESETS, saved.clock) ? saved.clock : defaults.clock
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
        this.cancelResult = null;
        this.resultShown = false;
        this.clockTimer = null;
        this.lowWarned = null;    // 残り10秒の音を鳴らした手番（同じ手番では1回だけ）
        this.lastFlagPing = 0;
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: '囲碁',
            game: 'go',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 500,
            minPlayers: PLAYERS,
            maxPlayers: PLAYERS,
            settings: [
                { key: 'size', label: '盤の大きさ', options: [{ value: '9', label: '9路' }, { value: '13', label: '13路' }, { value: '19', label: '19路' }] },
                { key: 'clock', label: '持ち時間', options: CLOCK_OPTIONS }
            ],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                this.controller = null;
                this.showTitle();
            }
        });
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.bindBoard();
        this.renderTitleArt();
        this.renderHelp();
        new ResizeObserver(() => { if (this.view) this.renderBoard(); }).observe($('#board'));
        // アプリが隠れている間は、CPU 戦の時計を止める（オンラインのコントローラーの pause・resume は何もしない）
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.controller?.pause?.();
            else this.controller?.resume?.();
        });
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
        this.renderSetup();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
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
        this.beginGame(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.stopGame();
        else document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        this.hint = null;
        this.view = null;
        this.anim = null;
        this.pending = null;
        this.hover = null;
        this.resultShown = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
        if (document.hidden) this.controller.pause?.();
        clearInterval(this.clockTimer);
        this.clockTimer = setInterval(() => this.updateClocks(), CLOCK_TICK_MS);
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const { mode, level, color, size, handicap, komi } = this.settings;
        const clock = CLOCK_PRESETS[this.settings.clock]?.clock ?? null;
        const players = mode === 'two'
            ? [{ name: '黒', isCPU: false }, { name: '白', isCPU: false }]
            : [{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true, cpuLevel: level }];
        if (mode === 'cpu' && color === 2) players.reverse();
        this.startGame({ players, options: clock ? { size, handicap, komi, clock } : { size, handicap, komi } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearInterval(this.clockTimer);
        this.clockTimer = null;
        this.cancelResult?.();
        this.cancelResult = null;
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
        pick('#clock', 'clock');
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
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#again-end').addEventListener('click', () => (this.controller?.isOnline ? this.online.rematch() : this.newGame()));
        $('#show-result').addEventListener('click', () => this.showResult());
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#result-sgf').addEventListener('click', () => this.saveSgf());
        $('#home').addEventListener('click', () => this.goHome());
        $('#undo').addEventListener('click', () => this.undo());
        $('#hint').addEventListener('click', () => this.showHint());
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
                music.play('select');
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
            music.play('error');
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
        music.play('cancel');
        this.pending = null;
        this.cancelResult?.();
        this.cancelResult = null;
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
        const { mode, size, level, color, handicap, komi, clock } = this.settings;
        if (!$('#clock').children.length) {
            $('#clock').innerHTML = CLOCK_OPTIONS.map(o => `<button type="button" role="radio" data-value="${o.value}">${o.label}</button>`).join('');
        }
        const mark = (selector, value) => document.querySelectorAll(`${selector} button`).forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(value))));
        mark('#mode', mode);
        mark('#size', size);
        mark('#cpu-level', level);
        mark('#color', color);
        mark('#clock', clock);
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
            <h3>持ち時間</h3>
            <p>タイトル画面（オンラインはロビー）で選べます。<strong>切れ負け</strong>（3分・5分・10分）は、持ち時間を使い切ると負けです。<strong>5分+30秒×3</strong>・<strong>10分+30秒×3</strong>は秒読みつきで、持ち時間を使い切ったあとは1手30秒以内に打ちます。30秒を超えると秒読みが1回減り、3回とも使い切ると負けです（「0:28×3」は、今の秒読みの残りと残りの回数）。</p>
            <p>時計は、手番の人の分が減ります。死に石を決めている間は止まります。残り10秒で時計が赤くなり、音で知らせます。CPU 戦では、アプリを閉じている間は時計が止まります（オンラインでは止まりません）。</p>
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
        if (prev && !prev.over && view.over) this.recordLocalResult(view);
        this.renderPlayers(view);
        this.renderBoard();
        this.renderActions(view);
        $('#move-number').textContent = view.moveNumber ? `${view.moveNumber}手` : '';
        const online = Boolean(this.controller?.isOnline);
        // 待った・棋譜の保存・ヒントはローカル対戦だけ（オンラインのコントローラーはゲームの中身を持たない）
        ['#undo', '#sgf', '#hint', '#result-sgf'].forEach(sel => { $(sel).hidden = online; });
        $('#undo').disabled = !view.canUndo;
        $('#resign').disabled = view.over;
        if (!view.over) this.resultShown = false;
        if (view.over && !$('#result').open && !this.cancelResult && !this.resultShown) {
            this.cancelResult = Motion.afterIdle(() => {
                this.cancelResult = null;
                this.showResult();
            }, Motion.ms(RESULT_DELAY_MS));
        }
    }

    // CPU 戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id は対局を始めた時刻（保存に持たせる。続きからでも同じ）から作る。持碁は引き分け
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view.result) return;
        if (view.players.filter(p => !p.isCPU).length !== 1) return;
        const winner = view.result.winner;
        const winners = winner === null || winner === undefined ? [0, 1] : [winner];
        recordResult({ game: GAME, id: `${GAME}-${controller.matchId}`, outcome: outcomeFromWinners(winners, view.you, view.players.length) });
    }

    nameOf(seat) {
        return this.view.players[seat].name;
    }

    renderPlayers(view) {
        const named = view.players.some(p => p.isCPU);
        $('#players').classList.toggle('timed', Boolean(view.clock));
        $('#players').innerHTML =[0, 1].map(seat => {
            const color = colorOf(seat);
            const active = !view.over && (view.phase === 'play' ? view.current === seat : !view.agreed[seat]);
            const thinking = view.phase === 'play' && active && view.players[seat].isCPU;
            const won = view.over && view.winner === seat;
            const name = named ? this.nameOf(seat) : COLOR_NAME[color];
            // 時計を出すときは帯が狭いので、コミは省く（タイトル画面と結果に出る）
            const sub = `アゲハマ ${view.prisoners[color]}${color === 2 && !view.clock ? `・コミ ${view.options.komi}` : ''}`;
            const clock = view.clock ? `<span class="clock" data-clock-seat="${seat}"></span>` : '';
            return `<div class="player ${active ? 'active' : ''} ${thinking ? 'thinking' : ''} ${won ? 'won' : ''}" data-seat="${seat}">
                ${stoneSvg(color)}<span class="who"><span class="name">${escapeHtml(name)}</span><span class="sub">${sub}</span></span>${clock}</div>`;
        }).join('');
        this.updateClocks();
    }

    // ---- 持ち時間 ----

    // 時計の今の時刻（オンラインはサーバーの時刻に合わせる）
    clockNow() {
        const c = this.controller;
        if (!c) return Date.now();
        return c.isOnline ? c.net.serverNow() : c.clockNow();
    }

    // 時計の数字だけを描き直す。手番の時計は、手番が始まった時刻からの経過を引いて出す
    updateClocks() {
        const v = this.view;
        if (!v?.clock || !this.controller) return;
        const { config, sides, running, startedAt } = v.clock;
        const elapsed = running !== null && startedAt !== null ? Math.max(0, this.clockNow() - startedAt) : 0;
        let runningRead = null;
        document.querySelectorAll('[data-clock-seat]').forEach(el => {
            const seat = Number(el.dataset.clockSeat);
            const read = reading(config, sides[seat], seat === running ? elapsed : 0);
            if (seat === running) runningRead = read;
            // 秒読みに入ったら、今の秒読みの残りと残りの回数（時間切れのあとは回数を出さない）
            const text = read.byoyomi && read.periods > 0 ? `${formatClock(read.shown)}×${read.periods}` : formatClock(read.shown);
            if (el.textContent !== text) el.textContent = text;
            el.classList.toggle('running', seat === running && !v.over);
            el.classList.toggle('low', !v.over && isLow(read) && (seat === running || read.total === 0));
            el.classList.toggle('paused', seat === running && Boolean(v.clockPaused));
        });
        if (running === null || v.over || !runningRead) return;
        // 自分の時計（2人で遊ぶときは手番の人の時計）が残り10秒になったら、手番ごとに1回知らせる
        const mine = v.twoPlayers || running === v.you;
        const key = `${v.moveNumber}:${running}:${startedAt}`;
        if (mine && isLow(runningRead) && runningRead.total > 0 && this.lowWarned !== key) {
            this.lowWarned = key;
            music.play('notify');
        }
        // オンラインで時計が0になったら、サーバーに時間切れを確かめてもらう（相手が操作しないときも終わるように）
        if (this.controller.isOnline && runningRead.total === 0 && Date.now() - this.lastFlagPing >= FLAG_PING_MS) {
            this.lastFlagPing = Date.now();
            this.controller.net.ping();
        }
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
        const hint = this.currentHint();
        if (hint?.type === 'move') {
            const [x, y] = pointXY(hint.sq, size);
            parts.push(`<circle class="recommended" cx="${x}" cy="${y}" r="0.44" stroke-width="0.1"/>`);
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
        $('#pass').classList.toggle('recommended', this.currentHint()?.type === 'pass');
        $('#hint').disabled = !this.canPlay();
        const humanSeats = view.players.filter(p => !p.isCPU).map(p => p.id);
        $('#confirm').disabled = view.phase !== 'scoring' || humanSeats.every(s => view.agreed[s]);
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        this.playSound(view, prev, fresh);
        const move = fresh.filter(e => e.type === 'move').at(-1);
        if (move && Motion.enabled()) {
            this.anim = { sq: move.sq, captured: move.captured, capturedColor: 3 - colorOf(move.seat) };
            Motion.hold(move.captured.length ? TAKEN_MS : DROP_MS);
        }
        const pass = fresh.filter(e => e.type === 'pass').at(-1);
        // CPU 戦では、CPU のパスだけを知らせる（自分のパスは分かっている）
        const cpuGame = view.players.some(p => p.isCPU);
        if (pass && view.phase === 'play' && (!cpuGame || view.players[pass.seat].isCPU)) this.toast(`${cpuGame ? this.nameOf(pass.seat) : COLOR_NAME[colorOf(pass.seat)]}はパス`);
        const resume = fresh.find(e => e.type === 'resume');
        if (resume) this.toast('対局再開');
    }

    // 1つの更新に1つの音。人の手は置く・取る、CPU の手のあとに自分の番になったら turn
    playSound(view, prev, fresh) {
        if (view.over && !prev.over) {
            const winner = view.result?.winner;
            const cpuGame = view.players.some(p => p.isCPU);
            if (winner === null || winner === undefined) return music.play('notify');
            return music.play(!cpuGame || winner === view.you ? 'win' : 'lose');
        }
        const last = fresh.filter(e => e.type === 'move' || e.type === 'pass').at(-1);
        if (last && view.players[last.seat]?.isCPU) return music.play(view.myTurn ? 'turn' : 'notify');
        if (last?.type === 'move') return music.play(last.captured?.length ? 'capture' : 'place');
        if (last) return music.play('notify');
        music.play('select');
    }

    // ---- ヒント ----

    showHint() {
        if (!this.canPlay() || this.controller?.isOnline) return;
        const command = suggest(this.controller.game, this.view.you);
        if (!command) return;
        music.play('select');
        this.hint = { at: this.controller.game.commands.length, command };
        if (command.type === 'move' && this.confirmMode) this.pending = command.sq;
        if (command.type === 'pass') this.toast('おすすめ：パス');
        this.renderBoard();
        this.renderActions(this.view);
    }

    // 今のおすすめの手（盤面が進んだら消す）
    currentHint() {
        if (this.hint && (this.controller?.isOnline || this.hint.at !== this.controller?.game.commands.length || !this.canPlay())) this.hint = null;
        return this.hint?.command ?? null;
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
