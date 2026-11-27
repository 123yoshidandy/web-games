/**
 * 画面（タイトル・ゲーム・ログ・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 選べる手は、ルールの関数（movePaths・choiceCandidates など）をビューの state に当てて求める
 * 道と鉄道は、光った場所をタップしても選べる
 */

import {
    MIN_PLAYERS, MAX_PLAYERS, PLAYER_COLORS, BREEDS, BREED_ORDER, card, OBJECTIVES, TASK_SHORT, TASK_NAMES, OBJECTIVE_ACTION_NAMES,
    BUILDINGS, WORKERS, WORKER_TYPES, JOB_COSTS, HAZARD_TYPES, TRADE_SPOTS, TRADE_VALUES, STATIONS, MASTERS,
    CITIES, CITY_BY_ID, CITY_LINKS, DISCS, DISC_ORDER, BUY_OPTIONS
} from './data.js';
import {
    movePaths, pathToll, stepLimit, localActions, canStart, auxOptions, choiceCandidates, locName, spaceName, stationAt,
    hireableWorkers, breedingValue, permCerts, certLimit, handLimit, transportCost, scoreOf, taskCounts, objectiveScore,
    tollOf, backCount, ownedCards
} from './rules.js';
import { PROFILES, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import BoardView, { HAZARD_COLORS, TEEPEE_COLORS, posOf } from './board-view.js';
import RailView from './rail-view.js';

const SETTINGS_KEY = 'great-western-trail.settings';
const CPU_NAMES = ['テックス', 'ダコタ', 'ローハイド'];
const LEVELS = ['normal', 'strong'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const enc = (command) => encodeURIComponent(JSON.stringify(command));
// 命令を比べるための、キーの順にそろえた文字列
const canonical = (value) => JSON.stringify(value, (key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
// 自分の操作の効果音
const COMMAND_SOUNDS = { move: 'place', local: 'gain', aux: 'gain', choose: 'select', skip: 'cancel', end: 'place' };
const HINT_TEXT = { local: 'この場所のアクション', aux: '補助アクション', choose: '光っているカードを選ぶ', skip: '飛ばす', end: '手番を終える' };
const cmdButton = (command, label, cls = '', disabled = false) =>
    `<button class="opt ${cls}" data-cmd="${enc(command)}"${disabled ? ' disabled' : ''}>${label}</button>`;
const actButton = (act, arg, label, cls = '', disabled = false) =>
    `<button class="opt ${cls}" data-act="${act}" data-arg="${escapeHtml(arg ?? '')}"${disabled ? ' disabled' : ''}>${label}</button>`;
const money = (n) => (n < 0 ? `−$${-n}` : `$${n}`);

function loadSettings() {
    const fallback = { count: 3, level: 'normal' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(saved.count) && saved.count >= MIN_PLAYERS && saved.count <= MAX_PLAYERS ? saved.count : fallback.count,
            level: LEVELS.includes(saved.level) ? saved.level : fallback.level
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

// ---- 文言 ----
export function effectLabel(effect) {
    switch (effect.e) {
        case 'discard': {
            const what = effect.need === 'pair' ? '同じ品種2枚' : effect.need === 'any' ? '牛1枚' : BREEDS[effect.need].name;
            const gain = [effect.cert ? `証明書+${effect.cert}` : '', effect.money ? `$${effect.money}` : ''].filter(Boolean).join('と');
            return `${what}を捨てて${gain}`;
        }
        case 'hire': return `労働者を雇う${effect.mod > 0 ? `（+$${effect.mod}）` : effect.mod < 0 ? `（−$${-effect.mod}）` : ''}`;
        case 'build': return `建物を建てる（職人1人$${effect.per}）`;
        case 'certOrObjective': return '証明書+1か目標カード';
        case 'engine': return `機関車を${effect.max === 'engineers' ? '技師の数' : effect.max}マスまで進める`;
        case 'tradeOrEngine': return '交易か、$2で機関車を2マスまで';
        case 'aux': return '補助アクション（倍も可）';
        case 'buy': return '牛を買う';
        case 'hazard': return `災害を取り除く（$${effect.cost}）`;
        case 'moveAgain': return `${effect.max}歩まで進み、そこを使う`;
        case 'woods': return '森の自分の建物1つにつき$2';
        case 'teepeePairs': return '緑と青のティーピーの組ごとに証明書+2と$2';
        case 'tradeOrAux': return '交易か補助アクション（倍も可）';
        case 'specialDelivery': return '特別な配達（機関車を戻した数の都市へ）';
        case 'certMax': return '証明書を上限まで';
        default: return effect.e;
    }
}

export function auxLabel(kind, double) {
    const k = double ? 2 : 1;
    switch (kind) {
        case 'money': return `$${k}を得る`;
        case 'draw': return `${k}枚引いて${k}枚捨てる`;
        case 'cert': return `$${k}払い機関車を${k}戻して証明書+${k}`;
        case 'engine': return `$${k}払い機関車を${k}マスまで進める`;
        case 'remove': return `機関車を${k}戻して手札${k}枚まで除く`;
        default: return kind;
    }
}

const workerShort = { cowboy: 'カ', craftsman: '職', engineer: '技' };
const workerChip = (w) => `<span class="wk wk-${w}">${workerShort[w]}</span>`;

function tileHtml(tile) {
    if (!tile) return '<span class="tile empty">—</span>';
    if (tile.t === 'worker') return `<span class="tile worker">${workerChip(tile.w)}${WORKERS[tile.w]}</span>`;
    if (tile.t === 'hazard') return `<span class="tile"><i class="hz" style="background:${HAZARD_COLORS[tile.type]}"></i>${HAZARD_TYPES[tile.type]}${tile.vp}点</span>`;
    return `<span class="tile"><i class="tp" style="border-bottom-color:${TEEPEE_COLORS[tile.color]}"></i>${tile.color === 'green' ? '緑' : '青'}のティーピー</span>`;
}

function cardHtml(id, { selected = false, dim = false, small = false } = {}) {
    const c = card(id);
    if (c.kind === 'objective') {
        return `<button class="card objective${selected ? ' selected' : ''}${dim ? ' dim' : ''}${small ? ' small' : ''}" data-card="${id}">
            <span class="card-top">目標</span><span class="card-tasks">${c.tasks.map(t => TASK_SHORT[t]).join('')}</span><span class="card-vp">${c.vp}/−${c.minus}</span></button>`;
    }
    const b = BREEDS[c.breed];
    return `<button class="card cattle${selected ? ' selected' : ''}${dim ? ' dim' : ''}${small ? ' small' : ''}" data-card="${id}" style="--breed:${b.color}">
        <span class="card-value">${b.value}</span><span class="card-name">${b.name}</span>${c.vp ? `<span class="card-vp">${c.vp}点</span>` : ''}</button>`;
}

function objectiveHtml(id, extra = '') {
    const o = OBJECTIVES[id];
    return `<span class="obj">${o.tasks.map(t => `<b class="task task-${t}" title="${TASK_NAMES[t]}">${TASK_SHORT[t]}</b>`).join('')}<span class="obj-vp">+${o.vp}${o.minus ? `/−${o.minus}` : ''}</span>${extra}</span>`;
}

const teepeeName = (s, spot) => {
    const i = TRADE_SPOTS.indexOf(spot);
    const tile = s.spots[spot];
    return `${tile.color === 'green' ? '緑' : '青'}のティーピー（${TRADE_VALUES[i] >= 0 ? '+' : '−'}$${Math.abs(TRADE_VALUES[i])}）`;
};
const hazardName = (s, spot) => `${HAZARD_TYPES[s.spots[spot].type]}（${s.spots[spot].vp}点）`;

// 同じ行き先の道のりは、通行料の安いもの（同じなら、ほかの人に払う額の少ないもの）
function bestPaths(s, seat, paths) {
    const best = new Map();
    paths.forEach(path => {
        const dest = path.at(-1);
        const toll = pathToll(s, seat, path);
        const toPlayers = path.reduce((sum, id) => sum + (tollOf(s, seat, id)?.to !== null && tollOf(s, seat, id) ? tollOf(s, seat, id).amount : 0), 0);
        const cur = best.get(dest);
        if (!cur || toll < cur.toll || (toll === cur.toll && toPlayers < cur.toPlayers)) best.set(dest, { path, toll, toPlayers });
    });
    return [...best.values()];
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.tab = 'trail';
        this.boardSeat = null;
        this.sel = {};
        this.selKey = '';
        this.picks = { trail: {}, rail: {} };
        this.lastLogSeq = 0;
        this.wide = window.matchMedia('(min-width: 900px)');
        this.board = new BoardView($('#trail'), { onPick: (id) => this.onPick('trail', id) });
        this.rail = new RailView($('#rail'), { onPick: (space) => this.onPick('rail', space) });
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'グレート・ウエスタン・トレイル',
            game: 'great-western-trail',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 560,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onUpdate(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                this.controller = null;
                this.showTitle();
            }
        });
        this.bindStatic();
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
                onUpdate: () => this.onUpdate(),
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
        this.view = this.controller.getView();
        this.lastLogSeq = this.view.logs.at(-1)?.seq ?? 0;
        this.boardSeat = this.view.seat;
        this.sel = {};
        this.selKey = '';
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.setTab(this.wide.matches ? 'market' : 'trail');
        this.board.resize();
        this.board.resetZoom();
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {}, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        ['#result', '#log'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    onUpdate() {
        if (!this.controller) return;
        const before = { over: this.view?.over, myTurn: !!this.view && this.myTurn() };
        this.view = this.controller.getView();
        const logs = this.view.logs.filter(l => l.seq > this.lastLogSeq);
        this.lastLogSeq = this.view.logs.at(-1)?.seq ?? this.lastLogSeq;
        // ほかの人の手は、短く知らせる
        const others = logs.filter(l => l.seat !== null && l.seat !== this.view.seat);
        if (others.length > 0) this.flash = others.map(l => `${this.view.state.players[l.seat].name}：${l.text}`).slice(-2);
        const system = logs.filter(l => l.seat === null).at(-1);
        if (system) this.toast(system.text, 3000);
        this.playSound(before, others);
        this.render();
        if (this.view.over) {
            if (!before.over) this.recordLocalResult(this.view);
            setTimeout(() => this.showResult(), 700);
        }
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view.over) return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners(view.winners, view.seat, view.state.players.length) });
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (button) this.changeSetting({ count: Number(button.dataset.count) });
        });
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (button) this.changeSetting({ level: button.dataset.level });
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
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => this.openDialog('#help'));
        $('#open-help-game').addEventListener('click', () => this.openDialog('#help'));
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#zoom-in').addEventListener('click', () => this.board.zoomBy(1.6));
        $('#zoom-out').addEventListener('click', () => this.board.zoomBy(1 / 1.6));
        $('#zoom-fit').addEventListener('click', () => this.board.resetZoom());
        document.querySelectorAll('dialog .close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
        document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', (event) => {
            if (event.target === dialog && dialog.id !== 'result') dialog.close();
        }));
        $('#tabs').addEventListener('click', (event) => {
            const button = event.target.closest('[data-tab]');
            if (button) this.setTab(button.dataset.tab);
        });
        $('#players').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-seat]');
            if (!chip) return;
            this.boardSeat = Number(chip.dataset.seat);
            this.setTab('board');
            this.render();
        });
        // 選択肢のボタン（パネル・市場・ボード）
        document.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-cmd], button[data-act]');
            if (!button || button.disabled || !this.controller || $('#screen-game').hidden) return;
            if (button.dataset.cmd) this.send(JSON.parse(decodeURIComponent(button.dataset.cmd)));
            else this.onAct(button.dataset.act, button.dataset.arg);
        });
        $('#hand').addEventListener('click', (event) => {
            const c = event.target.closest('[data-card]');
            if (c) this.onCardTap(c.dataset.card);
        });
        window.addEventListener('resize', () => {
            if (!this.controller) return;
            if (this.wide.matches && ['trail', 'rail'].includes(this.tab)) this.setTab('market');
            this.board.resize();
        });
    }

    openDialog(selector) {
        const dialog = $(selector);
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.scroll')?.scrollTo(0, 0);
    }

    changeSetting(change) {
        this.settings = { ...this.settings, ...change };
        saveSettings(this.settings);
        this.renderSetup();
    }

    renderSetup() {
        const { count, level } = this.settings;
        const counts = [];
        for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) counts.push(n);
        $('#count').innerHTML = counts.map(n => `<button data-count="${n}" role="radio" aria-checked="${n === count}" class="${n === count ? 'on' : ''}">${n}人</button>`).join('');
        $('#level').innerHTML = LEVELS.map(l => `<button data-level="${l}" role="radio" aria-checked="${l === level}" class="${l === level ? 'on' : ''}">${PROFILES[l].name}</button>`).join('');
    }

    setTab(tab) {
        if (this.wide.matches && ['trail', 'rail'].includes(tab)) tab = 'market';
        this.tab = tab;
        document.querySelectorAll('#tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
        $('#screen-game').dataset.tab = tab;
        if (tab === 'trail') requestAnimationFrame(() => this.board.resize());
    }

    toast(text, ms = 2200) {
        const el = $('#toast');
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
    }

    send(command) {
        if (!this.controller) return;
        this.flash = null;
        this.sending = command;
        try {
            this.controller.send(command);
        } finally {
            this.sending = null;
        }
    }

    // 1つの更新に1つの音。自分の操作は結果の音、ほかの人の手は notify、自分の番になったら turn
    playSound(before, others) {
        const view = this.view;
        if (view.over) {
            if (!before.over) music.play(view.winners.includes(view.seat) ? 'win' : 'lose');
        } else if (this.sending) {
            music.play(COMMAND_SOUNDS[this.sending.type] ?? 'place');
        } else if (this.myTurn() && !before.myTurn) {
            music.play('turn');
        } else if (others.length > 0) {
            music.play('notify');
        }
    }

    // ---- ヒント ----

    showHint() {
        if (!this.view || !this.myTurn()) return;
        if (this.controller?.isOnline) return;
        const command = suggest(this.controller.game, this.view.seat);
        if (!command) return;
        music.play('select');
        this.hint = { at: this.controller.game.commands.length, command };
        if (command.type === 'choose' && command.cards) this.sel = { ...this.sel, cards: [...command.cards] };
        this.render();
        const marked = document.querySelector('.recommended');
        if (marked) marked.scrollIntoView({ block: 'nearest' });
        this.toast(`おすすめ：${command.type === 'move' ? '光っている場所へ進む' : HINT_TEXT[command.type] ?? '光っている選択肢'}`);
    }

    // おすすめの命令と同じ選択肢のボタンに .recommended を付ける。盤面が進んだら消す
    markHint() {
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        $('#hint').disabled = !this.myTurn();
        const hint = this.hint;
        if (!hint || this.controller?.isOnline || hint.at !== this.controller?.game.commands.length || !this.myTurn()) {
            this.hint = null;
            return;
        }
        const want = canonical(hint.command);
        document.querySelectorAll('button[data-cmd]').forEach(button => {
            if (canonical(JSON.parse(decodeURIComponent(button.dataset.cmd))) === want) button.classList.add('recommended');
        });
        (hint.command.cards ?? []).forEach(id => document.querySelectorAll(`#hand [data-card="${id}"]`).forEach(el => el.classList.add('recommended')));
    }

    // ---- 描画 ----

    get state() {
        return this.view.state;
    }

    myTurn() {
        const s = this.state;
        return s.phase === 'play' && s.turn.seat === this.view.seat;
    }

    render() {
        if (!this.view) return;
        const s = this.state;
        const decision = this.myTurn() ? this.decision() : null;
        const key = this.myTurn() ? JSON.stringify([s.turn.stage, s.turn.queue[0] ?? null, s.turn.used, s.players[this.view.seat].loc]) : '';
        if (key !== this.selKey) {
            this.selKey = key;
            this.sel = {};
            if (decision?.tab && !this.wide.matches) this.setTab(decision.tab);
            else if (decision?.tab && this.wide.matches && ['market', 'board'].includes(decision.tab)) this.setTab(decision.tab);
            // 進む番は、自分の牧場主のあたりを拡大する
            const loc = s.players[this.view.seat].loc;
            if (decision?.trailPicks && Object.keys(decision.trailPicks).length > 0) {
                const ids = Object.keys(decision.trailPicks);
                const pts = (loc && loc !== 'KC' ? [loc, ...ids] : ids).map(posOf);
                requestAnimationFrame(() => this.board.focus(pts));
            }
        }
        const d = this.myTurn() ? this.decision() : null; // 選択（sel）を消したあとで作り直す
        this.renderTop();
        this.renderPlayers();
        this.picks = { trail: d?.trailPicks ?? {}, rail: d?.railPicks ?? {} };
        this.board.render(s, Object.keys(this.picks.trail));
        this.rail.render(s, Object.keys(this.picks.rail).map(Number), this.view.seat);
        this.renderMarket(d);
        this.renderBoard();
        this.renderPanel(d);
        this.renderHand(d);
        this.markHint();
    }

    renderTop() {
        const s = this.state;
        const rows = JOB_COSTS.length;
        $('#round-info').innerHTML = `<b>ラウンド${s.round}</b><span>求人 ${Math.min(s.job.row + 1, rows)}/${rows}段${s.end.by !== null ? '・最後の手番' : ''}</span>`;
    }

    renderPlayers() {
        const s = this.state;
        const standings = new Map((this.view.standings ?? this.view.results ?? []).map(r => [r.seat, r.total]));
        $('#players').innerHTML = s.players.map(p => `<button class="pchip${p.seat === s.turn.seat && s.phase === 'play' ? ' active' : ''}${p.seat === this.boardSeat && this.tab === 'board' ? ' viewing' : ''}" data-seat="${p.seat}" style="--pc:${PLAYER_COLORS[p.seat]}">
            <span class="pname"><i class="dot"></i>${escapeHtml(p.name)}</span>
            <span class="pstats"><b>${money(p.money)}</b><small>${standings.has(p.seat) ? `${standings.get(p.seat)}点` : ''}</small></span></button>`).join('');
    }

    renderMarket(d) {
        const s = this.state;
        const hire = d?.hirePicks ?? {};
        const foresight = [0, 1, 2].map(col => `<div class="fs-col"><span class="fs-label">${col + 1}</span>${s.foresight[col].map(tileHtml).join('')}</div>`).join('');
        const rows = s.job.rows.map((row, r) => {
            const token = r === s.job.row;
            const cells = row.map((w, c) => {
                const pick = hire[`${r},${c}`];
                if (!w) return `<td class="${token && c === s.job.fill ? 'next' : ''}"></td>`;
                return `<td>${pick ? `<button class="wk-btn" data-cmd="${enc(pick.command)}" title="${WORKERS[w]} ${money(pick.cost)}">${workerChip(w)}</button>` : workerChip(w)}</td>`;
            }).join('');
            return `<tr class="${token ? 'token' : ''}${r < s.job.row ? '' : ' locked'}"><th>${r + 1}</th>${cells}<td class="cost">$${JOB_COSTS[r]}${token ? '<i class="token-mark">◆</i>' : ''}</td></tr>`;
        }).join('');
        const market = [...s.market].sort((a, b) => BREED_ORDER.indexOf(card(a).breed) - BREED_ORDER.indexOf(card(b).breed) || card(a).vp - card(b).vp)
            .map(id => cardHtml(id, { small: true })).join('');
        const objectives = s.objDisplay.map(id => `<div class="obj-card">${objectiveHtml(id)}<small>${OBJECTIVE_ACTION_NAMES[OBJECTIVES[id].action]}</small></div>`).join('');
        $('#view-market').innerHTML = `
            <section><h3>カンザスシティの先読み</h3><div class="foresight">${foresight}</div></section>
            <section><h3>求人市場 <small>◆の段は、まだ雇えません</small></h3><table class="job">${rows}</table></section>
            <section><h3>牛の市場 <small>山 ${s.marketStack.length}枚・補充は求人市場の7段目と10段目</small></h3><div class="market-cards">${market || '<span class="muted">なし</span>'}</div></section>
            <section><h3>目標カード <small>山 ${s.objStack.length}枚</small></h3><div class="obj-cards">${objectives || '<span class="muted">なし</span>'}</div></section>`;
    }

    renderBoard() {
        const s = this.state;
        const seat = this.boardSeat ?? this.view.seat;
        const p = s.players[seat];
        const mine = seat === this.view.seat;
        const sc = scoreOf(s, seat);
        const counts = taskCounts(s, p);
        const discs = DISC_ORDER.map(k => {
            const removed = DISCS[k].count - p.discs[k];
            return `<li class="${removed > 0 ? 'open' : ''}">${'●'.repeat(p.discs[k])}${'○'.repeat(removed)} ${DISCS[k].name}</li>`;
        }).join('');
        const owned = mine ? ownedCards(p) : [...p.deck, ...p.discard];
        const breedCounts = BREED_ORDER.map(b => [b, owned.filter(id => card(id).kind === 'cattle' && card(id).breed === b).length]).filter(([, n]) => n > 0);
        const herd = breedCounts.map(([b, n]) => `<span class="herd" style="--breed:${BREEDS[b].color}"><i></i>${BREEDS[b].name}${BREEDS[b].value}×${n}</span>`).join('');
        const obj = objectiveScore(s, p);
        const objs = p.objectives.map(id => objectiveHtml(id, obj.done.includes(id) ? '<em class="ok">達成</em>' : '')).join('');
        const buildings = p.buildings.map(n => `<span class="bld" title="職人${BUILDINGS[n].craft}・${BUILDINGS[n].vp}点">${n}<small>職${BUILDINGS[n].craft}</small></span>`).join('');
        const masters = p.masters.map(m => `<li>${MASTERS[m].text}</li>`).join('');
        $('#view-board').innerHTML = `
            <section class="board-head" style="--pc:${PLAYER_COLORS[seat]}"><h3><i class="dot"></i>${escapeHtml(p.name)}のボード</h3>
                <div class="stats">
                    <span>お金 <b>${money(p.money)}</b></span><span>証明書 <b>${p.cert}</b>/${certLimit(p)}${permCerts(p) ? `＋恒久${permCerts(p)}` : ''}</span>
                    <span>手札 <b>${mine ? p.hand.length : p.handCount}</b>/${handLimit(p)}</span><span>歩数 <b>${stepLimit(s, p)}</b></span>
                    <span>山札 ${p.deck.length}・捨て札 ${p.discard.length}</span><span>機関車 <b>${spaceName(p.engine)}</b></span>
                </div></section>
            <section><h3>労働者</h3><div class="workers">${WORKER_TYPES.map(w => `<span>${workerChip(w)}${WORKERS[w]} <b>${p.workers[w]}</b>/6</span>`).join('')}</div></section>
            <section><h3>牛の群れ</h3><div class="herds">${herd}</div></section>
            <section><h3>円盤 <small>○は外したもの（使えるようになった）</small></h3><ul class="discs">${discs}</ul></section>
            <section><h3>目標カード</h3><div class="objs">${objs}</div>
                <p class="muted small">建${counts.B}・緑${counts.G}・青${counts.BL}・災${counts.H}・駅${counts.S}・牛3=${counts[3]}・牛4=${counts[4]}・牛5=${counts[5]}・SF${counts.SF}</p></section>
            <section><h3>建てられる建物</h3><div class="blds">${buildings || '<span class="muted">なし</span>'}</div></section>
            ${masters ? `<section><h3>駅長</h3><ul class="masters">${masters}</ul></section>` : ''}
            <section><h3>今の得点 <b>${sc.total}点</b></h3><p class="muted small">お金${sc.money}・建物${sc.buildings}・都市${sc.cities}・駅${sc.stations}・災害${sc.hazards}・牛${sc.cattle}・目標${sc.objectives}・駅長${sc.masters}・労働者${sc.workers}・歩数${sc.step}・求人${sc.token}</p></section>`;
    }

    renderHand(d) {
        const s = this.state;
        const p = s.players[this.view.seat];
        const select = d?.select;
        const hand = [...p.hand].sort((a, b) => {
            const ca = card(a);
            const cb = card(b);
            return (ca.kind === 'objective') - (cb.kind === 'objective') || BREED_ORDER.indexOf(ca.breed) - BREED_ORDER.indexOf(cb.breed);
        });
        $('#hand').innerHTML = hand.map(id => cardHtml(id, {
            selected: (this.sel.cards ?? []).includes(id),
            dim: select?.only ? !select.only.includes(id) : false
        })).join('') + `<span class="hand-info">繁殖値 <b>${breedingValue(p.hand) + permCerts(p)}</b><small>＋証${p.cert}</small></span>`;
        $('#hand').classList.toggle('selecting', !!select);
    }

    renderPanel(d) {
        const s = this.state;
        const status = $('#status');
        const work = $('#work');
        if (s.phase === 'over') {
            status.innerHTML = '<b>ゲーム終了</b>';
            work.innerHTML = `<div class="options">${'<button class="opt primary" data-act="result">結果を見る</button>'}</div>`;
            return;
        }
        if (!d) {
            const p = s.players[s.turn.seat];
            status.innerHTML = `<b style="color:${PLAYER_COLORS[p.seat]}">${escapeHtml(p.name)}</b><span>の番…</span>`;
            work.innerHTML = (this.flash ?? []).map(t => `<p class="flash">${escapeHtml(t)}</p>`).join('');
            return;
        }
        status.innerHTML = `<b class="you">あなたの番</b><span>${d.title}</span>`;
        work.innerHTML = `${d.note ? `<p class="note">${d.note}</p>` : ''}<div class="options">${d.html}</div>`;
    }

    // ---- 今の選択 ----
    // 返すもの：title（見出し）・note・html（ボタン）・trailPicks / railPicks（タップで送る操作）・hirePicks・select（手札の選び方）・tab
    decision() {
        const s = this.state;
        const me = this.view.seat;
        const t = s.turn;
        const p = s.players[me];
        const item = t.queue[0];
        if (item) return this.choiceDecision(item);
        const objectives = p.hand.filter(id => card(id).kind === 'objective');
        const objButtons = objectives.map(id => cmdButton({ type: 'objective', card: id }, `目標カードを出す ${objectiveHtml(id)}<small>${OBJECTIVE_ACTION_NAMES[OBJECTIVES[id].action]}</small>`, 'objective-play')).join('');
        if (t.stage === 'move') {
            const limit = stepLimit(s, p);
            const list = bestPaths(s, me, movePaths(s, me, limit));
            const trailPicks = {};
            const buttons = list.map(({ path, toll }) => {
                const command = { type: 'move', path };
                trailPicks[path.at(-1)] = command;
                return cmdButton(command, `${locName(s, path.at(-1))}<small>${p.loc === null ? '' : `${path.length}歩`}${toll ? `・通行料$${toll}` : ''}</small>`, path.at(-1) === 'KC' ? 'kc' : '');
            });
            return {
                title: p.loc === null ? '最初の場所（中立の建物）を選ぶ' : `進む（${limit}歩まで）`,
                note: '道の光った場所を押すか、下から選んでください',
                html: buttons.join('') + objButtons,
                trailPicks, tab: 'trail'
            };
        }
        // 場所を使う
        const actions = localActions(s, me);
        const buttons = [];
        if (t.mode !== 'aux') {
            actions.forEach((effect, index) => {
                const used = t.used.includes(index);
                const ok = !used && canStart(s, me, effect);
                buttons.push(cmdButton({ type: 'local', index }, `${effectLabel(effect)}${used ? '<small>使った</small>' : ''}`, 'local', !ok));
            });
        }
        if (!t.mode) auxOptions(s, me, false).forEach(o => buttons.push(cmdButton({ type: 'aux', kind: o.kind }, `補助：${auxLabel(o.kind, false)}`, 'aux')));
        buttons.push(cmdButton({ type: 'end' }, '手番を終える', 'end'));
        const tile = s.spots[p.loc];
        const where = locName(s, p.loc);
        const note = actions.length > 0
            ? (t.mode === 'aux' ? '補助アクションを使いました' : '好きな順に1回ずつ使えます。使わないなら、補助アクションを1つ')
            : (tile?.t === 'neutral' || tile?.owner === me ? '' : 'ここでは補助アクションを1つだけ使えます');
        return { title: where, note, html: buttons.join('') + objButtons };
    }

    choiceDecision(item) {
        const s = this.state;
        const me = this.view.seat;
        const p = s.players[me];
        const list = choiceCandidates(s, me, item);
        const choose = (c) => ({ type: 'choose', ...c });
        const skipLabel = { buy: '買い終える', upgrade: '改良しない', workerBonus: '使わない', masterAction: '使わない', objDraw: '引かない', objMove: '進まない' }[item.p] ?? 'やめる';
        const skip = item.optional ? cmdButton({ type: 'skip' }, skipLabel, 'skip') : '';
        const trailPicks = {};
        const railPicks = {};
        const buttons = [];
        const d = { title: '', note: '', trailPicks, railPicks };
        const finish = (extra = {}) => ({ ...d, ...extra, html: buttons.join('') + skip });

        switch (item.p) {
            case 'discard':
                if (item.need === 'pair') {
                    list.forEach(c => buttons.push(cmdButton(choose(c), `${BREEDS[c.breed].name}を2枚`)));
                    return finish({ title: `同じ品種2枚を捨てて$${item.money}` });
                }
                return finish({ title: '捨てる牛を選ぶ', note: '手札の牛を押してください', select: { mode: 'one', only: list.map(c => c.cards[0]) } });
            case 'hire':
            case 'workerBonus':
                if (item.p === 'hire' || item.bonus === 'hireMinus2') {
                    const mod = item.p === 'hire' ? item.mod : -2;
                    const hirePicks = {};
                    list.forEach(c => {
                        const h = hireableWorkers(s).find(x => x.row === c.worker[0] && x.col === c.worker[1]);
                        const cost = Math.max(0, h.cost + mod);
                        hirePicks[`${h.row},${h.col}`] = { command: choose(c), cost };
                    });
                    // 同じ種類・同じ値段は1つのボタンにまとめる
                    const seen = new Set();
                    Object.values(hirePicks).sort((a, b) => a.cost - b.cost).forEach(({ command, cost }) => {
                        const h = hireableWorkers(s).find(x => x.row === command.worker[0] && x.col === command.worker[1]);
                        const key = `${h.w}:${cost}`;
                        if (seen.has(key)) return;
                        seen.add(key);
                        buttons.push(cmdButton(command, `${workerChip(h.w)}${WORKERS[h.w]}を雇う<small>${money(cost)}（${p.workers[h.w] + 1}人目）</small>`));
                    });
                    return finish({ title: item.p === 'hire' ? '雇う人を選ぶ' : '技師の特典：$2安く雇う', note: '求人市場の人を押すか、下から選んでください', hirePicks, tab: 'market' });
                }
                return this.bonusDecision(item, list, buttons, d, finish);
            case 'build':
                return this.buildDecision(list, buttons, d, finish, `建物を建てる（職人1人$${item.per}）`);
            case 'certOrObjective':
                list.forEach(c => {
                    if (c.option === 'cert') buttons.push(cmdButton(choose(c), '証明書+1'));
                    else if (c.pick === 'stack') buttons.push(cmdButton(choose(c), '目標カードを山から引く'));
                    else buttons.push(cmdButton(choose(c), `目標カード ${objectiveHtml(s.objDisplay[c.pick])}`));
                });
                return finish({ title: '証明書か目標カード' });
            case 'objectivePick':
                list.forEach(c => buttons.push(cmdButton(choose(c), c.pick === 'stack' ? '山から引く' : `目標カード ${objectiveHtml(s.objDisplay[c.pick])}`)));
                return finish({ title: '目標カードを1枚もらう', note: 'もらったカードは捨て札に入ります' });
            case 'engine':
            case 'back39':
                list.forEach(c => {
                    railPicks[c.to] = choose(c);
                    const st = stationAt(c.to);
                    buttons.push(cmdButton(choose(c), st !== null ? `駅${st + 1}<small>$${STATIONS[st].cost}で改良・${STATIONS[st].vp}点</small>` : spaceName(c.to)));
                });
                return finish({
                    title: item.p === 'engine' ? `機関車を${item.max}マスまで進める` : '終点に着いた：機関車を戻して$3',
                    note: '鉄道の光ったマスを押すか、下から選んでください', tab: 'rail'
                });
            case 'upgrade': return this.upgradeDecision(item, list, buttons, d, finish);
            case 'tradeOrEngine':
            case 'tradeOrAux':
            case 'masterAction':
                list.forEach(c => {
                    if (c.teepee) {
                        trailPicks[c.teepee] = choose(c);
                        buttons.push(cmdButton(choose(c), `交易：${teepeeName(s, c.teepee)}`));
                    } else if (c.hazard) {
                        trailPicks[c.hazard] = choose(c);
                        buttons.push(cmdButton(choose(c), `災害を除く：${hazardName(s, c.hazard)}`));
                    } else if (c.option === 'engine') buttons.push(cmdButton(choose(c), '$2払い、機関車を2マスまで進める'));
                    else if (c.option === 'aux') buttons.push(cmdButton(choose(c), `補助：${auxLabel(c.kind, c.double)}`));
                });
                return finish({
                    title: { tradeOrEngine: '交易か機関車', tradeOrAux: '交易か補助アクション', masterAction: '駅長：災害を無料で除くか交易' }[item.p],
                    note: '交易：ティーピーを1枚取り、上の金額を得ます（マイナスなら払う）', tab: 'trail'
                });
            case 'aux':
                list.forEach(c => buttons.push(cmdButton(choose(c), auxLabel(c.kind, c.double), c.double ? 'double' : '')));
                return finish({ title: item.double ? '補助アクション（倍も可）' : '補助アクション' });
            case 'auxBack': {
                if (item.kind === 'remove') {
                    const chosen = this.sel.cards ?? [];
                    const tos = [...new Set(list.map(c => c.to))];
                    tos.forEach(to => {
                        const command = choose({ to, cards: chosen });
                        railPicks[to] = command;
                        buttons.push(cmdButton(command, `${spaceName(to)}へ戻す<small>${chosen.length}枚除く</small>`));
                    });
                    return finish({ title: `機関車を${item.k}戻し、手札を${item.k}枚まで除く`, note: '除くカードを手札から選んでから、戻す先を選んでください', select: { mode: 'many', max: item.k }, tab: 'rail' });
                }
                list.forEach(c => {
                    railPicks[c.to] = choose(c);
                    buttons.push(cmdButton(choose(c), `${spaceName(c.to)}へ戻す`));
                });
                return finish({ title: `$${item.k}払い、機関車を${item.k}戻して証明書`, tab: 'rail' });
            }
            case 'drawDiscard': {
                const chosen = this.sel.cards ?? [];
                buttons.push(cmdButton(choose({ cards: chosen }), `${chosen.length}/${item.count}枚を捨てる`, 'primary', chosen.length !== item.count));
                return finish({ title: `${item.count}枚捨てる`, note: '捨てるカードを手札から選んでください', select: { mode: 'many', max: item.count } });
            }
            case 'buy': {
                list.forEach(c => {
                    if (c.option === 'refill') {
                        buttons.push(cmdButton(choose(c), 'カウボーイ1人で、市場に牛を2枚足す'));
                        return;
                    }
                    const o = BUY_OPTIONS.find(x => x.id === c.option);
                    const names = c.cards.map(id => `${BREEDS[card(id).breed].name}${card(id).vp ? `（${card(id).vp}点）` : ''}`).join('と');
                    buttons.push(cmdButton(choose(c), `${names}<small>${money(o.cost)}・カウボーイ${o.cowboys}</small>`));
                });
                return finish({ title: '牛を買う', note: `残りのカウボーイ ${item.cowboys}人・お金 ${money(p.money)}。買った牛は捨て札へ`, tab: 'market' });
            }
            case 'hazard':
                list.forEach(c => {
                    trailPicks[c.hazard] = choose(c);
                    buttons.push(cmdButton(choose(c), hazardName(s, c.hazard)));
                });
                return finish({ title: `災害を取り除く（$${item.cost}）`, note: '道の光った災害を押すか、下から選んでください', tab: 'trail' });
            case 'moveAgain':
            case 'objMove': {
                bestPaths(s, me, list.map(c => c.path)).forEach(({ path, toll }) => {
                    const command = choose({ path });
                    trailPicks[path.at(-1)] = command;
                    buttons.push(cmdButton(command, `${locName(s, path.at(-1))}<small>${path.length}歩${toll && item.p === 'moveAgain' ? `・通行料$${toll}` : ''}</small>`));
                });
                return finish({
                    title: item.p === 'moveAgain' ? `${item.max}歩まで進み、そこを使う` : '通行料なしで3歩まで進む',
                    note: item.p === 'objMove' ? '着いた場所は使えません' : '', tab: 'trail'
                });
            }
            case 'specialDelivery': return this.specialDecision(list, buttons, d, finish);
            case 'objDraw':
                list.forEach(c => buttons.push(cmdButton(choose(c), `${c.count}枚引く`)));
                return finish({ title: '3枚まで引いて、同じ数を捨てる' });
            case 'foresight':
                list.forEach(c => buttons.push(cmdButton(choose(c), tileHtml(s.foresight[item.col][c.index]))));
                return finish({ title: `先読み${item.col + 1}：1枚選ぶ`, note: '労働者は求人市場へ、災害は道へ、ティーピーは交易の場所へ', tab: 'market' });
            case 'deliver': return this.deliverDecision(list, buttons, d, finish);
            default:
                list.forEach(c => buttons.push(cmdButton(choose(c), JSON.stringify(c))));
                return finish({ title: item.p });
        }
    }

    bonusDecision(item, list, buttons, d, finish) {
        const s = this.state;
        const choose = (c) => ({ type: 'choose', ...c });
        switch (item.bonus) {
            case 'freeHazard':
                list.forEach(c => {
                    d.trailPicks[c.hazard] = choose(c);
                    buttons.push(cmdButton(choose(c), hazardName(s, c.hazard)));
                });
                return finish({ title: 'カウボーイの特典：災害を無料で取り除く', tab: 'trail' });
            case 'trade':
                list.forEach(c => {
                    d.trailPicks[c.teepee] = choose(c);
                    buttons.push(cmdButton(choose(c), teepeeName(s, c.teepee)));
                });
                return finish({ title: 'カウボーイの特典：交易', tab: 'trail' });
            case 'cheapBuild':
                return this.buildDecision(list, buttons, d, finish, '職人の特典：職人1人$1で建てる');
            default: {
                const label = { jerseyCert1: '証明書+1', jerseyCert2: '証明書+2', jerseyMoney2: '$2', jerseyMoney4: '$4' }[item.bonus];
                buttons.push(cmdButton(choose({}), `ジャージーを捨てて${label}`));
                return finish({ title: '技師の特典' });
            }
        }
    }

    buildDecision(list, buttons, d, finish, title) {
        const s = this.state;
        const choose = (c) => ({ type: 'choose', ...c });
        const tiles = [...new Set(list.map(c => c.tile))].sort((a, b) => a - b);
        const tile = tiles.includes(this.sel.tile) ? this.sel.tile : null;
        tiles.forEach(n => {
            const def = BUILDINGS[n];
            buttons.push(actButton('tile', n, `建物${n}<small>職人${def.craft}・${def.vp}点${def.hands ? `・手${def.hands.replace('g', '緑').replace('b', '黒')}` : ''}</small>`, n === tile ? 'on' : ''));
        });
        let note = '建てる建物を選んでください';
        if (tile) {
            const def = BUILDINGS[tile];
            list.filter(c => c.tile === tile).forEach(c => { d.trailPicks[c.spot] = choose(c); });
            note = `建物${tile}：${def.actions.map(effectLabel).join(' ／ ')}。道の光った場所を押してください（自分の建物の上は建て替え）`;
        }
        return finish({ title, note, tab: tile ? 'trail' : null });
    }

    upgradeDecision(item, list, buttons, d, finish) {
        const s = this.state;
        const p = s.players[this.view.seat];
        const st = s.stations[item.station];
        const def = STATIONS[item.station];
        const masters = [...new Set(list.map(c => c.master ?? ''))];
        const master = masters.includes(this.sel.master ?? '') ? (this.sel.master ?? '') : '';
        if (st.master && masters.length > 1) {
            buttons.push(`<div class="sub">駅長（列の一番右の労働者と交換）：${MASTERS[st.master].text}</div>`);
            masters.forEach(m => buttons.push(actButton('master', m, m ? `${workerChip(m)}${WORKERS[m]}を駅長に` : '駅長にしない', m === master ? 'on' : '')));
        }
        buttons.push(`<div class="sub">置く円盤を選ぶと改良します（$${def.cost}・${def.vp}点）</div>`);
        list.filter(c => (c.master ?? '') === master).forEach(c => buttons.push(cmdButton({ type: 'choose', ...c }, discLabel(p, c.disc), 'disc')));
        return finish({ title: `駅${item.station + 1}を改良する？`, note: list.length === 0 ? 'お金か円盤が足りないので改良できません' : '' });
    }

    specialDecision(list, buttons, d, finish) {
        const s = this.state;
        const me = this.view.seat;
        const p = s.players[me];
        const cities = [...new Set(list.map(c => c.city))];
        const city = cities.includes(this.sel.city) ? this.sel.city : null;
        cities.forEach(id => buttons.push(actButton('city', id, `${CITY_BY_ID[id].name}<small>都市の値${CITY_BY_ID[id].value}</small>`, id === city ? 'on' : '')));
        let note = '機関車を何マスか戻し、戻した数までの都市へ運賃なしで配達します。都市を選んでください';
        if (city) {
            const discs = [...new Set(list.filter(c => c.city === city).map(c => c.disc))];
            const disc = discs.includes(this.sel.disc) ? this.sel.disc : discs[0];
            discs.forEach(k => buttons.push(actButton('disc', k, discLabel(p, k), k === disc ? 'on' : '')));
            list.filter(c => c.city === city && c.disc === disc).forEach(c => {
                d.railPicks[c.to] = { type: 'choose', ...c };
                buttons.push(cmdButton({ type: 'choose', ...c }, `${spaceName(c.to)}へ戻す<small>${backCount(s, me, c.to)}マス</small>`));
            });
            note = '置く円盤を選び、戻す先を鉄道か下から選んでください';
        }
        return finish({ title: '特別な配達', note, tab: city ? 'rail' : null });
    }

    deliverDecision(list, buttons, d, finish) {
        const s = this.state;
        const me = this.view.seat;
        const p = s.players[me];
        const base = breedingValue(p.hand) + permCerts(p);
        const certOptions = [...new Set(list.map(c => c.certs))].sort((a, b) => a - b);
        const certs = certOptions.includes(this.sel.certs) ? this.sel.certs : (certOptions.at(-1) ?? 0);
        const value = base + certs;
        if (certOptions.length > 1) {
            buttons.push(`<div class="sub">使う証明書（今${p.cert}）</div>`);
            certOptions.forEach(n => buttons.push(actButton('certs', n, `${n}`, n === certs ? 'on' : '', false)));
        }
        const forCerts = list.filter(c => c.certs === certs);
        const cities = [...new Set(forCerts.map(c => c.city))];
        const city = cities.includes(this.sel.city) ? this.sel.city : null;
        buttons.push('<div class="sub">配達する都市</div>');
        CITIES.forEach(c => {
            if (c.value > value) return;
            const ok = cities.includes(c.id);
            const cost = transportCost(p.engine, c.value);
            const extra = cityNote(p, c);
            buttons.push(actButton('city', c.id, `${c.name}<small>${c.value}${cost ? `・運賃$${cost}` : ''}${extra ? `・${extra}` : ''}${!ok ? '・配達ずみ' : ''}</small>`, c.id === city ? 'on' : '', !ok));
        });
        if (city) {
            buttons.push('<div class="sub">置く円盤（外すと使えるようになる）</div>');
            forCerts.filter(c => c.city === city).forEach(c => buttons.push(cmdButton({ type: 'choose', ...c }, discLabel(p, c.disc), 'disc')));
        }
        return finish({ tab: 'rail', title: `収入と配達：繁殖値 ${value}`, note: `手札の違う品種の繁殖値${breedingValue(p.hand)}${permCerts(p) ? `＋恒久の証明書${permCerts(p)}` : ''}＋証明書${certs}。収入 $${value}` });
    }

    // ---- 操作 ----

    onAct(act, arg) {
        switch (act) {
            case 'result': this.showResult(); return;
            case 'tile': this.sel = { ...this.sel, tile: Number(arg) }; break;
            case 'master': this.sel = { ...this.sel, master: arg }; break;
            case 'city': this.sel = { ...this.sel, city: arg }; break;
            case 'disc': this.sel = { ...this.sel, disc: arg }; break;
            case 'certs': this.sel = { ...this.sel, certs: Number(arg), city: null }; break;
            default: return;
        }
        this.renderLocal();
    }

    // 選択（sel）だけが変わったときの描き直し
    renderLocal() {
        const d = this.myTurn() ? this.decision() : null;
        this.picks = { trail: d?.trailPicks ?? {}, rail: d?.railPicks ?? {} };
        this.board.render(this.state, Object.keys(this.picks.trail));
        this.rail.render(this.state, Object.keys(this.picks.rail).map(Number), this.view.seat);
        if (d?.tab && (!this.wide.matches || ['market', 'board'].includes(d.tab))) this.setTab(d.tab);
        const ids = Object.keys(this.picks.trail);
        if (ids.length > 0) requestAnimationFrame(() => this.board.focus(ids.map(posOf)));
        this.renderPanel(d);
        this.renderHand(d);
        this.markHint();
    }

    onPick(kind, id) {
        const command = this.picks[kind][id];
        if (command) this.send(command);
    }

    onCardTap(id) {
        if (!this.view) return;
        const d = this.myTurn() ? this.decision() : null;
        const select = d?.select;
        if (select?.mode === 'one') {
            if (select.only.includes(id)) this.send({ type: 'choose', cards: [id] });
            return;
        }
        if (select?.mode === 'many') {
            const cards = this.sel.cards ?? [];
            if (cards.includes(id)) this.sel = { ...this.sel, cards: cards.filter(x => x !== id) };
            else if (cards.length < select.max) this.sel = { ...this.sel, cards: [...cards, id] };
            this.renderLocal();
            return;
        }
        const c = card(id);
        if (c.kind === 'objective') this.toast(`目標：${c.tasks.map(t => TASK_NAMES[t]).join('・')}（+${c.vp}/−${c.minus}）。出すと：${OBJECTIVE_ACTION_NAMES[c.action]}`, 3600);
        else this.toast(`${BREEDS[c.breed].name}：繁殖値${c.value}${c.vp ? `・${c.vp}点` : ''}`);
    }

    showLog() {
        const logs = this.controller.getView().logs;
        const s = this.state;
        $('#log-list').innerHTML = logs.slice().reverse().map(l => `<li><b style="color:${l.seat !== null ? PLAYER_COLORS[l.seat] : 'inherit'}">${l.seat !== null ? escapeHtml(s.players[l.seat].name) : '—'}</b> ${escapeHtml(l.text)}</li>`).join('');
        this.openDialog('#log');
    }

    showResult() {
        if (!this.view?.over || $('#result').open) return;
        const results = this.view.results;
        const me = this.view.seat;
        const win = this.view.winners.includes(me);
        $('#result-title').textContent = win ? (this.view.winners.length > 1 ? '引き分け（勝ち）' : 'あなたの勝ち') : `${results[0].name}の勝ち`;
        const rows = [['money', 'お金'], ['buildings', '建物'], ['cities', '都市'], ['stations', '駅'], ['hazards', '災害'], ['cattle', '牛'], ['objectives', '目標'], ['masters', '駅長'], ['workers', '労働者'], ['step', '歩数'], ['token', '求人']];
        const head = results.map(r => `<th style="color:${PLAYER_COLORS[r.seat]}">${escapeHtml(r.name)}</th>`).join('');
        const body = rows.map(([k, label]) => `<tr><td>${label}</td>${results.map(r => `<td>${r[k]}</td>`).join('')}</tr>`).join('');
        $('#result-body').innerHTML = `<table class="result-table"><thead><tr><th></th>${head}</tr></thead><tbody>${body}
            <tr class="total"><td>合計</td>${results.map(r => `<td>${r.total}</td>`).join('')}</tr></tbody></table>
            <p class="muted small">同点なら勝ちを分け合います。残ったお金：${results.map(r => `${escapeHtml(r.name)} $${r.moneyLeft}`).join('・')}</p>`;
        this.openDialog('#result');
    }
}

function discLabel(p, key) {
    if (key === 'station') return '駅の円盤を使う';
    const def = DISCS[key];
    const extra = key === 'hand' ? '（$5）' : key === 'step1' ? '（+$3）' : '';
    return `${def.name}${extra}<small>${p.discs[key]}個</small>`;
}

function cityNote(p, c) {
    if (c.id === 'kc') return '+$6・−6点';
    if (c.id === 'sf') return '+9点';
    const notes = [];
    if (c.id === 'sacramento') notes.push('+6点');
    CITY_LINKS.forEach(l => {
        const other = l.a === c.id ? l.b : l.b === c.id ? l.a : null;
        if (!other || p.cities[other] === 0 || p.cities[c.id] > 0) return;
        if (l.vp) notes.push(`${l.vp > 0 ? '+' : ''}${l.vp}点`);
        if (l.objective) notes.push('目標カード');
    });
    return notes.join('・');
}
