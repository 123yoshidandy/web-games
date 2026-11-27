/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 * 押せる手の判定は、ビューから作った判定用のゲーム（Game.fromView）の commandError を使う（ルールの写しを持たない）
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import Game, { MIN_PLAYERS, MAX_PLAYERS, END_REASONS } from './game.js';
import {
    NEIGHBORS, OUTSIDE_CELLS, isInside, edgeKey, rowOf, colOf, roomOf, ROOM_NAMES, ROLES, ROLE, roleOf, LEVELS, MODES,
    SIDE_NAMES, WIN_RESCUED, LOSE_LOST, DAMAGE_LIMIT, sideDistance, ENGINE_QUADRANT, QUADRANTS
} from './board.js';
import { boardSvg, titleArt, ffPositions, PLAYER_COLORS } from './render.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import * as Motion from './motion/motion.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の席だけを動かす。ヒント・待った・任せる・自動で終える処理はない
function onlineAdapter(net) {
    const mySeat = () => net.getView()?.you;
    return {
        isOnline: true,
        mode: 'team',
        net,
        getView: () => net.getView(),
        canControl: (seat) => seat === mySeat(),
        send: (seat, command) => seat === mySeat() && net.send(command),
        suggest: () => null,
        assist: () => false,
        canUndo: () => false,
        undo: () => false,
        scheduleCpu() {},
        scheduleAuto() {},
        stop: () => net.stop()
    };
}

// 自分の操作の音（コマンドの種類ごと）。手番を終えると延焼のダイスを振る
const COMMAND_SOUND = {
    role: 'select', place: 'place', move: 'place', carry: 'select', drop: 'cancel', door: 'place', extinguish: 'capture',
    chop: 'pay', identify: 'draw', treat: 'gain', dispose: 'capture', drive: 'place', gun: 'dice', command: 'place', crew: 'select', end: 'dice'
};

const SETTINGS_KEY = 'flash-point.settings';
const CPU_NAMES = ['ハル', 'ミナ', 'ソラ', 'リク', 'ユイ'];
const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cellName = (cell) => (isInside(cell) ? `${ROOM_NAMES[roomOf(cell)]}（${rowOf(cell)}-${colOf(cell)}）` : '建物の外');
// ヒントが指す場面（手を打つと変わる）
const hintKey = (v) => JSON.stringify([v.logTotal, v.current, v.phase, v.players.map(p => `${p.cell}:${p.ap}`)]);

export const ICONS = {
    home: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
    help: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    log: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    hint: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
    undo: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)"/></svg>',
    assist: '<svg viewBox="0 0 24 24" class="line-icon"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.5" cy="13" r="1.2" fill="currentColor"/><circle cx="14.5" cy="13" r="1.2" fill="currentColor"/></svg>'
};

function loadSettings() {
    const fallback = { count: 3, mode: 'family', level: 'recruit', control: 'team' };
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : fallback.count,
            mode: Object.hasOwn(MODES, s.mode) ? s.mode : fallback.mode,
            level: Object.hasOwn(LEVELS, s.level) ? s.level : fallback.level,
            control: s.control === 'all' ? 'all' : 'team'
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

const pawn = (seat) => `<span class="pawn" style="--pc:${PLAYER_COLORS[seat % PLAYER_COLORS.length]}">${seat + 1}</span>`;

const SLIDE_MS = 380; // 消防士が1マス進む長さ（普通の速さ）

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selected = null;      // 押したマス（できる手をボタンで出している）
        this.pick = null;          // 隊長の指揮で、動かす先を選んでいる：{ seat, cells }
        this.sheetKind = null;
        this.resultShown = false;
        this.newsFrom = 0;
        this.lastEventSeq = 0;
        this.flash = new Set();
        ['home', 'open-help-game', 'open-log', 'hint', 'undo', 'assist'].forEach(id => {
            $(id).innerHTML = ICONS[{ home: 'home', 'open-help-game': 'help', 'open-log': 'log', hint: 'hint', undo: 'undo', assist: 'assist' }[id]];
        });
        $('title-art').innerHTML = titleArt();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面。部屋はすべて公開）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'フラッシュポイント',
            game: 'flash-point',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [
                { key: 'mode', label: '遊び方', options: [{ value: 'family', label: '家族向け' }, { value: 'experienced', label: '上級' }] },
                { key: 'level', label: '上級の難しさ', options: Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.name })) }
            ],
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
            this.settings[key] = parse(button.dataset[key]);
            saveSettings(this.settings);
            music.play('select');
            this.renderTitle();
        });
        seg('count', 'count', Number);
        seg('mode', 'mode');
        seg('level', 'level');
        seg('control', 'control');
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
        mark('mode', 'mode');
        mark('level', 'level');
        mark('control', 'control');
        $('level-row').classList.toggle('off', this.settings.mode !== 'experienced');
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online.available;
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.closeSheet();
        this.selected = null;
        this.pick = null;
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
        this.renderTitle();
    }

    start() {
        const { count, mode, level, control } = this.settings;
        const players = Array.from({ length: count }, (_, i) => (control === 'team'
            ? { name: i === 0 ? 'あなた' : CPU_NAMES[i - 1], isCPU: i > 0 }
            : { name: `${i + 1}P`, isCPU: false }));
        clearSavedGame();
        this.startWith({ players, options: { mode, level }, mode: control });
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
        controller.scheduleAuto();
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.resultShown = false;
        this.newsFrom = 0;
        this.selected = null;
        this.pick = null;
        this.hint = null;
        this.closeSheet();
        this.controller = controller;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.view = null;
        this.cancelResult?.();
        this.lastEventSeq = Infinity;
        this.update();
    }

    // ---- ゲーム ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('open-log').addEventListener('click', () => this.openLog());
        $('hint').addEventListener('click', () => this.showHint());
        $('undo').addEventListener('click', () => {
            if (this.controller?.undo()) music.play('cancel');
        });
        $('assist').addEventListener('click', () => this.controller?.assist());
        $('end-turn').addEventListener('click', () => {
            const v = this.view;
            if (v) this.send(v.current, { type: 'end' });
        });
        $('board').addEventListener('click', event => {
            const hit = event.target.closest('[data-cell]');
            if (hit) this.tapCell(Number(hit.dataset.cell));
        });
        $('options').addEventListener('click', event => {
            const button = event.target.closest('[data-i]');
            if (button && this.optionHandlers) this.optionHandlers[Number(button.dataset.i)]?.();
        });
        $('team').addEventListener('click', event => {
            const row = event.target.closest('[data-seat]');
            if (row) this.openPlayer(Number(row.dataset.seat));
        });
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && this.sheetKind !== 'role') this.closeSheet();
        });
        $('sheet').addEventListener('click', event => {
            const item = event.target.closest('[data-i]');
            if (item && !item.disabled && this.sheetHandlers) this.sheetHandlers[Number(item.dataset.i)]?.();
        });
    }

    send(seat, command) {
        this.sending = true;
        const before = this.view;
        const ok = this.controller?.send(seat, command) ?? false;
        this.sending = false;
        if (ok) {
            const v = this.controller.getView();
            if (!v?.result) music.play(v && before && v.rescued > before.rescued ? 'gain' : COMMAND_SOUND[command.type] ?? 'place');
        }
        return ok;
    }

    can(seat) {
        return !!this.controller?.canControl(seat);
    }

    // 自分が動かせる人の手番か
    isMyTurn() {
        const v = this.view;
        return !!v && !v.result && this.can(v.current);
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        if (!v) return;
        const prev = this.view;
        this.view = v;
        if (!prev || prev.current !== v.current || prev.turnNo !== v.turnNo) {
            this.selected = null;
            this.pick = null;
        }
        this.collectFlash(v);
        this.render();
        if (prev) this.animateChanges(prev, v);
        this.playUpdateSound(prev);
        // 専門職を選ぶ番はシートで聞く
        if (v.phase === 'role' && this.can(v.current) && !v.result) this.openRoles('role');
        else if (this.sheetKind === 'role') this.closeSheet();
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            this.recordLocalResult(v);
            this.cancelResult = Motion.afterIdle(() => this.openResult(), 700);
        }
    }

    // 描き直したあと：前のビューとの差を動かす（消防士は滑り、新しい火・煙・要救助者・危険物は弾み、数の欄は目立つ）
    animateChanges(prev, v) {
        if (!Motion.enabled() || prev.turnNo === undefined) return;
        const board = $('board');
        const before = ffPositions(prev);
        const after = ffPositions(v);
        for (const p of v.players) {
            const [ox, oy] = before.get(p.id) ?? [];
            const [nx, ny] = after.get(p.id) ?? [];
            if (ox === undefined || nx === undefined || (Math.abs(ox - nx) < 0.3 && Math.abs(oy - ny) < 0.3)) continue;
            const length = Motion.ms(SLIDE_MS);
            const animation = board.querySelector(`.ffslot[data-ff="${p.id}"]`)?.animate([
                { transform: `translate(${ox - nx}px, ${oy - ny}px)` },
                { transform: `translate(${(ox - nx) / 2}px, ${(oy - ny) / 2 - 2}px)`, offset: 0.5 },
                { transform: 'translate(0, 0)' }
            ], { duration: length, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
            if (animation) Motion.track(animation, length);
        }
        v.fire.forEach((f, cell) => {
            if (f > (prev.fire[cell] ?? 0)) Motion.popIn(board.querySelector(`.fx[data-fx="${cell}"]`), { duration: 360, delay: 100 });
        });
        const loose = (selector) => [...board.querySelectorAll(selector)].find(el => !el.closest('.ffslot'));
        for (const poi of v.pois) {
            const old = prev.pois.find(x => x.id === poi.id);
            const el = loose(`[data-poi="${poi.id}"]`);
            if (!old) Motion.popIn(el, { duration: 360, delay: 100 });
            else if (old.revealed !== poi.revealed || old.treated !== poi.treated) Motion.pulse(el, { duration: 380, scale: 1.4 });
        }
        for (const h of v.hazmats) {
            if (!prev.hazmats.some(x => x.id === h.id)) Motion.popIn(loose(`[data-hazmat="${h.id}"]`), { duration: 360, delay: 100 });
        }
        for (const [id, a, b] of [['stat-rescued', prev.rescued, v.rescued], ['stat-lost', prev.lost, v.lost], ['stat-damage', prev.damage, v.damage]]) {
            if (a !== b) Motion.pulse($(id), { duration: 380, scale: 1.3 });
        }
    }

    // 今回の更新で火が付いた・爆発した・ダイスが当たったマスを、少しのあいだ光らせる
    collectFlash(v) {
        const fresh = v.events.filter(e => e.seq > this.lastEventSeq);
        this.lastEventSeq = v.events.at(-1)?.seq ?? 0;
        this.flash = new Set(fresh.filter(e => ['roll', 'explosion', 'lost', 'knockdown', 'gun'].includes(e.type)).map(e => e.cell ?? e.from).filter(c => c !== undefined));
        this.knocked = fresh.some(e => e.type === 'knockdown');
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。CPU や仲間の手は知らせ、自分の番になったらチャイム
    playUpdateSound(prev) {
        const v = this.view;
        if (!prev) return;
        if (v.result) {
            // 協力ゲームなので、勝ちは全員が win、負けは全員が lose
            if (!prev.result) music.play(v.result.won ? 'win' : 'lose');
            return;
        }
        if (this.sending) return;
        const mine = this.isMyTurn() && v.phase === 'turn';
        const wasMine = prev.phase === 'turn' && this.can(prev.current) && prev.current === v.current && prev.turnNo === v.turnNo;
        if (mine && !wasMine) music.play('turn');
        else if (v.logTotal !== prev.logTotal) music.play('notify');
    }

    render() {
        const v = this.view;
        if (!v) return;
        const g = Game.fromView(v);
        const my = this.isMyTurn();
        const p = v.players[v.current];
        // 光らせるマス：始める場所・動けるマス・指揮で動かす先
        let reach = new Set();
        if (my && v.phase === 'place') reach = new Set(OUTSIDE_CELLS);
        else if (this.pick) reach = new Set(this.pick.cells);
        else if (my && v.phase === 'turn' && p.cell !== null) {
            NEIGHBORS[p.cell].forEach(n => {
                if (!g.commandError(v.current, { type: 'move', to: n })) reach.add(n);
            });
        }
        const hintCell = this.hintCell(v);
        $('board').innerHTML = boardSvg(v, {
            reach, selected: this.selected, hint: hintCell,
            roll: v.lastRoll ? v.lastRoll.r * 10 + v.lastRoll.c : null, flash: this.flash
        });
        // 上の欄：救出・犠牲・ダメージ
        $('stat-rescued').innerHTML = `<b>${v.rescued}</b><small>/${WIN_RESCUED}</small>`;
        $('stat-lost').innerHTML = `<b>${v.lost}</b><small>/${LOSE_LOST}</small>`;
        $('stat-damage').innerHTML = `<b>${v.damage}</b><small>/${DAMAGE_LIMIT}</small>`;
        $('stat-lost').classList.toggle('warn', v.lost >= LOSE_LOST - 1);
        $('stat-damage').classList.toggle('warn', v.damage >= DAMAGE_LIMIT - 6);
        // 仲間
        $('team').innerHTML = v.players.map(q => {
            const role = roleOf(q.role);
            const extra = [q.ext ? `+消${q.ext}` : '', q.mv ? `+移${q.mv}` : '', q.cp ? `+指${q.cp}` : ''].join('');
            const cls = ['tm', q.id === v.current ? 'cur' : '', q.isCPU ? 'cpu' : ''].join(' ');
            return `<button type="button" class="${cls}" data-seat="${q.id}">${pawn(q.id)}<span class="tm-name">${escapeHtml(q.name)}</span>`
                + `<span class="tm-ap">${q.id === v.current && v.phase === 'turn' ? `${q.ap}AP${extra}` : q.ap ? `${q.ap}` : ''}</span>`
                + (v.mode === 'experienced' && q.role ? `<span class="tm-role">${role.name}</span>` : '')
                + '</button>';
        }).join('');
        this.showNews(v);
        this.renderBar(v);
        this.renderOptions(v, g);
    }

    // 下の帯：誰の番か・終えるボタン・ヒントなど
    renderBar(v) {
        const my = this.isMyTurn();
        const p = v.players[v.current];
        let text = '';
        if (v.result) text = v.result.won ? '勝利' : '敗北';
        else if (v.phase === 'role') text = my ? '専門職を選ぶ' : `${escapeHtml(p.name)}が専門職を選んでいます`;
        else if (v.phase === 'place') text = my ? `${escapeHtml(p.name)}：建物の外の始める場所を選ぶ` : `${escapeHtml(p.name)}が場所を選んでいます`;
        else if (this.pick) text = `${escapeHtml(v.players[this.pick.seat].name)}を動かす先を選ぶ`;
        else if (my) text = `${pawn(p.id)}${escapeHtml(p.name)}の番`;
        else text = `${pawn(p.id)}${escapeHtml(p.name)}の番…`;
        $('turn-text').innerHTML = text;
        const local = this.controller && !this.controller.isOnline;
        $('end-turn').hidden = !(my && v.phase === 'turn');
        $('end-turn').classList.toggle('ready', my && v.phase === 'turn' && p.ap + p.ext + p.mv + p.cp === 0);
        $('hint').hidden = !local || !my || !!v.result;
        $('undo').hidden = !local || !my || !!v.result;
        $('undo').disabled = !this.controller?.canUndo();
        $('assist').hidden = !local || !my || !!v.result;
        $('end-turn').classList.toggle('recommended', this.hint?.command.type === 'end' && this.hint.at === hintKey(v));
    }

    // 押したマスでできる手（ボタン）。自分の番でなければ出さない
    renderOptions(v, g) {
        const list = this.selected !== null && this.isMyTurn() && v.phase === 'turn' ? this.optionsFor(v, g, this.selected) : [];
        this.optionHandlers = list.map(o => () => {
            this.selected = null;
            if (o.run) o.run();
            else this.send(v.current, o.command);
            this.render();
        });
        const hint = this.hint?.at === hintKey(v) ? JSON.stringify(this.hint.command) : null;
        $('options').innerHTML = list.length
            ? `<span class="opt-where">${cellName(this.selected)}</span>` + list.map((o, i) => `<button type="button" class="opt${o.command && JSON.stringify(o.command) === hint ? ' recommended' : ''}" data-i="${i}">${escapeHtml(o.label)}${o.cost ? `<small>${o.cost}</small>` : ''}</button>`).join('')
            : '';
        $('options').hidden = !list.length;
    }

    // そのマスでできる手の一覧：{ label, cost, command } か { label, run }
    optionsFor(v, g, cell) {
        const seat = v.current;
        const p = v.players[seat];
        const list = [];
        const ok = (command) => !g.commandError(seat, command);
        const add = (label, command, cost = '') => {
            if (ok(command)) list.push({ label, command, cost });
        };
        if (cell === p.cell) {
            if (isInside(cell) && v.fire[cell]) add(v.fire[cell] === 2 ? '火を煙に' : '煙を消す', { type: 'extinguish', cell }, `${g.extCost(seat)}AP`);
            v.pois.filter(x => x.cell === cell && x.revealed).forEach(x => add(x.treated ? '連れて歩く' : '運ぶ', { type: 'carry', item: `p${x.id}` }));
            v.hazmats.filter(h => h.cell === cell).forEach(h => add('危険物を運ぶ', { type: 'carry', item: `h${h.id}` }));
            add('降ろす', { type: 'drop' });
            add('手当て', { type: 'treat' }, '1AP');
            add('危険物を処理', { type: 'dispose' }, '2AP');
            if (v.vehicles) {
                add('放水', { type: 'gun' }, `${p.role === 'driver' ? 2 : 4}AP`);
                if (g.onVehicle(seat, 'engine')) list.push({ label: '消防車を動かす', run: () => this.openDrive('engine') });
                if (g.onVehicle(seat, 'engine') && v.unusedRoles.length && p.ap >= 2) list.push({ label: '専門職を替える', cost: '2AP', run: () => this.openRoles('crew') });
                list.push({ label: '救急車を呼ぶ', run: () => this.openDrive('ambulance') });
            }
        } else if (p.cell !== null && NEIGHBORS[p.cell].includes(cell)) {
            const cost = g.moveCost(seat, cell);
            if (cost !== null) add('動く', { type: 'move', to: cell }, `${cost}AP`);
            if (isInside(cell) && v.fire[cell]) add(v.fire[cell] === 2 ? '火を煙に' : '煙を消す', { type: 'extinguish', cell }, `${g.extCost(seat)}AP`);
            const e = v.edges[edgeKey(p.cell, cell)];
            if (e?.t === 'door') add(e.s === 'open' ? '扉を閉める' : '扉を開ける', { type: 'door', to: cell }, '1AP');
            if (e?.t === 'wall') add(e.d ? '壁を壊す' : '壁を傷める', { type: 'chop', to: cell }, `${p.role === 'rescue' ? 1 : 2}AP`);
        }
        if (cell !== p.cell) add('正体を調べる', { type: 'identify', cell }, '1AP');
        // 隊長：そのマスの隊員を指揮で動かす
        if (p.role === 'captain' && p.cp > 0) {
            v.players.filter(q => q.cell === cell && q.id !== seat).forEach(q => {
                const cells = NEIGHBORS[cell].filter(n => !g.commandError(seat, { type: 'command', seat: q.id, to: n }));
                if (cells.length) list.push({ label: `${q.name}を指揮`, run: () => { this.pick = { seat: q.id, cells }; } });
            });
        }
        return list;
    }

    tapCell(cell) {
        const v = this.view;
        if (!v || !this.isMyTurn()) return;
        if (v.phase === 'place') {
            this.send(v.current, { type: 'place', cell });
            return;
        }
        if (v.phase !== 'turn') return;
        if (this.pick) {
            const { seat, cells } = this.pick;
            this.pick = null;
            if (cells.includes(cell)) this.send(v.current, { type: 'command', seat, to: cell });
            this.render();
            return;
        }
        const g = Game.fromView(v);
        const list = this.optionsFor(v, g, cell);
        // できることが「動く」だけなら、すぐに動く
        if (list.length === 1 && list[0].command?.type === 'move') {
            this.selected = null;
            this.send(v.current, list[0].command);
            return;
        }
        if (!list.length) {
            this.selected = null;
            this.render();
            this.describeCell(v, cell);
            return;
        }
        music.play('select');
        this.selected = this.selected === cell ? null : cell;
        this.render();
    }

    // できることのないマスを押したとき：そのマスの様子
    describeCell(v, cell) {
        const parts = [cellName(cell)];
        if (v.fire[cell] === 2) parts.push('火');
        else if (v.fire[cell] === 1) parts.push('煙');
        if (v.hotspots.includes(cell)) parts.push('ホットスポット');
        if (v.pois.some(x => x.cell === cell && !x.revealed)) parts.push('正体の分からない印');
        if (v.pois.some(x => x.cell === cell && x.revealed)) parts.push('要救助者');
        if (v.hazmats.some(h => h.cell === cell)) parts.push('危険物');
        this.toast(parts.join('・'));
    }

    hintCell(v) {
        if (!this.hint || this.hint.at !== hintKey(v)) return null;
        const c = this.hint.command;
        if (c.type === 'move' || c.type === 'door' || c.type === 'chop') return c.to;
        if (c.type === 'extinguish' || c.type === 'identify' || c.type === 'place') return c.cell;
        if (c.type === 'command') return c.to;
        if (['carry', 'drop', 'treat', 'dispose', 'gun', 'drive', 'crew'].includes(c.type)) return v.players[v.current].cell;
        return null;
    }

    // おすすめの手を、短い文で知らせ、押すマス・ボタンを光らせる（打つのは自分）
    showHint() {
        const v = this.view;
        const h = this.controller?.suggest();
        if (!v || !h) {
            this.toast('今はおすすめの手がありません');
            return;
        }
        this.hint = { at: hintKey(v), ...h };
        music.play('select');
        this.toast(`おすすめ：${this.hintText(v, h.command)}`);
        if (h.command.type === 'role') this.openRoles('role');
        this.render();
    }

    hintText(v, c) {
        const text = {
            role: () => `${ROLE[c.role].name}を選ぶ`, place: () => `${SIDE_NAMES[this.sideOf(c.cell)]}から入る`,
            move: () => `${cellName(c.to)}へ動く`, carry: () => (c.item[0] === 'p' ? '要救助者を運ぶ' : '危険物を運ぶ'), drop: () => '降ろす',
            door: () => '扉を開ける', extinguish: () => `${cellName(c.cell)}を消火`, chop: () => '壁を壊す', identify: () => '印の正体を調べる',
            treat: () => '手当てする', dispose: () => '危険物を処理する', gun: () => '放水する', end: () => '手番を終える',
            drive: () => '車を動かす', command: () => '指揮で動かす', crew: () => '専門職を替える'
        }[c.type];
        return text ? text() : c.type;
    }

    sideOf(cell) {
        if (rowOf(cell) === 0) return 0;
        if (colOf(cell) === 9) return 1;
        if (rowOf(cell) === 7) return 2;
        return 3;
    }

    // 新しい出来事を、盤面の上に数秒だけ出す（最後の3行）
    showNews(v) {
        const fresh = v.logs.filter(l => l.n > this.newsFrom);
        if (!fresh.length) return;
        this.newsFrom = v.logTotal;
        const el = $('news');
        el.innerHTML = fresh.slice(-3).map(l => `<div class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</div>`).join('');
        el.classList.add('show');
        clearTimeout(this.newsTimer);
        this.newsTimer = setTimeout(() => el.classList.remove('show'), 3200);
    }

    // ---- シート ----

    openRoles(kind) {
        const v = this.view;
        const seat = v.current;
        const items = ROLES.filter(r => v.unusedRoles.includes(r.key)).map(r => ({
            label: `<b>${r.name}</b>`, html: true, sub: r.text,
            recommended: this.hint?.command.type === 'role' && this.hint.command.role === r.key,
            run: () => this.send(seat, kind === 'crew' ? { type: 'crew', role: r.key } : { type: 'role', role: r.key })
        }));
        this.openSheet({ kind: kind === 'crew' ? 'info' : 'role', title: kind === 'crew' ? '替える専門職（2AP）' : `${v.players[seat].name}の専門職`, items, close: kind === 'crew' ? 'やめる' : null });
    }

    openDrive(vehicle) {
        const v = this.view;
        const from = v.vehicles[vehicle];
        const items = [0, 1, 2, 3].filter(s => s !== from).map(side => ({
            label: `${SIDE_NAMES[side]}の駐車場へ`, sub: `${2 * sideDistance(from, side)}AP${vehicle === 'engine' ? `・放水は${QUADRANTS[ENGINE_QUADRANT[side]].name}の区画` : ''}`,
            run: () => this.send(v.current, { type: 'drive', vehicle, side })
        }));
        this.openSheet({ title: vehicle === 'engine' ? '消防車を動かす' : '救急車を呼ぶ', items, close: 'やめる' });
    }

    openPlayer(seat) {
        const v = this.view;
        const q = v.players[seat];
        const role = roleOf(q.role);
        const html = `<p class="sheet-text">${pawn(seat)} ${escapeHtml(q.name)}${q.isCPU ? '（CPU）' : ''}・${role.name}</p>`
            + (role.text ? `<p class="sheet-sub">${role.text}</p>` : '')
            + `<p class="sheet-sub">いまの場所：${q.cell === null ? 'まだ' : cellName(q.cell)}・持ち越しの AP ${q.ap}</p>`;
        this.openSheet({ title: '隊員', html, close: '閉じる' });
    }

    openLog() {
        const v = this.view;
        const html = `<div class="log">${v.logs.slice().reverse().map(l => `<div class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</div>`).join('')}</div>`;
        this.openSheet({ title: '記録', html, close: '閉じる' });
    }

    openHelp() {
        this.openSheet({ title: '遊び方', html: HELP_HTML, close: '閉じる', wide: true });
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // 協力ゲームなので、クリアなら勝ち、失敗なら負け。id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view?.result) return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: view.result.won ? 'win' : 'loss' });
    }

    openResult() {
        const v = this.view;
        if (!v?.result) return;
        const mode = v.mode === 'experienced' ? `上級・${LEVELS[v.level].name}` : '家族向け';
        this.openSheet({
            kind: 'result',
            title: v.result.won ? '勝利' : '敗北',
            html: `<p class="sheet-text">${END_REASONS[v.result.reason]}</p><p class="sheet-sub">${mode}・${v.players.length}人・救出 ${v.rescued}人・犠牲 ${v.lost}人・ダメージ ${v.damage}</p>`,
            items: [
                // オンラインは、ロビーを出し、ホストの「もう一度」で再戦する
                { label: 'もう一度', primary: true, run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
                { label: 'ホーム', center: true, id: 'result-home', run: () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()) }
            ]
        });
    }

    // items: [{ label, sub, html, run, primary, recommended, id }]
    openSheet({ kind = 'info', title, html = '', items = [], close = null, wide = false }) {
        this.sheetKind = kind;
        $('sheet-title').textContent = title;
        const list = items.map((it, i) => `<button type="button" class="opt${it.primary ? ' primary' : ''}${it.center ? ' center' : ''}${it.recommended ? ' recommended' : ''}" data-i="${i}"${it.id ? ` id="${it.id}"` : ''}>`
            + `<span class="opt-label">${it.html ? it.label : escapeHtml(it.label)}</span>${it.sub ? `<small>${escapeHtml(it.sub)}</small>` : ''}</button>`).join('');
        $('sheet-body').innerHTML = html + (items.length ? `<div class="opts">${list}</div>` : '');
        this.sheetHandlers = items.map(it => () => {
            this.closeSheet();
            it.run();
        });
        $('sheet-buttons').innerHTML = close ? `<button type="button" class="btn secondary" data-i="${items.length}">${close}</button>` : '';
        if (close) this.sheetHandlers.push(() => {
            music.play('cancel');
            this.closeSheet();
        });
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
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
