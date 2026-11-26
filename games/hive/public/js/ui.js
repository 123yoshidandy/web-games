/**
 * 画面（タイトル・ゲーム・結果・記録・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 上から：相手の手持ち → 盤 → 自分の手持ち → 操作の欄
 * - 盤は SVG。指でずらし、2本指・ホイール・＋−で拡大する（ページは拡大させず、盤だけ）。駒や置ける場所がはみ出したら全体に合わせる
 * - 手持ちの駒か、盤の自分の駒を押すと、置ける場所・動かせる先が点線の六角形で出る。押すとそこに置く・動かす
 *   ダンゴムシの力で動かす先は、別の色で出す。相手の駒も、自分のダンゴムシの隣なら選べる
 * - 積み重なった駒は、下の駒を少しずらして見せ、高さの数を添える。押すと、下から順に操作の欄に出す
 */

import { KIND_NAMES, COLOR_NAMES, PLAYERS } from './game.js';
import { KINDS } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { symbolsSvg, pieceShape, pieceSvg, cellCenter, hexPoints, HEX_R } from './art.js';

const SETTINGS_KEY = 'hive.settings';
const CPU_NAME = 'CPU';
const TAP_SLOP = 8;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.4;
const FIT_MAX_SCALE = 1.5;
const ZOOM_BAR = 40;         // 盤の右の、拡大・縮小のボタンの幅
const LAYER_OFFSET = { x: 3, y: 4.5 }; // 積み重なった駒の、1段下の駒のずらし方
const MOVE_MS = 380;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    const fallback = { level: 'normal', expansions: [], tournament: true };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            level: ['easy', 'normal'].includes(saved.level) ? saved.level : fallback.level,
            expansions: Array.isArray(saved.expansions) ? saved.expansions.filter(k => ['L', 'M', 'P'].includes(k)) : [],
            tournament: saved.tournament !== false
        };
    } catch {
        return fallback;
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
        this.camera = { scale: 1, tx: 0, ty: 0 };
        this.sel = null;      // { kind: 'hand', piece } / { kind: 'board', cell }
        this.inspect = null;  // 中を見ている積み重なりのマス
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ハイブ',
            game: 'hive',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 700,
            minPlayers: PLAYERS,
            maxPlayers: PLAYERS,
            settings: [],
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
        $('#title-art').innerHTML = ['G', 'Q', 'A', 'B', 'S'].map((k, i) => pieceSvg(k, i % 2, `t${i}`)).join('');
        $('#help-pieces').innerHTML = [
            ['Q', '女王蜂', '1マス滑る。1つだけ'],
            ['B', 'カブトムシ', '1マス動く。駒の上に乗れる。乗られた駒は動けず、そのマスはカブトムシの色になる'],
            ['G', 'バッタ', '一直線に、1つ以上の駒を跳び越して、最初の空きマスへ'],
            ['S', 'クモ', 'ちょうど3マス滑る（戻らない）'],
            ['A', 'アリ', '巣のまわりを、何マスでも滑る'],
            ['L', 'テントウムシ（拡張）', '2マス巣の上を進み、3マス目で降りる'],
            ['M', '蚊（拡張）', '接している駒の動きをまねる。巣の上ではカブトムシ'],
            ['P', 'ダンゴムシ（拡張）', '1マス滑るか、隣の駒（積み重なっていない）を自分の上を通して、自分の隣の空きマスへ動かす。直前に動いた駒は動かせず、動かされた駒は次の手番に動けない']
        ].map(([k, name, text]) => `<div class="help-piece">${pieceSvg(k, 0)}<p><strong>${name}</strong>：${text}</p></div>`).join('');
        window.addEventListener('resize', () => { if (this.view) this.fitBoard(); });
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
        this.renderSettings();
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
            // 保存が壊れていたら消して、タイトルに戻る
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
        this.sel = null;
        this.inspect = null;
        this.view = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.fitBoard();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const level = this.settings.level;
        const players = [{ name: 'あなた', isCPU: false }, { name: CPU_NAME, isCPU: true }];
        this.startGame({ players, options: { expansions: this.settings.expansions, tournament: this.settings.tournament }, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        if ($('#result').open) $('#result').close();
    }

    send(command) {
        this.sel = null;
        this.inspect = null;
        if (!this.controller?.send(command)) this.render();
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('#expansions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-kind]');
            if (!button) return;
            const k = button.dataset.kind;
            const list = this.settings.expansions;
            this.settings.expansions = list.includes(k) ? list.filter(x => x !== k) : [...list, k];
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('#tournament').addEventListener('click', () => {
            this.settings.tournament = !this.settings.tournament;
            saveSettings(this.settings);
            this.renderSettings();
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
        $('#look').addEventListener('click', () => $('#result').close());
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        // 遊び方・記録を開いている間は、CPU を止める
        $('#open-help-game').addEventListener('click', () => {
            this.controller?.pause();
            $('#help').showModal();
        });
        $('#open-log').addEventListener('click', () => {
            this.controller?.pause();
            $('#log-list').innerHTML = (this.view?.logs ?? []).map(text => `<li>${escapeHtml(text)}</li>`).join('');
            $('#log').showModal();
            const list = $('#log-list');
            list.scrollTop = list.scrollHeight;
        });
        $('#help').addEventListener('close', () => this.controller?.resume());
        $('#log').addEventListener('close', () => this.controller?.resume());
        $('#zoom-in').addEventListener('click', () => this.zoomBy(1.25));
        $('#zoom-out').addEventListener('click', () => this.zoomBy(0.8));
        $('#zoom-fit').addEventListener('click', () => this.fitBoard());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#mine').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-piece]');
            if (!button || !this.myTurn()) return;
            const piece = button.dataset.piece;
            if (button.classList.contains('locked')) {
                music.play('error');
                this.toast(this.lockReason(piece));
                return;
            }
            this.inspect = null;
            const same = this.sel?.kind === 'hand' && this.sel.piece === piece;
            music.play(same ? 'cancel' : 'select');
            this.sel = same ? null : { kind: 'hand', piece };
            this.render();
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            const act = button.dataset.act;
            if (act === 'cancel') {
                music.play('cancel');
                this.sel = null;
                this.inspect = null;
                this.render();
            } else if (act === 'pass') this.send({ type: 'pass' });
            else if (act === 'hint') this.showHint();
            else if (act === 'result') this.showResult();
            else if (act === 'again') this.newGame();
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSettings() {
        document.querySelectorAll('#level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
        document.querySelectorAll('#expansions button').forEach(b => b.setAttribute('aria-pressed', String(this.settings.expansions.includes(b.dataset.kind))));
        $('#tournament').setAttribute('aria-pressed', String(this.settings.tournament));
    }

    // ---- 盤の移動と拡大 ----

    bindBoard() {
        const viewport = $('#board');
        const pointers = new Map();
        let start = null;
        const local = (e) => {
            const rect = viewport.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };
        viewport.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.zoom')) return;
            pointers.set(e.pointerId, local(e));
            const list = [...pointers.values()];
            const { tx, ty, scale } = this.camera;
            if (list.length === 1) start = { ...list[0], tx, ty, scale, tap: true };
            else if (list.length === 2) {
                const [a, b] = list;
                start = { tx, ty, scale, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, tap: false };
            }
        });
        window.addEventListener('pointermove', (e) => {
            if (!pointers.has(e.pointerId) || !start) return;
            pointers.set(e.pointerId, local(e));
            const list = [...pointers.values()];
            if (list.length === 1 && start.dist === undefined) {
                const dx = list[0].x - start.x;
                const dy = list[0].y - start.y;
                if (Math.hypot(dx, dy) > TAP_SLOP) start.tap = false;
                if (!start.tap) this.setCamera(start.scale, start.tx + dx, start.ty + dy);
            } else if (list.length === 2 && start.dist) {
                const [a, b] = list;
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.scale * dist / start.dist));
                // 2本指の真ん中の点が、指と一緒に動くように
                const wx = (start.mid.x - start.tx) / start.scale;
                const wy = (start.mid.y - start.ty) / start.scale;
                this.setCamera(scale, mid.x - wx * scale, mid.y - wy * scale);
            }
        });
        const up = (e) => {
            if (!pointers.has(e.pointerId)) return;
            const wasTap = start?.tap && pointers.size === 1;
            pointers.delete(e.pointerId);
            if (wasTap) this.tapBoard(e.clientX, e.clientY);
            if (pointers.size === 0) start = null;
            else if (pointers.size === 1) {
                const [p] = [...pointers.values()];
                start = { ...p, tx: this.camera.tx, ty: this.camera.ty, scale: this.camera.scale, tap: false };
            }
        };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, local(e));
        }, { passive: false });
    }

    setCamera(scale, tx, ty) {
        this.camera = { scale, tx, ty };
        $('#world').style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    zoomBy(factor, center = null) {
        const rect = $('#board').getBoundingClientRect();
        const c = center ?? { x: (rect.width - ZOOM_BAR) / 2, y: rect.height / 2 };
        const { scale, tx, ty } = this.camera;
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
        const wx = (c.x - tx) / scale;
        const wy = (c.y - ty) / scale;
        this.setCamera(next, c.x - wx * next, c.y - wy * next);
    }

    // 盤に出ているもの（駒と、置ける場所・動かせる先）の、盤の座標での範囲
    contentBox() {
        const from = this.view ? this.lastAction()?.from : null;
        const cells = [...Object.keys(this.view?.board ?? {}), ...this.targetCells(), ...(from ? [from] : [])];
        if (cells.length === 0) cells.push('0,0');
        const points = cells.map(cellCenter);
        const pad = HEX_R * 1.4;
        return {
            minX: Math.min(...points.map(p => p.x)) - pad, maxX: Math.max(...points.map(p => p.x)) + pad,
            minY: Math.min(...points.map(p => p.y)) - pad, maxY: Math.max(...points.map(p => p.y)) + pad
        };
    }

    // 全体が見えるように合わせる（右の拡大・縮小のボタンの幅は空ける）
    fitBoard() {
        const rect = $('#board').getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const box = this.contentBox();
        const width = rect.width - ZOOM_BAR;
        const w = box.maxX - box.minX;
        const h = box.maxY - box.minY;
        const scale = Math.min(FIT_MAX_SCALE, Math.max(MIN_SCALE, Math.min(width / w, rect.height / h)));
        this.setCamera(scale, (width - w * scale) / 2 - box.minX * scale, (rect.height - h * scale) / 2 - box.minY * scale);
    }

    // 駒や候補が今の見え方からはみ出していたら、全体に合わせる
    keepInView() {
        const rect = $('#board').getBoundingClientRect();
        const box = this.contentBox();
        const { scale, tx, ty } = this.camera;
        const margin = HEX_R * 0.5 * scale;
        const inside = box.minX * scale + tx >= -margin && box.maxX * scale + tx <= rect.width - ZOOM_BAR + margin
            && box.minY * scale + ty >= -margin && box.maxY * scale + ty <= rect.height + margin;
        if (!inside) this.fitBoard();
    }

    // 盤を押した：候補に置く・動かす、駒を選ぶ、積み重なりの中を見る
    tapBoard(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        const node = el?.closest?.('[data-cell]');
        if (!this.view) return;
        if (!node) {
            if (this.sel || this.inspect) {
                this.sel = null;
                this.inspect = null;
                this.render();
            }
            return;
        }
        const cell = node.dataset.cell;
        const targets = this.targets();
        if (node.dataset.target !== undefined && targets.has(cell)) {
            this.send(targets.get(cell));
            return;
        }
        const stack = this.view.board[cell];
        if (this.myTurn() && this.movableCells().has(cell)) {
            this.inspect = stack && stack.length > 1 ? cell : null;
            const same = this.sel?.kind === 'board' && this.sel.cell === cell;
            music.play(same ? 'cancel' : 'select');
            this.sel = same ? null : { kind: 'board', cell };
            this.render();
            return;
        }
        if (stack) {
            const top = stack[stack.length - 1];
            if (this.myTurn() && top.owner === this.myColor()) {
                music.play('error');
                this.toast(this.stuckReason(top));
            }
            this.sel = null;
            this.inspect = stack.length > 1 ? cell : null;
            this.render();
        }
    }

    // ---- 状態 ----

    // ヒントが指す場面（手を打つと変わる）
    hintKey() {
        return `${this.view.current}:${this.view.players.map(p => p.turns).join(',')}`;
    }

    // おすすめの手を示す。動かす駒（手持ちか盤の上）を選んでおき、行き先を光らせる（押せば動く）
    showHint() {
        if (!this.myTurn() || this.controller?.isOnline) return;
        const command = this.controller?.suggest();
        if (!command) return;
        music.play('select');
        this.hint = { at: this.hintKey(), command };
        this.inspect = null;
        if (command.type === 'place') this.sel = { kind: 'hand', piece: command.kind };
        if (command.type === 'move') this.sel = { kind: 'board', cell: command.from };
        this.render();
    }

    hinted() {
        if (this.hint && (this.hint.at !== this.hintKey() || !this.myTurn())) this.hint = null;
        return this.hint?.command ?? null;
    }

    myTurn() {
        const view = this.view;
        return !!view && !view.over && view.current === view.seat;
    }

    myColor() {
        return this.view.players[this.view.seat].color;
    }

    // 盤で選べるマス（そこから動かす手があるマス。ダンゴムシで動かせる相手の駒も）
    movableCells() {
        return new Set(this.view.actions.filter(a => a.type === 'move').map(a => a.from));
    }

    // 選んでいるものの行き先 → 手。ふつうの動きとダンゴムシの力の両方で行けるなら、ふつうの動きにする
    targets() {
        const map = new Map();
        if (!this.sel || !this.myTurn()) return map;
        for (const a of this.view.actions) {
            if (this.sel.kind === 'hand' ? a.type === 'place' && a.kind === this.sel.piece : a.type === 'move' && a.from === this.sel.cell) {
                const prev = map.get(a.to);
                if (!prev || (prev.via && !a.via)) map.set(a.to, a);
            }
        }
        return map;
    }

    targetCells() {
        return this.view ? [...this.targets().keys()] : [];
    }

    // 手持ちの駒が置けない理由
    lockReason(piece) {
        const me = this.view.players[this.view.seat];
        if (piece === 'Q' && me.turns === 0 && this.view.options.tournament) return '最初の手には、女王蜂を置けません（トーナメントルール）';
        if (me.hand.Q > 0 && me.turns === 3) return '4手目なので、女王蜂を置かなければなりません';
        return 'その駒は、今は置けません';
    }

    // 盤の自分の駒が動かせない理由
    stuckReason(piece) {
        const me = this.view.players[this.view.seat];
        if (me.hand.Q > 0) return '女王蜂を置くまでは、駒を動かせません';
        if (piece.id === this.view.frozen) return 'ダンゴムシに動かされたので、この手番は動かせません';
        return 'この駒は今は動かせません（巣が分かれる・すき間を通れないなど）';
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        if (!this.myTurn()) this.sel = null;
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        $('#hint').disabled = !this.myTurn();
        if (this.sel?.kind === 'board' && !this.movableCells().has(this.sel.cell)) this.sel = null;
        if (this.inspect && !(view.board[this.inspect]?.length > 1)) this.inspect = null;

        this.renderTop();
        this.renderTray($('#opponent'), view.players.find(p => p.id !== view.seat), false);
        this.renderTray($('#mine'), view.players[view.seat], true);
        this.renderBoard();
        this.renderActions();

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        this.keepInView();
        this.animate(fresh);
        this.playSound(fresh);
        if (fresh.some(e => e.type === 'pass') && !view.over) {
            const passer = fresh.filter(e => e.type === 'pass').at(-1).seat;
            this.toast(passer === view.seat ? '動かせる駒がないので、パスしました' : `${view.players[passer].name}はパスしました`);
        }
        if (view.over && fresh.some(e => e.type === 'end')) setTimeout(() => this.showResult(), 900);
    }

    // 1つの更新に1つの音。自分の手は置く、相手の手は notify、自分の番になったら turn
    playSound(fresh) {
        const view = this.view;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winner === null ? 'notify' : end.winner === view.seat ? 'win' : 'lose');
        const last = fresh.filter(e => ['place', 'move', 'pass'].includes(e.type)).at(-1);
        if (!last) return;
        if (last.seat === view.seat) return music.play(last.type === 'pass' ? 'notify' : 'place');
        music.play(this.myTurn() ? 'turn' : 'notify');
    }

    renderTop() {
        const view = this.view;
        let text;
        if (view.over) text = view.winner === null ? '引き分け' : view.winner === view.seat ? 'あなたの勝ち' : `${escapeHtml(view.players[view.winner].name)}の勝ち`;
        else if (view.current === view.seat) text = `あなたの番<small>（${COLOR_NAMES[this.myColor()]}・${view.players[view.seat].turns + 1}手目）</small>`;
        else text = `${escapeHtml(view.players[view.current].name)}が考えています`;
        $('#turn-info').innerHTML = text;
    }

    // 手持ちの欄。mine なら押せる（置けない駒は鍵）
    renderTray(el, player, mine) {
        const view = this.view;
        const kinds = KINDS.filter(k => k in player.hand);
        const placeable = new Set(mine && this.myTurn() ? view.actions.filter(a => a.type === 'place').map(a => a.kind) : []);
        const pieces = kinds.map(k => {
            const n = player.hand[k];
            const selected = mine && this.sel?.kind === 'hand' && this.sel.piece === k;
            const locked = mine && this.myTurn() && n > 0 && !placeable.has(k);
            const cls = `slot ${n === 0 ? 'empty' : ''} ${selected ? 'selected' : ''} ${locked ? 'locked' : ''} ${mine && placeable.has(k) ? 'can' : ''}`;
            const body = `${pieceSvg(k, player.color)}${n > 1 ? `<b class="count">${n}</b>` : ''}`;
            return mine
                ? `<button type="button" class="${cls}" data-piece="${k}" aria-label="${KIND_NAMES[k]} ${n}個" ${n === 0 ? 'disabled' : ''}>${body}</button>`
                : `<span class="${cls}" title="${KIND_NAMES[k]} ${n}個">${body}</span>`;
        }).join('');
        const active = !view.over && view.current === player.id;
        const s = player.surround;
        const danger = s === null ? '' : s >= 5 ? 'danger' : s >= 4 ? 'warn' : '';
        el.classList.toggle('active', active);
        el.innerHTML = `<div class="who"><span class="stone o${player.color}"></span><span class="name">${escapeHtml(mine ? 'あなた' : player.name)}</span>
            <span class="surround ${danger}" title="女王蜂のまわりのふさがったマス">${s === null ? '女王蜂 未' : `女王蜂 ${s}/6`}</span></div>
            <div class="pieces">${pieces}</div>`;
    }

    // 最後に置いた・動かした手
    lastAction() {
        return [...this.view.events].reverse().find(e => e.type === 'place' || e.type === 'move') ?? null;
    }

    renderBoard() {
        const view = this.view;
        const targets = this.targets();
        const last = this.lastAction();
        const movable = this.myTurn() ? this.movableCells() : new Set();
        const parts = [];
        // 最後の手の、元のマス
        if (last?.from && !view.board[last.from]) {
            const c = cellCenter(last.from);
            parts.push(`<polygon class="from-mark" points="${hexPoints(HEX_R - 3)}" transform="translate(${c.x} ${c.y})"/>`);
        }
        // 駒：上（奥）の行から描く。積み重なりは、下の駒を右下へずらして見せる
        const cells = Object.keys(view.board).sort((a, b) => cellCenter(a).y - cellCenter(b).y || cellCenter(a).x - cellCenter(b).x);
        for (const cell of cells) {
            const stack = view.board[cell];
            const c = cellCenter(cell);
            const h = stack.length;
            const layers = stack.map((p, i) => {
                const depth = h - 1 - i;
                const top = i === h - 1;
                return `<g class="layer ${top ? 'top' : 'under'}" data-id="${p.id}" style="transform: translate(${depth * LAYER_OFFSET.x}px, ${depth * LAYER_OFFSET.y}px)">${pieceShape(p.kind, p.owner)}</g>`;
            }).join('');
            const classes = [
                'stack',
                this.sel?.kind === 'board' && this.sel.cell === cell ? 'selected' : '',
                movable.has(cell) ? 'movable' : '',
                last?.to === cell ? 'last' : '',
                this.inspect === cell ? 'inspected' : '',
                stack[h - 1].id === view.frozen ? 'frozen' : ''
            ].join(' ');
            const badge = h > 1 ? `<g class="height"><circle cx="${HEX_R * 0.62}" cy="${-HEX_R * 0.62}" r="9"/><text x="${HEX_R * 0.62}" y="${-HEX_R * 0.62 + 4}">${h}</text></g>` : '';
            parts.push(`<g class="${classes}" data-cell="${cell}" transform="translate(${c.x} ${c.y})">${layers}<polygon class="ring" points="${hexPoints(HEX_R - 1)}"/>${badge}</g>`);
        }
        // 置ける場所・動かせる先（駒の上に乗る先は、輪で示す）。ヒントの行き先は金色にする
        const hint = this.hinted();
        for (const [cell, action] of targets) {
            const c = cellCenter(cell);
            const climb = !!view.board[cell];
            const suggested = hint && hint.to === cell && (hint.type === 'place' ? this.sel?.kind === 'hand' && this.sel.piece === hint.kind : this.sel?.cell === hint.from);
            parts.push(`<g class="target ${action.via ? 'via' : ''} ${climb ? 'climb' : ''} ${suggested ? 'suggested-target' : ''}" data-cell="${cell}" data-target="" transform="translate(${c.x} ${c.y})">
                <polygon points="${hexPoints(HEX_R - 3)}"/>${climb ? '' : '<circle r="5"/>'}</g>`);
        }
        $('#world').innerHTML = parts.join('');
    }

    renderActions() {
        const view = this.view;
        let html;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        if (this.inspect) {
            const stack = view.board[this.inspect];
            const list = stack.map(p => `<span class="mini">${pieceSvg(p.kind, p.owner)}</span>`).join('<span class="sep">›</span>');
            const hint = this.sel ? '<span class="hint">動かす先を押す</span>' : '';
            html = `<span class="stack-list"><small>下から</small>${list}</span>${hint}${cancel}`;
        } else if (view.over) {
            html = `<button class="btn small ghost" data-act="result">結果</button><button class="btn small primary" data-act="again">もう一度</button>`;
        } else if (this.myTurn()) {
            const onlyPass = view.actions.length === 1 && view.actions[0].type === 'pass';
            const me = view.players[view.seat];
            if (onlyPass) html = '<span class="hint">置ける駒も、動かせる駒もありません</span><button class="btn small primary" data-act="pass">パス</button>';
            else if (this.sel?.kind === 'hand') html = `<span class="hint">${KIND_NAMES[this.sel.piece]}を置く場所を押す</span>${cancel}`;
            else if (this.sel?.kind === 'board') {
                const top = view.board[this.sel.cell].at(-1);
                const viaOnly = [...this.targets().values()].every(a => a.via);
                html = `<span class="hint">${top.owner !== this.myColor() ? '相手の' : ''}${KIND_NAMES[top.kind]}を${viaOnly ? 'ダンゴムシで' : ''}動かす先を押す</span>${cancel}`;
            } else if (me.hand.Q > 0 && me.turns === 3) html = '<span class="hint strong">4手目です。女王蜂を置いてください</span>';
            else html = `<span class="hint">${me.hand.Q > 0 ? '置く駒を選ぶ' : '置く駒か、動かす駒を選ぶ'}</span>`;
        } else {
            html = `<span class="hint muted">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        }
        $('#actions').innerHTML = html;
        if (this.hinted()?.type === 'pass') $('#actions [data-act="pass"]')?.classList.add('suggested');
    }

    // 置いた駒は浮き出るように、動かした駒は元のマスから滑らせる
    animate(events) {
        if (events.length === 0 || events.length > 3 || reducedMotion()) return;
        const event = events.filter(e => e.type === 'place' || e.type === 'move').at(-1);
        if (!event) return;
        const node = document.querySelector(`#world [data-cell="${event.to}"] .layer.top`);
        if (!node) return;
        if (event.type === 'place') {
            node.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: MOVE_MS, easing: 'ease-out' });
            return;
        }
        const from = cellCenter(event.from);
        const to = cellCenter(event.to);
        node.animate([
            { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` },
            { transform: 'translate(0px, 0px)' }
        ], { duration: MOVE_MS, easing: 'cubic-bezier(.45,.05,.4,1)' });
    }

    // ---- 結果 ----

    showResult() {
        const view = this.view;
        if (!view?.over || $('#result').open) return;
        $('#result-title').textContent = view.winner === null ? '引き分け' : view.winner === view.seat ? 'あなたの勝ち' : `${view.players[view.winner].name}の勝ち`;
        const reason = view.result.reason;
        $('#result-detail').textContent = reason === 'queen'
            ? `${view.winner === view.seat ? '相手' : 'あなた'}の女王蜂が6方向ともふさがりました`
            : reason === 'both' ? '両方の女王蜂が同時にふさがりました' : '同じ局面が3回になりました';
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

