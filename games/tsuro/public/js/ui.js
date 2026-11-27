/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * - 駒を置く：盤の縁の近くをタップすると、一番近い空いた印を選ぶ。「置く」で決める
 * - タイルを置く：手札のタイルをタップで選ぶと、駒の前のマスに置いたときの形と、駒の行き先が盤に出る
 *   選んだタイル・盤のマス・回すボタンのどれをタップしても、時計回りに回る。「置く」で決める
 */

import { START_MARKS, SIZE, DISTINCT_ROTATIONS, simulate, trace, rowOf, colOf, SIDE } from './tiles.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { symbolsSvg, tileGroup, tileSvg, stoneSvg, trailPath, pointXY, dotHtml, dragonBadge, U, PAD, COLORS } from './art.js';

const SETTINGS_KEY = 'tsuro.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン', 'アオイ', 'カイ', 'ユイ'];
const RESULT_DELAY_MS = 700;
const MOVE_MS_PER_SEG = 200;
const MOVE_MS_MAX = 1100;
const BOARD = SIZE * U;
const OUTWARD = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(saved.count) && saved.count >= 2 && saved.count <= 8 ? saved.count : 4,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 4, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

const rotKey = (tile, rot) => rot % DISTINCT_ROTATIONS[tile];

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.selected = null;    // 選んだ手札のタイル
        this.rots = new Map();   // タイル → 向き
        this.rotTurn = -1;       // 向きを決め直した手番
        this.markPick = null;    // 駒を置く印
        this.anims = [];         // 駒の動きの演出 { seat, segs, start, dur }
        this.freshCell = null;
        this.raf = 0;
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ツォロ',
            game: 'tsuro',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 700,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
        this.renderTitleArt();
        this.renderHelp();
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
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.stopGame();
        this.controller = controller;
        this.view = null;
        this.selected = null;
        this.rots = new Map();
        this.rotTurn = -1;
        this.markPick = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        cancelAnimationFrame(this.raf);
        this.anims = [];
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#cpu-level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
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
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle())); // オンラインは確かめてから部屋を出る
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', () => this.showLog());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#hand').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-tile]');
            if (button) this.pickTile(Number(button.dataset.tile));
        });
        $('#rotate').addEventListener('click', () => this.rotateSelected());
        $('#confirm').addEventListener('click', () => this.confirm());
        $('#board').addEventListener('click', (event) => this.onBoardTap(event));
    }

    // ---- 操作 ----

    myTurn(phase) {
        const v = this.view;
        return !!v && !v.over && v.phase === phase && v.current === v.you && v.players[v.you].alive;
    }

    pickTile(tile) {
        if (!this.view?.players[this.view.you].hand?.includes(tile)) return;
        if (this.selected === tile) return this.rotateSelected();
        this.selected = tile;
        music.play('select');
        this.render();
    }

    rotateSelected() {
        if (this.selected === null) {
            const hand = this.view?.players[this.view.you].hand ?? [];
            if (!hand.length) return;
            this.selected = hand[0];
        } else {
            this.rots.set(this.selected, ((this.rots.get(this.selected) ?? 0) + 1) % 4);
        }
        music.play('select');
        this.render();
    }

    currentMove() {
        if (this.selected === null) return null;
        const rot = this.rots.get(this.selected) ?? 0;
        return this.view.moves.find(m => m.tile === this.selected && m.rot === rotKey(this.selected, rot)) ?? null;
    }

    confirm() {
        if (this.myTurn('place') && this.markPick !== null) {
            if (this.controller.send({ type: 'place', mark: this.markPick })) this.markPick = null;
            return;
        }
        if (!this.myTurn('play')) return;
        const move = this.currentMove();
        if (!move || !move.allowed) return;
        const rot = this.rots.get(this.selected) ?? 0;
        if (this.controller.send({ type: 'play', tile: move.tile, rotation: rotKey(move.tile, rot) })) this.selected = null;
    }

    // 盤のタップ：駒を置く番なら一番近い空いた印、タイルを置く番なら、駒の前のマスで回す
    onBoardTap(event) {
        const v = this.view;
        if (!v) return;
        const svg = $('#board');
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse());
        if (this.myTurn('place')) {
            let best = null;
            let bestD = 70;
            v.freeMarks.forEach(mark => {
                const [mx, my] = pointXY(START_MARKS[mark].cell, START_MARKS[mark].p);
                const d = Math.hypot(mx - x, my - y);
                if (d < bestD) {
                    bestD = d;
                    best = mark;
                }
            });
            if (best !== null) {
                this.markPick = best;
                music.play('select');
                this.render();
            }
            return;
        }
        if (this.myTurn('play')) {
            const cell = v.players[v.you].pos.cell;
            const cx = colOf(cell) * U;
            const cy = rowOf(cell) * U;
            if (x >= cx && x <= cx + U && y >= cy && y <= cy + U) this.rotateSelected();
        }
    }

    // ---- タイトル・遊び方 ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // タイトルの絵：3×3 の盤に置いたタイルと、縁から入って道をたどる2つの駒
    renderTitleArt() {
        const tiles = [[7, 1], [21, 0], [12, 3], [30, 2], [3, 1], [26, 0], [16, 1], [33, 3], [9, 2]];
        const board = Array(SIZE * SIZE).fill(null);
        const cells = [0, 1, 2, 6, 7, 8, 12, 13, 14];
        cells.forEach((cell, i) => { board[cell] = { tile: tiles[i][0], rot: tiles[i][1] }; });
        const routes = [[2, 1, 0], [0, 0, 2]].map(([cell, p, seat]) => ({ seat, ...trace(board, cell, p) }));
        const tileLayer = cells.map((cell, i) => tileGroup(tiles[i][0], tiles[i][1], colOf(cell) * U, rowOf(cell) * U)).join('');
        const trails = routes.map(r => `<path d="${trailPath(r.segs)}" class="trail" stroke="${COLORS[r.seat]}"/>`).join('');
        const stones = routes.map(r => {
            const last = r.segs.at(-1);
            const [x, y] = pointXY(last[0], last[2]);
            return stoneSvg(r.seat, x, y, { r: 13 });
        }).join('');
        $('#title-art').innerHTML = `<svg viewBox="-16 -16 332 332" class="title-board">${tileLayer}${trails}${stones}</svg>`;
    }

    renderHelp() {
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>タイルを置いて、自分の駒の道をのばします。盤の外に出るか、ほかの駒とぶつかると脱落。最後まで盤に残った人の勝ちです。</p>
            <h3>はじめに</h3>
            <p>道のタイルは35枚。どれも4本の道で、縁の8つの点を2つずつつないでいます。各自3枚を手札に持ち、順に盤の縁の印へ駒を置きます。</p>
            <h3>手番</h3>
            <ul class="help-list">
                <li><strong>置く</strong><span>手札から1枚を、自分の駒の前のマスに置く。どの向きでもよい</span></li>
                <li><strong>進む</strong><span>自分の駒と、そのタイルに面しているほかの駒が、道の終わりまで進む</span></li>
                <li><strong>引く</strong><span>山から1枚引く。手札が3枚に満たない人がいれば、順に3枚まで引く</span></li>
            </ul>
            <p>自分の駒が盤の外に出る置き方や、ほかの駒にぶつかる置き方は、ほかに置き方がないときしかできません。</p>
            <h3>脱落</h3>
            <p>盤の外に出た駒と、出会った2つの駒は脱落します。脱落した人の手札は、山に戻して混ぜます。</p>
            <h3>竜のタイル</h3>
            <p>${dragonBadge('inline')} 3人以上のとき。山が空で引けなかった人が取ります。あとでタイルが山に戻ったら、竜のタイルの人から順に引きます。</p>
            <h3>終わり</h3>
            <p>盤に残った駒が1つになったら、その人の勝ち。残りの全員が同じ手で脱落したら、その人たちの引き分け。タイルを置ききったときに残っている人たちも、引き分けです。</p>
            <h3>操作</h3>
            <ul class="help-list">
                <li><strong>選ぶ</strong><span>手札のタイルをタップ。置いたときの形と行き先が、盤に出る</span></li>
                <li><strong>回す</strong><span>選んだタイルか、盤の光るマスか、回すボタンをタップ</span></li>
                <li><strong>決める</strong><span>「置く」。脱落する向きには ✕ が付く</span></li>
            </ul>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        this.syncSelection(view);
        this.playEvents(view, prev);
        this.renderStatus(view);
        this.markHint();
        this.renderPlayers(view);
        this.renderBoard(view);
        this.renderHand(view);
        this.tick();
        if ($('#log').open) this.renderLog();
        if (view.over) this.recordLocalResult(view);
        if (view.over && !$('#result').open && !this.resultTimer && !this.resultShown) {
            const wait = Math.max(0, ...this.anims.map(a => a.start + a.dur - performance.now()));
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, wait + RESULT_DELAY_MS);
        }
        if (!view.over) this.resultShown = false;
    }

    // 手札が変わったら選択を外し、新しい手番では各タイルを「置ける向き」から始める
    syncSelection(view) {
        const hand = view.players[view.you]?.hand ?? [];
        if (this.selected !== null && !hand.includes(this.selected)) this.selected = null;
        if (view.phase !== 'place') this.markPick = null;
        if (this.myTurn('play') && this.rotTurn !== view.turn) {
            this.rotTurn = view.turn;
            hand.forEach(tile => {
                const first = view.moves.find(m => m.tile === tile && m.allowed && !m.out) ?? view.moves.find(m => m.tile === tile && m.allowed);
                this.rots.set(tile, first?.rot ?? 0);
            });
        }
    }

    renderStatus(view) {
        const me = view.players[view.you];
        const current = view.players[view.current];
        let text;
        if (view.over) {
            const names = view.winners.map(s => view.players[s].name).join('・');
            text = view.winners.length === 1 ? (view.winners[0] === view.you ? 'あなたの勝ち' : `${names}の勝ち`) : `引き分け（${names}）`;
        } else if (this.myTurn('place')) text = '縁の印に駒を置く';
        else if (this.myTurn('play')) text = view.moves.every(m => m.out) ? 'どう置いても脱落' : 'タイルを置く';
        else text = `${me.alive ? '' : '脱落　'}${current.name}の番`;
        $('#status').innerHTML = `${view.over ? '' : dotHtml(view.current)}<span>${escapeHtml(text)}</span>`;
        $('#pile').innerHTML = `<span class="pile-ico" aria-hidden="true"></span>${view.pileCount}`;
    }

    renderPlayers(view) {
        const el = $('#players');
        el.dataset.count = view.players.length;
        el.innerHTML = view.players.map(p => {
            const cls = [p.id === view.current && !view.over ? 'current' : '', p.alive ? '' : 'out', view.winners?.includes(p.id) ? 'win' : ''].join(' ');
            const hand = p.alive ? `<span class="count" title="手札">${p.handCount}</span>` : '<span class="x" aria-label="脱落">✕</span>';
            return `<div class="chip ${cls}">${dotHtml(p.id)}<span class="name">${escapeHtml(p.name)}</span>${view.dragon === p.id ? dragonBadge() : ''}${hand}</div>`;
        }).join('');
    }

    renderBoard(view) {
        const svg = $('#board');
        svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${BOARD + PAD * 2} ${BOARD + PAD * 2}`);
        const now = performance.now();
        const animating = new Map(this.anims.filter(a => now < a.start + a.dur).map(a => [a.seat, a]));
        const parts = [];
        parts.push(`<rect x="${-PAD}" y="${-PAD}" width="${BOARD + PAD * 2}" height="${BOARD + PAD * 2}" rx="14" class="board-frame"/>`);
        parts.push(`<rect x="0" y="0" width="${BOARD}" height="${BOARD}" class="board-face"/>`);
        parts.push(`<circle cx="${BOARD / 2}" cy="${BOARD / 2}" r="${BOARD * 0.36}" class="enso"/>`);
        for (let i = 1; i < SIZE; i++) parts.push(`<path d="M${i * U} 0V${BOARD}M0 ${i * U}H${BOARD}" class="grid"/>`);
        // 縁の印
        START_MARKS.forEach(({ cell, p }) => {
            const [x, y] = pointXY(cell, p);
            const [ox, oy] = OUTWARD[SIDE[p]];
            parts.push(`<path d="M${x} ${y}l${ox * 10} ${oy * 10}" class="mark"/>`);
        });
        // 置いたタイル
        view.board.forEach((b, cell) => {
            if (b) parts.push(tileGroup(b.tile, b.rot, colOf(cell) * U, rowOf(cell) * U, { cls: cell === this.freshCell && animating.size ? 'fresh' : '' }));
        });
        // 自分の番：駒の前のマスと、選んだタイルの下見
        let preview = [];
        if (this.myTurn('play')) {
            const me = view.players[view.you];
            const cell = me.pos.cell;
            const move = this.currentMove();
            if (move) {
                parts.push(tileGroup(move.tile, move.rot, colOf(cell) * U, rowOf(cell) * U, { cls: `ghost ${move.allowed ? '' : 'bad'}` }));
                const board = view.board.map(b => b ? { tile: b.tile, rot: b.rot } : null);
                const markers = view.players.filter(p => p.alive && p.pos).map(p => ({ seat: p.id, pos: p.pos }));
                preview = simulate(board, markers, cell, { tile: move.tile, rot: move.rot });
            }
            parts.push(`<rect x="${colOf(cell) * U + 2}" y="${rowOf(cell) * U + 2}" width="${U - 4}" height="${U - 4}" rx="7" class="target ${move ? 'has' : ''}"/>`);
        }
        // 通った道
        view.players.forEach(p => {
            if (!p.trail.length) return;
            const anim = animating.get(p.id);
            const old = anim ? p.trail.slice(0, p.trail.length - anim.segs.length) : p.trail;
            if (old.length) parts.push(`<path d="${trailPath(old)}" class="trail ${p.alive || anim ? '' : 'dead'}" stroke="${COLORS[p.id]}"/>`);
            if (anim) parts.push(`<path id="trail-new-${p.id}" d="${trailPath(anim.segs)}" class="trail" stroke="${COLORS[p.id]}"/>`);
        });
        // 下見の行き先
        preview.forEach(m => {
            parts.push(`<path d="${trailPath(m.segs)}" class="trail preview" stroke="${COLORS[m.seat]}"/>`);
            const last = m.segs.at(-1);
            const [x, y] = pointXY(last[0], last[2]);
            if (m.out) parts.push(`<g class="cross" transform="translate(${x} ${y})"><path d="M-11 -11L11 11M11 -11L-11 11"/></g>`);
            else parts.push(`<circle cx="${x}" cy="${y}" r="8" class="ghost-stone" stroke="${COLORS[m.seat]}"/>`);
        });
        // 駒を置く番：空いた印
        if (this.myTurn('place')) {
            view.freeMarks.forEach(mark => {
                const [x, y] = pointXY(START_MARKS[mark].cell, START_MARKS[mark].p);
                parts.push(`<circle cx="${x}" cy="${y}" r="${mark === this.markPick ? 12 : 7}" class="free ${mark === this.markPick ? 'picked' : ''}"/>`);
            });
            if (this.markPick !== null) {
                const [x, y] = pointXY(START_MARKS[this.markPick].cell, START_MARKS[this.markPick].p);
                parts.push(stoneSvg(view.you, x, y, { cls: 'pending' }));
            }
        }
        // 駒
        view.players.forEach(p => {
            if (!p.pos) return;
            const anim = animating.get(p.id);
            const [x, y] = pointXY(p.pos.cell, p.pos.p);
            const cls = [p.alive ? '' : 'dead', p.id === view.current && !view.over && p.alive ? 'turn' : ''].join(' ');
            parts.push(stoneSvg(p.id, x, y, { cls, id: `stone-${p.id}` }));
            if (!p.alive) parts.push(`<g class="cross ${anim ? 'later' : ''}" id="cross-${p.id}" transform="translate(${x} ${y})"><path d="M-9 -9L9 9M9 -9L-9 9"/></g>`);
        });
        svg.innerHTML = parts.join('');
        svg.classList.toggle('placing', this.myTurn('place'));
    }

    renderHand(view) {
        const me = view.players[view.you];
        const hand = me.hand ?? [];
        const mine = this.myTurn('play');
        const slots = [];
        for (let i = 0; i < 3; i++) {
            const tile = hand[i];
            if (tile === undefined) {
                slots.push('<span class="hand-slot empty"></span>');
                continue;
            }
            const rot = this.rots.get(tile) ?? 0;
            const move = mine ? view.moves.find(m => m.tile === tile && m.rot === rotKey(tile, rot)) : null;
            const cls = [this.selected === tile ? 'selected' : '', move && !move.allowed ? 'bad' : '', move?.out && move.allowed ? 'risky' : '', mine && this.selected === null ? 'can' : ''].join(' ');
            slots.push(`<button class="hand-slot ${cls}" data-tile="${tile}" aria-label="タイル">${tileSvg(tile, rot)}${move && move.out ? '<b class="warn" aria-hidden="true">✕</b>' : ''}</button>`);
        }
        $('#hand').innerHTML = slots.join('');
        $('#hand').classList.toggle('idle', !mine);
        const confirm = $('#confirm');
        if (this.myTurn('place')) {
            confirm.disabled = this.markPick === null;
            $('#rotate').disabled = true;
        } else {
            const move = mine ? this.currentMove() : null;
            confirm.disabled = !move || !move.allowed;
            $('#rotate').disabled = !mine || !hand.length;
        }
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        this.hintCommand = null;
        this.playSound(view, prev, fresh);
        const now = performance.now();
        fresh.forEach(e => {
            if (e.type === 'play') {
                this.freshCell = e.cell;
                if (reduceMotion()) return;
                this.anims = this.anims.filter(a => !e.moves.some(m => m.seat === a.seat));
                e.moves.forEach(m => {
                    this.anims.push({ seat: m.seat, segs: m.segs, start: now, dur: Math.min(MOVE_MS_MAX, 250 + m.segs.length * MOVE_MS_PER_SEG) });
                });
            }
            if (e.type === 'dragon' && e.seat === view.you) this.toast('山が空です。竜のタイルを取りました');
        });
    }

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、自分の番になったら turn、終わりは勝ち負け
    playSound(view, prev, fresh) {
        const me = view.you;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(me) ? 'win' : 'lose');
        const play = fresh.find(e => e.type === 'play' && e.seat === me);
        if (play) {
            const out = play.moves.filter(m => m.out).map(m => m.seat);
            if (out.includes(me)) return music.play('pay');
            return music.play(out.length ? 'capture' : 'place');
        }
        if (fresh.some(e => e.type === 'place' && e.seat === me)) return music.play('place');
        if (fresh.some(e => e.type === 'dragon' && e.seat === me)) return music.play('draw');
        if (fresh.some(e => e.type === 'play' && e.moves.some(m => m.seat === me && m.out))) return music.play('pay');
        if (view.current === me && prev.current !== me && !view.over) music.play('turn');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.view ? suggest(this.view) : null;
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        // おすすめの印・タイルと向きを選んだ状態にする（「置く」で決められる）
        if (command.type === 'place') this.markPick = command.mark;
        if (command.type === 'play') {
            this.selected = command.tile;
            this.rots.set(command.tile, command.rotation);
        }
        this.render();
        this.toast(command.type === 'place' ? 'おすすめ：光っている印に駒を置く' : 'おすすめ：選んだタイルをこの向きで置く');
    }

    markHint() {
        $('#confirm').classList.toggle('recommended', !!this.hintCommand);
    }

    // 駒を道に沿って動かし、道を少しずつ色でなぞる
    tick() {
        cancelAnimationFrame(this.raf);
        const now = performance.now();
        let running = false;
        this.anims.forEach(a => {
            const path = document.getElementById(`trail-new-${a.seat}`);
            const stone = document.getElementById(`stone-${a.seat}`);
            const t = Math.min(1, (now - a.start) / a.dur);
            const ease = 1 - (1 - t) * (1 - t);
            if (path) {
                const len = path.getTotalLength();
                path.style.strokeDasharray = `${len}`;
                path.style.strokeDashoffset = `${len * (1 - ease)}`;
                if (stone) {
                    const pt = path.getPointAtLength(len * ease);
                    stone.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
                }
            }
            if (t >= 1) document.getElementById(`cross-${a.seat}`)?.classList.remove('later');
            else running = true;
        });
        this.anims = this.anims.filter(a => now < a.start + a.dur + 50);
        if (running) this.raf = requestAnimationFrame(() => this.tick());
    }

    // ---- ダイアログ ----

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-200).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）。1台で複数の人が遊ぶ対戦は送らない
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !controller.game) return;
        const { players, options } = controller.game;
        if (players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({ game: GAME, id: `${GAME}-${options.seed}`, outcome: outcomeFromWinners(view.winners, view.you, view.players.length) });
    }

    showResult() {
        const v = this.view;
        if (!v || !v.over) return;
        this.resultShown = true;
        const names = v.winners.map(s => v.players[s].name).join('・');
        $('#result-title').textContent = v.winners.length > 1 ? `引き分け` : (v.winners[0] === v.you ? 'あなたの勝ち' : `${names}の勝ち`);
        // 勝った人、続いて長く残った順
        const order = [...v.players].sort((a, b) => {
            const wa = v.winners.includes(a.id) ? 1 : 0;
            const wb = v.winners.includes(b.id) ? 1 : 0;
            if (wa !== wb) return wb - wa;
            return (b.outTurn ?? 99) - (a.outTurn ?? 99);
        });
        $('#result-list').innerHTML = order.map(p => {
            const won = v.winners.includes(p.id);
            const note = won ? (v.winners.length > 1 ? '引き分け' : '勝ち') : `${p.outTurn}手目に${p.out === 'edge' ? '盤の外へ' : '衝突'}`;
            return `<li class="${won ? 'win' : ''}">${dotHtml(p.id)}<span class="name">${escapeHtml(p.name)}</span><span class="note">${note}</span></li>`;
        }).join('');
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}

