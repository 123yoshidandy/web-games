/**
 * 画面（タイトル・ゲーム・ラウンドの結果・最後の結果・記録・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 盤面：1本指（マウス）で動かし、2本指（ホイール）で拡大・縮小する。ページはズームさせない
 * 手札を押して選ぶと、出せる先が光る
 * - 道：置ける場所に半透明の候補が出る。押すと置く（その場所が回した向きでしか置けなければ、回して置く）
 * - 壊す・直す：相手の札が光る。2種類を直せるカードで、両方壊れていれば、直す道具を選ぶ
 * - 地図：伏せたゴール、落盤：取り除ける道が光る
 */

import { CARDS, TOOLS, TOOL_NAMES, ROLE_NAMES, MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { GOAL_POSITIONS } from './cards.js';
import { key, placements } from './board.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, icon, toolIcon, pathSvg, startSvg, goalSvg, handCardHtml, CARD_W, CARD_H } from './art.js';
import { captureAnchors, playEvents } from './animator.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

// 自分の操作の音：道を置く・捨てる・壊す・直す・地図・落石
const COMMAND_SOUND = { path: 'place', discard: 'pay', break: 'capture', repair: 'gain', map: 'draw', rockfall: 'capture' };

const SETTINGS_KEY = 'saboteur.settings';
const CPU_NAMES = ['ガンツ', 'ボリ', 'ドルン', 'フィリ', 'ミルダ', 'トーリ', 'ノラ', 'ブロム', 'ヘルガ'];
const STEP_X = CARD_W + 2;   // 盤面のマスの間隔
const STEP_Y = CARD_H + 2;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.6;
const TAP_SLOP = 8;          // これより動いたら、タップではなく盤面の移動
const ZOOM_BAR = 40;         // 盤面の右の、拡大・縮小のボタンの幅

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: Number.isInteger(saved.count) && saved.count >= MIN_PLAYERS && saved.count <= MAX_PLAYERS ? saved.count : 5 };
    } catch {
        return { count: 5 };
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
        this.picked = null;       // 手札から選んだカード
        this.hintCommand = null;  // ヒントのおすすめの手（画面だけ）
        this.rotated = false;     // 道を回して置くか
        this.repairTarget = null; // 2種類を直せるカードで、直す道具を選んでいる相手
        this.lastSeq = 0;
        this.camera = { scale: 1, tx: 0, ty: 0 };
        this.roundShown = 0;
        $('#symbols').innerHTML = symbolsSvg();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'お邪魔者',
            game: 'saboteur',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 900,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onControllerUpdate(),
            onError: (message) => this.onControllerError(message),
            onExit: () => {
                this.stopGame();
                this.showTitle();
            }
        });
        this.bindStatic();
        this.bindBoard();
        this.renderTitleArt();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
        this.renderCount();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.onControllerUpdate(),
                onError: (message) => this.onControllerError(message)
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
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
        ['#round-result', '#result', '#log-dialog'].forEach(id => { if ($(id).open) $(id).close(); });
        this.controller = controller;
        $('#hint').hidden = Boolean(controller.isOnline); // ヒントはローカル対戦だけ
        this.resetSelection();
        this.view = null;
        const view = this.controller.getView();
        this.lastSeq = view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.roundShown = view.round;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.fitBoard();
    }

    newGame() {
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, this.settings.count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        ['#round-result', '#result', '#log-dialog'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    resetSelection() {
        this.picked = null;
        this.repairTarget = null;
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#count-down').addEventListener('click', () => this.changeCount(-1));
        $('#count-up').addEventListener('click', () => this.changeCount(1));
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (this.controller?.isOnline) {
                $('#result').close();
                this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
                return;
            }
            this.newGame();
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        const pauseWhile = (dialog) => {
            this.controller?.pause();
            dialog.showModal();
        };
        $('#open-help-game').addEventListener('click', () => pauseWhile($('#help')));
        $('#open-log').addEventListener('click', () => {
            this.renderLog();
            pauseWhile($('#log-dialog'));
            const list = $('#log-list');
            list.scrollTop = list.scrollHeight;
        });
        $('#next-round').addEventListener('click', () => $('#round-result').close());
        ['#help', '#log-dialog', '#round-result'].forEach(id => $(id).addEventListener('close', () => {
            this.render();
            this.controller?.resume();
        }));

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result' || dialog.id === 'round-result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (!card || !this.myTurn()) return;
            const id = Number(card.dataset.card);
            this.picked = this.picked === id ? null : id;
            this.repairTarget = null;
            music.play(this.picked === null ? 'cancel' : 'select');
            this.render();
        });
        $('#screen-game').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-player]');
            if (tile && this.picked !== null && tile.classList.contains('selectable')) this.pickPlayer(Number(tile.dataset.player));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            const act = button.dataset.act;
            if (act === 'rotate') {
                this.rotated = !this.rotated;
                music.play('select');
                this.render();
            } else if (act === 'discard') {
                this.send({ type: 'discard', card: this.picked });
            } else if (act === 'cancel') {
                this.resetSelection();
                music.play('cancel');
                this.render();
            } else if (act === 'tool') {
                this.send({ type: 'repair', card: this.picked, target: this.repairTarget, tool: button.dataset.tool });
            }
        });
        $('#zoom-in').addEventListener('click', () => this.zoomBy(1.25));
        $('#hint').addEventListener('click', () => this.showHint());
        $('#zoom-out').addEventListener('click', () => this.zoomBy(0.8));
        $('#zoom-fit').addEventListener('click', () => this.fitBoard());

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    changeCount(delta) {
        this.settings.count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, this.settings.count + delta));
        saveSettings(this.settings);
        this.renderCount();
    }

    renderCount() {
        $('#count-value').textContent = `${this.settings.count}人`;
        $('#count-down').disabled = this.settings.count <= MIN_PLAYERS;
        $('#count-up').disabled = this.settings.count >= MAX_PLAYERS;
    }

    renderTitleArt() {
        const ids = ['24', '123', '1234', '14'].map(shape => CARDS.find(c => c.kind === 'path' && c.connected && c.shape === shape).id);
        $('#title-art').innerHTML = `<div class="title-row">${startSvg()}${ids.map(id => pathSvg(id)).join('')}${goalSvg({ revealed: true, card: 0, rotated: false })}</div>`;
    }

    send(command) {
        this.resetSelection();
        this.hintCommand = null;
        const round = this.view.round;
        this.sending = true;
        const ok = this.controller?.send(command);
        this.sending = false;
        // ラウンドが終わったときは、その音（playUpdateSound）だけにする
        if (ok && this.view.phase !== 'end' && this.view.round === round) music.play(COMMAND_SOUND[command.type] ?? 'place');
    }

    // 1回の更新に1つの音。自分の手の音は send で鳴らす。CPU の手は知らせ、自分の番になったらチャイム
    playUpdateSound(previous) {
        const view = this.view;
        if (!previous) return;
        if (view.phase === 'end') {
            if (previous.phase !== 'end') music.play(!view.winners.includes(view.you) ? 'lose' : view.winners.length > 1 ? 'notify' : 'win');
        } else if (view.round !== previous.round) {
            music.play('shuffle');
        } else if (!this.sending) {
            const wasMine = previous.phase === 'play' && previous.current === previous.you;
            music.play(this.myTurn() && !wasMine ? 'turn' : 'notify');
        }
    }

    // ---- 盤面の移動と拡大 ----

    bindBoard() {
        const viewport = $('#board');
        const pointers = new Map();
        let start = null; // { x, y, tx, ty, scale, dist, mid, moved }
        const local = (e) => {
            const rect = viewport.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };
        viewport.addEventListener('pointerdown', (e) => {
            pointers.set(e.pointerId, local(e));
            const list = [...pointers.values()];
            const { tx, ty, scale } = this.camera;
            if (list.length === 1) start = { ...list[0], tx, ty, scale, moved: false, tap: true };
            else if (list.length === 2) {
                const [a, b] = list;
                start = { tx, ty, scale, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, moved: true, tap: false };
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
            const p = local(e);
            this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, p);
        }, { passive: false });
    }

    setCamera(scale, tx, ty) {
        this.camera = { scale, tx, ty };
        $('#world').style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    zoomBy(factor, center = null) {
        const viewport = $('#board').getBoundingClientRect();
        const c = center ?? { x: viewport.width / 2, y: viewport.height / 2 };
        const { scale, tx, ty } = this.camera;
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
        const wx = (c.x - tx) / scale;
        const wy = (c.y - ty) / scale;
        this.setCamera(next, c.x - wx * next, c.y - wy * next);
    }

    // 置いてあるカードとゴールが全部見えるように合わせる。道を置ける候補が入るよう、まわりに1マスの余白を取り、
    // 右の拡大・縮小のボタンの幅は空ける
    fitBoard() {
        if (!this.view) return;
        const cells = [...Object.keys(this.view.board).map(k => k.split(',').map(Number)), ...GOAL_POSITIONS];
        const xs = cells.map(c => c[0]);
        const ys = cells.map(c => c[1]);
        const minX = Math.min(...xs) - 1;
        const maxX = Math.max(...xs) + 1;
        const minY = Math.min(...ys) - 1;
        const maxY = Math.max(...ys) + 2;
        const rect = $('#board').getBoundingClientRect();
        const width = rect.width - ZOOM_BAR;
        const w = (maxX + 1 - minX) * STEP_X;
        const h = (maxY - minY) * STEP_Y;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(width / w, rect.height / h)));
        const tx = (width - w * scale) / 2 - minX * STEP_X * scale;
        const ty = (rect.height - h * scale) / 2 - minY * STEP_Y * scale;
        this.setCamera(scale, tx, ty);
    }

    // 盤面を押した：候補に置く・地図でゴールを見る・落盤で取り除く
    tapBoard(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el || !this.myTurn() || this.picked === null) return;
        const target = el.closest('[data-target]');
        const card = CARDS[this.picked];
        if (target && card.kind === 'path') {
            const x = Number(target.dataset.x);
            const y = Number(target.dataset.y);
            this.send({ type: 'path', card: this.picked, x, y, rotated: target.dataset.rot === '1' });
            return;
        }
        const cell = el.closest('.cell.selectable');
        if (!cell) return;
        const x = Number(cell.dataset.x);
        const y = Number(cell.dataset.y);
        if (card.kind === 'map') this.send({ type: 'map', card: this.picked, goal: Number(cell.dataset.goal) });
        if (card.kind === 'rockfall') this.send({ type: 'rockfall', card: this.picked, x, y });
    }

    // ---- 状態 ----

    myTurn() {
        const view = this.view;
        return !!view && view.phase === 'play' && view.current === view.you && !$('#round-result').open;
    }

    me() {
        return this.view.players[this.view.you];
    }

    // 選んだ道のカードを置ける場所。その場所に今の向きで置ければ今の向き、そうでなければ回した向き
    targets() {
        if (this.picked === null || !this.myTurn() || CARDS[this.picked].kind !== 'path' || this.me().broken.length > 0) return [];
        const list = placements(this.view.board, this.view.goals, this.picked);
        const byCell = new Map();
        list.forEach(p => {
            const k = key(p.x, p.y);
            const current = byCell.get(k);
            if (!current || p.rotated === this.rotated) byCell.set(k, p);
        });
        return [...byCell.values()];
    }

    // 選んだアクションのカードを出せる人
    selectablePlayers() {
        if (this.picked === null || !this.myTurn()) return [];
        const card = CARDS[this.picked];
        const view = this.view;
        if (card.kind === 'break') return view.players.filter(p => p.id !== view.you && !p.broken.includes(card.tools[0])).map(p => p.id);
        if (card.kind === 'repair') return view.players.filter(p => card.tools.some(t => p.broken.includes(t))).map(p => p.id);
        return [];
    }

    pickPlayer(seat) {
        const card = CARDS[this.picked];
        if (card.kind === 'break') return this.send({ type: 'break', card: this.picked, target: seat });
        const tools = card.tools.filter(t => this.view.players[seat].broken.includes(t));
        if (tools.length === 1) return this.send({ type: 'repair', card: this.picked, target: seat, tool: tools[0] });
        this.repairTarget = seat; // どちらを直すかを選ぶ
        this.render();
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        this.view = view;
        if (!this.myTurn() || (this.picked !== null && !view.hand.includes(this.picked))) this.resetSelection();

        this.renderTop();
        this.renderPlayers();
        this.renderBoard();
        this.renderMe();
        this.renderHand();
        this.renderActions();
        if (!this.myTurn()) this.hintCommand = null;
        this.markHint();

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        const roundEnd = fresh.find(e => e.type === 'roundEnd');
        if (roundEnd) {
            this.controller.pause();
            setTimeout(() => this.showRoundResult(roundEnd, view.phase === 'end'), 900);
        } else {
            playEvents(fresh, before, { you: view.you });
        }
        fresh.forEach(e => {
            if (e.type === 'map' && e.seat === view.you) this.toast(`地図：${e.goal + 1}番目のゴールは${e.gold ? '金' : '石'}でした`);
            if (e.type === 'reveal' && !roundEnd) this.toast(`${e.goal + 1}番目のゴールは${e.gold ? '金' : '石'}でした`);
        });
        if (view.round !== this.roundShown && !roundEnd) {
            this.roundShown = view.round;
            this.fitBoard();
        }
    }

    renderTop() {
        const view = this.view;
        $('#round-info').innerHTML = `第${view.round}<span class="of">/3</span>`;
        $('#role').className = `role role-${view.role}`;
        $('#role').innerHTML = `${icon(view.role)}<span>${ROLE_NAMES[view.role]}</span>`;
        $('#deck-count').textContent = view.deckCount;
    }

    renderPlayers() {
        const view = this.view;
        const selectable = this.selectablePlayers();
        const order = view.players.map((_, i) => (view.you + 1 + i) % view.players.length).filter(i => i !== view.you);
        const el = $('#players');
        el.style.setProperty('--cols', Math.min(3, order.length));
        el.innerHTML = order.map(seat => {
            const p = view.players[seat];
            const active = view.current === seat && view.phase === 'play';
            return `<div class="player ${active ? 'active' : ''} ${selectable.includes(seat) ? 'selectable' : ''}" data-player="${seat}" ${selectable.includes(seat) ? 'role="button"' : ''}>
                <span class="p-name">${escapeHtml(p.name)}</span>
                <span class="p-tools">${p.broken.map(t => toolIcon(t, true)).join('')}</span>
                <span class="p-hand" title="手札">${p.handCount}</span>
                <span class="p-gold" title="金塊">${icon('gold')}${p.gold}</span>
            </div>`;
        }).join('');
    }

    renderBoard() {
        const view = this.view;
        const picked = this.picked !== null ? CARDS[this.picked] : null;
        const mapping = this.myTurn() && picked?.kind === 'map';
        const rocking = this.myTurn() && picked?.kind === 'rockfall';
        const cells = Object.entries(view.board).map(([k, cell]) => {
            const [x, y] = k.split(',').map(Number);
            let svg;
            let cls = '';
            let attrs = '';
            if (cell.type === 'start') svg = startSvg();
            else if (cell.type === 'goal') {
                const goal = view.goals[cell.goal];
                svg = goalSvg(goal);
                cls = 'goal';
                attrs = `data-goal="${cell.goal}"`;
                if (mapping && !goal.revealed) cls += ' selectable';
                const known = view.knownGoals[cell.goal];
                if (known && !goal.revealed) svg += `<span class="known ${known}">${icon('eye')}${known === 'gold' ? '金' : '石'}</span>`;
            } else {
                svg = pathSvg(cell.id, cell.rotated);
                if (rocking) cls = 'selectable';
            }
            return `<div class="cell ${cls}" data-x="${x}" data-y="${y}" ${attrs} style="left:${x * STEP_X}px;top:${y * STEP_Y}px">${svg}</div>`;
        });
        const targets = this.targets().map(t => `<div class="cell target" data-target="1" data-x="${t.x}" data-y="${t.y}" data-rot="${t.rotated ? 1 : 0}"
            style="left:${t.x * STEP_X}px;top:${t.y * STEP_Y}px">${pathSvg(this.picked, t.rotated)}</div>`);
        $('#world').innerHTML = cells.join('') + targets.join('');
        $('#world').style.transform = `translate(${this.camera.tx}px, ${this.camera.ty}px) scale(${this.camera.scale})`;
    }

    renderMe() {
        const view = this.view;
        const me = this.me();
        const selectable = this.selectablePlayers().includes(me.id);
        const active = view.current === me.id && view.phase === 'play';
        $('#me').className = `me ${active ? 'active' : ''} ${selectable ? 'selectable' : ''}`;
        $('#me').dataset.player = me.id;
        $('#me').innerHTML = `<span class="p-name">あなた</span>
            <span class="p-tools">${TOOLS.map(t => toolIcon(t, me.broken.includes(t))).join('')}</span>
            <span class="p-gold big">${icon('gold')}${me.gold}</span>`;
    }

    renderHand() {
        const view = this.view;
        const mine = this.myTurn();
        $('#hand').className = `hand ${mine ? 'playable' : ''}`;
        $('#hand').innerHTML = view.hand.map(id => handCardHtml(id, { cls: id === this.picked ? 'picked' : '', rotated: id === this.picked && this.rotated })).join('');
    }

    renderActions() {
        const view = this.view;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        const discard = '<button class="btn small secondary" data-act="discard">捨てる</button>';
        let html;
        if (!this.myTurn()) {
            const last = view.logs.at(-1)?.text ?? '';
            html = `<span class="act-log">${escapeHtml(last)}</span>`;
        } else if (this.picked === null) {
            html = `<span class="act-log">${escapeHtml(view.logs.at(-1)?.text ?? '')}</span>`;
        } else {
            const card = CARDS[this.picked];
            let label = '';
            let extra = '';
            if (card.kind === 'path') {
                if (this.me().broken.length > 0) label = '道具が壊れていて置けない';
                else {
                    const n = this.targets().length;
                    label = n ? `置ける場所 ${n}` : '置ける場所がない';
                    extra = `<button class="btn small ghost icon-only" data-act="rotate" aria-label="回す" title="180度回す"><svg class="line-icon" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg></button>`;
                }
            } else if (card.kind === 'break') label = this.selectablePlayers().length ? '壊す相手を選ぶ' : '壊せる相手がいない';
            else if (card.kind === 'repair') {
                if (this.repairTarget !== null) {
                    const tools = card.tools.filter(t => view.players[this.repairTarget].broken.includes(t));
                    extra = tools.map(t => `<button class="btn small primary" data-act="tool" data-tool="${t}">${icon(t)}${TOOL_NAMES[t]}</button>`).join('');
                } else label = this.selectablePlayers().length ? '直す人を選ぶ' : '直せる人がいない';
            } else if (card.kind === 'map') label = '見るゴールを選ぶ';
            else label = '取り除く道を選ぶ';
            html = `${extra}${label ? `<span class="act-label">${label}</span>` : ''}${discard}${cancel}`;
        }
        $('#actions').innerHTML = html;
    }

    renderLog() {
        const view = this.controller.getView();
        $('#log-list').innerHTML = view.logs.map(l => `<li class="${l.seat === null ? 'system' : ''}">${escapeHtml(l.text)}</li>`).join('');
    }

    // ---- ラウンドの結果 ----

    resultTable(event) {
        const view = this.view;
        return view.players.map(p => `<tr class="${p.id === view.you ? 'mine' : ''}">
            <th>${escapeHtml(p.name)}</th>
            <td><span class="role-cell role-${event.roles[p.id]}">${icon(event.roles[p.id])}${ROLE_NAMES[event.roles[p.id]]}</span></td>
            <td class="plus">${event.payouts[p.id] ? `+${event.payouts[p.id]}` : ''}</td>
            <td class="total">${event.totals[p.id]}</td></tr>`).join('');
    }

    showRoundResult(event, gameOver) {
        const view = this.view;
        const title = event.winner === 'diggers' ? '金鉱掘りの勝ち' : 'お邪魔者の勝ち';
        const where = `金は${event.goldGoal + 1}番目のゴールでした`;
        if (gameOver) {
            const youWon = view.winners.includes(view.you);
            $('#result-title').textContent = youWon ? (view.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${view.winners.map(id => view.players[id].name).join('と')}の勝ち`;
            $('#result-sub').textContent = `第3ラウンドは${title}。${where}`;
            $('#result-table').innerHTML = `<thead><tr><th></th><th>役割</th><th>金塊</th><th>合計</th></tr></thead><tbody>${this.resultTable(event)}</tbody>`;
            if (!$('#result').open) $('#result').showModal();
            return;
        }
        $('#round-title').textContent = `第${event.round}ラウンドは${title}`;
        $('#round-sub').textContent = where;
        $('#round-table').innerHTML = `<thead><tr><th></th><th>役割</th><th>金塊</th><th>合計</th></tr></thead><tbody>${this.resultTable(event)}</tbody>`;
        if (!$('#round-result').open) $('#round-result').showModal();
        this.roundShown = this.view.round;
        this.fitBoard();
    }

    // ---- ヒント ----

    // おすすめのカードを選んだ状態にし、置き場所・相手・ボタンに印を付ける（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.myTurn() ? this.controller?.hint() : null;
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        music.play('select');
        this.picked = command.card;
        this.rotated = !!command.rotated;
        this.repairTarget = null;
        this.render();
        const name = (seat) => (seat === this.view.you ? '自分' : this.view.players[seat].name);
        const text = {
            path: () => '光る場所に、この道を置く',
            discard: () => 'このカードを捨てる',
            break: () => `${name(command.target)}の道具を壊す`,
            repair: () => `${name(command.target)}の道具を直す`,
            map: () => '地図で、光るゴールを見る',
            rockfall: () => '落盤で、光る道を崩す'
        }[command.type]?.() ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c || this.picked !== c.card) return;
        const at = `[data-x="${c.x}"][data-y="${c.y}"]`;
        const selector = {
            path: `.cell.target${at}[data-rot="${c.rotated ? 1 : 0}"]`,
            rockfall: `.cell${at}`,
            map: `.cell[data-goal="${c.goal}"]`,
            discard: '#actions [data-act="discard"]',
            break: `[data-player="${c.target}"]`,
            repair: c.target === this.view.you ? '#me' : `[data-player="${c.target}"]`
        }[c.type];
        if (selector) document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}
