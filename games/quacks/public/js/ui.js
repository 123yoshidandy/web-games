/**
 * 画面（タイトル・ゲーム・シート・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 届いたイベントのうち新しいもの（引く・爆発）を、描いたあとに動きで見せる
 * シート（占い・選択・回の結果・買い物・最後の結果）は1つの dialog を使い回し、ビューから今出すものを決める
 */

import { MIN_PLAYERS, MAX_PLAYERS, chipName } from './game.js';
import { LEVELS } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import {
    INGREDIENTS, MARKET, RUBY_COST, DIE_LABELS, space, chipColor, chipCost, available
} from './data.js';
import { chipSvg, potSvg, icon, titleArt, rubyMark, dropMark, starMark, flaskMark } from './art.js';
import { fly, land, explode, bump, rectOf, reducedMotion } from './animator.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';

const GAME = 'quacks';

// 自分の操作の音：袋から引く・止める・選ぶ・取る・買う
const COMMAND_SOUND = { draw: 'draw', stop: 'select', choose: 'select', pick: 'gain', shop: 'pay' };

const SETTINGS_KEY = 'quacks.settings';
const CPU_NAMES = ['グレタ', 'ハンス', 'ヒルデ'];
const AUTO_STOP_MS = 700;   // 袋が空になったら、自動で止めるまでの間
const SHEET_DELAY_MS = 650; // 爆発や最後の1つを見せてから、シートを出すまでの間

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const percent = (x) => `${Math.round(x * 100)}%`;
// ヒントのボタン（鍋の操作の欄と、選ぶシートに出す）
const hintButton = (attr) => `<button type="button" id="hint" class="btn hint-button" ${attr} aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg></button>`;

function loadSettings() {
    const fallback = { count: 4, level: 'normal' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(saved.count) && saved.count >= MIN_PLAYERS && saved.count <= MAX_PLAYERS ? saved.count : fallback.count,
            level: Object.hasOwn(LEVELS, saved.level) ? saved.level : fallback.level
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
        this.lastSeq = 0;
        this.viewSeat = null;       // 大きく見ている鍋（null は自分）
        this.sheetKey = null;
        this.manualSheet = null;    // 自分で開いたシート（占い・袋）
        this.fortuneSeen = 0;       // 占いを見せた回
        this.summarySeen = 0;       // 回の結果を見せた回
        this.shopSel = null;
        this.potLengths = {};       // 前に描いた鍋の札の数（新しく入った札を弾ませる）
        this.holdSheetUntil = 0;    // 爆発などを見せている間は、シートを出さない
        this.timers = {};
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'インチキ薬師',
            game: 'quacks',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 330,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onUpdate(),
            onError: (message) => this.onControllerError(message),
            onExit: () => {
                this.stopGame();
                this.showTitle();
            }
        });
        this.bindStatic();
        $('#title-art').innerHTML = titleArt();
        $('#home').innerHTML = icon('home');
        $('#open-help-game').innerHTML = icon('help');
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
                onUpdate: () => this.onUpdate(),
                onError: (message) => this.onControllerError(message)
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.beginGame(controller, { resumed: Boolean(setup.commands) });
        controller.scheduleCpu();
    }

    onControllerError(message) {
        music.play('error');
        this.toast(message);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    // resumed：続きから（今の回の占いと結果は見たことにする）
    beginGame(controller, { resumed = false } = {}) {
        if (this.controller !== controller) this.controller?.stop();
        Object.values(this.timers).forEach(clearTimeout);
        this.timers = {};
        this.sheetKey = null;
        this.manualSheet = null;
        if ($('#sheet').open) $('#sheet').close();
        this.controller = controller;
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.viewSeat = null;
        this.fortuneSeen = 0;
        // 続きからなら、今の回の占いと結果は見たことにする（ただし選択が残っていれば出る）
        const brewing = this.view.players[this.view.you].pot.length > 0 || this.view.phase !== 'fortune';
        if (resumed && brewing) this.fortuneSeen = this.view.round;
        this.summarySeen = 0;
        this.potLengths = {};
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {}, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        Object.values(this.timers).forEach(clearTimeout);
        this.timers = {};
        this.sheetKey = null;
        this.manualSheet = null;
        if ($('#sheet').open) $('#sheet').close();
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#count-down').addEventListener('click', () => this.changeSetting({ count: this.settings.count - 1 }));
        $('#count-up').addEventListener('click', () => this.changeSetting({ count: this.settings.count + 1 }));
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (button) this.changeSetting({ level: button.dataset.level });
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-fortune').addEventListener('click', () => this.openManual('fortune-info'));
        $('#help .close').addEventListener('click', () => $('#help').close());
        $('#help').addEventListener('click', event => { if (event.target === $('#help')) $('#help').close(); });

        const sheet = $('#sheet');
        // 必ず答えるシートは、外側のタップや Esc では閉じない
        sheet.addEventListener('cancel', event => {
            event.preventDefault();
            if (this.manualSheet && this.sheetKey === this.manualSheet) this.closeManual();
        });
        sheet.addEventListener('click', event => {
            if (event.target === sheet && this.manualSheet && this.sheetKey === this.manualSheet) this.closeManual();
            const button = event.target.closest('button[data-sheet]');
            if (button && !button.disabled) this.onSheetButton(button);
        });

        $('#players').addEventListener('click', (event) => {
            const card = event.target.closest('[data-player]');
            if (!card) return;
            const seat = Number(card.dataset.player);
            this.viewSeat = this.viewSeat === seat ? null : seat;
            this.render();
        });
        $('#pot-label').addEventListener('click', () => {
            this.viewSeat = null;
            this.render();
        });
        $('#me-bar').addEventListener('click', (event) => {
            if (event.target.closest('[data-open="bag"]')) this.openManual('bag');
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'hint') return this.showHint();
            this.send({ type: button.dataset.act });
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    send(command) {
        if (command.type === 'draw') this.viewSeat = null;
        this.sending = command;
        this.controller?.send(command);
        this.sending = null;
    }

    changeSetting(change) {
        const next = { ...this.settings, ...change };
        next.count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, next.count));
        this.settings = next;
        saveSettings(next);
        this.renderSetup();
    }

    renderSetup() {
        $('#count-value').textContent = `${this.settings.count}人`;
        $('#count-down').disabled = this.settings.count <= MIN_PLAYERS;
        $('#count-up').disabled = this.settings.count >= MAX_PLAYERS;
        $('#level').innerHTML = Object.entries(LEVELS).map(([key, label]) =>
            `<button data-level="${key}" role="radio" aria-checked="${key === this.settings.level}" class="${key === this.settings.level ? 'on' : ''}">${label}</button>`).join('');
    }

    renderHelp() {
        $('#help-ingredients').innerHTML = Object.entries(INGREDIENTS).map(([color, ing]) => {
            const values = color === 'W' ? [1, 2, 3] : Object.keys(ing.costs).map(Number);
            const costs = color === 'W' ? '売っていない' : values.map(v => `${v}：${ing.costs[v]}`).join('　');
            return `<div class="ing-row">${chipSvg(`${color}${values[0]}`)}<div><b>${ing.name}</b><small>${costs}</small><p>${ing.effect}</p></div></div>`;
        }).join('');
    }

    // ---- 更新 ----

    onUpdate() {
        if (!this.controller) return;
        const previous = this.view;
        this.view = this.controller.getView();
        const fresh = this.view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = this.view.events.at(-1)?.seq ?? this.lastSeq;
        this.render(fresh);
        this.playUpdateSound(previous, fresh);
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）。1台で人が交代する対戦（人が2人以上）は送らない
    recordLocalResult(v) {
        const controller = this.controller;
        if (!controller || controller.isOnline || controller.game.players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners(v.winners, v.you, v.players.length) });
    }

    // 1回の更新に1つの音。自分の操作はその音（引いて爆発したら払う音）。CPU が引くたびには鳴らさず、場面が変わったら知らせる
    playUpdateSound(previous, fresh) {
        const view = this.view;
        if (!previous) return;
        if (view.phase === 'end') {
            if (previous.phase !== 'end') {
                music.play(view.winners.includes(view.you) ? 'win' : 'lose');
                this.recordLocalResult(view);
            }
        } else if (this.sending) {
            const exploded = fresh.some(e => e.type === 'explode' && e.seat === view.you);
            music.play(exploded ? 'pay' : COMMAND_SOUND[this.sending.type] ?? 'select');
        } else if (view.round !== previous.round) {
            music.play('shuffle');
        } else if (view.phase !== previous.phase) {
            music.play('notify');
        }
    }

    render(events = []) {
        if (!this.view) return;
        const me = this.view.players[this.view.you];
        // 自分の札が飛んでいる間は、行き先を隠しておく
        const myDraws = events.filter(e => e.type === 'draw' && e.seat === this.view.you);
        this.renderTop();
        this.renderPlayers(events);
        this.renderMeBar();
        this.renderPot(myDraws);
        this.renderGauge();
        this.renderActions();
        this.animate(events, me);
        this.afterRender();
    }

    renderTop() {
        const view = this.view;
        $('#round-info').innerHTML = `<b>${view.round}</b><small>/${view.rounds}回</small>`;
        $('#open-fortune').innerHTML = view.fortune ? `${icon('card')}<span>${escapeHtml(view.fortune.name)}</span>` : '';
    }

    // ほかの人：小さな鍋と、点・ルビー・調合の様子
    renderPlayers(events) {
        const view = this.view;
        const others = view.players.filter(p => p.id !== view.you);
        $('#players').style.setProperty('--cols', others.length);
        $('#players').innerHTML = others.map(p => {
            const prev = this.potLengths[`m${p.id}`] ?? p.pot.length;
            const fresh = prev <= p.pot.length ? prev : p.pot.length;
            this.potLengths[`m${p.id}`] = p.pot.length;
            const b = p.brew;
            let status = '';
            if (view.phase === 'brew' && b) {
                status = b.exploded ? '<span class="st boom-st">爆発</span>'
                    : b.done ? '<span class="st">止めた</span>'
                        : `<span class="st brewing">白 ${b.whites}</span>`;
            } else if (b?.exploded && view.phase !== 'fortune') status = '<span class="st boom-st">爆発</span>';
            else if (p.waiting) status = '<span class="st">…</span>';
            return `<button class="player ${this.viewSeat === p.id ? 'viewing' : ''} ${b?.exploded && view.phase !== 'fortune' ? 'exploded' : ''}" data-player="${p.id}" aria-label="${escapeHtml(p.name)}の鍋を見る">
                <span class="mini-pot">${potSvg(p, { mini: true, newFrom: fresh })}</span>
                <span class="p-info">
                    <span class="p-name">${escapeHtml(p.name)}</span>
                    <span class="p-stats"><span>${starMark()}<b>${p.score}</b></span><span>${rubyMark()}<b>${p.rubies}</b></span></span>
                    ${status}
                </span>
            </button>`;
        }).join('');
        events.filter(e => e.type === 'explode' && e.seat !== view.you).forEach(e => {
            this.later(`boom${e.seat}`, () => explode($(`[data-player="${e.seat}"] .mini-pot`), { big: false }), 60);
        });
    }

    renderMeBar() {
        const view = this.view;
        const me = view.players[view.you];
        $('#me-bar').innerHTML = `
            <span class="mb-item mb-score" title="点">${starMark()}<b>${me.score}</b><small>点</small></span>
            <span class="mb-item" title="ルビー">${rubyMark()}<b>${me.rubies}</b></span>
            <span class="mb-item" title="しずく">${dropMark()}<b>${me.droplet}</b></span>
            <span class="mb-item" title="フラスコ">${flaskMark(me.flask)}</span>
            ${me.rats > 0 && view.phase !== 'shop' ? `<span class="mb-item rats" title="ネズミ">ネズミ<b>+${me.rats}</b></span>` : ''}
            <button class="mb-bag" data-open="bag" aria-label="袋の中身">${icon('bag')}<b>${me.bagCount}</b></button>`;
    }

    renderPot(myDraws) {
        const view = this.view;
        const seat = this.viewSeat ?? view.you;
        const p = view.players[seat];
        const key = `l${seat}`;
        const prev = this.potLengths[key] ?? p.pot.length;
        const fresh = seat === view.you ? Infinity : (prev <= p.pot.length ? prev : p.pot.length);
        this.potLengths[key] = p.pot.length;
        $('#pot').innerHTML = potSvg(p, { newFrom: fresh });
        $('#pot-area').classList.toggle('exploded', !!p.brew?.exploded && view.phase !== 'fortune');
        const label = $('#pot-label');
        label.hidden = seat === view.you;
        if (seat !== view.you) label.innerHTML = `${icon('back')}<span>${escapeHtml(p.name)}の鍋</span>`;
        // 自分の鍋へ飛ぶ札は、着くまで隠す
        if (seat === view.you && myDraws.length > 0 && !reducedMotion()) {
            const from = rectOf($('#draw-btn')) ?? rectOf($('#actions'));
            myDraws.forEach((e, i) => {
                const el = [...$('#pot').querySelectorAll(`.pot-chip[data-pos="${e.pos}"]`)].at(-1);
                if (!el) return;
                el.style.visibility = 'hidden';
                const to = rectOf(el.querySelector('circle'));
                const go = () => fly(chipSvg(e.chip), from, to, {
                    size: 40,
                    onLand: () => {
                        el.style.visibility = '';
                        land(el.querySelector('.pc-inner'));
                    }
                });
                if (i === 0) go();
                else this.later(`fly${e.seq}`, go, i * 160);
            });
        }
    }

    // 白の合計・爆発の確率・次のマス
    renderGauge() {
        const view = this.view;
        const seat = this.viewSeat ?? view.you;
        const p = view.players[seat];
        const b = p.brew;
        if (!b || view.phase === 'fortune') {
            $('#gauge').innerHTML = `<span class="g-note">${view.phase === 'fortune' ? '占いを見ています' : ''}</span>`;
            return;
        }
        const limit = view.whiteLimit;
        const beads = Array.from({ length: Math.max(limit, b.whites) }, (_, i) =>
            `<i class="${i < b.whites ? (i >= limit ? 'over' : 'on') : ''} ${i === limit - 1 ? 'last' : ''}"></i>`).join('');
        const scoring = Math.min(53, b.pos + 1);
        const s = space(scoring);
        const mine = seat === view.you;
        const risk = mine && !b.done ? view.me.risk : null;
        $('#gauge').innerHTML = `
            <span class="g-whites ${b.exploded ? 'busted' : ''}"><span class="g-label">白</span><span class="beads">${beads}</span><b>${b.whites}<small>/${limit}</small></b></span>
            ${risk !== null ? `<span class="g-risk ${risk >= 0.4 ? 'high' : risk >= 0.2 ? 'mid' : ''}">爆発 <b>${percent(risk)}</b></span>` : `<span class="g-risk">${b.exploded ? '<b class="boom-text-s">爆発</b>' : ''}</span>`}
            <span class="g-next" title="最後の材料の次のマス"><span class="coin">${s.coins}</span>${starMark()}<b>${s.points}</b>${s.ruby ? rubyMark() : ''}</span>`;
    }

    renderActions() {
        const view = this.view;
        const me = view.me;
        const p = view.players[view.you];
        let html = '';
        if (view.phase === 'brew' && p.brew && !p.brew.done) {
            const specials = [];
            if (me.canBubble) specials.push(`<button class="btn special" data-act="bubble">${icon('back')}白を戻す</button>`);
            else if (me.canFlask) specials.push(`<button class="btn special" data-act="flask">${flaskMark(true)}白を戻す</button>`);
            if (me.canMandrake) specials.push(`<button class="btn special" data-act="mandrake">${chipSvg('Y1', { cls: 'tiny' })}白を戻す</button>`);
            if (me.canRestart) specials.push(`<button class="btn special" data-act="restart">やり直す</button>`);
            html = `${specials.join('')}
                <button id="draw-btn" class="btn primary draw" data-act="draw" ${me.canDraw ? '' : 'disabled'}>${icon('bag')}<span>引く</span></button>
                <button class="btn stop" data-act="stop" ${me.canStop ? '' : 'disabled'}>止める</button>`;
        } else if (view.phase === 'brew') {
            html = `<span class="act-label">${p.brew?.exploded ? '鍋が爆発しました。' : ''}ほかの人が引いています</span>`;
        } else if (view.phase === 'shop' && !me.shopping) {
            html = '<span class="act-label">ほかの人が買い物をしています</span>';
        }
        // 自分が引く番だけ、ヒントのボタンを出す
        // ヒントはローカル対戦だけ
        if (view.phase === 'brew' && p.brew && !p.brew.done && !$('#sheet').open && !this.controller?.isOnline) html = hintButton('data-act="hint"') + html;
        $('#actions').innerHTML = html;
        this.markHint();
    }

    animate(events, me) {
        if (events.length > 40) return;
        const view = this.view;
        events.forEach(e => {
            if (e.type === 'explode' && e.seat === view.you) {
                this.holdSheetUntil = Date.now() + SHEET_DELAY_MS + 500;
                this.later('boom', () => {
                    if (this.viewSeat === null) explode($('#pot-area'), { big: true });
                }, reducedMotion() ? 0 : 400);
            }
            if (e.seat === view.you && ['score', 'ruby'].includes(e.type)) bump($('#me-bar'));
        });
        if (events.some(e => e.type === 'stop' && e.seat === me.id)) this.holdSheetUntil = Math.max(this.holdSheetUntil, Date.now() + 300);
    }

    // 描いたあと：袋が空なら自動で止める。シートを合わせる
    afterRender() {
        const view = this.view;
        clearTimeout(this.timers.auto);
        if (view.phase === 'brew' && view.me.canStop && !view.me.canDraw && !view.me.canFlask && !view.me.canMandrake && !view.me.canBubble) {
            this.later('auto', () => {
                if (this.view?.me.canStop && !this.view.me.canDraw) this.send({ type: 'stop' });
            }, AUTO_STOP_MS);
        }
        const wait = this.holdSheetUntil - Date.now();
        if (wait > 0) this.later('sheet', () => this.syncSheet(), wait);
        else this.syncSheet();
    }

    later(name, fn, ms) {
        clearTimeout(this.timers[name]);
        this.timers[name] = setTimeout(() => {
            delete this.timers[name];
            fn();
        }, ms);
    }

    // ---- シート ----

    // 今出すべきシート
    wantedSheet() {
        const view = this.view;
        const me = view.me;
        const round = view.round;
        if (view.phase === 'end') return this.summarySeen === round ? 'result' : `summary:${round}`;
        if (me.pending) return `pick:${me.pending.kind}:${me.pending.chips.join(',')}`;
        if (me.prompt) return `${view.phase === 'fortune' ? 'fortune' : 'prompt'}:${round}:${me.prompt.id}`;
        if (this.fortuneSeen !== round && (view.phase === 'fortune' || view.phase === 'brew')) return `fortune:${round}`;
        if (view.phase === 'shop' && me.shopping) return this.summarySeen === round ? `shop:${round}` : `summary:${round}`;
        return this.manualSheet;
    }

    syncSheet() {
        if (!this.view || !this.controller) return;
        const want = this.wantedSheet();
        if (want !== this.manualSheet) this.manualSheet = null;
        const sheet = $('#sheet');
        if (!want) {
            this.sheetKey = null;
            if (sheet.open) sheet.close();
            return;
        }
        if (want === this.sheetKey && sheet.open) {
            if (want === 'bag') this.renderSheet(want);
            return;
        }
        this.sheetKey = want;
        if (want.startsWith('shop')) this.shopSel = { buy: [], droplet: 0, refill: false };
        this.renderSheet(want);
        if (!sheet.open) sheet.showModal();
        sheet.scrollTop = 0;
    }

    openManual(name) {
        this.manualSheet = name;
        this.syncSheet();
    }

    closeManual() {
        this.manualSheet = null;
        this.sheetKey = null;
        $('#sheet').close();
        this.syncSheet();
    }

    renderSheet(key) {
        const [kind] = key.split(':');
        const body = $('#sheet-body');
        $('#sheet').className = `sheet ${kind}-sheet`;
        const html = {
            fortune: () => this.fortuneHtml(),
            'fortune-info': () => this.fortuneHtml({ info: true }),
            prompt: () => this.promptHtml(),
            pick: () => this.pickHtml(),
            summary: () => this.summaryHtml(),
            shop: () => this.shopHtml(),
            result: () => this.resultHtml(),
            bag: () => this.bagHtml()
        }[kind]?.() ?? '';
        // 自分が選ぶシートには、ヒントのボタンを足す
        const hintable = !this.controller?.isOnline && (['prompt', 'pick', 'shop'].includes(kind) || (kind === 'fortune' && this.view.me.prompt));
        body.innerHTML = hintable ? html.replace('<div class="options">', `<div class="options">${hintButton('data-sheet="hint"')}`) : html;
        this.markHint();
    }

    // ヒントが指す場面（手を打つと変わる）
    hintKey() {
        const v = this.view;
        const me = v.me;
        return JSON.stringify([v.logCount, v.phase, v.round, v.players[v.you].pot?.length ?? 0, !!me.prompt, !!me.pending, !!me.shopping]);
    }

    // おすすめの手を、選んだ状態にして光らせる（引く・止める、選択肢、買い物）
    showHint() {
        const command = this.controller?.suggest();
        if (!command || !this.view) return;
        this.hint = { at: this.hintKey(), command };
        music.play('select');
        if (command.type === 'shop') this.shopSel = { buy: [...command.buy], droplet: command.droplet, refill: command.refill };
        if ($('#sheet').open && this.sheetKey) this.renderSheet(this.sheetKey);
        this.renderActions();
    }

    markHint() {
        if (!this.view || this.hint?.at !== this.hintKey()) {
            this.hint = null;
            return;
        }
        const c = this.hint.command;
        const target = {
            choose: `#sheet [data-sheet="choose"][data-value="${c.option}"]`, pick: `#sheet [data-sheet="pick"][data-value="${c.index}"]`,
            shop: '#sheet [data-sheet="shop-ok"]'
        }[c.type] ?? `#actions [data-act="${c.type}"]`;
        $(target)?.classList.add('suggested');
    }

    onSheetButton(button) {
        const action = button.dataset.sheet;
        const value = button.dataset.value;
        if (action === 'hint') {
            this.showHint();
            return;
        }
        if (action === 'choose') {
            if (this.view.phase === 'fortune') this.fortuneSeen = this.view.round;
            this.send({ type: 'choose', option: value });
        }
        if (action === 'pick') this.send({ type: 'pick', index: Number(value) });
        if (action === 'fortune-ok') this.fortuneSeen = this.view.round;
        if (action === 'close') {
            this.closeManual();
            return;
        }
        if (action === 'summary-ok') this.summarySeen = this.view.round;
        if (action === 'shop-chip') this.toggleShopChip(value);
        if (action === 'shop-drop') this.shopSel.droplet = Math.max(0, this.shopSel.droplet + Number(value));
        if (action === 'shop-refill') this.shopSel.refill = !this.shopSel.refill;
        if (action === 'shop-ok') {
            this.send({ type: 'shop', ...this.shopSel });
            return;
        }
        if (action.startsWith('shop-')) {
            music.play('select');
            this.renderSheet(this.sheetKey);
            return;
        }
        if (action === 'again') {
            if (this.controller?.isOnline) this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
            else this.newGame();
            return;
        }
        if (action === 'home') {
            if (this.controller?.isOnline) this.online.leave();
            else this.showTitle();
            return;
        }
        this.sheetKey = null;
        this.syncSheet();
    }

    optionButton(option, cls = '') {
        const art = option.chip ? chipSvg(option.chip, { cls: 'opt-chip' }) : '';
        return `<button class="btn option ${cls}" data-sheet="choose" data-value="${escapeHtml(option.key)}">${art}<span>${escapeHtml(option.label)}</span></button>`;
    }

    fortuneHtml({ info = false } = {}) {
        const view = this.view;
        const card = view.fortune;
        const me = view.players[view.you];
        const prompt = view.phase === 'fortune' && !info ? view.me.prompt : null;
        const lead = card.kind === 'round' ? 'この回のルール' : 'すぐ起きること';
        const extra = [];
        if (!info && me.rats > 0) extra.push(`ネズミのしっぽ ${me.rats}本：しずくの ${me.rats} マス先から置き始めます`);
        if (!info && view.round === 6) extra.push('6回目：全員の袋に白1が1つ入りました');
        // 占いで自分に起きたこと（引いた材料・もらったもの）
        const start = view.events.findLastIndex(e => e.type === 'round');
        const mine = start < 0 ? [] : view.events.slice(start).filter(e => e.seat === view.you);
        const drawn = prompt?.drawn ?? mine.find(e => e.type === 'reveal')?.chips;
        const gains = card.kind === 'now' && !info ? mine.map(e => ({
            gain: () => chipName(e.chip), ruby: () => `ルビー${e.n}`, score: () => `${e.n}点`, droplet: () => `しずく${e.n}マス`
        }[e.type]?.())).filter(Boolean) : [];
        if (gains.length) extra.unshift(`あなた：${gains.join('・')}`);
        const prev = drawn && !info ? `<div class="drawn">${drawn.map(c => chipSvg(c, { cls: 'opt-chip' })).join('')}</div>` : '';
        return `<div class="fortune-card ${card.kind}">
                <span class="fc-round">${view.round}回目の占い</span>
                <span class="fc-kind">${lead}</span>
                <h2>${escapeHtml(card.name)}</h2>
                <p>${escapeHtml(card.text)}</p>
            </div>
            ${extra.map(t => `<p class="sheet-note">${escapeHtml(t)}</p>`).join('')}
            ${prev}
            <div class="options">${prompt
                ? prompt.options.map(o => this.optionButton(o)).join('')
                : `<button class="btn primary wide" data-sheet="${info ? 'close' : 'fortune-ok'}">${info ? '閉じる' : '調合を始める'}</button>`}</div>`;
    }

    promptHtml() {
        const view = this.view;
        const prompt = view.me.prompt;
        const me = view.players[view.you];
        const titles = {
            die: ['ボーナスのサイコロ', '2回振りました。どちらかを選びます'],
            explode: ['鍋が爆発しました', '点か、お金のどちらか一方をもらえます'],
            toil: ['とばっちり', '左どなりの鍋が爆発しました。値2の材料を1つもらえます']
        };
        const [title, note] = titles[prompt.kind] ?? [prompt.title, ''];
        const s = me.result ? space(me.result.space) : null;
        return `<h2>${escapeHtml(title)}</h2>
            <p class="sheet-note">${escapeHtml(note)}</p>
            ${prompt.kind === 'explode' && s ? `<p class="sheet-note">最後のマス：お金 ${s.coins}・${s.points}点</p>` : ''}
            <div class="options">${prompt.options.map(o => this.optionButton(o)).join('')}</div>`;
    }

    pickHtml() {
        const pending = this.view.me.pending;
        const title = pending.kind === 'crow' ? 'カラス' : '念のため';
        return `<h2>${title}</h2>
            <p class="sheet-note">引いた中から1つを鍋に置けます。残りは袋に戻ります</p>
            <div class="pick-row">${pending.chips.map((chip, i) =>
                `<button class="pick-chip" data-sheet="pick" data-value="${i}" aria-label="${escapeHtml(chipName(chip))}">${chipSvg(chip)}<small>${escapeHtml(INGREDIENTS[chipColor(chip)].name)}</small></button>`).join('')}</div>
            <div class="options"><button class="btn secondary wide" data-sheet="pick" data-value="-1">置かない</button></div>`;
    }

    // 回の結果（全員分）
    summaryHtml() {
        const view = this.view;
        const last = view.phase === 'end';
        const rows = [...view.players].sort((a, b) => b.score - a.score).map(p => {
            const r = p.result;
            if (!r) return '';
            const s = space(r.space);
            const got = r.choice === 'both' || r.choice === 'points' ? `${starMark()}+${s.points}` : `<span class="muted">${starMark()}なし</span>`;
            const coins = last ? '' : (r.choice === 'both' || r.choice === 'coins' ? `<span class="coin">${s.coins}</span>` : '<span class="muted">買えない</span>');
            const gains = [...r.die.map(f => `サイコロ:${DIE_LABELS[f]}`), ...r.gains.filter(g => !g.startsWith('サイコロ'))];
            return `<li class="${p.id === view.you ? 'mine' : ''} ${r.exploded ? 'exploded' : ''}">
                <span class="r-name">${escapeHtml(p.name)}${r.exploded ? '<em>爆発</em>' : ''}</span>
                <span class="r-space">マス${r.space}</span>
                <span class="r-got">${got}</span>
                <span class="r-coins">${coins}</span>
                <span class="r-total">${p.score}<small>点</small></span>
                ${gains.length ? `<span class="r-gains">${escapeHtml(dedupe(gains).join('・'))}</span>` : ''}
            </li>`;
        }).join('');
        return `<h2>${view.round}回目の結果</h2>
            <ol class="summary-list">${rows}</ol>
            <div class="options"><button class="btn primary wide" data-sheet="summary-ok">${last ? '最後の結果へ' : '買い物へ'}</button></div>`;
    }

    toggleShopChip(chip) {
        const sel = this.shopSel;
        if (sel.buy.includes(chip)) sel.buy = sel.buy.filter(c => c !== chip);
        else {
            sel.buy = sel.buy.filter(c => chipColor(c) !== chipColor(chip));
            if (sel.buy.length >= 2) sel.buy.shift();
            sel.buy.push(chip);
        }
        sel.focus = chip;
    }

    shopHtml() {
        const view = this.view;
        const me = view.players[view.you];
        const coins = view.me.coins;
        const sel = this.shopSel;
        const spent = sel.buy.reduce((s, c) => s + chipCost(c), 0);
        const left = coins - spent;
        const rubiesUsed = (sel.droplet + (sel.refill ? 1 : 0)) * RUBY_COST;
        const rubiesLeft = me.rubies - rubiesUsed;
        const over = left < 0;
        const grid = MARKET.map(chip => {
            const on = sel.buy.includes(chip);
            const open = available(chip, view.round);
            const from = INGREDIENTS[chipColor(chip)].from;
            const cost = chipCost(chip);
            const afford = on || cost <= left + sel.buy.filter(c => chipColor(c) === chipColor(chip)).reduce((s, c) => s + chipCost(c), 0);
            return `<button class="m-chip ${on ? 'on' : ''}" data-sheet="shop-chip" data-value="${chip}" ${open && afford ? '' : 'disabled'}>
                ${chipSvg(chip)}<span class="m-cost">${open ? cost : `${from}回目`}</span></button>`;
        }).join('');
        const focus = sel.focus ?? sel.buy.at(-1);
        const info = focus ? `<b>${INGREDIENTS[chipColor(focus)].name}</b>　${INGREDIENTS[chipColor(focus)].effect}` : '違う色を2つまで買えます。ルビー2つで、しずくを1マス進めるか、フラスコを満たせます';
        return `<h2>買い物</h2>
            <div class="shop-head"><span>お金 <b class="coin big">${coins}</b></span><span class="${over ? 'over' : ''}">残り <b>${left}</b></span></div>
            <div class="market">${grid}</div>
            <p class="shop-info">${info}</p>
            <div class="ruby-row">
                <span class="ruby-have">${rubyMark()}<b>${rubiesLeft}</b></span>
                <span class="ruby-act">${dropMark()}しずく
                    <button class="step-btn" data-sheet="shop-drop" data-value="-1" ${sel.droplet > 0 ? '' : 'disabled'} aria-label="減らす">−</button>
                    <b>${sel.droplet}</b>
                    <button class="step-btn" data-sheet="shop-drop" data-value="1" ${rubiesLeft >= RUBY_COST ? '' : 'disabled'} aria-label="増やす">＋</button></span>
                ${me.flask ? '' : `<button class="btn toggle ${sel.refill ? 'on' : ''}" data-sheet="shop-refill" ${sel.refill || rubiesLeft >= RUBY_COST ? '' : 'disabled'}>${flaskMark(sel.refill)}満たす</button>`}
            </div>
            <div class="options"><button class="btn primary wide" data-sheet="shop-ok" ${over || rubiesLeft < 0 ? 'disabled' : ''}>${sel.buy.length ? `${sel.buy.map(chipName).join('と')}を買う` : '買わずに次へ'}</button></div>`;
    }

    resultHtml() {
        const view = this.view;
        const ranked = [...view.players].sort((a, b) => b.score - a.score || (b.result?.space ?? 0) - (a.result?.space ?? 0));
        const youWon = view.winners.includes(view.you);
        const title = youWon ? (view.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち') : `${view.winners.map(id => view.players[id].name).join('と')}の勝ち`;
        return `<h2 tabindex="-1" autofocus>${escapeHtml(title)}</h2>
            <ol class="result-list">${ranked.map(p => `<li class="${view.winners.includes(p.id) ? 'winner' : ''} ${p.id === view.you ? 'mine' : ''}">
                <span class="r-name">${escapeHtml(p.name)}</span>
                <span class="r-calc">お金で+${p.final?.fromCoins ?? 0}・ルビーで+${p.final?.fromRubies ?? 0}</span>
                <b class="r-score">${p.score}<small>点</small></b></li>`).join('')}</ol>
            <div class="options two"><button class="btn primary" data-sheet="again">もう一度</button><button class="btn secondary" data-sheet="home">ホーム</button></div>`;
    }

    bagHtml() {
        const view = this.view;
        const me = view.players[view.you];
        const order = ['W', 'O', 'G', 'B', 'R', 'Y', 'P', 'K'];
        const list = (counts) => Object.entries(counts)
            .sort(([a], [b]) => order.indexOf(a[0]) - order.indexOf(b[0]) || a.localeCompare(b))
            .map(([chip, n]) => `<span class="bag-chip">${chipSvg(chip)}<b>×${n}</b></span>`).join('') || '<span class="muted">なし</span>';
        const inPot = me.pot.reduce((m, e) => ({ ...m, [e.chip]: (m[e.chip] ?? 0) + 1 }), {});
        return `<h2>袋の中身 <small>${me.bagCount}</small></h2>
            <div class="bag-list">${list(me.bag)}</div>
            ${me.pot.length ? `<h3>鍋の中</h3><div class="bag-list">${list(inPot)}</div>` : ''}
            <div class="options"><button class="btn secondary wide" data-sheet="close">閉じる</button></div>`;
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}

const dedupe = (list) => {
    const counts = new Map();
    list.forEach(item => counts.set(item, (counts.get(item) ?? 0) + 1));
    return [...counts].map(([item, n]) => (n > 1 ? `${item}×${n}` : item));
};
