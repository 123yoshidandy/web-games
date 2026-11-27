/**
 * バックギャモンの画面
 * - 盤は自分が下に来る向きで描く（自分のインナーボードが右下）
 * - 自分の番：動かせる駒の上の輪が光る。駒を押すと、行き先に使う目の数（2つ以上を続けて使う行き先は「3+5」）が出る
 *   1歩ずつ盤に反映し、「取り消し」で1歩ずつ戻せる。目を使い切ったら「決定」で番の手をまとめて送る
 * - 相手の手やダイスは、ゲームの出来事を順に再生して見せる（駒が滑る、打たれた駒がバーへ動く）
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { createBoard, legalPlays, nextSteps, playSteps, applyStep, diceList, KIND_NAMES } from './rules.js';
import { MATCH_LENGTHS } from './game.js';
import * as art from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import * as Motion from './motion/motion.js';

const SETTINGS_KEY = 'backgammon.settings';
const STEP_MS = 340;
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise(resolve => setTimeout(resolve, Motion.ms(ms))); // 動きの速さに合わせる（なし：間をおかない）

function loadSettings() {
    const fallback = { level: 'normal', matchLength: 3, cube: true };
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
        return {
            level: s?.level === 'easy' ? 'easy' : 'normal',
            matchLength: MATCH_LENGTHS.includes(s?.matchLength) ? s.matchLength : fallback.matchLength,
            cube: s?.cube !== false
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
        this.queue = [];
        this.animating = false;
        this.shown = null;     // 描いている盤とダイス（動きの再生中は、ビューより前の状態）
        this.turn = null;      // 自分の番の途中の状態 { key, start, dice, legal, steps }
        this.selected = null;
        this.lastOpp = [];     // 相手の最後の手で駒が着いたポイント
        this.resultShownFor = 0;
        this.buildBoard();
        this.buildTitleArt();
        this.bind();
        // 動きの速さ：CSS の動きの長さに倍率を掛け、「なし」なら動かさない
        const applyScale = () => document.documentElement.style.setProperty('--motion-scale', String(Motion.speedScale()));
        applyScale();
        Motion.onSpeedChange(applyScale);
        Motion.mountSpeedSetting($('motion-setting'), { label: '' });
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'バックギャモン',
            game: 'backgammon',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: 2,
            maxPlayers: 2,
            settings: [
                { key: 'level', label: 'CPU の強さ', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }] },
                { key: 'matchLength', label: 'マッチ（何点先取か）', options: [{ value: 1, label: '1点' }, { value: 3, label: '3点' }, { value: 5, label: '5点' }, { value: 7, label: '7点' }] },
                { key: 'cube', label: 'キューブ', options: [{ value: true, label: 'あり' }, { value: false, label: 'なし' }] }
            ],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.update(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                document.querySelectorAll('dialog[open]').forEach(d => d.close());
                this.showTitle();
            }
        });
    }

    // ---- 組み立て ----

    buildBoard() {
        const svg = $('board');
        svg.setAttribute('viewBox', `0 0 ${art.WIDTH} ${art.HEIGHT}`);
        svg.classList.add('board-svg');
        document.documentElement.style.setProperty('--board-ratio', String(art.WIDTH / art.HEIGHT));
        art.addDefs();
        art.drawBoard(svg);
        this.layers = {};
        for (const name of ['dests', 'cube', 'dice', 'checkers', 'marks', 'float', 'hits']) this.layers[name] = art.el('g', { class: name }, svg);
        for (let k = 0; k <= 25; k++) {
            art.el('rect', { class: 'hit', 'data-point': k, ...art.hitRect(k) }, this.layers.hits);
        }
    }

    buildTitleArt() {
        const svg = art.el('svg', { viewBox: `0 0 ${art.WIDTH} ${art.HEIGHT}`, class: 'board-svg' });
        art.drawBoard(svg);
        const layer = art.el('g', {}, svg);
        art.drawCheckers(layer, createBoard(), 0);
        art.drawDice(art.el('g', {}, svg), [5, 3], [false, false], 0, 0);
        $('title-art').appendChild(svg);
    }

    bind() {
        const seg = (id, read) => $(id).addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b || b.disabled) return;
            read(b);
            saveSettings(this.settings);
            this.renderSettings();
        });
        seg('level', b => { this.settings.level = b.dataset.level; });
        seg('match', b => { this.settings.matchLength = Number(b.dataset.match); });
        seg('cube', b => { this.settings.cube = b.dataset.cube === 'on'; });
        $('start').addEventListener('click', () => this.startNew());
        $('online-button').addEventListener('click', () => this.online.open());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.start(saved);
        });
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        const help = $('help');
        $('open-help-title').addEventListener('click', () => help.showModal());
        $('open-help-game').addEventListener('click', () => {
            this.controller?.pause();
            help.showModal();
        });
        help.addEventListener('close', () => this.controller?.resume());
        $('hint').addEventListener('click', () => this.showHint());
        $('open-log').addEventListener('click', () => this.showLog());
        document.querySelectorAll('dialog').forEach(d => {
            d.querySelector('.close')?.addEventListener('click', () => d.close());
            if (d.id !== 'result') d.addEventListener('click', e => { if (e.target === d) d.close(); });
        });
        $('look').addEventListener('click', () => $('result').close());
        $('result-next').addEventListener('click', () => {
            $('result').close();
            this.controller?.send({ type: 'next' });
        });
        $('again').addEventListener('click', () => {
            $('result').close();
            if (this.controller?.isOnline) return this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
            this.startNew();
        });
        $('result-home').addEventListener('click', () => {
            $('result').close();
            if (this.controller?.isOnline) return this.online.leave();
            this.showTitle();
        });
        $('board').addEventListener('click', e => {
            const hit = e.target.closest('.hit');
            if (hit) this.onPoint(Number(hit.dataset.point));
        });
        $('actions').addEventListener('click', e => {
            const b = e.target.closest('button');
            if (b && !b.disabled) this.onAction(b.dataset.action);
        });
        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.queue = [];
        this.renderSettings();
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online.available;
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
    }

    renderSettings() {
        const s = this.settings;
        document.querySelectorAll('#level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === s.level)));
        document.querySelectorAll('#match button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.match) === s.matchLength)));
        // 1点勝負ではキューブに意味がないので、選べなくする
        document.querySelectorAll('#cube button').forEach(b => {
            b.disabled = s.matchLength === 1;
            b.setAttribute('aria-checked', String(s.matchLength > 1 && (b.dataset.cube === 'on') === s.cube));
        });
    }

    startNew() {
        clearSavedGame();
        const s = this.settings;
        this.start({ players: [{ name: 'あなた' }, { name: 'CPU', isCPU: true }], options: { matchLength: s.matchLength, cube: s.cube }, level: s.level });
    }

    start(setup) {
        this.begin(new LocalGameController(setup, {
            onUpdate: () => this.update(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            isBusy: () => this.animating
        }));
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.controller = controller;
        const view = controller.getView();
        this.view = view;
        this.queue = [];
        this.animating = false;
        this.seenSeq = view.eventSeq;
        this.turn = null;
        this.selected = null;
        this.lastOpp = [];
        this.resultShownFor = view.result ? view.gameNo : 0;
        this.shown = { board: view.board, dice: view.dice, diceSeat: view.turn };
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.sync();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    // ---- ビューの更新と、出来事の再生 ----

    get seat() {
        return this.view.seat;
    }

    nameOf(seat) {
        return seat === this.seat ? 'あなた' : this.view.players[seat].name;
    }

    update() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        this.queue.push(...view.events.filter(e => e.seq > this.seenSeq));
        this.seenSeq = view.eventSeq;
        if (!this.animating) Motion.track(this.playQueue(), 20000); // 出来事の再生が終わるまで CPU を待たせる
    }

    async playQueue() {
        this.animating = true;
        this.renderActions();
        const controller = this.controller;
        try {
            while (this.queue.length && this.controller === controller) await this.playEvent(this.queue.shift());
        } catch (error) {
            console.error(error);
        }
        this.animating = false;
        if (this.controller === controller) this.sync();
    }

    async playEvent(e) {
        const me = this.seat;
        const shown = this.shown;
        this.playSound(e);
        switch (e.type) {
        case 'newGame':
            shown.board = createBoard();
            shown.dice = null;
            this.lastOpp = [];
            this.draw();
            if (e.crawford) this.toast('このゲームはダブルできません（クロフォード）', 2400);
            await wait(250);
            break;
        case 'opening':
            shown.dice = e.dice;
            shown.diceSeat = e.seat;
            this.draw();
            this.toast(`最初の振り　あなた ${e.dice[me]}・${this.nameOf(1 - me)} ${e.dice[1 - me]}　${this.nameOf(e.seat)}が先手`, 2200);
            await wait(e.seat === me ? 200 : 900);
            break;
        case 'roll':
            shown.dice = e.dice;
            shown.diceSeat = e.seat;
            this.draw();
            if (e.seat !== me) await wait(450);
            break;
        case 'noMove':
            shown.dice = e.dice;
            shown.diceSeat = e.seat;
            this.draw();
            this.toast(`${this.nameOf(e.seat)}は動かせません（${e.dice[0]}・${e.dice[1]}）`, 1600);
            await wait(1300);
            break;
        case 'play':
            if (e.seat === me) {
                shown.board = this.afterMoves(e.before, me, e.moves);
                this.lastOpp = [];
            } else {
                shown.board = e.before;
                shown.dice = e.dice;
                shown.diceSeat = e.seat;
                this.draw();
                for (const m of e.moves) await this.animateStep(e.seat, m.from, m.die);
                this.lastOpp = [...new Set(e.moves.map(m => m.to))];
                await wait(150);
            }
            break;
        case 'double':
            if (e.seat !== me) this.toast(`${this.nameOf(e.seat)}がダブルを提案しました`, 1800);
            break;
        case 'take':
            if (e.seat !== me) this.toast(`${this.nameOf(e.seat)}が受けました（キューブ ${e.value}）`, 1800);
            await wait(400);
            break;
        case 'drop':
            break;
        case 'gameEnd':
            this.draw();
            await wait(700);
            break;
        default:
            break;
        }
    }

    // 効果音：出来事ごとに1つ。自分のロールはさいころ、相手の手は自分の番か知らせ、ゲームの終わりは勝ち・負け
    // 自分の駒の移動は、手元で動かしたときに鳴らす（onPoint）
    playSound(e) {
        const me = this.seat;
        const next = () => (this.queue.length === 0 && this.view.current === me && !this.view.result ? 'turn' : 'notify');
        if (e.type === 'gameEnd') music.play(e.winner === me ? 'win' : 'lose');
        else if (e.type === 'opening' || (e.type === 'roll' && e.seat === me)) music.play('dice');
        else if (e.type === 'noMove') music.play(e.seat === me ? 'notify' : next());
        else if (['play', 'double', 'take', 'drop'].includes(e.type) && e.seat !== me) music.play(next());
    }

    afterMoves(before, owner, moves) {
        let board = before;
        for (const m of moves) board = applyStep(board, owner, m.from, m.die).board;
        return board;
    }

    // 1歩を動かして見せる。打たれた相手の駒も、同時にバーへ動かす
    async animateStep(owner, from, die) {
        const before = this.shown.board;
        const { board: after, to, hit } = applyStep(before, owner, from, die);
        const bottom = this.seat;
        const fly = [{ owner, from, to, fromIndex: before[owner][from] - 1, fromCount: before[owner][from], toIndex: after[owner][to] - 1, toCount: after[owner][to] }];
        if (hit) {
            const o = 1 - owner;
            const p = 25 - to;
            fly.push({ owner: o, from: p, to: 25, fromIndex: 0, fromCount: 1, toIndex: after[o][25] - 1, toCount: after[o][25] });
        }
        art.drawCheckers(this.layers.checkers, before, bottom, { hide: fly });
        const layer = this.layers.float;
        layer.replaceChildren();
        const nodes = fly.map(f => {
            const [x, y] = art.checkerXY(bottom, f.owner, f.from, f.fromIndex, f.fromCount);
            const g = art.drawChecker(layer, f.owner, 0, 0);
            g.removeAttribute('transform');
            g.style.transform = `translate(${x}px, ${y}px)`;
            return { f, g };
        });
        this.layers.marks.replaceChildren();
        this.layers.dests.replaceChildren();
        layer.getBoundingClientRect();
        await new Promise(requestAnimationFrame);
        nodes.forEach(({ f, g }) => {
            const [x, y] = art.checkerXY(bottom, f.owner, f.to, f.toIndex, f.toCount);
            g.style.transform = `translate(${x}px, ${y}px)`;
        });
        await wait(STEP_MS);
        layer.replaceChildren();
        this.shown.board = after;
        art.drawCheckers(this.layers.checkers, after, bottom);
    }

    // ビューに合わせて描く（動きの再生が終わったあと）
    sync() {
        const v = this.view;
        this.shown = { board: v.board, dice: v.dice, diceSeat: v.turn };
        this.prepareTurn();
        if (this.turn) this.shown.board = this.currentBoard();
        this.draw();
        this.renderPanels();
        this.renderTurnInfo();
        this.renderActions();
        $('hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        if (v.result && (v.phase === 'between' || v.phase === 'over') && this.resultShownFor !== v.gameNo) {
            this.resultShownFor = v.gameNo;
            this.recordLocalResult(v);
            this.showResult();
        }
    }

    // 自分が動かす番なら、番の途中の状態を用意する（同じ番の間は、動かした歩を保つ）
    prepareTurn() {
        const v = this.view;
        if (v.phase !== 'move' || v.current !== this.seat) {
            this.turn = null;
            this.selected = null;
            return;
        }
        const key = `${v.gameNo}:${v.eventSeq}`;
        if (this.turn?.key === key) return;
        this.turn = { key, start: v.board, dice: v.dice, legal: legalPlays(v.board, this.seat, v.dice), steps: [] };
        this.selected = null;
    }

    currentBoard() {
        const t = this.turn;
        return playSteps(t.start, this.seat, t.dice, t.steps).board;
    }

    get interactive() {
        return !!this.turn && !this.animating;
    }

    // 次に動かせる1歩
    nextList() {
        const t = this.turn;
        return nextSteps(t.start, this.seat, t.dice, t.steps, t.legal);
    }

    // 選んだ駒の行き先：1歩と、同じ駒で目を続けて使う行き先。行き先 → 歩の並び
    destinations(from) {
        const t = this.turn;
        const result = new Map();
        let frontier = [{ at: from, steps: [] }];
        while (frontier.length) {
            const next = [];
            for (const node of frontier) {
                const list = nextSteps(t.start, this.seat, t.dice, [...t.steps, ...node.steps], t.legal).filter(x => x.from === node.at);
                for (const x of list) {
                    const steps = [...node.steps, [x.from, x.die]];
                    const prev = result.get(x.to);
                    const sum = (s) => s.reduce((a, [, d]) => a + d, 0);
                    if (!prev || prev.length > steps.length || (prev.length === steps.length && sum(steps) < sum(prev))) result.set(x.to, steps);
                    if (x.to !== 0 && !prev) next.push({ at: x.to, steps });
                }
            }
            frontier = next;
        }
        return result;
    }

    // ---- 描画 ----

    draw() {
        const L = this.layers;
        const s = this.shown;
        const bottom = this.seat;
        art.drawCheckers(L.checkers, s.board, bottom);
        L.dice.replaceChildren();
        if (s.dice) {
            const list = diceList(s.dice);
            const used = list.map(() => false);
            if (this.turn && !this.animating) {
                for (const [, die] of this.turn.steps) {
                    const i = list.findIndex((d, j) => d === die && !used[j]);
                    if (i >= 0) used[i] = true;
                }
            }
            art.drawDice(L.dice, s.dice, used, s.diceSeat, bottom);
        }
        L.cube.replaceChildren();
        if (this.view.options.cube && this.view.options.matchLength > 1) art.drawCube(L.cube, this.view.cube, bottom);
        this.drawMarks();
    }

    drawMarks() {
        const L = this.layers;
        L.marks.replaceChildren();
        L.dests.replaceChildren();
        const board = this.shown.board;
        const bottom = this.seat;
        const ringAt = (owner, i, cls) => {
            const n = board[owner][i];
            if (!n) return;
            const [x, y] = art.checkerXY(bottom, owner, i, n - 1, n);
            art.el('circle', { class: cls, cx: x, cy: y, r: art.R + 1 }, L.marks);
        };
        // 相手の最後の手で着いた駒
        if (!this.animating) this.lastOpp.forEach(p => { if (p > 0) ringAt(1 - bottom, p, 'last-from'); });
        if (!this.interactive) return;
        const list = this.nextList();
        const sources = [...new Set(list.map(x => x.from))];
        // 動かせる駒が1か所だけなら（バーからの入りなど）、選んでおく
        if (this.selected === null && sources.length === 1) this.selected = sources[0];
        if (this.selected !== null && !sources.includes(this.selected)) this.selected = null;
        sources.forEach(p => { if (p !== this.selected) ringAt(bottom, p, 'movable'); });
        if (this.selected === null) return;
        ringAt(bottom, this.selected, 'selected');
        this.dests = this.destinations(this.selected);
        const t = this.turn;
        for (const [to, steps] of this.dests) {
            const after = playSteps(t.start, bottom, t.dice, [...t.steps, ...steps]).board;
            const n = after[bottom][to];
            if (to > 0) art.el('polygon', { class: 'dest', points: art.pointShape(to) }, L.dests);
            const [x, y] = art.checkerXY(bottom, bottom, to, n - 1, n);
            art.drawTarget(L.marks, x, y, steps.map(([, d]) => d).join('+'));
        }
    }

    renderPanels() {
        const v = this.view;
        const me = v.players[v.seat];
        const rival = v.players[1 - v.seat];
        const html = (p) => `<span class="stone ${p.id === 0 ? 'light' : 'dark'}"></span>
            <span class="name">${escapeHtml(this.nameOf(p.id))}</span>
            <span class="pips">ピップ <b>${p.pips}</b></span>
            <span class="points"><b>${p.score}</b>点</span>`;
        $('rival').innerHTML = html(rival);
        $('me').innerHTML = html(me);
        const turn = v.phase === 'between' || v.over ? null : v.current;
        $('rival').classList.toggle('active', turn === rival.id);
        $('me').classList.toggle('active', turn === me.id);
        const o = v.options;
        $('match-info').textContent = (o.matchLength === 1 ? '1点勝負' : `${o.matchLength}点先取`) + (v.crawford ? '・クロフォード' : '');
    }

    renderTurnInfo() {
        const v = this.view;
        const me = this.seat;
        let text;
        if (v.over) text = `${this.nameOf(v.winner)}の勝ち`;
        else if (v.phase === 'between') text = `${this.nameOf(v.result.winner)}が${v.result.points}点`;
        else if (v.phase === 'double') text = v.current === me ? `ダブルの提案（${v.cube.value * 2}点に）` : `${this.nameOf(v.current)}が考え中`;
        else if (v.current !== me) text = `${this.nameOf(v.current)}の番`;
        else if (v.phase === 'roll') text = 'ダブルかロール';
        else if (this.turn && this.turn.steps.length === this.turn.legal.max) text = '決定で番を終える';
        else text = this.selected !== null ? '行き先を選ぶ' : '動かす駒を選ぶ';
        $('turn-info').textContent = text;
    }

    renderActions() {
        const v = this.view;
        const me = this.seat;
        const best = this.hintAction && this.hintKey === `${v.gameNo}:${v.eventSeq}` ? this.hintAction : null;
        const button = (action, label, cls, disabled = false) => `<button class="btn small ${cls}${action === best ? ' recommended' : ''}" data-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
        let html = '';
        if (!this.animating) {
            if (v.over) html = button('again', 'もう一度', 'primary');
            else if (v.phase === 'between') html = button('next', '次のゲーム', 'primary');
            else if (v.phase === 'double' && v.current === me) html = button('drop', '降りる', 'danger') + button('take', '受ける', 'primary');
            else if (v.phase === 'roll' && v.current === me) html = button('double', `ダブル（${v.cube.value * 2}）`, 'secondary', !v.canDouble) + button('roll', 'ロール', 'primary');
            else if (this.turn) {
                const t = this.turn;
                html = button('undo', '取り消し', 'secondary', !t.steps.length) + button('confirm', '決定', 'primary', t.steps.length !== t.legal.max);
            }
        }
        if ($('actions').innerHTML !== html) $('actions').innerHTML = html;
    }

    // ---- 操作 ----

    async onPoint(p) {
        if (!this.interactive) return;
        if (this.selected !== null && this.dests?.has(p)) {
            const steps = this.dests.get(p);
            this.selected = null;
            let board = this.currentBoard();
            let hit = false;
            for (const [from, die] of steps) {
                const step = applyStep(board, this.seat, from, die);
                hit ||= step.hit;
                board = step.board;
            }
            music.play(hit ? 'capture' : 'place');
            this.animating = true;
            this.renderActions();
            try {
                for (const [from, die] of steps) {
                    await this.animateStep(this.seat, from, die);
                    this.turn.steps.push([from, die]);
                }
            } finally {
                this.animating = false;
            }
            this.afterLocalChange();
            return;
        }
        const sources = new Set(this.nextList().map(x => x.from));
        const was = this.selected;
        this.selected = sources.has(p) && this.selected !== p ? p : null;
        if (this.selected !== null) music.play('select');
        else if (was !== null) music.play('cancel');
        this.afterLocalChange();
    }

    afterLocalChange() {
        this.shown.board = this.currentBoard();
        this.draw();
        this.renderTurnInfo();
        this.renderActions();
    }

    onAction(action) {
        const c = this.controller;
        if (!c) return;
        if (action === 'undo' && this.turn?.steps.length) {
            music.play('cancel');
            this.turn.steps.pop();
            this.selected = null;
            this.afterLocalChange();
        } else if (action === 'confirm' && this.turn) {
            const steps = this.turn.steps.map(s => s.slice());
            this.turn = null;
            this.selected = null;
            if (!c.send({ type: 'play', steps })) this.sync();
        } else if (action === 'again') {
            this.startNew();
        } else if (['roll', 'double', 'take', 'drop', 'next'].includes(action)) {
            c.send({ type: action });
        }
    }

    // ---- 結果・知らせ ----

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view || !(view.phase === 'over')) return;
        if (controller.humanSeat < 0) return;
        const id = `${GAME}-${controller.game.options.seed}`;
        if (this.recordedId === id) return;
        this.recordedId = id;
        recordResult({ game: GAME, id, outcome: outcomeFromWinners(view.winner === null ? [] : [view.winner], controller.humanSeat, 2) });
    }

    showResult() {
        const v = this.view;
        if (!v.result || $('screen-game').hidden) return;
        const r = v.result;
        const loser = 1 - r.winner;
        const matchOver = v.over;
        const multi = v.options.matchLength > 1;
        $('result-title').textContent = matchOver && multi ? `マッチは${this.nameOf(r.winner)}の勝ち` : `${this.nameOf(r.winner)}の勝ち`;
        $('result-detail').textContent = r.kind === 0
            ? `${this.nameOf(loser)}が降りました（${r.points}点）`
            : `${KIND_NAMES[r.kind]}${r.cube > 1 ? `・キューブ ${r.cube}` : ''}で ${r.points}点`;
        const me = v.players[v.seat];
        const rival = v.players[1 - v.seat];
        $('result-score').innerHTML = multi ? `あなた <b>${me.score}</b> − <b>${rival.score}</b> ${escapeHtml(rival.name)}（${v.options.matchLength}点先取）` : '';
        $('result-score').hidden = !multi;
        $('result-next').hidden = matchOver;
        $('again').hidden = !matchOver;
        $('result').showModal();
    }

    // ヒント：CPU（ふつう）が選ぶ操作。駒の動きは点の番号（自分から見た番号）で出し、ボタンの操作は印を付ける
    showHint() {
        const v = this.view;
        const command = this.controller?.hint();
        if (!v || !command) return this.toast('自分の番になったら、おすすめを出せます');
        this.hintKey = `${v.gameNo}:${v.eventSeq}`;
        this.hintAction = command.type === 'play' ? 'confirm' : command.type;
        this.renderActions();
        if (command.type !== 'play') {
            const names = { roll: 'ロール', double: 'ダブルを提案する', take: '受ける', drop: '降りる' };
            return this.toast(`おすすめ：${names[command.type] ?? command.type}`, 2600);
        }
        if (!command.steps.length) return this.toast('おすすめ：動かせないので決定', 2600);
        const point = (p) => (p === 25 ? 'バー' : p <= 0 ? '上がり' : p);
        const moves = command.steps.map(([from, die]) => `${point(from)}→${point(Math.max(0, from - die))}`).join('、');
        const undo = this.turn?.steps.length ? '（取り消してから）' : '';
        this.toast(`おすすめ${undo}：${moves}`, 4000);
    }

    showLog() {
        const v = this.view;
        if (!v) return;
        const point = (p) => (p === 25 ? 'バー' : p <= 0 ? '上がり' : p);
        const text = (e) => {
            const who = escapeHtml(this.nameOf(e.seat));
            switch (e.type) {
                case 'newGame': return `第${e.gameNo}ゲーム${e.crawford ? '（クロフォード）' : ''}`;
                case 'opening': return `最初の振り：${e.dice[0]}・${e.dice[1]}、${who}が先手`;
                case 'roll': return `${who}：${e.dice[0]}・${e.dice[1]}`;
                case 'noMove': return `${who}：動かせない`;
                case 'play': return `${who}：${e.moves.map(m => `${point(m.from)}→${point(m.to)}${m.hit ? '（ヒット）' : ''}`).join('、')}`;
                case 'double': return `${who}：ダブル（${e.value}点に）`;
                case 'take': return `${who}：受ける`;
                case 'drop': return `${who}：降りる`;
                case 'gameEnd': return `${escapeHtml(this.nameOf(e.winner))}が${e.points}点`;
                default: return '';
            }
        };
        const items = v.events.map(text).filter(Boolean);
        $('log-list').innerHTML = items.length ? items.map(t => `<li>${t}</li>`).join('') : '<li>まだ記録はありません</li>';
        $('log').showModal();
        $('log-list').scrollTop = $('log-list').scrollHeight;
    }

    toast(message, ms = 2000) {
        const t = $('toast');
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
    }
}
