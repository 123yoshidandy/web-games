/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 操作：下の段でタイル・指導者・大災害・交換・見送りを選ぶと、盤の置けるマスが光る。
 * 盤を押すと、押した点にいちばん近い置けるマスに下書きが出る（縦持ちでマスが小さくても置きやすいように）。
 * 「決定」か、同じマスをもう一度押して確定する。盤の自分の指導者を押すと、動かすか手元に戻すかを選べる。
 * 虫眼鏡のボタンで盤を2倍にし、指でスクロールして見られる
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { COLORS, COLOR_INFO, DYNASTIES } from './data.js';
import { COLS, ROWS, CELL_COUNT, RIVER, rowOf, colOf, squareCells } from './board.js';
import { finalValues, compareFinal, cellName } from './game.js';
import { simFromView, cloneSim, tileCells, leaderCells, catastropheCells } from './sim.js';
import {
    symbolsSvg, icon, tileShape, treasureShape, leaderShape, catastropheShape, monumentShape,
    tileSvg, leaderSvg, dynastySvg, treasureSvg, monumentSvg, SEAT_COLORS
} from './art.js';

const SETTINGS_KEY = 'tigris-euphrates.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 1400;
const U = 10;            // 1マスの大きさ（盤の座標）
const SNAP = 1.6;        // 置けるマスへ吸い付ける距離（マスの数）

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const xy = (cell) => ({ x: colOf(cell) * U, y: rowOf(cell) * U });

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4].includes(saved.count) ? saved.count : 2,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 2, level: 'easy' };
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
        this.sim = null;
        this.lastSeq = 0;
        this.sel = null;       // 選んでいるもの { kind: 'tile' | 'leader' | 'cat' | 'swap' | 'pass', color, picked }
        this.target = null;    // 下書きのマス
        this.support = null;   // 争いで出す枚数 { key, count }
        this.zoomed = false;
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'チグリス・ユーフラテス',
            game: 'tigris-euphrates',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 700,
            minPlayers: 2,
            maxPlayers: 4,
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
            // 保存が壊れていたら消して、タイトルに戻る
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
        this.sel = null;
        this.target = null;
        this.support = null;
        this.setZoom(false);
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.lastSeq = view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は知らせない
        this.render();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
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
        const segment = (selector, attr, apply) => $(selector).addEventListener('click', (event) => {
            const button = event.target.closest(`button[${attr}]`);
            if (!button) return;
            apply(button.getAttribute(attr));
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#player-count', 'data-count', (v) => { this.settings.count = Number(v); });
        segment('#cpu-level', 'data-level', (v) => { this.settings.level = v; });
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
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle())); // オンラインは確かめてから部屋を出る
        $('#zoom').addEventListener('click', () => this.setZoom(!this.zoomed));
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', () => this.showLog());

        // ダイアログは外側のタップと「閉じる」で閉じる
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#board').addEventListener('click', (event) => this.tapBoard(event));
        $('#dock').addEventListener('click', (event) => this.tapDock(event));
    }

    send(command) {
        const ok = this.controller?.send(command);
        if (ok) {
            this.sel = null;
            this.target = null;
        }
        return ok;
    }

    setZoom(on) {
        this.zoomed = on;
        $('#board-wrap').classList.toggle('zoomed', on);
        $('#zoom').innerHTML = icon(on ? 'zoomOut' : 'zoomIn');
        $('#zoom').setAttribute('aria-label', on ? '盤を小さく' : '盤を大きく');
        if (on) this.scrollToCell(this.target ?? (Math.floor(ROWS / 2) * COLS + COLS / 2));
    }

    scrollToCell(cell) {
        const wrap = $('#board-wrap');
        const svg = $('#board');
        const scale = Math.min(svg.clientWidth / (COLS * U), svg.clientHeight / (ROWS * U));
        const offsetX = (svg.clientWidth - COLS * U * scale) / 2;
        const offsetY = (svg.clientHeight - ROWS * U * scale) / 2;
        const { x, y } = xy(cell);
        wrap.scrollLeft = offsetX + (x + U / 2) * scale - wrap.clientWidth / 2;
        wrap.scrollTop = offsetY + (y + U / 2) * scale - wrap.clientHeight / 2;
    }

    // ---- 状態 ----

    me() {
        return this.view.players[this.view.you];
    }

    waitingFor(phase) {
        const v = this.view;
        return !!v && v.phase === phase && v.answering.includes(v.you);
    }

    // 選んでいるものを置けるマス
    legalCells() {
        const s = this.sel;
        if (!s || !this.waitingFor('action')) return new Set();
        if (!this.legalCache || this.legalCache.key !== this.selKey()) {
            const me = this.view.you;
            let cells = [];
            if (s.kind === 'tile') cells = tileCells(this.sim, me, s.color);
            else if (s.kind === 'leader') cells = leaderCells(this.sim, me, s.color);
            else if (s.kind === 'cat') cells = catastropheCells(this.sim, me);
            this.legalCache = { key: this.selKey(), cells: new Set(cells) };
        }
        return this.legalCache.cells;
    }

    selKey() {
        return `${this.view.events.at(-1)?.seq}:${this.sel?.kind}:${this.sel?.color}`;
    }

    // 決めようとしている操作
    pendingCommand() {
        const s = this.sel;
        if (!s) return null;
        if (s.kind === 'swap') {
            const hand = this.me().hand;
            return s.picked.length ? { type: 'swap', tiles: s.picked.map(i => hand[i]) } : null;
        }
        if (s.kind === 'pass') return { type: 'pass' };
        if (this.target === null || !this.legalCells().has(this.target)) return null;
        if (s.kind === 'tile') return { type: 'tile', color: s.color, cell: this.target };
        if (s.kind === 'leader') return { type: 'leader', color: s.color, cell: this.target };
        if (s.kind === 'cat') return { type: 'catastrophe', cell: this.target };
        return null;
    }

    // 操作を試した結果（ビューの写しで）
    preview(command) {
        const sim = cloneSim(this.sim);
        const me = this.view.you;
        const before = sim.players.map(p => COLORS.reduce((s, c) => s + p.scores[c], 0));
        if (!sim.applyCommand(me, command)) return { ok: false, text: sim.lastError };
        if (sim.phase === 'support') {
            const c = sim.conflict;
            return { ok: true, text: `${c.kind === 'revolt' ? '内乱' : '外乱'}になります（${COLOR_INFO[c.leaderColor].leader}）` };
        }
        if (sim.phase === 'warOrder') return { ok: true, text: `外乱になります（${sim.war.pending.map(f => COLOR_INFO[f.color].leader).join('・')}）` };
        const gains = sim.players.map((p, i) => ({ i, d: COLORS.reduce((s, c) => s + p.scores[c], 0) - before[i] })).filter(g => g.d > 0);
        if (command.type === 'tile') {
            const myGain = gains.find(g => g.i === me);
            if (myGain) return { ok: true, html: `<span class="gain">${tileSvg(command.color)}+1</span>` };
            if (gains.length) return { ok: true, text: `${this.view.players[gains[0].i].name}に1点` };
            return { ok: true, text: sim.phase === 'monument' ? '記念碑を建てられます' : '点なし' };
        }
        if (command.type === 'catastrophe') {
            const lost = COLORS.flatMap(color => sim.players.filter(p => this.view.players[p.id].leaders[color] !== null && p.leaders[color] === null).map(p => `${p.name}の${COLOR_INFO[color].leader}`));
            const broken = this.view.board[command.cell] ? `${COLOR_INFO[this.view.board[command.cell].color].tile}を壊します` : '空きマスをふさぎます';
            return { ok: true, text: lost.length ? `${broken}（${lost.join('・')}が退く）` : broken };
        }
        if (command.type === 'leader') return { ok: true, text: `${cellName(command.cell)}に置く` };
        return { ok: true, text: '' };
    }

    // ---- 盤の操作 ----

    tapBoard(event) {
        if (!this.view) return;
        const p = this.toBoard(event);
        if (!p) return;
        const col = Math.floor(p.x / U);
        const row = Math.floor(p.y / U);
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
        const cell = row * COLS + col;
        if (!this.waitingFor('action')) return;
        const legal = this.legalCells();
        const x = this.view.board[cell];
        // 自分の指導者を押したら、動かす・戻すを選ぶ
        if (x?.kind === 'leader' && x.seat === this.view.you && !legal.has(cell)) {
            this.sel = { kind: 'leader', color: x.color };
            this.target = null;
            this.render();
            return;
        }
        if (!legal.size) return;
        let pick = legal.has(cell) ? cell : null;
        if (pick === null) {
            // いちばん近い置けるマスに吸い付ける
            let best = Infinity;
            legal.forEach(c => {
                const d = Math.hypot((colOf(c) + 0.5) - p.x / U, (rowOf(c) + 0.5) - p.y / U);
                if (d < best) {
                    best = d;
                    pick = c;
                }
            });
            if (best > SNAP) pick = null;
        }
        if (pick === null) return;
        if (pick === this.target) {
            this.confirm();
            return;
        }
        this.target = pick;
        music.play('select');
        this.render();
    }

    toBoard(event) {
        const svg = $('#board');
        const m = svg.getScreenCTM();
        if (!m) return null;
        const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
        return { x: pt.x, y: pt.y };
    }

    confirm() {
        const command = this.pendingCommand();
        if (command) this.send(command);
    }

    tapDock(event) {
        const b = event.target.closest('button');
        if (!b || b.disabled || !this.view) return;
        const { act, index, color } = b.dataset;
        const before = JSON.stringify(this.sel);
        if (act === 'hand') {
            const i = Number(index);
            if (this.sel?.kind === 'swap') {
                const picked = this.sel.picked;
                this.sel.picked = picked.includes(i) ? picked.filter(x => x !== i) : [...picked, i];
            } else {
                const c = this.me().hand[i];
                this.sel = this.sel?.kind === 'tile' && this.sel.color === c ? null : { kind: 'tile', color: c };
                this.keepTarget();
            }
        } else if (act === 'leader') {
            this.sel = this.sel?.kind === 'leader' && this.sel.color === color ? null : { kind: 'leader', color };
            this.keepTarget();
        } else if (act === 'cat') {
            this.sel = this.sel?.kind === 'cat' ? null : { kind: 'cat' };
            this.keepTarget();
        } else if (act === 'swap') {
            this.sel = this.sel?.kind === 'swap' ? null : { kind: 'swap', picked: [] };
            this.target = null;
        } else if (act === 'pass') {
            this.sel = this.sel?.kind === 'pass' ? null : { kind: 'pass' };
            this.target = null;
        } else if (act === 'withdraw') {
            this.send({ type: 'withdraw', color });
        } else if (act === 'confirm') {
            this.confirm();
            return;
        } else if (act === 'minus' || act === 'plus') {
            const have = this.me().hand.filter(x => x === this.view.conflict.color).length;
            this.support.count = Math.max(0, Math.min(have, this.support.count + (act === 'plus' ? 1 : -1)));
            music.play('select');
        } else if (act === 'support') {
            this.send({ type: 'support', count: this.support.count });
            return;
        } else if (act === 'war') {
            this.send({ type: 'war', color });
            return;
        } else if (act === 'monument') {
            this.send({ type: 'monument', cell: this.view.monumentChoice.squares[Number(b.dataset.square)], monument: Number(b.dataset.monument) });
            return;
        } else if (act === 'skip') {
            this.send({ type: 'skip' });
            return;
        }
        // 選ぶ・外す音（手札・指導者・災害・交換・パス）
        if (['hand', 'leader', 'cat', 'swap', 'pass'].includes(act)) music.play(this.sel && JSON.stringify(this.sel) !== before ? 'select' : 'cancel');
        this.render();
    }

    // 選び直したとき、下書きのマスがまだ使えるなら残す
    keepTarget() {
        this.legalCache = null;
        if (this.target !== null && !(this.sel && this.legalCellsFresh().has(this.target))) this.target = null;
    }

    legalCellsFresh() {
        this.legalCache = null;
        return this.legalCells();
    }

    // ---- タイトル ----

    renderSetup() {
        const s = this.settings;
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === s.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === s.level)));
    }

    // 盤の一部：川・宝物の神殿・指導者・記念碑
    renderTitleArt() {
        const W = 9;
        const H = 4;
        const river = new Set([3, 4, 13, 22, 23, 32, 33]);
        let body = '';
        for (let i = 0; i < W * H; i++) {
            body += `<rect class="${river.has(i) ? 'river' : 'land'}" x="${(i % W) * U}" y="${Math.floor(i / W) * U}" width="${U}" height="${U}"/>`;
        }
        const at = (i) => [(i % W) * U, Math.floor(i / W) * U];
        [[1, 'red'], [10, 'black'], [11, 'black'], [19, 'red'], [20, 'green'], [13, 'blue'], [22, 'blue'], [24, 'green'], [26, 'red']]
            .forEach(([i, c]) => { body += tileShape(c, ...at(i)); });
        body += treasureShape(...at(1)) + treasureShape(...at(26));
        body += leaderShape('black', 0, 'lion', ...at(2)) + leaderShape('red', 1, 'bull', ...at(28)) + leaderShape('green', 0, 'lion', ...at(25));
        body += monumentShape(['red', 'blue'], ...at(6));
        $('#title-art').innerHTML = `<svg viewBox="-1 -1 ${W * U + 2} ${H * U + 2}"><rect class="frame" x="-1" y="-1" width="${W * U + 2}" height="${H * U + 2}" rx="2"/>${body}</svg>`;
    }

    renderHelp() {
        const t = (c) => `<span class="help-chip">${tileSvg(c)}${COLOR_INFO[c].tile}（${COLOR_INFO[c].leader}）</span>`;
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>4色（${COLORS.map(c => COLOR_INFO[c].name).join('・')}）の点を集めます。最後に比べるのは<strong>いちばん低い色の点</strong>。宝物は好きな色に足せます。同じなら次に低い色で比べます。点は自分にしか見えません。</p>
            <div class="help-chips">${COLORS.map(t).join('')}</div>
            <h3>手番</h3>
            <p>アクションを2回します。手番の終わりに手札を6枚に補充します。</p>
            <p><strong>タイルを置く</strong>：農地（青）は川だけ、ほかは陸だけ。指導者のいる地域（王国）に置くと、同じ色の指導者の持ち主がその色の1点。いなければ王の持ち主が1点。</p>
            <p><strong>指導者を置く・動かす</strong>：神殿（赤）のとなりの空いた陸に。2つの王国をつなぐ場所には置けません。盤の自分の指導者を押すと、動かすか手元に戻せます。</p>
            <p><strong>大災害</strong>（2回まで）：タイルを壊すか、空きマスをふさぎます。指導者・記念碑・宝物には置けません。神殿を失った指導者は手元に戻ります。</p>
            <p><strong>交換</strong>：手札を1〜6枚捨てて引き直します。</p>
            <h3>内乱</h3>
            <p>同じ色の指導者がいる王国に指導者を置くと内乱。強さは<strong>となりの神殿の数</strong>＋手札から出した神殿。攻める側が先に出し、同点は守る側の勝ち。負けた指導者は手元に戻り、勝った側は赤1点。出したタイルは捨てます。</p>
            <h3>外乱</h3>
            <p>タイルで2つの王国をつなぎ、両方に同じ色の指導者がいると外乱。強さは<strong>自分の側の王国のその色のタイルの数</strong>＋手札から出した同じ色。負けた指導者と、負けた側のその色のタイルが取り除かれ（宝物の神殿と、ほかの指導者を支える神殿は残る）、勝った側はその数＋1点。</p>
            <h3>記念碑と宝物</h3>
            <p>同じ色のタイルが2×2にそろったら、記念碑を建てられます。手番の終わりに、記念碑の色の指導者がその王国にいれば、その色の1点。</p>
            <p>宝物が2つ以上ある王国に商人（緑）がいると、その持ち主が1つを残して取ります。</p>
            <h3>終わり</h3>
            <p>盤の宝物が2つ以下になるか、袋のタイルで補充できなくなったら終わりです。</p>
            <h3>操作</h3>
            <p>下でタイルや指導者を選ぶと、置けるマスが光ります。盤を押すと近くの置けるマスに下書きが出るので、「決定」か同じマスをもう一度押します。虫眼鏡で盤を大きくできます。</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        this.sim = simFromView(view);
        this.legalCache = null;
        if (!this.waitingFor('action')) {
            this.sel = null;
            this.target = null;
        } else if (this.sel?.kind === 'leader' && !COLORS.includes(this.sel.color)) {
            this.sel = null;
        } else if (this.sel?.kind === 'tile' && !this.me().hand.includes(this.sel.color)) {
            this.sel = null;
        } else if (this.sel?.kind === 'cat' && this.me().catastrophes <= 0) {
            this.sel = null;
        }
        if (this.target !== null && !this.legalCells().has(this.target)) this.target = null;
        // 争いで出す枚数の初期値：守るときは同点にできる分、攻めるときは0
        if (this.waitingFor('support')) {
            const c = view.conflict;
            const key = `${view.events.findLast(e => e.type === 'conflict')?.seq}:${c.attacker.commit === null ? 'a' : 'd'}`;
            if (this.support?.key !== key) {
                const have = this.me().hand.filter(x => x === c.color).length;
                const need = c.attacker.commit === null ? 0 : Math.max(0, c.attacker.base + c.attacker.commit - c.defender.base);
                this.support = { key, count: need <= have ? need : 0 };
            }
        }
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (prev) this.playSound(view, prev, fresh);
        if (fresh.length) this.hintCommand = null;
        this.renderStatus(view);
        this.renderOthers(view);
        this.renderBoard(view);
        this.renderMine(view);
        this.renderNote(view);
        this.renderDock(view);
        this.markHint();
        this.announce(view, fresh);
        if ($('#log').open) this.renderLog();
        if (view.phase === 'end' && !$('#result').open && !this.resultTimer && !this.resultShown) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
        if (view.phase !== 'end') this.resultShown = false;
    }

    dynasty(seat) {
        return DYNASTIES[seat].key;
    }

    renderStatus(view) {
        let text = '';
        if (view.phase !== 'end') {
            const who = view.current === view.you ? 'あなたの番' : `${escapeHtml(view.players[view.current].name)}の番`;
            const dots = Array.from({ length: 2 }, (_, i) => `<i class="${i < view.actionsLeft ? 'on' : ''}"></i>`).join('');
            text = `${who}<span class="dots" aria-label="残りのアクション ${view.actionsLeft}">${dots}</span>`;
        } else {
            text = '終わり';
        }
        $('#status').innerHTML = `<span class="who">${text}</span><span class="counts"><span title="盤の宝物">${treasureSvg()}${view.treasures.length}</span><span title="袋">袋 ${view.bagCount}</span></span>`;
    }

    renderOthers(view) {
        $('#others').innerHTML = view.players.filter(p => p.id !== view.you).map(p => {
            const current = view.phase !== 'end' && (view.current === p.id || view.answering.includes(p.id));
            return `<div class="other ${current ? 'current' : ''}" style="--seat:${SEAT_COLORS[p.id]}">
                ${dynastySvg(this.dynasty(p.id), p.id)}<span class="name">${escapeHtml(p.name)}</span>
                <span class="meta"><span class="hand-count" title="手札">${p.handCount}</span><span class="cats" title="大災害">${'<i></i>'.repeat(p.catastrophes)}</span></span>
            </div>`;
        }).join('');
    }

    renderBoard(view) {
        $('#board').setAttribute('viewBox', `-1 -1 ${COLS * U + 2} ${ROWS * U + 2}`);
        if (!this.cellsDrawn) {
            let cells = `<rect class="frame" x="-1" y="-1" width="${COLS * U + 2}" height="${ROWS * U + 2}" rx="2"/>`;
            for (let c = 0; c < CELL_COUNT; c++) {
                const { x, y } = xy(c);
                cells += `<rect class="${RIVER.has(c) ? 'river' : 'land'}" x="${x}" y="${y}" width="${U}" height="${U}"/>`;
            }
            $('#cells').innerHTML = cells;
            this.cellsDrawn = true;
        }
        const recent = this.recentCells(view);
        let pieces = '';
        const drawnMon = new Set();
        view.board.forEach((x, c) => {
            if (!x) return;
            const { x: px, y: py } = xy(c);
            const cls = recent.has(c) ? 'recent' : '';
            if (x.kind === 'tile') {
                pieces += tileShape(x.color, px, py, cls);
                if (view.treasures.includes(c)) pieces += treasureShape(px, py);
            } else if (x.kind === 'leader') {
                pieces += leaderShape(x.color, x.seat, this.dynasty(x.seat), px, py, cls);
            } else if (x.kind === 'cat') {
                pieces += catastropheShape(px, py);
            } else if (x.kind === 'mon' && !drawnMon.has(x.id)) {
                drawnMon.add(x.id);
                const m = view.monuments[x.id];
                const top = xy(m.cell);
                pieces += monumentShape(m.colors, top.x, top.y);
                squareCells(m.cell).forEach(cell => { if (view.treasures.includes(cell)) pieces += treasureShape(xy(cell).x, xy(cell).y); });
            }
        });
        $('#pieces').innerHTML = pieces;
        // 光るマス・下書き・争いの印
        let marks = '';
        const legal = this.legalCells();
        legal.forEach(c => {
            const { x, y } = xy(c);
            marks += `<rect class="hint" x="${x + 0.8}" y="${y + 0.8}" width="${U - 1.6}" height="${U - 1.6}" rx="1.4"/>`;
        });
        if (this.target !== null && this.sel) {
            const { x, y } = xy(this.target);
            const s = this.sel;
            const ghost = s.kind === 'tile' ? tileShape(s.color, x, y) : s.kind === 'leader' ? leaderShape(s.color, view.you, this.dynasty(view.you), x, y) : s.kind === 'cat' ? catastropheShape(x, y) : '';
            marks += `<g class="ghost">${ghost}</g><rect class="target" x="${x + 0.3}" y="${y + 0.3}" width="${U - 0.6}" height="${U - 0.6}" rx="1.6"/>`;
        }
        if (this.sel?.kind === 'leader' && view.players[view.you].leaders[this.sel.color] !== null) {
            const { x, y } = xy(view.players[view.you].leaders[this.sel.color]);
            marks += `<rect class="picked" x="${x + 0.3}" y="${y + 0.3}" width="${U - 0.6}" height="${U - 0.6}" rx="5"/>`;
        }
        if (view.war) {
            const { x, y } = xy(view.war.cell);
            marks += `<rect class="unify" x="${x + 0.3}" y="${y + 0.3}" width="${U - 0.6}" height="${U - 0.6}" rx="1.6"/>`;
        }
        if (view.conflict) {
            [view.conflict.attacker.cell, view.conflict.defender.cell].forEach(cell => {
                const { x, y } = xy(cell);
                marks += `<circle class="fight" cx="${x + U / 2}" cy="${y + U / 2}" r="${U / 2}"/>`;
            });
        }
        if (view.monumentChoice) {
            view.monumentChoice.squares.forEach(top => {
                const { x, y } = xy(top);
                marks += `<rect class="square" x="${x + 0.3}" y="${y + 0.3}" width="${2 * U - 0.6}" height="${2 * U - 0.6}" rx="2"/>`;
            });
        }
        $('#marks').innerHTML = marks;
    }

    // 前の手番と今の手番に動いたマス
    recentCells(view) {
        const events = view.events;
        let turns = 0;
        let start = 0;
        for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].type === 'turn' && ++turns === 2) {
                start = i + 1;
                break;
            }
        }
        const out = new Set();
        events.slice(start).forEach(e => {
            if (['tile', 'leader', 'catastrophe'].includes(e.type) && e.cell !== undefined) out.add(e.cell);
            if (e.type === 'monument') squareCells(e.cell).forEach(c => out.add(c));
        });
        return out;
    }

    renderMine(view) {
        const me = this.me();
        const chips = COLORS.map(c => `<span class="chip">${tileSvg(c)}<b>${me.scores[c]}</b></span>`).join('');
        $('#mine').innerHTML = `${dynastySvg(this.dynasty(view.you), view.you)}<span class="chips">${chips}<span class="chip">${treasureSvg()}<b>${me.treasures}</b></span></span>`;
    }

    renderNote(view) {
        let text = '';
        if (view.phase === 'end') {
            text = '';
        } else if (this.waitingFor('action')) {
            const s = this.sel;
            const command = this.pendingCommand();
            if (!s) text = 'タイルか指導者を選ぶ';
            else if (s.kind === 'swap') text = s.picked.length ? `${s.picked.length}枚を取り替える` : '取り替えるタイルを選ぶ';
            else if (s.kind === 'pass') text = 'このアクションを見送る';
            else if (!command) {
                if (s.kind === 'leader' && this.me().leaders[s.color] !== null) text = '動かす先を選ぶか、手元に戻す';
                else if (!this.legalCells().size) text = '置ける場所がありません';
                else text = '置くマスを選ぶ';
            } else {
                const r = this.preview(command);
                text = r.html ?? escapeHtml(r.text ?? '');
            }
        } else if (view.phase === 'support') {
            const c = view.conflict;
            const side = (x, open) => `${escapeHtml(view.players[x.seat].name)} ${x.base}${x.commit !== null ? `+${x.commit}` : open ? '+?' : ''}`;
            text = `${c.kind === 'revolt' ? '内乱' : '外乱'}（${COLOR_INFO[c.leaderColor].leader}）　${side(c.attacker, true)} 対 ${side(c.defender, c.attacker.commit !== null)}`;
        } else if (this.waitingFor('warOrder')) {
            text = 'どの争いから始めるか選ぶ';
        } else if (this.waitingFor('monument')) {
            text = '記念碑を建てますか';
        } else {
            text = `${escapeHtml(view.players[view.answering[0]]?.name ?? '')}が考えています`;
        }
        $('#note').innerHTML = text;
    }

    renderDock(view) {
        const me = this.me();
        let top = '';
        let bottom = '';
        if (this.waitingFor('support')) {
            const c = view.conflict;
            const attacking = c.attacker.commit === null;
            const mine = attacking ? c.attacker : c.defender;
            const other = attacking ? c.defender : c.attacker;
            const have = me.hand.filter(x => x === c.color).length;
            const total = mine.base + this.support.count;
            const otherText = attacking ? `${other.base}+?` : `${other.base + other.commit}`;
            top = `<div class="fight-box"><span>${attacking ? '攻め' : '守り'}</span><b>${total}</b><span class="vs">対</span><b>${otherText}</b><span class="hint-text">${COLOR_INFO[c.color].tile}を出す（${have}枚まで）</span></div>`;
            bottom = `<button class="icon-btn big" data-act="minus" ${this.support.count <= 0 ? 'disabled' : ''} aria-label="減らす">−</button>
                <span class="count">${tileSvg(c.color)}<b>${this.support.count}</b></span>
                <button class="icon-btn big" data-act="plus" ${this.support.count >= have ? 'disabled' : ''} aria-label="増やす">＋</button>
                <button class="btn primary small" data-act="support">出す</button>`;
        } else if (this.waitingFor('warOrder')) {
            top = '<div class="dock-text">外乱の順番</div>';
            bottom = view.war.pending.map(f => `<button class="btn secondary small choice" data-act="war" data-color="${f.color}">${leaderSvg(f.color, view.you, this.dynasty(view.you))}${COLOR_INFO[f.color].leader}</button>`).join('');
        } else if (this.waitingFor('monument')) {
            const color = view.monumentChoice.color;
            top = '<div class="dock-text">記念碑</div>';
            bottom = view.monuments.map((m, id) => (m.cell === null && m.colors.includes(color)
                ? `<button class="btn secondary small choice mon" data-act="monument" data-monument="${id}" data-square="0" aria-label="${m.colors.map(x => COLOR_INFO[x].name).join('と')}の記念碑">${monumentSvg(m.colors)}</button>` : '')).join('')
                + '<button class="btn secondary small" data-act="skip">建てない</button>';
        } else {
            const acting = this.waitingFor('action');
            const s = this.sel;
            const hand = (me.hand ?? []).map((c, i) => {
                const on = s?.kind === 'swap' ? s.picked.includes(i) : s?.kind === 'tile' && s.color === c && me.hand.indexOf(c) === i;
                return `<button class="slot ${on ? 'selected' : ''}" data-act="hand" data-index="${i}" ${acting ? '' : 'disabled'} aria-label="${COLOR_INFO[c].tile}">${tileSvg(c)}</button>`;
            }).join('');
            const command = acting ? this.pendingCommand() : null;
            const onBoard = s?.kind === 'leader' && me.leaders[s.color] !== null;
            const label = s?.kind === 'swap' ? '取り替え' : s?.kind === 'pass' ? '見送る' : '決定';
            top = `<div class="hand">${hand}</div><div class="act">
                ${onBoard ? `<button class="btn secondary small" data-act="withdraw" data-color="${s.color}">戻す</button>` : ''}
                <button class="btn primary small" data-act="confirm" ${command ? '' : 'disabled'}>${label}</button></div>`;
            const leaders = COLORS.map(c => {
                const out = me.leaders[c] !== null;
                const on = s?.kind === 'leader' && s.color === c;
                return `<button class="slot leader-slot ${out ? 'out' : ''} ${on ? 'selected' : ''}" data-act="leader" data-color="${c}" ${acting ? '' : 'disabled'} aria-label="${COLOR_INFO[c].leader}${out ? '（盤の上）' : ''}">${leaderSvg(c, view.you, this.dynasty(view.you))}</button>`;
            }).join('');
            bottom = `<div class="leaders">${leaders}</div>
                <button class="slot tool ${s?.kind === 'cat' ? 'selected' : ''}" data-act="cat" ${acting && me.catastrophes > 0 ? '' : 'disabled'} aria-label="大災害（残り${me.catastrophes}）" title="大災害">${icon('catastrophe')}<small>${me.catastrophes}</small></button>
                <button class="slot tool ${s?.kind === 'swap' ? 'selected' : ''}" data-act="swap" ${acting ? '' : 'disabled'} aria-label="交換" title="交換">${icon('swap')}</button>
                <button class="slot tool ${s?.kind === 'pass' ? 'selected' : ''}" data-act="pass" ${acting ? '' : 'disabled'} aria-label="見送る" title="見送る">${icon('pass')}</button>`;
        }
        $('#dock-top').innerHTML = top;
        $('#dock-bottom').innerHTML = bottom;
    }

    // 争いの結果・宝物・記念碑を短く知らせる
    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、自分が答える番になったら turn、終わりは勝ち負け
    // CPU は1手ずつ速く打つので、CPU の手ごとには鳴らさない
    playSound(view, prev, fresh) {
        const me = view.you;
        if (fresh.length === 0) return;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(me) ? 'win' : 'lose');
        const resolve = fresh.findLast(e => e.type === 'resolve' && (e.winner === me || e.loser === me));
        if (resolve) return music.play(resolve.winner === me ? 'capture' : 'pay');
        const mine = fresh.filter(e => e.seat === me).map(e => e.type);
        if (mine.includes('catastrophe')) return music.play('capture');
        if (mine.includes('treasure') || mine.includes('monument')) return music.play('gain');
        if (mine.includes('tile') || mine.includes('leader')) return music.play('place');
        if (mine.includes('swap')) return music.play('shuffle');
        if (mine.includes('withdraw')) return music.play('cancel');
        if (view.answering.includes(me) && !prev.answering.includes(me)) music.play('turn');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.view ? suggest(this.view) : null;
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        // 置く手・交換・パスは、選んだ状態にする（「決める」で決められる）
        if (command.type === 'tile') this.sel = { kind: 'tile', color: command.color };
        if (command.type === 'leader') this.sel = { kind: 'leader', color: command.color };
        if (command.type === 'catastrophe') this.sel = { kind: 'cat' };
        if (['tile', 'leader', 'catastrophe'].includes(command.type)) this.target = command.cell;
        if (command.type === 'pass') {
            this.sel = { kind: 'pass' };
            this.target = null;
        }
        if (command.type === 'swap') {
            const used = new Set();
            const picked = command.tiles.map(color => this.me().hand.findIndex((c, i) => c === color && !used.has(i)));
            picked.forEach(i => used.add(i));
            this.sel = { kind: 'swap', picked };
            this.target = null;
        }
        if (command.type === 'support' && this.support) this.support.count = command.count;
        this.render();
        const text = {
            tile: '光っているマスにタイルを置く', leader: '光っているマスに指導者を置く', catastrophe: '光っているマスに災害を置く',
            swap: '選んだタイルを交換する', pass: 'パスする', support: `${command.count}枚出す`, war: '印の付いた争いから', monument: '印の付いた記念碑を建てる', skip: '記念碑を建てない'
        }[command.type] ?? '';
        this.toast(`おすすめ：${text}`);
    }

    // おすすめの手のボタンに印を付ける
    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const selector = {
            support: '[data-act="support"]', war: `[data-act="war"][data-color="${c.color}"]`, skip: '[data-act="skip"]',
            monument: `[data-act="monument"][data-monument="${c.monument}"]`
        }[c.type] ?? '[data-act="confirm"]';
        document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    announce(view, fresh) {
        const name = (seat) => (seat === view.you ? 'あなた' : view.players[seat].name);
        fresh.forEach(e => {
            if (e.type === 'resolve') {
                const kind = e.kind === 'revolt' ? '内乱' : '外乱';
                this.toast(`${kind}（${COLOR_INFO[e.color].leader}）：${name(e.winner)}の勝ち ${e.strength[0]}対${e.strength[1]}`);
            } else if (e.type === 'treasure') {
                this.toast(`${name(e.seat)}が宝物を${e.cells.length}つ取りました`);
            }
        });
    }

    // ---- 記録・終わり ----

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-300).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        this.resultShown = true;
        const finals = v.players.map(p => finalValues(p.scores, p.treasures));
        const names = v.winners.map(i => (i === v.you ? 'あなた' : v.players[i].name));
        $('#result-title').textContent = v.winners.length > 1 ? `${names.join('と')}の引き分け`
            : v.winners[0] === v.you ? 'あなたの勝ち' : `${names[0]}の勝ち`;
        $('#result-reason').textContent = v.endReason === 'treasure' ? '盤の宝物が2つ以下になりました' : '袋のタイルで補充できなくなりました';
        const order = v.players.map(p => p.id).sort((x, y) => compareFinal(finals[y], finals[x]) || x - y);
        $('#result-list').innerHTML = order.map(i => {
            const p = v.players[i];
            const chips = COLORS.map(c => `<span class="chip">${tileSvg(c)}<b>${p.scores[c]}</b></span>`).join('');
            return `<li class="${v.winners.includes(i) ? 'winner' : ''}"><span class="name">${dynastySvg(this.dynasty(i), i)}${escapeHtml(i === v.you ? 'あなた' : p.name)}</span><b class="final">${finals[i][0]}</b>
                <span class="chips">${chips}<span class="chip">${treasureSvg()}<b>${p.treasures}</b></span></span></li>`;
        }).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.innerHTML = escapeHtml(message);
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }
}

