/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import {
    MIN_PLAYERS, MAX_PLAYERS, CELLS, BLOCKED, PARTS, ROLE_BY_KEY, GEAR_BY_KEY, DIRS, LEVELS, TILE_NAMES,
    rowOf, colOf, adjacent
} from './data.js';
import { END_REASONS } from './game.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の席だけを動かす。ヒント・待った・自動で引く処理はない（嵐のカードは自分で引く）
function onlineAdapter(net) {
    const mySeat = () => net.getView()?.you;
    return {
        isOnline: true,
        mode: 'team',
        net,
        getView: () => net.getView(),
        canControl: (seat) => seat === mySeat(),
        send: (seat, command) => seat === mySeat() && net.send(command),
        get awaitingResponse() { return net.awaitingResponse; },
        suggest: () => null,
        canUndo: () => false,
        undo: () => false,
        scheduleCpu() {},
        scheduleStorm() {},
        stop: () => net.stop()
    };
}

// 自分の操作の音（コマンドの種類ごと）
const COMMAND_SOUND = {
    move: 'place', tunnel: 'place', navigate: 'place', dig: 'capture', excavate: 'draw', pickup: 'gain',
    collect: 'gain', water: 'pay', give: 'pay', calm: 'select', pass: 'select', storm: 'draw', gear: 'place', launch: 'win'
};

const SETTINGS_KEY = 'forbidden-desert.settings';
const CPU_NAMES = ['ハル', 'ミナ', 'ソラ', 'ユキ'];
const ROLE_MARK = { archeologist: '考', climber: '登', explorer: '探', meteorologist: '気', navigator: '航', waterCarrier: '水' };
const PART = Object.fromEntries(PARTS.map(p => [p.key, p]));
const POWER_LABEL = { meteorologist: '静める', waterCarrier: 'くむ', navigator: '動かす' };
// ヒントが指す場面（手を打つと変わる）
const hintKey = (v) => JSON.stringify([v.logTotal, v.phase, v.actionsLeft, v.current]);

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const svg = (body, cls = 'line-icon') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${body}</svg>`;
export const ICONS = {
    home: svg('<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
    log: svg('<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
    excavate: svg('<path d="M4 20h16"/><path d="M14 4l6 6-3 1-4-4z"/><path d="M13 7 6 14l2 2 7-7"/>'),
    pickup: svg('<path d="M12 3 4 8v8l8 5 8-5V8z"/><path d="M12 8v8M8 12h8"/>'),
    power: svg('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
    share: svg('<path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z"/>'),
    undo: svg('<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)"/>'),
    pass: svg('<path d="M5 5l8 7-8 7z"/><path d="M17 5v14"/>'),
    // タイルの絵
    drop: svg('<path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z"/>', 'tile-icon'),
    crash: svg('<path d="M3 14 21 6"/><path d="M8 12l2 5 3-1-1-4"/><path d="M14 9l1-4 3-1-1 4"/>', 'tile-icon'),
    launch: svg('<path d="M12 3c3 3 4 7 3 11H9C8 10 9 6 12 3z"/><path d="M9 14l-3 4h4M15 14l3 4h-4"/><circle cx="12" cy="9" r="1.4"/>', 'tile-icon'),
    tunnel: svg('<path d="M4 20V12a8 8 0 0 1 16 0v8"/><path d="M8 20v-7a4 4 0 0 1 8 0v7"/>', 'tile-icon'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>', 'tile-icon'),
    mirage: svg('<path d="M3 10c3-2 6 2 9 0s6-2 9 0"/><path d="M3 15c3-2 6 2 9 0s6-2 9 0"/>', 'tile-icon'),
    eye: svg('<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>', 'peek-icon'),
    shield: svg('<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v8a2 2 0 0 1-4 0"/>', 'shield-icon'),
    storm: svg('<path d="M4 9c4-4 12-4 16 0"/><path d="M6 13c3-3 9-3 12 0"/><path d="M9 17c2-1.5 4-1.5 6 0"/>', 'storm-icon')
};

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 3,
            level: Object.hasOwn(LEVELS, s.level) ? s.level : 'novice',
            mode: s.mode === 'all' ? 'all' : 'team'
        };
    } catch {
        return { count: 3, level: 'novice', mode: 'team' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// ---- ビューから分かること ----

const posOfSeat = (v, seat) => v.players[seat].pos;
const cellAt = (v, pos) => v.cells[pos];
const isDiag = (v, seat) => v.players[seat].role === 'explorer';
function canLeave(v, seat) {
    const pos = posOfSeat(v, seat);
    if (cellAt(v, pos).sand < BLOCKED) return true;
    return v.players.some(p => p.role === 'climber' && p.pos === pos);
}
function canEnter(v, seat, pos) {
    const c = cellAt(v, pos);
    return !!c && (v.players[seat].role === 'climber' || c.sand < BLOCKED);
}
const reachOf = (v, seat) => {
    const pos = posOfSeat(v, seat);
    return [pos, ...adjacent(pos, isDiag(v, seat))].filter(p => cellAt(v, p));
};
const isTunnel = (c) => c && c.revealed && c.kind === 'tunnel' && c.sand < BLOCKED;

// 仲間 seat が、移動の決まりで limit マス以内に行けるマスと、その道
function pathsWithin(v, seat, limit) {
    const start = posOfSeat(v, seat);
    const prev = new Map([[start, -1]]);
    if (!canLeave(v, seat)) return new Map();
    let frontier = [start];
    for (let d = 0; d < limit && frontier.length; d++) {
        const next = [];
        frontier.forEach(u => adjacent(u, isDiag(v, seat)).forEach(p => {
            if (prev.has(p) || !canEnter(v, seat, p)) return;
            prev.set(p, u);
            next.push(p);
        }));
        frontier = next;
    }
    const paths = new Map();
    prev.forEach((_, p) => {
        if (p === start) return;
        const path = [];
        for (let q = p; q !== start; q = prev.get(q)) path.unshift(q);
        paths.set(p, path);
    });
    return paths;
}

function stormText(card) {
    if (!card) return '';
    if (card.kind === 'wind') return `風：${DIRS[card.dir].name}へ ${card.n}`;
    return card.kind === 'up' ? '嵐が強まった' : '日差しが照りつけた';
}

function tileLabel(c) {
    if (!c.kind) return '';
    if (c.kind === 'clue') return `${PART[c.part].name}・${c.axis === 'row' ? '行' : '列'}`;
    return TILE_NAMES[c.kind];
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.pick = null;         // 盤面でマスを選んでいるとき：{ text, cells, onPick }
        this.sheetKind = null;
        this.resultShown = false;
        this.hint = null;
        this.tileEls = new Map(); // home → タイルの要素（嵐で動くのを、同じ要素の位置の変化で見せる）
        ['home', 'open-help-game', 'open-log'].forEach(id => {
            $(id).innerHTML = ICONS[{ home: 'home', 'open-help-game': 'help', 'open-log': 'log' }[id]];
        });
        document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon]; });
        $('title-art').innerHTML = this.titleArt();
        this.stormEl = document.createElement('div');
        this.stormEl.className = 'storm-eye';
        this.stormEl.innerHTML = ICONS.storm;
        $('board').append(this.stormEl);
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: '禁断の砂漠',
            game: 'forbidden-desert',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [{ key: 'level', label: '難易度', options: Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.name })) }],
            onStart: (net) => this.beginGame(this.controller?.net === net ? this.controller : onlineAdapter(net)),
            onUpdate: () => this.update(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                this.controller = null;
                this.showTitle();
            }
        });
        this.bindTitle();
        this.bindGame();
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    titleArt() {
        // 砂丘と飛行機のシルエット
        return `<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
            <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0b66a"/><stop offset="1" stop-color="#e48a4a"/></linearGradient></defs>
            <rect width="400" height="220" fill="url(#sky)"/>
            <circle cx="300" cy="70" r="34" fill="#fde3a6" opacity=".9"/>
            <path d="M0 150 Q90 110 180 145 T400 130 V220 H0z" fill="#c9824a"/>
            <path d="M0 180 Q120 140 240 175 T400 165 V220 H0z" fill="#a9643a"/>
            <g fill="#4a2c1c" transform="translate(120 70) rotate(-8)"><path d="M0 14 L70 8 L74 14 L70 20 Z"/><path d="M28 12 L40 -8 L46 -8 L42 12Z"/><path d="M28 16 L40 36 L46 36 L42 16Z"/><path d="M64 9 L70 -2 L73 -2 L72 9Z"/></g>
        </svg>`;
    }

    // ---- タイトル ----

    bindTitle() {
        const seg = (id, key, parse = (v) => v) => $(id).addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            this.settings[key] = parse(button.dataset[key]);
            saveSettings(this.settings);
            music.play('select');
            this.renderTitle();
        });
        seg('count', 'count', Number);
        seg('level', 'level');
        seg('mode', 'mode');
        $('start').addEventListener('click', () => this.start());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startWith(saved);
        });
        $('open-help-title').addEventListener('click', () => this.openHelp());
        $('online-button').addEventListener('click', () => this.online.open());
    }

    renderTitle() {
        const mark = (id, key) => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', String(this.settings[key]) === b.dataset[key]));
        mark('count', 'count');
        mark('level', 'level');
        mark('mode', 'mode');
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online.available;
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.closeSheet();
        this.setPick(null);
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
        this.renderTitle();
    }

    start() {
        const { count, level, mode } = this.settings;
        const players = Array.from({ length: count }, (_, i) => (mode === 'team'
            ? { name: i === 0 ? 'あなた' : CPU_NAMES[i - 1], isCPU: i > 0 }
            : { name: `${i + 1}P`, isCPU: false }));
        clearSavedGame();
        this.startWith({ players, options: { level }, mode });
    }

    startWith(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.update(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.toast('続きを読み込めませんでした');
            this.renderTitle();
            return;
        }
        this.beginGame(controller);
        controller.scheduleCpu();
        controller.scheduleStorm();
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.resultShown = false;
        this.hint = null;
        this.closeSheet();
        this.setPick(null);
        this.controller = controller;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.view = null;
        this.tileEls.forEach(el => el.remove());
        this.tileEls.clear();
        this.update();
    }

    // ---- ゲーム ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('open-log').addEventListener('click', () => this.openLog());
        $('hint').addEventListener('click', () => this.showHint());
        $('pick-cancel').addEventListener('click', () => {
            music.play('cancel');
            this.setPick(null);
        });
        $('board').addEventListener('click', event => {
            const el = event.target.closest('.tile');
            if (el) this.tapCell(Number(el.dataset.pos));
        });
        $('team').addEventListener('click', event => {
            const el = event.target.closest('[data-seat]');
            if (el) this.openPlayer(Number(el.dataset.seat));
        });
        $('actions').addEventListener('click', event => {
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.doAct(button.dataset.act);
        });
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && !['result'].includes(this.sheetKind)) this.closeSheet();
        });
    }

    can(seat) {
        return !!this.controller?.canControl(seat);
    }

    // 手番の人を、この画面から動かせるか
    myTurn(v = this.view) {
        return !!v && !v.result && this.can(v.current) && !(this.controller?.mode === 'team' && v.players[v.current].isCPU);
    }

    send(seat, command) {
        if (!this.controller) return false;
        if (this.controller.awaitingResponse) return false;
        this.setPick(null);
        const ok = this.controller.send(seat, command);
        if (ok && !this.view?.result) {
            this.lastSent = true;
            music.play(COMMAND_SOUND[command.type] ?? 'place');
        }
        return ok;
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        if (!v) return;
        const prev = this.view;
        this.view = v;
        if (prev) this.playUpdateSound(prev, v);
        this.render();
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.openResult(), 900);
        }
    }

    playUpdateSound(prev, v) {
        const mine = this.lastSent;
        this.lastSent = false;
        if (v.result) {
            if (!prev.result) music.play(v.result.won ? 'win' : 'lose');
            return;
        }
        if (v.logTotal === prev.logTotal || mine) return;
        const becameMine = this.myTurn(v) && !this.myTurn(prev);
        if (becameMine) music.play('turn');
        else if (this.myTurn(v) && v.phase === 'storm') music.play('draw'); // 自分の嵐のカードを自動で引いた
        else if (!this.myTurn(v) && v.current !== prev.current) music.play('notify');
    }

    render() {
        const v = this.view;
        this.renderStatus(v);
        this.renderBoard(v);
        this.renderTeam(v);
        this.renderActions(v);
        this.renderNews(v);
        this.markHint(v);
    }

    renderStatus(v) {
        const p = v.players[v.current];
        const role = ROLE_BY_KEY[p.role];
        const turn = v.result ? (v.result.won ? '脱出成功' : '遭難') : v.phase === 'storm' ? `嵐 残り${v.stormLeft}枚` : `行動 ${v.actionsLeft}`;
        $('status').innerHTML = `<span class="pawn" style="--pc:${role.color}">${ROLE_MARK[p.role]}</span>`
            + `<span class="who">${escapeHtml(p.name)}<small>${role.name}</small></span><span class="turn">${turn}</span>`;
        const ladder = v.ladder.map((n, i) => `<i class="${i === v.meter ? 'now' : i < v.meter ? 'past' : ''}">${n}</i>`).join('');
        const sandRate = Math.min(1, v.sand / v.sandTotal);
        const parts = v.parts.map(pt => `<span class="part-pip ${pt.state}" style="--pc:${PART[pt.key].color}" title="${PART[pt.key].name}">${PART[pt.key].short}</span>`).join('');
        $('meters').innerHTML = `<div class="meter m-storm" title="嵐の目盛り（引く枚数）"><b>嵐</b><span class="ladder">${ladder}<i class="skull">×</i></span></div>`
            + `<div class="meter m-sand" title="積もった砂"><b>砂</b><span class="bar"><span style="width:${(sandRate * 100).toFixed(0)}%"></span></span><em>${v.sand}/${v.sandTotal}</em></div>`
            + `<div class="meter parts" title="部品"><b>部品</b>${parts}</div>`;
    }

    // マスごとに行える行動（手番の人を動かせるとき）
    cellOptions(v, pos) {
        const out = [];
        if (!this.myTurn(v) || v.phase !== 'actions') return out;
        const seat = v.current;
        const me = v.players[seat];
        const myPos = me.pos;
        const c = cellAt(v, pos);
        if (!c) return out;
        if (v.actionsLeft > 0) {
            if (pos !== myPos && adjacent(myPos, isDiag(v, seat)).includes(pos) && canLeave(v, seat) && canEnter(v, seat, pos)) {
                out.push({ kind: 'move', label: 'ここへ移動', command: { type: 'move', to: pos } });
                if (me.role === 'climber') {
                    v.players.filter(q => q.id !== seat && q.pos === myPos).forEach(q => out.push({
                        kind: 'move', label: `${q.name}を連れて移動`, command: { type: 'move', to: pos, carry: q.id }
                    }));
                }
            }
            if (pos !== myPos && isTunnel(cellAt(v, myPos)) && isTunnel(c)) out.push({ kind: 'move', label: 'トンネルで移る', command: { type: 'tunnel', to: pos } });
            if (c.sand > 0 && reachOf(v, seat).includes(pos)) out.push({ kind: 'dig', label: '砂を取り除く', command: { type: 'dig', at: pos } });
            if (pos === myPos) {
                if (!c.revealed && c.sand === 0) out.push({ kind: 'here', label: '掘り出す', command: { type: 'excavate' } });
                if (c.sand === 0 && v.parts.some(pt => pt.state === 'placed' && pt.pos === pos)) out.push({ kind: 'here', label: '部品を拾う', command: { type: 'pickup' } });
                if (me.role === 'waterCarrier' && c.revealed && c.kind === 'water' && me.water < me.maxWater) out.push({ kind: 'here', label: '水をくむ', command: { type: 'collect' } });
            }
        }
        return out;
    }

    tapCell(pos) {
        const v = this.view;
        if (!v) return;
        if (this.pick) {
            if (this.pick.cells.includes(pos)) {
                const { onPick } = this.pick;
                this.setPick(null);
                onPick(pos);
            } else music.play('error');
            return;
        }
        const options = this.cellOptions(v, pos);
        const c = cellAt(v, pos);
        if (!options.length) {
            if (c) this.toast(this.cellInfo(v, pos));
            return;
        }
        if (options.length === 1) {
            this.send(v.current, options[0].command);
            return;
        }
        music.play('select');
        this.openSheet({
            kind: 'cell',
            title: this.cellInfo(v, pos),
            items: options.map(o => ({ label: o.label, primary: o.kind === 'move', run: () => this.send(v.current, o.command) })),
            close: 'やめる'
        });
    }

    cellInfo(v, pos) {
        const c = cellAt(v, pos);
        if (!c) return '嵐の目';
        const name = c.kind ? `${tileLabel(c)}${c.peeked ? '（のぞいた）' : ''}` : c.back === 'water' ? '水の印のタイル' : c.back === 'crash' ? '墜落地点' : 'まだ掘り出していないタイル';
        return `${name}・砂 ${c.sand}${c.sand >= BLOCKED ? '（ふさがっている）' : ''}`;
    }

    renderBoard(v) {
        const board = $('board');
        const options = new Map();
        for (let pos = 0; pos < CELLS; pos++) options.set(pos, this.cellOptions(v, pos));
        const pickCells = new Set(this.pick?.cells ?? []);
        const seen = new Set();
        v.cells.forEach((c, pos) => {
            if (!c) return;
            seen.add(c.home);
            let el = this.tileEls.get(c.home);
            if (!el) {
                el = document.createElement('button');
                el.type = 'button';
                el.className = 'tile';
                board.append(el);
                this.tileEls.set(c.home, el);
            }
            el.dataset.pos = String(pos);
            el.style.setProperty('--r', rowOf(pos));
            el.style.setProperty('--c', colOf(pos));
            const opts = options.get(pos);
            el.className = [
                'tile', c.revealed ? 'open' : 'hidden', c.peeked ? 'peeked' : '', c.kind ? `k-${c.kind}` : `b-${c.back}`,
                c.sand >= BLOCKED ? 'blocked' : '', opts.some(o => o.kind === 'move') ? 'can-move' : '', opts.some(o => o.kind === 'dig') ? 'can-dig' : '',
                opts.some(o => o.kind === 'here') ? 'can-here' : '', pickCells.has(pos) ? 'pickable' : '', v.players[v.current].pos === pos ? 'current' : ''
            ].filter(Boolean).join(' ');
            el.setAttribute('aria-label', this.cellInfo(v, pos));
            el.innerHTML = this.tileHtml(v, c, pos);
        });
        this.tileEls.forEach((el, home) => {
            if (!seen.has(home)) {
                el.remove();
                this.tileEls.delete(home);
            }
        });
        this.stormEl.style.setProperty('--r', rowOf(v.storm));
        this.stormEl.style.setProperty('--c', colOf(v.storm));
        const stormPart = v.parts.find(pt => pt.state === 'placed' && pt.pos === v.storm && !cellAt(v, v.storm));
        this.stormEl.classList.toggle('has-part', !!stormPart);
        this.stormEl.innerHTML = ICONS.storm + (stormPart ? this.partHtml(stormPart.key) : '');
    }

    partHtml(key) {
        return `<span class="part" style="--pc:${PART[key].color}" title="${PART[key].name}">${PART[key].short}</span>`;
    }

    tileHtml(v, c, pos) {
        let icon = '';
        let label = '';
        if (c.kind) {
            icon = {
                launch: ICONS.launch, crash: ICONS.crash, water: ICONS.drop, mirage: ICONS.mirage, tunnel: ICONS.tunnel, gear: ICONS.gear
            }[c.kind] ?? '';
            if (c.kind === 'clue') icon = `<span class="clue" style="--pc:${PART[c.part].color}">${PART[c.part].short}<i>${c.axis === 'row' ? '↔' : '↕'}</i></span>`;
            label = c.kind === 'clue' ? `${c.axis === 'row' ? 'この行' : 'この列'}` : TILE_NAMES[c.kind];
        } else if (c.back === 'water') icon = ICONS.drop;
        else if (c.back === 'crash') icon = ICONS.crash;
        const sand = c.sand > 0 ? `<span class="sand s${Math.min(c.sand, 4)}"><b>${c.sand}</b></span>` : '';
        const part = v.parts.filter(pt => pt.state === 'placed' && pt.pos === pos).map(pt => this.partHtml(pt.key)).join('');
        const shield = v.shields.some(s => s.pos === pos) ? ICONS.shield : '';
        const pawns = v.players.filter(p => p.pos === pos)
            .map(p => `<span class="pawn ${p.id === v.current ? 'active' : ''}" style="--pc:${ROLE_BY_KEY[p.role].color}" title="${escapeHtml(p.name)}">${ROLE_MARK[p.role]}</span>`).join('');
        return `<span class="face">${icon}${label ? `<span class="tl">${label}</span>` : ''}${c.peeked ? ICONS.eye : ''}</span>${sand}${part}${shield}<span class="pawns">${pawns}</span>`;
    }

    renderTeam(v) {
        $('team').classList.toggle('many', v.players.length >= 4);
        $('team').innerHTML = v.players.map(p => {
            const role = ROLE_BY_KEY[p.role];
            const drops = Array.from({ length: p.maxWater }, (_, i) => `<i class="${i < p.water ? 'full' : ''}"></i>`).join('');
            return `<button type="button" class="member ${p.id === v.current ? 'current' : ''} ${p.water <= 1 ? 'thirsty' : ''}" data-seat="${p.id}">
                <span class="pawn" style="--pc:${role.color}">${ROLE_MARK[p.role]}</span>
                <span class="mname">${escapeHtml(p.name)}${p.isCPU ? '<small>CPU</small>' : ''}</span>
                <span class="mrow"><span class="drops" aria-label="水 ${p.water}/${p.maxWater}">${drops}</span>${p.gear.length ? `<span class="gear-count" title="装備">装${p.gear.length}</span>` : ''}</span>
            </button>`;
        }).join('');
    }

    renderActions(v) {
        const mine = this.myTurn(v);
        const acting = mine && v.phase === 'actions';
        const me = v.players[v.current];
        const set = (act, enabled) => {
            const b = $('actions').querySelector(`[data-act="${act}"]`);
            b.disabled = !enabled;
        };
        const here = cellAt(v, me.pos);
        set('excavate', acting && v.actionsLeft > 0 && !here.revealed);
        set('pickup', acting && v.actionsLeft > 0 && v.parts.some(pt => pt.state === 'placed' && pt.pos === me.pos));
        $('power-label').textContent = POWER_LABEL[me.role] ?? '役割';
        set('power', acting);
        const sharers = v.players.filter(p => this.can(p.id));
        set('share', !v.result && sharers.length > 0 && (v.phase === 'actions' || v.phase === 'storm'));
        const undo = $('undo');
        undo.hidden = !!this.controller?.isOnline;
        set('undo', acting && !!this.controller?.canUndo?.());
        const pass = $('pass');
        const launch = acting && v.launchReady;
        pass.classList.toggle('launch', launch);
        const storm = mine && v.phase === 'storm';
        pass.lastChild.textContent = launch ? '離陸' : storm ? '嵐を引く' : '終える';
        set('pass', acting || storm);
        $('hint').hidden = !this.controller || !!v.result || Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        $('hint').disabled = !acting;
    }

    renderNews(v) {
        let text;
        if (v.result) text = END_REASONS[v.result.reason];
        else if (v.lastStorm && (v.phase === 'storm' || v.logs.at(-1)?.n === v.logTotal)) {
            const recent = v.logs.slice(-4).reverse().find(l => !l.text.endsWith('の手番'));
            text = v.phase === 'storm' ? `嵐 ${stormText(v.lastStorm)}` : recent?.text ?? '';
        }
        if (!text) {
            const recent = [...v.logs].reverse().find(l => !l.text.endsWith('の手番'));
            text = recent?.text ?? '';
        }
        if (this.pick) text = '';
        $('news').textContent = text;
    }

    doAct(act) {
        const v = this.view;
        if (!v) return;
        const seat = v.current;
        const me = v.players[seat];
        if (act === 'excavate') this.send(seat, { type: 'excavate' });
        else if (act === 'pickup') this.send(seat, { type: 'pickup' });
        else if (act === 'pass') this.send(seat, { type: v.phase === 'storm' ? 'storm' : v.launchReady ? 'launch' : 'pass' });
        else if (act === 'undo') {
            if (this.controller.undo()) music.play('cancel');
        } else if (act === 'share') this.openShare();
        else if (act === 'power') {
            if (me.role === 'meteorologist') this.send(seat, { type: 'calm' });
            else if (me.role === 'waterCarrier') this.send(seat, { type: 'collect' });
            else if (me.role === 'navigator') this.chooseNavigate();
            else this.openPlayer(seat);
        }
    }

    chooseNavigate() {
        const v = this.view;
        const seat = v.current;
        const others = v.players.filter(p => p.id !== seat);
        music.play('select');
        this.openSheet({
            kind: 'navigate',
            title: '動かす仲間',
            items: others.map(q => ({
                label: `${q.name}（${ROLE_BY_KEY[q.role].name}）`,
                run: () => {
                    const paths = pathsWithin(this.view, q.id, 3);
                    if (!paths.size) {
                        music.play('error');
                        this.toast(`${q.name}は動けません`);
                        return;
                    }
                    this.setPick({
                        text: `${q.name}を動かす先`,
                        cells: [...paths.keys()],
                        onPick: (pos) => this.send(seat, { type: 'navigate', who: q.id, path: paths.get(pos) })
                    });
                }
            })),
            close: 'やめる'
        });
    }

    // 水・装備：動かせる人ごとに、渡せる水・装備と、使える装備を並べる
    openShare() {
        const v = this.view;
        const html = [];
        const items = [];
        const holders = v.players.filter(p => this.can(p.id));
        holders.forEach(g => {
            const near = (q) => q.pos === g.pos || (g.role === 'waterCarrier' && adjacent(g.pos, false).includes(q.pos));
            v.players.filter(q => q.id !== g.id && near(q) && q.water < q.maxWater && g.water > 0).forEach(q => items.push({
                label: `${g.name}→${q.name}に水を1つ`, run: () => this.send(g.id, { type: 'water', to: q.id })
            }));
            g.gear.forEach(({ card, kind }) => {
                const info = GEAR_BY_KEY[kind];
                if (kind !== 'throttle' || (g.id === v.current && v.phase === 'actions')) {
                    items.push({ label: `${g.name}：${info.name}を使う`, primary: true, run: () => this.useGear(g.id, card, kind) });
                }
                v.players.filter(q => q.id !== g.id && q.pos === g.pos).forEach(q => items.push({
                    label: `${g.name}→${q.name}に${info.name}を渡す`, run: () => this.send(g.id, { type: 'give', to: q.id, card })
                }));
            });
        });
        v.players.forEach(p => {
            const gear = p.gear.map(({ kind }) => `<li><b>${GEAR_BY_KEY[kind].name}</b>：${GEAR_BY_KEY[kind].text}</li>`).join('');
            html.push(`<div class="share-row"><b>${escapeHtml(p.name)}</b>（${ROLE_BY_KEY[p.role].name}）水 ${p.water}/${p.maxWater}${gear ? `<ul>${gear}</ul>` : ''}</div>`);
        });
        if (!items.length) html.push('<p class="sheet-sub">今は渡せる水も、使える装備もありません。水と装備は同じタイルの仲間に渡せます（水運びはとなりにも）。</p>');
        music.play('select');
        this.openSheet({ kind: 'share', title: '水と装備', html: html.join(''), items, close: '閉じる', list: true });
    }

    useGear(seat, card, kind) {
        const v = this.view;
        const g = v.players[seat];
        if (kind === 'blaster') {
            const cells = reachOf(v, seat).filter(p => cellAt(v, p).sand > 0);
            if (!cells.length) return this.toast('砂のあるタイルがとなりにありません');
            return this.setPick({ text: '砂を吹き飛ばすタイル', cells, onPick: (pos) => this.send(seat, { type: 'gear', card, at: pos }) });
        }
        if (kind === 'terrascope') {
            const cells = v.cells.map((c, p) => (c && !c.revealed && !c.peeked ? p : -1)).filter(p => p >= 0);
            return this.setPick({ text: 'のぞくタイル', cells, onPick: (pos) => this.send(seat, { type: 'gear', card, at: pos }) });
        }
        if (kind === 'jetpack') {
            const cells = v.cells.map((c, p) => (c && c.sand < BLOCKED && p !== g.pos ? p : -1)).filter(p => p >= 0);
            return this.setPick({
                text: '飛ぶ先',
                cells,
                onPick: (pos) => {
                    const mates = this.view.players.filter(q => q.id !== seat && q.pos === g.pos);
                    if (!mates.length) return this.send(seat, { type: 'gear', card, at: pos });
                    this.openSheet({
                        kind: 'carry',
                        title: '一緒に連れて行く仲間',
                        items: [{ label: '1人で飛ぶ', primary: true, run: () => this.send(seat, { type: 'gear', card, at: pos }) },
                            ...mates.map(q => ({ label: `${q.name}を連れて飛ぶ`, run: () => this.send(seat, { type: 'gear', card, at: pos, carry: q.id }) }))],
                        close: 'やめる'
                    });
                }
            });
        }
        return this.send(seat, { type: 'gear', card });
    }

    setPick(pick) {
        this.pick = pick;
        $('pick-banner').hidden = !pick;
        if (pick) {
            $('pick-text').textContent = pick.text;
            this.closeSheet();
            music.play('select');
        }
        if (this.view) {
            this.renderBoard(this.view);
            this.renderNews(this.view);
        }
    }

    // ---- ヒント ----

    showHint() {
        const h = this.controller?.suggest();
        if (!h) return;
        const v = this.view;
        this.hint = { at: hintKey(v), ...h };
        music.play('select');
        this.toast(`おすすめ：${this.hintText(v, h.seat, h.command)}`);
        this.markHint(v);
    }

    hintText(v, seat, c) {
        switch (c.type) {
            case 'move': return `${this.dirText(v.players[seat].pos, c.to)}へ移動`;
            case 'tunnel': return 'トンネルで移る';
            case 'dig': return c.at === v.players[seat].pos ? '今のタイルの砂を取り除く' : `${this.dirText(v.players[seat].pos, c.at)}のタイルの砂を取り除く`;
            case 'excavate': return '今のタイルを掘り出す';
            case 'pickup': return '部品を拾う';
            case 'collect': return '井戸で水をくむ';
            case 'calm': return '嵐を静める';
            case 'navigate': return `${v.players[c.who].name}を動かす`;
            case 'water': return `${v.players[c.to].name}に水を渡す`;
            case 'give': return '装備を渡す';
            case 'gear': return `${GEAR_BY_KEY[v.players[seat].gear.find(g => g.card === c.card)?.kind]?.name ?? '装備'}を使う`;
            case 'launch': return '離陸する';
            case 'storm': return '嵐のカードを引く';
            default: return '手番を終える';
        }
    }

    dirText(from, to) {
        const dr = rowOf(to) - rowOf(from);
        const dc = colOf(to) - colOf(from);
        return `${dr < 0 ? '上' : dr > 0 ? '下' : ''}${dc < 0 ? '左' : dc > 0 ? '右' : ''}` || 'ここ';
    }

    markHint(v) {
        if (this.hint && this.hint.at !== hintKey(v)) this.hint = null;
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const c = this.hint?.command;
        if (!c) return;
        const cell = c.to ?? c.at ?? (c.type === 'navigate' ? c.path.at(-1) : undefined);
        if (cell !== undefined) document.querySelector(`.tile[data-pos="${cell}"]`)?.classList.add('recommended');
        const act = { excavate: 'excavate', pickup: 'pickup', calm: 'power', collect: 'power', navigate: 'power', water: 'share', give: 'share', gear: 'share', pass: 'pass', launch: 'pass' }[c.type];
        if (act) $('actions').querySelector(`[data-act="${act}"]`)?.classList.add('recommended');
    }

    // ---- シート ----

    openPlayer(seat) {
        const v = this.view;
        const p = v.players[seat];
        const role = ROLE_BY_KEY[p.role];
        const gear = p.gear.map(({ kind }) => `<li><b>${GEAR_BY_KEY[kind].name}</b>：${GEAR_BY_KEY[kind].text}</li>`).join('');
        this.openSheet({
            kind: 'player',
            title: `${p.name}（${role.name}）`,
            html: `<p class="sheet-text">${role.text}</p><p class="sheet-sub">水 ${p.water}/${p.maxWater}</p>${gear ? `<ul class="gear-list">${gear}</ul>` : '<p class="sheet-sub">装備なし</p>'}`,
            close: '閉じる'
        });
    }

    openLog() {
        const v = this.view;
        if (!v) return;
        const html = `<ol class="log" id="log">${[...v.logs].reverse().map(l => `<li class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</li>`).join('')}</ol>`;
        this.openSheet({ kind: 'log', title: '記録', html, close: '閉じる' });
    }

    openHelp() {
        this.openSheet({ kind: 'help', title: '遊び方', html: `<div class="help">${HELP_HTML}</div>`, close: '閉じる' });
    }

    openResult() {
        const v = this.view;
        if (!v?.result) return;
        const found = v.parts.filter(p => p.state === 'found').length;
        this.openSheet({
            kind: 'result',
            title: v.result.won ? '脱出成功' : '遭難',
            html: `<p class="sheet-text">${END_REASONS[v.result.reason]}</p><p class="sheet-sub">${v.levelName}・${v.players.length}人・${v.turnNo}手番目・部品 ${found}/4・砂 ${v.sand}/${v.sandTotal}</p>`,
            items: [
                { label: 'もう一度', primary: true, run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
                { label: 'タイトルへ', id: 'result-home', run: () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()) },
                { label: '盤面を見る', run: () => {} }
            ]
        });
    }

    openSheet({ kind = 'info', title, html = '', items = [], close = null, list = false }) {
        this.sheetKind = kind;
        $('sheet-title').textContent = title;
        $('sheet-body').innerHTML = html;
        $('sheet').classList.toggle('wide', kind === 'help' || kind === 'log' || kind === 'share');
        const buttons = $('sheet-buttons');
        buttons.classList.toggle('list', list || items.length > 3);
        buttons.innerHTML = '';
        items.forEach(item => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `btn ${item.primary ? 'primary' : 'secondary'}`;
            if (item.id) b.id = item.id;
            b.textContent = item.label;
            b.addEventListener('click', () => {
                this.closeSheet();
                item.run();
            });
            buttons.append(b);
        });
        if (close) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn ghost';
            b.textContent = close;
            b.addEventListener('click', () => {
                music.play('cancel');
                this.closeSheet();
            });
            buttons.append(b);
        }
        $('overlay').hidden = false;
        $('sheet-body').scrollTop = 0;
    }

    closeSheet() {
        $('overlay').hidden = true;
        this.sheetKind = null;
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
