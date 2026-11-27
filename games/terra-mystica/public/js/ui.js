/**
 * 画面（タイトル・ゲーム・最後の結果・記録・遊び方）
 * 画面はビューだけを見て描く。できる操作の判定は、ビューの状態から作った Game（試し打ち用）で行う
 * 操作は controller.send() に送る。足りない資源は、CPU と同じ交換の手順で補ってから送れる
 */

import Game, { MIN_PLAYERS, MAX_PLAYERS, CONVERSIONS, SPECIALS } from './game.js';
import { LEVELS, paymentPlan } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame, CPU_DELAY_MS } from './game-controller.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';
import { MIN_PLAYERS as ONLINE_MIN, MAX_PLAYERS as ONLINE_MAX } from './game.js';
import BoardView, { buildingSvg } from './board-view.js';
import {
    TERRAINS, TERRAIN_INFO, FACTIONS, FACTION_ORDER, CULTS, CULT_INFO, BUILDING_INFO, POWER_ACTIONS, BONUS_CARDS,
    FAVOR_TILES, TOWN_TILES, SCORE_TILES, ROUNDS, SHIP_COST, DIG_VP
} from './data.js';
import { HEXES, LAND, BRIDGE_PAIRS } from './map.js';
import { music } from './music.js';

const SETTINGS_KEY = 'terra-mystica.settings';
const RESULT_DELAY_MS = 900;
const PROMPTS = ['bonus', 'favor', 'town', 'leech', 'cultist', 'darklings'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// 資源の印
const ICONS = {
    C: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="#f0c24a" stroke="#7d5a0c" stroke-width="1.2"/><circle cx="8" cy="8" r="3.4" fill="none" stroke="#7d5a0c" stroke-width="1"/></svg>',
    W: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4.6" r="2.8" fill="#d9a066" stroke="#5a3514" stroke-width="1"/><path d="M3 14.5v-2.6a5 5 0 0 1 10 0v2.6Z" fill="#d9a066" stroke="#5a3514" stroke-width="1"/></svg>',
    P: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.4l2.4 3.2L8 7.8 5.6 4.6Z" fill="#efe6ff" stroke="#4a3a78" stroke-width="1"/><path d="M4.2 14.6 6 8.2h4l1.8 6.4Z" fill="#efe6ff" stroke="#4a3a78" stroke-width="1"/></svg>',
    PW: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="#8b5bd6" stroke="#3a1f66" stroke-width="1.2"/><path d="M8.8 3.4 5.6 8.6h2.6l-1 4 3.2-5.2H7.8Z" fill="#fff3c4"/></svg>',
    VP: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.3l2 4.3 4.6.5-3.4 3.1 1 4.6L8 11.5l-4.2 2.3 1-4.6L1.4 6.1 6 5.6Z" fill="#f4cf5d" stroke="#7d5a0c" stroke-width="1"/></svg>',
    spade: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.2 1.5h1.6v6H7.2Z" fill="#8a5a2b"/><path d="M4.6 7.4h6.8v3.4a3.4 3.4 0 0 1-6.8 0Z" fill="#c9cfd6" stroke="#3a4048" stroke-width="1"/></svg>'
};
const ACT_ICONS = {
    power: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#8b5bd6" stroke="#2a1650" stroke-width="1.5"/><path d="M13.4 5.5 8.6 13h4l-1.6 5.5 5-7.8h-4Z" fill="#fff3c4"/></svg>',
    cult: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="12" width="4" height="9" rx="1" fill="#d9503f"/><rect x="8" y="6" width="4" height="15" rx="1" fill="#3f86cf"/><rect x="13" y="9" width="4" height="12" rx="1" fill="#a8773f"/><rect x="18" y="4" width="3.5" height="17" rx="1" fill="#cfcfe0"/></svg>',
    upgrade: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c4 2 14 2 18 0l-2 3H5Z" fill="#8a5a2b"/><path d="M11 3h2v12h-2Z" fill="#e9d8b0"/><path d="M12 3l6 9h-6Z" fill="#f6f0dc"/><path d="M7.5 9.5h3v4.5h-3Z" fill="#c9cfd6"/></svg>',
    convert: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#f6f0dc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="#e9d8b0" stroke="#5a4420" stroke-width="1.4"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#5a4420" stroke-width="1.6" stroke-linecap="round"/></svg>',
    pass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18" stroke="#f6f0dc" stroke-width="2" stroke-linecap="round"/><path d="M7 4h11l-3 4 3 4H7Z" fill="#f4cf5d"/></svg>'
};

const costHtml = (cost) => {
    const parts = Object.entries(cost ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `<span class="res">${ICONS[k] ?? ''}<b>${v}</b></span>`);
    return parts.length ? `<span class="cost-list">${parts.join('')}</span>` : '<span class="cost-list">無料</span>';
};
const factionColor = (id) => TERRAIN_INFO[FACTIONS[id].terrain].color;
const swatch = (id) => `<span class="swatch" style="background:${factionColor(id)}"></span>`;
const PLAN_TEXT = {
    burn: (n) => `魔力を${n}燃やす`, 'PW>C': (n) => `魔力${n}→コイン${n}`, 'PW>W': (n) => `魔力${3 * n}→職人${n}`, 'PW>P': (n) => `魔力${5 * n}→司祭${n}`,
    'P>W': (n) => `司祭${n}→職人${n}`, 'W>C': (n) => `職人${n}→コイン${n}`, 'VP>C': (n) => `${n}点→コイン${n}`
};
const planText = (plan) => plan.map(c => PLAN_TEXT[c.kind]?.(c.n ?? 1) ?? '').join('・');

function loadSettings() {
    const fallback = { count: 4, level: 'normal', faction: null };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(saved.count) && saved.count >= MIN_PLAYERS && saved.count <= MAX_PLAYERS ? saved.count : fallback.count,
            level: Object.hasOwn(LEVELS, saved.level) ? saved.level : fallback.level,
            faction: Object.hasOwn(FACTIONS, saved.faction) ? saved.faction : null
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
        this.sim = null;
        this.mode = null;
        this.seenSeq = 0;
        this.openedPrompt = null;
        this.resultTimer = null;
        this.resultShown = false;
        this.sheetActs = [];
        this.pendingActs = [];
        this.sheetRefresh = null;
        this.board = new BoardView($('#board'));
        this.board.onTap = (hex) => this.onHexTap(hex);
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'テラミスティカ',
            game: 'terra-mystica',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_DELAY_MS[0],
            minPlayers: ONLINE_MIN,
            maxPlayers: ONLINE_MAX,
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
        this.renderTitleArt();
        this.renderHelpWheel();
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
        this.hintCommand = null;
        // ヒント（と待った）はローカル対戦だけ
        document.querySelectorAll('#hint, #undo').forEach(el => { el.hidden = Boolean(controller.isOnline); });
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.mode = null;
        this.resultShown = false;
        this.openedPrompt = null;
        this.view = this.controller.getView();
        this.seenSeq = this.view.events.at(-1)?.seq ?? 0;
        this.soundSeq = this.seenSeq;
        this.hint = null;
        this.board.resetZoom();
        this.onUpdate();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const { count, level, faction } = this.settings;
        const cpus = Array.from({ length: count - 1 }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true }));
        const players = [{ name: 'あなた', isCPU: false }, ...cpus];
        this.startGame({ players, options: { factions: [faction ?? null] }, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        ['#result', '#sheet'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- タイトル ----

    changeSetting(patch) {
        this.settings = { ...this.settings, ...patch };
        this.settings.count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, this.settings.count));
        saveSettings(this.settings);
        this.renderSetup();
    }

    renderSetup() {
        const { count, level, faction } = this.settings;
        $('#count-value').textContent = `${count}人`;
        $('#count-down').disabled = count <= MIN_PLAYERS;
        $('#count-up').disabled = count >= MAX_PLAYERS;
        $('#level').innerHTML = Object.entries(LEVELS).map(([key, name]) => `<button data-level="${key}" class="${key === level ? 'on' : ''}" role="radio" aria-checked="${key === level}">${name}</button>`).join('');
        $('#factions').innerHTML = `<button class="faction-btn any ${faction ? '' : 'on'}" data-faction="">おまかせ</button>`
            + FACTION_ORDER.map(id => `<button class="faction-btn ${id === faction ? 'on' : ''}" data-faction="${id}">${swatch(id)}${FACTIONS[id].name}</button>`).join('');
        $('#faction-note').textContent = faction ? `${TERRAIN_INFO[FACTIONS[faction].terrain].name}に住む` : '乱数で決めます';
    }

    renderTitleArt() {
        const order = ['forest', 'lakes', 'swamp', 'plains', 'desert', 'wasteland', 'mountains'];
        const R = 9;
        const Wd = Math.sqrt(3) * R;
        const pts = [0, 1, 2, 3, 4, 5].map(i => {
            const a = Math.PI / 180 * (60 * i - 30);
            return `${(R * Math.cos(a)).toFixed(2)},${(R * Math.sin(a)).toFixed(2)}`;
        }).join(' ');
        const bld = ['D', null, 'TP', 'TE', null, 'SH', 'SA'];
        const hexes = order.map((t, i) => {
            const x = 14 + i * Wd;
            const y = i % 2 ? 26 : 13;
            const color = TERRAIN_INFO[t].color;
            const b = bld[i] ? `<g transform="translate(${x},${y}) scale(.9)"><path d="${{ D: 'M-3.6 3V-.8L0-4.2 3.6-.8V3Z', TP: 'M-5 3.4V-1.2L-2.2-4.2.6-1.2H5V3.4Z', TE: 'M-4.2 0a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0Z', SH: 'M-5 4V-2.6H-3.4V-4.6H-1.4V-2.6H1.4V-4.6H3.4V-2.6H5V4Z', SA: 'M-5.4 4V.2A5.4 5.4 0 0 1 5.4 .2V4Z' }[bld[i]]}" fill="${color}" stroke="#fff8e6" stroke-width="1.6"/><path d="${{ D: 'M-3.6 3V-.8L0-4.2 3.6-.8V3Z', TP: 'M-5 3.4V-1.2L-2.2-4.2.6-1.2H5V3.4Z', TE: 'M-4.2 0a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0Z', SH: 'M-5 4V-2.6H-3.4V-4.6H-1.4V-2.6H1.4V-4.6H3.4V-2.6H5V4Z', SA: 'M-5.4 4V.2A5.4 5.4 0 0 1 5.4 .2V4Z' }[bld[i]]}" fill="${color}" stroke="#1b1208" stroke-width=".8"/></g>` : '';
            return `<polygon points="${pts}" transform="translate(${x},${y})" fill="${color}" stroke="#1b1208" stroke-width=".7"/>${b}`;
        }).join('');
        $('#title-art').innerHTML = `<svg viewBox="0 0 ${(28 + 6 * Wd).toFixed(0)} 40">${hexes}</svg>`;
    }

    renderHelpWheel() {
        $('#help-wheel').innerHTML = `<span class="wheel">${TERRAINS.map(t => `<span style="background:${TERRAIN_INFO[t].color};color:${TERRAIN_INFO[t].ink}">${TERRAIN_INFO[t].name}</span>`).join('')}</span>（荒地の次は砂漠に戻る輪）`;
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#count-down').addEventListener('click', () => this.changeSetting({ count: this.settings.count - 1 }));
        $('#count-up').addEventListener('click', () => this.changeSetting({ count: this.settings.count + 1 }));
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (button) this.changeSetting({ level: button.dataset.level });
        });
        $('#factions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-faction]');
            if (button) this.changeSetting({ faction: button.dataset.faction || null });
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.showTitle();
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.openLog());
        $('#round-info').addEventListener('click', () => this.openInfo());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#zoom-in').addEventListener('click', () => this.board.zoomBy(1.4));
        $('#zoom-out').addEventListener('click', () => this.board.zoomBy(1 / 1.4));
        $('#me').addEventListener('click', () => this.view && this.openPlayer(this.view.you));
        $('#players').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-seat]');
            if (chip) this.openPlayer(Number(chip.dataset.seat));
        });
        document.querySelectorAll('.act-ico').forEach(span => { span.innerHTML = ACT_ICONS[span.dataset.ico]; });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-panel]');
            if (!button || button.disabled) return;
            this.mode = null;
            ({ power: () => this.openPower(), cult: () => this.openCult(), upgrade: () => this.openUpgrade(), convert: () => this.openConvert(), info: () => this.openInfo(), pass: () => this.openPass() })[button.dataset.panel]();
        });
        $('#status-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-a]');
            if (button) this.statusActs[Number(button.dataset.a)]?.();
        });
        const sheetClick = (event) => {
            const target = event.target.closest('[data-a]');
            if (!target || target.disabled) return;
            this.sheetActs[Number(target.dataset.a)]?.();
        };
        $('#sheet-body').addEventListener('click', sheetClick);
        $('#sheet-buttons').addEventListener('click', sheetClick);
        $('#sheet').addEventListener('close', () => { this.sheetRefresh = null; });

        // ダイアログは外側のタップと「閉じる」で閉じる（結果は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }

    // ---- 状態 ----

    get you() {
        return this.view?.you ?? 0;
    }

    me() {
        return this.view.state.players[this.you];
    }

    myWaiting() {
        const w = this.view?.waiting;
        return w && w.seat === this.you && this.view.state.phase !== 'end' ? w : null;
    }

    myAction() {
        return this.myWaiting()?.kind === 'action';
    }

    pname(seat) {
        const p = this.view.state.players[seat];
        return seat === this.you ? `あなた（${FACTIONS[p.faction].name}）` : FACTIONS[p.faction].name;
    }

    // 操作を送る（交換の手順のあとに本命を送る。途中で断られたら止める）
    send(...commands) {
        if (!this.controller) return false;
        this.mode = null;
        this.sending = true;
        try {
            for (const command of commands) {
                if (!this.controller?.send(command)) return false;
            }
        } finally {
            this.sending = false;
        }
        this.playSent(commands.at(-1));
        // 自分が動いたら、それまでのほかの人の動きの印を消す
        this.seenSeq = this.view?.events.at(-1)?.seq ?? this.seenSeq;
        this.render();
        return true;
    }

    // 資源が足りなければ交換の手順を付けて送る
    sendPaid(command, cost) {
        const plan = paymentPlan(this.sim, this.you, cost ?? {}) ?? [];
        this.closeSheet();
        return this.send(...plan, command);
    }

    // 払えるか（交換で補えるか）。{ ok, plan }
    affordable(cost) {
        if (this.sim.canPay(this.you, cost ?? {})) return { ok: true, plan: [] };
        const plan = paymentPlan(this.sim, this.you, cost ?? {});
        return plan ? { ok: true, plan } : { ok: false, plan: null };
    }

    onUpdate() {
        if (!this.controller) return;
        const wasMine = !!this.myWaiting();
        this.view = this.controller.getView();
        if (this.hint && this.hint.key !== this.view.commandCount) this.hint = null;
        if (!this.sending) this.playUpdate(wasMine);
        this.sim = Game.fromState(this.view.state, this.view.options);
        // 自分の番が来たら、それまでのほかの人の動きを印で見せる。自分が動いたら印を消す
        if (this.mode && !this.myAction()) this.mode = null;
        this.render();
        this.afterRender();
    }

    afterRender() {
        const s = this.view.state;
        if (s.phase === 'end') this.recordLocalResult(s);
        if (s.phase === 'end') {
            if (!this.resultShown) {
                this.resultShown = true;
                if ($('#sheet').open) $('#sheet').close();
                this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
            }
            return;
        }
        // 開いているシートを新しい状態で描き直す（答えた選択のシートは閉じる）
        if ($('#sheet').open) {
            if (this.sheetRefresh) {
                if (this.sheetRefresh() === false) this.closeSheet();
            }
        }
        const w = this.myWaiting();
        if (w && PROMPTS.includes(w.kind)) {
            const key = `${this.view.commandCount}:${w.kind}`;
            if (this.openedPrompt !== key) {
                this.openedPrompt = key;
                this.openPrompt();
            }
        }
    }

    // ---- 効果音 ----

    // 自分が送った操作の音（1つの操作に1つ。町ができたら gain、終わりは勝ち負け）
    playSent(command) {
        const fresh = this.view.events.filter(e => e.seq > this.soundSeq);
        this.soundSeq = this.view.events.at(-1)?.seq ?? this.soundSeq;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(this.you) ? 'win' : 'lose');
        if (fresh.some(e => e.type === 'town' && e.seat === this.you)) return music.play('gain');
        const sound = {
            place: 'place', build: 'place', transform: 'place', upgrade: 'place', bridge: 'place', priest: 'place', darklings: 'place',
            power: 'place', special: 'place', ship: 'gain', dig: 'gain', bonus: 'gain', favor: 'gain', town: 'gain', cultist: 'gain',
            convert: 'pay', pass: 'place', done: 'select', leech: command?.accept ? 'gain' : 'cancel'
        }[command?.type];
        if (sound) music.play(sound);
    }

    // ほかの人が動いたときの音。自分が答える番になったら turn、ラウンドが変わったら notify、終わりは勝ち負け
    // CPU は1手ずつ速く打つので、CPU の手ごとには鳴らさない
    playUpdate(wasMine) {
        const fresh = this.view.events.filter(e => e.seq > this.soundSeq);
        this.soundSeq = this.view.events.at(-1)?.seq ?? this.soundSeq;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(this.you) ? 'win' : 'lose');
        if (this.myWaiting() && !wasMine) return music.play('turn');
        if (fresh.some(e => e.type === 'round')) music.play('notify');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hint = { key: this.view.commandCount, command };
        this.render();
        this.toast(`おすすめ：${this.hintText(command)}`);
    }

    hintText(c) {
        switch (c.type) {
        case 'place': return '光っている土地に最初の住居を置く';
        case 'build': return '光っている土地に住居を建てる';
        case 'transform': return '光っている土地の地形を変える';
        case 'upgrade': return `光っている土地の建物を${BUILDING_INFO[c.to]?.name ?? ''}に改良する`;
        case 'ship': return '航海を伸ばす（改良）';
        case 'dig': return '鋤を改良する（改良）';
        case 'priest': return `司祭を${CULT_INFO[c.track]?.name ?? ''}の宗教に送る（宗教）`;
        case 'power': return `魔力のアクション「${POWER_ACTIONS[c.id]?.name ?? ''}」（魔力）`;
        case 'special': return `${SPECIALS[c.id]?.name ?? '特別なアクション'}`;
        case 'pass': return 'パスする';
        case 'bonus': return `ボーナスカード（${BONUS_CARDS[c.id]?.text ?? ''}）`;
        case 'favor': return `恩恵タイル（${FAVOR_TILES[c.id]?.text ?? ''}）`;
        case 'town': return `町タイル（${TOWN_TILES[c.id]?.text ?? ''}）`;
        case 'leech': return c.accept ? '魔力を受け取る' : '魔力を受け取らない';
        case 'cultist': return `${CULT_INFO[c.track]?.name ?? ''}の宗教を進める`;
        case 'darklings': return `職人を司祭に${c.n}人替える`;
        case 'done': return '使わずに進める';
        default: return '交換する';
        }
    }

    // ヒントのおすすめを付ける下のボタン（土地を選ぶ手は盤の土地に付ける）
    hintPanel(c) {
        if (c.hex !== undefined) return null;
        return { power: 'power', special: 'power', priest: 'cult', cultist: 'cult', ship: 'upgrade', dig: 'upgrade', convert: 'convert', pass: 'pass' }[c.type] ?? null;
    }

    // ---- 描画 ----

    render() {
        const s = this.view.state;
        // 上の欄
        if (s.round === 0) {
            $('#round-info').innerHTML = '<b>準備</b><span class="tile-text">最初の住居とボーナスカード</span>';
        } else {
            const tile = SCORE_TILES[s.scoreTiles[s.round - 1]];
            $('#round-info').innerHTML = `<b>R${s.round}</b><span class="tile-text">${tile.text}${s.round < ROUNDS ? `／${tile.bonusText}` : ''}</span>`;
        }
        // プレイヤー
        const order = s.order.length ? s.order : s.players.map(p => p.id);
        const actor = this.view.actors[0];
        $('#players').style.setProperty('--cols', String(Math.min(order.length, s.players.length > 4 ? 3 : 4)));
        $('#players').innerHTML = order.map(seat => {
            const p = s.players[seat];
            const cls = ['pchip', seat === actor ? 'active' : '', p.passed && s.phase === 'actions' ? 'passed' : '', seat === this.you ? 'mine' : ''].join(' ');
            const sub = p.passed && s.phase === 'actions' ? 'パス' : `${ICONS.VP}<b>${p.res.VP}</b>`;
            return `<button class="${cls}" data-seat="${seat}">${swatch(p.faction)}<span class="pc-text"><span class="pc-name">${seat === this.you ? 'あなた' : FACTIONS[p.faction].short ?? FACTIONS[p.faction].name}</span><span class="pc-sub">${sub}</span></span></button>`;
        }).join('');
        // 地図
        this.board.render(s, this.marks());
        this.renderStatus();
        this.renderMe();
        // 下のボタン
        const action = this.myAction();
        const mine = !!this.myWaiting();
        const hintPanel = this.hint ? this.hintPanel(this.hint.command) : null;
        document.querySelectorAll('#actions .act').forEach(button => {
            const panel = button.dataset.panel;
            button.classList.toggle('recommended', panel === hintPanel);
            button.disabled = s.phase === 'end'
                ? !['info', 'cult'].includes(panel)
                : ['power', 'upgrade', 'pass'].includes(panel) ? !action
                    : panel === 'convert' ? !mine || s.phase === 'setup' : false;
        });
    }

    marks() {
        const s = this.view.state;
        const recent = new Set();
        this.view.events.forEach(e => {
            if (e.seq <= this.seenSeq || e.seat === this.you) return;
            if (e.type === 'build' || e.type === 'transform') recent.add(e.hex);
            if (e.type === 'bridge') { recent.add(e.a); recent.add(e.b); }
        });
        const marks = { recent, hint: this.hint?.command.hex ?? null };
        const w = this.myWaiting();
        if (!w) return marks;
        if (this.mode?.type === 'bridge') {
            const pairs = this.validBridges();
            marks.bridges = pairs;
            marks.targets = new Set(pairs.flat().filter(id => this.mode.first === undefined || this.mode.first === null || pairs.some(([a, b]) => (a === this.mode.first && b === id) || (b === this.mode.first && a === id))));
            marks.picked = this.mode.first ?? null;
            marks.strong = true;
            return marks;
        }
        if (this.mode?.type === 'hex') {
            marks.targets = new Set(LAND.filter(hex => this.sim.checkSpecial(this.you, { id: this.mode.id, hex }).ok));
            marks.strong = true;
            return marks;
        }
        if (w.kind === 'place' || w.kind === 'spades') {
            marks.targets = new Set(LAND.filter(hex => this.sim.hexOptions(this.you, hex).length > 0));
            marks.strong = true;
        } else if (w.kind === 'action') {
            marks.targets = new Set(LAND.filter(hex => this.sim.hexOptions(this.you, hex).some(o => o.command.type !== 'transform' && this.affordable(o.cost).ok)));
        }
        if (s.phase === 'end') return { recent };
        return marks;
    }

    renderStatus() {
        const s = this.view.state;
        const w = this.view.waiting;
        const buttons = [];
        this.statusActs = [];
        const btn = (label, fn, cls = 'secondary') => {
            this.statusActs.push(fn);
            buttons.push(`<button class="btn small ${cls}" data-a="${this.statusActs.length - 1}">${label}</button>`);
        };
        let text = '';
        const mine = this.myWaiting();
        if (s.phase === 'end') {
            text = `ゲーム終了。${s.winners.map(i => this.pname(i)).join('と')}の勝ち`;
            btn('結果', () => this.showResult(), 'primary');
        } else if (this.mode?.type === 'bridge') {
            text = this.mode.first === null || this.mode.first === undefined ? '橋を架ける<b>岸の土地</b>を選んでください' : '橋の<b>向こう岸</b>を選んでください';
            btn('やめる', () => { this.mode = null; this.render(); });
        } else if (this.mode?.type === 'hex') {
            text = `<b>${SPECIALS[this.mode.id].name}</b>：土地を選んでください`;
            btn('やめる', () => { this.mode = null; this.render(); });
        } else if (mine) {
            const p = this.me();
            switch (mine.kind) {
            case 'place': text = `最初の住居を置く<b>${TERRAIN_INFO[FACTIONS[p.faction].terrain].name}</b>を選んでください`; break;
            case 'bonus': text = '<b>ボーナスカード</b>を選んでください'; btn('選ぶ', () => this.openPrompt(), 'primary'); break;
            case 'action': text = p.extra > 0 ? '<b>2回行動</b>：続けて行動できます' : '<b>あなたの番</b>：土地をタップするか、下から行動を選びます'; break;
            case 'spades':
                text = mine.spades > 0
                    ? `${ICONS.spade}${mine.source === 'cult' ? '宗教のボーナス：' : ''}鋤があと<b>${mine.spades}</b>つ。土地を選びます`
                    : '変えた土地に<b>住居</b>を建てられます';
                btn(mine.spades > 0 ? '使わない' : '建てない', () => this.send({ type: 'done' }));
                break;
            default: text = this.promptText(mine); btn('選ぶ', () => this.openPrompt(), 'primary'); break;
            }
        } else if (w) {
            const kind = { action: '考えています', leech: '魔力を受け取るか考えています', place: '住居を置いています', bonus: 'ボーナスカードを選んでいます', favor: '恩恵タイルを選んでいます', town: '町タイルを選んでいます', spades: '鋤を使っています' }[w.kind] ?? '考えています';
            text = `${this.pname(w.seat)}が${kind}<span class="thinking"><i></i><i></i><i></i></span>`;
        }
        $('#status').classList.toggle('mine', !!mine);
        $('#status-text').innerHTML = text;
        $('#status-buttons').innerHTML = buttons.join('');
    }

    renderMe() {
        const p = this.me();
        const f = FACTIONS[p.faction];
        const reach = f.teleport
            ? `${f.teleport.type === 'tunnel' ? 'トンネル' : 'じゅうたん'} ${this.sim.teleportRange(this.you)}`
            : `航海 ${p.ship}${p.bonus === 'BON4' ? '+1' : ''}`;
        const spade = p.faction === 'darklings' ? '鋤＝司祭1' : `鋤＝職人${[3, 2, 1][p.dig]}`;
        $('#me').innerHTML = `<div class="me-row">${swatch(p.faction)}<span class="res">${ICONS.C}<b>${p.res.C}</b></span><span class="res">${ICONS.W}<b>${p.res.W}</b></span><span class="res">${ICONS.P}<b>${p.res.P}</b></span>`
            + `<span class="bowls">${ICONS.PW}<span>${p.power[0]}</span><span>${p.power[1]}</span><span class="b3">${p.power[2]}</span></span>`
            + `<span class="res vp">${ICONS.VP}<b>${p.res.VP}</b></span></div>`
            + `<div class="me-row sub"><span>${f.name}</span><span>${reach}</span><span>${spade}</span>${p.keys ? `<span>鍵 ${p.keys}</span>` : ''}<span>${p.bonus ? BONUS_CARDS[p.bonus].text.split('。')[0] : ''}</span></div>`;
    }

    // ---- 地図のタップ ----

    onHexTap(hex) {
        if (!this.view || this.view.state.phase === 'end') return this.openHexInfo(hex, []);
        const w = this.myWaiting();
        if (this.mode?.type === 'bridge') return this.tapBridge(hex);
        if (this.mode?.type === 'hex') {
            const command = { type: 'special', id: this.mode.id, hex };
            if (!this.sim.checkSpecial(this.you, command).ok) return this.toast(this.sim.checkSpecial(this.you, command).reason);
            return this.send(command);
        }
        const options = w ? this.sim.hexOptions(this.you, hex) : [];
        if (w?.kind === 'place' && options.length === 1) return this.send(options[0].command);
        this.openHexInfo(hex, options);
    }

    openHexInfo(hex, options) {
        const s = this.view.state;
        const h = s.hexes[hex];
        const info = HEXES[hex];
        const title = info.land ? `${info.label}・${TERRAIN_INFO[h.terrain].name}` : '川';
        let body = '';
        if (h.building) body += `<p>${buildingSvg(h.building, factionColor(s.players[h.owner].faction), { size: 18 })} ${this.pname(h.owner)}の${BUILDING_INFO[h.building].name}${h.town ? '（町）' : ''}</p>`;
        options.forEach(opt => {
            const pay = opt.ok === false ? this.affordable(opt.cost) : { ok: true, plan: [] };
            const sub = pay.plan?.length ? `交換して払う：${planText(pay.plan)}` : '';
            body += `<button class="opt" ${pay.ok ? this.act(() => this.sendPaid(opt.command, opt.cost)) : 'disabled'}><span class="opt-main"><span class="opt-title">${opt.label}</span>${sub ? `<span class="opt-sub">${sub}</span>` : ''}</span><span class="opt-side">${costHtml(opt.cost)}</span></button>`;
        });
        if (!options.length && this.myAction() && info.land && !h.building) {
            const reach = this.sim.reach(this.you, hex);
            body += `<p class="note">${reach.ok ? 'ここではできることがありません' : '自分の建物から届きません（隣か、航海で届く土地に建てられます）'}</p>`;
        }
        if (!body) body = `<p class="note">${info.land ? '建物はありません' : '川には建てられません。航海で渡れます'}</p>`;
        this.openSheet(title, body, [{ label: '閉じる', fn: () => this.closeSheet() }]);
    }

    validBridges() {
        const source = this.mode?.source;
        return BRIDGE_PAIRS.filter(pair => this.sim.checkBridge(this.you, pair).ok
            && (source !== 'ACTE' || this.sim.canPay(this.you, { W: 2 })));
    }

    tapBridge(hex) {
        const pairs = this.validBridges();
        const withHex = pairs.filter(([a, b]) => a === hex || b === hex);
        const first = this.mode.first;
        const finish = (pair) => {
            const { source, plan } = this.mode;
            const command = source === 'ACTE' ? { type: 'special', id: 'ACTE', bridge: pair } : { type: 'power', id: 'ACT1', bridge: pair };
            this.send(...(plan ?? []), command);
        };
        if (first !== null && first !== undefined) {
            const pair = pairs.find(([a, b]) => (a === first && b === hex) || (b === first && a === hex));
            if (pair) return finish(pair);
        }
        if (withHex.length === 1) return finish(withHex[0]);
        if (withHex.length > 1) {
            this.mode.first = hex;
            return this.render();
        }
        this.toast('光っている土地を選んでください');
    }

    // ---- シート ----

    // シートのボタンの処理を登録する。本文は openSheet を呼ぶ前に作るので、次に開くシートの分としてためておく
    act(fn) {
        this.pendingActs.push(fn);
        return `data-a="${this.pendingActs.length - 1}"`;
    }

    // buttons: [{ label, fn, cls }]、refresh：状態が変わったときに描き直す関数（false を返すと閉じる）
    openSheet(title, body, buttons = [], refresh = null) {
        $('#sheet-title').innerHTML = title;
        $('#sheet-body').innerHTML = typeof body === 'function' ? body() : body;
        $('#sheet-buttons').innerHTML = buttons.map(b => `<button class="btn ${b.cls ?? 'secondary'}" ${this.act(b.fn)}>${b.label}</button>`).join('');
        this.sheetActs = this.pendingActs;
        this.pendingActs = [];
        if (!$('#sheet').open) $('#sheet').showModal();
        this.sheetRefresh = refresh;
    }

    // 状態が変わるたびに描き直すシート（draw が false を返したら閉じる）
    openLive(title, draw, buttons) {
        const body = draw();
        if (body === false) {
            this.pendingActs = [];
            return;
        }
        const refresh = () => {
            const next = draw();
            if (next === false) {
                this.pendingActs = [];
                return false;
            }
            this.openSheet(title, next, buttons, refresh);
            return true;
        };
        this.openSheet(title, body, buttons, refresh);
    }

    closeSheet() {
        this.sheetRefresh = null;
        if ($('#sheet').open) $('#sheet').close();
    }

    // 魔力アクションと特別な行動
    openPower() {
        const draw = () => {
            if (!this.myAction()) return false;
            const s = this.view.state;
            const p = this.me();
            let body = `<p class="note">3つ目の器の魔力：<b>${p.power[2]}</b>（2つ目の器を燃やせば、あと${Math.floor(p.power[1] / 2)}）</p><div class="opt-grid">`;
            Object.entries(POWER_ACTIONS).forEach(([id, a]) => {
                const used = s.powerUsed[id];
                const pay = this.affordable({ PW: a.cost });
                let ok = used === undefined && pay.ok;
                if (ok && id !== 'ACT1') ok = this.sim.checkPower(this.you, id).ok || this.sim.checkPower(this.you, id).reason?.startsWith('3つ目');
                if (ok && id === 'ACT1') ok = this.validBridgesFor('ACT1').length > 0;
                const sub = used !== undefined ? `使用：${this.pname(used)}` : pay.plan?.length ? planText(pay.plan) : '';
                body += `<button class="opt" ${ok ? this.act(() => this.usePower(id, pay.plan)) : 'disabled'}><span class="opt-main"><span class="opt-title">${a.name}</span><span class="opt-sub">${sub || '&nbsp;'}</span></span><span class="opt-side">${ICONS.PW}<b>${a.cost}</b></span></button>`;
            });
            body += '</div>';
            const specials = this.sim.availableSpecials(this.you);
            body += '<h3>特別な行動</h3>';
            if (!specials.length) body += '<p class="note">使える特別な行動はありません（ボーナスカード・恩恵タイル・要塞で増えます）</p>';
            specials.forEach(id => {
                const ok = id === 'ACTE' ? this.validBridgesFor('ACTE').length > 0 : this.specialUsable(id);
                body += `<button class="opt" ${ok ? this.act(() => this.useSpecial(id)) : 'disabled'}><span class="opt-main"><span class="opt-title">${SPECIALS[id].name}</span></span>${id === 'ACTE' ? `<span class="opt-side">${costHtml({ W: 2 })}</span>` : ''}</button>`;
            });
            return body;
        };
        this.openLive('魔力アクション', draw, [{ label: '閉じる', fn: () => this.closeSheet() }]);
    }

    validBridgesFor(source) {
        const save = this.mode;
        this.mode = { type: 'bridge', source };
        const list = this.validBridges();
        this.mode = save;
        return list;
    }

    specialUsable(id) {
        if (['BON2', 'FAV6', 'ACTA'].includes(id)) return CULTS.some(track => this.sim.checkSpecial(this.you, { id, track }).ok);
        if (['ACTN', 'ACTW', 'ACTS'].includes(id)) return LAND.some(hex => this.sim.checkSpecial(this.you, { id, hex }).ok);
        return this.sim.checkSpecial(this.you, { id }).ok;
    }

    usePower(id, plan) {
        this.closeSheet();
        if (id === 'ACT1') {
            this.mode = { type: 'bridge', source: 'ACT1', first: null, plan };
            return this.render();
        }
        this.send(...plan, { type: 'power', id });
    }

    useSpecial(id) {
        this.closeSheet();
        if (['BON2', 'FAV6', 'ACTA'].includes(id)) return this.openCult({ choose: id });
        if (['ACTN', 'ACTW', 'ACTS'].includes(id)) {
            this.mode = { type: 'hex', id };
            return this.render();
        }
        if (id === 'ACTE') {
            this.mode = { type: 'bridge', source: 'ACTE', first: null, plan: [] };
            return this.render();
        }
        this.send({ type: 'special', id });
    }

    // 宗教の段。choose：特別な行動・教団の選択で、進める段を選ぶとき
    openCult({ choose = null } = {}) {
        const draw = () => {
            const s = this.view.state;
            const p = this.me();
            const action = this.myAction();
            let body = '<div class="cult-board">';
            CULTS.forEach(track => {
                const info = CULT_INFO[track];
                body += `<div class="cult-col"><div class="cult-head" style="background:${info.color}">${info.name}</div>`;
                for (let n = 10; n >= 0; n--) {
                    const dots = s.players.filter(o => o.cult[track] === n).map(o => `<span class="dot ${o.id === this.you ? 'me' : ''}" style="background:${factionColor(o.faction)}" title="${FACTIONS[o.faction].name}"></span>`).join('');
                    body += `<div class="cult-cell ${[3, 5, 7, 10].includes(n) ? 'mark' : ''}"><span class="n">${n}</span>${dots}</div>`;
                }
                body += `<div class="cult-spots">${s.cultSpots[track].map((o, i) => `<span style="${o !== null ? `background:${factionColor(s.players[o].faction)}` : ''}">${o === null ? (i === 0 ? 3 : 2) : ''}</span>`).join('')}</div>`;
                if (choose) {
                    const ok = choose === 'cultist' ? true : this.sim.checkSpecial(this.you, { id: choose, track }).ok;
                    body += `<button class="btn small primary" ${ok ? this.act(() => {
                        this.closeSheet();
                        this.send(choose === 'cultist' ? { type: 'cultist', track } : { type: 'special', id: choose, track });
                    }) : 'disabled'}>進める</button>`;
                } else if (action && p.res.P > 0) {
                    [3, 2, 1].forEach(steps => {
                        const ok = this.sim.checkPriest(this.you, track, steps).ok;
                        body += `<button class="btn small secondary" ${ok ? this.act(() => { this.closeSheet(); this.send({ type: 'priest', track, steps }); }) : 'disabled'}>司祭で${steps}</button>`;
                    });
                }
                body += '</div>';
            });
            body += '</div>';
            if (!choose) body += `<p class="note">3・5・7・10 で魔力。置き場に置くと3つか2つ進み、司祭は戻らない（1つなら戻る）。最後に順位で 8・4・2 点。${action && p.res.P === 0 ? '司祭がいないので送れません。' : ''}</p>`;
            return body;
        };
        const title = choose ? (choose === 'cultist' ? '進める段を選ぶ（教団）' : `${SPECIALS[choose].name}`) : '宗教の段';
        if (choose) this.openSheet(title, draw(), [{ label: '閉じる', fn: () => this.closeSheet() }]);
        else this.openLive(title, draw, [{ label: '閉じる', fn: () => this.closeSheet() }]);
    }

    openUpgrade() {
        const p = this.me();
        const f = FACTIONS[p.faction];
        let body = '';
        if (f.ship.max > 0) {
            const check = this.sim.checkShip(this.you);
            const pay = this.affordable(SHIP_COST);
            const can = p.ship < f.ship.max && pay.ok;
            body += `<button class="opt" ${can ? this.act(() => this.sendPaid({ type: 'ship' }, SHIP_COST)) : 'disabled'}><span class="opt-main"><span class="opt-title">航海 ${p.ship} → ${Math.min(p.ship + 1, f.ship.max)}</span><span class="opt-sub">${p.ship >= f.ship.max ? 'これ以上は伸ばせません' : `川を${p.ship + 1}マスまで渡って建てられる。${check.vp ?? f.ship.vp[p.ship]}点`}${pay.plan?.length ? `／${planText(pay.plan)}` : ''}</span></span><span class="opt-side">${costHtml(SHIP_COST)}</span></button>`;
        } else {
            body += `<p class="note">${f.name}は航海を伸ばせません（${f.teleport.type === 'tunnel' ? 'トンネル' : 'じゅうたん'}で離れた土地に建てます）</p>`;
        }
        if (f.dig.cost) {
            const pay = this.affordable(f.dig.cost);
            const can = p.dig < f.dig.max && pay.ok;
            body += `<button class="opt" ${can ? this.act(() => this.sendPaid({ type: 'dig' }, f.dig.cost)) : 'disabled'}><span class="opt-main"><span class="opt-title">鋤の改良（鋤1つ 職人${[3, 2, 1][p.dig]} → ${[3, 2, 1][Math.min(p.dig + 1, 2)]}）</span><span class="opt-sub">${p.dig >= f.dig.max ? 'これ以上は改良できません' : `${DIG_VP}点`}${pay.plan?.length ? `／${planText(pay.plan)}` : ''}</span></span><span class="opt-side">${costHtml(f.dig.cost)}</span></button>`;
        } else {
            body += `<p class="note">${f.name}は鋤を司祭で払うので、鋤の改良はありません</p>`;
        }
        body += '<p class="note">建物の改良は、地図で自分の建物をタップします</p>';
        this.openSheet('改良', body, [{ label: '閉じる', fn: () => this.closeSheet() }]);
    }

    openConvert() {
        const draw = () => {
            if (!this.myWaiting()) return false;
            const p = this.me();
            let body = `<p class="note">${ICONS.C}${p.res.C}　${ICONS.W}${p.res.W}　${ICONS.P}${p.res.P}　${ICONS.PW}${p.power.join('/')}　${ICONS.VP}${p.res.VP}</p>`;
            Object.entries(CONVERSIONS).forEach(([kind, c]) => {
                if (c.only && c.only !== p.faction) return;
                const ok = this.sim.checkConvert(this.you, kind, 1).ok;
                body += `<button class="opt" ${ok ? this.act(() => this.send({ type: 'convert', kind, n: 1 })) : 'disabled'}><span class="opt-main"><span class="opt-title">${c.text}</span></span></button>`;
            });
            body += '<p class="note">交換は手番を使いません。建てるときに足りない分は、自動で交換することもできます</p>';
            return body;
        };
        this.openLive('交換', draw, [{ label: '閉じる', fn: () => this.closeSheet() }]);
    }

    openInfo() {
        if (!this.view) return;
        const s = this.view.state;
        let body = '<h3>ラウンドの得点タイル</h3>';
        s.scoreTiles.forEach((id, i) => {
            const t = SCORE_TILES[id];
            const r = i + 1;
            body += `<div class="tile-row ${r === s.round ? 'now' : r < s.round ? 'done' : ''}"><span class="r">R${r}</span><span>${t.text}${r < ROUNDS ? `<br><small>終わりに ${t.bonusText}</small>` : ''}</span></div>`;
        });
        body += '<h3>残っているボーナスカード</h3>';
        Object.entries(s.bonusPool).forEach(([id, coins]) => { body += `<div class="tile-row"><span class="r">${coins ? `${ICONS.C}${coins}` : ''}</span><span>${BONUS_CARDS[id].text}</span></div>`; });
        body += '<h3>恩恵タイル（残り）</h3>';
        Object.entries(FAVOR_TILES).forEach(([id, f]) => { body += `<div class="tile-row ${s.favorPool[id] ? '' : 'done'}"><span class="r">${s.favorPool[id]}</span><span>${f.text}</span></div>`; });
        body += '<h3>町タイル（残り）</h3>';
        Object.entries(TOWN_TILES).forEach(([id, t]) => { body += `<div class="tile-row ${s.townPool[id] ? '' : 'done'}"><span class="r">${s.townPool[id]}</span><span>${t.text}</span></div>`; });
        this.openSheet('情報', body, [{ label: '閉じる', fn: () => this.closeSheet() }]);
    }

    openPlayer(seat) {
        const s = this.view.state;
        const p = s.players[seat];
        const f = FACTIONS[p.faction];
        const sim = this.sim;
        const income = sim.income(seat);
        const left = (b) => `${BUILDING_INFO[b].max - p.buildings[b]}/${BUILDING_INFO[b].max}`;
        let body = `<div class="ability">${f.ability}<br>${f.sh}</div><div class="detail-grid">`
            + `<div><span>${ICONS.C}コイン</span><b>${p.res.C}</b></div><div><span>${ICONS.W}職人</span><b>${p.res.W}</b></div>`
            + `<div><span>${ICONS.P}司祭</span><b>${p.res.P}</b></div><div><span>${ICONS.PW}魔力</span><b>${p.power.join(' / ')}</b></div>`
            + `<div><span>${ICONS.VP}勝利点</span><b>${p.res.VP}</b></div><div><span>鍵</span><b>${p.keys}</b></div>`
            + `<div><span>${f.teleport ? (f.teleport.type === 'tunnel' ? 'トンネル' : 'じゅうたん') : '航海'}</span><b>${f.teleport ? sim.teleportRange(seat) : p.ship}</b></div>`
            + `<div><span>鋤1つ</span><b>${p.faction === 'darklings' ? '司祭1' : `職人${[3, 2, 1][p.dig]}`}</b></div>`
            + ['D', 'TP', 'TE', 'SH', 'SA'].map(b => `<div><span>${buildingSvg(b, factionColor(p.faction), { size: 15 })} ${BUILDING_INFO[b].name}の残り</span><b>${left(b)}</b></div>`).join('')
            + `<div><span>橋</span><b>${p.bridges}/3</b></div><div><span>つながり</span><b>${sim.networkSize(seat)}</b></div>`
            + `</div><p class="note">次の収入：${costHtml(Object.fromEntries(Object.entries(income).map(([k, v]) => [k, v])))}（ボーナスカード込み）</p>`
            + `<p class="note">宗教の段：${CULTS.map(t => `${CULT_INFO[t].name}${p.cult[t]}`).join('・')}</p>`;
        if (p.bonus) body += `<p class="note">ボーナスカード：${BONUS_CARDS[p.bonus].text}</p>`;
        if (p.favors.length) body += `<p class="note">恩恵タイル：${p.favors.map(id => FAVOR_TILES[id].text).join('／')}</p>`;
        if (p.towns.length) body += `<p class="note">町タイル：${p.towns.map(id => TOWN_TILES[id].text).join('／')}</p>`;
        this.openSheet(`<span class="faction-title">${swatch(p.faction)}${seat === this.you ? 'あなた・' : ''}${f.name}（${TERRAIN_INFO[f.terrain].name}）</span>`, body, [{ label: '閉じる', fn: () => this.closeSheet() }]);
    }

    openPass() {
        if (!this.myAction()) return;
        const s = this.view.state;
        if (s.round >= ROUNDS) {
            this.openSheet('パス', '<p>このラウンドの行動を終えます。最後のラウンドなので、ボーナスカードは取りません。</p>', [
                { label: 'パスする', cls: 'primary', fn: () => { this.closeSheet(); this.send({ type: 'pass' }); } },
                { label: 'やめる', fn: () => this.closeSheet() }
            ]);
            return;
        }
        this.openSheet('パス：次のラウンドのボーナスカード', this.bonusList((id) => { this.closeSheet(); this.send({ type: 'pass', bonus: id }); }), [{ label: 'やめる', fn: () => this.closeSheet() }]);
    }

    bonusList(onPick) {
        const s = this.view.state;
        return Object.entries(s.bonusPool).map(([id, coins]) => `<button class="opt" ${this.act(() => onPick(id))}><span class="opt-main"><span class="opt-title">${BONUS_CARDS[id].text}</span></span>${coins ? `<span class="tag">${ICONS.C}+${coins}</span>` : ''}</button>`).join('');
    }

    promptText(w) {
        switch (w.kind) {
        case 'favor': return '<b>恩恵タイル</b>を選んでください';
        case 'town': return '<b>町</b>ができました。町タイルを選んでください';
        case 'leech': {
            const { amount, vp } = this.sim.leechAmount(w);
            return `${this.pname(w.from)}の建設で、魔力<b>${amount}</b>を受け取れます（${vp}点を払う）`;
        }
        case 'cultist': return 'ほかの人が魔力を受け取りました。進める<b>宗教の段</b>を選んでください';
        case 'darklings': return '要塞：職人を<b>司祭</b>に替えられます（3人まで）';
        default: return '';
        }
    }

    // 選択への答え（恩恵タイル・町タイル・魔力のもらい など）
    openPrompt() {
        const w = this.myWaiting();
        if (!w) return;
        const p = this.me();
        switch (w.kind) {
        case 'bonus':
            this.openSheet('ボーナスカードを選ぶ', this.bonusList((id) => { this.closeSheet(); this.send({ type: 'bonus', id }); }), [{ label: '盤面を見る', fn: () => this.closeSheet() }]);
            break;
        case 'favor': {
            const s = this.view.state;
            const body = '<div class="opt-grid">' + Object.entries(FAVOR_TILES).map(([id, f]) => {
                const owned = p.favors.includes(id);
                const ok = !owned && s.favorPool[id] > 0;
                return `<button class="opt ${owned ? 'owned' : ''}" ${ok ? this.act(() => { this.closeSheet(); this.send({ type: 'favor', id }); }) : 'disabled'}><span class="opt-main"><span class="opt-title">${f.text}</span><span class="opt-sub">${owned ? '持っている' : `残り${s.favorPool[id]}`}</span></span></button>`;
            }).join('') + '</div>';
            this.openSheet('恩恵タイルを選ぶ', body, [{ label: '盤面を見る', fn: () => this.closeSheet() }]);
            break;
        }
        case 'town': {
            const s = this.view.state;
            const body = Object.entries(TOWN_TILES).map(([id, t]) => `<button class="opt" ${s.townPool[id] > 0 ? this.act(() => { this.closeSheet(); this.send({ type: 'town', id }); }) : 'disabled'}><span class="opt-main"><span class="opt-title">${t.text}</span><span class="opt-sub">残り${s.townPool[id]}</span></span></button>`).join('');
            this.openSheet('町タイルを選ぶ', body, [{ label: '盤面を見る', fn: () => this.closeSheet() }]);
            break;
        }
        case 'leech': {
            const { amount, vp } = this.sim.leechAmount(w);
            this.openSheet('魔力を受け取る？', `<p>${this.pname(w.from)}が隣に建てました。魔力<b>${amount}</b>を受け取れます。代わりに<b>${vp}</b>点を払います。</p><p class="note">今の魔力：${p.power.join(' / ')}　勝利点：${p.res.VP}</p>`, [
                { label: '受け取る', cls: 'primary', fn: () => { this.closeSheet(); this.send({ type: 'leech', accept: true }); } },
                { label: '受け取らない', fn: () => { this.closeSheet(); this.send({ type: 'leech', accept: false }); } }
            ]);
            break;
        }
        case 'cultist':
            this.openCult({ choose: 'cultist' });
            break;
        case 'darklings': {
            const max = Math.min(3, p.res.W, this.sim.maxPriests(this.you) - p.res.P);
            const buttons = [];
            for (let n = max; n >= 0; n--) buttons.push({ label: n ? `${n}人替える` : '替えない', cls: n === max ? 'primary' : 'secondary', fn: () => { this.closeSheet(); this.send({ type: 'darklings', n }); } });
            this.openSheet('職人を司祭に替える', `<p>要塞を建てたので、職人を3人まで司祭に替えられます（職人 ${p.res.W}・司祭 ${p.res.P}）。</p>`, buttons);
            break;
        }
        default: break;
        }
    }

    // ---- 記録と結果 ----

    openLog() {
        if (!this.view) return;
        const logs = this.view.logs.slice(-300);
        $('#log-list').innerHTML = logs.map(t => `<li class="${t.startsWith('――') ? 'round' : ''}">${escapeHtml(t)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）。1台で複数の人が遊ぶ対戦は送らない
    recordLocalResult(s) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !controller.game) return;
        const { players, options } = controller.game;
        if (players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({ game: GAME, id: `${GAME}-${options.seed}`, outcome: outcomeFromWinners(s.winners, this.you, s.players.length) });
    }

    showResult() {
        const s = this.view.state;
        if (!s.final) return;
        const rows = [...s.final].sort((a, b) => b.total - a.total);
        $('#result-title').textContent = s.winners.includes(this.you) ? 'あなたの勝ち！' : `${this.pname(s.winners[0])}の勝ち`;
        $('#result-body').innerHTML = `<ol class="result-list">${rows.map((r, i) => {
            const p = s.players[r.seat];
            const cult = r.cultVp.reduce((a, b) => a + b, 0);
            const rank = rows.findIndex(x => x.total === r.total) + 1;
            return `<li class="${r.seat === this.you ? 'mine' : ''} ${s.winners.includes(r.seat) ? 'winner' : ''}"><span class="r-rank">${rank}位</span><span class="r-name">${swatch(p.faction)} ${this.pname(r.seat)}</span><span class="r-score">${r.total}</span>`
                + `<span class="r-calc">途中 ${r.before}・つながり${r.network}で ${r.networkVp}・宗教 ${cult}・資源 ${r.resourceVp}</span></li>`;
        }).join('')}</ol>`;
        $('#result').showModal();
    }
}
