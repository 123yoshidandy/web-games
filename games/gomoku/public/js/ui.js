/**
 * 画面（タイトル・対局・終わり・棋譜・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * - 盤は1枚の SVG。押した位置から一番近い交点を求める
 * - マスが小さいとき（スマホの15路）は、押すと仮に置き（線の十字で位置を示す）、もう一度押すか「ここに打つ」で打つ。
 *   指を動かすと仮の石も動く。マスが大きいとき（10路、PC）は、押した点にすぐ打つ。マウスでは、打つ前に薄い石で位置を示す
 * - 直前の手に金の輪、五連には金の線を引く
 * - 目隠し：石を描かず、直前の手の点だけを金の四角で示す（前の版の「目隠し」）。終わったら石を見せる。表示だけの設定で、オンラインでも使える
 * - 持ち時間があるときは、対局者の帯の右に残りの時間を出す。時計の数字だけを短い間隔で描き直す（残り10秒で色を変え、知らせの音を1回鳴らす）
 *   CPU 戦では、アプリが隠れている間は時計を止める。オンラインでは止めず、相手の時計が0になったらサーバーに確かめてもらう（ping）
 * - CPU 戦が終わったら、ログインしている人の記録に結果を送る（オンラインはサーバーが記録する）
 */

import { SIZES, COLOR_NAME, sqName } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';
import { resultText, PLAYERS, CLOCK_PRESETS } from './game.js';
import { createSeed } from './random.js';
import { reading, isLow, formatClock } from './clock.js';
import * as Motion from './motion/motion.js';
import { symbolsSvg, stoneSvg, boardBaseSvg, boardExtent, pointXY, stoneAt, MARGIN } from './art.js';

const SETTINGS_KEY = 'gomoku.settings';
const RESULT_DELAY_MS = 900;
const DROP_MS = 180;      // 石を打つ動き（CSS の drop と合わせる）
const CONFIRM_CELL_PX = 30;      // 交点の間がこれより狭いと、仮置きしてから打つ（指で押すとき）
const CONFIRM_CELL_PX_MOUSE = 18;
const CLOCK_TICK_MS = 100;
const FLAG_PING_MS = 1000;   // オンラインで時計が0になったあと、サーバーに時間切れを確かめてもらう間隔
const CLOCK_OPTIONS = Object.entries(CLOCK_PRESETS).map(([value, preset]) => ({ value, label: preset.label }));

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches;

function loadSettings() {
    const defaults = { mode: 'cpu', size: 15, level: 'normal', color: 1, blind: false, clock: 'none' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            mode: ['cpu', 'two'].includes(saved.mode) ? saved.mode : defaults.mode,
            size: SIZES.includes(saved.size) ? saved.size : defaults.size,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : defaults.level,
            color: [0, 1, 2].includes(saved.color) ? saved.color : defaults.color,
            blind: typeof saved.blind === 'boolean' ? saved.blind : defaults.blind,
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
        this.anim = null;          // 置いた石の演出 { sq }
        this.pending = null;       // 仮に置いた点
        this.hover = null;         // マウスの下の点
        this.press = null;         // 押している間の { sq, pointerId, hadPending, moved }
        this.confirmMode = false;
        this.cancelResult = null;
        this.resultShown = false;
        this.clockTimer = null;
        this.lowWarned = null;    // 残り10秒の音を鳴らした手番（同じ手番では1回だけ）
        this.lastFlagPing = 0;
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: '五目並べ',
            game: GAME,
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 500,
            minPlayers: PLAYERS,
            maxPlayers: PLAYERS,
            settings: [
                { key: 'size', label: '盤の大きさ', options: [{ value: '15', label: '15路' }, { value: '10', label: '10路' }] },
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

    // 新しい対局。シードは黒の席を決めるのと、記録の名前に使う。「おまかせ」はシードで先手を決める
    newGame() {
        const { mode, level, color, size } = this.settings;
        const clock = CLOCK_PRESETS[this.settings.clock]?.clock ?? null;
        const seed = createSeed();
        const players = mode === 'two'
            ? [{ name: '黒', isCPU: false }, { name: '白', isCPU: false }]
            : [{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true, cpuLevel: level }];
        const options = { size, seed, ...(clock ? { clock } : {}) };
        if (mode === 'two') options.black = 0;
        else if (color === 1) options.black = 0;
        else if (color === 2) options.black = 1;
        this.startGame({ players, options });
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
            saveSettings(this.settings);
            music.play('select');
            this.renderSetup();
        });
        pick('#mode', 'mode');
        pick('#size', 'size', Number);
        pick('#cpu-level', 'level');
        pick('#color', 'color', Number);
        pick('#blind', 'blind', (v) => v === 'on');
        pick('#clock', 'clock');
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
        $('#home').addEventListener('click', () => this.goHome());
        $('#undo').addEventListener('click', () => this.undo());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', () => {
            this.renderLog();
            $('#log-dialog').showModal();
        });
        $('#blind-toggle').addEventListener('click', () => {
            this.settings.blind = !this.settings.blind;
            saveSettings(this.settings);
            music.play('select');
            this.renderBoard();
        });
        $('#resign').addEventListener('click', () => $('#resign-confirm').showModal());
        $('#resign-yes').addEventListener('click', () => {
            $('#resign-confirm').close();
            this.controller?.send({ type: 'resign' });
        });
        $('#place').addEventListener('click', () => {
            if (this.pending !== null) this.place(this.pending);
        });
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

    // 目隠しで、石を見せないか（終わったら見せる）
    hidden() {
        return this.settings.blind && !this.view?.over;
    }

    bindBoard() {
        const board = $('#board');
        board.addEventListener('pointerdown', (event) => {
            const v = this.view;
            if (!v || event.button > 0 || !this.canPlay()) return;
            const sq = this.pointAt(event);
            this.press = { sq, pointerId: event.pointerId, hadPending: this.pending, moved: false };
            try { board.setPointerCapture(event.pointerId); } catch { /* 取れなくても動く */ }
            // 目隠しでは、石のある点にも仮置きできる（どこに石があるかは見えないので、打つときに知らせる）
            if (this.confirmMode && sq !== null && (this.hidden() || v.board[sq] === 0) && sq !== this.pending) {
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
            if (press && press.pointerId === event.pointerId) {
                if (sq !== press.sq) press.moved = true;
                if (this.confirmMode && sq !== null && (this.hidden() || v.board[sq] === 0) && sq !== this.pending) {
                    this.pending = sq;
                    this.renderBoard();
                }
                return;
            }
            if (event.pointerType === 'mouse') {
                const hover = this.canPlay() && sq !== null && (this.hidden() || v.board[sq] === 0) ? sq : null;
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
        if (v.board[sq] !== 0) {
            music.play('error');
            this.toast('そこには石があります');
            this.pending = null;
            this.renderBoard();
            return;
        }
        this.pending = null;
        this.hover = null;
        this.controller?.send({ type: 'move', sq });
    }

    undo() {
        if (!this.controller?.undo()) return;
        music.play('cancel');
        this.pending = null;
        this.cancelResult?.();
        this.cancelResult = null;
        $('#result').close();
    }

    // ---- タイトル・遊び方 ----

    renderSetup() {
        const { mode, size, level, color, blind, clock } = this.settings;
        if (!$('#clock').children.length) {
            $('#clock').innerHTML = CLOCK_OPTIONS.map(o => `<button type="button" role="radio" data-value="${o.value}">${o.label}</button>`).join('');
        }
        const mark = (selector, value) => document.querySelectorAll(`${selector} button`).forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(value))));
        mark('#mode', mode);
        mark('#size', size);
        mark('#cpu-level', level);
        mark('#color', color);
        mark('#blind', blind ? 'on' : 'off');
        mark('#clock', clock);
        document.querySelectorAll('.cpu-only').forEach(el => el.classList.toggle('off', mode !== 'cpu'));
    }

    // 9路ほどの盤の一角に、黒が斜めに4つ並べ、白が止めにかかる絵
    renderTitleArt() {
        const size = 9;
        const ext = boardExtent(size);
        const at = (r, c) => r * size + c;
        const stones = [[at(2, 2), 1], [at(3, 3), 1], [at(4, 4), 1], [at(5, 5), 1], [at(6, 6), 2], [at(3, 5), 2], [at(4, 3), 2], [at(5, 4), 1], [at(2, 6), 2]];
        const art = $('#title-art');
        const [x, y] = pointXY(at(1, 1), size);
        art.setAttribute('viewBox', `0 0 ${ext} ${ext}`);
        art.innerHTML = boardBaseSvg(size) + stones.map(([sq, c]) => stoneAt(sq, size, c)).join('')
            + `<circle cx="${x}" cy="${y}" r="0.42" fill="none" stroke="#ffd257" stroke-width="0.09" stroke-dasharray="0.18 0.12"/>`;
    }

    renderHelp() {
        // 小さな盤（X 黒・O 白・. 空き）
        const mini = (rows) => {
            const h = rows.length;
            const w = rows[0].length;
            const lines = [];
            for (let i = 0; i < h; i++) lines.push(`M0.5 ${i + 0.5}H${w - 0.5}`);
            for (let i = 0; i < w; i++) lines.push(`M${i + 0.5} 0.5V${h - 0.5}`);
            const stones = rows.join('').split('').map((ch, i) => (ch === '.' ? '' : `<use href="#s-${ch === 'X' ? 'black' : 'white'}" x="${(i % w) + 0.06}" y="${Math.floor(i / w) + 0.06}" width="0.88" height="0.88"/>`)).join('');
            return `<svg viewBox="0 0 ${w} ${h}" style="width:${w * 22}px;height:${h * 22}px" aria-hidden="true"><rect width="${w}" height="${h}" rx="0.15" fill="url(#g-wood)"/><path d="${lines.join('')}" stroke="#3a2a14" stroke-width="0.04"/>${stones}</svg>`;
        };
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>黒と白が交互に、盤の線の交わる点に石を1つずつ置きます。縦・横・斜めのどれかに、自分の石を<strong>5つ以上</strong>並べたら勝ちです。黒が先に置きます。</p>
            <div class="help-figure">${mini(['.......', '.XXXXX.', '..OOOO.'])}</div>
            <p>置いた石は動かさず、取ることもありません。6つ以上（長連）でも勝ちです。禁じ手はありません（自由ルール）。盤が埋まったら引き分け。投了（旗のボタン）もできます。</p>
            <h3>こつ</h3>
            <p>両端の空いた3つ（<strong>活三</strong>）は、次に両端の空いた4つ（止められない四）になります。相手の活三は、すぐ端を止めましょう。四と三、三と三を同時に作ると、相手は止めきれません。</p>
            <div class="help-figure">${mini(['.......', '..XXX..', '.......'])}<span class="arrow">→</span>${mini(['.......', '.XXXX..', '.......'])}</div>
            <h3>操作</h3>
            <p>点を押すと置きます。盤が小さく表示されるとき（スマホの15路）は、押すと仮に置かれ、指を動かすと位置を直せます。もう一度押すか「ここに打つ」で置きます。直前の手には金の輪が付きます。</p>
            <p>上のボタン：待った（1手戻す。CPU 戦では CPU の手もいっしょに戻します）・棋譜・目隠し・投了・ヒント（おすすめの手を黄色の輪で示す）・サウンド・遊び方。</p>
            <h3>目隠し</h3>
            <p>石を見せずに、どこに置いたかを覚えて打ちます。直前の手の点だけが金の四角で示されます。石のある点に置こうとすると知らせます。終わると石が見えます。タイトル画面と、対局中の目のボタンで切り替えられます。</p>
            <h3>持ち時間</h3>
            <p>タイトル画面（オンラインはロビー）で選べます。<strong>3分・5分・10分</strong>は切れ負けで、使い切ると負けです。<strong>3分+2秒・5分+5秒</strong>は、1手置くたびに2秒・5秒が足されます。</p>
            <p>時計は手番の人の分が減ります。残り10秒で時計が赤くなり、音で知らせます。CPU 戦では、アプリを閉じている間は時計が止まります（オンラインでは止まりません）。</p>
            <h3>CPU の強さ</h3>
            <p>やさしい：ときどき相手の四を見落とします。ふつう：四の連続で勝てる筋と、3手先まで読みます。つよい：長い四の連続と6手先まで読み、相手の勝ち筋を残しません。「おまかせ」では、先手（黒）をくじで決めます。</p>`;
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
        if (this.pending !== null && view.board[this.pending] !== 0 && !this.hidden()) this.pending = null;
        this.playEvents(view, prev);
        this.renderPlayers(view);
        this.renderBoard();
        this.renderActions(view);
        const online = Boolean(this.controller?.isOnline);
        // 待った・ヒントはローカル対戦だけ（オンラインのコントローラーはゲームの中身を持たない）
        ['#undo', '#hint'].forEach(sel => { $(sel).hidden = online; });
        $('#undo').disabled = !view.canUndo;
        $('#resign').disabled = view.over;
        if ($('#log-dialog').open) this.renderLog();
        if (!view.over) this.resultShown = false;
        if (view.over && prev && !prev.over) this.recordLocalResult(view);
        if (view.over && !$('#result').open && !this.cancelResult && !this.resultShown) {
            this.cancelResult = Motion.afterIdle(() => {
                this.cancelResult = null;
                this.showResult();
            }, Motion.ms(RESULT_DELAY_MS));
        }
    }

    // CPU 戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対局を2回数えない。待ったで戻して打ち直しても1回）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view.result) return;
        const humans = view.players.filter(p => !p.isCPU);
        if (humans.length !== 1) return;
        const winners = view.winner === null ? [0, 1] : [view.winner];
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners(winners, view.you, PLAYERS) });
    }

    nameOf(seat) {
        return this.view.players[seat].name;
    }

    renderPlayers(view) {
        const named = view.players.some(p => p.isCPU);
        $('#players').classList.toggle('timed', Boolean(view.clock));
        // 黒を左に出す
        const seats = view.colors[0] === 1 ? [0, 1] : [1, 0];
        $('#players').innerHTML = seats.map(seat => {
            const color = view.colors[seat];
            const active = !view.over && view.current === seat;
            const thinking = active && view.players[seat].isCPU;
            const won = view.over && view.winner === seat;
            const name = named ? this.nameOf(seat) : COLOR_NAME[color];
            const sub = color === 1 ? '先手' : '後手';
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
        const blind = this.hidden();
        $('#blind-toggle').setAttribute('aria-pressed', String(this.settings.blind));
        const parts = [this.baseCache?.size === size ? this.baseCache.svg : this.cacheBase(size)];
        const last = v.lastMove?.sq ?? -1;
        if (!blind) {
            v.board.forEach((c, sq) => {
                if (c) parts.push(stoneAt(sq, size, c, anim?.sq === sq ? 'drop' : ''));
            });
            if (last >= 0 && !v.result?.line) {
                const [x, y] = pointXY(last, size);
                parts.push(`<circle class="last" cx="${x}" cy="${y}" r="0.2" stroke-width="0.07"/>`);
            }
        } else if (last >= 0) {
            // 目隠し：直前の手の点だけ
            const [x, y] = pointXY(last, size);
            parts.push(`<rect class="blind-last" x="${x - 0.36}" y="${y - 0.36}" width="0.72" height="0.72" rx="0.1" stroke-width="0.05"/>`);
        }
        // 五連
        const line = v.result?.line;
        if (line?.length) {
            const [x1, y1] = pointXY(line[0], size);
            const [x2, y2] = pointXY(line.at(-1), size);
            line.forEach(sq => {
                const [x, y] = pointXY(sq, size);
                parts.push(`<circle class="win-stone" cx="${x}" cy="${y}" r="0.44" stroke-width="0.07"/>`);
            });
            parts.push(`<line class="win-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="0.14"/>`);
        }
        // 仮に置いた石と十字の線／マウスの下の薄い石
        if (this.pending !== null) {
            const [x, y] = pointXY(this.pending, size);
            const end = MARGIN + size - 1;
            parts.push(`<path class="cross" d="M${MARGIN} ${y}H${end}M${x} ${MARGIN}V${end}" stroke-width="0.06"/>`);
            parts.push(stoneAt(this.pending, size, v.toPlay, 'ghost'));
        } else if (this.hover !== null && (blind || v.board[this.hover] === 0)) {
            parts.push(stoneAt(this.hover, size, v.toPlay, 'ghost hover'));
        }
        const hint = this.currentHint();
        if (hint?.type === 'move') {
            const [x, y] = pointXY(hint.sq, size);
            parts.push(`<circle class="recommended" cx="${x}" cy="${y}" r="0.44" stroke-width="0.1"/>`);
        }
        svg.setAttribute('viewBox', `0 0 ${ext} ${ext}`);
        svg.innerHTML = parts.join('');
        svg.classList.toggle('mine', this.canPlay());
        this.renderStatus();
        $('#place').hidden = !this.confirmMode || v.over;
        $('#place').disabled = this.pending === null || !this.canPlay();
    }

    cacheBase(size) {
        this.baseCache = { size, svg: boardBaseSvg(size) };
        return this.baseCache.svg;
    }

    renderStatus() {
        const v = this.view;
        const el = $('#status');
        if (v.over) {
            el.textContent = `${resultText({ result: v.result })}・${v.moveNumber}手`;
            return;
        }
        if (this.pending !== null) {
            el.innerHTML = `<span class="side">${stoneSvg(v.toPlay)}<b>${sqName(this.pending, v.size)}</b></span>`;
            return;
        }
        const last = v.lastMove;
        if (!last) {
            el.textContent = v.myTurn ? '黒から置きます' : '';
            return;
        }
        el.innerHTML = `<span>${v.moveNumber}手</span><span class="side">${stoneSvg(v.colors[last.seat])}<b>${sqName(last.sq, v.size)}</b></span>${this.hidden() ? '<span>目隠し</span>' : ''}`;
    }

    renderActions(view) {
        $('#actions-play').hidden = view.over;
        $('#actions-end').hidden = !view.over;
        $('#hint').disabled = !this.canPlay();
    }

    // 棋譜：置いた順に、色と座標
    renderLog() {
        const v = this.view;
        if (!v) return;
        const blackSeat = v.colors[0] === 1 ? 0 : 1;
        const firstColor = v.colors[blackSeat];
        const items = v.history.map((sq, i) => {
            const color = i % 2 === 0 ? firstColor : 3 - firstColor;
            return `<li><span class="n">${i + 1}</span>${stoneSvg(color)}${sqName(sq, v.size)}</li>`;
        });
        $('#log').innerHTML = items.join('') || '';
        const dialog = $('#log-dialog');
        dialog.querySelector('.log-empty')?.remove();
        dialog.querySelector('.log-result')?.remove();
        if (!items.length) $('#log').insertAdjacentHTML('afterend', '<p class="log-empty">まだ置いていません</p>');
        if (v.over) $('#log').insertAdjacentHTML('afterend', `<p class="log-result">${escapeHtml(resultText({ result: v.result }))}</p>`);
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        this.playSound(view, prev, fresh);
        const move = fresh.filter(e => e.type === 'move').at(-1);
        if (move && Motion.enabled()) this.anim = { sq: move.sq };
            Motion.hold(DROP_MS);
    }

    // 1つの更新に1つの音。人の手は置く、CPU・相手の手のあとに自分の番になったら turn
    playSound(view, prev, fresh) {
        if (view.over && !prev.over) {
            const winner = view.result?.winner;
            const cpuGame = view.players.some(p => p.isCPU);
            if (winner === null || winner === undefined) return music.play('notify');
            return music.play((!cpuGame && !this.controller?.isOnline) || winner === view.you ? 'win' : 'lose');
        }
        const last = fresh.filter(e => e.type === 'move').at(-1);
        if (!last) return;
        const mine = view.twoPlayers || last.seat === view.you;
        if (mine) return music.play('place');
        music.play(view.myTurn ? 'turn' : 'notify');
    }

    // ---- ヒント ----

    showHint() {
        if (!this.canPlay() || this.controller?.isOnline) return;
        const command = suggest(this.controller.game, this.view.you);
        if (!command) return;
        music.play('select');
        this.hint = { at: this.controller.game.commands.length, command };
        if (command.type === 'move' && this.confirmMode) this.pending = command.sq;
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
        const twoPlayers = v.players.every(p => !p.isCPU) && !this.controller?.isOnline;
        const title = r.winner === null ? '引き分け'
            : twoPlayers ? `${COLOR_NAME[r.color]}の勝ち`
                : r.winner === v.you ? 'あなたの勝ち' : `${this.nameOf(r.winner)}の勝ち`;
        $('#result-title').textContent = title;
        $('#result-sub').textContent = `${resultText({ result: r })}・${v.moveNumber}手`;
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
