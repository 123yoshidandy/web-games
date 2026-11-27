/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 * 盤の光る部屋を押すと移動する。「のぞく」などを選ぶと押せる部屋が光り、押すとその操作になる
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS, END_REASONS } from './game.js';
import { ROOMS, CHARACTERS, TOOLS, FLOOR_LEVELS, HACK_TYPES, HACK_NAMES, MAX_DICE, START_STEALTH, idOf, floorOf, cellOf, cellLabel, neighbors } from './data.js';
import {
    moveTargets, peekTargets, peekCost, canUp, canDown, canRoof, canAddDie, canCrack, canHack, juiceTargets, canSpot, tileAt, topFloor, allCracked
} from './rules.js';
import { floorHtml, pawnHtml, guardPath, titleArtHtml } from './board.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import * as Motion from './motion/motion.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult } from './netplay/user-stats.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の席だけを動かす。ヒントはない
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
        scheduleCpu() {},
        stop: () => net.stop()
    };
}

// 自分の操作の音（コマンドの種類ごと）
const COMMAND_SOUND = {
    move: 'place', peek: 'draw', addDie: 'place', crack: 'dice', hack: 'place', up: 'place', down: 'place', roof: 'gain',
    juice: 'place', spot: 'draw', spotKeep: 'select', spotBottom: 'shuffle', tool: 'place', pass: 'select'
};

const SETTINGS_KEY = 'burgle-bros.settings';
const CPU_NAMES = ['ジン', 'ミオ', 'テツ'];
const FLOOR_NAMES = ['1階', '2階', '3階'];
// ヒントが指す場面（手を打つと変わる）
const hintKey = (v) => JSON.stringify([v.logTotal, v.phase, v.actionsLeft, v.current]);

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const where = (id) => `${FLOOR_NAMES[floorOf(id)]}${cellLabel(cellOf(id))}`;

export const ICONS = {
    home: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
    help: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    log: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>'
};

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 2,
            level: [1, 2, 3].includes(s.level) ? s.level : 1,
            mode: s.mode === 'all' ? 'all' : 'team'
        };
    } catch {
        return { count: 2, level: 1, mode: 'team' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

const stealthHtml = (n) => Array.from({ length: START_STEALTH }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.viewFloor = 0;
        this.pick = null;         // 盤で部屋を選んでいるとき：{ kind, text, targets: Set（その階のセル）, floor, onPick }
        this.sheetKind = null;
        this.resultShown = false;
        this.newsFrom = 0;
        this.flash = new Set();
        ['home', 'open-help-game', 'open-log'].forEach(id => {
            $(id).innerHTML = ICONS[{ home: 'home', 'open-help-game': 'help', 'open-log': 'log' }[id]];
        });
        $('title-art').innerHTML = titleArtHtml();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'バーグルブロス',
            game: 'burgle-bros',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [{ key: 'floors', label: '建物', options: [1, 2, 3].map(value => ({ value, label: FLOOR_LEVELS[value].name })) }],
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

    // ---- タイトル ----

    bindTitle() {
        Motion.mountSpeedSetting($('motion-setting'), { label: '' });
        const seg = (id, key, parse = (v) => v) => $(id).addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            music.play('select');
            this.settings[key] = parse(button.dataset[key]);
            saveSettings(this.settings);
            this.renderTitle();
        });
        seg('count', 'count', Number);
        seg('level', 'level', Number);
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
        const seed = Math.floor(Math.random() * 2 ** 32);
        this.startWith({ players, options: { seed, floors: level }, mode });
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
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.resultShown = false;
        this.newsFrom = 0;
        this.hint = null;
        this.closeSheet();
        this.setPick(null);
        this.controller = controller;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.view = null;
        this.cancelResult?.();
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
        $('floors').addEventListener('click', event => {
            const b = event.target.closest('[data-floor]');
            if (!b) return;
            music.play('select');
            this.viewFloor = Number(b.dataset.floor);
            this.render();
        });
        $('grid').addEventListener('click', event => {
            const el = event.target.closest('[data-cell]');
            if (el) this.tapCell(Number(el.dataset.cell));
        });
        $('team').addEventListener('click', event => {
            const tool = event.target.closest('[data-tool]');
            const row = event.target.closest('[data-seat]');
            if (tool && row) this.tapTool(Number(row.dataset.seat), tool.dataset.tool);
        });
        $('actions').addEventListener('click', event => {
            const button = event.target.closest('[data-act]');
            if (button && !button.disabled) this.doAct(button.dataset.act);
        });
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && !['spot', 'result'].includes(this.sheetKind)) this.closeSheet();
        });
        $('sheet').addEventListener('click', event => {
            const item = event.target.closest('[data-i]');
            if (item && !item.disabled && this.sheetHandlers) this.sheetHandlers[Number(item.dataset.i)]?.();
        });
    }

    send(seat, command) {
        this.sending = true;
        const ok = this.controller?.send(seat, command) ?? false;
        this.sending = false;
        if (ok && !this.view?.result) music.play(this.ownSound(command));
        return ok;
    }

    // 自分の操作の音：見つかったら「払う」、金庫が開いたら「得る」、それ以外はコマンドの音
    ownSound(command) {
        const v = this.view;
        const fresh = v?.logs.filter(l => l.n > (this.soundFrom ?? 0)) ?? [];
        if (fresh.some(l => /隠密 残り|隠れ札/.test(l.text))) return 'pay';
        if (fresh.some(l => l.text.includes('金庫が開いた'))) return 'gain';
        return COMMAND_SOUND[command.type] ?? 'place';
    }

    can(seat) {
        return !!this.controller?.canControl(seat);
    }

    isMyActions() {
        const v = this.view;
        return v && !v.result && v.phase === 'actions' && this.can(v.current);
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        const prev = this.view;
        // 駒と見張りの位置は、描き直す前に測る（見せる階が変わるときは動かさない）
        const before = Motion.captureRects($('grid'), '.pawn, .guard', 'key');
        const floorBefore = this.viewFloor;
        this.soundFrom = prev?.logTotal ?? 0;
        this.view = v;
        // 手番の人が変わった・階を移ったら、その人の階を見せる
        const cur = v.players[v.current];
        if (!prev || prev.current !== v.current || prev.players[v.current]?.floor !== cur.floor) {
            if (!cur.escaped) this.viewFloor = cur.floor;
        }
        if (this.pick && (!prev || prev.logTotal !== v.logTotal || prev.current !== v.current)) this.setPick(null);
        this.flash = new Set(prev && prev.logTotal !== v.logTotal ? v.events.filter(e => e.type === 'reveal' && floorOf(e.at) === this.viewFloor).map(e => cellOf(e.at)) : []);
        this.render();
        if (prev) this.animateChanges(prev, v, before, floorBefore === this.viewFloor);
        this.playUpdateSound(prev);
        this.showRoll(v, prev);
        if (v.phase === 'spot' && this.can(v.current) && this.sheetKind !== 'spot') this.openSpot();
        else if (v.phase !== 'spot' && this.sheetKind === 'spot') this.closeSheet();
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            // ローカル対戦の結果を、ログインしている人の記録に送る（オンライン対戦はサーバーが記録する）
            if (!this.controller.isOnline) recordResult({ game: GAME, id: `${GAME}-${this.controller.seed}`, outcome: v.result.won ? 'win' : 'loss' });
            this.setPick(null);
            this.cancelResult = Motion.afterIdle(() => this.openResult(), 700);
        }
    }

    // 描き直したあと：前のビューとの差を動かす（泥棒と見張りは部屋から部屋へ滑り、めくった部屋は裏返り、鳴った警報は弾み、ハック・隠密・宝は変わると目立つ）
    animateChanges(prev, v, before, sameFloor) {
        if (!Motion.enabled() || prev.logTotal === v.logTotal) return;
        const grid = $('grid');
        if (sameFloor) Motion.flipFrom(before, grid, '.pawn, .guard', 'key', { duration: 360, enter: null });
        const f = this.viewFloor;
        const tileOf = (c) => grid.querySelector(`.tile[data-cell="${c}"]`);
        v.floors[f].tiles.forEach((t, c) => {
            const old = prev.floors[f]?.tiles[c];
            if (!old) return;
            if (t.revealed && !old.revealed) Motion.flipCard(tileOf(c), { duration: 380 });
            if (t.alarm && !old.alarm) Motion.popIn(tileOf(c)?.querySelector('.siren'), { duration: 360, delay: 100 });
            if (t.cracked && !old.cracked) Motion.pulse(tileOf(c)?.querySelector('.num'), { duration: 380, scale: 1.4 });
        });
        for (const k of HACK_TYPES) {
            if (v.hacks[k] !== prev.hacks[k]) Motion.pulse($('hacks').querySelector(`.hk.${k}`), { duration: 380, scale: 1.3 });
        }
        v.players.forEach(p => {
            const old = prev.players[p.id];
            const row = $('team').querySelector(`[data-seat="${p.id}"]`);
            if (!old || !row) return;
            if (p.stealth !== old.stealth) Motion.pulse(row.querySelector('.stealth'), { duration: 380, scale: 1.3 });
            if (p.loot.length > old.loot.length) Motion.pulse(row.querySelector('.loot'), { duration: 420, scale: 1.4 });
        });
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。ほかの人の手は知らせ、自分の番になったらチャイム
    playUpdateSound(prev) {
        const v = this.view;
        if (!prev) return;
        if (v.result) {
            if (!prev.result) music.play(v.result.won ? 'win' : 'lose');
            return;
        }
        if (this.sending) return;
        const wasMine = prev.phase === 'actions' && this.can(prev.current) && prev.current === v.current;
        if (this.isMyActions() && !wasMine) music.play('turn');
        else if (prev.logTotal !== v.logTotal) music.play('notify');
    }

    render() {
        const v = this.view;
        if (!v || !this.controller) return;
        const f = Math.min(this.viewFloor, v.floorCount - 1);
        this.viewFloor = f;
        // 階の切り替え（泥棒と見張りのいる階に印）
        $('floors').innerHTML = Array.from({ length: v.floorCount }, (_, i) => {
            const people = v.players.filter(p => !p.escaped && p.floor === i).length;
            const fl = v.floors[i];
            return `<button type="button" class="fl${i === f ? ' on' : ''}${fl.safe.cracked ? ' done' : ''}" data-floor="${i}">${i + 1}F${people ? `<i class="dot">${people}</i>` : ''}</button>`;
        }).reverse().join('');
        $('hacks').innerHTML = HACK_TYPES.map(k => `<span class="hk ${k}" title="${HACK_NAMES[k]}のハック">${HACK_NAMES[k][0]}<b>${v.hacks[k]}</b></span>`).join('');
        // 盤
        const g = v.floors[f].guard;
        let targets = new Set();
        let mark = 'move';
        if (this.pick) {
            targets = this.pick.floor === f ? this.pick.targets : new Set();
            mark = 'pick';
        } else if (this.isMyActions()) {
            targets = new Set(moveTargets(v, v.current).filter(id => floorOf(id) === f).map(cellOf));
        }
        const path = g.active ? guardPath(v, f) : new Set();
        $('grid').innerHTML = floorHtml(v, f, { targets, flash: this.flash, path, mark });
        $('grid').classList.toggle('picking', !!this.pick);
        // 仲間
        $('team').innerHTML = v.players.map(p => {
            const cls = ['tm', p.id === v.current && !v.result ? 'cur' : '', p.escaped ? 'out' : ''].join(' ');
            const who = this.controller.isOnline || this.controller.mode === 'team' ? `<span class="tm-who">${escapeHtml(p.name)}${p.isCPU ? '・CPU' : ''}</span>` : '';
            const tools = p.tools.map(t => `<span class="tool${this.can(p.id) && p.id === v.current ? ' usable' : ''}" data-tool="${t}" title="${TOOLS[t].name}">${TOOLS[t].short}</span>`).join('');
            const loc = p.escaped ? '屋上' : `${FLOOR_NAMES[p.floor]}${cellLabel(p.cell)}`;
            return `<div class="${cls}" data-seat="${p.id}">${pawnHtml(p.char)}<span class="tm-char">${CHARACTERS[p.char].name}</span>${who}`
                + `<span class="stealth" title="隠密 ${p.stealth}">${stealthHtml(p.stealth)}</span><span class="tm-loc">${loc}</span>`
                + `<span class="tm-tools">${tools}${p.loot.length ? `<span class="loot" title="${escapeHtml(p.loot.join('・'))}">宝${p.loot.length}</span>` : ''}</span></div>`;
        }).join('');
        $('status').innerHTML = this.statusHtml(v);
        this.showNews(v);
        this.renderActions(v);
        this.markHint(v);
    }

    statusHtml(v) {
        const p = v.players[v.current];
        if (v.result) return `<span class="phase">${v.result.won ? '逃げ切った' : '捕まった'}</span>`;
        if (this.pick) return `<span class="phase">${escapeHtml(this.pick.text)}</span>`;
        const g = v.floors[this.viewFloor].guard;
        const guard = g.active ? `<span class="sub">見張り 速さ${g.speed}・山${g.deckCount}</span>` : '<span class="sub">見張りはまだいない</span>';
        const pips = `<span class="pips">${Array.from({ length: Math.max(4, v.actionsLeft) }, (_, i) => `<i class="${i < v.actionsLeft ? 'on' : ''}"></i>`).join('')}</span>`;
        const name = `${pawnHtml(p.char)}<b>${escapeHtml(this.controller.mode === 'all' && !this.controller.isOnline ? CHARACTERS[p.char].name : p.name)}</b>`;
        if (v.phase === 'spot') return `${name}<span class="phase">巡回の山の上を見ている</span>`;
        return `${name}${pips}${guard}`;
    }

    // 新しい出来事を、盤の上に数秒だけ出す（最後の3行）
    showNews(v) {
        const fresh = v.logs.filter(l => l.n > this.newsFrom && !/の番$/.test(l.text));
        this.newsFrom = v.logTotal;
        if (!fresh.length) return;
        const el = $('news');
        el.innerHTML = fresh.slice(-3).map(l => `<div class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</div>`).join('');
        el.classList.add('show');
        clearTimeout(this.newsTimer);
        this.newsTimer = setTimeout(() => el.classList.remove('show'), 3200);
    }

    // ダイスの目を少しのあいだ出す
    showRoll(v, prev) {
        if (!v.lastRoll || !prev || prev.logTotal === v.logTotal) return;
        const el = $('roll');
        el.innerHTML = `<span class="rl">${v.lastRoll.kind === 'safe' ? '金庫' : '暗証'}</span>${v.lastRoll.values.map(n => `<span class="d">${n}</span>`).join('')}`;
        el.classList.add('show');
        clearTimeout(this.rollTimer);
        this.rollTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }

    renderActions(v) {
        const mine = this.isMyActions() && !this.pick;
        const s = v.current;
        const p = v.players[s];
        const stairs = mine && (canUp(v, s) || canDown(v, s) || canRoof(v, s));
        const more = mine && (canHack(v, s) || juiceTargets(v, s).length > 0 || canSpot(v, s));
        const opts = mine ? {
            peek: peekTargets(v, s).length > 0 && peekCost(v, s) <= v.actionsLeft,
            addDie: canAddDie(v, s),
            crack: canCrack(v, s),
            stairs,
            more,
            pass: true
        } : {};
        $('actions').querySelectorAll('[data-act]').forEach(b => {
            b.disabled = !opts[b.dataset.act];
            b.classList.toggle('ready', (b.dataset.act === 'stairs' && canRoof(v, s) && mine) || (b.dataset.act === 'crack' && !!opts.crack));
        });
        const stairsBtn = $('actions').querySelector('[data-act="stairs"]');
        stairsBtn.textContent = mine && canRoof(v, s) ? '屋上へ' : mine && canUp(v, s) && !canDown(v, s) ? '上へ' : mine && canDown(v, s) && !canUp(v, s) ? '下へ' : '階段';
        const peekBtn = $('actions').querySelector('[data-act="peek"]');
        peekBtn.textContent = mine && p.char === 'hawk' && v.turn.hawkFree ? 'のぞく0' : 'のぞく';
        const local = !this.controller.isOnline;
        $('hint').hidden = !local || !!v.result; // ヒントはローカル対戦だけ
        $('hint').disabled = !v.actors.some(seat => this.can(seat));
    }

    // ---- 盤を押す ----

    setPick(pick) {
        this.pick = pick;
        $('pick-bar').hidden = !pick;
        if (pick) {
            $('pick-text').textContent = pick.text;
            if (pick.floor !== undefined) this.viewFloor = pick.floor;
        }
        if (this.view) this.render();
    }

    tapCell(cell) {
        const v = this.view;
        if (!v) return;
        const f = this.viewFloor;
        if (this.pick) {
            if (this.pick.floor !== f || !this.pick.targets.has(cell)) {
                this.showCellInfo(f, cell);
                return;
            }
            this.pick.onPick(idOf(f, cell));
            return;
        }
        const id = idOf(f, cell);
        if (this.isMyActions() && moveTargets(v, v.current).includes(id)) {
            this.send(v.current, { type: 'move', to: id });
            return;
        }
        this.showCellInfo(f, cell);
    }

    showCellInfo(f, cell) {
        const v = this.view;
        const t = tileAt(v, f, cell);
        const g = v.floors[f].guard;
        const bits = [`${FLOOR_NAMES[f]}${cellLabel(cell)}`];
        if (t.revealed) bits.push(`${ROOMS[t.type].name}${t.type !== 'safe' ? `（${t.num}${t.cracked ? '・印' : ''}）` : ''}：${ROOMS[t.type].text}`);
        else bits.push('まだめくっていない部屋');
        if (g.active && g.cell === cell) bits.push('見張りがいる');
        if (g.active && g.dest === cell) bits.push('見張りの行き先');
        if (t.alarm) bits.push('警報が鳴っている');
        this.toast(bits.join('・'));
    }

    // ---- アクション ----

    doAct(act) {
        const v = this.view;
        const s = v.current;
        music.play('select');
        switch (act) {
            case 'peek': return this.startPeek();
            case 'addDie': return this.send(s, { type: 'addDie' });
            case 'crack': return this.send(s, { type: 'crack' });
            case 'stairs': return this.openStairs();
            case 'more': return this.openMore();
            case 'pass': return this.send(s, { type: 'pass' });
        }
    }

    // のぞく：同じ階の部屋は盤で選ぶ。吹き抜けから上下の階をのぞくときはシートで選ぶ
    startPeek() {
        const v = this.view;
        const s = v.current;
        const p = v.players[s];
        const ids = peekTargets(v, s);
        const same = ids.filter(id => floorOf(id) === p.floor);
        const other = ids.filter(id => floorOf(id) !== p.floor);
        if (other.length) {
            const items = [
                ...same.map(id => ({ label: `${where(id)}をのぞく`, run: () => this.send(s, { type: 'peek', to: id }) })),
                ...other.map(id => ({ label: `${where(id)}（${floorOf(id) > p.floor ? '上' : '下'}の階）をのぞく`, run: () => this.send(s, { type: 'peek', to: id }) }))
            ];
            this.openSheet({ title: 'のぞく部屋', items, close: 'やめる' });
            return;
        }
        this.setPick({
            kind: 'peek', text: 'のぞく部屋を選ぶ', floor: p.floor, targets: new Set(same.map(cellOf)),
            onPick: (id) => { this.setPick(null); this.send(s, { type: 'peek', to: id }); }
        });
    }

    openStairs() {
        const v = this.view;
        const s = v.current;
        const items = [];
        if (canRoof(v, s)) items.push({ label: '屋上へ逃げる', primary: true, run: () => this.send(s, { type: 'roof' }) });
        if (canUp(v, s)) items.push({ label: '階段で上の階へ', run: () => this.send(s, { type: 'up' }) });
        if (canDown(v, s)) items.push({ label: '階段で下の階へ', run: () => this.send(s, { type: 'down' }) });
        if (items.length === 1) {
            items[0].run();
            return;
        }
        this.openSheet({ title: '階段', items, close: 'やめる' });
    }

    openMore() {
        const v = this.view;
        const s = v.current;
        const p = v.players[s];
        const items = [];
        if (canHack(v, s)) {
            const kind = ROOMS[tileAt(v, p.floor, p.cell).type].hack;
            items.push({ label: `${HACK_NAMES[kind]}のハックを置く`, sub: `今 ${v.hacks[kind]}`, run: () => this.send(s, { type: 'hack' }) });
        }
        if (juiceTargets(v, s).length) {
            items.push({
                label: 'となりの部屋の警報を鳴らす', sub: '仕掛け屋の得意', run: () => this.setPick({
                    kind: 'juice', text: '警報を鳴らす部屋を選ぶ', floor: p.floor, targets: new Set(juiceTargets(v, s).map(cellOf)),
                    onPick: (id) => { this.setPick(null); this.send(s, { type: 'juice', to: id }); }
                })
            });
        }
        if (canSpot(v, s)) items.push({ label: '巡回の山の上を見る', sub: '見張り役の得意', run: () => this.send(s, { type: 'spot' }) });
        this.openSheet({ title: 'そのほかのアクション', items, close: 'やめる' });
    }

    openSpot() {
        const v = this.view;
        const s = v.current;
        const sp = v.spotted;
        this.openSheet({
            kind: 'spot',
            title: '巡回の山の上',
            html: `<p class="sheet-text">次の行き先は ${FLOOR_NAMES[sp.floor]}${cellLabel(sp.cell)}。このままにするか、山の下へ回すか選びます。</p>`,
            items: [
                { label: 'このままにする', run: () => this.send(s, { type: 'spotKeep' }) },
                { label: '山の下へ回す', primary: true, run: () => this.send(s, { type: 'spotBottom' }) }
            ]
        });
    }

    // ---- 道具 ----

    tapTool(seat, tool) {
        const v = this.view;
        if (!this.isMyActions() || seat !== v.current) {
            this.toast(`${TOOLS[tool].name}：${TOOLS[tool].text}`);
            return;
        }
        const p = v.players[seat];
        const f = p.floor;
        const pickOn = (cells, text, extra = {}) => {
            if (!cells.length) {
                this.toast(`${TOOLS[tool].name}：使える部屋がありません`);
                return;
            }
            music.play('select');
            this.setPick({ kind: 'tool', text, floor: f, targets: new Set(cells), onPick: (id) => { this.setPick(null); this.send(seat, { type: 'tool', tool, to: id, ...extra }); } });
        };
        switch (tool) {
            case 'blueprints':
                return pickOn(v.floors[f].tiles.map((t, c) => (t.revealed ? -1 : c)).filter(c => c >= 0), '設計図：めくる部屋を選ぶ');
            case 'crowbar':
                return pickOn(neighbors(p.cell).filter(c => tileAt(v, f, c).revealed && tileAt(v, f, c).type === 'keypad' && !tileAt(v, f, c).open), 'バール：開ける扉を選ぶ');
            case 'dynamite':
                return pickOn(neighbors(p.cell).filter(c => v.floors[f].walls.includes(c < p.cell ? `${c}-${p.cell}` : `${p.cell}-${c}`)), 'ダイナマイト：壊す壁のとなりの部屋を選ぶ');
            default:
                this.openSheet({
                    title: TOOLS[tool].name,
                    html: `<p class="sheet-text">${TOOLS[tool].text}</p>`,
                    items: [{ label: '使う', primary: true, run: () => this.send(seat, { type: 'tool', tool }) }],
                    close: 'やめる'
                });
        }
    }

    // ---- ヒント ----

    // おすすめの手を、短い文で知らせ、押す場所・ボタンを光らせる（打つのは自分）
    showHint() {
        const v = this.view;
        const h = this.controller?.suggest();
        if (!v || !h) {
            this.toast('今はおすすめの手がありません');
            return;
        }
        this.hint = { at: hintKey(v), ...h };
        const c = h.command;
        if (['move', 'peek', 'juice'].includes(c.type) || (c.type === 'tool' && c.to !== undefined)) this.viewFloor = floorOf(c.to);
        music.play('select');
        this.toast(`おすすめ：${this.hintText(v, c)}`);
        this.render();
    }

    hintText(v, c) {
        const text = {
            move: () => `${where(c.to)}へ移動`, peek: () => `${where(c.to)}をのぞく`, addDie: () => '金庫にダイスを足す', crack: () => '金庫のダイスを振る',
            hack: () => 'ハックを置く', up: () => '階段で上へ', down: () => '階段で下へ', roof: () => '屋上へ逃げる', juice: () => `${where(c.to)}で警報を鳴らす`,
            spot: () => '巡回の山の上を見る', spotKeep: () => 'このままにする', spotBottom: () => '山の下へ回す', pass: () => '手番を終える',
            tool: () => `${TOOLS[c.tool].name}を使う${c.to !== undefined ? `（${where(c.to)}）` : ''}`
        }[c.type];
        return text ? text() : c.type;
    }

    // ヒントの印（その手のあいだだけ）
    markHint(v) {
        if (this.hint && this.hint.at !== hintKey(v)) this.hint = null;
        const c = this.hint?.command;
        if (!c) return;
        const mark = (el) => el?.classList.add('recommended');
        if (['move', 'peek', 'juice'].includes(c.type) && floorOf(c.to) === this.viewFloor) mark($('grid').querySelector(`[data-cell="${cellOf(c.to)}"]`));
        const act = { peek: 'peek', addDie: 'addDie', crack: 'crack', up: 'stairs', down: 'stairs', roof: 'stairs', hack: 'more', juice: 'more', spot: 'more', pass: 'pass' }[c.type];
        if (act) mark($('actions').querySelector(`[data-act="${act}"]`));
        if (c.type === 'tool') mark($('team').querySelector(`[data-seat="${this.hint.seat}"] [data-tool="${c.tool}"]`));
        if (['spotKeep', 'spotBottom'].includes(c.type)) mark($('sheet').querySelectorAll('.opt')[c.type === 'spotKeep' ? 0 : 1]);
    }

    // ---- 情報 ----

    openLog() {
        const v = this.view;
        const html = `<div class="log" id="log">${v.logs.slice().reverse().map(l => `<div class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</div>`).join('')}</div>`;
        this.openSheet({ title: '記録', html, close: '閉じる' });
    }

    openHelp() {
        this.openSheet({ title: '遊び方', html: HELP_HTML, close: '閉じる', wide: true });
    }

    openResult() {
        const v = this.view;
        if (!v?.result) return;
        const opened = v.floors.filter(fl => fl.safe.cracked).length;
        const loot = v.players.flatMap(p => p.loot);
        const who = v.result.seat !== undefined ? `${escapeHtml(v.players[v.result.seat].name)}（${CHARACTERS[v.players[v.result.seat].char].name}）が見つかった` : '';
        this.openSheet({
            kind: 'result',
            title: v.result.won ? '逃げ切った！' : '捕まった',
            html: `<p class="sheet-text">${END_REASONS[v.result.reason]}${who ? `。${who}` : ''}</p>`
                + `<p class="sheet-sub">${v.levelName}・${v.players.length}人・金庫 ${opened}/${v.floorCount}・${v.turnNo}手番</p>`
                + (loot.length ? `<div class="chips">${loot.map(l => `<span class="chip">${escapeHtml(l)}</span>`).join('')}</div>` : ''),
            items: [
                // オンラインは、ロビーを出し、ホストの「もう一度」で再戦する
                { label: 'もう一度', primary: true, run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
                { label: 'ホーム', center: true, id: 'result-home', run: () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()) }
            ]
        });
    }

    // ---- シート ----

    // items: [{ label, sub, html, run, primary, disabled, keep, id, center }]。keep は押しても閉じない
    openSheet({ kind = 'info', title, html = '', items = [], close = null, wide = false }) {
        this.sheetKind = kind;
        $('sheet-title').textContent = title;
        const list = items.map((it, i) => `<button type="button" class="opt${it.primary ? ' primary' : ''}${it.center ? ' center' : ''}" data-i="${i}"${it.id ? ` id="${it.id}"` : ''} ${it.disabled ? 'disabled' : ''}>`
            + `<span class="opt-label">${it.html ? it.label : escapeHtml(it.label)}</span>${it.sub ? `<small>${escapeHtml(it.sub)}</small>` : ''}</button>`).join('');
        $('sheet-body').innerHTML = html + (items.length ? `<div class="opts">${list}</div>` : '');
        this.sheetHandlers = items.map(it => () => {
            if (!it.keep) this.closeSheet();
            it.run();
        });
        $('sheet-buttons').innerHTML = close ? `<button type="button" class="btn secondary" data-i="${items.length}">${close}</button>` : '';
        if (close) this.sheetHandlers.push(() => this.closeSheet());
        $('sheet').classList.toggle('wide', wide);
        $('overlay').hidden = false;
        $('sheet-body').scrollTop = 0;
    }

    closeSheet() {
        this.sheetKind = null;
        this.sheetHandlers = null;
        $('overlay').hidden = true;
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}

export { MAX_DICE, topFloor, allCracked };
