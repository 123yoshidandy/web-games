/**
 * 画面（タイトル・窓を選ぶ・ゲーム・道具と目標・記録・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * プールのダイスは「押して選び、光るマスを押す」か「指でマスまで引っ張る」で置く
 * 道具は、種類ごとの手順（ダイス → 増減 → マス など）を順に光らせて集め、そろったら1つの操作として送る
 */

import { COLOR_INFO, PATTERNS, TOOLS, OBJECTIVES, ROUNDS } from './data.js';
import { legalCells, canMove, applyMove, objectiveScore, privateScore } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, icon, dieHtml, windowHtml, difficultyDots, colorChip, titleArtSvg } from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';

// 自分の操作の音：窓を選ぶ・ダイスを取って置く・置く・道具（払う）・値を決める・番を終える
const COMMAND_SOUND = { choose: 'place', draft: 'place', place: 'place', tool: 'pay', fluxValue: 'select', end: 'select' };

const SETTINGS_KEY = 'sagrada.settings';
const CPU_NAMES = ['マリア', 'ジョルディ', 'ヌリア'];
const RESULT_DELAY_MS = 900;
const DRAG_PX = 8;

// 道具ごとの手順。pay：1人用の払い、die：プールのダイス、delta：増減、track：ラウンドトラックのダイス、
// cell：置くマス、from / to：動かすダイスと行き先、more：もう1個動かすか
const TOOL_STEPS = {
    grozing: ['die', 'delta', 'cell'],
    grinding: ['die', 'cell'],
    cork: ['die', 'cell'],
    lens: ['die', 'track', 'cell'],
    fluxBrush: ['die'],
    fluxRemover: ['die'],
    glazing: [],
    running: ['die', 'cell'],
    eglomise: ['from', 'to'],
    copper: ['from', 'to'],
    lathekin: ['from', 'to', 'from', 'to'],
    tapWheel: ['from', 'to', 'more', 'from', 'to']
};
const AFTER_DRAFT = ['grozing', 'grinding', 'lens', 'fluxBrush', 'fluxRemover', 'cork'];
const MOVE_TOOLS = ['eglomise', 'copper', 'lathekin', 'tapWheel'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [1, 2, 3, 4].includes(saved.count) ? saved.count : 2,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy',
            soloTools: [1, 2, 3, 4, 5].includes(saved.soloTools) ? saved.soloTools : 3
        };
    } catch {
        return { count: 2, level: 'easy', soloTools: 3 };
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
        this.selDie = null;         // 選んだプールのダイス
        this.hintCommand = null;    // ヒントのおすすめの手（画面だけ）
        this.choice = null;         // 窓を選ぶ画面で選んだ窓
        this.tool = null;           // 道具の手順 { id, steps, k, data }
        this.selKey = null;
        this.drag = null;
        this.resultTimer = null;
        this.resultShown = false;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtSvg();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。2人から。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'サグラダ',
            game: 'sagrada',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 650,
            minPlayers: Math.max(2, MIN_PLAYERS),
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
                onUpdate: () => this.onControllerUpdate(),
                onError: (message) => this.onControllerError(message)
            });
        } catch (error) {
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
        this.recordLocalResult(previous);
    }

    onControllerError(message) {
        music.play('error');
        this.toast(message);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        $('#hint').hidden = Boolean(controller.isOnline); // ヒントはローカル対戦だけ
        this.view = null;
        this.selDie = null;
        this.choice = null;
        this.tool = null;
        this.resultShown = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
    }

    newGame() {
        const { count, level, soloTools } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: count === 1 ? { soloTools } : {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
        const segment = (id, key, attr, parse) => $(id).addEventListener('click', (event) => {
            const button = event.target.closest(`button[${attr}]`);
            if (!button) return;
            this.settings[key] = parse(button.getAttribute(attr));
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#player-count', 'count', 'data-count', Number);
        segment('#cpu-level', 'level', 'data-level', String);
        segment('#solo-tools', 'soloTools', 'data-tools', Number);
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
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        // プール：押して選ぶか、マスまで引っ張る
        // 引っ張り始めにプールを描き直すと、つかんだ要素が外れて捕まえが切れるので、動きと離しは window で受ける
        $('#pool').addEventListener('pointerdown', (event) => this.poolDown(event));
        window.addEventListener('pointermove', (event) => this.poolMove(event));
        window.addEventListener('pointerup', (event) => this.poolUp(event));
        window.addEventListener('pointercancel', () => this.endDrag());
        $('#my-window').addEventListener('click', (event) => {
            const pick = event.target.closest('[data-pattern]');
            if (pick) {
                this.choice = Number(pick.dataset.pattern);
                music.play('select');
                this.render();
                return;
            }
            const cell = event.target.closest('.cell[data-cell]');
            if (cell && event.target.closest('.my')) this.tapCell(Number(cell.dataset.cell));
        });
        $('#opponents').addEventListener('click', (event) => {
            const op = event.target.closest('[data-seat]');
            if (op) this.showPlayer(Number(op.dataset.seat));
        });
        $('#track').addEventListener('click', () => this.showTrack());
        $('#detail-body').addEventListener('click', (event) => {
            const b = event.target.closest('[data-track]');
            if (b && this.toolStep() === 'track') {
                this.tool.data.track = b.dataset.track.split(',').map(Number);
                $('#detail').close();
                this.nextStep();
            }
        });
        $('#actions').addEventListener('click', (event) => this.onAction(event));
        $('#hint').addEventListener('click', () => this.showHint());
        $('#prompt').addEventListener('click', (event) => this.onAction(event));
        $('#cards-body').addEventListener('click', (event) => {
            const b = event.target.closest('button[data-tool]');
            if (b && !b.disabled) {
                $('#cards').close();
                this.startTool(b.dataset.tool);
            }
        });
    }

    onAction(event) {
        const b = event.target.closest('button[data-act]');
        if (!b || b.disabled) return;
        const v = b.dataset.value;
        switch (b.dataset.act) {
            case 'choose': return this.send({ type: 'choose', pattern: this.choice });
            case 'end': return this.send({ type: 'end' });
            case 'cards': return this.showCards();
            case 'cancel-tool': this.tool = null; music.play('cancel'); return this.render();
            case 'delta': this.tool.data.delta = Number(v); return this.nextStep();
            case 'track': return this.showTrack();
            case 'no-cell': this.tool.data.cell = null; return this.nextStep();
            case 'more': return this.nextStep();
            case 'done-moves': this.tool.k = this.tool.steps.length; return this.finishTool();
            case 'confirm-tool': return this.finishTool();
            case 'flux-value': return this.send({ type: 'fluxValue', value: Number(v) });
            case 'return-die': return this.send({ type: 'place', cell: null });
            case 'result': return this.showResult();
            default: return null;
        }
    }

    send(command) {
        if (!this.controller) return;
        this.selDie = null;
        this.tool = null;
        this.hintCommand = null;
        const { round, phase } = this.view;
        this.sending = true;
        const ok = this.controller.send(command);
        this.sending = false;
        // ラウンドが変わったときは、新しいダイスの音（playUpdateSound）だけにする
        if (ok && this.view.phase === phase && this.view.round === round) music.play(command.type === 'place' && command.cell === null ? 'cancel' : COMMAND_SOUND[command.type] ?? 'place');
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // 終局に切り替わった1回だけ送る。id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(previous) {
        const v = this.view;
        const controller = this.controller;
        if (!previous || !v || controller?.isOnline || controller?.isReplay) return;
        const finished = v.phase === 'end';
        const wasOver = previous.phase === 'end';
        if (!finished || wasOver) return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: v.solo ? (v.winners.length ? 'win' : 'loss') : outcomeFromWinners(v.winners, v.you, v.players.length) });
    }

    // 1回の更新に1つの音。自分の手の音は send で鳴らす。新しいラウンドはダイス、CPU の手は知らせ、自分の番になったらチャイム
    playUpdateSound(previous) {
        const v = this.view;
        if (!previous) return;
        if (v.phase === 'end') {
            if (previous.phase !== 'end') music.play(v.winners.includes(v.you) || (v.solo && v.winners.length) ? 'win' : 'lose');
        } else if (v.phase === 'play' && (v.round !== previous.round || previous.phase !== 'play')) {
            music.play('dice');
        } else if (!this.sending) {
            const wasMine = previous.phase === 'play' && previous.actors.includes(previous.you);
            music.play(this.myTurn() && !wasMine ? 'turn' : 'notify');
        }
    }

    // ---- 状態の判定 ----

    me() {
        return this.view.players[this.view.you];
    }

    myTurn() {
        const v = this.view;
        return !!v && v.phase === 'play' && v.actors.includes(v.you);
    }

    canDraft() {
        const v = this.view;
        return this.myTurn() && !v.pending && !v.turn.drafted && !this.tool;
    }

    // 道具を今使えるか（払えるか、手番の状況が合うか）
    toolUsable(tool) {
        const v = this.view;
        if (!this.myTurn() || v.pending || v.turn.toolUsed) return false;
        const me = this.me();
        if (v.solo) {
            if (tool.used || !v.pool.some(d => d.color === TOOLS[tool.id].color)) return false;
        } else if (me.tokens < tool.cost) return false;
        if (AFTER_DRAFT.includes(tool.id) && v.turn.drafted) return false;
        if (tool.id === 'running') return !v.turn.second && v.turn.drafted && v.pool.length > 0;
        if (tool.id === 'glazing') return v.turn.second && !v.turn.drafted;
        if (tool.id === 'lens' && !v.roundTrack.flat().length) return false;
        if (MOVE_TOOLS.includes(tool.id) && !me.window.some(Boolean)) return false;
        if (tool.id === 'tapWheel') {
            const track = new Set(v.roundTrack.flat().map(d => d.color));
            if (!me.window.some(d => d && track.has(d.color))) return false;
        }
        return true;
    }

    // ---- プールのダイス（押す・引っ張る） ----

    poolDown(event) {
        const el = event.target.closest('.die[data-die]');
        if (!el) return;
        this.drag = { id: Number(el.dataset.die), x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false, ghost: null, el };
        try { el.setPointerCapture(event.pointerId); } catch { /* 古い端末では捕まえられないことがある */ }
    }

    poolMove(event) {
        const d = this.drag;
        if (!d || d.pointerId !== event.pointerId) return;
        if (!d.moved && Math.hypot(event.clientX - d.x, event.clientY - d.y) < DRAG_PX) return;
        if (!d.moved) {
            // 引っ張り始めたら、そのダイスを選んで置ける場所を光らせる
            if (!this.pickPoolDie(d.id, { drag: true })) {
                this.drag = null;
                return;
            }
            d.moved = true;
            d.ghost = d.el.cloneNode(true);
            d.ghost.classList.add('ghost');
            document.body.appendChild(d.ghost);
        }
        d.ghost.style.left = `${event.clientX}px`;
        d.ghost.style.top = `${event.clientY}px`;
    }

    poolUp(event) {
        const d = this.drag;
        if (!d || d.pointerId !== event.pointerId) return;
        if (!d.moved) {
            this.endDrag();
            this.pickPoolDie(d.id);
            return;
        }
        d.ghost.style.display = 'none';
        const under = document.elementFromPoint(event.clientX, event.clientY);
        this.endDrag();
        const cell = under?.closest('.my .cell[data-cell]');
        if (cell) this.tapCell(Number(cell.dataset.cell));
    }

    endDrag() {
        this.drag?.ghost?.remove();
        this.drag = null;
    }

    // プールのダイスを押した（選ぶ・道具の手順で使う）
    pickPoolDie(id, { drag = false } = {}) {
        const v = this.view;
        if (!v) return false;
        const step = this.toolStep();
        if (step === 'pay' || step === 'die') {
            if (!this.poolTargets().includes(id)) return false;
            this.tool.data[step] = id;
            this.nextStep();
            return !drag ? true : this.toolStep() === 'cell';
        }
        if (!this.canDraft()) return false;
        if (this.selDie === id && !drag) this.selDie = null;
        else this.selDie = id;
        if (!drag) music.play(this.selDie === null ? 'cancel' : 'select');
        this.render();
        return true;
    }

    tapCell(i) {
        const v = this.view;
        if (!v || !this.myTurn()) return;
        const me = this.me();
        const pattern = PATTERNS[me.pattern];
        if (v.pending?.kind === 'place') {
            const die = v.pool.find(d => d.id === v.pending.die);
            if (legalCells(me.window, pattern, die).includes(i)) this.send({ type: 'place', cell: i });
            return;
        }
        const step = this.toolStep();
        if (step === 'cell' || step === 'from' || step === 'to') {
            if (!this.cellTargets().has(i)) return;
            if (step === 'from') this.tool.data.from = i;
            else if (step === 'to') {
                this.tool.data.moves.push([this.tool.data.from, i]);
                this.tool.data.from = null;
            } else this.tool.data.cell = i;
            this.nextStep();
            return;
        }
        if (this.selDie !== null && this.canDraft()) {
            const die = v.pool.find(d => d.id === this.selDie);
            if (die && legalCells(me.window, pattern, die).includes(i)) this.send({ type: 'draft', die: die.id, cell: i });
        }
    }

    // ---- 道具の手順 ----

    startTool(id) {
        const steps = [...(this.view.solo ? ['pay'] : []), ...TOOL_STEPS[id]];
        this.tool = { id, steps, k: 0, data: { moves: [], from: null } };
        this.selDie = null;
        this.autoStep();
    }

    toolStep() {
        return this.tool ? this.tool.steps[this.tool.k] ?? null : null;
    }

    nextStep() {
        this.tool.k += 1;
        this.autoStep();
    }

    // 選べるものが1つだけの手順は自動で進める。手順が終わったら送る
    autoStep() {
        const step = this.toolStep();
        if (step === null) {
            if (this.tool.id === 'glazing') return this.render(); // 確かめのボタンを出す
            return this.finishTool();
        }
        if (step === 'pay') {
            const list = this.poolTargets();
            if (list.length === 1) {
                this.tool.data.pay = list[0];
                return this.nextStep();
            }
        }
        if (step === 'more' && this.tool.data.moves.length >= 2) return this.finishTool();
        this.render();
    }

    finishTool() {
        const t = this.tool;
        const d = t.data;
        const command = { type: 'tool', tool: t.id };
        if (d.pay !== undefined) command.pay = d.pay;
        if (d.die !== undefined) command.die = d.die;
        if (d.delta !== undefined) command.delta = d.delta;
        if (d.track !== undefined) command.track = d.track;
        if (d.cell !== undefined) command.cell = d.cell;
        if (t.id === 'eglomise' || t.id === 'copper') Object.assign(command, { from: d.moves[0][0], to: d.moves[0][1] });
        if (t.id === 'lathekin' || t.id === 'tapWheel') command.moves = d.moves;
        this.send(command);
    }

    // 今の手順で押せるプールのダイス
    poolTargets() {
        const v = this.view;
        const step = this.toolStep();
        const t = this.tool;
        if (step === 'pay') return v.pool.filter(d => d.color === TOOLS[t.id].color && d.id !== t.data.die).map(d => d.id);
        if (step === 'die') return v.pool.filter(d => d.id !== t.data.pay).map(d => d.id);
        return [];
    }

    // 道具で変えたあとのダイス
    changedDie() {
        const v = this.view;
        const d = this.tool.data;
        const die = v.pool.find(x => x.id === d.die);
        if (!die) return null;
        if (this.tool.id === 'grozing') return { ...die, value: die.value + d.delta };
        if (this.tool.id === 'grinding') return { ...die, value: 7 - die.value };
        if (this.tool.id === 'lens' && d.track) {
            const other = v.roundTrack[d.track[0]][d.track[1]];
            return { ...die, color: other.color, value: other.value };
        }
        return die;
    }

    // 今の手順で光らせる窓のマス
    cellTargets() {
        const v = this.view;
        const me = this.me();
        const pattern = PATTERNS[me.pattern];
        const marks = new Set();
        if (v.pending?.kind === 'place' && v.pending.seat === v.you) {
            const die = v.pool.find(d => d.id === v.pending.die);
            legalCells(me.window, pattern, die).forEach(i => marks.add(i));
            return marks;
        }
        const step = this.toolStep();
        if (step === 'cell') {
            const die = this.changedDie();
            const options = this.tool.id === 'cork' ? { alone: true } : {};
            if (die) legalCells(me.window, pattern, die, options).forEach(i => marks.add(i));
            return marks;
        }
        if (step === 'from' || step === 'to') {
            let w = me.window;
            this.tool.data.moves.forEach(([f, t]) => { w = applyMove(w, f, t); });
            const options = this.tool.id === 'eglomise' ? { ignoreColor: true } : this.tool.id === 'copper' ? { ignoreValue: true } : {};
            const moved = this.tool.data.moves.map(([, t]) => t);
            const track = new Set(v.roundTrack.flat().map(d => d.color));
            const firstColor = this.tool.data.moves.length ? me.window[this.tool.data.moves[0][0]].color : null;
            const okFrom = (i) => w[i] && !moved.includes(i)
                && (this.tool.id !== 'tapWheel' || (track.has(w[i].color) && (!firstColor || w[i].color === firstColor)));
            for (let i = 0; i < 20; i++) {
                if (step === 'from') {
                    if (okFrom(i) && Array.from({ length: 20 }, (_, j) => j).some(j => canMove(w, pattern, i, j, options))) marks.add(i);
                } else if (canMove(w, pattern, this.tool.data.from, i, options)) marks.add(i);
            }
            return marks;
        }
        if (this.selDie !== null && this.canDraft()) {
            const die = v.pool.find(d => d.id === this.selDie);
            if (die) legalCells(me.window, pattern, die).forEach(i => marks.add(i));
        }
        return marks;
    }

    // ---- タイトル ----

    renderSetup() {
        const s = this.settings;
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === s.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === s.level)));
        document.querySelectorAll('#solo-tools button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.tools) === s.soloTools)));
        $('#row-level').hidden = s.count === 1;
        $('#row-solo').hidden = s.count !== 1;
    }

    renderHelp() {
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>10ラウンドで、ダイスを自分の窓（4行×5列）に置いてステンドグラスを作ります。公共の目標・個人の目標（自分の色のダイスの目の合計）・残りの好意トークンで点を取り、空きマスは1つ −1点。点の多い人の勝ち。</p>
            <h3>ラウンド</h3>
            <p>人数×2＋1個のダイスを振ってプールに並べます。手番はスタートの人から順に1周し、最後の人から逆に戻ります（1人2回）。手番では、プールのダイスを1個選んで窓に置く・道具を1枚使う、を好きな順に行えます（どちらもしなくてよい）。残ったダイスはラウンドトラックへ。</p>
            <h3>置き方</h3>
            <ul>
                <li>最初のダイスは縁か角のマスに</li>
                <li>2個目からは、すでにあるダイスに縦横斜めのどこかで接するマスに</li>
                <li>色のマスにはその色、目のマスにはその目のダイスだけ。白いマスは何でも</li>
                <li>縦横に同じ色・同じ目のダイスを並べない（斜めはよい）</li>
            </ul>
            <p>ダイスを押して光るマスを押すか、ダイスをマスまで引っ張って置きます。</p>
            <h3>道具と好意トークン</h3>
            <p>好意トークン（窓の難しさの数だけ持つ）を、だれも使っていない道具には1つ、使われた道具には2つ置いて使います。残ったトークンは1つ1点。</p>
            <h3>1人用</h3>
            <p>好意トークンはなく、道具（1〜5枚。多いほどやさしい）はプールの同じ色のダイスで払って1回ずつ使えます。毎ラウンド4個を振って2回の手番。公共の目標2枚・個人の目標2枚（点の多い方）。空きマスは1つ −3点。ラウンドトラックのダイスの目の合計より多く取れば勝ち。</p>
            <h3>同点</h3>
            <p>個人の目標の点 → 残りの好意トークン → 最終ラウンドで手番があとだった人、の順で決めます。</p>
            <h3>道具</h3>
            <ul class="tool-list">${Object.values(TOOLS).map(t => `<li><strong>${t.name}</strong>（${COLOR_INFO[t.color].name}）　${t.text}</li>`).join('')}</ul>
            <h3>公共の目標</h3>
            <ul class="tool-list">${Object.values(OBJECTIVES).map(o => `<li><strong>${o.name}</strong>（${o.points}点）　${o.text}</li>`).join('')}</ul>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        // 場面が変わったら、選択と道具の手順を消す
        const key = `${view.phase}:${view.round}:${view.turnIndex}:${view.turn?.drafted}:${view.turn?.toolUsed}:${view.pending?.kind ?? ''}:${view.actors.join(',')}`;
        if (key !== this.selKey) {
            this.selKey = key;
            this.selDie = null;
            // 場面が変わっても自分の番が続くなら、ヒントは今の場面のおすすめに出し直す
            if (this.hintCommand) this.hintCommand = this.controller.hint();
            if (this.hintCommand?.type === 'draft') this.selDie = this.hintCommand.die;
            if (this.tool && !this.myTurn()) this.tool = null;
        }
        $('#round').textContent = view.phase === 'choose' ? '窓を選ぶ' : (view.phase === 'end' ? '終わり' : `ラウンド ${view.round}/${ROUNDS}`);
        document.body.classList.toggle('choosing', view.phase === 'choose');
        this.renderOpponents(view);
        this.renderTrack(view);
        this.renderPrompt(view);
        this.renderPool(view);
        this.renderMine(view);
        this.renderActions(view);
        this.markHint();
        if ($('#log').open) this.renderLog();
        if (view.phase === 'end' && !this.resultShown && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.resultShown = true;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    renderOpponents(view) {
        if (view.solo) {
            const sum = view.roundTrack.flat().reduce((s, d) => s + d.value, 0);
            $('#opponents').innerHTML = `<div class="solo-target">目標の点（ラウンドトラックの合計）<strong>${sum}</strong></div>`;
            return;
        }
        const others = view.players.filter(p => p.id !== view.you);
        $('#opponents').innerHTML = others.map(p => {
            const actor = view.actors.includes(p.id) && view.phase !== 'end';
            const body = p.pattern === null ? `<div class="mini-wait">${p.chosen ? '選んだ' : '選んでいる'}</div>` : windowHtml(p.window, p.pattern, { cls: 'mini' });
            return `<div class="opponent${actor ? ' actor' : ''}" data-seat="${p.id}">
                <div class="op-head"><span class="op-name">${escapeHtml(p.name)}</span><span class="tokens">${icon('token')}${p.tokens}</span></div>
                ${body}</div>`;
        }).join('');
    }

    renderTrack(view) {
        $('#track').innerHTML = Array.from({ length: ROUNDS }, (_, r) => {
            const list = view.roundTrack[r];
            if (!list) return `<div class="slot${r + 1 === view.round ? ' now' : ''}"><span>${r + 1}</span></div>`;
            return `<div class="slot done">${list.length ? dieHtml(list[0], { cls: 'tiny' }) : ''}${list.length > 1 ? `<span class="more">+${list.length - 1}</span>` : ''}</div>`;
        }).join('');
    }

    renderPrompt(view) {
        const p = $('#prompt');
        const pending = view.pending;
        const mine = pending && pending.seat === view.you;
        if (view.phase !== 'play') {
            p.innerHTML = '';
            return;
        }
        if (mine && pending.kind === 'fluxValue') {
            p.innerHTML = `<span>目を選ぶ</span>${[1, 2, 3, 4, 5, 6].map(v => `<button class="pick-value" data-act="flux-value" data-value="${v}">${dieHtml({ color: pending.color, value: v }, { cls: 'small' })}</button>`).join('')}`;
            return;
        }
        if (mine && pending.kind === 'place') {
            p.innerHTML = `<span>置くマスを選ぶ</span>${pending.mustPlace ? '' : '<button class="btn mini secondary" data-act="return-die">プールに戻す</button>'}`;
            return;
        }
        if (this.tool) {
            const t = TOOLS[this.tool.id];
            const step = this.toolStep();
            const text = {
                pay: `払う${COLOR_INFO[t.color].name}のダイスを選ぶ`,
                die: 'プールのダイスを選ぶ',
                delta: '目を増やすか減らす',
                track: 'ラウンドトラックのダイスを選ぶ',
                cell: '置くマスを選ぶ',
                from: '動かすダイスを選ぶ',
                to: '行き先を選ぶ',
                more: 'もう1個動かすか'
            }[step] ?? 'プールを振り直す';
            let extra = '';
            if (step === 'delta') {
                const die = view.pool.find(d => d.id === this.tool.data.die);
                extra = `<button class="btn mini primary" data-act="delta" data-value="-1" ${die.value > 1 ? '' : 'disabled'}>−1</button><button class="btn mini primary" data-act="delta" data-value="1" ${die.value < 6 ? '' : 'disabled'}>＋1</button>`;
            } else if (step === 'track') extra = '<button class="btn mini primary" data-act="track">選ぶ</button>';
            else if (step === 'cell' && !this.cellTargets().size) extra = '<button class="btn mini primary" data-act="no-cell">置けないので戻す</button>';
            else if (step === 'more') extra = '<button class="btn mini primary" data-act="more">もう1個</button><button class="btn mini primary" data-act="done-moves">これで決める</button>';
            else if (step === null) extra = '<button class="btn mini primary" data-act="confirm-tool">振り直す</button>';
            p.innerHTML = `<span><strong>${t.name}</strong>：${text}</span>${extra}<button class="btn mini secondary" data-act="cancel-tool">やめる</button>`;
            return;
        }
        const actor = view.players[view.actors[0]];
        if (!this.myTurn()) {
            p.innerHTML = `<span class="muted">${actor ? `${escapeHtml(actor.name)}の番` : ''}</span>`;
            return;
        }
        p.innerHTML = '';
    }

    renderPool(view) {
        const targets = this.tool ? this.poolTargets() : null;
        const can = this.canDraft();
        const pendingDie = view.pending?.kind === 'place' ? view.pending.die : null;
        const toolDie = this.tool?.data.die;
        $('#pool').innerHTML = view.pool.map(d => {
            let cls = '';
            if (targets) cls = targets.includes(d.id) ? 'pickable' : 'dim';
            else if (can) cls = 'pickable';
            if (this.selDie === d.id || pendingDie === d.id || toolDie === d.id || this.tool?.data.pay === d.id) cls += ' selected';
            return dieHtml(d, { cls, attrs: `data-die="${d.id}"` });
        }).join('');
    }

    renderMine(view) {
        const me = view.players[view.you];
        const wrap = $('#my-window');
        if (view.phase === 'choose') {
            wrap.innerHTML = me.chosen
                ? `<div class="choose-head">${this.privateHtml(me)}</div>${windowHtml(me.window, me.pattern, { cls: 'my' })}<p class="muted center">ほかの人を待っています</p>`
                : `<div class="choose-head">${this.privateHtml(me)}</div><div class="choose-grid">${me.offers.map(id => `<button class="offer${this.choice === id ? ' selected' : ''}" data-pattern="${id}">
                    ${windowHtml(Array(20).fill(null), id, { cls: 'mini' })}<span class="offer-name">${PATTERNS[id].name}</span>${difficultyDots(PATTERNS[id].difficulty)}</button>`).join('')}</div>`;
            return;
        }
        const marks = this.myTurn() ? this.cellTargets() : new Set();
        const selected = this.tool?.data.from ?? null;
        let w = me.window;
        this.tool?.data.moves.forEach(([f, t]) => { w = applyMove(w, f, t); });
        wrap.innerHTML = `<div class="my-head">${this.privateHtml(me)}
                ${view.solo ? '' : `<span class="tokens">${icon('token')}${me.tokens}</span>`}
                <span class="pattern-name">${PATTERNS[me.pattern].name}</span></div>
            ${windowHtml(w, me.pattern, { cls: `my${this.myTurn() ? ' turn' : ''}`, marks, selected })}`;
    }

    privateHtml(me) {
        return `<span class="private">${me.privates.map(c => colorChip(c)).join('')}</span>`;
    }

    renderActions(view) {
        const a = $('#actions');
        if (view.phase === 'choose') {
            const me = view.players[view.you];
            a.innerHTML = me.chosen ? '' : `<button class="btn primary" data-act="choose" ${this.choice === null ? 'disabled' : ''}>この窓にする</button>`;
            return;
        }
        if (view.phase === 'end') {
            a.innerHTML = '<button class="btn primary" data-act="result">結果</button>';
            return;
        }
        const turn = this.myTurn() && !view.pending && !this.tool;
        const toolOk = view.tools.some(t => this.toolUsable(t));
        a.innerHTML = `<button class="btn secondary" data-act="cards">${icon('tool')}道具・目標${toolOk ? '<span class="dot-on"></span>' : ''}</button>
            <button class="btn primary" data-act="end" ${turn ? '' : 'disabled'}>番を終える</button>`;
    }

    // ---- ダイアログ ----

    showCards() {
        const v = this.view;
        if (!v) return;
        const me = this.me();
        const tools = v.tools.map(t => {
            const info = TOOLS[t.id];
            const cost = v.solo ? `${COLOR_INFO[info.color].name}のダイスで払う${t.used ? '（使った）' : ''}` : `好意トークン ${t.cost}`;
            return `<div class="card-row">
                <div><strong>${info.name}</strong><span class="muted">　${cost}</span><br>${info.text}</div>
                <button class="btn mini primary" data-tool="${t.id}" ${this.toolUsable(t) ? '' : 'disabled'}>使う</button></div>`;
        }).join('');
        const objectives = v.objectives.map(id => `<div class="card-row"><div><strong>${OBJECTIVES[id].name}</strong>（${OBJECTIVES[id].points}点）<br>${OBJECTIVES[id].text}</div><span class="now">今 ${objectiveScore(me.window, id)}点</span></div>`).join('');
        const privates = me.privates.map(c => `<div class="card-row"><div>${colorChip(c)}　${COLOR_INFO[c].name}のダイスの目の合計${v.solo ? '（2枚のうち点の多い方）' : ''}</div><span class="now">今 ${privateScore(me.window, c)}点</span></div>`).join('');
        $('#cards-body').innerHTML = `<h3>道具</h3>${tools}<h3>公共の目標</h3>${objectives}<h3>個人の目標</h3>${privates}`;
        $('#cards').showModal();
    }

    showPlayer(seat) {
        const v = this.view;
        const p = v.players[seat];
        if (p.pattern === null) return;
        $('#detail-title').textContent = p.name;
        $('#detail-body').innerHTML = `<p class="detail-line">${PATTERNS[p.pattern].name}　${icon('token')}${p.tokens}</p>${windowHtml(p.window, p.pattern, { cls: 'big' })}`;
        $('#detail').showModal();
    }

    showTrack() {
        const v = this.view;
        if (!v || v.phase === 'choose') return;
        const picking = this.toolStep() === 'track';
        $('#detail-title').textContent = 'ラウンドトラック';
        $('#detail-body').innerHTML = v.roundTrack.length
            ? `<div class="track-list">${v.roundTrack.map((list, r) => `<div class="track-row"><span class="r">${r + 1}</span>${list.map((d, k) => (picking
                ? `<button class="pick-track" data-track="${r},${k}">${dieHtml(d, { cls: 'small' })}</button>`
                : dieHtml(d, { cls: 'small' }))).join('') || '<span class="muted">なし</span>'}</div>`).join('')}</div>`
            : '<p class="muted">まだありません</p>';
        $('#detail').showModal();
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const objCols = v.objectives.map(id => OBJECTIVES[id].name);
        const order = v.solo ? [0] : v.ranking;
        if (v.solo) {
            $('#result-title').textContent = v.winners.length ? '目標を超えた' : '目標に届かなかった';
        } else {
            const w = v.players[v.winners[0]];
            $('#result-title').textContent = v.winners.includes(v.you) ? 'あなたの勝ち' : `${w.name}の勝ち`;
        }
        $('#result-table').innerHTML = `<table><thead><tr><th></th>${objCols.map(h => `<th>${h}</th>`).join('')}<th>個人</th>${v.solo ? '' : '<th>好意</th>'}<th>空き</th><th>計</th></tr></thead><tbody>
            ${order.map(id => {
                const p = v.players[id];
                const r = p.result;
                return `<tr class="${p.id === v.you ? 'you' : ''} ${v.winners.includes(p.id) ? 'win' : ''}"><th>${escapeHtml(p.name)}<br>${p.privates.map(c => colorChip(c)).join('')}</th>
                    ${r.publics.map(x => `<td>${x}</td>`).join('')}<td>${r.private}</td>${v.solo ? '' : `<td>${r.tokens}</td>`}<td>${r.open}</td><td class="total">${r.total}</td></tr>`;
            }).join('')}
        </tbody></table>${v.solo ? `<p class="target">目標の点 ${v.target}　あなた ${v.players[0].result.total}</p>` : ''}`;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

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

    // ---- ヒント ----

    // おすすめの手を、選んだ状態にして印を付ける（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        music.play('select');
        this.tool = null;
        if (command.type === 'choose') this.choice = command.pattern;
        if (command.type === 'draft') this.selDie = command.die;
        this.render();
        const text = {
            choose: () => 'この窓にする',
            draft: () => 'このダイスを光るマスに置く',
            place: () => (command.cell === null ? 'ダイスを戻す' : '光るマスに置く'),
            fluxValue: () => `目を${command.value}にする`,
            tool: () => `道具「${TOOLS[command.tool].name}」を使う`,
            end: () => '番を終える'
        }[command.type]?.() ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const selectors = {
            choose: [`[data-pattern="${c.pattern}"]`, '[data-act="choose"]'],
            draft: [`.my .cell[data-cell="${c.cell}"]`],
            place: [c.cell === null ? '[data-act="return-die"]' : `.my .cell[data-cell="${c.cell}"]`],
            fluxValue: [`[data-act="flux-value"][data-value="${c.value}"]`],
            tool: ['[data-act="cards"]'],
            end: ['[data-act="end"]']
        }[c.type] ?? [];
        selectors.forEach(s => document.querySelectorAll(s).forEach(el => el.classList.add('recommended')));
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

